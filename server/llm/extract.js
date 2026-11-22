// LLM evidence extraction: fills the interpretive fields of normalized
// candidates (specializations, relevant work, accomplishments …) strictly from
// their numbered evidence. Items citing unknown evidence ids are dropped.
import * as z from 'zod/v4';
import { config } from '../config.js';
import { chunk, mapLimit, phraseCoverage, uniq } from '../util.js';
import { chatJson } from './deepseek.js';

const Item = z.object({ text: z.string(), evidence: z.array(z.string()).default([]) });
const IndivSchema = z.object({
  candidates: z.array(z.object({
    candidate_id: z.string(),
    career_stage: z.string().default('Unknown'),
    orientation: z.enum(['research', 'engineering', 'both', 'unclear']).default('unclear'),
    specializations: z.array(z.string()).default([]),
    relevant_work: z.array(Item).default([]),
    accomplishments: z.array(Item).default([]),
    methods_and_skills: z.array(z.string()).default([]),
    collaboration_evidence: z.array(Item).default([]),
  })),
});
const OrgSchema = z.object({
  candidates: z.array(z.object({
    candidate_id: z.string(),
    organization_type: z.string().default(''),
    specializations: z.array(z.string()).default([]),
    products_and_projects: z.array(Item).default([]),
    research_and_engineering_work: z.array(Item).default([]),
    accomplishments: z.array(Item).default([]),
    relevant_teams: z.array(Item).default([]),
    collaboration_evidence: z.array(Item).default([]),
  })),
});

const RULES = `Rules:
- Use ONLY the evidence lines given for that candidate. Every list item must cite at least one of that candidate's evidence ids (e.g. "E3"). If nothing supports a field, return an empty list.
- Never invent work history, results, publications, products, contact details, availability, willingness to collaborate, or personal connections.
- Academic publications are evidence of research expertise; repositories, shipped systems, products, roles and technical results are evidence of engineering expertise. Treat both as equally valid.
- Social-media popularity, company size and raw citation counts are not, by themselves, technical relevance.
- Keep each item to one short sentence. Prefer work relevant to the user's project, but specializations describe the candidate overall.`;

const INDIV_SYSTEM = `You turn raw professional/academic evidence about people into structured, evidence-grounded profiles for an expert-discovery platform.
${RULES}
- career_stage: one of "Student", "PhD student", "Postdoctoral researcher", "Early-career", "Mid-career", "Senior", "Faculty", "Senior / leadership", "Unknown".
- orientation: "research", "engineering", "both" or "unclear".
- collaboration_evidence: verified signals only (co-authored papers, open-source projects with others, teaching/mentoring roles, joint industry-academic work).
Reply with JSON exactly in this shape:
{"candidates": [{"candidate_id": "p_1", "career_stage": "Mid-career", "orientation": "engineering", "specializations": ["..."], "relevant_work": [{"text": "...", "evidence": ["E2"]}], "accomplishments": [{"text": "...", "evidence": ["E5"]}], "methods_and_skills": ["..."], "collaboration_evidence": [{"text": "...", "evidence": ["E7"]}]}]}`;

const ORG_SYSTEM = `You turn raw organization evidence into structured, evidence-grounded profiles for an expert-discovery platform.
${RULES}
- organization_type: a short label such as "Startup", "Technology company", "University", "Academic research laboratory", "Corporate R&D lab", "Engineering services company", "Consultancy", "Nonprofit research organization".
- Organization size is context, never a measure of quality.
Reply with JSON exactly in this shape:
{"candidates": [{"candidate_id": "o_1", "organization_type": "Startup", "specializations": ["..."], "products_and_projects": [{"text": "...", "evidence": ["E1"]}], "research_and_engineering_work": [{"text": "...", "evidence": ["E2"]}], "accomplishments": [{"text": "...", "evidence": ["E4"]}], "relevant_teams": [], "collaboration_evidence": []}]}`;

function specBrief(spec) {
  return `User project: ${spec.problem_statement}
Core topics: ${spec.core_topics.join('; ')}
Methods: ${spec.specific_methods.join('; ') || '—'}
Required expertise: ${spec.required_expertise.join('; ')}`;
}

function candidateBlock(c) {
  const head = c.candidate_type === 'individual'
    ? `${c.name} — ${c.current_role || 'role unknown'}${c.institution_or_company ? ` at ${c.institution_or_company}` : ''}`
    : `${c.name} (${c.company_type || 'type unknown'}, ${c.employee_count ? `~${c.employee_count} people` : 'size unknown'})`;
  return `### candidate_id: ${c.candidate_id}\n${head}\n${c.evidence.slice(0, 40).map((e) => `${e.id} [${e.kind}] ${e.text}`).join('\n')}`;
}

function keepGrounded(items, ids) {
  return (items || [])
    .map((it) => ({ text: String(it.text || '').slice(0, 300), evidence: uniq((it.evidence || []).filter((id) => ids.has(id))) }))
    .filter((it) => it.text && it.evidence.length)
    .slice(0, 8);
}

function apply(c, out) {
  const ids = new Set(c.evidence.map((e) => e.id));
  if (c.candidate_type === 'individual') {
    if (out.career_stage && out.career_stage !== 'Unknown' && c.career_stage === 'Unknown') c.career_stage = out.career_stage;
    c.orientation = out.orientation;
    c.specializations = uniq(out.specializations.map(String)).slice(0, 10);
    c.relevant_work = keepGrounded(out.relevant_work, ids);
    c.accomplishments = keepGrounded(out.accomplishments, ids);
    c.methods_and_skills = uniq([...out.methods_and_skills.map(String), ...c.methods_and_skills]).slice(0, 30);
    c.collaboration_evidence = keepGrounded(out.collaboration_evidence, ids);
  } else {
    if (out.organization_type) c.organization_type_llm = out.organization_type;
    c.specializations = uniq([...out.specializations.map(String), ...c.specializations]).slice(0, 12);
    for (const k of ['products_and_projects', 'research_and_engineering_work', 'accomplishments', 'relevant_teams', 'collaboration_evidence']) c[k] = keepGrounded(out[k], ids);
  }
  c.meta.extraction = 'llm';
}

/** Keyword-based extraction used when the LLM is unavailable. */
export function heuristicExtract(c, spec) {
  const terms = [...spec.core_topics, ...spec.specific_methods, ...spec.required_expertise];
  const scored = c.evidence.map((e) => ({ e, s: phraseCoverage(terms, e.text) })).sort((a, b) => b.s - a.s);
  const relevant = scored.filter((x) => x.s > 0.08).slice(0, 5).map(({ e }) => ({ text: e.text.slice(0, 220), evidence: [e.id] }));
  const notable = c.evidence.filter((e) => (e.kind === 'repository' && /([1-9]\d{2,}|[5-9]\d) stars/.test(e.text)) || (e.kind === 'publication' && /([1-9]\d{1,}) citations/.test(e.text)) || e.kind === 'honor' || e.kind === 'funding').slice(0, 5).map((e) => ({ text: e.text.slice(0, 200), evidence: [e.id] }));
  if (c.candidate_type === 'individual') {
    c.relevant_work = relevant;
    c.accomplishments = notable;
    c.specializations = uniq([...c.methods_and_skills.filter((s) => phraseCoverage(terms, s) > 0), ...c.methods_and_skills]).slice(0, 8);
    c.orientation = c.publications.length && c.engineering_projects.length ? 'both' : c.publications.length ? 'research' : 'engineering';
  } else {
    c.research_and_engineering_work = relevant;
    c.accomplishments = notable;
  }
  c.meta.extraction = 'heuristic';
  return c;
}

export async function extractEvidence(candidates, spec, { usage, onProgress } = {}) {
  if (!config.llm.enabled) { candidates.forEach((c) => heuristicExtract(c, spec)); return { engine: 'heuristic' }; }
  const groups = chunk(candidates, 4);
  let done = 0; let failures = 0;
  await mapLimit(groups, config.llm.concurrency, async (group) => {
    const isOrg = group[0].candidate_type === 'organization';
    try {
      const out = await chatJson({
        system: isOrg ? ORG_SYSTEM : INDIV_SYSTEM,
        user: `${specBrief(spec)}\n\nCandidates:\n\n${group.map(candidateBlock).join('\n\n')}`,
        schema: isOrg ? OrgSchema : IndivSchema,
        model: config.llm.fastModel,
        reasoning: 'none',
        maxTokens: 6000,
        usage,
      });
      for (const c of group) {
        const o = out.candidates.find((x) => x.candidate_id === c.candidate_id);
        if (o) apply(c, o); else heuristicExtract(c, spec);
      }
    } catch {
      failures += 1;
      group.forEach((c) => heuristicExtract(c, spec));
    }
    done += group.length;
    onProgress?.(done, candidates.length);
  });
  return { engine: 'llm', failures };
}

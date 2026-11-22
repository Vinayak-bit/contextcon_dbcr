// LLM-as-judge: scores one normalized candidate on each rubric criterion (0–5).
// Geographic proximity is computed deterministically elsewhere, not here.
import * as z from 'zod/v4';
import { config } from '../config.js';
import { chatJson } from './deepseek.js';

const RUBRIC_TEXT = {
  individual: `Criteria (score each 0–5, one decimal allowed):
- topic_similarity: does the person's actual work (projects, publications, experiments, implemented systems, documented contributions) directly relate to the user's niche problem? 5 = has demonstrably worked on this exact problem; 3 = related problem with overlapping methods; 1 = same broad field only; 0 = nothing related.
- accomplishments: evidence of technical competence and impact appropriate to the field and career stage. Research: relevant publications, contribution quality, citations, results, patents. Engineering: systems designed or implemented, shipped products, open-source contributions, performance improvements, patents, documented results. Do not penalize engineers for lacking publications when publications are not central to their specialization. Normalize for career stage (a strong PhD student can score 4).
- skills_overlap: demonstrated experience with the relevant algorithms, tools, systems, methodologies or practices the project needs.
- role_suitability: fit for the requested relationship and selected candidate types — career stage, complementary expertise, mentoring/teaching experience, prior collaborations, other verified signals. Never infer willingness or availability; absence of evidence means a moderate score, not a low one.`,
  organization: `Criteria (score each 0–5, one decimal allowed):
- topic_relevance: how closely the organization's products, research, engineering projects, technologies and teams align with the user's specific problem.
- accomplishments: meaningful evidence of capability — products built and deployed, technical innovations, engineering achievements, publications, patents, open-source, specialized systems or services.
- capacity_fit: is the organization appropriately sized/resourced for the user's intended engagement? A small specialized startup may suit an independent developer better than a large corporation. Size is never a measure of quality.
- partnership_suitability: relevant capabilities, previous partnerships, research programs, collaboration history, verified engagement opportunities. Never assume willingness to collaborate.`,
};

const KEYS = { individual: ['topic_similarity', 'accomplishments', 'skills_overlap', 'role_suitability'], organization: ['topic_relevance', 'accomplishments', 'capacity_fit', 'partnership_suitability'] };

function schemaFor(kind) {
  const score = z.number().min(0).max(5);
  return z.object({
    criterion_scores: z.object(Object.fromEntries(KEYS[kind].map((k) => [k, score]))),
    criterion_notes: z.record(z.string(), z.string()).default({}),
    evidence_references: z.array(z.object({ criterion: z.string(), evidence: z.array(z.string()) })).default([]),
    strengths: z.array(z.string()).default([]),
    limitations: z.array(z.string()).default([]),
    why_relevant: z.string().default(''),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  });
}

function system(kind) {
  const keys = KEYS[kind];
  const example = {
    criterion_scores: Object.fromEntries(keys.map((k) => [k, 3.5])),
    criterion_notes: Object.fromEntries(keys.map((k) => [k, 'one short sentence'])),
    evidence_references: [{ criterion: keys[0], evidence: ['E2', 'E5'] }],
    strengths: ['...'], limitations: ['...'],
    why_relevant: 'One or two sentences on why this candidate is relevant to the user\'s exact problem.',
    confidence: 'medium',
  };
  return `You are a careful evaluator for an expert-discovery platform covering research and engineering. You judge how well ONE ${kind === 'individual' ? 'person' : 'organization'} matches a user's exact technical problem, using only the evidence provided.
${RUBRIC_TEXT[kind]}

Rules:
- Evaluate each criterion independently. Base every score on cited evidence ids; with no supporting evidence, a criterion should score low (topic/accomplishments/skills) or moderate (role/partnership suitability, where absence is not negative).
- The user's submitted project is the primary relevance signal. Their own profile (if given) is secondary context for complementarity and career stage only.
- Never infer personal familiarity, social connections, availability or willingness to collaborate.
- Do not mistake popularity, company size or total citations for direct technical relevance.
- confidence reflects how complete the evidence is ("low" when evidence is thin).
- limitations must mention missing or unverified information that matters.

Reply with a single JSON object in exactly this shape:
${JSON.stringify(example)}`;
}

function candidateView(c) {
  const base = c.candidate_type === 'individual'
    ? { name: c.name, current_role: c.current_role, organization: c.institution_or_company, career_stage: c.career_stage, orientation: c.orientation, location: c.location, specializations: c.specializations, relevant_work: c.relevant_work, accomplishments: c.accomplishments, methods_and_skills: c.methods_and_skills.slice(0, 20), collaboration_evidence: c.collaboration_evidence, academic_only_identity: Boolean(c.meta.academicOnly) }
    : { name: c.name, organization_type: c.organization_type, headquarters: c.headquarters, employee_count: c.employee_count, specializations: c.specializations, products_and_projects: c.products_and_projects, research_and_engineering_work: c.research_and_engineering_work, accomplishments: c.accomplishments, collaboration_evidence: c.collaboration_evidence, parent_institution: c.parent_institution };
  return `${JSON.stringify(base)}\n\nEvidence:\n${c.evidence.slice(0, 45).map((e) => `${e.id} [${e.kind}] ${e.text}`).join('\n')}`;
}

export function projectView(spec, prefs, userProfile) {
  return {
    problem_statement: spec.problem_statement,
    domain: spec.domain,
    core_topics: spec.core_topics,
    methods: spec.specific_methods,
    required_expertise: spec.required_expertise,
    objective: (prefs.objectives || []).join('; ') || 'not specified',
    requested_people: prefs.individualTypeLabels || [],
    requested_organizations: prefs.orgTypeLabels || [],
    preferences: prefs.preferences || {},
    organization_size_preference: prefs.sizes?.length ? prefs.sizes : ['any'],
    user_profile: userProfile ? { role: userProfile.current_role, organization: userProfile.institution, career_stage: userProfile.career_stage, skills: (userProfile.skills || []).slice(0, 15) } : null,
  };
}

export async function llmJudge({ candidate, spec, prefs, userProfile, usage }) {
  const kind = candidate.candidate_type === 'individual' ? 'individual' : 'organization';
  const out = await chatJson({
    system: system(kind),
    user: `User project and request:\n${JSON.stringify(projectView(spec, prefs, userProfile))}\n\nCandidate:\n${candidateView(candidate)}`,
    schema: schemaFor(kind),
    model: config.llm.fastModel,
    reasoning: config.llm.judgeReasoning,
    maxTokens: 2500,
    usage,
  });
  const ids = new Set(candidate.evidence.map((e) => e.id));
  out.evidence_references = out.evidence_references
    .map((r) => ({ criterion: r.criterion, evidence: r.evidence.filter((id) => ids.has(id)) }))
    .filter((r) => r.evidence.length);
  return out;
}

export const JUDGE_KEYS = KEYS;

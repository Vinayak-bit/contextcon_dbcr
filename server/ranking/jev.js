// TypeSafe Jev reranker (POST https://api.typesafe.ai/v1/systemone).
// One request per candidate carries every criterion as a `score` question with
// six anchored levels (0–5), plus a yes/no (`noul`) decision question. Jev's
// outputs are ranking signals — not calibrated probabilities of collaboration success.
import { config } from '../config.js';
import { sleep } from '../util.js';
import { projectView } from '../llm/judge.js';

// Jev has its own concurrency cap so it never throttles the LLM side.
let inFlight = 0;
const waiters = [];
async function acquire() {
  if (inFlight < config.jev.concurrency) { inFlight += 1; return; }
  await new Promise((r) => waiters.push(r));
  inFlight += 1;
}
function release() { inFlight -= 1; waiters.shift()?.(); }

const Q = {
  individual: {
    topic_similarity: {
      instructions: "How directly does the candidate's demonstrated work (projects, publications, implemented systems, roles) relate to the user's specific research or engineering problem?",
      levels: ['No related work in the evidence', 'Same broad field only', 'Adjacent topic or related application', 'Related problem with some overlapping methods', 'Closely matching work on the same kind of problem', 'Has demonstrably worked on this exact problem'],
    },
    accomplishments: {
      instructions: "How strong is the evidence of the candidate's technical competence and impact, judged for their career stage and kind of work (publications and research results for researchers; shipped systems, open-source work, products and measured improvements for engineers)?",
      levels: ['No evidence of accomplishments', 'Minimal evidence', 'Some solid work', 'Clear, substantial accomplishments', 'Strong, notable accomplishments', 'Exceptional, widely recognized accomplishments'],
    },
    skills_overlap: {
      instructions: 'How much demonstrated experience does the candidate have with the specific methods, tools and techniques this project needs?',
      levels: ['None of the needed methods', 'Generic related skills only', 'A few of the needed methods', 'Several needed methods, demonstrated', 'Most needed methods, demonstrated in practice', 'Deep, demonstrated mastery of the needed methods'],
    },
    role_suitability: {
      instructions: "How suitable is the candidate for the relationship the user requested (their objective and selected candidate types), considering career stage and complementary expertise? Do not assume willingness or availability.",
      levels: ['Clearly unsuitable for the requested relationship', 'Poor fit', 'Uncertain fit, little evidence', 'Reasonable fit', 'Good fit with supporting evidence', 'Excellent fit with strong supporting evidence'],
    },
  },
  organization: {
    topic_relevance: {
      instructions: "How closely do the organization's products, research, engineering projects, technologies and teams align with the user's specific problem?",
      levels: ['No related work', 'Same broad industry only', 'Adjacent technology', 'Related technology with some overlap', 'Closely aligned work', 'Works directly on this exact problem'],
    },
    accomplishments: {
      instructions: 'How strong is the evidence of real technical capability (products deployed, innovations, engineering achievements, publications, patents, open-source, specialized services)?',
      levels: ['No evidence', 'Minimal evidence', 'Some solid work', 'Clear, substantial capability', 'Strong, notable capability', 'Exceptional, widely recognized capability'],
    },
    capacity_fit: {
      instructions: "Is the organization appropriately sized and resourced for the user's intended engagement? Size is context, not quality.",
      levels: ['Clearly mismatched scale', 'Poor fit in scale', 'Uncertain', 'Reasonable fit', 'Good fit', 'Ideal scale for this engagement'],
    },
    partnership_suitability: {
      instructions: 'How much verified evidence is there of relevant partnerships, research programs, collaboration history or engagement opportunities? Do not assume willingness to collaborate.',
      levels: ['Evidence against suitability', 'Poor fit', 'No evidence either way', 'Some relevant signals', 'Good signals', 'Strong, verified collaboration track record'],
    },
  },
};

const DECISION = {
  individual: "Does the candidate's demonstrated technical work directly address the user's engineering or research problem?",
  organization: 'Does this organization have demonstrated capability in the requested technical specialization?',
};

function candidateState(c) {
  const fields = c.candidate_type === 'individual'
    ? { name: c.name, current_role: c.current_role, organization: c.institution_or_company, career_stage: c.career_stage, location: c.location, specializations: c.specializations, relevant_work: c.relevant_work.map((x) => x.text), accomplishments: c.accomplishments.map((x) => x.text), skills: c.methods_and_skills.slice(0, 20) }
    : { name: c.name, organization_type: c.organization_type, headquarters: c.headquarters, employee_count: c.employee_count, specializations: c.specializations, work: [...c.products_and_projects, ...c.research_and_engineering_work].map((x) => x.text), accomplishments: c.accomplishments.map((x) => x.text) };
  return { ...fields, evidence: c.evidence.slice(0, 40).map((e) => `${e.id}: ${e.text}`) };
}

export async function jevScore({ candidate, spec, prefs, userProfile, usage }) {
  const kind = candidate.candidate_type === 'individual' ? 'individual' : 'organization';
  const questions = Object.fromEntries(Object.entries(Q[kind]).map(([k, q]) => [k, { type: 'score', instructions: q.instructions, criteria: q.levels }]));
  questions.decision = { type: 'noul', instructions: DECISION[kind] };
  const body = { model: config.jev.model, state: { user_project: projectView(spec, prefs, userProfile), candidate: candidateState(candidate) }, questions };

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let res;
    await acquire();
    try {
      res = await fetch(config.jev.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.jev.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) { release(); lastErr = err; await sleep(800 * 2 ** attempt); continue; }
    const json = await res.json().catch(() => null);
    release();
    if (!res.ok) {
      lastErr = new Error(`Jev ${res.status}: ${json?.error?.message || json?.detail || json?.message || 'request failed'}`);
      if ([429, 500, 502, 503, 529].includes(res.status)) { await sleep((Number(res.headers.get('retry-after')) * 1000) || 1200 * 2 ** attempt); continue; }
      throw lastErr;
    }
    if (usage) { usage.calls = (usage.calls || 0) + 1; usage.inputTokens = (usage.inputTokens || 0) + (json.usage?.input_tokens || 0); }
    const answers = json.answers || {};
    const criterion_scores = {}; const confidences = {}; const levels = {};
    for (const k of Object.keys(Q[kind])) {
      const a = answers[k];
      if (a && Number.isFinite(a.score)) {
        criterion_scores[k] = Math.max(0, Math.min(5, a.score));
        confidences[k] = a.confidence;
        // The anchored level Jev's score lands on, e.g. "Closely matching work" — used to explain the score.
        levels[k] = Q[kind][k].levels[Math.round(criterion_scores[k])];
      }
    }
    return { criterion_scores, confidences, levels, decision: { question: DECISION[kind], probability: answers.decision?.noul ?? null }, model: json.model };
  }
  throw lastErr || new Error('Jev request failed');
}

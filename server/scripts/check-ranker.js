#!/usr/bin/env node
// Live ranker check (npm run check:ranker). Uses the real Jev (and DeepSeek, if configured) keys from .env.
//   1. Jev success: a valid Jev response, and a candidate whose criterion scores are sourced from Jev.
//   2. Fallback: with Jev deliberately pointed at a bad endpoint, the candidate is scored by the fallback
//      engine and the result says so (configured vs. actual engine, plus the reason).
// Costs a few Jev calls and, when DeepSeek is configured, one judge call. Exits 1 on any failure.
import { config } from '../config.js';
import { jevScore } from '../ranking/jev.js';
import { activeRanker, rankCandidates } from '../ranking/index.js';

const spec = {
  domain: 'Engineering', problem_statement: 'Reduce KV-cache memory overhead in long-context LLM inference on GPUs.',
  core_topics: ['KV-cache optimization', 'long-context inference'], specific_methods: ['paged attention', 'KV-cache quantization'],
  related_topics: [], required_expertise: ['CUDA', 'LLM serving'], search_queries: [], academic_queries: [], org_queries: [],
};
const prefs = {
  target: 'individuals', individualTypes: [{ id: 'software_engineers', label: 'Software Engineers' }], orgTypes: [], customDiscipline: '',
  sizes: [], geography: { scope: 'worldwide', preferProximity: false }, preferences: {},
  description: 'We need engineers who have built paged KV caches or KV-cache quantization for LLM serving.',
  individualTypeLabels: ['Software Engineers'], orgTypeLabels: [],
};
const fixture = () => ({
  candidate_id: 'check_1', candidate_type: 'individual', name: 'Fixture Engineer', current_role: 'Senior Software Engineer',
  institution_or_company: 'Example Inference Co', career_stage: 'Senior', location: 'Remote', location_detail: { city: '', country: '' },
  headline: 'LLM inference engineer', specializations: ['LLM inference', 'CUDA'],
  relevant_work: [{ text: 'Implemented a paged KV cache with 4-bit KV quantization in an LLM serving engine.', evidence: ['E1'] }],
  publications: [], engineering_projects: [], accomplishments: [{ text: 'Cut KV-cache memory by 60% at 128k context.', evidence: ['E2'] }],
  methods_and_skills: ['CUDA', 'Triton', 'PyTorch'], collaboration_evidence: [], source_urls: [],
  evidence: [
    { id: 'E1', kind: 'role', text: 'Current role: Senior Software Engineer at Example Inference Co — built a paged KV cache with 4-bit quantization for LLM serving.' },
    { id: 'E2', kind: 'repository', text: 'Repository example/kv-cache-quant (CUDA), 900 stars: KV-cache quantization kernels for long-context inference.' },
  ],
  meta: { enriched: true },
});

let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failed += 1; };

console.log(`Configured ranker: ${activeRanker()} · Jev ${config.jev.enabled ? config.jev.model : 'NOT configured'} · DeepSeek ${config.llm.enabled ? 'configured' : 'not configured'}\n`);
if (!config.jev.enabled) { console.log('FAIL  JEV_API_KEY is not set; nothing to check.'); process.exit(1); }

// 1a. Raw Jev response
try {
  const r = await jevScore({ candidate: fixture(), spec, prefs, userProfile: null, usage: {} });
  const keys = Object.keys(r.criterion_scores);
  check(keys.length === 4 && keys.every((k) => Number.isFinite(r.criterion_scores[k])), 'Jev returned four 0–5 criterion scores', JSON.stringify(r.criterion_scores));
  check(typeof r.decision.probability === 'number', 'Jev returned a decision value', String(r.decision.probability));
  check(Boolean(r.model), 'Jev reported its model', r.model);
} catch (err) {
  check(false, 'Jev request', err.message);
}

// 1b. End-to-end ranking sourced from Jev
{
  const c = fixture();
  await rankCandidates([c], { spec, prefs, userProfile: null, usage: {}, jevUsage: {}, warnings: [] });
  const r = c.ranking;
  check(r.engine === 'jev', 'Candidate was scored by Jev', `engine=${r.engine}, configured=${r.configured_engine}`);
  check(r.breakdown.filter((b) => b.key !== 'proximity').every((b) => b.source === 'jev'), 'Every criterion score is sourced from Jev', r.breakdown.map((b) => `${b.key}:${b.source}`).join(', '));
  check(r.fallback === null, 'No fallback recorded');
  console.log(`      final score ${r.final_score}/100`);
}

// 2. Fallback with Jev unreachable
{
  const realUrl = config.jev.url;
  config.jev.url = `${realUrl.replace(/\/v1\/.*$/, '')}/v1/this-endpoint-does-not-exist`;
  const c = fixture();
  const warnings = [];
  await rankCandidates([c], { spec, prefs, userProfile: null, usage: {}, jevUsage: {}, warnings });
  config.jev.url = realUrl;
  const r = c.ranking;
  const expected = config.llm.enabled ? 'llm' : 'heuristic';
  check(r.engine === expected, `Jev failure falls back to ${expected === 'llm' ? 'the DeepSeek judge' : 'the heuristic'}`, `engine=${r.engine}`);
  check(r.configured_engine === 'jev' && r.fallback?.from === 'jev' && r.fallback?.to === expected, 'Result records configured vs. actual engine', JSON.stringify(r.fallback));
  check(Boolean(r.fallback?.reason), 'Fallback reason is shown', r.fallback?.reason);
  check(warnings.some((w) => /Jev failed/.test(w)), 'The search gets a user-visible warning', warnings.join(' | '));
}

console.log(`\n${failed ? `${failed} check(s) FAILED` : 'All ranker checks passed'}`);
process.exit(failed ? 1 : 0);

// Ranking engine. Rerankers (LLM judge, Jev, heuristic) are interchangeable and
// only produce 0–5 criterion scores; the final 0–100 score is computed
// deterministically from the rubric weights here.
import { RUBRICS } from '../../shared/catalog.js';
import { config } from '../config.js';
import { clamp, mapLimit, phraseCoverage, round } from '../util.js';
import { llmJudge } from '../llm/judge.js';
import { jevScore } from './jev.js';
import { proximityScore } from '../pipeline/geography.js';

export function activeRanker() {
  const want = config.ranker;
  const llm = config.llm.enabled; const jev = config.jev.enabled;
  if (want === 'heuristic') return 'heuristic';
  if (want === 'llm') return llm ? 'llm' : 'heuristic';
  if (want === 'hybrid') return llm && jev ? 'hybrid' : jev ? 'jev' : llm ? 'llm' : 'heuristic';
  // Default (auto / jev): Jev is the production ranker; the LLM judge is the fallback.
  return jev ? 'jev' : llm ? 'llm' : 'heuristic';
}

const TOPIC_KEY = { individual: 'topic_similarity', organization: 'topic_relevance' };

/**
 * Jev returns scores only. Explain them with Jev's own anchored levels plus the
 * evidence-grounded items from extraction — nothing is generated or inferred here.
 */
function jevExplanation(c, jev, criteria, rk) {
  const rows = criteria.filter((x) => Number.isFinite(jev.criterion_scores[x.key])).map((x) => ({ key: x.key, label: x.label, score: jev.criterion_scores[x.key], level: jev.levels?.[x.key] }));
  const strengths = rows.filter((r) => r.score >= 3.5).map((r) => `${r.label}: ${r.level} (${r.score.toFixed(1)}/5)`);
  const limitations = rows.filter((r) => r.score < 2.5).map((r) => `${r.label}: ${r.level} (${r.score.toFixed(1)}/5)`);
  if (rk === 'individual') {
    if (!c.publications?.length && !c.engineering_projects?.length) limitations.push('No publications or code projects were found in the available data.');
    if (c.meta.academicOnly) limitations.push('Academic-only identity: no verified professional profile.');
  } else if (c.employee_count == null) limitations.push('Organization size is not available.');
  if (!c.meta.enriched) limitations.push('Only summary profile data was available.');

  const work = (rk === 'individual' ? c.relevant_work : [...(c.research_and_engineering_work || []), ...(c.products_and_projects || [])]) || [];
  const topic = rows.find((r) => r.key === TOPIC_KEY[rk]);
  const why = [topic ? `${topic.level} (topic ${topic.score.toFixed(1)}/5).` : '', work.length ? `Evidence: ${work.slice(0, 2).map((w) => w.text).join(' ')}` : 'No directly related work was found in the evidence.'].filter(Boolean).join(' ');

  const confs = Object.values(jev.confidences || {}).filter(Number.isFinite);
  const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  let confidence = avg >= 0.8 ? 'high' : avg >= 0.6 ? 'medium' : 'low';
  if (c.evidence.length < 5 && confidence === 'high') confidence = 'medium';

  const refs = [
    { criterion: TOPIC_KEY[rk], evidence: [...new Set(work.flatMap((w) => w.evidence))] },
    { criterion: 'accomplishments', evidence: [...new Set((c.accomplishments || []).flatMap((w) => w.evidence))] },
  ].filter((r) => r.evidence.length);
  return { strengths, limitations, why_relevant: why, confidence, evidence_references: refs };
}

/** Final Score = Σ (weight × criterion_score / 5), weights renormalised over active criteria to sum to 100. */
export function finalScore(rubricKey, scores, activeKeys) {
  const crit = RUBRICS[rubricKey].filter((c) => activeKeys.includes(c.key));
  const total = crit.reduce((s, c) => s + c.weight, 0) || 1;
  const value = crit.reduce((s, c) => s + ((c.weight / total) * 100 * clamp(scores[c.key] ?? 0, 0, 5)) / 5, 0);
  return { score: round(value, 1), weights: Object.fromEntries(crit.map((c) => [c.key, round((c.weight / total) * 100, 1)])) };
}

/** Transparent keyword-overlap scorer; used as a fallback and as a sanity signal. */
export function heuristicScores(c, spec, prefs) {
  const text = c.evidence.map((e) => e.text).join(' \n ');
  const topic = phraseCoverage([...spec.core_topics, ...spec.specific_methods], text);
  const skills = phraseCoverage([...spec.required_expertise, ...spec.specific_methods], `${text} ${c.methods_and_skills?.join(' ') || ''}`);
  const relWork = (c.relevant_work?.length || c.research_and_engineering_work?.length || 0);
  const accEvidence = c.evidence.filter((e) => ['repository', 'publication', 'honor', 'funding', 'description'].includes(e.kind)).length;
  if (c.candidate_type === 'individual') {
    return {
      topic_similarity: round(clamp(topic * 6 + relWork * 0.3, 0, 5), 1),
      accomplishments: round(clamp(1 + (c.accomplishments?.length || 0) * 0.8 + Math.min(accEvidence, 6) * 0.25, 0, 5), 1),
      skills_overlap: round(clamp(skills * 6, 0, 5), 1),
      role_suitability: round(c.meta.roleMatch?.length ? 3 : 2.5, 1),
    };
  }
  const sizeOk = !prefs.sizes?.length || c.employee_count == null ? 3 : 3.5;
  return {
    topic_relevance: round(clamp(topic * 6 + relWork * 0.3, 0, 5), 1),
    accomplishments: round(clamp(1 + (c.accomplishments?.length || 0) * 0.8 + Math.min(accEvidence, 6) * 0.2, 0, 5), 1),
    capacity_fit: sizeOk,
    partnership_suitability: round(clamp(2.5 + (c.collaboration_evidence?.length || 0) * 0.5, 0, 5), 1),
  };
}

function rubricKeyFor(c) { return c.candidate_type === 'individual' ? 'individual' : 'organization'; }

/**
 * Score candidates in place (adds `c.ranking`). Returns engine stats.
 */
export async function rankCandidates(candidates, { spec, prefs, userProfile, usage, jevUsage, onProgress, warnings }) {
  const engine = activeRanker();
  const w = clamp(config.hybridJevWeight, 0, 1);
  let done = 0; let llmFail = 0; let jevFail = 0;
  // Candidate-level parallelism; DeepSeek and Jev each enforce their own in-flight caps.
  const conc = Math.max(1, config.llm.concurrency);
  await mapLimit(candidates, conc, async (c) => {
    const rk = rubricKeyFor(c);
    const heur = heuristicScores(c, spec, prefs);
    const judge = () => llmJudge({ candidate: c, spec, prefs, userProfile, usage }).catch((e) => { llmFail += 1; c.meta.llmError = e.message; return null; });
    let [llm, jev] = await Promise.all([
      engine === 'llm' || engine === 'hybrid' ? judge() : null,
      engine === 'jev' || engine === 'hybrid' ? jevScore({ candidate: c, spec, prefs, userProfile, usage: jevUsage }).catch((e) => { jevFail += 1; c.meta.jevError = e.message; return null; }) : null,
    ]);
    // Jev is the production ranker; if it fails for this candidate, fall back to the LLM judge.
    if (engine === 'jev' && !jev && config.llm.enabled) llm = await judge();
    const criteria = RUBRICS[rk];
    const scores = {}; const breakdown = [];
    for (const crit of criteria) {
      if (crit.key === 'proximity') continue;
      const l = llm?.criterion_scores?.[crit.key];
      const j = jev?.criterion_scores?.[crit.key];
      const h = heur[crit.key];
      let v; let source;
      if (Number.isFinite(l) && Number.isFinite(j)) { v = w * j + (1 - w) * l; source = 'hybrid'; }
      else if (Number.isFinite(l)) { v = l; source = 'llm'; }
      else if (Number.isFinite(j)) { v = j; source = 'jev'; }
      else { v = h; source = 'heuristic'; }
      scores[crit.key] = round(v, 2);
      breakdown.push({ key: crit.key, label: crit.label, score: round(v, 1), source, llm: Number.isFinite(l) ? round(l, 1) : null, jev: Number.isFinite(j) ? round(j, 1) : null, heuristic: h, note: llm?.criterion_notes?.[crit.key] || (jev?.levels?.[crit.key] ? `Jev: ${jev.levels[crit.key]}` : '') });
    }
    // Proximity: deterministic, and only when the user wants it and it can be computed.
    const prox = prefs.geography?.preferProximity ? proximityScore(c, userProfile, prefs.geography) : null;
    const active = criteria.map((x) => x.key).filter((k) => k !== 'proximity' || prox);
    if (prox) {
      scores.proximity = prox.score;
      breakdown.push({ key: 'proximity', label: criteria.find((x) => x.key === 'proximity').label, score: prox.score, source: 'rule', note: prox.reason });
    }
    const actual = llm && jev ? 'hybrid' : llm ? 'llm' : jev ? 'jev' : 'heuristic';
    const fs = finalScore(rk, scores, active);
    breakdown.forEach((b) => { b.weight = fs.weights[b.key] ?? 0; });
    // Narrative: the LLM judge's own text when it ran, otherwise Jev levels + extracted evidence.
    const story = llm
      ? { strengths: llm.strengths, limitations: llm.limitations, why_relevant: llm.why_relevant, confidence: llm.confidence, evidence_references: llm.evidence_references }
      : jev ? jevExplanation(c, jev, criteria, rk)
        : { strengths: [], limitations: [], why_relevant: autoWhy(c), confidence: c.evidence.length > 6 ? 'medium' : 'low', evidence_references: [] };
    c.ranking = {
      final_score: fs.score,
      criterion_scores: scores,
      breakdown,
      proximity_included: Boolean(prox),
      strengths: (story.strengths || []).slice(0, 5),
      limitations: (story.limitations || []).slice(0, 5),
      why_relevant: story.why_relevant || autoWhy(c),
      confidence: story.confidence || 'low',
      evidence_references: story.evidence_references || [],
      jev_decision: jev?.decision || null,
      // Provenance: what actually scored this candidate vs. what the server is configured to use.
      engine: actual,
      configured_engine: engine,
      fallback: actual !== engine ? { from: engine, to: actual, reason: fallbackReason(c, engine) } : null,
    };
    done += 1;
    onProgress?.(done, candidates.length);
  });
  if (llmFail) warnings?.push(`LLM judge failed for ${llmFail} candidate(s); their scores use the remaining signals.`);
  if (jevFail) warnings?.push(`Jev failed for ${jevFail} candidate(s); their scores use the remaining signals.`);
  return { engine, llmFail, jevFail };
}

/** Short, user-facing reason a candidate wasn't scored by the configured engine. */
function fallbackReason(c, configured) {
  const err = (configured === 'jev' || configured === 'hybrid') && c.meta.jevError ? c.meta.jevError : c.meta.llmError || c.meta.jevError;
  return err ? String(err).slice(0, 200) : 'The configured engine returned no scores.';
}

function autoWhy(c) {
  const items = c.relevant_work?.length ? c.relevant_work : c.research_and_engineering_work || [];
  return items.length ? `Evidence of related work: ${items.slice(0, 2).map((x) => x.text).join(' ')}` : 'Limited direct evidence of related work was found.';
}

/** Stable ordering: score, then Jev decision, then evidence volume, then id. */
export function sortRanked(list) {
  return list.sort((a, b) => (b.ranking.final_score - a.ranking.final_score)
    || ((b.ranking.jev_decision?.probability ?? 0) - (a.ranking.jev_decision?.probability ?? 0))
    || (b.evidence.length - a.evidence.length)
    || a.candidate_id.localeCompare(b.candidate_id));
}

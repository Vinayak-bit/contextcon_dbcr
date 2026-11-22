#!/usr/bin/env node
// Benchmark Jev against LLM-based scoring (spec §10) on saved searches.
//
//   npm run benchmark:rankers                  # compare stored LLM vs Jev criterion scores (no API calls)
//   npm run benchmark:rankers -- --jobs 5      # only the 5 most recent searches
//   npm run benchmark:rankers -- --reasoning low --limit 20
//                                              # also re-judge up to 20 candidates with the LLM at
//                                              # reasoning=low and compare with the stored judge (costs API calls)
//
// Hybrid searches store, per candidate and criterion, the LLM score and the Jev score
// (ranking.breakdown[].llm / .jev). From those we rebuild what each engine alone would
// have produced and compare the rankings. Output: console + .data/benchmarks/<timestamp>.md
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { finalScore } from '../ranking/index.js';
import { llmJudge } from '../llm/judge.js';
import { mapLimit, round } from '../util.js';

const args = process.argv.slice(2);
const arg = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const maxJobs = Number(arg('jobs', 20));
const reasoning = arg('reasoning', null);
const limit = Number(arg('limit', 20));

/* ---------------------------------------------------------- statistics --- */
function ranks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const r = new Array(values.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(a, b) {
  const n = a.length; if (n < 2) return NaN;
  const ma = a.reduce((s, x) => s + x, 0) / n; const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}
const spearman = (a, b) => pearson(ranks(a), ranks(b));
function kendall(a, b) {
  let c = 0; let d = 0; let ta = 0; let tb = 0;
  for (let i = 0; i < a.length; i += 1) for (let j = i + 1; j < a.length; j += 1) {
    const x = Math.sign(a[i] - a[j]); const y = Math.sign(b[i] - b[j]);
    if (x === 0 && y === 0) continue;
    if (x === 0) ta += 1; else if (y === 0) tb += 1; else if (x === y) c += 1; else d += 1;
  }
  const denom = Math.sqrt((c + d + ta) * (c + d + tb));
  return denom ? (c - d) / denom : NaN;
}
function topKOverlap(a, b, k) {
  const top = (v) => new Set(v.map((x, i) => [x, i]).sort((p, q) => q[0] - p[0]).slice(0, k).map(([, i]) => i));
  const A = top(a); const B = top(b);
  return [...A].filter((i) => B.has(i)).length / Math.min(k, a.length);
}
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

/* ------------------------------------------------------------ load data --- */
const dir = path.join(config.dataDir, 'jobs');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f)) : [];
files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
const jobs = files.slice(0, maxJobs).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));

const groups = []; // one per (job, tab, page)
for (const job of jobs) {
  for (const [tab, t] of Object.entries(job.tabs || {})) {
    for (const p of t.pages || []) {
      const rk = tab === 'individuals' ? 'individual' : 'organization';
      const rows = p.candidates.map((c) => {
        const llm = {}; const jev = {};
        for (const b of c.ranking?.breakdown || []) {
          if (Number.isFinite(b.llm)) llm[b.key] = b.llm;
          if (Number.isFinite(b.jev)) jev[b.key] = b.jev;
        }
        return { c, llm, jev, hybrid: c.ranking?.final_score };
      }).filter((r) => Object.keys(r.llm).length && Object.keys(r.jev).length);
      if (rows.length >= 3) groups.push({ job, tab, page: p.page, rk, rows });
    }
  }
}

const out = [];
const log = (s = '') => { out.push(s); console.log(s); };
log(`# Ranker benchmark — ${new Date().toISOString()}`);
log('');
log(`Searches scanned: ${jobs.length} · comparable pages (hybrid, ≥3 candidates): ${groups.length}`);
if (!groups.length) {
  log('');
  log('No comparable data. Run some searches with both DEEPSEEK_API_KEY and JEV_API_KEY set (ranker = hybrid), then re-run.');
}

const criterionDiffs = {};
const all = { s: [], k: [], t10: [] };
for (const g of groups) {
  const keys = (row, side) => Object.keys(row[side]);
  const llmScores = g.rows.map((r) => finalScore(g.rk, r.llm, keys(r, 'llm')).score);
  const jevScores = g.rows.map((r) => finalScore(g.rk, r.jev, keys(r, 'jev')).score);
  const hyb = g.rows.map((r) => r.hybrid);
  const s = spearman(llmScores, jevScores); const k = kendall(llmScores, jevScores); const t10 = topKOverlap(llmScores, jevScores, 10);
  all.s.push(s); all.k.push(k); all.t10.push(t10);
  for (const r of g.rows) for (const key of Object.keys(r.llm)) if (Number.isFinite(r.jev[key])) (criterionDiffs[key] ||= []).push(Math.abs(r.llm[key] - r.jev[key]));
  log('');
  log(`## ${g.job.id} · ${g.tab} · page ${g.page}${g.job.sample ? ' (sample data)' : ''} — n=${g.rows.length}`);
  log(`Topic: ${g.job.summary?.topic || ''}`);
  log(`- LLM-only vs Jev-only: Spearman ${fmt(s)} · Kendall ${fmt(k)} · top-10 overlap ${fmt(t10 * 100, 0)}%`);
  log(`- Hybrid vs LLM-only: Spearman ${fmt(spearman(hyb, llmScores))} · Hybrid vs Jev-only: Spearman ${fmt(spearman(hyb, jevScores))}`);
  log(`- Mean final score: LLM ${fmt(llmScores.reduce((a, b) => a + b, 0) / llmScores.length, 1)} · Jev ${fmt(jevScores.reduce((a, b) => a + b, 0) / jevScores.length, 1)}`);
}

if (groups.length) {
  const mean = (v) => v.filter(Number.isFinite).reduce((a, b) => a + b, 0) / Math.max(1, v.filter(Number.isFinite).length);
  log('');
  log('## Overall');
  log(`- Mean Spearman (LLM vs Jev): ${fmt(mean(all.s))} · mean Kendall: ${fmt(mean(all.k))} · mean top-10 overlap: ${fmt(mean(all.t10) * 100, 0)}%`);
  log('- Mean absolute criterion difference (0–5 scale):');
  for (const [key, v] of Object.entries(criterionDiffs)) log(`  - ${key}: ${fmt(mean(v))} (n=${v.length})`);
}

/* --------------------------------------- optional: LLM reasoning sweep --- */
if (reasoning && groups.length) {
  if (!config.llm.enabled) { log(''); log('Skipping --reasoning: DEEPSEEK_API_KEY is not set.'); }
  else {
    config.llm.judgeReasoning = reasoning;
    const sampleRows = groups.flatMap((g) => g.rows.map((r) => ({ ...r, g }))).slice(0, limit);
    const t0 = Date.now();
    const fresh = await mapLimit(sampleRows, config.llm.concurrency, (r) => llmJudge({ candidate: r.c, spec: r.g.job.spec, prefs: r.g.job.prefs, userProfile: null }).catch(() => null));
    const ok = sampleRows.map((r, i) => [r, fresh[i]]).filter(([, f]) => f);
    const before = ok.map(([r]) => finalScore(r.g.rk, r.llm, Object.keys(r.llm)).score);
    const after = ok.map(([r, f]) => finalScore(r.g.rk, f.criterion_scores, Object.keys(f.criterion_scores)).score);
    const jev = ok.map(([r]) => finalScore(r.g.rk, r.jev, Object.keys(r.jev)).score);
    log('');
    log(`## LLM judge re-run at reasoning=${reasoning} (n=${ok.length}, ${round((Date.now() - t0) / 1000, 1)} s total)`);
    log(`- Stored judge vs reasoning=${reasoning}: Spearman ${fmt(spearman(before, after))} · mean |Δ final| ${fmt(before.reduce((s, b, i) => s + Math.abs(b - after[i]), 0) / Math.max(1, ok.length), 1)}`);
    log(`- Jev vs stored judge: Spearman ${fmt(spearman(jev, before))} · Jev vs reasoning=${reasoning}: Spearman ${fmt(spearman(jev, after))}`);
  }
}

log('');
log('Interpretation: these are agreement measures between scorers, not accuracy. Use them together with a small set of');
log('human-labelled searches (see docs/RANKING.md) before choosing the production ranker. Sample-data searches only test the plumbing.');

const outDir = path.join(config.dataDir, 'benchmarks');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `ranker-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
fs.writeFileSync(file, `${out.join('\n')}\n`);
console.log(`\nSaved: ${file}`);

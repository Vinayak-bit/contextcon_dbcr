// Owner-requested simplification (docs/REVIEWS.md → Review 8): no Objectives, no project links,
// one geography list, ranker provenance, on-demand work email. Offline: sample data, mocked Jev.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.CRUSTDATA_TRANSPORT = 'sample';
process.env.DEEPSEEK_API_KEY = '';
process.env.JEV_API_KEY = 'test-key';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'overlap-simplified-'));

const { PERSONAS, GEO_OPTIONS } = await import('../../shared/catalog.js');
const { resolvePrefs, summarize } = await import('../pipeline/prefs.js');
const { rankCandidates } = await import('../ranking/index.js');
const { createJob, getJob, publicJob, resultsPage, loadMore } = await import('../pipeline/job.js');
const { lookupWorkEmail } = await import('../pipeline/contact.js');
const { crustdata } = await import('../crustdata/index.js');
const { heuristicTopic } = await import('../llm/topic.js');

const description = 'Reducing KV-cache memory overhead in long-context LLM inference with paged attention on GPUs';
const base = {
  category: 'company', description, spec: heuristicTopic(description).spec, target: 'both',
  individualTypes: ['software_engineers'], orgTypes: ['startups'], preferences: {}, sizes: [],
  geography: { option: 'worldwide', allowUnverified: false, preferProximity: false },
};

/* ---- Jev mock: success or a non-retryable 400, decided per test ---- */
let jevMode = 'ok';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('typesafe')) return realFetch(url, init);
  if (jevMode === 'fail') return new Response(JSON.stringify({ detail: 'invalid request' }), { status: 400 });
  const body = JSON.parse(init.body);
  const answers = Object.fromEntries(Object.keys(body.questions).map((k) => [k, k === 'decision' ? { type: 'noul', noul: 0.8 } : { type: 'score', score: 4.2, confidence: 0.9 }]));
  return new Response(JSON.stringify({ model: 'jev-1.14.0', answers, usage: { input_tokens: 10 } }), { status: 200 });
};

test('every persona offers the same seven geography options; objectives are gone', () => {
  for (const p of Object.values(PERSONAS)) {
    assert.deepEqual(p.geography, GEO_OPTIONS);
    assert.equal('objectives' in p, false);
  }
  assert.deepEqual(GEO_OPTIONS, ['my_institute', 'my_city', 'my_country', 'another_country', 'specific', 'hubs', 'worldwide']);
});

test('a search request needs no objectives; summary has no goal; ranking sees the description', () => {
  const prefs = resolvePrefs(base, null, null);
  assert.equal(prefs.description, description);
  assert.equal('objectives' in prefs, false);
  assert.equal('goal' in summarize(base, prefs), false);
});

test('older saved requests still resolve: objectives/links ignored, legacy geography ids mapped', () => {
  const old = { ...base, objectives: ['Find experienced engineers'], objectiveOther: '', links: ['https://example.com'],
    geography: { option: 'same_country', country: 'India', allowUnverified: false, preferProximity: false } };
  const prefs = resolvePrefs(old, null, null);
  assert.equal(prefs.geography.scope, 'country');
  assert.deepEqual(prefs.geography.countries, ['India']);
  const city = resolvePrefs({ ...old, geography: { option: 'same_city', city: 'Pune', country: 'India', allowUnverified: false, preferProximity: true } }, null, null);
  assert.equal(city.geography.scope, 'city');
});

test('missing geography values are asked for (400), never guessed', () => {
  assert.throws(() => resolvePrefs({ ...base, geography: { option: 'my_city', allowUnverified: false, preferProximity: false } }, null, null), (e) => e.status === 400);
  const prefs = resolvePrefs({ ...base, geography: { option: 'my_city', allowUnverified: false, preferProximity: false } },
    { location: { city: 'Bengaluru', country: 'India' }, institution: '' }, null);
  assert.equal(prefs.geography.city, 'Bengaluru'); // prefilled from the profile
});

const candidate = () => ({
  candidate_id: 'p_1', candidate_type: 'individual', name: 'Test', current_role: 'Engineer', institution_or_company: 'X',
  career_stage: 'Mid-career', location: 'Pune, India', location_detail: { city: 'Pune', country: 'India' }, headline: '',
  specializations: [], relevant_work: [{ text: 'Built a paged KV cache', evidence: ['E1'] }], publications: [], engineering_projects: [],
  accomplishments: [], methods_and_skills: ['CUDA'], collaboration_evidence: [], source_urls: [],
  evidence: [{ id: 'E1', kind: 'role', text: 'Built a paged KV cache for LLM inference' }], meta: {},
});

test('Jev success: score sourced from Jev, configured = actual, no fallback', async () => {
  jevMode = 'ok';
  const c = candidate();
  await rankCandidates([c], { spec: base.spec, prefs: resolvePrefs(base, null, null), userProfile: null, usage: {}, jevUsage: {}, warnings: [] });
  assert.equal(c.ranking.configured_engine, 'jev');
  assert.equal(c.ranking.engine, 'jev');
  assert.equal(c.ranking.fallback, null);
  assert.ok(c.ranking.breakdown.filter((b) => b.key !== 'proximity').every((b) => b.source === 'jev' && b.jev === 4.2));
});

test('Jev failure: fallback is recorded with the engine that actually scored and why', async () => {
  jevMode = 'fail';
  const c = candidate();
  const warnings = [];
  await rankCandidates([c], { spec: base.spec, prefs: resolvePrefs(base, null, null), userProfile: null, usage: {}, jevUsage: {}, warnings });
  jevMode = 'ok';
  assert.equal(c.ranking.configured_engine, 'jev');
  assert.equal(c.ranking.engine, 'heuristic'); // no DeepSeek key in this test, so the heuristic scores
  assert.deepEqual({ from: c.ranking.fallback.from, to: c.ranking.fallback.to }, { from: 'jev', to: 'heuristic' });
  assert.match(c.ranking.fallback.reason, /Jev 400/);
  assert.ok(warnings.some((w) => /Jev failed/.test(w)));
});

test('job reports which engines actually scored', async () => {
  jevMode = 'ok';
  const user = { id: 'u_simple', profile: null, organization: null };
  const job = await createJob(user, { ...base, target: 'individuals', orgTypes: [], sample: true });
  for (let i = 0; i < 400 && publicJob(getJob(job.id, user)).tabs.individuals.status !== 'done'; i += 1) await new Promise((r) => setTimeout(r, 25));
  const j = publicJob(getJob(job.id, user));
  assert.equal(j.engines.ranker, 'jev');
  assert.ok(j.engines.scored.jev > 0);
});

test('work email: found / none / no profile / plan-gated / failure are distinct; lookups only on demand', async () => {
  const user = { id: 'u_email', profile: null, organization: null };
  const job = await createJob(user, { ...base, target: 'individuals', orgTypes: [], sample: true });
  for (let i = 0; i < 400 && publicJob(getJob(job.id, user)).tabs.individuals.status !== 'done'; i += 1) await new Promise((r) => setTimeout(r, 25));
  const live = getJob(job.id, user);
  assert.equal(live.meter.byOp.personContact, undefined, 'loading the shortlist made no contact calls');

  const people = resultsPage(live, 'individuals', 1).candidates;
  const results = [];
  for (const c of people) results.push(await lookupWorkEmail(live, c));
  const found = results.find((r) => r.status === 'found');
  const none = results.find((r) => r.status === 'none');
  assert.ok(found && found.emails[0].email.endsWith('.example.com') && found.source === 'crustdata');
  assert.ok(none && none.emails.length === 0 && none.message);

  const noProfile = { ...people[0], candidate_id: 'x_noprofile', meta: { ...people[0].meta, linkedin: undefined } };
  assert.equal((await lookupWorkEmail(live, noProfile)).status, 'unavailable');

  const realCall = crustdata.call.bind(crustdata);
  try {
    crustdata.call = async () => { throw Object.assign(new Error('Access denied'), { status: 403 }); };
    const gated = await lookupWorkEmail(live, { ...people[0], candidate_id: 'x_gated' });
    assert.equal(gated.status, 'unavailable');
    assert.match(gated.message, /not enabled on this Crustdata plan/);

    crustdata.call = async () => { throw Object.assign(new Error('upstream timeout'), { status: 504 }); };
    const failed = await lookupWorkEmail(live, { ...people[0], candidate_id: 'x_fail' });
    assert.equal(failed.status, 'error');
    crustdata.call = realCall;
    const retried = await lookupWorkEmail(live, { ...people[0], candidate_id: 'x_fail' });
    assert.notEqual(retried.status, 'error', 'errors are not remembered, so a retry runs again');
  } finally {
    crustdata.call = realCall;
  }
  // Build another page: the job is saved again *after* the lookups, so the next test sees a fresh save.
  loadMore(live, 'individuals');
  for (let i = 0; i < 400 && publicJob(getJob(job.id, user)).tabs.individuals.status !== 'done'; i += 1) await new Promise((r) => setTimeout(r, 25));
  assert.ok(live.contacts.size > 0, 'lookups are remembered in memory for this search');
});

test('work emails are never written to the saved search file', async () => {
  const files = fs.readdirSync(path.join(process.env.DATA_DIR, 'jobs'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(process.env.DATA_DIR, 'jobs', f), 'utf8');
    assert.equal(/@[a-z]+\.example\.com/.test(text), false, `${f} contains an email`);
  }
});

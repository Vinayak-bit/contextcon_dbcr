// End-to-end search job on offline sample data with heuristic AI (no network, no credits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.CRUSTDATA_TRANSPORT = 'sample';
process.env.DEEPSEEK_API_KEY = '';
process.env.JEV_API_KEY = '';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'overlap-test-'));

const { createJob, getJob, publicJob, resultsPage, loadMore } = await import('../pipeline/job.js');
const { heuristicTopic } = await import('../llm/topic.js');

const user = { id: 'u_test', profile: null, organization: null };
const description = 'Reducing KV-cache memory overhead in long-context LLM inference with paged attention on GPUs';
const request = {
  category: 'student', description, links: [], spec: heuristicTopic(description).spec,
  objectives: ['Find experienced engineers or researchers'], target: 'both',
  individualTypes: ['research_scientists', 'pro_engineers'], orgTypes: ['startups', 'tech_companies'],
  preferences: {}, sizes: [], geography: { option: 'worldwide', allowUnverified: false, preferProximity: false },
};

async function waitDone(id, tab) {
  for (let i = 0; i < 200; i += 1) {
    const j = publicJob(getJob(id, user));
    const t = tab ? [j.tabs[tab]] : Object.values(j.tabs);
    if (t.every((x) => x.status === 'done' || x.status === 'error')) return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job did not finish');
}

test('validation errors are 400 with code', async () => {
  await assert.rejects(() => createJob(user, { ...request, individualTypes: [], target: 'individuals' }), (e) => e.status === 400 && e.details.code === 'validation');
  await assert.rejects(() => createJob(user, { ...request, geography: { option: 'my_city', allowUnverified: false, preferProximity: false } }), (e) => e.status === 400);
});

test('both tabs build a ranked first page with evidence and scores', async () => {
  const job = await createJob(user, request);
  const j = await waitDone(job.id);
  assert.equal(j.sample, true);
  assert.equal(j.engines.ranker, 'heuristic');
  for (const tab of ['individuals', 'organizations']) {
    assert.equal(j.tabs[tab].status, 'done', j.tabs[tab].error);
    const page = resultsPage(getJob(job.id, user), tab, 1);
    assert.ok(page.candidates.length > 0, `${tab} has candidates`);
    page.candidates.forEach((c, i) => {
      assert.equal(c.rank, i + 1);
      assert.ok(c.ranking.final_score >= 0 && c.ranking.final_score <= 100);
      const w = c.ranking.breakdown.reduce((s, b) => s + b.weight, 0);
      assert.ok(Math.abs(w - 100) < 0.5, `weights sum to 100 (got ${w})`);
      assert.equal(c.ranking.proximity_included, false);
      assert.ok(c.evidence.length > 0);
      assert.equal(c.meta.sample, true);
      assert.equal(c.meta.geo.status, 'not_required');
    });
    for (let i = 1; i < page.candidates.length; i += 1) assert.ok(page.candidates[i - 1].ranking.final_score >= page.candidates[i].ranking.final_score);
  }
});

test('load more builds page 2 without repeating candidates', async () => {
  const job = await createJob(user, { ...request, target: 'individuals', orgTypes: [] });
  await waitDone(job.id);
  const p1 = resultsPage(getJob(job.id, user), 'individuals', 1);
  assert.equal(p1.note, undefined);
  loadMore(getJob(job.id, user), 'individuals');
  await waitDone(job.id, 'individuals');
  const p2 = resultsPage(getJob(job.id, user), 'individuals', 2);
  assert.ok(p2.note && p2.note.includes('ranked within this page'));
  const ids = new Set(p1.candidates.map((c) => c.candidate_id));
  assert.ok(p2.candidates.every((c) => !ids.has(c.candidate_id)), 'no repeats across pages');
});

test('country restriction is a hard filter', async () => {
  const job = await createJob(user, { ...request, target: 'individuals', orgTypes: [], geography: { option: 'specific', countries: ['India'], allowUnverified: false, preferProximity: false } });
  await waitDone(job.id);
  const page = resultsPage(getJob(job.id, user), 'individuals', 1);
  for (const c of page.candidates) {
    assert.equal(c.meta.geo.status, 'verified');
    assert.equal(c.location_detail.country, 'India');
  }
});

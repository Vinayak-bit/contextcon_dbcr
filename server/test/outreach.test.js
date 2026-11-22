import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const dataDir = mkdtempSync(join(tmpdir(), 'overlap-outreach-'));
process.env.DATA_DIR = dataDir;
process.env.DEEPSEEK_API_KEY = '';
process.env.JEV_API_KEY = '';
process.env.CRUSTDATA_TRANSPORT = 'sample';

const { draftOutreach } = await import('../llm/outreach.js');
const { config } = await import('../config.js');
const { createApp } = await import('../index.js');
const { jobStore } = await import('../store.js');
const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}/api`;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  // Allow the user store's debounced writes to finish before removing test data.
  await new Promise((resolve) => setTimeout(resolve, 60));
  rmSync(dataDir, { recursive: true, force: true });
});

const sender = { name: 'Jamie Researcher' };
const job = {
  spec: { problem_statement: 'FPGA timing closure on multi-clock hardware', core_topics: ['FPGA timing closure'] },
  request: { description: 'I am designing a multi-clock FPGA system.' },
};
const candidate = {
  candidate_id: 'person_1',
  candidate_type: 'individual',
  name: 'Avery Chen',
  meta: { retrievedAt: '2026-11-22T10:00:00Z' },
  evidence: [
    { id: 'unlinked', kind: 'publication', text: 'FPGA timing closure on all devices' },
    { id: 'irrelevant', kind: 'role', text: 'Current role: Professor', url: 'https://example.test/roles' },
    { id: 'paper', kind: 'publication', text: 'Publication: FPGA timing closure with pipelining', url: 'https://example.test/paper' },
  ],
};
const organization = {
  candidate_id: 'org_1',
  candidate_type: 'organization',
  name: 'Example Lab',
  evidence: [],
};

test('template uses a linked record, the project topic, and the selected request', async () => {
  const draft = await draftOutreach(job, candidate, sender, { purpose: 'research_internship', notes: 'I can start in June.' });
  assert.equal(draft.engine, 'template');
  assert.match(draft.subject, /FPGA timing closure/);
  assert.match(draft.body, /research internship opportunities/);
  assert.match(draft.body, /I can start in June\./);
  assert.match(draft.body, /Publication: FPGA timing closure with pipelining/);
  assert.match(draft.body, /Jamie Researcher/);
  assert.deepEqual(draft.sources.map(({ id }) => id), ['paper']);
  assert.equal(draft.retrievedAt, candidate.meta.retrievedAt);
});

test('drafts to organizations without evidence use the custom request and omit recipient claims', async () => {
  const draft = await draftOutreach(job, organization, sender, { purpose: 'other', notes: 'May I visit the lab?' });
  assert.match(draft.body, /Hello Example Lab team,/);
  assert.match(draft.body, /May I visit the lab\?/);
  assert.deepEqual(draft.sources, []);
  await assert.rejects(draftOutreach(job, organization, sender, { purpose: 'other' }), { status: 400 });
});

test('model drafts use approved source IDs and fall back if the provider claims a missing record', async (context) => {
  const previousKey = config.llm.apiKey;
  config.llm.apiKey = 'fake-key';
  let sourceIds = ['paper'];
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const payload = JSON.parse(options.body);
    const input = JSON.parse(payload.messages[1].content);
    assert.deepEqual(input.evidence.map(({ id }) => id), ['paper']);
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      subject: 'FPGA timing closure', body: 'Could we arrange a meeting?\n\n[Your name]', sourceIds,
    }) } }] });
  });
  try {
    const draft = await draftOutreach(job, candidate, sender, { purpose: 'meeting' });
    assert.equal(draft.engine, 'deepseek');
    assert.match(draft.body, /Jamie Researcher/);
    assert.equal(draft.sources[0].id, 'paper');

    sourceIds = ['invented'];
    const fallback = await draftOutreach(job, candidate, sender, { purpose: 'meeting' });
    assert.equal(fallback.engine, 'template');
    assert.equal(fallback.sources[0].id, 'paper');
  } finally {
    config.llm.apiKey = previousKey;
  }
});

async function login(email) {
  const response = await fetch(`${origin}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sender.name, email }),
  });
  assert.equal(response.status, 200);
  return { user: await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] };
}

test('draft endpoint requires an owned search and a candidate on that search', async () => {
  const owner = await login('owner@example.test');
  const other = await login('other@example.test');
  jobStore.save({
    ...job, id: 'test_search', userId: owner.user.id, sample: true,
    tabs: { organizations: { status: 'done', pages: [{ candidates: [organization] }] } },
  });

  const post = (id, cookie) => fetch(`${origin}/search/test_search/candidates/${id}/outreach-draft`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ purpose: 'collaboration' }),
  });
  assert.equal((await post('org_1')).status, 401);
  assert.equal((await post('org_1', other.cookie)).status, 404);
  assert.equal((await post('missing', owner.cookie)).status, 404);
  const response = await post('org_1', owner.cookie);
  assert.equal(response.status, 200);
  const draft = await response.json();
  assert.equal(draft.sample, true);
  assert.match(draft.body, /discussing whether there is a way to collaborate/);
});

// Unit tests for server/pipeline/academic.js (Laptop 3) using a stub gateway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAcademicAuthors, findLabs } from '../../pipeline/academic.js';

const ctxWith = (results, llm = { enabled: false }) => ({
  sample: true, meter: null, warnings: [], log() {}, llm,
  crustdata: { async batch(op, bodies) { return bodies.map((b) => (results instanceof Error ? results : { data: { results: results(b) }, retrievedAt: '2026-01-01T00:00:00Z', transport: 'rest' })); } },
});

test('findAcademicAuthors groups papers by author and links unlinked names', async () => {
  const ctx = ctxWith(() => [
    { title: '[PDF] Paged attention for LLMs', url: 'https://p/1', metadata: 'A Kumar, B Chen - 2023 - arXiv', citations: 12, authors: [{ name: 'A Kumar', profile_url: 'https://scholar.google.com/citations?user=K1' }, { name: 'B Chen', profile_url: null }] },
    { title: 'KV cache compression', url: 'https://p/2', metadata: 'A Kumar, C Diaz… - 2024 - NeurIPS', citations: 3 },
  ]);
  const out = await findAcademicAuthors(ctx, ['kv cache', 'kv cache']);
  const kumar = out.find((a) => a.author.name === 'A Kumar');
  assert.equal(kumar.author.profile_url, 'https://scholar.google.com/citations?user=K1');
  assert.equal(kumar.papers.length, 2, 'unlinked metadata name merges into linked author; duplicate query ignored');
  assert.equal(kumar.papers[0].title, 'Paged attention for LLMs');
  assert.equal(kumar.papers[0].year, 2023);
  assert.ok(!out.some((a) => /…/.test(a.author.name)), 'truncated names are skipped');
  assert.equal(out[0].author.name, 'A Kumar', 'ordered by papers found');
});

test('findAcademicAuthors turns gateway errors into warnings', async () => {
  const err = Object.assign(new Error('Forbidden'), { status: 403 });
  const ctx = ctxWith(err);
  assert.deepEqual(await findAcademicAuthors(ctx, ['x']), []);
  assert.equal(ctx.warnings.length, 1);
});

test('disabled Scholar sources give one friendly warning, not a raw error per query', async () => {
  const err = Object.assign(new Error('Source temporarily disabled: scholar-articles'), { status: 400 });
  const logs = [];
  const ctx = { ...ctxWith(err), log: (m) => logs.push(m) };
  assert.deepEqual(await findAcademicAuthors(ctx, ['kv cache', 'paged attention']), []);
  assert.deepEqual(ctx.warnings, ['Academic paper search is temporarily unavailable; results come from profile search.']);
  assert.equal(logs.length, 2, 'raw messages still go to the progress log');
});

test('findLabs heuristic extracts lab name and parent, skips non-lab pages', async () => {
  const ctx = ctxWith(() => [
    { title: 'Efficient ML Systems Lab - Westbrook University', url: 'https://w/lab', snippet: 'We build fast inference.' },
    { title: 'Careers at Acme', url: 'https://acme/jobs', snippet: '' },
    { title: 'Stanford University', url: 'https://stanford.edu', snippet: 'Stanford University home page' },
    { title: 'Parallel Computing Research Group | Department of CS', url: 'https://k/pcrg', snippet: 'Part of the Kestrel Institute of Technology.' },
  ]);
  const labs = await findLabs(ctx, ['inference research lab']);
  assert.deepEqual(labs.map((l) => [l.name, l.parent]), [
    ['Efficient ML Systems Lab', 'Westbrook University'],
    ['Parallel Computing Research Group', 'Kestrel Institute of Technology'],
  ]);
  assert.equal(labs[0].retrievedAt, '2026-01-01T00:00:00Z');
});

test('findLabs uses the LLM when enabled and falls back on failure', async () => {
  const results = () => [{ title: 'Some page', url: 'https://x/1', snippet: 'The Robot Learning Lab at Northfield Institute of Technology' }];
  const llm = { enabled: true, chatJson: async () => ({ labs: [{ index: 0, name: 'Robot Learning Lab', parent: 'Northfield Institute of Technology', location: null }] }) };
  const labs = await findLabs(ctxWith(results, llm), ['q']);
  assert.equal(labs[0].name, 'Robot Learning Lab');
  const broken = { enabled: true, chatJson: async () => { throw new Error('down'); } };
  assert.deepEqual(await findLabs(ctxWith(results, broken), ['q']), [], 'heuristic finds no lab in the title');
});

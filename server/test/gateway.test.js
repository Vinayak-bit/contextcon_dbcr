// The gateway must never start a first-time OAuth sign-in on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.CRUSTDATA_TRANSPORT = 'mcp';
process.env.CRUSTDATA_API_KEY = '';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'overlap-gw-'));
const { crustdata } = await import('../crustdata/index.js');

test('without credentials, live requests fail with crustdata_auth_required and do not connect', async () => {
  let connects = 0;
  crustdata.live.connect = async () => { connects += 1; return crustdata.live.status(); };
  await assert.rejects(() => crustdata.resolveSample(false), (e) => e.status === 409 && e.details.code === 'crustdata_auth_required');
  assert.equal(connects, 0);
  assert.equal(await crustdata.resolveSample(true), true);
});

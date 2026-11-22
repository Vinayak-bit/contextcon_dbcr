// Tiny JSON-file persistence for users, sessions and the response cache.
// Good enough for a single-node deployment; swap for a database in production.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { hash, nowIso, uid } from './util.js';

fs.mkdirSync(path.join(config.dataDir, 'cache'), { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'jobs'), { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const usersFile = path.join(config.dataDir, 'users.json');
const db = readJson(usersFile, { users: {}, sessions: {} });
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJson(usersFile, db), 50);
}

export const users = {
  findByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return Object.values(db.users).find((u) => u.email === e) || null;
  },
  get(id) { return db.users[id] || null; },
  create({ name, email, consent }) {
    const id = uid('u_');
    db.users[id] = { id, name: name.trim(), email: email.trim().toLowerCase(), consent: Boolean(consent), createdAt: nowIso(), discovery: { attempts: 0, status: 'pending' }, profile: null, organization: null, category: null };
    persist();
    return db.users[id];
  },
  update(id, patch) {
    if (!db.users[id]) return null;
    db.users[id] = { ...db.users[id], ...patch, updatedAt: nowIso() };
    persist();
    return db.users[id];
  },
  remove(id) {
    delete db.users[id];
    for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === id) delete db.sessions[sid];
    persist();
  },
};

export const sessions = {
  create(userId) {
    const sid = uid('s_') + uid();
    db.sessions[sid] = { userId, createdAt: nowIso() };
    persist();
    return sid;
  },
  get(sid) { return (sid && db.sessions[sid]) || null; },
  destroy(sid) { delete db.sessions[sid]; persist(); },
};

/** Disk cache with TTL, keyed by any JSON-serialisable value. */
export const cache = {
  file(key) { return path.join(config.dataDir, 'cache', `${hash(key)}.json`); },
  get(key, ttlMs) {
    const entry = readJson(this.file(key), null);
    if (!entry) return null;
    if (ttlMs && Date.now() - entry.t > ttlMs) return null;
    return entry;
  },
  set(key, value) {
    const entry = { t: Date.now(), retrievedAt: nowIso(), value };
    try { writeJson(this.file(key), entry); } catch { /* cache is best effort */ }
    return entry;
  },
};

export const jobStore = {
  save(job) { try { writeJson(path.join(config.dataDir, 'jobs', `${job.id}.json`), job); } catch { /* best effort */ } },
  load(id) { return /^[\w-]+$/.test(id) ? readJson(path.join(config.dataDir, 'jobs', `${id}.json`), null) : null; },
};

export const kv = {
  file: (name) => path.join(config.dataDir, `${name}.json`),
  read(name, fallback) { return readJson(this.file(name), fallback); },
  write(name, value) { writeJson(this.file(name), value); },
  remove(name) { try { fs.unlinkSync(this.file(name)); } catch { /* absent */ } },
};

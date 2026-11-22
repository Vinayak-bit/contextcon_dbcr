// Express helpers: lightweight cookie session, auth guard, async wrapper, error envelope.
import { sessions, users } from './store.js';
import { HttpError } from './util.js';

export const COOKIE = 'ov_sid';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]));
}

export function sessionMiddleware(req, _res, next) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  const s = sessions.get(sid);
  req.sid = s ? sid : null;
  req.user = s ? users.get(s.userId) : null;
  next();
}

export function setSessionCookie(res, sid) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in.', { code: 'unauthenticated' }));
  next();
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const DEFAULT_CODES = { 400: 'validation', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' };

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err instanceof HttpError ? err.status : err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  const code = err?.details?.code || DEFAULT_CODES[status] || 'internal';
  if (status >= 500) console.error('[api]', err);
  const details = err?.details && Object.keys(err.details).some((k) => k !== 'code') ? err.details : undefined;
  res.status(status).json({ error: { message: status >= 500 && !(err instanceof HttpError) ? 'Something went wrong on the server.' : err.message, code, details } });
}

/** Simple per-session fixed-window limiter for expensive endpoints. */
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, _res, next) => {
    const key = req.sid || req.ip;
    const now = Date.now();
    const h = hits.get(key) || { start: now, n: 0 };
    if (now - h.start > windowMs) { h.start = now; h.n = 0; }
    h.n += 1;
    hits.set(key, h);
    if (h.n > max) return next(new HttpError(429, 'Too many requests — please wait a moment.', { code: 'rate_limited' }));
    next();
  };
}

/** Public view of a user (`Me`). */
export function meView(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    consent: u.consent,
    category: u.category,
    discovery: { attempts: u.discovery?.attempts || 0, maxAttempts: 3, status: u.discovery?.status || 'pending' },
    profile: u.profile,
    organization: u.organization,
  };
}

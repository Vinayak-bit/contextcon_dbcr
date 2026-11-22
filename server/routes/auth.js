// Lightweight sign-in (name + email + consent), session cookie, category, account deletion.
import { Router } from 'express';
import { PERSONAS } from '../../shared/catalog.js';
import { users, sessions } from '../store.js';
import { HttpError } from '../util.js';
import { clearSessionCookie, meView, requireUser, setSessionCookie, wrap } from '../http.js';

export const authRouter = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post('/auth/login', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const consent = req.body?.consent === true;
  if (name.length < 2) throw new HttpError(400, 'Enter your name.', { code: 'validation', field: 'name' });
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.', { code: 'validation', field: 'email' });
  let user = users.findByEmail(email);
  if (!user) user = users.create({ name, email, consent });
  else user = users.update(user.id, { name, consent, ...(consent ? {} : { profile: null }) });
  if (!consent && user.discovery?.status === 'pending') user = users.update(user.id, { discovery: { ...user.discovery, status: 'skipped' } });
  setSessionCookie(res, sessions.create(user.id));
  res.json(meView(user));
}));

authRouter.get('/auth/me', requireUser, (req, res) => res.json(meView(req.user)));

authRouter.post('/auth/logout', (req, res) => {
  if (req.sid) sessions.destroy(req.sid);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.delete('/me', requireUser, (req, res) => {
  users.remove(req.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Consent to store profile details. Withdrawing it deletes what was stored.
authRouter.put('/me/consent', requireUser, (req, res) => {
  if (typeof req.body?.consent !== 'boolean') throw new HttpError(400, 'consent must be true or false.', { code: 'validation' });
  const consent = req.body.consent;
  res.json(meView(users.update(req.user.id, consent ? { consent } : { consent, profile: null, profileContext: undefined })));
});

authRouter.put('/me/category', requireUser, (req, res) => {
  const category = req.body?.category;
  if (!PERSONAS[category]) throw new HttpError(400, 'Unknown category.', { code: 'validation' });
  res.json(meView(users.update(req.user.id, { category })));
});

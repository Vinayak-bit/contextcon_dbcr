// Topic validation and search jobs.
import { Router } from 'express';
import { PERSONAS } from '../../shared/catalog.js';
import { validateTopic } from '../llm/topic.js';
import { draftOutreach } from '../llm/outreach.js';
import { createJob, findCandidate, getJob, loadMore, publicJob, resultsPage } from '../pipeline/job.js';
import { lookupWorkEmail } from '../pipeline/contact.js';
import { HttpError } from '../util.js';
import { rateLimit, requireUser, wrap } from '../http.js';

export const searchRouter = Router();

searchRouter.post('/topic/validate', requireUser, rateLimit({ windowMs: 60_000, max: 30 }), wrap(async (req, res) => {
  const b = req.body || {};
  const description = String(b.description || '').trim();
  if (!description) throw new HttpError(400, 'Describe what you are working on.', { code: 'validation' });
  if (description.length > 12000) throw new HttpError(400, 'Please keep the description (including pasted excerpts) under 12,000 characters.', { code: 'validation' });
  if (b.category && !PERSONAS[b.category]) throw new HttpError(400, 'Unknown category.', { code: 'validation' });
  // Project links are no longer accepted: pages were never fetched, so URLs alone told the model nothing.
  res.json(await validateTopic({ description, category: b.category || req.user.category, background: b.background, profile: req.user.profile }));
}));

searchRouter.post('/search', requireUser, rateLimit({ windowMs: 60_000, max: 10 }), wrap(async (req, res) => {
  const job = await createJob(req.user, req.body || {});
  res.status(201).json({ jobId: job.id });
}));

searchRouter.get('/search/:id', requireUser, (req, res) => {
  res.json(publicJob(getJob(req.params.id, req.user)));
});

searchRouter.get('/search/:id/results', requireUser, (req, res) => {
  const tab = req.query.tab === 'organizations' ? 'organizations' : 'individuals';
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  res.json(resultsPage(getJob(req.params.id, req.user), tab, page));
});

searchRouter.post('/search/:id/more', requireUser, (req, res) => {
  const tab = req.body?.tab === 'organizations' ? 'organizations' : 'individuals';
  res.json(publicJob(loadMore(getJob(req.params.id, req.user), tab)));
});

searchRouter.get('/search/:id/candidates/:cid', requireUser, (req, res) => {
  res.json(findCandidate(getJob(req.params.id, req.user), req.params.cid));
});

// On demand only (a click): may spend a Crustdata contact credit when an email is found.
searchRouter.post('/search/:id/candidates/:cid/work-email', requireUser, rateLimit({ windowMs: 60_000, max: 20 }), wrap(async (req, res) => {
  const job = getJob(req.params.id, req.user);
  res.json(await lookupWorkEmail(job, findCandidate(job, req.params.cid)));
}));

// Compose only. The user's mail app handles sending after review.
searchRouter.post('/search/:id/candidates/:cid/outreach-draft', requireUser, rateLimit({ windowMs: 60_000, max: 10 }), wrap(async (req, res) => {
  const job = getJob(req.params.id, req.user);
  const candidate = findCandidate(job, req.params.cid);
  res.json(await draftOutreach(job, candidate, req.user, req.body));
}));

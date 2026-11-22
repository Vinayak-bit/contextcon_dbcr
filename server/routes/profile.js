// Profile discovery (spec §2) and the organization profile (spec §4 C1).
// Unconfirmed matches live only in memory; nothing is stored without consent.
import { Router } from 'express';
import { config } from '../config.js';
import { crustdata, unwrapMatches } from '../crustdata/index.js';
import { chatJson } from '../llm/deepseek.js';
import { personToCandidate } from '../pipeline/normalize.js';
import { users } from '../store.js';
import { HttpError, compact, nowIso, uid } from '../util.js';
import { meView, requireUser, wrap } from '../http.js';
import * as z from 'zod/v4';

export const profileRouter = Router();
const MAX_ATTEMPTS = 3;
const pending = new Map(); // userId → Map(match_id → { person, source })

const FULL_FIELDS = ['basic_profile', 'experience', 'education', 'skills', 'social_handles', 'dev_platform_profiles', 'research_profiles'];
const BASIC_FIELDS = ['basic_profile', 'experience', 'education', 'skills', 'social_handles'];

function remember(userId, person, source, sample) {
  if (!pending.has(userId)) pending.set(userId, new Map());
  const bp = person.basic_profile || {};
  const cur = person.experience?.employment_details?.current?.[0] || {};
  const loc = bp.location || {};
  const match = {
    match_id: uid('m_'),
    name: bp.name || compact([bp.first_name, bp.last_name]).join(' ') || 'Unknown',
    headline: bp.headline || '',
    current_title: bp.current_title || cur.title || '',
    organization: cur.name || cur.company_name || '',
    location: loc.raw || loc.full_location || compact([loc.city, loc.state, loc.country]).join(', '),
    profile_url: person.social_handles?.professional_network_identifier?.profile_url,
    confidence: person._confidence,
    source,
    sample: Boolean(person._sample || sample),
  };
  pending.get(userId).set(match.match_id, { person, source, sample });
  return match;
}

function toUserProfile(person, sample) {
  const c = personToCandidate(person, {});
  const school = person.education?.schools?.[0]?.school || '';
  return {
    source: 'crustdata',
    name: c.name,
    current_role: c.current_role,
    institution: c.institution_or_company || school,
    career_stage: c.career_stage,
    location: { city: c.location_detail.city, state: c.location_detail.state, country: c.location_detail.country, raw: c.location },
    experience: c.evidence.filter((e) => e.kind === 'role').map((e) => e.text.replace(/^(Current|Past) role: /, '')).slice(0, 10),
    skills: c.methods_and_skills.slice(0, 30),
    projects: c.engineering_projects.map((p) => `${p.title}${p.description ? `: ${p.description}` : ''}`).slice(0, 10),
    publications: c.publications.map((p) => `${p.title}${p.year ? ` (${p.year})` : ''}`).slice(0, 10),
    links: c.source_urls,
    crustdata_person_id: person.crustdata_person_id,
    confirmedAt: nowIso(),
    sample: Boolean(person._sample || sample),
  };
}

const and = (...parts) => { const c = parts.filter(Boolean); return c.length > 1 ? { op: 'and', conditions: c } : c[0]; };

profileRouter.post('/profile/discover', requireUser, wrap(async (req, res) => {
  const u = req.user;
  if (!u.consent) throw new HttpError(400, 'Profile discovery needs your consent to use your name and email for matching.', { code: 'validation' });
  const attempts = u.discovery?.attempts || 0;
  if (attempts >= MAX_ATTEMPTS) throw new HttpError(409, 'All 3 discovery attempts have been used. You can add profile links or skip.', { code: 'attempts_exhausted' });
  const sample = await crustdata.resolveSample(Boolean(req.body?.sample));
  const method = req.body?.method === 'name' ? 'name' : 'email';
  let people = []; let source; let note;
  if (method === 'email') {
    const r = await crustdata.call('personIdentify', { emails: [u.email] }, { sample });
    people = unwrapMatches(r.data, 'person_data');
    source = 'email_identify';
    if (!people.length) note = 'No professional profile matched your email.';
  } else {
    const name = String(req.body?.name || u.name).trim();
    const aff = String(req.body?.affiliation || '').trim();
    if (!name) throw new HttpError(400, 'Enter your name.', { code: 'validation' });
    const filters = and(
      { field: 'basic_profile.name', type: '(.)', value: name },
      aff && { op: 'or', conditions: [{ field: 'experience.employment_details.current.company_name', type: '(.)', value: aff }, { field: 'education.schools.school', type: '(.)', value: aff }] },
    );
    const r = await crustdata.call('personSearch', { filters, limit: 3, fields: ['basic_profile', 'social_handles', 'experience', 'education'] }, { sample });
    people = r.data?.profiles || [];
    source = 'name_search';
    if (!people.length) note = aff ? `No profile matched "${name}" at "${aff}".` : `No profile matched "${name}".`;
  }
  const matches = people.slice(0, 3).map((p) => remember(u.id, p, source, sample));
  const used = attempts + 1;
  users.update(u.id, { discovery: { attempts: used, status: !matches.length && used >= MAX_ATTEMPTS ? 'exhausted' : 'pending' } });
  res.json({ attempt: used, attemptsLeft: MAX_ATTEMPTS - used, matches, note });
}));

profileRouter.post('/profile/reject', requireUser, (req, res) => {
  const u = req.user;
  pending.get(u.id)?.delete(req.body?.match_id);
  const attempts = u.discovery?.attempts || 0;
  if (attempts >= MAX_ATTEMPTS && u.discovery?.status !== 'confirmed') users.update(u.id, { discovery: { attempts, status: 'exhausted' } });
  res.json({ attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) });
});

profileRouter.post('/profile/confirm', requireUser, wrap(async (req, res) => {
  const u = req.user;
  const m = pending.get(u.id)?.get(req.body?.match_id);
  if (!m) throw new HttpError(404, 'That match is no longer available — please search again.', { code: 'not_found' });
  let person = m.person;
  const url = person.social_handles?.professional_network_identifier?.profile_url;
  if (url) {
    for (const fields of [FULL_FIELDS, BASIC_FIELDS]) {
      try {
        const r = await crustdata.call('personEnrich', { professional_network_profile_urls: [url], fields }, { sample: m.sample });
        const full = unwrapMatches(r.data, 'person_data')[0];
        if (full) person = full;
        break;
      } catch (err) {
        if (err.status !== 403) break; // gated fields → retry with the basic set
      }
    }
  }
  const updated = users.update(u.id, { profile: u.consent ? toUserProfile(person, m.sample) : null, discovery: { attempts: u.discovery?.attempts || 0, status: 'confirmed' } });
  pending.delete(u.id);
  res.json(meView(updated));
}));

const handleFrom = (url, host) => {
  try {
    const p = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (host && !p.hostname.includes(host)) return null;
    return p.pathname.split('/').filter(Boolean)[0] || null;
  } catch { return null; }
};

profileRouter.post('/profile/links', requireUser, wrap(async (req, res) => {
  const u = req.user;
  if (!u.consent) throw new HttpError(400, 'Adding profile links needs your consent to use them for matching.', { code: 'validation' });
  const b = req.body || {};
  const sample = await crustdata.resolveSample(Boolean(b.sample));
  const matches = []; const context = [];
  const tryCall = async (label, fn) => { try { await fn(); } catch (err) { context.push({ label, url: '', fetched: false, summary: `Lookup failed: ${err.message}` }); } };

  if (b.linkedin) await tryCall('LinkedIn', async () => {
    const r = await crustdata.call('personIdentify', { professional_network_profile_urls: [b.linkedin] }, { sample });
    unwrapMatches(r.data, 'person_data').forEach((p) => matches.push(remember(u.id, p, 'linkedin_identify', sample)));
  });
  if (b.scholar) await tryCall('Google Scholar', async () => {
    const r = await crustdata.call('personIdentify', { research_profile_urls: [b.scholar] }, { sample });
    unwrapMatches(r.data, 'person_data').forEach((p) => matches.push(remember(u.id, p, 'scholar_identify', sample)));
  });
  const gh = b.github && handleFrom(b.github, 'github');
  if (gh) await tryCall('GitHub', async () => {
    const r = await crustdata.call('personSearch', { filters: { field: 'dev_platform_profiles.login', type: '=', value: gh }, limit: 3, fields: ['basic_profile', 'social_handles', 'experience'] }, { sample });
    (r.data?.profiles || []).forEach((p) => matches.push(remember(u.id, p, 'github_search', sample)));
  });
  const xh = b.x && handleFrom(b.x);
  if (xh) await tryCall('X', async () => {
    const r = await crustdata.call('personSearch', { filters: { field: 'social_handles.twitter_identifier.slug', type: '=', value: xh.replace(/^@/, '') }, limit: 3, fields: ['basic_profile', 'social_handles', 'experience'] }, { sample });
    (r.data?.profiles || []).forEach((p) => matches.push(remember(u.id, p, 'x_search', sample)));
  });
  if (b.website) await tryCall('Website', async () => {
    const r = await crustdata.call('webFetch', { urls: [b.website] }, { sample });
    const page = (Array.isArray(r.data) ? r.data : []).find((x) => x.success);
    const text = String(page?.content || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
    let summary = text.slice(0, 300);
    if (text && config.llm.enabled) {
      const out = await chatJson({ system: 'Summarize the technical work described on this personal or portfolio page in at most 3 sentences, using only facts on the page. Reply in json: {"summary": "..."}', user: text, schema: z.object({ summary: z.string() }), maxTokens: 400 }).catch(() => null);
      if (out?.summary) summary = out.summary;
    }
    context.push({ label: 'Website', url: b.website, fetched: Boolean(page), summary });
  });
  if (context.some((c) => c.fetched)) users.update(u.id, { profileContext: context.filter((c) => c.fetched) });
  res.json({ matches, context });
}));

profileRouter.post('/profile/skip', requireUser, (req, res) => {
  const u = req.user;
  pending.delete(u.id);
  res.json(meView(users.update(u.id, { discovery: { attempts: u.discovery?.attempts || 0, status: 'skipped' } })));
});

const EDITABLE = ['name', 'current_role', 'institution', 'career_stage', 'location', 'experience', 'skills', 'projects', 'publications', 'links'];
profileRouter.put('/profile', requireUser, (req, res) => {
  const u = req.user;
  if (!u.consent) throw new HttpError(400, 'Storing profile details needs your consent.', { code: 'validation' });
  const base = u.profile || { source: 'manual', name: u.name, current_role: '', institution: '', career_stage: 'Unknown', location: { city: '', country: '' }, experience: [], skills: [], projects: [], publications: [], links: [], confirmedAt: nowIso() };
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => EDITABLE.includes(k)));
  res.json(meView(users.update(u.id, { profile: { ...base, ...patch } })));
});

/* ----------------------------------------------------- organization (C1) */
function toOrgProfile(c, sample) {
  const bi = c.basic_info || {}; const loc = c.locations || {}; const tax = c.taxonomy || {};
  const hq = typeof loc.headquarters === 'string' ? loc.headquarters : loc.headquarters?.raw;
  return {
    name: bi.name || '',
    type: bi.company_type || '',
    website: bi.website || (bi.primary_domain ? `https://${bi.primary_domain}` : ''),
    domain: bi.primary_domain || '',
    primary_domain: tax.professional_network_industry || (bi.industries || [])[0] || '',
    team_size: c.headcount?.total ? String(c.headcount.total) : bi.employee_count_range || '',
    location: { city: loc.city || '', state: loc.state || '', country: loc.country || '', raw: hq || compact([loc.city, loc.country]).join(', ') },
    description: bi.description || '',
    crustdata_company_id: c.crustdata_company_id,
    matched: true,
    sample: Boolean(c._sample || sample),
  };
}

profileRouter.post('/org/identify', requireUser, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const website = String(req.body?.website || '').trim();
  if (!name && !website) throw new HttpError(400, 'Enter the organization name or website.', { code: 'validation' });
  const sample = await crustdata.resolveSample(Boolean(req.body?.sample));
  let domain = '';
  if (website) { try { domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, ''); } catch { /* not a URL */ } }
  const r = await crustdata.call('companyIdentify', domain ? { domains: [domain] } : { names: [name] }, { sample });
  let companies = unwrapMatches(r.data, 'company_data').slice(0, 3);
  if (companies[0]?.crustdata_company_id) {
    try {
      const e = await crustdata.call('companyEnrich', { crustdata_company_ids: [companies[0].crustdata_company_id], fields: ['basic_info', 'headcount', 'locations', 'taxonomy'] }, { sample });
      const full = unwrapMatches(e.data, 'company_data')[0];
      if (full) companies = [full, ...companies.slice(1)];
    } catch { /* identify data is enough */ }
  }
  res.json({ matches: companies.map((c) => toOrgProfile(c, sample)) });
}));

profileRouter.put('/org', requireUser, (req, res) => {
  const o = req.body || {};
  if (!String(o.name || '').trim()) throw new HttpError(400, 'Enter the organization name.', { code: 'validation' });
  const org = {
    name: String(o.name).trim(), type: String(o.type || ''), website: String(o.website || ''), domain: o.domain || '',
    primary_domain: String(o.primary_domain || ''), team_size: String(o.team_size || ''),
    location: { city: o.location?.city || '', state: o.location?.state || '', country: o.location?.country || '', raw: o.location?.raw || '' },
    description: o.description || '', crustdata_company_id: o.crustdata_company_id, matched: Boolean(o.matched), sample: Boolean(o.sample),
  };
  res.json(meView(users.update(req.user.id, { organization: org })));
});

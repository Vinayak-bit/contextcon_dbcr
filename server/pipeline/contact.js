// On-demand work-email lookup for one individual result (owned by Laptop 4).
// Runs only when the user clicks "View work email", so loading a shortlist spends no contact credits.
// Uses Crustdata's contact endpoint (POST /person/contact/enrich, MCP tool person_contact_enrich) and asks for
// business emails only, which bills at most 1 credit per person served an email (none when nothing is on file).
import { crustdata, unwrapMatches } from '../crustdata/index.js';
import { HttpError, nowIso } from '../util.js';

const FIELDS = ['contact.business_emails', 'contact.business_emails_message'];

/** Normalise Crustdata's business_emails entries (objects, or plain strings in older responses). */
function emailsFrom(people) {
  const out = [];
  for (const p of people) {
    for (const e of p.contact?.business_emails || []) {
      const email = typeof e === 'string' ? e : e?.email;
      if (email && !out.some((x) => x.email === email)) {
        out.push({ email, ...(typeof e === 'object' && e.status ? { status: e.status } : {}), ...(typeof e === 'object' && e.last_updated ? { last_updated: e.last_updated } : {}) });
      }
    }
  }
  return out;
}

/**
 * Look up business emails for an individual candidate of a job.
 * @returns {Promise<import('../../web/src/api/types').WorkEmailLookup>}
 */
export async function lookupWorkEmail(job, candidate) {
  if (candidate.candidate_type !== 'individual') throw new HttpError(400, 'Work email lookup is only available for people.', { code: 'validation' });
  const base = { source: 'crustdata', retrievedAt: nowIso(), emails: [], sample: Boolean(job.sample) };
  const url = candidate.meta?.linkedin;
  if (!url) {
    return { ...base, status: 'unavailable', message: 'No matched professional profile for this person, so there is nothing to look up.' };
  }
  // Remember lookups for this search (in memory only — never written to the saved search file).
  job.contacts ||= new Map();
  if (job.contacts.has(candidate.candidate_id)) return job.contacts.get(candidate.candidate_id);

  let result;
  try {
    const r = await crustdata.call('personContact', { professional_network_profile_urls: [url], fields: FIELDS }, { sample: job.sample, meter: job.meter, useCache: false });
    const people = unwrapMatches(r.data, 'person_data');
    const emails = emailsFrom(people);
    const note = people.map((p) => p.contact?.business_emails_message).find(Boolean);
    result = emails.length
      ? { ...base, status: 'found', emails, credits: r.credits, retrievedAt: r.retrievedAt }
      : { ...base, status: 'none', message: people.length ? (note || 'Crustdata has no business email on file for this person.') : 'Crustdata could not match this profile for contact lookup.', credits: r.credits, retrievedAt: r.retrievedAt };
  } catch (err) {
    const status = err?.status;
    if (status === 403) {
      result = { ...base, status: 'unavailable', message: 'Work email lookup is not enabled on this Crustdata plan.' };
    } else if (status === 402 || err?.type === 'insufficient_credits') {
      result = { ...base, status: 'unavailable', message: 'Not enough Crustdata credits for a contact lookup.' };
    } else if (status === 401 || err?.details?.code === 'crustdata_auth_required') {
      result = { ...base, status: 'unavailable', message: 'Connect Crustdata to look up work emails.' };
    } else {
      // Not remembered, so the user can retry.
      return { ...base, status: 'error', message: `The lookup failed${err?.message ? `: ${err.message}` : ''}. Try again.` };
    }
  }
  job.contacts.set(candidate.candidate_id, result);
  return result;
}

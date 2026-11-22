// Deduplication (owned by Laptop 3). Works for both candidate kinds.
// Individuals: Crustdata person id, profile URLs, normalized name + organization.
// Academic-only identities (from paper authorship) merge into a matching person,
// adding their publications as new evidence items. Organizations: company id,
// domain, normalized name (+ parent institution for labs).
import { normText } from '../util.js';
import { institutionMatches } from './geography.js';

const ORG_SUFFIX = /\b(inc|incorporated|ltd|limited|llc|llp|plc|gmbh|ag|sa|sas|bv|pvt|private|corp|corporation|co|company|pte|oy|ab)\b/g;

/** Normalize a URL for identity comparison (scheme, www, trailing slash, query noise removed; Scholar keeps `user=`). */
export function normUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(String(u).trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const user = url.searchParams.get('user');
    return `${host}${url.pathname.replace(/\/+$/, '').toLowerCase()}${user ? `?user=${user}` : ''}`;
  } catch {
    return String(u).trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  }
}

const normName = (s) => normText(s).replace(/\./g, '').replace(/\b(dr|prof|professor|mr|ms|mrs|phd)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const normOrg = (s) => normText(s).replace(/&/g, ' and ').replace(/\./g, '').replace(ORG_SUFFIX, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Identity keys for a candidate; two candidates sharing any key are the same entity. */
function keys(c) {
  const out = [`id:${c.candidate_id}`];
  const m = c.meta || {};
  if (c.candidate_type === 'organization') {
    if (m.crustdata_company_id) out.push(`cid:${m.crustdata_company_id}`);
    if (m.domain) out.push(`dom:${String(m.domain).toLowerCase().replace(/^www\./, '')}`);
    const n = normOrg(c.name);
    // Same name in different countries can be different organizations.
    if (n) out.push(m.labFromWeb ? `lab:${n}|${normOrg(c.parent_institution)}` : `org:${n}|${normText(c.hq_detail?.country)}`);
    return out;
  }
  if (m.mergeInto) out.push(`id:${m.mergeInto}`);
  if (m.crustdata_person_id) out.push(`pid:${m.crustdata_person_id}`);
  if (m.linkedin) out.push(`url:${normUrl(m.linkedin)}`);
  for (const s of c.source_urls || []) if (s.url && s.label !== 'Paper') out.push(`url:${normUrl(s.url)}`);
  const n = normName(c.name);
  const org = normOrg(c.institution_or_company);
  if (n && org) out.push(`person:${n}|${org}`);
  return out;
}

/**
 * Two records that share a soft key (name + organization) but carry different hard identifiers
 * (Crustdata person ids, company domains) are different entities, e.g. two "Wei Zhang"s at one company.
 */
function conflicting(a, b) {
  if (!a || !b || a.candidate_id === b.candidate_id) return false;
  const ma = a.meta || {}; const mb = b.meta || {};
  if (a.candidate_type === 'individual') {
    if (ma.mergeInto === b.candidate_id || mb.mergeInto === a.candidate_id) return false;
    if (ma.crustdata_person_id && mb.crustdata_person_id && ma.crustdata_person_id !== mb.crustdata_person_id) {
      // Same profile URL under two ids is still the same person.
      return !(ma.linkedin && mb.linkedin && normUrl(ma.linkedin) === normUrl(mb.linkedin));
    }
    return false;
  }
  const da = String(ma.domain || '').toLowerCase().replace(/^www\./, '');
  const db = String(mb.domain || '').toLowerCase().replace(/^www\./, '');
  return Boolean(da && db && da !== db && ma.crustdata_company_id !== mb.crustdata_company_id);
}

/** Can an academic-only identity be attributed to this person (same name and a matching affiliation)? */
function academicMatchesPerson(a, p) {
  if (normName(a.name) !== normName(p.name)) return false;
  const aff = a.institution_or_company;
  if (!aff) return false;
  const orgs = [p.institution_or_company, ...(p.meta?.current_roles || []).map((r) => r.org), ...(p.meta?.past_orgs || []), ...(p.meta?.schools || []).map((s) => s.school)];
  return orgs.some((o) => institutionMatches(o, aff));
}

/** Copy an academic-only identity's publications into a person, renumbering evidence ids. */
function mergeAcademic(person, academic) {
  const used = new Set((person.evidence || []).map((e) => e.id));
  let n = person.evidence.length;
  const nextId = () => { do { n += 1; } while (used.has(`E${n}`)); return `E${n}`; };
  const remap = {};
  for (const e of academic.evidence || []) {
    const id = nextId();
    remap[e.id] = id;
    person.evidence.push({ ...e, id });
  }
  const known = new Set((person.publications || []).map((p) => normText(p.title)));
  for (const p of academic.publications || []) {
    if (known.has(normText(p.title))) continue;
    person.publications.push({ ...p, evidence: (p.evidence || []).map((id) => remap[id]).filter(Boolean) });
  }
  const urls = new Set((person.source_urls || []).map((s) => normUrl(s.url)));
  for (const s of academic.source_urls || []) if (!urls.has(normUrl(s.url))) person.source_urls.push(s);
  person.meta.academicMerged = true;
  // Keep the academic identity so it can be re-merged if this person is replaced by an enriched copy.
  (person.meta.mergedAcademic ||= []).push({ ...academic, meta: { ...academic.meta, mergeInto: person.candidate_id } });
  return person;
}

/**
 * Remove duplicates, keeping the first occurrence (input order = search rank). When the kept
 * copy is not enriched but a later copy is, the enriched copy takes its place.
 * @param {object[]} list candidates of either kind
 * @returns {{unique: object[], duplicates: number}}
 */
export function dedupeCandidates(list) {
  const unique = [];
  const byKey = new Map();
  let duplicates = 0;
  const register = (c, idx) => keys(c).forEach((k) => { if (!byKey.has(k)) byKey.set(k, idx); });

  for (const c of list || []) {
    let idx = keys(c).map((k) => byKey.get(k)).find((i) => i !== undefined && !conflicting(c, unique[i]));
    if (idx === undefined && c.candidate_type === 'individual') {
      // Academic-only ↔ person attribution (either direction).
      idx = unique.findIndex((u) => (c.meta?.academicOnly && !u.meta?.academicOnly && academicMatchesPerson(c, u))
        || (u.meta?.academicOnly && !c.meta?.academicOnly && academicMatchesPerson(u, c)));
      if (idx < 0) idx = undefined;
    }
    if (idx === undefined) {
      unique.push(c);
      register(c, unique.length - 1);
      continue;
    }
    duplicates += 1;
    const kept = unique[idx];
    if (c.candidate_type === 'individual' && (kept.meta?.academicOnly || c.meta?.academicOnly)) {
      if (kept.meta?.academicOnly && !c.meta?.academicOnly) {
        c.meta.searchRank ??= kept.meta.searchRank;
        unique[idx] = mergeAcademic(c, kept);
      } else if (!kept.meta?.academicOnly) {
        mergeAcademic(kept, c);
      }
    } else if (!kept.meta?.enriched && c.meta?.enriched) {
      c.meta.searchRank = Math.min(kept.meta?.searchRank ?? Infinity, c.meta?.searchRank ?? Infinity);
      if (!Number.isFinite(c.meta.searchRank)) delete c.meta.searchRank;
      unique[idx] = c;
    }
    register(unique[idx], idx);
  }
  return { unique, duplicates };
}

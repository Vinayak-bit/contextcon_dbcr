// Organization retrieval pipeline (owned by Laptop 3), called by job.js once per results page:
//   hybrid /company/search per query (geo + size filters) → labs via web search when an
//   academic type is selected (page 1; parent institution resolved for location) → dedupe →
//   preliminary type/size/geo filter + cheap scoring → /company/enrich the top `enrichPerPage`
//   → re-verify geography (headquarters vs office), type and size.
import { unwrapMatches } from '../crustdata/index.js';
import { chunk, phraseCoverage, uniq } from '../util.js';
import { companyToCandidate, labCandidate } from './normalize.js';
import { companyGeoFilters, verifyGeo, institutionMatches } from './geography.js';
import { sizeFilter, matchOrgTypes, matchSize } from './constraints.js';
import { dedupeCandidates } from './dedupe.js';
import { findLabs } from './academic.js';

const ENRICH_FIELDS = ['basic_info', 'headcount', 'funding', 'locations', 'taxonomy'];
const FALLBACK_FIELDS = ['basic_info', 'headcount', 'locations', 'taxonomy'];
const GENERIC_HINTS = new Set(['company', 'enterprise']);

const emptyExcluded = () => ({ geography: 0, unverified_location: 0, role: 0, unverified_role: 0, org_type: 0, size: 0, duplicates: 0 });
const and = (...parts) => { const c = parts.filter(Boolean); return c.length > 1 ? { op: 'and', conditions: c } : c[0] || null; };
const isCreditsError = (e) => e?.status === 402 || e?.type === 'insufficient_credits';
const isCursorError = (e) => /cursor/i.test(e?.message || '');

const coreTopic = (spec) => spec.core_topics?.[0] || spec.org_queries?.[0] || spec.search_queries?.[0] || spec.problem_statement || '';

/** Org queries: the spec's queries interleaved with "<core topic> <type hint>" for the selected types. */
export function buildOrgQueries(spec, prefs) {
  const base = uniq(((spec.org_queries || []).length ? spec.org_queries : spec.search_queries || []).map((q) => String(q).trim()));
  const core = coreTopic(spec);
  const hints = uniq((prefs.orgTypes || []).map((t) => t.queryHint).filter((h) => h && !GENERIC_HINTS.has(h))).map((h) => `${core} ${h}`.trim());
  const out = [];
  for (let i = 0; i < Math.max(base.length, hints.length); i += 1) {
    if (base[i]) out.push(base[i]);
    if (hints[i]) out.push(hints[i]);
  }
  // Ranked company search returns a single window, so later pages need further queries.
  out.push(...(spec.related_topics || []).map((t) => String(t).trim()));
  const list = uniq(out);
  return list.length ? list : uniq([core].filter(Boolean));
}

const FILTERS_ONLY = '__filters__';
/** Topic conditions for the filters-only search (which, unlike ranked search, paginates with cursors). */
function topicFilter(spec) {
  const topics = uniq([...(spec.core_topics || []), ...(spec.specific_methods || [])].map((t) => String(t).trim()).filter(Boolean)).slice(0, 4);
  if (!topics.length) return null;
  return { op: 'or', conditions: topics.map((value) => ({ field: 'taxonomy.professional_network_specialities', type: '(.)', value })) };
}

/** Cheap pre-enrichment relevance: term overlap with the spec plus search rank. */
function prefilterScore(c, spec) {
  const terms = uniq([...(spec.core_topics || []), ...(spec.specific_methods || []), ...(spec.required_expertise || []), ...(spec.related_topics || []).slice(0, 4)]);
  const text = [c.name, c.description, ...(c.industries || []), ...(c.specializations || []), ...(c.evidence || []).slice(0, 6).map((e) => e.text)].join(' . ');
  const overlap = terms.length ? phraseCoverage(terms, text) : 0;
  const rank = Number.isFinite(c.meta?.searchRank) ? 1 / (1 + (c.meta.searchRank - 1) / 10) : 0.3;
  return 3 * overlap + 0.8 * rank;
}

/* ------------------------------------------------------------------ */
/* Crustdata calls                                                     */
/* ------------------------------------------------------------------ */
/**
 * Company search. Ranked items ({key, q}) return one window of ≤ 100 (no cursor);
 * the filters-only item ({key: FILTERS_ONLY, f}) paginates with `cursor`.
 */
async function searchCompanies(ctx, st, items, filters, fields) {
  const { limits } = ctx;
  const limit = Math.min(limits.searchLimitPerQuery, 100);
  const body = (x) => (x.key === FILTERS_ONLY
    ? { filters: x.f, limit, fields, ...(x.cursor ? { cursor: x.cursor } : {}) }
    : { search: { query: x.q, mode: 'hybrid' }, ...(x.f ? { filters: x.f } : {}), limit, fields });
  const run = (list) => ctx.crustdata.batch('companySearch', list.map(body), { sample: ctx.sample, meter: ctx.meter });

  const first = items.map((x) => ({ ...x, f: x.key === FILTERS_ONLY ? x.f : filters }));
  const results = await run(first);
  const retry = [];
  results.forEach((r, i) => {
    if (!(r instanceof Error)) return;
    const x = first[i];
    if (x.cursor && isCursorError(r)) { retry.push({ ...x, cursor: undefined, restarted: true }); return; }
    if (r.status === 400 && x.f && x.key !== FILTERS_ONLY) {
      ctx.warnings.push(`Crustdata rejected an organization-search filter (${r.message}). Geography and size are still enforced after retrieval.`);
      retry.push({ ...x, f: null });
    }
  });
  const again = retry.length ? await run(retry) : [];

  const out = [];
  const take = (x, r) => {
    if (r instanceof Error) {
      st.cursors[x.key] = null;
      if (isCreditsError(r)) { st.creditsOut = true; ctx.warnings.push('Crustdata credits ran out; showing what was retrieved so far.'); }
      else if (x.key === FILTERS_ONLY) ctx.log(`Filter-only organization search stopped: ${r.message}`);
      else ctx.warnings.push(`Organization search failed for "${x.q}": ${r.message}`);
      return;
    }
    if (x.restarted) st.offsets[x.key] = 0;
    const list = r.data?.companies || [];
    const offset = st.offsets[x.key] || 0;
    list.forEach((c, i) => out.push(companyToCandidate(c, { retrievedAt: r.retrievedAt, transport: r.transport, searchRank: offset + i + 1, origin: x.key === FILTERS_ONLY ? 'company_filter_search' : 'company_search' })));
    st.offsets[x.key] = offset + list.length;
    // Ranked search has no further window; the filters-only search follows its cursor.
    st.cursors[x.key] = x.key === FILTERS_ONLY && list.length ? r.data?.next_cursor || null : null;
  };
  first.forEach((x, i) => { if (!retry.some((y) => y.key === x.key)) take(x, results[i]); });
  retry.forEach((x, k) => take(x, again[k]));
  return out;
}

/** Company identify/enrich wrapper → Map(key → {data, retrievedAt, transport}). */
async function companyLookup(ctx, st, op, idKey, values, fields) {
  const map = new Map();
  if (!values.length || st.creditsOut) return map;
  const bodies = chunk(values, 25).map((v) => ({ [idKey]: v, ...(fields ? { fields } : {}) }));
  const results = await ctx.crustdata.batch(op, bodies, { sample: ctx.sample, meter: ctx.meter });
  const failed = [];
  results.forEach((r, i) => {
    if (r instanceof Error) {
      if (r.status === 403 && fields && fields !== FALLBACK_FIELDS) { failed.push(i); return; }
      if (isCreditsError(r)) { st.creditsOut = true; ctx.warnings.push('Crustdata credits ran out during organization enrichment.'); }
      else ctx.warnings.push(`Organization ${op === 'companyIdentify' ? 'lookup' : 'enrichment'} failed: ${r.message}`);
      return;
    }
    for (const d of unwrapMatches(r.data, 'company_data')) map.set(String(d._matched_on ?? d.crustdata_company_id), { data: d, retrievedAt: r.retrievedAt, transport: r.transport });
  });
  if (failed.length) {
    ctx.warnings.push('Some organization fields (e.g. funding) are not enabled on this Crustdata plan; enrichment continues without them.');
    const again = await ctx.crustdata.batch(op, failed.map((i) => ({ ...bodies[i], fields: FALLBACK_FIELDS })), { sample: ctx.sample, meter: ctx.meter });
    again.forEach((r) => {
      if (r instanceof Error) { ctx.warnings.push(`Organization enrichment failed: ${r.message}`); return; }
      for (const d of unwrapMatches(r.data, 'company_data')) map.set(String(d._matched_on ?? d.crustdata_company_id), { data: d, retrievedAt: r.retrievedAt, transport: r.transport });
    });
  }
  return map;
}

/** Labs from web search, with the parent institution resolved (identify, then enrich for location if needed). */
async function labCandidates(ctx, st) {
  const { spec, prefs } = ctx;
  const geo = prefs.geography;
  ctx.stage('academic', 'Searching for research labs and groups');
  const place = geo.scope === 'city' ? geo.city : geo.scope === 'country' ? geo.country : geo.scope === 'institute' ? geo.institute : (geo.countries.length === 1 ? geo.countries[0] : '');
  const core = coreTopic(spec);
  const queries = uniq([`${core} research lab ${place}`, `${core} research group university ${place}`].map((q) => q.replace(/\s+/g, ' ').trim()));
  const labs = await findLabs(ctx, queries);
  if (!labs.length) return [];

  const parents = uniq(labs.map((l) => l.parent).filter(Boolean)).slice(0, 25);
  const identified = await companyLookup(ctx, st, 'companyIdentify', 'names', parents);
  const resolved = new Map();
  for (const name of parents) {
    const hit = identified.get(name);
    // Only trust a lookup that really is the named institution.
    if (hit && institutionMatches(hit.data.basic_info?.name || '', name)) resolved.set(name, hit);
  }
  const needsLocation = geo.scope !== 'worldwide' && geo.scope !== 'institute';
  const missing = [...resolved.entries()].filter(([, h]) => !h.data.locations && h.data.crustdata_company_id).map(([n, h]) => [n, h.data.crustdata_company_id]);
  if (needsLocation && missing.length) {
    const enr = await companyLookup(ctx, st, 'companyEnrich', 'crustdata_company_ids', missing.map(([, id]) => id), ['basic_info', 'locations']);
    for (const [n, id] of missing) { const e = enr.get(String(id)); if (e) resolved.set(n, e); }
  }

  return labs.map((lab, i) => {
    const p = lab.parent && resolved.get(lab.parent);
    const pc = p ? companyToCandidate(p.data, { retrievedAt: p.retrievedAt, transport: p.transport }) : null;
    const parent = pc && (pc.headquarters || pc.hq_detail.country) ? { hq: pc.headquarters || [pc.hq_detail.city, pc.hq_detail.country].filter(Boolean).join(', '), detail: pc.hq_detail } : null;
    const c = labCandidate(lab, { retrievedAt: lab.retrievedAt, transport: lab.transport, parent });
    c.meta.searchRank = i + 1;
    if (p) c.meta.parentCompanyId = p.data.crustdata_company_id;
    return c;
  });
}

/* ------------------------------------------------------------------ */
/* Page builder                                                        */
/* ------------------------------------------------------------------ */
/**
 * Build one page of verified, enriched organization candidates.
 * @param {object} ctx pipeline context (see docs/workstreams/laptop-3/CLAUDE.md)
 * @param {object} tab persisted tab; `tab.state` survives between pages
 * @returns {Promise<{candidates: object[], excluded: object, hasMore: boolean}>}
 */
export async function retrieveOrganizationsPage(ctx, tab) {
  const st = (tab.state ||= {});
  st.cursors ||= {}; st.offsets ||= {}; st.seen ||= []; st.pool ||= [];
  const excluded = emptyExcluded();
  const { prefs, spec, limits } = ctx;
  const geo = prefs.geography;
  const allowU = Boolean(geo.allowUnverified);
  const perPage = Math.max(1, Math.min(limits.enrichPerPage || 50, 50));
  const queries = buildOrgQueries(spec, prefs);
  const seen = new Set(st.seen);
  const markSeen = (c) => { seen.add(c.candidate_id); st.seen.push(c.candidate_id); };

  // 1. Search (skipped when the pool already holds enough for a full page).
  const fresh = [];
  const filters = and(companyGeoFilters(geo), sizeFilter(prefs.sizes));
  const items = queries.filter((q) => st.cursors[q] !== null).slice(0, limits.maxQueriesPerPage).map((q) => ({ key: q, q }));
  // Once every ranked query has run, continue with a filters-only topic search (it supports cursors).
  const topic = topicFilter(spec);
  if (!items.length && topic && st.cursors[FILTERS_ONLY] !== null) items.push({ key: FILTERS_ONLY, f: and(filters, topic), cursor: st.cursors[FILTERS_ONLY] || undefined });
  if (st.pool.length < perPage && items.length && !st.creditsOut) {
    ctx.stage('searching', 'Searching organizations');
    // `locations` is free; headcount only when size or a headcount-based type must be checked.
    const needHeadcount = prefs.sizes.length > 0 || (prefs.orgTypes || []).some((t) => t.match?.minHeadcount != null || t.match?.maxHeadcount != null);
    const fields = ['crustdata_company_id', 'basic_info', 'locations', ...(needHeadcount ? ['headcount'] : [])];
    const found = await searchCompanies(ctx, st, items, filters, fields);
    fresh.push(...found);
    ctx.log(`Found ${found.length} organizations across ${items.length} search${items.length === 1 ? '' : 'es'}`);
  }

  // 2. Labs / research groups (once, when an academic organization type is selected).
  if (!st.labsDone && limits.academicWebSearch && (prefs.orgTypes || []).some((t) => t.kind === 'academic') && !st.creditsOut) {
    st.labsDone = true;
    const labs = await labCandidates(ctx, st);
    fresh.push(...labs);
    ctx.log(`Found ${labs.length} labs / research groups on the web`);
  }

  // 3. Dedupe against everything already shown/excluded and within this batch.
  ctx.stage('prefilter', 'Removing duplicates and pre-filtering');
  const considered = st.pool.length + fresh.length;
  const notSeen = [...st.pool, ...fresh].filter((c) => !seen.has(c.candidate_id));
  const { unique, duplicates } = dedupeCandidates(notSeen);
  excluded.duplicates += duplicates + (considered - notSeen.length);

  // 4. Preliminary filter on search-level data. Unverified orgs that can still be enriched stay.
  const keep = [];
  for (const c of unique) {
    const canEnrich = Boolean(c.meta?.crustdata_company_id) && !c.meta?.enrichedByUs;
    const g = verifyGeo(c, geo);
    const type = matchOrgTypes(c, prefs.orgTypes);
    const size = matchSize(c, prefs.sizes);
    if (g.status === 'mismatch') { excluded.geography += 1; markSeen(c); continue; }
    if (type.status === 'mismatch') { excluded.org_type += 1; markSeen(c); continue; }
    if (size === 'mismatch') { excluded.size += 1; markSeen(c); continue; }
    if (!allowU && !canEnrich) {
      if (g.status === 'unverified') { excluded.unverified_location += 1; markSeen(c); continue; }
      if (type.status === 'unverified') { excluded.org_type += 1; markSeen(c); continue; }
      if (size === 'unverified') { excluded.size += 1; markSeen(c); continue; }
    }
    const pending = g.status === 'unverified' || type.status === 'unverified' || size === 'unverified';
    c.meta.prefilterScore = Math.round((prefilterScore(c, spec) - (pending ? 0.5 : 0)) * 1000) / 1000;
    keep.push(c);
  }
  keep.sort((a, b) => b.meta.prefilterScore - a.meta.prefilterScore || (a.meta.searchRank ?? 1e9) - (b.meta.searchRank ?? 1e9));
  const pick = keep.slice(0, perPage);
  st.pool = keep.slice(perPage);
  ctx.log(`Pre-filter kept ${keep.length}; enriching ${pick.length}, ${st.pool.length} held for later pages`);

  // 5. Enrich the picked organizations that have a company record (labs usually don't).
  const ids = uniq(pick.map((c) => c.meta?.crustdata_company_id).filter(Boolean));
  ctx.stage('enriching', 'Retrieving organization details', { done: 0, total: ids.length });
  const enriched = await companyLookup(ctx, st, 'companyEnrich', 'crustdata_company_ids', ids, ENRICH_FIELDS);
  ctx.stage('enriching', 'Retrieving organization details', { done: ids.length, total: ids.length });
  const full = pick.map((c) => {
    const e = c.meta?.crustdata_company_id && enriched.get(String(c.meta.crustdata_company_id));
    if (!e) return c;
    const x = companyToCandidate(e.data, { retrievedAt: e.retrievedAt, transport: e.transport, origin: c.meta.origin, searchRank: c.meta.searchRank });
    x.meta.enriched = true;
    x.meta.enrichedByUs = true;
    return x;
  });

  // 6. Re-verify: geography (HQ vs office), organization type, size.
  ctx.stage('verifying', 'Checking geography, type and size constraints');
  const candidates = [];
  for (const c of full) {
    markSeen(c);
    const g = verifyGeo(c, geo);
    if (g.status === 'mismatch') { excluded.geography += 1; continue; }
    if (g.status === 'unverified' && !allowU) { excluded.unverified_location += 1; continue; }
    const type = matchOrgTypes(c, prefs.orgTypes);
    if (type.status === 'mismatch' || (type.status === 'unverified' && !allowU)) { excluded.org_type += 1; continue; }
    const size = matchSize(c, prefs.sizes);
    if (size === 'mismatch' || (size === 'unverified' && !allowU)) { excluded.size += 1; continue; }
    c.meta.geo = g;
    c.meta.orgTypeMatch = type.matched;
    c.meta.orgTypeStatus = type.status;
    c.meta.sizeStatus = size;
    if (!c.meta.labFromWeb || !c.organization_type) c.organization_type = type.label;
    candidates.push(c);
  }

  const hasMore = !st.creditsOut && (queries.some((q) => st.cursors[q] !== null) || (Boolean(topicFilter(spec)) && st.cursors[FILTERS_ONLY] !== null) || st.pool.length > 0);
  st.lastPage = { page: tab.page, considered, returned: candidates.length, pooled: st.pool.length, excluded: { ...excluded } };
  ctx.log(`Returned ${candidates.length} verified organizations; excluded ${Object.values(excluded).reduce((a, b) => a + b, 0)}`);
  return { candidates, excluded, hasMore };
}


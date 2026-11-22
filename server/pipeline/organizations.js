// v0 STUB — owned by Laptop 3, who replaces this with the full pipeline
// (type classification, lab discovery via web search, HQ vs team location …).
// Brief: docs/workstreams/laptop-3/CLAUDE.md. Keep the exported signature.
import { unwrapMatches } from '../crustdata/index.js';
import { chunk } from '../util.js';
import { companyToCandidate } from './normalize.js';
import { companyGeoFilters, verifyGeo } from './geography.js';
import { sizeFilter, matchOrgTypes, matchSize } from './constraints.js';
import { dedupeCandidates } from './dedupe.js';

const emptyExcluded = () => ({ geography: 0, unverified_location: 0, role: 0, unverified_role: 0, org_type: 0, size: 0, duplicates: 0 });
const and = (...parts) => { const c = parts.filter(Boolean); return c.length > 1 ? { op: 'and', conditions: c } : c[0] || null; };

/**
 * Build one page of verified, enriched organization candidates.
 * @returns {Promise<{candidates: object[], excluded: object, hasMore: boolean}>}
 */
export async function retrieveOrganizationsPage(ctx, tab) {
  const st = (tab.state ||= {});
  st.cursors ||= {};
  st.seen ||= [];
  const excluded = emptyExcluded();
  const { prefs, spec, limits } = ctx;
  const queries = (spec.org_queries.length ? spec.org_queries : spec.search_queries).slice(0, limits.maxQueriesPerPage);
  const filters = and(companyGeoFilters(prefs.geography), sizeFilter(prefs.sizes));

  ctx.stage('searching', 'Searching organizations');
  const live = queries.filter((q) => st.cursors[q] !== null);
  const bodies = live.map((q) => ({ search: { query: q, mode: 'hybrid' }, ...(filters ? { filters } : {}), limit: Math.min(limits.searchLimitPerQuery, 100), ...(st.cursors[q] ? { cursor: st.cursors[q] } : {}) }));
  const results = await ctx.crustdata.batch('companySearch', bodies, { sample: ctx.sample, meter: ctx.meter });
  let found = [];
  results.forEach((r, i) => {
    if (r instanceof Error) { ctx.warnings.push(`Organization search failed for "${live[i]}": ${r.message}`); st.cursors[live[i]] = null; return; }
    st.cursors[live[i]] = r.data?.next_cursor || null;
    (r.data?.companies || []).forEach((c, rank) => found.push(companyToCandidate(c, { retrievedAt: r.retrievedAt, transport: r.transport, searchRank: rank + 1 })));
  });
  ctx.log(`Found ${found.length} organizations across ${live.length} queries`);

  ctx.stage('prefilter', 'Removing duplicates and pre-filtering');
  const seen = new Set(st.seen);
  const before = found.length;
  found = found.filter((c) => !seen.has(c.candidate_id));
  const { unique, duplicates } = dedupeCandidates(found);
  excluded.duplicates = duplicates + (before - found.length);
  const pick = unique.slice(0, limits.enrichPerPage);
  pick.forEach((c) => st.seen.push(c.candidate_id));

  ctx.stage('enriching', 'Retrieving organization details', { done: 0, total: pick.length });
  const ids = pick.map((c) => c.meta.crustdata_company_id).filter(Boolean);
  const er = await ctx.crustdata.batch('companyEnrich', chunk(ids, 25).map((crustdata_company_ids) => ({ crustdata_company_ids, fields: ['basic_info', 'headcount', 'funding', 'locations', 'taxonomy'] })), { sample: ctx.sample, meter: ctx.meter });
  const enriched = new Map();
  er.forEach((r) => {
    if (r instanceof Error) { ctx.warnings.push(`Organization enrichment failed: ${r.message}`); return; }
    for (const c of unwrapMatches(r.data, 'company_data')) enriched.set(c.crustdata_company_id, companyToCandidate(c, { retrievedAt: r.retrievedAt, transport: r.transport }));
  });
  const full = pick.map((c) => enriched.get(c.meta.crustdata_company_id) || c);

  ctx.stage('verifying', 'Checking geography, type and size constraints');
  const candidates = [];
  for (const c of full) {
    const geo = verifyGeo(c, prefs.geography);
    if (geo.status === 'mismatch') { excluded.geography += 1; continue; }
    if (geo.status === 'unverified' && !prefs.geography.allowUnverified) { excluded.unverified_location += 1; continue; }
    const type = matchOrgTypes(c, prefs.orgTypes);
    if (type.status !== 'match' && !(type.status === 'unverified' && prefs.geography.allowUnverified)) { excluded.org_type += 1; continue; }
    const size = matchSize(c, prefs.sizes);
    if (size === 'mismatch' || (size === 'unverified' && !prefs.geography.allowUnverified)) { excluded.size += 1; continue; }
    c.meta.geo = geo;
    c.meta.orgTypeMatch = type.matched;
    c.organization_type = type.label;
    candidates.push(c);
  }
  const hasMore = Object.values(st.cursors).some(Boolean) || unique.length > pick.length;
  return { candidates, excluded, hasMore };
}

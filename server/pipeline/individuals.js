// v0 STUB — owned by Laptop 3, who replaces this with the full pipeline
// (academic authors, preliminary scoring, gated-field fallback, pooled pagination …).
// Brief: docs/workstreams/laptop-3/CLAUDE.md. Keep the exported signature.
import { unwrapMatches } from '../crustdata/index.js';
import { chunk } from '../util.js';
import { personToCandidate } from './normalize.js';
import { personGeoFilters, verifyGeo } from './geography.js';
import { titleFilter, matchRoles } from './constraints.js';
import { dedupeCandidates } from './dedupe.js';

const emptyExcluded = () => ({ geography: 0, unverified_location: 0, role: 0, unverified_role: 0, org_type: 0, size: 0, duplicates: 0 });
const and = (...parts) => { const c = parts.filter(Boolean); return c.length > 1 ? { op: 'and', conditions: c } : c[0] || null; };

/**
 * Build one page of verified, enriched individual candidates.
 * @returns {Promise<{candidates: object[], excluded: object, hasMore: boolean}>}
 */
export async function retrieveIndividualsPage(ctx, tab) {
  const st = (tab.state ||= { cursors: {}, seen: [] });
  const excluded = emptyExcluded();
  const { prefs, spec, limits } = ctx;
  const queries = spec.search_queries.slice(0, limits.maxQueriesPerPage);
  const filters = and(personGeoFilters(prefs.geography), titleFilter(prefs.individualTypes, prefs.customDiscipline));

  ctx.stage('searching', 'Searching professional profiles');
  const live = queries.filter((q) => st.cursors[q] !== null);
  const bodies = live.map((q) => ({ search: { query: q }, ...(filters ? { filters } : { filters: { field: 'basic_profile.name', type: 'is_not_null' } }), limit: limits.searchLimitPerQuery, ...(st.cursors[q] ? { cursor: st.cursors[q] } : {}) }));
  const results = await ctx.crustdata.batch('personSearch', bodies, { sample: ctx.sample, meter: ctx.meter });
  let found = [];
  results.forEach((r, i) => {
    if (r instanceof Error) { ctx.warnings.push(`Person search failed for "${live[i]}": ${r.message}`); st.cursors[live[i]] = null; return; }
    st.cursors[live[i]] = r.data?.next_cursor || null;
    (r.data?.profiles || []).forEach((p, rank) => found.push(personToCandidate(p, { retrievedAt: r.retrievedAt, transport: r.transport, searchRank: rank + 1 })));
  });
  ctx.log(`Found ${found.length} profiles across ${live.length} queries`);

  ctx.stage('prefilter', 'Removing duplicates and pre-filtering');
  const seen = new Set(st.seen);
  const before = found.length;
  found = found.filter((c) => !seen.has(c.candidate_id));
  const { unique, duplicates } = dedupeCandidates(found);
  excluded.duplicates = duplicates + (before - found.length);
  const pick = unique.slice(0, limits.enrichPerPage);
  pick.forEach((c) => st.seen.push(c.candidate_id));

  ctx.stage('enriching', 'Retrieving detailed profiles', { done: 0, total: pick.length });
  const fields = ['basic_profile', 'experience', 'education', 'skills', 'social_handles', ...(limits.devPlatformProfiles ? ['dev_platform_profiles'] : []), ...(limits.researchProfiles ? ['research_profiles'] : [])];
  const withUrl = pick.filter((c) => c.meta.linkedin);
  const enrichBodies = chunk(withUrl.map((c) => c.meta.linkedin), 25).map((urls) => ({ professional_network_profile_urls: urls, fields }));
  const enriched = new Map();
  const er = await ctx.crustdata.batch('personEnrich', enrichBodies, { sample: ctx.sample, meter: ctx.meter });
  er.forEach((r) => {
    if (r instanceof Error) { ctx.warnings.push(`Profile enrichment failed: ${r.message}`); return; }
    for (const p of unwrapMatches(r.data, 'person_data')) enriched.set(p._matched_on, personToCandidate(p, { retrievedAt: r.retrievedAt, transport: r.transport }));
  });
  const full = pick.map((c) => {
    const e = enriched.get(c.meta.linkedin);
    if (e) { e.meta.searchRank = c.meta.searchRank; return e; }
    return c;
  });

  ctx.stage('verifying', 'Checking geography and role constraints');
  const candidates = [];
  for (const c of full) {
    const geo = verifyGeo(c, prefs.geography);
    if (geo.status === 'mismatch') { excluded.geography += 1; continue; }
    if (geo.status === 'unverified' && !prefs.geography.allowUnverified) { excluded.unverified_location += 1; continue; }
    const role = matchRoles(c, prefs.individualTypes, prefs.customDiscipline);
    if (role.status === 'mismatch') { excluded.role += 1; continue; }
    if (role.status === 'unverified' && !prefs.geography.allowUnverified) { excluded.unverified_role += 1; continue; }
    c.meta.geo = geo;
    c.meta.roleMatch = role.matched;
    candidates.push(c);
  }
  const hasMore = Object.values(st.cursors).some(Boolean) || unique.length > pick.length;
  return { candidates, excluded, hasMore };
}

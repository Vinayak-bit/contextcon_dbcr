// Individual retrieval pipeline (owned by Laptop 3), called by job.js once per results page:
//   ranked /person/search per query (geo + role filters) → academic authors via Scholar
//   (page 1) → dedupe → preliminary filter + cheap scoring → /person/enrich only the top
//   `enrichPerPage` → re-verify geography and role on the richer data.
// Everything not enriched this page stays in `tab.state.pool` for later pages, and every
// candidate that is returned or excluded is remembered, so nobody appears on two pages.
import { unwrapMatches } from '../crustdata/index.js';
import { chunk, phraseCoverage, uniq } from '../util.js';
import { personToCandidate, academicAuthorCandidate } from './normalize.js';
import { personGeoFilters, verifyGeo } from './geography.js';
import { titleFilter, matchRoles } from './constraints.js';
import { dedupeCandidates, normUrl } from './dedupe.js';
import { findAcademicAuthors } from './academic.js';

const BASE_FIELDS = ['basic_profile', 'experience', 'education', 'skills', 'social_handles'];
const GATED_FIELDS = ['dev_platform_profiles', 'research_profiles'];
const MAX_ACADEMIC_AUTHORS = 40;
const NO_FILTER = { field: 'basic_profile.name', type: 'is_not_null' };

const emptyExcluded = () => ({ geography: 0, unverified_location: 0, role: 0, unverified_role: 0, org_type: 0, size: 0, duplicates: 0 });
const and = (...parts) => { const c = parts.filter(Boolean); return c.length > 1 ? { op: 'and', conditions: c } : c[0] || null; };
const isCreditsError = (e) => e?.status === 402 || e?.type === 'insufficient_credits';
const isCursorError = (e) => /cursor/i.test(e?.message || '');

/** Search queries for this tab: the spec's queries, plus expertise terms for `useExpertise` types. */
export function buildPersonQueries(spec, prefs) {
  const base = uniq((spec.search_queries || []).map((q) => String(q).trim()));
  const extra = (prefs.individualTypes || []).some((t) => t.useExpertise) ? (spec.required_expertise || []).slice(0, 2) : [];
  const list = uniq([...base, ...extra.map((q) => String(q).trim())]);
  return list.length ? list : uniq([spec.problem_statement].filter(Boolean)).slice(0, 1);
}

function isResearchOriented(spec, prefs) {
  return /research/i.test(spec.domain || '') || (prefs.individualTypes || []).some((t) => t.orientation === 'research');
}

/** Cheap pre-enrichment relevance: term overlap with the spec, search rank, academic signal. */
function prefilterScore(c, spec) {
  const terms = uniq([...(spec.core_topics || []), ...(spec.specific_methods || []), ...(spec.required_expertise || []), ...(spec.related_topics || []).slice(0, 4)]);
  const text = [c.headline, c.current_role, ...(c.methods_and_skills || []), ...(c.evidence || []).slice(0, 8).map((e) => e.text)].join(' . ');
  const overlap = terms.length ? phraseCoverage(terms, text) : 0;
  const rank = Number.isFinite(c.meta?.searchRank) ? 1 / (1 + (c.meta.searchRank - 1) / 10) : 0.3;
  const papers = (c.publications || []).length ? Math.min(1, c.publications.length / 3) : 0;
  const fit = FIT_BONUS[c.meta?.fit] ?? 0.2;
  return 3 * overlap + 0.8 * rank + 0.5 * papers + fit;
}

/* ------------------------------------------------------------------ */
/* Crustdata calls                                                     */
/* ------------------------------------------------------------------ */
// Search returns only these groups (a response whitelist: without it every result bills
// experience + education). `fit` is Crustdata's relevance tier for ranked search.
const SEARCH_FIELDS = ['crustdata_person_id', 'basic_profile', 'social_handles', 'fit'];
const FIT_BONUS = { strong: 1, possible: 0.4, weak: 0 };
const NICHE_LANGUAGES = ['CUDA', 'Verilog', 'SystemVerilog', 'VHDL', 'Triton', 'Rust', 'Julia', 'Haskell', 'OCaml', 'Scala', 'Elixir', 'Erlang', 'Fortran', 'MATLAB', 'Solidity', 'Zig', 'Chisel', 'MLIR', 'OpenCL', 'Assembly'];

/** Values for `in` filters on research interests / dev topics (exact stored values, so several spellings). */
function topicValues(spec) {
  const list = uniq([...(spec.core_topics || []), ...(spec.specific_methods || [])].map((t) => String(t).trim()).filter((t) => t && t.length <= 60)).slice(0, 8);
  const title = (t) => t.replace(/\b\w/g, (ch) => ch.toUpperCase());
  return { phrases: uniq(list.flatMap((t) => [t, t.toLowerCase(), title(t)])), tags: uniq(list.map((t) => t.toLowerCase().replace(/[^a-z0-9+#]+/g, '-').replace(/^-|-$/g, ''))).filter(Boolean) };
}

/**
 * Additional pulls on research / developer-platform fields (they cover < 1% of profiles, so they
 * are unioned with the main pull, never used alone). Run once, on the first page.
 */
function secondPulls(spec, prefs, baseFilters) {
  const { phrases, tags } = topicValues(spec);
  const q = (spec.search_queries || [])[0] || spec.problem_statement || '';
  const out = [];
  if (!q || !phrases.length) return out;
  if (isResearchOriented(spec, prefs)) {
    out.push({ key: '__research__', q, f: and(baseFilters, { op: 'or', conditions: [
      { field: 'research_profiles.research_interests', type: 'in', value: phrases },
      { field: 'research_profiles.articles.title', type: 'in', value: phrases },
    ] }), noFallback: true, limit: 25 });
  }
  const engineering = /engineer/i.test(spec.domain || '') || (prefs.individualTypes || []).some((t) => t.orientation !== 'research');
  if (engineering) {
    const text = `${spec.problem_statement || ''} ${(spec.specific_methods || []).join(' ')} ${(spec.required_expertise || []).join(' ')}`.toLowerCase();
    const langs = NICHE_LANGUAGES.filter((l) => new RegExp(`(^|[^a-z])${l.toLowerCase().replace(/[+]/g, '\\+')}([^a-z]|$)`).test(text));
    out.push({ key: '__dev__', q, f: and(baseFilters, { op: 'or', conditions: [
      { field: 'dev_platform_profiles.all_topics', type: 'in', value: tags },
      ...(langs.length ? [{ field: 'dev_platform_profiles.all_languages', type: 'in', value: langs }] : []),
    ] }), noFallback: true, limit: 25 });
  }
  return out;
}

/**
 * Ranked person search for several pulls. Each item: { key, q, f, cursor?, noFallback?, limit? }.
 * Top-level `mode: 'exact'` keeps hard filters exact (the default mode would OR-union them with
 * constraints read from the query text, silently broadening the user's selections).
 */
async function searchPeople(ctx, st, items, fields) {
  const { limits } = ctx;
  const body = (x) => ({ search: { query: x.q, mode: 'hybrid' }, mode: 'exact', filters: x.f || NO_FILTER, limit: Math.min(x.limit || limits.searchLimitPerQuery, limits.searchLimitPerQuery, 100), fields, ...(x.cursor ? { cursor: x.cursor } : {}) });
  const run = (list) => ctx.crustdata.batch('personSearch', list.map(body), { sample: ctx.sample, meter: ctx.meter });

  const results = await run(items);
  const retry = [];
  results.forEach((r, i) => {
    if (!(r instanceof Error)) return;
    const x = items[i];
    if (x.cursor && isCursorError(r)) { retry.push({ ...x, cursor: undefined, restarted: true }); return; }
    if (r.status === 400 && x.f && !x.noFallback) {
      ctx.warnings.push(`Crustdata rejected a person-search filter (${r.message}). Geography and role are still enforced after retrieval.`);
      retry.push({ ...x, f: null, cursor: undefined });
    }
  });
  const again = retry.length ? await run(retry) : [];

  const out = [];
  const take = (x, r) => {
    if (r instanceof Error) {
      st.cursors[x.key] = null;
      if (isCreditsError(r)) { st.creditsOut = true; ctx.warnings.push('Crustdata credits ran out; showing what was retrieved so far.'); }
      else if (x.noFallback) ctx.log(`Additional ${x.key === '__research__' ? 'research-profile' : 'developer-profile'} pull skipped: ${r.message}`);
      else if (r.status === 403) ctx.warnings.push(`Person search is not permitted on this Crustdata plan (${r.message}).`);
      else ctx.warnings.push(`Person search failed for "${x.q}": ${r.message}`);
      return;
    }
    if (x.restarted) st.offsets[x.key] = 0;
    const profiles = r.data?.profiles || [];
    const offset = st.offsets[x.key] || 0;
    profiles.forEach((p, i) => {
      const c = personToCandidate(p, { retrievedAt: r.retrievedAt, transport: r.transport, searchRank: offset + i + 1, origin: x.key === '__research__' ? 'research_profile_search' : x.key === '__dev__' ? 'dev_profile_search' : 'person_search' });
      if (p.fit) c.meta.fit = String(p.fit).toLowerCase();
      out.push(c);
    });
    st.offsets[x.key] = offset + profiles.length;
    st.cursors[x.key] = profiles.length && !x.noFallback ? r.data?.next_cursor || null : null;
  };
  items.forEach((x, i) => { if (!retry.some((y) => y.key === x.key)) take(x, results[i]); });
  retry.forEach((x, k) => take(x, again[k]));
  return out;
}

/** Scholar authors → /person/identify (Scholar `user=` URLs) → persons + academic-only identities. */
async function academicCandidates(ctx, st) {
  const { spec } = ctx;
  ctx.stage('academic', 'Searching publications for authors');
  const queries = (spec.academic_queries || []).length ? spec.academic_queries : spec.search_queries || [];
  const authors = (await findAcademicAuthors(ctx, queries)).slice(0, MAX_ACADEMIC_AUTHORS);
  if (!authors.length) return [];
  const linkable = authors.filter((a) => /[?&]user=/.test(a.author.profile_url || '')).slice(0, 25);
  const identified = new Map();
  if (linkable.length && !st.creditsOut) {
    const results = await ctx.crustdata.batch('personIdentify', chunk(linkable.map((a) => a.author.profile_url), 25).map((research_profile_urls) => ({ research_profile_urls })), { sample: ctx.sample, meter: ctx.meter });
    results.forEach((r) => {
      if (r instanceof Error) { if (isCreditsError(r)) st.creditsOut = true; ctx.warnings.push(`Matching paper authors to profiles failed: ${r.message}`); return; }
      for (const p of unwrapMatches(r.data, 'person_data')) identified.set(normUrl(p._matched_on), { p, retrievedAt: r.retrievedAt, transport: r.transport });
    });
  }
  const out = [];
  for (const a of authors) {
    const academic = academicAuthorCandidate(a.author, a.papers, { retrievedAt: a.retrievedAt, transport: a.transport });
    const hit = a.author.profile_url && identified.get(normUrl(a.author.profile_url));
    if (hit) {
      const person = personToCandidate(hit.p, { retrievedAt: hit.retrievedAt, transport: hit.transport, origin: 'academic_identify' });
      academic.meta.mergeInto = person.candidate_id;
      out.push(person);
    }
    out.push(academic);
  }
  ctx.log(`Found ${authors.length} paper authors (${identified.size} matched to professional profiles)`);
  return out;
}

/** /person/enrich in batches of ≤ 25; on 403 permission_error retry once without gated field groups. */
async function enrichPeople(ctx, st, pick) {
  const urls = uniq(pick.map((c) => c.meta?.linkedin).filter(Boolean));
  const enriched = new Map();
  if (!urls.length || st.creditsOut) return enriched;
  const { limits } = ctx;
  const gated = GATED_FIELDS.filter((f) => !st.deniedFields.includes(f) && (f === 'research_profiles' ? limits.researchProfiles : limits.devPlatformProfiles));
  const fields = (g) => [...BASE_FIELDS, ...g];
  const run = (chunks, g) => ctx.crustdata.batch('personEnrich', chunks.map((u) => ({ professional_network_profile_urls: u, fields: fields(g) })), { sample: ctx.sample, meter: ctx.meter });

  const chunks = chunk(urls, 25);
  let done = 0;
  const collect = (r) => {
    for (const p of unwrapMatches(r.data, 'person_data')) enriched.set(normUrl(p._matched_on || p.social_handles?.professional_network_identifier?.profile_url), { p, retrievedAt: r.retrievedAt, transport: r.transport });
  };
  const results = await run(chunks, gated);
  const denied = [];
  results.forEach((r, i) => {
    if (r instanceof Error) {
      if (r.status === 403 && gated.length) { denied.push({ i, r }); return; }
      if (isCreditsError(r)) { st.creditsOut = true; ctx.warnings.push('Crustdata credits ran out during enrichment; some profiles show search-level data only.'); }
      else ctx.warnings.push(`Profile enrichment failed for ${chunks[i].length} profile(s): ${r.message}`);
      return;
    }
    collect(r);
    done += chunks[i].length;
    ctx.stage('enriching', 'Retrieving detailed profiles', { done, total: urls.length });
  });
  if (denied.length) {
    const named = gated.filter((f) => denied.some(({ r }) => `${r.message} ${JSON.stringify(r.metadata || {})}`.includes(f)));
    const drop = named.length ? named : gated;
    st.deniedFields = uniq([...st.deniedFields, ...drop]);
    ctx.warnings.push(`${drop.map((f) => (f === 'research_profiles' ? 'Research profiles' : 'Developer-platform profiles')).join(' and ')} are not enabled on this Crustdata plan; enrichment continues without them.`);
    const again = await run(denied.map(({ i }) => chunks[i]), gated.filter((f) => !drop.includes(f)));
    again.forEach((r, k) => {
      if (r instanceof Error) { if (isCreditsError(r)) st.creditsOut = true; ctx.warnings.push(`Profile enrichment failed: ${r.message}`); return; }
      collect(r);
      done += chunks[denied[k].i].length;
      ctx.stage('enriching', 'Retrieving detailed profiles', { done, total: urls.length });
    });
  }
  return enriched;
}

/** Replace a search-level candidate by its enriched version, keeping rank, origin and merged papers. */
function withEnrichment(c, enriched) {
  const hit = c.meta?.linkedin && enriched.get(normUrl(c.meta.linkedin));
  if (!hit) return c;
  const e = personToCandidate(hit.p, { retrievedAt: hit.retrievedAt, transport: hit.transport, origin: c.meta.origin, searchRank: c.meta.searchRank });
  if (!e.meta.linkedin) e.meta.linkedin = c.meta.linkedin;
  const stash = c.meta.mergedAcademic || [];
  if (!stash.length) return e;
  return dedupeCandidates([e, ...stash]).unique[0];
}

/* ------------------------------------------------------------------ */
/* Page builder                                                        */
/* ------------------------------------------------------------------ */
/**
 * Build one page of verified, enriched individual candidates.
 * @param {object} ctx pipeline context (see docs/workstreams/laptop-3/CLAUDE.md)
 * @param {object} tab persisted tab; `tab.state` survives between pages
 * @returns {Promise<{candidates: object[], excluded: object, hasMore: boolean}>}
 */
export async function retrieveIndividualsPage(ctx, tab) {
  const st = (tab.state ||= {});
  st.cursors ||= {}; st.offsets ||= {}; st.seen ||= []; st.pool ||= []; st.deniedFields ||= [];
  const excluded = emptyExcluded();
  const { prefs, spec, limits } = ctx;
  const geo = prefs.geography;
  const allowU = Boolean(geo.allowUnverified);
  const perPage = Math.max(1, Math.min(limits.enrichPerPage || 50, 50));
  const queries = buildPersonQueries(spec, prefs);
  const seen = new Set(st.seen);
  const markSeen = (c) => { seen.add(c.candidate_id); st.seen.push(c.candidate_id); };

  // 1. Search (skipped when the pool already holds enough for a full page).
  const fresh = [];
  const active = queries.filter((q) => st.cursors[q] !== null).slice(0, limits.maxQueriesPerPage);
  const filters = and(personGeoFilters(geo), titleFilter(prefs.individualTypes, prefs.customDiscipline));
  const extra = st.secondPullsDone ? [] : secondPulls(spec, prefs, filters);
  if (st.pool.length < perPage && (active.length || extra.length) && !st.creditsOut) {
    ctx.stage('searching', 'Searching professional profiles');
    st.secondPullsDone = true;
    // Institute scope needs current employers at search level; otherwise basic_profile is enough.
    const fields = geo.scope === 'institute' ? [...SEARCH_FIELDS, 'experience'] : SEARCH_FIELDS;
    const items = [...active.map((q) => ({ key: q, q, f: filters, cursor: st.cursors[q] || undefined })), ...extra];
    const found = await searchPeople(ctx, st, items, fields);
    fresh.push(...found);
    ctx.log(`Found ${found.length} profiles across ${items.length} search pull${items.length === 1 ? '' : 's'}`);
  }

  // 2. Academic authors (once, research-oriented searches only).
  if (!st.academicDone && limits.academicWebSearch && isResearchOriented(spec, prefs) && !st.creditsOut) {
    st.academicDone = true;
    fresh.push(...await academicCandidates(ctx, st));
  }

  // 3. Dedupe against everything already shown/excluded and within this batch.
  ctx.stage('prefilter', 'Removing duplicates and pre-filtering');
  const considered = st.pool.length + fresh.length;
  const notSeen = [...st.pool, ...fresh].filter((c) => !seen.has(c.candidate_id) && !(c.meta?.mergeInto && seen.has(c.meta.mergeInto)));
  const { unique, duplicates } = dedupeCandidates(notSeen);
  excluded.duplicates += duplicates + (considered - notSeen.length);

  // 4. Preliminary hard-constraint filter on search-level data; unverified people with a
  //    profile URL stay (enrichment may verify them), others are decided now.
  const keep = [];
  for (const c of unique) {
    const g = verifyGeo(c, geo);
    const role = matchRoles(c, prefs.individualTypes, prefs.customDiscipline);
    const canEnrich = Boolean(c.meta?.linkedin) && !c.meta?.enriched;
    // Search-level data has no schools, so an institute "mismatch" is only final after enrichment.
    const geoPending = g.status === 'mismatch' && geo.scope === 'institute' && canEnrich;
    if (g.status === 'mismatch' && !geoPending) { excluded.geography += 1; markSeen(c); continue; }
    if (role.status === 'mismatch') { excluded.role += 1; markSeen(c); continue; }
    if (g.status === 'unverified' && !allowU && !canEnrich) { excluded.unverified_location += 1; markSeen(c); continue; }
    if (role.status === 'unverified' && !allowU && !canEnrich) { excluded.unverified_role += 1; markSeen(c); continue; }
    c.meta.prefilterScore = Math.round((prefilterScore(c, spec) - (geoPending ? 1 : g.status === 'unverified' || role.status === 'unverified' ? 0.5 : 0)) * 1000) / 1000;
    keep.push(c);
  }
  keep.sort((a, b) => b.meta.prefilterScore - a.meta.prefilterScore || (a.meta.searchRank ?? 1e9) - (b.meta.searchRank ?? 1e9));
  const pick = keep.slice(0, perPage);
  st.pool = keep.slice(perPage);
  ctx.log(`Pre-filter kept ${keep.length}; enriching ${pick.length}, ${st.pool.length} held for later pages`);

  // 5. Enrich only the picked candidates.
  ctx.stage('enriching', 'Retrieving detailed profiles', { done: 0, total: pick.filter((c) => c.meta?.linkedin).length });
  const enriched = await enrichPeople(ctx, st, pick);
  const full = pick.map((c) => withEnrichment(c, enriched));

  // 6. Re-verify on the richer data; only constraint-satisfying candidates are returned.
  ctx.stage('verifying', 'Checking geography and role constraints');
  const candidates = [];
  for (const c of full) {
    markSeen(c);
    if (c.meta.mergeInto) seen.add(c.meta.mergeInto);
    const g = verifyGeo(c, geo);
    if (g.status === 'mismatch') { excluded.geography += 1; continue; }
    if (g.status === 'unverified' && !allowU) { excluded.unverified_location += 1; continue; }
    const role = matchRoles(c, prefs.individualTypes, prefs.customDiscipline);
    if (role.status === 'mismatch') { excluded.role += 1; continue; }
    if (role.status === 'unverified' && !allowU) { excluded.unverified_role += 1; continue; }
    c.meta.geo = g;
    c.meta.roleMatch = role.matched;
    c.meta.roleStatus = role.status;
    delete c.meta.mergedAcademic;
    candidates.push(c);
  }

  const hasMore = !st.creditsOut && (queries.some((q) => st.cursors[q] !== null) || st.pool.length > 0);
  delete st.cursors.__research__; delete st.cursors.__dev__;
  st.lastPage = { page: tab.page, considered, returned: candidates.length, pooled: st.pool.length, excluded: { ...excluded } };
  ctx.log(`Returned ${candidates.length} verified people; excluded ${Object.values(excluded).reduce((a, b) => a + b, 0)}`);
  return { candidates, excluded, hasMore };
}

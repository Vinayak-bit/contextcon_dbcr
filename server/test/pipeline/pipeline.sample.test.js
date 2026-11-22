// Integration tests for the retrieval pipeline (Laptop 3): runs retrieveIndividualsPage /
// retrieveOrganizationsPage page by page on offline sample data, and against a stub
// gateway to exercise error handling (403 gated fields, 402 credits, expired cursors).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.CRUSTDATA_TRANSPORT = 'sample';
process.env.DEEPSEEK_API_KEY = '';
process.env.JEV_API_KEY = '';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'overlap-l3-'));

const { crustdata, Meter } = await import('../../crustdata/index.js');
const { resolvePrefs } = await import('../../pipeline/prefs.js');
const { heuristicTopic } = await import('../../llm/topic.js');
const { retrieveIndividualsPage } = await import('../../pipeline/individuals.js');
const { retrieveOrganizationsPage } = await import('../../pipeline/organizations.js');
const { verifyGeo } = await import('../../pipeline/geography.js');
const { matchRoles, matchOrgTypes, matchSize } = await import('../../pipeline/constraints.js');

const description = 'Research on reducing KV-cache memory overhead in long-context LLM inference with paged attention on GPUs';
const base = { category: 'professor', description, links: [], spec: heuristicTopic(description).spec, objectives: ['Research collaborators / Co-authors'], preferences: {}, sizes: [], individualTypes: [], orgTypes: [] };
const LIMITS = { searchLimitPerQuery: 40, maxQueriesPerPage: 4, enrichPerPage: 50, researchProfiles: true, devPlatformProfiles: true, academicWebSearch: true };

function makeCtx(request, { gateway = crustdata, limits = {}, profile = null, organization = null } = {}) {
  return {
    jobId: 'j_test', spec: request.spec, request, prefs: resolvePrefs(request, profile, organization), userProfile: profile, organization,
    sample: true, crustdata: gateway, meter: new Meter(), limits: { ...LIMITS, ...limits },
    stages: [], stage(key) { this.stages.push(key); }, log() {}, warnings: [], llm: { enabled: false },
  };
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/** Build up to `pages` pages and check every contract invariant on each. */
async function runPages(ctx, retrieve, pages, check) {
  const tab = { state: {}, page: 0 };
  const shown = new Set();
  const all = [];
  for (let p = 1; p <= pages; p += 1) {
    tab.page = p;
    const r = await retrieve(ctx, tab);
    assert.ok(Array.isArray(r.candidates) && typeof r.hasMore === 'boolean');
    assert.deepEqual(Object.keys(r.excluded).sort(), ['duplicates', 'geography', 'org_type', 'role', 'size', 'unverified_location', 'unverified_role']);
    assert.ok(r.candidates.length <= ctx.limits.enrichPerPage);
    const lp = tab.state.lastPage;
    assert.equal(lp.considered, r.candidates.length + sum(r.excluded) + lp.pooled, `page ${p}: exclusion counts add up`);
    for (const c of r.candidates) {
      assert.ok(!shown.has(c.candidate_id), `page ${p}: ${c.candidate_id} repeated`);
      shown.add(c.candidate_id);
      assert.ok(c.meta.retrievedAt && c.meta.transport, 'retrieval metadata');
      assert.ok(c.meta.geo && c.meta.geo.status !== 'mismatch');
      if (!ctx.prefs.geography.allowUnverified) assert.notEqual(c.meta.geo.status, 'unverified');
      assert.deepEqual(verifyGeo(c, ctx.prefs.geography).status, c.meta.geo.status);
      check?.(c);
    }
    all.push(r);
    if (!r.hasMore) break;
  }
  assert.ok(JSON.parse(JSON.stringify(tab.state)), 'tab.state is JSON-serializable');
  return { pages: all, tab };
}

test('individuals: country restriction, role types, academic authors, no repeats across pages', async () => {
  const req = { ...base, target: 'individuals', individualTypes: ['professors', 'phd_students', 'industry_research_scientists'], geography: { option: 'specific', countries: ['India'], allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req);
  const { pages } = await runPages(ctx, retrieveIndividualsPage, 3, (c) => {
    assert.equal(c.location_detail.country, 'India');
    const role = matchRoles(c, ctx.prefs.individualTypes);
    assert.equal(role.status, 'match');
    assert.ok(c.meta.roleMatch.length > 0);
    assert.ok(Number.isFinite(c.meta.searchRank));
  });
  assert.ok(pages[0].candidates.length > 0);
  assert.ok(pages[0].candidates.every((c) => c.meta.enriched), 'returned people are enriched');
  assert.ok(pages.length >= 2, 'more than one page is available');
  assert.ok(ctx.stages.includes('academic'), 'research-oriented search runs Scholar discovery');
  assert.ok(pages[0].excluded.unverified_location > 0, 'academic-only identities without a location are excluded without permission');
});

test('individuals: allowUnverified keeps academic-only identities, labelled unverified', async () => {
  const req = { ...base, target: 'individuals', individualTypes: ['professors'], geography: { option: 'worldwide', allowUnverified: true, preferProximity: false } };
  const ctx = makeCtx(req);
  const { pages } = await runPages(ctx, retrieveIndividualsPage, 1);
  const academic = pages[0].candidates.filter((c) => c.meta.academicOnly);
  assert.ok(academic.length > 0);
  for (const c of academic) {
    assert.equal(c.meta.geo.status, 'not_required');
    assert.equal(c.meta.roleStatus, 'unverified');
    assert.ok(c.publications.length > 0 && c.evidence.length > 0);
  }
});

test('individuals: institute scope only returns verified affiliations', async () => {
  const req = { ...base, target: 'individuals', individualTypes: ['professors', 'phd_students'], geography: { option: 'my_institute', institute: 'Westbrook University', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { limits: { academicWebSearch: false } });
  const { pages } = await runPages(ctx, retrieveIndividualsPage, 2, (c) => assert.equal(c.meta.geo.basis, 'institution'));
  assert.ok(pages[0].candidates.length > 0);
});

test('individuals: pool carries candidates to later pages and limits enrichment', async () => {
  const req = { ...base, target: 'individuals', individualTypes: ['professors', 'research_engineers'], geography: { option: 'worldwide', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { limits: { enrichPerPage: 10, academicWebSearch: false } });
  const { pages, tab } = await runPages(ctx, retrieveIndividualsPage, 3);
  assert.ok(pages.every((p) => p.candidates.length <= 10));
  assert.ok(pages.length === 3 && pages.every((p) => p.hasMore));
  assert.ok(tab.state.pool.length > 0);
  // Page 2 is served from the pool without new searches.
  assert.ok(ctx.meter.byOp.personSearch.calls <= 4 * 2);
});

test('organizations: types, sizes and country are hard constraints; labs come from web search', async () => {
  const req = { ...base, category: 'company', target: 'organizations', orgTypes: ['startups', 'specialized_labs'], sizes: ['11-50', '51-200'], geography: { option: 'same_country', country: 'Germany', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req);
  const { pages } = await runPages(ctx, retrieveOrganizationsPage, 3, (c) => {
    assert.equal(matchOrgTypes(c, ctx.prefs.orgTypes).status, 'match');
    assert.equal(matchSize(c, ctx.prefs.sizes), 'match');
    assert.ok(c.employee_count >= 11 && c.employee_count <= 200);
    assert.ok(c.organization_type);
    assert.ok(['headquarters', 'office', 'parent_institution'].includes(c.meta.geo.basis));
  });
  assert.ok(pages[0].candidates.length > 0);
  assert.ok(pages[0].excluded.org_type > 0, 'type mismatches are excluded and counted');
  assert.ok(ctx.meter.byOp.webSearch?.calls > 0, 'academic type triggers lab discovery');
});

test('organizations: worldwide labs are kept and labelled as labs', async () => {
  const req = { ...base, target: 'organizations', orgTypes: ['universities', 'specialized_labs', 'tech_companies'], geography: { option: 'worldwide', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req);
  const { pages } = await runPages(ctx, retrieveOrganizationsPage, 2);
  const labs = pages.flatMap((p) => p.candidates).filter((c) => c.meta.labFromWeb);
  assert.ok(labs.length > 0);
  assert.ok(labs.every((l) => l.organization_type === 'Academic Research Laboratory' && l.source_urls.length));
});

/* ------------------------------------------------------------------ */
/* Error handling with a stub gateway                                  */
/* ------------------------------------------------------------------ */
function stubGateway(handler) {
  const calls = [];
  return {
    calls,
    async batch(op, bodies, opts) {
      const out = [];
      for (const body of bodies) {
        calls.push({ op, body });
        const res = await handler(op, body, calls);
        out.push(res instanceof Error ? res : { data: res, credits: 0, cached: false, retrievedAt: '2026-11-22T10:00:00.000Z', transport: 'rest' });
      }
      return out;
    },
  };
}
const err = (status, message, type) => Object.assign(new Error(message), { status, type });
const isSecondPull = (body) => /research_profiles|dev_platform_profiles/.test(JSON.stringify(body.filters || {}));
const profile = (i) => ({
  crustdata_person_id: 1000 + i,
  basic_profile: { name: `Person ${i}`, headline: 'Research Engineer · KV cache', current_title: 'Research Engineer', location: { city: 'Berlin', country: 'Germany' } },
  experience: { employment_details: { current: [{ name: 'Acme', title: 'Research Engineer' }] } },
  social_handles: { professional_network_identifier: { profile_url: `https://example.com/p/${i}` } },
});

test('gated fields: 403 permission_error retries once without them, warns, remembers for the job', async () => {
  const gw = stubGateway((op, body) => {
    if (op === 'personSearch') return { profiles: [1, 2, 3].map(profile), next_cursor: body.cursor ? null : 'c1' };
    if (op === 'personEnrich') {
      if (body.fields.includes('research_profiles')) return err(403, 'Access denied to fields: research_profiles', 'permission_error');
      return body.professional_network_profile_urls.map((u) => ({ matched_on: u, matches: [{ confidence_score: 1, person_data: { ...profile(Number(u.split('/').pop())), skills: { professional_network_skills: ['CUDA'] } } }] }));
    }
    return { results: [] };
  });
  const req = { ...base, category: 'student', target: 'individuals', individualTypes: ['pro_engineers', 'research_scientists'], geography: { option: 'worldwide', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { gateway: gw, limits: { academicWebSearch: false, maxQueriesPerPage: 1 } });
  const tab = { state: {}, page: 1 };
  const r = await retrieveIndividualsPage(ctx, tab);
  assert.equal(r.candidates.length, 3);
  assert.ok(r.candidates.every((c) => c.meta.enriched && c.methods_and_skills.includes('CUDA')));
  assert.deepEqual(tab.state.deniedFields, ['research_profiles']);
  assert.ok(ctx.warnings.some((w) => /Research profiles are not enabled/.test(w)));
  const enrichCalls = gw.calls.filter((c) => c.op === 'personEnrich');
  assert.equal(enrichCalls.length, 2);
  assert.ok(enrichCalls[1].body.fields.includes('dev_platform_profiles') && !enrichCalls[1].body.fields.includes('research_profiles'));
});

test('expired cursor reruns the query and skips people already seen', async () => {
  let n = 0;
  const gw = stubGateway((op, body) => {
    if (op !== 'personSearch') return [];
    if (isSecondPull(body)) return { profiles: [], next_cursor: null };
    n += 1;
    if (body.cursor) return err(400, 'Invalid cursor');
    return n === 1 ? { profiles: [1, 2].map(profile), next_cursor: 'stale' } : { profiles: [1, 2, 3].map(profile), next_cursor: null };
  });
  const req = { ...base, category: 'student', target: 'individuals', individualTypes: ['pro_engineers', 'research_scientists'], geography: { option: 'worldwide', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { gateway: gw, limits: { academicWebSearch: false, maxQueriesPerPage: 1 } });
  const tab = { state: {}, page: 1 };
  const p1 = await retrieveIndividualsPage(ctx, tab);
  tab.page = 2;
  const p2 = await retrieveIndividualsPage(ctx, tab);
  assert.equal(p1.candidates.length, 2);
  assert.deepEqual(p2.candidates.map((c) => c.name), ['Person 3']);
  assert.equal(p2.excluded.duplicates, 2);
});

test('402 insufficient credits stops retrieval with a warning and hasMore=false', async () => {
  const gw = stubGateway((op) => (op === 'companySearch' ? err(402, 'Insufficient credits', 'insufficient_credits') : { results: [] }));
  const req = { ...base, category: 'student', target: 'organizations', orgTypes: ['startups'], geography: { option: 'worldwide', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { gateway: gw });
  const r = await retrieveOrganizationsPage(ctx, { state: {}, page: 1 });
  assert.equal(r.candidates.length, 0);
  assert.equal(r.hasMore, false);
  assert.ok(ctx.warnings.some((w) => /credits ran out/.test(w)));
});

test('a rejected filter (400) is retried without filters and constraints are still enforced', async () => {
  const gw = stubGateway((op, body) => {
    if (op === 'personSearch') {
      if (body.filters?.op || body.filters?.type === 'in') return err(400, 'Unsupported field');
      return { profiles: [1, 2].map(profile).concat([{ ...profile(9), basic_profile: { ...profile(9).basic_profile, location: { city: 'Paris', country: 'France' } } }]), next_cursor: null };
    }
    if (op === 'personEnrich') return [];
    return { results: [] };
  });
  const req = { ...base, category: 'student', target: 'individuals', individualTypes: ['pro_engineers'], geography: { option: 'specific', countries: ['Germany'], allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { gateway: gw, limits: { academicWebSearch: false, maxQueriesPerPage: 1 } });
  const r = await retrieveIndividualsPage(ctx, { state: {}, page: 1 });
  assert.deepEqual(r.candidates.map((c) => c.location_detail.country), ['Germany', 'Germany']);
  assert.equal(r.excluded.geography, 1);
  assert.ok(ctx.warnings.some((w) => /rejected a person-search filter/.test(w)));
});

/* ------------------------------------------------------------------ */
/* Request shapes verified against the live Crustdata MCP              */
/* ------------------------------------------------------------------ */
test('person search: exact mode, response fields, research + developer second pulls', async () => {
  const gw = stubGateway((op, body) => {
    if (op === 'personSearch') return { profiles: isSecondPull(body) ? [] : [{ ...profile(1), fit: 'strong' }, profile(2)], next_cursor: null };
    if (op === 'personEnrich') return [];
    return { results: [] };
  });
  const req = { ...base, target: 'individuals', individualTypes: ['research_engineers'], geography: { option: 'specific', countries: ['Germany'], allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { gateway: gw, limits: { academicWebSearch: false } });
  const tab = { state: {}, page: 1 };
  const r = await retrieveIndividualsPage(ctx, tab);
  const searches = gw.calls.filter((c) => c.op === 'personSearch');
  for (const { body } of searches) {
    assert.equal(body.mode, 'exact');
    assert.equal(body.search.mode, 'hybrid');
    assert.deepEqual(body.fields, ['crustdata_person_id', 'basic_profile', 'social_handles', 'fit']);
    assert.ok(!('sorts' in body));
  }
  const pulls = searches.filter((c) => isSecondPull(c.body)).map((c) => JSON.stringify(c.body.filters));
  assert.ok(pulls.some((f) => f.includes('research_profiles.research_interests') && f.includes('"in"')));
  assert.ok(pulls.some((f) => f.includes('dev_platform_profiles.all_topics')));
  assert.ok(pulls.every((f) => f.includes('basic_profile.location.country')), 'second pulls keep the hard filters');
  assert.equal(r.candidates.find((c) => c.name === 'Person 1').meta.fit, 'strong');
  // Second pulls run once, not on every page.
  tab.page = 2;
  await retrieveIndividualsPage(ctx, tab);
  assert.equal(gw.calls.filter((c) => c.op === 'personSearch' && isSecondPull(c.body)).length, pulls.length);
});

test('institute scope requests experience at search level', async () => {
  const gw = stubGateway((op) => (op === 'personSearch' ? { profiles: [], next_cursor: null } : op === 'personEnrich' ? [] : { results: [] }));
  const req = { ...base, target: 'individuals', individualTypes: ['professors'], geography: { option: 'my_institute', institute: 'MIT', allowUnverified: false, preferProximity: false } };
  await retrieveIndividualsPage(makeCtx(req, { gateway: gw, limits: { academicWebSearch: false } }), { state: {}, page: 1 });
  assert.ok(gw.calls.filter((c) => c.op === 'personSearch').every((c) => c.body.fields.includes('experience')));
});

test('company search: one ranked window per query (no cursor), then filters-only search with cursors', async () => {
  let id = 0;
  const company = (country = 'Germany') => ({ crustdata_company_id: ++id, basic_info: { name: `Co ${id}`, industries: ['Software Development'], company_type: 'Privately Held', description: 'KV cache inference software' }, headcount: { total: 30 }, locations: { country, city: 'Berlin' } });
  const gw = stubGateway((op, body) => {
    if (op === 'companySearch') {
      if (body.search && body.cursor) return err(400, 'cursor is not supported with search');
      if (body.search) return { companies: [company(), company()], next_cursor: 'ignored' };
      return { companies: [company()], next_cursor: body.cursor === 'f2' ? null : body.cursor ? 'f2' : 'f1' };
    }
    if (op === 'companyEnrich') return [];
    return { results: [] };
  });
  const spec = { ...base.spec, org_queries: ['kv cache inference'], related_topics: ['paged attention'], core_topics: ['kv cache'] };
  const req = { ...base, spec, category: 'company', target: 'organizations', orgTypes: ['startups'], sizes: ['11-50'], geography: { option: 'same_country', country: 'Germany', allowUnverified: false, preferProximity: false } };
  const ctx = makeCtx(req, { gateway: gw, limits: { maxQueriesPerPage: 10, enrichPerPage: 3 } });
  const tab = { state: {}, page: 0 };
  const seen = new Set();
  for (let p = 1; p <= 8; p += 1) {
    tab.page = p;
    const r = await retrieveOrganizationsPage(ctx, tab);
    r.candidates.forEach((c) => { assert.ok(!seen.has(c.candidate_id)); seen.add(c.candidate_id); });
    if (!r.hasMore) break;
  }
  const searches = gw.calls.filter((c) => c.op === 'companySearch').map((c) => c.body);
  const ranked = searches.filter((b) => b.search);
  const filtersOnly = searches.filter((b) => !b.search);
  assert.ok(ranked.every((b) => !('cursor' in b) && b.search.mode === 'hybrid' && b.limit <= 100));
  assert.ok(ranked.every((b) => b.fields.includes('locations') && b.fields.includes('headcount')));
  assert.ok(ranked.some((b) => b.search.query === 'paged attention'), 'related topics feed later pages');
  assert.deepEqual(filtersOnly.map((b) => b.cursor), [undefined, 'f1', 'f2']);
  assert.ok(filtersOnly.every((b) => JSON.stringify(b.filters).includes('taxonomy.professional_network_specialities')));
  assert.ok(ctx.warnings.every((w) => !/cursor/.test(w)));
});

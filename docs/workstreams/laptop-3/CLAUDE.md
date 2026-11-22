# Laptop 3 — Retrieval pipeline (backend)

You build the part of the backend that turns a user's validated project + explicit preferences into
**verified, enriched, normalized candidates**: Crustdata query building, person/company search,
academic discovery (paper authors, labs), deduplication, preliminary filtering, enrichment, and
**hard enforcement** of geography, candidate-type and size constraints. Ranking happens after you
(Laptop 4's code); the UIs are other laptops.

You start with zero context, so read these first (≈25 min):

1. `/CLAUDE.md` and `docs/PLAN.md`.
2. `docs/PRODUCT_SPEC.md` sections **6, 7 (all, esp. Geography Rules), 8, 11, 13**.
3. `shared/catalog.js` — `INDIVIDUAL_TYPES` (with `titles`), `ORG_TYPES` (with `kind`, `queryHint`, `match`), `ORG_SIZES`,
   `GEO_SCOPES`, `REGIONS`, `COUNTRIES`, `RESEARCH_HUBS`. These are the mappings from UI checkboxes to retrieval logic.
4. `server/crustdata/index.js` (gateway: `crustdata.call/batch`, `unwrapMatches`, `Meter`), `server/crustdata/sample.js`
   (offline data — read it to know what sample responses look like).
5. `server/pipeline/normalize.js` — `personToCandidate`, `academicAuthorCandidate`, `companyToCandidate`, `labCandidate`.
   **Always build candidates with these** (they create the evidence ids everything downstream relies on).
6. `server/pipeline/job.js` — how your functions are called (read-only for you).
7. `web/src/api/types.ts` — `Candidate`, `CandidateMeta`, `GeoCheck`, `ExcludedCounts`, `GeographyPref`, `SearchRequest`.

## You own (and only edit)

```
server/pipeline/geography.js
server/pipeline/constraints.js
server/pipeline/individuals.js
server/pipeline/organizations.js
server/pipeline/academic.js
server/pipeline/dedupe.js
server/test/pipeline/**          (tests + fixtures)
```

Not yours: `normalize.js`, `job.js`, `prefs.js` (Laptop 4), `server/crustdata/*`, `server/llm/*`, `server/ranking/*`,
`shared/*`. v0 stub versions of your files exist so the app runs end-to-end — **replace them**; keep exported names
and signatures. Need a contract change? Append to `docs/CHANGE_REQUESTS.md`.

## Function contracts (keep these exact signatures)

```js
// geography.js
resolveGeography(pref /* GeographyPref */, userProfile /* UserProfile|null */, organization /* OrgProfile|null */)
  → ResolvedGeo  // { option, scope: 'institute'|'city'|'country'|'countries'|'hubs'|'worldwide', institute?, city?, country?,
                 //   countries: string[], hubs: {id,label,country,cities[]}[], label: string, allowUnverified, preferProximity }
                 // throws ValidationError (from server/util.js HttpError(400,…)) when a required value is missing
personGeoFilters(geo)  → Filter | null     // Crustdata /person/search filter fragment
companyGeoFilters(geo) → Filter | null     // Crustdata /company/search filter fragment
verifyGeo(candidate, geo) → GeoCheck       // { status: 'verified'|'unverified'|'mismatch'|'not_required', basis, detail }
proximityScore(candidate, userProfile, geo) → { score: number /*0–5*/, reason: string } | null   // null = can't compute
canonCountry(str) → string,  canonCity(str) → string,  institutionMatches(a, b) → boolean

// constraints.js
titleFilter(individualTypes /* resolved [{id,label,titles}] */, customDiscipline) → Filter | null
matchRoles(candidate, individualTypes, customDiscipline) → { status: 'match'|'mismatch'|'unverified', matched: string[] }
matchOrgTypes(candidate, orgTypes /* resolved [{id,label,kind,match}] */) → { status: 'match'|'mismatch'|'unverified', matched: string[], label: string }
sizeFilter(sizes /* resolved [{id,min,max}] */) → Filter | null
matchSize(candidate, sizes) → 'match'|'mismatch'|'unverified'

// individuals.js / organizations.js — called by job.js once per results page
retrieveIndividualsPage(ctx, tab)   → Promise<{ candidates: Candidate[], excluded: ExcludedCounts, hasMore: boolean }>
retrieveOrganizationsPage(ctx, tab) → Promise<{ candidates: Candidate[], excluded: ExcludedCounts, hasMore: boolean }>

// academic.js
findAcademicAuthors(ctx, queries) → Promise<{ author: {name, profile_url?, affiliation?}, papers: Paper[] }[]>
findLabs(ctx, queries)            → Promise<Lab[]>   // {name, parent?, url, snippet, location?}

// dedupe.js
dedupeCandidates(list) → { unique: Candidate[], duplicates: number }   // works for both kinds
```

### `ctx` (built by job.js — read-only)
```js
{
  jobId, spec /* ProjectSpec */, request /* SearchRequest */,
  prefs: {
    target, individualTypes: [{id,label,titles,orientation,useExpertise}], orgTypes: [{id,label,kind,queryHint,match}],
    customDiscipline, sizes: [{id,label,min,max}] /* [] = any */, geography /* ResolvedGeo from resolveGeography */,
    objectives: string[], preferences: {}, individualTypeLabels: string[], orgTypeLabels: string[],
  },
  userProfile, organization,
  sample: boolean,              // pass to every crustdata call: crustdata.call(op, body, { sample: ctx.sample, meter: ctx.meter })
  crustdata, meter,             // gateway + credit meter
  limits: { searchLimitPerQuery, maxQueriesPerPage, enrichPerPage, researchProfiles, devPlatformProfiles, academicWebSearch },
  stage(key, label, progress?), // update the progress UI: keys 'searching'|'academic'|'prefilter'|'enriching'|'verifying'
  log(message),                 // short human-readable progress line
  warnings: string[],           // push user-visible warnings (e.g. "research profiles not enabled on this Crustdata plan")
  llm: { enabled, chatJson },   // DeepSeek helper (server/llm/deepseek.js) for e.g. extracting lab names; always have a heuristic fallback
}
```

### `tab` (persisted between pages — you decide its contents)
`tab.page` is the 1-based page being built. Store anything you need between pages in `tab.state` (must be
JSON-serializable): per-query Crustdata `next_cursor`s, the not-yet-enriched pool, seen ids, whether academic
search already ran. **A candidate must never appear on two pages.**

### Returned candidates must
- be built with `normalize.js` helpers, enriched where possible (`meta.enriched`), at most `ctx.limits.enrichPerPage` (≤ 50);
- **pass every hard constraint**: geography (`meta.geo = verifyGeo(...)`; `mismatch` never returned; `unverified` only
  when `prefs.geography.allowUnverified`), role/type (`meta.roleMatch` for people; `meta.orgTypeMatch` + set
  `candidate.organization_type` label for orgs; `unverified` only when allowUnverified), size (orgs; `unverified` size only
  when allowUnverified);
- carry `meta.retrievedAt` / `meta.transport` (from the gateway response) and `meta.searchRank`.
- `excluded` counts every candidate you dropped, by reason (`geography`, `unverified_location`, `role`, `unverified_role`,
  `org_type`, `size`, `duplicates`).

## Required behaviour (spec §7)

**Individuals**
1. Queries: `spec.search_queries` (exact + adjacent), up to `limits.maxQueriesPerPage` per page. Add expertise terms for
   `useExpertise` types; add `customDiscipline` as an extra title phrase.
2. `/person/search` per query using ranked search: `{ search: { query }, filters, limit, fields, cursor? }` where
   `filters = and(geoFilter, titleFilter)` (omit null parts). Run queries concurrently with `crustdata.batch`.
3. Research-oriented (spec.domain includes Research, or any selected type has orientation `research`) and
   `limits.academicWebSearch`: on page 1 call `/web/search/live` with `sources: ['scholar-articles']` for up to 2
   `spec.academic_queries`; extract authors; match Google Scholar author URLs to people with `/person/identify`
   (`research_profile_urls`, ≤ 25 per call); unmatched authors become **academic-only identities**
   (`academicAuthorCandidate`) — keep them (they're `unverified` for location/role unless worldwide + allowUnverified rules say otherwise).
4. Dedupe (Crustdata id, profile URL, normalized name + org); academic-only identity merges into a matching person.
5. **Preliminary filter before enrichment** (spec §13): drop search results that already fail geography/role using the
   search-level fields; score the rest cheaply (search rank + term overlap of headline/title/skills with the spec) and
   enrich only the top `enrichPerPage`; keep the remainder in `tab.state.pool` for later pages.
6. `/person/enrich` in batches of ≤ 25 URLs with fields `basic_profile, experience, education, skills, social_handles`
   + `dev_platform_profiles` and `research_profiles` when the limits allow. On **403 `permission_error`** naming denied
   fields, retry once without the gated groups, remember that for the job, and push a warning.
7. Re-verify geography and role on the enriched data (it is richer than search data), then return.

**Organizations**
1. `/company/search` with `search: { query, mode: 'hybrid' }` for `spec.org_queries` (+ each selected type's `queryHint`
   when it adds signal), filters = `and(companyGeoFilters(geo), sizeFilter(sizes))`.
2. If any selected org type has `kind: 'academic'`: `findLabs` via `/web/search/live` (`sources: ['web']`, queries like
   "<core topic> research lab"), extract lab/group name + parent institution (LLM via `ctx.llm.chatJson` with heuristic
   fallback), resolve the parent with `/company/identify` (`names`) to get a verified location (`basis: 'parent_institution'`).
   **Labs are often not company records** — never require one.
3. Dedupe (company id, domain, normalized name). Classify with `matchOrgTypes`; enforce sizes with `matchSize`.
4. Enrich top candidates with `/company/enrich` (`crustdata_company_ids`, ≤ 25 per call) fields
   `basic_info, headcount, funding, locations, taxonomy`.
5. Geography: **distinguish headquarters vs. relevant team/office location** — verified if HQ matches (`basis:
   'headquarters'`) or a listed office matches (`basis: 'office'`); say which in `detail`.

**Geography rules (hard filter, before ranking)**
- `worldwide` → `not_required`. `countries` → candidate country ∈ set (canonicalized; region names expand via `REGIONS`).
  `country` → same with one country. `city` → city match (aliases: Bangalore/Bengaluru, Bombay/Mumbai, NYC/New York,
  Gurgaon/Gurugram, München/Munich…) and, if both known, same country. `hubs` → any hub's city list + country.
  `institute` → **verified institutional affiliation** (current employer or school matches the institute name via
  `institutionMatches`, handling acronyms like "MIT", "BITS Pilani"), not location.
- No location data → `unverified` → excluded unless `allowUnverified`.
- `proximityScore`: same institution 5, same city 4, same state/region 3.5, same country 3, otherwise inside the selected
  area 2; return `null` when the user's own location/institution is unknown.

## Crustdata API reference (what you need)

Base `https://api.crustdata.com`, header `x-api-version: 2025-11-01` (the gateway handles transport, auth, caching,
retries and rate limits — you only build bodies and read responses).

**Filters**: a condition `{ field, type, value }` or a group `{ op: 'and'|'or', conditions: [...] }` (groups nest).
Operators: `=`, `!=`, `<`, `=<`, `>`, `=>` (**not** `>=`/`<=`), `in`, `not_in`, `is_null`, `is_not_null`, `(.)` (fuzzy:
all words, any order, case-insensitive), `[.]` (exact phrase), `(!)` (fuzzy exclude). `=`/`in` compare the **whole**
value — use `(.)` for titles, names, cities.

**`/person/search`** body keys: `filters` (required), `search: { query }` (ranked; no `sorts` then), `limit` (≤ 100 ranked),
`cursor`, `fields`. Useful filter fields: `basic_profile.name`, `basic_profile.headline`, `basic_profile.location.city|state|country|full_location`
(country = full English name), `experience.employment_details.current.title`, `…current.company_name`,
`…past.title`, `…past.company_name`, `education.schools.school`, `skills.professional_network_skills`,
`experience.employment_details.current.seniority_level` (closed list), `dev_platform_profiles.login`,
`research_profiles.name`. Response: `{ profiles: [...], next_cursor, total_count }`; profile keys `crustdata_person_id`,
`basic_profile{name,headline,current_title,location{city,state,country,raw}}`, `experience.employment_details.{current,past}[]`,
`education.schools[]`, `skills.professional_network_skills[]`, `social_handles.professional_network_identifier.profile_url`.
Cost ≈ 0.03 credits/result + premium groups. Keep cursors for later pages (ranked cursors expire after 20 min —
on "Invalid cursor", rerun the query and skip seen ids).

**`/person/enrich`** `{ professional_network_profile_urls: [≤25], fields: [...] }` → array of
`{ matched_on, match_status, matches: [{ confidence_score, person_data }] }` (use `unwrapMatches(data, 'person_data')`).
Groups: `basic_profile, experience, education, skills, social_handles, dev_platform_profiles` (+0.8–2.5 cr),
`research_profiles` (+2 cr), `honors`, `certifications`. ~1 credit/profile base.

**`/person/identify`** exactly one of `emails` | `professional_network_profile_urls` | `research_profile_urls`
(Google Scholar URLs with `user=`), ≤ 25 → same array shape; 1 credit per match.

**`/company/search`** `{ filters, search: { query, mode: 'hybrid'|'lexical'|'semantic' }, limit (≤100 ranked), cursor, fields }`.
Filter fields: `basic_info.name`, `basic_info.industries`, `basic_info.company_type`, `basic_info.employee_count_range`,
`headcount.total` (numeric — use `=>`/`=<` for size buckets), `locations.country` (ISO-3 or full name), `locations.city`,
`locations.state`, `taxonomy.professional_network_specialities`. Response `{ companies: [...], next_cursor, total_count }`.

**`/company/enrich`** / **`/company/identify`** exactly one of `crustdata_company_ids` | `domains` | `names` |
`professional_network_profile_urls` (≤ 25) → array with `matches[].company_data` (`unwrapMatches(data, 'company_data')`).
Enrich groups: `basic_info, headcount, funding, locations, taxonomy` (2 credits/company). Identify returns `basic_info` only (0.2 cr).

**`/web/search/live`** `{ query, sources: ['scholar-articles'] | ['web'] | …, location?: 'US' (ISO-2), page? }` →
`{ results: [...] }`; scholar results have `title, url, snippet, metadata ("Authors - Year - Venue"), citations,
authors: [{ name, profile_url, profile_id }]`; web results `title, url, snippet, position`. 1 credit per page.

Errors you'll see from the gateway (`CrustdataError` with `.status`, `.type`): 400 invalid field/operator (log it, drop
that condition, warn), 403 `permission_error` (gated fields/endpoints — degrade gracefully), 402/`insufficient_credits`
(stop, surface a warning), 404 on enrich/identify is already turned into an empty result. `crustdata.batch` returns
`Error` objects in place — check each element.

## How to run & verify
```powershell
npm install
copy .env.example .env     # CRUSTDATA_TRANSPORT=sample for development (no credits)
npm test                   # your tests live in server/test/pipeline/*.test.js (node:test + node:assert)
npm run dev                # then run a search from the UI or POST /api/search
```
Write unit tests for `geography.js` and `constraints.js` (country aliases, city aliases, hubs, institutions/acronyms,
role matching, org classification, sizes, unverified handling) and an integration test that runs
`retrieveIndividualsPage` / `retrieveOrganizationsPage` with `ctx.sample = true` and asserts: no constraint violations,
no repeats across pages, exclusion counts add up, `hasMore` behaves. For a real-data smoke test, set
`CRUSTDATA_API_KEY` (or connect via OAuth in the UI) with small limits (`CRUSTDATA_SEARCH_LIMIT=10`,
`CRUSTDATA_ENRICH_PER_PAGE=5`) and note credits used.

## Definition of done
- [ ] All functions above implemented with the exact signatures; v0 stubs gone.
- [ ] Individuals + organizations pipelines follow the steps above, incl. academic authors and labs.
- [ ] Geography, role/type and size are hard constraints with explicit `excluded` accounting; unverified only with permission.
- [ ] Enrichment happens only after preliminary filtering; gated-field 403s degrade gracefully; pagination never repeats.
- [ ] Tests pass (`npm test`); `npm run check` passes; PR from `laptop-3/retrieval-pipeline` with a short note on credit usage per page.

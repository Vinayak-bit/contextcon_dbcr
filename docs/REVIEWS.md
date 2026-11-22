# Integration reviews (Laptop 4)

Each laptop: read your section, make any **Required** changes on your branch, push, and say so.
Merge order into `main`: **L3 → L1 → L2** (L1 and L2 don't depend on L3's fixes and may go first if the project owner decides).

## Review 1 (2026-11-22)

All three branches (`laptop-1/onboarding-ui` 79fdb0b, `laptop-2/results-ui` 0cd0b84, `laptop-3/retrieval-pipeline` 3d82c58)
were merged together locally on top of `main`. They merged with **no conflicts**, and `npm run check` passed with all tests.
An end-to-end browser run (Company persona, broad topic → suggestion, Both, custom discipline, 51–200, same
country India, sample data) produced correct results in both tabs. Every hard constraint held:
- 8 people, all verified in India, with matching roles. The custom discipline matched.
- 8 organizations, all with a verified HQ in India and 68–199 employees, all of the engineering-services type. 9 were
  excluded for wrong type and 3 for duplicates.

### Laptop 3 — retrieval pipeline: approved after required changes

Strong work: prefilter-before-enrich, pooled pagination without repeats, academic merge, 403/402 fallbacks, and HQ vs
office basis. Laptop 4 ran 20 spot checks on geography and constraints (country/city aliases, BITS Pilani ↔ Birla
Institute…, MIT, IIT Delhi ≠ IIT Bombay, roles, sizes, org types), and **all passed**.

**Required** (your branch predates the "Verified against the live Crustdata MCP" section of your brief, so
`git pull --rebase origin main` first):
1. `individuals.js` `searchPeople` body (line ~52): add **`mode: 'exact'`** whenever filters are sent. Without it
   Crustdata's default `managed` mode can widen the user's hard filters.
2. Same body: add **`fields: ['crustdata_person_id', 'basic_profile', 'social_handles', 'fit']`**. Without `fields`, every
   result is billed +0.2 credits for experience/education. Use the `fit` tier (`strong`/`possible`/`weak`) in `prefilterScore`.
3. `organizations.js` `searchCompanies` (line ~53): ranked company search (`search: {…}`) **rejects `cursor`** and returns
   one window of ≤100. Don't send a cursor with `search`. For pages 2+, use a fresh query set (`spec.related_topics`,
   type hints) or a filters-only search, and keep dropping seen ids. Also send
   `fields: ['crustdata_company_id', 'basic_info', 'locations']` (+ `headcount` when a size filter is set).
4. **Add tests** in `server/test/pipeline/` (your brief requires them): unit tests for `geography.js` / `constraints.js`
   (the cases above are a good start) and a sample-mode test for both page builders (no constraint violations, no
   repeats across pages, exclusion counts add up).

### Laptop 1 — onboarding UI: approved, no required changes

Verified in the browser: discovery (auto email attempt, "not connected" handling with Retry / Try with sample data /
Skip, match card "Is this your professional profile?", reject → "Attempt 2 of 3" name + affiliation form), the category
page (exact copy), the Company persona (org profile step incl. "Continue without a record", country prefill into
geography), describe → broad topic → refinement with 5 suggestions + Rewrite manually → suggestion re-validated →
"We understood", goals, Both with two independent groups + select all/clear + custom discipline, the dynamic
organization size step, the summary with Edit on every row, and the "Use sample data" offer. `SearchRequest` matches
the contract.

Not exercised in this review (please self-check): the other four personas end to end, the profile-links form,
discovery attempt 3 and the exhausted state, `editRequest` prefill from results, and mobile width.

### Laptop 2 — results UI: approved, no required changes

Verified: summary bar, sample banner, tabs with counts, stage tracker, cards (evidence ids, criterion bars with
redistributed weights, geography label), ranking drawer (Jev levels per criterion, proximity note, strengths, Jev decision
labelled as a signal, cited evidence, full evidence, retrieval time, disclaimer), Escape closes the drawer, and no
horizontal overflow at ~1000 px.

Not exercised (please self-check): load-more to page 2 and the within-page note, the include-unverified rerun dialog,
the OAuth connect polling, and mobile width.

### Laptop 4 (self)

- Fixed: the server no longer starts a first-time Crustdata OAuth sign-in on its own when a request needs live data.
  It connects implicitly only with an API key or saved tokens. Otherwise it returns 409 `crustdata_auth_required`,
  and only the "Connect Crustdata" button starts sign-in. Regression test: `server/test/gateway.test.js`.
- Before this fix, one review run registered the app as an OAuth client with Crustdata (no sign-in, no tokens, no
  data access). That registration is reused when someone clicks Connect.

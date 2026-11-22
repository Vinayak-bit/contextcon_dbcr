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

## Review 2 (2026-11-22) — Laptop 3 re-review

`laptop-3/retrieval-pipeline` at a093da3 (merged `main`, then "Pipeline tests + live-verified Crustdata request rules").
**Approved.** All four required changes are done:
1. Person search sends `mode: 'exact'` (with a comment explaining why).
2. Person search sends `fields` (`crustdata_person_id`, `basic_profile`, `social_handles`, `fit`, plus `experience` only
   for institute scope), and `fit` feeds the prefilter score.
3. Ranked company search no longer sends a cursor. Later pages continue with a filters-only topic search that does
   paginate. Company search sends `fields` (`headcount` only when a size filter is set).
4. 40 tests in `server/test/pipeline/` (geography, constraints, dedupe, academic, sample-mode page builders).

Also added: research-profile and developer-profile second pulls (≤ 25 rows each, once, unioned with the main pull).

Verified by Laptop 4: merged onto `main` (with L1 + L2) with no conflicts. `npm run check` passes with 49 tests. Two
end-to-end searches in the browser held every hard constraint:
- Professor persona, Both, research hubs SF Bay Area + Bengaluru: all results verified in a hub, a web-discovered lab
  verified through its parent institution, and 32 location-less paper authors excluded (unverified not allowed).
- "My institute" scope: every person a verified affiliate of the institute.

Found and fixed on the Laptop 4 side (`shared/catalog.js`, not Laptop 3's code): the Universities rule matched any
"Research Services" company, and the corporate R&D rules matched universities. Academic types now exclude
privately held and public companies, and corporate R&D types exclude educational institutions. Laptop 3's change request (count
lab-extraction LLM calls in `llmUsage`) is resolved in `job.js`.

## Review 3 (2026-11-22) — Laptop 3 follow-up

`laptop-3/retrieval-pipeline` at 04d6989 (merged `main`, plus 97b79a0 "Review fixes"). **Approved.**
- Type matching: a type rule only counts a miss as a mismatch when the fields it relies on are recorded. Otherwise the
  result is "unverified", which is safer for hard constraints.
- Dedupe: same name + organization but different Crustdata person ids (or different company domains) stay separate,
  with tests.
- Dropped the ambiguous "america" alias for the United States.
- Remembers a rejected search filter per query so later pages don't pair it with an unfiltered cursor.

Verified by Laptop 4: fast-forwards onto `main`, and `npm run check` passes with 53 tests. Three constrained searches over two
pages each (research hubs; India + 51–200 employees + custom discipline; "my institute") returned 427 results with
**zero** constraint violations.

Change requests resolved by Laptop 4: lab-extraction LLM usage is counted, and for organizations `unverified_role` is
documented as "type or size unverified" (no new keys).

**Laptop 2, small follow-up:** in `labels.ts`, label `unverified_role` per tab, as "role unverified" for Individuals and
"type or size unverified" for Organizations. The include-unverified offer already counts it, so no other change is needed.

## Review 4 (2026-11-22) — first live Crustdata run

The app connected to `install.crustdata.com/mcp` with an API key (Bearer). All 8 tools were discovered by name. One search
(student persona, Both, US + India, limits 2 queries / 10 results / 5 enrichments per tab) completed in ~2 min for
**40.8 credits**: person_search 15.2 (mostly the developer-profile second pull), person_enrich 9, company_enrich 10,
company_search 4.6, web_search 2. Results were relevant and verified (US/India), ranked by Jev, and rendered correctly.

**Laptop 3, required:**
1. `matchRoles`: a person with **no current role** must not match on the headline alone (an MS student with headline
   "AI/ML Engineer" passed as "Working Professionals — Engineers"). With no current role, return `unverified`.
2. Crustdata currently rejects the `scholar-articles` and `scholar-articles-enriched` sources with 400 "Source temporarily
   disabled" (reported to Crustdata). Turn that into one friendly warning ("Academic paper search is temporarily
   unavailable; results come from profile search") instead of a raw message per query.

## Review 5 (2026-11-22) — Laptop 2 follow-up

`laptop-2/results-ui` at bd922dd ("Review 3 follow-up: label unverified_role per tab"). **Approved and merged.**
- `exclusionLabel(key, tab)`: `unverified_role` reads "type or size unverified" in Organizations and "role unverified" in
  Individuals. `ExclusionLine` / `BroadenActions` take the tab.
- The include-unverified confirmation now describes the tab's case and states that it applies to the whole new search.

Verified by Laptop 4: built on current `main`, only results-folder files changed, `npm run check` passes with 53 tests. In
the browser (with an injected `unverified_role` count, since sample data never produces one) the Organizations tab
showed "4 type or size unverified, 9 organization type not matching, 3 duplicates" and the org-specific dialog text.

Open items: Laptop 3's two Review 4 follow-ups (role match must not rely on the headline alone when there is no current
role; a single friendly warning while Crustdata's scholar sources are disabled).

## Review 6 (2026-11-22) — Laptop 2 card & header polish

`laptop-2/results-ui` at c38f5d7 ("Polish cards for academic-only people and phone header"). **Approved and merged.**
- Cards: when role and affiliation are both missing, one "Role and affiliation not available" line replaces the
  placeholders. An "Unknown" career stage is hidden. Accomplishments already shown under relevant work aren't repeated
  (the drawer keeps all evidence).
- Header: short Crustdata label on phones ("Connected", "Sign in"…), with the full label kept for screen readers.

Verified by Laptop 4: only Laptop 2 files changed, and `npm run check` passes with 53 tests. On the saved live search
(real Crustdata data), the blank-role candidate shows "Role and affiliation not available · Boston … · Student". At
375 px the header shows "Connected" with no horizontal scroll.

That candidate's "Student" stage confirms Review 4 item 1 for Laptop 3 (a student passed the "Working Professionals —
Engineers" filter on headline alone).

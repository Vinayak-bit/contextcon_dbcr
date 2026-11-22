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

## Review 7 (2026-11-22) — Laptop 3 Review 4 fixes

`laptop-3/retrieval-pipeline` at b966841. **Approved.** Both Review 4 items are done:
1. `matchRoles`: only a recorded **current role** verifies a type. The headline alone never does. With no current role
   the person is `unverified`, except that a current enrollment (school end year ≥ this year) verifies student types, and
   PhD types when the degree is doctoral. Titles are matched one at a time, so words from two different titles no longer
   combine.
2. `academic.js`: a disabled or unavailable Scholar source gives **one** friendly warning ("Academic paper search is
   temporarily unavailable; results come from profile search."). Raw messages go to the progress log.

Verified by Laptop 4: built on current `main`, only Laptop 3 files changed, and `npm run check` passes with 56 tests. Re-running
`matchRoles` on the saved live-run people (real Crustdata data): the four working engineers still match, and the MS
student with no current role is now `unverified`. The warning text wasn't re-checked live, to save credits. Its unit test
covers it.

Note for Laptop 4: `enrollments()` reads the degree from the education evidence text produced by `normalize.js`
("Education: <degree, field> at <school> (<year>)"). Keep that format stable, or tell Laptop 3 if it changes.

## Review 8 (2026-11-22) — Owner-requested simplification (Laptop 4)

Branch `laptop-4/simplify-onboarding`. The project owner asked Laptop 4 to make these changes across the app, including
files that Laptop 1 (`web/src/features/onboarding/`) and Laptop 2 (`web/src/features/results/`) own. **Laptops 1 and 2:
pull `main` before continuing.** Your briefs are updated.

1. **No automatic profile discovery at sign-in.** Sign-in and sessions are unchanged. Profiles confirmed earlier stay as
   editable starting points. The discovery endpoints remain on the server for older clients but the UI no longer calls them.
2. **"Your profile" step, first for every persona, optional.** Role or background, institution or company, city and
   country, skills, relevant work. Stored only with consent (`PUT /me/consent`; turning it off deletes the profile).
   Used as secondary context for topic refinement, geography prefill and ranking. The project stays the primary signal.
3. **Objectives removed.** "Who to find" (Individuals / Organizations / Both plus type filters) stays. No objectives
   validation and no Goals summary row. Ranking uses the project description plus the selected types. Older searches and
   drafts reopen: objectives and links are ignored, the draft version is 2 with a migration from version 1.
4. **One geography list for all five personas** (`GEO_OPTIONS`): my institution or organization, my city, my country,
   another country, specific countries or regions, research hubs, worldwide. Prefilled from the profile or organization;
   missing values are asked for (400, never guessed). Legacy `same_city` / `same_country` map to `my_city` /
   `my_country`. Always a hard filter.
5. **Project links removed** from the wizard. The description box is larger and accepts 12,000 characters for excerpts.
6. **On-demand "View work email"** on individual results (`server/pipeline/contact.js`, `WorkEmail.tsx`). Crustdata
   `person_contact_enrich`, business emails only, with attribution. States: found, none, unavailable (no matched profile,
   not on the plan, no credits, not connected), error (retryable). Zero contact credits until the user clicks. Emails
   are kept in memory for the search and never written to job files. **The current Crustdata plan does not include this
   endpoint** (403), so live lookups show "not enabled on this Crustdata plan" until the plan changes.
7. **Ranker provenance.** `Ranking.configured_engine` vs `Ranking.engine`, `Ranking.fallback = {from, to, reason}`,
   and `SearchJob.engines.scored`. Cards, the drawer and the summary footer show "Scored by …" and mark fallbacks.

Verified by Laptop 4:
- `npm run check` passes (65 tests, including `server/test/simplified-flow.test.js`).
- `npm run check:ranker` (live keys): Jev returned four scores and a decision, and every criterion was sourced from Jev.
  With Jev pointed at a bad endpoint, the candidate fell back to the DeepSeek judge with `{from: jev, to: llm,
  reason: "Jev 404: Not Found"}` and a search warning.
- Browser, sample data: sign-in goes straight to category; profile saved with consent and skipped; all five personas show
  "Your profile" first, no Objectives, and the same seven geography options; all five submit a search and are scored by
  Jev. An older company search saved with Objectives and `same_country` reopens with no Goal row, opens in the wizard as
  "My country · Australia", and re-runs. Work email shows found and "No work email on file" states.
- Live work-email lookup on the real account returns `unavailable` (plan gate), spending 0 credits. A found email on
  live data could not be verified for that reason.

### Review 8 addendum — engines footer zero counts (Laptop 4, owner question)

"LLM calls: 0 / Jev calls: 0" in the results footer was accurate but misleading. DeepSeek runs at evidence extraction
and Jev at ranking, both after the Crustdata search and enrichment, so the counters read 0 for the first part of every
search. Backend counting was correct (a finished live search: 12 LLM calls, 47 Jev calls, 47 results scored by Jev).
`EnginesFooter` in `web/src/features/results/Summary.tsx` (Laptop 2's folder; pull `main`) now explains a zero:
"none yet (starts at evidence extraction / ranking)" while running, "not used" when the key isn't configured, and
"none (no candidates passed the filters)" when nothing was ranked. The topic check isn't counted (tooltip says so).

## Review 9 (2026-11-22) — Laptop 1 outreach email drafts

`outreach-email` at c7ea6ad (one commit by Laptop 1, on top of `main` 404b267). **Approved and merged at the owner's
request.** Adds "Draft email" on every result: choose a purpose (meeting, research internship, internship, collaboration,
other) and optional details, then get an editable subject and message, with the public sources it used. Compose only:
**Copy draft** or **Open in email app** (a `mailto:` link, shown only with one valid address). Work emails found through
"View work email" prefill the To field; sample emails never do. Server: `server/llm/outreach.js` and
`POST /search/:id/candidates/:cid/outreach-draft` (documented in `docs/API.md`).

Checked by Laptop 4:
- Grounding: DeepSeek only sees linked evidence for the candidate (≤12 items), must return `sourceIds` from that set,
  and is told not to infer titles, openings, willingness or credentials. Otherwise a fixed template quotes one
  evidence item. Nothing is sent from the server.
- `npm run check` passes (69 tests, 4 new). Live: a collaboration draft for a real result cited two of the person's
  papers with Scholar links, acknowledged limited overlap with the topic, and signed with the user's name.
- Ownership: this commit edits Laptop 2 (`web/src/features/results/`) and Laptop 4 files (`server/routes/search.js`,
  `web/src/api/types.ts`, `client.ts`). Accepted because the owner asked for the merge. Laptop 2: pull `main`.
  Next time, request contract changes through `docs/CHANGE_REQUESTS.md` first.
- Not changed: draft calls aren't added to the search's "LLM calls" counter, which covers building results only.

## Review 10 (2026-11-22) — Overlap design system and landing page

`design/overlap-system` at 39c7665 (Vinayak-bit), merged on top of the outreach drafts with no conflicts (ea8d7bc).
Adds a landing page for signed-out visitors (and `#/overview`), a sign-in route (`#/signin`), shared header and footer,
light/dark theme, and restyles the whole app. No new dependencies; Inter and JetBrains Mono load from Google Fonts.

For every laptop:
- The UI kit moved to `web/src/components/ui/` and hooks to `web/src/hooks/`. `web/src/ui/index.ts` re-exports both, so
  existing `from '../../ui'` imports keep working. `web/src/ui/components.tsx` and `ui.css` are gone; styles live in
  `web/src/styles/components.css` and `tokens.css`.
- Copy changes in the wizard: "Find matches" (was "Find Matches"), "Check my topic" on Describe, "Your search spec".
- Landing demo data (`features/landing/content.ts`) is fictional and tagged "Illustrative". Its rubric weights match
  `shared/catalog.js` RUBRICS; keep them in sync if the rubric changes.

Verified by Laptop 4: `npm run check` passes (69 tests). Browser, live server: results page, ranking details and the
draft-email panel render in the new design; signed-in users go straight to the "Your profile" step; `#/overview` shows
the landing page; no script errors. Signed-out landing and dark theme were not clicked through.

## Review 11 (2026-11-22) — Heading and Edit search (owner request, Laptop 4)

- One heading everywhere: "Find the most relevant person or organization for your problem." It replaces the five
  per-persona headings in `shared/catalog.js`, the landing hero headline and the browser tab title. Supporting text
  under the heading stays per persona.
- The results summary no longer has an **Edit search** button (`SummaryBar` lost its `onEdit` prop); **New search**
  remains. `onEditSearch` still powers "Change geography or types" and the broadening actions. Laptop 2: pull `main`.

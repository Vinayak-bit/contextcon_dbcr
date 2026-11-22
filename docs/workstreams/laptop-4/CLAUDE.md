# Laptop 4 — Foundation, API, AI ranking & integration (lead)

You own the shared foundation and the glue: configuration, persistence, the Crustdata gateway,
the DeepSeek and Jev integrations, the deterministic ranking engine, the HTTP API, the search-job
runner, the app shell and UI kit, the contracts, and final integration. You review and merge the
other laptops' PRs.

Read `/CLAUDE.md`, `docs/PLAN.md`, and **all** of `docs/PRODUCT_SPEC.md` (you're accountable for the whole flow).

## You own

Everything not owned by Laptops 1–3:
`shared/**`, `server/{index.js,config.js,store.js,util.js}`, `server/routes/**`, `server/crustdata/**`, `server/llm/**`,
`server/ranking/**`, `server/pipeline/{normalize.js,job.js,prefs.js}`, `server/test/` (except `server/test/pipeline/**`),
`server/scripts/**`, `web/src/{App.tsx,main.tsx,vite-env.d.ts}`, `web/src/api/**`, `web/src/ui/**`, `web/src/styles/**`,
`web/index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `.env.example`, `docs/**`, `README.md`.

## Status (Phase 0 — foundation)

Done and on the `laptop-4/foundation` branch (merge to `main` before others start):
- `shared/catalog.js`: personas (all copy from the spec), individual/org types with retrieval mappings, sizes,
  geography options/regions/hubs, rubrics, page size.
- `server/crustdata/`: **MCP over Streamable HTTP** (`mcp.js`): Bearer API key or OAuth 2.1 (DCR + PKCE, file-backed
  tokens, callback route). It runs the server's code-mode `execute` tool with a sandbox program that batches calls and shrinks
  payloads, and auto-discovers the underlying tool names (env overrides `CRUSTDATA_MCP_TOOL_*`). Also `rest.js` (direct REST)
  and `sample.js` (offline fictional data). `index.js` handles caching (`.data/cache`, TTL), per-endpoint rate limits,
  retries with backoff, the credit `Meter`, and `unwrapMatches`.
- `server/llm/`: `deepseek.js` (JSON mode, zod validation, repair-retry, concurrency cap, usage), `topic.js` (validation
  + spec + suggestions, heuristic fallback), `extract.js` (evidence-grounded extraction; drops items citing unknown ids),
  `judge.js` (rubric judge, proximity excluded).
- `server/ranking/`: `jev.js` (TypeSafe `/v1/systemone`; `score` questions with 6 anchored levels per criterion plus a `noul`
  decision question; verified live), `index.js` (engine selection auto/hybrid/llm/jev/heuristic, deterministic
  `finalScore` with weight redistribution, stable sort).
- `server/pipeline/normalize.js`: Crustdata → standardized candidates with evidence ids.
- Contracts: `docs/API.md`, `web/src/api/types.ts`, `web/src/api/client.ts`, pipeline signatures in the Laptop 3 brief.
- Server: `server/pipeline/{prefs,job}.js`, `server/http.js`, `server/routes/{status,auth}.js`, and v0 pipeline stubs
  (`geography`, `constraints`, `individuals`, `organizations`, `academic`, `dedupe`) for Laptop 3 to replace.

**Still to finish in Phase 0 (do these first; Laptops 1–2 need them to run the UI):**
- `server/routes/{profile,topic,search}.js` and `server/index.js` (mount routes, session middleware, error handler,
  static `dist/` in production, auto-connect MCP when `CRUSTDATA_API_KEY` is set).
- Web scaffold: `web/index.html`, `vite.config.ts` (proxy `/api` → :8787, `@shared` alias), `tsconfig.json`,
  `web/src/main.tsx`, `App.tsx` (session bootstrap, screen switching, header with `ConnectionStatus`), UI kit in
  `web/src/ui/` (components named in the Laptop 1/2 briefs), `web/src/styles/tokens.css`, and placeholder
  `OnboardingApp` / `ResultsApp` / `ConnectionStatus` with the fixed signatures. The onboarding placeholder includes a
  "Run sample search" dev helper.
- `package.json` scripts `check` / `test` as documented in `/CLAUDE.md`, then confirm `npm run check` and `npm run dev` work.

Until those land, Laptops 1 and 2 can design their components against `web/src/api/types.ts` and the briefs. Laptop 3 can
start immediately: everything it depends on (`server/crustdata`, `normalize.js`, `shared/catalog.js`) is in place.

Verified so far: DeepSeek (`deepseek-flash` JSON mode) and Jev (`jev-1.14.0` score + noul) respond correctly with the
project keys. **Not yet verified against live Crustdata.** No `CRUSTDATA_API_KEY` is set and OAuth hasn't been
completed. Do that as soon as access exists.

## Next tasks (Phase 1 — while the others build)

1. Harden routes: input validation messages, consistent `ApiErrorBody` codes (see `docs/API.md`), rate-limit
   `/api/topic/validate` and `/api/search` per session.
2. Profile discovery backend polish: map identify/search results to `ProfileMatch`, store `UserProfile` (with consent only)
   from enrich, links flow (LinkedIn → identify, Scholar → identify `research_profile_urls`, GitHub → search
   `dev_platform_profiles.login`, X → search `social_handles.twitter_identifier.slug`, website → `/web/enrich/live` +
   DeepSeek summary as context).
3. Live Crustdata smoke test over MCP (API key and OAuth). Confirm discovered tool names and parameter shapes, adjust
   `mcp.js` if the execute result envelope differs, and record the credits used per search.
4. `server/scripts/benchmark-rankers.js` (`npm run benchmark:rankers`). Re-score cached candidates of recent jobs with
   LLM-only, Jev-only and hybrid, then report Spearman/Kendall correlation, top-10 overlap and cost. This is the spec's
   "benchmark Jev against LLM" requirement. Document the results in `docs/RANKING.md`.
5. README for humans (setup, keys, transports, architecture, costs).
6. Process `docs/CHANGE_REQUESTS.md` entries quickly. Others are blocked on you for contract changes.

## Phase 2 — integration (you lead)

Merge order: **L3 → L1 → L2**. After each merge: `npm run check`, then the end-to-end checklist in `docs/PLAN.md`
in a browser (sample mode first, then live Crustdata). Fix contract mismatches in the owner's PR review, not by
editing their files yourself, unless they agree.

## Reviewing PRs
- Ownership respected (no edits outside their folders except `docs/CHANGE_REQUESTS.md`).
- Contracts unchanged. Spec rules held (no silent broadening, labels for sample/unverified, evidence links).
- `npm run check` green. No secrets, no new heavy dependencies without justification.

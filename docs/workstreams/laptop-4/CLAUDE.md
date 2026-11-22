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
  decision question; verified live), `index.js` (**Jev is the production ranker** — owner decision, see `docs/RANKING.md`;
  DeepSeek judge only as per-candidate fallback; deterministic `finalScore` with weight redistribution; explanations built
  from Jev's anchored levels + extracted evidence; stable sort).
- `server/pipeline/normalize.js`: Crustdata → standardized candidates with evidence ids.
- Contracts: `docs/API.md`, `web/src/api/types.ts`, `web/src/api/client.ts`, pipeline signatures in the Laptop 3 brief.
- Server: `server/index.js`, `server/http.js` (cookie session, error envelope, rate limits), all routes in
  `server/routes/{status,auth,profile,search}.js` (incl. profile discovery with 3 attempts, links flow, org identify,
  OAuth callback page), `server/pipeline/{prefs,job}.js`, and v0 pipeline stubs (`geography`, `constraints`,
  `individuals`, `organizations`, `academic`, `dedupe`) for Laptop 3 to replace.
- Web: Vite + React 19 + TS scaffold (`vite.config.ts` proxies `/api`, `@shared` alias), `App.tsx` shell (session bootstrap,
  hash-routed results, header), UI kit in `web/src/ui/` (+ `useLocalStorage`, `usePolling`), tokens with dark mode, and
  placeholder `OnboardingApp` (minimal login + "Run sample search" dev helper) / `ResultsApp` / `ConnectionStatus`.
- Tests: `server/test/ranking.test.js` (rubric math), `server/test/job.sample.test.js` (end-to-end job on sample data:
  both tabs, page 2 without repeats, country hard filter). `npm run check` passes.
- Verified in a browser: login → Run sample search → DeepSeek topic validation → sample retrieval → extraction →
  ranking → results for both tabs.

Done on `laptop-4/api-integration`:
- Speed: extraction overlaps scoring, DeepSeek concurrency 16, Jev has its own cap. A 50-candidate search now ranks in
  ~6 s with Jev (was ~40 s for 16 candidates).
- Jev made the default ranker. `server/scripts/benchmark-rankers.js` kept for later evaluation on **real** searches only.

Known issues:
- Sample data can produce two different fictional people with the same name (different ids). That's expected.

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
4. README for humans (setup, keys, transports, architecture, costs).
5. Process `docs/CHANGE_REQUESTS.md` entries quickly. Others are blocked on you for contract changes.

## Phase 2 — integration (you lead)

Merge order: **L3 → L1 → L2**. After each merge: `npm run check`, then the end-to-end checklist in `docs/PLAN.md`
in a browser (sample mode first, then live Crustdata). Fix contract mismatches in the owner's PR review, not by
editing their files yourself, unless they agree.

## Reviewing PRs
- Ownership respected (no edits outside their folders except `docs/CHANGE_REQUESTS.md`).
- Contracts unchanged. Spec rules held (no silent broadening, labels for sample/unverified, evidence links).
- `npm run check` green. No secrets, no new heavy dependencies without justification.

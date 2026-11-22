# CLAUDE.md — Overlap (research & engineering collaboration discovery)

You are one of four AI agents, each on its own laptop, building this product in parallel.
**Before doing anything, find out which laptop you are** (the user will say "you are laptop N").
If they haven't said, ask. Then read your brief:

| Laptop | Workstream | Brief (read it fully before coding) |
|---|---|---|
| 1 | Onboarding & search-setup UI | [`docs/workstreams/laptop-1/CLAUDE.md`](docs/workstreams/laptop-1/CLAUDE.md) |
| 2 | Results, evidence & status UI | [`docs/workstreams/laptop-2/CLAUDE.md`](docs/workstreams/laptop-2/CLAUDE.md) |
| 3 | Retrieval pipeline (backend) | [`docs/workstreams/laptop-3/CLAUDE.md`](docs/workstreams/laptop-3/CLAUDE.md) |
| 4 | Foundation, API, AI ranking, integration (lead) | [`docs/workstreams/laptop-4/CLAUDE.md`](docs/workstreams/laptop-4/CLAUDE.md) |

Then read, in this order: [`docs/PLAN.md`](docs/PLAN.md) (who owns what and the git workflow),
the sections of [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) your brief names, and
[`docs/API.md`](docs/API.md) + [`web/src/api/types.ts`](web/src/api/types.ts) (the contract).

## What the product does

A user describes the exact technical problem they're working on — research or engineering.
The app finds the **people and organizations with the most relevant demonstrated expertise**,
using Crustdata for retrieval, DeepSeek to understand the project and extract evidence, and
DeepSeek + TypeSafe Jev to score candidates against fixed rubrics.

Flow: Login → Profile discovery (optional) → Category (Student / Professor / Company / Independent /
Other) → Describe project → Topic validation → Individuals / Organizations / Both → candidate-type
checkboxes → (preferences, org size) → Geography → Summary → **Find Matches** → Crustdata discovery →
enrichment → hard constraint checks → evidence extraction → ranking → paginated results (50/page).

## Stack and commands

- Node ≥ 20 (ESM everywhere, `"type": "module"`), Express 4 API in `server/`, React 19 + Vite + TypeScript UI in `web/`.
- Shared plain-JS module `shared/catalog.js` (persona copy, candidate types, geography, rubrics) is imported by **both** server and UI.
- `npm install` — once.
- `npm run dev` — API on http://localhost:8787 and UI on http://localhost:5173 (Vite proxies `/api`).
- `npm run check` — typecheck + tests + production build. **Must pass before every PR.**
- `npm test` — backend tests (`node --test`, files `server/test/**/*.test.js`).
- Windows users: these npm scripts work in PowerShell and Git Bash alike.

## Configuration (`.env`, never committed)

Copy `.env.example` → `.env`. Ask the project owner for keys through a private channel.

| Var | Purpose |
|---|---|
| `CRUSTDATA_TRANSPORT` | `auto`/`mcp` (default — Crustdata MCP over Streamable HTTP), `rest`, or `sample` (offline fictional data, no credits). **Use `sample` while developing UI or pipeline logic.** |
| `CRUSTDATA_API_KEY` | Optional. Sent as `Authorization: Bearer` to the MCP server. Without it, the UI's "Connect Crustdata" button runs OAuth. |
| `DEEPSEEK_API_KEY` | LLM (topic validation, evidence extraction, judge). Without it, keyword heuristics are used. |
| `JEV_API_KEY` | TypeSafe Jev reranker. With both LLM + Jev keys the ranker runs in `hybrid` mode. |

## Repository map (owner in brackets)

```
shared/catalog.js            [L4] personas, candidate types + retrieval mappings, geography, rubrics
server/index.js, routes/     [L4] Express app + HTTP API (docs/API.md)
server/config.js, store.js   [L4] env config; JSON-file users/sessions/cache under .data/
server/crustdata/            [L4] gateway: MCP (mcp.js) | REST (rest.js) | sample (sample.js); caching, rate limits, credits
server/llm/                  [L4] DeepSeek client, topic validation, evidence extraction, LLM judge
server/ranking/              [L4] Jev reranker + deterministic rubric scoring
server/pipeline/normalize.js [L4] Crustdata JSON → standardized candidate + evidence ids
server/pipeline/job.js       [L4] search jobs, pages, orchestration
server/pipeline/prefs.js     [L4] SearchRequest → resolved preferences
server/pipeline/(others)     [L3] geography, constraints, individuals, organizations, academic, dedupe
server/test/pipeline/        [L3] pipeline tests
web/src/App.tsx, main.tsx    [L4] app shell: session bootstrap, screen switching, header
web/src/api/                 [L4] types.ts (contract) + client.ts
web/src/ui/, web/src/styles/ [L4] shared UI kit + design tokens
web/src/features/onboarding/ [L1] login → discovery → category → persona wizard → summary
web/src/features/results/    [L2] progress, tabs, result cards, evidence drawer, pagination
web/src/features/status/     [L2] header connection/engine status widget
docs/                        [L4] spec, plan, API, briefs; docs/CHANGE_REQUESTS.md is append-only for everyone
```

## Rules for every agent

1. **Stay in your lane.** Only create/edit files your laptop owns. If you need a change elsewhere,
   append a request to `docs/CHANGE_REQUESTS.md` and work around it inside your own folder.
2. **Contracts are fixed.** Don't change the shapes in `web/src/api/types.ts`, `docs/API.md`, the
   pipeline function signatures, or `shared/catalog.js` ids. Laptop 4 changes them on request.
3. **Never commit secrets.** `.env` is git-ignored; never paste keys into code, docs, tests or commit messages.
4. **Spec rules that are easy to break** (see `docs/PLAN.md` → Shared rules): hard constraints are never
   silently broadened; geography is enforced before ranking; unverified locations are excluded unless the
   user allowed them; nothing is invented — every displayed claim cites evidence with a link and timestamp;
   research and engineering evidence count equally; sample data is always labelled.
5. **Git:** work on your branch (`laptop-N/<topic>`), commit messages start with `[LN]`, rebase on
   `origin/main` before pushing, open a PR into `main`. Laptop 4 reviews and merges.
6. **Verify before claiming done:** run `npm run check`, and for UI work click through the flow in a
   browser with `CRUSTDATA_TRANSPORT=sample`. Say plainly what you could not verify.
7. Keep code plain and readable: small modules, JSDoc on exported functions, no new dependencies
   without a note in your PR explaining why.

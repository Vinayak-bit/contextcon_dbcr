# Team plan — 4 laptops

Product: **Overlap** — find the people and organizations with the most relevant demonstrated
expertise for the exact technical problem a user is working on. Full requirements:
[`docs/PRODUCT_SPEC.md`](PRODUCT_SPEC.md). HTTP contract: [`docs/API.md`](API.md).

Four laptops work in parallel, each with its own AI agent. Each laptop owns a set of
directories. **Nobody edits files owned by another laptop.** The contracts between
workstreams (HTTP API, TypeScript types, pipeline function signatures) are fixed in the
repo before parallel work starts, so each laptop can build and test alone.

| Laptop | Workstream | Owns | Brief |
|---|---|---|---|
| **1** | Onboarding & search-setup UI | `web/src/features/onboarding/**` | [`docs/workstreams/laptop-1/CLAUDE.md`](workstreams/laptop-1/CLAUDE.md) |
| **2** | Results, evidence & status UI | `web/src/features/results/**`, `web/src/features/status/**` | [`docs/workstreams/laptop-2/CLAUDE.md`](workstreams/laptop-2/CLAUDE.md) |
| **3** | Retrieval pipeline (backend) | `server/pipeline/**` except `normalize.js`, `job.js`, `prefs.js`; `server/test/pipeline/**` | [`docs/workstreams/laptop-3/CLAUDE.md`](workstreams/laptop-3/CLAUDE.md) |
| **4** | Foundation, API, AI ranking, integration (lead) | everything else: `server/**` (rest), `shared/**`, `web/src/{api,ui,styles,App.tsx,main.tsx}`, `docs/**`, root config | [`docs/workstreams/laptop-4/CLAUDE.md`](workstreams/laptop-4/CLAUDE.md) |

Laptop 4 is the integration lead. It owns the shared contracts, reviews and merges every PR,
and runs the end-to-end checks.

## Architecture in one picture

```
Browser (React + Vite, web/)
  features/onboarding  (L1)  ──►  POST /api/auth, /api/profile/*, /api/org/*, /api/topic/validate, POST /api/search
  features/results     (L2)  ──►  GET /api/search/:id, /results, /candidates/:cid, POST /more
  features/status      (L2)  ──►  GET /api/status, POST /api/crustdata/connect
        │  (all via web/src/api/client.ts — L4)
        ▼
Express API (server/index.js, server/routes/* — L4)
  ├─ llm/topic.js        DeepSeek: topic validation + project spec           (L4, done)
  ├─ pipeline/job.js     search job runner, pages, caching                   (L4)
  │    ├─ pipeline/individuals.js, organizations.js, academic.js            (L3)
  │    │    geography.js, constraints.js, dedupe.js                          (L3)
  │    ├─ pipeline/normalize.js  Crustdata JSON → candidate + evidence ids   (L4, done)
  │    ├─ llm/extract.js     DeepSeek evidence extraction                    (L4, done)
  │    └─ ranking/index.js   DeepSeek judge + Jev + deterministic score      (L4, done)
  └─ crustdata/index.js  gateway: MCP (Streamable HTTP) | REST | sample      (L4, done)
```

## Phases and timeline

| Phase | Who | What | Rough time |
|---|---|---|---|
| **0. Foundation** | L4 | Push the scaffold to `main`: contracts, stubs, UI kit, runnable `npm run dev`. | done before others start |
| **1. Parallel build** | L1, L2, L3, L4 | Each builds its workstream on its own branch against the contracts. Sample mode means nobody waits for real Crustdata access. | 3–5 h |
| **2. Integration** | L4 (+ owners on call) | Merge in order **L3 → L1 → L2**, run the end-to-end checklist below, fix contract mismatches. | 1–2 h |
| **3. Hardening** | all | Real-data runs (Crustdata key or OAuth), Jev vs LLM benchmark, credit tuning, polish. | ongoing |

Everyone can start Phase 1 as soon as Phase 0 is on `main`. No laptop depends on another
laptop's unfinished work:

- L1 and L2 depend only on `docs/API.md`, `web/src/api/*` and `web/src/ui/*`. The API already
  answers with sample data, so the UIs can be built against a running server.
- L3 depends only on `server/crustdata` (done), `server/pipeline/normalize.js` (done) and
  `shared/catalog.js` (done). It replaces the v0 stubs in `server/pipeline/`.
- L4 continues with the API routes, job runner, profile discovery backend and README while
  the others build.

## Git workflow (all laptops)

1. Clone the repo, then `npm install`. Copy `.env.example` to `.env` and ask the project owner
   for keys **through a private channel**. Never commit `.env` or paste keys into code or docs.
2. Work on your own branch:
   - `laptop-1/onboarding-ui`
   - `laptop-2/results-ui`
   - `laptop-3/retrieval-pipeline`
   - `laptop-4/api-integration`
3. Commit small and often, prefixing messages with your laptop tag: `[L1] Add geography selector`.
4. Before opening or updating a PR: `git fetch origin && git rebase origin/main`, then
   `npm run check` (typecheck, tests and build must pass).
5. Open a PR into `main`. Laptop 4 reviews and merges. Don't merge your own PR unless Laptop 4
   says to.
6. **Need a change in a file you don't own?** Don't edit it. Append an entry to
   `docs/CHANGE_REQUESTS.md` in your PR (what, why, proposed signature) and work around it inside
   your own folder until Laptop 4 makes the change.

## Shared rules (non-negotiable — they come from the spec)

- Every candidate-type, geography and size choice is a **real UI control**, it is sent to the
  backend, and the backend **enforces it as a hard constraint**. Nothing is silently broadened.
  Broadening only happens after the user clicks an explicit button.
- Geography is a hard filter that runs **before** ranking. Candidates whose location can't be
  verified are labelled unverified and excluded unless the user allows them.
- Never invent work history, results, accomplishments, contact details, availability or
  willingness to collaborate. Every displayed claim cites an evidence id with a source link
  and a retrieval timestamp.
- Research and engineering evidence count equally. Engineers are not penalized for having no
  papers. Popularity, company size and raw citation counts are not relevance.
- Sample data (offline mode) is always visibly labelled as sample data.

## End-to-end acceptance checklist (Phase 2, run by Laptop 4)

- [ ] Login with name, email and consent; profile discovery tries email identify, then name and
      affiliation search, with at most 3 attempts; confirm, reject, links form and skip all work.
- [ ] All five category cards lead to persona-specific copy and options from `shared/catalog.js`.
- [ ] A broad topic ("Machine Learning") triggers refinement with selectable suggestions and a
      manual rewrite option. A specific topic passes.
- [ ] Individuals, Organizations and Both each work. Both shows two editable checkbox groups.
      The custom discipline (Company/Other), size (orgs) and preferences (Professor/Independent)
      steps all work.
- [ ] The search summary shows the exact topic, goal, types, geography and sizes.
- [ ] Individuals and organizations run in parallel. Both selected produces two tabs.
- [ ] Every result shows score, criterion bars, why it's relevant, evidence with links and a
      timestamp, and the geography verification label.
- [ ] Next and Previous pages work. Page 2+ carries the "ranked within its own page" notice.
- [ ] Excluded-candidate counts are shown, and broadening needs an explicit click.
- [ ] Sample mode is labelled. With Crustdata connected (key or OAuth), a real search completes
      and credits used are shown.
- [ ] Ranking engine indicator shows hybrid (DeepSeek + Jev) when both keys are present.

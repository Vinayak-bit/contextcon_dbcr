# Laptop 2 — Results, evidence & status UI

> **Review 8 (owner request, 2026-11-22): Laptop 4 changed this folder.** Pull `main` before you continue.
> The summary has no Goal row, cards and the drawer say which ranker actually scored each result (with any
> fallback), and individuals get an on-demand **View work email** (`WorkEmail.tsx`). The brief below is updated.
> See `docs/REVIEWS.md` → Review 8.

You build everything the user sees **after** pressing Find Matches: live search progress, the
Individuals/Organizations tabs, ranked result cards with scores and evidence, the detailed
ranking explanation, pagination, constraint/exclusion notices with explicit "broaden" actions.
You also build the header widget showing Crustdata connection (incl. the OAuth **Connect
Crustdata** button) and which AI engines are active.

You start with zero context, so read these first (≈20 min):

1. `/CLAUDE.md` (repo rules) and `docs/PLAN.md` (ownership, git workflow, shared rules).
2. `docs/PRODUCT_SPEC.md` sections **7 (Geography Rules), 8, 9, 10, 12, 13** — what results must show and must not imply.
3. `docs/API.md` + `web/src/api/types.ts` — especially `SearchJob`, `TabStatus`, `ResultsPage`, `Candidate`, `Ranking`, `AppStatus`.
4. `shared/catalog.js` — `RUBRICS` (criterion labels/weights), `INDIVIDUAL_TYPES`/`ORG_TYPES` (labels for ids), `PAGE_SIZE`.
5. `web/src/ui/` (UI kit, `index.ts`) and `web/src/styles/tokens.css`.

## You own (and only edit)

```
web/src/features/results/**
web/src/features/status/**
```

Do **not** edit `App.tsx`, `web/src/api/*`, `web/src/ui/*`, `shared/*`, `server/*`, or onboarding files.
Need a shared component or API change? Append to `docs/CHANGE_REQUESTS.md`; build locally meanwhile.

## Entry-point contracts (App.tsx renders these — keep the signatures)

```tsx
// web/src/features/results/index.tsx
export interface ResultsAppProps {
  jobId: string;
  onEditSearch(request: SearchRequest): void;          // back to the wizard, prefilled (Laptop 1 handles it)
  onRerun(jobId: string, request: SearchRequest): void; // you started a NEW search (e.g. user agreed to include unverified)
  onNewSearch(): void;                                  // start over from the description step
}
export function ResultsApp(props: ResultsAppProps): JSX.Element;

// web/src/features/status/index.tsx
export interface ConnectionStatusProps { status: AppStatus | null; onStatusChange(s: AppStatus): void }
export function ConnectionStatus(props: ConnectionStatusProps): JSX.Element;  // lives in the app header
```

Placeholders with these signatures exist — replace their bodies.

## Results screen — acceptance criteria

### Data flow
- `api.job(jobId)` on mount; poll every 1.5 s while any tab is `queued`/`running` (stop when all are `done`/`error`;
  stop polling when unmounted). Once a tab has `pagesReady ≥ 1`, show its page 1 via `api.results(jobId, tab, 1)`
  **even while the other tab is still running**.
- Summary bar at top from `job.summary`: topic, people types, organization types, custom discipline,
  geography, sizes, "unverified allowed" flag — plus **Edit search** (`onEditSearch(job.request)`) and **New search**.
- If `job.sample`, show a persistent banner: *"Sample data — fictional people and organizations for trying the product.
  Connect Crustdata for real results."* and a `Badge tone="sample"` on every card whose `meta.sample` is true.

### Progress (while running)
- Per tab: a stage stepper using `TabStatus.stage` / `stageLabel` (queued → searching → academic → prefilter → enriching →
  verifying → extracting → ranking → done), a progress bar when `progress` is present, and the latest `log` lines
  (collapsible). Errors: show `TabStatus.error` with a retry suggestion; `job.warnings` as dismissible notices.
- Footer/aside: engines — the configured ranker (`job.engines.ranker`, e.g. "Ranking (configured): Jev") **and** who actually
  scored (`job.engines.scored`, e.g. "Scored by: 48 Jev · 2 DeepSeek judge (fallback)"), Crustdata transport,
  credits used (`job.credits.crustdata`, cached calls), LLM calls.

### Tabs & pagination (spec §12)
- When the request targeted both, show **Individuals** and **Organizations** tabs (with counts once ready). Otherwise no tabs.
- Up to 50 cards per page. **Previous / Next** buttons + "Page N".
  - Next when `page < pagesReady` → `api.results(...)`.
  - Next when `page === pagesReady && hasMore` → `api.loadMore(jobId, tab)`, show the tab's progress, poll until
    `pagesReady` increments, then load the new page.
  - `hasMore === false` on the last page → "No more matches for these constraints."
- On pages ≥ 2 always show `ResultsPage.note` (ranking is within the page; not a global ranking).
- Keep scroll position sensible (scroll to top of list on page change). Cache fetched pages in component state so
  Previous is instant and ordering is stable.

### Result card — individuals (spec §12)
Rank, name, current role, institution/company, location, career stage, orientation (research/engineering/both),
**overall score** (`ScoreRing`, 0–100) and **criterion bars** (`ScoreBar` per `ranking.breakdown`, showing weight %),
`why_relevant`, top specializations (chips), up to 3 `relevant_work` + 2 `accomplishments` items **each with its
evidence ids rendered as small links** (hover/click shows the evidence text; link to `evidence.url` when present),
publications/projects counts, geography label (see below), verified profile links (`source_urls`), sample badge,
a **"Scored by …"** badge from `ranking.engine` (marked *fallback* with `ranking.fallback.reason` as its title when
`ranking.engine !== ranking.configured_engine`), the on-demand **View work email** control (below),
"academic-only identity" badge when `meta.academicOnly`. Button **View ranking details** → drawer.

### Result card — organizations
Rank, name, organization type, headquarters (+ relevant team/office locations if any), size (`employee_count`, or
"Size unknown"), overall + criterion scores, `why_relevant`, relevant work/products/research items with evidence links,
accomplishments, specializations, website/profile links, parent institution for labs, geography label. Never present
size as quality.

### Geography & verification labels
From `meta.geo`: `verified` → "Location verified · {basis}" (basis: profile / headquarters / office / institution /
parent institution — **say "HQ" vs "team/office" explicitly for organizations**); `unverified` → "Location unverified"
(only appears when the user allowed unverified); `not_required` → nothing or "Worldwide".

### Ranking details drawer (spec §10)
- Breakdown table: criterion, effective weight, score (0–5), source (Jev / LLM / Hybrid / Heuristic / Rule) and the
  per-criterion note (for Jev: its anchored level, e.g. "Jev: Closely matching work"); LLM and Jev values side by side if both exist.
- If `proximity_included` is false, say "Geographic proximity not scored — weight redistributed."
- Strengths, limitations, confidence (high/medium/low).
- Jev decision (`jev_decision`): question + value as a bar, labelled **"decision signal (not a probability of
  collaboration success)"**.
- Full evidence list (`candidate.evidence`, or fetch `api.candidate(jobId, id)`): id, kind, text, link; highlight the
  ids cited in `evidence_references` grouped by criterion.
- Provenance: `meta.retrievedAt` (formatted local time), `meta.transport`, `meta.extraction`, `meta.origin`.
- Ranking provenance: show the configured and actual engine; when `ranking.fallback` is set, a notice with its reason.
- Required disclaimer: *"Scores reflect evidence of relevant expertise. They don't indicate availability or willingness
  to collaborate. No contact details are inferred; work emails appear only when you ask, as returned by Crustdata."*

### Work email (individuals, on demand)
- `WorkEmail.tsx`: nothing is fetched until the user clicks **View work email** → `api.workEmail(jobId, candidateId)`.
  Loading a shortlist spends **zero** contact credits.
- Show only what Crustdata returns: business emails as `mailto:` links with their status, and "Work email via
  Crustdata · <time>" (plus "sample data" when `sample`). Distinct states: `none` (no work email on file),
  `unavailable` (no matched professional profile, not on the Crustdata plan, no credits, not connected), `error`
  (show the message and a **Retry**). People with no matched professional profile show that instead of a button.

### Exclusions & broadening (spec §6, §7 — never broaden silently)
- Show `ResultsPage.excluded` as a compact line: "Excluded on this page: 7 outside selected geography, 5 location
  unverified, 3 role not matching …" (only non-zero counts).
- If `unverified_location + unverified_role > 0` and `job.request.geography.allowUnverified === false`, offer
  **Include unverified candidates** → confirm dialog stating exactly what changes → `api.startSearch({...request,
  geography: {...request.geography, allowUnverified: true}})` → `onRerun(newJobId, newRequest)`.
- If few or zero results, offer **Change geography or types** → `onEditSearch(job.request)`. Never auto-widen.

### Empty, error and edge states
Zero results (with exclusion explanation), a tab that errored while the other succeeded, `crustdata_auth_required`
(show connect CTA), network errors with retry, very long names/lists (truncate gracefully), missing fields
("Not available" — never blank-guess).

## Connection status widget (header)
- Compact chip(s): **Crustdata** — "Connected (MCP · API key|OAuth)", "Sign-in required", "Connecting…", "Error",
  or "Sample data mode"; **AI** — "Ranking: Jev" (normal), "Ranking: DeepSeek", "Hybrid", or "Heuristic (no AI keys)".
- Clicking opens a popover with details: endpoint, auth type, discovered tool names (`crustdata.tools`), error text,
  LLM models, Jev model.
- **Connect Crustdata** (when `state` is `disconnected|needs_auth|error` and auth is `oauth`): `api.connectCrustdata()`;
  if the response has `authUrl`, `window.open(authUrl, '_blank', 'noopener')` and show "Finish signing in in the new
  tab…"; poll `api.status()` every 2 s (max 3 min) until `connected`, then `onStatusChange(status)`.
  Also offer **Disconnect** when connected via OAuth (`api.disconnectCrustdata()`).

## Design & quality bar
- Use the UI kit (`Card`, `Badge`, `Tabs`, `ScoreRing`, `ScoreBar`, `Drawer`, `Notice`, `Spinner`, `Button`, `Chip`,
  `EmptyState`) and tokens. Feature CSS in `results.css` / `status.css` inside your folders.
- Cards must stay scannable at 50 per page: clear hierarchy, score at a glance, details on demand.
- Responsive to 360 px; drawer becomes full-screen on mobile; keyboard accessible (drawer traps focus, Esc closes).

## How to run & verify
```powershell
npm install
copy .env.example .env      # set CRUSTDATA_TRANSPORT=sample
npm run dev                 # http://localhost:5173
```
Until Laptop 1's wizard lands, start searches with the dev helper in the placeholder onboarding screen
("Run sample search" button) or `POST /api/search` from DevTools. Exercise both tabs, pagination (sample mode
produces several pages), the drawer, the include-unverified rerun, and the Connect flow (with no
`CRUSTDATA_API_KEY` and `CRUSTDATA_TRANSPORT=mcp`, the button should open Crustdata's sign-in page).
`npm run check` must pass.

## Definition of done
- [ ] Progress, tabs, cards (both kinds), criterion bars, why-relevant, evidence links, drawer, provenance, disclaimer.
- [ ] Pagination incl. load-more and the within-page ranking note; stable ordering.
- [ ] Exclusion counts + explicit, confirmed broadening; no automatic widening.
- [ ] Sample-data labelling; engine/credit display (configured vs actual ranker); ConnectionStatus incl. OAuth connect.
- [ ] Work email on demand with found / none / unavailable / error states.
- [ ] `npm run check` passes; PR from `laptop-2/results-ui` with screenshots (desktop + mobile).

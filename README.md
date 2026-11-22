# Overlap — research & engineering collaboration discovery

Describe the exact technical problem you're working on — a research question, a system you're building,
hardware you're designing — and Overlap finds the **people and organizations with the most relevant
demonstrated expertise**, explains why each one matches, and shows the evidence.

It serves students, professors, startups/companies/labs, independent researchers and engineers, and anyone
else, and treats research evidence (publications) and engineering evidence (systems, open source, products)
as equally valid.

- **Retrieval:** [Crustdata](https://crustdata.com) people, company and live web/academic search, via its MCP server
  (Streamable HTTP). REST and an offline sample mode are alternates.
- **Understanding:** DeepSeek validates the topic, builds a structured project spec, and extracts evidence-grounded facts.
- **Ranking:** TypeSafe Jev scores each candidate on fixed rubrics. Final scores are computed deterministically
  (see [`docs/RANKING.md`](docs/RANKING.md)).

## Quick start

Requires Node.js 20+.

```powershell
npm install
copy .env.example .env        # then fill in keys (see below)
npm run dev                   # UI: http://localhost:5173 · API: http://localhost:8787
```

Production-style run (builds the UI and serves it from the API server on one port):

```powershell
npm start                     # http://localhost:8787
```

Other scripts: `npm test` (backend tests), `npm run check` (typecheck + tests + build),
`npm run benchmark:rankers` (compare rankers on saved real searches), `npm run check:ranker` (live check that Jev
scores and that a Jev failure falls back visibly; uses a few Jev calls).

## Configuration (`.env`)

| Variable | What it does |
|---|---|
| `CRUSTDATA_TRANSPORT` | `auto`/`mcp` (default: Crustdata MCP over Streamable HTTP), `rest`, or `sample` (offline fictional data, no credits). |
| `CRUSTDATA_API_KEY` | Optional. Sent as `Authorization: Bearer` to the MCP server (or REST). Without it, use **Connect Crustdata** in the app header to sign in with OAuth. |
| `CRUSTDATA_MCP_URL` | Default `https://install.crustdata.com/mcp`. |
| `DEEPSEEK_API_KEY` | Topic validation, project spec, evidence extraction. Without it, keyword heuristics are used. |
| `JEV_API_KEY` | TypeSafe Jev, the ranking engine. Without it, the DeepSeek judge ranks. |
| `CRUSTDATA_ENRICH_PER_PAGE`, `CRUSTDATA_SEARCH_LIMIT`, `CRUSTDATA_MAX_QUERIES` | Credit controls (defaults 50 / 40 / 4). |
| `CRUSTDATA_RESEARCH_PROFILES`, `CRUSTDATA_DEV_PLATFORM_PROFILES` | Request Google Scholar / GitHub data during enrichment (extra credits). |

All variables are listed with comments in [`.env.example`](.env.example). Never commit `.env`.

### Crustdata cost per results page (estimate from Crustdata's published pricing)

- **People:** search ≈ 0.03 credits/result plus premium groups. Enrichment ≈ 1 credit/profile, +2 with Scholar data,
  +0.8 with GitHub data. A 50-person page with both add-ons is roughly 200 credits. Without them it's about 60.
- **Organizations:** enrichment 2 credits/company, so a 50-organization page is about 100 credits plus search.
- Live web/academic search: 1 credit per results page.

Responses are cached in `.data/cache` (default 72 h), so repeated searches cost less. Each search shows its credit
usage in the UI.

## How a search works

1. Login (name, email, consent). No automatic profile lookup.
2. Pick a category → wizard: **Your profile** (optional: role, institution, city and country, skills, relevant work;
   stored only with consent) → describe the project (paste excerpts if useful) → **topic validation** (too-broad topics
   get suggestions) → Individuals / Organizations / Both with explicit candidate-type checkboxes → (preferences,
   organization size) → **geography** (same seven options for everyone, a hard filter) → summary → **Find Matches**.
3. Backend per results page: Crustdata search (people and organizations in parallel) → dedupe → preliminary filter →
   enrichment → **hard constraint checks** (geography, type, size; unverified excluded unless allowed) → DeepSeek
   evidence extraction → Jev scoring → deterministic final score → up to 50 ranked results per page.
4. Results: separate tabs, score + criterion bars, which ranker actually scored each result (and any fallback), why
   relevant, evidence with source links and retrieval timestamps, an explicit, never automatic, option to broaden
   constraints, and an on-demand work email (Crustdata business emails only; no credits until clicked).

Full product requirements: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md). HTTP API: [`docs/API.md`](docs/API.md).

## Project layout

```
shared/catalog.js     persona copy, candidate types, geography, rubrics (used by server and UI)
server/               Express API: crustdata/ (MCP | REST | sample), llm/ (DeepSeek), ranking/ (Jev + scoring),
                      pipeline/ (retrieval, constraints, normalization, jobs), routes/
web/                  React + Vite + TypeScript UI: api/ (typed client), ui/ (component kit), features/
docs/                 spec, team plan, API contract, ranking notes, per-laptop briefs
```

## Team workflow

The project is built by four laptops in parallel, each with an AI agent. See [`docs/PLAN.md`](docs/PLAN.md) for
ownership and git workflow, and [`CLAUDE.md`](CLAUDE.md) for agent instructions.

## Design system

Every page follows the Overlap design system, ported from the `overlap-landing.html` prototype (the prototype wins
where this text and it disagree).

- **Tokens** — `web/src/styles/tokens.css`: colours (light, and dark via `<html data-theme="dark">`), low radii
  (5–8 px; nothing is pill-shaped), shadows `--sh-1/2/3`, the type scale (`--fs-*`), motion (`--ease`, `--dur`),
  layout (`--content` 1120 px, `--gutter`, `--section`). Phase 0 names (`--text`, `--border`, `--radius` …) are
  aliases of the new tokens. Page code uses tokens only: no one-off colours, radii, shadows or font sizes.
- **Theme** — light by default regardless of OS. The footer toggle (light / system / dark) stores the choice in
  `localStorage` `overlap-theme`; an inline script in `web/index.html` applies it before first paint.
- **Components** — `web/src/components/ui/` (styles in `web/src/styles/components.css`): Button / ButtonLink
  (one primary per view; chevron on primary), Card / SpotlightCard, Chip, Tag, IllustrativeTag, Note, Input and form
  controls, Tabs, SegmentedControl, Stepper, Drawer, EvidenceChip / EvidenceQuote / EvidenceClaim, ScoreRing,
  CriterionBar, Header (acrylic glass), Footer (deep navy + theme toggle), DarkBand, PageWaves, Logo.
  `web/src/ui` re-exports them, so older imports keep working.
- **Hooks** — `web/src/hooks/`: `useSpotlight`, `useMagnetic`, `useCursorWeight`, `useReducedMotion`,
  `useInView` (reveal once), `useOnScreen`, `useTheme`.
- **Landing** — `web/src/features/landing/` (lazy-loaded for signed-out visitors and `#/overview`):
  `<OverlapGlobe filter="world|countries|hubs|city" />`, the hero ripple field, and the page sections.

### Motion and reduced motion

UI transitions are 200–400 ms ease-out; cursor effects use springs. Reveal-once animations use IntersectionObserver
(no scroll-jacking). The globe, hero ripples and page waves run only while on screen and while the tab is visible,
the slow ones at ≤ 30 fps. With `prefers-reduced-motion: reduce` everything is static: the globe is frozen at a set
angle with all in-scope arcs drawn, no cursor effects, no ripples, waves frozen, the header logo already overlapped,
and counters show final values. Cursor-only effects (headline weight, magnetic CTA, globe tilt) are off on touch;
spotlight becomes a short tap glow.

### Measured

Production build (`npm run build`): landing chunk **16.7 kB gzipped JS + 3.6 kB CSS**, loaded only for the landing
page; zero new runtime dependencies. Lighthouse and LCP have not been measured yet.

# Laptop 1 — Onboarding & search-setup UI

> **Review 8 (owner request, 2026-11-22): Laptop 4 changed this folder.** Pull `main` before you continue.
> Automatic profile discovery, the Objectives step and project links are gone. Every persona starts with an
> optional, editable **Your profile** step (`profile.tsx`) and gets the same seven geography options. The brief
> below is updated to match. See `docs/REVIEWS.md` → Review 8.

You build everything the user sees **before** results: login, the optional "Your profile" step, category
selection, the five persona-specific wizards, topic validation and refinement, candidate-type,
size and geography selection, and the search summary with **Find Matches**.

You start with zero context, so read these first (≈20 min):

1. `/CLAUDE.md` (repo rules) and `docs/PLAN.md` (ownership, git workflow, shared rules).
2. `docs/PRODUCT_SPEC.md` sections **2, 3, 4 (A–E, all steps except "Results"), 5, 6** — your requirements.
3. `docs/API.md` and `web/src/api/types.ts` — the endpoints and types you call. Use only `web/src/api/client.ts`.
4. `shared/catalog.js` — **all persona copy and option lists already live here** (`PERSONAS`, `PERSONA_ORDER`,
   `INDIVIDUAL_TYPES`, `ORG_TYPES`, `ORG_SIZES`, `GEO_SCOPES`, `REGIONS`, `COUNTRIES`, `RESEARCH_HUBS`).
   Never hard-code those strings in components. Import from `../../../shared/catalog.js` (or the
   `@shared/catalog` alias, see `vite.config.ts`).
5. `web/src/ui/` — the shared UI kit (`index.ts` lists the components) and `web/src/styles/tokens.css`.

## You own (and only edit)

```
web/src/features/onboarding/**     (create any files/subfolders you need here)
```

Do **not** edit `App.tsx`, `web/src/api/*`, `web/src/ui/*`, `shared/*`, or anything in `server/`.
Need a new shared component or an API change? Append to `docs/CHANGE_REQUESTS.md` and build a local
version inside your folder meanwhile.

## Entry-point contract (App.tsx renders this — keep the signature)

`web/src/features/onboarding/index.tsx` must export:

```tsx
export interface OnboardingAppProps {
  me: Me | null;                       // null → not logged in
  status: AppStatus | null;            // Crustdata/LLM status (null while loading)
  onMeChange(me: Me | null): void;     // call after login/logout/profile/category changes
  onSearchStarted(jobId: string, request: SearchRequest): void;  // after POST /api/search succeeds
  editRequest?: SearchRequest | null;  // set when the user clicks "Edit search" on results:
                                       // prefill the wizard from it and open the Summary step
}
export function OnboardingApp(props: OnboardingAppProps): JSX.Element;
```

A placeholder with this signature already exists. Replace its body. App.tsx switches to the
results screen when you call `onSearchStarted`.

## Screens and acceptance criteria

### 1. Login (spec §2)
- Fields: name, email, and a consent toggle: *"Store the profile details I add to personalize results."*
  Login works without consent; the profile step then asks for consent before saving anything.
- `api.login({name,email,consent})` → `onMeChange(me)`. Show field errors from `ApiError` (code `validation`).
- If `me` already exists on load, go to category (`me.category === null`), then the wizard. **No automatic
  profile lookup** after sign-in. Sessions work as before.

### 2. Your profile (first wizard step, every persona, optional)
- `profile.tsx` → `ProfileStep`. Fields: role or background, institution or company, city, country, skills
  (comma-separated) and relevant work (one item per line → `UserProfile.projects`).
- Prefill from `me.profile`. A profile confirmed earlier through discovery (`source === 'crustdata'`) is shown as an
  editable starting point with a badge.
- Saving needs the toggle "Store my profile to personalize results": `api.setConsent(true)` if needed, then
  `api.updateProfile(...)`. **Skip** always works. "Remove saved profile" calls `api.setConsent(false)`, which deletes it.
- The profile is secondary context (topic refinement, geography prefill, ranking). The project stays the main signal.
- The old discovery endpoints (`/profile/discover`, `/confirm`, `/links`, `/skip`) are no longer used by the UI.

### 3. Category (spec §3)
- Page title exactly **"How would you describe yourself?"**. Five large `SelectCard`s in `PERSONA_ORDER`
  using `PERSONAS[id].card.title/description`. Selection → `api.setCategory(id)` → `onMeChange`.
- The user can come back and change category (from a "Change" link in the wizard header).

### 4. Persona wizard (spec §4 A–E + §5 + §6)
Use `PERSONAS[me.category]`. Show `heading` and `supporting` text at the top, and a `Stepper` of the
steps that apply to this persona. Back/Continue on every step, and the user can jump back to completed steps.

| Step | Shown for | Details |
|---|---|---|
| Your profile | all (first step) | See §2 above. Optional; Skip moves on. |
| Organization profile (C1) | `persona.orgProfile` (company) | Fields: organization name, type (Select: Startup, Company, Research lab, University lab, R&D team, Nonprofit, Other), website, primary technical domain, team size, location (city + country). **Look up** → `api.identifyOrg({name, website})` → choose a match to prefill, or **Continue without a record** (allowed). Save with `api.saveOrg(org)` (`matched` true/false). The step is optional: offer "I'm not representing an organization". |
| Background (E1) | `persona.background` (other) | TextArea "Briefly describe your background or role". Sent as `background`. |
| Describe | all | **Chat-style** input: a large TextArea with a send-style Continue button, placeholder `persona.describe.placeholder`, prompt `persona.describe.question`. **No project links.** The TextArea is 10 rows and accepts up to 12,000 characters, so users can paste excerpts (abstracts, README sections, issue text). Continue → `api.validateTopic({description, category, background})`. |
| Topic check | all | **Specific** (`is_specific`): show a compact "We understood" card (domain, problem statement, core topics, methods, required expertise) and continue. **Too broad:** say it needs refinement (`reason`), show `suggestions` as selectable chips/cards (tag those with `based_on === 'profile'` as "From your profile"), plus **Rewrite manually** (edit the text and re-validate). Picking a suggestion re-validates using that suggestion as the description. Never block a specific topic just because it's outside the user's profile. Keep the returned `spec` for the request. |
| Who to find | all | Three large `SelectCard`s: **Individuals / Organizations / Both**. Then show **real checkbox groups**: "People I Want to Find" (`persona.individuals`) and/or "Organizations I Want to Find" (`persona.organizations`). With Both, show both groups, independently editable. Add select-all/none. If `persona.customDiscipline`, show a "Custom engineering discipline" text input in the people group (`customDiscipline`). Validation: each visible group needs ≥1 selection (a custom discipline counts for people). |
| Additional preferences | `persona.preferences` (professor, independent) | Render `persona.preferences.groups`: `single` → RadioGroup, `multi` → CheckboxGroup, `text` → TextField. All optional. Send as `preferences[group.id]`. |
| Organization size | target includes organizations | `ORG_SIZES` as multi-select checkboxes. "Any size" is exclusive (selecting it clears others and vice versa). Copy: *"Size indicates fit for your collaboration, not quality."* For the company persona this is its own step (C5). For others, show it as an optional step. |
| Geography | all | Radio options = `persona.geography` (the same `GEO_OPTIONS` for every persona: institution or organization, city, country, another country, specific countries or regions, research hubs, worldwide) mapped through `GEO_SCOPES[id].label`. Legacy `same_city`/`same_country` from older searches display as `my_city`/`my_country` (`canonicalGeoOption`). Ask for any value the profile or organization can't prefill; geography is always a hard filter. Sub-inputs (required when shown): `my_institute` → institute name, prefilled from `me.profile.institution` or `me.organization.name`; `my_city`/`same_city` → city + country, prefilled from profile/org location; `my_country`/`same_country` → country Select (from `COUNTRIES`), prefilled; `another_country` → one country; `specific` → multi-select countries and/or regions (`REGIONS`); `hubs` → checkbox list of `RESEARCH_HUBS`. Two toggles: **Include candidates whose location or role can't be verified** (`allowUnverified`, default **off**, explain it widens results) and **Slightly favor closer matches inside this area** (`preferProximity`, default on for institute/city, off otherwise). |
| Summary | all | Show the **exact**: topic (problem statement + core topics), your profile (or "Not added"), selected individual types (labels), custom discipline, organization types, geography restriction in words, sizes, unverified toggle. Each row has **Edit**, which jumps to its step. Big **Find Matches** button. |

**Find Matches:** build `SearchRequest` (see `types.ts`; ids, not labels, for types/sizes/hubs;
no objectives or links) → `api.startSearch(req)` → `onSearchStarted(jobId, req)`.
- 400 `validation`: show the message on the summary.
- 409 `crustdata_auth_required`: explain that live data needs Crustdata, and offer **Use sample data**
  (resubmit with `sample: true`) or connect via the header button.
- If `status?.crustdata.connected === false`, show a small inline notice on the summary that results
  will use sample data unless Crustdata is connected, and pass `sample: true` only if the user chooses it.

### State & persistence
- Keep the wizard draft per user in `localStorage` (`ov:draft:<userId>`). Wrap every access in
  try/catch, and the UI must work when storage is unavailable. Clear the draft after a successful search.
- When `editRequest` is provided, prefill everything from it and open Summary.

## Design & quality bar
- Use the UI kit (`Button`, `SelectCard`, `CheckboxGroup`, `RadioGroup`, `TextField`, `TextArea`, `Select`,
  `Chip`, `Badge`, `Notice`, `Stepper`, `Spinner`, `PageHeader`, `Card`) and CSS variables from `tokens.css`.
  Put feature-specific CSS in `web/src/features/onboarding/onboarding.css` (import it from your index).
- The UI must feel equally right for a student, a hardware startup and a professor: neutral, professional,
  no academic-only wording.
- Responsive down to 360 px wide, with no horizontal scroll. Every control is keyboard-reachable and has a
  visible focus ring. Labels are tied to inputs. Errors are announced (`role="alert"`).
- No `any` without a comment explaining why.

## How to run & verify
```powershell
npm install
copy .env.example .env      # then set CRUSTDATA_TRANSPORT=sample (keys optional for your work)
npm run dev                 # http://localhost:5173
```
Walk all five personas end to end in the browser. Check that a broad topic ("Machine Learning")
triggers refinement, that Both shows two groups, and that every geography option validates its
sub-inputs. Confirm the request body in DevTools → Network matches `SearchRequest`.
`npm run check` must pass.

## Definition of done
- [ ] All screens above work for all five personas with copy from `shared/catalog.js`.
- [ ] Your profile: enter, edit, skip, save only with consent, remove. No automatic discovery after sign-in.
- [ ] Topic validation with suggestions + manual rewrite. The spec is carried into the request.
- [ ] Every selection is a real control and appears in the summary and in the request body.
- [ ] `editRequest` prefill works. Drafts persist safely.
- [ ] `npm run check` passes. PR from `laptop-1/onboarding-ui` into `main`, with screenshots of each persona's summary.

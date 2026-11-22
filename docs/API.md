# HTTP API contract

Owned by **Laptop 4**. Types referenced here live in [`web/src/api/types.ts`](../web/src/api/types.ts)
and are the source of truth. The frontend calls these only through
[`web/src/api/client.ts`](../web/src/api/client.ts). Change requests go in `docs/CHANGE_REQUESTS.md`.

- Base path: `/api`. JSON in and out. In dev, Vite proxies `/api` to the Express server on `:8787`.
- Auth: a session cookie `ov_sid` set by `POST /api/auth/login`. This is lightweight
  (name + email + consent, no password), and the profile data is for personalization only.
- Errors: non-2xx with `ApiErrorBody` = `{ "error": { "message", "code?", "details?" } }`.
  Codes the UI should handle:
  - `unauthenticated` (401): show login.
  - `crustdata_auth_required` (409): show the "Connect Crustdata" button or offer sample data.
  - `validation` (400): show the message next to the form.
  - `attempts_exhausted` (409): profile discovery used all 3 attempts.
  - `not_found` (404).
  - `network` (status 0, set by `client.ts`, not the server): the browser couldn't reach the API at all (server
    stopped, wrong port, offline). Show the message as is. It tells the user to start the server.
- Sample mode: any endpoint that hits Crustdata accepts `sample: true` (or the server runs with
  `CRUSTDATA_TRANSPORT=sample`). Sample records carry `sample: true` and must be labelled in the UI.

## Status & Crustdata connection

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `GET /status` | — | `AppStatus` | Poll on load and after connecting. |
| `POST /crustdata/connect` | — | `AppStatus` | Starts the MCP connection. If `crustdata.state === 'needs_auth'`, open `crustdata.authUrl` in a new tab. Crustdata redirects back to `GET /api/crustdata/oauth/callback`, which shows a "connected, close this tab" page. Then poll `/status`. |
| `POST /crustdata/disconnect` | — | `AppStatus` | Forgets OAuth tokens. |

## Auth & user

| Method & path | Body | Response |
|---|---|---|
| `POST /auth/login` | `{ name, email, consent }` (consent must be `true` to store profile data; login works either way) | `Me` |
| `GET /auth/me` | — | `Me` or 401 `unauthenticated` |
| `POST /auth/logout` | — | `{ ok: true }` |
| `DELETE /me` | — | `{ ok: true }` (deletes the user and all stored profile data) |
| `PUT /me/category` | `{ category: PersonaId }` | `Me` |

## Profile discovery (spec §2)

At most **3 attempts** per user, counted server-side (`Me.discovery.attempts`).

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `POST /profile/discover` | `{ method: 'email' }` or `{ method: 'name', name?, affiliation? }` plus optional `sample` | `DiscoverResponse` | `email` calls `/person/identify` with the login email. `name` calls `/person/search` on name and affiliation. Each call uses one attempt, and the 4th returns 409 `attempts_exhausted`. |
| `POST /profile/reject` | `{ match_id }` | `{ attemptsLeft }` | Records the rejection. |
| `POST /profile/confirm` | `{ match_id }` | `Me` | Enriches the match and stores `UserProfile` (only if consent). Sets `discovery.status = 'confirmed'`. |
| `POST /profile/links` | `LinksRequest` | `LinksResponse` | Optional links after no match. LinkedIn and Scholar go to identify, GitHub and X to search. Website is fetched for context only. Returned matches can be confirmed with `/profile/confirm`. Does not use an attempt. |
| `POST /profile/skip` | — | `Me` | `discovery.status = 'skipped'`. |
| `PUT /profile` | `Partial<UserProfile>` | `Me` | User edits stored fields (role, institution, city, country, skills …). |

## Organization profile (Company persona, step C1)

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `POST /org/identify` | `{ name?, website?, sample? }` | `{ matches: OrgProfile[] }` | Company Identify, then Enrich for the top match. An empty list is fine, because organizations don't need a Crustdata record. |
| `PUT /org` | `OrgProfile` | `Me` | Saves the confirmed or edited organization (`matched: false` allowed). |

## Topic validation (spec §5)

| Method & path | Body | Response |
|---|---|---|
| `POST /topic/validate` | `TopicValidateRequest` | `TopicValidation` |

If `is_specific` is false, the UI shows `reason` and the selectable `suggestions`, plus a manual
rewrite. Picking a suggestion re-validates with that text. A user may proceed with a specific topic
outside their profile. The UI sends `spec` back unchanged inside `SearchRequest`.

## Search (spec §6–§12)

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `POST /search` | `SearchRequest` | `StartSearchResponse` | 400 `validation` when required fields are missing (no types selected, geography value missing …). 409 `crustdata_auth_required` when live data is needed but not connected and `sample` isn't set. |
| `GET /search/:id` | — | `SearchJob` | Poll every ~1.5 s while any tab is `queued` or `running`. |
| `GET /search/:id/results?tab=individuals&page=1` | — | `ResultsPage` | Up to 50 ranked candidates. 404 if that page isn't built yet. |
| `POST /search/:id/more` | `{ tab }` | `SearchJob` | Builds the next page from the remaining pool and Crustdata cursors. That tab returns to `running`. Poll until `pagesReady` increases. |
| `GET /search/:id/candidates/:candidateId` | — | `Candidate` | Full candidate with all evidence. |

Pagination semantics: page *N* is retrieved, verified and ranked as its own batch after page
*N−1*. Scores use the same rubric, so they are comparable, but candidates are **not** re-ranked
globally across pages. `ResultsPage.note` carries the message to display.

Exclusion counters (`ExcludedCounts`): every key is always present. `unverified_location` and `unverified_role` are the
candidates that "Include unverified candidates" would add back. For organizations, `unverified_role` means **type or
size unverified**, so label it per tab. The other keys are real mismatches or duplicates.

Broadening constraints: the server never broadens. To include unverified candidates or widen
geography, the UI shows the user what will change, then calls `POST /search` with a modified
`SearchRequest` after the user explicitly agrees.

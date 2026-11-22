# Change requests (append-only)

Need a change in a file you don't own? Append an entry here in your PR and work around it inside
your own folder until the owner (usually Laptop 4) makes the change. Don't edit or delete others' entries.

Template:

```
## [LN → LM] Short title — YYYY-MM-DD
- File(s):
- What & why:
- Proposed signature / shape:
- Status: open
```

## [L3 → L4] Count lab-extraction LLM calls in the job's usage — 2026-11-22
- File(s): `server/pipeline/job.js` (`makeCtx`)
- What & why: `academic.js#findLabs` calls `ctx.llm.chatJson` to extract lab names from web results, but `ctx` has no
  usage accumulator, so those DeepSeek calls are missing from `SearchJob.llmUsage`. Low priority; nothing breaks.
- Proposed signature / shape: `llm: { enabled, chatJson, usage: job.llmUsage }` in `makeCtx`. L3 already passes
  `usage: ctx.llm.usage` (undefined today, which chatJson tolerates).
- Status: done (L4, 19109c5): `makeCtx` passes `usage: job.llmUsage`.

## [L3 → L4, L2] Separate "unverified" exclusion keys for organization type and size — 2026-11-22
- File(s): `web/src/api/types.ts` (`ExcludedCounts`), `web/src/features/results/labels.ts` (L2)
- What & why: an organization whose type or headcount can't be verified is excluded unless the user allows
  unverified results, so it should be relaxable by "Include unverified candidates". `ExcludedCounts` only has
  `unverified_location` / `unverified_role`, and the UI's include-unverified offer counts exactly those two. Until
  there are dedicated keys, L3 counts unverified org type **and** unverified size under `unverified_role` (so the
  offer appears). In the Organizations tab, that label currently reads "role unverified".
- Proposed signature / shape: add `unverified_type: number; unverified_size: number` to `ExcludedCounts` (L3 switches
  to them as soon as they exist), or label `unverified_role` as "type/size unverified" in the Organizations tab.
- Status: done (L4, Review 3), using the second option. No new keys, because L2's `Record<keyof ExcludedCounts, …>` would
  break. `unverified_role` is now documented in `types.ts` / `API.md` as "people: role, organizations: type or size
  unverified". L3 keeps its current counting. L2 labels it per tab (see `docs/REVIEWS.md` → Review 3). The server now
  fills every key on every page.

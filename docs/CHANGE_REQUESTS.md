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
- Status: open

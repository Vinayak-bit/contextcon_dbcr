# Ranking

Owned by Laptop 4. Spec reference: `docs/PRODUCT_SPEC.md` §9–§10.

**Decision (2026-11-22, project owner): TypeSafe Jev is the ranking engine.** DeepSeek stays responsible for
understanding: topic validation, the project spec, and evidence extraction. It does not produce ranking scores.

## How a score is produced

1. **Evidence extraction (DeepSeek).** Each normalized candidate's evidence lines are turned into grounded items
   (relevant work, accomplishments, specializations …). Every item cites evidence ids, and items citing unknown ids are
   dropped (`server/llm/extract.js`).
2. **Criterion scores (Jev).** One request per candidate to `POST https://api.typesafe.ai/v1/systemone`
   (`JEV_MODEL`, default pinned `jev-1.14.0`) with one `score` question per rubric criterion (six anchored levels, 0–5)
   plus one yes/no `noul` decision question (`server/ranking/jev.js`).
3. **Geographic proximity** is computed by rules, never by a model. It is used only when the user asked to favor closer
   matches and their own location is known. Otherwise its weight is redistributed.
4. **Final score (0–100)** = Σ weight × criterion / 5 with the rubric weights (people 40/25/15/15/5, organizations
   45/25/15/10/5), renormalized over the active criteria (`finalScore`, unit-tested in `server/test/ranking.test.js`).
5. **Explanation.** Jev returns scores only, so the "why relevant", strengths and limitations text is built from
   Jev's own anchored level for each criterion (e.g. "Closely matching work (4.6/5)") plus the extracted evidence items
   and their ids. No text is generated at this step, and nothing is inferred beyond the evidence.
6. **Ordering:** final score, then Jev's decision value, then evidence volume. The decision value is shown as a
   **signal**, never as a probability of collaboration success.

## Fallbacks

- If Jev fails for a candidate (after retries), that candidate is scored by the DeepSeek judge (`server/llm/judge.js`),
  and `ranking.engine` says `llm`. A job warning reports how many fell back.
- With no `JEV_API_KEY`, the DeepSeek judge ranks. With neither key, a transparent keyword heuristic ranks.
- `RANKER=hybrid` (Jev + DeepSeek judge averaged per criterion, `HYBRID_JEV_WEIGHT`) and `RANKER=llm` remain available
  for experiments. They are not the default.

## Speed (measured 2026-11-22)

| Ranking | 50 candidates (25 people + 25 organizations) |
|---|---|
| Hybrid (DeepSeek judge + Jev) | 18.2 s |
| **Jev (current default)** | **5.9 s** |

The remaining time is mostly evidence extraction (DeepSeek, batches of 4, run in parallel with scoring).

## Evaluating on real data

`npm run benchmark:rankers` compares the LLM judge and Jev on saved hybrid searches (Spearman, Kendall, top-10 overlap,
per-criterion differences). It's only meaningful on **real Crustdata searches**, not sample data. To validate Jev's
quality, run a few real searches with `RANKER=hybrid` and have a person label the top 20 per tab as relevant or not,
then compare precision@10. Record any change of decision here.

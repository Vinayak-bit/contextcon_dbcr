// Ranking details drawer (spec §10): per-criterion breakdown with sources, judge notes,
// strengths/limitations, Jev decision signal, full evidence list and provenance.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { Candidate } from '../../api/types';
import { Badge, Drawer, Notice, ScoreRing, Spinner } from '../../ui';
import { criterionLabel, provenance, SOURCE_LABELS } from './labels';

/** Required disclaimer shown in the drawer footer (brief: ranking details drawer). */
export const DISCLAIMER = "Scores reflect evidence of relevant expertise. They don't indicate availability or willingness to collaborate, and no contact details are inferred.";

/** Drawer for one candidate. Fetches the full record so the evidence list is complete. */
export function RankingDrawer({ jobId, candidate, onClose }: { jobId: string; candidate: Candidate | null; onClose(): void }) {
  const [full, setFull] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFull(null); setError(null);
    if (!candidate) return;
    let live = true;
    setLoading(true);
    api.candidate(jobId, candidate.candidate_id)
      .then((c) => { if (live) setFull(c); })
      .catch((e) => { if (live) setError((e as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [jobId, candidate]);

  const c = full ?? candidate;
  return (
    <Drawer open={Boolean(candidate)} onClose={onClose} title={c ? `Ranking details — ${c.name}` : 'Ranking details'} footer={<p className="rs-disclaimer">{DISCLAIMER}</p>}>
      {c && <DrawerBody c={c} loading={loading} error={error} />}
    </Drawer>
  );
}

function DrawerBody({ c, loading, error }: { c: Candidate; loading: boolean; error: string | null }) {
  const r = c.ranking;
  const cited = useMemo(() => new Set(r.evidence_references.flatMap((x) => x.evidence)), [r.evidence_references]);
  const showSplit = r.breakdown.some((b) => b.llm != null && b.jev != null);

  return (
    <div className="stack rs-drawer">
      <div className="row">
        <ScoreRing score={r.final_score} size={72} />
        <div className="stack" style={{ gap: 4 }}>
          <strong>Overall {Math.round(r.final_score)}/100</strong>
          <span className="muted rs-small">Weighted sum of criterion scores (0–5), computed deterministically. Ranked #{c.rank} within its page.</span>
          <span className="row" style={{ gap: 6 }}>
            <Badge tone="accent">Engine: {r.engine}</Badge>
            <Badge>Confidence: {r.confidence}</Badge>
            {c.meta.sample && <Badge tone="sample">Sample data</Badge>}
          </span>
        </div>
      </div>

      {error && <Notice tone="warning">Couldn't load the full record ({error}). Showing what's on the page.</Notice>}

      <section>
        <h3>Criterion breakdown</h3>
        <div className="rs-table-wrap">
          <table className="rs-table">
            <thead>
              <tr><th scope="col">Criterion</th><th scope="col">Weight</th><th scope="col">Score</th><th scope="col">Source</th>{showSplit && <><th scope="col">LLM</th><th scope="col">Jev</th></>}</tr>
            </thead>
            <tbody>
              {r.breakdown.map((b) => (
                <tr key={b.key}>
                  <th scope="row">{b.label}{b.note && <div className="rs-note">{b.note}</div>}</th>
                  <td>{Math.round(b.weight)}%</td>
                  <td>{b.score.toFixed(1)}/5</td>
                  <td>{SOURCE_LABELS[b.source] ?? b.source}</td>
                  {showSplit && <><td>{b.llm != null ? b.llm.toFixed(1) : '—'}</td><td>{b.jev != null ? b.jev.toFixed(1) : '—'}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!r.proximity_included && <p className="muted rs-small">Geographic proximity not scored — weight redistributed.</p>}
      </section>

      <div className="rs-two-col">
        <section>
          <h3>Strengths</h3>
          {r.strengths.length ? <ul className="rs-list">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="muted rs-small">None listed.</p>}
        </section>
        <section>
          <h3>Limitations</h3>
          {r.limitations.length ? <ul className="rs-list">{r.limitations.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="muted rs-small">None listed.</p>}
        </section>
      </div>

      <section>
        <h3>Jev decision</h3>
        {r.jev_decision ? (
          <div className="stack" style={{ gap: 6 }}>
            <p className="rs-small" style={{ margin: 0 }}>{r.jev_decision.question}</p>
            {r.jev_decision.probability != null ? (
              <div className="rs-jev">
                <div className="rs-jev__track" aria-hidden><div className="rs-jev__fill" style={{ width: `${Math.round(r.jev_decision.probability * 100)}%` }} /></div>
                <span>{r.jev_decision.probability.toFixed(2)}</span>
              </div>
            ) : <span className="muted rs-small">No value returned.</span>}
            <span className="muted rs-small">decision signal (not a probability of collaboration success)</span>
          </div>
        ) : <p className="muted rs-small">Jev wasn't used for this candidate.</p>}
      </section>

      {r.evidence_references.length > 0 && (
        <section>
          <h3>Evidence cited per criterion</h3>
          <ul className="rs-list">
            {r.evidence_references.map((ref) => (
              <li key={ref.criterion}><strong>{criterionLabel(ref.criterion, c.candidate_type, r.breakdown)}:</strong> {ref.evidence.length ? ref.evidence.map((id) => (
                  // Buttons, not #anchors: the app shell routes on location.hash.
                  <button key={id} type="button" className="rs-ev-id" onClick={() => document.getElementById(`ev-${c.candidate_id}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{id}</button>
                )) : <span className="muted">none</span>}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>All evidence {loading && <Spinner size="sm" />}</h3>
        {c.evidence.length ? (
          <ol className="rs-evidence">
            {c.evidence.map((e) => (
              <li key={e.id} id={`ev-${c.candidate_id}-${e.id}`} className={cited.has(e.id) ? 'is-cited' : undefined}>
                <span className="rs-ev-quote__kind">{e.id} · {e.kind.replace(/_/g, ' ')}{cited.has(e.id) && ' · cited'}</span>
                <span>{e.text}</span>
                {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer">Open source ↗</a>}
              </li>
            ))}
          </ol>
        ) : <p className="muted rs-small">No evidence items were returned for this candidate.</p>}
      </section>

      <section>
        <h3>Provenance</h3>
        <dl className="rs-dl">
          {provenance(c.meta).map((p) => <div key={p.label}><dt>{p.label}</dt><dd>{p.value}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}

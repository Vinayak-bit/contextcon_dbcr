// PLACEHOLDER — Laptop 2 replaces this file's body with the full results experience.
// Brief: docs/workstreams/laptop-2/CLAUDE.md. Keep the exported signature.
// This version only polls the job and lists page 1 so the pipeline can be seen working.
import { useState } from 'react';
import { api } from '../../api/client';
import type { ResultsPage, SearchJob, SearchRequest, TabKey } from '../../api/types';
import { Badge, Button, Card, Notice, PageHeader, ScoreRing, Spinner, usePolling } from '../../ui';

export interface ResultsAppProps {
  jobId: string;
  onEditSearch(request: SearchRequest): void;
  onRerun(jobId: string, request: SearchRequest): void;
  onNewSearch(): void;
}

export function ResultsApp({ jobId, onEditSearch, onNewSearch }: ResultsAppProps) {
  const [job, setJob] = useState<SearchJob | null>(null);
  const [pages, setPages] = useState<Partial<Record<TabKey, ResultsPage>>>({});
  const [error, setError] = useState<string | null>(null);
  const running = !job || Object.values(job.tabs).some((t) => t && (t.status === 'running' || t.status === 'queued'));

  usePolling(async () => {
    try {
      const j = await api.job(jobId);
      setJob(j);
      for (const [k, t] of Object.entries(j.tabs) as [TabKey, NonNullable<SearchJob['tabs'][TabKey]>][]) {
        if (t.pagesReady >= 1 && !pages[k]) {
          const p = await api.results(jobId, k, 1);
          setPages((prev) => ({ ...prev, [k]: p }));
        }
      }
    } catch (e) { setError((e as Error).message); }
  }, 1500, running || Object.keys(pages).length < Object.keys(job?.tabs || {}).length);

  return (
    <div className="stack">
      <PageHeader eyebrow="Placeholder" title="Results" subtitle={job?.summary.topic} actions={<>
        {job && <Button variant="secondary" onClick={() => onEditSearch(job.request)}>Edit search</Button>}
        <Button variant="ghost" onClick={onNewSearch}>New search</Button>
      </>} />
      {error && <Notice tone="danger">{error}</Notice>}
      {job?.sample && <Notice tone="sample" title="Sample data">Fictional people and organizations for trying the product.</Notice>}
      {job && (Object.entries(job.tabs) as [TabKey, NonNullable<SearchJob['tabs'][TabKey]>][]).map(([k, t]) => (
        <Card key={k} className="stack">
          <div className="row"><h2 style={{ margin: 0, textTransform: 'capitalize' }}>{k}</h2><Badge>{t.stageLabel}</Badge>{t.status === 'running' && <Spinner size="sm" />}</div>
          {t.error && <Notice tone="danger">{t.error}</Notice>}
          {pages[k]?.candidates.map((c) => (
            <div key={c.candidate_id} className="row" style={{ alignItems: 'flex-start', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <ScoreRing score={c.ranking.final_score} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{c.rank}. {c.name}</strong>{' '}
                <span className="muted">{c.candidate_type === 'individual' ? `${c.current_role} · ${c.institution_or_company} · ${c.location}` : `${c.organization_type} · ${c.headquarters}`}</span>
                <div className="muted" style={{ fontSize: '.9rem' }}>{c.ranking.why_relevant}</div>
              </div>
            </div>
          ))}
        </Card>
      ))}
      {job && <p className="muted">Engines: {job.engines.ranker} ranking · Crustdata {job.engines.crustdata} · {job.credits.crustdata} credits · {job.llmUsage.calls} LLM calls</p>}
    </div>
  );
}

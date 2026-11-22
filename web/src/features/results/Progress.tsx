// Live progress for one tab: stage stepper, progress bar, collapsible log, errors.
import type { TabKey, TabStatus } from '../../api/types';
import { Button, Notice, Spinner, Stepper } from '../../ui';
import { completedStages, formatTime, stagesFor, TAB_LABELS } from './labels';

/** Progress panel for a tab that is queued, running or errored. */
export function TabProgress({ tab, status, onRetry, compact = false }: { tab: TabKey; status: TabStatus; onRetry?(): void; compact?: boolean }) {
  const steps = stagesFor(tab);
  const current = status.stage === 'queued' || status.stage === 'error' || !steps.some((s) => s.key === status.stage) ? steps[0].key : status.stage;
  const pct = status.progress && status.progress.total > 0 ? Math.min(100, Math.round((status.progress.done / status.progress.total) * 100)) : null;
  const log = status.log ?? [];

  if (status.status === 'error') {
    return (
      <Notice tone="danger" title={`${TAB_LABELS[tab]} search failed`} action={onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Run the search again</Button>}>
        {status.error || 'Something went wrong while building this tab.'} Running the same search again often helps; your constraints stay unchanged.
      </Notice>
    );
  }

  return (
    <div className={`rs-progress${compact ? ' is-compact' : ''}`} aria-live="polite">
      <div className="row">
        <Spinner size="sm" />
        <strong>{TAB_LABELS[tab]}:</strong>
        <span>{status.status === 'queued' ? 'Queued' : status.stageLabel || 'Working…'}</span>
        {status.progress && <span className="muted">({status.progress.done}/{status.progress.total})</span>}
      </div>
      {!compact && <Stepper steps={steps} current={current} completed={status.status === 'queued' ? [] : completedStages(tab, status.stage)} />}
      {pct !== null && (
        <div className="rs-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${TAB_LABELS[tab]} progress`}>
          <div className="rs-bar__fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {log.length > 0 && (
        <details className="rs-log">
          <summary>Activity log ({log.length})</summary>
          <ol>{log.slice(-12).map((l, i) => <li key={i}><time className="muted">{formatTime(l.at)}</time> {l.message}</li>)}</ol>
        </details>
      )}
    </div>
  );
}

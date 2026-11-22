// Search summary bar and the engines / credits footer.
import type { SearchJob } from '../../api/types';
import { Button, Card } from '../../ui';
import { RANKER_LABELS, SCORED_BY_LABELS, TRANSPORT_LABELS } from './labels';

/** What the user asked for, exactly as sent, plus Edit / New search. */
export function SummaryBar({ job, onEdit, onNew }: { job: SearchJob; onEdit(): void; onNew(): void }) {
  const s = job.summary;
  const target = job.request.target;
  // Searches made before the Objectives step was removed still carry `goal`; it is no longer shown.
  const items: { label: string; value: string }[] = [];
  if (target !== 'organizations') items.push({ label: 'People', value: s.individualTypes.join(', ') || 'Not specified' });
  if (s.customDiscipline) items.push({ label: 'Custom discipline', value: s.customDiscipline });
  if (target !== 'individuals') items.push({ label: 'Organizations', value: s.orgTypes.join(', ') || 'Not specified' });
  if (target !== 'individuals') items.push({ label: 'Size', value: s.sizes.length ? s.sizes.join(', ') : 'Any size' });
  items.push({ label: 'Geography', value: s.geography });
  items.push({ label: 'Unverified candidates', value: s.allowUnverified ? 'Allowed' : 'Excluded' });
  items.push({ label: 'Proximity bonus', value: s.preferProximity ? 'On' : 'Off' });

  return (
    <Card className="rs-summary">
      <div className="rs-summary__head">
        <div className="rs-summary__topic">
          <span className="ui-eyebrow">Your search</span>
          <p className="rs-topic" title={s.topic}>{s.topic}</p>
        </div>
        <div className="row">
          <Button variant="secondary" size="sm" onClick={onEdit}>Edit search</Button>
          <Button variant="ghost" size="sm" onClick={onNew}>New search</Button>
        </div>
      </div>
      <dl className="rs-summary__grid">
        {items.map((i) => <div key={i.label}><dt>{i.label}</dt><dd>{i.value}</dd></div>)}
      </dl>
    </Card>
  );
}

/**
 * Why a model-call counter is 0, so a bare "0" never reads as "this engine isn't used".
 * DeepSeek runs at evidence extraction and Jev at ranking, both after Crustdata search and enrichment,
 * so the counters stay at 0 for the first part of every search.
 */
function zeroCallsNote(job: SearchJob, kind: 'llm' | 'jev'): string {
  const e = job.engines;
  if (kind === 'llm' && e.llm !== 'deepseek') return 'not used (DeepSeek not configured)';
  if (kind === 'jev' && e.ranker !== 'jev' && e.ranker !== 'hybrid') return `not used — ranker is ${RANKER_LABELS[e.ranker] ?? e.ranker}`;
  const running = Object.values(job.tabs).some((t) => t.status === 'queued' || t.status === 'running');
  if (running) return kind === 'llm' ? 'none yet (starts at evidence extraction)' : 'none yet (starts at ranking)';
  const ranked = Object.values(e.scored ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
  return ranked ? '0' : 'none (no candidates passed the filters)';
}

/** Engines, Crustdata transport, credits and model usage for this job. */
export function EnginesFooter({ job }: { job: SearchJob }) {
  const e = job.engines;
  const llm = job.llmUsage.calls;
  const jev = job.jevUsage.calls;
  return (
    <footer className="rs-engines" aria-label="Engines and usage">
      <span><strong>Ranking (configured):</strong> {RANKER_LABELS[e.ranker] ?? e.ranker}</span>
      {e.scored && Object.keys(e.scored).length > 0 && <span><strong>Scored by:</strong> {Object.entries(e.scored).map(([k, n]) => `${n} ${SCORED_BY_LABELS[k as keyof typeof SCORED_BY_LABELS] ?? k}${k !== e.ranker ? ' (fallback)' : ''}`).join(' · ')}</span>}
      <span><strong>Understanding & evidence:</strong> {e.llm === 'deepseek' ? 'DeepSeek' : 'Keyword heuristics'}</span>
      <span><strong>Crustdata:</strong> {TRANSPORT_LABELS[e.crustdata] ?? e.crustdata}</span>
      <span><strong>Credits used:</strong> {job.credits.crustdata.toLocaleString()} ({job.credits.calls} calls, {job.credits.cached} cached)</span>
      <span title="DeepSeek calls made while building these results (evidence extraction, and judging if Jev falls back). The topic check before the search is not included.">
        <strong>LLM calls:</strong> {llm > 0 ? `${llm} (${(job.llmUsage.promptTokens + job.llmUsage.completionTokens).toLocaleString()} tokens)` : zeroCallsNote(job, 'llm')}
      </span>
      <span title="TypeSafe Jev scoring calls, one per ranked candidate.">
        <strong>Jev calls:</strong> {jev > 0 ? jev : zeroCallsNote(job, 'jev')}
      </span>
    </footer>
  );
}

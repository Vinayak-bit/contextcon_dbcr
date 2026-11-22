// Search summary bar and the engines / credits footer.
import type { SearchJob } from '../../api/types';
import { Button, Card } from '../../ui';
import { RANKER_LABELS, TRANSPORT_LABELS } from './labels';

/** What the user asked for, exactly as sent, plus Edit / New search. */
export function SummaryBar({ job, onEdit, onNew }: { job: SearchJob; onEdit(): void; onNew(): void }) {
  const s = job.summary;
  const target = job.request.target;
  const items: { label: string; value: string }[] = [
    { label: 'Goal', value: s.goal.length ? s.goal.join(', ') : 'Not specified' },
  ];
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

/** Engines, Crustdata transport, credits and model usage for this job. */
export function EnginesFooter({ job }: { job: SearchJob }) {
  const e = job.engines;
  return (
    <footer className="rs-engines" aria-label="Engines and usage">
      <span><strong>Ranking:</strong> {RANKER_LABELS[e.ranker] ?? e.ranker}</span>
      <span><strong>Understanding & evidence:</strong> {e.llm === 'deepseek' ? 'DeepSeek' : 'Keyword heuristics'}</span>
      <span><strong>Crustdata:</strong> {TRANSPORT_LABELS[e.crustdata] ?? e.crustdata}</span>
      <span><strong>Credits used:</strong> {job.credits.crustdata.toLocaleString()} ({job.credits.calls} calls, {job.credits.cached} cached)</span>
      <span><strong>LLM calls:</strong> {job.llmUsage.calls}{job.llmUsage.calls > 0 && ` (${(job.llmUsage.promptTokens + job.llmUsage.completionTokens).toLocaleString()} tokens)`}</span>
      <span><strong>Jev calls:</strong> {job.jevUsage.calls}</span>
    </footer>
  );
}

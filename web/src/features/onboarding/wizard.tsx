import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ORG_SIZES, PERSONAS } from '@shared/catalog.js';
import { api, ApiError } from '../../api/client';
import type { AppStatus, Me, PersonaId, SearchRequest, Target } from '../../api/types';
import { Badge, Button, Card, CheckboxGroup, Notice, PageHeader, RadioGroup, SelectCard, Stepper, TextArea, TextField } from '../../ui';
import {
  clearDraft, DESCRIPTION_MAX, getSteps, includesOrgs, includesPeople, readDraft, saveDraft, searchRequest, stepError,
  type CheckedTopic, type Draft, type Persona, type Step,
} from './draft';
import { labelOptions } from './fields';
import { GeographyFields, geographyLabel } from './geography';
import { OrganizationFields } from './organization';
import { ProfileStep } from './profile';

const targets: { id: Target; label: string; description: string }[] = [
  { id: 'individuals', label: 'Individuals', description: 'Find people with relevant expertise.' },
  { id: 'organizations', label: 'Organizations', description: 'Find companies, labs, and teams doing relevant work.' },
  { id: 'both', label: 'Both', description: 'Search for people and organizations together.' },
];

function TopicReview({ topic, onSuggestion, onRewrite }: {
  topic?: CheckedTopic;
  onSuggestion(description: string): void;
  onRewrite(): void;
}) {
  if (!topic) return <Notice tone="warning" action={<Button variant="secondary" onClick={onRewrite}>Describe your project</Button>}>
    Describe your project to check the topic.
  </Notice>;

  if (!topic.is_specific) {
    return (
      <div className="stack ob-section">
        <h2>Make your topic more specific</h2>
        <p>{topic.reason}</p>
        {topic.suggestions.map((suggestion) => (
          <Button key={suggestion.topic} variant="secondary" className="ob-suggestion" onClick={() => onSuggestion(suggestion.topic)}>
            <strong>{suggestion.topic}</strong>
            {suggestion.based_on === 'profile' && <Badge tone="info">From your profile</Badge>}
            {suggestion.rationale && <small>{suggestion.rationale}</small>}
          </Button>
        ))}
        <div><Button variant="secondary" onClick={onRewrite}>Rewrite manually</Button></div>
      </div>
    );
  }

  const { spec } = topic;
  return (
    <div className="stack ob-section">
      <h2>We understood</h2>
      <div className="ob-match stack">
        <div><Badge tone="accent">{spec.domain}</Badge></div>
        <h3>{spec.problem_statement}</h3>
        <dl className="ob-facts">
          <dt>Core topics</dt><dd>{spec.core_topics.join(', ') || '—'}</dd>
          <dt>Methods</dt><dd>{spec.specific_methods.join(', ') || '—'}</dd>
          <dt>Required expertise</dt><dd>{spec.required_expertise.join(', ') || '—'}</dd>
        </dl>
      </div>
    </div>
  );
}

function Summary({ draft, persona, me, onEdit }: { draft: Draft; persona: Persona; me: Me; onEdit(step: Step): void }) {
  const formatTypes = (options: { id: string; label: string }[], ids: string[]) =>
    options.filter(({ id }) => ids.includes(id)).map(({ label }) => label).join(', ');
  const { spec } = draft.topic || {};
  const rows: { label: string; value: ReactNode; step: Step }[] = [
    {
      label: 'Topic',
      value: <>{spec?.problem_statement}{Boolean(spec?.core_topics.length) &&
        <small>{spec?.core_topics.join(' · ')}</small>}</>,
      step: 'describe',
    },
    {
      label: 'Your profile',
      value: me.profile && me.consent
        ? [me.profile.current_role, me.profile.institution, [me.profile.location.city, me.profile.location.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Saved'
        : 'Not provided (optional)',
      step: 'profile',
    },
    { label: 'Who to find', value: targets.find(({ id }) => id === draft.target)?.label, step: 'target' },
  ];
  if (includesPeople(draft.target)) {
    if (draft.individualTypes.length) rows.push({
      label: 'People', value: formatTypes(persona.individuals, draft.individualTypes), step: 'target',
    });
    if (draft.customDiscipline && 'customDiscipline' in persona) rows.push({
      label: 'Custom discipline', value: draft.customDiscipline, step: 'target',
    });
  }
  if (includesOrgs(draft.target)) {
    rows.push(
      { label: 'Organizations', value: formatTypes(persona.organizations, draft.orgTypes), step: 'target' },
      { label: 'Organization size', value: formatTypes(ORG_SIZES, draft.sizes.length ? draft.sizes : ['any']), step: 'sizes' },
    );
  }
  if ('preferences' in persona) {
    for (const group of persona.preferences.groups) {
      const value = draft.preferences[group.id];
      if (value?.length) rows.push({ label: group.label, value: Array.isArray(value) ? value.join(', ') : value, step: 'preferences' });
    }
  }
  rows.push(
    { label: 'Geography', value: geographyLabel(draft.geography), step: 'geography' },
    { label: 'Unverified candidates', value: draft.geography.allowUnverified ? 'Included' : 'Excluded', step: 'geography' },
    { label: 'Prefer closer matches', value: draft.geography.preferProximity ? 'On' : 'Off', step: 'geography' },
  );

  return (
    <div className="stack ob-section">
      <h2>Review your search</h2>
      <dl className="ob-summary">
        {rows.map(({ label, value, step }) => <div className="ob-summary-row" key={label}>
          <dt>{label}</dt><dd>{value}</dd>
          <dd className="ob-edit"><Button variant="ghost" size="sm" aria-label={`Edit ${label}`} onClick={() => onEdit(step)}>Edit</Button></dd>
        </div>)}
      </dl>
    </div>
  );
}

interface WizardProps {
  category: PersonaId;
  me: Me;
  status: AppStatus | null;
  editRequest?: SearchRequest | null;
  onMeChange(me: Me): void;
  onSearchStarted(jobId: string, request: SearchRequest): void;
  onChangeCategory(): void;
}

/** Guide the selected persona from project description through search submission. */
export function Wizard({ category, me, status, editRequest, onMeChange, onSearchStarted, onChangeCategory }: WizardProps) {
  const persona = PERSONAS[category];
  const [draft, setDraft] = useState(() => readDraft(me.id, category, editRequest));
  const [busy, setBusy] = useState<'topic' | 'search' | null>(null);
  const [orgBusy, setOrgBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const focus = useRef<HTMLDivElement>(null);
  const previousStep = useRef(draft.step);
  const steps = getSteps(persona, draft.target);
  const index = steps.findIndex(({ key }) => key === draft.step);
  const step = steps[index]?.key ?? steps[0].key;
  const sampleMode = status?.crustdata.transport === 'sample';
  const sampleAvailable = status?.crustdata.sampleAvailable !== false;

  useEffect(() => saveDraft(me.id, category, draft), [me.id, category, draft]);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    focus.current?.focus();
    focus.current?.scrollIntoView({ block: 'nearest' });
  }, [step]);

  function patch(fields: Partial<Draft>) {
    setDraft((previous) => ({ ...previous, ...fields }));
    setFailure('');
  }

  function patchTopic(fields: Pick<Partial<Draft>, 'description' | 'background'>) {
    patch({ ...fields, topic: undefined, completed: draft.completed.filter((item) => item !== 'describe' && item !== 'topic') });
  }

  function navigate(to: Step, returnToSummary = draft.returnToSummary) {
    patch({ step: to, returnToSummary });
    setAuthRequired(false);
  }

  function complete(fields: Partial<Draft> = {}) {
    const next = { ...draft, ...fields, completed: [...new Set([...draft.completed, step])] };
    const nextSteps = getSteps(persona, next.target);
    const nextIndex = nextSteps.findIndex(({ key }) => key === step);
    const nextRequired = nextSteps.find(({ key }) => key !== 'summary' && !next.completed.includes(key));
    const resume = draft.returnToSummary ? nextRequired?.key ?? 'summary' : nextSteps[nextIndex + 1]?.key ?? 'summary';
    patch({ ...next, step: resume, returnToSummary: resume !== 'summary' && draft.returnToSummary });
  }

  function goBack() {
    if (index > 0) navigate(steps[index - 1].key);
    else onChangeCategory();
  }

  async function validate(description: string) {
    if (busy) return;
    description = description.trim();
    if (!description) { setFailure('Describe what you are working on.'); return; }

    setBusy('topic');
    setFailure('');
    try {
      const topic = await api.validateTopic({ description, category, background: draft.background.trim() || undefined });
      const completed = [...new Set([...draft.completed.filter((item) => item !== 'topic'), 'describe' as const])];
      patch({ description, topic, completed, step: 'topic' });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not check the topic. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function startSearch(sample = draft.sample) {
    if (busy) return;
    const invalid = steps.find(({ key }) => stepError(key, draft, persona));
    if (invalid) {
      navigate(invalid.key, true);
      setFailure(stepError(invalid.key, draft, persona));
      return;
    }
    const request = searchRequest(category, { ...draft, sample });
    if (!request) return;

    setBusy('search');
    setFailure('');
    setAuthRequired(false);
    try {
      const { jobId } = await api.startSearch(request);
      clearDraft(me.id);
      onSearchStarted(jobId, request);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'crustdata_auth_required') setAuthRequired(true);
      else setFailure(error instanceof Error ? error.message : 'Could not start your search. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function advance() {
    if (step === 'describe') { void validate(draft.description); return; }
    if (step === 'summary') { void startSearch(); return; }
    const error = stepError(step, draft, persona);
    if (error) { setFailure(error); return; }
    complete();
  }

  function chooseTarget(target: Target) {
    const changed = target !== draft.target;
    const completed = changed
      ? draft.completed.filter((item) => item !== 'target' && (includesOrgs(target) || item !== 'sizes'))
      : draft.completed;
    patch({ target, completed });
  }

  let content: ReactNode;
  switch (step) {
    case 'profile':
      content = <ProfileStep me={me} onMeChange={onMeChange} onDone={() => complete()} onBack={goBack} />;
      break;
    case 'organization':
      content = <OrganizationFields initial={draft.skipOrganization ? null : me.organization} onSave={onMeChange}
        onNext={(skipOrganization) => complete({ skipOrganization })} onBack={goBack} onBusyChange={setOrgBusy} />;
      break;
    case 'background':
      content = <TextArea label="Briefly describe your background or role" value={draft.background}
        onChange={(background) => patchTopic({ background })} />;
      break;
    case 'describe':
      content = (
        <div className="stack ob-section">
          <div className="ob-prompt"><h2>{persona.describe.question}</h2></div>
          <div className="ob-composer">
            <TextArea label="Your project or topic" value={draft.description} maxLength={DESCRIPTION_MAX} rows={10}
              placeholder={persona.describe.placeholder} onChange={(description) => patchTopic({ description })} required
              hint={<>Paste relevant excerpts too — an abstract, README section, spec or problem statement. Links aren't fetched, so paste the text that matters. {draft.description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()} characters.</>} />
          </div>
        </div>
      );
      break;
    case 'topic':
      content = <TopicReview topic={draft.topic} onSuggestion={(description) => void validate(description)} onRewrite={() => navigate('describe')} />;
      break;
    case 'target':
      content = (
        <div className="stack ob-section">
          <h2>Who do you want to find?</h2>
          <div className="ob-targets" role="radiogroup" aria-label="Who do you want to find?">
            {targets.map(({ id, label, description }) => <SelectCard key={id} title={label} description={description}
              selected={draft.target === id} onSelect={() => chooseTarget(id)} />)}
          </div>
          {includesPeople(draft.target) && <div className="stack ob-rule">
            <CheckboxGroup legend="People I Want to Find" options={persona.individuals} value={draft.individualTypes}
              onChange={(individualTypes) => patch({ individualTypes })} selectAll />
            {'customDiscipline' in persona && <TextField label="Custom engineering discipline" value={draft.customDiscipline}
              onChange={(customDiscipline) => patch({ customDiscipline })} />}
          </div>}
          {includesOrgs(draft.target) && <div className="ob-rule">
            <CheckboxGroup legend="Organizations I Want to Find" options={persona.organizations} value={draft.orgTypes}
              onChange={(orgTypes) => patch({ orgTypes })} selectAll />
          </div>}
        </div>
      );
      break;
    case 'preferences':
      if ('preferences' in persona) content = <div className="stack ob-section">
        <h2>{persona.preferences.title} <span className="muted">(optional)</span></h2>
        {persona.preferences.groups.map((group) => {
          const current = draft.preferences[group.id];
          const change = (value: string | string[]) => {
            const preferences = { ...draft.preferences };
            if (value.length) preferences[group.id] = value;
            else delete preferences[group.id];
            patch({ preferences });
          };
          if (group.type === 'multi') return <CheckboxGroup key={group.id} legend={group.label}
            options={labelOptions(group.options ?? [])} value={Array.isArray(current) ? current : []} onChange={change} />;
          if (group.type === 'single') return <div key={group.id} className="stack">
            <RadioGroup legend={group.label} options={labelOptions(group.options ?? [])}
              value={typeof current === 'string' ? current : null} onChange={change} />
            {current && <div><Button variant="ghost" size="sm" onClick={() => change('')}>Clear {group.label.toLowerCase()}</Button></div>}
          </div>;
          return <TextField key={group.id} label={group.label} value={typeof current === 'string' ? current : ''}
            placeholder={'placeholder' in group ? group.placeholder : undefined} onChange={change} />;
        })}
      </div>;
      break;
    case 'sizes':
      content = <CheckboxGroup legend={<>Organization size {category !== 'company' && <span className="muted">(optional)</span>}</>}
        hint="Size indicates fit for your collaboration, not quality." options={ORG_SIZES} value={draft.sizes} onChange={(sizes) => {
          const anyAdded = sizes.includes('any') && !draft.sizes.includes('any');
          patch({ sizes: anyAdded ? ['any'] : sizes.length > 1 ? sizes.filter((size) => size !== 'any') : sizes });
        }} />;
      break;
    case 'geography':
      content = <GeographyFields value={draft.geography} persona={persona} me={me} skipOrganization={draft.skipOrganization}
        onChange={(geography) => patch({ geography })} />;
      break;
    case 'summary':
      content = <Summary draft={draft} persona={persona} me={me} onEdit={(to) => navigate(to, true)} />;
      break;
  }

  const summaryReady = steps.every(({ key }) => key === 'summary' || draft.completed.includes(key));
  const canContinue = step !== 'topic' || draft.topic?.is_specific;
  return (
    <section className="ob-page">
      <PageHeader title={persona.heading} subtitle={persona.supporting} eyebrow={persona.card.title}
        actions={<div className="ob-inline">
          <Button variant="ghost" size="sm" disabled={Boolean(busy) || orgBusy} onClick={onChangeCategory}>Change category</Button>
          {step !== 'profile' && <Button variant="ghost" size="sm" disabled={Boolean(busy) || orgBusy} onClick={() => navigate('profile', step === 'summary' || draft.returnToSummary)}>Your profile</Button>}
        </div>} />
      <nav className="ob-step-nav" aria-label="Search setup progress" inert={Boolean(busy) || orgBusy}>
        <Stepper steps={steps} current={step}
          completed={[...draft.completed.filter((key) => key !== 'summary'), ...(summaryReady ? ['summary' as const] : [])]}
          onSelect={(to) => navigate(to, to !== 'summary' && step === 'summary' ? true : draft.returnToSummary)} />
      </nav>
      <Card className="ob-wizard-card">
        <div ref={focus} tabIndex={-1} className="ob-step-content" aria-label={steps[index]?.label}>
          <div className="stack">
            <div inert={Boolean(busy)}>{content}</div>
            {failure && <Notice tone="danger">{failure}</Notice>}
            {step === 'summary' && (draft.sample || sampleMode) && <Notice tone="sample">This search uses sample data.</Notice>}
            {step === 'summary' && !draft.sample && !sampleMode && (authRequired || status?.crustdata.connected === false) &&
              <Notice tone="warning">Connect Crustdata in the header for live results, or choose Use sample data.</Notice>}
            {step !== 'organization' && step !== 'profile' && <div className="ob-actions">
              <Button variant="ghost" onClick={goBack} disabled={Boolean(busy)}>Back</Button>
              {step === 'summary' && !draft.sample && !sampleMode && sampleAvailable &&
                (authRequired || status?.crustdata.connected === false) && <Button variant="secondary"
                  disabled={Boolean(busy)} onClick={() => void startSearch(true)}>Use sample data</Button>}
              {canContinue && <Button size={step === 'summary' ? 'lg' : 'md'} loading={Boolean(busy)} onClick={advance}>
                {step === 'summary' ? 'Find Matches' : step === 'describe' ? <>Continue <span aria-hidden>↑</span></> : 'Continue'}
              </Button>}
              {busy === 'topic' && !canContinue && <span role="status">Checking your topic…</span>}
            </div>}
          </div>
        </div>
      </Card>
    </section>
  );
}

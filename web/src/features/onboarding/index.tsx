import { useState } from 'react';
import { PERSONA_ORDER, PERSONAS } from '@shared/catalog.js';
import { api, ApiError } from '../../api/client';
import type { AppStatus, Me, PersonaId, SearchRequest } from '../../api/types';
import { Button, Card, Notice, PageHeader, SelectCard, TextField, Toggle } from '../../ui';
import { Wizard } from './wizard';
import './onboarding.css';

export interface OnboardingAppProps {
  me: Me | null;
  status: AppStatus | null;
  onMeChange(me: Me | null): void;
  onSearchStarted(jobId: string, request: SearchRequest): void;
  editRequest?: SearchRequest | null;
}

function Login({ onMeChange }: Pick<OnboardingAppProps, 'onMeChange'>) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; field?: string }>();

  async function login() {
    if (busy) return;
    setBusy(true);
    setFailure(undefined);
    try {
      onMeChange(await api.login({ name: name.trim(), email: email.trim(), consent }));
    } catch (error) {
      const details = error instanceof ApiError && error.code === 'validation' ? error.details : undefined;
      const field = details && typeof details === 'object' && 'field' in details && typeof details.field === 'string'
        ? details.field : undefined;
      setFailure({ message: error instanceof Error ? error.message : 'Could not sign in. Try again.', field });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ob-narrow">
      <PageHeader title="Sign in" subtitle="Set up a search for people and organizations working on your technical problem." />
      <Card>
        <form className="stack" noValidate onSubmit={(event) => { event.preventDefault(); void login(); }}>
          <TextField label="Name" required value={name} onChange={setName} autoComplete="name"
            error={failure?.field === 'name' ? failure.message : undefined} />
          <TextField label="Email" required type="email" value={email} onChange={setEmail} autoComplete="email"
            error={failure?.field === 'email' ? failure.message : undefined} />
          <Toggle label="Store the profile details I add to personalize results."
            description="Optional. Stored only to improve relevance — never used for authentication."
            checked={consent} onChange={setConsent} />
          {!consent && <p className="muted">You can continue without consent. Your profile won't be stored or used.</p>}
          {failure && !['name', 'email'].includes(failure.field || '') && <Notice tone="danger">{failure.message}</Notice>}
          <Button type="submit" loading={busy}>Continue</Button>
        </form>
      </Card>
    </section>
  );
}

/** After sign-in: choose a category (once), then the wizard. No automatic profile lookup. */
function SignedIn({ me, status, onMeChange, onSearchStarted, editRequest }: OnboardingAppProps & { me: Me }) {
  const [screen, setScreen] = useState<'category' | null>(null);
  const [appliedEdit, setAppliedEdit] = useState<SearchRequest | null>(null);
  const [discardedEdit, setDiscardedEdit] = useState<SearchRequest | null>(null);
  const activeEdit = editRequest && editRequest !== discardedEdit ? editRequest : null;
  const [choosing, setChoosing] = useState<PersonaId | null>(null);
  const [error, setError] = useState('');

  async function chooseCategory(category: PersonaId) {
    if (choosing) return;
    setChoosing(category);
    setError('');
    try {
      onMeChange(await api.setCategory(category));
      if (activeEdit && category !== activeEdit.category) setDiscardedEdit(activeEdit);
      setScreen(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your category.');
    } finally {
      setChoosing(null);
    }
  }

  if (screen === 'category' || (!me.category && !activeEdit)) {
    return (
      <section className="ob-page">
        <PageHeader title="How would you describe yourself?" />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="ob-personas" role="radiogroup" aria-label="User category">
          {(PERSONA_ORDER as PersonaId[]).map((id) => <SelectCard key={id} {...PERSONAS[id].card}
            selected={(activeEdit?.category ?? me.category) === id} disabled={Boolean(choosing)} onSelect={() => void chooseCategory(id)} />)}
        </div>
        {me.category && <Button variant="ghost" onClick={() => setScreen(null)}>Back</Button>}
      </section>
    );
  }
  const category = activeEdit?.category ?? me.category;
  if (!category) return null;

  return <Wizard key={category} category={category} me={me} status={status} editRequest={appliedEdit === activeEdit ? null : activeEdit}
    onMeChange={onMeChange} onSearchStarted={onSearchStarted}
    onChangeCategory={() => { setAppliedEdit(activeEdit); setScreen('category'); }} />;
}

/** Route the user to their next incomplete onboarding step. */
export function OnboardingApp(props: OnboardingAppProps) {
  return props.me ? <SignedIn key={props.me.id} {...props} me={props.me} /> : <Login onMeChange={props.onMeChange} />;
}

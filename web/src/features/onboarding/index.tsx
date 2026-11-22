// PLACEHOLDER — Laptop 1 replaces this file's body with the full onboarding flow.
// Brief: docs/workstreams/laptop-1/CLAUDE.md. Keep the exported signature.
// It includes a minimal login and a "Run sample search" dev helper so Laptops 2–4 can test results now.
import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { AppStatus, Me, SearchRequest } from '../../api/types';
import { Button, Card, Notice, PageHeader, TextField, Toggle } from '../../ui';

export interface OnboardingAppProps {
  me: Me | null;
  status: AppStatus | null;
  onMeChange(me: Me | null): void;
  onSearchStarted(jobId: string, request: SearchRequest): void;
  editRequest?: SearchRequest | null;
}

const DEV_DESCRIPTION = "I'm building an LLM inference system and want to optimize KV-cache memory usage during long-context generation. I'm looking for people with experience in efficient attention and GPU inference.";

export function OnboardingApp({ me, onMeChange, onSearchStarted }: OnboardingAppProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setBusy(true); setError(null);
    try { onMeChange(await api.login({ name, email, consent })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const runSampleSearch = async () => {
    setBusy(true); setError(null);
    try {
      const v = await api.validateTopic({ description: DEV_DESCRIPTION, links: [], category: 'student' });
      const request: SearchRequest = {
        category: 'student', description: DEV_DESCRIPTION, links: [], spec: v.spec,
        objectives: ['Find experienced engineers or researchers'], target: 'both',
        individualTypes: ['research_scientists', 'pro_engineers', 'phd_postdoc'], orgTypes: ['startups', 'tech_companies', 'academic_labs'],
        preferences: {}, sizes: [], geography: { option: 'worldwide', allowUnverified: false, preferProximity: false }, sample: true,
      };
      const { jobId } = await api.startSearch(request);
      onSearchStarted(jobId, request);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : (e as Error).message);
    } finally { setBusy(false); }
  };

  if (!me) {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <PageHeader title="Sign in" subtitle="Placeholder login — Laptop 1 builds the real onboarding here." />
        <Card className="stack">
          <TextField label="Name" value={name} onChange={setName} autoComplete="name" />
          <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Toggle label="Use my name and email to find my professional profile" checked={consent} onChange={setConsent} />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button onClick={login} loading={busy}>Continue</Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader eyebrow="Placeholder" title={`Welcome, ${me.name}`} subtitle="Laptop 1 builds profile discovery, category selection and the persona wizards here." />
      <Card className="stack">
        <strong>Developer helper</strong>
        <p className="muted">Starts a "Both" search on sample data with a preset KV-cache topic, so the results screen can be built and tested before onboarding is done.</p>
        {error && <Notice tone="danger">{error}</Notice>}
        <div><Button onClick={runSampleSearch} loading={busy}>Run sample search</Button></div>
      </Card>
    </div>
  );
}

// On-demand work email for one person. Nothing is fetched until the user clicks, so loading a
// shortlist spends no contact credits. Only business emails Crustdata returns are shown, with attribution.
import { useState } from 'react';
import { api } from '../../api/client';
import type { IndividualCandidate, WorkEmailLookup } from '../../api/types';
import { Badge, Button } from '../../ui';
import { formatTime } from './labels';

export function WorkEmail({ jobId, candidate, onAddresses }: {
  jobId: string;
  candidate: IndividualCandidate;
  onAddresses(addresses: string[]): void;
}) {
  const [result, setResult] = useState<WorkEmailLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const hasProfile = Boolean(candidate.meta.linkedin) && !candidate.meta.academicOnly;

  async function lookup() {
    if (loading) return;
    setLoading(true);
    try {
      const lookup = await api.workEmail(jobId, candidate.candidate_id);
      setResult(lookup);
      onAddresses(lookup.status === 'found' && !lookup.sample ? lookup.emails.map(({ email }) => email) : []);
    } catch (err) {
      setResult({ status: 'error', emails: [], source: 'crustdata', retrievedAt: new Date().toISOString(), message: err instanceof Error ? err.message : 'The lookup failed. Try again.' });
    } finally {
      setLoading(false);
    }
  }

  if (!hasProfile) {
    return <span className="muted rs-small" title="Work emails are looked up from a matched professional profile">Work email: no matched professional profile</span>;
  }
  if (!result || (result.status === 'error' && !loading)) {
    return (
      <span className="rs-email">
        <Button size="sm" variant="ghost" loading={loading} onClick={() => void lookup()}
          title="Looks up business emails via Crustdata. May use 1 Crustdata credit when an email is found.">
          {result?.status === 'error' ? 'Retry work email' : 'View work email'}
        </Button>
        {result?.status === 'error' && <span className="rs-email__msg rs-email__msg--error" role="alert">{result.message}</span>}
      </span>
    );
  }
  if (result.status === 'found') {
    return (
      <span className="rs-email" aria-live="polite">
        {result.emails.map((e) => (
          <span key={e.email} className="rs-email__item">
            <a href={`mailto:${encodeURIComponent(e.email).replace('%40', '@')}`}>{e.email}</a>
            {e.status && <Badge tone={e.status === 'verified' ? 'success' : 'neutral'}>{e.status}</Badge>}
          </span>
        ))}
        <span className="muted rs-small">Work email via Crustdata · {formatTime(result.retrievedAt)}{result.sample ? ' · sample data' : ''}</span>
      </span>
    );
  }
  return (
    <span className="rs-email" aria-live="polite">
      <span className={`rs-email__msg ${result.status === 'unavailable' ? 'rs-email__msg--warn' : ''}`}>
        {result.status === 'none' ? `No work email on file. ${result.message && !/no business email/i.test(result.message) ? result.message : ''}` : result.message}
      </span>
      <span className="muted rs-small">via Crustdata</span>
    </span>
  );
}

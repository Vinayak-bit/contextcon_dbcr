import { useState } from 'react';
import { api } from '../../api/client';
import type { Candidate, OutreachDraft, OutreachPurpose } from '../../api/types';
import { Button, Drawer, Notice, Select, TextArea, TextField } from '../../ui';
import { formatTime } from './labels';

const purposes: { value: OutreachPurpose; label: string }[] = [
  { value: 'meeting', label: 'Arrange a meeting' },
  { value: 'research_internship', label: 'Ask about a research internship' },
  { value: 'internship', label: 'Ask about an internship' },
  { value: 'collaboration', label: 'Explore a potential collaboration' },
  { value: 'other', label: 'Other' },
];

const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u;

export function OutreachComposer({ jobId, candidate, addresses, onClose }: {
  jobId: string;
  candidate: Candidate;
  addresses: string[];
  onClose(): void;
}) {
  const [purpose, setPurpose] = useState<OutreachPurpose | ''>('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState(addresses[0] || '');
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const recipient = address.trim();
  const validAddress = emailPattern.test(recipient);
  const hasDraft = Boolean(draft?.subject.trim() && draft?.body.trim());
  const mailto = validAddress && draft && hasDraft
    ? `mailto:${encodeURIComponent(recipient).replace('%40', '@')}?subject=${encodeURIComponent(draft.subject.trim())}&body=${encodeURIComponent(draft.body.replace(/\r?\n/g, '\r\n'))}`
    : undefined;

  async function generate() {
    if (!purpose || busy) return;
    setBusy(true);
    setError('');
    setCopyStatus('');
    try {
      setDraft(await api.draftOutreach(jobId, candidate.candidate_id, { purpose, notes }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create the draft. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft() {
    if (!draft || !hasDraft) return;
    try {
      const headers = [validAddress ? `To: ${recipient}` : '', `Subject: ${draft.subject.trim()}`].filter(Boolean).join('\n');
      await navigator.clipboard.writeText(`${headers}\n\n${draft.body}`);
      setCopyStatus('Draft copied.');
    } catch {
      setCopyStatus('Clipboard unavailable. Select the subject and message to copy them.');
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Draft email to ${candidate.name || 'this result'}`}>
      <div className="stack rs-outreach">
        {candidate.meta.sample && <Notice tone="sample">Sample result. This recipient and its source records are fictional.</Notice>}
        <form className="stack" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
          <fieldset className="stack rs-outreach__fields" disabled={busy}>
            <Select label="Purpose" value={purpose} placeholder="Choose why you’re reaching out" required
              options={purposes} onChange={(value) => setPurpose(value as OutreachPurpose | '')} />
            <TextArea label={purpose === 'other' ? 'What would you like to ask?' : 'Details to include (optional)'}
              value={notes} onChange={setNotes} rows={3} maxLength={1000} required={purpose === 'other'} />
            <div>
              <Button type="submit" loading={busy} disabled={!purpose || (purpose === 'other' && !notes.trim())}>
                {draft ? 'Regenerate draft' : 'Generate draft'}
              </Button>
            </div>
            {draft && <p className="muted rs-small">Regenerating replaces the current subject and message.</p>}
          </fieldset>
        </form>
        {error && <Notice tone="danger">{error}</Notice>}
        {draft && (
          <div className="stack rs-outreach__editor">
            {addresses.length > 1 && <Select label="Work emails from Crustdata"
              placeholder="Choose a work email" options={addresses.map((email) => ({ value: email, label: email }))}
              value={addresses.includes(address) ? address : ''} onChange={setAddress} />}
            <TextField label="To" value={address} onChange={setAddress} type="email" autoComplete="off"
              error={recipient && !validAddress ? 'Enter one valid email address.' : undefined}
              hint="Add an address to open the draft in your email app." />
            <TextField label="Subject" value={draft.subject} disabled={busy} maxLength={150}
              onChange={(subject) => { setDraft({ ...draft, subject }); setCopyStatus(''); }} />
            <TextArea label="Message" value={draft.body} disabled={busy} rows={12} maxLength={2500}
              onChange={(body) => { setDraft({ ...draft, body }); setCopyStatus(''); }} />
            {draft.sources.length > 0 ? (
              <details>
                <summary>Public sources for this draft</summary>
                {draft.retrievedAt && <p className="muted rs-small">Retrieved {formatTime(draft.retrievedAt)}</p>}
                <ul>
                  {draft.sources.map((source) => <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">{source.text}</a>
                  </li>)}
                </ul>
              </details>
            ) : <Notice>There was no linked public evidence for this result. The draft uses your search topic and selected purpose.</Notice>}
            <div className="row">
              <Button variant="secondary" disabled={busy || !hasDraft} onClick={() => void copyDraft()}>Copy draft</Button>
              {mailto && !busy && <a className="ui-btn ui-btn--md ui-btn--primary" href={mailto}>Open in email app</a>}
            </div>
            <p className="muted rs-small">Review the draft before sending or scheduling it in your email app.</p>
            <span role="status">{copyStatus}</span>
          </div>
        )}
      </div>
    </Drawer>
  );
}

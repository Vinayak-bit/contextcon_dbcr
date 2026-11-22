// Exclusion counts and explicit, confirmed broadening (spec §6, §7). Nothing widens
// without the user reading what changes and clicking to confirm.
import { useEffect, useRef, useState } from 'react';
import type { ExcludedCounts } from '../../api/types';
import { Button } from '../../ui';
import { exclusionPhrases, unverifiedCount } from './labels';

/** "Excluded on this page: …" line; renders nothing when every count is zero. */
export function ExclusionLine({ counts, scope = 'this page' }: { counts: ExcludedCounts | undefined; scope?: string }) {
  const phrases = exclusionPhrases(counts);
  if (!phrases.length) return null;
  return <p className="rs-excluded"><strong>Excluded on {scope}:</strong> {phrases.join(', ')}.</p>;
}

/** Broadening actions: include unverified (with confirm) and change geography/types. */
export function BroadenActions({ counts, allowUnverified, fewResults, onIncludeUnverified, onEdit }: {
  counts: ExcludedCounts | undefined; allowUnverified: boolean; fewResults: boolean;
  onIncludeUnverified(): Promise<void>; onEdit(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const n = unverifiedCount(counts);
  const canInclude = !allowUnverified && n > 0;
  if (!canInclude && !fewResults) return null;
  return (
    <div className="rs-broaden">
      {canInclude && <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>Include unverified candidates</Button>}
      {fewResults && <Button size="sm" variant="ghost" onClick={onEdit}>Change geography or types</Button>}
      <ConfirmDialog
        open={confirming}
        title="Include unverified candidates?"
        confirmLabel="Run a new search with unverified included"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => { await onIncludeUnverified(); setConfirming(false); }}
      >
        <p>This starts a <strong>new search</strong> with one change:</p>
        <ul>
          <li>People and organizations whose <strong>location or role couldn't be verified</strong> will be included, labelled "Location unverified".</li>
        </ul>
        <p>Everything else stays the same: topic, candidate types, sizes and geography. {n} candidate{n === 1 ? ' was' : 's were'} excluded for this reason so far.</p>
      </ConfirmDialog>
    </div>
  );
}

/** Modal confirm dialog built on the native <dialog> (focus trap and Esc come for free). */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel: string; onConfirm(): Promise<void> | void; onCancel(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { setError(null); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);
  const confirm = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <dialog ref={ref} className="rs-dialog" aria-labelledby="rs-dialog-title" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <h2 id="rs-dialog-title">{title}</h2>
      <div className="rs-dialog__body">{children}</div>
      {error && <p className="ui-error" role="alert">{error}</p>}
      <div className="rs-dialog__actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button onClick={confirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}

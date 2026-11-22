// PLACEHOLDER — Laptop 2 replaces this file's body (popover details, OAuth polling, disconnect …).
// Brief: docs/workstreams/laptop-2/CLAUDE.md. Keep the exported signature.
import { useState } from 'react';
import { api } from '../../api/client';
import type { AppStatus } from '../../api/types';
import { Badge, Button } from '../../ui';

export interface ConnectionStatusProps { status: AppStatus | null; onStatusChange(s: AppStatus): void }

export function ConnectionStatus({ status, onStatusChange }: ConnectionStatusProps) {
  const [busy, setBusy] = useState(false);
  if (!status) return null;
  const c = status.crustdata;
  const connect = async () => {
    setBusy(true);
    try {
      const s = await api.connectCrustdata();
      onStatusChange(s);
      if (s.crustdata.authUrl) window.open(s.crustdata.authUrl, '_blank', 'noopener');
    } finally { setBusy(false); }
  };
  return (
    <span className="row" style={{ gap: 6 }}>
      {c.mode === 'sample' ? <Badge tone="sample">Sample data mode</Badge>
        : c.connected ? <Badge tone="success">Crustdata · {c.transport.toUpperCase()}</Badge>
          : <Button size="sm" variant="secondary" loading={busy} onClick={connect}>Connect Crustdata</Button>}
      <Badge tone={status.ranker === 'heuristic' ? 'neutral' : 'accent'}>AI: {status.ranker}</Badge>
    </span>
  );
}

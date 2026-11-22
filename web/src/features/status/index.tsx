// Header connection widget (Laptop 2): Crustdata connection + active AI engines, with a
// details popover, OAuth "Connect Crustdata" (opens sign-in, polls status) and Disconnect.
// Brief: docs/workstreams/laptop-2/CLAUDE.md. The exported signature is fixed.
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { AppStatus } from '../../api/types';
import { Button } from '../../ui';
import './status.css';

export interface ConnectionStatusProps { status: AppStatus | null; onStatusChange(s: AppStatus): void }

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'sample' | 'accent' | 'info';
const POLL_MS = 2000;
const POLL_MAX_MS = 3 * 60 * 1000;

/** Crustdata chip text + tone for a status. */
export function crustdataChip(s: AppStatus): { text: string; tone: Tone } {
  const c = s.crustdata;
  if (c.mode === 'sample') return { text: 'Sample data mode', tone: 'sample' };
  const via = `${c.transport.toUpperCase()}${c.auth === 'api_key' ? ' · API key' : c.auth === 'oauth' ? ' · OAuth' : ''}`;
  if (c.connected || c.state === 'connected') return { text: `Connected (${via})`, tone: 'success' };
  if (c.state === 'connecting') return { text: 'Connecting…', tone: 'info' };
  if (c.state === 'error' || c.error) return { text: 'Error', tone: 'danger' };
  if (c.auth === 'missing_key') return { text: 'API key missing', tone: 'danger' };
  return { text: 'Sign-in required', tone: 'warning' };
}

/** AI chip text from the active ranker (Jev is the default engine; see docs/RANKING.md). */
export function aiChip(s: AppStatus): { text: string; tone: Tone } {
  switch (s.ranker) {
    case 'jev': return { text: 'Ranking: Jev', tone: 'accent' };
    case 'llm': return { text: 'Ranking: DeepSeek', tone: 'accent' };
    case 'hybrid': return { text: 'Hybrid', tone: 'accent' };
    default: return { text: 'Heuristic (no AI keys)', tone: 'neutral' };
  }
}

export function ConnectionStatus({ status, onStatusChange }: ConnectionStatusProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const onChange = useRef(onStatusChange);
  onChange.current = onStatusChange;

  // Close popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // After opening the sign-in tab: poll /status every 2 s for up to 3 min.
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await api.status();
        if (stopped) return;
        if (s.crustdata.connected || s.crustdata.state === 'connected') {
          onChange.current(s); setWaiting(false); setMessage('Crustdata connected.'); return;
        }
        if (s.crustdata.state === 'error') { onChange.current(s); setWaiting(false); setMessage(s.crustdata.error || 'Sign-in failed.'); return; }
      } catch { /* keep trying until timeout */ }
      if (stopped) return;
      if (Date.now() - started > POLL_MAX_MS) { setWaiting(false); setMessage('Still not connected after 3 minutes. Try Connect again.'); return; }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [waiting]);

  if (!status) return null;
  const c = status.crustdata;
  const cd = crustdataChip(status);
  const ai = aiChip(status);
  const connected = c.connected || c.state === 'connected';
  // Brief: offer Connect when state is disconnected|needs_auth|error and auth is oauth (MCP without an API key).
  const canConnect = !connected && c.auth === 'oauth' && (c.state === undefined || c.state === 'disconnected' || c.state === 'needs_auth' || c.state === 'error');
  const canDisconnect = connected && c.auth === 'oauth';

  const connect = async () => {
    setBusy(true); setMessage(null);
    try {
      const s = await api.connectCrustdata();
      onStatusChange(s);
      if (s.crustdata.connected || s.crustdata.state === 'connected') { setMessage('Crustdata connected.'); return; }
      if (s.crustdata.authUrl) {
        window.open(s.crustdata.authUrl, '_blank', 'noopener');
        setMessage('Finish signing in in the new tab…');
        setWaiting(true);
      } else if (s.crustdata.state === 'connecting') {
        setWaiting(true);
      } else if (s.crustdata.error) {
        setMessage(s.crustdata.error);
      }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setMessage(null);
    try { onStatusChange(await api.disconnectCrustdata()); setMessage('Disconnected from Crustdata.'); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };

  const tools = c.tools ? Object.entries(c.tools) : [];

  return (
    <div className="st-root" ref={root}>
      <button type="button" className="st-trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} title="Connection and AI engine details">
        <span className={`st-chip st-chip--${cd.tone}`}><span className="st-dot" aria-hidden /><span className="st-prefix">Crustdata: </span>{waiting ? 'Waiting for sign-in…' : cd.text}</span>
        <span className={`st-chip st-chip--${ai.tone} st-chip--ai`}>{ai.text}</span>
      </button>
      {canConnect && !open && (
        <Button size="sm" variant="secondary" loading={busy || waiting} onClick={connect} className="st-connect-inline">Connect Crustdata</Button>
      )}

      {open && (
        <div className="st-popover" role="dialog" aria-label="Connection details">
          <section>
            <h3>Crustdata</h3>
            <dl className="st-dl">
              <dt>Status</dt><dd>{cd.text}</dd>
              <dt>Mode</dt><dd>{c.mode.toUpperCase()}</dd>
              {c.endpoint && <><dt>Endpoint</dt><dd className="st-mono">{c.endpoint}</dd></>}
              <dt>Auth</dt><dd>{({ api_key: 'API key', oauth: 'OAuth', none: 'None', missing_key: 'Missing API key' } as const)[c.auth]}</dd>
              {c.sampleAvailable && c.mode !== 'sample' && <><dt>Sample data</dt><dd>Available</dd></>}
            </dl>
            {c.error && <p className="st-error" role="alert">{c.error}</p>}
            {tools.length > 0 && (
              <details className="st-tools">
                <summary>Discovered tools ({tools.length})</summary>
                <ul>{tools.map(([k, v]) => <li key={k}><span className="st-mono">{k}</span>{v && v !== k ? <> → <span className="st-mono">{v}</span></> : null}</li>)}</ul>
              </details>
            )}
            <div className="row">
              {canConnect && <Button size="sm" loading={busy || waiting} onClick={connect}>Connect Crustdata</Button>}
              {canDisconnect && <Button size="sm" variant="ghost" loading={busy} onClick={disconnect}>Disconnect</Button>}
            </div>
          </section>
          <section>
            <h3>AI engines</h3>
            <dl className="st-dl">
              <dt>Ranking</dt><dd>{ai.text.replace(/^Ranking: /, '')}</dd>
              <dt>Jev</dt><dd>{status.jev.enabled ? <>On · scores candidates · <span className="st-mono">{status.jev.model}</span></> : 'Off (no key)'}</dd>
              <dt>DeepSeek</dt><dd>{status.llm.enabled ? <>On · understanding & evidence{status.ranker === 'llm' ? ' + ranking' : ''} · <span className="st-mono">{status.llm.model}</span> / <span className="st-mono">{status.llm.fastModel}</span></> : 'Off (no key)'}</dd>
            </dl>
          </section>
          {message && <p className="st-message" role="status">{message}</p>}
        </div>
      )}
      {!open && message && <span className="visually-hidden" role="status">{message}</span>}
    </div>
  );
}

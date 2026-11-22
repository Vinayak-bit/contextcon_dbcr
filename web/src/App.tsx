// App shell — owned by Laptop 4. Bootstraps the session and switches between the
// onboarding flow (Laptop 1) and results (Laptop 2). Feature internals live in features/*.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import type { AppStatus, Me, SearchRequest } from './api/types';
import { Button, Spinner } from './ui';
import { OnboardingApp } from './features/onboarding';
import { ResultsApp } from './features/results';
import { ConnectionStatus } from './features/status';

type Screen = { name: 'onboarding'; editRequest: SearchRequest | null } | { name: 'results'; jobId: string };

function screenFromHash(): Screen {
  const m = window.location.hash.match(/^#\/results\/([\w-]+)/);
  return m ? { name: 'results', jobId: m[1] } : { name: 'onboarding', editRequest: null };
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [screen, setScreen] = useState<Screen>(screenFromHash);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null)).finally(() => setBooting(false));
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goResults = useCallback((jobId: string) => {
    window.location.hash = `#/results/${jobId}`;
    setScreen({ name: 'results', jobId });
    window.scrollTo(0, 0);
  }, []);
  const goOnboarding = useCallback((editRequest: SearchRequest | null) => {
    if (window.location.hash) window.history.pushState(null, '', window.location.pathname);
    setScreen({ name: 'onboarding', editRequest });
    window.scrollTo(0, 0);
  }, []);

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setMe(null);
    goOnboarding(null);
  };

  return (
    <>
      <header className="app-header">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); goOnboarding(null); }}>
          <span className="brand-mark" aria-hidden />
          Overlap
          <span className="brand-tag">research & engineering expertise discovery</span>
        </a>
        <span className="spacer" />
        <ConnectionStatus status={status} onStatusChange={setStatus} />
        {me && (
          <span className="app-user">
            <span className="user-name">{me.name}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
          </span>
        )}
      </header>
      <main className="app-main">
        {booting ? (
          <div className="app-loading"><Spinner label="Loading…" /></div>
        ) : screen.name === 'results' && me ? (
          <ResultsApp
            jobId={screen.jobId}
            onEditSearch={(request) => goOnboarding(request)}
            onRerun={(jobId) => goResults(jobId)}
            onNewSearch={() => goOnboarding(null)}
          />
        ) : (
          <OnboardingApp
            me={me}
            status={status}
            onMeChange={setMe}
            onSearchStarted={(jobId) => goResults(jobId)}
            editRequest={screen.name === 'onboarding' ? screen.editRequest : null}
          />
        )}
      </main>
    </>
  );
}

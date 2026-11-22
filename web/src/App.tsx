// App shell — bootstraps the session, renders the shared header/footer chrome, and switches between
// the landing page, sign-in + onboarding (Laptop 1) and results (Laptop 2).
// Routes (hash): '' → landing (signed out) or onboarding (signed in); #/signin; #/overview (landing
// for signed-in users); #/results/:id. In-page section links scroll without touching the hash.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import type { AppStatus, Me, PersonaId, SearchRequest } from './api/types';
import { Button, Footer, Header, PageWaves, Spinner, type FooterColumn, type NavItem } from './components/ui';
import { OnboardingApp } from './features/onboarding';
import { ResultsApp } from './features/results';
import { ConnectionStatus } from './features/status';

const Landing = lazy(() => import('./features/landing').then((m) => ({ default: m.Landing })));

type Screen =
  | { name: 'home'; editRequest: SearchRequest | null }
  | { name: 'signin' }
  | { name: 'overview' }
  | { name: 'results'; jobId: string };

function screenFromHash(): Screen {
  const h = window.location.hash;
  const m = h.match(/^#\/results\/([\w-]+)/);
  if (m) return { name: 'results', jobId: m[1] };
  if (h === '#/signin') return { name: 'signin' };
  if (h === '#/overview') return { name: 'overview' };
  return { name: 'home', editRequest: null };
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  return true;
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const pendingPersona = useRef<PersonaId | null>(null);
  const pendingSection = useRef<string | null>(null);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null)).finally(() => setBooting(false));
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next: Screen, hash: string) => {
    if (hash) window.location.hash = hash;
    else if (window.location.hash) window.history.pushState(null, '', window.location.pathname);
    setScreen(next);
    window.scrollTo(0, 0);
  }, []);
  const goResults = useCallback((jobId: string) => go({ name: 'results', jobId }, `#/results/${jobId}`), [go]);
  const goHome = useCallback((editRequest: SearchRequest | null = null) => go({ name: 'home', editRequest }, ''), [go]);
  const goSignIn = useCallback(() => go({ name: 'signin' }, '#/signin'), [go]);

  /** "Find your experts" / "Get started": sign in if needed, otherwise straight into setup. */
  const start = useCallback((persona?: PersonaId) => {
    pendingPersona.current = persona ?? null;
    if (me) {
      if (persona && persona !== me.category) void api.setCategory(persona).then(setMe).catch(() => undefined);
      goHome();
    } else goSignIn();
  }, [me, goHome, goSignIn]);

  /** Signed in: apply a persona picked on the landing page if no category is set yet. */
  const onMeChange = useCallback((next: Me | null) => {
    setMe(next);
    const persona = pendingPersona.current;
    pendingPersona.current = null;
    if (next && persona && !next.category) void api.setCategory(persona).then(setMe).catch(() => undefined);
    if (next && screenFromHash().name === 'signin') goHome();
  }, [goHome]);

  /** Section links: scroll on the landing page, or open it and scroll after it renders. */
  const toSection = useCallback((id: string) => {
    const onLanding = screen.name === 'overview' || (screen.name === 'home' && !me);
    if (onLanding && scrollToId(id)) return;
    pendingSection.current = id;
    if (me) go({ name: 'overview' }, '#/overview'); else goHome();
  }, [screen.name, me, go, goHome]);

  useEffect(() => {
    const id = pendingSection.current;
    if (!id) return;
    let tries = 0;
    const attempt = () => { if (scrollToId(id) || ++tries > 20) pendingSection.current = null; else window.setTimeout(attempt, 50); };
    attempt();
  }, [screen]);

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setMe(null);
    goHome();
  };

  const showLanding = !booting && (screen.name === 'overview' || (screen.name === 'home' && !me));
  const section = (label: string, id: string): NavItem => ({ label, href: `#${id}`, onClick: () => toSection(id) });
  const nav: NavItem[] = showLanding
    ? [section('How it works', 'how'), section('For researchers', 'people'), section('For engineering teams', 'people'), section('Trust', 'trust')]
    : [];
  const footer: FooterColumn[] = [
    { title: 'Product', links: [section('How it works', 'how'), section('Ranking', 'ranking'), section('Evidence', 'evidence')] },
    { title: 'Company', links: [section('Who it’s for', 'people'), section('Trust & privacy', 'trust')] },
    { title: 'Legal', links: [section('Privacy & consent', 'trust')] },
  ];

  let actions;
  if (me) {
    actions = (
      <>
        <ConnectionStatus status={status} onStatusChange={setStatus} />
        <span className="ui-header__user ui-header__hide-sm">{me.name}</span>
        <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
      </>
    );
  } else if (screen.name !== 'signin') {
    actions = (
      <>
        <a className="ui-header__plain ui-header__hide-sm" href="#/signin" onClick={(e) => { e.preventDefault(); goSignIn(); }}>Sign in</a>
        <span className="ui-header__hide-sm"><Button size="sm" onClick={() => start()}>Get started</Button></span>
      </>
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <Header onHome={() => goHome()} nav={nav} actions={actions}
        mobileExtra={!me && showLanding ? [{ label: 'Sign in', href: '#/signin', onClick: goSignIn }] : undefined} />
      {!showLanding && <PageWaves />}
      <main id="main" ref={main} tabIndex={-1} className={showLanding ? 'app-main app-main--flush' : 'app-main'}>
        {booting ? (
          <div className="app-loading"><Spinner label="Loading…" /></div>
        ) : showLanding ? (
          <Suspense fallback={<div className="app-loading"><Spinner label="Loading…" /></div>}>
            <Landing onStart={start} />
          </Suspense>
        ) : screen.name === 'results' && me ? (
          <ResultsApp
            jobId={screen.jobId}
            onEditSearch={(request) => goHome(request)}
            onRerun={(jobId) => goResults(jobId)}
            onNewSearch={() => goHome()}
          />
        ) : (
          <OnboardingApp
            me={me}
            status={status}
            onMeChange={onMeChange}
            onSearchStarted={(jobId) => goResults(jobId)}
            editRequest={screen.name === 'home' ? screen.editRequest : null}
          />
        )}
      </main>
      <Footer onHome={() => goHome()} columns={footer}
        blurb="Expertise discovery for research and engineering, ranked by demonstrated work."
        note="© 2026 Overlap. Example people and organizations shown as illustrative are fictional." />
    </div>
  );
}

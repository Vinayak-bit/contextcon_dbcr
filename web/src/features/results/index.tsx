// Results experience (Laptop 2): live progress, Individuals/Organizations tabs, ranked cards
// with evidence, ranking drawer, pagination with load-more, exclusions and explicit broadening.
// Brief: docs/workstreams/laptop-2/CLAUDE.md. The exported signature is fixed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Candidate, ResultsPage, SearchJob, SearchRequest, TabKey, TabStatus } from '../../api/types';
import { Button, EmptyState, Notice, Spinner, Tabs, usePolling } from '../../ui';
import { CandidateCard } from './CandidateCard';
import { BroadenActions, ExclusionLine } from './Exclusions';
import { TabProgress } from './Progress';
import { RankingDrawer } from './RankingDrawer';
import { EnginesFooter, SummaryBar } from './Summary';
import { TAB_LABELS } from './labels';
import './results.css';

/** Props App.tsx passes to the results screen (fixed contract, see the Laptop 2 brief). */
export interface ResultsAppProps {
  jobId: string;
  onEditSearch(request: SearchRequest): void;
  onRerun(jobId: string, request: SearchRequest): void;
  onNewSearch(): void;
}

/** Per-tab view state. Fetched pages are cached so Previous is instant and order is stable. */
interface TabView {
  page: number;
  pages: Record<number, ResultsPage>;
  /** Waiting for the server to build this page number after "Next" on the last page. */
  awaitingPage: number | null;
  loading: boolean;
  error: string | null;
}
const emptyView = (): TabView => ({ page: 1, pages: {}, awaitingPage: null, loading: false, error: null });

const SAMPLE_BANNER = 'Sample data — fictional people and organizations for trying the product. Connect Crustdata for real results.';
const FEW_RESULTS = 10;
const isActive = (t: TabStatus | undefined) => Boolean(t && (t.status === 'queued' || t.status === 'running'));

/**
 * Results screen for one search job: polls the job, shows per-tab progress, ranked cards,
 * pagination (with load-more), the ranking drawer, exclusions and confirmed broadening.
 */
export function ResultsApp({ jobId, onEditSearch, onRerun, onNewSearch }: ResultsAppProps) {
  const [job, setJob] = useState<SearchJob | null>(null);
  const [jobError, setJobError] = useState<ApiError | Error | null>(null);
  const [views, setViews] = useState<Partial<Record<TabKey, TabView>>>({});
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [details, setDetails] = useState<Candidate | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [rerunError, setRerunError] = useState<ApiError | Error | null>(null);
  const listTop = useRef<HTMLDivElement>(null);
  const viewsRef = useRef(views);
  viewsRef.current = views;

  // Reset everything when navigating to a different job.
  useEffect(() => { setJob(null); setJobError(null); setViews({}); setActiveTab(null); setDetails(null); setDismissed([]); setRerunError(null); }, [jobId]);

  const tabKeys = job ? (['individuals', 'organizations'] as TabKey[]).filter((k) => job.tabs[k]) : [];
  const tab = activeTab && tabKeys.includes(activeTab) ? activeTab : tabKeys[0] ?? null;

  const patchView = useCallback((k: TabKey, patch: Partial<TabView> | ((v: TabView) => Partial<TabView>)) => {
    setViews((prev) => {
      const cur = prev[k] ?? emptyView();
      return { ...prev, [k]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } };
    });
  }, []);

  const fetchPage = useCallback(async (k: TabKey, n: number, show: boolean) => {
    patchView(k, { loading: true, error: null });
    try {
      const p = await api.results(jobId, k, n);
      patchView(k, (v) => ({ pages: { ...v.pages, [n]: p }, loading: false, ...(show ? { page: n, awaitingPage: null } : {}) }));
      return true;
    } catch (e) {
      patchView(k, { loading: false, error: (e as Error).message });
      return false;
    }
  }, [jobId, patchView]);

  // After each job update: show page 1 as soon as it's ready; land on a load-more page once built.
  const syncPages = useCallback((j: SearchJob) => {
    for (const k of ['individuals', 'organizations'] as TabKey[]) {
      const t = j.tabs[k]; if (!t) continue;
      const v = viewsRef.current[k] ?? emptyView();
      if (v.loading) continue;
      if (t.pagesReady >= 1 && !v.pages[1] && !v.error) void fetchPage(k, 1, v.page === 1);
      else if (v.awaitingPage && t.pagesReady >= v.awaitingPage) void fetchPage(k, v.awaitingPage, true);
      else if (v.awaitingPage && !isActive(t)) patchView(k, { awaitingPage: null, ...(t.status === 'error' ? { error: t.error || 'Loading more failed.' } : {}) });
    }
  }, [fetchPage, patchView]);

  const anyAwaiting = Object.values(views).some((v) => v?.awaitingPage);
  const needsPage1 = job ? tabKeysOf(job).some((k) => (job.tabs[k]?.pagesReady ?? 0) >= 1 && !views[k]?.pages[1] && !views[k]?.error) : false;
  // A client error (404 not found, 401 signed out…) is final and stops polling; Retry restarts it.
  // Network failures and 5xx keep polling, with a warning until a poll succeeds again.
  const fatal = jobError instanceof ApiError && jobError.status >= 400 && jobError.status < 500;
  const polling = !fatal && (!job || Object.values(job.tabs).some(isActive) || anyAwaiting || needsPage1);

  usePolling(async () => {
    try {
      const j = await api.job(jobId);
      setJob(j); setJobError(null);
      syncPages(j);
    } catch (e) { setJobError(e as Error); }
  }, 1500, polling);

  const retryJob = () => setJobError(null); // re-enables polling

  const goToPage = async (k: TabKey, n: number) => {
    if (!job) return;
    const t = job.tabs[k]; const v = views[k] ?? emptyView();
    if (!t || n < 1) return;
    listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (v.pages[n]) { patchView(k, { page: n, error: null }); return; }
    if (n <= t.pagesReady) { await fetchPage(k, n, true); return; }
    if (n === t.pagesReady + 1 && t.hasMore) {
      patchView(k, { awaitingPage: n, error: null });
      try { const j = await api.loadMore(jobId, k); setJob(j); }
      catch (e) { patchView(k, { awaitingPage: null, error: (e as Error).message }); }
    }
  };

  const rerun = async (request: SearchRequest) => {
    setRerunError(null);
    try {
      const { jobId: next } = await api.startSearch(request);
      onRerun(next, request);
    } catch (e) { setRerunError(e as Error); throw e; }
  };

  // ---------------------------------------------------------------- render ---
  if (!job) {
    if (jobError && !fatal) return <div className="rs-center"><Spinner label={`Can't reach the server (${jobError.message}). Retrying…`} /></div>;
    if (jobError) {
      const notFound = jobError instanceof ApiError && jobError.status === 404;
      return (
        <EmptyState title={notFound ? 'Search not found' : "Couldn't load this search"} action={
          <div className="row" style={{ justifyContent: 'center' }}>
            {!notFound && <Button onClick={retryJob}>Retry</Button>}
            <Button variant="secondary" onClick={onNewSearch}>New search</Button>
          </div>}>
          {notFound ? 'It may have expired when the server restarted.' : jobError.message}
        </EmptyState>
      );
    }
    return <div className="rs-center"><Spinner label="Loading your search…" /></div>;
  }

  const showTabs = job.request.target === 'both' && tabKeys.length > 1;
  const status = tab ? job.tabs[tab] : undefined;
  const view = tab ? views[tab] ?? emptyView() : emptyView();
  const page = view.pages[view.page];
  const awaiting = view.awaitingPage !== null;

  return (
    <div className="stack rs-root">
      <SummaryBar job={job} onEdit={() => onEditSearch(job.request)} onNew={onNewSearch} />

      {job.sample && <Notice tone="sample">{SAMPLE_BANNER}</Notice>}
      {jobError && <Notice tone="warning">Lost connection to the server ({jobError.message}). Retrying automatically…</Notice>}
      {job.error && <Notice tone="danger">{job.error}</Notice>}
      {job.warnings.map((w, i) => !dismissed.includes(i) && <Notice key={i} tone="warning" onDismiss={() => setDismissed((d) => [...d, i])}>{w}</Notice>)}
      {rerunError && <RerunError error={rerunError} onSample={() => rerun({ ...job.request, sample: true }).catch(() => undefined)} />}

      {showTabs && (
        <Tabs tabs={tabKeys.map((k) => ({ key: k, label: job.tabs[k]?.status === 'error' ? `${TAB_LABELS[k]} · failed` : TAB_LABELS[k], count: countFor(views[k]) }))} value={tab!} onChange={(k) => { setActiveTab(k); setDetails(null); }} />
      )}

      {/* Progress for every running tab, so both stay visible while one is shown. */}
      {tabKeys.filter((k) => isActive(job.tabs[k]) && (k === tab || !views[k]?.pages[1])).map((k) => (
        <TabProgress key={k} tab={k} status={job.tabs[k]!} compact={k !== tab || Boolean(views[k]?.pages[1])} />
      ))}

      {tab && status && (
        <section className="stack" aria-label={`${TAB_LABELS[tab]} results`}>
          <div ref={listTop} className="rs-list-top" />
          {status.status === 'error' && <TabProgress tab={tab} status={status} onRetry={() => rerun(job.request).catch(() => undefined)} />}
          {view.error && <Notice tone="danger" action={<Button size="sm" variant="secondary" onClick={() => fetchPage(tab, view.page, true)}>Retry</Button>}>Couldn't load page {view.page}: {view.error}</Notice>}

          {page && (
            <>
              <div className="rs-page-head">
                <span><strong>{TAB_LABELS[tab]}</strong> · Page {page.page} · {page.candidates.length} result{page.candidates.length === 1 ? '' : 's'}</span>
                <ExclusionLine counts={page.excluded} />
              </div>
              {page.page >= 2 && page.note && <Notice tone="info">{page.note}</Notice>}
              <BroadenActions
                counts={sumCounts(page.excluded, status.excludedTotals)}
                allowUnverified={job.request.geography.allowUnverified}
                fewResults={page.page === 1 && page.candidates.length < FEW_RESULTS && !page.hasMore}
                onIncludeUnverified={() => rerun({ ...job.request, geography: { ...job.request.geography, allowUnverified: true } })}
                onEdit={() => onEditSearch(job.request)}
              />
              {page.candidates.length === 0 ? (
                <EmptyState title="No matches on this page" action={<Button variant="secondary" onClick={() => onEditSearch(job.request)}>Change geography or types</Button>}>
                  Every candidate found was excluded by your constraints.{' '}
                  <ExclusionLine counts={page.excluded} />
                  Nothing is broadened automatically.
                </EmptyState>
              ) : (
                <ol className="rs-cards">
                  {page.candidates.map((c) => <li key={c.candidate_id}><CandidateCard candidate={c} onDetails={setDetails} /></li>)}
                </ol>
              )}
              <Pager
                page={view.page}
                canPrev={view.page > 1}
                canNext={view.page < status.pagesReady || status.hasMore}
                atEnd={view.page === status.pagesReady && !status.hasMore}
                busy={view.loading || awaiting}
                onPrev={() => goToPage(tab, view.page - 1)}
                onNext={() => goToPage(tab, view.page + 1)}
              />
            </>
          )}
          {!page && !isActive(status) && status.status !== 'error' && !view.error && (view.loading || status.pagesReady >= 1
            ? <div className="rs-center"><Spinner label="Loading results…" /></div>
            : (
              <>
                <EmptyState title="No matches for these constraints" action={<Button variant="secondary" onClick={() => onEditSearch(job.request)}>Change geography or types</Button>}>
                  <ExclusionLine counts={status.excludedTotals} scope="this search" />
                  Nothing is broadened automatically.
                </EmptyState>
                <BroadenActions counts={status.excludedTotals} allowUnverified={job.request.geography.allowUnverified} fewResults={false}
                  onIncludeUnverified={() => rerun({ ...job.request, geography: { ...job.request.geography, allowUnverified: true } })}
                  onEdit={() => onEditSearch(job.request)} />
              </>
            ))}
        </section>
      )}

      <EnginesFooter job={job} />
      <RankingDrawer jobId={jobId} candidate={details} onClose={() => setDetails(null)} />
    </div>
  );
}

function Pager({ page, canPrev, canNext, atEnd, busy, onPrev, onNext }: { page: number; canPrev: boolean; canNext: boolean; atEnd: boolean; busy: boolean; onPrev(): void; onNext(): void }) {
  return (
    <nav className="rs-pager" aria-label="Pages">
      <Button variant="secondary" disabled={!canPrev || busy} onClick={onPrev}>← Previous</Button>
      <span aria-current="page">Page {page}</span>
      {atEnd ? <span className="muted">No more matches for these constraints.</span>
        : <Button variant="secondary" disabled={!canNext} loading={busy} onClick={onNext}>Next →</Button>}
    </nav>
  );
}

function RerunError({ error, onSample }: { error: Error; onSample(): void }) {
  const [busy, setBusy] = useState(false);
  if (error instanceof ApiError && error.code === 'crustdata_auth_required') {
    const connect = async () => {
      setBusy(true);
      try { const s = await api.connectCrustdata(); if (s.crustdata.authUrl) window.open(s.crustdata.authUrl, '_blank', 'noopener'); }
      finally { setBusy(false); }
    };
    return (
      <Notice tone="warning" title="Crustdata sign-in required" action={<div className="row"><Button size="sm" loading={busy} onClick={connect}>Connect Crustdata</Button><Button size="sm" variant="ghost" onClick={onSample}>Use sample data</Button></div>}>
        The new search needs live data. Sign in to Crustdata, then try again, or run it on sample data.
      </Notice>
    );
  }
  return <Notice tone="danger">Couldn't start the new search: {error.message}</Notice>;
}

const tabKeysOf = (j: SearchJob) => (['individuals', 'organizations'] as TabKey[]).filter((k) => j.tabs[k]);

/** Candidates ranked so far in the pages we have, or undefined before page 1 arrives. */
function countFor(v: TabView | undefined): number | undefined {
  if (!v?.pages[1]) return undefined;
  return Object.values(v.pages).reduce((n, p) => n + p.candidates.length, 0);
}

/** The larger of page and tab totals per reason, so the offer shows whenever anything was excluded. */
function sumCounts(a: ResultsPage['excluded'] | undefined, b: ResultsPage['excluded'] | undefined): ResultsPage['excluded'] | undefined {
  if (!a) return b; if (!b) return a;
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof typeof b)[]) out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  return out;
}

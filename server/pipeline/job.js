// Search jobs (owned by Laptop 4): runs the individual and organization pipelines in
// parallel, one results page at a time: retrieve + verify (Laptop 3) → extract evidence →
// rank → cache the ranked page so ordering stays stable.
import { config, resultsPageSize } from '../config.js';
import { crustdata, Meter } from '../crustdata/index.js';
import { chatJson } from '../llm/deepseek.js';
import { extractEvidence } from '../llm/extract.js';
import { activeRanker, rankCandidates, sortRanked } from '../ranking/index.js';
import { jobStore } from '../store.js';
import { HttpError, chunk, mapLimit, nowIso, uid } from '../util.js';
import { resolvePrefs, summarize } from './prefs.js';
import { retrieveIndividualsPage } from './individuals.js';
import { retrieveOrganizationsPage } from './organizations.js';

const jobs = new Map();
const STAGE_LABELS = { queued: 'Queued', searching: 'Searching', academic: 'Academic search', prefilter: 'Pre-filtering', enriching: 'Enriching profiles', verifying: 'Verifying constraints', extracting: 'Extracting evidence', ranking: 'Ranking', done: 'Done', error: 'Error' };
/** Every ExcludedCounts key (web/src/api/types.ts), so clients never see a missing counter. */
export const emptyExcluded = () => ({ geography: 0, unverified_location: 0, role: 0, unverified_role: 0, org_type: 0, size: 0, duplicates: 0 });

function newTab() {
  return { status: 'queued', stage: 'queued', stageLabel: STAGE_LABELS.queued, pagesReady: 0, hasMore: true, log: [], excludedTotals: emptyExcluded(), pages: [], state: {}, page: 0 };
}

/** Create and start a job. Throws HttpError(400 validation | 409 crustdata_auth_required). */
export async function createJob(user, request) {
  const prefs = resolvePrefs(request, user.profile, user.organization);
  const sample = await crustdata.resolveSample(Boolean(request.sample));
  const job = {
    id: uid('j_'),
    userId: user.id,
    createdAt: nowIso(),
    status: 'running',
    request,
    prefs,
    spec: request.spec,
    summary: summarize(request, prefs),
    sample,
    engines: { llm: config.llm.enabled ? 'deepseek' : 'heuristic', ranker: activeRanker(), crustdata: sample ? 'sample' : crustdata.mode },
    tabs: {},
    meter: new Meter(),
    llmUsage: { calls: 0, promptTokens: 0, completionTokens: 0 },
    jevUsage: { calls: 0 },
    warnings: [],
    userProfile: user.profile,
    organization: user.organization,
  };
  if (prefs.target !== 'organizations') job.tabs.individuals = newTab();
  if (prefs.target !== 'individuals') job.tabs.organizations = newTab();
  jobs.set(job.id, job);
  Promise.all(Object.keys(job.tabs).map((k) => buildPage(job, k))).finally(() => finish(job));
  return job;
}

function finish(job) {
  const tabs = Object.values(job.tabs);
  if (tabs.some((t) => t.status === 'running' || t.status === 'queued')) return;
  job.status = tabs.every((t) => t.status === 'error') ? 'error' : 'done';
  persist(job);
}

function makeCtx(job, key) {
  const tab = job.tabs[key];
  return {
    jobId: job.id,
    spec: job.spec,
    request: job.request,
    prefs: job.prefs,
    userProfile: job.userProfile,
    organization: job.organization,
    sample: job.sample,
    crustdata,
    meter: job.meter,
    limits: {
      searchLimitPerQuery: config.crustdata.searchLimitPerQuery,
      maxQueriesPerPage: config.crustdata.maxQueriesPerPage,
      enrichPerPage: Math.min(config.crustdata.enrichPerPage, resultsPageSize),
      researchProfiles: config.crustdata.researchProfiles,
      devPlatformProfiles: config.crustdata.devPlatformProfiles,
      academicWebSearch: config.crustdata.academicWebSearch,
    },
    stage(stage, label, progress) {
      tab.stage = stage;
      tab.stageLabel = label || STAGE_LABELS[stage] || stage;
      tab.progress = progress;
      this.log(tab.stageLabel);
    },
    log(message) {
      tab.log.push({ at: nowIso(), message: String(message) });
      if (tab.log.length > 60) tab.log.splice(0, tab.log.length - 60);
    },
    warnings: job.warnings,
    llm: { enabled: config.llm.enabled, chatJson, usage: job.llmUsage },
  };
}

async function buildPage(job, key) {
  const tab = job.tabs[key];
  tab.status = 'running';
  tab.error = undefined;
  tab.page = tab.pagesReady + 1;
  const ctx = makeCtx(job, key);
  try {
    const retrieve = key === 'individuals' ? retrieveIndividualsPage : retrieveOrganizationsPage;
    const { candidates, excluded: rawExcluded, hasMore } = await retrieve(ctx, tab);
    const excluded = { ...emptyExcluded(), ...rawExcluded };
    if (candidates.length) {
      // Extraction and scoring overlap: each group of 4 is scored as soon as its evidence is extracted.
      ctx.stage('ranking', 'Extracting evidence and scoring', { done: 0, total: candidates.length });
      let scored = 0;
      await mapLimit(chunk(candidates, 4), config.llm.concurrency, async (group) => {
        await extractEvidence(group, job.spec, { usage: job.llmUsage });
        await rankCandidates(group, {
          spec: job.spec, prefs: job.prefs, userProfile: job.userProfile, usage: job.llmUsage, jevUsage: job.jevUsage, warnings: job.warnings,
          onProgress: () => { scored += 1; tab.progress = { done: scored, total: candidates.length }; },
        });
      });
      sortRanked(candidates).forEach((c, i) => {
        c.rank = i + 1;
        if (c.candidate_type === 'organization' && !c.organization_type) c.organization_type = c.organization_type_llm || 'Organization';
      });
    }
    tab.pages.push({ page: tab.page, candidates, excluded, builtAt: nowIso() });
    tab.pagesReady = tab.pages.length;
    tab.hasMore = Boolean(hasMore);
    for (const k of Object.keys(excluded)) tab.excludedTotals[k] = (tab.excludedTotals[k] || 0) + (excluded[k] || 0);
    tab.status = 'done';
    tab.stage = 'done';
    tab.stageLabel = candidates.length ? `${candidates.length} ranked` : 'No matches on this page';
    tab.progress = undefined;
  } catch (err) {
    tab.status = 'error';
    tab.stage = 'error';
    tab.stageLabel = 'Error';
    tab.error = err?.message || String(err);
    ctx.log(`Error: ${tab.error}`);
  }
  // De-duplicate warnings (several candidates can produce the same one).
  job.warnings.splice(0, job.warnings.length, ...[...new Set(job.warnings)]);
  persist(job);
}

function persist(job) {
  const { meter, ...rest } = job;
  jobStore.save({ ...rest, meter: meter.toJSON() });
}

export function getJob(id, user) {
  let job = jobs.get(id);
  if (!job) {
    const saved = jobStore.load(id);
    if (saved) {
      const m = new Meter();
      Object.assign(m, { credits: saved.meter?.credits || 0, calls: saved.meter?.calls || 0, cached: saved.meter?.cached || 0 });
      job = { ...saved, meter: m };
      for (const t of Object.values(job.tabs)) if (t.status === 'running' || t.status === 'queued') { t.status = 'error'; t.error = 'The server restarted while this page was being built. Load more to retry.'; }
      jobs.set(id, job);
    }
  }
  if (!job || job.userId !== user.id) throw new HttpError(404, 'Search not found.', { code: 'not_found' });
  return job;
}

/** → SearchJob (public view) */
export function publicJob(job) {
  const m = job.meter.toJSON ? job.meter.toJSON() : job.meter;
  return {
    id: job.id,
    createdAt: job.createdAt,
    status: job.status,
    request: job.request,
    summary: job.summary,
    sample: job.sample,
    engines: job.engines,
    tabs: Object.fromEntries(Object.entries(job.tabs).map(([k, t]) => [k, { status: t.status, stage: t.stage, stageLabel: t.stageLabel, progress: t.progress, pagesReady: t.pagesReady, hasMore: t.hasMore, error: t.error, log: t.log.slice(-15), excludedTotals: t.excludedTotals }])),
    credits: { crustdata: m.credits, calls: m.calls, cached: m.cached },
    llmUsage: job.llmUsage,
    jevUsage: job.jevUsage,
    warnings: job.warnings,
    error: job.error,
  };
}

/** → ResultsPage */
export function resultsPage(job, tabKey, page) {
  const tab = job.tabs[tabKey];
  if (!tab) throw new HttpError(404, `This search has no ${tabKey} tab.`, { code: 'not_found' });
  const p = tab.pages[page - 1];
  if (!p) throw new HttpError(404, `Page ${page} is not ready.`, { code: 'not_found' });
  return {
    tab: tabKey,
    page,
    pagesReady: tab.pagesReady,
    hasMore: tab.hasMore,
    pageSize: resultsPageSize,
    candidates: p.candidates,
    excluded: p.excluded,
    builtAt: p.builtAt,
    note: page > 1 ? `Page ${page} was retrieved and ranked after page ${page - 1}. Scores use the same rubric, but candidates are ranked within this page, not against earlier pages.` : undefined,
  };
}

export function loadMore(job, tabKey) {
  const tab = job.tabs[tabKey];
  if (!tab) throw new HttpError(404, `This search has no ${tabKey} tab.`, { code: 'not_found' });
  if (tab.status === 'running') return job;
  if (!tab.hasMore) throw new HttpError(409, 'No more results for these constraints.', { code: 'no_more' });
  job.status = 'running';
  buildPage(job, tabKey).finally(() => finish(job));
  return job;
}

export function findCandidate(job, candidateId) {
  for (const t of Object.values(job.tabs)) for (const p of t.pages) {
    const c = p.candidates.find((x) => x.candidate_id === candidateId);
    if (c) return c;
  }
  throw new HttpError(404, 'Candidate not found.', { code: 'not_found' });
}

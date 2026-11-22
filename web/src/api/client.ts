// Typed API client. Owned by Laptop 4 — the only place the UI talks to the server.
import type {
  AppStatus, Me, DiscoverResponse, LinksRequest, LinksResponse, OrgProfile, PersonaId,
  TopicValidateRequest, TopicValidation, SearchRequest, StartSearchResponse, SearchJob,
  ResultsPage, TabKey, Candidate, UserProfile, ApiErrorBody,
} from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.error?.message || fallback);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

/** Message shown when the browser can't reach the API at all (server stopped, wrong port, offline). */
export const SERVER_UNREACHABLE = "Can't reach the Overlap server. Make sure it's running (npm run dev or npm start), then try again.";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch() rejects only on network failure; turn the browser's "Failed to fetch" into something actionable.
    throw new ApiError(0, { error: { message: SERVER_UNREACHABLE, code: 'network' } }, SERVER_UNREACHABLE);
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, json as ApiErrorBody | null, `${method} ${path} failed (${res.status})`);
  return json as T;
}

export const api = {
  // status & Crustdata connection
  status: () => request<AppStatus>('GET', '/status'),
  connectCrustdata: () => request<AppStatus>('POST', '/crustdata/connect'),
  disconnectCrustdata: () => request<AppStatus>('POST', '/crustdata/disconnect'),

  // auth (lightweight: name + email + consent, session cookie)
  me: () => request<Me>('GET', '/auth/me'),
  login: (b: { name: string; email: string; consent: boolean }) => request<Me>('POST', '/auth/login', b),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  deleteMe: () => request<{ ok: true }>('DELETE', '/me'),
  setCategory: (category: PersonaId) => request<Me>('PUT', '/me/category', { category }),

  // profile discovery
  discover: (b: { method: 'email' | 'name'; name?: string; affiliation?: string; sample?: boolean }) => request<DiscoverResponse>('POST', '/profile/discover', b),
  submitLinks: (b: LinksRequest) => request<LinksResponse>('POST', '/profile/links', b),
  confirmProfile: (match_id: string) => request<Me>('POST', '/profile/confirm', { match_id }),
  rejectProfile: (match_id: string) => request<{ attemptsLeft: number }>('POST', '/profile/reject', { match_id }),
  skipProfile: () => request<Me>('POST', '/profile/skip'),
  updateProfile: (patch: Partial<UserProfile>) => request<Me>('PUT', '/profile', patch),

  // organization profile (Company persona, step C1)
  identifyOrg: (b: { name?: string; website?: string; sample?: boolean }) => request<{ matches: OrgProfile[] }>('POST', '/org/identify', b),
  saveOrg: (org: OrgProfile) => request<Me>('PUT', '/org', org),

  // topic validation
  validateTopic: (b: TopicValidateRequest) => request<TopicValidation>('POST', '/topic/validate', b),

  // search
  startSearch: (b: SearchRequest) => request<StartSearchResponse>('POST', '/search', b),
  job: (id: string) => request<SearchJob>('GET', `/search/${encodeURIComponent(id)}`),
  results: (id: string, tab: TabKey, page: number) => request<ResultsPage>('GET', `/search/${encodeURIComponent(id)}/results?tab=${tab}&page=${page}`),
  loadMore: (id: string, tab: TabKey) => request<SearchJob>('POST', `/search/${encodeURIComponent(id)}/more`, { tab }),
  candidate: (id: string, candidateId: string) => request<Candidate>('GET', `/search/${encodeURIComponent(id)}/candidates/${encodeURIComponent(candidateId)}`),
};

export type Api = typeof api;

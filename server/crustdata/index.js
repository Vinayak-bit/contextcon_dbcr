// Crustdata gateway: picks the transport and adds caching, per-endpoint rate
// limiting, retries with backoff, credit metering and retrieval timestamps.
import { config } from '../config.js';
import { cache } from '../store.js';
import { sleep } from '../util.js';
import { McpCrustdata } from './mcp.js';
import { RestCrustdata, CrustdataError } from './rest.js';
import { SampleCrustdata } from './sample.js';

export { CrustdataError };

// Requests per minute (documented defaults, kept slightly under).
const RPM = { personSearch: 28, personEnrich: 14, personIdentify: 10, personContact: 14, companySearch: 28, companyEnrich: 14, companyIdentify: 14, webSearch: 20, webFetch: 9 };
const CACHEABLE = new Set(['personSearch', 'personEnrich', 'personIdentify', 'companySearch', 'companyEnrich', 'companyIdentify', 'webSearch', 'webFetch']);

class Limiter {
  constructor() { this.next = {}; }
  async wait(op) {
    const gap = 60_000 / (RPM[op] || 20);
    const now = Date.now();
    const at = Math.max(now, this.next[op] || 0);
    this.next[op] = at + gap;
    if (at > now) await sleep(at - now);
  }
}

/** Per-search credit/call accounting surfaced in the UI. */
export class Meter {
  constructor() { this.credits = 0; this.calls = 0; this.cached = 0; this.byOp = {}; this.errors = []; }
  add(op, credits, fromCache) {
    this.calls += 1;
    if (fromCache) this.cached += 1;
    this.credits += credits || 0;
    const o = (this.byOp[op] ||= { calls: 0, credits: 0 });
    o.calls += 1; o.credits += credits || 0;
  }
  toJSON() { return { credits: Math.round(this.credits * 100) / 100, calls: this.calls, cached: this.cached, byOp: this.byOp, errors: this.errors.slice(-20) }; }
}

class Gateway {
  constructor() {
    const t = config.crustdata.transport;
    this.mode = t === 'auto' ? 'mcp' : t === 'demo' ? 'sample' : t;
    if (!['mcp', 'rest', 'sample'].includes(this.mode)) this.mode = 'mcp';
    this.live = this.mode === 'rest' ? new RestCrustdata() : this.mode === 'mcp' ? new McpCrustdata() : null;
    this.sample = new SampleCrustdata();
    this.limiter = new Limiter();
  }

  status() {
    const live = this.live ? this.live.status() : { transport: 'sample', auth: 'none', connected: false };
    return { mode: this.mode, ...live, sampleAvailable: true };
  }

  isLiveReady() { return Boolean(this.live && this.live.status().connected); }

  /**
   * Decide whether a request runs on sample data. Returns true for sample.
   * Throws 409 `crustdata_auth_required` when live data is needed but unavailable.
   */
  async resolveSample(requested) {
    if (requested || this.mode === 'sample') return true;
    // Connect implicitly only with existing credentials (API key or saved OAuth tokens).
    // A first-time OAuth sign-in (which registers this app with Crustdata) happens only when
    // the user clicks "Connect Crustdata" (POST /api/crustdata/connect).
    if (this.mode === 'mcp' && !this.isLiveReady() && this.live.canAutoConnect()) await this.live.connect();
    if (!this.isLiveReady()) {
      const err = new Error('Live results need a Crustdata connection. Connect Crustdata in the header, or use sample data.');
      err.status = 409;
      err.details = { code: 'crustdata_auth_required' };
      throw err;
    }
    return false;
  }

  transport(sample) {
    if (sample || !this.live) return this.sample;
    return this.live;
  }

  /**
   * Call one Crustdata operation.
   * @returns {{data:any, credits:number, retrievedAt:string, cached:boolean, transport:string}}
   */
  async call(op, body, { sample = false, meter, useCache = true } = {}) {
    const [r] = await this.batch(op, [body], { sample, meter, useCache });
    if (r instanceof Error) throw r;
    return r;
  }

  /** Several calls of the same operation; the MCP transport runs them in one sandbox execution. Errors are returned in place. */
  async batch(op, bodies, { sample = false, meter, useCache = true } = {}) {
    const t = this.transport(sample);
    const ttl = config.crustdata.cacheTtlHours * 3600_000;
    const out = new Array(bodies.length);
    const pending = [];
    bodies.forEach((body, i) => {
      const key = { op, body, t: t.kind };
      const hit = useCache && CACHEABLE.has(op) ? cache.get(key, ttl) : null;
      if (hit) { out[i] = { ...hit.value, credits: 0, cached: true, retrievedAt: hit.retrievedAt, transport: t.kind }; meter?.add(op, 0, true); }
      else pending.push({ i, body, key });
    });
    // MCP: group into sandbox executions of up to 6 calls; others: one call each.
    const groupSize = t.kind === 'mcp' ? 6 : 1;
    for (let g = 0; g < pending.length; g += groupSize) {
      const group = pending.slice(g, g + groupSize);
      if (t.kind !== 'sample') for (const _ of group) await this.limiter.wait(op);
      const results = await this._withRetry(op, t, group.map((p) => p.body));
      group.forEach((p, k) => {
        const r = results[k];
        if (r instanceof Error) {
          // "Not found" from enrich/identify is an empty result, not a failure.
          if (r.status === 404 && /Enrich|Identify/.test(op)) { out[p.i] = { data: [], credits: 0, cached: false, retrievedAt: new Date().toISOString(), transport: t.kind }; return; }
          meter?.errors.push({ op, status: r.status, message: r.message });
          out[p.i] = r;
          return;
        }
        const retrievedAt = new Date().toISOString();
        if (useCache && CACHEABLE.has(op) && t.kind !== 'sample') cache.set(p.key, { data: r.data });
        meter?.add(op, r.credits, false);
        out[p.i] = { data: r.data, credits: r.credits || 0, cached: false, retrievedAt, transport: t.kind };
      });
    }
    return out;
  }

  async _withRetry(op, t, bodies, attempt = 0) {
    const results = t.batch ? await t.batch(op, bodies) : await Promise.all(bodies.map((b) => t.call(op, b).catch((e) => e)));
    const retryIdx = results.map((r, i) => (r instanceof CrustdataError && r.retryable ? i : -1)).filter((i) => i >= 0);
    if (!retryIdx.length || attempt >= 3) return results;
    await sleep(1500 * 2 ** attempt + Math.random() * 500);
    const again = await this._withRetry(op, t, retryIdx.map((i) => bodies[i]), attempt + 1);
    retryIdx.forEach((i, k) => { results[i] = again[k]; });
    return results;
  }
}

export const crustdata = new Gateway();

/** Unwrap enrich/identify responses: array of {matches:[{person_data|company_data}]} → data objects. */
export function unwrapMatches(data, key) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
  return rows.map((row) => {
    const m = (row.matches || [])[0];
    return m ? { ...m[key], _confidence: m.confidence_score, _matched_on: row.matched_on } : null;
  }).filter(Boolean);
}

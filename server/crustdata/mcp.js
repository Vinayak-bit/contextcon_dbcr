// Crustdata over MCP (Streamable HTTP transport).
//
// Auth: a Crustdata API key is sent as `Authorization: Bearer <key>`. Without a
// key, the server's OAuth 2.1 flow (dynamic client registration + PKCE) is used:
// the UI opens the authorization URL, Crustdata redirects back to
// /api/crustdata/oauth/callback, and tokens are stored under DATA_DIR.
//
// The Crustdata MCP server runs in "code mode": its `execute` tool runs a small
// JavaScript program in a sandbox whose only I/O is `callTool(name, params)`.
// We send one tiny program per batch of API calls, shrink the payload inside
// the sandbox (so large enrich responses aren't truncated), and unwrap the
// result. If the server instead exposes the data tools directly, we call them.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { kv } from '../store.js';
import { CrustdataError } from './rest.js';

const OP_PATTERNS = {
  personSearch: [/^person[_./-]?search$/i, /^(people|person)[_./-]?search(?!.*(live|autocomplete|realtime))/i],
  personEnrich: [/^person[_./-]?enrich$/i, /^person[_./-]?enrich(?!.*(live|realtime|contact))/i],
  personIdentify: [/^person[_./-]?identify$/i, /person[_./-]?identify/i],
  companySearch: [/^company[_./-]?search$/i, /^compan(y|ies)[_./-]?search(?!.*(live|autocomplete|realtime))/i],
  companyEnrich: [/^company[_./-]?enrich$/i, /^company[_./-]?enrich(?!.*(live|realtime))/i],
  companyIdentify: [/^company[_./-]?identify$/i, /company[_./-]?identify/i],
  webSearch: [/^web[_./-]?search(?:[_./-]?live)?$/i, /web[_./-]?search/i],
  webFetch: [/^web[_./-]?(fetch|enrich)(?:[_./-]?live)?$/i, /web[_./-]?(fetch|enrich)/i],
};
const DEFAULT_NAMES = {
  personSearch: 'person_search', personEnrich: 'person_enrich', personIdentify: 'person_identify',
  companySearch: 'company_search', companyEnrich: 'company_enrich', companyIdentify: 'company_identify',
  webSearch: 'web_search_live', webFetch: 'web_enrich_live',
};

// Runs inside Crustdata's sandbox (plain JS, no types). Drops bulky fields we never use.
const SANDBOX_PROGRAM = `// model query: batch of Crustdata API calls for expert discovery (search, identify, enrich)
const DROP = new Set(['metrics_timeseries','citations_timeseries','timeseries','co_authors','social_posts','profile_picture_permalink','logo_permalink','by_role_absolute','by_role_percent','by_region_absolute','by_region_percent','web_traffic','employee_reviews','seo','news','job_openings','reviews','software_reviews','assessment','competitors','people','market_intel','public_launches']);
function shrink(v, depth) {
  // Keep every result row (depth ≤ 3: profiles/companies/matches); trim deep lists (repos, articles, past roles).
  if (Array.isArray(v)) return v.slice(0, depth > 3 ? 12 : 1000).map((x) => shrink(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      if (DROP.has(k)) continue;
      const x = v[k];
      if (typeof x === 'string' && x.length > 1500) out[k] = x.slice(0, 1500);
      else out[k] = shrink(x, depth + 1);
    }
    return out;
  }
  return v;
}
const results = await Promise.all(inputs.calls.map(async (c) => {
  const r = await callTool(c.tool, c.params);
  if (!r || !r.ok) return { ok: false, status: r && r.status, errorType: r && r.errorType, message: r && r.message };
  return { ok: true, credits_used: r.credits_used, data: shrink(r.data, 0) };
}));
return { __overlap: true, results };`;

/** File-backed OAuth client provider for the MCP SDK. */
class FileOAuthProvider {
  constructor(redirectUrl) {
    this._redirectUrl = redirectUrl;
    this.pendingAuthUrl = null;
  }
  _read() { return kv.read('crustdata-oauth', {}); }
  _write(patch) { kv.write('crustdata-oauth', { ...this._read(), ...patch }); }
  get redirectUrl() { return this._redirectUrl; }
  get clientMetadata() {
    return {
      client_name: 'Overlap — expert discovery (local)',
      redirect_uris: [this._redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state() {
    const s = crypto.randomBytes(16).toString('hex');
    this._write({ state: s });
    return s;
  }
  expectedState() { return this._read().state; }
  clientInformation() { return this._read().client; }
  saveClientInformation(info) { this._write({ client: info }); }
  tokens() { return this._read().tokens; }
  saveTokens(tokens) { this._write({ tokens, tokensSavedAt: new Date().toISOString() }); }
  redirectToAuthorization(url) { this.pendingAuthUrl = url.toString(); }
  saveCodeVerifier(v) { this._write({ verifier: v }); }
  codeVerifier() {
    const v = this._read().verifier;
    if (!v) throw new Error('No PKCE code verifier saved');
    return v;
  }
  invalidateCredentials(scope) {
    const cur = this._read();
    if (scope === 'all') return kv.remove('crustdata-oauth');
    if (scope === 'client') delete cur.client;
    if (scope === 'tokens') delete cur.tokens;
    if (scope === 'verifier') delete cur.verifier;
    kv.write('crustdata-oauth', cur);
  }
  hasTokens() { return Boolean(this._read().tokens?.access_token); }
}

export class McpCrustdata {
  constructor({ url = config.crustdata.mcpUrl, apiKey = config.crustdata.apiKey } = {}) {
    this.kind = 'mcp';
    this.url = url;
    this.apiKey = apiKey;
    this.oauth = apiKey ? null : new FileOAuthProvider(`${config.publicUrl}/api/crustdata/oauth/callback`);
    this.client = null;
    this.pendingTransport = null;
    this.state = 'disconnected'; // disconnected | connecting | needs_auth | connected | error
    this.error = null;
    this.codeMode = false;
    this.toolNames = {};
    this.serverTools = [];
    this.connecting = null;
  }

  /** True when a connection can be made without user interaction (API key or saved OAuth tokens). */
  canAutoConnect() { return Boolean(this.apiKey || this.oauth?.hasTokens()); }

  status() {
    return {
      transport: 'mcp',
      endpoint: this.url,
      auth: this.apiKey ? 'api_key' : 'oauth',
      state: this.state,
      connected: this.state === 'connected',
      authUrl: this.state === 'needs_auth' ? this.oauth?.pendingAuthUrl : undefined,
      codeMode: this.codeMode,
      tools: this.toolNames,
      error: this.error,
    };
  }

  _transport() {
    const opts = this.apiKey
      ? { requestInit: { headers: { Authorization: `Bearer ${this.apiKey}` } } }
      : { authProvider: this.oauth };
    return new StreamableHTTPClientTransport(new URL(this.url), opts);
  }

  /** Connect (idempotent). Resolves to status; never throws for "needs auth". */
  async connect({ force = false } = {}) {
    if (this.state === 'connected' && !force) return this.status();
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      this.state = 'connecting';
      this.error = null;
      const transport = this._transport();
      const client = new Client({ name: 'overlap-expert-discovery', version: '0.1.0' });
      try {
        await client.connect(transport);
        this.client = client;
        await this._discoverTools();
        this.state = 'connected';
      } catch (err) {
        if (err instanceof UnauthorizedError || /unauthori[sz]ed|401/i.test(String(err?.message))) {
          this.pendingTransport = transport;
          this.state = 'needs_auth';
          if (this.apiKey) { this.state = 'error'; this.error = 'Crustdata rejected the API key (401).'; }
        } else {
          this.state = 'error';
          this.error = String(err?.message || err);
        }
      } finally {
        this.connecting = null;
      }
      return this.status();
    })();
    return this.connecting;
  }

  /** Complete the OAuth redirect. */
  async finishAuth(code, state) {
    if (!this.oauth) throw new Error('OAuth is not in use (an API key is configured).');
    const expected = this.oauth.expectedState();
    if (expected && state && expected !== state) throw new Error('OAuth state mismatch — please retry the sign-in.');
    const transport = this.pendingTransport || this._transport();
    await transport.finishAuth(code);
    this.pendingTransport = null;
    return this.connect({ force: true });
  }

  async disconnect() {
    try { await this.client?.close(); } catch { /* ignore */ }
    this.client = null;
    this.state = 'disconnected';
    this.oauth?.invalidateCredentials('all');
  }

  async _discoverTools() {
    const { tools } = await this.client.listTools();
    this.serverTools = tools.map((t) => t.name);
    this.codeMode = this.serverTools.includes('execute');
    let candidates = this.serverTools;
    if (this.codeMode && this.serverTools.includes('list_tools')) {
      try {
        const res = await this.client.callTool({ name: 'list_tools', arguments: {} }, undefined, { timeout: 60_000 });
        const text = [...(res.content || []).map((c) => c.text || ''), JSON.stringify(res.structuredContent || {})].join('\n');
        candidates = [...new Set([...text.matchAll(/[A-Za-z][A-Za-z0-9_./-]{4,}/g)].map((m) => m[0].replace(/[./-]+$/, '')))];
      } catch (err) {
        this.error = `Tool discovery failed, using defaults: ${err.message}`;
      }
    }
    // Accept snake_case, kebab, dotted and camelCase names alike.
    const norm = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
    for (const [op, patterns] of Object.entries(OP_PATTERNS)) {
      const override = config.crustdata.toolNames[op];
      if (override) { this.toolNames[op] = override; continue; }
      let found = null;
      for (const p of patterns) { found = candidates.find((n) => p.test(norm(n))); if (found) break; }
      this.toolNames[op] = found || DEFAULT_NAMES[op];
    }
  }

  async _ensure() {
    if (this.state !== 'connected') await this.connect();
    if (this.state !== 'connected') {
      throw new CrustdataError(401, 'unauthorized', this.state === 'needs_auth' ? 'Crustdata sign-in required — click "Connect Crustdata" in the header.' : `Crustdata MCP unavailable: ${this.error || this.state}`);
    }
  }

  async call(op, params) {
    const [res] = await this.batch(op, [params]);
    if (res instanceof Error) throw res;
    return res;
  }

  /** Run several calls of one operation in a single sandbox execution. Returns results or Error per call. */
  async batch(op, paramsList) {
    await this._ensure();
    const tool = this.toolNames[op];
    if (!this.codeMode) {
      return Promise.all(paramsList.map(async (params) => {
        try {
          const res = await this.client.callTool({ name: tool, arguments: params }, undefined, { timeout: 180_000 });
          const parsed = parseContent(res);
          if (res.isError) return new CrustdataError(500, 'tool_error', typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 300));
          return { data: parsed, credits: 0 };
        } catch (err) { return toCrustError(err); }
      }));
    }
    try {
      const res = await this.client.callTool({
        name: 'execute',
        arguments: { code: SANDBOX_PROGRAM, inputs: { calls: paramsList.map((params) => ({ tool, params })) } },
      }, undefined, { timeout: 300_000, resetTimeoutOnProgress: true });
      const payload = findMarked(parseContent(res));
      if (!payload) {
        if (paramsList.length > 1) {
          // Most likely the combined output was truncated: split and retry.
          const mid = Math.ceil(paramsList.length / 2);
          return [...await this.batch(op, paramsList.slice(0, mid)), ...await this.batch(op, paramsList.slice(mid))];
        }
        const text = (res.content || []).map((c) => c.text || '').join(' ').slice(0, 400);
        return [new CrustdataError(res.isError ? 400 : 500, 'mcp_execute', `Unexpected execute result: ${text}`)];
      }
      return payload.results.map((r) => (r.ok
        ? { data: r.data, credits: Number(r.credits_used) || 0 }
        : new CrustdataError(Number(r.status) || 500, r.errorType, r.message)));
    } catch (err) {
      return paramsList.map(() => toCrustError(err));
    }
  }
}

function toCrustError(err) {
  if (err instanceof CrustdataError) return err;
  const msg = String(err?.message || err);
  return new CrustdataError(/timed? ?out/i.test(msg) ? 504 : 502, 'mcp_transport', msg);
}

function parseContent(res) {
  if (res?.structuredContent) return res.structuredContent;
  const texts = (res?.content || []).filter((c) => c.type === 'text').map((c) => c.text);
  for (const t of texts) { try { return JSON.parse(t); } catch { /* not JSON */ } }
  // Some servers prefix JSON with a short note; try the first {...} block.
  const joined = texts.join('\n');
  const start = joined.indexOf('{');
  if (start >= 0) { try { return JSON.parse(joined.slice(start)); } catch { /* fallthrough */ } }
  return joined;
}

function findMarked(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 4) return null;
  if (v.__overlap === true && Array.isArray(v.results)) return v;
  for (const k of Object.keys(v)) {
    const f = findMarked(v[k], depth + 1);
    if (f) return f;
  }
  return null;
}

// Direct REST transport for the Crustdata API (https://api.crustdata.com).
import { config } from '../config.js';

export const REST_PATHS = {
  personSearch: '/person/search',
  personEnrich: '/person/enrich',
  personIdentify: '/person/identify',
  companySearch: '/company/search',
  companyEnrich: '/company/enrich',
  companyIdentify: '/company/identify',
  webSearch: '/web/search/live',
  webFetch: '/web/enrich/live',
};

export class CrustdataError extends Error {
  constructor(status, type, message, metadata) {
    super(message || `Crustdata error ${status}`);
    this.status = status;
    this.type = type || 'error';
    this.metadata = metadata;
  }
  get retryable() { return [429, 500, 502, 503, 529].includes(this.status) || this.type === 'rate_limit_error' || this.type === 'service_unavailable'; }
}

export class RestCrustdata {
  constructor({ apiKey = config.crustdata.apiKey, baseUrl = config.crustdata.restBaseUrl } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.kind = 'rest';
  }

  status() {
    return { transport: 'rest', endpoint: this.baseUrl, auth: this.apiKey ? 'api_key' : 'missing_key', connected: Boolean(this.apiKey) };
  }

  async call(op, body) {
    if (!this.apiKey) throw new CrustdataError(401, 'unauthorized', 'CRUSTDATA_API_KEY is not set');
    const res = await fetch(this.baseUrl + REST_PATHS[op], {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        'x-api-version': config.crustdata.apiVersion,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const credits = Number(res.headers.get('x-credits-used')) || 0;
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = data && typeof data === 'object' ? (data.error || data) : {};
      throw new CrustdataError(res.status, err.type, err.message || String(text).slice(0, 300), err.metadata);
    }
    return { data, credits };
  }
}

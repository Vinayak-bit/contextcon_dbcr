import 'dotenv/config';
import path from 'node:path';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

const port = num(process.env.PORT, 8787);

export const config = {
  port,
  // Where the browser reaches this server. Used for the OAuth redirect URI.
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  // Where the UI lives (Vite dev server in development, same origin in production).
  appUrl: (process.env.APP_URL || (process.env.NODE_ENV === 'production' ? `http://localhost:${port}` : 'http://localhost:5173')).replace(/\/$/, ''),
  dataDir: path.resolve(process.env.DATA_DIR || '.data'),

  crustdata: {
    // auto | mcp | rest | demo
    //   auto → MCP over Streamable HTTP (API key as Bearer if set, else OAuth sign-in)
    transport: (process.env.CRUSTDATA_TRANSPORT || 'auto').toLowerCase(),
    apiKey: process.env.CRUSTDATA_API_KEY || '',
    // install.crustdata.com accepts OAuth 2.1 (DCR) and a Bearer key; mcp.crustdata.com also takes a Bearer key.
    mcpUrl: process.env.CRUSTDATA_MCP_URL || 'https://install.crustdata.com/mcp',
    restBaseUrl: (process.env.CRUSTDATA_API_BASE || 'https://api.crustdata.com').replace(/\/$/, ''),
    apiVersion: process.env.CRUSTDATA_API_VERSION || '2025-11-01',
    // Optional explicit names for the tools callable inside the MCP `execute` sandbox.
    // Leave unset to auto-discover them from the server's tool catalog.
    toolNames: {
      personSearch: process.env.CRUSTDATA_MCP_TOOL_PERSON_SEARCH,
      personEnrich: process.env.CRUSTDATA_MCP_TOOL_PERSON_ENRICH,
      personIdentify: process.env.CRUSTDATA_MCP_TOOL_PERSON_IDENTIFY,
      companySearch: process.env.CRUSTDATA_MCP_TOOL_COMPANY_SEARCH,
      companyEnrich: process.env.CRUSTDATA_MCP_TOOL_COMPANY_ENRICH,
      companyIdentify: process.env.CRUSTDATA_MCP_TOOL_COMPANY_IDENTIFY,
      webSearch: process.env.CRUSTDATA_MCP_TOOL_WEB_SEARCH,
      webFetch: process.env.CRUSTDATA_MCP_TOOL_WEB_FETCH,
    },
    // Credit controls
    searchLimitPerQuery: num(process.env.CRUSTDATA_SEARCH_LIMIT, 40),
    maxQueriesPerPage: num(process.env.CRUSTDATA_MAX_QUERIES, 4),
    enrichPerPage: num(process.env.CRUSTDATA_ENRICH_PER_PAGE, 50),
    researchProfiles: bool(process.env.CRUSTDATA_RESEARCH_PROFILES, true),
    devPlatformProfiles: bool(process.env.CRUSTDATA_DEV_PLATFORM_PROFILES, true),
    academicWebSearch: bool(process.env.CRUSTDATA_ACADEMIC_WEB_SEARCH, true),
    cacheTtlHours: num(process.env.CRUSTDATA_CACHE_TTL_HOURS, 72),
  },

  // DeepSeek (OpenAI-compatible Chat Completions, JSON mode).
  llm: {
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    // Topic validation + project-spec extraction (one call per search).
    model: process.env.LLM_MODEL || 'deepseek-v4-pro',
    // Evidence normalization + LLM-as-judge (one call per candidate).
    fastModel: process.env.LLM_FAST_MODEL || 'deepseek-flash',
    // Reasoning for the judge: none | low | high | max
    judgeReasoning: process.env.LLM_JUDGE_REASONING || 'low',
    concurrency: num(process.env.LLM_CONCURRENCY, 8),
    get enabled() { return Boolean(this.apiKey); },
  },

  // TypeSafe Jev decision model (POST /v1/systemone).
  jev: {
    apiKey: process.env.JEV_API_KEY || '',
    url: process.env.JEV_API_URL || 'https://api.typesafe.ai/v1/systemone',
    // Pin a version so scores stay comparable across searches.
    model: process.env.JEV_MODEL || 'jev-1.14.0',
    concurrency: num(process.env.JEV_CONCURRENCY, 6),
    get enabled() { return Boolean(this.apiKey); },
  },

  // auto | hybrid | llm | jev | heuristic
  //   auto → hybrid when both DeepSeek and Jev keys are set, otherwise whichever is available.
  ranker: (process.env.RANKER || 'auto').toLowerCase(),
  // Share of each Jev-covered criterion taken from Jev in hybrid mode (rest from the LLM judge).
  hybridJevWeight: num(process.env.HYBRID_JEV_WEIGHT, 0.5),
};

export const resultsPageSize = 50;

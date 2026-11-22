// Overlap API server.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { crustdata } from './crustdata/index.js';
import { activeRanker } from './ranking/index.js';
import { errorHandler, sessionMiddleware } from './http.js';
import { HttpError } from './util.js';
import { statusRouter } from './routes/status.js';
import { authRouter } from './routes/auth.js';
import { profileRouter } from './routes/profile.js';
import { searchRouter } from './routes/search.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(sessionMiddleware);

  const api = express.Router();
  api.use(statusRouter, authRouter, profileRouter, searchRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.', { code: 'not_found' })));
  app.use('/api', api);

  // Production: serve the built UI from dist/.
  const dist = path.resolve('dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createApp().listen(config.port, () => {
    console.log(`[overlap] API on http://localhost:${config.port}`);
    console.log(`[overlap] Crustdata: ${crustdata.mode}${crustdata.mode === 'mcp' ? ` (${config.crustdata.mcpUrl}, ${config.crustdata.apiKey ? 'API key' : 'OAuth'})` : ''}`);
    console.log(`[overlap] LLM: ${config.llm.enabled ? `DeepSeek ${config.llm.model} / ${config.llm.fastModel}` : 'heuristic (no DEEPSEEK_API_KEY)'} · Jev: ${config.jev.enabled ? config.jev.model : 'off'} · ranker: ${activeRanker()}`);
    // Connect to Crustdata MCP in the background when credentials already exist.
    if (crustdata.mode === 'mcp' && (config.crustdata.apiKey || crustdata.live.oauth?.hasTokens())) {
      crustdata.live.connect().then((s) => console.log(`[overlap] Crustdata MCP: ${s.state}${s.error ? ` — ${s.error}` : ''}`));
    }
  });
}

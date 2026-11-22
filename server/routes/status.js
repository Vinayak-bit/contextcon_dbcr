// GET /status, Crustdata MCP connect / OAuth callback / disconnect.
import { Router } from 'express';
import { config } from '../config.js';
import { crustdata } from '../crustdata/index.js';
import { activeRanker } from '../ranking/index.js';
import { wrap } from '../http.js';

export const statusRouter = Router();

export function appStatus() {
  return {
    crustdata: crustdata.status(),
    llm: { provider: 'deepseek', enabled: config.llm.enabled, model: config.llm.model, fastModel: config.llm.fastModel },
    jev: { enabled: config.jev.enabled, model: config.jev.model },
    ranker: activeRanker(),
  };
}

statusRouter.get('/status', (_req, res) => res.json(appStatus()));

statusRouter.post('/crustdata/connect', wrap(async (_req, res) => {
  if (crustdata.live?.connect) await crustdata.live.connect({ force: crustdata.live.state === 'error' });
  res.json(appStatus());
}));

statusRouter.post('/crustdata/disconnect', wrap(async (_req, res) => {
  if (crustdata.live?.disconnect) await crustdata.live.disconnect();
  res.json(appStatus());
}));

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f9;color:#1a1d23}main{max-width:420px;padding:32px;background:#fff;border-radius:14px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center}a{color:#3b5bdb}</style></head>
<body><main>${body}</main></body></html>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

statusRouter.get('/crustdata/oauth/callback', wrap(async (req, res) => {
  const { code, state, error, error_description: desc } = req.query;
  if (error || !code) {
    return res.status(400).send(page('Crustdata sign-in failed', `<h2>Sign-in didn't complete</h2><p>${esc(desc || error || 'No authorization code was returned.')}</p><p><a href="${config.appUrl}">Back to the app</a></p>`));
  }
  try {
    await crustdata.live.finishAuth(String(code), state ? String(state) : undefined);
    const st = crustdata.status();
    if (!st.connected) throw new Error(st.error || 'Connection did not complete.');
    res.send(page('Crustdata connected', `<h2>Crustdata connected</h2><p>You can close this tab and return to the app.</p><p><a href="${config.appUrl}">Back to the app</a></p><script>setTimeout(()=>window.close(),1500)</script>`));
  } catch (err) {
    res.status(500).send(page('Crustdata sign-in failed', `<h2>Couldn't finish connecting</h2><p>${esc(err.message)}</p><p><a href="${config.appUrl}">Back to the app</a></p>`));
  }
}));

// DeepSeek Chat Completions client (JSON mode) with schema validation,
// a global concurrency cap, and retries on transient failures.
import { config } from '../config.js';
import { sleep } from '../util.js';

let inFlight = 0;
const queue = [];
async function acquire() {
  if (inFlight < config.llm.concurrency) { inFlight += 1; return; }
  await new Promise((r) => queue.push(r));
  inFlight += 1;
}
function release() {
  inFlight -= 1;
  const next = queue.shift();
  if (next) next();
}

export const llmUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };

export class LlmError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * Ask DeepSeek for a JSON object and validate it with a zod schema.
 * @param {object} o
 * @param {string} o.system  System prompt (must mention JSON and show the shape).
 * @param {string} o.user    User content.
 * @param {import('zod/v4').ZodType} o.schema
 * @param {string} [o.model]
 * @param {'none'|'low'|'high'|'max'} [o.reasoning]
 * @param {number} [o.maxTokens]
 * @param {object} [o.usage] Optional per-job usage accumulator.
 */
export async function chatJson({ system, user, schema, model = config.llm.fastModel, reasoning = 'none', maxTokens = 4000, usage }) {
  if (!config.llm.enabled) throw new LlmError('DEEPSEEK_API_KEY is not set', 401);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const body = {
      model,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: reasoning === 'none' ? maxTokens : maxTokens + 8000,
      stream: false,
      ...(reasoning === 'none' ? { thinking: { type: 'disabled' }, temperature: 0.1 } : { thinking: { type: 'enabled' }, reasoning_effort: reasoning }),
    };
    await acquire();
    let res; let json;
    try {
      res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.llm.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      json = await res.json().catch(() => null);
    } catch (err) {
      lastErr = new LlmError(`DeepSeek request failed: ${err.message}`, 0);
      release();
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    release();
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      lastErr = new LlmError(`DeepSeek ${res.status}: ${msg}`, res.status);
      if ([429, 500, 502, 503].includes(res.status)) { await sleep(1500 * 2 ** attempt + Math.random() * 500); continue; }
      throw lastErr;
    }
    const u = json.usage || {};
    for (const acc of [llmUsage, usage].filter(Boolean)) {
      acc.calls = (acc.calls || 0) + 1;
      acc.promptTokens = (acc.promptTokens || 0) + (u.prompt_tokens || 0);
      acc.completionTokens = (acc.completionTokens || 0) + (u.completion_tokens || 0);
    }
    const choice = json.choices?.[0];
    const content = (choice?.message?.content || '').trim();
    if (!content) { lastErr = new LlmError(`DeepSeek returned empty content (finish_reason=${choice?.finish_reason})`); continue; }
    let parsed;
    try { parsed = JSON.parse(content); } catch {
      lastErr = new LlmError('DeepSeek returned invalid JSON');
      messages.push({ role: 'assistant', content }, { role: 'user', content: 'That was not valid JSON. Reply again with only the JSON object.' });
      continue;
    }
    const check = schema.safeParse(parsed);
    if (check.success) return check.data;
    lastErr = new LlmError(`DeepSeek JSON failed validation: ${check.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    messages.push({ role: 'assistant', content }, { role: 'user', content: `The JSON did not match the required shape (${lastErr.message}). Reply again with a corrected JSON object only.` });
  }
  throw lastErr || new LlmError('DeepSeek call failed');
}

import crypto from 'node:crypto';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = (prefix = '') => prefix + crypto.randomBytes(9).toString('base64url');
export const hash = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex').slice(0, 32);

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** Run `fn` over `items` with at most `limit` in flight; preserves order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
export const uniq = (arr) => [...new Set(arr.filter(Boolean))];
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const compact = (arr) => (arr || []).filter((x) => x !== null && x !== undefined && x !== '');

export function normText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#./ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set('a an and the of for in on to with using use based via from by at as into or is are be we i my our me want looking people who experience have has need needs working work build building improve improving develop developing find help this that it its their them they you your about during between across'.split(' '));

export function tokens(s) {
  return normText(s).split(/[\s/]+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Fraction of `needles` phrases (0..1) that appear in `haystack`, with partial credit for token overlap. */
export function phraseCoverage(needles, haystack) {
  const hay = ` ${normText(haystack)} `;
  const hayTokens = new Set(tokens(haystack));
  const list = uniq(needles.map((n) => normText(n))).filter(Boolean);
  if (!list.length) return 0;
  let total = 0;
  for (const phrase of list) {
    if (hay.includes(` ${phrase} `) || hay.includes(phrase)) { total += 1; continue; }
    const pt = tokens(phrase);
    if (!pt.length) continue;
    const hit = pt.filter((t) => hayTokens.has(t)).length / pt.length;
    total += hit >= 0.5 ? hit * 0.7 : 0;
  }
  return total / list.length;
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const nowIso = () => new Date().toISOString();

export const round = (n, d = 0) => Math.round(Number(n) * 10 ** d) / 10 ** d;

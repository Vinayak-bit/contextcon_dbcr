// Academic discovery (owned by Laptop 3): paper authors from Google Scholar results and
// research labs / groups from web results, both through Crustdata /web/search/live.
// Labs are usually not company records, so they are returned as plain objects that
// organizations.js turns into lab candidates.
import * as z from 'zod/v4';
import { normText, uniq } from '../util.js';

const MAX_QUERIES = 2;
const SCHOLAR_UNAVAILABLE = 'Academic paper search is temporarily unavailable; results come from profile search.';
const SCHOLAR_NOT_ON_PLAN = 'Academic paper search is not enabled on this Crustdata plan; results come from profile search.';

/**
 * Run web searches (1 credit per page); errors are skipped. Each kind of failure produces at most
 * one user-facing warning per call (not one per query); raw error messages go to the progress log.
 * Scholar sources rejected by Crustdata (e.g. 400 "Source temporarily disabled") become one friendly warning.
 */
async function webSearch(ctx, queries, sources) {
  const list = uniq(queries).slice(0, MAX_QUERIES);
  if (!list.length) return [];
  const scholar = sources.some((s) => String(s).startsWith('scholar'));
  const results = await ctx.crustdata.batch('webSearch', list.map((query) => ({ query, sources })), { sample: ctx.sample, meter: ctx.meter });
  const out = [];
  const warn = new Set();
  results.forEach((r, i) => {
    if (r instanceof Error) {
      ctx.log(`Web search (${sources.join(', ')}) failed for "${list[i]}": ${r.message}`);
      if (r.status === 402 || r.type === 'insufficient_credits') warn.add('Crustdata credits ran out during academic web search.');
      else if (scholar && r.status === 403) warn.add(SCHOLAR_NOT_ON_PLAN);
      else if (scholar && (r.status === 400 || r.status === 404 || r.status >= 500 || /disabled|unavailable/i.test(r.message))) warn.add(SCHOLAR_UNAVAILABLE);
      else if (r.status === 403) warn.add('Web search is not enabled on this Crustdata plan; lab discovery was skipped.');
      else warn.add(`Web search failed: ${r.message}`);
      return;
    }
    for (const item of r.data?.results || []) out.push({ item, retrievedAt: r.retrievedAt, transport: r.transport, query: list[i] });
  });
  warn.forEach((w) => ctx.warnings.push(w));
  return out;
}

/** Authors from "A Name, B Name - 2021 - Venue" metadata (Scholar truncates long lists with "…"). */
function authorsFromMetadata(meta) {
  const head = String(meta || '').split(/\s+-\s+/)[0] || '';
  return head.split(',').map((s) => s.trim()).filter((s) => s && !/…|\.\.\./.test(s) && /^[\p{L}][\p{L}.' -]{1,60}$/u.test(s) && s.split(/\s+/).length <= 5);
}

function parsePaper(item) {
  const parts = String(item.metadata || '').split(/\s+-\s+/);
  const yearMatch = String(item.metadata || '').match(/\b(19|20)\d{2}\b/);
  return {
    title: String(item.title || '').replace(/^\[(PDF|HTML|BOOK|CITATION)\]\s*/i, '').trim(),
    url: item.url || item.link || '',
    snippet: String(item.snippet || '').slice(0, 300),
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    venue: parts.length > 2 ? parts.slice(1, -1).join(' - ').replace(/\b(19|20)\d{2}\b/, '').replace(/^[,\s]+|[,\s]+$/g, '') || undefined : undefined,
    citations: Number.isFinite(Number(item.citations)) ? Number(item.citations) : undefined,
    _sample: Boolean(item._sample),
  };
}

/**
 * Discover authors of relevant publications through Scholar search.
 * Authors are ordered by how many of the retrieved papers they appear on (not by citations).
 * @param {object} ctx pipeline context
 * @param {string[]} queries academic queries (≤ 2 are used)
 * @returns {Promise<{author:{name:string,profile_url?:string,affiliation?:string}, papers:object[], retrievedAt:string, transport:string}[]>}
 */
export async function findAcademicAuthors(ctx, queries) {
  const hits = await webSearch(ctx, queries, ['scholar-articles']);
  const byKey = new Map();
  const order = [];
  for (const { item, retrievedAt, transport } of hits) {
    const paper = parsePaper(item);
    if (!paper.title) continue;
    const listed = Array.isArray(item.authors) && item.authors.length
      ? item.authors.map((a) => ({ name: String(a.name || '').trim(), profile_url: a.profile_url || undefined }))
      : authorsFromMetadata(item.metadata).map((name) => ({ name }));
    for (const a of listed) {
      if (!a.name || a.name.length < 3 || /…/.test(a.name)) continue;
      const key = a.profile_url ? `u:${a.profile_url}` : `n:${normText(a.name)}`;
      // An unlinked name that matches a linked author is the same person.
      const linked = !a.profile_url && order.find((k) => k.startsWith('u:') && normText(byKey.get(k).author.name) === normText(a.name));
      const k = linked || key;
      if (!byKey.has(k)) { byKey.set(k, { author: { name: a.name, ...(a.profile_url ? { profile_url: a.profile_url } : {}) }, papers: [], retrievedAt, transport }); order.push(k); }
      const entry = byKey.get(k);
      if (!entry.papers.some((p) => normText(p.title) === normText(paper.title))) entry.papers.push(paper);
    }
  }
  return order.map((k) => byKey.get(k)).sort((a, b) => b.papers.length - a.papers.length);
}

/* ------------------------------------------------------------------ */
/* Labs                                                                */
/* ------------------------------------------------------------------ */
const LAB_WORD = /\b(lab|labs|laboratory|laboratories|research group|group|center|centre|institute)\b/i;
const PARENT_RE = [
  /\b(University of [A-Z][\p{L}'.-]+(?:[ ,]+(?:at )?[A-Z][\p{L}'.-]+){0,3})/u,
  /\b((?:[A-Z][\p{L}'.&-]+ ){1,4}(?:University|Institute of Technology|Institute of Science|Polytechnic|College))\b/u,
  /\b((?:Indian|Massachusetts|California|Georgia|Tokyo|Swiss Federal) Institute of [A-Z][\p{L}]+(?: [A-Z][\p{L}]+){0,3})/u,
  /\b(ETH Zurich|EPFL|MIT|CMU|IISc|KAIST|NUS|NTU|UCL|UCLA|IIT [A-Z][a-z]+|IIIT [A-Z][a-z]+)\b/u,
];

function findParent(text) {
  for (const re of PARENT_RE) {
    const m = String(text || '').match(re);
    if (m) return m[1].replace(/[,\s]+$/, '').trim();
  }
  return '';
}

/** Heuristic lab extraction from a web result title/snippet. */
function heuristicLab(item) {
  const title = String(item.title || '');
  const segments = title.split(/\s+[|–—-]\s+|:\s+/).map((s) => s.trim()).filter(Boolean);
  const nameSeg = segments.find((s) => LAB_WORD.test(s) && s.length <= 90);
  if (!nameSeg) return null;
  if (/\b(jobs?|careers?|news|course|syllabus|wikipedia|linkedin|conference|workshop|call for papers)\b/i.test(nameSeg)) return null;
  const parent = findParent(segments.filter((s) => s !== nameSeg).join(' · ')) || findParent(item.snippet) || findParent(nameSeg);
  if (parent && normText(nameSeg) === normText(parent)) return null; // that's the university itself, not a lab
  return { name: nameSeg, parent: parent || undefined };
}

const LabSchema = z.object({
  labs: z.array(z.object({
    index: z.number().int(),
    name: z.string(),
    parent: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
  })),
});

async function llmLabs(ctx, items) {
  const listing = items.map((it, i) => `[${i}] ${it.title}\n${String(it.snippet || '').slice(0, 300)}\n${it.url}`).join('\n\n');
  const out = await ctx.llm.chatJson({
    system: 'You extract research laboratories and research groups from web search results. Reply with JSON only: {"labs":[{"index":0,"name":"…","parent":"…","location":"…"}]}. '
      + 'Include a result only if it is the page of a specific lab, research group or research center. name = the lab or group name exactly as written; parent = the university or organization it belongs to, or null; '
      + 'location = city and/or country only if stated in the text, else null. Never guess or invent names, parents or locations. Skip news, courses, job posts, directories and generic university pages.',
    user: listing,
    schema: LabSchema,
    maxTokens: 1500,
    usage: ctx.llm.usage,
  });
  return out.labs.filter((l) => items[l.index] && l.name?.trim()).map((l) => ({ i: l.index, name: l.name.trim(), parent: l.parent?.trim() || undefined, location: l.location?.trim() || undefined }));
}

/**
 * Discover labs / research groups through web search.
 * Names come from the LLM when configured (grounded in the result text), with a heuristic fallback.
 * @param {object} ctx pipeline context
 * @param {string[]} queries e.g. "<core topic> research lab" (≤ 2 are used)
 * @returns {Promise<{name:string,parent?:string,url:string,snippet:string,location?:string,retrievedAt:string,transport:string,_sample?:boolean}[]>}
 */
export async function findLabs(ctx, queries) {
  const hits = await webSearch(ctx, queries, ['web']);
  const seenUrl = new Set();
  const items = [];
  for (const h of hits) {
    const url = h.item.url || h.item.link;
    if (!url || seenUrl.has(url)) continue;
    seenUrl.add(url);
    items.push({ ...h.item, url, _meta: { retrievedAt: h.retrievedAt, transport: h.transport } });
  }
  if (!items.length) return [];

  let extracted = null;
  if (ctx.llm?.enabled) {
    try { extracted = await llmLabs(ctx, items); } catch (err) { ctx.log(`Lab extraction fell back to heuristics (${err.message})`); }
  }
  if (!extracted) extracted = items.map((it, i) => { const h = heuristicLab(it); return h && { i, ...h }; }).filter(Boolean);

  const labs = [];
  const seenName = new Set();
  for (const l of extracted) {
    const it = items[l.i];
    const key = `${normText(l.name)}|${normText(l.parent)}`;
    if (seenName.has(key)) continue;
    seenName.add(key);
    labs.push({
      name: l.name, parent: l.parent, url: it.url, snippet: String(it.snippet || '').slice(0, 400), location: l.location,
      retrievedAt: it._meta.retrievedAt, transport: it._meta.transport, _sample: Boolean(it._sample),
    });
  }
  return labs;
}

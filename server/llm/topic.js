// Topic validation + structured project-spec extraction.
import * as z from 'zod/v4';
import { config } from '../config.js';
import { tokens, uniq } from '../util.js';
import { chatJson } from './deepseek.js';

const SpecSchema = z.object({
  domain: z.enum(['Research', 'Engineering', 'Research and Engineering']),
  problem_statement: z.string(),
  core_topics: z.array(z.string()).default([]),
  specific_methods: z.array(z.string()).default([]),
  related_topics: z.array(z.string()).default([]),
  required_expertise: z.array(z.string()).default([]),
  search_queries: z.array(z.string()).default([]),
  academic_queries: z.array(z.string()).default([]),
  org_queries: z.array(z.string()).default([]),
});

const TopicSchema = z.object({
  is_specific: z.boolean(),
  reason: z.string(),
  suggestions: z.array(z.object({ topic: z.string(), rationale: z.string().default(''), based_on: z.enum(['profile', 'description']).default('description') })).default([]),
  spec: SpecSchema.nullable().default(null),
});

const SYSTEM = `You are the intake analyst for a discovery platform that finds people and organizations with demonstrated expertise for a user's exact technical problem. It serves research (academic, scientific, applied R&D) and engineering (software, AI/ML, hardware, electronics, robotics, mechanical, infrastructure, product development) equally. Never assume the user is an academic or that publications are the only evidence of expertise.

Task 1 — decide whether the description is specific enough for meaningful expert discovery.
- Too broad: a field or discipline name, or a description with no concrete problem, method, system, or application (e.g. "Machine Learning", "Software Engineering", "Electronics", "Reinforcement Learning", "Mechanical Engineering").
- Specific enough: names a concrete problem, method, system, component, or application niche (e.g. "Reducing KV-cache memory overhead in long-context LLM inference", "RTL timing optimization of multi-clock SoC designs", "Designing low-noise analog front ends for sensor interfaces").
- Engineering problems are first-class; do not require academic framing.

Task 2 — if too broad, propose 4–6 narrower, concrete topics the user could pick. If the user's profile is provided (verified via Crustdata or entered by the user), base most suggestions on its actual skills, relevant work and publications and mark them based_on "profile"; mark others "description". Never restrict the user to their past fields.

Task 3 — always produce the structured spec (even when broad, as a best effort):
- domain: "Research", "Engineering", or "Research and Engineering" for mixed projects.
- problem_statement: one or two sentences, faithful to the user's words.
- core_topics (2–5), specific_methods (0–8), related_topics (2–6 adjacent areas), required_expertise (3–8 concrete skills/roles).
- search_queries: 4–8 short keyword phrases (2–6 words) for searching professional profiles; mix the exact specialization with adjacent ones. No boolean operators.
- academic_queries: 0–4 phrases for searching scholarly articles (empty for purely engineering topics without a research literature).
- org_queries: 3–6 phrases describing products, technologies or research programs an organization working on this would have.
Do not invent facts about the user.

Reply with a single JSON object exactly in this shape:
{"is_specific": true, "reason": "...", "suggestions": [{"topic": "...", "rationale": "...", "based_on": "description"}], "spec": {"domain": "Engineering", "problem_statement": "...", "core_topics": ["..."], "specific_methods": ["..."], "related_topics": ["..."], "required_expertise": ["..."], "search_queries": ["..."], "academic_queries": ["..."], "org_queries": ["..."]}}`;

const BROAD = new Set(['machine learning', 'deep learning', 'ai', 'artificial intelligence', 'software engineering', 'software', 'electronics', 'reinforcement learning', 'mechanical engineering', 'robotics', 'computer vision', 'nlp', 'data science', 'hardware', 'physics', 'chemistry', 'biology', 'web development', 'cloud', 'security', 'cybersecurity', 'blockchain', 'iot', 'embedded systems', 'networking', 'llm', 'llms', 'quantum computing', 'electrical engineering', 'civil engineering', 'materials science']);

function profileSummary(profile) {
  if (!profile) return 'none';
  return JSON.stringify({
    current_role: profile.current_role, institution_or_organization: profile.institution,
    skills: (profile.skills || []).slice(0, 25), relevant_work: (profile.projects || []).slice(0, 8), publications: (profile.publications || []).slice(0, 8),
    experience: (profile.experience || []).slice(0, 6),
  });
}

export async function validateTopic({ description, category, background, profile, usage }) {
  const text = String(description || '').trim();
  if (!config.llm.enabled) return heuristicTopic(text, profile);
  const user = `User category: ${category || 'unspecified'}
${background ? `User background: ${background}\n` : ''}Project description:
"""${text}"""
User profile (${profile ? (profile.source === 'crustdata' ? 'verified via Crustdata' : 'entered by the user') : 'not provided'}): ${profileSummary(profile)}`;
  try {
    const out = await chatJson({ system: SYSTEM, user, schema: TopicSchema, model: config.llm.model, reasoning: config.llm.topicReasoning, maxTokens: 3000, usage });
    if (!out.spec) out.spec = heuristicTopic(text, profile).spec;
    out.spec = cleanSpec(out.spec, text);
    out.engine = 'llm';
    return out;
  } catch (err) {
    const h = heuristicTopic(text, profile);
    h.warning = `LLM unavailable (${err.message}); used keyword analysis.`;
    return h;
  }
}

function cleanSpec(spec, text) {
  const trimList = (l, n) => uniq((l || []).map((s) => String(s).trim()).filter(Boolean)).slice(0, n);
  const s = {
    ...spec,
    core_topics: trimList(spec.core_topics, 6),
    specific_methods: trimList(spec.specific_methods, 10),
    related_topics: trimList(spec.related_topics, 8),
    required_expertise: trimList(spec.required_expertise, 10),
    search_queries: trimList(spec.search_queries, 8),
    academic_queries: trimList(spec.academic_queries, 4),
    org_queries: trimList(spec.org_queries, 6),
  };
  if (!s.search_queries.length) s.search_queries = trimList([...s.core_topics, ...s.specific_methods], 6);
  if (!s.org_queries.length) s.org_queries = s.search_queries.slice(0, 4);
  if (!s.problem_statement) s.problem_statement = text;
  return s;
}

/** Keyword fallback used when DeepSeek is not configured or fails. */
export function heuristicTopic(text, profile) {
  const t = tokens(text);
  const norm = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const isBroad = BROAD.has(norm) || t.length < 4;
  const bigrams = [];
  for (let i = 0; i < t.length - 1; i += 1) bigrams.push(`${t[i]} ${t[i + 1]}`);
  const topics = uniq([...bigrams.slice(0, 4), ...t.filter((w) => w.length > 5).slice(0, 4)]);
  const engineering = /build|implement|system|hardware|fpga|asic|rtl|kernel|gpu|cuda|firmware|deploy|product|sensor|circuit|robot|infrastructure|software/.test(norm);
  const research = /research|study|investigat|theor|paper|publication|experiment|novel|algorithm|phd|professor/.test(norm);
  const suggestions = isBroad
    ? uniq([...(profile?.skills || []).slice(0, 3).map((s) => `${text} for ${s}`), `Efficiency and scaling in ${text}`, `${text} for real-time / embedded deployment`, `Evaluation and benchmarking methods in ${text}`, `${text} applied to a specific industry problem`]).slice(0, 5)
      .map((topic, i) => ({ topic, rationale: i < (profile?.skills?.length ? 3 : 0) ? 'Combines the topic with a skill on your profile.' : 'A narrower angle on the topic.', based_on: i < (profile?.skills?.length ? 3 : 0) ? 'profile' : 'description' }))
    : [];
  return {
    is_specific: !isBroad,
    reason: isBroad ? 'This reads as a whole field rather than a concrete problem, method, or system, so matches would be too generic.' : 'The description names concrete technical elements.',
    suggestions,
    engine: 'heuristic',
    spec: {
      domain: engineering && research ? 'Research and Engineering' : research ? 'Research' : 'Engineering',
      problem_statement: text,
      core_topics: topics.slice(0, 4),
      specific_methods: [],
      related_topics: [],
      required_expertise: topics.slice(0, 5),
      search_queries: uniq([t.slice(0, 5).join(' '), ...bigrams.slice(0, 4)]).filter(Boolean).slice(0, 5),
      academic_queries: research ? [t.slice(0, 6).join(' ')] : [],
      org_queries: uniq([t.slice(0, 4).join(' '), ...bigrams.slice(0, 2)]).filter(Boolean),
    },
  };
}

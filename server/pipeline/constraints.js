// Hard constraints other than geography (owned by Laptop 3): candidate role/type
// and organization size. Each selection the user made in the UI is turned into a
// Crustdata filter where possible AND re-checked on the retrieved data, so it is
// never silently broadened (spec §6, §13).
import { normText, uniq } from '../util.js';

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */
// Word tokens with dots removed ("Ph.D." → "phd") and hyphens split ("Co-Founder" → co, founder).
function words(s) {
  return normText(String(s || '').replace(/\./g, '')).split(/[^a-z0-9+#]+/).filter(Boolean);
}
const sameWord = (a, b) => a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;

/** True when every word of `phrase` appears in `text` (any order), or the phrase written as one word does ("Co-Founder" ↔ "Cofounder"). */
export function phraseHit(phrase, text) {
  const pw = words(phrase);
  if (!pw.length) return false;
  const tw = words(text);
  if (pw.every((w) => tw.some((t) => sameWord(t, w)))) return true;
  const joined = pw.join('');
  return pw.length > 1 && tw.some((t) => t === joined || t === `${joined}s`);
}

const titlePhrases = (types, custom) => uniq([...(types || []).flatMap((t) => t.titles || []), ...(custom ? [custom] : [])]);

/* ------------------------------------------------------------------ */
/* Individuals: role / candidate type                                  */
/* ------------------------------------------------------------------ */
/**
 * Crustdata /person/search filter for the selected individual types: any title phrase on the
 * current title or the headline (fuzzy `(.)` = all words, any order).
 * @param {{id:string,titles:string[]}[]} individualTypes resolved types
 * @param {string} [customDiscipline] free-text discipline (Company / Other personas)
 * @returns {object|null} Filter
 */
export function titleFilter(individualTypes, customDiscipline) {
  const list = titlePhrases(individualTypes, customDiscipline);
  if (!list.length) return null;
  const conditions = list.flatMap((value) => [
    { field: 'experience.employment_details.current.title', type: '(.)', value },
    { field: 'basic_profile.headline', type: '(.)', value },
  ]);
  return { op: 'or', conditions };
}

const STUDENT_TITLE = /\b(student|undergraduate)\b/i;
const DOCTORAL_TITLE = /\b(phd|doctoral)\b/i;
const DOCTORAL_DEGREE = /\b(ph\.? ?d|doctor|doctoral|doctorate|dphil)\b/i;

/**
 * Current enrollments recorded on the profile: schools whose end year is this year or later,
 * with the degree read from the matching education evidence ("Education: Ph.D., CS at X (2027)").
 */
function enrollments(c) {
  const year = new Date().getFullYear();
  const edu = (c.evidence || []).filter((e) => e.kind === 'education').map((e) => e.text || '');
  return (c.meta?.schools || [])
    .filter((s) => s.school && Number(s.end_year) >= year)
    .map((s) => {
      const text = edu.find((t) => t.includes(` at ${s.school}`)) || '';
      const degree = text.replace(/^Education:\s*/, '').split(` at ${s.school}`)[0] || '';
      return { school: s.school, doctoral: DOCTORAL_DEGREE.test(degree) };
    });
}

/**
 * Re-check the candidate's role against the selected types.
 * Only a recorded **current role** can verify a type: the headline alone never does (an MS student
 * with the headline "AI/ML Engineer" is not a working engineer). With no current role, the person is
 * `unverified`, except that a recorded current enrollment verifies student types (and PhD types when
 * the degree is doctoral). With a current role, the custom discipline may also match the headline
 * (it is often descriptive, e.g. title "Engineer II", headline "RF engineer").
 * @returns {{status:'match'|'mismatch'|'unverified', matched:string[]}}
 */
export function matchRoles(c, individualTypes, customDiscipline) {
  const titles = uniq([c.current_role, ...(c.meta?.current_roles || []).map((r) => r.title)].map((t) => String(t || '').trim()));
  const types = individualTypes || [];
  if (!titles.length) {
    const enrolled = enrollments(c);
    if (!enrolled.length) return { status: 'unverified', matched: [] };
    const doctoral = enrolled.some((e) => e.doctoral);
    const matched = types.filter((t) => (t.titles || []).some((p) => STUDENT_TITLE.test(p) || (doctoral && DOCTORAL_TITLE.test(p)))).map((t) => t.id);
    return matched.length ? { status: 'match', matched } : { status: 'unverified', matched: [] };
  }
  const hit = (p) => titles.some((t) => phraseHit(p, t));
  const matched = types.filter((t) => (t.titles || []).some(hit)).map((t) => t.id);
  if (customDiscipline && (hit(customDiscipline) || phraseHit(customDiscipline, c.headline || ''))) matched.push('custom');
  return { status: matched.length ? 'match' : 'mismatch', matched };
}

/* ------------------------------------------------------------------ */
/* Organizations: type                                                 */
/* ------------------------------------------------------------------ */
const RESEARCH_SIGNAL = /\b(research|r ?& ?d|r and d|laborator(y|ies)|labs?|scientific|institute)\b/i;
const has = (hay, needles) => (needles || []).some((n) => normText(hay).includes(normText(n)));
const nameHas = (name, needles) => {
  const tw = words(name);
  return (needles || []).some((n) => { const nw = words(n); return nw.length && nw.every((w) => tw.some((t) => sameWord(t, w))); });
};

/** Classify one organization against one type's `match` spec → 'match' | 'mismatch' | 'unverified'. */
function classify(c, type) {
  const m = type.match || {};
  const industries = (c.industries || []).join(' | ');
  const companyType = c.company_type || '';
  const count = Number.isFinite(c.employee_count) && c.employee_count > 0 ? c.employee_count : null;
  const verdicts = [];

  // Labs found on the web are research groups, not company records.
  if (c.meta?.labFromWeb) {
    if (type.kind !== 'academic') return 'mismatch';
    if (m.companyTypes?.length && !m.names?.length) return 'unverified';
    return 'match';
  }

  if (m.notTypes?.length && companyType && has(companyType, m.notTypes)) return 'mismatch';

  if (m.minHeadcount != null || m.maxHeadcount != null) {
    if (count == null) verdicts.push('unverified');
    else verdicts.push((m.minHeadcount == null || count >= m.minHeadcount) && (m.maxHeadcount == null || count <= m.maxHeadcount) ? 'match' : 'mismatch');
  }

  const positive = [m.industries, m.companyTypes, m.names].some((l) => l?.length);
  if (positive) {
    const hit = has(industries, m.industries) || has(companyType, m.companyTypes) || nameHas(c.name, m.names);
    // A miss only counts as a mismatch when every field the type relies on is actually recorded.
    const unknown = (m.industries?.length && !industries) || (m.companyTypes?.length && !companyType);
    if (hit) verdicts.push('match');
    else verdicts.push(unknown ? 'unverified' : 'mismatch');
  }

  if (m.requireResearchSignal) {
    const text = [c.name, c.description, industries, ...(c.specializations || [])].join(' ');
    if (RESEARCH_SIGNAL.test(text)) verdicts.push('match');
    else verdicts.push(c.description || c.specializations?.length ? 'mismatch' : 'unverified');
  }

  if (verdicts.includes('mismatch')) return 'mismatch';
  if (verdicts.includes('unverified')) return 'unverified';
  return 'match';
}

/**
 * Enforce the selected organization types.
 * @param {object} c organization candidate
 * @param {{id:string,label:string,kind:string,match:object}[]} orgTypes resolved selected types
 * @returns {{status:'match'|'mismatch'|'unverified', matched:string[], label:string}} label = display type for the candidate
 */
export function matchOrgTypes(c, orgTypes) {
  const results = (orgTypes || []).map((t) => ({ t, v: classify(c, t) }));
  const matched = results.filter((r) => r.v === 'match');
  if (matched.length) return { status: 'match', matched: matched.map((r) => r.t.id), label: matched[0].t.label };
  const pending = results.filter((r) => r.v === 'unverified');
  if (pending.length) return { status: 'unverified', matched: [], label: `${pending[0].t.label} (type unverified)` };
  return { status: 'mismatch', matched: [], label: '' };
}

/* ------------------------------------------------------------------ */
/* Organizations: size                                                 */
/* ------------------------------------------------------------------ */
/**
 * Crustdata /company/search filter for the selected size buckets (numeric `headcount.total`).
 * @param {{id:string,min:number|null,max:number|null}[]} sizes resolved buckets; [] = any size
 * @returns {object|null} Filter
 */
export function sizeFilter(sizes) {
  const list = (sizes || []).filter((s) => s && (s.min != null || s.max != null));
  if (!list.length) return null;
  const conditions = list.map((s) => {
    const parts = [];
    if (s.min != null) parts.push({ field: 'headcount.total', type: '=>', value: s.min });
    if (s.max != null) parts.push({ field: 'headcount.total', type: '=<', value: s.max });
    return parts.length > 1 ? { op: 'and', conditions: parts } : parts[0];
  });
  return conditions.length > 1 ? { op: 'or', conditions } : conditions[0];
}

/**
 * Re-check headcount against the selected buckets.
 * @returns {'match'|'mismatch'|'unverified'} unverified = headcount unknown
 */
export function matchSize(c, sizes) {
  const list = (sizes || []).filter((s) => s && (s.min != null || s.max != null));
  if (!list.length) return 'match';
  const n = Number(c.employee_count);
  if (c.employee_count == null || !Number.isFinite(n) || n <= 0) return 'unverified';
  return list.some((s) => (s.min == null || n >= s.min) && (s.max == null || n <= s.max)) ? 'match' : 'mismatch';
}

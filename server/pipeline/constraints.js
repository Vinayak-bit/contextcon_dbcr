// v0 STUB — owned by Laptop 3, who replaces this with the full implementation.
// Brief: docs/workstreams/laptop-3/CLAUDE.md. Keep exported names and signatures.
import { normText, uniq } from '../util.js';

const phrases = (types, custom) => uniq([...types.flatMap((t) => t.titles || []), ...(custom ? [custom] : [])]);

export function titleFilter(individualTypes, customDiscipline) {
  const list = phrases(individualTypes, customDiscipline);
  if (!list.length) return null;
  return { op: 'or', conditions: list.map((p) => ({ field: 'experience.employment_details.current.title', type: '(.)', value: p })) };
}

export function matchRoles(c, individualTypes, customDiscipline) {
  const text = normText(`${c.current_role || ''} ${c.headline || ''}`);
  if (!text) return { status: 'unverified', matched: [] };
  const hit = (p) => normText(p).split(' ').every((w) => text.includes(w));
  const matched = individualTypes.filter((t) => (t.titles || []).some(hit)).map((t) => t.id);
  if (customDiscipline && hit(customDiscipline)) matched.push('custom');
  return { status: matched.length ? 'match' : 'mismatch', matched };
}

export function matchOrgTypes(c, orgTypes) {
  // v0: accept everything and label it with the first selected type.
  return { status: 'match', matched: orgTypes.slice(0, 1).map((t) => t.id), label: orgTypes[0]?.label || 'Organization' };
}

export function sizeFilter(sizes) {
  if (!sizes.length) return null;
  return {
    op: 'or',
    conditions: sizes.map((s) => (s.max ? { op: 'and', conditions: [{ field: 'headcount.total', type: '=>', value: s.min }, { field: 'headcount.total', type: '=<', value: s.max }] } : { field: 'headcount.total', type: '=>', value: s.min })),
  };
}

export function matchSize(c, sizes) {
  if (!sizes.length) return 'match';
  if (c.employee_count == null) return 'unverified';
  return sizes.some((s) => c.employee_count >= s.min && (!s.max || c.employee_count <= s.max)) ? 'match' : 'mismatch';
}

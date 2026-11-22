// Unit tests for server/pipeline/constraints.js (Laptop 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDIVIDUAL_TYPES, ORG_TYPES, ORG_SIZES } from '../../../shared/catalog.js';
import { titleFilter, matchRoles, matchOrgTypes, sizeFilter, matchSize, phraseHit } from '../../pipeline/constraints.js';

const types = (...ids) => ids.map((id) => ({ id, ...INDIVIDUAL_TYPES[id] }));
const orgTypes = (...ids) => ids.map((id) => ({ id, ...ORG_TYPES[id] }));
const sizes = (...ids) => ids.map((id) => ORG_SIZES.find((s) => s.id === id));
const person = (title, headline = '', extra = {}) => ({ candidate_type: 'individual', current_role: title, headline, meta: { current_roles: title ? [{ title, org: 'X' }] : [], schools: extra.schools || [] }, evidence: extra.evidence || [] });
const YEAR = new Date().getFullYear();
const company = (o) => ({ candidate_type: 'organization', name: 'Acme', industries: [], company_type: '', description: '', specializations: [], employee_count: null, meta: {}, ...o });

test('phraseHit: all words any order, dots and hyphens normalized', () => {
  assert.ok(phraseHit('PhD', 'Ph.D. Candidate'));
  assert.ok(phraseHit('Founder', 'Co-Founder & CTO'));
  assert.ok(phraseHit('Co-Founder', 'Cofounder at X'));
  assert.ok(phraseHit('Research Scientist', 'Scientist, Research'));
  assert.ok(!phraseHit('Engineer', 'Engineering Manager'));
  assert.ok(!phraseHit('', 'anything'));
});

test('titleFilter: fuzzy title + headline conditions, custom discipline included', () => {
  assert.equal(titleFilter([], ''), null);
  const f = titleFilter(types('professors'), 'RF engineer');
  assert.equal(f.op, 'or');
  assert.ok(f.conditions.every((c) => c.type === '(.)'));
  assert.ok(f.conditions.some((c) => c.field === 'experience.employment_details.current.title' && c.value === 'Professor'));
  assert.ok(f.conditions.some((c) => c.field === 'basic_profile.headline' && c.value === 'RF engineer'));
});

test('matchRoles: only a current role verifies a type; the headline alone never does', () => {
  const t = types('professors', 'phd_students');
  assert.deepEqual(matchRoles(person('Associate Professor of CS'), t).matched, ['professors']);
  assert.equal(matchRoles(person('Ph.D. Candidate'), t).status, 'match');
  assert.equal(matchRoles(person('Software Engineer', 'Former Professor'), t).status, 'mismatch');
  assert.deepEqual(matchRoles(person('', 'PhD student at MIT'), t), { status: 'unverified', matched: [] });
  assert.equal(matchRoles(person('', ''), t).status, 'unverified');
  // Review 4 (live run): MS student, no current role, headline "AI/ML Engineer" must not pass as an engineer.
  const msStudent = person('', 'AI/ML Engineer', { schools: [{ school: 'Boston University', end_year: YEAR + 1 }], evidence: [{ id: 'E1', kind: 'education', text: `Education: M.S., Computer Science at Boston University (${YEAR + 1})` }] });
  assert.deepEqual(matchRoles(msStudent, types('pro_engineers', 'ml_engineers')), { status: 'unverified', matched: [] });
  // A recorded current enrollment verifies student types; PhD types need a doctoral degree.
  assert.deepEqual(matchRoles(msStudent, types('fellow_students', 'phd_students')).matched, ['fellow_students']);
  const phd = person('', '', { schools: [{ school: 'MIT', end_year: YEAR + 3 }], evidence: [{ id: 'E1', kind: 'education', text: `Education: Ph.D., EECS at MIT (${YEAR + 3})` }] });
  assert.deepEqual(matchRoles(phd, types('phd_students', 'pro_engineers')).matched, ['phd_students']);
  const alumnus = person('', 'ML Engineer', { schools: [{ school: 'MIT', end_year: 2015 }] });
  assert.equal(matchRoles(alumnus, types('fellow_students')).status, 'unverified');
  // Words from different titles don't combine into one phrase.
  assert.equal(matchRoles({ ...person('Research Assistant'), meta: { current_roles: [{ title: 'Research Assistant' }, { title: 'Chief Scientist' }] } }, types('industry_research_scientists')).matched.length, 0);
  const custom = matchRoles(person('Engineer II', 'RF engineer working on antennas'), [], 'RF engineer');
  assert.deepEqual(custom, { status: 'match', matched: ['custom'] });
});

test('matchOrgTypes enforces each selected type', () => {
  const startup = company({ employee_count: 40, company_type: 'Privately Held', industries: ['Software Development'] });
  assert.equal(matchOrgTypes(startup, orgTypes('startups')).status, 'match');
  assert.equal(matchOrgTypes(company({ employee_count: 5000, company_type: 'Privately Held' }), orgTypes('startups')).status, 'mismatch');
  assert.equal(matchOrgTypes(company({ employee_count: 30, company_type: 'Educational' }), orgTypes('startups')).status, 'mismatch');
  assert.equal(matchOrgTypes(company({ company_type: 'Privately Held' }), orgTypes('startups')).status, 'unverified', 'headcount unknown');

  const uni = company({ name: 'Westbrook University', industries: ['Higher Education'], company_type: 'Educational' });
  const r = matchOrgTypes(uni, orgTypes('universities', 'startups'));
  assert.deepEqual(r.matched, ['universities']);
  assert.equal(r.label, 'Universities / Institutes');

  assert.equal(matchOrgTypes(company({ name: 'Bank', industries: ['Banking'], company_type: 'Public Company' }), orgTypes('tech_companies')).status, 'mismatch');
  assert.equal(matchOrgTypes(company({ employee_count: 40, industries: ['Software Development'] }), orgTypes('startups')).status, 'unverified', 'company type unknown is not a mismatch');
  assert.equal(matchOrgTypes(company({ company_type: 'Privately Held' }), orgTypes('tech_companies')).status, 'unverified', 'industries unknown is not a mismatch');
  assert.equal(matchOrgTypes(company({ employee_count: 5000, description: 'Our R&D centre builds chips', industries: ['Semiconductors'] }), orgTypes('corporate_rd')).status, 'match');
  assert.equal(matchOrgTypes(company({ employee_count: 5000, description: 'Retail stores', industries: ['Retail'] }), orgTypes('corporate_rd')).status, 'mismatch');

  const lab = company({ name: 'Vision Lab', meta: { labFromWeb: true } });
  assert.equal(matchOrgTypes(lab, orgTypes('academic_labs')).status, 'match');
  assert.equal(matchOrgTypes(lab, orgTypes('startups')).status, 'mismatch');
});

test('sizeFilter uses => / =< on headcount.total', () => {
  assert.equal(sizeFilter([]), null);
  assert.deepEqual(sizeFilter(sizes('1001+')), { field: 'headcount.total', type: '=>', value: 1001 });
  const f = sizeFilter(sizes('11-50', '51-200'));
  assert.equal(f.op, 'or');
  assert.deepEqual(f.conditions[0], { op: 'and', conditions: [{ field: 'headcount.total', type: '=>', value: 11 }, { field: 'headcount.total', type: '=<', value: 50 }] });
  assert.equal(sizeFilter(sizes('any')), null);
});

test('matchSize: match, mismatch, unverified', () => {
  const s = sizes('11-50', '1001+');
  assert.equal(matchSize({ employee_count: 20 }, s), 'match');
  assert.equal(matchSize({ employee_count: 5000 }, s), 'match');
  assert.equal(matchSize({ employee_count: 300 }, s), 'mismatch');
  assert.equal(matchSize({ employee_count: null }, s), 'unverified');
  assert.equal(matchSize({ employee_count: null }, []), 'match');
});

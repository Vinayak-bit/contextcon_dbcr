// Unit tests for server/pipeline/dedupe.js (Laptop 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeCandidates, normUrl } from '../../pipeline/dedupe.js';
import { personToCandidate, academicAuthorCandidate, companyToCandidate } from '../../pipeline/normalize.js';

const p = (id, name, org, url, extra = {}) => personToCandidate({
  crustdata_person_id: id, basic_profile: { name, current_title: 'Engineer' },
  experience: extra.experience || { employment_details: { current: [{ name: org, title: 'Engineer' }] } },
  social_handles: url ? { professional_network_identifier: { profile_url: url } } : undefined,
}, { retrievedAt: 't', transport: 'sample' });

test('normUrl ignores scheme, www, trailing slash; keeps Scholar user', () => {
  assert.equal(normUrl('https://www.linkedin.com/in/jane/'), normUrl('http://linkedin.com/in/jane'));
  assert.notEqual(normUrl('https://scholar.google.com/citations?user=AAA'), normUrl('https://scholar.google.com/citations?user=BBB'));
});

test('people dedupe on id, profile URL and name + organization', () => {
  const list = [
    p(1, 'Jane Doe', 'Acme', 'https://linkedin.com/in/jane'),
    p(1, 'Jane Doe', 'Acme', 'https://linkedin.com/in/jane'),
    p(2, 'Jane D', 'Other', 'https://www.linkedin.com/in/jane/'),
    p(undefined, 'Dr. Jane Doe', 'ACME Inc.', null), // no Crustdata id: merges on name + organization
    p(4, 'John Roe', 'Acme', null),
  ];
  const { unique, duplicates } = dedupeCandidates(list);
  assert.equal(unique.length, 2);
  assert.equal(duplicates, 3);
});

test('enriched copy replaces a search-level copy, keeping the better rank', () => {
  const a = p(9, 'A B', 'X', 'https://l.com/in/ab'); a.meta.searchRank = 2; a.meta.enriched = false;
  const b = p(9, 'A B', 'X', 'https://l.com/in/ab'); b.meta.searchRank = 7; b.meta.enriched = true;
  const { unique } = dedupeCandidates([a, b]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].meta.enriched, true);
  assert.equal(unique[0].meta.searchRank, 2);
});

test('academic-only identity merges into a matching person with renumbered evidence', () => {
  const person = p(5, 'Mei Lin', 'Westbrook University', 'https://l.com/in/mei');
  const before = person.evidence.length;
  const academic = academicAuthorCandidate({ name: 'Mei Lin', affiliation: 'Westbrook Univ.' }, [{ title: 'Paged attention', url: 'https://x/1', year: 2024 }], { retrievedAt: 't', transport: 'sample' });
  academic.institution_or_company = 'Westbrook University';
  const { unique, duplicates } = dedupeCandidates([academic, person]);
  assert.equal(unique.length, 1);
  assert.equal(duplicates, 1);
  const m = unique[0];
  assert.equal(m.candidate_id, person.candidate_id);
  assert.equal(m.publications.length, 1);
  assert.equal(m.evidence.length, before + 1);
  assert.equal(new Set(m.evidence.map((e) => e.id)).size, m.evidence.length, 'evidence ids stay unique');
  assert.ok(m.evidence.some((e) => e.id === m.publications[0].evidence[0]));
  assert.equal(m.meta.academicMerged, true);
});

test('academic-only identity is kept when no person matches', () => {
  const academic = academicAuthorCandidate({ name: 'Solo Author' }, [{ title: 'T', url: 'u' }], { retrievedAt: 't', transport: 'sample' });
  const { unique } = dedupeCandidates([p(6, 'Someone Else', 'X', null), academic]);
  assert.equal(unique.length, 2);
});

test('organizations dedupe on company id, domain and name + country; different domains stay apart', () => {
  const c = (id, name, domain, country) => companyToCandidate({ crustdata_company_id: id, basic_info: { name, primary_domain: domain }, locations: { country } }, {});
  const { unique, duplicates } = dedupeCandidates([
    c(1, 'Acme Inc', 'acme.com', 'United States'), c(1, 'Acme', 'acme.com', 'United States'),
    c(2, 'Acme Corp', 'acme.io', 'United States'), c(3, 'Other', 'acme.com', 'Germany'), c(4, 'Acme', 'acme.de', 'Germany'),
    c(5, 'Acme, Inc.', undefined, 'United States'),
  ]);
  assert.equal(duplicates, 3);
  assert.deepEqual(unique.map((u) => u.meta.crustdata_company_id), [1, 2, 4]);
});

test('same name at the same organization with different Crustdata ids are different people', () => {
  const { unique, duplicates } = dedupeCandidates([p(10, 'Wei Zhang', 'Google', 'https://l.com/in/wz1'), p(11, 'Wei Zhang', 'Google', 'https://l.com/in/wz2'), p(12, 'Wei Zhang', 'Google', 'https://l.com/in/wz1')]);
  assert.equal(unique.length, 2);
  assert.equal(duplicates, 1, 'same profile URL under another id is still a duplicate');
});

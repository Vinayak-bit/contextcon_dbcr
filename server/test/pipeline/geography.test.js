// Unit tests for server/pipeline/geography.js (Laptop 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonCountry, canonCity, institutionMatches, resolveGeography, personGeoFilters, companyGeoFilters, verifyGeo, proximityScore } from '../../pipeline/geography.js';

const person = (loc = {}, extra = {}) => ({
  candidate_type: 'individual', name: 'Test Person', current_role: 'Engineer', institution_or_company: extra.org || '',
  location: loc.raw || [loc.city, loc.state, loc.country].filter(Boolean).join(', '),
  location_detail: { city: loc.city || '', state: loc.state || '', country: loc.country || '' },
  meta: { current_roles: extra.org ? [{ title: 'Engineer', org: extra.org }] : [], schools: extra.schools || [] },
});
const org = (hq = {}, offices = [], extra = {}) => ({
  candidate_type: 'organization', name: extra.name || 'Org', headquarters: [hq.city, hq.country].filter(Boolean).join(', '),
  hq_detail: { city: hq.city || '', state: '', country: hq.country || '' }, relevant_locations: offices, parent_institution: extra.parent, meta: { ...(extra.meta || {}) },
});
const geo = (pref, profile = null, organization = null) => resolveGeography({ allowUnverified: false, preferProximity: false, ...pref }, profile, organization);

test('canonCountry handles ISO codes, aliases and native names', () => {
  assert.equal(canonCountry('USA'), 'United States');
  assert.equal(canonCountry('U.S.'), 'United States');
  assert.equal(canonCountry('IND'), 'India');
  assert.equal(canonCountry('uk'), 'United Kingdom');
  assert.equal(canonCountry('England'), 'United Kingdom');
  assert.equal(canonCountry('Korea, Republic of'), 'South Korea');
  assert.equal(canonCountry('Deutschland'), 'Germany');
  assert.equal(canonCountry('india'), 'India');
  assert.equal(canonCountry(''), '');
  assert.equal(canonCountry('Atlantis'), 'Atlantis');
});

test('canonCity resolves aliases, diacritics and "Greater … Area"', () => {
  assert.equal(canonCity('Bangalore'), canonCity('Bengaluru'));
  assert.equal(canonCity('Greater Bengaluru Area'), 'bengaluru');
  assert.equal(canonCity('Bombay'), canonCity('Mumbai'));
  assert.equal(canonCity('NYC'), canonCity('New York'));
  assert.equal(canonCity('Gurgaon'), canonCity('Gurugram'));
  assert.equal(canonCity('München'), canonCity('Munich'));
  assert.equal(canonCity('Zürich'), 'zurich');
  assert.equal(canonCity('San Francisco Bay Area'), 'san francisco');
});

test('institutionMatches handles acronyms, partial names and avoids generic matches', () => {
  assert.ok(institutionMatches('MIT', 'Massachusetts Institute of Technology'));
  assert.ok(institutionMatches('BITS Pilani', 'Birla Institute of Technology & Science, Pilani'));
  assert.ok(institutionMatches('IIT Bombay', 'Indian Institute of Technology Bombay'));
  assert.ok(institutionMatches('IISc', 'Indian Institute of Science, Bangalore'));
  assert.ok(institutionMatches('CMU', 'Carnegie Mellon University'));
  assert.ok(institutionMatches('UC Berkeley', 'University of California, Berkeley'));
  assert.ok(institutionMatches('Georgia Tech', 'Georgia Institute of Technology'));
  assert.ok(institutionMatches('EPFL', 'École Polytechnique Fédérale de Lausanne'));
  assert.ok(institutionMatches('Stanford', 'Stanford University'));
  assert.ok(!institutionMatches('University', 'Stanford University'));
  assert.ok(!institutionMatches('IIT Delhi', 'Indian Institute of Technology Bombay'));
  assert.ok(!institutionMatches('University of Washington', 'Washington University in St. Louis'));
  assert.ok(!institutionMatches('Harvard', 'MIT'));
  assert.ok(!institutionMatches('', 'MIT'));
});

test('resolveGeography validates required values and expands regions', () => {
  assert.throws(() => geo({ option: 'nope' }), (e) => e.status === 400 && e.details.code === 'validation');
  assert.throws(() => geo({ option: 'my_city' }), (e) => e.status === 400);
  assert.throws(() => geo({ option: 'my_institute' }), (e) => e.status === 400);
  assert.throws(() => geo({ option: 'specific' }), (e) => e.status === 400);
  assert.throws(() => geo({ option: 'another_country', countries: ['India', 'Japan'] }), (e) => e.status === 400);
  assert.throws(() => geo({ option: 'hubs', hubs: [] }), (e) => e.status === 400);

  const eu = geo({ option: 'specific', regions: ['Oceania'], countries: ['USA'] });
  assert.equal(eu.scope, 'countries');
  assert.deepEqual(new Set(eu.countries), new Set(['United States', 'Australia', 'New Zealand']));

  const city = geo({ option: 'my_city' }, { location: { city: 'Bangalore', state: 'Karnataka', country: 'IN' } });
  assert.equal(city.city, 'Bangalore');
  assert.equal(city.country, 'India');
  assert.equal(geo({ option: 'my_institute' }, { institution: 'MIT', location: {} }).institute, 'MIT');
  assert.equal(geo({ option: 'my_country' }, null, { name: 'Acme', location: { city: 'Berlin', country: 'Germany' } }).country, 'Germany');
  const hubs = geo({ option: 'hubs', hubs: ['bengaluru', 'boston'] });
  assert.equal(hubs.hubs.length, 2);
  assert.deepEqual(new Set(hubs.countries), new Set(['India', 'United States']));
  assert.equal(geo({ option: 'worldwide' }).scope, 'worldwide');
});

test('filter fragments use the right fields and operators', () => {
  assert.equal(personGeoFilters(geo({ option: 'worldwide' })), null);
  assert.deepEqual(personGeoFilters(geo({ option: 'specific', countries: ['India'] })), { field: 'basic_profile.location.country', type: 'in', value: ['India'] });
  const city = JSON.stringify(personGeoFilters(geo({ option: 'same_city', city: 'Bangalore', country: 'India' })));
  assert.ok(city.includes('bengaluru') && city.includes('bangalore') && city.includes('"(.)"'));
  const inst = JSON.stringify(personGeoFilters(geo({ option: 'my_institute', institute: 'MIT' })));
  assert.ok(inst.includes('Massachusetts Institute of Technology') && inst.includes('education.schools.school'));
  assert.deepEqual(companyGeoFilters(geo({ option: 'specific', countries: ['Germany'] })), { field: 'locations.country', type: 'in', value: ['Germany'] });
  const hubs = JSON.stringify(companyGeoFilters(geo({ option: 'hubs', hubs: ['munich'] })));
  assert.ok(hubs.includes('locations.city') && hubs.includes('munchen') && hubs.includes('Germany'));
  // Only Crustdata's operators are used (no >= / <=).
  assert.ok(!/">="|"<="/.test(city + inst + hubs));
});

test('country scopes: verified, mismatch, unverified', () => {
  const g = geo({ option: 'specific', countries: ['India', 'United States'] });
  assert.equal(verifyGeo(person({ city: 'Pune', country: 'India' }), g).status, 'verified');
  assert.equal(verifyGeo(person({ city: 'Austin', country: 'USA' }), g).status, 'verified');
  assert.equal(verifyGeo(person({ city: 'Berlin', country: 'Germany' }), g).status, 'mismatch');
  assert.equal(verifyGeo(person({ raw: 'Greater Bengaluru Area, India' }), g).status, 'verified');
  assert.equal(verifyGeo(person({}), g).status, 'unverified');
  assert.equal(verifyGeo(person({ city: 'Pune', country: 'India' }), geo({ option: 'worldwide' })).status, 'not_required');
});

test('city scope uses aliases and requires same country when both are known', () => {
  const g = geo({ option: 'same_city', city: 'Bangalore', country: 'India' });
  assert.equal(verifyGeo(person({ city: 'Bengaluru', country: 'India' }), g).status, 'verified');
  assert.equal(verifyGeo(person({ raw: 'Greater Bengaluru Area' }), g).status, 'verified');
  assert.equal(verifyGeo(person({ city: 'Mumbai', country: 'India' }), g).status, 'mismatch');
  assert.equal(verifyGeo(person({ country: 'India' }), g).status, 'unverified');
  assert.equal(verifyGeo(person({ country: 'Germany' }), g).status, 'mismatch');
  const cam = geo({ option: 'same_city', city: 'Cambridge', country: 'United Kingdom' });
  assert.equal(verifyGeo(person({ city: 'Cambridge', state: 'Massachusetts', country: 'United States' }), cam).status, 'mismatch');
  assert.equal(verifyGeo(person({ city: 'Cambridge' }), cam).status, 'unverified');
});

test('hubs match a hub city in the hub country', () => {
  const g = geo({ option: 'hubs', hubs: ['boston', 'bengaluru'] });
  assert.equal(verifyGeo(person({ city: 'Cambridge', state: 'Massachusetts', country: 'United States' }), g).status, 'verified');
  assert.equal(verifyGeo(person({ city: 'Cambridge', country: 'United Kingdom' }), g).status, 'mismatch');
  assert.equal(verifyGeo(person({ city: 'Bangalore', country: 'India' }), g).status, 'verified');
  assert.equal(verifyGeo(person({ city: 'Pune', country: 'India' }), g).status, 'mismatch');
  assert.equal(verifyGeo(person({ country: 'India' }), g).status, 'unverified');
});

test('institute scope requires a verified current affiliation', () => {
  const g = geo({ option: 'my_institute', institute: 'IIT Bombay' });
  const yes = verifyGeo(person({}, { org: 'Indian Institute of Technology Bombay' }), g);
  assert.equal(yes.status, 'verified');
  assert.equal(yes.basis, 'institution');
  const year = new Date().getFullYear();
  assert.equal(verifyGeo(person({}, { org: 'Google', schools: [{ school: 'IIT Bombay', end_year: year + 1 }] }), g).status, 'verified');
  assert.equal(verifyGeo(person({}, { org: 'Google', schools: [{ school: 'IIT Bombay', end_year: 2009 }] }), g).status, 'mismatch', 'alumni are not affiliated');
  assert.equal(verifyGeo(person({ city: 'Mumbai', country: 'India' }), g).status, 'unverified');
  const lab = org({}, [], { name: 'Robotics Lab', parent: 'Indian Institute of Technology Bombay', meta: { labFromWeb: true } });
  assert.equal(verifyGeo(lab, g).basis, 'parent_institution');
});

test('organizations: headquarters vs office location', () => {
  const g = geo({ option: 'specific', countries: ['India'] });
  const hq = verifyGeo(org({ city: 'Bengaluru', country: 'India' }), g);
  assert.equal(hq.status, 'verified');
  assert.equal(hq.basis, 'headquarters');
  const office = verifyGeo(org({ city: 'San Francisco', country: 'United States' }, [{ raw: 'Hyderabad, Telangana, India', city: 'Hyderabad', country: 'India' }]), g);
  assert.equal(office.status, 'verified');
  assert.equal(office.basis, 'office');
  assert.match(office.detail, /headquarters elsewhere/);
  assert.equal(verifyGeo(org({ city: 'Paris', country: 'France' }), g).status, 'mismatch');
  assert.equal(verifyGeo(org({}), g).status, 'unverified');
  const lab = org({ city: 'Mumbai', country: 'India' }, [], { meta: { labFromWeb: true } });
  assert.equal(verifyGeo(lab, g).basis, 'parent_institution');
});

test('proximityScore follows the rubric and returns null when unknown', () => {
  const g = geo({ option: 'specific', countries: ['India'] });
  const me = { institution: 'IIT Bombay', location: { city: 'Mumbai', state: 'Maharashtra', country: 'India' } };
  assert.equal(proximityScore(person({ city: 'Pune' }, { org: 'Indian Institute of Technology Bombay' }), me, g).score, 5);
  assert.equal(proximityScore(person({ city: 'Bombay', country: 'India' }), me, g).score, 4);
  assert.equal(proximityScore(person({ city: 'Pune', state: 'Maharashtra', country: 'India' }), me, g).score, 3.5);
  assert.equal(proximityScore(person({ city: 'Delhi', state: 'Delhi', country: 'India' }), me, g).score, 3);
  assert.equal(proximityScore(person({ city: 'Berlin', country: 'Germany' }), me, geo({ option: 'worldwide' })).score, 2);
  assert.equal(proximityScore(person({ city: 'Pune', country: 'India' }), null, g), null);
  assert.equal(proximityScore(person({}), { institution: '', location: { city: 'Mumbai', country: 'India' } }, g), null);
});

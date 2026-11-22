// Geography (owned by Laptop 3): resolves the user's geography choice, builds
// Crustdata filter fragments, and verifies candidates against it as a HARD
// constraint before ranking (spec §7 "Geography Rules").
//
// Matching is deliberately conservative: a candidate is `verified` only when a
// recorded location (or, for institute searches, a recorded affiliation) matches.
// Missing data → `unverified` (excluded unless the user allowed it); conflicting
// data → `mismatch` (always excluded).
import { COUNTRIES, GEO_SCOPES, REGIONS, RESEARCH_HUBS } from '../../shared/catalog.js';
import { HttpError, normText, uniq } from '../util.js';

/* ------------------------------------------------------------------ */
/* Countries                                                           */
/* ------------------------------------------------------------------ */
// Canonical English name → aliases (ISO-2, ISO-3, common short forms, native names).
const COUNTRY_TABLE = {
  'United States': ['us', 'usa', 'u.s.', 'u.s.a.', 'united states of america'],
  'United Kingdom': ['uk', 'gb', 'gbr', 'u.k.', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland'],
  Canada: ['ca', 'can'], Mexico: ['mx', 'mex', 'méxico'],
  Germany: ['de', 'deu', 'deutschland'], France: ['fr', 'fra'], Netherlands: ['nl', 'nld', 'the netherlands', 'holland'],
  Switzerland: ['ch', 'che', 'schweiz', 'suisse'], Sweden: ['se', 'swe', 'sverige'], Denmark: ['dk', 'dnk', 'danmark'],
  Norway: ['no', 'nor', 'norge'], Finland: ['fi', 'fin', 'suomi'], Ireland: ['ie', 'irl', 'republic of ireland'],
  Spain: ['es', 'esp', 'españa', 'espana'], Italy: ['it', 'ita', 'italia'], Portugal: ['pt', 'prt'],
  Belgium: ['be', 'bel', 'belgique', 'belgie'], Austria: ['at', 'aut', 'österreich', 'osterreich'], Poland: ['pl', 'pol', 'polska'],
  Czechia: ['cz', 'cze', 'czech republic'], Estonia: ['ee', 'est'], Greece: ['gr', 'grc', 'hellas'],
  India: ['in', 'ind', 'bharat'], Pakistan: ['pk', 'pak'], Bangladesh: ['bd', 'bgd'], 'Sri Lanka': ['lk', 'lka'], Nepal: ['np', 'npl'],
  China: ['cn', 'chn', "people's republic of china", 'prc', 'mainland china'], Japan: ['jp', 'jpn', 'nippon'],
  'South Korea': ['kr', 'kor', 'korea', 'republic of korea', 'korea, republic of', 'korea republic of'], Taiwan: ['tw', 'twn', 'republic of china'],
  'Hong Kong': ['hk', 'hkg', 'hong kong sar', 'hong kong sar china'],
  Singapore: ['sg', 'sgp'], Malaysia: ['my', 'mys'], Indonesia: ['id', 'idn'], Vietnam: ['vn', 'vnm', 'viet nam'], Thailand: ['th', 'tha'], Philippines: ['ph', 'phl'],
  Israel: ['il', 'isr'], 'United Arab Emirates': ['ae', 'are', 'uae', 'u.a.e.', 'emirates'], 'Saudi Arabia': ['sa', 'sau', 'ksa'], Qatar: ['qa', 'qat'],
  Turkey: ['tr', 'tur', 'türkiye', 'turkiye'],
  Australia: ['au', 'aus'], 'New Zealand': ['nz', 'nzl', 'aotearoa'],
  Brazil: ['br', 'bra', 'brasil'], Argentina: ['ar', 'arg'], Chile: ['cl', 'chl'], Colombia: ['co', 'col'], Peru: ['pe', 'per', 'perú'],
  'South Africa': ['za', 'zaf'], Nigeria: ['ng', 'nga'], Kenya: ['ke', 'ken'], Egypt: ['eg', 'egy'], Ghana: ['gh', 'gha'], Rwanda: ['rw', 'rwa'],
  Russia: ['ru', 'rus', 'russian federation'], Ukraine: ['ua', 'ukr'], Iceland: ['is', 'isl'], Luxembourg: ['lu', 'lux'], Hungary: ['hu', 'hun'],
  Romania: ['ro', 'rou'], Lithuania: ['lt', 'ltu'], Latvia: ['lv', 'lva'], Slovenia: ['si', 'svn'], Croatia: ['hr', 'hrv'], Serbia: ['rs', 'srb'],
  Bulgaria: ['bg', 'bgr'], Morocco: ['ma', 'mar'], Tunisia: ['tn', 'tun'], Ethiopia: ['et', 'eth'], Uruguay: ['uy', 'ury'], 'Costa Rica': ['cr', 'cri'],
};
// Two-letter codes collide with ordinary words/US states ("in", "it", "de", "ca", "co"…),
// so they are only trusted when the whole field is the code (e.g. country: "IN").
const COUNTRY_INDEX = new Map();
const COUNTRY_PHRASES = []; // [normalized phrase, canonical] used to spot a country inside free text
for (const [canon, aliases] of Object.entries(COUNTRY_TABLE)) {
  COUNTRY_INDEX.set(normText(canon), canon);
  COUNTRY_PHRASES.push([normText(canon), canon]);
  for (const a of aliases) {
    COUNTRY_INDEX.set(normText(a), canon);
    if (normText(a).replace(/\./g, '').length > 3) COUNTRY_PHRASES.push([normText(a), canon]);
  }
}
for (const c of COUNTRIES) if (!COUNTRY_INDEX.has(normText(c))) { COUNTRY_INDEX.set(normText(c), c); COUNTRY_PHRASES.push([normText(c), c]); }
COUNTRY_PHRASES.sort((a, b) => b[0].length - a[0].length);

/** Canonical English country name ("USA" → "United States", "IND" → "India"). Unknown values are returned trimmed. */
export function canonCountry(s) {
  const raw = String(s || '').trim();
  if (!raw) return '';
  const n = normText(raw);
  return COUNTRY_INDEX.get(n) || COUNTRY_INDEX.get(n.replace(/\./g, '')) || raw;
}

/** Find a country mentioned inside a free-text location ("Greater Bengaluru Area, India" → "India"). */
function countryInText(text) {
  const t = ` ${normText(text).replace(/,/g, ' ')} `;
  for (const [phrase, canon] of COUNTRY_PHRASES) if (t.includes(` ${phrase} `)) return canon;
  return '';
}

/* ------------------------------------------------------------------ */
/* Cities                                                              */
/* ------------------------------------------------------------------ */
// Canonical (normalized) city → aliases. normText already strips diacritics (Zürich → zurich).
const CITY_TABLE = {
  bengaluru: ['bangalore'], mumbai: ['bombay'], chennai: ['madras'], kolkata: ['calcutta'], pune: ['poona'],
  gurugram: ['gurgaon'], delhi: ['new delhi', 'delhi ncr', 'ncr'], mysuru: ['mysore'], thiruvananthapuram: ['trivandrum'],
  kochi: ['cochin'], visakhapatnam: ['vizag'], vadodara: ['baroda'], prayagraj: ['allahabad'],
  'new york': ['nyc', 'new york city', 'ny city', 'manhattan'], 'san francisco': ['sf', 'san fran'],
  'washington dc': ['washington d.c.', 'washington, d.c.', 'washington d c', 'dc'], 'los angeles': ['la'],
  munich: ['munchen', 'muenchen'], cologne: ['koln', 'koeln'], nuremberg: ['nurnberg', 'nuernberg'], zurich: ['zuerich'],
  vienna: ['wien'], prague: ['praha'], lisbon: ['lisboa'], copenhagen: ['kobenhavn'], warsaw: ['warszawa'], rome: ['roma'],
  milan: ['milano'], florence: ['firenze'], naples: ['napoli'], turin: ['torino'], geneva: ['geneve', 'genf'], brussels: ['bruxelles', 'brussel'],
  'the hague': ['den haag', 'hague'], montreal: [], quebec: ['quebec city'], beijing: ['peking'], guangzhou: ['canton'],
  'ho chi minh city': ['saigon', 'ho chi minh'], 'tel aviv': ['tel aviv-yafo', 'tel aviv yafo'], 'saint petersburg': ['st petersburg', 'st. petersburg'],
};
const CITY_INDEX = new Map();
for (const [canon, aliases] of Object.entries(CITY_TABLE)) {
  CITY_INDEX.set(canon, canon);
  for (const a of aliases) CITY_INDEX.set(normText(a), canon);
}
// Cities whose name alone doesn't pin down a place; they need the country as well.
const AMBIGUOUS_CITIES = new Set(['cambridge', 'london', 'paris', 'birmingham', 'portland', 'hyderabad', 'richmond', 'springfield', 'perth', 'newcastle', 'manchester', 'victoria', 'waterloo', 'berkeley', 'oxford', 'columbia', 'athens', 'dublin', 'kingston', 'hamilton', 'valencia', 'cordoba', 'san jose', 'la']);

function stripCityNoise(n) {
  return n.replace(/^greater /, '').replace(/ (metropolitan|metro|bay)? ?area$/, '').replace(/ (metropolitan region|region|district|urban|ncr region)$/, '').trim();
}

/** Canonical normalized city ("Bangalore" → "bengaluru", "Greater Munich Area" → "munich", "München" → "munich"). */
export function canonCity(s) {
  const whole = normText(String(s || ''));
  const n = normText(String(s || '').split(',')[0]);
  if (!n) return '';
  const direct = CITY_INDEX.get(whole) || CITY_INDEX.get(n) || CITY_INDEX.get(n.replace(/\./g, ''));
  if (direct) return direct;
  const stripped = stripCityNoise(n.replace(/\./g, ''));
  return CITY_INDEX.get(stripped) || stripped;
}

/** All normalized spellings of a canonical city, for free-text matching and fuzzy search filters. */
function cityVariants(city) {
  const canon = canonCity(city);
  if (!canon) return [];
  return uniq([canon, ...(CITY_TABLE[canon] || []).map(normText)]).filter((v) => v.length > 2 || v === canon);
}

/** True when free text (e.g. "Greater Bengaluru Area, Karnataka, India") mentions the city. */
function textHasCity(text, city) {
  const t = ` ${normText(text).replace(/,/g, ' ').replace(/\s+/g, ' ')} `;
  return cityVariants(city).some((v) => v.length > 2 && t.includes(` ${v} `));
}

/* ------------------------------------------------------------------ */
/* Institutions                                                        */
/* ------------------------------------------------------------------ */
// Well-known acronyms that can't be derived from initials alone.
const INSTITUTION_ALIASES = {
  mit: 'Massachusetts Institute of Technology', cmu: 'Carnegie Mellon University', caltech: 'California Institute of Technology',
  'georgia tech': 'Georgia Institute of Technology', gatech: 'Georgia Institute of Technology', 'uc berkeley': 'University of California, Berkeley',
  berkeley: 'University of California, Berkeley', ucb: 'University of California, Berkeley', ucla: 'University of California, Los Angeles',
  ucsd: 'University of California, San Diego', uiuc: 'University of Illinois Urbana-Champaign', upenn: 'University of Pennsylvania',
  'eth zurich': 'ETH Zurich', eth: 'ETH Zurich', epfl: 'École Polytechnique Fédérale de Lausanne', tum: 'Technical University of Munich',
  kaist: 'Korea Advanced Institute of Science and Technology', nus: 'National University of Singapore', ntu: 'Nanyang Technological University',
  iisc: 'Indian Institute of Science', 'iisc bangalore': 'Indian Institute of Science', bits: 'Birla Institute of Technology and Science',
  'bits pilani': 'Birla Institute of Technology and Science, Pilani', ucl: 'University College London', lse: 'London School of Economics',
  oxford: 'University of Oxford', cambridge: 'University of Cambridge', stanford: 'Stanford University', harvard: 'Harvard University',
  'iit bombay': 'Indian Institute of Technology Bombay', 'iit delhi': 'Indian Institute of Technology Delhi', 'iit madras': 'Indian Institute of Technology Madras',
  'iit kanpur': 'Indian Institute of Technology Kanpur', 'iit kharagpur': 'Indian Institute of Technology Kharagpur', 'iit roorkee': 'Indian Institute of Technology Roorkee',
  'iit hyderabad': 'Indian Institute of Technology Hyderabad', 'iit guwahati': 'Indian Institute of Technology Guwahati',
  'iiit hyderabad': 'International Institute of Information Technology, Hyderabad', 'iiit bangalore': 'International Institute of Information Technology, Bangalore',
};
const INST_STOP = new Set(['of', 'the', 'and', 'at', 'for', 'in', 'de', 'du', 'des', 'la', 'le', 'di', 'der', 'und', 'fur', 'a']);
const INST_GENERIC = new Set(['university', 'universities', 'institute', 'institution', 'college', 'school', 'technology', 'technological', 'science', 'sciences',
  'research', 'lab', 'labs', 'laboratory', 'center', 'centre', 'national', 'state', 'department', 'faculty', 'inc', 'ltd', 'llc', 'corp', 'corporation',
  'company', 'co', 'group', 'gmbh', 'limited', 'technical', 'polytechnic', 'academy', 'international', 'global', 'engineering', 'india', 'pvt', 'private']);

function instTokens(s) {
  return normText(String(s || '').replace(/&/g, ' and ')).replace(/\./g, '').split(/[^a-z0-9]+/).filter((t) => t && !INST_STOP.has(t));
}

// Does every token of `needle` match, in order, a token (or a run of initials) in `hay`?
// Each needle token matches: an equal token, a prefix of ≥4 letters ("tech" ↔ "technology"),
// or an acronym over consecutive hay tokens ("mit" ↔ massachusetts institute technology).
function alignTokens(needle, hay) {
  let j = 0; let distinctive = false;
  for (const tok of needle) {
    let hit = false;
    for (let k = j; k < hay.length && !hit; k += 1) {
      const h = hay[k];
      if (h === tok || (tok.length >= 4 && h.startsWith(tok)) || (h.length >= 4 && tok.startsWith(h) && tok.length - h.length <= 2)) {
        hit = true; j = k + 1; if (!INST_GENERIC.has(h)) distinctive = true;
      } else if (tok.length >= 2 && tok.length <= 6 && k + tok.length <= hay.length && hay.slice(k, k + tok.length).map((x) => x[0]).join('') === tok) {
        hit = true; j = k + tok.length; distinctive = true;
      }
    }
    if (!hit) return false;
  }
  return distinctive;
}

const expandInstitution = (s) => INSTITUTION_ALIASES[normText(String(s || '').replace(/\./g, ''))] || String(s || '');

/** True when two organization/institution names refer to the same place ("MIT" ↔ "Massachusetts Institute of Technology", "BITS Pilani" ↔ "Birla Institute of Technology & Science, Pilani"). */
export function institutionMatches(a, b) {
  if (!a || !b) return false;
  const forms = (s) => uniq([String(s), expandInstitution(s)]);
  for (const x of forms(a)) {
    for (const y of forms(b)) {
      const tx = instTokens(x); const ty = instTokens(y);
      if (!tx.length || !ty.length) continue;
      if (tx.join(' ') === ty.join(' ')) return true;
      const [short, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
      if (alignTokens(short, long)) return true;
    }
  }
  return false;
}

/** Search variants for an institution name (the typed name plus a known expansion). */
function institutionVariants(name) {
  return uniq([String(name || '').trim(), expandInstitution(name)].filter(Boolean));
}

/* ------------------------------------------------------------------ */
/* Resolve                                                             */
/* ------------------------------------------------------------------ */
const validation = (message) => new HttpError(400, message, { code: 'validation' });

/**
 * GeographyPref + profile → ResolvedGeo.
 * @param {object} pref GeographyPref from the SearchRequest
 * @param {object|null} userProfile confirmed UserProfile (used for "my …" options)
 * @param {object|null} organization OrgProfile (Company persona)
 * @returns {object} ResolvedGeo
 * @throws {HttpError} 400 `validation` when a required value is missing
 */
export function resolveGeography(pref, userProfile, organization) {
  const def = GEO_SCOPES[pref?.option];
  if (!def) throw validation('Choose a geography option.');
  const own = userProfile?.location?.city || userProfile?.location?.country ? userProfile.location : organization?.location || {};
  const geo = { option: pref.option, scope: def.scope, countries: [], hubs: [], allowUnverified: Boolean(pref.allowUnverified), preferProximity: Boolean(pref.preferProximity) };
  switch (def.scope) {
    case 'institute':
      geo.institute = String(pref.institute || userProfile?.institution || organization?.name || '').trim();
      if (!geo.institute) throw validation('Enter your institute or university.');
      geo.label = `Institution: ${geo.institute}`;
      break;
    case 'city': {
      geo.city = String(pref.city || own.city || '').trim();
      if (!geo.city) throw validation('Enter your city.');
      const sameAsOwn = own.city && canonCity(own.city) === canonCity(geo.city);
      geo.country = canonCountry(pref.country || (sameAsOwn || !pref.city ? own.country : '') || '');
      if (sameAsOwn && own.state) geo.state = own.state;
      geo.countries = geo.country ? [geo.country] : [];
      geo.label = `City: ${geo.city}${geo.country ? `, ${geo.country}` : ''}`;
      break;
    }
    case 'country':
      geo.country = canonCountry(pref.country || pref.countries?.[0] || own.country || '');
      if (!geo.country) throw validation('Choose your country.');
      geo.countries = [geo.country];
      geo.label = `Country: ${geo.country}`;
      break;
    case 'countries': {
      const regions = (pref.regions || []).filter((r) => REGIONS[r]);
      geo.countries = uniq([...(pref.countries || []), ...regions.flatMap((r) => REGIONS[r])].map(canonCountry));
      if (!geo.countries.length) throw validation('Choose at least one country or region.');
      if (def.single && geo.countries.length !== 1) throw validation('Choose exactly one country.');
      if (def.single) geo.country = geo.countries[0];
      geo.label = `${def.single ? 'Country' : 'Countries'}: ${[...regions, ...(pref.countries || []).map(canonCountry)].join(', ')}`;
      break;
    }
    case 'hubs':
      geo.hubs = RESEARCH_HUBS.filter((h) => (pref.hubs || []).includes(h.id)).map((h) => ({ id: h.id, label: h.label, country: h.country, cities: [...h.cities] }));
      if (!geo.hubs.length) throw validation('Choose at least one research hub.');
      geo.countries = uniq(geo.hubs.map((h) => h.country));
      geo.label = `Hubs: ${geo.hubs.map((h) => h.label).join(', ')}`;
      break;
    default:
      geo.label = 'Worldwide';
  }
  return geo;
}

/* ------------------------------------------------------------------ */
/* Crustdata filter fragments                                          */
/* ------------------------------------------------------------------ */
const or = (conditions) => (conditions.length > 1 ? { op: 'or', conditions } : conditions[0] || null);
const and = (conditions) => { const c = conditions.filter(Boolean); return c.length > 1 ? { op: 'and', conditions: c } : c[0] || null; };
const hubCityName = (c) => String(c).split(',')[0].trim();

/** Fuzzy city conditions for every spelling of a city on one field. */
function cityConditions(field, city) {
  const names = uniq([String(city).trim(), ...cityVariants(city).filter((v) => v.length > 2)].map((v) => v.toLowerCase()));
  return names.map((value) => ({ field, type: '(.)', value }));
}

/**
 * Crustdata /person/search filter fragment for the geography, or null for worldwide.
 * @param {object} geo ResolvedGeo
 */
export function personGeoFilters(geo) {
  switch (geo?.scope) {
    case 'country':
    case 'countries':
      return { field: 'basic_profile.location.country', type: 'in', value: geo.countries };
    case 'city':
      return and([
        or(cityConditions('basic_profile.location.full_location', geo.city)),
        geo.country ? { field: 'basic_profile.location.country', type: 'in', value: [geo.country] } : null,
      ]);
    case 'hubs':
      return or(geo.hubs.map((h) => and([
        or(uniq(h.cities.map(hubCityName)).flatMap((c) => cityConditions('basic_profile.location.full_location', c))),
        { field: 'basic_profile.location.country', type: 'in', value: [h.country] },
      ])));
    case 'institute':
      return or(institutionVariants(geo.institute).flatMap((name) => [
        { field: 'experience.employment_details.current.company_name', type: '(.)', value: name },
        { field: 'education.schools.school', type: '(.)', value: name },
      ]));
    default:
      return null;
  }
}

/**
 * Crustdata /company/search filter fragment for the geography, or null for worldwide.
 * @param {object} geo ResolvedGeo
 */
export function companyGeoFilters(geo) {
  switch (geo?.scope) {
    case 'country':
    case 'countries':
      return { field: 'locations.country', type: 'in', value: geo.countries };
    case 'city':
      return and([
        or(cityConditions('locations.city', geo.city)),
        geo.country ? { field: 'locations.country', type: 'in', value: [geo.country] } : null,
      ]);
    case 'hubs':
      return or(geo.hubs.map((h) => and([
        or(uniq(h.cities.map(hubCityName)).flatMap((c) => cityConditions('locations.city', c))),
        { field: 'locations.country', type: 'in', value: [h.country] },
      ])));
    case 'institute':
      // The institute itself and organizations named after it (e.g. "MIT Media Lab").
      return or(institutionVariants(geo.institute).map((name) => ({ field: 'basic_info.name', type: '(.)', value: name })));
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */
const fmtLoc = (l) => uniq([l.city, l.state, l.country]).join(', ') || l.raw || '';

/** Locations recorded for a candidate, most authoritative first, each with its GeoCheck basis. */
function candidateLocations(c) {
  const out = [];
  const push = (basis, d = {}, raw = '') => {
    const loc = { basis, city: d.city || '', state: d.state || '', country: canonCountry(d.country || ''), raw: raw || d.raw || '' };
    if (!loc.country && loc.raw) loc.country = countryInText(loc.raw);
    if (!loc.city && loc.raw) {
      const first = loc.raw.split(',')[0].trim();
      if (first && !COUNTRY_INDEX.has(normText(first)) && !countryInText(first)) loc.city = first;
    }
    if (loc.city || loc.country || loc.raw) out.push(loc);
  };
  if (c.candidate_type === 'organization') {
    if (c.meta?.labFromWeb) {
      (c.relevant_locations || []).forEach((l) => push('office', l, l.raw));
      push('parent_institution', c.hq_detail, c.headquarters);
    } else {
      push('headquarters', c.hq_detail, c.headquarters);
      (c.relevant_locations || []).forEach((l) => push('office', l, l.raw));
    }
  } else {
    push('profile', c.location_detail, c.location);
  }
  return out;
}

const cityMatch = (loc, city) => Boolean(city) && ((loc.city && canonCity(loc.city) === canonCity(city)) || (loc.raw && textHasCity(loc.raw, city)));

/** Check one recorded location against the geography → 'verified' | 'mismatch' | 'unverified' (+ note). */
function checkLocation(loc, geo) {
  if (geo.scope === 'country' || geo.scope === 'countries') {
    if (!loc.country) return { status: 'unverified', note: 'country not recorded' };
    return { status: geo.countries.includes(loc.country) ? 'verified' : 'mismatch' };
  }
  if (geo.scope === 'city') {
    if (!cityMatch(loc, geo.city)) {
      if (loc.city) return { status: 'mismatch' };
      return { status: loc.country && geo.country && loc.country !== geo.country ? 'mismatch' : 'unverified', note: 'city not recorded' };
    }
    if (geo.country && loc.country) return { status: loc.country === geo.country ? 'verified' : 'mismatch' };
    if (geo.country && AMBIGUOUS_CITIES.has(canonCity(geo.city))) return { status: 'unverified', note: 'city matches but country not recorded' };
    return { status: 'verified' };
  }
  if (geo.scope === 'hubs') {
    let pending = false;
    for (const h of geo.hubs) {
      if (loc.country && loc.country !== h.country) continue;
      const hit = uniq(h.cities.map(hubCityName)).find((name) => cityMatch(loc, name));
      if (!hit) continue;
      if (loc.country || !AMBIGUOUS_CITIES.has(canonCity(hit))) return { status: 'verified', note: h.label };
      pending = true;
    }
    if (pending) return { status: 'unverified', note: 'city matches a hub but country not recorded' };
    if (!loc.city) return { status: loc.country && !geo.countries.includes(loc.country) ? 'mismatch' : 'unverified', note: 'city not recorded' };
    return { status: 'mismatch' };
  }
  return { status: 'unverified' };
}

const BASIS_TEXT = { profile: 'Profile location', headquarters: 'Headquarters', office: 'Office / team location', parent_institution: 'Parent institution' };

/** Verified affiliations for institute searches: current employers, current schools, org/parent names. */
function affiliations(c) {
  const year = new Date().getFullYear();
  if (c.candidate_type === 'organization') {
    return [
      { name: c.name, basis: 'institution', text: 'Organization' },
      { name: c.parent_institution, basis: 'parent_institution', text: 'Parent institution' },
    ].filter((a) => a.name);
  }
  return [
    ...(c.meta?.current_roles || []).map((r) => ({ name: r.org, basis: 'institution', text: 'Current employer' })),
    { name: c.institution_or_company, basis: 'institution', text: c.meta?.academicOnly ? 'Listed affiliation' : 'Current organization' },
    // Schools count only while the person is (or was very recently) enrolled; alumni are not affiliated.
    ...(c.meta?.schools || []).filter((s) => !s.end_year || Number(s.end_year) >= year - 1).map((s) => ({ name: s.school, basis: 'institution', text: 'Current school' })),
  ].filter((a) => a.name);
}

/**
 * Hard geography check for one candidate.
 * @param {object} c Candidate (from normalize.js)
 * @param {object} geo ResolvedGeo
 * @returns {{status:'verified'|'unverified'|'mismatch'|'not_required', basis:string, detail?:string}} GeoCheck
 */
export function verifyGeo(c, geo) {
  if (!geo || geo.scope === 'worldwide') return { status: 'not_required', basis: 'none' };

  if (geo.scope === 'institute') {
    const list = affiliations(c);
    const hit = list.find((a) => institutionMatches(a.name, geo.institute));
    if (hit) return { status: 'verified', basis: hit.basis, detail: `${hit.text}: ${hit.name} (matches ${geo.institute})` };
    if (!list.length) return { status: 'unverified', basis: 'none', detail: 'No current affiliation recorded' };
    return { status: 'mismatch', basis: 'none', detail: `Affiliation: ${uniq(list.map((a) => a.name)).slice(0, 3).join('; ')}` };
  }

  const locs = candidateLocations(c);
  if (!locs.length) return { status: 'unverified', basis: 'none', detail: 'No location recorded' };
  const checks = locs.map((loc) => ({ loc, ...checkLocation(loc, geo) }));
  const ok = checks.find((x) => x.status === 'verified');
  if (ok) {
    const main = locs[0];
    let detail = `${BASIS_TEXT[ok.loc.basis] || 'Location'}: ${fmtLoc(ok.loc)}`;
    if (ok.note && geo.scope === 'hubs') detail += ` (${ok.note})`;
    if (ok.loc !== main && main.basis === 'headquarters') detail += `; headquarters elsewhere (${fmtLoc(main)})`;
    return { status: 'verified', basis: ok.loc.basis, detail };
  }
  const pending = checks.find((x) => x.status === 'unverified');
  const seen = `${BASIS_TEXT[locs[0].basis] || 'Location'}: ${fmtLoc(locs[0])}`;
  // A recorded location that conflicts is a mismatch, even when other entries are incomplete,
  // unless an incomplete entry could still be inside the area (then it's unverified).
  if (pending && checks.every((x) => x.status !== 'mismatch' || x.loc.basis === 'office')) {
    return { status: 'unverified', basis: 'none', detail: `${seen}${pending.note ? ` — ${pending.note}` : ''}` };
  }
  return { status: 'mismatch', basis: locs[0].basis, detail: seen };
}

/* ------------------------------------------------------------------ */
/* Proximity (5% criterion, only when the user asked for it)           */
/* ------------------------------------------------------------------ */
/**
 * Proximity of a candidate to the user, 0–5. Same institution 5, same city 4, same state/region 3.5,
 * same country 3, otherwise inside the selected area 2.
 * @returns {{score:number, reason:string}|null} null when the user's own location/institution or the candidate's location is unknown
 */
export function proximityScore(c, userProfile, geo) {
  const userLoc = userProfile?.location || {};
  const userInst = userProfile?.institution || '';
  const uCountry = canonCountry(userLoc.country || '');
  if (!userInst && !userLoc.city && !uCountry) return null;

  if (userInst && affiliations(c).some((a) => institutionMatches(a.name, userInst))) return { score: 5, reason: `Same institution as you (${userInst})` };

  const locs = candidateLocations(c);
  if (!locs.length) return null;
  let best = null;
  for (const loc of locs) {
    let r = null;
    const sameCountry = uCountry && loc.country && loc.country === uCountry;
    if (userLoc.city && cityMatch(loc, userLoc.city) && (!uCountry || !loc.country || sameCountry)) r = { score: 4, reason: `Same city as you (${userLoc.city})` };
    else if (userLoc.state && loc.state && normText(userLoc.state) === normText(loc.state) && (!uCountry || sameCountry)) r = { score: 3.5, reason: `Same state/region as you (${loc.state})` };
    else if (sameCountry) r = { score: 3, reason: `Same country as you (${uCountry})` };
    else if (loc.country || loc.city) r = { score: 2, reason: geo && geo.scope !== 'worldwide' ? `Inside your selected area (${geo.label})` : `Located in ${fmtLoc(loc)}` };
    if (r && (!best || r.score > best.score)) best = r;
  }
  return best;
}

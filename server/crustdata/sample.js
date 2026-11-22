// Offline sample-data transport. Produces Crustdata-shaped responses so the full
// product can be explored without credentials. Every record is fictional and is
// flagged `_sample: true`; the UI labels it as sample data. Profile URLs point to
// example.com so they can never be mistaken for (or link to) real people.
import { hash, tokens, uniq } from '../util.js';

const FIRST = ['Aarav', 'Mei', 'Lucas', 'Amara', 'Diego', 'Hana', 'Tomasz', 'Zara', 'Kenji', 'Ifeoma', 'Noah', 'Priya', 'Elif', 'Mateo', 'Sofia', 'Rohan', 'Ingrid', 'Yusuf', 'Chloé', 'Arjun', 'Leila', 'Owen', 'Nadia', 'Felix', 'Ananya', 'Jonas', 'Wei', 'Camila', 'Tariq', 'Freya'];
const LAST = ['Varma', 'Lindqvist', 'Okafor', 'Nakamura', 'Castell', 'Brandt', 'Iyer', 'Moreau', 'Haddad', 'Kowalski', 'Reyes', 'Sato', 'Mensah', 'Fischer', 'Rao', 'Delacroix', 'Novak', 'Chandra', 'Petrov', 'Alvarez', 'Kim', 'Osei', 'Bianchi', 'Hughes', 'Tanaka', 'Banerjee', 'Larsen', 'Duarte', 'Mehta', 'Quinn'];
const PLACES = [
  { city: 'San Francisco', state: 'California', country: 'United States' }, { city: 'Boston', state: 'Massachusetts', country: 'United States' },
  { city: 'Seattle', state: 'Washington', country: 'United States' }, { city: 'Pittsburgh', state: 'Pennsylvania', country: 'United States' },
  { city: 'Bengaluru', state: 'Karnataka', country: 'India' }, { city: 'Hyderabad', state: 'Telangana', country: 'India' }, { city: 'Pune', state: 'Maharashtra', country: 'India' },
  { city: 'London', state: 'England', country: 'United Kingdom' }, { city: 'Cambridge', state: 'England', country: 'United Kingdom' },
  { city: 'Munich', state: 'Bavaria', country: 'Germany' }, { city: 'Berlin', state: 'Berlin', country: 'Germany' }, { city: 'Zurich', state: 'Zurich', country: 'Switzerland' },
  { city: 'Toronto', state: 'Ontario', country: 'Canada' }, { city: 'Montreal', state: 'Quebec', country: 'Canada' }, { city: 'Singapore', state: '', country: 'Singapore' },
  { city: 'Paris', state: 'Île-de-France', country: 'France' }, { city: 'Amsterdam', state: 'North Holland', country: 'Netherlands' }, { city: 'Tokyo', state: 'Tokyo', country: 'Japan' },
];
const UNIS = ['Northfield Institute of Technology', 'University of Lakeshore', 'Westbrook University', 'Kestrel Polytechnic', 'Halvorsen Technical University', 'Marrow Valley University'];
const COS = ['Tensorloom Systems', 'Lumenfold Silicon', 'Orbitra Robotics', 'Fathomline Inference', 'Quillgate Edge', 'Brightkiln Labs', 'Corvane Compute', 'Siltwave Devices', 'Nimbleforge AI', 'Harrowmark Engineering', 'Petalcore Research', 'Driftnode Technologies'];
const TITLES = ['Research Scientist', 'Senior Software Engineer', 'Professor of Computer Science', 'PhD Candidate', 'Postdoctoral Researcher', 'Staff Machine Learning Engineer', 'Hardware Design Engineer', 'Independent Consultant', 'Co-Founder & CTO', 'Research Engineer', 'Graduate Student', 'Principal Engineer', 'Associate Professor', 'Freelance Developer'];
const SKILLS = ['Python', 'C++', 'CUDA', 'PyTorch', 'Rust', 'Verilog', 'SystemVerilog', 'FPGA', 'ROS', 'Kubernetes', 'Distributed Systems', 'Reinforcement Learning', 'Computer Vision', 'Signal Processing', 'Triton', 'MLIR', 'Embedded C', 'Control Systems'];

function rng(seed) {
  let s = parseInt(hash(seed).slice(0, 8), 16) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function collectStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
}
function findCondition(filters, fieldRe) {
  const found = [];
  (function walk(f) {
    if (!f) return;
    if (Array.isArray(f.conditions)) f.conditions.forEach(walk);
    else if (f.field && fieldRe.test(f.field)) found.push(f.value);
  })(filters);
  return found.flat();
}
function topicTerms(body) {
  const q = body?.search?.query || body?.query || '';
  const terms = uniq(tokens(q)).filter((t) => t.length > 3);
  return terms.length ? terms : ['systems', 'optimization'];
}
function placeFor(r, body) {
  const countries = findCondition(body.filters, /location\.country|locations\.country/);
  const cities = findCondition(body.filters, /city|full_location|headquarters/);
  let pool = PLACES;
  if (cities.length) pool = PLACES.filter((p) => cities.some((c) => String(c).toLowerCase().includes(p.city.toLowerCase())));
  else if (countries.length) pool = PLACES.filter((p) => countries.includes(p.country));
  if (!pool.length) {
    const c = countries[0] || 'United States';
    return { city: cities[0] ? String(cities[0]) : '', state: '', country: c };
  }
  return pick(r, pool);
}
const loc = (p) => ({ city: p.city, state: p.state, country: p.country, raw: [p.city, p.state, p.country].filter(Boolean).join(', '), full_location: [p.city, p.state, p.country].filter(Boolean).join(', ') });

const people = new Map();
const companies = new Map();

function makePerson(seed, body, idx) {
  const r = rng(seed);
  const terms = topicTerms(body);
  const wantedTitles = findCondition(body.filters, /title/).map(String);
  const t = wantedTitles.length ? (wantedTitles[idx % wantedTitles.length].length < 6 ? `${wantedTitles[idx % wantedTitles.length]} Researcher` : title(wantedTitles[idx % wantedTitles.length])) : pick(r, TITLES);
  const institution = findCondition(body.filters, /company_name|school/)[0];
  const academic = /professor|phd|postdoc|student|lecturer|faculty|doctoral/i.test(t);
  const org = institution ? title(String(institution)) : academic ? pick(r, UNIS) : pick(r, COS);
  const place = placeFor(r, body);
  const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
  const slug = `${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${seed.slice(0, 6)}`;
  const relevance = r(); // varies how on-topic this sample person is
  const topicPhrase = terms.slice(0, 3).join(' ');
  const skills = uniq([...(relevance > 0.3 ? terms.slice(0, 3).map(title) : []), pick(r, SKILLS), pick(r, SKILLS), pick(r, SKILLS)]);
  const id = parseInt(seed.slice(0, 7), 16);
  const person = {
    _sample: true,
    crustdata_person_id: id,
    basic_profile: {
      name, headline: `${t} at ${org}${relevance > 0.5 ? ` · ${title(topicPhrase)}` : ''}`, current_title: t,
      summary: relevance > 0.4
        ? `Works on ${topicPhrase} with a focus on ${pick(r, ['performance', 'reliability', 'theory', 'real-world deployment', 'hardware efficiency'])}. Previously built ${pick(r, ['production systems', 'research prototypes', 'open-source tooling'])} in this area.`
        : `Experienced in ${skills.slice(-2).join(' and ')}; interested in ${pick(r, ['systems', 'ML', 'embedded', 'robotics'])}.`,
      location: loc(place),
    },
    experience: {
      employment_details: {
        current: [{ name: org, company_name: org, title: t, start_date: `${2016 + Math.floor(r() * 8)}-01-01`, description: relevance > 0.5 ? `Leading work on ${topicPhrase}.` : '' }],
        past: [{ name: pick(r, [...COS, ...UNIS]), title: pick(r, TITLES), start_date: '2013-06-01', end_date: '2016-12-01' }],
      },
      years_of_experience_raw: 2 + Math.floor(r() * 18),
    },
    education: { schools: [{ school: pick(r, UNIS), degree: pick(r, ['B.Tech', 'B.S.', 'M.S.', 'Ph.D.']), field_of_study: pick(r, ['Computer Science', 'Electrical Engineering', 'Mechanical Engineering', 'Physics']) }] },
    skills: { professional_network_skills: skills },
    social_handles: { professional_network_identifier: { profile_url: `https://example.com/sample-profiles/${slug}` } },
    _relevance: relevance,
    _terms: terms,
  };
  people.set(person.social_handles.professional_network_identifier.profile_url, person);
  return person;
}

function enrichPerson(p) {
  const r = rng(`enrich:${p.crustdata_person_id}`);
  const terms = p._terms || ['systems'];
  const on = p._relevance > 0.35;
  const academic = /professor|phd|postdoc|student|research|scientist|lecturer/i.test(p.basic_profile.current_title);
  const out = structuredClone(p);
  out.dev_platform_profiles = [{
    profile_url: `https://example.com/sample-code/${p.crustdata_person_id}`,
    bio: on ? `Building ${terms.slice(0, 2).join(' ')} tools` : 'Open-source contributor',
    public_repo_count: 5 + Math.floor(r() * 60),
    total_stars: Math.floor(r() * (on ? 4000 : 300)),
    all_languages: uniq([pick(r, ['Python', 'C++', 'Rust', 'Go', 'Verilog']), pick(r, ['CUDA', 'TypeScript', 'C'])]),
    repos: [
      { full_name: `sample/${terms.slice(0, 2).join('-') || 'project'}${on ? '' : '-notes'}`, description: on ? `Implementation of ${terms.slice(0, 3).join(' ')} with benchmarks` : 'Personal experiments', primary_language: 'Python', stars: Math.floor(r() * (on ? 2500 : 40)), topics: terms.slice(0, 3) },
      { full_name: `sample/${pick(r, ['bench', 'kernels', 'toolkit', 'sim'])}`, description: 'Utilities', primary_language: 'C++', stars: Math.floor(r() * 200), topics: [] },
    ],
  }];
  if (academic || r() > 0.6) {
    out.research_profiles = [{
      profile_url: `https://example.com/sample-scholar/${p.crustdata_person_id}`,
      designation: p.basic_profile.current_title,
      affiliated_organisation: p.experience.employment_details.current[0].name,
      research_interests: on ? terms.slice(0, 4).map(title) : ['Machine Learning'],
      citations_count: { all: Math.floor(r() * (academic ? 9000 : 400)) },
      h_index: { all: Math.floor(r() * (academic ? 40 : 8)) },
      articles: [
        { title: on ? `Efficient ${terms.slice(0, 3).join(' ')}: methods and evaluation` : 'A survey of learning systems', publication_year: 2020 + Math.floor(r() * 6), total_citations: Math.floor(r() * 500) },
        { title: on ? `Scaling ${terms[0] || 'systems'} under real-world constraints` : 'Notes on optimization', publication_year: 2019 + Math.floor(r() * 6), total_citations: Math.floor(r() * 120) },
      ],
    }];
  }
  return out;
}

function makeCompany(seed, body, idx) {
  const r = rng(seed);
  const terms = topicTerms(body);
  const academic = /university|institute|lab|research/i.test(body?.search?.query || '') && r() > 0.5;
  const name = academic ? `${pick(r, UNIS)}${r() > 0.5 ? ` — ${title(terms[0] || 'Systems')} Lab` : ''}` : `${pick(r, COS).split(' ')[0]} ${title(terms[idx % terms.length] || 'Systems')}`;
  const place = placeFor(r, body);
  const sizes = findCondition(body.filters, /headcount/).map(Number).filter(Number.isFinite);
  const lo = sizes.length ? Math.min(...sizes) : 5; const hi = sizes.length ? Math.max(...sizes) : 5000;
  const headcount = Math.max(1, Math.round(lo + r() * Math.max(1, Math.min(hi, 20000) - lo)));
  const relevance = r();
  const id = parseInt(seed.slice(0, 7), 16);
  const c = {
    _sample: true,
    crustdata_company_id: id,
    basic_info: {
      name, primary_domain: `${name.toLowerCase().replace(/[^a-z]+/g, '')}.example.com`, website: `https://example.com/sample-orgs/${id}`,
      description: relevance > 0.35 ? `${name} develops ${terms.slice(0, 3).join(' ')} technology, with products and research spanning ${pick(r, ['edge deployment', 'datacenter systems', 'embedded platforms', 'open research'])}.` : `${name} provides ${pick(r, ['software services', 'engineering consulting', 'hardware design', 'research'])} to enterprise customers.`,
      industries: [academic ? 'Higher Education' : pick(r, ['Software Development', 'Semiconductor Manufacturing', 'Research Services', 'IT Services and IT Consulting', 'Robotics Engineering'])],
      company_type: academic ? 'Educational' : pick(r, ['Privately Held', 'Privately Held', 'Public Company', 'Nonprofit']),
      year_founded: 1990 + Math.floor(r() * 34),
      professional_network_url: `https://example.com/sample-orgs/${id}/profile`,
    },
    headcount: { total: headcount },
    locations: { headquarters: loc(place).raw, city: place.city, state: place.state, country: place.country },
    funding: academic ? {} : { total_investment_usd: Math.floor(r() * 80) * 1e6, last_round_type: pick(r, ['Seed', 'Series A', 'Series B', 'Grant']) },
    taxonomy: { professional_network_specialities: relevance > 0.35 ? terms.slice(0, 4).map(title) : ['Consulting'] },
    _relevance: relevance,
    _terms: terms,
  };
  companies.set(id, c);
  return c;
}

const matchWrap = (matched_on, match_type, data, key) => ({ matched_on, match_type, match_status: data ? 'matched' : 'not_found', matches: data ? [{ confidence_score: 0.9, [key]: data }] : [] });

export class SampleCrustdata {
  constructor() { this.kind = 'sample'; }
  status() { return { transport: 'sample', connected: true, auth: 'none' }; }

  async call(op, body) {
    await new Promise((r) => setTimeout(r, 120));
    switch (op) {
      case 'personSearch': {
        const page = body.cursor ? Number(String(body.cursor).split(':')[1]) : 0;
        const n = Math.min(body.limit || 20, 30);
        const base = hash({ q: body.search?.query, f: body.filters });
        const name = findCondition(body.filters, /basic_profile\.name/)[0];
        const profiles = Array.from({ length: name ? 2 : n }, (_, i) => {
          const p = makePerson(hash(`${base}:${page}:${i}`), body, i);
          if (name) p.basic_profile.name = title(String(name));
          return p;
        });
        return { data: { profiles, next_cursor: page < 2 && !name ? `sample:${page + 1}` : null, total_count: name ? 2 : 3 * n }, credits: 0 };
      }
      case 'personEnrich':
        return { data: (body.professional_network_profile_urls || []).map((u) => matchWrap(u, 'professional_network_profile_url', people.get(u) ? enrichPerson(people.get(u)) : null, 'person_data')), credits: 0 };
      case 'personIdentify': {
        const ids = body.emails || body.professional_network_profile_urls || body.research_profile_urls || [];
        return {
          data: ids.map((v) => {
            const local = String(v).split('@')[0].replace(/[^a-z]+/gi, ' ').trim() || 'Sample Person';
            const p = makePerson(hash(`id:${v}`), { search: { query: 'engineering research' } }, 0);
            p.basic_profile.name = title(local);
            return matchWrap(v, body.emails ? 'email' : 'professional_network_profile_url', p, 'person_data');
          }),
          credits: 0,
        };
      }
      case 'companySearch': {
        const page = body.cursor ? Number(String(body.cursor).split(':')[1]) : 0;
        const n = Math.min(body.limit || 20, 25);
        const base = hash({ q: body.search?.query, f: body.filters });
        return { data: { companies: Array.from({ length: n }, (_, i) => makeCompany(hash(`${base}:${page}:${i}`), body, i)), next_cursor: page < 2 ? `sample:${page + 1}` : null, total_count: 3 * n }, credits: 0 };
      }
      case 'companyEnrich':
      case 'companyIdentify': {
        const ids = body.crustdata_company_ids || body.domains || body.names || [];
        return {
          data: ids.map((v) => {
            let c = companies.get(Number(v));
            if (!c) { c = makeCompany(hash(`co:${v}`), { search: { query: String(v) } }, 0); if (body.names) c.basic_info.name = String(v); }
            return matchWrap(v, body.crustdata_company_ids ? 'crustdata_company_id' : body.domains ? 'domain' : 'name', c, 'company_data');
          }),
          credits: 0,
        };
      }
      case 'webSearch': {
        const terms = uniq(tokens(body.query)).filter((t) => t.length > 3);
        const r = rng(`web:${body.query}`);
        const scholar = (body.sources || []).some((s) => s.startsWith('scholar'));
        const results = Array.from({ length: 8 }, (_, i) => {
          const a1 = `${pick(r, FIRST)} ${pick(r, LAST)}`; const a2 = `${pick(r, FIRST)} ${pick(r, LAST)}`;
          return scholar
            ? { source: 'scholar-articles', title: `${title(terms.slice(i % 3, (i % 3) + 3).join(' '))}: ${pick(r, ['a systems study', 'algorithms and analysis', 'benchmarks and lessons', 'towards practical deployment'])}`, url: `https://example.com/sample-papers/${hash(body.query + i).slice(0, 10)}`, snippet: `We study ${terms.slice(0, 3).join(' ')} …`, metadata: `${a1}, ${a2} - ${2019 + (i % 6)} - Sample Proceedings`, citations: Math.floor(r() * 400), authors: [{ name: a1, profile_url: `https://example.com/sample-scholar/${hash(a1).slice(0, 8)}` }, { name: a2, profile_url: null }], _sample: true }
            : { source: 'web', title: `${pick(r, UNIS)} ${title(terms[0] || 'Systems')} ${pick(r, ['Lab', 'Research Group', 'Laboratory'])}`, url: `https://example.com/sample-labs/${hash(body.query + i).slice(0, 10)}`, snippet: `The group studies ${terms.slice(0, 3).join(' ')} and related problems.`, position: i + 1, _sample: true };
        });
        return { data: { success: true, query: body.query, results }, credits: 0 };
      }
      case 'personContact': {
        // Deterministic: about half of sample people have a (fictional, example.com) work email.
        return {
          data: (body.professional_network_profile_urls || []).map((u) => {
            const p = people.get(u);
            if (!p) return matchWrap(u, 'professional_network_profile_url', null, 'person_data');
            const has = parseInt(hash(`contact:${u}`).slice(0, 2), 16) % 2 === 0;
            const [first, last] = p.basic_profile.name.toLowerCase().split(' ');
            const org = (p.experience.employment_details.current[0]?.name || 'sample').toLowerCase().replace(/[^a-z]+/g, '');
            const contact = has
              ? { business_emails: [{ email: `${first}.${last}@${org}.example.com`, status: 'verified', last_updated: '2026-11-01T00:00:00Z' }] }
              : { business_emails: [], business_emails_message: 'No business email found' };
            return matchWrap(u, 'professional_network_profile_url', { crustdata_person_id: p.crustdata_person_id, contact, _sample: true }, 'person_data');
          }),
          credits: 0,
        };
      }
      case 'webFetch':
        return { data: (body.urls || []).map((u) => ({ success: true, url: u, title: 'Sample page', content: 'Sample content (offline mode).' })), credits: 0 };
      default:
        throw new Error(`Unknown op ${op}`);
    }
  }
  async batch(op, list) { return Promise.all(list.map((b) => this.call(op, b).catch((e) => e))); }
}

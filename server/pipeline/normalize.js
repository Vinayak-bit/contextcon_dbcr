// Deterministic normalization: Crustdata JSON → standardized candidate profile
// plus a numbered evidence list. Every later step (LLM extraction, judging,
// the UI) refers to evidence by these ids, so nothing is shown without a source.
import { hash, uniq, compact } from '../util.js';

const fmtDate = (d) => (d ? String(d).slice(0, 7) : '');
const span = (a, b) => (a || b ? ` (${fmtDate(a) || '?'} – ${b ? fmtDate(b) : 'present'})` : '');

class EvidenceList {
  constructor(prefix) { this.items = []; this.prefix = prefix; }
  add(kind, text, extra = {}) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const id = `${this.prefix}${this.items.length + 1}`;
    this.items.push({ id, kind, text: t.slice(0, 700), ...extra });
    return id;
  }
}

export function inferCareerStage(title = '', years) {
  const t = String(title).toLowerCase();
  if (/\b(undergrad|undergraduate|b\.?tech|bachelor|student|intern)\b/.test(t) && !/phd|doctoral/.test(t)) return 'Student';
  if (/phd|doctoral|doctorate candidate/.test(t)) return 'PhD student';
  if (/postdoc|post-doc|postdoctoral/.test(t)) return 'Postdoctoral researcher';
  if (/professor|faculty|lecturer|reader|chair\b/.test(t)) return /assistant/.test(t) ? 'Early-career faculty' : 'Faculty';
  if (/founder|cto|chief|vp|vice president|director|head of|principal|distinguished|fellow|staff/.test(t)) return 'Senior / leadership';
  if (Number.isFinite(years)) return years < 3 ? 'Early-career' : years < 8 ? 'Mid-career' : 'Senior';
  if (/senior|lead/.test(t)) return 'Senior';
  return 'Unknown';
}

export function personToCandidate(p, { retrievedAt, transport, origin = 'person_search', searchRank } = {}) {
  const bp = p.basic_profile || {};
  const cur = p.experience?.employment_details?.current || [];
  const past = p.experience?.employment_details?.past || [];
  const schools = p.education?.schools || [];
  const skills = p.skills?.professional_network_skills || [];
  const dev = p.dev_platform_profiles || [];
  const research = p.research_profiles || [];
  const ev = new EvidenceList('E');

  ev.add('headline', bp.headline && `Headline: ${bp.headline}`);
  ev.add('summary', bp.summary && `About: ${bp.summary}`);
  cur.slice(0, 4).forEach((r) => ev.add('role', `Current role: ${r.title || 'Role'} at ${r.name || r.company_name || 'organization'}${span(r.start_date)}${r.description ? ` — ${r.description}` : ''}`));
  past.slice(0, 8).forEach((r) => ev.add('role', `Past role: ${r.title || 'Role'} at ${r.name || r.company_name || 'organization'}${span(r.start_date, r.end_date || 'past')}${r.description ? ` — ${r.description}` : ''}`));
  schools.slice(0, 4).forEach((s) => ev.add('education', `Education: ${compact([s.degree, s.field_of_study]).join(', ') || 'Studies'} at ${s.school}${s.end_year ? ` (${s.end_year})` : ''}`));
  if (skills.length) ev.add('skills', `Listed skills: ${skills.slice(0, 30).join(', ')}`);
  (p.honors || []).slice(0, 5).forEach((h) => ev.add('honor', `Honor/award: ${h.title || h.name || JSON.stringify(h).slice(0, 120)}`));
  (p.certifications || []).slice(0, 4).forEach((c) => ev.add('certification', `Certification: ${c.name || c.title || ''}`));

  const projects = [];
  for (const d of dev.slice(0, 2)) {
    ev.add('dev_profile', `Code-hosting profile: ${d.public_repo_count ?? '?'} public repos, ${d.total_stars ?? 0} total stars${d.all_languages?.length ? `, languages: ${d.all_languages.slice(0, 8).join(', ')}` : ''}${d.bio ? `. Bio: ${d.bio}` : ''}`, { url: d.profile_url });
    for (const r of (d.repos || []).slice(0, 10)) {
      const id = ev.add('repository', `Repository ${r.full_name || r.name}${r.primary_language ? ` (${r.primary_language})` : ''}, ${r.stars ?? r.stargazers_count ?? 0} stars${r.forks_count ? `, ${r.forks_count} forks` : ''}${r.description ? `: ${r.description}` : ''}${r.topics?.length ? ` [topics: ${r.topics.join(', ')}]` : ''}`, { url: r.html_url || (r.full_name && d.profile_url ? `${d.profile_url.replace(/\/$/, '')}/${String(r.full_name).split('/').pop()}` : undefined) });
      if (id) projects.push({ title: r.full_name || r.name, description: r.description || '', language: r.primary_language, stars: r.stars ?? r.stargazers_count ?? 0, evidence: [id] });
    }
  }
  const publications = [];
  for (const rp of research.slice(0, 2)) {
    ev.add('research_profile', `Scholar profile: ${compact([rp.designation, rp.affiliated_organisation]).join(', ')}${rp.research_interests?.length ? `; interests: ${rp.research_interests.join(', ')}` : ''}; citations: ${rp.citations_count?.all ?? '?'}; h-index: ${rp.h_index?.all ?? '?'}`, { url: rp.profile_url });
    for (const a of (rp.articles || []).slice(0, 12)) {
      const id = ev.add('publication', `Publication: "${a.title}"${a.publication_year ? ` (${a.publication_year})` : ''}${Number.isFinite(a.total_citations) ? `, ${a.total_citations} citations` : ''}${a.authors?.length ? `; authors: ${a.authors.slice(0, 6).map((x) => x.name || x).join(', ')}` : ''}`, { url: a.url });
      if (id) publications.push({ title: a.title, year: a.publication_year, citations: a.total_citations, evidence: [id] });
    }
  }

  const name = bp.name || compact([bp.first_name, bp.last_name]).join(' ') || 'Unknown';
  const title = bp.current_title || cur[0]?.title || '';
  const org = cur[0]?.name || cur[0]?.company_name || '';
  const linkedin = p.social_handles?.professional_network_identifier?.profile_url;
  const devUrl = p.social_handles?.dev_platform_identifier?.profile_url || dev[0]?.profile_url;
  const scholarUrl = research[0]?.profile_url;
  const location = bp.location || {};
  return {
    candidate_id: p.crustdata_person_id ? `p_${p.crustdata_person_id}` : `p_${hash(name + org)}`,
    candidate_type: 'individual',
    name,
    current_role: title,
    institution_or_company: org,
    career_stage: inferCareerStage(title, p.experience?.years_of_experience_raw),
    location: location.raw || location.full_location || compact([location.city, location.state, location.country]).join(', '),
    location_detail: { city: location.city || '', state: location.state || '', country: location.country || '' },
    headline: bp.headline || '',
    specializations: [],
    relevant_work: [],
    publications,
    engineering_projects: projects,
    accomplishments: [],
    methods_and_skills: skills.slice(0, 30),
    collaboration_evidence: [],
    source_urls: compact([
      linkedin && { label: 'Professional profile', url: linkedin },
      devUrl && { label: 'Code profile', url: devUrl },
      scholarUrl && { label: 'Scholar profile', url: scholarUrl },
    ]),
    evidence: ev.items,
    meta: {
      crustdata_person_id: p.crustdata_person_id,
      linkedin,
      origin,
      searchRank,
      retrievedAt,
      transport,
      sample: Boolean(p._sample),
      current_roles: cur.map((r) => ({ title: r.title, org: r.name || r.company_name })),
      past_orgs: past.map((r) => r.name || r.company_name).filter(Boolean),
      schools: schools.map((s) => ({ school: s.school, end_year: s.end_year })),
      years_experience: p.experience?.years_of_experience_raw,
      h_index: research[0]?.h_index?.all,
      citations: research[0]?.citations_count?.all,
      total_stars: dev[0]?.total_stars,
      enriched: Boolean(p.experience || p.education || dev.length || research.length),
    },
  };
}

/** Candidate for an author found only through academic search (no professional profile). */
export function academicAuthorCandidate(author, papers, { retrievedAt, transport }) {
  const ev = new EvidenceList('E');
  const publications = papers.slice(0, 10).map((p) => {
    const id = ev.add('publication', `Publication: "${p.title}"${p.year ? ` (${p.year})` : ''}${Number.isFinite(p.citations) ? `, ${p.citations} citations` : ''}${p.venue ? ` — ${p.venue}` : ''}${p.snippet ? `. ${p.snippet}` : ''}`, { url: p.url });
    return { title: p.title, year: p.year, citations: p.citations, evidence: [id] };
  });
  return {
    candidate_id: `a_${hash(author.name.toLowerCase() + (author.profile_url || ''))}`,
    candidate_type: 'individual',
    name: author.name,
    current_role: '',
    institution_or_company: author.affiliation || '',
    career_stage: 'Unknown',
    location: '',
    location_detail: { city: '', state: '', country: '' },
    headline: '',
    specializations: [], relevant_work: [], publications, engineering_projects: [], accomplishments: [], methods_and_skills: [], collaboration_evidence: [],
    source_urls: compact([author.profile_url && { label: 'Scholar profile', url: author.profile_url }, ...papers.slice(0, 3).map((p) => p.url && { label: 'Paper', url: p.url })]),
    evidence: ev.items,
    meta: { origin: 'academic_search', academicOnly: true, retrievedAt, transport, sample: papers.some((p) => p._sample), current_roles: [], past_orgs: [], schools: [] },
  };
}

export function companyToCandidate(c, { retrievedAt, transport, origin = 'company_search', searchRank } = {}) {
  const bi = c.basic_info || {};
  const loc = c.locations || {};
  const tax = c.taxonomy || {};
  const fund = c.funding || {};
  const ev = new EvidenceList('E');
  ev.add('description', bi.description && `Description: ${bi.description}`);
  const industries = uniq([...(bi.industries || []), tax.professional_network_industry, ...(tax.professional_network_industries || [])]);
  if (industries.length) ev.add('industry', `Industries: ${industries.join(', ')}`);
  const specialities = uniq([...(tax.professional_network_specialities || []), ...(tax.categories || []), ...(bi.markets || [])]);
  if (specialities.length) ev.add('specialities', `Listed specialities: ${specialities.slice(0, 25).join(', ')}`);
  if (bi.company_type) ev.add('type', `Organization type: ${bi.company_type}`);
  if (bi.year_founded) ev.add('founded', `Founded: ${bi.year_founded}`);
  const headcount = c.headcount?.total ?? null;
  if (headcount) ev.add('headcount', `Headcount: about ${headcount}`);
  if (fund.total_investment_usd) ev.add('funding', `Funding: $${Math.round(fund.total_investment_usd / 1e6)}M total${fund.last_round_type ? `, last round ${fund.last_round_type}` : ''}`);
  const techs = (c.technographics?.top_technologies || c.technographics?.technologies || []).slice(0, 15).map((t) => t.name || t);
  if (techs.length) ev.add('technologies', `Technologies used: ${techs.join(', ')}`);
  const offices = compact([...(Array.isArray(loc.offices) ? loc.offices : []), ...(Array.isArray(loc.all_locations) ? loc.all_locations : [])]).slice(0, 10);
  const hqRaw = typeof loc.headquarters === 'string' ? loc.headquarters : loc.headquarters?.raw || compact([loc.city, loc.state, loc.country]).join(', ');
  return {
    candidate_id: c.crustdata_company_id ? `o_${c.crustdata_company_id}` : `o_${hash(bi.name || bi.primary_domain || '')}`,
    candidate_type: 'organization',
    name: bi.name || bi.primary_domain || 'Unknown organization',
    organization_type: '',
    headquarters: hqRaw,
    hq_detail: { city: loc.city || loc.headquarters?.city || '', state: loc.state || '', country: loc.country || loc.headquarters?.country || '' },
    relevant_locations: offices.map((o) => (typeof o === 'string' ? { raw: o } : { raw: o.raw || compact([o.city, o.country]).join(', '), city: o.city, country: o.country })),
    employee_count: headcount,
    industries,
    company_type: bi.company_type || '',
    description: bi.description || '',
    specializations: specialities.slice(0, 12),
    products_and_projects: [], research_and_engineering_work: [], accomplishments: [], relevant_teams: [], collaboration_evidence: [],
    source_urls: compact([bi.website && { label: 'Website', url: bi.website }, bi.professional_network_url && { label: 'Professional profile', url: bi.professional_network_url }]),
    evidence: ev.items,
    meta: { crustdata_company_id: c.crustdata_company_id, domain: bi.primary_domain, origin, searchRank, retrievedAt, transport, sample: Boolean(c._sample), enriched: Boolean(bi.description || c.funding), founded: bi.year_founded },
  };
}

/** Lab / research group discovered from web search (often not a company record). */
export function labCandidate(lab, { retrievedAt, transport, parent }) {
  const ev = new EvidenceList('E');
  ev.add('web', `${lab.name}${lab.parent ? ` (${lab.parent})` : ''}: ${lab.snippet || lab.description || ''}`, { url: lab.url });
  (lab.extra || []).forEach((x) => ev.add('web', x.text, { url: x.url }));
  if (parent?.hq) ev.add('parent', `Parent institution: ${lab.parent}, headquartered in ${parent.hq}`);
  return {
    candidate_id: `l_${hash((lab.url || '') + lab.name)}`,
    candidate_type: 'organization',
    name: lab.name,
    organization_type: 'Academic Research Laboratory',
    headquarters: parent?.hq || '',
    hq_detail: parent?.detail || { city: '', state: '', country: '' },
    relevant_locations: lab.location ? [{ raw: lab.location }] : [],
    employee_count: null,
    industries: ['Research'],
    company_type: 'Research group',
    description: lab.snippet || '',
    parent_institution: lab.parent || '',
    specializations: [], products_and_projects: [], research_and_engineering_work: [], accomplishments: [], relevant_teams: [], collaboration_evidence: [],
    source_urls: compact([lab.url && { label: 'Lab page', url: lab.url }]),
    evidence: ev.items,
    meta: { origin: 'academic_web_search', retrievedAt, transport, sample: Boolean(lab._sample), labFromWeb: true },
  };
}

// Shared catalog: persona copy, candidate-type options, and the retrieval
// mappings the backend uses for them. Imported by both the server and the UI,
// so every checkbox the user sees maps to a concrete backend constraint.

/* ------------------------------------------------------------------ */
/* Individual candidate types                                          */
/* ------------------------------------------------------------------ */
// `titles`: phrases matched against the person's current title/headline.
//   Each phrase is sent to Crustdata as a `(.)` (all words, any order) filter
//   and re-checked after enrichment, so the selection is a hard constraint.
// `orientation`: which kind of evidence matters most for this type.
export const INDIVIDUAL_TYPES = {
  professors: { label: 'Professors / Faculty', titles: ['Professor', 'Faculty', 'Lecturer', 'Reader'], orientation: 'research' },
  phd_postdoc: { label: 'PhD Students / Postdoctoral Researchers', titles: ['PhD', 'Doctoral', 'Postdoctoral', 'Postdoc', 'PhD Candidate'], orientation: 'research' },
  phd_students: { label: 'PhD Students', titles: ['PhD', 'Doctoral', 'PhD Candidate'], orientation: 'research' },
  postdocs: { label: 'Postdoctoral Researchers', titles: ['Postdoctoral', 'Postdoc'], orientation: 'research' },
  fellow_students: { label: 'Fellow Students', titles: ['Student', 'Undergraduate', 'Graduate Student', 'Masters Student', 'Research Intern'], orientation: 'either' },
  students: { label: 'Undergraduate / Graduate Students', titles: ['Student', 'Undergraduate', 'Graduate Student', 'Masters Student', 'Research Assistant'], orientation: 'either' },
  research_scientists: { label: 'Research Scientists', titles: ['Research Scientist', 'Scientist', 'Applied Scientist'], orientation: 'research' },
  industry_research_scientists: { label: 'Industry Research Scientists', titles: ['Research Scientist', 'Applied Scientist', 'Staff Scientist'], orientation: 'research' },
  pro_engineers: { label: 'Working Professionals — Engineers', titles: ['Engineer', 'Developer', 'Architect'], orientation: 'engineering' },
  pro_researchers: { label: 'Working Professionals — Researchers', titles: ['Researcher', 'Research Scientist', 'Research Engineer'], orientation: 'research' },
  research_engineers: { label: 'Research Engineers', titles: ['Research Engineer', 'Research Software Engineer'], orientation: 'either' },
  specialized_engineers: { label: 'Specialized Engineers / Technical Experts', titles: ['Engineer', 'Specialist', 'Architect', 'Technical Lead'], orientation: 'engineering', useExpertise: true },
  independent: { label: 'Independent Researchers / Freelancers', titles: ['Independent', 'Freelance', 'Freelancer', 'Self-employed', 'Consultant'], orientation: 'either' },
  independent_researchers: { label: 'Independent Researchers', titles: ['Independent Researcher', 'Independent', 'Self-employed Researcher'], orientation: 'research' },
  fellow_independent: { label: 'Fellow Independent Researchers', titles: ['Independent Researcher', 'Independent', 'Self-employed'], orientation: 'research' },
  independent_engineers: { label: 'Independent Engineers / Developers', titles: ['Freelance', 'Freelancer', 'Independent', 'Self-employed', 'Contractor'], orientation: 'engineering' },
  founders_leaders: { label: 'Founders / Technical Leaders', titles: ['Founder', 'Co-Founder', 'CTO', 'Chief Technology Officer', 'Head of Engineering', 'VP Engineering'], orientation: 'engineering' },
  founders: { label: 'Startup Founders', titles: ['Founder', 'Co-Founder'], orientation: 'engineering' },
  founders_experts: { label: 'Technical Founders / Industry Experts', titles: ['Founder', 'Co-Founder', 'CTO', 'Principal', 'Distinguished Engineer', 'Fellow'], orientation: 'engineering' },
  software_engineers: { label: 'Software Engineers', titles: ['Software Engineer', 'Software Developer', 'Backend Engineer', 'Systems Engineer'], orientation: 'engineering' },
  hardware_engineers: { label: 'Hardware / Electronics Engineers', titles: ['Hardware Engineer', 'Electronics Engineer', 'ASIC', 'FPGA', 'RTL', 'Design Engineer', 'Electrical Engineer'], orientation: 'engineering' },
  ml_engineers: { label: 'AI/ML Engineers', titles: ['Machine Learning Engineer', 'ML Engineer', 'AI Engineer', 'Deep Learning Engineer'], orientation: 'engineering' },
  domain_specialists: { label: 'Domain-Specific Engineering Specialists', titles: ['Engineer', 'Specialist'], orientation: 'engineering', useExpertise: true },
  academic_experts: { label: 'Professors / Academic Experts', titles: ['Professor', 'Faculty', 'Lecturer', 'Academic'], orientation: 'research' },
  consultants_freelancers: { label: 'Independent Consultants / Freelancers', titles: ['Consultant', 'Freelance', 'Freelancer', 'Independent', 'Contractor'], orientation: 'engineering' },
  consultants: { label: 'Technical Consultants', titles: ['Consultant', 'Advisor', 'Technical Consultant'], orientation: 'engineering' },
  senior_specialists: { label: 'Senior Engineers / Specialists', titles: ['Senior Engineer', 'Staff Engineer', 'Principal Engineer', 'Senior', 'Specialist'], orientation: 'engineering' },
};

/* ------------------------------------------------------------------ */
/* Organization candidate types                                        */
/* ------------------------------------------------------------------ */
// `kind`: 'academic' types are also discovered through academic web search
//   (labs and research groups are often not separate company records).
// `queryHint`: appended to the hybrid company search query for this type.
// `match`: post-retrieval classifier used to enforce the selection.
//   industries/types are case-insensitive substrings; headcount is [min,max].
export const ORG_TYPES = {
  universities: { label: 'Universities / Institutes', kind: 'academic', queryHint: 'university institute', match: { industries: ['higher education'], companyTypes: ['educational'], names: ['university', 'institute', 'college', 'polytechnic', 'école', 'universität'] } },
  academic_institutes: { label: 'Academic Research Institutes', kind: 'academic', queryHint: 'research institute', match: { industries: ['research', 'higher education'], companyTypes: ['educational', 'nonprofit', 'government'], names: ['institute', 'centre', 'center', 'laboratory', 'university'], notTypes: ['privately held', 'public company', 'self-owned', 'self-employed'] } },
  academic_labs: { label: 'Academic Research Laboratories', kind: 'academic', queryHint: 'research lab', match: { industries: ['research', 'higher education'], companyTypes: ['educational'], names: ['lab', 'laboratory', 'group', 'center', 'centre', 'institute'], notTypes: ['privately held', 'public company', 'self-owned', 'self-employed'] } },
  specialized_labs: { label: 'Specialized Research Laboratories', kind: 'academic', queryHint: 'research laboratory', match: { industries: ['research'], companyTypes: [], names: ['lab', 'laboratory', 'research', 'institute', 'center', 'centre'] } },
  industrial_labs: { label: 'Industrial Research Laboratories', kind: 'company', queryHint: 'research lab R&D', match: { industries: ['research', 'technology', 'software', 'semiconductor', 'engineering'], names: ['research', 'labs', 'laboratory'], requireResearchSignal: true, notTypes: ['educational', 'government agency'] } },
  corporate_rd: { label: 'Corporate R&D Teams', kind: 'company', queryHint: 'R&D', match: { minHeadcount: 200, requireResearchSignal: true, notTypes: ['educational', 'government agency'] } },
  corporate_rd_labs: { label: 'Corporate R&D Laboratories', kind: 'company', queryHint: 'R&D laboratory', match: { minHeadcount: 200, requireResearchSignal: true, notTypes: ['educational', 'government agency'] } },
  corporate_research_teams: { label: 'Corporate Research Teams', kind: 'company', queryHint: 'research', match: { minHeadcount: 200, requireResearchSignal: true, notTypes: ['educational', 'government agency'] } },
  startups: { label: 'Startups', kind: 'company', queryHint: 'startup', match: { maxHeadcount: 200, companyTypes: ['privately held', 'private', 'self-owned', 'partnership'], notTypes: ['educational', 'government'] } },
  deeptech_startups: { label: 'Deep-Tech Startups', kind: 'company', queryHint: 'deep tech startup', match: { maxHeadcount: 200, notTypes: ['educational', 'government'] } },
  tech_companies: { label: 'Technology Companies', kind: 'company', queryHint: 'technology company', match: { industries: ['software', 'technology', 'internet', 'computer', 'semiconductor', 'it services', 'electronics', 'telecommunications', 'robotics', 'hardware'], notTypes: ['educational'] } },
  small_companies: { label: 'Small Technology Companies', kind: 'company', queryHint: 'company', match: { maxHeadcount: 50, notTypes: ['educational'] } },
  mid_companies: { label: 'Mid-Sized Companies', kind: 'company', queryHint: 'company', match: { minHeadcount: 51, maxHeadcount: 1000, notTypes: ['educational'] } },
  large_enterprises: { label: 'Large Enterprises', kind: 'company', queryHint: 'enterprise', match: { minHeadcount: 1001, notTypes: ['educational'] } },
  engineering_product_cos: { label: 'Engineering / Product Development Companies', kind: 'company', queryHint: 'engineering product development', match: { industries: ['engineering', 'software', 'design', 'it services', 'technology', 'manufacturing'], notTypes: ['educational'] } },
  engineering_services: { label: 'Engineering Service / Development Companies', kind: 'company', queryHint: 'engineering services development', match: { industries: ['services', 'consulting', 'engineering', 'outsourcing', 'design'], notTypes: ['educational'] } },
  engineering_teams: { label: 'Engineering Development Teams', kind: 'company', queryHint: 'engineering development', match: { industries: ['engineering', 'software', 'technology', 'it services'], notTypes: ['educational'] } },
  engineering_product_teams: { label: 'Engineering / Product Teams', kind: 'company', queryHint: 'engineering product', match: { industries: ['software', 'technology', 'engineering', 'internet'], notTypes: ['educational'] } },
  consulting_orgs: { label: 'Technical Consulting Organizations', kind: 'company', queryHint: 'technical consulting', match: { industries: ['consulting', 'services', 'advisory'], notTypes: ['educational'] } },
  independent_orgs: { label: 'Independent Technical Organizations', kind: 'company', queryHint: 'non-profit foundation consortium', match: { companyTypes: ['nonprofit', 'non profit', 'partnership', 'self-employed'], industries: ['non-profit', 'research', 'think tanks'] } },
  independent_research_orgs: { label: 'Independent Research Organizations', kind: 'academic', queryHint: 'independent research organization', match: { companyTypes: ['nonprofit', 'non profit'], industries: ['research', 'non-profit', 'think tanks'], notTypes: ['privately held', 'public company'] } },
};

/* ------------------------------------------------------------------ */
/* Organization size buckets (headcount)                               */
/* ------------------------------------------------------------------ */
export const ORG_SIZES = [
  { id: '1-10', label: '1–10 employees', min: 1, max: 10 },
  { id: '11-50', label: '11–50', min: 11, max: 50 },
  { id: '51-200', label: '51–200', min: 51, max: 200 },
  { id: '201-1000', label: '201–1,000', min: 201, max: 1000 },
  { id: '1001+', label: 'More than 1,000', min: 1001, max: null },
  { id: 'any', label: 'Any size', min: null, max: null },
];

/* ------------------------------------------------------------------ */
/* Geography                                                           */
/* ------------------------------------------------------------------ */
export const GEO_SCOPES = {
  my_institute: { label: 'My institution or organization', scope: 'institute' },
  my_city: { label: 'My city', scope: 'city' },
  my_country: { label: 'My country', scope: 'country' },
  another_country: { label: 'Another country', scope: 'countries', single: true },
  specific: { label: 'Specific countries or regions', scope: 'countries' },
  hubs: { label: 'Research hubs', scope: 'hubs' },
  worldwide: { label: 'Worldwide', scope: 'worldwide' },
  // Legacy ids (older saved searches / drafts); mapped to my_city / my_country.
  same_city: { label: 'My city', scope: 'city', legacyFor: 'my_city' },
  same_country: { label: 'My country', scope: 'country', legacyFor: 'my_country' },
};

/** The geography options every persona offers, in display order. */
export const GEO_OPTIONS = ['my_institute', 'my_city', 'my_country', 'another_country', 'specific', 'hubs', 'worldwide'];

/** Map a legacy geography option id to its current id. */
export const canonicalGeoOption = (id) => GEO_SCOPES[id]?.legacyFor || id;

export const REGIONS = {
  'North America': ['United States', 'Canada', 'Mexico'],
  'Europe': ['United Kingdom', 'Germany', 'France', 'Netherlands', 'Switzerland', 'Sweden', 'Denmark', 'Norway', 'Finland', 'Ireland', 'Spain', 'Italy', 'Portugal', 'Belgium', 'Austria', 'Poland', 'Czechia', 'Estonia', 'Greece'],
  'European Union': ['Germany', 'France', 'Netherlands', 'Sweden', 'Denmark', 'Finland', 'Ireland', 'Spain', 'Italy', 'Portugal', 'Belgium', 'Austria', 'Poland', 'Czechia', 'Estonia', 'Greece'],
  'South Asia': ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal'],
  'East Asia': ['China', 'Japan', 'South Korea', 'Taiwan', 'Hong Kong'],
  'Southeast Asia': ['Singapore', 'Malaysia', 'Indonesia', 'Vietnam', 'Thailand', 'Philippines'],
  'Middle East': ['Israel', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Turkey'],
  'Oceania': ['Australia', 'New Zealand'],
  'Latin America': ['Brazil', 'Argentina', 'Chile', 'Colombia', 'Mexico', 'Peru'],
  'Africa': ['South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Ghana', 'Rwanda'],
};

export const COUNTRIES = [...new Set([
  ...Object.values(REGIONS).flat(),
  'Iceland', 'Luxembourg', 'Hungary', 'Romania', 'Ukraine', 'Lithuania', 'Latvia', 'Slovenia', 'Croatia', 'Serbia', 'Bulgaria', 'Morocco', 'Tunisia', 'Ethiopia', 'Uruguay', 'Costa Rica',
])].sort();

// Hubs resolve to a city (matched against verified profile/HQ locations) and its country.
export const RESEARCH_HUBS = [
  { id: 'bay_area', label: 'San Francisco Bay Area', country: 'United States', cities: ['San Francisco', 'Palo Alto', 'Mountain View', 'Berkeley', 'Stanford', 'San Jose', 'Menlo Park', 'Sunnyvale', 'Oakland', 'Bay Area'] },
  { id: 'boston', label: 'Boston / Cambridge, MA', country: 'United States', cities: ['Boston', 'Cambridge, Massachusetts', 'Cambridge, MA', 'Somerville'] },
  { id: 'nyc', label: 'New York City', country: 'United States', cities: ['New York', 'Brooklyn', 'Manhattan'] },
  { id: 'seattle', label: 'Seattle', country: 'United States', cities: ['Seattle', 'Redmond', 'Bellevue'] },
  { id: 'pittsburgh', label: 'Pittsburgh', country: 'United States', cities: ['Pittsburgh'] },
  { id: 'toronto', label: 'Toronto', country: 'Canada', cities: ['Toronto', 'Waterloo'] },
  { id: 'montreal', label: 'Montréal', country: 'Canada', cities: ['Montreal', 'Montréal'] },
  { id: 'london', label: 'London', country: 'United Kingdom', cities: ['London'] },
  { id: 'oxbridge', label: 'Oxford / Cambridge, UK', country: 'United Kingdom', cities: ['Oxford', 'Cambridge, United Kingdom', 'Cambridge, England'] },
  { id: 'zurich', label: 'Zürich / Lausanne', country: 'Switzerland', cities: ['Zurich', 'Zürich', 'Lausanne'] },
  { id: 'paris', label: 'Paris', country: 'France', cities: ['Paris', 'Saclay'] },
  { id: 'munich', label: 'Munich', country: 'Germany', cities: ['Munich', 'München'] },
  { id: 'berlin', label: 'Berlin', country: 'Germany', cities: ['Berlin'] },
  { id: 'amsterdam', label: 'Amsterdam / Delft / Eindhoven', country: 'Netherlands', cities: ['Amsterdam', 'Delft', 'Eindhoven'] },
  { id: 'telaviv', label: 'Tel Aviv / Haifa', country: 'Israel', cities: ['Tel Aviv', 'Haifa', 'Herzliya'] },
  { id: 'bengaluru', label: 'Bengaluru', country: 'India', cities: ['Bengaluru', 'Bangalore'] },
  { id: 'hyderabad', label: 'Hyderabad', country: 'India', cities: ['Hyderabad'] },
  { id: 'delhi', label: 'Delhi NCR', country: 'India', cities: ['New Delhi', 'Delhi', 'Gurugram', 'Gurgaon', 'Noida'] },
  { id: 'singapore', label: 'Singapore', country: 'Singapore', cities: ['Singapore'] },
  { id: 'beijing', label: 'Beijing', country: 'China', cities: ['Beijing'] },
  { id: 'shanghai', label: 'Shanghai / Shenzhen', country: 'China', cities: ['Shanghai', 'Shenzhen'] },
  { id: 'tokyo', label: 'Tokyo', country: 'Japan', cities: ['Tokyo'] },
  { id: 'seoul', label: 'Seoul', country: 'South Korea', cities: ['Seoul'] },
];


/* ------------------------------------------------------------------ */
/* Personas                                                            */
/* ------------------------------------------------------------------ */
const opt = (id, label) => ({ id, label: label || INDIVIDUAL_TYPES[id]?.label || ORG_TYPES[id]?.label || id });

export const PERSONAS = {
  student: {
    id: 'student',
    card: { title: 'Student', description: 'Discover mentors, project partners, researchers, and organizations working on your interests.' },
    heading: 'Find the most relevant person or organization for your problem.',
    supporting: "Whether you're working on a research project, building an engineering prototype, developing software, or exploring a technical idea, discover people and organizations with relevant expertise.",
    describe: {
      question: 'What are you working on, or what technical topic interests you?',
      placeholder: "I'm building an LLM inference system and want to optimize KV-cache memory usage during long-context generation. I'm looking for people with experience in efficient attention and GPU inference.",
    },
    individuals: ['professors', 'phd_postdoc', 'fellow_students', 'research_scientists', 'pro_engineers', 'pro_researchers', 'independent', 'founders_leaders'].map((id) => opt(id)),
    organizations: ['universities', 'academic_labs', 'industrial_labs', 'startups', 'tech_companies', 'corporate_rd', 'engineering_product_cos', 'independent_orgs'].map((id) => opt(id)),
    geography: GEO_OPTIONS,
    resultsFocus: 'Prioritizes direct relevance to your project, demonstrated expertise, and suitability for your chosen goal.',
  },
  professor: {
    id: 'professor',
    card: { title: 'Professor / Academic', description: 'Find researchers, students, industry experts, and organizations for research and technical collaboration.' },
    heading: 'Find the most relevant person or organization for your problem.',
    supporting: 'Find collaborators for new research, connect with industry experts, discover capable students, and identify institutions or companies working on complementary technologies.',
    describe: {
      question: 'What research question, engineering challenge, or technical project are you exploring?',
      placeholder: "I'm investigating the use of reinforcement learning to improve autonomous robotics systems and want collaborators who have experience with robot learning and real-world deployment.",
    },
    individuals: [opt('professors'), opt('postdocs'), opt('phd_students'), opt('students'), opt('industry_research_scientists'), opt('research_engineers'), opt('specialized_engineers'), opt('independent_researchers')],
    organizations: [opt('universities', 'Universities'), opt('academic_institutes'), opt('specialized_labs'), opt('corporate_rd_labs'), opt('tech_companies'), opt('deeptech_startups'), opt('engineering_teams'), opt('independent_research_orgs')],
    preferences: {
      title: 'Additional preferences',
      groups: [
        { id: 'work_mode', label: 'Type of work', type: 'single', options: ['Academic research', 'Applied R&D', 'Engineering implementation', 'Both research and engineering'] },
        { id: 'career_stage', label: 'Seniority or career stage', type: 'multi', options: ['Early-career', 'Mid-career', 'Senior / established', 'Any stage'] },
        { id: 'specialization', label: 'Specific technical specialization', type: 'text', placeholder: 'e.g. sim-to-real transfer, tactile sensing' },
        { id: 'target_org_type', label: 'Target institute or organization type', type: 'text', placeholder: 'e.g. robotics institutes, autonomous-vehicle companies' },
      ],
    },
    geography: GEO_OPTIONS,
    resultsFocus: 'Ranks by demonstrated research or engineering contribution, technical overlap, and suitability for the people and organizations you chose — not by publication count alone.',
  },
  company: {
    id: 'company',
    card: { title: 'Startup / Company / Lab / R&D Team', description: 'Discover technical experts, engineers, researchers, and organizations to help build, improve, or research technologies.' },
    heading: 'Find the most relevant person or organization for your problem.',
    supporting: 'Discover engineers, domain experts, researchers, laboratories, and organizations that can help your team develop technologies, solve technical challenges, conduct R&D, or build partnerships.',
    orgProfile: true,
    describe: {
      question: 'What are you building, researching, or trying to solve?',
      placeholder: 'We are developing an edge AI accelerator and need specialists with experience in RTL optimization, timing closure, memory architecture, and FPGA/ASIC implementation.',
    },
    individuals: [opt('software_engineers'), opt('hardware_engineers'), opt('ml_engineers'), opt('domain_specialists'), opt('research_scientists'), opt('academic_experts'), opt('consultants_freelancers'), opt('phd_postdoc'), opt('founders_experts')],
    customDiscipline: true,
    organizations: [opt('startups'), opt('small_companies'), opt('mid_companies'), opt('large_enterprises'), opt('engineering_services'), opt('specialized_labs', 'Specialized R&D Laboratories'), opt('universities', 'Universities / Research Institutes'), opt('corporate_research_teams'), opt('consulting_orgs')],
    sizeStep: true,
    geography: GEO_OPTIONS,
    resultsFocus: 'Individuals: relevant skills, demonstrable implementation or research accomplishments, and role suitability. Organizations: technical overlap, demonstrated delivery or research capability, and appropriate scale. Results are not assumed to be hiring or consulting opportunities.',
  },
  independent: {
    id: 'independent',
    card: { title: 'Independent Researcher / Engineer / Freelancer', description: 'Connect with collaborators, technical specialists, mentors, and organizations working on related problems.' },
    heading: 'Find the most relevant person or organization for your problem.',
    supporting: "Whether you're conducting independent research, developing software or hardware, providing technical services, or building your own projects, find collaborators and organizations working in your specialization.",
    describe: {
      question: 'What are you currently working on, or what specialized expertise are you exploring?',
      placeholder: "I'm developing custom Triton kernels for faster transformer inference. I want to connect with people working on GPU optimization and companies building high-performance inference systems.",
    },
    individuals: [opt('fellow_independent'), opt('independent_engineers'), opt('professors', 'Professors'), opt('phd_postdoc'), opt('industry_research_scientists'), opt('senior_specialists'), opt('consultants'), opt('founders')],
    organizations: [opt('startups'), opt('tech_companies'), opt('engineering_product_teams'), opt('academic_labs', 'Academic Research Labs'), opt('corporate_rd_labs', 'Corporate R&D Labs'), opt('universities'), opt('engineering_services', 'Engineering Service Providers'), opt('independent_research_orgs')],
    preferences: {
      title: 'Additional preferences',
      groups: [
        { id: 'expertise_relation', label: 'What kind of match?', type: 'multi', options: ['Similar expertise', 'Complementary expertise', 'More experienced specialists', 'Similar career stage', 'Organizations with demonstrated related work'] },
      ],
    },
    geography: GEO_OPTIONS,
    resultsFocus: 'Ranks by relevant technical work, accomplishments, and fit with the people and organizations you chose — without assuming you are seeking employment or clients.',
  },
  other: {
    id: 'other',
    card: { title: 'Other', description: 'Describe your background and find the people or organizations best suited to your goals.' },
    heading: 'Find the most relevant person or organization for your problem.',
    supporting: 'Briefly describe yourself and what you are working on. We will use the same discovery and ranking engine to find people and organizations with relevant demonstrated expertise.',
    background: true,
    describe: {
      question: 'What research or engineering topic do you want to explore or build?',
      placeholder: 'I run a climate-tech nonprofit and want to find engineers who have built low-cost soil-moisture sensor networks with LoRaWAN, and labs studying sensor calibration drift.',
    },
    individuals: [...new Set(Object.keys(INDIVIDUAL_TYPES))].map((id) => opt(id)),
    organizations: [...new Set(Object.keys(ORG_TYPES))].map((id) => opt(id)),
    customDiscipline: true,
    geography: GEO_OPTIONS,
    resultsFocus: 'Ranks by direct technical relevance and demonstrated expertise for your project.',
  },
};

export const PERSONA_ORDER = ['student', 'professor', 'company', 'independent', 'other'];

/* ------------------------------------------------------------------ */
/* Ranking rubrics (weights are percentages; criterion scores are 0–5) */
/* ------------------------------------------------------------------ */
export const RUBRICS = {
  individual: [
    { key: 'topic_similarity', label: 'Topic / Problem Similarity', weight: 40 },
    { key: 'accomplishments', label: 'Demonstrated Technical Accomplishments', weight: 25 },
    { key: 'skills_overlap', label: 'Methodology / Skills Overlap', weight: 15 },
    { key: 'role_suitability', label: 'Collaboration / Role Suitability', weight: 15 },
    { key: 'proximity', label: 'Geographic Proximity', weight: 5 },
  ],
  organization: [
    { key: 'topic_relevance', label: 'Topic / Technical Relevance', weight: 45 },
    { key: 'accomplishments', label: 'Demonstrated Accomplishments', weight: 25 },
    { key: 'capacity_fit', label: 'Organization Size / Capacity Fit', weight: 15 },
    { key: 'partnership_suitability', label: 'Partnership / Collaboration Suitability', weight: 10 },
    { key: 'proximity', label: 'Geographic Proximity', weight: 5 },
  ],
};

export const PAGE_SIZE = 50;

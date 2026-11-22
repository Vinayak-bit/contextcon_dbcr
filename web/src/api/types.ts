// ============================================================================
// API CONTRACT — shared by the frontend (L1, L2) and the backend (L3, L4).
// Owned by Laptop 4. Do not edit from another laptop: request changes in
// docs/CHANGE_REQUESTS.md. Endpoint list: docs/API.md.
// ============================================================================

export type PersonaId = 'student' | 'professor' | 'company' | 'independent' | 'other';
export type TabKey = 'individuals' | 'organizations';
export type Target = 'individuals' | 'organizations' | 'both';
export type Transport = 'mcp' | 'rest' | 'sample';

// ---------------------------------------------------------------- status ----
export interface AppStatus {
  crustdata: {
    mode: 'mcp' | 'rest' | 'sample';
    transport: Transport;
    endpoint?: string;
    auth: 'api_key' | 'oauth' | 'none' | 'missing_key';
    /** MCP only. */
    state?: 'disconnected' | 'connecting' | 'needs_auth' | 'connected' | 'error';
    connected: boolean;
    /** Present when state === 'needs_auth': open it in a new tab to sign in to Crustdata. */
    authUrl?: string;
    error?: string | null;
    tools?: Record<string, string>;
    sampleAvailable: boolean;
  };
  llm: { provider: 'deepseek'; enabled: boolean; model: string; fastModel: string };
  jev: { enabled: boolean; model: string };
  ranker: RankerEngine;
}
export type RankerEngine = 'hybrid' | 'llm' | 'jev' | 'heuristic';

// ------------------------------------------------------------ user / auth ---
export interface Me {
  id: string;
  name: string;
  email: string;
  consent: boolean;
  category: PersonaId | null;
  discovery: { attempts: number; maxAttempts: 3; status: 'pending' | 'confirmed' | 'skipped' | 'exhausted' };
  profile: UserProfile | null;
  organization: OrgProfile | null;
}

export interface Location { city: string; state?: string; country: string; raw?: string }

/** The user's own professional profile, stored only with consent. Used for personalization, not auth. */
export interface UserProfile {
  source: 'crustdata' | 'links' | 'manual';
  name: string;
  current_role: string;
  institution: string;
  career_stage: string;
  location: Location;
  experience: string[];
  skills: string[];
  projects: string[];
  publications: string[];
  links: SourceLink[];
  crustdata_person_id?: number;
  confirmedAt: string;
  sample?: boolean;
}

/** A candidate match shown during profile discovery ("Is this your professional profile?"). */
export interface ProfileMatch {
  match_id: string;
  name: string;
  headline: string;
  current_title: string;
  organization: string;
  location: string;
  profile_url?: string;
  confidence?: number;
  source: 'email_identify' | 'name_search' | 'linkedin_identify' | 'scholar_identify' | 'github_search' | 'x_search';
  sample?: boolean;
}

export interface DiscoverResponse {
  attempt: number;
  attemptsLeft: number;
  matches: ProfileMatch[];
  /** Human-readable note, e.g. "No profile matched this email". */
  note?: string;
}

export interface LinksRequest { linkedin?: string; github?: string; scholar?: string; x?: string; website?: string; sample?: boolean }
export interface LinksResponse { matches: ProfileMatch[]; context: { label: string; url: string; fetched: boolean; summary?: string }[] }

export interface OrgProfile {
  name: string;
  type: string;
  website: string;
  domain?: string;
  primary_domain: string;
  team_size: string;
  location: Location;
  description?: string;
  crustdata_company_id?: number;
  /** true when matched to a Crustdata company record. Organizations without a record are allowed. */
  matched: boolean;
  sample?: boolean;
}

// ------------------------------------------------------- topic validation ---
export interface ProjectSpec {
  domain: 'Research' | 'Engineering' | 'Research and Engineering';
  problem_statement: string;
  core_topics: string[];
  specific_methods: string[];
  related_topics: string[];
  required_expertise: string[];
  search_queries: string[];
  academic_queries: string[];
  org_queries: string[];
}

export interface TopicSuggestion { topic: string; rationale: string; based_on: 'profile' | 'description' }

export interface TopicValidation {
  is_specific: boolean;
  reason: string;
  suggestions: TopicSuggestion[];
  spec: ProjectSpec;
  engine: 'llm' | 'heuristic';
  warning?: string;
}

export interface TopicValidateRequest {
  description: string;
  links: string[];
  category: PersonaId;
  background?: string;
}

// ---------------------------------------------------------------- search ----
/** Option ids from shared/catalog.js GEO_SCOPES. */
export type GeoOptionId = 'my_institute' | 'my_city' | 'same_city' | 'my_country' | 'same_country' | 'another_country' | 'specific' | 'hubs' | 'worldwide';

export interface GeographyPref {
  option: GeoOptionId;
  /** Required for my_institute when the profile has no institution. */
  institute?: string;
  /** Required for my_city/same_city when the profile has no city. */
  city?: string;
  /** Country for my_country/same_country (and to disambiguate city). */
  country?: string;
  /** another_country (exactly one) / specific (one or more). Full English names from shared/catalog.js COUNTRIES. */
  countries?: string[];
  /** Region names from shared/catalog.js REGIONS (specific). */
  regions?: string[];
  /** Hub ids from shared/catalog.js RESEARCH_HUBS (hubs). */
  hubs?: string[];
  /** User explicitly allows candidates whose location or role could not be verified. Default false. */
  allowUnverified: boolean;
  /** Give a small proximity bonus inside the selected area (5% criterion). Off → weight redistributed. */
  preferProximity: boolean;
}

export interface SearchRequest {
  category: PersonaId;
  description: string;
  links: string[];
  background?: string;
  /** The spec returned by /api/topic/validate (the user may have picked a suggestion first). */
  spec: ProjectSpec;
  /** Selected objective labels exactly as shown (from PERSONAS[x].objectives). */
  objectives: string[];
  objectiveOther?: string;
  target: Target;
  /** Ids from PERSONAS[x].individuals (empty when target === 'organizations'). */
  individualTypes: string[];
  /** Ids from PERSONAS[x].organizations (empty when target === 'individuals'). */
  orgTypes: string[];
  /** Free-text discipline (Company / Other personas), e.g. "RF engineer". Treated as an extra individual type. */
  customDiscipline?: string;
  /** Persona-specific preference groups (PERSONAS[x].preferences.groups), keyed by group id. */
  preferences: Record<string, string | string[]>;
  /** Ids from ORG_SIZES; [] or ['any'] = no size constraint. */
  sizes: string[];
  geography: GeographyPref;
  /** Force offline sample data even if Crustdata is connected. */
  sample?: boolean;
}

export interface StartSearchResponse { jobId: string }

export type StageKey = 'queued' | 'searching' | 'academic' | 'prefilter' | 'enriching' | 'verifying' | 'extracting' | 'ranking' | 'done' | 'error';

export interface ExcludedCounts {
  geography: number;
  unverified_location: number;
  role: number;
  unverified_role: number;
  org_type: number;
  size: number;
  duplicates: number;
}

export interface TabStatus {
  status: 'queued' | 'running' | 'done' | 'error';
  stage: StageKey;
  stageLabel: string;
  progress?: { done: number; total: number };
  pagesReady: number;
  hasMore: boolean;
  error?: string;
  log: { at: string; message: string }[];
  /** Totals across all pages built so far. */
  excludedTotals: ExcludedCounts;
}

export interface SearchSummary {
  topic: string;
  goal: string[];
  individualTypes: string[];
  orgTypes: string[];
  customDiscipline?: string;
  geography: string;
  sizes: string[];
  allowUnverified: boolean;
  preferProximity: boolean;
}

export interface SearchJob {
  id: string;
  createdAt: string;
  status: 'running' | 'done' | 'error';
  request: SearchRequest;
  summary: SearchSummary;
  sample: boolean;
  engines: { llm: 'deepseek' | 'heuristic'; ranker: RankerEngine; crustdata: Transport };
  tabs: Partial<Record<TabKey, TabStatus>>;
  credits: { crustdata: number; calls: number; cached: number };
  llmUsage: { calls: number; promptTokens: number; completionTokens: number };
  jevUsage: { calls: number };
  warnings: string[];
  error?: string;
}

export interface ResultsPage {
  tab: TabKey;
  /** 1-based. */
  page: number;
  pagesReady: number;
  hasMore: boolean;
  pageSize: 50;
  candidates: Candidate[];
  /** Exclusions while building THIS page. */
  excluded: ExcludedCounts;
  builtAt: string;
  /** Shown on pages ≥ 2: ranking is within the page, not global. */
  note?: string;
}

// ------------------------------------------------------------ candidates ----
export interface SourceLink { label: string; url: string }
export interface EvidenceItem { id: string; kind: string; text: string; url?: string }
/** A claim plus the evidence ids that support it. */
export interface GroundedItem { text: string; evidence: string[] }

export interface GeoCheck {
  status: 'verified' | 'unverified' | 'mismatch' | 'not_required';
  basis?: 'profile' | 'headquarters' | 'office' | 'institution' | 'parent_institution' | 'none';
  detail?: string;
}

export interface CriterionBreakdown {
  key: string;
  label: string;
  /** Effective weight in % after redistribution (sums to 100 across breakdown). */
  weight: number;
  /** 0–5 */
  score: number;
  source: 'llm' | 'jev' | 'hybrid' | 'heuristic' | 'rule';
  llm?: number | null;
  jev?: number | null;
  heuristic?: number;
  note?: string;
}

export interface Ranking {
  /** 0–100 */
  final_score: number;
  criterion_scores: Record<string, number>;
  breakdown: CriterionBreakdown[];
  proximity_included: boolean;
  strengths: string[];
  limitations: string[];
  why_relevant: string;
  confidence: 'high' | 'medium' | 'low';
  evidence_references: { criterion: string; evidence: string[] }[];
  /** Jev yes/no decision signal (not a calibrated probability of collaboration success). */
  jev_decision: { question: string; probability: number | null } | null;
  engine: RankerEngine;
}

export interface CandidateMeta {
  origin: string;
  retrievedAt: string;
  transport: Transport;
  sample: boolean;
  geo?: GeoCheck;
  /** Individual types (ids) this person was verified against. */
  roleMatch?: string[];
  /** Org type ids this organization was classified as. */
  orgTypeMatch?: string[];
  academicOnly?: boolean;
  extraction?: 'llm' | 'heuristic';
  enriched?: boolean;
  [k: string]: unknown;
}

interface CandidateBase {
  candidate_id: string;
  name: string;
  source_urls: SourceLink[];
  evidence: EvidenceItem[];
  ranking: Ranking;
  /** 1-based position within its page. */
  rank: number;
  meta: CandidateMeta;
}

export interface IndividualCandidate extends CandidateBase {
  candidate_type: 'individual';
  current_role: string;
  institution_or_company: string;
  career_stage: string;
  location: string;
  location_detail: Location;
  headline: string;
  orientation?: 'research' | 'engineering' | 'both' | 'unclear';
  specializations: string[];
  relevant_work: GroundedItem[];
  publications: { title: string; year?: number; citations?: number; evidence: string[] }[];
  engineering_projects: { title: string; description: string; language?: string; stars?: number; evidence: string[] }[];
  accomplishments: GroundedItem[];
  methods_and_skills: string[];
  collaboration_evidence: GroundedItem[];
}

export interface OrganizationCandidate extends CandidateBase {
  candidate_type: 'organization';
  organization_type: string;
  headquarters: string;
  hq_detail: Location;
  relevant_locations: { raw: string; city?: string; country?: string }[];
  employee_count: number | null;
  industries: string[];
  company_type: string;
  description: string;
  parent_institution?: string;
  specializations: string[];
  products_and_projects: GroundedItem[];
  research_and_engineering_work: GroundedItem[];
  accomplishments: GroundedItem[];
  relevant_teams: GroundedItem[];
  collaboration_evidence: GroundedItem[];
}

export type Candidate = IndividualCandidate | OrganizationCandidate;

// ---------------------------------------------------------------- errors ----
export interface ApiErrorBody { error: { message: string; code?: string; details?: unknown } }

import { PERSONAS, canonicalGeoOption } from '@shared/catalog.js';
import type { GeographyPref, GeoOptionId, PersonaId, SearchRequest, Target, TopicValidation } from '../../api/types';

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type GeographyDraft = Optional<GeographyPref, 'option'>;
export type Step = 'profile' | 'organization' | 'background' | 'describe' | 'topic' | 'target' | 'preferences' | 'sizes' | 'geography' | 'summary';
export type Persona = typeof PERSONAS[PersonaId];
export type CheckedTopic = Omit<TopicValidation, 'engine'>;

/** Longest project description (including pasted excerpts) the server accepts. */
export const DESCRIPTION_MAX = 12000;

export interface Draft {
  step: Step;
  completed: Step[];
  returnToSummary?: boolean;
  description: string;
  background: string;
  topic?: CheckedTopic;
  target: Target | null;
  individualTypes: string[];
  orgTypes: string[];
  customDiscipline: string;
  preferences: SearchRequest['preferences'];
  sizes: string[];
  geography: GeographyDraft;
  sample?: boolean;
  skipOrganization?: boolean;
}

const DRAFT_VERSION = 2;

export const includesPeople = (target: Target | null) => target !== null && target !== 'organizations';
export const includesOrgs = (target: Target | null) => target !== null && target !== 'individuals';
export const isCity = (option?: GeoOptionId) => option === 'my_city' || option === 'same_city';
export const isCountry = (option?: GeoOptionId) => option === 'my_country' || option === 'same_country';

/** Steps for a persona. "Your profile" comes first for everyone and is optional. */
export function getSteps(persona: Persona, target: Target | null) {
  const steps: { key: Step; label: string }[] = [{ key: 'profile', label: 'Your profile' }];
  if ('orgProfile' in persona) steps.push({ key: 'organization', label: 'Organization' });
  if ('background' in persona) steps.push({ key: 'background', label: 'Background' });
  steps.push(
    { key: 'describe', label: 'Describe' },
    { key: 'topic', label: 'Topic check' },
    { key: 'target', label: 'Who to find' },
  );
  if ('preferences' in persona) steps.push({ key: 'preferences', label: 'Preferences' });
  if (includesOrgs(target)) steps.push({ key: 'sizes', label: 'Organization size' });
  steps.push({ key: 'geography', label: 'Geography' }, { key: 'summary', label: 'Summary' });
  return steps;
}

function initialDraft(persona: Persona): Draft {
  return {
    step: getSteps(persona, null)[0].key, completed: [],
    description: '', background: '',
    target: null, individualTypes: [], orgTypes: [], customDiscipline: '', preferences: {}, sizes: [],
    geography: { allowUnverified: false, preferProximity: false },
  };
}

/** Old field names / steps from earlier versions, mapped onto the current draft. */
function migrate(persona: Persona, raw: Record<string, unknown>): Partial<Draft> {
  // Removed in version 2: the Objectives step and project links.
  const { objectives: _o, objectiveOther: _oo, links: _l, ...rest } = raw as Record<string, unknown> & Partial<Draft>;
  const draft = rest as Partial<Draft>;
  const valid = new Set(getSteps(persona, draft.target ?? null).map(({ key }) => key));
  const step = (draft.step as string) === 'objectives' ? 'target' : draft.step;
  return {
    ...draft,
    step: step && valid.has(step) ? step : undefined,
    completed: (draft.completed || []).filter((key) => valid.has(key)),
    geography: draft.geography ? { ...draft.geography, option: draft.geography.option && canonicalGeoOption(draft.geography.option) as GeoOptionId } : undefined,
  };
}

export function readDraft(userId: string, category: PersonaId, editRequest?: SearchRequest | null): Draft {
  const persona = PERSONAS[category];
  const initial = initialDraft(persona);
  if (editRequest) {
    // Reopening a search (including older ones with objectives, links or legacy geography ids).
    const { spec, ...request } = editRequest;
    const migrated = migrate(persona, request as unknown as Record<string, unknown>);
    return {
      ...initial,
      ...migrated,
      background: request.background ?? '',
      customDiscipline: request.customDiscipline ?? '',
      geography: migrated.geography ?? initial.geography,
      topic: { spec, is_specific: true, reason: '', suggestions: [] },
      completed: getSteps(persona, request.target).map(({ key }) => key),
      step: 'summary',
    };
  }
  try {
    const raw = localStorage.getItem(`ov:draft:${userId}`);
    const saved = raw && JSON.parse(raw);
    if (saved?.category === category && (saved?.version === 1 || saved?.version === DRAFT_VERSION) && saved.draft) {
      const migrated = migrate(persona, saved.draft);
      return { ...initial, ...migrated, step: migrated.step ?? initial.step, geography: migrated.geography ?? initial.geography };
    }
  } catch {
    // Setup is still usable if persistence is unavailable.
  }
  return initial;
}

export function saveDraft(userId: string, category: PersonaId, draft: Draft) {
  try {
    localStorage.setItem(`ov:draft:${userId}`, JSON.stringify({ version: DRAFT_VERSION, category, draft }));
  } catch {
    // Preserve the in-memory draft.
  }
}

export function clearDraft(userId: string) {
  try {
    localStorage.removeItem(`ov:draft:${userId}`);
  } catch {
    // The search already started.
  }
}

export function geographyError(geography: GeographyDraft): string {
  const { option, institute, city, country, countries, regions, hubs } = geography;
  if (!option) return 'Choose a geography option.';
  if (option === 'my_institute' && !institute?.trim()) return 'Enter your institution or organization.';
  if (isCity(option) && (!city?.trim() || !country?.trim())) return 'Enter a city and choose its country.';
  if (isCountry(option) && !country?.trim()) return 'Choose your country.';
  if (option === 'another_country' && countries?.length !== 1) return 'Choose one country.';
  if (option === 'specific' && !countries?.length && !regions?.length) return 'Choose at least one country or region.';
  if (option === 'hubs' && !hubs?.length) return 'Choose at least one research hub.';
  return '';
}

export function stepError(step: Step, draft: Draft, persona: Persona): string {
  switch (step) {
    case 'topic':
      return draft.topic?.is_specific ? '' : 'Refine your topic before continuing.';
    case 'target':
      if (!draft.target) return 'Choose Individuals, Organizations, or Both.';
      if (includesPeople(draft.target) && !draft.individualTypes.length && !('customDiscipline' in persona && draft.customDiscipline.trim())) {
        return 'Select at least one type of person to find.';
      }
      if (includesOrgs(draft.target) && !draft.orgTypes.length) return 'Select at least one type of organization to find.';
      return '';
    case 'geography':
      return geographyError(draft.geography);
    default:
      return '';
  }
}

export function searchRequest(category: PersonaId, draft: Draft): SearchRequest | null {
  const { geography, target, topic } = draft;
  const option = geography.option && canonicalGeoOption(geography.option) as GeoOptionId;
  if (!topic?.is_specific || !target || !option) return null;
  return {
    category, target,
    description: draft.description.trim(),
    background: draft.background.trim() || undefined,
    spec: topic.spec,
    individualTypes: includesPeople(target) ? draft.individualTypes : [],
    orgTypes: includesOrgs(target) ? draft.orgTypes : [],
    customDiscipline: includesPeople(target) && 'customDiscipline' in PERSONAS[category] ? draft.customDiscipline.trim() || undefined : undefined,
    preferences: draft.preferences,
    sizes: includesOrgs(target) ? draft.sizes : [],
    geography: {
      option,
      institute: option === 'my_institute' ? geography.institute?.trim() : undefined,
      city: isCity(option) ? geography.city?.trim() : undefined,
      country: isCity(option) || isCountry(option) ? geography.country : undefined,
      countries: option === 'specific' || option === 'another_country' ? geography.countries : undefined,
      regions: option === 'specific' ? geography.regions : undefined,
      hubs: option === 'hubs' ? geography.hubs : undefined,
      allowUnverified: geography.allowUnverified,
      preferProximity: geography.preferProximity,
    },
    sample: draft.sample || undefined,
  };
}

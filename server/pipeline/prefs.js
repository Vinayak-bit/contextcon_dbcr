// SearchRequest → validated, resolved preferences (owned by Laptop 4).
// User-selected constraints are kept separate from AI-generated expansions (spec §13):
// `prefs` holds only what the user explicitly chose; `spec` holds the LLM's interpretation.
import { INDIVIDUAL_TYPES, ORG_TYPES, ORG_SIZES, PERSONAS } from '../../shared/catalog.js';
import { HttpError } from '../util.js';
import { resolveGeography } from './geography.js';

const bad = (message) => new HttpError(400, message, { code: 'validation' });

export function resolvePrefs(req, userProfile, organization) {
  const persona = PERSONAS[req?.category];
  if (!persona) throw bad('Choose a user category first.');
  if (!String(req.description || '').trim()) throw bad('Describe your project or topic.');
  if (!req.spec?.problem_statement) throw bad('Validate the topic before searching.');
  if (!['individuals', 'organizations', 'both'].includes(req.target)) throw bad('Choose Individuals, Organizations, or Both.');
  if (!Array.isArray(req.objectives) || !req.objectives.length) throw bad('Select at least one goal.');

  const wantPeople = req.target !== 'organizations';
  const wantOrgs = req.target !== 'individuals';
  const allowedPeople = new Set(persona.individuals.map((o) => o.id));
  const allowedOrgs = new Set(persona.organizations.map((o) => o.id));
  const labelOf = (list, id) => list.find((o) => o.id === id)?.label;

  const individualIds = wantPeople ? (req.individualTypes || []).filter((id) => allowedPeople.has(id)) : [];
  const customDiscipline = wantPeople && persona.customDiscipline ? String(req.customDiscipline || '').trim() : '';
  if (wantPeople && !individualIds.length && !customDiscipline) throw bad('Select at least one type of person to find.');
  const orgIds = wantOrgs ? (req.orgTypes || []).filter((id) => allowedOrgs.has(id)) : [];
  if (wantOrgs && !orgIds.length) throw bad('Select at least one type of organization to find.');

  const sizeIds = wantOrgs ? (req.sizes || []).filter((id) => id !== 'any' && ORG_SIZES.some((s) => s.id === id)) : [];
  if (!persona.geography.includes(req.geography?.option)) throw bad('Choose one of the geography options shown.');
  const geography = resolveGeography(req.geography, userProfile, organization);

  return {
    target: req.target,
    individualTypes: individualIds.map((id) => ({ id, ...INDIVIDUAL_TYPES[id], label: labelOf(persona.individuals, id) })),
    orgTypes: orgIds.map((id) => ({ id, ...ORG_TYPES[id], label: labelOf(persona.organizations, id) })),
    customDiscipline,
    sizes: sizeIds.map((id) => ORG_SIZES.find((s) => s.id === id)),
    geography,
    objectives: [...req.objectives.filter((o) => o !== 'Other'), ...(req.objectives.includes('Other') && req.objectiveOther ? [`Other: ${req.objectiveOther}`] : [])],
    preferences: req.preferences || {},
    individualTypeLabels: [...individualIds.map((id) => labelOf(persona.individuals, id)), ...(customDiscipline ? [customDiscipline] : [])],
    orgTypeLabels: orgIds.map((id) => labelOf(persona.organizations, id)),
  };
}

/** → SearchSummary (exact user selections, shown above results). */
export function summarize(req, prefs) {
  return {
    topic: req.spec.problem_statement,
    goal: prefs.objectives,
    individualTypes: prefs.individualTypeLabels.filter((l) => l !== prefs.customDiscipline),
    orgTypes: prefs.orgTypeLabels,
    customDiscipline: prefs.customDiscipline || undefined,
    geography: prefs.geography.label,
    sizes: prefs.sizes.length ? prefs.sizes.map((s) => s.label) : prefs.target === 'individuals' ? [] : ['Any size'],
    allowUnverified: prefs.geography.allowUnverified,
    preferProximity: prefs.geography.preferProximity,
  };
}

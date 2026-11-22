// Display helpers for the results screen: labels for catalog ids, stages, geography,
// engines and exclusion reasons. Pure functions, no React.
import { INDIVIDUAL_TYPES, ORG_TYPES, RUBRICS } from '@shared/catalog.js';
import type { CandidateMeta, CriterionBreakdown, ExcludedCounts, GeoCheck, RankerEngine, StageKey, TabKey, Transport } from '../../api/types';

export const TAB_LABELS: Record<TabKey, string> = { individuals: 'Individuals', organizations: 'Organizations' };

/** Pipeline stages shown in the per-tab stepper (organizations skip the academic step). */
export function stagesFor(tab: TabKey): { key: StageKey; label: string }[] {
  const all: { key: StageKey; label: string }[] = [
    { key: 'searching', label: 'Searching' },
    { key: 'academic', label: 'Academic sources' },
    { key: 'prefilter', label: 'Pre-filtering' },
    { key: 'enriching', label: 'Enriching' },
    { key: 'verifying', label: 'Verifying constraints' },
    { key: 'extracting', label: 'Extracting evidence' },
    { key: 'ranking', label: 'Ranking' },
    { key: 'done', label: 'Done' },
  ];
  return tab === 'organizations' ? all.filter((s) => s.key !== 'academic') : all;
}

/** Stages before `current` in the stepper order (shown with a check mark). */
export function completedStages(tab: TabKey, current: StageKey): StageKey[] {
  const keys = stagesFor(tab).map((s) => s.key);
  if (current === 'done') return keys;
  const i = keys.indexOf(current);
  return i <= 0 ? [] : keys.slice(0, i);
}

const individualTypes = INDIVIDUAL_TYPES as Record<string, { label: string }>;
const orgTypes = ORG_TYPES as Record<string, { label: string }>;

/** Label for an individual-type id, falling back to the id itself. */
export const individualTypeLabel = (id: string) => individualTypes[id]?.label ?? id;
/** Label for an organization-type id, falling back to the id itself. */
export const orgTypeLabel = (id: string) => orgTypes[id]?.label ?? id;

/** Rubric criterion label for a key, used where only the key is known (evidence references). */
export function criterionLabel(key: string, kind: 'individual' | 'organization', breakdown?: CriterionBreakdown[]): string {
  const fromBreakdown = breakdown?.find((b) => b.key === key)?.label;
  if (fromBreakdown) return fromBreakdown;
  const rubric = (RUBRICS as Record<string, { key: string; label: string }[]>)[kind === 'individual' ? 'individual' : 'organization'] ?? [];
  return rubric.find((r) => r.key === key)?.label ?? key.replace(/_/g, ' ');
}

const GEO_BASIS: Record<NonNullable<GeoCheck['basis']>, { individual: string; organization: string }> = {
  profile: { individual: 'profile', organization: 'profile' },
  headquarters: { individual: 'headquarters', organization: 'HQ' },
  office: { individual: 'office', organization: 'team/office' },
  institution: { individual: 'institution', organization: 'institution' },
  parent_institution: { individual: 'parent institution', organization: 'parent institution' },
  none: { individual: '', organization: '' },
};

/** Geography verification label, or null when nothing should be shown. */
export function geoLabel(geo: GeoCheck | undefined, kind: 'individual' | 'organization'): { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; title?: string } | null {
  if (!geo) return null;
  if (geo.status === 'verified') {
    const basis = geo.basis ? GEO_BASIS[geo.basis]?.[kind] : '';
    return { text: basis ? `Location verified · ${basis}` : 'Location verified', tone: 'success', title: geo.detail };
  }
  if (geo.status === 'unverified') return { text: 'Location unverified', tone: 'warning', title: geo.detail || 'Included because you allowed unverified candidates' };
  if (geo.status === 'mismatch') return { text: 'Outside selected geography', tone: 'danger', title: geo.detail };
  return { text: 'Worldwide', tone: 'neutral' };
}

/** Jev is the default ranking engine; DeepSeek ranks only as a fallback (docs/RANKING.md). */
export const RANKER_LABELS: Record<RankerEngine, string> = {
  jev: 'Jev',
  llm: 'DeepSeek judge',
  hybrid: 'Hybrid — Jev + DeepSeek judge',
  heuristic: 'Heuristic (no AI keys)',
};

export const TRANSPORT_LABELS: Record<Transport, string> = { mcp: 'MCP', rest: 'REST', sample: 'Sample data' };

export const SOURCE_LABELS: Record<CriterionBreakdown['source'], string> = {
  llm: 'LLM', jev: 'Jev', hybrid: 'Hybrid', heuristic: 'Heuristic', rule: 'Rule',
};

const EXCLUSION_LABELS: Record<keyof ExcludedCounts, string> = {
  geography: 'outside selected geography',
  unverified_location: 'location unverified',
  role: 'role not matching',
  unverified_role: 'role unverified',
  org_type: 'organization type not matching',
  size: 'size not matching',
  duplicates: 'duplicates',
};

/** Non-zero exclusion counts as "7 outside selected geography" phrases. */
export function exclusionPhrases(c: ExcludedCounts | undefined): string[] {
  if (!c) return [];
  return (Object.keys(EXCLUSION_LABELS) as (keyof ExcludedCounts)[])
    .filter((k) => (c[k] ?? 0) > 0)
    .map((k) => `${c[k]} ${EXCLUSION_LABELS[k]}`);
}

/** Total excluded for reasons the user could relax by allowing unverified candidates. */
export const unverifiedCount = (c: ExcludedCounts | undefined) => (c ? (c.unverified_location ?? 0) + (c.unverified_role ?? 0) : 0);

/** Local date-time string, or the raw value when it can't be parsed. */
export function formatTime(iso: string | undefined): string {
  if (!iso) return 'Not available';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const ORIENTATION_LABELS: Record<string, string> = {
  research: 'Research', engineering: 'Engineering', both: 'Research + engineering', unclear: 'Orientation unclear',
};

/** Provenance summary from candidate meta. */
export function provenance(meta: CandidateMeta): { label: string; value: string }[] {
  return [
    { label: 'Retrieved', value: formatTime(meta.retrievedAt) },
    { label: 'Data source', value: meta.transport ? TRANSPORT_LABELS[meta.transport] ?? meta.transport : 'Not available' },
    { label: 'Evidence extraction', value: meta.extraction === 'llm' ? 'LLM (DeepSeek)' : meta.extraction === 'heuristic' ? 'Heuristic' : 'Not available' },
    { label: 'Found via', value: meta.origin ? meta.origin.replace(/_/g, ' ') : 'Not available' },
  ];
}

/** "Not available" for empty strings, so missing fields are never left blank. */
export const orNA = (v: string | null | undefined) => (v && v.trim() ? v : 'Not available');

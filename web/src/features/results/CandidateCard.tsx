// Result cards for individuals and organizations. Score at a glance on the right,
// claims with evidence links on the left, full detail in the ranking drawer.
import { memo, useMemo } from 'react';
import type { Candidate, GroundedItem, IndividualCandidate, OrganizationCandidate } from '../../api/types';
import { Badge, Button, Card, Chip, ScoreBar, ScoreRing } from '../../ui';
import { evidenceMap, GroundedLine, type EvidenceMap } from './Evidence';
import { formatTime, geoLabel, orNA, ORIENTATION_LABELS, scoredBy } from './labels';
import { WorkEmail } from './WorkEmail';

const MAX_CHIPS = 6;

/** One ranked result. `onDetails` opens the ranking drawer. */
export const CandidateCard = memo(function CandidateCard({ jobId, candidate, onDetails }: { jobId: string; candidate: Candidate; onDetails(c: Candidate): void }) {
  const ev = useMemo(() => evidenceMap(candidate.evidence), [candidate.evidence]);
  const geo = geoLabel(candidate.meta.geo, candidate.candidate_type);
  const r = candidate.ranking;
  const scorer = scoredBy(r);
  return (
    <Card className="rs-card" padded={false}>
      <article aria-labelledby={`c-${candidate.candidate_id}`}>
        <div className="rs-card__main">
          <header className="rs-card__head">
            <span className="rs-rank" aria-label={`Rank ${candidate.rank} on this page`}>{candidate.rank}</span>
            <div className="rs-card__title">
              <h3 id={`c-${candidate.candidate_id}`} className="rs-name" title={candidate.name}>{candidate.name || 'Name not available'}</h3>
              {candidate.candidate_type === 'individual' ? <IndividualSub c={candidate} /> : <OrgSub c={candidate} />}
            </div>
          </header>

          <div className="rs-badges">
            {candidate.meta.sample && <Badge tone="sample">Sample data</Badge>}
            {geo && <Badge tone={geo.tone} title={geo.title}>{geo.text}</Badge>}
            {candidate.candidate_type === 'individual' && candidate.orientation && <Badge tone="info">{ORIENTATION_LABELS[candidate.orientation] ?? candidate.orientation}</Badge>}
            {candidate.candidate_type === 'individual' && candidate.meta.academicOnly && <Badge tone="warning" title="Found only through academic sources; no professional profile was matched">Academic-only identity</Badge>}
            <Badge tone={scorer.tone} title={scorer.title}>{scorer.text}</Badge>
            <Badge tone="neutral" title="How sure the ranker is, given the available evidence">Confidence: {r.confidence}</Badge>
          </div>

          {r.why_relevant && <p className="rs-why"><strong>Why relevant: </strong>{r.why_relevant}</p>}

          {candidate.candidate_type === 'individual' ? <IndividualBody c={candidate} ev={ev} /> : <OrgBody c={candidate} ev={ev} />}
          {candidate.candidate_type === 'individual' && <div className="rs-contact"><WorkEmail jobId={jobId} candidate={candidate} /></div>}

          <footer className="rs-card__foot">
            <SourceLinks c={candidate} />
            <span className="spacer" />
            <time className="muted rs-small" dateTime={candidate.meta.retrievedAt} title="When this record and its evidence were retrieved">Retrieved {formatTime(candidate.meta.retrievedAt)}</time>
            <Button size="sm" variant="secondary" onClick={() => onDetails(candidate)}>View ranking details</Button>
          </footer>
        </div>

        <aside className="rs-card__scores" aria-label="Scores">
          <div className="rs-overall">
            <ScoreRing score={r.final_score} size={64} />
            <span className="muted">Overall</span>
          </div>
          <div className="rs-bars">
            {r.breakdown.map((b) => (
              // Source (LLM/Jev/…) is shown in the ranking drawer; the card keeps score + weight only.
              <ScoreBar key={b.key} label={b.label} value={b.score} weight={b.weight} />
            ))}
          </div>
        </aside>
      </article>
    </Card>
  );
});

const has = (v: string | null | undefined) => Boolean(v && v.trim() && v.trim().toLowerCase() !== 'unknown');

function IndividualSub({ c }: { c: IndividualCandidate }) {
  // Missing fields say "not available" once, instead of a row of placeholders (common for academic-only identities).
  const work = has(c.current_role) || has(c.institution_or_company)
    ? [orNA(c.current_role), orNA(c.institution_or_company)].join(' · ')
    : 'Role and affiliation not available';
  const place = [has(c.location) ? c.location : 'Location not available', has(c.career_stage) ? c.career_stage : ''].filter(Boolean).join(' · ');
  return (
    <p className="rs-sub">
      <span>{work}</span>
      <br />
      <span className="muted">{place}</span>
    </p>
  );
}

/** Drops items whose text is already shown in an earlier section of the same card (the drawer keeps all evidence). */
function notShownIn(items: GroundedItem[] | undefined, shown: GroundedItem[] | undefined, shownMax: number): GroundedItem[] {
  const seen = new Set((shown ?? []).slice(0, shownMax).map((s) => s.text.trim()));
  return (items ?? []).filter((it) => !seen.has(it.text.trim()));
}

function OrgSub({ c }: { c: OrganizationCandidate }) {
  const locs = c.relevant_locations.map((l) => l.raw).filter(Boolean);
  return (
    <p className="rs-sub">
      <span>{orNA(c.organization_type)}</span>
      <span aria-hidden> · </span>
      <span>{c.employee_count != null ? `${c.employee_count.toLocaleString()} employees` : 'Size unknown'}</span>
      <br />
      <span className="muted">HQ: {orNA(c.headquarters)}{locs.length > 0 && <> · Team/office: {locs.slice(0, 3).join('; ')}{locs.length > 3 ? ` +${locs.length - 3}` : ''}</>}</span>
      {c.parent_institution && <><br /><span className="muted">Part of {c.parent_institution}</span></>}
    </p>
  );
}

function Claims({ title, items, max, ev }: { title: string; items: GroundedItem[]; max: number; ev: EvidenceMap }) {
  if (!items?.length) return null;
  return (
    <section className="rs-claims">
      <h4>{title}{items.length > max && <span className="muted"> · {max} of {items.length}</span>}</h4>
      <ul>{items.slice(0, max).map((it, i) => <GroundedLine key={i} item={it} evidence={ev} />)}</ul>
    </section>
  );
}

function Specializations({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rs-chips" aria-label="Top specializations">
      {items.slice(0, MAX_CHIPS).map((s) => <Chip key={s} label={s} />)}
      {items.length > MAX_CHIPS && <span className="muted">+{items.length - MAX_CHIPS}</span>}
    </div>
  );
}

function IndividualBody({ c, ev }: { c: IndividualCandidate; ev: EvidenceMap }) {
  const empty = !c.relevant_work?.length && !c.accomplishments?.length;
  return (
    <>
      <Specializations items={c.specializations} />
      <Claims title="Relevant work" items={c.relevant_work} max={3} ev={ev} />
      <Claims title="Accomplishments" items={notShownIn(c.accomplishments, c.relevant_work, 3)} max={2} ev={ev} />
      {empty && <p className="muted rs-small">No relevant work or accomplishments were extracted from the available evidence.</p>}
      <p className="rs-counts muted">
        {c.publications?.length ?? 0} publication{c.publications?.length === 1 ? '' : 's'} · {c.engineering_projects?.length ?? 0} engineering project{c.engineering_projects?.length === 1 ? '' : 's'}
      </p>
    </>
  );
}

function OrgBody({ c, ev }: { c: OrganizationCandidate; ev: EvidenceMap }) {
  const work = [...(c.products_and_projects ?? []), ...(c.research_and_engineering_work ?? []), ...(c.relevant_teams ?? [])];
  return (
    <>
      <Specializations items={c.specializations} />
      <Claims title="Relevant work, products & research" items={work} max={3} ev={ev} />
      <Claims title="Accomplishments" items={notShownIn(c.accomplishments, work, 3)} max={2} ev={ev} />
      {!work.length && !c.accomplishments?.length && <p className="muted rs-small">No relevant work or accomplishments were extracted from the available evidence.</p>}
    </>
  );
}

function SourceLinks({ c }: { c: Candidate }) {
  if (!c.source_urls?.length) return <span className="muted rs-small">No verified profile links</span>;
  return (
    <span className="rs-links">
      {c.source_urls.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>)}
    </span>
  );
}

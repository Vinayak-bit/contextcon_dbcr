// Evidence citations: small "E3" links next to each claim. Hover shows the evidence text
// (title attribute); click expands it inline under the claim with a link to the source.
import { useState } from 'react';
import type { EvidenceItem, GroundedItem } from '../../api/types';

export type EvidenceMap = Map<string, EvidenceItem>;

/** Builds an id → evidence lookup for one candidate. */
export const evidenceMap = (items: EvidenceItem[] | undefined): EvidenceMap => new Map((items ?? []).map((e) => [e.id, e]));

/** One claim with its evidence ids; clicking an id reveals the quoted evidence below the claim. */
export function GroundedLine({ item, evidence }: { item: GroundedItem; evidence: EvidenceMap }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = open ? evidence.get(open) : undefined;
  return (
    <li className="rs-claim">
      <span className="rs-claim__text">{item.text}</span>
      <EvidenceIds ids={item.evidence} evidence={evidence} open={open} onToggle={(id) => setOpen((cur) => (cur === id ? null : id))} />
      {open && <EvidenceQuote id={open} item={shown} />}
    </li>
  );
}

/** Row of evidence-id buttons. */
export function EvidenceIds({ ids, evidence, open, onToggle }: { ids: string[]; evidence: EvidenceMap; open: string | null; onToggle(id: string): void }) {
  if (!ids?.length) return <span className="rs-ev-none" title="No evidence id was attached to this claim">no evidence id</span>;
  return (
    <span className="rs-ev-ids">
      {ids.map((id) => {
        const e = evidence.get(id);
        return (
          <button key={id} type="button" className={`rs-ev-id${open === id ? ' is-open' : ''}`} aria-expanded={open === id}
            title={e ? `${e.kind}: ${e.text}` : 'Evidence not included in this record'} onClick={() => onToggle(id)}>
            {id}
          </button>
        );
      })}
    </span>
  );
}

/** Quoted evidence text with its source link. */
export function EvidenceQuote({ id, item }: { id: string; item: EvidenceItem | undefined }) {
  return (
    <blockquote className="rs-ev-quote">
      {item ? (
        <>
          <span className="rs-ev-quote__kind">{id} · {item.kind.replace(/_/g, ' ')}</span>
          <span>{item.text}</span>
          {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">Open source ↗</a> : <span className="muted">No source link for this item</span>}
        </>
      ) : (
        <span className="muted">Evidence {id} isn't included in this record. Open ranking details for the full evidence list.</span>
      )}
    </blockquote>
  );
}

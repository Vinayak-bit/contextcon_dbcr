// v0 STUB — owned by Laptop 3. Brief: docs/workstreams/laptop-3/CLAUDE.md.
export function dedupeCandidates(list) {
  const seen = new Set();
  const unique = [];
  for (const c of list) {
    if (seen.has(c.candidate_id)) continue;
    seen.add(c.candidate_id);
    unique.push(c);
  }
  return { unique, duplicates: list.length - unique.length };
}

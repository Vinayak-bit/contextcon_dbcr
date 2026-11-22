// Landing page copy and scripted demo data, copied from the overlap-landing.html prototype.
// Every person, organization and number here is fictional and shown with an "Illustrative" tag.
import type { PersonaId } from '../../api/types';

/** Scripted refinements for the problem → spec demo. */
export const SPEC_SAMPLES = [
  { title: 'Quantized KV-cache memory allocation for LLM inference on a single GPU',
    topics: ['KV-cache paging', 'LLM serving', 'memory fragmentation'], methods: ['4-bit / 8-bit quantization', 'paged attention', 'CUDA kernels'],
    expertise: ['Built or benchmarked an inference runtime', 'GPU memory profiling'], types: ['Research engineers', 'Inference startups'], geo: 'Any' },
  { title: 'Federated learning for chest X-ray models across hospitals with non-IID data',
    topics: ['federated learning', 'medical imaging', 'non-IID data'], methods: ['FedProx / SCAFFOLD', 'differential privacy', 'domain adaptation'],
    expertise: ['Multi-site clinical deployment', 'Published FL results on imaging'], types: ['Professors', 'Hospital research groups'], geo: 'Europe' },
  { title: 'Sim-to-real transfer of learned locomotion for a 12-DoF quadruped',
    topics: ['legged locomotion', 'sim-to-real', 'reinforcement learning'], methods: ['domain randomization', 'PPO', 'system identification'],
    expertise: ['Hardware deployment on legged robots', 'Physics simulator tuning'], types: ['Robotics engineers', 'Robotics labs'], geo: 'Any' },
];

/** Persona tabs. Ids match the app's categories so "Start as …" can preselect one. */
export const PERSONA_TABS: { id: PersonaId; label: string; h: string; p: string; t: string[] }[] = [
  { id: 'student', label: 'Student', h: 'Find a mentor who has built the thing in your thesis.',
    p: 'Thesis advisors can’t know everyone. Describe your project and see researchers and engineers whose published or shipped work matches it, with the evidence to start a well-informed conversation.',
    t: ['Professors and postdocs', 'Industry engineers', 'PhD students one step ahead', 'Research labs'] },
  { id: 'professor', label: 'Professor', h: 'Find collaborators and industry partners for a grant or paper.',
    p: 'Look past your citation graph. Overlap surfaces groups and engineering teams working on the same problem from another angle, including people who ship rather than publish.',
    t: ['Faculty at other institutions', 'Industry R&D teams', 'Startups with deployed systems', 'Independent researchers'] },
  { id: 'company', label: 'Company', h: 'Find the specialist your team is missing, or the lab that’s ahead of you.',
    p: 'For startups and R&D teams stuck on a specific technical blocker. Filter by geography, role, organization type and size; every filter holds exactly as you set it.',
    t: ['Senior engineers and consultants', 'University labs', 'Specialist companies', 'Research institutes'] },
  { id: 'independent', label: 'Independent', h: 'Find peers who are deep in the same niche.',
    p: 'Working alone on a hard problem is slow. Find people whose demonstrated work overlaps yours, whether that’s a repository, a talk, a patent or a paper.',
    t: ['Open-source maintainers', 'Independent researchers', 'Small engineering teams', 'Academic groups'] },
  { id: 'other', label: 'Other', h: 'Anyone with a specific technical question.',
    p: 'Journalists checking a technical claim, investors doing diligence, program officers scoping a call. If you can describe the problem precisely, Overlap can rank who has worked on it.',
    t: ['Domain experts', 'Research groups', 'Companies in the space', 'Engineers with deployed work'] },
];

/** The two published rubrics (weights from shared/catalog.js RUBRICS). */
export const RUBRIC_TABLES = [
  { title: 'Individuals', rows: [
    { name: 'Topic match', hint: 'Work on your exact problem', w: 40 },
    { name: 'Accomplishments', hint: 'Shipped, published, merged', w: 25 },
    { name: 'Methods', hint: 'Techniques overlap with your spec', w: 15 },
    { name: 'Role fit', hint: 'Matches the role you asked for', w: 15 },
    { name: 'Proximity', hint: 'Time zone, region, domain', w: 5 },
  ] },
  { title: 'Organizations', rows: [
    { name: 'Topic match', hint: 'Products or research on your problem', w: 45 },
    { name: 'Accomplishments', hint: 'Deployed systems, results, IP', w: 25 },
    { name: 'Size fit', hint: 'Matches the size range you set', w: 15 },
    { name: 'Partnership', hint: 'History of external collaboration', w: 10 },
    { name: 'Proximity', hint: 'Region and domain', w: 5 },
  ] },
];

/** The illustrative result card's evidence (fictional sources, not links). */
export const SAMPLE_EVIDENCE = [
  { id: 'E1', claim: 'Wrote the allocator used in an open-source serving runtime', text: '“Replaced the contiguous cache with fixed-size pages; fragmentation dropped and batch size doubled at the same memory.”', source: 'example-repo.dev/pull/2184', at: '2026-11-18T09:42:00Z' },
  { id: 'E2', claim: 'Co-authored a workshop paper on 4-bit KV-cache quantization', text: '“We quantize keys per-channel and values per-token, keeping perplexity within 0.1 of FP16.”', source: 'example-proceedings.org/2025/kvq', at: '2026-11-18T09:42:00Z' },
  { id: 'E3', claim: 'Current role is on the inference team, not research leadership', text: '“Research Engineer, Inference Systems, since March 2024.”', source: 'profile source, consented', at: '2026-11-18T09:43:00Z' },
];

export const STEP_TYPED_TEXT = 'Our 4-bit KV cache fragments after ~2k tokens on one A100. Paging helped, but batch size still drops.';

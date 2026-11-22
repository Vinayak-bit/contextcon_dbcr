// Landing page (logged out), ported from overlap-landing.html. Sections: hero + globe, problem → spec
// demo, how it works (dark band), evidence, personas, ranking, trust, closing CTA.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PersonaId } from '../../api/types';
import {
  Button, ButtonLink, Card, Chip, CriterionBar, DarkBand, EvidenceClaim, Icon, IllustrativeTag, Input, Note, PageWaves,
  ScoreRing, SegmentedControl, SpotlightCard, Tabs, Tag, type EvidenceView,
} from '../../components/ui';
import { useCursorWeight, useInView, useReducedMotion } from '../../hooks';
import { clamp, easeOut } from '../../hooks/motion';
import { HeroField } from './HeroField';
import { OverlapGlobe, type GlobeFilter, type GlobeFilterInfo } from './OverlapGlobe';
import { PERSONA_TABS, RUBRIC_TABLES, SAMPLE_EVIDENCE, SPEC_SAMPLES, STEP_TYPED_TEXT } from './content';
import './landing.css';

export interface LandingProps {
  /** Start the flow (sign in), optionally preselecting a category. */
  onStart(persona?: PersonaId): void;
}

/** Smooth-scrolls to an in-page section without touching location.hash (the app routes on it). */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

const GEO_OPTIONS: { id: GlobeFilter; label: string }[] = [
  { id: 'world', label: 'Worldwide' }, { id: 'countries', label: 'Specific countries' }, { id: 'hubs', label: 'Research hubs' }, { id: 'city', label: 'My city' },
];

/** The marketing landing page. */
export function Landing({ onStart }: LandingProps) {
  const hero = useRef<HTMLElement>(null);
  return (
    <>
      <PageWaves after={hero} />
      <Hero heroRef={hero} onStart={onStart} />
      <SpecDemo />
      <HowItWorks />
      <EvidenceSection />
      <Personas onStart={onStart} />
      <Ranking />
      <Trust />
      <div className="wrap" id="start">
        <div className="ui-cta-band">
          <h2>Describe your problem. Meet the people who’ve solved it.</h2>
          <p>Start with one paragraph about what you’re stuck on. You’ll see the spec before anything is searched.</p>
          <div className="ui-cta-row">
            <Button onClick={() => onStart()}>Find your experts</Button>
            <Button variant="secondary" onClick={() => scrollToSection('ranking')}>See how ranking works</Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ hero --- */
function Hero({ heroRef, onStart }: { heroRef: React.RefObject<HTMLElement | null>; onStart(): void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useCursorWeight(title);
  const [filter, setFilter] = useState<GlobeFilter>('world');
  const [info, setInfo] = useState<GlobeFilterInfo | null>(null);
  return (
    <section ref={heroRef} className="lp-hero" id="top">
      <div className="lp-mesh" aria-hidden><HeroField /></div>
      <div className="wrap lp-hero-grid">
        <div>
          <span className="lp-eyebrow"><span className="lp-eyebrow__dot" aria-hidden />Research &amp; engineering expertise discovery</span>
          <h1 ref={title} className="lp-hero-title">Find the most relevant person or organization for your problem.</h1>
          <p className="lp-hero-sub">Describe the exact technical problem you’re working on. Overlap finds the people and organizations with the most relevant demonstrated expertise, and shows the evidence behind every match.</p>
          <div className="ui-cta-row">
            <ButtonLink href="#signin" magnetic onClick={(e) => { e.preventDefault(); onStart(); }}>Find your experts</ButtonLink>
            <Button variant="secondary" onClick={() => scrollToSection('ranking')}>See how ranking works</Button>
          </div>
          <div className="lp-hero-note">
            <span><Icon name="check" />Every claim cites a source</span>
            <span><Icon name="check" />Filters are never broadened silently</span>
          </div>
        </div>
        <div className="lp-globe-col">
          <OverlapGlobe filter={filter} onFilterInfo={setInfo} describedBy="lp-globe-meta" />
          <SegmentedControl<GlobeFilter> label="Geography filter" options={GEO_OPTIONS} value={filter} onChange={setFilter} />
          <p className="lp-globe-meta" id="lp-globe-meta" aria-live="polite">
            {info && <><strong>{info.inScope} of {info.total}</strong> illustrative experts in scope. {info.label}</>}
          </p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- spec demo --- */
function SpecDemo() {
  const section = useRef<HTMLElement>(null);
  const seen = useInView(section, 0.45);
  const reduced = useReducedMotion();
  const [text, setText] = useState('');
  const [verdict, setVerdict] = useState<{ kind: 'broad' | 'ok' | 'empty'; topic: string } | null>(null);
  const [chipsIn, setChipsIn] = useState(0);
  const [picked, setPicked] = useState(-1);
  const auto = useRef(true);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, reduced ? 0 : ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const check = (value = text) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    const t = value.trim();
    const words = t.split(/\s+/).filter(Boolean).length;
    setChipsIn(0);
    if (!t) { setVerdict({ kind: 'empty', topic: '' }); return; }
    setVerdict({ kind: words <= 3 ? 'broad' : 'ok', topic: t });
    SPEC_SAMPLES.forEach((_, i) => later(() => setChipsIn((n) => Math.max(n, i + 1)), 120 + i * 110));
  };

  useEffect(() => {
    if (!seen || !auto.current) return;
    const word = 'Machine learning';
    if (reduced) { setText(word); check(word); return; }
    [...word].forEach((_, i) => later(() => { if (auto.current) setText(word.slice(0, i + 1)); }, 300 + i * 65));
    later(() => { if (auto.current) check(word); }, 300 + word.length * 65 + 450);
  }, [seen]);

  const sample = picked >= 0 ? SPEC_SAMPLES[picked] : null;
  return (
    <section ref={section} className="lp-sec" id="validate" aria-labelledby="valH">
      <div className="wrap">
        <div className="ui-sec-head">
          <p className="kicker">Specific in, specific out</p>
          <h2 id="valH">A topic is not a problem. Overlap asks for the problem.</h2>
          <p className="lede">Broad topics return famous names, not the people who’ve done your work. Before any search runs, your description is checked for specificity and turned into a structured search spec you can read and edit.</p>
        </div>
        <div className="lp-demo">
          <SpotlightCard>
            <label className="ui-label lp-field-label" htmlFor="lp-topic">What are you working on?</label>
            <div className="lp-fake-input">
              <Input id="lp-topic" value={text} autoComplete="off" spellCheck={false} placeholder="Describe your technical problem"
                onChange={(e) => { auto.current = false; setText(e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { auto.current = false; check(); } }} />
              <Button variant="secondary" size="sm" onClick={() => { auto.current = false; check(); }}>Check</Button>
            </div>
            {verdict && (
              <div className={`lp-verdict lp-verdict--${verdict.kind === 'ok' ? 'ok' : 'broad'}`} role="status">
                <Icon name={verdict.kind === 'ok' ? 'check' : 'warn'} />
                {verdict.kind === 'empty' && <span>Describe the problem first. A sentence or two about the system and the constraint is enough.</span>}
                {verdict.kind === 'broad' && <span><b>Too broad.</b> “{verdict.topic}” is a field, not a problem, so results would favor well-known names over people who’ve done your work. Try a sharper version:</span>}
                {verdict.kind === 'ok' && <span><b>Specific enough.</b> In the app this becomes an editable search spec. This demo is scripted, so pick a sample to see one:</span>}
              </div>
            )}
            {verdict && verdict.kind !== 'empty' && (
              <div className="lp-sugg" aria-label="Refined suggestions">
                {SPEC_SAMPLES.map((s, i) => (
                  <button key={s.title} type="button" className={`lp-sugg-chip${i < chipsIn ? ' is-in' : ''}`} aria-pressed={picked === i} onClick={() => setPicked(i)}>
                    <span className="lp-sugg-chip__k mono">{i + 1}</span><span>{s.title}</span>
                  </button>
                ))}
              </div>
            )}
          </SpotlightCard>
          <SpotlightCard className="lp-spec" aria-live="polite">
            {!sample ? <div className="lp-spec-empty">Pick a refined problem to see the search spec Overlap builds from it.</div> : (
              <div className="lp-spec-body" key={picked}>
                <div className="lp-spec-head"><h3>Search spec</h3><span className="mono muted">draft · you approve before search</span></div>
                <p className="lp-spec-title">{sample.title}</p>
                <dl>
                  <dt>Core topics</dt><dd>{sample.topics.map((x) => <Chip key={x} tone="topic" label={x} />)}</dd>
                  <dt>Methods</dt><dd>{sample.methods.map((x) => <Chip key={x} label={x} />)}</dd>
                  <dt>Required expertise</dt><dd>{sample.expertise.map((x) => <Chip key={x} label={x} />)}</dd>
                  <dt>Candidate types</dt><dd>{sample.types.map((x) => <Chip key={x} label={x} />)}</dd>
                  <dt>Geography</dt><dd><Chip label={sample.geo} /><Chip label="hard filter, never widened silently" /></dd>
                </dl>
                <div className="lp-card-foot"><IllustrativeTag>Illustrative · scripted demo</IllustrativeTag></div>
              </div>
            )}
          </SpotlightCard>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- how it works --- */
function Step({ num, title, body, tints, children, onIn }: { num: string; title: string; body: string; tints: [string, string]; children: ReactNode; onIn?(): void }) {
  const ref = useRef<HTMLLIElement>(null);
  const seen = useInView(ref, 0.35);
  useEffect(() => { if (seen) onIn?.(); }, [seen]);
  return (
    <li ref={ref} className={`lp-step${seen ? ' is-in' : ''}`} style={{ ['--tint-a' as string]: `var(--rgb-${tints[0]})`, ['--tint-b' as string]: `var(--rgb-${tints[1]})` }}>
      <Card padded={false} interactive spotlight className="lp-step__card">
        <div className="lp-step__copy"><span className="lp-step__num mono">{num}</span><h3>{title}</h3><p>{body}</p></div>
        <div className="lp-viz" aria-hidden>{children}</div>
      </Card>
    </li>
  );
}

function MiniRing({ off }: { off: number }) {
  const gid = `lp-mring-${useId().replace(/:/g, '')}`;
  return (
    <svg className="lp-mring" viewBox="0 0 24 24" aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--teal)" /></linearGradient></defs>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle className="lp-mring__v" cx="12" cy="12" r="9" fill="none" stroke={`url(#${gid})`} strokeWidth="3" strokeLinecap="round" strokeDasharray="56.5" style={{ ['--off' as string]: off }} transform="rotate(-90 12 12)" />
    </svg>
  );
}

function HowItWorks() {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState('');
  const [spec, setSpec] = useState(34);
  const type = () => {
    if (reduced) { setTyped(STEP_TYPED_TEXT); return; }
    let n = 0;
    const tick = () => { n += 1; setTyped(STEP_TYPED_TEXT.slice(0, n)); if (n < STEP_TYPED_TEXT.length) window.setTimeout(tick, 22 + Math.random() * 30); };
    window.setTimeout(tick, 350);
  };
  const count = () => {
    if (reduced) { setSpec(86); return; }
    const t0 = performance.now() + 400;
    const f = (t: number) => { const p = clamp((t - t0) / 1400, 0, 1); setSpec(Math.round(34 + 52 * easeOut(p))); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  const check = <svg viewBox="0 0 16 16" aria-hidden><path d="m4 8.3 2.6 2.6L12 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return (
    <DarkBand id="how" kicker="How it works" lead="Four steps, each one inspectable." continuation="Describe the problem, check it, retrieve candidates, and rank them with the evidence attached.">
      <ol className="lp-steps">
        <Step num="01" title="Describe" tints={['accent', 'violet']} onIn={type}
          body="Write the problem the way you’d explain it to a colleague: the system, the constraint, what you’ve tried.">
          <div className="ui-mini">
            <div className="lp-mini-label">Your problem</div>
            <div className="lp-mini-text">{typed}<i className="lp-caret" /></div>
            <div className="lp-mini-chips"><span>single A100</span><span>4-bit</span><span>fragmentation</span></div>
          </div>
        </Step>
        <Step num="02" title="Validate" tints={['violet', 'accent']} onIn={count}
          body="An LLM checks it’s specific enough, suggests sharper versions if not, and drafts a search spec you approve.">
          <div className="ui-mini">
            <div className="lp-mini-row"><span className="lp-mini-label">Specificity</span><span className="mono">{spec}</span></div>
            <div className="lp-meter"><span /></div>
            <ul className="lp-mini-checks"><li>{check}Names the system</li><li>{check}States the constraint</li><li>{check}Says what was tried</li></ul>
          </div>
        </Step>
        <Step num="03" title="Retrieve & verify" tints={['teal', 'accent']}
          body="Candidates come from 1B+ people and 60M+ company profiles. Hard filters hold exactly as set; evidence is extracted with sources.">
          <div className="ui-mini lp-funnel">
            {[['Profiles searched', '1B+', 100], ['Topic match', '12,480', 64], ['After hard filters', '2,113', 34], ['With cited evidence', '418', 14]].map(([l, v, w]) => (
              <div key={l} className="lp-f-row"><span>{l}</span><span className="mono">{v}</span><i style={{ ['--w' as string]: `${w}%` }} /></div>
            ))}
            <div className="lp-f-tag">Geography: hard filter, not widened</div>
          </div>
        </Step>
        <Step num="04" title="Rank with evidence" tints={['accent', 'teal']}
          body="Each candidate is scored against a fixed rubric. Results come 50 per page, each with the claims behind its score.">
          <div className="ui-mini lp-rank-list">
            <div className="lp-r-row is-top"><MiniRing off={7.9} /><div><b>Research Engineer</b><small>paged KV-cache</small></div><span className="lp-r-ev mono">E1 E2</span></div>
            <div className="lp-r-row"><MiniRing off={10.7} /><div><b>Staff Engineer</b><small>GPU kernels</small></div><span className="lp-r-ev mono">E1</span></div>
            <div className="lp-r-row"><MiniRing off={13.0} /><div><b>Lab, 40 people</b><small>quantization</small></div><span className="lp-r-ev mono">E1 E3</span></div>
          </div>
        </Step>
      </ol>
      <p className="lp-steps-note"><IllustrativeTag /> Numbers and candidates in these cards are examples, not live data.</p>
      <Pipeline />
    </DarkBand>
  );
}

/* ------------------------------------------------------------- pipeline --- */
type Engine = 'deepseek' | 'crustdata' | 'jev' | 'you';
const ENGINE_LABEL: Record<Engine, string> = { deepseek: 'DeepSeek', crustdata: 'Crustdata', jev: 'TypeSafe Jev', you: 'You decide' };
const PIPELINE: { title: string; engines: Engine[]; points: string[] }[] = [
  { title: 'Understand the problem', engines: ['deepseek'], points: [
    'Checks that your description is specific and suggests sharper versions if not.',
    'Turns it into a search spec: core topics, methods, required expertise and search queries. You approve it.',
  ] },
  { title: 'Find and verify candidates', engines: ['crustdata'], points: [
    'Searches 1B+ people and 60M+ company profiles with the spec’s queries.',
    'Enriches the shortlist with roles, papers, repositories and company details.',
    'Applies your filters for geography, role, organization type and size exactly as set.',
  ] },
  { title: 'Extract the evidence', engines: ['deepseek'], points: [
    'Turns each profile into short claims about relevant work and accomplishments.',
    'Every claim cites an evidence id with its source link and retrieval time. Claims citing unknown evidence are dropped.',
  ] },
  { title: 'Rank with Jev', engines: ['jev'], points: [
    'Scores each rubric criterion from 0 to 5 on fixed, anchored levels.',
    'Final score = Σ weight × score ÷ 5. People: 40/25/15/15/5. Organizations: 45/25/15/10/5.',
    'Ties break on Jev’s decision value, a relevance signal. If Jev fails, the DeepSeek judge scores that result and the card says so.',
  ] },
  { title: 'Reach out, on request', engines: ['crustdata', 'deepseek', 'you'], points: [
    'View work email asks Crustdata for business emails only when you click.',
    'Draft email writes from the person’s cited work, for a meeting, a research internship, an internship, a collaboration, or your own reason.',
    'You copy the draft or open it in your email app. Overlap never sends email.',
  ] },
];

function Pipeline() {
  return (
    <div className="lp-pipeline">
      <h3 className="lp-pipeline__title">What runs at each step</h3>
      <ol className="lp-flow" aria-label="How a search runs, in five steps">
        {PIPELINE.map((step, i) => (
          <li key={step.title} className="lp-flow__node">
            <div className="lp-flow__head">
              <span className="lp-flow__num mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="lp-flow__engines">
                {step.engines.map((e) => <span key={e} className={`lp-eng lp-eng--${e}`}><i aria-hidden />{ENGINE_LABEL[e]}</span>)}
              </span>
            </div>
            <h4>{step.title}</h4>
            <ul>{step.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------- evidence --- */
function EvidenceSection() {
  const evidence = useMemo(() => new Map<string, EvidenceView>(SAMPLE_EVIDENCE.map((e) => [e.id, { id: e.id, text: e.text, source: e.source }])), []);
  const bars: [string, number, string][] = [['Topic', 95, '38/40'], ['Accomplishments', 84, '21/25'], ['Methods', 87, '13/15'], ['Role fit', 73, '11/15'], ['Proximity', 60, '3/5']];
  return (
    <section className="lp-sec" id="evidence" aria-labelledby="evH">
      <div className="wrap lp-split">
        <div>
          <p className="kicker">Evidence, not popularity</p>
          <h2 id="evH">Relevance is what someone has done, not how many people follow them.</h2>
          <p className="lede">Every claim in a result links to its source and records when it was retrieved. If Overlap can’t point to it, it doesn’t count.</p>
          <ul className="lp-checks">
            <li><Icon name="check" className="is-yes" /><span>Counts: shipped systems, papers on your exact topic, methods used, roles held, proximity to your constraints.</span></li>
            <li><Icon name="check" className="is-yes" /><span>Research and engineering weigh the same. A merged pull request is evidence, and so is a paper.</span></li>
            <li><Icon name="x" className="is-no" /><span>Never counts: follower counts, raw citation totals, company size as a stand-in for quality.</span></li>
          </ul>
        </div>
        <SpotlightCard className="lp-result" role="article" aria-label="Illustrative result card">
          <div className="lp-result-top">
            <ScoreRing score={86} label="Score" caption="Jev score" />
            <div className="lp-result-id">
              <div className="lp-r-name">Research Engineer, inference systems</div>
              <div className="lp-r-sub">Fictional lab · Zürich, Switzerland</div>
              <div className="lp-badges"><Tag tone="success" icon="pin">Location verified · HQ</Tag></div>
            </div>
          </div>
          <p className="lp-why"><b>Why relevant:</b> has built and benchmarked a paged KV-cache allocator for quantized LLM serving, the exact component in your spec.</p>
          <div className="lp-bars">
            {bars.map(([l, pct, v]) => <CriterionBar key={l} layout="inline" label={l} value={pct} max={100} meta={v} />)}
          </div>
          <div className="lp-claims">
            {SAMPLE_EVIDENCE.map((e) => <EvidenceClaim key={e.id} ids={[e.id]} evidence={evidence} retrievedAt={e.at}>{e.claim}</EvidenceClaim>)}
          </div>
          <div className="lp-card-foot"><IllustrativeTag>Illustrative · fictional person</IllustrativeTag><span className="mono muted">no contact details shown</span></div>
        </SpotlightCard>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- personas --- */
function Personas({ onStart }: { onStart(p: PersonaId): void }) {
  const [tab, setTab] = useState<PersonaId>('student');
  const p = PERSONA_TABS.find((x) => x.id === tab)!;
  return (
    <section className="lp-sec" id="people" aria-labelledby="peopleH">
      <div className="wrap">
        <div className="ui-sec-head">
          <p className="kicker">Who it’s for</p>
          <h2 id="peopleH">Built for five kinds of people with hard problems.</h2>
        </div>
        <Tabs<PersonaId> label="Personas" tabs={PERSONA_TABS.map((x) => ({ key: x.id, label: x.label }))} value={tab} onChange={setTab} panelId={(k) => `lp-pan-${k}`} />
        <div className="lp-tabpanel" role="tabpanel" id={`lp-pan-${tab}`} tabIndex={0}>
          <div>
            <h3>{p.h}</h3>
            <p>{p.p}</p>
            <Button variant="secondary" size="sm" onClick={() => onStart(p.id)}>Start as {p.label.toLowerCase()}</Button>
          </div>
          <SpotlightCard className="lp-targets">
            <h4>Who you can target</h4>
            <ul>{p.t.map((t) => <li key={t}><i aria-hidden />{t}</li>)}</ul>
          </SpotlightCard>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- ranking --- */
function Ranking() {
  const grid = useRef<HTMLDivElement>(null);
  const seen = useInView(grid, 0.3);
  return (
    <section className="lp-sec" id="ranking" aria-labelledby="rankH">
      <div className="wrap">
        <div className="ui-sec-head">
          <p className="kicker">How ranking works</p>
          <h2 id="rankH">Two fixed rubrics, published in full.</h2>
          <p className="lede">TypeSafe Jev scores every candidate against the same weights. Nothing is tuned per query, and nothing outside these criteria moves a result.</p>
        </div>
        <div ref={grid} className={`lp-rank-grid${seen ? ' is-in' : ''}`}>
          {RUBRIC_TABLES.map((t) => (
            <SpotlightCard key={t.title} className="lp-rubric">
              <div className="lp-rubric-head"><h3>{t.title}</h3><span className="mono muted">Σ 100</span></div>
              <table>
                <thead><tr><th scope="col">Criterion</th><th scope="col">Weight</th></tr></thead>
                <tbody>
                  {t.rows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}<small>{r.hint}</small></td>
                      <td className="lp-w"><div className="lp-wbar"><span className="lp-wbar__track"><span className="lp-wbar__fill" style={{ ['--w' as string]: r.w * 2 }} /></span><span className="mono">{r.w}%</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SpotlightCard>
          ))}
        </div>
        <div className="lp-note-gap"><Note>Jev’s decision value is a relevance signal for ordering results. It is not a probability that a collaboration will succeed, and it says nothing about whether someone is available.</Note></div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- trust --- */
function Trust() {
  const items: { h: string; p: string; icon: ReactNode }[] = [
    { h: 'Consent first', p: 'Profile data is used only with consent and only to judge relevance to your problem.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2.2 2.2L15.5 10" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { h: 'No inferred contacts', p: 'Overlap never guesses emails, phone numbers or addresses, and doesn’t claim anyone is available.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4 7 8 6 8-6M4 4l16 16" strokeLinecap="round" /></svg> },
    { h: 'Samples are labelled', p: 'Any example person or organization, here or in the product, is marked as illustrative.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" strokeLinejoin="round" /><path d="M4 12l8 3.5 8-3.5M4 16.5 12 20l8-3.5" strokeLinejoin="round" /></svg> },
    { h: 'Filters stay put', p: 'If too few results match, you’re told. Nothing widens until you explicitly click to widen it.',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" /></svg> },
  ];
  return (
    <section className="lp-sec" id="trust" aria-labelledby="trustH">
      <div className="wrap">
        <div className="ui-sec-head">
          <p className="kicker">Trust &amp; privacy</p>
          <h2 id="trustH">Careful with people’s data, and honest about what it shows.</h2>
        </div>
        <div className="lp-trust">{items.map((i) => <div key={i.h}>{i.icon}<h3>{i.h}</h3><p>{i.p}</p></div>)}</div>
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { LinksRequest, LinksResponse, Me, ProfileMatch, UserProfile } from '../../api/types';
import { Badge, Button, Card, Notice, PageHeader, Spinner, TextField } from '../../ui';
import { isWebUrl } from './fields';

const linkFields = [
  ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['scholar', 'Google Scholar'],
  ['x', 'X'], ['website', 'Personal website or portfolio'],
] as const;

export function Discovery({ me, connected, onMeChange, onConfirmed }: {
  me: Me;
  connected?: boolean;
  onMeChange(me: Me): void;
  onConfirmed(me: Me): void;
}) {
  const [attemptsLeft, setAttemptsLeft] = useState(me.discovery.maxAttempts - me.discovery.attempts);
  const [matches, setMatches] = useState<ProfileMatch[]>([]);
  const [name, setName] = useState(me.name);
  const [affiliation, setAffiliation] = useState('');
  const [links, setLinks] = useState<LinksRequest>({});
  const [context, setContext] = useState<LinksResponse['context']>([]);
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState<'lookup' | 'links' | 'confirm' | 'reject' | 'skip' | null>(null);
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [note, setNote] = useState('');
  const autoStarted = useRef(false);
  const firstAttempt = attemptsLeft === me.discovery.maxAttempts;
  const match = matches[0];

  function handleError(error: unknown) {
    if (error instanceof ApiError && error.code === 'attempts_exhausted') {
      setAttemptsLeft(0);
      setNote(error.message);
    } else if (error instanceof ApiError && error.code === 'crustdata_auth_required') {
      setAuthRequired(true);
    } else {
      setError(error instanceof Error ? error.message : 'The lookup failed. Try again or skip.');
    }
  }

  async function discover(useSample = sample) {
    if (busy) return;
    setBusy('lookup');
    setError('');
    setNote('');
    setAuthRequired(false);
    try {
      const response = await api.discover(firstAttempt
        ? { method: 'email', sample: useSample }
        : { method: 'name', name: name.trim(), affiliation: affiliation.trim(), sample: useSample });
      setAttemptsLeft(response.attemptsLeft);
      setMatches(response.matches.slice(0, 1));
      setNote(response.note || '');
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (firstAttempt && !autoStarted.current) {
      autoStarted.current = true;
      void discover();
    }
  });

  async function submitLinks(useSample = sample) {
    if (busy) return;
    const request: LinksRequest = { sample: useSample };
    for (const [field, label] of linkFields) {
      const url = links[field]?.trim();
      if (!url) continue;
      if (!isWebUrl(url)) {
        setError(`Enter a valid HTTP or HTTPS link for ${label}.`);
        return;
      }
      request[field] = url;
    }
    if (!linkFields.some(([field]) => request[field])) {
      setError('Enter a profile link or skip this step.');
      return;
    }
    setBusy('links');
    setError('');
    setNote('');
    setAuthRequired(false);
    try {
      const response = await api.submitLinks(request);
      setContext(response.context);
      setMatches(response.matches);
      if (!response.matches.length) setNote('No professional profile matched these links.');
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(null);
    }
  }

  async function respond(action: 'confirm' | 'reject' | 'skip') {
    if (busy || (!match && action !== 'skip')) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'skip') onMeChange(await api.skipProfile());
      if (action === 'confirm' && match) onConfirmed(await api.confirmProfile(match.match_id));
      if (action === 'reject' && match) {
        const response = await api.rejectProfile(match.match_id);
        setAttemptsLeft(response.attemptsLeft);
        setMatches((previous) => previous.slice(1));
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'not_found') setMatches([]);
      handleError(error);
    } finally {
      setBusy(null);
    }
  }

  function trySample() {
    setSample(true);
    if (attemptsLeft > 0) void discover(true);
    else void submitLinks(true);
  }

  return (
    <section className="ob-narrow">
      <PageHeader title={match ? 'Is this your professional profile?' : 'Find your professional profile'} />
      <Card className="stack">
        {(busy === 'lookup' || busy === 'links') && <Spinner label="Looking for your professional profile…" />}
        {note && <Notice>{note}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        {authRequired && <Notice tone="warning">
          {connected ? 'Retry your lookup to use Crustdata.' : 'Connect Crustdata in the header to look up your professional profile.'}
        </Notice>}
        {context.length > 0 && <ul className="ob-context">
          {context.map((item, index) => <li key={index}>
            <strong>{item.label} {item.fetched ? 'added as context' : 'could not be added'}</strong>
            {item.summary && <p>{item.summary}</p>}
          </li>)}
        </ul>}
        {match ? (
          <>
            <div className="ob-match stack">
              <div className="ob-inline"><h2>{match.name}</h2>{match.sample && <Badge tone="sample">Sample</Badge>}</div>
              {match.headline && <p>{match.headline}</p>}
              {[match.current_title, match.organization, match.location].filter(Boolean).length > 0 &&
                <p className="muted">{[match.current_title, match.organization, match.location].filter(Boolean).join(' · ')}</p>}
              {match.profile_url && isWebUrl(match.profile_url) &&
                <a href={match.profile_url} target="_blank" rel="noreferrer">View professional profile</a>}
            </div>
            <div className="ob-inline">
              <Button disabled={Boolean(busy)} loading={busy === 'confirm'} onClick={() => void respond('confirm')}>Yes, that's me</Button>
              <Button variant="secondary" disabled={Boolean(busy)} loading={busy === 'reject'} onClick={() => void respond('reject')}>No, not me</Button>
            </div>
          </>
        ) : !busy && (
          firstAttempt ? <Button onClick={() => void discover()}>Retry email lookup</Button> : attemptsLeft > 0 ? (
            <form className="stack" onSubmit={(event) => { event.preventDefault(); void discover(); }}>
              <h2>Attempt {me.discovery.maxAttempts - attemptsLeft + 1} of {me.discovery.maxAttempts}</h2>
              <TextField label="Name" required value={name} onChange={setName} />
              <TextField label="Affiliation" hint="Institution or company, if applicable" value={affiliation} onChange={setAffiliation} />
              <div><Button type="submit">Look up profile</Button></div>
            </form>
          ) : (
            <form className="stack" noValidate onSubmit={(event) => { event.preventDefault(); void submitLinks(); }}>
              <h2>Add optional profile links</h2>
              {linkFields.map(([field, label]) => <TextField key={field} label={label} type="url"
                value={links[field] || ''} onChange={(value) => setLinks((previous) => ({ ...previous, [field]: value }))} />)}
              <div><Button type="submit">Look up links</Button></div>
            </form>
          )
        )}
        <div className="ob-inline">
          {(authRequired || error) && !sample && !match && <Button variant="secondary" disabled={Boolean(busy)}
            onClick={trySample}>Try with sample data</Button>}
          <Button variant="ghost" disabled={Boolean(busy)} loading={busy === 'skip'} onClick={() => void respond('skip')}>Skip</Button>
        </div>
      </Card>
    </section>
  );
}

export function ProfileSummary({ profile, onMeChange, onContinue }: {
  profile: UserProfile;
  onMeChange(me: Me): void;
  onContinue(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(profile.current_role);
  const [institution, setInstitution] = useState(profile.institution);
  const [city, setCity] = useState(profile.location.city);
  const [country, setCountry] = useState(profile.location.country);
  const [skills, setSkills] = useState(profile.skills.join(', '));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      onMeChange(await api.updateProfile({
        current_role: role.trim(), institution: institution.trim(),
        location: { city: city.trim(), country: country.trim(), state: profile.location.state },
        skills: skills.split(',').map((skill) => skill.trim()).filter(Boolean),
      }));
      setEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ob-narrow">
      <PageHeader title="Your professional profile" subtitle="Used for personalization and relevance only." />
      <Card className="stack">
        <div className="ob-inline"><h2>{profile.name}</h2>{profile.sample && <Badge tone="sample">Sample</Badge>}</div>
        {editing ? (
          <form className="stack" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <TextField label="Role" value={role} onChange={setRole} />
            <TextField label="Institution or organization" value={institution} onChange={setInstitution} />
            <div className="ob-fields">
              <TextField label="City" value={city} onChange={setCity} />
              <TextField label="Country" value={country} onChange={setCountry} />
            </div>
            <TextField label="Skills" hint="Separate skills with commas." value={skills} onChange={setSkills} />
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="ob-inline">
              <Button type="submit" loading={busy}>Save profile</Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="ob-facts">
              <dt>Role</dt><dd>{profile.current_role || '—'}</dd>
              <dt>Institution</dt><dd>{profile.institution || '—'}</dd>
              <dt>Location</dt><dd>{[profile.location.city, profile.location.country].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Skills</dt><dd>{profile.skills.join(', ') || '—'}</dd>
            </dl>
            <div className="ob-inline">
              <Button onClick={onContinue}>Continue</Button>
              <Button variant="secondary" onClick={() => {
                setRole(profile.current_role);
                setInstitution(profile.institution);
                setCity(profile.location.city);
                setCountry(profile.location.country);
                setSkills(profile.skills.join(', '));
                setEditing(true);
              }}>Edit profile</Button>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

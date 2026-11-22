// "Your profile" — an optional, editable step for every persona (replaces automatic profile discovery).
// Stored only with consent; used as secondary context for topic refinement and ranking, never required.
import { useState } from 'react';
import { api } from '../../api/client';
import type { Me } from '../../api/types';
import { Badge, Button, Notice, TextArea, TextField, Toggle } from '../../ui';
import { CountryField } from './fields';

const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

export function ProfileStep({ me, onMeChange, onDone, onBack }: {
  me: Me;
  onMeChange(me: Me): void;
  /** Called after saving or skipping; the wizard moves on either way. */
  onDone(): void;
  onBack(): void;
}) {
  const p = me.profile;
  const [role, setRole] = useState(p?.current_role ?? '');
  const [institution, setInstitution] = useState(p?.institution ?? '');
  const [city, setCity] = useState(p?.location.city ?? '');
  const [country, setCountry] = useState(p?.location.country ?? '');
  const [skills, setSkills] = useState((p?.skills ?? []).join(', '));
  const [work, setWork] = useState((p?.projects ?? []).join('\n'));
  const [consent, setConsent] = useState(me.consent);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const empty = ![role, institution, city, country, skills, work].some((v) => v.trim());

  async function save() {
    if (busy) return;
    if (empty) { onDone(); return; }
    if (!consent) { setError('Turn on "Store my profile" to save it, or choose Skip.'); return; }
    setBusy('save');
    setError('');
    try {
      if (!me.consent) onMeChange(await api.setConsent(true));
      onMeChange(await api.updateProfile({
        current_role: role.trim(),
        institution: institution.trim(),
        location: { city: city.trim(), country: country.trim(), state: p?.location.state ?? '' },
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        projects: lines(work),
      }));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy('remove');
    setError('');
    try {
      onMeChange(await api.setConsent(false));
      setRole(''); setInstitution(''); setCity(''); setCountry(''); setSkills(''); setWork(''); setConsent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your profile.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack ob-section">
      <div>
        <h2>Your profile <span className="muted">(optional)</span></h2>
        <p className="muted">Helps suggest sharper topics, prefill locations, and judge complementary expertise. Your project stays the main signal. Skip it and the search still works.</p>
      </div>
      {p?.source === 'crustdata' && <div><Badge tone="info">Started from your confirmed professional profile — edit anything</Badge></div>}
      <form className="stack" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <TextField label="Role or background" value={role} onChange={setRole} placeholder="e.g. MS student in ML systems, firmware lead, materials scientist" />
        <TextField label="Institution or company" value={institution} onChange={setInstitution} />
        <div className="ob-fields">
          <TextField label="City" value={city} onChange={setCity} autoComplete="address-level2" />
          <CountryField value={country} onChange={setCountry} />
        </div>
        <TextField label="Skills" hint="Separate with commas." value={skills} onChange={setSkills} placeholder="CUDA, PyTorch, RTL design" />
        <TextArea label="Relevant work" hint="One item per line: projects, papers, systems you built." rows={4} value={work} onChange={setWork} />
        <Toggle label="Store my profile to personalize results" checked={consent} onChange={setConsent}
          description={me.consent ? 'Stored only for relevance. Turn off and save to keep it out.' : 'Without this, nothing you type here is stored or used.'} />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="ob-actions">
          <Button variant="ghost" disabled={Boolean(busy)} onClick={onBack}>Back</Button>
          {p && me.consent && <Button variant="ghost" loading={busy === 'remove'} disabled={Boolean(busy)} onClick={() => void remove()}>Remove saved profile</Button>}
          <Button variant="secondary" disabled={Boolean(busy)} onClick={onDone}>Skip</Button>
          <Button type="submit" loading={busy === 'save'} disabled={Boolean(busy) || (!empty && !consent)}>{empty ? 'Continue' : 'Save and continue'}</Button>
        </div>
      </form>
    </div>
  );
}

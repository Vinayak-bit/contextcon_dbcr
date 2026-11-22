import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Me, OrgProfile } from '../../api/types';
import { Badge, Button, Notice, Select, SelectCard, TextField } from '../../ui';
import { CountryField, isWebUrl } from './fields';

const orgTypes = ['Startup', 'Company', 'Research lab', 'University lab', 'R&D team', 'Nonprofit', 'Other'];
const emptyOrg: OrgProfile = {
  name: '', type: '', website: '', primary_domain: '', team_size: '', location: { city: '', country: '' }, matched: false,
};

export function OrganizationFields({ initial, onSave, onNext, onBack, onBusyChange }: {
  initial: OrgProfile | null;
  onSave(me: Me): void;
  onNext(skipped: boolean): void;
  onBack(): void;
  onBusyChange(busy: boolean): void;
}) {
  const [org, setOrg] = useState(initial || emptyOrg);
  const [matches, setMatches] = useState<OrgProfile[]>([]);
  const [busy, setBusy] = useState<'lookup' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [authRequired, setAuthRequired] = useState(false);

  function patch(fields: Partial<OrgProfile>) {
    setOrg((previous) => ({ ...previous, ...fields }));
  }

  function patchIdentity(fields: Pick<Partial<OrgProfile>, 'name' | 'website'>) {
    patch({ ...fields, matched: false, crustdata_company_id: undefined, domain: undefined, sample: false });
    setMatches([]);
    setNotice('');
  }

  function validWebsite() {
    if (!org.website.trim() || isWebUrl(org.website)) return true;
    setError('Enter the organization website as an HTTP or HTTPS URL.');
    return false;
  }

  function start(action: 'lookup' | 'save') {
    setBusy(action);
    onBusyChange(true);
    setError('');
    setNotice('');
    setAuthRequired(false);
  }

  function finish() {
    setBusy(null);
    onBusyChange(false);
  }

  async function lookup(sample = false) {
    if (busy || !validWebsite()) return;
    if (!org.name.trim() && !org.website.trim()) {
      setError('Enter the organization name or website.');
      return;
    }
    start('lookup');
    try {
      const response = await api.identifyOrg({ name: org.name.trim(), website: org.website.trim(), sample });
      setMatches(response.matches);
      if (!response.matches.length) setNotice('No organization record matched. You can continue with the details you entered.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'crustdata_auth_required') setAuthRequired(true);
      else setError(error instanceof Error ? error.message : 'Could not look up the organization.');
    } finally {
      finish();
    }
  }

  async function save(matched: boolean) {
    if (busy || !validWebsite()) return;
    if (!org.name.trim()) {
      setError('Enter the organization name.');
      return;
    }
    start('save');
    const manualFields = matched ? {} : { crustdata_company_id: undefined, domain: undefined, sample: false };
    try {
      onSave(await api.saveOrg({ ...org, ...manualFields, name: org.name.trim(), website: org.website.trim(), matched }));
      onNext(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the organization.');
    } finally {
      finish();
    }
  }

  const availableTypes = org.type && !orgTypes.includes(org.type) ? [org.type, ...orgTypes] : orgTypes;
  return (
    <form className="stack ob-section" noValidate onSubmit={(event) => { event.preventDefault(); void save(org.matched); }}>
      <h2>Your organization</h2>
      <div className="ob-fields">
        <TextField label="Organization name" value={org.name} onChange={(name) => patchIdentity({ name })} required />
        <Select label="Organization type" value={org.type} onChange={(type) => patch({ type })}
          options={availableTypes.map((type) => ({ value: type, label: type }))} placeholder="Select a type" />
        <TextField label="Organization website" type="url" value={org.website} onChange={(website) => patchIdentity({ website })} />
        <TextField label="Primary technical domain" value={org.primary_domain} onChange={(primary_domain) => patch({ primary_domain })} />
        <TextField label="Team size" value={org.team_size} onChange={(team_size) => patch({ team_size })} />
        <TextField label="City" value={org.location.city} onChange={(city) => patch({ location: { ...org.location, city } })} />
        <CountryField value={org.location.country} onChange={(country) => patch({ location: { ...org.location, country } })} />
      </div>
      <div className="ob-inline">
        <Button variant="secondary" disabled={Boolean(busy)} loading={busy === 'lookup'} onClick={() => void lookup()}>Look up</Button>
        {authRequired && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void lookup(true)}>Try with sample data</Button>}
      </div>
      {authRequired && <Notice tone="warning">Connect Crustdata in the header to look up an organization. You can also continue with the details you entered.</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {matches.length > 0 && <div className="stack" role="radiogroup" aria-label="Organization records">
        {matches.map((match, index) => <SelectCard key={index}
          title={<>{match.name} {match.sample && <Badge tone="sample">Sample</Badge>}</>}
          description={[match.primary_domain, match.location.raw, match.website].filter(Boolean).join(' · ')}
          selected={org.matched && org.crustdata_company_id === match.crustdata_company_id} disabled={Boolean(busy)}
          onSelect={() => setOrg(match)} />)}
      </div>}
      {org.matched && <p className="ob-inline">Using the selected organization record. {org.sample && <Badge tone="sample">Sample</Badge>}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="ob-actions">
        <Button variant="ghost" onClick={onBack} disabled={Boolean(busy)}>Back</Button>
        <Button variant="ghost" disabled={Boolean(busy)} onClick={() => onNext(true)}>I'm not representing an organization</Button>
        {org.matched && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void save(false)}>Continue without a record</Button>}
        <Button type="submit" disabled={Boolean(busy)} loading={busy === 'save'}>
          {org.matched ? 'Continue' : 'Continue without a record'}
        </Button>
      </div>
    </form>
  );
}

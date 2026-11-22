import { COUNTRIES, GEO_SCOPES, REGIONS, RESEARCH_HUBS, canonicalGeoOption } from '@shared/catalog.js';
import type { GeoOptionId, Me } from '../../api/types';
import { CheckboxGroup, RadioGroup, TextField, Toggle } from '../../ui';
import { isCity, isCountry, type GeographyDraft, type Persona } from './draft';
import { CountryField, labelOptions } from './fields';

export function GeographyFields({ value, onChange, persona, me, skipOrganization }: {
  value: GeographyDraft;
  onChange(value: GeographyDraft): void;
  persona: Persona;
  me: Me;
  skipOrganization?: boolean;
}) {
  // Older searches may carry legacy ids (same_city / same_country); show them as their current option.
  const option = value.option && canonicalGeoOption(value.option) as GeoOptionId;
  const organization = 'orgProfile' in persona && !skipOrganization ? me.organization : null;
  const profile = me.profile;
  const primaryLocation = organization?.location || profile?.location;
  const fallbackLocation = profile?.location;

  function patch(fields: Partial<GeographyDraft>) {
    onChange({ ...value, ...fields });
  }

  function choose(option: GeoOptionId) {
    const local = isCity(option) || isCountry(option);
    patch({
      option,
      preferProximity: isCity(option) || option === 'my_institute',
      institute: option === 'my_institute' ? value.institute ?? (profile?.institution || organization?.name || '') : undefined,
      city: isCity(option) ? value.city ?? (primaryLocation?.city || fallbackLocation?.city || '') : undefined,
      country: local ? value.country ?? (primaryLocation?.country || fallbackLocation?.country || '') : undefined,
      countries: undefined, regions: undefined, hubs: undefined,
    });
  }

  return (
    <div className="stack ob-section">
      <RadioGroup legend="Where should we look?" value={option ?? null}
        options={(persona.geography as GeoOptionId[]).map((id) => ({ id, label: GEO_SCOPES[id].label }))}
        onChange={(id) => choose(id as GeoOptionId)} />
      {option === 'my_institute' && <TextField label="Institution or organization" value={value.institute || ''}
        hint="Only people and organizations verifiably affiliated with it are included."
        onChange={(institute) => patch({ institute })} required />}
      {isCity(option) && <div className="ob-fields">
        <TextField label="City" value={value.city || ''} onChange={(city) => patch({ city })} required />
        <CountryField value={value.country || ''} onChange={(country) => patch({ country })} />
      </div>}
      {isCountry(option) && <CountryField value={value.country || ''} onChange={(country) => patch({ country })} />}
      {option === 'another_country' && <CountryField label="Country to search" value={value.countries?.[0] || ''}
        onChange={(country) => patch({ countries: country ? [country] : [] })} />}
      {option === 'specific' && <>
        <CheckboxGroup legend="Regions" options={labelOptions(Object.keys(REGIONS))} value={value.regions || []}
          onChange={(regions) => patch({ regions })} />
        <div className="ob-country-list">
          <CheckboxGroup legend="Countries" options={labelOptions(COUNTRIES)} value={value.countries || []}
            onChange={(countries) => patch({ countries })} />
        </div>
      </>}
      {option === 'hubs' && <CheckboxGroup legend="Research hubs" options={RESEARCH_HUBS} value={value.hubs || []}
        onChange={(hubs) => patch({ hubs })} />}
      <div className="stack ob-rule">
        <Toggle label="Include candidates whose location or role can't be verified"
          description="Widens the results to include matches with incomplete evidence."
          checked={value.allowUnverified} onChange={(allowUnverified) => patch({ allowUnverified })} />
        <Toggle label="Slightly favor closer matches inside this area" disabled={!option}
          checked={value.preferProximity} onChange={(preferProximity) => patch({ preferProximity })} />
      </div>
    </div>
  );
}

export function geographyLabel(geography: GeographyDraft) {
  const { option, institute, city, country, countries, regions, hubs } = geography;
  if (!option) return 'No geography selected';
  const label = GEO_SCOPES[option].label;
  if (option === 'my_institute') return `${label} · ${institute}`;
  if (isCity(option)) return `${label} · ${city}, ${country}`;
  if (isCountry(option)) return `${label} · ${country}`;
  if (option === 'hubs') return RESEARCH_HUBS.filter((hub) => hubs?.includes(hub.id)).map((hub) => hub.label).join(', ');
  if (option === 'another_country' || option === 'specific') return [...(countries || []), ...(regions || [])].join(', ');
  return label;
}

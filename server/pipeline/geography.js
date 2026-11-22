// v0 STUB — owned by Laptop 3, who replaces this with the full implementation.
// Brief: docs/workstreams/laptop-3/CLAUDE.md. Keep exported names and signatures.
// This version is deliberately simple: enough for the app to run end-to-end.
import { GEO_SCOPES, REGIONS, RESEARCH_HUBS } from '../../shared/catalog.js';
import { HttpError, normText, uniq } from '../util.js';

const COUNTRY_ALIASES = { usa: 'United States', us: 'United States', 'united states of america': 'United States', uk: 'United Kingdom', england: 'United Kingdom', 'great britain': 'United Kingdom', korea: 'South Korea', uae: 'United Arab Emirates' };

export function canonCountry(s) {
  const n = normText(s);
  return COUNTRY_ALIASES[n] || String(s || '').trim();
}
export function canonCity(s) { return normText(s); }
export function institutionMatches(a, b) {
  const x = normText(a); const y = normText(b);
  return Boolean(x && y && (x.includes(y) || y.includes(x)));
}

/** GeographyPref + profile → ResolvedGeo. Throws 400 `validation` when a required value is missing. */
export function resolveGeography(pref, userProfile, organization) {
  const def = GEO_SCOPES[pref?.option];
  if (!def) throw new HttpError(400, 'Choose a geography option.', { code: 'validation' });
  const loc = userProfile?.location || organization?.location || {};
  const geo = { option: pref.option, scope: def.scope, countries: [], hubs: [], allowUnverified: Boolean(pref.allowUnverified), preferProximity: Boolean(pref.preferProximity) };
  switch (def.scope) {
    case 'institute':
      geo.institute = (pref.institute || userProfile?.institution || organization?.name || '').trim();
      if (!geo.institute) throw new HttpError(400, 'Enter your institute or university.', { code: 'validation' });
      geo.label = `Institution: ${geo.institute}`;
      break;
    case 'city':
      geo.city = (pref.city || loc.city || '').trim();
      geo.country = canonCountry(pref.country || loc.country || '');
      if (!geo.city) throw new HttpError(400, 'Enter your city.', { code: 'validation' });
      geo.label = `City: ${geo.city}${geo.country ? `, ${geo.country}` : ''}`;
      break;
    case 'country':
      geo.country = canonCountry(pref.country || loc.country || '');
      if (!geo.country) throw new HttpError(400, 'Choose your country.', { code: 'validation' });
      geo.countries = [geo.country];
      geo.label = `Country: ${geo.country}`;
      break;
    case 'countries':
      geo.countries = uniq([...(pref.countries || []), ...(pref.regions || []).flatMap((r) => REGIONS[r] || [])].map(canonCountry));
      if (!geo.countries.length) throw new HttpError(400, 'Choose at least one country or region.', { code: 'validation' });
      if (def.single && geo.countries.length !== 1) throw new HttpError(400, 'Choose exactly one country.', { code: 'validation' });
      geo.label = `${def.single ? 'Country' : 'Countries'}: ${[...(pref.regions || []), ...(pref.countries || [])].join(', ')}`;
      break;
    case 'hubs':
      geo.hubs = RESEARCH_HUBS.filter((h) => (pref.hubs || []).includes(h.id));
      if (!geo.hubs.length) throw new HttpError(400, 'Choose at least one research hub.', { code: 'validation' });
      geo.label = `Hubs: ${geo.hubs.map((h) => h.label).join(', ')}`;
      break;
    default:
      geo.label = 'Worldwide';
  }
  return geo;
}

export function personGeoFilters(geo) {
  if (geo.scope === 'country' || geo.scope === 'countries') return { field: 'basic_profile.location.country', type: 'in', value: geo.countries };
  if (geo.scope === 'city') return { field: 'basic_profile.location.full_location', type: '(.)', value: geo.city };
  if (geo.scope === 'institute') return { op: 'or', conditions: [{ field: 'experience.employment_details.current.company_name', type: '(.)', value: geo.institute }, { field: 'education.schools.school', type: '(.)', value: geo.institute }] };
  if (geo.scope === 'hubs') return { op: 'or', conditions: geo.hubs.flatMap((h) => h.cities.map((c) => ({ field: 'basic_profile.location.full_location', type: '(.)', value: c }))) };
  return null;
}

export function companyGeoFilters(geo) {
  if (geo.scope === 'country' || geo.scope === 'countries') return { field: 'locations.country', type: 'in', value: geo.countries };
  if (geo.scope === 'city') return { field: 'locations.city', type: '(.)', value: geo.city };
  if (geo.scope === 'hubs') return { field: 'locations.country', type: 'in', value: uniq(geo.hubs.map((h) => h.country)) };
  return null;
}

/** → GeoCheck */
export function verifyGeo(c, geo) {
  if (geo.scope === 'worldwide') return { status: 'not_required', basis: 'none' };
  const isOrg = c.candidate_type === 'organization';
  const loc = isOrg ? c.hq_detail : c.location_detail;
  const basis = isOrg ? 'headquarters' : 'profile';
  if (geo.scope === 'institute') {
    const orgs = [c.institution_or_company, c.parent_institution, c.name, ...(c.meta?.current_roles || []).map((r) => r.org), ...(c.meta?.schools || []).map((s) => s.school)];
    return orgs.some((o) => institutionMatches(o, geo.institute)) ? { status: 'verified', basis: 'institution', detail: geo.institute } : { status: orgs.some(Boolean) ? 'mismatch' : 'unverified', basis: 'none' };
  }
  if (!loc?.country && !loc?.city && !c.location && !c.headquarters) return { status: 'unverified', basis: 'none' };
  const raw = normText(`${loc?.city || ''} ${loc?.state || ''} ${loc?.country || ''} ${c.location || c.headquarters || ''}`);
  if (geo.scope === 'city') return raw.includes(normText(geo.city)) ? { status: 'verified', basis, detail: geo.city } : { status: 'mismatch', basis };
  if (geo.scope === 'hubs') return geo.hubs.some((h) => h.cities.some((city) => raw.includes(normText(city)))) ? { status: 'verified', basis } : { status: 'mismatch', basis };
  const country = canonCountry(loc?.country || '');
  if (!country) return { status: 'unverified', basis: 'none' };
  return geo.countries.includes(country) ? { status: 'verified', basis, detail: country } : { status: 'mismatch', basis, detail: country };
}

/** v0: proximity not computed (criterion weight is redistributed). */
export function proximityScore() { return null; }

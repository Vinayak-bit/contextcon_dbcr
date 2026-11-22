import { COUNTRIES } from '@shared/catalog.js';
import { Select } from '../../ui';

export const labelOptions = (labels: readonly string[]) => labels.map((label) => ({ id: label, label }));

export function CountryField({ label = 'Country', value, onChange }: {
  label?: string;
  value: string;
  onChange(value: string): void;
}) {
  const countries = value && !COUNTRIES.includes(value) ? [value, ...COUNTRIES] : COUNTRIES;
  return <Select label={label} value={value} onChange={onChange} placeholder="Select a country"
    options={countries.map((country) => ({ value: country, label: country }))} />;
}

export function isWebUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

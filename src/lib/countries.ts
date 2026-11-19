// Country list with dial codes and national number grouping used to format phone numbers as you type.
export interface Country { iso: string; name: string; dial: string; mask: string }

// mask: '#' = digit, spaces are inserted as typed. Max digits = count of '#'.
export const COUNTRIES: Country[] = [
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', mask: '## ### ####' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966', mask: '## ### ####' },
  { iso: 'QA', name: 'Qatar', dial: '974', mask: '#### ####' },
  { iso: 'KW', name: 'Kuwait', dial: '965', mask: '#### ####' },
  { iso: 'BH', name: 'Bahrain', dial: '973', mask: '#### ####' },
  { iso: 'OM', name: 'Oman', dial: '968', mask: '#### ####' },
  { iso: 'IN', name: 'India', dial: '91', mask: '##### #####' },
  { iso: 'PK', name: 'Pakistan', dial: '92', mask: '### #######' },
  { iso: 'BD', name: 'Bangladesh', dial: '880', mask: '####-######' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94', mask: '## ### ####' },
  { iso: 'NP', name: 'Nepal', dial: '977', mask: '###-#######' },
  { iso: 'GB', name: 'United Kingdom', dial: '44', mask: '#### ######' },
  { iso: 'US', name: 'United States', dial: '1', mask: '(###) ###-####' },
  { iso: 'CA', name: 'Canada', dial: '1', mask: '(###) ###-####' },
  { iso: 'AU', name: 'Australia', dial: '61', mask: '### ### ###' },
  { iso: 'NZ', name: 'New Zealand', dial: '64', mask: '## ### ####' },
  { iso: 'SG', name: 'Singapore', dial: '65', mask: '#### ####' },
  { iso: 'MY', name: 'Malaysia', dial: '60', mask: '##-### ####' },
  { iso: 'ID', name: 'Indonesia', dial: '62', mask: '###-####-####' },
  { iso: 'PH', name: 'Philippines', dial: '63', mask: '### ### ####' },
  { iso: 'TH', name: 'Thailand', dial: '66', mask: '## ### ####' },
  { iso: 'VN', name: 'Vietnam', dial: '84', mask: '## ### ## ##' },
  { iso: 'HK', name: 'Hong Kong', dial: '852', mask: '#### ####' },
  { iso: 'JP', name: 'Japan', dial: '81', mask: '##-####-####' },
  { iso: 'KR', name: 'South Korea', dial: '82', mask: '##-####-####' },
  { iso: 'CN', name: 'China', dial: '86', mask: '### #### ####' },
  { iso: 'TR', name: 'Turkey', dial: '90', mask: '### ### ## ##' },
  { iso: 'EG', name: 'Egypt', dial: '20', mask: '### ### ####' },
  { iso: 'MA', name: 'Morocco', dial: '212', mask: '###-######' },
  { iso: 'NG', name: 'Nigeria', dial: '234', mask: '### ### ####' },
  { iso: 'GH', name: 'Ghana', dial: '233', mask: '## ### ####' },
  { iso: 'KE', name: 'Kenya', dial: '254', mask: '### ######' },
  { iso: 'UG', name: 'Uganda', dial: '256', mask: '### ######' },
  { iso: 'TZ', name: 'Tanzania', dial: '255', mask: '### ### ###' },
  { iso: 'ZA', name: 'South Africa', dial: '27', mask: '## ### ####' },
  { iso: 'DE', name: 'Germany', dial: '49', mask: '#### #######' },
  { iso: 'FR', name: 'France', dial: '33', mask: '# ## ## ## ##' },
  { iso: 'ES', name: 'Spain', dial: '34', mask: '### ## ## ##' },
  { iso: 'IT', name: 'Italy', dial: '39', mask: '### ### ####' },
  { iso: 'NL', name: 'Netherlands', dial: '31', mask: '# ########' },
  { iso: 'PT', name: 'Portugal', dial: '351', mask: '### ### ###' },
  { iso: 'CH', name: 'Switzerland', dial: '41', mask: '## ### ## ##' },
  { iso: 'PL', name: 'Poland', dial: '48', mask: '### ### ###' },
  { iso: 'RU', name: 'Russia', dial: '7', mask: '### ###-##-##' },
  { iso: 'UA', name: 'Ukraine', dial: '380', mask: '## ### ## ##' },
  { iso: 'BR', name: 'Brazil', dial: '55', mask: '## #####-####' },
  { iso: 'MX', name: 'Mexico', dial: '52', mask: '## #### ####' },
  { iso: 'AR', name: 'Argentina', dial: '54', mask: '## ####-####' },
  { iso: 'CO', name: 'Colombia', dial: '57', mask: '### ### ####' },
];

export const countryByName = (name?: string | null) => COUNTRIES.find((c) => c.name === name) || COUNTRIES[0];

// Time zone → ISO country (first match wins). Detection runs locally, so nothing about the visitor leaves the browser.
const TZ: Record<string, string> = {
  'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP',
  'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL',
  'Europe/Lisbon': 'PT', 'Europe/Zurich': 'CH', 'Europe/Warsaw': 'PL', 'Europe/Moscow': 'RU', 'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA', 'Europe/Istanbul': 'TR',
  'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
  'Asia/Hong_Kong': 'HK', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Nairobi': 'KE', 'Africa/Kampala': 'UG',
  'Africa/Dar_es_Salaam': 'TZ', 'Africa/Johannesburg': 'ZA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
  'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
};

/** Best guess of the visitor's country from their device time zone, then browser language region. */
export function detectCountry(): { country: Country; source: 'timezone' | 'language' | 'default' } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const iso = TZ[tz];
    const c = iso && COUNTRIES.find((x) => x.iso === iso);
    if (c) return { country: c, source: 'timezone' };
  } catch { /* ignore */ }
  for (const lang of navigator.languages || [navigator.language]) {
    const region = lang.split('-')[1]?.toUpperCase();
    const c = region && COUNTRIES.find((x) => x.iso === region);
    if (c) return { country: c, source: 'language' };
  }
  return { country: COUNTRIES[0], source: 'default' };
}
export const flag = (iso: string) => String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** Formats national digits into the country's mask (drops a leading trunk 0). */
export function formatNational(digits: string, c: Country) {
  let d = digits.replace(/\D/g, '');
  if (d.startsWith('0') && c.dial !== '39') d = d.slice(1);
  const max = (c.mask.match(/#/g) || []).length;
  d = d.slice(0, max);
  let out = '';
  let i = 0;
  for (const ch of c.mask) {
    if (i >= d.length) break;
    if (ch === '#') out += d[i++];
    else out += ch;
  }
  return out;
}

export const fullPhone = (national: string, c: Country) => (national.replace(/\D/g, '') ? `+${c.dial} ${national}` : '');

/** Splits a stored "+971 50 123 4567" back into national part for the given country. */
export function nationalFrom(stored: string | null | undefined, c: Country) {
  if (!stored) return '';
  const s = stored.trim();
  const prefix = `+${c.dial}`;
  const rest = s.startsWith(prefix) ? s.slice(prefix.length) : s.replace(/^\+\d{1,3}/, '');
  return formatNational(rest, c);
}

export const isPhoneComplete = (national: string, c: Country) =>
  national.replace(/\D/g, '').length === (c.mask.match(/#/g) || []).length;

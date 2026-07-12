// Role (position) icons from Community Dragon and country flags from flagcdn.

const ROLE_POS: Record<string, string> = {
  Top: "top",
  Jungle: "jungle",
  Mid: "middle",
  Bot: "bottom",
  Support: "utility",
};

export function roleIcon(role: string | null | undefined): string | null {
  if (!role) return null;
  const pos = ROLE_POS[role];
  if (!pos) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${pos}.png`;
}

// Country name → ISO 3166-1 alpha-2 (covers the countries present in the dataset).
const COUNTRY_ISO: Record<string, string> = {
  "South Korea": "kr", China: "cn", Taiwan: "tw", Vietnam: "vn",
  "United States": "us", Brazil: "br", Turkey: "tr", Germany: "de",
  Denmark: "dk", Russia: "ru", "Hong Kong": "hk", Australia: "au",
  Canada: "ca", Poland: "pl", Sweden: "se", France: "fr", Chile: "cl",
  Argentina: "ar", Thailand: "th", Spain: "es", Lithuania: "lt",
  Philippines: "ph", Japan: "jp", "New Zealand": "nz", Singapore: "sg",
  Netherlands: "nl", "Czech Republic": "cz", "United Kingdom": "gb",
  Ukraine: "ua", Romania: "ro", Peru: "pe", Norway: "no", Mexico: "mx",
  Bulgaria: "bg", Belgium: "be", Venezuela: "ve", Uruguay: "uy",
  Slovenia: "si", Italy: "it", Estonia: "ee", Syria: "sy", Portugal: "pt",
  Malaysia: "my", Latvia: "lv", Hungary: "hu", Greece: "gr", Finland: "fi",
  Croatia: "hr", Colombia: "co", Belarus: "by", Armenia: "am",
};

export function countryFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  const iso = COUNTRY_ISO[country];
  if (!iso) return null;
  return `https://flagcdn.com/w40/${iso}.png`;
}

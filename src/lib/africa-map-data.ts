/**
 * AFRICA_ISO — keyed by 3-digit zero-padded ISO 3166-1 numeric codes
 * (the IDs world-atlas embeds in countries-50m.json). Each entry stores
 * the display name, our internal ISO-2 code (used elsewhere in the app),
 * the region bucket for tinting, and the capital city coordinates
 * [lon, lat] (d3 / GeoJSON convention) used for the pulse dots.
 */

export type Region = 'North' | 'West' | 'East' | 'Central' | 'Southern';

export interface AfricaCountryEntry {
  name: string;
  iso2: string;
  region: Region;
  /** [longitude, latitude] of the capital city. */
  capital: [number, number];
}

export const AFRICA_ISO: Record<string, AfricaCountryEntry> = {
  '012': { name: 'Algeria', iso2: 'DZ', region: 'North', capital: [3.05, 36.75] },
  '024': { name: 'Angola', iso2: 'AO', region: 'Central', capital: [13.23, -8.84] },
  '204': { name: 'Benin', iso2: 'BJ', region: 'West', capital: [2.62, 6.50] },
  '072': { name: 'Botswana', iso2: 'BW', region: 'Southern', capital: [25.92, -24.65] },
  '854': { name: 'Burkina Faso', iso2: 'BF', region: 'West', capital: [-1.52, 12.37] },
  '108': { name: 'Burundi', iso2: 'BI', region: 'East', capital: [29.93, -3.43] },
  '132': { name: 'Cape Verde', iso2: 'CV', region: 'West', capital: [-23.51, 14.93] },
  '120': { name: 'Cameroon', iso2: 'CM', region: 'Central', capital: [11.50, 3.85] },
  '140': { name: 'Central African Republic', iso2: 'CF', region: 'Central', capital: [18.55, 4.39] },
  '148': { name: 'Chad', iso2: 'TD', region: 'Central', capital: [15.04, 12.13] },
  '174': { name: 'Comoros', iso2: 'KM', region: 'East', capital: [43.24, -11.70] },
  '178': { name: 'Republic of the Congo', iso2: 'CG', region: 'Central', capital: [15.27, -4.27] },
  '384': { name: "Côte d'Ivoire", iso2: 'CI', region: 'West', capital: [-5.27, 6.83] },
  '180': { name: 'Democratic Republic of the Congo', iso2: 'CD', region: 'Central', capital: [15.27, -4.32] },
  '262': { name: 'Djibouti', iso2: 'DJ', region: 'East', capital: [43.14, 11.59] },
  '818': { name: 'Egypt', iso2: 'EG', region: 'North', capital: [31.24, 30.05] },
  '226': { name: 'Equatorial Guinea', iso2: 'GQ', region: 'Central', capital: [8.78, 3.75] },
  '232': { name: 'Eritrea', iso2: 'ER', region: 'East', capital: [38.93, 15.32] },
  '748': { name: 'Eswatini', iso2: 'SZ', region: 'Southern', capital: [31.13, -26.32] },
  '231': { name: 'Ethiopia', iso2: 'ET', region: 'East', capital: [38.74, 9.03] },
  '266': { name: 'Gabon', iso2: 'GA', region: 'Central', capital: [9.45, 0.39] },
  '270': { name: 'Gambia', iso2: 'GM', region: 'West', capital: [-16.58, 13.45] },
  '288': { name: 'Ghana', iso2: 'GH', region: 'West', capital: [-0.20, 5.60] },
  '324': { name: 'Guinea', iso2: 'GN', region: 'West', capital: [-13.71, 9.51] },
  '624': { name: 'Guinea-Bissau', iso2: 'GW', region: 'West', capital: [-15.59, 11.86] },
  '404': { name: 'Kenya', iso2: 'KE', region: 'East', capital: [36.82, -1.29] },
  '426': { name: 'Lesotho', iso2: 'LS', region: 'Southern', capital: [27.48, -29.31] },
  '430': { name: 'Liberia', iso2: 'LR', region: 'West', capital: [-10.80, 6.30] },
  '434': { name: 'Libya', iso2: 'LY', region: 'North', capital: [13.18, 32.89] },
  '450': { name: 'Madagascar', iso2: 'MG', region: 'East', capital: [47.52, -18.88] },
  '454': { name: 'Malawi', iso2: 'MW', region: 'East', capital: [33.79, -13.96] },
  '466': { name: 'Mali', iso2: 'ML', region: 'West', capital: [-7.99, 12.65] },
  '478': { name: 'Mauritania', iso2: 'MR', region: 'West', capital: [-15.98, 18.08] },
  '480': { name: 'Mauritius', iso2: 'MU', region: 'East', capital: [57.50, -20.16] },
  '504': { name: 'Morocco', iso2: 'MA', region: 'North', capital: [-6.84, 34.02] },
  '508': { name: 'Mozambique', iso2: 'MZ', region: 'East', capital: [32.58, -25.97] },
  '516': { name: 'Namibia', iso2: 'NA', region: 'Southern', capital: [17.08, -22.56] },
  '562': { name: 'Niger', iso2: 'NE', region: 'West', capital: [2.12, 13.51] },
  '566': { name: 'Nigeria', iso2: 'NG', region: 'West', capital: [7.49, 9.05] },
  '646': { name: 'Rwanda', iso2: 'RW', region: 'East', capital: [30.06, -1.94] },
  '678': { name: 'São Tomé and Príncipe', iso2: 'ST', region: 'Central', capital: [6.73, 0.34] },
  '686': { name: 'Senegal', iso2: 'SN', region: 'West', capital: [-17.45, 14.69] },
  '690': { name: 'Seychelles', iso2: 'SC', region: 'East', capital: [55.45, -4.62] },
  '694': { name: 'Sierra Leone', iso2: 'SL', region: 'West', capital: [-13.23, 8.48] },
  '706': { name: 'Somalia', iso2: 'SO', region: 'East', capital: [45.34, 2.04] },
  '710': { name: 'South Africa', iso2: 'ZA', region: 'Southern', capital: [28.19, -25.75] },
  '728': { name: 'South Sudan', iso2: 'SS', region: 'East', capital: [31.58, 4.85] },
  '729': { name: 'Sudan', iso2: 'SD', region: 'North', capital: [32.56, 15.50] },
  '834': { name: 'Tanzania', iso2: 'TZ', region: 'East', capital: [35.74, -6.16] },
  '768': { name: 'Togo', iso2: 'TG', region: 'West', capital: [1.21, 6.13] },
  '788': { name: 'Tunisia', iso2: 'TN', region: 'North', capital: [10.18, 36.81] },
  '800': { name: 'Uganda', iso2: 'UG', region: 'East', capital: [32.58, 0.32] },
  '894': { name: 'Zambia', iso2: 'ZM', region: 'East', capital: [28.32, -15.41] },
  '716': { name: 'Zimbabwe', iso2: 'ZW', region: 'East', capital: [31.05, -17.83] },
};

export const REGION_HEX: Record<Region, string> = {
  North: '#60A5FA',
  West: '#22C55E',
  East: '#A855F7',
  Central: '#F59E0B',
  Southern: '#F43F5E',
};

export const REGION_TINT: Record<Region, string> = {
  North: 'rgba(96,165,250,0.10)',
  West: 'rgba(34,197,94,0.10)',
  East: 'rgba(168,85,247,0.10)',
  Central: 'rgba(245,158,11,0.10)',
  Southern: 'rgba(244,63,94,0.10)',
};

/** Countries large enough to show a name label inside their outline. */
export const LABELED_COUNTRIES = new Set([
  'Nigeria', 'Egypt', 'Ethiopia', 'Kenya', 'South Africa',
  'Democratic Republic of the Congo', 'Algeria', 'Tanzania', 'Morocco',
  'Angola', 'Mali', 'Niger', 'Chad', 'Sudan', 'Libya', 'Somalia',
  'Madagascar', 'Mozambique', 'Zambia', 'Zimbabwe', 'Ghana', 'Cameroon',
  'Namibia', 'Botswana', 'Uganda', 'Tunisia', 'Senegal', 'South Sudan',
  'Mauritania',
]);

/** Display abbreviations for crowded labels. Empty string means "skip". */
export const LABEL_ABBREV: Record<string, string> = {
  'South Africa': 'S. Africa',
  'Central African Republic': 'CAR',
  'Democratic Republic of the Congo': 'DRC',
  'South Sudan': 'S. Sudan',
  'Republic of the Congo': 'Congo',
  'São Tomé and Príncipe': '',
};

export const padIso = (n: string | number): string =>
  String(n).padStart(3, '0');

export const ALL_AFRICA_ENTRIES: AfricaCountryEntry[] = Object.values(AFRICA_ISO);

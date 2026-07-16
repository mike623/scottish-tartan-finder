// Shared data helpers over the read-only contract at `data/tartans-index.json`.
// See docs/data-schema.md for the TartanRecord shape. Do not modify the JSON file
// from here — packages/scraper owns writing it.

import rawTartans from '../../../../data/tartans-index.json';

export interface TartanRecord {
  ref: number;
  name: string;
  category: string;
  designer: string;
  tartanDate: string;
  registrationDate: string;
  restrictions: string;
  registrationNotes: string;
  detailUrl: string;
  imageUrl: string;
  status: 'DISCOVERED' | 'INDEXED' | 'FAILED' | 'UNAVAILABLE';
  lastIndexedAt: string;
}

const allTartans = rawTartans as TartanRecord[];

// The web only shows records that have been fully indexed (per docs/data-schema.md:
// "Web shows only records with data").
export const tartans: TartanRecord[] = allTartans.filter((t) => t.status === 'INDEXED');

export function getTartanByRef(ref: number): TartanRecord | undefined {
  return tartans.find((t) => t.ref === ref);
}

// Official swatch image. Uses the canonical `/imageCreation` endpoint (the
// `.aspx` form in imageUrl 301-redirects to it — skip the hop). Square image;
// cards crop it with object-fit. Returns null if we somehow have no ref.
export function imageSrc(t: Pick<TartanRecord, 'ref'>, size = 500): string {
  return `https://www.tartanregister.gov.uk/imageCreation?height=${size}&ref=${t.ref}&width=${size}`;
}

export function categoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tartans) {
    counts[t.category] = (counts[t.category] || 0) + 1;
  }
  return counts;
}

export function recentlyAdded(limit: number): TartanRecord[] {
  return [...tartans]
    .sort((a, b) => b.lastIndexedAt.localeCompare(a.lastIndexedAt) || b.ref - a.ref)
    .slice(0, limit);
}

export function similarTartans(t: TartanRecord, limit: number): TartanRecord[] {
  return tartans.filter((o) => o.category === t.category && o.ref !== t.ref).slice(0, limit);
}

export function letterOf(t: TartanRecord): string {
  return t.name.charAt(0).toUpperCase();
}

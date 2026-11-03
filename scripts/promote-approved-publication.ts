import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { publicationBatchSchema } from './lib/publication-batch';
import { ResearchCache, draftSchema, publicSourceUrl, publication } from './lib/city-workflow';

type Kind = 'thrift' | 'market' | 'vintage';
type Seed = {
  cityId: string;
  slug: string;
  name: string;
  kind: Kind;
  address: string;
  city: string;
  state: string;
  zip: string;
  approvedMatchedAddress?: string;
  sourceUrl: string;
  sourceLabel: string;
  description: string;
  tags: string[];
  fixedPoint?: { lat: number; lng: number; sourceUrl: string };
};

const batch = publicationBatchSchema.parse(
  JSON.parse(
    await readFile(
      process.argv.find((a) => a.startsWith('--batch='))?.slice(8) ??
        'research/publication-batch.json',
      'utf8',
    ),
  ),
);
const reviewedAt: string = batch.reviewedAt;
const seeds: Seed[] = batch.seeds;
const additions: Record<
  string,
  Array<{ id: string; url: string; label: string; categories: Kind[] }>
> = {};
for (const seed of seeds) {
  const list = (additions[seed.cityId] ??= []);
  if (!list.some((s) => s.url === seed.sourceUrl))
    list.push({
      id: `source-${createHash('sha256').update(seed.sourceUrl).digest('hex').slice(0, 12)}`,
      url: seed.sourceUrl,
      label: seed.sourceLabel,
      categories: [seed.kind],
    });
}

function csvField(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

async function batchGeocode() {
  const csv = seeds
    .map((seed, index) =>
      [String(index), seed.address.split(',')[0], seed.city, seed.state, seed.zip]
        .map(csvField)
        .join(','),
    )
    .join('\n');
  const digest = createHash('sha256').update(csv).digest('hex');
  const cache = new ResearchCache(path.resolve('.thrifty-data/city-research-cache'), async () => {
    const form = new FormData();
    form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');
    form.append('benchmark', 'Public_AR_Current');
    const response = await fetch(
      'https://geocoding.geo.census.gov/geocoder/locations/addressbatch',
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(60000),
        headers: { 'User-Agent': 'Thrifty city research (https://worklifelm.com)' },
      },
    );
    return { status: response.status, body: await response.text() };
  });
  const result = await cache.get(
    `https://geocoding.geo.census.gov/geocoder/locations/addressbatch?batch=${digest}`,
    365,
  );
  const matches = new Map<number, { lat: number; lng: number }>();
  for (const columns of parseCsv(result.body)) {
    const index = Number(columns[0]);
    if (!Number.isInteger(index) || columns[2] !== 'Match') continue;
    const seed = seeds[index];
    if (columns[3] !== 'Exact' && columns[4] !== seed?.approvedMatchedAddress) continue;
    if (!seed || columns[4]?.split(',').at(-2)?.trim() !== seed.state) continue;
    if (columns[4]?.match(/^\d+/)?.[0] !== seed.address.match(/^\d+/)?.[0]) continue;
    const [lng, lat] = (columns[5] ?? '').split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) matches.set(index, { lat, lng });
  }
  return matches;
}

async function main() {
  const age = (Date.now() - Date.parse(reviewedAt)) / 86400000;
  if (age < 0 || age > 30)
    throw new Error('Batch review date is future or overdue; re-review sources.');
  const matches = await batchGeocode();
  const missing = seeds.filter((seed, index) => !seed.fixedPoint && !matches.has(index));
  if (missing.length)
    throw new Error(`Batch geocoder did not match: ${missing.map((seed) => seed.name).join(', ')}`);
  const writes: Array<{ file: string; body: string }> = [];
  for (const cityId of Object.keys(additions) as Array<keyof typeof additions>) {
    const file = path.resolve('research/cities', `${cityId}.json`);
    const draft = draftSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    for (const source of additions[cityId]) {
      if (!draft.sources.some((item) => publicSourceUrl(item.url) === publicSourceUrl(source.url)))
        draft.sources.push(source);
    }
    const incoming = seeds
      .map((seed, index) => ({ seed, index }))
      .filter(({ seed }) => seed.cityId === cityId)
      .map(({ seed, index }) => {
        const point = seed.fixedPoint ?? matches.get(index)!;
        const coordinateUrl =
          seed.fixedPoint?.sourceUrl ??
          `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({ address: seed.address, benchmark: 'Public_AR_Current', format: 'json' })}`;
        return {
          country: 'US' as const,
          state: seed.state as 'TX' | 'OR',
          place: {
            lat: point.lat,
            lng: point.lng,
            id: `official:${cityId}:${seed.slug}`,
            name: seed.name,
            kind: seed.kind,
            address: seed.address,
            description: seed.description,
            hours: '',
            website: seed.sourceUrl,
            source: 'official' as const,
            sourceLabel: seed.sourceLabel,
            checkedAt: reviewedAt,
            coordinateNote: seed.fixedPoint
              ? 'Approximate public map pin cross-checked against the listed address; confirm the entrance before traveling.'
              : 'Approximate address-based pin from the U.S. Census geocoder; confirm the entrance before traveling.',
            coordinateSourceUrl: coordinateUrl,
            sourceUrl: seed.sourceUrl,
            tags: seed.tags,
          },
          review: {
            status: 'approved' as const,
            reviewer: 'Codex factual review of approved proposal',
            reviewedAt,
            evidence: [
              {
                url: seed.sourceUrl,
                fields: ['name', 'address', 'category'] as const,
                note: `Public source reviewed ${reviewedAt} for identity, location and listing category.`,
              },
              {
                url: coordinateUrl,
                fields: ['coordinates'] as const,
                note: 'Batch-geocoded street address; address-based pin is approximate.',
              },
            ],
          },
        };
      });
    const ids = new Set(incoming.map((c) => c.place.id));
    draft.candidates = [
      ...draft.candidates.filter((c) => !ids.has(String(c.place.id))),
      ...incoming,
    ] as typeof draft.candidates;
    const validated = draftSchema.parse(draft);
    const catalogue = publication(validated);
    writes.push({ file, body: `${JSON.stringify(validated, null, 2)}\n` });
    console.log(`${cityId}: ${catalogue.places.length} validated places`);
  }
  if (process.argv.includes('--apply'))
    for (const write of writes) await writeFile(write.file, write.body);
  else console.log('Dry run: no city plans changed. Pass --apply to stage approved records.');
}
await main();

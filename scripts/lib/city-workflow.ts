import { z } from 'zod';
import { researchLimits } from './research-limits';
import { readFile, writeFile, mkdir, rename, open, unlink, lstat, link } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { cityProfileSchema, usStates, type CityProfile } from '../../src/lib/regions';
import { placeSchema, safeWebsite } from '../../src/lib/discovery';
import { catalogueSchema, type Catalogue } from '../../src/lib/catalogue';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const requiredCategories = ['thrift', 'market', 'vintage'] as const;
const fields = ['name', 'address', 'category', 'coordinates', 'hours', 'season'] as const;
export const draftSchema = z
  .object({
    version: z.literal(1),
    city: cityProfileSchema,
    sources: z
      .array(
        z.object({
          id: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(80),
          url: z.string().url().max(500),
          label: z.string().min(1).max(120),
          categories: z.array(z.enum(requiredCategories)).min(1),
          reviewedHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        }),
      )
      .max(12),
    candidates: z
      .array(
        z.object({
          country: z.literal('US'),
          state: z.enum(usStates),
          place: z.record(z.string(), z.unknown()),
          review: z.object({
            status: z.enum(['pending', 'approved']),
            reviewer: z.string().max(100).default(''),
            reviewedAt: z.iso.date().optional(),
            evidence: z
              .array(
                z.object({
                  url: z.string().url().max(500),
                  fields: z.array(z.enum(fields)).min(1),
                  note: z.string().min(1).max(500),
                }),
              )
              .max(12)
              .default([]),
          }),
        }),
      )
      .max(15),
  })
  .refine(
    (d) => new Set(d.sources.map((s) => s.id)).size === d.sources.length,
    'Duplicate source IDs',
  );
export type CityDraft = z.infer<typeof draftSchema>;
export function newDraft(city: CityProfile): CityDraft {
  return draftSchema.parse({ version: 1, city, sources: [], candidates: [] });
}
export function publicSourceUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== 'https:' ||
    (u.port && u.port !== '443') ||
    u.username ||
    u.password ||
    isIP(u.hostname) ||
    !u.hostname.includes('.') ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)
  )
    throw new Error('Use an HTTPS public source hostname without credentials or a custom port.');
  if (
    [...u.searchParams.keys()].some((k) =>
      /^(key|api[-_]?key|token|access_token|secret|password|signature)$/i.test(k),
    )
  )
    throw new Error('Do not place credentials in research URLs.');
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith('utm_') || key === 'fbclid') u.searchParams.delete(key);
  u.hash = '';
  return u.href;
}
export function publicIP(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  // Only ordinary global-unicast IPv6. Mapped, local, link-local and special ranges fail closed.
  return (
    isIP(ip) === 6 &&
    /^[23]/i.test(ip) &&
    !ip.toLowerCase().startsWith('2001:db8') &&
    !ip.toLowerCase().startsWith('2001:0:')
  );
}
type TransportResult = { status: number; body: string; etag?: string; lastModified?: string };
export async function publicGet(
  url: string,
  headers: Record<string, string>,
): Promise<TransportResult> {
  const u = new URL(publicSourceUrl(url));
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicIP(a.address)))
    throw new Error('Source resolves to a private or unsupported network.');
  const pinned = addresses.find((a) => a.family === 4) ?? addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      u,
      {
        method: 'GET',
        agent: false,
        headers: {
          'User-Agent': 'Thrifty city research (https://worklifelm.com)',
          'Accept-Encoding': 'identity',
          ...headers,
        },
        lookup: (_host, options, cb) => {
          if (options.all) cb(null, [pinned]);
          else cb(null, pinned.address, pinned.family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1024 * 1024) {
            req.destroy(new Error('Source exceeds the 1 MB research limit.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            etag: res.headers.etag,
            lastModified: res.headers['last-modified'],
          }),
        );
      },
    );
    const deadline = setTimeout(() => req.destroy(new Error('Source deadline exceeded.')), 12000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end();
  });
}
export class ResearchBudgetError extends Error {}
type Cached = {
  url: string;
  body: string;
  hash: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
  status: number;
  retryAfter?: number;
};
export class ResearchCache {
  requests = 0;
  constructor(
    readonly directory: string,
    private transport = publicGet,
    private now = Date.now,
    readonly maxRequests = researchLimits.requestsPerCommand,
  ) {}
  private async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(this.directory)).isSymbolicLink())
      throw new Error('Research cache cannot be a symlink.');
  }
  private async reserve() {
    if (this.requests >= this.maxRequests)
      throw new ResearchBudgetError(
        `Run limit reached (${this.maxRequests} requests); reuse the cache or save a handoff.`,
      );
    await this.init();
    const lock = path.join(this.directory, 'budget.lock');
    let handle;
    try {
      handle = await open(lock, 'wx', 0o600);
    } catch {
      throw new ResearchBudgetError('Another research run holds the budget lock.');
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: this.now() }));
      const ledger = path.join(
        this.directory,
        `budget-${new Date(this.now()).toISOString().slice(0, 10)}.json`,
      );
      let count = 0;
      try {
        count = JSON.parse(await readFile(ledger, 'utf8')).requests;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('Budget ledger is unreadable; no network request was made.');
      }
      if (!Number.isInteger(count) || count < 0 || count >= researchLimits.requestsPerUTCDay)
        throw new ResearchBudgetError(
          `Daily limit reached (${researchLimits.requestsPerUTCDay} requests per UTC day). Continue after the next reset.`,
        );
      await writeFile(ledger, JSON.stringify({ requests: count + 1 }), { mode: 0o600 });
      this.requests++;
    } finally {
      await handle.close();
      await unlink(lock);
    }
  }
  async get(raw: string, days = researchLimits.sourceCacheDays, refresh = false) {
    const url = publicSourceUrl(raw);
    await this.init();
    const file = path.join(this.directory, `${hash(url)}.json`);
    let cached: Cached | undefined;
    try {
      cached = JSON.parse(await readFile(file, 'utf8'));
      if (cached?.url !== url) throw new Error('Cache URL mismatch');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (cached?.retryAfter && cached.retryAfter > this.now())
      throw new Error('Source is cooling down after a previous failure.');
    if (
      cached &&
      cached.status >= 200 &&
      cached.status < 300 &&
      !refresh &&
      this.now() - cached.fetchedAt < days * 86400000
    )
      return { ...cached, cacheHit: true, changed: false, file };
    await this.reserve();
    const headers: Record<string, string> = {};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    try {
      const result = await this.transport(url, headers);
      if (result.status === 304 && cached) {
        const value = { ...cached, fetchedAt: this.now(), retryAfter: undefined };
        await this.save(file, value);
        return { ...value, cacheHit: false, changed: false, file };
      }
      if (result.status < 200 || result.status >= 300)
        throw new Error(
          `HTTP ${result.status}; redirects and retries require explicit source review.`,
        );
      if (Buffer.byteLength(result.body) > 1024 * 1024)
        throw new Error('Source exceeds the 1 MB research limit.');
      const value: Cached = {
        url,
        body: result.body,
        hash: hash(result.body),
        etag: result.etag,
        lastModified: result.lastModified,
        fetchedAt: this.now(),
        status: result.status,
      };
      await this.save(file, value);
      return { ...value, cacheHit: false, changed: cached?.hash !== value.hash, file };
    } catch (error) {
      // Persist failure cooldowns even on the first request; repeated CLI runs cannot hammer a failed source.
      await this.save(file, {
        ...(cached ?? { url, body: '', hash: hash(''), fetchedAt: 0, status: 0 }),
        retryAfter: this.now() + 3600000,
      });
      throw error;
    }
  }
  async peek(raw: string): Promise<Cached> {
    const url = publicSourceUrl(raw);
    const file = path.join(this.directory, `${hash(url)}.json`);
    const value: Cached = JSON.parse(await readFile(file, 'utf8'));
    if (value.url !== url) throw new Error('Cache URL mismatch');
    return value;
  }
  private async save(file: string, value: Cached) {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
    await rename(temp, file);
  }
}
export function draftStatus(draft: CityDraft) {
  const approved = draft.candidates.filter((c) => c.review.status === 'approved');
  const counts = Object.fromEntries(
    requiredCategories.map((k) => [k, approved.filter((c) => c.place.kind === k).length]),
  );
  return {
    city: draft.city.id,
    approved: approved.length,
    pending: draft.candidates.length - approved.length,
    counts,
    targetPerCategory: 3,
    ready: requiredCategories.every((k) => counts[k] >= 3),
  };
}
export function publication(draft: CityDraft, now = new Date()): Catalogue {
  const d = draftSchema.parse(draft);
  const status = draftStatus(d);
  if (!status.ready)
    throw new Error(
      'Publication requires at least three approved places in each of thrift, market and vintage.',
    );
  const sourceUrls = new Set(d.sources.map((s) => publicSourceUrl(s.url)));
  const places = d.candidates
    .filter((c) => c.review.status === 'approved')
    .map((c) => {
      const p = placeSchema.parse(c.place);
      if (c.state !== d.city.state || c.country !== 'US')
        throw new Error(`${p.id}: country/state differs from the city plan`);
      if (!p.id.startsWith(`official:${d.city.id}:`))
        throw new Error('New city records must use city-scoped stable IDs.');
      if (!c.review.reviewer.trim() || !c.review.reviewedAt || c.review.reviewedAt !== p.checkedAt)
        throw new Error(`${p.id}: explicit factual review and matching checkedAt are required`);
      const age =
        (Date.parse(now.toISOString().slice(0, 10)) - Date.parse(p.checkedAt!)) / 86400000;
      if (age < 0 || age > 30) throw new Error(`${p.id}: future or overdue review date`);
      if (!sourceUrls.has(publicSourceUrl(p.sourceUrl)))
        throw new Error(`${p.id}: official source is not registered in this plan`);
      const evidenced = new Set(
        c.review.evidence
          .filter((e) => sourceUrls.has(publicSourceUrl(e.url)) || e.url === p.coordinateSourceUrl)
          .flatMap((e) => e.fields),
      );
      for (const key of [
        'name',
        'address',
        'category',
        'coordinates',
        ...(p.hours ? ['hours'] : []),
        ...(p.season ? ['season'] : []),
      ])
        if (!evidenced.has(key as (typeof fields)[number]))
          throw new Error(`${p.id}: missing ${key} evidence`);
      if (p.season && p.season.timezone !== d.city.timezone)
        throw new Error(`${p.id}: use the destination city's timezone`);
      return { ...p, timezone: d.city.timezone };
    });
  return catalogueSchema.parse({
    version: 1,
    region: `${d.city.city}, ${d.city.state}`,
    cityProfile: d.city,
    reviewedAt: places.map((p) => p.checkedAt!).sort()[0],
    reviewIntervalDays: 30,
    places,
  });
}
export function censusProposal(raw: unknown, address: string, state: string) {
  const r = z
    .object({
      result: z.object({
        addressMatches: z.array(
          z.object({
            matchedAddress: z.string(),
            coordinates: z.object({ x: z.number(), y: z.number() }),
            addressComponents: z.object({ state: z.string() }),
          }),
        ),
      }),
    })
    .parse(raw);
  if (r.result.addressMatches.length !== 1)
    throw new Error('Geocoder needs one unambiguous match; review manually.');
  const match = r.result.addressMatches[0];
  if (match.addressComponents.state !== state)
    throw new Error('Geocoder state mismatch; do not copy this pin.');
  const identity = (text: string) => {
    const m = text
      .toUpperCase()
      .match(/^\s*(\d+[A-Z]?)\s+(?:(NORTH|SOUTH|EAST|WEST|NE|NW|SE|SW|N|S|E|W)\b)?/);
    return m
      ? [
          m[1],
          ({ NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W' } as Record<string, string>)[m[2]] ??
            m[2] ??
            '',
        ].join('|')
      : null;
  };
  if (!identity(address) || identity(address) !== identity(match.matchedAddress))
    throw new Error('Geocoder house-number/street-direction mismatch; review manually.');
  return {
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    matchedAddress: match.matchedAddress,
    note: 'Unreviewed address-based coordinate proposal. Confirm the entrance and state before copying.',
  };
}
export async function publishDraft(
  draft: CityDraft,
  root: string,
  replace = false,
  now = new Date(),
) {
  const value = publication(draft, now);
  const target = path.join(root, 'data/cities', `${value.cityProfile.id}.json`);
  if (value.cityProfile.id === 'denver-co')
    throw new Error('Maintain the existing Denver file through its documented review process.');
  await mkdir(path.dirname(target), { recursive: true });
  const stat = await lstat(target).catch(() => undefined);
  if (stat?.isSymbolicLink()) throw new Error('Published city file cannot be a symlink.');
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  try {
    if (replace) await rename(temp, target);
    else await link(temp, target);
  } finally {
    await unlink(temp).catch(() => {});
  }
  return target;
}

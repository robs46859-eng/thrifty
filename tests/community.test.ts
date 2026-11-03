import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AuthStore, type Account } from '../server/auth-store';
import { AuthService } from '../server/auth';
import { CommunityStore } from '../server/community-store';
import { createApp } from '../server/app';
import { reportInputSchema } from '../src/lib/community';
const origin = 'http://thrifty.test',
  now = Date.parse('2026-11-01T18:00:00Z'),
  placeId = 'official:boss-vintage';
const input = {
  placeId,
  kind: 'parking',
  details: 'Side street parking was available.',
  observedOn: '2026-11-01',
  weekdays: [],
};
function fixture() {
  const store = new AuthStore();
  const auth = new AuthService({
    store,
    origin,
    clientId: 'test.apps.googleusercontent.com',
    now: () => now,
  });
  const app = createApp({}, fetch, origin, auth),
    community = new CommunityStore(store.db);
  const member = (email: string) => {
    const user = store.loginEmail(email),
      session = store.createSession(user, undefined, now);
    return {
      user,
      cookie: `thrifty_session=${session.raw}`,
      post: (url: string) =>
        request(app)
          .post(url)
          .set('Origin', origin)
          .set('Cookie', `thrifty_session=${session.raw}`)
          .set('X-CSRF-Token', session.csrf),
    };
  };
  return { app, store, community, member };
}
describe('shared community reports', () => {
  it('requires sign-in, same-origin CSRF and a real reviewed place', async () => {
    const f = fixture(),
      a = f.member('alice@example.com');
    expect((await request(f.app).post('/api/community/reports').send(input)).status).toBe(401);
    expect(
      (
        await request(f.app)
          .post('/api/community/reports')
          .set('Origin', origin)
          .set('Cookie', a.cookie)
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (await a.post('/api/community/reports').send({ ...input, placeId: 'sample:made-up' })).status,
    ).toBe(404);
    expect(
      (
        await a
          .post('/api/community/reports')
          .send({ ...input, user_id: 'another-member', admin: true })
      ).status,
    ).toBe(400);
    expect(
      (await a.post('/api/community/reports').send({ ...input, details: 'x'.repeat(9000) })).status,
    ).toBe(413);
  });
  it('shares reports across accounts without exposing account identifiers, names or emails', async () => {
    const f = fixture(),
      a = f.member('alice-private@example.com'),
      b = f.member('bob-private@example.com');
    const created = await a.post('/api/community/reports').send(input);
    expect(created.status).toBe(200);
    const read = await request(f.app).get(`/api/community/reports?placeId=${placeId}`);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(read.body.reports[0]).toMatchObject({
      details: input.details,
      isMine: false,
      hidden: false,
    });
    const serialized = JSON.stringify(read.body);
    expect(serialized).not.toContain(a.user.email);
    expect(serialized).not.toContain(a.user.id);
    expect(serialized).not.toContain('Alice');
    expect(
      (
        await request(f.app)
          .get(`/api/community/reports?placeId=${placeId}`)
          .set('Cookie', b.cookie)
      ).body.reports,
    ).toHaveLength(1);
    expect(
      (
        await request(f.app)
          .get(`/api/community/reports?placeId=${placeId}`)
          .set('Cookie', a.cookie)
      ).body.reports[0].isMine,
    ).toBe(true);
  });
  it('round trips floor tiles and rejects ambiguous, oversized, or misplaced plans', async () => {
    const f = fixture(),
      a = f.member('layout@example.com');
    const layout = [
      { cell: 0, label: 'Sewing supplies' },
      { cell: 41, label: 'Exit' },
    ];
    const payload = { ...input, kind: 'layout', layout };
    expect((await a.post('/api/community/reports').send(payload)).status).toBe(200);
    const read = await request(f.app).get('/api/community/reports').query({ placeId });
    expect(read.body.reports[0].layout).toEqual(layout);
    for (const invalid of [
      { ...payload, kind: 'parking' },
      { ...payload, layout: [] },
      { ...payload, layout: [layout[0], layout[0]] },
      { ...payload, layout: [{ cell: 42, label: 'Exit' }] },
      { ...payload, layout: [{ cell: 0, label: ' '.repeat(5) }] },
      { ...payload, layout: [{ cell: 0, label: 'x'.repeat(41) }] },
    ])
      expect((await a.post('/api/community/reports').send(invalid)).status).toBe(400);
  });
  it('supports all requested report categories and validates category-specific fields', () => {
    const base = { ...input };
    for (const report of [
      { ...base, kind: 'restock', weekdays: ['Tuesday'] },
      { ...base, kind: 'discount', appliesOn: '2026-11-05' },
      { ...base, kind: 'closure', closureStatus: 'temporarily_closed' },
      { ...base, kind: 'holiday_hours', appliesOn: '2026-11-26', timeWindow: 'Closed' },
      { ...base, kind: 'prices', category: 'Clothing', priceMin: 3, priceMax: 12 },
      { ...base, kind: 'layout', area: 'Rear aisle' },
      { ...base, kind: 'rating', rating: 4 },
      { ...base, kind: 'parking' },
      { ...base, kind: 'find', itemName: 'Wool coat', priceMin: 10, priceMax: 10 },
      { ...base, kind: 'accessibility' },
    ])
      expect(reportInputSchema.safeParse(report).success).toBe(true);
    for (const report of [
      { ...base, kind: 'prices', category: 'Clothing', priceMin: 20, priceMax: 10 },
      { ...base, kind: 'rating', rating: 6 },
      { ...base, kind: 'restock' },
      { ...base, kind: 'holiday_hours' },
      { ...base, kind: 'find', itemName: 'Chair', appliesOn: '2027-01-01' },
    ])
      expect(reportInputSchema.safeParse(report).success).toBe(false);
  });
  it('counts one rating per member and omits expired findings and ratings from summaries', () => {
    const f = fixture(),
      a = f.member('a@example.com').user,
      b = f.member('b@example.com').user;
    f.community.create(a, { ...input, kind: 'rating', rating: 1 }, now);
    f.community.create(a, { ...input, kind: 'rating', rating: 5 }, now + 1);
    f.community.create(b, { ...input, kind: 'rating', rating: 3 }, now + 2);
    f.community.create(b, { ...input, kind: 'find', itemName: 'Copper pan' }, now + 3);
    expect(f.community.summaries([placeId], now + 4)[placeId]).toMatchObject({
      averageRating: 4,
      ratingCount: 2,
      count: 3,
    });
    expect(f.community.summaries([placeId], now + 3 * 86400000)[placeId]).toMatchObject({
      count: 2,
      signals: [],
    });
    expect(
      f.community.summaries([placeId], now + 181 * 86400000)[placeId].averageRating,
    ).toBeNull();
  });
  it('rejects future observations, old short-lived reports and far-future schedule dates', () => {
    const f = fixture(),
      a = f.member('a@example.com').user;
    expect(() => f.community.create(a, { ...input, observedOn: '2026-11-02' }, now)).toThrow(
      'past 30 days',
    );
    expect(() =>
      f.community.create(
        a,
        { ...input, kind: 'find', itemName: 'Lamp', observedOn: '2026-10-25' },
        now,
      ),
    ).toThrow('too old');
    expect(() =>
      f.community.create(
        a,
        { ...input, kind: 'holiday_hours', appliesOn: '2027-12-25', timeWindow: 'Closed' },
        now,
      ),
    ).toThrow('90 days');
  });
  it('deduplicates confirmations, supports changing/removing a vote and forbids self-confirmation', () => {
    const f = fixture(),
      a = f.member('a@example.com').user,
      b = f.member('b@example.com').user;
    const id = f.community.create(a, input, now);
    expect(() => f.community.vote(a, id, 'confirm', now)).toThrow('own update');
    f.community.vote(b, id, 'confirm', now);
    expect(f.community.list(placeId, b, now).reports[0].confirmations).toBe(1);
    f.community.vote(b, id, 'dispute', now);
    expect(f.community.list(placeId, b, now).reports[0]).toMatchObject({
      confirmations: 0,
      disputes: 1,
      myVote: 'dispute',
    });
    f.community.vote(b, id, 'dispute', now);
    expect(f.community.list(placeId, b, now).reports[0].disputes).toBe(0);
  });
  it('hides reports after three distinct flags and lets only admin restore/moderate them', async () => {
    const f = fixture(),
      a = f.member('a@example.com'),
      admin = f.member('rob@virtuapet.com');
    const id = f.community.create(a.user, input, now);
    for (const email of ['b@example.com', 'c@example.com', 'd@example.com'])
      f.community.flag(f.member(email).user, id, 'inaccurate', now);
    expect(f.community.list(placeId, undefined, now).reports).toHaveLength(0);
    expect(f.community.list(placeId, a.user, now).reports[0].hidden).toBe(true);
    expect(
      (await a.post(`/api/community/reports/${id}/moderate`).send({ action: 'restore' })).status,
    ).toBe(403);
    expect(
      (
        await request(f.app)
          .get(`/api/community/moderation?placeId=${placeId}`)
          .set('Cookie', a.cookie)
      ).status,
    ).toBe(403);
    expect(f.community.moderation(admin.user, placeId, now)).toHaveLength(1);
    f.community.moderate(admin.user, id, 'restore', now + 1);
    expect(f.community.list(placeId, undefined, now + 2).reports).toHaveLength(1);
    expect(f.community.moderation(admin.user, placeId, now + 2)).toHaveLength(0);
    expect(
      f.store.db
        .prepare("SELECT COUNT(*) AS n FROM community_audit WHERE action='moderate:restore'")
        .get()!.n,
    ).toBe(1);
  });
  it('ignores repeat flags by one member and restricts withdrawal to the author', () => {
    const f = fixture(),
      a = f.member('a@example.com').user,
      b = f.member('b@example.com').user;
    const id = f.community.create(a, input, now);
    for (let n = 0; n < 4; n++) f.community.flag(b, id, 'spam', now);
    expect(f.community.list(placeId, undefined, now).reports[0].flags).toBe(1);
    expect(() => f.community.withdraw(b, id, now)).toThrow('Only the author');
    f.community.withdraw(a, id, now);
    expect(f.community.list(placeId, undefined, now).reports).toHaveLength(0);
  });
  it('enforces posting and interaction quotas atomically, independently of scan credits', () => {
    const f = fixture(),
      a = f.member('a@example.com').user,
      admin = f.member('rob@virtuapet.com').user;
    for (let n = 0; n < 3; n++) f.community.create(a, input, now);
    expect(() => f.community.create(a, input, now)).toThrow('per-minute');
    for (let n = 3; n < 10; n++) f.community.create(a, input, now + n * 60001);
    expect(() => f.community.create(a, input, now + 20 * 60000)).toThrow('daily');
    const id = f.community.create(admin, input, now);
    for (let n = 0; n < 60; n++) f.community.vote(a, id, 'confirm', now + 30 * 60000);
    expect(() => f.community.vote(a, id, 'confirm', now + 30 * 60000)).toThrow('hourly');
    expect(f.store.db.prepare('SELECT COUNT(*) AS n FROM scans').get()!.n).toBe(0);
  });
  it('persists reports and migration state across private database reopen', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'thrifty-community-'));
    try {
      const file = path.join(directory, 'auth.sqlite'),
        first = new AuthStore(file),
        user = first.loginEmail('a@example.com');
      new CommunityStore(first.db).create(user, input, now);
      first.close();
      const second = new AuthStore(file),
        reports = new CommunityStore(second.db).list(placeId, undefined, now);
      expect(reports.reports).toHaveLength(1);
      second.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('fails closed when shared storage is unavailable and bounds public lookups', async () => {
    expect(
      (
        await request(createApp({}, fetch, origin, new AuthService({ origin }))).get(
          `/api/community/reports?placeId=${placeId}`,
        )
      ).status,
    ).toBe(503);
    const f = fixture();
    expect(
      (
        await request(f.app).get(
          '/api/community/summary?placeIds=' +
            Array.from({ length: 51 }, (_, i) => 'x' + i).join(','),
        )
      ).status,
    ).toBe(400);
    expect((await request(f.app).get('/api/community/summary?placeIds=sample:fake')).status).toBe(
      404,
    );
  });
});

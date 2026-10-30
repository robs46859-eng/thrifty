import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { AuthService, runtimeAuth, type GoogleIdentity } from '../server/auth';
import { AuthStore, ADMIN_EMAIL } from '../server/auth-store';
import { createApp } from '../server/app';
const origin = 'http://thrifty.test';
const clientId = 'test.apps.googleusercontent.com';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1kAAAAASUVORK5CYII=';
const stores: AuthStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function fixture(
  options: {
    file?: string;
    cloud?: typeof fetch;
    senderFails?: boolean;
    verifiedIdentity?: GoogleIdentity;
    realGoogle?: boolean;
    provider?: 'manual' | 'google';
  } = {},
) {
  const store = new AuthStore(options.file);
  stores.push(store);
  let now = Date.now();
  const deliveries: { email: string; code: string }[] = [];
  const cloud =
    options.cloud ??
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          responses: [{ labelAnnotations: [{ description: 'fleece', score: 0.9 }] }],
        }),
        { status: 200 },
      ),
    );
  const auth = new AuthService({
    store,
    clientId,
    origin,
    now: () => now,
    sendCode: async (email, code) => {
      if (options.senderFails) throw new Error('SMTP secret');
      deliveries.push({ email, code });
    },
    ...(options.realGoogle
      ? {}
      : { verifyGoogle: async (credential) => options.verifiedIdentity ?? JSON.parse(credential) }),
  });
  const app = createApp(
    { provider: options.provider ?? 'google', googleKey: 'test-provider-key' },
    cloud,
    origin,
    auth,
  );
  const agent = request.agent(app);
  const bootstrap = async () => (await agent.get('/api/auth/session')).body;
  const post = (url: string, csrf: string) =>
    agent.post(url).set('Origin', origin).set('X-CSRF-Token', csrf);
  async function emailLogin(email = 'shopper@example.com') {
    const state = await bootstrap();
    expect((await post('/api/auth/email/request', state.csrf).send({ email })).status).toBe(200);
    const login = await post('/api/auth/email/verify', state.csrf).send({
      email,
      code: deliveries.at(-1)!.code,
    });
    expect(login.status).toBe(200);
    return login;
  }
  return {
    store,
    auth,
    app,
    agent,
    bootstrap,
    post,
    emailLogin,
    deliveries,
    cloud,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe('verified sign-in and sessions', () => {
  it('blocks anonymous scanning before provider access and locks unconfigured auth', async () => {
    const f = fixture();
    const anonymous = await request(f.app)
      .post('/api/identify')
      .send({ image: png, useCloud: true });
    expect(anonymous.status).toBe(401);
    expect(f.cloud).not.toHaveBeenCalled();
    const missing = await request(
      createApp(
        { provider: 'google', googleKey: 'secret' },
        f.cloud,
        origin,
        new AuthService({ origin }),
      ),
    )
      .post('/api/identify')
      .send({ image: png, useCloud: true });
    expect(missing.status).toBe(503);
    expect(f.cloud).not.toHaveBeenCalled();
  });
  it('emails a code without returning it, verifies mailbox ownership and rotates opaque sessions', async () => {
    const f = fixture();
    const pre = await f.bootstrap();
    const response = await f
      .post('/api/auth/email/request', pre.csrf)
      .send({ email: ' Shopper@Example.com ' });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(f.deliveries[0].code);
    const login = await f
      .post('/api/auth/email/verify', pre.csrf)
      .send({ email: 'shopper@example.com', code: f.deliveries[0].code });
    expect(login.status).toBe(200);
    expect(login.body.user.admin).toBe(false);
    expect(login.body.usage.remaining).toBe(10);
    const cookies = login.headers['set-cookie'];
    const cookie = (Array.isArray(cookies) ? cookies : [cookies]).find((value: string) =>
      value.startsWith('thrifty_session='),
    );
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain(f.deliveries[0].code);
    const row = f.store.db.prepare('SELECT id FROM sessions').get()!;
    expect(cookie).not.toContain(String(row.id));
    expect((await f.agent.get('/api/auth/session')).body.user.email).toBe('shopper@example.com');
    expect(
      (
        await f
          .post('/api/auth/email/verify', pre.csrf)
          .send({ email: 'shopper@example.com', code: f.deliveries[0].code })
      ).status,
    ).not.toBe(200);
  });
  it('requires CSRF and correct origin for authentication, scanning and logout', async () => {
    const f = fixture();
    const state = await f.bootstrap();
    expect(
      (
        await f.agent
          .post('/api/auth/email/request')
          .set('Origin', origin)
          .send({ email: ADMIN_EMAIL })
      ).status,
    ).toBe(403);
    expect(
      (
        await f
          .post('/api/auth/email/request', state.csrf)
          .set('Origin', 'https://evil.example')
          .send({ email: ADMIN_EMAIL })
      ).status,
    ).toBe(403);
    const login = await f.emailLogin();
    expect(
      (
        await f.agent
          .post('/api/identify')
          .set('Origin', origin)
          .send({ image: png, useCloud: true })
      ).status,
    ).toBe(403);
    expect((await f.agent.post('/api/auth/logout').set('Origin', origin).send({})).status).toBe(
      403,
    );
    expect((await f.post('/api/auth/logout', login.body.csrf).send({})).status).toBe(200);
    expect((await f.agent.get('/api/auth/session')).body.authenticated).toBe(false);
    expect(
      (await f.post('/api/identify', login.body.csrf).send({ image: png, useCloud: true })).status,
    ).toBe(401);
  });
  it('expires codes and sessions, binds codes to the requesting browser, and stops brute force', async () => {
    const f = fixture();
    const state = await f.bootstrap();
    await f.post('/api/auth/email/request', state.csrf).send({ email: ADMIN_EMAIL });
    const code = f.deliveries[0].code;
    expect(
      (
        await request(f.app)
          .post('/api/auth/email/verify')
          .set('Origin', origin)
          .set('X-CSRF-Token', state.csrf)
          .send({ email: ADMIN_EMAIL, code })
      ).status,
    ).toBe(403);
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++)
      expect(
        (
          await f
            .post('/api/auth/email/verify', state.csrf)
            .send({ email: ADMIN_EMAIL, code: wrong })
        ).status,
      ).toBe(401);
    expect(
      (await f.post('/api/auth/email/verify', state.csrf).send({ email: ADMIN_EMAIL, code }))
        .status,
    ).toBe(401);
    f.advance(11 * 60000);
    expect(
      (await f.post('/api/auth/email/verify', state.csrf).send({ email: ADMIN_EMAIL, code }))
        .status,
    ).toBe(403);
    await f.emailLogin();
    f.advance(13 * 60 * 60000);
    expect((await f.agent.get('/api/auth/session')).body.authenticated).toBe(false);
  });
  it('invalidates earlier codes on resend and rejects an expired code within a still-valid state', async () => {
    const f = fixture();
    const state = await f.bootstrap();
    await f.post('/api/auth/email/request', state.csrf).send({ email: 'user@example.com' });
    const old = f.deliveries[0].code;
    await f.post('/api/auth/email/request', state.csrf).send({ email: 'user@example.com' });
    if (old !== f.deliveries[1].code)
      expect(
        (
          await f
            .post('/api/auth/email/verify', state.csrf)
            .send({ email: 'user@example.com', code: old })
        ).status,
      ).toBe(401);
    f.store.db.prepare('UPDATE email_codes SET expires=0').run();
    expect(
      (
        await f
          .post('/api/auth/email/verify', state.csrf)
          .send({ email: 'user@example.com', code: f.deliveries[1].code })
      ).status,
    ).toBe(401);
  });
  it('never pretends to send a code when delivery fails and limits mail abuse', async () => {
    const failed = fixture({ senderFails: true });
    const state = await failed.bootstrap();
    const response = await failed
      .post('/api/auth/email/request', state.csrf)
      .send({ email: ADMIN_EMAIL });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('SMTP secret');
    expect(failed.store.db.prepare('SELECT COUNT(*) AS count FROM email_codes').get()!.count).toBe(
      0,
    );
    const f = fixture();
    const pre = await f.bootstrap();
    for (let i = 0; i < 3; i++)
      expect(
        (await f.post('/api/auth/email/request', pre.csrf).send({ email: 'same@example.com' }))
          .status,
      ).toBe(200);
    expect(
      (await f.post('/api/auth/email/request', pre.csrf).send({ email: 'same@example.com' }))
        .status,
    ).toBe(429);
  });
  it('uses Secure host-only session cookies on HTTPS origins', async () => {
    const store = new AuthStore();
    stores.push(store);
    const auth = new AuthService({ store, origin: 'https://worklifelm.com', clientId });
    const response = await request(createApp({}, fetch, 'https://worklifelm.com', auth)).get(
      '/api/auth/session',
    );
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('__Host-thrifty_login=');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
  });
});
describe('Google identity and admin authority', () => {
  it('ignores client supplied admin/email flags, requires a verified identity and a bound nonce', async () => {
    const f = fixture();
    const state = await f.bootstrap();
    const identity = {
      sub: 'google-1',
      email: 'regular@gmail.com',
      email_verified: true,
      nonce: state.nonce,
    };
    const response = await f
      .post('/api/auth/google', state.csrf)
      .send({ credential: JSON.stringify(identity), email: ADMIN_EMAIL, admin: true });
    expect(response.status).toBe(200);
    expect(response.body.user.admin).toBe(false);
    expect(response.body.user.email).toBe('regular@gmail.com');
    const bad = fixture();
    const pre = await bad.bootstrap();
    for (const changed of [
      { email_verified: false },
      { nonce: 'wrong' },
      { email: 'invalid' },
      { sub: '' },
    ])
      expect(
        (
          await bad
            .post('/api/auth/google', pre.csrf)
            .send({ credential: JSON.stringify({ ...identity, nonce: pre.nonce, ...changed }) })
        ).status,
      ).toBe(401);
  });
  it('requires mailbox proof for non-Google-hosted email, including the admin address', async () => {
    const f = fixture();
    const state = await f.bootstrap();
    const response = await f.post('/api/auth/google', state.csrf).send({
      credential: JSON.stringify({
        sub: 'third-party',
        email: ADMIN_EMAIL,
        email_verified: true,
        nonce: state.nonce,
      }),
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    const login = await f.emailLogin(ADMIN_EMAIL);
    expect(login.body.user.admin).toBe(true);
    expect(login.body.usage.unlimited).toBe(true);
  });
  it('grants the exemption only to the exact verified admin mailbox or matching Workspace identity', async () => {
    const f = fixture();
    const state = await f.bootstrap();
    const login = await f.post('/api/auth/google', state.csrf).send({
      credential: JSON.stringify({
        sub: 'admin-sub',
        email: ADMIN_EMAIL,
        email_verified: true,
        hd: 'virtuapet.com',
        nonce: state.nonce,
      }),
    });
    expect(login.status).toBe(200);
    expect(login.body.user.admin).toBe(true);
    const similar = fixture();
    const other = await similar.emailLogin('rob+fake@virtuapet.com');
    expect(other.body.user.admin).toBe(false);
  });
  it('rejects replayed Google challenges and conflicting subject links', async () => {
    const f = fixture();
    const state = await f.bootstrap();
    const credential = JSON.stringify({
      sub: 's1',
      email: 'user@gmail.com',
      email_verified: true,
      nonce: state.nonce,
    });
    const results = await Promise.all([
      f.post('/api/auth/google', state.csrf).send({ credential }),
      f.post('/api/auth/google', state.csrf).send({ credential }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(f.store.db.prepare('SELECT COUNT(*) AS count FROM sessions').get()!.count).toBe(1);
    expect(() => f.store.loginGoogle('different', 'user@gmail.com', 'Someone')).toThrow(
      'email sign-in code',
    );
  });
  it('checks real JWT signatures, audience, issuer, expiry and nonce through Google’s library', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
      certs: { test: publicKey.export({ format: 'pem', type: 'spki' }).toString() },
      format: 'PEM' as never,
    });
    const f = fixture({ realGoogle: true });
    const state = await f.bootstrap();
    const sec = Math.floor(Date.now() / 1000);
    const signed = (change: Record<string, unknown> = {}, wrongSignature = false) => {
      const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          aud: clientId,
          sub: 'signed-sub',
          email: 'signed@gmail.com',
          email_verified: true,
          nonce: state.nonce,
          iat: sec,
          exp: sec + 3600,
          ...change,
        }),
      ).toString('base64url');
      return `${head}.${payload}.${wrongSignature ? 'bad' : sign('RSA-SHA256', Buffer.from(`${head}.${payload}`), privateKey).toString('base64url')}`;
    };
    for (const credential of [
      signed({ aud: 'wrong-client' }),
      signed({ iss: 'https://evil.example' }),
      signed({ iat: sec - 2000, exp: sec - 1000 }),
      signed({}, true),
    ])
      expect((await f.post('/api/auth/google', state.csrf).send({ credential })).status).toBe(401);
    expect(
      (await f.post('/api/auth/google', state.csrf).send({ credential: signed() })).status,
    ).toBe(200);
  });
});
describe('server-enforced cloud scan quotas', () => {
  it('enforces 3 per rolling minute and 10 per UTC day and counts possible billable failures', async () => {
    const f = fixture({ cloud: vi.fn().mockRejectedValue(new Error('provider timeout')) });
    const login = await f.emailLogin();
    const scan = () =>
      f.post('/api/identify', login.body.csrf).send({ image: png, useCloud: true });
    for (let i = 0; i < 3; i++) expect((await scan()).status).toBe(200);
    const burst = await scan();
    expect(burst.status).toBe(429);
    expect(burst.body.code).toBe('MINUTE_SCAN_LIMIT');
    expect(Number(burst.headers['retry-after'])).toBeGreaterThan(0);
    expect(f.cloud).toHaveBeenCalledTimes(3);
    f.advance(60001);
    for (let i = 0; i < 3; i++) await scan();
    f.advance(60001);
    for (let i = 0; i < 3; i++) await scan();
    f.advance(60001);
    await scan();
    const daily = await scan();
    expect(daily.status).toBe(429);
    expect(daily.body.code).toBe('DAILY_SCAN_LIMIT');
    expect(f.cloud).toHaveBeenCalledTimes(10);
    expect((await f.agent.get('/api/auth/session')).body.usage.remaining).toBe(0);
  });
  it('never charges quota for manual calls, missing providers or invalid images', async () => {
    const f = fixture();
    const login = await f.emailLogin();
    expect(
      (await f.post('/api/identify', login.body.csrf).send({ image: png, useCloud: false })).status,
    ).toBe(200);
    expect(
      (await f.post('/api/identify', login.body.csrf).send({ image: 'invalid', useCloud: true }))
        .status,
    ).toBe(400);
    expect(f.cloud).not.toHaveBeenCalled();
    expect((await f.agent.get('/api/auth/session')).body.usage.remaining).toBe(10);
    const manual = fixture({ provider: 'manual' });
    const other = await manual.emailLogin();
    await manual.post('/api/identify', other.body.csrf).send({ image: png, useCloud: true });
    expect((await manual.agent.get('/api/auth/session')).body.usage.remaining).toBe(10);
  });
  it('does not enforce daily, minute, or legacy IP scan limits on the verified administrator', async () => {
    const f = fixture();
    const login = await f.emailLogin(ADMIN_EMAIL);
    for (let i = 0; i < 25; i++)
      expect(
        (await f.post('/api/identify', login.body.csrf).send({ image: png, useCloud: true }))
          .status,
      ).toBe(200);
    expect(f.cloud).toHaveBeenCalledTimes(25);
    expect((await f.agent.get('/api/auth/session')).body.usage.unlimited).toBe(true);
  });
  it('uses atomic reservations for concurrent requests and isolates users', async () => {
    const f = fixture();
    const login = await f.emailLogin();
    const scans = await Promise.all(
      Array.from({ length: 8 }, () =>
        f.post('/api/identify', login.body.csrf).send({ image: png, useCloud: true }),
      ),
    );
    expect(scans.filter((r) => r.status === 200)).toHaveLength(3);
    expect(f.cloud).toHaveBeenCalledTimes(3);
    const other = f.store.loginEmail('second@example.com');
    expect(f.store.usage(other).remaining).toBe(10);
  });
  it('preserves sessions and usage across connections/restarts and resets at UTC midnight', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'thrifty-auth-'));
    const file = path.join(dir, 'auth.sqlite');
    try {
      const first = new AuthStore(file);
      const user = first.loginEmail('persistent@example.com');
      const at = Date.parse('2026-10-29T23:59:30Z');
      const session = first.createSession(user, undefined, at);
      for (let i = 0; i < 3; i++) first.reserveScan(user, undefined, at);
      first.close();
      const second = new AuthStore(file);
      expect(second.session(session.raw, at + 1000)?.user.id).toBe(user.id);
      expect(second.usage(user, undefined, at + 1000).remaining).toBe(7);
      expect(() => second.reserveScan(user, undefined, at + 1000)).toThrow('per minute');
      expect(second.usage(user, undefined, Date.parse('2026-10-30T00:01:00Z')).remaining).toBe(10);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(`${file}.key`).mode & 0o777).toBe(0o600);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('fails closed when durable usage storage cannot reserve a scan', async () => {
    const f = fixture();
    const login = await f.emailLogin();
    vi.spyOn(f.store, 'reserveScan').mockImplementation(() => {
      throw Object.assign(new Error('database path secret'), { code: 'ERR_SQLITE_ERROR' });
    });
    const response = await f
      .post('/api/identify', login.body.csrf)
      .send({ image: png, useCloud: true });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('path secret');
    expect(f.cloud).not.toHaveBeenCalled();
  });
});
it('does not enable sign-in based on a Vision API key alone', () => {
  vi.stubEnv('GOOGLE_AUTH_CLIENT_ID', '');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('GOOGLE_VISION_API_KEY', 'vision-only');
  expect(runtimeAuth(origin).ready).toBe(false);
});

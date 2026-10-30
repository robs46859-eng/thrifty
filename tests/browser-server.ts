// Local browser fixture only. It is never part of server.cjs and cannot run in
// production. Mail is captured to ignored local test output; nothing is sent.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createApp } from '../server/app';
import { AuthService } from '../server/auth';
import { AuthStore } from '../server/auth-store';
if (process.env.NODE_ENV === 'production')
  throw new Error('Browser fixtures cannot run in production.');
const origin = 'http://127.0.0.1:4321';
const auth = new AuthService({
  store: new AuthStore(),
  clientId: 'browser-test.apps.googleusercontent.com',
  origin,
  verifyGoogle: async (credential) => JSON.parse(credential),
  sendCode: async (email, code) => {
    const dir = path.resolve('test-results/mail');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(
      path.join(dir, `${createHash('sha256').update(email).digest('hex')}.json`),
      JSON.stringify({ email, code }),
      { mode: 0o600 },
    );
  },
});
const cloud: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      responses: [
        {
          labelAnnotations: [{ description: 'Fleece jacket', score: 0.9 }],
          fullTextAnnotation: { text: 'Cotton M' },
        },
      ],
    }),
    { status: 200 },
  );
createApp({ provider: 'google', googleKey: 'local-browser-fixture' }, cloud, origin, auth).listen(
  4321,
  '127.0.0.1',
  () => console.log(`Local browser test fixture: ${origin}`),
);

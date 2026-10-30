import request from 'supertest';
import { AuthStore } from '../server/auth-store';
import { AuthService } from '../server/auth';
import { createApp } from '../server/app';
import type { VisionConfig } from '../server/vision';
export const origin = 'http://thrifty.test';
export function apiFixture(config: VisionConfig = {}, cloud: typeof fetch = fetch) {
  const store = new AuthStore();
  const user = store.loginEmail('rob@virtuapet.com');
  const session = store.createSession(user);
  const auth = new AuthService({ store, origin, clientId: 'test.apps.googleusercontent.com' });
  const app = createApp(config, cloud, origin, auth);
  const post = (url: string) =>
    request(app)
      .post(url)
      .set('Origin', origin)
      .set('Cookie', `thrifty_session=${session.raw}`)
      .set('X-CSRF-Token', session.csrf);
  return { app, store, auth, post, get: (url: string) => request(app).get(url) };
}

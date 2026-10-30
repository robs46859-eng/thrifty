import express from 'express';
import { AuthService, runtimeAuth } from './auth';
import { AuthError } from './auth-store';
import path from 'node:path';
import { z } from 'zod';
import { configuredProvider, fallback, identify, validImage, type VisionConfig } from './vision';
import { marketplaces, disconnectedAdapter, type MarketplaceId } from '../src/lib/marketplaces';
export function createApp(
  config: VisionConfig = {},
  fetcher: typeof fetch = fetch,
  origin = process.env.APP_ORIGIN,
  authentication?: AuthService,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    });
    next();
  });
  app.use((req, res, next) => {
    if (origin) {
      const canonical = new URL(origin);
      if (!canonical.hostname.startsWith('www.') && req.hostname === `www.${canonical.hostname}`) {
        res.redirect(308, `${canonical.origin}${req.originalUrl}`);
        return;
      }
    }
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const requestOrigin = req.get('origin');
    const expected = origin || `${req.protocol}://${req.get('host')}`;
    if (
      req.get('sec-fetch-site') === 'cross-site' ||
      (requestOrigin && requestOrigin !== expected)
    ) {
      res.status(403).json({ error: 'Same-origin requests only.' });
      return;
    }
    next();
  });
  const auth = authentication ?? runtimeAuth(origin);
  app.use('/api/auth', express.json({ limit: '32kb' }));
  auth.install(app);
  app.use('/api/identify', (req, res, next) => {
    try {
      const session = auth.requireUser(req);
      auth.csrf(req, session.csrf);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use(express.json({ limit: '6mb' }));
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      service: 'thrifty',
      version: process.env.THRIFTY_VERSION ?? 'development',
      sourceId: process.env.THRIFTY_SOURCE_ID ?? 'development',
      storage: 'device-only',
      authenticationConfigured: auth.ready,
    }),
  );
  app.get('/api/status', (_req, res) =>
    res.json({
      identification: configuredProvider(config),
      marketplaces: 'disconnected',
      storage: 'device-only',
      authenticationConfigured: auth.ready,
    }),
  );
  const imageSchema = z.object({
    image: z
      .string()
      .max(7500000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
    useCloud: z.boolean().default(false),
  });
  app.post('/api/identify', async (req, res, next) => {
    try {
      const parsed = imageSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Choose a JPEG, PNG or WebP image, up to 4 MB.' });
        return;
      }
      const [header, data] = parsed.data.image.split(',');
      const image = Buffer.from(data, 'base64');
      if (
        image.length > 4 * 1024 * 1024 ||
        image.length < 12 ||
        !validImage(image, header.slice(5, header.indexOf(';')))
      ) {
        res.status(400).json({ error: 'Invalid or oversized image.' });
        return;
      }
      if (!parsed.data.useCloud || configuredProvider(config) === 'manual') {
        res.json(
          fallback(
            parsed.data.useCloud
              ? undefined
              : 'Photo loaded privately. Enter the item details below; no cloud analysis was requested.',
            configuredProvider(config) !== 'manual',
          ),
        );
        return;
      }
      const session = auth.requireUser(req);
      const usage = auth.store!.reserveScan(session.user, auth.limits, auth.now());
      // Reserve before the provider call. A timeout may still have incurred a
      // provider charge, so failed/cloud-fallback attempts retain their reservation.
      res.json({ ...(await identify(image, config, fetcher)), usage });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/marketplaces', (_req, res) =>
    res.json(marketplaces.map((m) => ({ ...m, status: 'disconnected', capabilities: ['draft'] }))),
  );
  app.post('/api/marketplaces/:id/:action', async (req, res, next) => {
    try {
      const session = auth.requireUser(req);
      auth.csrf(req, session.csrf);
    } catch (error) {
      next(error);
      return;
    }
    if (!marketplaces.some((m) => m.id === req.params.id)) {
      res.status(404).json({ error: 'Unknown marketplace.' });
      return;
    }
    const result = await disconnectedAdapter(req.params.id as MarketplaceId).publish(
      req.body,
      'blocked',
    );
    res.status(409).json(result);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  const dist = path.resolve('dist');
  app.use(
    express.static(dist, {
      setHeaders: (res, file) => {
        if (file.endsWith('sw.js') || file.endsWith('index.html'))
          res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.use(
    (
      error: { status?: number; code?: string; message?: string; retryAfter?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof AuthError) {
        if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      if (error.code?.startsWith('ERR_SQLITE') || error.code?.startsWith('SQLITE')) {
        res.status(503).json({
          error: 'Sign-in and scanning are temporarily unavailable. Please try again later.',
          code: 'AUTH_STORE_UNAVAILABLE',
        });
        return;
      }
      res.status(error.status === 413 ? 413 : 400).json({
        error:
          error.status === 413
            ? 'Image is too large. Use a smaller photo.'
            : 'Request could not be processed.',
      });
    },
  );
  return app;
}

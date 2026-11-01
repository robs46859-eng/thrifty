import type { Express } from 'express';
import { z } from 'zod';
import { AuthService } from './auth';
import { AuthError } from './auth-store';
import { CommunityStore } from './community-store';
export function installCommunity(app: Express, auth: AuthService) {
  let store: CommunityStore | undefined;
  try {
    if (auth.store) store = new CommunityStore(auth.store.db);
  } catch {
    console.error('Community storage is unavailable.');
  }
  const available = () => {
    if (!store)
      throw new AuthError(
        503,
        'COMMUNITY_UNAVAILABLE',
        'Community updates are temporarily unavailable.',
      );
    return store;
  };
  app.get('/api/community/summary', (req, res, next) => {
    try {
      const raw = z.string().min(1).max(8000).parse(req.query.placeIds);
      const ids = [...new Set(raw.split(','))];
      if (ids.length > 50)
        throw new AuthError(400, 'TOO_MANY_PLACES', 'Request at most 50 places.');
      res.json(available().summaries(ids, auth.now()));
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/community/reports', (req, res, next) => {
    try {
      const placeId = z.string().max(150).parse(req.query.placeId);
      res.json(available().list(placeId, auth.current(req)?.user, auth.now()));
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/community/moderation', (req, res, next) => {
    try {
      const session = auth.requireUser(req);
      res.json({
        reports: available().moderation(
          session.user,
          z.string().max(150).parse(req.query.placeId),
          auth.now(),
        ),
      });
    } catch (e) {
      next(e);
    }
  });
  const protectedAction =
    (
      action: (
        store: CommunityStore,
        user: ReturnType<AuthService['requireUser']>['user'],
        req: import('express').Request,
      ) => unknown,
    ) =>
    (
      req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      try {
        const session = auth.requireUser(req);
        auth.csrf(req, session.csrf);
        res.json(action(available(), session.user, req));
      } catch (e) {
        next(e);
      }
    };
  app.post(
    '/api/community/reports',
    protectedAction((db, user, req) => ({ id: db.create(user, req.body, auth.now()) })),
  );
  app.post(
    '/api/community/reports/:id/vote',
    protectedAction((db, user, req) => {
      db.vote(
        user,
        String(req.params.id),
        z
          .object({ value: z.enum(['confirm', 'dispute']) })
          .strict()
          .parse(req.body).value,
        auth.now(),
      );
      return { ok: true };
    }),
  );
  app.post(
    '/api/community/reports/:id/flag',
    protectedAction((db, user, req) => {
      db.flag(
        user,
        String(req.params.id),
        z
          .object({ reason: z.enum(['inaccurate', 'spam', 'privacy', 'abuse']) })
          .strict()
          .parse(req.body).reason,
        auth.now(),
      );
      return { ok: true };
    }),
  );
  app.post(
    '/api/community/reports/:id/withdraw',
    protectedAction((db, user, req) => {
      db.withdraw(user, String(req.params.id), auth.now());
      return { ok: true };
    }),
  );
  app.post(
    '/api/community/reports/:id/moderate',
    protectedAction((db, user, req) => {
      db.moderate(
        user,
        String(req.params.id),
        z
          .object({ action: z.enum(['hide', 'restore', 'remove']) })
          .strict()
          .parse(req.body).action,
        auth.now(),
      );
      return { ok: true };
    }),
  );
  return !!store;
}

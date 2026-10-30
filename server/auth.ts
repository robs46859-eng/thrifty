import type { Express, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  ADMIN_EMAIL,
  AuthError,
  AuthStore,
  DEFAULT_LIMITS,
  LOGIN_TTL,
  SESSION_TTL,
  equal,
  type Account,
  type Limits,
  type LoginState,
} from './auth-store';

export type GoogleIdentity = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
  hd?: string;
};
export type CodeSender = (email: string, code: string) => Promise<void>;
export type AuthOptions = {
  store?: AuthStore;
  clientId?: string;
  origin?: string;
  sendCode?: CodeSender;
  verifyGoogle?: (credential: string) => Promise<GoogleIdentity>;
  limits?: Limits;
  now?: () => number;
  unavailable?: boolean;
};
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
export function cookieValue(req: Request, name: string) {
  const value = req.headers.cookie
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
const emailSchema = z.string().trim().email().max(254).transform(normalizeEmail);
export class AuthService {
  readonly store?: AuthStore;
  readonly limits: Limits;
  readonly secure: boolean;
  readonly sessionCookie: string;
  readonly loginCookie: string;
  readonly now: () => number;
  private google?: OAuth2Client;
  constructor(readonly options: AuthOptions = {}) {
    this.store = options.store;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.secure = options.origin?.startsWith('https://') ?? process.env.NODE_ENV === 'production';
    this.sessionCookie = this.secure ? '__Host-thrifty_session' : 'thrifty_session';
    this.loginCookie = this.secure ? '__Host-thrifty_login' : 'thrifty_login';
    this.now = options.now ?? Date.now;
    if (options.clientId) this.google = new OAuth2Client(options.clientId);
  }
  get ready() {
    return (
      !!this.store &&
      !!(this.options.clientId || this.options.sendCode) &&
      !this.options.unavailable
    );
  }
  private cookie(res: Response, name: string, value: string, maxAge: number) {
    res.cookie(name, value, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });
  }
  current(req: Request) {
    return this.ready
      ? this.store!.session(cookieValue(req, this.sessionCookie), this.now())
      : undefined;
  }
  requireUser(req: Request) {
    if (!this.ready)
      throw new AuthError(
        503,
        'AUTH_SETUP_REQUIRED',
        'Sign-in is not configured yet. Cloud scanning is locked; manual shopping tools are available.',
      );
    const session = this.current(req);
    if (!session)
      throw new AuthError(401, 'SIGN_IN_REQUIRED', 'Sign in before using cloud scanning.');
    return session;
  }
  csrf(req: Request, expected: string) {
    const origin = req.get('origin');
    const configured = this.options.origin ?? `${req.protocol}://${req.get('host')}`;
    if (!origin || origin !== configured || !equal(req.get('x-csrf-token') ?? '', expected))
      throw new AuthError(
        403,
        'CSRF_REJECTED',
        'This sign-in request could not be verified. Refresh the page and try again.',
      );
  }
  private loginState(req: Request) {
    if (!this.ready)
      throw new AuthError(
        503,
        'AUTH_SETUP_REQUIRED',
        'Sign-in is not configured on this server yet.',
      );
    const raw = cookieValue(req, this.loginCookie),
      state = this.store!.getLoginState(raw, this.now());
    if (!raw || !state)
      throw new AuthError(403, 'LOGIN_EXPIRED', 'Sign-in expired. Refresh the page and try again.');
    this.csrf(req, raw);
    return state;
  }
  private finish(req: Request, res: Response, user: Account) {
    const session = this.store!.createSession(
      user,
      cookieValue(req, this.sessionCookie),
      this.now(),
    );
    this.cookie(res, this.sessionCookie, session.raw, SESSION_TTL);
    this.cookie(res, this.loginCookie, '', 0);
    return this.snapshot(user, session.csrf, session.expires);
  }
  private snapshot(user?: Account, csrf?: string, expires?: number, nonce?: string) {
    return {
      authenticated: !!user,
      user: user ?? null,
      csrf: csrf ?? null,
      nonce: nonce ?? null,
      expiresAt: expires ? new Date(expires).toISOString() : null,
      configured: this.ready,
      googleClientId: this.ready ? (this.options.clientId ?? null) : null,
      emailEnabled: this.ready && !!this.options.sendCode,
      usage: user ? this.store!.usage(user, this.limits, this.now()) : null,
      limits: { daily: this.limits.daily, minute: this.limits.minute },
    };
  }
  install(app: Express) {
    app.get('/api/auth/session', (req, res, next) => {
      try {
        if (!this.ready) {
          res.json(this.snapshot());
          return;
        }
        const session = this.current(req);
        if (session) {
          res.json(this.snapshot(session.user, session.csrf, session.expires));
          return;
        }
        let raw = cookieValue(req, this.loginCookie);
        let state = this.store!.getLoginState(raw, this.now());
        if (!state) {
          this.store!.reserveAuthAttempt(`bootstrap:${req.ip}`, 60, this.now());
          const created = this.store!.createLoginState(this.now());
          raw = created.raw;
          state = created;
          this.cookie(res, this.loginCookie, raw, LOGIN_TTL);
        }
        res.json(this.snapshot(undefined, raw, state.expires, state.nonce));
      } catch (error) {
        next(error);
      }
    });
    app.post('/api/auth/google', async (req, res, next) => {
      try {
        const state = this.loginState(req);
        if (!this.options.clientId)
          throw new AuthError(
            503,
            'GOOGLE_NOT_CONFIGURED',
            'Google sign-in is not configured. Use an email code if available.',
          );
        this.store!.reserveAuthAttempt(`google:${req.ip}`, 30, this.now());
        const input = z.object({ credential: z.string().min(1).max(15000) }).safeParse(req.body);
        if (!input.success)
          throw new AuthError(400, 'INVALID_CREDENTIAL', 'A valid Google credential is required.');
        let identity: GoogleIdentity;
        try {
          if (this.options.verifyGoogle)
            identity = await this.options.verifyGoogle(input.data.credential);
          else {
            const ticket = await this.google!.verifyIdToken({
              idToken: input.data.credential,
              audience: this.options.clientId,
            });
            identity = ticket.getPayload() as GoogleIdentity;
          }
        } catch {
          throw new AuthError(
            401,
            'INVALID_CREDENTIAL',
            'Google sign-in could not be verified. Please try again.',
          );
        }
        const email = emailSchema.safeParse(identity?.email);
        if (
          !identity?.sub ||
          !email.success ||
          identity.email_verified !== true ||
          !identity.nonce ||
          !equal(identity.nonce, state.nonce)
        )
          throw new AuthError(
            401,
            'INVALID_CREDENTIAL',
            'Google sign-in could not be verified. Please try again.',
          );
        // Google is not authoritative for non-Gmail addresses without a Workspace hd
        // claim. Require actual mailbox verification instead of trusting an old claim.
        const authoritative =
          email.data.endsWith('@gmail.com') ||
          (!!identity.hd && identity.hd.toLowerCase() === email.data.split('@')[1]);
        if (!authoritative)
          throw new AuthError(
            403,
            'EMAIL_VERIFICATION_REQUIRED',
            'Verify this address with an emailed sign-in code. Google does not host this mailbox.',
          );
        this.store!.consumeLoginState(state);
        const user = this.store!.loginGoogle(
          identity.sub,
          email.data,
          identity.name ?? email.data.split('@')[0],
        );
        res.json(this.finish(req, res, user));
      } catch (error) {
        next(error);
      }
    });
    app.post('/api/auth/email/request', async (req, res, next) => {
      try {
        const state = this.loginState(req);
        if (!this.options.sendCode)
          throw new AuthError(
            503,
            'EMAIL_NOT_CONFIGURED',
            'Email sign-in is not configured. Use Google sign-in if available.',
          );
        const email = emailSchema.safeParse(req.body?.email);
        if (!email.success)
          throw new AuthError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
        this.store!.reserveAuthAttempt(`email-ip:${req.ip}`, 20, this.now());
        this.store!.reserveAuthAttempt(`email:${email.data}`, 3, this.now());
        this.store!.renewLoginState(state, this.now());
        this.cookie(res, this.loginCookie, cookieValue(req, this.loginCookie)!, LOGIN_TTL);
        const code = this.store!.createEmailCode(state, email.data, this.now());
        try {
          await this.options.sendCode(email.data, code);
        } catch {
          this.store!.cancelEmailCode(state, email.data, code);
          throw new AuthError(
            503,
            'EMAIL_DELIVERY_FAILED',
            'The code could not be sent. Please try again later.',
          );
        }
        res.json({
          sent: true,
          expiresInSeconds: LOGIN_TTL / 1000,
          message: 'Check your email for a six-digit sign-in code.',
        });
      } catch (error) {
        next(error);
      }
    });
    app.post('/api/auth/email/verify', (req, res, next) => {
      try {
        const state = this.loginState(req);
        if (!this.options.sendCode)
          throw new AuthError(503, 'EMAIL_NOT_CONFIGURED', 'Email sign-in is not configured.');
        this.store!.reserveAuthAttempt(`verify-ip:${req.ip}`, 60, this.now());
        const input = z
          .object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) })
          .safeParse(req.body);
        if (!input.success)
          throw new AuthError(400, 'INVALID_CODE', 'Enter your email and the six-digit code.');
        this.store!.verifyEmailCode(state, input.data.email, input.data.code, this.now());
        this.store!.consumeLoginState(state);
        res.json(this.finish(req, res, this.store!.loginEmail(input.data.email)));
      } catch (error) {
        next(error);
      }
    });
    app.post('/api/auth/logout', (req, res, next) => {
      try {
        const session = this.requireUser(req);
        this.csrf(req, session.csrf);
        this.store!.logout(cookieValue(req, this.sessionCookie)!);
        this.cookie(res, this.sessionCookie, '', 0);
        res.json({ signedOut: true });
      } catch (error) {
        next(error);
      }
    });
  }
}
export function runtimeAuth(origin = process.env.APP_ORIGIN) {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID?.trim();
  const hasGoogle = !!clientId && /^\S+\.apps\.googleusercontent\.com$/.test(clientId);
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const hasSmtp = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM &&
    [465, 587].includes(smtpPort)
  );
  if (!hasGoogle && !hasSmtp) return new AuthService({ origin });
  try {
    if (process.env.NODE_ENV === 'production' && !origin?.startsWith('https://'))
      throw new Error('Production sign-in requires an HTTPS app origin.');
    const file =
      process.env.AUTH_DB_PATH ||
      (process.env.NODE_ENV === 'production'
        ? path.join(homedir(), '.thrifty', new URL(origin!).hostname, 'auth.sqlite')
        : path.resolve('.thrifty-data/auth.sqlite'));
    const store = new AuthStore(file);
    let sendCode: CodeSender | undefined;
    if (hasSmtp) {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: smtpPort === 465,
        requireTLS: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      sendCode = async (email, code) => {
        const result = await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: email,
          subject: 'Your Thrifty sign-in code',
          text: `Your Thrifty sign-in code is ${code}.\n\nIt expires in 10 minutes and works only in the browser where you requested it.\nIf you did not request this code, ignore this email.\n\n${origin ?? 'Thrifty'}`,
        });
        if (!result.accepted?.length) throw new Error('Email rejected');
      };
    }
    return new AuthService({ store, clientId: hasGoogle ? clientId : undefined, origin, sendCode });
  } catch {
    console.error('Sign-in storage/configuration is unavailable; cloud scanning remains locked.');
    return new AuthService({ origin, unavailable: true });
  }
}

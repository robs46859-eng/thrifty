import type { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

export const ADMIN_EMAIL = 'rob@virtuapet.com';
export const SESSION_TTL = 12 * 60 * 60 * 1000;
export const LOGIN_TTL = 10 * 60 * 1000;
export const DEFAULT_LIMITS = { daily: 10, minute: 3 };
export type Limits = typeof DEFAULT_LIMITS;
export type Account = { id: string; email: string; name: string; admin: boolean };
export type LoginState = { id: string; nonce: string; expires: number };
export type Usage = {
  unlimited: boolean;
  dailyLimit: number | null;
  dailyUsed: number;
  remaining: number | null;
  minuteLimit: number | null;
  resetsAt: string;
};
export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const nextDay = (now: number) => {
  const date = new Date(now);
  date.setUTCHours(24, 0, 0, 0);
  return date.getTime();
};

export class AuthStore {
  readonly db: DatabaseSync;
  private secret: Buffer;
  constructor(file = ':memory:') {
    if (file !== ':memory:') {
      if (!isAbsolute(file) || /(?:^|\/)(?:public_html|dist|hbuilds)(?:\/|$)/.test(file))
        throw new Error(
          'Auth storage must use an absolute private path outside website/build directories.',
        );
      const parent = dirname(file);
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      if (existsSync(file) && lstatSync(file).isSymbolicLink())
        throw new Error('Auth storage cannot be a symlink.');
      const secretFile = `${file}.key`;
      if (existsSync(secretFile) && lstatSync(secretFile).isSymbolicLink())
        throw new Error('Auth secret cannot be a symlink.');
      try {
        writeFileSync(secretFile, randomBytes(32), { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      this.secret = readFileSync(secretFile);
      chmodSync(secretFile, 0o600);
      if (this.secret.length !== 32) throw new Error('Auth secret is invalid.');
    } else this.secret = randomBytes(32);
    const { DatabaseSync } = process.getBuiltinModule(
      'node:sqlite',
    ) as typeof import('node:sqlite');
    this.db = new DatabaseSync(file);
    if (file !== ':memory:') chmodSync(file, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,google_sub TEXT UNIQUE);
   CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS login_states(id TEXT PRIMARY KEY,nonce TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS email_codes(state_id TEXT PRIMARY KEY REFERENCES login_states(id) ON DELETE CASCADE,email TEXT NOT NULL,code_hash TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,key TEXT NOT NULL,at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS attempts_lookup ON attempts(key,at);
   CREATE TABLE IF NOT EXISTS scans(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS scans_lookup ON scans(user_id,at);`);
  }
  close() {
    this.db.close();
  }
  private atomic<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private hmac(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }
  private account(row: Record<string, unknown>): Account {
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      admin: row.email === ADMIN_EMAIL,
    };
  }
  getLoginState(raw?: string, now = Date.now()): LoginState | undefined {
    if (!raw || raw.length > 100) return;
    const row = this.db
      .prepare('SELECT * FROM login_states WHERE id=? AND expires>?')
      .get(digest(raw), now);
    if (row) return { id: String(row.id), nonce: String(row.nonce), expires: Number(row.expires) };
  }
  createLoginState(now = Date.now()) {
    const raw = token();
    const state = { id: digest(raw), nonce: token(), expires: now + LOGIN_TTL };
    this.db
      .prepare('INSERT INTO login_states(id,nonce,expires) VALUES(?,?,?)')
      .run(state.id, state.nonce, state.expires);
    this.cleanup(now);
    return { raw, ...state };
  }
  renewLoginState(state: LoginState, now = Date.now()) {
    this.db.prepare('UPDATE login_states SET expires=? WHERE id=?').run(now + LOGIN_TTL, state.id);
  }
  consumeLoginState(state: LoginState) {
    const result = this.db.prepare('DELETE FROM login_states WHERE id=?').run(state.id);
    if (Number(result.changes) !== 1)
      throw new AuthError(
        403,
        'LOGIN_EXPIRED',
        'Sign-in was already used. Refresh the page and try again.',
      );
  }
  session(
    raw?: string,
    now = Date.now(),
  ): { user: Account; csrf: string; expires: number } | undefined {
    if (!raw || raw.length > 100) return;
    const row = this.db
      .prepare(
        'SELECT users.*,sessions.csrf,sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires>?',
      )
      .get(digest(raw), now);
    if (row)
      return { user: this.account(row), csrf: String(row.csrf), expires: Number(row.expires) };
  }
  createSession(user: Account, oldToken?: string, now = Date.now()) {
    const raw = token(),
      csrf = token(),
      expires = now + SESSION_TTL;
    this.atomic(() => {
      if (oldToken) this.db.prepare('DELETE FROM sessions WHERE id=?').run(digest(oldToken));
      this.db
        .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
        .run(digest(raw), user.id, csrf, expires);
    });
    return { raw, csrf, expires };
  }
  logout(raw: string) {
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(digest(raw));
  }
  loginEmail(email: string): Account {
    return this.upsert(email, email.split('@')[0]);
  }
  loginGoogle(sub: string, email: string, name: string): Account {
    return this.upsert(email, name, sub);
  }
  private upsert(email: string, name: string, sub?: string): Account {
    return this.atomic(() => {
      const subject = sub
        ? this.db.prepare('SELECT * FROM users WHERE google_sub=?').get(sub)
        : undefined;
      const existing = this.db.prepare('SELECT * FROM users WHERE email=?').get(email);
      if (
        (subject && subject.email !== email) ||
        (existing?.google_sub && sub && existing.google_sub !== sub)
      )
        throw new AuthError(409, 'ACCOUNT_LINK', 'Use an email sign-in code for this address.');
      const id = String(existing?.id ?? subject?.id ?? token());
      if (existing)
        this.db
          .prepare('UPDATE users SET name=?,google_sub=COALESCE(google_sub,?) WHERE id=?')
          .run(name.slice(0, 80), sub ?? null, id);
      else
        this.db
          .prepare('INSERT INTO users VALUES(?,?,?,?)')
          .run(id, email, name.slice(0, 80), sub ?? null);
      return { id, email, name: name.slice(0, 80), admin: email === ADMIN_EMAIL };
    });
  }
  reserveAuthAttempt(key: string, limit: number, now = Date.now(), window = 60 * 60 * 1000) {
    this.atomic(() => {
      const hashed = this.hmac(key);
      const row = this.db
        .prepare('SELECT COUNT(*) AS count, MIN(at) AS first FROM attempts WHERE key=? AND at>?')
        .get(hashed, now - window)!;
      if (Number(row.count) >= limit)
        throw new AuthError(
          429,
          'AUTH_RATE_LIMIT',
          'Too many sign-in attempts. Please try again later.',
          Math.max(1, Math.ceil((Number(row.first) + window - now) / 1000)),
        );
      this.db.prepare('INSERT INTO attempts(key,at) VALUES(?,?)').run(hashed, now);
    });
  }
  createEmailCode(state: LoginState, email: string, now = Date.now()) {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    this.db
      .prepare(
        'INSERT INTO email_codes(state_id,email,code_hash,attempts,expires) VALUES(?,?,?,0,?) ON CONFLICT(state_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,attempts=0,expires=excluded.expires',
      )
      .run(state.id, email, this.hmac(`${state.id}:${email}:${code}`), now + LOGIN_TTL);
    return code;
  }
  cancelEmailCode(state: LoginState, email: string, code: string) {
    this.db
      .prepare('DELETE FROM email_codes WHERE state_id=? AND email=? AND code_hash=?')
      .run(state.id, email, this.hmac(`${state.id}:${email}:${code}`));
  }
  verifyEmailCode(state: LoginState, email: string, code: string, now = Date.now()) {
    const accepted = this.atomic(() => {
      const row = this.db.prepare('SELECT * FROM email_codes WHERE state_id=?').get(state.id);
      if (!row || Number(row.expires) <= now || Number(row.attempts) >= 5) return false;
      this.db.prepare('UPDATE email_codes SET attempts=attempts+1 WHERE state_id=?').run(state.id);
      if (
        row.email !== email ||
        !equal(String(row.code_hash), this.hmac(`${state.id}:${email}:${code}`))
      )
        return false;
      this.db.prepare('DELETE FROM email_codes WHERE state_id=?').run(state.id);
      return true;
    });
    if (!accepted)
      throw new AuthError(
        401,
        'INVALID_CODE',
        'The code is invalid or expired. Request a new code if needed.',
      );
  }
  usage(user: Account, limits = DEFAULT_LIMITS, now = Date.now()): Usage {
    if (user.admin)
      return {
        unlimited: true,
        dailyLimit: null,
        dailyUsed: 0,
        remaining: null,
        minuteLimit: null,
        resetsAt: new Date(nextDay(now)).toISOString(),
      };
    const day = nextDay(now) - 86400000;
    const count = Number(
      this.db
        .prepare('SELECT COUNT(*) AS count FROM scans WHERE user_id=? AND at>=?')
        .get(user.id, day)!.count,
    );
    return {
      unlimited: false,
      dailyLimit: limits.daily,
      dailyUsed: count,
      remaining: Math.max(0, limits.daily - count),
      minuteLimit: limits.minute,
      resetsAt: new Date(nextDay(now)).toISOString(),
    };
  }
  reserveScan(user: Account, limits = DEFAULT_LIMITS, now = Date.now()): Usage {
    if (user.admin) return this.usage(user, limits, now);
    return this.atomic(() => {
      const usage = this.usage(user, limits, now);
      if (usage.remaining === 0)
        throw new AuthError(
          429,
          'DAILY_SCAN_LIMIT',
          `Your ${limits.daily} daily cloud scans are used. Manual shopping tools still work.`,
          Math.ceil((nextDay(now) - now) / 1000),
        );
      const burst = this.db
        .prepare('SELECT COUNT(*) AS count,MIN(at) AS first FROM scans WHERE user_id=? AND at>?')
        .get(user.id, now - 60000)!;
      if (Number(burst.count) >= limits.minute)
        throw new AuthError(
          429,
          'MINUTE_SCAN_LIMIT',
          `Please wait before scanning again. Free accounts allow ${limits.minute} cloud scans per minute.`,
          Math.max(1, Math.ceil((Number(burst.first) + 60000 - now) / 1000)),
        );
      this.db.prepare('INSERT INTO scans(user_id,at) VALUES(?,?)').run(user.id, now);
      return {
        ...usage,
        dailyUsed: usage.dailyUsed + 1,
        remaining: Math.max(0, Number(usage.remaining) - 1),
      };
    });
  }
  cleanup(now = Date.now()) {
    this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
    this.db.prepare('DELETE FROM login_states WHERE expires<=?').run(now);
    this.db.prepare('DELETE FROM attempts WHERE at<?').run(now - 86400000);
    this.db.prepare('DELETE FROM scans WHERE at<?').run(now - 2 * 86400000);
  }
}

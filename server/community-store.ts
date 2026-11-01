import type { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { AuthError, type Account } from './auth-store';
import { allPlaces } from '../src/lib/catalogue';
import { localDate } from '../src/lib/discovery';
import {
  emptySummary,
  reportInputSchema,
  reportTTLDays,
  type CommunityReport,
  type CommunitySummary,
} from '../src/lib/community';
type Row = Record<string, unknown>;
export class CommunityStore {
  constructor(readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS community_reports(
      id TEXT PRIMARY KEY,place_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,
      payload TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0,
      removed_at INTEGER,moderated_at INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS community_place ON community_reports(place_id,expires_at,created_at);
      CREATE TABLE IF NOT EXISTS community_votes(report_id TEXT NOT NULL REFERENCES community_reports(id),user_id TEXT NOT NULL REFERENCES users(id),value TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(report_id,user_id));
      CREATE TABLE IF NOT EXISTS community_flags(report_id TEXT NOT NULL REFERENCES community_reports(id),user_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(report_id,user_id));
      CREATE TABLE IF NOT EXISTS community_audit(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),report_id TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS community_rate ON community_audit(user_id,action,at);`);
  }
  private atomic<T>(fn: () => T) {
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
  place(id: string) {
    const place = allPlaces.find((p) => p.id === id);
    if (!place)
      throw new AuthError(
        404,
        'UNKNOWN_COMMUNITY_PLACE',
        'Community updates are available for reviewed directory places.',
      );
    return place;
  }
  private row(id: string) {
    const row = this.db
      .prepare('SELECT * FROM community_reports WHERE id=? AND removed_at IS NULL')
      .get(id);
    if (!row) throw new AuthError(404, 'REPORT_NOT_FOUND', 'This update is no longer available.');
    return row;
  }
  private audit(user: Account, id: string, action: string, now: number) {
    this.db
      .prepare('INSERT INTO community_audit(user_id,report_id,action,at) VALUES(?,?,?,?)')
      .run(user.id, id, action, now);
  }
  private limit(user: Account, action: 'create' | 'interaction', now: number) {
    if (user.admin) return;
    const day = Math.floor(now / 86400000) * 86400000;
    const checks =
      action === 'create'
        ? ([
            [day, 10, 'daily'],
            [now - 60000, 3, 'per-minute'],
          ] as const)
        : ([[now - 3600000, 60, 'hourly']] as const);
    for (const [since, max, label] of checks) {
      const result = this.db
        .prepare(
          'SELECT COUNT(*) AS count,MIN(at) AS first FROM community_audit WHERE user_id=? AND action=? AND at>=?',
        )
        .get(user.id, action, since)!;
      if (Number(result.count) >= max)
        throw new AuthError(
          429,
          'COMMUNITY_RATE_LIMIT',
          `Your ${label} community contribution limit is reached. Try again later.`,
          Math.max(
            1,
            Math.ceil(
              ((label === 'daily'
                ? day + 86400000
                : Number(result.first) + (label === 'per-minute' ? 60000 : 3600000)) -
                now) /
                1000,
            ),
          ),
        );
    }
  }
  create(user: Account, raw: unknown, now = Date.now()) {
    const parsed = reportInputSchema.safeParse(raw);
    if (!parsed.success)
      throw new AuthError(
        400,
        'INVALID_COMMUNITY_REPORT',
        parsed.error.issues[0]?.message ?? 'Check the update fields.',
      );
    const input = parsed.data,
      place = this.place(input.placeId),
      today = localDate(new Date(now), place.timezone ?? 'America/Denver');
    const age = (Date.parse(today) - Date.parse(input.observedOn)) / 86400000;
    if (age < 0 || age > 30)
      throw new AuthError(
        400,
        'INVALID_OBSERVATION_DATE',
        'Use an observation date within the past 30 days.',
      );
    if (
      input.appliesOn &&
      (input.appliesOn < today || Date.parse(input.appliesOn) - Date.parse(today) > 90 * 86400000)
    )
      throw new AuthError(
        400,
        'INVALID_APPLICABLE_DATE',
        'Choose an applicable date from today through the next 90 days.',
      );
    const expires = input.appliesOn
      ? Date.parse(input.appliesOn) + 2 * 86400000
      : now + (reportTTLDays[input.kind] - age) * 86400000;
    if (expires <= now)
      throw new AuthError(
        400,
        'EXPIRED_COMMUNITY_REPORT',
        'That observation is too old for this type of update.',
      );
    return this.atomic(() => {
      this.limit(user, 'create', now);
      // Each member contributes only one active rating per venue.
      if (input.kind === 'rating')
        this.db
          .prepare(
            "UPDATE community_reports SET removed_at=? WHERE user_id=? AND place_id=? AND kind='rating' AND removed_at IS NULL",
          )
          .run(now, user.id, input.placeId);
      const id = randomUUID();
      this.db
        .prepare(
          'INSERT INTO community_reports(id,place_id,user_id,kind,payload,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(id, input.placeId, user.id, input.kind, JSON.stringify(input), now, expires);
      this.audit(user, id, 'create', now);
      return id;
    });
  }
  private publicRow(row: Row, viewer: Account | undefined, now: number): CommunityReport {
    const input = reportInputSchema.parse(JSON.parse(String(row.payload)));
    const votes = this.db
      .prepare(
        'SELECT value,COUNT(*) AS count FROM community_votes WHERE report_id=? GROUP BY value',
      )
      .all(String(row.id));
    const flagCount = Number(
      this.db
        .prepare('SELECT COUNT(*) AS count FROM community_flags WHERE report_id=?')
        .get(String(row.id))!.count,
    );
    const ownVote = viewer
      ? this.db
          .prepare('SELECT value FROM community_votes WHERE report_id=? AND user_id=?')
          .get(String(row.id), viewer.id)
      : undefined;
    return {
      ...input,
      id: String(row.id),
      createdAt: new Date(Number(row.created_at)).toISOString(),
      expiresAt: new Date(Number(row.expires_at)).toISOString(),
      authorLabel: `Shopper ${createHash('sha256')
        .update('community:' + String(row.user_id))
        .digest('hex')
        .slice(0, 8)}`,
      confirmations: Number(votes.find((v) => v.value === 'confirm')?.count ?? 0),
      disputes: Number(votes.find((v) => v.value === 'dispute')?.count ?? 0),
      flags: flagCount,
      myVote: (ownVote?.value as 'confirm' | 'dispute' | undefined) ?? null,
      myFlag: !!(
        viewer &&
        this.db
          .prepare('SELECT 1 FROM community_flags WHERE report_id=? AND user_id=?')
          .get(String(row.id), viewer.id)
      ),
      isMine: row.user_id === viewer?.id,
      hidden: !!row.hidden,
      expired: Number(row.expires_at) <= now,
    };
  }
  list(placeId: string, viewer?: Account, now = Date.now()) {
    this.place(placeId);
    const rows = this.db
      .prepare(
        'SELECT * FROM community_reports WHERE place_id=? AND removed_at IS NULL AND ((hidden=0 AND expires_at>?) OR user_id=?) ORDER BY created_at DESC,id DESC LIMIT 100',
      )
      .all(placeId, now, viewer?.id ?? '');
    return {
      reports: rows.map((r) => this.publicRow(r, viewer, now)),
      summary: this.summaries([placeId], now)[placeId],
    };
  }
  summaries(placeIds: string[], now = Date.now()): Record<string, CommunitySummary> {
    const result: Record<string, CommunitySummary> = {};
    for (const id of placeIds) {
      this.place(id);
      const counts = this.db
        .prepare(
          "SELECT COUNT(*) AS count,AVG(CASE WHEN kind='rating' THEN json_extract(payload,'$.rating') END) AS average,SUM(CASE WHEN kind='rating' THEN 1 ELSE 0 END) AS ratings,MAX(created_at) AS latest FROM community_reports WHERE place_id=? AND hidden=0 AND removed_at IS NULL AND expires_at>?",
        )
        .get(id, now)!;
      const signals = this.db
        .prepare(
          "SELECT DISTINCT kind FROM community_reports WHERE place_id=? AND hidden=0 AND removed_at IS NULL AND expires_at>? AND kind!='rating'",
        )
        .all(id, now);
      result[id] = {
        ...emptySummary,
        count: Number(counts.count),
        averageRating:
          counts.average === null ? null : Math.round(Number(counts.average) * 10) / 10,
        ratingCount: Number(counts.ratings ?? 0),
        signals: signals.map((r) => r.kind) as CommunitySummary['signals'],
        lastReportedAt:
          counts.latest === null ? null : new Date(Number(counts.latest)).toISOString(),
      };
    }
    return result;
  }
  vote(user: Account, id: string, value: 'confirm' | 'dispute', now = Date.now()) {
    this.atomic(() => {
      const row = this.row(id);
      if (row.user_id === user.id)
        throw new AuthError(403, 'OWN_REPORT_VOTE', 'You cannot confirm your own update.');
      if (row.hidden || Number(row.expires_at) <= now)
        throw new AuthError(409, 'REPORT_INACTIVE', 'This update is expired or under review.');
      this.limit(user, 'interaction', now);
      const current = this.db
        .prepare('SELECT value FROM community_votes WHERE report_id=? AND user_id=?')
        .get(id, user.id);
      if (current?.value === value)
        this.db
          .prepare('DELETE FROM community_votes WHERE report_id=? AND user_id=?')
          .run(id, user.id);
      else
        this.db
          .prepare(
            'INSERT INTO community_votes(report_id,user_id,value,at) VALUES(?,?,?,?) ON CONFLICT(report_id,user_id) DO UPDATE SET value=excluded.value,at=excluded.at',
          )
          .run(id, user.id, value, now);
      this.audit(user, id, 'interaction', now);
    });
  }
  flag(user: Account, id: string, reason: string, now = Date.now()) {
    this.atomic(() => {
      const row = this.row(id);
      if (row.user_id === user.id)
        throw new AuthError(403, 'OWN_REPORT_FLAG', 'Withdraw your own update instead.');
      if (row.hidden || Number(row.expires_at) <= now)
        throw new AuthError(
          409,
          'REPORT_INACTIVE',
          'This update is expired or already under review.',
        );
      this.limit(user, 'interaction', now);
      this.db
        .prepare(
          'INSERT INTO community_flags(report_id,user_id,reason,at) VALUES(?,?,?,?) ON CONFLICT(report_id,user_id) DO NOTHING',
        )
        .run(id, user.id, reason, now);
      const count = Number(
        this.db
          .prepare('SELECT COUNT(*) AS count FROM community_flags WHERE report_id=? AND at>?')
          .get(id, Number(row.moderated_at))!.count,
      );
      if (count >= 3) this.db.prepare('UPDATE community_reports SET hidden=1 WHERE id=?').run(id);
      this.audit(user, id, 'interaction', now);
    });
  }
  withdraw(user: Account, id: string, now = Date.now()) {
    this.atomic(() => {
      const row = this.row(id);
      if (row.user_id !== user.id)
        throw new AuthError(
          403,
          'REPORT_OWNER_REQUIRED',
          'Only the author can withdraw this update.',
        );
      this.db.prepare('UPDATE community_reports SET removed_at=? WHERE id=?').run(now, id);
      this.audit(user, id, 'withdraw', now);
    });
  }
  moderation(user: Account, placeId: string, now = Date.now()) {
    if (!user.admin) throw new AuthError(403, 'ADMIN_REQUIRED', 'Administrator access required.');
    this.place(placeId);
    return this.db
      .prepare(
        'SELECT * FROM community_reports WHERE place_id=? AND removed_at IS NULL AND (hidden=1 OR EXISTS(SELECT 1 FROM community_flags WHERE report_id=community_reports.id AND at>community_reports.moderated_at)) ORDER BY created_at DESC LIMIT 100',
      )
      .all(placeId)
      .map((r) => this.publicRow(r, user, now));
  }
  moderate(user: Account, id: string, action: 'hide' | 'restore' | 'remove', now = Date.now()) {
    if (!user.admin) throw new AuthError(403, 'ADMIN_REQUIRED', 'Administrator access required.');
    this.atomic(() => {
      this.row(id);
      if (action === 'remove')
        this.db
          .prepare('UPDATE community_reports SET removed_at=?,moderated_at=? WHERE id=?')
          .run(now, now, id);
      else
        this.db
          .prepare('UPDATE community_reports SET hidden=?,moderated_at=? WHERE id=?')
          .run(action === 'hide' ? 1 : 0, now, id);
      this.audit(user, id, 'moderate:' + action, now);
    });
  }
}

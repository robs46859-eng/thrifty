import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Plus, Star, ThumbsUp, Flag, Clock3 } from 'lucide-react';
import { useAuth, AuthRequestError } from '../lib/auth';
import { allPlaces } from '../lib/catalogue';
import { localDate, type Place } from '../lib/discovery';
import {
  emptySummary,
  reportFacts,
  reportInputSchema,
  reportKinds,
  reportLabels,
  reportsResponseSchema,
  reportSchema,
  shoppingCategories,
  weekdays,
  type CommunityReport,
  type CommunitySummary,
  type ReportInput,
  type ReportKind,
} from '../lib/community';
import { Field, Modal } from './ui';
export function CommunityBadge({ summary }: { summary?: CommunitySummary }) {
  if (!summary?.count) return null;
  return (
    <span className="community-card-badge">
      <MessageCircle size={12} aria-hidden="true" />
      {summary.signals.includes('closure')
        ? 'Community closure / reopening report'
        : summary.signals.includes('find')
          ? 'Recent community find'
          : `${summary.count} community ${summary.count === 1 ? 'update' : 'updates'}`}
      {!!summary.ratingCount && ` · ★ ${summary.averageRating}/5 (${summary.ratingCount})`}
    </span>
  );
}
export function CommunityPanel({ place, onChange }: { place: Place; onChange: () => unknown }) {
  const auth = useAuth();
  const [data, setData] = useState<{ reports: CommunityReport[]; summary: CommunitySummary }>({
    reports: [],
    summary: emptySummary,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false),
    [kind, setKind] = useState<ReportKind | 'all'>('all'),
    [busy, setBusy] = useState(false);
  const [flagging, setFlagging] = useState<CommunityReport | null>(null),
    [flagReason, setFlagReason] = useState('inaccurate');
  const [moderation, setModeration] = useState<CommunityReport[] | null>(null);
  const controller = useRef<AbortController | null>(null);
  const supported = allPlaces.some((p) => p.id === place.id);
  const refresh = useCallback(async () => {
    if (!supported) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/community/reports?placeId=${encodeURIComponent(place.id)}`,
        { cache: 'no-store', credentials: 'same-origin', signal: abort.signal },
      );
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Community updates are unavailable.');
      const parsed = reportsResponseSchema.parse(value);
      if (!abort.signal.aborted) {
        setData(parsed);
        setError('');
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setData({ reports: [], summary: emptySummary });
        setError(e instanceof Error ? e.message : 'Community updates are unavailable.');
      }
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }, [place.id, supported, auth.info.user?.id]);
  useEffect(() => {
    setData({ reports: [], summary: emptySummary });
    setModeration(null);
    setNotice('');
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);
  async function loadModeration() {
    const response = await fetch(
      `/api/community/moderation?placeId=${encodeURIComponent(place.id)}`,
      { credentials: 'same-origin', cache: 'no-store' },
    );
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Moderation is unavailable.');
    setModeration(reportSchema.array().max(100).parse(value.reports));
  }
  async function action(path: string, body: unknown) {
    if (!auth.info.authenticated) {
      auth.openSignIn();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await auth.request(path, body);
      await refresh();
      void onChange();
      setNotice('Community update saved.');
      if (moderation) await loadModeration();
    } catch (e) {
      if (e instanceof AuthRequestError && e.status === 401) {
        await auth.refresh();
        auth.openSignIn();
      }
      setError(e instanceof Error ? e.message : 'The update could not be saved.');
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (!supported)
    return (
      <section className="community-panel">
        <h2>Community updates</h2>
        <p className="micro">
          Shared updates are available on reviewed directory places. Sample places and private
          seller pins stay separate.
        </p>
      </section>
    );
  const reports = data.reports.filter((r) => kind === 'all' || r.kind === kind);
  return (
    <section className="community-panel" aria-label={`Community updates for ${place.name}`}>
      <div className="community-heading">
        <div>
          <span className="eyebrow">FROM PEOPLE WHO SHOP HERE</span>
          <h2>
            <MessageCircle size={20} /> Community updates
          </h2>
        </div>
        <button
          className="btn secondary"
          onClick={() => {
            if (auth.info.authenticated) setSharing(true);
            else auth.openSignIn();
          }}
        >
          <Plus size={16} /> Share an update
        </button>
      </div>
      <p className="micro">
        Shopper observations, not official store notices. Check the date and confirm before
        traveling. Finds may sell before you arrive.
      </p>
      {data.summary.ratingCount ? (
        <p className="community-rating">
          <Star size={17} />
          <strong>{data.summary.averageRating}/5</strong> from {data.summary.ratingCount} community{' '}
          {data.summary.ratingCount === 1 ? 'rating' : 'ratings'}
        </p>
      ) : (
        <p className="micro">No active community ratings yet.</p>
      )}
      <Field label="Filter community updates">
        <select value={kind} onChange={(e) => setKind(e.target.value as ReportKind | 'all')}>
          <option value="all">All updates</option>
          {reportKinds.map((k) => (
            <option key={k} value={k}>
              {reportLabels[k]}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p className="community-error" role="alert">
          {error}{' '}
          <button className="text-link" onClick={() => void refresh()}>
            Retry community updates
          </button>
        </p>
      )}
      {notice && (
        <p className="micro" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading community updates…</p>
      ) : !error && !reports.length ? (
        <p className="community-empty">
          No community updates in this category yet. Share what you noticed.
        </p>
      ) : null}
      <div className="community-feed">
        {reports.map((r) => (
          <article
            className={`community-report ${r.hidden || r.expired ? 'community-inactive' : ''}`}
            key={r.id}
            aria-label={`${reportLabels[r.kind]} community report`}
          >
            <div className="community-report-top">
              <strong>{reportLabels[r.kind]}</strong>
              <span>{r.isMine ? 'You' : r.authorLabel}</span>
            </div>
            {(r.hidden || r.expired) && (
              <p className="community-status">
                {r.hidden ? 'Hidden pending review' : 'Expired'} · visible to you as the author
              </p>
            )}
            <p className="community-facts">{reportFacts(r)}</p>
            <p className="community-details">{r.details}</p>
            <p className="micro">
              <Clock3 size={12} /> Observed {r.observedOn} · Expires{' '}
              {new Date(r.expiresAt).toLocaleDateString(undefined, {
                timeZone: place.timezone ?? 'America/Denver',
              })}
            </p>
            <div className="community-actions">
              <button
                disabled={busy || r.isMine || r.hidden || r.expired}
                aria-pressed={r.myVote === 'confirm'}
                onClick={() =>
                  void action(`/api/community/reports/${r.id}/vote`, { value: 'confirm' }).catch(
                    () => {},
                  )
                }
              >
                <ThumbsUp size={14} /> Still accurate ({r.confirmations})
              </button>
              <button
                disabled={busy || r.isMine || r.hidden || r.expired}
                aria-pressed={r.myVote === 'dispute'}
                onClick={() =>
                  void action(`/api/community/reports/${r.id}/vote`, { value: 'dispute' }).catch(
                    () => {},
                  )
                }
              >
                Needs update ({r.disputes})
              </button>
              {r.isMine ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(`/api/community/reports/${r.id}/withdraw`, {}).catch(() => {})
                  }
                >
                  Withdraw my update
                </button>
              ) : (
                <button
                  disabled={busy || r.myFlag || r.hidden || r.expired}
                  onClick={() => {
                    if (!auth.info.authenticated) auth.openSignIn();
                    else {
                      setFlagging(r);
                      setFlagReason('inaccurate');
                    }
                  }}
                >
                  <Flag size={14} />
                  {r.myFlag ? 'Flagged for review' : 'Flag for review'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <button className="text-link" onClick={() => void refresh()}>
        Refresh community updates
      </button>
      {auth.info.user?.admin && (
        <div className="community-moderation">
          <button
            className="btn secondary"
            onClick={() => void loadModeration().catch((e) => setError(e.message))}
          >
            Review flagged updates
          </button>
          {moderation && (
            <div>
              <h3>Flagged updates for this place</h3>
              {!moderation.length && <p>No updates need moderation.</p>}
              {moderation.map((r) => (
                <article className="community-report" key={r.id}>
                  <strong>
                    {reportLabels[r.kind]} · {r.flags} flags
                  </strong>
                  <p>{r.details}</p>
                  <div className="community-actions">
                    {(['hide', 'restore', 'remove'] as const).map((a) => (
                      <button
                        key={a}
                        disabled={busy}
                        onClick={() =>
                          void action(`/api/community/reports/${r.id}/moderate`, {
                            action: a,
                          }).catch(() => {})
                        }
                      >
                        {a === 'hide'
                          ? 'Hide update'
                          : a === 'restore'
                            ? 'Restore update'
                            : 'Remove update'}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {sharing && (
        <ReportForm
          place={place}
          close={() => setSharing(false)}
          submit={async (input) => {
            await action('/api/community/reports', input);
            setSharing(false);
          }}
          busy={busy}
        />
      )}
      {flagging && (
        <Modal title="Flag community update" close={() => setFlagging(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(`/api/community/reports/${flagging.id}/flag`, { reason: flagReason })
                .then(() => setFlagging(null))
                .catch(() => {});
            }}
          >
            <p>Send this update to the administrator for review.</p>
            <Field label="Reason for flag">
              <select value={flagReason} onChange={(e) => setFlagReason(e.target.value)}>
                <option value="inaccurate">Outdated or inaccurate</option>
                <option value="spam">Spam</option>
                <option value="privacy">Personal information</option>
                <option value="abuse">Abusive content</option>
              </select>
            </Field>
            <button className="btn primary" disabled={busy}>
              Submit flag
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function ReportForm({
  place,
  close,
  submit,
  busy,
}: {
  place: Place;
  close: () => void;
  submit: (input: ReportInput) => Promise<void>;
  busy: boolean;
}) {
  const [input, setInput] = useState<ReportInput>({
    placeId: place.id,
    kind: 'restock',
    details: '',
    observedOn: localDate(new Date(), place.timezone ?? 'America/Denver'),
    weekdays: [],
  });
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const set = <K extends keyof ReportInput>(key: K, value: ReportInput[K]) => {
    setInput((i) => ({ ...i, [key]: value }));
    setConfirmed(false);
  };
  return (
    <Modal title="Share a community update" close={close}>
      <form
        className="form-grid community-form"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = reportInputSchema.safeParse(input);
          if (!confirmed) {
            setError('Confirm that this is your observation or a store announcement you checked.');
            return;
          }
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          void submit(parsed.data).catch((e) => setError(e.message));
        }}
      >
        <p className="micro">
          Public update for <strong>{place.name}</strong>. Keep personal information, license plates
          and private addresses out of your report.
        </p>
        <Field label="Update type" wide>
          <select
            value={input.kind}
            onChange={(e) => {
              setInput({
                placeId: place.id,
                kind: e.target.value as ReportKind,
                details: '',
                observedOn: input.observedOn,
                weekdays: [],
              });
              setConfirmed(false);
              setError('');
            }}
          >
            {reportKinds.map((k) => (
              <option key={k} value={k}>
                {reportLabels[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Observed or checked on">
          <input
            type="date"
            required
            value={input.observedOn}
            max={localDate(new Date(), place.timezone ?? 'America/Denver')}
            onChange={(e) => set('observedOn', e.target.value)}
          />
        </Field>
        {['restock', 'discount', 'closure', 'holiday_hours'].includes(input.kind) && (
          <Field
            label={input.kind === 'holiday_hours' ? 'Holiday date' : 'Specific date (optional)'}
          >
            <input
              type="date"
              value={input.appliesOn ?? ''}
              onChange={(e) => set('appliesOn', e.target.value || undefined)}
            />
          </Field>
        )}
        {['restock', 'discount'].includes(input.kind) && (
          <fieldset className="community-days">
            <legend>Recurring days (or choose a specific date)</legend>
            {weekdays.map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={input.weekdays.includes(day)}
                  onChange={(e) =>
                    set(
                      'weekdays',
                      e.target.checked
                        ? [...input.weekdays, day]
                        : input.weekdays.filter((d) => d !== day),
                    )
                  }
                />
                {day}
              </label>
            ))}
          </fieldset>
        )}
        {['restock', 'discount', 'holiday_hours'].includes(input.kind) && (
          <Field
            label={
              input.kind === 'holiday_hours' ? 'Holiday hours or Closed' : 'Time window (optional)'
            }
            wide
          >
            <input
              value={input.timeWindow ?? ''}
              maxLength={100}
              placeholder={
                input.kind === 'holiday_hours'
                  ? 'e.g. 10am–2pm, or Closed'
                  : 'e.g. mornings; confirm with staff'
              }
              onChange={(e) => set('timeWindow', e.target.value)}
            />
          </Field>
        )}
        {input.kind === 'closure' && (
          <Field label="Closure or reopening" wide>
            <select
              value={input.closureStatus ?? ''}
              onChange={(e) => set('closureStatus', e.target.value as ReportInput['closureStatus'])}
            >
              <option value="">Choose status</option>
              <option value="temporarily_closed">Reported temporary closure</option>
              <option value="permanently_closed">Reported permanent closure</option>
              <option value="reopened">Reported reopened</option>
            </select>
          </Field>
        )}
        {['prices', 'find'].includes(input.kind) && (
          <Field label="Item category" wide>
            <select
              value={input.category ?? ''}
              onChange={(e) =>
                set('category', (e.target.value as ReportInput['category']) || undefined)
              }
            >
              <option value="">Choose category</option>
              {shoppingCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        )}
        {input.kind === 'prices' && (
          <>
            <Field label="Lower price ($)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={input.priceMin ?? ''}
                onChange={(e) =>
                  set('priceMin', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </Field>
            <Field label="Upper price ($)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={input.priceMax ?? ''}
                onChange={(e) =>
                  set('priceMax', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </Field>
          </>
        )}
        {input.kind === 'rating' && (
          <Field label="Your store rating" wide>
            <select
              value={input.rating ?? ''}
              onChange={(e) => set('rating', e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Choose rating</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'star' : 'stars'}
                </option>
              ))}
            </select>
          </Field>
        )}
        {input.kind === 'find' && (
          <>
            <Field label="Find name" wide>
              <input
                maxLength={120}
                value={input.itemName ?? ''}
                onChange={(e) => set('itemName', e.target.value)}
              />
            </Field>
            <Field label="Price spotted ($, optional)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={input.priceMin ?? ''}
                onChange={(e) => {
                  const price = e.target.value === '' ? undefined : Number(e.target.value);
                  setInput((i) => ({ ...i, priceMin: price, priceMax: price }));
                  setConfirmed(false);
                }}
              />
            </Field>
          </>
        )}
        {['find', 'layout', 'parking', 'accessibility'].includes(input.kind) && (
          <Field label="Area or aisle (optional)" wide>
            <input
              maxLength={100}
              value={input.area ?? ''}
              onChange={(e) => set('area', e.target.value)}
            />
          </Field>
        )}
        <Field label="What did you notice?" wide>
          <textarea
            required
            minLength={3}
            maxLength={600}
            rows={3}
            value={input.details}
            onChange={(e) => set('details', e.target.value)}
          />
        </Field>
        <label className="checkbox-label community-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{' '}
          I observed this or checked the store’s announcement, and understand this update will be
          public.
        </label>
        {error && (
          <p role="alert" className="community-error">
            {error}
          </p>
        )}
        <button className="btn primary full" type="submit" disabled={busy || !confirmed}>
          {busy ? 'Sharing…' : 'Publish community update'}
        </button>
      </form>
    </Modal>
  );
}

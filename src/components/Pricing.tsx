import { useState } from 'react';
import { ArrowRight, Download, FilePenLine, Plus, Trash2, TrendingUp, Info } from 'lucide-react';
import { useWorkspace } from '../lib/context';
import {
  dollars,
  draftSchema,
  itemKey,
  today,
  uid,
  type Draft,
  type InventoryItem,
} from '../lib/model';
import { examples, sampleComps } from '../lib/seed';
import { channelSuggestion, marketplaces } from '../lib/marketplaces';
import { pricing } from '../lib/scoring';
import { download } from '../lib/storage';
import { ComparableForm } from './comps';
import { Empty, Field, Modal, PageHeading, Tag } from './ui';
export function itemComps(
  item: InventoryItem,
  stored: ReturnType<typeof useWorkspace>['state']['comps'],
) {
  const key = Object.keys(examples).find((k) => itemKey(examples[k]) === itemKey(item));
  return [...stored, ...(item.evidence === 'demo' && key ? sampleComps(key) : [])];
}
export function Pricing() {
  const { state, setState, navigate } = useWorkspace();
  const [selected, setSelected] = useState('');
  const [comp, setComp] = useState(false);
  const [draft, setDraft] = useState<Draft | InventoryItem | null>(null);
  const stock = state.inventory.filter((i) => i.mode === 'merchant' && i.status !== 'Sold');
  const item = stock.find((i) => i.id === selected) ?? stock[0];
  const comps = item ? itemComps(item, state.comps) : [];
  const estimate = item ? pricing(item, comps, state.merchant) : null;
  const days = item
    ? Math.max(0, Math.floor((Date.now() - new Date(item.added).getTime()) / 86400000))
    : 0;
  return (
    <>
      <PageHeading
        eyebrow="PRICE WITH PERSPECTIVE"
        title="A little market sense."
        action={
          item && (
            <button className="btn primary" onClick={() => setComp(true)}>
              <Plus size={17} /> Add a comparable
            </button>
          )
        }
      >
        Evidence first. Your margins, always in the picture.
      </PageHeading>
      {item ? (
        <>
          <section className="card pricing-selector">
            <Field label="Explore pricing for">
              <select value={item.id} onChange={(e) => setSelected(e.target.value)}>
                {stock.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title} · {i.store}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="eyebrow">INVENTORY AGE</span>
              <strong>{days} days</strong>
            </div>
            <div>
              <span className="eyebrow">SOLD COMPS USED</span>
              <strong>{estimate?.sold.length ?? 0}</strong>
            </div>
            <Tag tone={item.evidence === 'demo' ? 'amber' : ''}>
              {item.evidence === 'demo' ? 'Fictional sample data' : 'User-entered evidence'}
            </Tag>
          </section>
          <section className="card">
            <div className="card-top">
              <h2>
                <TrendingUp size={19} /> Channel price planner
              </h2>
              <Tag>Suggestions only</Tag>
            </div>
            <p className="muted">
              Recent sold comps set the starting point. After 30 days, a 3% weekly markdown (up to
              15%) is applied, while preserving your target profit. A floor above market may make
              the item hard to sell.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Suggested ask</th>
                    <th>Estimated net</th>
                    <th>Evidence</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {marketplaces.slice(0, 5).map((m) => {
                    const suggestion = channelSuggestion(item, comps, state.merchant, m.name, days);
                    return (
                      <tr key={m.id}>
                        <td>
                          <span className="channel-name">
                            <span className="market-icon" style={{ background: m.color }}>
                              {m.initial}
                            </span>
                            {m.name}
                          </span>
                        </td>
                        <td>
                          <strong>{suggestion ? dollars(suggestion.price) : '—'}</strong>
                          {suggestion?.aboveMarket && (
                            <small className="amber-text">Profit floor exceeds market</small>
                          )}
                        </td>
                        <td>{suggestion ? dollars(suggestion.profit) : '—'}</td>
                        <td>
                          <small>
                            {suggestion?.evidence ?? 'Add sold comps'}
                            <br />
                            {suggestion && `${Math.round(suggestion.markdown * 100)}% age markdown`}
                          </small>
                        </td>
                        <td>
                          <button className="text-link" onClick={() => setDraft(item)}>
                            Draft <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="micro">
              One editable planning fee is used for all channels: {state.merchant.feePercent}% +{' '}
              {dollars(state.merchant.fixedFee)}. Shipping {dollars(state.merchant.shipping)},
              handling {dollars(state.merchant.handling)}, repairs {dollars(item.repair)}. No prices
              are changed on any marketplace.
            </p>
          </section>
          <section className="card comps-workspace">
            <div className="card-top">
              <h2>Comparable evidence</h2>
              <Tag>{estimate?.confidence ?? 'No sold evidence'}</Tag>
            </div>
            {comps.filter((c) => c.key === itemKey(item)).length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Price / type</th>
                      <th>Condition</th>
                      <th>Date</th>
                      <th>Provenance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps
                      .filter((c) => c.key === itemKey(item))
                      .map((c) => (
                        <tr key={c.id}>
                          <td>
                            {c.url && /^https?:\/\//i.test(c.url) ? (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-link"
                              >
                                {c.platform} ↗
                              </a>
                            ) : (
                              c.platform
                            )}
                          </td>
                          <td>
                            {dollars(c.price)} <Tag>{c.kind}</Tag>
                          </td>
                          <td>{c.condition}</td>
                          <td>{c.date}</td>
                          <td>{c.source === 'demo' ? 'Fictional' : 'User-entered'}</td>
                          <td>
                            {c.source !== 'demo' && (
                              <button
                                className="icon-btn danger"
                                aria-label={`Delete comparable ${c.platform} ${c.price}`}
                                onClick={() =>
                                  setState((s) => ({
                                    ...s,
                                    comps: s.comps.filter((x) => x.id !== c.id),
                                  }))
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No evidence yet. Add a comparable sale to start estimating.</p>
            )}
            <p className="micro">
              Only positive sold prices for the exact item key and condition, dated within 90 days
              and not in the future, enter the median/range. Asking prices never count as realized
              value. There is no live market feed.
            </p>
          </section>
        </>
      ) : (
        <Empty
          title="Give your finds some price context."
          action={
            <button className="btn primary" onClick={() => navigate('scan')}>
              Scan a merchant find <ArrowRight size={17} />
            </button>
          }
        >
          Save an item to merchant inventory to compare prices, model costs, and prepare a listing.
        </Empty>
      )}
      <div className="section-line">
        <h2>
          Listing drafts <Tag>{state.drafts.length}</Tag>
        </h2>
      </div>
      {state.drafts.length ? (
        <div className="draft-grid">
          {state.drafts.map((d) => {
            const inventory = state.inventory.find((i) => i.id === d.itemId);
            return (
              <article className="card" key={d.id}>
                <div className="card-top">
                  <Tag>{marketplaces.find((m) => m.id === d.platform)?.name ?? d.platform}</Tag>
                  <Tag tone="amber">Local draft</Tag>
                </div>
                <h3>{d.title}</h3>
                <p className="draft-description">{d.description}</p>
                <div className="draft-price">
                  {dollars(d.price)} <small>asking price</small>
                </div>
                <div className="draft-actions">
                  <button className="btn secondary" onClick={() => exportDraft(d)}>
                    <Download size={15} /> Export
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Edit draft ${d.title}`}
                    onClick={() => setDraft(d)}
                  >
                    <FilePenLine size={17} />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={`Delete draft ${d.title}`}
                    onClick={() =>
                      setState((s) => ({ ...s, drafts: s.drafts.filter((x) => x.id !== d.id) }))
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                {inventory?.status === 'Sold' && (
                  <p className="error">Item recorded as sold. Do not publish this draft.</p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">
          Your listing workspace is ready. Drafts are saved locally and can be exported for manual
          posting.
        </p>
      )}
      <div className="notice">
        <Info size={18} />
        <div>
          All marketplace connections are disconnected. Automatic publishing, repricing, sales sync,
          and cross-listing removal require real adapters and authorized accounts.
        </div>
      </div>
      {comp && item && (
        <Modal title="Add a comparable" close={() => setComp(false)}>
          <ComparableForm
            item={item}
            onSave={(c) => {
              setState((s) => ({ ...s, comps: [c, ...s.comps] }));
              setComp(false);
            }}
          />
        </Modal>
      )}
      {draft && (
        <Modal
          title={'description' in draft ? 'Edit listing draft' : 'Prepare a listing'}
          close={() => setDraft(null)}
        >
          <ListingForm
            item={
              'description' in draft ? state.inventory.find((i) => i.id === draft.itemId)! : draft
            }
            draft={'description' in draft ? draft : undefined}
            close={() => setDraft(null)}
          />
        </Modal>
      )}
    </>
  );
}
export function ListingForm({
  item,
  draft,
  close,
}: {
  item: InventoryItem;
  draft?: Draft;
  close: () => void;
}) {
  const { state, setState, toast } = useWorkspace();
  const [platform, setPlatform] = useState(draft?.platform ?? 'ebay');
  const [error, setError] = useState('');
  const comps = itemComps(item, state.comps);
  const suggested = channelSuggestion(
    item,
    comps,
    state.merchant,
    marketplaces.find((m) => m.id === platform)?.name ?? platform,
  );
  const defaultPrice = draft?.price ?? suggested?.price ?? item.cost;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const parsed = draftSchema.safeParse({
          id: draft?.id ?? uid(),
          itemId: item.id,
          platform,
          title: String(data.get('title')),
          description: String(data.get('description')),
          price: Number(data.get('price')),
          updated: new Date().toISOString(),
        });
        if (!parsed.success || parsed.data.price <= 0) {
          setError('Add a title, description, and positive asking price.');
          return;
        }
        setState((s) => ({
          ...s,
          drafts: [parsed.data, ...s.drafts.filter((d) => d.id !== parsed.data.id)],
        }));
        toast('Listing draft saved locally');
        close();
      }}
    >
      <div className="notice">
        <Info size={17} />
        <div>
          No marketplace account is connected. This saves a local draft for manual export; nothing
          is published.
        </div>
      </div>
      {item.evidence === 'demo' && (
        <p className="micro amber-text">
          This is a sample item. Replace all example details before listing a real product.
        </p>
      )}
      <div className="form-grid">
        <Field label="Marketplace">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {marketplaces.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Listing price ($)">
          <input
            key={draft?.id ?? platform}
            name="price"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            defaultValue={defaultPrice}
            required
          />
        </Field>
        <Field label="Listing title" wide>
          <input
            name="title"
            defaultValue={
              draft?.title ?? `${item.brand ? item.brand + ' ' : ''}${item.title} ${item.size}`
            }
            required
            maxLength={120}
          />
        </Field>
        <Field label="Description" wide>
          <textarea
            name="description"
            rows={5}
            required
            maxLength={4000}
            defaultValue={
              draft?.description ??
              `${item.title}\nBrand: ${item.brand || 'Unknown'}\nSize: ${item.size || 'Check measurements'}\nColor: ${item.color || 'Not specified'}\nCondition: ${item.condition}\n${item.notes}\nPlease review all measurements and condition details before purchasing.`
            }
          />
        </Field>
      </div>
      <p className="micro">
        {suggested
          ? `Planner suggestion: ${dollars(suggested.price)} using ${suggested.evidence.toLowerCase()}.`
          : 'No comparable evidence. The starting price is your purchase cost, not a valuation.'}{' '}
        Add photos and all required platform fields manually.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn primary full" type="submit">
        Save local draft
      </button>
    </form>
  );
}
export function exportDraft(d: Draft) {
  download(
    `thrifty-${d.platform}-draft.txt`,
    `${d.title}\n\n${d.description}\n\nAsking price: ${dollars(d.price)} USD\nChannel: ${d.platform}\nStatus: LOCAL DRAFT — not published\nUpdated: ${d.updated}`,
    'text/plain',
  );
}

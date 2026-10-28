import { useState } from 'react';
import { ArrowRight, Plus, Settings2, Search, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useWorkspace } from '../lib/context';
import {
  categories,
  dollars,
  merchantSchema,
  saleSchema,
  today,
  uid,
  type InventoryItem,
} from '../lib/model';
import { Empty, Fact, Field, ItemArt, Modal, PageHeading, Tag } from './ui';
import { ListingForm } from './Pricing';
export function Merchant() {
  const { state, setState, navigate, toast } = useWorkspace();
  const [settings, setSettings] = useState(false);
  const [sale, setSale] = useState<InventoryItem | null>(null);
  const [listing, setListing] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  const [showSold, setShowSold] = useState(false);
  const inventory = state.inventory.filter((i) => i.mode === 'merchant');
  const visible = inventory.filter(
    (i) =>
      (showSold || i.status !== 'Sold') &&
      `${i.title} ${i.brand} ${i.store}`.toLowerCase().includes(search.toLowerCase()),
  );
  const net = state.sales
    .filter((s) => !s.demo)
    .reduce((sum, s) => sum + s.soldFor - s.cost - s.expenses, 0);
  return (
    <>
      <PageHeading
        eyebrow="THE BUSINESS OF GOOD FINDS"
        title="Your shop, in good company."
        action={
          <button className="btn secondary" onClick={() => setSettings(true)}>
            <Settings2 size={17} /> Shop settings
          </button>
        }
      >
        {state.merchant.name} · Sourcing from {state.merchant.sourceStore || 'any store'}
      </PageHeading>
      <div className="stats-grid">
        <Fact
          label="Items in stock"
          value={inventory.filter((i) => i.status === 'In stock').length}
          note="Saved to this device"
        />
        <Fact
          label="Invested in stock"
          value={dollars(
            inventory
              .filter((i) => i.status === 'In stock')
              .reduce((s, i) => s + i.cost + i.repair, 0),
          )}
          note="Purchase + repairs"
        />
        <Fact
          label="Recorded net profit"
          value={dollars(net)}
          note={`${state.sales.filter((s) => !s.demo).length} self-reported sales`}
        />
        <Fact
          label="Target per find"
          value={dollars(state.merchant.targetProfit)}
          note={`${state.merchant.minMargin}% minimum margin`}
        />
      </div>
      <div className="tabs-toolbar">
        <h2>
          Merchant inventory <Tag>{inventory.length} items</Tag>
        </h2>
        <button className="btn primary" onClick={() => navigate('scan')}>
          <Plus size={17} /> Scan a find
        </button>
      </div>
      <div className="inventory-toolbar">
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="Search merchant inventory"
            placeholder="Search items, brands or source stores"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={showSold}
            onChange={(e) => setShowSold(e.target.checked)}
          />{' '}
          Include sold
        </label>
      </div>
      {visible.length ? (
        <div className="inventory-grid">
          {visible.map((i) => (
            <article className="card inventory-card" key={i.id}>
              <div className="inventory-art">
                <ItemArt
                  kind={
                    i.category === 'Home' ? 'lamp' : i.category === 'Pet gear' ? 'pet' : 'fleece'
                  }
                  small
                />
                <Tag>{i.status}</Tag>
              </div>
              <div className="inventory-body">
                <span className="eyebrow">{i.store || 'Source not recorded'}</span>
                <h3>{i.title}</h3>
                <p>
                  {i.brand || 'Unbranded'} · {i.size || 'No size'} · {i.condition}
                </p>
                <div className="goal-specs">
                  <Tag>{dollars(i.cost)} paid</Tag>
                  {i.evidence === 'demo' && <Tag tone="amber">Sample item</Tag>}
                </div>
                {i.status !== 'Sold' && (
                  <>
                    <button className="btn secondary full" onClick={() => setListing(i)}>
                      <TagIcon size={15} /> Create listing draft
                    </button>
                    <div className="goal-footer">
                      <button className="text-link" onClick={() => setSale(i)}>
                        Record a sale <ArrowRight size={15} />
                      </button>
                      <button
                        className="icon-btn danger"
                        aria-label={`Remove ${i.title}`}
                        onClick={() => {
                          if (confirm('Remove this item and its listing drafts?'))
                            setState((s) => ({
                              ...s,
                              inventory: s.inventory.filter((x) => x.id !== i.id),
                              drafts: s.drafts.filter((d) => d.itemId !== i.id),
                            }));
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Your next chapter starts with a find."
          action={
            <button className="btn primary" onClick={() => navigate('scan')}>
              Find your first item <ArrowRight size={17} />
            </button>
          }
        >
          Scan an item and save it in merchant mode to start your inventory. Clear filters to see
          more items.
        </Empty>
      )}
      {state.sales.length > 0 && (
        <section className="card sales-history">
          <div className="card-top">
            <h2>Your sales history</h2>
            <Tag>Self-reported</Tag>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item / source</th>
                  <th>Sold</th>
                  <th>Costs + expenses</th>
                  <th>Net profit</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {state.sales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.title}</strong>
                      <small>{s.store}</small>
                    </td>
                    <td>{dollars(s.soldFor)}</td>
                    <td>{dollars(s.cost + s.expenses)}</td>
                    <td>{dollars(s.soldFor - s.cost - s.expenses)}</td>
                    <td>{s.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {settings && (
        <Modal title="Your shop settings" close={() => setSettings(false)}>
          <ShopForm close={() => setSettings(false)} />
        </Modal>
      )}
      {sale && (
        <Modal title="Record a sale" close={() => setSale(null)}>
          <SaleForm item={sale} close={() => setSale(null)} />
        </Modal>
      )}
      {listing && (
        <Modal title="Prepare a listing" close={() => setListing(null)}>
          <ListingForm item={listing} close={() => setListing(null)} />
        </Modal>
      )}
    </>
  );
}
function ShopForm({ close }: { close: () => void }) {
  const { state, setState, toast } = useWorkspace();
  const [error, setError] = useState('');
  const m = state.merchant;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget));
        const fields = [
          'targetProfit',
          'shipping',
          'handling',
          'minMargin',
          'feePercent',
          'fixedFee',
        ];
        for (const f of fields) (d as Record<string, unknown>)[f] = Number(d[f]);
        const parsed = merchantSchema.safeParse(d);
        if (!parsed.success) {
          setError(
            'Check your settings. Costs must be positive; fee is 0–50% and minimum margin 0–100%.',
          );
          return;
        }
        setState((s) => ({ ...s, merchant: parsed.data }));
        toast('Shop settings saved');
        close();
      }}
    >
      <p className="muted">
        Tell Thrifty about your current or planned shop. These planning costs apply to every
        channel; replace them with your actual fees before listing.
      </p>
      <div className="form-grid">
        <Field label="Shop name" wide>
          <input name="name" required defaultValue={m.name} maxLength={80} />
        </Field>
        <Field label="Shop focus">
          <select name="niche" defaultValue={m.niche}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Usual source store">
          <input name="sourceStore" defaultValue={m.sourceStore} maxLength={100} />
        </Field>
        {[
          ['targetProfit', 'Target net profit ($)'],
          ['minMargin', 'Minimum net margin (%)'],
          ['shipping', 'Seller shipping cost ($)'],
          ['handling', 'Handling / labor ($)'],
          ['feePercent', 'Planning fee (%)'],
          ['fixedFee', 'Fixed fee per sale ($)'],
        ].map(([name, label]) => (
          <Field key={name} label={label}>
            <input
              name={name}
              type="number"
              min="0"
              max={name === 'feePercent' ? 50 : name === 'minMargin' ? 100 : 1000000}
              step="0.01"
              required
              defaultValue={m[name as keyof typeof m]}
            />
          </Field>
        ))}
      </div>
      <p className="micro">
        USD throughout. Estimates exclude taxes, returns and any costs you do not enter. Fees are
        planning assumptions, not current marketplace rates.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn primary full" type="submit">
        Save shop settings
      </button>
    </form>
  );
}
function SaleForm({ item, close }: { item: InventoryItem; close: () => void }) {
  const { state, setState, toast } = useWorkspace();
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const parsed = saleSchema.safeParse({
          id: uid(),
          itemId: item.id,
          title: item.title,
          category: item.category,
          store: item.store,
          cost: item.cost,
          soldFor: Number(d.get('soldFor')),
          expenses: Number(d.get('expenses')),
          date: String(d.get('date')),
          demo: item.evidence === 'demo',
        });
        if (!parsed.success || parsed.data.date > today()) {
          setError('Check the sale amount, expenses, and date.');
          return;
        }
        setState((s) => {
          if (s.sales.some((x) => x.itemId === item.id)) return s;
          return {
            ...s,
            inventory: s.inventory.map((i) => (i.id === item.id ? { ...i, status: 'Sold' } : i)),
            sales: [parsed.data, ...s.sales],
          };
        });
        toast('Sale recorded; inventory updated');
        close();
      }}
    >
      <p className="muted">
        {item.title} · purchase cost {dollars(item.cost)}. Recording a sale updates this device
        only; it does not delist items on any marketplace.
      </p>
      {item.evidence === 'demo' && (
        <p className="notice">
          Sample item sales are excluded from personal performance and score history.
        </p>
      )}
      <div className="form-grid">
        <Field label="Sold for ($)">
          <input name="soldFor" type="number" min="0.01" max="1000000" step="0.01" required />
        </Field>
        <Field label="All other actual expenses ($)">
          <input
            name="expenses"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
            defaultValue={item.repair}
          />
        </Field>
        <Field label="Sale date" wide>
          <input type="date" name="date" max={today()} defaultValue={today()} required />
        </Field>
      </div>
      <p className="micro">
        Expenses must include repairs, cleaning, shipping, fees, labor and refunds. Purchase cost is
        included separately.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn primary full" type="submit">
        Record sale
      </button>
    </form>
  );
}

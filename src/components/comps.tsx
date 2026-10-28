import { useState } from 'react';
import {
  compSchema,
  conditionNames,
  itemKey,
  today,
  uid,
  type Candidate,
  type Comparable,
} from '../lib/model';
import { Field } from './ui';
export function ComparableForm({
  item,
  onSave,
}: {
  item: Candidate;
  onSave: (comp: Comparable) => void;
}) {
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const value = {
          id: uid(),
          key: itemKey(item),
          title: item.title,
          platform: String(data.get('platform')),
          price: Number(data.get('price')),
          kind: data.get('kind'),
          date: data.get('date'),
          source: 'manual',
          url: String(data.get('url')),
          condition: data.get('condition'),
        };
        const parsed = compSchema.safeParse(value);
        if (
          !parsed.success ||
          value.price <= 0 ||
          String(value.date) > today() ||
          (value.url && !/^https?:\/\//i.test(value.url))
        ) {
          setError(
            'Enter a positive price, a valid past date, and an http(s) source URL if provided.',
          );
          return;
        }
        onSave(parsed.data);
      }}
    >
      <p className="muted">
        Record a comparable for <strong>{item.title}</strong>. Match the brand, model, size and
        condition yourself. User-entered evidence is not independently verified.
      </p>
      <div className="form-grid">
        <Field label="Marketplace">
          <input name="platform" required maxLength={40} placeholder="eBay" />
        </Field>
        <Field label="Price ($)">
          <input name="price" type="number" required min="0.01" max="1000000" step="0.01" />
        </Field>
        <Field label="Price type">
          <select name="kind">
            <option value="sold">Sold price</option>
            <option value="asking">Asking price</option>
          </select>
        </Field>
        <Field label="Sale / observation date">
          <input name="date" type="date" required max={today()} defaultValue={today()} />
        </Field>
        <Field label="Comparable condition">
          <select name="condition" defaultValue={item.condition}>
            {conditionNames.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Source URL (optional)">
          <input type="url" name="url" maxLength={1000} placeholder="https://…" />
        </Field>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary full" type="submit">
        Save comparable
      </button>
    </form>
  );
}

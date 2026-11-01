import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { allPlaces } from '../lib/catalogue';
import { useWorkspace } from '../lib/context';
import { purchaseLocationSchema, type Candidate, type PurchaseLocation } from '../lib/model';
import { Field, Modal } from './ui';

export function PurchaseLocationTag({
  item,
  editableItemId,
}: {
  item: Pick<Candidate, 'store' | 'purchaseLocation'>;
  editableItemId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const location = item.purchaseLocation;
  const destination = location ? [location.name, location.address].filter(Boolean).join(', ') : '';
  return (
    <div className="purchase-location">
      {location ? (
        <>
          <p className="micro">
            <MapPin size={14} aria-hidden="true" /> Purchased at {location.name}
          </p>
          {location.address && <small>{location.address}</small>}
          {location.address && (
            <a
              className="text-link"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`}
              target="_blank"
              rel="noreferrer"
            >
              Directions to purchase location
            </a>
          )}
        </>
      ) : item.store ? (
        <p className="micro">
          <MapPin size={14} aria-hidden="true" /> Source store: {item.store}
        </p>
      ) : (
        <p className="micro">Purchase location not recorded</p>
      )}
      {editableItemId && (
        <button className="text-link" onClick={() => setEditing(true)}>
          Edit purchase location
        </button>
      )}
      {editing && editableItemId && (
        <LocationEditor item={item} itemId={editableItemId} close={() => setEditing(false)} />
      )}
    </div>
  );
}
function LocationEditor({
  item,
  itemId,
  close,
}: {
  item: Pick<Candidate, 'store' | 'purchaseLocation'>;
  itemId: string;
  close: () => void;
}) {
  const { setState, toast } = useWorkspace();
  const [location, setLocation] = useState<PurchaseLocation>(
    item.purchaseLocation ?? { name: item.store, address: '' },
  );
  const [error, setError] = useState('');
  return (
    <Modal title="Purchase location" close={close}>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const empty = !location.name.trim() && !location.address.trim();
          const parsed = purchaseLocationSchema.safeParse(location);
          if (!empty && !parsed.success) {
            setError('Enter a store or market name, or clear both fields to remove the location.');
            return;
          }
          const value = empty ? undefined : parsed.success ? parsed.data : undefined;
          setState((state) => ({
            ...state,
            inventory: state.inventory.map((saved) =>
              saved.id === itemId
                ? { ...saved, store: value?.name.slice(0, 100) ?? '', purchaseLocation: value }
                : saved,
            ),
          }));
          toast('Purchase location saved on this device');
          close();
        }}
      >
        <Field label="Listed purchase location" wide>
          <select
            value={location.placeId ?? ''}
            onChange={(event) => {
              const place = allPlaces.find((p) => p.id === event.target.value);
              setLocation(
                place
                  ? {
                      name: place.name,
                      address: place.address,
                      placeId: place.id,
                      point: { lat: place.lat, lng: place.lng },
                    }
                  : { name: '', address: '' },
              );
            }}
          >
            <option value="">Enter manually / clear location</option>
            {[...allPlaces]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.address}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Purchase store or market" wide>
          <input
            value={location.name}
            maxLength={160}
            onChange={(event) =>
              setLocation({ name: event.target.value, address: location.address })
            }
          />
        </Field>
        <Field label="Purchase address" wide>
          <input
            value={location.address}
            maxLength={300}
            onChange={(event) => setLocation({ name: location.name, address: event.target.value })}
          />
        </Field>
        <p className="micro">
          Kept with this item on your device. Your GPS is not recorded or shared.
        </p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="btn primary">
          Save purchase location
        </button>
      </form>
    </Modal>
  );
}

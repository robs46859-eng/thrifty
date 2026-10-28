import { useState } from 'react';
import {
  Plus,
  ArrowRight,
  Check,
  Baby,
  PawPrint,
  UserRound,
  Pencil,
  Trash2,
  Search,
  Package,
} from 'lucide-react';
import { useWorkspace } from '../lib/context';
import {
  categories,
  dollars,
  goalSchema,
  profileSchema,
  uid,
  type Goal,
  type Profile,
} from '../lib/model';
import { Empty, Field, ItemArt, Modal, PageHeading, Tag } from './ui';
export function Household() {
  const { state, setState, navigate, toast } = useWorkspace();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [profile, setProfile] = useState<Profile | 'new' | null>(null);
  const [tab, setTab] = useState('goals');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const owned = state.inventory.filter(
    (i) =>
      i.mode === 'household' &&
      (filter === 'all' || i.ownerId === filter) &&
      `${i.title} ${i.brand} ${i.notes}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="A PLACE FOR EVERYONE"
        title="Your household, considered."
        action={
          <button
            className="btn primary"
            onClick={() => setEditing('new')}
            disabled={!state.profiles.length}
          >
            <Plus size={18} /> Add a shopping goal
          </button>
        }
      >
        Less guesswork. More things you actually need.
      </PageHeading>
      <div className="section-line">
        <h2>
          The whole crew <Tag>{state.profiles.length} profiles</Tag>
        </h2>
        <button className="text-link" onClick={() => setProfile('new')}>
          <Plus size={16} /> Add person or pet
        </button>
      </div>
      <div className="profile-grid">
        {state.profiles.map((p) => {
          const Icon = p.kind === 'Child' ? Baby : p.kind === 'Pet' ? PawPrint : UserRound;
          return (
            <div className={`profile-card ${filter === p.id ? 'active' : ''}`} key={p.id}>
              <button
                className="profile-filter"
                aria-pressed={filter === p.id}
                onClick={() => setFilter(filter === p.id ? 'all' : p.id)}
              >
                <span className={`avatar ${p.kind.toLowerCase()}`}>
                  <Icon size={23} />
                </span>
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.kind} · {p.size || 'Add a size'}
                  </p>
                  <small>
                    {state.goals.filter((g) => g.personId === p.id && !g.fulfilled).length} open
                    goals
                  </small>
                </div>
              </button>
              <button
                className="edit-profile"
                aria-label={`Edit ${p.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setProfile(p);
                }}
              >
                <Pencil size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="tabs-toolbar">
        <div className="tabs">
          <button className={tab === 'goals' ? 'active' : ''} onClick={() => setTab('goals')}>
            Shopping goals <span>{state.goals.filter((g) => !g.fulfilled).length}</span>
          </button>
          <button
            className={tab === 'inventory' ? 'active' : ''}
            onClick={() => setTab('inventory')}
          >
            Household inventory{' '}
            <span>{state.inventory.filter((i) => i.mode === 'household').length}</span>
          </button>
        </div>
        {filter !== 'all' && (
          <button className="text-link" onClick={() => setFilter('all')}>
            Show everyone
          </button>
        )}
      </div>
      {tab === 'goals' ? (
        <div className="goal-grid">
          {state.goals
            .filter((g) => filter === 'all' || g.personId === filter)
            .map((g) => (
              <article className={`card goal-card ${g.fulfilled ? 'fulfilled' : ''}`} key={g.id}>
                <div className="card-top">
                  <Tag tone={g.fulfilled ? '' : g.priority === 'Soon' ? 'amber' : ''}>
                    {g.fulfilled
                      ? 'Found it'
                      : g.priority === 'Soon'
                        ? 'On the lookout'
                        : 'Whenever it finds you'}
                  </Tag>
                  <button
                    className="icon-btn"
                    aria-label={`Edit ${g.title}`}
                    onClick={() => setEditing(g)}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <span className="eyebrow">
                  {state.profiles.find((p) => p.id === g.personId)?.name} · {g.category}
                </span>
                <h3>{g.title}</h3>
                <p>{g.purpose || 'Add a purpose to shop with intention.'}</p>
                <div className="goal-specs">
                  {[g.size, g.color, g.theme].filter(Boolean).map((s, i) => (
                    <Tag key={i}>{s}</Tag>
                  ))}
                </div>
                <div className="goal-footer">
                  <div>
                    <span>Budget</span>
                    <strong>{dollars(g.budget)}</strong>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => {
                      setState((s) => ({
                        ...s,
                        goals: s.goals.map((x) =>
                          x.id === g.id ? { ...x, fulfilled: !x.fulfilled } : x,
                        ),
                      }));
                      toast(g.fulfilled ? 'Goal reopened' : 'Goal marked found');
                    }}
                  >
                    <Check size={16} />
                    {g.fulfilled ? 'Reopen goal' : 'Mark found'}
                  </button>
                </div>
              </article>
            ))}
          <button
            className="add-goal-card"
            onClick={() => setEditing('new')}
            disabled={!state.profiles.length}
          >
            <span>
              <Plus size={24} />
            </span>
            <h3>What are you looking for?</h3>
            <p>A little intention goes a long way.</p>
          </button>
        </div>
      ) : (
        <>
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search household inventory"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your household inventory"
            />
          </label>
          {owned.length ? (
            <div className="inventory-grid">
              {owned.map((i) => (
                <article className="card inventory-card" key={i.id}>
                  <div className="inventory-art">
                    <ItemArt
                      kind={
                        i.category === 'Pet gear'
                          ? 'pet'
                          : i.category === 'Home'
                            ? 'lamp'
                            : 'fleece'
                      }
                      small
                    />
                    <Tag>{i.status}</Tag>
                  </div>
                  <div className="inventory-body">
                    <span className="eyebrow">
                      {state.profiles.find((p) => p.id === i.ownerId)?.name}
                    </span>
                    <h3>{i.title}</h3>
                    <p>
                      {i.brand} · {i.size || 'No size'} · {i.condition}
                    </p>
                    <div className="goal-specs">
                      <Tag>{i.color || 'No color'}</Tag>
                      <Tag>{i.theme || i.category}</Tag>
                      {i.evidence === 'demo' && <Tag tone="amber">Sample item</Tag>}
                    </div>
                    {i.notes && <p className="micro">{i.notes}</p>}
                    <div className="goal-footer">
                      <strong>{dollars(i.cost)} paid</strong>
                      <button
                        className="icon-btn danger"
                        aria-label={`Remove ${i.title}`}
                        onClick={() => {
                          if (confirm('Remove this item from household inventory?'))
                            setState((s) => ({
                              ...s,
                              inventory: s.inventory.filter((x) => x.id !== i.id),
                            }));
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Make room for the good finds."
              action={
                <button className="btn primary" onClick={() => navigate('scan')}>
                  Scan your first find <ArrowRight size={16} />
                </button>
              }
            >
              Items you save for your household will live here. Try another person or search if
              you’re filtering.
            </Empty>
          )}
        </>
      )}
      <div className="notice">
        <Package size={19} />
        <div>
          Starter profiles and goals are examples you can edit. Household records stay on this
          browser; use Workspace to export a backup. Measure children and pets carefully before
          buying.
        </div>
      </div>
      {editing && (
        <Modal
          title={editing === 'new' ? 'A new shopping goal' : 'Edit shopping goal'}
          close={() => setEditing(null)}
        >
          <GoalForm
            value={editing === 'new' ? undefined : editing}
            onSave={(g) => {
              setState((s) => ({ ...s, goals: [...s.goals.filter((x) => x.id !== g.id), g] }));
              setEditing(null);
              toast('Shopping goal saved');
            }}
            onDelete={
              editing !== 'new'
                ? () => {
                    setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== editing.id) }));
                    setEditing(null);
                  }
                : undefined
            }
          />
        </Modal>
      )}
      {profile && (
        <Modal
          title={profile === 'new' ? 'Add to your household' : `Edit ${profile.name}`}
          close={() => setProfile(null)}
        >
          <ProfileForm
            value={profile === 'new' ? undefined : profile}
            onSave={(p) => {
              setState((s) => ({
                ...s,
                profiles: [...s.profiles.filter((x) => x.id !== p.id), p],
              }));
              setProfile(null);
              toast('Profile saved');
            }}
            onDelete={
              profile !== 'new' &&
              !state.goals.some((g) => g.personId === profile.id) &&
              !state.inventory.some((i) => i.ownerId === profile.id)
                ? () => {
                    setState((s) => ({
                      ...s,
                      profiles: s.profiles.filter((p) => p.id !== profile.id),
                    }));
                    setFilter('all');
                    setProfile(null);
                  }
                : undefined
            }
          />
        </Modal>
      )}
    </>
  );
}
function GoalForm({
  value,
  onSave,
  onDelete,
}: {
  value?: Goal;
  onSave: (g: Goal) => void;
  onDelete?: () => void;
}) {
  const { state } = useWorkspace();
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget));
        const parsed = goalSchema.safeParse({
          ...d,
          budget: Number(d.budget),
          id: value?.id ?? uid(),
          fulfilled: value?.fulfilled ?? false,
        });
        if (!parsed.success) {
          setError('Please check the goal fields.');
          return;
        }
        onSave(parsed.data);
      }}
    >
      <div className="form-grid">
        <Field label="What are you looking for?" wide>
          <input
            name="title"
            required
            maxLength={100}
            defaultValue={value?.title}
            placeholder="A jacket for rainy school days"
          />
        </Field>
        <Field label="For">
          <select name="personId" defaultValue={value?.personId}>
            {state.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.kind}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={value?.category}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Size / dimensions">
          <input name="size" maxLength={40} defaultValue={value?.size} />
        </Field>
        <Field label="Color">
          <input name="color" maxLength={40} defaultValue={value?.color} />
        </Field>
        <Field label="Theme / style">
          <input name="theme" maxLength={60} defaultValue={value?.theme} />
        </Field>
        <Field label="Budget ($)">
          <input
            name="budget"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
            defaultValue={value?.budget ?? 20}
          />
        </Field>
        <Field label="When do you need it?">
          <select name="priority" defaultValue={value?.priority}>
            <option>Soon</option>
            <option>Whenever</option>
          </select>
        </Field>
        <Field label="Purpose" wide>
          <textarea name="purpose" rows={2} maxLength={200} defaultValue={value?.purpose} />
        </Field>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        {onDelete && (
          <button type="button" className="btn danger" onClick={onDelete}>
            <Trash2 size={16} /> Delete goal
          </button>
        )}
        <button className="btn primary" type="submit">
          Save goal
        </button>
      </div>
    </form>
  );
}
function ProfileForm({
  value,
  onSave,
  onDelete,
}: {
  value?: Profile;
  onSave: (p: Profile) => void;
  onDelete?: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = profileSchema.safeParse({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          id: value?.id ?? uid(),
        });
        if (!parsed.success) {
          setError('Please add a name and check the profile details.');
          return;
        }
        onSave(parsed.data);
      }}
    >
      <div className="form-grid">
        <Field label="Name">
          <input name="name" required maxLength={60} defaultValue={value?.name} />
        </Field>
        <Field label="Profile type">
          <select name="kind" defaultValue={value?.kind}>
            <option>Adult</option>
            <option>Child</option>
            <option>Pet</option>
          </select>
        </Field>
        <Field label="Sizes / measurements">
          <input
            name="size"
            maxLength={40}
            defaultValue={value?.size}
            placeholder="M, 4T, chest 18 in"
          />
        </Field>
        <Field label="Favorite colors">
          <input name="colors" maxLength={80} defaultValue={value?.colors} />
        </Field>
        <Field label="Preferences / fit notes" wide>
          <textarea name="notes" rows={3} maxLength={200} defaultValue={value?.notes} />
        </Field>
      </div>
      <p className="micro">
        Shopping goals carry their own size, color, and theme requirements. Updating a profile does
        not change existing goals.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        {onDelete && (
          <button type="button" className="btn danger" onClick={onDelete}>
            Delete profile
          </button>
        )}
        <button className="btn primary" type="submit">
          Save profile
        </button>
      </div>
      {value && !onDelete && (
        <p className="micro">
          Remove this profile’s goals and inventory before deleting the profile.
        </p>
      )}
    </form>
  );
}

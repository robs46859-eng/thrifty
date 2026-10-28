import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  ScanLine,
  RotateCcw,
  ChevronDown,
  ShoppingBag,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useWorkspace } from '../lib/context';
import { blankCandidate, examples, sampleComps } from '../lib/seed';
import {
  candidateSchema,
  categories,
  conditionNames,
  dollars,
  itemKey,
  today,
  uid,
  type Candidate,
  type Comparable,
  type Evidence,
  type Identification,
} from '../lib/model';
import { householdScore, merchantScore, goalLabel } from '../lib/scoring';
import { Field, ItemArt, Modal, Tag, Checked } from './ui';
import { ComparableForm } from './comps';
export function Scan() {
  const { state, setState, mode, setMode, navigate, toast } = useWorkspace();
  const [sample, setSample] = useState<string | null>('fleece');
  const [item, setItem] = useState<Candidate>({
    ...examples.fleece,
    store: state.merchant.sourceStore,
  });
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<Evidence>('demo');
  const [provider, setProvider] = useState('manual');
  const [identification, setIdentification] = useState<Identification | null>(null);
  const [useCloud, setUseCloud] = useState(false);
  const [showComp, setShowComp] = useState(false);
  const [confirmedSave, setConfirmedSave] = useState(false);
  const [owner, setOwner] = useState(state.profiles[0]?.id ?? '');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((x) => setProvider(x.identification))
      .catch(() => setProvider('manual'));
    return () => {
      requestId.current++;
    };
  }, []);
  const comps: Comparable[] = [...state.comps, ...(sample ? sampleComps(sample) : [])];
  const resale = merchantScore(item, comps, state.merchant, state.sales);
  const personal = householdScore(item, state);
  const active = mode === 'merchant' ? resale : personal;
  const update = <K extends keyof Candidate>(key: K, value: Candidate[K]) => {
    setItem((i) => ({ ...i, [key]: value, ...(key === 'reviewed' ? {} : { reviewed: false }) }));
    setConfirmedSave(false);
  };
  function chooseSample(key: string) {
    requestId.current++;
    setBusy(false);
    setSample(key);
    setImage('');
    setItem({ ...examples[key], store: state.merchant.sourceStore });
    setEvidence('demo');
    setIdentification(null);
    setError('');
    setConfirmedSave(false);
  }
  async function photo(file?: File) {
    if (!file) return;
    const id = ++requestId.current;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 4 * 1024 * 1024
    ) {
      setError(
        'Choose a JPEG, PNG or WebP photo up to 4 MB. On iPhone, select a compatible JPEG photo.',
      );
      return;
    }
    setBusy(true);
    setError('');
    setConfirmedSave(false);
    setIdentification(null);
    setSample(null);
    setItem({ ...blankCandidate(), store: state.merchant.sourceStore });
    setEvidence('manual');
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (id !== requestId.current) return;
      setImage(data);
      if (!useCloud || !navigator.onLine) {
        setIdentification({
          provider: 'manual',
          configured: false,
          message: navigator.onLine
            ? 'Photo loaded. Read the label and fill in the details. Your photo stays on this device.'
            : 'You’re offline. Add the details manually; your workspace still works.',
          labels: [],
          text: '',
          suggestion: '',
          confidence: null,
        });
        return;
      }
      const response = await fetch('/api/identify', {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data, useCloud: true }),
      });
      if (!response.ok) throw new Error('Analysis unavailable');
      const result: Identification = await response.json();
      if (id !== requestId.current) return;
      setIdentification(result);
      setEvidence(result.provider);
      if (result.suggestion) setItem((i) => ({ ...i, title: result.suggestion }));
    } catch {
      if (id === requestId.current)
        setError('Cloud analysis is unavailable. You can identify this photo manually below.');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  function save() {
    const parsed = candidateSchema.safeParse(item);
    if (
      !parsed.success ||
      !item.reviewed ||
      (mode === 'household' && !state.profiles.some((p) => p.id === owner))
    ) {
      setError('Check the item details, choose an owner, and confirm your review before saving.');
      return;
    }
    setState((s) => ({
      ...s,
      inventory: [
        {
          ...parsed.data,
          id: uid(),
          added: new Date().toISOString(),
          ownerId: mode === 'household' ? owner : '',
          mode,
          status: mode === 'household' ? 'Owned' : 'In stock',
          evidence,
        },
        ...s.inventory,
      ],
    }));
    setConfirmedSave(true);
    toast(mode === 'household' ? 'Added to household inventory' : 'Added to merchant inventory');
  }
  return (
    <>
      <div className="page-heading scan-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" /> THE SECONDHAND SIDEKICK
          </div>
          <h1>
            Good finds. <em>Better decisions.</em>
          </h1>
          <p>See the potential in what’s in front of you.</p>
        </div>
        <div className="local-note">
          <ShieldCheck size={17} />
          <span>
            Private by default
            <br />
            <small>Saved on this device</small>
          </span>
        </div>
      </div>
      <div className="scan-layout">
        <section className="card scan-card">
          <div className="card-top">
            <h2>
              <ScanLine size={18} /> Your next good find
            </h2>
            <Tag tone={sample ? 'amber' : ''}>
              {sample ? 'Demo example' : image ? 'Your photo' : 'Manual entry'}
            </Tag>
          </div>
          <div className={`viewfinder ${image ? 'has-photo' : ''}`}>
            <div className="scan-corner tl" />
            <div className="scan-corner tr" />
            <div className="scan-corner bl" />
            <div className="scan-corner br" />
            {image ? (
              <img src={image} alt="Your thrift find" className="photo-preview" />
            ) : sample ? (
              <ItemArt kind={sample} />
            ) : (
              <div className="camera-placeholder">
                <Camera size={60} />
                <p>Ready for your next find</p>
              </div>
            )}
            <span className="viewfinder-label">
              {sample ? 'ILLUSTRATED SAMPLE · NOT A CAMERA FEED' : 'PHOTO PREVIEW · SESSION ONLY'}
            </span>
            {busy && (
              <div className="scan-busy">
                <span className="spinner" /> Reading your find…
              </div>
            )}
          </div>
          <div className="capture-controls">
            <button className="btn primary" onClick={() => input.current?.click()} disabled={busy}>
              <Camera size={18} />
              {image ? 'Take another photo' : 'Scan a find'}
              <ArrowRight size={17} />
            </button>
            <button
              className="btn secondary icon-capture"
              onClick={() => libraryInput.current?.click()}
              disabled={busy}
              aria-label="Upload a photo"
            >
              <Upload size={18} />
            </button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              hidden
              onChange={(e) => {
                void photo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <input
              ref={libraryInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                void photo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <p className="micro center">Take a photo or choose one from your library · up to 4 MB</p>
          {provider !== 'manual' ? (
            <label className="check-row cloud-choice">
              <input
                type="checkbox"
                checked={useCloud}
                onChange={(e) => setUseCloud(e.target.checked)}
              />{' '}
              Send new photos to {provider === 'google' ? 'Google Cloud Vision' : 'Azure Vision'}{' '}
              for label & text suggestions
            </label>
          ) : (
            <div className="subtle-note">
              <Info size={15} />
              <span>
                Manual identification is ready. AI suggestions become available when a provider is
                configured.
              </span>
            </div>
          )}
          <div className="sample-row">
            <span>Try a sample</span>
            {Object.keys(examples).map((key) => (
              <button
                key={key}
                className={sample === key ? 'sample active' : 'sample'}
                onClick={() => chooseSample(key)}
              >
                {key === 'fleece' ? 'Fleece' : key === 'lamp' ? 'Lamp' : 'Pet gear'}
              </button>
            ))}
            <button
              className="text-link"
              onClick={() => {
                requestId.current++;
                setBusy(false);
                setSample(null);
                setImage('');
                setItem(blankCandidate());
                setEvidence('manual');
                setIdentification(null);
                setConfirmedSave(false);
                setError('');
              }}
              aria-label="Start a blank item"
            >
              <Plus size={17} />
            </button>
          </div>
        </section>
        <section className="analysis">
          <div className="analysis-heading">
            <span className="eyebrow">THE FIND, DECODED</span>
            <Tag>
              {sample
                ? 'Illustrative analysis'
                : evidence === 'manual'
                  ? 'Your assessment'
                  : 'AI-assisted · verify'}
            </Tag>
          </div>
          <h2 className="item-title">{item.title}</h2>
          <p className="item-meta">
            {item.brand || 'Brand unknown'} <span>·</span> {item.condition} condition <span>·</span>{' '}
            {item.size || 'Size unknown'}
          </p>
          <div className="score-grid">
            <button
              className={`score-card ${mode === 'merchant' ? 'selected' : ''}`}
              onClick={() => setMode('merchant')}
              aria-label={`Resale score ${resale.score ?? 'unavailable'}`}
            >
              <span>
                Resale score <ShoppingBag size={15} />
              </span>
              <strong>
                {resale.score ?? '—'}
                <small>/100</small>
              </strong>
              <p>
                {resale.score === null
                  ? 'Needs sold comparables'
                  : resale.score >= 70
                    ? 'Promising for your shop'
                    : 'Consider your costs'}
              </p>
            </button>
            <button
              className={`score-card personal ${mode === 'household' ? 'selected' : ''}`}
              onClick={() => setMode('household')}
              aria-label={`Household score ${personal.score ?? 'unavailable'}`}
            >
              <span>
                Household match <Sparkles size={15} />
              </span>
              <strong>
                {personal.score ?? '—'}
                <small>/100</small>
              </strong>
              <p>
                {personal.best
                  ? `For ${goalLabel(personal.best.goal, state)}`
                  : 'Add a matching goal'}
              </p>
            </button>
          </div>
          <div className="verdict">
            <span className="verdict-icon">
              <Sparkles size={19} />
            </span>
            <div>
              <h3>
                {active.score === null
                  ? 'A little more context helps.'
                  : active.score >= 70
                    ? 'This find has potential.'
                    : 'Give this one a closer look.'}
              </h3>
              <p>
                {mode === 'merchant'
                  ? resale.reasons[0]
                  : personal.best
                    ? personal.best.goal.title
                    : personal.reasons[0]}
              </p>
            </div>
          </div>
          <div className="price-strip">
            <div>
              <span>Asking price</span>
              <strong>{dollars(item.cost)}</strong>
            </div>
            <div>
              <span>Resale range</span>
              <strong>
                {resale.estimate
                  ? `${dollars(resale.estimate.low)}–${dollars(resale.estimate.high)}`
                  : 'No estimate'}
              </strong>
            </div>
            <div>
              <span>Est. net profit</span>
              <strong
                className={resale.estimate && resale.estimate.profit < 0 ? 'negative' : 'green'}
              >
                {resale.estimate ? dollars(resale.estimate.profit) : '—'}
              </strong>
            </div>
          </div>
          <p className="micro">
            {sample
              ? 'Fictional item & comparables. Scores demonstrate your settings.'
              : 'Based on your inputs and recent sold comparables, when available.'}{' '}
            Profit includes purchase, repairs, shipping, handling and planning fees.
          </p>
          <details className="why">
            <summary>
              Why this score? <ChevronDown size={16} />
            </summary>
            <ul className="check-list">
              {active.reasons.map((r) => (
                <Checked key={r}>{r}</Checked>
              ))}
            </ul>
            {mode === 'merchant' && (
              <p className="micro">
                {resale.history} recorded sales for this category and source. No predicted
                sell-through or authenticity guarantee.
              </p>
            )}
          </details>
        </section>
      </div>
      {identification && (
        <div className="notice">
          <Info size={18} />
          <div>
            <strong>{identification.message}</strong>
            {identification.labels.length > 0 && (
              <p>
                Image labels: {identification.labels.join(', ')}.{' '}
                {identification.confidence !== null
                  ? `Top label confidence: ${Math.round(identification.confidence * 100)}% (not item certainty).`
                  : ''}
              </p>
            )}
            {identification.text && <pre className="ocr">Visible text: {identification.text}</pre>}
          </div>
        </div>
      )}
      <div className="details-layout">
        <section className="card details-card">
          <div className="card-top">
            <h2>Make it your find</h2>
            <Tag>Review before saving</Tag>
          </div>
          <div className="form-grid">
            <Field label="Item name" wide>
              <input
                value={item.title}
                maxLength={120}
                onChange={(e) => update('title', e.target.value)}
              />
            </Field>
            <Field label="Brand">
              <input
                value={item.brand}
                maxLength={60}
                placeholder="Check the label"
                onChange={(e) => update('brand', e.target.value)}
              />
            </Field>
            <Field label="Category">
              <select
                value={item.category}
                onChange={(e) => update('category', e.target.value as Candidate['category'])}
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Size / dimensions">
              <input
                value={item.size}
                maxLength={40}
                placeholder="e.g. M, 4T, chest 18 in"
                onChange={(e) => update('size', e.target.value)}
              />
            </Field>
            <Field label="Color">
              <input
                value={item.color}
                maxLength={40}
                onChange={(e) => update('color', e.target.value)}
              />
            </Field>
            <Field label="Style / theme">
              <input
                value={item.theme}
                maxLength={60}
                onChange={(e) => update('theme', e.target.value)}
              />
            </Field>
            <Field label="Condition">
              <select
                value={item.condition}
                onChange={(e) => update('condition', e.target.value as Candidate['condition'])}
              >
                {conditionNames.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Asking price ($)">
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={item.cost}
                onChange={(e) => update('cost', Number(e.target.value))}
              />
            </Field>
            <Field label="Repairs / cleaning ($)">
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={item.repair}
                onChange={(e) => update('repair', Number(e.target.value))}
              />
            </Field>
            <Field label="Source store" wide>
              <input
                value={item.store}
                maxLength={100}
                onChange={(e) => update('store', e.target.value)}
              />
            </Field>
            <Field label="Notes / things to check" wide>
              <textarea
                value={item.notes}
                maxLength={1000}
                onChange={(e) => update('notes', e.target.value)}
                rows={2}
              />
            </Field>
            {mode === 'household' && (
              <Field label="Who is it for?" wide>
                <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                  {state.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.kind}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <label className="check-row review">
            <input
              type="checkbox"
              checked={item.reviewed}
              onChange={(e) => update('reviewed', e.target.checked)}
            />{' '}
            I checked the item details, size, condition and price.
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn primary full"
            disabled={!item.reviewed || busy || confirmedSave}
            onClick={save}
          >
            {confirmedSave ? <Check size={18} /> : <Plus size={18} />}{' '}
            {confirmedSave
              ? 'Saved to inventory'
              : `Add to ${mode === 'merchant' ? 'merchant' : 'household'} inventory`}
          </button>
          {confirmedSave && (
            <button
              className="text-link after-save"
              onClick={() => navigate(mode === 'merchant' ? 'merchant' : 'household')}
            >
              Open inventory <ArrowRight size={16} />
            </button>
          )}
          <p className="micro center">Photos stay in this session. Only item details are saved.</p>
        </section>
        <div className="side-stack">
          <section className="card">
            <div className="card-top">
              <h2>Price context</h2>
              <button className="text-link" onClick={() => setShowComp(true)}>
                <Plus size={15} /> Add comp
              </button>
            </div>
            <p className="micro">
              Same item & condition · USD · sold within 90 days. Asking prices are shown for context
              and excluded from estimates.
            </p>
            <div className="comp-list">
              {comps.filter((c) => c.key === itemKey(item)).length ? (
                comps
                  .filter((c) => c.key === itemKey(item))
                  .map((c) => (
                    <div className="comp-row" key={c.id}>
                      <span className="comp-dot" />
                      <div>
                        <strong>
                          {c.platform}{' '}
                          <Tag tone={c.kind === 'sold' ? '' : 'amber'}>
                            {c.kind === 'sold' ? 'Sold' : 'Asking'}
                          </Tag>
                        </strong>
                        <small>
                          {c.source === 'demo' ? 'Fictional example' : 'User-entered'} · {c.date} ·{' '}
                          {c.condition}
                        </small>
                      </div>
                      <b>{dollars(c.price)}</b>
                    </div>
                  ))
              ) : (
                <p className="muted">No comparables yet. Add a verified sold price to begin.</p>
              )}
            </div>
            {resale.estimate && (
              <div className="comp-summary">
                <span>{resale.estimate.sold.length} eligible sold comps</span>
                <Tag tone="amber">{resale.estimate.confidence}</Tag>
              </div>
            )}
          </section>
          <section className="tip-card">
            <span className="tip-icon">
              <ShieldCheck size={22} />
            </span>
            <div className="eyebrow">A LITTLE THRIFT WISDOM</div>
            <h3>
              The label only tells
              <br />
              half the story.
            </h3>
            <p>
              Check seams, test moving parts, and measure twice. A good price is only good if it
              works for you.
            </p>
          </section>
        </div>
      </div>
      {showComp && (
        <Modal title="Add a comparable" close={() => setShowComp(false)}>
          <ComparableForm
            item={item}
            onSave={(comp) => {
              setState((s) => ({ ...s, comps: [comp, ...s.comps] }));
              setShowComp(false);
              toast('Comparable added');
            }}
          />
        </Modal>
      )}
    </>
  );
}

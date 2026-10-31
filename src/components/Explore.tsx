import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapPin,
  Search,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Heart,
  Leaf,
  Store,
  ShoppingBasket,
  Shirt,
  Sparkles,
  Navigation,
  X,
  Route,
  Plus,
  Check,
  ChevronUp,
  ChevronDown,
  SlidersHorizontal,
  ScanLine,
  ExternalLink,
  Clock3,
  LocateFixed,
  MoveUp,
  Trash2,
  CircleHelp,
} from 'lucide-react';
import DiscoveryMap, { type MapCommand } from './DiscoveryMap';
import { useWorkspace, type Page } from '../lib/context';
import {
  DENVER,
  kindLabels,
  samplePlaces,
  matchesPlace,
  distanceMiles,
  directionsUrl,
  discoveryResponseSchema,
  safeWebsite,
  type Place,
  type PlaceKind,
  type Point,
} from '../lib/discovery';
import { Field, Modal } from './ui';
const categoryIcons = {
  thrift: Shirt,
  market: ShoppingBasket,
  vintage: Sparkles,
  farm: Leaf,
  seller: Store,
};
const categories = [
  { id: 'all', label: 'All finds', icon: MapPin },
  { id: 'thrift', label: 'Thrift stores', icon: Shirt },
  { id: 'market', label: 'Farmers markets', icon: ShoppingBasket },
  { id: 'vintage', label: 'Vintage', icon: Sparkles },
  { id: 'farm', label: 'Farm shops', icon: Leaf },
  { id: 'seller', label: 'Local sellers', icon: Store },
];
export function Explore({ view }: { view: Extract<Page, 'map' | 'saved' | 'sell'> }) {
  const { state, setState, navigate, toast } = useWorkspace();
  const data = state.discovery;
  const [center, setCenter] = useState<Point>(DENVER),
    [searchedCenter, setSearchedCenter] = useState<Point>(DENVER),
    [command, setCommand] = useState<MapCommand | null>(null);
  const [places, setPlaces] = useState<Place[]>(samplePlaces),
    [source, setSource] = useState<'sample' | 'osm'>('sample'),
    [fetchedAt, setFetchedAt] = useState('');
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [selected, setSelected] = useState<Place | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [user, setUser] = useState<Point | null>(null),
    [locating, setLocating] = useState(false),
    [expanded, setExpanded] = useState(view === 'sell'),
    [tripOpen, setTripOpen] = useState(false),
    [sellerOpen, setSellerOpen] = useState(false),
    [locationOpen, setLocationOpen] = useState(false),
    [about, setAbout] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setSelected(null);
    setExpanded(view === 'sell');
  }, [view]);
  const update = (change: Partial<typeof data>) =>
    setState((previous) => ({ ...previous, discovery: { ...previous.discovery, ...change } }));
  const saved = selected && data.saved.some((p) => p.id === selected.id);
  const all = useMemo(() => [...places, ...data.sellers], [places, data.sellers]);
  const results = useMemo(
    () =>
      (view === 'saved' ? data.saved : view === 'sell' ? data.sellers : all)
        .filter((p) => matchesPlace(p, query, kind))
        .sort(
          (a, b) =>
            distanceMiles(user ?? searchedCenter, a) - distanceMiles(user ?? searchedCenter, b),
        ),
    [all, data.saved, data.sellers, view, query, kind, user, searchedCenter],
  );
  const mapPlaces =
    view === 'map' ? results : [...new Map([...all, ...results].map((p) => [p.id, p])).values()];
  function focus(place: Place) {
    setSelected(place);
    setExpanded(true);
    setCommand({ point: place, sequence: Date.now() });
  }
  async function searchArea(point = center) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    setSelected(null);
    try {
      const response = await fetch(
        `/api/places?lat=${point.lat.toFixed(2)}&lng=${point.lng.toFixed(2)}`,
        { signal: abort.signal },
      );
      if (!response.ok)
        throw new Error(
          'The public directory is busy or unavailable. Try again shortly. Sample places are still available.',
        );
      const result = discoveryResponseSchema.parse(await response.json());
      setPlaces(result.places);
      setSource('osm');
      setFetchedAt(result.fetchedAt);
      setSearchedCenter(point);
      setQuery('');
      setKind('all');
      if (!result.places.length)
        setError(
          'No mapped places were found within about 5 miles. Move the map and search another area.',
        );
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : 'Places could not load. Try again.');
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  function samples() {
    controller.current?.abort();
    setBusy(false);
    setPlaces(samplePlaces);
    setSource('sample');
    setError('');
    setQuery('');
    setKind('all');
    setSelected(null);
    setSearchedCenter(DENVER);
    setCenter(DENVER);
    setCommand({ point: DENVER, zoom: 14, sequence: Date.now() });
  }
  function locate() {
    if (!navigator.geolocation) {
      setError('Location is unavailable in this browser. Pan the map or choose a city instead.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setUser(point);
        setCenter(point);
        setCommand({ point, zoom: 14, sequence: Date.now() });
        setLocating(false);
        void searchArea(point);
      },
      () => {
        setError(
          'Location access was denied or unavailable. Choose a city or pan the map, then search this area.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  function toggleSaved(place: Place) {
    if (data.saved.some((p) => p.id === place.id)) {
      update({ saved: data.saved.filter((p) => p.id !== place.id) });
      toast('Removed from saved places');
    } else if (data.saved.length >= 200)
      toast('Saved places is full. Remove a place before adding another.');
    else {
      update({ saved: [...data.saved, place] });
      toast('Place saved to this device');
    }
  }
  function addStop(place: Place) {
    if (data.stops.some((p) => p.id === place.id)) {
      setTripOpen(true);
      return;
    }
    if (data.stops.length >= 8) {
      toast('Your trip can have up to 8 stops.');
      return;
    }
    if (data.stops.length && data.stops.some((p) => p.source !== place.source)) {
      toast('Start a separate trip for sample places, public places, or private drafts.');
      return;
    }
    update({ stops: [...data.stops, place] });
    toast('Added to your trip');
  }
  const routeUrl = directionsUrl(data.stops, user ?? undefined);
  const isDemoTrip = data.stops.some((p) => p.source !== 'osm');
  return (
    <section className={`explore ${expanded ? 'panel-expanded' : ''}`} aria-label="Discover nearby">
      <div className="map-stage">
        <DiscoveryMap
          places={mapPlaces}
          selected={selected?.id ?? null}
          onSelect={focus}
          onMove={setCenter}
          command={command}
          user={user}
          stops={data.stops}
          locate={locate}
          locating={locating}
        />
      </div>
      <div className="map-topline">
        <div className="map-category-filters" aria-label="Place categories">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setKind(c.id);
                setSelected(null);
              }}
              aria-pressed={kind === c.id}
              className={kind === c.id ? 'active' : ''}
            >
              <c.icon size={17} />
              {c.label}
            </button>
          ))}
        </div>
        <button className="area-search" onClick={() => void searchArea()} disabled={busy}>
          <Search size={15} />
          {busy ? 'Finding places…' : 'Search this area'}
        </button>
      </div>
      <aside className="discovery-panel" aria-label="Places and details">
        <button
          className="panel-handle"
          aria-label={expanded ? 'Collapse place list' : 'Expand place list'}
          onClick={() => setExpanded(!expanded)}
        >
          <span />
        </button>
        {selected ? (
          <>
            <div className={`place-hero ${selected.kind}`}>
              <button className="hero-back" onClick={() => setSelected(null)}>
                <ArrowLeft size={17} /> Back to places
              </button>
              <PlaceArt place={selected} large />
              <span className="hero-source">
                {selected.source === 'sample'
                  ? 'Sample place'
                  : selected.source === 'draft'
                    ? 'Private draft'
                    : 'Community mapped'}
              </span>
              <button
                className={`save-heart ${saved ? 'saved' : ''}`}
                aria-label={saved ? 'Unsave place' : 'Save place'}
                onClick={() => toggleSaved(selected)}
              >
                <Heart size={19} fill={saved ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="place-detail">
              <div className="eyebrow">{kindLabels[selected.kind]}</div>
              <h1>{selected.name}</h1>
              <p className="place-address">
                <MapPin size={15} />
                {selected.address}
              </p>
              <p>{selected.description}</p>
              <div className="detail-hours">
                <Clock3 size={17} />
                <div>
                  <strong>
                    {selected.source === 'osm'
                      ? 'Check before you go'
                      : selected.source === 'sample'
                        ? 'Illustrative place'
                        : 'Not publicly listed'}
                  </strong>
                  <span>{selected.hours || 'Opening times are not listed.'}</span>
                </div>
              </div>
              <div className="detail-tags">
                {selected.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <button className="btn primary full" onClick={() => addStop(selected)}>
                <Plus size={17} />
                {data.stops.some((p) => p.id === selected.id)
                  ? 'View in your trip'
                  : 'Add to my trip'}
              </button>
              {selected.source === 'osm' && (
                <a
                  className="btn secondary full"
                  href={directionsUrl([selected], user ?? undefined)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation size={16} /> Get directions <ExternalLink size={14} />
                </a>
              )}
              {safeWebsite(selected.website) && (
                <a
                  className="text-link detail-source"
                  href={safeWebsite(selected.website)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit official website <ArrowUpRight size={15} />
                </a>
              )}
              {selected.source === 'osm' && (
                <a
                  className="detail-source micro"
                  href={safeWebsite(selected.sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View OpenStreetMap source <ArrowUpRight size={13} />
                </a>
              )}
              {selected.source !== 'osm' && (
                <p className="micro">
                  {selected.source === 'sample'
                    ? 'This fictional place demonstrates the experience. Load public places for real destinations and directions.'
                    : 'This seller draft is saved only to your workspace. Other shoppers cannot see it.'}
                </p>
              )}
              {selected.source === 'draft' && (
                <button
                  className="text-link danger-text"
                  onClick={() => {
                    if (confirm('Delete this private seller pin?')) {
                      update({
                        sellers: data.sellers.filter((p) => p.id !== selected.id),
                        saved: data.saved.filter((p) => p.id !== selected.id),
                        stops: data.stops.filter((p) => p.id !== selected.id),
                      });
                      setSelected(null);
                    }
                  }}
                >
                  <Trash2 size={14} /> Delete private pin
                </button>
              )}
              <button className="scan-at-place" onClick={() => navigate('scan')}>
                <ScanLine size={20} />
                <span>
                  <strong>Found something good?</strong>
                  <small>Scan it before you buy.</small>
                </span>
                <ArrowRight size={18} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="explore-intro">
              <div className="location-label">
                <MapPin size={14} />
                <button onClick={() => setLocationOpen(true)}>
                  {source === 'sample' ? 'Denver, Colorado' : 'Current search area'}
                  <ChevronDown size={13} />
                </button>
              </div>
              <h1>
                {view === 'saved'
                  ? 'Your next little adventure.'
                  : view === 'sell'
                    ? 'Meet your neighborhood.'
                    : 'Good finds.\nCloser to you.'}
              </h1>
              <p>
                {view === 'saved'
                  ? 'Keep your favorite places in one place.'
                  : view === 'sell'
                    ? 'A place on the map for what you make, grow, or find.'
                    : 'Thrift a little. Shop local. Find your people.'}
              </p>
            </div>
            {view === 'sell' ? (
              <div className="seller-intro">
                <div className="seller-illustration">
                  <Store size={48} strokeWidth={1.3} />
                  <span>Made. Grown. Found.</span>
                </div>
                <h2>Your stall starts here.</h2>
                <p>
                  Preview a shop, farm stand, market stall, or neighborhood sale at a location you
                  choose.
                </p>
                <button className="btn primary full" onClick={() => setSellerOpen(true)}>
                  <Plus size={17} /> Create a seller pin
                </button>
                <p className="micro">
                  Private drafts for now. Public publishing and customer orders are not enabled.
                </p>
                <button className="text-link" onClick={() => navigate('merchant')}>
                  Open inventory & listing tools <ArrowUpRight size={15} />
                </button>
              </div>
            ) : (
              <>
                <form
                  className="place-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setExpanded(true);
                  }}
                >
                  <Search size={19} />
                  <input
                    aria-label="Search places"
                    placeholder="Vintage, veggies, your next great find…"
                    value={query}
                    maxLength={100}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSelected(null);
                    }}
                  />
                  {query && (
                    <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                      <X size={15} />
                    </button>
                  )}
                </form>
                {source === 'sample' && view === 'map' && (
                  <div className="sample-callout">
                    <span className="sample-dot" />
                    <div>
                      <strong>A little look around</strong>
                      <span>Fictional places to explore the map.</span>
                    </div>
                    <button onClick={() => void searchArea()} disabled={busy}>
                      {busy ? 'Loading…' : 'Load real places'}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
            {error && (
              <div className="discovery-error" role="alert">
                {error}
                <button className="text-link" onClick={samples}>
                  Explore sample map
                </button>
              </div>
            )}
            <div className="result-heading">
              <h2>
                {view === 'saved'
                  ? 'Saved places'
                  : view === 'sell'
                    ? 'Your private pins'
                    : 'Around the neighborhood'}{' '}
                <span>{results.length}</span>
              </h2>
              <span>
                <SlidersHorizontal size={13} /> Nearest first
              </span>
            </div>
            <div className="place-results">
              {results.map((place) => (
                <article className={`place-card ${place.kind}`} key={place.id}>
                  <button className="place-card-main" onClick={() => focus(place)}>
                    <PlaceArt place={place} />
                    <div>
                      <span className="card-kind">{kindLabels[place.kind]}</span>
                      <h3>{place.name}</h3>
                      <p>
                        {place.tags.length
                          ? place.tags.slice(0, 2).join(' · ')
                          : 'Community mapped'}
                      </p>
                      <small>
                        <MapPin size={11} />
                        {distanceMiles(user ?? searchedCenter, place).toFixed(1)} mi approx.{' '}
                        <span>
                          ·{' '}
                          {place.source === 'sample'
                            ? 'Sample'
                            : place.source === 'draft'
                              ? 'Private draft'
                              : 'Hours unverified'}
                        </span>
                      </small>
                    </div>
                  </button>
                  <button
                    className={`card-save ${data.saved.some((p) => p.id === place.id) ? 'saved' : ''}`}
                    aria-label={`${data.saved.some((p) => p.id === place.id) ? 'Unsave' : 'Save'} ${place.name}`}
                    onClick={() => toggleSaved(place)}
                  >
                    <Heart
                      size={17}
                      fill={data.saved.some((p) => p.id === place.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                </article>
              ))}
              {!results.length && (
                <div className="discovery-empty">
                  <MapPin size={30} />
                  <h3>
                    {view === 'saved'
                      ? 'Save a little inspiration.'
                      : view === 'sell'
                        ? 'Your map pin is waiting.'
                        : 'No finds here just yet.'}
                  </h3>
                  <p>
                    {view === 'saved'
                      ? 'Tap the heart on a place to keep it for later.'
                      : view === 'sell'
                        ? 'Create your first private seller pin above.'
                        : 'Try another category, clear your search, or search a different area.'}
                  </p>
                  {view === 'saved' && (
                    <button className="text-link" onClick={() => navigate('map')}>
                      Explore the map <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="panel-foot">
              <Leaf size={16} />
              <span>Good for your neighborhood. Good for the planet.</span>
            </div>
          </>
        )}
      </aside>
      <div className="map-bottomline">
        <button className="map-source" onClick={() => setAbout(true)}>
          <span className={source === 'sample' ? 'source-dot is-sample' : 'source-dot'} />
          {source === 'sample'
            ? 'Sample map · illustrative places'
            : 'OpenStreetMap · public places'}
          <CircleHelp size={13} />
        </button>
        <button
          className={`trip-button ${data.stops.length ? 'has-stops' : ''}`}
          onClick={() => setTripOpen(true)}
        >
          <Route size={19} />
          <span>My little trip</span>
          <b>{data.stops.length}</b>
          <ArrowRight size={16} />
        </button>
      </div>
      <button
        className="mobile-list-toggle"
        onClick={() => {
          setExpanded(!expanded);
          if (selected) setSelected(null);
        }}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}{' '}
        {expanded ? 'Show more map' : `${results.length} places · View list`}
      </button>
      {tripOpen && (
        <Modal title="My little trip" close={() => setTripOpen(false)}>
          <p className="muted">Pick a few stops. Leave room for a good surprise.</p>
          {!data.stops.length ? (
            <div className="discovery-empty">
              <Route size={32} />
              <h3>Where will you wander?</h3>
              <p>Open a place and add it to your trip. Up to 8 stops.</p>
            </div>
          ) : (
            <>
              <ol className="trip-stops">
                {data.stops.map((place, index) => (
                  <li key={place.id}>
                    <span className={`stop-number ${place.kind}`}>{index + 1}</span>
                    <div>
                      <strong>{place.name}</strong>
                      <small>
                        {kindLabels[place.kind]} ·{' '}
                        {place.source === 'sample'
                          ? 'Sample'
                          : place.source === 'draft'
                            ? 'Private draft'
                            : 'Public place'}
                      </small>
                    </div>
                    <button
                      className="icon-btn"
                      disabled={!index}
                      aria-label={`Move ${place.name} earlier`}
                      onClick={() => {
                        const next = [...data.stops];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        update({ stops: next });
                      }}
                    >
                      <MoveUp size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${place.name} from trip`}
                      onClick={() => update({ stops: data.stops.filter((p) => p.id !== place.id) })}
                    >
                      <X size={17} />
                    </button>
                  </li>
                ))}
              </ol>
              <p className="micro">
                The dotted line shows your stop order. Road routing and travel times are provided by
                Google Maps when you open directions.
              </p>
              {isDemoTrip ? (
                <div className="notice">
                  This is a preview trip with sample places or private drafts. Real-world navigation
                  is disabled.
                </div>
              ) : (
                <a className="btn primary full" href={routeUrl} target="_blank" rel="noreferrer">
                  <Navigation size={17} /> Open trip in Google Maps <ExternalLink size={14} />
                </a>
              )}
              <button
                className="text-link clear-trip"
                onClick={() => {
                  update({ stops: [] });
                  toast('Trip cleared');
                }}
              >
                Clear trip
              </button>
            </>
          )}
        </Modal>
      )}
      {locationOpen && (
        <LocationDialog
          close={() => setLocationOpen(false)}
          locate={() => {
            setLocationOpen(false);
            locate();
          }}
          choose={(point) => {
            controller.current?.abort();
            setBusy(false);
            setSelected(null);
            setPlaces([]);
            setSource('osm');
            setCenter(point);
            setSearchedCenter(point);
            setCommand({ point, zoom: 14, sequence: Date.now() });
            setLocationOpen(false);
            void searchArea(point);
          }}
        />
      )}
      {sellerOpen && (
        <SellerDialog
          center={center}
          close={() => setSellerOpen(false)}
          save={(place) => {
            if (data.sellers.length >= 50) {
              toast('You can keep up to 50 private seller pins.');
              return;
            }
            update({ sellers: [...data.sellers, place] });
            setSellerOpen(false);
            focus(place);
            toast('Private seller pin saved. It is not publicly published.');
          }}
        />
      )}
      {about && (
        <Modal title="A map with a little honesty" close={() => setAbout(false)}>
          <p>
            Public places come from OpenStreetMap. The directory may be incomplete or out of date.
            Public markets are not necessarily farmers markets; confirm dates, vendors, and hours
            before you go.
          </p>
          {fetchedAt && (
            <p className="micro">Directory fetched {new Date(fetchedAt).toLocaleString()}.</p>
          )}
          <p>
            Sample places are fictional. Seller pins, saved places, and trips stay in this device’s
            workspace. Seller publishing, live crowds, traffic, and verified open-now status are not
            available.
          </p>
          <p>
            Distance is approximate and measured in a straight line. Map tiles need internet. Your
            location is requested only when you tap the location button; a rounded search center is
            sent to the public directory.
          </p>
          <a
            className="text-link"
            href="https://osmfoundation.org/wiki/Privacy_Policy"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap privacy policy <ExternalLink size={14} />
          </a>
          <button
            className="btn secondary full"
            onClick={() => {
              samples();
              setAbout(false);
            }}
          >
            Explore sample map
          </button>
        </Modal>
      )}
    </section>
  );
}
function PlaceArt({ place, large = false }: { place: Place; large?: boolean }) {
  const Icon = categoryIcons[place.kind];
  return (
    <div className={`place-art ${place.kind} ${large ? 'large' : ''}`} aria-hidden="true">
      <span className="art-orbit" />
      <Icon size={large ? 82 : 32} strokeWidth={large ? 1 : 1.35} />
      <span className="art-spark">✦</span>
    </div>
  );
}
function LocationDialog({
  close,
  choose,
  locate,
}: {
  close: () => void;
  choose: (point: Point) => void;
  locate: () => void;
}) {
  const cities = [
    { name: 'Denver, CO', ...DENVER },
    { name: 'Boulder, CO', lat: 40.015, lng: -105.2705 },
    { name: 'Austin, TX', lat: 30.2672, lng: -97.7431 },
    { name: 'Portland, OR', lat: 45.523, lng: -122.676 },
    { name: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
  ];
  return (
    <Modal title="Where are we exploring?" close={close}>
      <button className="btn primary full" onClick={locate}>
        <LocateFixed size={17} /> Use my location
      </button>
      <p className="micro">
        Location is requested only when you choose it. You can also pan and zoom the map anywhere,
        then tap Search this area.
      </p>
      <div className="city-list">
        {cities.map((city) => (
          <button key={city.name} onClick={() => choose(city)}>
            <MapPin size={17} />
            {city.name}
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
function SellerDialog({
  center,
  close,
  save,
}: {
  center: Point;
  close: () => void;
  save: (place: Place) => void;
}) {
  const [name, setName] = useState(''),
    [kind, setKind] = useState<PlaceKind>('seller'),
    [description, setDescription] = useState(''),
    [address, setAddress] = useState(''),
    [hours, setHours] = useState('');
  const [lat, setLat] = useState(center.lat.toFixed(6)),
    [lng, setLng] = useState(center.lng.toFixed(6)),
    [error, setError] = useState('');
  return (
    <Modal title="Put your good things on the map" close={close}>
      <p className="muted">Preview your seller pin. It stays private on this device.</p>
      <form
        className="seller-form"
        onSubmit={(e) => {
          e.preventDefault();
          const latitude = Number(lat),
            longitude = Number(lng);
          if (
            !lat.trim() ||
            !lng.trim() ||
            !Number.isFinite(latitude) ||
            Math.abs(latitude) > 85 ||
            !Number.isFinite(longitude) ||
            Math.abs(longitude) > 180
          ) {
            setError('Enter valid latitude and longitude for your public-facing stall location.');
            return;
          }
          save({
            id: `draft:${crypto.randomUUID()}`,
            name: name.trim(),
            kind,
            description: description.trim(),
            address: address.trim(),
            hours,
            lat: latitude,
            lng: longitude,
            website: '',
            source: 'draft',
            sourceUrl: '',
            tags: ['Private seller draft'],
          });
        }}
      >
        <Field label="Shop or stall name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            required
            pattern=".*\S.*"
            placeholder="Your neighborhood treasure trove"
          />
        </Field>
        <Field label="What kind of place?">
          <select value={kind} onChange={(e) => setKind(e.target.value as PlaceKind)}>
            {Object.entries(kindLabels).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What can shoppers find?">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1200}
            required
            placeholder="Tell a little of your story…"
          />
        </Field>
        <Field label="Public stall or shop address">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            required
          />
        </Field>
        <Field label="Dates or opening times">
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            maxLength={200}
            placeholder="For example: Saturdays, 9 am–1 pm"
          />
        </Field>
        <div className="form-grid">
          <Field label="Pin latitude">
            <input
              type="number"
              step="any"
              min={-85}
              max={85}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
            />
          </Field>
          <Field label="Pin longitude">
            <input
              type="number"
              step="any"
              min={-180}
              max={180}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
            />
          </Field>
        </div>
        <p className="micro">
          Starts at the current map center. Use a public-facing location rather than your private
          home address. Coordinates are editable for precise placement.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" className="btn primary full">
          <Check size={17} /> Save private pin
        </button>
      </form>
    </Modal>
  );
}

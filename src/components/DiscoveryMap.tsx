import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { Plus, Minus, LocateFixed, Layers } from 'lucide-react';
import { DENVER, type Place, type Point } from '../lib/discovery';
import 'leaflet/dist/leaflet.css';
export type MapCommand = { point: Point; zoom?: number; sequence: number };
const icons: Record<Place['kind'], string> = {
  thrift: '<path d="m16 3 5 4-3 5-2-1v10H8V11l-2 1-3-5 5-4a4 4 0 0 0 8 0Z"/>',
  vintage: '<path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="M8 12h8m-4-4v8"/>',
  market: '<path d="M3 10h18L19 4H5l-2 6Zm2 0v11h14V10M9 21v-7h6v7"/>',
  farm: '<path d="M20 4c-13-2-18 6-12 12s14 1 12-12ZM4 20 15 9"/>',
  seller:
    '<path d="m3 9 2-6h14l2 6M4 9v12h16V9M8 21v-7h8v7M3 9c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0"/>',
};
export default function DiscoveryMap({
  places,
  selected,
  onSelect,
  onMove,
  command,
  user,
  stops,
  locate,
  locating,
}: {
  places: Place[];
  selected: string | null;
  onSelect: (place: Place) => void;
  onMove: (point: Point) => void;
  command: MapCommand | null;
  user: Point | null;
  stops: Place[];
  locate: () => void;
  locating: boolean;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    pins = useRef<L.LayerGroup | null>(null),
    journey = useRef<L.LayerGroup | null>(null),
    position = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onMove });
  callbacks.current = { onSelect, onMove };
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const m = L.map(element.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
    }).setView([DENVER.lat, DENVER.lng], 14);
    map.current = m;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 1,
    }).addTo(m);
    tiles.on('tileerror', () => setTileError(true));
    tiles.on('tileload', () => setTileError(false));
    pins.current = L.layerGroup().addTo(m);
    journey.current = L.layerGroup().addTo(m);
    position.current = L.layerGroup().addTo(m);
    m.on('moveend', () => {
      const p = m.getCenter();
      callbacks.current.onMove({ lat: p.lat, lng: p.lng });
    });
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!pins.current) return;
    pins.current.clearLayers();
    places.forEach((place) => {
      const node = document.createElement('div');
      node.className = `place-pin ${place.kind} ${place.id === selected ? 'selected' : ''}`;
      const bubble = document.createElement('span');
      bubble.className = 'pin-bubble';
      bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[place.kind]}</svg>`;
      const label = document.createElement('span');
      label.className = 'pin-label';
      label.textContent = place.name;
      node.append(bubble, label);
      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          html: node,
          className: 'thrifty-marker',
          iconSize: [42, 50],
          iconAnchor: [21, 48],
        }),
        title: `View ${place.name}`,
        alt: `View ${place.name}`,
        keyboard: true,
        zIndexOffset: place.id === selected ? 500 : 0,
      }).addTo(pins.current!);
      marker.on('click', () => callbacks.current.onSelect(place));
      marker.getElement()?.setAttribute('aria-label', `View ${place.name}`);
    });
  }, [places, selected]);
  useEffect(() => {
    if (command && map.current) {
      const m = map.current;
      const zoom = command.zoom ?? Math.max(14, m.getZoom());
      let target = L.latLng(command.point.lat, command.point.lng);
      if (window.matchMedia('(max-width: 700px)').matches) {
        // Keep the destination above the mobile sheet rather than behind it.
        target = m.unproject(m.project(target, zoom).add([0, m.getSize().y * 0.26]), zoom);
      }
      m.flyTo(target, zoom, {
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.5,
      });
    }
  }, [command]);
  useEffect(() => {
    journey.current?.clearLayers();
    if (stops.length > 1)
      L.polyline(
        stops.map((p) => [p.lat, p.lng]),
        { color: '#21634d', weight: 4, dashArray: '7 9', opacity: 0.75, interactive: false },
      ).addTo(journey.current!);
  }, [stops]);
  useEffect(() => {
    position.current?.clearLayers();
    if (user) {
      L.circleMarker([user.lat, user.lng], {
        radius: 19,
        fillColor: '#4c8ef7',
        fillOpacity: 0.15,
        stroke: false,
      }).addTo(position.current!);
      L.circleMarker([user.lat, user.lng], {
        radius: 7,
        fillColor: '#347df2',
        fillOpacity: 1,
        color: 'white',
        weight: 3,
      }).addTo(position.current!);
    }
  }, [user]);
  return (
    <>
      <div
        className="discovery-map"
        ref={element}
        role="region"
        aria-label="Interactive map of thrift stores, markets and sellers"
      />
      {tileError && (
        <div className="tile-notice" role="status">
          Map tiles are unavailable. You can still browse the place list.
        </div>
      )}
      <div className="map-controls">
        <div className="map-compass" aria-hidden="true">
          <span>N</span>
          <i />
        </div>
        <button
          className="map-control locate"
          aria-label="Use my location"
          onClick={locate}
          disabled={locating}
        >
          <LocateFixed size={21} />
        </button>
        <div className="zoom-controls">
          <button
            className="map-control"
            aria-label="Zoom in"
            onClick={() => map.current?.zoomIn()}
          >
            <Plus size={21} />
          </button>
          <button
            className="map-control"
            aria-label="Zoom out"
            onClick={() => map.current?.zoomOut()}
          >
            <Minus size={21} />
          </button>
        </div>
        <button
          className="map-control"
          aria-label="Fit visible places"
          onClick={() => {
            if (places.length)
              map.current?.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng])), {
                paddingTopLeft: [25, 80],
                paddingBottomRight: [45, 90],
                maxZoom: 14,
              });
          }}
        >
          <Layers size={20} />
        </button>
      </div>
    </>
  );
}

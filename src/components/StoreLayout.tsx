import { useState } from 'react';
import { Field } from './ui';
import {
  gridAddress,
  layoutSections,
  layoutSize,
  sectionSymbol,
  type LayoutTiles,
} from '../lib/store-layout';
import './store-layout.css';

export function StoreLayout({
  tiles,
  onChange,
}: {
  tiles: LayoutTiles;
  onChange?: (tiles: LayoutTiles) => void;
}) {
  const [brush, setBrush] = useState('Clothing');
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const label = brush === 'custom' ? custom.trim() : brush;
  const active = tiles.find((tile) => tile.cell === selected);
  function tap(cell: number) {
    const occupant = tiles.find((tile) => tile.cell === cell);
    if (occupant) {
      setSelected(selected === cell ? null : cell);
      setMessage('');
      return;
    }
    if (!onChange) return;
    if (active) {
      onChange(tiles.map((tile) => (tile.cell === active.cell ? { ...tile, cell } : tile)));
      setSelected(null);
      setMessage('Moved ' + active.label + ' to ' + gridAddress(cell) + '.');
    } else if (label) {
      onChange([...tiles, { cell, label }]);
      setMessage('Placed ' + label + ' at ' + gridAddress(cell) + '.');
    } else {
      setMessage('Name your custom section first.');
    }
  }
  return (
    <div className="store-layout">
      {onChange && (
        <>
          <Field label="Section or landmark">
            <select
              value={brush}
              onChange={(e) => {
                setBrush(e.target.value);
                setSelected(null);
                setMessage('');
              }}
            >
              {Object.keys(layoutSections).map((name) => (
                <option key={name} value={name}>
                  {sectionSymbol(name)} {name}
                </option>
              ))}
              <option value="custom">Create a new section…</option>
            </select>
          </Field>
          {brush === 'custom' && (
            <Field label="Custom section name">
              <input
                maxLength={40}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. Sewing supplies"
              />
            </Field>
          )}
          <p className="micro">
            Choose a section and tap empty tiles to place it. Select a filled tile to move or remove
            it. Put the main entrance near the bottom when possible.
          </p>
        </>
      )}
      <div className="layout-board" aria-label="Store floor plan">
        {Array.from({ length: layoutSize }, (_, cell) => {
          const tile = tiles.find((item) => item.cell === cell);
          const name = gridAddress(cell) + ' ' + (tile?.label ?? 'empty');
          const content = (
            <>
              <small>{gridAddress(cell)}</small>
              {tile && <span aria-hidden="true">{sectionSymbol(tile.label)}</span>}
            </>
          );
          return onChange || tile ? (
            <button
              key={cell}
              type="button"
              className={tile ? 'filled' : ''}
              aria-label={name}
              title={name}
              aria-pressed={selected === cell}
              onClick={() => tap(cell)}
            >
              {content}
            </button>
          ) : (
            <span key={cell} className="vacant">
              {content}
            </span>
          );
        })}
      </div>
      {active && (
        <div className="layout-selection">
          <strong>
            {gridAddress(active.cell)} · {active.label}
          </strong>
          {onChange && (
            <>
              <p>Tap an empty tile to move this section.</p>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  onChange(tiles.filter((tile) => tile.cell !== selected));
                  setSelected(null);
                  setMessage('Removed ' + active.label + '.');
                }}
              >
                Remove section
              </button>
            </>
          )}
        </div>
      )}
      {onChange && (
        <p className="micro" role="status">
          {message}
        </p>
      )}
      {!!tiles.length && (
        <ul className="layout-key" aria-label="Section directory">
          {[...tiles]
            .sort((a, b) => a.cell - b.cell)
            .map((tile) => (
              <li key={tile.cell}>
                <strong>{gridAddress(tile.cell)}</strong> {tile.label}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

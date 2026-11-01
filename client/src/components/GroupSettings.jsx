import { useEffect, useRef, useState } from 'react';

export const PALETTE = [
  '#6f42c1', '#d63384', '#e03131', '#fd7e14', '#ffc107',
  '#2f9e44', '#20c997', '#1098ad', '#0d6efd', '#868e96',
];

export default function GroupSettings({ group, rect, onSave, onDelete, onClose }) {
  const [name, setName] = useState(group.name);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commitName = () => {
    const clean = name.trim();
    if (!clean) return setName(group.name); // never allow an empty name
    if (clean !== group.name) onSave(group.id, { name: clean });
  };

  // The color picker fires continuously while you drag; save once it settles
  const pickCustom = (e) => {
    const color = e.target.value;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(group.id, { color }), 300);
  };

  const top = Math.max(8, Math.min(rect.top, window.innerHeight - 340));

  return (
    <>
      <div className="gs-backdrop" onClick={onClose} />
      <div className="gs-pop" style={{ top, left: rect.right + 8 }}>
        <h6>Group settings</h6>

        <input
          className="gs-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />

        <div className="swatches">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`swatch ${group.color === c ? 'on' : ''}`}
              style={{ background: c }}
              aria-label={`Use color ${c}`}
              onClick={() => onSave(group.id, { color: c })}
            />
          ))}
          <label className="swatch swatch-custom" title="Custom color">
            +
            <input type="color" defaultValue={group.color} onChange={pickCustom} />
          </label>
        </div>

        {confirm ? (
          <div className="gs-confirm">
            <span>Notes in “{group.name}” become ungrouped.</span>
            <button className="gs-danger" onClick={() => onDelete(group.id)}>Yes, delete</button>
            <button onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        ) : (
          <button className="gs-delete" onClick={() => setConfirm(true)}>🗑 Delete group</button>
        )}
      </div>
    </>
  );
}
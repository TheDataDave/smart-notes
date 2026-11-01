import { useEffect, useState } from 'react';
import { safeFormat } from '../dates';

const LOCAL = "yyyy-MM-dd'T'HH:mm";

export default function DatePrompt({ hit, label, rect, exists, onRemind, onDue, onClose }) {
  const [value, setValue] = useState(safeFormat(hit.date.toISOString(), LOCAL));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const when = new Date(value);
  const valid = !Number.isNaN(when.getTime());
  const future = valid && when.getTime() > Date.now();

  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 340));
  const below = rect.bottom + 8;
  const top = below + 230 > window.innerHeight ? Math.max(8, rect.top - 238) : below;

  return (
    <>
      <div className="gs-backdrop" onClick={onClose} />
      <div className="date-prompt" style={{ top, left }}>
        <div className="reminder-title">⏰ “{hit.text}”</div>
        {label && <div className="dp-label">for: {label}</div>}

        <input
          type="datetime-local"
          className="form-control form-control-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="dp-hint">
          {exists ? 'A reminder is already set for this time.'
            : !valid ? 'Pick a valid date.'
            : !future ? 'That time has passed.'
            : 'Adjust the time if I guessed wrong.'}
        </div>

        <div className="dp-actions">
          <button
            className="primary"
            disabled={!future || exists}
            onClick={() => { onRemind(when.toISOString()); onClose(); }}
          >
            🔔 Remind me
          </button>
          <button disabled={!valid} onClick={() => { onDue(when.toISOString()); onClose(); }}>
            📌 Set as due date
          </button>
          <button onClick={onClose}>Not now</button>
        </div>
      </div>
    </>
  );
}
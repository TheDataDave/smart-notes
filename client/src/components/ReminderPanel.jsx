import { useState } from 'react';
import { Form } from 'react-bootstrap';
import { safeFormat } from '../dates';
import { presetsFor } from '../reminderPresets';

const REPEAT_LABEL = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' };

export default function ReminderPanel({ note, reminders, onAdd, onDelete }) {
  const [custom, setCustom] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [hint, setHint] = useState('');

  const upcoming = reminders
    .filter((r) => !r.fired)
    .sort((a, b) => a.remind_at.localeCompare(b.remind_at));

  const addCustom = () => {
    const d = new Date(custom);
    if (!custom || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      setHint('Pick a date and time in the future.');
      return;
    }
    setHint('');
    onAdd(note.id, d.toISOString(), repeat);
    setCustom('');
  };

  return (
    <div className="reminder-panel">
      <div className="reminder-title">🔔 Reminders</div>

      {upcoming.length > 0 && (
        <div className="rem-list">
          {upcoming.map((r) => (
            <div className="rem-item" key={r.id}>
              <span>{safeFormat(r.remind_at, 'EEE, MMM d · h:mm a', 'Unknown time')}</span>
              {r.repeat !== 'none' && <span className="rem-repeat">↻ {REPEAT_LABEL[r.repeat]}</span>}
              <button aria-label="Delete reminder" onClick={() => onDelete(r.id)}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="chips">
        {presetsFor(note).map((p) => (
          <button
            key={p.label}
            className="chip"
            onClick={() => onAdd(note.id, p.when.toISOString(), repeat)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="rem-custom">
        <Form.Control
          size="sm"
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <Form.Select size="sm" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          <option value="none">Once</option>
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
        </Form.Select>
        <button className="add-btn" onClick={addCustom}>Add</button>
      </div>
      {hint && <div className="rem-hint">{hint}</div>}
    </div>
  );
}
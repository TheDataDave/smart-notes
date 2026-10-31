import { useEffect, useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import { safeFormat } from '../dates';
import ReminderPanel from './ReminderPanel';
import BodyField from './BodyField';
import LinkPanel from './LinkPanel';

export default function Editor({
  note, groups, color, reminders, notes, connections, canGoBack,
  onSave, onDelete, onToggle, onAddReminder, onDeleteReminder, onOpenNote, onBack,
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const timer = useRef(null);
  const pending = useRef(null);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current) {
      onSave(note.id, pending.current);
      pending.current = null;
    }
  };

  const queueSave = (changes) => {
    pending.current = { ...pending.current, ...changes };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };

  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dueValue = safeFormat(note.due_at, "yyyy-MM-dd'T'HH:mm");
  const [due, setDue] = useState(dueValue);

  const commitDue = () => {
    if (due === '') {
      if (note.due_at) onSave(note.id, { due_at: null });
      return;
    }
    const d = new Date(due);
    const year = d.getFullYear();
    if (Number.isNaN(d.getTime()) || year < 2000 || year > 2100) {
      setDue(dueValue);
      return;
    }
    if (d.toISOString() !== note.due_at) onSave(note.id, { due_at: d.toISOString() });
  };

  return (
    <section className="editor">
      <div className="paper" style={{ '--note-color': color || '#ffd43b' }}>
        {canGoBack && (
          <button className="back-btn" onClick={onBack}>← Back</button>
        )}
        <Form.Control
          className="title-input"
          placeholder="Title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            queueSave({ title: e.target.value });
          }}
        />

        <div className="meta-row">
          <Form.Select
            size="sm"
            value={note.kind}
            onChange={(e) => onSave(note.id, { kind: e.target.value })}
          >
            <option value="note">📝 Note</option>
            <option value="task">✅ Task</option>
            <option value="event">📅 Event</option>
          </Form.Select>

          <Form.Select
            size="sm"
            value={note.group_id ?? ''}
            onChange={(e) =>
              onSave(note.id, { group_id: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Form.Select>

          <Form.Control
            size="sm"
            type="datetime-local"
            min="2000-01-01T00:00"
            max="2100-12-31T23:59"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            onBlur={commitDue}
          />
        </div>

        <BodyField
          body={body}
          notes={notes}
          selfId={note.id}
          onChange={(stored) => {
            setBody(stored);
            queueSave({ body: stored });
          }}
          onOpenNote={onOpenNote}
        />

        <LinkPanel connections={connections} onOpen={onOpenNote} />

        <ReminderPanel
          note={note}
          reminders={reminders}
          onAdd={onAddReminder}
          onDelete={onDeleteReminder}
        />

        <div className="paper-footer">
          {note.kind === 'task' ? (
            <button
              className={`done-btn ${note.completed ? 'is-done' : ''}`}
              onClick={(e) => onToggle(note.id, e.currentTarget.getBoundingClientRect())}
            >
              {note.completed ? '✓ Done (click to undo)' : 'Mark as done'}
            </button>
          ) : (
            <span />
          )}
          <button className="toss-btn" onClick={() => onDelete(note.id)}>🗑 Toss</button>
        </div>
      </div>
    </section>
  );
}
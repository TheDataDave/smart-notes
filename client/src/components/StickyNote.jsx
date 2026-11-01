import { safeFormat } from '../dates';
import { progress } from '../checklist';

const ICONS = { note: '📝', task: '✅', event: '📅' };

export default function StickyNote({
  note, color, active, dragging, thrown, overlay, compact, bell, onSelect, onToggle,
}) {
  // A steady "random" tilt from the id: always between -1.8deg and +1.8deg
  const tilt = (((note.id * 37) % 7) - 3) * 0.6;
  const prog = progress(note.body || '');

  return (
    <div
      className={[
        'sticky',
        active && 'active',
        note.completed && 'done',
        dragging && 'ghost',
        thrown && 'thrown',
        overlay && 'overlay',
        compact && 'compact',
      ].filter(Boolean).join(' ')}
      style={{ '--note-color': color || '#ffd43b', '--tilt': `${tilt}deg` }}
      onClick={() => onSelect?.(note.id)}
    >
      <div className="sticky-top">
        {note.kind === 'task' ? (
          <button
            className={`check ${note.completed ? 'on' : ''}`}
            aria-label={note.completed ? 'Mark as not done' : 'Mark as done'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(note.id, e.currentTarget.getBoundingClientRect());
            }}
          >
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
          </button>
        ) : (
          <span className="kind">{ICONS[note.kind]}</span>
        )}
      </div>

      <div className="sticky-title">{note.title || 'Untitled'}</div>

      {prog.total > 0 && !compact && (
        <div className="sticky-progress" title={`${prog.done} of ${prog.total} steps done`}>
          <i><b style={{ '--p': `${(prog.done / prog.total) * 100}%` }} /></i>
          <span>{prog.done}/{prog.total}</span>
        </div>
      )}

      {note.due_at && !compact && (
        <div className="sticky-due">{safeFormat(note.due_at, 'EEE, MMM d · h:mm a')}</div>
      )}
      
      {bell && !note.completed && <span className="bell" title="Has a reminder">🔔</span>}
      {!!note.completed && <span className="stamp">DONE</span>}
    </div>
  );
}
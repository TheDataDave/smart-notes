import { useCallback, useLayoutEffect, useRef } from 'react';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import StickyNote from './StickyNote';

function SortableNote({ note, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } =
    useSortable({ id: note.id });

  const el = useRef(null);
  const last = useRef(null);
  const setRefs = useCallback(
    (node) => {
      setNodeRef(node);
      el.current = node;
    },
    [setNodeRef]
  );

  // "FLIP" animation: when the layout changes (a task sinks, a note is removed),
  // slide from the old spot to the new one instead of jumping.
  useLayoutEffect(() => {
    const node = el.current;
    const board = node?.closest('.board');
    if (!node || !board) return;

    const b = board.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const now = { x: r.left - b.left + board.scrollLeft, y: r.top - b.top + board.scrollTop };
    const before = last.current;
    last.current = now;

    if (!before || isSorting) return;
    const dx = before.x - now.x;
    const dy = before.y - now.y;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

    node.animate(
      [{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }],
      { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.15)' }
    );
  });

  return (
    <div
      ref={setRefs}
      className="sticky-slot"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <StickyNote note={note} dragging={isDragging} {...rest} />
    </div>
  );
}

export default function NoteList({
  notes, groups, selectedId, thrownId, bellIds, onSelect, onAdd, onToggle,
}) {
  const colorOf = (groupId) => groups.find((g) => g.id === groupId)?.color;

  return (
    <section className="board">
      <div className="board-head">
        <h6 className="mb-0">{notes.length} {notes.length === 1 ? 'sticky' : 'stickies'}</h6>
        <div className="d-flex gap-2">
          <button className="add-btn" onClick={() => onAdd('note')}>+ Note</button>
          <button className="add-btn task" onClick={() => onAdd('task')}>+ Task</button>
          <button className="add-btn event" onClick={() => onAdd('event')}>+ Event</button>
        </div>
      </div>

      <SortableContext items={notes.map((n) => n.id)} strategy={rectSortingStrategy}>
        <div className="board-grid">
          {notes.map((n) => (
            <SortableNote
              key={n.id}
              note={n}
              color={colorOf(n.group_id)}
              active={n.id === selectedId}
              thrown={n.id === thrownId}
              onSelect={onSelect}
              onToggle={onToggle}
              bell={bellIds?.has(n.id)}
            />
          ))}
        </div>
      </SortableContext>

      {notes.length === 0 && <p className="board-empty">Nothing stuck here yet.</p>}
    </section>
  );
}
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
  notes, groups, selectedId, thrownId, bellIds, query, onQuery, searchRef,
  onSelect, onAdd, onToggle,
}) {
  const colorOf = (groupId) => groups.find((g) => g.id === groupId)?.color;
  const searching = query.trim() !== '';

  return (
    <section className="board">
      <div className="board-head">
        <div className="board-head-row">
          <h6 className="mb-0">
            {searching
              ? `${notes.length} found`
              : `${notes.length} ${notes.length === 1 ? 'sticky' : 'stickies'}`}
          </h6>
          <div className="d-flex gap-2">
            <button className="add-btn" onClick={() => onAdd('note')}>+ Note</button>
            <button className="add-btn task" onClick={() => onAdd('task')}>+ Task</button>
            <button className="add-btn event" onClick={() => onAdd('event')}>+ Event</button>
          </div>
        </div>

        <div className="search-box">
          <span aria-hidden="true">🔍</span>
          <input
            ref={searchRef}
            value={query}
            placeholder="Search all notes...  (Ctrl+K)"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onQuery('');
                e.currentTarget.blur();
              } else if (e.key === 'Enter' && notes[0]) {
                onSelect(notes[0].id);
              }
            }}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => onQuery('')}>×</button>
          )}
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
              bell={bellIds?.has(n.id)}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      </SortableContext>

      {notes.length === 0 && (
        <p className="board-empty">
          {searching ? `No stickies match “${query.trim()}”.` : 'Nothing stuck here yet.'}
        </p>
      )}
    </section>
  );
}
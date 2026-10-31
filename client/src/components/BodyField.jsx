import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cleanTitle, findTrigger, splitBody, toDisplay, toStored } from '../mentions';

export default function BodyField({ body, notes, selfId, onChange, onOpenNote }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(null); // { start, items, index }
  const mentions = useRef(new Map());     // "@Name" -> note id, for this editing session
  const area = useRef(null);
  const caretTo = useRef(null);

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  const startEditing = () => {
    const { text, map } = toDisplay(body, notesById);
    mentions.current = map;
    setText(text);
    setEditing(true);
  };

  // Focus the textarea with the caret at the end when editing begins
  useEffect(() => {
    if (editing && area.current) {
      area.current.focus();
      const end = area.current.value.length;
      area.current.setSelectionRange(end, end);
    }
  }, [editing]);

  // After picking a mention, put the caret just after it
  useLayoutEffect(() => {
    if (caretTo.current != null && area.current) {
      area.current.setSelectionRange(caretTo.current, caretTo.current);
      caretTo.current = null;
    }
  }, [text]);

  const updateMenu = (value, caret) => {
    const trigger = findTrigger(value, caret);
    if (!trigger) return setMenu(null);
    const q = trigger.query.toLowerCase();
    const items = notes
      .filter((n) => n.id !== selfId && cleanTitle(n).toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (n) => (cleanTitle(n).toLowerCase().startsWith(q) ? 0 : 1);
        return rank(a) - rank(b) || cleanTitle(a).localeCompare(cleanTitle(b));
      })
      .slice(0, 6);
    setMenu(items.length ? { start: trigger.start, items, index: 0 } : null);
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);
    onChange(toStored(value, mentions.current));
    updateMenu(value, e.target.selectionStart);
  };

  const pick = (note) => {
    const name = cleanTitle(note);
    mentions.current.set(name, note.id);
    const caret = area.current.selectionStart;
    const next = text.slice(0, menu.start) + '@' + name + ' ' + text.slice(caret);
    caretTo.current = menu.start + name.length + 2;
    setText(next);
    onChange(toStored(next, mentions.current));
    setMenu(null);
  };

  const handleKeyDown = (e) => {
    if (!menu) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setMenu((m) => ({ ...m, index: (m.index + step + m.items.length) % m.items.length }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(menu.items[menu.index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMenu(null);
    }
  };

  if (!editing) {
    const parts = splitBody(body);
    return (
      <div className="body-wrap">
        <div className="body-view" onClick={startEditing}>
          {parts.length === 0 && (
            <span className="body-placeholder">Start writing... type @ to link a note</span>
          )}
          {parts.map((p, i) => {
            if (!p.mention) return <span key={i}>{p.text}</span>;
            const note = notesById.get(p.id);
            return note ? (
              <button
                key={i}
                className="mention"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenNote(p.id);
                }}
              >
                @{cleanTitle(note)}
              </button>
            ) : (
              <span key={i} className="mention broken" title="This note was deleted">
                @{p.title}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="body-wrap">
      <textarea
        ref={area}
        className="form-control body-input"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            updateMenu(e.target.value, e.target.selectionStart);
          }
        }}
        onClick={(e) => updateMenu(e.target.value, e.target.selectionStart)}
        onBlur={() => {
          setEditing(false);
          setMenu(null);
        }}
      />
      {menu && (
        <div className="mention-menu" onMouseDown={(e) => e.preventDefault()}>
          <div className="mention-hint">↑↓ to choose · Enter to link · Esc to cancel</div>
          {menu.items.map((n, i) => (
            <div
              key={n.id}
              className={`mention-item ${i === menu.index ? 'on' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(n);
              }}
            >
              <span>{{ note: '📝', task: '✅', event: '📅' }[n.kind]}</span>
              <span className="text-truncate">{cleanTitle(n)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
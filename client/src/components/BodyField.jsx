import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { safeFormat } from '../dates';
import {
  buildLabels, cleanTitle, findTrigger, snippet, splitBody, tagOf, toDisplay, toStored,
} from '../mentions';

const ICONS = { note: '📝', task: '✅', event: '📅' };

export default function BodyField({ body, notes, groups, selfId, onChange, onOpenNote }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(null); // { start, items, index }
  const mentions = useRef(new Map());     // "Label" -> note id, for this editing session
  const area = useRef(null);
  const caretTo = useRef(null);

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const labels = useMemo(() => buildLabels(notes), [notes]);

  // Group, due date and the start of the body: enough to tell look-alikes apart
  const details = (n) =>
    [
      groups.find((g) => g.id === n.group_id)?.name,
      safeFormat(n.due_at, 'MMM d'),
      snippet(n),
    ].filter(Boolean).join(' · ');

  const startEditing = () => {
    const { text, map } = toDisplay(body, labels);
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
      .filter((n) => n.id !== selfId && labels.get(n.id).toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (n) => (labels.get(n.id).toLowerCase().startsWith(q) ? 0 : 1);
        return rank(a) - rank(b) || labels.get(a.id).localeCompare(labels.get(b.id));
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
    const name = labels.get(note.id); // unique, so two notes can never share an entry
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
            if (!note) {
              return (
                <span key={i} className="mention broken" title="This note was deleted">
                  @{p.title}
                </span>
              );
            }
            const tag = tagOf(labels.get(note.id), note);
            return (
              <button
                key={i}
                className="mention"
                title={`${ICONS[note.kind]} ${details(note)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenNote(p.id);
                }}
              >
                @{cleanTitle(note)}
                {tag && <small className="mention-tag">{tag}</small>}
              </button>
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
          {menu.items.map((n, i) => {
            const tag = tagOf(labels.get(n.id), n);
            return (
              <div
                key={n.id}
                className={`mention-item ${i === menu.index ? 'on' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(n);
                }}
              >
                <span>{ICONS[n.kind]}</span>
                <span className="mi-main">
                  <span className="text-truncate">{cleanTitle(n)}</span>
                  <span className="mi-sub text-truncate">{details(n) || 'Empty note'}</span>
                </span>
                {tag && <span className="mi-tag">{tag}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
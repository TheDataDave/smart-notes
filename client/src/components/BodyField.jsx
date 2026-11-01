import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { safeFormat } from '../dates';
import { celebrate } from '../celebrate';
import { parseLine, toggleLine } from '../checklist';
import { findDates } from '../smartDates';
import {
  buildLabels, cleanTitle, findTrigger, plainText, snippet, splitBody, tagOf, toDisplay, toStored,
} from '../mentions';
import DatePrompt from './DatePrompt';

const ICONS = { note: '📝', task: '✅', event: '📅' };

export default function BodyField({
  body, notes, groups, reminders, selfId, onChange, onOpenNote, onRemind, onSetDue,
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(null);     // { start, items, index }
  const [prompt, setPrompt] = useState(null); // { hit, label, rect }
  const mentions = useRef(new Map());
  const area = useRef(null);
  const caretTo = useRef(null);

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const labels = useMemo(() => buildLabels(notes), [notes]);

  // Times that already have a pending reminder on this note
  const reminded = useMemo(
    () => new Set(reminders.filter((r) => !r.fired).map((r) => new Date(r.remind_at).toISOString())),
    [reminders]
  );

  const details = (n) =>
    [groups.find((g) => g.id === n.group_id)?.name, safeFormat(n.due_at, 'MMM d'), snippet(n)]
      .filter(Boolean).join(' · ');

  const startEditing = (stored = body) => {
    const { text, map } = toDisplay(stored, labels);
    mentions.current = map;
    setText(text);
    setEditing(true);
  };

  useEffect(() => {
    if (editing && area.current) {
      area.current.focus();
      const end = area.current.value.length;
      area.current.setSelectionRange(end, end);
    }
  }, [editing]);

  // Put the caret where we said, and grow the textarea to fit its text
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    if (caretTo.current != null) {
      el.setSelectionRange(caretTo.current, caretTo.current);
      caretTo.current = null;
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, editing]);

  const commit = (next, caret) => {
    caretTo.current = caret;
    setText(next);
    onChange(toStored(next, mentions.current));
  };

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
    const name = labels.get(note.id);
    mentions.current.set(name, note.id);
    const caret = area.current.selectionStart;
    const next = text.slice(0, menu.start) + '@' + name + ' ' + text.slice(caret);
    commit(next, menu.start + name.length + 2);
    setMenu(null);
  };

  // Enter on a checklist line starts the next item; Enter on an empty one ends the list
  const continueList = (e) => {
    const el = e.currentTarget;
    const pos = el.selectionStart;
    if (pos !== el.selectionEnd) return false;

    const start = pos === 0 ? 0 : text.lastIndexOf('\n', pos - 1) + 1;
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    const full = text.slice(start, end);
    const item = parseLine(full);
    if (!item) return false;
    if (pos - start < full.length - item.text.length) return false; // caret is inside the "[ ]"

    e.preventDefault();
    if (item.text.trim() === '') {
      commit(text.slice(0, start) + text.slice(end), start); // empty item: leave the list
    } else {
      const marker = `\n${item.indent}[ ] `;
      commit(text.slice(0, pos) + marker + text.slice(pos), pos + marker.length);
    }
    return true;
  };

  const handleKeyDown = (e) => {
    if (menu) {
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
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) continueList(e);
  };

  const addItem = () => {
    if (editing) {
      const next = text + (text && !text.endsWith('\n') ? '\n' : '') + '[ ] ';
      commit(next, next.length);
      area.current?.focus();
    } else {
      const stored = body + (body && !body.endsWith('\n') ? '\n' : '') + '[ ] ';
      onChange(stored);
      startEditing(stored);
    }
  };

  const tools = (
    <div className="body-tools">
      <button onMouseDown={(e) => e.preventDefault()} onClick={addItem}>
        ☑ Add checklist item
      </button>
    </div>
  );

  // ---------- editing ----------
  if (editing) {
    return (
      <>
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
        {tools}
      </>
    );
  }

  // ---------- reading ----------
  const renderDates = (str, key, label) => {
    const hits = findDates(str);
    if (!hits.length) return str;
    const out = [];
    let last = 0;
    hits.forEach((h, i) => {
      if (h.start > last) out.push(<Fragment key={`${key}t${i}`}>{str.slice(last, h.start)}</Fragment>);
      const has = reminded.has(h.date.toISOString());
      const forLabel = label.toLowerCase() === h.text.toLowerCase() ? '' : label;
      out.push(
        <button
          key={`${key}d${i}`}
          className={`date-chip ${has ? 'has' : ''} ${h.past ? 'past' : ''}`}
          title={has ? 'Reminder set' : 'Click to set a reminder'}
          onClick={(e) => {
            e.stopPropagation();
            setPrompt({ hit: h, label: forLabel, rect: e.currentTarget.getBoundingClientRect() });
          }}
        >
          {has ? '🔔 ' : '⏰ '}{h.text}
        </button>
      );
      last = h.end;
    });
    if (last < str.length) out.push(<Fragment key={`${key}end`}>{str.slice(last)}</Fragment>);
    return out;
  };

  const renderParts = (content, lineKey) => {
    const label = plainText(content).slice(0, 100);
    return splitBody(content).map((p, i) => {
      const key = `${lineKey}-${i}`;
      if (!p.mention) return <Fragment key={key}>{renderDates(p.text, key, label)}</Fragment>;

      const note = notesById.get(p.id);
      if (!note) {
        return (
          <span key={key} className="mention broken" title="This note was deleted">
            @{p.title}
          </span>
        );
      }
      const tag = tagOf(labels.get(note.id), note);
      return (
        <button
          key={key}
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
    });
  };

  const empty = body.trim() === '';

  return (
    <>
      <div className="body-wrap">
        <div className="body-view" onClick={() => startEditing()}>
          {empty ? (
            <div className="text-line body-placeholder">
              Start writing... type @ to link a note, or add a checklist
            </div>
          ) : (
            body.split('\n').map((raw, index) => {
              const item = parseLine(raw);
              const content = item ? item.text : raw;
              const parts = renderParts(content, index);

              if (!item) {
                return <div key={index} className="text-line">{parts.length ? parts : '\u200b'}</div>;
              }
              return (
                <div
                  key={index}
                  className={`check-line ${item.done ? 'done' : ''}`}
                  style={{ marginLeft: `${item.indent.replace(/\t/g, '  ').length * 0.5}rem` }}
                >
                  <button
                    className={`sub-check ${item.done ? 'on' : ''}`}
                    aria-label={item.done ? 'Mark step as not done' : 'Mark step as done'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!item.done) celebrate(e.currentTarget.getBoundingClientRect(), { small: true });
                      onChange(toggleLine(body, index));
                    }}
                  >
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <span className="check-text">{parts.length ? parts : '\u200b'}</span>
                </div>
              );
            })
          )}
        </div>

        {prompt && (
          <DatePrompt
            hit={prompt.hit}
            label={prompt.label}
            rect={prompt.rect}
            exists={reminded.has(prompt.hit.date.toISOString())}
            onRemind={(iso) => onRemind(iso, prompt.label)}
            onDue={onSetDue}
            onClose={() => setPrompt(null)}
          />
        )}
      </div>
      {tools}
    </>
  );
}
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, pointerWithin,
  useSensor, useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from './api';
import { celebrate } from './celebrate';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import Editor from './components/Editor';
import StickyNote from './components/StickyNote';
import ReminderPopups from './components/ReminderPopups';
import { mentionIds } from './mentions';
import { useUpdater } from './useUpdater';
import UpdateBanner from './components/UpdateBanner';

const COLORS = ['#6f42c1', '#d63384', '#fd7e14', '#20c997', '#0d6efd', '#ffc107'];
const byPosition = (a, b) => a.position - b.position || a.id - b.id;
const isTarget = (id) => String(id).startsWith('group:') || id === 'trash';

// How the floating note disappears into the trash: shrink, spin, fade
const trashDrop = {
  duration: 450,
  easing: 'cubic-bezier(.5, 0, .9, .4)',
  keyframes: ({ transform }) => [
    { transform: CSS.Transform.toString(transform.initial), opacity: 1 },
    {
      transform: `${CSS.Transform.toString({ ...transform.initial, scaleX: 0.15, scaleY: 0.15 })} rotate(300deg)`,
      opacity: 0,
    },
  ],
};

export default function App() {
  const [groups, setGroups] = useState([]);
  const [notes, setNotes] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  const [draggingId, setDraggingId] = useState(null);
  const [overTarget, setOverTarget] = useState(null); // null | 'group' | 'trash'
  const [thrownId, setThrownId] = useState(null);     // note mid-toss
  const [settling, setSettling] = useState([]);       // just-completed notes, not yet sunk
  const [undoNote, setUndoNote] = useState(null);     // note that can still be rescued
  const [reminders, setReminders] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [links, setLinks] = useState([]);
  const [trail, setTrail] = useState([]); // notes you jumped away from, for the Back button
  const pending = useRef(null);                       // { note, timer }
  const updater = useUpdater();

  useEffect(() => {
    Promise.all([
      api.get('/api/groups'),
      api.get('/api/notes'),
      api.get('/api/reminders'),
      api.get('/api/note-links'),
    ])
      .then(([g, n, r, l]) => {
        setGroups(g);
        setNotes(n);
        setReminders(r);
        setLinks(l);
      })
      .catch((err) => setError(`Couldn't load: ${err.message}`));
  }, []);

  // Listen for reminders from the Electron main process
  useEffect(() => {
    if (!window.desktop?.onReminderFired) return;

    const offFired = window.desktop.onReminderFired((r) => {
      const key = `${r.id}-${r.remind_at}`;
      setAlerts((a) => (a.some((x) => x.key === key) ? a : [...a, { ...r, key }]));
      api.get('/api/reminders').then(setReminders).catch(console.error);
    });

    const offOpen = window.desktop.onOpenNote((noteId) => {
      setFilter('all');
      setSelectedId(noteId);
    });

    return () => {
      offFired();
      offOpen();
    };
  }, []);

  const bellIds = useMemo(
    () => new Set(reminders.filter((r) => !r.fired).map((r) => r.note_id)),
    [reminders]
  );

  const addReminder = async (note_id, remind_at, repeat = 'none') => {
    try {
      const r = await api.post('/api/reminders', { note_id, remind_at, repeat });
      setReminders((prev) => [...prev, r]);
    } catch (err) {
      setError(`Couldn't set reminder: ${err.message}`);
    }
  };

  const deleteReminder = async (id) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    try {
      await api.del(`/api/reminders/${id}`);
    } catch (err) {
      setError(`Couldn't delete reminder: ${err.message}`);
    }
  };

  const dismissAlert = (key) => setAlerts((a) => a.filter((x) => x.key !== key));

  const openAlert = (alert) => {
    setFilter('all');
    setSelectedId(alert.note_id);
    dismissAlert(alert.key);
  };

  const snoozeAlert = (alert, minutes) => {
    dismissAlert(alert.key);
    addReminder(alert.note_id, new Date(Date.now() + minutes * 60000).toISOString());
  };

  // Open notes first, completed ones at the end (after a short celebration delay)
  const visibleNotes = useMemo(
    () =>
      notes
        .filter((n) =>
          filter === 'all' ? true : filter === 'none' ? n.group_id == null : n.group_id === filter
        )
        .sort((a, b) => {
          const sunk = (n) => (n.completed && !settling.includes(n.id) ? 1 : 0);
          return sunk(a) - sunk(b) || byPosition(a, b);
        }),
    [notes, filter, settling]
  );

  const selected = notes.find((n) => n.id === selectedId) || null;
  const selectedColor = groups.find((g) => g.id === selected?.group_id)?.color;

  // Jump to a note, remembering where we came from
  const openNote = (id) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    const visible =
      filter === 'all' || (filter === 'none' ? n.group_id == null : n.group_id === filter);
    if (!visible) setFilter('all'); // make sure its sticky is on the board
    if (selectedId !== null && selectedId !== id) setTrail((t) => [...t.slice(-19), selectedId]);
    setSelectedId(id);
  };

  const goBack = () => {
    const alive = new Set(notes.map((n) => n.id));
    const t = trail.filter((id) => alive.has(id)); // skip notes that were deleted meanwhile
    if (!t.length) return setTrail([]);
    setSelectedId(t[t.length - 1]);
    setTrail(t.slice(0, -1));
  };

  const connections = useMemo(() => {
    if (!selected) return { outgoing: [], incoming: [] };
    const byId = new Map(notes.map((n) => [n.id, n]));
    const resolve = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
    return {
      outgoing: resolve(links.filter((l) => l.from_id === selected.id).map((l) => l.to_id)),
      incoming: resolve(links.filter((l) => l.to_id === selected.id).map((l) => l.from_id)),
    };
  }, [links, notes, selected]);

  // ---------- notes ----------

  const addNote = async (kind = 'note') => {
    try {
      const note = await api.post('/api/notes', {
        kind,
        title: '',
        group_id: typeof filter === 'number' ? filter : null,
      });
      setNotes((prev) => [...prev, note]);
      setSelectedId(note.id);
    } catch (err) {
      setError(`Couldn't create note: ${err.message}`);
    }
  };

  const updateNote = useCallback(async (id, changes) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...changes } : n)).sort(byPosition)
    );
    try {
      await api.patch(`/api/notes/${id}`, changes);

      // A new body may contain new @mentions: sync them into the links table
      if (changes.body !== undefined) {
        const ids = mentionIds(changes.body).filter((t) => t !== id);
        await api.put(`/api/notes/${id}/mentions`, { ids });
        setLinks((prev) => [
          ...prev.filter((l) => l.from_id !== id),
          ...ids.map((to_id) => ({ from_id: id, to_id })),
        ]);
      }
    } catch (err) {
      console.error(err);
      setError(`Couldn't save: ${err.message}`);
    }
  }, []);

  const toggleComplete = async (id, rect) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const finishing = !note.completed;
    if (finishing) celebrate(rect); // fire right away; don't wait for the server

    try {
      const updated = await api.post(`/api/notes/${id}/complete`);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      if (finishing) {
        // Keep it in place for a moment so the stamp and confetti get their show
        setSettling((s) => [...s, id]);
        setTimeout(() => setSettling((s) => s.filter((x) => x !== id)), 1100);
      }
    } catch (err) {
      setError(`Couldn't update task: ${err.message}`);
    }
  };

  // ---------- tossing notes (with undo) ----------

  // Really delete the note on the server
  const commitPending = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    const { note } = pending.current;
    pending.current = null;
    setUndoNote(null);
    api.del(`/api/notes/${note.id}`).catch((err) =>
      setError(`Couldn't delete: ${err.message}`)
    );
  }, []);

  // Hide the note now, delete it for real in 6 seconds unless undone
  const throwAway = (note) => {
    if (!note) return;
    commitPending(); // a previous toss becomes permanent
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    setSelectedId((cur) => (cur === note.id ? null : cur));
    pending.current = { note, timer: setTimeout(commitPending, 6000) };
    setUndoNote(note);
  };

  const undoThrow = () => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    const { note } = pending.current;
    pending.current = null;
    setUndoNote(null);
    setNotes((prev) => [...prev, note].sort(byPosition));
  };

  // ---------- groups ----------

  const addGroup = async (name) => {
    const color = COLORS[groups.length % COLORS.length];
    const group = await api.post('/api/groups', { name, color });
    setGroups((prev) => [...prev, group]);
  };

  const deleteGroup = async (id) => {
    await api.del(`/api/groups/${id}`);
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setNotes((prev) => prev.map((n) => (n.group_id === id ? { ...n, group_id: null } : n)));
    if (filter === id) setFilter('all');
  };

  // ---------- drag and drop ----------

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const collisionDetection = (args) => {
    const hits = pointerWithin(args).filter((c) => isTarget(c.id));
    if (hits.length) return hits;
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => !isTarget(c.id)),
    });
  };

  const kindOf = (over) =>
    !over ? null : over.id === 'trash' ? 'trash' : String(over.id).startsWith('group:') ? 'group' : null;

  const nearCursor = ({ transform, activatorEvent, draggingNodeRect }) => {
    if (!activatorEvent || !draggingNodeRect) return transform;
    return {
      ...transform,
      x: transform.x + (activatorEvent.clientX - draggingNodeRect.left) + 16,
      y: transform.y + (activatorEvent.clientY - draggingNodeRect.top) + 16,
    };
  };

  const handleDragEnd = ({ active, over }) => {
    setDraggingId(null);
    // After a toss, overTarget stays 'trash' so the flying note keeps its small
    // size; it is reset when the next drag starts.
    if (over?.id !== 'trash') setOverTarget(null);
    if (!over) return;

    const note = notes.find((n) => n.id === active.id);
    if (!note) return;

    // Dropped in the trash: let the animation play, then remove the note
    if (over.id === 'trash') {
      setThrownId(note.id);
      setTimeout(() => {
        setThrownId(null);
        throwAway(note);
      }, 460);
      return;
    }

    // Dropped on a group in the sidebar
    if (String(over.id).startsWith('group:')) {
      const key = String(over.id).slice('group:'.length);
      const group_id = key === 'none' ? null : Number(key);
      if (note.group_id !== group_id) updateNote(note.id, { group_id });
      return;
    }

    // Dropped on another note: reorder among notes with the same done/open status
    if (active.id === over.id) return;
    const pool = visibleNotes.filter((n) => !!n.completed === !!note.completed);
    const from = pool.findIndex((n) => n.id === active.id);
    const to = pool.findIndex((n) => n.id === over.id);
    if (from < 0 || to < 0) return;

    const moved = arrayMove(pool, from, to);
    const before = moved[to - 1];
    const after = moved[to + 1];
    const position =
      before && after ? (before.position + after.position) / 2
      : before ? before.position + 1
      : after.position - 1;

    updateNote(active.id, { position });
  };

  const dragged = notes.find((n) => n.id === draggingId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) => {
        setDraggingId(active.id);
        setOverTarget(null);
      }}
      onDragOver={({ over }) => setOverTarget(kindOf(over))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDraggingId(null);
        setOverTarget(null);
      }}
    >
      <div className="app-shell">
        {error && (
          <Alert
            variant="danger"
            dismissible
            onClose={() => setError(null)}
            style={{ position: 'fixed', top: 12, right: 12, zIndex: 1000 }}
          >
            {error}
          </Alert>
        )}
        <Sidebar
          groups={groups}
          notes={notes}
          filter={filter}
          onFilter={setFilter}
          onAddGroup={addGroup}
          onDeleteGroup={deleteGroup}
          dragging={draggingId !== null}
          slam={thrownId !== null}
          update={updater}
        />
        <NoteList
          notes={visibleNotes}
          groups={groups}
          selectedId={selectedId}
          thrownId={thrownId}
          onSelect={setSelectedId}
          onAdd={addNote}
          onToggle={toggleComplete}
          bellIds={bellIds}
        />
        {selected ? (
          <Editor
            key={selected.id}
            note={selected}
            groups={groups}
            color={selectedColor}
            onSave={updateNote}
            onToggle={toggleComplete}
            onDelete={(id) => throwAway(notes.find((n) => n.id === id))}
            reminders={reminders.filter((r) => r.note_id === selected.id)}
            onAddReminder={addReminder}
            onDeleteReminder={deleteReminder}
            notes={notes}
            connections={connections}
            canGoBack={trail.length > 0}
            onOpenNote={openNote}
            onBack={goBack}
          />
        ) : (
          <div className="empty-state">Pick a sticky, or make a new one.</div>
        )}
      </div>

      {undoNote && (
        <div className="undo-toast">
          <span>Tossed “{undoNote.title || 'Untitled'}”</span>
          <button onClick={undoThrow}>Undo</button>
        </div>
      )}
      <ReminderPopups
        alerts={alerts}
        onOpen={openAlert}
        onSnooze={snoozeAlert}
        onDismiss={dismissAlert}
      />
      <UpdateBanner state={updater.state} onInstall={updater.install} />
      <DragOverlay
        modifiers={overTarget === 'group' ? [nearCursor] : undefined}
        dropAnimation={overTarget === 'trash' ? trashDrop : undefined}
      >
        {dragged ? (
          <StickyNote
            overlay
            compact={overTarget !== null}
            note={dragged}
            color={groups.find((g) => g.id === dragged.group_id)?.color}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
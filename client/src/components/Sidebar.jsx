import { useState } from 'react';
import { Badge, Form } from 'react-bootstrap';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TrashCan from './TrashCan';
import GroupSettings from './GroupSettings';

function Item({ id, dropId, label, color, total, active, dragging, onSelect, onSettings, grip }) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId ?? `nodrop:${id}`,
    disabled: !dropId,
  });

  return (
    <div
      ref={setNodeRef}
      className={`side-item ${active ? 'active' : ''} ${dragging && dropId ? 'drop-ready' : ''} ${isOver ? 'drop-over' : ''}`}
      onClick={() => onSelect(id)}
    >
      {grip}
      <span className="dot" style={{ background: color || '#adb5bd' }} />
      <span className="flex-grow-1 text-truncate">{label}</span>
      <Badge bg="light" text="dark" pill>{total}</Badge>
      {onSettings && (
        <button
          className="btn-x"
          title="Group settings"
          onClick={(e) => {
            e.stopPropagation();
            onSettings(e.currentTarget.getBoundingClientRect());
          }}
        >
          ⚙
        </button>
      )}
    </div>
  );
}

// One group row that can be dragged up and down. Only the ⠿ handle starts the drag,
// so clicking the row still selects it.
function SortableGroup({ group, ...props }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: `gsort:${group.id}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
        position: 'relative',
        zIndex: isDragging ? 5 : 'auto',
      }}
    >
      <Item
        {...props}
        id={group.id}
        dropId={`group:${group.id}`}
        label={group.name}
        color={group.color}
        grip={
          <span
            ref={setActivatorNodeRef}
            className="grip"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            ⠿
          </span>
        }
      />
    </div>
  );
}

export default function Sidebar({
  groups, notes, filter, onFilter, onAddGroup, onUpdateGroup, onDeleteGroup, dragging, slam, update,
}) {
  const [name, setName] = useState('');
  const [settings, setSettings] = useState(null); // { id, rect }
  const count = (test) => notes.filter(test).length;
  const editing = settings && groups.find((g) => g.id === settings.id);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddGroup(name.trim());
    setName('');
  };

  return (
    <aside className="sidebar">
      <h5 className="px-3 pt-3 mb-3">Smart Notes</h5>

      <Item id="all" label="All notes" total={notes.length}
            active={filter === 'all'} onSelect={onFilter} />
      <Item id="none" dropId="group:none" dragging={dragging} label="Ungrouped"
            total={count((n) => n.group_id == null)}
            active={filter === 'none'} onSelect={onFilter} />

      <div className="side-heading">Groups</div>
      <SortableContext items={groups.map((g) => `gsort:${g.id}`)} strategy={verticalListSortingStrategy}>
        {groups.map((g) => (
          <SortableGroup
            key={g.id}
            group={g}
            dragging={dragging}
            total={count((n) => n.group_id === g.id)}
            active={filter === g.id}
            onSelect={onFilter}
            onSettings={(rect) => setSettings({ id: g.id, rect })}
          />
        ))}
      </SortableContext>

      <Form onSubmit={submit} className="p-3">
        <div className="group-add">
          <Form.Control
            placeholder="New group..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="add-btn">Add</button>
        </div>
      </Form>

      <TrashCan dragging={dragging} slam={slam} />

      {update.state.currentVersion && (
        <div className="version-line">
          <span>v{update.state.currentVersion}</span>
          {update.state.status === 'ready' ? (
            <button onClick={update.install}>Restart to update</button>
          ) : (
            <button
              onClick={update.check}
              disabled={['checking', 'downloading'].includes(update.state.status)}
            >
              Check for updates
            </button>
          )}
        </div>
      )}

      {editing && (
        <GroupSettings
          group={editing}
          rect={settings.rect}
          onSave={onUpdateGroup}
          onDelete={(id) => {
            setSettings(null);
            onDeleteGroup(id);
          }}
          onClose={() => setSettings(null)}
        />
      )}
    </aside>
  );
}
import { useState } from 'react';
import { Badge, Form } from 'react-bootstrap';
import { useDroppable } from '@dnd-kit/core';
import TrashCan from './TrashCan';

function Item({ id, dropId, label, color, total, active, dragging, onSelect, onRemove }) {
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
      <span className="dot" style={{ background: color || '#adb5bd' }} />
      <span className="flex-grow-1 text-truncate">{label}</span>
      <Badge bg="light" text="dark" pill>{total}</Badge>
      {onRemove && (
        <button
          className="btn-x"
          title="Delete group"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ groups, notes, filter, onFilter, onAddGroup, onDeleteGroup, dragging, slam }) {
  const [name, setName] = useState('');
  const count = (test) => notes.filter(test).length;

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
      <Item id="none" dropId="group:none" label="Ungrouped"
            total={count((n) => n.group_id == null)}
            active={filter === 'none'} onSelect={onFilter} dragging={dragging} />

      <div className="side-heading">Groups</div>
      {groups.map((g) => (
        <Item
          key={g.id}
          id={g.id}
          dropId={`group:${g.id}`}
          label={g.name}
          color={g.color}
          total={count((n) => n.group_id === g.id)}
          active={filter === g.id}
          onSelect={onFilter}
          onRemove={() => onDeleteGroup(g.id)}
          dragging={dragging}
        />
      ))}

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
    </aside>
  );
}
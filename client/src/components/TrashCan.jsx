import { useDroppable } from '@dnd-kit/core';

export default function TrashCan({ dragging, slam }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });
  const open = isOver || slam;

  return (
    <div
      ref={setNodeRef}
      className={['trash', dragging && 'ready', open && 'open', slam && 'slam']
        .filter(Boolean).join(' ')}
    >
      <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
        <g className="lid">
          <rect x="12" y="15" width="40" height="6" rx="3" />
          <rect x="25" y="9" width="14" height="7" rx="3" />
        </g>
        <path className="can" d="M16 24h32l-3 32a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4z" />
        <path className="ribs" d="M26 31v21M32 31v21M38 31v21" />
      </svg>
      <div className="trash-label">{open ? 'Let go!' : 'Toss it here'}</div>
    </div>
  );
}
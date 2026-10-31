const ICONS = { note: '📝', task: '✅', event: '📅' };

function Group({ label, items, onOpen }) {
  if (!items.length) return null;
  return (
    <div className="link-group">
      <span className="link-label">{label}</span>
      {items.map((n) => (
        <button key={n.id} className="link-chip" onClick={() => onOpen(n.id)}>
          {ICONS[n.kind]} {n.title || 'Untitled'}
        </button>
      ))}
    </div>
  );
}

export default function LinkPanel({ connections, onOpen }) {
  const { outgoing, incoming } = connections;
  if (!outgoing.length && !incoming.length) return null;
  return (
    <div className="link-panel">
      <div className="reminder-title">🔗 Connections</div>
      <Group label="Links to" items={outgoing} onOpen={onOpen} />
      <Group label="Mentioned in" items={incoming} onOpen={onOpen} />
    </div>
  );
}
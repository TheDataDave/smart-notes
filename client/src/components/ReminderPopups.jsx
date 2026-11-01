export default function ReminderPopups({ alerts, onOpen, onSnooze, onDismiss }) {
  if (alerts.length === 0) return null;

  return (
    <div className="reminder-stack">
      {alerts.map((a) => (
        <div className="reminder-card" key={a.key}>
          <div className="reminder-bell">🔔</div>
          <div className="reminder-text">
            <div className="reminder-head">{a.title || 'Untitled'}</div>
            <div className="reminder-sub">{a.label || 'Reminder is due'}</div>
            <div className="reminder-actions">
              <button className="primary" onClick={() => onOpen(a)}>Open</button>
              <button onClick={() => onSnooze(a, 10)}>+10 min</button>
              <button onClick={() => onSnooze(a, 60)}>+1 hour</button>
              <button onClick={() => onDismiss(a.key)}>Dismiss</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
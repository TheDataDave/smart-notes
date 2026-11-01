import { useEffect, useState } from 'react';
import { celebrate } from '../celebrate';

export default function UpdateBanner({ state, onInstall }) {
  const [later, setLater] = useState(null);     // the version the user postponed
  const [welcome, setWelcome] = useState(null); // "you just updated" message

  // After an update, say so once. We remember the last version this app ran.
  useEffect(() => {
    if (!state.currentVersion) return;
    try {
      const last = localStorage.getItem('lastSeenVersion');
      localStorage.setItem('lastSeenVersion', state.currentVersion);
      if (last && last !== state.currentVersion) {
        setWelcome(state.currentVersion);
        setTimeout(() => celebrate(), 400);
        setTimeout(() => setWelcome(null), 6000);
      }
    } catch {
      /* storage unavailable: skip the celebration */
    }
  }, [state.currentVersion]);

  const { status, version, percent = 0, manual, message } = state;

  return (
    <>
      {status === 'installing' && (
        <div className="update-overlay">
          <div className="update-sticky">⬆️</div>
          <h4>Installing Smart Notes {version}</h4>
          <p>The app will close and reopen by itself in a few seconds.</p>
          <div className="update-bar indeterminate"><span /></div>
        </div>
      )}

      <div className="update-stack">
        {status === 'downloading' && (
          <div className="update-card">
            <div className="flex-grow-1">
              <div className="update-title">⬇️ Downloading update {version}</div>
              <div className="update-bar" style={{ '--pct': `${percent}%` }}><span /></div>
            </div>
            <span className="update-pct">{percent}%</span>
          </div>
        )}

        {status === 'ready' && later !== version && (
          <div className="update-card ready">
            <div className="flex-grow-1">
              <div className="update-title">🎉 Version {version} is ready</div>
              <div className="update-sub">Restart now, or it installs when you quit.</div>
              <div className="update-actions">
                <button className="primary" onClick={onInstall}>Restart &amp; update</button>
                <button onClick={() => setLater(version)}>Later</button>
              </div>
            </div>
          </div>
        )}

        {status === 'uptodate' && manual && (
          <div className="update-card"><div className="update-title">✅ You’re on the latest version</div></div>
        )}

        {status === 'error' && manual && (
          <div className="update-card error">
            <div className="update-title">Couldn’t check for updates</div>
            <div className="update-sub">{message}</div>
          </div>
        )}

        {welcome && (
          <div className="update-card ready">
            <div className="update-title">✨ Updated to version {welcome}</div>
          </div>
        )}
      </div>
    </>
  );
}
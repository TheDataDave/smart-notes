import { useEffect, useState } from 'react';

export function useUpdater() {
  const [state, setState] = useState({ status: 'idle', currentVersion: '' });

  useEffect(() => {
    const d = window.desktop;
    if (!d?.getUpdateState) return; // running in a plain browser
    d.getUpdateState().then(setState).catch(console.error);
    return d.onUpdateState(setState);
  }, []);

  return {
    state,
    check: () => window.desktop?.checkForUpdates(),
    install: () => window.desktop?.installUpdate(),
  };
}
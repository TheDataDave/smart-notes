const { contextBridge, ipcRenderer } = require('electron');

// Subscribe to a main-process message; returns a function that unsubscribes
function listen(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  onReminderFired: (cb) => listen('reminder:fired', cb),
  onOpenNote: (cb) => listen('reminder:open', cb),
});
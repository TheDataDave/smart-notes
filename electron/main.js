const { app, BrowserWindow, shell, Notification, Tray, Menu, ipcMain, dialog } = require('electron');
const { makeTrayIcon } = require('./trayIcon');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');

const PORT = 4000;
const isDev = process.argv.includes('--dev');
const ICON_PATH = path.join(__dirname, '..', 'icons', 'icon.ico');
let server;
let mainWindow;
let tray;
let quitting = false;   // true once the user really wants out
let hintShown = false;  // only explain "still running" once per session
let closePromptOpen = false; // don't stack dialogs if X is clicked repeatedly

// Windows needs an app id or it may not show notifications from an unpackaged app
app.setAppUserModelId('com.smartnotes.app');

const liveNotifications = new Set(); // keeps them from being garbage-collected before clicked

// ---------- preferences ----------

// What the window's X button does: 'ask' every time, hide to the 'tray', or 'quit'
const CLOSE_ACTIONS = ['ask', 'tray', 'quit'];
const prefsPath = () => path.join(app.getPath('userData'), 'preferences.json');

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), 'utf8')) || {};
  } catch {
    return {}; // missing or unreadable file: fall back to defaults
  }
}

function savePrefs(patch) {
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify({ ...loadPrefs(), ...patch }, null, 2));
  } catch (error) {
    console.error('[Prefs] Could not save preferences:', error);
  }
}

function getCloseAction() {
  const action = loadPrefs().closeAction;
  return CLOSE_ACTIONS.includes(action) ? action : 'ask';
}

function setCloseAction(action) {
  savePrefs({ closeAction: action });
  refreshTrayMenu();
}

// ---------- update state ----------

// idle | checking | downloading | ready | installing | uptodate | error
let updateState = { status: 'idle', currentVersion: app.getVersion() };
let manualCheck = false;
const BUSY = ['downloading', 'ready', 'installing'];

function setUpdateState(patch) {
  const before = updateState.status;
  updateState = { ...updateState, ...patch, currentVersion: app.getVersion() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state', updateState);
  }
  if (before !== updateState.status) refreshTrayMenu(); // not on every progress tick
}

// "Up to date" and error messages disappear by themselves
function settleSoon() {
  setTimeout(() => {
    if (updateState.status === 'uptodate' || updateState.status === 'error') {
      setUpdateState({ status: 'idle', manual: false });
    }
  }, 5000);
}

async function checkForUpdates(manual = false) {
  if (BUSY.includes(updateState.status)) return; // don't clobber a download or a ready update
  manualCheck = manual;

  if (!app.isPackaged) { // nothing to check in dev
    setUpdateState({ status: 'uptodate', manual });
    settleSoon();
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('[Updater] Update check failed:', error); // the 'error' event updates the UI
  }
}

function notifyUpdateReady(version) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: `Smart Notes ${version} is ready`,
    body: 'Click to open the app and restart into the new version.',
  });
  liveNotifications.add(n);
  n.on('click', showWindow);
  n.on('close', () => liveNotifications.delete(n));
  n.show();
}

function installUpdate() {
  if (updateState.status !== 'ready') return;
  showWindow(); // so the "Installing..." screen is actually visible
  setUpdateState({ status: 'installing' });

  setTimeout(() => {
    if (!app.isPackaged) { // dev simulation: just go back to normal
      setUpdateState({ status: 'idle' });
      return;
    }
    quitting = true; // let the window really close
    autoUpdater.quitAndInstall(true, true); // silent install, then relaunch
  }, 2200);
}

// Dev only: fake a download so you can see the UI without publishing a release
function simulateUpdate() {
  if (BUSY.includes(updateState.status)) return;
  let percent = 0;
  setUpdateState({ status: 'downloading', version: '9.9.9', percent: 0 });
  const timer = setInterval(() => {
    percent += 10;
    if (percent >= 100) {
      clearInterval(timer);
      setUpdateState({ status: 'ready', percent: 100 });
      notifyUpdateReady('9.9.9');
    } else {
      setUpdateState({ percent });
    }
  }, 400);
}

ipcMain.handle('updater:get-state', () => updateState);
ipcMain.handle('updater:check', () => checkForUpdates(true));
ipcMain.handle('updater:install', () => installUpdate());

// Auto-updater events - ensures that when updating/installing that we have a consistent state and don't leave a tray icon behind
autoUpdater.on('before-quit-for-update', () => {
  quitting = true;

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
});

// Only relevant for packaged apps, not during development.
function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // "Later" still installs when the app quits

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
    setUpdateState({ status: 'checking', manual: manualCheck });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    setUpdateState({ status: 'downloading', version: info.version, percent: 0 });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] Already up to date:', info.version);
    setUpdateState({ status: 'uptodate', manual: manualCheck });
    manualCheck = false;
    settleSoon();
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({ status: 'downloading', percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version);
    setUpdateState({ status: 'ready', version: info.version, percent: 100 });
    notifyUpdateReady(info.version);
  });

  autoUpdater.on('error', (error) => {
    console.error('[Updater] Error:', error);
    setUpdateState({ status: 'error', message: error.message, manual: manualCheck });
    manualCheck = false;
    settleSoon();
  });
}

// ---------- window + tray ----------

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.flashFrame(false);
}

function hideToTray(showHint) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  if (showHint && !hintShown && Notification.isSupported()) {
    hintShown = true;
    new Notification({
      title: 'Smart Notes is still running',
      body: 'Reminders will keep firing. Use the tray icon to open or quit.',
    }).show();
  }
}

async function askCloseAction() {
  if (closePromptOpen || !mainWindow || mainWindow.isDestroyed()) return;
  closePromptOpen = true;
  try {
    const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Close Smart Notes',
      message: 'Keep Smart Notes running in the background?',
      detail:
        'Smart Notes can keep running in the system tray so your reminders and notifications still go off.\n\n' +
        'If you quit completely, reminders and notifications may not work as intended until you open the app again.',
      buttons: ['Keep running in tray', 'Quit Smart Notes', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      checkboxLabel: "Remember my choice (change it later from the tray icon's menu)",
      checkboxChecked: false,
    });

    if (response === 2) return; // Cancel / Esc: leave the window open

    const action = response === 0 ? 'tray' : 'quit';
    if (checkboxChecked) setCloseAction(action);

    if (action === 'quit') quitApp();
    else hideToTray(false); // the dialog just explained it, no need for the toast
  } finally {
    closePromptOpen = false;
  }
}

function quitApp() {
  if (quitting) return;

  quitting = true;

  // Prevent future tray interaction.
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }

  app.quit();
}

function buildTrayMenu() {
  const items = [
    { label: 'Open Smart Notes', click: showWindow },
    { type: 'separator' },
  ];

  if (updateState.status === 'ready') {
    items.push({ label: `Restart to update to v${updateState.version}`, click: installUpdate });
  } else if (updateState.status === 'downloading') {
    items.push({ label: 'Downloading update...', enabled: false });
  } else {
    items.push({ label: 'Check for updates', click: () => checkForUpdates(true) });
  }
  if (!app.isPackaged) {
    items.push({ label: 'Simulate update (dev)', click: simulateUpdate });
  }
  items.push({ type: 'separator' });

  // "Start at login" only makes sense for the packaged app, not `npm run dev`
  const closeAction = getCloseAction();
  items.push({
    label: 'When I close the window',
    submenu: [
      { label: 'Ask me', type: 'radio', checked: closeAction === 'ask', click: () => setCloseAction('ask') },
      { label: 'Keep running in the tray', type: 'radio', checked: closeAction === 'tray', click: () => setCloseAction('tray') },
      { label: 'Quit Smart Notes', type: 'radio', checked: closeAction === 'quit', click: () => setCloseAction('quit') },
    ],
  });

  if (app.isPackaged) {
    items.push({
      label: 'Start when I log in',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    });
  }
  items.push({ label: 'Quit', click: quitApp });

  return Menu.buildFromTemplate(items);
}

function refreshTrayMenu() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Smart Notes');
  refreshTrayMenu();
  tray.on('click', showWindow);
}

// Notes store @[Title](12) and [ ] markers; show them as plain text
const plain = (s) =>
  (s || '')
    .replace(/@\[([^\]]*)\]\(\d+\)/g, '@$1')
    .replace(/\[[ xX]\]\s?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function handleReminder(r) {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;

  if (Notification.isSupported()) {
    const n = new Notification({
      title: r.title || 'Reminder',
      body: r.label || plain(r.body).slice(0, 120) || 'Your reminder is due.',
    });
    liveNotifications.add(n);
    n.on('click', () => {
      showWindow();
      win?.webContents.send('reminder:open', r.note_id);
    });
    n.on('close', () => liveNotifications.delete(n));
    n.show();
  }

  win?.webContents.send('reminder:fired', r);
  if (win && !win.isFocused()) win.flashFrame(true); // flash the taskbar button
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: `Smart Notes ${app.getVersion()}`,
    // Packaged builds get their icon from the .exe; this covers `npm run dev`
    ...(fs.existsSync(ICON_PATH) && { icon: ICON_PATH }),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep our title instead of letting the web page's <title> replace it
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // The X button either hides to the tray or quits, depending on the user's choice
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();

    const action = getCloseAction();
    if (action === 'quit') return quitApp();
    if (action === 'tray') return hideToTray(true);
    askCloseAction();
  });

  // Open external links in the real browser, not inside our app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(
    isDev ? 'http://localhost:5173' : `http://localhost:${PORT}`
  );
}

// Only allow one copy of the app (two copies would fight over the database)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    // No File/Edit/View bar in the finished app. Dev keeps it for reload + DevTools.
    if (app.isPackaged) Menu.setApplicationMenu(null);

    const { startServer } = await import('../server/index.js');
    server = await startServer({
      port: PORT,
      dbPath: path.join(app.getPath('userData'), 'notes.db'),
      staticDir: isDev ? null : path.join(__dirname, '..', 'client', 'dist'),
      onReminder: handleReminder,
    });

    await createWindow();
    createTray();

    if (app.isPackaged) {
      configureAutoUpdater();
      checkForUpdates(false);
      setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000); // the app lives in the tray for days
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;

    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }

    if (server) {
      server.closeAllConnections?.(); // an open keep-alive connection can stall shutdown, and the installer needs the app fully gone
      server.close();
      server = null;
    }
  });
}
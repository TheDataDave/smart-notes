const { app, BrowserWindow, shell, Notification, Tray, Menu, ipcMain } = require('electron');
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

// Windows needs an app id or it may not show notifications from an unpackaged app
app.setAppUserModelId('com.smartnotes.app');

const liveNotifications = new Set(); // keeps them from being garbage-collected before clicked

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

function handleReminder(r) {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;

  if (Notification.isSupported()) {
    const n = new Notification({
      title: r.title || 'Reminder',
      body: r.body ? r.body.slice(0, 120) : 'Your reminder is due.',
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

  // The X button hides the window; the app keeps running in the tray
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!hintShown && Notification.isSupported()) {
      hintShown = true;
      new Notification({
        title: 'Smart Notes is still running',
        body: 'Reminders will keep firing. Use the tray icon to open or quit.',
      }).show();
    }
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
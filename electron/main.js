const { app, BrowserWindow, shell, Notification, Tray, Menu } = require('electron');
const { makeTrayIcon } = require('./trayIcon');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

const PORT = 4000;
const isDev = process.argv.includes('--dev');
let server;
let mainWindow;
let tray;
let quitting = false;   // true once the user really wants out
let hintShown = false;  // only explain "still running" once per session

// Windows needs an app id or it may not show notifications from an unpackaged app
app.setAppUserModelId('com.smartnotes.app');

const liveNotifications = new Set(); // keeps them from being garbage-collected before clicked

// Auto-updater events - ensures that when updating/installing that we have a consistent state and don't leave a tray icon behind
autoUpdater.on('before-quit-for-update', () => {
  quitting = true;

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
});

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

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('Smart Notes');

  const items = [
    { label: 'Open Smart Notes', click: showWindow },
    { type: 'separator' },
  ];
  // "Start at login" only makes sense for the packaged app, not `npm run dev`
  if (app.isPackaged) {
    items.push({
      label: 'Start when I log in',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    });
  }
  items.push({
  label: 'Quit',
  click: quitApp,
});

  tray.setContextMenu(Menu.buildFromTemplate(items));
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
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
    const { startServer } = await import('../server/index.js');
    server = await startServer({
      port: PORT,
      dbPath: path.join(app.getPath('userData'), 'notes.db'),
      staticDir: isDev ? null : path.join(__dirname, '..', 'client', 'dist'),
      onReminder: handleReminder,
    });

    await createWindow();
    createTray();

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
      server.close();
      server = null;
    }
  });
}
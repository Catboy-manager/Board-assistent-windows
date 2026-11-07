'use strict';

const { app, BrowserWindow, Tray, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { fork, execFile } = require('child_process');

const PORT = Number(process.env.KANBAN_PORT || 8123);
const IS_MAC = process.platform === 'darwin';

let mainWindow = null;
let tray = null;
let serverChild = null;
let isQuitting = false;
let serverReady = false;

/* ---------- история браузеров с этого устройства ---------- */
function historyScript() {
  const candidates = [
    path.join(__dirname, 'app', 'app', 'history-collect.py'),
    path.join(__dirname, 'app', 'history-collect.py')
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

function collectHistory() {
  return new Promise((resolve) => {
    const script = historyScript();
    if (!fs.existsSync(script)) return resolve({ ok: false, error: 'history-collect.py not found', rows: [], sources: [] });
    const cmd = process.platform === 'win32' ? 'python' : 'python3';
    const args = [script];
    execFile(cmd, args, { timeout: 60000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err && !stdout) return resolve({ ok: false, error: String(err.message || err), rows: [], sources: [] });
      try {
        const data = JSON.parse(String(stdout || '{}'));
        resolve(data);
      } catch (e) {
        resolve({ ok: false, error: 'bad history output: ' + String(e.message || e), rows: [], sources: [] });
      }
    });
  });
}

ipcMain.handle('kanban:collect-history', () => collectHistory());

/* ---------- единственный экземпляр ---------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/* ---------- встроенный сервер (app/server.js в дочернем процессе) ---------- */
function startServer() {
  return new Promise((resolve, reject) => {
    if (serverChild) return resolve();
    stopServer();
    const nestedServer = path.join(__dirname, 'app', 'app', 'server.js');
    const serverPath = fs.existsSync(nestedServer) ? nestedServer : path.join(__dirname, 'app', 'server.js');
    serverChild = fork(serverPath, [], {
      env: Object.assign({}, process.env, {
        KANBAN_PORT: String(PORT),
        KANBAN_DESKTOP: '1',
        KANBAN_DATA_DIR: process.env.KANBAN_DATA_DIR || '',
        KANBAN_UPLOAD_DIR: process.env.KANBAN_UPLOAD_DIR || '',
        KANBAN_CONFIG_FILE: process.env.KANBAN_CONFIG_FILE || ''
      })
    });
    serverChild.on('exit', () => { serverChild = null; serverReady = false; });
    serverReady = false;
    let tries = 0;
    const probe = () => {
      const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/ping', timeout: 1000 }, (r) => {
        r.resume();
        serverReady = true;
        resolve();
      });
      req.on('error', () => {
        if (tries++ > 150) { reject(new Error('Сервер не запустился на порту ' + PORT)); }
        else setTimeout(probe, 150);
      });
      req.on('timeout', () => { req.destroy(); });
    };
    probe();
  });
}

function restartServer() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Перезапуск сервера',
    message: 'Перезапуск встроенного сервера…',
    buttons: ['OK']
  }).then(() => startServer().catch(err => dialog.showErrorBox('Kanban Board', String(err && err.message || err))));
}

function stopServer() {
  if (serverChild) {
    try { serverChild.kill('SIGTERM'); } catch (e) {}
    try { serverChild.kill('SIGKILL'); } catch (e) {}
    serverChild = null;
  }
}

/* ---------- окно ---------- */
function createWindow() {
  const iconPath = iconForPlatform();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e2a3a',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });
  mainWindow.loadURL('http://127.0.0.1:' + PORT + '/');
  mainWindow.once('ready-to-show', () => { mainWindow.show(); });
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ---------- трей ---------- */
function createTray() {
  const iconPath = iconForPlatform();
  tray = new Tray(iconPath);
  tray.setToolTip('Kanban Board');
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть', click: () => showWindow() },
    { label: 'Открыть в браузере', click: () => shell.openExternal('http://127.0.0.1:' + PORT + '/') },
    { label: 'Показать порт/файлы', click: () => shell.showItemInFolder(dataDir()) },
    { type: 'separator' },
    { label: 'Автозапуск при входе', type: 'checkbox', checked: autoStartEnabled(), click: (item) => setAutoStart(item.checked) },
    { type: 'separator' },
    { label: 'Перезапустить сервер', click: restartServer },
    { label: 'Выход', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
}

function showWindow() {
  if (!mainWindow) createWindow();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function dataDir() {
  return process.env.KANBAN_DATA_DIR || path.join(os.homedir(), '.kanban-desktop');
}

/* ---------- иконки ---------- */
function iconForPlatform() {
  const icon = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  return fs.existsSync(icon) ? icon : undefined;
}

/* ---------- автозапуск ---------- */
function autoStartEnabled() {
  if (process.platform === 'win32') return app.getLoginItemSettings().openAtLogin;
  return fs.existsSync(path.join(os.homedir(), '.config', 'autostart', 'kanban-desktop.desktop'));
}

function setAutoStart(on) {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: on });
    return;
  }
  const dir = path.join(os.homedir(), '.config', 'autostart');
  const file = path.join(dir, 'kanban-desktop.desktop');
  if (!on) { try { fs.unlinkSync(file); } catch (e) {} return; }
  fs.mkdirSync(dir, { recursive: true });
  const exec = process.argv && process.argv[1] && process.argv[1] !== '.' ? process.argv[1] : process.execPath;
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Kanban Board',
    'Comment=Канбан-доска + ИИ-ассистент',
    'Exec=' + JSON.stringify(exec),
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true'
  ].join('\n') + '\n';
  fs.writeFileSync(file, content);
}

/* ---------- жизнь приложения ---------- */
app.on('window-all-closed', () => {
  /* работаем в трее */
});

app.on('before-quit', () => { isQuitting = true; stopServer(); });

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('ru.kanban.desktop');
  app.setName('Kanban Board');
  startServer()
    .then(() => {
      createWindow();
      createTray();
    })
    .catch((err) => {
      dialog.showErrorBox('Kanban Board', String(err && err.message || err));
      app.quit();
    });
  app.on('activate', () => showWindow());
});

/* горячая клавиша: показать приложение (глобально: Ctrl+Shift+K) */
try {
  const { globalShortcut } = require('electron');
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
} catch (e) {}
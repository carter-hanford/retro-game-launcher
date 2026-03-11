const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

if (!app.isPackaged) {
  require('electron-reload')(__dirname);
}

let mainWindow;

// Resolve path to artwork folder (works both in dev and packaged)
function getArtworkPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'artwork');
  }
  return path.join(__dirname, '..', 'artwork');
}

// Resolve path to games.json
function getGamesConfigPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'games.json');
  }
  return path.join(__dirname, '..', 'games.json');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false  // Allows loading local file:// images
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  function sendMaximizedState() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized-changed', mainWindow.isMaximized());
    }
  }
  mainWindow.on('maximize', sendMaximizedState);
  mainWindow.on('unmaximize', sendMaximizedState);
  mainWindow.webContents.on('did-finish-load', sendMaximizedState);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ───────────────────────────────────────────────────────────

// Load games config
ipcMain.handle('get-games', () => {
  const configPath = getGamesConfigPath();
  if (!fs.existsSync(configPath)) return [];
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
});

// Save games config
ipcMain.handle('save-games', (event, games) => {
  const configPath = getGamesConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(games, null, 2), 'utf-8');
  return true;
});

// Resolve artwork image to a file:// URL
ipcMain.handle('get-artwork-url', (event, console_id, filename) => {
  if (!filename) return null;
  const artPath = path.join(getArtworkPath(), console_id, filename);
  if (fs.existsSync(artPath)) {
    return 'file://' + artPath.replace(/\\/g, '/');
  }
  return null;
});

// Browse for a file (emulator exe or game file)
ipcMain.handle('browse-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Browse for artwork image
ipcMain.handle('browse-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Copy image to artwork folder and return new filename
ipcMain.handle('copy-artwork', async (event, srcPath, console_id, gameName) => {
  const artDir = path.join(getArtworkPath(), console_id);
  if (!fs.existsSync(artDir)) fs.mkdirSync(artDir, { recursive: true });
  const ext = path.extname(srcPath);
  const safeName = gameName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ext;
  const destPath = path.join(artDir, safeName);
  fs.copyFileSync(srcPath, destPath);
  return safeName;
});

// Merge play time into games.json for a gameId (seconds to add)
function addPlayTimeSeconds(gameId, seconds) {
  if (!gameId || seconds <= 0) return;
  const configPath = getGamesConfigPath();
  if (!fs.existsSync(configPath)) return;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data.games && Array.isArray(data.games)) {
      const game = data.games.find(g => g.id === gameId);
      if (!game) return;
      game.playTimeSeconds = (game.playTimeSeconds || 0) + Math.round(seconds);
      game.lastPlayedAt = Date.now();
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
    } else if (Array.isArray(data)) {
      const game = data.find(g => g.id === gameId);
      if (!game) return;
      game.playTimeSeconds = (game.playTimeSeconds || 0) + Math.round(seconds);
      game.lastPlayedAt = Date.now();
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('playtime-updated', { gameId, playTimeSeconds: game.playTimeSeconds });
    }
  } catch (e) { /* ignore */ }
}

// Launch a game
// - Direct launch (indie/PC): emulatorPath = null, gamePath = the .exe
// - Emulated: emulatorPath = emulator exe, gamePath = rom/iso
// - gameId optional: on spawned process exit (while launcher stays open), session duration is merged into games.json
ipcMain.handle('launch-game', async (event, emulatorPath, gamePath, args, gameId) => {
  const isDirect = !gamePath; // when gamePath is null, emulatorPath IS the game exe

  const execPath = isDirect ? emulatorPath : emulatorPath;
  const fileArg  = isDirect ? null : gamePath;

  if (!execPath || !fs.existsSync(execPath)) {
    return { success: false, error: 'File not found: ' + execPath };
  }
  if (fileArg && !fs.existsSync(fileArg)) {
    return { success: false, error: 'Game file not found: ' + fileArg };
  }

  const launchArgs = args ? args.split(' ').filter(Boolean) : [];
  if (fileArg) launchArgs.push(fileArg);

  try {
    const child = spawn(execPath, launchArgs, { detached: true, stdio: 'ignore' });
    // While launcher stays open, record session length when the spawned process exits
    if (gameId) {
      const startMs = Date.now();
      child.on('exit', () => {
        const elapsed = (Date.now() - startMs) / 1000;
        if (elapsed >= 5) addPlayTimeSeconds(gameId, elapsed);
      });
    }
    child.unref();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());
ipcMain.handle('window-is-maximized', () => mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());

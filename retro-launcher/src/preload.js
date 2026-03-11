const { contextBridge, ipcRenderer } = require('electron');

function onPlaytimeUpdated(callback) {
  const fn = (_e, payload) => callback(payload);
  ipcRenderer.on('playtime-updated', fn);
  return () => ipcRenderer.removeListener('playtime-updated', fn);
}

contextBridge.exposeInMainWorld('api', {
  onPlaytimeUpdated,
  getGames: () => ipcRenderer.invoke('get-games'),
  saveGames: (games) => ipcRenderer.invoke('save-games', games),
  getArtworkUrl: (consoleId, filename) => ipcRenderer.invoke('get-artwork-url', consoleId, filename),
  browseFile: (filters) => ipcRenderer.invoke('browse-file', filters),
  browseImage: () => ipcRenderer.invoke('browse-image'),
  copyArtwork: (srcPath, consoleId, gameName) => ipcRenderer.invoke('copy-artwork', srcPath, consoleId, gameName),
  launchGame: (emulatorPath, gamePath, args, gameId) => ipcRenderer.invoke('launch-game', emulatorPath, gamePath, args, gameId),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChanged: (callback) => {
    const fn = (_e, maximized) => callback(maximized);
    ipcRenderer.on('window-maximized-changed', fn);
    return () => ipcRenderer.removeListener('window-maximized-changed', fn);
  },
  windowClose: () => ipcRenderer.send('window-close'),
});

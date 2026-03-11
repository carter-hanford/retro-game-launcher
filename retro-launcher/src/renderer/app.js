// ═══════════════════════════════════════════════════
//  RETRO LAUNCHER — RENDERER PROCESS
// ═══════════════════════════════════════════════════

// ── State ─────────────────────────────────────────
let games     = [];   // { id, title, console, path, args, artwork }
let emulators = {};   // { platformId: 'C:/path/to/emu.exe', ... }
let platforms = [];   // { id, label, color, isIndirect }

let activeFilter = 'all';
/** When set, main content shows this filter until mouse leaves sidebar (hover preview). */
let previewFilter = null;
let previewFilterRaf = null;
let searchQuery  = '';
let viewMode     = 'grid';
let gamesPerLine = 4;
/** Synced from main when window maximize toggles (unused for cols now; basic always 6). */
let windowMaximized = false;
const BASIC_USER_GRID_COLS = 6;

/** Admin: slider value. Basic user: always 6 per line (no slider). */
function effectiveGridCols() {
  if (isBasicUser()) return BASIC_USER_GRID_COLS;
  return gamesPerLine;
}
let editingId    = null;
let pendingArtSrc = null;
let ctxTargetId  = null;

// Parental: game IDs hidden from basic user; persisted in games.json
let parentalBlockedIds = [];
/** PIN required to switch from basic back to admin. Change in Parental controls. Default '1111'. */
let parentalAdminPin = '1111';
const DEFAULT_PARENTAL_PIN = '1111';
const USER_MODE_KEY = 'retro-launcher-user-mode';
/** Last nav section: 'home' | 'all' | platformId — restored on launch with user mode */
const LAST_FILTER_KEY = 'retro-launcher-last-filter';
const GAME_SORT_KEY = 'retro-launcher-game-sort';
/** 'title' = A–Z, 'playtime' = most played first */
let gameSortBy = 'title';

/**
 * If true: every launch opens Home (admin/basic still restored — basic cannot bypass by restart).
 * If false: restore last section when valid; first launch or invalid session still defaults to Home.
 */
const OPEN_HOME_EVERY_LAUNCH = false;

function persistSession() {
  try {
    localStorage.setItem(LAST_FILTER_KEY, activeFilter);
  } catch (e) { /* ignore */ }
}

function getSavedFilter() {
  try {
    return localStorage.getItem(LAST_FILTER_KEY) || '';
  } catch (e) {
    return '';
  }
}

/** Apply saved session: user mode already in localStorage; filter defaults to home, else last section if valid */
function restoreSession() {
  if (OPEN_HOME_EVERY_LAUNCH) {
    activeFilter = 'home';
    persistSession();
    return;
  }
  const savedFilter = getSavedFilter();
  if (savedFilter === 'home' || savedFilter === 'all') {
    activeFilter = savedFilter;
  } else if (savedFilter && platforms.some(p => p.id === savedFilter)) {
    activeFilter = savedFilter;
  } else {
    // No session or invalid platform — default land on Home (both admin and basic)
    activeFilter = 'home';
    persistSession();
  }
}

function isBasicUser() {
  try { return localStorage.getItem(USER_MODE_KEY) === 'basic'; } catch (e) { return false; }
}
function isVisibleToBasic(game) {
  return !parentalBlockedIds.includes(game.id);
}

// ── Boot ─────────────────────────────────────────
(async () => {
  const saved = await window.api.getGames();
  if (saved && Array.isArray(saved.games)) {
    games     = saved.games     || [];
    emulators = saved.emulators || {};
    platforms = saved.platforms || defaultPlatforms();
    parentalBlockedIds = Array.isArray(saved.parentalBlockedIds) ? [...saved.parentalBlockedIds] : [];
    if (typeof saved.parentalAdminPin === 'string' && saved.parentalAdminPin.length > 0) {
      parentalAdminPin = saved.parentalAdminPin;
    } else {
      parentalAdminPin = DEFAULT_PARENTAL_PIN;
    }
  } else if (Array.isArray(saved)) {
    games = saved;
    platforms = defaultPlatforms();
  } else {
    platforms = defaultPlatforms();
  }

  if (typeof window.api.onPlaytimeUpdated === 'function') {
    window.api.onPlaytimeUpdated(({ gameId, playTimeSeconds }) => {
      const g = games.find(x => x.id === gameId);
      if (g) {
        g.playTimeSeconds = playTimeSeconds;
        if (activeFilter === 'home') renderHome();
      }
    });
  }

  try {
    const s = localStorage.getItem(GAME_SORT_KEY);
    if (s === 'title' || s === 'playtime') gameSortBy = s;
  } catch (e) { /* ignore */ }

  initThemes();
  restoreSession();
  updateUserModeUI();
  renderSidebar();
  renderGames();
  if (isBasicUser()) startGamepadLoop();
})();

// ── Themes (local only; persists via localStorage) ─
const THEME_STORAGE_KEY = 'retro-launcher-theme';

function applyTheme(themeId) {
  const html = document.documentElement;
  if (themeId) html.setAttribute('data-theme', themeId);
  else html.setAttribute('data-theme', '');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId || '');
  } catch (e) { /* ignore */ }
  document.querySelectorAll('.theme-card').forEach(btn => {
    const active = btn.getAttribute('data-theme') === (themeId || '');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function initThemes() {
  let saved = '';
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY) || '';
  } catch (e) { /* ignore */ }
  applyTheme(saved);
}

function openThemesModal() {
  initThemes();
  document.getElementById('modal-themes').style.display = 'flex';
}
function closeThemesModal() {
  document.getElementById('modal-themes').style.display = 'none';
}

document.getElementById('btn-themes').addEventListener('click', openThemesModal);
document.getElementById('modal-themes-close').addEventListener('click', closeThemesModal);
document.getElementById('btn-themes-done').addEventListener('click', closeThemesModal);
document.getElementById('modal-themes').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeThemesModal();
});

document.querySelectorAll('.theme-card').forEach(btn => {
  btn.addEventListener('click', () => {
    applyTheme(btn.getAttribute('data-theme') || '');
  });
});

function defaultPlatforms() {
  return [
    { id: 'PS1',     label: 'PlayStation 1', color: '#0070cc', isIndirect: false },
    { id: 'PS2',     label: 'PlayStation 2', color: '#003087', isIndirect: false },
    { id: 'PS3',     label: 'PlayStation 3', color: '#00439c', isIndirect: false },
    { id: 'XBOX',    label: 'Xbox',           color: '#107c10', isIndirect: false },
    { id: 'XBOX360', label: 'Xbox 360',       color: '#52b043', isIndirect: false },
    { id: 'INDIE',   label: 'Indie Games',    color: '#e05cff', isIndirect: true  },
  ];
}

// ── Helpers ───────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getPlatform(id) {
  return platforms.find(p => p.id === id) || { id, label: id, color: '#888', isIndirect: false };
}

async function persist() {
  const ids = new Set(games.map(g => g.id));
  parentalBlockedIds = parentalBlockedIds.filter(id => ids.has(id));
  await window.api.saveGames({
    games,
    emulators,
    platforms,
    parentalBlockedIds,
    parentalAdminPin
  });
}

function effectiveListFilter() {
  return previewFilter != null ? previewFilter : activeFilter;
}

function filteredGames() {
  const f = effectiveListFilter();
  if (f === 'home') return [];
  return games.filter(g => {
    if (isBasicUser() && !isVisibleToBasic(g)) return false;
    const matchFilter = f === 'all' || g.console === f;
    const matchSearch = !searchQuery || g.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });
}

/** Returns a sorted copy of the game list for display (title A–Z or most played first). */
function sortGameList(list) {
  const arr = [...list];
  if (gameSortBy === 'playtime') {
    arr.sort((a, b) => (b.playTimeSeconds || 0) - (a.playTimeSeconds || 0));
  } else {
    arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
  }
  return arr;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Sidebar ───────────────────────────────────────
function renderSidebar() {
  const container = document.getElementById('sidebar-platforms');
  container.innerHTML = '';

  platforms.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (activeFilter === p.id ? ' active' : '');
    btn.dataset.filter = p.id;
    btn.innerHTML = `
      <span class="nav-icon">
        <span style="width:10px;height:10px;border-radius:50%;background:${p.color};display:inline-block"></span>
      </span>
      <span>${esc(p.label)}</span>`;
    btn.addEventListener('click', () => setFilter(p.id, btn));
    container.appendChild(btn);
  });

  // Keep "All Games" / "Home" active state in sync
  document.querySelector('[data-filter="all"]').classList.toggle('active', activeFilter === 'all');
  const navHome = document.getElementById('nav-home');
  if (navHome) navHome.classList.toggle('active', activeFilter === 'home');
  scheduleGamepadRefresh();
}

function setFilter(filter, clickedBtn) {
  previewFilter = null;
  activeFilter = filter;
  persistSession();
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (clickedBtn) clickedBtn.classList.add('active');
  renderSidebar();
  renderGames();
}

document.querySelector('[data-filter="all"]').addEventListener('click', function() {
  setFilter('all', this);
});

document.getElementById('nav-home').addEventListener('click', function() {
  setFilter('home', this);
});

// Hover preview (non-mouse only): main content follows hovered nav tab without click.
// Mouse users: no preview — content changes only when clicking a tab (setFilter).
function schedulePreviewFilter(filter) {
  if (previewFilterRaf) cancelAnimationFrame(previewFilterRaf);
  previewFilterRaf = requestAnimationFrame(() => {
    previewFilterRaf = null;
    if (previewFilter === filter) return;
    previewFilter = filter;
    renderGames();
  });
}
function clearPreviewFilter() {
  if (previewFilterRaf) cancelAnimationFrame(previewFilterRaf);
  previewFilterRaf = null;
  if (previewFilter == null) return;
  previewFilter = null;
  renderGames();
}
document.querySelector('.sidebar-nav').addEventListener('pointerover', e => {
  if (e.pointerType === 'mouse') return;
  const btn = e.target && e.target.closest && e.target.closest('.nav-item[data-filter]');
  if (!btn || btn.id === 'btn-parental-controls') return;
  schedulePreviewFilter(btn.dataset.filter);
});
document.querySelector('.sidebar-nav').addEventListener('pointerout', e => {
  if (e.pointerType === 'mouse') return;
  if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) clearPreviewFilter();
});
document.getElementById('sidebar').addEventListener('mouseleave', () => {
  clearPreviewFilter();
});
// Entering sidebar with mouse: drop any stale preview so view matches last click only
document.getElementById('sidebar').addEventListener('mouseenter', () => clearPreviewFilter());

// ── User mode (admin / basic) ─────────────────────
function updateUserModeUI() {
  const basic = isBasicUser();
  document.body.classList.toggle('basic-user', basic);
  const label = document.getElementById('user-mode-label');
  if (label) label.textContent = basic ? 'Basic user' : 'Admin mode';
  if (basic) {
    viewMode = 'grid';
    try { document.getElementById('view-grid').classList.add('active'); document.getElementById('view-list').classList.remove('active'); } catch (e) { /* ignore */ }
    startGamepadLoop();
  } else {
    stopGamepadLoop();
    clearGamepadFocus();
  }
}

document.getElementById('btn-user-mode').addEventListener('click', () => {
  if (isBasicUser()) {
    openAdminPasswordModal();
    return;
  }
  try {
    localStorage.setItem(USER_MODE_KEY, 'basic');
  } catch (e) { /* ignore */ }
  persistSession();
  updateUserModeUI();
  renderSidebar();
  renderGames();
});

function openAdminPasswordModal() {
  const input = document.getElementById('admin-password-input');
  const err = document.getElementById('admin-password-error');
  if (input) {
    input.value = '';
    input.focus();
  }
  if (err) err.style.display = 'none';
  document.getElementById('modal-admin-password').style.display = 'flex';
}
let adminPasswordUnlockTimeout = null;
function closeAdminPasswordModal() {
  if (adminPasswordUnlockTimeout) {
    clearTimeout(adminPasswordUnlockTimeout);
    adminPasswordUnlockTimeout = null;
  }
  const overlay = document.getElementById('modal-admin-password');
  overlay.classList.remove('admin-password-success');
  overlay.style.display = 'none';
}
document.getElementById('modal-admin-password-close').addEventListener('click', closeAdminPasswordModal);
document.getElementById('btn-admin-password-cancel').addEventListener('click', closeAdminPasswordModal);
document.getElementById('modal-admin-password').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAdminPasswordModal();
});
function tryAdminPasswordUnlock(showErrorOnFail) {
  const input = document.getElementById('admin-password-input');
  const err = document.getElementById('admin-password-error');
  const val = (input && input.value) || '';
  if (val === parentalAdminPin) {
    if (adminPasswordUnlockTimeout) return true;
    const overlay = document.getElementById('modal-admin-password');
    overlay.classList.add('admin-password-success');
    const inputEl = document.getElementById('admin-password-input');
    if (inputEl) inputEl.blur();
    // Brief neon perimeter flash, then close and apply admin
    adminPasswordUnlockTimeout = setTimeout(() => {
      adminPasswordUnlockTimeout = null;
      if (document.getElementById('modal-admin-password').style.display === 'none') return;
      try { localStorage.setItem(USER_MODE_KEY, 'admin'); } catch (e) { /* ignore */ }
      persistSession();
      closeAdminPasswordModal();
      updateUserModeUI();
      renderSidebar();
      renderGames();
      if (activeFilter === 'home') renderHome();
    }, 700);
    return true;
  }
  if (showErrorOnFail && err) {
    err.textContent = 'Wrong password. Try again.';
    err.style.display = 'block';
    if (input) input.select();
  }
  return false;
}

document.getElementById('btn-admin-password-submit').addEventListener('click', () => {
  tryAdminPasswordUnlock(true);
});
document.getElementById('admin-password-input').addEventListener('input', () => {
  const err = document.getElementById('admin-password-error');
  if (err) err.style.display = 'none';
  tryAdminPasswordUnlock(false);
});
document.getElementById('admin-password-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryAdminPasswordUnlock(true);
});

// ── Parental controls (admin) ────────────────────
function openParentalModal() {
  if (isBasicUser()) return;
  const pinInput = document.getElementById('parental-pin-field');
  if (pinInput) pinInput.value = parentalAdminPin;
  renderParentalLists();
  document.getElementById('modal-parental').style.display = 'flex';
}

async function saveParentalPinFromModal() {
  const pinInput = document.getElementById('parental-pin-field');
  if (!pinInput) return;
  const next = (pinInput.value || '').trim();
  if (next.length === 0) {
    alert('PIN cannot be empty.');
    return;
  }
  parentalAdminPin = next;
  await persist();
  pinInput.value = parentalAdminPin;
  const hint = document.getElementById('parental-pin-saved');
  if (hint) {
    hint.style.display = 'inline';
    setTimeout(() => { if (hint) hint.style.display = 'none'; }, 2000);
  }
}
function closeParentalModal() {
  document.getElementById('modal-parental').style.display = 'none';
}

async function applyParentalBulk(ids, makeHidden) {
  const set = new Set(parentalBlockedIds);
  for (const id of ids) {
    if (!games.some(g => g.id === id)) continue;
    if (makeHidden) set.add(id);
    else set.delete(id);
  }
  parentalBlockedIds = [...set];
  await persist();
  renderParentalLists();
  renderGames();
  if (activeFilter === 'home') renderHome();
}

function getCheckedIdsIn(listEl) {
  return [...listEl.querySelectorAll('.parental-row-check:checked')].map(cb => cb.closest('.parental-game-row').dataset.gameId);
}

function renderParentalLists() {
  const listVisible = document.getElementById('parental-list-visible');
  const listHidden = document.getElementById('parental-list-hidden');
  listVisible.innerHTML = '';
  listHidden.innerHTML = '';

  const visibleGames = games.filter(g => !parentalBlockedIds.includes(g.id));
  const hiddenGames = games.filter(g => parentalBlockedIds.includes(g.id));

  function appendRow(container, game, zone) {
    const plat = getPlatform(game.console);
    const row = document.createElement('div');
    row.className = 'parental-game-row';
    row.draggable = true;
    row.dataset.gameId = game.id;
    row.dataset.zone = zone;
    row.innerHTML = `
      <input type="checkbox" class="parental-row-check" data-game-id="${esc(game.id)}" title="Select for bulk move" />
      <span class="parental-row-title">${esc(game.title)}</span>
      <span class="parental-row-console">${esc(plat.label)}</span>`;
    const check = row.querySelector('.parental-row-check');
    check.addEventListener('click', e => e.stopPropagation());
    check.addEventListener('mousedown', e => e.stopPropagation());
    row.addEventListener('dragstart', e => {
      if (e.target.closest('.parental-row-check')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/game-id', game.id);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    container.appendChild(row);
  }

  visibleGames.forEach(g => appendRow(listVisible, g, 'visible'));
  hiddenGames.forEach(g => appendRow(listHidden, g, 'hidden'));

  setupParentalDropZones();
}

function setupParentalDropZones() {
  const zoneVisible = document.getElementById('parental-zone-visible');
  const zoneHidden = document.getElementById('parental-zone-hidden');
  if (zoneVisible.dataset.dropBound === '1') return;
  zoneVisible.dataset.dropBound = '1';
  zoneHidden.dataset.dropBound = '1';

  function bindZone(zoneEl, makeHidden) {
    zoneEl.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zoneEl.classList.add('parental-drag-over');
    });
    zoneEl.addEventListener('dragleave', e => {
      if (!zoneEl.contains(e.relatedTarget)) zoneEl.classList.remove('parental-drag-over');
    });
    zoneEl.addEventListener('drop', async e => {
      e.preventDefault();
      zoneEl.classList.remove('parental-drag-over');
      const gameId = e.dataTransfer.getData('text/game-id');
      if (!gameId) return;
      const idx = parentalBlockedIds.indexOf(gameId);
      if (makeHidden) {
        if (idx < 0) parentalBlockedIds.push(gameId);
      } else {
        if (idx >= 0) parentalBlockedIds.splice(idx, 1);
      }
      await persist();
      renderParentalLists();
      renderGames();
      if (activeFilter === 'home') renderHome();
    });
  }

  bindZone(zoneVisible, false);
  bindZone(zoneHidden, true);
}

// Parental toolbar: select all / clear / bulk move (wired once)
(function initParentalToolbar() {
  const listVisible = () => document.getElementById('parental-list-visible');
  const listHidden = () => document.getElementById('parental-list-hidden');

  document.getElementById('parental-select-all-visible').addEventListener('click', () => {
    listVisible().querySelectorAll('.parental-row-check').forEach(cb => { cb.checked = true; });
  });
  document.getElementById('parental-clear-visible').addEventListener('click', () => {
    listVisible().querySelectorAll('.parental-row-check').forEach(cb => { cb.checked = false; });
  });
  document.getElementById('parental-move-selected-hidden').addEventListener('click', async () => {
    const ids = getCheckedIdsIn(listVisible());
    if (ids.length === 0) return;
    await applyParentalBulk(ids, true);
  });
  document.getElementById('parental-move-all-hidden').addEventListener('click', async () => {
    const ids = games.filter(g => !parentalBlockedIds.includes(g.id)).map(g => g.id);
    if (ids.length === 0) return;
    await applyParentalBulk(ids, true);
  });

  document.getElementById('parental-select-all-hidden').addEventListener('click', () => {
    listHidden().querySelectorAll('.parental-row-check').forEach(cb => { cb.checked = true; });
  });
  document.getElementById('parental-clear-hidden').addEventListener('click', () => {
    listHidden().querySelectorAll('.parental-row-check').forEach(cb => { cb.checked = false; });
  });
  document.getElementById('parental-move-selected-visible').addEventListener('click', async () => {
    const ids = getCheckedIdsIn(listHidden());
    if (ids.length === 0) return;
    await applyParentalBulk(ids, false);
  });
  document.getElementById('parental-move-all-visible').addEventListener('click', async () => {
    parentalBlockedIds = [];
    await persist();
    renderParentalLists();
    renderGames();
    if (activeFilter === 'home') renderHome();
  });
})();

document.getElementById('btn-parental-controls').addEventListener('click', openParentalModal);
document.getElementById('btn-parental-save-pin').addEventListener('click', () => saveParentalPinFromModal());
document.getElementById('modal-parental-close').addEventListener('click', closeParentalModal);
document.getElementById('btn-parental-done').addEventListener('click', closeParentalModal);
document.getElementById('modal-parental').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeParentalModal();
});

// ── Render Games / Home ───────────────────────────
function setMainViewMode(isHome) {
  const topbar = document.querySelector('.topbar');
  const gamesContainer = document.getElementById('games-container');
  const homePanel = document.getElementById('home-panel');
  if (isHome) {
    topbar.classList.add('topbar-home');
    gamesContainer.style.display = 'none';
    homePanel.style.display = 'block';
  } else {
    topbar.classList.remove('topbar-home');
    homePanel.style.display = 'none';
    gamesContainer.style.display = '';
  }
}

async function renderGames() {
  const viewFilter = effectiveListFilter();
  if (viewFilter === 'home') {
    setMainViewMode(true);
    await renderHome();
    return;
  }
  setMainViewMode(false);

  const container = document.getElementById('games-container');
  const list = sortGameList(filteredGames());

  container.className = `games-container ${viewMode}-mode`;
  container.style.setProperty('--grid-cols', String(effectiveGridCols()));
  document.getElementById('game-count').textContent =
    `${list.length} game${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    container.innerHTML = '';
    container.appendChild(buildEmptyState());
    return;
  }

  const cardEls = await Promise.all(list.map(g => buildGameEl(g)));
  container.innerHTML = '';
  cardEls.forEach(el => container.appendChild(el));
  scheduleGamepadRefresh();
}

async function buildGameEl(game) {
  const artUrl = game.artwork
    ? await window.api.getArtworkUrl(game.console, game.artwork)
    : null;
  return viewMode === 'grid' ? buildCard(game, artUrl) : buildRow(game, artUrl);
}

function buildCard(game, artUrl) {
  const div = document.createElement('div');
  div.className = 'game-card';
  div.dataset.id = game.id;

  const plat  = getPlatform(game.console);
  const color = plat.color;

  const artHtml = artUrl
    ? `<img class="card-art" src="${artUrl}" alt="${esc(game.title)}" loading="lazy" />`
    : `<div class="card-art-placeholder">
         <span style="font-size:32px;opacity:0.3">🎮</span>
         <span class="console-label">${esc(plat.label)}</span>
       </div>`;

  div.innerHTML = `
    ${artHtml}
    <div class="card-play-overlay">
      <div class="play-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><polygon points="5,3 19,12 5,21"/></svg>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title">${esc(game.title)}</div>
      <div class="card-console">
        <span class="card-console-dot" style="background:${color}"></span>
        ${esc(plat.label)}
      </div>
    </div>`;

  div.addEventListener('click', () => launchGame(game));
  div.addEventListener('contextmenu', e => openCtxMenu(e, game.id));
  return div;
}

function buildRow(game, artUrl) {
  const div = document.createElement('div');
  div.className = 'game-row';
  div.dataset.id = game.id;

  const plat = getPlatform(game.console);
  const thumbHtml = artUrl
    ? `<img class="row-thumb" src="${artUrl}" alt="${esc(game.title)}" />`
    : `<div class="row-thumb-placeholder">🎮</div>`;

  div.innerHTML = `
    ${thumbHtml}
    <div class="row-title">${esc(game.title)}</div>
    <div class="row-console">${esc(plat.label)}</div>
    <button class="row-play">▶ Play</button>`;

  div.querySelector('.row-play').addEventListener('click', e => { e.stopPropagation(); launchGame(game); });
  div.addEventListener('click', () => launchGame(game));
  div.addEventListener('contextmenu', e => openCtxMenu(e, game.id));
  return div;
}

function buildEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <div class="empty-icon">🎮</div>
    <h2>No games found</h2>
    <p>${effectiveListFilter() === 'all' && !searchQuery
      ? 'Click <strong>+ Add Game</strong> to add your first game'
      : 'Try adjusting your search or filter'}</p>`;
  return div;
}

function formatPlayTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s === 0) return 'No time yet';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

async function recordLaunch(game) {
  const idx = games.findIndex(g => g.id === game.id);
  if (idx === -1) return;
  games[idx].lastPlayedAt = Date.now();
  await persist();
  if (activeFilter === 'home') renderHome();
}

// ── Launch ────────────────────────────────────────
async function launchGame(game) {
  if (isBasicUser() && !isVisibleToBasic(game)) return;
  const plat = getPlatform(game.console);

  // Direct launch (Indie / PC) — run the game exe itself
  if (plat.isIndirect) {
    showLaunchOverlay(game.title, plat.label);
    const result = await window.api.launchGame(game.path, null, game.args || '', game.id);
    hideLaunchOverlay(result);
    if (result.success) await recordLaunch(game);
    return;
  }

  // Emulated — need emulator path
  const emulatorPath = emulators[game.console];
  if (!emulatorPath) {
    alert(`No emulator set for ${plat.label}.\n\nOpen "Manage Platforms", find ${plat.label}, and set the emulator path.`);
    return;
  }

  showLaunchOverlay(game.title, plat.label);
  const result = await window.api.launchGame(emulatorPath, game.path, game.args || '', game.id);
  hideLaunchOverlay(result);
  if (result.success) await recordLaunch(game);
}

// ── Home: recently played carousel (max 5) ───────
async function renderHome() {
  const panel = document.getElementById('home-panel');
  const sorted = [...games]
    .filter(g => g.lastPlayedAt && (!isBasicUser() || isVisibleToBasic(g)))
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
    .slice(0, 5);

  document.getElementById('game-count').textContent =
    sorted.length ? `${sorted.length} recent` : 'Home';

  if (sorted.length === 0) {
    panel.innerHTML = `
      <div class="home-welcome">
        <h1 class="home-title">Home</h1>
        <p class="home-sub">Play a game to see it here in <strong>Recently played</strong> (up to 5).</p>
      </div>`;
    scheduleGamepadRefresh();
    return;
  }

  const slides = await Promise.all(sorted.map(async (game) => {
    const artUrl = game.artwork
      ? await window.api.getArtworkUrl(game.console, game.artwork)
      : null;
    const plat = getPlatform(game.console);
    const artHtml = artUrl
      ? `<img class="carousel-art" src="${artUrl}" alt="${esc(game.title)}" />`
      : `<div class="carousel-art-placeholder"><span>🎮</span><span>${esc(plat.label)}</span></div>`;
    const timeLabel = formatPlayTime(game.playTimeSeconds);
    return `
      <div class="carousel-slide" data-id="${esc(game.id)}">
        <div class="carousel-card">
          ${artHtml}
          <div class="carousel-card-info">
            <div class="carousel-card-title">${esc(game.title)}</div>
            <div class="carousel-play-time">${esc(timeLabel)}</div>
          </div>
        </div>
      </div>`;
  }));

  panel.innerHTML = `
    <div class="home-welcome">
      <h1 class="home-title">Home</h1>
      <h2 class="carousel-section-title">Recently played</h2>
      <div class="carousel-track">${slides.join('')}</div>
    </div>`;

  scheduleGamepadRefresh();
  panel.querySelectorAll('.carousel-slide').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const game = games.find(g => g.id === id);
      if (game) launchGame(game);
    });
  });
}

// ── Gamepad (basic user) — A/X enters content from nav tab; B/Circle exits; D-pad + sticks directional in content only ─
let gamepadZone = 'sidebar'; // 'sidebar' | 'content'
let gamepadSidebarEls = [];
let gamepadContentEls = [];
let gamepadSidebarIndex = 0;
let gamepadContentIndex = 0;
let gamepadRafId = null;
let gamepadLastNavigateAt = 0;
let gamepadLastActivateAt = 0;
let gamepadLastInputAt = 0;
const GAMEPAD_REPEAT_MS = 220;
const GAMEPAD_ACTIVATE_COOLDOWN_MS = 350;
const MOUSE_SYNC_AFTER_GAMEPAD_MS = 450;

function clearGamepadFocus() {
  document.querySelectorAll('.gamepad-focus').forEach(el => el.classList.remove('gamepad-focus'));
}

function visibleNavItems() {
  const list = [];
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return list;
  nav.querySelectorAll('.nav-item').forEach(el => {
    if (el.offsetParent !== null && el.getAttribute('aria-hidden') !== 'true') list.push(el);
  });
  nav.querySelectorAll('.sidebar-footer .btn-settings').forEach(el => {
    if (el.offsetParent !== null) list.push(el);
  });
  return list;
}

function visibleContentItems() {
  const list = [];
  const homePanel = document.getElementById('home-panel');
  if (homePanel && homePanel.style.display !== 'none') {
    homePanel.querySelectorAll('.carousel-slide').forEach(el => list.push(el));
  }
  const gamesContainer = document.getElementById('games-container');
  if (gamesContainer && gamesContainer.style.display !== 'none') {
    gamesContainer.querySelectorAll('.game-card').forEach(el => list.push(el));
    gamesContainer.querySelectorAll('.game-row').forEach(el => list.push(el));
  }
  return list;
}

function refreshGamepadLists() {
  gamepadSidebarEls = visibleNavItems();
  gamepadContentEls = visibleContentItems();
  if (gamepadSidebarIndex >= gamepadSidebarEls.length) gamepadSidebarIndex = Math.max(0, gamepadSidebarEls.length - 1);
  if (gamepadContentIndex >= gamepadContentEls.length) gamepadContentIndex = Math.max(0, gamepadContentEls.length - 1);
}

let gamepadSuppressMouseSyncUntil = 0;
/** While > now, controller neon/bubble focus is suppressed — mouse is driving. */
let mouseInputActiveUntil = 0;
const MOUSE_INPUT_SUPPRESS_GAMEPAD_FOCUS_MS = 1200;

function markMouseDriving() {
  mouseInputActiveUntil = performance.now() + MOUSE_INPUT_SUPPRESS_GAMEPAD_FOCUS_MS;
  document.body.classList.add('using-mouse');
}
function markGamepadDriving() {
  mouseInputActiveUntil = 0;
  document.body.classList.remove('using-mouse');
}

function applyGamepadFocus() {
  const now = performance.now();
  if (now < mouseInputActiveUntil) {
    clearGamepadFocus();
    return;
  }
  clearGamepadFocus();
  gamepadLastInputAt = now;
  gamepadSuppressMouseSyncUntil = now + MOUSE_SYNC_AFTER_GAMEPAD_MS + 200;
  const list = gamepadZone === 'sidebar' ? gamepadSidebarEls : gamepadContentEls;
  let idx = gamepadZone === 'sidebar' ? gamepadSidebarIndex : gamepadContentIndex;
  if (list.length === 0) return;
  if (idx >= list.length) idx = 0;
  if (idx < 0) idx = list.length - 1;
  if (gamepadZone === 'sidebar') gamepadSidebarIndex = idx;
  else gamepadContentIndex = idx;
  const el = list[idx];
  if (!el || !document.body.contains(el)) return;
  el.classList.add('gamepad-focus');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

function getContentColumns() {
  const container = document.getElementById('games-container');
  if (!container || container.style.display === 'none') return 1;
  if (!container.classList.contains('grid-mode')) return 1;
  const style = getComputedStyle(container);
  const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length;
  return cols > 0 ? cols : Math.max(1, effectiveGridCols());
}

function moveContentFocus(dx, dy) {
  const list = gamepadContentEls;
  if (list.length === 0) return;
  const cols = getContentColumns();
  let idx = gamepadContentIndex;
  if (dy < 0) idx -= cols;
  else if (dy > 0) idx += cols;
  else if (dx < 0) idx -= 1;
  else if (dx > 0) idx += 1;
  idx = Math.max(0, Math.min(list.length - 1, idx));
  gamepadContentIndex = idx;
  applyGamepadFocus();
}

function scheduleGamepadRefresh() {
  if (!isBasicUser()) return;
  requestAnimationFrame(() => {
    refreshGamepadLists();
    if (gamepadZone === 'content' && gamepadContentEls.length === 0) gamepadZone = 'sidebar';
    if (performance.now() >= mouseInputActiveUntil) applyGamepadFocus();
    else clearGamepadFocus();
  });
}

function gamepadModalOpen() {
  const ids = ['modal-game', 'modal-platforms', 'modal-themes', 'modal-parental', 'modal-admin-password', 'launch-overlay'];
  return ids.some(id => {
    const el = document.getElementById(id);
    return el && el.style.display !== 'none';
  });
}

/**
 * DualSense / PS5 reports the D-pad with a different button order than Xbox:
 * Xbox layout (typical): 12=L, 13=R, 14=Up, 15=Down → we use 14/15 for sidebar Y.
 * DualSense often: physical Up/Down map to 12/13, Left/Right to 14/15 — so left/right was moving the sidebar vertically.
 */
function isSonyStyleGamepad(gp) {
  if (!gp || !gp.id) return false;
  const id = String(gp.id).toLowerCase();
  return (
    id.includes('054c') ||
    id.includes('dualsense') ||
    id.includes('dualshock') ||
    id.includes('wireless controller') ||
    id.includes('sony') ||
    id.includes('playstation')
  );
}

/**
 * Sidebar: vertical only. Left stick Y + D-pad Up/Down (layout depends on controller).
 */
function readGamepadStickSidebar(gp, deadzone) {
  const ax1 = gp.axes[1] || 0;
  let y = Math.abs(ax1) > deadzone ? ax1 : 0;
  const b = gp.buttons;
  if (isSonyStyleGamepad(gp)) {
    if (b[12] && b[12].pressed) y = -1;
    if (b[13] && b[13].pressed) y = 1;
  } else {
    if (b[14] && b[14].pressed) y = -1;
    if (b[15] && b[15].pressed) y = 1;
  }
  return y;
}

/** Content: full direction — sticks + D-pad; D-pad mapping matches sidebar per controller family. */
function readGamepadStickContent(gp, deadzone) {
  const ax0 = gp.axes[0] || 0;
  const ax1 = gp.axes[1] || 0;
  const ax2 = gp.axes[2] !== undefined ? gp.axes[2] : 0;
  const ax3 = gp.axes[3] !== undefined ? gp.axes[3] : 0;
  const ax6 = gp.axes[6] !== undefined ? gp.axes[6] : 0;
  const ax7 = gp.axes[7] !== undefined ? gp.axes[7] : 0;
  let x = 0, y = 0;
  if (Math.abs(ax0) > deadzone) x = ax0;
  if (Math.abs(ax1) > deadzone) y = ax1;
  if (!x && Math.abs(ax2) > deadzone) x = ax2;
  if (!y && Math.abs(ax3) > deadzone) y = ax3;
  if (!x && Math.abs(ax6) > deadzone) x = ax6;
  if (!y && Math.abs(ax7) > deadzone) y = ax7;
  const b = gp.buttons;
  if (isSonyStyleGamepad(gp)) {
    if (b[12] && b[12].pressed) y = -1;
    if (b[13] && b[13].pressed) y = 1;
    if (b[14] && b[14].pressed) x = -1;
    if (b[15] && b[15].pressed) x = 1;
  } else {
    if (b[12] && b[12].pressed) x = -1;
    if (b[13] && b[13].pressed) x = 1;
    if (b[14] && b[14].pressed) y = -1;
    if (b[15] && b[15].pressed) y = 1;
  }
  return { x, y };
}

let gamepadLastBackAt = 0;

function gamepadEnterContentAfterNavClick() {
  requestAnimationFrame(() => {
    refreshGamepadLists();
    if (gamepadContentEls.length > 0) {
      gamepadZone = 'content';
      gamepadContentIndex = 0;
      applyGamepadFocus();
    }
  });
}

function gamepadTick() {
  if (!isBasicUser() || gamepadModalOpen()) {
    gamepadRafId = requestAnimationFrame(gamepadTick);
    return;
  }
  const now = performance.now();
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (let i = 0; i < gps.length; i++) {
    if (gps[i]) { gp = gps[i]; break; }
  }
  if (!gp) {
    gamepadRafId = requestAnimationFrame(gamepadTick);
    return;
  }
  refreshGamepadLists();

  const b = gp.buttons;
  const btn1 = b[1] && b[1].pressed;

  if (gamepadZone === 'content' && btn1 && now - gamepadLastBackAt > GAMEPAD_ACTIVATE_COOLDOWN_MS) {
    gamepadLastBackAt = now;
    gamepadLastInputAt = now;
    markGamepadDriving();
    gamepadZone = 'sidebar';
    applyGamepadFocus();
    gamepadRafId = requestAnimationFrame(gamepadTick);
    return;
  }

  if (gamepadZone === 'sidebar') {
    const y = readGamepadStickSidebar(gp, 0.4);
    if ((y < -0.5 || y > 0.5) && now - gamepadLastNavigateAt > GAMEPAD_REPEAT_MS && gamepadSidebarEls.length > 0) {
      gamepadLastNavigateAt = now;
      gamepadLastInputAt = now;
      markGamepadDriving();
      if (y < -0.5) gamepadSidebarIndex = Math.max(0, gamepadSidebarIndex - 1);
      else gamepadSidebarIndex = Math.min(gamepadSidebarEls.length - 1, gamepadSidebarIndex + 1);
      applyGamepadFocus();
    }
  } else {
    const { x, y } = readGamepadStickContent(gp, 0.35);
    const wantRight = x > 0.5;
    const wantLeft = x < -0.5;
    const wantUp = y < -0.5;
    const wantDown = y > 0.5;
    if ((wantRight || wantLeft || wantUp || wantDown) && now - gamepadLastNavigateAt > GAMEPAD_REPEAT_MS && gamepadContentEls.length > 0) {
      gamepadLastNavigateAt = now;
      gamepadLastInputAt = now;
      markGamepadDriving();
      if (wantUp) moveContentFocus(0, -1);
      else if (wantDown) moveContentFocus(0, 1);
      else if (wantLeft) moveContentFocus(-1, 0);
      else if (wantRight) moveContentFocus(1, 0);
    }
  }

  const btn0 = b[0] && b[0].pressed;
  const btn2 = b[2] && b[2].pressed;
  const btn3 = b[3] && b[3].pressed;
  const activate = btn0 || btn2 || btn3;

  if (activate && now - gamepadLastActivateAt > GAMEPAD_ACTIVATE_COOLDOWN_MS && !btn1) {
    gamepadLastActivateAt = now;
    gamepadLastInputAt = now;
    markGamepadDriving();
    if (gamepadZone === 'sidebar') {
      const el = gamepadSidebarEls[gamepadSidebarIndex];
      if (el && document.body.contains(el)) {
        const isNavFilter = el.classList.contains('nav-item') && el.dataset && el.dataset.filter !== undefined;
        el.click();
        if (isNavFilter) gamepadEnterContentAfterNavClick();
      }
    } else {
      const el = gamepadContentEls[gamepadContentIndex];
      if (el && document.body.contains(el)) el.click();
    }
  }
  gamepadRafId = requestAnimationFrame(gamepadTick);
}

function startGamepadLoop() {
  if (gamepadRafId) return;
  gamepadZone = 'sidebar';
  gamepadSidebarIndex = 0;
  gamepadContentIndex = 0;
  gamepadLastNavigateAt = 0;
  gamepadLastActivateAt = 0;
  mouseInputActiveUntil = 0;
  document.body.classList.remove('using-mouse');
  scheduleGamepadRefresh();
  gamepadRafId = requestAnimationFrame(gamepadTick);
}

function stopGamepadLoop() {
  if (gamepadRafId) {
    cancelAnimationFrame(gamepadRafId);
    gamepadRafId = null;
  }
}

let gamepadMouseSyncEl = null;
let gamepadLastSyncClientX = 0;
let gamepadLastSyncClientY = 0;
function syncGamepadFocusFromMouse(e) {
  if (!isBasicUser()) return;
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const now = performance.now();
  if (now < gamepadSuppressMouseSyncUntil) return;
  if (now - gamepadLastInputAt < MOUSE_SYNC_AFTER_GAMEPAD_MS) return;
  if (e.target.closest && e.target.closest('.modal-overlay')) return;
  if (e.target.closest && e.target.closest('#modal-themes')) return;
  const mx = typeof e.movementX === 'number' ? e.movementX : 0;
  const my = typeof e.movementY === 'number' ? e.movementY : 0;
  if (Math.abs(mx) < 2 && Math.abs(my) < 2) {
    const dx = e.clientX - gamepadLastSyncClientX;
    const dy = e.clientY - gamepadLastSyncClientY;
    if (dx * dx + dy * dy < 36) return;
  }
  gamepadLastSyncClientX = e.clientX;
  gamepadLastSyncClientY = e.clientY;
  const t = e.target;
  if (!t || !t.closest) return;
  const el = t.closest('.nav-item, .game-card, .carousel-slide, .sidebar-footer .btn-settings, .game-row');
  if (!el || el.offsetParent === null) return;
  if (el === gamepadMouseSyncEl) return;
  gamepadMouseSyncEl = el;
  markMouseDriving();
  refreshGamepadLists();
  const sideIdx = gamepadSidebarEls.indexOf(el);
  const contentIdx = gamepadContentEls.indexOf(el);
  if (sideIdx >= 0) {
    gamepadZone = 'sidebar';
    gamepadSidebarIndex = sideIdx;
  } else if (contentIdx >= 0) {
    gamepadZone = 'content';
    gamepadContentIndex = contentIdx;
  }
  clearGamepadFocus();
}

function resetGamepadMouseSync() { gamepadMouseSyncEl = null; }
document.getElementById('sidebar').addEventListener('mousemove', syncGamepadFocusFromMouse, true);
document.getElementById('main-content').addEventListener('mousemove', syncGamepadFocusFromMouse, true);
document.getElementById('sidebar').addEventListener('mouseleave', resetGamepadMouseSync);
document.getElementById('main-content').addEventListener('mouseleave', resetGamepadMouseSync);

function onMouseDownMarkDriving(e) {
  if (!isBasicUser()) return;
  if (e.button !== 0) return;
  const t = e.target;
  if (t && t.closest && (t.closest('#sidebar') || t.closest('#main-content'))) markMouseDriving();
}
document.addEventListener('mousedown', onMouseDownMarkDriving, true);

window.addEventListener('gamepadconnected', () => {
  if (isBasicUser()) scheduleGamepadRefresh();
});

function showLaunchOverlay(title, sub) {
  document.getElementById('launch-title').textContent = `Launching ${title}`;
  document.getElementById('launch-sub').textContent   = `via ${sub}`;
  document.getElementById('launch-overlay').style.display = 'flex';
}

function hideLaunchOverlay(result) {
  setTimeout(() => { document.getElementById('launch-overlay').style.display = 'none'; }, 1600);
  if (!result.success) {
    setTimeout(() => alert(`Failed to launch:\n${result.error}`), 200);
  }
}

// ── Search & View ─────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderGames();
});

document.getElementById('games-per-line').addEventListener('input', e => {
  gamesPerLine = Math.min(8, Math.max(1, parseInt(e.target.value, 10) || 1));
  e.target.value = gamesPerLine;
  document.getElementById('games-per-line-value').textContent = gamesPerLine;
  renderGames();
});

const gameSortEl = document.getElementById('game-sort');
if (gameSortEl) {
  gameSortEl.value = gameSortBy;
  gameSortEl.addEventListener('change', () => {
    const v = gameSortEl.value;
    if (v === 'title' || v === 'playtime') {
      gameSortBy = v;
      try { localStorage.setItem(GAME_SORT_KEY, gameSortBy); } catch (e) { /* ignore */ }
      renderGames();
    }
  });
}

document.getElementById('view-grid').addEventListener('click', () => {
  viewMode = 'grid';
  document.getElementById('view-grid').classList.add('active');
  document.getElementById('view-list').classList.remove('active');
  renderGames();
});
document.getElementById('view-list').addEventListener('click', () => {
  viewMode = 'list';
  document.getElementById('view-list').classList.add('active');
  document.getElementById('view-grid').classList.remove('active');
  renderGames();
});

// ── Window Controls ───────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.api.windowMinimize());
document.getElementById('btn-maximize').addEventListener('click', () => {
  window.api.windowMaximize();
  // Event from main also fires; refresh after tick in case event order varies
  setTimeout(() => {
    if (window.api.windowIsMaximized) {
      window.api.windowIsMaximized().then(m => {
        windowMaximized = !!m;
        if (isBasicUser()) renderGames();
      });
    }
  }, 80);
});

if (typeof window.api.onWindowMaximizedChanged === 'function') {
  window.api.onWindowMaximizedChanged(maximized => {
    windowMaximized = !!maximized;
    if (isBasicUser()) renderGames();
  });
}
if (typeof window.api.windowIsMaximized === 'function') {
  window.api.windowIsMaximized().then(m => {
    windowMaximized = !!m;
    if (isBasicUser()) renderGames();
  }).catch(() => {});
}
document.getElementById('btn-close').addEventListener('click',    () => window.api.windowClose());

// ══════════════════════════════════════════════════
//  ADD / EDIT GAME MODAL
// ══════════════════════════════════════════════════

function populateConsoleDropdown(selectedId = '') {
  const sel = document.getElementById('field-console');
  sel.innerHTML = '<option value="">— Select Platform —</option>';
  platforms.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    if (p.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateGamePathLabel(consoleId) {
  const plat = getPlatform(consoleId);
  const label = document.getElementById('label-path');
  if (plat.isIndirect) {
    label.innerHTML = 'Game Executable (.exe) <span class="req">*</span>';
    document.getElementById('field-path').placeholder = 'C:\\Games\\Indie\\MyGame\\MyGame.exe';
  } else {
    label.innerHTML = 'Game File Path <span class="req">*</span>';
    document.getElementById('field-path').placeholder = 'C:\\Games\\PS2\\Gran Turismo 4.iso';
  }
}

document.getElementById('field-console').addEventListener('change', e => {
  updateGamePathLabel(e.target.value);
});

function openAddModal(game = null) {
  editingId     = game ? game.id : null;
  pendingArtSrc = null;

  document.getElementById('modal-title').textContent  = game ? 'Edit Game' : 'Add Game';
  document.getElementById('field-title').value        = game?.title   || '';
  document.getElementById('field-path').value         = game?.path    || '';
  document.getElementById('field-args').value         = game?.args    || '';

  populateConsoleDropdown(game?.console || '');
  updateGamePathLabel(game?.console || '');
  refreshModalArtPreview(game?.console, game?.artwork, null);

  document.getElementById('modal-game').style.display = 'flex';
  document.getElementById('field-title').focus();
}

async function refreshModalArtPreview(consoleId, artFilename, localSrc) {
  const preview = document.getElementById('artwork-preview');
  let url = null;
  if (localSrc) {
    url = 'file://' + localSrc.replace(/\\/g, '/');
  } else if (consoleId && artFilename) {
    url = await window.api.getArtworkUrl(consoleId, artFilename);
  }
  preview.innerHTML = url
    ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div class="artwork-placeholder"><span>🖼</span><span>No Artwork</span></div>`;
}

document.getElementById('btn-add-game').addEventListener('click', () => openAddModal());

document.getElementById('btn-pick-art').addEventListener('click', async () => {
  const src = await window.api.browseImage();
  if (!src) return;
  pendingArtSrc = src;
  refreshModalArtPreview(null, null, src);
});

document.getElementById('btn-browse-game').addEventListener('click', async () => {
  const consoleId = document.getElementById('field-console').value;
  const plat = getPlatform(consoleId);
  const filters = plat.isIndirect
    ? [{ name: 'Executable', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }]
    : [{ name: 'Game Files', extensions: ['iso','bin','cue','chd','xex','xiso','elf','pkg','rom','img','nrg'] }, { name: 'All Files', extensions: ['*'] }];
  const p = await window.api.browseFile(filters);
  if (p) document.getElementById('field-path').value = p;
});

function closeGameModal() {
  document.getElementById('modal-game').style.display = 'none';
  editingId = null; pendingArtSrc = null;
}
document.getElementById('modal-game-close').addEventListener('click', closeGameModal);
document.getElementById('btn-modal-cancel').addEventListener('click', closeGameModal);
document.getElementById('modal-game').addEventListener('click', e => { if (e.target === e.currentTarget) closeGameModal(); });

document.getElementById('btn-modal-save').addEventListener('click', async () => {
  const title    = document.getElementById('field-title').value.trim();
  const console_ = document.getElementById('field-console').value;
  const path_    = document.getElementById('field-path').value.trim();
  const args     = document.getElementById('field-args').value.trim();

  if (!title)    { alert('Please enter a game title.'); return; }
  if (!console_) { alert('Please select a platform.'); return; }
  if (!path_)    { alert('Please set the game file path.'); return; }

  let artFilename = null;
  if (pendingArtSrc) {
    artFilename = await window.api.copyArtwork(pendingArtSrc, console_, title);
  } else if (editingId) {
    artFilename = games.find(g => g.id === editingId)?.artwork || null;
  }

  if (editingId) {
    const idx = games.findIndex(g => g.id === editingId);
    if (idx !== -1) games[idx] = { ...games[idx], title, console: console_, path: path_, args, artwork: artFilename };
  } else {
    games.push({ id: uid(), title, console: console_, path: path_, args, artwork: artFilename });
  }

  await persist();
  closeGameModal();
  renderGames();
});

// ══════════════════════════════════════════════════
//  MANAGE PLATFORMS MODAL
// ══════════════════════════════════════════════════

function openPlatformsModal() {
  renderPlatformList();
  // Reset new platform form
  document.getElementById('new-plat-label').value = '';
  document.getElementById('new-plat-color').value = '#00d4ff';
  document.querySelector('input[name="new-plat-type"][value="indirect"]').checked = true;
  document.getElementById('new-plat-emu').value = '';
  document.getElementById('new-plat-emu-row').style.display = 'block';
  document.getElementById('modal-platforms').style.display = 'flex';
}

function renderPlatformList() {
  const list = document.getElementById('platform-list');
  list.innerHTML = '';

  platforms.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'platform-row';
    row.innerHTML = `
      <div class="platform-row-info">
        <span class="platform-dot" style="background:${p.color}"></span>
        <span class="platform-name">${esc(p.label)}</span>
        <span class="platform-type-badge ${p.isIndirect ? 'direct' : 'emulated'}">
          ${p.isIndirect ? 'Direct' : 'Emulated'}
        </span>
      </div>
      ${!p.isIndirect ? `
      <div class="platform-emu-row">
        <input type="text" class="emu-path-input" data-id="${p.id}" 
          placeholder="Path to emulator .exe…" 
          value="${esc(emulators[p.id] || '')}" />
        <button class="btn-secondary small btn-browse-emu" data-id="${p.id}">Browse…</button>
      </div>` : `
      <div class="platform-emu-row">
        <span class="direct-hint">Launches game .exe directly — no emulator needed</span>
      </div>`}
      <div class="platform-row-actions">
        <button class="btn-delete-platform danger-text" data-idx="${idx}" title="Remove platform">✕ Remove</button>
      </div>`;
    list.appendChild(row);
  });

  // Browse buttons for each existing emulated platform
  list.querySelectorAll('.btn-browse-emu').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = await window.api.browseFile([
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ]);
      if (p) {
        const input = list.querySelector(`.emu-path-input[data-id="${btn.dataset.id}"]`);
        if (input) input.value = p;
      }
    });
  });

  // Delete platform buttons
  list.querySelectorAll('.btn-delete-platform').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const plat = platforms[idx];
      const inUse = games.some(g => g.console === plat.id);
      if (inUse) {
        alert(`Cannot remove "${plat.label}" — ${games.filter(g => g.console === plat.id).length} game(s) are assigned to it. Remove those games first.`);
        return;
      }
      if (confirm(`Remove platform "${plat.label}"?`)) {
        platforms.splice(idx, 1);
        delete emulators[plat.id];
        renderPlatformList();
      }
    });
  });
}

// Show/hide emulator path when type radio changes
document.querySelectorAll('input[name="new-plat-type"]').forEach(r => {
  r.addEventListener('change', () => {
    const isDirect = document.querySelector('input[name="new-plat-type"]:checked').value === 'direct';
    document.getElementById('new-plat-emu-row').style.display = isDirect ? 'none' : 'block';
  });
});

document.getElementById('btn-browse-new-emu').addEventListener('click', async () => {
  const p = await window.api.browseFile([
    { name: 'Executable', extensions: ['exe'] },
    { name: 'All Files', extensions: ['*'] }
  ]);
  if (p) document.getElementById('new-plat-emu').value = p;
});

document.getElementById('btn-add-platform').addEventListener('click', () => {
  const label    = document.getElementById('new-plat-label').value.trim();
  const color    = document.getElementById('new-plat-color').value;
  const isDirect = document.querySelector('input[name="new-plat-type"]:checked').value === 'direct';
  const emuPath  = document.getElementById('new-plat-emu').value.trim();

  if (!label) { alert('Please enter a platform name.'); return; }

  // Generate a safe ID from label
  const id = label.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20) + '_' + Date.now().toString(36).slice(-3);

  platforms.push({ id, label, color, isIndirect: isDirect });
  if (!isDirect && emuPath) emulators[id] = emuPath;

  // Reset form
  document.getElementById('new-plat-label').value = '';
  document.getElementById('new-plat-color').value = '#00d4ff';
  document.getElementById('new-plat-emu').value   = '';
  document.querySelector('input[name="new-plat-type"][value="indirect"]').checked = true;
  document.getElementById('new-plat-emu-row').style.display = 'block';

  renderPlatformList();
});

async function savePlatformsAndClose() {
  // Collect emulator paths from inputs in the list
  document.querySelectorAll('.emu-path-input').forEach(input => {
    const id  = input.dataset.id;
    const val = input.value.trim();
    if (val) emulators[id] = val;
    else delete emulators[id];
  });

  await persist();
  document.getElementById('modal-platforms').style.display = 'none';
  renderSidebar();
  renderGames();
}

document.getElementById('btn-manage-platforms').addEventListener('click', openPlatformsModal);
document.getElementById('btn-platforms-done').addEventListener('click', savePlatformsAndClose);
document.getElementById('modal-platforms-close').addEventListener('click', savePlatformsAndClose);
document.getElementById('modal-platforms').addEventListener('click', e => {
  if (e.target === e.currentTarget) savePlatformsAndClose();
});

// ══════════════════════════════════════════════════
//  CONTEXT MENU
// ══════════════════════════════════════════════════

function openCtxMenu(e, gameId) {
  e.preventDefault();
  ctxTargetId = gameId;
  const menu = document.getElementById('ctx-menu');
  menu.style.display = 'block';
  const x = Math.min(e.clientX, window.innerWidth  - menu.offsetWidth  - 8);
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  const basic = isBasicUser();
  document.getElementById('ctx-edit').style.display = basic ? 'none' : '';
  document.getElementById('ctx-delete').style.display = basic ? 'none' : '';
  document.querySelector('.ctx-divider').style.display = basic ? 'none' : '';
}

function closeCtxMenu() {
  document.getElementById('ctx-menu').style.display = 'none';
  ctxTargetId = null;
}

document.addEventListener('click', closeCtxMenu);
document.addEventListener('contextmenu', e => {
  if (!e.target.closest('.game-card') && !e.target.closest('.game-row')) closeCtxMenu();
});

document.getElementById('ctx-launch').addEventListener('click', () => {
  const g = games.find(g => g.id === ctxTargetId);
  if (g) launchGame(g);
  closeCtxMenu();
});
document.getElementById('ctx-edit').addEventListener('click', () => {
  const g = games.find(g => g.id === ctxTargetId);
  if (g) openAddModal(g);
  closeCtxMenu();
});
document.getElementById('ctx-delete').addEventListener('click', async () => {
  const g = games.find(g => g.id === ctxTargetId);
  if (!g) return;
  if (confirm(`Remove "${g.title}" from the library?`)) {
    games = games.filter(x => x.id !== ctxTargetId);
    await persist();
    renderGames();
  }
  closeCtxMenu();
});

// ── Keyboard shortcuts ────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('modal-admin-password').style.display !== 'none') closeAdminPasswordModal();
    if (document.getElementById('modal-parental').style.display !== 'none') closeParentalModal();
    if (document.getElementById('modal-themes').style.display !== 'none') closeThemesModal();
    closeCtxMenu();
    if (document.getElementById('modal-game').style.display     !== 'none') closeGameModal();
    if (document.getElementById('modal-platforms').style.display !== 'none') savePlatformsAndClose();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isBasicUser()) openAddModal();
});

# 🎮 RetroLauncher

A sleek, NVIDIA-inspired local game launcher for PS1, PS2, PS3, Xbox, and Xbox 360 — built with Electron.

---

## 📁 Folder Structure

```
retro-launcher/
├── src/
│   ├── main.js           ← Electron main process
│   ├── preload.js        ← Secure IPC bridge
│   └── renderer/
│       ├── index.html    ← UI shell
│       ├── style.css     ← All styles
│       └── app.js        ← UI logic
├── artwork/              ← Central artwork folder
│   ├── PS1/
│   ├── PS2/
│   ├── PS3/
│   ├── XBOX/
│   └── XBOX360/
├── assets/
│   └── icon.ico          ← App icon (replace with your own)
├── games.json            ← Your library + emulator paths (auto-managed)
└── package.json
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or later — https://nodejs.org
- **npm** (comes with Node.js)

### 1. Install dependencies
```bash
cd retro-launcher
npm install
```

### 2. Run the app
```bash
npm start
```

---

## ⚙️ First-Time Setup

### Step 1 — Set your emulator paths
Click **⚙ Emulator Settings** in the sidebar and browse to each emulator's `.exe` file.

| Console    | Recommended Emulator |
|------------|----------------------|
| PS1        | DuckStation (`duckstation-qt.exe`) |
| PS2        | PCSX2 (`pcsx2-qt.exe`) |
| PS3        | RPCS3 (`rpcs3.exe`) |
| Xbox       | xemu (`xemu.exe`) |
| Xbox 360   | Xenia (`xenia.exe`) |

### Step 2 — Add your games
Click **+ Add Game** and fill in:
- **Title** — Display name (e.g. "Gran Turismo 4")
- **Console** — PS1, PS2, PS3, Xbox, Xbox 360
- **Game File** — Path to the `.iso`, `.bin`, `.xex`, etc.
- **Artwork** — Browse to a cover image (JPG/PNG, ~600×800px recommended)
- **Extra Launch Args** *(optional)* — Any flags the emulator needs

The artwork is automatically copied to the `artwork/<CONSOLE>/` folder.

### Step 3 — Adding artwork manually
You can also drop artwork directly into `artwork/PS1/`, `artwork/PS2/`, etc.
When adding a game, if a file in the artwork folder has the same name as you typed in the "artwork filename" field, it will load automatically.

---

## 🎮 Using the Launcher

| Action | How |
|--------|-----|
| Launch a game | Click any game card, or right-click → Launch |
| Edit a game | Right-click → Edit |
| Remove a game | Right-click → Remove |
| Filter by console | Click a console name in the sidebar |
| Search | Type in the search bar at the top |
| Toggle grid/list view | Click the view icons in the top bar |
| Keyboard shortcut | `Ctrl+N` to add a new game, `Esc` to close modals |

---

## 📦 Building a Standalone .exe

To package the app into a distributable Windows installer:

```bash
npm install --save-dev electron-builder
npm run build
```

The output will be in the `dist/` folder.

For a portable single `.exe` (no installer):
```bash
npm run build-portable
```

> **Note:** You'll need to replace `assets/icon.ico` with a real `.ico` file before building, or electron-builder may warn. You can use any free ICO converter online.

---

## 💡 Tips

- **RPCS3 (PS3):** Games are usually folders, not ISOs. Browse to the `EBOOT.BIN` inside the game folder.
- **Xenia (Xbox 360):** Point to the `.xex` or `.iso` file. Some games need `--gpu=vulkan` added in Extra Launch Args.
- **xemu (Xbox):** Point to the `.iso` file. You'll also need the Xbox HDD image configured inside xemu itself first.
- **DuckStation / PCSX2:** These launch ISOs or BIN/CUE files directly — no extra args needed for most games.

---

## 🗂️ games.json

This file is managed automatically by the app. You can edit it manually if needed:

```json
{
  "games": [
    {
      "id": "abc123",
      "title": "Gran Turismo 4",
      "console": "PS2",
      "path": "C:\\Games\\PS2\\Gran Turismo 4.iso",
      "args": "",
      "artwork": "gran_turismo_4.jpg"
    }
  ],
  "emulators": {
    "PS1": "C:\\Emulators\\DuckStation\\duckstation-qt.exe",
    "PS2": "C:\\Emulators\\PCSX2\\pcsx2-qt.exe",
    "PS3": "C:\\Emulators\\RPCS3\\rpcs3.exe",
    "XBOX": "C:\\Emulators\\xemu\\xemu.exe",
    "XBOX360": "C:\\Emulators\\Xenia\\xenia.exe"
  }
}
```

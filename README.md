# Retro Launcher

[![Electron](https://img.shields.io/badge/Electron-28.x-47848F?logo=electron)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js)](https://nodejs.org/)

Retro Launcher is a local desktop game launcher for retro and PC games. It lets you organize and launch titles for **PS1, PS2, PS3, Xbox, Xbox 360**, and **Indie/Steam** from one interface, with cover art, play-time tracking, and optional parental controls.

The app is built with **Electron** (main process + preload bridge) and a **vanilla HTML/CSS/JS** renderer — no front-end framework. Config lives in `games.json`; themes and user mode use `localStorage`. Build the standalone `.exe` with the included batch file or `npm run build`.

---

## Installation

Run the BATCH file on your computer and type "Retro Launcher" in the windows search bar. The app should pull up.

**Prerequisites:** [Node.js](https://nodejs.org/) v18 or later (npm included).

Clone the repo and install dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/retro-launcher-v3.git
cd retro-launcher-v3/retro-launcher
npm install
```

Run the app in development:

```bash
npm start
```

To produce a distributable Windows executable, use the project’s batch file or:

```bash
npm run build
```

Output is in `dist/` (installer) or use `npm run build-portable` for a single portable `.exe`.

---

## Usage

### Folder structure

```
retro-launcher/
├── src/
│   ├── main.js           # Electron main process
│   ├── preload.js        # Secure IPC bridge
│   └── renderer/
│       ├── index.html    # UI shell
│       ├── style.css     # Styles + themes
│       └── app.js        # UI logic
├── artwork/              # Cover art (by platform)
│   ├── PS1/
│   ├── PS2/
│   ├── PS3/
│   ├── XBOX/
│   └── XBOX360/
├── assets/
│   └── icon.ico          # App icon
├── games.json            # Library + emulator paths (app-managed)
├── BUILD_ME_FIRST.bat    # One-click build for .exe
└── package.json
```

### First-time setup

1. **Set emulator paths**  
   Click **Manage Platforms** (or **⚙ Emulator Settings**) and browse to each emulator’s `.exe`.

   | Console   | Example emulator        |
   |----------|-------------------------|
   | PS1      | DuckStation             |
   | PS2      | PCSX2                   |
   | PS3      | RPCS3                   |
   | Xbox     | xemu                    |
   | Xbox 360 | Xenia                   |

2. **Add games**  
   Click **+ Add Game** and fill in:
   - **Title** — Display name
   - **Console** — Platform
   - **Game file** — Path to `.iso`, `.xex`, `EBOOT.BIN`, etc.
   - **Artwork** — Cover image (JPG/PNG, ~600×800px). Stored under `artwork/<CONSOLE>/`.

3. **Optional**  
   Drop images into `artwork/PS1/`, `artwork/PS2/`, etc. When adding a game, matching the “artwork filename” to an existing file loads it automatically.

### In the launcher

| Action           | How                                      |
|------------------|------------------------------------------|
| Launch a game    | Click the card or right-click → Launch   |
| Edit / Remove    | Right-click → Edit or Remove            |
| Filter by console| Click a platform in the sidebar         |
| Search           | Use the search bar (admin)               |
| Grid / list      | Toggle in the top bar (admin)            |
| Themes           | Sidebar → Themes                         |
| Parental controls| Sidebar → Manage access (admin); PIN in modal |
| Controller (basic user) | D-pad / sticks to navigate; A/X to select; B to back |

### Building the standalone .exe

From the `retro-launcher` folder:

```bash
npm install
npm run build
```

Or run **BUILD_ME_FIRST.bat** for a one-click build. The built app is in `dist/`. Replace `assets/icon.ico` with your own `.ico` if you want a custom icon.

### games.json

The app manages this file automatically. Manual edit is optional; structure looks like:

```json
{
  "games": [
    {
      "id": "abc123",
      "title": "Gran Turismo 4",
      "console": "PS2",
      "path": "C:\\\\Games\\\\PS2\\\\Gran Turismo 4.iso",
      "args": "",
      "artwork": "gran_turismo_4.jpg"
    }
  ],
  "emulators": {
    "PS1": "C:\\\\Emulators\\\\DuckStation\\\\duckstation-qt.exe",
    "PS2": "C:\\\\Emulators\\\\PCSX2\\\\pcsx2-qt.exe"
  }
}
```

---

## Tips

- **RPCS3 (PS3):** Use the path to `EBOOT.BIN` inside the game folder.
- **Xenia (Xbox 360):** Point to `.xex` or `.iso`; some titles need `--gpu=vulkan` in extra args.
- **xemu (Xbox):** Point to the game `.iso`; configure the Xbox HDD image in xemu first.
- **DuckStation / PCSX2:** Usually work with ISO or BIN/CUE paths and no extra args.

---

## Roadmap

Possible future additions:

- [ ] macOS and Linux builds (electron-builder targets).
- [ ] Optional Steam/Indie integration (launch via Steam client).
- [ ] Backup/restore of `games.json` and artwork.

---

## License

Use and modify as you like. If you share a fork, a link back or credit is appreciated.

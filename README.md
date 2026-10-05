# Kanapa Game Launcher

Local Vue + Vite couch UI for your Steam and Heroic (Epic / GOG / Amazon) games.

The browser shows the library and handles gamepad navigation. A small Express bridge on your machine reads local libraries and opens `steam://` or `heroic://` links so Steam/Heroic actually launch or install the game.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Controls

| Action                  | Gamepad     | Keyboard   |
| ----------------------- | ----------- | ---------- |
| Move grid               | Left stick  | Arrow keys |
| Scroll shop sidebar     | Right stick | —          |
| Prev / next screenshot  | D-pad       | `-` / `=`  |
| Launch                  | A           | Enter      |
| Focus shop sidebar      | X           | `D`        |
| Install                 | Y           | `I`        |
| Prev / next filter      | L1 / R1     | `[` / `]`  |

Selecting a game loads a shop-style sidebar (screenshots, description, genres) from Steam’s store API or Heroic’s local GOG/Epic caches.

## Steam full library

Without credentials the app lists **installed** Steam games from local manifests.

For your full owned Steam library, copy `.env.example` to `.env` in the project root (or export env vars) and set:

1. `STEAM_API_KEY` from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
2. `STEAM_ID` (your 64-bit SteamID)

Then restart `npm run dev`.

## Heroic / Epic / GOG

Games come from Heroic’s cache under `~/.config/heroic`. Log into those stores in Heroic first so the library syncs. Launch uses `heroic://launch/<runner>/<id>`. Installs bypass Heroic’s broken protocol dialog and run Legendary/gogdl in a terminal using Heroic’s login + `defaultInstallPath`.

## Prism Launcher

Minecraft instances are read from Prism’s data dir (usually `~/.local/share/PrismLauncher/instances`, including the Flatpak path). Launch uses `prismlauncher --launch <instanceId>` (or the Flatpak/AppImage equivalent).

## Notes

- This must run on the same PC as Steam/Heroic. A public website cannot start those apps.
- Do not put store passwords into this project. Use Steam’s API key and Heroic’s existing logins.
- After a launch, the bridge remembers the active browser window (`wmctrl` / `xprop`) and brings it back fullscreen when the game process exits. Installs are left alone.

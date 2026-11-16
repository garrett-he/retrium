<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" alt="Retrium icon" />
</p>

<h1 align="center">Retrium</h1>

<p align="center">
  A cross-platform desktop app to organise, launch and track your collection of old programs with DOSBox.
</p>

<p align="center">
  <a href="https://github.com/garrett-he/retrium/releases"><img src="https://img.shields.io/github/v/release/garrett-he/retrium" alt="Latest release" /></a>
  <a href="https://github.com/garrett-he/retrium/blob/main/COPYING"><img src="https://img.shields.io/github/license/garrett-he/retrium" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platforms" />
</p>

## Features

- **Library management** — keep every program in its own folder with cover art, metadata and tags.
- **Rich metadata** — name, release year, category, language, developer, publisher, series and tags, all editable in the app.
- **Browse and filter** — search, category filter, sorting and grid/list views.
- **Multiple DOSBox versions** — register DOSBox, DOSBox-X or DOSBox Staging builds and pick the default or a specific one per launch.
- **Per-program configuration** — every program carries its own `.retrium/dosbox.conf`.
- **Saved states** — files written while a program runs are mirrored into the library and restored on the next launch.
- **Play tracking** — last run, number of runs and total playtime per program, plus a page of currently running programs.
- **Import and export** — package a program folder as a zip archive and import it back into any library.
- **First-run setup** — pick a library folder and DOSBox executable on first start; both can be changed later.
- **Themes** — dark and light modes.

## Requirements

- [Node.js](https://nodejs.org/) 22 or newer and [pnpm](https://pnpm.io/) 11
- [Rust](https://www.rust-lang.org/tools/install) (stable) with the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform
- A DOSBox executable (DOSBox, DOSBox-X or DOSBox Staging)

## Development

```sh
just install-dev   # install frontend and Rust dependencies
just dev           # run the app with hot reload
just check         # lint, typecheck and clippy
just test          # frontend and Rust tests
just build         # produce release bundles in src-tauri/target/release/bundle
```

The same commands are available through pnpm, e.g. `pnpm install`, `pnpm tauri dev` and `pnpm tauri build`.

## Library layout

Retrium keeps everything inside the library folder you choose:

```text
<library>/
├── programs/
│   └── DOOM/
│       ├── DOOM.EXE
│       └── .retrium/
│           ├── metadata.json   # program metadata
│           ├── cover.png       # optional cover art
│           └── dosbox.conf     # optional DOSBox configuration
├── states/
│   └── DOOM/                   # files saved during play, restored on launch
└── summaries/
    └── DOOM.json               # last run, runs and elapsed time
```

`metadata.json` is a plain JSON file, so libraries are easy to back up or edit by hand:

```json
{
  "name": "Doom",
  "release": 1993,
  "category": "Action",
  "language": "English",
  "developer": "id Software",
  "publisher": "GT Interactive",
  "tags": ["FPS"]
}
```

## Tech stack

[Tauri 2](https://tauri.app/) with a Rust backend and a React 19 + TypeScript frontend using [MUI](https://mui.com/).

## License

Copyright (C) 2024 Garrett HE <garrett.he@outlook.com>

Licensed under the GNU General Public License v3.0 or later, see [COPYING](./COPYING).
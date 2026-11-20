<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="96" alt="Retrium icon" />
</p>

<h1 align="center">Retrium</h1>

<p align="center">
  A cross-platform desktop app to organise, launch and track your collection of old carts with DOSBox.
</p>

<p align="center">
  <a href="https://github.com/garrett-he/retrium/releases"><img src="https://img.shields.io/github/v/release/garrett-he/retrium" alt="Latest release" /></a>
  <a href="https://github.com/garrett-he/retrium/blob/main/COPYING"><img src="https://img.shields.io/github/license/garrett-he/retrium" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue" alt="Platforms" />
</p>

## Features

- **Library management** — every cart is an archive plus an installed copy, with cover art, metadata and tags.
- **Rich metadata** — name, release year, category, language, developer, publisher, series, players, platform, DOS version and tags, all editable in the app.
- **Browse and filter** — search, category filter, sorting and grid/list views.
- **Multiple launch targets** — a cart declares how it starts (`Config/launch.json`); the Run button uses the default and the dropdown offers the rest, so a sound setup program is one click away.
- **Portable configuration** — carts carry launch settings, not a `dosbox.conf`. Retrium generates the conf at every launch, so the same cart behaves the same on any machine.
- **Saved states** — files written while a cart runs are recorded as a difference layer and restored on the next launch, and are kept out of the exported archive.
- **Versioned carts** — a cart has a permanent UUID and a revision you bump on export; the archive carries a content hash, so import can tell an upgrade from a conflict.
- **Import and export** — export a cart as a `.cart` archive and import it into any library, with an explicit decision for upgrades, conflicts and downgrades.
- **First-run setup** — pick a library folder and a DOSBox executable on first start; both can be changed later.
- **Themes** — dark and light modes.

## Requirements

- [Node.js](https://nodejs.org/) 22 or newer and [pnpm](https://pnpm.io/) 11
- [Rust](https://www.rust-lang.org/tools/install) (stable) with the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform
- A DOSBox executable (DOSBox 0.74-3 is the reference; DOSBox-X and DOSBox Staging are best-effort). Retrium does not bundle it.

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
├── carts/
│   └── <uuid>.cart             # immutable archive: export source, recovery source
├── installed/
│   └── <uuid>/
│       ├── Program/**          # mounted as C: — the working copy
│       ├── Config/launch.json  # targets and profiles; the one file worth editing
│       ├── Resources/cover.png
│       └── Runtime/            # generated: dosbox.conf, baseline, State/ (saves)
└── retrium.db                  # disposable index: carts and summaries
```

A **cart** is one program: a UUID that never changes, a revision you bump when you export, and a content
hash that describes the bytes. Editing metadata or `launch.json` only changes the hash, so it shows up as an
unexported change and becomes the next revision when you export — the cart keeps its identity either way.

A `.cart` file is a zip with the cart at its root:

```text
hash                      # SHA-256 over every other entry
manifest.json             # identity (id, revision, author) and program metadata
Program/**                # the program; C: when it runs
Config/launch.json        # targets, profiles, pre-commands
Resources/cover.png       # optional
```

`manifest.json` is plain JSON, so carts are easy to inspect or generate:

```json
{
  "version": 1,
  "cart": { "id": "0192f0a1-…", "revision": 3, "tool": { "app": "retrium", "version": "1.0.0", "host": "windows-x86_64" }, "createdAt": "2026-01-01T00:00:00+00:00" },
  "program": { "name": "Doom", "release": 1993, "category": "game", "language": "en", "developer": "id Software", "tags": ["FPS"] }
}
```

The full format — every field, the hash algorithm, the import rules — is documented in
[`design/CART_FORMAT_V2.md`](./design/CART_FORMAT_V2.md), and
[`skills/retrium-cart/`](./skills/retrium-cart) contains a validator and a template for building carts
without the app.

## Tech stack

[Tauri 2](https://tauri.app/) with a Rust backend and a React 19 + TypeScript frontend using [MUI](https://mui.com/).

## License

Copyright (C) 2024 Garrett HE <garrett.he@outlook.com>

Licensed under the GNU General Public License v3.0 or later, see [COPYING](./COPYING).

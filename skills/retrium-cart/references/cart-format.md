# Retrium cart format

This reference documents the on-disk contract implemented by Retrium's Rust backend. It is derived from
`src-tauri/src/lib.rs` (`Program`, `ProgramInfo`) and `src-tauri/src/commands.rs` (discovery, import, launch,
state mirroring). Load it when detailed field rules or edge cases matter.

## Library layout

```text
<library>/
├── programs/
│   └── <program-id>/
│       ├── <program files copied from the cart>
│       └── .retrium/
│           ├── metadata.json
│           ├── cover.png
│           └── dosbox.conf
├── states/
│   └── <program-id>/        # files written during play, restored before launch
└── summaries/
    └── <program-id>.json    # last_run, runs, elapsed
```

Discovery iterates directories under `<library>/programs`. Each subdirectory becomes a `Program` whose `id`
is the directory basename. The `.retrium` folder holds all app-managed metadata; everything else is treated
as program data.

## `metadata.json`

Rust type: `ProgramInfo` (in `lib.rs`). JSON object with these fields:

```json
{
    "name": "三國志4威力加強版",
    "language": "Traditional Chinese",
    "release": 1994,
    "category": "Game",
    "developer": "KOEI Corporation",
    "publisher": "KOEI Corporation",
    "series": null,
    "tags": []
}
```

| Field | Rust type | Required | Serialization behavior |
| --- | --- | --- | --- |
| `name` | `String` | Yes in practice | Must parse as a string. Empty value is replaced with the folder name. |
| `language` | `Option<String>` | No | Omitted from app-written JSON when null. |
| `release` | `Option<i32>` | No | Integer year, not a string. |
| `category` | `Option<String>` | No | Drives the library category filter; missing values show as "Uncategorized". |
| `developer` | `Option<String>` | No | Free text. |
| `publisher` | `Option<String>` | No | Free text. |
| `series` | `Option<String>` | No | Free text. |
| `tags` | `Option<Vec<String>>` | No | Array of strings; defaults to absent/empty. |

Loading rules, in order:

1. Read `.retrium/metadata.json`; if it parses into `ProgramInfo`, use it.
2. Otherwise read `.retrium/info.json` (legacy builds only); if it parses, use it.
3. Otherwise construct `ProgramInfo` with the folder name and all optional fields absent.

Notes:

- Unknown JSON fields are ignored by serde; malformed JSON discards the whole file rather than individual fields.
- The app writes `metadata.json` only. Never write `info.json` in a new cart.
- When the app saves metadata it uses pretty-printed JSON with 4-space indentation.
- The `name` field is shown on cards and detail pages; `release`, `category`, and `tags` also affect sorting,
  filtering, and search.

## `cover.png`

- Path is exactly `<program-dir>/.retrium/cover.png` (lowercase, PNG bytes).
- Any other filename or location is ignored; the UI then shows a gradient placeholder with an icon.
- Rendered with `object-fit: cover` in cards, thumbnails, and the detail hero. Landscape art around 800x600
  with centered subjects crops well. Keep file sizes modest since covers load together in the library grid.
- Ask the user for cover art; if none is supplied, omit the file and let the UI show its placeholder. Do
  not synthesize or download a cover.

## `dosbox.conf`

Full DOSBox-style INI file at `<program-dir>/.retrium/dosbox.conf`. On launch, Retrium:

1. Restores `<library>/states/<program-id>/` over the program directory (if that folder exists).
2. Starts the configured DOSBox executable with the program directory as the working directory.
3. Passes `-conf <absolute path to .retrium/dosbox.conf>` only when the file exists.

The `[autoexec]` section is where the program is mounted and launched. See `dosbox-tuning.md`.

## Import and archive rules

`add_programs` accepts `.cart` through the primary picker filter, with `.zip`, `.tar.gz`, and `.tgz` kept as
a legacy filter. `import_archive` extracts every selection with `zip::ZipArchive`, so a cart must use real
ZIP compression regardless of its extension.

Extraction goes to a temporary directory, then:

- If the cart contains **exactly one top-level entry and it is a directory**, that directory's name is
  the program id and its contents are copied into `<library>/programs/<id>/`.
- Otherwise, the archive file name with its extension removed is the program id, and all extracted root
  entries are copied into that directory. `archive_stem` strips `.cart` as well as the legacy extensions.

`archive_program` always writes a cart named `<id>.cart` containing the program directory's contents,
including `.retrium/`. Saved states and summaries are not part of the cart.

## State mirroring

While DOSBox runs, a watcher copies every created or modified file under the program directory into
`<library>/states/<id>/`, preserving relative paths. Any path containing a `.retrium` component is skipped.
On the next launch, the whole states folder is copied back over the program directory before DOSBox starts.
Consequences for cart authors:

- Ship only original, clean program files; do not ship save data you do not want restored on every launch.
- Do not expect `metadata.json`, `cover.png`, or `dosbox.conf` to be captured as changed state.
- Games that save outside the program directory cannot be tracked by this mechanism.

## Minimal valid cart

```text
DOOM/
├── DOOM.EXE
└── .retrium/
    └── metadata.json   {"name": "Doom", "release": 1993}
```

With no `dosbox.conf`, DOSBox starts without `-conf` in the program directory, so the user must mount and
run the game manually. Include a config for an out-of-the-box experience.

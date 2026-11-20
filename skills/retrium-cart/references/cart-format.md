# Retrium cart format

The on-disk contract of cart format **version 1**, as implemented by the Rust backend:

| Concern | File |
| --- | --- |
| layout, ZIP safety, archive read/write | `src-tauri/src/library.rs` |
| `tree_hash` | `src-tauri/src/hash.rs` |
| `manifest.json` | `src-tauri/src/manifest.rs` |
| `Config/launch.json` and generated `dosbox.conf` | `src-tauri/src/launch.rs` |
| import decisions | `src-tauri/src/import.rs` |

The design rationale lives in `design/CART_FORMAT_V2.md`. This file is the checklist.

## Identity, revision, hash

- **`cart.id`** — a UUID, canonical lowercase hyphenated (`0192f0a1-7c00-7000-8000-000000000001`). It is
  chosen once and never changes, not even when the contents, metadata or `launch.json` change. Directories
  and archive names are derived from it.
- **`cart.revision`** — an integer `>= 1`, strictly increasing for a given id. Only the author moves it. In
  the app the single write entry point is the export dialog; nothing else may change it.
- **`hash`** — the fact, not the claim. A 64-character lowercase hex SHA-256 over every entry except the
  root `hash` itself. Computed on export, verified on import.

Two builds of the same program are one cart with a higher revision. Two builds that must coexist get two ids.

## Archive layout

A `.cart` is a ZIP with the cart at its **root** — no `Contents/`, no wrapper folder:

```text
hash                      # 64 hex + optional newline
manifest.json
Program/**                # C: when the cart runs
Config/launch.json
Resources/**              # cover.png lives here
```

Import rejects, with a field-scoped message:

| Rule | Rejection |
| --- | --- |
| root name must be one of `hash`, `manifest.json`, `Program`, `Config`, `Resources` | `entry README.txt: only … are allowed at the archive root` |
| no absolute paths, drive letters, backslashes, `.`/`..`, trailing dot/space, `CON`-style reserved names | `entry …: unsafe path` |
| no symlinks, no encrypted entries | `entry …: symlinks are not allowed` |
| no two entries equal after NFC + lowercase | `entry …: duplicates another entry (case or Unicode normalization)` |
| at most 100 000 entries and 16 GiB uncompressed | `cart: too many entries` |
| `hash`, `manifest.json`, `Config/launch.json` must exist | `<name>: missing from the archive` |

## `manifest.json`

Root `version` doubles as the magic number: missing or non-integer means "not a Retrium cart"; an integer
other than `1` means "a version this build cannot read". It is unrelated to `cart.revision`.

```json
{
    "version": 1,
    "cart": {
        "id": "0192f0a1-7c00-7000-8000-000000000001",
        "revision": 3,
        "author": { "name": "Garrett", "email": "garrett@example.com" },
        "tool": { "app": "retrium", "version": "1.0.0", "host": "windows-x86_64" },
        "createdAt": "2026-01-01T00:00:00+00:00"
    },
    "program": {
        "name": "Doom",
        "language": "en",
        "release": 1993,
        "category": "game",
        "developer": "id Software",
        "publisher": "GT Interactive",
        "series": "Doom",
        "tags": ["FPS"],
        "players": 4,
        "platform": "DOS",
        "dos": { "version": "MS-DOS 5.0", "input": ["Keyboard"] },
        "externalIds": { "mobygames": "1068" }
    }
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `cart.id` | yes | UUID; must round-trip through `Uuid::parse_str` *and* be canonical lowercase |
| `cart.revision` | yes | integer `>= 1` |
| `cart.author` | no | when present, `name` non-empty; `email` if present must look like an address |
| `cart.tool` | yes | `app`, `version`, `host` all non-empty |
| `cart.createdAt` | yes | RFC 3339 with a timezone — it is the *build* time of this revision |
| `program.name` | yes | non-empty |
| `program.language` | no | BCP 47 syntax only; the value set is open (`zh-Hant`, `ja`, `en-US`) |
| `program.release`, `program.players` | no | integers |
| `program.category` | no | closed set of 8: `game application utility education demo development system reference` |
| `program.tags` | no | array of strings, free-form |
| `program.dos` | no | `version` string, `input` array of strings |
| `program.externalIds` | no | keys lowercase `[a-z0-9_-]+`, values strings |

Unknown keys are **ignored** (a future format may add fields). Author absent is a normal state; an empty
`author` object is not — omit the key instead of writing `{}`.

## The `hash` file

```text
record(path, bytes) = u32le(len(path_utf8)) || path_utf8 || sha256(bytes)   # 32 raw bytes
hash                = sha256( concat( sort_bytewise( records ) ) )
```

- Directories are not entries. The only exclusion is the root-level `hash` file itself.
- Sorting is over the **encoded record bytes**, not the path string — that is why the length prefix is
  mandatory: without it `("ab", h)` and `("a", "b" + h)` would encode identically.
- The file is one line of 64 lowercase hex; one trailing `\n` or `\r\n` is tolerated, anything else is
  refused.
- Consequences: re-zipping the same tree in another order, with other timestamps or another compression
  level yields the same hash; editing `manifest.json` (even only `revision` or `createdAt`) yields a new one.

Cross-language agreement is locked by `design/fixtures/hash-vectors.json`, read by both
`hash.rs` (tests) and `validate_cart.py` (every run).

## `Config/launch.json`

```json
{
    "version": 1,
    "default": "play",
    "targets": [
        {
            "id": "play",
            "label": "Main game",
            "executable": "DOOM.EXE",
            "arguments": ["-nosound"],
            "workingDir": ".",
            "profile": "high",
            "preCommands": ["cd SOUND", "set BLASTER=A220 I7 D1 H5 T6"]
        }
    ],
    "profiles": {
        "high": {
            "machine": "svga_s3",
            "memsize": 16,
            "cycles": "max",
            "core": "dynamic",
            "sound": ["sb16"],
            "extra": { "sdl.output": "texture" }
        }
    }
}
```

The schema is **closed** (`deny_unknown_fields`): a typo like `memory` instead of `memsize` fails at import
with the field path, not silently at launch. `profiles.<name>.extra` is the only escape hatch.

**target**

| Field | Required | Rule |
| --- | --- | --- |
| `id` | yes | `^[a-z][a-z0-9_-]{0,31}$`, unique ignoring case |
| `label` | yes | 1–40 characters; this is the Run button text |
| `executable` | yes | relative path inside `Program/`, must exist |
| `arguments` | no | ≤ 260 characters each, no `"`, newline or tab |
| `workingDir` | no | default `.`; resolved against `Program/`, must exist |
| `profile` | no | must name an entry in `profiles` |
| `preCommands` | no | ≤ 16 entries, whitelist below |

`default` is optional; absent means `targets[0]`. Pointing at an unknown id is an error.

**profile**

| Field | Rule |
| --- | --- |
| `machine` | one of `hercules cga_mono cga tandy pcjr ega vgaonly svga_s3 svga_et3000 svga_et4000 svga_paradise vesa_nolfb vesa_oldvbe` |
| `memsize` | integer 1–63 (MB) |
| `cycles` | integer, `"auto"` or `"max"` (not `3000.0`) |
| `core` | `auto`, `normal`, `simple`, `dynamic` |
| `sound` | tokens: at most one of `sb1 sb2 sbpro1 sbpro2 sb16 gb`; `gus`; `none` alone |
| `extra` | flat `section.key` → string; section must be one of `sdl dosbox render cpu mixer midi sblaster gus speaker joystick serial dos ipx`; value must not contain newline, NUL, `[` or `]` |

**preCommands whitelist**

| Command | Allowed form |
| --- | --- |
| `cd` | `cd <dir inside Program/>` |
| `loadfix` | `loadfix [-1] <exe inside Program/>` |
| `set` | `set BLASTER=…` or `set SOUND=…`, value without drive or path |
| `imgmount` | `imgmount <D\|D:> <file in Program/ or Resources/> [-t iso\|cdrom\|floppy]` |
| `MOUNT` | refused — `Program/` is mounted automatically |

Pipes, redirection (`| & > <`) and any other command are refused.

## Generated `dosbox.conf`

Written to `installed/<id>/Runtime/dosbox.conf` at every launch and started as
`<dosbox> -noconfig -conf <that file>` with the working directory set to `Program/`. It is a build artifact:
never ship it, never edit it.

Output order is fixed, so the same input always produces the same bytes: header comment, then sections
`sdl → dosbox → render → cpu → mixer → midi → sblaster → gus → others alphabetically → autoexec`, keys
alphabetical inside a section, empty sections omitted.

Mapping: `machine`/`memsize` → `[dosbox]`, `cycles`/`core` → `[cpu]`, `sound` → `[sblaster] sbtype=` /
`[gus] gus=true` / `[mixer] nosound=true`, `extra` verbatim. `[autoexec]` gets `MOUNT C <abs path>`,
`IMGMOUNT` lines, `cd` lines and the quoted executable with its arguments. Only overrides are written;
everything else comes from the user's own DOSBox defaults.

## Library layout

```text
<library>/
├── carts/<uuid>.cart              # immutable archive: export source, recovery source
├── installed/<uuid>/
│   ├── Program/**                 # C: — the working copy
│   ├── Config/launch.json         # the one file worth editing by hand
│   ├── Resources/cover.png
│   └── Runtime/
│       ├── dosbox.conf            # generated per launch
│       ├── baseline.json          # stat snapshot taken at launch
│       ├── running                # exists ⇒ the last run did not finish
│       ├── State/**               # files the program wrote, relative to Program/
│       ├── commit.json            # {revision, package_hash, manifest_version}
│       ├── mapper.map
│       └── captures/
└── retrium.db                     # SQLite index: carts + summaries
```

`Runtime/` is regenerable except `State/`, which is the save layer. Saves are computed **at exit** by
comparing `Program/` against the baseline, not by watching files: new or changed → copy into `State/`;
gone from `Program/` → delete from `State/`; never in `Program/` → leave alone. The next launch overlays
`State/` back before DOSBox starts.

## Export: which copy wins

Export reads `installed/`, not the archive, so files the user dropped in are picked up. Save data is
excluded by consulting `State/`:

| `installed/Program/` | `Runtime/State/` | archive | exported |
| --- | --- | --- | --- |
| has | no | — | installed version |
| has | yes | has | archive version |
| has | yes | no | skipped (the program created it) |
| no | — | has | archive version (never treated as a deletion) |

`Config/launch.json` and `Resources/cover.png` come from `installed/`; metadata and `cart.author` from the
database; `cart.id` is kept; `cart.tool` and `cart.createdAt` are refreshed when the revision changes.
"Local changes not yet exported" (`dirty`) is exactly "the export set would hash differently", recomputed on
demand — no stored flag, so it cannot go stale and does not misfire because `Program/` holds save files.

## Import decisions

| Existing cart | Incoming | Result |
| --- | --- | --- |
| none | any | import as new |
| same id, same revision, same hash | identical | idempotent: reported as already imported |
| same id, higher revision | newer | pending **upgrade** — applies the archive, then layers `State/` back |
| same id, lower revision | older | pending **downgrade** — refused unless chosen |
| same id, same revision, different hash | conflict | pending **conflict** — same `(id, revision)` must not mean two contents |
| different id, same hash | duplicate | pending **duplicate** (defensive: the manifest is inside the hash) |

Nothing pending is ever applied automatically. The database is a disposable index: if `PRAGMA user_version`
does not match, the tables are dropped and rebuilt from `carts/*.cart`. Nothing is migrated, ever — the
format is not stable until app version 1.0.0.

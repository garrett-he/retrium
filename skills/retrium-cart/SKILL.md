---
name: retrium-cart
description: Build, validate, and repair carts (cart packages) for Retrium, a DOSBox library app. Covers the format-version-1 cart layout — manifest.json, Config/launch.json, Program/, Resources/cover.png, the root hash file and the .cart archive — plus the validate_cart.py preflight script. Use when asked to build a cart for a DOS program, fix metadata or launch problems, or review an existing cart.
agent_created: true
---

# Retrium Cart

## Overview

A Retrium **cart** is a self-contained unit for a DOS program: the program files under `Program/`, a
`manifest.json` that carries identity and metadata, a `Config/launch.json` that says how to start it, and an
optional cover. A `.cart` file is that same tree zipped with the contents at the **archive root**.

Three values matter and none of them are derived from file names:

| Value | Who sets it | What it means |
| --- | --- | --- |
| `cart.id` | the author, once | A UUID. Permanent. Never regenerate it for an update of the same program. |
| `cart.revision` | the author, on export | `1`, `2`, `3`… of *this* cart. Strictly increasing per id. |
| root `hash` | computed | SHA-256 over the cart contents. Written last, never hand-edited. |

Identity is a claim (you declare which cart this is); the hash is a fact (what the bytes are). A new build of
the same program is the same `id` with a higher `revision`, not a new cart. Two carts that must coexist
(different settings, original vs. translated) get two ids.

## When to use this skill

- Turning a folder of DOS files into a cart a user can import.
- Diagnosing an import that is refused, shows the wrong name, or launches the wrong executable.
- Reviewing a cart before handing it over.

## Cart layout

```text
<staging-dir>/                 # ignored on import; the .cart file is what gets imported
├── hash                       # 64 lowercase hex + newline; only inside the .cart
├── manifest.json              # identity + metadata
├── Program/**                 # mounted as C: when the cart runs
├── Config/
│   └── launch.json            # targets, profiles, pre-commands
└── Resources/
    └── cover.png              # optional, exact name
```

Hard rules enforced by the importer:

- **No wrapper folder.** `manifest.json` sits at the archive root. Zipping a directory so entries are named
  `my-game/manifest.json` is refused.
- **Nothing else at the root.** Only `hash`, `manifest.json`, `Program/`, `Config/`, `Resources/`.
  `Config/` holds only `launch.json`; anything else there is ignored with a warning.
- **`Program/` is the C: drive.** Paths in `launch.json` are relative to it; `..` out of it is refused.
  Files the program writes into `Program/` during a run are treated as save data and are **not** exported
  into the next cart — do not put authored content there and expect it to stay.
- **No `dosbox.conf` anywhere.** Format version 1 generates it at launch from `launch.json`. A cart carrying
  `dosbox.conf` is old-format and is refused.
- **No symlinks, no encrypted entries, no duplicate-by-case paths**, no `CON`/`NUL`/`LPT1`-style names.

## Workflow

### Step 1 — Stage outside the library

Copy the program files into `<staging>/Program/`, preserving names and case. Never write into the user's
`<library>/` — hand them a `.cart` file and let them import it.

The template ships `manifest.json` and `Config/` only — `Program/` and `Resources/` are yours to create.
Copy the two files and add the folders rather than `cp -r` the whole template; an empty `Program/` is an
error (`Program: contains no files`), not a placeholder.

### Step 2 — `manifest.json`

Start from `assets/cart-template/manifest.json`. Generate a fresh UUID
(`python -c "import uuid; print(uuid.uuid4())"`) the first time, then **reuse that id forever** for this cart;
bump `revision` on every export. `createdAt` is when *this revision* was built, ISO 8601 with a timezone.

`program.*` below is all optional except `name`, and every field is stored and displayed by the app:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Required, non-empty. |
| `language` | string | BCP 47 only (`en`, `zh-Hant`, `ja`). Not `"English"`. |
| `release` | integer | Year, e.g. `1993`. Never a string. |
| `category` | string | One of `game`, `application`, `utility`, `education`, `demo`, `development`, `system`, `reference`. |
| `developer`, `publisher`, `series`, `platform` | string | Omit when unknown; never invent. |
| `tags` | array of strings | Free-form; the closed vocabulary is `category`. |
| `players` | integer | 1 for single player. |
| `dos.version`, `dos.input` | string, array | e.g. `"MS-DOS 5.0"`, `["Keyboard", "Mouse"]`. |
| `externalIds` | object | Lowercase keys, string values, e.g. `{"mobygames": "1068"}`. |

`cart.author` is optional and, when present, needs a non-empty `name` (plus an optional `email`).

### Step 3 — `Config/launch.json`

Start from `assets/cart-template/Config/launch.json`. One `targets[]` entry per way to start the program:

```json
{
    "version": 1,
    "default": "play",
    "targets": [
        { "id": "play",  "label": "Main game",   "executable": "DOOM.EXE",  "workingDir": ".", "profile": "high" },
        { "id": "setup", "label": "Sound setup", "executable": "SETUP.EXE", "preCommands": ["cd SOUND"] }
    ],
    "profiles": {
        "high": { "machine": "svga_s3", "memsize": 16, "cycles": "max", "sound": ["sb16"] }
    }
}
```

- `id` matches `^[a-z][a-z0-9_-]{0,31}$` and must be unique ignoring case. `label` is what the user reads in
  the Run button — keep it under 40 characters. `executable` must exist **inside `Program/`**.
- `default` is the target the main Run button uses. Omit it and the first target wins.
- `preCommands` is a closed whitelist: `cd`, `loadfix`, `set BLASTER=…` / `set SOUND=…`, `imgmount`.
  `MOUNT` is refused — `Program/` is mounted automatically.
- `profiles` are reusable runtime settings; `sound` takes `sb1|sb2|sbpro1|sbpro2|sb16|gb`, `gus`, or `none`
  (alone). See `references/dosbox-tuning.md` for picking values by era of hardware.
- The schema is **closed**: an unknown key is an error at import, not a surprise at launch. The only escape
  hatch is `profiles.<name>.extra` with `section.key` entries; `[autoexec]` is not available.

### Step 4 — `Resources/cover.png` (optional)

Real PNG, exact name. Convert with `magick input.jpg -resize 800x600 Resources/cover.png`. If the user has no
art, **omit the file** — do not synthesise or download a cover. Keep important content centred; the UI crops.

### Step 5 — Validate, then hash

```sh
python scripts/validate_cart.py <staging-dir> --write-hash
```

The validator mirrors the Rust importer for layout, `manifest.json`, `launch.json`, referenced files and
limits, and re-runs the shared hash fixtures on every invocation so its `tree_hash` cannot drift from
`src-tauri/src/hash.rs`. Fix every error; a warning is a decision you have to justify. `--write-hash` writes
the root `hash` file — it refuses while any error remains, because the hash must describe a valid tree.

### Step 6 — Zip and hand off

Zip the **contents** of the staging directory (not the directory itself) into `<name>.cart`. Entry order,
timestamps and compression do not matter: the hash covers paths and file bytes only.

```sh
python - <<'PY'
import pathlib, zipfile
stage, out = pathlib.Path("stage"), pathlib.Path("MyGame.cart")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for item in sorted(stage.rglob("*")):
        if item.is_file():
            z.write(item, item.relative_to(stage).as_posix())
PY
python scripts/validate_cart.py MyGame.cart
```

Hand the `.cart` to the user for the app's **Add carts** action. Re-importing the identical cart is reported
as already imported; importing a higher `revision` of the same `id` is offered as an upgrade; the same
`revision` with different content is a conflict the user must resolve.

## Common pitfalls

| Symptom | Cause |
| --- | --- |
| `Not a Retrium cart` | No `manifest.json` at the archive root, or zipped with a wrapper folder. |
| `Unsupported cart version: N` | Root `version` is not `1`. |
| `hash: does not match the contents` | The tree changed after `--write-hash`; re-run it. |
| `targets[0].executable: file not found` | Wrong name/case, or the file is not inside `Program/`. |
| `command not allowed: mount` | `preCommands` uses `MOUNT`; delete it, `Program/` is mounted for you. |
| `preCommands[0]: path escapes Program/` | A `..` that walks out of `Program/`. |
| Upgrade keeps being refused | `revision` was not bumped, so it looks like a conflict instead of an upgrade. |
| Everyone sees two carts for one program | A fresh UUID was generated per build instead of reusing `cart.id`. |
| Save file disappeared from the next export | Files under `Program/` written during a run are save data by design. |
| Cart works but the Run button is disabled | `launch.json` failed validation; the app shows the field path. |

## Resources

- `scripts/validate_cart.py` — layout, schema, reference and hash checks, plus `--write-hash`.
- `references/cart-format.md` — every field, the hash algorithm, import rules and library layout.
- `references/dosbox-tuning.md` — choosing `machine`, `memsize`, `cycles`, `sound` and `extra`, and what the
  generated `dosbox.conf` looks like.
- `assets/cart-template/` — `manifest.json` and `Config/launch.json` to copy and edit.

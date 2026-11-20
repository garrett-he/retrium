---
name: retrium-cart
description: Build, validate, and repair carts (cart packages) for Retrium, a DOSBox library app, including .retrium/metadata.json, .retrium/cover.png, .retrium/dosbox.conf, and the .cart archive layout used by import. Use when asked to build a cart for a DOS game or cart, fix metadata or launch problems, or review an existing cart for compatibility.
agent_created: true
---

# Retrium Cart

## Overview

A Retrium **cart** is a self-contained unit for a DOS program: the program files at the root plus a hidden
`.retrium/` control folder holding metadata, optional cover art, and an optional DOSBox configuration. When
exported, a cart is a zip-format archive with a `.cart` extension. Retrium reads this layout directly from
disk (`discover_carts`, `load_cart_info`, `run_cart`, `import_archive` in
`src-tauri/src/commands.rs`), so an AI-built cart must match that contract exactly.

## When to use this skill

- Preparing a DOS game or utility folder so Retrium can list, describe, and launch it.
- Diagnosing why a cart imports with the wrong name, no cover, or a DOSBox prompt instead of the game.
- Reviewing or validating a cart before handing it to a user.

## Cart layout

```text
<cart-id>/
├── CART.EXE          # executable and all game data at the root
├── *.BAT / *.COM / ...  # anything the cart needs at runtime
└── .retrium/
    ├── metadata.json    # canonical metadata; write this file
    ├── dosbox.conf      # optional; passed to DOSBox with -conf
    └── cover.png        # optional; exact filename, lowercase
```

Hard rules derived from the backend:

- The **cart id** is the directory basename under `<library>/carts/<id>/`. It is also used for
  `<library>/states/<id>/` and `<library>/summaries/<id>.json`. Keep it unique, stable, and free of path
  separators or reserved characters; prefer the cart's short ASCII title.
- Retrium launches DOSBox with the **cart directory as the working directory** and a config that
  normally mounts it as `C:` (`MOUNT C .`). Keep executable paths relative to that root.
- Files created or modified during play **outside `.retrium/`** are mirrored to `<library>/states/<id>/`
  and restored before the next launch. Never store metadata, configs, or cover art outside `.retrium/`,
  and do not rely on `.retrium/` files being snapshotted as save data.
- `metadata.json` is canonical. `info.json` is a legacy read-only fallback: **never create or write it.**
  Invalid or unparseable `metadata.json` is silently ignored, then `info.json` is tried, then the folder
  name is used as the display name.

## Workflow

### Step 1 — Stage the cart

Build in a staging directory, not in a user's live library. Choose the cart id, copy the original cart
files into `<id>/` preserving filenames and case, and confirm the executable named in the autoexec exists.
On Linux and macOS, DOSBox command lines and filenames are case-sensitive.

### Step 2 — Write `.retrium/metadata.json`

Start from `assets/cart-template/.retrium/metadata.json` and fill in verified values:

| Field | JSON type | Notes |
| --- | --- | --- |
| `name` | string | Required. Empty strings are replaced with the folder name. |
| `language` | string or null | e.g. `"English"`, `"Traditional Chinese"`. |
| `release` | integer or null | Release year as a number, e.g. `1994`. Never a string. |
| `category` | string or null | e.g. `"Game"`, `"Application"`. Used by the library filter. |
| `developer`, `publisher`, `series` | string or null | Use `null` when unknown; do not invent data. |
| `tags` | array of strings or null | Short searchable labels, e.g. `["Strategy", "DOS"]`. |

Only `name` must be present. Unknown fields are ignored. Write pretty-printed UTF-8 JSON with 4-space
indentation, matching the app's own output. See `references/cart-format.md` for the full schema and
deserialization behavior.

### Step 3 — Write `.retrium/dosbox.conf`

Copy `assets/cart-template/.retrium/dosbox.conf`. The `[autoexec]` section must mount the cart
directory and launch the cart, for example:

```ini
[autoexec]
MOUNT C .
C:
SAN486.COM
```

Match the launch line to the actual executable (`.EXE`, `.COM`, or `.BAT`). Set `machine`, `memsize`, and
`cycles` to suit the title; keep Sound Blaster settings for games with AdLib/SB audio. Quote paths that
contain spaces. Omitting `dosbox.conf` is valid, but then no `-conf` is passed and DOSBox uses its own
defaults. See `references/dosbox-tuning.md` for common scenarios and troubleshooting.

### Step 4 — Add `.retrium/cover.png` (optional)

The cover is optional; a missing or misnamed file simply yields the built-in placeholder. Ask the user for
an existing cover image or a path to one. If supplied, convert it to a real PNG at `.retrium/cover.png`
(ImageMagick: `magick input.jpg -resize 800x600 .retrium/cover.png`). If the user has no art, **omit the
file** — do not synthesize or download a cover. The UI renders covers with `object-fit: cover` at several
aspect ratios, so keep important content centered.

### Step 5 — Validate

Run the bundled validator before delivery:

```sh
python scripts/validate_cart.py <path-to-cart-folder-or-.cart-file>
```

It checks the metadata schema, cover format, config autoexec, executable presence, and archive folder layout.
Fix every reported error; warnings need a deliberate decision.

### Step 6 — Export and hand off

Create a `.cart` archive (zip format) whose **single top-level entry is the cart-id folder**. Retrium uses
that folder name as the id; if the cart has multiple root entries, the archive file name (minus extension)
becomes the id instead. Agents should hand the finished cart to the user for import through the app's
**Add Carts** action rather than writing directly into `<library>/`.

## Common pitfalls

| Symptom | Likely cause |
| --- | --- |
| Display name is the folder name | `metadata.json` missing, invalid JSON, or `name` empty. |
| No cover art | File not named exactly `cover.png`, not in `.retrium/`, or not a PNG. |
| DOSBox prompt instead of the game | Wrong/missing autoexec launch line, wrong executable case, or mount target not the cart root. |
| Saved game appears to vanish | `.retrium/` is excluded from state mirroring, or the game saves outside the cart directory. |
| Imported id is unexpected | Cart had no single top-level folder, so the archive stem was used. |

## Resources

- `scripts/validate_cart.py` — deterministic preflight checks for a folder or `.cart` archive.
- `references/cart-format.md` — complete field schema, import rules, state mirroring, and examples.
- `references/dosbox-tuning.md` — config sections, launch patterns, and troubleshooting.
- `assets/cart-template/.retrium/` — starter `metadata.json` and `dosbox.conf` to copy and edit.

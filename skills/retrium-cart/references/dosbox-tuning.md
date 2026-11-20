# Tuning a cart's launch profile

Load this reference when choosing `profiles.*` values in `Config/launch.json`. Retrium does not ship DOSBox:
the user points the app at their own executable, and the app writes a `dosbox.conf` from this file at every
launch, starting DOSBox with `-noconfig -conf <generated file>`. Only the keys you set are written —
everything else is whatever that DOSBox build defaults to.

## Where a value goes

| You want to change | Write | Ends up in |
| --- | --- | --- |
| video card | `machine` | `[dosbox] machine=` |
| conventional memory | `memsize` (MB, 1–63) | `[dosbox] memsize=` |
| CPU speed | `cycles` (`3000`, `"max"`, `"auto"`) | `[cpu] cycles=` |
| CPU emulation | `core` (`auto`, `normal`, `simple`, `dynamic`) | `[cpu] core=` |
| sound card | `sound` tokens | `[sblaster] sbtype=`, `[gus] gus=`, `[mixer] nosound=` |
| anything else | `extra` as `section.key` | that section, that key |

`extra` is the escape hatch and the only one: its section must be one of `sdl dosbox render cpu mixer midi
sblaster gus speaker joystick serial dos ipx`, and the value must be a plain string without newlines, NUL or
brackets. `autoexec` is not reachable — mounting and launching are the app's job.

Two habits keep carts portable: prefer the smallest profile that works, and put the aggressive settings in a
*second* target (`"label": "Main game (fast)"`) instead of overwriting the default one.

## Starting points by era

| Era | Typical profile |
| --- | --- |
| 1985–1989 (CGA/EGA, PC speaker) | `machine: "ega"`, `memsize: 4`, `cycles: 1000`, `sound: []` |
| 1990–1992 (VGA, AdLib/SB1) | `machine: "vgaonly"`, `memsize: 8`, `cycles: 3000`, `sound: ["sb1"]` |
| 1993–1995 (SVGA, SB16, CD) | `machine: "svga_s3"`, `memsize: 16`, `cycles: "max"`, `core: "dynamic"`, `sound: ["sb16"]` |
| 1996+ (protected mode, large memory) | `machine: "svga_s3"`, `memsize: 32`, `cycles: "max"`, `sound: ["sb16"]` |

Rules of thumb:

- **Too fast?** `cycles` from `"max"` to a fixed number (try `10000`, then `6000`, `3000`), or `core:
  "normal"`. Speed-sensitive titles (Sierra adventures, Wing Commander) usually need this.
- **Too slow?** `cycles: "max"`, then `core: "dynamic"`.
- **No sound in the game's setup?** `sound: ["sb16"]` gives `sbtype=sb16`, which the game must also select in
  its own SETUP program. Older titles may only speak SB1/SB2 — try `"sb1"`.
- **Speed-sensitive plus GUS music?** `sound: ["sb16", "gus"]` is allowed; two Sound Blaster types at once is
  not.
- **Silence on purpose:** `sound: ["none"]` writes `nosound=true`; it cannot be combined with other tokens.
- **AdLib-only games** need no token: `sbtype` is irrelevant, they use the OPL chip either way. There is
  deliberately no `adlib` token.
- **Mouse not working?** Nothing to set here — DOSBox reads the host mouse; a game may still need its own
  mouse driver invoked from a second target (`"preCommands": ["MOUSE.COM"]` is not whitelisted, so launch the
  game's loader instead).

## Multi-target carts

A target exists to reach a program other than the game: the sound setup, a graphics setup, a benchmark, a
level editor.

```json
{
    "id": "setup",
    "label": "Sound setup",
    "executable": "SETUP.EXE",
    "workingDir": "SOUND",
    "preCommands": ["cd SNDDRV", "set BLASTER=A220 I7 D1 H5 T6"]
}
```

Keep `setup` out of `default` so the main Run button never drops the user into a configuration screen. The
app's dropdown lists every target with its executable as a subtitle, which is what distinguishes two targets
both labelled "Setup".

## Launch shapes that need more than an executable

| Situation | How to express it |
| --- | --- |
| Game in a subdirectory | `workingDir: "GAME"`, `executable: "GAME.EXE"` |
| Loader must run from the root | `preCommands: ["cd .."]` is refused (escapes `Program/`); instead put the loader at `Program/` root |
| Needs expanded memory | `extra: { "dos.ems": "true" }` — or leave it to the DOSBox default |
| Floppy/CD image | put the image in `Program/` and use `preCommands: ["imgmount D GAME.ISO -t cdrom"]`, then `executable` from `D:` is not possible — the image is a *DOS* drive, so the game's own launcher must run first |
| Wants a specific output mode | `extra: { "sdl.output": "texture" }`, `extra: { "render.aspect": "false" }` |

Because `executable` must live inside `Program/`, an image-only program starts through a loader that is
itself on disk (a `.BAT` that the image provides, or the installer). If the program exists only inside the
image, make it a second cart or ask the user to extract it.

## What the app checks before launching

`Config/launch.json` is re-validated at launch, not only at import: ids, labels, `executable` existence,
`workingDir`, profiles, `preCommands`. A failure disables the Run button and names the field, e.g.
`targets[1].executable: file not found: Program/SETUP.EXE`. Fix the JSON in
`installed/<id>/Config/launch.json`; the app picks it up on the next launch and the change shows up as an
unexported local change until the cart is exported again.

## Compatibility notes

DOSBox 0.74-3 is the reference implementation; DOSBox Staging and DOSBox-X are supported on a best-effort
basis. Retrium only writes keys that all three accept, plus whatever you put in `extra`. If a version probe
fails, the launch still proceeds and the generated conf records `unknown` in its header comment. A user's own
`dosbox.conf` is never read — `-noconfig` guarantees that — so results are reproducible across machines.

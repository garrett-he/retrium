# DOSBox configuration for Retrium carts

Load this reference when writing or debugging `.retrium/dosbox.conf`. The starter file in
`assets/cart-template/.retrium/dosbox.conf` is based on a working Retrium example (DOSBox 0.74-3 style).

## How Retrium uses the config

Retrium starts DOSBox with the program directory as the current working directory and, when the file exists,
`-conf <program-dir>/.retrium/dosbox.conf`. There is no global config injection and no automatic mount:
everything needed to reach the executable belongs in `[autoexec]`.

## Key sections

| Section | Important keys | Guidance |
| --- | --- | --- |
| `[sdl]`, `[render]` | `fullscreen`, `windowresolution`, `output`, `scaler`, `aspect` | Start with `fullscreen=false`, `output=surface`, `scaler=normal2x`, `aspect=false`. |
| `[dosbox]` | `machine`, `memsize`, `captures` | `machine=svga_s3` suits most early-90s games; use `machine=vga` for earlier titles. `memsize=16` matches the sample; raise for games that require more conventional memory. |
| `[cpu]` | `core`, `cputype`, `cycles` | `core=auto`, `cycles=max` works for most titles. Use a fixed value (e.g. `cycles=3000`) or `cputype=pentium_slow` for games that run too fast. |
| `[mixer]`, `[sblaster]`, `[speaker]`, `[midi]`, `[gus]` | sound device settings | Keep `sbtype=sb16`, `irq=7`, `dma=1` and `pcspeaker=true` unless the title needs a specific card. |
| `[dos]` | `xms`, `ems`, `umb`, `keyboardlayout` | Defaults in the template are safe for most programs. |
| `[autoexec]` | mount and launch commands | Required in practice; see below. |

## `[autoexec]` patterns

Mount the program directory as a drive, switch to it, then start the executable:

```ini
[autoexec]
MOUNT C .
C:
SAN486.COM
```

Common variations:

- Executable in a subfolder: `MOUNT C .` then `CD \GAME` then `GAME.EXE`.
- Batch-file launcher: replace the executable line with `PLAY.BAT`.
- Floppy image bundled with the program: `IMGMOUNT A DISK.IMG -t floppy` then `A:` then the executable.
- CD-ROM image: `IMGMOUNT D GAME.CUE -t cdrom` and launch from `D:`.
- Paths with spaces: quote them, e.g. `MOUNT C "C:\Games\My Game"`. Retrium's own mount uses the relative
  `.` so this is rarely needed inside a cart.

Match the executable's filename and case exactly. On Windows DOSBox is case-insensitive, but on Linux and
macOS a wrong case fails to launch. Keep the working drive at the mounted program directory so games that
write saves there are picked up by Retrium's state watcher.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| DOSBox prompt appears | `[autoexec]` missing, no `C:` after `MOUNT C .`, launch line wrong, or executable absent. |
| "Illegal command" | Filename/case mismatch, or the executable lives in a subfolder not on the current path. |
| Game runs too fast or too slow | Change `cycles` from `max` to a fixed value, or switch `[cpu]` `core`/`cputype`. |
| No sound | Confirm `[mixer] nosound=false`, Sound Blaster settings, and that the game's setup expects SB16. |
| Graphics look wrong | Try `machine=vga` for earlier games or `machine=svga_s3` for VGA/SVGA titles. |
| Saves not restored | Game must write inside the program directory; `.retrium/` paths are excluded from state mirroring. |
| `dosbox.conf` ignored | File must be at `.retrium/dosbox.conf` inside the program folder, not at the cart root. |

## Compatibility notes

The template uses DOSBox 0.74-3 keys, which are also accepted by DOSBox Staging and DOSBox-X for common
settings. Some newer or fork-specific keys are not portable across versions; prefer conservative 0.74-style
syntax and let users tune advanced options in the app.

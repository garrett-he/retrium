# AGENTS.md

Guidance for AI coding agents working on Retrium.

## Project

Retrium is a cross-platform desktop app for organising and launching old
carts with DOSBox. It is built with Tauri 2: a Rust backend in `src-tauri/`
and a React 19 + TypeScript + MUI frontend in `src/`.

The cart format is **version 1** and is documented in
`design/CART_FORMAT_V2.md` and, for cart authors, in
`skills/retrium-cart/references/cart-format.md`. There is **no backward
compatibility**: nothing is stable before app version 1.0.0, and no migration
code is written for old carts, old libraries or old config files.

## Layout

- `src/pages/` — Library, Cart, Running, Settings and Setup pages.
- `src/components/` — app shell, sidebar, cards, menus, dialogs, icons.
- `src/hooks/useCarts.ts` — shared cart/process/launch state.
- `src/lib/api.ts` — typed wrappers around every Tauri command.
- `src/types/` — frontend types mirroring Rust structs.
- `src/__mocks__/backend.ts` — fake `invoke` with a default answer per command,
  shared by the component tests.
- `src-tauri/src/lib.rs` — app state, DTOs (`Cart`, `CartInfo`, `ImportReport`…)
  and the invoke handler.
- `src-tauri/src/commands.rs` — orchestration only; no business rules.
- `src-tauri/src/hash.rs` — `tree_hash`, the single hashing entry point.
- `src-tauri/src/manifest.rs` — `manifest.json` structure and validation.
- `src-tauri/src/launch.rs` — `launch.json` schema, validation, conf generation.
- `src-tauri/src/library.rs` — library layout, ZIP read/write, export.
- `src-tauri/src/state.rs` — the save-file difference layer.
- `src-tauri/src/import.rs` — two-phase import (analyse, then apply).
- `src-tauri/src/run.rs` — launch preparation, separated from spawning.
- `src-tauri/src/db.rs` — SQLite index (disposable, rebuilt from `carts/`).
- `src-tauri/src/config.rs` — `config.json`: library path + one DOSBox path.

## Commands

- `pnpm install` — install frontend dependencies.
- `pnpm tauri dev` — run the app (Vite on port 1620).
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` / `pnpm format` — Biome lint / format.
- `pnpm test` — Vitest suite; coverage thresholds are 80%.
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `just check`, `just test` mirror the common workflows (`just test` runs the
  Rust suite; `just coverage` adds `cargo tarpaulin`, which needs Linux).

Run `pnpm typecheck`, `pnpm lint`, `pnpm test` for frontend changes and
`cargo clippy` plus `cargo test` for Rust changes before reporting completion.

## Conventions

- Biome: 4-space indent, 120 columns, double quotes, semicolons. Do not fight it.
- Use the `@/` alias for imports from `src/`; components are function components.
- Rust code must pass rustfmt and clippy with warnings denied. Commands return
  `Result<T, String>`; validation errors from the format layer use
  `FieldError { path, message }` so the UI can point at a field.
- Keep `src/lib/api.ts`, `src-tauri/src/lib.rs` (invoke handler) and the command
  functions in `commands.rs` in sync when adding or renaming commands.
- Tests live next to sources (`*.test.tsx`, `#[cfg(test)]` modules in Rust).
- Avoid new dependencies unless the task clearly requires them.
- Only commit, tag or publish a release when explicitly asked; use Conventional
  Commit messages (`fix:`, `feat:`, `chore:`, `docs:`).

## Data model

- `<library>/carts/<uuid>.cart` — immutable archive. Export source and recovery
  source; never edited in place outside the atomic-rename export path.
- `<library>/installed/<uuid>/` — `Program/**` (mounted as `C:`),
  `Config/launch.json`, `Resources/cover.png`, `Runtime/**` (generated: conf,
  baseline, `running`, `State/`, `commit.json`).
- `<library>/retrium.db` — SQLite index (`carts`, `summaries`). It is
  **disposable**: a `PRAGMA user_version` mismatch drops and rebuilds both
  tables from `carts/*.cart`.
- `cart.id` is an author-chosen UUID that never changes; `cart.revision` is the
  author's version of that cart and only the export dialog writes it; the
  root-level `hash` file is the content fingerprint (`tree_hash`).
- Saves are a difference layer: `Runtime/State/**` holds only the files the
  program wrote during a managed run, computed at exit from a `stat` baseline.
  There is no file watcher.
- Export reads `installed/`, not the archive, and excludes `State/` by a
  four-row matrix (`CART_FORMAT_V2.md` §5.3). `dirty` = "the export set would
  hash differently", recomputed on demand.
- Import is two-phase: `analyze` is read-only and never resolves an upgrade,
  conflict or downgrade by itself.
- Configuration is `config.json`: `{ library, dosbox: { path } }`. One DOSBox
  per install, supplied by the user; Retrium never ships or scans for binaries.
- Never modify a user's library data outside the app's own commands.

## Versioning and release

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json` and the `retrium` entry in `src-tauri/Cargo.lock`.
2. Update the hardcoded version in `src/components/Sidebar.tsx`.
3. Commit (`chore: release X.Y.Z`) and create an annotated tag with the bare
   version, e.g. `git tag -a 1.0.0 -m "Retrium 1.0.0"`.
4. Run `pnpm tauri build`; the NSIS installer appears under
   `src-tauri/target/release/bundle/nsis/`.
5. Push `main` and the tag, then publish with
   `gh release create <tag> <installer> --title <tag> --notes "..."`.

## Tooling quirks

- `npx` and `npm exec` can fail to resolve pnpm-linked local binaries in this
  environment. Prefer `pnpm exec <tool>` or `./node_modules/.bin/<tool>`.
- Node 26 exposes an inactive experimental `localStorage` that shadows jsdom's.
  `src/test-setup.ts` restores it; do not remove that fallback.
- `cargo tarpaulin` is Linux-only; on Windows use `cargo test` and rely on the
  per-module test coverage.

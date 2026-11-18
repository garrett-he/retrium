# AGENTS.md

Guidance for AI coding agents working on Retrium.

## Project

Retrium is a cross-platform desktop app for organising and launching old
programs with DOSBox. It is built with Tauri 2: a Rust backend in `src-tauri/`
and a React 19 + TypeScript + MUI frontend in `src/`.

## Layout

- `src/pages/` — Library, Program, Running, Settings and Setup pages.
- `src/components/` — app shell, sidebar, cards, menus, icons.
- `src/hooks/usePrograms.tsx` — shared program/process/version state.
- `src/lib/api.ts` — typed wrappers around every Tauri command.
- `src/types/` — frontend types mirroring Rust structs.
- `src-tauri/src/lib.rs` — app state, shared types and the invoke handler.
- `src-tauri/src/commands.rs` — all Tauri commands, archive import/export,
  state watcher and program discovery.
- `src-tauri/src/config.rs` — config file loading/saving and migrations.

## Commands

- `pnpm install` — install frontend dependencies.
- `pnpm tauri dev` — run the app (Vite on port 1620).
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` / `pnpm format` — Biome lint / format.
- `pnpm test` — Vitest suite; coverage thresholds are 80%.
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `just check`, `just test`, `just build` mirror the common workflows.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test` for frontend changes and
`cargo clippy` plus `cargo test` for Rust changes before reporting completion.

## Conventions

- Biome: 4-space indent, 120 columns, double quotes, semicolons. Do not fight it.
- Use the `@/` alias for imports from `src/`; components are function components.
- Rust code must pass rustfmt and clippy with warnings denied. Commands return
  `Result<T, String>`; keep user-facing messages concise.
- Keep `src/lib/api.ts`, `src-tauri/src/lib.rs` (invoke handler) and the command
  functions in `commands.rs` in sync when adding or renaming commands.
- Tests live next to sources (`*.test.tsx`, `#[cfg(test)]` modules in Rust).
- Avoid new dependencies unless the task clearly requires them.
- Only commit, tag or publish a release when explicitly asked; use Conventional
  Commit messages (`fix:`, `feat:`, `chore:`, `docs:`).

## Data model

- Programs live at `<library>/programs/<id>/`.
- Metadata is `<program>/.retrium/metadata.json`; the legacy `info.json` is read
  as a fallback but must never be written. Optional `cover.png` and
  `dosbox.conf` live beside it.
- Saved states are mirrored to `<library>/states/<id>/` and restored before a run.
- Play summaries are stored at `<library>/summaries/<id>.json`.
- A program folder is called a cart; exporting writes `<id>.cart` (zip format),
  and legacy `.zip`, `.tar.gz` and `.tgz` archives can also be imported.
- Importing a cart with a single top-level folder uses that folder as the program
  directory; otherwise the archive file name is used.
- Never modify a user's library data outside the app's own commands.

## Versioning and release

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json` and the `retrium` entry in `src-tauri/Cargo.lock`.
2. Update the hardcoded version in `src/components/Sidebar.tsx` and
   `src/pages/SettingsPage.tsx`.
3. Commit (`chore: release X.Y.Z`) and create an annotated tag with the bare
   version, e.g. `git tag -a 0.2.1 -m "Retrium 0.2.1"`.
4. Run `pnpm tauri build`; the NSIS installer appears under
   `src-tauri/target/release/bundle/nsis/`.
5. Push `main` and the tag, then publish with
   `gh release create <tag> <installer> --title <tag> --notes "..."`.

## Tooling quirks

- `npx` and `npm exec` can fail to resolve pnpm-linked local binaries in this
  environment. Prefer `pnpm exec <tool>` or `./node_modules/.bin/<tool>`.
- Node 26 exposes an inactive experimental `localStorage` that shadows jsdom's.
  `src/test-setup.ts` restores it; do not remove that fallback.
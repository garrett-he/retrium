#!/usr/bin/env python3
"""Validate a Retrium cart: format version 1 (`.cart` archive or cart folder).

Usage:
    python validate_cart.py <path-to-.cart-or-cart-folder> [--quiet] [--write-hash]

`--write-hash` recomputes the root `hash` file. On a staged folder it writes the
file (the last step before zipping); on an archive it only prints the value,
because the archive itself is immutable.

The checks mirror `src-tauri/src/library.rs` (layout, `hash`, safety limits),
`src-tauri/src/manifest.rs` (identity and metadata) and
`src-tauri/src/launch.rs` (targets, profiles, referenced files). The hash
algorithm is the same one `src-tauri/src/hash.rs` implements; the golden
vectors in `design/fixtures/hash-vectors.json` are checked on every run so the
two implementations cannot drift apart silently. A copy of that file ships
next to this script (`../fixtures/hash-vectors.json`) so an installed skill can
still check itself without a checkout of the repository.

Exit status is 0 when no errors were found, 1 otherwise. Warnings do not affect
the exit status but are printed for review.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
import uuid
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath

MANIFEST_VERSION = 1
HASH_ENTRY = "hash"
MANIFEST_ENTRY = "manifest.json"
LAUNCH_ENTRY = "Config/launch.json"
COVER_ENTRY = "Resources/cover.png"
ROOT_ALLOWED = ("hash", "manifest.json", "Program", "Config", "Resources")

MAX_ENTRIES = 100_000
MAX_TOTAL_BYTES = 16 * 1024**3

CATEGORIES = (
    "game",
    "application",
    "utility",
    "education",
    "demo",
    "development",
    "system",
    "reference",
)

MACHINES = (
    "hercules",
    "cga_mono",
    "cga",
    "tandy",
    "pcjr",
    "ega",
    "vgaonly",
    "svga_s3",
    "svga_et3000",
    "svga_et4000",
    "svga_paradise",
    "vesa_nolfb",
    "vesa_oldvbe",
)

CORES = ("auto", "normal", "simple", "dynamic")
SB_TYPES = ("sb1", "sb2", "sbpro1", "sbpro2", "sb16", "gb")
EXTRA_SECTIONS = (
    "sdl",
    "dosbox",
    "render",
    "cpu",
    "mixer",
    "midi",
    "sblaster",
    "gus",
    "speaker",
    "joystick",
    "serial",
    "dos",
    "ipx",
)

WINDOWS_RESERVED = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{n}" for n in range(1, 10)),
    *(f"LPT{n}" for n in range(1, 10)),
}

TARGET_KEYS = {"id", "label", "executable", "arguments", "workingDir", "profile", "preCommands"}
PROFILE_KEYS = {"machine", "memsize", "cycles", "core", "sound", "extra"}

DRIVE_LETTER = re.compile(r"^[A-Za-z]:?$")
LANGUAGE_TAG = re.compile(r"^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TARGET_ID = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


class Report:
    """Errors and warnings, each with the JSON path or archive entry it applies to."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}" if where else message)

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}" if where else message)


# ---------------------------------------------------------------------------
# tree_hash
# ---------------------------------------------------------------------------


def tree_hash(entries: list[tuple[str, bytes]]) -> str:
    """`sort(u32le(len) || path || sha256(bytes))`, concatenated, SHA-256."""
    records = []
    for path, digest in entries:
        encoded = path.encode("utf-8")
        records.append(len(encoded).to_bytes(4, "little") + encoded + digest)
    records.sort()
    hasher = hashlib.sha256()
    for record in records:
        hasher.update(record)
    return hasher.hexdigest()


def vector_candidates() -> tuple[Path, Path]:
    """Return (canonical, bundled) locations of the golden vectors.

    Inside the repository the canonical file under `design/fixtures/` is what
    `hash.rs` compiles in with `include_str!`; the copy under `fixtures/` exists
    so that a skill installed on its own — with no surrounding checkout — can
    still check itself.
    """
    here = Path(__file__).resolve()
    canonical = here.parents[3] / "design" / "fixtures" / "hash-vectors.json"
    bundled = here.parents[1] / "fixtures" / "hash-vectors.json"
    return canonical, bundled


def verify_hash_vectors(report: Report) -> None:
    """Fail loudly if this implementation and `hash.rs` disagree."""
    canonical, bundled = vector_candidates()

    fixtures = canonical if canonical.is_file() else bundled
    if not fixtures.is_file():
        report.warn("hash-vectors", f"cannot find {canonical} or {bundled}; skipping the self-check")
        return
    if canonical.is_file() and bundled.is_file():
        try:
            if canonical.read_bytes() != bundled.read_bytes():
                report.warn(
                    "hash-vectors",
                    f"{bundled} differs from {canonical}; the packaged copy is stale",
                )
        except OSError as exc:
            report.warn("hash-vectors", f"cannot compare the two vector files: {exc}")

    try:
        data = json.loads(fixtures.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        report.warn("hash-vectors", f"cannot read {fixtures}: {exc}")
        return

    for case in data.get("cases", []):
        entries = []
        for entry in case.get("entries", []):
            if "content_hex" in entry:
                raw = bytes.fromhex(entry["content_hex"])
            else:
                raw = entry.get("content", "").encode("utf-8")
            entries.append((entry["path"], hashlib.sha256(raw).digest()))
        actual = tree_hash(entries)
        if actual != case["expected"]:
            report.error(
                "hash-vectors",
                f"case {case.get('name')} produced {actual}, expected {case['expected']} — "
                "this script and hash.rs no longer agree",
            )


# ---------------------------------------------------------------------------
# Cart source: an archive or a folder, read lazily
# ---------------------------------------------------------------------------


def is_safe_name(name: str) -> bool:
    if not name or name.startswith("/") or "\\" in name or ":" in name:
        return False
    for segment in name.split("/"):
        if segment in {"", ".", ".."}:
            return False
        if segment.endswith(".") or segment.endswith(" "):
            return False
        stem = segment.split(".")[0].upper()
        if stem in WINDOWS_RESERVED:
            return False
    return True


def normalize_rel(base: str, rel: str) -> str | None:
    """Resolve `rel` against `base`, returning None when it escapes the root."""
    if rel.startswith(("/", "\\")) or ":" in rel:
        return None
    parts = [part for part in base.split("/") if part and part != "."]
    for part in re.split(r"[/\\]", rel):
        if part in {"", "."}:
            continue
        if part == "..":
            if not parts:
                return None
            parts.pop()
        else:
            parts.append(part)
    return "/".join(parts)


class CartSource:
    """Uniform view over a `.cart` archive and an extracted cart folder."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.zip: zipfile.ZipFile | None = None
        self.root: Path | None = None
        self.files: list[str] = []
        self.dirs: set[str] = set()
        self.sizes: dict[str, int] = {}
        self._raw: dict[str, str] = {}

        if zipfile.is_zipfile(path):
            self.zip = zipfile.ZipFile(path)
            for info in self.zip.infolist():
                name = info.filename.replace("\\", "/").rstrip("/")
                if not name:
                    continue
                if info.is_dir():
                    self._add_dirs(name)
                    continue
                self._raw[name] = info.filename
                self.files.append(name)
                self.sizes[name] = info.file_size
                self._add_dirs(name)
        elif path.is_dir():
            self.root = path
            for item in sorted(path.rglob("*")):
                name = item.relative_to(path).as_posix()
                if item.is_dir():
                    self._add_dirs(name)
                else:
                    self.files.append(name)
                    self.sizes[name] = item.stat().st_size
                    self._add_dirs(name)
        else:
            raise ValueError(f"not a directory or a zip archive: {path}")

    def _add_dirs(self, name: str) -> None:
        parent = PurePosixPath(name).parent
        while str(parent) not in {".", "", "/"}:
            self.dirs.add(str(parent))
            parent = parent.parent

    def read(self, name: str) -> bytes:
        if self.zip is not None:
            return self.zip.read(self._raw[name])
        assert self.root is not None
        return (self.root / name).read_bytes()

    def exists(self, name: str) -> bool:
        return name in self.sizes

    def has_dir(self, name: str) -> bool:
        return name in self.dirs

    def close(self) -> None:
        if self.zip is not None:
            self.zip.close()


class FileIndex:
    """Case-insensitive lookup of the files and directories a cart contains."""

    def __init__(self, names: list[str]) -> None:
        self.files = {name.lower(): name for name in names}
        self.dirs: dict[str, str] = {}
        for name in self.files.values():
            parent = name
            while "/" in parent:
                parent = parent.rsplit("/", 1)[0]
                self.dirs.setdefault(parent.lower(), parent)

    def file(self, path: str) -> str | None:
        return self.files.get(path.lower())

    def dir(self, path: str) -> str | None:
        return self.dirs.get(path.lower())


# ---------------------------------------------------------------------------
# Layout and integrity
# ---------------------------------------------------------------------------


def check_layout(source: CartSource, report: Report) -> None:
    seen: dict[str, str] = {}
    total = 0

    roots = {name.split("/", 1)[0] for name in source.files}
    wrapper = next(
        (root for root in roots if root not in ROOT_ALLOWED and f"{root}/{MANIFEST_ENTRY}" in source.files),
        None,
    )
    if wrapper is not None:
        report.error(
            MANIFEST_ENTRY,
            f"not at the cart root (found {wrapper}/{MANIFEST_ENTRY}); a cart has no wrapper folder",
        )

    for name in sorted(source.files):
        if not is_safe_name(name):
            report.error(name, "unsafe path (absolute, drive letter, traversal or reserved name)")
            continue

        root = name.split("/", 1)[0]
        if root not in ROOT_ALLOWED and root != wrapper:
            report.error(name, f"only {', '.join(ROOT_ALLOWED)} are allowed at the archive root")

        key = unicodedata.normalize("NFC", name).lower()
        if key in seen:
            report.error(name, f"duplicates {seen[key]} (case or Unicode normalization)")
        else:
            seen[key] = name

        total += source.sizes.get(name, 0)

    if len(source.files) > MAX_ENTRIES:
        report.error("cart", f"too many entries ({len(source.files)}, at most {MAX_ENTRIES})")
    if total > MAX_TOTAL_BYTES:
        report.error("cart", f"unpacks to {total} bytes, beyond the {MAX_TOTAL_BYTES} byte limit")

    if source.zip is not None:
        for info in source.zip.infolist():
            mode = (info.external_attr >> 16) & 0xF000
            if mode == 0xA000:
                report.error(info.filename, "symlinks are not allowed")
            if info.flag_bits & 0x1:
                report.error(info.filename, "encrypted entries are not supported")

    if wrapper is not None:
        # Everything below would be reported against paths that do not exist.
        return

    # An archive always carries its own identity. A folder is either the
    # installed copy (metadata lives in retrium.db) or a cart being assembled,
    # so `manifest.json` is optional there.
    required = [MANIFEST_ENTRY, LAUNCH_ENTRY] if source.zip is not None else [LAUNCH_ENTRY]
    for required_entry in required:
        if not source.exists(required_entry):
            if required_entry == LAUNCH_ENTRY and source.exists("dosbox.conf"):
                report.error(
                    required_entry,
                    "missing; format version 1 stores launch settings in Config/launch.json, not dosbox.conf",
                )
            else:
                report.error(required_entry, "missing from the cart")

    if source.zip is not None and not source.exists(HASH_ENTRY):
        report.error(HASH_ENTRY, "missing from the archive; every .cart carries a root-level hash file")

    if not any(name.startswith("Program/") for name in source.files):
        report.error("Program", "contains no files")

    if not source.exists(COVER_ENTRY):
        report.warn(COVER_ENTRY, "no cover; Retrium will show its placeholder art")

    for name in source.files:
        if name.split("/", 1)[0] == "Config" and name != LAUNCH_ENTRY:
            report.warn(name, "only Config/launch.json is read; this file is ignored")


def parse_hash_file(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="strict")
    value = text[:-1] if text.endswith("\n") else text
    value = value[:-1] if value.endswith("\r") else value
    if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise ValueError("must be one line of 64 lowercase hex digits")
    return value


def compute_hash(source: CartSource) -> str:
    entries = []
    for name in source.files:
        if name == HASH_ENTRY:
            continue
        entries.append((name, hashlib.sha256(source.read(name)).digest()))
    return tree_hash(entries)


def check_hash(source: CartSource, report: Report) -> None:
    if not source.exists(HASH_ENTRY):
        return
    try:
        declared = parse_hash_file(source.read(HASH_ENTRY))
    except (UnicodeDecodeError, ValueError) as exc:
        report.error(HASH_ENTRY, f"{exc}")
        return
    computed = compute_hash(source)
    if declared != computed:
        report.error(HASH_ENTRY, f"does not match the contents (expected {computed})")


# ---------------------------------------------------------------------------
# manifest.json
# ---------------------------------------------------------------------------


def load_json(source: CartSource, name: str, report: Report) -> object | None:
    if not source.exists(name):
        return None  # already reported by check_layout
    try:
        return json.loads(source.read(name).decode("utf-8-sig"))
    except UnicodeDecodeError as exc:
        report.error(name, f"is not valid UTF-8: {exc}")
    except ValueError as exc:
        report.error(name, f"is not valid JSON: {exc}")
    return None


def check_manifest(source: CartSource, report: Report) -> dict | None:
    data = load_json(source, MANIFEST_ENTRY, report)
    if data is None:
        return None
    if not isinstance(data, dict):
        report.error(MANIFEST_ENTRY, "must contain a JSON object")
        return None

    version = data.get("version")
    if isinstance(version, bool) or not isinstance(version, int):
        report.error("version", "must be an integer; this is not a Retrium cart")
        return None
    if version != MANIFEST_VERSION:
        report.error("version", f"unsupported cart version: {version} (this build reads {MANIFEST_VERSION})")
        return None

    cart = data.get("cart")
    if not isinstance(cart, dict):
        report.error("cart", "must be an object")
    else:
        check_cart_block(cart, report)

    program = data.get("program")
    if not isinstance(program, dict):
        report.error("program", "must be an object")
    else:
        check_program_block(program, report)

    return data


def check_cart_block(cart: dict, report: Report) -> None:
    identifier = cart.get("id")
    if not isinstance(identifier, str):
        report.error("cart.id", "must be a string UUID")
    else:
        try:
            parsed = uuid.UUID(identifier)
        except ValueError:
            report.error("cart.id", f"is not a UUID: {identifier}")
        else:
            if str(parsed) != identifier:
                report.error("cart.id", "must be a canonical lowercase hyphenated UUID")

    revision = cart.get("revision")
    if isinstance(revision, bool) or not isinstance(revision, int):
        report.error("cart.revision", "must be an integer")
    elif revision < 1:
        report.error("cart.revision", "must be >= 1")

    tool = cart.get("tool")
    if not isinstance(tool, dict):
        report.error("cart.tool", "must be an object with app, version and host")
    else:
        for key in ("app", "version", "host"):
            value = tool.get(key)
            if not isinstance(value, str) or not value.strip():
                report.error(f"cart.tool.{key}", "must be a non-empty string")

    created_at = cart.get("createdAt")
    if not isinstance(created_at, str):
        report.error("cart.createdAt", "must be an ISO 8601 timestamp")
    else:
        try:
            if datetime.fromisoformat(created_at.replace("Z", "+00:00")).tzinfo is None:
                raise ValueError("no timezone")
        except ValueError:
            report.error("cart.createdAt", f"is not an ISO 8601 timestamp with a timezone: {created_at}")

    author = cart.get("author")
    if author is not None:
        if not isinstance(author, dict):
            report.error("cart.author", "must be an object or absent")
        else:
            name = author.get("name")
            if not isinstance(name, str) or not name.strip():
                report.error("cart.author.name", "must be a non-empty string")
            email = author.get("email")
            if email is not None and (not isinstance(email, str) or not EMAIL.match(email)):
                report.error("cart.author.email", f"is not an email: {email!r}")


def check_program_block(program: dict, report: Report) -> None:
    name = program.get("name")
    if not isinstance(name, str) or not name.strip():
        report.error("program.name", "must be a non-empty string")

    language = program.get("language")
    if language is not None and (not isinstance(language, str) or not LANGUAGE_TAG.match(language)):
        report.error("program.language", f"must be a BCP 47 language tag, not {language!r}")

    category = program.get("category")
    if category is not None and category not in CATEGORIES:
        report.error("program.category", f"must be one of {', '.join(CATEGORIES)}")

    release = program.get("release")
    if release is not None and (isinstance(release, bool) or not isinstance(release, int)):
        report.error("program.release", "must be an integer year")

    players = program.get("players")
    if players is not None and (isinstance(players, bool) or not isinstance(players, int)):
        report.error("program.players", "must be an integer")

    tags = program.get("tags")
    if tags is not None and (not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags)):
        report.error("program.tags", "must be an array of strings")

    dos = program.get("dos")
    if dos is not None:
        if not isinstance(dos, dict):
            report.error("program.dos", "must be an object")
        else:
            version = dos.get("version")
            if version is not None and not isinstance(version, str):
                report.error("program.dos.version", "must be a string")
            inputs = dos.get("input")
            if inputs is not None and (
                not isinstance(inputs, list) or any(not isinstance(item, str) for item in inputs)
            ):
                report.error("program.dos.input", "must be an array of strings")

    external = program.get("externalIds")
    if external is not None:
        if not isinstance(external, dict):
            report.error("program.externalIds", "must be an object")
        else:
            for key, value in external.items():
                if not isinstance(value, str):
                    report.error(f"program.externalIds.{key}", "must be a string")
                if key != key.lower() or not re.fullmatch(r"[a-z0-9_-]+", key):
                    report.error(f"program.externalIds.{key}", "keys must be lowercase")


# ---------------------------------------------------------------------------
# Config/launch.json
# ---------------------------------------------------------------------------


def check_launch(source: CartSource, index: FileIndex, report: Report) -> dict | None:
    data = load_json(source, LAUNCH_ENTRY, report)
    if data is None:
        return None
    if not isinstance(data, dict):
        report.error(LAUNCH_ENTRY, "must contain a JSON object")
        return None

    version = data.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version != 1:
        report.error("Config/launch.json version", "must be the integer 1")

    for key in sorted(set(data) - {"version", "default", "targets", "profiles"}):
        report.error(f"Config/launch.json {key}", "is not a launch.json field")

    targets = data.get("targets")
    if not isinstance(targets, list) or not targets:
        report.error("targets", "must be an array with at least one target")
        return None

    seen: dict[str, str] = {}
    for position, target in enumerate(targets):
        path = f"targets[{position}]"
        if not isinstance(target, dict):
            report.error(path, "must be an object")
            continue

        for key in sorted(set(target) - TARGET_KEYS):
            report.error(f"{path}.{key}", "is not a target field")

        identifier = target.get("id")
        if not isinstance(identifier, str) or not TARGET_ID.match(identifier):
            report.error(f"{path}.id", "must match ^[a-z][a-z0-9_-]{0,31}$")
        elif identifier.lower() in seen:
            report.error(f"{path}.id", f"duplicates {seen[identifier.lower()]} (ids are case-insensitive)")
        else:
            seen[identifier.lower()] = identifier

        label = target.get("label")
        if not isinstance(label, str) or not label.strip() or len(label.strip()) > 40:
            report.error(f"{path}.label", "must be 1-40 characters")

        arguments = target.get("arguments", [])
        if not isinstance(arguments, list) or any(not isinstance(arg, str) for arg in arguments):
            report.error(f"{path}.arguments", "must be an array of strings")
        else:
            for position_arg, argument in enumerate(arguments):
                if len(argument) > 260:
                    report.error(f"{path}.arguments[{position_arg}]", "must be at most 260 characters")
                if any(char in argument for char in ('"', "\n", "\t")):
                    report.error(
                        f"{path}.arguments[{position_arg}]",
                        "must not contain quotes, newlines or tabs (DOS has no escaping)",
                    )

        working_dir = target.get("workingDir", ".")
        if not isinstance(working_dir, str):
            report.error(f"{path}.workingDir", "must be a string")
            working_dir = "."
        working = normalize_rel("Program", working_dir)
        if working is None or not working.startswith("Program"):
            report.error(f"{path}.workingDir", "must be a relative path inside Program/")
            working = "Program"

        executable = target.get("executable")
        if not isinstance(executable, str) or not executable.strip():
            report.error(f"{path}.executable", "must be a non-empty string")
        else:
            resolved = normalize_rel("Program", executable)
            if resolved is None or not resolved.startswith("Program/"):
                report.error(f"{path}.executable", "must be a relative path inside Program/")
            elif index.file(resolved) is None:
                report.error(f"{path}.executable", f"file not found: {resolved}")

        profile = target.get("profile")
        if profile is not None and not isinstance(profile, str):
            report.error(f"{path}.profile", "must be a string")

        pre_commands = target.get("preCommands", [])
        if not isinstance(pre_commands, list) or any(not isinstance(cmd, str) for cmd in pre_commands):
            report.error(f"{path}.preCommands", "must be an array of strings")
        elif len(pre_commands) > 16:
            report.error(f"{path}.preCommands", "must contain at most 16 entries")
        else:
            for position_cmd, command in enumerate(pre_commands):
                message = check_pre_command(working, command, index)
                if message:
                    report.error(f"{path}.preCommands[{position_cmd}]", message)

    default = data.get("default")
    if default is not None:
        if not isinstance(default, str):
            report.error("default", "must be a target id")
        elif default not in {target.get("id") for target in targets if isinstance(target, dict)}:
            report.error("default", f"points at an unknown target: {default}")

    profiles = data.get("profiles", {})
    if not isinstance(profiles, dict):
        report.error("profiles", "must be an object")
    else:
        for name, profile in profiles.items():
            check_profile(f"profiles.{name}", profile, report)
        for position, target in enumerate(targets):
            if not isinstance(target, dict):
                continue
            referenced = target.get("profile")
            if isinstance(referenced, str) and referenced not in profiles:
                report.error(f"targets[{position}].profile", f"points at an unknown profile: {referenced}")

    return data


def check_profile(path: str, profile: object, report: Report) -> None:
    if not isinstance(profile, dict):
        report.error(path, "must be an object")
        return

    for key in sorted(set(profile) - PROFILE_KEYS):
        report.error(f"{path}.{key}", "is not a profile field")

    machine = profile.get("machine")
    if machine is not None and machine not in MACHINES:
        report.error(f"{path}.machine", f"must be one of {', '.join(MACHINES)}")

    memsize = profile.get("memsize")
    if memsize is not None:
        if isinstance(memsize, bool) or not isinstance(memsize, int):
            report.error(f"{path}.memsize", "must be an integer number of megabytes")
        elif not 1 <= memsize <= 63:
            report.error(f"{path}.memsize", "must be between 1 and 63 (megabytes)")

    core = profile.get("core")
    if core is not None and core not in CORES:
        report.error(f"{path}.core", f"must be one of {', '.join(CORES)}")

    cycles = profile.get("cycles")
    if cycles is not None and not (
        cycles in {"auto", "max"} or (isinstance(cycles, int) and not isinstance(cycles, bool))
    ):
        report.error(f"{path}.cycles", 'must be an integer, "auto" or "max"')

    sound = profile.get("sound", [])
    if not isinstance(sound, list):
        report.error(f"{path}.sound", "must be an array of tokens")
    else:
        sb_type: str | None = None
        has_gus = False
        has_none = False
        for token in sound:
            if token in SB_TYPES:
                if sb_type is not None:
                    report.error(f"{path}.sound", f"{token} conflicts with {sb_type}")
                sb_type = token
            elif token == "gus":
                has_gus = True
            elif token == "none":
                has_none = True
            else:
                report.error(
                    f"{path}.sound", f"unknown token {token!r} (expected one of {', '.join(SB_TYPES)}, gus, none)"
                )
        if has_none and (sb_type is not None or has_gus):
            report.error(f"{path}.sound", "none cannot be combined with other tokens")

    extra = profile.get("extra", {})
    if not isinstance(extra, dict):
        report.error(f"{path}.extra", "must be an object")
        return
    for key, value in extra.items():
        if "." not in key:
            report.error(f"{path}.extra.{key}", "keys must be written as section.key")
            continue
        section, name = key.split(".", 1)
        if not name:
            report.error(f"{path}.extra.{key}", "is missing a key name after the dot")
        if section not in EXTRA_SECTIONS:
            report.error(f"{path}.extra.{key}", f"unknown section {section!r}")
        if not isinstance(value, str):
            report.error(f"{path}.extra.{key}", "must be a string")
        elif any(char in value for char in ("\n", "\r", "\0", "[", "]")):
            report.error(f"{path}.extra.{key}", "value must not contain newlines, NUL or brackets")


def tokenize(command: str) -> list[str]:
    tokens: list[str] = []
    current: list[str] = []
    quoted = False
    for char in command.strip():
        if char == '"':
            quoted = not quoted
            continue
        if char.isspace() and not quoted:
            if current:
                tokens.append("".join(current))
                current = []
            continue
        current.append(char)
    if current:
        tokens.append("".join(current))
    return tokens


def check_pre_command(working: str, command: str, index: FileIndex) -> str | None:
    """Return an error message, or None when the command is inside the whitelist."""
    if any(char in command for char in "|&><"):
        return "must not contain shell redirection or pipes"

    tokens = tokenize(command)
    if not tokens:
        return "must not be empty"

    head = tokens[0].lower()
    if head == "cd":
        if len(tokens) != 2:
            return "usage: cd <directory>"
        target = normalize_rel("Program", tokens[1])
        if target is None or not target.startswith("Program"):
            return "path escapes Program/"
        if index.dir(target) is None:
            return f"directory not found: {target}"
        return None

    if head == "loadfix":
        if len(tokens) == 2:
            executable, has_flag = tokens[1], False
        elif len(tokens) == 3:
            executable, has_flag = tokens[2], True
        else:
            return "usage: loadfix [-1] <executable>"
        if has_flag and tokens[1] != "-1":
            return "loadfix only accepts -1 as an option"
        resolved = normalize_rel(working, executable)
        if resolved is None or not resolved.startswith("Program/") or index.file(resolved) is None:
            return f"file not found in Program/: {executable}"
        return None

    if head == "set":
        if len(tokens) != 2:
            return "usage: set NAME=value"
        if "=" not in tokens[1]:
            return "usage: set NAME=value"
        name, value = tokens[1].split("=", 1)
        if name.upper() not in {"BLASTER", "SOUND"}:
            return "only BLASTER and SOUND can be set"
        if any(char in value for char in (":", "\\", "/")):
            return "value must not contain a drive or path"
        return None

    if head == "imgmount":
        if len(tokens) < 3:
            return "usage: imgmount <drive> <file> [-t iso|cdrom|floppy]"
        if not DRIVE_LETTER.match(tokens[1]):
            return "first argument must be a drive letter like D or D:"
        resolved = normalize_rel("Program", tokens[2])
        if resolved is None or not resolved.startswith(("Program/", "Resources/")):
            return "file must live in Program/ or Resources/"
        if index.file(resolved) is None:
            return f"file not found: {resolved}"
        return None

    if head == "mount":
        return "MOUNT is not allowed; Program/ is mounted automatically"

    return f"command not allowed: {head}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> int:
    arguments = [arg for arg in sys.argv[1:] if not arg.startswith("-")]
    quiet = "--quiet" in sys.argv[1:]
    write_hash = "--write-hash" in sys.argv[1:]
    if len(arguments) != 1:
        print(__doc__.strip())
        return 2

    report = Report()
    verify_hash_vectors(report)

    path = Path(arguments[0]).expanduser()
    if not path.exists():
        print(f"ERROR: no such file or directory: {path}")
        return 1

    if not quiet:
        print(f"Validating: {path}")

    try:
        source = CartSource(path)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"ERROR: {exc}")
        return 1

    try:
        check_layout(source, report)
        check_hash(source, report)
        manifest = check_manifest(source, report)
        index = FileIndex(source.files)
        check_launch(source, index, report)
        computed = compute_hash(source)
    finally:
        source.close()

    if write_hash:
        if path.is_dir():
            if report.errors:
                print("Refusing to write hash: fix the errors first.")
                return 1
            (path / HASH_ENTRY).write_text(computed + "\n", encoding="utf-8")
            print(f"Wrote {HASH_ENTRY}: {computed}")
        else:
            print(f"Computed {HASH_ENTRY}: {computed}")
            print("An archive is immutable from here: to change it, rebuild the .cart.")

    if not quiet and manifest is not None:
        cart = manifest.get("cart", {})
        program = manifest.get("program", {})
        if isinstance(cart, dict) and isinstance(program, dict):
            print(f"  {program.get('name', '?')} · revision {cart.get('revision', '?')} · {cart.get('id', '?')}")

    for message in report.warnings:
        print(f"WARNING: {message}")
    for message in report.errors:
        print(f"ERROR: {message}")

    kind = "archive" if path.is_file() else "folder"
    print(f"Result: {len(report.errors)} error(s), {len(report.warnings)} warning(s) [{kind}, format version 1].")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())

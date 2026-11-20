#!/usr/bin/env python3
"""Validate a Retrium cart folder or .cart archive.

Usage:
    python validate_cart.py <path-to-cart-folder-or-.cart-file>

Exit status is 0 when no errors were found, 1 otherwise. Warnings do not
affect the exit status but are printed for review.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
EXECUTABLE_SUFFIXES = (".exe", ".com", ".bat")
NAVIGATION_COMMANDS = {"c:", "d:", "a:", "e:", "cls", "echo", "rem", "pause", "exit"}

errors: list[str] = []
warnings: list[str] = []


def error(message: str) -> None:
    errors.append(message)


def warn(message: str) -> None:
    warnings.append(message)


class Cart:
    """Read-only view of a cart stored as a folder or a zip archive."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.zip: zipfile.ZipFile | None = None
        self.root = path
        self.raw_files: dict[str, str] = {}
        self.raw_directories: set[str] = set()
        self.files: dict[str, str] = {}
        self.directories: set[str] = set()

        if zipfile.is_zipfile(path):
            self.zip = zipfile.ZipFile(path)
            for name in self.zip.namelist():
                normalized = name.replace("\\", "/")
                if normalized.endswith("/"):
                    self.raw_directories.add(normalized.rstrip("/"))
                    continue
                self.raw_files[normalized] = normalized
                parent = PurePosixPath(normalized).parent
                while str(parent) not in {".", "", "/"}:
                    self.raw_directories.add(str(parent))
                    parent = parent.parent
        elif path.is_dir():
            for item in path.rglob("*"):
                relative = str(item.relative_to(path)).replace("\\", "/")
                if item.is_file():
                    self.raw_files[relative] = relative
                elif item.is_dir():
                    self.raw_directories.add(relative)
        else:
            error(f"Path is neither a directory nor a zip archive: {path}")
            return

        self._set_root()

    def _set_root(self) -> None:
        """Keep archive paths verbatim: Retrium extracts into carts/<sha1> without stripping folders."""
        for name, raw in self.raw_files.items():
            self.files[name] = raw
        for name in self.raw_directories:
            stripped = name.rstrip("/")
            if stripped:
                self.directories.add(stripped)

    def read_bytes(self, relative: str) -> bytes:
        raw = self.files[relative]
        if self.zip is not None:
            return self.zip.read(raw)
        return (self.root / raw).read_bytes()

    def exists(self, relative: str) -> bool:
        return relative in self.files

    def has_member(self, name: str) -> bool:
        return name in self.files or name in self.directories

    def close(self) -> None:
        if self.zip is not None:
            self.zip.close()


def check_archive_layout(cart: Cart) -> None:
    if cart.zip is None:
        return
    top_level: set[str] = set()
    for name in [*cart.raw_files, *cart.raw_directories]:
        parts = PurePosixPath(name).parts
        if parts:
            top_level.add(parts[0])
    if len(top_level) == 1:
        only = next(iter(top_level))
        if any(name.startswith(f"{only}/") for name in cart.raw_files):
            warn(
                f"Zip wraps everything in a single top-level folder '{only}'. Retrium extracts verbatim "
                "into carts/<sha1>, so .retrium/ would end up one level too deep. Put cart contents at the zip root."
            )
    if not cart.exists(".retrium/metadata.json") and any(
        n.endswith("/.retrium/metadata.json") for n in cart.files
    ):
        warn("Cart contents appear nested under a wrapper folder; Retrium needs .retrium/ at the archive root.")


def check_metadata(cart: Cart) -> None:
    metadata_path = ".retrium/metadata.json"
    if not cart.exists(metadata_path):
        error("Missing .retrium/metadata.json (info.json is legacy and must not be used in new carts).")
        if cart.exists(".retrium/info.json"):
            warn("Legacy info.json found; migrate its contents into metadata.json.")
        return

    try:
        data = json.loads(cart.read_bytes(metadata_path).decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        error(f"metadata.json is not valid UTF-8 JSON: {exc}")
        return

    if not isinstance(data, dict):
        error("metadata.json must contain a JSON object.")
        return

    name = data.get("name")
    if not isinstance(name, str):
        error("metadata.json 'name' must be a string.")
    elif not name.strip():
        error("metadata.json 'name' is empty; Retrium will use the folder name instead.")

    string_fields = ("language", "category", "developer", "publisher", "series")
    for field in string_fields:
        value = data.get(field)
        if value is not None and not isinstance(value, str):
            error(f"metadata.json '{field}' must be a string or null.")

    release = data.get("release")
    if release is not None and (not isinstance(release, int) or isinstance(release, bool)):
        error("metadata.json 'release' must be an integer year or null, not a string.")

    tags = data.get("tags")
    if tags is not None:
        if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
            error("metadata.json 'tags' must be an array of strings or null.")

    for extra in sorted(set(data) - {"name", *string_fields, "release", "tags"}):
        warn(f"metadata.json contains unknown field '{extra}'; Retrium ignores it.")

    if cart.exists(".retrium/info.json"):
        warn("Legacy info.json found beside metadata.json; remove it to avoid confusion.")


def check_cover(cart: Cart) -> None:
    if cart.exists(".retrium/cover.png"):
        if not cart.read_bytes(".retrium/cover.png").startswith(PNG_SIGNATURE):
            error(".retrium/cover.png does not have a PNG signature.")
    else:
        warn("No .retrium/cover.png; Retrium will show its placeholder art.")


def check_config(cart: Cart) -> None:
    config_path = ".retrium/dosbox.conf"
    if not cart.exists(config_path):
        warn("No .retrium/dosbox.conf; DOSBox will start without -conf and the user must launch manually.")
        return

    try:
        text = cart.read_bytes(config_path).decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        error(f"dosbox.conf is not valid UTF-8 text: {exc}")
        return

    sections = set(re.findall(r"^\s*\[([^\]]+)\]", text, flags=re.MULTILINE))
    if "autoexec" not in sections:
        error("dosbox.conf has no [autoexec] section; the cart will not start automatically.")
        return

    autoexec = text.split("[autoexec]", 1)[1]
    commands = []
    for raw_line in autoexec.splitlines():
        line = raw_line.strip()
        if line and not line.startswith(("#", ";")):
            commands.append(line)

    mounts = [line for line in commands if re.match(r"(?i)^mount\s+\w+\s+", line)]
    if not mounts:
        error("[autoexec] has no MOUNT command; mount the cart directory (e.g. MOUNT C .).")
    elif not any(re.match(r"(?i)^mount\s+c\s+\.\s*$", line) for line in mounts):
        warn("[autoexec] does not contain 'MOUNT C .'; verify the mounted path and working drive.")

    launch_lines = []
    for line in commands:
        stripped = line.strip().strip('"')
        if Path(stripped).suffix.lower() in EXECUTABLE_SUFFIXES:
            launch_lines.append(stripped)

    if not launch_lines:
        error("[autoexec] has no .exe/.com/.bat launch command.")
        return

    known = {name.lower() for name in cart.files}
    for launch in launch_lines:
        candidate = launch.replace("\\", "/").lstrip("./")
        if candidate.lower() not in known:
            error(f"[autoexec] launches '{launch}', but no matching file exists in the cart.")

    for line in commands:
        head = line.split(maxsplit=1)[0].lower()
        if head in NAVIGATION_COMMANDS:
            continue
        if head in {"mount", "imgmount", "cd", "path", "set", "cls", "echo", "rem", "pause", "exit"}:
            continue
        if any(line.lower().startswith(prefix) for prefix in ("@echo", "if ", "goto ", "call ")):
            continue
        if line.strip('"').lower().endswith(EXECUTABLE_SUFFIXES):
            continue
        warn(f"Unrecognized [autoexec] command: '{line}'.")


def check_cart_files(cart: Cart) -> None:
    root_executables = [
        name
        for name in cart.files
        if "/" not in name and name.lower().endswith(EXECUTABLE_SUFFIXES)
    ]
    if not root_executables:
        nested = [name for name in cart.files if name.lower().endswith(EXECUTABLE_SUFFIXES)]
        if nested:
            warn("No executable at the cart root; nested executables require CD or a path in [autoexec].")
        else:
            error("Cart contains no .exe/.com/.bat file.")
    else:
        print(f"  Root executables: {', '.join(sorted(root_executables))}")

    for name in cart.files:
        if name.lower() in {"thumbs.db", ".ds_store"}:
            warn(f"OS metadata file included in cart: {name}")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 2

    path = Path(sys.argv[1]).expanduser()
    print(f"Validating: {path}")
    cart = Cart(path)
    if not cart.files and not cart.directories:
        cart.close()
        for message in errors:
            print(f"ERROR: {message}")
        return 1

    check_archive_layout(cart)
    check_metadata(cart)
    check_cover(cart)
    check_config(cart)
    check_cart_files(cart)
    cart.close()

    for message in warnings:
        print(f"WARNING: {message}")
    for message in errors:
        print(f"ERROR: {message}")

    print(f"Result: {len(errors)} error(s), {len(warnings)} warning(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Validate Nuvio manifests and enabled source paths without network access.

Inactive entries may be intentionally experimental and need not have source
files. All enabled entries must have safe local JavaScript sources.
"""
import json
from pathlib import Path, PurePosixPath
import sys

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "tests" / "nuvio_manifest_projects.json"
failures = []
checked = 0
enabled_total = 0

try:
    projects = json.loads(CONFIG.read_text(encoding="utf-8"))["projects"]
    if not isinstance(projects, list) or not projects:
        raise ValueError("projects must be a nonempty list")
except (OSError, ValueError, KeyError, TypeError) as exc:
    print("FAIL project configuration:", exc, file=sys.stderr)
    sys.exit(1)

for project in projects:
    manifest_file = ROOT / project / "manifest.json"
    try:
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        if not isinstance(manifest.get("name"), str) or not manifest["name"].strip():
            raise ValueError("name is required")
        if not isinstance(manifest.get("version"), str) or not manifest["version"].strip():
            raise ValueError("version is required")
        entries = manifest.get("scrapers")
        if not isinstance(entries, list) or not entries:
            raise ValueError("scrapers must be a nonempty list")

        ids = set()
        enabled = 0
        for index, scraper in enumerate(entries):
            prefix = f"scrapers[{index}]"
            if not isinstance(scraper, dict):
                raise ValueError(f"{prefix}: invalid entry")
            identifier = scraper.get("id")
            if not isinstance(identifier, str) or not identifier:
                raise ValueError(f"{prefix}: missing id")
            if identifier in ids:
                raise ValueError(f"{prefix}: duplicate id {identifier!r}")
            ids.add(identifier)
            if not isinstance(scraper.get("name"), str) or not scraper["name"].strip():
                raise ValueError(f"{prefix}: missing name")
            if not isinstance(scraper.get("version"), str) or not scraper["version"].strip():
                raise ValueError(f"{prefix}: missing version")
            if not isinstance(scraper.get("enabled"), bool):
                raise ValueError(f"{prefix}: enabled must be boolean")
            types = scraper.get("supportedTypes")
            if not isinstance(types, list) or not types or not all(
                isinstance(t, str) and t in ("movie", "tv") for t in types
            ):
                raise ValueError(f"{prefix}: unsupported media type")
            filename = scraper.get("filename")
            if not isinstance(filename, str) or not filename:
                raise ValueError(f"{prefix}: missing filename")
            # Inactive experimental probes can have nonstandard file layouts.
            if not scraper["enabled"]:
                continue
            relative = PurePosixPath(filename)
            if not filename.startswith("providers/") or relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"{prefix}: unsafe enabled source path {filename!r}")
            resolved = (manifest_file.parent / filename).resolve()
            project_root = manifest_file.parent.resolve()
            if not resolved.is_relative_to(project_root):
                raise ValueError(f"{prefix}: provider path traversal")
            if resolved.suffix != ".js" or not resolved.is_file():
                raise ValueError(f"{prefix}: enabled JS source missing: {filename}")
            enabled += 1

        checked += len(entries)
        enabled_total += enabled
        print(f"PASS {project}: {len(entries)} entries, {enabled} enabled source files")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        failures.append(f"{project}: {exc}")

for msg in failures:
    print("FAIL", msg, file=sys.stderr)
if failures:
    sys.exit(1)
print(f"PASS {len(projects)} manifests, {checked} entries, {enabled_total} enabled source files")
print("NOTE: File integrity and metadata only; no stream resolution or video playback.")

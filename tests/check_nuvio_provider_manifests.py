#!/usr/bin/env python3
"""Read-only manifest contract checks for existing Nuvio providers.

Never fetches websites or executes provider code. Reports metadata and local
file integrity only, not stream resolution or playback success.
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ("novipnoad-nuvio", "yesmovies-nuvio", "yflix-nuvio")
failures = []
files = []

for project in PROJECTS:
    path = ROOT / project / "manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        assert isinstance(manifest.get("name"), str) and manifest["name"]
        assert isinstance(manifest.get("version"), str) and manifest["version"]
        scrapers = manifest.get("scrapers")
        assert isinstance(scrapers, list) and scrapers, "missing scrapers"
        ids = set()
        for scraper in scrapers:
            identifier = scraper["id"]
            assert isinstance(identifier, str) and identifier, "invalid id"
            assert identifier not in ids, "duplicate scraper id"
            ids.add(identifier)
            assert isinstance(scraper.get("name"), str) and scraper["name"]
            assert isinstance(scraper.get("version"), str) and scraper["version"]
            assert isinstance(scraper.get("enabled"), bool), "enabled must be boolean"
            types = scraper.get("supportedTypes")
            assert isinstance(types, list) and types and all(t in ("movie", "tv") for t in types), "invalid supportedTypes"
            filename = scraper["filename"]
            assert isinstance(filename, str) and filename.startswith("providers/"), "expected project-local providers path"
            resolved = (path.parent / filename).resolve()
            assert resolved.is_relative_to(path.parent.resolve()), "path traversal"
            assert resolved.is_file() and resolved.suffix == ".js", "missing provider JS"
            files.append(resolved.relative_to(ROOT).as_posix())
        print(f"PASS {project}: {len(scrapers)} provider manifest entries")
    except (OSError, ValueError, KeyError, TypeError, AssertionError) as exc:
        failures.append(f"{project}: {exc or type(exc).__name__}")
if failures:
    for item in failures:
        print("FAIL", item, file=sys.stderr)
    sys.exit(1)
print(f"PASS metadata and local source paths: {len(files)} provider files")
print("NOTE: This does not exercise live websites, Nuvio, or video playback.")

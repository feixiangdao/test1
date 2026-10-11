#!/usr/bin/env python3
"""Read-only static smoke checks for the dedicated offline Nuvio probe."""
import json
import pathlib
import re
import sys
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[1]
manifest_path = ROOT / "novipnoad-site-diagnostic/offline-runtime/manifest.json"
source_path = ROOT / "novipnoad-site-diagnostic/offline-probe.js"
errors = []
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert isinstance(manifest.get("scrapers"), list) and len(manifest["scrapers"]) == 1
    item = manifest["scrapers"][0]
    assert item["name"] == "Offline Runtime Probe"
    assert item["supportedTypes"] == ["movie"]
    url = item["filename"]
    match = re.fullmatch(r"https://raw\.githubusercontent\.com/feixiangdao/test1/([0-9a-f]{40})/novipnoad-site-diagnostic/offline-probe\.js", url)
    assert match, "Source URL must use a pinned 40-character commit"
    source = source_path.read_text(encoding="utf-8")
    assert "module.exports" in source and "getStreams" in source
    assert "Promise.resolve" in source
    assert "fetch(" not in source and "XMLHttpRequest" not in source
    assert "require(" not in source and "child_process" not in source
    assert source.count("example.com/offline-probe-") == 2
    print("PASS: Manifest schema, pinned source URL and zero-network diagnostic source")
except (OSError, ValueError, KeyError, AssertionError, TypeError) as e:
    errors.append(str(e) or type(e).__name__)
if errors:
    print("FAIL:", "; ".join(errors), file=sys.stderr)
    sys.exit(1)
print("Note: static checks only; no Android emulator or Nuvio playback was exercised.")

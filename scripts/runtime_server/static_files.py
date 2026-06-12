from __future__ import annotations

import urllib.parse
from pathlib import Path

from . import state
from .config import APP_BASE_PATH, WEB_ROOT

BUNDLE_STATIC_PREFIXES = ("assets/", "icons/", "transcoders/")
BUNDLE_STATIC_FILES = {
    "favicon.ico",
    "game-manifest.json",
    "manifest.json",
    "sw.js",
}

GB_TITLE_FALLBACKS = {
    "assets/images/titleGb.jpg": "assets/images/title1504Gb.jpg",
}


def is_within_directory(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def normalize_app_path(path: str) -> str:
    if path == APP_BASE_PATH:
        return "/"
    if path.startswith(APP_BASE_PATH + "/"):
        stripped = path[len(APP_BASE_PATH):]
        return stripped or "/"
    return path


def choose_static_path(request_path: str) -> Path:
    parsed = urllib.parse.urlsplit(request_path)
    requested = urllib.parse.unquote(normalize_app_path(parsed.path))
    relative = requested.lstrip("/") or "index.html"
    web_root = WEB_ROOT.resolve()

    if state.ACTIVE_BUNDLE_ROOT:
        if relative in BUNDLE_STATIC_FILES or relative.startswith(BUNDLE_STATIC_PREFIXES):
            bundle_root = state.ACTIVE_BUNDLE_ROOT.resolve()
            bundle_candidate = (state.ACTIVE_BUNDLE_ROOT / relative).resolve()
            if is_within_directory(bundle_candidate, bundle_root) and bundle_candidate.exists():
                return bundle_candidate

            # Some bundles include only title1504Gb.jpg, while runtime may request titleGb.jpg.
            fallback_relative = GB_TITLE_FALLBACKS.get(relative)
            if fallback_relative:
                fallback_candidate = (state.ACTIVE_BUNDLE_ROOT / fallback_relative).resolve()
                if is_within_directory(fallback_candidate, bundle_root) and fallback_candidate.exists():
                    return fallback_candidate

    local_candidate = (WEB_ROOT / relative).resolve()
    if is_within_directory(local_candidate, web_root):
        return local_candidate

    return WEB_ROOT / "__missing__"

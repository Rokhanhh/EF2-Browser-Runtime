from __future__ import annotations

from pathlib import Path


ACTIVE_BUNDLE_ROOT: Path | None = None
ACTIVE_BUNDLE_META: dict[str, object] = {}


def set_active_bundle(root: Path | None, meta: dict[str, object]) -> None:
    global ACTIVE_BUNDLE_ROOT
    global ACTIVE_BUNDLE_META

    ACTIVE_BUNDLE_ROOT = root
    ACTIVE_BUNDLE_META = meta


def get_active_bundle_version() -> str:
    version = ACTIVE_BUNDLE_META.get("remoteVersion")
    if isinstance(version, str) and version:
        return version
    return "unknown"

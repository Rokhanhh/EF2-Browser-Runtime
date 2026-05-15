from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path
from typing import Callable

from .logging_utils import log_bundle, log_error


ACTIVE_BUNDLE_ROOT: Path | None = None
ACTIVE_BUNDLE_META: dict[str, object] = {}
ACTIVE_GAME_BUNDLE_PATH: Path | None = None
ACTIVE_GAME_BUNDLE_CHECKSUM: str = ""
ACTIVE_INDEX_JS_PATH: Path | None = None
ACTIVE_INDEX_JS_CHECKSUM: str = ""
_BUNDLE_REBUILD_LOCK = threading.Lock()


def _normalized_checksum(checksum: str) -> str:
    return checksum.split(":", 1)[1] if checksum.startswith("sha256:") else checksum


def _sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def set_active_bundle(root: Path | None, meta: dict[str, object]) -> None:
    global ACTIVE_BUNDLE_ROOT
    global ACTIVE_BUNDLE_META
    global ACTIVE_GAME_BUNDLE_PATH
    global ACTIVE_GAME_BUNDLE_CHECKSUM
    global ACTIVE_INDEX_JS_PATH
    global ACTIVE_INDEX_JS_CHECKSUM

    bundle_root_meta = meta.get("bundleRoot")
    if isinstance(bundle_root_meta, str) and bundle_root_meta:
        ACTIVE_BUNDLE_ROOT = Path(bundle_root_meta)
    else:
        ACTIVE_BUNDLE_ROOT = root
    ACTIVE_BUNDLE_META = meta

    game_bundle_path = meta.get("gameBundleZip")
    game_bundle_checksum = meta.get("gameBundleZipChecksum")
    if isinstance(game_bundle_path, str) and isinstance(game_bundle_checksum, str):
        ACTIVE_GAME_BUNDLE_PATH = Path(game_bundle_path)
        ACTIVE_GAME_BUNDLE_CHECKSUM = _normalized_checksum(game_bundle_checksum)
    else:
        ACTIVE_GAME_BUNDLE_PATH = None
        ACTIVE_GAME_BUNDLE_CHECKSUM = ""

    ACTIVE_INDEX_JS_PATH = None
    ACTIVE_INDEX_JS_CHECKSUM = ""
    active_root = ACTIVE_BUNDLE_ROOT
    if active_root:
        integrity_manifest = meta.get("mergedIntegrityManifest")
        if isinstance(integrity_manifest, dict):
            entry_path = "assets/index.js"
            try:
                manifest_path = active_root / "game-manifest.json"
                if manifest_path.exists():
                    manifest_data = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
                    manifest_entry = manifest_data.get("entry")
                    if isinstance(manifest_entry, str) and manifest_entry:
                        entry_path = manifest_entry.lstrip("/")
            except Exception:
                pass

            index_checksum = integrity_manifest.get(entry_path)
            if isinstance(index_checksum, str) and index_checksum:
                ACTIVE_INDEX_JS_PATH = active_root / entry_path
                ACTIVE_INDEX_JS_CHECKSUM = _normalized_checksum(index_checksum)


def get_active_bundle_version() -> str:
    version = ACTIVE_BUNDLE_META.get("remoteVersion")
    if isinstance(version, str) and version:
        return version
    return "unknown"


def ensure_active_bundle_integrity(rebuild_fn: Callable[[], tuple[Path | None, dict[str, object]]]) -> None:
    bundle_path = ACTIVE_GAME_BUNDLE_PATH
    expected_checksum = ACTIVE_GAME_BUNDLE_CHECKSUM
    index_path = ACTIVE_INDEX_JS_PATH
    expected_index_checksum = ACTIVE_INDEX_JS_CHECKSUM
    if (not bundle_path or not expected_checksum) and (not index_path or not expected_index_checksum):
        return

    def has_mismatch() -> bool:
        if bundle_path and expected_checksum:
            if not bundle_path.exists() or _sha256_of_file(bundle_path) != expected_checksum:
                return True
        if index_path and expected_index_checksum:
            if not index_path.exists() or _sha256_of_file(index_path) != expected_index_checksum:
                return True
        return False

    try:
        if not has_mismatch():
            return
    except Exception as error:
        log_error("BUNDLE", f"Failed checksum probe for active bundle assets: {error}")

    with _BUNDLE_REBUILD_LOCK:
        # Re-check under lock to avoid duplicate rebuilds.
        bundle_path = ACTIVE_GAME_BUNDLE_PATH
        expected_checksum = ACTIVE_GAME_BUNDLE_CHECKSUM
        index_path = ACTIVE_INDEX_JS_PATH
        expected_index_checksum = ACTIVE_INDEX_JS_CHECKSUM
        try:
            if not has_mismatch():
                return
        except Exception as error:
            log_error("BUNDLE", f"Failed locked checksum probe for active bundle assets: {error}")

        log_bundle("Detected active bundle asset checksum change; rebuilding active bundle")
        set_active_bundle(*rebuild_fn())

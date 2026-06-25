from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import PLUGINS_ROOT
from .static_files import is_within_directory


PLUGIN_ROUTE_PREFIX = "/__ef_plugins__"
PLUGIN_MANIFEST_PATH = f"{PLUGIN_ROUTE_PREFIX}/manifest.json"
PLUGIN_ID_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")


def is_valid_plugin_id(plugin_id: str) -> bool:
    return bool(plugin_id) and all(char in PLUGIN_ID_CHARS for char in plugin_id)


def read_plugin_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def normalize_entry(entry: object) -> str | None:
    if not isinstance(entry, str):
        return None
    normalized = entry.replace("\\", "/").strip().lstrip("/")
    if not normalized or normalized.startswith("../") or "/../" in normalized:
        return None
    return normalized


def discover_local_plugins() -> list[dict[str, Any]]:
    if not PLUGINS_ROOT.exists() or not PLUGINS_ROOT.is_dir():
        return []

    plugins: list[dict[str, Any]] = []
    root = PLUGINS_ROOT.resolve()
    for plugin_dir in sorted(PLUGINS_ROOT.iterdir(), key=lambda item: item.name.lower()):
        if not plugin_dir.is_dir() or not is_valid_plugin_id(plugin_dir.name):
            continue

        descriptor = read_plugin_json(plugin_dir / "plugin.json")
        if not descriptor:
            continue

        plugin_id = str(descriptor.get("id") or plugin_dir.name)
        entry = normalize_entry(descriptor.get("entry") or "plugin.js")
        enabled = descriptor.get("enabled", True)
        if not is_valid_plugin_id(plugin_id) or not entry or enabled is False:
            continue

        entry_path = (plugin_dir / entry).resolve()
        try:
            plugin_root = plugin_dir.resolve()
        except OSError:
            continue
        if not is_within_directory(entry_path, plugin_root) or not entry_path.exists() or not entry_path.is_file():
            continue
        if not is_within_directory(plugin_root, root):
            continue

        cache_token = str(int(entry_path.stat().st_mtime))
        plugins.append(
            {
                "id": plugin_id,
                "name": str(descriptor.get("name") or plugin_id),
                "entry": f"{PLUGIN_ROUTE_PREFIX}/{plugin_dir.name}/{entry}?v={cache_token}",
                "handleKey": descriptor.get("handleKey") if isinstance(descriptor.get("handleKey"), str) else None,
                "source": "local",
            }
        )

    return plugins


def build_plugins_manifest() -> dict[str, Any]:
    return {
        "version": 1,
        "plugins": discover_local_plugins(),
    }


def resolve_plugin_asset_path(request_path: str) -> Path | None:
    if not request_path.startswith(PLUGIN_ROUTE_PREFIX + "/"):
        return None
    relative = request_path.removeprefix(PLUGIN_ROUTE_PREFIX + "/")
    parts = [part for part in relative.split("/") if part]
    if len(parts) < 2 or not is_valid_plugin_id(parts[0]):
        return None

    plugin_dir = (PLUGINS_ROOT / parts[0]).resolve()
    candidate = (plugin_dir / Path(*parts[1:])).resolve()
    try:
        root = PLUGINS_ROOT.resolve()
    except OSError:
        return None
    if (
        not is_within_directory(plugin_dir, root)
        or not is_within_directory(candidate, plugin_dir)
        or not candidate.exists()
        or not candidate.is_file()
    ):
        return None
    return candidate

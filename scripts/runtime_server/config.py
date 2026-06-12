from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = ROOT / "web"
RUNTIME_ROOT = ROOT / "runtime"
BUNDLE_CACHE_ROOT = RUNTIME_ROOT / "bundles"
CONFIG_PATH = ROOT / "config.json"


def _load_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as file_obj:
        return json.load(file_obj)


def get_config() -> dict[str, Any]:
    try:
        return _load_config()
    except (OSError, json.JSONDecodeError):
        return CONFIG


def _get_section(config: dict[str, Any], key: str) -> dict[str, Any]:
    value = config.get(key, {})
    return value if isinstance(value, dict) else {}


def _get_bool(config: dict[str, Any], key: str, default: bool) -> bool:
    value = config.get(key, default)
    return value if isinstance(value, bool) else default


def _get_port(config: dict[str, Any], key: str, default: int) -> int:
    value = config.get(key, default)
    if isinstance(value, int) and 1 <= value <= 65535:
        return value
    return default


CONFIG = _load_config()

REMOTE_BASE = "https://game.endlessfrontier.io"
REMOTE_WS_ORIGIN = "ws://game.endlessfrontier.io:5001"
PROXY_PREFIX = "/__ef_proxy__"
WS_PROXY_PREFIX = "/__ef_ws_proxy__"
APP_BASE_PATH = "/endlessfrontier2"
LISTEN_PORT = _get_port(CONFIG, "listenPort", 8080)

def get_feature_flags() -> dict[str, bool]:
    features_config = _get_section(get_config(), "features")
    return {
        "showWaveTracker": _get_bool(features_config, "showWaveTracker", True),
        "showAutoSkiller": _get_bool(features_config, "showAutoSkiller", True),
    }


def get_logging_flags() -> dict[str, bool]:
    logging_config = _get_section(get_config(), "logging")
    return {
        "showRequestLogs": _get_bool(logging_config, "showRequestLogs", True),
        "showAssetRequestLogs": _get_bool(logging_config, "showAssetRequestLogs", False),
    }

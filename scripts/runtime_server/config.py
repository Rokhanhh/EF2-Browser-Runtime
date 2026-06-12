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


def _get_bool(config: dict[str, Any], key: str, default: bool) -> bool:
    value = config.get(key, default)
    return value if isinstance(value, bool) else default


def _get_port(config: dict[str, Any], key: str, default: int) -> int:
    value = config.get(key, default)
    if isinstance(value, int) and 1 <= value <= 65535:
        return value
    return default


CONFIG = _load_config()
LOGGING_CONFIG = CONFIG.get("logging", {})
if not isinstance(LOGGING_CONFIG, dict):
    LOGGING_CONFIG = {}

REMOTE_BASE = "https://game.endlessfrontier.io"
REMOTE_WS_ORIGIN = "ws://game.endlessfrontier.io:5001"
PROXY_PREFIX = "/__ef_proxy__"
WS_PROXY_PREFIX = "/__ef_ws_proxy__"
APP_BASE_PATH = "/endlessfrontier2"
LISTEN_PORT = _get_port(CONFIG, "listenPort", 8080)

SHOW_REQUEST_LOGS = _get_bool(LOGGING_CONFIG, "showRequestLogs", True)
SHOW_ASSET_REQUEST_LOGS = _get_bool(LOGGING_CONFIG, "showAssetRequestLogs", False)

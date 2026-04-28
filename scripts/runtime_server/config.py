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


def _get_int(config: dict[str, Any], key: str, default: int) -> int:
    value = config.get(key, default)
    return value if isinstance(value, int) else default


def _get_port(config: dict[str, Any], key: str, default: int) -> int:
    value = config.get(key, default)
    if isinstance(value, int) and 1 <= value <= 65535:
        return value
    return default


def _get_string_values(config: dict[str, Any], key: str) -> tuple[str, ...]:
    value = config.get(key, {})
    if not isinstance(value, dict):
        return ()
    return tuple(str(item) for item in value.values())


CONFIG = _load_config()
LOGGING_CONFIG = CONFIG.get("logging", {})
if not isinstance(LOGGING_CONFIG, dict):
    LOGGING_CONFIG = {}

REMOTE_BASE = str(CONFIG.get("remoteBase", "https://game.endlessfrontier.io"))
BUNDLE_INFO_URL_TEMPLATE = str(
    CONFIG.get(
        "bundleInfoUrlTemplate",
        "https://slime-checkinfo.s3.us-east-1.amazonaws.com/ef2_{bundle_mode}/bundle.json",
    )
)
PROXY_PREFIX = str(CONFIG.get("proxyPrefix", "/__ef_proxy__"))
WS_PROXY_PREFIX = str(CONFIG.get("wsProxyPrefix", "/__ef_ws_proxy__"))
APP_BASE_PATH = str(CONFIG.get("appBasePath", "/endlessfrontier2"))
LISTEN_PORT = _get_port(CONFIG, "listenPort", 8080)

BUNDLE_STATIC_PREFIXES = _get_string_values(CONFIG, "bundleStaticPrefixes")
BUNDLE_STATIC_FILES = set(_get_string_values(CONFIG, "bundleStaticFiles"))

SHOW_REQUEST_LOGS = _get_bool(LOGGING_CONFIG, "showRequestLogs", True)
SHOW_ASSET_REQUEST_LOGS = _get_bool(LOGGING_CONFIG, "showAssetRequestLogs", False)
SHOW_HEARTBEAT_LOGS = _get_bool(LOGGING_CONFIG, "showHeartbeatLogs", True)
HEARTBEAT_INTERVAL_SECONDS = _get_int(LOGGING_CONFIG, "heartbeatIntervalSeconds", 60)

from __future__ import annotations

import http.client
import http.server
import json
import mimetypes
import re
import select
import socket
import ssl
import urllib.parse
import threading

from . import state
from .config import (
    APP_BASE_PATH,
    PROXY_PREFIX,
    REMOTE_BASE,
    REMOTE_WS_ORIGIN,
    WS_PROXY_PREFIX,
    WEB_ROOT,
    get_game_viewport_config,
    get_logging_flags,
    get_runtime_flags,
    set_game_viewport_preset,
    set_runtime_flag,
)
from .bundle import prepare_remote_bundle
from .http2_worker import HTTP2Response, HTTP2WorkerError, request_http2_upstream, warmup_http2_upstream
from .logging_utils import log_error, log_http
from .plugins import PLUGIN_MANIFEST_PATH, PLUGIN_ROUTE_PREFIX, build_plugins_manifest, resolve_plugin_asset_path
from .static_files import choose_static_path, is_within_directory, normalize_app_path


CLIENT_DISCONNECT_ERRORS = (BrokenPipeError, ConnectionAbortedError, ConnectionResetError)
UPSTREAM_TIMEOUT_SECONDS = 15
UPSTREAM_MAX_IDLE_CONNECTIONS = 8
UPSTREAM_PRECONNECT_CONNECTIONS = 6
UPSTREAM_POOL_LOCK = threading.Lock()
UPSTREAM_POOL: dict[tuple[str, str, int], list[http.client.HTTPConnection]] = {}
UPSTREAM_HTTPS_CONTEXT = ssl.create_default_context()
FORCE_GB_INJECTION_MARKER = "__EF_FORCE_GB__"
RUNTIME_CONFIG_SCRIPT_ID = "ef-runtime-config"
WEBLOADER_SCRIPT_PATTERN = re.compile(
    r'<script\s+src=["\']\.\/(?:bootstrap\/)?webLoader\.js[^"\']*["\']>\s*</script>',
    re.IGNORECASE,
)
RUNTIME_CONFIG_SCRIPT = """
<script id="ef-runtime-config">
window.__EF_RUNTIME_CONFIG__ = __EF_RUNTIME_CONFIG_VALUE__;
</script>
""".strip()
FORCE_GB_BOOTSTRAP_SCRIPT = """
<script>
(function forceGbRuntimeMode() {
    window.__EF_FORCE_GB__ = true;
    window.krMode = "n";
    window.CapacitorCustomPlatform = { name: "android" };
})();
</script>
""".strip()
INTEGRITY_CHECK_PATHS = {"/", "/index.html", "/game-manifest.json", "/assets/index.js"}
RUNTIME_SETTINGS_PATH = "/__ef_runtime_settings__"


def is_client_disconnect(error: BaseException) -> bool:
    if isinstance(error, CLIENT_DISCONNECT_ERRORS):
        return True
    if isinstance(error, OSError):
        return getattr(error, "winerror", None) in {10053, 10054, 10058}
    return False


def close_upstream_connection(connection: http.client.HTTPConnection) -> None:
    try:
        connection.close()
    except Exception:
        pass


def build_browser_runtime_config() -> dict[str, object]:
    return {
        "remoteOrigin": REMOTE_BASE,
        "remoteWsOrigin": REMOTE_WS_ORIGIN,
        "proxyPrefix": PROXY_PREFIX,
        "wsProxyPrefix": WS_PROXY_PREFIX,
        "appBasePath": APP_BASE_PATH,
        "openAtStart": get_runtime_flags()["openAtStart"],
        "gameViewport": get_game_viewport_config(),
    }


def build_upstream_connection(scheme: str, host: str, port: int) -> http.client.HTTPConnection:
    if scheme == "https":
        return http.client.HTTPSConnection(
            host,
            port,
            timeout=UPSTREAM_TIMEOUT_SECONDS,
            context=UPSTREAM_HTTPS_CONTEXT,
        )
    return http.client.HTTPConnection(host, port, timeout=UPSTREAM_TIMEOUT_SECONDS)


def get_remote_upstream_key() -> tuple[str, str, int] | None:
    remote_base = urllib.parse.urlsplit(REMOTE_BASE)
    scheme = (remote_base.scheme or "https").lower()
    if scheme not in {"http", "https"} or not remote_base.hostname:
        return None
    port = remote_base.port or (443 if scheme == "https" else 80)
    return scheme, remote_base.hostname, port


def acquire_upstream_connection(key: tuple[str, str, int]) -> tuple[http.client.HTTPConnection, bool]:
    with UPSTREAM_POOL_LOCK:
        idle_connections = UPSTREAM_POOL.get(key)
        if idle_connections:
            return idle_connections.pop(), True
    scheme, host, port = key
    return build_upstream_connection(scheme, host, port), False


def release_upstream_connection(
    key: tuple[str, str, int],
    connection: http.client.HTTPConnection,
    reusable: bool,
) -> None:
    if not reusable:
        close_upstream_connection(connection)
        return

    with UPSTREAM_POOL_LOCK:
        idle_connections = UPSTREAM_POOL.setdefault(key, [])
        if len(idle_connections) >= UPSTREAM_MAX_IDLE_CONNECTIONS:
            close_upstream_connection(connection)
            return
        idle_connections.append(connection)


def add_idle_upstream_connection(
    key: tuple[str, str, int],
    connection: http.client.HTTPConnection,
) -> bool:
    with UPSTREAM_POOL_LOCK:
        idle_connections = UPSTREAM_POOL.setdefault(key, [])
        if len(idle_connections) >= UPSTREAM_MAX_IDLE_CONNECTIONS:
            close_upstream_connection(connection)
            return False
        idle_connections.append(connection)
        return True


def start_upstream_preconnect(count: int = UPSTREAM_PRECONNECT_CONNECTIONS) -> None:
    upstream_key = get_remote_upstream_key()
    if not upstream_key or count <= 0:
        return
    scheme, host, port = upstream_key

    if scheme == "https":
        remote_base = urllib.parse.urlsplit(REMOTE_BASE)
        netloc = host
        if port != 443:
            netloc = f"{host}:{port}"
        warmup_path = remote_base.path or "/"
        warmup_url = urllib.parse.urlunsplit((scheme, netloc, warmup_path, "", ""))

        def preconnect_http2() -> None:
            try:
                response = warmup_http2_upstream(warmup_url, UPSTREAM_TIMEOUT_SECONDS)
                if response.http_version != "HTTP/2" and get_logging_flags()["showRequestLogs"]:
                    log_http(f"PROXY warmup did not negotiate HTTP/2: {response.http_version}")
            except HTTP2WorkerError as error:
                if get_logging_flags()["showRequestLogs"]:
                    log_http(f"PROXY warmup failed: {error}")

        thread = threading.Thread(target=preconnect_http2, name="upstream-http2-preconnect", daemon=True)
        thread.start()
        return

    def preconnect_one(index: int) -> None:
        connection = build_upstream_connection(*upstream_key)
        try:
            connection.connect()
            add_idle_upstream_connection(upstream_key, connection)
        except Exception:
            close_upstream_connection(connection)

    for index in range(count):
        thread = threading.Thread(target=preconnect_one, args=(index + 1,), name=f"upstream-preconnect-{index + 1}", daemon=True)
        thread.start()


class RuntimeHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self) -> None:
        self._set_runtime_cache_headers()
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        super().end_headers()

    def _set_runtime_cache_headers(self) -> None:
        request_path = urllib.parse.urlsplit(getattr(self, "path", "")).path
        if request_path.startswith(PROXY_PREFIX) or request_path.startswith(WS_PROXY_PREFIX):
            return

        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    def log_message(self, format: str, *args) -> None:
        if not get_logging_flags()["showRequestLogs"]:
            return
        super().log_message(format, *args)

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        logging_flags = get_logging_flags()
        if not logging_flags["showRequestLogs"]:
            return

        path = getattr(self, "path", "-")
        normalized_path = normalize_app_path(path) if isinstance(path, str) else path
        if (
            not logging_flags["showAssetRequestLogs"]
            and isinstance(normalized_path, str)
            and normalized_path.startswith("/assets/")
        ):
            return

        try:
            status_code = int(code)
        except Exception:
            status_code = None

        size_text = f" | {size}b" if isinstance(size, int) or (isinstance(size, str) and size.isdigit()) else ""
        method = getattr(self, "command", "-")
        code_text = str(code)
        log_http(f"{code_text} {method} {path}{size_text}", status_code)

    def log_error(self, format: str, *args) -> None:
        if not get_logging_flags()["showRequestLogs"]:
            return

        # Avoid duplicate noisy lines for common send_error() paths like 404.
        if format == "code %d, message %s":
            return

        try:
            message = format % args
        except Exception:
            message = format
        log_error("HTTP", message)

    def translate_path(self, path: str) -> str:
        return str(choose_static_path(path))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        request_path = urllib.parse.urlsplit(self.path).path
        is_app_request = request_path == APP_BASE_PATH or request_path.startswith(APP_BASE_PATH + "/")
        normalized_path = normalize_app_path(request_path)
        if self.path == APP_BASE_PATH:
            self.send_response(302)
            self.send_header("Location", f"{APP_BASE_PATH}/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if request_path == PLUGIN_MANIFEST_PATH:
            self._serve_plugins_manifest()
            return
        if request_path == RUNTIME_SETTINGS_PATH:
            self._serve_runtime_settings()
            return
        if request_path.startswith(PLUGIN_ROUTE_PREFIX + "/"):
            if self._serve_plugin_asset(request_path):
                return
            self.send_error(404, "Plugin asset not found")
            return
        if is_app_request and normalized_path in INTEGRITY_CHECK_PATHS:
            state.ensure_active_bundle_integrity(prepare_remote_bundle)
        if is_app_request and normalized_path in {"/", "/index.html"}:
            if self._serve_bootstrap_index():
                return
        if self.path.startswith(WS_PROXY_PREFIX):
            self._proxy_websocket()
            return
        if self.path.startswith(PROXY_PREFIX):
            self._proxy_request("GET")
            return
        if not is_app_request:
            self.send_error(404, "Use the configured app base path")
            return
        self._serve_static_request("GET")

    def do_HEAD(self) -> None:
        request_path = urllib.parse.urlsplit(self.path).path
        is_app_request = request_path == APP_BASE_PATH or request_path.startswith(APP_BASE_PATH + "/")
        normalized_path = normalize_app_path(request_path)
        if self.path == APP_BASE_PATH:
            self.send_response(302)
            self.send_header("Location", f"{APP_BASE_PATH}/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if request_path == PLUGIN_MANIFEST_PATH:
            self._serve_plugins_manifest(head_only=True)
            return
        if request_path == RUNTIME_SETTINGS_PATH:
            self._serve_runtime_settings(head_only=True)
            return
        if request_path.startswith(PLUGIN_ROUTE_PREFIX + "/"):
            if self._serve_plugin_asset(request_path, head_only=True):
                return
            self.send_error(404, "Plugin asset not found")
            return
        if is_app_request and normalized_path in INTEGRITY_CHECK_PATHS:
            state.ensure_active_bundle_integrity(prepare_remote_bundle)
        if is_app_request and normalized_path in {"/", "/index.html"}:
            if self._serve_bootstrap_index(head_only=True):
                return
        if self.path.startswith(PROXY_PREFIX):
            self._proxy_request("HEAD")
            return
        if not is_app_request:
            self.send_error(404, "Use the configured app base path")
            return
        self._serve_static_request("HEAD")

    def do_POST(self) -> None:
        request_path = urllib.parse.urlsplit(self.path).path
        if request_path == RUNTIME_SETTINGS_PATH:
            self._update_runtime_settings()
            return
        if self.path.startswith(PROXY_PREFIX):
            self._proxy_request("POST")
            return
        self.send_error(405, "POST only supported for proxy routes")

    def do_PUT(self) -> None:
        if self.path.startswith(PROXY_PREFIX):
            self._proxy_request("PUT")
            return
        self.send_error(405, "PUT only supported for proxy routes")

    def do_PATCH(self) -> None:
        if self.path.startswith(PROXY_PREFIX):
            self._proxy_request("PATCH")
            return
        self.send_error(405, "PATCH only supported for proxy routes")

    def do_DELETE(self) -> None:
        if self.path.startswith(PROXY_PREFIX):
            self._proxy_request("DELETE")
            return
        self.send_error(405, "DELETE only supported for proxy routes")

    def _serve_bootstrap_index(self, head_only: bool = False) -> bool:
        index_path = WEB_ROOT / "index.html"
        if not index_path.exists():
            return False

        html = index_path.read_text(encoding="utf-8")
        html = self._inject_runtime_config_script(html)
        html = self._inject_force_gb_script(html)
        payload = html.encode("utf-8")

        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if not head_only:
                self.wfile.write(payload)
            return True
        except Exception as error:
            if not is_client_disconnect(error):
                raise
            self.close_connection = True
            return True

    def _serve_plugins_manifest(self, head_only: bool = False) -> None:
        payload = json.dumps(build_plugins_manifest()).encode("utf-8")
        self._write_response(
            200,
            b"" if head_only else payload,
            {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": str(len(payload)),
            },
        )

    def _serve_runtime_settings(self, head_only: bool = False) -> None:
        settings = get_runtime_flags()
        settings["gameViewport"] = get_game_viewport_config()
        payload = json.dumps(settings).encode("utf-8")
        self._write_response(
            200,
            b"" if head_only else payload,
            {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": str(len(payload)),
            },
        )

    def _update_runtime_settings(self) -> None:
        length_text = self.headers.get("Content-Length", "0") or "0"
        try:
            length = int(length_text)
        except (TypeError, ValueError):
            self._write_response(400, b"Invalid Content-Length header", {"Content-Type": "text/plain; charset=utf-8"})
            return
        if length < 0 or length > 4096:
            self._write_response(400, b"Invalid settings payload", {"Content-Type": "text/plain; charset=utf-8"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._write_response(400, b"Invalid JSON payload", {"Content-Type": "text/plain; charset=utf-8"})
            return
        if not isinstance(payload, dict):
            self._write_response(400, b"Invalid settings payload", {"Content-Type": "text/plain; charset=utf-8"})
            return

        try:
            settings = get_runtime_flags()
            if "openAtStart" in payload:
                if not isinstance(payload.get("openAtStart"), bool):
                    self._write_response(400, b"Invalid settings payload", {"Content-Type": "text/plain; charset=utf-8"})
                    return
                settings = set_runtime_flag("openAtStart", payload["openAtStart"])
            if "gameViewportPreset" in payload:
                if not isinstance(payload.get("gameViewportPreset"), str):
                    self._write_response(400, b"Invalid settings payload", {"Content-Type": "text/plain; charset=utf-8"})
                    return
                set_game_viewport_preset(payload["gameViewportPreset"])
            settings["gameViewport"] = get_game_viewport_config()
        except ValueError as error:
            self._write_response(400, str(error).encode("utf-8"), {"Content-Type": "text/plain; charset=utf-8"})
            return

        response_payload = json.dumps(settings).encode("utf-8")
        self._write_response(200, response_payload, {"Content-Type": "application/json; charset=utf-8"})

    def _serve_plugin_asset(self, request_path: str, head_only: bool = False) -> bool:
        asset_path = resolve_plugin_asset_path(urllib.parse.unquote(request_path))
        if not asset_path:
            return False

        try:
            payload = asset_path.read_bytes()
        except OSError:
            return False

        content_type = mimetypes.guess_type(str(asset_path))[0] or "application/octet-stream"
        if asset_path.suffix == ".js":
            content_type = "text/javascript; charset=utf-8"
        elif asset_path.suffix == ".json":
            content_type = "application/json; charset=utf-8"

        self._write_response(
            200,
            b"" if head_only else payload,
            {
                "Content-Type": content_type,
                "Content-Length": str(len(payload)),
            },
        )
        return True

    def _serve_static_request(self, method: str) -> bool:
        try:
            if method == "HEAD":
                super().do_HEAD()
            else:
                super().do_GET()
            return True
        except Exception as error:
            if not is_client_disconnect(error):
                raise
            self.close_connection = True
            return False

    def _inject_runtime_config_script(self, html: str) -> str:
        if f'id="{RUNTIME_CONFIG_SCRIPT_ID}"' in html:
            return html

        script_tag = RUNTIME_CONFIG_SCRIPT.replace(
            "__EF_RUNTIME_CONFIG_VALUE__",
            json.dumps(build_browser_runtime_config()),
        ) + "\n"

        head_index = html.lower().find("<head>")
        if head_index != -1:
            insert_at = head_index + len("<head>")
            return html[:insert_at] + "\n" + script_tag + html[insert_at:]
        return script_tag + html

    def _inject_force_gb_script(self, html: str) -> str:
        if FORCE_GB_INJECTION_MARKER in html:
            return html

        script_tag = FORCE_GB_BOOTSTRAP_SCRIPT + "\n"
        match = WEBLOADER_SCRIPT_PATTERN.search(html)
        if match:
            return html[: match.start()] + script_tag + html[match.start() :]

        head_index = html.lower().find("<head>")
        if head_index != -1:
            insert_at = head_index + len("<head>")
            return html[:insert_at] + "\n" + script_tag + html[insert_at:]
        return script_tag + html

    def _write_response(
        self,
        status_code: int,
        payload: bytes,
        headers: dict[str, str] | None = None,
        upstream_headers: object | None = None,
    ) -> bool:
        try:
            self.send_response(status_code)
            if upstream_headers:
                self._copy_upstream_headers(upstream_headers, skip_content_length=True)
            has_content_length = False
            if headers:
                for header, value in headers.items():
                    if header.lower() == "content-length":
                        has_content_length = True
                    self.send_header(header, value)
            if not has_content_length:
                self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return True
        except Exception as error:
            if not is_client_disconnect(error):
                raise
            self.close_connection = True
            return False

    def _proxy_request(self, method: str) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        upstream_path = parsed.path.removeprefix(PROXY_PREFIX)
        if not upstream_path.startswith("/"):
            upstream_path = "/" + upstream_path

        if method in {"GET", "HEAD"} and self._serve_local_proxy_target(upstream_path, method):
            return

        remote_base = urllib.parse.urlsplit(REMOTE_BASE)
        scheme = (remote_base.scheme or "https").lower()
        if scheme not in {"http", "https"}:
            self._write_response(502, b"Unsupported REMOTE_BASE scheme", {"Content-Type": "text/plain; charset=utf-8"})
            return

        host = remote_base.hostname
        if not host:
            self._write_response(502, b"Invalid REMOTE_BASE host", {"Content-Type": "text/plain; charset=utf-8"})
            return

        port = remote_base.port or (443 if scheme == "https" else 80)
        upstream_selector = upstream_path
        if parsed.query:
            upstream_selector = f"{upstream_selector}?{parsed.query}"

        body = None
        length_text = self.headers.get("Content-Length", "0") or "0"
        try:
            length = int(length_text)
        except (TypeError, ValueError):
            self._write_response(400, b"Invalid Content-Length header", {"Content-Type": "text/plain; charset=utf-8"})
            return
        if length < 0:
            self._write_response(400, b"Invalid Content-Length header", {"Content-Type": "text/plain; charset=utf-8"})
            return
        if length > 0:
            body = self.rfile.read(length)

        request_headers: dict[str, str] = {}
        for header, value in self.headers.items():
            lower = header.lower()
            if lower in {"host", "origin", "referer", "connection", "content-length"}:
                continue
            request_headers[header] = value

        if scheme == "https":
            self._proxy_https_request(method, remote_base, upstream_selector, body, request_headers)
            return

        host_header = host
        if (scheme == "http" and port != 80) or (scheme == "https" and port != 443):
            host_header = f"{host}:{port}"
        request_headers["Host"] = host_header

        upstream_key = (scheme, host, port)
        last_error: Exception | None = None
        for attempt in range(2):
            if attempt == 1:
                connection = build_upstream_connection(scheme, host, port)
            else:
                connection, _ = acquire_upstream_connection(upstream_key)
            response: http.client.HTTPResponse | None = None
            reusable = False
            try:
                if connection.sock is None:
                    connection.connect()

                connection.request(method, upstream_selector, body=body, headers=request_headers)
                response = connection.getresponse()
                upstream_headers = response.getheaders()

                wrote_success = self._write_streaming_response(
                    response.status,
                    response,
                    upstream_headers=upstream_headers,
                )
                if method == "HEAD":
                    response.read()

                reusable = (
                    wrote_success
                    and connection.sock is not None
                    and not getattr(response, "will_close", True)
                )
                release_upstream_connection(upstream_key, connection, reusable)
                return
            except CLIENT_DISCONNECT_ERRORS:
                self.close_connection = True
                release_upstream_connection(upstream_key, connection, False)
                return
            except (http.client.HTTPException, OSError, ssl.SSLError, TimeoutError) as error:
                last_error = error
                release_upstream_connection(upstream_key, connection, False)
                if get_logging_flags()["showRequestLogs"]:
                    log_http(f"PROXY {method} {upstream_selector} attempt {attempt + 1} failed: {error}")
                if attempt == 0:
                    continue
            except Exception as error:  # pragma: no cover
                last_error = error
                release_upstream_connection(upstream_key, connection, False)
                break

        if last_error and is_client_disconnect(last_error):
            self.close_connection = True
            return
        data = str(last_error or "Upstream request failed").encode("utf-8", errors="replace")
        self._write_response(502, data, {"Content-Type": "text/plain; charset=utf-8"})

    def _proxy_https_request(
        self,
        method: str,
        remote_base: urllib.parse.SplitResult,
        upstream_selector: str,
        body: bytes | None,
        request_headers: dict[str, str],
    ) -> None:
        netloc = remote_base.hostname or ""
        port = remote_base.port or 443
        if port != 443:
            netloc = f"{netloc}:{port}"
        parsed_selector = urllib.parse.urlsplit(upstream_selector)
        upstream_url = urllib.parse.urlunsplit(
            ("https", netloc, parsed_selector.path or "/", parsed_selector.query, "")
        )

        try:
            response = request_http2_upstream(
                method,
                upstream_url,
                content=body,
                headers=request_headers,
                timeout_seconds=UPSTREAM_TIMEOUT_SECONDS,
            )
        except HTTP2WorkerError as error:
            if get_logging_flags()["showRequestLogs"]:
                log_http(f"PROXY {method} {upstream_selector} failed: {error}")
            data = str(error).encode("utf-8", errors="replace")
            self._write_response(502, data, {"Content-Type": "text/plain; charset=utf-8"})
            return

        if response.http_version != "HTTP/2":
            message = f"Upstream did not negotiate HTTP/2: {response.http_version}"
            if get_logging_flags()["showRequestLogs"]:
                log_http(f"PROXY {method} {upstream_selector} failed: {message}")
            self._write_response(502, message.encode("utf-8"), {"Content-Type": "text/plain; charset=utf-8"})
            return

        if get_logging_flags()["showRequestLogs"]:
            slow_marker = " slow" if response.elapsed_ms >= 1000 else ""
            log_http(
                f"UPSTREAM {method} {upstream_selector} "
                f"{response.status_code} {response.http_version} {response.elapsed_ms}ms{slow_marker}",
                response.status_code,
            )

        self._write_http2_response(response)

    def _serve_local_proxy_target(self, upstream_path: str, method: str) -> bool:
        bundle_root = state.ACTIVE_BUNDLE_ROOT
        if not bundle_root:
            return False

        candidate = choose_static_path(upstream_path)
        try:
            resolved_candidate = candidate.resolve()
            resolved_bundle_root = bundle_root.resolve()
        except Exception:
            return False

        if not is_within_directory(resolved_candidate, resolved_bundle_root):
            return False
        if not resolved_candidate.exists() or not resolved_candidate.is_file():
            return False

        original_path = self.path
        try:
            self.path = upstream_path
            return self._serve_static_request(method)
        finally:
            self.path = original_path

    def _proxy_websocket(self) -> None:
        self.close_connection = True
        parsed = urllib.parse.urlsplit(self.path)
        target_values = urllib.parse.parse_qs(parsed.query).get("target", [])
        target = target_values[0] if target_values else ""
        upstream = urllib.parse.urlsplit(target)

        if upstream.scheme not in {"ws", "wss"} or not upstream.hostname:
            self.send_error(400, "Missing or invalid WebSocket target")
            return

        expected_host = urllib.parse.urlsplit(REMOTE_BASE).hostname
        if expected_host and upstream.hostname != expected_host:
            self.send_error(403, "WebSocket target host is not allowed")
            return

        port = upstream.port or (443 if upstream.scheme == "wss" else 80)
        configured_ws_origin = urllib.parse.urlsplit(REMOTE_WS_ORIGIN)
        use_tls = (
            upstream.scheme == "wss"
            or port == 443
            or (
                upstream.hostname == configured_ws_origin.hostname
                and port == configured_ws_origin.port
            )
        )
        upstream_path = urllib.parse.urlunsplit(("", "", upstream.path or "/", upstream.query, ""))
        remote_base = urllib.parse.urlsplit(REMOTE_BASE)
        remote_origin = urllib.parse.urlunsplit((remote_base.scheme, upstream.hostname, "", "", ""))

        try:
            raw_socket = socket.create_connection((upstream.hostname, port), timeout=15)
            upstream_socket = (
                ssl.create_default_context().wrap_socket(raw_socket, server_hostname=upstream.hostname)
                if use_tls
                else raw_socket
            )
        except Exception as error:
            data = f"Could not connect to WebSocket upstream: {error}".encode("utf-8", errors="replace")
            self._write_response(502, data, {"Content-Type": "text/plain; charset=utf-8"})
            return

        try:
            self._send_websocket_handshake(upstream_socket, upstream, upstream_path, remote_origin)
            self._relay_websocket(upstream_socket)
        except Exception as error:
            if not is_client_disconnect(error):
                log_error("WS", str(error))
        finally:
            try:
                upstream_socket.close()
            except Exception:
                pass

    def _send_websocket_handshake(
        self,
        upstream_socket: socket.socket,
        upstream: urllib.parse.SplitResult,
        upstream_path: str,
        remote_origin: str,
    ) -> None:
        request_lines = [f"GET {upstream_path} HTTP/1.1"]
        host = upstream.netloc
        request_lines.append(f"Host: {host}")

        skipped_headers = {"host", "origin", "connection", "upgrade"}
        for header, value in self.headers.items():
            if header.lower() in skipped_headers:
                continue
            request_lines.append(f"{header}: {value}")

        request_lines.extend(
            [
                "Upgrade: websocket",
                "Connection: Upgrade",
                f"Origin: {remote_origin}",
                "",
                "",
            ]
        )
        upstream_socket.sendall("\r\n".join(request_lines).encode("iso-8859-1"))

        response = b""
        upstream_socket.settimeout(15)
        while b"\r\n\r\n" not in response:
            chunk = upstream_socket.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket upstream closed during handshake")
            response += chunk
            if len(response) > 65536:
                raise ConnectionError("WebSocket upstream handshake is too large")

        self.connection.sendall(response)
        upstream_socket.settimeout(None)

    def _relay_websocket(self, upstream_socket: socket.socket) -> None:
        sockets = [self.connection, upstream_socket]
        while True:
            readable, _, _ = select.select(sockets, [], [], 60)
            if not readable:
                continue
            for source in readable:
                data = source.recv(65536)
                if not data:
                    return
                target = upstream_socket if source is self.connection else self.connection
                target.sendall(data)

    def _write_streaming_response(
        self,
        status_code: int,
        upstream_response: object,
        upstream_headers: object | None = None,
    ) -> bool:
        try:
            has_content_length = False
            if upstream_headers:
                has_content_length = any(str(header).lower() == "content-length" for header, _ in upstream_headers)

            buffered_payload = None
            if not has_content_length and getattr(self, "command", "") != "HEAD":
                chunks = []
                while True:
                    chunk = upstream_response.read(64 * 1024)
                    if not chunk:
                        break
                    chunks.append(chunk)
                buffered_payload = b"".join(chunks)

            self.send_response(status_code)
            if upstream_headers:
                self._copy_upstream_headers(upstream_headers, skip_content_length=buffered_payload is not None)
            if buffered_payload is not None:
                self.send_header("Content-Length", str(len(buffered_payload)))
            self.end_headers()

            if getattr(self, "command", "") == "HEAD":
                return True

            if buffered_payload is not None:
                self.wfile.write(buffered_payload)
                return True

            while True:
                chunk = upstream_response.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
            return True
        except Exception as error:
            if not is_client_disconnect(error):
                raise
            self.close_connection = True
            return False

    def _write_http2_response(self, upstream_response: HTTP2Response) -> bool:
        try:
            upstream_headers = upstream_response.headers
            has_content_length = any(header.lower() == "content-length" for header, _ in upstream_headers)

            self.send_response(upstream_response.status_code)
            self._copy_upstream_headers(upstream_headers)
            if not has_content_length:
                self.send_header("Content-Length", str(len(upstream_response.content)))
            self.end_headers()

            if getattr(self, "command", "") == "HEAD":
                return True

            self.wfile.write(upstream_response.content)
            return True
        except Exception as error:
            if not is_client_disconnect(error):
                raise
            self.close_connection = True
            return False

    def _copy_upstream_headers(self, headers: object, skip_content_length: bool = False) -> bool:
        has_content_length = False
        for header, value in headers:
            lower = header.lower()
            if lower == "content-length":
                has_content_length = True
                if skip_content_length:
                    continue
            if lower in {
                "transfer-encoding",
                "connection",
                "access-control-allow-origin",
                "access-control-allow-credentials",
                "access-control-allow-methods",
                "access-control-allow-headers",
            }:
                continue
            self.send_header(header, value)
        return has_content_length

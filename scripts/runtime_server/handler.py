from __future__ import annotations

import http.client
import http.server
import json
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
    get_feature_flags,
    get_logging_flags,
)
from .bundle import prepare_remote_bundle
from .logging_utils import log_error, log_http
from .static_files import choose_static_path, is_within_directory, normalize_app_path


CLIENT_DISCONNECT_ERRORS = (BrokenPipeError, ConnectionAbortedError, ConnectionResetError)
UPSTREAM_TIMEOUT_SECONDS = 30
UPSTREAM_MAX_IDLE_CONNECTIONS = 4
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


def build_browser_runtime_config() -> dict[str, str]:
    return {
        "remoteOrigin": REMOTE_BASE,
        "remoteWsOrigin": REMOTE_WS_ORIGIN,
        "proxyPrefix": PROXY_PREFIX,
        "wsProxyPrefix": WS_PROXY_PREFIX,
        "appBasePath": APP_BASE_PATH,
        **get_feature_flags(),
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


def acquire_upstream_connection(key: tuple[str, str, int]) -> http.client.HTTPConnection:
    with UPSTREAM_POOL_LOCK:
        idle_connections = UPSTREAM_POOL.get(key)
        if idle_connections:
            return idle_connections.pop()
    scheme, host, port = key
    return build_upstream_connection(scheme, host, port)


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
        normalized_path = normalize_app_path(request_path)
        if (
            normalized_path in {"/", "/index.html", "/game-manifest.json", "/assets/index.js", "/assets/index.css"}
            or normalized_path.startswith("/bootstrap/")
        ):
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
        super().do_GET()

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
        super().do_HEAD()

    def do_POST(self) -> None:
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
            if headers:
                for header, value in headers.items():
                    self.send_header(header, value)
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

        host_header = host
        if (scheme == "http" and port != 80) or (scheme == "https" and port != 443):
            host_header = f"{host}:{port}"
        request_headers["Host"] = host_header

        upstream_key = (scheme, host, port)
        last_error: Exception | None = None
        for attempt in range(2):
            connection = build_upstream_connection(scheme, host, port) if attempt == 1 else acquire_upstream_connection(upstream_key)
            response: http.client.HTTPResponse | None = None
            reusable = False
            try:
                connection.request(method, upstream_selector, body=body, headers=request_headers)
                response = connection.getresponse()

                wrote_success = self._write_streaming_response(
                    response.status,
                    response,
                    upstream_headers=response.getheaders(),
                )
                if method == "HEAD":
                    response.read()

                reusable = (
                    wrote_success
                    and connection.sock is not None
                    and not getattr(response, "will_close", True)
                    and not self.close_connection
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
            if method == "HEAD":
                super().do_HEAD()
            else:
                super().do_GET()
            return True
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
            self.send_response(status_code)
            has_content_length = False
            if upstream_headers:
                has_content_length = self._copy_upstream_headers(upstream_headers)
            if not has_content_length:
                self.send_header("Connection", "close")
                self.close_connection = True
            self.end_headers()

            if getattr(self, "command", "") == "HEAD":
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

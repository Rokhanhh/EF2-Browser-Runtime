from __future__ import annotations

import argparse
import contextlib
import os
import signal
import socket
import socketserver
import threading
import time

from . import state
from .bundle import prepare_remote_bundle
from .config import (
    APP_BASE_PATH,
    LISTEN_PORT,
    RUNTIME_ROOT,
)
from .handler import RuntimeHandler, start_upstream_preconnect
from .logging_utils import log_credits, log_server, log_server_status


STOP_HOTKEY_TEXT = "Ctrl+Q"
STOP_HOTKEY_CHAR = "\x11"
HEARTBEAT_INTERVAL_SECONDS = 1


def format_duration(total_seconds: int) -> str:
    hours, remainder = divmod(max(0, total_seconds), 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes:02d}m {seconds:02d}s"
    if minutes:
        return f"{minutes}m {seconds:02d}s"
    return f"{seconds}s"


def build_server_url(port: int) -> str:
    app_path = APP_BASE_PATH if APP_BASE_PATH.startswith("/") else f"/{APP_BASE_PATH}"
    if not app_path.endswith("/"):
        app_path = f"{app_path}/"
    return f"http://localhost:{port}{app_path}"


def log_runtime_ready(server_url: str) -> None:
    bundle_version = state.get_active_bundle_version()
    log_server(f"Ready: {server_url}")
    log_server(f"Bundle: {bundle_version}")
    log_server(f"Press {STOP_HOTKEY_TEXT} to stop and close")


def start_server_heartbeat(started_at: float, stop_event: threading.Event) -> None:
    interval = max(1, HEARTBEAT_INTERVAL_SECONDS)

    def heartbeat_loop() -> None:
        while not stop_event.wait(interval):
            uptime = format_duration(int(time.monotonic() - started_at))
            bundle_version = state.get_active_bundle_version()
            log_server_status(f"Running | Uptime {uptime} | Bundle {bundle_version}")

    thread = threading.Thread(target=heartbeat_loop, name="server-heartbeat", daemon=True)
    thread.start()


def start_stop_hotkey_listener(stop_callback) -> None:
    if os.name != "nt":
        return

    try:
        import msvcrt
    except ImportError:
        return

    def hotkey_loop() -> None:
        while True:
            if msvcrt.kbhit():
                key = msvcrt.getwch()
                if key == STOP_HOTKEY_CHAR:
                    stop_callback()
                    return
            time.sleep(0.05)

    thread = threading.Thread(target=hotkey_loop, name="runtime-stop-hotkey", daemon=True)
    thread.start()


def main() -> None:
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    started_at = time.monotonic()
    stop_event = threading.Event()
    parser = argparse.ArgumentParser(description="Serve a minimal browser bootstrap for Endless Frontier 2.")
    parser.add_argument("port", nargs="?", type=int, default=LISTEN_PORT)
    args = parser.parse_args()

    log_credits("Endless Frontier 2 Browser Runtime | Made by Rokhan")

    RUNTIME_ROOT.mkdir(parents=True, exist_ok=True)
    state.set_active_bundle(*prepare_remote_bundle())
    start_upstream_preconnect()

    class ThreadingTCPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    class ThreadingTCPServerIPv6(ThreadingTCPServer):
        address_family = socket.AF_INET6

    with contextlib.ExitStack() as stack:
        httpd = stack.enter_context(ThreadingTCPServer(("127.0.0.1", args.port), RuntimeHandler))
        ipv6_httpd = None
        ipv6_thread = None
        if getattr(socket, "has_ipv6", False):
            try:
                ipv6_httpd = stack.enter_context(ThreadingTCPServerIPv6(("::1", args.port), RuntimeHandler))
                ipv6_thread = threading.Thread(target=ipv6_httpd.serve_forever, name="runtime-http-ipv6", daemon=True)
                ipv6_thread.start()
            except OSError as error:
                log_server(f"IPv6 loopback disabled ({error})")

        server_url = build_server_url(args.port)
        log_runtime_ready(server_url)
        start_server_heartbeat(started_at, stop_event)

        def request_stop() -> None:
            if stop_event.is_set():
                return
            stop_event.set()
            log_server("Stopping runtime...")
            try:
                httpd.shutdown()
            except Exception:
                pass

        start_stop_hotkey_listener(request_stop)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            request_stop()
        finally:
            stop_event.set()
            if ipv6_httpd:
                try:
                    ipv6_httpd.shutdown()
                except (Exception, KeyboardInterrupt):
                    pass
            try:
                httpd.shutdown()
            except (Exception, KeyboardInterrupt):
                pass
            if ipv6_thread and ipv6_thread.is_alive():
                try:
                    ipv6_thread.join(timeout=1)
                except KeyboardInterrupt:
                    pass

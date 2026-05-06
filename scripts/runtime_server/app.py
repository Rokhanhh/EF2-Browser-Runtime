from __future__ import annotations

import argparse
import contextlib
import socket
import socketserver
import threading
import time

from . import state
from .bundle import prepare_remote_bundle
from .config import (
    HEARTBEAT_INTERVAL_SECONDS,
    LISTEN_PORT,
    RUNTIME_ROOT,
    SHOW_HEARTBEAT_LOGS,
    SHOW_REQUEST_LOGS,
)
from .handler import RuntimeHandler
from .logging_utils import log_credits, log_server

def start_server_heartbeat() -> None:
    if not SHOW_HEARTBEAT_LOGS:
        return

    bundle_version = state.get_active_bundle_version()
    log_server(f"Up | Bundle {bundle_version}")

    def heartbeat_loop() -> None:
        while True:
            time.sleep(HEARTBEAT_INTERVAL_SECONDS)
            log_server("Alive")

    thread = threading.Thread(target=heartbeat_loop, name="server-heartbeat", daemon=True)
    thread.start()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve a minimal browser bootstrap for Endless Frontier 2.")
    parser.add_argument("port", nargs="?", type=int, default=LISTEN_PORT)
    args = parser.parse_args()

    log_credits("Endless Frontier 2 Browser Runtime | Made by Rokhan")

    RUNTIME_ROOT.mkdir(parents=True, exist_ok=True)
    state.set_active_bundle(*prepare_remote_bundle())

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

        log_server(f"Request logs: {'ON' if SHOW_REQUEST_LOGS else 'OFF'}")
        log_server("Press Ctrl+C to stop")
        start_server_heartbeat()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log_server("Stopping runtime...")
        finally:
            if ipv6_httpd:
                try:
                    ipv6_httpd.shutdown()
                except Exception:
                    pass
            try:
                httpd.shutdown()
            except Exception:
                pass
            if ipv6_thread and ipv6_thread.is_alive():
                ipv6_thread.join(timeout=1)

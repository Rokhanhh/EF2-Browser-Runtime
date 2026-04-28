from __future__ import annotations

import os
import sys
from datetime import datetime


ANSI_RESET = "\033[0m"
ANSI_BOLD = "\033[1m"
ANSI_GREEN = "\033[32m"
ANSI_YELLOW = "\033[33m"
ANSI_RED = "\033[31m"
ANSI_CYAN = "\033[36m"
ANSI_BLUE = "\033[34m"
ANSI_MAGENTA = "\033[35m"
ANSI_ORANGE = "\033[38;5;208m"


def enable_windows_virtual_terminal() -> bool:
    if os.name != "nt":
        return True
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)
        if handle == 0 or handle == -1:
            return False
        mode = ctypes.c_uint()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)) == 0:
            return False
        enable_vt = 0x0004
        if kernel32.SetConsoleMode(handle, mode.value | enable_vt) == 0:
            return False
        return True
    except Exception:
        return False


USE_COLORS = enable_windows_virtual_terminal() and sys.stdout.isatty()


def color_text(text: str, *codes: str) -> str:
    if not USE_COLORS:
        return text
    return "".join(codes) + text + ANSI_RESET


def build_log_prefix(channel: str, color: str) -> str:
    timestamp = datetime.now().strftime("%H:%M:%S")
    ts_text = color_text(timestamp, ANSI_CYAN)
    label = color_text(f"[{channel.upper()}]", ANSI_BOLD, color)
    return f"{ts_text} {label}"


def log_server(message: str) -> None:
    print(f"{build_log_prefix('SERVER', ANSI_CYAN)} {message}")


def log_credits(message: str) -> None:
    print(f"{build_log_prefix('CREDITS', ANSI_MAGENTA)} {message}")


def log_bundle(message: str) -> None:
    print(f"{build_log_prefix('BUNDLE', ANSI_YELLOW)} {message}")


def log_warning(channel: str, message: str) -> None:
    print(f"{build_log_prefix(channel, ANSI_YELLOW)} {message}")


def log_error(channel: str, message: str) -> None:
    print(f"{build_log_prefix(channel, ANSI_RED)} {message}")


def log_http(message: str, status_code: int | None = None) -> None:
    color = ANSI_BLUE
    if isinstance(status_code, int):
        if status_code >= 500:
            color = ANSI_RED
        elif status_code >= 400:
            color = ANSI_ORANGE
        elif status_code >= 200:
            color = ANSI_GREEN
    print(f"{build_log_prefix('HTTP', color)} {message}")

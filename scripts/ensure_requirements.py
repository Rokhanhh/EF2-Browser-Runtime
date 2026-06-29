from __future__ import annotations

import importlib.metadata
import importlib.util
import os
import re
import subprocess
import sys
from pathlib import Path


HTTPX_MIN_VERSION = (0, 28)
HTTPX_MAX_VERSION = (0, 29)
REQUIREMENTS_PATH = Path(__file__).resolve().parent / "requirements.txt"
SKIP_ENV_VAR = "EF_SKIP_REQUIREMENTS_INSTALL"


def parse_version_tuple(version: str) -> tuple[int, ...]:
    parts = []
    for part in version.split("."):
        match = re.match(r"(\d+)", part)
        if not match:
            break
        parts.append(int(match.group(1)))
    return tuple(parts)


def is_httpx_version_supported(version: str) -> bool:
    parsed = parse_version_tuple(version)
    if not parsed:
        return False
    return parsed >= HTTPX_MIN_VERSION and parsed < HTTPX_MAX_VERSION


def requirements_satisfied() -> bool:
    try:
        httpx_version = importlib.metadata.version("httpx")
    except importlib.metadata.PackageNotFoundError:
        return False

    if not is_httpx_version_supported(httpx_version):
        return False

    return importlib.util.find_spec("h2") is not None


def install_requirements() -> None:
    if not REQUIREMENTS_PATH.exists():
        raise FileNotFoundError(f"Requirements file not found: {REQUIREMENTS_PATH}")

    print(f"[runtime] Installing Python requirements from {REQUIREMENTS_PATH}")
    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "-r",
            str(REQUIREMENTS_PATH),
            "--disable-pip-version-check",
        ]
    )


def ensure_requirements() -> None:
    if os.environ.get(SKIP_ENV_VAR) == "1":
        print(f"[runtime] Skipping requirements install because {SKIP_ENV_VAR}=1")
        return

    if requirements_satisfied():
        return

    install_requirements()

    if not requirements_satisfied():
        raise RuntimeError("Python requirements installation completed, but dependencies are still unavailable")


if __name__ == "__main__":
    ensure_requirements()

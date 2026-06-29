from __future__ import annotations

from ensure_requirements import ensure_requirements


if __name__ == "__main__":
    ensure_requirements()
    from runtime_server.app import main

    main()

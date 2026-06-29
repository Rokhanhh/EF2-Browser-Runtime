# Endless Frontier 2 Browser Runtime

Local browser runtime that reproduces the Android WebView game environment for Endless Frontier 2.

This project serves a minimal local bootstrap, prepares runtime bundles, and proxies game network traffic so the game can run in a desktop browser.

It is not a standalone game distribution: gameplay assets are resolved from remote bundle metadata and cached locally at runtime.

## Quick Start

### Requirements

- Python 3.10+
- Browser with an active Google or Apple account session (required to sign in with an existing account). Firefox is recommended.

### Install dependencies

```powershell
python -m pip install -r scripts/requirements.txt
```

`run_server.bat` also installs missing Python dependencies automatically before starting the runtime.

### Run

```powershell
run_server.bat
```

### Open

```text
http://localhost:8080/endlessfrontier2/
```

When the game opens, choose **Google** or **Apple** login and sign in with the corresponding account for your existing game data.

## How It Works

- On startup, the server downloads bundle metadata (`bundle.json`).
- It validates and caches `mainBundle` and `updateBundle` ZIP files.
- It rebuilds `GameBundle.zip` under `runtime/bundles/merged/<version>/` and mounts extracted runtime files under `runtime/bundles/mounted/<version>/`.
- Static bundle content is served locally, while remote API/WebSocket traffic is proxied to avoid browser-origin issues.

## Runtime Plugins

Browser-side features such as wave tracking and auto skilling are installed through a frontend plugin runtime.

Local plugin folders can be copied into `plugins/`; each plugin folder needs a `plugin.json` descriptor and a JS entry file.

See [`plugins/README.md`](plugins/README.md) for the plugin contract, available APIs, and examples.


## Troubleshooting

- `Checksum mismatch`: clear `runtime/bundles/` and restart to force a clean re-download.
- Port already in use: change `listenPort` in `config.json` (default: `8080`).


## Legal and Usage Notice

This repository is for personal use only.

The game content, trademarks, and online services remain property of their respective owners.  
Do not use this project to redistribute proprietary assets, bypass access controls, or violate the game publisher's terms of service.

from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

from .config import BUNDLE_CACHE_ROOT
from .logging_utils import log_bundle, log_error

FORCED_BUNDLE_MODE = "live"
BUNDLE_INFO_URL_BASE = "https://slime-checkinfo.s3.us-east-1.amazonaws.com/ef2_"


def is_within_directory(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_json(url: str) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def download_file(url: str, target_path: Path) -> None:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "*/*",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response, target_path.open("wb") as output:
        shutil.copyfileobj(response, output)


def verify_checksum(path: Path, checksum: str | None) -> None:
    if not checksum:
        return
    expected = checksum.split(":", 1)[1] if checksum.startswith("sha256:") else checksum
    actual = sha256_of_file(path)
    if actual != expected:
        raise ValueError(f"Checksum mismatch for {path.name}: {actual} != {expected}")


def read_json_file(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json_file(path: Path, data: dict[str, object]) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def bundle_checksum(info: dict[str, object]) -> str:
    return str(info.get("checksum") or "")


def normalized_checksum(checksum: str | None) -> str:
    raw = str(checksum or "").strip()
    if raw.startswith("sha256:"):
        return raw.split(":", 1)[1]
    return raw


def remove_tree(path: Path) -> None:
    def on_rm_error(func, target, exc_info):  # type: ignore[no-untyped-def]
        try:
            os.chmod(target, stat.S_IWRITE)
            func(target)
        except Exception:
            pass

    for attempt in range(3):
        try:
            shutil.rmtree(path, onerror=on_rm_error)
            return
        except FileNotFoundError:
            return
        except Exception:
            if attempt == 2:
                shutil.rmtree(path, onerror=on_rm_error, ignore_errors=True)
                return
            time.sleep(0.1)


def cleanup_temp_dirs(cache_root: Path) -> None:
    if not cache_root.exists():
        return
    cache_root_resolved = cache_root.resolve()
    for temp_dir in cache_root.glob("ef2-runtime-*"):
        try:
            if not temp_dir.is_dir():
                continue
            resolved = temp_dir.resolve()
            if resolved.parent != cache_root_resolved:
                continue
            remove_tree(resolved)
        except Exception:
            continue


def cleanup_bundle_versions(
    cache_root: Path,
    main_cache_root: Path,
    update_cache_root: Path,
    merged_cache_root: Path,
    mounted_cache_root: Path,
    main_version: str,
    remote_version: str,
) -> None:
    removed = 0
    for root, keep_version in (
        (main_cache_root, main_version),
        (update_cache_root, remote_version),
        (merged_cache_root, remote_version),
        (mounted_cache_root, remote_version),
    ):
        if not root.exists():
            continue
        for version_dir in root.iterdir():
            if not version_dir.is_dir() or version_dir.name == keep_version:
                continue
            remove_tree(version_dir)
            removed += 1

    reserved_names = {"mainbundle", "updatebundle", "merged", "mounted"}
    for legacy_dir in cache_root.iterdir():
        if not legacy_dir.is_dir():
            continue
        if legacy_dir.name in reserved_names or legacy_dir.name.startswith("ef2-runtime-"):
            continue
        remove_tree(legacy_dir)
        removed += 1

    if removed:
        log_bundle(f"Cleaned old bundle cache: {removed} folder(s)")


def validate_zip_file(path: Path) -> None:
    with zipfile.ZipFile(path) as archive:
        bad_member = archive.testzip()
        if bad_member:
            raise ValueError(f"Corrupt zip member in {path.name}: {bad_member}")


def collect_directory_checksums(root_dir: Path, excluded_files: set[str] | None = None) -> dict[str, str]:
    excluded = excluded_files or set()
    checksums: dict[str, str] = {}
    for path in sorted(root_dir.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root_dir).as_posix()
        if relative in excluded:
            continue
        checksums[relative] = f"sha256:{sha256_of_file(path)}"
    return checksums


def verify_directory_checksums(root_dir: Path, expected_checksums: dict[str, str]) -> None:
    actual_checksums = collect_directory_checksums(root_dir)
    expected = dict(expected_checksums)
    # Backward-compat for older manifests that stored entries as "merged/<path>".
    if set(actual_checksums) != set(expected):
        if expected and all(path.startswith("merged/") for path in expected):
            expected = {path.removeprefix("merged/"): checksum for path, checksum in expected.items()}
    if set(actual_checksums) != set(expected):
        raise ValueError("Merged integrity manifest file set mismatch")
    for relative, expected_checksum in expected.items():
        verify_checksum(root_dir / relative, expected_checksum)


def set_tree_read_only(root_dir: Path) -> None:
    for path in root_dir.rglob("*"):
        if not path.is_file():
            continue
        try:
            mode = path.stat().st_mode
            path.chmod(mode & ~stat.S_IWRITE)
        except Exception:
            continue


def extract_game_bundle_zip(zip_path: Path, target_dir: Path) -> None:
    if target_dir.exists():
        remove_tree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_extract_zip(zip_path, target_dir)
    # Some archives may wrap all files under a single top-level "merged/" folder.
    # Flatten it so runtime static paths stay rooted at target_dir.
    merged_wrapper = target_dir / "merged"
    if merged_wrapper.is_dir():
        wrapper_items = list(merged_wrapper.iterdir())
        for item in wrapper_items:
            shutil.move(str(item), str(target_dir / item.name))
        remove_tree(merged_wrapper)


def cached_zip_is_valid(
    zip_path: Path, meta_path: Path, file_name: str, expected_remote_checksum: str | None = None
) -> dict[str, object] | None:
    if not zip_path.exists() or not meta_path.exists():
        return None

    meta = read_json_file(meta_path)
    if str(meta.get("fileName") or "") != file_name:
        return None
    if expected_remote_checksum:
        declared = normalized_checksum(str(meta.get("remoteDeclaredChecksum") or meta.get("checksum") or ""))
        expected = normalized_checksum(expected_remote_checksum)
        if declared != expected:
            return None

    verify_checksum(zip_path, str(meta.get("checksum") or ""))
    return meta


def merge_bundle_zips(main_zip_path: Path, update_zip_path: Path | None, output_zip_path: Path) -> None:
    if output_zip_path.exists():
        output_zip_path.unlink()

    update_entries: set[str] = set()
    if update_zip_path:
        with zipfile.ZipFile(update_zip_path, "r") as update_archive:
            for member in update_archive.infolist():
                if member.is_dir():
                    continue
                update_entries.add(member.filename)

    with zipfile.ZipFile(output_zip_path, "w", compression=zipfile.ZIP_DEFLATED) as out_archive:
        with zipfile.ZipFile(main_zip_path, "r") as main_archive:
            for member in main_archive.infolist():
                if member.is_dir():
                    continue
                arcname = member.filename
                if arcname in update_entries:
                    continue
                payload = main_archive.read(member)
                out_archive.writestr(arcname, payload)

        if update_zip_path:
            with zipfile.ZipFile(update_zip_path, "r") as update_archive:
                for member in update_archive.infolist():
                    if member.is_dir():
                        continue
                    arcname = member.filename
                    payload = update_archive.read(member)
                    out_archive.writestr(arcname, payload)


def recover_cached_main_bundle(
    cache_root: Path,
    main_zip_path: Path,
    bundle_info: dict[str, object],
    main_info: dict[str, object],
) -> dict[str, object] | None:
    main_file_name = str(main_info.get("fileName") or "")
    main_version = str(bundle_info.get("mainVersion") or "")
    if not main_file_name or not main_version:
        return None

    for cached_dir in sorted(cache_root.iterdir(), reverse=True):
        if not cached_dir.is_dir():
            continue
        meta_path = cached_dir / "bundle-meta.json"
        candidate_path = cached_dir / main_file_name
        if not meta_path.exists() or not candidate_path.exists():
            continue

        try:
            cached_meta = read_json_file(meta_path)
            cached_bundle_info = cached_meta.get("bundleInfo")
            if not isinstance(cached_bundle_info, dict):
                continue
            cached_main_info = cached_bundle_info.get("mainBundle")
            if not isinstance(cached_main_info, dict):
                continue
            if str(cached_bundle_info.get("mainVersion") or "") != main_version:
                continue
            if str(cached_main_info.get("fileName") or "") != main_file_name:
                continue

            verify_checksum(candidate_path, str(cached_main_info.get("checksum") or ""))
            shutil.copy2(candidate_path, main_zip_path)
            log_bundle("Using cached main bundle")
            return {
                "sourceVersion": cached_dir.name,
                "fileName": main_file_name,
                "checksum": cached_main_info.get("checksum"),
                "reason": "remote mainBundle checksum did not match CDN content",
            }
        except Exception:
            continue

    return None


def recover_legacy_bundle(
    cache_root: Path,
    target_zip_path: Path,
    bundle_info: dict[str, object],
    bundle_info_key: str,
    version_key: str,
) -> dict[str, object] | None:
    file_info = bundle_info.get(bundle_info_key)
    if not isinstance(file_info, dict):
        return None

    file_name = str(file_info.get("fileName") or "")
    version = str(bundle_info.get(version_key) or "")
    if not file_name or not version:
        return None

    for cached_dir in sorted(cache_root.iterdir(), reverse=True):
        if not cached_dir.is_dir() or cached_dir.name in {"mainbundle", "updatebundle", "merged"}:
            continue
        meta_path = cached_dir / "bundle-meta.json"
        candidate_path = cached_dir / file_name
        if not meta_path.exists() or not candidate_path.exists():
            continue

        try:
            cached_meta = read_json_file(meta_path)
            cached_bundle_info = cached_meta.get("bundleInfo")
            if not isinstance(cached_bundle_info, dict):
                continue
            cached_file_info = cached_bundle_info.get(bundle_info_key)
            if not isinstance(cached_file_info, dict):
                continue
            if str(cached_bundle_info.get(version_key) or "") != version:
                continue
            if str(cached_file_info.get("fileName") or "") != file_name:
                continue

            verify_checksum(candidate_path, bundle_checksum(cached_file_info))
            shutil.copy2(candidate_path, target_zip_path)
            log_bundle("Using legacy cached bundle")
            return {
                "source": "legacy-cache",
                "sourceVersion": cached_dir.name,
                "fileName": file_name,
                "checksum": cached_file_info.get("checksum"),
            }
        except Exception:
            continue

    return None


def ensure_cached_bundle_zip(
    cache_root: Path,
    cache_dir: Path,
    bundle_info: dict[str, object],
    bundle_info_key: str,
    version_key: str,
    bundle_mode: str,
    base_url: str,
    display_name: str,
) -> tuple[Path, dict[str, object]]:
    file_info = bundle_info[bundle_info_key]
    if not isinstance(file_info, dict):
        raise ValueError(f"Invalid {bundle_info_key} metadata")

    version = str(bundle_info.get(version_key) or "")
    file_name = str(file_info.get("fileName") or "")
    if not version or not file_name:
        raise ValueError(f"Invalid {bundle_info_key} version or file name")

    final_dir = cache_dir / version
    final_zip_path = final_dir / file_name
    meta_path = final_dir / "bundle-meta.json"
    try:
        meta = cached_zip_is_valid(final_zip_path, meta_path, file_name, bundle_checksum(file_info))
        if meta:
            log_bundle(f"Using cached {display_name}")
            return final_zip_path, meta
    except Exception:
        log_bundle(f"Cached {display_name} is invalid; rebuilding")
        remove_tree(final_dir)

    temp_dir = Path(tempfile.mkdtemp(prefix="ef2-runtime-", dir=cache_root))
    temp_zip_path = temp_dir / file_name
    try:
        recovered = recover_legacy_bundle(cache_root, temp_zip_path, bundle_info, bundle_info_key, version_key)
        if recovered:
            source = recovered
            checksum = str(recovered.get("checksum") or "")
        else:
            url = f"{base_url}/{bundle_mode}/{file_name}"
            log_bundle(f"Downloading {display_name} ({version})")
            download_file(url, temp_zip_path)
            log_bundle(f"Verifying {display_name} ({version})")
            verify_checksum(temp_zip_path, bundle_checksum(file_info))
            source = {"source": "remote"}
            checksum = bundle_checksum(file_info)

        if final_dir.exists():
            remove_tree(final_dir)
        final_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(temp_zip_path), str(final_zip_path))

        meta = {
            "source": source.get("source", "remote"),
            "version": version,
            "fileName": file_name,
            "checksum": checksum,
            "remoteDeclaredChecksum": file_info.get("checksum"),
            "bundleInfo": file_info,
        }
        if source.get("sourceVersion"):
            meta["sourceVersion"] = source["sourceVersion"]
        write_json_file(meta_path, meta)
        return final_zip_path, meta
    except ValueError:
        if bundle_info_key != "mainBundle":
            raise
        recovered = recover_cached_main_bundle(cache_root, temp_zip_path, bundle_info, file_info)
        if recovered:
            checksum = str(recovered.get("checksum") or "")
            source = {
                "source": "legacy-cache",
                "sourceVersion": recovered.get("sourceVersion"),
                "reason": recovered.get("reason"),
            }
        elif temp_zip_path.exists():
            validate_zip_file(temp_zip_path)
            checksum = f"sha256:{sha256_of_file(temp_zip_path)}"
            source = {
                "source": "remote-cdn-mismatch",
                "reason": "remote mainBundle checksum did not match downloaded CDN content",
            }
            log_bundle("Warning: CDN metadata mismatch; using verified zip content")
        else:
            raise

        if final_dir.exists():
            remove_tree(final_dir)
        final_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(temp_zip_path), str(final_zip_path))

        meta = {
            "source": source["source"],
            "version": version,
            "fileName": file_name,
            "checksum": checksum,
            "remoteDeclaredChecksum": file_info.get("checksum"),
            "bundleInfo": file_info,
            "reason": source.get("reason"),
        }
        if source.get("sourceVersion"):
            meta["sourceVersion"] = source["sourceVersion"]
        write_json_file(meta_path, meta)
        return final_zip_path, meta
    finally:
        remove_tree(temp_dir)


def safe_extract_zip(zip_path: Path, target_dir: Path) -> None:
    with zipfile.ZipFile(zip_path) as archive:
        target_root = target_dir.resolve()
        for member in archive.infolist():
            resolved = (target_dir / member.filename).resolve()
            if not is_within_directory(resolved, target_root):
                raise ValueError(f"Blocked zip traversal: {member.filename}")
        archive.extractall(target_dir)


def prepare_remote_bundle() -> tuple[Path | None, dict[str, object]]:
    bundle_mode = FORCED_BUNDLE_MODE
    bundle_info_url = f"{BUNDLE_INFO_URL_BASE}{bundle_mode}/bundle.json"
    cache_root = BUNDLE_CACHE_ROOT
    cache_root.mkdir(parents=True, exist_ok=True)
    cleanup_temp_dirs(cache_root)
    log_bundle("Loading bundle metadata")

    try:
        bundle_info = fetch_json(bundle_info_url)
    except Exception as error:
        log_error("BUNDLE", "Failed to load metadata")
        return None, {
            "source": "remote-unavailable",
            "bundleInfoUrl": bundle_info_url,
            "error": str(error),
        }

    remote_version = str(bundle_info.get("updateVersion") or bundle_info.get("mainVersion") or "0.0.0")
    main_version = str(bundle_info.get("mainVersion") or "0.0.0")
    main_cache_root = cache_root / "mainbundle"
    update_cache_root = cache_root / "updatebundle"
    merged_cache_root = cache_root / "merged"
    main_cache_root.mkdir(parents=True, exist_ok=True)
    update_cache_root.mkdir(parents=True, exist_ok=True)
    merged_cache_root.mkdir(parents=True, exist_ok=True)

    merged_dir = merged_cache_root / remote_version
    meta_path = merged_dir / "bundle-meta.json"
    mounted_cache_root = cache_root / "mounted"
    mounted_cache_root.mkdir(parents=True, exist_ok=True)
    mounted_dir = mounted_cache_root / remote_version
    if merged_dir.exists():
        log_bundle("Always rebuilding merged bundle at startup")
        remove_tree(merged_dir)

    temp_dir = Path(tempfile.mkdtemp(prefix="ef2-runtime-", dir=cache_root))
    try:
        base_url = str(bundle_info["baseUrl"]).rstrip("/")
        main_info = bundle_info["mainBundle"]
        update_info = bundle_info["updateBundle"]

        log_bundle(f"Preparing bundle {remote_version} from remote manifest")
        update_zip_path = None
        update_meta = None
        if str(update_info.get("fileName") or "") != str(main_info.get("fileName") or ""):
            update_zip_path, update_meta = ensure_cached_bundle_zip(
                cache_root,
                update_cache_root,
                bundle_info,
                "updateBundle",
                "updateVersion",
                bundle_mode,
                base_url,
                "update bundle",
            )

        main_zip_path, main_meta = ensure_cached_bundle_zip(
            cache_root,
            main_cache_root,
            bundle_info,
            "mainBundle",
            "mainVersion",
            bundle_mode,
            base_url,
            "main bundle",
        )

        if merged_dir.exists():
            remove_tree(merged_dir)
        merged_dir.mkdir(parents=True, exist_ok=True)
        game_bundle_zip = merged_dir / "GameBundle.zip"
        merge_bundle_zips(main_zip_path, update_zip_path, game_bundle_zip)
        meta = {
            "source": "remote",
            "bundleInfoUrl": bundle_info_url,
            "bundleRoot": str(merged_dir),
            "gameBundleZip": str(game_bundle_zip),
            "gameBundleZipChecksum": f"sha256:{sha256_of_file(game_bundle_zip)}",
            "remoteVersion": remote_version,
            "mainVersion": main_version,
            "bundleInfo": bundle_info,
            "mainBundleCache": {
                "path": str(main_zip_path),
                "meta": main_meta,
            },
        }
        if update_zip_path and update_meta:
            meta["updateBundleCache"] = {
                "path": str(update_zip_path),
                "meta": update_meta,
            }
        extract_game_bundle_zip(game_bundle_zip, mounted_dir)
        merged_integrity_manifest = collect_directory_checksums(mounted_dir)
        meta["mergedIntegrityManifest"] = merged_integrity_manifest
        write_json_file(meta_path, meta)
        verify_directory_checksums(mounted_dir, merged_integrity_manifest)
        set_tree_read_only(mounted_dir)
        meta["bundleRoot"] = str(mounted_dir)
        cleanup_bundle_versions(
            cache_root,
            main_cache_root,
            update_cache_root,
            merged_cache_root,
            mounted_cache_root,
            main_version,
            remote_version,
        )
        cleanup_temp_dirs(cache_root)
        log_bundle(f"Ready Bundle {remote_version}")
        return mounted_dir, meta
    except Exception as error:
        remove_tree(temp_dir)
        log_error("BUNDLE", f"Failed to prepare bundle: {error}")
        return None, {
            "source": "remote-error",
            "bundleInfoUrl": bundle_info_url,
            "remoteVersion": remote_version,
            "error": str(error),
        }

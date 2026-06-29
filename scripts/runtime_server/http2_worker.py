from __future__ import annotations

import asyncio
import concurrent.futures
import time
import threading
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class HTTP2Response:
    status_code: int
    headers: list[tuple[str, str]]
    content: bytes
    http_version: str
    elapsed_ms: int


class HTTP2WorkerError(Exception):
    pass


class HTTP2Worker:
    def __init__(self, timeout_seconds: int) -> None:
        self._timeout_seconds = timeout_seconds
        self._ready = threading.Event()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client: httpx.AsyncClient | None = None
        self._start_error: BaseException | None = None

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._ready.clear()
            self._start_error = None
            self._thread = threading.Thread(target=self._run, name="upstream-http2-worker", daemon=True)
            self._thread.start()

        if not self._ready.wait(timeout=5):
            raise HTTP2WorkerError("HTTP/2 worker did not start")
        if self._start_error:
            raise HTTP2WorkerError(f"HTTP/2 worker failed to start: {self._start_error}")

    def stop(self) -> None:
        loop = self._loop
        thread = self._thread
        if not loop or not thread:
            return
        if loop.is_running():
            loop.call_soon_threadsafe(loop.stop)
        if thread.is_alive():
            thread.join(timeout=5)

    def warmup(self, url: str) -> HTTP2Response:
        return self._submit(self._request("HEAD", url, content=None, headers={}))

    def request(
        self,
        method: str,
        url: str,
        content: bytes | None,
        headers: dict[str, str],
    ) -> HTTP2Response:
        return self._submit(self._request(method, url, content=content, headers=headers))

    def _run(self) -> None:
        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._setup())
        except BaseException as error:
            self._start_error = error
            self._ready.set()
            loop.close()
            return

        self._ready.set()
        try:
            loop.run_forever()
        finally:
            loop.run_until_complete(self._shutdown())
            loop.close()
            self._loop = None
            self._client = None

    async def _setup(self) -> None:
        self._client = httpx.AsyncClient(
            http2=True,
            timeout=self._timeout_seconds,
            limits=httpx.Limits(
                max_connections=1,
                max_keepalive_connections=1,
                keepalive_expiry=None,
            ),
        )

    async def _shutdown(self) -> None:
        if self._client:
            await self._client.aclose()

    def _submit(self, coroutine) -> HTTP2Response:
        self.start()
        if not self._loop:
            raise HTTP2WorkerError("HTTP/2 worker is not running")
        future = asyncio.run_coroutine_threadsafe(coroutine, self._loop)
        try:
            return future.result(timeout=self._timeout_seconds + 5)
        except concurrent.futures.TimeoutError as error:
            future.cancel()
            raise HTTP2WorkerError("HTTP/2 worker request timed out") from error
        except Exception as error:
            raise HTTP2WorkerError(str(error)) from error

    async def _request(
        self,
        method: str,
        url: str,
        content: bytes | None,
        headers: dict[str, str],
    ) -> HTTP2Response:
        if not self._client:
            raise HTTP2WorkerError("HTTP/2 client is not initialized")

        started_at = time.perf_counter()
        response = await self._client.request(
            method,
            url,
            content=content,
            headers=headers,
        )
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        try:
            return HTTP2Response(
                status_code=response.status_code,
                headers=list(response.headers.multi_items()),
                content=response.content,
                http_version=response.http_version,
                elapsed_ms=elapsed_ms,
            )
        finally:
            await response.aclose()


_WORKER: HTTP2Worker | None = None
_WORKER_LOCK = threading.Lock()


def start_http2_worker(timeout_seconds: int) -> None:
    global _WORKER
    with _WORKER_LOCK:
        if _WORKER is None:
            _WORKER = HTTP2Worker(timeout_seconds)
        worker = _WORKER
    worker.start()


def stop_http2_worker() -> None:
    global _WORKER
    with _WORKER_LOCK:
        worker = _WORKER
        _WORKER = None
    if worker:
        worker.stop()


def warmup_http2_upstream(url: str, timeout_seconds: int) -> HTTP2Response:
    start_http2_worker(timeout_seconds)
    if not _WORKER:
        raise HTTP2WorkerError("HTTP/2 worker is not available")
    return _WORKER.warmup(url)


def request_http2_upstream(
    method: str,
    url: str,
    content: bytes | None,
    headers: dict[str, str],
    timeout_seconds: int,
) -> HTTP2Response:
    start_http2_worker(timeout_seconds)
    if not _WORKER:
        raise HTTP2WorkerError("HTTP/2 worker is not available")
    return _WORKER.request(method, url, content=content, headers=headers)

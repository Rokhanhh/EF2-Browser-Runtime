from __future__ import annotations

import asyncio
import concurrent.futures
import time
import threading
from dataclasses import dataclass

import httpx


HTTP2_MAX_RESPONSE_BODY_BYTES = 64 * 1024 * 1024
HTTP2_MAX_CONCURRENT_REQUESTS = 16
HTTP2_KEEPALIVE_EXPIRY_SECONDS = 45
HTTP2_CONNECT_ATTEMPTS = 2


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
        self._request_semaphore: asyncio.Semaphore | None = None
        self._client_generation_lock: asyncio.Lock | None = None
        self._client_users: dict[httpx.AsyncClient, int] = {}
        self._retired_clients: set[httpx.AsyncClient] = set()
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
        return self._submit(self._warmup(url))

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
            self._request_semaphore = None
            self._client_generation_lock = None
            self._client_users.clear()
            self._retired_clients.clear()

    async def _setup(self) -> None:
        self._request_semaphore = asyncio.Semaphore(HTTP2_MAX_CONCURRENT_REQUESTS)
        self._client_generation_lock = asyncio.Lock()
        self._client = self._build_client()

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            http2=True,
            timeout=self._timeout_seconds,
            limits=httpx.Limits(
                max_connections=1,
                max_keepalive_connections=1,
                keepalive_expiry=HTTP2_KEEPALIVE_EXPIRY_SECONDS,
            ),
        )

    async def _shutdown(self) -> None:
        clients = set(self._client_users)
        clients.update(self._retired_clients)
        if self._client:
            clients.add(self._client)
        self._client = None
        self._client_users.clear()
        self._retired_clients.clear()
        if clients:
            await asyncio.gather(*(client.aclose() for client in clients), return_exceptions=True)

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
        except HTTP2WorkerError:
            raise
        except Exception as error:
            message = str(error).strip() or repr(error)
            raise HTTP2WorkerError(f"{type(error).__name__}: {message}") from error

    async def _warmup(self, url: str) -> HTTP2Response:
        if not self._request_semaphore:
            raise HTTP2WorkerError("HTTP/2 request limiter is not initialized")

        async with self._request_semaphore:
            client = self._build_client()
            try:
                return await self._request_with_client(client, "HEAD", url, content=None, headers={})
            finally:
                await client.aclose()

    async def _request(
        self,
        method: str,
        url: str,
        content: bytes | None,
        headers: dict[str, str],
    ) -> HTTP2Response:
        if not self._client:
            raise HTTP2WorkerError("HTTP/2 client is not initialized")
        if not self._request_semaphore:
            raise HTTP2WorkerError("HTTP/2 request limiter is not initialized")

        async with self._request_semaphore:
            for attempt in range(HTTP2_CONNECT_ATTEMPTS):
                client = await self._acquire_client()
                try:
                    return await self._request_with_client(client, method, url, content, headers)
                except (httpx.ConnectError, httpx.ConnectTimeout):
                    await self._retire_client(client)
                    if attempt + 1 >= HTTP2_CONNECT_ATTEMPTS:
                        raise
                except httpx.TransportError:
                    await self._retire_client(client)
                    raise
                finally:
                    await self._release_client(client)

        raise HTTP2WorkerError("HTTP/2 request attempts were exhausted")

    async def _acquire_client(self) -> httpx.AsyncClient:
        if not self._client_generation_lock:
            raise HTTP2WorkerError("HTTP/2 client lock is not initialized")
        async with self._client_generation_lock:
            client = self._client
            if not client:
                raise HTTP2WorkerError("HTTP/2 client is not initialized")
            self._client_users[client] = self._client_users.get(client, 0) + 1
            return client

    async def _release_client(self, client: httpx.AsyncClient) -> None:
        if not self._client_generation_lock:
            return
        client_to_close = None
        async with self._client_generation_lock:
            users = self._client_users.get(client, 0)
            if users <= 1:
                self._client_users.pop(client, None)
                if client in self._retired_clients:
                    self._retired_clients.remove(client)
                    client_to_close = client
            else:
                self._client_users[client] = users - 1
        if client_to_close:
            await client_to_close.aclose()

    async def _retire_client(self, client: httpx.AsyncClient) -> None:
        if not self._client_generation_lock:
            raise HTTP2WorkerError("HTTP/2 client lock is not initialized")
        async with self._client_generation_lock:
            if self._client is client:
                self._client = self._build_client()
            self._retired_clients.add(client)

    async def _request_with_client(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        content: bytes | None,
        headers: dict[str, str],
    ) -> HTTP2Response:
        started_at = time.perf_counter()
        request = client.build_request(method, url, content=content, headers=headers)
        response = await client.send(request, stream=True)
        try:
            response_has_body = method.upper() != "HEAD" and not (
                100 <= response.status_code < 200 or response.status_code in {204, 304}
            )
            chunks: list[bytes] = []
            total_size = 0
            if response_has_body:
                content_length = response.headers.get("content-length")
                if content_length and content_length.isdigit():
                    if int(content_length) > HTTP2_MAX_RESPONSE_BODY_BYTES:
                        raise HTTP2WorkerError("Upstream response exceeds the allowed limit")
                async for chunk in response.aiter_raw():
                    total_size += len(chunk)
                    if total_size > HTTP2_MAX_RESPONSE_BODY_BYTES:
                        raise HTTP2WorkerError("Upstream response exceeds the allowed limit")
                    chunks.append(chunk)

            elapsed_ms = round((time.perf_counter() - started_at) * 1000)
            return HTTP2Response(
                status_code=response.status_code,
                headers=list(response.headers.multi_items()),
                content=b"".join(chunks),
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

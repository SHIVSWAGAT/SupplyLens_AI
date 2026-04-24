from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Awaitable, Callable


class PromptInjectionError(ValueError):
    pass


class CircuitBreakerOpen(RuntimeError):
    pass


@dataclass
class CircuitBreaker:
    failure_threshold: int = 3
    recovery_seconds: int = 45

    def __post_init__(self):
        self.failures = 0
        self.open_until = 0.0

    def allow(self) -> None:
        if self.open_until > time.time():
            raise CircuitBreakerOpen("Circuit breaker is open")

    def record_success(self) -> None:
        self.failures = 0
        self.open_until = 0.0

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures >= self.failure_threshold:
            self.open_until = time.time() + self.recovery_seconds


async def with_retry(
    operation: Callable[[], Awaitable],
    *,
    retries: int = 2,
    timeout_seconds: float = 10.0,
    breaker: CircuitBreaker | None = None,
):
    last_error = None
    for attempt in range(retries + 1):
        try:
            if breaker:
                breaker.allow()
            result = await asyncio.wait_for(operation(), timeout=timeout_seconds)
            if breaker:
                breaker.record_success()
            return result
        except Exception as error:  # pragma: no cover - exercised through callers
            last_error = error
            if breaker:
                breaker.record_failure()
            if attempt == retries:
                break
            await asyncio.sleep(0.35 * (attempt + 1))
    raise last_error


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self._buckets = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        bucket = self._buckets[key]
        while bucket and bucket[0] <= now - self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


class PromptGuard:
    BLOCKLIST = [
        "ignore previous instructions",
        "reveal the system prompt",
        "show hidden instructions",
        "exfiltrate",
        "dump secrets",
        "developer message",
        "override safety",
    ]

    @classmethod
    def validate(cls, prompt: str) -> None:
        lowered = prompt.lower()
        if any(marker in lowered for marker in cls.BLOCKLIST):
            raise PromptInjectionError("Potential prompt injection detected")

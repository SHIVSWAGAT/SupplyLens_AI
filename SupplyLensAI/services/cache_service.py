import json
import threading
import time
from typing import Any, Optional

from config import get_settings

try:
    import redis
except Exception:  # pragma: no cover - optional dependency
    redis = None


class InMemoryTTLCache:
    def __init__(self):
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, value = item
            if expires_at < time.time():
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        with self._lock:
            self._store[key] = (time.time() + ttl_seconds, value)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)


class RedisTTLCache:
    def __init__(self, url: str):
        self._client = redis.from_url(url, decode_responses=True)

    def get(self, key: str) -> Optional[Any]:
        data = self._client.get(key)
        return json.loads(data) if data else None

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._client.setex(key, ttl_seconds, json.dumps(value))

    def delete(self, key: str) -> None:
        self._client.delete(key)


_cache_instance = None


def get_cache():
    global _cache_instance
    if _cache_instance is not None:
        return _cache_instance

    settings = get_settings()
    if settings.redis_url and redis is not None:
        try:
            _cache_instance = RedisTTLCache(settings.redis_url)
            return _cache_instance
        except Exception:
            pass

    _cache_instance = InMemoryTTLCache()
    return _cache_instance

"""Redis helpers and key conventions for staRT."""

from __future__ import annotations

import json
import os
from typing import Any

import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
PIPELINE_TTL_SECONDS = 3600


def pipeline_key(run_id: str) -> str:
    return f"pipeline:{run_id}"


def physician_prefs_key(physician_id: str) -> str:
    return f"physician:prefs:{physician_id}"


def physician_history_key(physician_id: str) -> str:
    return f"physician:history:{physician_id}"


def outcome_key(patient_id: str) -> str:
    return f"outcome:{patient_id}"


CASES_ALL_KEY = "cases:all"


class RedisClient:
    """Async Redis wrapper. Reads check cache first; callers fall back to JSON files on miss."""

    def __init__(self, url: str | None = None) -> None:
        self._url = url or REDIS_URL
        self._client: redis.Redis | None = None

    async def connect(self) -> None:
        if self._client is None:
            self._client = redis.from_url(self._url, decode_responses=True)

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            raise RuntimeError("Redis client not connected. Call connect() first.")
        return self._client

    async def get_json(self, key: str) -> Any | None:
        raw = await self.client.get(key)
        if raw is None:
            return None
        return json.loads(raw)

    async def set_json(self, key: str, value: Any, ttl: int | None = None) -> None:
        payload = json.dumps(value, default=str)
        if ttl is not None:
            await self.client.setex(key, ttl, payload)
        else:
            await self.client.set(key, payload)

    async def append_to_list(self, key: str, value: Any) -> None:
        await self.client.rpush(key, json.dumps(value, default=str))

    async def get_list(self, key: str) -> list[Any]:
        items = await self.client.lrange(key, 0, -1)
        return [json.loads(item) for item in items]

    async def delete(self, key: str) -> None:
        await self.client.delete(key)


redis_client = RedisClient()

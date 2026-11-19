from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any

from cachetools import TTLCache

from agenve2.core.models import Decision, FilterResult, ToolCallRequest
from agenve2.plugins.base import GuardPlugin


class RateLimiterPlugin(GuardPlugin):
    name = "rate_limiter"
    description = "Sliding-window rate limiter to halt runaway AI agent loops."

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: TTLCache[str, deque[float]] = TTLCache(maxsize=4096, ttl=120)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()

    def evaluate(
        self,
        request: ToolCallRequest,
        options: dict[str, Any],
    ) -> FilterResult:
        max_calls = int(options.get("max_calls_per_minute", 30))
        window_seconds = float(options.get("window_seconds", 60.0))
        bucket_key = f"{request.agent_name}:{request.tool_name}"
        now = time.monotonic()

        with self._lock:
            q = self._buckets.get(bucket_key)
            if q is None:
                q = deque()
                self._buckets[bucket_key] = q

            cutoff = now - window_seconds
            while q and q[0] < cutoff:
                q.popleft()

            if len(q) >= max_calls:
                return FilterResult(
                    plugin_name=self.name,
                    passed=False,
                    decision=Decision.BLOCK,
                    reason=(
                        f"Rate limit exceeded for '{request.agent_name}' on '{request.tool_name}': "
                        f"{len(q)}/{max_calls} calls in {int(window_seconds)}s."
                    ),
                    details={"calls_in_window": len(q), "max_calls": max_calls},
                )

            q.append(now)
            count = len(q)

        return FilterResult(
            plugin_name=self.name,
            passed=True,
            decision=Decision.ALLOW,
            reason=f"Within rate limit ({count}/{max_calls}).",
            details={"calls_in_window": count, "max_calls": max_calls},
        )

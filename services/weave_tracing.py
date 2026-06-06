"""Weave tracing helpers for agent observability."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import ParamSpec, TypeVar

logger = logging.getLogger(__name__)

P = ParamSpec("P")
R = TypeVar("R")

_initialized = False


def _is_enabled() -> bool:
    return os.getenv("WEAVE_ENABLED", "true").lower() not in {"0", "false", "no", "off"}


def _project_name() -> str:
    explicit = os.getenv("WEAVE_PROJECT")
    if explicit:
        return explicit

    project = os.getenv("WANDB_PROJECT", "staRT")
    entity = os.getenv("WANDB_ENTITY")
    if entity:
        return f"{entity}/{project}"
    return project


def init_weave() -> None:
    """Initialize Weave once at app startup without blocking the app on failures."""
    global _initialized

    if _initialized or not _is_enabled():
        return

    try:
        import weave

        weave.init(
            _project_name(),
            global_attributes={
                "app": "staRT",
                "service": "backend",
            },
        )
        _initialized = True
    except Exception as exc:
        logger.warning("Weave init failed (non-blocking): %s", exc)


def weave_op(name: str) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorate a function as a Weave op, falling back to a no-op decorator."""

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        if not _is_enabled():
            return func

        try:
            import weave

            return weave.op(name=name)(func)
        except Exception as exc:
            logger.warning("Weave op setup failed for %s (non-blocking): %s", name, exc)
            return func

    return decorator

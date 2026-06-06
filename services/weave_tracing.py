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
_client = None  # weave client handle, used to attach feedback to past calls


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
    global _initialized, _client

    if _initialized or not _is_enabled():
        return

    try:
        import weave

        _client = weave.init(
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


async def call_op(op, *args, **kwargs):
    """Invoke a Weave op capturing its Call, returning ``(result, call_id)``.

    Falls back to a plain call (``call_id=None``) when Weave is disabled or the
    decorator returned the bare function.
    """
    call_method = getattr(op, "call", None)
    if not _is_enabled() or call_method is None:
        return await op(*args, **kwargs), None
    try:
        result, call = await op.call(*args, **kwargs)
        return result, getattr(call, "id", None)
    except Exception as exc:
        logger.warning("Weave call capture failed (%s); running op directly", exc)
        return await op(*args, **kwargs), None


def add_feedback(call_id: str | None, *, reaction: str | None = None, note: str | None = None) -> None:
    """Attach a reaction and/or note to a previously traced call (non-blocking).

    This is how physician feedback (Loop 1) shows up on the original generate call
    in the Weave UI.
    """
    if not call_id or not _is_enabled() or _client is None:
        return
    try:
        call = _client.get_call(call_id)
        if reaction:
            call.feedback.add_reaction(reaction)
        if note:
            call.feedback.add_note(note)
    except Exception as exc:
        logger.warning("Weave feedback failed (non-blocking): %s", exc)

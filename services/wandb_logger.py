"""WandB logging for pipeline runs. Non-blocking — failures must not stop the pipeline."""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

WANDB_PROJECT = os.getenv("WANDB_PROJECT", "staRT")
WANDB_ENTITY = os.getenv("WANDB_ENTITY") or None


class WandbLogger:
    """Thin wrapper around wandb. All methods swallow errors and log warnings."""

    def __init__(self) -> None:
        self._run: Any | None = None
        self._enabled = bool(os.getenv("WANDB_API_KEY"))

    def start_run(self, run_id: str, config: dict[str, Any] | None = None) -> None:
        if not self._enabled:
            return
        try:
            import wandb

            self._run = wandb.init(
                project=WANDB_PROJECT,
                entity=WANDB_ENTITY,
                id=run_id,
                name=run_id,
                config=config or {},
                reinit=True,
            )
        except Exception as exc:
            logger.warning("WandB start_run failed (non-blocking): %s", exc)
            self._run = None

    def log(self, data: dict[str, Any], step: int | None = None) -> None:
        if self._run is None:
            return
        try:
            self._run.log(data, step=step)
        except Exception as exc:
            logger.warning("WandB log failed (non-blocking): %s", exc)

    def log_table(self, key: str, columns: list[str], data: list[list[Any]]) -> None:
        if self._run is None:
            return
        try:
            import wandb

            table = wandb.Table(columns=columns, data=data)
            self._run.log({key: table})
        except Exception as exc:
            logger.warning("WandB log_table failed (non-blocking): %s", exc)

    def finish(self) -> None:
        if self._run is None:
            return
        try:
            self._run.finish()
        except Exception as exc:
            logger.warning("WandB finish failed (non-blocking): %s", exc)
        finally:
            self._run = None


wandb_logger = WandbLogger()

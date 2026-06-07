"""Weave dataset over the 20 historical treatment plans.

This is the shared corpus the evaluation runs against (``evals/run_eval.py``).
Each row presents a patient to Agent 1 and carries the ground truth the Block B
scorers grade against.

Row contract (consumed by the scorers in ``evals/scorers.py`` and the model
wrapper in ``evals/run_eval.py``)
    - ``case_id``: the source plan's id — lets the model wrapper exclude the
      row's own case from vector retrieval so it can't copy the answer.
    - ``patient``: the presenting case (patient + case features only); the
      ``planning_variables`` and ``results`` are stripped because those are
      exactly what the model must propose.
    - ``reference``: the full historical plan, including ``results`` — the
      ground truth ``oar_safety_score`` / ``mu_efficiency_score`` compare to.
    - ``physician_prefs``: the physician's preference profile. Empty by default
      (the *cold* run, where ``physician_alignment_score`` returns ``None``);
      pass a populated mapping for the *learned* run to make "Rec 50 > Rec 1".

``reference`` and ``physician_prefs`` are named to bind directly to the scorer
signatures — do not rename them.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from models.schemas import HistoricalPlan, Patient, PhysicianPreferences

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HISTORICAL_PLANS_FILE = "historical_plans.json"

# Prefs that a row's physician profile may supply. Anything passed in is filtered
# to keep PhysicianPreferences (a StrictModel) from rejecting stray keys.
_PREF_FIELDS = set(PhysicianPreferences.model_fields)


def load_historical_plans() -> list[HistoricalPlan]:
    """Load and validate the 20 ground-truth plans from ``data/``."""
    with (DATA_DIR / HISTORICAL_PLANS_FILE).open() as f:
        raw = json.load(f)
    return [HistoricalPlan.model_validate(p) for p in raw]


def _patient_from_plan(plan: HistoricalPlan) -> Patient:
    """Reduce a historical plan to the patient as it would present, pre-planning.

    Drops ``planning_variables`` and ``results`` — those are the plan the model
    is being asked to propose, so handing them over would leak the answer.
    """
    return Patient(
        case_id=plan.case_id,
        patient_features=plan.patient_features,
        case_features=plan.case_features,
        physician=plan.physician,
    )


def _prefs_for(physician: str, prefs: Mapping[str, Any] | None) -> PhysicianPreferences:
    """Resolve a physician's preference profile; empty (cold) when none supplied."""
    if prefs and physician in prefs:
        entry = prefs[physician]
        if isinstance(entry, PhysicianPreferences):
            return entry
        data = {k: v for k, v in dict(entry).items() if k in _PREF_FIELDS}
        data.setdefault("physician", physician)
        return PhysicianPreferences.model_validate(data)
    return PhysicianPreferences(physician=physician)


def build_rows(prefs: Mapping[str, Any] | None = None) -> list[dict]:
    """Build the evaluation rows (plain JSON-serializable dicts).

    ``prefs`` maps a physician id to their learned preference profile (a
    ``PhysicianPreferences`` or a plain dict). Omit it for the cold run.
    """
    rows: list[dict] = []
    for plan in load_historical_plans():
        rows.append(
            {
                "case_id": plan.case_id,
                "patient": _patient_from_plan(plan).model_dump(mode="json"),
                "reference": plan.model_dump(mode="json"),
                "physician_prefs": _prefs_for(plan.physician, prefs).model_dump(mode="json"),
            }
        )
    return rows


def build_dataset(prefs: Mapping[str, Any] | None = None, *, name: str | None = None):
    """Wrap :func:`build_rows` in a ``weave.Dataset`` for ``weave.Evaluation``."""
    import weave

    rows = build_rows(prefs)
    if name is None:
        name = "start_historical_learned" if prefs else "start_historical_cold"
    return weave.Dataset(name=name, rows=rows)


def cold_dataset():
    """Dataset with empty preferences — the baseline (Rec 1) run."""
    return build_dataset(None, name="start_historical_cold")


def learned_dataset(prefs: Mapping[str, Any]):
    """Dataset with learned preferences applied — the improved (Rec 50) run."""
    return build_dataset(prefs, name="start_historical_learned")

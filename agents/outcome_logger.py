"""Agent 4 — Outcome Logger.

Computes a deterministic outcome weight (0.0–1.0) from the post-treatment report and
assembles the new historical case (Loop 2 of self-improvement). No LLM needed — this
is a transparent, auditable scoring rule.
"""

from __future__ import annotations

import uuid

from models.schemas import (
    ChallengedPlan,
    LogOutcomeRequest,
    Patient,
    PastCase,
    TreatmentOutcome,
    TumorResponse,
)
from services.weave_tracing import weave_op

# Component weights for the overall outcome score.
_RESPONSE_SCORE = {
    TumorResponse.COMPLETE: 1.0,
    TumorResponse.PARTIAL: 0.7,
    TumorResponse.STABLE: 0.4,
    TumorResponse.PROGRESSION: 0.0,
}


def compute_outcome_weight(request: LogOutcomeRequest) -> float:
    """Blend tumor response (50%), side-effect burden (30%), and reuse intent (20%)."""
    response_score = _RESPONSE_SCORE.get(request.tumor_response, 0.4)
    if request.side_effects:
        avg_grade = sum(se.grade for se in request.side_effects) / len(request.side_effects)
        side_effect_score = max(0.0, 1.0 - (avg_grade - 1) / 4)  # grade 1 -> 1.0, grade 5 -> 0.0
    else:
        side_effect_score = 1.0
    reuse_score = 1.0 if request.would_reuse_plan else 0.3
    weight = 0.5 * response_score + 0.3 * side_effect_score + 0.2 * reuse_score
    return round(max(0.0, min(1.0, weight)), 4)


@weave_op("agent_4_log_outcome")
async def log_outcome(
    request: LogOutcomeRequest,
    patient: Patient,
    chosen_plan: ChallengedPlan | None,
    existing_cases: list[PastCase],
) -> tuple[TreatmentOutcome, PastCase]:
    """Compute outcome weight and assemble the case to append to past cases."""
    weight = compute_outcome_weight(request)
    outcome = TreatmentOutcome(**request.model_dump(), outcome_weight=weight)

    new_case = PastCase(
        case_id=f"CASE-{request.patient_id}-{uuid.uuid4().hex[:6]}",
        patient_features=patient.patient_features,
        case_features=patient.case_features,
        planning_variables=chosen_plan.planning_variables if chosen_plan else patient.planning_variables,
        results=chosen_plan.results if chosen_plan else patient.results,
        physician=request.physician_id,
    )
    return outcome, new_case

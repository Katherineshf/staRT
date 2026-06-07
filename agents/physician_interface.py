"""Agent 3 — Physician Interface.

Parses the physician's free-text feedback into structured preference signals and
merges them into the running preference profile (Loop 1 of self-improvement).
"""

from __future__ import annotations

from datetime import datetime

from models.schemas import (
    ChallengedPlan,
    PhysicianChoice,
    PhysicianPreferences,
    RiskTolerance,
)
from services.openai_client import chat_json
from services.weave_tracing import weave_op

# --- Prompts (edit these freely) ------------------------------------------------

SYSTEM_PROMPT = (
    "You extract a radiation oncologist's planning preferences from their free-text "
    "feedback about a plan they chose. Only report signals you are confident the text "
    "supports; use null otherwise. Respond ONLY with a JSON object."
)

USER_TEMPLATE = (
    "Current preference profile:\n{prefs}\n\n"
    "Chosen plan:\n{chosen}\n\n"
    "Physician's reasoning for choosing this plan: {reasoning}\n"
    "Concerns or what they would change: {concern}\n\n"
    "Return JSON of the exact form (use null when unsure):\n"
    '{{"favors_lower_mu": bool|null, "prioritizes_oar_sparing": bool|null, '
    '"favors_target_coverage": bool|null, "preferred_technique": str|null, '
    '"risk_tolerance": "conservative"|"balanced"|"aggressive"|null, '
    '"note": "one concise takeaway", "signals": {{"any_extra_signal": "value"}}}}'
)

_BOOL_FIELDS = ("favors_lower_mu", "prioritizes_oar_sparing", "favors_target_coverage")

# --------------------------------------------------------------------------------


@weave_op("agent_3_process_physician_feedback")
async def process_physician_feedback(
    physician_id: str,
    run_id: str,
    chosen_plan_id: str,
    reasoning: str,
    concern: str | None,
    top_two: list[ChallengedPlan],
    current_prefs: PhysicianPreferences,
) -> tuple[PhysicianPreferences, PhysicianChoice]:
    """Parse feedback, update preference profile, and record the choice."""
    chosen = next((p for p in top_two if p.case_id == chosen_plan_id), None)
    user = USER_TEMPLATE.format(
        prefs=current_prefs.model_dump_json(),
        chosen=chosen.model_dump_json() if chosen else f"(id {chosen_plan_id} not in run)",
        reasoning=reasoning or "(none)",
        concern=concern or "(none)",
    )
    data = await chat_json(SYSTEM_PROMPT, user, temperature=0.2)

    merged = current_prefs.model_dump()
    for field in _BOOL_FIELDS:
        if isinstance(data.get(field), bool):
            merged[field] = data[field]
    if isinstance(data.get("preferred_technique"), str):
        merged["preferred_technique"] = data["preferred_technique"]
    if data.get("risk_tolerance") in {rt.value for rt in RiskTolerance}:
        merged["risk_tolerance"] = data["risk_tolerance"]
    if isinstance(data.get("note"), str) and data["note"].strip():
        merged["notes"] = [*current_prefs.notes, data["note"].strip()]
    if isinstance(data.get("signals"), dict):
        merged["signals"] = {**current_prefs.signals, **data["signals"]}
    merged["updated_at"] = datetime.utcnow()

    updated = PhysicianPreferences.model_validate(merged)
    choice = PhysicianChoice(
        physician=physician_id,
        run_id=run_id,
        chosen_plan_id=chosen_plan_id,
        reasoning=reasoning,
        concern=concern,
    )
    return updated, choice

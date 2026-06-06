"""Agent 3 — Physician Interface."""

from models.schemas import ChallengedPlan, PhysicianChoice, PhysicianPreferences


async def process_physician_feedback(
    physician_id: str,
    run_id: str,
    chosen_plan_id: str,
    liked: str,
    disliked: str,
    top_two: list[ChallengedPlan],
    current_prefs: PhysicianPreferences,
) -> tuple[PhysicianPreferences, PhysicianChoice]:
    """Parse feedback, update preference profile, and record the choice."""
    raise NotImplementedError("Agent 3 logic not yet implemented")

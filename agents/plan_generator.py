"""Agent 1 — Plan Generator."""

from models.schemas import CandidatePlan, Patient, PastCase, PhysicianPreferences


async def generate_candidate_plans(
    patient: Patient,
    past_cases: list[PastCase],
    physician_prefs: PhysicianPreferences,
) -> list[CandidatePlan]:
    """Generate 3–5 candidate treatment plans via pattern-matching from past cases."""
    raise NotImplementedError("Agent 1 logic not yet implemented")

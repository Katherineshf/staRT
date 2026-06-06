"""Agent 4 — Outcome Logger."""

from models.schemas import LogOutcomeRequest, PastCase, TreatmentOutcome


async def log_outcome(
    request: LogOutcomeRequest,
    existing_cases: list[PastCase],
) -> tuple[TreatmentOutcome, PastCase]:
    """Compute outcome weight and append the case to past cases."""
    raise NotImplementedError("Agent 4 logic not yet implemented")

"""Agent 4 — Outcome Logger."""

from models.schemas import LogOutcomeRequest, PastCase, TreatmentOutcome
from services.weave_tracing import weave_op


@weave_op("agent_4_log_outcome")
async def log_outcome(
    request: LogOutcomeRequest,
    existing_cases: list[PastCase],
) -> tuple[TreatmentOutcome, PastCase]:
    """Compute outcome weight and append the case to past cases."""
    raise NotImplementedError("Agent 4 logic not yet implemented")

"""Agent 2 — Devil's Advocate ("Evil Voice")."""

from models.schemas import CandidatePlan, ChallengedPlan


async def challenge_and_select_top_two(
    candidates: list[CandidatePlan],
) -> tuple[list[ChallengedPlan], list[ChallengedPlan]]:
    """Challenge all plans with risk scores and select the top 2 for physician review."""
    raise NotImplementedError("Agent 2 logic not yet implemented")

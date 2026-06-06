"""Agent 2 — Devil's Advocate ("Evil Voice").

Critiques every candidate plan with concrete numbers, assigns a risk score, and
selects the top 2 to maximize the physician's decision surface (e.g. one
conservative, one aggressive).
"""

from __future__ import annotations

import json

from models.schemas import CandidatePlan, ChallengedPlan
from services.openai_client import chat_json
from services.weave_tracing import weave_op

# --- Prompts (edit these freely) ------------------------------------------------

SYSTEM_PROMPT = (
    "You are a rigorous radiation-oncology peer reviewer — the 'evil voice'. For each "
    "candidate plan, raise the strongest concrete objection using specific numbers and "
    "trade-offs (e.g. 'improves CI 1.15->1.07 but raises MU 35% and optic Dmax +0.4 Gy'). "
    "Assign each a risk_score in [0,1] (higher = riskier). Then pick the TWO plans that "
    "best span the physician's options (typically one conservative, one aggressive). "
    "Respond ONLY with a JSON object."
)

USER_TEMPLATE = (
    "Candidate plans (indexed):\n{plans}\n\n"
    "Return JSON of the exact form:\n"
    '{{"challenges": [{{"index": int, "risk_score": float, "challenge": "specific critique"}}], '
    '"top_two_indices": [int, int], "selection_rationale": "why these two span the decision"}}'
)

# --------------------------------------------------------------------------------


def _clamp(value, lo: float = 0.0, hi: float = 1.0) -> float:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return 0.5


@weave_op("agent_2_challenge_and_select_top_two")
async def challenge_and_select_top_two(
    candidates: list[CandidatePlan],
) -> tuple[list[ChallengedPlan], list[ChallengedPlan]]:
    """Challenge all plans with risk scores and select the top 2 for physician review."""
    if not candidates:
        return [], []

    indexed = [{"index": i, **c.model_dump(mode="json")} for i, c in enumerate(candidates)]
    user = USER_TEMPLATE.format(plans=json.dumps(indexed, default=str))
    data = await chat_json(SYSTEM_PROMPT, user, temperature=0.5)

    by_index = {c["index"]: c for c in data.get("challenges", []) if isinstance(c, dict) and "index" in c}
    top_indices = {i for i in data.get("top_two_indices", []) if isinstance(i, int)}

    challenged: list[ChallengedPlan] = []
    for i, candidate in enumerate(candidates):
        critique = by_index.get(i, {})
        challenged.append(
            ChallengedPlan(
                **candidate.model_dump(),
                risk_score=_clamp(critique.get("risk_score", 0.5)),
                challenge=critique.get("challenge") or "No specific challenge generated.",
                selected_for_review=i in top_indices,
            )
        )

    top_two = [p for p in challenged if p.selected_for_review][:2]
    if len(top_two) < 2:  # fallback: two lowest-risk plans
        top_two = sorted(challenged, key=lambda p: p.risk_score)[:2]
        for p in top_two:
            p.selected_for_review = True
    return challenged, top_two

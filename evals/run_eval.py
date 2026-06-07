"""Block D — the staRT evaluation runner.

This is the judge-facing payoff: it wraps Agent 1 (the plan generator) as a
``weave.Model`` and runs ``weave.Evaluation`` over the 20 historical cases
*twice* —

    1. COLD  — no learned physician preferences (the baseline, "Rec 1").
    2. LEARNED — a learned preference profile applied (the improved, "Rec 50").

Both runs land in the Weave UI as an **Evaluations scorecard** (the 5 Block B
scorers averaged across the cases), and every generation expands into a trace
showing the gpt-4o call *and* the Redis vector search that retrieved the
similar cases. That is exactly the Weave + Redis surface a judge looks at, and
the learned run's scorecard should beat the cold run's.

Run it yourself (needs Redis up + a populated ``.env``); it makes ~40 real
gpt-4o calls (20 cases x 2 runs):

    python -m evals.run_eval

Leakage guard
    Agent 1 retrieves similar cases from the same 20-case vector set, so it
    would otherwise pull the row's own case and copy the ground truth. The model
    wrapper hands Agent 1 a *leave-one-out* corpus (all cases except the row's
    own ``case_id``), so the row's own plan can never be retrieved.
"""

from __future__ import annotations

import asyncio
import json

from dotenv import load_dotenv

load_dotenv()  # OPENAI_API_KEY / WANDB_* must be present before weave/openai init

import weave

from agents.plan_generator import generate_candidate_plans
from evals.dataset import cold_dataset, learned_dataset, load_historical_plans
from evals.scorers import SCORERS
from models.schemas import Patient, PhysicianPreferences, RiskTolerance
from services.redis_client import redis_client
from services.vector_store import build_index
from services.weave_tracing import init_weave

# The shared corpus — loaded once, reused for the vector index and the
# leave-one-out filtering inside the model wrapper.
_CORPUS = load_historical_plans()


# ============================================================================
# REVIEW LATER — demo "learned" preference profile.
#
# This is the ONLY hand-authored input in the eval and the one thing to revisit.
# Because the data is 20 physicians x 1 plan each, we can't infer a physician's
# real preferences from their own single plan (that plan IS the ground truth, so
# it would be circular). So for the demo we apply one plausible profile to every
# physician to drive the "system learned and improved" (Rec 50 > Rec 1) story.
#
# Change the wording/flags here freely — nothing else in the eval depends on it.
# When the data is enriched to several plans per physician, replace this with a
# real per-physician profile derived from that physician's history.
# ============================================================================
def demo_learned_prefs() -> dict[str, PhysicianPreferences]:
    """Map every physician in the corpus to a shared demo preference profile.

    Returns a ``{physician_id: PhysicianPreferences}`` mapping in the shape
    ``learned_dataset`` expects.
    """
    base = PhysicianPreferences(
        physician="__demo__",
        favors_lower_mu=True,          # prefers a lower delivery cost (monitor units)
        prioritizes_oar_sparing=True,  # spare healthy organs-at-risk
        favors_target_coverage=True,   # keep tumor coverage at/above target
        risk_tolerance=RiskTolerance.CONSERVATIVE,
        notes=["Demo learned profile: lower MU, spare OARs, hold target coverage."],
    )
    return {
        plan.physician: base.model_copy(update={"physician": plan.physician})
        for plan in _CORPUS
    }


class PlanGeneratorModel(weave.Model):
    """``weave.Model`` wrapping Agent 1 so ``weave.Evaluation`` can score it.

    Per-row inputs are only ``patient`` and ``physician_prefs`` (plus ``case_id``
    for the leakage guard); the corpus + vector index are shared and owned here.
    ``reference`` is *not* a predict argument — it flows to the scorers instead.
    """

    @weave.op()
    async def predict(self, patient: dict, physician_prefs: dict, case_id: str) -> list[dict]:
        patient_obj = Patient.model_validate(patient)
        prefs_obj = PhysicianPreferences.model_validate(physician_prefs)
        # Leave-one-out: drop the row's own case so Agent 1 can't retrieve and
        # copy its ground-truth plan.
        corpus = [c for c in _CORPUS if c.case_id != case_id]
        plans = await generate_candidate_plans(patient_obj, corpus, prefs_obj)
        # Return plain dicts; the scorers grade plans[0] (the top recommendation).
        return [p.model_dump(mode="json") for p in plans]


def _print_summary(label: str, result) -> None:
    """Print a run's scorecard to the terminal (the rich view lives in Weave)."""
    print(f"\n===== {label} =====")
    print(json.dumps(result, indent=2, default=str))


async def main() -> None:
    init_weave()              # log evaluations + traces to the Weave project
    await redis_client.connect()
    # Make sure the vector set holds the 20 historical cases (rebuilds if the
    # live app only seeded the 3-case past_cases.json).
    await build_index(_CORPUS)

    model = PlanGeneratorModel()

    cold_eval = weave.Evaluation(
        name="start_cold_no_learned_prefs",
        dataset=cold_dataset(),
        scorers=SCORERS,
    )
    learned_eval = weave.Evaluation(
        name="start_learned_prefs_applied",
        dataset=learned_dataset(demo_learned_prefs()),
        scorers=SCORERS,
    )

    try:
        print("Running COLD eval (Rec 1: no learned preferences)...")
        cold_result = await cold_eval.evaluate(model)
        _print_summary("COLD (no learned prefs)", cold_result)

        print("\nRunning LEARNED eval (Rec 50: preferences applied)...")
        learned_result = await learned_eval.evaluate(model)
        _print_summary("LEARNED (prefs applied)", learned_result)

        print("\nDone. Compare the two scorecards in the Weave UI:")
        print("  https://wandb.ai/start-kp/staRT/weave")
    finally:
        await redis_client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())

"""Agent 1 — Plan Generator.

Retrieves the most similar past cases from the Redis vector set, then asks gpt-4o
to pattern-match (NOT compute physics) into 3–5 candidate treatment plans.
"""

from __future__ import annotations

import uuid

from models.schemas import (
    CandidatePlan,
    OARResult,
    Patient,
    PastCase,
    PlanningVariables,
    PlanResults,
    PhysicianPreferences,
)
from services.openai_client import chat_json
from services.vector_store import case_to_text, search_similar
from services.weave_tracing import weave_op

# --- Prompts (edit these freely) ------------------------------------------------

SYSTEM_PROMPT = (
    "You are a radiation oncology treatment-planning assistant. You do NOT compute "
    "doses with physics equations. Instead you pattern-match from similar historical "
    "plans and the physician's stated preferences to propose candidate plans. "
    "Each plan must vary meaningfully from the others in dose, fractions, technique, "
    "beam/arc setup, or trade-offs. Respond ONLY with a JSON object."
)

USER_TEMPLATE = (
    "New patient:\n{patient}\n\n"
    "Most similar historical plans (closest first):\n{cases}\n\n"
    "Physician preferences:\n{prefs}\n\n"
    "Propose 3 to 5 candidate plans. Return JSON of the exact form:\n"
    '{{"plans": [{{"label": "short name", "rationale": "why this fits, citing the '
    'similar cases", "planning_variables": {{"algorithm": str, "arcs": int, '
    '"arc_type": str, "ptv_margin_mm": float, "modulation_level": str, '
    '"target_priority": str, "normal_tissue_priority": str}}, '
    '"results": {{"ci": float, "gi": float, "v12_cc": float, "mu": float, '
    '"coverage_percent": float, "oar_results": [{{"type": str, "dmax_gy": float}}]}}}}]}}'
)

# --------------------------------------------------------------------------------


def _filter(model_cls, data) -> dict:
    """Keep only keys that the Pydantic model actually declares (StrictModel forbids extras)."""
    if not isinstance(data, dict):
        return {}
    allowed = set(model_cls.model_fields)
    return {k: v for k, v in data.items() if k in allowed}


@weave_op("agent_1_generate_candidate_plans")
async def generate_candidate_plans(
    patient: Patient,
    past_cases: list[PastCase],
    physician_prefs: PhysicianPreferences,
) -> list[CandidatePlan]:
    """Generate 3–5 candidate treatment plans via pattern-matching from past cases."""
    similar = await search_similar(patient, k=8, tumor_filter=patient.case_features.tumor_type)
    by_id = {c.case_id: c for c in past_cases}
    source_ids = [cid for cid, _ in similar if cid in by_id]
    retrieved = [by_id[cid] for cid in source_ids] or past_cases

    user = USER_TEMPLATE.format(
        patient=case_to_text(patient),
        cases="\n".join(f"- [{c.case_id}] {case_to_text(c)}" for c in retrieved) or "none on file",
        prefs=physician_prefs.model_dump_json(),
    )
    data = await chat_json(SYSTEM_PROMPT, user, temperature=0.6)

    plans: list[CandidatePlan] = []
    for raw in data.get("plans", []):
        results = _filter(PlanResults, raw.get("results", {}))
        if isinstance(results.get("oar_results"), list):
            results["oar_results"] = [
                OARResult.model_validate(_filter(OARResult, o))
                for o in results["oar_results"]
                if isinstance(o, dict)
            ]
        plans.append(
            CandidatePlan(
                case_id=f"CAND-{uuid.uuid4().hex[:8]}",
                patient_features=patient.patient_features,
                case_features=patient.case_features,
                planning_variables=PlanningVariables(**_filter(PlanningVariables, raw.get("planning_variables", {}))),
                results=PlanResults(**results),
                physician=physician_prefs.physician,
                rationale=raw.get("rationale") or raw.get("label"),
                source_case_ids=source_ids,
            )
        )
    return plans

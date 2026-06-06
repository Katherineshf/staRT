"""Semantic retrieval of past cases backed by Redis Vector Sets (VADD/VSIM).

This is the "pattern-match from history" core: each past case is embedded with
OpenAI and stored as an element in a single Redis vector set (`cases:vset`), with
its tumor type / physician / outcome weight attached as JSON attributes. Agent 1
embeds a new patient and asks Redis for the nearest neighbours via VSIM, optionally
filtering by tumor type.

Redis 8's vector set is the newest Redis data type; redis-py 8 has no typed API for
it yet, so commands go through `execute_command(...)`. If the running server lacks
the module we degrade to an in-memory cosine search so the demo never hard-fails.
"""

from __future__ import annotations

import json
import logging
import math

from models.schemas import HistoricalPlan, Patient
from services.openai_client import embed_text
from services.redis_client import redis_client
from services.weave_tracing import weave_op

logger = logging.getLogger(__name__)

CASES_VSET_KEY = "cases:vset"

# In-memory fallback, used only if the server has no vector-set support.
_fallback_vectors: dict[str, list[float]] = {}
_use_fallback = False


def case_to_text(case: HistoricalPlan) -> str:
    """Build a compact textual fingerprint of a case for embedding."""
    pf, cf, pv, rs = case.patient_features, case.case_features, case.planning_variables, case.results
    oars = ", ".join(f"{o.type}@{o.distance_to_tumor_mm}mm" for o in cf.oars) or "none"
    return (
        f"Tumor: {cf.tumor_type}; target volume {cf.target_volume_cc} cc; "
        f"prescription {cf.prescription_gy} Gy in {cf.fractions} fractions. "
        f"Patient: {pf.age}y {pf.sex}, {pf.condition}. "
        f"OARs: {oars}. "
        f"Planning: algorithm={pv.algorithm}, arcs={pv.arcs} {pv.arc_type}, "
        f"ptv_margin={pv.ptv_margin_mm}mm, modulation={pv.modulation_level}, "
        f"target_priority={pv.target_priority}, normal_tissue_priority={pv.normal_tissue_priority}. "
        f"Results: CI={rs.ci}, GI={rs.gi}, V12={rs.v12_cc}cc, MU={rs.mu}, coverage={rs.coverage_percent}%."
    )


@weave_op("vector_index_case")
async def index_case(case: HistoricalPlan, *, weight: float | None = None) -> None:
    """Embed a case and upsert it into the Redis vector set (idempotent per case_id)."""
    global _use_fallback
    vector = await embed_text(case_to_text(case))
    attrs = {"tumor_type": case.case_features.tumor_type, "physician": case.physician}
    if weight is not None:
        attrs["outcome_weight"] = weight

    if _use_fallback:
        _fallback_vectors[case.case_id] = vector
        return

    try:
        await redis_client.client.execute_command(
            "VADD",
            CASES_VSET_KEY,
            "VALUES",
            str(len(vector)),
            *(repr(x) for x in vector),
            case.case_id,
            "SETATTR",
            json.dumps(attrs),
        )
    except Exception as exc:  # server without vector-set support
        logger.warning("VADD failed (%s); switching to in-memory fallback", exc)
        _use_fallback = True
        _fallback_vectors[case.case_id] = vector


@weave_op("vector_build_index")
async def build_index(cases: list[HistoricalPlan]) -> None:
    """Index all cases at startup; skip the rebuild if the set is already populated."""
    try:
        existing = int(await redis_client.client.execute_command("VCARD", CASES_VSET_KEY) or 0)
    except Exception:
        existing = 0
    if existing and existing >= len(cases):
        logger.info("Vector set already populated (%d elements); skipping rebuild", existing)
        return
    for case in cases:
        await index_case(case)
    logger.info("Indexed %d cases into %s", len(cases), CASES_VSET_KEY)


@weave_op("vector_search_similar")
async def search_similar(
    patient: Patient,
    k: int = 8,
    tumor_filter: str | None = None,
) -> list[tuple[str, float]]:
    """Return up to k (case_id, similarity_score) nearest to the patient."""
    vector = await embed_text(case_to_text(patient))

    if _use_fallback:
        return _fallback_search(vector, k)

    try:
        args: list = ["VSIM", CASES_VSET_KEY, "VALUES", str(len(vector)), *(repr(x) for x in vector)]
        args += ["WITHSCORES", "COUNT", str(k)]
        if tumor_filter:
            args += ["FILTER", f'.tumor_type == "{tumor_filter}"']
        raw = await redis_client.client.execute_command(*args)
    except Exception as exc:
        logger.warning("VSIM failed (%s); falling back to in-memory search", exc)
        return _fallback_search(vector, k)

    return _parse_withscores(raw)


def _parse_withscores(raw) -> list[tuple[str, float]]:
    """Normalize VSIM WITHSCORES output (flat list in RESP2, map in RESP3)."""
    if isinstance(raw, dict):
        return [(_s(key), float(val)) for key, val in raw.items()]
    out: list[tuple[str, float]] = []
    items = list(raw)
    for i in range(0, len(items) - 1, 2):
        out.append((_s(items[i]), float(items[i + 1])))
    return out


def _s(value) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def _fallback_search(vector: list[float], k: int) -> list[tuple[str, float]]:
    scored = [(cid, _cosine(vector, vec)) for cid, vec in _fallback_vectors.items()]
    scored.sort(key=lambda t: t[1], reverse=True)
    return scored[:k]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0

"""Weave scorers for staRT treatment plans.

Each scorer is a Weave op that grades a single generated plan against the
historical ground-truth plan and the physician's stated preferences. They are
the judge-facing artifact: run over the dataset by ``evals/run_eval.py`` they
produce a scorecard that should improve from the cold run (no learned prefs) to
the learned run (Loop-1 preferences applied) — i.e. "Rec 50 > Rec 1".

Dataset contract (see ``evals/dataset.py``)
    Each scorer receives the model ``output`` plus, by name, any of these row
    columns that ``weave.Evaluation`` binds automatically:
      - ``reference``: the ground-truth historical plan (dict or HistoricalPlan)
      - ``physician_prefs``: the physician's preference profile (dict)

    ``output`` may be a single plan (CandidatePlan / dict) or a list of plans
    (e.g. ``top_two``); when a list is given the top recommendation is scored.

Clinical conventions
    - coverage_percent: % of target receiving prescription dose; ≥95% is good.
    - ci (conformity index): ideal ≈ 1.0; deviation in either direction is worse.
    - OAR dmax_gy: dose to organs at risk; lower is safer.
    - mu (monitor units): delivery cost; lower is more efficient.
"""

from __future__ import annotations

from typing import Any

from services.weave_tracing import weave_op

# --- Tunable thresholds ---------------------------------------------------------

COVERAGE_TARGET = 95.0  # percent of target volume at prescription dose
OAR_TOLERANCE = 0.05  # allow OAR dmax up to +5% over the historical reference


# --- Accessors that work on both Pydantic models and plain dicts ----------------


def _get(obj: Any, *path: str) -> Any:
    """Traverse ``path`` through nested dicts/attrs, returning None if absent."""
    for key in path:
        if obj is None:
            return None
        obj = obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)
    return obj


def _top_plan(output: Any) -> Any:
    """Normalize a model output to the single plan being scored."""
    if isinstance(output, (list, tuple)):
        return output[0] if output else None
    if isinstance(output, dict):
        # Allow outputs that wrap the plan, e.g. {"plan": {...}} or {"top_two": [...]}.
        for key in ("plan", "top_plan", "chosen_plan"):
            if key in output:
                return output[key]
        for key in ("top_two", "plans", "candidates"):
            if isinstance(output.get(key), (list, tuple)) and output[key]:
                return output[key][0]
    return output


def _oar_dmax(obj: Any) -> dict[str, float]:
    """Map ``{oar_type(lowercased): dmax_gy}`` for a plan, skipping missing doses."""
    results = _get(obj, "results")
    oars = _get(results, "oar_results") or []
    out: dict[str, float] = {}
    for oar in oars:
        otype = _get(oar, "type")
        dmax = _get(oar, "dmax_gy")
        if otype is not None and dmax is not None:
            out[str(otype).lower()] = float(dmax)
    return out


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


# --- Scorers --------------------------------------------------------------------


@weave_op("score_coverage")
def coverage_score(output: Any) -> dict:
    """Target coverage: does the plan deliver the prescription dose to the tumor?"""
    cov = _get(_top_plan(output), "results", "coverage_percent")
    if cov is None:
        return {"coverage_percent": None, "meets_target": None, "score": None}
    cov = float(cov)
    return {
        "coverage_percent": cov,
        "meets_target": cov >= COVERAGE_TARGET,
        "score": min(cov / 100.0, 1.0),
    }


@weave_op("score_conformity")
def conformity_score(output: Any) -> dict:
    """Conformity: how tightly the prescription dose wraps the target (CI ≈ 1.0)."""
    results = _get(_top_plan(output), "results")
    ci = _get(results, "ci")
    if ci is None:
        return {"ci": None, "gi": _get(results, "gi"), "score": None}
    ci = float(ci)
    return {
        "ci": ci,
        "gi": _get(results, "gi"),
        "score": max(0.0, 1.0 - abs(ci - 1.0)),
    }


@weave_op("score_oar_safety")
def oar_safety_score(output: Any, reference: Any = None) -> dict:
    """OAR safety: does the plan keep organs-at-risk at/below the proven plan's doses?"""
    out_oars = _oar_dmax(_top_plan(output))
    ref_oars = _oar_dmax(reference)
    if not out_oars:
        return {"oars_evaluated": 0, "oars_within_tolerance": None, "max_overdose_ratio": None, "score": None}
    if not ref_oars:
        # No reference doses to judge against; report exposure but no pass/fail.
        return {
            "oars_evaluated": len(out_oars),
            "oars_within_tolerance": None,
            "max_overdose_ratio": None,
            "score": None,
        }

    safe = 0
    evaluated = 0
    worst_ratio = 0.0
    for otype, dmax in out_oars.items():
        ref = ref_oars.get(otype)
        if ref is None or ref <= 0:
            continue
        evaluated += 1
        ratio = dmax / ref
        worst_ratio = max(worst_ratio, ratio)
        if dmax <= ref * (1.0 + OAR_TOLERANCE):
            safe += 1

    if evaluated == 0:
        return {"oars_evaluated": 0, "oars_within_tolerance": None, "max_overdose_ratio": None, "score": None}

    return {
        "oars_evaluated": evaluated,
        "oars_within_tolerance": safe,
        "max_overdose_ratio": round(worst_ratio, 3),
        "all_within_tolerance": safe == evaluated,
        "score": safe / evaluated,
    }


@weave_op("score_mu_efficiency")
def mu_efficiency_score(output: Any, reference: Any = None) -> dict:
    """MU efficiency: lower monitor units than the historical plan = more efficient."""
    mu = _get(_top_plan(output), "results", "mu")
    ref_mu = _get(reference, "results", "mu")
    if mu is None or mu <= 0:
        return {"mu": mu, "reference_mu": ref_mu, "efficiency": None, "score": None}
    if ref_mu is None or ref_mu <= 0:
        return {"mu": float(mu), "reference_mu": ref_mu, "efficiency": None, "score": None}
    # efficiency caps at 1.0 when at/below the reference; falls off as MU grows.
    efficiency = min(1.0, float(ref_mu) / float(mu))
    return {
        "mu": float(mu),
        "reference_mu": float(ref_mu),
        "efficiency": round(efficiency, 3),
        "score": efficiency,
    }


@weave_op("score_physician_alignment")
def physician_alignment_score(output: Any, physician_prefs: Any = None, reference: Any = None) -> dict:
    """Physician alignment: does the plan honor the doctor's learned preferences?

    Only preferences the physician has actually expressed are evaluated, so a
    cold run (empty prefs) scores ``None`` here and the learned run is what makes
    this scorer light up — the core of the self-improvement story.
    """
    prefs = physician_prefs or {}
    plan = _top_plan(output)
    results = _get(plan, "results")

    checks: dict[str, bool] = {}

    mu = _get(results, "mu")
    ref_mu = _get(reference, "results", "mu")
    if _get(prefs, "favors_lower_mu") and mu is not None and ref_mu:
        checks["lower_mu"] = float(mu) <= float(ref_mu)

    out_mean = _mean(list(_oar_dmax(plan).values()))
    ref_mean = _mean(list(_oar_dmax(reference).values()))
    if _get(prefs, "prioritizes_oar_sparing") and out_mean is not None and ref_mean is not None:
        checks["oar_sparing"] = out_mean <= ref_mean

    cov = _get(results, "coverage_percent")
    if _get(prefs, "favors_target_coverage") and cov is not None:
        checks["target_coverage"] = float(cov) >= COVERAGE_TARGET

    technique = _get(prefs, "preferred_technique")
    if technique:
        pv = _get(plan, "planning_variables")
        haystack = " ".join(
            str(_get(pv, f) or "") for f in ("algorithm", "arc_type", "modulation_level")
        ).lower()
        checks["technique"] = str(technique).lower() in haystack

    risk = _get(prefs, "risk_tolerance")
    risk = getattr(risk, "value", risk)  # accept the RiskTolerance enum or a str
    if risk == "conservative" and out_mean is not None and ref_mean is not None:
        checks["risk_conservative"] = out_mean <= ref_mean
    elif risk == "aggressive" and cov is not None:
        checks["risk_aggressive"] = float(cov) >= COVERAGE_TARGET

    if not checks:
        return {"preferences_evaluated": 0, "preferences_satisfied": 0, "score": None}

    satisfied = sum(1 for v in checks.values() if v)
    return {
        **{f"pref_{k}": v for k, v in checks.items()},
        "preferences_evaluated": len(checks),
        "preferences_satisfied": satisfied,
        "score": satisfied / len(checks),
    }


# Convenience bundle for evals/run_eval.py
SCORERS = [
    coverage_score,
    conformity_score,
    oar_safety_score,
    mu_efficiency_score,
    physician_alignment_score,
]

"""FastAPI application — all routes."""

from __future__ import annotations

import json
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agents.devils_advocate import challenge_and_select_top_two
from agents.outcome_logger import log_outcome as run_log_outcome
from agents.physician_interface import process_physician_feedback
from agents.plan_generator import generate_candidate_plans
from models.schemas import (
    ChallengedPlan,
    GeneratePlansRequest,
    GeneratePlansResponse,
    LogOutcomeRequest,
    LogOutcomeResponse,
    Patient,
    PastCase,
    PhysicianFeedbackRequest,
    PhysicianFeedbackResponse,
    PhysicianPreferences,
    PipelineState,
)
from services.redis_client import (
    CASES_ALL_KEY,
    PIPELINE_TTL_SECONDS,
    outcome_key,
    physician_history_key,
    physician_prefs_key,
    pipeline_key,
    redis_client,
)
from services.vector_store import build_index, index_case, search_similar  # noqa: F401  (search_similar re-exported for evals)
from services.weave_tracing import add_feedback, call_op, init_weave

load_dotenv()

logger = logging.getLogger(__name__)
DATA_DIR = Path(__file__).parent / "data"


def _load_json(filename: str) -> list | dict:
    path = DATA_DIR / filename
    with path.open() as f:
        return json.load(f)


def _write_json(filename: str, data) -> None:
    (DATA_DIR / filename).write_text(json.dumps(data, indent=2))


# --- shared loaders (cache-first, JSON fallback) --------------------------------


def _load_patient(patient_id: str) -> Patient:
    for raw in _load_json("mock_patients.json"):
        if raw["case_id"] == patient_id:
            return Patient.model_validate(raw)
    raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")


async def _load_past_cases() -> list[PastCase]:
    cached = await redis_client.get_json(CASES_ALL_KEY)
    if cached is not None:
        return [PastCase.model_validate(c) for c in cached]
    cases = [PastCase.model_validate(c) for c in _load_json("historical_plans.json")]
    await redis_client.set_json(CASES_ALL_KEY, [c.model_dump(mode="json") for c in cases])
    return cases


async def _load_prefs(physician_id: str) -> PhysicianPreferences:
    cached = await redis_client.get_json(physician_prefs_key(physician_id))
    if cached is not None:
        return PhysicianPreferences.model_validate(cached)
    for raw in _load_json("physician_preferences.json"):
        if raw["physician"] == physician_id:
            return PhysicianPreferences.model_validate(raw)
    return PhysicianPreferences(physician=physician_id)


def _persist_prefs(prefs: PhysicianPreferences) -> None:
    data = _load_json("physician_preferences.json")
    payload = prefs.model_dump(mode="json")
    out, found = [], False
    for raw in data:
        if raw.get("physician") == prefs.physician:
            out.append(payload)
            found = True
        else:
            out.append(raw)
    if not found:
        out.append(payload)
    _write_json("physician_preferences.json", out)


def _append_case(case: PastCase) -> None:
    data = _load_json("historical_plans.json")
    data.append(case.model_dump(mode="json"))
    _write_json("historical_plans.json", data)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_weave()
    await redis_client.connect()
    try:
        await build_index(await _load_past_cases())
    except Exception as exc:  # never block startup on indexing
        logger.warning("Vector index build failed at startup (non-blocking): %s", exc)
    yield
    await redis_client.disconnect()


app = FastAPI(title="staRT", description="Multi-agent radiation treatment planning", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/patients", response_model=list[Patient])
async def list_patients():
    try:
        return [Patient.model_validate(p) for p in _load_json("mock_patients.json")]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/patients/{patient_id}", response_model=Patient)
async def get_patient(patient_id: str):
    try:
        return _load_patient(patient_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/cases", response_model=list[PastCase])
async def list_cases():
    try:
        return await _load_past_cases()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/physicians/{physician_id}/preferences", response_model=PhysicianPreferences)
async def get_physician_preferences(physician_id: str):
    try:
        cached = await redis_client.get_json(physician_prefs_key(physician_id))
        if cached is not None:
            return PhysicianPreferences.model_validate(cached)
        for raw in _load_json("physician_preferences.json"):
            if raw["physician"] == physician_id:
                return PhysicianPreferences.model_validate(raw)
        raise HTTPException(status_code=404, detail=f"Physician {physician_id} not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/pipeline/generate", response_model=GeneratePlansResponse)
async def generate_plans(request: GeneratePlansRequest):
    """Run Agents 1 and 2 to produce top 2 challenged plans."""
    try:
        run_id = str(uuid.uuid4())
        patient = _load_patient(request.patient_id)
        prefs = await _load_prefs(request.physician_id)
        past_cases = await _load_past_cases()

        # Capture Agent 1's Weave call so physician feedback can attach to it later.
        candidates, gen_call_id = await call_op(generate_candidate_plans, patient, past_cases, prefs)
        challenged, top_two = await challenge_and_select_top_two(candidates)

        state = PipelineState(
            run_id=run_id,
            patient_id=request.patient_id,
            physician_id=request.physician_id,
            status="awaiting_feedback",
            candidates=candidates,
            challenged=challenged,
            top_two=top_two,
            metadata={"weave_generate_call_id": gen_call_id} if gen_call_id else {},
        )
        await redis_client.set_json(pipeline_key(run_id), state.model_dump(mode="json"), ttl=PIPELINE_TTL_SECONDS)
        for plan in top_two:  # let the outcome step recover the chosen plan's variables
            await redis_client.set_json(f"plan:{plan.case_id}", plan.model_dump(mode="json"), ttl=PIPELINE_TTL_SECONDS)

        return GeneratePlansResponse(run_id=run_id, top_two=top_two)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/pipeline/feedback", response_model=PhysicianFeedbackResponse)
async def submit_feedback(request: PhysicianFeedbackRequest):
    """Run Agent 3 to update physician preferences."""
    try:
        state_raw = await redis_client.get_json(pipeline_key(request.run_id))
        if state_raw is None:
            raise HTTPException(status_code=404, detail=f"Run {request.run_id} not found or expired")
        state = PipelineState.model_validate(state_raw)
        prefs = await _load_prefs(request.physician_id)

        updated, choice = await process_physician_feedback(
            request.physician_id,
            request.run_id,
            request.chosen_plan_id,
            request.reasoning,
            request.concern,
            state.top_two,
            prefs,
        )

        await redis_client.set_json(physician_prefs_key(request.physician_id), updated.model_dump(mode="json"))
        _persist_prefs(updated)
        await redis_client.append_to_list(physician_history_key(request.physician_id), choice.model_dump(mode="json"))

        state.chosen_plan_id = request.chosen_plan_id
        state.status = "feedback_received"
        await redis_client.set_json(pipeline_key(request.run_id), state.model_dump(mode="json"), ttl=PIPELINE_TTL_SECONDS)

        add_feedback(
            state.metadata.get("weave_generate_call_id"),
            reaction="👍",
            note=f"chose {request.chosen_plan_id} | reasoning: {request.reasoning} | concern: {request.concern}",
        )
        return PhysicianFeedbackResponse(physician=request.physician_id, updated_preferences=updated)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/pipeline/outcome", response_model=LogOutcomeResponse)
async def log_outcome(request: LogOutcomeRequest):
    """Run Agent 4 to log treatment outcome and grow the case history."""
    try:
        patient = _load_patient(request.patient_id)
        plan_raw = await redis_client.get_json(f"plan:{request.plan_id}")
        chosen_plan = ChallengedPlan.model_validate(plan_raw) if plan_raw is not None else None
        existing = await _load_past_cases()

        outcome, new_case = await run_log_outcome(request, patient, chosen_plan, existing)

        _append_case(new_case)
        await redis_client.append_to_list(outcome_key(request.patient_id), outcome.model_dump(mode="json"))
        await index_case(new_case, weight=outcome.outcome_weight)  # grow the retrieval corpus
        await redis_client.delete(CASES_ALL_KEY)  # invalidate cache so next run sees the new case

        return LogOutcomeResponse(outcome=outcome, case_id=new_case.case_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

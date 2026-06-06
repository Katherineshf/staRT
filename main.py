"""FastAPI application — all routes."""

from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.schemas import (
    GeneratePlansRequest,
    GeneratePlansResponse,
    LogOutcomeRequest,
    LogOutcomeResponse,
    Patient,
    PastCase,
    PhysicianFeedbackRequest,
    PhysicianFeedbackResponse,
    PhysicianPreferences,
)
from services.redis_client import redis_client

load_dotenv()

DATA_DIR = Path(__file__).parent / "data"


def _load_json(filename: str) -> list | dict:
    path = DATA_DIR / filename
    with path.open() as f:
        return json.load(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await redis_client.connect()
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
        data = _load_json("mock_patients.json")
        return [Patient.model_validate(p) for p in data]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/patients/{patient_id}", response_model=Patient)
async def get_patient(patient_id: str):
    try:
        data = _load_json("mock_patients.json")
        for raw in data:
            if raw["case_id"] == patient_id:
                return Patient.model_validate(raw)
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/cases", response_model=list[PastCase])
async def list_cases():
    try:
        cached = await redis_client.get_json("cases:all")
        if cached is not None:
            return [PastCase.model_validate(c) for c in cached]

        data = _load_json("past_cases.json")
        cases = [PastCase.model_validate(c) for c in data]
        await redis_client.set_json("cases:all", [c.model_dump(mode="json") for c in cases])
        return cases
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/physicians/{physician_id}/preferences", response_model=PhysicianPreferences)
async def get_physician_preferences(physician_id: str):
    try:
        from services.redis_client import physician_prefs_key

        cached = await redis_client.get_json(physician_prefs_key(physician_id))
        if cached is not None:
            return PhysicianPreferences.model_validate(cached)

        data = _load_json("physician_preferences.json")
        for raw in data:
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
        # Agent 1 + Agent 2 wiring will be added here
        raise NotImplementedError("Pipeline generate not yet implemented")
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/pipeline/feedback", response_model=PhysicianFeedbackResponse)
async def submit_feedback(request: PhysicianFeedbackRequest):
    """Run Agent 3 to update physician preferences."""
    try:
        raise NotImplementedError("Pipeline feedback not yet implemented")
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/pipeline/outcome", response_model=LogOutcomeResponse)
async def log_outcome(request: LogOutcomeRequest):
    """Run Agent 4 to log treatment outcome."""
    try:
        raise NotImplementedError("Pipeline outcome not yet implemented")
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

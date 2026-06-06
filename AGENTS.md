# staRT — Master Agent Specification
> Feed this file to Cursor/Codex as the top-level project context before writing any code.

---

## What This System Does

staRT is a multi-agent AI system that helps radiation oncologists plan cancer treatment.

Before a Linear Accelerator (Linac) treats a tumor, a treatment plan must be created — specifying variables like total radiation dose, number of fractions (sessions), beam angles, and technique (e.g. VMAT, IMRT). These plans are currently created manually by dosimetrists and physicians.

staRT does not calculate doses using physics equations. Instead, it reads hundreds of past treatment plans, identifies patterns in what worked for which patient profiles, and uses that — combined with ongoing physician feedback — to recommend plans for new patients. The more it's used, the better it gets.

---

## The Two Feedback Loops (What Makes It Self-Improving)

### Loop 1 — During Recommendation
When the physician picks one of the two presented plans, they say what they liked and didn't like. This is stored immediately as that physician's preference data. The next recommendation for that physician will reflect this.

### Loop 2 — Post-Treatment
After treatment (and post-MRI if available), the physician logs what actually happened: side effects, tumor response, whether they'd reuse the plan. This outcome is weighted and appended to the past cases database. Future plan generation draws from this updated history.

**The result: Recommendation 50 is measurably better than Recommendation 1.**

---

## The Four Agents

### Agent 1 — Plan Generator
- **Input:** New patient data + stored past cases + physician preference history
- **Output:** 3–5 candidate treatment plans, each varying meaningfully in dose, fractions, technique, or beam angles
- **How it works:** Uses GPT-4o to pattern-match from past cases. Does NOT use physics equations.

### Agent 2 — Devil's Advocate ("Evil Voice")
- **Input:** The 3–5 candidate plans from Agent 1
- **Output:** All plans challenged with risk scores + top 2 selected for physician review
- **How it works:** GPT-4o critiques every plan with specific numbers. Challenge format: "This plan improves CI from 1.15 to 1.07, but increases MU by 35% and raises optic apparatus Dmax by 0.4 Gy." Selects top 2 to maximize the physician's decision surface (e.g. one conservative, one aggressive).

### Agent 3 — Physician Interface
- **Input:** Top 2 challenged plans + physician feedback (what they liked/disliked, which they chose)
- **Output:** Updated physician preference profile stored in Redis + JSON file
- **How it works:** Parses natural language feedback to extract preference signals (e.g. "low MU" → sets `favors_lower_mu: true`). Appends choice to physician's history.

### Agent 4 — Outcome Logger
- **Input:** Post-treatment physician report (tumor response, side effects, would they reuse the plan)
- **Output:** Outcome stored in Redis + appended to past cases with a computed weight
- **How it works:** Computes an outcome weight (0.0–1.0) based on tumor response, side effects, and reuse intent. This weight is attached to the case so future plan generation can prioritize high-weight patterns.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI (Python) |
| Frontend | Next.js + TypeScript |
| Agentic UI | CopilotKit |
| LLM | OpenAI GPT-4o (via API) |
| Short-term state | Redis |
| Persistent storage | JSON files (mock DB for demo) |
| Observability | Weights & Biases (WandB) |
| Dev environment | Cursor + Codex |

---

## Project File Structure

```
staRT/
├── AGENTS.md                        ← this file
├── main.py                          ← FastAPI app, all routes
├── requirements.txt
├── .env.example
│
├── agents/
│   ├── plan_generator.py            ← Agent 1
│   ├── devils_advocate.py           ← Agent 2
│   ├── physician_interface.py       ← Agent 3
│   └── outcome_logger.py            ← Agent 4
│
├── models/
│   └── schemas.py                   ← All Pydantic data models
│
├── services/
│   ├── redis_client.py              ← Redis helpers + key conventions
│   └── wandb_logger.py              ← WandB logging for pipeline runs
│
├── data/
│   ├── mock_patients.json           ← 3 demo patients
│   ├── past_cases.json              ← Historical cases (grows over time)
│   └── physician_preferences.json  ← Physician profiles (updated by Agent 3)
│
└── frontend/                        ← Next.js app (separate spec: FRONTEND.md)
```

---

## Redis Key Conventions

All Redis keys follow a namespaced pattern. Codex must use these exact key formats:

| Key | Type | Purpose |
|-----|------|---------|
| `pipeline:{run_id}` | String (JSON) | Full pipeline state, TTL 1 hour |
| `physician:prefs:{physician_id}` | String (JSON) | Current preference snapshot |
| `physician:history:{physician_id}` | List | Append-only choice history |
| `outcome:{patient_id}` | List | All outcomes for a patient |
| `cases:all` | String (JSON) | Cached past cases (invalidated on new outcome) |

---

## Data Flow (One Full Run)

```
New patient arrives
       ↓
Agent 1 reads: past_cases.json + physician:prefs:{id} from Redis
Agent 1 calls GPT-4o → generates 3–5 candidate plans
       ↓
Agent 2 receives candidate plans
Agent 2 calls GPT-4o → challenges each plan, picks top 2
       ↓
Top 2 plans stored in Redis: pipeline:{run_id}
Frontend (CopilotKit) displays top 2 to physician
       ↓
Physician picks one, says what they liked/disliked
Agent 3 updates physician:prefs:{id} in Redis + physician_preferences.json
       ↓
Treatment happens (simulated in demo)
       ↓
Physician logs outcome
Agent 4 computes weight, appends to past_cases.json + Redis
Cache invalidated → next run picks up new case
```

---

## WandB Logging Requirements

Every pipeline run must log to WandB:
- Step 1 (Agent 1): number of candidates generated, generation rationale
- Step 2 (Agent 2): risk scores per plan, which two were selected, selection rationale
- Step 3 (Agent 3): physician ID, chosen plan ID, liked/disliked text
- Step 4 (Agent 4): outcome weight, tumor response, side effect count

Log candidate plans and challenged plans as WandB Tables so judges can see side-by-side comparison in the dashboard.

---

## Rules for Codex/Cursor

1. All LLM calls use `gpt-4o` via the OpenAI Python SDK (`AsyncOpenAI`).
2. All LLM calls must request `response_format={"type": "json_object"}` and parse the response as JSON.
3. All agent functions must be `async`.
4. Redis reads always check cache first, fall back to JSON file if miss.
5. Never hardcode patient data or physician IDs in agent logic — always read from data files or Redis.
6. Every route in `main.py` must be wrapped in try/except and return a clean HTTP 500 with the error message.
7. Pydantic models in `schemas.py` are the single source of truth for all data shapes. Do not define inline dicts in agent files.
8. WandB logging is non-blocking — if it fails, the pipeline continues.

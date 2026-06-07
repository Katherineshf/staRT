# staRT

**Multi-agent treatment planning support for radiation oncology.**

staRT helps radiation oncologists plan cancer treatment. Before a Linear Accelerator (Linac) treats a tumor, a treatment plan must specify variables like total dose, number of fractions, technique (VMAT/IMRT), and beam/arc setup. These plans are normally built by hand.

staRT does **not** compute doses with physics equations. Instead it embeds and retrieves the most similar past treatment plans and pattern-matches them against the new patient with GPT-4o to propose candidate plans. Physician feedback is captured into profile, and an offline evaluation shows that applying a learned profile scores better than a cold start.

> ⚠️ All patient data and cases in this repo are **synthetic** and exist for hackathon/demo purposes only. Nothing here is clinically validated.

This is a full-stack app: a **FastAPI** backend (the agents + retrieval + observability), a **Next.js** frontend, and a **Weave evaluation** harness that produces the "Rec 1 vs Rec 50" scorecard.

### 🔗 Live demo

| | URL |
|---|-----|
| **App (frontend)** | https://sta-rt.vercel.app |
| **API (backend)** | https://start-igph.onrender.com  ·  [`/docs`](https://start-igph.onrender.com/docs)  ·  [`/health`](https://start-igph.onrender.com/health) |

> Backend runs on a free tier and sleeps when idle — the first request after inactivity cold-starts in ~30–50s, then it's fast.

---

## Physician feedback

When the physician picks one of the two presented plans and gives their clinical **reasoning** (why this plan) plus any **concern** (what they'd change), Agent 3 parses that into structured preference signals and stores them to the physician's profile (Redis + `physician_preferences.json`). Profiles ship **empty** and accumulate signals as feedback is given — so they don't shape live recommendations until a physician has built one up.

The payoff of preferences is shown separately in the **evals**: applying a demo *learned* profile across the corpus scores better than a cold (no-preferences) start — "Rec 50 > Rec 1".

---

## The agents

The app runs three agents per recommendation:

| # | Agent | File | Role |
|---|-------|------|------|
| 1 | **Plan Generator** | [agents/plan_generator.py](agents/plan_generator.py) | Retrieves similar cases from the vector store, pattern-matches into 3–5 candidate plans (gpt-4o). |
| 2 | **Devil's Advocate** | [agents/devils_advocate.py](agents/devils_advocate.py) | Critiques every plan with concrete numbers, assigns a risk score, picks the top 2 to span the decision — e.g. one conservative, one aggressive (gpt-4o). |
| 3 | **Physician Interface** | [agents/physician_interface.py](agents/physician_interface.py) | Parses the physician's free-text `reasoning` + `concern` into preference signals (gpt-4o). |

---

## Architecture

```
Next.js frontend (frontend/)
  • getPatient(PAT-001) → GET /patients/{id}
  • generatePlans()     → POST /pipeline/generate   (Agents 1 + 2)
  • submitFeedback()    → POST /pipeline/feedback    (Agent 3)
        │
        ▼
FastAPI backend (main.py)

  POST /pipeline/generate
   Agent 1 — Plan Generator
     • embeds patient, VSIM-searches cases:vset for nearest neighbours
     • reads physician:prefs:{id} (Redis → JSON fallback)
     • gpt-4o → 3–5 candidate plans
   Agent 2 — Devil's Advocate
     • gpt-4o → risk score + challenge per plan, selects top 2
   → caches PipelineState at pipeline:{run_id} (TTL 1h), returns top_two

  POST /pipeline/feedback
   Agent 3 — Physician Interface
     • gpt-4o parses reasoning + concern → updates physician:prefs:{id}
       + physician_preferences.json; appends to physician:history:{id}
     • attaches Weave feedback to the original generate call
```

### Data (current)

Lives in [data/](data/) as JSON (the demo's mock DB):

- **`historical_plans.json`** — the 20-case corpus the live app and evals both run on (this replaced the older `past_cases.json`).
- **`mock_patients.json`** — demo patients (`PAT-001` …).
- **`physician_preferences.json`** — physician profiles, updated by Agent 3.

### Retrieval — Redis Vector Sets

[services/vector_store.py](services/vector_store.py) embeds each case with `text-embedding-3-small` (1536 dims) and stores it as an element in a single Redis vector set `cases:vset` (`VADD`/`VSIM`), with tumor type and physician as JSON attributes. Agent 1 embeds the new patient and asks Redis for nearest neighbours, optionally filtered by tumor type.

Redis 8's vector set is new enough that `redis-py` has no typed API yet, so commands go through `execute_command(...)`. If the server lacks vector-set support, the store **degrades to an in-memory cosine search** so the demo never hard-fails.

### Observability — Weave (primary) + WandB

Every agent function and every OpenAI call is a [Weave](services/weave_tracing.py) op, so each pipeline run shows up as a nested trace tree (agent op → `openai_chat_json` / `openai_embed` children). Physician feedback (Loop 1) is attached as a reaction + note on the original generate call so you can see human signal on the trace in the Weave UI. A [WandB logger](services/wandb_logger.py) wrapper is also available. All observability is **non-blocking** — if init or logging fails, the pipeline continues.

---

## Evaluation — the "Rec 1 vs Rec 50" scorecard

[evals/run_eval.py](evals/run_eval.py) is the judge-facing payoff. It wraps Agent 1 as a `weave.Model` and runs `weave.Evaluation` over the 20 historical cases **twice**:

1. **COLD** — no learned physician preferences (baseline, "Rec 1").
2. **LEARNED** — a demo learned preference profile applied ("Rec 50").

Both runs land in the Weave UI as an Evaluations scorecard; the learned run should beat the cold run. Five scorers in [evals/scorers.py](evals/scorers.py) grade the top recommendation against the ground-truth historical plan:

| Scorer | Measures |
|--------|----------|
| `coverage_score` | target coverage ≥ 95% |
| `conformity_score` | conformity index near 1.0 |
| `oar_safety_score` | OAR Dmax within tolerance of the reference |
| `mu_efficiency_score` | lower monitor units (delivery cost) |
| `physician_alignment_score` | match to the physician's stated preferences (cold run returns `None`) |

**Leakage guard:** Agent 1 retrieves from the same 20-case vector set, so the model wrapper hands it a *leave-one-out* corpus (every case except the row's own `case_id`) — it can never retrieve and copy its own ground truth.

Run it (needs Redis up + a populated `.env`; makes ~40 real gpt-4o calls):

```bash
python -m evals.run_eval
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI + Uvicorn (Python, fully async) |
| Frontend | Next.js 16 + React 19 + Tailwind v4 + TypeScript |
| LLM | OpenAI `gpt-4o` (JSON mode) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Retrieval | Redis 8 Vector Sets (in-memory cosine fallback) |
| Short-term state | Redis (async) |
| Persistent storage | JSON files in `data/` (mock DB) |
| Observability + evals | Weave + Weights & Biases |
| Schemas | Pydantic v2 (`extra="forbid"` strict models) |

---

## Project layout

```
staRT/
├── main.py                  ← FastAPI app + all routes
├── requirements.txt
├── .env.example
├── AGENTS.md                ← original master agent spec
│
├── agents/                  ← the agents (see table above)
├── models/schemas.py        ← Pydantic models, single source of truth
├── services/
│   ├── openai_client.py     ← gpt-4o chat (JSON) + embeddings, both Weave ops
│   ├── redis_client.py      ← async Redis wrapper + key conventions
│   ├── vector_store.py      ← Redis vector-set retrieval + fallback
│   ├── weave_tracing.py     ← Weave init / op decorator / feedback
│   └── wandb_logger.py      ← non-blocking WandB wrapper
│
├── evals/                   ← Weave Evaluation harness (cold vs learned)
│   ├── run_eval.py          ← entrypoint: python -m evals.run_eval
│   ├── dataset.py           ← builds rows from historical_plans.json
│   └── scorers.py           ← 5 plan-quality scorers
│
├── data/
│   ├── historical_plans.json    ← 20-case corpus (app + evals)
│   ├── mock_patients.json       ← demo patients (PAT-001…)
│   └── physician_preferences.json ← profiles, updated by Agent 3
│
└── frontend/                ← Next.js app
    ├── app/page.tsx         ← Patient View + Recommendation Engine UI
    ├── lib/api.ts           ← typed fetch client for the backend
    ├── lib/mapPlan.ts       ← maps API plans → view models
    └── lib/types.ts         ← TS mirrors of the API schemas
```

---

## API

| Method | Path | Purpose | Called by UI? |
|--------|------|---------|---------------|
| `GET` | `/health` | Liveness check | — |
| `GET` | `/patients` | List demo patients | — |
| `GET` | `/patients/{patient_id}` | Fetch one patient | ✅ |
| `GET` | `/cases` | List historical cases | — |
| `GET` | `/physicians/{physician_id}/preferences` | Current preference profile | — |
| `POST` | `/pipeline/generate` | Run Agents 1 + 2 → `{ run_id, top_two }` | ✅ |
| `POST` | `/pipeline/feedback` | Run Agent 3 → updated preferences | ✅ |

Every route is wrapped in try/except and returns a clean HTTP 500 with the error message; CORS is open (`*`) for the frontend.

### Redis key conventions

| Key | Type | Purpose |
|-----|------|---------|
| `pipeline:{run_id}` | JSON string | Full pipeline state, TTL 1h |
| `plan:{plan_id}` | JSON string | A top-2 plan cached during generate |
| `physician:prefs:{id}` | JSON string | Current preference snapshot |
| `physician:history:{id}` | List | Append-only choice history |
| `cases:all` | JSON string | Cached historical-plans corpus |
| `cases:vset` | Vector set | Embedded cases for similarity search |

---

## Getting started

### Prerequisites
- Python 3.11+, Node 18+
- An OpenAI API key
- Redis 8 (for vector sets); the app still runs without it via in-memory fallback
- A Weights & Biases account + `WANDB_ENTITY` (required for Weave traces/evals)

### Backend

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in OPENAI_API_KEY and WANDB_ENTITY (others optional)
uvicorn main:app --reload
```

Root `.env` keys:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_EMBED_MODEL=text-embedding-3-small
REDIS_URL=redis://localhost:6379/0
WANDB_API_KEY=...
WANDB_PROJECT=staRT
WANDB_ENTITY=your-entity     # required; weave.init() fails silently if empty
WEAVE_ENABLED=true
WEAVE_PROJECT=               # optional; falls back to WANDB_ENTITY/WANDB_PROJECT
```

On startup the app initializes Weave, connects to Redis, and builds the vector index from `data/historical_plans.json` (non-blocking — startup never fails on indexing). Interactive API docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Open `http://localhost:3000`. The UI currently targets a fixed demo patient/physician (`PAT-001` / `PHY-001`) and sends empty liked/disliked text — the patient/physician pickers and feedback fields are a deferred UI round (see notes in `app/page.tsx`).

### Example: run one recommendation via the API

```bash
curl -s -X POST localhost:8000/pipeline/generate \
  -H 'content-type: application/json' \
  -d '{"patient_id":"PAT-001","physician_id":"PHY-001"}'
```

Then submit feedback with the chosen plan, the physician's `reasoning` (required) and an optional `concern`:

```bash
curl -s -X POST localhost:8000/pipeline/feedback \
  -H 'content-type: application/json' \
  -d '{"run_id":"<run_id>","physician_id":"PHY-001","chosen_plan_id":"<id>",
       "reasoning":"Best OAR sparing for the optic apparatus","concern":"MU is a bit high"}'
```

---

## Deployment

The live demo runs as two public services, deployed from the **`main`** branch (pushing to it auto-redeploys both hosts):

| Service | Host | URL | How |
|---------|------|-----|-----|
| Backend | **Render** web service | https://start-igph.onrender.com | Build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`, root = repo root |
| Frontend | **Vercel** | https://sta-rt.vercel.app | **Root Directory = `frontend`**, **Framework Preset = Next.js** (must be set explicitly), build `next build` |
| Redis | Managed (Upstash / Railway / Render Key-Value) | — | Connection string → backend `REDIS_URL` |

**Backend env vars (on Render):** `OPENAI_API_KEY` and `REDIS_URL` are required; `OPENAI_MODEL`, `OPENAI_EMBED_MODEL`, and the `WANDB_*` / `WEAVE_*` keys are optional (Weave/WandB are non-blocking). **Frontend env var (on Vercel):** `NEXT_PUBLIC_API_URL` = the backend's public URL (no trailing slash).

Notes:
- **Redis Vector Sets are a bonus, not a hard dependency.** If the managed Redis lacks Redis 8 vector-set support, the backend silently falls back to in-memory cosine search and still works.
- **Free-tier cold starts (~50s).** The first request after idle wakes the backend; a frontend "Could not reach the backend" usually means a cold start or a wrong `NEXT_PUBLIC_API_URL`.
- **If Vercel serves `404: NOT_FOUND` on a successful build,** the Framework Preset is likely "Other" instead of **Next.js** — Vercel then looks for a static `index.html`, finds none, and 404s. Set the preset to Next.js and **redeploy** (settings don't apply to an already-built deployment).
- CORS is already open (`allow_origins=["*"]`), so the Vercel frontend can call the Render backend directly.

## Conventions for contributors

1. All LLM calls use `gpt-4o` via `AsyncOpenAI` in JSON mode (`response_format={"type":"json_object"}`).
2. All agent functions are `async`.
3. Reads check Redis first, fall back to JSON files on a miss.
4. [models/schemas.py](models/schemas.py) is the single source of truth — no inline dicts in agent logic. Strict models forbid extra keys, so LLM output is filtered to declared fields before validation.
5. Never hardcode patient or physician IDs in agent logic — read from data files or Redis.
6. Observability is best-effort: Weave/WandB failures must never break the pipeline.
</content>

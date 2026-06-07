// Typed fetch client for the staRT FastAPI backend.
// Base URL comes from NEXT_PUBLIC_API_URL (see .env.local.example); defaults to
// the local uvicorn dev server. CORS is open on the backend, and page.tsx is a
// client component, so client-side fetch is fine.

import type {
  GeneratePlansRequest,
  GeneratePlansResponse,
  Patient,
  PhysicianFeedbackRequest,
  PhysicianFeedbackResponse,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // Network-level failure (backend down, CORS, DNS). Surface a clear message.
    throw new ApiError(0, `Could not reach the backend at ${API_BASE}. Is it running?`);
  }

  if (!res.ok) {
    // FastAPI errors come back as { detail: ... }.
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* response had no JSON body */
    }
    throw new ApiError(res.status, detail);
  }

  return res.json() as Promise<T>;
}

export function getPatient(patientId: string): Promise<Patient> {
  return request<Patient>(`/patients/${encodeURIComponent(patientId)}`);
}

// Runs Agents 1 + 2. SLOW (LLM) and can fail — callers should show pending/error UI.
export function generatePlans(body: GeneratePlansRequest): Promise<GeneratePlansResponse> {
  return request<GeneratePlansResponse>("/pipeline/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Runs Agent 3 — records the physician's chosen plan and updates their preferences.
export function submitFeedback(
  body: PhysicianFeedbackRequest,
): Promise<PhysicianFeedbackResponse> {
  return request<PhysicianFeedbackResponse>("/pipeline/feedback", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

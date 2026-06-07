// TypeScript mirror of the backend Pydantic schemas (models/schemas.py).
// The backend is the source of truth; these types follow its contract exactly.
// Numeric clinical metrics are nullable on the backend (`float | None`) and are
// typed `number | null` here so the UI must null-guard rather than assume.

export type TumorResponse = "complete" | "partial" | "stable" | "progression";
export type RiskTolerance = "conservative" | "balanced" | "aggressive";

export interface PatientFeatures {
  age: number;
  sex: string;
  condition: string;
  prior_radiation?: boolean | null;
  recurrent_disease?: boolean | null;
}

export interface OARFeature {
  type: string;
  distance_to_tumor_mm?: number | null;
}

export interface CaseFeatures {
  tumor_type: string;
  target_volume_cc: number;
  prescription_gy?: number | null;
  fractions?: number | null;
  oars: OARFeature[];
}

export interface PlanningVariables {
  algorithm?: string | null;
  arcs?: number | null;
  arc_type?: string | null;
  ptv_margin_mm?: number | null;
  oar_prv_margins_mm: Record<string, number>;
  target_priority?: string | null;
  normal_tissue_priority?: string | null;
  modulation_level?: string | null;
}

export interface OARResult {
  type: string;
  dmax_gy?: number | null;
  d0_2_gy?: number | null;
  d0_5_gy?: number | null;
  d1cc_gy?: number | null;
  mean_gy?: number | null;
  v12_cc?: number | null;
}

export interface PlanResults {
  ci?: number | null;
  gi?: number | null;
  v12_cc?: number | null;
  mu?: number | null;
  coverage_percent?: number | null;
  oar_results: OARResult[];
}

// HistoricalPlan — the shared base shape. Patient is the same shape (a case to plan),
// identified by `case_id` (e.g. "PAT-001").
export interface HistoricalPlan {
  case_id: string;
  patient_features: PatientFeatures;
  case_features: CaseFeatures;
  planning_variables: PlanningVariables;
  results: PlanResults;
  physician: string;
}

export type Patient = HistoricalPlan;
export type PastCase = HistoricalPlan;

// CandidatePlan (Agent 1) + ChallengedPlan (Agent 2) extend HistoricalPlan.
export interface ChallengedPlan extends HistoricalPlan {
  rationale?: string | null;
  source_case_ids: string[];
  risk_score: number; // 0..1
  challenge: string;
  selected_for_review: boolean;
}

export interface PhysicianPreferences {
  physician: string;
  favors_lower_mu?: boolean | null;
  prioritizes_oar_sparing?: boolean | null;
  favors_target_coverage?: boolean | null;
  preferred_technique?: string | null;
  risk_tolerance?: RiskTolerance | null;
  notes: string[];
  signals: Record<string, unknown>;
  updated_at: string;
}

// --- API request / response shapes ---

export interface GeneratePlansRequest {
  patient_id: string;
  physician_id: string;
}

export interface GeneratePlansResponse {
  run_id: string;
  top_two: ChallengedPlan[];
}

export interface PhysicianFeedbackRequest {
  run_id: string;
  physician_id: string;
  chosen_plan_id: string;
  liked: string;
  disliked: string;
}

export interface PhysicianFeedbackResponse {
  physician: string;
  updated_preferences: PhysicianPreferences;
}

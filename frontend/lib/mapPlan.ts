// Maps backend shapes (Patient, ChallengedPlan) into the view models the UI cards
// consume. This is the single place that formats numbers and null-guards the many
// nullable backend fields. The rule: show the real value or an honest placeholder
// (DASH) — never fabricate. Backend metrics are numeric; the UI shows strings.

import type { ChallengedPlan, Patient } from "./types";

export const DASH = "—"; // honest "not provided by the backend" placeholder

const fmt = (n: number | null | undefined, suffix = "", digits = 1): string =>
  n === null || n === undefined ? DASH : `${Number(n).toFixed(digits)}${suffix}`;

const pct = (n: number | null | undefined) => fmt(n, "%", 1);
const gy = (n: number | null | undefined) => fmt(n, " Gy", 1);
const cc = (n: number | null | undefined) => fmt(n, " cc", 1);
const ci = (n: number | null | undefined) => fmt(n, "", 2);

const text = (s: string | null | undefined): string =>
  s && s.trim() ? s : DASH;

// --- Patient view model (the "inputs" — a case to plan, mostly empty until planned) ---

export interface OarInput {
  type: string;
  distance: string;
}

export interface PatientView {
  caseId: string;
  condition: string;
  age: string;
  sex: string;
  tumorType: string;
  targetVolume: string;
  prescription: string; // "12 Gy / 1 fx" or DASH
  physician: string;
  oars: OarInput[]; // case_features.oars — often empty for unplanned patients
}

export function mapPatient(p: Patient): PatientView {
  const rx = p.case_features.prescription_gy;
  const fx = p.case_features.fractions;
  const prescription =
    rx === null || rx === undefined
      ? DASH
      : `${gy(rx)}${fx ? ` / ${fx} fx` : ""}`;

  return {
    caseId: p.case_id,
    condition: text(p.patient_features.condition),
    age: p.patient_features.age != null ? String(p.patient_features.age) : DASH,
    sex: text(p.patient_features.sex),
    tumorType: text(p.case_features.tumor_type),
    targetVolume: cc(p.case_features.target_volume_cc),
    prescription,
    physician: text(p.physician),
    oars: (p.case_features.oars ?? []).map((o) => ({
      type: o.type,
      distance: fmt(o.distance_to_tumor_mm, " mm"),
    })),
  };
}

// --- Strategy view model (the "outputs" — a generated + challenged plan) ---

export type StrategyId = "A" | "B";

export interface OarDose {
  type: string;
  dmax: string;
}

export interface Strategy {
  id: StrategyId; // positional label for the A/B card layout
  caseId: string; // real ChallengedPlan.case_id ("CAND-…") — used as chosen_plan_id
  name: string; // factual technique descriptor derived from real fields
  intent: string; // planning-priority summary from real fields
  details: string[]; // planning_variables, present values only
  rationale: string; // Agent 1 reasoning (real) or DASH
  challenge: string; // Agent 2 "evil voice" critique (real) or DASH
  riskScore: string; // Agent 2 risk_score 0..1 (real) or DASH
  metrics: {
    coverage: string;
    ci: string;
    gi: string;
    maxOarDose: string; // highest dmax across oar_results — general, not pituitary-specific
    v12: string;
  };
  planning: {
    algorithm: string;
    arcs: string;
    arcType: string;
    ptvMargin: string;
    targetPriority: string;
    oarPriority: string;
  };
  oarResults: OarDose[]; // dynamic — whatever OARs the plan actually reports
}

export function mapStrategy(plan: ChallengedPlan, id: StrategyId): Strategy {
  const pv = plan.planning_variables;
  const r = plan.results;

  const algorithm = text(pv.algorithm);
  const arcs = pv.arcs != null ? String(pv.arcs) : DASH;
  const arcType = text(pv.arc_type);
  const ptvMargin = fmt(pv.ptv_margin_mm, " mm");
  const targetPriority = text(pv.target_priority);
  const oarPriority = text(pv.normal_tissue_priority);

  // details pills — include only fields the backend actually provided
  const details: string[] = [];
  if (pv.algorithm) details.push(pv.algorithm);
  if (pv.arcs != null) details.push(`${pv.arcs} ${pv.arc_type ?? ""} arc${pv.arcs === 1 ? "" : "s"}`.replace(/\s+/g, " ").trim());
  if (pv.ptv_margin_mm != null) details.push(`${ptvMargin} PTV margin`);
  if (pv.modulation_level) details.push(`${pv.modulation_level} modulation`);

  // name: factual technique label from real fields (no interpretation/fabrication)
  const name =
    pv.algorithm && pv.arcs != null
      ? `${pv.algorithm} · ${pv.arcs}-arc`
      : pv.target_priority
        ? `${pv.target_priority} target priority`
        : `Strategy ${id}`;

  // intent: priority summary from real fields
  const intent =
    pv.target_priority || pv.normal_tissue_priority
      ? `Target ${targetPriority} / OAR ${oarPriority}`
      : DASH;

  const oarResults: OarDose[] = (r.oar_results ?? []).map((o) => ({
    type: o.type,
    dmax: gy(o.dmax_gy),
  }));
  const dmaxValues = (r.oar_results ?? [])
    .map((o) => o.dmax_gy)
    .filter((v): v is number => v !== null && v !== undefined);
  const maxOarDose = dmaxValues.length ? gy(Math.max(...dmaxValues)) : DASH;

  return {
    id,
    caseId: plan.case_id,
    name,
    intent,
    details,
    rationale: text(plan.rationale),
    challenge: text(plan.challenge),
    riskScore: plan.risk_score != null ? plan.risk_score.toFixed(2) : DASH,
    metrics: {
      coverage: pct(r.coverage_percent),
      ci: ci(r.ci),
      gi: ci(r.gi),
      maxOarDose,
      v12: cc(r.v12_cc),
    },
    planning: { algorithm, arcs, arcType, ptvMargin, targetPriority, oarPriority },
    oarResults,
  };
}

// Maps the two-element top_two (always exactly 2 from the backend) to A/B by position,
// guarding against an unexpected length so the UI degrades gracefully.
export function mapTopTwo(topTwo: ChallengedPlan[]): Record<StrategyId, Strategy> | null {
  if (!topTwo || topTwo.length < 2) return null;
  return {
    A: mapStrategy(topTwo[0], "A"),
    B: mapStrategy(topTwo[1], "B"),
  };
}

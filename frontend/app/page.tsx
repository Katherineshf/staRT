"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, generatePlans, getPatient, submitFeedback } from "@/lib/api";
import { DASH, mapPatient, mapTopTwo } from "@/lib/mapPlan";
import type { PatientView as PatientVM, Strategy, StrategyId } from "@/lib/mapPlan";

type Page = "patient" | "engine";

// Wiring stubs — patient/physician pickers and the liked/disliked free-text fields
// are a deferred UI round, so for now we target a fixed demo patient/physician and
// send empty feedback text (see task notes).
const PATIENT_ID = "PAT-001";
const PHYSICIAN_ID = "PHY-001";

const pageLabels: Record<Page, string> = {
  patient: "Patient View",
  engine: "Recommendation Engine",
};

export default function Home() {
  const [activePage, setActivePage] = useState<Page>("patient");
  const [patient, setPatient] = useState<PatientVM | null>(null);

  const [strategies, setStrategies] =
    useState<Record<StrategyId, Strategy> | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [selectedStrategyId, setSelectedStrategyId] =
    useState<StrategyId | null>(null);
  const [acceptedStrategyId, setAcceptedStrategyId] =
    useState<StrategyId | null>(null);
  // Persists Agent 3's learned note after the success modal is dismissed, so the
  // Activity Log can show Agent 3's contribution for the rest of the run.
  const [acceptedNote, setAcceptedNote] = useState<string | null>(null);
  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<{ note: string | null } | null>(
    null,
  );
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackConcern, setFeedbackConcern] = useState("");

  const selectedStrategy =
    strategies && selectedStrategyId ? strategies[selectedStrategyId] : null;

  // Load the (stubbed) patient once so the Patient View shows real case data.
  useEffect(() => {
    let cancelled = false;
    getPatient(PATIENT_ID)
      .then((p) => {
        if (!cancelled) setPatient(mapPatient(p));
      })
      .catch(() => {
        /* leave patient null; cards fall back to honest placeholders */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Generate Recommendations" — runs Agents 1 + 2 (slow, can fail).
  const generate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await generatePlans({
        patient_id: PATIENT_ID,
        physician_id: PHYSICIAN_ID,
      });
      const mapped = mapTopTwo(res.top_two);
      if (!mapped) throw new Error("Backend returned fewer than two plans.");
      setStrategies(mapped);
      setRunId(res.run_id);
      setSelectedStrategyId(null);
      setAcceptedStrategyId(null);
      setAcceptedNote(null);
    } catch (err) {
      setGenerateError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to generate recommendations.",
      );
    } finally {
      setGenerating(false);
    }
  }, []);

  function selectStrategy(id: StrategyId) {
    setSelectedStrategyId(id);
    setActivePage("patient");
  }

  function closeSaveModal() {
    setSavePlanOpen(false);
    setSaveError(null);
    setSaveSuccess(null);
    setFeedbackReason("");
    setFeedbackConcern("");
  }

  // Modal "Accept & Save" — records the chosen plan and the physician's free-text
  // reasoning via Agent 3 (POST /pipeline/feedback). The reasoning is what lets
  // Agent 3 actually learn preferences; concern is optional context.
  async function saveCurrentPlan() {
    const chosen = selectedStrategy ?? (strategies ? strategies.A : null);
    if (!chosen || !runId) {
      setSaveError("Generate recommendations before saving a plan.");
      return;
    }
    if (!feedbackReason.trim()) {
      setSaveError("Add your reasoning for choosing this plan before saving.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await submitFeedback({
        run_id: runId,
        physician_id: PHYSICIAN_ID,
        chosen_plan_id: chosen.caseId,
        reasoning: feedbackReason.trim(),
        concern: feedbackConcern.trim() || null,
      });
      const notes = res.updated_preferences.notes;
      const note = notes.length ? notes[notes.length - 1] : null;
      setAcceptedStrategyId(chosen.id);
      setAcceptedNote(note);
      setSaveSuccess({ note });
    } catch (err) {
      setSaveError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to save the plan.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#d9d9d7] px-4 py-6 text-[#111111] sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-[1440px] rounded-[28px] bg-[#f6f6f4] p-5 shadow-[0_22px_70px_rgba(15,23,42,0.14)] sm:p-7">
        <TopBar activePage={activePage} onNavigate={setActivePage} />

        <div className="mt-7">
          {activePage === "patient" && (
            <PatientView
              patient={patient}
              selectedStrategy={selectedStrategy}
              accepted={Boolean(
                selectedStrategy && acceptedStrategyId === selectedStrategy.id,
              )}
              onAccept={() => setSavePlanOpen(true)}
            />
          )}
          {activePage === "engine" && (
            <RecommendationEngine
              strategies={strategies}
              runId={runId}
              generating={generating}
              generateError={generateError}
              onGenerate={generate}
              acceptedStrategyId={acceptedStrategyId}
              acceptedNote={acceptedNote}
              selectedStrategyId={selectedStrategyId}
              onSelectStrategy={selectStrategy}
            />
          )}
        </div>
      </div>
      {savePlanOpen && (
        <SaveCurrentPlanModal
          strategy={selectedStrategy}
          patient={patient}
          saving={saving}
          error={saveError}
          success={saveSuccess}
          reason={feedbackReason}
          concern={feedbackConcern}
          onReasonChange={setFeedbackReason}
          onConcernChange={setFeedbackConcern}
          onClose={closeSaveModal}
          onSave={saveCurrentPlan}
        />
      )}
    </main>
  );
}

function TopBar({
  activePage,
  onNavigate,
}: {
  activePage: Page;
  onNavigate: (page: Page) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex items-center gap-3">
        <div className="relative size-9 rounded-xl bg-black">
          <span className="absolute left-1/2 top-1/2 h-6 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white" />
          <span className="absolute left-1/2 top-1/2 h-2 w-6 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white" />
        </div>
        <div>
          <p className="text-xl font-semibold tracking-tight">staRT</p>
          <p className="text-xs font-medium text-neutral-500">
            Decision Support Only
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-1 rounded-full bg-white px-2 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        {(Object.keys(pageLabels) as Page[]).map((page) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activePage === page
                ? "bg-[#111111] text-white shadow-inner"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-black"
            }`}
          >
            {pageLabels[page]}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-neutral-600 shadow-sm">
          Synthetic Preview
        </span>
        <div className="grid size-11 place-items-center rounded-full bg-[#d3c399] text-sm font-bold text-black">
          DS
        </div>
      </div>
    </header>
  );
}

function PatientView({
  patient,
  selectedStrategy,
  accepted,
  onAccept,
}: {
  patient: PatientVM | null;
  selectedStrategy: Strategy | null;
  accepted: boolean;
  onAccept: () => void;
}) {
  const subtitle = !selectedStrategy
    ? "Select a strategy in the Recommendation Engine to review it here."
    : accepted
      ? "✓ Saved to the learning database. This case is complete."
      : "Review the plan below, then accept it to save to the learning database.";

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-medium text-neutral-500">Patient View</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {selectedStrategy
              ? `Reviewing ${selectedStrategy.name}`
              : "No strategy selected"}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
        </div>
        <button
          onClick={onAccept}
          disabled={!selectedStrategy || accepted}
          className="rounded-full bg-[#46d47b] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#37c06b] disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          {accepted ? "Strategy Accepted ✓" : "Accept Strategy"}
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <GeneralPlanCard patient={patient} strategy={selectedStrategy} />
        <DvhPreviewCard strategy={selectedStrategy} />
        <TumorInputOutputCard patient={patient} strategy={selectedStrategy} />
        <OarInputOutputCard patient={patient} strategy={selectedStrategy} />
      </div>
    </div>
  );
}

function RecommendationEngine({
  strategies,
  runId,
  generating,
  generateError,
  onGenerate,
  acceptedStrategyId,
  acceptedNote,
  selectedStrategyId,
  onSelectStrategy,
}: {
  strategies: Record<StrategyId, Strategy> | null;
  runId: string | null;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
  acceptedStrategyId: StrategyId | null;
  acceptedNote: string | null;
  selectedStrategyId: StrategyId | null;
  onSelectStrategy: (id: StrategyId) => void;
}) {
  const list = strategies ? Object.values(strategies) : [];

  return (
    <div className="space-y-7">
      <WorkflowProgress
        hasStrategies={Boolean(strategies)}
        acceptedStrategyId={acceptedStrategyId}
        selectedStrategyId={selectedStrategyId}
      />

      <WhitePanel
        title="Strategy Recommendations"
        action={
          <button
            onClick={onGenerate}
            disabled={generating}
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500"
          >
            {generating
              ? "Generating…"
              : strategies
                ? "Regenerate"
                : "Generate Recommendations"}
          </button>
        }
      >
        {generateError && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {generateError}
          </div>
        )}

        {list.length === 0 ? (
          <EmptyState
            title={
              generating ? "Generating recommendations…" : "No recommendations yet"
            }
            copy={
              generating
                ? "Agents 1 and 2 are pattern-matching similar cases and stress-testing each plan. This can take a moment."
                : "Run the recommendation engine to generate two challenged strategies for this patient."
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {list.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                selected={selectedStrategyId === strategy.id}
                strategy={strategy}
                onSelect={() => onSelectStrategy(strategy.id)}
              />
            ))}
          </div>
        )}
      </WhitePanel>

      <BlackPanel
        title="Agent Activity Log"
        kicker="Decision Support Only"
        action={<DarkBadge>Live run data</DarkBadge>}
      >
        <ActivityLog
          runId={runId}
          strategies={list}
          acceptedStrategyId={acceptedStrategyId}
          learnedNote={acceptedNote}
        />
      </BlackPanel>
    </div>
  );
}

function StrategyCard({
  strategy,
  selected,
  onSelect,
}: {
  strategy: Strategy;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`rounded-[22px] p-5 shadow-sm transition ${
        selected
          ? "bg-[#111111] text-white"
          : "border border-white bg-white text-black"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={selected ? "text-white/55" : "text-neutral-400"}>
            Strategy {strategy.id}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {strategy.name}
          </h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            selected ? "bg-white text-black" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          Risk {strategy.riskScore}
        </span>
      </div>

      <div className="mt-5 grid gap-2">
        {strategy.details.map((detail) => (
          <div
            key={detail}
            className={`rounded-2xl px-4 py-3 text-sm ${
              selected ? "bg-white/10 text-white/80" : "bg-neutral-50 text-neutral-600"
            }`}
          >
            {detail}
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SmallStat label="Coverage" value={strategy.metrics.coverage} dark={selected} />
        <SmallStat label="CI" value={strategy.metrics.ci} dark={selected} />
        <SmallStat label="GI" value={strategy.metrics.gi} dark={selected} />
        <SmallStat
          label="Max OAR Dose"
          value={strategy.metrics.maxOarDose}
          dark={selected}
        />
      </div>

      <button
        onClick={onSelect}
        className={`mt-5 w-full rounded-full px-4 py-3 text-sm font-semibold transition ${
          selected
            ? "bg-white text-black hover:bg-neutral-200"
            : "bg-black text-white hover:bg-neutral-800"
        }`}
      >
        View Strategy {strategy.id}
      </button>
    </article>
  );
}

function WorkflowProgress({
  hasStrategies,
  acceptedStrategyId,
  selectedStrategyId,
}: {
  hasStrategies: boolean;
  acceptedStrategyId: StrategyId | null;
  selectedStrategyId: StrategyId | null;
}) {
  const steps = [
    { label: "Verify Inputs", complete: true },
    { label: "Generate Recommendations", complete: hasStrategies },
    { label: "Review Plan", complete: Boolean(selectedStrategyId) },
    { label: "Select Strategy", complete: Boolean(selectedStrategyId) },
    { label: "Accept Strategy", complete: Boolean(acceptedStrategyId) },
    { label: "Save Plan", complete: Boolean(acceptedStrategyId) },
  ];

  return (
    <section className="rounded-[22px] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-500">
            Recommendation Engine
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Case Workflow
          </h2>
        </div>
        <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-500">
          Decision Support Only
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
              step.complete
                ? "bg-[#e6f7ec] text-[#167a42]"
                : "bg-neutral-100 text-neutral-500"
            }`}
          >
            <span className="mr-2">{step.complete ? "✓" : "○"}</span>
            {step.label}
          </div>
        ))}
      </div>
    </section>
  );
}

function SaveCurrentPlanModal({
  strategy,
  patient,
  saving,
  error,
  success,
  reason,
  concern,
  onReasonChange,
  onConcernChange,
  onClose,
  onSave,
}: {
  strategy: Strategy | null;
  patient: PatientVM | null;
  saving: boolean;
  error: string | null;
  success: { note: string | null } | null;
  reason: string;
  concern: string;
  onReasonChange: (value: string) => void;
  onConcernChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const summaryRows: [string, string][] = [
    ["Disease Site", patient?.condition ?? DASH],
    ["Prescription", patient?.prescription ?? DASH],
    ["Strategy", strategy?.name ?? DASH],
    ["Algorithm", strategy?.planning.algorithm ?? DASH],
    ["Arcs", strategy?.planning.arcs ?? DASH],
    ["Target priority", strategy?.planning.targetPriority ?? DASH],
    ["OAR priority", strategy?.planning.oarPriority ?? DASH],
  ];

  const textareaClass =
    "mt-2 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-900 outline-none transition focus:border-neutral-400 focus:bg-white";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-current-plan-title"
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
      >
        {success ? (
          <div>
            <div className="mb-4 grid size-12 place-items-center rounded-full bg-[#e6f7ec] text-2xl text-[#167a42]">
              ✓
            </div>
            <h2
              id="save-current-plan-title"
              className="text-2xl font-semibold tracking-tight"
            >
              Recorded to the learning database
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              Agent 3 captured your feedback for {strategy?.name ?? "this plan"} and
              updated this physician&apos;s preference profile.
            </p>
            {success.note && (
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-neutral-400">
                  Learned from this case
                </p>
                <p className="mt-1 text-sm leading-6 text-neutral-700">
                  {success.note}
                </p>
              </div>
            )}
            <div className="mt-7 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h2
              id="save-current-plan-title"
              className="text-2xl font-semibold tracking-tight"
            >
              Accept &amp; Save Plan
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              Your feedback is stored in the learning database and informs future
              recommendations for this physician.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="feedback-reasoning"
                  className="text-sm font-semibold text-neutral-900"
                >
                  Why this plan? <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="feedback-reasoning"
                  value={reason}
                  onChange={(e) => onReasonChange(e.target.value)}
                  rows={3}
                  placeholder="e.g. Coverage is sufficient and the tighter margin spares the brainstem; the higher MU is acceptable for this site."
                  className={textareaClass}
                />
              </div>
              <div>
                <label
                  htmlFor="feedback-concern"
                  className="text-sm font-semibold text-neutral-900"
                >
                  Any concerns or what you&apos;d change?{" "}
                  <span className="font-normal text-neutral-400">(optional)</span>
                </label>
                <textarea
                  id="feedback-concern"
                  value={concern}
                  onChange={(e) => onConcernChange(e.target.value)}
                  rows={2}
                  placeholder="e.g. Watch the optic chiasm dose on the next fraction check."
                  className={textareaClass}
                />
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold text-neutral-900">Case Summary</p>
              <div className="mt-3 border-t border-neutral-200 pt-4">
                <div className="space-y-2">
                  {summaryRows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 text-sm">
                      <span className="font-medium text-neutral-500">{label}:</span>
                      <span className="text-right font-semibold text-neutral-950">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            <div className="mt-7 flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-full border border-neutral-200 bg-white px-5 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving || !reason.trim()}
                className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:bg-neutral-400"
              >
                {saving ? "Saving…" : "Accept & Save"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityLog({
  runId,
  strategies,
  acceptedStrategyId,
  learnedNote,
}: {
  runId: string | null;
  strategies: Strategy[];
  acceptedStrategyId: StrategyId | null;
  learnedNote: string | null;
}) {
  if (!runId || strategies.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-white/70">
        Run the recommendation engine to see live activity from this run.
      </p>
    );
  }

  const acceptedStrategy = acceptedStrategyId
    ? strategies.find((s) => s.id === acceptedStrategyId)
    : null;

  const items = [
    {
      agent: "Agent 1",
      title: "Candidate plans generated",
      detail: `Pattern-matched similar cases into ${strategies.length} reviewed strategies`,
      tone: "blue",
      meta: `run ${runId.slice(0, 8)}`,
    },
    ...strategies.map((s) => ({
      agent: "Agent 2",
      title: `Strategy ${s.id} — ${s.name}`,
      detail: s.challenge,
      tone: "purple",
      meta: `risk ${s.riskScore}`,
    })),
    ...(acceptedStrategy
      ? [
          {
            agent: "Agent 3",
            title: `Feedback recorded — Strategy ${acceptedStrategy.id} accepted`,
            detail:
              learnedNote ??
              "Physician feedback captured; preference profile updated.",
            tone: "green",
            meta: "✓ saved",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-2xl border border-white/10 bg-white/10 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <AgentBadge tone={item.tone}>{item.agent}</AgentBadge>
              <div>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-5 text-white/60">
                  {item.detail}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white/80">
              {item.meta}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentBadge({
  tone,
  children,
}: {
  tone: string;
  children: React.ReactNode;
}) {
  const classes =
    tone === "blue"
      ? "bg-[#dbeafe] text-[#1d4ed8]"
      : tone === "green"
        ? "bg-[#e6f7ec] text-[#167a42]"
        : "bg-[#ede9fe] text-[#6d28d9]";

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${classes}`}
    >
      {children}
    </span>
  );
}

function GeneralPlanCard({
  patient,
  strategy,
}: {
  patient: PatientVM | null;
  strategy: Strategy | null;
}) {
  const rows: [string, string][] = strategy
    ? [
        ["Selected strategy", strategy.name],
        ["Algorithm", strategy.planning.algorithm],
        ["Number of arcs", strategy.planning.arcs],
        ["Arc type", strategy.planning.arcType],
        ["PTV margin", strategy.planning.ptvMargin],
        ["Planning priority", strategy.intent],
      ]
    : [
        ["Tumor type", patient?.tumorType ?? DASH],
        ["Prescription dose", patient?.prescription ?? DASH],
        ["Target volume", patient?.targetVolume ?? DASH],
        ["Condition", patient?.condition ?? DASH],
        ["Physician", patient?.physician ?? DASH],
      ];

  return (
    <ClinicalCard
      title="General Plan / Patient Information"
      badge={strategy ? "Selected Strategy" : "Baseline Case"}
      tone="green"
    >
      <InfoRows rows={rows} />
    </ClinicalCard>
  );
}

function DvhPreviewCard({ strategy }: { strategy: Strategy | null }) {
  return (
    <ClinicalCard
      title="Plan Rationale & Risk Review"
      badge="Decision Support Only"
      tone="orange"
    >
      {strategy ? (
        <div className="space-y-4">
          <div>
            <SectionLabel>Agent 1 — rationale</SectionLabel>
            <p className="text-sm leading-6 text-neutral-700">
              {strategy.rationale}
            </p>
          </div>
          <div>
            <SectionLabel>Agent 2 — challenge</SectionLabel>
            <p className="text-sm leading-6 text-neutral-700">
              {strategy.challenge}
            </p>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3">
            <p className="text-sm font-medium text-neutral-500">Risk score</p>
            <p className="text-sm font-semibold text-neutral-900">
              {strategy.riskScore}
            </p>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No strategy selected"
          copy="Select a recommendation to see its rationale and the reviewer's challenge."
        />
      )}
    </ClinicalCard>
  );
}

function TumorInputOutputCard({
  patient,
  strategy,
}: {
  patient: PatientVM | null;
  strategy: Strategy | null;
}) {
  const inputRows: [string, string][] = [
    ["Tumor type", patient?.tumorType ?? DASH],
    ["Target volume", patient?.targetVolume ?? DASH],
    ["Prescription", patient?.prescription ?? DASH],
  ];

  const outputRows: [string, string][] = strategy
    ? [
        ["Projected coverage", strategy.metrics.coverage],
        ["CI", strategy.metrics.ci],
        ["GI", strategy.metrics.gi],
        ["V12", strategy.metrics.v12],
        ["Target priority", strategy.planning.targetPriority],
      ]
    : [["Output", "Select a strategy to see projected results"]];

  return (
    <ClinicalCard title="Tumor Input / Output" badge="Decision Support Only">
      <SectionLabel>Inputs</SectionLabel>
      <InfoRows rows={inputRows} />
      <SectionLabel className="mt-5">Output</SectionLabel>
      <InfoRows rows={outputRows} />
    </ClinicalCard>
  );
}

function OarInputOutputCard({
  patient,
  strategy,
}: {
  patient: PatientVM | null;
  strategy: Strategy | null;
}) {
  const inputRows: [string, string][] =
    patient && patient.oars.length
      ? patient.oars.map(
          (o) => [o.type, `${o.distance} to tumor`] as [string, string],
        )
      : [["OARs", "No organs-at-risk recorded for this case"]];

  const outputRows: [string, string][] = !strategy
    ? [["Output", "Select a strategy to see projected OAR dose"]]
    : strategy.oarResults.length
      ? strategy.oarResults.map(
          (o) => [`${o.type} Dmax`, o.dmax] as [string, string],
        )
      : [["Output", "No OAR dose reported for this plan"]];

  return (
    <ClinicalCard title="OAR Input / Output" badge="Decision Support Only" tone="orange">
      <SectionLabel>Inputs</SectionLabel>
      <InfoRows rows={inputRows} />
      <SectionLabel className="mt-5">Output</SectionLabel>
      <InfoRows rows={outputRows} />
    </ClinicalCard>
  );
}

function ClinicalCard({
  title,
  badge,
  tone = "neutral",
  children,
}: {
  title: string;
  badge: string;
  tone?: "green" | "orange" | "neutral";
  children: React.ReactNode;
}) {
  const badgeClass =
    tone === "green"
      ? "bg-[#e6f7ec] text-[#167a42]"
      : tone === "orange"
        ? "bg-[#fff0db] text-[#99611c]"
        : "bg-neutral-100 text-neutral-600";

  return (
    <section className="min-h-[330px] rounded-[22px] bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-800">
          {title}
        </h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
          {badge}
        </span>
      </div>
      {children}
    </section>
  );
}

function InfoRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-3">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-4 rounded-2xl bg-neutral-50 px-4 py-3"
        >
          <p className="text-sm font-medium text-neutral-500">{label}</p>
          <p className="max-w-[58%] text-right text-sm font-semibold text-neutral-900">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`mb-3 text-xs font-semibold uppercase text-neutral-400 ${className}`}
    >
      {children}
    </p>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="grid min-h-[230px] place-items-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
      <div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">{copy}</p>
      </div>
    </div>
  );
}

function BlackPanel({
  title,
  kicker,
  action,
  children,
}: {
  title: string;
  kicker: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] bg-[#060805] p-5 text-white shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-white/55">{kicker}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function WhitePanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SmallStat({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        dark ? "bg-white/10 text-white" : "bg-neutral-50 text-black"
      }`}
    >
      <p className={dark ? "text-xs text-white/55" : "text-xs text-neutral-500"}>
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function DarkBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
      {children}
    </span>
  );
}


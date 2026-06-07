"use client";

import { useState } from "react";

type Page = "patient" | "engine";
type StrategyId = "A" | "B";

type Strategy = {
  id: StrategyId;
  name: string;
  intent: string;
  details: string[];
  metrics: {
    coverage: string;
    ci: string;
    gi: string;
    chiasmDose: string;
    brainstemDose: string;
    opticNerveDose: string;
    projectedControl: string;
    projectedToxicity: string;
  };
};

const strategies: Record<StrategyId, Strategy> = {
  A: {
    id: "A",
    name: "OAR-Sparing Strategy",
    intent: "High optic chiasm priority",
    details: [
      "Monte Carlo",
      "4 non-coplanar arcs",
      "1 mm PTV margin",
      "High optic chiasm priority",
    ],
    metrics: {
      coverage: "97.8%",
      ci: "1.18",
      gi: "3.6",
      chiasmDose: "5.2 Gy",
      brainstemDose: "3.9 Gy",
      opticNerveDose: "4.8 Gy",
      projectedControl: "94.6%",
      projectedToxicity: "Low",
    },
  },
  B: {
    id: "B",
    name: "Coverage-Focused Strategy",
    intent: "High target coverage priority",
    details: [
      "Monte Carlo",
      "3 non-coplanar arcs",
      "1 mm PTV margin",
      "High target coverage priority",
    ],
    metrics: {
      coverage: "99.1%",
      ci: "1.08",
      gi: "3.2",
      chiasmDose: "6.8 Gy",
      brainstemDose: "4.4 Gy",
      opticNerveDose: "5.6 Gy",
      projectedControl: "96.1%",
      projectedToxicity: "Moderate-low",
    },
  },
};

const pageLabels: Record<Page, string> = {
  patient: "Patient View",
  engine: "Recommendation Engine",
};

export default function Home() {
  const [activePage, setActivePage] = useState<Page>("patient");
  const [selectedStrategyId, setSelectedStrategyId] =
    useState<StrategyId | null>(null);
  const [acceptedStrategyId, setAcceptedStrategyId] =
    useState<StrategyId | null>(null);

  const selectedStrategy = selectedStrategyId
    ? strategies[selectedStrategyId]
    : null;

  function selectStrategy(id: StrategyId) {
    setSelectedStrategyId(id);
    setActivePage("patient");
  }

  function previewAlternative() {
    setSelectedStrategyId((current) => (current === "A" ? "B" : "A"));
  }

  function acceptStrategy() {
    if (!selectedStrategy) return;

    setAcceptedStrategyId(selectedStrategy.id);
    setActivePage("engine");
  }

  return (
    <main className="min-h-screen bg-[#d9d9d7] px-4 py-6 text-[#111111] sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-[1440px] rounded-[28px] bg-[#f6f6f4] p-5 shadow-[0_22px_70px_rgba(15,23,42,0.14)] sm:p-7">
        <TopBar activePage={activePage} onNavigate={setActivePage} />

        <div className="mt-7">
          {activePage === "patient" && (
            <PatientView selectedStrategy={selectedStrategy} />
          )}
          {activePage === "engine" && (
            <RecommendationEngine
              acceptedStrategyId={acceptedStrategyId}
              selectedStrategyId={selectedStrategyId}
              onAcceptStrategy={acceptStrategy}
              onPreviewAlternative={previewAlternative}
              onSelectStrategy={selectStrategy}
            />
          )}
        </div>
      </div>
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
  selectedStrategy,
}: {
  selectedStrategy: Strategy | null;
}) {
  return (
    <div className="space-y-7">
      <BlackPanel
        title="Pituitary Adenoma Case"
        kicker="MRI Viewer"
        action={<DarkBadge>Final treatment planning remains manual</DarkBadge>}
      >
        <MriViewer />
      </BlackPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <GeneralPlanCard strategy={selectedStrategy} />
        <DvhPreviewCard strategy={selectedStrategy} />
        <TumorInputOutputCard strategy={selectedStrategy} />
        <OarInputOutputCard strategy={selectedStrategy} />
      </div>
    </div>
  );
}

function RecommendationEngine({
  acceptedStrategyId,
  selectedStrategyId,
  onAcceptStrategy,
  onPreviewAlternative,
  onSelectStrategy,
}: {
  acceptedStrategyId: StrategyId | null;
  selectedStrategyId: StrategyId | null;
  onAcceptStrategy: () => void;
  onPreviewAlternative: () => void;
  onSelectStrategy: (id: StrategyId) => void;
}) {
  return (
    <div className="space-y-7">
      <WorkflowProgress
        acceptedStrategyId={acceptedStrategyId}
        selectedStrategyId={selectedStrategyId}
      />

      <WhitePanel title="Strategy Recommendations" actionLabel="Clinician choice">
        <div className="grid gap-5 lg:grid-cols-2">
          {Object.values(strategies).map((strategy) => (
            <StrategyCard
              key={strategy.id}
              selected={selectedStrategyId === strategy.id}
              strategy={strategy}
              onSelect={() => onSelectStrategy(strategy.id)}
            />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={onPreviewAlternative}
            className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold"
          >
            Compare Outcomes
          </button>
          <button
            onClick={onAcceptStrategy}
            disabled={!selectedStrategyId}
            className="rounded-full bg-[#46d47b] px-4 py-2 text-sm font-semibold text-black disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            Generate Plan
          </button>
        </div>
      </WhitePanel>

      <BlackPanel
        title="Agent Activity Log"
        kicker="Decision Support Only"
        action={<DarkBadge>Synthetic Preview</DarkBadge>}
      >
        <ActivityLog />
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
          Projected Outcome
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
          label="Chiasm Max Dose"
          value={strategy.metrics.chiasmDose}
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
        Select Strategy {strategy.id}
      </button>
    </article>
  );
}

function WorkflowProgress({
  acceptedStrategyId,
  selectedStrategyId,
}: {
  acceptedStrategyId: StrategyId | null;
  selectedStrategyId: StrategyId | null;
}) {
  const steps = [
    { label: "Verify Inputs", complete: true },
    { label: "Generate Recommendations", complete: true },
    { label: "Compare Outcomes", complete: Boolean(selectedStrategyId) },
    { label: "Select Strategy", complete: Boolean(selectedStrategyId) },
    { label: "Generate Plan", complete: Boolean(acceptedStrategyId) },
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

function ActivityLog() {
  const items = [
    {
      agent: "Agent 1",
      title: "Case Intake Complete",
      detail: "Loaded pituitary adenoma case",
      duration: "120 ms",
      tone: "blue",
      status: "Complete",
    },
    {
      agent: "Agent 1",
      title: "Similarity Search",
      detail: "18 matching historical plans found",
      duration: "240 ms",
      tone: "blue",
      status: "Complete",
    },
    {
      agent: "Agent 2",
      title: "Generate Strategy A",
      detail: "4-arc non-coplanar approach",
      duration: "310 ms",
      tone: "purple",
      status: "Complete",
    },
    {
      agent: "Agent 2",
      title: "Generate Strategy B",
      detail: "3-arc conformity-focused approach",
      duration: "280 ms",
      tone: "purple",
      status: "Complete",
    },
    {
      agent: "Agent 2",
      title: "Outcome Projection",
      detail: "Synthetic DVH generated",
      duration: "540 ms",
      tone: "purple",
      status: "Complete",
    },
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
            <StatusBadge status={item.status} duration={item.duration} />
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
      : "bg-[#ede9fe] text-[#6d28d9]";

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${classes}`}
    >
      {children}
    </span>
  );
}

function StatusBadge({
  status,
  duration,
}: {
  status: string;
  duration: string;
}) {
  const complete = status === "Complete";

  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
        complete
          ? "bg-[#dcfce7] text-[#15803d]"
          : "bg-[#fef3c7] text-[#a16207]"
      }`}
    >
      {complete ? "✓" : "•"} {duration}
    </span>
  );
}

function MriViewer() {
  return (
    <div className="grid gap-5 lg:grid-cols-[96px_1fr_48px]">
      <div className="hidden space-y-3 lg:block">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="relative h-24 overflow-hidden rounded-xl border border-white/15 bg-white/5 xl:h-[108px]"
          >
            <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle,#f36f3d_0_16%,#ffe56a_17%_28%,#5de77e_29%_45%,transparent_46%)] opacity-75" />
            <div className="absolute inset-x-4 top-1/2 h-px bg-white/25" />
          </div>
        ))}
      </div>

      <div className="relative min-h-[385px] overflow-hidden rounded-[22px] bg-[#030503] xl:min-h-[430px]">
        <div className="absolute left-[7%] right-[7%] top-[20%] h-[58%] rounded-[50%] border border-white/10 bg-[radial-gradient(circle_at_28%_38%,#ff794d_0_9%,#fff074_10%_20%,#5bea82_21%_31%,transparent_32%),radial-gradient(circle_at_69%_35%,#ff744d_0_8%,#fff274_9%_17%,#5dea83_18%_28%,transparent_29%),radial-gradient(circle_at_34%_66%,#ff744d_0_8%,#fff274_9%_18%,#5dea83_19%_30%,transparent_31%),radial-gradient(circle_at_70%_65%,#ff744d_0_8%,#fff274_9%_17%,#5dea83_18%_29%,transparent_30%)] opacity-95" />
        <div className="absolute left-[22%] top-[24%] h-[52%] w-[56%] rounded-[50%] border border-white/20 opacity-40 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_0_40px_rgba(112,255,163,0.18)]" />
        <div className="absolute inset-x-[14%] top-1/2 h-px bg-white/30" />
        <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ffcc57] bg-[#ffcc57]/25 shadow-[0_0_34px_rgba(255,204,87,0.42)]" />
        <ViewerLabel className="left-[50%] top-[43%]" label="Tumor" tone="amber" />
        <ViewerLabel className="left-[58%] top-[31%]" label="Optic chiasm" tone="green" />
        <ViewerLabel className="left-[23%] top-[43%]" label="Optic nerve" tone="green" />
        <ViewerLabel className="right-[14%] top-[56%]" label="Brainstem" tone="orange" />
      </div>

      <div className="hidden items-center justify-center lg:flex">
        <div className="relative h-[300px] w-3 overflow-hidden rounded-full bg-gradient-to-t from-[#48e08b] via-[#f4ee66] to-[#eb553f]">
          <span className="absolute -left-10 top-0 text-xs text-white/75">0.50</span>
          <span className="absolute -left-10 top-1/2 text-xs text-white/75">0.25</span>
          <span className="absolute -left-10 bottom-0 text-xs text-white/75">0.01</span>
        </div>
      </div>
    </div>
  );
}

function GeneralPlanCard({ strategy }: { strategy: Strategy | null }) {
  const rows: [string, string][] = strategy
    ? [
        ["Selected strategy", strategy.name],
        ["Algorithm", "Monte Carlo"],
        ["Number of arcs", strategy.id === "A" ? "4" : "3"],
        ["Arc type", "Non-coplanar arcs"],
        ["PTV margin", "1 mm"],
        ["Planning priority", strategy.intent],
      ]
    : [
        ["Tumor type", "Pituitary adenoma"],
        ["Prescription dose", "12 Gy"],
        ["Number of fractions", "1"],
        ["Target volume", "1.8 cc"],
        ["Physician", "Dr. Smith"],
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
    <ClinicalCard title="DVH Preview" badge="Synthetic Preview" tone="orange">
      {strategy ? (
        <div className="space-y-4">
          <SyntheticDvhGraph strategy={strategy} />
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-neutral-600">
            <Legend color="#111111" label="PTV" />
            <Legend color="#46d47b" label="Brainstem" />
            <Legend color="#f08a36" label="Optic Chiasm" />
            <Legend color="#6b7cff" label="Optic Nerve" />
          </div>
        </div>
      ) : (
        <EmptyState
          title="No strategy selected"
          copy="Select a recommendation to generate synthetic projected DVH"
        />
      )}
    </ClinicalCard>
  );
}

function TumorInputOutputCard({ strategy }: { strategy: Strategy | null }) {
  const outputRows: [string, string][] = strategy
    ? [
        ["Projected coverage", strategy.metrics.coverage],
        ["CI", strategy.metrics.ci],
        ["GI", strategy.metrics.gi],
        ["V12", strategy.id === "A" ? "3.4 cc" : "4.1 cc"],
        [
          "Target priority",
          strategy.id === "A" ? "Balanced coverage" : "High target coverage",
        ],
      ]
    : [["Output", "Pending projected coverage"]];

  return (
    <ClinicalCard title="Tumor Input / Output" badge="Decision Support Only">
      <SectionLabel>Inputs</SectionLabel>
      <InfoRows
        rows={[
          ["Tumor type", "Pituitary adenoma"],
          ["Target volume", "1.8 cc"],
          ["Prescription", "12 Gy"],
          ["Fractions", "1"],
          ["Shape complexity", "Moderate"],
        ]}
      />
      <SectionLabel className="mt-5">Output</SectionLabel>
      <InfoRows rows={outputRows} />
    </ClinicalCard>
  );
}

function OarInputOutputCard({ strategy }: { strategy: Strategy | null }) {
  const outputRows: [string, string][] = strategy
    ? [
        ["Predicted Brainstem dose", strategy.metrics.brainstemDose],
        ["Predicted Optic Chiasm dose", strategy.metrics.chiasmDose],
        ["Predicted Optic Nerve dose", strategy.metrics.opticNerveDose],
        [
          "OAR sparing tradeoff",
          strategy.id === "A" ? "High sparing, lower coverage" : "Moderate sparing",
        ],
      ]
    : [["Output", "Pending projected OAR dose"]];

  return (
    <ClinicalCard title="OAR Input / Output" badge="Synthetic Preview" tone="orange">
      <SectionLabel>Inputs</SectionLabel>
      <InfoRows
        rows={[
          ["OAR name", "Optic chiasm, optic nerve, brainstem"],
          ["Distance to tumor", "1.6 mm minimum"],
          ["OAR margin", "1 mm review band"],
          ["Constraint priority", "High optic pathway priority"],
        ]}
      />
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

function SyntheticDvhGraph({ strategy }: { strategy: Strategy }) {
  const boosted = strategy.id === "B";

  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <svg viewBox="0 0 520 260" role="img" aria-label="Synthetic DVH preview">
        <path d="M44 28 V220 H492" fill="none" stroke="#d6d6d6" />
        {[70, 115, 160, 205].map((y) => (
          <path key={y} d={`M44 ${y} H492`} stroke="#e8e8e8" />
        ))}
        <path
          d={
            boosted
              ? "M44 210 C92 86, 158 50, 242 48 C322 45, 400 52, 492 62"
              : "M44 212 C98 102, 162 66, 244 62 C324 58, 402 72, 492 86"
          }
          fill="none"
          stroke="#111111"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M44 222 C118 205, 198 188, 286 164 C368 142, 430 130, 492 122"
          fill="none"
          stroke="#46d47b"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d={
            boosted
              ? "M44 218 C128 190, 206 160, 292 126 C370 96, 430 82, 492 72"
              : "M44 222 C132 208, 212 186, 300 154 C382 124, 438 110, 492 102"
          }
          fill="none"
          stroke="#f08a36"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M44 224 C128 214, 216 200, 306 178 C384 160, 444 148, 492 140"
          fill="none"
          stroke="#6b7cff"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <text x="52" y="24" fill="#737373" fontSize="13" fontWeight="600">
          Volume
        </text>
        <text x="454" y="244" fill="#737373" fontSize="13" fontWeight="600">
          Dose
        </text>
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
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
  actionLabel,
  children,
}: {
  title: string;
  actionLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-500">
          {actionLabel}
        </span>
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

function ViewerLabel({
  label,
  tone,
  className,
}: {
  label: string;
  tone: "amber" | "green" | "orange";
  className: string;
}) {
  const tones = {
    amber: "border-[#ffcc57] text-[#ffe7a8]",
    green: "border-[#65ee98] text-[#c6f8d7]",
    orange: "border-[#ff805d] text-[#ffd0c2]",
  };

  return (
    <div
      className={`absolute rounded-full border bg-black/45 px-3 py-1 text-xs font-semibold backdrop-blur ${tones[tone]} ${className}`}
    >
      {label}
    </div>
  );
}

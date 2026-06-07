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
  const acceptedStrategy = acceptedStrategyId
    ? strategies[acceptedStrategyId]
    : null;
  const latestSignal = acceptedStrategy
    ? `Dr. Smith accepted ${acceptedStrategy.name} for a pituitary adenoma case. This preference will inform future recommendations.`
    : "No accepted strategy has been stored for the current case.";

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
    setActivePage("patient");
  }

  return (
    <main className="min-h-screen bg-[#d9d9d7] px-4 py-6 text-[#111111] sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-[1440px] rounded-[28px] bg-[#f6f6f4] p-5 shadow-[0_22px_70px_rgba(15,23,42,0.14)] sm:p-7">
        <TopBar activePage={activePage} onNavigate={setActivePage} />

        <div className="mt-7">
          {activePage === "patient" && (
            <PatientView
              latestSignal={latestSignal}
              selectedStrategy={selectedStrategy}
              onNavigate={setActivePage}
              onPreviewAlternative={previewAlternative}
              onAcceptStrategy={acceptStrategy}
            />
          )}
          {activePage === "engine" && (
            <RecommendationEngine
              selectedStrategyId={selectedStrategyId}
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
  latestSignal,
  selectedStrategy,
  onNavigate,
  onPreviewAlternative,
  onAcceptStrategy,
}: {
  latestSignal: string;
  selectedStrategy: Strategy | null;
  onNavigate: (page: Page) => void;
  onPreviewAlternative: () => void;
  onAcceptStrategy: () => void;
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
        <MetricCard
          label="Target Coverage"
          status={selectedStrategy ? "Projected Outcome" : "No strategy selected"}
          value={selectedStrategy?.metrics.coverage ?? "--"}
          trend="Coverage projection changes with Strategy A or B."
          tone="green"
        />
        <MetricCard
          label="Optic Chiasm Max Dose"
          status="Synthetic Preview"
          value={selectedStrategy?.metrics.chiasmDose ?? "--"}
          trend="OAR constraint remains physician-reviewed."
          tone="orange"
        />
        <MetricCard
          label="Conformity Index"
          status="Decision Support Only"
          value={selectedStrategy?.metrics.ci ?? "--"}
          trend="Lower values indicate tighter synthetic conformity."
          tone="orange"
        />
        <MetricCard
          label="Tumor Control Projection"
          status="Projected Outcome"
          value={selectedStrategy?.metrics.projectedControl ?? "--"}
          trend="Not a generated treatment plan."
          tone="green"
        />
      </div>

      <BlackPanel
        title="Projected Outcome"
        kicker={
          selectedStrategy ? `Strategy ${selectedStrategy.id}` : "No strategy selected"
        }
        action={<DarkBadge>Decision Support Only</DarkBadge>}
      >
        <OutcomeGauge strategy={selectedStrategy} />
      </BlackPanel>

      <WhitePanel title="Case Workflow" actionLabel="Create Plan">
        <WorkflowSteps
          latestSignal={latestSignal}
          selectedStrategy={selectedStrategy}
          onNavigate={onNavigate}
          onPreviewAlternative={onPreviewAlternative}
          onAcceptStrategy={onAcceptStrategy}
        />
      </WhitePanel>
    </div>
  );
}

function RecommendationEngine({
  selectedStrategyId,
  onSelectStrategy,
}: {
  selectedStrategyId: StrategyId | null;
  onSelectStrategy: (id: StrategyId) => void;
}) {
  return (
    <div className="space-y-7">
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
      </WhitePanel>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <BlackPanel
          title="Agent Activity Log"
          kicker="Decision Support Only"
          action={<DarkBadge>Synthetic Preview</DarkBadge>}
        >
          <ActivityLog />
        </BlackPanel>

        <WhitePanel title="Historical Similar Cases" actionLabel="Synthetic">
          <div className="grid gap-3 sm:grid-cols-3">
            {["SYN-1412", "SYN-1327", "SYN-1294"].map((caseId, index) => (
              <div key={caseId} className="rounded-2xl bg-neutral-50 p-4">
                <p className="font-mono text-sm font-semibold">{caseId}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {index === 1 ? "92%" : "88%"}
                </p>
                <p className="mt-2 text-sm leading-5 text-neutral-500">
                  Similar synthetic pituitary planning preference.
                </p>
              </div>
            ))}
          </div>
        </WhitePanel>
      </div>
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

function WorkflowSteps({
  latestSignal,
  selectedStrategy,
  onNavigate,
  onPreviewAlternative,
  onAcceptStrategy,
}: {
  latestSignal: string;
  selectedStrategy: Strategy | null;
  onNavigate: (page: Page) => void;
  onPreviewAlternative: () => void;
  onAcceptStrategy: () => void;
}) {
  const rows = [
    ["New Patient", "Pituitary adenoma case entered system"],
    [
      "Recommendation",
      selectedStrategy
        ? `${selectedStrategy.name} selected`
        : "No strategy selected.",
    ],
    ["Compare", "Preview Alternative Strategy"],
    ["Accept", latestSignal],
  ];

  return (
    <div className="space-y-5">
      {rows.map(([title, body], index) => (
        <div key={title} className="grid grid-cols-[34px_1fr] gap-3">
          <div className="flex flex-col items-center">
            <span className="grid size-8 place-items-center rounded-xl border border-neutral-200 bg-white text-sm font-semibold">
              {index + 1}
            </span>
            {index < rows.length - 1 && (
              <span className="mt-2 h-full min-h-8 w-px bg-neutral-200" />
            )}
          </div>
          <div className="pb-2">
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-5 text-neutral-500">{body}</p>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => onNavigate("engine")}
          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Recommendation Engine
        </button>
        <button
          onClick={onPreviewAlternative}
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold"
        >
          Preview Alternative Strategy
        </button>
        <button
          onClick={onAcceptStrategy}
          disabled={!selectedStrategy}
          className="rounded-full bg-[#46d47b] px-4 py-2 text-sm font-semibold text-black disabled:bg-neutral-200 disabled:text-neutral-400"
        >
          Accept Strategy
        </button>
      </div>
    </div>
  );
}

function ActivityLog() {
  const items = [
    "Case intake normalized against synthetic pituitary adenoma cohort.",
    "Optic chiasm proximity elevated OAR-sparing recommendation weight.",
    "Strategy A and Strategy B synthesized as planning strategy previews.",
    "Projected outcome metrics prepared for physician comparison.",
  ];

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item} className="grid grid-cols-[36px_1fr] gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-sm font-semibold text-white">
            {index + 1}
          </span>
          <p className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white/70">
            {item}
          </p>
        </div>
      ))}
    </div>
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

function OutcomeGauge({ strategy }: { strategy: Strategy | null }) {
  const score = strategy?.id === "B" ? 82 : strategy?.id === "A" ? 74 : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <RiskTile
          label="OAR Risk"
          value={strategy?.id === "B" ? "30%" : strategy?.id === "A" ? "12%" : "--"}
          copy="Optic pathway monitoring advised."
        />
        <RiskTile
          label="Coverage Confidence"
          value={strategy?.metrics.coverage ?? "--"}
          copy="Synthetic preview only."
        />
      </div>
      <div className="relative mx-auto h-44 max-w-[420px] overflow-hidden">
        <div className="absolute inset-x-0 bottom-[-160px] mx-auto h-80 w-80 rounded-full border-[18px] border-white/10" />
        {Array.from({ length: 38 }).map((_, index) => {
          const rotation = -72 + index * 3.9;
          const lit = index < Math.round((score / 100) * 38);
          return (
            <span
              key={index}
              className={`absolute bottom-0 left-1/2 h-24 w-1.5 origin-bottom rounded-full ${
                lit
                  ? "bg-gradient-to-t from-[#e15a3b] via-[#f3e968] to-[#7cf0a0]"
                  : "bg-white/10"
              }`}
              style={{ transform: `rotate(${rotation}deg) translateY(-54px)` }}
            />
          );
        })}
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-4xl font-semibold text-white">
            {strategy ? score : "--"}
          </p>
          <p className="mt-2 text-sm text-white/55">Projected Outcome</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  status,
  trend,
  tone,
}: {
  label: string;
  value: string;
  status: string;
  trend: string;
  tone: "green" | "orange";
}) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            tone === "green"
              ? "bg-[#e6f7ec] text-[#167a42]"
              : "bg-[#fff0db] text-[#99611c]"
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-4 text-sm leading-5 text-neutral-500">{trend}</p>
      <MiniTrend tone={tone} muted={value === "--"} />
    </section>
  );
}

function MiniTrend({
  tone,
  muted,
}: {
  tone: "green" | "orange";
  muted: boolean;
}) {
  const stroke = tone === "green" ? "#46d47b" : "#f08a36";

  return (
    <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
      <svg viewBox="0 0 320 72" role="img" aria-label="Synthetic trend preview">
        <path d="M8 56 H312" stroke="#e5e5e5" />
        <path
          d={
            muted
              ? "M8 42 C56 42, 96 42, 144 42 C198 42, 250 42, 312 42"
              : "M8 46 C52 34, 92 38, 132 29 C176 20, 214 34, 254 24 C282 18, 298 23, 312 18"
          }
          fill="none"
          stroke={muted ? "#d4d4d4" : stroke}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function RiskTile({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy: string;
}) {
  return (
    <div className="rounded-[18px] bg-white/12 p-4">
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-2 text-xs leading-5 text-white/55">{copy}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gradient-to-r from-[#5ee58c] via-[#f4ec62] to-[#e75539]">
        <span className="block h-full w-1/3 rounded-full border-2 border-white bg-transparent" />
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

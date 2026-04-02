import type { SummaryKpi } from "../../types/report";

const toneClasses: Record<NonNullable<SummaryKpi["tone"]>, string> = {
  neutral: "from-white/8 to-white/3 text-white",
  accent: "from-emerald-500/20 to-cyan-500/10 text-emerald-200",
  warning: "from-amber-500/18 to-amber-500/8 text-amber-100",
  danger: "from-rose-500/18 to-rose-500/8 text-rose-100",
};

export function KPICard({ kpi }: { kpi: SummaryKpi }) {
  const tone = kpi.tone ?? "neutral";

  return (
    <article
      className={`rounded-[1.5rem] border border-white/8 bg-gradient-to-br ${toneClasses[tone]} p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]`}
    >
      <p className="text-xs uppercase tracking-[0.3em] text-white/45">{kpi.label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-tight">{kpi.value}</p>
      {kpi.change !== undefined ? (
        <p className="mt-4 text-xs text-white/45">{kpi.change.toFixed(1)} vs baseline</p>
      ) : null}
    </article>
  );
}


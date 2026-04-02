import { AuthorHeatmap } from "../components/charts/AuthorHeatmap";
import { FileList } from "../components/shared/FileList";
import { KPICard } from "../components/shared/KPICard";
import { useReport } from "../hooks/useReport";
import { useUiStore } from "../store/uiStore";

export function OverviewPage() {
  const { report } = useReport();
  const setSelectedFile = useUiStore((state) => state.setSelectedFile);

  if (!report) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {report.summary.kpis.map((kpi) => (
          <KPICard key={kpi.id} kpi={kpi} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
            Repo Activity
          </p>
          <div className="mt-4">
            <AuthorHeatmap cells={report.summary.activityHeatmap} />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
            Top Hotspots
          </p>
          <div className="mt-4">
            <FileList
              items={report.summary.topHotspots.map((item) => ({
                filePath: item.filePath,
                subtitle: `${item.language} · complexity ${item.complexity} · churn ${item.churnScore}`,
                metricValue: item.hotspotScore,
                riskLevel: item.riskLevel,
              }))}
              onSelect={setSelectedFile}
            />
          </div>
        </article>
      </section>
    </div>
  );
}

import { HotspotBubble } from "../components/charts/HotspotBubble";
import { FileList } from "../components/shared/FileList";
import { useReport } from "../hooks/useReport";
import { useUiStore } from "../store/uiStore";

export function HotspotsPage() {
  const { report } = useReport();
  const setSelectedFile = useUiStore((state) => state.setSelectedFile);
  const searchQuery = useUiStore((state) => state.searchQuery.toLowerCase());

  if (!report) {
    return null;
  }

  const hotspots = report.hotspots.filter((metric) =>
    metric.filePath.toLowerCase().includes(searchQuery),
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Complexity vs Churn
        </p>
        <div className="mt-4">
          <HotspotBubble
            data={hotspots}
            onSelectFile={(filePath) => setSelectedFile(filePath ?? undefined)}
          />
        </div>
      </article>
      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Ranked Files
        </p>
        <div className="mt-4">
          <FileList
            items={hotspots.map((metric) => ({
              filePath: metric.filePath,
              subtitle: `${metric.language} · LOC ${metric.loc} · touched ${metric.touchCount} times`,
              metricValue: metric.hotspotScore,
              riskLevel: metric.riskLevel,
            }))}
            onSelect={setSelectedFile}
          />
        </div>
      </article>
    </div>
  );
}

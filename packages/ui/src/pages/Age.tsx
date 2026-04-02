import { AgeTreemap } from "../components/charts/AgeTreemap";
import { useReport } from "../hooks/useReport";
import { useUiStore } from "../store/uiStore";

export function AgePage() {
  const { report } = useReport();
  const setSelectedFile = useUiStore((state) => state.setSelectedFile);

  if (!report) {
    return null;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)]">
      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Median Line Age
        </p>
        <div className="mt-4">
          <AgeTreemap
            nodes={report.fileTree}
            onSelectNode={(node) =>
              setSelectedFile(node?.type === "file" ? node.path : undefined)
            }
          />
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Stable Zones
        </p>
        <div className="mt-4 space-y-4">
          {report.age.map((metric) => (
            <button
              key={metric.filePath}
              type="button"
              onClick={() => setSelectedFile(metric.filePath)}
              className="w-full rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-sm text-white">{metric.filePath}</p>
                <span className="text-xs uppercase tracking-[0.3em] text-white/45">
                  median {Math.round(metric.medianLineAgeDays)}d
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {metric.ageDistribution.map((bucket) => (
                  <span
                    key={bucket.label}
                    className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-white/55"
                  >
                    {bucket.label} {bucket.lineCount}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </article>
    </div>
  );
}

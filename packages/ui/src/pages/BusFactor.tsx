import { AuthorshipSunburst } from "../components/charts/AuthorshipSunburst";
import { formatDate } from "../utils/formatters";
import { useReport } from "../hooks/useReport";
import { useUiStore } from "../store/uiStore";

export function BusFactorPage() {
  const { report } = useReport();
  const setSelectedFile = useUiStore((state) => state.setSelectedFile);

  if (!report) {
    return null;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Ownership Landscape
        </p>
        <div className="mt-4">
          <AuthorshipSunburst
            nodes={report.fileTree}
            onSelectNode={(node) =>
              setSelectedFile(node?.type === "file" ? node.path : undefined)
            }
          />
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Single Owner Risk
        </p>
        <div className="mt-4 space-y-4">
          {report.busFactor.criticalFiles.map((metric) => (
            <button
              key={metric.filePath}
              type="button"
              onClick={() => setSelectedFile(metric.filePath)}
              className="w-full rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-sm text-white">{metric.filePath}</p>
                <span className="text-xs uppercase tracking-[0.3em] text-amber-300">
                  bus factor {metric.busFactor}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {metric.owners.map((owner) => (
                  <div key={owner.email}>
                    <div className="mb-1 flex items-center justify-between text-xs text-white/55">
                      <span>{owner.author}</span>
                      <span>
                        {owner.percentOwned.toFixed(1)}% · active {formatDate(owner.lastActive)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/7">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                        style={{ width: `${owner.percentOwned}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </article>
    </div>
  );
}

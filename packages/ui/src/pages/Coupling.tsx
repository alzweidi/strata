import { CouplingGraph } from "../components/charts/CouplingGraph";
import { useReport } from "../hooks/useReport";
import { useUiStore } from "../store/uiStore";

export function CouplingPage() {
  const { report } = useReport();
  const setSelectedFile = useUiStore((state) => state.setSelectedFile);

  if (!report) {
    return null;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.95fr)]">
      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Co-change Graph
        </p>
        <div className="mt-4">
          <CouplingGraph
            data={report.coupling}
            onSelectNode={(nodeId) => setSelectedFile(nodeId ?? undefined)}
          />
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Clusters
        </p>
        <div className="mt-4 space-y-4">
          {report.coupling.clusters.map((cluster, index) => (
            <div
              key={`cluster-${index}`}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-white/35">
                Cluster {index + 1}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {cluster.map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => setSelectedFile(filePath)}
                    className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-white/60 hover:border-cyan-400/35 hover:text-white"
                  >
                    {filePath}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

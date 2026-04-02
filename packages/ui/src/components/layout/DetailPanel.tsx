import { useMemo } from "react";

import { useReportStore } from "../../store/reportStore";
import { useUiStore } from "../../store/uiStore";
import { formatDate, formatNumber } from "../../utils/formatters";
import { RiskBadge } from "../shared/RiskBadge";

export function DetailPanel() {
  const report = useReportStore((state) => state.report);
  const selectedFile = useUiStore((state) => state.selectedFile);

  const details = useMemo(() => {
    if (!report || !selectedFile) {
      return undefined;
    }

    const hotspot = report.hotspots.find((metric) => metric.filePath === selectedFile);
    const busFactor = report.busFactor.criticalFiles.find(
      (metric) => metric.filePath === selectedFile,
    );
    const age = report.age.find((metric) => metric.filePath === selectedFile);
    const loc = report.loc.current.find((metric) => metric.filePath === selectedFile);

    return { hotspot, busFactor, age, loc };
  }, [report, selectedFile]);

  if (!selectedFile || !details) {
    return (
      <aside className="hidden border-l border-white/8 bg-black/20 p-6 xl:block">
        <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-white/[0.03] p-6">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
            Detail Panel
          </p>
          <p className="mt-4 text-sm leading-6 text-white/55">
            Select any file from a list or chart to inspect ownership, churn, age, and
            structural risk in one place.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden border-l border-white/8 bg-black/20 p-6 xl:block">
      <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Selected File
        </p>
        <h2 className="mt-3 font-mono text-lg text-white">{selectedFile}</h2>
        {details.hotspot ? (
          <div className="mt-4 flex items-center gap-3">
            <RiskBadge level={details.hotspot.riskLevel} />
            <span className="text-sm text-white/55">
              Hotspot {formatNumber(Math.round(details.hotspot.hotspotScore))}
            </span>
          </div>
        ) : null}
        <dl className="mt-6 space-y-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Complexity</dt>
            <dd className="text-white">
              {formatNumber(Math.round(details.hotspot?.complexity ?? 0))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Churn</dt>
            <dd className="text-white">
              {formatNumber(Math.round(details.hotspot?.churnScore ?? 0))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Bus Factor</dt>
            <dd className="text-white">{details.busFactor?.busFactor ?? "-"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Median Age</dt>
            <dd className="text-white">
              {details.age ? `${Math.round(details.age.medianLineAgeDays)}d` : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Code Lines</dt>
            <dd className="text-white">{details.loc?.codeLines ?? "-"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/45">Last Touched</dt>
            <dd className="text-white">
              {details.hotspot ? formatDate(details.hotspot.lastTouched) : "-"}
            </dd>
          </div>
        </dl>
        {details.busFactor?.owners.length ? (
          <div className="mt-8">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
              Ownership
            </p>
            <div className="mt-3 space-y-3">
              {details.busFactor.owners.map((owner) => (
                <div key={owner.email}>
                  <div className="mb-1 flex items-center justify-between text-xs text-white/55">
                    <span>{owner.author}</span>
                    <span>{owner.percentOwned.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/7">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${owner.percentOwned}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}


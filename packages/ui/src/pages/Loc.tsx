import { LocTimeline } from "../components/charts/LocTimeline";
import { useReport } from "../hooks/useReport";

export function LocPage() {
  const { report } = useReport();

  if (!report) {
    return null;
  }

  const languageBreakdown = Object.entries(report.summary.languageBreakdown);
  const maxLanguageValue = Math.max(...languageBreakdown.map(([, value]) => value), 1);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.95fr)]">
      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          LOC Over Time
        </p>
        <div className="mt-4">
          <LocTimeline snapshots={report.loc.history} />
        </div>
      </article>

      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Language Breakdown
        </p>
        <div className="mt-4 space-y-4">
          {languageBreakdown.map(([language, value]) => (
            <div key={language}>
              <div className="mb-1 flex items-center justify-between text-xs text-white/55">
                <span>{language}</span>
                <span>{value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/7">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                  style={{ width: `${(value / maxLanguageValue) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

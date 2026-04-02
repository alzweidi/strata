import { useMemo } from "react";

import { useReport } from "../hooks/useReport";
import { useUiStore } from "../store/uiStore";
import { formatDate } from "../utils/formatters";

export function CommitsPage() {
  const { report } = useReport();
  const searchQuery = useUiStore((state) => state.searchQuery.toLowerCase());

  const commits = useMemo(() => {
    if (!report) {
      return [];
    }

    return report.commits.filter((commit) => {
      const haystack = [
        commit.author,
        commit.subject,
        commit.filesChanged.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchQuery);
    });
  }, [report, searchQuery]);

  if (!report) {
    return null;
  }

  return (
    <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
        Commit Timeline
      </p>
      <div className="mt-4 space-y-4">
        {commits.map((commit) => (
          <article
            key={commit.sha}
            className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-white">{commit.subject}</p>
                <p className="mt-1 text-sm text-white/45">
                  {commit.author} · {formatDate(commit.timestamp)} · {commit.shortSha}
                </p>
              </div>
              <span className="rounded-full border border-white/8 px-3 py-1 text-xs text-white/45">
                +{commit.insertions} / -{commit.deletions}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {commit.filesChanged.map((filePath) => (
                <span
                  key={`${commit.sha}-${filePath}`}
                  className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-xs text-white/55"
                >
                  {filePath}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}


import { AuthorHeatmap } from "../components/charts/AuthorHeatmap";
import { formatDate } from "../utils/formatters";
import { useReport } from "../hooks/useReport";

export function AuthorsPage() {
  const { report } = useReport();

  if (!report) {
    return null;
  }

  const authors = [...report.authors].sort(
    (left, right) => right.totalCommits - left.totalCommits,
  );

  return (
    <div className="space-y-6">
      <article className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
          Contribution Heatmap
        </p>
        <div className="mt-4">
          <AuthorHeatmap
            cells={authors[0]?.commitHeatmap ?? []}
            authorLabel={authors[0]?.canonicalName ?? "Top contributor"}
          />
        </div>
      </article>

      <section className="grid gap-4 lg:grid-cols-2">
        {authors.map((author) => (
          <article
            key={author.canonicalName}
            className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xl font-semibold text-white">{author.canonicalName}</p>
                <p className="mt-1 text-sm text-white/45">
                  Last active {formatDate(author.lastCommit)}
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/45">
                {author.totalCommits} commits
              </span>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/35">
                  Focus Areas
                </p>
                <ul className="mt-3 space-y-2 text-sm text-white/60">
                  {author.primaryDirectories.map((directory) => (
                    <li key={directory}>{directory}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/35">
                  Specialist Score
                </p>
                <div className="mt-4 h-2 rounded-full bg-white/7">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                    style={{ width: `${author.specialisationScore * 100}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-white/55">
                  Peak cadence: {author.peakDayOfWeek} / {author.peakHour}:00
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

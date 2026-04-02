import { SearchBox } from "../shared/SearchBox";

interface TopBarProps {
  repoName: string;
  headSha: string;
  generatedAt: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function TopBar({
  repoName,
  headSha,
  generatedAt,
  searchQuery,
  onSearchChange,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/8 bg-[#0D0D0D]/80 px-6 py-5 backdrop-blur-xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-white/35">
            Repository Intelligence
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {repoName}
          </h1>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/45">
            <span>HEAD {headSha.slice(0, 7)}</span>
            <span>Generated {generatedAt}</span>
          </div>
        </div>
        <div className="w-full max-w-xl">
          <SearchBox value={searchQuery} onChange={onSearchChange} />
        </div>
      </div>
    </header>
  );
}


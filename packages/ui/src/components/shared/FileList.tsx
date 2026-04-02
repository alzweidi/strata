import type { RiskLevel } from "../../types/report";
import { formatNumber } from "../../utils/formatters";
import { RiskBadge } from "./RiskBadge";

interface FileListItem {
  filePath: string;
  subtitle?: string;
  metricValue?: number;
  riskLevel?: RiskLevel;
}

interface FileListProps {
  items: readonly FileListItem[];
  onSelect?: (filePath: string) => void;
}

export function FileList({ items, onSelect }: FileListProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <button
          key={item.filePath}
          type="button"
          onClick={() => onSelect?.(item.filePath)}
          className="flex w-full items-start justify-between rounded-2xl border border-white/7 bg-white/3 px-4 py-3 text-left transition hover:border-emerald-400/35 hover:bg-white/5"
        >
          <div>
            <p className="font-mono text-sm text-white">{item.filePath}</p>
            {item.subtitle ? (
              <p className="mt-1 text-xs text-white/45">{item.subtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {item.metricValue !== undefined ? (
              <span className="font-mono text-sm text-white/65">
                {formatNumber(Math.round(item.metricValue))}
              </span>
            ) : null}
            {item.riskLevel ? <RiskBadge level={item.riskLevel} /> : null}
          </div>
        </button>
      ))}
    </div>
  );
}


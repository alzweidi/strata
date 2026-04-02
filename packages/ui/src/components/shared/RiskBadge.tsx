import { riskColours } from "../../utils/colours";
import type { RiskLevel } from "../../types/report";

interface RiskBadgeProps {
  level: RiskLevel;
}

export function RiskBadge({ level }: RiskBadgeProps) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.3em]"
      style={{
        backgroundColor: `${riskColours[level]}22`,
        border: `1px solid ${riskColours[level]}55`,
        color: riskColours[level],
      }}
    >
      {level}
    </span>
  );
}


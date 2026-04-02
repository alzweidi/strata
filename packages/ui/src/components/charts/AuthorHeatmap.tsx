import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import * as d3 from "d3";

import {
  CHART_THEME,
  ChartEmptyState,
  ChartFrame,
  clamp,
  formatCompactNumber,
  formatShortDate,
  useResizeObserver,
} from "./shared.js";
import type { AuthorHeatmapProps } from "./types.js";

const DEFAULT_HEIGHT = 300;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function colorForCount(count: number, maxCount: number): string {
  if (maxCount <= 0) {
    return CHART_THEME.surfaceAlt;
  }
  const t = clamp(count / maxCount, 0, 1);
  return d3.interpolateRgb("#123227", CHART_THEME.accent)(t);
}

/**
 * Render the author activity heatmap.
 *
 * @param props - Heatmap cells and selection callbacks.
 * @returns A GitHub-style contribution grid with responsive sizing.
 */
export function AuthorHeatmap({
  authorLabel,
  className,
  cells,
  height = DEFAULT_HEIGHT,
  onSelectDate,
  selectedDate,
}: AuthorHeatmapProps): ReactElement {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const [internalSelectedDate, setInternalSelectedDate] = useState<string | null>(
    null,
  );

  const activeSelectedDate = selectedDate ?? internalSelectedDate;

  const layout = useMemo(() => {
    const maxWeek = d3.max(cells, (cell) => cell.week) ?? -1;
    const maxCount = d3.max(cells, (cell) => cell.count) ?? 0;
    const width = Math.max(0, size.width - 40);
    const heightForGrid = Math.max(0, height - 72);
    const cellSize = Math.floor(
      Math.min(
        width / Math.max(1, maxWeek + 1),
        heightForGrid / DAY_LABELS.length,
      ),
    );
    return {
      cellSize: Math.max(10, cellSize),
      maxCount,
      maxWeek,
      width,
      heightForGrid,
    };
  }, [cells, height, size.width]);

  const empty = cells.length === 0 ? (
    <ChartEmptyState
      title="No heatmap data"
      description="Provide weekday/week contribution cells to render the author activity grid."
    />
  ) : null;

  return (
    <ChartFrame
      className={className}
      height={height}
      toolbar={
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Author Heatmap</div>
            <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
              {authorLabel ?? "All authors"}
            </div>
          </div>
          <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
            {formatCompactNumber(cells.reduce((sum, cell) => sum + cell.count, 0))} commits
          </div>
        </>
      }
      empty={empty}
    >
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", minHeight: height - 48 }}
      >
        {size.ready && cells.length > 0 ? (
          <svg
            width={size.width}
            height={Math.max(size.height, height - 48)}
            viewBox={`0 0 ${layout.width + 40} ${layout.heightForGrid + 20}`}
            style={{ display: "block" }}
          >
            <g transform="translate(24,10)">
              {DAY_LABELS.map((label, index) => (
                <text
                  key={label}
                  x={0}
                  y={index * layout.cellSize + layout.cellSize * 0.7}
                  fill={CHART_THEME.textMuted}
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  {label}
                </text>
              ))}
              {cells.map((cell) => {
                const x = 20 + cell.week * layout.cellSize;
                const y = cell.day * layout.cellSize;
                const selected = activeSelectedDate === cell.date;
                const fill = colorForCount(cell.count, layout.maxCount);
                const dimmed = Boolean(activeSelectedDate) && !selected;
                return (
                  <rect
                    key={`${cell.date}-${cell.week}-${cell.day}`}
                    x={x}
                    y={y}
                    width={layout.cellSize - 3}
                    height={layout.cellSize - 3}
                    rx={4}
                    fill={fill}
                    fillOpacity={dimmed ? 0.28 : 0.92}
                    stroke={selected ? CHART_THEME.text : CHART_THEME.borderSoft}
                    strokeWidth={selected ? 2 : 1}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setInternalSelectedDate(cell.date);
                      onSelectDate?.(cell.date);
                    }}
                  >
                    <title>{`${formatShortDate(cell.date)}\n${cell.count} commits`}</title>
                  </rect>
                );
              })}
              {Array.from({ length: layout.maxWeek + 1 }, (_, week) => {
                if (week % 4 !== 0) {
                  return null;
                }
                return (
                  <text
                    key={`week-${week}`}
                    x={20 + week * layout.cellSize}
                    y={layout.heightForGrid + 2}
                    fill={CHART_THEME.textMuted}
                    style={{ fontSize: 10 }}
                  >
                    W{week + 1}
                  </text>
                );
              })}
            </g>
          </svg>
        ) : empty}
      </div>
    </ChartFrame>
  );
}

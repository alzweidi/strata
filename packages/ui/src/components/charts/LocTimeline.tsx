import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import * as d3 from "d3";

import {
  CHART_THEME,
  ChartEmptyState,
  ChartFrame,
  formatCompactNumber,
  formatShortDate,
  getPaletteColor,
  toneColor,
  useResizeObserver,
} from "./shared.js";
import type {
  LocSnapshotDatum,
  LocTimeRange,
  LocTimelineProps,
} from "./types.js";

const DEFAULT_HEIGHT = 560;

interface StackPoint {
  x: number;
  y0: number;
  y1: number;
}

interface LayerSeries {
  language: string;
  points: StackPoint[];
}

function toDate(value: string): Date {
  return new Date(value);
}

function compareDate(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function isWithinRange(date: Date, range: LocTimeRange | null): boolean {
  if (!range) {
    return true;
  }
  const start = toDate(range.start).getTime();
  const end = toDate(range.end).getTime();
  const value = date.getTime();
  return value >= Math.min(start, end) && value <= Math.max(start, end);
}

function buildStackedLayers(
  snapshots: LocSnapshotDatum[],
  languages: string[],
): { layers: LayerSeries[]; totalMax: number } {
  const layers = languages.map((language) => ({
    language,
    points: [] as StackPoint[],
  }));

  let totalMax = 0;
  for (const snapshot of snapshots) {
    const x = toDate(snapshot.date).getTime();
    let baseline = 0;
    for (const [index, language] of languages.entries()) {
      const value = snapshot.byLanguage[language] ?? 0;
      layers[index]?.points.push({ x, y0: baseline, y1: baseline + value });
      baseline += value;
    }
    totalMax = Math.max(totalMax, baseline, snapshot.totalLoc);
  }

  return { layers, totalMax };
}

/**
 * Render the stacked LOC timeline.
 *
 * @param props - Historical LOC snapshots and optional range selection.
 * @returns A responsive stacked area chart with brush-based time filtering.
 */
export function LocTimeline({
  annotations,
  className,
  height = DEFAULT_HEIGHT,
  onRangeChange,
  selectedRange,
  snapshots,
}: LocTimelineProps): ReactElement {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const brushRef = useRef<SVGGElement | null>(null);
  const [internalRange, setInternalRange] = useState<LocTimeRange | null>(null);
  const isSyncingBrushRef = useRef(false);

  const activeRange = selectedRange ?? internalRange;

  const orderedSnapshots = useMemo(
    () => [...snapshots].sort((left, right) => compareDate(toDate(left.date), toDate(right.date))),
    [snapshots],
  );

  const visibleSnapshots = useMemo(() => {
    const filtered = orderedSnapshots.filter((snapshot) =>
      isWithinRange(toDate(snapshot.date), activeRange),
    );
    return filtered.length > 0 ? filtered : orderedSnapshots;
  }, [activeRange, orderedSnapshots]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const snapshot of orderedSnapshots) {
      for (const language of Object.keys(snapshot.byLanguage)) {
        set.add(language);
      }
    }
    return [...set].sort((left, right) => left.localeCompare(right));
  }, [orderedSnapshots]);

  const dimensions = useMemo(
    () => ({
      width: Math.max(0, size.width - 88),
      height: Math.max(0, height - 104),
    }),
    [height, size.height, size.width],
  );

  const layout = useMemo(() => {
    const width = dimensions.width;
    const innerHeight = dimensions.height;
    const domainSnapshots =
      visibleSnapshots.length > 0 ? visibleSnapshots : orderedSnapshots;
    const times = domainSnapshots.map((snapshot) => toDate(snapshot.date));
    const [minTime = new Date(), maxTime = new Date()] = d3.extent(times);
    const start = minTime.getTime() === maxTime.getTime() ? new Date(minTime.getTime() - 86400000) : minTime;
    const end = minTime.getTime() === maxTime.getTime() ? new Date(maxTime.getTime() + 86400000) : maxTime;
    const xScale = d3.scaleTime().domain([start, end]).range([0, width]);
    const { layers, totalMax } = buildStackedLayers(domainSnapshots, languages);
    const yScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, totalMax)])
      .range([innerHeight, 0])
      .nice();

    return { xScale, yScale, layers, domainSnapshots };
  }, [dimensions.height, dimensions.width, languages, orderedSnapshots, visibleSnapshots]);

  const areaPath = useMemo(() => {
    const area = d3
      .area<StackPoint>()
      .x((point) => layout.xScale(new Date(point.x)))
      .y0((point) => layout.yScale(point.y0))
      .y1((point) => layout.yScale(point.y1))
      .curve(d3.curveMonotoneX);

    return layout.layers.map((layer) => ({
      language: layer.language,
      d: area(layer.points) ?? "",
    }));
  }, [layout.layers, layout.xScale, layout.yScale]);

  useEffect(() => {
    if (xAxisRef.current) {
      d3.select(xAxisRef.current)
        .call(
          d3
            .axisBottom(layout.xScale)
            .ticks(Math.max(4, dimensions.width / 110))
            .tickFormat((value) => formatShortDate(value as Date)),
        )
        .call((axis) => axis.selectAll("text").attr("fill", CHART_THEME.textMuted));
    }
  }, [dimensions.width, layout.xScale]);

  useEffect(() => {
    if (yAxisRef.current) {
      d3.select(yAxisRef.current)
        .call(d3.axisLeft(layout.yScale).ticks(Math.max(4, dimensions.height / 110)))
        .call((axis) => axis.selectAll("text").attr("fill", CHART_THEME.textMuted));
    }
  }, [dimensions.height, layout.yScale]);

  useEffect(() => {
    if (!brushRef.current || dimensions.width <= 0 || dimensions.height <= 0) {
      return undefined;
    }

    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [dimensions.width, dimensions.height],
      ])
      .on("end", (event) => {
        if (isSyncingBrushRef.current) {
          return;
        }

        if (!event.selection) {
          setInternalRange(null);
          onRangeChange?.(null);
          return;
        }

        const [startX, endX] = event.selection as [number, number];
        const nextRange: LocTimeRange = {
          start: layout.xScale.invert(startX).toISOString(),
          end: layout.xScale.invert(endX).toISOString(),
        };
        setInternalRange(nextRange);
        onRangeChange?.(nextRange);
      });

    const selection = d3.select(brushRef.current);
    selection.call(brush);

    const rangeToRender = selectedRange ?? internalRange;
    if (rangeToRender) {
      const start = layout.xScale(toDate(rangeToRender.start));
      const end = layout.xScale(toDate(rangeToRender.end));
      isSyncingBrushRef.current = true;
      selection.call(brush.move, [start, end]);
      isSyncingBrushRef.current = false;
    }

    return () => {
      selection.on(".brush", null);
    };
  }, [
    dimensions.height,
    dimensions.width,
    internalRange,
    layout.xScale,
    onRangeChange,
    selectedRange,
  ]);

  const empty = snapshots.length === 0 ? (
    <ChartEmptyState
      title="No LOC history"
      description="Provide time-series LOC snapshots to render the stacked area chart."
    />
  ) : null;

  return (
    <ChartFrame
      className={className}
      height={height}
      toolbar={
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>LOC Timeline</div>
            <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
              Stack = language, brush = time range
            </div>
          </div>
          <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
            {formatCompactNumber(snapshots[snapshots.length - 1]?.totalLoc ?? 0)} total LOC
          </div>
        </>
      }
      empty={empty}
    >
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", minHeight: height - 48 }}
      >
        {size.ready && snapshots.length > 0 ? (
          <svg
            width={size.width}
            height={Math.max(size.height, height - 48)}
            viewBox={`0 0 ${dimensions.width + 88} ${dimensions.height + 56}`}
            style={{ display: "block" }}
          >
            <g transform="translate(68,16)">
              {areaPath.map((layer) => (
                <path
                  key={layer.language}
                  d={layer.d}
                  fill={getPaletteColor(layer.language)}
                  fillOpacity={0.16 + (languages.indexOf(layer.language) % 5) * 0.08}
                  stroke={getPaletteColor(layer.language)}
                  strokeOpacity={0.54}
                  strokeWidth={1.5}
                >
                  <title>{layer.language}</title>
                </path>
              ))}
              {annotations?.map((annotation) => {
                const date = toDate(annotation.date);
                const x = layout.xScale(date);
                if (Number.isNaN(x)) {
                  return null;
                }
                return (
                  <g key={`${annotation.label}-${annotation.date}`} transform={`translate(${x},0)`}>
                    <line
                      x1={0}
                      x2={0}
                      y1={0}
                      y2={dimensions.height}
                      stroke={toneColor(annotation.tone ?? "neutral")}
                      strokeDasharray="4 5"
                      strokeOpacity={0.6}
                    />
                    <text
                      x={4}
                      y={12}
                      fill={toneColor(annotation.tone ?? "neutral")}
                      style={{ fontSize: 11, fontWeight: 600 }}
                    >
                      {annotation.label}
                    </text>
                  </g>
                );
              })}
              <g
                ref={brushRef}
                transform={`translate(0,0)`}
                style={{ cursor: "crosshair" }}
              />
              <g
                ref={xAxisRef}
                transform={`translate(0,${dimensions.height})`}
                style={{ fontSize: 11 }}
              />
              <g ref={yAxisRef} style={{ fontSize: 11 }} />
            </g>
          </svg>
        ) : empty}
      </div>
    </ChartFrame>
  );
}

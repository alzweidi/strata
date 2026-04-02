import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import * as d3 from "d3";

import {
  CHART_THEME,
  ChartEmptyState,
  ChartFrame,
  clamp,
  formatCompactNumber,
  riskColor,
  useResizeObserver,
} from "./shared.js";
import type {
  HotspotBubbleDatum,
  HotspotBubbleProps,
  HotspotThresholds,
} from "./types.js";

const DEFAULT_HEIGHT = 560;

function getMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  const left = sorted[middle - 1] ?? 0;
  const right = sorted[middle] ?? 0;
  return (left + right) / 2;
}

function deriveThresholds(data: HotspotBubbleDatum[]): HotspotThresholds {
  return {
    churn: getMedian(data.map((entry) => entry.churnScore)),
    complexity: getMedian(data.map((entry) => entry.complexity)),
  };
}

function buildDomain(values: number[]): [number, number] {
  if (values.length === 0) {
    return [0, 1];
  }

  const [minValue = 0, maxValue = 1] = d3.extent(values);
  if (minValue === maxValue) {
    return [minValue - 1, maxValue + 1];
  }

  const padding = Math.max((maxValue - minValue) * 0.12, 1);
  return [Math.max(0, minValue - padding), maxValue + padding];
}

/**
 * Render the hotspot bubble chart.
 *
 * @param props - Bubble chart data and interaction callbacks.
 * @returns A responsive scatter plot with draggable quadrant thresholds.
 */
export function HotspotBubble({
  className,
  data,
  height = DEFAULT_HEIGHT,
  selectedFilePath,
  thresholds: controlledThresholds,
  onSelectFile,
  onThresholdsChange,
}: HotspotBubbleProps): ReactElement {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const [zoomTransform, setZoomTransform] = useState(d3.zoomIdentity);
  const [dragKind, setDragKind] = useState<"churn" | "complexity" | null>(null);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const [internalThresholds, setInternalThresholds] = useState<HotspotThresholds>(
    () => deriveThresholds(data),
  );

  useEffect(() => {
    if (controlledThresholds) {
      return;
    }
    setInternalThresholds(deriveThresholds(data));
  }, [controlledThresholds, data]);

  const activeThresholds = controlledThresholds ?? internalThresholds;
  const activeSelection = selectedFilePath ?? internalSelected;

  const layout = useMemo(() => {
    const innerWidth = Math.max(0, size.width - 88);
    const innerHeight = Math.max(0, height - 96);
    const xDomain = buildDomain(data.map((entry) => entry.churnScore));
    const yDomain = buildDomain(data.map((entry) => entry.complexity));
    const maxLoc = Math.max(1, ...data.map((entry) => entry.loc));
    const xScale = d3.scaleLinear().domain(xDomain).range([0, innerWidth]);
    const yScale = d3
      .scaleLinear()
      .domain(yDomain)
      .range([innerHeight, 0]);
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, maxLoc])
      .range([7, Math.max(18, Math.min(innerWidth, innerHeight) / 12)]);

    return { innerWidth, innerHeight, xScale, yScale, radiusScale, xDomain, yDomain };
  }, [data, height, size.width]);

  const zoomedX = useMemo(
    () => zoomTransform.rescaleX(layout.xScale),
    [layout.xScale, zoomTransform],
  );
  const zoomedY = useMemo(
    () => zoomTransform.rescaleY(layout.yScale),
    [layout.yScale, zoomTransform],
  );

  useEffect(() => {
    if (!svgRef.current) {
      return undefined;
    }

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.75, 8])
      .translateExtent([
        [0, 0],
        [layout.innerWidth + 88, layout.innerHeight + 96],
      ])
      .on("zoom", (event) => {
        setZoomTransform(event.transform);
      });

    const selection = d3.select(svgRef.current);
    selection.call(zoomBehavior);

    return () => {
      selection.on(".zoom", null);
    };
  }, [layout.innerHeight, layout.innerWidth]);

  useEffect(() => {
    if (xAxisRef.current) {
      d3.select(xAxisRef.current)
        .call(d3.axisBottom(zoomedX).ticks(Math.max(4, layout.innerWidth / 120)))
        .call((axis) => axis.selectAll("text").attr("fill", CHART_THEME.textMuted));
    }
  }, [layout.innerWidth, zoomedX]);

  useEffect(() => {
    if (yAxisRef.current) {
      d3.select(yAxisRef.current)
        .call(d3.axisLeft(zoomedY).ticks(Math.max(4, layout.innerHeight / 110)))
        .call((axis) => axis.selectAll("text").attr("fill", CHART_THEME.textMuted));
    }
  }, [layout.innerHeight, zoomedY]);

  useEffect(() => {
    if (!dragKind) {
      return undefined;
    }

    const handleMove = (event: PointerEvent): void => {
      if (!svgRef.current) {
        return;
      }

      const [screenX, screenY] = d3.pointer(event, svgRef.current);
      const plotX = clamp(
        zoomTransform.invertX(screenX - 44),
        0,
        layout.innerWidth,
      );
      const plotY = clamp(
        zoomTransform.invertY(screenY - 48),
        0,
        layout.innerHeight,
      );
      const nextThresholds =
        dragKind === "churn"
          ? {
              churn: clamp(
                layout.xScale.invert(plotX),
                layout.xDomain[0] ?? 0,
                layout.xDomain[1] ?? 1,
              ),
              complexity: activeThresholds.complexity,
            }
          : {
              churn: activeThresholds.churn,
              complexity: clamp(
                layout.yScale.invert(plotY),
                layout.yDomain[0] ?? 0,
                layout.yDomain[1] ?? 1,
              ),
            };

      setInternalThresholds(nextThresholds);
      onThresholdsChange?.(nextThresholds);
    };

    const handleUp = (): void => {
      setDragKind(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    activeThresholds.churn,
    activeThresholds.complexity,
    dragKind,
    layout.innerHeight,
    layout.innerWidth,
    layout.xDomain,
    layout.xScale,
    layout.yDomain,
    layout.yScale,
    onThresholdsChange,
    zoomTransform,
  ]);

  const plotOffsetX = 44;
  const plotOffsetY = 48;

  const bubbleElements = data.map((entry) => {
    const x = layout.xScale(entry.churnScore);
    const y = layout.yScale(entry.complexity);
    const radius = layout.radiusScale(entry.loc);
    const selected = activeSelection === entry.filePath;
    const dimmed = Boolean(activeSelection) && !selected;
    return (
      <g
        key={entry.filePath}
        transform={`translate(${x},${y})`}
        opacity={dimmed ? 0.26 : 1}
      >
        <circle
          r={radius}
          fill={riskColor(entry.riskLevel)}
          fillOpacity={0.86}
          stroke={selected ? CHART_THEME.accent : CHART_THEME.borderSoft}
          strokeWidth={selected ? 2.5 : 1.25}
          style={{ cursor: "pointer" }}
          onClick={() => {
            setInternalSelected(entry.filePath);
            onSelectFile?.(entry.filePath);
          }}
        >
          <title>{`${entry.filePath}\nChurn: ${formatCompactNumber(entry.churnScore)}\nComplexity: ${formatCompactNumber(entry.complexity)}\nLOC: ${formatCompactNumber(entry.loc)}`}</title>
        </circle>
        {radius > 16 ? (
          <text
            textAnchor="middle"
            y={4}
            fill={CHART_THEME.background}
            style={{
              fontSize: 10,
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            {entry.filePath.split("/").pop() ?? entry.filePath}
          </text>
        ) : null}
      </g>
    );
  });

  const thresholdX = layout.xScale(activeThresholds.churn);
  const thresholdY = layout.yScale(activeThresholds.complexity);

  const empty = data.length === 0 ? (
    <ChartEmptyState
      title="No hotspot data"
      description="The bubble chart needs hotspot metrics with churn, complexity, and LOC values to render."
    />
  ) : null;

  return (
    <ChartFrame
      className={className}
      height={height}
      toolbar={
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Hotspot Bubble</div>
            <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
              X = churn, Y = complexity, size = LOC
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
              {formatCompactNumber(data.length)} files
            </div>
            <button
              type="button"
              onClick={() => {
                const nextThresholds = deriveThresholds(data);
                setInternalThresholds(nextThresholds);
                onThresholdsChange?.(nextThresholds);
              }}
              style={{
                borderRadius: 999,
                border: `1px solid ${CHART_THEME.borderSoft}`,
                background: CHART_THEME.surfaceAlt,
                color: CHART_THEME.text,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset thresholds
            </button>
          </div>
        </>
      }
      empty={empty}
    >
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", minHeight: height - 48 }}
      >
        {size.ready && data.length > 0 ? (
          <svg
            ref={svgRef}
            width={size.width}
            height={Math.max(size.height, height - 48)}
            viewBox={`0 0 ${size.width} ${Math.max(size.height, height - 48)}`}
            style={{ display: "block", overflow: "visible" }}
          >
            <defs>
              <linearGradient id="hotspot-axis-gradient" x1="0%" x2="100%">
                <stop offset="0%" stopColor={CHART_THEME.accent} />
                <stop offset="50%" stopColor={CHART_THEME.secondary} />
                <stop offset="100%" stopColor={CHART_THEME.danger} />
              </linearGradient>
            </defs>
            <g transform={`translate(${plotOffsetX},${plotOffsetY})`}>
              <g
                ref={xAxisRef}
                transform={`translate(0,${layout.innerHeight})`}
                style={{ fontSize: 11 }}
              />
              <g ref={yAxisRef} style={{ fontSize: 11 }} />
              <g transform={zoomTransform.toString()}>
                <g opacity={0.2}>
                  <line
                    x1={thresholdX}
                    x2={thresholdX}
                    y1={0}
                    y2={layout.innerHeight}
                    stroke={CHART_THEME.accent}
                    strokeDasharray="6 6"
                  />
                  <line
                    x1={0}
                    x2={layout.innerWidth}
                    y1={thresholdY}
                    y2={thresholdY}
                    stroke={CHART_THEME.secondary}
                    strokeDasharray="6 6"
                  />
                </g>
                <g>
                  {bubbleElements}
                </g>
                <g
                  style={{ cursor: "ew-resize" }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragKind("churn");
                  }}
                >
                  <line
                    x1={thresholdX}
                    x2={thresholdX}
                    y1={0}
                    y2={layout.innerHeight}
                    stroke={CHART_THEME.accent}
                    strokeWidth={2}
                  />
                  <circle
                    cx={thresholdX}
                    cy={16}
                    r={7}
                    fill={CHART_THEME.accent}
                    stroke={CHART_THEME.background}
                    strokeWidth={2}
                  />
                  <text
                    x={thresholdX + 8}
                    y={14}
                    fill={CHART_THEME.accent}
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {formatCompactNumber(activeThresholds.churn)}
                  </text>
                </g>
                <g
                  style={{ cursor: "ns-resize" }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragKind("complexity");
                  }}
                >
                  <line
                    x1={0}
                    x2={layout.innerWidth}
                    y1={thresholdY}
                    y2={thresholdY}
                    stroke={CHART_THEME.secondary}
                    strokeWidth={2}
                  />
                  <circle
                    cx={16}
                    cy={thresholdY}
                    r={7}
                    fill={CHART_THEME.secondary}
                    stroke={CHART_THEME.background}
                    strokeWidth={2}
                  />
                  <text
                    x={20}
                    y={thresholdY - 10}
                    fill={CHART_THEME.secondary}
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {formatCompactNumber(activeThresholds.complexity)}
                  </text>
                </g>
              </g>
              <g pointerEvents="none">
                <text
                  x={layout.innerWidth * 0.75}
                  y={24}
                  textAnchor="middle"
                  fill={CHART_THEME.textMuted}
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  Danger Zone
                </text>
                <text
                  x={layout.innerWidth * 0.25}
                  y={24}
                  textAnchor="middle"
                  fill={CHART_THEME.textMuted}
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  Complex but Stable
                </text>
                <text
                  x={layout.innerWidth * 0.75}
                  y={layout.innerHeight - 10}
                  textAnchor="middle"
                  fill={CHART_THEME.textMuted}
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  Active but Simple
                </text>
                <text
                  x={layout.innerWidth * 0.22}
                  y={layout.innerHeight - 10}
                  textAnchor="middle"
                  fill={CHART_THEME.textMuted}
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  Low Risk
                </text>
              </g>
            </g>
          </svg>
        ) : empty}
      </div>
    </ChartFrame>
  );
}

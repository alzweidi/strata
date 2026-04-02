import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import * as d3 from "d3";

import {
  CHART_THEME,
  ChartEmptyState,
  ChartFrame,
  formatCompactNumber,
  normalize,
  useResizeObserver,
} from "./shared.js";
import type {
  AgeTreemapProps,
  ChartOverlayMetric,
  ChartTreeNode,
} from "./types.js";

const DEFAULT_HEIGHT = 580;
const METRIC_OPTIONS: ChartOverlayMetric[] = [
  "medianAgeDays",
  "loc",
  "hotspotScore",
  "busFactor",
  "churnScore",
  "complexity",
];

function metricLabel(metric: ChartOverlayMetric): string {
  switch (metric) {
    case "medianAgeDays":
      return "Age";
    case "loc":
      return "LOC";
    case "hotspotScore":
      return "Hotspot";
    case "busFactor":
      return "Bus factor";
    case "churnScore":
      return "Churn";
    case "complexity":
      return "Complexity";
    default:
      return metric;
  }
}

function metricValue(node: ChartTreeNode, metric: ChartOverlayMetric): number {
  const overlayValue = node.overlays[metric];
  if (typeof overlayValue === "number") {
    return overlayValue;
  }
  if (metric === "loc") {
    return node.aggregateLoc;
  }
  return node.aggregateLoc;
}

function metricColour(
  metric: ChartOverlayMetric,
  value: number,
  domain: [number, number],
): string {
  const t = metric === "busFactor" ? 1 - normalize(value, domain[0], domain[1]) : normalize(value, domain[0], domain[1]);
  if (metric === "loc") {
    return d3.interpolateRgb("#112233", CHART_THEME.accent)(t);
  }
  if (metric === "busFactor") {
    return d3.interpolateRgb("#FF4444", CHART_THEME.accent)(t);
  }
  return d3.interpolateRgb("#00C8FF", "#FF4444")(t);
}

/**
 * Render the age treemap.
 *
 * @param props - Tree data and metric overlay controls.
 * @returns A responsive treemap with overlay selector support.
 */
export function AgeTreemap({
  className,
  height = DEFAULT_HEIGHT,
  metric: controlledMetric,
  nodes,
  onMetricChange,
  onSelectNode,
  selectedPath,
}: AgeTreemapProps): ReactElement {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const [internalMetric, setInternalMetric] = useState<ChartOverlayMetric>(
    "medianAgeDays",
  );
  const [internalSelectedPath, setInternalSelectedPath] = useState<string | null>(
    null,
  );

  const activeMetric = controlledMetric ?? internalMetric;
  const activeSelectedPath = selectedPath ?? internalSelectedPath;

  useEffect(() => {
    if (controlledMetric !== undefined) {
      return;
    }
    setInternalMetric("medianAgeDays");
  }, [controlledMetric, nodes]);

  const layout = useMemo(() => {
    const width = Math.max(0, size.width - 24);
    const innerHeight = Math.max(0, height - 112);
    const rootData: ChartTreeNode = {
      id: "root",
      name: "root",
      path: "",
      type: "directory",
      depth: 0,
      children: nodes,
      overlays: {},
      aggregateLoc: nodes.reduce((sum, node) => sum + node.aggregateLoc, 0),
    };

    const root = d3
      .hierarchy<ChartTreeNode>(rootData)
      .sum((node) => Math.max(1, node.aggregateLoc))
      .sort((left, right) => (right.value ?? 0) - (left.value ?? 0));

    const laidOutRoot = d3
      .treemap<ChartTreeNode>()
      .size([width, innerHeight])
      .paddingInner(2)
      .paddingOuter(2)
      .round(true)(root) as d3.HierarchyRectangularNode<ChartTreeNode>;

    const descendantValues = laidOutRoot
      .descendants()
      .map((node) => metricValue(node.data, activeMetric));
    const domain = d3.extent(descendantValues) as [number, number];
    const safeDomain: [number, number] = [
      Number.isFinite(domain[0]) ? domain[0] : 0,
      Number.isFinite(domain[1]) ? domain[1] : 1,
    ];
    if (safeDomain[0] === safeDomain[1]) {
      safeDomain[1] = safeDomain[0] + 1;
    }

    return { root: laidOutRoot, width, innerHeight, domain: safeDomain };
  }, [activeMetric, height, nodes, size.width]);

  const empty = nodes.length === 0 ? (
    <ChartEmptyState
      title="No tree data"
      description="Provide file tree nodes with aggregate LOC and overlay metrics to render the treemap."
    />
  ) : null;

  return (
    <ChartFrame
      className={className}
      height={height}
      toolbar={
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Age Treemap</div>
            <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
              Area = LOC, colour = {metricLabel(activeMetric)}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {METRIC_OPTIONS.map((option) => {
              const active = activeMetric === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setInternalMetric(option);
                    onMetricChange?.(option);
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${active ? CHART_THEME.accent : CHART_THEME.borderSoft}`,
                    background: active ? "rgba(0, 255, 136, 0.14)" : CHART_THEME.surfaceAlt,
                    color: active ? CHART_THEME.accent : CHART_THEME.text,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {metricLabel(option)}
                </button>
              );
            })}
          </div>
        </>
      }
      empty={empty}
    >
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", minHeight: height - 48 }}
      >
        {size.ready && nodes.length > 0 ? (
          <svg
            width={size.width}
            height={Math.max(size.height, height - 48)}
            viewBox={`0 0 ${layout.width} ${layout.innerHeight + 56}`}
            style={{ display: "block" }}
          >
            <g transform="translate(12,20)">
              <text
                x={0}
                y={0}
                fill={CHART_THEME.textMuted}
                style={{ fontSize: 12 }}
              >
                {activeSelectedPath ?? "Whole repository"}
              </text>
            </g>
            <g transform="translate(12,44)">
              {layout.root
                .descendants()
                .filter((node) => node.depth > 0)
                .map((node) => {
                  const width = node.x1 - node.x0;
                  const height = node.y1 - node.y0;
                  const value = metricValue(node.data, activeMetric);
                  const fill = metricColour(activeMetric, value, layout.domain);
                  const selected = activeSelectedPath === node.data.path;
                  const dimmed =
                    Boolean(activeSelectedPath) && !selected && node.data.path !== activeSelectedPath;
                  return (
                    <g
                      key={node.data.id}
                      opacity={dimmed ? 0.28 : 1}
                      transform={`translate(${node.x0},${node.y0})`}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setInternalSelectedPath(node.data.path);
                        onSelectNode?.(node.data);
                      }}
                    >
                      <rect
                        width={width}
                        height={height}
                        rx={12}
                        fill={fill}
                        fillOpacity={0.84}
                        stroke={selected ? CHART_THEME.text : CHART_THEME.borderSoft}
                        strokeWidth={selected ? 2.5 : 1.25}
                      >
                        <title>{`${node.data.path}\n${metricLabel(activeMetric)}: ${formatCompactNumber(value)}\nLOC: ${formatCompactNumber(node.data.aggregateLoc)}\nAge: ${formatCompactNumber(
                          node.data.overlays.medianAgeDays ?? 0,
                        )} days`}</title>
                      </rect>
                      {width > 80 && height > 40 ? (
                        <text
                          x={12}
                          y={22}
                          fill={CHART_THEME.background}
                          style={{ fontSize: 12, fontWeight: 700 }}
                        >
                          {node.data.name}
                        </text>
                      ) : null}
                      {width > 112 && height > 62 ? (
                        <text
                          x={12}
                          y={40}
                          fill={CHART_THEME.background}
                          style={{ fontSize: 11 }}
                        >
                          {formatCompactNumber(node.data.aggregateLoc)} LOC
                        </text>
                      ) : null}
                    </g>
                  );
                })}
            </g>
          </svg>
        ) : empty}
      </div>
    </ChartFrame>
  );
}

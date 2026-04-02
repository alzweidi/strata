import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import * as d3 from "d3";

import {
  CHART_THEME,
  ChartEmptyState,
  ChartFrame,
  formatCompactNumber,
  getPaletteColor,
  useResizeObserver,
} from "./shared.js";
import type {
  AuthorshipSunburstProps,
  ChartTreeNode,
} from "./types.js";

const DEFAULT_HEIGHT = 640;

function primaryAuthorColor(node: ChartTreeNode): string {
  return getPaletteColor(node.overlays.primaryAuthor ?? node.path);
}

/**
 * Render the authorship sunburst.
 *
 * @param props - Hierarchical file tree nodes and selection callbacks.
 * @returns A responsive sunburst chart with directory/file rings.
 */
export function AuthorshipSunburst({
  className,
  height = DEFAULT_HEIGHT,
  nodes,
  onSelectNode,
  selectedPath,
}: AuthorshipSunburstProps): ReactElement {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const [internalSelectedPath, setInternalSelectedPath] = useState<string | null>(
    null,
  );

  const activeSelectedPath = selectedPath ?? internalSelectedPath;

  const layout = useMemo(() => {
    const width = Math.max(0, size.width);
    const svgHeight = Math.max(0, height - 48);
    const radius = Math.max(0, Math.min(width, svgHeight) / 2 - 24);
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
      .partition<ChartTreeNode>()
      .size([2 * Math.PI, radius])(root) as d3.HierarchyRectangularNode<ChartTreeNode>;

    return { root: laidOutRoot, radius, svgHeight, width };
  }, [height, nodes, size.width]);

  const arc = useMemo(() => {
    return d3
      .arc<d3.HierarchyRectangularNode<ChartTreeNode>>()
      .startAngle((node) => node.x0)
      .endAngle((node) => node.x1)
      .innerRadius((node) => node.y0)
      .outerRadius((node) => node.y1 - 1)
      .padAngle(0.003)
      .padRadius(10);
  }, []);

  const empty = nodes.length === 0 ? (
    <ChartEmptyState
      title="No sunburst data"
      description="Provide a file tree with aggregate LOC and primary author overlays to render the sunburst."
    />
  ) : null;

  return (
    <ChartFrame
      className={className}
      height={height}
      toolbar={
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Authorship Sunburst</div>
            <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
              Inner ring = directories, outer ring = files
            </div>
          </div>
          <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
            {formatCompactNumber(nodes.reduce((sum, node) => sum + node.aggregateLoc, 0))} LOC
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
            viewBox={`0 0 ${layout.width} ${layout.svgHeight}`}
            style={{ display: "block" }}
          >
            <g
              transform={`translate(${layout.width / 2},${layout.svgHeight / 2})`}
            >
              {layout.root
                .descendants()
                .filter((node) => node.depth > 0)
                .map((node) => {
                  const selected = activeSelectedPath === node.data.path;
                  const dimmed =
                    Boolean(activeSelectedPath) && !selected && node.data.path !== activeSelectedPath;
                  const fill = primaryAuthorColor(node.data);
                  const path = arc(node) ?? "";
                  const labelVisible = node.x1 - node.x0 > 0.16 && node.y1 - node.y0 > 26;
                  return (
                    <g key={node.data.id} opacity={dimmed ? 0.24 : 1}>
                      <path
                        d={path}
                        fill={fill}
                        fillOpacity={0.82}
                        stroke={selected ? CHART_THEME.text : CHART_THEME.borderSoft}
                        strokeWidth={selected ? 2.5 : 1.25}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setInternalSelectedPath(node.data.path);
                          onSelectNode?.(node.data);
                        }}
                      >
                        <title>{`${node.data.path}\nLOC: ${formatCompactNumber(node.data.aggregateLoc)}\nAuthor: ${node.data.overlays.primaryAuthor ?? "unknown"}`}</title>
                      </path>
                      {labelVisible ? (
                        <text
                          transform={`translate(${arc.centroid(node)})`}
                          textAnchor="middle"
                          fill={CHART_THEME.background}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            pointerEvents: "none",
                          }}
                        >
                          {node.data.name}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              <circle r={layout.root.y1 ?? 0} fill="transparent" stroke={CHART_THEME.borderSoft} />
              <text
                textAnchor="middle"
                fill={CHART_THEME.text}
                style={{ fontSize: 16, fontWeight: 700 }}
              >
                {activeSelectedPath ?? "Repository"}
              </text>
              <text
                y={22}
                textAnchor="middle"
                fill={CHART_THEME.textMuted}
                style={{ fontSize: 12 }}
              >
                {formatCompactNumber(layout.root.value ?? 0)} LOC
              </text>
            </g>
          </svg>
        ) : empty}
      </div>
    </ChartFrame>
  );
}

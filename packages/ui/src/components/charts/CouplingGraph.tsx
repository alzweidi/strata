import { useEffect, useMemo, useRef, useState } from "react";
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
  CouplingGraphData,
  CouplingGraphNodeDatum,
  CouplingGraphProps,
} from "./types.js";

const DEFAULT_HEIGHT = 620;
const DEFAULT_MINIMUM_STRENGTH = 0.3;

interface GraphNodeLayout extends d3.SimulationNodeDatum, CouplingGraphNodeDatum {
  fx?: number | null;
  fy?: number | null;
  x?: number;
  y?: number;
}

interface GraphLinkLayout extends d3.SimulationLinkDatum<GraphNodeLayout> {
  source: string | GraphNodeLayout;
  target: string | GraphNodeLayout;
  strength: number;
  coChanges: number;
}

/**
 * Render the coupling force graph.
 *
 * @param props - Force graph data and interaction callbacks.
 * @returns A responsive force-directed coupling graph with cluster hulls.
 */
export function CouplingGraph({
  className,
  data,
  height = DEFAULT_HEIGHT,
  minimumStrength: controlledMinimumStrength,
  selectedNodeId,
  onSelectNode,
  onMinimumStrengthChange,
}: CouplingGraphProps): ReactElement {
  const { ref, size } = useResizeObserver<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [internalMinimumStrength, setInternalMinimumStrength] = useState(
    DEFAULT_MINIMUM_STRENGTH,
  );
  const [internalSelectedNodeId, setInternalSelectedNodeId] = useState<
    string | null
  >(null);
  const [nodes, setNodes] = useState<GraphNodeLayout[]>([]);
  const [links, setLinks] = useState<GraphLinkLayout[]>([]);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const simulationRef = useRef<d3.Simulation<GraphNodeLayout, undefined> | null>(
    null,
  );
  const layoutNodesRef = useRef<GraphNodeLayout[]>([]);

  useEffect(() => {
    if (controlledMinimumStrength !== undefined) {
      return;
    }
    setInternalMinimumStrength(DEFAULT_MINIMUM_STRENGTH);
  }, [controlledMinimumStrength, data]);

  const activeMinimumStrength =
    controlledMinimumStrength ?? internalMinimumStrength;
  const activeSelectedNodeId = selectedNodeId ?? internalSelectedNodeId;

  const filteredGraph = useMemo(() => {
    const nodesById = new Map<string, GraphNodeLayout>(
      data.nodes.map((node) => [
        node.id,
        {
          ...node,
          x: size.width > 0 ? size.width / 2 : 0,
          y: size.height > 0 ? size.height / 2 : 0,
        } satisfies GraphNodeLayout,
      ]),
    );

    const filteredLinks = data.edges.filter(
      (edge) => edge.strength >= activeMinimumStrength,
    );

    return {
      nodesById,
      filteredLinks,
    };
  }, [activeMinimumStrength, data.edges, data.nodes, size.height, size.width]);

  const dimensions = useMemo(
    () => ({
      width: Math.max(0, size.width - 32),
      height: Math.max(0, height - 56),
    }),
    [height, size.height, size.width],
  );

  const colourByDirectory = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of data.nodes) {
      if (!map.has(node.directory)) {
        map.set(node.directory, getPaletteColor(node.directory));
      }
    }
    return map;
  }, [data.nodes]);

  const degreeByNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of data.nodes) {
      map.set(node.id, 0);
    }
    for (const link of filteredGraph.filteredLinks) {
      map.set(link.source, (map.get(link.source) ?? 0) + 1);
      map.set(link.target, (map.get(link.target) ?? 0) + 1);
    }
    return map;
  }, [filteredGraph.filteredLinks, data.nodes]);

  const neighbourSet = useMemo(() => {
    const set = new Set<string>();
    if (!activeSelectedNodeId) {
      return set;
    }
    set.add(activeSelectedNodeId);
    for (const link of filteredGraph.filteredLinks) {
      const source = link.source;
      const target = link.target;
      if (source === activeSelectedNodeId) {
        set.add(target);
      }
      if (target === activeSelectedNodeId) {
        set.add(source);
      }
    }
    return set;
  }, [activeSelectedNodeId, filteredGraph.filteredLinks]);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) {
      return;
    }

    const layoutNodes: GraphNodeLayout[] = [...filteredGraph.nodesById.values()].map((node, index) => ({
      ...node,
      x:
        node.x ??
        dimensions.width / 2 +
          Math.cos((index / Math.max(1, filteredGraph.nodesById.size)) * Math.PI * 2) *
            (Math.min(dimensions.width, dimensions.height) * 0.2),
      y:
        node.y ??
        dimensions.height / 2 +
          Math.sin((index / Math.max(1, filteredGraph.nodesById.size)) * Math.PI * 2) *
            (Math.min(dimensions.width, dimensions.height) * 0.2),
    }));

    const layoutLinks: GraphLinkLayout[] = filteredGraph.filteredLinks.map((link) => ({ ...link }));
    const linkForce = d3
      .forceLink<GraphNodeLayout, GraphLinkLayout>(layoutLinks)
      .id((node) => node.id)
      .distance((link) => 140 - link.strength * 70)
      .strength((link) => Math.max(0.1, link.strength));

    const simulation = d3
      .forceSimulation(layoutNodes)
      .force("link", linkForce)
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force(
        "collide",
        d3.forceCollide<GraphNodeLayout>().radius((node) => 18 + node.degree * 2),
      )
      .alpha(1)
      .alphaDecay(0.04);
    simulationRef.current = simulation;
    layoutNodesRef.current = layoutNodes;

    let frame = 0;
    const publish = (): void => {
      setNodes(layoutNodes.map((node) => ({ ...node })));
      setLinks(layoutLinks.map((link) => ({ ...link })));
    };

    simulation.on("tick", () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        publish();
      });
    });

    simulation.on("end", publish);

    return () => {
      simulation.stop();
      simulationRef.current = null;
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [
    dimensions.height,
    dimensions.width,
    filteredGraph.filteredLinks,
    filteredGraph.nodesById,
  ]);

  useEffect(() => {
    if (!draggedNodeId) {
      return undefined;
    }

    const handleMove = (event: PointerEvent): void => {
      if (!svgRef.current || !simulationRef.current) {
        return;
      }

      const draggedNode = layoutNodesRef.current.find(
        (node) => node.id === draggedNodeId,
      );
      if (!draggedNode) {
        return;
      }

      const [x, y] = d3.pointer(event, svgRef.current);
      draggedNode.fx = Math.max(0, Math.min(dimensions.width, x));
      draggedNode.fy = Math.max(0, Math.min(dimensions.height, y));
      simulationRef.current.alphaTarget(0.2).restart();
      setNodes(layoutNodesRef.current.map((node) => ({ ...node })));
    };

    const handleUp = (): void => {
      const draggedNode = layoutNodesRef.current.find(
        (node) => node.id === draggedNodeId,
      );
      if (draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
      }
      if (simulationRef.current) {
        simulationRef.current.alphaTarget(0);
      }
      setDraggedNodeId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dimensions.height, dimensions.width, draggedNodeId]);

  const hullPaths = useMemo(() => {
    const hulls: Array<{ key: string; points: Array<[number, number]> }> = [];
    const currentNodes = new Map(nodes.map((node) => [node.id, node]));

    for (const cluster of data.clusters) {
      const points = cluster
        .map((id) => currentNodes.get(id))
        .filter((node): node is GraphNodeLayout => Boolean(node && node.x && node.y))
        .map((node) => [node.x ?? 0, node.y ?? 0] as [number, number]);

      const hull = d3.polygonHull(points);
      if (hull && hull.length >= 3) {
        hulls.push({ key: cluster.join("::"), points: hull });
      }
    }

    return hulls;
  }, [data.clusters, nodes]);

  const empty = data.nodes.length === 0 ? (
    <ChartEmptyState
      title="No coupling graph"
      description="Provide coupling nodes and edges to render the force-directed view."
    />
  ) : null;

  const nodeRadius = (degree: number): number => 10 + degree * 1.8;

  return (
    <ChartFrame
      className={className}
      height={height}
      toolbar={
        <>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Coupling Graph</div>
            <div style={{ fontSize: 12, color: CHART_THEME.textMuted }}>
              Edge width = co-change strength
            </div>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              color: CHART_THEME.textMuted,
            }}
          >
            <span>Minimum coupling</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={activeMinimumStrength}
              onChange={(event) => {
                const next = Number(event.target.value);
                setInternalMinimumStrength(next);
                onMinimumStrengthChange?.(next);
              }}
            />
            <span style={{ minWidth: 36, textAlign: "right" }}>
              {Math.round(activeMinimumStrength * 100)}%
            </span>
          </label>
        </>
      }
      empty={empty}
    >
      <div
        ref={ref}
        style={{ width: "100%", height: "100%", minHeight: height - 48 }}
      >
        {size.ready && data.nodes.length > 0 ? (
          <svg
            ref={svgRef}
            width={size.width}
            height={Math.max(size.height, height - 48)}
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            style={{ display: "block" }}
          >
            <g>
              {hullPaths.map((cluster) => (
                <path
                  key={cluster.key}
                  d={d3.line<[number, number]>().curve(d3.curveLinearClosed)(cluster.points) ?? ""}
                  fill={CHART_THEME.secondary}
                  fillOpacity={0.08}
                  stroke={CHART_THEME.secondary}
                  strokeOpacity={0.2}
                  strokeWidth={1.5}
                />
              ))}
            </g>
            <g>
              {links.map((link) => {
                const source =
                  typeof link.source === "string"
                    ? nodes.find((node) => node.id === link.source)
                    : link.source;
                const target =
                  typeof link.target === "string"
                    ? nodes.find((node) => node.id === link.target)
                    : link.target;

                if (!source || !target) {
                  return null;
                }

                const hidden =
                  Boolean(activeSelectedNodeId) &&
                  !neighbourSet.has(source.id) &&
                  !neighbourSet.has(target.id);

                return (
                  <line
                    key={`${source.id}-${target.id}`}
                    x1={source.x ?? 0}
                    y1={source.y ?? 0}
                    x2={target.x ?? 0}
                    y2={target.y ?? 0}
                    stroke={CHART_THEME.secondary}
                    strokeOpacity={hidden ? 0.08 : 0.4 + link.strength * 0.4}
                    strokeWidth={Math.max(1, link.strength * 8)}
                  />
                );
              })}
            </g>
            <g>
              {nodes.map((node) => {
                const degree = degreeByNode.get(node.id) ?? 0;
                const selected = activeSelectedNodeId === node.id;
                const hidden =
                  Boolean(activeSelectedNodeId) &&
                  !neighbourSet.has(node.id) &&
                  !selected;
                const fill = colourByDirectory.get(node.directory) ?? CHART_THEME.accent;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                    opacity={hidden ? 0.2 : 1}
                    style={{
                      cursor:
                        draggedNodeId === node.id ? "grabbing" : "grab",
                    }}
                  >
                    <circle
                      r={nodeRadius(degree)}
                      fill={fill}
                      fillOpacity={0.84}
                      stroke={selected ? CHART_THEME.text : CHART_THEME.borderSoft}
                      strokeWidth={selected ? 2.5 : 1.25}
                      onClick={() => {
                        setInternalSelectedNodeId(node.id);
                        onSelectNode?.(node.id);
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setDraggedNodeId(node.id);
                        const draggedNode = layoutNodesRef.current.find(
                          (candidate) => candidate.id === node.id,
                        );
                        if (draggedNode?.x !== undefined) {
                          draggedNode.fx = draggedNode.x;
                        }
                        if (draggedNode?.y !== undefined) {
                          draggedNode.fy = draggedNode.y;
                        }
                        if (simulationRef.current) {
                          simulationRef.current.alphaTarget(0.2).restart();
                        }
                      }}
                      onPointerUp={() => {
                        if (draggedNodeId === node.id) {
                          setDraggedNodeId(null);
                        }
                      }}
                    >
                      <title>
                        {`${node.id}\nDegree: ${degree}\nBetweenness: ${formatCompactNumber(node.betweenness)}`}
                      </title>
                    </circle>
                    {nodeRadius(degree) > 16 ? (
                      <text
                        textAnchor="middle"
                        y={4}
                        fill={CHART_THEME.background}
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          pointerEvents: "none",
                        }}
                      >
                        {node.id.split("/").pop() ?? node.id}
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

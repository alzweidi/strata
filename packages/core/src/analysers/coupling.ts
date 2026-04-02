import path from "node:path";

import type { CouplingEdge, CouplingGraph, CouplingNode, FileCoupling } from "../types.js";

export type CouplingOptions = Readonly<{
  minCoChanges?: number;
  minStrength?: number;
}>;

/**
 * Builds a coupling graph from co-change pairs.
 *
 * @param couplings The raw file-coupling observations.
 * @param options Optional threshold settings.
 * @returns A graph ready for D3 force-layout rendering.
 */
export function buildCouplingGraph(
  couplings: readonly FileCoupling[],
  options: CouplingOptions = {},
): CouplingGraph {
  const minCoChanges = options.minCoChanges ?? 3;
  const minStrength = options.minStrength ?? 0;
  const edges = couplings.filter(
    (edge) => edge.coChangeCount >= minCoChanges && edge.couplingStrength >= minStrength,
  );
  const nodeIds = collectNodeIds(edges);
  const adjacency = buildAdjacency(edges);

  return {
    nodes: buildNodes(nodeIds, adjacency),
    edges: buildEdges(edges),
    clusters: findClusters(nodeIds, adjacency),
  };
}

function collectNodeIds(edges: readonly FileCoupling[]): string[] {
  const ids = new Set<string>();

  for (const edge of edges) {
    ids.add(edge.fileA);
    ids.add(edge.fileB);
  }

  return Array.from(ids).sort((left, right) => left.localeCompare(right));
}

function buildNodes(
  nodeIds: readonly string[],
  adjacency: ReadonlyMap<string, Set<string>>,
): CouplingNode[] {
  const betweenness = calculateBetweenness(nodeIds, adjacency);

  return nodeIds.map((id) => ({
    id,
    degree: adjacency.get(id)?.size ?? 0,
    betweenness: betweenness.get(id) ?? 0,
    directory: directoryGroup(id),
  }));
}

function buildEdges(edges: readonly FileCoupling[]): CouplingEdge[] {
  return [...edges]
    .sort((left, right) => right.couplingStrength - left.couplingStrength || right.coChangeCount - left.coChangeCount)
    .map((edge) => ({
      source: edge.fileA,
      target: edge.fileB,
      strength: edge.couplingStrength,
      coChanges: edge.coChangeCount,
    }));
}

function buildAdjacency(edges: readonly FileCoupling[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    addNeighbor(adjacency, edge.fileA, edge.fileB);
    addNeighbor(adjacency, edge.fileB, edge.fileA);
  }

  return adjacency;
}

function addNeighbor(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  const existing = adjacency.get(from);

  if (existing) {
    existing.add(to);
    return;
  }

  adjacency.set(from, new Set([to]));
}

function findClusters(
  nodeIds: readonly string[],
  adjacency: ReadonlyMap<string, Set<string>>,
): string[][] {
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) {
      continue;
    }

    const cluster = traverseComponent(nodeId, adjacency, visited);
    if (cluster.length > 1) {
      clusters.push(cluster.sort((left, right) => left.localeCompare(right)));
    }
  }

  return clusters.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function traverseComponent(
  start: string,
  adjacency: ReadonlyMap<string, Set<string>>,
  visited: Set<string>,
): string[] {
  const stack = [start];
  const cluster: string[] = [];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || visited.has(node)) {
      continue;
    }

    visited.add(node);
    cluster.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return cluster;
}

function calculateBetweenness(
  nodeIds: readonly string[],
  adjacency: ReadonlyMap<string, Set<string>>,
): Map<string, number> {
  const centrality = new Map<string, number>(nodeIds.map((nodeId) => [nodeId, 0]));

  for (const source of nodeIds) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>();
    const distance = new Map<string, number>([[source, 0]]);
    const sigma = new Map<string, number>([[source, 1]]);
    const queue = [source];

    while (queue.length > 0) {
      const vertex = queue.shift();
      if (!vertex) {
        continue;
      }

      stack.push(vertex);

      for (const neighbor of adjacency.get(vertex) ?? []) {
        if (!distance.has(neighbor)) {
          distance.set(neighbor, (distance.get(vertex) ?? 0) + 1);
          queue.push(neighbor);
        }

        if (distance.get(neighbor) === (distance.get(vertex) ?? 0) + 1) {
          sigma.set(neighbor, (sigma.get(neighbor) ?? 0) + (sigma.get(vertex) ?? 0));
          const list = predecessors.get(neighbor) ?? [];
          list.push(vertex);
          predecessors.set(neighbor, list);
        }
      }
    }

    const delta = new Map<string, number>(nodeIds.map((nodeId) => [nodeId, 0]));

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }

      for (const predecessor of predecessors.get(node) ?? []) {
        const ratio = (sigma.get(predecessor) ?? 0) / Math.max(sigma.get(node) ?? 1, 1);
        delta.set(predecessor, (delta.get(predecessor) ?? 0) + ratio * (1 + (delta.get(node) ?? 0)));
      }

      if (node !== source) {
        centrality.set(node, (centrality.get(node) ?? 0) + (delta.get(node) ?? 0));
      }
    }
  }

  const scale = nodeIds.length < 3 ? 0 : 1 / (((nodeIds.length - 1) * (nodeIds.length - 2)) / 2);
  for (const [nodeId, value] of centrality.entries()) {
    centrality.set(nodeId, value * scale);
  }

  return centrality;
}

function directoryGroup(filePath: string): string {
  const directory = path.posix.dirname(filePath);
  return directory === "." ? "root" : directory.split("/")[0] ?? "root";
}


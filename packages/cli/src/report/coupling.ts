import path from "node:path";

import type {
  CouplingEdge,
  CouplingGraph,
  CouplingNode,
  RepoBusFactorSummary,
} from "@strata/core";

import { clamp } from "@strata/core";

import type { FileComputation, ReportBuildContext } from "./shared.js";

/**
 * Builds the coupling graph from repository commits.
 *
 * @param context The report build context.
 * @param minCoupling The minimum co-change threshold.
 * @returns The coupling graph section.
 */
export function buildCouplingGraph(
  context: ReportBuildContext,
  minCoupling: number,
): CouplingGraph {
  const pairCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const commit of context.snapshot.commits) {
    const uniqueFiles = Array.from(new Set(commit.filesChanged));
    for (const filePath of uniqueFiles) {
      fileCounts.set(filePath, (fileCounts.get(filePath) ?? 0) + 1);
    }

    for (let left = 0; left < uniqueFiles.length; left += 1) {
      for (let right = left + 1; right < uniqueFiles.length; right += 1) {
        const key = [uniqueFiles[left]!, uniqueFiles[right]!].sort().join("\u0000");
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const edges = Array.from(pairCounts.entries())
    .filter(([, coChanges]) => coChanges >= minCoupling)
    .map(([key, coChanges]): CouplingEdge => {
      const [source, target] = key.split("\u0000") as [string, string];
      const totalCommitsA = fileCounts.get(source) ?? 1;
      const totalCommitsB = fileCounts.get(target) ?? 1;
      return {
        source,
        target,
        coChanges,
        strength: clamp(coChanges / Math.min(totalCommitsA, totalCommitsB), 0, 1),
      };
    })
    .sort((left, right) => right.strength - left.strength);

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const maxDegree = Math.max(...Array.from(degree.values()), 1);
  const nodes: CouplingNode[] = context.snapshot.trackedFiles.map((filePath) => ({
    id: filePath,
    degree: degree.get(filePath) ?? 0,
    betweenness: (degree.get(filePath) ?? 0) / maxDegree,
    directory: path.posix.dirname(filePath) === "." ? "" : path.posix.dirname(filePath),
  }));

  return {
    nodes,
    edges,
    clusters: buildClusters(nodes.map((node) => node.id), edges),
  };
}

/**
 * Builds the bus-factor contributor graph.
 *
 * @param computations File-level metric computations.
 * @returns A graph of authors and files.
 */
export function buildContributorGraph(
  computations: readonly FileComputation[],
): RepoBusFactorSummary["contributorGraph"] {
  const nodes = new Map<string, { weight: number; group: string }>();
  const edges: Array<{ source: string; target: string; weight: number }> = [];

  for (const entry of computations) {
    const owner = entry.busFactor.owners[0];
    if (!owner) {
      continue;
    }

    const fileNodeId = entry.loc.filePath;
    const authorNodeId = owner.author;
    nodes.set(authorNodeId, {
      weight: (nodes.get(authorNodeId)?.weight ?? 0) + owner.percentOwned,
      group: "author",
    });
    nodes.set(fileNodeId, {
      weight: (nodes.get(fileNodeId)?.weight ?? 0) + entry.loc.codeLines,
      group: "file",
    });
    edges.push({
      source: authorNodeId,
      target: fileNodeId,
      weight: owner.percentOwned / 100,
    });
  }

  return {
    nodes: Array.from(nodes.entries()).map(([id, value]) => ({
      id,
      label: id,
      type: value.group === "author" ? "author" : "file",
      weight: value.weight,
      group: value.group,
    })),
    edges,
  };
}

function buildClusters(nodeIds: readonly string[], edges: readonly CouplingEdge[]): string[][] {
  const parent = new Map<string, string>();
  for (const nodeId of nodeIds) {
    parent.set(nodeId, nodeId);
  }

  const find = (value: string): string => {
    const current = parent.get(value);
    if (current === undefined || current === value) {
      return value;
    }

    const root = find(current);
    parent.set(value, root);
    return root;
  };

  const union = (left: string, right: string): void => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) {
      parent.set(rootLeft, rootRight);
    }
  };

  for (const edge of edges) {
    if (edge.strength >= 0.5) {
      union(edge.source, edge.target);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    const root = find(nodeId);
    const existing = clusters.get(root) ?? [];
    existing.push(nodeId);
    clusters.set(root, existing);
  }

  return Array.from(clusters.values()).filter((cluster) => cluster.length > 1);
}

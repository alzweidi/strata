import path from "node:path";

import type {
  FileMetricLookup,
  FileTreeNode,
  FileTreeOverlay,
} from "./types.js";

/**
 * Builds a hierarchical file tree from a flat list of repository-relative file
 * paths and merges analyser overlays into both file and directory nodes.
 *
 * @param filePaths The tracked files to place in the tree.
 * @param lookup Metric lookups keyed by normalized file path.
 * @returns The top-level tree nodes.
 */
export function buildFileTree(
  filePaths: readonly string[],
  lookup: FileMetricLookup,
): FileTreeNode[] {
  const root: FileTreeNode = createNode("", "", "directory", 0);

  for (const filePath of filePaths) {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (const [index, segment] of parts.entries()) {
      currentPath = currentPath ? path.posix.join(currentPath, segment) : segment;
      const isFile = index === parts.length - 1;
      let next = current.children.find((node) => node.name === segment);

      if (!next) {
        next = createNode(
          segment,
          currentPath,
          isFile ? "file" : "directory",
          index + 1,
        );
        current.children.push(next);
      }

      current = next;
    }

    current.overlays = createOverlay(filePath, lookup);
    current.aggregateLoc = lookup.loc.get(filePath)?.codeLines ?? 0;
  }

  rollUp(root);
  return root.children.sort(sortTreeNodes);
}

function createNode(
  name: string,
  nodePath: string,
  type: FileTreeNode["type"],
  depth: number,
): FileTreeNode {
  return {
    id: nodePath || "root",
    name,
    path: nodePath,
    type,
    depth,
    children: [],
    overlays: {},
    aggregateLoc: 0,
  };
}

function createOverlay(filePath: string, lookup: FileMetricLookup): FileTreeOverlay {
  const hotspot = lookup.hotspots.get(filePath);
  const busFactor = lookup.busFactor.get(filePath);
  const age = lookup.age.get(filePath);
  const loc = lookup.loc.get(filePath);

  return compactOverlay({
    churnScore: hotspot?.churnScore,
    hotspotScore: hotspot?.hotspotScore,
    complexity: hotspot?.complexity,
    busFactor: busFactor?.busFactor,
    medianAgeDays: age?.medianLineAgeDays,
    loc: loc?.codeLines,
    primaryAuthor: busFactor?.owners[0]?.author,
    riskLevel: hotspot?.riskLevel,
  });
}

function rollUp(node: FileTreeNode): FileTreeNode {
  if (node.type === "file") {
    return node;
  }

  const children = node.children.map(rollUp).sort(sortTreeNodes);
  node.children = children;
  node.aggregateLoc = children.reduce((sum, child) => sum + child.aggregateLoc, 0);
  node.overlays = compactOverlay({
    churnScore: averageDefined(children.map((child) => child.overlays.churnScore)),
    hotspotScore: averageDefined(
      children.map((child) => child.overlays.hotspotScore),
    ),
    complexity: averageDefined(children.map((child) => child.overlays.complexity)),
    busFactor: averageDefined(children.map((child) => child.overlays.busFactor)),
    medianAgeDays: averageDefined(
      children.map((child) => child.overlays.medianAgeDays),
    ),
    loc: node.aggregateLoc,
  });

  return node;
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  const filtered = values.filter((value): value is number => value !== undefined);

  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function compactOverlay(input: {
  churnScore?: number;
  hotspotScore?: number;
  complexity?: number;
  busFactor?: number;
  medianAgeDays?: number;
  loc?: number;
  primaryAuthor?: string;
  riskLevel?: FileTreeOverlay["riskLevel"];
}): FileTreeOverlay {
  const output: FileTreeOverlay = {};

  if (input.churnScore !== undefined) {
    output.churnScore = input.churnScore;
  }
  if (input.hotspotScore !== undefined) {
    output.hotspotScore = input.hotspotScore;
  }
  if (input.complexity !== undefined) {
    output.complexity = input.complexity;
  }
  if (input.busFactor !== undefined) {
    output.busFactor = input.busFactor;
  }
  if (input.medianAgeDays !== undefined) {
    output.medianAgeDays = input.medianAgeDays;
  }
  if (input.loc !== undefined) {
    output.loc = input.loc;
  }
  if (input.primaryAuthor !== undefined) {
    output.primaryAuthor = input.primaryAuthor;
  }
  if (input.riskLevel !== undefined) {
    output.riskLevel = input.riskLevel;
  }

  return output;
}

function sortTreeNodes(left: FileTreeNode, right: FileTreeNode): number {
  if (left.type !== right.type) {
    return left.type === "directory" ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

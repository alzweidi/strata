import type { FileTreeNode, MetricOverlayName } from "../types/report";

export function flattenTree(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

export function findNodeByPath(
  nodes: readonly FileTreeNode[],
  filePath: string,
): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === filePath) {
      return node;
    }

    const childMatch = findNodeByPath(node.children, filePath);

    if (childMatch) {
      return childMatch;
    }
  }

  return undefined;
}

export function overlayValue(
  node: FileTreeNode,
  overlay: MetricOverlayName,
): number | undefined {
  switch (overlay) {
    case "age":
      return node.overlays.medianAgeDays;
    case "busFactor":
      return node.overlays.busFactor;
    case "churn":
      return node.overlays.churnScore;
    case "complexity":
      return node.overlays.complexity;
    case "hotspot":
      return node.overlays.hotspotScore;
    case "loc":
      return node.overlays.loc;
  }
}


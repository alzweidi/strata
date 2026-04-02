import type { FileTreeNode, LocSnapshot } from "../../packages/ui/src/types/report.ts";

export function flattenTree(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  const flat: FileTreeNode[] = [];
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    flat.push(node);
    stack.push(...node.children);
  }

  return flat;
}

export function uniqueHistoryLanguages(history: readonly LocSnapshot[]): string[] {
  const languages = new Set<string>();

  for (const snapshot of history) {
    for (const language of Object.keys(snapshot.byLanguage)) {
      languages.add(language);
    }
  }

  return [...languages].sort((left, right) => left.localeCompare(right));
}

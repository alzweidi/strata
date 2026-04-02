export type TreeNodeLike = Readonly<{
  type: string;
  namedChildren?: readonly TreeNodeLike[];
  children?: readonly TreeNodeLike[];
}>;

export type TreeLike = Readonly<{
  rootNode: TreeNodeLike | null;
}>;

export type ParserLike = Readonly<{
  parse(source: string): TreeLike | null;
}>;

const DEFAULT_DECISION_NODES = new Set([
  "catch_clause",
  "conditional_expression",
  "else_if_clause",
  "for_statement",
  "if_statement",
  "logical_expression",
  "switch_case",
  "ternary_expression",
  "while_statement",
]);

/**
 * Walks a syntax tree and counts nodes that represent decision points.
 *
 * @param tree The parsed syntax tree, if available.
 * @param decisionTypes Optional override for the decision node types.
 * @returns The number of decision points discovered in the tree.
 */
export function countDecisionNodes(
  tree: TreeLike | null,
  decisionTypes: ReadonlySet<string> = DEFAULT_DECISION_NODES,
): number {
  if (!tree?.rootNode) {
    return 0;
  }

  let count = 0;
  walkTree(tree.rootNode, (node) => {
    if (decisionTypes.has(node.type)) {
      count += 1;
    }
  });

  return count;
}

/**
 * Traverses a tree in depth-first order and invokes the supplied visitor for
 * each node.
 *
 * @param node The tree node to start from.
 * @param visitor Callback invoked for every visited node.
 * @returns Nothing.
 */
export function walkTree(node: TreeNodeLike, visitor: (node: TreeNodeLike) => void): void {
  const stack: TreeNodeLike[] = [node];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    visitor(current);

    const children = current.namedChildren ?? current.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];

      if (child) {
        stack.push(child);
      }
    }
  }
}

/**
 * Removes obvious comments and string literals so simple token scans do not
 * over-count complexity.
 *
 * @param source The source text to sanitize.
 * @returns Sanitized source text.
 */
export function stripSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(?<!:)\/\/.*$/gm, " ")
    .replace(/(^|\s)#.*$/gm, "$1")
    .replace(/(^|\s)--.*$/gm, "$1")
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, " ");
}

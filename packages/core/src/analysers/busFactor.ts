import path from "node:path";

import type {
  AuthorOwnership,
  BusFactorMetric,
  Commit,
  ContributorEdge,
  ContributorGraph,
  ContributorNode,
  FileBlame,
  RepoBusFactorSummary,
} from "../types.js";
import { median } from "../utils.js";

export type BusFactorOptions = Readonly<{
  now?: number;
  commits?: readonly Commit[];
}>;

/**
 * Calculates per-file and repository-level bus factor metrics from blame data.
 *
 * @param files The blamed file snapshots to analyse.
 * @param options Optional calculation settings.
 * @returns The repository bus factor summary.
 */
export function analyseBusFactor(
  files: readonly FileBlame[],
  options: BusFactorOptions = {},
): RepoBusFactorSummary {
  const now = options.now ?? Date.now();
  const metrics = files.map((file) => buildMetric(file, now));
  const repoWideScore = weightedAverage(metrics.map((metric) => metric.busFactor), files);

  return {
    repoWideScore,
    criticalFiles: metrics.filter((metric) => metric.busFactor === 1),
    contributorGraph: buildContributorGraph(metrics),
  };
}

function buildMetric(file: FileBlame, now: number): BusFactorMetric {
  const totals = ownershipByAuthor(file.lines);
  const owners = Array.from(totals.values())
    .map((ownership) => ({
      ...ownership,
      percentOwned: file.lines.length > 0 ? ownership.linesOwned / file.lines.length : 0,
    }))
    .sort((left, right) => right.linesOwned - left.linesOwned || left.author.localeCompare(right.author));
  const busFactor = authorsToReachMajority(owners);
  const primaryOwner = owners[0];

  return {
    filePath: file.filePath,
    busFactor,
    owners,
    orphanRisk: primaryOwner ? now - primaryOwner.lastActive > 90 * 24 * 60 * 60 * 1000 : false,
  };
}

function ownershipByAuthor(lines: FileBlame["lines"]): Map<string, AuthorOwnership> {
  const ownership = new Map<string, AuthorOwnership>();

  for (const line of lines) {
    const key = canonicalAuthorKey(line.author, line.email);
    const existing = ownership.get(key);

    if (!existing) {
      ownership.set(key, {
        author: line.author || line.email || "Unknown",
        email: line.email,
        linesOwned: 1,
        percentOwned: 0,
        lastActive: line.timestamp,
      });
      continue;
    }

    existing.linesOwned += 1;
    existing.lastActive = Math.max(existing.lastActive, line.timestamp);
  }

  return ownership;
}

function authorsToReachMajority(owners: readonly AuthorOwnership[]): number {
  if (owners.length === 0) {
    return 0;
  }

  const totalLines = owners.reduce((sum, owner) => sum + owner.linesOwned, 0);
  let cumulative = 0;
  let count = 0;

  for (const owner of owners) {
    cumulative += owner.linesOwned;
    count += 1;

    if (cumulative / totalLines > 0.5) {
      return count;
    }
  }

  return count;
}

function weightedAverage(values: readonly number[], files: readonly FileBlame[]): number {
  const weights = files.map((file) => Math.max(file.lines.length, 1));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightTotal === 0) {
    return 0;
  }

  return values.reduce((sum, value, index) => sum + value * weights[index]!, 0) / weightTotal;
}

function buildContributorGraph(metrics: readonly BusFactorMetric[]): ContributorGraph {
  const nodes = new Map<string, ContributorNode>();
  const edges: ContributorEdge[] = [];

  for (const metric of metrics) {
    const fileId = metric.filePath;
    nodes.set(fileId, {
      id: fileId,
      label: path.posix.basename(fileId),
      type: "file",
      weight: Math.max(metric.owners.reduce((sum, owner) => sum + owner.linesOwned, 0), 1),
      group: directoryGroup(fileId),
    });

    for (const owner of metric.owners) {
      const authorId = authorNodeId(owner.author, owner.email);
      nodes.set(authorId, {
        id: authorId,
        label: owner.author,
        type: "author",
        weight: owner.linesOwned,
        group: "author",
      });

      edges.push({
        source: authorId,
        target: fileId,
        weight: owner.percentOwned,
      });
    }
  }

  return {
    nodes: Array.from(nodes.values()).sort((left, right) => left.label.localeCompare(right.label)),
    edges,
  };
}

function canonicalAuthorKey(author: string, email: string): string {
  return `${normalizeText(author)}|${email.toLowerCase()}`;
}

function authorNodeId(author: string, email: string): string {
  return `author:${canonicalAuthorKey(author, email)}`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function directoryGroup(filePath: string): string {
  const directory = path.posix.dirname(filePath);
  return directory === "." ? "root" : directory.split("/")[0] ?? "root";
}

/**
 * Returns a compact measure of author concentration for a file.
 *
 * @param values The ownership values to summarise.
 * @returns The median ownership share, useful when ranking concentration.
 */
export function medianOwnership(values: readonly AuthorOwnership[]): number {
  return median(values.map((value) => value.percentOwned));
}

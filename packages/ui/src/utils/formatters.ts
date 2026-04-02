export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(value: number | string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(value: number): string {
  if (value < 1_000) {
    return `${value}ms`;
  }

  return `${(value / 1_000).toFixed(1)}s`;
}


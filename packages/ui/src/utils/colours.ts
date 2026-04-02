import type { RiskLevel } from "../types/report";

export const colours = {
  background: "#0D0D0D",
  surface: "#111111",
  surfaceAlt: "#171717",
  border: "#1E1E1E",
  text: "#F3F7F4",
  muted: "#8A938F",
  accent: "#00FF88",
  secondary: "#00C8FF",
  warning: "#FFB800",
  danger: "#FF4444",
  dangerSoft: "#451A1A",
  successSoft: "#103826",
};

export const riskColours: Record<RiskLevel, string> = {
  low: "#206C47",
  medium: "#C28100",
  high: "#E85D2E",
  critical: "#FF4444",
};

export function metricColour(metric: number, max = 100): string {
  const ratio = Math.max(0, Math.min(metric / max, 1));
  const red = Math.round(20 + ratio * 235);
  const green = Math.round(255 - ratio * 140);
  const blue = Math.round(136 - ratio * 68);
  return `rgb(${red}, ${green}, ${blue})`;
}


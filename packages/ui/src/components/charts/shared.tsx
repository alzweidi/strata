import type { ReactElement, ReactNode, RefCallback } from "react";
import { useEffect, useState } from "react";
import { format } from "d3-format";

import type { ChartTone, RiskLevel } from "./types.js";

export const CHART_THEME = {
  background: "#0D0D0D",
  surface: "#111111",
  surfaceAlt: "#161616",
  border: "#1E1E1E",
  borderSoft: "#262626",
  accent: "#00FF88",
  secondary: "#00C8FF",
  warning: "#FFB800",
  danger: "#FF4444",
  text: "#F5F5F5",
  textMuted: "#A3A3A3",
} as const;

export interface ChartSize {
  /** Measured content width in pixels. */
  width: number;
  /** Measured content height in pixels. */
  height: number;
  /** True once the observer has a non-zero box. */
  ready: boolean;
}

export interface ChartFrameProps {
  className?: string;
  height?: number;
  /** Optional header controls rendered above the chart body. */
  toolbar?: ReactNode;
  /** Chart body content, usually the SVG surface. */
  children: ReactNode;
  /** Optional empty-state node rendered instead of the chart body. */
  empty?: ReactNode;
}

/**
 * Observe an element and expose its live size.
 *
 * @returns A callback ref and the latest measured box.
 */
export function useResizeObserver<T extends HTMLElement>(): {
  ref: RefCallback<T>;
  size: ChartSize;
} {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ChartSize>({
    width: 0,
    height: 0,
    ready: false,
  });

  useEffect(() => {
    if (!element) {
      setSize({ width: 0, height: 0, ready: false });
      return;
    }

    const update = (): void => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
        ready: element.clientWidth > 0 && element.clientHeight > 0,
      });
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      update();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref: setElement, size };
}

/**
 * Render the shared chart shell.
 *
 * @param props - Frame options and chart content.
 * @returns A styled shell that keeps charts visually consistent.
 */
export function ChartFrame({
  className,
  height = 520,
  toolbar,
  children,
  empty,
}: ChartFrameProps): ReactElement {
  return (
    <section
      className={className}
      style={{
        minHeight: height,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        borderRadius: 24,
        border: `1px solid ${CHART_THEME.border}`,
        background:
          "radial-gradient(circle at top left, rgba(0, 255, 136, 0.08), transparent 36%), linear-gradient(180deg, rgba(17,17,17,0.98), rgba(13,13,13,0.98))",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
        color: CHART_THEME.text,
      }}
    >
      {toolbar ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            minHeight: 36,
          }}
        >
          {toolbar}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        {empty ?? children}
      </div>
    </section>
  );
}

/**
 * Show the shared fallback when a chart has no usable data.
 *
 * @param props - Empty state title and description.
 * @returns A centered empty state panel.
 */
export function ChartEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}): ReactElement {
  return (
    <div
      style={{
        height: "100%",
        minHeight: 240,
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        borderRadius: 20,
        border: `1px dashed ${CHART_THEME.borderSoft}`,
        background:
          "linear-gradient(180deg, rgba(17,17,17,0.7), rgba(13,13,13,0.7))",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: CHART_THEME.text }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            lineHeight: 1.6,
            color: CHART_THEME.textMuted,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}

/**
 * Clamp a numeric value to an inclusive range.
 *
 * @param value - Number to clamp.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The bounded number.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalise a value into the 0-1 range.
 *
 * @param value - Input value.
 * @param min - Domain minimum.
 * @param max - Domain maximum.
 * @returns A value between 0 and 1.
 */
export function normalize(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

/**
 * Format a number using compact notation.
 *
 * @param value - Value to format.
 * @returns A human-readable compact string.
 */
export function formatCompactNumber(value: number): string {
  return format(".2~s")(value).replace("G", "B");
}

/**
 * Format a date as a long-form label.
 *
 * @param value - Date-like input.
 * @returns A readable calendar label.
 */
export function formatDateLabel(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Format a date as a short calendar label.
 *
 * @param value - Date-like input.
 * @returns A compact month/day label.
 */
export function formatShortDate(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * Format a date as a month label.
 *
 * @param value - Date-like input.
 * @returns A month-only label.
 */
export function formatMonthLabel(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
  }).format(date);
}

/**
 * Map a risk level to a chart color.
 *
 * @param risk - File risk level.
 * @returns The matching theme color.
 */
export function riskColor(risk: RiskLevel): string {
  switch (risk) {
    case "low":
      return CHART_THEME.accent;
    case "medium":
      return CHART_THEME.secondary;
    case "high":
      return CHART_THEME.warning;
    case "critical":
      return CHART_THEME.danger;
    default:
      return CHART_THEME.secondary;
  }
}

/**
 * Map a tone token to a chart color.
 *
 * @param tone - Tone token used by annotations and labels.
 * @returns The matching theme color.
 */
export function toneColor(tone: ChartTone): string {
  switch (tone) {
    case "accent":
      return CHART_THEME.accent;
    case "warning":
      return CHART_THEME.warning;
    case "danger":
      return CHART_THEME.danger;
    case "neutral":
    default:
      return CHART_THEME.textMuted;
  }
}

/**
 * Pick a stable color from a seed string.
 *
 * @param seed - Key used to derive a deterministic palette value.
 * @returns A palette colour.
 */
export function getPaletteColor(seed: string): string {
  const palette = [
    "#00FF88",
    "#00C8FF",
    "#FFB800",
    "#FF4444",
    "#7CFFCB",
    "#6AE4FF",
    "#B9FF5C",
    "#FF7A59",
  ];

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  const paletteIndex = Math.abs(hash) % palette.length;
  return palette[paletteIndex] ?? CHART_THEME.secondary;
}

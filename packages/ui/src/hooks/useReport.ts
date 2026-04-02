import { useMemo } from "react";

import { useReportStore } from "../store/reportStore";
import { useUiStore } from "../store/uiStore";
import type { HotspotMetric, StrataReport } from "../types/report";

export function useReport(): {
  report?: StrataReport;
  loading: boolean;
  error?: string;
} {
  const report = useReportStore((state) => state.report);
  const loading = useReportStore((state) => state.loading);
  const error = useReportStore((state) => state.error);

  return { report, loading, error };
}

export function useSelectedFileMetric(): HotspotMetric | undefined {
  const report = useReportStore((state) => state.report);
  const selectedFile = useUiStore((state) => state.selectedFile);

  return useMemo(() => {
    if (!report || !selectedFile) {
      return undefined;
    }

    return report.hotspots.find((metric) => metric.filePath === selectedFile);
  }, [report, selectedFile]);
}


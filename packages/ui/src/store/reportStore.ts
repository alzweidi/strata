import { create } from "zustand";

import mockReport from "../../../../fixtures/report.json";
import type { StrataReport } from "../types/report";

interface ReportState {
  report?: StrataReport;
  loading: boolean;
  error?: string;
  loadReport: () => Promise<void>;
}

export const useReportStore = create<ReportState>((set) => ({
  report: undefined,
  loading: false,
  error: undefined,
  loadReport: async () => {
    set({ loading: true, error: undefined });

    try {
      const response = await fetch("/report.json");

      if (!response.ok) {
        throw new Error(`Failed to fetch report: ${response.status}`);
      }

      const report = (await response.json()) as StrataReport;
      set({ report, loading: false });
      return;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown report loading error";
      set({
        report: mockReport as StrataReport,
        loading: false,
        error: `${message}. Loaded fixture data instead.`,
      });
    }
  },
}));


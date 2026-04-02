import { create } from "zustand";

import type { MetricOverlayName } from "../types/report";

interface UiState {
  selectedFile?: string;
  searchQuery: string;
  overlay: MetricOverlayName;
  detailPanelOpen: boolean;
  setSelectedFile: (filePath?: string) => void;
  setSearchQuery: (query: string) => void;
  setOverlay: (overlay: MetricOverlayName) => void;
  toggleDetailPanel: (open?: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedFile: undefined,
  searchQuery: "",
  overlay: "hotspot",
  detailPanelOpen: true,
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setOverlay: (overlay) => set({ overlay }),
  toggleDetailPanel: (open) =>
    set((state) => ({
      detailPanelOpen: open ?? !state.detailPanelOpen,
    })),
}));


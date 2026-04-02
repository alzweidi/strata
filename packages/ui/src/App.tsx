import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { DetailPanel } from "./components/layout/DetailPanel";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { AgePage } from "./pages/Age";
import { AuthorsPage } from "./pages/Authors";
import { BusFactorPage } from "./pages/BusFactor";
import { CommitsPage } from "./pages/Commits";
import { CouplingPage } from "./pages/Coupling";
import { ExplorerPage } from "./pages/Explorer";
import { HotspotsPage } from "./pages/Hotspots";
import { LocPage } from "./pages/Loc";
import { OverviewPage } from "./pages/Overview";
import { useReportStore } from "./store/reportStore";
import { useUiStore } from "./store/uiStore";
import { formatDate } from "./utils/formatters";

export default function App() {
  const loadReport = useReportStore((state) => state.loadReport);
  const report = useReportStore((state) => state.report);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
      <Sidebar />
      <div className="min-w-0">
        <TopBar
          repoName={report?.meta.repoName ?? "Loading repository"}
          headSha={report?.meta.headSha ?? "-------"}
          generatedAt={
            report ? formatDate(report.meta.generatedAt) : "Preparing fixture"
          }
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <main className="px-6 py-6">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/hotspots" element={<HotspotsPage />} />
            <Route path="/bus-factor" element={<BusFactorPage />} />
            <Route path="/age" element={<AgePage />} />
            <Route path="/coupling" element={<CouplingPage />} />
            <Route path="/loc" element={<LocPage />} />
            <Route path="/authors" element={<AuthorsPage />} />
            <Route path="/commits" element={<CommitsPage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <DetailPanel />
    </div>
  );
}


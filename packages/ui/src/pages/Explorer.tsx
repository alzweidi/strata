import type { FileTreeNode } from "../types/report";
import { Breadcrumb } from "../components/shared/Breadcrumb";
import { useReport } from "../hooks/useReport";
import { useUiStore } from "../store/uiStore";
import { overlayValue } from "../utils/treeUtils";

export function ExplorerPage() {
  const { report } = useReport();
  const overlay = useUiStore((state) => state.overlay);
  const setOverlay = useUiStore((state) => state.setOverlay);
  const setSelectedFile = useUiStore((state) => state.setSelectedFile);

  if (!report) {
    return null;
  }

  return (
    <div className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/35">
            Repository Explorer
          </p>
          <div className="mt-3">
            <Breadcrumb segments={["repo", overlay]} />
          </div>
        </div>
        <select
          value={overlay}
          onChange={(event) => setOverlay(event.target.value as typeof overlay)}
          className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white"
        >
          <option value="hotspot">Hotspot</option>
          <option value="complexity">Complexity</option>
          <option value="churn">Churn</option>
          <option value="age">Age</option>
          <option value="busFactor">Bus Factor</option>
          <option value="loc">LOC</option>
        </select>
      </div>

      <div className="mt-6 space-y-3">
        {report.fileTree.map((node) => (
          <ExplorerNode
            key={node.id}
            node={node}
            overlay={overlay}
            onSelectFile={setSelectedFile}
          />
        ))}
      </div>
    </div>
  );
}

interface ExplorerNodeProps {
  node: FileTreeNode;
  overlay: "age" | "busFactor" | "churn" | "complexity" | "hotspot" | "loc";
  onSelectFile: (filePath?: string) => void;
}

function ExplorerNode({ node, overlay, onSelectFile }: ExplorerNodeProps) {
  const value = overlayValue(node, overlay);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
      <button
        type="button"
        onClick={() => node.type === "file" && onSelectFile(node.path)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-white/45">{node.type === "file" ? "f" : "d"}</span>
          <span className="font-mono text-sm text-white">{node.path}</span>
        </div>
        <span className="text-xs uppercase tracking-[0.3em] text-white/35">
          {value !== undefined ? Math.round(value) : "-"}
        </span>
      </button>
      {node.children.length > 0 ? (
        <div className="mt-3 space-y-3 border-l border-white/7 pl-4">
          {node.children.map((child) => (
            <ExplorerNode
              key={child.id}
              node={child}
              overlay={overlay}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { projectActions, projectStore } from "@/store/project-store";
import { startRenderController } from "@/store/render-controller";
import { StlViewer } from "@/viewer/StlViewer";
import { ParameterPanel } from "@/ui/ParameterPanel";
import { SourceEditor } from "@/ui/SourceEditor";
import { UrlControls } from "@/ui/UrlControls";
import { PreviewActions } from "@/ui/PreviewActions";
import { registerWebMcpTools } from "@/mcp/register";

export const Route = createFileRoute("/")({ component: App });

const SAMPLE_NAME = "multiboard-box.scad";
const SAMPLE_ORIGIN = "sample:/samples/multiboard-box.scad";
const SAMPLE_URL = "/samples/multiboard-box.scad";

type Mode = "customize" | "code";

function App() {
  const [mode, setMode] = useState<Mode>("customize");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showExtents, setShowExtents] = useState(false);

  useEffect(() => {
    registerWebMcpTools();
    const stop = startRenderController();

    if (!projectStore.state.source) {
      void (async () => {
        try {
          const resp = await fetch(SAMPLE_URL);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const text = await resp.text();
          projectActions.loadSource({
            name: SAMPLE_NAME,
            origin: SAMPLE_ORIGIN,
            source: text,
          });
        } catch (e) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      })();
    }

    return stop;
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-(--bg-base)">
      <header className="border-b border-(--line) bg-(--header-bg) px-4 pt-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <UrlControls />
          </div>
          <ExtentsToggle value={showExtents} onChange={setShowExtents} />
        </div>
        {loadError ? (
          <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-900">
            Failed to load sample: {loadError}
          </div>
        ) : null}
        <ModeTabs mode={mode} onChange={setMode} />
      </header>

      <main className="flex min-h-0 flex-1">
        {mode === "customize" ? (
          <div className="grid min-h-0 w-full flex-1 grid-cols-[640px_1fr]">
            <ParameterPanel className="h-full overflow-y-auto border-r border-(--line) p-4" />
            <PreviewPane showExtents={showExtents} />
          </div>
        ) : (
          <SourceEditor className="flex min-h-0 w-full flex-1 flex-col p-3" />
        )}
      </main>
    </div>
  );
}

function ModeTabs({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="-mb-px mt-3 flex gap-1">
      {(["customize", "code"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={
              "rounded-t-md border border-b-0 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition " +
              (active
                ? "border-(--line) bg-(--bg-base) text-(--sea-ink)"
                : "border-transparent text-(--sea-ink-soft) hover:text-(--sea-ink)")
            }
          >
            {m === "customize" ? "Customize" : "Code"}
          </button>
        );
      })}
    </div>
  );
}

function PreviewPane({ showExtents }: { showExtents: boolean }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-(--line) px-3 py-2">
        <PreviewActions />
      </div>
      <div className="min-h-0 flex-1 bg-black/40">
        <StlViewer className="h-full w-full" showExtents={showExtents} />
      </div>
    </div>
  );
}

function ExtentsToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-(--line) bg-(--chip-bg) px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-(--sea-ink) select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-(--lagoon-deep)"
      />
      Show extents
    </label>
  );
}

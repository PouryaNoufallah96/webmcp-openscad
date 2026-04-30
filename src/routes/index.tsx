import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { projectActions, projectStore } from '@/store/project-store'
import { startRenderController } from '@/store/render-controller'
import { StlViewer } from '@/viewer/StlViewer'
import { ParameterPanel } from '@/ui/ParameterPanel'
import { Toolbar } from '@/ui/Toolbar'
import { SourceEditor } from '@/ui/SourceEditor'
import { HistoryPanel } from '@/ui/HistoryPanel'
import {
  getRegisteredToolCount,
  registerWebMcpTools,
} from '@/mcp/register'

export const Route = createFileRoute('/')({ component: App })

const SAMPLE_NAME = 'rounded-channel.scad'
const SAMPLE_ORIGIN = 'sample:/samples/rounded-channel.scad'
const SAMPLE_URL = '/samples/rounded-channel.scad'

function App() {
  const sourceState = useStore(projectStore, (s) => s.source)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [mcpToolCount, setMcpToolCount] = useState(0)

  useEffect(() => {
    registerWebMcpTools()
    setMcpToolCount(getRegisteredToolCount())
    const stop = startRenderController()

    if (!projectStore.state.source) {
      void (async () => {
        try {
          const resp = await fetch(SAMPLE_URL)
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const text = await resp.text()
          projectActions.loadSource({
            name: SAMPLE_NAME,
            origin: SAMPLE_ORIGIN,
            source: text,
          })
        } catch (e) {
          setLoadError(e instanceof Error ? e.message : String(e))
        }
      })()
    }

    return stop
  }, [])

  return (
    <main className="page-wrap px-4 pb-8 pt-6">
      <section className="island-shell rounded-2xl p-4">
        <header className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="island-kicker">scad-webmcp · agent-driven CAD</p>
              <h1 className="display-title text-2xl font-bold tracking-tight text-[var(--sea-ink)]">
                {sourceState?.name ?? '(loading…)'}
              </h1>
              {sourceState?.origin ? (
                <p className="m-0 mt-1 text-[11px] font-mono text-[var(--sea-ink-soft)]">
                  {sourceState.origin}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <McpBadge count={mcpToolCount} />
              <RenderBadge />
            </div>
          </div>
          <Toolbar />
        </header>

        {loadError ? (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-900">
            Failed to load sample: {loadError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          <ParameterPanel className="max-h-[78vh] overflow-y-auto pr-1" />
          <div className="flex flex-col gap-3">
            <div className="aspect-[4/3] overflow-hidden rounded-xl border border-[var(--line)] bg-black/40">
              <StlViewer className="h-full w-full" />
            </div>
            <RenderDetails />
            <HistoryPanel className="max-h-64 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3" />
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="text-xs font-semibold uppercase tracking-wide text-[var(--lagoon-deep)] hover:underline"
          >
            {showSource ? 'Hide' : 'Show'} source editor
          </button>
          {showSource ? (
            <div className="mt-3">
              <SourceEditor />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function RenderDetails() {
  const renderState = useStore(projectStore, (s) => s.render)
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--sea-ink-soft)]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <span className="island-kicker">status</span>
          <div>{renderState.status}</div>
        </div>
        <div>
          <span className="island-kicker">renderMs</span>
          <div>
            {renderState.renderMs !== null
              ? renderState.renderMs.toFixed(0)
              : '—'}
          </div>
        </div>
        <div>
          <span className="island-kicker">stl bytes</span>
          <div>
            {renderState.stl
              ? renderState.stl.byteLength.toLocaleString()
              : '—'}
          </div>
        </div>
        <div>
          <span className="island-kicker">request</span>
          <div>{renderState.requestId ?? '—'}</div>
        </div>
      </div>
      {renderState.error ? (
        <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-red-200 bg-red-50 p-2 text-[10px] leading-snug text-red-900">
          {renderState.error}
          {renderState.stderr ? `\n\n${renderState.stderr}` : ''}
        </pre>
      ) : null}
    </div>
  )
}

function McpBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span
        className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-1 text-[10px] font-mono uppercase tracking-wide text-[var(--sea-ink-soft)]"
        title="navigator.modelContext not initialized yet"
      >
        mcp · idle
      </span>
    )
  }
  return (
    <span
      className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.18)] px-3 py-1 text-[10px] font-mono uppercase tracking-wide text-[var(--lagoon-deep)]"
      title="Tools are registered on navigator.modelContext. Run `npx @mcp-b/webmcp-local-relay` and connect from your MCP client (Claude / Cursor / Windsurf)."
    >
      mcp · {count} tools
    </span>
  )
}

function RenderBadge() {
  const status = useStore(projectStore, (s) => s.render.status)
  const renderMs = useStore(projectStore, (s) => s.render.renderMs)
  const bytes = useStore(projectStore, (s) =>
    s.render.stl ? s.render.stl.byteLength : null,
  )

  let cls = 'text-[var(--sea-ink-soft)]'
  let label: string
  if (status === 'pending') {
    cls = 'text-[var(--lagoon-deep)]'
    label = 'rendering…'
  } else if (status === 'success' && renderMs !== null && bytes !== null) {
    cls = 'text-[var(--palm)]'
    label = `ok — ${bytes.toLocaleString()} bytes / ${renderMs.toFixed(0)}ms`
  } else if (status === 'error') {
    cls = 'text-red-600'
    label = 'render error'
  } else {
    label = 'idle'
  }

  return <span className={`text-xs font-mono ${cls}`}>{label}</span>
}

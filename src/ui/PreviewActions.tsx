import { useStore } from '@tanstack/react-store'
import { projectActions, projectStore } from '@/store/project-store'
import { renderNow } from '@/store/render-controller'

function downloadStl(stl: Uint8Array, fileName: string) {
  const blob = new Blob([stl as BlobPart], { type: 'model/stl' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--lagoon-deep)] border-t-transparent align-[-2px]"
    />
  )
}

export function PreviewActions() {
  const renderState = useStore(projectStore, (s) => s.render)
  const sourceState = useStore(projectStore, (s) => s.source)

  const isRendering = renderState.status === 'pending'
  const canExport = renderState.status === 'success' && renderState.stl !== null

  const handleRender = () => {
    void renderNow()
  }

  const handleExport = () => {
    if (!renderState.stl) return
    const baseName = sourceState?.name?.replace(/\.scad$/i, '') ?? 'output'
    downloadStl(renderState.stl, `${baseName}.stl`)
    projectActions.pushHistory({
      kind: 'export',
      summary: `exported ${baseName}.stl (${renderState.stl.byteLength} bytes)`,
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRender}
        disabled={!sourceState || isRendering}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.18)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition disabled:opacity-60"
      >
        {isRendering ? (
          <>
            <Spinner />
            Rendering…
          </>
        ) : (
          'Render'
        )}
      </button>
      <button
        type="button"
        onClick={handleExport}
        disabled={!canExport}
        className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition disabled:opacity-50"
      >
        Export STL
      </button>
      {renderState.status === 'error' && renderState.error ? (
        <span
          title={renderState.error}
          className="truncate text-xs font-mono text-red-600"
        >
          render error
        </span>
      ) : null}
    </div>
  )
}

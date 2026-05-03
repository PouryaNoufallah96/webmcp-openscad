/**
 * Render + Export STL controls — the human counterpart to the `render`
 * and `export_stl` MCP tools.
 *
 * The download path is the standard browser idiom:
 *   1. Wrap the bytes in a Blob with the right MIME type.
 *   2. Synthesise a temporary `a[download]` and click it.
 *   3. Revoke the object URL on a microtask (defer-to-next-tick) so we
 *      don't yank the URL out from under the browser before it kicks
 *      off the actual file save.
 *
 * The `as BlobPart` cast is required: in strict TS, `Uint8Array` is
 * typed with `ArrayBufferLike` (which includes `SharedArrayBuffer`), and
 * `BlobPart` only accepts `BufferSource`. The runtime value is fine.
 */
import { useSelector } from '@tanstack/react-store'
import {
  projectActions,
  projectStore,
  sanitizeProjectFileName,
} from '@/store/project-store'
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
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--lagoon-deep) border-t-transparent align-[-2px]"
    />
  )
}

export function PreviewActions() {
  const renderState = useSelector(projectStore, (s) => s.render)
  const sourceState = useSelector(projectStore, (s) => s.source)
  const projectName = useSelector(projectStore, (s) => s.projectName)

  const isRendering = renderState.status === 'pending'
  const canExport = renderState.status === 'success' && renderState.stl !== null

  const handleRender = () => {
    void renderNow()
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    projectActions.setProjectName(e.target.value)
  }

  const handleExport = () => {
    if (!renderState.stl) return
    const fileName = `${sanitizeProjectFileName(projectName || 'project')}.stl`
    downloadStl(renderState.stl, fileName)
    projectActions.pushHistory({
      kind: 'export',
      summary: `exported ${fileName} (${renderState.stl.byteLength} bytes)`,
    })
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-(--sea-ink-soft)">
        Project
        <input
          type="text"
          value={projectName}
          onChange={handleNameChange}
          disabled={!sourceState}
          placeholder="project"
          spellCheck={false}
          title="Project name — becomes the exported STL filename"
          className="w-44 rounded-full border border-(--line) bg-(--chip-bg) px-3 py-1.5 text-sm font-mono normal-case tracking-normal text-(--sea-ink) placeholder:text-(--sea-ink-soft) disabled:opacity-50"
        />
      </label>
      <button
        type="button"
        onClick={handleRender}
        disabled={!sourceState || isRendering}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.18)] px-4 py-2 text-sm font-semibold text-(--lagoon-deep) transition disabled:opacity-60"
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
        title={
          canExport
            ? `Download as ${sanitizeProjectFileName(projectName || 'project')}.stl`
            : undefined
        }
        className="rounded-full border border-(--line) bg-(--chip-bg) px-4 py-2 text-sm font-semibold text-(--sea-ink) transition disabled:opacity-50"
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

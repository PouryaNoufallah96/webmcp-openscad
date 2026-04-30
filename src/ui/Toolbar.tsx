import { useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { projectActions, projectStore } from '@/store/project-store'
import { renderNow } from '@/store/render-controller'
import { fetchScad } from '@/server/fetch-scad'

const SAMPLE_URL = '/samples/rounded-channel.scad'
const SAMPLE_NAME = 'rounded-channel.scad'
const SAMPLE_ORIGIN = 'sample:/samples/rounded-channel.scad'

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

export function Toolbar() {
  const renderState = useStore(projectStore, (s) => s.render)
  const sourceState = useStore(projectStore, (s) => s.source)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleLoad = async () => {
    setError(null)
    if (url.trim() === '') {
      setError('Paste a MakerWorld customizer URL or a direct .scad URL.')
      return
    }
    setIsLoading(true)
    try {
      const result = await fetchScad({ data: { url: url.trim() } })
      if (!result.ok) {
        setError(result.error)
        return
      }
      projectActions.loadSource(result.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadSample = async () => {
    setError(null)
    setIsLoading(true)
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
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoading(false)
    }
  }

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

  const canExport = renderState.status === 'success' && renderState.stl !== null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="url"
          placeholder="https://makerworld.com/...?scadUrl=...   or  https://example.com/foo.scad"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleLoad()
          }}
          className="min-w-[260px] flex-1 rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-mono text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)]"
        />
        <button
          type="button"
          onClick={() => void handleLoad()}
          disabled={isLoading}
          className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.18)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] transition disabled:opacity-50 hover:-translate-y-0.5"
        >
          {isLoading ? 'Loading…' : 'Load URL'}
        </button>
        <button
          type="button"
          onClick={() => void handleLoadSample()}
          disabled={isLoading}
          className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition disabled:opacity-50"
        >
          Load sample
        </button>
        <button
          type="button"
          onClick={handleRender}
          disabled={!sourceState || renderState.status === 'pending'}
          className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition disabled:opacity-50"
        >
          Render
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition disabled:opacity-50"
        >
          Export STL
        </button>
      </div>
      {error ? (
        <p className="m-0 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  )
}

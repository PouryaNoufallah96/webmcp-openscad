import { useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { projectActions, projectStore } from '@/store/project-store'
import { fetchScad } from '@/server/fetch-scad'
import {
  downloadStateFile,
  parseState,
  serializeState,
} from '@/scad/state-io'

const SAMPLE_URL = '/samples/multiboard-box.scad'
const SAMPLE_NAME = 'multiboard-box.scad'
const SAMPLE_ORIGIN = 'sample:/samples/multiboard-box.scad'

export function UrlControls() {
  const sourceState = useStore(projectStore, (s) => s.source)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  const handleSaveState = () => {
    setError(null)
    const state = projectStore.state
    if (!state.source) {
      setError('Nothing to save — load a model first.')
      return
    }
    const baseName = state.source.name.replace(/\.scad$/i, '') || 'state'
    const payload = serializeState({
      name: state.source.name,
      origin: state.source.origin,
      source: state.source.text,
      overrides: state.overrides,
    })
    downloadStateFile(payload, `${baseName}.scad-state.json`)
    projectActions.pushHistory({
      kind: 'export',
      summary: `saved state ${baseName}.scad-state.json`,
    })
  }

  const handlePickFile = () => {
    setError(null)
    fileInputRef.current?.click()
  }

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const result = parseState(text)
      if (!result.ok) {
        setError(result.error)
        return
      }
      projectActions.loadSource({
        name: result.data.name,
        origin: result.data.origin,
        source: result.data.source,
      })
      projectActions.setOverrides(result.data.overrides)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

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
        <span className="mx-1 hidden h-5 w-px bg-[var(--line)] sm:inline-block" />
        <button
          type="button"
          onClick={handleSaveState}
          disabled={!sourceState}
          title="Save the current source + parameter overrides to a JSON file"
          className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition disabled:opacity-50"
        >
          Save state
        </button>
        <button
          type="button"
          onClick={handlePickFile}
          title="Load a previously saved scad-webmcp state JSON file"
          className="rounded-full border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition"
        >
          Load state
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void handleFileChosen(e)}
        />
      </div>
      {error ? (
        <p className="m-0 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  )
}

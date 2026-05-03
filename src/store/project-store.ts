/**
 * Project store — single source of truth for the loaded SCAD project.
 *
 * Everything the UI, the render controller, and the MCP tools touch lives
 * here. We use TanStack Store so we can subscribe (the render controller)
 * and select (`useSelector` in React components) without prop-drilling.
 *
 * Mental model:
 *   source        = the .scad text + a name + a provenance label
 *   projectName   = human-chosen label that becomes the exported STL's
 *                   filename. Defaults to the source name minus `.scad`,
 *                   but the user / agent can override it independently.
 *   parameters    = parsed customizer params (defaults live in the source)
 *   overrides     = user/agent edits, layered on top of those defaults
 *   render        = result of the most recent worker round-trip
 *   lastGoodSource = snapshot of source the last time render succeeded;
 *                    used by `revert_source` and `export_stl` drift detect
 *   history       = capped, kind-tagged audit trail surfaced to the agent
 */
import { Store } from '@tanstack/store'
import { parseCustomizer } from '@/scad/customizer-parser'
import type { Parameter, ParameterValue } from '@/scad/types'

export type RenderStatus = 'idle' | 'pending' | 'success' | 'error'

export type RenderState = {
  status: RenderStatus
  requestId: string | null
  stl: Uint8Array | null
  error: string | null
  stderr: string
  renderMs: number | null
}

export type SourceState = {
  text: string
  name: string
  origin: string
} | null

export type HistoryKind = 'param' | 'source' | 'load' | 'render' | 'export'

export type HistoryEntry = {
  ts: number
  kind: HistoryKind
  summary: string
}

export type ProjectState = {
  source: SourceState
  projectName: string
  parameters: Parameter[]
  overrides: Record<string, ParameterValue>
  lastGoodSource: string | null
  render: RenderState
  history: HistoryEntry[]
}

const initialState: ProjectState = {
  source: null,
  projectName: '',
  parameters: [],
  overrides: {},
  lastGoodSource: null,
  render: {
    status: 'idle',
    requestId: null,
    stl: null,
    error: null,
    stderr: '',
    renderMs: null,
  },
  history: [],
}

/** Derive a sensible default project name from a source filename. */
export function defaultProjectNameFor(sourceName: string): string {
  return sourceName.replace(/\.scad$/i, '').trim() || 'project'
}

/**
 * Sanitize a project name for use as a filename: replace anything that
 * isn't a portable filename character with `-`, collapse runs of dashes,
 * and trim leading/trailing dashes/dots. Falls back to "project" if the
 * input ends up empty.
 */
export function sanitizeProjectFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned || 'project'
}

export const projectStore = new Store<ProjectState>(initialState)

const HISTORY_LIMIT = 200

function appendHistory(state: ProjectState, entry: HistoryEntry): ProjectState {
  const history = [entry, ...state.history].slice(0, HISTORY_LIMIT)
  return { ...state, history }
}

/**
 * All mutators live here. Components and tools never call `setState`
 * directly — they call an action so the history log stays accurate and
 * the reducer logic stays in one place.
 */
export const projectActions = {
  /**
   * Replace the project: new source, parsed parameters, cleared overrides.
   *
   * Loading is treated as starting a new project, so `projectName` is
   * always reset — explicitly when the caller passes one (state-restore,
   * MCP tool), otherwise derived from the source filename. Use
   * `setProjectName` afterwards to rename without reloading.
   */
  loadSource(input: {
    name: string
    source: string
    origin: string
    parameters?: Parameter[]
    projectName?: string
  }) {
    const parameters = input.parameters ?? parseCustomizer(input.source)
    const projectName =
      typeof input.projectName === 'string' && input.projectName.trim() !== ''
        ? input.projectName.trim()
        : defaultProjectNameFor(input.name)
    projectStore.setState((state) => {
      const next: ProjectState = {
        ...state,
        source: {
          text: input.source,
          name: input.name,
          origin: input.origin,
        },
        projectName,
        parameters,
        overrides: {},
        // lastGoodSource is populated only after a successful render
        // (see setRenderResult). On load we have no proof the source renders.
        lastGoodSource: null,
        render: {
          status: 'idle',
          requestId: null,
          stl: null,
          error: null,
          stderr: '',
          renderMs: null,
        },
      }
      return appendHistory(next, {
        ts: Date.now(),
        kind: 'load',
        summary: `Loaded ${input.name} as "${projectName}" (${parameters.length} params) from ${input.origin}`,
      })
    })
  },

  /**
   * Rename the project. Only the in-memory label changes; nothing on disk
   * is renamed (the source's `name` field is untouched). The name is
   * stored verbatim (just trimmed) — `sanitizeProjectFileName` is applied
   * later, only when assembling a download filename. Returns the trimmed
   * name actually stored, or null when the input is empty.
   */
  setProjectName(name: string): string | null {
    const trimmed = name.trim()
    if (trimmed === '') return null
    let stored = trimmed
    projectStore.setState((state) => {
      if (state.projectName === trimmed) {
        stored = state.projectName
        return state
      }
      return appendHistory(
        { ...state, projectName: trimmed },
        {
          ts: Date.now(),
          kind: 'load',
          summary: `renamed project to "${trimmed}"`,
        },
      )
    })
    return stored
  },

  /** Re-run the customizer parser against the current source. */
  reparseParameters() {
    projectStore.setState((state) => {
      if (!state.source) return state
      const parameters = parseCustomizer(state.source.text)
      return { ...state, parameters }
    })
  },

  /** Set or clear (`undefined`) a single parameter override. */
  setOverride(name: string, value: ParameterValue | undefined) {
    projectStore.setState((state) => {
      const overrides = { ...state.overrides }
      if (value === undefined) {
        delete overrides[name]
      } else {
        overrides[name] = value
      }
      return appendHistory(
        { ...state, overrides },
        {
          ts: Date.now(),
          kind: 'param',
          summary:
            value === undefined
              ? `reset ${name}`
              : `set ${name} = ${JSON.stringify(value)}`,
        },
      )
    })
  },

  /** Atomic batch override; `undefined` values clear that key. */
  setOverrides(values: Record<string, ParameterValue | undefined>) {
    projectStore.setState((state) => {
      const overrides = { ...state.overrides }
      const changes: string[] = []
      for (const [name, value] of Object.entries(values)) {
        if (value === undefined) {
          if (name in overrides) {
            delete overrides[name]
            changes.push(`reset ${name}`)
          }
        } else {
          overrides[name] = value
          changes.push(`${name}=${JSON.stringify(value)}`)
        }
      }
      if (changes.length === 0) return state
      return appendHistory(
        { ...state, overrides },
        {
          ts: Date.now(),
          kind: 'param',
          summary: changes.join(', '),
        },
      )
    })
  },

  /** Drop every override; values revert to source defaults. */
  resetOverrides() {
    projectStore.setState((state) => {
      if (Object.keys(state.overrides).length === 0) return state
      return appendHistory(
        { ...state, overrides: {} },
        {
          ts: Date.now(),
          kind: 'param',
          summary: 'reset all parameter overrides',
        },
      )
    })
  },

  /** Replace source text and log a human-readable summary. */
  editSource(text: string, summary: string) {
    projectStore.setState((state) => {
      if (!state.source) return state
      const next: ProjectState = {
        ...state,
        source: { ...state.source, text },
      }
      return appendHistory(next, {
        ts: Date.now(),
        kind: 'source',
        summary,
      })
    })
  },

  /**
   * Roll source back to `lastGoodSource`. Returns true when something
   * actually changed (used by the MCP tool to report a useful result).
   */
  revertSource(): boolean {
    const s = projectStore.state
    if (!s.source || s.lastGoodSource === null) return false
    if (s.source.text === s.lastGoodSource) return false
    const target = s.lastGoodSource
    projectStore.setState((state) => {
      if (!state.source) return state
      return appendHistory(
        { ...state, source: { ...state.source, text: target } },
        {
          ts: Date.now(),
          kind: 'source',
          summary: 'reverted source to last known good',
        },
      )
    })
    return true
  },

  /** Mark the render as in-flight (lets the UI show a spinner). */
  setRenderStatus(status: RenderStatus, requestId: string | null) {
    projectStore.setState((state) => ({
      ...state,
      render: { ...state.render, status, requestId },
    }))
  },

  /** Successful render: store STL bytes and capture lastGoodSource. */
  setRenderResult(input: {
    requestId: string
    stl: Uint8Array
    renderMs: number
    stderr: string
  }) {
    projectStore.setState((state) => {
      const next: ProjectState = {
        ...state,
        render: {
          status: 'success',
          requestId: input.requestId,
          stl: input.stl,
          error: null,
          stderr: input.stderr,
          renderMs: input.renderMs,
        },
        lastGoodSource: state.source?.text ?? state.lastGoodSource,
      }
      return appendHistory(next, {
        ts: Date.now(),
        kind: 'render',
        summary: `render ok in ${input.renderMs.toFixed(0)}ms (${input.stl.byteLength} bytes)`,
      })
    })
  },

  /** Failed render: keep the previous STL untouched, surface the error. */
  setRenderError(input: {
    requestId: string
    message: string
    stderr: string
  }) {
    projectStore.setState((state) => {
      const next: ProjectState = {
        ...state,
        render: {
          status: 'error',
          requestId: input.requestId,
          stl: null,
          error: input.message,
          stderr: input.stderr,
          renderMs: null,
        },
      }
      return appendHistory(next, {
        ts: Date.now(),
        kind: 'render',
        summary: `render error: ${input.message.slice(0, 120)}`,
      })
    })
  },

  /** Append a kind-tagged entry without otherwise mutating state. */
  pushHistory(entry: Omit<HistoryEntry, 'ts'>) {
    projectStore.setState((state) =>
      appendHistory(state, { ts: Date.now(), ...entry }),
    )
  },
}

export type ProjectActions = typeof projectActions

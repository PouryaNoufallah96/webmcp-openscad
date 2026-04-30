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
  parameters: Parameter[]
  overrides: Record<string, ParameterValue>
  lastGoodSource: string | null
  render: RenderState
  history: HistoryEntry[]
}

const initialState: ProjectState = {
  source: null,
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

export const projectStore = new Store<ProjectState>(initialState)

const HISTORY_LIMIT = 200

function pushHistory(state: ProjectState, entry: HistoryEntry): ProjectState {
  const history = [entry, ...state.history].slice(0, HISTORY_LIMIT)
  return { ...state, history }
}

export const projectActions = {
  loadSource(input: {
    name: string
    source: string
    origin: string
    parameters?: Parameter[]
  }) {
    const parameters = input.parameters ?? parseCustomizer(input.source)
    projectStore.setState((state) => {
      const next: ProjectState = {
        ...state,
        source: {
          text: input.source,
          name: input.name,
          origin: input.origin,
        },
        parameters,
        overrides: {},
        lastGoodSource: input.source,
        render: {
          status: 'idle',
          requestId: null,
          stl: null,
          error: null,
          stderr: '',
          renderMs: null,
        },
      }
      return pushHistory(next, {
        ts: Date.now(),
        kind: 'load',
        summary: `Loaded ${input.name} (${parameters.length} params) from ${input.origin}`,
      })
    })
  },

  setSourceParameters(parameters: Parameter[]) {
    projectStore.setState((state) => ({ ...state, parameters }))
  },

  reparseParameters() {
    projectStore.setState((state) => {
      if (!state.source) return state
      const parameters = parseCustomizer(state.source.text)
      return { ...state, parameters }
    })
  },

  setOverride(name: string, value: ParameterValue | undefined) {
    projectStore.setState((state) => {
      const overrides = { ...state.overrides }
      if (value === undefined) {
        delete overrides[name]
      } else {
        overrides[name] = value
      }
      return pushHistory(
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
      return pushHistory(
        { ...state, overrides },
        {
          ts: Date.now(),
          kind: 'param',
          summary: changes.join(', '),
        },
      )
    })
  },

  resetOverrides() {
    projectStore.setState((state) => {
      if (Object.keys(state.overrides).length === 0) return state
      return pushHistory(
        { ...state, overrides: {} },
        {
          ts: Date.now(),
          kind: 'param',
          summary: 'reset all parameter overrides',
        },
      )
    })
  },

  editSource(text: string, summary: string) {
    projectStore.setState((state) => {
      if (!state.source) return state
      const next: ProjectState = {
        ...state,
        source: { ...state.source, text },
      }
      return pushHistory(next, {
        ts: Date.now(),
        kind: 'source',
        summary,
      })
    })
  },

  setSourceText(text: string) {
    projectStore.setState((state) => {
      if (!state.source) return state
      return { ...state, source: { ...state.source, text } }
    })
  },

  markSourceGood() {
    projectStore.setState((state) => {
      if (!state.source) return state
      return { ...state, lastGoodSource: state.source.text }
    })
  },

  revertSource(): boolean {
    let didRevert = false
    projectStore.setState((state) => {
      if (!state.source || state.lastGoodSource === null) return state
      if (state.source.text === state.lastGoodSource) return state
      didRevert = true
      return pushHistory(
        { ...state, source: { ...state.source, text: state.lastGoodSource } },
        {
          ts: Date.now(),
          kind: 'source',
          summary: 'reverted source to last known good',
        },
      )
    })
    return didRevert
  },

  setRenderStatus(status: RenderStatus, requestId: string | null) {
    projectStore.setState((state) => ({
      ...state,
      render: { ...state.render, status, requestId },
    }))
  },

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
      return pushHistory(next, {
        ts: Date.now(),
        kind: 'render',
        summary: `render ok in ${input.renderMs.toFixed(0)}ms (${input.stl.byteLength} bytes)`,
      })
    })
  },

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
      return pushHistory(next, {
        ts: Date.now(),
        kind: 'render',
        summary: `render error: ${input.message.slice(0, 120)}`,
      })
    })
  },

  pushHistory(entry: Omit<HistoryEntry, 'ts'>) {
    projectStore.setState((state) =>
      pushHistory(state, { ts: Date.now(), ...entry }),
    )
  },
}

export type ProjectActions = typeof projectActions

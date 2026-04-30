import { fetchScad } from '@/server/fetch-scad'
import { searchReplace } from '@/scad/source-mutations'
import {
  projectActions,
  projectStore,
  type HistoryEntry,
  type RenderState,
} from '@/store/project-store'
import { renderNow } from '@/store/render-controller'
import type { Parameter, ParameterValue } from '@/scad/types'

type ToolContent = { content: Array<{ type: 'text'; text: string }> }

type ToolDefinition = {
  name: string
  description: string
  inputSchema: object
  execute: (args: unknown) => Promise<ToolContent>
}

function ok(value: unknown): ToolContent {
  return {
    content: [
      {
        type: 'text',
        text:
          typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  }
}

function err(message: string): ToolContent {
  return ok({ ok: false, error: message })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))),
    )
  }
  return btoa(binary)
}

function summarizeParameter(param: Parameter): unknown {
  if (param.kind === 'number') {
    return {
      kind: 'number',
      name: param.name,
      description: param.description,
      value: param.value,
      min: param.min,
      max: param.max,
      step: param.step,
    }
  }
  if (param.kind === 'enum') {
    return {
      kind: 'enum',
      name: param.name,
      description: param.description,
      value: param.value,
      options: param.options,
    }
  }
  return param
}

function effectiveValue(
  param: Parameter,
  overrides: Record<string, ParameterValue>,
): ParameterValue {
  return param.name in overrides ? overrides[param.name] : param.value
}

function summarizeRender(render: RenderState) {
  return {
    status: render.status,
    requestId: render.requestId,
    byteLength: render.stl ? render.stl.byteLength : null,
    renderMs: render.renderMs,
    error: render.error,
    stderr: render.stderr ? render.stderr.slice(0, 4000) : '',
  }
}

function summarizeHistory(entries: HistoryEntry[], limit: number) {
  const slice = entries.slice(0, limit)
  return slice.map((e) => ({
    ts: e.ts,
    isoTs: new Date(e.ts).toISOString(),
    kind: e.kind,
    summary: e.summary,
  }))
}

function coerceParamValue(param: Parameter, raw: unknown): ParameterValue {
  if (param.kind === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
    throw new Error(
      `parameter "${param.name}" expects number; got ${JSON.stringify(raw)}`,
    )
  }
  if (param.kind === 'boolean') {
    if (typeof raw === 'boolean') return raw
    if (raw === 'true') return true
    if (raw === 'false') return false
    throw new Error(
      `parameter "${param.name}" expects boolean; got ${JSON.stringify(raw)}`,
    )
  }
  if (param.kind === 'enum') {
    const allowed = param.options.map((o) => o.value)
    const matches = (v: ParameterValue) => allowed.some((a) => a === v)
    if (typeof raw === 'string' || typeof raw === 'number') {
      if (matches(raw)) return raw
      // try numeric coercion
      const n = typeof raw === 'string' ? Number(raw) : raw
      if (Number.isFinite(n) && matches(n)) return n
    }
    throw new Error(
      `parameter "${param.name}" expects one of ${JSON.stringify(allowed)}; got ${JSON.stringify(raw)}`,
    )
  }
  if (param.kind === 'string') {
    if (typeof raw === 'string') return raw
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
    throw new Error(
      `parameter "${param.name}" expects string; got ${JSON.stringify(raw)}`,
    )
  }
  throw new Error(`unknown parameter kind for ${(param as Parameter).name}`)
}

const loadFromUrl: ToolDefinition = {
  name: 'load_from_url',
  description:
    'Fetch a SCAD source from a URL (MakerWorld customizer URL with `scadUrl=` or any direct .scad URL) via the local CORS proxy, parse customizer parameters, and replace the project state.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch the SCAD source from' },
    },
    required: ['url'],
    additionalProperties: false,
  },
  async execute(args) {
    const { url } = (args as { url?: unknown }) ?? {}
    if (typeof url !== 'string' || url.trim() === '') {
      return err('`url` must be a non-empty string')
    }
    const result = await fetchScad({ data: { url: url.trim() } })
    if (!result.ok) return err(result.error)
    projectActions.loadSource(result.data)
    const state = projectStore.state
    return ok({
      ok: true,
      name: state.source?.name,
      origin: state.source?.origin,
      sourceLength: state.source?.text.length ?? 0,
      parameterCount: state.parameters.length,
    })
  },
}

const loadFromText: ToolDefinition = {
  name: 'load_from_text',
  description:
    'Load a SCAD source from a raw string. Parses customizer parameters and replaces project state. Use when the agent generates SCAD itself or pastes from clipboard.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'SCAD source text' },
      name: {
        type: 'string',
        description: 'Display name (e.g. "channel.scad")',
      },
      origin: {
        type: 'string',
        description: 'Optional provenance label',
      },
    },
    required: ['source', 'name'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = (args as { source?: unknown; name?: unknown; origin?: unknown }) ?? {}
    if (typeof a.source !== 'string' || a.source.length === 0) {
      return err('`source` must be a non-empty string')
    }
    if (typeof a.name !== 'string' || a.name.trim() === '') {
      return err('`name` must be a non-empty string')
    }
    const origin =
      typeof a.origin === 'string' && a.origin.length > 0 ? a.origin : 'agent'
    projectActions.loadSource({
      name: a.name,
      origin,
      source: a.source,
    })
    return ok({
      ok: true,
      name: a.name,
      origin,
      sourceLength: a.source.length,
      parameterCount: projectStore.state.parameters.length,
    })
  },
}

const getSource: ToolDefinition = {
  name: 'get_source',
  description: 'Return the current SCAD source text and its metadata.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute() {
    const { source } = projectStore.state
    if (!source) return err('no source loaded')
    return ok({
      name: source.name,
      origin: source.origin,
      length: source.text.length,
      source: source.text,
    })
  },
}

const editSource: ToolDefinition = {
  name: 'edit_source',
  description:
    'Mutate the SCAD source. Use mode "replace_all" to overwrite the whole file with `text`, or mode "search_replace" to substitute `find` with `replace`. Reparses customizer parameters on success and triggers a re-render.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['replace_all', 'search_replace'] },
      text: { type: 'string', description: 'New full source (replace_all)' },
      find: { type: 'string', description: 'Exact substring (search_replace)' },
      replace: {
        type: 'string',
        description: 'Replacement substring (search_replace)',
      },
      occurrence: {
        description:
          'Which occurrence to replace ("all" or 1-based index). Default "all".',
      },
      summary: { type: 'string', description: 'Short note for history' },
    },
    required: ['mode'],
    additionalProperties: false,
  },
  async execute(args) {
    const a =
      (args as {
        mode?: unknown
        text?: unknown
        find?: unknown
        replace?: unknown
        occurrence?: unknown
        summary?: unknown
      }) ?? {}
    const state = projectStore.state
    if (!state.source) return err('no source loaded')

    let nextText: string
    let summaryDefault: string
    let count = 1

    if (a.mode === 'replace_all') {
      if (typeof a.text !== 'string') {
        return err('replace_all requires `text` string')
      }
      nextText = a.text
      summaryDefault = `replace_all (${nextText.length} chars)`
    } else if (a.mode === 'search_replace') {
      if (typeof a.find !== 'string' || typeof a.replace !== 'string') {
        return err('search_replace requires `find` and `replace` strings')
      }
      const occ =
        a.occurrence === undefined || a.occurrence === 'all'
          ? 'all'
          : Number(a.occurrence)
      const result = searchReplace(state.source.text, {
        find: a.find,
        replace: a.replace,
        occurrence: occ as 'all' | number,
      })
      if (!result.ok) return err(result.reason)
      nextText = result.text
      count = result.count
      const findPreview = a.find.length > 40 ? a.find.slice(0, 40) + '…' : a.find
      summaryDefault = `search_replace ×${result.count} (${findPreview})`
    } else {
      return err('mode must be "replace_all" or "search_replace"')
    }

    const summary = typeof a.summary === 'string' ? a.summary : summaryDefault
    projectActions.editSource(nextText, summary)
    projectActions.reparseParameters()
    return ok({
      ok: true,
      sourceLength: nextText.length,
      replacements: count,
      parameterCount: projectStore.state.parameters.length,
    })
  },
}

const revertSource: ToolDefinition = {
  name: 'revert_source',
  description:
    'Restore the source to the last successfully-rendered state. Use when an `edit_source` produced an unrenderable result.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute() {
    const before = projectStore.state.source?.text ?? ''
    const did = projectActions.revertSource()
    if (!did) {
      return ok({ ok: false, reverted: false, reason: 'nothing to revert' })
    }
    projectActions.reparseParameters()
    const after = projectStore.state.source?.text ?? ''
    return ok({
      ok: true,
      reverted: true,
      previousLength: before.length,
      currentLength: after.length,
    })
  },
}

const listParameters: ToolDefinition = {
  name: 'list_parameters',
  description:
    'Return all customizer parameters parsed from the current source, including type, current effective value, default, constraints, and description.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute() {
    const state = projectStore.state
    return ok({
      count: state.parameters.length,
      parameters: state.parameters.map((p) => {
        const summary = summarizeParameter(p) as Record<string, unknown>
        const eff = effectiveValue(p, state.overrides)
        return {
          ...summary,
          default: p.value,
          effectiveValue: eff,
          overridden: p.name in state.overrides,
        }
      }),
    })
  },
}

const getParameter: ToolDefinition = {
  name: 'get_parameter',
  description: 'Return a single parameter by name.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: false,
  },
  async execute(args) {
    const { name } = (args as { name?: unknown }) ?? {}
    if (typeof name !== 'string') return err('`name` must be a string')
    const state = projectStore.state
    const param = state.parameters.find((p) => p.name === name)
    if (!param) return err(`parameter "${name}" not found`)
    return ok({
      ...(summarizeParameter(param) as Record<string, unknown>),
      default: param.value,
      effectiveValue: effectiveValue(param, state.overrides),
      overridden: param.name in state.overrides,
    })
  },
}

const setParameter: ToolDefinition = {
  name: 'set_parameter',
  description:
    'Override a single parameter\'s value. Pass `value: null` to clear the override and revert to the default.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      value: {
        description: 'New value, or null to reset to default',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = (args as { name?: unknown; value?: unknown }) ?? {}
    if (typeof a.name !== 'string') return err('`name` must be a string')
    const state = projectStore.state
    const param = state.parameters.find((p) => p.name === a.name)
    if (!param) return err(`parameter "${a.name}" not found`)
    if (a.value === null || a.value === undefined) {
      projectActions.setOverride(param.name, undefined)
      return ok({ ok: true, name: param.name, reset: true })
    }
    let coerced: ParameterValue
    try {
      coerced = coerceParamValue(param, a.value)
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e))
    }
    projectActions.setOverride(param.name, coerced)
    return ok({ ok: true, name: param.name, value: coerced })
  },
}

const setParameters: ToolDefinition = {
  name: 'set_parameters',
  description:
    'Atomically apply a batch of parameter overrides (preferred over multiple set_parameter calls). Pass `value: null` for any key to reset that parameter.',
  inputSchema: {
    type: 'object',
    properties: {
      values: {
        type: 'object',
        description:
          'Map of parameter name to new value (or null to reset that parameter to default)',
        additionalProperties: true,
      },
    },
    required: ['values'],
    additionalProperties: false,
  },
  async execute(args) {
    const a = (args as { values?: unknown }) ?? {}
    if (!a.values || typeof a.values !== 'object') {
      return err('`values` must be an object')
    }
    const state = projectStore.state
    const mapped: Record<string, ParameterValue | undefined> = {}
    const errors: string[] = []
    for (const [name, raw] of Object.entries(a.values as Record<string, unknown>)) {
      const param = state.parameters.find((p) => p.name === name)
      if (!param) {
        errors.push(`unknown parameter: ${name}`)
        continue
      }
      if (raw === null || raw === undefined) {
        mapped[name] = undefined
        continue
      }
      try {
        mapped[name] = coerceParamValue(param, raw)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) {
      return err(errors.join('; '))
    }
    projectActions.setOverrides(mapped)
    return ok({ ok: true, applied: Object.keys(mapped).length })
  },
}

const resetParameters: ToolDefinition = {
  name: 'reset_parameters',
  description: 'Clear all parameter overrides; values revert to source defaults.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute() {
    const before = Object.keys(projectStore.state.overrides).length
    projectActions.resetOverrides()
    return ok({ ok: true, cleared: before })
  },
}

const renderTool: ToolDefinition = {
  name: 'render',
  description:
    'Force an immediate render and await its result. Returns metadata only (renderMs, byteLength, error). Bytes stay on the in-page store; use `export_stl` to read them.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute() {
    const outcome = await renderNow()
    if (outcome.ok) {
      return ok({
        ok: true,
        requestId: outcome.requestId,
        renderMs: Number(outcome.renderMs.toFixed(1)),
        byteLength: outcome.byteLength,
      })
    }
    return ok({
      ok: false,
      requestId: outcome.requestId,
      error: outcome.message,
      stderr: outcome.stderr ? outcome.stderr.slice(0, 4000) : '',
    })
  },
}

const getRenderStatus: ToolDefinition = {
  name: 'get_render_status',
  description: 'Snapshot the render state (status, last renderMs, byteLength, error).',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute() {
    return ok(summarizeRender(projectStore.state.render))
  },
}

const exportStl: ToolDefinition = {
  name: 'export_stl',
  description:
    'Return the most recently rendered STL bytes as base64 (alongside byteLength). Always renders first if the source has changed since the last successful render.',
  inputSchema: {
    type: 'object',
    properties: {
      forceRender: {
        type: 'boolean',
        description:
          'If true, always trigger a fresh render before returning bytes. Default true.',
      },
      truncateBase64: {
        type: 'integer',
        description:
          'Optional: cap the returned base64 string length (0 = no cap). Bytes still on store.',
        minimum: 0,
      },
    },
    additionalProperties: false,
  },
  async execute(args) {
    const a = (args as { forceRender?: unknown; truncateBase64?: unknown }) ?? {}
    const force = a.forceRender !== false
    if (force) {
      const outcome = await renderNow()
      if (!outcome.ok) {
        return err(`render failed: ${outcome.message}`)
      }
    }
    const stl = projectStore.state.render.stl
    if (!stl) return err('no STL bytes available')
    const cap =
      typeof a.truncateBase64 === 'number' && a.truncateBase64 >= 0
        ? a.truncateBase64
        : 0
    const base64 = bytesToBase64(stl)
    projectActions.pushHistory({
      kind: 'export',
      summary: `exported STL via MCP (${stl.byteLength} bytes)`,
    })
    return ok({
      ok: true,
      byteLength: stl.byteLength,
      base64: cap > 0 && base64.length > cap ? base64.slice(0, cap) : base64,
      truncated: cap > 0 && base64.length > cap,
    })
  },
}

const getHistory: ToolDefinition = {
  name: 'get_history',
  description:
    'Return the recent action log so the agent can see its own footprints (parameter changes, source edits, renders, exports).',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  },
  async execute(args) {
    const a = (args as { limit?: unknown }) ?? {}
    const limit =
      typeof a.limit === 'number' && a.limit > 0 && a.limit <= 200
        ? Math.floor(a.limit)
        : 50
    return ok({
      total: projectStore.state.history.length,
      entries: summarizeHistory(projectStore.state.history, limit),
    })
  },
}

export const tools: ToolDefinition[] = [
  loadFromUrl,
  loadFromText,
  getSource,
  editSource,
  revertSource,
  listParameters,
  getParameter,
  setParameter,
  setParameters,
  resetParameters,
  renderTool,
  getRenderStatus,
  exportStl,
  getHistory,
]

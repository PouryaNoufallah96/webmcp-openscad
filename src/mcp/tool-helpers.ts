/**
 * Shared helpers for the MCP tool definitions in `./tools.ts`.
 *
 * Everything here is plumbing — response envelopes, type coercion, and
 * `summarize*` projections used by the read-only tools. Keeping it out of
 * `tools.ts` lets that file stay a flat catalog of tool definitions.
 */
import type { HistoryEntry, RenderState } from '@/store/project-store'
import type { Parameter, ParameterValue } from '@/scad/types'

// ---------------------------------------------------------------------------
// Response envelopes — every MCP tool returns a `ToolContent`
// ---------------------------------------------------------------------------

export type ToolContent = { content: Array<{ type: 'text'; text: string }> }

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: object
  execute: (args: unknown) => Promise<ToolContent>
}

/** Wrap any value as a successful MCP text response. */
export function ok(value: unknown): ToolContent {
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

/** Wrap an error message as a structured `{ ok: false, error }` payload. */
export function err(message: string): ToolContent {
  return ok({ ok: false, error: message })
}

// ---------------------------------------------------------------------------
// Binary helpers — STL bytes ↔ base64 for the wire
// ---------------------------------------------------------------------------

/**
 * STL bytes can be megabytes. `btoa(String.fromCharCode(...bytes))` blows
 * the JS argument-list limit (~100k items) on real models, so we chunk the
 * buffer and accumulate the binary string before encoding.
 */
export function bytesToBase64(bytes: Uint8Array): string {
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

// ---------------------------------------------------------------------------
// Read-side projections — what the agent sees from `list_*` / `get_*` tools
// ---------------------------------------------------------------------------

/** Trim a Parameter to the fields useful in tool output. */
export function summarizeParameter(param: Parameter): unknown {
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

/** Resolve a parameter to its current effective value (override or default). */
export function effectiveValue(
  param: Parameter,
  overrides: Record<string, ParameterValue>,
): ParameterValue {
  return param.name in overrides ? overrides[param.name] : param.value
}

/** Compact view of the render state — never includes the raw STL bytes. */
export function summarizeRender(render: RenderState) {
  return {
    status: render.status,
    requestId: render.requestId,
    byteLength: render.stl ? render.stl.byteLength : null,
    renderMs: render.renderMs,
    error: render.error,
    stderr: render.stderr ? render.stderr.slice(0, 4000) : '',
  }
}

/** Most-recent-first slice of the history log with ISO-formatted timestamps. */
export function summarizeHistory(entries: HistoryEntry[], limit: number) {
  const slice = entries.slice(0, limit)
  return slice.map((e) => ({
    ts: e.ts,
    isoTs: new Date(e.ts).toISOString(),
    kind: e.kind,
    summary: e.summary,
  }))
}

// ---------------------------------------------------------------------------
// Input coercion — accept what real MCP clients actually send
// ---------------------------------------------------------------------------

/**
 * Coerce a tool argument to the parameter's expected type. We accept
 * stringified numbers/booleans because some MCP clients pass everything
 * as JSON strings, but reject anything that doesn't round-trip cleanly.
 */
export function coerceParamValue(
  param: Parameter,
  raw: unknown,
): ParameterValue {
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

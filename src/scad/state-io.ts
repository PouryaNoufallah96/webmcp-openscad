import type { ParameterValue } from './types'

const FILE_KIND = 'scad-webmcp-state'
const FILE_VERSION = 1

export type SavedState = {
  version: number
  kind: typeof FILE_KIND
  name: string
  origin: string
  source: string
  overrides: Record<string, ParameterValue>
  savedAt: string
}

export function serializeState(input: {
  name: string
  origin: string
  source: string
  overrides: Record<string, ParameterValue>
}): SavedState {
  return {
    version: FILE_VERSION,
    kind: FILE_KIND,
    name: input.name,
    origin: input.origin,
    source: input.source,
    overrides: input.overrides,
    savedAt: new Date().toISOString(),
  }
}

function isParameterValue(v: unknown): v is ParameterValue {
  return (
    typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
  )
}

export function parseState(text: string): {
  ok: true
  data: SavedState
} | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` }
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Expected a JSON object.' }
  }
  const obj = raw as Record<string, unknown>
  if (obj.kind !== FILE_KIND) {
    return {
      ok: false,
      error: `Not a scad-webmcp state file (kind="${String(obj.kind)}").`,
    }
  }
  if (typeof obj.source !== 'string' || obj.source.length === 0) {
    return { ok: false, error: 'Missing "source" field.' }
  }
  if (typeof obj.name !== 'string' || typeof obj.origin !== 'string') {
    return { ok: false, error: 'Missing "name" or "origin" field.' }
  }
  const overridesRaw =
    obj.overrides && typeof obj.overrides === 'object' ? obj.overrides : {}
  const overrides: Record<string, ParameterValue> = {}
  for (const [k, v] of Object.entries(overridesRaw as Record<string, unknown>)) {
    if (isParameterValue(v)) overrides[k] = v
  }
  const version = typeof obj.version === 'number' ? obj.version : 1
  const savedAt = typeof obj.savedAt === 'string' ? obj.savedAt : ''
  return {
    ok: true,
    data: {
      version,
      kind: FILE_KIND,
      name: obj.name,
      origin: obj.origin,
      source: obj.source,
      overrides,
      savedAt,
    },
  }
}

export function downloadStateFile(state: SavedState, fileName: string): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

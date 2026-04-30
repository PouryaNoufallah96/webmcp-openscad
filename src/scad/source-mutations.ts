import type { Parameter, ParameterValue } from './types'

export function formatScadValue(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatScadValue(v)).join(',')}]`
  }
  return JSON.stringify(value)
}

export function buildOverrideArgs(
  parameters: Parameter[],
  overrides: Record<string, ParameterValue>,
): Record<string, ParameterValue> {
  // Effective param map: defaults from `parameters`, layered with overrides.
  // We pass the resolved overrides only (so OpenSCAD only gets keys that
  // diverge from defaults — the source itself contains the defaults).
  const result: Record<string, ParameterValue> = {}
  const knownNames = new Set(parameters.map((p) => p.name))
  for (const [name, value] of Object.entries(overrides)) {
    if (!knownNames.has(name)) continue
    result[name] = value
  }
  return result
}

export type SearchReplaceOptions = {
  find: string
  replace: string
  occurrence?: number | 'all'
}

export type SearchReplaceResult =
  | { ok: true; text: string; count: number }
  | { ok: false; reason: string }

export function searchReplace(
  source: string,
  options: SearchReplaceOptions,
): SearchReplaceResult {
  const { find, replace, occurrence = 'all' } = options
  if (find === '') {
    return { ok: false, reason: 'find string must not be empty' }
  }
  // Count occurrences
  const indices: number[] = []
  let idx = source.indexOf(find)
  while (idx !== -1) {
    indices.push(idx)
    idx = source.indexOf(find, idx + find.length)
  }
  if (indices.length === 0) {
    return { ok: false, reason: `find string not found: ${find.slice(0, 80)}` }
  }
  if (occurrence === 'all') {
    return {
      ok: true,
      text: source.split(find).join(replace),
      count: indices.length,
    }
  }
  const n = Number(occurrence)
  if (!Number.isInteger(n) || n < 1 || n > indices.length) {
    return {
      ok: false,
      reason: `occurrence ${occurrence} out of range (1..${indices.length})`,
    }
  }
  const at = indices[n - 1]
  return {
    ok: true,
    text: source.slice(0, at) + replace + source.slice(at + find.length),
    count: 1,
  }
}

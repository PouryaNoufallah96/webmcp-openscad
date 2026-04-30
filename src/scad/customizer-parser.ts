import type { Parameter, ParameterEnumOption } from './types'

// Roughly follows OpenSCAD's customizer convention:
// https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer
// We only parse top-level (column 0) assignments. Nested assignments are ignored.

const ASSIGNMENT_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;\s*(?:\/\/\s*(.*))?$/

const STRING_LITERAL_RE = /^"((?:\\.|[^"\\])*)"$/
const NUMBER_LITERAL_RE = /^-?\d+(?:\.\d+)?$/

function stripBlockComments(source: string): string {
  let result = ''
  let i = 0
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) break
      // preserve newlines so line numbers stay aligned
      const skipped = source.slice(i, end + 2)
      for (const ch of skipped) {
        if (ch === '\n') result += '\n'
      }
      i = end + 2
    } else {
      result += source[i]
      i++
    }
  }
  return result
}

function parseLiteral(text: string): {
  kind: 'number' | 'string' | 'boolean'
  value: number | string | boolean
} | null {
  const t = text.trim()
  if (t === 'true') return { kind: 'boolean', value: true }
  if (t === 'false') return { kind: 'boolean', value: false }
  const strMatch = STRING_LITERAL_RE.exec(t)
  if (strMatch) {
    return {
      kind: 'string',
      value: strMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
    }
  }
  if (NUMBER_LITERAL_RE.test(t)) {
    return { kind: 'number', value: Number(t) }
  }
  return null
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  let inString = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inString) {
      current += ch
      if (ch === '\\' && i + 1 < input.length) {
        current += input[i + 1]
        i++
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      current += ch
      continue
    }
    if (ch === '[' || ch === '(') {
      depth++
      current += ch
      continue
    }
    if (ch === ']' || ch === ')') {
      depth--
      current += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  const tail = current.trim()
  if (tail.length > 0) parts.push(tail)
  return parts
}

function parseEnumOption(part: string): ParameterEnumOption | null {
  // shapes:
  //   42                        -> { label: '42', value: 42 }
  //   "rounded"                 -> { label: 'rounded', value: 'rounded' }
  //   "rounded":Rounded         -> { label: 'Rounded', value: 'rounded' }
  //   42:Large                  -> { label: 'Large', value: 42 }
  //   bare:Label                -> not standard, treat bare as string
  let label: string | null = null
  let raw = part.trim()

  // Find a colon outside of quotes for label.
  let inString = false
  let colonAt = -1
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"' && raw[i - 1] !== '\\') inString = !inString
    if (ch === ':' && !inString) {
      colonAt = i
      break
    }
  }
  if (colonAt !== -1) {
    label = raw.slice(colonAt + 1).trim()
    raw = raw.slice(0, colonAt).trim()
  }
  if (raw === '') return null

  const lit = parseLiteral(raw)
  if (lit && (lit.kind === 'number' || lit.kind === 'string')) {
    return { value: lit.value, label: label ?? String(lit.value) }
  }
  return { value: raw, label: label ?? raw }
}

type RangeMeta =
  | { kind: 'range'; min: number; max: number; step?: number }
  | { kind: 'enum'; options: ParameterEnumOption[] }
  | { kind: 'empty' }
  | null

function parseMagicComment(comment: string | undefined): {
  meta: RangeMeta
  description?: string
} {
  if (!comment) return { meta: null }
  const text = comment.trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    return { meta: null, description: text || undefined }
  }
  const inside = text.slice(start + 1, end).trim()
  const tail = text.slice(end + 1).trim()
  const description = tail.length > 0 ? tail : undefined

  if (inside === '') return { meta: { kind: 'empty' }, description }

  // Range: a:b or a:s:b (numbers only, no commas)
  if (!inside.includes(',')) {
    const rangeParts = inside.split(':').map((p) => p.trim())
    if (rangeParts.length === 2 || rangeParts.length === 3) {
      const allNumeric = rangeParts.every((p) => NUMBER_LITERAL_RE.test(p))
      if (allNumeric) {
        if (rangeParts.length === 2) {
          return {
            meta: {
              kind: 'range',
              min: Number(rangeParts[0]),
              max: Number(rangeParts[1]),
            },
            description,
          }
        }
        return {
          meta: {
            kind: 'range',
            min: Number(rangeParts[0]),
            step: Number(rangeParts[1]),
            max: Number(rangeParts[2]),
          },
          description,
        }
      }
    }
  }

  // Enum: comma-separated list
  const options: ParameterEnumOption[] = []
  for (const part of splitTopLevel(inside)) {
    const opt = parseEnumOption(part)
    if (opt) options.push(opt)
  }
  if (options.length === 0) return { meta: { kind: 'empty' }, description }
  return { meta: { kind: 'enum', options }, description }
}

function flushDescription(buffer: string[]): string | undefined {
  const lines = buffer
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('['))
  buffer.length = 0
  if (lines.length === 0) return undefined
  return lines.join(' ').trim() || undefined
}

export function parseCustomizer(source: string): Parameter[] {
  const cleaned = stripBlockComments(source)
  const lines = cleaned.split('\n')
  const params: Parameter[] = []
  const descBuffer: string[] = []

  for (let rawLine of lines) {
    const line = rawLine

    if (line.trim() === '') {
      descBuffer.length = 0
      continue
    }

    // line-only comment -> add to description buffer
    const trimmed = line.trim()
    if (trimmed.startsWith('//')) {
      descBuffer.push(trimmed.slice(2).trim())
      continue
    }

    // skip non-top-level lines (any leading whitespace = nested)
    if (line.startsWith(' ') || line.startsWith('\t')) {
      descBuffer.length = 0
      continue
    }

    const m = ASSIGNMENT_RE.exec(line)
    if (!m) {
      // not an assignment; reset description buffer
      descBuffer.length = 0
      continue
    }

    const name = m[1]
    const valueText = m[2]
    const trailingComment = m[3]
    const description = flushDescription(descBuffer)

    const literal = parseLiteral(valueText)
    if (!literal) continue

    const magic = parseMagicComment(trailingComment)

    if (literal.kind === 'boolean') {
      params.push({
        kind: 'boolean',
        name,
        description,
        value: literal.value,
      })
      continue
    }

    if (magic.meta?.kind === 'enum') {
      params.push({
        kind: 'enum',
        name,
        description,
        value: literal.value,
        options: magic.meta.options,
      })
      continue
    }

    if (literal.kind === 'number') {
      const numParam = {
        kind: 'number' as const,
        name,
        description,
        value: literal.value,
      }
      if (magic.meta?.kind === 'range') {
        params.push({
          ...numParam,
          min: magic.meta.min,
          max: magic.meta.max,
          step: magic.meta.step,
        })
      } else {
        params.push(numParam)
      }
      continue
    }

    if (literal.kind === 'string') {
      params.push({
        kind: 'string',
        name,
        description,
        value: literal.value,
      })
      continue
    }
  }

  return params
}

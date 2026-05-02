import type { Adapter, ScadSource } from './types'

const USER_AGENT =
  'scad-webmcp/0.1 (+https://github.com/local) Mozilla/5.0 compatible'

async function fetchText(url: string, originLabel: string): Promise<ScadSource> {
  const resp = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain, */*' },
  })
  if (!resp.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${resp.status} ${resp.statusText}`,
    )
  }
  const source = await resp.text()
  const name = guessName(url)
  return { name, source, origin: originLabel }
}

function guessName(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    if (last && last.length > 0) return last
    return u.hostname
  } catch {
    return 'source.scad'
  }
}

export const makerWorldAdapter: Adapter = {
  name: 'makerworld',
  match: (url) => {
    try {
      const u = new URL(url)
      return /(^|\.)makerworld\.com$/i.test(u.hostname)
    } catch {
      return false
    }
  },
  fetch: async (url) => {
    const u = new URL(url)
    // URLSearchParams.get() already percent-decodes; do not decode again.
    const scadUrl =
      u.searchParams.get('scadUrl') ?? u.searchParams.get('scad_url')
    if (!scadUrl) {
      throw new Error(
        'MakerWorld URL is missing a `scadUrl` query parameter. Open the customizer page and copy the URL from the address bar.',
      )
    }
    const source = await fetchText(scadUrl, `makerworld:${u.toString()}`)
    return { ...source, name: source.name || 'makerworld.scad' }
  },
}

export const rawScadAdapter: Adapter = {
  name: 'raw',
  match: (url) => {
    try {
      const u = new URL(url)
      return (
        u.protocol === 'http:' ||
        u.protocol === 'https:' ||
        u.protocol === 'data:'
      )
    } catch {
      return false
    }
  },
  fetch: (url) => fetchText(url, `raw:${url}`),
}

export const adapters: Adapter[] = [makerWorldAdapter, rawScadAdapter]

export function findAdapter(url: string): Adapter | null {
  for (const adapter of adapters) {
    if (adapter.match(url)) return adapter
  }
  return null
}

export function fetchScadFromUrl(url: string): Promise<ScadSource> {
  const adapter = findAdapter(url)
  if (!adapter) {
    return Promise.reject(new Error(`No adapter matched URL: ${url}`))
  }
  return adapter.fetch(url)
}

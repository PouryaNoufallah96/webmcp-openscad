import { createServerFn } from '@tanstack/react-start'
import { fetchScadFromUrl } from '@/scad/adapters'
import type { ScadSource } from '@/scad/types'

export type FetchScadResult =
  | { ok: true; data: ScadSource }
  | { ok: false; error: string }

export const fetchScad = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string }) => {
    if (!data || typeof data.url !== 'string' || data.url.trim() === '') {
      throw new Error('A non-empty `url` string is required.')
    }
    return { url: data.url.trim() }
  })
  .handler(async ({ data }): Promise<FetchScadResult> => {
    try {
      const source = await fetchScadFromUrl(data.url)
      return { ok: true, data: source }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  })

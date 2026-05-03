/**
 * Render controller — auto-renders the model whenever the source or any
 * override actually changes.
 *
 * Design:
 *   - Subscribe to the store and compute a stable signature
 *     (`{ text, overrides }`). Skip work when the signature is identical
 *     to the last one we acted on (every keystroke in the editor mutates
 *     the store but only some of them change the rendered output).
 *   - Debounce by 300ms so dragging a slider collapses to one render.
 *   - Track a monotonic `requestId`; if a newer render starts before the
 *     previous one resolves, the older result is recognised as stale and
 *     dropped. The worker-client also issues a `cancel()` so the abandoned
 *     worker is terminated outright (see worker-client.ts).
 *   - `renderNow()` skips the debounce — used by the `render` MCP tool
 *     and the manual "Render" button in the UI.
 */
import { projectActions, projectStore } from './project-store'
import type { ProjectState } from './project-store'
import { buildOverrideArgs } from '@/scad/source-mutations'
import { getOpenScadClient } from '@/worker/worker-client'

const DEBOUNCE_MS = 300

let renderSeq = 0
let stopFn: (() => void) | null = null
let debounceHandle: ReturnType<typeof setTimeout> | null = null
let lastSig: string | null = null

function paramSignature(state: ProjectState): string {
  if (!state.source) return ''
  return JSON.stringify({
    text: state.source.text,
    overrides: state.overrides,
  })
}

export type RenderOutcomeSummary =
  | {
      ok: true
      requestId: string
      renderMs: number
      byteLength: number
      stderr: string
    }
  | {
      ok: false
      requestId: string
      message: string
      stderr: string
    }
  | { ok: false; requestId: null; message: 'no source loaded'; stderr: '' }
  | { ok: false; requestId: string; message: 'superseded'; stderr: '' }

async function performRender(): Promise<RenderOutcomeSummary> {
  const state = projectStore.state
  if (!state.source) {
    return { ok: false, requestId: null, message: 'no source loaded', stderr: '' }
  }

  renderSeq += 1
  const requestId = `r${renderSeq}`
  projectActions.setRenderStatus('pending', requestId)

  const client = getOpenScadClient()
  const outcome = await client.render({
    source: state.source.text,
    params: buildOverrideArgs(state.parameters, state.overrides),
  })

  // If the worker client cancelled us in favor of a newer render, the
  // outcome carries `aborted: true`. Either way (aborted or stale requestId)
  // we must not write our result into the store.
  const stale = projectStore.state.render.requestId !== requestId
  if (stale || (!outcome.ok && outcome.aborted)) {
    return { ok: false, requestId, message: 'superseded', stderr: '' }
  }

  if (outcome.ok) {
    projectActions.setRenderResult({
      requestId,
      stl: outcome.bytes,
      renderMs: outcome.renderMs,
      stderr: outcome.stderr,
    })
    return {
      ok: true,
      requestId,
      renderMs: outcome.renderMs,
      byteLength: outcome.bytes.byteLength,
      stderr: outcome.stderr,
    }
  }

  projectActions.setRenderError({
    requestId,
    message: outcome.message,
    stderr: outcome.stderr,
  })
  return {
    ok: false,
    requestId,
    message: outcome.message,
    stderr: outcome.stderr,
  }
}

function scheduleRender(): void {
  if (debounceHandle !== null) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => {
    debounceHandle = null
    performRender().catch((e) => {
      console.error('[render-controller] unexpected render failure', e)
    })
  }, DEBOUNCE_MS)
}

export function startRenderController(): () => void {
  if (stopFn) return stopFn

  lastSig = paramSignature(projectStore.state)

  const subscription = projectStore.subscribe(() => {
    const sig = paramSignature(projectStore.state)
    if (sig === lastSig) return
    lastSig = sig
    if (!projectStore.state.source) return
    scheduleRender()
  })

  stopFn = () => {
    subscription.unsubscribe()
    if (debounceHandle !== null) {
      clearTimeout(debounceHandle)
      debounceHandle = null
    }
    stopFn = null
  }

  if (projectStore.state.source) {
    scheduleRender()
  }

  return stopFn
}

export function renderNow(): Promise<RenderOutcomeSummary> {
  if (debounceHandle !== null) {
    clearTimeout(debounceHandle)
    debounceHandle = null
  }
  return performRender()
}

/**
 * Main-thread client for the OpenSCAD WASM worker.
 *
 * Why a class with a singleton: rendering needs strict serial semantics
 * (the WASM `callMain` is single-shot), and we want one place that owns
 * the worker lifecycle so cancellation, error handling, and respawn live
 * together. Public callers only see `render()` / `cancel()` / `ready()`.
 *
 * The terminate-and-respawn pattern below is the unfortunate price of
 * `openscad-wasm-prebuilt`: its Emscripten `callMain` corrupts the
 * instance after one invocation, so every render gets a freshly spawned
 * worker. The good news is that the WASM JS shim is cached by the
 * browser, so respawn is fast (a few hundred ms incl. BOSL2 remount).
 */
import type { RenderFormat, WorkerRequest, WorkerResponse } from './protocol'

export type RenderResult = {
  ok: true
  bytes: Uint8Array
  renderMs: number
  stderr: string
}

export type RenderError = {
  ok: false
  message: string
  stderr: string
  /**
   * True when the render was preempted by a newer one (cancel from inside
   * `render()`) rather than a real OpenSCAD failure. Callers should treat
   * this as "superseded", not as an error to surface to the user/agent.
   */
  aborted?: boolean
}

export type RenderOutcome = RenderResult | RenderError

export type ProgressPhase = 'compile' | 'tessellate' | 'export'

export type RenderOptions = {
  source: string
  params: Record<string, unknown>
  format?: RenderFormat
  onProgress?: (phase: ProgressPhase) => void
}

type Pending = {
  id: string
  resolve: (outcome: RenderOutcome) => void
  onProgress?: (phase: ProgressPhase) => void
}

export class OpenScadClient {
  private worker: Worker | null = null
  private pending = new Map<string, Pending>()
  private currentRenderId: string | null = null
  private nextId = 1
  private readyPromise: Promise<void> | null = null

  private spawnWorker(): Worker {
    const w = new Worker(
      new URL('./openscad-worker.ts', import.meta.url),
      { type: 'module', name: 'openscad-worker' },
    )
    this.readyPromise = new Promise((resolve) => {
      const onMessage = (ev: MessageEvent<WorkerResponse>) => {
        if (ev.data.type === 'ready') {
          w.removeEventListener('message', onMessage)
          resolve()
        }
      }
      w.addEventListener('message', onMessage)
    })
    w.addEventListener('message', this.handleMessage)
    w.addEventListener('error', this.handleError)
    return w
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = this.spawnWorker()
    }
    return this.worker
  }

  private retireWorker(): void {
    if (!this.worker) return
    this.worker.removeEventListener('message', this.handleMessage)
    this.worker.removeEventListener('error', this.handleError)
    this.worker.terminate()
    this.worker = null
    this.readyPromise = null
  }

  private handleMessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data
    if (msg.type === 'ready') return
    const pending = this.pending.get(msg.id)
    if (!pending) return

    if (msg.type === 'render-progress') {
      pending.onProgress?.(msg.phase)
      return
    }

    if (msg.type === 'render-result') {
      this.pending.delete(msg.id)
      if (this.currentRenderId === msg.id) this.currentRenderId = null
      // OpenSCAD WASM main can only be called once per instance — retire the
      // worker so the next render starts fresh.
      this.retireWorker()
      pending.resolve({
        ok: true,
        bytes: msg.bytes,
        renderMs: msg.renderMs,
        stderr: msg.stderr,
      })
      return
    }

    if (msg.type === 'render-error') {
      this.pending.delete(msg.id)
      if (this.currentRenderId === msg.id) this.currentRenderId = null
      this.retireWorker()
      pending.resolve({
        ok: false,
        message: msg.message,
        stderr: msg.stderr,
      })
      return
    }
  }

  private handleError = (ev: ErrorEvent) => {
    const message = ev.message || 'Worker error'
    for (const pending of this.pending.values()) {
      pending.resolve({ ok: false, message, stderr: '' })
    }
    this.pending.clear()
    this.currentRenderId = null
  }

  async ready(): Promise<void> {
    this.getWorker()
    if (this.readyPromise) await this.readyPromise
  }

  cancel(): void {
    if (!this.worker) return
    for (const pending of this.pending.values()) {
      pending.resolve({
        ok: false,
        message: 'superseded',
        stderr: '',
        aborted: true,
      })
    }
    this.pending.clear()
    this.currentRenderId = null
    this.retireWorker()
  }

  isRendering(): boolean {
    return this.currentRenderId !== null
  }

  render(options: RenderOptions): Promise<RenderOutcome> {
    if (this.currentRenderId !== null) {
      this.cancel()
    }

    const id = `r${this.nextId++}`
    this.currentRenderId = id
    const worker = this.getWorker()

    return new Promise<RenderOutcome>((resolve) => {
      this.pending.set(id, { id, resolve, onProgress: options.onProgress })
      const req: WorkerRequest = {
        id,
        type: 'render',
        source: options.source,
        params: options.params,
        format: options.format ?? 'stl',
      }
      worker.postMessage(req)
    })
  }
}

let singleton: OpenScadClient | null = null

export function getOpenScadClient(): OpenScadClient {
  if (!singleton) singleton = new OpenScadClient()
  return singleton
}

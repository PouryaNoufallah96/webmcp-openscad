export type RenderFormat = 'stl' | 'off' | 'svg'

export type WorkerRequest =
  | {
      id: string
      type: 'render'
      source: string
      params: Record<string, unknown>
      format: RenderFormat
    }
  | { id: string; type: 'parse'; source: string }
  | { id: string; type: 'cancel'; targetId: string }
  | { id: string; type: 'ping' }

export type WorkerResponse =
  | {
      id: string
      type: 'render-progress'
      phase: 'compile' | 'tessellate' | 'export'
    }
  | {
      id: string
      type: 'render-result'
      bytes: Uint8Array
      renderMs: number
      stderr: string
    }
  | { id: string; type: 'render-error'; message: string; stderr: string }
  | { id: string; type: 'pong' }
  | { id: string; type: 'ready' }

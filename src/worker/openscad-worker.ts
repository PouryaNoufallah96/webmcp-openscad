/// <reference lib="webworker" />

import { createOpenSCAD, type OpenSCADInstance } from 'openscad-wasm-prebuilt'
import type { WorkerRequest, WorkerResponse } from './protocol'

const ctx: DedicatedWorkerGlobalScope = self as never

let openscadPromise: Promise<OpenSCADInstance> | null = null
let bosl2MountedPromise: Promise<void> | null = null
const stderrBuffer: string[] = []

function clearStderr() {
  stderrBuffer.length = 0
}

function post(msg: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer)
}

async function getOpenSCAD(): Promise<OpenSCADInstance> {
  if (!openscadPromise) {
    const p = createOpenSCAD({
      print: (text) => {
        stderrBuffer.push(text)
      },
      printErr: (text) => {
        stderrBuffer.push(text)
      },
    }).then((openscad) => {
      const module = openscad.getInstance() as unknown as {
        ENV?: Record<string, string>
      }
      if (module.ENV) {
        module.ENV.OPENSCADPATH = '/libraries'
      }
      return openscad
    })
    // Don't cache a permanently-rejected promise — let the next caller retry.
    p.catch(() => {
      if (openscadPromise === p) openscadPromise = null
    })
    openscadPromise = p
  }
  return openscadPromise
}

async function ensureBosl2Mounted(openscad: OpenSCADInstance): Promise<void> {
  if (bosl2MountedPromise) return bosl2MountedPromise
  const p = (async () => {
    const fs = openscad.getInstance().FS
    try {
      fs.mkdir('/libraries')
    } catch {
      // already exists
    }
    try {
      fs.mkdir('/libraries/BOSL2')
    } catch {
      // already exists
    }
    try {
      fs.mkdir('/BOSL2')
    } catch {
      // already exists
    }

    const indexResp = await fetch('/libraries/BOSL2/index.json')
    if (!indexResp.ok) {
      throw new Error(`Failed to fetch BOSL2 index: ${indexResp.status}`)
    }
    const files: string[] = await indexResp.json()

    await Promise.all(
      files.map(async (name) => {
        const resp = await fetch(`/libraries/BOSL2/${name}`)
        if (!resp.ok) {
          throw new Error(`Failed to fetch BOSL2/${name}: ${resp.status}`)
        }
        const text = await resp.text()
        fs.writeFile(`/libraries/BOSL2/${name}`, text)
        // Also mount at root so `include <BOSL2/...>` resolves relative
        // to the source-file directory (which OpenSCAD always searches).
        fs.writeFile(`/BOSL2/${name}`, text)
      }),
    )
    console.log(`[openscad-worker] mounted ${files.length} BOSL2 files`)
  })()
  // Don't cache a permanently-rejected promise — let the next caller retry.
  p.catch(() => {
    if (bosl2MountedPromise === p) bosl2MountedPromise = null
  })
  bosl2MountedPromise = p
  return bosl2MountedPromise
}

function formatParamValue(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatParamValue(v)).join(',')}]`
  }
  return JSON.stringify(value)
}

function buildDFlags(params: Record<string, unknown>): string[] {
  const flags: string[] = []
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    flags.push('-D', `${name}=${formatParamValue(value)}`)
  }
  return flags
}

async function handleRender(req: Extract<WorkerRequest, { type: 'render' }>) {
  const start = performance.now()
  clearStderr()

  let openscad: OpenSCADInstance
  try {
    openscad = await getOpenSCAD()
    await ensureBosl2Mounted(openscad)
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: e instanceof Error ? e.message : String(e),
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  const fs = openscad.getInstance().FS
  const inputPath = '/input.scad'
  const ext = req.format === 'stl' ? 'stl' : req.format === 'off' ? 'off' : 'svg'
  const outputPath = `/output.${ext}`

  try {
    fs.writeFile(inputPath, req.source)
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: `Failed to write source: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  // Best-effort: clear previous output
  try {
    fs.unlink(outputPath)
  } catch {
    // ignore
  }

  post({ id: req.id, type: 'render-progress', phase: 'compile' })

  const args = [inputPath, '-o', outputPath, ...buildDFlags(req.params)]

  let exitCode: number
  try {
    exitCode = openscad.getInstance().callMain(args)
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: e instanceof Error ? e.message : String(e),
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  if (exitCode !== 0) {
    post({
      id: req.id,
      type: 'render-error',
      message: `OpenSCAD exited with code ${exitCode}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  post({ id: req.id, type: 'render-progress', phase: 'export' })

  let bytes: Uint8Array
  try {
    const data = fs.readFile(outputPath, { encoding: 'binary' })
    bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBufferLike)
  } catch (e) {
    post({
      id: req.id,
      type: 'render-error',
      message: `Failed to read output: ${e instanceof Error ? e.message : String(e)}`,
      stderr: stderrBuffer.join('\n'),
    })
    return
  }

  const renderMs = performance.now() - start
  const transferable = bytes.buffer instanceof ArrayBuffer ? [bytes.buffer] : []

  post(
    {
      id: req.id,
      type: 'render-result',
      bytes,
      renderMs,
      stderr: stderrBuffer.join('\n'),
    },
    transferable,
  )
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  if (msg.type === 'render') {
    void handleRender(msg)
  } else if (msg.type === 'ping') {
    post({ id: msg.id, type: 'pong' })
  } else if (msg.type === 'parse' || msg.type === 'cancel') {
    // Cancel is handled by terminating the worker from the main thread.
    // Parse is currently a main-thread concern.
  }
}

post({ id: 'boot', type: 'ready' })

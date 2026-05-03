/**
 * MCP registration — the one bridge between this app and the outside world.
 *
 * `initializeWebModelContext` (from `@mcp-b/global`) installs the full
 * WebMCP runtime: it stamps `navigator.modelContext` on `window`, wires up
 * the tab-server transport that the MCP-B browser extension talks to
 * (`listTools` / `callTool`), and adds the iframe-child transport used by
 * the local stdio relay's embed widget. After that, every entry in
 * `tools` (see `./tools.ts`) is registered, in order.
 *
 * This module is idempotent — `useEffect` mounts may fire twice in dev,
 * but only the first successful pass actually registers.
 */
import { initializeWebModelContext } from '@mcp-b/global'
import { tools } from './tools'

let registered = false
let registeredCount = 0

export function getRegisteredToolCount(): number {
  return registeredCount
}

export function isMcpRegistered(): boolean {
  return registered
}

type ModelContextLike = {
  registerTool: (tool: {
    name: string
    description: string
    inputSchema: object
    execute: (args: unknown) => Promise<unknown>
  }) => void
  unregisterTool?: (name: string) => void
}

declare global {
  interface Navigator {
    modelContext?: ModelContextLike
  }
}

export function registerWebMcpTools(): void {
  if (typeof window === 'undefined') return
  if (registered) return

  // Full @mcp-b/global runtime: sets up the tab-server transport that the
  // MCP-B browser extension's content script talks to (listTools / callTool),
  // plus the iframe-child transport used by the local relay's embed widget.
  try {
    initializeWebModelContext({ installTestingShim: 'if-missing' })
  } catch (e) {
    console.warn('[mcp] initializeWebModelContext failed', e)
    return
  }

  const ctx = navigator.modelContext
  if (!ctx) {
    console.warn('[mcp] navigator.modelContext unavailable after init')
    return
  }

  for (const tool of tools) {
    try {
      ctx.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: tool.execute,
      })
      registeredCount += 1
    } catch (e) {
      console.warn(`[mcp] failed to register tool "${tool.name}"`, e)
    }
  }

  // Only mark as registered once we got far enough to install tools, so a
  // failed init can be retried by the next `useEffect` mount.
  registered = true

  console.log(
    `[mcp] registered ${registeredCount} tools on navigator.modelContext`,
  )
}

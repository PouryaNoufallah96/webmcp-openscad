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
  registered = true

  // Full @mcp-b/global runtime: sets up the tab-server transport that the
  // MCP-B browser extension's content script talks to (listTools / callTool),
  // plus the iframe-child transport used by the local relay's embed widget.
  initializeWebModelContext({ installTestingShim: 'if-missing' })

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

  console.log(
    `[mcp] registered ${registeredCount} tools on navigator.modelContext`,
  )
}

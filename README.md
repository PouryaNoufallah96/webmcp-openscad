# scad-webmcp

Agent-driven parametric CAD: a localhost-only TanStack Start app that loads any
OpenSCAD model, exposes its customizer parameters and source as **WebMCP**
tools, and lets Claude (or any MCP client) drive the whole render → edit →
export loop.

The point isn't to clone MakerWorld. The point is a demo of agent-authored CAD
where the agent can mutate the SCAD itself, not just the parameters the model
author happened to expose.

## Stack

- **TanStack Start** (Vite + Nitro) — app shell, server functions, SSR
- **TanStack Store** — single source of truth for project state
- **openscad-wasm-prebuilt** — OpenSCAD compiled to a single-file WASM module,
  run inside a Web Worker
- **BOSL2** — bundled in `public/libraries/BOSL2/` and mounted into the WASM
  filesystem at boot, so `include <BOSL2/std.scad>` Just Works
- **react-three-fiber** + **three** — STL viewer with `OrbitControls`, grid,
  axes
- **@monaco-editor/react** — bottom-drawer source editor with custom SCAD
  syntax highlighting
- **@mcp-b/global** — full WebMCP runtime that installs
  `navigator.modelContext`, ships the W3C `registerTool(...)` surface, and
  layers in the bridge transports (`listTools` / `callTool`, iframe child) the
  MCP-B browser extension and the local relay's embed widget actually use
- **@mcp-b/webmcp-local-relay** — local stdio MCP server that bridges browser
  tools to Claude Desktop / Cursor / any MCP client (alternative to the
  browser extension)

## Run it

```bash
pnpm install
pnpm dev
# then open http://localhost:3000
```

The page boots with a self-contained sample (`public/samples/rounded-channel.scad`)
that uses BOSL2 — confirming the worker, the library mount, and the parameter
parser. Paste any SCAD URL or a MakerWorld customizer URL into the toolbar to
load that instead.

## Connect Claude (or another MCP client)

The browser registers tools on `navigator.modelContext`. To get them in front of
an MCP client, run the local relay and add it to your client config.

### Claude Desktop / Cursor / Windsurf

Add to your MCP config:

```json
{
  "mcpServers": {
    "webmcp-local-relay": {
      "command": "npx",
      "args": ["-y", "@mcp-b/webmcp-local-relay@latest"]
    }
  }
}
```

Restart the client. Open `http://localhost:3000`. The relay's embed script
(loaded automatically by this app) opens a WebSocket back to the relay; the
relay then surfaces every tool registered on `navigator.modelContext` over
stdio MCP.

You should now see tools in your client:

- `webmcp_list_sources`, `webmcp_list_tools`, `webmcp_call_tool` (relay
  management)
- 14 dynamic tools from this page: `load_from_url`, `load_from_text`,
  `get_source`, `edit_source`, `revert_source`, `list_parameters`,
  `get_parameter`, `set_parameter`, `set_parameters`, `reset_parameters`,
  `render`, `get_render_status`, `export_stl`, `get_history`

### Native Chrome WebMCP (preview)

If you want to drive `navigator.modelContext` directly from a Chromium build
that ships native WebMCP (Canary 147+):

1. Visit `chrome://flags/#enable-webmcp-testing`
2. Enable **WebMCP for testing**, restart the browser

The polyfill no-ops when a native runtime is present.

## Demo script

1. Open `http://localhost:3000`. The rounded-channel sample renders by default.
2. Scrub a parameter (e.g. `length`). The viewer regenerates within ~300ms.
3. In Claude, call `list_parameters` to see what's exposed.
4. "Make this channel 250mm long with 6 mounting holes." Agent calls
   `set_parameters({ values: { length: 250, hole_count: 6 } })` then `render`.
5. **The pivot:** "Add a chamfer to the top edges of the channel." There's no
   exposed parameter for this. Agent calls `get_source`, then `edit_source`
   with a search/replace patch, then `render`. The model now has chamfered
   edges that no parameter would have given you.
6. "Export the STL." Agent calls `export_stl`; the bytes come back as base64.

If the agent breaks the source with a bad edit, `revert_source` rolls back to
the last successfully-rendered text.

## Tool reference

| Tool                | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `load_from_url`     | Fetch SCAD via the local CORS proxy (MakerWorld + raw)   |
| `load_from_text`    | Load SCAD from an inline string (agent-generated)        |
| `get_source`        | Return current SCAD source                               |
| `edit_source`       | `replace_all` or `search_replace` mutation               |
| `revert_source`     | Roll source back to last known good                      |
| `list_parameters`   | All params with kind, value, default, constraints        |
| `get_parameter`     | Single param lookup                                      |
| `set_parameter`     | One override (`null` resets)                             |
| `set_parameters`    | Atomic batch override                                    |
| `reset_parameters`  | Clear all overrides                                      |
| `render`            | Force a render, return `{ ok, renderMs, byteLength }`    |
| `get_render_status` | Snapshot of `idle/pending/success/error` plus stderr     |
| `export_stl`        | Returns STL bytes as base64                              |
| `get_history`       | Recent action log so the agent can see its own footprints|

## Project layout

```
src/
  routes/__root.tsx       app shell, mcp-b relay embed script tag
  routes/index.tsx        single-page UI: toolbar, panel, viewer, editor
  server/fetch-scad.ts    server fn: CORS-proxied SCAD fetch
  scad/
    types.ts              Parameter / Adapter / ScadSource
    customizer-parser.ts  // [min:max:step] / enum / boolean parser
    source-mutations.ts   formatScadValue, search/replace helper
    adapters.ts           MakerWorld + raw URL adapters
  store/
    project-store.ts      TanStack Store + actions
    render-controller.ts  debounced auto-render, terminate-and-respawn cancel
  worker/
    protocol.ts           WorkerRequest / WorkerResponse types
    openscad-worker.ts    owns the WASM, mounts BOSL2, runs callMain
    worker-client.ts      typed main-thread client; respawn after each render
  viewer/StlViewer.tsx    R3F canvas, STLLoader, OrbitControls, fit-on-load
  ui/
    Toolbar.tsx           URL load, render, export, sample
    ParameterPanel.tsx    type-specific controls bound to store
    SourceEditor.tsx      Monaco with custom SCAD tokenizer
  mcp/
    tools.ts              all tool definitions (read + write)
    register.ts           initializeWebMCPPolyfill + registerTool loop
public/
  libraries/BOSL2/        vendored .scad files + index.json
  samples/                self-contained demos
```

## Caveats / open items

- **Single-shot WASM.** `openscad-wasm-prebuilt`'s `callMain` corrupts state on
  reuse, so the worker is terminated and respawned after every render. JS is
  cached by the browser, so the second render is ~400-800ms incl. BOSL2
  remount.
- **No Manifold backend.** This prebuilt WASM only ships CGAL.
  `--enable=manifold` is silently ignored. CGAL is fine for the demo.
- **No font set.** Anything using `text()` will fall back to a default. Add a
  fonts.zip mount if you need it.
- **Library mounts.** Only BOSL2 is bundled. Adding more is a matter of
  dropping `.scad` files (and an `index.json` listing) under
  `public/libraries/<name>/` and pointing the worker at it.
- **Relay is one process.** A single `webmcp-local-relay` instance can serve
  multiple browser tabs, but if you start a second relay it falls back to
  client mode and proxies through the first. See the relay README for details.

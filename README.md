# scad-webmcp

Agent-driven parametric CAD: a localhost-only TanStack Start app that loads any
OpenSCAD model, exposes its customizer parameters and source as **WebMCP**
tools, and lets Claude (or any MCP client) drive the whole render → edit →
export loop.

The point isn't to clone MakerWorld. The point is a demo of agent-authored CAD
where the agent can mutate the SCAD itself, not just the parameters the model
author happened to expose.

## Status

End-to-end working at `http://localhost:3000`:

- Boots with a real-world MakerWorld-style SCAD (Andy Levesque's Underware /
  Multiboard I-Channel) — 53 customizer parameters, full BOSL2 dependency,
  renders cleanly out of the box. Proves the worker, the BOSL2 mount, the
  parameter parser, and the URL adapter all hold up against a non-trivial
  model.
- Worker round-trip: ~1s on cold start (WASM init + BOSL2 mount), ~3-4s for
  the full Underware model, ~400-800ms for simple shapes after the worker
  respawn between renders.
- Auto-render fires 300ms after any parameter or source change. Render
  status, byteLength, request id, and stderr all live in the store and show
  up in the UI's render-details strip.
- Activity panel shows a live, kind-tagged log of every action (`load`,
  `param`, `source`, `render`, `export`).
- 16 WebMCP tools are registered on `navigator.modelContext` via
  `@mcp-b/global` and verified flowing through to the MCP-B browser
  extension's proxy (`[MCP Proxy] Sending 16 tools with type: tools-updated`).
- Monaco source editor with custom SCAD syntax highlighting, two-way bound
  to the store with a 400ms debounced commit + reparse.
- Server-fn CORS proxy verified by loading `openscad/examples/Basics/CSG.scad`
  straight from raw.githubusercontent.com.
- Dark-mode polish: every input / select / pill button uses the theme-aware
  `--chip-bg` / `--surface` / `--sea-ink` tokens so values are legible in
  both schemes.

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

The page boots with a real Multiboard/Underware MakerWorld customizer SCAD at
`public/samples/multiboard-box.scad`. The first render takes a few seconds
because of the BOSL2 mount + the model's complexity; subsequent edits are
fast.

To swap the default model, drop a different file into
`public/samples/multiboard-box.scad` and click **Load sample** in the
toolbar (the page only fetches the sample once on boot — the button forces a
re-fetch). Or paste any URL — a MakerWorld customizer URL with `?scadUrl=...`
or a direct `.scad` URL — and click **Load URL**.

## Connect Claude (or another MCP client)

The browser registers 16 tools on `navigator.modelContext` (see
`src/mcp/tools.ts`). Three different surfaces can pick them up; pick the
one that matches your setup.

### Path A — MCP-B Chrome extension (recommended for the demo)

The fastest path. The extension's content script reads
`navigator.modelContext` directly — no relay process, no MCP config.

1. Install **MCP-B Extension** from the Chrome Web Store:
   <https://chromewebstore.google.com/detail/mcp-b-extension/daohopfhkdelnpemnhlekblhnikhdhfa>
2. Pin it to the toolbar so the side panel is one click away.
3. Open `http://localhost:3000`. In the page DevTools console you should see:

   ```
   [mcp] registered 16 tools on navigator.modelContext
   [MCP Proxy] Sending 16 tools with type: tools-updated
   ```

4. Click the MCP-B icon → **Tools** tab. You'll see all 16 tools from this
   page (`load_from_url`, `list_parameters`, `set_parameters`, `render`,
   `edit_source`, `export_stl`, `set_project_name`, …) plus whatever
   extension built-ins you have enabled. The extension's chat sidebar can
   now drive the page.

To wire the extension up to **Claude Desktop / Cursor / Claude Code** as
well (so an external client can call the page's tools), install the
extension's native bridge:

```bash
npm install -g @mcp-b/native-server
@mcp-b/native-server   # listens on http://127.0.0.1:12306/mcp
```

Then add to your MCP client config (e.g. `~/.config/claude/mcp.json`):

```json
{
  "mcpServers": {
    "webmcp": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

The native server proxies through the extension, so any tab that registers
WebMCP tools becomes available to the desktop client.

### Path B — Local stdio relay (extension-free)

If you don't want to install the Chrome extension, use the standalone stdio
relay. Add to your client's MCP config:

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

Restart the client, open `http://localhost:3000`. The relay's embed script
(loaded automatically from `src/routes/__root.tsx`) opens a WebSocket back
to the relay process; the relay then surfaces every tool registered on
`navigator.modelContext` over stdio MCP.

You should now see tools in your client:

- `webmcp_list_sources`, `webmcp_list_tools`, `webmcp_call_tool` (relay
  management)
- 16 dynamic tools from this page: `load_from_url`, `load_from_text`,
  `get_source`, `edit_source`, `revert_source`, `list_parameters`,
  `get_parameter`, `set_parameter`, `set_parameters`, `reset_parameters`,
  `render`, `get_render_status`, `export_stl`, `get_project_name`,
  `set_project_name`, `get_history`

### Path C — Native Chrome WebMCP (preview)

To drive `navigator.modelContext` directly from a Chromium build that ships
native WebMCP (Canary 147+):

1. Visit `chrome://flags/#enable-webmcp-testing`
2. Enable **WebMCP for testing**, restart the browser

`@mcp-b/global` no-ops core install when a native runtime is present and
just wraps it with the bridge extensions.

## Demo script

1. Open `http://localhost:3000`. The Underware/Multiboard SCAD renders by
   default — 53 parameters parsed, model in the viewer.
2. Scrub a parameter (e.g. `Internal_Width`). The viewer regenerates within
   ~300ms of the slider settling.
3. In Claude (with the extension or relay connected), call `list_parameters`
   to see what's exposed.
4. "Set the internal width to 100mm and the internal height to 25mm, then
   render." Agent calls
   `set_parameters({ values: { Internal_Width: 100, Internal_Height: 25 } })`
   then `render`.
5. **The pivot:** "Add a 1mm chamfer to the top edges." There's no exposed
   parameter for this. Agent calls `get_source`, then `edit_source` with a
   search/replace patch that swaps `cuboid([..])` for `cuboid([..], chamfer=1)`,
   then `render`. The model now has chamfered edges that no parameter would
   have given you.
6. "Export the STL." Agent calls `export_stl`; the bytes come back as base64.
   Or a human can hit the **Export STL** button to download.

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
| `export_stl`        | Returns STL bytes as base64 + the `.stl` filename        |
| `get_project_name`  | Read the project name + the filename `export_stl` will use |
| `set_project_name`  | Rename the project (sets the exported `.stl` filename)   |
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
    HistoryPanel.tsx      kind-tagged action log surfaced in the UI
  mcp/
    tools.ts              all 14 tool definitions (read + write)
    register.ts           initializeWebModelContext + registerTool loop
public/
  libraries/BOSL2/        56 vendored .scad files + index.json
  samples/                default SCAD that loads on boot
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
- **Sample file is fetched once on boot.** Editing
  `public/samples/multiboard-box.scad` while the page is open won't
  hot-replace the loaded source — click **Load sample** in the toolbar (or
  hard-reload) to pick up the new file.
- **Relay is one process.** A single `webmcp-local-relay` instance can serve
  multiple browser tabs, but if you start a second relay it falls back to
  client mode and proxies through the first. See the relay README for details.
- **Embed.js feature warnings.** The relay's embed script asks for
  `loopback-network` / `local-network` iframe permissions that newer Chrome
  builds report as unrecognized. Harmless; the connection still works.

## Build steps that landed (chronologically)

1. COOP/COEP wired (later removed — single-file WASM doesn't need them, and
   leaving them on blocks the relay's CDN-served embed).
2. OpenSCAD-WASM worker stood up; BOSL2 vendored under
   `public/libraries/BOSL2/` and mounted to both `/libraries/BOSL2/` and
   `/BOSL2/` in the WASM FS.
3. Discovered `callMain` is single-shot in this WASM build → moved to
   terminate-and-respawn the worker after each render.
4. TanStack Store + R3F viewer wired; cube STL renders end-to-end.
5. Customizer parser handles `// [min:max:step]` ranges, enums (with
   `value:Label` form), booleans, strings, plus `/* [Tab] */` headers.
6. Server function `fetchScad` with MakerWorld + raw-URL adapters, verified
   live by loading `openscad/examples/Basics/CSG.scad` from
   raw.githubusercontent.com.
7. WebMCP tools wired. Started with `@mcp-b/webmcp-polyfill` (strict W3C),
   swapped to `@mcp-b/global` once the MCP-B browser extension was tested —
   the extension expects `listTools`/`callTool` directly on
   `navigator.modelContext`, which only the full runtime provides. Added
   `zod-to-json-schema` peer dep that `@mcp-b/webmcp-ts-sdk` needs but
   doesn't pull in itself.
8. Monaco source editor with custom SCAD tokenizer, debounced two-way bind
   to the store + reparse on commit.
9. Polish: header / footer rebrand, MCP tool-count badge, activity panel,
   theme-aware input colors for dark-mode legibility.

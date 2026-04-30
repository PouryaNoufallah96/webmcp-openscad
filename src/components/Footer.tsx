export default function Footer() {
  return (
    <footer className="mt-12 border-t border-[var(--line)] px-4 pb-10 pt-6 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-xs">
          Localhost-only demo. SCAD via{' '}
          <a
            href="https://github.com/lorenzowritescode/openscad-wasm"
            target="_blank"
            rel="noreferrer"
          >
            openscad-wasm
          </a>{' '}
          · libraries: BOSL2 · MCP via{' '}
          <a
            href="https://docs.mcp-b.ai"
            target="_blank"
            rel="noreferrer"
          >
            @mcp-b/global
          </a>
        </p>
        <p className="island-kicker m-0">scad-webmcp</p>
      </div>
    </footer>
  )
}

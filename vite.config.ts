import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// COOP/COEP are not required by openscad-wasm-prebuilt (single-file WASM
// without threads). Setting `require-corp` would block the WebMCP relay's
// CDN-served embed script, so we leave headers unset.

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['openscad-wasm-prebuilt'],
  },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config

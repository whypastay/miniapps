import preact from '@preact/preset-vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname
// one id per build: the apps compare it with /version.json and reload past a stale cached index.html
const BUILD = process.env.GITHUB_SHA?.slice(0, 12) || `local-${Date.now()}`

function versionFile() {
  return {
    name: 'version-file',
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) + '\n' })
    },
  }
}

export default defineConfig({
  plugins: [preact(), versionFile()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  base: './',
  server: { host: '127.0.0.1', port: 43123, strictPort: true },
  preview: { host: '127.0.0.1', port: 43123, strictPort: true },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        budget: resolve(root, 'budget/index.html'),
        santa: resolve(root, 'santa/index.html'),
        matchday: resolve(root, 'matchday/index.html'),
        radar: resolve(root, 'radar/index.html'),
      },
    },
  },
})

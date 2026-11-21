import preact from '@preact/preset-vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = import.meta.dirname

export default defineConfig({
  plugins: [preact()],
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
      },
    },
  },
})

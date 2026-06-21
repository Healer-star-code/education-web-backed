import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'electron/main/index.ts'),
        formats: ['es'],
      },
      rollupOptions: {
        output: {
          entryFileNames: 'index.js',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'electron/preload/index.ts'),
        formats: ['cjs'],
      },
      rollupOptions: {
        output: {
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname),
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/superking-api': {
          target: 'http://127.0.0.1:30142',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/superking-api/, ''),
        },
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
  },
})

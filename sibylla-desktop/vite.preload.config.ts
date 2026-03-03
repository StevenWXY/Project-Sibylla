import { defineConfig } from 'vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: path.join(__dirname, 'dist/preload'),
    emptyOutDir: true,
    lib: {
      entry: path.join(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: ['electron']
    },
    target: 'node18'
  }
})

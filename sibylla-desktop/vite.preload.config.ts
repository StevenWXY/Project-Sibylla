import { defineConfig } from 'vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: path.join(__dirname, 'dist/preload'),
    emptyOutDir: true,
    
    // Library mode
    lib: {
      entry: path.join(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    
    // Rollup options
    rollupOptions: {
      external: ['electron']
    },
    
    // Target environment
    target: 'node18',
    
    // Environment-specific sourcemap
    sourcemap: process.env.NODE_ENV === 'development'
  }
})

import { defineConfig } from 'vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: path.join(__dirname, 'dist/main'),
    emptyOutDir: true,
    
    // Library mode
    lib: {
      entry: path.join(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    
    // Rollup options
    rollupOptions: {
      external: [
        // Node.js built-in modules
        'electron',
        'path',
        'fs',
        'fs/promises',
        'os',
        'crypto',
        'events',
        'stream',
        'util',
        'buffer',
        'child_process',
        'net',
        'http',
        'https',
        'url',
        'querystring',
        'readline',
        
        // Native modules
        'chokidar', // File watcher with native dependencies
        
        // Git abstraction layer dependencies
        'isomorphic-git',
        'isomorphic-git/http/node',
        'diff',
        
        'better-sqlite3',
        
        // Modules with browser-only API references (DOMMatrix, etc.)
        'mammoth',
        'pdf-parse',
      ]
    },
    
    // Target environment
    target: 'node18', // Match Electron 28 Node.js version
    
    // Compression configuration
    minify: process.env.NODE_ENV === 'production',
    
    // Environment-specific sourcemap
    sourcemap: process.env.NODE_ENV === 'development'
  },
  
  // Path aliases
  resolve: {
    alias: {
      '@main': path.join(__dirname, 'src/main'),
      '@shared': path.join(__dirname, 'src/shared')
    }
  }
})

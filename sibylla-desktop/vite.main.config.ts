import { defineConfig } from 'vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: path.join(__dirname, 'dist/main'),
    emptyOutDir: true,
    lib: {
      entry: path.join(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [
        'electron',
        'path',
        'fs',
        'os',
        'crypto',
        'events',
        'stream',
        'util',
        'buffer'
      ]
    },
    target: 'node18', // 匹配 Electron 28 的 Node.js 版本
    minify: process.env.NODE_ENV === 'production'
  },
  resolve: {
    alias: {
      '@main': path.join(__dirname, 'src/main'),
      '@shared': path.join(__dirname, 'src/shared')
    }
  }
})

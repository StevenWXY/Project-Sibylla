import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  
  // Development server configuration
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: true // Show error overlay for quick debugging
    }
  },
  
  // Build configuration
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    
    // Rollup options
    rollupOptions: {
      input: {
        main: path.join(__dirname, 'src/renderer/index.html')
      },
      output: {
        // Code splitting strategy
        manualChunks: {
          'react-vendor': ['react', 'react-dom']
          // Future UI libraries can be added here:
          // 'ui-vendor': ['@tiptap/react', '@tiptap/starter-kit']
        },
        // Optimize file naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    },
    
    // Compression configuration
    minify: 'esbuild',
    
    // Environment-specific sourcemap
    sourcemap: process.env.NODE_ENV === 'development',
    
    // Code split warning threshold
    chunkSizeWarningLimit: 1000,
    
    // Target environment
    target: 'chrome120', // Match Electron 28 Chromium version
    
    // Enable CSS code splitting
    cssCodeSplit: true,
    
    // Inline assets smaller than 4KB
    assetsInlineLimit: 4096
  },
  
  // Path aliases
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/renderer'),
      '@components': path.join(__dirname, 'src/renderer/components'),
      '@hooks': path.join(__dirname, 'src/renderer/hooks'),
      '@styles': path.join(__dirname, 'src/renderer/styles'),
      '@shared': path.join(__dirname, 'src/shared')
    }
  },
  
  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom'
    ]
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { componentTagger } from "lovable-tagger"

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    cors: true,
    allowedHosts: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      clientPort: 8080
    },
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    allowedHosts: true,
    cors: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/__tests__/setupTests.ts',
    globals: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  }
}))

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        // Vite 8 (rolldown) types manualChunks as a function.
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules/react-syntax-highlighter')) return 'highlighter'
          if (id.includes('node_modules/@supabase/')) return 'supabase'
          if (
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})

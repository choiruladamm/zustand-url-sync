import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // The shared app is raw TypeScript in a linked workspace package, so it has to be transformed
  // rather than treated as a pre-built dependency.
  optimizeDeps: { exclude: ['@example/shared'] },
})

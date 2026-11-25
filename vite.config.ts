import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Only the app's index.html is an entry; prototype/*.html is reference material.
  optimizeDeps: { entries: ['index.html'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/unit/setup.ts'],
    // UI tests type real text with user-event; under a full parallel run 5s is too tight.
    testTimeout: 15000,
  },
})

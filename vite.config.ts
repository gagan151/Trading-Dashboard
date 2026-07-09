import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Don't clear the terminal so Tauri's own output stays visible.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
})

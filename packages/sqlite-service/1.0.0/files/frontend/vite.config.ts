import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:{{project.port}}',
      '/healthz': 'http://127.0.0.1:{{project.port}}',
    },
  },
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    exclude: [
      "wasm-image-optimization",
      "stealth-watermark-reader"
    ]
  }
})

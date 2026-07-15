import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 讓打包後的資源用相對路徑，之後放 GitHub Pages 子路徑也能正常載入
export default defineConfig({
  plugins: [react()],
  base: './',
})

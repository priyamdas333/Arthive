import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite is the build tool. It runs a fast dev server (npm run dev) and bundles
// the app for production (npm run build -> dist/). The React plugin enables JSX.
export default defineConfig({
  plugins: [react()],
})
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
// Mode prod forcé : Vercel build par défaut produisait un bundle dev
// (jsxDEV + 1.4× la taille), ce qui activait StrictMode double-invoke
// et cassait les modales (drawer / MotoPage).
export default defineConfig(({ command }) => ({
  plugins: [react(), basicSsl()],
  mode: command === 'build' ? 'production' : 'development',
  define: {
    'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development'),
  },
  build: {
    sourcemap: false,
  },
}))

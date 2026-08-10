import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // '/static/' on build so asset URLs match FastAPI's StaticFiles mount point.
  // '/' on dev so the Vite dev server runs at http://localhost:5173/.
  base: command === 'build' ? '/static/' : '/',
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../static'),
    emptyOutDir: true,
  },
}));

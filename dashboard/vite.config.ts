import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite dashboard` sets this file's directory as root; paths below are relative to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
      '/_': {
        target: process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
    },
  },
});

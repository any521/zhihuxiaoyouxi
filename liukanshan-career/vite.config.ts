import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});

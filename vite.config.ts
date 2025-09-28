import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  return {
    plugins: [react()],
    root: path.resolve(__dirname, 'app/renderer'),
    base: './',
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
      sourcemap: !isProd,
      rollupOptions: {
        input: path.resolve(__dirname, 'app/renderer/index.html'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@common': path.resolve(__dirname, 'app/common'),
      },
    },
  };
});

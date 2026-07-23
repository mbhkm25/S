import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), 'VITE_');
  return {
    root: __dirname,
    envDir: path.resolve(__dirname, '..'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../src')
      }
    },
    build: {
      outDir: path.resolve(__dirname, '../dist-admin'),
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2022'
    },
    define: {
      __SANAD_ADMIN_APP_URL__: JSON.stringify(env.VITE_PLATFORM_ADMIN_URL || 'https://admin.sanadflow.com')
    }
  };
});

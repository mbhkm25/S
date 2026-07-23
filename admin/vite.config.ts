import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const adminRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(adminRoot, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, 'VITE_');
  return {
    root: adminRoot,
    envDir: repositoryRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(repositoryRoot, 'src')
      }
    },
    build: {
      outDir: path.resolve(repositoryRoot, 'dist-admin'),
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2022'
    },
    define: {
      __SANAD_ADMIN_APP_URL__: JSON.stringify(env.VITE_PLATFORM_ADMIN_URL || 'https://admin.sanadflow.com')
    }
  };
});

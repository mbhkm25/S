import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const landingDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryDir = path.resolve(landingDir, '..');

export default defineConfig(({ mode }) => {
  const repositoryEnv = loadEnv(mode, repositoryDir, '');
  const landingEnv = loadEnv(mode, landingDir, '');
  const env = { ...repositoryEnv, ...landingEnv, ...process.env };
  const value = (key:string, fallback='') => JSON.stringify(env[key] || fallback);

  return {
    plugins: [react()],
    publicDir: 'public',
    envDir: repositoryDir,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': value('VITE_SUPABASE_URL', 'https://api.sanadflow.com'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': value('VITE_SUPABASE_PUBLISHABLE_KEY'),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': value('VITE_SUPABASE_ANON_KEY'),
      'import.meta.env.VITE_APP_URL': value('VITE_APP_URL', 'https://app.sanadflow.com')
    },
    build: { outDir: 'dist', emptyOutDir: true }
  };
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  envDir: false,
  publicDir: fileURLToPath(new URL('../../../public', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: /^\.\/assistantActionApi$/, replacement: `${here}mockApi.ts` }] },
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  build: { outDir: '../../../dist-expense-preview', emptyOutDir: true },
});

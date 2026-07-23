import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveBuildVersion(env: Record<string, string>): string {
  if (env.VITE_APP_VERSION) return env.VITE_APP_VERSION;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveVendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
  if (id.includes('/@supabase/')) return 'vendor-supabase';
  if (id.includes('/motion/') || id.includes('/framer-motion/')) return 'vendor-motion';
  if (id.includes('/@capacitor/')) return 'vendor-capacitor';
  if (id.includes('/html5-qrcode/') || id.includes('/qrcode/')) return 'vendor-qr';
  return 'vendor';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_APP_BASE_PATH || '/';
  const buildVersion = resolveBuildVersion(env);
  const buildTime = new Date().toISOString();

  return {
    base: base,
    define: {
      __SANAD_APP_VERSION__: JSON.stringify(buildVersion),
      __SANAD_BUILD_TIME__: JSON.stringify(buildTime)
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'sanad-release-manifest',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ version: buildVersion, built_at: buildTime })
          });
        }
      },
      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectRegister: null, // manual registration in main.tsx
        includeManifestIcons: false,
        manifest: {
          name: 'سند',
          short_name: 'سند',
          description: 'منصة سند للتحقق من الإشعارات المالية ومشاركة العمليات.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#059669',
          orientation: 'portrait',
          dir: 'rtl',
          lang: 'ar',
          share_target: {
            action: '/share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: {
              title: 'title',
              text: 'text',
              url: 'url',
              files: [
                {
                  name: 'files',
                  accept: [
                    'image/*',
                    'application/pdf'
                  ]
                }
              ]
            }
          },
          icons: [
            {
              src: 'icon-96.png',
              sizes: '96x96',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: 'icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,txt,json}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 // 3MB limit
        }
      })
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: resolveVendorChunk
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

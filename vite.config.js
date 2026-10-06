import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { loadEnv } from 'vite';
import { isBrandId, BRANDS } from './shared/brand.ts';

export default defineConfig(({ mode }) => {
  // Brand selection: one `BRAND_ID` env var drives server + client. Vite only
  // exposes prefixed vars, so widen envPrefix; default here so an unset var
  // still yields a valid build (shared/brand.ts DEFAULT_BRAND_ID).
  const fileEnv = loadEnv(mode, process.cwd(), 'BRAND_');
  process.env.BRAND_ID = process.env.BRAND_ID || fileEnv.BRAND_ID || 'armanino';
  if (!isBrandId(process.env.BRAND_ID)) {
    // Fail the build, not the browser: a typo here would ship a bundle with a broken favicon/theme.
    throw new Error(`BRAND_ID="${process.env.BRAND_ID}" is not a known brand. Expected one of: ${Object.keys(BRANDS).join(', ')}`);
  }
  return {
  envPrefix: ['VITE_', 'BRAND_'],
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@dealpad/domain': path.resolve(__dirname, './packages/domain/src/index.ts'),
      '@dealpad/application': path.resolve(__dirname, './packages/application/src/index.ts'),
      '@dealpad/infrastructure': path.resolve(__dirname, './packages/infrastructure/src/index.ts'),
    },
  },
  root: '.',
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  };
});

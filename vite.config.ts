/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Göreli yollar: GitHub Pages alt klasöründe ve Cloudflare Pages kökünde aynı build çalışır.
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

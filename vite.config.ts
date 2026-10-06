/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
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
    // Çok sayfalı derleme: oyun (index.html) + Asset Gallery (gallery.html -> dist/gallery.html)
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./gallery.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

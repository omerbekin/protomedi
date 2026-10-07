/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Kısa git commit kimliği (depoda commit yoksa ya da git yoksa boş): maç kaydı başlığında görünür. */
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  // Göreli yollar: GitHub Pages alt klasöründe ve Cloudflare Pages kökünde aynı build çalışır.
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  build: {
    chunkSizeWarningLimit: 2000,
    // Çok sayfalı derleme: oyun (index.html) + gömülü animasyon sahnesi ve yönlendirme kabuğu (gallery.html -> dist/gallery.html; wiki iframe'i ?embed=1 ile yükler)
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
    testTimeout: 30000, // ağır AI savaş testleri (yük altında 5 sn varsayılanı aşabiliyor)
  },
});

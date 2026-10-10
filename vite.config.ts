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
    // Hızlı açılış (kod bölme): Phaser kendi parçasında (~1,2 MB, sürüm değişmedikçe önbellekte kalır); ana menü dışındaki sahneler,
    // Codex, debug menüsü ve gömülü galeri dynamic import ile ayrı parçalarda (src/game/lazy-scenes.ts, src/wiki/open.ts, src/ui/debug-entry.ts).
    // Sınır Phaser parçasının biraz üstünde: bir parça bunu aşarsa uyarı yeniden bölmeyi hatırlatır.
    chunkSizeWarningLimit: 1400,
    // Çok sayfalı derleme: oyun (index.html) + gömülü animasyon sahnesi ve yönlendirme kabuğu (gallery.html -> dist/gallery.html; wiki iframe'i ?embed=1 ile yükler)
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./gallery.html', import.meta.url)),
      },
      output: {
        codeSplitting: {
          groups: [{ name: 'phaser', test: /[\\/]node_modules[\\/]phaser[\\/]/ }],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000, // ağır AI savaş testleri (yük altında 5 sn varsayılanı aşabiliyor)
  },
});

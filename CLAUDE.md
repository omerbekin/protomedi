# Proje: Sıra Tabanlı Yandan Görünümlü RPG (çalışma adı: "Proto")

## Özet
Armor Games'teki Sonny tarzı, yandan görünümlü (side-view), 2D pixel art, sıra tabanlı RPG.
Web tabanlı (TypeScript + Phaser 3 + Vite), mobil tarayıcıda da oynanır.
4 kişilik parti, düğüm tabanlı dünya haritası, hıza göre dinamik sıra sistemi.

## Sahip ve çalışma biçimi
- Proje sahibi (Ömer) **kod okumaz/denetlemez**. Kalite güvencesi: otomatik testler, oyun içi debug menüsü, denge simülasyon raporları.
- Ömer ile iletişim **Türkçe**, kod diliyle değil sade dille. Her görev sonunda: ne yapıldı, hangi ekranda nasıl görünmeli, ne test edilmeli.
- Ömer'in "çerçevesi" `docs/design/` altındadır. Orada yazmayan bir tasarım kararını kendi kafana göre verme: varsayım yaptıysan görev sonunda açıkça söyle ve `docs/design/open-questions.md` dosyasına ekle.
- Küçük adımlar: her adım sonunda oynanabilir bir şey çıkmalı.
- Ana oturum koordine eder; gerektiğinde `.claude/agents/` altındaki agentları çağırır ve sonuçları Ömer'e tek özet olarak sunar.

## Teknik kararlar (değiştirmeden önce Ömer'e sor)
- TypeScript (strict), Phaser 3, Vite, Vitest.
- **Savaş motoru saf TypeScript**, `src/engine/` altında. Phaser'a, DOM'a, `window`'a bağımlı OLAMAZ. Node'da headless çalışabilmeli.
- Render ve UI `src/game/` ve `src/ui/` altında; motoru yalnızca olay (event) akışı üzerinden dinler.
- **İçerik koddan ayrı**: class, skill, düşman, item, düğüm haritası `data/*.json` dosyalarında. Denge değişikliği = veri değişikliği. Yeni class = yeni veri dosyası (+ sprite).
- **Seed'li RNG** zorunlu. Motorda `Math.random` yasak. Aynı seed + aynı girdiler = birebir aynı savaş.
- Kayıt: localStorage, sürümlü şema.
- Sanal çözünürlük 480x270 (16:9), tamsayı ölçekleme, `image-rendering: pixelated`.
- **Yatay (landscape) öncelikli.** Dikey tutulan telefonda oyun alanı yatay formatta ortalanır ve "telefonu yatay çevir" uyarısı gösterilir.
- Dokunmatik öncelikli girdi; fare ve klavye de çalışır. Dokunma hedefleri en az 44px (gerçek piksel).
- Yayın: her değişiklik önizleme linkine yayınlanır (Cloudflare Pages veya GitHub Pages), Ömer telefondan oynar.

## Klasör yapısı
```
CLAUDE.md
docs/design/      Ömer'in çerçevesi: vision, combat, classes, art, open-questions
docs/balance.md   denge hedefleri
data/             classes, skills, enemies, items, map JSON
src/engine/       saf savaş motoru (headless)
src/game/         Phaser sahneleri, sprite/animasyon sistemi
src/ui/           menüler, HUD, debug menüsü
src/sim/          headless savaş/denge simülatörü (CLI)
assets/           sprite, ses (placeholder'lar kodla üretilir)
tests/            vitest testleri
.claude/agents/   özel agent tanımları
```

## Kalite kuralları
1. Her motor değişikliği test ile gelir. `npm test` yeşil değilse iş bitmiş sayılmaz.
2. Her görev sonunda `npm run build` hatasız olmalı.
3. Her ekran/özellik debug menüsünden tetiklenebilir olmalı (Ömer arayüzden test edecek).
4. Denge değişiklikleri tahmine değil `npm run sim` raporuna dayanır.
5. Sprite yoksa placeholder çiz; eksik asset oyunu çökertmemeli.
6. Sayıları koda gömme; veri dosyasına koy.

## Asset kuralları
- Pixel art, sabit palet (`docs/design/art.md`). Her karakter için sabit animasyon seti: `idle`, `attack`, `cast`, `hit`, `death` (+ `defend`).
- Dosya adı: `assets/sprites/<id>/<animasyon>.png` (yatay sprite sheet). Gerçek sprite aynı isimle konunca placeholder'ın yerini otomatik alır.
- Placeholder: class rengine boyalı basit blok karakter, animasyon için basit hareket/yanıp sönme.
- Harici asset kullanılırsa kaynağı ve lisansı `assets/CREDITS.md` dosyasına yaz.

## Kapsam dışı (şimdilik)
- Co-op/çok oyunculu. Motor deterministik ve olay tabanlı olduğu için ileride mümkün kalır; şimdilik ekstra iş yapma.
- Gerçek ses/müzik (placeholder bip sesleri yeterli).

## Komutlar
- `npm run dev` — geliştirme sunucusu (`--host` açık: aynı Wi-Fi'deki telefondan da açılır)
- `npm run build` — tip kontrolü + üretim derlemesi (`dist/`)
- `npm test` — vitest testleri (motor saflığı denetimi dahil: `src/engine` içinde Math.random/Phaser/DOM yasak)
- `npm run sim` — headless denge simülatörü (`src/sim/cli.ts`)
- Yayın: `main` dalına push → GitHub Actions test + build → GitHub Pages (`.github/workflows/deploy.yml`). Test kırmızıysa yayın olmaz.
- Debug menüsü: sağ alttaki DEBUG düğmesi (klavyede ` veya F2). Yeni özellik = `src/main.ts` içinde `debug.register(...)` ile yeni giriş.

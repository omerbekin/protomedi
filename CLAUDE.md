# Proje: Sıra Tabanlı Yandan Görünümlü RPG (çalışma adı: "Proto")

## Özet
Armor Games'teki Sonny tarzı, yandan görünümlü (side-view), 2D pixel art, sıra tabanlı RPG.
Web tabanlı (TypeScript + Phaser 3 + Vite), mobil tarayıcıda da oynanır.
5 kişilik takım, düğüm tabanlı dünya haritası, hıza göre dinamik sıra sistemi.

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
- Oyun çözünürlüğü **1920x1080 (HD, 16:9)**: Ömer kararı (2026-10-04). Ekrana oranı korunarak sığdırılır (Phaser Scale.FIT). Gerçek pixel art sprite'lar NEAREST filtreyle büyütülür.
- **Yatay (landscape) öncelikli.** Dikey tutulan telefonda oyun alanı yatay formatta ortalanır ve "telefonu yatay çevir" uyarısı gösterilir.
- **Oyun içi arayüz İngilizce** (menüler, düğmeler, uyarılar, skill/karakter isimleri, debug menüsü dahil). Ömer'le konuşma, raporlar, `docs/` ve kod yorumları Türkçe kalır. Yeni ekran yazılırken İngilizce yazılır.
- **Sıra sistemi:** her karakterin `spd` (çabukluk) statı vardır; sayaç modeli (`src/engine/turn-order.ts`, eşik `data/formulas.json` > `turn`). SPD ne kadar yüksekse o kadar sık oynar. Sıra çubuğu aynı hesaptan gelen tahmini gösterir.
- **Kontrol:** oyuncu tarafını oyuncu, düşman tarafını yapay zeka oynar (`src/engine/ai.ts`; öncelikler ve eşikler `data/ai.json` profillerinde, karakterin `ai` alanı profil seçer). Yapay zeka saf ve belirleyicidir (rastgelelik kullanmaz).
- **Takımlar:** oyuncu ve düşman aynı sınıf havuzundan (`data/classes/`) seed'e göre 5 farklı sınıf alır (`data/battles/random-battle.json`). Görsel sınıfa aittir, taraf fark etmez. Her sınıfın tam 4 skill'i vardır. Çağrılan birimler `data/summons/` altındadır. Sayfa `?seed=123` ile belirli bir savaşla açılır.
- **Stat sistemi:** 4 temel stat (str, int, dex, luck) can/MP/hız/kritiği türetir (`src/engine/stats.ts`, `data/formulas.json`). Skill hasarı/şifası/kalkanı ilgili statla ölçeklenir. **Kural: tüm hasarlar, aksi açıkça belirtilmedikçe, skill'in kendi statının (`scale`) yüzdesidir; istisnalar `tests/damage-scale-rule.test.ts` listesinde ve `docs/design/combat.md`'de.** Zırh yüzdesel (zırh/(zırh+30)). Kritik son çarpan (hasar+şifa, kalkan değil). Dizilim: her taraf 4 sıra x 3 şerit (yuva = sıra*3+şerit, `formation` in formulas.json); melee skiller düşmanın en öndeki dolu sırasına ulaşır (`formation.meleeRows`), alan skill'leri `area.radius` ile artı şeklinde, `column_enemies` seçilen şeridin tamamına vurur. Başlangıç ekranı `TeamSelectScene` (5+5 sınıf seç, randomize); `?seed=` ekranı atlar.
- **MP yenilenmesi ve cooldown:** her karakter kendi turunun başında `mpRegen` kadar MP kazanır; güçlü skill'lerin `cooldown` değeri vardır (kullanıcının kendi tur sayısıyla). İkisi de yalnızca `turns` modunda işler. Bazı güçlü (4. yuva) skill'lerin `initialCooldown` değeri vardır: savaş başında hazır değil, birimin kendi ilk N turunda kullanılamaz (üst sınır `formulas.json > cooldown.maxInitial` = 3; çağrılanlarda ve test modunda yok). Yapay zekada 4. yuvaya gömülü ağırlık yoktur: skill'in `ai` bağlam ipucu (`data/skills.json`) doğru bağlamı belirler, `data/ai.json` > `tactic` önceliği uygular. Denge hedefi: yapay zeka vs yapay zeka savaşında oyuncu kazanma oranı ~%50 (`npm run sim`).
- **Arayüz ayrıntıları:** skill düğmeleri küçüktür (ikon + isim + bedel), ayrıntı tooltip'tedir; hedef seçerken fareyle gelinen karakterde tahmini etki önizlenir (`src/engine/preview.ts`, saf ve belirleyici); skill açıklaması `src/engine/skill-info.ts` verisinden üretilir. Skill animasyonları `animation.skillSlowdown` ile yavaşlatılır. Yeni bir skill eklerken `icon`, `vfx` (piksel art efekti, `src/game/vfx.ts`) ve (yukarıdan düşecekse) `motion: "sky"` + `skyFx` alanlarını ver; ses isteniyorsa `sfx` (`data/audio.json`, WebAudio sentezi). İkonlar `src/game/pixel-art.ts` motoruyla kodla çizilir (64x64 piksel art). **Terminoloji: Ömer "avatar" derse daima üst sıra çubuğundaki (sıra bekleyenlerin) portre görünümünü, yani karakterin KAFASINI kastediyor** (`BattleScene.avatarImage`; sol alttaki büyük portre de aynısıdır). Sıra çubuğu: ortada şu anki karakter (altında altın ok), sağda sıradakiler, solda bu savaşta sırası geçenler (silik; UI tarafında turnStart olaylarından tutulan liste). Oyun içi karakter/class adı yazıları serif fonttur (`SERIF`).
- **İki savaş modu:** `turns` (varsayılan, gerçek oyun) ve `test` (sırasız; her karakter istediği an oynar, yalnızca debug menüsünden açılır). Her yeni savaş özelliği iki modda da bozulmamalı.
- **Tasarım felsefesi: oyun medieval (ortaçağ) tarzında.** Görsel ve **ses** buna uyar. Sesler gerçeğe yakın olur: çan gibi "çin çin" çınlayan saf sinüs/titreşim sesleri YOK; gerçek hayattaki karşılıklarından yola çıkılır (yay kirişi "thwap", ok "fft" ve ahşap/et "thock", çelik-zırh çatırtısı, taş/toprak çatlaması, gerçek ateş çıtırtısı, insan korosu/nefesi). Ses = filtreli gürültü + alçak darbe (+ gerekirse gerilmiş tel ya da formantlı insan sesi). Her skill'in sesi, onu atarken kullanılan şeylerin gerçek örneklerine göre kurulur (`data/audio.json`; Warrior ve Druid sesleri Ömer'in beğendiği referanstır, dokunma).
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
7. **Asset Gallery (`gallery.html`, dev: `http://localhost:5173/gallery.html`):** yeni ses/ikon/animasyon/karakter/skill eklenince galeride göründüğünden emin ol (otomatik türetilir: `src/gallery/catalog.ts`; özel bir alan eklendiyse galeriyi güncelle). `tests/gallery.test.ts` kapsamı denetler.
8. **Wiki (sağ üst kitap simgesi, `src/wiki`):** içerik veriden türetilir; yeni mekanik/özel kural/pasif eklenince wiki'nin Mechanics bölümündeki metin güncel mi kontrol et (`src/wiki/catalog.ts`; `tests/wiki.test.ts` kapsamı denetler). Wiki açıkken savaş otomatik durur (`debugState.uiPaused`).

## Asset kuralları
- Pixel art, sabit palet (`docs/design/art.md`). Her karakter için sabit animasyon seti: `idle`, `attack`, `cast`, `hit`, `death` (+ `defend`).
- Dosya adı: `assets/sprites/<id>/<animasyon>.png` (yatay sprite sheet). Gerçek sprite aynı isimle konunca placeholder'ın yerini otomatik alır.
- Placeholder: class rengine boyalı basit blok karakter + sınıfı anlatan donanım, animasyon için basit hareket/yanıp sönme.
- Gerçek sprite: `assets/sprites/<id>/idle.png` tek bir ayakta duran illüstrasyon olabilir (genişlik < 1,5 x yükseklik) ya da yatay sprite sheet. Ekranda `data/battle-layout.json` > `spriteBox` içine oranı korunarak sığdırılır. Karakter sayfaları `tools/slice-characters.mjs` ile kesilir; eşleştirme tablosu `assets/CREDITS.md`.
- Harici asset kullanılırsa kaynağı ve lisansı `assets/CREDITS.md` dosyasına yaz.

## Kapsam dışı (şimdilik)
- Co-op/çok oyunculu. Motor deterministik ve olay tabanlı olduğu için ileride mümkün kalır; şimdilik ekstra iş yapma.
- Gerçek ses/müzik (placeholder bip sesleri yeterli).

## Komutlar
- `npm run dev` — geliştirme sunucusu (`--host` açık: aynı Wi-Fi'deki telefondan da açılır)
- `npm run build` — tip kontrolü + üretim derlemesi (`dist/`)
- `npm test` — vitest testleri (motor saflığı denetimi dahil: `src/engine` içinde Math.random/Phaser/DOM yasak)
- `npm run sim` — headless denge simülatörü (`src/sim/cli.ts`): rastgele takımlı savaşlar, iki taraf yapay zeka; sınıf kazanma oranı (hedef %40-60, ideal ~%50), kompozisyon, skill kullanımı raporu. Seçenekler: `npm run sim -- <savaş sayısı> <ilk seed>`. `tests/balance.test.ts` aynı ölçümü test olarak korur.
- Yayın: `main` dalına push → GitHub Actions test + build → GitHub Pages (`.github/workflows/deploy.yml`). Test kırmızıysa yayın olmaz.
- Debug menüsü: sağ alttaki DEBUG düğmesi (klavyede ` veya F2). Yeni özellik = `src/main.ts` içinde `debug.register(...)` ile yeni giriş.
- Debug menüsü: eylemler bölümlü (`DOCK_GROUPS` in `src/ui/debug-layout.ts`), her düğmenin ikonu + kısa işlev yazısı + tooltip'i olur; yeni debug eylemi eklenince bir bölüme konur (`tests/debug-layout.test.ts` doğrular).

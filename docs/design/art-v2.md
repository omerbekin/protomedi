# Sanat Sürüm 2 (v2): ikon, skill animasyonu ve ses yeniden tasarımı — content-designer kılavuzu

Ömer kararı: tüm karakterlerin **ses, ikon ve skill animasyonları baştan yeniden tasarlanıyor** (iyileştirme değil, yeniden tasarım;
en yüksek çözünürlük ve kalite). Eskiler (**v1**) DOKUNULMAZ ve korunur; Ömer debug > **Versions** sekmesinden karakter bazında
v1 / v2 seçip karşılaştırır. Kapsam dışı: **Cutthroat** tamamen; **Defender**'ın skill ikonları ve animasyonları (Defender **sesleri kapsamda**).

## 1. Dosya düzeni (her class kendi dosyalarında; başkasınınkine dokunma)

| Ne | Dosya | Anahtar |
|---|---|---|
| İkonlar (skill, pasif, logo) | `src/game/art-v2/<classId>/icons.ts` > `ICONS` | v1 adı: `skill.icon`, `passive.icon`, `logo` |
| v2 efektlerinin ek sprite'ları | aynı dosya > `SPRITES` | serbest ad (efektte `k.v2Sprite(c, 'ad', ...)`) |
| Skill animasyonları | `src/game/art-v2/<classId>/vfx.ts` > `VFX` | skill'in v1 `vfx` adı; vfx'i olmayan skill'de skill id'si |
| Sesler | `data/audio-v2/<classId>.json` > `sfx` | v1 ses adı (aynı adla yazılan ses v1'in yerine çalar); yeni adlar da olur |

- Her dosyanın başındaki yorum o class'ın v1 adlarını listeler (hangi anahtarı dolduracağın).
- Kayıt dosyaları (`src/game/art-v2/icons-index.ts`, `vfx-index.ts`, `audio-index.ts`) **şimdiden tüm class'lar için doludur: dokunma.**
- Çağrılar sahibine aittir: Skeleton'un skill/ikon/sesleri **undead** dosyalarında, Treant'ınkiler **druid** dosyalarında.
  Çağrı giriş sesleri de (Undead: soulDrain, earthCrack, graveMoan, boneClatter, thud; Druid: woodCreak, thud) sahibin ses dosyasından çözülür.
- Ortak öğeler (Rest/Skip/Move ikon+sesleri: rest, hourglass, boot, gasp, fistWhoosh, armorRun; durum rozetleri) `shared`
  anahtarındadır: `src/game/art-v2/shared/icons.ts`, `data/audio-v2/shared.json` (isteğe bağlı).
- Hexer bazı adları Undead/Anti-Mage ile paylaşır (soul, drainfield, voidstrike, bonethrow, wail...): sahiplik skill'e göredir,
  Hexer'ın `voidstrike`'ı Hexer dosyasında, Anti-Mage'inki Anti-Mage dosyasında ayrı çizilir.
- v2'si olmayan öğe otomatik **v1'e düşer** (yarım bitmiş class'ta oyun çökmez).

## 2. İkon nasıl çizilir (çözünürlük)

- Motor v1 ile aynı: `src/game/pixel-art.ts` (`PxGrid` + `blade`, `orb`, `flame`, `shieldShape`, `leafShape`, `sparkle`, `crystal`),
  otomatik kontur ve ışık/gölge, aynı renk jetonları (`'a'` = skill/class vurgu rengi).
- **v2 varsayılanı 128x128** ince piksel (v1 = 64x64). Koordinatlar yine **0..32 mantıksal uzayda** yazılır; 1 birim = 4 ince piksel,
  `0.25` = 1 ince piksel (ör. `g.line(..., 'w', 0.25)` tek piksellik parlama). Kontur ve ışık bandı boyutla orantılı kalınlaşır
  (128'de kontur 2 piksel) ki küçük gösterimde kaybolmasın.
- Uzun yazım: `{ draw, size: 96 | 128 | 192 | 256, logical?: 32 (ya da size = ham piksel), outline?: false }`.
- Oyunda ikon her zaman `setDisplaySize` ile sabit boyutta çizilir; yüksek çözünürlük yalnızca daha ince ayrıntı demektir.
  NEAREST filtre: 36-60 px'lik skill düğmesinde 128'lik doku küçültülerek örneklenir; 1 ince piksellik ayrıntı orada kaybolabilir,
  ana hatları en az 2 ince piksel çiz. Büyük görünüm: tooltip, wiki büyüteci.
- Çizim hata verirse uyarı basılır ve v1/yer tutucuya düşülür (çökme yok).

## 3. Animasyon (vfx) nasıl yazılır

```ts
export const VFX: Record<string, V2Vfx> = {
  whirlwind: async (c, k) => {
    await c.lunge(c.actor.container.x + 200);              // c = VfxCtx (v1 ile aynı bağlam)
    k.burst(c.scene, x, y, { colors: k.colors.BONE, n: 12 }); // k = v1 yardımcıları
    c.sfx('axeSwing');                                       // ses: skill.sfx listesi ya da kendi v2 ses dosyandaki ad
  },
};
```

- `c`: `actor`, `targets`, `centerPos`, `cells`, `slots`, `stages`/`releaseStage`, `lunge`, `windUp`, `gate`, `sfx`, `result`, `behind`, `foes`.
- `k`: `sprite`, `burst`, `ring`, `travel`, `flash`, `shake`, `wait`, `counter`, `grow`, `sprout`, `arcSlash`, `hit`, `cracks`,
  `dustCloud`, `spot`, `feet`, `slow`, `rnd`, `snap`, `DEPTH`, `colors`, `Phaser`, **`v1.<ad>(c)`** (eskiyi çağırıp üstüne eklemek için),
  **`v2Sprite(c, 'ad', renk, x, y, boyut)`** (kendi `SPRITES` çizimin).
- Promise **vuruş anında** çözülmeli (hasar rakamları o an çıkar). Efekt hata verirse savaş kilitlenmez (uyarı + devam).
- **Phaser'ı ve `../../vfx`'i çalışma zamanında import etme** (yalnızca `import type`); her şey `k` üzerinden. Test bunu denetler.
- Alan skill'i tıklanan merkez hücreye (`c.centerPos`) ve seçim göstergesinin şekline uyar; yakın dövüşçü vuracağı yere koşar.

## 4. Ses nasıl yazılır

- Şema `data/audio.json` > `sfx` ile birebir aynı (`gain` + `layers`: `tone`, `noise`, `voice`, `pluck`). Ana ses seviyesi audio.json'dan.
- Tasarım felsefesi değişmez (CLAUDE.md): medieval, gerçekçi; çan gibi çınlayan saf sinüs yok. Tepe 0,25-0,88, kırpma yok
  (dalga biçimini OfflineAudioContext ile ölç: Wiki > Assets > Sounds'taki ölçüm koduyla aynı yöntem). Kulakla onayı Ömer verir.

## 5. Doğrulama

1. `npm test` (özellikle `tests/asset-versions.test.ts`: kayıt, şema, import kuralı, v1 dondurma parmak izi) ve `npm run build`.
2. Gömülü sahne: `http://localhost:5173/gallery.html?embed=1&skill=<skillId>&ver=v2` (ya da `ver=v1`) — skill'i gerçek savaş
   sahnesinde oynatır; çubuktaki sürüm seçicisi yalnızca o sayfada geçerlidir. Slow-motion kutusu yavaş çekim.
3. Wiki > Assets > **Versions**: v1 | v2 ikonlar yan yana, sesler ♪ v1 / ♪ v2, animasyonlar Play v1 / Play v2.
4. Oyun: debug > **Versions** (ikon: iki ok) > class'ı v2 yap; savaşta ikonlar hemen, ses/animasyon bir sonraki kullanımda değişir
   ('Restart battle' her şeyi baştan kurar). Skill'i hemen denemek için debug > Skills (cast aracı) ya da Test Mode.
5. Tarayıcıda ölçüm: `window.__game.textures.getTextureKeys().filter(k => k.includes('v2:'))` v2 dokularını listeler.

## 6. v1 dondurma

`tests/fixtures/v1-art-hashes.json` var olan her v1 ikonunun, efekt sprite'ının ve sesinin parmak izini tutar. v1'e yeni ad eklemek
serbesttir; var olanı değiştirmek testi kırar (bilerek yapılırsa dosya güncellenir — Ömer'e sorulur).

## 7. ÖRNEK (silinecek)

Altyapıyı uçtan uca kanıtlamak için Warrior'ın ilk skill'ine (Double Strike) çok basit bir örnek kondu; hepsi
`ÖRNEK (EXAMPLE)` yorumuyla işaretli. **Warrior'ın v2 tasarımcısı bunları siler ya da üzerine yazar:**
- `src/game/art-v2/warrior/icons.ts`: `ICONS.sword` (128x128 kılıç) ve `SPRITES.example_spark` (96x96 parıltı),
- `src/game/art-v2/warrior/vfx.ts`: `VFX.doublestrike` (v1 efektini oynatır + hedef üstünde v2 parıltı + `exampleClang` sesi),
- `data/audio-v2/warrior.json`: `axeChop` (v1 adıyla, biraz daha pes kopya) ve `exampleClang` (v2'ye özgü yeni ad), `_example` notu.
Testler örneğe bağlı DEĞİLDİR (kendi geçici içeriklerini enjekte eder); örneği silmek ya da üzerine yazmak hiçbir testi kırmaz.
Örneği görmek için: debug > Versions > Warrior = v2, sonra Double Strike (ya da `gallery.html?embed=1&skill=melee_attack&ver=v2`).

# Asset kaynakları

| Dosya | Kaynak | Lisans |
|---|---|---|
| `backgrounds/castle-hall.webp` | Ömer tarafından sağlandı (2026-10-04) | Ömer'e sorulacak |
| `backgrounds/kings-bridge.webp` | Ömer tarafından sağlandı (2026-10-08): King's Bridge savaş arka planı (2000x729; `encounters.json > bridge_warden.background`) | Ömer'e sorulacak |
| `source/character-sheet.webp` | Ömer tarafından sağlandı (2026-10-04): 12 karakterlik sayfa | Ömer'e sorulacak |
| `characters-pool/*.png` | Yukarıdaki sayfadan `tools/slice-characters.mjs` ile kesildi (12 karakter) | Sayfayla aynı |
| `sprites/<id>/idle.png` | `characters-pool/` içinden kopyalandı (aşağıdaki eşleştirme) | Sayfayla aynı |

## Sınıf -> karakter eşleştirmesi

Görsel **sınıfa aittir**: bir sınıf oyuncu ya da düşman tarafında olsa da aynı karakteri kullanır (düşman tarafta yalnızca yatay çevrilir).

| Sprite id (= class id) | Karakter | Gerekçe |
|---|---|---|
| `warrior` | Kurt | Büyük savaş baltası, pelerin |
| `paladin` | Köpek | Kılıç ve kalkan, mavi-beyaz kutsal tabard |
| `mage` | Koyun | Mavi cübbe, çiçekli ve fenerli büyü asası |
| `undead` | Keçi | Kıvrık boynuzlar, çan asası, ritüel süsler |
| `archer` | Tavşan | Yay ve ok kılıfı |
| `druid` | Kurbağa | Yapraklı kukuleta, çiçekler, doğa asası |
| `defender` | Gergedan | Ağır zırh, pala |
| `antimage` | Zürafa | Güneş asası, sade beyaz cübbe |
| `treant` | Ömer tarafından sağlandı (2026-10-04): yosunlu, mor rünlü ağaç golemi | Çağrılan birim (`assets/source/treant.webp` kaynağı, PNG olarak kırpılıp küçültüldü) |

Kullanılmayanlar (yeni sınıflar için `characters-pool/` içinde): geyik (boynuz, yay), ayı (çekiç), yaban domuzu (dikenli sopa), inek (kova).


## Karakter görselleri v2 (2026-10-07 import)

Kaynak: Ömer'in ChatGPT ile ürettirdiği 11 karakter görseli (antimage, archer, defender, druid, gambler, mage, paladin, skeleton, treant, undead, warrior; 1254x1254 RGBA). Lisans: Ömer'e ait.
- Orijinaller: `source/characters-v2/<id>.png`.
- `sprites/<id>/idle.png`: içeriğe göre kırpılıp 640 px yüksekliğe küçültüldü (`tools/import-characters-v2.py`). Eski hayvan-karakter sprite'ları `sprites_old/<id>/idle.png` altında yedekte (gambler ve skeleton'ın eskisi yoktu; treant'ın eskisi de yedekte).
- `avatars/<id>.png`: kafa+boyun kırpması (256x256), koordinatlar aynı betikteki `HEADS` tablosunda. Savaş sıra çubuğu, sol alt blok ve takım seçimi bunları kullanır.
- Tüm karakterler sağa bakar (düşman tarafta yatay çevrilir, avatarlar dahil).
- `skeleton` ve `treant` çağrılan birimlerdir (`data/summons/`).

## Cutthroat (2026-10-08 import)

Kaynak: Ömer'in ChatGPT ile ürettirdiği Cutthroat görseli (1254x1254 RGBA, şeffaf arka plan). Lisans: Ömer'e ait.
- Orijinal: `source/characters-v2/cutthroat.png`; `sprites/cutthroat/idle.png` (640 px yükseklik) ve `avatars/cutthroat.png` (256x256 kafa) `tools/import-characters-v2.py --only cutthroat` ile üretildi (`HEADS` tablosunda `cutthroat`).
- Sağa bakar; class `cutthroat` (`data/classes/cutthroat.json > spriteId`).

## Hexer (2026-10-08 import)

Kaynak: Ömer'in ChatGPT ile ürettirdiği iki Hexer görseli (1254x1254, arka plan zaten şeffaf; WebP'den PNG'ye çevrildi). Lisans: Ömer'e ait.
- Orijinaller: `source/characters-v2/hexer.webp|png` (kapüşonsuz, VARSAYILAN) ve `hexer-hood.webp|png` (kapüşonlu).
- `sprites/hexer/idle.png` + `avatars/hexer.png` (kapüşonsuz); `sprites/hexer/idle-hood.png` + `avatars/hexer-hood.png` (kapüşonlu varyant). `tools/import-characters-v2.py --only hexer` ile üretildi; iki görünüm AYNI kırpma kutusunu kullanır (aynı ölçek ve ayak hizası).
- Varyant altyapısı: `sprites/<id>/idle-<varyant>.png` + `avatars/<id>-<varyant>.png`; debug > Characters bölümünden seçilir. Sağa bakar.

## The Bridge Warden + Iron Mooring (2026-10-08 import; King's Bridge boss)

Kaynak: Ömer'in ChatGPT ile ürettirdiği iki görsel (arka plan şeffaf; WebP'den PNG'ye çevrildi; prompt `docs/design/bosses/bridge-warden.md` 7.5). Lisans: Ömer'e ait.
- Orijinaller: `source/characters-v2/bridge_warden.webp|png` (1254x1254, sağa bakar; sol kolda zincir, sağ elde çapa) ve `iron_mooring.webp|png` (1536x1024, zincir sola uzanır).
- `sprites/bridge_warden/idle.png` (643x640) + `avatars/bridge_warden.png` (yüz ızgarası + göğüs çatlağı); `sprites/iron_mooring/idle.png` (924x640; genişlik < 1,5 x yükseklik, tek kare; yatay AYNALI: düşman tarafında çevrilince zincir önündeki Warden'a uzanır, `FLIP_SPRITE`) + `avatars/iron_mooring.png` (palamar başı + sarılı zincir). `tools/import-characters-v2.py --only bridge_warden|iron_mooring` ile üretildi (`HEADS`).

## Sefer haritası arka planı (campaign)
Kaynak: Ömer'in ChatGPT ile ürettirdiği yazısız Valdoria haritası (`campaign/valdoria-bg.webp`, 1672x941, 16:9; referans: `docs/design/campaign/valdoria-map-reference.webp`, prompt `docs/design/campaign/campaign.md` 6.1). Lisans: Ömer'e ait. Harita sahnesi (`src/game/scenes/CampaignMapScene.ts`) ve ana menü arka planı olarak kullanılır; düğüm, yol, etiket ve sis üstüne kodla çizilir.

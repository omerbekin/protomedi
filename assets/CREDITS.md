# Asset kaynakları

| Dosya | Kaynak | Lisans |
|---|---|---|
| `backgrounds/castle-hall.webp` | Ömer tarafından sağlandı (2026-10-04) | Ömer'e sorulacak |
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

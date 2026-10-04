# Asset kaynakları

| Dosya | Kaynak | Lisans |
|---|---|---|
| `backgrounds/castle-hall.jpg` | Ömer tarafından sağlandı (2026-10-04) | Ömer'e sorulacak |
| `source/character-sheet.webp` | Ömer tarafından sağlandı (2026-10-04): 12 karakterlik sayfa | Ömer'e sorulacak |
| `characters-pool/*.png` | Yukarıdaki sayfadan `tools/slice-characters.mjs` ile kesildi (12 karakter) | Sayfayla aynı |
| `sprites/<id>/idle.png` | `characters-pool/` içinden kopyalandı (aşağıdaki eşleştirme) | Sayfayla aynı |

## Sınıf -> karakter eşleştirmesi

| Sprite id | Karakter | Gerekçe |
|---|---|---|
| `warrior` | Kurt | Büyük savaş baltası, pelerin |
| `paladin` | Köpek | Kılıç ve kalkan, mavi-beyaz kutsal tabard |
| `mage` | Koyun | Mavi cübbe, çiçekli ve fenerli büyü asası |
| `undead` | Keçi | Kıvrık boynuzlar, çan asası, ritüel süsler |
| `enemy_warrior` | Gergedan | Ağır zırh ve pala |
| `enemy_archer` | Tavşan | Yay ve ok kılıfı |
| `enemy_mage` | Zürafa | Altın güneş asası |
| `enemy_druid` | Kurbağa | Yapraklı kukuleta, çiçekler, doğa asası |
| `treant` | (yok, placeholder ağaç) | Yürüyen ağaca uyan karakter yok |

Kullanılmayanlar (yeni sınıflar için havuzda): ayı (çekiç), yaban domuzu (dikenli sopa), geyik (boynuz, yay), inek (kova).

# Valdoria x2: iki kat düğümlü sefer haritası (ŞABLON, Ömer onayı bekliyor)

> **Durum: YALNIZCA ÖNERİ (campaign-dev, 2026-10-10).** Oyun verisi (`data/campaign/*.json`) DEĞİŞMEDİ. Görsel şablon: `public/mockups/valdoria-2x.html` (yayında `/protomedi/mockups/valdoria-2x.html`): geniş Valdoria haritası üstünde bugünkü düğümler (altın halka) ve önerilen yeniler (kor rengi halka + NEW), yollar, tür lejantı; düğümün üstüne gelince adı, türü, durak numarası ve notu. Not: oyun artık x2 stat ölçeğinde (`formulas.json > statScale` 2, commit d3276ea); bu belgedeki sayılar oran / seviye olduğu için etkilenmez.

## 1. Özet

| | Bugün | Öneri |
|---|---|---|
| Haritadaki durak | 17 | **34** (17 yeni) |
| Bir seferde geçilen durak | 12 | **23** (12 rotanın hepsi eşit uzunlukta) |
| Seçim noktası | 3 (Ashford sonrası 2'li, Valdren sonrası 3'lü, Ashen Plain sonrası 2'li) | aynı 3 seçim noktası, dallar uzadı; rota sayısı yine **12** |
| Boss | 2 (King's Bridge, Castle Morvane) | **2** (aynı) |
| Elit | 3 | **5** (+Old Quarry, +Morvane's Outworks) |
| Art arda savaşsız durak (K2 kuralı) | en çok 2 | en çok **2** (korunuyor) |

**Eski düğümlerin hepsi aynı id ve aynı konumda kalır** (eski kayıtlar geçerli düğüme işaret eder; bkz. 8). Yeni düğümler eski düğümlerin ARASINA girer ve dalları uzatır.

## 2. Düğüm tablosu

Durak = başlangıçtan bu düğüme kadar kaçıncı durak (her rota 23 durak). Bağlantı = çıkış kenarları.

| id | Ad (oyun içi) | Tür | Bölge | Durak | Bağlantı | Not |
|---|---|---|---|---|---|---|
| 1 | Mill Road | battle | I | 1 | 1a | Start · Battle |
| 1a **(YENİ)** | Fisher's Cove | event | I | 2 | 2 | Olay · kıyı köyü (tutorial: olayları öğretir) |
| 2 | Ravenwood | battle | I | 3 | 2a | Battle · Outlaw Pack |
| 2a **(YENİ)** | Woodcutter's Clearing | battle | I | 4 | 3 | Savaş · orman haydutları (2 kişilik takım) |
| 3 | Ruined Watchtower | elite | I | 5 | 4 | Elite · Bandit Chief |
| 4 | Ashford Village | town | I | 6 | 4a | Town · Rest, Recruits |
| 4a **(YENİ)** | Ashford Ford | battle | I | 7 | 5A, 5B | Savaş · yeni bölüğün ilk savaşı (zorunlu) |
| 5A | Misty Marsh | battle | II | 8 | 5A2 | Battle · Bog Ambush |
| 5B | Iron Pass | battle | II | 8 | 5B2 | Battle · Ambush |
| 5A2 **(YENİ)** | Reed Ferry | rest | II | 9 | 6A | Dinlenme noktası (çeşme) · YENİ TÜR, soru 1 |
| 5B2 **(YENİ)** | Shepherd's Watch | event | II | 9 | 6B | Olay · dağ yolu |
| 6A | Witch's Hut | event | II | 10 | 6A2 | Event · Cursed Merchant |
| 6B | Dwarven Mine | treasure | II | 10 | 6B2 | Treasure · Guarded |
| 6A2 **(YENİ)** | Bog Hollow | battle | II | 11 | 7 | Savaş · bataklık yaratıkları |
| 6B2 **(YENİ)** | Old Quarry | elite | II | 11 | 7 | Elit · taş ocağı ustası |
| 7 | Valdren Keep | town | II | 12 | 8A, 8B, 8C | City · Rest, Recruits |
| 8A | St. Brann's Abbey | treasure | II | 13 | 8A2 | Treasure · Relic Vault |
| 8B | Mercenary Camp | battle | II | 13 | 8B2 | Battle · Gold |
| 8C | Black Cathedral | elite | II | 13 | 8C2 | Elite · The Undying |
| 8A2 **(YENİ)** | Pilgrim Road | battle | II | 14 | 8M | Savaş · yol kesiciler |
| 8B2 **(YENİ)** | Crossroads Market | merchant | II | 14 | 8M | Tüccar · YENİ TÜR, soru 2 |
| 8C2 **(YENİ)** | Grave Field | battle | II | 14 | 8M | Savaş · mezarlık |
| 8M **(YENİ)** | Riverside Camp | rest | II | 15 | 9 | Dinlenme noktası (boss öncesi; madde 264'ün çözümü) · soru 1 |
| 9 | King's Bridge | boss | II | 16 | 9a | Boss · The Bridge Warden |
| 9a **(YENİ)** | Burned Hamlet | event | III | 17 | 10 | Olay · köprü sonrası |
| 10 | Ashen Plain | battle | III | 18 | 11A, 11B | Battle · Cursed Ground |
| 11A | Dragon's Spine | elite | III | 19 | 11A2 | Elite · Hidden Entrance |
| 11B | Siege Line | battle | III | 19 | 11B2 | Battle |
| 11A2 **(YENİ)** | Frozen Pass | battle | III | 20 | 11A3 | Savaş · donmuş geçit |
| 11B2 **(YENİ)** | Forward Camp | merchant | III | 20 | 11B3 | Tüccar + dinlenme (son kasaba yerine) · soru 2 |
| 11A3 **(YENİ)** | Ice Cave | treasure | III | 21 | 12a | Hazine (korumasız sandık) |
| 11B3 **(YENİ)** | Morvane's Outworks | elite | III | 21 | 12a | Elit · kale önü tahkimatı |
| 12a **(YENİ)** | Gate of Cinders | battle | III | 22 | 12 | Savaş · kale kapısı (zorunlu, finalden önce) |
| 12 | Castle Morvane | boss | III | 23 | — | Final Boss |

## 3. Rota grafı ve seçim noktaları

```
I · The Borderlands (tutorial, tek yol)
  1 Mill Road -> 1a Fisher's Cove -> 2 Ravenwood -> 2a Woodcutter's Clearing -> 3 Ruined Watchtower -> 4 Ashford Village -> 4a Ashford Ford
                                                                                                                   |
II · Valdren Vale                                                                                     SEÇİM 1 (2 dal, 4'er durak)
  güney: 5A Misty Marsh -> 5A2 Reed Ferry (dinlenme) -> 6A Witch's Hut -> 6A2 Bog Hollow ----------\
  kuzey: 5B Iron Pass -> 5B2 Shepherd's Watch -> 6B Dwarven Mine (korunan hazine) -> 6B2 Old Quarry (elit) -> 7 Valdren Keep
                                                                                                   SEÇİM 2 (3 dal, 2'şer durak)
  kuzey: 8A St. Brann's Abbey (korunan hazine) -> 8A2 Pilgrim Road -----\
  orta:  8B Mercenary Camp -> 8B2 Crossroads Market (tüccar) -------------> 8M Riverside Camp (dinlenme) -> 9 King's Bridge (BOSS)
  güney: 8C Black Cathedral (elit) -> 8C2 Grave Field ------------------/
III · The Northern Heights
  9 -> 9a Burned Hamlet -> 10 Ashen Plain                              SEÇİM 3 (2 dal, 3'er durak)
  kuzey: 11A Dragon's Spine (elit) -> 11A2 Frozen Pass -> 11A3 Ice Cave (hazine) ------\
  doğu:  11B Siege Line -> 11B2 Forward Camp (tüccar + dinlenme) -> 11B3 Morvane's Outworks (elit) -> 12a Gate of Cinders -> 12 Castle Morvane (FİNAL BOSS)
```

- Dal karakterleri (risk / ödül): seçim 1'de güney daha yumuşak (dinlenme + olay), kuzey daha zor ama ödüllü (korunan hazine + elit). Seçim 3'te kuzey: elit + sandık, doğu: tüccar/dinlenme + elit.
- Bugünkü kural aynen: seçilen yol kilitlenir (serbest dolaşım ayrı iş, roadmap aşama 5a).

## 4. Tür dağılımı

| Tür | Bugün | Yeni | Toplam |
|---|---|---|---|
| Battle | 7 | +7 | 14 |
| Elite | 3 | +2 | 5 |
| Boss | 2 | 0 | 2 |
| Treasure (korunan / korumasız) | 2 | +1 | 3 |
| Event | 1 | +3 | 4 |
| Town / City | 2 | 0 | 2 |
| Rest point (YENİ TÜR, soru 1) | 0 | +2 | 2 |
| Merchant (YENİ TÜR, soru 2) | 0 | +2 | 2 |
| **Toplam** | **17** | **+17** | **34** |

Yeni 17'nin 9'u savaşlı (7 savaş + 2 elit), 8'i savaşsız (3 olay, 1 hazine, 2 dinlenme, 2 tüccar): "yarısı savaş, yarısı savaşsız" hedefi. Bir rotada ~13-14 savaş (bugün ~8-9).

## 5. Takım büyümesi (değişmiyor)

| Durak | Ne olur | Takım |
|---|---|---|
| 1 Mill Road (durak 1) | kahraman seçimi (tutorial lideri) | 1 |
| 2 Ravenwood (durak 3) | aday seç (biri alan saldırılı) | 2 |
| 4 Ashford Village (durak 6) | tutorial takımı veda eder (item'leri torbaya + teslim kartı), yeni bölük (3 sınıf) | 3 |
| 7 Valdren Keep (durak 12) | ayrılırken gönüllü (aday seç) | 4 |

Yeni olan: tutorial 2 duraklık uzar (1a olay, 2a 2 kişilik takımla savaş) ve yeni bölük Ashford'dan hemen sonra zorunlu bir ilk savaş (4a Ashford Ford) yapar. Dördüncü kahraman yine yolun yarısında (durak 12) katılır.

## 6. Zorluk ve item seviyesi eğrisi

Kod bugünkü kuralla kendiliğinden uyar: item seviyesi ve düşman ölçeği düğümün **derinliğine** (başlangıçtan en kısa yol / finale en kısa yol) bağlı (`src/campaign/power.ts`). Derinlik paydası 11'den 22'ye çıkar, eğri yumuşar:

| Durak | Örnek düğüm | Item seviyesi (ilvl) | Düşman ölçeği (item telafisi, ölçülen +%8 x 0,8) |
|---|---|---|---|
| 1 | Mill Road | 1 | x1,000 |
| 4 | Woodcutter's Clearing | 2 | x1,009 |
| 7 | Ashford Ford | 3 | x1,017 |
| 12 | Valdren Keep | 6 | x1,032 |
| 16 | King's Bridge (boss) | 7 | x1,044 |
| 19 | Dragon's Spine / Siege Line | 8 | x1,052 |
| 23 | Castle Morvane | 10 | x1,064 |

- **Can taşıma** aynı (zafer +%20, düşen %20 ile kalkar, boss sonrası tam). Savaş sayısı neredeyse ikiye katlandığı için yıpranma artar: iki dinlenme noktası (5A2 güney dalda, 8M boss öncesi her rotada) ve Forward Camp bunun karşılığı (soru 1). Valdren Keep ve Ashford tam iyileştirmeye devam eder.
- **Loot:** savaş sayısı arttığı için item gücü bölüm sonunda ölçülen ~+%8'den hedeflenen +%15'e yaklaşır (items.md madde 280 öngörüsü); harita gelince `power-budget.json > chapters[0].measured.item` sim ile yeniden ölçülür.
- **Denge hedefleri** (`data/campaign/balance.json`) kategori başına aynı kalır; balance-tester yeni haritayla `npm run sim:campaign` ölçer.

## 7. Gereken yeni içerik (mevcut sınıflardan)

**Karşılaşmalar (encounters.json; hepsi mevcut sınıflar):**

| Düğüm | Karşılaşma önerisi | Birimler |
|---|---|---|
| 2a Woodcutter's Clearing | `woodcutter_bandits` (2 kişilik takım, ultimate kilitli) | Cutthroat, Archer |
| 4a Ashford Ford | `ford_raiders` (yeni bölüğün ilk savaşı) | Warrior, Archer, Cutthroat |
| 6A2 Bog Hollow | `bog_hollow` | Druid, Warrior, Hexer |
| 6B2 Old Quarry (elit) | `quarry_master`: lider Defender "Quarry Master" (elite) | Defender*, Warrior, Archer, Archer |
| 8A2 Pilgrim Road | `pilgrim_road_bandits` | Cutthroat, Archer, Gambler, Warrior |
| 8C2 Grave Field | `grave_field` | Undead, Undead, Hexer, Defender |
| 11A2 Frozen Pass | `frozen_pass` | Mage, Druid, Archer, Defender |
| 11B3 Morvane's Outworks (elit) | `outworks_captain`: lider Paladin "Outworks Captain" (elite) | Paladin*, Defender, Archer, Mage |
| 12a Gate of Cinders | `gate_of_cinders` | Defender, Paladin, Undead, Archer |

**Olay / hazine metinleri (events.json):** Fisher's Cove, Shepherd's Watch, Burned Hamlet (olaylar bugünkü gibi metin; seçenekli olaylar ayrı iş), Ice Cave (korumasız sandık: loot kuralı aynı).

**Yeni düğüm türleri (soru 1-2 cevaplanınca):** `rest` ve `merchant` için NodeType, harita glifi (şablonda öneri glifleri: çeşme ve kese), adım (step) ve ekran.

**Diğer:** `valdoria.json > stopsPerRun` 23, blurb metni, wiki Campaign makalesi, `tests/campaign*.test.ts` (rota sayısı 12, durak 23, K1/K2), sefer sim'i ve balance testleri.

## 8. Kayıt göçü planı

Eski kayıt: `path` eski düğüm id'leri (örn. 1, 2, 3, 4, 5A, 6A, 7...), `at` = bulunulan düğüm, `done` = tamamlanan adımlar.

1. **Bütün eski id'ler korunduğu için** `at` her zaman geçerli bir düğümdür; `isValidState` bugünkü hâliyle geçer (yalnızca id varlığını denetler).
2. **İleri yol yeni grafa göre devam eder:** örn. Ravenwood'u bitirmiş oyuncunun sonraki durağı Woodcutter's Clearing (2a); Valdren'den 8B'ye geçmiş oyuncu sonra 8B2 ve 8M'den geçer. Ek kod gerekmez (`nextStep` çıkış kenarlarını okur).
3. **Geride kalan yeni düğümler** (oyuncunun çoktan geçtiği yerlere eklenenler, örn. 1a, 2a, 4a) "atlandı" sayılır: oynanmaz, ödül vermez, sis/çizimde geçilmiş görünür. Uygulama: sefer durumu sürüm 3 -> 4; yüklemede `path`'teki ardışık iki eski düğüm arasında yeni grafta kalan düğümler `skipped` listesine yazılır (yalnızca çizim ve durak sayacı için).
4. **Durak sayacı** (`Stop n / 23`) `path.length` yerine grafik derinliğinden hesaplanır (göç edilen kayıtta da doğru sayı).
5. **Kayıt tarihi:** eski kayıttaki `lootState.clears` ve item'ler aynen kalır; yeni düğümlerin loot seed'i kendi id'siyle türetilir (çakışma yok).
6. **Test:** her eski düğümde bekleyen bir v3 kaydı yüklenir, sonraki adım geçerli ve finale ulaşılabilir; Ironman ve Normal aynı.
Alternatif (daha basit): devam eden eski seferler eski 17 duraklık haritada biter, yeni seferler x2 haritayı alır (iki harita verisi birlikte tutulur). Öneri yukarıdaki göç (tek harita).

## 9. Ömer'e sorular (YENİ mekanikler; karar verilmedi)

1. **Dinlenme noktası / çeşme (Rest point):** bedava mı, altınla mı? Ne kadar iyileştirir (ör. herkes +%30 / +%50 / tam)? Düşenleri kaldırır mı? Tek kullanımlık mı? (Şablonda 2 tane: Reed Ferry, Riverside Camp; Forward Camp'ta da dinlenme.)
2. **Seferde tüccar (Merchant):** altının seferde harcanacak yeri yok (Endless'ta Odo var). Seferde Endless'taki tüccar ekranı (al / sat %50 / geri alım) kullanılsın mı? Stok düğümün item seviyesinde mi, kaç parça, yenilenir mi? Şablonda 2 tüccar (Crossroads Market, Forward Camp); kasabalara (Ashford, Valdren Keep) da tüccar eklensin mi?
3. **Başka yeni düğüm türü:** önerim şimdilik YOK (olay, hazine, dinlenme, tüccar yeterli). Ama aday fikirler: Shrine (altınla sonraki savaşa küçük güçlendirme), Scout Tower (sisi açar), Lair (mini-elit, set parçası düşürür). İstenen var mı?
4. Tutorial 2 durak uzuyor (Fisher's Cove olayı + Woodcutter's Clearing savaşı): uygun mu, yoksa tutorial bugünkü 4 durakta mı kalsın?
5. Sefer süresi neredeyse iki katına çıkıyor (~13-14 savaş): uygun mu? (Ömer'in "daha sık Valdoria" isteğiyle uyumlu.)
6. Eski kayıtlar: göç (öneri) mi, yoksa devam eden seferler eski haritada mı bitsin?

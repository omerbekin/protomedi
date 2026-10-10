# Valdoria x2: iki kat düğümlü sefer haritası (ŞABLON, Ömer onayı bekliyor)

> **Durum: YALNIZCA ÖNERİ (campaign-dev, 2026-10-10).** Oyun verisi (`data/campaign/*.json`) DEĞİŞMEDİ. Görsel taslak (2026-10-10 itibarıyla TEK sayfa, varyant seçicili): `public/mockups/valdoria-map.html` (yayında `/protomedi/mockups/valdoria-map.html`; eski `valdoria-2x.html` bunun 2. varyantı oldu ve silindi). Ayrıntı: bölüm 10 "Yayılmış varyantlar". Not: oyun artık x2 stat ölçeğinde (`formulas.json > statScale` 2, commit d3276ea); bu belgedeki sayılar oran / seviye olduğu için etkilenmez.

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

## 10. Yayılmış varyantlar (Ömer geri bildirimi 2026-10-10: "düğümler çok sıkışık"; 2. tur: HUD'sız alan, eğitim sabit, adlar araziye uygun)

**Taslak sayfa:** `public/mockups/valdoria-map.html` (yayında `/protomedi/mockups/valdoria-map.html`; `#v1` ... `#v5` doğrudan o varyantı açar). Oyun verisi DEĞİŞMEDİ. Sayfa canlı sefer haritasını taklit eder: dünya birimi = eski 16:9 harita bölgesi (1920 x 1080), sahne yüksekliği 1080 birim, yakınlaştırma 1,0-1,4, kaydırma; düğüm yarıçapı 24 (boss 30), boyalı düğüm ikonları, ad 15 birim Cinzel, dokunma alanı 96 birim çap; HUD taklidi `CampaignMapScene.renderHud` ölçüleriyle. Araçlar (oyunda yok): Home view 1.0x, Overview, HUD overlay, Phone labels 24, Tap areas, Mark collisions. Sol panelde (Party sütununun yerinde, haritayı örtmez): durak / sefer başına durak / rota / seçim, karışım ve ölçümler. **HUD overlap**, ev görünümünde ve 1,0x'te, 16:9 ve 21:9 için ayrı ölçülür; düğüm diski, ad kutusu ve yol eğrisi gerçek yazı genişliğiyle denetlenir ve HUD'a giren adlar mavi kesik çerçeveyle işaretlenir. Diğer ölçümler: yazı çakışması (kırmızı), en yakın iki düğüm, dokunma hedefi. Düğümün üstüne gelince arazi notu da görünür.

### 10.1 Sert kurallar (Ömer, 2. tur) ve nasıl ölçüldü
1. **HUD'a binme yok:** 1,0x'te 16:9 ve 21:9 masaüstünde hiçbir düğüm, ad ya da yol şunların altında değil: Party sütunu, düğüm kartı, üst bant, alt kontroller, lejant, Menu.
   - Ölçüm "ev görünümü"nde yapılır: kamera ortası 960, 540 (haritanın bugünkü varsayılanı). Görünen dünya 16:9'da 0-1920, 21:9'da -300-2220.
   - 16:9'daki HUD'sız alan T biçiminde: orta sütun (x 488-1412, y 120-720) ve alt şerit (tüm genişlik, y 720-990; alt kontroller ve lejant hariç).
   - 21:9 alanı 16:9'unkini kapsar; 16:9'da temiz olan 21:9'da da temiz.
2. **Eğitim aynen:** Mill Road -> Ravenwood -> Ruined Watchtower -> Ashford Village (valdoria.json 1-4): aynı sıra, aynı sayı, **bugünkü konumlarında** (dördü de zaten HUD'sız alanda). Önceki turda eğitime eklenen Fisher's Cove ve Woodcutter's Clearing çıkarıldı.
3. **Ad = arazi:** her düğümün altındaki görsel kontrol edildi (tablolardaki "Arazi" sütunu).
   - Misty Marsh bataklık havuzlarında.
   - King's Bridge tam nehrin üstünde, yolun nehri geçtiği yerde. Görselde çizili köprü ya da sığ geçit YOK; düğümün kendisi geçiş noktası.
   - Iron Pass iki karlı tepenin arasındaki geçitte; Dwarven Mine ve Old Quarry dağ yamacında; St. Brann's Abbey yüksek dağda.
   - Mercenary Camp orman açıklığında; Thornwood Hollow ve Hermit's Cache güneydoğu ormanında.
   - Yollar dağları yalnızca Iron Pass'ten (ve dağdaki maden / ocak / manastıra çıkan yamaçtan) geçer.
   - Nehri yalnızca King's Bridge'deki yollar geçer (otomatik denetim: nehri geçen başka yol 0).

### 10.2 Takas (Ömer'e açıklama)
- **HUD'sız alan küçük:** 16:9'da yalnızca yaklaşık 920 x 600 + 1900 x 270 birim, yani eski 16:9 haritanın içi.
  - Geniş görselin doğusu (boyanmış ek bölge) ev görünümünde HUD'un altında ya da ekran dışında kalıyor.
  - Bu yüzden kuralı tam sağlayan haritalar küçük: A 22 durak, B 19 durak. Önceki turdaki 25'lik planlar bu alana sığmadı; yazı çakışması ve iç içe yollar çıktı.
- **Kural yalnızca kamera sabitse anlamlı:** bugün kamera bulunulan düğüme kayıyor. O zaman HUD'sız alana konmuş bir harita da kenara kayınca HUD altına girer.
  - Önerim: 1,0x = sabit ev görünümü (kaydırma gerekmez); 1,2-1,4x'te kaydırma serbest.
  - Bu bir arayüz değişikliği; karar Ömer'in.
- **Spread 32 (pan) bilerek kuralı çiğneyen karşılaştırma:**
  - Son önerinin içeriği (eğitim bugünkü gibi, 32 durak) bütün geniş haritaya yayıldı.
  - Ev görünümünde HUD'a binen öğe sayısı 34 (16:9) / 21 (21:9); her düğüm kaydırınca HUD'sız alana gelir.
  - Bugünkü harita (Current) bile ev görünümünde 15 (16:9) / 6 (21:9) öğeyle HUD'a biniyor.
- **Telefon:** HUD orada "compact" (alt kontroller 92 birim, düğüm kartı daha aşağıdan başlar).
  - A ve B'de doğudaki 3-4 düğüm (Ashen Plain, Siege Line, Forward Camp, Gate of Cinders) telefonda düğüm kartının altına düşüyor. Kartın katlanması ya da o bölgede kaydırma gerekir.
  - 24 birimlik telefon adlarıyla A'da 13, B'de 7 yazı çakışması var (alan dar). Telefonda yalnızca bulunulan / seçilebilir / seçili düğümün adı gösterilmeli.
  - Dokunma hedefi 1,0x'te yaklaşık 35 px, 1,4x'te yaklaşık 49 px.

### 10.3 Ölçümler (tarayıcıda, ev görünümü, 1,0x)

| # | Varyant | Haritada / sefer başına | Rota / seçim | HUD overlap 16:9 / 21:9 | Yazı çakışması masaüstü / telefon 24 | En yakın iki düğüm |
|---|---|---|---|---|---|---|
| 1 | Current | 17 / 12 | 12 / 3 | 15 / 6 | 0 / 5 | 129 |
| 2 | Last proposal | 34 / 23 | 12 / 3 | 35 / 12 | 15 / 32 | 72 |
| 3 | Spread 32 (pan) | 32 / 21 | 12 / 3 | 34 / 21 (kaydırmalı, bilerek) | 0 / 26 | 109 |
| 4 | **Spread A** | **22 / 16** | 8 / 3 | **0 / 0** | 0 / 13 | 112 |
| 5 | **Spread B** | **19 / 15** | 16 / 4 | **0 / 0** | 0 / 7 | 131 |

- **Spread A:**
  - Eğitim.
  - Seçim 1: kuzey Iron Pass (geçit) -> Dwarven Mine (dağ) / güney Misty Marsh (bataklık) -> Witch's Hut.
  - Valdren Keep (nehir kıyısı tarlaları).
  - Seçim 2: kuzey Pilgrim Road -> St. Brann's Abbey (dağ) / güney Black Cathedral -> Grave Field.
  - Riverside Camp (dinlenme) -> **King's Bridge (nehrin üstü, boss)** -> Ashen Plain.
  - Seçim 3: Thornwood Hollow (elit, orman) -> Hermit's Cache / Siege Line -> Forward Camp (tüccar).
  - Gate of Cinders -> Castle Morvane (doğu kırı).
  - Karışım: 9 savaş, 3 elit, 2 boss, 2 kasaba, 1 olay, 3 hazine, 1 dinlenme, 1 tüccar. K2 korunur.
  - Önceki turdan çıkanlar: Fisher's Cove (eğitimdeydi), Mercenary Camp ve Crossroads Market (seçim 2'nin 3. kolu sığmadı).
- **Spread B:**
  - Eğitim -> [Iron Pass | Misty Marsh] -> Valdren Keep -> [Old Quarry (elit, dağ) | Crossroads Market] -> Mercenary Camp (orman açıklığı).
  - Riverside Camp -> King's Bridge -> [Burned Hamlet (nehrin güneyi) | Ashen Plain] -> Siege Line -> [Forward Camp | Thornwood Hollow] -> Gate of Cinders -> Castle Morvane.
  - Karışım: 8 savaş, 3 elit, 2 boss, 2 kasaba, 1 olay, 0 hazine, 1 dinlenme, 2 tüccar. K2 korunur.
- **Yeniden adlandırmalar (araziye uymayan eski adlar):**

  | Eski ad | Yeni ad | Varyant | Neden |
  |---|---|---|---|
  | Dragon's Spine | **Thornwood Hollow** | A, B | Nehrin doğusunda dağ yok, orman var |
  | Ice Cave | **Hermit's Cache** | A | Aynı neden |
  | Ashford Ford | **Ashford Road** | Spread 32 | Orada nehir ya da geçit yok |
  | Bog Hollow | **Fallow Fields** | Spread 32 | Düğüm tarlada |

  Castle Morvane A ve B'de doğu kırında (dağ, ev görünümünde HUD'un altında kalıyor); Spread 32'de kuzeydoğu yüksek dağlarında.
- **Açık sorular (Ömer):**
  - A mı, B mi, yoksa kaydırmalı büyük harita (Spread 32 + 1,0x'te kaydırmayı kabul etmek) mı?
  - 1,0x'te kamera ev görünümüne sabitlensin mi?
  - Telefonda düğüm kartı katlansın ve yalnızca ilgili düğümlerin adı mı gösterilsin?

#### Spread A (22 durak): düğüm listesi (pos = valdoria.json birimi)

| id | Ad | Tür | Durak | pos | Yazı | Arazi | Bağlantı |
|---|---|---|---|---|---|---|---|
| mill | Mill Road | battle | 1 | [0.146, 0.846] | altta | eğitim, bugünkü konum | raven |
| raven | Ravenwood | battle | 2 | [0.276, 0.727] | altta | eğitim, bugünkü konum | watch |
| watch | Ruined Watchtower | elite | 3 | [0.339, 0.591] | üstte | eğitim, bugünkü konum | ash |
| ash | Ashford Village | town | 4 | [0.414, 0.643] | altta | eğitim, bugünkü konum | iron, marsh |
| iron | Iron Pass | battle | 5 | [0.453, 0.435] | altta | pass between the two snow peaks | mine |
| marsh | Misty Marsh | battle | 5 | [0.453, 0.782] | altta | marsh pools | witch |
| mine | Dwarven Mine | treasure | 6 | [0.542, 0.382] | üstte | east slope of the snow peak | valdren |
| witch | Witch's Hut | event | 6 | [0.508, 0.682] | altta | marsh edge | valdren |
| valdren | Valdren Keep | town | 7 | [0.547, 0.540] | üstte | fields by the river | pilgrim, cath |
| pilgrim | Pilgrim Road | battle | 8 | [0.599, 0.403] | altta | road under the forest | abbey |
| cath | Black Cathedral | elite | 8 | [0.570, 0.641] | üstte | fields | grave |
| abbey | St. Brann's Abbey | treasure | 9 | [0.657, 0.235] | altta | mountain abbey | river |
| grave | Grave Field | battle | 9 | [0.625, 0.529] | altta | fields | river |
| river | Riverside Camp | rest | 10 | [0.687, 0.509] | üstte | river bank | bridge |
| bridge | King's Bridge | boss | 11 | [0.677, 0.628] | altta | ON the river (the crossing) | ashen |
| ashen | Ashen Plain | battle | 12 | [0.760, 0.731] | altta | open grass east of the river | thorn, siege |
| siege | Siege Line | battle | 13 | [0.844, 0.722] | altta | grass | camp |
| thorn | Thornwood Hollow | elite | 13 | [0.688, 0.815] | altta | south-east forest | cache |
| camp | Forward Camp | merchant | 14 | [0.932, 0.731] | altta | grass | gate |
| cache | Hermit's Cache | treasure | 14 | [0.771, 0.864] | altta | forest | gate |
| gate | Gate of Cinders | battle | 15 | [0.859, 0.838] | altta | forest edge | castle |
| castle | Castle Morvane | boss | 16 | [0.938, 0.858] | altta | eastern moor | — |

#### Spread B (19 durak): düğüm listesi (pos = valdoria.json birimi)

| id | Ad | Tür | Durak | pos | Yazı | Arazi | Bağlantı |
|---|---|---|---|---|---|---|---|
| mill | Mill Road | battle | 1 | [0.146, 0.846] | altta | eğitim, bugünkü konum | raven |
| raven | Ravenwood | battle | 2 | [0.276, 0.727] | altta | eğitim, bugünkü konum | watch |
| watch | Ruined Watchtower | elite | 3 | [0.339, 0.591] | üstte | eğitim, bugünkü konum | ash |
| ash | Ashford Village | town | 4 | [0.414, 0.643] | altta | eğitim, bugünkü konum | iron, marsh |
| iron | Iron Pass | battle | 5 | [0.453, 0.435] | altta | pass between the two snow peaks | valdren |
| marsh | Misty Marsh | battle | 5 | [0.453, 0.782] | altta | marsh pools | valdren |
| valdren | Valdren Keep | town | 6 | [0.528, 0.593] | altta | fields | quarry, market |
| quarry | Old Quarry | elite | 7 | [0.557, 0.417] | altta | east snow peak | merc |
| market | Crossroads Market | merchant | 7 | [0.613, 0.527] | altta | fields at the crossroads | merc |
| merc | Mercenary Camp | battle | 8 | [0.661, 0.380] | altta | forest clearing | river |
| river | Riverside Camp | rest | 9 | [0.688, 0.506] | üstte | river bank | bridge |
| bridge | King's Bridge | boss | 10 | [0.677, 0.628] | altta | ON the river (the crossing) | hamlet, ashen |
| ashen | Ashen Plain | battle | 11 | [0.760, 0.713] | altta | open grass | siege |
| hamlet | Burned Hamlet | event | 11 | [0.651, 0.750] | altta | fields south of the river | siege |
| siege | Siege Line | battle | 12 | [0.803, 0.815] | altta | forest edge | camp, thorn |
| camp | Forward Camp | merchant | 13 | [0.871, 0.709] | altta | grass | gate |
| thorn | Thornwood Hollow | elite | 13 | [0.866, 0.861] | altta | south-east forest | gate |
| gate | Gate of Cinders | battle | 14 | [0.941, 0.735] | altta | grass | castle |
| castle | Castle Morvane | boss | 15 | [0.948, 0.861] | üstte | eastern moor | — |

#### Spread 32 (pan; 32 durak): düğüm listesi (pos = valdoria.json birimi)

| id | Ad | Tür | Durak | pos | Yazı | Arazi | Bağlantı |
|---|---|---|---|---|---|---|---|
| 1 | Mill Road | battle | 1 | [0.146, 0.846] | altta | eğitim, bugünkü konum | 2 |
| 2 | Ravenwood | battle | 2 | [0.276, 0.727] | altta | eğitim, bugünkü konum | 3 |
| 3 | Ruined Watchtower | elite | 3 | [0.339, 0.591] | üstte | eğitim, bugünkü konum | 4 |
| 4 | Ashford Village | town | 4 | [0.414, 0.643] | altta | eğitim, bugünkü konum | 4a |
| 4a | Ashford Road | battle | 5 | [0.500, 0.593] | altta | fields | 5A, 5B |
| 5B | Iron Pass | battle | 6 | [0.453, 0.431] | altta | pass between the snow peaks | 5B2 |
| 5A | Misty Marsh | battle | 6 | [0.443, 0.810] | altta | marsh pools | 5A2 |
| 5B2 | Shepherd's Watch | event | 7 | [0.499, 0.296] | altta | hills | 6B |
| 5A2 | Reed Ferry | rest | 7 | [0.542, 0.763] | altta | river bank | 6A |
| 6B | Dwarven Mine | treasure | 8 | [0.569, 0.241] | altta | mountain foot | 6B2 |
| 6A | Witch's Hut | event | 8 | [0.578, 0.662] | altta | river bank fields | 6A2 |
| 6B2 | Old Quarry | elite | 9 | [0.589, 0.397] | altta | rocky slope | 7 |
| 6A2 | Fallow Fields | battle | 9 | [0.582, 0.561] | altta | fields | 7 |
| 7 | Valdren Keep | town | 10 | [0.652, 0.499] | altta | fields | 8A, 8B, 8C |
| 8A | St. Brann's Abbey | treasure | 11 | [0.704, 0.225] | altta | mountains | 8A2 |
| 8B | Mercenary Camp | battle | 11 | [0.688, 0.326] | altta | forest clearing | 8B2 |
| 8C | Black Cathedral | elite | 11 | [0.677, 0.601] | altta | fields by the river | 8C2 |
| 8A2 | Pilgrim Road | battle | 12 | [0.766, 0.349] | üstte | grass under the range | 8M |
| 8B2 | Crossroads Market | merchant | 12 | [0.738, 0.473] | altta | grass crossroads | 8M |
| 8C2 | Grave Field | battle | 12 | [0.745, 0.575] | altta | fields | 8M |
| 8M | Riverside Camp | rest | 13 | [0.814, 0.448] | altta | river bank | 9 |
| 9 | King's Bridge | boss | 14 | [0.833, 0.546] | altta | ON the river (the crossing) | 9a |
| 9a | Burned Hamlet | event | 15 | [0.896, 0.654] | altta | grass | 10 |
| 10 | Ashen Plain | battle | 16 | [0.969, 0.537] | altta | open grass | 11A, 11B |
| 11A | Dragon's Spine | elite | 17 | [0.990, 0.278] | altta | mountains | 11A2 |
| 11B | Siege Line | battle | 17 | [1.057, 0.435] | altta | grass | 11B2 |
| 11A2 | Frozen Pass | battle | 18 | [1.057, 0.167] | altta | snow mountains | 11A3 |
| 11B2 | Forward Camp | merchant | 18 | [1.146, 0.431] | altta | grass | 11B3 |
| 11A3 | Ice Cave | treasure | 19 | [1.123, 0.330] | altta | mountains | 12a |
| 11B3 | Morvane's Outworks | elite | 19 | [1.215, 0.331] | altta | foothills | 12a |
| 12a | Gate of Cinders | battle | 20 | [1.188, 0.231] | altta | mountains | 12 |
| 12 | Castle Morvane | boss | 21 | [1.229, 0.130] | altta | high mountains | — |

# İlerleme Yol Haritası: item, level, skill ağacı, endless, QB/MP itemleme, sefer reworkü

Durum: **v2: kararlar alındı (bölüm 6, Ömer 2026-10-09); aşama 0 (ortak temel) uygulandı** (madde 278: `src/progression/`, `data/items.json`, `data/campaign/power-budget.json`, kayıt v3). Yazan: campaign-dev, 2026-10-09. Açık kalan: karar 7 (ücretli dinlenme / Fountain dolumu).

Ömer'in isteği (2026-10-09): "Önce item yapalım (set item'leri de olabilir). Item/level/skill ağacı şimdilik seferde; ileride QB ve MP'de belli bir altın limitiyle karakterler itemlenebilir; endless oyun modu olursa orada da olabilir; KOLAY olacaksa endless modu tasarlayıp bu mekanikleri orada test etmeye de başlayabiliriz. Campaign'i de reworkleyeceğiz bunlar gelince: karakterler gitmediği yola gidebilecek, geri dönüp daha önce temizledikleri yerleri tekrar temizleyip FARM yapabilecekler." Ek: sefer en az 3 bölüm (harita); Valdoria daha sık (daha çok durak) olabilir; skill ağacı sonra (level, skill puanı, filler düğümler, major düğümler: skill'e güçlü özellik ya da evrim).

İlgili belgeler: item ayrıntısı `docs/design/progression/items.md` (content-designer; item türleri, yuvalar, nadirlik, set'ler, **değer / power score** oradadır, bu belge onlara atıf yapar), sefer `docs/design/campaign/campaign.md`, denge `docs/balance.md > Sefer dengesi`, fikirler `docs/design/future-ideas.md`.

Bütün sayılar **PROVİZYON**dur; denge `balance-tester`'ın işidir (`npm run sim`, `npm run sim:campaign`).

---

## 1. Genel yol haritası

### 1.1 Ana ilke: tek güç katmanı
Bugün sefer, düşmanı güçlendirmek için motorun `UnitSetup.modifiers` alanını kullanıyor (can çarpanı, stat çarpanı, stat eki, güç çarpanı, zırh eki). **Oyuncu karakterinin item + level + ağaç güçleri de aynı kapıdan girer.** Yani:

```
class temeli (data/classes)  ->  + level  ->  + ağaç (filler)  ->  + item'ler (+ set bonusu)  =  birimin UnitSetup'ı  ->  savaş
```

- Bu toplama tek bir saf fonksiyondur (öneri: `src/progression/loadout.ts`, Phaser/DOM yok, Node'da test edilir). Sefer, endless ve QB/MP **aynı fonksiyonu** çağırır; böylece bir item her modda aynı gücü verir.
- **Boş yükleme = bugünkü oyun birebir** (test ile korunur). QB/MP'de bütçe 0 iken hiçbir şey değişmez.
- Yalnızca stat veren item/düğümler motora DOKUNMADAN çalışır (mevcut alanlar yeter: `attrAdd`, `armorAdd`, `magicArmorAdd`, `hpMult`, `powerMult`). Özel etkiler (vuruşta yakma, skill'e yeni özellik, skill evrimi) motorda yeni kanca ister: `engine-dev` işi, aşama 1b ve 4.

### 1.2 Aşamalar (sıra önerisi)

| # | Aşama | İçerik | Bağımlı olduğu | Büyüklük | Kim |
|---|---|---|---|---|---|
| **0** | **Ortak temel** | Kahraman kalıcı kaydı (level, XP, takılı item'ler, ağaç puanları), sefer envanteri + altın; güç toplama katmanı (1.1); **güç bütçesi tablosu** (1.3); kayıt sürüm geçişi (1.4); sim'e "yükleme" parametresi (item'li karakterle savaş ölçümü) | — | Küçük-orta: ~1 oturum | campaign-dev (kayıt, katman), balance-tester (sim parametresi), content-designer (items.md şeması) |
| **1** | **Item MVP** | items.md'deki yuvalar ve nadirlik; YALNIZCA stat veren item'ler; seferde loot (savaş zaferi, korunan hazine, Witch's Hut olayı), envanter + takma ekranı (Party penceresinde), set bonusları (2/4 parça, yine stat); tüccar (al/sat) kasabalarda | 0 | Orta-büyük: ~2-3 oturum | content-designer (item verisi, ikonlar), campaign-dev (loot tabloları, envanter mantığı, tüccar), ui-dev (envanter/takma ekranı, loot kartı) |
| **1b** | Özel etkili item'ler | "Vuruşta %X yanık", "savaş başında kalkan", set'in 4. parça etkisi gibi | 1 + motor kancası | Orta | engine-dev (kanca + test), content-designer |
| **1E** | **Endless Lite** (test zemini; bölüm 3) | Art arda dalgalar, dalga arası ödül seçimi, skor; item'leri seferden bağımsız denemek için | 0 (item'ler geldikçe içine girer) | Orta: ~2-3 oturum | campaign-dev (saf mantık), ui-dev (ekran), balance-tester (endless sim) |
| **2** | **Level / XP** | Savaş başı XP, level eğrisi, level başına küçük stat artışı + 1 skill puanı (puan aşama 3'e kadar birikir) | 0 | Küçük-orta: ~1 oturum | campaign-dev, balance-tester |
| **5a** | **Sefer reworkü I** (bölüm 2) | Serbest dolaşım, yeniden oynama (farm) kuralları, yeni sis, sıklaştırılmış Valdoria (yeni durak türleri: Fountain, Merchant, Shrine, Scout Tower) | 1 + 2 (farm'ın anlamı loot + XP) | Büyük: ~3-4 oturum | campaign-dev (mantık + veri), ui-dev (harita arayüzü), content-designer (rozetler, sesler), balance-tester (farm ölçümü) |
| **3** | **Skill ağacı: filler** | Class başına ağaç; küçük stat düğümleri (+%3 can, +2 DEX gibi); puan harcama ekranı, sıfırlama (altınla) | 2 | Orta: ~2 oturum | content-designer (ağaç verisi), campaign-dev (mantık), ui-dev (ağaç ekranı) |
| **5b** | **Sefer reworkü II: yeni bölümler** | Bölüm 2 ve 3 haritaları, bölüm geçişi, bölüm seviyesi ölçeği | 5a | Büyük (her bölüm ~2 oturum + arka plan resmi) | campaign-dev, content-designer (arka plan, karşılaşma temaları), balance-tester |
| **4** | **Skill ağacı: major / evrim** | Skill'e güçlü yeni özellik ya da skill'in evrimi (yeni skill varyantı verisi) | 3 + motor | Büyük: class başına ayrı tasarım | engine-dev (varyant/kanca), content-designer (ikon/vfx/ses), balance-tester |
| **6** | **QB/MP altın limitli itemleme** (bölüm 4) | Takım seçiminde bütçe, item mağazası; MP protokolüne yükleme eklenmesi | 1 (+1b isteğe bağlı) | Orta: ~1-2 oturum | ui-dev (TeamSelect), multiplayer-dev (protokol), balance-tester (QB bandı) |
| **7** | Endless tam | Skor tablosu, mutatörler, ağaç/level endless'ta | 1E + 3 | Orta | campaign-dev, ui-dev |

**Neden bu sıra:** Ömer "önce item" dedi; item'in hem endless'ta hem seferde hem QB'de kullanılabilmesi için önce ortak katman (0) gerekiyor. Farm (5a) loot ve XP olmadan anlamsız, bu yüzden 1 ve 2'den sonra. Ağaç (3, 4) en büyük içerik işi (11 class x ağaç); level puanları biriktiği için ağaç gecikse de kayıp yok. QB/MP itemleme rekabetçi dengeyi etkilediği için en son, item seti oturunca.

### 1.3 Güç bütçesi tablosu (PROVİZYON)
"Efektif güç" = class temeline göre karakterin savaş gücü çarpanı (ölçüm: aynı karakterin yüklemeli ve yüklemesiz hâliyle 4'e 4 sim kazanma oranından türetilir; balance-tester aracı aşama 0'da). items.md'deki **power score** item başına bu bütçeden pay alır.

| Sefer noktası | Item | Level | Ağaç | Toplam (yaklaşık) | Düşman ölçeği (= 1 + 0,8 x açık sistemlerin beklenen gücü) |
|---|---|---|---|---|---|
| Başlangıç (Mill Road) | 0 | L1 | 0 | x1,00 | x1,00 (bugünkü karşılaşmalar) |
| Bölüm 1 sonu | +%15 | +%10 | +%5 | x1,30 | x1,24 (yalnızca item açıkken x1,12) |
| Bölüm 2 sonu | +%30 | +%20 | +%15 | x1,65 | x1,52 (yalnızca item: x1,24) |
| Bölüm 3 sonu | +%45 | +%30 | +%25 | x2,00 | x1,80 (yalnızca item: x1,36) |
| Farm ile en fazla ek | +%5 | +%5 | — | eğrinin ~%10 üstü | — (ölçek oyuncunun gerçek gücüne bağlı değil) |

- **Ömer onayladı (2026-10-09, madde 278): telafi %80.** Düşman ölçeği sabit bir tablo değil: item'lerin (ve açıldıkça level/ağacın) o düğümde BEKLENEN gücünün x0,8'i (`data/campaign/power-budget.json`, `src/campaign/power.ts`; bölüm içinde düğüm derinliğiyle doğrusal). Eski taslaktaki düşman sütunu (x1,25 / x1,65 / x2,10, ~%85 telafi) ve toplam sütunundaki yuvarlamalar (x1,75 / x2,30) bu karara göre düzeltildi. Yalnızca oyunda açık sistemler sayılır (`activeSystems`; aşama 0'da boş => ölçek 1).

- Fikir: oyuncunun normal ilerlemesi düşmanın biraz önünde gider (oyuncu güçlendiğini hisseder), farm bu farkı **sınırlı** büyütür (zorluk kolu gibi), ama "her şeyi ezme" seviyesine çıkaramaz (bölüm 2.3 azalan getiri).
- Kural önerisi: tek bir item karakter gücünün bütçesinin ~1/4'ünden fazlasını vermez; HIZ (SPD/DEX) ve kritik veren item'lerin ayrı tavanı var (risk: bölüm 5).

### 1.4 Kayıt ve sürüm geçişi (aşama 0)
- Sefer durumu (`CampaignState`) `version: 1 -> 2`; kayıt dosyası (`protomedi.campaign.v1` anahtarı aynı) `SAVE_VERSION 2 -> 3`.
- Kahramana yeni alanlar: `level` (1), `xp` (0), `equipment` (yuva -> item örneği), `tree` (düğüm -> puan), `skillPoints` (0). Sefere: `inventory` (item örnekleri), `gold` (0). Aşama 5a'da: harita başına ilerleme (bölüm 2.1).
- Geçiş: eski kayıt okunurken eksik alanlar varsayılanla doldurulur (mevcut `normalizeState` / `migrateV1` kalıbı); bugünkü seferler bozulmadan devam eder. Test: v2 dosyası -> v3, içerik aynı + yeni alanlar boş.
- Item örneği kayda **id + seed'li zar** olarak yazılır (ör. `{ id: "iron_helm", roll: 37, rarity: "rare" }`); asıl sayılar veriden hesaplanır. Böylece item verisi dengelenince eski kayıtlar da yeni sayıları alır.
- Loot zarları sefer seed'inden türetilir (`hash(seed, harita, düğüm, oynama sayısı)`): kayıt yükleyip aynı savaşı yeniden oynamak AYNI loot'u verir (kayıt-yükle hilesi yok).

### 1.5 Denge kontrol noktaları
| Aşama sonu | Kontrol |
|---|---|
| 0 | Boş yüklemeyle `npm run sim` ve `sim:campaign` sonuçları birebir aynı (test). |
| 1 | `sim:campaign` oyuncu vekili loot'u otomatik takar; item'li sefer bitirme Medium'da hedef bandın üst yarısına çıkmalı ama elit/boss ilk deneme hedef bandının 10 puandan fazla üstüne çıkmamalı. QB etkilenmez (bütçe 0). |
| 1E | Endless'ta "kaçıncı dalgada ölünür" item'li/item'siz farkı: item gücünün ölçüsü. |
| 2 | Level eğrisi 1.3 tablosuna oturuyor mu (bölüm sonu ortalama level). |
| 5a | Farm'lı ve farm'sız vekil: bitirme farkı en fazla ~15 puan; 1 saatlik farm sonrası güç eğrinin %10'undan fazla üstünde değil. |
| 3 / 4 | Ağaçta "her class için en iyi yol" tek mi (sim ile yol karşılaştırması). |
| 6 | Bütçeli QB'de class kazanma oranı yine %44-56 bandında (`data/balance.json`). |

---

## 2. Sefer reworkü (aşama 5a / 5b)

### 2.1 Serbest dolaşım
- **"Seçilen yol kilitlenir, geri dönüş yok" kuralı kalkar.** Kenarlar iki yönlü yürünür. Seçim noktası artık yalnızca "kavşak"tır; "The other roads will close" onayı kalkar.
- Bir hamle = komşu düğüme yürümek. Temizlenmiş düğümlerden geçerek uzaktaki bir düğüme **tek dokunuşla yolculuk** (kafile yolu otomatik yürür; arada temizlenmiş düğümlerde durmaz).
- İlk kez varılan düğümün içeriği (savaş, hazine, olay, kasaba) bugünkü gibi çalışır. K1/K2 kuralları (her dalda savaş, art arda en fazla 2 savaşsız durak) ilk geçiş için korunur.
- Durum modeli: `path` (yürüyüş günlüğü) kalır; yanına harita başına `visited` (keşfedilen), `cleared` (ilk içeriği bitmiş), `replays` (düğüm başına yeniden oynama sayısı). `closedNodes` kavramı kalkar.
- Haritada yeni ilerleme göstergesi: "Stop 7/12" yerine "Cleared 9/28 · Chapter 1".

### 2.2 Yeniden oynama (farm)
| Düğüm türü | Yeniden oynanır mı | Düşman | Ödül |
|---|---|---|---|
| Battle | Evet | **Aynı karşılaşma olabilir** (karar 4, Ömer 2026-10-09); bölgenin devriye listesi (`regions[x].patrols`) isteğe bağlı çeşit olarak ileride, zorunlu değil | XP + altın + normal loot, azalan getiri (2.3) |
| Guarded Treasure | Savaşı evet (devriye gibi) | Aynı devriye kuralı | Sandık YALNIZCA ilk zaferde; sonra normal savaş ödülü |
| Elite | Evet (öneri) | Aynı elit karşılaşma, bölüm seviyesine göre | Elitin özel item'i (varsa) yalnızca ilk zaferde; sonra elit loot tablosu, azalan getiri |
| Boss | **Hayır** (öneri) | — | — |
| Event / Treasure (saf) | Hayır (bir kez) | — | — |
| Town / City | Her zaman girilir | — | Dinlenme, tüccar, aday |
| Fountain (yeni) | Evet, şarjlı | — | İyileştirme (2.5) |

- **Karar 4:** tekrar oynanan savaşta aynı moblar görünebilir (devriye üretici zorunlu değil). Savaş seed'i yine oynama sayısını içerir: `hash(seed, harita, düğüm, oynama sayısı, deneme)` (zarlar farklı, takım aynı olabilir).
- **Ölçek bölüm seviyesine bağlı, oyuncu seviyesine DEĞİL.** Düşman oyuncuyla birlikte büyürse farm anlamsızlaşır; bölüme bağlı olunca farm gerçekten kolaylaştırır ama azalan getiriyle sınırlanır.

### 2.3 Farm sömürüsüne karşı önlemler (öneri: A + B, C yok)
| | Kural | Öneri |
|---|---|---|
| **A. Azalan getiri (düğüm başına)** | Aynı düğümün N. yeniden oynanışında XP / altın / loot şansı ilk zaferin %60 / %40 / %25'i; taban %25'te kalır. | **Evet** |
| **B. Seviye farkı cezası** | Karakter, bölüm seviyesinin 3+ level üstündeyse XP'nin yarısı, 5+ üstündeyse %10'u. | **Evet** |
| C. Zaman / olay bedeli | Her yeniden oynama "Ash Curse" sayacını ilerletir, sayaç dolunca bölgede daha zor düşmanlar. | Hayır (karmaşık; ileride düşünülebilir) |
| D. Kasaba bedeli | Dinlenme (Rest) altın ister: ilk dinlenme her kasabada bedava, sonra bölüm seviyesine göre küçük ücret. | **AÇIK: sonra bakılacak** (karar 7) |

### 2.4 Sis kuralının yeni hâli
- Mesafe artık **iki yönlü graf**ta ölçülür.
- **Keşfedilen kalır:** bir kez görülen düğüm (d = 1 ya da 2'de görülmüş) sise geri dönmez (bugün kapanan dallar sise dönüyordu, artık kapanan dal yok).
- Bulunulan yerden d = 1: tam bilgi + düşman önizlemesi; d = 2: tür + ad; ötesi sis (bugünkü `visibility: 2` aynı). Temizlenmiş savaş düğümünde önizleme "Patrol · Lv 4" gibi devriyeyi gösterir.
- Yeni durak türü **Scout Tower**: çevresindeki sisi kalıcı açar (bugünkü "Scout's Map" fikri).
- Bölüm boss'u ve final hedefi baştan siluetiyle görünür (bugünkü `alwaysVisible`).

### 2.5 Boss, bölüm geçişi, kasaba / tüccar / dinlenme / fountain
- **Bölüm boss'u yenilince sonraki bölüm açılır.** Boss düğümünde "Travel to Chapter 2" eylemi (harita geçişi = yeni `CampaignMap`, kendi düğümleri ve arka planı).
- **Geri dönüş (öneri: ilk sürümde YOK):** bölüm boss'una girerken uyarı: *"Beyond this battle lies the next chapter. You will not be able to return."* Gerekçe: eski bölüme dönmek kayıt/durum modelini büyütür, eski bölüm düşmanları düşük seviyeli olduğu için farm değeri de zaten düşük. Kaçırılan set parçaları için tüccar/olaylar sonraki bölümde yedek kaynak olur. (Soru 2.)
- **Town / City:** Rest (2.3 D kuralı), Recruit (bugünkü), **Merchant** (al/sat, stoğu bölüm seviyesine göre, seed'li; her ilk zaferden sonra yenilenir), Party/Inventory.
- **Fountain (yeni, future-ideas):** takımı %50 iyileştirir; 1 şarj, her 3 yeni (ilk kez) zaferde dolar. Boss öncesi bölümlere birer tane konur: madde 264'teki "boss'a düşük canla girme sarmalı"nın asıl çözümü (artık kasabaya dönmek de mümkün).
- **Shrine (yeni, isteğe bağlı):** bir sonraki savaş için küçük güçlendirme (altınla).

### 2.6 Can taşıma ve kayıt (Normal / Ironman)
- Can taşıma kuralları aynı kalır (zafer +%20, düşen %20 ile kalkar, boss tam iyileşme). Serbest dolaşımla iyileşme kaynakları çoğalır: kasabaya dönüş (ücretli), fountain.
- Kayıt: her zaferden sonra otomatik (devriye savaşları dahil). Normal 5 kayıt (en eskisi silinir), Ironman 1: değişmez. Farm sırasında kaybedilen savaş = son kayda dönüş (bugünkü gibi).
- Yolculuk ve kasaba alışverişi kayda bir sonraki zaferde girer; Normal'de elle `Save` zaten var.
- Yenilgi sonrası loot: seed'li olduğu için aynı savaşı yeniden kazanmak aynı loot'u verir; farklı loot için başka düğüm ya da sonraki yeniden oynama gerekir.

### 2.7 Tutorial akışının korunması
- Mill Road -> Ravenwood -> Watchtower -> Ashford **tek yön ve farm'a kapalı** kalır (öneri). Serbest dolaşım Ashford'daki "Form your company" ekranından sonra açılır; Ashford'un batısındaki tutorial düğümleri "Cleared" olarak kalır, yeniden oynanmaz (tutorial takımı zaten veda etmiştir; 3 kişilik yeni takımla tutorial düşmanlarını ezmek anlamsız).
- Ashford ipucuna serbest dolaşım satırı eklenir: *"You can now travel back along cleared roads. Patrols return to cleared battlefields."*

### 2.8 Valdoria'nın daha sık hâli (5a)
- Bugün 17 durak / rota başına 12. Öneri: **~28 durak**, ilk kez her şeyi görmek isteyen oyuncu için ~22-24 savaşlı düğüm; asgari yol (en kısa ana yol) ~14 durak.
- Dallar arasına **çapraz bağlantılar** (ör. Misty Marsh <-> Iron Pass arası bir yan yol, 8A-8B-8C arası köy yolları): serbest dolaşımın anlamı ve döngüler.
- Yeni durak türleri: **Fountain** (2-3 adet), **Merchant** (yol üstü tüccar, 1-2), **Shrine** (1-2), **Scout Tower** (1), **Lair** (isteğe bağlı mini-elit, set parçası düşüren), ek olaylar.
- Düğüm konumları geniş (21:9) arka plana göre yeniden yerleşir (ultrawide işi bitince; `backgroundWide`). Hangi bölgelere ek durak gideceği haritada boş alan ölçümüyle seçilir.

### 2.9 3+ bölüm yapısı
| Seçenek | Bölüm 1 | Bölüm 2 | Bölüm 3 | Yeni arka plan |
|---|---|---|---|---|
| **1 (öneri)** | **Valdoria** (sıklaştırılmış, mevcut 3 bölge; Castle Morvane bölüm boss'u) | **The Ashlands**: Morvane'in ötesi, lanetin kaynağı (kül çölü, yıkık kuleler; undead/Hexer ağırlıklı düşmanlar) | **The Ember Throne**: lanetin kalbi (volkanik dağlar, kült; son boss) | 2 (bölüm 2, 3) |
| 2 | I · The Borderlands (yakın plan) | II · Valdren Vale (yakın plan) | III · The Northern Heights (yakın plan) | 3 (her bölge ayrı) |

- Seçenek 1 mevcut haritayı ve az önce yapılan geniş arka plan işini korur; oyunun adına ("Embers of Valdoria") uyan bir yükseliş verir. Seçenek 2 mevcut hikâyeyi bozmaz ama 3 yeni arka plan ister ve Valdoria'nın bugünkü "tek bakışta tüm ülke" hissini kaybeder. (Soru 6.)
- Her bölüm: kendi `CampaignMap` verisi, bölüm seviyesi (düşman ölçeği 1.3), kendi devriye listeleri, bir bölüm boss'u. Takım (kadro, level, item) bölümden bölüme taşınır.
- Takım boyutu 4'te kalır (Ömer kararı); 5. karakter yok.

### 2.10 Harita arayüzüne etkisi (ui-dev)
- Kaldırılanlar: "Road closed", "Take this road" onayı, kapanan dalların sise dönmesi.
- Eklenenler: temizlenmiş savaş düğümünde küçük "devriye" rozeti + azalan getiri göstergesi (ödül çubuğu 100/60/40/25); fountain şarj göstergesi; tek dokunuşla yolculuk (hedefe dokun -> rota vurgusu -> yürü); bölüm göstergesi ve bölüm geçiş ekranı; Party penceresinde envanter ve (aşama 3'ten sonra) ağaç sekmesi; kasabada Merchant.
- Lejant: Fountain, Merchant, Shrine, Scout Tower, Patrol.
- Debug (Campaign sekmesi): Give item, Give gold, Set level, Reset replays, Teleport (iki yönlü), Next chapter, Farm report (sim'den).

---

## 3. Endless modu (aşama 1E: erken test ortamı)

### 3.1 Tasarım önerisi ("Endless Lite")
| Öğe | Kural |
|---|---|
| Başlangıç | Ana menü Play kartlarında **Endless**. Oyuncu 4 class seçer (TeamSelect'in 4'lük hâli), level 1, item yok. |
| Dalga | Her dalga bir savaş. Düşman takımı seed'li üretilir: rastgele havuzdan class'lar (Geometer yok), dalga numarasına göre sayı (1-2. dalga 3 düşman, sonra 4) ve güç (her dalga can/stat +%5, güç +%3; PROVİZYON). |
| Özel dalgalar | Her 5. dalga **elit** (mevcut elit karşılaşmalarından biri), her 10. dalga **boss** (Bridge Warden, Lord Morvane...). |
| Can taşıma | Seferle aynı kurallar (zafer +%20, düşen %20 ile kalkar, boss sonrası tam). |
| Dalga arası | **3 karttan 1 seçim** (roguelite): item, altın, takımı %40 iyileştir, (aşama 2'den sonra) XP, (aşama 3'ten sonra) skill puanı. Altınla küçük dükkân her 5 dalgada. |
| Kaybedince | Koşu biter. **Skor** = ulaşılan dalga (+ yan bilgi: toplam tur, öldürme). Yerel en iyi skor listesi (localStorage, ilk 10). |
| Kayıt | Tek koşu yuvası; her dalgadan sonra otomatik (Ironman gibi, tek kayıt). Yenilgide yükleme YOK (koşu biter). |
| Zorluk | İlk sürümde tek zorluk (Medium YZ). |

### 3.2 Ne kadar kolay (mevcut altyapıdan yeniden kullanım)
| Parça | Bugün var mı | Endless'ta |
|---|---|---|
| Savaş kurulumu (party + enemies + birim güçlendirme, eksik canla başlama) | Var (`battleSetup` + `UnitSetup`, madde 251) | Aynen kullanılır |
| BattleScene'in "dışarıdan bağlam" ile açılması ve sonucu geri bildirmesi | Var ama sefere özel (`src/game/campaign-session.ts`) | Genelleştirilmesi gerekir: "koşu oturumu" arayüzü (sefer + endless). Küçük-orta iş (ui-dev) |
| Can taşıma kuralları | Var (`applyBattle`) | Kural kısmı ortak fonksiyona çıkarılır |
| Sonuç ekranı | Var (sefer düğmeleri) | "Next wave" / "Run over" düğmeleri |
| Kayıt (sürümlü, bozuk kayıt çökmez) | Var (`save.ts` kalıbı) | Aynı kalıpla küçük ayrı anahtar |
| Seed'li RNG | Var (`seed.ts`) | Aynen |
| Karşılaşma verisi (elit/boss) | Var (`encounters.json`) | Özel dalgalarda yeniden kullanılır |
| Sefer simülatörü | Var (`src/sim/campaign.ts`) | Aynı yöntemle `sim:endless`: "item'siz X. dalga, item'li Y. dalga" |
| **Yeni olan** | | Dalga üretici (saf), koşu durumu, dalga arası kart ekranı, skor listesi, ana menü kartı |

**Gerçekçi büyüklük:** saf mantık + testler ~1 oturum (campaign-dev), ekranlar ~1-1,5 oturum (ui-dev), sim ~0,5 (balance-tester). Toplam **~2-3 oturum**. Harita, sis, rota, tutorial gibi seferin en ağır kısımlarının hiçbiri gerekmez.

### 3.3 Net öneri: önce endless ile mi test edelim?
**Evet, ama "önce" değil "hemen yanında":** sıra **aşama 0 (ortak katman) -> Endless Lite + item MVP paralel -> item'ler seferde**.
- Endless, item'leri sefer haritasına dokunmadan denemenin en hızlı yolu: 5 dakikada 10 savaş, her dalgada yeni item; Ömer telefonda hemen hisseder.
- Sim için temiz bir ölçü verir (item'li/item'siz ulaşılan dalga): güç bütçesi tablosunu (1.3) ayarlamak kolaylaşır.
- Sefer zaten reworke gidecek (2): item'leri bugünkü 12 duraklık tek yön haritaya derin gömmek boşa iş olabilir; seferde aşama 1 için yalnızca basit bağlantı (zafer sonrası loot kartı, hazine sandığı) yapılır.
- Ultrawide işi ve harita kodu şu an başka ajanın elinde; endless farklı dosyalarda ilerler, çakışma olmaz.
- Risk: endless "asıl oyun"un önüne geçmesin diye Endless Lite kapsamı yukarıdaki tabloyla sınırlı tutulur (skor tablosu yerel, mutatör yok).

---

## 4. QB / MP altın limitli itemleme (aşama 6)

| Öğe | Kural (öneri) |
|---|---|
| Bütçe | Takım seçiminde her oyuncuya (her tarafa) **X altın**, takım için ortak. Varsayılan **0** = bugünkü oyun. QB'de seçilebilir: 0 / 500 / 1000 / 2000 (PROVİZYON). |
| Fiyat | Item fiyatı = items.md'deki **değer** (power score'dan türetilir; aynı sayı seferde tüccar fiyatıdır). Rastgele zarlı item yok: QB'de her item "orta zar" sabit hâliyle satılır. |
| Mağaza | QB mağazasında yalnızca `qb: true` işaretli item'ler (efsanevi/benzersiz ve sefer hikâye item'leri hariç; set'ler serbest ama parçaları ayrı ücretli). |
| Sınırlar | Karakter başına her yuvada 1 item (seferle aynı yuvalar); aynı benzersiz etkiden takımda 1. Level ve ağaç QB'de YOK (yalnızca item). |
| Arayüz | TeamSelect kartında küçük "Gear" düğmesi -> yuvalar + mağaza; üstte kalan altın. Randomize düğmesi bütçe içinde rastgele yükleme de yapar. |
| Sim | `npm run sim` bütçeli mod: her taraf bütçesini seed'li rastgele harcar. Hedef: class kazanma oranı yine %44-56 (`data/balance.json`); bütçe 0 sonuçları birebir aynı (test). |
| **MP adaleti** | Bütçeyi kurucu lobide seçer, iki tarafta aynı. Yükleme `team` mesajına eklenir (`cells` + `gear`), rakibe savaş başlayana kadar gizli (takım gibi). Protokol sürümü (`hello.v`) yükselir; item verisi zaten içerik parmak izine (`build`) girdiği için farklı item verili iki istemci eşleşmez. İki taraf da karşının yüklemesini bütçe ve kurallara göre **doğrular**; geçersizse maç başlamaz (lockstep zaten her hamleyi iki tarafta sınar). |
| 4'e 4 dengeye etkisi | Item'ler class'lar arası farkı büyütebilir (ör. çok ucuz zırh STR class'larına fazla yarar). Bu yüzden fiyatlar class başına değil item başına ama "en verimli yükleme" sim'de class bandını bozuyorsa item fiyatı ayarlanır, class verisine dokunulmaz. |

---

## 5. Riskler ve denge stratejisi

| Risk | Nerede | Önlem |
|---|---|---|
| Güç artışı düşman ölçeğini geçer, sefer kolaylaşır | Sefer | Bütçe tablosu (1.3), bölüm seviyesi ölçeği, azalan getiri; her aşama sonunda `sim:campaign` kontrol noktası (1.5). |
| Farm sınırsız güç verir | Sefer | Azalan getiri + seviye farkı cezası + ücretli dinlenme (2.3); boss tekrar yok. |
| HIZ (SPD) item'leri sıra sistemini bozar (hızlı = çok daha fazla tur) | Hepsi | SPD/DEX item'lerine ayrı tavan; sim'de "tur payı" ölçümü. |
| Zırh yığma (zırh/(zırh+30)) | Hepsi | Zırh eklerinin toplam tavanı; büyü zırhı ile denge. |
| Kritik / Luck yığma, Lucky Escape | Hepsi | Kritik item tavanı; Lucky Escape şansı item'den etkilenmez (öneri). |
| Can taşıma sarmalı (madde 264) kötüleşir ya da anlamsızlaşır | Sefer | Fountain + ücretli kasaba dinlenmesi; kural değişikliği yine Ömer kararı. |
| QB/MP dengesi bozulur | QB/MP | Varsayılan bütçe 0 (bugünkü oyun birebir); bütçeli mod ayrı sim bandı; class verisine dokunmadan item fiyatı ile ayar. |
| MP desync / hile | MP | Yükleme start mesajında, iki taraflı doğrulama, içerik parmak izi. |
| Kayıt bozulması | Sefer / endless | Sürümlü geçiş + test; item örneği id + zar (veri değişse de kayıt geçerli). |
| Skill evrimleri (aşama 4) motoru karmaşıklaştırır | Motor | Evrim = yeni skill varyantı verisi (yeni skill gibi), motorda genel kanca; class başına ayrı tasarım belgesi. |
| Kapsam şişmesi (11 class x ağaç, 3 bölüm, endless) | Proje | Küçük adımlar; her aşama tek başına oynanabilir; endless Lite kapsamı sabit. |
| YZ item'li birimleri yanlış değerlendirir | Motor | YZ zaten gerçek statlarla hesaplar (değer terazisi); özel etkili item'ler (1b) için terazi kancası engine-dev. |

**Değişmeyenler:** Quick Battle (bütçe 0), `npm run sim` hedef bantları, savaş kuralları. Seferdeki güç artışı yalnızca `UnitSetup` üzerinden girer; class/skill verisi item yüzünden değiştirilmez.

---

## 6. Kararlar (Ömer, 2026-10-09; eski "Ömer'e sorular" bölümü kapandı)

| # | Soru | Karar |
|---|---|---|
| 1 | Farm'da **azalan getiri** olsun mu? | **EVET** (%60 / %40 / %25, taban %25; 2.3 A). Seviye farkı cezası (2.3 B) öneri olarak kalır, level sistemiyle (aşama 2) birlikte sorulur. |
| 2 | Bölüm boss'u geçilince **önceki bölüme geri dönülsün mü**? | İlk sürümde **HAYIR** (boss öncesi uyarıyla). |
| 3 | **Endless önce mi?** | **EVET: Endless Lite item MVP ile paralel**, aşama 0'dan hemen sonra. |
| 4 | Yeniden oynanan savaşta düşman aynı takım mı, devriye mi? | **AYNI moblar görünebilir**; yeniden üretilen devriye zorunlu değil (ileride çeşit için eklenebilir). 2.2 güncellendi. |
| 5 | Boss ve elitler tekrar oynanabilsin mi? | **EVET:** elit tekrar oynanabilir (özel item yalnızca ilk zaferde), boss **hayır**. |
| 6 | 3 bölüm yapısı | **Seçenek 1:** sıklaştırılmış Valdoria + **The Ashlands** + **The Ember Throne**. |
| 7 | Kasabada ücretli dinlenme ve Fountain dolumu | **SONRA bakılacak (AÇIK).** 2.3 D ve 2.5'teki öneriler bekliyor. |
| 8 | QB/MP itemleme | **Şimdilik YOK:** Quick Battle'a altın / item / skill ağacı entegre edilmez; QB ve MP dokunulmaz (bölüm 4 ileriye dönük taslak olarak kalır). |

# Denge Hedefleri

## Hedef bantlar (Ömer kararı 2026-10-08; madde 261)
Sayılar `data/balance.json` dosyasındadır; `npm run sim` raporu ve `tests/balance.test.ts` + `tests/balance-b.test.ts` (ortak kontroller `tests/balance-checks.ts`) oradan okur.

| Ölçüm | Hedef |
|---|---|
| Ana ölçüm | **4'e 4** (varsayılan takım boyutu 4; `random-battle.json > random.size`), 10.000 savaş, iki farklı seed grubu (1.. ve 500001..). 5'e 5 ve 3'e 3 yalnızca kontrol (Ömer kararı: skill kullanım bantları YALNIZCA 4'e 4 için geçerli; 3'e 3/5'e 5'te skill payı sapmaları kabul) |
| Class kazanma oranı | **%44-56** (her iki seed grubunda) |
| Bedelsiz temel saldırı (class'ın 1. skill'i) kullanım payı | **%20-45** |
| Normal skill (2.-3. yuva, durumsal olmayan) | **%15-35** |
| Durumsal destek skill'leri (`balance.json > situational`: Guard, Mana Barrier, Spell Ward, Jinx, Dark Bond, Resurrection) | **%8-25** |
| Ultimate (class'ın 4. skill'i) | birim hayattayken ultimate'ı ilk kez kullanılabilir olduğu (kendi turunda kullanılabilir) savaşlarda en az bir kez kullanma oranı, **class ORTALAMASI >= %50** (Ömer kararı 2026-10-08: class bazında ayrı kontrol yok); tek bir class **%35 altındaysa** (`ultimateLowWarn`) test ve rapor UYARI yazar; ham oran (tüm birimler) da raporlanır |
| Savaş süresi (tüm birimlerin turları toplamı, 4'e 4) | ortalama **35-50 tur** |
| Karşılaşma tablosu (A class'ının B class'ına karşı kazanma oranı; karşı taraflarda, aynı takımda değilken) | eşitlik HEDEFLENMEZ; yalnızca ezici eşleşmeler (> %75 / < %25, en az 200 savaş) işaretlenir |
| Taraf (oyuncu/düşman) | %45-55 |

- **Kullanım payı** = skill'in, class'ın TÜM hamleleri (Rest / Skip Turn / Move dahil) içindeki yüzdesi.
- Yapay zeka her iki tarafta Medium (tam terazi).
- Test grup başına `balance.json > test.runs` (5.000) savaşla iki ayrı seed grubunda (900001.., 300001..) aynı bantları korur; iki dosya paralel koşar (~1,5 dk). Tam ölçüm: `npm run sim` (argümansız: 2 x 10.000, tek çekirdekte birkaç dakika) ya da `npm run sim -- <savaş> <seed> [boyut] [boyut]`.

## Dengesi / bandı bekleyenler (geçici muafiyet; normalde BOŞ)
- `tests/balance-checks.ts > PENDING_BALANCE` (class bandı): **boş**. Hexer bu turda bantta (%48) olduğu için listeden çıkarıldı.
- `tests/balance-checks.ts > PENDING_SKILLS` (skill bandı): **boş**. Abyssal Cry (madde 262 yeni tasarımı) hazır olanlardan ~%69 kullanılıyor; 2026-10-08 ikinci turda listeden çıkarıldı.

## Sefer dengesi — 2026-10-08 (balance-tester, Opus; madde 264)

### Sefer simülatörü (`npm run sim:campaign`)
- Kod: `src/sim/campaign.ts` (çekirdek; testler de kullanır) + `src/sim/campaign-cli.ts` (rapor). Kullanım: `npm run sim:campaign -- [sefer] [ilk seed] [easy|medium|hard|all] [medium|easy|both] [--jobs=N] [--attempts=N] [--json=dosya]`; varsayılan 240 sefer, tüm zorluklar, iki oyuncu vekili, çekirdek sayısı kadar paralel iş.
- Akış gerçek sefer mantığıyla (`src/campaign`) birebir: rastgele kahraman -> Ravenwood'da 3 adaydan rastgele biri -> Watchtower -> Ashford'da 11 sınıftan rastgele 3 kişilik yeni takım (otomatik dizilim) -> Valdren Keep'ten ayrılırken rastgele aday = 4 kişi. 12 rota eşit sayıda oynanır (koşu no % 12). Can taşıma `applyBattle` / `moveTo` ile (zafer +%20, düşen %20 ile kalkar, boss zaferi ve kasaba tam can).
- **Oyuncu vekili:** oyuncu tarafını da YZ oynar. Medium YZ = "iyi oyuncu" (hedefler buna göre), Easy YZ = "ortalama oyuncu" (yalnızca bilgi). Düşman tarafı zorluğun YZ'si + zorluğun düşman çarpanları.
- **Yenilgi = son kayda dönüş:** aynı düğüm aynı takım durumuyla yeniden denenir (kayıt zaferden sonra alındığı için takım birebir aynıdır); deneme sayacıyla savaş seed'i değişir. **10 denemede geçilemeyen düğüm "takıldı"** sayılır: sefer "bitmedi" olur, ölçüm için düğüm zorla geçilip sefer sürer (sonraki düğümler de ölçülsün diye).
- Ölçümler: düğüm başına ilk denemede kazanma, ortalama deneme, savaşa giriş/çıkış canı, zaferde düşen karakter, savaş süresi; rota başına bitirme oranı ve sefer başına yenilgi; sınıf başına (asıl takımda iken) bitirme oranı; en zor/en kolay düğümler.
- **Kategoriler:** tutorial = Ashford öncesi savaşlar (1 Mill Road, 2 Ravenwood, 3 Watchtower: elit olsa da tutorial); elit = 8C, 11A; boss = 9, 12; normal = kalan savaşlar (korunan hazine 6B, 8A dahil).

### Hedefler (ÖNERİ; Ömer onayı bekliyor; `data/campaign/balance.json > targets`)
İlk denemede kazanma, oyuncu vekili Medium YZ, taşınan canla:

| Zorluk | Tutorial | Normal | Elit | Boss |
|---|---|---|---|---|
| Easy | %93-100 | %85-97 | %72-87 | %57-77 |
| Medium | %88-97 | %75-85 | %60-70 | %45-60 |
| Hard | %75-92 | %57-70 | %42-55 | %25-40 |

### Sonuç (960 sefer, seed 1.., 12 rota x 80; oyuncu vekili Medium YZ)

| Zorluk | | Tutorial | Normal | Elit | Boss | Seferi bitirme | Yenilgi / sefer |
|---|---|---|---|---|---|---|---|
| Easy | önce | %41,1 | %51,2 | %6,5 | %29,2 | %0,4 | 37,6 |
| | **sonra** | **%99,3** | **%95,7** | **%86,8** | **%67,9** | **%79,0** | **3,7** |
| Medium | önce | %18,8 | %29,7 | %2,0 | %31,5 | %0 | 52,3 |
| | **sonra** | **%95,0** | **%80,2** | **%63,5** | **%50,9** | **%60,6** | **8,6** |
| Hard | önce | %19,7 | %28,4 | %1,5 | %30,4 | %0 | 51,9 |
| | **sonra** | **%91,1** | **%66,4** | **%44,3** | **%33,2** | **%39,4** | **15,2** |

"Önce" ölçümü 240 sefer: eski karşılaşmalarda tutorial bile çoğu zaman geçilemiyordu (Mill Road %44, Ravenwood %8, Watchtower %4; Dragon's Spine, Siege Line, Castle Morvane %0). Hard eskiden Medium'la aynıydı (yalnızca YZ farkı).

Ortalama oyuncu vekili (Easy YZ), sonra (tutorial / normal / elit / boss, bitirme): Easy %97 / 79 / 69 / 39, %52; Medium %86 / 50 / 39 / 26, %25; Hard %81 / 35 / 29 / 13, %8.

Düğüm başına ilk deneme (Medium, sonra): 1 Mill Road %99, 2 Ravenwood %98, 3 Watchtower %88, 5A %82, 5B %81, 6B %78, 8A %80, 8B %73, 8C %70, 9 King's Bridge %56, 10 %81, 11A %59, 11B %83, 12 Castle Morvane %46. En zor: 12, 9, 11A; en kolay (tutorial dışı): 11B, 5A, 10. Savaş süresi (tüm birimlerin turları): tutorial 12-28, normal 27-50, elit 20-43, King's Bridge 71, Castle Morvane 49.

Rota bitirme (Medium, sonra; rota başına 80 sefer): %52-70. Tek elitli rotalar (8A/8B + 11B) %64-70, iki elitli %52-64, üç elitli (8C + 11A) %54. Alt yol (5A-6A, 9 savaş) ile üst yol (5B-6B, 10 savaş) farkı küçük (%61 / %60). Easy %72-88, Hard %21-55.

Sınıf (asıl takımda iken seferi bitirme, Medium): Paladin %90, Druid %80, Warrior %65, Defender %60, Undead %58, Mage %58, Cutthroat %55, Archer %52, Gambler %52, Anti-Mage %49, Hexer %49. Can taşındığı için şifa ve diriltme seferde 4'e 4 savaştakinden çok daha değerli (class sayılarına dokunulmadı; soru).

### Bitirmeyi düşüren asıl şey: can taşıma sarmalı (soru)
Medium'da seferlerin ~%39'u bir düğümü 10 denemede geçemiyor; neredeyse hepsi **King's Bridge (%22)** ve **Castle Morvane (%21)**. Sebep durum: boss'a düşük canla (önceki savaşta düşen karakter %20 ile) girilince "son kayıt" hep aynı kötü durumdan başlıyor. Castle Morvane'de takımın ortalama giriş canı %60 altındaysa kazanma %14, %80 üstündeyse %80. Ironman'da bu kalıcı kilit demek. Aynı karşılaşmalarla kural denemeleri (Medium, 240 sefer, ayarın ortasındaki karşılaşmalarla):

| Kural | Boss ilk deneme | Seferi bitirme | Yenilgi / sefer |
|---|---|---|---|
| Şimdiki (zafer +%20, düşen %20) | %51 | %57 | 9,5 |
| Düşen %50 ile kalkar | %62 | %79 | 5,7 |
| Zafer +%30, düşen %40 | %64 | %83 | 5,3 |
| Boss düğümüne varınca tam iyileşme ("kamp") | %80 | %90 | 4,3 |

Kurallar Ömer kararı olduğu için değiştirilmedi. Seçilen kural sonra boss (ve kısmen elit) sayılarını yeniden ayarlamayı gerektirir.

### Zorluk tanımları (`campaign.json > difficulties`)
- Yeni alanlar (`src/campaign`, küçük kod + test): `enemy` = seferdeki TÜM düşmanlara eklenen güçlendirme (hpMult, statMult, powerMult, armorAdd, magicArmorAdd; karşılaşmanın kendi `mods`'u ile çarpanlar çarpılır, düz ekler toplanır), `enemyTier` = elit/boss'a ek, `rules` = bu zorlukta victoryHeal / reviveRatio / bossVictoryHeal üstüne yazımı (altyapı hazır, şimdilik kullanılmıyor). Karşılaşma sayıları Medium'a göredir. İleride loot vb. alanlar aynı yere eklenir.
- **Easy:** Easy YZ (hata yapan, ufku kısa); düşman zayıflatması gerekmedi (YZ farkı yeterli).
- **Medium:** Medium YZ; karşılaşmalar veride yazıldığı gibi.
- **Hard:** Hard YZ + tüm düşmanlar **+%12 can, +%5 güç**, boss'lar ayrıca **+%10 can, +%10 güç**. (Denenen: +%15 can / +%10 güç elitleri %36'ya indirdi; +%8 stat elit %40, normal %69; boss eki olmadan boss %41.)
- Hızlı savaşta zorluk yok (Medium): değişmedi. Wiki > Campaign zorluk satırı veriden türetilir.

### Karşılaşma değişiklikleri (`data/campaign/encounters.json`; Medium tabanı; can = hpMult, stat = statMult, güç = powerMult)
- Mill Road – Road Thug + Cutpurse: can 0,5 -> 0,4, stat 0,7 -> 0,6, güç 0,5 (yeni). Eski hal "çok zayıf" görünse de tek kahramana karşı 2 düşmanın sıra avantajı + arkası hep boş tek kahramana Cutpurse'ün Backstab'ı yüzünden ilk deneme %44'tü (can tabanı 30 ile tutorial düşmanları bile güçlendi).
- Ravenwood – 5 haydut: can 0,5 -> 0,4, stat 0,7 -> 0,6, güç 0,4.
- Ruined Watchtower – Bandit Chief can 1,8 -> 1,1, stat 1,15 -> 0,9, güç 0,7; okçular tutorial zayıflatması (0,4 / 0,6 / 0,5).
- Misty Marsh – 3 düşman can 0,75, güç 0,85.
- Iron Pass – iki Cutthroat -> Cutthroat + Warrior (uç kombinasyon: çift Backstab 3 kişilik takımın arka safını eritiyordu, %19); can 0,75, güç 0,8.
- Dwarven Mine – can 0,7, stat 0,9, güç 0,8 (üst yolda ikinci savaş, eksik canla girilir).
- St. Brann's Abbey – can 0,8, güç 0,85 (çift Paladin korundu: bir Paladin'i Mage yapmak zorlaştırdı).
- Mercenary Camp – can 0,85, güç 0,9.
- Black Cathedral (elit) – 5 -> 4 düşman (Mage çıktı); High Priest can 1,8 -> 1,4, stat 1,15 -> 1,1; diğerleri can 0,8, güç 0,8.
- King's Bridge (boss) – Bridge Warden can 6 -> 6,5 (stat 1,5, 2 eylem aynı).
- Ashen Plain – can 0,8, güç 0,85.
- Dragon's Spine (elit) – 5 -> 4 (bir Cutthroat çıktı); Drake Priest can 1,8 -> 1,2, stat 1,15 -> 1; diğerleri can 0,6, stat 0,9, güç 0,75.
- Siege Line – 5 -> 4 (bir Archer çıktı); can 0,7, stat 0,9, güç 0,85.
- Castle Morvane (final) – 5 -> 4 (Warrior çıktı); Lord Morvane can 3,0 -> 2,5, stat 1,35 -> 1,2; eskort can 0,6, stat 0,95, güç 0,75.
- Bölge III düşmanlarının Bölge II'den "zayıf" görünmesinin sebebi taşınan can: takım bu savaşlara ortalama %60-70 canla giriyor.

### Testler
- `tests/campaign-balance.test.ts`: Medium, 120 sefer (seed 7001), her kategori hedef ± 8 puan (`balance.json > test`); eğri iner (tutorial > normal > elit > boss); 12 rota oynandı.
- `tests/campaign-difficulty.test.ts`: 48 sefer (seed 9001), normal/elit/boss için Easy > Medium > Hard en az 5 puan arayla, tutorial Easy >= Medium >= Hard; zorluk çarpanlarının birleşme kuralı ve Hard'ın düşmanlara (boss'a ek) gerçekten uygulandığı.
- İkisi paralel ~40 sn.

## Denge turu 2 — 2026-10-08 (balance-tester, Opus; madde 263; Abyssal Cry yeniden tasarımı + Guard yarım tur sonrası)

### Ölçüm
4'e 4 ana ölçüm: grup başına 10.000 savaş, seed 1.. ve 500001..; test grupları (900001.., 300001.., 5.000) ayrıca. 3'e 3 ve 5'e 5: 10.000 savaş, seed 1.. (önce 3'e 3 iki grup). Hızlı tarama 7 paralel işle.

### Class kazanma oranı (önce -> sonra)

| Class | 4'e 4 önce (grup 1 / 2) | 4'e 4 sonra (grup 1 / 2) | 3'e 3 önce | 3'e 3 sonra | 5'e 5 sonra |
|---|---|---|---|---|---|
| Warrior | %54,5 / %58,1 | %51,3 / %51,6 | %59,0 | %54,3 | %50,7 |
| Paladin | %47,2 / %46,7 | %48,2 / %47,8 | %44,8 | %46,4 | %49,7 |
| Mage | %52,8 / %52,3 | %52,8 / %53,8 | %50,9 | %50,2 | %53,5 |
| Undead | %50,2 / %51,3 | %49,8 / %49,7 | %48,4 | %47,6 | %48,7 |
| Archer | %46,7 / %44,2 | %50,2 / %50,3 | %51,2 | %53,1 | %49,3 |
| Druid | %44,9 / %45,7 | %47,5 / %45,8 | %42,7 | %45,5 | %49,6 |
| Defender | %47,2 / %47,1 | %49,0 / %48,0 | %44,8 | %46,3 | %50,3 |
| Anti-Mage | %52,9 / %53,5 | %49,1 / %50,7 | %47,4 | %46,0 | %52,3 |
| Gambler | %53,6 / %52,4 | %52,4 / %51,5 | %57,9 | %54,2 | %47,5 |
| Cutthroat | %52,0 / %50,8 | %51,2 / %50,1 | %54,5 | %55,9 | %50,7 |
| Hexer | %47,5 / %47,9 | %48,2 / %50,1 | %47,9 | %49,8 | %47,4 |

- Test grupları (900001 / 300001, 5.000): önce Warrior %57,6 / %55,6 (kırmızı), sonra tüm class'lar %47,2-53,0.
- Savaş süresi (4'e 4): **35,3 / 35,4 -> 36,2 / 36,7 tur** (test grupları 34,8 / 35,4 -> 36,1 / 36,7). Bant 35-50 tutuyor; can tabanı 30 korunur (35'e çıkarmak gerekmedi). 3'e 3: 29,7; 5'e 5: 43,0.
- Ultimate class ortalaması %80,6 (hedef >= %50); %35 altında class yok. En düşükler: Summon Treant %52, Raise Dead %57-59, Abyssal Cry %70 (önce %67). Payı en düşük ultimate: Raise Dead %13, Abyssal Cry %13.
- Skill payları (4'e 4): bant dışı yok. Kenara yakın: Wail of the Dead %33,3-34,6, Withering Curse %34,0-34,4, Card Trick %33,5-33,9 (üst 35); Tremor Slam %39-42 (üst 45; önce test grubunda %44,8 göründü); Guard %9,8-10,1 (alt 8).
- Ezici eşleşme (> %75 / < %25) yok.
- 3'e 3 skill payı (yalnızca kontrol): Quick Shot %47, Tremor Slam %50, Mana Steal %46 (temel üst 45), Piercing Arrow %13,5, Arrow Rain %11, Drain Field %14 (normal alt 15), Guard %7,6: az düşmanda alan skill'leri değer kaybediyor (önceki turla aynı yapı). 5'e 5: Holy Strike %19,8, Fire Bolt %19,2, Venom Edge %16,9 (temel alt 20), Wail %36,2, Card Trick %36,6 (normal üst 35).

### Değişiklikler (eski -> yeni; hepsi veri; süreler değişmedi)
- **Warrior:** Double Strike vuruş başına 0,9 -> 0,8; Whirlwind 1,5 -> 1,38; Charge 1,5 -> 1,35. Abyssal Fury bonus STR %50 korundu (%35 denemesi Warrior'ı belirgin düşürmedi ama ult kullanımını %68 -> %42 indirdi; geri alındı).
- **Paladin:** Holy Strike 0,85 -> 0,9.
- **Mage:** Fire Bolt 2,1 -> 2,0; Blizzard 1,5 -> 1,42; Meteor 1,28 -> 1,22.
- **Undead:** Wail of the Dead 1,27 -> 1,22 (bedel %20 aynı; %25 denemesi geri alındı).
- **Archer:** Piercing Arrow MP 4 -> 3; Aimed Shot 2,75 -> 2,85.
- **Druid:** Thorn Whip 1,5 -> 1,72; Rejuvenate ilk şifa 1,2 -> 1,35 ve tur başı 0,4 -> 0,45 (ilk şifa = tur şifası x 3 kuralı korunur).
- **Defender:** Tremor Slam 0,38 -> 0,36; Taunt kalkanı 0,15 -> 0,3; Fist Crush 1,5 -> 1,42. (Zırh 19 -> 20 denemesi Defender'a karşı Defender kalan savaşı bitmez yaptı: geri alındı.)
- **Anti-Mage:** Mana Steal 1,7 -> 1,55; Void Strike 3,3 -> 3,15; Drain Field yakım maks MP'nin %58'i -> %55'i, manası biten hedefe hasar 1,6 -> 1,45 (%50 denemesi Anti-Mage'i %46'ya düşürdü).
- **Gambler:** Loaded Dice 1,6 -> 1,55; High Stakes 2,3 -> 2,2; Card Trick 1,4 -> 1,3 ve MP 8 -> 9; All In 2,2 -> 1,98.
- **Cutthroat:** Backstab 3,2 -> 3,05 (Venom Edge 2,0 -> 1,92 denemesi payını %20 altına indirdi; geri alındı).
- **Hexer:** Withering Curse 0,47 -> 0,45.

### Test değişiklikleri (gevşetilmedi)
- `balance-checks.ts`: ultimate yalnızca class ortalaması (Ömer kararı); %35 altı tek class uyarı; Abyssal Cry `PENDING_SKILLS`'ten çıktı. `balance.json > bands.ultimateLowWarn: 35`; `npm run sim` raporu aynı uyarıyı yazar.
- `abyssal-fury.test.ts`: bonus STR oranı ölçümünde Warrior STR'si iki savaşta da x4 (Double Strike 0,8'de vuruş ~6 hasar; tam sayı yuvarlaması oranı %50 -> %67 gösteriyordu).
- `match-log.test.ts`: kırpma sınırı tam kaydın %60'ı ile 60.000'in küçüğü (savaş kısalınca kayıt 60.000'in altına düşüyordu; kırpmanın gerçekten olduğu da ayrıca doğrulanır).
- YZ bağlam testleri (Aimed Shot / Fist Crush / All In seçimleri) değiştirilmedi; sayılar bunlara uyacak şekilde seçildi (Quick Shot 0,62 aynı kaldı, Fist Crush 1,42, All In 1,98).

## Denge turu 2026-10-08 (balance-tester, Opus; madde 261)

### Ölçüm yöntemi
Başlangıç ve sonuç: 4'e 4, grup başına 10.000 savaş, seed 1.. ve 500001... Her ayar turundan sonra 10.000 savaşla yeniden ölçüldü (19 tur). Teşhis için ayrıca karar başına YZ adaylarının puanları okundu (skill uygun olduğunda kaç kez seçiliyor, kaybettiğinde puanı seçilenin yüzde kaçı).

### Class kazanma oranı, ölüm, hamle, ultimate (4'e 4)

| Class | Önce (grup 1 / 2) | Sonra (grup 1 / 2) | Ölüm önce → sonra | Hamle/birim önce → sonra | Ultimate ≥1 kez (hazır olanlar) önce → sonra (ham) |
|---|---|---|---|---|---|
| Warrior | %64,0 / %65,1 | %52,9 / %54,4 | %46 → %52 | 4,3 → 5,1 | %8 → %21 (%18) |
| Paladin | %48,4 / %50,1 | %47,6 / %47,6 | %54 → %55 | 4,2 → 4,7 | %96 → %96 (%92) |
| Mage | %52,1 / %53,0 | %52,9 / %53,1 | %68 → %67 | 1,9 → 2,3 | %79 → %87 (%58) |
| Undead | %53,2 / %52,4 | %50,2 / %51,5 | %51 → %53 | 4,1 → 4,9 | %34 → %54 (%54) |
| Archer | %46,7 / %46,6 | %47,0 / %45,0 | %71 → %72 | 4,6 → 4,9 | %95 → %91 (%71) |
| Druid | %43,1 / %41,4 | %45,7 / %45,8 | %69 → %68 | 3,2 → 3,7 | %58 → %60 (%60) |
| Defender | %46,9 / %47,5 | %46,8 / %46,4 | %54 → %55 | 4,7 → 5,2 | %74 → %90 (%82) |
| Anti-Mage | %53,9 / %51,4 | %52,4 / %53,7 | %70 → %68 | 2,6 → 3,5 | %80 → %96 (%60) |
| Gambler | %59,8 / %59,0 | %54,4 / %53,1 | %53 → %57 | 4,3 → 4,8 | %81 → %82 (%66) |
| Cutthroat | %45,6 / %46,2 | %51,8 / %51,2 | %81 → %78 | 2,8 → 3,5 | %92 → %92 (%54) |
| Hexer | %36,5 / %37,4 | %48,0 / %47,9 | %68 → %60 | 2,9 → 3,4 | %76 → %71 (%47) |

- Ultimate class ortalaması: %70,4 → **%76,3** (hedef >= %50). Tek tek %50 altında yalnızca Abyssal Cry.
- Savaş süresi (4'e 4): **30,5 / 30,7 → 35,7 / 36,0 tur** (bandın alt kenarına yakın; aşağıda soru).
- Taraf: %50,1 / %50,0. Bitmeyen savaş: 10.000'de 7-10.

### Skill kullanım payı (4'e 4, grup 1; grup 2 her satırda ±0,7 içinde)

| Class | Skill | Kategori | Önce | Sonra |
|---|---|---|---|---|
| Warrior | Double Strike | temel | %55,0 | %43,6 |
| Warrior | Whirlwind | normal | %8,3 | %20,7 |
| Warrior | Charge | normal | %33,0 | %29,6 |
| Warrior | Abyssal Cry | ultimate | %1,4 | %3,6 |
| Paladin | Holy Strike | temel | %16,8 | %21,8 |
| Paladin | Resurrection | durumsal | %12,4 | %10,4 |
| Paladin | Judgment | normal | %20,0 | %17,8 |
| Paladin | Radiance | ultimate | %31,1 | %30,2 |
| Mage | Fire Bolt | temel | %26,1 | %22,7 |
| Mage | Blizzard | normal | %31,0 | %30,4 |
| Mage | Mana Barrier | durumsal | %14,6 | %15,5 |
| Mage | Meteor | ultimate | %27,2 | %29,2 |
| Undead | Bone Throw | temel | %45,3 | %34,5 |
| Undead | Wail of the Dead | normal | %37,6 | %34,8 |
| Undead | Dark Bond | durumsal | %1,6 | %14,5 |
| Undead | Raise Dead | ultimate | %9,2 | %12,4 |
| Archer | Quick Shot | temel | %35,7 | %30,3 |
| Archer | Piercing Arrow | normal | %12,3 | %17,2 |
| Archer | Arrow Rain | normal | %24,5 | %23,2 |
| Archer | Aimed Shot | ultimate | %25,0 | %22,7 |
| Druid | Thorn Whip | temel | %19,3 | %24,8 |
| Druid | Nature's Wrath | normal | %31,4 | %30,4 |
| Druid | Rejuvenate | normal | %28,0 | %25,2 |
| Druid | Summon Treant | ultimate | %18,0 | %16,9 |
| Defender | Tremor Slam | temel | %53,1 | %42,7 |
| Defender | Taunt | normal | %21,1 | %22,2 |
| Defender | Guard | durumsal | %5,5 | %9,4 |
| Defender | Fist Crush | ultimate | %16,2 | %19,2 |
| Anti-Mage | Mana Steal | temel | %72,2 | %37,9 |
| Anti-Mage | Drain Field | normal | %0,6 | %21,6 |
| Anti-Mage | Spell Ward | durumsal | %9,8 | %14,4 |
| Anti-Mage | Void Strike | ultimate | %15,7 | %21,8 |
| Gambler | Loaded Dice | temel | %30,9 | %22,1 |
| Gambler | High Stakes | normal | %4,0 | %18,3 |
| Gambler | Card Trick | normal | %38,4 | %34,0 |
| Gambler | All In | ultimate | %19,4 | %17,6 |
| Cutthroat | Venom Edge | temel | %7,9 | %22,8 |
| Cutthroat | Saltire Cut | normal | %34,6 | %24,5 |
| Cutthroat | Smoke Bomb | normal | %33,5 | %28,3 |
| Cutthroat | Backstab | ultimate | %16,0 | %17,1 |
| Hexer | Evil Eye | temel | %38,3 | %29,4 |
| Hexer | Withering Curse | normal | %38,9 | %34,4 |
| Hexer | Jinx | durumsal | %2,0 | %15,0 |
| Hexer | Doom Mark | ultimate | %15,6 | %14,2 |

Önce bant dışı: 15 skill + 4 class. Sonra bant dışı: yalnızca Abyssal Cry (ultimate). Banda yakın kenarlar: Wail of the Dead ve Withering Curse (%34,4-34,8, üst sınır 35), Guard (%9,4-9,8, alt sınır 8).

### Karşılaşma tablosu (ezici eşleşmeler)
- Önce: **Warrior > Hexer %76** (1.362 savaş; ezici). Sonraki en uçlar: Warrior > Druid %71, Gambler > Hexer %69.
- Sonra: **ezici eşleşme yok**; en uç eşleşmeler %57-60 (Mage > Defender %58-60, Anti-Mage > Paladin %58-59, Gambler/Mage > Druid %57-58, Warrior > Hexer %59 grup 2). Tam 11x11 tablo `npm run sim` raporunda.

### Kontrol: 5'e 5 ve 3'e 3 (sonra, 10.000 savaş, seed 1)
- 5'e 5: süre 42,5 tur; tüm class'lar %46,6-55,4 (bantta). Bant dışı paylar: Fire Bolt %19,9, Holy Strike %17,9, Venom Edge %16,6 (temel saldırılar biraz düşük: kalabalık takımda alan skill'leri daha değerli), Card Trick %36,7, Wail %36,2; Abyssal Cry yine düşük.
- 3'e 3: süre 29,3 tur; Gambler %58,7, Warrior %56,8, Druid %42,7 (küçük sapma); diğerleri %44,3-54,7. Az düşmanda alan skill'leri değer kaybediyor: Tremor Slam %55, Quick Shot %47, Mana Steal %48, Arrow Rain %10,6, Drain Field %14,4.

### Değişiklikler (eski -> yeni; hepsi veri)
- **Ömer kararları:** varsayılan takım 5 -> 4; Abyssal Cry can bedeli maks canın %30'u -> %15, Rage bedeli 40 -> 30, Warrior maks Rage 100 -> 50 (`formulas.json > rage.max`); can tabanı (`attributes.hpBase`) 20 -> 30 (Defender'ın sabit canı 135 -> 145, aynı +10); Dark Bond MP 8 -> 0; Mage zırhı 4 -> 6, Anti-Mage 4 -> 6, Cutthroat 4 -> 5; Drain Field yeni mekanik (engine-dev, madde 260) sayıları: yakım maks MP'nin %58'i (pctMax 0,3 -> 0,58), MP bedeli 14 -> 6, mana biten hedefe hasar gücü 1,0 -> 1,6 (Silence %50 / 1 tur aynı).
- **Warrior:** Double Strike vuruş başına 1,1 -> 0,9; Whirlwind MP 15 -> 8, güç 1,3 -> 1,5; Charge 2,0 -> 1,5.
- **Paladin:** Holy Strike 0,58 -> 0,85.
- **Mage:** Fire Bolt MP 5 -> 3, güç 2,25 -> 2,1; Blizzard 1,58 -> 1,5.
- **Undead:** Bone Throw 1,1 -> 1,12; Wail of the Dead 1,35 -> 1,27; Dark Bond bağ oranı 1 -> 1,5 (dost, Undead'in iyileştiğinin %150'si kadar iyileşir); Raise Dead MP 14 -> 8; Skeleton STR 13 -> 15.
- **Archer:** Quick Shot 0,44 -> 0,62; Piercing Arrow MP 8 -> 4, güç 1,08 -> 1,35; Arrow Rain 0,74 -> 0,88; Aimed Shot 2,65 -> 2,75.
- **Druid:** Thorn Whip 1,12 -> 1,5; Nature's Wrath 0,92 -> 1,12; Summon Treant MP 25 -> 16; zırh 6 -> 8.
- **Defender:** Tremor Slam 0,8 -> 0,38; Guard MP 10 -> 2, aktarılan pay %50 -> %60; Fist Crush 1,3 -> 1,5.
- **Anti-Mage:** Mana Steal 3,0 -> 1,7; Void Strike 3,6 -> 3,3.
- **Gambler:** Loaded Dice 1,7 -> 1,6; High Stakes MP 6 -> 4, güç 1,9 -> 2,3; Card Trick 1,7 -> 1,4.
- **Cutthroat:** Venom Edge 1,1 -> 2,0; Saltire Cut MP 9 -> 7; Smoke Bomb MP 10 -> 8.
- **Hexer:** stat str/int 6/7 -> 8/5 (can +12, MP -4; toplam 30); Evil Eye 0,9 -> 1,3; Withering Curse MP 10 -> 14, güç 0,5 -> 0,47; Jinx MP 6 -> 2, güç 0,5 -> 1,1 (yerleşik kritik +%25 engine-dev'den, aynı); Doom gücü Omen başına 0,6 -> 1,0 (`statuses.json > omen.doom.powerPerStack`).
- Hasar ölçekleme kuralı (stat başına %1) korunur: yalnızca güç/bedel/oran sayıları değişti; yeni ölçeksiz hasar yok. Süreler (cooldown, durum turları) değişmedi.

### Savaş süresi kolu
Genel kol olarak **can tabanı** seçildi (Ömer: 20 -> 30): her birime aynı mutlak can ekler, bu yüzden en kırılganları (Mage, Hexer, Cutthroat, Anti-Mage) oransal olarak en çok korur ve "1,9 hamlede ölüyor" sorununu hafifletir; Str'e bağlı can (`hpPerStr`) ise zaten güçlü olan Warrior'ı büyütürdü. Genel hasar çarpanı (`scaling`) da şifa/kalkanı aynı oranda küçülttüğü ve "stat başına %1" okunuşunu bozduğu için seçilmedi. Ölçüm: taban 40 denemesi 37,4 tur; 30 ile sonuç 35,7-36,0 (5'e 5: 42,5).

### Ömer onayı bekleyen yeniden tasarım önerileri (UYGULANMADI)
- **Abyssal Cry (Warrior ultimate'ı, hazır olanlardan %20-21 kullanım):** Teşhis: sayı değil tasarım + YZ değeri. Saf savunma buff'ı (Fortified: 3 tur %50 az hasar) yalnızca Warrior'a gelen hasarı azaltır; düşman YZ'si can ORANI en düşük hedefe odaklandığı için Warrior az vurulur; buff'ın puanı (medyan -2, en iyi %10'da 27) saldırıların (ortalama 50) çok altında. Rage 40 -> 30 ve maks 50, Fortified'ı %70'e çıkarma denemesi kullanımı değiştirmedi (%20 -> %21; Fortified denemesi geri alındı). Öneri A: Abyssal Cry 2 tur boyunca Warrior'ı **tek hedefli saldırıların zorunlu hedefi** yapsın (Taunt benzeri, "üstüme gelin" çığlığı); Fortified o zaman anlam kazanır, Defender'sız takımlara ön saf verir. Beklenen: kullanım %50+, Warrior gücü yaklaşık aynı. Öneri B: savaş çığlığı saldırgan olsun: Fortified + sonraki 2 saldırısı +%30 hasar (ya da düşmanlara 1 tur Slow). Beklenen: kullanım %60+, Warrior bir miktar güçlenir (Double Strike'ı biraz düşürmek gerekebilir).
- **Guard (%9,4; 3'e 3'te %6,4):** bant içinde ama kenarda; az kişide kurtarılacak dost yok. Öneri (isteğe bağlı): Guard korunan dosta küçük bir kalkan da versin (Taunt'taki gibi). Beklenen: %12-15.

## Önceki notlar
- Normal savaş: ortalama 4-7 oyuncu aksiyonu / karakter başına yaklaşık 3-5 tur. Boss savaşı: 10-15 tur (taslak, sefer için).
- Ömer "X zayıf/güçlü" dediğinde: önce rapor, sonra veri dosyasında ayar, sonra yeni rapor.
- Eski hedef (2026-10-04): sınıf kazanma %40-60, 5'e 5; bu bölümdeki bantlarla değişti.

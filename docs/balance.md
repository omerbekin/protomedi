# Denge Hedefleri

## Hedef bantlar (Ömer kararı 2026-10-08; madde 261)
Sayılar `data/balance.json` dosyasındadır; `npm run sim` raporu ve `tests/balance.test.ts` + `tests/balance-b.test.ts` (ortak kontroller `tests/balance-checks.ts`) oradan okur.

| Ölçüm | Hedef |
|---|---|
| Ana ölçüm | **4'e 4** (varsayılan takım boyutu 4; `random-battle.json > random.size`), 10.000 savaş, iki farklı seed grubu (1.. ve 500001..). 5'e 5 ve 3'e 3 yalnızca kontrol |
| Class kazanma oranı | **%44-56** (her iki seed grubunda) |
| Bedelsiz temel saldırı (class'ın 1. skill'i) kullanım payı | **%20-45** |
| Normal skill (2.-3. yuva, durumsal olmayan) | **%15-35** |
| Durumsal destek skill'leri (`balance.json > situational`: Guard, Mana Barrier, Spell Ward, Jinx, Dark Bond, Resurrection) | **%8-25** |
| Ultimate (class'ın 4. skill'i) | birim hayattayken ultimate'ı ilk kez kullanılabilir olduğu (kendi turunda kullanılabilir) savaşlarda en az bir kez kullanma oranı, **class ortalaması >= %50**; ham oran (tüm birimler) da raporlanır |
| Savaş süresi (tüm birimlerin turları toplamı, 4'e 4) | ortalama **35-50 tur** |
| Karşılaşma tablosu (A class'ının B class'ına karşı kazanma oranı; karşı taraflarda, aynı takımda değilken) | eşitlik HEDEFLENMEZ; yalnızca ezici eşleşmeler (> %75 / < %25, en az 200 savaş) işaretlenir |
| Taraf (oyuncu/düşman) | %45-55 |

- **Kullanım payı** = skill'in, class'ın TÜM hamleleri (Rest / Skip Turn / Move dahil) içindeki yüzdesi.
- Yapay zeka her iki tarafta Medium (tam terazi).
- Test grup başına `balance.json > test.runs` (5.000) savaşla iki ayrı seed grubunda (900001.., 300001..) aynı bantları korur; iki dosya paralel koşar (~1,5 dk). Tam ölçüm: `npm run sim` (argümansız: 2 x 10.000, tek çekirdekte birkaç dakika) ya da `npm run sim -- <savaş> <seed> [boyut] [boyut]`.

## Dengesi / bandı bekleyenler (geçici muafiyet; normalde BOŞ)
- `tests/balance-checks.ts > PENDING_BALANCE` (class bandı): **boş**. Hexer bu turda bantta (%48) olduğu için listeden çıkarıldı.
- `tests/balance-checks.ts > PENDING_SKILLS` (skill/ultimate bandı): **Abyssal Cry** (Warrior ultimate'ı, hazır olanlardan en az bir kez kullanma %20-21). Sayılarla çözülmedi; yeniden tasarım önerisi aşağıda, Ömer onayı bekliyor. Ölçülür ve test çıktısına uyarı olarak yazılır.

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

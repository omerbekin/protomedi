# Item (eşya) sistemi: tasarım belgesi (TASLAK / ÖNERİ)

> **Durum: TASLAK, uygulanmadı (2026-10-09).** Bu dosyadaki hiçbir şey `data/`, `src/`, `tests/` ya da `assets/` içine yazılmadı. Tüm sayılar **PROVİZYON**dur: son ayar `balance-tester`'ın `npm run sim:campaign` ölçümüyle yapılır. JSON blokları yalnızca şema taslağıdır.
>
> Hazırlayan: content-designer (Opus). Kaynaklar: `docs/design/future-ideas.md` (Item satırları), `docs/design/campaign/campaign.md` (v5), `docs/balance.md` (bantlar + sefer dengesi), `docs/design/combat.md` (Savaş kurulum seçenekleri, hasar ölçekleme kuralı), `data/classes/*.json`, `data/formulas.json`, `src/engine/stats.ts`.
>
> Paralel belge: `docs/design/progression/roadmap.md` (campaign-dev: genel ilerleme yol haritası, sefer reworkü, endless). Bölüm (chapter) sayısı, bölüm başına durak ve farm kuralı orada kesinleşir; bu belge onlara **parametreyle** bağlanır (bölüm = `chapter`, düğüm derinliği = `depth`), sabit varsaymaz.

### Ömer'in kararları (bu belgenin çerçevesi, 2026-10-09)
| # | Karar |
|---|---|
| K1 | İlerleme sistemlerinden **önce ITEM** yapılır. |
| K2 | Item / level / skill ağacı şimdilik **YALNIZCA seferde** (ileride endless modda da). Quick Battle ve multiplayer'a dokunmaz. |
| K3 | İleride QB/MP'de "belli bir **altın limitiyle** karakterleri itemleme" olabilir: **her item'in bir değeri/fiyatı olsun.** |
| K4 | **Set item'leri** olabilir. |
| K5 | Sefer **en az 3 bölüm**: uzun ilerleme; item'ler bölüm boyunca güçlenmeli. |
| K6 | **Dengeyi çok bozmadan.** |
| (eski) | Loot seferde savaşlardan düşer, karakterlere takılır; klasik yuvalar: zırh, ayakkabı, eldiven, silah vb. Zorluk ileride loot miktarını belirleyebilir (future-ideas). |

---

## 0. Özet (tek paragraf)

Her kahramanın **6 yuvası** var (Weapon, Helm, Armor, Gloves, Boots, Trinket). Item'ler **5 nadirlikte** (Common, Uncommon, Rare, Epic, Legendary) + ayrı **Set** etiketi. Her item'in bir **item seviyesi (ilvl)** var: bölüm 1 = 1-10, bölüm 2 = 11-20, bölüm 3 = 21-30; ilvl ve nadirlik item'in **güç bütçesini (Item Points, IP)** belirler. **1 IP ≈ karakterin savaş gücüne +%1** (ölçü tanımı 4.1). Item'ler yalnızca **statı** büyütür (STR/DEX/INT/LUCK, can, zırh, büyü zırhı, Might = skill gücü yüzdesi, kritik, isabet, kaçınma...); **düz hasar YOK** (hasar ölçekleme kuralı korunur). Skill'i değiştiren efektler **skill ağacına** bırakılır; Legendary ve Set'lerde yalnızca küçük, genel "trait"ler var. **Altın değeri = 10 x IP**: aynı sayı tüccar fiyatı, QB/MP altın limiti ve endless "Gear Score"udur. Hedef güç eğrisi: bölüm sonlarında item'den **+%15 / +%30 / +%45** (roadmap 1.3 item sütunu); düşmanlar bunun **~%80**'i kadar büyür ("beklenen ekipman telafisi", roadmap'in bölüm seviyesi ölçeğinin item payı), yani iyi loot hissedilir ama sefer dengesi kaymaz. Hızlı savaş (4'e 4) etkilenmez: item'ler `UnitSetup.modifiers` üzerinden yalnızca sefer savaşına girer.

---

## 1. Item yapısı

### 1.1 Yuvalar: 6

| Yuva (in-game) | Ne verir (ağırlıklı) | Bütçe payı (`slotWeight`) | Gerekçe |
|---|---|---|---|
| **Weapon** | Might (skill gücü %), ana stat | **1,5** | Karakterin "aracı"; en büyük tek parça. Arketipe bağlı (1.2). |
| **Armor** (gövde) | zırh, büyü zırhı, can | **1,3** | Savunmanın ana parçası. |
| **Helm** | can, zırh, isabet | 0,8 | |
| **Gloves** | Might, kritik, isabet | 0,8 | Saldırı ikincil yuvası. |
| **Boots** | kaçınma, zırh, (Epic+) hız | 0,8 | Hız yalnızca burada ve sınırlı (1.6). |
| **Trinket** (yüzük/muska/tılsım) | ne olursa (MP, yenilenme, LUCK, büyü zırhı) | 0,8 | "Joker" yuva; Legendary trait'lerin çoğu burada. |
| | | **toplam 6,0** | |

**Neden 6 (4 ya da 8 değil):**
- Ömer'in saydığı klasik yuvalar (silah, zırh, ayakkabı, eldiven) + kafa + takı = tanıdık medieval RPG düzeni; her yuvanın ayrı bir "tadı" var (yukarıdaki sütun), bu yüzden loot çeşitli hisseder.
- 4 kişi x 6 = **24 takılı item**: telefonda yönetilebilir. 8 yuvada (ikinci yüzük, kolye, pelerin, kalkan) 32 item olur, loot sayısı ve arayüz yükü artar, her item'in etkisi küçülür (zaten küçük, bkz. 4.1).
- İkinci Trinket (ring 2) ileride endless için kolayca eklenir (veride yuva listesi).
- **Kalkan ayrı yuva değil**: Defender'ın kalkanı silahıdır (aşağıda); tek elle/iki elle ayrımı yok (sprite'lar sabit, görsel karşılığı olmaz).

### 1.2 Silah türü kısıtı: sınıf arketipine bağlı "silah aileleri" (öneri)

Karakter sprite'ları sabit (item görünüşü değiştirmez), bu yüzden kısıt yalnızca **tema ve loot okunurluğu** içindir: "Mage bir balta takmasın". Sınıf başına tek silah türü 11 ayrı loot havuzu demek (loot çok dağılır); tamamen serbest silah ise temayı bozar. Öneri: **6 silah ailesi**, her sınıf 1-2 aileden kullanır; diğer 5 yuva **herkese serbest** (statlar kendiliğinden doğru sınıfa çeker).

| Aile (in-game) | Örnek tabanlar | Kullanan sınıflar |
|---|---|---|
| **Axes & Swords** | Woodcutter's Axe, Bearded Axe, Arming Sword, Dane Axe | Warrior, Anti-Mage |
| **Maces & Shields** | Flanged Mace, Oak Tower Shield, Morning Star, Iron Bulwark | Defender, Paladin, Warrior |
| **Bows** | Hunting Bow, Yew Longbow, Warbow | Archer |
| **Daggers** | Rondel Dagger, Misericorde, Twin Stilettos | Cutthroat, Anti-Mage |
| **Staves** | Ash Staff, Rune Staff, Bone Staff, Druid's Crook | Mage, Druid, Undead |
| **Charms** (odak nesnesi) | Worn Deck, Loaded Bones, Hex Doll, Gallows Nail | Gambler, Hexer |

- Veride: `items.json > weaponFamilies` + sınıf başına izin listesi (`classWeapons: { warrior: ["axes", "maces"] ... }`); sınıf dosyalarına dokunmadan.
- Loot silah düşürürken aileyi **aktif takımın kullanabildiği** aileler arasından seçer (3.5, "akıllı loot").

### 1.3 Nadirlik: 5 kademe + Set

| Nadirlik | Çerçeve rengi (medieval palet) | `rarityMult` (bütçe) | Ek stat satırı (affix) | Not |
|---|---|---|---|---|
| **Common** | demir grisi `#8a8a84` | 0,7 | 0 (yalnızca taban stat) | |
| **Uncommon** | yosun yeşili `#5f8f3e` | 1,0 | 1 | |
| **Rare** | çelik mavisi `#3f6fa8` | 1,3 | 2 | |
| **Epic** | kraliyet moru `#7a3f9a` | 1,6 | 3 | hız yalnızca Epic+ |
| **Legendary** | kor turuncusu `#d9741c` (oyunun adı: *Embers*) | 2,0 | sabit (el yapımı) + 1 **trait** | adı ve hikâyesi olan tek item |
| **Set** (etiket) | bakır pası / yeşil-turkuaz `#3f8f84` | parça başına 1,3 + set bonusu | sabit | 2/3/4 parça bonusları (1.8) |

Neden 5: oyuncuların okuduğu evrensel dil (gri-yeşil-mavi-mor-turuncu); 4 kademe Epic/Legendary arasındaki "özel" hissi kaybettirir, 6+ kademe küçük bütçede (4.1) birbirinden ayırt edilemez.

### 1.4 Item seviyesi (ilvl) ve bölüm kademesi

- **ilvl = bölümün tabanı + düğümün bölüm içindeki derinliği.** Öneri: bölüm 1 = ilvl **1-10**, bölüm 2 = **11-20**, bölüm 3 = **21-30** (bölüm başına ~10 savaş durağı; roadmap durak sayısını değiştirirse `ilvlPerStop` ile ölçeklenir). Endless'ta ilvl 30'un üstüne devam eder (yumuşak tavan, 4.5).
- **Seviye bütçesi:** `B(ilvl) = 1 + 0,2 x ilvl` → ilvl 5 = 2, ilvl 10 = 3, ilvl 20 = 5, ilvl 30 = 7.
- **Item bütçesi:** `IP = slotWeight x B(ilvl) x rarityMult` (±%10 tolerans; tam sayıya yakın, "güzel" stat değerleri için).
- Bölümün adı item adına girmez; ama taban isimleri bölüme göre sertleşir (bölüm 1 köylü/haydut malı: *Woodcutter's Axe, Padded Gambeson*; bölüm 2 asker malı: *Riveted Mail, Arming Sword*; bölüm 3 şövalye/rün malı: *Plate Harness, Rune Staff*). Bu "kademe" tabanların `minIlvl`'i ile sağlanır, ayrı tür gerekmez.

### 1.5 Stat havuzu (item'de olan / olmayan)

**1 IP ≈ +%1 savaş gücü** (tanım 4.1). Referans karakter: can ~120, ana stat 15, zırh 8, hız ~9.

| Stat (in-game kısaltma) | Motordaki karşılığı | IP değeri | Item'de | Not |
|---|---|---|---|---|
| **STR / DEX / INT / LUCK** | `attrAdd` (var) | **5 IP / puan** | Rare+ (ve Weapon/Legendary) | Fiyat "en iyi kullanıcıya" göre: ana stat gibi fiyatlanır. Yalnızca tam sayı. |
| **Max HP** | `hpAdd` (YENİ) | 0,4 IP / can (10 can = 4) | her yuva | Defender'ın sabit canına (`overrides.hp`) da eklenir. |
| **Armor** | `armorAdd` (var) | 0,8 IP / puan | Armor, Helm, Boots, Gloves | |
| **Magic Armor** | `magicArmorAdd` (var) | 0,5 IP / puan | Armor, Helm, Trinket | |
| **Might** (+% skill gücü) | `powerMult` (var; toplanarak) | 0,5 IP / %1 | Weapon (taban stat), Gloves | Hasar, şifa, kalkan, zemin, DoT, Doom hepsi; **hasar ölçekleme kuralıyla uyumlu**: hâlâ skill statının yüzdesi, yalnızca yüzde büyür. |
| **Crit** (kritik şansı) | `critAdd` (YENİ) | 0,25 IP / %1 | Gloves, Trinket | Tavan: item'lerden toplam +%15. |
| **Crit Damage** | `critMultAdd` (YENİ) | 0,5 IP / +%10 | Epic+ Gloves/Weapon | |
| **Accuracy** | `accuracyAdd` (YENİ) | 0,6 IP / %1 | Helm, Gloves | Tavan +%10. |
| **Evasion** | `evasionAdd` (YENİ) | 0,6 IP / %1 | Boots, Armor (hafif) | Tavan +%10 (Dex'in `evasionMax`'ı ayrıca geçerli). |
| **Speed** | `spdAdd` (YENİ, 0,5 adım) | 5,5 IP / 1 hız | **yalnızca Epic+ Boots ve Legendary**, item başına en çok +0,5 | Sıra sistemi en hassas yer: tavan item'lerden toplam +1,5. |
| **Max MP** | `mpAdd` (YENİ) | 0,1 IP / MP (10 MP = 1) | Trinket, Helm | |
| **MP Regen** | `mpRegenAdd` (YENİ) | 2 IP / +1 | Trinket, Staves | |
| **HP Regen** | `hpRegenAdd` (YENİ) | 4 IP / +1 | Trinket, Armor | |

**Bilerek item'de OLMAYANLAR** (skill ağacına ya da hiçbir yere):
- **Düz hasar** ("+5 damage") ve "+X fire damage": hasar ölçekleme kuralını (stat başına yüzde) bozar. Element bonusu ileride gerekirse "Might vs element %" olarak engine-dev ile ayrıca.
- **Cooldown azaltma, turnCost, başlangıç cooldown'u, MP bedeli indirimi, Rage**: ultimate/skill kullanım bantlarını (balance.md) doğrudan kırar. Skill ağacının işi.
- **Lucky Escape / Resilience / Mana Echo / Hunter's Mark şansları**: primary kimliğinin parçası; item yalnızca küçük bir trait olarak (1.7) dokunabilir.

**Primary kuralı (önemli, engine-dev):** motor primary bonusunu "ana stat en yüksek statsa" açıyor (`deriveStats > isPrimaryActive`). Item'le eklenen stat bunu **çevirebilir**: Paladin STR 12 / INT 13, +2 STR'li bir zırhla Mana Echo'yu kaybeder; Undead (12/14) ve Gambler (8/12) da yakın. **Öneri: primary'nin açık olup olmadığı sınıfın TEMEL statlarına göre karar verilir; item ekleri bunu değiştirmez** (`UnitModifiers.primaryFromBase` ya da `applyUnitModifiers` içinde `attrAdd`'den önceki statlarla). Sefer düşmanlarındaki `statMult` tek tip çarptığı için onlarda zaten çevrilmiyor.

### 1.6 Affix sistemi: karışık (öneri)

| Seçenek | Artı | Eksi |
|---|---|---|
| Tamamen sabit item'ler (el yapımı katalog) | belirleyici, denge kolay, QB/MP kataloğu hazır | tekrar oynanınca loot aynı; çok veri yazmak gerek |
| Tamamen rastgele affix | sonsuz çeşit, endless'a uygun | uç kombinasyon (ör. +%15 kritik + hız) dengesini zorlar; isimler çorba |
| **Karışık (öneri)** | taban + bütçeye göre seed'li affix; Legendary/Set el yapımı | iki yol birden (ama MVP yalnızca sabit) |

**Kural:**
- **Taban (base):** yuva + aile + `minIlvl` + **taban stat** (Weapon: Might; Armor: zırh; Boots: zırh/kaçınma...). Bütçenin ~%50'si.
- **Affix'ler (Common 0, Uncommon 1, Rare 2, Epic 3):** kalan bütçe, yuvaya izinli affix havuzundan **seed'li** seçilir (`hash(campaignSeed, nodeId, "loot", n)`), değerler bütçeye göre hesaplanır ve "güzel" sayıya yuvarlanır. Aynı affix iki kez gelmez. Bir item'de en çok 1 ana stat affix'i (STR/DEX/INT/LUCK).
- **Adlandırma:** önek (prefix) + taban + sonek (suffix): *Sturdy Riveted Mail of the Bear*. En güçlü affix sonek olur; Rare'de 2 affix'ten biri önek biri sonek; Epic'te üçüncü affix adda görünmez (tooltip'te).
- **Legendary ve Set:** tamamen sabit (adı, statı, trait'i el yapımı), ilvl'ye göre yalnızca sayılar ölçeklenir.
- **Neden:** tekrar oynanan seferde loot farklı ama her item'in IP'si (dolayısıyla fiyatı ve gücü) hep bütçe formülünden gelir; denge "item kaç IP" sorusuna iner. QB/MP için rastgelelik kapatılıp yalnızca **sabit katalog** (tabanlar referans ilvl'de + Legendary/Set) kullanılır (2.3).
- **MVP:** affix üreteci YOK; ~40 el yapımı item (affix'leri önceden "atılmış" gibi yazılmış). Üreteç aşama 2 (bölüm 6).

### 1.7 Özel efektler: skill değiştirme skill ağacına (öneri: evet)

- "Fire Bolt +1 hedef", "Whirlwind yanma bırakır" gibi **skill değiştiren efektler skill ağacına bırakılır** (future-ideas: MAJOR düğümler = skill evrimi). Gerekçe: (1) item takılıp çıkarıldıkça skill metni, YZ değeri, önizleme, ikon/vfx değişir: büyük iş; (2) 11 sınıf x 4 skill için item yazmak loot havuzunu sınıflara böler; (3) iki sistem aynı şeyi yaparsa skill ağacı değersizleşir.
- Item'lerde yalnızca **genel trait**ler: sınıftan bağımsız, motorda tek yerde uygulanan, açıklaması tek cümle. Legendary başına 1, 4 parçalı Set bonusunda 1. Aday liste (her biri engine-dev işi; MVP'de YOK):

| Trait (in-game) | Etki (provizyon) | IP tahmini |
|---|---|---|
| **Opening Ward** | savaş başında maks canın %12'si kadar kalkan | 4 |
| **Second Wind** | savaşta bir kez, can %30 altına inince maks canın %15'i şifa | 4 |
| **Giantslayer** | elit/boss rütbeli düşmana (`tier`) +%12 hasar | 3 (seferde) |
| **Steadfast** | çekilemez / itilemez (`displacement` bağışıklığı; motorda boss için var) | 2 |
| **Iron Will** | uygulanan debuff'lar %20 ihtimalle 1 tur kısalır (Resilience ile toplanır, tavan %50) | 3 |
| **Quick Start** | savaşın ilk turu sıra sayacı +25 dolu başlar | 3 |

Hepsi stat/kural ölçeklidir; düz hasar yok (Second Wind / Opening Ward maks cana oranlı).

### 1.8 Set item'leri

- Set parçası **Rare bütçesiyle** (1,3) gelir + set bonusu. Bonus IP'si parçalara bölünerek fiyata eklenir (2.1).
- **Öneri: setler sınıfa değil arketipe (STR / DEX / INT / LUCK ya da ön saf / arka saf) bağlı**; böylece her set 2-5 sınıfa yarar ve loot boşa gitmez. Sınıfa özgü set (ör. "Hexer'in Kara Kitabı") ileride endless için, skill ağacıyla birlikte düşünülür.
- Set parçaları belirli düğümlere bağlı **"hedefli" loot** olarak düşer (elit, boss, korunan hazine): oyuncu "o seti tamamlamak için o rotaya gideyim" diye seçim yapar (rota seçimine anlam katar).
- Bonuslar kademeli: 2 parça küçük stat, 3 parça orta stat, 4 parça trait. Yarım set de değerli.

**Örnek 3 set** (bölüm 2-3; sayılar ilvl 20 için):

**1) Ashguard Vigil** (ön saf, STR; Warrior / Defender / Paladin / Undead) - 4 parça: *Ashguard Helm, Ashguard Hauberk, Ashguard Gauntlets, Ashguard Greaves*. Kaynak: King's Bridge boss'u, Siege Line, Mine Wardens.
- 2 parça: +3 Armor, +2 Magic Armor (3,4 IP)
- 3 parça: +16 Max HP (6,4 IP)
- 4 parça: **Opening Ward** (savaş başında maks canın %12'si kalkan) (4 IP)
- Tema: Morvane'nin külüne karşı nöbet tutan sınır muhafızları; kül grisi çelik, kor kırmızısı şerit.

**2) Raven's Shroud** (gölge, DEX; Cutthroat / Archer / Anti-Mage) - 3 parça: *Raven Hood, Raven Gloves, Raven Boots*. Kaynak: Ravenwood soyu haydutlar, Iron Pass, Dragon's Spine elit.
- 2 parça: +4% Evasion, +3% Crit (3,2 IP)
- 3 parça: +0,5 Speed, +5% Crit (4 IP)
- Tema: kuzgun tüyü pelerinli yol kesiciler; siyah-mor tüy, pirinç toka.

**3) Conclave of Embers** (büyücü, INT; Mage / Druid / Undead / Paladin / Anti-Mage) - 4 parça: *Ember Staff* (Staves), *Ember Circlet* (Helm), *Ember Robe* (Armor), *Ember Signet* (Trinket). Kaynak: St. Brann's Abbey (Relic Vault), Black Cathedral, Dragon's Spine.
- 2 parça: +12 Max MP, +1 MP Regen (3,2 IP)
- 3 parça: +6% Might (3 IP)
- 4 parça: **Kindled**: Mana Echo şansı +%10 (yalnızca INT primary'lerde; diğerlerinde +%3 Might) (3 IP)
- Tema: lanete karşı ateşi koruyan büyücüler meclisi; kızıl-altın işleme, kor taşı.

### 1.9 Örnek item listesi (her yuvadan, her nadirlikten)

IP kontrolü: `slotWeight x B(ilvl) x rarityMult` (±%10). Stat IP'leri 1.5 tablosundan.

| Ad (in-game) | Yuva / aile | Nadirlik | ilvl | Statlar | IP (hedef / gerçek) | Altın (10 x IP) |
|---|---|---|---|---|---|---|
| Woodcutter's Axe | Weapon / Axes | Common | 2 | +3% Might | 1,5 / 1,5 | 15 |
| Ash Staff | Weapon / Staves | Common | 3 | +2% Might, +5 Max MP | 1,7 / 1,5 | 15 |
| Bearded Axe of the Bear | Weapon / Axes | Uncommon | 8 | +4% Might, +5 Max HP | 3,9 / 4,0 | 40 |
| Hunting Bow | Weapon / Bows | Uncommon | 6 | +4% Might, +2% Accuracy | 3,3 / 3,2 | 32 |
| Yew Longbow of the Fox | Weapon / Bows | Rare | 15 | +6% Might, +1 DEX | 7,8 / 8,0 | 80 |
| Keen Misericorde | Weapon / Daggers | Rare | 14 | +6% Might, +3% Crit, +6% Accuracy | 7,4 / 7,4 | 74 |
| Rune Staff of the Owl | Weapon / Staves | Epic | 22 | +10% Might, +1 INT, +5% Crit, +1 MP Regen | 13,0 / 13,3 | 133 |
| Padded Gambeson | Armor | Common | 1 | +1 Armor, +1 Max HP | 1,1 / 1,2 | 12 |
| Riveted Mail | Armor | Uncommon | 10 | +3 Armor, +4 Max HP | 3,9 / 4,0 | 40 |
| Brigandine of the Bear | Armor | Rare | 18 | +4 Armor, +1 STR | 7,8 / 8,2 | 82 |
| Plate Harness | Armor | Epic | 28 | +6 Armor, +3 Magic Armor, +18 Max HP | 13,7 / 13,5 | 135 |
| Leather Coif | Helm | Common | 3 | +2 Max HP | 0,9 / 0,8 | 8 |
| Nasal Helm | Helm | Uncommon | 9 | +1 Armor, +3 Max HP | 2,2 / 2,0 | 20 |
| Hounskull of the Hawk | Helm | Rare | 16 | +2 Armor, +4% Accuracy | 4,4 / 4,0 | 40 |
| Work Gloves | Gloves | Common | 2 | +3% Crit | 0,8 / 0,75 | 8 |
| Studded Gauntlets | Gloves | Uncommon | 12 | +4% Might, +1 Armor | 2,7 / 2,8 | 28 |
| Bracers of the Fox | Gloves | Rare | 20 | +1 DEX | 5,2 / 5,0 | 50 |
| Turnshoes | Boots | Common | 2 | +1 Armor | 0,8 / 0,8 | 8 |
| Riding Boots | Boots | Uncommon | 10 | +3% Evasion, +1 Armor | 2,4 / 2,6 | 26 |
| Swift Sabatons | Boots | Epic | 25 | +0,5 Speed, +2 Armor, +3% Evasion, +3 Max HP | 7,7 / 7,4 | 74 |
| Rabbit's Foot | Trinket | Common | 4 | +4% Crit | 1,0 / 1,0 | 10 |
| Pilgrim's Token | Trinket | Uncommon | 10 | +10 Max MP, +3 Magic Armor | 2,4 / 2,5 | 25 |
| Gallows Nail of the Crow | Trinket | Rare | 17 | +1 LUCK | 4,6 / 5,0 | 50 |

**Legendary örnekleri** (sabit; bölüm 2-3 boss/elit hedefli; bütçe 2,0 = trait dahil):

| Ad | Yuva | ilvl | Statlar + trait | Kaynak | Hikâye satırı (in-game, İngilizce) |
|---|---|---|---|---|---|
| **The Warden's Mooring** | Boots | 20 | +3 Armor, +8 Max HP, **Steadfast** | King's Bridge boss | *"Chained to the bridge for a hundred years. It will not let you be moved either."* |
| **Brann's Reliquary** | Trinket | 20 | +1 INT, **Second Wind** | St. Brann's Abbey (Relic Vault) | *"A finger bone of the saint, wrapped in silver. It remembers how to mend."* |
| **Emberfall** | Weapon / Staves | 30 | +12% Might, +2 INT, **Giantslayer** | Castle Morvane (bölüm sonu) | *"Carved from the last ember of the old kings' hearth."* |
| **Morvane's Ashen Crown** | Helm | 30 | +1 STR, +10 Max HP, **Iron Will** | final boss | *"Cold as the curse that wore it."* |

### 1.10 İsimlendirme ve medieval tema

- **Tabanlar gerçek ortaçağ terimleri:** gambeson, brigandine, hauberk, hounskull, sabaton, coif, turnshoes, misericorde, rondel, Dane axe, morning star, warbow. Fantezi abartısı yok ("Ultra Mega Sword" değil).
- **Önekler (sıfat):** Sturdy (zırh), Hale (can), Keen (kritik), Swift (hız), Steady (isabet), Warded (büyü zırhı), Mighty (Might), Fleet (kaçınma).
- **Sonekler (hayvan/simge):** of the Bear (STR), of the Fox (DEX), of the Owl (INT), of the Crow (LUCK), of the Hawk (isabet), of the Shadows (kaçınma), of Warding (büyü zırhı), of the Pilgrim (yenilenme).
- **Legendary/Set adları Valdoria'nın yerlerinden:** Brann, Morvane, Ashford, King's Bridge, Ravenwood. Hikâye satırı (flavor) tek cümle, İngilizce, italik.
- Oyun içi metinler İngilizce; bu belgedeki açıklamalar Türkçe.

### 1.11 İkon dili

- **Boyut:** v2 kılavuzu (`docs/design/art-v2.md`) gibi **128x128** piksel art, `PxGrid(128)`; envanter ızgarasında 64 piksele NEAREST küçültülür (ikon 64'te de okunur olmalı: kalın siluet, en çok 4-5 ana renk).
- **İkon = taban (base) başına bir çizim** (renk değil, biçim taşır): ~40 taban ikonu + Legendary/Set'e özel ~12 ikon. Nadirlik ikonun içinde DEĞİL, **kodla çizilen çerçevede**: 1.3'teki renkle 4 piksellik kenar + köşe süsü (Common düz, Uncommon köşe perçini, Rare çift çizgi, Epic köşe taşları, Legendary kor parıltısı (yavaş nabız, alfa), Set bakır pası + küçük zincir halkası simgesi).
- Arka plan: koyu parşömen/deri dokusu (tek ortak), ikon üstünde ışık sol üstten (`pixel-art.ts` otomatik kontur + ışık).
- Yuva boşken: soluk siluet (kask/çizme/eldiven çizgisi) yer tutucu.
- Silah ailesi rozeti (küçük, sağ alt): balta / topuz / yay / hançer / asa / tılsım siluetleri; böylece "bu karakter takabilir mi" bir bakışta okunur (takamazsa rozet kırmızı).

---

## 2. Değer, fiyat, güç puanı

### 2.1 Tek ölçü: Item Points (IP)

- **Altın değeri `value = 10 x IP`** (yuvarlanır, en az 5). IP = item statlarının 1.5 tablosundaki toplamı + (Legendary) trait IP'si + (Set) set bonuslarının IP'si / setin parça sayısı.
- Nadirlik "primi" yok: değeri yalnızca güç belirler. Böylece **altın = güç** ilişkisi QB/MP limitinde dürüst kalır (aynı altına aynı güç).
- IP tablosu (stat başına değer) **ölçümle düzeltilir**: balance-tester her stat için "bu stattan +X eklenen takım, eklenmeyen aynı takıma karşı" simülasyonuyla 1 IP ≈ %1 eşdeğer güç (4.1) varsayımını sınar ve `items.json > statIP` değerlerini günceller.

### 2.2 Tüccar, satma, satın alma

- **Tüccar (Merchant)** kasaba/şehirlerde (Ashford, Valdren Keep ve yeni bölümlerin kasabaları; town paneli zaten "Merchant devre dışı" yer tutucusunu taşıyor). Stok: 6 item, düğümün ilvl'sinde, nadirlik eğrisi bölümün normal loot eğrisi +1 kademe kayık, **en az 2'si aktif takımın kullanabileceği silah**; seed'li (aynı kayıtta aynı stok). Bölüm başına 1 kez yenilenir.
- **Satın alma = value**, **satma = value x 0,25**. (Ezberlenebilir oran; "çöp" item'ler altına dönüşür.)
- **Altın kaynakları:** her zafer `goldPerBattle = 4 x ilvl` (elit x2, boss x4), korunan hazine sandığı `25 x ilvl`, satış. Mercenary Camp ("Battle · Gold") altın odaklı düğüm: x3 altın, item şansı düşük. Ölçek: bölüm 1 boyunca ~300-400 altın = 2-3 Uncommon/Rare, tüccar "tamamlayıcı" kalır, loot ana kaynak.
- Altın kayıtta (`gold`), sefer başına; bölümden bölüme taşınır.

### 2.3 QB/MP "altın limitiyle itemleme" ve endless uyumu (ileride)

- **Gear Score (GS)** (in-game adı; öneri): bir kahramanın takılı item IP toplamı (+ aktif set bonusları). 1 IP ≈ +%1 olduğu için arayüzde **"Power 100 → 135"** gibi okunabilir.
- **QB/MP itemleme:** oyuncu her kahraman için (ya da takım için toplam) altın limitiyle **sabit katalogdan** (affix rastgeleliği yok: tabanlar referans ilvl'de + Legendary/Set) alır. Limit iki tarafa eşit olduğu için taraf dengesi bozulmaz; sınıf dengesi ise ayrı ölçülür (sim: YZ'nin seçtiği kitlerle 4'e 4; bantlar aynı). Bütçe seçenekleri roadmap 4'te (takım başına 0 / 500 / 1000 / 2000, varsayılan 0); 10 altın = 1 IP olduğu için 1000 altın 4 kişilik takımda kahraman başına ~+%25. Ek öneri: Legendary takım başına en çok 1.
- **Endless:** ilvl 30'u geçer; B(ilvl) ilvl 30'dan sonra yarı eğimle sürer (`0,1 x ilvl`); düşman dalga çarpanı GS ortalamasına bağlanabilir (aynı telafi kuralı, 4.2).

---

## 3. Loot

### 3.1 Kaynaklar

| Kaynak | Item | Altın | Not |
|---|---|---|---|
| Normal savaş | beklenen **0,25 x takım boyutu** item | 4 x ilvl | |
| Elit savaş | **0,5 x takım boyutu**, nadirlik zarı +1 kademe | 8 x ilvl | set parçası şansı %25 |
| Boss | **0,75 x takım boyutu** (en az 1), **en az 1 Rare+**, Legendary şansı (3.2) | 16 x ilvl | boss'a özel Legendary/Set havuzu |
| Korunan hazine (guarded) | sandık: **2 item + 0,25 x takım boyutu**, en az 1 Rare+ | 25 x ilvl | düğüme özel hedefli havuz (Dwarven Mine: zırh/eldiven ağırlıklı; Relic Vault: Trinket/INT) |
| Tüccar | satın alınır (2.2) | | |
| Olay (event) | seçeneğe bağlı (ör. Witch's Hut: "Cursed Merchant" lanetli ama güçlü item: +%30 IP, küçük eksi stat) | | olay verisi (campaign-dev) |

- Kesirli beklenti seed'li yuvarlanır (taban + kalan olasılık). Örnek: 4 kişi normal savaş = 1 item; 3 kişi = %75 ihtimalle 1 item.
- **Takım boyutuna göre ölçek** gerekçesi: item ihtiyacı kahraman sayısıyla orantılı (6 x kahraman yuva). Tutorial'da 1-2 kişiyken az item düşer; Ashford'da tutorial takımı ayrılırken **takılı item'leri torbaya bırakır** (soru 7), yeni bölük boş başlamaz.
- Beklenen toplam (3 bölüm, ~10 savaş/bölüm): bölüm 1 ~8-10, bölüm 2 ~13-15, bölüm 3 ~14-16 item → ~38 item; 24 yuva ~1,5 kez yenilenir. Yeterince "yeni şey" ama envanter boğulmaz.

### 3.2 Nadirlik eğrisi (bölüme göre; normal savaş düşüşü, %)

| Bölüm | Common | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| 1 (ilvl 1-10) | 60 | 32 | 7 | 1 | 0 |
| 2 (ilvl 11-20) | 35 | 40 | 20 | 4,5 | 0,5 |
| 3 (ilvl 21-30) | 15 | 40 | 32 | 11 | 2 |

- Elit: zar bir kademe yukarı kayar (Common sonucu Uncommon olur...). Boss: en az Rare; Legendary şansı bölüm 1 %0 (boss'a özel Legendary yok, Rare/Epic), bölüm 2 %10, bölüm 3 %20 (final boss garantili 1 Legendary ya da set parçası, oyuncu 3 seçenekten birini seçer: soru 8).
- **Zorluk etkisi (öneri, soru 6):** Easy ve Medium aynı eğri; **Hard** nadirlik zarı +%10 yukarı kayma ve altın x1,15 (zorluğun ödülü). Item SAYISI zorlukla değişmez (Easy oyuncusu item'siz kalıp daha da zorlanmasın). Veride `campaign.json > difficulties.<x>.loot` (alan zaten "ileride loot" diye ayrılmış).

### 3.3 Kötü şans koruması (pity)

- **Rare pity:** Rare+ gelmeyen her düşüşte sayaç +1; sayaç 6 olunca sonraki düşüş en az Rare, sayaç sıfırlanır.
- **Legendary pity (bölüm 2+):** 2 boss + 4 elit boyunca Legendary yoksa sonraki boss düşüşü garantili Legendary.
- **Yuva / silah koruması ("akıllı loot"):** her düşüşte yuva %50 olasılıkla takımdaki **en zayıf** (en düşük IP'li ya da boş) yuvadan seçilir, %50 tamamen rastgele. Silah düşerse ailesi %80 aktif takımın kullanabildiği ailelerden.
- Sayaçlar kayıtta (`lootState`) tutulur; yenilgi sonrası yükleme sayaçları da geri alır.

### 3.4 Kayıt hilesi ve tekrar oynanan düğümler

- **Loot seed'i denemeden bağımsız:** `hash(campaignSeed, mapId, nodeId, "loot")`, `attempt` İÇERMEZ. Yenilip son kayıttan dönmek ya da Retreat to Map loot'u değiştirmez (save-scum yok; Retreat'in "aynı seed" kuralıyla aynı ruh).
- **Farm (aynı düğümü yeniden oynama):** kural campaign-dev'in `roadmap.md > 2.2-2.3` önerisiyle AYNI (azalan getiri %60 / %40 / %25, taban %25'te kalır; boss tekrar edilmez; elitin/korunan hazinenin özel ödülü yalnızca ilk zaferde). Bu belge yalnızca loot'a özgü ekleri tanımlar:

| Oynama | Item beklentisi (x ilk zafer) | Nadirlik tavanı | Altın | Pity sayacı |
|---|---|---|---|---|
| 1. (ilk zafer) | x1 | tam eğri, hedefli havuz (set/Legendary) | x1 | işler |
| 2. | x0,6 | en çok Epic | x0,6 | işlemez |
| 3. | x0,4 | en çok Rare | x0,4 | işlemez |
| 4.+ | x0,25 | en çok Rare | x0,25 | işlemez |

  - Tekrar düğümünde item **ilvl'si düğümün (bölümün) ilvl'sinde sabit**: farm eski bölümde yüksek ilvl vermez; roadmap'in "seviye farkı cezası" item tarafında bu tavanla karşılanır. Set/Legendary hedefli havuz yalnızca ilk zaferde.
  - Pity farm'da işlemez: "farmla garantili Legendary" yolu kapalı.
  - Tekrarın loot seed'i oynama sayısını içerir (`"loot", replayCount`; roadmap 1.4 ile aynı türetim): her tekrar farklı ama belirleyici; kayıt yükleyip aynı tekrarı oynamak aynı loot'u verir.

### 3.5 Envanter

- **Ortak torba (Bag): 30 yuva** (takılı item'ler sayılmaz). Takım genişse de 30: "ne taşıyacağım" kararı küçük bir gerilim.
- Torba doluyken loot ekranı item'i otomatik almaz: "Bag full: sell or discard" (tek dokunuşla en düşük IP'liyi sat önerisi). Item kaybolmaz; karar verilene kadar loot ekranından çıkılmaz.
- "Junk" işareti + tüccarda **Sell all junk** (Common'ları ve takımdan kimsenin kullanamadığı silahları işaretler).
- Kadrodan ayrılan kahramanın (tutorial vedası, ileride ölüm/değişim) item'leri torbaya düşer; torba taşarsa geçici "Overflow" listesinde kalır.

---

## 4. Güç bütçesi ve denge

### 4.1 Ölçü: "eşdeğer güç" E

- **Tanım:** item'li bir takımın gücü E = aynı takımın item'siz ama tüm birimlerine `hpMult = powerMult = E` verilmiş hâli kadar. (Ölçülebilir: sim ayna maçında %50 kazanmayı veren E aranır.)
- **1 IP ≈ +%1 E** (kahraman başına). 1.5'teki stat değerleri bu ölçüye göre ilk tahmindir: ör. referans karakterde +1 ana stat ≈ hasar +%6,7 ve can +%5 ≈ E +%5,8 → 5 IP.
- Kahramanın E'si ≈ 1 + GS/100. Takımınki kahramanların ortalaması.

### 4.2 Bölüm başına hedef (yalnızca item'den; skill ağacı ve level ayrı bütçe)

`roadmap.md > 1.3 Güç bütçesi tablosu`nun **item sütunu** (+%15 / +%30 / +%45) aynen alınır; bu belge onun içini doldurur.

| An | Beklenen ekipman (ortalama loot, ortalama seçim) | Kahraman GS | E (item'den) |
|---|---|---|---|
| Bölüm 1 sonu (ilvl ~10) | 5-6 yuva dolu, çoğu Common/Uncommon | ~15 | **+%15** |
| Bölüm 2 sonu (ilvl ~20) | 6 yuva, Uncommon/Rare, 1-2 set parçası | ~30 | **+%30** |
| Bölüm 3 sonu (ilvl ~30) | 6 yuva, Uncommon/Rare/Epic, set 2-3 parça ya da 1 Legendary | ~45 | **+%45** |
| Farm ile en fazla ek | (roadmap) | +5 | +%5 |

Hesap kontrolü: 6 yuva x B(ilvl) x ortalama nadirlik: ilvl 10, ort. 0,85 → 3 x 0,85 x 6 = 15; ilvl 20, ort. 1,0 → 5 x 1,0 x 6 = 30; ilvl 30, ort. 1,1 → 7 x 1,1 x 6 = 46. En iyi durumda (hep Epic/Legendary + set) bölüm 3 sonu ~+%70: tavan. Roadmap'in "tek item bütçenin ~1/4'ünden fazlasını vermez" kuralı yuva ağırlıklarıyla sağlanır (Weapon 1,5 / 6 = %25).

Görünür sayılar küçük kalır (ör. bölüm 3 sonu bir Warrior: +3 STR, +10 zırh, +40 can, +%14 Might civarı): mevcut stat ölçeğiyle (sınıf stat toplamı 30, can ~70-145) uyumlu; 4'e 4'te alışılan sayılar şişmez.

### 4.3 Düşman ölçeklemesi: beklenen ekipman telafisi

- Seferdeki her düğümün **beklenen E'si** (`E_exp(node)`, 4.2 eğrisinden düğüm ilvl'sine göre) veride: `campaign.json > gearCurve` (bölüm başına ilvl → E_exp).
- Düşman güçlendirmesi: **`hpMult` ve `powerMult` x (1 + 0,8 x (E_exp − 1))**, karşılaşmanın kendi `mods`'u ve zorluk `enemy`'si ile aynı birleşme kuralıyla (çarpanlar çarpılır). `k = 0,8` = "item'in %80'ini düşman yer, %20'si oyuncuya kalır".
- **Sonuç:** ortalama loot'lu oyuncu bugünkü ilk deneme hedeflerinin (balance.md > Sefer dengesi) biraz üstünde kalır (~+%10 güç avantajı = item'ler hissedilir); kötü şans/kötü seçim bugünkü hedeflere yakın; çok iyi loot belirgin kolaylık. Valdoria (bölüm 1) bugünkü sayılarla ayarlı olduğu için bölüm 1'de telafi küçük (en çok +%10).
- Roadmap'in "düşman ölçeği (bölüm seviyesi)" sütunu (x1,25 / x1,65 / x2,10; oyuncu toplamı x1,30 / x1,75 / x2,30) tüm ilerlemeyi (item + level + ağaç) kapsar ve aynı fikri taşır: düşman oyuncu eğrisinin ~%80-85'ini telafi eder. Bu bölümdeki `k = 0,8` o tablonun item payıdır; uygulamada **tek tablo** (roadmap 1.3) kullanılır, item MVP'si yalnızca item sütunu açıkken (level/ağaç yokken) bu formülle o tablonun item payını uygular. Ölçek bölüm/düğüm seviyesine bağlıdır, oyuncunun gerçek ekipmanına DEĞİL (farm ve iyi loot gerçekten kolaylaştırır).
- **Hızlı savaş ve multiplayer etkilenmez:** item'ler yalnızca sefer bağlamında `units.party` üzerinden girer; `units` verilmezse savaş birebir aynı (`tests/battle-setup.test.ts` zaten koruyor). `npm run sim`, `tests/balance*.test.ts` değişmez.

### 4.4 Simülatör planı (balance-tester + campaign-dev)

- `sim:campaign` oyuncu vekiline loot ve kuşanma eklenir: üç politika `--gear=none|random|best`.
  - **none:** bugünkü ölçümle aynı (referans; regresyon).
  - **best:** her loot sonrası her kahraman için yuva başına sınıfın stat ağırlıklarıyla (`classGearWeights`, ör. Warrior: STR 1, armor 1, Might 1, INT 0,1) en yüksek puanlı item'i takar; tüccarda altını en büyük GS artışına harcar.
  - **random:** kullanılabilir item'leri rastgele takar ("kötü oyuncu" alt sınırı).
- Ölçümler: bölüm sonlarında ortalama/medyan GS ve E (4.2 hedefleri), kategori başına ilk deneme kazanma (bugünkü bantlar `best` için hedef + ~5 puan üstü, `random` için hedef içinde), düğüm başına loot sayısı ve nadirlik dağılımı, pity tetiklenme sıklığı, envanter doluluğu, altın eğrisi.
- IP doğrulama deneyi (2.1): stat başına "+X takan takım" ayna maçı → `statIP` düzeltmesi.
- Testler: `tests/items-data.test.ts` (şema, IP bütçe toleransı ±%10, her ailenin en az bir sınıfı, set parçalarının yuvaları çakışmıyor), `tests/gear-modifiers.test.ts` (item → UnitModifiers saf dönüşüm; primary kilidi), `tests/loot.test.ts` (seed belirleyiciliği, attempt'ten bağımsızlık, pity, farm azalması), `tests/campaign-gear-balance.test.ts` (best politikası ile kategori bantları).

---

## 5. Motor, veri ve arayüz ihtiyaçları

### 5.1 engine-dev (motor; saf, test ile)
1. `UnitModifiers`'a yeni **toplamsal** alanlar: `hpAdd, mpAdd, spdAdd, critAdd, critMultAdd, accuracyAdd, evasionAdd, hpRegenAdd, mpRegenAdd`. Sıra: temel statlar (`statMult`, `attrMult`, `attrAdd`) → türetme (+ `overrides`) → `hpMult` → **`hpAdd`** → diğer toplamsal ekler → zırhlar → `powerMult`. Yapay zeka/önizleme statları okuduğu için kendiliğinden yansır.
2. **Primary kilidi:** primary bonusunun açık olup olmadığı sınıfın temel statlarına göre (item `attrAdd`'i çevirmez). Öneri alan: `UnitModifiers.primaryFromBase: true` (sefer kahramanlarında set edilir).
3. Tavanlar veride (`items.json > caps`) ama uygulaması campaign tarafında (gear → modifiers dönüşümünde kırpılır); motorda ek kural gerekmez.
4. (Aşama 3) Trait'ler: `UnitSetup.traits: string[]` + motorda generic kancalar (Opening Ward = savaş başı kalkan, Second Wind = eşik altı tek seferlik şifa, Giantslayer = `tier`'e hasar çarpanı, Steadfast = mevcut displacement bağışıklığı, Iron Will = Resilience'e ek, Quick Start = başlangıç sayacı). Olaylar `passive` ile (yüzen yazı).

### 5.2 campaign-dev (sefer; saf mantık `src/campaign/`)
1. **Kayıt** (roadmap 1.4, aşama 0: `CampaignState` v1→v2, `SAVE_VERSION` 2→3, eksik alanlar varsayılanla): roster kahramanına `equipment: { weapon?, helm?, armor?, gloves?, boots?, trinket?: itemUid }`; kayda `bag: ItemInstance[]`, `gold`, `lootState: { rarePity, legendaryPity, clears: { [nodeId]: n } }`, `merchant: { [nodeId]: { stock, refreshedAtChapter } }`. Eski kayıt: boş ekipman, altın 0.
2. **ItemInstance:** `{ uid, base, ilvl, rarity, affixes: [{ id, roll }], unique? }` (roadmap 1.4 ile aynı ilke: kayda **id + seed'li zar** yazılır, asıl sayılar veriden hesaplanır; `roll` 0-100 affix değerinin bütçe aralığındaki yeri). Böylece item verisi dengelenince eski kayıtlardaki item'ler de yeni sayıları alır. Legendary/Set için `unique` id yeter.
3. **Saf `gearToModifiers(hero, items, data) → UnitModifiers`** (+ `traits`): savaş öncesi "temel + item" toplamı; `units.party[yuva] = { modifiers }`. Party ekranı aynı fonksiyonla stat önizlemesi gösterir.
4. **Saf loot:** `rollLoot(state, node, outcome, data) → { items, gold, lootState }` (seed'li, 3.1-3.4), `merchantStock(...)`, `itemValue(item)`, `gearScore(hero)`.
5. `gearCurve` düşman telafisi (4.3) zorluk `enemy` ile aynı yerde birleştirilir.
6. Ashford vedası / kadrodan çıkma: item'ler torbaya.
7. Sim politikaları (4.4).

### 5.3 Yeni veri dosyası `data/items.json` (şema taslağı)
```json
{
  "_not": "Item sistemi (docs/design/progression/items.md). Sayılar PROVİZYON.",
  "slots": [
    { "id": "weapon", "name": "Weapon", "weight": 1.5 },
    { "id": "helm", "name": "Helm", "weight": 0.8 },
    { "id": "armor", "name": "Armor", "weight": 1.3 },
    { "id": "gloves", "name": "Gloves", "weight": 0.8 },
    { "id": "boots", "name": "Boots", "weight": 0.8 },
    { "id": "trinket", "name": "Trinket", "weight": 0.8 }
  ],
  "rarities": [
    { "id": "common", "name": "Common", "mult": 0.7, "affixes": 0, "color": "#8a8a84" },
    { "id": "uncommon", "name": "Uncommon", "mult": 1.0, "affixes": 1, "color": "#5f8f3e" },
    { "id": "rare", "name": "Rare", "mult": 1.3, "affixes": 2, "color": "#3f6fa8" },
    { "id": "epic", "name": "Epic", "mult": 1.6, "affixes": 3, "color": "#7a3f9a" },
    { "id": "legendary", "name": "Legendary", "mult": 2.0, "affixes": 0, "color": "#d9741c" }
  ],
  "setColor": "#3f8f84",
  "budget": { "base": 1, "perIlvl": 0.2, "endlessPerIlvl": 0.1, "tolerance": 0.1, "goldPerIP": 10, "sellRatio": 0.25 },
  "statIP": { "attr": 5, "hp": 0.4, "armor": 0.8, "magicArmor": 0.5, "might": 0.5, "crit": 0.25, "critDmg": 0.05, "accuracy": 0.6, "evasion": 0.6, "spd": 5.5, "mp": 0.1, "mpRegen": 2, "hpRegen": 4 },
  "caps": { "crit": 15, "accuracy": 10, "evasion": 10, "spd": 1.5, "spdPerItem": 0.5 },
  "weaponFamilies": [
    { "id": "axes", "name": "Axes & Swords", "classes": ["warrior", "antimage"] },
    { "id": "maces", "name": "Maces & Shields", "classes": ["defender", "paladin", "warrior"] },
    { "id": "bows", "name": "Bows", "classes": ["archer"] },
    { "id": "daggers", "name": "Daggers", "classes": ["cutthroat", "antimage"] },
    { "id": "staves", "name": "Staves", "classes": ["mage", "druid", "undead"] },
    { "id": "charms", "name": "Charms", "classes": ["gambler", "hexer"] }
  ],
  "bases": [
    { "id": "woodcutters_axe", "name": "Woodcutter's Axe", "slot": "weapon", "family": "axes", "minIlvl": 1, "icon": "item_axe_woodcutter", "implicit": { "might": 1.0 } },
    { "id": "riveted_mail", "name": "Riveted Mail", "slot": "armor", "minIlvl": 8, "icon": "item_armor_mail", "implicit": { "armor": 0.6, "hp": 0.4 } }
  ],
  "affixes": [
    { "id": "of_the_bear", "name": "of the Bear", "kind": "suffix", "stat": "str", "slots": ["weapon", "armor", "gloves", "trinket"], "minRarity": "rare" },
    { "id": "sturdy", "name": "Sturdy", "kind": "prefix", "stat": "armor", "slots": ["armor", "helm", "boots", "gloves"] }
  ],
  "uniques": [
    { "id": "wardens_mooring", "name": "The Warden's Mooring", "rarity": "legendary", "base": "iron_sabatons", "ilvl": 20, "stats": { "armor": 3, "hp": 8 }, "trait": "steadfast", "flavor": "Chained to the bridge for a hundred years. It will not let you be moved either." }
  ],
  "sets": [
    { "id": "ashguard", "name": "Ashguard Vigil", "pieces": ["ashguard_helm", "ashguard_hauberk", "ashguard_gauntlets", "ashguard_greaves"],
      "bonuses": { "2": { "armor": 3, "magicArmor": 2 }, "3": { "hp": 16 }, "4": { "trait": "opening_ward" } } }
  ],
  "traits": { "opening_ward": { "name": "Opening Ward", "text": "Begin each battle with a shield of 12% max HP.", "ip": 4 } },
  "loot": {
    "perPartyMember": { "battle": 0.25, "elite": 0.5, "boss": 0.75, "treasureBonus": 0.25 },
    "treasureBase": 2,
    "rarityByChapter": { "1": [60, 32, 7, 1, 0], "2": [35, 40, 20, 4.5, 0.5], "3": [15, 40, 32, 11, 2] },
    "pity": { "rareAfter": 6, "legendaryAfter": { "bosses": 2, "elites": 4 } },
    "smartSlotChance": 0.5, "usableWeaponChance": 0.8,
    "repeat": [ { "items": 1, "maxRarity": "legendary", "gold": 1 }, { "items": 0.6, "maxRarity": "epic", "gold": 0.6 }, { "items": 0.4, "maxRarity": "rare", "gold": 0.4 }, { "items": 0.25, "maxRarity": "rare", "gold": 0.25 } ],
    "gold": { "battle": 4, "elite": 8, "boss": 16, "treasure": 25 }
  },
  "bag": 30,
  "merchant": { "stock": 6, "usableWeapons": 2, "rarityShift": 1 }
}
```
- Taban `implicit` değerleri **bütçe payıdır** (1,0 = taban bütçesinin hepsi bu stat), sayı değil: gerçek değer `IP x pay / statIP` ile hesaplanır ve yuvarlanır. Bu sayede aynı taban her ilvl'de doğru güçte.
- Düğüm verisinde (campaign-dev) isteğe bağlı `loot: { pool, setPieces, uniques }` (hedefli havuz) ve bölüm verisinde `ilvlBase`, `ilvlPerStop`; `campaign.json > gearCurve`, `difficulties.<x>.loot`.
- İçerik doğrulama testi şemayı denetler (şema testi zaten var: `tests/content.test.ts` ailesi).

### 5.4 ui-dev (arayüz; İngilizce)
1. **Party ekranı > Gear sekmesi:** soldaki kahraman listesi (portre + GS), ortada kahramanın 6 yuvası (siluet etrafında; boşken soluk), sağda torba ızgarası (30, filtre: All / yuva / "Usable by this hero"). Altta stat paneli (alt bar stat bloğuyla aynı düzen: ana statlar | ATK | DEF; değişen değer yeşil/kırmızı).
2. **Karşılaştırma tooltip'i:** torbadaki item'e gelince/dokununca takılıyla yan yana; her stat satırında fark (+yeşil / −kırmızı), altta **Power +3** özeti; set parça sayısı (2/4) ve bonusların hangisinin açılacağı.
3. **Equip best** düğmesi (kahraman başına + "All heroes"): sınıf ağırlıklarıyla otomatik (sim'in `best` politikasıyla aynı saf fonksiyon). Telefonda zorunlu kolaylık.
4. **Loot ekranı** (zafer sonucu ekranında `Continue`'dan önce): item kartları sırayla açılır (nadirlik rengiyle parıltı; Legendary için kor kıvılcımı), altın sayacı; kartta "Equip on..." kısayolu. Boss "Choose one" seçimi (soru 8). Torba doluysa sat/at kararı.
5. **Tüccar** (town paneli > Merchant): Buy / Sell sekmeleri, altın göstergesi, "Sell all junk".
6. Haritada takım şeridinde portre altında küçük GS rozeti (ya da "Power 112").
7. **Wiki/Codex > Items** (veriden türetilir): yuvalar, nadirlikler, aileler-sınıflar tablosu, set ve Legendary listesi (bulunmayanlar "???" isteğe bağlı), IP/altın kuralı kısaca. `tests/wiki.test.ts` kapsamı.
8. **Debug > Campaign:** Give item (taban + nadirlik + ilvl), Give gold, Roll loot table (düğüm seçerek 100 zar özeti), Show GS/E, Clear bag, Toggle pity.

### 5.5 İçerik (content-designer)
- **İkonlar** (128x128, v2 kılavuzu; `src/game/art-v2/items/` önerisi, `icon-kinds.ts` listesine): ~40 taban + ~12 Legendary/Set + 6 boş yuva silueti + 6 aile rozeti + nadirlik çerçeveleri (kodla) + altın kesesi + sandık. Wiki > Assets otomatik görür (katalog kapsamı güncellenmeli: `src/wiki/assets/`).
- **Sesler** (gerçekçi, çan YOK): loot düşüşü = kumaş kese + birkaç sikke (filtreli gürültü, kısa metal tıkırtısı; saf sinüs değil), Rare+ = ek alçak "whump" + kor çıtırtısı, Legendary = alçak davul + kor nefesi; kuşanma yuvaya göre (Armor/Helm zincir zırh hışırtısı + toka; Weapon kın sürtmesi; Gloves/Boots deri gıcırtısı; Trinket küçük zincir şıkırtısı), satış = sikke yığını tahtaya, tüccar kapı zili DEĞİL (gürültü tabanlı tahta tezgâh "thock"). Dalga biçimi ölçülür (tepe 0,25-0,88), Ömer kulakla onaylar.
- Legendary flavor metinleri, set temaları (1.8), tüccar karakteri (avatar/isim: ör. *Old Hesk the Peddler*).

---

## 6. Aşamalı uygulama planı

| Aşama | İçerik | Kim | Büyüklük |
|---|---|---|---|
| **1. MVP: "loot düşer, takılır, işe yarar"** | `UnitModifiers` toplamsal ekleri + primary kilidi (engine); `data/items.json` + ~40 sabit item (6 yuva, 5 nadirlik, ilvl 1-10 ağırlıklı; affix üreteci YOK); kayıt v2 (ekipman, torba); `gearToModifiers`; savaş sonu loot (3.1 kaynakları, 3.2 eğrisi, attempt'ten bağımsız seed); loot ekranı; Party > Gear (kuşan/çıkar, karşılaştırma, Equip best); `gearCurve` telafisi; sim `--gear`; testler; debug; taban ikonlar yer tutucu (tek ikon x aile rengi). | engine-dev ~0,5, campaign-dev ~1,5, ui-dev ~1,5-2, balance-tester ~1, content-designer (yer tutucu) | **Büyük: ~5 oturum** |
| **2. Ekonomi** | altın, tüccar, satma, junk; seed'li affix üreteci + adlandırma; pity; farm azalması (roadmap'e göre); hedefli düğüm havuzları; gerçek ikonlar ve sesler. | campaign-dev, ui-dev, content-designer | Orta: ~3 oturum |
| **3. Kimlik** | Set'ler (3 örnek + bölüm 2-3 için 2-3 daha), Legendary'ler ve trait'ler (engine kancaları), Codex > Items, Legendary efekt/ses. | engine-dev, content-designer, ui-dev | Orta: ~2-3 oturum |
| **4. Mod genişlemesi** | QB/MP altın limitiyle itemleme (sabit katalog, ayna dengesi ölçümü), endless'ta ilvl 30+ ve GS'ye bağlı dalga ölçeği. | multiplayer-dev, campaign-dev, balance-tester | Ömer kararı sonrası |

Roadmap eşlemesi: buradaki aşama 1-3, roadmap'in **aşama 0 (ortak katman, kayıt) + aşama 1 (Item MVP)** içine düşer; roadmap aşama 1'e tüccarı ve stat-only set bonuslarını da koyuyor. Fark yalnızca sıralama: öneri, ilk oynanabilir adımı "loot + kuşanma" ile küçük tutmak, tüccar/set'i hemen arkasından eklemek (Ömer isterse tek pakette yapılır). Aşama 4 = roadmap aşama 1E (endless) ve 6 (QB/MP).

Bölüm 2-3 içeriği (yeni haritalar) roadmap'e bağlı: MVP Valdoria'yı (bölüm 1, ilvl 1-10) item'le oynatır; bölüm tabloları veride hazır bekler.

---

## 7. Ömer'e sorular (önerilerimle)

1. **Yuva sayısı 6 mı** (Weapon, Helm, Armor, Gloves, Boots, Trinket)? *Öneri: evet, 6. İkinci yüzük ileride endless'ta eklenir.*
2. **Silah kısıtı:** sınıf arketipine göre 6 silah ailesi (Mage asa, Archer yay, Gambler/Hexer tılsım...) mı, yoksa her silah herkese serbest mi? *Öneri: aileler; diğer 5 yuva serbest.*
3. **Nadirlik:** Common / Uncommon / Rare / Epic / Legendary + ayrı Set etiketi uygun mu? *Öneri: evet.*
4. **Affix:** MVP'de el yapımı sabit item'ler, sonra "taban + seed'li rastgele ek statlar" (Legendary/Set her zaman sabit) uygun mu? *Öneri: evet (karışık).*
5. **Güç eğrisi:** bölüm sonlarında item'den +%15 / +%30 / +%45 (roadmap ile aynı) ve düşmanların bunun ~%80'i kadar güçlenmesi (iyi loot hissedilsin, denge kaymasın) uygun mu? *Öneri: evet; sayıları sim düzeltir.*
6. **Zorluk ve loot:** item SAYISI her zorlukta aynı, Hard'da yalnızca daha iyi nadirlik ve +%15 altın mı? *Öneri: evet (Easy oyuncusu item'siz kalıp daha çok zorlanmasın).*
7. **Ashford vedası:** tutorial takımı ayrılırken takılı item'lerini torbaya bıraksın mı? *Öneri: evet ("They leave their gear for the new company").*
8. **Boss ödülü:** boss'ta "3 item'den birini seç" anı olsun mu (diğer düşüşler otomatik)? *Öneri: evet, yalnızca boss ve korunan hazinede; normal savaşta seçim yok (hız).*

---

## 8. Varsayımlar (open-questions'a not edildi)
- Primary bonusunun item'le çevrilmemesi (1.5) ve item'de düz hasar/cooldown/hız dışı skill değiştirme olmaması (1.5, 1.7) tasarım önerisidir; Ömer itiraz ederse değişir.
- Bölüm sayısı 3, bölüm başına ~10 savaş durağı varsayıldı (roadmap kesinleştirir; ilvl parametreyle uyarlanır).
- Altın şu an oyunda yok; altın kaynakları (2.2) bu belgenin önerisi, campaign-dev'in ödül tasarımıyla birleşmeli.

# The Bridge Warden: King's Bridge boss tasarım dökümanı (TASLAK)

> **Durum: UYGULANDI (engine-dev, 2026-10-08; open-questions madde 265, 269).** Ömer kararları bölüm 9 sonunda. Veri: `data/bosses/bridge_warden.json`, `data/bosses/iron_mooring.json`, `data/skills.json` (anchor_smash, breaking_span, chain_hook, ash_brand, fall_of_kings_bridge), `data/statuses.json` (overextended, staggered, ash_brand, anchored), `data/grounds.json` (flooded_planks), `data/ai.json` (profil bridge_warden, telegraph bloğu), `data/campaign/encounters.json > bridge_warden`. Motor: `src/engine/battle.ts` (telgraf, faz, Mooring, Stagger, Unyielding, çekme), YZ: `src/engine/ai.ts` (telegraphOptions, telegraphDodge, anchorValue). Testler: `tests/bridge-warden.test.ts`. **Bu belgedeki sayılar artık TASLAK değerdir; geçerli sayılar veri dosyalarındadır** (sim ayarı, bölüm 10).
>
> Ömer'in isteği: *"King's Bridge boss'una Paladin koymuşsun da damage atamıyor, 1k canı var, çok sıkıcı. Oraya bir boss tasarla ve tamamen yeni skill'leri ve yeni teması olsun. Mevcut karakterlerden ayrışsın."*
>
> Düzeltme notu: bugünkü boss aslında **Defender**'ın büyütülmüşü (`encounters.json > bridge_warden`: Defender, can x6,5 → ~940 can, stat x1,5, 2 eylem/tur). Sorun aynı: Defender bir tank; kiti (Tremor Slam STR x0,36, Taunt, Guard, Fist Crush) tek başına tehdit üretmiyor, 19 zırh + 940 can = "sünger". Bu belge onu tamamen yeni bir varlıkla değiştirir.

---

## 1. Kimlik ve tema

### 1.1 Bağlam
King's Bridge (düğüm 9), Valdren Vadisi'nin (Bölge II) sonunda nehrin üstündeki taş köprüdür; üç yol (8A/8B/8C) burada birleşir, ötesi Kül Ovası ve Morvane'in Kuzey Yükseklikleri. Morvane'in Kül Laneti nehri geçip vadiye yayılmak için bu köprüye muhtaç; köprüyü tutan şey de lanetin kendisi.

### 1.2 Tema seçenekleri

| | Seçenek | Ne | Artı | Eksi |
|---|---|---|---|---|
| **A (ÖNERİ)** | **The Bridge Warden** (zincirli taş bekçi) | Kralın köprü bekçisiydi; "Kral dönene dek kimse geçmez" yemini etmişti. Kül Laneti göğsüne bir kor yerleştirdi, bedenini köprünün taşına ve demir palamar zincirlerine kaynaştırdı. Artık yarı adam, yarı köprü: sırtında kemer taşları, kollarında paslı zincirler, elinde zincire bağlı dev bir köprü çapası | Mekân = boss: köprüyü çökertir, zincirle çeker, nehri püskürtür. Haritadaki "Boss · The Bridge Warden" alt başlığı aynen kalır. Hiçbir class taş/zincir/su/çapa kullanmıyor | Defender'la "ağır zırhlı dev" algısı karışmasın diye silüet insan şövalye OLMAMALI (bkz. 7.5) |
| B | **The Drowned Toll** (nehir ruhu) | Köprüden geçemeyenlerin boğulduğu nehirden yükselen, kül çamuruyla kararmış su kadını | Su teması tamamen yeni; akıntı ile itme/çekme doğal | Ruh/lanet büyüsü Hexer ve Undead'le tematik olarak örtüşür; "köprü" mekânını kullanmaz |
| C | **The Headsman of King's Bridge** (köprü celladı) | Köprüden asılan kafeslerin bekçisi, dev balta, darağacı zincirleri | Karanlık, sade, okunur | Balta + iri adam = Warrior'a çok yakın; telgraf mekaniği temaya zor oturur |

**Öneri: A.** Tema, mekaniklerin kaynağıdır: köprü çöker (telgraflı alan), zincir çeker (konum), kor yanar (faz). Oyuncu "neden buradan kaçmalıyım" sorusunu görselden okur.

### 1.3 Tek dev mi, yardımcılı mı?
**Öneri: boss + 2 yardımcı nesne (Iron Mooring, demir palamar babası).** Warden boss tahtasının ön ortasında durur; arkasında iki yanda köprü korkuluğuna çakılı iki dev demir palamar babası, zincirleri Warden'ın kollarına bağlı. Palamarlar saldırmaz (sıra almaz) ama Warden'ı güçlendirir; kırılmaları oyuncuya **karar** verdirir: "boss'a vur" mu, "zinciri kır" mı. Tek dev boss'ta oyuncunun tek kararı "kime şifa"ya iner; sıkıcılığın kaynağı buydu.

### 1.4 Kimlik özeti

| Alan | Değer |
|---|---|
| id | `bridge_warden` (yeni gizli boss class'ı; rastgele havuzda YOK, takım seçiminde YOK) |
| Oyun içi ad | **The Bridge Warden** (displayName) |
| Rol | Boss · Siege Giant |
| Primary | STR (tüm hasarı STR yüzdesi; hasar ölçekleme kuralı korunur) |
| Arketip | Yavaş ama her turunda iki kez davranan dev; savaş alanını (oyuncunun tahtasını) değiştirir |
| Oyuncuya öğrettiği | Telgrafı oku → konum al (Move), yardımcıyı kır, boss'un açık verdiği anı (Overextended) cezalandır |

**Mevcut class'lardan farkı:** hiçbir class oyuncunun tahtasındaki **hücreleri** gecikmeli hedeflemiyor, kimse birimi yerinden **çekmiyor**, kimsenin faz ve yardımcı nesnesi yok. Görsel olarak: taş + pas + nehir yosunu + kor (Defender gri çelik şövalye, Undead kemik, Hexer mor tılsım; Warden ise yürüyen köprü).

---

## 2. Statlar ve can

### 2.1 Gerekçe
- Bugünkü sürüm ~940 can + 19 zırh ile ~10-12 tur "vur vur vur". Hedef: **daha az can, daha çok tehdit, fazlarla değişen savaş.**
- Takım: Bölge II sonu, 4 kişi (Valdren Keep'ten çıkarken 4. katılır), can taşıyarak gelir (madde 264: boss'a düşük canla girme sorunu; bkz. soru 5).
- Takım 4 class ortalama can ~85 (Mage/Archer 66, Warrior 120, Defender 145), toplam ~340. Ortalama ham vuruş ~22; boss zırhından sonra ~15-17 → takım başına tur ~60-70 etkin hasar.
- Hedef süre: **8-10 takım turu** (her oyuncu 8-10 kez oynar; toplam ~45-55 sıra).

### 2.2 Değerler (PROVİZYON, Medium)

| Alan | Değer | Not |
|---|---|---|
| STR / INT / DEX / LUCK | **20 / 6 / 1 / 4** | DEX 1 bilinçli: dev yavaştır |
| Can | **480** (`overrides.hp`) | eski ~940'ın yarısı; fazlarla 3 dilim: 480-317 / 317-158 / 158-0 |
| Can yenilenmesi | **0** (`overrides.hpRegen`; yeni alan) | STR 20'den gelecek 5/tur sünger etkisi istenmiyor |
| MP / yenilenme | 42 / 2 | yalnızca Ash Brand MP ister: **Anti-Mage karşı oyunu** (MP yakarsa Brand gelmez) |
| SPD | **7** (7 + 0,4 x 1) | takımdaki en yavaş class 8: telgraf ile çözülmesi arasında HER oyuncu birimi en az bir kez oynar (bkz. 3.0) |
| Eylem/tur | **2** (Faz I-II), **3** (Faz III) | `actionsPerTurn`; faz değişince güncellenir (yeni) |
| İsabet / kritik / kaçınma | %84 / %7 / %0 | formüllerden |
| Zırh / büyü zırhı | **12 / 6** taban; her canlı Mooring **+5 / +5** (Anchored) | 2 Mooring'le 22/16 (%42 / %35 azalma), Moorings kırılınca 12/6 (%29 / %17), Faz III'te yarıya iner (6/3) |
| Ölçek | `spriteScale` **2,2** | tek hücre (yuva 1), büyük çizim |

**Iron Mooring (x2, yardımcı nesne):** can **55**, zırh 10, büyü zırhı 0, sıra almaz, şifa almaz, global eylem yok, ceset bırakmaz; savaşın bitişini etkilemez (Warden ölünce savaş biter, Mooring'ler de çöker).

### 2.3 Dizilim (boss tahtası; yuva = sıra*3+şerit)

```
              şerit 0     şerit 1     şerit 2
sıra 0 (ön)   .           WARDEN (1)  .
sıra 1        MOORING (3) .           MOORING (5)
```

- Yakın dövüşçüler yalnızca Warden'a ulaşır (ön sıra kuralı); Mooring'ler uzak/alan skill'leriyle ya da Warrior'ın Abyssal Fury (+1 menzil) ile kırılır → class'lara farklı görevler.
- `plus` alanı yuva 4'e atılırsa [1,3,4,5,7] = **Warden + iki Mooring** birden (Meteor, Judgment, Wail): alan class'ları ödüllendirilir. `row` sıra 1'e: iki Mooring.

### 2.4 Zayıf noktalar (oyuncunun keşfedeceği)
1. **Iron Mooring'ler:** her biri kırılınca Warden'ın zırhı -5/-5, Warden **Staggered** (sıradaki 1 eylemini kaybeder) ve **bekleyen Breaking Span iptal olur** (zincir gevşer, köprü kesimi tutmaz).
2. **Overextended:** Breaking Span ya da Fall çözüldükten sonra Warden'ın çapası köprüye saplı kalır: **+%25 alınan hasar**, Warden'ın bir sonraki turunun başına kadar.
3. **Ember Heart (Faz III):** göğüs çatlağı açılır, zırh ve büyü zırhı yarıya iner.
4. **MP:** Ash Brand 12 MP; Anti-Mage Mana Steal / Drain Field ile Brand'i susturabilir.
5. **Dispel:** Ash Brand bir debuff'tır; Mage'in Mana Barrier'ı onu siler.
6. **Stun → Stagger:** Charge / Vine Snare Warden'ı tam sersemletmez ama bir eylemini aldırır.

---

## 3. Skill'ler

### 3.0 Telgraf kuralı (tüm gecikmeli saldırılar için ortak)
- Telgraflı skill kullanıldığında hasar **o an gelmez**: oyuncunun tahtasındaki hücreler işaretlenir (çatlak plaka), sıra çubuğunda Warden'ın bir sonraki portresinin üstünde skill ikonu belirir.
- **Çözülme: Warden'ın bir SONRAKİ turunun başında**, eylemlerinden önce. O anda işaretli hücrelerde duran birimler vurulur (hücre tabanlı; birimin kendisi değil). Ash Brand istisna: birime bağlıdır (3.4).
- Warden SPD 7, takımın en yavaşı 8 → arada **her oyuncu birimi en az bir tur** oynar (sersemlemedikçe). Bu, telgrafın adil olmasının şartı; balans hızı değiştirirse kural "her canlı düşman en az bir kez oynamadan çözülmez" olarak motora yazılmalı (bkz. M3).
- Aynı anda en fazla **bir alan telgrafı + bir Ash Brand** bekleyebilir. Bir turda en fazla bir yeni telgraf.
- Telgraf her zaman **güvenli hücre bırakır** (şekiller tüm tahtayı kaplamaz; Fall'da Keystone'lar).
- Warden ölünce bekleyen telgraflar iptal.

### 3.1 Tablo (STR 20 ile ham değer)

| # | id | Ad | Faz | Hedef / alan | MP | CD | Güç (str x) | Özet |
|---|---|---|---|---|---|---|---|---|
| 1 | `anchor_smash` | **Anchor Smash** | I-III | tek düşman, yakın (ön sıra) | 0 | 0 | **1,3** (26) fiziksel | Temel vuruş |
| 2 | `breaking_span` | **Breaking Span** | I-III | **telgraf**: Faz I `row` (bir sıra, 3 hücre); Faz II-III `rect 2x3` (iki sıra, 6 hücre) | 0 | 2 | **2,0** (40) fiziksel + zemin | Köprü kesimi çöker |
| 3 | `chain_hook` | **Chain Hook** | I-II | tek düşman, HER sıra (ön sıra kuralı yok) | 0 | 2 | **0,8** (16) fiziksel | Hedefi kendi şeridinin en öndeki boş hücresine çeker; en az bir Mooring canlıysa |
| 4 | `ash_brand` | **Ash Brand** | II-III | tek düşman (taunt'a uyar) → **telgraf**: çözülmede damgalının o anki hücresi merkezli `plus` | 12 | 3 | **1,2** (24) büyü/ateş | Kül damgası patlar |
| 5 | `fall_of_the_bridge` | **Fall of King's Bridge** | III | **telgraf**: oyuncu tahtasının TAMAMI, 3 Keystone hücresi hariç | 0 | 4 | **2,2** (44) fiziksel | Faz III'e girerken otomatik; sonra cd 4 |

Pasifler: **Unyielding**, **Anchored**, **Ember Heart** (bölüm 4).

### 3.2 Anchor Smash (`anchor_smash`)
- **Ne yapar:** zincire bağlı dev çapayı ön sıradaki bir kahramana indirir. STR x1,3 fiziksel (26 ham; zırh 9'a ~20).
- **Neden var:** her turun "doldurma" eylemi; Chain Hook ile birleşince ön sıraya çekilen kırılgan birim hedef olur.
- **Telgraf:** yok (anlık, küçük).
- Açıklama (EN): *"Brings the chained anchor down on a front-row enemy: 130% Strength physical damage."*

### 3.3 Breaking Span (`breaking_span`): telgraflı büyük saldırı
- **Kullanım anı:** Warden çapasını köprüye saplar; oyuncunun tahtasında seçilen hücrelerde taş çatlar, aralardan su fışkırır (telgraf).
- **Şekil:** Faz I `row` (bir sıra, 3 hücre; düşman tahtasında ekranda dikey şerit). Faz II-III `rect 2x3` (iki komşu sıra; 6 hücre; geriye 6 güvenli hücre kalır).
- **Çözülme (Warden'ın sonraki tur başı):** işaretli hücrelerdeki her birime STR x2,0 fiziksel (40 ham), ardından o hücrelere **Flooded Planks** zemini (STR x0,2 = 4/tur, 2 tur; mevcut `ground` etkisi). Sonra Warden **Overextended** (+%25 alınan hasar, sonraki turunun başına kadar).
- **İptal:** bekleyen Span, bir Iron Mooring kırılırsa iptal olur.
- **Oyuncunun kararı:** (a) işaretli sıradakileri Move ile çek (tur harcar, hasar vermezsin), (b) hasarı ye ama vur (tank/şifacı varsa), (c) Mooring'i kırıp kesimi iptal et (hem ilerleme hem kurtuluş, ama 55 can + zırh). Hep bir bedel var: "sıkıcı olmama"nın çekirdeği.
- **Neden bir sıra / iki sıra:** sıra, oyuncunun tahtasında derinliği belirler. Yakın dövüşçü kendi tahtasının en öndeki DOLU sırasında olmak zorunda (`canMeleeFrom`, sıra sıralaması); ön sıra çökerken melee'nin geri çekilmesi, tüm takım bir sıra geriye kayarsa sorun değildir (sıralama kayar, yeni ön sıra o olur), ama yalnız melee geri çekilirse bir sonraki turunda vuramayabilir. Yani Span ön sıraya düştüğünde "hep birlikte geri çekil" ile "melee yerinde kalıp yesin" arasında gerçek bir karar doğar; arka sıralara düştüğünde ise kaçış yalnızca TUR harcar.
- Açıklama (EN): *"Drives the anchor into the bridge. The marked span cracks and collapses at the start of the Warden's next turn: 200% Strength physical damage to everyone standing on it, and the planks stay flooded for 2 turns. Breaking a Mooring cancels the collapse."*

### 3.4 Chain Hook (`chain_hook`): oyuncuyu hareket ettiren mekanik
- **Ne yapar:** palamar zincirinin ucundaki kancayı fırlatır; tek düşman, **arka sıradaki dahil** (ön sıra kuralı yok). STR x0,8 fiziksel (16 ham). Hedefi **kendi şeridindeki en öndeki boş hücreye** çeker (ön sıra 0 ise oraya). Boş hücre yoksa çekmez, yalnızca hasar.
- **Şart:** en az bir Iron Mooring canlı (zincirin dayanağı). İkisi de kırılınca skill kapanır.
- **Taunt:** tek hedefli olduğu için Defender'ın Taunt'ı kancayı kendine çeker (karşı oyun).
- **YZ kombinasyonu:** kırılgan arka hat birimini (şifacı, Mage) çekip (a) bekleyen Breaking Span'in üstüne, ya da (b) Anchor Smash menziline (ön sıra) getirir. Oyuncu bunu görür ve geri çekilmek için Move harcar ya da Mooring'i kırar.
- **Telgraf:** yok; ama bekleyen Span ile birleşince doğal bir "tuzak" oluşur.
- Açıklama (EN): *"Hurls a mooring hook at any enemy: 80% Strength physical damage and drags the target to the front-most free cell of its lane. Needs a standing Mooring."*

### 3.5 Ash Brand (`ash_brand`): yayılmaya zorlayan telgraf (Faz II+)
- **Ne yapar:** Warden'ın göğsündeki kor bir kıvılcım tükürür, tek düşmanı **damgalar** (debuff `ash_brand`, anında hasar yok).
- **Çözülme (Warden'ın sonraki tur başı):** damgalının **o anki** hücresi merkezli `plus` (merkez + 4 komşu) içindeki herkes STR x1,2 büyü/ateş hasarı alır (24 ham; çoğu class'ın büyü zırhı 0). Damga birime bağlıdır, hücreye değil: damgalı birim kaçamaz ama komşuları kaçabilir ya da damgalı tenha bir hücreye geçebilir.
- **Karşı oyun:** dispel (Mana Barrier) damgayı siler; Anti-Mage MP yakarak Brand'i engeller; damgalı ölürse damga söner.
- **Breaking Span ile etkileşim (asıl bulmaca):** Span oyuncuyu güvenli sıralara **sıkıştırır**, Brand sıkışanları **cezalandırır**. Faz II'de ikisi birlikte beklerken oyuncu 6 güvenli hücrede birbirine bitişik olmayan bir dizilim arar.
- Açıklama (EN): *"Spits a cinder of the Ash Curse onto one enemy. At the start of the Warden's next turn the brand bursts: 120% Strength fire magic damage to the branded enemy and everyone right next to it. Can be dispelled."*

### 3.6 Fall of King's Bridge (`fall_of_the_bridge`): faz finali
- **Ne zaman:** Faz III'e girildiği AN (otomatik, eylem harcamadan telgraflanır); sonra cooldown 4.
- **Şekil:** oyuncu tahtasının 12 hücresinin tamamı, **3 Keystone hücresi hariç** (her şeritte bir; sıraları seed'li, üçü aynı sırada olmaz). Keystone'lar parlayan kemer taşı işaretiyle gösterilir.
- **Çözülme:** Keystone dışındaki her birime STR x2,2 fiziksel (44 ham; Faz III güç çarpanıyla ~51). Sonra Overextended.
- **Karar:** 4 kahraman, 3 Keystone. Biri dışarıda kalacak (ya da bir çağrı birimi Keystone'u işgal edecek): tank mı yesin, kalkanlı mı, Guard ile paylaşılsın mı, yoksa son darbeyi vurmak için risk mi alınsın?
- Açıklama (EN): *"The Warden tears the span apart. At the start of its next turn the whole bridge falls: 220% Strength physical damage to every enemy not standing on a Keystone."*

---

## 4. Pasifler ve boss kuralları

### 4.1 Unyielding (kontrol direnci)
- **Stun → Stagger:** Warden'a gelen Stun tur kaybettirmez; yerine **sıradaki tek eylemini** kaybettirir (2 eylemli turda 1 eylem kalır). Stagger aynı turda üst üste binmez.
- Diğer debuff'ların süresi 1 kısalır (en az 1). Slow, Wound, Blinded, Jinxed, Omen, Wither normal işler (Hexer/Cutthroat karşı oyunu korunur; Doom tam vurur).
- Çekme/itme ve Move etkilerinden etkilenmez.
- Tooltip (EN): *"Unyielding: stuns only cost the Warden one action; other ailements last 1 turn less."*

### 4.2 Anchored (Iron Mooring bağı)
- Her canlı Mooring: Warden'a **+5 zırh, +5 büyü zırhı**. Chain Hook en az bir Mooring ister.
- Mooring kırılınca: Warden **Staggered** (1 eylem), bekleyen **Breaking Span iptal**, rozet sayısı azalır.
- Faz III'e girerken kalan Mooring'ler kopar (Stagger vermeden): son faz saf bir yarıştır.
- Mooring'ler sıra almaz, hedeflenebilir, alan skill'lerine girer, taunt/guard yapmaz, şifa/kalkan almaz; Hexer Omen'i alır (Ill Omen alıcısı da olabilir).

### 4.3 Ember Heart (fazlar)

| Faz | Can | Adı (banner, EN) | Değişen |
|---|---|---|---|
| I | %100-66 | *"None shall cross."* | 2 eylem; Anchor Smash, Breaking Span (row), Chain Hook |
| II | %66-33 | *"The Ember wakes."* | Ash Brand açılır; Breaking Span `rect 2x3` |
| III | %33-0 | *"The span fails."* | 3 eylem; güç x1,15; zırh/büyü zırhı x0,5; Mooring'ler kopar (Chain Hook kapanır); Fall of King's Bridge anında telgraflanır, sonra cd 4 |

- **Faz kilidi:** tek bir vuruş (ya da tek bir skill) en fazla bir eşiği geçer; fazla hasar eşiğin 1 altında durur. Böylece büyük bir patlama Faz II'yi ya da Fall'u atlatamaz.
- **Geçiş anı:** eşik geçilince eylem sırası beklemeden faz bandı (1,5 sn), Warden kükrer (hasarsız); bekleyen telgraflar korunur. Bir sonraki eylemleri yeni fazın kurallarıyla.

---

## 5. Boss YZ'si (`ai.json > profiles.bridge_warden`, terazi + boss kuralları)

Genel: Warden de mevcut tek değer terazisini kullanır (`ai-value.ts`); telgraflı skill'in değeri = çözülme anında işaretli hücrelerde **tahmini** kalacak birimlere beklenen hasar x `telegraphHitShare` (oyuncu kaçacağı için iskonto, öneri 0,5) + kaçmak için harcanacak oyuncu turlarının değeri. Belirleyici, rastgelelik yok.

| Faz | Eylem 1 (tipik) | Eylem 2 (tipik) | Eylem 3 |
|---|---|---|---|
| I | Span hazırsa: en çok birimin durduğu sıraya Breaking Span | Chain Hook: Span'in sırasına arka hattan kırılgan birimi çek; yoksa Anchor Smash | - |
| II | Span hazırsa rect 2x3 (en kalabalık iki sıra); değilse Ash Brand (güvenli hücrelerde en çok komşusu olan birime) | Chain Hook / Anchor Smash | - |
| III | Fall bekliyorsa: Anchor Smash (Keystone'daki ön birime) | Ash Brand (Keystone'lar komşuysa ödüllü) | Anchor Smash ya da Breaking Span |

Kurallar:
- Bir turda en fazla 1 yeni telgraf; Span + Brand aynı anda bekleyebilir.
- Easy YZ: Span sırasını birim sayısına göre değil, ilk dolu sıraya atar; Hook kombinasyonu yapmaz. Hard YZ: Hook + Span kombinasyonunu ve Brand + Span sıkıştırmasını her fırsatta kurar.
- Maç kaydı anahtarları: `telegraph breaking_span cells [..] predicted 2 foe(s)`, `resolve breaking_span hit [P0,P3] avoided [P4]`, `brand P6 burst plus @cell 7 hits 2`, `phase 2 (hp 316/480)`, `mooring broken -> stagger, span cancelled`.

---

## 6. Motor ihtiyaçları (engine-dev iş listesi)

### 6.1 Bugün mevcut sistemle yapılabilenler
| Parça | Mevcut karşılığı |
|---|---|
| Can/stat/güç ayarı, büyük çizim, boss rütbesi, özel ad | `UnitSetup.modifiers` (`hpMult`, `statMult`, `powerMult`, `spriteScale`), `tier: boss`, `displayName` |
| 2 eylem/tur | `modifiers.actionsPerTurn` |
| Anchor Smash | normal `damage` skill'i |
| Flooded Planks | mevcut `ground` etkisi (hücrelere zemin) |
| Alan şekilleri | `row`, `rect 2x3`, `plus` (`area-shape.ts`) |
| Ön sıra kuralını yok sayma | `ignoreFrontRow` / `ignoreReach` |
| Overextended | durum + alınan hasar çarpanı (zayıflık altyapısı; yoksa küçük iş) |
| Ash Brand'in dispel ile silinmesi | `{type:'dispel'}` (Mana Barrier) |
| Mooring'lerin tahtaya konması | `units.enemies[slot].summoned` benzeri doğrudan yerleştirme (madde 251) |
| Zorluk | `campaign.json > difficulties` (Hard boss +%10/+%10 zaten var) |

### 6.2 Yeni gerekenler
| # | İş | Ayrıntı | Boyut |
|---|---|---|---|
| M1 | **Boss class kaydı** | `data/classes/bridge_warden.json` (gizli; `randomPool` ve takım seçiminde yok). Karşılaşma doğrulaması bugün sınıfların `randomPool` içinde olmasını istiyor: `bossClasses` istisnası. `overrides.hpRegen` (yeni) | S |
| M2 | **Telgraflı gecikmeli alan saldırısı** | Skill etkisi `{type:'telegraph', resolve:'casterNextTurn', area, effects:[...]}`: kullanılınca hücreler kaydedilir (`battle.telegraphs`), olay `telegraph {source, skill, cells, board, resolvesAt}`; sahibinin sonraki tur başında (zemin/DoT tiklerinden önce) çözülür, olay `telegraphResolve {hit, avoided}`; iptal olayı `telegraphCancel {cause}`. Sahip ölünce iptal. İki modda çalışmalı (test modunda: sahibinin bir sonraki eyleminden önce) | L |
| M3 | Telgraf adalet kuralı | Çözülme, karşı taraftaki her canlı (sersem olmayan) birim en az bir kez oynamadan gerçekleşmez (gerekirse sahibin sonraki turuna ertelenir). Sıra çubuğu tahmini bunu gösterir | M |
| M4 | **Birime bağlı telgraf** (Ash Brand) | Debuff `ash_brand` + çözülmede taşıyanın O ANKİ hücresi merkezli şekil; dispel/ölüm iptal eder | M |
| M5 | **Keystone (güvenli hücre)** | Fall telgrafının `excludeCells: {perLane: 1, seeded}` kuralı; olayda `safeCells` | S |
| M6 | **Yer değiştirme: çekme** | Etki `{type:'pull', to:'laneFront'}`: hedefi kendi şeridindeki en öndeki boş hücreye taşır; olay `moved {uid, from, to, cause}`; boss'lar `immuneDisplacement` | M |
| M7 | **Faz sistemi** | Class/encounter verisinde `phases: [{ at: 0.66, actionsPerTurn, powerMult, armorMult, skillsAdd, skillsRemove, areaOverride:{breaking_span: rect 2x3}, onEnter:[...] }]`; faz kilidi (tek vuruş tek eşik); olay `phase {uid, phase, hpRatio}`; `actionsPerTurn` artık çalışma anında değişebilir | L |
| M8 | **Bağlı yardımcı nesne** (Iron Mooring) | `data/summons/iron_mooring.json` + `inert: true` (sıra yok, eylem yok, şifa/kalkan almaz, savaş bitişini sayılmaz); `anchoredTo` bağı: canlı yardımcı başına sahibe zırh eki (aura), ölümde sahibe Stagger + bekleyen `breaking_span` iptali; faz III `onEnter: breakMoorings` | M |
| M9 | **Unyielding** | `ccResist: { stunToStagger: true, debuffDurationDelta: -1, immuneDisplacement: true }`; Stagger = sıradaki tek eylemi yakar | M |
| M10 | Skill şartı `requiresAlly` | Chain Hook: `{ requiresAllyOf: 'iron_mooring' }` (YZ ve arayüz 'Needs a standing Mooring') | S |
| M11 | **YZ: telgraf değeri (boss tarafı)** | Bölüm 5; `telegraphHitShare`, kombinasyon (Hook → Span hücresi) değeri | M |
| M12 | **YZ: telgraftan kaçma (oyuncu vekili)** | Sefer simülatörü oyuncu tarafını da YZ ile oynatıyor: bekleyen telgrafın hücresindeki birim için Move değeri = önlenen beklenen hasar; Brand'de komşuluktan kaçma; Mooring kırmanın değeri (zırh, iptal, stagger). Bu olmadan sim boss'u olduğundan zor ölçer | M |
| M13 | Önizleme / skill-info / match-log | Hover'da "Collapses next Warden turn: 40", Move önizlemesinde güvenli/tehlikeli hücre; skill açıklamaları veriden; bölüm 5 kayıt anahtarları | M |
| M14 | Testler | Telgraf zamanlaması, iptal (Mooring, ölüm), adalet kuralı, Keystone determinizmi, pull, faz kilidi, Stagger, iki modda determinizm; `damage-scale-rule` yeni etkileri (telegraph içi `damage`) ölçekli saymalı | M |

### 6.3 Arayüz (ui-dev)
- Telgraf hücreleri: oyuncu tahtasında ortak hücre plakası dilinde (`CellTile`) **çatlak taş plaka** + yavaş nabız (Span: pas turuncusu kenar; Brand: kor turuncusu daire + plus komşuları soluk; Fall: tüm tahta kızıl, Keystone'lar altın kemer taşı).
- Sıra çubuğunda Warden'ın sonraki portresinin üstünde telgraf ikonu + "Collapse!" etiketi.
- Boss can çubuğu ekranın üstünde geniş (ad + faz çentikleri %66 / %33), Mooring sayısı rozeti.
- Faz bandı (1,5 sn, ortada, serif): "The Ember wakes." vb.
- Zincirler: Warden ile Mooring'ler arasında kodla çizilen sarkık zincir; Mooring kırılınca zincir kopar ve düşer.

### 6.4 Taslak veri (yalnızca şekil fikri; GERÇEK DOSYALARA YAZILMADI)
```json
{
  "bridge_warden": {
    "name": "The Bridge Warden",
    "units": [
      { "class": "bridge_warden", "slot": 1, "name": "The Bridge Warden", "tier": "boss", "boss": "giant",
        "mods": { "spriteScale": 2.2, "actionsPerTurn": 2 } },
      { "summon": "iron_mooring", "slot": 3, "name": "Iron Mooring" },
      { "summon": "iron_mooring", "slot": 5, "name": "Iron Mooring" }
    ],
    "fallback": "bridge_warden_escort"
  }
}
```

---

## 7. Görsel-işitsel brief

### 7.1 Renk paleti
| Rol | Renk | Not |
|---|---|---|
| Islak köprü taşı | **#4a5560** (koyu arduvaz) | Defender'ın #8a94a6 açık çelik grisinden belirgin koyu ve yeşilimsi |
| Yosun / nehir otu | **#5d6b3a** | taş aralarında |
| Pas | **#8a4a25** | zincir, çapa, palamar |
| Nehir suyu | **#2f6f73** (bulanık deniz yeşili) | sıçrama, Flooded Planks |
| Kor (Kül Laneti) | **#e0702a** + iç **#ffc46b** | göğüs çatlağı, gözler, Ash Brand |
| Kül | **#9a948a** | toz, kıvılcım sonrası |
| Class/fx rengi | `color` **#5b4636** (ıslak taş-pas kahvesi), `fx` **#e0702a** | |

Kafatası, mor, kemik YOK (Undead/Hexer'in). Altın yalnızca Keystone işaretinde.

### 7.2 İkonlar (v2 kılavuzu: `src/game/art-v2/bridge_warden/icons.ts`, 128x128)
| İkon id | Ne |
|---|---|
| `wardenlogo` | Ortasında kor parlayan çatlak bir köprü kemeri |
| `anchorsmash` | Taşa saplanmış paslı çapa, çevresinde taş kıymıkları |
| `breakingspan` | Ortasından çatlayan köprü kemeri, aralarından düşen tahta parçaları ve su sıçraması |
| `chainhook` | Paslı zincirin ucunda kıvrık kanca, hareket çizgileri |
| `ashbrand` | Kor turuncusu, ortası parlayan kül damgası (kızgın demir damga ucu) |
| `fallofthebridge` | İki yarıya ayrılan kemer, altında koyu nehir |
| `unyielding` (pasif) | Zincire sarılı taş yumruk |
| `anchored` (durum) | Zincirli demir palamar babası (sayı UI'da) |
| `overextended` (durum) | Taşa saplı kalmış çapa, kırmızı aşağı ok |
| `emberheart` (pasif) | Çatlak taş göğüs, içinde kor |
| `floodedplanks` (zemin) | Su basmış kırık tahta |
| `keystone` (işaret) | Altın kenarlı kemer taşı |

### 7.3 Animasyonlar (vfx; hepsi x `skillSlowdown`)
- **Anchor Smash (~1,0 sn):** Warden zinciri omzundan savurur, çapa yay çizip ön sıradaki hedefe iner; yere çarpınca taş kıymıkları + toz halkası, kısa ekran sarsıntısı.
- **Breaking Span telgrafı (~1,2 sn):** Warden çapayı kendi önündeki köprüye saplar; çatlak çizgisi zemin boyunca oyuncu tahtasına koşar ve işaretli hücrelerde dallanır; çatlaklardan ince su püskürmesi, hücreler yavaşça nabız atan çatlak plakaya döner.
- **Breaking Span çözülmesi (~1,3 sn, aşamalı değil, tek an):** işaretli hücrelerde taş levhalar içe çöker, kahramanlar kısa bir düşüş-sarsıntı (sprite 12 px aşağı-yukarı), alttan beyaz-yeşil su sütunu, kırık tahtalar havada döner; ardından hücrelerde Flooded Planks dokusu (ıslak, dalgalı). Warden'ın çapası köprüde saplı kalır (Overextended göstergesi).
- **Chain Hook (~1,1 sn):** zincir Mooring'den Warden'ın koluna gerilir, kanca hedefe uçar (zincir piksel halka dizisi), saplanır, hedef kendi şeridinde ön hücreye sürüklenir (toz izi), kanca geri çekilir.
- **Ash Brand (~1,0 sn):** Warden'ın göğüs çatlağı parlar, ağızdan/göğüsten tek bir kıvılcım kavisle hedefe uçar, hedefin göğsünde kızaran damga; damga rozeti nabız atar. **Çözülme (~0,8 sn):** damga patlar, plus şeklinde kor halkası ve kül yağmuru.
- **Fall of King's Bridge telgrafı (~1,8 sn; ultimate):** Warden iki zinciri birden çeker (Faz III'te Mooring'ler kopuyor: zincirler savrulur), tüm oyuncu tahtası kızıl çatlaklarla dolar, Keystone'lar altın ışıkla belirir, ekran %15 kararır. **Çözülme (~1,6 sn):** Keystone dışındaki tüm taşlar aşağı kayar, büyük su patlaması, toz perdesi; Keystone'lar havada asılı kalmış gibi sabit.
- **Faz geçişleri:** Faz II: göğüs çatlağından kor ışığı fışkırır, gözler turuncuya döner. Faz III: sırttaki kemer taşları dökülür (sprite'ın üstüne kodla kırık taş parçacıkları), çatlak genişler.
- **Iron Mooring kırılması (~0,8 sn):** demir baba gıcırdayarak eğilir, zincir kopar ve suya düşer (sıçrama); Warden sendeler (Stagger yazısı).

### 7.4 Sesler (`data/audio-v2/bridge_warden.json`; filtreli gürültü + alçak darbe + `voice`; ÇAN / çınlama YOK: "toll" teması olsa da çan sesi kullanılmaz)
| id | Gerçek karşılığı | Kullanım |
|---|---|---|
| `chainDrag` | Kalın paslı zincirin taş üstünde sürüklenmesi (düzensiz metal tıkırtı + taş sürtünmesi, 1-3 kHz bant gürültü darbeleri) | Chain Hook, Anchor Smash savuruşu, idle |
| `anchorImpact` | Ağır demirin taşa çarpması: 50-80 Hz gövde + kısa taş kırılma kıymığı | Anchor Smash |
| `stoneCrack` | Taş levha çatlaması (keskin kuru çatırtı, alçak geçiren kuyruk) | Span / Fall telgrafı |
| `timberSplinter` | Islak kalasın kırılması (lifli çatırtı) | Span / Fall çözülmesi |
| `riverBurst` | Su patlaması ve geri düşen su (geniş bant beyaz gürültü, yavaş sönüm) | Span / Fall çözülmesi, Mooring düşüşü |
| `bridgeGroan` | Yük altındaki köprünün uzun inlemesi (çok alçak, yavaşça kayan filtreli gürültü, 40-120 Hz) | Faz geçişleri, Fall telgrafı |
| `emberHiss` | Kızgın kömüre su değmesi / kor tıslaması | Ash Brand atma ve patlama |
| `wardenGrowl` | Göğüsten gelen alçak, boğuk insan homurtusu (`voice`, formantlı, koro DEĞİL) | Faz bandı, ölüm |
| `ironCreak` | Gergin demirin gıcırtısı ve kopma "tank" sesi yerine boğuk kopuş | Mooring kırılması |

Ölçüm: tepe 0,25-0,88, kırpma yok; Ömer kulakla onaylar.

### 7.5 Sprite (ChatGPT, İngilizce; mevcut karakter görselini referans olarak ekle)

**Yön:** mevcut tüm sprite'lar SAĞA bakar; motor düşman tarafındaki birimleri otomatik çevirir (`combatant-view.ts`: `side === 'enemy'` → `setFlipX(true)`). Bu yüzden Warden de **SAĞA bakan** çizilir; oyunda sola (oyuncuya) bakar. (Sola bakan çizilirse çift çevrilir.)

```
STYLE
Detailed high-resolution pixel-art look, same style as the attached reference character: crisp pixel clusters, thick dark outline around the whole silhouette, soft cel shading with 3-4 tones per material, no blur, no painterly anti-aliased edges. Transparent background. Canvas 1254x1254 px, the figure fills most of the canvas (it is a giant boss), centered, feet near the bottom edge.

POSE AND FRAMING
Full body, standing, three-quarter view facing RIGHT. Massive, hunched, heavy stance, knees bent, one huge arm hanging forward holding a long rusted chain that ends in a giant iron ship anchor resting on the ground; the other arm raised slightly with rusted chain wrapped around the forearm, links trailing off the edge behind it. Head clearly visible.

CHARACTER
"The Bridge Warden": a colossal cursed bridge-keeper fused with the stone of an old medieval river bridge. Humanoid but not human-shaped armor: the body is built from wet, dark slate-grey bridge masonry blocks with moss and river weed in the joints; a broken stone arch forms its hunched back and shoulders, like the bridge is growing out of it. Its head is a weathered stone face half-covered by a rusted iron grate (like a portcullis visor), two small glowing ember-orange eyes behind it. In the middle of its chest a deep crack glows with ember-orange fire and drifting grey ash (the curse). Rusted iron mooring rings bolted into the shoulders, chains hanging from them. Water drips from its arms.

COLOR PALETTE
Dark wet slate grey-blue (#4a5560), moss green (#5d6b3a), rust brown-orange (#8a4a25), murky river teal (#2f6f73) for drips and wet sheen, ember orange (#e0702a) and pale ember yellow (#ffc46b) only in the chest crack and eyes, ash grey (#9a948a) particles. Muted, heavy, medieval dark fantasy.

DO NOT include
A knight in plate armor, a shield, a sword or axe, a helmet with plume, a cape, human skin, skulls or bones, purple or magic runes, animals, bells, text, logos, frames, background scenery, a second character, ground shadow larger than the feet.
```

**Iron Mooring (ayrı küçük sprite, 1254x1254, aynı stil):**
```
Same pixel-art style as the attached reference. Transparent background. A single heavy medieval iron mooring bollard bolted into a chunk of broken bridge stone, rusted and wet, with moss at the base; a thick rusted chain is wrapped twice around it and its loose end trails off to the LEFT edge of the canvas. Faint ember-orange glow in the cracks of the stone. Object only, no character, no text, no background. Facing direction neutral, three-quarter view.
```

Animasyon seti: Warden için `idle` (tek görsel yeterli; zincir sallanması ve kor nabzı kodla), `attack`, `cast`, `hit`, `death` (ileride); avatar kırpması yüz + göğüs çatlağı. Mooring: yalnızca `idle` + kodla kırılma.

---

## 8. Balans notları

### 8.1 Hedefler
| Ölçüt | Hedef |
|---|---|
| İlk deneme kazanma (Medium vekil, `sim:campaign`) | **%45-60** (boss bandı); Easy +10-15 (~%60-75); Hard -15-20 (~%30-45) |
| Süre | **8-10 takım turu** (~45-55 toplam sıra); Faz I ~3, Faz II ~3, Faz III ~2-3 |
| Sıkıcı olmama ölçütleri (sim'e yeni satırlar) | (1) Takım turlarının en az %60'ında bekleyen bir telgraf olsun; (2) Warden'ın art arda en fazla 2 turu telgrafsız geçsin; (3) oyuncu vekilinin Move kullanımı savaş başına 3-8; (4) telgraflardan kaçınma oranı Medium vekilde %50-75 (hiç kaçılamıyorsa adaletsiz, hep kaçılıyorsa anlamsız); (5) Mooring'lerin en az biri kazanılan savaşların %70'inde Warden'dan önce kırılsın; (6) telgraf hasarının toplam boss hasarındaki payı %40-60 |
| Ölümler | Kazanılan savaşta ortalama 0,5-1,2 kahraman düşsün (gerilim var, ama tek telgraf takımı silmesin) |

### 8.2 Kaba hesap (Medium, 4 kişilik ortalama takım)
- Takım etkin hasarı: Faz I ~55/tur (zırh 22), Faz II ~65/tur (Mooring'ler kırıldıysa), Faz III ~85/tur (zırh yarı) → 163 + 159 + 158 can ≈ 3 + 2,5 + 2 tur; kaçma turlarıyla ~9 tur.
- Warden hasarı: 9 turda ~13 Warden turu (Faz III'te 3 eylem) → ~26-30 eylem. Ortalama eylem ~14 etkin (Anchor Smash ~20, kaçılan telgraflar 0, yenenler 30-45) → toplam ~360-420 → takım canı ~340 + şifalar: dengede.
- Kırılma noktaları: (a) Faz III 3 eylem + Fall aynı anda çok sert olabilir → ilk kol Faz III eylem 3 → 2 ya da güç x1,15 → x1; (b) Hook + Span kombinasyonu şifacıyı tek turda öldürüyorsa Span 2,0 → 1,7; (c) alan class'ları plus ile üçünü birden vurduğu için Mooring'ler çok çabuk düşüyorsa can 55 → 70; (d) Hexer Doom'u faz kilidine takılır (iyi).
- Ayar kolları (sırayla): Warden canı 480; Span gücü 2,0; Faz III eylem 3; Mooring canı 55; Overextended %25; Keystone sayısı 3.
- **Can sarmalı (madde 264):** bu tasarım takımın boss'a makul canla girdiğini varsayar. Boss düğümüne varınca tam iyileşme ("kamp", madde 264 seçenek A) kabul edilirse sayılar ona göre; edilmezse Warden canı ~%10 düşürülür.

### 8.3 Class etkileşimleri (sim senaryoları)
| Class | Rolü bu savaşta |
|---|---|
| Defender | Taunt Hook ve Brand'i kendine çeker; Guard ile Fall'u paylaştırır; Tremor Slam Warden'ı yavaşlatır (Slow 1 tur kısalır) |
| Paladin / Druid | Telgraf yenince toparlar; Resurrection Fall sonrası kritik |
| Mage | Mana Barrier Brand'i siler; Meteor plus @4 üçünü vurur |
| Anti-Mage | MP yakıp Ash Brand'i engeller (Warden MP 42) |
| Archer / Hexer / Undead | Uzaktan Mooring kırıcı; Hexer Doom faz kilidine takılır |
| Warrior / Cutthroat | Overextended penceresinde patlama; Abyssal Fury ile Mooring'e uzanır; Backstab Warden'a uygun (arkası boş) |
| Gambler | All In'i Overextended'a sakla |

---

## 9. Ömer'e sorular (önerili)

1. **Tema:** A "The Bridge Warden" (köprüyle kaynaşmış zincirli taş bekçi), B "The Drowned Toll" (nehir ruhu), C "Headsman" (köprü celladı)? **Öneri: A.**
2. **Yardımcılar:** Warden + 2 Iron Mooring (kırılınca zırh düşer, Warden sendeler, çökme iptal olur) mu, tek başına dev mi? **Öneri: yardımcılı** (oyuncuya her tur "boss mu zincir mi" kararı).
3. **Ad:** haritadaki "The Bridge Warden" mı kalsın, yoksa bir kişisel ad mı (ör. "Harrow, the Bridge Warden")? **Öneri: The Bridge Warden** (alt başlıkla aynı, isimsiz efsane).
4. **Faz III zorluğu:** son fazda 3 eylem + her 4 turda bir "Fall of King's Bridge" (4 kahraman, 3 güvenli taş: biri hasarı yer). Bu sertlik doğru mu? **Öneri: evet**, sim fazla sert derse önce eylem 3 → 2.
5. **Boss'a girerken can:** madde 264'teki "boss düğümünde tam iyileşme (kamp)" kararı bu boss'un sayılarını belirliyor. **Öneri: A (kamp)**; telgraflı bir boss'a %30 canla girmek kaçmayı anlamsızlaştırır.
6. **Telgraf zamanı:** uyarılar "Warden'ın bir sonraki turunun başında" patlar ve Warden takımdaki herkesten yavaş olduğu için her kahraman arada en az bir kez oynar. Bu tempo uygun mu, yoksa daha uzun uyarı (iki Warden turu) mı? **Öneri: bir Warden turu** (Warden 2 eylemli olduğu için arada oyuncuya baskı sürer).

---

## 10. Ömer kararları (2026-10-08) ve uygulama notları

**Kararlar (bölüm 9 kapandı):** (1) Tema A, ad **The Bridge Warden** (aynen). (2) Zincir babalarıyla: Warden + **2 Iron Mooring**. (3) Faz III sertliği (3 eylem + Fall of King's Bridge) uygun. (4)-(5) Boss'a girerken tam iyileşme kampı **YOK**: Warden canı 480 yerine **432** (%10 düşük). (6) Telgraflar **Warden'ın bir sonraki turunda** çözülür.

**Sim ayarı (npm run sim:campaign ölçümü; ilk deneme kazanma):** STR 20 -> **25**; güç: Anchor Smash 1,3 -> **1,5**, Breaking Span 2,0 -> **2,6**, Chain Hook 0,8 -> **1,1**, Ash Brand 1,2 -> **1,6**, Fall 2,2 -> **2,8**; can 432 (Ömer), Mooring canı 55, zırh/büyü zırhı ekleri 5/5 aynen. Oyuncu vekili telgraftan kaçma bedeli `ai.json > telegraph.dodgeOpportunityShare` 1,0. Hard'da Warden'a boss rütbe eki (+%10 can/güç) UYGULANMAZ (`noTierMods`; ekle Hard ilk deneme ~%15 çıkıyordu); genel Hard eki (+%12 can, +%5 güç) uygulanır. Sonuçlar open-questions madde 269.

**Uygulama varsayımları (open-questions 269):** telgraf çözülmesi isabet zarı atmaz (uyarıldılar); Faz III'e girerken bekleyen Breaking Span iptal olur, yerini Fall alır (aynı anda tek alan telgrafı); Unyielding: debuff süresi kısaltması yığılan durumlara (Omen) uygulanmaz; Stagger/Ash Brand/Anchored durumları kuralla süren (untilResolved) durumlardır; telgraf adalet kuralı: kurulduğu an karşı tarafta canlı ve sersem olmayan her birim bir kez oynamadan çözülmez (ertelenir); oyuncu vekili art arda Move kuralına telgraf kaçışında takılmaz; Easy oyuncu vekili de telgraftan kaçar (yalnızca Move ile).

# Savaş Sistemi (TASLAK)

## Düzen
- Yandan görünüm: parti solda (4 karakter), düşmanlar sağda (1-5).
- Üstte/yanda **sıra çubuğu**: sıradaki sonraki ~8 aktör görünür.

## Sıra sistemi (Ömer'in kararı)
- Her aktörün **Hız (SPD)** statı var. Sıra bu staha göre belirlenir.
- Sıra **dinamik**: hız buff/debuff, yavaşlatma, hızlandırma, "sıra öne çek/geri it" gibi efektler sırayı anında değiştirir. Sıra çubuğu bu değişimi canlı gösterir.
- Önerilen uygulama (Ömer itiraz etmezse): **sayaç (ATB benzeri) modeli** — her aktörün bir eylem sayacı var, her tikte `SPD` kadar dolar, eşiğe ulaşan aktör oynar. Efektler sayacı doğrudan değiştirebilir. Bu, hız değişimlerini doğal ve öngörülebilir kılar ve sıra çubuğu tahmini kolayca hesaplanır.
- Eşit sayaçta: sabit bir sıralama kuralı (parti önce, sonra seed'li rastgele) uygulanır.

## Eylemler
Saldır, Yetenek (skill), Savun, Item, (Kaç?). Detaylar `classes.md` ve `data/skills.json`.

## Temel statlar (taslak)
HP, MP/Kaynak, ATK, DEF, MAG, RES, SPD, CRIT, EVA. Formüller `data/formulas.json` içinde, koda gömülmez.

## Durum efektleri (taslak liste)
Zehir, yanma, sersemleme (tur kaybı), yavaşlatma, hızlandırma, kalkan, taunt, lanet. Taunt'ı olan birim kontrol (CC) durumu (şu an yalnızca Stun; veride `breaksTaunt`) yerse taunt o anda silinir. Her efektin süresi tur/tik cinsinden veri dosyasında tanımlı.

## Ömer'e açık sorular
`open-questions.md` içinde.

## Hasar ölçekleme kuralı (Ömer kararı)
**Tüm hasarlar (damage), aksi açıkça belirtilmedikçe, skill'in kendi statı neyse (skill'in `scale` alanındaki stat: str/int/dex/luck) o statın değerine göre oran (yüzde) alır.**
- Kapsam: `damage` etkisi, `ground` (zehir/yanık/kutsal ateş) etkisi, çağrılan birimlerin hasarı (birimin kendi en yüksek statı). Bir skill'in tüm ölçekli etkileri (hasar, yer etkisi, şifa, kalkan) aynı statı kullanır; skill statı class'ın primary statıyla uyumlu olmalıdır.
- **Aksi belirtmek (istisna):** etkide `scale` alanı hiç yazılmaz (selfDamage, manaBurn gibi zaten ölçeksiz etki türleri) ya da değer sabittir; bu durumda skill'in `_not`/açıklamasında gerekçe yazılır ve istisna `tests/damage-scale-rule.test.ts` içindeki `SCALE_EXCEPTIONS` listesine skill adı + etki türü + gerekçeyle eklenir. Listede olmayan ölçeksiz hasar etkisi test'i kırar.
- (Eski Thorn Shield / `thorns` yansıma mekaniği madde 222 ile kaldırıldı.)
- Mevcut istisnalar: Abyssal Cry `selfDamage` (maks can yüzdesi bedeli), Mana Steal ve Drain Field `manaBurn` (sabit MP, can hasarı değil).

## İsabet: Miss ve Dodge (Ömer kararı)
Her hasar vuruşunda TEK zar atılır: hit şansı = accuracy - evasion ([0, 1]). Zar hit şansının altındaysa isabet; hit şansı ile accuracy arasındaysa hedefin KAÇINMASI yüzünden iska (`dodge` olayı, yazı hedefin üstünde "Dodge"); accuracy'nin üstündeyse saldıranın İSABETİ yetmediği için iska (`miss` olayı, yazı saldıranın üstünde "MISS"). İki iskada da hasar ve skill etkileri uygulanmaz.

## Rage (Warrior kaynağı)
Class verisinde `resource: rage` olan birimin MP'ye ek bir Rage barı (0-100) vardır; savaş başında 0. Skill'lerle isabet eden hasar vurdukça dolar (vuruş başına `4 + 0,25 x hedef canı yüzdesi`, en çok 15; çok hedefli skill'de en iyi tek hedef, skill başına en çok 30), zamanla azalmaz, alınan hasarla artmaz. Abyssal Cry'ın bedeli 50 Rage'dir (MP değil). Sayılar `formulas.json > rage`.

## Global skill'ler: Rest, Skip Turn, Move (data/global-skills.json)
Her birim class'ın 4 skill'inin dışında üç ortak eylem kullanabilir; hepsi bedelsizdir ve turu bitirir. **Rest:** +15 MP (maks MP aşılmaz). **Skip Turn:** turu geçer ve birimin bir sonraki turuna kadar %100 hız desteği alır (hız x2, Haste/Slow ile toplamsal; sayaç iki kat hızlı dolar, sıradaki tur yarı sürede gelir ama birim hemen tekrar oynamaz, düşman araya girebilir; sıra çubuğu bunu hesaba katar), üst üste en çok 1 kez, yalnızca `turns` modunda. **Move:** kendi tarafındaki boş (üzerinde canlı birim olmayan; ölü dostun yuvası YASAK, diriltme için ayrılır) bir yuvaya geçer; ön sıra kuralı, aura/yan komşuluk, taunt/guard ve çağrı yerleşimi yeni yuvaya göre işler. Çağrılan birimler bu eylemleri kullanamaz. Yapay zeka bunları yalnızca taktik değer hesabıyla kullanır (`data/ai.json > global`).

## Takım boyutu
5-5 varsayılandır ama her taraf 1-12 (4 x 3 yuva) birim alabilir; rastgele takımlarda boyut seçilir, havuzdan fazlasında sınıflar tekrar eder.

## Mana
Tüm class'larda taban MP 30'dur; MP = 30 + 2 x INT, tur başı yenilenme = round(INT x 0,33).

## AOE şekilleri (hücre kümesi tabanlı alan; engine-dev, Ömer isteği)
AOE mantığı şeritler, kareler, dikdörtgenler üzerinden ilerliyor. Skill'in `area` alanı bir **şekil** tanımlar; oyuncu bir **anchor hücre** seçer (boş hücre de olabilir) ve şekil bu hücreye göre hücre kümesi üretir. Şekil hücre kümesi tek başına "vurulabilir hücreler"i belirler; o hücrelerdeki canlı (ve erişilebilir) düşmanlar vurulur. Hedef türü `area_enemies` (AI aoe önceliği, UI, önizleme tek tip işler). **Tüm alan skill'leri şekillidir** (madde 220): eski `area.radius` ve `column_enemies` kaldırıldı; veri doğrulaması (`skillAreaProblem`, `tests/content.test.ts`) bunları reddeder.

**Terimler.** SIRA (row) = aynı derinlik (yuva = sıra*3+şerit, sıra 0 en önde); ŞERİT (column / lane) = aynı şeritteki 4 sıranın tamamı.

**Şekiller (`area.shape`):**
- `row`: anchor hücrenin SIRASINDAKİ 3 hücre. Örnek: anchor 4 -> [3,4,5].
- `column`: anchor hücrenin ŞERİDİNDEKİ 4 hücre. Örnek: anchor 4 -> [1,4,7,10].
- `plus`: anchor + 4 yön komşusu (sıra±1 aynı şerit, şerit±1 aynı sıra); tahta dışı hücreler atlanır (kenarda kırpılır). Örnek: anchor 4 -> [1,3,4,5,7]; anchor 0 -> [0,1,3]. (`radius: 1` ile aynı hücreler.)
- `rect` (`rows`, `cols`, `anchor: 'bottom_left'`): `rows` sıra x `cols` şerit dikdörtgen. "AxB" = A sıra x B şerit (Ömer: "2 rows x 3 columns"). **Tüm boyutlar geçerli: rows 1..4, cols 1..3 (1x1, 1x3, 3x2, 4x1, 4x3 ...)**; 1x3 = row, 4x1 = column, 4x3 = tüm tahta. Tahtayı aşan / tam sayı olmayan boyut VERİ HATASIDIR (content testi kırılır); çalışma zamanında güvenlik için yine tahtaya kısılır. **Anchor kuralı (madde 226, eksen eksen ekran uzayında):** boyutu 3 ve üstü olan eksende fare hücresi alanın ORTASIdır (3 -> tam orta, 4 -> orta-sol: fare soldan 2. hücre); tahta kenarı yüzünden ortalanamıyorsa o eksende SOLDAN referans alınır (fare = alanın başlangıcı). Boyutu 1-2 olan eksende fare hücresi dikdörtgenin EKRANDAKİ sol-alt köşesidir (yatayda en sol, dikeyde en alt); dikdörtgen ekranda sağa ve yukarı uzanır. Tahta dışına taşarsa BOYUT KORUNARAK tahtaya KAYDIRILIR (clamp): her hücre geçerli anchor'dır. Oyuncu ve düşman tarafı aynalıdır, bu yüzden ekranda "sol": düşman tarafında ÖN sıra, oyuncu tarafında EN ARKA sıra yönüdür; hesap `formation.screenGrid` (layout'tan türetilir) üzerinde yapılır.
  - 2 sıra x 3 şerit, düşman tarafı: anchor 4 (sıra 1) -> [3..8]; anchor 9/11 (en arka sıra) kayar -> [6..11]; anchor 0 -> [0..5]. Oyuncu tarafı: anchor 9 (en arka, ekranda en solda) -> [6..11]; anchor 0 (ön) kayar -> [0..5]. (Şerit ekseni 3 = tüm şeritler, sıra ekseni 2 = sol-alt kuralı.)
  - 3 sıra x 2 şerit (Blizzard), düşman tarafı: anchor 5 (sıra 1, şerit 2) -> sıra ekseni ortalı (0..2), şerit ekseni alt (1,2) = [1,2,4,5,7,8]; anchor 9 (en arka) -> ortalanamaz, soldan da taşar, kayar -> [3,4,6,7,9,10]. 3x3 (Arrow Rain, Drain Field): anchor 4 -> [0..8], anchor 7 -> [3..11], anchor 0 -> soldan [0..8].
- `x` (madde 225): anchor + 4 ÇAPRAZ komşu (sıra±1 VE şerit±1); tahta dışı atlanır. Örnek: anchor 4 -> [0,2,4,6,8]; köşe 0 -> [0,4]; kenar 1 -> [1,3,5]. İsteğe bağlı generic `area.hitsAtCenter: N` (her şekilde): anchor hücredeki birim hasar etkilerinden N kez vurulur, her vuruş ayrı isabet/hasar/kritik zarı; hasar dışı etkiler bir kez (Saltire Cut: 2, "X çizilirken merkezden iki kez geçilir").
- **İki tahtaya atılabilen alan (`target: area_any`, madde 225):** anchor kendi ya da karşı tahtada seçilir; her etkinin `side` alanı (allies | enemies) kimi etkilediğini söyler (Smoke Bomb: düşman tarafında düşmanlar Blinded, kendi tarafında dostlar Shrouded). API: `useSkill(uid, id, undefined, slot, board)` ya da `tile:<yuva>` (kendi tahtası), `shapeAnchorCells`, `shapePreviewCells(..., board)`; olay `skillUsed.board`.

**Kurallar.** (1) Melee şekil skill'i yalnızca erişilebilir (ön sıra, `reach`) hücrelerdeki düşmanlara vurur; şekil içinde ama erişim dışındaki düşmanlar vurulmaz. Anchor, şekil en az bir vurulabilir düşmanı kapsıyorsa geçerlidir (boş hücre dahil); aksi halde reddedilir ('No target in the area'). Anchor birimi arkada olabilir (anchor yalnızca hücreyi belirler). (2) Ölü birim hücreyi doldurmaz. (3) Taunt tek hedefli skill'leri sınırlar; alan skill'leri (eskisi gibi) etkilenmez. (4) `ignoreFrontRow`/`ignoreReach` aynen. (5) Her vurulan hedef ayrı isabet/kritik zarı alır.

**API (UI/vfx için).** `battle.shapeAnchors(uid, skillId)` -> seçilebilir anchor yuvaları; `battle.shapePreviewCells(uid, skillId, anchorSlot)` -> `{ cells, targets (uid), valid, reason }` (hover); `battle.areaCells(skillId, anchor, board)` -> hücreler; `battle.isShapeSkill(skillId)`. Cast: `battle.useSkill(uid, skillId, anchorUnitUid?, anchorSlot?)` (boş hücre: yalnızca slot). `skillUsed` olayı: `center`/`anchor` (anchor hücre) ve `cells` (kapsanan tüm hücreler, hedef tahtasında) taşır; vurulanlar `targets` ve `damage` olaylarındadır. Saf fonksiyon: `shapeCells(area, anchorSlot, board, formation)` (`src/engine/area-shape.ts`).

**AI.** Şekil skill'i için her seçilebilir anchor (boş hücre dahil) bir adaydır; aynı hücre kümesini veren anchor'lar tek aday (en küçük yuva). Değerlendirme mevcut aoe değerlendirmesiyle aynı (toplam beklenen hasar, `minTargets` bağlamı). Maç kaydı aday satırı: `shape rect 2x3 @cell 4 -> cells [3,4,5,6,7,8] hits 2 foe(s)`.

**Test karakteri: Geometer (`aoe_tester`, `testOnly: true`, rol 'AOE Test').** Dört skill, her biri bir şekil: Row Sweep (`shape_row`), Column Spear (`shape_column`), Block Slam (`shape_rect` 2x3), Cross Burst (`shape_plus`); hepsi Int x 0,9 arcane büyü, 10 MP, cooldown 2. Rastgele takım havuzunda ve denge simülasyonunda YOK (`content.randomPool`); takım seçimi ve debug'da seçilebilir (`content.selectableClasses`), wiki/galeride görünür. Görsel/ikon/vfx geçici (mage görseli, mevcut ikon ve vfx).

**Aşamalı vuruş (`area.stages`, madde 220).** Şeklin hücreleri aşamalara bölünür, vuruşlar aşama sırasıyla gelir: `row` = sıra sıra (aynı derinlik bir aşama; varsayılan ÖN sıradan arkaya, yani saldırgandan uzağa), `column` = şerit şerit (varsayılan ekranda üstten alta), `distance` = anchor'a uzaklık halkaları (varsayılan merkezden dışarı). `reverse: true` sırayı çevirir. Hasar/şifa/zemin gücü AYNIDIR: her hedef bir kez vurulur, yalnızca SIRA değişir (önizleme ve AI toplamı aynı hesaplar; `falloff` aşamalar boyunca vuruş sırasıyla sürer). Aşamalı skill etkilerini her aşamada ayrı uyguladığı için yalnızca hedef başına işleyen etkiler olabilir: `damage` (bahis / kalkan tüketme yok), `status` (self değil), `randomStatus`, `ground` (her aşamanın hücrelerine ayrı bir zemin, kendi id'siyle). Olaylar: `skillUsed.stages` = `[{cells, targets}]` (dizin = aşama), aşama sürerken çıkan HER olayda `stage` numarası. Aşama gecikmesi/animasyonu UI/vfx işidir. API: `battle.areaStages(uid, skill, anchor)`, `battle.areaStageCells(skill, anchor, board)`, `battle.isStagedSkill(skill)`; saf: `shapeStages(area, anchor, board, formation)`.

**Skill -> şekil (madde 220).** Nature's Wrath rect 2x3 + stages row; Blizzard rect 3x2; Meteor plus; Judgment plus (zemin şeklin tüm hücrelerinde); Wail of the Dead plus + stages distance; Tremor Slam row (melee: ön sıra); Piercing Arrow column + stages row (falloff öndekinden arkaya); Arrow Rain rect 3x3; Drain Field rect 3x3. Güncel tablo veriden: wiki > Mechanics > Area shapes. Hedef SEÇİM türleri alan değildir ve şekilsizdir: Whirlwind (all_enemies), Radiance (everyone), Fist Crush ve Card Trick (random_enemies); Bone Slash `splash` ayrı mekaniktir.

## Cesetler, Raise Dead ve Treant (madde 222; Ömer kararı)
- **Ceset:** ölen her ÇAĞRI OLMAYAN birim yuvasında ceset bırakır. Durum `revivable` (Resurrection ile diriltilebilir; yuvası rezerve: Move Tile giremez) ya da `consumed` (Raise Dead tüketti: ARTIK diriltilemez, yuvası rezerve değil, `fallenSlots` dışı). Dirilince ceset kaydı biter. Çağrıların ölümü (sahibiyle birlikte ölmesi dahil) ceset bırakmaz. API: `battle.corpses(side)`, `battle.corpseOf(uid)`, `battle.corpseChoices(uid, skill)`, `battle.corpseToConsume(uid)` (YZ önerisi), `battle.summonSlots(uid, skill)`, `battle.summonPreview(uid, skill, corpseUid?, slot?)`, `battle.reviveBlockReason(uid, target)`; olaylar: `death.corpse`, `corpseConsumed {uid, by, slot, side}`, `summon.empowered`, `skillUsed.slot/corpseUid`.
- **Raise Dead (iki adım, madde 230):** önce tüketilecek ceset seçilir, sonra Skeleton'ın çıkacağı yuva. Ceset adayları karşı taraftaki diriltilebilir düşman cesetleridir (`corpseChoices`); en az bir ceset varken birini tüketmek ZORUNLU (hangisi oyuncunun kararı; `useSkill(uid, 'raise_dead', undefined, slot, undefined, corpseUid)`, eksikse 'Choose a corpse to consume'); ceset yoksa yalnızca yuva seçilir. Yuva: Undead'in KENDİ tahtasında boş ve ölü dosta ayrılmamış bir hücre (`summonSlots`; tüm çağrılar için geçerli; ayrılmış hücre 'That cell is reserved for a fallen ally'). Eski 'en son ölen otomatik' kuralı kalktı. Yapay zeka karşı takımda diriltilmesi EN TEHLİKELİ cesedi seçer: danger = (tehdit [max(str,int,dex)+hız] + en iyi skill değeri) x (maks can / 100) x 1,5 (kendisi diriltici ise) x 1,5 (tarafında yaşayan bir diriltici onu diriltebiliyorsa; yuvası doluysa yok); eşitlikte küçük yuva (`formulas.json > corpseDanger`). Yuvası mevcut çağrı kuralıyla (melee çağrı en öndeki, diğerleri en arkadaki boş yuva). Tüketilen ceset -> Skeleton beslenmiş (fed, `empowered`): veri dosyasındaki can/STR. Ceset yoksa beslenmemiş (unfed): can ve STR x0,67 (`data/summons/skeleton.json > variants`; can tam sayıya, STR 0,1'e yuvarlanır). MP, cooldown, ömür, Skeleton'ın skill'leri ve hasar azaltma aynı.
- **Resurrection:** tüketilmiş cesedi hedefleyemez ('Corpse was consumed'). Dirilen birim maks can ve mananın %30'uyla döner ve sonraki 2 turunun başında maks canının %10'unu yeniler (`revive.regen {turns 2, ratio 0,1}`: durum 'regen', olayda `cause: 'revival'`, miktar diriltme anında sabit, kritik yok, can maks'ı aşmaz; madde 230).

## Defender, Gambler, Archer ayarları (madde 230; Ömer kararı, denge testi YAPILMADI)
- **Guard kendine atılamaz** (`skills.json > guard.excludeSelf`): hedef listesinde atan yok; kendine 'Cannot guard yourself'; yalnızsa 'No ally to guard'. Taunt etkilenmez.
- **Tremor Slam:** MP 0, cooldown yok (güç aynı): sınırsız kullanılabilir.
- **All In daha az şansa dayalı, beklenen hasar aynı:** kazanma %75, kazanç x1,8 + 0,0667 x bahis, kayıp x0,6 (eski: %50, x3 + 0,1 x bahis, kayıp x0 = iska). Beklenen çarpan her bahiste 1,5 + 0,05 x bahis (eskisiyle aynı).
- **Sharpshooter:** sıra başına +%8 (eski +%7).
- **Hasar olayı kaynak alanları:** `damage.origin` ('skill' | 'ground' | 'status' | 'self'), `element`, `damageType`, yer etkisinde `ground` + `groundId`; `crit` her zaman var. UI hasar yazısının yanına kritik ve element/zehir/yanma ikonu koyar.
- **Treant:** uzak menzilli doğa kontrolcüsü. Root Smash havadan (`motion: sky`), ön sıra kuralı yok, INT ölçekli (Int 13,5 x 1,15 = eski Str 13,5 x 1,15 ham hasar). Thorn Shield yerine Vine Snare: 2x2 alan, Int x 0,45 doğa büyü hasarı + vurulan HER düşmana bağımsız %25 ihtimalle 1 tur Stun (`status` etkisinde `chance`, olayda `cause: 'vines'`), cooldown 3, 0 MP. Stun kuralları aynen (taunt'ı bozar; 1 turluk debuff Resilience ile kısalmaz).

## Cutthroat mekanikleri (madde 225; Ömer kararı, sayılar provizyon)
- **İsabet/kaçınma durumları:** `data/statuses.json > accuracyDelta / evasionDelta` (Blinded isabet -0,30 debuff; Shrouded kaçınma +0,20 buff). `battle.effectiveStats` uygular; gerçek vuruş, önizleme ve yapay zeka aynı hesabı kullanır; isabet/kaçınma 0 altına inmez, hit şansı [0, hit.max] arasında kalır. Shrouded eki Dex'in evasionMax sınırına tabi değildir.
- **Arkası boş hedef (`requiresOpenBehind`, Backstab):** yalnızca hedefin hemen arkasındaki hücresi (bir sıra derin, aynı şerit, hedefin tahtası) tahtada olan ve üzerinde CANLI birim olmayan hedef seçilebilir; ceset ve ölü dostun ayrılmış hücresi engel değildir; en arka sıradaki hedef seçilemez ('No room behind the target'), arkası dolu olan 'Target is shielded from behind'. Menzil/ön sıra kuralı yok (`ignoreReach`, `ignoreFrontRow`). Taunt bu süzgeçten sonra uygulanır. Olay `skillUsed.behindSlot/behindBoard/from`: görsel ışınlanma; formasyon değişmez.
- **Garantili kritik (`damage.guaranteedCrit`):** kritik zarı atılmaz, kritik çarpanı her vuruşa uygulanır; isabet zarı normaldir (iska olabilir).
- **Durum bonusu pasifi (`bonusVsStatus`, Opportunist):** hedefte listedeki durumlardan biri (Wound, Slow, Stun) varsa verilen hasar x(1 + bonus) (+%25); tüm vuruşlar, kritik ayrıca son çarpan.

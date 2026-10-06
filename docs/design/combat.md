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
- Yansıyan (thorns) hasar da aynı kurala uyar: Treant'ın Thorn Shield'ı `thorns` etkisiyle Str x power kadar sabit hasar yansıtır (scale alanı zorunlu; test DAMAGE_LIKE listesinde).
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
AOE mantığı şeritler, kareler, dikdörtgenler üzerinden ilerliyor. Skill'in `area` alanı bir **şekil** tanımlar; oyuncu bir **anchor hücre** seçer (boş hücre de olabilir) ve şekil bu hücreye göre hücre kümesi üretir. Şekil hücre kümesi tek başına "vurulabilir hücreler"i belirler; o hücrelerdeki canlı (ve erişilebilir) düşmanlar vurulur. Hedef türü `area_enemies` kalır (AI aoe önceliği, UI, önizleme tek tip işler); `area: { radius }` olan eski skill'ler DEĞİŞMEDEN çalışır (geçiş sürerken ikisi yan yana yaşar).

**Terimler.** SIRA (row) = aynı derinlik (yuva = sıra*3+şerit, sıra 0 en önde); ŞERİT (column / lane) = aynı şeritteki 4 sıranın tamamı.

**Şekiller (`area.shape`):**
- `row`: anchor hücrenin SIRASINDAKİ 3 hücre. Örnek: anchor 4 -> [3,4,5].
- `column`: anchor hücrenin ŞERİDİNDEKİ 4 hücre. Örnek: anchor 4 -> [1,4,7,10].
- `plus`: anchor + 4 yön komşusu (sıra±1 aynı şerit, şerit±1 aynı sıra); tahta dışı hücreler atlanır (kenarda kırpılır). Örnek: anchor 4 -> [1,3,4,5,7]; anchor 0 -> [0,1,3]. (`radius: 1` ile aynı hücreler.)
- `rect` (`rows`, `cols`, `anchor: 'bottom_left'`): `rows` sıra x `cols` şerit dikdörtgen. Fare hücresi dikdörtgenin EKRANDAKİ sol-alt köşesidir (ekranda en solda ve en altta); dikdörtgen anchor'dan ekranda sağa ve yukarı uzanır. Tahta dışına taşarsa BOYUT KORUNARAK tahtaya KAYDIRILIR (clamp): her hücre geçerli anchor'dır. Oyuncu ve düşman tarafı aynalıdır, bu yüzden ekranda "sol": düşman tarafında ÖN sıra, oyuncu tarafında EN ARKA sıra yönüdür; hesap `formation.screenGrid` (layout'tan türetilir) üzerinde yapılır.
  - 2 sıra x 3 şerit, düşman tarafı: anchor 4 (sıra 1) -> [3..8]; anchor 9/11 (en arka sıra) kayar -> [6..11]; anchor 0 -> [0..5]. Oyuncu tarafı: anchor 9 (en arka, ekranda en solda) -> [6..11]; anchor 0 (ön) kayar -> [0..5].

**Kurallar.** (1) Melee şekil skill'i yalnızca erişilebilir (ön sıra, `reach`) hücrelerdeki düşmanlara vurur; şekil içinde ama erişim dışındaki düşmanlar vurulmaz. Anchor, şekil en az bir vurulabilir düşmanı kapsıyorsa geçerlidir (boş hücre dahil); aksi halde reddedilir ('No target in the area'). Anchor birimi arkada olabilir (anchor yalnızca hücreyi belirler). (2) Ölü birim hücreyi doldurmaz. (3) Taunt tek hedefli skill'leri sınırlar; alan skill'leri (eskisi gibi) etkilenmez. (4) `ignoreFrontRow`/`ignoreReach` aynen. (5) Her vurulan hedef ayrı isabet/kritik zarı alır.

**API (UI/vfx için).** `battle.shapeAnchors(uid, skillId)` -> seçilebilir anchor yuvaları; `battle.shapePreviewCells(uid, skillId, anchorSlot)` -> `{ cells, targets (uid), valid, reason }` (hover); `battle.areaCells(skillId, anchor, board)` -> hücreler; `battle.isShapeSkill(skillId)`. Cast: `battle.useSkill(uid, skillId, anchorUnitUid?, anchorSlot?)` (boş hücre: yalnızca slot). `skillUsed` olayı: `center`/`anchor` (anchor hücre) ve `cells` (kapsanan tüm hücreler, hedef tahtasında) taşır; vurulanlar `targets` ve `damage` olaylarındadır. Saf fonksiyon: `shapeCells(area, anchorSlot, board, formation)` (`src/engine/area-shape.ts`).

**AI.** Şekil skill'i için her seçilebilir anchor (boş hücre dahil) bir adaydır; aynı hücre kümesini veren anchor'lar tek aday (en küçük yuva). Değerlendirme mevcut aoe değerlendirmesiyle aynı (toplam beklenen hasar, `minTargets` bağlamı). Maç kaydı aday satırı: `shape rect 2x3 @cell 4 -> cells [3,4,5,6,7,8] hits 2 foe(s)`.

**Test karakteri: Geometer (`aoe_tester`, `testOnly: true`, rol 'AOE Test').** Dört skill, her biri bir şekil: Row Sweep (`shape_row`), Column Spear (`shape_column`), Block Slam (`shape_rect` 2x3), Cross Burst (`shape_plus`); hepsi Int x 0,9 arcane büyü, 10 MP, cooldown 2. Rastgele takım havuzunda ve denge simülasyonunda YOK (`content.randomPool`); takım seçimi ve debug'da seçilebilir (`content.selectableClasses`), wiki/galeride görünür. Görsel/ikon/vfx geçici (mage görseli, mevcut ikon ve vfx).

**Geçiş planı.** Beğenilirse eski `radius` ve `column_enemies` skill'leri sırayla şekil tanımına taşınır (veri değişikliği: `area: { shape }`), test class'ı kaldırılır ya da debug aracı olarak kalır.

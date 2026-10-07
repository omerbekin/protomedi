# Sefer (Campaign) Tasarımı: Valdoria

Durum: **TASLAK v3 (yalnızca belge; kod yazılmadı).** Yazan: campaign-dev. v1: 2026-10-07; v2: aynı gün, Ömer'in cevapları ve iki yeni referansla; v3: Ömer'in v2 sorularına cevaplarıyla (can, Ironman, Ashford'da takım değişimi, Morvane görünürlüğü).

Ömer'in isteği: "Böyle bir görsel var (Valdoria sefer haritası). Benim karakterlerden biri bunun üstünde yürüyecek ve sıradaki map'e gidecek. Orada farklı düşmanlarla karşılaşacağız. Bu map full İngilizce olacak. Progress sistemini ele alacak, battle mantığına karışmayacak."

Referanslar (`docs/design/campaign/`):
- `valdoria-map-reference.webp`: harita (2000x1250, Türkçe etiketli; oyunda KULLANILMAZ, yalnızca konum/atmosfer referansı).
- `progression-concepts-reference.png`: "İlerleme Sistemi" kavramları: Tek yol, Seçim noktası, Birleşme noktası, Sis ve görünürlük.
- `borderlands-flow-reference.png`: Sınır Toprakları akışı ve her durağın öğrettiği şey. **Ömer: "Ashford Köyü 1'de yazıyor, onu dikkate alma":** Ashford 4. durakta kalır, başlangıç Mill Road'dur.

Oyun içi metinler İngilizce, açıklamalar Türkçe. Sayılar (düşman sayısı, çarpanlar, can oranları, takım sınırları) **PROVİZYON**dur; denge `balance-tester`'ın işidir.

### Ömer kararları (v2)
| # | Karar |
|---|---|
| 1 | Yenilince **bir önceki kayıttan** yüklenir. İki mod sefer başında seçilir: **Normal** (her savaştan sonra otomatik kayıt, en fazla 5 kayıt, en eskisi silinir) ve **Ironman** (yalnızca savaştan sonra kayıt, tek kayıt, üstüne yazılır). |
| 2 | Can savaştan savaşa **taşınır**. İleride eşya / skill ağacıyla savaş öncesi iyileşme (şimdi değil). |
| 3 | Takım **dinamik**: 1 karakterle başlar; Ashford Village'a kadar **tutorial** (takım 1-2 kişi); savaş aralarında takım değiştirilebilir; Ashford'dan sonra 2'den fazla karakter. |
| 4 | Tutorial'daki ilk karakter **lider**dir. Haritada önde liderin görünümü, arkasında diğerlerinin **silüeti** (yürüyen kafile). |
| 5 | Arka plan: yazısız, etiketsiz, yüksek çözünürlüklü, 16:9 harita (ChatGPT prompt'u 6.1'de). |
| 6 | Boss: **ikisi de** (güçlendirilmiş lider + eskort VE tek dev düşman). |
| 7 | Valdoria'dan sonra harita: **şimdilik yok**. |
| 8 | Ana menü: **evet**. |
| Harita | Dwarven Mine ile Misty Marsh **yer değiştirir**; **savaşsız akış kalmayacak**; St. Brann's Abbey **hazine** olur. |

### Ömer kararları (v3)
| # | Karar |
|---|---|
| 1a | Her zaferden sonra hayatta kalanlar can maks'ının **%20**'sini geri alır (ileride zorluk seviyesi gelirse değişebilir). |
| 1b | **Büyük boss'lardan sonra** (King's Bridge gibi, `type: boss`) **tam iyileşme**. |
| 1c | **"Retreat to last town" seçeneği YOK.** |
| 2 | Ironman'da yenilgi tek kayda döner (onaylandı). |
| 3 | **Tutorial takımı Ashford'da ayrılır**; orada **3 kişilik yeni takım** kurulur; **Valdren Keep'te 4. karakter**; 5. karakterin ne zaman geleceği **açık**. |
| 4 | Castle Morvane baştan sis altında adı ve silüetiyle **görünür** (onaylandı). |

### Ömer kararları (v4)
| # | Karar |
|---|---|
| 1 | Ashford'da yeni takım **11 sınıfın tamamından serbestçe** seçilir; tutorial sınıfları da seçilebilir. İleri not: "sonra belki havuzu daraltırız". |
| 2 | **4. karakter Valdren Keep'ten AYRILIRKEN katılır.** 5. karakter hâlâ açık. |
| 3 | Yazısız harita arka planı geldi: `assets/campaign/valdoria-bg.webp` (1672x941). Düğüm konumları bu görsele göre yeniden ölçüldü (3.1, 6.1). |

---

## 0. Mevcut oyun nasıl çalışıyor (okuma notları)

- Oyun açılınca doğrudan `TeamSelectScene` gelir (ana menü yok). Adreste `?seed=` varsa seçim atlanır, doğrudan `BattleScene`.
- Savaş başlatma: `this.scene.start('BattleScene', { seed, mode: 'turns', battleId, teams: { party, enemies }, partySize, enemySize })` (`BattleSceneData`). Takım listeleri 12 hücrelik dizi (dizin = yuva = sıra*3+şerit, `''` boş). Her taraf 1-12 birim.
- Motor: `content.battleSetup(battleId, seed, mode, teams, arrange)` -> `new Battle(...)`. Sınıflar yalnızca `content.classes` içinden; çağrılar (`data/summons/`) doğrudan takıma konamaz.
- Savaş sonu: motor `battleEnd {winner}` olayı; `BattleScene.showResult(victory)` sonuç ekranı (`src/game/result-screen.ts`), düğmeler yalnızca `onNewGame` / `onTeamSelect`. Dışarıya sonuç bildiren geri çağırma YOK.
- Ayarlar New Game / Team Select: `src/game/session-flow.ts` (`src/ui/` değil).
- Debug sekmeleri (CLAUDE.md güncel): Battle / Unit / Skills / Rolls / Speed & View / Setup / Characters / Data; dock bölümleri `DOCK_GROUPS`.
- Sınıflar: Warrior, Defender (STR); Archer, Cutthroat (DEX); Mage, Druid, Paladin, Undead, Anti-Mage (INT); Gambler, Hexer (LUCK; Hexer rastgele havuzda 11. sınıf, madde 245); Geometer (`hidden` + `testOnly`: sefer düşmanı/adayı OLAMAZ). Hexer karşılaşmalara da uygun (Witch's Hut, Black Cathedral). Çağrılar: Skeleton, Treant.
- Motorda birim bazında güçlendirme/zayıflatma (can/stat çarpanı, özel ad) YOK (yalnızca çağrı varyantları ve `spriteScale`). "Eksik canla başla" YOK. Tur başına ek eylem YOK. Bunlar engine-dev işi (bkz. 7).
- Savaş arka planı veriden (`battles/*.json > background`); şu an tek: `castle-hall`.

---

## 1. Akış

### 1.1 Ana menü (Ömer: evet)
Oyun açılışı -> **Main Menu** (yeni `MainMenuScene`):

| Button | Ne yapar |
|---|---|
| `Continue` | Kayıt varsa görünür; en son kaydı yükler. |
| `New Campaign` | Mod seçimi (`Normal` / `Ironman`) -> kahraman seçimi -> harita. |
| `Load Game` | Normal mod kayıt listesi (bkz. 5.3). |
| `Quick Battle` | Bugünkü akış AYNEN: `TeamSelectScene` (5+5, boyut 1-12) -> savaş. |

`?seed=` bugünkü gibi doğrudan savaş açar; `?campaign=1` doğrudan haritayı açar (geliştirme).

### 1.2 Sefer akışı
```
Main Menu -> New Campaign -> Normal / Ironman -> "Choose your hero" (1 tutorial karakteri)
  -> Map: Mill Road (1) savaş -> Ravenwood (2): ikinci karakter katılır, savaş
  -> Ruined Watchtower (3) elit savaş -> ilk seçim açılır
  -> Ashford Village (4): tutorial biter, tutorial takımı veda eder, 3 kişilik yeni takım kurulur (ilk seçilen = lider) -> rota seçimi
  -> ... Valdren Keep (7): şehirden ayrılırken 4. karakter katılır
  -> ... Valdren Keep (7, birleşme + seçim) -> ... King's Bridge (9, birleşme, boss)
  -> Ashen Plain (10, seçim) -> ... Castle Morvane (12, birleşme, final boss) -> "Valdoria Conquered"
```
Giriş metni (New Campaign, İngilizce): *"The Ash Curse spreading from Castle Morvane in the north swallows a little more of Valdoria each day. Your journey begins on Mill Road, on the western coast, and ends at Morvane's gate. Each stop is an encounter. You may only take one of the roads leading on from where you stand, and there is no turning back."* (Referanstaki "dört kişilik grup" metni dinamik takıma göre değiştirildi.)

- **Savaş:** `BattleScene` sefer bağlamıyla açılır (aktif takım + taşınan canlar + düğümün düşman takımı + düğüm seed'i + bölge arka planı). Savaş kuralları değişmez.
- **Zafer:** sonuç ekranında `Continue` -> otomatik kayıt -> harita.
- **Yenilgi:** sonuç ekranında `Load Last Save` (iki modda da; bkz. 5). Normal modda ayrıca `Load Game` (listeden daha eski kayıt) ve `Main Menu`.
- **Ayarlar (sefer bağlamı):** `New Game` / `Team Select` yerine `Main Menu`. Savaş ortasında çıkılırsa ilerleme son kayıttadır.
- **Harita bitişi:** 12'deki boss yenilince "Valdoria Conquered" ekranı -> şimdilik "Campaign Complete" (Ömer: sonraki harita şimdilik yok; veri modeli `campaign.json > maps` listesiyle hazır kalır).

---

## 2. İlerleme kavramları (referans: progression-concepts)

| Kavram (English legend) | Kural |
|---|---|
| **Single path** | Durağın tek çıkışı varsa sıradaki yer bellidir. Hikâye anlarında, öğretici bölümde ve boss öncesi gerilimde kullanılır (1-2-3-4, 9-10). |
| **Choice point** | Altın halkalı durak; 2-3 yol çıkar (4, 7, 10). Durak bitince oyuncu rotasını seçer; **seçilen yol kilitlenir, diğerleri o sefer için kapanır**. Her rota farklı risk/ödül sunar. Geri dönüş yok. |
| **Merge point** | Ayrılan yollar **Valdren Keep (7), King's Bridge (9) ve Castle Morvane (12)**'de yeniden birleşir. Hikâye tek çizgide kalır; takımın gücü her bölüm sonunda tahmin edilebilir aralıkta olur (denge kolaylaşır). Rozet: küçük birleşen ok işareti (`>>`). |
| **Fog & visibility** | Takım bulunduğu yerden sonraki **iki durağı türüyle birlikte** görür; ötesi sisle örtülüdür. "Battle or treasure?" kararı bilgiyle verilir ama sürpriz korunur. |

### 2.1 Sis kuralı (ayrıntı)
- Mesafe = mevcut düğümden kenar sayısı. **d = 1:** ad, alt başlık, tür ve (savaşsa) düşman önizlemesi. **d = 2:** yalnızca tür rozeti + ad (düşman listesi yok). **d >= 3:** sis: rozet ve etiket gizli, yollar sisin içine solar.
- Geçilmiş düğümler ve yollar açık kalır; kapanmış (seçilmeyen) dallar sis altına geri döner ve soluk çizgiyle kalır.
- Bölge başlıkları ve arazi her zaman görünür. **Castle Morvane (12)** baştan "hedef" olarak sis altında adı ve silüetiyle görünür, yolu sisli (Ömer onayı v3).
- Görünürlük mesafesi veride: `valdoria.json > visibility: 2` (ileride eşya/olay ile artabilir: ör. "Scout's Map").
- Görsel: sis, haritanın üstünde yumuşak, yavaş kayan bulut katmanı (kodla, alfa maskesi); takım ilerledikçe önündeki sis 0,6 sn'de açılır.

### 2.2 Savaşsız akış kuralı (Ömer: "savaşsız akış kalmayacak")
- **K1:** Bir seçim noktası ile birleşme noktası arasındaki **her dalda en az bir savaş** vardır.
- **K2:** Hiçbir rotada **ikiden fazla savaşsız durak art arda** gelmez. Kasaba/şehir de savaşsız durak sayılır.
- "Guarded treasure" (korunan hazine) savaş sayılır: önce savaş, kazanınca sandık.
- Test: 12 rotanın hepsi K1 ve K2'yi sağlar (graf doğrulama testi).

---

## 3. Valdoria haritası: veri modeli

### 3.1 Düğümler (v2; konumlar v4)
Konum: **yazısız arka planın** (`assets/campaign/valdoria-bg.webp`, 1672x941) oranı (x/1672, y/941), rozet merkezi. **Değişenler kalın.**

**v4 konum ölçümü:** Arka plan referans haritanın yazısız yeniden çizimi ama aynı ölçekte değil. Su/orman/kar maskeleriyle hizalama yapıldı: referans pikseli ≈ (1,20 x arka plan x − 4, 1,27 x arka plan y − 6). Yani arka plan yatayda referansın tamamını kapsıyor; dikeyde biraz basılmış ve referansın en alttaki ~60 pikseli (bölge başlıklarının olduğu şerit) dışarıda kalmış. Bütün düğümler bu dönüşümle taşındı (y değerleri ~0,03-0,04 aşağı kaydı). Üst üste çizimle kontrol edildi: kıyı, orman, nehir, bataklık ve dağlar referansla örtüşüyor. Tek elle düzeltme: **10 Ashen Plain** tam nehrin üstüne düşüyordu, nehrin doğu kıyısına alındı (0,873/0,495 -> 0,886/0,505). İnce ayar ileride debug "Edit node positions" aracıyla yapılır.

**Arazi kontrolü:**
| Düğüm | Arka planda nerede | Uygun mu |
|---|---|---|
| 1 Mill Road | kıyıdaki tarla yaması | evet (değirmen, tarla) |
| 2 Ravenwood | büyük batı ormanının içi | evet |
| 3 Ruined Watchtower | orman kuzey kenarı, tepelerin eteği | evet |
| 4 Ashford Village | ormanın doğusundaki tarlaların kenarı | evet |
| 5A Dwarven Mine | **bataklık gölcüklerinin kenarı, nehir yanı** | **hayır** (maden dağda olmalı) |
| 5B Iron Pass | iki karlı tepe arasındaki geçit eteği | evet |
| 6A Witch's Hut | bataklığın güney kenarı | evet (cadı + bataklık) |
| 6B Misty Marsh | **dağ eteği, kuru çayır** | **hayır** (bataklık yok) |
| 7 Valdren Keep | nehir kenarı, tarlaların ortası | evet |
| 8A St. Brann's Abbey | doğu ormanının güneyi, tepelerin eteği | evet |
| 8B Mercenary Camp | nehrin güneyindeki tarlalar | evet |
| 8C Black Cathedral | güneydoğu ormanının kuzey kenarı | evet |
| 9 King's Bridge | tam nehrin üstü | evet (köprü) |
| 10 Ashen Plain | nehrin doğu kıyısı, açık çayır | evet; ama arka planda kül rengi ova yok: kodla gri-kül ton katmanı önerilir |
| 11A Dragon's Spine | karlı dağların güney yamacı | evet |
| 11B Siege Line | dağ eteğinde açık arazi | evet |
| 12 Castle Morvane | yüksek karlı zirveler | evet |

**Arazi uyuşmazlığı (Mine/Marsh):** Referansta Misty Marsh bataklığın, Dwarven Mine dağ eteğinin yanındaydı. Ömer'in istediği yer değiştirme bu ikisini ters araziye koyuyor (maden bataklıkta, bataklık dağ eteğinde). Belgede Ömer'in kararı korunuyor; çözüm önerisi 10. bölüm soru 1'de.

| No | Türkçe (referans) | **English name** | Type | **English subtitle** | Battle? | Region | x | y |
|---|---|---|---|---|---|---|---|---|
| 1 | Değirmen Yolu | **Mill Road** | battle (start) | Start · Battle | evet | I | 0.146 | 0.846 |
| 2 | Kuzgun Ormanı | **Ravenwood** | battle | Battle · Outlaw Pack | evet | I | 0.276 | 0.727 |
| 3 | Yıkık Gözcü Kulesi | **Ruined Watchtower** | elite | Elite · Bandit Chief | evet | I | 0.339 | 0.591 |
| 4 | Ashford Köyü | **Ashford Village** | town | Town · Rest, Recruits | hayır | I | 0.414 | 0.643 |
| **5A** | **Cüce Madeni** (eski 6B) | **Dwarven Mine** | **treasure (guarded)** | **Treasure · Guarded** | **evet** | II | 0.494 | 0.805 |
| 5B | Demir Geçit | **Iron Pass** | battle | Battle · Ambush | evet | II | 0.452 | 0.497 |
| 6A | Cadı Kulübesi | **Witch's Hut** | event | Event · Cursed Merchant | hayır | II | 0.565 | 0.856 |
| **6B** | **Sisli Bataklık** (eski 5A) | **Misty Marsh** | event | Event | hayır | II | 0.542 | 0.497 |
| 7 | Valdren Kalesi | **Valdren Keep** | town (city) | City · Rest, Recruits | hayır | II | 0.625 | 0.635 |
| **8A** | Aziz Brann Manastırı | **St. Brann's Abbey** | **treasure (guarded)** | **Treasure · Relic Vault** | **evet** | II | 0.706 | 0.455 |
| 8B | Paralı Asker Kampı | **Mercenary Camp** | battle | Battle · Gold | evet | II | 0.725 | 0.696 |
| 8C | Kara Katedral | **Black Cathedral** | elite | Elite · The Undying | evet | II | 0.719 | 0.815 |
| 9 | Kral Köprüsü | **King's Bridge** | boss | Boss · The Bridge Warden | evet | II | 0.810 | 0.591 |
| 10 | Kül Ovası | **Ashen Plain** | battle | Battle · Cursed Ground | evet | III | 0.886 | 0.505 |
| 11A | Ejder Sırtı | **Dragon's Spine** | elite | Elite · Hidden Entrance | evet | III | 0.836 | 0.318 |
| 11B | Kuşatma Hattı | **Siege Line** | battle | Battle | evet | III | 0.950 | 0.443 |
| 12 | Morvane Kalesi | **Castle Morvane** | boss (final) | Final Boss | evet | III | 0.924 | 0.170 |

Değişikliklerin gerekçesi:
- **Yer değiştirme:** Dwarven Mine alt dala (5A konumu), Misty Marsh üst dala (6B konumu) geçti. Düğüm kimlikleri konuma bağlı kaldı (5A/6B), bağlantılar aynı.
- **Dwarven Mine = "Treasure · Guarded":** değişiklikten sonra alt dal (Mine + Witch's Hut) tamamen savaşsız kalıyordu (K1 ihlali; 4 kasaba + 5A + 6A + 7 şehir = 4 savaşsız durak art arda, K2 ihlali). Madeni koruyanlarla savaş, sonra sandık. Witch's Hut olay olarak kaldı (dalın tek "hikâye" durağı).
- **St. Brann's Abbey = "Treasure · Relic Vault" (guarded):** Ömer'in isteğiyle hazine oldu. Saf hazine olsaydı 6A/6B (olay) -> 7 (şehir) -> 8A (hazine) = 3 savaşsız durak art arda olurdu (K2 ihlali, iki dalda da). Bu yüzden kutsal emanet mahzenini koruyan bekçilerle savaş + sandık. Manastırın savaşı 8C elitten hafif tutulur: "düşük risk, emanet ödülü" rotası.
- Kasabaların alt başlığında "Merchant" yerine **"Recruits"**: takım burada büyür (bkz. 4); tüccar ileride eklenince "Rest, Recruits, Merchant" olur.

Bölgeler:
| Region | **English title** | **English tagline** | Düğümler |
|---|---|---|---|
| I · Sınır Toprakları | **I · The Borderlands** | *Begins at Mill Road, splits at Ashford* | 1, 2, 3, 4 |
| II · Valdren Vadisi | **II · Valdren Vale** | *Three roads, one bridge* | 5A, 5B, 6A, 6B, 7, 8A, 8B, 8C, 9 |
| III · Kuzey Yükseklikleri | **III · The Northern Heights** | *From the Ashen Plain to Morvane's gate* | 10, 11A, 11B, 12 |

Diğer İngilizce metinler: **VALDORIA** / **Campaign Map** / *From Mill Road to Castle Morvane: 17 stops, 3 choice points, 12 stops per run.* Lejant: **Legend**, **Town / City**, **Battle**, **Elite**, **Treasure**, **Guarded Treasure**, **Event**, **Boss**, **Single path** (*the only next stop*), **Branching route**, **Choice point**, **Merge point**, **Fog** (*unexplored*). Rozetler: **START**, **CHOICE · 2 ROADS**, **CHOICE · 3 ROADS**, **ROADS MEET**. Pusula **N**. Durumlar: *Cleared*, *You are here*, *Road closed*. (Lejanttan "Rest" türü kalktı: haritada artık ayrı dinlenme düğümü yok; iyileşme kasabalarda.)

### 3.2 Bağlantılar (değişmedi)
| From | To | Style | | From | To | Style |
|---|---|---|---|---|---|---|
| 1 | 2 | solid | | 7 | 8A | dashed |
| 2 | 3 | solid | | 7 | 8B | dashed |
| 3 | 4 | solid | | 7 | 8C | dashed |
| 4 | 5A | dashed | | 8A | 9 | dashed |
| 4 | 5B | dashed | | 8B | 9 | dashed |
| 5A | 6A | dashed | | 8C | 9 | dashed |
| 5B | 6B | dashed | | 9 | 10 | solid |
| 6A | 7 | dashed | | 10 | 11A | dashed |
| 6B | 7 | dashed | | 10 | 11B | dashed |
| | | | | 11A | 12 | dashed |
| | | | | 11B | 12 | dashed |

Seçim noktaları (çıkış > 1): 4, 7, 10. Birleşme noktaları (giriş > 1): 7, 9, 12. Dallar arası çapraz geçiş yok.

### 3.3 Rota tablosu (12 rota, v2)
Her rota: 1, 2, 3, 4, 5x, 6x, 7, 8x, 9, 10, 11x, 12 = **12 durak** (2 x 3 x 2 = 12 rota). Sabit savaşlar: 1, 2, 3 (elit), 9 (boss), 10, 12 (final boss) = 6. Her dalda tam bir savaş: alt dal 5A (guarded), üst dal 5B; 8A (guarded) / 8B / 8C (elit); 11A (elit) / 11B.

| # | Rota | Savaş | Elit | Savaşsız duraklar | En uzun savaşsız seri |
|---|---|---|---|---|---|
| 1 | 5A-6A · 8A · 11A | 9 | 2 (3, 11A) | 4, 6A, 7 | 2 (6A-7) |
| 2 | 5A-6A · 8A · 11B | 9 | 1 | 4, 6A, 7 | 2 |
| 3 | 5A-6A · 8B · 11A | 9 | 2 | 4, 6A, 7 | 2 |
| 4 | 5A-6A · 8B · 11B | 9 | 1 | 4, 6A, 7 | 2 |
| 5 | 5A-6A · 8C · 11A | 9 | 3 | 4, 6A, 7 | 2 |
| 6 | 5A-6A · 8C · 11B | 9 | 2 | 4, 6A, 7 | 2 |
| 7 | 5B-6B · 8A · 11A | 9 | 2 | 4, 6B, 7 | 2 (6B-7) |
| 8 | 5B-6B · 8A · 11B | 9 | 1 | 4, 6B, 7 | 2 |
| 9 | 5B-6B · 8B · 11A | 9 | 2 | 4, 6B, 7 | 2 |
| 10 | 5B-6B · 8B · 11B | 9 | 1 | 4, 6B, 7 | 2 |
| 11 | 5B-6B · 8C · 11A | 9 | 3 | 4, 6B, 7 | 2 |
| 12 | 5B-6B · 8C · 11B | 9 | 2 | 4, 6B, 7 | 2 |

Sonuç: **her rotada 9 savaş** (v1'de 7-9 arasıydı), 3 savaşsız durak, en fazla 2 savaşsız durak art arda: K1 ve K2 sağlanıyor. Rotaları ayıran şey artık savaş sayısı değil **risk/ödül**: elit sayısı 1-3, hazine sayısı 0-2 (5A ve 8A korunan hazine).

### 3.4 Taslak JSON (`data/campaign/valdoria.json`)
```json
{
  "id": "valdoria",
  "title": "Valdoria",
  "subtitle": "Campaign Map",
  "blurb": "From Mill Road to Castle Morvane: 17 stops, 3 choice points, 12 stops per run.",
  "background": "assets/campaign/valdoria-bg.webp",
  "start": "1",
  "stopsPerRun": 12,
  "visibility": 2,
  "alwaysVisible": ["12"],
  "regions": [
    { "id": "I",   "title": "I · The Borderlands",       "tagline": "Begins at Mill Road, splits at Ashford", "label": [0.092, 0.967], "battleBackground": "border-road" },
    { "id": "II",  "title": "II · Valdren Vale",          "tagline": "Three roads, one bridge",                "label": [0.510, 0.967], "battleBackground": "valley-field" },
    { "id": "III", "title": "III · The Northern Heights", "tagline": "From the Ashen Plain to Morvane's gate", "label": [0.640, 0.057], "battleBackground": "ashen-heights" }
  ],
  "nodes": [
    { "id": "1",   "type": "battle",   "name": "Mill Road",         "subtitle": "Start · Battle",           "region": "I",   "pos": [0.146, 0.846], "encounter": "mill_road_thugs", "start": true, "teaches": "turn_order", "partyCap": 1 },
    { "id": "2",   "type": "battle",   "name": "Ravenwood",         "subtitle": "Battle · Outlaw Pack",     "region": "I",   "pos": [0.276, 0.727], "encounter": "ravenwood_pack", "recruit": { "offer": 3, "pick": 1, "when": "before" }, "teaches": "area_attacks", "partyCap": 2 },
    { "id": "3",   "type": "elite",    "name": "Ruined Watchtower", "subtitle": "Elite · Bandit Chief",     "region": "I",   "pos": [0.339, 0.591], "encounter": "watchtower_chief", "teaches": "elites_and_choices" },
    { "id": "4",   "type": "town",     "name": "Ashford Village",   "subtitle": "Town · Rest, Recruits",    "region": "I",   "pos": [0.414, 0.643], "heal": 1.0, "endsTutorial": true, "newCompany": { "size": 3, "leader": "firstPick" }, "partyCap": 3 },
    { "id": "5A",  "type": "treasure", "name": "Dwarven Mine",      "subtitle": "Treasure · Guarded",       "region": "II",  "pos": [0.494, 0.805], "encounter": "mine_wardens", "treasure": "dwarven_mine" },
    { "id": "5B",  "type": "battle",   "name": "Iron Pass",         "subtitle": "Battle · Ambush",          "region": "II",  "pos": [0.452, 0.497], "encounter": "iron_pass_ambush" },
    { "id": "6A",  "type": "event",    "name": "Witch's Hut",       "subtitle": "Event · Cursed Merchant",  "region": "II",  "pos": [0.565, 0.856], "event": "witchs_hut" },
    { "id": "6B",  "type": "event",    "name": "Misty Marsh",       "subtitle": "Event",                    "region": "II",  "pos": [0.542, 0.497], "event": "misty_marsh" },
    { "id": "7",   "type": "town",     "name": "Valdren Keep",      "subtitle": "City · Rest, Recruits",    "region": "II",  "pos": [0.625, 0.635], "city": true, "heal": 1.0, "recruit": { "offer": 3, "pick": 1, "when": "leave" }, "partyCap": 4 },
    { "id": "8A",  "type": "treasure", "name": "St. Brann's Abbey", "subtitle": "Treasure · Relic Vault",   "region": "II",  "pos": [0.706, 0.455], "encounter": "vault_keepers", "treasure": "relic_vault" },
    { "id": "8B",  "type": "battle",   "name": "Mercenary Camp",    "subtitle": "Battle · Gold",            "region": "II",  "pos": [0.725, 0.696], "encounter": "mercenary_camp" },
    { "id": "8C",  "type": "elite",    "name": "Black Cathedral",   "subtitle": "Elite · The Undying",      "region": "II",  "pos": [0.719, 0.815], "encounter": "black_cathedral" },
    { "id": "9",   "type": "boss",     "name": "King's Bridge",     "subtitle": "Boss · The Bridge Warden", "region": "II",  "pos": [0.810, 0.591], "encounter": "bridge_warden" },
    { "id": "10",  "type": "battle",   "name": "Ashen Plain",       "subtitle": "Battle · Cursed Ground",   "region": "III", "pos": [0.886, 0.505], "encounter": "ashen_plain" },
    { "id": "11A", "type": "elite",    "name": "Dragon's Spine",    "subtitle": "Elite · Hidden Entrance",  "region": "III", "pos": [0.836, 0.318], "encounter": "dragons_spine" },
    { "id": "11B", "type": "battle",   "name": "Siege Line",        "subtitle": "Battle",                   "region": "III", "pos": [0.950, 0.443], "encounter": "siege_line" },
    { "id": "12",  "type": "boss",     "name": "Castle Morvane",    "subtitle": "Final Boss",               "region": "III", "pos": [0.924, 0.170], "encounter": "lord_morvane", "final": true }
  ],
  "edges": [
    { "from": "1",  "to": "2",   "style": "solid" },
    { "from": "2",  "to": "3",   "style": "solid" },
    { "from": "3",  "to": "4",   "style": "solid" },
    { "from": "4",  "to": "5A",  "style": "dashed" },
    { "from": "4",  "to": "5B",  "style": "dashed" },
    { "from": "5A", "to": "6A",  "style": "dashed" },
    { "from": "5B", "to": "6B",  "style": "dashed" },
    { "from": "6A", "to": "7",   "style": "dashed" },
    { "from": "6B", "to": "7",   "style": "dashed" },
    { "from": "7",  "to": "8A",  "style": "dashed" },
    { "from": "7",  "to": "8B",  "style": "dashed" },
    { "from": "7",  "to": "8C",  "style": "dashed" },
    { "from": "8A", "to": "9",   "style": "dashed" },
    { "from": "8B", "to": "9",   "style": "dashed" },
    { "from": "8C", "to": "9",   "style": "dashed" },
    { "from": "9",  "to": "10",  "style": "solid" },
    { "from": "10", "to": "11A", "style": "dashed" },
    { "from": "10", "to": "11B", "style": "dashed" },
    { "from": "11A","to": "12",  "style": "dashed" },
    { "from": "11B","to": "12",  "style": "dashed" }
  ]
}
```
- Bir düğüm "savaşlı"dır: `encounter` alanı varsa (battle/elite/boss ve guarded treasure). K1/K2 testleri buna bakar.
- Seçim ve birleşme noktası veride işaretlenmez, graftan çıkar (çıkış > 1 / giriş > 1); testler sayıları (3 ve 3) doğrular.
- Kenara isteğe bağlı `"path": [[x,y], ...]` ara noktaları; yoksa hafif kavisli eğri.
- `partyCap` düğümde verilir ve o düğümden itibaren geçerlidir (bir sonraki `partyCap`'e kadar): Mill Road 1, Ravenwood 2, Ashford 3, Valdren Keep 4 (ayrılırken; `recruit.when`: `before` = düğüme varınca savaştan önce, `leave` = düğümden çıkarken). 5. karakterin yeri açık (Ömer); geldiğinde ilgili düğüme `recruit` + `partyCap: 5` eklenir.
- `data/campaign/campaign.json` (provizyon): `{ "maps": ["valdoria"], "rules": { "carryHp": true, "victoryHeal": 0.2, "reviveRatio": 0.2, "bossVictoryHeal": 1.0, "maxSaves": { "normal": 5, "ironman": 1 } }, "starterPool": [11 sınıf], "companyPool": [11 sınıf], "recruitPool": [11 sınıf] }` (11 = rastgele havuzdaki oynanabilir sınıflar, Hexer dahil, Geometer hariç). `victoryHeal` ileride zorluk seviyesine göre değişebilir (`rules` zorluk başına ayrı blok olabilir).
- `data/campaign/encounters.json` (bkz. 4), ileride `events.json`, `treasures.json`.

### 3.5 Görselde bulunan tutarsızlıklar (v1'den, güncel)
1. Lejanttaki "Elit" ikonu haritadaki kuru kafa ikonuyla aynı değil: oyunda tek ikon (kuru kafa).
2. İki boss (9, 12) aynı taç: 12 `final` (büyük rozet + ateşli halka).
3. 5A/5B'nin bölgesi görselde belirsiz; Bölge II sayıldı.
4. ~~Rota dengesizliği ve arka arkaya iki dinlenme~~: v2'de çözüldü (3.1, 3.3).
5. "Tüccar" yazıları: oyunda para/eşya yok; kasabalarda şimdilik "Recruits".
6. Görsel 16:10, oyun 16:9 (arka plan 16:9 isteniyor).
7. 10'un seçim rozeti 9'a yakın: rozet kendi etiketine bitişik konacak.
8. Akış referansında Ashford 1. durak yazıyor (Ömer: dikkate alma; Ashford 4. durak).
9. (v4) Yazısız arka planda Mine/Marsh yer değişimi araziyle çelişiyor (3.1 sonu); arka planda kül rengi ova yok (Ashen Plain).

---

## 4. Takım: dinamik kadro, tutorial, lider

### 4.1 Tutorial (Bölge I: Mill Road -> Ashford Village)
Her durağın öğrettiği şey (borderlands-flow referansından, Ashford 4'e taşınmış hâli):

| Durak | Takım | Öğrettiği şey (oyun içi ipucu, İngilizce) |
|---|---|---|
| 1 Mill Road | 1 (tutorial kahramanı) | İlk savaş; **hıza dayalı sıra sistemi**. İpucu: *"Faster fighters act more often. Watch the turn bar at the top."* |
| 2 Ravenwood | 2 | Önce **ikinci karakter katılır** (3 adaydan 1). Kalabalık düşman; **alan saldırıları**. İpucu: *"Enemies packed together? Area attacks hit every one of them."* |
| 3 Ruined Watchtower | 2 | **Elit**: haydut reisi. **Yenilince ilk seçim açılır.** İpucu: *"Elites are tougher than common foes. Beat the chief to open the roads beyond Ashford."* |
| 4 Ashford Village | 2 -> 3 (yeni takım) | Tutorial biter: **tutorial takımı veda eder, 3 kişilik yeni takım kurulur** (bkz. 4.2), ilk rota seçimi + sis anlatımı. İpucu: *"You can see two stops ahead. Choose your road: the others will close."* (İleride: ilk ekipman.) |

- İpuçları tek seferlik, kapatılabilir parşömen kartı; `Settings > Tutorial tips` ile kapatılabilir.
- Tutorial atlanamaz (öneri); debug'dan atlanabilir.

### 4.2 İki takım: tutorial takımı ve asıl takım (Ömer kararı v3: "Ashford'da tutorial takımı gidecek")
**Tutorial takımı (Mill Road -> Ashford, 1-2 kişi):**
- **Başlangıç:** "Choose your hero": 11 oynanabilir sınıftan biri (Hexer dahil, Geometer hariç). Haritada bu bölümde önde o yürür.
- **Ravenwood (2):** 3 aday kart (seed'li çekiliş; adaylardan en az biri alan saldırılı sınıf, çünkü bu durak alan saldırılarını öğretir) -> 1 seç. Takım 2.
- Tutorial'da takım değiştirme yok (2 kişi, yedek yok).

**Ashford Village'da veda ve yeni takım:**
- Ashford'a varınca kısa bir veda kartı: tutorial karakterleri takımdan ayrılır (kadrodan tamamen çıkar).
- Ardından **"Form your company"** ekranı: **3 karakter**, **11 sınıfın tamamından serbestçe** seçilir (Ömer kararı v4; aday çekilişi yok). İleri not (Ömer): "sonra belki havuzu daraltırız" (ör. kilidi açılmış sınıflar ya da çekilmiş adaylar); veride `companyPool` alanı bunun için ayrı tutuluyor.
- **Lider = yeni takımda ilk seçilen karakter** (Ömer'in "tutorial sonrası ilk karakter = lider" kararı). Ekranda ilk seçilen kartın üstüne taç konur; oyuncu taçı başka bir karta taşıyarak lideri değiştirebilir, ama yalnızca bu ekranda. Sonra lider sabittir.
- **Tutorial sınıfları yeniden seçilebilir (Ömer kararı v4).** Listede normal dururlar ("Played in the tutorial" küçük etiketiyle); seçilirse yeni bir karakter olarak gelir (tam can, aynı sınıf).
- Yeni takım tam canla başlar (Ashford zaten tam iyileştirir).

**Sonraki katılımlar:**
- **Valdren Keep (7), şehirden ayrılırken (Ömer kararı v4):** oyuncu şehir panelinde `Leave` deyince (ya da rota seçip yola çıkarken) kısa bir sahne: *"A volunteer catches up with you at the city gate."* -> 3 aday kart (seed'li, kadroda olmayan sınıflardan) -> 1 seç. Takım 4; yeni karakter tam canla gelir ve 8A/8B/8C savaşına girer. Rota kartındaki önizleme (sis kuralı) buna göre 4 kişilik takımı varsayar.
- **5. karakter: AÇIK** (Ömer: şimdilik belli değil). Aday yerler: King's Bridge zaferi (Bölge III başlangıcı) ya da bir olay ödülü. Veride yer ayrıldı (`recruit` + `partyCap: 5`).
- İleride: olay/hazine ödülü olarak karakter (ör. Witch's Hut'ta "cursed" bir aday).
- Kadroda aynı sınıftan ikinci karakter yok (öneri; basitlik ve kimlik için).

**Hikâye gerekçesi (öneri, oyun içi metin İngilizce):** Tutorial kahramanı Ashford'a haber taşıyan bir sınır muhafızıdır; Ravenwood'da katılan da yol arkadaşıdır. Ashford'a varınca köyü korumak için geride kalırlar ve haberi seferi üstlenecek yeni bölüğe teslim ederler. Veda kartı: *"Your escort has brought word of the Ash Curse to Ashford. They stay behind to hold the village. A new company must carry the fight north."* Alternatif (daha karanlık, önerilmez): tutorial takımı Watchtower'da yaralanır ve Ashford'da iyileşmeye kalır.

### 4.3 Kadro ve aktif takım
- **Roster** (kazanılmış karakterler) + **aktif takım** (savaşa girenler, o andaki sınır kadar).
- Takım sınırı (provizyon, düğümdeki `partyCap`): **Mill Road 1 -> Ravenwood 2 (tutorial) -> Ashford 3 (yeni takım) -> Valdren Keep'ten çıkarken 4 -> 5: açık.** Motor 12'ye kadar destekliyor; 5 bugünkü dengenin ölçüldüğü boyut.
- Bu katılım düzeninde kadro sınırı aşmıyor (her katılım sınırı da bir artırıyor), yani şimdilik **yedek yok**: Party ekranı yalnızca dizilimi değiştirir. Yedek (bench) mekaniği ileride kadro sınırı aştığında (olay ödülü karakterler vb.) devreye girer: fazlası savaşa girmez, canı değişmez.
- **Party ekranı** (haritada `Party` düğmesi, savaş dışında her an): roster kartları (avatar, sınıf, can çubuğu) + 4x3 dizilim ızgarası (bugünkü takım seçimiyle aynı hücre dili, sürükle-bırak). Lider tacı gösterilir.
- Takım değiştirme her savaş arasında serbest (Ömer kararı); kasabada olmak gerekmez.

### 4.4 Lider ve yürüyen kafile
- Tutorial'da önde tutorial kahramanı yürür; Ashford'dan itibaren **yeni takımın lideri** (4.2). Lider değiştirilemez (Ashford'daki "Form your company" ekranı hariç) ve her zaman aktif takımdadır (yedeğe alınamaz).
- Haritada önde liderin `idle` sprite'ı (~110 px), arkasında aktif takımın diğer üyeleri **silüet** olarak (koyu kahve-siyah ton, %55 opak, %85 boy), yol boyunca ~55 px aralıkla sıralı kafile; her biri hafif farklı fazda sallanır. Yedekler kafilede görünmez.
- Yürüme: yol eğrisi boyunca ~320 px/sn, adım sallanması (4 px, ~6 Hz), yöne göre yatay çevirme, ayak altında toz, adım sesi; dokununca atlanır. Gerçek `walk` animasyonu ileride (content-designer).

---

## 5. Sefer durumu, kayıt, seed

### 5.1 Can taşıma (Ömer: taşınır)
- Her karakterin can oranı (0-1) savaştan savaşa taşınır. MP her savaşta dolu başlar (öneri). Rage, cooldown, statü, çağrılar taşınmaz.
- Savaşta düşen karakter: zaferden sonra can maks'ının **%20**'siyle kalkar (provizyon `reviveRatio`).
- **Zafer sonrası toparlanma (Ömer kararı v3):** her zaferden sonra hayatta kalanlar can maks'ının **%20**'sini geri alır (`victoryHeal 0.2`). İleride zorluk seviyesi gelirse bu oran zorluğa göre değişebilir (ör. Story %35, Standard %20, Hard %10: yalnızca not, karar değil).
- **Büyük boss zaferi** (`type: boss`: King's Bridge; Castle Morvane haritayı bitirir): **tam iyileşme** (Ömer kararı v3, `bossVictoryHeal 1.0`). Elitlerden sonra tam iyileşme yok.
- Kasaba (4, 7): tam iyileşme.
- **İleri iş (Ömer):** eşyalar / skill ağacıyla savaş öncesi iyileşme (iksir, kamp, "Field Medic" yeteneği). Şimdi değil.
- Motor "eksik canla başla" desteği gerekir (engine-dev). Destek gelene kadar ilk sürümde her savaş tam canla başlar, can taşıma bayrağı kapalı.

### 5.2 Kayıt modları (Ömer kararı)
| | **Normal** | **Ironman** |
|---|---|---|
| Ne zaman kaydedilir | Her savaştan (zaferden) sonra otomatik; ayrıca sefer başında; haritada elle `Save` | **Yalnızca** savaştan (zaferden) sonra otomatik; elle kayıt yok |
| Kaç kayıt | En fazla **5**; yeni kayıt gelince **en eskisi silinir** (otomatik ve elle aynı listede) | **1**; her kayıt öncekinin **üstüne yazar** |
| Yenilgide | **Bir önceki kayıttan yüklenir** (en yeni kayıt) ya da `Load Game` ile listeden daha eskisi | **Bir önceki (tek) kayıttan yüklenir**; seçim yok |
| Savaş ortasında çıkış | Son kayıttan devam | Son kayıttan devam |
| Savaş dışı ilerleme (rota seçimi, olay, hazine, kasaba) | Elle kaydedilebilir; yoksa sonraki savaş sonrası kayda girer | Bir sonraki savaş sonrasına kadar kaydedilmez; çıkılırsa yeniden yapılır (sonuçlar seed'li olduğu için aynı çıkar) |

- Ironman'ı Normal'den ayıran: tek kayıt + elle kayıt yok + daha eski kayda dönme yok. Yenilgide Ironman da tek kayda döner, sefer bitmez (Ömer onayı v3).
- **"Retreat to last town" YOK** (Ömer kararı v3). Düşük canla alınmış bir kayıttan zor bir savaşa dönülme riski şunlarla hafifler: her zaferde %20 toparlanma, boss sonrası tam iyileşme, kayıt yalnızca ZAFERDEN sonra alındığı için kayıttaki takım her zaman son savaşı kazanmış bir takım; Normal modda ayrıca daha eski kayda dönülebilir. Ironman'da bu risk modun doğası olarak kabul edilir.
- **Load Game ekranı** (Main Menu ve harita menüsü): kayıt kartları listesi, en yeni üstte. Her kartta: mod (Normal/Ironman rozeti), harita ve durak ("Valdoria · Stop 7/12 · Valdren Keep"), bölge, aktif takımın avatarları + can çubukları, savaş sayısı, tarih-saat, "Auto" / "Manual" etiketi. Düğmeler: `Load`, `Delete` (onaylı). Ironman kaydı tek kart, `Delete` = seferi sil.
- Haritada `Save` (yalnızca Normal) -> "Game saved (3/5)". 5 doluysa: "Oldest save will be replaced" uyarısı.

### 5.3 Kayıt şeması (`localStorage`, sürümlü, try/catch)
Anahtar `protomedi.campaign.v1` (tek JSON: `{ version, saves: [...] }`), her kayıt:
```json
{
  "id": "s-482113907-9",
  "kind": "auto",
  "savedAt": "2026-10-07T21:14:00Z",
  "mode": "normal",
  "mapId": "valdoria",
  "seed": 482113907,
  "roster": [
    { "id": "c1", "class": "warrior", "hpRatio": 0.62, "alive": true, "leader": true },
    { "id": "c2", "class": "druid",   "hpRatio": 1.0,  "alive": true }
  ],
  "active": ["c1", "", "", "", "c2", "", "", "", "", "", "", ""],
  "at": "7",
  "path": ["1","2","3","4","5B","6B","7"],
  "resolved": { "6B": "fog_lifted", "2": "recruit:druid" },
  "stats": { "victories": 6, "defeats": 2 }
}
```
- Bozuk/eski kayıt sessizce yok sayılır (Main Menu'de kısa not), oyun çökmez. Sürüm yükselince `migrate`.
- Seçilen rotalar `path`'ten çıkar; kapanan dallar ondan türetilir.

### 5.4 Seed
- Sefer başında `seed = newSeed()`. Düğüm savaş seed'i = `hash(seed, mapId, nodeId, attempt)`; aday çekilişleri ve olay sonuçları da aynı türetimle (Math.random yok). `attempt` yenilgide artan yerel bir sayaçtır (kayda yazılmaz): aynı savaş birebir tekrar etmez (kritik/iska zarları değişir), ama düşman takımı ve dizilim veriden geldiği için aynıdır.
- Debug Data sekmesinde sefer ve düğüm seed'i görünür.

---

## 6. Harita ekranı (`CampaignMapScene`)

### 6.1 Arka plan (Ömer: yazısız, etiketsiz, yüksek çözünürlük, 16:9)
- Düğümler, rotalar (düz/kesik), etiket plakaları, bölge başlıkları, lejant, kartuş, sis **kodla** çizilir: tüm yazılar İngilizce ve değiştirilebilir.
- **Patika izleri (öneri):** resimde patika OLMASIN; kod, her rotanın altına hafif, boyalı görünümlü bir toprak-patika dokusu (yumuşak kahverengi, düzensiz kenar, %35 opak) çizer, üstüne çizgi stilini koyar. Gerekçe: AI'nin çizdiği patikalar düğüm konumlarıyla hiçbir zaman tam örtüşmez; kodla çizilen iz her zaman hizalıdır ve sis/kapanan dallarla birlikte solabilir. (İstenirse prompt'taki "no roads" satırı "faint worn trails" ile değiştirilebilir, ama önerilmez.)
- **Geldi (v4):** `assets/campaign/valdoria-bg.webp`, **1672x941** (oran 1,777 = 16:9), RGB, yazısız. Kaynağı `assets/CREDITS.md`'ye yazılmalı (ChatGPT üretimi).
- **Çözünürlük düşük:** 1920x1080 ekranda ~1,15 kat büyütülerek gösterilir (yumuşak/LINEAR filtre; piksel art değil, kabul edilebilir). Ama haritada 2x'e kadar zoom planlandığı için yakınlaşınca bulanıklaşır. **Öneri:** bir yapay zeka büyütücüyle (Upscayl / Real-ESRGAN, ücretsiz) 4 kat büyütüp 3840x2160'a indirmek; oran aynı kaldığı için düğüm konumları (oran) değişmez. O zamana kadar en fazla zoom 1,5x.
- Kodla çizilen parşömen yer tutucu artık gerekmiyor; yalnızca dosya yüklenemezse (eksik asset) devreye girer.
- Arka planda kül rengi bir ova yok: Ashen Plain (10) çevresine kodla yumuşak gri-kül ton katmanı (ve Bölge III'e hafif soğuk ton) önerilir.

**ChatGPT prompt'u (referans görseli `valdoria-map-reference.webp` ekleyerek kullanılır):**
```
Using the attached map as the exact reference, repaint the SAME map: the same geography, the same coastline, forests, mountain ranges, river, lakes, marsh and farmland, in the same places and proportions, in the same painted topographic style with soft hillshade relief and the same muted colour palette (olive-green lowlands, dark green forests, snow-capped grey mountains across the top, deep blue sea along the left edge, patchwork of small irregular farm fields).

Remove EVERYTHING that is not terrain: no text, no letters, no numbers, no titles, no labels, no name plates, no region names, no round node badges or icons, no roads, no paths, no dashed or solid lines, no route markers, no frames or borders, no title box, no legend box, no compass rose, no buildings drawn as symbols. Where those elements covered the land, fill in natural terrain that continues seamlessly from the surroundings (grass, forest, fields, hills, water).

Output: the widest landscape image you can make, ideally 16:9 at the highest resolution available. If 16:9 is not available, use the widest landscape format and keep all important geography inside the central 16:9 band, so the top and bottom strips can be cropped without losing anything. Edge to edge painting, no margins, no vignette text, no watermark. Clean, high-detail terrain only, ready for game markers to be placed on top.
```

### 6.2 Öğeler
- **Kartuş (sol üst):** **VALDORIA** / *Campaign Map* / blurb + **Stop 7 / 12**; Ironman ise küçük demir maske rozeti **IRONMAN**.
- **Bölge başlıkları:** geniş harf aralıklı serif, italik tagline; yeni bölgeye girişte ortada 2 sn'lik başlık bandı.
- **Rotalar:** patika dokusu + düz (krem, 6 px) / kesik (altın, 18/12 px) çizgi. Geçilen yol parlak; kapanan dallar soluk ve sis altında ("Road closed"); gidilebilecek yolda akan kesik animasyonu.
- **Düğüm rozetleri:** 76 px daire, tür rengi (Town mavi `#3b5f86`, Battle kahve `#6b4a33`, Elite kırmızı `#8e2a22`, Event mor `#4a3f8f`, Treasure altın `#9a7a2a`, Boss koyu kırmızı `#a3191c`), altın kenar, piksel art ikon (çapraz kılıç, kuru kafa, taç, kale kapısı, soru işareti, sandık). **Guarded Treasure:** sandık ikonu + sağ altta küçük çapraz kılıç. Numara rozeti sağ üstte. Seçim noktası: kalın altın halka + "CHOICE · N ROADS"; birleşme noktası: rozetin solunda küçük `>>` işareti + "ROADS MEET" (yalnızca lejantta ve üstüne gelince). Final boss %20 büyük.
- **Sis:** d >= 3 düğümler bulut katmanı altında; d = 2 düğümde rozet var ama düşman önizlemesi yok.
- **Etiket plakası:** parşömen, ad BÜYÜK serif, alt başlık italik.
- **Durumlar:** `cleared` (soluk + altın onay mührü), `current` (parlayan halka + kafile), `available` (nabız), `closed` (kapanan dal, soluk), `fogged`.
- **Takım şeridi (üst orta):** aktif takım avatarları + can çubukları; `Party` düğmesi (yedek sayısı rozeti).
- **Lejant (sağ alt):** katlanabilir.
- **Alt düğmeler:** eylem düğmesi (`March to Ravenwood`, `Enter Battle`, `Choose your road`), `Save` (Normal), `Menu`.

### 6.3 Seçim noktasında rota seçimi
Seçim düğümündeyken gidilebilir düğümler nabız atar. Dokununca rota kartı: ad, tür, alt başlık, d = 1 olduğu için savaşsa "Enemies: 4 · Cutthroat, Cutthroat, Archer, Archer" (sınıf ikonlarıyla); kartın altında o dalın ikinci durağının türü (d = 2). `Take this road` -> onay "The other roads will close for this journey." -> seçilmeyen dallar kapanır ve sis altına döner.

### 6.4 Düğüm türleri ne yapar (MVP)
| Type | MVP | Sonra |
|---|---|---|
| Battle / Elite | Savaş (düşman takımı veriden) | Altın/XP ödülü |
| Boss | Savaş (lider+eskort ya da tek dev; bkz. 7.1) | Faz değişimi, özel müzik |
| Guarded Treasure | Savaş, zaferde sandık ekranı: **yer tutucu** ödül ("Recovered: Dwarven ore (rewards coming soon)") | Eşya/altın |
| Town / City | Panel: `Rest` (tam iyileşme), `Recruit` (aday kartları), `Party`, `Leave`; Merchant devre dışı | Tüccar, ekipman |
| Event | **Yer tutucu**: kısa İngilizce metin + `Continue`, mekanik etki yok | Veriden 2-3 seçenekli olay (can, aday, küçük savaş) |

### 6.5 Kamera ve mobil
- Masaüstü: tüm harita 1920x1080'e sığar; tekerlek / iki parmakla 1x-2x zoom, sürükleyerek kaydırma; yürürken kamera lideri izler.
- Dar ekran (`html.compact` / `html.short`): varsayılan zoom 1.6, kamera lidere kilitli; lejant ve kartuş katlanır.
- Rozet tıklama alanı en az 110 px çap (telefonda ~48 gerçek px). Klavye: oklarla gidilebilir düğümler arası, Enter = git.

---

## 7. Karşılaşmalar

### 7.1 Boss biçimleri (Ömer: ikisi de)
- **Güçlendirilmiş lider + eskort:** birim başına can/stat çarpanı + özel ad + `spriteScale`. Kullanım: elitler (3, 8C, 11A) ve **Castle Morvane (12)**.
- **Tek dev düşman:** tek birim, çok yüksek can, büyük çizim, **tur başına ek eylem** (ör. her turunda 2 eylem ya da sayaç eşiğine 2 kez ulaşma) ve kontrol etkilerine kısmi direnç; sıra sistemi tek birime az tur verdiği için ek eylem şart. Kullanım: **King's Bridge (9)**: The Bridge Warden (dev taş-zırhlı bekçi; görünüm Defender'ın büyütülmüşü, ileride özel sprite).
- Motor desteği gelene kadar 9 da lider + eskort olarak oynanır (veride `fallback` karşılaşması).

### 7.2 Karşılaşma listesi (PROVİZYON)
Yuva = sıra*3+şerit (0 en ön). `(w)` = tutorial zayıflatması (`hpMult 0.5, statMult 0.7`), `+` elit lider (`hpMult 1.8, statMult 1.15`), `++` bölge boss'u, `+++` final boss (`hpMult 3.0, statMult 1.35, spriteScale 1.4`).

| Node | Encounter id | English name | Takım (oyuncu) | Düşman | Units (yuva) | Motor desteği yokken |
|---|---|---|---|---|---|---|
| 1 Mill Road | `mill_road_thugs` | Road Thugs | 1 | 2 | Warrior (w) (1), Cutthroat (w) (0) | 1 vs 1: Warrior (1) |
| 2 Ravenwood | `ravenwood_pack` | Ravenwood Outlaws | 2 | 5 | Cutthroat (w) (0), Warrior (w) (1), Cutthroat (w) (2), Archer (w) (6), Archer (w) (8): ön sıra dolu, alan saldırısına davet | 2 vs 3: ön sıra 0, 1, 2 |
| 3 Ruined Watchtower | `watchtower_chief` | The Bandit Chief | 2 | 3 | **Bandit Chief** Warrior+ (1), Archer (w) (6), Archer (w) (8) | 2 vs 2: Warrior (1), Archer (7) |
| 5A Dwarven Mine | `mine_wardens` | Mine Wardens | 3 | 3 | Defender (0), Warrior (1), Archer (7) | aynı |
| 5B Iron Pass | `iron_pass_ambush` | Iron Pass Ambush | 3 | 3 | Cutthroat (0), Cutthroat (2), Archer (7) | aynı (pusu ileride) |
| 8A St. Brann's Abbey | `vault_keepers` | Vault Keepers | 4 | 4 | Defender (1), Paladin (6), Anti-Mage (8), Paladin (10) | aynı |
| 8B Mercenary Camp | `mercenary_camp` | Sellswords | 4 | 4 | Defender (1), Warrior (0), Gambler (4), Archer (7) | aynı |
| 8C Black Cathedral | `black_cathedral` | The Undying Choir | 4 | 5 | **High Priest** Undead+ (7), Undead (6), Defender (1), Hexer (4), Mage (10) (+ ileride 2 hazır Skeleton) | lidersiz aynı |
| 9 King's Bridge | `bridge_warden` | The Bridge Warden | 4 | 1 (dev) | **Bridge Warden** Defender (hpMult 6, statMult 1.5, spriteScale 2, 2 eylem/tur) (1) | `bridge_warden_escort`: Warden Defender++ (1), Archer (6), Archer (8), Paladin (10) |
| 10 Ashen Plain | `ashen_plain` | Ashen Revenants | 4 | 4 | Warrior (0), Warrior (2), Undead (7), Mage (6) | aynı (lanetli zemin ileride) |
| 11A Dragon's Spine | `dragons_spine` | Cult of the Drake | 4 | 5 | **Drake Priest** Mage+ (7), Mage (6), Druid (8), Cutthroat (0), Cutthroat (2) | lidersiz aynı |
| 11B Siege Line | `siege_line` | Morvane's Vanguard | 4 | 5 | Defender (0), Defender (2), Warrior (1), Archer (6), Archer (8) | aynı |
| 12 Castle Morvane | `lord_morvane` | Lord Morvane | 4 | 5 | **Lord Morvane** Undead+++ (7), Defender (1), Warrior (0), Paladin (10), Anti-Mage (6) | lidersiz aynı |

v3 notu: oyuncu takım boyutları yeni katılım düzenine göre (Ashford sonrası 3, Valdren Keep sonrası 4, 5. karakter açık) ve düşman sayıları buna göre bir azaltıldı. 5. karakter gelirse Bölge III karşılaşmalarına birer birim geri eklenir.

Taslak (`data/campaign/encounters.json`):
```json
{
  "mill_road_thugs": {
    "name": "Road Thugs",
    "units": [
      { "class": "warrior",   "slot": 1, "mods": { "hpMult": 0.5, "statMult": 0.7 }, "name": "Road Thug" },
      { "class": "cutthroat", "slot": 0, "mods": { "hpMult": 0.5, "statMult": 0.7 }, "name": "Cutpurse" }
    ],
    "fallback": "mill_road_thug_solo"
  },
  "bridge_warden": {
    "name": "The Bridge Warden",
    "units": [ { "class": "defender", "slot": 1, "name": "Bridge Warden", "boss": "giant", "mods": { "hpMult": 6, "statMult": 1.5, "spriteScale": 2, "actionsPerTurn": 2 } } ],
    "fallback": "bridge_warden_escort"
  }
}
```
Kurallar (testlenecek): sınıflar `randomPool` içinde (Geometer yok), yuvalar 0-11 ve tekrarsız, `fallback` varsa geçerli.

### 7.3 Zorluk eğrisi (PROVİZYON; balance-tester doğrulayacak)
| Durak | 1 | 2 | 3 E | 5 | 8 | 9 B | 10 | 11 | 12 FB |
|---|---|---|---|---|---|---|---|---|---|
| Takım / düşman | 1 / 2w | 2 / 5w | 2 / 3 | 3 / 3 | 4 / 4-5 | 4 / dev | 4 / 4 | 4 / 5 | 4 / 5 |
| Hedef YZ-vs-YZ oyuncu kazanma (taşınan canla) | %95 | %90 | %70 | %80 | %80 (8A), %70 (8B), %60 (8C E) | %55 | %75 | %65 (11B), %55 (11A E) | %50 |

---

## 8. Diğer ajanlara düşen işler

**engine-dev (motor; campaign-dev yazmaz):**
1. **Birim bazında güçlendirme/zayıflatma** (`{ class, mods: { hpMult, statMult }, name?, spriteScale? }`): tutorial (zayıf düşmanlar), elitler ve boss için şart. **Öncelik yüksek.**
2. **Eksik canla başlama** (`startHpRatio` 0-1, birim başına): can taşıma için şart.
3. **Savaş sonu özeti:** her oyuncu biriminin kalan can oranı, hayatta mı (saf `battleSummary(battle)`).
4. **Tek dev boss:** tur başına ek eylem (`actionsPerTurn`), isteğe bağlı kontrol direnci; büyük çizim (`spriteScale` var). Çok hücre kaplama gerekmez (tek hücre, büyük görsel) öneriliyor.
5. (Sonra) Çağrıların doğrudan düşman takımında olması, pusu (düşman sayaçları dolu başlar), savaş başında hazır zemin ("Cursed Ground").

**ui-dev:** `BattleScene` sefer bağlamı (`{ nodeId, onEnd(result) }`) + sonuç ekranı sefer düğmeleri (`Continue`, `Load Last Save`, `Load Game`, `Main Menu`); `session-flow.ts` sefer bağlamları; Main Menu, Load Game, Party, Ashford veda kartı ve "Form your company" ekranlarının görünüşü; tutorial ipucu kartları.

**content-designer:** rozet ikonları (6 tür + guarded işareti + seçim halkası + birleşme oku + onay mührü + Ironman maskesi), sis bulut dokusu, patika dokusu, kafile silüeti ayarı, `walk` animasyonu (ileride), sesler (adım toprak/çakıl, rota seçimi, sis açılması = rüzgâr hışırtısı, bölge bandı = alçak davul/boru, sandık açılışı, kasabada ateş çıtırtısı, aday katılımı); bölge savaş arka planları (`border-road`, `valley-field`, `ashen-heights`); harita arka planı (6.1 prompt'u) + CREDITS.

**balance-tester:** karşılaşma başına sim (takım boyutu bölge sınırıyla), 7.3 eğrisi; can taşımalı tam sefer simülasyonu (12 rota, `victoryHeal` / `reviveRatio` ayarı); tutorial zayıflatma çarpanları; dev boss ek eylem sayısı.

---

## 9. Uygulama aşamaları

| Aşama | İçerik | Büyüklük |
|---|---|---|
| **1. MVP** | `src/campaign/` saf mantık (graf + K1/K2 doğrulama, sis mesafesi, ilerleme, roster/aktif takım, kayıt modları ve 5'li/tekli kayıt listesi, seed türetme) + testler; `data/campaign/*.json`; `CampaignMapScene` (kodla parşömen arka plan, rozetler, rotalar, sis, kafile yürümesi, rota seçimi); Main Menu, Load Game, Party ekranı (basit); BattleScene bağlantısı; Town paneli (iyileşme + aday seçimi), Ashford veda + "Form your company"; Event/Treasure yer tutucu; tutorial ipuçları; debug girişleri; wiki "Campaign" makalesi. Motor desteği yoksa: tam canla savaş, `fallback` karşılaşmaları. | Büyük: ~4-5 oturum |
| **2. Derinlik** | engine-dev desteğiyle can taşıma, zayıf/güçlü birimler, dev boss; etiketsiz arka plan resmi; yürüme animasyonu, sesler, bölge bandı. | Orta: ~2 oturum (+ engine-dev ~1-2) |
| **3. İçerik** | Veriden olaylar, hazine ödülleri, altın + tüccar + ekipman, XP/skill ağacı, savaş öncesi iyileşme, sonraki haritalar (Ömer: şimdilik yok). | Büyük |

**Debug (yeni sekme `Campaign`):** Open map, Teleport to node, Win / Lose current node, Clear route, Reveal fog, Add character (sınıf listesi), Set party cap, Skip tutorial, Save now / Load / Wipe all saves, Switch Normal-Ironman, Edit node positions (sürükle + JSON kopyala), Route report (12 rota, savaş sayısı, K1/K2).

**Ömer nasıl test edecek (MVP sonrası):** Main Menu > New Campaign > Normal > kahraman seç > Mill Road savaşı > Ravenwood'da ikinci karakteri seç > Watchtower > Ashford'da tutorial takımının veda kartını gör, 3 kişilik yeni takımı kur (ilk seçilen taçlı lider; haritada artık o yürür, arkasında 2 silüet), Party ekranında diz > rota seç (diğer yol kapanır, ileride iki durak görünür, ötesi sisli) > bir savaşı kaybet: son kayıttan dönüldüğünü gör > Load Game'de 5 kayıt sınırını gör. Ironman ile yeniden başla: kayıt listesinde tek kayıt.

---

## 10. Ömer'e açık sorular (v4)

1. **Mine/Marsh ve arazi:** yer değiştirmeden sonra Dwarven Mine bataklıkta, Misty Marsh kuru dağ eteğinde duruyor. Seçenekler: (a) olduğu gibi kalsın, adlar araziye uydurulsun: 5A "Flooded Mine" (sular basmış cüce madeni), 6B "Misty Heights" (sisli yayla); (b) **konumları geri değiştir, rotadaki sırayı koru (öneri):** bataklık düğümü yine bataklıkta, maden yine dağda olur. Bu durumda alt dal Misty Marsh (5A) + Witch's Hut (6A), üst dal Iron Pass (5B) + Dwarven Mine (6B) olur; alt dalda savaş kalmayacağı için Misty Marsh "Battle · Bog Ambush" olur, Dwarven Mine "Treasure · Guarded" kalır (üst dalda 2 savaş, kural yine sağlanır). Hangisi?

Önceki (v3) sorular cevaplandı (bkz. "Ömer kararları (v4)"); 5. karakterin yeri hâlâ açık (öneri: King's Bridge zaferi).

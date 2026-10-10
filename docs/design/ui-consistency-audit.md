# Arayüz tutarlılık denetimi (2026-10-10, ui-dev)

Ömer'in isteği: "Bütün menülerin görünüşü ve davranışları, her ekranda menü düğmelerinin nerede durduğu ve bu yerleşimin mantıklı olup olmadığı, menüler arası tüm geçiş animasyonları: hepsi tutarlı, tek ortak yapı. Birebir kopya değil, ama farklı yerlerden kesilip yapıştırılmış gibi de durmasınlar."

Bu belge üç bölümden oluşuyor:

1. Ekran ekran denetim (değişiklikten ÖNCEKİ durum ve yapılan düzeltme).
2. Tanımlanan ortak yapı. Kısa özeti CLAUDE.md > Tasarım kiti altında.
3. Ömer'in onayını bekleyen büyük öneriler.

İşaretler:

- ✗ tutarsızlık
- ✓ bu turda düzeltildi
- ○ bilerek farklı bırakıldı (ekranın kişiliği) ya da öneri olarak aşağıda

## 1. Ekran ekran denetim

Sütun adları:

- **Giriş / çıkış:** ekrana girerken ve çıkarken oynayan geçiş.
- **Back / Menu:** konum ve yazı.
- **Çerçeve:** pencere çerçevesinin biçimi.
- **Başlık:** başlığın biçimi ve yeri.
- **Düğmeler:** birincil (primary) ve ikincil (secondary) düğmelerin kullanımı ve sırası.
- **Elmas:** kor elmasların kullanımı.
- **Zemin:** arkadaki kararma ve bulanıklık.
- **Esc:** Esc tuşunun davranışı.
- **Zemine dokunma:** pencere dışına tıklayınca kapanıp kapanmadığı.

Hiçbir menü ekranında arayüz sesi yok; bu, tutarlı ve ✓ kabul edildi.

### Ana menü, Play, Settings, Codex

| Ekran | Giriş / çıkış | Back / Menu | Çerçeve / başlık | Düğmeler / elmas | Zemin | Esc / zemine dokunma |
|---|---|---|---|---|---|---|
| Ana menü sütunu | Açılış yükleme ekranından kesme ✗ → ✓ ortak ekran girişi (kararıktan açılma) | Yok (kök ekran) | Logo + kutusuz satırlar | Seçili satırda kor elmas ✓ | Katmanlı canlı sahne + soldan gölge | Esc: yok / – |
| Play kartları | Sütun sola kayar, kartlar aşağıdan yükselir, sahne hafifçe ileri itilir. Diğer ekranlara geçiş KESME ✗ → ✓ kararıp açılma (Team Select, Endless, harita) | Sol üst "◂ Back  Esc" ✓ | Kart çerçevesi (ince altın) | Campaign: Continue/New birincil ✓ | Sahne + koyuluk 0,2 | Esc: geri / – |
| Settings (ana menü sütunu) | Sütun yer değiştirir | Sol üst Back ✓ | Başlık sol üstte, Cinzel 52 | Kutusuz satırlar | Koyuluk 0,45 (eskiden bulanık harita) | Esc: geri / – |
| Settings (oyun içi DOM) | Anında açılıyordu ✗ → ✓ ortak pencere açılışı | Sol üst Back ✓ | Ana menü sütunuyla birebir ölçü ✓ | Kutusuz satırlar | Kararma + 4 px bulanık | Esc: kapat / ○ zemine dokunma bilerek yok (tam ekran sütun) |
| Codex | Kendi giriş animasyonu (cx-fu / cx-fi) | Sol üst Back ✓ | Tam ekran kitap düzeni | – | Opak | Esc: geri / – ○ (tam ekran, pencere değil) |

### Oyun içi menüler ve sefer

| Ekran | Giriş / çıkış | Back / Menu | Çerçeve / başlık | Düğmeler / elmas | Zemin | Esc / zemine dokunma |
|---|---|---|---|---|---|---|
| Oyun içi Menu (savaş / Endless / MP; DOM) | Anında ✗ → ✓ ortak pencere açılışı | Sağ üst "Menu" ✓ | el-panel köşeli, Cinzel başlık ortada | Resume ilk satır, kor elmaslı ✓. Onay sorusunda Yes solda, No sağda ✗ → ✓ No solda, Yes (birincil) sağda | Kararma 0,62 | Esc: kapat; zemin: kapat (soru açıksa soruyu iptal eder) ✓ |
| Harita Menu'sü (Phaser openModal) | 200 ms solma ✓ (artık ortak ön ayar) | Sağ üst "Menu" ✓ | elHeading ortada, düğme listesi | Resume birincil ✓ | Kararma 0,62 ✓ | Esc / zemin: kapat ✓. ○ Görünümü oyun içi DOM menüsünden farklı (bkz. öneri 1) |
| Sefer yuvaları (New / Load, "Column") | 220 ms solma | Sol üst Back ✓ | Solda yuva satırları, sağda adım paneli | Başla düğmesi birincil ✓ | Neredeyse opak (0,95) ○ tam ekran | Esc: adım geri / – ○ |
| Formation | Ortak pencere ✓ | – | elHeading ortada ✓ | Back · Auto arrange · Done (birincil en sağda) ✓ | 0,62 ✓ | Esc / zemin: Done ✓ |
| Kahraman paneli | Ortak pencere ✓ | – | elHeading ortada ✓ | Formation · Gear · Close (birincil en sağda) ✓ | 0,62 ✓ | Esc / zemin: Close ✓ |
| Gear (DOM) | Anında açılıp kapanıyordu ✗ → ✓ ortak pencere açılışı ve kapanışı | – | "Çalışma paneli": başlık SOL üstte + sağ üstte altın ○ (bkz. kural 3) | Equip best x2 · Done (birincil en sağda) ✓ | 0,72 | Esc: seçimi bırak, sonra kapat; zemin: kapat ✓ |
| Spoils / teslim (DOM kartı) | Anında ✗ → ✓ ortak pencere | – | Küçük kart, başlık sol üstte | Gear · Continue (birincil en sağda) ✓ | 0,72 | Zorunlu: zemine dokunma yok ✓ |
| Kasaba / olay / hazine (openModal) | Ortak pencere ✓ | – | elHeading ortada ✓ | Kasaba: Formation · Gear · Leave (birincil en sağda) ✓; olay / hazine tek birincil ✓ | 0,62 ✓ | Zorunlu: zemin yok ✓ |
| "Take this road?" (onay) | Ortak pencere ✓ | – | elHeading ortada | Yes solda, No sağda ✗ → ✓ No · Yes | 0,62 | Zemin = No ✓ |
| Sefer tamam | Ortak pencere | – | elHeading | Main Menu solda (birincil), Stay sağda ✗ → ✓ Stay · Main Menu | 0,62 | – |

### Savaş sonu

| Ekran | Giriş / çıkış | Back / Menu | Çerçeve / başlık | Düğmeler / elmas | Zemin | Esc / zemine dokunma |
|---|---|---|---|---|---|---|
| Sonuç ekranı | Kendi kademeli girişi (340-520 ms) ○ | – | Büyük başlık ortada | Hızlı savaş: New Game (birincil) solda ✗ → ✓ Team Select · New Game. Sefer / Endless / MP eylemleri: birincil ilk sıradaydı ✗ → ✓ birincil en sağa çizilir (Enter yine birincil) | Koyu + vinyet | Enter / Esc kısayolları ✓ |

### Endless

| Ekran | Giriş / çıkış | Back / Menu | Çerçeve / başlık | Düğmeler / elmas | Zemin | Esc / zemine dokunma |
|---|---|---|---|---|---|---|
| Başlık / kamp / ödül / kalıntı / tüccar / koşu sonu | Görünümler arasında KESME ✗ → ✓ ortak panel geçişi (solarak, 18 px kayarak). Ana menüye dönüş kesme ✗ → ✓ kararıp açılma | Sol üst Back ✓ | heading() ortada ✓; tüccar kendi tezgâh düzeni ○ | Kartlar seçilince kor parıltı ✓ | Kendi arka planı | Esc: geri ✓; kalıntı / ödül zorunlu ✓ |

### Takım seçimi ve multiplayer

| Ekran | Giriş / çıkış | Back / Menu | Çerçeve / başlık | Düğmeler / elmas | Zemin | Esc / zemine dokunma |
|---|---|---|---|---|---|---|
| QB takım seçimi | Kendi kararma süreleri (380 / 300 / 220 ms) ✗ → ✓ ortak ekran ön ayarı | Sol üst Back ✓ | "Twin Formations" ○ | START sağ altta birincil ✓ | – | Esc: geri ✓ |
| MP lobisi / takım seçimi | Kesme ✗ ○ | Sol üst Back ✓ | elHeading | – | – | Esc: geri. ○ MultiplayerScene şu an engine-dev'in kod bölme işinde; bu turda dokunulmadı (bkz. öneri 4) |

### Ortak parçalar

| Ekran | Giriş / çıkış | Çerçeve / düğmeler | Esc / zemine dokunma |
|---|---|---|---|
| Onay (elConfirm, Phaser) | 160 ms solma ✗ → ✓ ortak pencere açılışı / kapanışı | Yes solda (birincil), No sağda ✗ → ✓ No solda, Yes en sağda | Esc / zemin = No ✓ |
| Toast (elToast) | Kendi süreleri ✓ → artık ortak ön ayar (veri) | Yatay bant | – |
| Tooltip | Phaser elTip, DOM el-tip, HUD bh-tt: aynı kit dili ✓ | – | – |

## 2. Ortak yapı (CLAUDE.md > Tasarım kiti > "Ortak ekran yapısı")

### 2.1 Hareket ön ayarları

Kaynak `data/ui-motion.json`; okuyan modül `src/ui/motion.ts`. "Reduced motion" açıkken bütün süreler 0 olur.

- **Ekran (screen):** sahne değişimi. Kararıp açılma, 220 ms çıkış / 320 ms giriş.
  - Phaser: `elGo(scene, key, data)` (çıkış) ve `elScreenIn(scene)` (her sahnenin create'inde).
- **Pencere (modal):** zemin 200 ms solarak belirir, panel 10 px aşağıdan yükselir; kapanışta 140 ms söner.
  - Phaser: `elModalIn` / `elModalOut`. `openModal` ve `elConfirm` bunları kullanır.
  - DOM: `.el-modal` (zemin) + `.el-modal-panel` (kutu); kapanış `closeDom()` ile.
  - Kullanan DOM pencereleri: gm-overlay (oyun içi Menu), st-overlay (Settings), gr-overlay (Gear, Spoils, teslim), el-dialog.
- **Panel:** aynı ekranda görünüm değişimi. 260 ms solma + 18 px kayma (Endless görünümleri).
- **Toast:** 250 ms giriş, 1700 ms bekleme, 250 ms çıkış.
- **Tooltip:** 140 ms.

### 2.2 Yerleşim kuralları

1. **Back / Menu:** kurulum ve bilgi ekranlarında sol üstte "◂ Back  Esc"; oyun içinde (savaş, harita) sağ üstte "Menu". İkisi aynı ekranda bulunmaz. Bu kural mevcuttu; denetimde istisna bulunmadı.
2. **Düğme sırası:** ikincil düğmeler solda, birincil eylem EN SAĞDA (Cancel / No → Yes; Back · Auto arrange · Done). Tek düğmeli pencerede düğme ortada. Kor elmas yalnızca birincil düğmede ya da seçili öğede.
3. **İki çerçeve türü:**
   - **Diyalog** (onay, kasaba, olay, hazine, kahraman paneli, Formation, harita Menu'sü): başlık ortada, elHeading süslemeli; düğmeler altta.
   - **Çalışma paneli** (Gear, tüccar, Spoils kartı): başlık SOL üstte, sağ üstte bağlam bilgisi (altın, torba), düğmeler sağ altta.
   - İkisi de aynı ince altın çerçeve, aynı zemin (kararma 0,62–0,72) ve aynı açılış / kapanış hareketi.
4. **Kapatma:** her diyalogda birincil Close / Done / Resume düğmesi + Esc + zemine dokunma (zorunlu seçimler hariç; bkz. CLAUDE.md > Zemine dokununca kapanma).
5. **Başlıklar:** Cinzel 600 büyük harf. Pencere başlığı 40 (Phaser elHeading) / ~42 oyun birimi (DOM). Ekran başlığı 52 (Settings sütunu, Endless heading). Alt yazı EB Garamond italik.
6. **Dokunma hedefleri** en az 44 px. Savaş HUD'ında telefonda Rest / Skip / Move artık yan yana ~44 px ikon düğmeler; adları tooltip'te.

## 3. Ömer'in onayını bekleyen öneriler (büyük değişiklik; bu turda yapılmadı)

1. **Harita Menu'sü ile oyun içi Menu'yü birleştirmek.** Harita Menu'sü bir Phaser penceresi (düğme listesi); savaş / Endless'taki Menu ise DOM paneli (kutusuz satırlar, Resume kor elmaslı). İkisi aynı kit dilinde ama farklı biçimde. Öneri: harita da DOM oyun içi Menu'yü (`game-menu.ts`) kullansın; Save / Load satırları `menuItems`'a eklenir. Orta-büyük iş: kayıt ve yükleme akışı yeniden bağlanır.
2. **Settings'in bulanık zemini.** Oyun içi Settings arkayı 4 px bulanıklaştırıyor. Ana menüde katmanlı sahneye geçtikten sonra menü bulanıklık yerine koyuluk kullanıyor. Öneri: her yerde aynı karar (yalnızca koyuluk ya da her yerde bulanıklık). Küçük iş ama görsel tercih, bu yüzden Ömer'e soruldu.
3. **Sonuç ekranı.** Kendi kademeli girişi güzel ama süreleri ortak ön ayarlardan bağımsız. Öneri: girişi "ekran" ön ayarına bağlamak ve başlık ölçülerini kit ölçeğine (52 / 40) çekmek. Orta iş; ekranın kişiliği değişebilir.
4. **Multiplayer lobisi.** Ekran geçişleri hâlâ kesme. MultiplayerScene şu an kod bölme işi yüzünden değişiyor; o iş bitince `elScreenIn` / `elGo` eklenmeli (küçük iş).
5. **Sefer yuvaları (Column).** Tam ekran ve neredeyse opak; Codex gibi davranıyor. Öneri: ana menü sahnesinin üstünde yarı saydam "ekran" olarak açılması (Play kartları gibi) ve böylece menüyle aynı katmanda kalması. Orta-büyük iş.
6. **Arayüz sesleri.** Hiçbir menüde ses yok. İstenirse kısa, ortaçağ tarzı bir "sayfa / deri" sesi ortak hareket ön ayarlarına bağlanabilir (CLAUDE.md ses felsefesine uygun). Ömer'in kararı.

## 4. Ömer'in kararları (2026-10-10) ve durum

- **Öneri 1 (harita Menu'sü + oyun içi Menu birleşmesi): UYGULANDI (Ömer 2026-10-10, "menüler her ekranda farklı duruyor").** Sefer haritasının Menu'sü artık savaştakiyle AYNI ortak bileşen (`src/ui/game-menu.ts`, DOM): aynı çerçeve (el-panel köşeli, ortada Cinzel "Menu" başlığı), kutusuz satırlar (Resume kor elmaslı ilk satır), aynı açılış/kapanış hareketi, kararma, Esc ve zemine dokunma; Settings menünün üstünde aynı ekran, Codex aynı. İçerik bağlama göre (`session-flow.ts > menuItems`): harita = Resume / Save n/m (elle kayıt) / Load (Normal) / Codex / Settings / Main Menu (onay yok: ilerleme kayıtta); savaş listeleri değişmedi. Harita yalnızca anlık durumu verir (`CampaignMapScene.menuState`: düğme görünür mü, Save yazısı, Load) ve Save / Load eylemlerini (`menuSave` / `menuLoad`). Eski Phaser `openModal` menüsü ve haritanın ayrı Menu düğmesi kaldırıldı.
- **Denetim (2026-10-10) sonucu, aynı kalanlar:** Codex tam ekran kitap düzeni (Back kuralı, pencere değil) ○; Endless dalga arası paneller (kamp / ödül / tüccar) Menu değil "◂ Back" taşır (madde 300 kararı; campaign-dev bu ekranlarda çalışıyor) ○; ana menü Settings sütunu (Phaser) ile oyun içi Settings (DOM) aynı satırlar ve ölçüler (Battle speed kaydırıcısı ikisinde de) ✓.
- **Öneri 2 (Settings zemini): UYGULANDI (Ömer 2026-10-10, v2 "Darkening everywhere").** Settings her yerde (ana menü, savaş, harita, Endless) yalnızca koyulaştırma: sahne %52 kararır + sütunun arkasında soldan sağa açılan gölge, bulanıklık yok (`src/style.css > .st-overlay`, `MainMenuScene > SETTINGS_DARK`). Taslak sayfası silindi.
- **Öneri 3 (sonuç ekranı):** yapıldı.
  - Kademeli giriş süreleri `data/ui-motion.json > result` ön ayarından geliyor; Reduced motion açıkken anında.
  - Başlık ölçüleri `type` ölçeğinden: hero 84, section 20. Pencere başlıkları `TYPE.modal` (40).
- **Öneri 4 (Multiplayer):** yapıldı. Girişte `elScreenIn`, çıkışta `elGo`. Lobi düğmeleri artık Leave solda, Ready (birincil) en sağda.
- **Öneri 5 (sefer yuvaları):** yapıldı. Ekran ana menü sahnesinin üstünde yarı saydam açılıyor (zemin 0,5 + sol gölge); arkadaki kartlar, menü sütunu ve Back o sürece çekiliyor. Açılış ortak panel geçişiyle.
- **Öneri 6 (arayüz sesleri):** bağlantı noktası hazır: `src/ui/ui-sound.ts > uiSound(kind)`.
  - Türler: open, close, confirm, back, hover, select.
  - Ortak yardımcılar çağırıyor: `elModalIn` / `elModalOut`, `elButton` (hover; birincilde confirm, ikincilde select), `elLink` (hover / select), `elBack` (back), oyun içi Menu (aç / kapa / seç), Gear açılışı, `closeDom`.
  - Sesleri content-designer dolduruyor.

# Hexer: tasarım dökümanı (UYGULANDI: motor + veri, 2026-10-07)

> **Durum: UYGULANDI (engine-dev, 2026-10-07; open-questions madde 245).** Motor iş listesi E1-E15 tamam: `data/classes/hexer.json`, `skills.json` (evil_eye, withering_curse, jinx, doom_mark), `statuses.json` (omen, wither, jinxed), `ai.json > profiles.hexer`, rastgele havuzda 11. class; motor `src/engine/battle.ts` (yığın, Doom, DoT, Ill Omen, critDelta, endsOnOwnAttack), `ai.ts`, `preview.ts`, `skill-info.ts`, `match-log.ts`; testler `tests/hexer.test.ts`; kurallar `docs/design/combat.md > Hexer`. Sprite/avatar ui-dev'den (`assets/sprites/hexer`, `assets/avatars/hexer.png`). **Yer tutucular** (content-designer gerçeklerini yapacak; bölüm 9): logo `rune`, pasif `soul`, Evil Eye ikon `eye` / vfx `voidstrike` / ses darkChant + boneImpact, Withering Curse `drainfield` / `wail` / graveMoan + voidSuction, Jinx `clover` / `bonethrow` / chainTether + boneImpact, Doom Mark `voidstrike` / `voidstrike` / voidPulse + implode; durum ikonları omen `eye`, wither `poison`, jinxed `finger`. Omen göstergesi, Doom floating text ve hover önizleme satırları ui-dev işi (olaylar ve önizleme alanları hazır). Aşağıdaki "yazılmadı" notları tarihsel (tasarım aşaması).
>
> Eski durum: **taslak / öneri; Ömer kararları Ö1-Ö12 işlendi (2026-10-07, bkz. 12.3 Kararlar)**. Bu dosyadaki hiçbir şey `data/`, `src/`, `tests/` ya da `assets/` içine yazılmadı. Tüm sayılar **PROVİZYON**dur (balans ajanı `npm run sim` ile ayarlayacak). JSON blokları yalnızca **şemaya uygun taslaktır**; gerçek dosyalara uygulandığında engine-dev yeni alanları önce motora eklemelidir (bölüm 7).
>
> Hazırlayan: content-designer (Opus). Kaynak: Ömer'in isteği ("LUCK primary, RANGED, support değil, hafif komplike, luck mantığını içinde barındırsın ve doğal dursun") + ana oturumun taslağı (Bad Omen / Doom / Misfortune / Evil Eye / Withering Curse / Jinx / Doom Mark / Ill Omen). Taslaktan sapılan yerler gerekçesiyle işaretli (**[DEĞİŞİKLİK]**).

---

## 1. Özet ve kimlik

| Alan | Değer |
|---|---|
| id | `hexer` |
| Oyun içi ad | **Hexer** |
| Rol (`role`) | **Curse Caster** |
| Primary | **LUCK** (Lucky Escape aktif) |
| Menzil | Uzak (tüm skill'ler `cast`; ön sıra kuralı yok) |
| Arketip | Lanetçi / köy kenarı cadısı: kötü alameti (omen) hedefe biriktirir, üç alamet tamamlanınca **Doom** iner |
| Zorluk | Orta ("hafif komplike"): tek bir sayaç (Omen 0-3) takip edilir, gerisi doğal akar |

**Tema (medieval, hayvan YOK):** köyün dışında yaşayan, kapüşonlu, kemik tılsımlı bir lanetçi. Elinde kara dikenden (blackthorn) eğri bir asa; ucunda oyulmuş kemik pullar, düğümlenmiş kırmızı iplikler ve çatlak pişmiş toprak (seramik) tılsımlar asılı. Belinde kara bir kandil (içinde is yapan siyah mum). Lanetleri "nazar" (Evil Eye), "çürütme" (Withering), "uğursuzluk düğümü" (Jinx) ve "kıyamet mührü" (Doom Mark) üzerinden yapar. Kuzgun, kedi, kurbağa, hayvan kafatası gibi hayvan öğeleri **YOK**; kemik pullar insan eliyle oyulmuş tılsımdır, kafatası motifi de kullanılmaz (Undead ile karışmasın).

**Luck nasıl "doğal" duruyor:** şans = uğur; lanet = uğursuzluk. Hexer'in Luck'ı (1) lanetin tutmasını (isabet, Luck +%1/puan), (2) lanetin "fazla tutmasını" (kritik lanet = 2 alamet; kritik şansı Luck +%0,5/puan) ve (3) lanetin şiddetini (`scale: luck`) belirler. Hedefe biriken alamet ise hedefin **kendi şansını** düşürür (Misfortune: kritik şansı azalır). Yani Luck'ı yüksek olan, rakibin Luck'ını çalar gibi oynar. Yeni bir "luck kuralı" gerekmez; mevcut formüller yeterli (bkz. bölüm 3.6).

**Güçlü yanları**
- Büyü (magic) hasarı: çoğu class'ın büyü zırhı 0 (yalnızca Anti-Mage 20): zırhlı tank'lara (Defender 19 zırh) karşı verimli.
- Gecikmeli patlama: Omen biriktikçe her yeni lanet daha değerli olur; Doom öngörülebilir ama kaçınılmaz (iskası yok).
- Rakip kritiklerini bastırır (Misfortune, Jinx): Gambler/Archer gibi kritiğe dayanan hedeflere sinir bozucu.
- Alan baskısı (Withering Curse) + tek hedef bitirici (Doom Mark).

**Zayıf yanları**
- Kırılgan: can 56, zırh 4, büyü zırhı 0, kaçınma %0, hız 8 (yavaş).
- Hasarın önemli kısmı ertelenmiş: Omen'in Doom'a dönmesi 3 tura kadar sürebilir (rakip o arada oynar). Yatırım artık **kaybolmaz** (Ö2: süre dolunca Omen'ler Doom olarak patlar); yalnızca hedef başka bir nedenle ölürse kalan Omen'ler Ill Omen ile en yakın düşmana geçer (Hexer ölmüşse geçmez, boşa gider).
- Taunt'a tabi: tek hedefli lanetler taunt'çıya gitmek zorunda.
- Kalkanlar (özellikle büyü kalkanı: Mana Barrier, Spell Ward) Doom'u emer.

**Takımdaki yeri:** ikinci/üçüncü hat hasar vericisi (orta-arka sıra, `frontPriority` 6,5). Tank arkasında durur, ön sırayı Withering Curse ile alametler, kritik hedefi Jinx ile susturur, olgunlaşan hedefi Doom Mark ile bitirir. Destek DEĞİL: şifa/kalkan/buff yok; "debuff" etkileri de hasarın yan ürünü.

**Mevcut class'larla farkı**

| Class | Primary | Kimlik | Hexer'den farkı |
|---|---|---|---|
| Mage | INT | Anlık büyük büyü (Fire Bolt 2,25 int), AOE, kalkan | Hexer anlık hasarda zayıf, **birikim + gecikmeli patlama** oynar; kalkanı yok |
| Anti-Mage | INT | Mana yakma, büyü zırhı 20 | Hexer MP'ye dokunmaz; Anti-Mage Hexer'in en sert karşılığı (büyü zırhı + Spell Ward) |
| Undead | INT | Karanlık büyücü: zehir zemini, Slow, Skeleton çağrısı, ceset | Hexer zemin bırakmaz, çağırmaz; DoT'u **karakter üstünde** taşınır (zemin değil), kemik/ruh değil tılsım-uğursuzluk teması |
| Gambler | LUCK | Fiziksel, varyans/bahis, kendi riskini oynar | Aynı stat, zıt felsefe: Gambler **kendi** şansıyla kumar oynar, Hexer **rakibin** şansını bozar; Hexer büyü, öngörülebilir, birikimli |
| Cutthroat | DEX | Yakın suikast, durum bonusu (Opportunist), Smoke Bomb | Cutthroat durum **tüketir** (bonus), Hexer durum **üretir**; ikisi doğal ikili: Opportunist **Wither**'lı hedefe de bonus verir, Omen'e vermez (Ö7 kararı) |

---

## 2. Stat dağılımı (toplam 30)

**Öneri: STR 6 / INT 7 / DEX 3 / LUCK 14**, zırh 4, büyü zırhı 0.

Gerekçe: Luck oyundaki en yüksek Luck (Gambler 12) olsun ki "luck class'ı" kimliği belirgin olsun; Int 7 → MP 44 (4 skill'in bedeline yetsin, Mana Echo YOK çünkü Int primary değil); Str 6 → can 56 (istenen 50-60 bandı); Dex 3 (hiçbir class'ta dex 0 yok kuralı; evasion yine %0).

| Türetilmiş değer | Formül (`formulas.json > attributes`) | Hexer |
|---|---|---|
| Can (HP) | 20 + 6 x STR | **56** |
| Mana (MP) | 30 + 2 x INT | **44** |
| MP yenilenmesi / tur | round(0,33 x INT) = round(2,31) | **2** |
| Can yenilenmesi / tur | STR x 0,25 = 1,5 (uygulamada round) | **2** |
| Hız (SPD) | round(7 + 0,4 x DEX) = round(8,2) | **8** |
| Kaçınma (EVA) | min(%75, floor(DEX/5) x %2) | **%0** |
| İsabet (ACC) | %80 + %1 x LUCK | **%94** |
| Kritik şansı (CRIT) | %5 + %0,5 x LUCK | **%12** |
| Kritik çarpanı (CDMG) | sabit | **x1,5** |
| Zırh (ARM) | veri | **4** (azalma 4/34 = %11,8) |
| Büyü zırhı (M.ARM) | veri | **0** |
| Primary bonus | Luck en yüksek stat → aktif | **Lucky Escape** (%30, savaş başına bir kez) |

Karşılaştırma (aynı tablodan): Mage 6/19/3/2 → can 56, MP 68, ACC %82, CRIT %6; Gambler 8/3/7/12 → can 68, MP 36, ACC %92, CRIT %11; Cutthroat 5/5/15/5 → can 50, ACC %85, EVA %6, SPD 13.

**Primary bonus etkileşimleri**
- **Lucky Escape (kendi):** kırılgan arka hat olduğu için ölümcül vuruş sık gelir; %30 "son anda uğuru tuttu" teması lanetçiye çok uyar. Doom ve Wither ölümcül olduğunda **rakip** Gambler/Hexer'in Lucky Escape'i de çalışır (motor "ölümü gerçek öldüren her vuruş" diyor: Doom da Wither tiki de `applyHit`'ten geçecek, bkz. 7.2).
- **Hunter's Mark (rakibin, DEX primary):** Hexer hız 8; Archer (13), Cutthroat (13) gibi hızlı DEX class'lar Hexer'e +%15 vurur. Bilinçli zayıflık.
- **Resilience (rakibin, STR primary):** Omen, Wither ve Jinxed debuff'tır; uygulanırken %35 ihtimalle süreleri 1 kısalır (1 turluk olanlar hariç). Warrior/Defender alameti daha kısa taşır: tematik ("güçlü irade uğursuzluğu silkeler").
- **Mana Echo (rakibin):** etkileşim yok.

---

## 3. Mekanik sözlüğü

### 3.1 Omen (Bad Omen, kötü alamet): yığılan işaret

| Kural | Değer (PROVİZYON) |
|---|---|
| Durum id / adı | `omen` / **Omen** (tooltip başlığı "Bad Omen") |
| Tür | debuff (Resilience'a tabi) |
| Yığın (stack) üst sınırı | **3** |
| Ekleme | Hexer'in her **isabet eden** laneti hedefe +1 Omen; lanet vuruşu **kritikse +2** |
| Süre | **3 tur** (taşıyanın kendi turları; taşıyanın her tur başında 1 azalır). Sayaç ilk Omen'le başlar; **skill ile eklenen her yeni Omen süreyi tam 3 tura YENİLER** (Ö2 güncellendi, Ö13; veri `refreshOnStack: true`). Ill Omen ile geçen Omen yenilemez (Ö11). Resilience zarı yalnızca ilk Omen konduğunda atılır (3 -> 2); yenileme tam süreye, zarsız |
| Süre dolunca | Omen'ler sessizce düşmez: hedefteki **Omen sayısı kadar Doom patlar** (otomatik Doom formülü, x1; bkz. 3.2 tetik b), yığın ve sayaç sıfırlanır |
| Tamamlanma | Yığın **3'e ulaştığı AN** Doom tetiklenir (aynı eylemin içinde; Ö1), yığın ve sayaç 0'a iner. Sonraki ilk Omen yeni bir 3 turluk sayaç başlatır |
| Kaynak | Yığın hedefe aittir: aynı taraftaki iki Hexer aynı yığını doldurur (Ö8). 3'te anında Doom: tamamlayan Hexer'in o anki Luck'ı. Süre bitiminde Doom: **son Omen'i ekleyen** Hexer; her Omen eklenişinde o Hexer'in Luck'ı ve kritik şansı yığına **snapshot** olarak yazılır (Hexer ölmüş olsa da lanet sürer ve bu snapshot kullanılır: Ö3) |
| İska | İska/dodge eden lanet Omen eklemez (mevcut kural: iskada etki uygulanmaz) |
| Misfortune | Omen taşıyan birimin kritik şansı **yığın başına -%3** (bkz. 3.3) |

Neden "en fazla 3 tur, yenilenmeyen, sonunda patlayan" (Ö2): Hexer'in hızı 8, ortalama rakip 8-10; Hexer hedef başına 2 eylemde (kritikle 1 eylemde) 3'e ulaşabilir. Yenilenmeyen süre her alametin bir "saati" olmasını sağlar: oyuncu ve rakip sayacı görür, Omen'ler ya 3'te ya da süre bitince mutlaka patlar. Karar artık "patlayacak mı" değil "ne zaman ve ne kadar büyük": bekleyip 3'e tamamlamak ya da Doom Mark ile x1,5 erken patlatmak. Resilience 3'ü 2'ye indirirse STR tank'larında küçük Doom'lar daha erken gelir (kayıp değil, erken ve küçük patlama).

### 3.2 Doom (kıyamet): üç alametin patlaması

| Kural | Değer (PROVİZYON) |
|---|---|
| Tetik | (a) Omen yığını 3'e ulaştığı AN, otomatik (x1; Ö1); (b) Omen süresi dolunca, yığındaki Omen sayısı kadar (x1; Ö2); (c) Doom Mark skill'i (yığın kaç olursa olsun, x1,5; Ö10) |
| Hasar | **LUCK x 0,6 x tüketilen Omen sayısı x çarpan** (otomatik: x1; Doom Mark: **x1,5**) |
| Örnek (Luck 14) | Otomatik 3 Omen: 14 x 0,6 x 3 = **25,2 ham**; süre bitiminde 1 / 2 Omen: **8,4 / 16,8 ham**; Doom Mark ile 3 Omen: **37,8 ham** |
| Tür / element | büyü (magic) / `dark`; büyü zırhı ve büyü kalkanı uygulanır |
| İsabet zarı | **YOK** (lanet zaten tuttu; Doom kaçınılmaz) |
| Kritik | **VAR**: Hexer'in kritik şansıyla (Luck) ayrı zar (b'de snapshot kritik şansı, zar patlama anında seed'li rng ile). Doğal: "kıyamet bazen daha korkunç gelir" |
| Snapshot | (a) ve (c): tetikleyen Hexer'in o anki Luck'ı ve kritik şansı (o an eylem yapıyor, canlı). (b): yığındaki snapshot (son Omen'i ekleyen Hexer'in Omen eklendiği andaki Luck'ı ve kritik şansı; Hexer ölmüş olabilir) |
| Hasar ölçekleme kuralı | Uyar: hasar skill statının (luck) yüzdesi. **İstisna listesine GİRMEZ** (bkz. 3.5) |
| Guard / kalkan | (a) ve (c): Doom onu tetikleyen skill vuruşunun parçasıdır: **Guard paylaşımı, kalkan, Lucky Escape normal işler**. (b): tur başı durum hasarıdır (Wither tiki gibi): **Guard'a aktarılmaz**, kalkan (önce büyü kalkanı) ve Lucky Escape normal işler; olay `origin: 'status'`, `status: 'omen'` |
| Süre bitiminin zamanı (b) | Taşıyanın **kendi turunun başında**, Omen sayacı 0'a indiği an. Sıra: zemin tikleri -> Wither tiki -> Omen süresi (Doom) -> can/MP yenilenmesi. Taşıyan zemin ya da Wither tikinde ölürse Doom patlamaz; Doom dışı ölüm sayılır ve Ill Omen tüm yığını geçirir. Doom'la ölen birim o tur oynamaz |
| Taunt | Doom hedef seçmez (zaten lanetli hedefte patlar), taunt'tan etkilenmez; taunt'çıya inen Doom taunt `breakRatio` sayacına eklenir (Hexer taunt kırıcıdır) |
| Ceset | Doom'la ölen birim normal ceset bırakır |

### 3.3 Misfortune (uğursuzluk)

Ayrı bir durum değil, **Omen'in yan etkisi**: Omen taşıyan birimin kritik şansı **yığın başına -%3** (1: -%3, 2: -%6; 3'te Doom zaten patlar). Kritik şansı 0'ın altına inmez. Rakip kritikleri %5,5-%11 arasında olduğu için 2 Omen çoğu class'ın kritiğini neredeyse siler. Tooltip'te Omen satırının altında "Misfortune: crit chance -6%" yazar.

**[DEĞİŞİKLİK, Ö4 ile ONAYLANDI]** Taslakta Misfortune ayrı bir durumdu; Omen'e gömülmesi ekrandaki rozet sayısını azaltır ve "alamet biriktikçe şansı kaçıyor" hissini doğrudan verir. Resilience etkileşimi: Misfortune'un ayrı süresi yok, Omen'in süresine bağlıdır (Resilience Omen süresini kısaltırsa Misfortune da kısalır; süre bitiminde Omen'ler Doom olarak patlayınca Misfortune da biter).

### 3.4 Wither (çürüme): zamanla hasar (DoT) durumu

Oyunda henüz karakter üstünde DoT yok (zehir/yanık **zemin** etkisi). Hexer ilk karakter-üstü DoT'u getirir.

| Kural | Değer (PROVİZYON) |
|---|---|
| Durum id / adı | `wither` / **Withering** |
| Tür | debuff (Resilience'a tabi) |
| Tik zamanı | Taşıyanın **kendi turunun başında**, zemin tiklerinden HEMEN SONRA, Omen süre bitimi Doom'undan (3.2 b) ÖNCE, regen'den önce |
| Tik hasarı | **LUCK x 0,2** (uygulama anındaki Luck'tan sabitlenir) → Luck 14: **2,8 ham → 3/tur** |
| Süre | **3 tur** |
| Tür / element | büyü / `dark`; tik anında büyü zırhı uygulanır (zemin tikiyle aynı `groundTickDamage` mantığı) |
| İsabet / kritik | Tikte **isabet zarı YOK, kritik YOK** (zemin tikleriyle tutarlı; Luck'ın ödülü kritik lanetin ekstra Omen'i) |
| Yığılma | Yığılmaz. Yeniden uygulanırsa süre 3'e yenilenir, **büyük olan miktar** kalır |
| Guard | Tik guard'a aktarılmaz (zemin tikiyle aynı: dolaysız durum hasarı) |
| Kalkan / Lucky Escape | Kalkan emer (büyü kalkanı önce), ölümcül tikte Lucky Escape zarı atılır |
| Olay | `damage` olayı, `origin: 'status'`, `status: 'wither'`, `element: 'dark'`, `damageType: 'magic'` |
| Ölüm | Tikte ölen birimin Omen'i varsa pasif Ill Omen çalışır |
| Kaynak ölürse | **Durum sürer** (Ö3 kararı; zeminde kaynak ölünce zemin biter, karakter üstü lanet kaynaktan bağımsız: "lanet büyücüden uzun yaşar"). Omen de sürer ve süre bitiminde snapshot Luck ile patlar |

### 3.5 Hasar ölçekleme kuralı

Tüm Hexer hasarları `scale: luck`: skill vuruşları, Wither tiki (`dot` etkisi, `scale: luck`), Doom (`omen` durum tanımındaki `doom.scale: luck`). **Yeni istisna yok.** `tests/damage-scale-rule.test.ts` Doom'u ve DoT'u tanımalı (yeni etki türleri `dot` ve `detonate` ölçekli sayılmalı; bölüm 7).

### 3.6 Luck'ın doğal rolü (mevcut formüllerle)

| Luck etkisi | Mevcut formül | Hexer'de karşılığı |
|---|---|---|
| İsabet | +%1 / puan (taban %80) | Lanetin tutması (%94); iska = Omen yok |
| Kritik şansı | +%0,5 / puan (taban %5) | Kritik lanet = **+1 ekstra Omen** (yeni, veri: `omenOnCrit: 2`) + x1,5 hasar |
| Hasar | `scale: luck` | Lanet, Wither ve Doom gücü |
| Primary | Lucky Escape | Kendi hayatta kalması |
| Rakibin şansı | yok | Misfortune (Omen başına -%3 kritik), Jinx (kritik 0) |

Yeni global luck kuralı **gerekmez**. Tek yeni "şans" kuralı skill verisine bağlıdır (`omenOnCrit`), formülde değişiklik yok.

### 3.7 Jinxed (uğursuzluk düğümü)

| Kural | Değer (PROVİZYON) |
|---|---|
| Durum id / adı | `jinxed` / **Jinxed** |
| Tür | debuff |
| Etki | İsabet **-%20** (`accuracyDelta: -0.2`) ve kritik şansı **0** (`critDelta: -1`, 0'a kırpılır) |
| Süre | **2 tur VEYA taşıyanın bir sonraki hasar veren skill'i** (hangisi önce): o skill'in TÜM vuruşları etkilenir, sonra durum düşer (`endsOnOwnAttack: true`) |
| Resilience | 2 → 1 kısalabilir |
| Yığılma | Yok, yenilenir |

### 3.8 Diğer etkileşimler

- **Taunt:** Evil Eye, Jinx, Doom Mark tek hedefli → taunt'çıyı hedeflemek zorunda (mevcut kural). Withering Curse alan skill'i → taunt'tan etkilenmez. Hexer'in CC'si yok, taunt'ı `breaksTaunt` ile bozmaz; ama Doom'un büyük tek vuruşu `breakRatio` eşiğini doldurarak taunt'ı **hasarla** kırabilir.
- **Guard:** Doom guard'a aktarılır (skill vuruşu gibi), Wither tiki aktarılmaz. Guard'lı hedefe Doom atmak koruyucuyu da yaralar.
- **Stun/CC:** Hexer sersemlerse Omen/Wither süreleri normal azalır (taşıyanın turuna bağlı, Hexer'inkine değil). Taşıyan sersemse de tur başı işler (süre azalır, süre biterse Doom patlar).
- **Blinded (Hexer'e Smoke Bomb):** isabet %94 → %64: lanetler sık iskalar, Omen birikmez. Hexer'in sert karşılığı; Doom'u (isabetsiz) etkilemez.
- **Shrouded (rakip):** kaçınma +%20 → lanet tutma şansı düşer.
- **Büyü kalkanı / Spell Ward:** Doom ve Wither büyü hasarı → önce büyü kalkanı emer.
- **Ceset / diriltme:** Diriltilen birim Omen/Wither olmadan döner (ölümde tüm durumlar silinir; mevcut davranış).
- **Çağrılar (Skeleton, Treant):** lanetlenebilir; çağrılar x2 hasar aldığı için Doom çağrılara ağır gelir. Çağrı ölünce Ill Omen çalışır (alamet geçer).
- **Opportunist (Cutthroat):** liste wound/slow/stun + **wither** (Ö7 kararı); Omen listeye girmez.

---

## 4. Skill'ler

Hepsi `scale: luck`, `damageType: magic`, `element: dark`, `motion: cast` (uzak, ön sıra kısıtı yok). MP havuzu 44, yenilenme 2/tur.

### 4.1 Tablo

| # | id | Ad | Hedef | Alan | MP | CD | İlk CD | Güç (luck x) | Etkiler |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `evil_eye` | **Evil Eye** | single_enemy | - | 0 | 0 | 0 | **0,9** (12,6) | +1 Omen (kritik: +2) |
| 2 | `withering_curse` | **Withering Curse** | area_enemies | rect 2x3, stages row | 10 | 3 | 0 | **0,5** (7,0) her hedef | Wither 3 tur (0,2/tur) + 1 Omen (kritik: +2) her vurulana |
| 3 | `jinx` | **Jinx** | single_enemy | - | 6 | 3 | 0 | **0,5** (7,0) | Jinxed 2 tur + 1 Omen (kritik: +2) |
| 4 | `doom_mark` | **Doom Mark** | single_enemy | - | 14 | 4 | **2** | **1,0** (14) + Doom x1,5 | +1 Omen (kritik: +2), sonra yığın kaç olursa olsun Doom x1,5 |

Parantez içi: Luck 14 ile ham değer.

### 4.2 Ayrıntılar

**1) Evil Eye (`evil_eye`)**: ana saldırı, bedelsiz.
- Açıklama (İngilizce, skill-info taslağı): *"Fix a cursed stare on one enemy: 90% Luck dark magic damage and 1 Bad Omen (2 on a critical hit). At 3 Omens, Doom strikes."*
- AI: ipucu yok (ana saldırı, `damage` önceliği). Odak puanı Omen değerini içerir (bölüm 6).
- Neden eğlenceli/öğretici: oyuncuya sayacı öğretir; 2 Omen'li hedefe Evil Eye = garanti Doom ("bir lanet daha, bitti").
- Risk: bedelsiz + büyü → zırhlı hedeflere fazla verimli olabilir (Defender'a karşı ölç).

**2) Withering Curse (`withering_curse`)**: alan alameti + çürüme.
- Alan (Ö6 kararı): `rect` rows 2 x cols 3 (madde 226 kuralı: şerit ekseni 3 → tüm şeritler; sıra ekseni 2 → fare hücresi ekranda sol-alt, yani düşman tahtasında öndeki sıra). Nature's Wrath ile aynı şekil. **Aşamalı vuruş `stages: row`** (önden arkaya): çürüme sürünerek ilerler, Doom'lar sıra sıra patlar (okunurluk).
- Açıklama: *"A creeping rot spreads over a 2x3 block: 50% Luck dark magic damage, Withering for 3 turns (20% Luck per turn) and 1 Bad Omen on every enemy hit (2 on a critical hit)."*
- AI ipucu: `requires: { minTargets: 2 }`.
- Neden eğlenceli: tek hamlede birçok hedefe 1 Omen; sonra Evil Eye'larla "hangisini önce bitireyim" kararı. Doom zincirleri (2'şer Omen'li ön sırada) çok tatmin edici.
- Risk: iki Hexer + Withering Curse → toplu Doom patlaması (bölüm 11).

**3) Jinx (`jinx`)**: tehdidi sustur.
- Açıklama: *"Tie a cursed knot around one enemy: 50% Luck dark magic damage, 1 Bad Omen (2 on a critical hit) and Jinxed: -20% accuracy and no critical hits on its next attack (lasts up to 2 turns)."*
- AI ipucu: `anyOf: [{ kill: true }, { minStatusMitigation: 6 }]` (yeni koşul: Smoke Bomb'un `statusMitigation` değerinin genelleşmesi; Jinxed ile önlenen beklenen hasar en az 6). Hedef: en tehlikeli vurucu (Mage, Archer, Gambler, Warrior).
- Neden eğlenceli: savunma kararı ama hasar da verir ve Omen ekler (support değil, "saldırgan savunma").
- **Kritik Doom (Ö15):** Jinx vuruşu kritikse (+2 Omen) ve yığını 3'e tamamlayıp otomatik Doom tetiklerse o Doom **kesin kritik** (kendi kritik zarı atılmaz). Veri: Jinx'in omen etkisinde `critDoomOnCrit: true`; başka skill'lerin kritik Omen'i bu kuraldan etkilenmez. Önizleme `doomOnCrit.sureCrit`, olay `doom.sureCrit`.
- Risk: All In/Backstab gibi tek büyük vuruşu boşa çıkarması çok güçlü hissettirebilir. Backstab `guaranteedCrit`: **Jinx garantili kritiği BOZMAZ**, yalnızca isabet düşer (Ö5 kararı).

**4) Doom Mark (`doom_mark`)**: 4. yuva, ultimate.
- Akış: isabet zarı → vuruş (luck x 1,0) → +1 Omen (kritikse +2) → yığın 3'ü bulsa da bulmasa da **Doom x1,5** tetiklenir, yığın 0 (Doom Mark'ın kendi Omen'i dahil hepsi harcanır). **Ö14:** vuruş ya da patlama hedefi öldürürse Ill Omen çalışmaz (Omen başka düşmana geçmez). (3'e ulaşan otomatik Doom ayrıca patlamaz: çift patlama yok.) İska ederse hiçbir şey olmaz (Omen'ler ve sayaçları yerinde kalır). Patlatma yığını ve sayacı sıfırlar.
- Değer tablosu (Luck 14, ham, kritiksiz):

  | Hedefteki Omen (önce) | Vuruş | Doom (Omen sonra x 8,4 x 1,5) | Toplam |
  |---|---|---|---|
  | 0 | 14 | 1 x 12,6 = 12,6 | **26,6** |
  | 1 | 14 | 2 x 12,6 = 25,2 | **39,2** |
  | 2 | 14 | 3 x 12,6 = 37,8 | **51,8** |

- Açıklama: *"Brand one enemy with the seal of doom: 100% Luck dark magic damage, adds 1 Bad Omen (2 on a critical hit), then Doom strikes at once with every Omen on it, 50% stronger."*
- MP 14, cooldown 4, **initialCooldown 2** (üst sınır 3'e uyar): ilk iki turda alamet biriktirilir, üçüncü turda ultimate hazır → doğal ritim.
- AI ipucu: `reserveMp: 2` (madde 258: anyOf koşulu silindi; seçim terazide, Hard'da 2 Omen'siz Doom Mark'a `patience` bedeli).
- Neden 4. yuva: oyunun tüm mekaniğini (birikim → patlatma) tek tuşta zirveye çıkarır; "ultimate hissi" büyük mühür + ekranı karartan Doom anı. Erken basmak (0 Omen) cezalı değil ama verimsiz (26,6 ≈ iki Evil Eye): oyuncuya "bekle" öğretir.
- Risk: 2 Omen'li kırılgan hedefe (Mage/Archer 38-56 can) tek atış öldürme. Kasıtlı; ama Withering Curse'ün kritikleri 2 Omen'i kolay ürettiği için sık olursa güç 1,0 → 0,8 düşürülür.

---

## 5. Pasif: Ill Omen

- **Ad / id:** **Ill Omen** / `ill_omen`; yeni pasif türü **`omenTransfer`**.
- **Kural:** Omen taşıyan bir düşman ölünce, alametleri **en yakın canlı düşmana** geçer.
  - Doom DIŞI bir nedenle ölürse (lanet vuruşu, Wither tiki, başka bir dostun saldırısı, zemin): **tüm yığın** geçer.
  - Doom ile ölürse (yığın zaten tüketildi): **1 Omen** geçer ("kıyamet yankılanır"). Yalnızca otomatik Doom (3. Omen) ve süre bitimi Doom'u için.
  - **Doom Mark ile ölürse (Ö14):** Doom Mark'ın vuruşu YA DA patlaması hedefi öldürürse Ill Omen **çalışmaz**: hiç Omen geçmez, hedefin yığını silinir (veri: `detonate.noTransferOnKill: true`; olay `statusEnd { cause: 'erased' }` vuruş ölümünde).
  - Varışta yığın en fazla **2** olur (`maxOnArrival: 2`): **geçiş asla Doom tetiklemez** → zincirleme/sonsuz döngü imkânsız.
  - **Süre (Ö2 ile uyum, ÖNERİ):** geçen Omen'ler alıcıda yeni 3 tur başlatmaz, ölenin **kalan süresini** taşır (en az 1). Alıcıda zaten Omen varsa toplanır (yine 2'de kesilir) ve **alıcının kendi sayacı** korunur (uzamaz). Gerekçe: "en fazla 3 tur" kuralı geçişle delinmez, Omen'ler ölüm zincirinde uzayıp gitmez; süre dolunca alıcıda Doom olarak patlar. Snapshot (Luck/kritik) da Omen'le birlikte geçer.
- **"En yakın" tanımı (deterministik):** ölenin tahtasında, ekran ızgarasında (`formation.screenGrid`) Manhattan uzaklığı en küçük canlı birim; eşitlikte önce aynı sıra, sonra küçük yuva numarası. Çağrılar da alıcı olabilir.
- **Sahip şartı:** Pasif, Omen'i bırakan Hexer canlıysa çalışır (sahip yığının kaynağı: son Omen'i ekleyen Hexer). Hexer ölmüşse alamet geçmez (bu pasifin şartı; canlı hedeflerdeki lanetler ise Ö3 gereği sürer ve süre bitiminde patlar).
- **Taunt:** etkilemez (hedef seçimi değil).
- **Olay:** `omenTransfer { source (Hexer), from, to, stacks, after }` + `passive` "Ill Omen".
- **Veri:** `{ "type": "omenTransfer", "status": "omen", "maxOnArrival": 2, "onDoomKill": 1 }`.
- Neden: "yatırım boşa gitmesin" hissi (Ö2 ile süre bitimi de artık Doom'a döndüğü için Ill Omen yalnızca ölüm durumunu kapatır); Hexer'in öldürme sonrası da değer üretmesi; alan oyununu teşvik eder.

---

## 6. AI profili: `hexer`

```json
"hexer": {
  "priorities": ["kill", "tactic", "aoe", "damage"],
  "focus": "lowest_ratio",
  "aoeMinTargets": 3,
  "healBelowRatio": 0,
  "shieldBelowRatio": 0,
  "maxSummons": 0,
  "mpCostWeight": 0.4,
  "hpCostWeight": 1,
  "minHpRatioForHpCost": 0.5,
  "omenValueShare": 0.85
}
```

- **kill:** Doom dahil beklenen hasar hedefi öldürüyorsa (en ucuz öldürücü; Evil Eye 2 Omen'li yaralı hedefe genelde kazanır).
- **tactic:** ipucu sağlanan skill'ler: Doom Mark (2+ Omen ya da kill), Jinx (önlenen hasar ≥ 6), Withering Curse (≥ 2 hedef).
- **aoe:** Withering Curse 3+ düşmana değiyorsa (tactic zaten 2'de yakalar; aoe yedek).
- **damage:** Evil Eye. **Odak:** yapay ağırlık YOK; aday puanına **Omen değeri** eklenir:
  - Hamle yığını 3'e tamamlıyorsa: Doom'un beklenen hasarı **anında** sayılır (`doom N`).
  - Tamamlamıyorsa: eklenen her Omen = `luck x 0,6 x omenValueShare (0,85)` ertelenmiş değer (`omenValue N`). **Gerekçe (Ö2 sonrası):** Omen artık süre dolunca da patladığı için kaybolma riski düşük (yalnızca hedef başka nedenle ölürse ve Ill Omen çalışmazsa); 0,85 kalan iskontoyu temsil eder: hasar 1-3 tur gecikir (rakip o arada oynar), hedef zaten ölecekse fazla hasar (overkill) olur. Eski 0,6 "süre bitince kaybolur" varsayımına dayanıyordu. Böylece AI doğal olarak işaretli hedefe odaklanır ama 1 Omen için kırılgan bir hedefin öldürülmesini atlamaz.
- **Doom Mark'ı erken patlatmama:** ipucu yalnızca `kill` ya da `≥2 Omen` hedefte açılır. Ek kural: hedefin Omen'i 2'yse ve Evil Eye ile otomatik Doom ZATEN öldürüyorsa kill önceliği ucuz olanı (Evil Eye) seçer (mevcut "en ucuz öldürücü" kuralı). Hedef bu turdan önce ölecekmiş gibi görünüyorsa (dostlar vuracak) bunu öngörmez (AI tek hamle bakar).
- **Maç kaydı anahtarları (explainChoice):** aday satırında `omens 1->2 omenValue 5.0`, `omens 2->3 DOOM 25.2@crit 0.12`, sayaçta `omen timer 2`, Doom Mark'ta `detonate 3 omen x1.5 = 37.8`, Jinx'te `mitigation N (jinxed: acc -20%, crit 0)`, blocked notunda `minTargetStacks omen 2 (has 1)`, `minStatusMitigation 6 (got 3.1)`. `result` satırları: `+omen 2 (crit) [2/3]`, `DOOM on P1:Warrior 27 (3 omens x1.5)`, `Ill Omen: 2 omens pass P2 -> P4 [2/3]`, `wither tick 3`, süre bitiminde `DOOM (omens expired) on P1:Warrior 17 (2 omens x1)`.
- **AI test senaryoları:** (1) 2 Omen'li hedef + Doom Mark hazır → Doom Mark seçilir; 0 Omen'li hedefte seçilmez (kill hariç). (2) 2 Omen'li yaralı hedef, Evil Eye ile otomatik Doom öldürüyor → Evil Eye (bedelsiz) seçilir. (3) Ön sırada 2+ düşman → Withering Curse; tek düşman → seçilmez. (4) Rakipte Mage (Fire Bolt 2,25) var → Jinx Mage'e; rakip yalnızca düşük hasarlı tank → Jinx seçilmez. (5) Taunt'lı Defender → tek hedefli skill'ler Defender'a, Withering Curse alanı serbest. (6) İki modda determinizm (aynı seed aynı karar).

---

## 7. Motor ihtiyaçları (engine-dev iş listesi)

### 7.1 Yeni veri alanları ve türleri

| # | İş | Ayrıntı | Boyut |
|---|---|---|---|
| E1 | `Status.stacks` + yığılan durum | `StatusDef.maxStacks` (omen 3), `refreshOnStack` (Ö2'de false idi; Ö13 ile true: yeni yığın süreyi tam süreye yeniler); `addStatus` yığını toplar; Resilience zarı yalnızca ilk eklemede; yığına snapshot (`sourceLuck`, `sourceCrit`, son ekleyen `source`); `status` olayına `stacks` | M |
| E2 | Skill etkisi `omen` | `{ type: 'omen', stacks: 1, critStacks: 2 }`: isabet eden vuruştan sonra ekler (kritikse critStacks); aşamalı alanda hedef başına | S |
| E3 | Doom | `StatusDef.doom { scale, powerPerStack, damageType, element, expireMult }`; (a) yığın maxStacks'e ulaşınca anında: kritik zarı (kaynak), isabet YOK, guard/kalkan/Lucky Escape normal; (b) `burstOnExpire: true`: süre dolunca (taşıyanın tur başı, Wither tikinden sonra) yığın sayısı x `expireMult` (1), snapshot Luck/kritik, guard YOK, `origin: 'status'`; olay `doom` (`cause`: complete / expire / detonate) | M |
| E4 | Skill etkisi `detonate` | `{ type: 'detonate', status: 'omen', mult: 1.5 }` (Doom Mark): yığın ≥1 ise Doom'u çarpanla tetikler; aynı eylemde otomatik Doom'la çift patlama yok (önce omen etkisi ekler, detonate varsa otomatik tetik bastırılır) | S |
| E5 | Skill etkisi `dot` + durum `wither` | `hot`'un aynası: `{ type: 'dot', status: 'wither', scale: 'luck', power: 0.2, turns: 3 }`; miktar uygulama anında sabit, tur başı (zeminden sonra) büyü hasarı, `groundTickDamage` benzeri (zırh, zayıflık), isabet/kritik yok, `origin: 'status'` | M |
| E6 | `critDelta` + `critDeltaPerStack` | `StatusDef` (Jinxed -1, Omen -0,03/yığın); `battle.effectiveStats` uygular (accuracyDelta gibi), kritik [0,1] | S |
| E7 | `endsOnOwnAttack` | Jinxed: taşıyanın bir sonraki hasar skill'inin tüm vuruşlarından SONRA düşer; olay `statusEnd` (`consumed: true`) | S |
| E8 | Pasif `omenTransfer` | Ölüm anında (`announceIfDead` / `death`), en yakın canlı düşman (screenGrid Manhattan), `maxOnArrival`, `onDoomKill`; geçen Omen ölenin kalan süresini (en az 1) ve snapshot'ını taşır, alıcıda Omen varsa alıcının sayacı korunur; olay `omenTransfer` + `passive` | M |
| E9 | AI koşulları | `minTargetStacks { status, count }`, `minStatusMitigation` (statusMitigation'ı critDelta/accuracyDelta için genelle), profil `omenValueShare`, aday değerine Doom/omenValue | M |
| E10 | Önizleme (`preview.ts`) | Hedefte: anlık hasar + `omens a->b` + tetiklenecekse Doom aralığı (min/max/avg, kritik ayrı); Doom Mark'ta detonate değeri; Withering Curse hücre başına | M |
| E11 | skill-info / stat-info | Omen, Doom, Wither, Jinxed, Misfortune metinleri veriden; CRIT satırı effectiveStats ile Misfortune'u gösterir | S |
| E12 | Match-log + explainChoice | 6. bölümdeki anahtarlar; ROSTER skill satırında `omen(+1, crit +2)`, `dot(luck 0.2 x3)`, `detonate(x1.5)` | S |
| E13 | Content doğrulama | yeni etki türleri şema testi; `damage-scale-rule` `dot`/`detonate`/Doom'u ölçekli say; `cooldown.maxInitial` | S |
| E15 | Opportunist (Ö7) | Cutthroat pasifinin `bonusVsStatus` listesine `wither` (Omen değil); wiki/tooltip metni | S |
| E14 | Class kaydı | `data/classes/hexer.json`, `random-battle.json > pool` (11. class), `content.ts`; sprite yoksa placeholder (`PLACEHOLDER_SPRITE_CLASSES`) | S |

### 7.2 Olay şemaları (öneri)

```ts
// Yığın değişimi (UI floating text '+1 Omen', rozet güncelleme)
| { type: 'omen'; source: string; target: string; delta: number; stacks: number; max: number; crit?: boolean; cause: 'skill' | 'transfer' }
// Doom patlaması (ardından normal 'damage' olayı gelir: origin 'status', status 'omen', element 'dark')
| { type: 'doom'; source: string; target: string; omens: number; mult: number; cause: 'complete' | 'expire' | 'detonate'; skill?: string /* doom_mark ise */ }
// Ill Omen geçişi
| { type: 'omenTransfer'; source: string; from: string; to: string; stacks: number; after: number }
// Mevcut 'damage' olayına ek alan: status?: StatusKind  (origin 'status' iken hangi durumdan: 'wither' | 'omen')
```

`status` olayı Omen için de gelir (`status: 'omen', turns: 3, stacks: n`), rozet sistemi değişmeden çalışsın. "Curse applied" ayrı olay **gerekmez**: `omen` olayı bu bilgiyi taşır.

### 7.3 Hit/crit hesabındaki değişiklik

`effectiveStats(c).critChance = clamp(base + Σ critDelta + Σ critDeltaPerStack x stacks, 0, 1)`. Gerçek vuruş, önizleme, AI aynı fonksiyondan (Blinded/Shrouded ile aynı yol). `guaranteedCrit` bu değeri okumaz (Backstab Jinx'e rağmen kritik).

### 7.4 Wiki (Mechanics) makaleleri

Yeni makale **"Curses: Omen, Doom, Withering"** (taslak bölüm 8.6), "Statuses" listesine Jinxed, "Passives"e Ill Omen; `tests/wiki.test.ts` kapsamı.

### 7.5 Test planı (`tests/hexer.test.ts`)

1. Class şeması: toplam 30, luck primary en yüksek, Lucky Escape aktif, türetilmiş değerler (56/44/8/%94/%12).
2. Omen: +1, kritikte +2 (debug crit always), iskada 0, üst sınır 3; süre ilk Omen'le başlar ve yeni Omen süreyi **yeniler** (Ö13: 1. tur 1 Omen, 2. tur +1: süre bitimi son Omen'den 3 tur sonra); Resilience zarı yalnızca ilk eklemede (3→2).
2b. Süre bitimi (Ö2): 1 ve 2 Omen'le süre dolunca Doom = luck x 0,6 x Omen sayısı (x1), taşıyanın tur başında, zemin ve Wither tikinden sonra, regen'den önce; snapshot Luck (son ekleyen Hexer; Hexer öldükten sonra da), kritik zarı snapshot kritikle; guard yok, kalkan/Lucky Escape var; tikte ölen taşıyanda patlamaz (Ill Omen tüm yığını geçirir); patlamadan sonra yığın/sayaç sıfır; iki Hexer'li yığında son ekleyenin snapshot'ı.
3. Doom: 3'te anında otomatik (Ö1), hasar = luck x 0,6 x 3, isabet zarı yok (debug dodge always yine vurur), kritik zarı, büyü zırhı/kalkan, guard paylaşımı, Lucky Escape.
4. Doom Mark: 0/1/2 Omen değer tablosu, x1,5, çift patlama yok, iskada yığın korunur, initialCooldown 2.
5. Wither: tik zamanı ve miktarı (snapshot), zırh, isabet/kritik yok, yenileme kuralı (büyük kalır), Hexer ölse de sürer (Ö3), tikte ölüm → Ill Omen; Opportunist Wither'lı hedefe bonus verir, yalnız Omen'li hedefe vermez (Ö7).
6. Misfortune: Omen başına -%3 kritik, 0 altına inmez, effectiveStats = önizleme = gerçek.
7. Jinxed: acc -0,2, kritik 0, sonraki hasar skill'inden sonra düşer (çok vuruşlu skill'in tüm vuruşları etkilenir), guaranteedCrit istisnası (Backstab Jinx'e rağmen kritik: Ö5).
8. Ill Omen: tüm yığın / Doom ile 1 / varışta en fazla 2 (Doom yok, zincir yok) / en yakın seçimi deterministik / Hexer ölüyse yok / geçen Omen kalan süreyi taşır, alıcının mevcut sayacı uzamaz.
8b. İki Hexer (Ö8): ikisi aynı yığını doldurur; 3'ü tamamlayanın Luck'ı; süre bitiminde son ekleyenin snapshot'ı.
9. Withering Curse: rect 2x3 hücreleri (madde 226), aşamalar, aşama içinde Doom sırası.
10. AI senaryoları (bölüm 6), maç kaydı anahtarları, iki modda determinizm, önizleme = gerçek.
11. Wiki/galeri kapsamı (ikon, vfx, sfx, sprite placeholder).

**Tahmini iş yükü:** engine **L** (E1-E9 yeni durum altyapısı: yığın + DoT + pasif), UI **M**, content **M**, balans **M**. Toplam: büyük bir class (Cutthroat'tan biraz büyük; DoT, yığın ve süre bitimi patlaması ilk kez geliyor ama sonraki class'lara da yarar).

---

## 8. Arayüz ihtiyaçları (ui-dev)

1. **Omen göstergesi:** birim can çubuğunun SOL ucunda 3 küçük mühür yuvası (8x8 piksel, boş = sönük kemik rengi kontur; dolu = eflatun mühür + çürük yeşili iç ışık). 3. dolunca mühürler çatlar → Doom animasyonu. Durum rozet satırında ayrıca tek Omen rozeti + sayı ("x2").
2. **Misfortune:** ayrı rozet YOK; Omen rozetinin tooltip'inde satır. Stat bloğunda CRIT değeri kırmızı aşağı okla (Blinded/Shrouded okları gibi, `effectiveStats`).
3. **Wither rozeti** (çürüyen yaprak değil, **çürüyen kara mum** ikonu) + kalan tur; **Jinxed rozeti** (kırmızı iplik düğümü).
4. **Hover önizleme:** hedefin üstünde mevcut hasar satırının altına `Omen x2 -> x3  DOOM 25-31` (Doom tetiklenecekse altın-mor vurgulu, "Doom next" yerine kesin "DOOM"), tetiklenmeyecekse `Omen x1 -> x2 (Doom at 3, bursts in 2 turns)`. Omen göstergesinde kalan tur sayısı (küçük rakam) da görünür: süre dolunca patlayacağı okunabilmeli. Doom Mark'ta `Detonates 3 Omens x1.5: 34-42`. Withering Curse'te hücre başına aynı satır.
5. **Floating text** (`float-text.ts`): `+1 Omen` (eflatun, küçük), kritikte `+2 Omen!`; Doom'da büyük `DOOM` (kemik beyazı, mor kontur, 1,2x boy) ve altında hasar rakamı; Wither tiki küçük koyu yeşil rakam + mum ikonu; Ill Omen geçişinde alıcıda `Omen x2 (Ill Omen)`.
6. **Tooltip metinleri (İngilizce taslak):**
   - Omen: *"Bad Omen (x2/3): at 3 Omens, Doom strikes for heavy dark damage. Misfortune: crit chance -6%. After 3 turns, the Omens burst into Doom (2 turns left)."*
   - Withering: *"Withering: takes 3 dark damage at the start of each of its turns (2 turns left)."*
   - Jinxed: *"Jinxed: -20% accuracy and no critical hits on its next attack."*
   - Ill Omen (pasif): *"When a cursed enemy dies, its Omens pass to the nearest enemy (at most 2; Doom passes 1). Passed Omens never trigger Doom."*
   - Lucky Escape: mevcut metin.
7. **Wiki Mechanics makalesi taslağı ("Curses"):**
   > *Some attacks leave a Bad Omen on their target. Omens stack up to 3; a critical curse leaves two. The first Omen starts a 3-turn timer that new Omens do not renew. Each Omen lowers the target's critical chance (Misfortune). When the third Omen lands, Doom strikes at once: unavoidable dark magic damage based on the curser's Luck for every Omen, then the Omens are spent. After 3 turns, the Omens burst into Doom at the start of the target's turn, one share per Omen. A curse outlives its caster. Withering deals dark damage at the start of the target's turns; it cannot miss or crit and ignores Guard. Jinxed spoils the target's next attack.*
8. **Takım seçimi:** LUCK grubunda (zümrüt şerit) Gambler'ın yanında; kart rengi class rengi.

---

## 9. Görsel-işitsel brief (content-designer)

### 9.1 Aile rengi

| Rol | Renk | Not |
|---|---|---|
| Class rengi (`color`) | **#6a2f5f** (koyu erik/patlıcan, kırmızıya yakın mor) | Anti-Mage #9b59d0 (açık ametist) ve Cutthroat #5b4a6b (gri leylak) ile karışmaz |
| Lanet ışığı | **#b04fa8** (eflatun-fuşya) | Undead Wail #b36bff (mavi-mor) değil |
| Çürük yeşili | **#9cab3c** (safra/zeytin sarı-yeşil) | Zehir zemini #6fcf4b (canlı yeşil) değil |
| Kemik beyazı | **#e9dfc4** | vurgu, mühür kenarları |
| Kandil alevi | **#d9a441** (kirli kehribar, az kullan) | yalnızca kara mum |
| `fx` | `#b04fa8` | skill renkleri |

Kafatası motifi KULLANILMAZ (Undead'in), yonca yalnızca "solmuş/çatlak" (Gambler'ın canlı yoncasıyla zıtlık).

### 9.2 İkonlar (64x64 piksel art, `pixel-art.ts`)

| İkon id | Ne | Fikir |
|---|---|---|
| `hexerlogo` | Class logosu | Kara mumlu demir kandil, önünde asılı üç kemik pul; pullardan biri çatlak |
| `illomen` | Pasif | Çatlak bir tılsım pulundan yandaki ikinci pula akan eflatun duman ipliği |
| `evileye` | Evil Eye | Kemik pul üstüne oyulmuş tek göz (nazar), göz bebeği eflatun ışık, kenarda yeşil çürük halkası (göz insan gözü, hayvan değil) |
| `witheringcurse` | Withering Curse | Yere düşmüş, ucu kararan kara mumdan çevreye sızan sarı-yeşil çürük damarları |
| `jinx` | Jinx | Kırmızı ipliğin üç kez düğümlendiği "cadı düğümü", ortasında çatlak seramik boncuk |
| `doommark` | Doom Mark | Kemik beyazı halka içinde kırık mühür (yedi köşeli rün), çatlaktan sızan mor ışık |
| `omen` (durum) | Omen rozeti | Küçük eflatun mühür pulu (yığın sayısı UI'da) |
| `wither` (durum) | Withering rozeti | Eğilmiş, eriyen kara mum |
| `jinxed` (durum) | Jinxed rozeti | Kırmızı iplik düğümü (küçük) |
| `misfortune` (yalnızca tooltip/wiki) | Misfortune | Solmuş, çatlak, gri-yeşil üç yapraklı yonca |
| `doom` (float text yanı) | Doom | Ortadan ikiye çatlamış seramik tılsım |

### 9.3 Animasyonlar (`vfx.ts`; caster yerinde kalır, hepsi ~1,2-1,8 sn x `skillSlowdown`)

**Evil Eye (`evileye`, ~1,2 sn):** (1) 0-0,35 sn: Hexer asayı kaldırır, asadaki kemik pullar sallanır, asanın ucunda eflatun göz şekli açılır (8x5 piksel göz, kirpiksiz). (2) 0,35-0,7: gözden hedefe ince, titreyen eflatun ışın değil **bakış hattı**: yerde sürünen sönük duman çizgisi + havada kesik kesik parıltı. (3) 0,7: hedefin göğsünde aynı göz bir an belirir ve kapanır (vuruş, hasar rakamı). (4) 0,7-1,2: hedefin başı üstünde mühür yuvasına yeni pul "pıt" diye oturur (+1 Omen yazısı). Kritikte iki pul art arda.

**Withering Curse (`witheringcurse`, ~1,7 sn, stages row):** (1) 0-0,4: Hexer kara kandili yere bırakır gibi eğer; kandilden yere is ve sarı-yeşil sıvı damlar. (2) 0,4-0,9: çürük damarları zemin boyunca **ön sıra hücrelerine** sürünür (hücre şekline oturan birleşik plaka, `cellQuad`); hücrede çimen/taş grileşir, küçük kara mum alevleri yerden fışkırıp söner → 1. aşama hasarı + Omen. (3) 0,9-1,4: damarlar arka sıraya yayılır → 2. aşama. (4) 1,4-1,7: vurulanların ayaklarından yukarı ince yeşil-gri buhar (Wither rozeti). Zemin izi kalmaz (zemin etkisi değil): 0,5 sn'de solar.

**Jinx (`jinx`, ~1,3 sn):** (1) Hexer iki eli arasında kırmızı ipliği gerer (iplik 1 piksel kırmızı çizgi, ortada seramik boncuk). (2) İpliği hedefe fırlatır: iplik havada dalgalanarak uçar. (3) Hedefin bileğine/silahına üç tur sarılır, sıkı bir düğüm atılır, boncuk "tık" diye çatlar (vuruş). (4) Düğüm hedefin üstünde küçük rozet olarak kalır.

**Doom Mark (`doommark`, ~1,8 sn; ultimate):** (1) 0-0,5: Hexer asasını yere vurur, ayağının altında kemik beyazı yedi köşeli rün çemberi parlar, kandil alevi kararır (ekran %15 kararır). (2) 0,5-0,9: hedefin altında aynı mühür belirir, hedefteki Omen pulları mühre doğru çekilir. (3) 0,9: mühür ortasından **çatlar** (seramik kırılma kıymıkları), hedefin üstünden aşağı ince mor-siyah ışık sütunu iner (Radiance'ın yumuşak sütun dilinin karanlık eşi): vuruş hasarı, sonra **DOOM** yazısı + büyük rakam. (4) 0,9-1,4: sütun içinde Omen pulları tek tek patlar (her biri küçük kıymık + yeşil toz), kısa sarsıntı. (5) 1,4-1,8: karanlık çekilir, zeminde çatlak mühür izi 0,6 sn kalıp solar.

**Doom (otomatik, `doomburst`, ~0,8 sn, herhangi bir lanetin sonunda):** Doom Mark'ın (3)-(4) adımlarının kısa hâli: hedefin üç mühür pulu birbirine yapışıp çatlar, kısa mor-siyah sütun, `DOOM`.

**Ill Omen (`omentransfer`, ~0,7 sn):** ölen birimin yerinden yükselen eflatun duman ipliği, kavis çizerek alıcıya gider, alıcının mühür yuvalarına pul olarak oturur.

**Wither tiki:** taşıyanın turunun başında ayak altında 0,4 sn yeşil-gri buhar puf'u.

### 9.4 Sesler (`data/audio.json`; filtreli gürültü + alçak darbe + gerekirse `voice`; ÇAN/çınlama YOK)

| id | Gerçek karşılığı | Kullanım |
|---|---|---|
| `hexWhisper` | Kapalı ağızla hızlı fısıltı (formantlı nefes, "sss-hhh", alçak geçiren filtre) | Evil Eye, Doom Mark başı |
| `boneCharmRattle` | Asadaki kuru kemik pulların birbirine çarpması (kısa, kuru tıkırtılar, 2-4 kHz bant gürültü darbeleri) | Evil Eye, Jinx |
| `candleGutter` | Mum alevinin sönerken "pof" ve fitil cızırtısı | Withering Curse başı, Wither tiki (kısık) |
| `rotSeep` | Islak toprağa sızan sıvı, yavaş köpürme (düşük geçiren gürültü + yavaş genlik dalgası) | Withering Curse yayılma |
| `threadCinch` | Gerilen iplik gıcırtısı + düğümün sıkı "tık"ı | Jinx |
| `ceramicCrack` | Pişmiş toprak tılsımın çatlaması (kısa yüksek kıymık + düşük gövde) | Jinx boncuğu, Doom pulları |
| `doomThud` | Alçak, boğuk göğüs darbesi (60-90 Hz) + toz | Doom / Doom Mark vuruşu |
| `doomBreath` | Derin, yavaş insan nefesi tersine (içe çekiş), koro DEĞİL | Doom Mark karartma anı |

Skill → ses: Evil Eye `hexWhisper + boneCharmRattle`; Withering Curse `candleGutter + rotSeep`; Jinx `threadCinch + ceramicCrack`; Doom Mark `doomBreath + hexWhisper + ceramicCrack + doomThud`; otomatik Doom `ceramicCrack + doomThud`. Ölçüm: tepe 0,25-0,88, kırpma yok; Ömer kulakla onaylar.

---

## 10. Karakter görseli brief'i (ChatGPT, İngilizce)

```
STYLE
Detailed high-resolution pixel-art look, same style as the existing character set: crisp pixel clusters, thick dark outline around the whole silhouette, soft cel shading with 3-4 tones per material, no blur, no anti-aliased painterly edges. Transparent background. Canvas 1254x1254 px, character centered with a small margin, feet near the bottom edge.

POSE AND FRAMING
Full body, standing, three-quarter view facing RIGHT. Weight on the back leg, one hand raising a crooked staff slightly forward, the other hand open at hip height with fingers curled as if casting a curse. Face clearly visible and large enough to be cropped as a head avatar: hood pushed back off the forehead, no shadow covering the eyes.

CHARACTER
A medieval hexer (village curse-caster), human, middle-aged woman with a gaunt, sharp face, pale skin, dark circles under intense pale-green eyes, thin knowing smile, long dark hair with a few grey streaks escaping the hood. Lean, slightly stooped posture. Fragile but menacing, not a monster, not undead.

OUTFIT
Layered aubergine-purple wool robe (deep plum, #6a2f5f family) with a frayed, mud-darkened hem; a worn bone-white linen underdress; a short hooded mantle in faded black with tattered edges; a wide leather belt with small pouches; cloth wraps on the forearms. Several cords around the neck hung with carved bone discs, cracked clay talismans and knotted red threads. Simple worn leather shoes. Clothing looks handmade and old.

PROPS
A short crooked blackthorn staff (dark wood, knotty), its top wrapped in red thread with carved bone discs and two small clay talismans dangling from it, a faint purple glow seeping from one cracked talisman. A small black iron lantern hanging from the belt holding a black candle with a dim amber flame and a thin trail of soot. No weapon blades.

COLOR PALETTE
Deep plum / aubergine purple, faded black, bone white, sickly olive-yellow green accents (glow in the eyes and on one talisman), dull leather browns, a single warm amber candle flame. Muted, earthy, medieval.

DO NOT include
Animals or animal parts of any kind (no crows, ravens, cats, toads, feathers, fur, horns, animal skulls), human skulls, skeletons, swords, daggers, bows, armor plates, modern items, text, logos, frames, background scenery, ground shadows larger than the feet, a second character, glowing runes covering the face.
```

Not: avatar kırpması yüz için yapılır; kapüşon geriye atılmış olmalı. Karakter KADIN (Ö9 kararı; brief aynen).

---

## 11. Balans notları

### 11.1 Beklenen hasar karşılaştırması (rakip büyü zırhı 0, kaçınma %0; Hexer isabet x kritik çarpanı = 0,94 x 1,06 ≈ 1,0)

| Skill | Bedel | Ham | Beklenen (anlık) | Ertelenmiş | Not |
|---|---|---|---|---|---|
| Hexer Evil Eye | 0 MP | 12,6 büyü | ~12,6 | +1,05 Omen ≈ +8,9 (Ö2 sonrası gerçekleşme ~%90 → ~8,0; eski varsayım ~%70 → ~6,2) | **~20,6 etkin** (eski ~18,8) |
| Gambler Loaded Dice | 0 MP | 20,4 x 1,25 fiziksel | zırh 9'da ~19,0 | - | |
| Cutthroat Venom Edge | 0 MP | 16,5 fiziksel | ~11-13 (+Hunter's Mark) | Wound | melee |
| Undead Bone Throw | 0 MP | 15,4 fiziksel | ~10 | Slow | (tarihî değer; 2026-10-10'dan beri büyü / dark, güç 0,90) |
| Mage Fire Bolt | 5 MP | 42,75 büyü | ~36 (isabet %82) | - | Hexer'den güçlü, MP harcar |
| Hexer Withering Curse | 10 MP | 7 / hedef | ~7 / hedef | Wither 8,4 + Omen ~8 → **~23 / hedef**, 2,5 hedefte ~58 (eski ~52) | Blizzard ~75 (14 MP) |
| Hexer Jinx | 6 MP | 7 | ~7 | Omen ~8 + önlenen hasar (Mage'e ~10-20) | |
| Hexer Doom Mark (2 Omen) | 14 MP | 51,8 | ~51,6 | - | Backstab ~72 fiziksel (koşullu), Aimed Shot ~37 |
| Otomatik Doom | - | 25,2 | ~26,7 | - | 3 Omen tüketir |
| Süre bitimi Doom (Ö2) | - | 8,4 / Omen | ~8,9 / Omen | - | 1-2 Omen'li her hedefte 3 tur sonra |

Tek hedef döngüsü (Evil Eye x3, kritiksiz): 3 x 12,6 + 25,2 = 63 / 3 tur ≈ **21/tur**; Doom Mark ile (Evil Eye, Evil Eye, Doom Mark): 12,6 + 12,6 + 51,8 = 77 / 3 tur ≈ **25,7/tur** (bedel 14 MP). Gambler ~19/tur, Mage ~36/tur ama MP ile sınırlı. Hedef: Hexer kazanma oranı %40-60.

**Ö2'nin balansa etkisi (GÜÇ ARTIŞI):** eskiden süresi dolan Omen'ler kaybolurdu; artık her Omen ya 3'te, ya Doom Mark'la, ya süre bitiminde patlar. Tek hedef döngüsü değişmez (zaten 3'e tamamlanıyordu); artış **yayılmış** Omen'lerde: Withering Curse'ün 1'er Omen bıraktığı 3-6 hedefin her biri 3 tur sonra ~8,4 Doom yer (6 hedefte ~50 ek hasar, ertelenmiş ve kaçınılmaz). Tahmini toplam artış Hexer hasarında ~%10-15 (sim ile ölçülecek). **Balans kolu:** `omen.doom.expireMult` (süre bitimi Doom çarpanı, varsayılan 1; ilk kol 0,75, sonra 0,5); son çare: Withering Curse Omen'i yalnızca kritikte bıraksın.

### 11.2 Olası kırılma noktaları

1. **Büyü zırhı 0 evreni:** Hexer zırhı yok sayar gibi vurur; Defender'a (158 can, 0 büyü zırhı) karşı fazla verimli olabilir. Kol: Defender'a +büyü zırhı DEĞİL, önce Hexer güçleri.
2. **Withering Curse kritikleri ve süre bitimi patlamaları:** %12 x 6 hedef → sık 2 Omen; ardından Doom Mark/Evil Eye çoklu Doom; ayrıca 3 tur sonra tüm alametli hedeflerde küçük Doom'lar (Ö2). Ölç: savaş başına ortalama Doom sayısı (hedef 2-4) ve süre bitimi Doom payı.
3. **İki Hexer aynı yığında (Ö8: doldururlar):** 11 class havuzunda 5'li takımda tekrar yok; 6+ takımda olabilir. Aşırıysa sim ile ölçülüp sayı kollarıyla ayarlanır; kural "aynı yığın" kalır.
4. **Jinx vs tek büyük vuruş:** All In / Aimed Shot'u boşa çıkarması. Ölç: Jinx kullanım oranı (<%40).
5. **Resilience:** STR class'larında Omen 2 tura iner (%35); Warrior/Defender'a karşı Hexer'in kazanma oranını ayrıca raporla.
6. **Taunt + Guard:** Defender taunt'ı tek hedefli lanetleri ona kilitler; Doom'un taunt'ı hasarla kırması iyi bir karşı oyun mu, fazla mı?
7. **Ill Omen kartopu:** maxOnArrival 2 zinciri engeller ama ölüm sonrası 2 Omen'li yeni hedef + Evil Eye = hızlı Doom. Ölç: Ill Omen kaynaklı Doom oranı.
8. **Kırılganlık:** can 56, zırh 4, hız 8 → Cutthroat Backstab ve Archer'ın Hunter's Mark'ı Hexer'i erken düşürür; Lucky Escape %30 tek sigorta.

### 11.3 Balans ajanı için kontrol listesi

- `npm run sim -- 20000` (Hexer havuzda): Hexer kazanma oranı **%40-60**, diğer class'lar sınır içinde kalmalı (özellikle Mage, Gambler, Defender).
- Skill kullanım oranları: hiçbiri tüm savaşların %40'ından fazlası değil; Evil Eye'ın ana saldırı olarak yüksek çıkması normal.
- Ek metrikler (sim raporuna yeni satırlar): savaş başına Omen uygulanan, Doom sayısı (3'te anında / süre bitimi / Doom Mark), Doom ortalama hasarı, süre bitimi Doom'unun toplam Hexer hasarındaki payı, ölümle boşa giden Omen (Ill Omen çalışmadığında), Ill Omen geçişi, Jinx'in önlediği beklenen hasar, Wither toplam hasarı.
- Senaryolar: (a) Hexer + Defender (taunt) vs rastgele; (b) Hexer vs Anti-Mage'li takım (büyü zırhı); (c) Hexer vs Cutthroat'lu takım (Smoke Bomb Blinded); (d) iki Hexer (6v6); (e) Hexer'siz referans (eski oranlar bozulmasın).
- Ayar kolları (sırayla): süre bitimi `expireMult` 1 → 0,75/0,5 (Ö2 kaynaklı artış için ilk kol); Doom `powerPerStack` 0,6 → 0,5/0,7; Evil Eye 0,9; Doom Mark vuruşu 1,0 ve `mult` 1,5; Withering Curse 0,5 ve Wither 0,2; Omen süresi 3; stat (Str 6 ↔ 7).

---

## 12. Uygulama sırası ve kararlar

### 12.1 Yol haritası

1. **engine-dev:** E1-E14 (yığın durum, omen/detonate/dot etkileri, Doom, critDelta, endsOnOwnAttack, omenTransfer, AI koşulları, önizleme, skill-info, match-log), `data/classes/hexer.json` + skills + statuses + ai profili (aşağıdaki taslaklar), placeholder ikon/vfx/ses (mevcut olanlardan ödünç: logo `skull` DEĞİL `rune`, vfx `bonethrow`/`wail`/`voidstrike`), `tests/hexer.test.ts`. Sağlık sim'i (çökme kontrolü).
2. **ui-dev:** Omen mühür göstergesi, rozetler, hover önizleme satırları, floating text, CRIT oku, wiki "Curses" makalesi, takım seçimi kartı.
3. **content-designer:** 11 ikon, 6 vfx (`evileye`, `witheringcurse`, `jinx`, `doommark`, `doomburst`, `omentransfer`), 8 ses; Wiki > Assets kapsamı.
4. **balance-tester:** bölüm 11.3.
5. **Sprite import:** ChatGPT görseli gelince `assets/sprites/hexer/idle.png` + avatar kırpması; `PLACEHOLDER_SPRITE_CLASSES` listesinden çıkar.

### 12.2 Taslak veri (DOKÜMAN İÇİ; gerçek dosyalara YAZILMADI)

**`data/classes/hexer.json`**
```json
{
  "id": "hexer",
  "name": "Hexer",
  "spriteId": "hexer",
  "color": "#6a2f5f",
  "logo": "hexerlogo",
  "role": "Curse Caster",
  "frontPriority": 6.5,
  "attributes": { "str": 6, "int": 7, "dex": 3, "luck": 14 },
  "primary": "luck",
  "armor": 4,
  "magicArmor": 0,
  "ai": "hexer",
  "skills": ["evil_eye", "withering_curse", "jinx", "doom_mark"],
  "passive": {
    "id": "ill_omen",
    "name": "Ill Omen",
    "icon": "illomen",
    "text": "When a cursed enemy dies, its Omens pass to the nearest enemy (at most 2; a Doom kill passes 1). Passed Omens never trigger Doom.",
    "effect": { "type": "omenTransfer", "status": "omen", "maxOnArrival": 2, "onDoomKill": 1 }
  }
}
```

**`data/skills.json` girdileri**
```json
{
  "evil_eye": {
    "_not": "Hexer ana saldırı (0 MP): nazar. Sayılar PROVİZYON.",
    "id": "evil_eye", "name": "Evil Eye", "icon": "evileye",
    "target": "single_enemy", "cost": { "resource": "mp", "amount": 0 },
    "motion": "cast", "fx": "#b04fa8",
    "effects": [
      { "type": "damage", "damageType": "magic", "element": "dark", "scale": "luck", "power": 0.9 },
      { "type": "omen", "stacks": 1, "critStacks": 2 }
    ],
    "vfx": "evileye", "sfx": ["hexWhisper", "boneCharmRattle"]
  },
  "withering_curse": {
    "_not": "Hexer alan laneti: 2x3 (Nature's Wrath şekli), önden arkaya aşamalı. Sayılar PROVİZYON.",
    "id": "withering_curse", "name": "Withering Curse", "icon": "witheringcurse",
    "target": "area_enemies",
    "area": { "shape": "rect", "rows": 2, "cols": 3, "anchor": "bottom_left", "stages": "row" },
    "cost": { "resource": "mp", "amount": 10 }, "cooldown": 3,
    "motion": "cast", "fx": "#9cab3c",
    "effects": [
      { "type": "damage", "damageType": "magic", "element": "dark", "scale": "luck", "power": 0.5 },
      { "type": "dot", "status": "wither", "scale": "luck", "power": 0.2, "turns": 3 },
      { "type": "omen", "stacks": 1, "critStacks": 2 }
    ],
    "ai": { "requires": { "minTargets": 2 } },
    "vfx": "witheringcurse", "sfx": ["candleGutter", "rotSeep"]
  },
  "jinx": {
    "_not": "Hexer: uğursuzluk düğümü; hedefin sonraki saldırısı -%20 isabet, kritik yok. Sayılar PROVİZYON.",
    "id": "jinx", "name": "Jinx", "icon": "jinx",
    "target": "single_enemy", "cost": { "resource": "mp", "amount": 6 }, "cooldown": 3,
    "motion": "cast", "fx": "#c0203a",
    "effects": [
      { "type": "damage", "damageType": "magic", "element": "dark", "scale": "luck", "power": 0.5 },
      { "type": "status", "status": "jinxed", "turns": 2 },
      { "type": "omen", "stacks": 1, "critStacks": 2 }
    ],
    "ai": { "anyOf": [{ "kill": true }, { "minStatusMitigation": 6 }] },
    "vfx": "jinx", "sfx": ["threadCinch", "ceramicCrack"]
  },
  "doom_mark": {
    "_not": "Hexer 4. yuva: vurur, Omen ekler, ardından yığını x1,5 Doom ile patlatır. Sayılar PROVİZYON.",
    "id": "doom_mark", "name": "Doom Mark", "icon": "doommark",
    "target": "single_enemy", "cost": { "resource": "mp", "amount": 14 },
    "cooldown": 4, "initialCooldown": 2,
    "motion": "cast", "fx": "#6a2f5f",
    "effects": [
      { "type": "damage", "damageType": "magic", "element": "dark", "scale": "luck", "power": 1.0 },
      { "type": "omen", "stacks": 1, "critStacks": 2 },
      { "type": "detonate", "status": "omen", "mult": 1.5 }
    ],
    "ai": { "anyOf": [{ "kill": true }, { "minTargetStacks": { "status": "omen", "count": 2 } }], "reserveMp": 2 },
    "vfx": "doommark", "sfx": ["doomBreath", "hexWhisper", "ceramicCrack", "doomThud"]
  }
}
```

**`data/statuses.json` girdileri**
```json
{
  "omen": {
    "name": "Bad Omen", "type": "debuff", "icon": "omen", "color": "#b04fa8",
    "maxStacks": 3, "refreshOnStack": false, "burstOnExpire": true,
    "critDeltaPerStack": -0.03,
    "doom": { "scale": "luck", "powerPerStack": 0.6, "damageType": "magic", "element": "dark", "expireMult": 1 },
    "text": "At 3 Omens, Doom strikes. After 3 turns, the Omens burst into Doom. Misfortune: crit chance -3% per Omen"
  },
  "wither": {
    "name": "Withering", "type": "debuff", "icon": "wither", "color": "#9cab3c",
    "dot": { "damageType": "magic", "element": "dark" },
    "text": "Takes dark damage at the start of each of its turns"
  },
  "jinxed": {
    "name": "Jinxed", "type": "debuff", "icon": "jinxed", "color": "#c0203a",
    "accuracyDelta": -0.2, "critDelta": -1, "endsOnOwnAttack": true,
    "text": "Accuracy -20% and no critical hits on its next attack"
  }
}
```

**`data/ai.json > profiles`**: bölüm 6'daki `hexer` bloğu (`omenValueShare` yeni alan).

### 12.3 Kararlar (Ömer, 2026-10-07)

- **Ö1.** 3. Omen gelince Doom **hemen** patlar (öneri onaylandı).
- **Ö2. YENİ KURAL (GÜNCELLENDİ 2026-10-08, bkz. Ö13: yeni Omen artık süreyi YENİLER):** Omen düşman üstünde **en fazla 3 tur** kalır; sayaç ilk Omen'le başlar, yeni Omen süreyi yenilemez/uzatmaz. Süre dolunca Omen'ler sessizce düşmez: hedefteki **Omen sayısı kadar Doom patlar** (luck x 0,6 x Omen sayısı x1; 3'e ulaşmışsa zaten anında patlamıştı). Sonuçları: 3.1, 3.2 (tetik b, zaman, snapshot, guard), 5 (Ill Omen kalan süreyi taşır), 6 (omenValueShare 0,85), 7.1 (E1, E3, E8), 7.5, 8 (tooltip/wiki), 11 (güç artışı + `expireMult` kolu).
- **Ö3.** Hexer ölünce lanetler (Omen, Wither) **sürer**; süre bitimi Doom'u snapshot Luck kullanır.
- **Ö4.** Misfortune Omen'in parçası (onaylandı).
- **Ö5.** Jinx, Backstab'ın garantili kritiğini **bozmaz**.
- **Ö6.** Withering Curse **2 sıra x 3 şerit**, aşamalı önden arkaya kalır.
- **Ö7.** Cutthroat Opportunist listesine **Wither** eklenir (Omen eklenmez).
- **Ö8.** İki Hexer aynı yığını **doldurur**.
- **Ö9.** Karakter **kadın** (görsel brief aynen).
- **Ö10.** Taslaktan farklar **onaylandı** (Doom Mark yığın 3 olmasa da patlatır x1,5; DoT Withering Curse'te).
- **Ö11.** Ill Omen ile geçen Omen'ler ölenin **kalan süresini taşır** (yeni 3 tur başlatmaz; öneri onaylandı).
- **Ö12.** Süre dolunca patlayan Doom Guard ile koruyucuya **aktarılmaz** (öneri onaylandı). Ömer'in notu: Guard yalnızca skill hasarını aktarır, debuff/lanet aktarmaz.
- **Ö13 (2026-10-08).** "Omen'in süresi yeni Omen atınca refreshlenecek": skill ile eklenen her yeni Omen yığının süresini tam süreye (3 tur) yeniler (`statuses.json > omen.refreshOnStack: true`). Süre dolunca Omen sayısı kadar Doom kuralı aynen. **Varsayım:** Ill Omen geçişi yenilemez (ölenin kalan süresini taşır, alıcının sayacını uzatmaz); yenileme Resilience zarı atmaz, tam süreye çıkar. (open-questions)
- **Ö14 (2026-10-08).** Doom Mark patlatınca hedefin TÜM Omen'leri (kendi +Omen'i dahil) harcanır; Doom Mark'ın vuruşu ya da patlaması hedefi öldürürse Ill Omen çalışmaz (0 Omen geçer). Otomatik Doom (3. Omen) ve süre bitimi Doom'uyla ölümde 1 Omen geçer (değişmedi). Veri `detonate.noTransferOnKill`.
- **Ö15 (2026-10-08).** Kritik Jinx yığını 3'e tamamlarsa patlayan Doom kesin kritik (kendi zarı yok). Veri `omen.critDoomOnCrit` (yalnızca Jinx).

**Ö2'den türetilen ÖNERİLER (Ömer onayı bekler):** (1) Ill Omen ile geçen Omen alıcıda yeni 3 tur başlatmaz, ölenin kalan süresini taşır (alıcıda Omen varsa alıcının sayacı korunur). (2) Süre bitimi Doom'u Guard'a aktarılmaz (tur başı durum hasarı, Wither tiki gibi). (3) Süre bitimi Doom'u taşıyanın tur başında, Wither tikinden sonra patlar.

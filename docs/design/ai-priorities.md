# Yapay zekanın tercih sıralaması (balans öncesi çalışma)

Durum: **v4 (2026-10-08): Faz 1-5 UYGULANDI (engine-dev, madde 257 + 258).** Madde 258: Faz 2 artığı (mana yakma "engellenen hamle", Dark Bond düzeltmesi), Faz 3 artığı (Rest/Skip/Move sabit kapısız terazide), Faz 5 zorluk seviyeleri, K14 (savaş belliyse diriltme 0), eski skill ipucu koşulları silindi. Ömer'in kararları (K11-K14) 0. bölümün sonunda; uygulama durumu 7. bölümde. v3: Faz 1-4 (madde 257). v2 (2026-10-07): kararlar işlendi, ölçüm balance-tester. Kalan açık sorular 8. bölümde ve `open-questions.md` madde 252 / 254 / 257.

## 0. Ömer kararları (2026-10-07) ve sonucu

| # | Konu | Ömer kararı | Belgedeki karşılığı |
|---|---|---|---|
| K1 | Karar biçimi | YZ **en değerli hamleyi** seçer (kural sırası yok, tek değer terazisi) | 6.1: öldürme, kurtarma, diriltme dahil her şey aynı birimde (can-eşdeğer) puanlanır; sabit öncelik yok |
| K2 | Öldürme mi kurtarma mı | Düşmanı öldürmek dostun ölmesini ENGELLEYECEKSE öldür; yoksa dostu kurtar | 6.2: öldürmenin değerine "kurtardığı dostun değeri" eklenir; yalnızca o düşman dostun ölümüne yetecek tehdidin parçasıysa |
| K3 | Paladin sırası | Metriğe göre değişir; koşullar ileride değişebilir; soruyu daha iyi sor | Sabit sıra yok; diriltme/şifa/hasar aynı terazide (6.1). Metrik ayarları için yeni soru: 8. bölüm Soru P |
| K4 | Mage | Ana odak HASAR; destek de yapsın, Barrier yalnızca terazide gerçekten değerliyse | Mage ağırlıkları: hasar 1,0, destek terazide normal; `shield` önceliği kalkar |
| K5 | Ultimate | Genelde KULLANILSIN; ertelenebilir: normal skill öldürmeye yetiyorsa ya da o an destek gerekiyorsa | 6.4: ultimate'a küçük "erteleme bedeli" yok; yalnızca aynı işi bedava/cooldown'suz skill görüyorsa o seçilir |
| K6 | Defender düşük canda Taunt/Guard | Takıma bağlı; gerekirse kendini feda eder (ör. 2 kişi kalmış, Mage'i korumak) | 6.5: korunan dostun değeri vs Defender'ın hayatta kalma değeri; sabit can kapısı YOK |
| K7 | Skeleton | Ön sırada yer yoksa ÇAĞRILMASIN; ön sıradaki dost ölünce cesedinin ÜSTÜNE çağrılabilsin | YZ kuralı (ai.ts) + motor/tasarım değişikliği (engine-dev, ayrı iş); diriltmeyle çakışma: Soru S |
| K8 | Kontrol etkileri | Stun, Slow, Wound, Haste, Blinded vb. değer hesabına KESİNLİKLE girer | 6.3 |
| K9 | Zorluk | Easy / Medium / Hard | 6.7 |
| K10 | Dark Bond / çağrıya bağ | Çağrının katkısı daha fazlaysa çağrıya da kurulabilir (terazi) | 6.6: bağ değeri bağlanan birimin beklenen kalan katkısına göre; çağrı yasağı YOK |

### Ömer kararları (2026-10-08) ve sonucu

| # | Konu | Ömer kararı | Karşılığı (uygulandı, madde 257) |
|---|---|---|---|
| K11 | Paladin / destek ölçütleri (Soru P'nin yerine) | Değerlendirme ufku **3 TUR**; diriltilecek kişinin (ör.) Archer'ın vuracağı kişiye göre katacağı değer, dirilenin tur barının 0 doğması ve yaşayan kişinin tur barının ne kadar dolu olduğu değerlendirilsin | `ai.json > value.horizon = 3` (kullanıcının kendi turu). "Kalan katkı" = birimin tur başı değeri x ufukta oynayacağı tur sayısı (hız + tur sayacı: dolu sayaçlı dost yakında oynar, dirilen 0 sayaçla başlar). Düşmanın sıradaki hamlesi tahmin edilir (her düşman kendi odak kuralıyla kime vuracak); dost bir sonraki turumuzdan önce ölecekse kurtaran hamleye kurtarma değeri. Diriltme, şifa, kalkan, öldürme aynı terazide. Ek alt soru (savaş bitmek üzereyken diriltme) açık: 8. bölüm |
| K12 | Resurrection işlevi (Soru S'nin yerine) | Diriltme skill'i önce diriltilecek dostu seçsin, sonra seçtiği BOŞ ALANA diriltsin; cesedin üstünde dost olup olmamasından bağımsız | İki adımlı hedefleme (motor + arayüz + YZ). Skeleton cesedin üstündeyken de diriltilebilir: dost başka boş hücreye gelir. Soru S kapandı |
| K13 | Zorluk | Easy / Medium / Hard; sefer başında seçilir, sonra değişmez (kayıtta) | UYGULANDI (madde 258): `chooseAction(..., { difficulty })`, `ai.json > difficulty`; sefer BattleScene'e `difficulty` iletir, düşman tarafı onunla oynar; hızlı savaş Medium. Ayrıntı 6.7 |
| K14 | Diriltme savaş bitmek üzereyken (Soru P alt sorusu) | "Diriltme savaşın galibini değiştirmeyecekse değeri 0 olsun" (2026-10-08) | UYGULANDI (madde 258): `ValueContext.outcome` sezgiseli (iki tarafın ufuk içi bitirme süresi); kazanılmış ya da dirilenle bile kaybedilen savaşta `revive` terimi 0 |

Amaç (Ömer): "Tüm karakterlerin skillerini ve olası takım kompozisyonlarını düşünerek, balans öncesinde yapay zekanın tercih sıralaması." Önce yapay zeka (YZ) doğru oynasın, sonra genel balans: yanlış oynayan bir class'ın kazanma oranı balans sorunu gibi görünür ama AI sorunudur.

## 1. Nasıl ölçüldü

- Geçici ölçüm betiği (scratchpad, silindi): iki taraf YZ, rastgele takımlar, `turns` modu. Her kararda `chooseAction` izi (adaylar, puanlar, öncelik adımları) okundu; ayrıca örnek kararlar `explainChoice` ile (Copy match data'daki "WHY" satırının aynısı) açıklandı.
- 5v5: 2000 savaş (seed 1-2000) + 1000 savaş ek kontrol; takım boyutu 1, 2, 3, 4, 8, 12: her biri 600 savaş (seed 5001-5600). Standart `npm run sim` 3000 savaş (seed 1) sınıf oranları için.
- Not: engine-dev aynı anda `ai.ts`/`battle.ts` üzerinde çalışıyor; ölçüm 2026-10-07 akşamki çalışma kopyasıyladır.
- "Pay" = o class'ın tüm hamleleri içinde o skill'in yüzdesi. "Override" = seçilen hamlenin net değeri, aynı turda açık olan en iyi başka hamlenin net değerinden belirgin düşük (alternatif > seçilen x 1,25 + 3).

Bağlam (standart sim, 3000 savaş 5v5): oyuncu tarafı %50,7; sınıflar Defender %55,5, Gambler %55,3, Paladin %53,6, Anti-Mage %52,8, Warrior %51,3, Cutthroat %50,9, Druid %50,1, Undead %48,3, Archer %47,0, Mage %43,6, Hexer %41,6. Mage ve Hexer'in düşüklüğünün bir kısmı aşağıdaki AI kararlarından geliyor (balans ayarından önce AI düzeltilmeli).

## 2. Mevcut YZ nasıl karar veriyor (sade)

1. Her skill ve her hedef/alan için bir **aday** üretilir; adayın beklenen hasarı, şifası, kalkanı, mana yakması, lanet (Omen/Wither) değeri, Blinded/Shrouded/Jinx koruma değeri, Dark Bond değeri ve yarım-tur (tempo) değeri hesaplanır (önizlemeyle aynı formül). Bedel düşülür (`mpCostWeight`).
2. Profilin **öncelik listesi** soldan sağa denenir; **ilk uyan öncelik kazanır**, sonrakilere bakılmaz. Öncelikler: `kill` (öldürebiliyorsa), `heal`, `revive` (heal içinde), `summon`, `shield`, `taunt`, `guard`, `burn`, `tactic` (skill'in `ai` ipucu sağlanıyorsa ve neti > 0), `aoe` (alan skill'i), `damage` (odak hedefe en iyi hasar).
3. **Odak** (`damage` önceliği): can ORANI en düşük düşman (Archer: can MİKTARI en düşük). Hasar önceliği yalnızca odak hedefe vuran adaylara bakar.
4. İpucu (`ai`) olan skill ipucu tutmuyorsa yalnızca öldürücü vuruşta seçilebilir; `reserveMp` güçlü skill için MP ayırır.
5. **Global** eylemler (Rest/Skip Turn/Move) yalnızca seçilen class hamlesi `kill` ya da işlevsel (şifa/kalkan/taunt...) değilse, değer hesabıyla denenir.

**Değer hesabına HİÇ girmeyenler** (YZ bunları "görmez"): Stun (Charge, Card Trick, Vine Snare), Slow (Tremor Slam, Bone Throw), Wound (Venom Edge, Thorn Whip; şifayı azaltır), Haste (Quick Shot), Taunt ve Guard'ın koruma değeri, çağrının değeri (yalnızca ceset yoksa), diriltmenin değeri (yalnızca dirilecek birimin maks canı, şifa önceliği içinde), Cutthroat'un Opportunist bonusunun hedef seçimine etkisi (hasar önceliği önce odağı seçer, bonus sonra hesaplanır), müttefiklerin aynı turda yapacakları.

## 3. En önemli bulgular (en kötü kararlar önce)

| # | Sorun | Ölçüm | Örnek (Copy match data "WHY") | Kök neden |
|---|---|---|---|---|
| 1 | **Öncelik zinciri daha iyi hamleyi görmüyor.** Öndeki öncelik (shield, tactic, aoe, burn) uyunca, çok daha değerli başka hamle varken onu seçiyor | Mage Mana Barrier kullanımlarının %93'ünde çok daha iyi saldırı vardı; Warrior Abyssal Cry'ın %34'ü, Undead Dark Bond'un %22'si, Anti-Mage Drain Field'ın %21'i, Hexer Jinx'in %9'u aynı durumda | seed 8 tur 17: Mage (tam can, 68/68 MP) Anti-Mage'e Mana Barrier (net 12,8); Meteor 3 düşmana 113 hasar (net 105) "not in the pool of shield". seed 1 tur 21: Warrior Abyssal Cry net 2,7; Double Strike net 24,9 | `ai.ts` pickClassOption: ilk uyan öncelik kazanır; ortak puan yok |
| 2 | **Whirlwind tek düşmana** (15 MP, Double Strike'tan zayıf) | Whirlwind'in %20'si tek hedef (5v5), 2v2'de %33; Warrior "aoe" kararlarının %44,5'inde daha iyi tek hedef saldırı vardı | seed 2 tur 40: Whirlwind 1 hedef 14,9 hasar (net 7,4) vs Double Strike 24,9 (bedava) | `aoe` önceliği "yaşayan düşman >= 3" diye bakıyor, VURULACAK düşman sayısına değil; Whirlwind yakın dövüş, yalnızca ön sırayı vurur |
| 3 | **Skeleton boşta duruyor** | Skeleton turlarının %39'u pas (5v5), 8v8'de %64; hepsi 2. sırada, hedefi yok | seed 8 tur 34: Skeleton 2. sırada, yakın dövüş skill'leri ulaşmıyor, çağrılar Move kullanamıyor | Raise Dead yuvası "en öndeki boş yuva" ama ön sıra doluysa 2. sıra; YZ değeri bunu bilmiyor |
| 4 | **Defender düşük canda Taunt/Guard** | Taunt'ların %13,8'i Defender canı < %40 iken (en düşük %10); Guard'ların %15'i Defender < %40 iken (Guard hasarın %50'sini Defender'a aktarır) | seed 39 tur 46: Defender 13/135 can, Taunt | `taunt` önceliği koşulsuz (yalnızca "taunt yoksa ve dost varsa"), `guard` Defender'ın canına bakmıyor |
| 5 | **Dark Bond değerinin şişkinliği** | Undead hamlelerinin %37'si Dark Bond (en sık skill'i); tahmini değer 15-22 can, gerçek ortalama 7,6 can / bağ; bağların %39'u Undead canı > %90 iken, %34'ü dostu > %90 iken | seed 2 tur 5: Bond (bond 21,8 + tempo 27,3) seçildi, Wail 3 düşmana 71,6 hasar (net 54,6) "not in the pool of tactic" | Değer en iyi saldırının (alan!) lifesteal'ini 3 tur sayıyor; tempo ekleniyor; tactic önceliği Wail'den önce |
| 6 | **"Öldürür" sanılan vuruşların %30'u öldürmüyor** | kill kararlarının gerçekleşme oranı %63-79 (Gambler %63, Hexer %79) | — | `aiKillMin` 0,5: %50 isabetle "öldürür" sayılıyor; ortalama hasar canı ancak geçiyorsa yarı yarıya kalıyor. kill puanı ihtimali hiç kullanmıyor |
| 7 | **Destekçiler (Paladin, Druid, Undead, Gambler, Hexer) tam canla geri çekiliyor** | Paladin Move'larının %51'i, Hexer %46, Gambler %42, Undead %32'si can > %80 iken | seed 11 tur 5: Paladin 92/92 can, Judgment (4 düşman, net 35) yerine Move | "Kırılgan" = yakın dövüş skill'i olmayan; Paladin (frontPriority 2, önde başlar) kırılgan sayılıyor; fırsat bedeli hamlenin yalnızca %50'si |
| 8 | **Paladin Resurrection'ı her şeyin önüne koyuyor** | Paladin "heal" kararlarının %45'inde çok daha iyi hamle vardı | seed 2 tur 20: Resurrection (Hexer) seçildi; Radiance 6 hedef, 63 hasar + 36 şifa (net 93) | Diriltme `heal` önceliğinin en başında, koşulsuz |
| 9 | **Kritik dost varken öldürme** | Mage, Anti-Mage, Druid, Paladin'de: dost < %30 can VE kurtaran hamle (şifa/kalkan) varken %58-62 öldürme seçildi | seed 20 tur 15: Mage, Anti-Mage dostu %10 can iken Fire Bolt ile Hexer'i öldürdü | `kill` her profilde ilk. Karar K2 ile çözülüyor (6.2) |
| 10 | **Kontrol etkileri görünmüyor** | Charge hedeflerinin yalnızca %1'i zaten sersem; ama Charge'ın sersemletme değeri hiç sayılmadığı için Charge "odak dışı" diye 44 değerli vuruş yerine Double Strike 22,7 seçiliyor (Warrior hasar kararlarının %17'si) | seed 4 tur 16: Charge -> Treant 49 (skipped: not on the focus target) | Stun/Slow/Wound/Haste değere girmiyor; hasar önceliği yalnızca odağa bakıyor |

Küçük bulgular: Archer'ın Quick Shot'ı (kendine Haste) değerlenmediği için Archer hamlelerinin %11'i Rest/Skip; Mana Steal'in %7'si MP'si 0 olan hedefe; Hexer Doom Mark'ın %64'ü hedefte 0-1 Omen varken (çoğu öldürme için); Cutthroat vuruşlarının yalnızca %24-41'i Opportunist bonuslu hedefe (bonuslu hedef varken başkasına %19-32); Smoke Bomb Cutthroat hamlelerinin %31'i (en sık skill'i).

İyi çalışanlar: Rejuvenate hiç dolu canlıya atılmadı (hedef ortalama %31 can); Radiance'ın yalnızca %4'ü dostların çoğu doluyken; Arrow Rain, Drain Field, Judgment, Withering Curse, Nature's Wrath neredeyse hiç tek hedefe atılmıyor (ipucu/şekil seçimi iyi); pahalı skill'i bedava skill de öldürebilecekken harcama %0-2; Fist Crush hep 3+ düşmanda; Guard hep en yaralı dosta.

## 4. Class bazında: skill'ler, mevcut davranış, öneri

Tablolarda "Pay" 5v5 (2000 savaş) ölçümüdür. "Ayar" sütunu: **J** = yalnızca veri (ai.json / skills.json `ai` ipucu / formulas.json), **K** = ai.ts mantık değişikliği.

### Warrior (profil aggressive: kill > tactic > aoe > damage, odak can oranı)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Double Strike | tek hedef hasar (bedava, 2 vuruş) | damage/kill | %50 | — |
| Whirlwind | alan (ön sıra), 15 MP | aoe: yaşayan düşman >= 3 ise | %26 | %20'si tek hedefe |
| Charge | arka safa hasar + Stun, 10 MP | damage/kill | %14 | Stun değersiz; yalnızca odak hedefe |
| Abyssal Cry | kendine Fortify + Berserker, 40 Rage | tactic (can sonrası >= %35, 2+ düşman, 2+ dost) | %7,5 | Net küçük olsa da saldırıyı eziyor |

Terazide beklenen sonuç (K1; sabit sıra değil, "genelde hangisi kazanır"): **öldürme** (ihtimal x hedefin kalan katkısı) > **Charge** (hasar + Stun değeri: hedefin kaçırdığı hamle; arka saftaki büyücü/okçuya en değerli) > **Whirlwind** vurulan düşmanların toplam hasarı Double Strike'ı geçtiğinde (pratikte 2+ hedef) > **Abyssal Cry** yalnızca net buff değeri en iyi saldırıdan büyükse > **Double Strike**. Fark: Whirlwind tek hedefe ve Abyssal Cry zayıf anda kendiliğinden elenir (artık öncelik sırası onları zorla seçtirmez). Ayar: K (terazi, Stun değeri); J gerekmez.

### Defender (tank: kill > taunt > guard > tactic > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Tremor Slam | ön sıra alan + Slow (bedava) | damage | %24 | %61'i tek hedef (bedava, sorun değil) |
| Taunt | dostları korur + küçük kalkan | taunt: hep, sırası gelince | %30 | %14 Defender < %40 can |
| Guard | dostun hasarının %50'sini üstlenir | dost < %80 ise en yaralı | %25 | %15 Defender < %40 can; %12 arka sıradaki dosta |
| Fist Crush | 3 rastgele vuruş | tactic (3+ hedef) | %16,5 | — |

Terazide beklenen sonuç (K1, K6): **Guard** değeri = korunan dosta bu süre içinde gelecek beklenen hasarın aktarılan payı x o dostun değeri (ölümden kurtarıyorsa kurtarma değeri) - Defender'ın bu yüzden ölme riski x Defender'ın değeri. **Taunt** değeri = dostlardan Defender'a çekilen tek hedefli beklenen hasar (+ dostların hasar azaltması) - aynı risk terimi. Böylece sabit can kapısı YOK: 2 kişi kalmış, ölmek üzere olan Mage'i korumak için %10 canlı Defender kendini feda edebilir (Mage'in değeri > Defender'ın kalan değeri); ama 5 kişilik takımda, kimse tehlikede değilken %10 canla Taunt değeri negatif çıkar. **Fist Crush** 3+ düşman, **Tremor Slam** (hasar + Slow değeri) geri kalan. Ayar: K (taunt/guard değer terimleri; `taunt`/`guard` öncelikleri kalkar). J: `tank.guardBelowRatio` artık kullanılmaz.

### Archer (sniper: kill > tactic > aoe > damage, odak can MİKTARI)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Quick Shot | bedava zayıf vuruş + kendine Haste | damage | %8 | Haste değersiz -> Rest/Skip %11 |
| Piercing Arrow | şerit (column) delici, 8 MP | aoe/damage | %29 | %24 tek hedef (yarısı son düşman) |
| Arrow Rain | 3x3 alan, 16 MP | aoe | %26 | iyi (ortalama 4,5 hedef) |
| Aimed Shot | zırh delen büyük vuruş | tactic/kill, MP ayırır | %25 | %70'i öldürme; iyi |

Terazide beklenen sonuç: öldürme (Quick Shot/Piercing Arrow yetiyorsa onlar; yoksa Aimed Shot, K5) > **Arrow Rain** 3+ hedef > **Aimed Shot** zırhlı/yüksek canlı hedef (ultimate: genelde hemen kullanılır, K5) > **Piercing Arrow** 2+ hedef > **Quick Shot** (hasar + Haste tempo değeri, K8) > Rest yalnızca MP gerçekten bitikse. Archer'ın "en az can" odağı kalır (finisher kimliği; terazide küçük bir sınıf ağırlığı olarak). Ayar: K (Haste değeri); `reserveMp` korunur (J).

### Mage (caster: kill > shield > tactic > aoe > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Fire Bolt | ucuz büyük tek hedef | kill/damage | %56 | — |
| Blizzard | 3x2 alan | aoe | %13 | — |
| Mana Barrier | dosta debuff silme + kalkan | shield: dost < %75 can (ya da silinecek debuff) | %24 | %93'ünde çok daha iyi saldırı vardı |
| Meteor | + şekli alan + yanan zemin | tactic (2+ hedef) | %7 | Barrier yüzünden geri kalıyor; %38'i 2 hedefe |

Terazide beklenen sonuç (K4: ana odak hasar): öldürme > **Meteor** (ultimate, genelde hemen; K5) > **Blizzard** 2+ > **Fire Bolt** > **Mana Barrier** yalnızca değeri saldırıyı geçtiğinde: kalkan değeri = dostun bu süre içinde yiyeceği ve kalkanın emeceği beklenen hasar (dostu ölümden kurtarıyorsa kurtarma değeri) + silinen debuff değeri (Stun = kaybedilecek hamle, K8) + emilen darbe başına MP. Pratikte: dost ölmek üzere ve vurulacaksa ya da Stun'lıysa Barrier; yoksa hasar. Ayar: K (`shield` önceliği kalkar, değer terimi); J: `caster` ağırlıkları (hasar 1,0). Mage'in kazanma oranı (%43,6) sonra yeniden ölçülmeli.

### Paladin (healer: kill > heal > tactic > damage; heal = önce diriltme)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Holy Strike | bedava zayıf vuruş | damage/kill | %15,5 | — |
| Resurrection | ölü dostu diriltir, 20 MP | heal önceliğinin EN başı, koşulsuz | %18 | Radiance 93 değerliyken bile önce |
| Judgment | + şekli zemin (holy fire) | tactic (2+ hedef) | %23 | — |
| Radiance | herkese: dosta şifa, düşmana hasar | heal (dost < %55) / tactic (yaralı dost < %70) | %26 | iyi (%4 boşa) |

Ayrıca Paladin hamlelerinin %18'i global: Rest %10,6, Skip %3,7, Move %4 (Move'ların yarısı tam canla geri çekilme).

Sabit sıra YOK (K3): Resurrection, Radiance, Judgment, Holy Strike ve öldürme aynı terazide; hangisinin kazanacağı ölçütlere bağlı. Ölçütler ve Ömer'in ayarlayacağı kollar 8. bölüm Soru P'de (senaryolarla). Ayar: K (diriltme değer terimi, Paladin'i "kırılgan" saymamak); J: Soru P'nin cevabına göre `ai.json` ufuk/ağırlık değerleri.

### Druid (support: kill > heal > summon > tactic > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Thorn Whip | bedava vuruş + Wound | damage/kill | %30 | Wound değersiz |
| Nature's Wrath | 2x3 alan | damage (ipucu yok) | %21 | iyi (ortalama 3,5 hedef) |
| Rejuvenate | şifa + tur şifası | heal: dost < %50 | %23 | iyi (hedef ort. %31) |
| Summon Treant | 3 tur Treant, 25 MP | summon: yoksa hemen | %23,5 | 12v12'de yer yok (hiç çağrılamıyor) |

Terazide beklenen sonuç: öldürme (K2: dostu kurtarıyorsa ya da dost tehlikede değilse) > **Rejuvenate** (dost tehlikedeyse kurtarma değeri; yaralıysa şifa + tur şifası, Wound'lu dostta azalır) > **Summon Treant** (çağrının beklenen katkısı + Verdant Blessing toplu şifası) > **Nature's Wrath** 2+ > **Thorn Whip** (hasar + Wound değeri, K8). Druid bugün de büyük ölçüde doğru; fark yalnızca ortak kurallardan. Ayar: K.

### Undead (darkmage: kill > summon > tactic > aoe > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Bone Throw | bedava vuruş + Slow | kill/damage | %14 | Slow değersiz |
| Wail of the Dead | + şekli alan + zehir, bedel anlık canın %20'si | aoe (3+ düşman) | %26 | %10 tek hedefe (çoğu son düşman) |
| Dark Bond | lifesteal'i dosta kopyalar, yarım tur | tactic (2+ dost) | %37 | Değer şişkin; Wail'i eziyor; 1v1'de bile çağrısına |
| Raise Dead | Skeleton (cesetle beslenmiş) | summon: ceset varsa hemen | %16 | Skeleton'ın %39'u pas; %19 cesetsiz |

Terazide beklenen sonuç: öldürme > **Raise Dead** yalnızca Skeleton'ın vurabileceği bir yuva varsa (K7: ön sırada yer yoksa ÇAĞRILMAZ; motor değişikliğiyle ön sıradaki ölü dostun cesedinin üstü de yuva olabilir) > **Wail** 2+ hedef > **Dark Bond** (değer = Undead'in bağ süresince GERÇEKTEN çalacağı can, yani eksik canla sınırlı, x bağlanan birimin bu süre içinde alabileceği şifa; çağrıya da kurulabilir, K10: çağrının kalan ömrü ve katkısı büyükse) > **Bone Throw** (hasar + Slow). J: `darkmage.bondSelfFloor 0.15 -> 0.05`, `bondHpFloor 0.3 -> 0.1` (ölçülecek; şişkinliği azaltır). K: bağ değerinde çalınabilir can tahmini (yalnızca alan saldırısının değil, bağ süresince beklenen tüm vuruşların lifesteal'i, eksik canla sınırlı) ve tempo değerinin terazide doğru sayılması.

### Anti-Mage (antimage: kill > shield > burn > tactic > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Mana Steal | bedava yakın dövüş + mana çalma | kill/damage | %36 | %7 MP'si 0 olana; 12v12'de arka sıradan hiç vuramıyor |
| Drain Field | 3x3 mana yakma | burn: 2+ düşmanın manası varsa | %31,5 | %21'inde Mana Steal çok daha iyiydi |
| Spell Ward | dosta/kendine büyü kalkanı + MP yakma | shield: hedef <= %45 | %12 | %32'si kendine (uygun) |
| Void Strike | eksik manaya göre büyük vuruş | tactic/kill (finisher) | %20 | %94'ü öldürme: tasarıma uygun |

Terazide beklenen sonuç: öldürme > **Void Strike** (ultimate, genelde hemen; K5) > **Spell Ward** (değer = dosta gelecek büyü hasarının emilen kısmı + yakılan MP'nin düşmana maliyeti + buff silme; dost tehlikedeyse kurtarma değeri) > **Drain Field** (yakılan mananın değeri: düşmanın o mana ile yapamayacağı hamleler) > **Mana Steal** (MP'si 0 olan hedefte mana değeri 0). Ayar: K (`shield` ve `burn` öncelikleri kalkar; mana yakma değeri "engellenen skill" olarak, bugünkü sabit 0,6 yerine). J: Spell Ward ipucu (`maxTargetHpRatio 0.45`) terazi gelince kaldırılabilir.

### Gambler (gambler: kill > tactic > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Loaded Dice | bedava, %25 tekrar | damage/kill | %37 | — |
| High Stakes | can bahsi, büyük vuruş | damage/kill, can >= %50 kuralı | %5,5 | az; risk değeri tutarlı |
| Card Trick | 2 rastgele vuruş + rastgele durum | damage | %23 | durum değersiz |
| All In | MP bahsi, büyük vuruş | tactic (MP >= %60, savaş turu >= 10 ya da öldürme) | %22 | %76 öldürme; iyi |

Terazide beklenen sonuç: öldürme > **All In** (ultimate; beklenen değer zaten bahsi içerir, K5) > **Card Trick** (hasar + rastgele durumun beklenen değeri: Stun %20, Slow/Wound %40'ar, K8) > **Loaded Dice** > **High Stakes** (can bahsinin beklenen bedeli can değerinden düşülür; düşük canda kendiliğinden elenir). Gambler bugün de tutarlı. Ayar: K (Card Trick durum değeri); J: `minHpRatioForHpCost` terazi gelince gereksizleşir.

### Cutthroat (assassin: kill > tactic > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Venom Edge | bedava yakın dövüş + Wound | damage | %10 | Wound değersiz |
| Saltire Cut | X alan, merkez 2 vuruş | tactic (2+ hedef) | %32 | %9 tek hedef (öldürme için) |
| Smoke Bomb | düşmana Blinded / dosta Shrouded | tactic (2+ hedef / 2+ dost) | %31 | En sık skill; %94 düşman tarafına |
| Backstab | arkası boş hedefe garantili kritik | kill/tactic | %15 | %94,5 öldürme; iyi |

Terazide beklenen sonuç: öldürme (Backstab arka saf/değerli hedefe; Venom Edge yetiyorsa o, K5) > **Backstab** (ultimate, genelde hemen) > **Saltire Cut** 2+ hedef > **Smoke Bomb** (Blinded/Shrouded değeri zaten hesaplanıyor; terazide saldırıyla yarışınca payı düşmeli) > **Venom Edge** (hasar + Wound değeri). Hedef seçiminde Opportunist bonuslu (dostların Wound/Slow/Stun/Wither'ı) hedefler adaydır (odak tek hedef değil). Ayar: K.

### Hexer (hexer: kill > tactic > aoe > damage)

| Skill | Amaç | Mevcut YZ | Pay | Sorun |
|---|---|---|---|---|
| Evil Eye | bedava + 1 Omen | damage/kill | %27 | %30'u yığını 3'e tamamlıyor (iyi) |
| Withering Curse | 2x3 alan + Wither + Omen | tactic (2+ hedef) | %38 | ortalama 4 hedef; iyi |
| Jinx | Jinxed (isabet -%20, kritik yok) + Omen | tactic (önlenen hasar >= 6) | %17 | %9'unda Evil Eye çok daha iyiydi |
| Doom Mark | Omen'leri x1,5 patlatır | kill / 2+ Omen | %13 | %64'ü 0-1 Omen'de (çoğu öldürme) |

Terazide beklenen sonuç: öldürme (Evil Eye/Jinx yetiyorsa onlar; Doom Mark yalnızca başka skill öldüremiyorsa, K5) > **Doom Mark** (ultimate; 2+ Omen'li hedefte en değerli, ama genelde hemen kullanılır) > **Withering Curse** (vurulanların toplamı; Wither tikleri ve Omen değeri dahil) > **Evil Eye** yığını tamamlıyorsa > **Jinx** (Jinxed değeri: büyük vurucunun bir sonraki saldırısı) > **Evil Eye**. Ayar: K. `withering_curse.ai.requires.minTargets` terazi gelince gereksizleşir (takım boyutundan bağımsız çalışır).

### Çağrılar

| Birim | Ölçüm | Öneri |
|---|---|---|
| Skeleton | %39 pas (8v8: %64), hep 2. sırada | K7 (6.9). K: Raise Dead değerinde "bu yuvadan vurabilir mi" |
| Treant | Vine Snare %52; %22'sinde Root Smash belirgin iyiydi | Vine Snare'in Stun şansı değersiz sayılıyor; K8 ile çözülür |

## 5. Takım kompozisyonları ve takım arkadaşı farkındalığı

| Konu | Mevcut YZ | Ölçüm | Öneri |
|---|---|---|---|
| Odak ateşi (focus fire) | Herkes can ORANI en düşüğe vurur (Archer: can miktarı). Ortak bir "hedef" yok ama kural aynı olduğu için kendiliğinden toplanıyor | kill kararları %70 gerçekleşiyor | Eşitlikte tehdit (iyileştirici/büyücü) öne; Wither/Doom/yanan zeminle zaten ölecek hedefe fazladan vurmamak (K, düşük öncelik) |
| Opportunist (Cutthroat) | Dostun Wound/Slow/Stun/Wither'ını hedef seçiminde kullanmıyor (odak önce seçiliyor) | Cutthroat vuruşlarının %24-41'i bonuslu hedefe; bonuslu hedef varken başkasına %19-32 | K: hasar önceliğinde odak tek hedef değil, "odak + bonuslu hedefler" arasında en iyi beklenen hasar |
| Guard kimi korur | En yaralı (< %80) dost; Defender'ın kendi canı ve dostun vurulup vurulmayacağı hesapta yok | %12 arka sıradakine; %15 Defender < %40 | J: eşik 0,6 + Defender can kapısı; K: düşman odağındaki/ön sıradaki dost |
| Taunt | Her fırsatta | Defender hamlelerinin %30'u | J: can kapısı; K: düşmanda tek hedefli tehdit yoksa (alan ağırlıklı düşman) Taunt'ın değeri düşük |
| Şifacı önceliği | kill > heal (Paladin heal < %55, Druid < %50); diriltme koşulsuz ilk | kritik dost varken %58-62 öldürme | K2 (6.2), Soru P |
| Dark Bond ortağı | En yüksek bağ değeri (eksik cana göre); eşitlikte listede ilk | %34 dolu canlı dosta | K: vurulacak/ön sıradaki dost; çağrıya değil |
| Spell Ward hedefi | Can <= %45 olan dost | %68 dosta | J: büyü saldırganı koşulu (`minFoeMagicMp`) eklenebilir |
| 2 tank + şifacı | Defender+Paladin çifti +%4,7 sinerji (en güçlü çiftlerden) | — | AI ile uyumlu; değişiklik gerekmez |
| Saf hasar (şifacısız ve Defender'sız takım) | — | %45,1 kazanma | Beklenen; AI sorunu değil |
| Çağrıcı ağırlıklı (Druid + Undead) | Skeleton pası, 12v12'de yer yok | çağrıcısız %52,1, 1 çağrıcı %48,9, 2 çağrıcı %50,2 | Skeleton sorunu çözülünce yeniden ölç |
| Hexer'li çiftler | — | Hexer+Mage, Hexer+Archer, Hexer+Druid -%5 (alan hasarı Omen'leri dolmadan öldürüyor olabilir) | Balans turunda incelenecek (AI değil, mekanik etkileşim) |

### Takım boyutu (1-12) etkisi

| Boyut | Önemli farklar |
|---|---|
| 1v1 | Defender %100 Tremor Slam (Taunt/Guard anlamsız: doğru). Paladin/Defender savaşları çok uzun (5 berabere / 600). Undead hamlelerinin %32'si Dark Bond, tek dostu kendi Skeleton'ı. Wail %80 tek hedef (can bedeli boşa). Archer %12 Skip. Raise Dead %100 cesetsiz |
| 2v2 | Whirlwind ve Saltire Cut %33 tek hedef; Mage Barrier %58 kendine; Raise Dead %74 cesetsiz; Spell Ward %62 kendine |
| 3v3-4v4 | Skeleton pası %25-28; diğerleri 5v5'e benzer |
| 8v8 | Skeleton pası %64; Paladin Rest+Skip %20 |
| 12v12 | Tahta dolu: Summon Treant ve Raise Dead hiç kullanılamıyor; Anti-Mage Mana Steal %0,2 (arka sıradan vuramıyor), Anti-Mage Skip %7; Paladin Rest %16 + Skip %10; Undead Skip %9 |

Seferde (1-4 kişilik takımlar) en çok etkilenecekler: Undead (çağrısına bağ, cesetsiz Skeleton), Defender (1-2 kişide Taunt/Guard değersiz: zaten doğru), alan skill'leri (az düşmanda tek hedef). Öneri: alan ve bağ kuralları "vurulan / gerçek dost" sayısına göre olmalı (K), sabit eşikler küçük takımda doğru çalışmıyor.

## 6. Ortak kurallar (Ömer kararlarına göre)

### 6.1 Tek değer terazisi (K1)

Her aday aynı birimde puanlanır: **can-eşdeğer net değer** = (bu hamleyle kazandığımız) - (kaybettiğimiz). Sabit öncelik sırası (kill > heal > ... > damage) KALKAR; `ai.json > priorities` listesi silinmez ama artık yalnızca açıklama/eşitlik bozucu olur. Önerim: "güçlü ama terazi içi öncelik" yerine **saf terazi + doğru değer terimleri**; öldürme, kurtarma ve diriltme ayrıcalığını sabit sıradan değil, değerlerinin büyüklüğünden alır (aşağıda). Böylece "neden bunu seçti" sorusunun cevabı her zaman tek sayıdır ve Copy match data'da okunur.

| Değer terimi | Hesap (sade) | Bugün | Ayar |
|---|---|---|---|
| Hasar | beklenen hasar (isabet x ortalama, kalan canla sınırlı; alan skill'inde vurulanların toplamı) | var | — |
| **Öldürme** | öldürme ihtimali x hedefin **kalan katkısı** (ufuk H tur boyunca beklenen hasarı/şifası/kontrolü) | yok (sabit "önce öldür") | K |
| **Kurtarma** | dost "tehlikede" (bir sonraki turumuzdan önce ölecek beklenen hasar alıyor) ise: hamlenin ölüm ihtimalini düşürdüğü kadar x dostun kalan katkısı (+ canı) | yok | K |
| Şifa / kalkan | gerçekten işe yarayacak miktar (fazla şifa sayılmaz; kalkan: emilmesi beklenen hasar) | var (kalkan x0,5 sabit) | K |
| **Diriltme** | dirilen birimin kalan katkısı x hayatta kalma ihtimali + dönen can | yok (sabit "önce dirilt") | K + Soru P |
| **Kontrol** (K8) | Stun = hedefin kaçırdığı hamlenin değeri x ihtimal; Slow/Haste = kaybedilen/kazanılan tur payı x birimin tur değeri; Wound = hedefin alacağı şifadaki beklenen azalma; Blinded/Shrouded/Jinxed = önlenen hasar (bugün var) | kısmen | K |
| Taunt / Guard (K6) | 6.5 | yok | K |
| Çağrı | çağrının ömrü boyunca beklenen katkısı (vurabileceği yuva yoksa 0, K7) + çağırma yan etkisi (Verdant Blessing) | kısmen | K |
| Mana yakma | düşmanın o mana ile yapamayacağı hamlelerin değeri | sabit x0,6 | K |
| Bedel | MP/can/cooldown'un gelecekteki fırsat bedeli | MP x ağırlık | J (ağırlıklar) |
| **Sınıf ağırlıkları** (kimlik) | `ai.json` profilinde terim çarpanları: ör. Mage hasar 1,0 / destek 1,0; Paladin şifa/diriltme ağırlığı Soru P ile; Archer "en az can" eğilimi | yok | J |

"Kalan katkı" ufku `ai.json`'da tek parametre (öneri: 2 kendi turu); zorluk seviyesi de bunu kullanır (6.7).

### 6.2 Öldürme mi kurtarma mı (K2)

Her dost için "tehlike" hesaplanır: bir sonraki turumuza kadar sırası gelecek düşmanların ona vurabileceği beklenen hasar >= dostun canı + kalkanı. Bir düşmanı öldürmenin değerine, o düşman çıkınca tehlikesi ortadan kalkan dostların kurtarma değeri eklenir. Sonuç Ömer'in kuralıyla aynı: öldürülen düşman dostu öldürecek olan (ya da tehdidin ölümcül payı) ise öldürmek kazanır; değilse doğrudan kurtaran hamle (şifa, kalkan, Guard, Taunt) kazanır. Ayar: K (tehlike modeli; bugünkü `incomingDamage` düşman başına ayrıştırılır ve sıra çubuğu tahmini kullanılır).

### 6.3 Kontrol etkileri (K8)

6.1 tablosundaki kontrol satırı her durum etkisine uygulanır (Stun, Slow, Haste, Wound, Blinded, Shrouded, Jinxed, Fortify, Omen/Wither zaten var). Zaten taşıdığı durumu tekrar uygulamanın değeri yalnızca uzayan kısımdır; Stun'un Taunt'ı bozması (düşman Defender'ı) ek değerdir. Veri: `statuses.json` alanları yeterli; yeni alan gerekmez (Slow/Haste hız payı, Stun skipTurn). Ayar: K.

### 6.4 Ultimate kullanımı (K5)

Ultimate'a "saklama" puanı yok: değeri yüksek olduğu için genelde kendiliğinden seçilir. İki erteleme durumu teraziden doğal çıkar: (a) aynı öldürmeyi bedava/cooldown'suz bir skill de yapıyorsa, ultimate'ın küçük cooldown fırsat bedeli onu geride bırakır (bedel = ultimate'ın tipik değeri x cooldown payı x küçük katsayı, `ai.json`); (b) o an destek (kurtarma) gerekiyorsa kurtarma değeri büyüktür. `reserveMp` (MP ayırma) kalır. Ayar: K + J (katsayı).

### 6.5 Taunt / Guard ve fedakârlık (K6)

Guard değeri = korunan dosta Guard süresince gelecek beklenen hasarın aktarılan payı (x dost tehlikedeyse kurtarma değeri) - Defender'ın bu aktarılan hasarla ölme ihtimali x Defender'ın kalan katkısı. Taunt aynı mantık, dostların tümü için (Defender'a çekilen tek hedefli saldırılar). Sabit can kapısı yok; "2 kişi kaldı, Mage'i koru" senaryosunda fedakârlık değeri pozitif çıkar. Ayar: K.

### 6.6 Dark Bond ve çağrılar (K10)

Bağ değeri = bağ süresince Undead'in gerçekten çalabileceği can (beklenen vuruşlar x %35, Undead'in eksik canıyla sınırlı) x bağlanan birimin bu sürede o şifayı kullanabilmesi (eksik canı, beklenen alacağı hasar, kalan ömrü: çağrıda lifespan). Çağrıya yasak yok; çağrının katkısı büyükse ona kurulur. Aynı kural çağrıya Guard/şifa/Barrier için de geçerli. Ayar: K + J (`bondSelfFloor`/`bondHpFloor` küçültülür ya da kaldırılır).

### 6.7 Zorluk: Easy / Medium / Hard (K9)

Kural: YZ belirleyici kalır (CLAUDE.md). "Hata" rastgelelik değil, savaş seed'i + tur + birimden türeyen sabit bir sayıdır (aynı savaş = aynı hata); motorun RNG'sine dokunulmaz.

| Davranış | Easy | Medium | Hard |
|---|---|---|---|
| Değer terazisi | var, ufuk 1 tur | var, ufuk 2 tur | var, ufuk 2-3 tur |
| Seçim | en iyi 3 adaydan biri, değere yakın olanlar arasında (2.-3. en iyiyi ~%35 seçer) | en iyisi; değerleri %10 içindeki adaylar arasında sabit "kişilik" tercihi | her zaman en iyisi |
| Kontrol etkileri, sinerji (Opportunist, Omen tamamlama) | sayılmaz | sayılır | sayılır |
| Öldürme / kurtarma (6.2) | yalnızca kesin öldürme; kurtarma yok | var | var + takım planı |
| Odak ateşi | yok (her birim kendi en iyisi) | can oranı en düşük (bugünkü) | takım düzeyinde: aynı turda ölecek hedefe fazladan vurmaz (overkill yok), DoT/Doom ile ölecek hedefi atlar |
| Ultimate | gelir gelmez | terazi (6.4) | terazi + bir sonraki turdaki fırsatı bekleme (ör. 2+ Omen) |
| Rest/Skip/Move | yalnızca MP bitince Rest | bugünkü kurallar | bugünkü + tehlike modeli |
| Kullanım | sefer başı (Bölge I), tutorial | hızlı savaş varsayılanı, sefer orta | sefer sonu/boss, hızlı savaşta seçilebilir |

Ayar: J (`ai.json > difficulty.easy|medium|hard`: ufuk, seçim payı, aç/kapa anahtarları) + K (seçim katmanı, takım odağı). Sim ve denge ölçümü **Medium** ile yapılır.

**Uygulanan (madde 258):**

| Kural | Easy | Medium | Hard |
|---|---|---|---|
| Ufuk | 1 tur | 3 tur (value.horizon) | 3 tur |
| Seçim | puanı en iyinin en az %50'si olan en iyi 3 aday arasından %65 / %23 / %12 (belirleyici: savaş seed'i + oynanan tur + birim; motor RNG'si kullanılmaz) | en iyisi | en iyisi |
| Kurtarma (save) / kontrol (Stun, Slow, Wound...) | 0 (`value.saveWeight 0`, `controlWeight 0`) | var | var |
| Öldürme terimi | yalnızca öldürme ihtimali >= %90 (`killMinChance`) | ihtimal x katkı | ihtimal x katkı |
| Odak ateşi | yok | can oranı (düşman tahmini) | + dostlarımızın da yöneleceği hedefe baskı x (1 + 0,3 x dost sayısı) (`focusFire`) |
| Fazla vurmama | yok | yok | zaten ölecek hedef (tur başı Wither/zemin tiki ya da ondan önce oynayacak dostlarımızın tahmini vuruşları canını bitiriyor): hasar/öldürme/baskı değerinin %20'si (`overkillShare`, terim `overkill`) |
| Uygun anı bekleme | yok | yok | Doom Mark (detonate) öldürmüyorsa ve hedefte 2+ Omen yoksa değerinin %50'si (`patience`) |
| Rest/Skip/Move | yalnızca yapacak hamle yokken Rest | terazi | terazi |

Ölçüm (düşman tarafı seviyeyle, oyuncu Medium; düşman kazanma oranı): Easy %29 (600 savaş), Medium %46-50, Hard Medium'dan yalnızca +1-2 puan (800 savaşta %52,0 vs %49,8; 600 savaşta fark gürültü içinde). Hard'ın davranış farkı gerçek ama küçük: büyük zorluk farkı için seferin stat/sayı ayarları (UnitSetup modifiers) gerekir (balance-tester; PENDING_BALANCE).

### 6.8 Diğer ortak kurallar

| # | Kural | Ayar |
|---|---|---|
| O1 | Alan skill'i: değer vurulan hedeflerin toplamıdır (bugünkü "yaşayan düşman >= 3" kapısı kalkar) | K |
| O2 | Öldürme ihtimali gerçek ihtimal (isabet x hasar zarı); `aiKillMin` 0,5 sabit eşiği gereksizleşir | K (+ J geçici: 0,7) |
| O3 | "Kırılgan" = maks can/zırh ve `frontPriority`; tam canla geri çekilme yok | K + J (`move.retreatHpRatio`) |
| O4 | Çağrı yalnızca vurabileceği yuva varsa (K7) | K; motor: 6.9 |
| O5 | Her yeni değer terimi `explainChoice`'ta ayrı sütun (Copy match data'da "kill value", "save value", "control value"...) | K |

### 6.9 Skeleton yerleşimi (K7) - motor/tasarım işi (engine-dev, ayrı)

- YZ (ai.ts): Raise Dead'in Skeleton'ı vurabileceği (ön sıra / erişimdeki) bir yuva yoksa Raise Dead değeri 0: çağrılmaz.
- Motor/tasarım: ön sıradaki dost ölünce o yuva bugün "ölü dosta ayrılmış" (Move ve çağrı giremez). Ömer: Skeleton bu cesedin ÜSTÜNE çağrılabilsin. Bu, `summonSlots` kuralını ve Resurrection ile ilişkiyi değiştirir: Soru S (8. bölüm). Arayüz: Raise Dead 2. adımında (yuva) bu hücre de seçilebilir; YZ ön sıradakini tercih eder.

## 7. Uygulama planı (engine-dev / balance)

Uygulamaya HAZIR: K1, K2, K4-K10 net. Soru P (Paladin ölçütleri) yalnızca ağırlık/ufuk değerlerini etkiler: varsayılanla (ufuk 2 tur, diriltme ağırlığı 1,0) başlanabilir. Soru S yalnızca motor işini (Faz 4) etkiler.

| Faz | İş | Dosya | Büyüklük | Bağımlılık |
|---|---|---|---|---|
| 1 | Değer çekirdeği: tek terazi (`pickClassOption` yeniden), "kalan katkı" tahmini (birimin en iyi hamle değeri x ufuk), öldürme ihtimali, tehlike modeli + kurtarma değeri (K2), alan skill'i vurulan toplamı, ultimate cooldown bedeli; `explainChoice`/`pickerView`/`noPickReason` ve match-log yeni terimlerle | ai.ts, ai.json (yeni alanlar: ufuk, ağırlıklar), match-log.md | **Büyük** (ai.ts'in seçim katmanı baştan; ai testlerinin çoğu yeniden yazılır) | — |
| 2 | Değer terimleri: kontrol etkileri (K8), Taunt/Guard/fedakârlık (K6), şifa/kalkan/Barrier gerçek değer (K4), diriltme (Soru P varsayılanı), Dark Bond yeniden (K10), çağrı değeri + vurabilir yuva (K7), mana yakma, Opportunist hedefleri | ai.ts, ai.json | **Orta-büyük** | Faz 1 |
| 3 | Global eylemler terazide: Rest/Skip/Move aynı birimle; "kırılgan" tanımı | ai.ts, ai.json | Küçük-orta | Faz 1 |
| 4 | Skeleton'ın ölü dostun cesedi üstüne çağrılması (motor + Raise Dead arayüz akışı + wiki Mechanics) | battle.ts, raise-dead-flow.ts, combat.md | Orta | Soru S cevabı |
| 5 | Zorluk Easy/Medium/Hard (seçim katmanı, belirleyici "hata", ayarlar menüsü + debug seçici, sefer düğümlerinde zorluk) | ai.ts, ai.json, ui, campaign verisi | Orta | Faz 1-2 |
| 6 | Ölçüm ve balans: aynı seed'lerle önce/sonra sim; class oranları (Mage, Hexer); `tests/balance.test.ts` | balance-tester | Orta | Faz 1-3 |

**Uygulama durumu (2026-10-08, madde 257):**
- Faz 1 YAPILDI: tek terazi (`src/engine/ai-value.ts` + `ai.ts > scoreOption`), öldürme ihtimali (isabet x hasar zarı, kritik dalı), tehlike modeli + kurtarma (K2), alan skill'i vurulan toplamı, ultimate cooldown bedeli (`cooldownCostShare`), explainChoice / match-log tek sayı + terim dökümü. Profil `priorities` yalnızca etiket; skill `ai` ipuçlarının requires/anyOf koşulları seçimi engellemiyor (yalnızca `reserveMp` sürüyor). Geçici veri yamaları (Whirlwind minTargets, Taunt/Guard can kapısı) hiç uygulanmamıştı; gerek kalmadı.
- Faz 2 YAPILDI (ilk sürüm): kontrol (Stun, Slow, Haste, Wound, Fortify; Blinded/Shrouded/Jinxed eskisi gibi mitigation), Taunt/Guard (yönlenen hasar + kurtarma - Defender riski; fedakârlık mümkün), kalkan = emilmesi beklenen, Mana Barrier temizleme = kaybedilecek tur değeri, diriltme (ufuk 3, tur sayacı 0, hücre seçimi), Dark Bond (tek hedef saldırının lifesteal'i, `bondSelfFloor 0.05`, `bondHpFloor 0.1`), çağrı (ufuktaki katkı x yuvada vurabilirlik + saldırı çekme + Verdant Blessing). Mana yakma değeri hâlâ eski basit hesap (yakılan MP x 0,6): "engellenen hamle" modeli sonraki iş.
- Faz 3 KISMEN: Rest/Skip/Move teraziyle aynı puanı kullanıyor; "kırılgan" tanımı can eksikken (tam canla geri çekilme yok); geri çekilme kendini kurtarıyorsa kurtarma değeri ekleniyor. Global kurallar (eşikler) ai.json'da aynen.
- Faz 4 YAPILDI: Skeleton (ve tüm çağrılar) ölü dostun ceset hücresine çağrılabilir; Resurrection iki adımlı (K12). Madde 258: Move da ceset hücresine girebilir.
- **Madde 258 (2026-10-08):**
  - Faz 2 artığı: mana yakma = "engellenen hamle" (`ValueContext.manaDenial`: hedefin ufuk x `manaHorizonMult` (2) turunda MP yüzünden yapamayacağı MP'li hamlelerin bedelsiz hamlesine göre fazladan değeri; tam sayılı kullanım planı, tur + MP + cooldown kısıtı). Drain Field, Mana Steal ve Spell Ward kancası (korunan dosta saldıracak büyücüler) bunu kullanır. Sonuç: MP'si bol ya da ucuz skill'le yetinebilen hedefte (Mage: Fire Bolt 5 MP, yenilenme 6/tur) yakma neredeyse değersiz; Drain Field kullanımı %2 (balans sorusu: PENDING_BALANCE). Dark Bond düzeltmesi: bağ süresince ikisinin de yiyeceği beklenen hasar çalınabilir/iyileşebilir pay açar (eskiden yalnızca şu anki eksik can; tam canlı Undead'in bağı ~0). Ölçüm (150 savaş, 519 aday): tahmin ort 10,7, gerçekleşebilir (sonraki 3 Undead turunda çaldığı can, dostun eksik canıyla sınırlı) ort 14,7; Dark Bond puanı ort 19 (bağ + tempo), seçilen hamle ort 49: düşük kullanım (%1) GERÇEKÇİ (bağ ~15 can, Wail/Bone Throw daha değerli). Jinx: puan ort 30, Evil Eye 40 (aynı Omen, 2 kat hasar, bedelsiz): %2 kullanım gerçekçi; Jinxed değeri doğru hesaplanıyor (hata bulunmadı).
  - Faz 3 artığı: Rest/Skip/Move'un sabit kapısı (öldürücü/işlevsel class hamlesinde hiç denenmeme) kalktı; kazançları her zaman class hamlesinin terazi puanıyla kıyaslanır.
  - Faz 5: zorluk seviyeleri (6.7 'Uygulanan' tablosu).
  - K14: savaş belliyse diriltme 0 (`ValueContext.outcome`: tUs = düşmanın can+kalkanı / bizim tur başı beklenen hasarımız, tThem tersi; 'win' = tUs <= ufuk ve tUs <= 0,5 x tThem (dirilen HESABA KATILMADAN); 'loss' = aynısı ters yönde, dirilenin ufuk katkısı ve canı bize eklenmişken de; `value.decidedMargin` 0,5).
  - Skill `ai` ipuçlarından eski requires/anyOf koşulları ve incomingShare/opportunityShare veriden SİLİNDİ; kalan: `reserveMp` (Meteor, Aimed Shot, Void Strike, Fist Crush, All In, Doom Mark) ve `reserveMinMpRatio` (All In 0,6). MP ayırma artık değerle: ayrılan skill'in puanı x `reserveValueShare` (0,85) bu saldırıdan büyükse ertelenir.
  - Lucky Escape: ölüm ihtimali (1 - şans); Move ölü dostun ceset hücresine girebilir (madde 257 sorusu 1 kapandı).
- Faz 6 (balans ölçümü/ayarı) YAPILMADI (balance-tester).

Toplam: engine-dev için 3-4 ayrı görev (Faz 1, Faz 2+3, Faz 4, Faz 5); en riskli ve en büyük Faz 1. Önerim: Faz 1 ve 2'yi arka arkaya, her birinden sonra sim ile ölç (davranış büyük ölçüde değişeceği için sınıf oranları oynayacak; balans Faz 6'da).

Bu belgenin önceki sürümündeki "yalnızca veri" önerileri (Whirlwind `minTargets`, Taunt/Guard can kapısı, `shieldBelowRatio 0.5`) terazi gelince GEREKSİZ; Faz 1 gecikirse geçici yama olarak kullanılabilir.

## 8. Ömer'e kalan sorular

Ömer'in ilk 10 soruya cevapları 0. bölümde. Kalanlar:

### Soru P (yeniden kurgulandı): Paladin ve diğer şifacılar hangi ÖLÇÜTLERLE karar versin?

Sabit sıra yok; YZ her seçeneğe bir değer verir, en büyüğünü seçer. Sizin karar vermeniz gereken, değerin hangi parçalarının ne kadar sayılacağı:

| Seçenek | Değeri neyden gelir |
|---|---|
| Resurrection | dirilen birimin bundan sonra yapacakları (ufuk: kaç tur sayılır?) x tekrar ölmeme ihtimali + %30 can |
| Radiance | gerçekten dolan can (fazla şifa sayılmaz) + düşmanlara hasar; ölmek üzere olan dostu kurtarıyorsa kurtarma değeri |
| Judgment / Holy Strike | hasar (öldürüyorsa öldürülen düşmanın bundan sonra yapacakları) |

Senaryolar (5v5, savaşın ortası; sayılar yaklaşık):
- **A.** Warrior öldü. İki dost %60 canda, kimse ölmek üzere değil, 4 düşman sağlıklı. Resurrection mı (Warrior %30 canla geri döner, her turu ~25 hasar), Radiance mı (~36 şifa + ~60 hasar), Judgment mı (~40 hasar)?
- **B.** İki dost kaldı: biri %15 canda ve sırada onu vuracak Archer var. Ölü bir Mage var. Radiance onu kurtarır; Resurrection Mage'i getirir ama %15'lik dost muhtemelen ölür.
- **C.** Son düşman %20 canda, Holy Strike muhtemelen öldürür. Bir dost ölü. (Savaş bitince ölü dostun durumu: sefer kuralına göre %20 canla kalkıyor.)
- **D.** Herkes tam canda, ölü bir Gambler var, 5 düşman sağlıklı: Resurrection mı Judgment mı?

Seçenekler:
- **(a) Kısa ufuk (2 tur):** dirilen/kurtarılan birimin yalnızca önümüzdeki 2 turu sayılır. Sonuç: A'da Radiance, B'de Radiance, C'de öldürme, D'de Resurrection ile Judgment başa baş (Gambler'ın 2 turu ~ Judgment).
- **(b) Kalan savaş ufku:** savaşın tahmini kalan uzunluğu kadar (savaş başında uzun, sona doğru kısa). Sonuç: A ve D'de Resurrection (başlarda), B'de Radiance, C'de öldürme.
- **(c) (a) + sizin ayarlayacağınız "diriltme ağırlığı"** (ör. 1,0 = nötr, 1,5 = Paladin diriltmeyi sever): Paladin kimliğini bir sayıyla ayarlarsınız; koşullar değişince yalnızca bu sayı değişir.
- Ek alt soru: savaş bitmek üzereyken (C) diriltmenin değeri sıfır mı sayılsın? **KAPANDI (K14, madde 258): evet, diriltme savaşın galibini değiştirmeyecekse 0.**

**Önerim: (b) + (c)**: ufuk savaşın kalan uzunluğuna göre (erken diriltme değerli, geç diriltme değersiz; C'de öldürme), üstüne ayarlanabilir ağırlık (başlangıç 1,0). Aynı ölçütler Druid (Rejuvenate), Mage (Mana Barrier) ve Anti-Mage (Spell Ward) için de kullanılır.

### Soru S (KAPANDI, K12): Skeleton ölü dostun cesedinin üstüne çağrılınca o dost diriltilebilir mi?

Ömer kararı: evet; Resurrection önce dostu, sonra BOŞ bir hücreyi seçer (aşağıdaki (c) seçeneğine yakın, hücreyi oyuncu seçer). Eski seçenekler kayıt için:

- **(a)** Hayır, Skeleton orada durduğu sürece (ömrü 4 tur) Resurrection o dosta atılamaz; Skeleton ölünce/ömrü bitince yeniden diriltilebilir.
- **(b)** Evet; diriltilen dost aynı yuvaya döner, Skeleton en yakın boş yuvaya itilir (yoksa yok olur).
- **(c)** Evet; diriltilen dost en yakın boş yuvaya gelir.

**Önerim: (a)** (kural basit, Undead "ölüyü kullanır" kimliğine uygun; YZ bunu terazide hesaba katar: dost tarafında canlı bir diriltici varsa o hücreyi kullanmanın bedeli olur).

### Soru Z (küçük): Zorluk seçimi nerede?

Hızlı savaşta oyuncu seçer (varsayılan Medium) ve seferde düğüm başına veride sabit mi (önerim: sefer başı Easy, Bölge II Medium, son bölge ve boss Hard), yoksa seferde de oyuncu genel bir zorluk seçip düğümler ona göre mi kayar?

## 9. Ek: ölçüm sayıları (5v5, 2000 savaş)

| Ölçüm | Değer |
|---|---|
| Alan skill'i tek düşmana | Whirlwind %20 (son düşman değil), Tremor Slam %61 (bedava), Piercing Arrow %24 (yarısı son düşman), Wail %10 (2/3'ü son düşman), Saltire Cut %9, diğerleri < %1 |
| Ortalama vurulan düşman | Arrow Rain 4,5; Drain Field 4,6; Withering Curse 4,0; Fist Crush (yaşayan) 4,3; Nature's Wrath 3,5; Blizzard 3,4; Judgment 3,2; Wail 2,9; Meteor 2,8; Saltire Cut 2,6; Whirlwind 2,2; Piercing Arrow 2,0 |
| kill kararının gerçekleşmesi | Anti-Mage %72, Archer %71, Cutthroat %68, Defender %67, Druid %71, Gambler %63, Hexer %79, Mage %71, Paladin %67, Undead %69, Warrior %68 |
| Global eylem payı | Archer Rest %8,9 + Skip %2,5; Paladin Rest %10,6 + Skip %3,7 + Move %4; Gambler Rest %8,2 + Move %3; Cutthroat Rest %6,4 + Skip %4,5; Undead Skip %3,6 + Move %2,8; Defender Move %3,7 |
| Pas (hiçbir şey yapamadı) | Skeleton %39; diğer class'lar < %0,3 |
| Raise Dead cesetsiz | %19 (5v5), %74 (2v2), %100 (1v1) |
| Spell Ward kendine | %32 (hedef ortalama %29 can) |
| Mana Barrier kendine | %16; silinecek debuff varken %56 |
| Doom Mark öncesi Omen | 0: %31, 1: %33, 2: %36 |
| Treant çağrısı | Druid'in ilk turunda (savaş turu 3-5) |
| All In | ortalama savaş turu 29, %76 öldürme |

## Boşuna çağrı ve tıkanma sinyali (2026-10-10, open-questions madde 291)
- **`value.resummonShare` (0,4):** çağrının tarafında onu ufuk içinde yeniden çağırabilecek canlı bir çağırıcı varsa, o çağrıya giden hasar / öldürme / baskı ve ona verilen şifa / Dark Bond bu payla sayılır (`futile` terimi). Hedef seçimi çağırıcıya kayar.
- **Tıkanma sinyali (`value.stallTurns` 150, `stallRamp` 50, `stallFocus` 3):** savaşın toplam tur sayacından (`battle.turnsTaken`) türetilir, YZ saf kalır. Sinyal arttıkça çağrılar cooldown'dan bağımsız olarak kısmen değersizleşir, çağrı olmayan düşmana hasar/baskı ek ağırlık alır (`stall` terimi). Normal savaşlar (~37 tur) etkilenmez.

# Skill ölçek ve hasar türü incelemesi (content-designer, 2026-10-09)

**Ömer'in sorusu:** "Animasyon, tema ve karakter kimliğine bakarak, karakterlerin statlarına dokunmadan, her skill büyü mü fiziksel mi olmalı, STR / DEX / INT / LUCK hangisiyle ölçeklenmeli? Belki toptan değiştiririz ama önce bir tablo yapalım, değer mi görelim."

**Bu belge yalnızca analizdir.** Hiçbir veri ya da kod değişmedi, simülasyon (sim) koşturulmadı. Denge tahminleri hesapla yapılmış kaba tahminlerdir; uygulanacak her değişiklik `npm run sim` ile doğrulanmalıdır.

---

## 0. Önce kısa hatırlatma: oyunda "fiziksel / büyü" ve "stat" neyi değiştirir?

- **Stat (`scale`)**: skill'in hasarı / şifası / kalkanı hangi statın yüzdesi. Ör. "%112 INT" = INT x 1,12. Bir skill'in statını değiştirmek, o class'ın o stattaki değerine göre skill'i güçlendirir ya da zayıflatır. **Primary bonusu (Resilience, Hunter's Mark, Mana Echo, Lucky Escape) skill'in statına bağlı DEĞİL**, class'ın en yüksek statına bağlıdır; yani skill statı değişince primary bonusu değişmez.
- **Hasar türü (fiziksel / büyü)** yalnızca şunları değiştirir:
  - **Fiziksel** hasar hedefin **zırhı** (armor) ile azalır, **büyü** hasarı **büyü zırhı** (magic armor) ile. Azalma = zırh / (zırh + 30).
  - **Kritik nokta: oyunda büyü zırhı neredeyse hiç yok.** Yalnızca Anti-Mage'de 20 var (item'lerden küçük ekler dışında). Zırh ise herkeste var: Hexer 4, Archer/Cutthroat 5, Mage/Anti-Mage 6, Druid/Undead 8, Warrior 9, Paladin 11, Gambler 12, Defender 19 (+ kendi aurasıyla ~27).
  - Sonuç: **fizikselden büyüye geçen bir skill, Anti-Mage hariç herkese karşı güçlenir** (ortalama hedefe karşı ~%20-25), büyüden fiziksele geçen skill zayıflar. Yani bu ayar bir "tema" düğmesi gibi görünse de oyunda aslında bir **güç düğmesidir**.
  - Büyü hasarını Anti-Mage'in Spell Ward kalkanı (yalnızca büyü emer) emer ve Anti-Mage'in pasifi Mana Overflow yalnızca büyü hasarından dolar.
  - İsabet/kaçınma iki türde de aynıdır (fark yok).
- **Element** (fire, ice, holy, dark, nature, arcane, physical) çoğunlukla renk + yüzen yazıdaki ikondur. Mekanik etkisi yalnızca iki zayıflıkta: **undead etiketli birim holy'den x1,5** (bugün yalnızca Skeleton), **nature etiketli birim fire'dan x1,5** (bugün yalnızca Treant).
- **Önemli gözlem:** skill açıklamasında (tooltip) "physical / magic" yazmaz; oyuncu türü yalnızca elementten anlar. Bugün veride tutarlı bir kural var: **element "physical" olan her skill fiziksel, başka elementi olan her skill büyü.** Bu tutarlılık korunmalı (bir skill'in türü değişirse elementi de değişmeli).
- **Mevcut kurallar (combat.md > Hasar ölçekleme kuralı):** her hasar skill'in kendi statının yüzdesidir; bir skill'in tüm ölçekli etkileri **aynı statı** kullanır (test zorunlu kılıyor); skill statı class'ın **primary statıyla uyumlu** olmalıdır; çağrılan birimin hasarı birimin **kendi en yüksek statıyla** ölçeklenir.

---

## 1. Tablo: her skill

Kısaltmalar: **Fiz** = fiziksel, **Büyü** = büyü (magic), **—** = hasar/ölçek yok. Karar: **Koru** / **Değiştir (güçlü)** / **Değiştir (isteğe bağlı)**.

### Warrior (primary STR 15; STR/INT/DEX/LUCK 15/8/4/3)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden (tek satır) |
|---|---|---|---|---|---|---|
| Double Strike | Koşup uzun kılıçla çapraz iki kesik | Fiz / STR | physical | Fiz / STR | Koru | Çelik kılıç + kas gücü: ders kitabı STR. |
| Whirlwind | Kılıçla 3 tur dönüş, çelik rüzgâr halkası | Fiz / STR | physical | Fiz / STR | Koru | Rüzgâr halkası kılıçtan kopuyor, büyü değil. |
| Charge | Kılıç önde mızrak gibi atılış + sersemletme | Fiz / STR | physical | Fiz / STR | Koru | Bedenle çarpma. |
| Abyssal Cry | Kükreme, kızıl öfke; 3 saldırıya +STR | — (buff) | — | — | Koru | Verdiği bonus STR, tüm skill'ler STR olduğu için anlamlı. |

### Defender (primary STR 15; 15/10/3/2)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Tremor Slam | Zırhlı basış, sırayı sarsan darbe + Slow | Fiz / STR | physical | Fiz / STR | Koru | Ağırlık ve kas. |
| Taunt | Sert bağırış + STR kalkanı | Kalkan / STR | — | Kalkan / STR | Koru | Kalkan bedenden, STR uygun. |
| Guard | Kalkan bağı, hasar paylaşımı | — | — | — | Koru | Ölçek yok. |
| Fist Crush | Gökten 3 düşmanın başına dev çelik eldiven | Fiz / STR | physical | Fiz / STR | Koru | Gökten gelse de çelik ezme; Defender'ın büyü kimliği yok. |

### Archer (primary DEX 14; 6/8/14/2)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Quick Shot | Hızlı çekiş, tek ok + Haste | Fiz / DEX | physical | Fiz / DEX | Koru | Okçuluk = el becerisi. |
| Piercing Arrow | Ağır ok şeridi delip geçer | Fiz / DEX | physical | Fiz / DEX | Koru | Aynı. |
| Arrow Rain | Göğe oklar, 3x3 ok yağmuru | Fiz / DEX | physical | Fiz / DEX | Koru | Gerçek oklar. |
| Aimed Shot | Yavaş nişan, zırhın zayıf noktası (zırhın yarısını yok sayar) | Fiz / DEX | physical | Fiz / DEX | Koru | Zırh delme zaten fiziksel olmasını anlamlı kılıyor. |

### Cutthroat (primary DEX 15; 5/5/15/5)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Venom Edge | Zehirli hançerle çift kesik + Wound | Fiz / DEX | physical | Fiz / DEX | Koru | Hançer; Wound = kanama, element değişmesine gerek yok. |
| Saltire Cut | Çapraz X kesiği, merkez iki kez | Fiz / DEX | physical | Fiz / DEX | Koru | Bıçak. |
| Smoke Bomb | Kil bomba, duman (Blinded / Shrouded) | — | — | — | Koru | Hasar yok. |
| Backstab | Arkasına geçip sırttan saplama, kesin kritik | Fiz / DEX | physical | Fiz / DEX | Koru | Suikastçı = DEX. |

### Gambler (primary LUCK 12; 8/3/7/12)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Loaded Dice | Hileli kemik zar fırlatılır, %25 çifte vuruş | Fiz / LUCK | physical | Fiz / LUCK | Koru | v2 kılavuzu: "silahı gerçek nesneler". LUCK kimliğin ta kendisi. |
| High Stakes | Kan bahsi, yazı-tura, fırlatılan hançer | Fiz / LUCK | physical | Fiz / LUCK | Koru | Gerçek hançer. |
| Card Trick | İki kart bıçak gibi saplanır + rastgele durum | Fiz / LUCK | physical | Fiz / LUCK | Koru | Gerçek kart. |
| All In | Tüm mana altın zara dönüşür, atılır | Fiz / LUCK | physical | Fiz / LUCK | Koru | Mana bahis olarak harcanıyor ama vuran şey yine zar; büyüye çevirmek ultimate'ı zırhlılara karşı çok büyütür. |

### Hexer (primary LUCK 14; 8/5/3/14)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Evil Eye | Asada nazar gözü açılır, hedefte belirir + Omen | Büyü / LUCK | dark | Büyü / LUCK | Koru | Lanet = büyü; "uğursuzluk" LUCK (hexer.md tasarımı). |
| Withering Curse | Kandilden çürük damlar, zemin boyunca yayılır + Wither | Büyü / LUCK | dark | Büyü / LUCK | Koru | Aynı. Wither tiki de LUCK. |
| Jinx | Kırmızı iplik düğümlenir, boncuk çatlar | Büyü / LUCK | dark | Büyü / LUCK | Koru | Aynı. |
| Doom Mark | Kemik mühür çatlar, kara-mor ışık sütunu + Doom | Büyü / LUCK | dark | Büyü / LUCK | Koru | Doom da LUCK / büyü / dark. |

### Mage (primary INT 19; 6/19/3/2)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Fire Bolt | Avuçtaki alevden ateş oku | Büyü / INT | fire | Büyü / INT | Koru | Saf büyü. |
| Blizzard | Fırtına bulutu, buz mızrakları | Büyü / INT | ice | Büyü / INT | Koru | Saf büyü. |
| Mana Barrier | Dostu saran mana küresi, debuff temizler | Kalkan / INT | — | Kalkan / INT | Koru | Saf büyü. |
| Meteor | Gökte rün mührü, içinden kaya düşer + yanan zemin | Büyü / INT | fire | Büyü / INT | Koru | Kaya fiziksel görünse de büyüyle çağrılıyor; Mage'in kimliği büyü. |

### Anti-Mage (primary INT 15; 5/15/7/3; zırh 6, büyü zırhı 20)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Mana Steal | Hayalet izle atılıp rünlü kılıçla çapraz kesik, mana sökülür | Büyü / INT | arcane | Fiz / INT (element physical) | Değiştir (isteğe bağlı) | Görüntü bir kılıç kesiği; "büyü avcısı"nın büyü vurması ironik. Ama bu Anti-Mage'i zayıflatır (bkz. not). |
| Drain Field | Rün tabletleri alana çakılır, mana sökülür; boşalana %50 Silence + hasar | Büyü / INT (iç hasar) | arcane | Büyü / INT | Koru | Mühür büyüsü. |
| Spell Ward | Rün tabletleri dostun çevresinde büyü kalkanı | Büyü kalkanı / INT | — | aynı | Koru | Büyü. |
| Void Strike | Hedefte boşluk tekilliği, iğneler saplanır | Büyü / INT | arcane | Büyü / INT | Koru | Açıkça büyü. |

### Druid (primary INT 16; 8/16/5/1)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Thorn Whip | Asadan dikenli sarmaşık fışkırıp şaklar + Wound | Büyü / INT | nature | Büyü / INT | Koru | Sarmaşık asadan büyüyle doğuyor; doğa büyücüsü. |
| Nature's Wrath | Toprağın altından kökler ve dikenler fışkırır | Büyü / INT | nature | Büyü / INT | Koru | Aynı. |
| Rejuvenate | Tohum, meşe mührü, şifa ışığı + HoT | Şifa / INT | — | Şifa / INT | Koru | Aynı. |
| Summon Treant | Asa toprağa saplanır, kök koşar | — | — | — | Koru | Ölçek yok. |
| Verdant Blessing (pasif) | Çağırınca dostlara yaprak, şifa | Şifa / INT | — | Şifa / INT | Koru | Aynı. |

### Paladin (primary INT 13; 12/13/2/3)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Holy Strike | Hedefin üstünde ışıktan çekiç belirir, iner, haç damgası | Büyü / INT | holy | Büyü / INT | Koru | v2 bilinçli olarak "yerinden, gökten ışık" tasarlandı. (En yakın alternatif: bkz. not.) |
| Resurrection | Haçlı mühür, huzme, dost kalkar | — | — | — | Koru | Ölçek yok. |
| Judgment | Merkeze huzme, haç kollarında kutsal ateş (Holy Fire zemini) | Büyü / INT | holy | Büyü / INT | Koru | Kutsal büyü. |
| Radiance | Haçlı güneş: dostlara şifa, düşmanlara huzme | Büyü + şifa / INT | holy | aynı | Koru | Kutsal büyü. |
| Divine Light (pasif) | Tur başı en yaralı dosta şifa | Şifa / INT | — | Şifa / INT | Koru | Aynı. |

### Undead (primary INT 14; 12/14/2/2)
| Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|
| Bone Throw | Lich'in ruh ateşinde kıymıklar femur olur, turkuaz alev içinde fırlar + Slow | **Fiz / INT** | physical | **Büyü / INT, element dark** | **Değiştir (güçlü)** | Büyüyle yaratılıp ruh ateşiyle atılan kemik; class "Dark Mage"; INT'le ölçeklenen fiziksel vuruş tutarsız. Güç ayarı şart (bkz. not). |
| Wail of the Dead | Göğsünden kan-ruh, banshee çığlığı, zehir pusu | Büyü / INT (+zehir zemini INT) | dark (zemin: nature) | aynı | Koru | Karanlık büyü. Zemin elementi nature (zehir); dokunmaya gerek yok. |
| Dark Bond | Kemik zincirle dosta can bağı | — | — | — | Koru | Ölçek yok (oranlı). |
| Raise Dead | İskelet topraktan çıkar | — | — | — | Koru | Ölçek yok. |

### Çağrılar
| Birim | Skill | Neye benziyor | Şimdi | Element | Öneri | Karar | Neden |
|---|---|---|---|---|---|---|---|
| Skeleton (STR 15) | Bone Strike | Paslı kısa kılıç darbesi | Fiz / STR | physical | Fiz / STR | Koru | Paslı demir; STR en yüksek statı. |
| Skeleton | Bone Slash | Yanlara da değen kılıç savuruşu | Fiz / STR | physical | Fiz / STR | Koru | Aynı. |
| Treant (INT 13,5, STR 8) | Root Smash | Gökten / yerden ahşap kök yumruğu | Fiz / INT | physical | Fiz / INT, element **nature** | Değiştir (isteğe bağlı, yalnızca element) | Yumruk fiziksel kalmalı. STR daha doğal olurdu ama Treant'ın STR'si 8 (stat değişmeden olmaz) ve çağrı kuralı "en yüksek stat" diyor. Element nature yalnızca ikon/renk; mekanik etkisi yok. |
| Treant | Vine Snare | Kökler bacakları sarar, %25 Stun | Büyü / INT | nature | Büyü / INT | Koru | Doğa büyüsü. |

### Geometer (yalnızca test class'ı, havuzda yok)
Row Sweep, Column Spear, Block Slam, Cross Burst: hepsi Büyü / INT / arcane. **Koru** (şekil deneme aracı; dengesi önemsiz).

*(Kapsam dışı not: boss skill'leri tabloya alınmadı. Bridge Warden'ın Ash Brand'i "büyü / fire / STR" ölçekli; boss olduğu için primary kuralı yok, sorun değil.)*

---

## 2. Class notları

**Genel tablo: kadro zaten çok tutarlı.** Hasar türü primary statla neredeyse birebir örtüşüyor:
- STR (Warrior, Defender), DEX (Archer, Cutthroat), LUCK-kumarbaz (Gambler): **tamamı fiziksel.**
- INT (Mage, Anti-Mage, Druid, Paladin), LUCK-cadı (Hexer): **tamamı büyü.**
- **Tek istisna Undead** (Bone Throw fiziksel, Wail büyü) ve çağrısı **Treant** (Root Smash fiziksel, Vine Snare büyü).
- Hiçbir skill primary dışı bir statla ölçeklenmiyor (kural bunu zaten şart koşuyor; madde 178'de bir kez temizlenmişti).

| Class | Primary / kimlik | Skill seti tutarlı mı? | Not |
|---|---|---|---|
| Warrior | STR, kılıçlı ön saf, Rage | Evet | Abyssal Cry'ın "+%50 STR" bonusu tüm skill'lerin STR olmasına dayanıyor; bir skill başka stata geçerse bu bonus o skill'e işlemez. |
| Defender | STR, kalkanlı tank | Evet | INT 10 ikinci statı ama kimliği büyü değil; Fist Crush'ı büyüye çevirmek tanka gereksiz hasar verir. |
| Archer | DEX, okçu | Evet | Hepsi fiziksel: Defender'ın zırhı en çok Archer'ı sayar; Aimed Shot bunu dengeleyen araç. |
| Cutthroat | DEX, suikastçı | Evet | Aynı. |
| Gambler | LUCK, gerçek nesnelerle kumar | Evet | Tamamı fiziksel olduğu için zırhlılara karşı zayıf; bu bilinçli bir zayıf yan sayılabilir. All In'i büyüye çevirmek bu zayıflığı ultimate'ta siler. |
| Hexer | LUCK, lanetçi cadı | Evet | hexer.md bilinçli olarak "Luck = uğursuzluk" seçti; INT'e çekmek (INT 5) Hexer'i yarı yarıya zayıflatır. |
| Mage | INT, element büyücüsü | Evet | — |
| Anti-Mage | INT, zırhlı büyü avcısı, rünlü kılıç | Çoğunlukla | Tek soru işareti Mana Steal: görüntü kılıç kesiği, tür büyü. Fiziksele çevirmek temaya uyar ama Anti-Mage'i zırhlılara karşı zayıflatır. Ayrıca aynalı maçta (Anti-Mage vs Anti-Mage) bugün Mana Steal'i rakibin büyü zırhı ve Spell Ward'ı yer; fiziksel olunca yemez. |
| Druid | INT, doğa çağırıcısı | Evet | Dikenli kırbaç "fiziksel" görünebilir ama asadan büyüyle doğuyor; Druid'in tamamı doğa büyüsü olarak tutarlı. |
| Paladin | INT, haçlı şifacı | Evet | STR 12 / INT 13 neredeyse eşit. "Savaşçı rahip" yorumu istenirse Holy Strike fiziksel/STR yakın dövüş çekici olabilirdi; ama bu (a) primary dışı stat olur (kural), (b) v2 animasyonu "yerinden ışık çekici" olarak yapıldı, yeniden yapılması gerekir. Önermiyorum. |
| Undead | INT, karanlık büyücü (lich) | **Hayır, bir kopukluk var** | Bone Throw: INT'le ölçeklenen ama fiziksel olan tek class skill'i. Madde 178'de statı INT'e çekilirken türü "zırh davranışı değişmesin" diye fiziksel bırakılmıştı; tema gerekçesi yoktu. |
| Skeleton | STR çağrı | Evet | — |
| Treant | INT çağrı (STR 8) | Kabul edilebilir | Yumruk fiziksel ama INT ölçekli; bu çağrı kuralının ("en yüksek stat") ve madde 223'teki stat seçiminin bilinçli sonucu. Ömer'in "statlara dokunma" şartıyla STR'ye çekilemez. |

### Değişikliklerin yan etkileri (knock-on)

**Bone Throw: Fiz -> Büyü (element dark)**
- Primary bonusu: değişmez (Undead INT primary kalır, Mana Echo aynı).
- Zırh eşleşmesi: bugün Bone Throw'un hedefe göre kaybı: Hexer %12, Archer/Cutthroat %14, Mage/Anti-Mage %17, Druid/Undead %21, Warrior %23, Paladin %27, Gambler %29, Defender ~%47 (aurasıyla). Büyü olunca bu kayıp sıfırlanır, yalnızca Anti-Mage'e karşı %40 kayıp başlar (bugün %17). **11 class'ın ortalamasında Bone Throw ~%22-25 güçlenir.**
- Zincirleme etki: Undead'in pasifi Vampiric Bite verdiği hasarın %35'ini can olarak geri alır, Dark Bond bunu dosta da aktarır. Yani hasar artışı **şifaya da yansır**. Bone Throw 0 MP'lik temel saldırı olduğu için en sık kullanılan skill'i; Undead'in toplam gücüne etkisi küçük değil.
- Kazanan / kaybeden: Undead güçlenir; en çok Defender, Gambler, Paladin, Warrior gibi zırhlılara karşı. **Anti-Mage Undead'e karşı daha güçlü olur** (büyü zırhı, Spell Ward, Mana Overflow artık Bone Throw'u da yakalar).
- Dengeyi korumak için: Bone Throw gücü 1,12 -> **~0,90** civarı (ortalama hedefe karşı aynı hasar). Bu bir skill sayısıdır, karakter statı değil; kesin değer sim'le bulunmalı.
- Görsel: animasyon zaten turkuaz ruh ateşi; element dark olunca yüzen yazıda kuru kafa ikonu çıkar, renk mora döner. Yeni animasyon gerekmez.

**Mana Steal: Büyü -> Fiz (element physical) (isteğe bağlı)**
- Anti-Mage zayıflar: ortalama hedefe karşı ~%20 hasar kaybı (en çok Defender, Gambler, Paladin'e karşı). Dengelemek için güç 1,55 -> **~1,9**.
- Aynalı maçta tersine döner (rakip Anti-Mage'in büyü zırhı 20 artık işlemez).
- Mana yakma kısmı değişmez. Yüzen yazıdaki arcane ikonu kalkar.
- Kazanç küçük (yalnızca tema), risk orta: bu yüzden "isteğe bağlı".

**Root Smash: element physical -> nature (isteğe bağlı, yalnızca görsel)**
- Tür fiziksel kalır, denge hiç değişmez (kimse nature'a zayıf değil). Yalnızca yüzen yazıda yaprak ikonu ve yeşil renk. **Ama dikkat:** "element physical olmayan = büyü" tutarlılığını bozar (oyuncu yaprak ikonunu görüp büyü sanabilir). Bu yüzden bunu yapmak istersek önce o tutarlılığın bir kural olup olmadığına karar vermek gerek (bkz. bölüm 4, soru 5).

**Alan (AoE) dengesi:** önerilen hiçbir değişiklik alan skill'ine dokunmuyor. Alan skill'lerini (Whirlwind, Arrow Rain, Tremor Slam...) büyüye çevirmek, bir anda bütün tahtaya zırhsız hasar demek olurdu; bu yüzden toptan bir "tema düzeltmesi" en çok alan skill'lerinde riskli olurdu.

---

## 3. Özet ve öneri

**Sayım (tabloda 50 satır: 11 oynanabilir class'ın 44 skill'i + 2 ölçekli pasif + 4 çağrı skill'i; Geometer ayrıca):**
- **Değiştir (güçlü): 1** — Bone Throw (Fiz -> Büyü, element dark; güç ~0,90'a çekilerek).
- **Değiştir (isteğe bağlı): 2** — Mana Steal (Büyü -> Fiz), Root Smash (yalnızca element -> nature).
- **Stat (STR/DEX/INT/LUCK) değişikliği önerisi: 0.** Her skill zaten class'ının primary statıyla ölçekleniyor; tema açısından da hepsi oturuyor (kumarbazın zarı LUCK, cadının laneti LUCK, okçu DEX, kılıç STR, büyü INT). Primary dışı bir stata geçmek, karakter statlarına dokunmadan, skill'i ya çok zayıflatır (ör. Hexer INT 5) ya da mevcut "primary ile uyumlu" kuralını bozar.
- Geri kalan her şey: **Koru.**

**Beklenen denge riski (statlar sabitken):**
- Bone Throw yalnız başına değiştirilirse (güç ayarsız): Undead belirgin güçlenir (temel saldırısı ortalama ~%22-25, lifesteal ile şifası da), Anti-Mage Undead'e karşı biraz daha iyi olur. Güç ~0,90'a çekilirse net etki küçük kalır; asıl değişen eşleşmeler olur (Undead zırhlılara karşı iyileşir, Anti-Mage'e karşı kötüleşir). Risk: **düşük-orta**, tek bir sim turuyla kapatılabilir.
- Mana Steal değiştirilirse: Anti-Mage zayıflar; güç telafisiyle **orta** risk, kazanç yalnızca tema.
- Root Smash elementi: denge riski **yok**.

**Toptan değişikliğe değer mi?** **Hayır.** Kadro zaten temaya ve kimliğe büyük ölçüde uyuyor; "toptan" bakınca değişmesi gereken yalnızca bir skill çıkıyor. Bu oyunda fiziksel/büyü seçimi büyük ölçüde bir güç düğmesi (büyü zırhı neredeyse yok), bu yüzden tema için yapılan her çevirme bir denge değişikliği demek.

**Net öneri: yalnızca güçlü olanı yap.** Bone Throw'u büyü / dark yap, gücünü ~0,90'a çek, `npm run sim` ile Undead ve Anti-Mage oranlarına bak. Mana Steal ve Root Smash'i şimdilik olduğu gibi bırak (Ömer özellikle Anti-Mage'in "kılıçla vurduğunu hissetmek" isterse Mana Steal ikinci adım olabilir).

Ek küçük öneri (kural değil, arayüz): skill açıklamasına "Physical" / "Magic" kelimesi eklenebilir; bugün oyuncu türü yalnızca elementten tahmin ediyor. (Bu bir arayüz kararıdır, Ömer'e sorulmalı.)

---

## 4. Yeni kural / mekanik gerektiren fikirler (karar DEĞİL, Ömer'e soru)

Proje kuralı gereği aşağıdakiler önerilmiyor, yalnızca soru olarak sunuluyor. Hiçbiri yukarıdaki "yalnızca güçlü olanı yap" önerisi için gerekli değil.

1. **Hibrit ölçek (iki stat):** ör. Paladin Holy Strike = STR + INT, Anti-Mage Mana Steal = STR + INT, Treant Root Smash = STR + INT. Bugün test "bir skill'in tüm ölçekli etkileri aynı statı kullanır" diyor; bu yeni bir mekanik olur. *Soru: Ömer, iki statla ölçeklenen skill ister misin?*
2. **Karma hasar türü:** bir vuruşun yarısı fiziksel, yarısı büyü (ör. Meteor: kaya fiziksel + ateş büyü; Bone Throw: kemik fiziksel + ruh ateşi büyü). Yeni mekanik. *Soru: istenir mi?*
3. **Primary dışı stat:** ör. Gambler'ın kartı DEX, Paladin'in çekici STR. Mevcut "skill statı primary ile uyumlu olmalı" kuralını değiştirir. *Soru: bu kural gevşesin mi? (Önerim: hayır.)*
4. **Çağrı statı kuralı:** Root Smash'in STR olması için Treant'ın STR'si en yüksek olmalı (stat değişikliği) ya da "çağrı en yüksek statıyla ölçeklenir" kuralı değişmeli. *Soru: dokunulsun mu? (Önerim: hayır.)*
5. **"Element = tür" tutarlılığı:** bugün veride fiilen "element physical ise fiziksel, değilse büyü" geçerli ama yazılı bir kural değil. *Soru: bu yazılı kural olsun mu (ve teste bağlansın mı)? Olursa Root Smash'e nature elementi verilemez; olmazsa oyuncu ikonla türü karıştırabilir.*
6. **Büyü zırhının yaygınlığı:** fiziksel/büyü seçiminin "tema" kararı olabilmesi için birden çok class'ta büyü zırhı olması gerekir (bugün yalnızca Anti-Mage). Bu bir stat/denge kararıdır ve bu görevin kapsamı dışındadır. *Soru: ileride büyü zırhı diğer class'lara (ör. Paladin, Hexer) dağıtılsın mı?*

---

*Kaynaklar: `data/classes/*.json`, `data/summons/*.json`, `data/skills.json`, `data/statuses.json`, `data/grounds.json`, `data/formulas.json`, `src/engine/battle.ts` (zırh / büyü zırhı / kalkan), `src/engine/skill-info.ts`, `src/game/art-v2/<class>/vfx.ts` ve `src/game/vfx.ts` (Defender, Cutthroat) yorumları, `docs/design/combat.md`, `docs/design/classes/hexer.md`, `docs/design/open-questions.md` (madde 178, 223, 230).*

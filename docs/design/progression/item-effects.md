# Epic item özel etkileri: ÖNERİ LİSTESİ (Ömer seçecek)

> **Durum: UYGULANDI (Ömer seçimi 2026-10-10, madde 292).** Onaylanan 11 etki: 1 Opening Ward, 2 Mana Spring, 5 Second Wind, 6 Quick Start, 7 Steadfast, 8 Iron Will, 10 Giantslayer, 11 Warden's Oath, 12 Ember Heart, 13 Thrifty, 14 Bloodletter. **Reddedilen:** 3 First Strike, 4 Last Rites, 9 Keen Edge. Sayılar `data/items.json > effects` (metin, IP, motor kancası, değer); motor `UnitSetup.itemEffects` (`src/engine/types.ts > ItemEffects`), güç katmanı `src/progression/loadout.ts > equipmentEffects`. Kararlaştırılmamış 3 soru güvenli varsayılanla ve TEK veri anahtarıyla (`effectRules`): (a) etki IP'si Epic bütçesinin içinden (`ipFromBudget: true`), (b) aynı etki iki item'den toplanmaz, en yükseği (`stack: false`), (c) Endless'ta da aynı (`endless: true`).
>
> Epic atamaları: Dane Axe -> Giantslayer, Rune Staff -> Thrifty, Coat of Plates -> Warden's Oath, Great Helm -> Iron Will, Hawkeye Gloves -> Mana Spring, Swift Sabatons -> Quick Start, Ashen Locket -> Ember Heart. Opening Ward, Second Wind, Steadfast ve Bloodletter kayıtlı ama henüz bir item'de değil (yeni Epic'lere hazır). Uygulamada değişen sayılar: Mana Spring eylem başına bir kez; Quick Start IP 1,5 (Swift Sabatons bütçesine sığsın diye; 20% tur dolu başlangıç tek seferlik, küçük); Bloodletter oranı %15 (öneri %3 neredeyse görünmüyordu).
>
> Kodda hazır olan kanca: `ItemDef.effect` (id) + `data/items.json > effects` kaydı (şu an BOŞ). `validateItems` etkiyi yalnızca Epic'te ve kayıtlıysa kabul eder; motorda davranış yok.

**Ölçü:** IP = Item Points (1 IP ~ +%1 savaş gücü, items.md 4.1). Bir Epic item'in bütçesi bölüm 1 sonunda (ilvl 10) yuvaya göre ~3,9 (Helm/Gloves/Boots/Trinket), ~6,3 (Armor), ~7,2 (Weapon). Etkinin IP'si bütçeye dahil edilir (etki gelince statlar o kadar küçülür) ya da Epic çarpanı ayrıca artırılır: karar Ömer'in.

**İlke:** küçük, genel (sınıftan bağımsız), tek cümleyle anlatılır, düz hasar yok (hasar ölçekleme kuralı korunur), skill değiştirmez (skill ağacının işi), YZ'nin değer terazisi ile ölçülebilir.

| # | Etki (oyun içi ad önerisi) | Tek satır açıklama (İngilizce metin önerisi) | Uygun yuva / sınıf | IP tahmini | Motor kancası |
|---|---|---|---|---|---|
| 1 | **Opening Ward** | "Begin each battle with a shield of 8% max HP." | Armor, Helm; ön saf (Warrior, Defender, Paladin, Undead) | 3 | VAR (kalkan sistemi): savaş başında kendine kalkan etkisi; yeni: "savaş başı" tetikleyicisi |
| 2 | **Mana Spring** | "On a critical hit, gain 4 MP." | Gloves, Trinket; INT ve LUCK sınıfları | 2 | YENİ: kritik vuruş olayına kanca (olay `damage.crit` var, tetikleyici yok) |
| 3 | **First Strike** | "Your first skill each battle has +15% power." | Weapon; herkes | 2 | YENİ: birim başına "ilk skill" bayrağı + tek seferlik powerMult (powerMult var) |
| 4 | **Last Rites** | "When an ally falls, heal 4% max HP." | Trinket, Helm; destek ve tank | 2 | YENİ: dost ölümü olayına kanca (olay `death` var) |
| 5 | **Second Wind** | "Once per battle, below 30% HP, heal 12% max HP." | Armor, Trinket; herkes | 3 | YENİ: can eşiği tetikleyicisi (Lucky Escape benzeri tek seferlik bayrak) |
| 6 | **Quick Start** | "Start each battle with 20% of a turn already charged." | Boots; DEX sınıfları | 3 | VAR kısmen: sıra sayacı (`charge`); yeni: savaş başı başlangıç değeri |
| 7 | **Steadfast** | "Cannot be pulled or pushed." | Boots, Armor; ön saf | 2 | VAR: boss'lardaki displacement bağışıklığı birime açılır |
| 8 | **Iron Will** | "Debuffs on you have a 15% chance to last 1 turn less." | Helm, Armor; herkes (STR'nin Resilience'ı ile toplanır, tavan %50) | 2 | VAR kısmen: Resilience kodu; yeni: item kaynaklı şans |
| 9 | **Keen Edge** | "Critical hits deal +10% damage." | Gloves, Weapon; DEX/LUCK | 2 | VAR: `critMultAdd` (stat gibi; "etki" yerine stat da olabilir) |
| 10 | **Giantslayer** | "+8% damage against elites and bosses." | Weapon; herkes (seferde değerli) | 2 | YENİ: hedefin `tier`'ine göre hasar çarpanı (tier alanı var) |
| 11 | **Warden's Oath** | "Allies next to you take 5% less damage." | Armor, Helm; Defender, Paladin | 3 | YENİ: yan komşu aurası (yan komşuluk haritası `sideNeighbors` var) |
| 12 | **Ember Heart** | "Regenerate 1 MP at the start of each turn while above 50% HP." | Trinket; INT | 2 | VAR kısmen: tur başı yenilenme (`mpRegen`); yeni: koşul |
| 13 | **Thrifty** | "Your first skill each battle costs no MP." | Trinket, Gloves; INT | 2 | YENİ: tek seferlik bedel indirimi (madde 212 bedel sistemi) |
| 14 | **Bloodletter** | "Hits against enemies below 30% HP heal you for 3% of the damage." | Weapon; ön saf | 2 | VAR kısmen: lifesteal (Vampiric Bite); yeni: koşul |

**Önerim (ilk tur için 4-6 tane):** 1 Opening Ward, 3 First Strike, 5 Second Wind, 7 Steadfast, 9 Keen Edge, 10 Giantslayer. Gerekçe: hepsi tek cümlelik, sınıftan bağımsız, çoğunun motor kancası kısmen var; YZ değeri ölçmesi kolay.

**Açık sorular (Ömer):**
1. Hangi etkiler? (listeden seç; yenilerini de ekleyebilirsin)
2. Etkinin gücü Epic bütçesinin içinden mi (statlar küçülür) yoksa ekstra mı (Epic daha güçlü)?
3. Aynı etkiden iki item takılırsa toplanır mı, en yükseği mi geçerli? (Öneri: en yükseği.)
4. Etkiler Endless'ta da aynı mı? (Öneri: evet, aynı katalog.)

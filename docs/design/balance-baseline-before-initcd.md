# Balans temeli: initialCooldown ve YZ bağlam değişikliğinden ÖNCE

Kaynak: `npx tsx src/sim/cli.ts 3000 <seed>` (seed 1, 5001, 10001; her biri 3000 savaş), cooldown değişikliği (Aimed Shot / Meteor / All In 4->3), initialCooldown ve YZ bağlam mantığı uygulanmadan ÖNCE alındı. Sonraki balans ajanı bu dosyayla karşılaştırır. Kompozisyon listesi uzun olduğu için çıkarıldı (özeti: tüm koşularda 3 uç değer takım, ör. Anti-Mage + Gambler + Mage + ... %29).

Not: Warrior'ın 4. skill'i Abyssal Cry ve diğer bazı 4. skill'ler (Warrior Abyssal Cry) hiç seçilmiyordu (kullanım raporunda görünmüyor = %0).

=== SEED 1 ===
Savaş: random-battle (her seed'de farklı takımlar). Yapay zeka vs yapay zeka, 3000 savaş (seed 1..3000).

GENEL
  Oyuncu tarafı kazandı : 1493 (%49,8)
  Düşman tarafı kazandı : 1507 (%50,2)
  Ortalama savaş uzunluğu: 47,6 tur (tüm birimlerin turları toplamı)
  (İki taraf simetrik; eşit hızda önce oynayan taraf seed'e göre değişir. Beklenen: %50 civarı.)

SINIF DENGESİ (hedef kazanma oranı %40-60; sınıfın tek tarafta olduğu savaşlar)
  sınıf     savaş  kazanma  ölüm   hasar  şifa  kalkan   (savaş başına, o sınıfın birimi)
  Archer     1472  % 55,6  % 67     99     3      0
  Defender   1447  % 52,3  % 76     29    11      6
  Paladin    1441  % 52,0  % 60     97    58      0
  Warrior    1460  % 51,4  % 57    130    17      0
  Druid      1485  % 50,6  % 61     62    46      0
  Undead     1496  % 49,6  % 60    116    23      0
  Anti-Mage   1479  % 47,1  % 78     68     2      3
  Gambler    1517  % 46,0  % 63    101     6      0
  Mage       1509  % 45,7  % 73    109     1     11
  Tüm sınıflar hedef aralığın içinde.


SKILL KULLANIMI (sınıfın hamlelerinin yüzde kaçı; bedelli bir skill %40'ı aşmamalı)
  Warrior  (savaşa katılan birim başına 5,4 hamle, 0,0 pas)
      Double Strike      % 84  (bedelsiz)
      Whirlwind          % 13
      Charge             %  4
  Paladin  (savaşa katılan birim başına 4,5 hamle, 0,0 pas)
      Holy Strike        % 58  (bedelsiz)
      Judgment           % 18
      Radiance           % 18
      Resurrection       %  7
  Mage  (savaşa katılan birim başına 2,3 hamle, 0,0 pas)
      Fire Bolt          % 54  <-- baskın
      Mana Barrier       % 21
      Meteor             % 20
      Blizzard           %  6
  Undead  (savaşa katılan birim başına 4,5 hamle, 0,0 pas)
      Bone Throw         % 33  (bedelsiz)
      Wail of the Dead   % 30
      Raise Dead         % 21
      Blood Rite         % 16
  Archer  (savaşa katılan birim başına 6,7 hamle, 0,0 pas)
      Quick Shot         % 57  (bedelsiz)
      Piercing Arrow     % 22
      Arrow Rain         % 13
      Aimed Shot         %  9
  Druid  (savaşa katılan birim başına 4,8 hamle, 0,0 pas)
      Thorn Whip         % 47  (bedelsiz)
      Rejuvenate         % 21
      Summon Treant      % 19
      Nature's Wrath     % 13
  Defender  (savaşa katılan birim başına 3,3 hamle, 0,8 pas)
      Taunt              % 45  <-- baskın
      Guard              % 29
      Fist Crush         % 20
      Tremor Slam        %  6
  Anti-Mage  (savaşa katılan birim başına 3,4 hamle, 0,0 pas)
      Mana Steal         % 32  (bedelsiz)
      Void Strike        % 32
      Drain Field        % 26
      Spell Ward         % 10
  Gambler  (savaşa katılan birim başına 5,2 hamle, 0,0 pas)
      Loaded Dice        % 69  (bedelsiz)
      All In             % 18
      High Stakes        %  8
      Card Trick         %  6
  UYARI: baskın skill: Mage Fire Bolt %54, Defender Taunt %45
=== SEED 5001 ===
Savaş: random-battle (her seed'de farklı takımlar). Yapay zeka vs yapay zeka, 3000 savaş (seed 5001..8000).

GENEL
  Oyuncu tarafı kazandı : 1454 (%48,5)
  Düşman tarafı kazandı : 1546 (%51,5)
  Ortalama savaş uzunluğu: 47,6 tur (tüm birimlerin turları toplamı)
  (İki taraf simetrik; eşit hızda önce oynayan taraf seed'e göre değişir. Beklenen: %50 civarı.)

SINIF DENGESİ (hedef kazanma oranı %40-60; sınıfın tek tarafta olduğu savaşlar)
  sınıf     savaş  kazanma  ölüm   hasar  şifa  kalkan   (savaş başına, o sınıfın birimi)
  Archer     1499  % 55,8  % 67     98     3      0
  Defender   1488  % 52,6  % 75     30    11      6
  Paladin    1469  % 52,1  % 60     96    58      0
  Druid      1477  % 50,8  % 60     63    47      0
  Undead     1503  % 49,6  % 60    117    23      0
  Warrior    1469  % 49,1  % 58    131    17      0
  Anti-Mage   1459  % 47,6  % 78     67     2      3
  Mage       1506  % 46,3  % 73    110     1     11
  Gambler    1498  % 45,9  % 65    102     6      0
  Tüm sınıflar hedef aralığın içinde.


SKILL KULLANIMI (sınıfın hamlelerinin yüzde kaçı; bedelli bir skill %40'ı aşmamalı)
  Warrior  (savaşa katılan birim başına 5,5 hamle, 0,0 pas)
      Double Strike      % 83  (bedelsiz)
      Whirlwind          % 13
      Charge             %  4
  Paladin  (savaşa katılan birim başına 4,5 hamle, 0,0 pas)
      Holy Strike        % 57  (bedelsiz)
      Judgment           % 18
      Radiance           % 17
      Resurrection       %  7
  Mage  (savaşa katılan birim başına 2,3 hamle, 0,0 pas)
      Fire Bolt          % 53  <-- baskın
      Mana Barrier       % 22
      Meteor             % 20
      Blizzard           %  5
  Undead  (savaşa katılan birim başına 4,5 hamle, 0,0 pas)
      Bone Throw         % 33  (bedelsiz)
      Wail of the Dead   % 30
      Raise Dead         % 21
      Blood Rite         % 16
  Archer  (savaşa katılan birim başına 6,6 hamle, 0,0 pas)
      Quick Shot         % 57  (bedelsiz)
      Piercing Arrow     % 21
      Arrow Rain         % 13
      Aimed Shot         %  9
  Druid  (savaşa katılan birim başına 4,9 hamle, 0,0 pas)
      Thorn Whip         % 47  (bedelsiz)
      Rejuvenate         % 21
      Summon Treant      % 19
      Nature's Wrath     % 13
  Defender  (savaşa katılan birim başına 3,3 hamle, 0,7 pas)
      Taunt              % 45  <-- baskın
      Guard              % 29
      Fist Crush         % 19
      Tremor Slam        %  6
  Anti-Mage  (savaşa katılan birim başına 3,3 hamle, 0,0 pas)
      Mana Steal         % 32  (bedelsiz)
      Void Strike        % 32
      Drain Field        % 25
      Spell Ward         % 10
  Gambler  (savaşa katılan birim başına 5,1 hamle, 0,0 pas)
      Loaded Dice        % 68  (bedelsiz)
      All In             % 18
      High Stakes        %  8
      Card Trick         %  6
  UYARI: baskın skill: Mage Fire Bolt %53, Defender Taunt %45
=== SEED 10001 ===
Savaş: random-battle (her seed'de farklı takımlar). Yapay zeka vs yapay zeka, 3000 savaş (seed 10001..13000).

GENEL
  Oyuncu tarafı kazandı : 1484 (%49,5)
  Düşman tarafı kazandı : 1516 (%50,5)
  Ortalama savaş uzunluğu: 47,5 tur (tüm birimlerin turları toplamı)
  (İki taraf simetrik; eşit hızda önce oynayan taraf seed'e göre değişir. Beklenen: %50 civarı.)

SINIF DENGESİ (hedef kazanma oranı %40-60; sınıfın tek tarafta olduğu savaşlar)
  sınıf     savaş  kazanma  ölüm   hasar  şifa  kalkan   (savaş başına, o sınıfın birimi)
  Defender   1524  % 54,7  % 76     29    11      6
  Archer     1454  % 53,8  % 68     97     3      0
  Paladin    1477  % 53,1  % 59     98    58      0
  Warrior    1453  % 52,4  % 57    131    17      0
  Undead     1456  % 49,5  % 60    118    23      0
  Druid      1478  % 48,8  % 61     63    47      0
  Anti-Mage   1430  % 48,0  % 78     69     2      3
  Gambler    1474  % 46,3  % 63     99     6      0
  Mage       1442  % 43,0  % 73    112     1     11
  Tüm sınıflar hedef aralığın içinde.


SKILL KULLANIMI (sınıfın hamlelerinin yüzde kaçı; bedelli bir skill %40'ı aşmamalı)
  Warrior  (savaşa katılan birim başına 5,4 hamle, 0,0 pas)
      Double Strike      % 83  (bedelsiz)
      Whirlwind          % 13
      Charge             %  4
  Paladin  (savaşa katılan birim başına 4,5 hamle, 0,0 pas)
      Holy Strike        % 57  (bedelsiz)
      Judgment           % 18
      Radiance           % 18
      Resurrection       %  7
  Mage  (savaşa katılan birim başına 2,3 hamle, 0,0 pas)
      Fire Bolt          % 54  <-- baskın
      Mana Barrier       % 21
      Meteor             % 19
      Blizzard           %  5
  Undead  (savaşa katılan birim başına 4,5 hamle, 0,0 pas)
      Bone Throw         % 33  (bedelsiz)
      Wail of the Dead   % 30
      Raise Dead         % 21
      Blood Rite         % 16
  Archer  (savaşa katılan birim başına 6,5 hamle, 0,0 pas)
      Quick Shot         % 56  (bedelsiz)
      Piercing Arrow     % 21
      Arrow Rain         % 13
      Aimed Shot         %  9
  Druid  (savaşa katılan birim başına 4,9 hamle, 0,0 pas)
      Thorn Whip         % 47  (bedelsiz)
      Rejuvenate         % 20
      Summon Treant      % 19
      Nature's Wrath     % 13
  Defender  (savaşa katılan birim başına 3,3 hamle, 0,7 pas)
      Taunt              % 45  <-- baskın
      Guard              % 30
      Fist Crush         % 19
      Tremor Slam        %  6
  Anti-Mage  (savaşa katılan birim başına 3,4 hamle, 0,0 pas)
      Mana Steal         % 32  (bedelsiz)
      Void Strike        % 32
      Drain Field        % 26
      Spell Ward         % 10
  Gambler  (savaşa katılan birim başına 5,1 hamle, 0,0 pas)
      Loaded Dice        % 69  (bedelsiz)
      All In             % 18
      High Stakes        %  7
      Card Trick         %  6
  UYARI: baskın skill: Mage Fire Bolt %54, Defender Taunt %45

---

# SONRA (cooldown 4->3, initialCooldown, bağlamsal YZ; aynı komutlar, ayarlama YAPILMADI)

Değişiklikler: `docs/design/open-questions.md` madde 207. Başlangıç cooldown'ları: Meteor 1, Fist Crush 2, Void Strike 2, All In 2, Radiance 1 (Aimed Shot, Abyssal Cry, Summon Treant, Raise Dead: yok). 4. yuvadaki x1,5 ağırlık kalktı, yerine `skill.ai` bağlam ipuçları + 'tactic' önceliği + MP ayırma.

| Sınıf kazanma % | seed 1 | seed 5001 | seed 10001 | (önce, 3 seed) |
|---|---|---|---|---|
| Archer | 55,8 | 57,4 | 57,6 | 55,6 / 55,8 / 53,8 |
| Paladin | 55,1 | 53,5 | 55,0 | 52,0 / 52,1 / 53,1 |
| Druid | 53,1 | 51,8 | 50,3 | 50,6 / 50,8 / 48,8 |
| Undead | 51,0 | 49,1 | 51,2 | 49,6 / 49,6 / 49,5 |
| Warrior | 49,7 | 50,8 | 50,4 | 51,4 / 49,1 / 52,4 |
| Anti-Mage | 49,5 | 52,3 | 51,7 | 47,1 / 47,6 / 48,0 |
| Defender | 48,7 | 49,7 | 47,7 | 52,3 / 52,6 / 54,7 |
| Mage | 44,0 | 43,2 | 41,8 | 45,7 / 46,3 / 43,0 |
| Gambler | 43,5 | 42,5 | 44,3 | 46,0 / 45,9 / 46,3 |

Oyuncu tarafı kazanma: %51,3 / %49,9 / %49,9 (önce %49,8 / %48,5 / %49,5). Ortalama savaş uzunluğu ~50,5 tur (önce ~47,6).

4. skill kullanımı (sınıfın hamlelerinin %'si, 3 seed benzer): Abyssal Cry 9 (önce 0), Judgment 22-23 (önce 18), Radiance 14 (18), Meteor 10-11 (20), Raise Dead 21-22 (21), Aimed Shot 23 (9), Summon Treant 19 (19), Fist Crush 13 (19-20), Void Strike 21-22 (32), All In 9 (18).

Gözlem (yorum yok): Mage ve Gambler en düşük sınıflar, Archer en yüksek. Warrior'da Abyssal Cry kullanımı MP (20) ile sınırlı; başlangıç cooldown'u verilirse %0'a düşer. Meteor'a başlangıç cooldown'u 2-3 verilirse Mage %38-40'ın altına iner (deneme: 2 -> %38,5; 3 -> Meteor kullanımı %2).

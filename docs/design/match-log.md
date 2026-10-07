# Maç kaydı (Debug > Copy match data)

Amaç: Ömer bir savaşı oynar/izler, **Debug > Copy match data** (ya da sonuç ekranındaki "Copy match data" bağlantısı) ile kaydı panoya kopyalar ve Claude'a yapıştırır. Claude her hamlenin NEDEN yapıldığını kayıttan cevaplar ("Warrior neden 3. turda Whirlwind yerine Double Strike kullandı?").

- Kod: `src/engine/match-log.ts` (saf, Phaser/DOM yok; `MatchLog` sınıfı), AI gerekçesi `src/engine/ai.ts` > `explainChoice`, panoya yazma `src/ui/match-copy.ts`.
- Kayıt savaş başladığı andan itibaren tutulur (BattleScene'de her zaman açık; `debugState.matchLog`). Savaş bitmeden de kopyalanabilir ("o ana kadar"); `test` modunda da çalışır. Simülatörde (`npm run sim`) ve headless koşuda kayıt yoktur.
- Kayıt motoru ve RNG'yi DEĞİŞTİRMEZ: motora yalnızca salt-okunur gözlemci (`Battle.observer`) bağlanır; AI açıklaması `chooseAction`'ın verdiği kararın izinden (`AiTrace`) okunur. `tests/match-log.test.ts` açıklama/kayıt açıkken ve kapalıyken savaşların birebir aynı olduğunu kilitler.
- Boyut: varsayılan en çok ~190.000 karakter. Önce "compact" kademesi (dost/düşman yalnızca can, daha az aday); yine aşılırsa SONDAKİ hamleler kırpılır ve başlıkta `TRUNCATED`, sonda `[truncated: N later move(s) omitted]` yazar. Savaş sonu özeti (`## RESULT`) her zaman sondadır.
- **Yeni karar kuralı/öncelik eklenince `explainChoice` (ve gerekirse `pickerView`/`noPickReason`) güncellenir.**

## Biçim (v1)

Düz metin, üç bölüm:

1. **Başlık**: `game:` sürüm / derleme zamanı / commit; `seed`, `mode` (turns/test), takım boyutları, açık debug ayarları; `status` (finished/in progress), kaydedilen hamle sayısı; kısa açıklama (legend).
2. **`## ROSTER`**: savaş başındaki her birim: yuva (`cell`), STR/INT/DEX/LUCK, maxHP/maxMP, spd, armor/marmor, evasion/accuracy/crit, can/MP yenilenmesi, primary bonusu, pasif, AI profili. Altında her skill: id, ad, hedef türü, bedel, `cd` (cooldown), `initialCd`, hareket türü, etkiler (`damage(scale=str power=1.1)`...) ve varsa `aiHint` (AI bağlam koşulu).
3. **`## MOVES`**: her hamle bir blok. Sonda **`## RESULT`**: kazanan, birim başına verilen/alınan hasar ve iyileştirme.

Birim etiketi: `P0:Warrior` = taraf (P oyuncu / E düşman) + takım içi sıra + sınıf adı; `Es0:Treant` çağrılan. `cN` = yuva (sıra*3+şerit; 0 = en ön).

### Bir hamle bloğu

```
### #32 | turn 32 | E1:Warrior (own move 4) | AI | Double Strike -> P2:Anti-Mage
before: <aktörün durumu: can, MP, rage, hız (spd), sayaç (ctr), zırh, cooldown'lar cd[...], durumlar st[...], zemin etkileri>
  foes: <canlı düşmanlar: can, kalkan sh/msh, MP, zırh ar, durumlar>
  allies: <canlı dostlar>
  between moves ...: <önceki hamleden bu hamleye kadar olanlar: yer hasarı, tur başı şifa/MP, biten durumlar>
ai: profile ... | priorities kill > tactic > aoe > damage | focus lowest_ratio
  WHY: <tek cümlelik özet: hangi öncelik, neden bu seçildi, bir sonraki en iyi aday>
  steps: kill=PICKED ... ; ya da kill=none (neden) ; tactic=none (neden) ; aoe=none (neden) ; damage=PICKED ...
  candidates:
    * <seçilen aday>  ... [chosen]
    - <puanlı ama kaybeden aday> ... score N [lost]
    - <skill> [skipped: neden] hedef dmg net ; hedef dmg net
    x <skill> [blocked: neden] ...
  unavailable: <kullanılamayan skill'ler: cooldown/MP/Rage/menzil/hedef yok>
  mp reserve: <MP ayırma (reserveMp) varsa>
  global skills: <Rest/Skip/Move değerlendirmesi ve sonucu>
result: <olay özeti: hasar (CRIT, absorbed, guard redirect), DODGED/MISSED, iyileştirme, kalkan, durum +/-, ölüm, ground, rage/MP değişimi...>
after: <aktörün sonraki durumu> ;; <etkilenen birimlerin sonraki durumu>
```

- Başlıktaki `turn` = savaşta o ana kadar oynanan hamle sayısı + 1 (tüm birimler); `own move` = bu birimin kaçıncı hamlesi.
- Kontrol: `AI` (yapay zeka: gerekçe bloğu var), `PLAYER` (oyuncu: yalnızca seçilen eylem + durum, AI gerekçesi yok), `AUTO` (sersemlik/ölüm nedeniyle otomatik pas).
- Eylem türleri: skill (hedefler, alan skill'inde `center cell`), global skill (Rest / Skip Turn / Move: hedef yuva), `Pass`, `Stunned (turn skipped)`, `Died at turn start (turn skipped)`.

### AI aday satırı

```
* Whirlwind hits 3 foe(s) dmg 33.7 hit 0.81 per [P2:Anti-Mage 19@0.81 LETHAL, P1:Warrior 14@0.83, ...] kills [P2:Anti-Mage] cost 7.5 net 26.2 score 24992.5 {hint} [lost]
```

| Alan | Anlamı |
|---|---|
| `shape rect 2x3 @cell 4 -> cells [..]` | Alan (şekil) skill adayı (tüm alan skill'leri): şekil adı (`row`/`column`/`plus`/`rect RxC`; aşamalıysa `staged row` / `staged distance` eki), anchor hücre (boş olabilir), kapsanan tüm hücreler; ardından `hits N foe(s)`. Hamle başlığı: `(center cell 4 -> cells [..])`; skill satırında `area shape rect 2x3 staged row`. Aşamalı skill'in `result` satırları `[stage N]` önekiyle (aşama sırasıyla). X şekli `x center x2` (merkez 2 vuruş). İki tahtaya atılabilen alan (Smoke Bomb, `area_any`): aday satırında `@cell N (own side|foe side)`, kendi tarafında `covers N unit(s) [..]`, Blinded/Shrouded değeri `mitigation N` (önlenen beklenen hasar, can-eşdeğer); hamle başlığında `(center cell N on own/foe side -> cells [..])`. AI bağlam koşulları (blocked notu): `minAllyTargets`, `minTargetMaxHpShare`, `targetBehindFront` |
| `hits N foe(s)` / `center cell` | Alan (AOE) skill'inde vurulan düşman sayısı ve merkez hücre; `per [...]` hedef başına beklenen hasar `ortalama@isabet`, `LETHAL` = bu vuruş canını bitirir |
| `dmg` | Hedeflerin canı/kalkanıyla sınırlı TOPLAM beklenen hasar, isabet şansıyla çarpılmış (alan skill'inde tüm hedeflerin toplamı); `hit` ana hedefe isabet şansı |
| `kills [...]` | Beklenen hasarı canını bitiren (ve isabet şansı `hit.aiKillMin` üstünde olan) düşmanlar |
| `heal`, `selfheal`, `shield`, `burn`, `buff`, `revive` | Şifa, kendine şifa (lifesteal), kalkan, yakılan mana, self-buff net değeri, diriltme |
| `cost` | MP/can bedelinin skora yansıyan ağırlıklı değeri (`ai.json` > `mpCostWeight`/`hpCostWeight`) |
| `net` | genel değer - bedel (yedek seçim ve global skill kararları bunu kullanır) |
| `score` | **Kazanan önceliğin kendi puanı** (kill: öldürülenlerin tehdidi x 1000 - bedel; damage: hasar + kendine şifa + 0,6 x mana yakma + curse - bedel; aoe: toplam hasar + curse - bedel...; `curse` yalnızca Hexer lanetlerinde 0'dan büyük). Yalnızca o önceliğin havuzundaki adaylarda bulunur; seçim en yüksek score'ludur |
| `{...}` | etiketler: `hint` (skill'in `ai` bağlam ipucu var), `summon`, `empowered` (ceset tüketen çağrı: tüketilecek ceset var), `unfed` (ceset yok, çağrı zayıf gelir), `taunt`, `guard`, `selfBuff`, `hpCost` (aday düşük can kuralına (`minHpRatioForHpCost`) tabi: sabit can bedeli ya da can bahsi; oranlı can bedelli Wail of the Dead bu etiketi taşımaz, madde 247); çağrı adayında ayrıca `summonValue` (birimin en iyi ham hasarı x ömür x profil `summonValueShare`) |
| `[chosen]` | seçildi |
| `[lost]` | kazanan önceliğin havuzundaydı ama puanı daha düşük |
| `[skipped: ...]` | kazanan önceliğin havuzu dışında (ör. "not on the focus target", "not in the pool of kill") |
| `[blocked: ...]` | elendi: skill'in `ai` bağlam ipucu sağlanmadı (hangi koşul: `minTargets 2 (hits 1)`...) ya da MP başka bir skill için ayrıldı (`MP kept in reserve for X`) |

Öncelik sırası profilden gelir (`data/ai.json`): `kill > tactic > aoe > damage` gibi. İlk uyan öncelik seçimi verir; sonrakiler denenmez. `steps` satırı her önceliğin neden uymadığını yazar (ör. `aoe=none (living foes 2 < aoeMinTargets 3)`). Hiçbiri uymazsa `fallback`.

Çağrı (`summon`) önceliği (madde 222, 230): ceset tüketen çağrıda (Raise Dead) tüketilecek düşman cesedi varsa en ucuz çağrı seçilir ve EN TEHLİKELİ ceset tüketilir; aday satırında `-> own cell N` (çağrı yuvası) ve `consumes E1:Paladin (danger 60.4: (threat 21 + best skill 22.8 Radiance) x HP 0.92 x reviver 1.5); other corpses E2:Mage danger 39.1` (seçilen ceset, puanı, gerekçesi ve seçilmeyen cesetler); karar satırında `corpse`; yoksa çağrı beslenmemiş gelir ve yalnızca `summonValue - cost` bu turun en iyi başka hamlesinin net değerinden düşük değilse seçilir (`steps` satırında `no corpse to consume (summon would be unfed): summon value X < best other move Y`). `result` satırları: `... consumes the corpse of E1:Defender (cell 1): it can no longer be revived`, `... summons Ps0:Skeleton EMPOWERED (fed: corpse consumed) (hp .., str .., own board cell 1)` ya da `unfed (no corpse to consume)`; ölüm satırında `DIED (leaves a revivable corpse)`; sebepli durumda `+stun 1t (from ..) [vines]`.

Kalkan kancaları, dispel, Dark Bond, yarım turn (madde 240, 241: kancalar her darbede tetiklenir): aday satırında `cleanse N` (Mana Barrier'ın dost debuff'larını silme değeri), `bond N` (Dark Bond'un bağ boyunca dosta gidecek beklenen lifesteal kopyası), `half-turn x0.5 tempo N` (yarım turn skill'i; tempo = 0,5 x bu turun en iyi tam turn hamlesi); kalkan kancalı kalkanın yakabileceği MP `burn` içinde. ROSTER skill satırında `turnCost 0.5` ve `excludeSelf`. `result` satırları: `P0:Warrior's Spell Ward (from P1:Anti-Mage) absorbed 12 from E0:Mage: burns 8 MP, dispels fortify` (kanca tetiği), `E0:Mage -fortify (DISPELLED by P0:Warrior [spell_ward])`, `... burns 8 MP of E0:Mage (now 40) [spell_ward]`, `... +2 MP (now 12) [mana_barrier]`, `P0:Warrior +dark_bond 3t (from P1:Undead) bond with P1:Undead`, `-dark_bond (bond broken)`, `P1:Undead heals P0:Warrior 6 (Dark Bond copy of life steal)`. Bağlam koşulu notları: `maxTargetHpRatio`, `minFoeMagicMp`, `minFoeBuffs`.

Hexer lanetleri (Omen / Doom / Wither / Jinx): aday satırında `curse N` (ertelenmiş lanet değeri: yığını doldurmayan Omen'ler Luck x 0,6 x `omenValueShare` + Wither tikleri) ve `{...}` içinde hedef başına notlar: `E0:Warrior: omens 1->2 omenValue 7.1 omen timer 3` (Omen eklenir, Doom yok; kritikte doluyorsa `(crit -> 3: DOOM 25)`), `omens 2->3 DOOM 25.2@crit 0.12` (yığın dolar, Doom'un beklenen hasarı `dmg` içinde, öldürüyorsa `kills`), `omens 2->3 detonate 3 omen x1.5 = 37.8@crit 0.12` (Doom Mark), `wither 3x3 value 7.6`, `mitigation 9.8 (jinxed: acc -20%, crit 0, next attack only)`. Bağlam koşulu notları (blocked): `minTargetStacks omen 2 (has 1)`, `minStatusMitigation 6 (got 3.1)`. `result` satırları: `P2:Hexer -> E0:Warrior: +omen 2 (crit) [2/3]`, `E0:Warrior +omen x2 3t (from P2:Hexer) [omen timer 3]`, `DOOM on E0:Warrior: 3 omen(s) x1.5 (detonated by P2:Hexer Doom Mark)` / `(completed by ...)`, ardından `... 37 dmg [DOOM]`; süre bitiminde `DOOM (omens expired) on E0:Warrior: 2 omen(s) x1 (snapshot of P2:Hexer)` (tur başı etkileri arasında), `... 3 dmg [wither tick]`, `Ill Omen (P2:Hexer): 2 omen(s) pass E1:Mage -> E2:Archer [2]`, `-omen (burst into Doom)`, `-omen (passed on by Ill Omen)`, `-jinxed (used up by its own attack)`. Durum listesinde yığın `omenx2:3` (yığın 2, kalan 3 tur). Oranlı bedel: ROSTER skill satırında `HP 20% of current` (Wail of the Dead), `unavailable` notunda `not enough HP (cost N, has M)` o anki bedelle.

Global skill'ler (`global skills:` satırı): sınıf hamlesi öldürücü ya da işlevselse (şifa, çağrı, kalkan, taunt...) hiç denenmez; aksi halde Rest/Skip/Move'un taktik değeri, şimdiki sınıf hamlesinin değeriyle (`class move value`) karşılaştırılır; tehlike (`danger`) ve her kuralın eşiği yazılır.

## Örnek soru ve cevap

"Warrior (E1) neden Double Strike kullandı, Whirlwind değil?" -> kaydın `#32` bloğu: öncelik `kill` (ilk sıra) çalıştı; hem Double Strike hem Whirlwind Anti-Mage'i öldürüyor ama kill puanı `tehdit x 1000 - bedel`: Double Strike bedeli 0 (score 25000), Whirlwind 7,5 MP bedelli (24992,5), yani en ucuz öldürücü seçilir. AOE önceliğine (Whirlwind'in önceliği) hiç gelinmedi.

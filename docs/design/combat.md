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
Zehir, yanma, sersemleme (tur kaybı), yavaşlatma, hızlandırma, kalkan, taunt, lanet. Her efektin süresi tur/tik cinsinden veri dosyasında tanımlı.

## Ömer'e açık sorular
`open-questions.md` içinde.

## Hasar ölçekleme kuralı (Ömer kararı)
**Tüm hasarlar (damage), aksi açıkça belirtilmedikçe, skill'in kendi statı neyse (skill'in `scale` alanındaki stat: str/int/dex/luck) o statın değerine göre oran (yüzde) alır.**
- Kapsam: `damage` etkisi, `ground` (zehir/yanık/kutsal ateş) etkisi, çağrılan birimlerin hasarı (birimin kendi en yüksek statı). Bir skill'in tüm ölçekli etkileri (hasar, yer etkisi, şifa, kalkan) aynı statı kullanır; skill statı class'ın primary statıyla uyumlu olmalıdır.
- **Aksi belirtmek (istisna):** etkide `scale` alanı hiç yazılmaz (selfDamage, manaBurn gibi zaten ölçeksiz etki türleri) ya da değer sabittir; bu durumda skill'in `_not`/açıklamasında gerekçe yazılır ve istisna `tests/damage-scale-rule.test.ts` içindeki `SCALE_EXCEPTIONS` listesine skill adı + etki türü + gerekçeyle eklenir. Listede olmayan ölçeksiz hasar etkisi test'i kırar.
- Yansıyan (thorns) hasar da aynı kurala uyar: Treant'ın Thorn Shield'ı `thorns` etkisiyle Str x power kadar sabit hasar yansıtır (scale alanı zorunlu; test DAMAGE_LIKE listesinde).
- Mevcut istisnalar: Abyssal Cry `selfDamage` (maks can yüzdesi bedeli), Mana Steal ve Drain Field `manaBurn` (sabit MP, can hasarı değil).

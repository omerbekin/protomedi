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

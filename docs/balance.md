# Denge Hedefleri (TASLAK — Ömer düzenleyecek)

## Savaş uzunluğu
- Normal savaş: ortalama 4-7 oyuncu aksiyonu / karakter başına yaklaşık 3-5 tur.
- Boss savaşı: 10-15 tur.

## Class dengesi (simülasyonla ölçülür)
- Aynı seviye, eşit item'lı eşleşmelerde hiçbir class'ın kazanma oranı diğerlerinin ±%10 dışına çıkmamalı.
- Hiçbir tek skill tüm savaşların %40'ından fazlasında kullanılan "tek doğru hamle" olmamalı.

## Ölçüm (`npm run sim`)
- Parti kompozisyonu × düşman grubu × 1.000-10.000 savaş koşturur.
- Rapor (Türkçe, düz metin): kazanma oranı, ortalama tur, ölen karakter dağılımı, hasar/şifa payı, skill kullanım oranları.
- Ömer "X zayıf/güçlü" dediğinde: önce rapor, sonra veri dosyasında ayar, sonra yeni rapor.

## Karar (Ömer, 2026-10-04)
- Hedef: yapay zeka vs yapay zeka, her seed'de farklı takımlarla, taraf kazanma oranı **%50**; sınıf kazanma oranları **%40-60** (ideal ~%50).
- Ölçüm: `npm run sim -- 20000` (rapor), korunan sınır: `tests/balance.test.ts`.

# Görsel Rehber

- Stil: pixel art, yandan görünüm.
- Oyun çözünürlüğü **1920x1080 (HD)** (Ömer kararı, 2026-10-04). Karakterler ekranda yaklaşık 140x200 piksel yer kaplar (`data/battle-layout.json` > `characterSize`). Sprite kaynak boyutu açık soru (bkz. open-questions 12).
- Palet: tek sabit palet kullanılır (öneri: 32 renk; ilk iş Ömer onayıyla `assets/palette.json` oluşturulur).
- Animasyon seti: `idle`, `attack`, `cast`, `hit`, `death`, `defend`. Hepsi yatay sprite sheet, kare başına sabit boyut.
- Arka planlar: 1920x1080; oranı farklı görsel ekranı kaplayacak şekilde ölçeklenir, taşan kenar kırpılır. Dosya: `assets/backgrounds/<id>.jpg/png`. 2-3 katman parallax (opsiyonel).
- Placeholder aşaması: class rengine boyalı basit blok karakter. Gerçek sprite aynı dosya adıyla gelince otomatik değişir.
- UI: pixel fontlu, büyük dokunma hedefleri, yatay ekrana göre yerleşim.

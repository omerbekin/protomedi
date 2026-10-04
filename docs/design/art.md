# Görsel Rehber

- Stil: pixel art, yandan görünüm.
- Sanal çözünürlük 480x270. Karakter sprite'ı hedef boyutu: **32x32** (boss'lar 64x64+).
- Palet: tek sabit palet kullanılır (öneri: 32 renk; ilk iş Ömer onayıyla `assets/palette.json` oluşturulur).
- Animasyon seti: `idle`, `attack`, `cast`, `hit`, `death`, `defend`. Hepsi yatay sprite sheet, kare başına sabit boyut.
- Arka planlar: 480x270, 2-3 katman parallax (opsiyonel).
- Placeholder aşaması: class rengine boyalı basit blok karakter. Gerçek sprite aynı dosya adıyla gelince otomatik değişir.
- UI: pixel fontlu, büyük dokunma hedefleri, yatay ekrana göre yerleşim.

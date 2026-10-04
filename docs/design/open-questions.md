# Açık Sorular (agentlar varsayım yaptıkça buraya ekler)

1. ~~Sıra sistemi~~ Cevaplandı (2026-10-04): hıza (SPD) göre sıra; sayaç modeli uygulandı (SPD yüksek = daha sık oynar). Hız değişimi efektleri (hızlandırma/yavaşlatma) henüz yok.
2. Kaynak sistemi: MP, öfke, can gibi class'a özel kaynaklar mı, tek ortak kaynak mı?
3. ~~4. class ne olacak?~~ Cevaplandı: Mage (Ömer, 2026-10-04). Oyuncu: Warrior/Paladin/Mage/Undead.
4. Savaş sonunda iyileşme: HP/MP savaşlar arasında dolar mı, yoksa ocak/dinlenme düğümüne mi bağlı?
5. Karakter ölümü: kalıcı mı, savaş sonunda dirilir mi?
6. Level/ilerleme: XP ile mi, yoksa item/skill ağacıyla mı?
7. Palet: 32 renkli palet önerisi onaylanıyor mu?

## İskelet kurulumunda yapılan varsayımlar (2026-10-04)
8. Savaş ekranı renkleri **geçici** (`data/battle-layout.json` > `colors`). Palet onaylanınca `assets/palette.json`'a taşınacak.
9. Yuva yerleşimi: parti ve düşmanlar iki sıra halinde zikzak dizildi (biri önde biri arkada); 5. düşman arka-üst sırada. Uygun mu?
10. ~~Ekran ölçekleme~~: geçersiz, Ömer çözünürlüğü 1920x1080 HD yaptı (2026-10-04).
11. Yayın için GitHub Pages seçildi (Cloudflare Pages yerine): ücretsiz, test geçmezse yayın yapılmıyor. Cloudflare tercih edilirse değiştirilebilir.

## Melee Attack / HD adımında yapılan varsayımlar (2026-10-04)
12. HD'ye geçince karakter sprite boyutu: 32x32 pixel art 4-6 kat büyütülerek mi kullanılacak, yoksa daha büyük ve detaylı (ör. 128x128+) sprite mı çizilecek? Şimdilik placeholder 140x200.
13. Melee Attack hasarı: ATK x 1.0 - DEF x 0.5, ±%10 sapma, en az 1 (data/formulas.json). Kritik vuruş ve kaçınma (CRIT/EVA) henüz hesaba katılmıyor.
14. Tüm karakterlerin statları (HP, MP, ATK, DEF, MAG, RES, SPD) geçici; hepsi data/classes ve data/enemies altında.
15. ~~Training Dummy~~ kaldırıldı; ilk savaş artık 4v4 (Ömer kararı): Oyuncu Warrior/Paladin/Mage/Undead, düşman Warrior/Archer/Mage/Druid.
16. ~~Sıra sistemi~~ eklendi (bkz. madde 27). Düşman yapay zekası da eklendi (madde 28).
17. ~~Oyun dili~~ Cevaplandı (2026-10-04): tüm oyun içi arayüz İngilizce.
18. Arka plan görselinin kaynağı/lisansı (assets/CREDITS.md): kendi çizimin mi, bir yapay zekâ aracından mı, bir siteden mi?

## 4v4 + 3'er skill adımında yapılan varsayımlar (2026-10-04)
19. **Kaynak sistemi (soru 2'ye geçici cevap):** herkesin MP'si var; Warrior'ın MP'si Öfke yerine geçiyor. Tek istisna Undead'in Blood Rite'ı: MP değil **can** harcıyor (canı yetmiyorsa kullanılamaz, kendini öldüremez). Class'a özel kaynaklar (Öfke, lanet) sonra eklenebilir.
20. **Skill sayıları geçici.** Hasar çarpanları, bedeller ve şifa/kalkan miktarları `data/skills.json` içinde; `npm run sim` raporundan okunabilir.
21. **Kalkan süresizdir:** tükenene kadar durur (tur sistemi olmadığı için süre tutulamıyor). Sıra sistemi gelince süreli yapılabilir.
22. **Skill etkileri şimdilik anlık.** Zehir, sersemleme, yavaşlatma, taunt, lanet gibi durum efektleri (combat.md taslağı) henüz yok; bu yüzden skill'lerin hiçbiri durum efekti vermiyor. Örneğin Warrior'a taunt, Undead'e lanet eklemek için önce durum efekti sistemi gerekir.
23. **Paladin'in undead bonusu:** Holy Strike undead etiketli hedefe 1.5 kat vurur (classes.md'de "undead'e karşı bonus" yazıyor). Şu an karşı takımda undead olmadığı için savaşta görünmüyor; testle doğrulandı.
24. **Düşman isimleri oyuncularla aynı** (Warrior, Mage). Ayırt etmek için renk, yön ve kırmızı can çubuğu kullanılıyor. İsimler değişsin mi (ör. "Dark Warrior")?
25. **Druid'in çağırdığı Treant** (HP 70, saldırır) arka sıradaki 5. yuvaya gelir. Boş yer yoksa Summon Treant kullanılamaz; çağrılan ölünce yer tekrar boşalır. Druid ölürse Treant kalır.
26. **Komut veren karakteri sen seçiyorsun** (oyuncuya dokunarak). Sıra sistemi gelince bu otomatikleşecek. Düşmanları denemek için debug menüsündeki "Komut veren" düğmesi kullanılıyor.

## Sıra + yapay zeka + test modu adımında yapılan varsayımlar (2026-10-04)
27. **Sıra formülü:** her tikte herkesin sayacı SPD kadar dolar, 100'e ulaşan oynar, oynayınca sayacından 100 düşer (taşan kısım korunur). Eşit sayaçta parti önce başlar. Hızlı karakter orantılı daha sık oynar (SPD 12, SPD 6'nın 2 katı). Hiç beklenmeden başlayan ilk tur için rastgele ön avantaj yok: herkes 0'dan başlar, bu yüzden en hızlı (Archer) ilk oynar. Uygun mu?
28. **Yapay zeka öncelikleri** (`data/ai.json`, profil başına): 1) öldürebiliyorsa öldür (en tehlikeli hedefi seç), 2) yaralı dostu iyileştir, 3) çağrı yap, 4) kalkan çek, 5) 3+ düşman varsa herkese vuran skill, 6) odak hedefe en verimli hasar. Sıra profile göre değişir (ör. Druid: öldür > iyileştir > çağır > hasar; Archer en az canlıya odaklanır). Yapay zeka hasarı tahmin ederken rastgeleliği kullanmaz, ortalama değeri baz alır; bu yüzden "öldürebilir" bazen ±%10 sapma yüzünden ıskalayabilir.
29. ~~MP bitince pas~~ Cevaplandı (2026-10-04): MP yenilenmesi eklendi (madde 34).
30. **Oyuncu tarafı kontrolü:** sıra oyuncuya gelince komutu sen verirsin; bir karakter hiçbir şey yapamıyorsa turu otomatik pas geçilir. Debug menüsünde "Auto-play my party (AI)" ile oyuncu tarafını da yapay zekaya oynatabilirsin.
31. **Test modu:** eski serbest mod olduğu gibi duruyor (sıra yok, istediğin karakterle istediğin kadar oyna, düşmanlar kendiliğinden oynamaz). Yalnızca debug menüsünden: "Mode: ... Switch to Test".
32. ~~İlk dengesizlik gözlemi~~ Cevaplandı: hedef oyuncu kazanma oranı %50. Veri ayarlandı (madde 36).
33. **Placeholder çizimleri** sınıfı simgeler: Warrior miğfer+kılıç, Paladin hale+haçlı kalkan, Mage sivri şapka+asa, Undead kuru kafa, Archer kukuleta+yay, Druid boynuz+yapraklı asa, Treant ağaç. Gerçek sprite gelince aynı isimle otomatik değişir.

## Sprite + MP yenilenmesi + cooldown adımında yapılan varsayımlar (2026-10-04)
34. **MP yenilenmesi:** her karakter kendi turunun başında `mpRegen` kadar MP kazanır (Warrior 2, Paladin 3, Mage 4, Undead 2, düşman Warrior 2, Archer 3, düşman Mage 4, Druid 4, Treant 0). Maksimumu aşmaz. Yalnızca sıralı modda; test modunda yok. Değerler karakter başına `data/classes` ve `data/enemies` içinde.
35. **Cooldown (bekleme süresi):** güçlü skill'ler kullanılınca, kullanıcının kendi turlarıyla sayılan bir süre kilitlenir (başka karakterlerin turu sayılmaz). `cooldown: 3` = kullandıktan sonraki 2 tur kullanılamaz, 3. turda tekrar hazır. Bedelsiz temel saldırılarda ve Fire Bolt, Soul Drain, Holy Strike, Frost Bolt gibi ucuz skill'lerde yok. Değerler: Power Strike 2, Whirlwind 3, Lay on Hands 2, Radiance 3, Blizzard 2, Meteor 3, Blood Rite 2, Crushing Blow 2, Shield Wall 3, Piercing Arrow 2, Arrow Rain 3, Lightning Storm 3, Mana Barrier 2, Rejuvenate 2, Summon Treant 4. Test modunda cooldown yok.
36. **Denge ayarı (hedef %50):** MP yenilenmesi ve cooldown sonrası oyuncu kazanma oranı %14'e düşmüştü. Üç değer ayarlandı: düşman Archer ATK 17 -> 15, oyuncu Mage HP 70 -> 90, oyuncu Undead HP 80 -> 95. 1000 savaşta oyuncu %51 kazanıyor. Dikkat: sonuç bu üç değere çok duyarlı (Archer ATK 4 puan değişince oran %13 ile %47 arasında oynuyor); yeni karakter/skill eklendikçe  ile yeniden bakılmalı.
37. **Karakter görselleri:** Ömer'in gönderdiği sayfadan 12 karakter kesildi, 8'i sınıflara eşlendi (tablo: `assets/CREDITS.md`). Treant için uygun karakter olmadığından placeholder ağaç kaldı. Karakterler ekranda en fazla 190x300 kutuya oranı korunarak sığdırılıyor ve ayakta duran tek bir resim olarak kullanılıyor (saldırı/hasar animasyonu sprite karesi yerine kodla: atılma, beyaz yanıp sönme). Gerçek animasyon kareleri gelince `attack.png` vb. aynı klasöre konur.
38. **Arka plan ve karakter görsellerinin lisansı** belirsiz (kendi çizimin mi, yapay zeka çıktısı mı, satın alındı mı?). Yayına çıkmadan önce kesinleştirilmeli.
39. **Yuva düzeni değişti:** büyük sprite'lar için karakterler arası mesafe 175 piksele çıktı; 5. düşman yuvası (çağrı yeri) artık sağ uçta, aynı zemin sırasında.

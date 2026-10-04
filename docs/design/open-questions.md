# Açık Sorular (agentlar varsayım yaptıkça buraya ekler)

1. Sıra sistemi: sayaç (ATB benzeri) modeli mi, yoksa her "tur" başında hıza göre yeniden sıralama mı? (combat.md'de sayaç önerildi.)
2. Kaynak sistemi: MP, öfke, can gibi class'a özel kaynaklar mı, tek ortak kaynak mı?
3. 4. class ne olacak?
4. Savaş sonunda iyileşme: HP/MP savaşlar arasında dolar mı, yoksa ocak/dinlenme düğümüne mi bağlı?
5. Karakter ölümü: kalıcı mı, savaş sonunda dirilir mi?
6. Level/ilerleme: XP ile mi, yoksa item/skill ağacıyla mı?
7. Palet: 32 renkli palet önerisi onaylanıyor mu?

## İskelet kurulumunda yapılan varsayımlar (2026-10-04)
8. Savaş ekranı renkleri **geçici** (`data/battle-layout.json` > `colors`). Palet onaylanınca `assets/palette.json`'a taşınacak.
9. Yuva yerleşimi: parti ve düşmanlar iki sıra halinde zikzak dizildi (biri önde biri arkada); 5. düşman arka-üst sırada. Uygun mu?
10. Ekran 480 pikselden darsa (dikey telefon) oyun tamsayı olmayan oranla küçültülüyor; yatay telefonda ve büyük ekranlarda tamsayı ölçek (keskin piksel) korunuyor.
11. Yayın için GitHub Pages seçildi (Cloudflare Pages yerine): ücretsiz, test geçmezse yayın yapılmıyor. Cloudflare tercih edilirse değiştirilebilir.

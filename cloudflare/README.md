# Embers of Valdoria lobi sunucusu (Cloudflare Worker)

Bu küçük sunucu yalnızca iki oyuncuyu **buluşturur**: lobi kodunu tutar ve iki tarayıcının birbirini bulması için gereken
bağlantı bilgisini (WebRTC "teklif/yanıt" ve adres adayları) aktarır. Oyun hamleleri buradan geçmez; iki tarayıcı arasında
doğrudan akar. Tasarım: `../docs/design/multiplayer.md`.

## Ömer için adım adım kurulum (bir kez, ~10 dakika)

1. **Cloudflare hesabı aç:** https://dash.cloudflare.com/sign-up (ücretsiz plan; kredi kartı gerekmez). E-postanı doğrula.
2. **Bilgisayarda bu klasörü aç:** komut satırında
   ```
   cd C:\Users\Omer\Projects\proto-game-iskelet\game\cloudflare
   npm install
   ```
3. **Giriş yap:** `npx wrangler login` -> tarayıcı açılır, Cloudflare hesabınla "Allow" de.
4. **Yayınla:** `npx wrangler deploy`
   - İlk seferde bir `workers.dev` alt alan adı seçmen istenebilir (ör. `omerbekin`). Bunu bir kez seçersin.
   - Sonunda şuna benzer bir adres yazar: `https://protomedi-lobby.omerbekin.workers.dev`
5. **Adresi oyuna yaz:** `https` yerine `wss` koyarak `game/data/multiplayer.json` dosyasındaki `signalingUrl` alanına yaz:
   ```json
   "signalingUrl": "wss://protomedi-lobby.omerbekin.workers.dev"
   ```
   (Ya da adresi Claude'a ver, o yazsın.) Sonra değişikliği `main`'e gönder; GitHub Pages yayınlayınca Multiplayer menüsü çalışır.
6. **Kontrol:** tarayıcıda `https://protomedi-lobby.<senin-adın>.workers.dev/` adresini aç: "Embers of Valdoria lobby server OK" yazmalı.

Kod güncellenirse yalnızca 4. adım (`npx wrangler deploy`) tekrarlanır. Sunucunun kayıtlarını canlı izlemek: `npx wrangler tail`.

## Maliyet

Ücretsiz plan yeterli: Workers günde 100.000 istek, Durable Objects (SQLite) günde 100.000 istek + 13.000 GB-sn. Bir maç kabaca
50-300 istek eder; günde yüzlerce maç bedava kotada kalır. Kota dolarsa o gün yeni lobi açılamaz; para çekilmez (ücretsiz planda
kart yok). Rakamlar 2026 itibarıyla; güncel hali: https://developers.cloudflare.com/workers/platform/pricing/

## Röle yedeği

İki tarayıcı doğrudan bağlanamazsa (bazı mobil operatör / şirket ağları) oyun mesajları bu sunucu üzerinden aktarılır. Yalnızca
doğrudan bağlantı 2 kez denenip başarısız olunca devreye girer; mesajlar okunmaz, saklanmaz. Doğrudan bağlantı kurulunca da
sunucu bağlantısı kapatılır (maç sunucusuz sürer). Maç başına istek hesabı: `../docs/design/multiplayer.md` bölüm 9.2.

## Sunucunun gördüğü veriler

- Lobi kodu, rol (kurucu/katılan), rastgele sekme kimliği (kişisel değil), oyuncuların IP adresi (her web sunucusu gibi).
- WebRTC bağlantı bilgisi (SDP / ICE adayları: iki tarayıcının yerel ve dış IP adresleri dahil) yalnızca öbür oyuncuya aktarılır,
  saklanmaz. Kalıcı olarak yalnızca iki sekme kimliği tutulur; lobi 2 saat boşta kalınca silinir.
- Oyun hamleleri ve takımlar normalde sunucuya gitmez; yalnızca röle yedeğinde (doğrudan bağlantı kurulamazsa) okunmadan aktarılır.
  Oyuncu adı hiçbir zaman sunucuya gönderilmez (röle modunda ad hiç paylaşılmaz).

## Yerel test (internete çıkmadan)

```
cd game/cloudflare
npm install
npm run dev          # http://127.0.0.1:8787 (wrangler dev, yerel Durable Object)
```
Oyunu ayrı bir pencerede `npm run dev` ile aç ve adrese `?mpserver=ws://127.0.0.1:8787` ekle:
`http://localhost:5173/?mpserver=ws://127.0.0.1:8787`. Bu ek yalnızca oyun localhost'tan açıldığında geçerlidir (yayındaki
sayfada yok sayılır). İki sekmeyle: birinde Host lobby, diğerinde davet linki (ya da kod).

Hızlı sunucu denemesi (sunucu açıkken): `node scripts/smoke.mjs` lobi kurallarını (kurucu/katılan, dolu lobi, izinsiz köken,
boyut sınırı, röle aktarımı, ayrılma) gerçek WebSocket ile dener.

## Ayarlar (`wrangler.toml`)

- `ALLOWED_ORIGINS`: oyunun açılabileceği adresler (GitHub Pages + localhost). Oyun başka bir adrese taşınırsa buraya eklenir.
- Kurallar ve sınırlar: `src/lobby-logic.ts` (mesaj boyutu 24 KB / röle yükü 16 KB, eş başına 10 sn'de 100 mesaj, eş 50 sn sessizse "yok", lobi ömrü 2 saat).

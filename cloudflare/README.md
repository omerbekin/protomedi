# Embers of Valdoria Cloudflare Worker (oyun sitesi + lobi sunucusu)

Tek Worker, tek adres: **https://eov.backinn.com.tr** (Cloudflare ücretsiz plan; ücretli hiçbir özellik kullanılmaz).

- **Oyun** (`/`): oyunun derlenmiş dosyaları (`../dist`, `npm run build` çıktısı) Workers Static Assets ile sunulur. Bu istekler
  Worker kodunu çalıştırmaz; ücretsiz ve sınırsızdır.
- **Lobi** (`/lobby`): yalnızca iki oyuncuyu **buluşturur**: lobi kodunu tutar ve iki tarayıcının birbirini bulması için gereken
  bağlantı bilgisini (WebRTC "teklif/yanıt" ve adres adayları) aktarır. Oyun hamleleri buradan geçmez; iki tarayıcı arasında doğrudan
  akar. Oyundaki adres: `wss://eov.backinn.com.tr/lobby` (`../data/multiplayer.json`). Tasarım: `../docs/design/multiplayer.md`.
- GitHub Pages (https://omerbekin.github.io/protomedi/) aynen sürer ve aynı lobiye bağlanır.

## Kurulum adım adım (Ömer + koordinatör)

Ön koşul: `backinn.com.tr` Cloudflare hesabında "Active" (ad sunucuları Cloudflare'i gösteriyor).
Komutlar komut satırında, oyun klasöründe (`C:\Users\Omer\Projects\proto-game-iskelet\game`) çalıştırılır.

1. **Paketleri kur (bir kez):** `npm install` ve `npm --prefix cloudflare install` (wrangler sabit sürüm 4.148.0, zaten listede).
2. **Giriş (bir kez):** `npm --prefix cloudflare exec -- wrangler login` -> tarayıcı açılır, Cloudflare hesabıyla **Allow**
   (Ömer onaylar). Kontrol: `npm --prefix cloudflare exec -- wrangler whoami` hesabın adını yazmalı.
3. **(İsteğe bağlı) Kuru deneme:** `npm --prefix cloudflare run check`: hesaba hiçbir şey göndermeden yapılandırmayı, tipleri ve
   yüklenecek dosyaların ücretsiz plan sınırlarını denetler (önce `npm run build`).
4. **Yayınla (tek komut):** `npm run deploy:cf`
   - Oyunu derler (`npm run build`), dosya sınırlarını denetler, sonra tek `wrangler deploy` ile oyun dosyalarını + lobi kodunu
     yükler ve `eov.backinn.com.tr` adresini Worker'a bağlar (**Custom Domain**: DNS kaydı ve SSL sertifikası otomatik kurulur;
     panelde elle alan adı ekleme YOK).
   - İlk yayında lobi deposu (Durable Object, SQLite) da kendiliğinden kurulur.
   - Hata "DNS record already exists" gibi bir şey derse: Cloudflare paneli > backinn.com.tr > DNS > Records'ta `eov` adlı eski
     kaydı sil, komutu tekrarla.
5. **Kontrol:**
   - https://eov.backinn.com.tr açılmalı (oyun). İlk yayında sertifika birkaç dakika sürebilir.
   - https://eov.backinn.com.tr/lobby -> "Embers of Valdoria lobby server OK".
   - Oyunda Multiplayer > Host lobby: kod çıkmalı; ikinci cihazda/sekmede davet linki ya da kodla katılınca maç başlamalı.
     GitHub Pages sürümü de aynı lobiye bağlanır.
   - Sunucuya ulaşılamazsa oyun "Cannot reach the multiplayer server" der (çökmez).

Güncelleme: oyun ya da lobi kodu değişince yalnızca 4. adım (`npm run deploy:cf`) tekrarlanır.
Canlı kayıt izlemek: `npm --prefix cloudflare run tail`.

## Ücretsiz plan sınırları (2026; güncel hali: https://developers.cloudflare.com/workers/platform/pricing/)

- **Statik dosyalar (oyun):** istekler ücretsiz ve sınırsız; sürüm başına en çok 20.000 dosya, dosya başına en çok 25 MiB
  (bugün ~210 dosya, toplam ~19 MiB, en büyüğü ~2,3 MiB; `scripts/check-assets.mjs` her yayından önce denetler).
- **Worker istekleri (yalnızca /lobby):** günde 100.000; istek başına 10 ms CPU.
- **Durable Objects (yalnızca SQLite tabanlı; ücretsiz planda tek seçenek):** günde 100.000 istek, 13.000 GB-sn süre, toplam 5 GB
  depolama. Lobi boşta "uyur" (hibernation), boşta süre sayılmaz; kayıt 2 saat boşta kalınca silinir.
- Bir maç kabaca 50-300 istek eder; günde binlerce maç bedava kotada kalır. Kota dolarsa o gün yeni lobi açılamaz (oyunun kendisi
  açılmaya devam eder); **para çekilmez** (ücretsiz planda kart yok, ücretli plana kendiliğinden geçiş yok).

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
npm run build                 # oyun klasöründe (yerel Worker ../dist'i de sunar; dist yoksa açılmaz)
cd cloudflare
npm run dev                   # http://127.0.0.1:8787 (oyun + /lobby, yerel Durable Object)
```
Oyunu ayrı bir pencerede `npm run dev` ile aç ve adrese `?mpserver=ws://127.0.0.1:8787` ekle:
`http://localhost:5173/?mpserver=ws://127.0.0.1:8787`. Bu ek yalnızca oyun localhost'tan açıldığında geçerlidir (yayındaki
sayfada yok sayılır). İki sekmeyle: birinde Host lobby, diğerinde davet linki (ya da kod).

Hızlı sunucu denemesi (sunucu açıkken): `node scripts/smoke.mjs` lobi kurallarını (kurucu/katılan, dolu lobi, izinsiz köken,
boyut sınırı, röle aktarımı, ayrılma) gerçek WebSocket ile dener.

## Ayarlar (`wrangler.toml`)

- `routes`: `eov.backinn.com.tr` Custom Domain. Tek seviye alt alan adı şart (ücretsiz Universal SSL yalnızca `*.backinn.com.tr`'yi
  kapsar). `workers_dev = false`: workers.dev adresi kapalı, tek adres bu.
- `[assets]`: oyun dosyaları `../dist`; yalnızca `/lobby` ve `/lobby/*` Worker koduna gider (`run_worker_first`). Önbellek kuralı
  `../public/_headers` (içerik özetli `/assets/*` dosyaları 1 yıl önbellekte).
- Durable Object `new_sqlite_classes`: ücretsiz plan şartı, değiştirme.
- `ALLOWED_ORIGINS`: lobiye bağlanabilen oyun adresleri (eov.backinn.com.tr, GitHub Pages, localhost). Oyun başka bir adrese
  taşınırsa buraya eklenir.
- Kurallar ve sınırlar: `src/lobby-logic.ts` (mesaj boyutu 24 KB / röle yükü 16 KB, eş başına 10 sn'de 100 mesaj, eş 50 sn sessizse
  "yok", lobi ömrü 2 saat).

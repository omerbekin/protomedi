Defender VFX animasyon paketi

11 yeni animasyon, toplam 88 kare. Önceki toz bulutu denemesi ayrıca 07-dust-puff klasöründe bulunur.
Her animasyon: 8 kare, 256x256 piksel, 10 FPS, 0.8 saniye.
spritesheet.png: 1024x512, 4 sütun x 2 satır. Soldan sağa, önce üst sonra alt satır.
frame-01.png ... frame-08.png: ayrı şeffaf PNG kareleri.
preview.gif: animasyon sonunda 0.5 saniye boş bekleme eklenmiş döngü önizlemesi. Bu boş kare sprite sheet'e dahil değildir.
animation.json: ölçüler, zamanlama ve kare sırası.
source-sheet.png: Imagegen tarafından üretilen kaynak görsel.
prompt.txt / prompts.json: üretim promptları.
all-vfx-preview.gif: ilk prompttaki 4x3 sıralamada 12 efekti birlikte gösterir.

Teknik kontrol: hücre ölçüleri, 16px şeffaf dış boşluk, kaynak hücre sınırlarında görünür taşma olmaması, farklı kareler ve GIF zamanları doğrulandı.
Görsel inceleme: tüm 11 setin kareleri incelendi; kalkan parçacıkları ve taş/toz taşmaları Imagegen ile düzeltildi.
Oyun içinde ölçek, hız ve hareket kabulü test edilmedi. Zincirin kesintisiz döşenebilirliği piksel düzeyinde doğrulanmadı; hücre boşluğu nedeniyle tam 256px kareler doğrudan yan yana döşenmemelidir.
PNG alfa kanalını korur. GIF yarı saydamlığı desteklemediğinden düşük alfa değerleri önizlemede şeffaf yapılır.
Görseller built-in image_gen ile üretildi; kare kesimi, ölçülendirme ve GIF paketlemesi yerel Pillow ile yapıldı.

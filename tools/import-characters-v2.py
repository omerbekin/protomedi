"""Ömer'in ChatGPT ile ürettirdiği karakter görsellerini (2026-10-07) oyuna aktarır.
Kullanım (game/ klasöründen):  python tools/import-characters-v2.py [--avatars-only] [--only <id>]  (yalnızca avatarlar: sprite'lara dokunmaz)
 1. Orijinal 1254px dosyaları assets/source/characters-v2/ altına kopyalar.
 2. Eski sprite'ı assets/sprites_old/<id>/idle.png altına yedekler (varsa, üzerine yazmaz).
 3. İçerik sınırlarına göre kırpıp (küçük pay) yükseklik SPRITE_H'ye küçültür -> assets/sprites/<id>/idle.png
 4. Kafa avatarını kırpıp -> assets/avatars/<id>.png (256x256). Kırpma koordinatları HEADS içinde (kırpılmış içerik kutusuna göre px).
Kaynak klasör: assets/_import_new/Karakterler/ (yoksa source/characters-v2 kullanılır)."""
import os, shutil, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC_NEW = os.path.join(ROOT, 'assets', '_import_new', 'Karakterler')
SRC_KEEP = os.path.join(ROOT, 'assets', 'source', 'characters-v2')
SPRITE_H = 640   # ekranda ~190px gösterilir; ~3.4x büyük, NEAREST küçültmede titreme olmasın diye yeterince küçük
AVATAR = 256
MARGIN = 0.015

# id: (cx, top, size)  -> içerik kutusunun sol-üstüne göre, orijinal (1254px) piksel; kare kafa+boyun kutusu
HEADS = {
    'antimage': (580, 0, 240),
    'archer': (309, 0, 235),
    'defender': (500, 0, 250),
    'druid':    (395, 25, 240),
    'gambler': (282, 0, 315),
    'mage':     (380, 0, 270),
    'paladin':  (522, 0, 240),
    'skeleton': (410, 0, 250),
    'treant':   (543, 105, 400),
    'undead':   (403, 30, 280),
    'warrior': (623, 0, 265),
    'cutthroat': (550, 0, 285),
    'hexer': (375, 0, 290),
}

# Görünüm varyantları: id -> [varyant]. Kaynak <id>-<varyant>.png, çıktı sprites/<id>/idle-<varyant>.png + avatars/<id>-<varyant>.png.
# Varsayılan görünüm (varyantsız) ile varyantlar AYNI kırpma kutusunu (birleşik içerik sınırı) kullanır: ölçek ve ayak hizası birebir aynı kalır.
VARIANTS = {
    'hexer': ['hood'],
}

def main():
    os.makedirs(SRC_KEEP, exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'assets', 'avatars'), exist_ok=True)
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None  # yalnızca bu id'yi işle
    for cid, (cx, top, size) in HEADS.items():
        if only and cid != only:
            continue
        names = [None] + VARIANTS.get(cid, [])
        ims = {}
        for v in names:
            suffix = '' if v is None else '-' + v
            keep = os.path.join(SRC_KEEP, cid + suffix + '.png')
            if p_exists(cid + suffix) and not os.path.exists(keep):
                shutil.copy2(os.path.join(SRC_NEW, cid + suffix + '.png'), keep)
            ims[v] = Image.open(keep).convert('RGBA')
        # ortak içerik kutusu (varyantlar dahil)
        boxes = [im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox() for im in ims.values()]
        bb = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        for v, im in ims.items():
            suffix = '' if v is None else '-' + v
            c = im.crop(bb)
            # kafa avatarı (kırpmadan önce, tam çözünürlükten)
            x0 = int(cx - size / 2); y0 = int(top)
            pad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            pad.paste(c.crop((max(0, x0), max(0, y0), min(c.width, x0 + size), min(c.height, y0 + size))), (max(0, -x0), max(0, -y0)))
            pad.resize((AVATAR, AVATAR), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'avatars', cid + suffix + '.png'), optimize=True)
            if '--avatars-only' in sys.argv:
                print(cid + suffix, 'avatar'); continue
            # sprite
            m = int(max(c.size) * MARGIN)
            sp = Image.new('RGBA', (c.width + 2 * m, c.height + 2 * m), (0, 0, 0, 0))
            sp.paste(c, (m, m))
            h = SPRITE_H; w = round(sp.width * h / sp.height)
            sp = sp.resize((w, h), Image.LANCZOS)
            d = os.path.join(ROOT, 'assets', 'sprites', cid)
            old = os.path.join(ROOT, 'assets', 'sprites_old', cid)
            os.makedirs(d, exist_ok=True)
            cur = os.path.join(d, ('idle' if v is None else 'idle-' + v) + '.png')
            if v is None and os.path.exists(cur) and not os.path.exists(os.path.join(old, 'idle.png')):
                os.makedirs(old, exist_ok=True)
                shutil.copy2(cur, os.path.join(old, 'idle.png'))
            sp.save(cur, optimize=True)
            print(cid + suffix, sp.size)

def p_exists(name):
    return os.path.exists(os.path.join(SRC_NEW, name + '.png'))

if __name__ == '__main__':
    main()

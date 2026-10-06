"""Paladin konsept pixel art (256x384). Kodla cizilir: poligon -> palet rampasi -> otomatik isik/golge/kontur.
Calistir: python draw_paladin.py   (cikti: idle.png, idle@4x.png, compare.png)
Isik: sol-ustten. Karakter saga bakar. Kopek (mevcut Paladin gibi) kulaklari sarkik, kutsal mavi-beyaz-altin.
"""
import os
import numpy as np
from PIL import Image, ImageDraw

W, H = 256, 384
HERE = os.path.dirname(os.path.abspath(__file__))


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# rampalar: koyu -> acik (5 ton)
R = {
    'steel': [hx(c) for c in ('#161c2e', '#34405c', '#62739a', '#9db0cf', '#e8f0fa')],
    'gold': [hx(c) for c in ('#40270c', '#85571a', '#c48b25', '#efc54c', '#fff3a8')],
    'blue': [hx(c) for c in ('#0c1233', '#1a2a66', '#2a47a0', '#4a70cc', '#86a8f0')],
    'white': [hx(c) for c in ('#4a5070', '#8d94b4', '#cfd3e6', '#eef0f9', '#ffffff')],
    'fur': [hx(c) for c in ('#5e3f22', '#9a6d3e', '#cf9f62', '#ebc88c', '#fbe6b8')],
    'ear': [hx(c) for c in ('#1e100a', '#47281a', '#744322', '#9f633a', '#c68a58')],
    'leather': [hx(c) for c in ('#1a0f0a', '#3a2214', '#5d3a20', '#84552f', '#a77646')],
    'blade': [hx(c) for c in ('#55688f', '#98acd0', '#d2def2', '#f0f7ff', '#ffffff')],
    'dark': [hx(c) for c in ('#05060c', '#0e1020', '#1a1e36', '#2c3254', '#444c78')],
}
OUT = hx('#0b0d1a')

canvas = np.zeros((H, W, 4), np.uint8)


def poly(pts):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon(pts, fill=255)
    return np.array(im) > 0


def ell(x0, y0, x1, y1):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).ellipse((x0, y0, x1, y1), fill=255)
    return np.array(im) > 0


def limb(pts, w):
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    d.line(pts, fill=255, width=w, joint='curve')
    r = w / 2
    for (x, y) in pts:
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    return np.array(im) > 0


def shift(M, k):
    """M'yi (+k,+k) kaydir (k negatifse ters)."""
    o = np.zeros_like(M)
    if k >= 0:
        o[k:, k:] = M[:H - k, :W - k] if k else M
    else:
        k = -k
        o[:H - k, :W - k] = M[k:, k:]
    return o


def paint(M, ramp, a=4, b=9, shiny=False, tex=None, outline=True, dim=0):
    """Maske M'yi rampa ile boya. a: ince acik/koyu bant, b: genis bant."""
    r = [tuple(int(c * (1 - dim)) for c in col) for col in R[ramp]]
    col = np.zeros((H, W, 3), np.uint8)
    col[:] = r[2]
    hi = M & ~shift(M, b)
    col[hi] = r[3]
    sh = M & ~shift(M, -b)
    col[sh] = r[1]
    sh2 = M & ~shift(M, -max(2, a // 2))
    col[sh2] = r[0] if not shiny else r[1]
    if shiny:
        sp = M & ~shift(M, max(1, a // 3))
        col[sp & ~shift(~M, 0)] = r[4]
        col[M & ~shift(M, 2) & shift(M, -3)] = r[4]
    if tex == 'mail':
        yy, xx = np.mgrid[0:H, 0:W]
        chk = ((xx // 2 + yy // 2) % 2 == 0) & M
        col[chk & (col == np.array(r[2])).all(2)] = r[1]
    if tex == 'cloth':
        yy, xx = np.mgrid[0:H, 0:W]
        ln = ((xx + yy // 5) % 11 == 0) & M
        col[ln & (col == np.array(r[2])).all(2)] = r[3]
    canvas[M, :3] = col[M]
    canvas[M, 3] = 255
    if outline:
        er = M.copy()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            er &= np.roll(np.roll(M, dx, 1), dy, 0)
        edge = M & ~er
        canvas[edge, :3] = r[0]


def put(x, y, c, w=1, h=1):
    canvas[y:y + h, x:x + w, :3] = c
    canvas[y:y + h, x:x + w, 3] = 255


def cut(M):
    canvas[M] = 0



YY, XX = np.mgrid[0:H, 0:W]
def bands(m, ys, d=0.0, h=3):
    for y0 in ys:
        canvas[m & (YY >= y0) & (YY < y0 + h), :3] = [int(c * (1 - d)) for c in R['gold'][2]]
        canvas[m & (YY == y0 + h), :3] = [int(c * (1 - d)) for c in R['steel'][0]]
def shin(m, x0, d=0.0):
    canvas[m & (XX >= x0) & (XX < x0 + 2) & (YY > 306) & (YY < 338), :3] = [int(c * (1 - d)) for c in R['steel'][4]]
# ---------------------------------------------------------------- golge
sh_img = Image.new('L', (W, H), 0)
ImageDraw.Draw(sh_img).ellipse((52, 362, 200, 381), fill=120)
sa = np.array(sh_img)
canvas[:, :, :3] = np.where(sa[..., None] > 0, hx('#0b0d1a'), canvas[:, :, :3])
canvas[:, :, 3] = np.maximum(canvas[:, :, 3], sa)

# ---------------------------------------------------------------- pelerin (arkada)
cape = poly([(106, 112), (92, 120), (80, 170), (62, 240), (44, 300), (46, 338), (66, 350),
             (84, 336), (100, 342), (112, 300), (118, 230), (124, 150)])
paint(cape, 'blue', a=6, b=12, tex='cloth')
# kivrim golgeleri
for pts in ([(88, 150), (74, 230), (60, 320), (66, 322), (82, 232), (96, 160)],
            [(104, 190), (98, 270), (92, 336), (98, 338), (110, 270), (112, 200)]):
    f = poly(pts) & cape
    canvas[f, :3] = R['blue'][1]
paint(cape, 'blue', a=6, b=12, tex=None, outline=True) if False else None
# pelerin kenar altin sirit
hem = cape & (np.mgrid[0:H, 0:W][0] > 330)
canvas[hem, :3] = R['gold'][2]

# ---------------------------------------------------------------- kilic (uzak el, arkada; kabza kalkanin ustunde)
blade_pts = [(172, 124), (180, 122), (226, 14), (222, 12)]
blade = poly([(166, 128), (182, 118), (231, 8), (224, 13)])
# parlama
glow = np.zeros((H, W), bool)
g = blade.copy()
for _ in range(5):
    g = g | np.roll(g, 1, 0) | np.roll(g, -1, 0) | np.roll(g, 1, 1) | np.roll(g, -1, 1)
glow = g & ~blade
gl = np.zeros((H, W, 4), np.uint8)
canvas[glow & (canvas[:, :, 3] == 0)] = (255, 232, 140, 110)
paint(blade, 'blade', a=3, b=5, shiny=True)
# altin isik damari
canvas[limb([(176, 118), (224, 20)], 2) & blade, :3] = R['gold'][3]

# ---------------------------------------------------------------- uzak bacak (daha koyu)
far_thigh = poly([(96, 218), (126, 218), (118, 250), (112, 284), (82, 286), (84, 250)])
paint(far_thigh, 'steel', 4, 9, shiny=True, dim=0.28)
bands(far_thigh, (236, 250), 0.28)
far_greave = poly([(78, 284), (116, 280), (116, 312), (106, 348), (76, 348), (70, 312)])
paint(far_greave, 'steel', 4, 9, shiny=True, dim=0.28)
bands(far_greave, (300, 336), 0.28, 3)
shin(far_greave, 90, 0.28)
far_knee = ell(80, 276, 106, 298)
paint(far_knee, 'gold', 3, 6, shiny=True, dim=0.28)
far_foot = poly([(72, 342), (106, 342), (118, 350), (140, 362), (142, 371), (66, 372), (64, 356)])
paint(far_foot, 'steel', 3, 6, shiny=True, dim=0.28)

# ---------------------------------------------------------------- govde arka / ust gövde
torso = poly([(96, 116), (140, 112), (154, 140), (154, 178), (148, 214), (100, 220), (92, 178), (90, 142)])
paint(torso, 'steel', 6, 12, shiny=True)
# gogus plakasi altin sit
plate = poly([(116, 128), (146, 124), (152, 150), (150, 180), (118, 184), (112, 154)])
paint(plate, 'gold', 4, 8, shiny=True)
# kemer
belt = poly([(92, 208), (152, 204), (152, 222), (94, 226)])
paint(belt, 'leather', 3, 5)
buckle = poly([(126, 206), (142, 205), (142, 222), (127, 223)])
paint(buckle, 'gold', 2, 4, shiny=True)

# ---------------------------------------------------------------- yakin bacak
near_thigh = poly([(120, 218), (154, 216), (160, 256), (158, 288), (124, 292), (118, 250)])
paint(near_thigh, 'steel', 4, 9, shiny=True)
bands(near_thigh, (236, 250))
near_greave = poly([(122, 294), (160, 290), (162, 318), (152, 352), (126, 352), (120, 322)])
paint(near_greave, 'steel', 4, 9, shiny=True)
bands(near_greave, (300, 336))
shin(near_greave, 134)
near_knee = ell(126, 282, 154, 304)
paint(near_knee, 'gold', 4, 8, shiny=True)
near_foot = poly([(122, 344), (156, 344), (170, 352), (192, 364), (194, 372), (116, 373), (114, 358)])
paint(near_foot, 'steel', 3, 7, shiny=True)
toecap = ell(172, 358, 198, 376) & near_foot
canvas[toecap, :3] = R['gold'][2]
# diz alti zincir / yaprak
mailb = poly([(124, 284), (154, 282), (154, 294), (124, 296)])
paint(mailb, 'steel', 2, 3, tex='mail', dim=0.15)

# ---------------------------------------------------------------- onluk (tabard)
tab = poly([(104, 224), (152, 220), (158, 250), (150, 276), (138, 266), (128, 288), (114, 268), (102, 276), (98, 250)])
paint(tab, 'white', 6, 12, tex='cloth')
stripe = poly([(124, 224), (134, 224), (135, 268), (128, 284), (123, 268)])
paint(stripe, 'blue', 3, 5)
hemline = tab & ~shift(tab, -4)
canvas[hemline & (np.mgrid[0:H, 0:W][0] > 262), :3] = R['gold'][2]

# ---------------------------------------------------------------- uzak kol (kilidi tutan)
farm_up = limb([(122, 134), (146, 156)], 15)
paint(farm_up, 'steel', 4, 7, shiny=True, dim=0.18)
farm_lo = limb([(146, 156), (172, 130)], 13)
paint(farm_lo, 'steel', 4, 7, shiny=True, dim=0.1)
hand = ell(166, 118, 184, 138)
paint(hand, 'leather', 3, 5)
# kilic kabzasi ve siperlik
guard = poly([(160, 128), (190, 116), (193, 122), (163, 135)])
paint(guard, 'gold', 3, 5, shiny=True)

narm = limb([(110, 134), (112, 188)], 20)
paint(narm, 'steel', 4, 8, shiny=True)
nelb = ell(104, 182, 122, 198)
paint(nelb, 'gold', 3, 6, shiny=True)
# ---------------------------------------------------------------- kalkan (yakin kol, onde)
shield = poly([(126, 150), (162, 138), (192, 150), (190, 205), (170, 256), (150, 296), (136, 266), (124, 214)])
paint(shield, 'gold', 5, 9, shiny=True)  # kenar cercevesi
inner = poly([(133, 158), (162, 147), (184, 157), (182, 204), (166, 248), (150, 280), (140, 254), (132, 214)])
paint(inner, 'blue', 5, 11, tex='cloth')
# altin gunes/haç amblemi
cx, cy = 158, 200
for (x0, y0, x1, y1) in ((cx - 4, cy - 24, cx + 4, cy + 26), (cx - 20, cy - 6, cx + 20, cy + 2)):
    paint(poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)]), 'gold', 2, 4, shiny=True, outline=True)
sun = ell(cx - 11, cy - 11, cx + 11, cy + 11)
paint(sun, 'gold', 3, 7, shiny=True)
core = ell(cx - 5, cy - 5, cx + 5, cy + 5)
paint(core, 'white', 2, 4)
for dx, dy in ((0, -16), (0, 16), (-16, 0), (16, 0)):
    pass
# kalkan ustu yaldiz noktalar
for (x, y) in ((140, 162), (176, 162), (142, 230), (170, 226)):
    put(x, y, R['gold'][4], 2, 2)
# kalkan kose oyuklari -> oklu perçin

# ---------------------------------------------------------------- omuzluk (yakin)
pauld = ell(94, 112, 134, 150)
paint(pauld, 'steel', 5, 10, shiny=True)
paul_trim = ell(94, 112, 134, 150) & ~shift(ell(94, 112, 134, 150), -5)
canvas[paul_trim & (canvas[:, :, 3] > 0), :3] = R['gold'][2]
# omuz altın bant
canvas[limb([(98, 124), (126, 118)], 3) & pauld, :3] = R['gold'][3]

# ---------------------------------------------------------------- boyun, kafa
neck = poly([(118, 92), (140, 92), (144, 118), (114, 120)])
paint(neck, 'steel', 3, 6, tex='mail', dim=0.1)
gorget = poly([(112, 106), (146, 106), (150, 122), (108, 124)])
paint(gorget, 'gold', 3, 6, shiny=True)

skull = ell(104, 36, 156, 96)
paint(skull, 'fur', 5, 11)
snout = limb([(146, 78), (178, 76)], 26)
paint(snout, 'fur', 4, 8)
under = limb([(150, 86), (178, 82)], 8)
canvas[under & snout, :3] = R['fur'][3]
mouth = limb([(152, 83), (184, 78)], 1)
canvas[mouth & snout, :3] = R['fur'][0]
nose = ell(182, 66, 194, 78)
paint(nose, 'dark', 2, 4, shiny=True)
put(185, 68, R['dark'][4], 3, 1)
ear = poly([(106, 50), (128, 48), (134, 70), (132, 106), (118, 122), (102, 106), (96, 78)])
paint(ear, 'ear', 5, 10)
dome = ell(100, 22, 160, 82) & poly([(0, 0), (255, 0), (255, 58), (150, 54), (126, 58), (100, 62), (0, 62)])
paint(dome, 'steel', 5, 9, shiny=True)
band = poly([(100, 54), (128, 52), (160, 56), (160, 62), (128, 58), (100, 62)])
paint(band, 'gold', 2, 4, shiny=True)
crest = poly([(112, 30), (124, 16), (146, 14), (156, 28), (146, 26), (128, 28), (118, 38)])
paint(crest, 'gold', 3, 5, shiny=True)
plume = limb([(114, 32), (92, 24), (70, 34), (58, 56), (56, 80)], 15)
plume &= ~dome
paint(plume, 'white', 3, 5, tex='cloth')
# goz
eye = ell(148, 64, 160, 74)
paint(eye, 'white', 2, 3)
put(153, 66, R['dark'][1], 5, 6)
put(155, 67, (255, 255, 255), 2, 2)


# ---------------------------------------------------------------- isik: kutsal parıltı noktalari
rng = np.random.RandomState(7)
for (x, y, s) in ((200, 60, 3), (216, 96, 2), (192, 30, 2), (238, 40, 2), (206, 140, 2), (150, 8, 2)):
    c = R['gold'][4]
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)) if s == 2 else \
            ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)):
        if 0 <= x + dx < W and 0 <= y + dy < H and canvas[y + dy, x + dx, 3] == 0:
            put(x + dx, y + dy, c)

yy, xx = np.mgrid[0:H, 0:W]
# pelerin kenar altin siriti
cm = cape & ~shift(cape, 3)
canvas[cm & (yy > 150) & (canvas[:, :, 3] > 0) & (np.abs(canvas[:, :, 0].astype(int) - R['blue'][2][0]) < 60), :3] = R['gold'][1]
# ---------------------------------------------------------------- dis kontur
opaque = canvas[:, :, 3] > 200
nb = np.zeros_like(opaque)
for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
    nb |= np.roll(np.roll(opaque, dx, 1), dy, 0)
ring = nb & ~opaque & (canvas[:, :, 3] < 100)
canvas[ring, :3] = OUT
canvas[ring, 3] = 255

img = Image.fromarray(canvas, 'RGBA')
img.save(os.path.join(HERE, 'idle.png'))
img.resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(HERE, 'idle@4x.png'))

# karsilastirma: mevcut idle.png | yeni (ayni yukseklige)
old = Image.open(os.path.join(HERE, '..', '..', 'sprites', 'paladin', 'idle.png')).convert('RGBA')
bg = (46, 52, 74, 255)
th = 768
o2 = old.resize((int(old.width * th / old.height), th), Image.NEAREST)
n2 = img.resize((int(W * th / H), th), Image.NEAREST)
cmp_ = Image.new('RGBA', (o2.width + n2.width + 60, th + 40), bg)
cmp_.alpha_composite(o2, (20, 20))
cmp_.alpha_composite(n2, (o2.width + 40, 20))
cmp_.save(os.path.join(HERE, 'compare.png'))
print('ok')

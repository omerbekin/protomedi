"""Paladin v2 (INSAN, Hacli/Tapinak sovalyesi) piksel art konsepti, 384x576.
Tamamen kodla cizilir (PIL + numpy): poligon maskeleri -> yuzey normali (bulaniklastirilmis yukseklik alani)
-> 5 tonluk rampa + doku (zincir halkalari, kumas kivrimi, cizik) -> parca basina kontur.
Isik: sol-ust-onden. Calistir: python draw_paladin_v2.py  (cikti: idle.png, idle@4x.png, compare.png)
"""
import os
import math
import random
import numpy as np
from PIL import Image, ImageDraw

W, H = 384, 576
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, '..', '..'))


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# ---- paletler: koyu -> acik, 5 ton -------------------------------------------------
RAMPS = {
    'steel':  ['#141a2a', '#2f3b57', '#5d6f92', '#a2b4d0', '#eef5ff'],
    'mail':   ['#10151f', '#272f44', '#4a5873', '#7d8fae', '#c3d2e6'],
    'gold':   ['#3a2208', '#7c4f16', '#bf8624', '#f0c648', '#fff4ae'],
    'white':  ['#3b405e', '#7b82a6', '#bcc1da', '#e9ebf6', '#ffffff'],
    'blue':   ['#0a1030', '#172763', '#2745a0', '#4a72d0', '#8fb0f5'],
    'leather':['#170d08', '#38200f', '#5c3a1d', '#86562b', '#b07a44'],
    'blade':  ['#46587c', '#8398bf', '#c4d3ee', '#eef6ff', '#ffffff'],
    'dark':   ['#05060c', '#0d0f1e', '#191c33', '#2a3052', '#434b77'],
    'grime':  ['#1c140e', '#3a2c20', '#5a4631', '#7e6747', '#a28a63'],
}
RAMP_ID = {k: i for i, k in enumerate(RAMPS)}
RAMP_COL = np.array([[hx(c) for c in RAMPS[k]] for k in RAMPS], np.uint8)  # [ramp, lvl, rgb]
OUT_COL = hx('#07080f')

rid = np.full((H, W), -1, np.int16)   # -1 bos, -2 dis kontur
lvl = np.zeros((H, W), np.int8)

YY, XX = np.mgrid[0:H, 0:W]


# ---- geometri yardimcilari ---------------------------------------------------------
def poly(pts):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255)
    return np.array(im) > 0


def ell(x0, y0, x1, y1):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).ellipse((x0, y0, x1, y1), fill=255)
    return np.array(im) > 0


def rect(x0, y0, x1, y1):
    return (XX >= x0) & (XX <= x1) & (YY >= y0) & (YY <= y1)


def line(pts, w):
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    d.line([tuple(p) for p in pts], fill=255, width=int(w), joint='curve')
    r = w / 2
    for (x, y) in (pts[0], pts[-1]):
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    return np.array(im) > 0


def taper(p0, p1, w0, w1):
    """Iki ucu farkli kalinlikta uzuv (yuvarlak uclu)."""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    pts = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2),
           (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)]
    m = poly(pts) | ell(x0 - w0 / 2, y0 - w0 / 2, x0 + w0 / 2, y0 + w0 / 2) | \
        ell(x1 - w1 / 2, y1 - w1 / 2, x1 + w1 / 2, y1 + w1 / 2)
    return m


def chain_taper(pts, ws):
    m = np.zeros((H, W), bool)
    for i in range(len(pts) - 1):
        m |= taper(pts[i], pts[i + 1], ws[i], ws[i + 1])
    return m


def smooth(pts, n=8, closed=True):
    """Catmull-Rom ile yumusat."""
    P = list(pts)
    if closed:
        P = [P[-1]] + P + [P[0], P[1]]
    else:
        P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
                                    (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    if not closed:
        out.append(P[-2])
    return out


def shift(M, dx, dy):
    o = np.zeros_like(M)
    ys0, ys1 = max(0, dy), min(H, H + dy)
    xs0, xs1 = max(0, dx), min(W, W + dx)
    o[ys0:ys1, xs0:xs1] = M[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return o


def dilate(M, r=1):
    o = M.copy()
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r + 1:
                o |= shift(M, dx, dy)
    return o


def erode(M, r=1):
    return ~dilate(~M, r)


def gblur(A, s):
    k = int(s * 3) + 1
    x = np.arange(-k, k + 1)
    g = np.exp(-x * x / (2 * s * s))
    g /= g.sum()
    P = np.pad(A, k, mode='edge')
    P = np.apply_along_axis(lambda v: np.convolve(v, g, 'valid'), 1, P)
    P = np.apply_along_axis(lambda v: np.convolve(v, g, 'valid'), 0, P)
    return P


LIGHT = np.array([-0.55, -0.62, 0.56])
LIGHT /= np.linalg.norm(LIGHT)
LIT0 = LIGHT[2]


def surface(M, sigma, bulge=1.0):
    f = gblur(M.astype(np.float32), sigma)
    gy, gx = np.gradient(f)
    s = bulge * sigma * 2.6
    gx = gx * s
    gy = gy * s
    m = np.hypot(gx, gy)
    sc = np.where(m > 0.97, 0.97 / np.maximum(m, 1e-6), 1.0)
    gx *= sc
    gy *= sc
    nz = np.sqrt(np.clip(1 - gx * gx - gy * gy, 0, 1))
    nx, ny = -gx, -gy
    lit = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    return lit, ny, f


def quant(t):
    return np.digitize(t, [0.17, 0.39, 0.62, 0.84]).astype(np.int8)


# ---- doku fonksiyonlari ------------------------------------------------------------
def tex_mail(strength=0.20):
    u = (XX + 2 * ((YY // 3) % 2)) % 4
    v = YY % 3
    t = np.zeros((H, W), np.float32)
    t[(v == 2) & (u != 1)] = -strength * 1.4
    t[(v == 0) & ((u == 1) | (u == 2))] = strength
    t[(v == 1) & (u == 0)] = -strength * 0.6
    return t


def tex_noise(seed, amp=0.1, scale=3):
    r = np.random.RandomState(seed)
    n = r.rand(H // scale + 2, W // scale + 2).astype(np.float32)
    n = np.kron(n, np.ones((scale, scale), np.float32))[:H, :W]
    return (n - 0.5) * 2 * amp


def tex_folds(lines, width=3, dark=0.30, light=0.16, soft=True):
    """lines: polylines; sag tarafi karanlik, sol-ust tarafi isikli kivrim."""
    t = np.zeros((H, W), np.float32)
    for pts in lines:
        m = line(pts, width)
        t[shift(m, -2, 0) & ~m] += light
        t[m] -= dark
        t[shift(m, 2, 1) & ~m] -= dark * 0.45
    return t


# ---- boyama ------------------------------------------------------------------------
def paint(M, ramp, sigma=5, bulge=1.0, gain=1.25, tex=None, metal=0.0, base=0.5, ring=True,
          cast=0, decals=(), ao=0.12, lvl_shift=0, outline_ramp=None, shade_mask=None):
    """M maskesini boya. Dondurur: lvl dizisi (decal icin)."""
    lit, ny, f = surface(M, sigma, bulge)
    t = base + (lit - LIT0) * gain
    t -= ao * np.clip(1.4 - f * 1.6, 0, 1)  # kenara yakin hafif kararma
    if metal:
        t += metal * np.tanh(-ny * 3.2) * 0.9
    if tex is not None:
        t = t + tex
    L = quant(t).astype(np.int16) + lvl_shift
    L = np.clip(L, 0, 4).astype(np.int8)
    R = RAMP_ID[ramp]
    if cast:
        # parcanin gelecek golgesi: altindaki cizilmis piksellerin tonunu dusur
        sh = shift(M, cast, int(cast * 1.2)) & ~M & (rid >= 0)
        lvl[sh] = np.maximum(lvl[sh] - 1, 0)
    if ring:
        rg = dilate(M, 1) & ~M
        empty = rg & (rid == -1)
        rid[rg] = np.where(empty[rg], -2, RAMP_ID[outline_ramp or ramp])
        lvl[rg] = 0
    rid[M] = R
    lvl[M] = L[M]
    for d in decals:
        dm, dr = d[0], d[1]
        off = d[2] if len(d) > 2 else 0
        fixed = d[3] if len(d) > 3 else None
        dm = dm & M
        rid[dm] = RAMP_ID[dr]
        lvl[dm] = fixed if fixed is not None else np.clip(L[dm] + off, 0, 4)
    return L


def stamp(M, ramp, level):
    rid[M] = RAMP_ID[ramp]
    lvl[M] = level


def stamp_ring(M, ramp, level=0):
    rg = dilate(M, 1) & ~M
    rid[rg] = RAMP_ID[ramp]
    lvl[rg] = level


def pts_mask(pts, r=0):
    m = np.zeros((H, W), bool)
    for (x, y) in pts:
        if r == 0:
            m[int(y), int(x)] = True
        else:
            m |= ell(x - r, y - r, x + r, y + r)
    return m


def jag(p_from, p_to, teeth, amp, seed, minlen=5, maxlen=11):
    """Iki nokta arasi yirtik/dis dis kenar (ucgen disler)."""
    r = random.Random(seed)
    (x0, y0), (x1, y1) = p_from, p_to
    L = math.hypot(x1 - x0, y1 - y0)
    out = [p_from]
    d = 0
    while d < L:
        d += r.randint(minlen, maxlen)
        if d >= L:
            break
        t = d / L
        bx, by = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        out.append((bx, by + r.uniform(0.2, 1) * amp))      # uzun sarkik
        d += r.randint(2, 5)
        t = min(d / L, 1)
        bx, by = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        out.append((bx, by - r.uniform(0, 0.5) * amp))      # kisa girinti
    out.append(p_to)
    return out


def unify(*ms):
    o = np.zeros((H, W), bool)
    for m in ms:
        o |= m
    return o


def cross_pattee(cx, cy, hh, hw, th, flare, sx=1.0):
    """Pattee (uclari acilan) haç. hh: dikey yaricap, hw: yatay yaricap, th: merkez kalinligi, flare: uc kalinligi."""
    hwx = hw * sx
    vert = [(cx - th, cy - hh * 0.3), (cx - flare, cy - hh), (cx + flare, cy - hh), (cx + th, cy - hh * 0.3),
            (cx + th, cy + hh * 0.3), (cx + flare, cy + hh), (cx - flare, cy + hh), (cx - th, cy + hh * 0.3)]
    hor = [(cx - hwx * 0.3, cy - th), (cx - hwx, cy - flare), (cx - hwx, cy + flare), (cx - hwx * 0.3, cy + th),
           (cx + hwx * 0.3, cy + th), (cx + hwx, cy + flare), (cx + hwx, cy - flare), (cx + hwx * 0.3, cy - th)]
    return poly(vert) | poly(hor) | rect(cx - th, cy - th, cx + th, cy + th)


# =====================================================================================
#  ARKA KATMANLAR
# =====================================================================================
# ---- pelerin (mavi, yirtik uclu): sol omuzdan arkaya akar ---------------------------
cape_pts = smooth([(150, 140), (176, 136), (170, 220), (160, 320), (176, 392), (120, 424), (92, 448), (72, 410),
                   (84, 330), (104, 240), (120, 168)], 6)
cape = poly(cape_pts)
cape_hem = poly(jag((176, 392), (72, 420), 0, 14, 11) + [(72, 380), (120, 380)])
cape |= poly(jag((176, 396), (76, 428), 0, 12, 5) + [(76, 380), (176, 380)])
cape_folds = tex_folds([[(150, 190), (140, 260), (134, 340), (128, 420)],
                        [(122, 200), (112, 290), (100, 380), (92, 430)],
                        [(168, 250), (162, 330), (160, 392)]], 3, 0.32, 0.18)
paint(cape, 'blue', sigma=9, bulge=0.7, gain=1.0, tex=cape_folds + tex_noise(3, 0.02, 6), base=0.42, cast=0)

# =====================================================================================
#  BACAKLAR
# =====================================================================================
# arka bacak (izleyiciye gore sol): kalca (178,330) diz (160,458) bilek (142,532)
bl_thigh = chain_taper([(180, 332), (162, 458)], [48, 38])
bl_calf = chain_taper([(162, 458), (146, 532)], [38, 26])
paint(bl_thigh, 'mail', sigma=7, bulge=1.0, gain=1.3, tex=tex_mail(0.22))
paint(bl_calf, 'steel', sigma=5, bulge=1.1, gain=1.3, metal=0.5, tex=tex_folds([[(150, 478), (140, 524)]], 2, 0.15, 0.0))
# arka bot (topuk kalkik)
bl_boot = poly([(128, 530), (150, 526), (158, 534), (178, 548), (186, 558), (180, 564), (122, 556), (118, 540)])
stamp(rect(142, 490, 160, 492) & bl_calf, 'leather', 2)
stamp(rect(138, 504, 156, 506) & bl_calf, 'leather', 2)
paint(bl_boot, 'leather', sigma=5, bulge=1.1, gain=1.3,
      tex=tex_folds([[(132, 540), (166, 548)]], 2, 0.2, 0.1))
bl_toecap = poly([(166, 546), (178, 550), (188, 558), (182, 564), (166, 560)])
paint(bl_toecap, 'steel', sigma=3, bulge=1.1, gain=1.3, metal=0.5)
bl_knee = poly(smooth([(144, 444), (168, 440), (180, 456), (170, 474), (148, 470), (140, 456)], 6))
paint(bl_knee, 'steel', sigma=6, bulge=1.1, gain=1.4, metal=0.55)
stamp(pts_mask([(154, 457)], 2), 'gold', 3)

# on bacak (izleyiciye gore sag): kalca (214,332) diz (238,460) bilek (240,534)
fr_thigh = chain_taper([(212, 332), (236, 458)], [50, 40])
fr_calf = chain_taper([(236, 458), (238, 534)], [42, 28])
paint(fr_thigh, 'mail', sigma=7, bulge=1.0, gain=1.3, tex=tex_mail(0.22))
paint(fr_calf, 'steel', sigma=6, bulge=1.1, gain=1.35, metal=0.55,
      tex=tex_folds([[(232, 484), (234, 528)]], 2, 0.12, 0.0))
fr_boot = poly([(218, 528), (252, 524), (258, 536), (294, 548), (304, 558), (298, 566), (214, 566), (212, 544)])
stamp(rect(226, 490, 248, 492) & fr_calf, 'leather', 2)
stamp(rect(226, 500, 248, 502) & fr_calf, 'leather', 2)
paint(fr_boot, 'leather', sigma=5, bulge=1.1, gain=1.3,
      tex=tex_folds([[(226, 544), (278, 554)]], 2, 0.2, 0.1))
fr_toecap = poly([(280, 546), (296, 552), (306, 558), (300, 566), (276, 564)])
paint(fr_toecap, 'steel', sigma=3, bulge=1.1, gain=1.3, metal=0.5)
fr_ankle = rect(220, 520, 256, 530) & fr_calf
paint(poly([(220, 521), (256, 519), (258, 531), (218, 532)]), 'gold', sigma=3, bulge=1.0, gain=1.0, ring=True)
fr_knee = poly(smooth([(216, 442), (246, 436), (260, 454), (250, 476), (222, 474), (212, 456)], 6))
paint(fr_knee, 'steel', sigma=7, bulge=1.1, gain=1.4, metal=0.6)
stamp(pts_mask([(234, 457)], 2), 'gold', 3)
# sabaton uzerinde bagca kayis
for xx_ in (264, 274, 284):
    stamp(line([(xx_, 540), (xx_ + 4, 560)], 1) & fr_boot, 'leather', 0)
    stamp(line([(xx_ - 1, 540), (xx_ + 3, 560)], 1) & fr_boot, 'leather', 4)
for xx_ in (150, 160, 170):
    stamp(line([(xx_, 536), (xx_ + 4, 556)], 1) & bl_boot, 'leather', 0)
    stamp(line([(xx_ - 1, 536), (xx_ + 3, 556)], 1) & bl_boot, 'leather', 4)

# =====================================================================================
#  GOVDE
# =====================================================================================
# zincir gomlek (hauberk) tabanı: gövde + etek alti
hauberk = poly(smooth([(160, 138), (200, 130), (244, 140), (250, 220), (244, 306), (214, 322), (172, 322), (158, 300),
                       (156, 220)], 6))
paint(hauberk, 'mail', sigma=9, bulge=1.0, gain=1.2, tex=tex_mail(0.22))

# boyun/zincir kukulesi (coif)
coif = poly(smooth([(168, 106), (226, 104), (236, 126), (250, 146), (200, 160), (152, 148), (162, 126)], 6))
paint(coif, 'mail', sigma=7, bulge=1.0, gain=1.25, tex=tex_mail(0.24), ao=0.2)

# ---- on tabard: gogus bolumu (beyaz), altin haç ----------------------------------------
tab_top = poly(smooth([(166, 146), (204, 140), (236, 146), (240, 200), (234, 262), (232, 306), (170, 306), (172, 258),
                       (164, 200)], 6))
side = -np.clip((XX - 205) / 40.0, 0, 1).astype(np.float32) * 0.35
tab_folds = side + tex_folds([[(178, 170), (180, 230), (184, 300)],
                       [(226, 176), (222, 240), (224, 298)],
                       [(196, 232), (200, 290)]], 3, 0.20, 0.10)
cr_out = cross_pattee(204, 204, 38, 25, 5, 10, 1.0)
cr_in = erode(cr_out, 2)
# altin haç etrafinda mavi cerceve (sert kontrast) + altin ic dolgu
paint(tab_top, 'white', sigma=8, bulge=0.9, gain=1.05, tex=tab_folds + tex_noise(5, 0.05, 3), base=0.58,
      decals=[(dilate(cr_out, 1), 'blue', 0, None), (cr_out, 'gold', 0, None)])
# haç icine parlak vurgu hatti
stamp(rect(201, 176, 202, 230) & cr_in, 'gold', 4)
stamp(rect(188, 202, 222, 203) & cr_in, 'gold', 4)
# lekeler (yipranma: toz/pas)
for (sx, sy, sr) in [(186, 262, 5), (222, 276, 4), (192, 150, 3)]:
    m = ell(sx - sr, sy - sr * 0.6, sx + sr, sy + sr * 0.6) & tab_top
    stamp(m, 'grime', 3)
    stamp(m & ~erode(m, 1), 'grime', 2)

# ---- kemer ve toka ---------------------------------------------------------------------
belt = poly([(160, 298), (244, 296), (246, 314), (160, 318)])
paint(belt, 'leather', sigma=3, bulge=1.1, gain=1.3, tex=tex_noise(2, 0.06, 2))
belt2 = poly([(160, 316), (246, 312), (246, 322), (161, 326)])
paint(belt2, 'leather', sigma=2, bulge=1.1, gain=1.2, lvl_shift=-1)
buckle = rect(196, 297, 212, 318)
paint(buckle, 'gold', sigma=4, bulge=1.1, gain=1.5, metal=0.3)
stamp(rect(200, 301, 208, 314), 'dark', 1)
stamp(rect(202, 303, 206, 312), 'leather', 2)
stamp(rect(200, 307, 208, 308), 'gold', 3)
# sarkan kemer ucu
tail = poly([(210, 318), (222, 318), (226, 356), (214, 358)])
paint(tail, 'leather', sigma=2.5, bulge=1.1, gain=1.2)
stamp(rect(216, 338, 222, 340), 'gold', 3)

# ---- tabard etek (iki panel + yirtik uc) ----------------------------------------------
sk_l_hem = jag((200, 440), (92, 470), 0, 13, 21, 5, 10)
skirt_l = poly(smooth([(158, 312), (204, 312)], 2, False) + [(206, 330), (202, 440)] + sk_l_hem + [(124, 380), (150, 340)])
sk_r_hem = jag((268, 462), (210, 436), 0, 20, 34, 5, 9)
skirt_r = poly([(204, 312), (246, 312), (258, 380)] + sk_r_hem + [(214, 380), (212, 330)])
sk_folds_l = tex_folds([[(176, 330), (166, 400), (148, 458)],
                        [(192, 330), (186, 420)],
                        [(158, 340), (130, 420), (112, 462)]], 3, 0.28, 0.14)
sk_folds_r = tex_folds([[(222, 330), (226, 400), (232, 440)],
                        [(240, 336), (248, 400), (262, 462)]], 3, 0.28, 0.14)
# alt kenara dogru kir/koyulasma
dirt_l = np.clip((YY - 392) / 70.0, 0, 1).astype(np.float32) * -0.35
dirt_l += tex_noise(8, 0.07, 5) * np.clip((YY - 380) / 40.0, 0, 1)
paint(skirt_l, 'white', sigma=9, bulge=0.8, gain=1.0, tex=sk_folds_l + dirt_l + side, base=0.6, cast=3)
paint(skirt_r, 'white', sigma=8, bulge=0.8, gain=1.0, tex=sk_folds_r + dirt_l + side*1.3, base=0.55, cast=3)
# etek uzerine alt altin haç (diz hizasi, solda)
cr2 = cross_pattee(176, 394, 15, 12, 3, 5, 0.9)
sk_inner = skirt_l
stamp(dilate(cr2, 1) & sk_inner, 'blue', 2)
stamp(cr2 & sk_inner, 'gold', 3)
cr3 = cross_pattee(242, 400, 11, 9, 2, 4, 0.7)
stamp(dilate(cr3, 1) & skirt_r, 'blue', 2)
stamp(cr3 & skirt_r, 'gold', 3)
# ---- savas cekici belden asili (on planda, sol kalca) ---------------------------------
hm_haft = line([(166, 318), (136, 396)], 5)
hm_head = poly([(112, 388), (144, 376), (152, 390), (122, 408)])
hm_back = poly([(108, 392), (102, 384), (114, 376), (122, 384)])
paint(hm_haft, 'leather', sigma=2.2, bulge=1.1, gain=1.3, tex=tex_folds([[(160,330),(142,380)]],1,0.2,0.0))
paint(hm_head, 'steel', sigma=4, bulge=1.1, gain=1.4, metal=0.5)
paint(hm_back, 'steel', sigma=2.5, bulge=1.0, gain=1.2, metal=0.4)
stamp(line([(126,396),(146,384)],1)&hm_head,'steel',4)
stamp(line([(148,322),(150,324)],1),'gold',3)

# etek ici mavi astar: kenar boyunca ince mavi serit
hem_band_l = skirt_l & ~shift(skirt_l, 0, -4) & (YY > 420)
stamp(hem_band_l, 'blue', 2)

# =====================================================================================
#  KOLLAR
# =====================================================================================
# kilic kolu (sol, izleyiciye gore): omuz (146,156) dirsek (128,236) bilek (121,290)
sl_up = chain_taper([(148, 160), (130, 234)], [34, 28])
paint(sl_up, 'mail', sigma=6, bulge=1.0, gain=1.3, tex=tex_mail(0.22))
sl_fore = chain_taper([(130, 234), (121, 292)], [28, 24])
paint(sl_fore, 'mail', sigma=5, bulge=1.0, gain=1.3, tex=tex_mail(0.22))
sl_vamb = poly(smooth([(106, 250), (138, 246), (136, 296), (122, 306), (104, 300)], 5))
paint(sl_vamb, 'steel', sigma=5, bulge=1.1, gain=1.4, metal=0.5)
for yy in (262, 278):
    stamp(rect(113, yy, 133, yy) & sl_vamb, 'steel', 4)
    stamp(rect(113, yy + 1, 133, yy + 1) & sl_vamb, 'steel', 0)
sl_couter = ell(110, 222, 142, 252)
paint(sl_couter, 'steel', sigma=5, bulge=1.1, gain=1.4, metal=0.55)
stamp(pts_mask([(126, 234)], 2), 'gold', 3)

# kilic (once bicak: elin altina girer)
GUARD = np.array([112.0, 320.0])
TIP = np.array([34.0, 516.0])
D = (TIP - GUARD) / np.linalg.norm(TIP - GUARD)
N = np.array([-D[1], D[0]])


def along(t, off=0.0):
    p = GUARD + D * t + N * off
    return (p[0], p[1])


BL = float(np.linalg.norm(TIP - GUARD))
blade_all = poly([along(0, -8), along(BL * 0.8, -7), along(BL, 0), along(BL * 0.8, 7), along(0, 8)])
blade_a = poly([along(0, 0), along(BL * 0.8, 0), along(BL, 0), along(BL * 0.8, -7), along(0, -8)])  # isik tarafi
blade_b = poly([along(0, 0), along(BL * 0.8, 0), along(BL, 0), along(BL * 0.8, 7), along(0, 8)])
fuller = line([along(14), along(BL * 0.72)], 2)
paint(blade_all, 'blade', sigma=3, bulge=0.5, gain=0.5, ring=True)
lvl_a = np.full((H, W), 3, np.int8)
stamp(blade_a & blade_all, 'blade', 3)
stamp(blade_b & blade_all, 'blade', 1)
stamp(fuller & blade_all, 'blade', 0)
stamp(shift(fuller, -1, 0) & blade_all & ~fuller, 'blade', 4)
# kenar parlamasi
edge_a = line([along(3, -7), along(BL * 0.78, -6)], 1)
stamp(edge_a & blade_all, 'blade', 4)
# yansima parlak noktalari
for t in (BL * 0.25, BL * 0.55, BL * 0.84):
    stamp(line([along(t, -4), along(t + 7, -4)], 1) & blade_all, 'blade', 4)
stamp(line([along(BL * 0.4, 3), along(BL * 0.48, 3)], 1) & blade_all, 'blade', 2)
# capraz kabza
guard_m = poly([along(-4, -30), along(-4, 30), along(5, 32), along(5, -32)])
guard_m |= ell(*(np.array(along(0, -32)) - 5), *(np.array(along(0, -32)) + 5)) | \
    ell(*(np.array(along(0, 32)) - 5), *(np.array(along(0, 32)) + 5))
paint(guard_m, 'gold', sigma=3, bulge=1.1, gain=1.4, metal=0.3)
# tutamak + topuz
grip_m = poly([along(-4, -4.5), along(-44, -4.5), along(-44, 4.5), along(-4, 4.5)])
paint(grip_m, 'leather', sigma=2, bulge=1.1, gain=1.2)
for k in range(-8, -42, -5):
    stamp(line([along(k, -4), along(k - 3, 4)], 1) & grip_m, 'leather', 4)
pom = np.array(along(-50))
pommel = ell(pom[0] - 8, pom[1] - 8, pom[0] + 8, pom[1] + 8)
paint(pommel, 'gold', sigma=3, bulge=1.2, gain=1.5, metal=0.2)
stamp(pts_mask([(pom[0] - 2, pom[1] - 3)], 1), 'gold', 4)

# el (eldiven) tutamagi sarar
hand_c = np.array(along(-22))
fist = poly(smooth([(hand_c[0] - 14, hand_c[1] - 12), (hand_c[0] + 12, hand_c[1] - 14), (hand_c[0] + 15, hand_c[1] + 4),
                    (hand_c[0] + 6, hand_c[1] + 16), (hand_c[0] - 10, hand_c[1] + 14), (hand_c[0] - 16, hand_c[1] + 2)], 5))
paint(fist, 'leather', sigma=5, bulge=1.2, gain=1.4)
stamp(rect(int(hand_c[0])-14, int(hand_c[1])+10, int(hand_c[0])+6, int(hand_c[1])+12) & fist, 'leather', 0)
for k in range(3):
    yy = hand_c[1] - 8 + k * 7
    stamp(line([(hand_c[0] - 10, yy), (hand_c[0] + 8, yy + 1)], 1) & fist, 'leather', 0)
# bilek manseti (gauntlet cuff)
cuff = poly([(110, 292), (136, 290), (134, 304), (108, 306)])
paint(cuff, 'steel', sigma=3, bulge=1.1, gain=1.3, metal=0.4)

# kalkan kolu (sag): omuz (244,160) dirsek (262,238)
sr_up = chain_taper([(244, 164), (260, 238)], [36, 30])
paint(sr_up, 'mail', sigma=7, bulge=1.0, gain=1.3, tex=tex_mail(0.22))

# =====================================================================================
#  OMUZLUKLAR
# =====================================================================================
def pauldron(cx, cy, scale, flip=False):
    pls = []
    sgn = -1 if flip else 1
    plates = [
        smooth([(cx - 30 * scale, cy + 16 * scale), (cx - 20 * scale, cy - 14 * scale), (cx + 10 * scale, cy - 24 * scale),
                (cx + 30 * scale, cy - 6 * scale), (cx + 28 * scale, cy + 18 * scale)], 6),
    ]
    return plates


# sol omuzluk (3 lam, altin kenar)
pl1 = poly(smooth([(116, 168), (118, 146), (140, 134), (166, 138), (172, 156), (164, 178), (136, 184)], 6))
pl2 = poly(smooth([(112, 184), (116, 172), (142, 180), (168, 176), (174, 194), (150, 204), (122, 204)], 6))
pl3 = poly(smooth([(116, 198), (120, 192), (148, 199), (168, 196), (166, 208), (138, 212), (120, 210)], 6))
for pl in (pl3, pl2, pl1):
    paint(pl, 'steel', sigma=5, bulge=1.1, gain=1.4, metal=0.55)
    stamp(pl & ~erode(pl, 1) & shift(~pl, 0, -1) , 'gold', 3)
for (px_, py_) in [(128, 152), (146, 146), (160, 152), (150, 190), (128, 192)]:
    stamp(pts_mask([(px_, py_)], 1), 'gold', 3)
    stamp(pts_mask([(px_ - 1, py_ - 1)], 0), 'gold', 4)
stamp(line([(124, 160), (136, 152)], 1) & pl1, 'steel', 4)
stamp(line([(150, 168), (158, 172)], 1) & pl1, 'steel', 0)

# sag omuzluk
pr1 = poly(smooth([(232, 152), (240, 134), (262, 128), (284, 136), (290, 156), (282, 176), (252, 182), (234, 170)], 6))
pr2 = poly(smooth([(230, 172), (240, 180), (266, 186), (288, 178), (290, 198), (266, 208), (236, 200)], 6))
for pl in (pr2, pr1):
    paint(pl, 'steel', sigma=5, bulge=1.1, gain=1.4, metal=0.55)
    stamp(pl & ~erode(pl, 1) & shift(~pl, 0, -1), 'gold', 3)
for (px_, py_) in [(248, 142), (266, 136), (282, 148), (252, 190), (276, 192)]:
    stamp(pts_mask([(px_, py_)], 1), 'gold', 3)
    stamp(pts_mask([(px_ - 1, py_ - 1)], 0), 'gold', 4)
stamp(line([(254, 150), (268, 142)], 1) & pr1, 'steel', 4)
stamp(line([(262, 166), (278, 162)], 1) & pr1, 'steel', 0)

# =====================================================================================
#  KALKAN (on planda, sag)
# =====================================================================================
sh_pts = smooth([(262, 178), (290, 166), (326, 164), (344, 182), (346, 244), (334, 322), (312, 394), (294, 446),
                 (280, 392), (268, 316), (260, 240)], 7)
shield = poly(sh_pts)
ridge_x = lambda y: 304 - (y - 166) * (14 / 280.0)
left_half = shield & (XX <= ridge_x(YY))
right_half = shield & (XX > ridge_x(YY))
rim_m = shield & ~erode(shield, 6)
# yipranma dokusu
wear = tex_noise(12, 0.12, 2)
wear += tex_noise(13, 0.10, 6)
paint(shield, 'blue', sigma=10, bulge=0.5, gain=0.9, base=0.46, tex=wear, ao=0.0, cast=3)
# iki yuz: sol yari acik, sag yari koyu (3/4 bukum)
stamp(left_half & ~rim_m & (lvl >= 0), 'blue', 3)
stamp(right_half & ~rim_m, 'blue', 1)
# gradient geçisi: orta çizgiye yakin sol yari gölgelenir
for y in range(170, 440):
    x = int(ridge_x(y))
    for dx_, lv in ((0, 4), (-1, 4)):
        if shield[y, x + dx_]:
            lvl[y, x + dx_] = lv
            rid[y, x + dx_] = RAMP_ID['blue']
    if shield[y, x + 1]:
        lvl[y, x + 1] = 0
        rid[y, x + 1] = RAMP_ID['blue']
# altin kenar (kabartma çerçeve)
paint(rim_m, 'gold', sigma=2.5, bulge=1.1, gain=1.3, metal=0.35, ring=False, tex=tex_noise(15, 0.08, 2))
stamp(rim_m & right_half, 'gold', 1)
stamp(rim_m & right_half & ~erode(rim_m, 1), 'gold', 0)
inner_edge = erode(shield, 6) & ~erode(shield, 7)
stamp(inner_edge, 'gold', 0)
# alt kenar parıltısı
# amblem: beyaz-altın pattee haç (3/4 daraltilmis) + günes isinlari
ecx, ecy = 296, 252
emb_halo = ell(ecx - 30, ecy - 30, ecx + 28, ecy + 36) & shield & ~rim_m
rays = np.zeros((H, W), bool)
for k in range(12):
    a = k * math.pi / 6
    rays |= line([(ecx + math.cos(a) * 16, ecy + 4 + math.sin(a) * 20),
                  (ecx + math.cos(a) * 30, ecy + 4 + math.sin(a) * 36)], 2 if k % 2 == 0 else 1)
rays &= shield & ~rim_m
cr_s = cross_pattee(ecx, ecy + 4, 52, 42, 7, 14, 0.72)
stamp(dilate(cr_s, 1) & shield, 'gold', 0)
stamp(cr_s & left_half, 'white', 3)
stamp(cr_s & right_half, 'white', 1)
stamp(cr_s & left_half & ~erode(cr_s, 2), 'white', 4)
stamp(rect(ecx - 3, ecy - 34, ecx - 2, ecy + 40) & cr_s & left_half, 'white', 4)
# kalkan kabartma ortasi (boss)
boss = ell(ecx - 8, ecy - 4, ecx + 8, ecy + 12)
paint(boss, 'gold', sigma=3, bulge=1.3, gain=1.6, metal=0.3)
stamp(pts_mask([(ecx - 3, ecy)], 1), 'gold', 4)
# kalkan yıpranma: çizikler, ceplik, yeşil/gri aşınma
r = random.Random(77)
for _ in range(16):
    x0 = r.randint(270, 335)
    y0 = r.randint(180, 400)
    ln = r.randint(6, 18)
    a = r.uniform(0.5, 1.2)
    sc = line([(x0, y0), (x0 + ln * math.cos(a) * 0.6, y0 + ln * math.sin(a))], 1) & shield & ~rim_m
    stamp(sc, 'blue', 4 if x0 < ridge_x(y0) else 3)
    stamp(shift(sc, 1, 1) & shield & ~rim_m & ~sc, 'blue', 0)
for _ in range(7):
    x0 = r.randint(272, 330)
    y0 = r.randint(300, 428)
    m = ell(x0 - 5, y0 - 3, x0 + 5, y0 + 3) & shield & ~rim_m
    stamp(m, 'grime', 2)
# kenar oyugu/yarik
for (nx_, ny_) in [(344, 214), (336, 296), (278, 410), (262, 214)]:
    notch = ell(nx_ - 3, ny_ - 3, nx_ + 3, ny_ + 3) & rim_m
    stamp(notch, 'dark', 1)
# kalkan altı tabard kıvrımı gölgesi (kalkanın solundaki gövde)
sh_shadow = shift(shield, -5, 2) & ~shield & (rid >= 0)
lvl[sh_shadow] = np.maximum(lvl[sh_shadow] - 1, 0)

# =====================================================================================
#  KASK (en üst)
# =====================================================================================
helm_pts = smooth([(168, 42), (176, 31), (198, 27), (220, 31), (227, 42), (232, 62), (226, 106), (214, 116), (182, 116),
                   (170, 106), (164, 62)], 6)
helm = poly(helm_pts)
helm_top = ell(164, 22, 232, 46) & helm
helm_tex = np.zeros((H, W), np.float32)
helm_tex += 0.0
# ön sırt (kask 3/4 donuk: bant sağda)
band_v = rect(204, 30, 214, 116) & helm
band_h = rect(166, 64, 232, 76) & helm
# kask boyama: silindir, sağdan hafif karanlık
paint(helm, 'steel', sigma=14, bulge=0.9, gain=1.5, metal=0.5, base=0.5, ao=0.1,
      tex=tex_noise(41, 0.05, 2))
paint(helm_top, 'steel', sigma=7, bulge=1.0, gain=1.2, ring=False, lvl_shift=1)
stamp(helm_top & ~erode(helm_top, 1) & ~shift(helm_top, 0, -1), 'steel', 4)
# bantlar
paint(band_v, 'steel', sigma=3, bulge=1.1, gain=1.3, metal=0.4, ring=False)
stamp(band_v & ~erode(band_v, 1), 'steel', 0)
stamp(rect(205, 30, 206, 116) & helm, 'steel', 4)
paint(band_h, 'steel', sigma=3, bulge=1.1, gain=1.3, metal=0.4, ring=False)
# göz yarığı ve havalandırma
eye = rect(210, 66, 230, 72) & helm
eye = poly([(210, 66), (229, 67), (229, 72), (210, 73)]) & helm
stamp(eye, 'dark', 0)
stamp(rect(212, 71, 228, 71) & helm, 'dark', 2)
stamp(rect(210, 64, 229, 65) & helm, 'steel', 4)
stamp(rect(210, 76, 229, 76) & helm, 'steel', 0)
vslit = rect(207, 78, 211, 106) & helm
stamp(vslit, 'dark', 0)
# havalandırma delikleri (sag alt)
for hy in range(82, 110, 6):
    for hxx in (216, 222):
        stamp(pts_mask([(hxx, hy), (hxx + 1, hy), (hxx, hy + 1), (hxx + 1, hy + 1)]), 'dark', 0)
# perçinler
for (px_, py_) in [(170, 66), (176, 70), (170, 104), (186, 50), (198, 50), (218, 50), (226, 70), (220, 104), (180, 108)]:
    stamp(pts_mask([(px_, py_)], 0), 'steel', 4)
    stamp(pts_mask([(px_ + 1, py_ + 1)], 0), 'steel', 0)
# altın alt kenar (yaka halkası) ve kask üstü altın haç oyma
lower = poly([(166, 104), (228, 104), (226, 116), (214, 119), (182, 119), (168, 114)]) & dilate(helm, 1)
stamp(rect(166, 106, 230, 106) & helm, 'steel', 0)
stamp(rect(166, 107, 230, 107) & helm, 'steel', 4)
for (px_, py_) in [(176, 112), (190, 113), (204, 114), (218, 112)]:
    stamp(pts_mask([(px_, py_)], 0), 'gold', 3)
# kask çizikleri / yıpranma
stamp(line([(176, 44), (184, 56)], 1) & helm, 'steel', 4)
stamp(line([(178, 48), (186, 59)], 1) & helm, 'steel', 0)
stamp(line([(190, 82), (196, 98)], 1) & helm, 'steel', 1)
paint(helm_top, 'steel', sigma=7, bulge=1.0, gain=1.2, ring=False, lvl_shift=1)
stamp(helm_top & ~erode(helm_top, 1) & ~shift(helm_top, 0, -1), 'steel', 4)

# =====================================================================================
#  SON: RENDER
# =====================================================================================
rgba = np.zeros((H, W, 4), np.uint8)
m = rid >= 0
rgba[m, :3] = RAMP_COL[rid[m], lvl[m]]
rgba[m, 3] = 255
mo = rid == -2
rgba[mo, :3] = OUT_COL
rgba[mo, 3] = 255

# dış kontur: hala boş olan, dolu piksele komsu pikseller
filled = rgba[..., 3] > 0
ring_out = dilate(filled, 1) & ~filled
rgba[ring_out, :3] = OUT_COL
rgba[ring_out, 3] = 255

img = Image.fromarray(rgba, 'RGBA')
img.save(os.path.join(HERE, 'idle.png'))
img.resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(HERE, 'idle@4x.png'))

# ---- karsilastirma -------------------------------------------------------------------
CH = 576
bg = (52, 58, 84, 255)
parts = []
for label, path in (('MEVCUT', os.path.join(ASSETS, 'sprites', 'paladin', 'idle.png')),
                    ('ESKI (kopek)', os.path.join(ASSETS, 'concepts', 'paladin', 'idle.png')),
                    ('YENI v2 (insan)', os.path.join(HERE, 'idle.png'))):
    im = Image.open(path).convert('RGBA')
    sc = CH / im.height
    rs = Image.NEAREST if 'v2' in label or 'ESKI' in label else Image.LANCZOS
    im = im.resize((max(1, round(im.width * sc)), CH), rs)
    parts.append((label, im))
total_w = sum(p[1].width for p in parts) + 20 * (len(parts) + 1)
cmp_img = Image.new('RGBA', (total_w, CH + 50), bg)
d = ImageDraw.Draw(cmp_img)
x = 20
for label, im in parts:
    cmp_img.alpha_composite(im, (x, 40))
    d.text((x, 14), label, fill=(240, 240, 255, 255))
    x += im.width + 20
cmp_img.convert('RGB').save(os.path.join(HERE, 'compare.png'))
print('ok', img.size)

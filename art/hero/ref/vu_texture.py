#!/usr/bin/env python3
# VU 表脸贴图 v4（decree12①）：弧宽=94°配 live 指针 -47..+47 弹道扫程（每 MomentEvent 弹一下·快冲慢回）。
# 刻度容纳事件弹道动态范围，非匀速扫描表；红区在峰端(右)。丝印只留清晰"VU"+"LEVEL"（VU=事件能量·非张力）。
from PIL import Image, ImageDraw, ImageFont
import math
W, H = 1400, 645
IVORY = (234, 226, 204); INK = (16, 12, 8); RED = (150, 34, 20); FAINT = (96, 82, 62)
img = Image.new('RGB', (W, H), IVORY); d = ImageDraw.Draw(img)
cx, cy = W // 2, int(H * 1.02); R = int(H * 0.90); A = 47          # 94° 弧配指针弹道·轴心落脸下缘(毂在脸上·指针不脱毂)

def pt(ang, r):
    a = math.radians(ang - 90.0); return (cx + r * math.cos(a), cy + r * math.sin(a))

bb = [cx - R, cy - R, cx + R, cy + R]
d.arc(bb, 270 - A, 270 + (A * 0.28), fill=INK, width=8)            # 黑段（加粗）
d.arc(bb, 270 + (A * 0.28), 270 + A, fill=RED, width=10)           # 红段
n = 26
for i in range(n + 1):                                            # 印刻度（加粗加浓·看清）
    ang = -A + (2 * A) * i / n; major = (i % 3 == 0); tk = 70 if major else 42
    col = RED if ang > A * 0.28 else INK
    d.line([pt(ang, R - 5), pt(ang, R - 5 - tk)], fill=col, width=9 if major else 5)

def font(sz):
    for p in ('/System/Library/Fonts/HelveticaNeue.ttc', '/System/Library/Fonts/Helvetica.ttc',
              '/System/Library/Fonts/Supplemental/Arial.ttf'):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

f_num = font(46)
for ang, tx in [(-A, '20'), (-A * 0.45, '10'), (-A * 0.05, '5'), (A * 0.28, '0'), (A, '+3')]:
    px, py = pt(ang, R - 118); tb = d.textbbox((0, 0), tx, font=f_num)
    d.text((px - (tb[2]-tb[0]) / 2, py - (tb[3]-tb[1]) / 2), tx, fill=(RED if ang > A*0.28 else INK), font=f_num)

f_vu = font(132); tb = d.textbbox((0, 0), 'VU', font=f_vu)
d.text((cx - (tb[2]-tb[0]) / 2, int(H * 0.50)), 'VU', fill=INK, font=f_vu)

def tracked(text, y, f, sp, fill):                                # 蚀刻感小号大写·字距
    ws = [d.textbbox((0, 0), c, font=f) for c in text]; wid = [b[2]-b[0] for b in ws]
    x = cx - (sum(wid) + sp * (len(text)-1)) / 2
    for c, w in zip(text, wid): d.text((x, y), c, font=f, fill=fill); x += w + sp
tracked('LEVEL', int(H * 0.80), font(34), 12, FAINT)   # VU=瞬时事件能量（张力归记录仪，勿抢同变量）

img.save('/Users/shadow/tape0/art/hero/ref/vu_scale.png'); print('vu_scale v3', img.size)

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# DUB 键床铭文 v2（微观整改令④⑤）：字放大近一倍＋刻槽 AO 深陷——
# 白漆四周深色槽影（多向偏移暗写）+槽底投影（下移暗写）+漆面压光（非纯白）+下缘受光唇。
# 出图前左右预翻转（镜像机位反书解·自包含）。
from PIL import Image, ImageDraw, ImageFont

W, H = 640, 120
BED = (24, 24, 27)
PAINT = (196, 188, 170)      # 漆面压光（"深陷"的漆不该亮过受光唇）
GROOVE = (7, 7, 8)           # 刻槽暗环
LIP = (255, 232, 170)        # 槽下缘受光唇

img = Image.new('RGB', (W, H), BED)
d = ImageDraw.Draw(img)

def font(sz):
    for p in ('/System/Library/Fonts/HelveticaNeue.ttc', '/System/Library/Fonts/Helvetica.ttc'):
        try:
            return ImageFont.truetype(p, sz, index=1)
        except Exception:
            pass
    return ImageFont.load_default()

f = font(92)                 # ⑤ 字放大（58→92：船长"几乎看不清"）
text = 'DUB'
sp = 30
ws = [d.textbbox((0, 0), c, font=f) for c in text]
wid = [b[2] - b[0] for b in ws]
total = sum(wid) + sp * (len(text) - 1)
x0 = (W - total) / 2
ytxt = H / 2 - (ws[0][3] - ws[0][1]) / 2 - ws[0][1]

def each(fn):
    x = x0
    for c, w in zip(text, wid):
        fn(c, x)
        x += w + sp

# ④ 刻槽 AO：八向暗环（漆四周深陷槽影）＋槽底投影（下移 3px）
for dx, dy in ((-2,0),(2,0),(0,-2),(0,2),(-2,-2),(2,-2),(-2,2),(2,2)):
    each(lambda c, x: d.text((x+dx, ytxt+dy), c, font=f, fill=GROOVE))
each(lambda c, x: d.text((x, ytxt+3), c, font=f, fill=(4, 4, 5)))
# 受光唇（漆下缘 1px 亮·被漆面盖住只露唇）
each(lambda c, x: d.text((x, ytxt+1), c, font=f, fill=LIP))
# 漆面
each(lambda c, x: d.text((x, ytxt), c, font=f, fill=PAINT))

# 两侧饰线（同工艺：暗槽+漆+唇）
ymid = H // 2
for xa, xb in ((30, int(x0-46)), (int(W-(x0-46)), W-30)):
    d.rectangle([xa-2, ymid-6, xb+2, ymid+6], fill=GROOVE)
    d.rectangle([xa, ymid-4, xb, ymid+4], fill=PAINT)
    d.line([xa, ymid+5, xb, ymid+5], fill=LIP)

img.transpose(Image.FLIP_LEFT_RIGHT).save('/Users/shadow/tape0/art/hero/ref/dub_legend.png')
print('dub_legend v2', img.size)

#!/usr/bin/env python3
# 魔眼磷光屏贴图 v2（第十号手令乙-5）：中心暗(阴极)→向外辉光渐亮＋扇形遮光楔＋幽深荧光绿。
# 非换色——把"平面塑料绿圆"做成有纵深的磷光管屏面（作自发光贴图）。
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
S = 1024
yy, xx = np.mgrid[0:S, 0:S]
cx = cy = S / 2.0
r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (S * 0.46)      # 0=心，1=辉光缘
def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
inten = sstep(0.09, 0.50, r) * (1 - sstep(0.80, 1.02, r))       # 暗心→外亮→rim 淡出
R = (inten * 14).astype(np.uint8)                               # 幽深青绿磷光（decree12：与 DONE 宝石绿拉开·偏青）
G = (inten * 212).astype(np.uint8)
B = (inten * 150).astype(np.uint8)
img = Image.fromarray(np.dstack([R, G, B]), 'RGB')
d = ImageDraw.Draw(img)
bb = [cx - S * 0.46, cy - S * 0.46, cx + S * 0.46, cy + S * 0.46]
d.pieslice(bb, 90 - 23, 90 + 23, fill=(1, 3, 1))               # 扇形遮光楔（电子束缺口·底部）
d.ellipse([cx - S * 0.095, cy - S * 0.095, cx + S * 0.095, cy + S * 0.095], fill=(1, 4, 1))  # 暗阴极中枢
img = img.filter(ImageFilter.GaussianBlur(2.4))                 # 磷光柔散
img.save('/Users/shadow/tape0/art/hero/ref/eye_fan.png'); print('eye_fan phosphor v2', img.size)

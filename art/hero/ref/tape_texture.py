#!/usr/bin/env python3
# 带芯同心纹贴图（交底①）：暗棕磁带绕线，细同心层，微亮暗带——不再是平黑洞。
from PIL import Image, ImageDraw, ImageFilter
import math, random
S = 1024; img = Image.new('RGB', (S, S), (24, 17, 12)); d = ImageDraw.Draw(img)
cx = cy = S / 2; random.seed(11); r = S * 0.5
while r > 3:
    band = 20 + 9 * math.sin(r * 0.10) + random.uniform(-3, 3)  # 缓带 + 微噪
    g = max(6, int(band)); col = (g, int(g * 0.70), int(g * 0.52))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=2)
    r -= random.uniform(2.0, 3.2)
# 卷带末端缝（破 3 重旋转对称 → 自转可辨；八令硬伤①解药之一）：两道径向缝
for ang_deg, wd, col in ((-58, 5, (66, 45, 32)), (118, 3, (44, 31, 22))):
    a = math.radians(ang_deg)
    d.line([(cx, cy), (cx + math.cos(a) * S * 0.49, cy + math.sin(a) * S * 0.49)], fill=col, width=wd)
img = img.filter(ImageFilter.GaussianBlur(0.6))  # 磨掉锯齿，绕线柔和
img.save('/Users/shadow/tape0/art/hero/ref/tape_pack.png'); print('tape_pack', img.size)

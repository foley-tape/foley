#!/usr/bin/env python3
# 走纸记录仪贴图 v3（第九号手令必改 + 第十号合页：横向无缝可平铺）。
# 暖纸 + 纸纤维肌理 + 印刷不匀的时间栅 + 牛血红墨张力线。
# 合页要点：红墨线由"整数谐波"构成 → y(0)=y(W) 且斜率相接；栅距整除宽 → 走纸滚动无缝环。
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, math, random
W, H = 2200, 620
random.seed(9); rng = np.random.default_rng(5)

# —— 纸底：纸色 + 纤维噪声 + 横向淡 streak（整行→天然平铺）+ 极缓不匀 ——
base = np.array([234, 225, 202], dtype=np.float32)
grain = rng.normal(0, 4.2, (H, W, 1)).astype(np.float32)                      # 细颗粒（随机接缝不可见）
streak = np.repeat(rng.normal(0, 2.6, (H, 1, 1)).astype(np.float32), W, axis=1)  # 横向纤维·整行平铺
blotch = np.array(Image.fromarray((rng.normal(0, 1, (H // 14, W // 14, 1)).repeat(3, 2) * 255)
                  .clip(0, 255).astype(np.uint8)).resize((W, H)).convert('L')).astype(np.float32)
blotch = (blotch - blotch.mean())[..., None] * 0.10                            # 极缓不匀（振幅微·接缝不可见）
arr = np.clip(base + grain + streak + blotch, 0, 255).astype(np.uint8)
img = Image.fromarray(arr, 'RGB'); d = ImageDraw.Draw(img)

# —— 印刷不匀的时间栅（竖线落在整除宽的节拍上 → 平铺无接缝；深浅/线宽/偶缺仍不匀）——
def gridcol():
    dk = random.randint(5, 30)
    return (232 - dk, 223 - dk, 200 - int(dk * 0.85))
NCOL = 28
for i in range(NCOL):                                # i=0 落在 x=0 缝上，只画一次→平铺不重
    x = round(i * W / NCOL)
    if random.random() < 0.11: continue              # 偶有淡到近无
    d.line([(x, 34), (x, H - 34)], fill=gridcol(), width=random.choice([1, 1, 1, 2]))
for y in range(70, H - 40, 96):                      # 横线满幅→天然平铺
    if random.random() < 0.08: continue
    d.line([(0, y), (W, y)], fill=gridcol(), width=random.choice([1, 1, 2]))

# —— 牛血红墨张力线：整数谐波合成 → 横向严格周期（无缝环走纸的立身之本）——
mid = H * 0.52
HARM = [(3, 70, 0.40), (5, 40, 2.1), (7, 30, 1.10), (11, 20, 2.30),
        (17, 13, 0.70), (23, 9, 3.4), (31, 7, 4.00), (43, 5, 2.00)]   # k 皆整数→y(0)=y(W)
pts = []
for xi in range(0, W + 1, 4):
    p = 2 * math.pi * xi / W
    y = mid + sum(a * math.sin(k * p + ph) for k, a, ph in HARM)
    pts.append((xi, y))
d.line(pts, fill=(96, 30, 22), width=8, joint='curve')   # 渗透底
d.line(pts, fill=(120, 40, 31), width=4, joint='curve')  # 牛血红正身
img = img.filter(ImageFilter.GaussianBlur(0.5))
img.save('/Users/shadow/tape0/art/hero/ref/paper_chart.png'); print('paper_chart v3 tileable', img.size)

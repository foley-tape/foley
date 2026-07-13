#!/usr/bin/env python3
# 走纸记录仪·纸底贴图（decree12 P0）：纸纤维＋暖色＋不匀时间栅＋走带齿孔——**无墨线**。
# 墨线（牛血红张力线）留给真页 live canvas 画；此纸理横向可平铺，随纸位滚动。
from PIL import Image, ImageDraw, ImageFilter
import numpy as np, random
W, H = 2200, 620
random.seed(9); rng = np.random.default_rng(5)

# —— 纸底：纸色 + 纤维噪声 + 横向淡 streak（整行→天然平铺）+ 极缓不匀 ——
base = np.array([230, 218, 192], dtype=np.float32)
grain = rng.normal(0, 2.1, (H, W, 1)).astype(np.float32)                      # 细纸纤维（不成云斑）
streak = np.repeat(rng.normal(0, 2.0, (H, 1, 1)).astype(np.float32), W, axis=1)
blotch = np.array(Image.fromarray((rng.normal(0, 1, (H // 14, W // 14, 1)).repeat(3, 2) * 255)
                  .clip(0, 255).astype(np.uint8)).resize((W, H)).convert('L')).astype(np.float32)
blotch = (blotch - blotch.mean())[..., None] * 0.018                          # 极缓不匀（很弱·不夺墨线）
arr = np.clip(base + grain + streak + blotch, 0, 255).astype(np.uint8)
img = Image.fromarray(arr, 'RGB'); d = ImageDraw.Draw(img)

# —— 印刷不匀的时间栅（竖线落整除宽的节拍→平铺无缝；深浅/线宽/偶缺仍不匀）——
def gridcol():
    dk = random.randint(6, 26)
    return (222 - dk, 212 - dk, 190 - int(dk * 0.85))
NCOL = 28
for i in range(NCOL):
    x = round(i * W / NCOL)
    if random.random() < 0.10: continue
    d.line([(x, 30), (x, H - 30)], fill=gridcol(), width=random.choice([1, 1, 1, 2]))
for y in range(66, H - 36, 92):
    if random.random() < 0.08: continue
    d.line([(0, y), (W, y)], fill=gridcol(), width=random.choice([1, 1, 2]))

# —— 走带齿孔（上下缘·整除宽平铺）——
for m in range(0, W, W // 40):
    for cy in (12, H - 12):
        d.ellipse([m - 2, cy - 2, m + 2, cy + 2], fill=(120, 104, 84))

img = img.filter(ImageFilter.GaussianBlur(0.4))
img.save('/Users/shadow/tape0/stage/assets/paper.png'); print('paper_bg (no ink, tileable)', img.size)

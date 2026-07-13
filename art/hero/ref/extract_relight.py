#!/usr/bin/env python3
# 纸面重照层（decree13 乙-2＋放行④）：从场景板自身裁出空白纸区的烘焙光照，
# 低频化后除以 canvas 生纸（paper.png）均值 → 一张 multiply 层。
# 真页 live canvas（生纸理＋multiply 墨）叠此层＝继承板的精确光照与色调——光来自渲染，非前端手画。
# 用法: extract_relight.py <plate.png> <coords.json> <paper.png> <out.png>
import sys, json
import numpy as np
from PIL import Image, ImageFilter

plate_p, coords_p, paper_p, out_p = sys.argv[1:5]
coords = json.load(open(coords_p))
u, v, w, h = coords['recorder']
plate = Image.open(plate_p).convert('RGB')
W, H = plate.size
box = (round(u * W), round(v * H), round((u + w) * W), round((v + h) * H))
baked = plate.crop(box)
# 低频光照（滤掉烘焙纸自身的纤维/栅格细节——细节归 canvas 生纸）
low = baked.filter(ImageFilter.GaussianBlur(radius=max(4, baked.size[1] // 40)))
low_a = np.asarray(low).astype(np.float32) / 255.0
raw_mean = (np.asarray(Image.open(paper_p).convert('RGB')).astype(np.float32) / 255.0).reshape(-1, 3).mean(axis=0)
relight = np.clip(low_a / raw_mean, 0.0, 1.0)          # multiply 只能压暗：>1 处截断（烘焙不会比生纸亮）
Image.fromarray((relight * 255).astype('uint8')).save(out_p)
print(f'relight {baked.size} -> {out_p}  raw_mean={raw_mean.round(3)}  low_mean={low_a.reshape(-1,3).mean(axis=0).round(3)}')

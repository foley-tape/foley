#!/usr/bin/env python3
# 带盘胶片条打包（decree13 丁-②·LEDGER P0-1①）：N 帧 RGBA → 单张网格雪碧图 WebP（真页 canvas 抠帧 blit）。
# 用法: pack_strips.py <framesdir> <prefix> <N> <cols> <rows> <out.webp> [targetW]
#   targetW: 帧目标宽（P0-1①：全尺寸 720 帧解码后≈250MB 纹理·风暴冻盘元凶之一——降采样打包）
import sys, os
from PIL import Image

fdir, prefix, N, cols, rows, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
targetW = int(sys.argv[7]) if len(sys.argv) > 7 else 0
assert cols * rows >= N, 'grid too small'
first = Image.open(os.path.join(fdir, f'{prefix}{1:04d}.png'))
sw, sh = first.size
fw, fh = ((targetW, round(sh * targetW / sw)) if targetW else (sw, sh))
sheet = Image.new('RGBA', (fw * cols, fh * rows), (0, 0, 0, 0))
for i in range(N):
    p = os.path.join(fdir, f'{prefix}{i + 1:04d}.png')
    im = Image.open(p)
    assert im.size == (sw, sh), f'frame size drift {p} {im.size}'
    if (fw, fh) != (sw, sh):
        im = im.resize((fw, fh), Image.LANCZOS)   # 渲染帧超采样→降采样＝白得的 AA
    sheet.paste(im, ((i % cols) * fw, (i // cols) * fh))
sheet.save(out, 'WEBP', quality=88, method=6)
dec = fw * fh * cols * rows * 4 // (1024 * 1024)
print(f'packed {N} frames {fw}x{fh} -> {out} ({sheet.size[0]}x{sheet.size[1]}, {os.path.getsize(out)//1024}KB, 解码≈{dec}MB)')

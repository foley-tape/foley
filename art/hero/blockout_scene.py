#!/usr/bin/env python3
# TAPE·ZERO 高板构图稿（设计三§七两段渲·第一段 blockout）——独立脚本，不碰 hero_scene 产线与相机契约。
# 跑法：blender --background --python blockout_scene.py -- [outdir] [samples] [res_x] [seg]
#   seg = 'a'（机器段）| 'b'（带库段）| 'all'（两段连渲）
#
# ══ 渲染规格草案（数值随本稿定·终渲入契约）══════════════════════════════════
# 世界坐标：X 横（相机 X 镜像：世界 −X=屏右）·Z 纵（+上）·Y 纵深（相机在 +Y）。
# 【默认取景框（段A·一图三用令：此框=hero=README/OG）】
#   宽不变 7.82 世界（PLATE_CAM lens58 y12.6 血统）；z∈[−3.95, +2.25]，高 6.20：
#   REC 全脸入画（z1.92+壳<2.25·顶中独居负空间·盘裁而灯不裁）；
#   底部=前唇半影带+架沿一线（前唇梁 z−3.30±0.25·架沿 z−3.75）——架沿露 (3.95−3.55)/6.20≈10%vh ✓ 8–12% 内。
#   机器占视口高比原框缩 4.92/6.20=79%（纵贯时间轴入画的代价·构图决策）。
# 【段B 带库+鞋盒】z∈[−3.95, −11.0]，高 7.05；相机同 lens 同距下移（镜头下摇的物理=眼睛移动），
#   接缝 z=−3.95 藏架沿下暗区。高板总高 13.25 世界 ≈ 2.7 默认框高。
# 【时态纵贯（§一.1）】REC"现在"z2.05 → 双盘 z0.58 → 仪表带 z−1.15 → 纸 z−2.1 → 前唇 z−3.3
#   → 带库三层 z−4.3/−6.0/−7.7 → 鞋盒 z−9.5。
# 【落位重排（§三判决表·相对现 plate 的变更）】
#   计数轮：迁盘区右上小窗（世界 −X 顶区 x−2.55,z1.80）——数的是介质，属走带时态；
#   主功能选择器：三档旋钮 OFF·TEST·ON 落原 DUB 位近旁（世界 +X x1.15,z−1.12=灯组之下）——
#     "灯组+选择器=主仪表之左"；廉价拨杆+PLAY 圆顶灯处决（不建）；
#   DUB+纸长签：迁底部控制轨屏左段（世界 +X x1.9..2.75, z−2.78 行=与走带牌/琴键/翻牌同轨）；
#   余件照旧（盘/辊/磁头桥/魔眼中/VU 右/灯组左/记录仪底/走带牌/琴键/翻牌）。
# 【负空间配额草案（同批立法·终渲存档）】器件与器件净距 ≥0.18 世界（≈2.3%框宽）；
#   REC 独居半径 ≥0.9（与盘顶/框顶的空气）；每团块一个主角：盘区=双盘·仪表带=魔眼·纸区=墨线·架沿=盒脊节律。
# 【光度地形图（§二）】全宇宙一盏画外暖灯：key 右上高位（世界 (−6.5,7.5,5.5)·decree10 血统·写死）；
#   纵轴亮度阶梯=机器区满钨丝→前唇半影（梁自身挡 key=物理半影）→架区暗场→鞋盒最深（远衰减+无补光）。
# ═══════════════════════════════════════════════════════════════════════════
import bpy, sys, os
from math import radians, atan, tan

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUTDIR  = argv[0] if len(argv) > 0 else '/Users/shadow/tape0/art/hero/renders/blockout'
SAMPLES = int(argv[1]) if len(argv) > 1 else 64
RESX    = int(argv[2]) if len(argv) > 2 else 1280
SEG     = argv[3] if len(argv) > 3 else 'all'
os.makedirs(OUTDIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
try:
    cp = bpy.context.preferences.addons['cycles'].preferences
    cp.compute_device_type = 'METAL'
    try: cp.refresh_devices()
    except Exception: pass
    for d in cp.devices: d.use = True
    scene.cycles.device = 'GPU'
except Exception:
    scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.use_persistent_data = True
try: scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
scene.render.image_settings.file_format = 'PNG'

# ── 灰盒材质（blockout：形状与光说话，不做质感）──
def mat(name, g, rough=0.5, metallic=0.0, emit=None, estr=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (g, g * 0.97, g * 0.92, 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metallic
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = estr
    return m

M_body  = mat('body', 0.16, 0.42, 0.8)     # 面板暗青铜档
M_mid   = mat('mid', 0.38, 0.45, 0.6)      # 器件中灰
M_hi    = mat('hi', 0.62, 0.35, 0.7)       # 亮件（法兰/键帽）
M_dark  = mat('dk', 0.05, 0.6)             # 深件（带饼/暗窗）
M_wood  = mat('wood', 0.22, 0.7)           # 架体（暖木灰阶）
M_paper = mat('paper', 0.72, 0.6, emit=(1.0, 0.93, 0.78), estr=0.25)   # 纸微透光——主角是墨线不是纸
M_ink   = mat('ink', 0.30, 0.55, emit=(0.55, 0.12, 0.07), estr=0.9)    # 墨线（纸区主角·牛血红示意）
M_rec   = mat('rec', 0.1, 0.4, emit=(1.0, 0.11, 0.05), estr=5.0)
M_eye   = mat('eye', 0.05, 0.5, emit=(0.20, 0.80, 0.58), estr=10.0)    # 魔眼=仪表带主角（主仪表法）
M_vu    = mat('vu', 0.72, 0.45, emit=(1.0, 0.90, 0.72), estr=0.55)     # 背光可读不抢镜
M_lamp  = mat('lampw', 0.1, 0.3, emit=(1.0, 0.78, 0.52), estr=1.2)
M_rare  = mat('rare', 0.85, 0.25, 1.0)     # 白净金属巨盘=全鞋盒最稀藏品（10.5 寸档一只）

def cube(name, size, loc, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True); o.data.materials.append(m)
    return o

def cyl(name, r, depth, loc, m, rotx=90, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=(radians(rotx), 0, 0), vertices=verts)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    return o

# ══ 段A · 机器区 ══════════════════════════════════════════
cube('fascia', (9.0, 0.5, 7.2), (0, -0.30, 0.5), M_body)
# REC：一审③=下移双盘内弧眉心位 z0.98（可见机身至尖点·双圆负空间加冕）——盘顶裁 13.8% 而灯不裁；
# 净空自证：与盘弧 0.42/与框顶 0.25/与带横段 1.02，全 ≥ 自身直径 0.22
cyl('rec', 0.11, 0.10, (0.0, -0.06, 0.98), M_rec)
# 双盘（顶区·正在被录下的现在）：法兰+带饼
for sgn, pack in ((-1, 0.82), (1, 0.62)):
    cyl(f'reel{sgn}', 1.05, 0.10, (sgn * 1.5, -0.02, 0.58), M_hi)
    cyl(f'pack{sgn}', pack, 0.12, (sgn * 1.5, -0.05, 0.58), M_dark)
    cyl(f'hub{sgn}', 0.22, 0.16, (sgn * 1.5, -0.08, 0.58), M_mid)
# 计数轮（一审④）：右盘右下象限·盘区团块内缘（入团不入角·邮票病治愈）——贴弧外缘
cube('counter', (0.52, 0.06, 0.26), (-2.62, -0.04, -0.38), M_dark)
cube('counter_win', (0.42, 0.02, 0.16), (-2.62, 0.02, -0.38), M_mid)
# 磁头桥+三磁头+导辊+带路（走带族照旧 z−0.43..−0.56）
cube('hb', (1.86, 0.18, 0.30), (0, 0.0, -0.56), M_dark)
for i, hx in enumerate((-0.34, 0.0, 0.34)):
    cube(f'head{i}', (0.15, 0.13, 0.24), (hx, 0.05, -0.43), M_mid)
for sgn in (-1, 1):
    cyl(f'guide{sgn}', 0.10, 0.22, (sgn * 1.16, 0.10, -0.28), M_hi)
cube('band', (2.32, 0.02, 0.055), (0, 0.125, -0.18), M_dark)
for sgn in (-1, 1):                                                      # 带路斜段示意（饼缘→辊·连续性收编项）
    o = cube(f'diag{sgn}', (0.055, 0.02, 0.62), (sgn * 1.32, 0.125, 0.12), M_dark)
    o.rotation_euler[1] = sgn * 0.42
# 仪表带（瞬时的当下·目光之 T）：魔眼中心·VU 右·灯组+选择器左
cyl('eye', 0.33, 0.08, (0.0, 0.06, -1.15), M_eye)                       # 前脸 y=+0.10 探出 bezel（相机在 +Y）
cyl('eye_bezel', 0.40, 0.05, (0.0, 0.0, -1.15), M_mid)
cube('vuface', (1.30, 0.06, 0.60), (-1.85, -0.02, -1.12), M_vu)         # VU 收紧（一审④：两颗分离亮斑→成带·缘距魔眼 0.87）
for i, lz in enumerate((-0.88, -1.14, -1.40)):                           # 灯组三窗：主仪表之左
    cube(f'lampw{i}', (0.31, 0.05, 0.095), (0.68, -0.03, lz), M_lamp if i == 0 else M_dark)
# 主功能选择器（§四）：机加工旋钮三档 OFF·TEST·ON（拨杆+PLAY 圆顶处决·不建）
cyl('selector', 0.34, 0.16, (1.42, -0.04, -1.14), M_hi)                 # 一审④：放大配主控身份·同仪表带轴线
cube('sel_ptr', (0.045, 0.04, 0.27), (1.42, 0.06, -1.02), M_dark)       # 指针帽线（浮出旋钮前脸）
for a, dz in ((-0.32, 0.30), (0.0, 0.34), (0.32, 0.30)):                 # 三档刻度短线
    cube(f'sel_tick{a}', (0.02, 0.02, 0.08), (1.42 + a * 0.38, -0.05, -1.14 + dz * 0.82), M_mid)
# 走纸记录仪（今晚的历史·机身之底）+滑针
cube('recorder', (3.6, 0.13, 0.72), (0, 0.0, -2.10), M_mid)
cube('recpaper', (3.3, 0.02, 0.58), (0, 0.068, -2.10), M_paper)
o = cube('inkline', (3.1, 0.005, 0.035), (0, 0.082, -2.16), M_ink)       # 墨线=纸区主角（张力线示意·微波折）
o.rotation_euler[1] = 0.012
cube('penrail', (0.06, 0.05, 0.66), (1.42, 0.09, -2.10), M_hi)
# 底部控制轨（介质身份与出版动作）：走带牌+琴键（照旧）·翻牌（屏右）·DUB+纸签（迁屏左段）
cube('nameplate', (1.05, 0.04, 0.135), (0.325, -0.06, -2.76), M_mid)
for kx in (-0.62, -1.08):
    cube(f'key{kx}', (0.34, 0.10, 0.13), (kx, -0.02, -2.76), M_hi)
cube('flap', (1.60, 0.08, 0.42), (-2.35, -0.03, -2.76), M_dark)          # Solari 壳（屏右=−X·底盘重构 1.5×）
cube('flap_win', (1.22, 0.02, 0.185), (-2.35, 0.02, -2.76), M_mid)
cube('dub', (0.42, 0.09, 0.32), (2.05, -0.03, -2.70), M_hi)              # DUB 键迁底轨屏左（世界 +X）
for i in range(3):
    cube(f'dubtag{i}', (0.11, 0.03, 0.30), (2.45 + i * 0.16, -0.05, -2.70), M_mid)   # 纸签非发光体
# 前唇（转正·机身最底=三层地平线）：横梁向前突出→梁身自挡 key 光=物理半影带
cube('lip', (9.0, 0.9, 0.50), (0, -0.10, -3.30), M_body)
cube('lip_edge', (9.0, 0.94, 0.05), (0, -0.10, -3.06), M_hi)             # 梁上缘一线受光（地平线笔画）

# ══ 段B · 带库区（全部的历史）+ 鞋盒（封存的历史）══════════
cube('libback', (9.0, 0.3, 7.6), (0, -0.9, -7.35), M_body)              # 库房背板（真退后：前脸 y=-0.75 在盒脊之后）
SHELF_Z = (-4.65, -6.35, -8.05)   # 一审⑤：全体下移——前唇底(−3.55)与首层盒顶(≈−3.88)间 0.33 半影缝=浮尘光柱位
for i, sz in enumerate(SHELF_Z):
    cube(f'shelf{i}', (8.6, 1.0, 0.09), (0, 0.10, sz), M_wood)
# 盒脊阵列（架语=盘径阶梯：5/7/10.5 寸 → 脊高 0.52/0.72/1.06·尾出存带为库房常态·脊朝外）
import random
random.seed(7)
SPINE_H = {5: 0.52, 7: 0.72, 10.5: 1.06}
def spines(shelf_z, mix, gap_at=None, lean_at=None, pull_at=None):
    x = -4.05
    n = 0
    while x < 4.1:
        size = random.choice(mix)
        w = random.uniform(0.16, 0.22)
        if gap_at and n in gap_at: x += random.uniform(0.5, 0.9)          # 留空位=被取走的带（负空间节律）
        h = SPINE_H[size]
        m = M_rare if (shelf_z == SHELF_Z[2] and n == 11) else (M_mid if random.random() > 0.72 else M_wood)
        big = (lean_at or {}).get(n, 0.0)                                 # 一审⑤：斜倚带（朝空隙倒=生活感）
        lean = big if big else random.uniform(-0.02, 0.02)
        y = 0.10 + (0.30 if (pull_at and n in pull_at) else 0.0)          # 一审⑤：半抽出一盒（"最近碰过"）
        zc = shelf_z + 0.045 + h / 2 - (abs(big) * h * 0.22 if big else 0)
        o = cube(f'sp{shelf_z}{n}', (w, 0.86, h), (x + w / 2, y, zc), m)
        o.rotation_euler[1] = lean
        x += w + random.uniform(0.015, 0.05) + (abs(big) * h * 0.5 if big else 0)
        n += 1
spines(SHELF_Z[0], [7, 5, 7], gap_at={5, 14}, lean_at={6: -0.17, 15: -0.13, 22: 0.16})   # 首层：两空位+斜倚三本
spines(SHELF_Z[1], [7, 10.5, 5], gap_at={9}, lean_at={10: -0.19, 24: 0.14}, pull_at={17})# 中层：斜倚两本+半抽出一盒
spines(SHELF_Z[2], [10.5, 7, 10.5], gap_at=set(), lean_at={4: 0.13, 18: -0.16})          # 深层：大盘+白净巨盘（#11）+斜倚两本
# 鞋盒（最底·封存的历史·最深暗场）
for i, (bx, bz, bw) in enumerate(((-2.2, -10.3, 2.6), (1.4, -10.5, 2.2), (3.3, -10.2, 1.4))):
    cube(f'shoebox{i}', (bw, 1.6, 1.0), (bx, 0.35, bz), M_dark)
cube('floor', (9.0, 2.4, 0.1), (0, 0.6, -11.25), M_wood)

# ── 光（光度地形图：全宇宙一盏画外暖灯+两块反射源·纵轴亮度阶梯=距离衰减+梁挡光）──
def area(name, loc, energy, color, size, target):
    bpy.ops.object.light_add(type='AREA', location=loc)
    o = bpy.context.active_object; o.name = name
    o.data.energy = energy; o.data.color = color; o.data.size = size
    t = bpy.data.objects.new(name + '_t', None); bpy.context.collection.objects.link(t); t.location = target
    c = o.constraints.new('TRACK_TO'); c.target = t; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return o
area('key', (-6.5, 7.5, 5.5), 2300, (1.0, 0.66, 0.33), 4.5, (0, 0, 0.4))          # 右上高位·decree10 血统·写死
area('fill', (6.5, 6.0, 1.0), 285, (0.46, 0.60, 1.0), 9.0, (0, 0, 0.4))
# 库房度光（光度阶梯的下半）：一盏极弱暖光斜照带库上部、随深度自然衰减——盒脊沉于阴影但可辨
# （页面"光随指针"在此基态上点亮局部）；鞋盒区不给灯=只吃残光=最深。
area('lib', (-3.5, 7.0, -4.2), 95, (1.0, 0.74, 0.45), 6.0, (0.5, 0, -6.8))
world = bpy.data.worlds.new('room'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.013, 0.010, 0.008, 1); bg.inputs['Strength'].default_value = 0.165

# ── 相机（两段=镜头下摇的物理：同 lens 同距·段B 相机下移）──
bpy.ops.object.camera_add(location=(-0.2, 12.6, 0.3))
cam = bpy.context.active_object; scene.camera = cam
cam.data.lens = 58.0; cam.data.sensor_width = 36; cam.data.dof.use_dof = False
tgt = bpy.data.objects.new('cam_t', None); bpy.context.collection.objects.link(tgt); tgt.location = (-0.2, 0.05, -0.5)
cc = cam.constraints.new('TRACK_TO'); cc.target = tgt; cc.track_axis = 'TRACK_NEGATIVE_Z'; cc.up_axis = 'UP_Y'

def solve_frame(z_top, z_bot):
    """解 shift_y 与 res 比：使 y=0 平面上 [z_bot,z_top] 恰为画幅（宽 7.82 不变）。二分数值解。"""
    from bpy_extras.object_utils import world_to_camera_view as w2c
    from mathutils import Vector
    ratio = (z_top - z_bot) / 7.82
    scene.render.resolution_x = RESX; scene.render.resolution_y = int(RESX * ratio)
    lo, hi = -2.0, 2.0
    for _ in range(40):
        mid = (lo + hi) / 2
        cam.data.shift_y = mid
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        v_top = w2c(scene, cam.evaluated_get(dg), Vector((-0.2, 0.0, z_top))).y
        # shift_y 增大=画幅窗口上移=该点 v 减小（单调减）。目标 v_top=1（点恰在画顶）。
        if v_top > 1.0: lo = mid
        else: hi = mid
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    vt = w2c(scene, cam.evaluated_get(dg), Vector((-0.2, 0.0, z_top))).y
    vb = w2c(scene, cam.evaluated_get(dg), Vector((-0.2, 0.0, z_bot))).y
    print(f'[blockout] frame z[{z_bot},{z_top}] shift_y={cam.data.shift_y:.5f} res={scene.render.resolution_x}x{scene.render.resolution_y} vtop={vt:.4f} vbot={vb:.4f}')

def render(path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('[blockout] ->', path)

FRAME_A = (1.34, -4.09)    # 一审②③：机器 90%/架沿 10%（(4.09−3.55)/5.43）·框顶 1.34=盘顶裁 13.8% 而 REC 不裁
FRAME_B = (-4.09, -11.6)   # 带库+鞋盒段（层板下移随深·接缝藏架沿下暗区）

if SEG in ('a', 'all'):
    cam.location = (-0.2, 12.6, 0.3); tgt.location = (-0.2, 0.05, -0.5)
    solve_frame(*FRAME_A)
    render(os.path.join(OUTDIR, 'blockout_A_默认取景框.png'))
if SEG in ('b', 'all'):
    cam.location = (-0.2, 12.6, -7.8); tgt.location = (-0.2, 0.05, -8.6)   # 同俯角平移=镜头下摇
    solve_frame(*FRAME_B)
    render(os.path.join(OUTDIR, 'blockout_B_带库鞋盒.png'))
print('[blockout] done.')

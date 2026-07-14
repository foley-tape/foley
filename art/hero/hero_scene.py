#!/usr/bin/env python3
# TAPE·ZERO 英雄静帧 · Blender 场景（第六号手令 乙-工艺路线：预烘焙渲染管线）
# 甲×丙本体：一台真机、一束暖光、暗房收边；只建"英雄裁切"内的几何（永不露整机）。
# 跑法：Blender --background --python hero_scene.py -- [out.png] [samples] [res_x]
#
# 反塑料三律（本脚本的立身之本）：
#   1) 所有硬边倒角——CG 锐边是"假"的头号信号，倒角吃光才像金属。
#   2) 光来自渲染器：一暖键 + 一冷补 + 柔光板（金属要有可反射的世界）。
#   3) AgX 色彩管理——高光柔化，暖光不过曝成塑料白。
import bpy, sys, math, os
from math import radians, cos, sin

# ======================= CONFIG（逐轮只调这里） =======================
C = dict(
    # 布光（一冷一暖对打；暗房低世界光=一盏画外暖灯的戏剧）
    key_energy   = 2300.0, key_color=(1.0, 0.66, 0.33), key_loc=(-6.5, 7.5, 5.5), key_size=4.5,
    fill_energy  = 285.0,  fill_color=(0.46, 0.60, 1.0), fill_loc=(6.5, 6.0, 1.0), fill_size=9.0,
    rim_energy   = 800.0,  rim_color=(1.0, 0.82, 0.55), rim_loc=(2.5, -4.5, 6.5), rim_size=4.0,
    world_color  = (0.013, 0.010, 0.008), world_strength=0.165,
    softbox_str  = 3.4,
    # 相机（正面英雄取景，带盘为圆；轻微偏移给一丝立体）
    cam_loc=(0.5, 11.5, 0.9), cam_lens=57.0, cam_fstop=5.0, cam_target=(0.0, 0.05, 0.05),
    # 带盘
    reel_cx=1.5, reel_cz=0.58,
)
# ====================================================================

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT     = argv[0] if len(argv) > 0 else '/Users/shadow/tape0/art/hero/renders/hero_v1.png'
SAMPLES = int(argv[1]) if len(argv) > 1 else 220
RESX    = int(argv[2]) if len(argv) > 2 else 1600
MODE    = argv[3] if len(argv) > 3 else 'still'   # 'still' | 'anim' | 'loop' | 'recorder' | 'layout'
NFOVR   = int(argv[4]) if len(argv) > 4 else 0    # loop 帧数覆盖（仅低质量试片用；0=默认96）

# ---------- 复位 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- 渲染配置 ----------
scene.render.engine = 'CYCLES'
try:
    cprefs = bpy.context.preferences.addons['cycles'].preferences
    cprefs.compute_device_type = 'METAL'
    try: cprefs.refresh_devices()
    except Exception:
        try: cprefs.get_devices()
        except Exception: pass
    for d in cprefs.devices:
        d.use = True
        print('  device:', d.name, '|', d.type)
    scene.cycles.device = 'GPU'
except Exception as e:
    print('GPU init failed -> CPU:', e); scene.cycles.device = 'CPU'

scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
try: scene.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
scene.cycles.max_bounces = 8
scene.cycles.caustics_reflective = False
scene.render.resolution_x = RESX
scene.render.resolution_y = int(RESX * 10 / 16)   # 16:10 英雄比
scene.render.film_transparent = False
scene.render.use_persistent_data = True
try: scene.view_settings.view_transform = 'AgX'
except Exception: pass
try: scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    try: scene.view_settings.look = 'Medium High Contrast'
    except Exception: pass
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '16'
scene.render.filepath = OUT

# ---------- 材质工具 ----------
def _set(b, name, val):
    if name in b.inputs: b.inputs[name].default_value = val

def pmat(name, base=(0.5,0.5,0.5), metallic=0.0, rough=0.5, aniso=0.0, ior=1.45,
         spec=0.5, coat=0.0, transmission=0.0, emission=None, emit=0.0,
         bump=0.0, bump_scale=200.0, rough_var=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    _set(b,'Base Color', (*base,1)); _set(b,'Metallic', metallic); _set(b,'Roughness', rough)
    _set(b,'Anisotropic', aniso); _set(b,'IOR', ior); _set(b,'Specular IOR Level', spec)
    _set(b,'Coat Weight', coat); _set(b,'Transmission Weight', transmission)
    if emission is not None:
        _set(b,'Emission Color', (*emission,1)); _set(b,'Emission Strength', emit)
    # 反塑料：细噪声 bump + 粗糙度扰动——真机金属绝无完美均匀面
    if bump > 0 or rough_var > 0:
        tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=bump_scale
        tex.inputs['Detail'].default_value=8.0; tex.inputs['Roughness'].default_value=0.7
        if rough_var > 0:
            mr = nt.nodes.new('ShaderNodeMapRange')
            mr.inputs['To Min'].default_value=max(0.0, rough-rough_var); mr.inputs['To Max'].default_value=rough+rough_var
            nt.links.new(tex.outputs['Fac'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
        if bump > 0:
            bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value=bump; bp.inputs['Distance'].default_value=0.0015
            nt.links.new(tex.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

def emat(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value=(*color,1); e.inputs['Strength'].default_value=strength
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0])
    return m

def img_emissive(name, path, strength, rough=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    flipu = nt.nodes.new('ShaderNodeMath'); flipu.operation='SUBTRACT'; flipu.inputs[0].default_value=1.0
    nt.links.new(sep.outputs['X'], flipu.inputs[1]); nt.links.new(flipu.outputs['Value'], comb.inputs['X'])
    nt.links.new(sep.outputs['Z'], comb.inputs['Y'])  # 面在 XZ：U=1-X（镜像修正）, V=Z
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(path); img.extension='EXTEND'
    nt.links.new(comb.outputs['Vector'], img.inputs['Vector'])
    _set(b,'Metallic',0.0); _set(b,'Roughness',rough)
    nt.links.new(img.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(img.outputs['Color'], b.inputs['Emission Color']); _set(b,'Emission Strength', strength)
    return m

def img_pbr(name, path, rough=0.4, metallic=0.0, spec=0.5, bump=0.0, bump_scale=200):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(sep.outputs['X'], comb.inputs['X']); nt.links.new(sep.outputs['Z'], comb.inputs['Y'])  # 径向纹居中
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(path); img.extension='EXTEND'
    nt.links.new(comb.outputs['Vector'], img.inputs['Vector'])
    nt.links.new(img.outputs['Color'], b.inputs['Base Color'])
    _set(b,'Metallic',metallic); _set(b,'Roughness',rough); _set(b,'Specular IOR Level',spec)
    if bump > 0:
        tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=bump_scale; tex.inputs['Detail'].default_value=8.0
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value=bump; bp.inputs['Distance'].default_value=0.0015
        nt.links.new(tex.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

M_flange = pmat('flange', base=(0.64,0.54,0.37), metallic=1.0, rough=0.23, aniso=0.6, bump=0.16, bump_scale=220, rough_var=0.07)
M_brass  = pmat('brass',  base=(0.71,0.55,0.32), metallic=1.0, rough=0.21, aniso=0.35, bump=0.10, bump_scale=420, rough_var=0.04)
M_fascia = pmat('fascia', base=(0.255,0.24,0.22), metallic=1.0, rough=0.36, aniso=0.5, bump=0.15, bump_scale=150, rough_var=0.07)
M_tape   = img_pbr('tape', '/Users/shadow/tape0/art/hero/ref/tape_pack.png', rough=0.30, metallic=0.0, spec=0.55, bump=0.06, bump_scale=600)  # 交底①带芯同心纹
M_tapeband = pmat('tapeband', base=(0.050,0.035,0.030), metallic=0.0, rough=0.42, spec=0.45, aniso=0.3, bump=0.05, bump_scale=500)  # 走带·暗棕氧化层（连两盘·低调不夺焦）（十一问②）
M_penchrome= pmat('penchrome', base=(0.92,0.93,0.95), metallic=1.0, rough=0.16, spec=0.65, aniso=0.5)  # ④复审：滑针总成·临床冷硬铬钢（连杆/滑块/丝杠/锥针）
M_inkwet = pmat('inkwet', base=(0.185,0.020,0.008), metallic=0.0, rough=0.02, spec=0.9, coat=1.0)  # 显影介质统一令：触点＝墨包裹——#8C2F1B 颜料压一档抵受光；液体光学＝镜面化（船长"下药重"令：rough 0.06→0.02·coat rough 0.015）＝一枚晶莹锐点
_ib = M_inkwet.node_tree.nodes.get('Principled BSDF')
if _ib and 'Coat Roughness' in _ib.inputs: _ib.inputs['Coat Roughness'].default_value = 0.015
M_dark   = pmat('dark',   base=(0.028,0.028,0.032), metallic=0.2, rough=0.5)
M_steel  = pmat('steel',  base=(0.56,0.56,0.57), metallic=1.0, rough=0.28, bump=0.1, bump_scale=260, rough_var=0.05)
M_needle = pmat('needle', base=(0.02,0.015,0.015), metallic=0.25, rough=0.34)  # VU 黑针·在亮象牙脸上剪影（十一问③：指针看清）
M_ivory  = pmat('ivory',  base=(0.95,0.89,0.75), metallic=0.0, rough=0.5, emission=(1.0,0.90,0.72), emit=4.5)
M_vu     = img_emissive('vu', '/Users/shadow/tape0/art/hero/ref/vu_scale.png', 2.2, rough=0.42)  # 内透背光（十一问③：1.3 过暗看不清→2.2 可读·仍暗于魔眼13/琥珀4·不夺焦）
M_glass  = pmat('glass',  base=(1,1,1), metallic=0.0, rough=0.03, ior=1.5, transmission=1.0)
M_green  = emat('meye',   (0.24,0.92,0.30), 4.2)   # 魔眼管暖绿（乙之心）——不过曝成白
M_red    = emat('rec',    (1.0,0.11,0.05), 5.0)    # 全机唯一的红
M_amber  = emat('amber',  (1.0,0.55,0.14), 4.0)
M_eye_fan = img_emissive('eyefan', '/Users/shadow/tape0/art/hero/ref/eye_fan.png', 13.0, rough=0.5)  # 交底②扇形+发现⑧夺焦
M_paper  = img_emissive('paper', '/Users/shadow/tape0/art/hero/ref/paper_chart.png', 1.0, rough=0.62)  # 走纸记录仪·牛血红墨（发现⑨补建）
M_paperbk = pmat('paperbk', base=(0.80,0.76,0.66), metallic=0.0, rough=0.72, emission=(0.80,0.76,0.66), emit=0.5, bump=0.05, bump_scale=380)  # 纸背（撕纸唇·无正面墨镜像，必改品味项）
M_readout = pmat('readout', base=(0.86,0.82,0.66), metallic=0.0, rough=0.5, emission=(1.0,0.88,0.62), emit=1.3)  # 计数轮读数窗（微亮）
M_dust    = pmat('dust', base=(0.86,0.83,0.76), metallic=0.0, rough=0.9, spec=0.3, emission=(1.0,0.92,0.74), emit=1.1)  # 浮尘·微自发光（暗房里被暖光点亮的尘）（第十号合页）
# 状态灯组宝石（decree13：ASK 琥珀／DONE 绿宝石／Main 常亮）——基态暗，烘入场景板；真页 CSS 加性辉光只调亮度。
M_ask   = emat('ask',   (1.0,0.55,0.14), 0.8)    # 琥珀 ASK·基态更暗（十三号放行②：待机底噪足够幽暗·亮由 CSS 辉光说话）
M_done  = emat('done',  (0.12,0.95,0.42), 0.8)   # 绿宝石 DONE·基态更暗（完成一击 CSS 点亮）——宝石绿异于魔眼青绿磷光
M_pilot = emat('pilot', (1.0,0.78,0.52), 2.6)    # Main 常亮·钨丝奶油（014 附：双绿撞 DONE→主灯回奶油·三灯 琥珀/绿/奶油 各归其位）

# ---------- 几何工具 ----------
def _active(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o

def smooth(o, angle=38):
    _active(o)
    try: bpy.ops.object.shade_auto_smooth(angle=radians(angle))
    except Exception:
        try: bpy.ops.object.shade_smooth()
        except Exception: pass

def bevel(o, width=0.006, segs=3, angle=42):
    m = o.modifiers.new('bev','BEVEL'); m.width=width; m.segments=segs
    m.limit_method='ANGLE'; m.angle_limit=radians(angle)

def cube(name, size, loc, rot=(0,0,0), mat=None, bev=0.006):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name=name; o.scale=size
    bpy.ops.object.transform_apply(scale=True)
    if mat: o.data.materials.append(mat)
    if bev: bevel(o, width=bev)
    return o

def cyl(name, r, depth, loc, rot=(0,0,0), verts=96, mat=None, bev=0.004, sm=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object; o.name=name
    if mat: o.data.materials.append(mat)
    if sm: smooth(o)
    if bev: bevel(o, width=bev, segs=2)
    return o

def sphere(name, r, loc, mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24)
    o = bpy.context.active_object; o.name=name
    if mat: o.data.materials.append(mat)
    smooth(o, 60)
    return o

YAX = (radians(90), 0, 0)   # 让柱体轴指向 +Y（朝相机）——带盘绕此轴转

# ---------- 面板（英雄裁切外溢，永不露整机） ----------
cube('fascia', size=(9.0, 0.5, 7.2), loc=(0, -0.30, 0.5), mat=M_fascia, bev=0.02)
# 角螺丝
for sx,sz in [(-3.2,2.3),(3.2,2.3),(-3.2,-2.1),(3.2,-2.1)]:
    cyl(f'screw{sx}{sz}', r=0.07, depth=0.06, loc=(sx,-0.04,sz), rot=YAX, verts=24, mat=M_steel, bev=0.006)

# ---------- 带盘（英雄主角，扶正、满幅、在转的那一个位置） ----------
def build_reel(cx, cz, pack_r=0.82):
    # 部件全部 parent 到中心 empty——动效时只转 empty（光不动、盘在转）。
    y0 = 0.0; parts = []
    parts.append(cyl('pack', pack_r, 0.11, (cx, y0+0.055, cz), YAX, verts=128, mat=M_tape, bev=0))
    # 前法兰 + 三窗 + 中心孔（布尔）——平面着色保证盘面平整（不糊成塑料团）
    fl = cyl('flange', 1.02, 0.03, (cx, y0+0.122, cz), YAX, verts=224, mat=M_flange, bev=0, sm=False)
    cutters=[]
    for a in (90, 210, 330):
        wx=cx+0.52*cos(radians(a)); wz=cz+0.52*sin(radians(a))
        cutters.append(cyl('cut', 0.27, 0.5, (wx, y0+0.122, wz), YAX, verts=64, bev=0, sm=False))
    cutters.append(cyl('cuth', 0.185, 0.5, (cx, y0+0.122, cz), YAX, verts=64, bev=0, sm=False))
    for c in cutters:
        m=fl.modifiers.new('b','BOOLEAN'); m.operation='DIFFERENCE'; m.object=c; m.solver='EXACT'
    _active(fl)
    for m in list(fl.modifiers):
        if m.type=='BOOLEAN': bpy.ops.object.modifier_apply(modifier=m.name)
    for c in cutters: bpy.data.objects.remove(c, do_unlink=True)
    try: _active(fl); bpy.ops.object.shade_flat()
    except Exception: pass
    bevel(fl, width=0.006, segs=2); parts.append(fl)
    parts.append(cyl('bflange', 1.02, 0.02, (cx, y0-0.002, cz), YAX, verts=64, mat=M_flange, bev=0.003))
    parts.append(cyl('hub', 0.18, 0.17, (cx, y0+0.14, cz), YAX, verts=64, mat=M_brass, bev=0.006))
    parts.append(cyl('cap', 0.055, 0.22, (cx, y0+0.16, cz), YAX, verts=32, mat=M_dark, bev=0.004))
    # 不对称特征（八令硬伤①：破 3 重对称使自转可辨）——轮毂螺丝槽 + 单枚铆标
    parts.append(cube('hubslot', size=(0.095,0.024,0.016), loc=(cx, y0+0.185, cz), mat=M_steel, bev=0))
    _ba = radians(24)
    parts.append(cyl('badge', 0.075, 0.02, (cx+0.66*cos(_ba), y0+0.145, cz+0.66*sin(_ba)), YAX, verts=20, mat=M_brass, bev=0.005))
    bpy.ops.object.empty_add(location=(cx, y0+0.06, cz))
    e = bpy.context.active_object; e.name = f'reel_{cx:+.1f}'; e.rotation_mode='XYZ'
    for p in parts:
        p.parent = e; p.matrix_parent_inverse = e.matrix_world.inverted()
    return e

reelL = build_reel(-C['reel_cx'], C['reel_cz'], pack_r=0.85)   # 供带盘（满·大卷径·慢）
reelR = build_reel( C['reel_cx'], C['reel_cz'], pack_r=0.78)   # 收带盘（空·小卷径·快）

# ---------- VU 表（自发光表脸，被动仪器）——表脸须在壳体前沿之前，否则被壳挡黑 ----------
cube('vuhouse', size=(1.52,0.15,0.80), loc=(-2.4,-0.03,-1.12), mat=M_dark, bev=0.02)  # 归位：桥式短表
cube('vuface',  size=(1.30,0.03,0.60), loc=(-2.4,0.035,-1.12), mat=M_vu, bev=0.004)
# 金属指针（3D·有厚度·投影于脸）parent 到脸底枢轴 → 动效弹道旋转（十令硬伤：VU 活）
_vn = cube('vuneedle', size=(0.015,0.026,0.42), loc=(-2.4,0.062,-1.20), mat=M_needle, bev=0.002)
bpy.ops.object.empty_add(location=(-2.4,0.05,-1.40)); vu_piv=bpy.context.active_object; vu_piv.name='vu_piv'; vu_piv.rotation_mode='XYZ'; vu_piv.rotation_euler[1]=radians(30)  # 静帧休止位（低）
_vn.parent=vu_piv; _vn.matrix_parent_inverse=vu_piv.matrix_world.inverted()
cube('vuglass', size=(1.38,0.015,0.66), loc=(-2.4,0.080,-1.12), mat=M_glass, bev=0.004)

# ---------- 魔眼管（新增·乙之心：暖绿电平电子管） ----------
cyl('meye_back', 0.34, 0.10, (0.0,-0.02,-1.15), YAX, verts=56, mat=M_dark, bev=0.014)   # 暗后座
cyl('meye_glow', 0.30, 0.02, (0.0,0.04,-1.15), YAX, verts=96, mat=M_eye_fan, bev=0)      # 磷光屏·凹进管底（十令乙-5：纵深）
meye_pupil = cyl('meye_pupil', 0.085, 0.012, (0.0,0.052,-1.15), YAX, verts=32, mat=M_dark, bev=0)  # 瞳·动效缩放=开合
bpy.ops.mesh.primitive_torus_add(location=(0.0,0.15,-1.15), rotation=(radians(90),0,0), major_radius=0.315, minor_radius=0.052)
_ez=bpy.context.active_object; _ez.name='meye_bezel'; _ez.data.materials.append(M_steel)   # 金属圈框·吃光（从面板长出·纵深）
for _p in _ez.data.polygons: _p.use_smooth=True

# ---------- 走带拨杆（PLAY，手势示能）——杆＋钮 parent 到基座 empty，动效时绕 X 拨下/拨回 ----------
cyl('lev_base', 0.16, 0.10, (2.35,0.05,-1.25), YAX, verts=40, mat=M_steel, bev=0.01)
_lst = cube('lev_stem', size=(0.07,0.07,0.55), loc=(2.35,0.16,-0.98), rot=(radians(-16),0,0), mat=M_steel, bev=0.02)
_lkn = sphere('lev_knob', 0.11, (2.35,0.28,-0.74), mat=M_dark)
bpy.ops.object.empty_add(location=(2.35,0.10,-1.20))
lever_piv = bpy.context.active_object; lever_piv.name='lever_piv'; lever_piv.rotation_mode='XYZ'
for _p in (_lst,_lkn):
    _p.parent=lever_piv; _p.matrix_parent_inverse=lever_piv.matrix_world.inverted()

# ---------- 走纸记录仪（宪法命脉·纸即时间轴·牛血红墨·撕纸即出片）——发现⑨补建 ----------
pen_piv = None; PEN = {}
def build_recorder(cz=-2.1, w=3.6, h=0.72):
    global pen_piv, PEN
    cube('rec_house', size=(w+0.28,0.16,h+0.22), loc=(0,-0.02,cz), mat=M_dark, bev=0.02)         # 暗框凹槽
    cube('rec_paper', size=(w,0.02,h), loc=(0,0.065,cz), mat=M_paper, bev=0.004)                  # 纸·牛血红墨线
    cube('rec_lip',   size=(w,0.05,0.07), loc=(0,0.10,cz-h/2-0.03), rot=(radians(22),0,0), mat=M_paperbk, bev=0.006)  # 撕纸唇·纸背无墨镜像（必改品味项）
    # 笔在纸"此刻"缘（世界 -X = 屏幕右）；臂 parent 检流计枢轴→动效绕 Y 摆·笔尖精确骑红墨线（十一问①：笔不再只画不动）
    ex,ey,ez = -1.95,0.09,cz
    cyl('rec_pivot', 0.10, 0.12, (-1.95,0.05,cz), YAX, verts=28, mat=M_steel, bev=0.01)           # 检流计本体·固定
    arm = cube('rec_arm', size=(0.5,0.035,0.045), loc=(-1.72,0.11,cz+0.03), rot=(0,0,radians(-7)), mat=M_steel, bev=0.006)
    tipx,tipz = -1.5, cz+0.05
    tip   = cyl('rec_tip',   0.016, 0.14, (tipx,0.085,tipz), YAX, verts=16, mat=M_dark, bev=0)     # 专场旧笔尖（板/新 sprite 均不渲）
    # ── 第三批④·船长复审版滑针总成（想穿再做：线性导轨正统） ─────────────────────────────
    # 机构：伺服马达(板上座球)→驱动座→竖丝杠→滑块螺母——滑块(carriage)自外整体包抱导轨(THK式)，
    # 层序天然自洽(滑块层盖轨层)；渲 sprite 时对侧件 visible_camera=False 但**在场**→接缝 AO/暗部烘进层。
    # 材质提纯：连杆/滑块/丝杠/针=M_penchrome(临床冷硬)；针尖=真锥针，apex 顶点打点导出→墨端由构造重合。
    RAILX = tipx-0.365
    # 触点＝湿墨珠·扁球穹顶（想穿三稿：薄盘=平脸无液光；正球=对镜头半球吃不到主光整颗黑；
    # 穹顶=盘的红脸＋球的曲率——中心法线朝镜头红可读、缘上菲涅尔暗缘、顶部曲面点出锐利小反光）
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=(tipx,0.052,tipz), segments=48, ring_count=24)
    touch = bpy.context.active_object; touch.name='rec_touch'; touch.scale[1]=0.4
    touch.data.materials.append(M_inkwet); smooth(touch, 60)
    # 液体高光＝微型辉点灯（真反射非画点）。光链路 receiver_collection 实测本机 Cycles 无效
    # （两次换灯位输出逐位相同＝灯贡献恒零）——弃 API 黑箱，改确定性法：默认 hide_render，
    # 仅 sprite_penarm 分支点亮（板/条/动效诸模式零影响；溢光只给铬件添真实小反光）。
    # 灯位＝镜面律解析（第一稿凭感觉放错侧：反射把入射横向分量翻号，偏 35° 斑落珠外）：
    # 入射 d=cam→珠；取"珠顶偏上 25°"为反光点法线 n=(0,cos25°,sin25°)；refl=d−2(d·n)n；灯沿 refl 0.08m 处
    # （近灯=光斑角径大——亚像素反射斑被 AA 稀释的解药）。
    # 三勘：①0.08m 近灯在铬锥上倒平方爆白斑——退 0.30m 驯服铬件；②扁球法线被缩放挤向 +Y
    # （inverse-transpose：ny/0.4 再归一），球面 25° 点真法线仅 ~10°——目标法线按压扁后取 12°；
    # ③发光体加大 soft 0.01（光斑角径 ~4°）保反射斑在像素网格上存活。
    _gl = bpy.data.lights.new('glint', 'POINT'); _gl.energy = 10.0; _gl.shadow_soft_size = 0.003   # 点光源化=反射斑锐边（船长锐化令·配 5120 超采样防 AA 吃点）
    _glo = bpy.data.objects.new('glint', _gl); bpy.context.scene.collection.objects.link(_glo)
    # 四勘（遮挡手算）：珠顶反光的灯→珠光线恰穿铬锥包围盒＝针自食其灯，珠顶恒影。
    # 反光点改珠左上（世界 +x/+z＝屏幕左上＝墨线来向·净空无遮挡）；法线走压扁逆转置（ny/0.4 再归一）。
    _CAM = (-0.2, 12.6, 0.3)                          # 场景板锁死机位（sprite 诸模式同此）
    _bead = (tipx, 0.052, tipz)
    _dv = [(_bead[i]-_CAM[i]) for i in range(3)]
    _dl = sum(c*c for c in _dv) ** 0.5; _dv = [c/_dl for c in _dv]
    _th = radians(28)
    _ns = (sin(_th)*0.7071, cos(_th), sin(_th)*0.7071)   # 球面参数法线（+x/+z 对分）
    _n = (_ns[0], _ns[1]/0.4, _ns[2])
    # 定稿勘：反光点实测落珠-针咬合缘（六渲对比取最优）——恰是"液体包裹针尖的表面张力"被光看见处；
    # 几何顶部对全部可用灯位的镜像路径均被针系遮挡/出视界（压扁穹顶顶部法线束极窄），不再强求。
    _nl = sum(c*c for c in _n) ** 0.5; _n = tuple(c/_nl for c in _n)
    _dn = sum(_dv[i]*_n[i] for i in range(3))
    _rf = [_dv[i] - 2*_dn*_n[i] for i in range(3)]
    _glo.location = tuple(_bead[i] + _rf[i]*0.30 for i in range(3))
    _glo.hide_render = True
    link  = cube('pen_link', size=(0.20,0.026,0.030), loc=(RAILX+0.135,0.085,tipz), mat=M_penchrome, bev=0.004)  # 滑块→针连杆
    shank = cyl('pen_shank', 0.007, 0.075, (tipx-0.125,0.085,tipz), rot=(0,radians(90),0), verts=16, mat=M_penchrome, bev=0)
    bpy.ops.mesh.primitive_cone_add(radius1=0.0125, radius2=0.0035, depth=0.09, location=(tipx-0.045,0.085,tipz), rotation=(0,radians(90),0))
    cone=bpy.context.active_object; cone.name='pen_cone'; cone.data.materials.append(M_penchrome); smooth(cone)  # 锥针·apex 指向纸(+x)
    car   = cube('pen_collar', size=(0.075,0.050,0.115), loc=(RAILX,0.100,tipz), mat=M_penchrome, bev=0.007)     # 滑块·外包导轨
    nut   = cube('pen_nut', size=(0.042,0.036,0.052), loc=(RAILX-0.042,0.088,tipz), mat=M_steel, bev=0.005)      # 丝杠螺母耳
    # —— 静件（sprite_penrail）：导轨型材+丝杠+中位驱动座+上下端座；驱动座桥接伺服座球 ——
    cube('pen_rail', size=(0.036,0.036,h+0.14), loc=(RAILX,0.072,cz), mat=M_dark, bev=0.004)                     # 导轨·黑
    cyl('pen_screw', 0.0075, h+0.10, (RAILX-0.042,0.078,cz), verts=16, mat=M_penchrome, bev=0)   # 竖丝杠（柱轴本即世界Z·免转）
    cube('pen_house', size=(0.085,0.040,0.095), loc=(RAILX-0.052,0.048,cz), mat=M_dark, bev=0.006)               # 驱动座·衔伺服球(退在滑块行程之后)
    cube('pen_mount_t', size=(0.10,0.042,0.045), loc=(RAILX-0.02,0.060,cz+h/2+0.055), mat=M_steel, bev=0.005)
    cube('pen_mount_b', size=(0.10,0.042,0.045), loc=(RAILX-0.02,0.060,cz-h/2-0.055), mat=M_steel, bev=0.005)
    bpy.ops.object.empty_add(location=(ex,ey,ez)); pen_piv=bpy.context.active_object
    pen_piv.name='pen_piv'; pen_piv.rotation_mode='XYZ'
    bpy.ops.object.empty_add(location=(tipx,0.085,tipz)); apexm=bpy.context.active_object; apexm.name='pen_apex'  # 针尖物理极点打点
    for p in (arm,tip,touch,link,shank,cone,car,nut,apexm):
        p.parent=pen_piv; p.matrix_parent_inverse=pen_piv.matrix_world.inverted()
    PEN=dict(cz=cz,h=h,w=w,tipx=tipx,dx0=tipx-ex,dz0=tipz-ez)    # 笔尖相对枢轴静止偏移（反解摆角用）

# ---------- REC 红宝石（全机唯一的红） ----------
cyl('rec_bezel', 0.11, 0.05, (0.0,0.05,1.92), YAX, verts=32, mat=M_steel, bev=0.008)
sphere('rec_jewel', 0.075, (0.0,0.11,1.92), mat=M_red)

# ---------- 计数轮（机械里程）——立体化（十令乙-3：安装框＋倒角吃光＋下陷投影，从面板长出）----------
cube('cnt_plate', size=(0.76,0.12,0.48), loc=(-1.0,0.015,-1.12), mat=M_dark, bev=0.026)     # 凸出安装底板·框感·投影
cube('cnt_win',   size=(0.52,0.03,0.28), loc=(-1.0,0.07,-1.12), mat=M_readout, bev=0.008)    # 读窗·proud·倒角
for _dx in (-0.175,-0.06,0.06,0.175):
    cube('cnt_sep'+str(_dx), size=(0.014,0.035,0.26), loc=(-1.0+_dx,0.088,-1.12), mat=M_dark, bev=0)

# ---------- DUB 键（光机融合案·命题一：形由手定）——凹面素帽+深键床行程影+框上白漆填刻铭文 ----------
cube('dub_plate', size=(0.74,0.11,0.56), loc=(1.28,0.015,-1.12), mat=M_dark, bev=0.026)      # 凸出安装底板（加深容铭文）
cube('dub_bed',  size=(0.50,0.075,0.38), loc=(1.14,0.020,-1.10), mat=M_dark, bev=0.010)      # 键床沉框：键四周暗缝=行程证词
# 键帽=全四边面重建（架构师拓扑令：布尔直出在平顶留 N-gon=平滑着色崩溃的唯一真因——布尔与切球全废）
# 拓扑：顶面 64×48 四边网格 → 凹碟由球帽解析剖面逐顶点位移长出（Rs=(R0²+D²)/2D·法线连续）
# → Solidify 出侧壁（全四边）→ 45° 限角 Bevel 只吃箱棱=保护圈（碟缘 21.6° 坡不受染·着色锁死碟内）
bpy.ops.mesh.primitive_grid_add(x_subdivisions=64, y_subdivisions=48, size=1.0,
                                location=(1.14, 0.185, -1.10), rotation=(radians(-90), 0, 0))
_kc = bpy.context.active_object; _kc.name = 'dub_key'
_kc.scale = (0.40, 0.28, 1.0)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)   # 先定尺后倒角（免非均匀缩放斜切倒角）
_R0 = 0.115; _D = 0.022; _Rs = (_R0*_R0 + _D*_D) / (2*_D)
for _v in _kc.data.vertices:
    _r = math.hypot(_v.co.x, _v.co.y)
    if _r < _R0:
        _v.co.z -= (math.sqrt(_Rs*_Rs - _r*_r) - (_Rs - _D))
_sol = _kc.modifiers.new('sol', 'SOLIDIFY'); _sol.thickness = 0.20; _sol.offset = -1.0
_bv = _kc.modifiers.new('bev', 'BEVEL'); _bv.width = 0.028; _bv.segments = 3
_bv.limit_method = 'ANGLE'; _bv.angle_limit = radians(45)
_kc.data.materials.append(M_steel)
smooth(_kc, 40)
# 铭文 — DUB —：白漆填刻（薄立方贴图法=vuface 已证管线；plane 法线朝背的坑首渲抓获）
M_dublegend = img_pbr('dublegend', '/Users/shadow/tape0/art/hero/ref/dub_legend.png', rough=0.42, metallic=0.0, spec=0.35)
cube('dub_legend', size=(0.42,0.006,0.078), loc=(1.14, 0.075, -1.338), mat=M_dublegend, bev=0)   # 微观令⑤放大；顶面须出底板面 0.07（0.062 被吞——二渲抓获）
M_tagpaper = pmat('tagpaper', base=(0.46,0.42,0.345), metallic=0.0, rough=0.82, spec=0.18, bump=0.07, bump_scale=520)  # 微观令②：真纸 PBR（M_paperbk 自发光 0.5=不受光白块元凶）·降 Albedo+粗颗粒+吃 AO
cube('dub_tags',  size=(0.12,0.04,0.44), loc=(1.5,0.06,-1.12), mat=M_tagpaper, bev=0.008)       # 纸长签·凸·倒角

# ---------- 状态灯组（光机融合案·命题二：Dead-front 暗面显字）——宝石退役，三扇暗面信号窗 ----------
# 熄灭=深烟色滤光玻璃近黑（死面纪律：无光即无字）；激活=DOM 光字（CUE/WRAP/LINE）从窗内点亮。
# 光谱归物理（命题三）：CUE 氩气蓝／WRAP 钨丝灼橙／LINE 暗房红宝石。
# 修正案（船长圈选甲）：「全机唯一**信号亮红**归 REC；照度 ≤0.15 的暗房红宝石属基底照度，不构成信号红。」
M_dfglass = pmat('dfglass', base=(0.010,0.010,0.013), metallic=0.0, rough=0.045, spec=0.9)   # 微观令③：光学介质要锐反射（哑光死黑=黑胶带）；配 3° 俯角避满幅白片
def df_window(name, x, z, tilt=3.0, yaw=0.0):
    cube(name+'_bz', size=(0.36,0.05,0.135), loc=(x,0.05,z), mat=M_steel, bev=0.010)      # 钢窄框
    cube(name+'_gl', size=(0.31,0.020,0.095), loc=(x,0.072,z), rot=(radians(tilt),0,radians(yaw)), mat=M_dfglass, bev=0.004)  # 烟玻凸框 7mm·俯角=锐反射切线扫玻面（沉实心框=只见钢板·二渲抓获）
df_window('lamp_ask',  0.66, -0.88)
df_window('lamp_done', 0.66, -1.14)
# ⑥杂症"白条黑窗"案定谳：3° 俯角在灯柱最下扇恰好整面吃主光→右 60% 炸白（上两扇同参只挂细边线）。
# peek 五俯角×四双轴勘定：**tilt 8°/yaw 0**——入深黑与姊妹窗同族·下缘余一线掠射光=光学介质证明仍在。
# 每扇姿态随其面板高度对光独立成立（试验口留档·定稿值即缺省）。
df_window('lamp_main', 0.66, -1.40,
          tilt=float(os.environ.get('DF_MAIN_TILT', '8')),
          yaw=float(os.environ.get('DF_MAIN_YAW', '0')))

# ---------- PLAY 示能灯（014 丙-1：无主光球实体化）——钨丝暖白圆顶小灯＋钢圈＋灯罩檐，物理住走带拨杆旁 ----------
# 琥珀是 ASK 圣色不得他用；此灯基态微亮（灯体常在），手势前的呼吸＝CSS 辉光只调亮度。
M_playdome = emat('playdome', (1.0, 0.88, 0.66), 1.15)
cyl('play_bez', 0.095, 0.06, (2.72, 0.05, -1.25), YAX, verts=28, mat=M_steel, bev=0.008)
sphere('play_dome', 0.062, (2.72, 0.10, -1.25), mat=M_playdome)
cube('play_hood', size=(0.21, 0.10, 0.05), loc=(2.72, 0.115, -1.15), rot=(radians(-38), 0, 0), mat=M_dark, bev=0.012)  # 灯罩檐·上遮

# ---------- 走带牌（decree13 乙-5/丁-⑥：现代胶囊拆除——曲名/带名归蚀刻黄铜牌＋机械换曲拨杆·decree6 丙-4）----------
# 牌居记录仪之下的底缘带；蚀刻字＝动态层唯一的字（带名随带换·不可烘死），本体黄铜从渲染出。
# 底盘重构（船长令·下半区三分法）：左档案区（铭牌裁短收窄=只读识别·视觉退后）／
# 中操作区（唯一交互件=换曲·大机械琴键×2 坐键床=盲操体量·拨杆三件退役）／右展示核心（翻字牌×1.5 烙入板）
cube('name_plate', size=(1.05,0.045,0.135), loc=(0.325,0.012,-2.76), mat=M_brass, bev=0.010)   # 黄铜牌·左缘锚定 +0.85
cube('key_bed', size=(0.86,0.055,0.17), loc=(-0.85,0.008,-2.76), mat=M_dark, bev=0.008)        # 键床（暗座·键嵌其中）
cube('key_prev', size=(0.34,0.11,0.13), loc=(-0.62,0.045,-2.76), mat=M_steel, bev=0.014)       # ‹‹ 琴键（screen 左）
cube('key_next', size=(0.34,0.11,0.13), loc=(-1.08,0.045,-2.76), mat=M_steel, bev=0.014)       # ›› 琴键（screen 右）

# ---------- Solari 翻字牌（BATCH3 ②）：曲名迁出主牌·拨杆屏右的独立机械翻字单元 ----------
# 本体=暗壳+薄铜唇框+12 格空白翻卡（烙板即"缺席留白"的物理态：无曲名时看见的就是空白卡）；
# 活字=DOM 层只在有曲名时覆于窗内（stage/js/flapboard.js·环序滚动+WAAPI 折叶）。
# 材质：卡片=哑光漆面铝（非金属高光——真 Solari 卡是喷漆的），壳同机脸，唇框吃 np_lamp 鎏光。
M_flapcard = pmat('flapcard', base=(0.030,0.024,0.018), metallic=0.0, rough=0.55, spec=0.3)
# 轻工路线（船长圈选③）：壳厚 ×1.3+窗上移留下唇（贴曲单纸标签·圈选①甲案）+角钉加粗+微凸防尘玻璃罩。
# 玻璃罩=独立"橱窗层"（sprite_flapglass·反射分量专用 M_vitrine）：压在 DOM 活字之上层序才对；
# 折射分量薄玻璃可略——烙进底层反而会双印/压字。
FLAP = dict(cx=-2.06, cz=-2.78, w=1.60, h=0.285, cells=12, coff=0.030, winh=0.150)   # 底盘重构：×1.5=下半区视觉核心（壳烙入板·sprite层退役）
def build_flapboard():
    cx, cz, w, h = FLAP['cx'], FLAP['cz'], FLAP['w'], FLAP['h']
    cz2 = cz + FLAP['coff']                     # 窗芯上移 → 下唇成标签位
    WW, WH = w*0.934, FLAP['winh']
    cube('flap_case', size=(w,0.12,h), loc=(cx,0.060,cz), mat=M_fascia, bev=0.010)
    cube('flap_lip_t', size=(WW+0.036,0.018,0.018), loc=(cx,0.124,cz2+WH/2+0.013), mat=M_brass, bev=0.004)
    cube('flap_lip_b', size=(WW+0.036,0.018,0.018), loc=(cx,0.124,cz2-WH/2-0.013), mat=M_brass, bev=0.004)
    cube('flap_lip_l', size=(0.018,0.018,WH+0.060), loc=(cx+WW/2+0.015,0.124,cz2), mat=M_brass, bev=0.004)
    cube('flap_lip_r', size=(0.018,0.018,WH+0.060), loc=(cx-WW/2-0.015,0.124,cz2), mat=M_brass, bev=0.004)
    cube('flap_cards', size=(WW,0.020,WH), loc=(cx,0.106,cz2), mat=M_flapcard, bev=0.002)   # 空白卡幅（窗内芯·沉于唇后）
    cube('flap_ax', size=(WW,0.014,0.006), loc=(cx,0.112,cz2), mat=M_dark, bev=0.001)       # 折轴缝线
    pitch = WW/FLAP['cells']
    for k in range(1, FLAP['cells']):
        cube(f'flap_div{k:02d}', size=(0.008,0.016,WH+0.006), loc=(cx-WW/2+pitch*k,0.113,cz2), mat=M_dark, bev=0.001)
    cyl('flap_scr_l', 0.016, 0.014, (cx+w*0.486,0.121,cz), YAX, verts=16, mat=M_steel, bev=0.002)   # 角钉再加粗（×1.5 壳配重）
    cyl('flap_scr_r', 0.016, 0.014, (cx-w*0.486,0.121,cz), YAX, verts=16, mat=M_steel, bev=0.002)
    # 微凸防尘玻璃罩（扁椭球穹）：默认只入 sprite_flapglass 层
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=(cx,0.114,cz2), segments=64, ring_count=32)
    gd = bpy.context.active_object; gd.name='flap_glass'; gd.scale=(WW*0.75, 0.055, WH*1.5)   # 椭球远大于窗→深切出直边（浅弓曲率）
    _mv = bpy.data.materials.new('vitrine'); _mv.use_nodes=True
    _nt = _mv.node_tree; _nt.nodes.clear()
    _out = _nt.nodes.new('ShaderNodeOutputMaterial')
    _mix = _nt.nodes.new('ShaderNodeMixShader')
    _tr  = _nt.nodes.new('ShaderNodeBsdfTransparent')
    _gl  = _nt.nodes.new('ShaderNodeBsdfGlossy'); _gl.inputs['Roughness'].default_value=0.02
    _fr  = _nt.nodes.new('ShaderNodeFresnel'); _fr.inputs['IOR'].default_value=1.5
    _nt.links.new(_fr.outputs['Fac'], _mix.inputs['Fac'])
    _nt.links.new(_tr.outputs['BSDF'], _mix.inputs[1])
    _nt.links.new(_gl.outputs['BSDF'], _mix.inputs[2])
    _nt.links.new(_mix.outputs['Shader'], _out.inputs['Surface'])
    gd.data.materials.append(_mv); smooth(gd, 60)
    # 椭球∩方盒＝矩形曲面玻璃片（悬浮椭圆是钟表玻璃不是 Solari 防尘罩）——直边坐进铜唇
    gcut = cube('flap_gcut', size=(WW+0.036, 0.5, WH+0.030), loc=(cx,0.126,cz2), mat=None, bev=0)
    _bm = gd.modifiers.new('cut', 'BOOLEAN'); _bm.operation='INTERSECT'; _bm.object=gcut
    gcut.hide_render = True
    gd.hide_render = True                        # 底层 sprite_flap 不含玻璃（免双印/压字）
    # 玻璃拉丝灯（仅 sprite_flapglass 亮）：窄长面光沿镜面律置于浅弓上带反射向——
    # 横向长条高光=曲率的签名（暗房里浅弓映不到东西，产品摄影橱窗手法补一盏）
    _sl = bpy.data.lights.new('flap_streak', 'AREA'); _sl.energy = 150.0
    _sl.shape = 'RECTANGLE'; _sl.size = 1.5; _sl.size_y = 0.045; _sl.color = (0.90, 0.95, 1.0)   # 光影清洗②：更锐更冷的反射切线（窄条+冷白+高能）
    _slo = bpy.data.objects.new('flap_streak', _sl); bpy.context.scene.collection.objects.link(_slo)
    _slo.location = (cx-0.15, 1.30, cz2-0.05)
    _st = bpy.data.objects.new('flap_streak_t', None); bpy.context.scene.collection.objects.link(_st)
    _st.location = (cx, 0.114, cz2)
    _sc = _slo.constraints.new('TRACK_TO'); _sc.target=_st; _sc.track_axis='TRACK_NEGATIVE_Z'; _sc.up_axis='UP_Y'
    _slo.hide_render = True
build_flapboard()

# ---------- 走纸记录仪归位（第九号手令第一步）：落机器下器件带·带盘之下 ----------
build_recorder()

# ═════════ 高板（渲染批·步二终渲·构图稿过闸 2026-07-14）═════════
# 「这套几何就是契约：blockout 的相机即最终相机」——器件重排/新建全按过闸 blockout 落位；
# 旧模式（plate/strip/sprite 族）零扰：HIGH 分支才搬家/拆建。动件条沿用者（盘/辊/带/滑针/翻牌）不动位。
HIGH = MODE in ('highplate', 'highplate_b', 'strip_selector', 'strip_counter')

def _mv(prefixes, dx=0.0, dz=0.0):
    """按名前缀搬家（对象级平移·parent 树随动）。"""
    for o in list(bpy.data.objects):
        if any(o.name == p or o.name.startswith(p) for p in prefixes):
            o.location.x += dx; o.location.z += dz

M_wood   = pmat('shelfwood', base=(0.16,0.115,0.075), metallic=0.0, rough=0.62, spec=0.3, bump=0.10, bump_scale=90, rough_var=0.08)   # 库房架木（深胡桃）
M_spineA = pmat('spineA', base=(0.235,0.19,0.14), metallic=0.0, rough=0.75, spec=0.25, bump=0.08, bump_scale=300)  # 盒脊·布面帆布（架区暗场压反照）
M_spineB = pmat('spineB', base=(0.20,0.155,0.11), metallic=0.0, rough=0.68, spec=0.3, bump=0.06, bump_scale=420)   # 盒脊·深纸板
M_spineC = pmat('spineC', base=(0.30,0.26,0.21), metallic=0.0, rough=0.55, spec=0.35, bump=0.05, bump_scale=380)   # 盒脊·浅卡纸（压反照）
M_rareTin= pmat('raretin', base=(0.78,0.77,0.74), metallic=1.0, rough=0.28, aniso=0.4, bump=0.08, bump_scale=260)  # 白净金属巨盘盒（全鞋盒最稀藏品）
M_shoebx = pmat('shoebox', base=(0.115,0.095,0.075), metallic=0.0, rough=0.8, spec=0.2, bump=0.05, bump_scale=200) # 鞋盒·哑光旧纸板
M_cntdead= pmat('cntdead', base=(0.035,0.033,0.030), metallic=0.0, rough=0.35, spec=0.6)                            # 计数读窗·休眠即黑（dead-front）

def build_high():
    # ── 器件重排（blockout 过闸落位）──
    _mv(('rec_bezel', 'rec_jewel'), dz=0.98 - 1.92)                        # REC 下移眉心位（盘裁灯不裁）
    _mv(('cnt_plate', 'cnt_win', 'cnt_sep'), dx=-2.62 - (-1.0), dz=-0.38 - (-1.12))   # 计数轮：右盘右下象限入团
    _co = bpy.data.objects.get('cnt_win')
    if _co: _co.data.materials.clear(); _co.data.materials.append(M_cntdead)          # 休眠即黑（设计三§三参数）
    _mv(('vuhouse', 'vuface', 'vuneedle', 'vuglass', 'vu_piv'), dx=-1.85 - (-2.4))    # VU 收紧成带
    _mv(('lamp_ask', 'lamp_done', 'lamp_main'), dx=0.68 - 0.66)                       # 灯组微调净距
    _mv(('dub_',), dx=2.05 - 1.14, dz=-2.70 - (-1.10))                                # DUB 族迁底部控制轨（键锚 1.14→2.05）
    # 纸长签：竖排单块改横排三签（blockout 过闸形制·底轨行高内）
    _dt = bpy.data.objects.get('dub_tags')
    if _dt: bpy.data.objects.remove(_dt, do_unlink=True)
    for _i in range(4):                                   # 四档纸签（DOM len-tab 30/45/60/90 同数——渲签与档位一一对应）
        cube(f'dub_tag{_i}', size=(0.105,0.04,0.30), loc=(2.42 + _i * 0.148, 0.06, -2.70), mat=M_tagpaper, bev=0.008)
    # ── 处决：走带拨杆三件+PLAY 圆顶灯（设计三§四·选择器继任）──
    for _nm in ('lev_base', 'lev_stem', 'lev_knob', 'lever_piv', 'play_bez', 'play_dome', 'play_hood'):
        _o = bpy.data.objects.get(_nm)
        if _o: bpy.data.objects.remove(_o, do_unlink=True)
    # ── 主功能选择器（§四：机加工旋钮 OFF·TEST·ON·Nagra 血统）──
    sx, sz = 1.42, -1.14
    cyl('sel_base', 0.40, 0.045, (sx, 0.02, sz), YAX, verts=96, mat=M_dark, bev=0.008)          # 面板座环
    _knb = cyl('sel_knob', 0.30, 0.16, (sx, 0.09, sz), YAX, verts=96, mat=M_steel, bev=0.010)   # 旋钮本体
    for _a in range(24):                                                                          # 滚花缘（机加工防滑齿）
        _ang = radians(_a * 15)
        cube(f'sel_knurl{_a}', size=(0.018, 0.14, 0.052),
             loc=(sx + 0.295 * cos(_ang), 0.09, sz + 0.295 * sin(_ang)),
             rot=(0, -_ang, 0), mat=M_steel, bev=0.003)
    _cap = cyl('sel_cap', 0.115, 0.20, (sx, 0.10, sz), YAX, verts=64, mat=M_fascia, bev=0.008)   # 深色帽芯
    _ptr = cube('sel_ptr', size=(0.030, 0.024, 0.20), loc=(sx, 0.185, sz + 0.155), mat=M_ivory, bev=0.004)  # 指针白线（象牙填漆）
    bpy.ops.object.empty_add(location=(sx, 0.09, sz))
    _sp = bpy.context.active_object; _sp.name = 'sel_piv'; _sp.rotation_mode = 'XYZ'
    for _o in ([_knb, _cap, _ptr] + [bpy.data.objects[f'sel_knurl{_a}'] for _a in range(24)]):
        _o.parent = _sp; _o.matrix_parent_inverse = _sp.matrix_world.inverted()
    _sp.rotation_euler[1] = radians(38)                                                          # 板姿态=ON 档（绕向实证：+38 指尖落屏右 ON 刻度）
    for _i, (_lbl, _ang) in enumerate((('OFF', 38), ('TEST', 0), ('ON', -38))):                  # 三档刻度+蚀字
        _ra = radians(_ang)
        cube(f'sel_tick{_i}', size=(0.016, 0.03, 0.06),
             loc=(sx + 0.44 * sin(_ra), 0.045, sz + 0.44 * cos(_ra)), rot=(0, -_ra, 0), mat=M_steel, bev=0.002)
        bpy.ops.object.text_add(location=(sx + 0.56 * sin(_ra), 0.03, sz + 0.56 * cos(_ra) - 0.03))
        _tx = bpy.context.active_object; _tx.name = f'sel_txt{_i}'
        _tx.data.body = _lbl; _tx.data.size = 0.072; _tx.data.align_x = 'CENTER'; _tx.data.extrude = 0.002
        _tx.rotation_euler = (radians(90), 0, 0)
        _tx.scale[0] = -1.0                                     # 相机 X 镜像下正读（dub_legend 预翻转同坑同解）
        _tx.data.materials.append(M_ivory)
    # ── 前唇（转正·三层地平线）：梁自挡 key=物理半影带 ──
    cube('lip_beam', size=(9.0, 0.9, 0.50), loc=(0, -0.10, -3.30), mat=M_fascia, bev=0.02)
    cube('lip_edge', size=(9.0, 0.94, 0.045), loc=(0, -0.10, -3.055), mat=M_brass, bev=0.008)    # 上缘黄铜压条（地平线笔画）
    # ── 带库（全部的历史）：三层架+盘径阶梯盒脊（blockout 同种子=同布）──
    cube('lib_back', size=(9.0, 0.3, 8.4), loc=(0, -0.9, -7.75), mat=M_fascia, bev=0)
    SHELF_Z = (-4.65, -6.35, -8.05)
    SPINE_H = {5: 0.52, 7: 0.72, 10.5: 1.06}
    for _i, _szl in enumerate(SHELF_Z):
        cube(f'lib_shelf{_i}', size=(8.6, 1.0, 0.09), loc=(0, 0.10, _szl), mat=M_wood, bev=0.012)
        # 格口防尘檐（横档·老档案架构件）：首层檐身横跨段A/B 接缝 z=−4.09——缝落进均匀木条内不可见
        # （跨缝三维体在两机位下有视差错位·盒脊错位案的解=藏缝入均匀体）；三层同形制=家具语法一致
        cube(f'lib_eave{_i}', size=(8.72, 0.86, 0.27), loc=(0, 0.19, _szl + 0.495), mat=M_wood, bev=0.012)
    for _px in (-4.36, 4.36):                                             # 端柱（画外·撑层板与檐的物理暗示）
        cube(f'lib_post{_px}', size=(0.24, 0.9, 4.8), loc=(_px, 0.14, -6.0), mat=M_wood, bev=0.012)
    import random as _r
    _r.seed(7)
    def _spines(shelf_z, mix, gap_at=None, lean_at=None, pull_at=None, rare_at=None):
        x = -4.05; n = 0
        while x < 4.1:
            size = _r.choice(mix)
            w = _r.uniform(0.16, 0.22)
            if gap_at and n in gap_at: x += _r.uniform(0.5, 0.9)
            h = SPINE_H[size]
            _m = M_rareTin if (rare_at and n in rare_at) else _r.choice((M_spineA, M_spineB, M_spineB, M_spineC))
            big = (lean_at or {}).get(n, 0.0)
            lean = big if big else _r.uniform(-0.02, 0.02)
            y = 0.10 + (0.42 if (pull_at and n in pull_at) else 0.0)   # 半抽出加大（正面可读性·二审目验）
            zc = shelf_z + 0.045 + h / 2 - (abs(big) * h * 0.22 if big else 0)
            o = cube(f'sp{shelf_z}{n}', size=(w, 0.86, h), loc=(x + w / 2, y, zc), mat=_m, bev=0.006)
            o.rotation_euler[1] = lean
            if pull_at and n in pull_at: o.rotation_euler[2] = 0.05   # 抽出的带微歪（拔了一半的手感）
            x += w + _r.uniform(0.015, 0.05) + (abs(big) * h * 0.5 if big else 0)
            n += 1
    _spines(SHELF_Z[0], [7, 5, 7], gap_at={5, 14}, lean_at={6: -0.17, 15: -0.13, 22: 0.16})
    _spines(SHELF_Z[1], [7, 10.5, 5], gap_at={9}, lean_at={10: -0.19, 24: 0.14}, pull_at={17})
    _spines(SHELF_Z[2], [10.5, 7, 10.5], gap_at=set(), lean_at={4: 0.13, 18: -0.16}, rare_at={11})
    # ── 鞋盒（封存的历史·一审⑤：矮、带盖、一只半开——去"搬家纸箱"感）──
    for _i, (_bx, _bz, _bw, _open) in enumerate(((-2.2, -10.35, 2.3, False), (1.35, -10.5, 2.0, True), (3.25, -10.25, 1.3, False))):
        cube(f'shoe_body{_i}', size=(_bw, 1.5, 0.62), loc=(_bx, 0.30, _bz), mat=M_shoebx, bev=0.012)      # 矮箱身
        _lid_rot = (radians(-14), 0, radians(3)) if _open else (0, 0, 0)                                   # 半开=盖斜搭
        _lid_z = _bz + 0.36 if _open else _bz + 0.335
        _ld = cube(f'shoe_lid{_i}', size=(_bw + 0.06, 1.56, 0.09), loc=(_bx + (0.12 if _open else 0), 0.30, _lid_z), rot=_lid_rot, mat=M_shoebx, bev=0.012)
    cube('lib_floor', size=(9.0, 2.4, 0.1), loc=(0, 0.6, -11.15), mat=M_wood, bev=0)
    # ── 库房度光（光度地形图下半：盒脊沉于阴影但可辨=光随指针的基态）──
    area('lib', (-3.5, 7.0, -4.2), 75, (1.0, 0.74, 0.45), 6.0, target=(0.5, 0, -6.8))
# （调用点在灯段 area() 定义之后——见「高板点火」段）

# ---------- 笔尖骑线（十一问①）：用与红墨贴图同一套整数谐波反解笔臂摆角，笔尖恒落在线端 ----------
PEN_HARM=[(3,70,0.40),(5,40,2.1),(7,30,1.10),(11,20,2.30),(17,13,0.70),(23,9,3.4),(31,7,4.00),(43,5,2.00)]
PEN_MID=0.52; PEN_H=620.0
def pen_line_z(scroll):                     # 笔尖世界X处·红墨线的世界Z（贴图 U=1−Xgen+scroll·可平铺）
    xgen=(PEN['tipx']+PEN['w']/2)/PEN['w']; u=(1.0-xgen+scroll)%1.0
    px=PEN_MID*PEN_H + sum(a*math.sin(k*2*math.pi*u+ph) for k,a,ph in PEN_HARM)
    return (PEN['cz']-PEN['h']/2)+(1.0-px/PEN_H)*PEN['h']
def pen_beta(target):                       # 反解检流计臂 Y 摆角，使笔尖精确落到 target 世界Z
    dx0=PEN['dx0']; dz0=PEN['dz0']; R=math.hypot(dx0,dz0)
    D=max(-R*0.999,min(R*0.999,target-PEN['cz'])); return -math.atan2(dx0,dz0)+math.acos(D/R)
if pen_piv is not None: pen_piv.rotation_euler[1]=pen_beta(pen_line_z(0.0))   # 静帧/记录仪/布局：笔骑线端（scroll 0）

# ---------- 走带路径 + 头块（十一问② → 第三批③ 带路连续性：饼缘切线→辊→头面→辊→饼缘） ----------
# 修路三律：①带平面恒 y=TAPE_Y（盘上介于前后法兰之间——带永不穿到前法兰之前）；
# ②桥/磁头整体退到带平面之后（front y < 带前脸 0.123），带横穿在头面前一线——看得见的过头；
# ③辊身骑带（带吻辊内脸、裹过辊顶），辊端面朝相机带偏心孔——转起来肉眼可辨（strip_guide 供帧）。
TAPE_Y=0.12; GUIDE_R=0.10; GUIDE_X=1.02; GUIDE_Z=-0.52
def tape_seg(a, b, w=0.055, th=0.006, mat=None, name='tape'):
    mx=(a[0]+b[0])/2; my=(a[1]+b[1])/2; mz=(a[2]+b[2])/2
    dx=b[0]-a[0]; dz=b[2]-a[2]; L=math.hypot(dx,dz); ang=math.atan2(dz,dx)
    return cube(name, size=(L,th,w), loc=(mx,my,mz), rot=(0,-ang,0), mat=(mat or M_tapeband), bev=0.0015)

def _ext_tangent(ax, az, ra, bx, bz, rb):
    # 两圆外公切线切点候选（P1 于 A 圆、P2 于 B 圆）；选取权归调用者
    dx,dz=bx-ax,bz-az; d=math.hypot(dx,dz); base=math.atan2(dz,dx)
    t=math.acos(max(-1.0,min(1.0,(ra-rb)/d)))
    out=[]
    for s in (+1.0,-1.0):
        a1=base+s*t
        out.append(((ax+ra*math.cos(a1), az+ra*math.sin(a1)), (bx+rb*math.cos(a1), bz+rb*math.sin(a1))))
    return out

# 带面流动材质（strip_band 用同一材质逐帧推 Mapping.x——板上帧0与条帧1同相=零跳变）
BAND_TILES=6.0
def _make_streak_img(name='band_streaks', w=512, h=64):
    img=bpy.data.images.get(name)
    if img is None: img=bpy.data.images.new(name, w, h, alpha=False)
    px=[0.0]*(w*h*4)
    import random as _r; _r.seed(7)
    rows=[0.5+0.22*_r.uniform(-1,1) for _ in range(h)]
    for y in range(h):
        for x in range(w):
            v=rows[y]+0.10*math.sin(2*math.pi*(3*x/w+y*0.13))+0.06*math.sin(2*math.pi*(7*x/w+y*0.31))
            v=max(0.0,min(1.0,v)); i=(y*w+x)*4
            px[i]=px[i+1]=px[i+2]=v; px[i+3]=1.0
    img.pixels[:]=px
    return img
def _bandrun_mat():
    m=bpy.data.materials.new('bandrun'); m.use_nodes=True
    nt=m.node_tree; bsdf=nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value=(0.050,0.035,0.030,1.0)
    bsdf.inputs['Metallic'].default_value=0.0
    tex=nt.nodes.new('ShaderNodeTexImage'); tex.image=_make_streak_img(); tex.extension='REPEAT'; tex.interpolation='Linear'
    mp=nt.nodes.new('ShaderNodeMapping'); uv=nt.nodes.new('ShaderNodeTexCoord')
    mp.inputs['Scale'].default_value[0]=BAND_TILES
    nt.links.new(uv.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
    rng=nt.nodes.new('ShaderNodeMapRange')
    rng.inputs['To Min'].default_value=0.34; rng.inputs['To Max'].default_value=0.52
    nt.links.new(tex.outputs['Color'], rng.inputs['Value'])
    nt.links.new(rng.outputs['Result'], bsdf.inputs['Roughness'])
    bmp=nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value=0.10
    nt.links.new(tex.outputs['Color'], bmp.inputs['Height'])
    nt.links.new(bmp.outputs['Normal'], bsdf.inputs['Normal'])
    return m, mp
M_bandrun, BAND_MAP = _bandrun_mat()

def build_guide(tag, gx, gz):
    parts=[]
    parts.append(cyl('gbody_'+tag,GUIDE_R,0.15,(gx,0.13,gz),YAX,verts=48,mat=M_steel,bev=0.006))
    parts.append(cyl('gflangeF_'+tag,0.135,0.018,(gx,0.204,gz),YAX,verts=48,mat=M_steel,bev=0.004))
    parts.append(cyl('gflangeB_'+tag,0.135,0.018,(gx,0.056,gz),YAX,verts=48,mat=M_steel,bev=0.004))
    parts.append(cyl('gcap_'+tag,0.032,0.03,(gx,0.208,gz),YAX,verts=24,mat=M_brass,bev=0.003))
    parts.append(cyl('gdot_'+tag,0.016,0.022,(gx+0.062,0.209,gz),YAX,verts=16,mat=M_dark,bev=0))   # 偏心孔·示转唯一特征
    bpy.ops.object.empty_add(location=(gx,0.13,gz))
    e=bpy.context.active_object; e.name='guide_'+tag; e.rotation_mode='XYZ'
    for p in parts:
        p.parent=e; p.matrix_parent_inverse=e.matrix_world.inverted()
    return e

def build_transport():
    zc=-0.56
    cube('hb_base', size=(1.86,0.18,0.30), loc=(0.0,0.0,zc), mat=M_dark, bev=0.02)               # 桥·front y=0.09 退带后
    for i,hx in enumerate((-0.34,0.0,0.34)):
        cube('head'+str(i), size=(0.15,0.13,0.24), loc=(hx,0.05,-0.43), mat=M_steel, bev=0.02)   # 磁头抬升就带（草验实测校位：带横穿头顶前脸）
    build_guide('l',-GUIDE_X,GUIDE_Z); build_guide('r',GUIDE_X,GUIDE_Z)
    ztop=GUIDE_Z+GUIDE_R
    for sgn,pr in ((-1,0.85),(+1,0.78)):                                                          # 供厚/收薄各自成切
        cands=_ext_tangent(sgn*C['reel_cx'], C['reel_cz'], pr, sgn*GUIDE_X, GUIDE_Z, GUIDE_R)
        p1,p2=min(cands, key=lambda c: abs(c[0][0]))                                              # 取盘内缘那条（|P1x| 小）
        tape_seg((p1[0],TAPE_Y,p1[1]), (p2[0],TAPE_Y,p2[1]), name='tape_diag')                    # 饼缘→辊内脸
    tape_seg((-GUIDE_X,TAPE_Y,ztop),(GUIDE_X,TAPE_Y,ztop), mat=M_bandrun, name='tape_run')        # 辊顶→辊顶·横穿头面（活段）
build_transport()

# ---------- 浮尘（第十号合页：暗房空气里被暖光点亮的尘·真 3D 有视差·只在动效piece）----------
DUST = []
def make_dust(n=22):
    import random as _dr; _dr.seed(41)
    for i in range(n):
        # 铺在机器与相机之间的体积里，偏键光扫掠的上方/前景暗处，避开器件正脸
        x = _dr.uniform(-4.6, 4.6); z = _dr.uniform(-2.4, 3.2); y = _dr.uniform(2.4, 9.2)
        r = _dr.uniform(0.004, 0.014)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=(x, y, z))
        o = bpy.context.active_object; o.name = f'dust{i}'; o.data.materials.append(M_dust)
        try: o.visible_shadow = False
        except Exception: pass
        # 每粒不同相位/整数周期的正弦漂移参数（无缝环：周期整除环长）
        DUST.append(dict(o=o, x=x, y=y, z=z,
                         ax=_dr.uniform(0.04,0.16), az=_dr.uniform(0.05,0.20), ay=_dr.uniform(0.03,0.10),
                         nx=_dr.choice([1,2]), nz=_dr.choice([1,2]), ny=_dr.choice([1,2]),
                         px=_dr.uniform(0,6.28), pz=_dr.uniform(0,6.28), py=_dr.uniform(0,6.28)))
if MODE in ('anim', 'loop'):
    make_dust()

# ---------- 柔光板（金属的反射源，不入镜） ----------
def softbox(name, loc, sx, sz, color=(1,0.9,0.78), strength=None, rot=(0,0,0)):
    strength = C['softbox_str'] if strength is None else strength
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o=bpy.context.active_object; o.name=name; o.scale=(sx,sz,1)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(emat(name+'_m', color, strength))
    try: o.visible_camera=False
    except Exception: pass
    return o
# 违宪⑥修：撤冷色柔光板（曾在左盘/拨杆留第二组冷高光边）——反射源只留暖，全宇宙一盏暖灯
softbox('sb_L', (-9, 6, 3), 6, 8, color=(1.0,0.86,0.66), rot=(0,radians(55),0))
softbox('sb_T', (0, 4.2, 6.4), 9, 3.4, color=(1.0,0.92,0.8), strength=2.8, rot=(radians(60),0,0))

# ---------- 灯 ----------
def area(name, loc, energy, color, size, target=(0,0,0.4), glossy=True):
    bpy.ops.object.light_add(type='AREA', location=loc)
    o=bpy.context.active_object; o.name=name
    o.data.energy=energy; o.data.color=color; o.data.size=size
    if not glossy:                          # 违宪⑥修：冷光降为纯填充，不生自身高光边
        try: o.visible_glossy=False
        except Exception: pass
    tgt=bpy.data.objects.new(name+'_t', None); bpy.context.collection.objects.link(tgt); tgt.location=target
    c=o.constraints.new('TRACK_TO'); c.target=tgt; c.track_axis='TRACK_NEGATIVE_Z'; c.up_axis='UP_Y'
    return o
key_light = area('key', C['key_loc'], C['key_energy'], C['key_color'], C['key_size'])
area('fill', C['fill_loc'], C['fill_energy'], C['fill_color'], C['fill_size'], glossy=False)  # 纯填充暗部
area('rim',  C['rim_loc'],  C['rim_energy'],  C['rim_color'],  C['rim_size'])
# 发现⑧：魔眼绿溢，压过 REC/VU 的扩散度而夺焦（纯溢光，不在金属上打绿高光）
bpy.ops.object.light_add(type='POINT', location=(0.0, 0.55, -1.15))
eye_spill = bpy.context.active_object; eye_spill.data.energy=9.0; eye_spill.data.color=(0.22,1.0,0.36); eye_spill.data.shadow_soft_size=0.30
try: eye_spill.visible_glossy=False
except Exception: pass
eye_bsdf = M_eye_fan.node_tree.nodes.get('Principled BSDF')   # 魔眼呼吸：动效 keyframe 其发光强度
rec_emit = M_red.node_tree.nodes.get('Emission')              # REC 逻辑正向：动效 keyframe 其发光（八令硬伤②）
# 走带牌照灯（decree13 ⑥）：真机 legend 照明惯例——一点暖光洒在底缘黄铜牌上，蚀刻可读；光在渲染里非前端
bpy.ops.object.light_add(type='AREA', location=(0.0, 1.5, -2.15))
np_lamp = bpy.context.active_object; np_lamp.name='np_lamp'
np_lamp.data.energy=150.0; np_lamp.data.size=1.7; np_lamp.data.color=(1.0, 0.82, 0.60)   # 底盘重构：区带更宽（牌+琴键+大翻牌）·灯幅同扩
# 注意：黄铜 metallic=1.0 只吃 glossy——此灯必须保留 glossy 可见（首验 34W/300W 全黑即此因）；
# 牌上一线柔和鎏光=legend 灯的物理本相，非第二主光。
_npt=bpy.data.objects.new('np_lamp_t', None); bpy.context.collection.objects.link(_npt); _npt.location=(-0.35, 0.03, -2.76)   # 洗匀牌·键·翻牌三区
_npc=np_lamp.constraints.new('TRACK_TO'); _npc.target=_npt; _npc.track_axis='TRACK_NEGATIVE_Z'; _npc.up_axis='UP_Y'
# 走纸：给纸插 Mapping 以横向滚动（墨线随张力爬行），贴图改 REPEAT 连续走纸
_pt = M_paper.node_tree
_pimg = next((n for n in _pt.nodes if n.type=='TEX_IMAGE'), None)
paper_map = None
if _pimg is not None:
    _pimg.extension = 'REPEAT'
    paper_map = _pt.nodes.new('ShaderNodeMapping')
    for _l in list(_pt.links):
        if _l.to_node==_pimg and _l.to_socket==_pimg.inputs['Vector']:
            _src=_l.from_socket; _pt.links.remove(_l)
            _pt.links.new(_src, paper_map.inputs['Vector']); _pt.links.new(paper_map.outputs['Vector'], _pimg.inputs['Vector']); break

# ---------- 世界（暗房） ----------
world = bpy.data.worlds.new('room'); scene.world=world; world.use_nodes=True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value=(*C['world_color'],1); bg.inputs['Strength'].default_value=C['world_strength']

# ---------- 高板点火（步二终渲）：器件搬家/拆建须在灯与世界就绪后 ----------
if HIGH:
    build_high()

# ---------- 相机 ----------
bpy.ops.object.camera_add(location=C['cam_loc'])
cam=bpy.context.active_object; scene.camera=cam
cam.data.lens=C['cam_lens']; cam.data.sensor_width=36
tgt=bpy.data.objects.new('cam_t', None); bpy.context.collection.objects.link(tgt); tgt.location=C['cam_target']
cc=cam.constraints.new('TRACK_TO'); cc.target=tgt; cc.track_axis='TRACK_NEGATIVE_Z'; cc.up_axis='UP_Y'
cam.data.dof.use_dof=True; cam.data.dof.focus_object=tgt; cam.data.dof.aperture_fstop=C['cam_fstop']

# ── 板相机契约（整固批·勘误录#7"相机锁死＝坐标即常量"的执法化）──────────────────
# 板族渲染（layout/plate/strip/sprite/anim/loop）共此一签——机位即坐标之根：coords.json
# 与 plate.css 的全部手拷都锚在这一签上。set_plate_camera()=唯一上机位路径；渲前
# assert_plate_camera()双比对：①对契约常量 ②对运行时 coords 存签（stage/assets/
# plate.coords.json 的 _camera）——不符即 RuntimeError 拒渲：宁可不出图，不出坐标错位
# 的图（⑥"MODE=still 错机位整批作废"血案的闸门化）。CAMCHECK=1 环境口：签核毕即退不渲。
PLATE_CAM = dict(loc=(-0.2, 12.6, 0.3), lens=58.0, tgt=(-0.2, 0.05, -0.5), dof=False)

def set_plate_camera():
    cam.location = PLATE_CAM['loc']; cam.data.lens = PLATE_CAM['lens']
    tgt.location = PLATE_CAM['tgt']; cam.data.dof.use_dof = PLATE_CAM['dof']

def plate_cam_signature():
    return dict(loc=[round(float(v), 6) for v in cam.location], lens=round(float(cam.data.lens), 3),
                tgt=[round(float(v), 6) for v in tgt.location], dof=bool(cam.data.dof.use_dof))

def assert_plate_camera(stage_name):
    import json as _json, sys as _sys
    sig = plate_cam_signature()
    want = dict(loc=[round(float(v), 6) for v in PLATE_CAM['loc']], lens=round(float(PLATE_CAM['lens']), 3),
                tgt=[round(float(v), 6) for v in PLATE_CAM['tgt']], dof=PLATE_CAM['dof'])
    if sig != want:
        raise RuntimeError(f'[camera-contract] {stage_name}: 场景相机≠板契约——拒渲\n  现场 {sig}\n  契约 {want}')
    _cj = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'stage', 'assets', 'plate.coords.json')
    _stored = None
    try:
        with open(_cj) as _f: _stored = _json.load(_f).get('_camera')
    except Exception: pass
    if _stored is not None and _stored != sig:
        raise RuntimeError(f'[camera-contract] {stage_name}: 契约相机≠运行时 coords 存签（板已按另一机位印过坐标）——拒渲\n  存签 {_stored}\n  现场 {sig}')
    if _stored is None:
        print(f'[camera-contract] {stage_name}: 运行时 coords 尚无 _camera 存签（老册）——以契约渲；plate 印坐标时自动补签')
    print(f'[camera-contract] {stage_name}: 签核通过 loc={sig["loc"]} lens={sig["lens"]} dof={sig["dof"]}')
    if os.environ.get('CAMCHECK'):
        print(f'[camera-contract] CAMCHECK：{stage_name} 签核毕·按令不渲即退')
        _sys.exit(0)

# ── 高板相机契约 v2（步二终渲·构图稿过闸 2026-07-14）────────────────────────
# 「这套几何就是契约：blockout 的相机即最终相机，coords 与相机签名随本帧版本化，
#   终渲不得漂移一像素。」契约=机位（段A 同 PLATE_CAM·段B 纵移=镜头下摇）+过闸框
# +shift_y（blockout 数值解锁死）+res 基（@2x=基×整数倍——免 int 舍入像素漂）。
# 渲前重解算 shift 对签：|Δ|>5e-4 即几何漂移，拒渲。
HIGH_CAM = dict(
    a=dict(loc=(-0.2, 12.6, 0.3), lens=58.0, tgt=(-0.2, 0.05, -0.5), dof=False,
           frame=(1.34, -4.09), shift_y=-0.10995, res=(1280, 888)),
    b=dict(loc=(-0.2, 12.6, -7.8), lens=58.0, tgt=(-0.2, 0.05, -8.6), dof=False,
           frame=(-4.09, -11.6), shift_y=0.10804, res=(1280, 1229)),
)

def set_high_camera(seg):
    hc = HIGH_CAM[seg]
    cam.location = hc['loc']; cam.data.lens = hc['lens']
    tgt.location = hc['tgt']; cam.data.dof.use_dof = hc['dof']
    k = max(1, round(RESX / hc['res'][0]))
    scene.render.resolution_x = hc['res'][0] * k
    scene.render.resolution_y = hc['res'][1] * k
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    lo, hi = -2.0, 2.0
    for _ in range(40):
        mid = (lo + hi) / 2
        cam.data.shift_y = mid
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        v = _w2c(scene, cam.evaluated_get(dg), _V((-0.2, 0.0, hc['frame'][0]))).y
        if v > 1.0: lo = mid
        else: hi = mid
    if abs(cam.data.shift_y - hc['shift_y']) > 5e-4:
        raise RuntimeError(f'[high-cam] 段{seg}: shift 解算 {cam.data.shift_y:.5f} ≠ 契约 {hc["shift_y"]}——几何漂移·拒渲')
    cam.data.shift_y = hc['shift_y']
    bpy.context.view_layer.update()
    print(f'[high-cam] 段{seg} 签核过（解算对签 |Δ|≤5e-4）shift_y={hc["shift_y"]} res={scene.render.resolution_x}x{scene.render.resolution_y}')

def high_cam_signature(seg):
    hc = HIGH_CAM[seg]
    return dict(loc=list(hc['loc']), lens=hc['lens'], tgt=list(hc['tgt']), dof=hc['dof'],
                shift_y=hc['shift_y'], frame=list(hc['frame']), res=list(hc['res']))

# ---------- 动效编排（层分离精神：光不动、盘在转；惯性律；魔眼呼吸；拨杆拨下/回） ----------
def _linearize(ob):   # 逐帧关键帧→线性插值，防 Bezier 自动柄在转动上过冲抖动（兼容 5.x 槽式 action）
    ad = ob.animation_data
    if not ad or not ad.action: return
    act = ad.action; fcs = []
    if hasattr(act,'fcurves') and len(act.fcurves): fcs = list(act.fcurves)
    else:
        try:
            for lay in act.layers:
                for st in lay.strips:
                    for cb in st.channelbags: fcs.extend(cb.fcurves)
        except Exception: pass
    for fc in fcs:
        for kp in fc.keyframe_points: kp.interpolation='LINEAR'
        fc.update()

def build_animation():
    fps=24; DUR=7.5; NF=int(fps*DUR)
    scene.frame_start=1; scene.frame_end=NF; scene.render.fps=fps
    scene.render.use_motion_blur=True
    try: scene.render.motion_blur_shutter=0.5
    except Exception: pass
    def ss(x):
        x = 0.0 if x<0 else (1.0 if x>1 else x); return x*x*(3-2*x)   # smoothstep
    # 角速度剖面 rad/s（八令随修①·落针动作重音）：静→针触带猛起转(过冲)→沉降巡航→惯性滑停；全域禁 linear
    def omega(t, wc):
        if t < 1.05: return 0.0
        if t < 1.45: return wc*ss((t-1.05)/0.40)*1.16          # 落针重音：0.4s 内猛起到 116% 巡航
        if t < 2.20: return wc*(1.16-0.16*ss((t-1.45)/0.75))   # 过冲沉降到巡航
        if t < 5.30: return wc                                 # 巡航
        if t < 7.50: return wc*(1.0-ss((t-5.30)/2.0))          # 惯性滑停
        return 0.0
    wcL = 2.0; wcR = wcL*(0.85/0.78)      # 转速反比：大卷径慢、小卷径快（发现7）
    aL=0.35; aR=1.25; dt=1.0/fps           # 异相位起点（发现7）
    # VU 事件流（十令硬伤：VU=瞬时事件能量·快变量，MomentEvent 弹道，与纸慢张力对位·不抢同变量）
    import random as _r; _r.seed(17); _events=[]; _te=1.15
    while _te < 7.2:
        _events.append((_te, 0.45+0.55*_r.random())); _te += 0.12+_r.random()*0.52
    def vu_level(tt):
        s=0.0
        for te,E in _events:
            tau=tt-te
            if 0.0<=tau<2.0: s += E*(tau/0.26)*math.exp(1-tau/0.26)   # 300ms 上冲后回落
        return s
    for f in range(1, NF+1):
        t=(f-1)*dt
        aL += omega(t,wcL)*dt; aR += omega(t,wcR)*dt        # 同向、异速、异相位（机位与光锁死，只有盘在转）
        reelL.rotation_euler[1]=aL; reelL.keyframe_insert('rotation_euler', index=1, frame=f)
        reelR.rotation_euler[1]=aR; reelR.keyframe_insert('rotation_euler', index=1, frame=f)
        if   t<0.80: lv=0.0                                  # 拨杆：上位→拨下(play,紧接落针)→拨回(stop)
        elif t<1.05: lv=-ss((t-0.80)/0.25)*radians(21)
        elif t<5.30: lv=-radians(21)
        elif t<5.60: lv=-radians(21)*(1-ss((t-5.30)/0.3))
        else:        lv=0.0
        lever_piv.rotation_euler[0]=lv; lever_piv.keyframe_insert('rotation_euler', index=0, frame=f)
        # 模拟活动流（魔眼呼吸 + 瞳开合 + 走纸共用）
        if t<1.05: act=0.0
        else:
            a=t-1.05
            act=0.5+0.30*math.sin(a*3.0)+0.16*math.sin(a*7.3+1.0)+0.08*math.sin(a*12.9)
            act=0.05 if act<0.05 else (1.0 if act>1.0 else act)
        es = 0.6 if t<1.05 else 6.0+12.0*act
        eye_bsdf.inputs['Emission Strength'].default_value=es
        eye_bsdf.inputs['Emission Strength'].keyframe_insert('default_value', frame=f)
        eye_spill.data.energy=1.0+(0.0 if t<1.05 else (es-6.0)*0.9)
        eye_spill.data.keyframe_insert('energy', frame=f)
        # 瞳开合（缩放·非纯提亮，八令随修②）：活动高→瞳小(开)，低→瞳大(合)
        psc = 1.0 if t<1.05 else (1.7-1.1*act)
        meye_pupil.scale=(psc,psc,1.0)
        meye_pupil.keyframe_insert('scale', index=0, frame=f); meye_pupil.keyframe_insert('scale', index=1, frame=f)
        # REC 逻辑正向（八令硬伤②）：睡时灭 → 落针起亮 + 录音呼吸
        rs = 0.0 if t<1.05 else 5.0*(0.72+0.28*math.sin((t-1.05)*2.4))
        rec_emit.inputs['Strength'].default_value=rs
        rec_emit.inputs['Strength'].keyframe_insert('default_value', frame=f)
        # 走纸墨线随张力爬行（八/九令清单）：起转后横向滚纸
        if paper_map is not None:
            paper_map.inputs['Location'].default_value[0] = 0.0 if t<1.05 else (t-1.05)*0.05
            paper_map.inputs['Location'].keyframe_insert('default_value', index=0, frame=f)
        if pen_piv is not None:                              # 笔尖骑线（十一问①）：随走纸同步摆臂
            _sc = 0.0 if t<1.05 else (t-1.05)*0.05
            pen_piv.rotation_euler[1]=pen_beta(pen_line_z(_sc)); pen_piv.keyframe_insert('rotation_euler', index=1, frame=f)
        # VU 活（十令硬伤）：指针弹道随事件能量弹起+回落（rest 低→高·略过冲），与纸慢线快慢对位
        lvl = 0.0 if t<1.1 else min(1.15, vu_level(t))
        vu_piv.rotation_euler[1] = radians(30) - radians(56)*lvl
        vu_piv.keyframe_insert('rotation_euler', index=1, frame=f)
        # 入光仪式：仅键光能量渐亮（机位与光位置锁死，光法单灯）
        if   t<0.85: ke=C['key_energy']*0.05
        elif t<1.35: ke=C['key_energy']*(0.05+0.95*ss((t-0.85)/0.5))
        else:        ke=C['key_energy']
        key_light.data.energy=ke; key_light.data.keyframe_insert('energy', frame=f)
    for ob in [x for x in (reelL, reelR, lever_piv, meye_pupil, vu_piv, pen_piv) if x is not None]: _linearize(ob)
    animate_dust(NF*dt, NF, dt)   # 浮尘也在仪式里漂（整数周期·合页收边一致）
    print(f'[hero] anim rigged: {NF} frames @ {fps}fps')

# 合页收边（暗角 + 胶片颗粒）在 AgX 色调映射之后的显示空间做，故置于渲染之外的
# 调色步（ffmpeg 组片时烘入 mp4）——属预烘焙渲染管线的"合成/调色"环节，非手绘。
# 需入 3D 的浮尘（有视差·被键光点亮）留在场景内（下）。

def animate_dust(T, NF, dt):   # 浮尘周期漂移（整数周期正弦→无缝环）
    for dd in DUST:
        o=dd['o']
        for f in range(1, NF+1):
            t=(f-1)*dt
            o.location=(dd['x']+dd['ax']*math.sin(2*math.pi*dd['nx']*t/T+dd['px']),
                        dd['y']+dd['ay']*math.sin(2*math.pi*dd['ny']*t/T+dd['py']),
                        dd['z']+dd['az']*math.sin(2*math.pi*dd['nz']*t/T+dd['pz']))
            o.keyframe_insert('location', frame=f)

# ---------- 稳态无缝环（第十号合页·无缝环导出）：机器只是在运行，每器件整周期回到起点 ----------
def build_loop():
    fps=24; NF=NFOVR or 96; T=NF/fps   # 4.0s·稳态·L3转/R4转→首尾同相（NFOVR 仅试片降帧）
    scene.frame_start=1; scene.frame_end=NF; scene.render.fps=fps
    scene.render.use_motion_blur=True
    try: scene.render.motion_blur_shutter=0.5
    except Exception: pass
    dt=1.0/fps
    wL=2*math.pi*3.0/T; wR=2*math.pi*4.0/T     # 整数转→无缝；R 快（收带盘小·物理正向·异相位保留）
    aL0=0.35; aR0=1.25
    lever_piv.rotation_euler[0]=-radians(21)   # 稳态：拨杆常压下(play)、键光常满
    lever_piv.keyframe_insert('rotation_euler', index=0, frame=1); lever_piv.keyframe_insert('rotation_euler', index=0, frame=NF)
    key_light.data.energy=C['key_energy']
    key_light.data.keyframe_insert('energy', frame=1); key_light.data.keyframe_insert('energy', frame=NF)
    import random as _r; _r.seed(23); _events=[]; _te=0.15
    while _te<T:
        _events.append((_te, 0.5+0.5*_r.random())); _te += 0.26+_r.random()*0.34
    def vu_loop(tt):                            # wrap 求和(k=-1,0,1)→VU 弹道首尾严格周期
        s=0.0
        for te,E in _events:
            for k in (-1,0,1):
                tau=tt-(te+k*T)
                if 0.0<=tau<1.9: s += E*(tau/0.26)*math.exp(1-tau/0.26)
        return s
    for f in range(1, NF+1):
        t=(f-1)*dt
        reelL.rotation_euler[1]=aL0+wL*t; reelL.keyframe_insert('rotation_euler', index=1, frame=f)
        reelR.rotation_euler[1]=aR0+wR*t; reelR.keyframe_insert('rotation_euler', index=1, frame=f)
        act=0.5+0.28*math.sin(2*math.pi*3*t/T)+0.14*math.sin(2*math.pi*5*t/T+1.0)+0.06*math.sin(2*math.pi*8*t/T)
        act=0.05 if act<0.05 else (1.0 if act>1.0 else act)
        es=6.0+12.0*act
        eye_bsdf.inputs['Emission Strength'].default_value=es; eye_bsdf.inputs['Emission Strength'].keyframe_insert('default_value', frame=f)
        eye_spill.data.energy=1.0+(es-6.0)*0.9; eye_spill.data.keyframe_insert('energy', frame=f)
        psc=1.7-1.1*act; meye_pupil.scale=(psc,psc,1.0)
        meye_pupil.keyframe_insert('scale', index=0, frame=f); meye_pupil.keyframe_insert('scale', index=1, frame=f)
        rs=5.0*(0.72+0.28*math.sin(2*math.pi*4*t/T))
        rec_emit.inputs['Strength'].default_value=rs; rec_emit.inputs['Strength'].keyframe_insert('default_value', frame=f)
        if paper_map is not None:
            paper_map.inputs['Location'].default_value[0]=(t/T)*1.0   # 整环滚 1 整幅·贴图横向可平铺→无缝
            paper_map.inputs['Location'].keyframe_insert('default_value', index=0, frame=f)
        lvl=min(1.15, vu_loop(t))
        vu_piv.rotation_euler[1]=radians(30)-radians(56)*lvl; vu_piv.keyframe_insert('rotation_euler', index=1, frame=f)
        if pen_piv is not None:                              # 笔尖骑线（十一问①）：随走纸滚动摆臂·笔尖恒落线端
            pen_piv.rotation_euler[1]=pen_beta(pen_line_z((t/T)*1.0)); pen_piv.keyframe_insert('rotation_euler', index=1, frame=f)
    for ob in [x for x in (reelL, reelR, meye_pupil, vu_piv, pen_piv) if x is not None]: _linearize(ob)
    animate_dust(T, NF, dt)
    print(f'[hero] loop rigged: {NF} frames @ {fps}fps, T={T:.3f}s (L3/R4 rev · seamless)')

# ---------- 出图 ----------
if MODE == 'anim':
    set_plate_camera(); assert_plate_camera('anim')   # 全机取景（含记录仪·机位锁死＝契约）
    build_animation()
    scene.render.image_settings.color_depth='8'
    scene.render.filepath = OUT   # 帧目录前缀（如 .../frames/f_）→ 写 f_0001.png …
    print(f'[hero] anim {scene.frame_start}-{scene.frame_end} -> {OUT}####  ({RESX}x{int(RESX*10/16)}, {SAMPLES} spp)')
    bpy.ops.render.render(animation=True)
elif MODE == 'loop':
    set_plate_camera(); assert_plate_camera('loop')   # 全机取景·机位锁死（同动效＝契约）
    build_loop()
    scene.render.image_settings.color_depth='8'
    scene.render.filepath = OUT
    print(f'[hero] loop {scene.frame_start}-{scene.frame_end} -> {OUT}####  ({RESX}x{int(RESX*10/16)}, {SAMPLES} spp)')
    bpy.ops.render.render(animation=True)
elif MODE == 'recorder':
    for _nm in ('meye_back','meye_glow','meye_pupil','meye_bezel'):     # 记录仪专场：隐魔眼免与纸叠压
        _o=bpy.data.objects.get(_nm)
        if _o: _o.hide_render=True
    eye_spill.hide_render=True
    reelL.rotation_euler[1]=radians(14); reelR.rotation_euler[1]=radians(52)
    cam.location=(0.12, 7.6, -0.9); cam.data.lens=80; tgt.location=(0.0, 0.06, -2.1)   # 取景落到记录仪（归位 z=-2.1）
    cam.data.dof.aperture_fstop=7.0
    scene.render.filepath = OUT
    print(f'[hero] recorder still -> {OUT}')
    bpy.ops.render.render(write_still=True)
elif MODE == 'layout':
    reelL.rotation_euler[1]=radians(14); reelR.rotation_euler[1]=radians(52)
    set_plate_camera(); assert_plate_camera('layout')   # 全机布局验证（机器仍溢出画外·契约机位）
    # peek 渲染闸（复盘 R1·⑥勘误后归正宗）：板相机在 layout——peek/补窗一律走本分支。
    # ⚠️勘误入册：MODE=still 是旧英雄机位（C 默认·DOF 开），与板不同框——⑥首轮补丁错机位即此坑。
    _pk = os.environ.get('PEEK')
    if _pk:
        _a = [float(v) for v in _pk.split(',')]
        scene.render.use_border = True; scene.render.use_crop_to_border = True
        scene.render.border_min_x = _a[0]; scene.render.border_max_x = _a[1]
        scene.render.border_min_y = 1 - _a[3]; scene.render.border_max_y = 1 - _a[2]
        print(f'[hero] PEEK border x[{_a[0]},{_a[1]}] ytop[{_a[2]},{_a[3]}]')
    scene.render.filepath = OUT
    print(f'[hero] layout -> {OUT}')
    bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_vu':
    # decree12①：VU 表脸从渲染出（背光象牙脸＋94°弧刻度＋红峰区＋清丝印）；指针留 live SVG（吃事件能量）。
    _vf = bpy.data.objects.get('vuface')
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not _vf and not o.name.startswith('sb_'): o.hide_render = True
    vx, vz = -2.4, -1.12
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.36
    cam.location = (vx, 12.0, vz); tgt.location = (vx, 0.0, vz); cam.data.dof.use_dof = False
    bpy.ops.object.light_add(type='AREA', location=(vx, 8.0, vz))
    _fl = bpy.context.active_object; _fl.data.energy = 300; _fl.data.size = 4.0; _fl.data.color = (1.0, 0.96, 0.90)
    scene.render.film_transparent = False
    scene.render.resolution_x = RESX; scene.render.resolution_y = int(RESX * 645 / 1400)
    scene.render.filepath = OUT
    print(f'[hero] sprite_vu -> {OUT} ({RESX}x{int(RESX*645/1400)})')
    bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_eye':
    # decree12 P0：魔眼磷光管（新增·青绿）——凹管本体从渲染出，网页 CSS 只做活动辉光透明度/开合。
    keep = {o for o in bpy.data.objects if o.name in ('meye_back', 'meye_glow', 'meye_bezel')}  # 瞳=活动件→CSS 叠，本体渲染不含瞳
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in keep and not o.name.startswith('sb_'): o.hide_render = True
    ex, ez = 0.0, -1.15
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 0.94
    cam.location = (ex, 12.0, ez); tgt.location = (ex, 0.0, ez); cam.data.dof.use_dof = False
    bpy.ops.object.light_add(type='AREA', location=(ex - 1.1, 7.0, ez + 1.1))   # 软方向光给金属圈框立体
    _fl = bpy.context.active_object; _fl.data.energy = 240; _fl.data.size = 3.0; _fl.data.color = (1.0, 0.95, 0.88)
    scene.render.film_transparent = True; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.resolution_x = RESX; scene.render.resolution_y = RESX
    scene.render.filepath = OUT
    print(f'[hero] sprite_eye -> {OUT} ({RESX}^2, transparent)')
    bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_fascia':
    # decree12 P0：面板材质从渲染出（暗青铜拉丝金属），方向光留给网页 CSS #keylight（不在前端手画材质）。
    _fa = bpy.data.objects.get('fascia')
    for o in bpy.data.objects:
        if o.type == 'MESH' and o is not _fa and not o.name.startswith('sb_'): o.hide_render = True
    fcx, fcz = 0.0, 0.5
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 3.4
    cam.location = (fcx, 12.0, fcz); tgt.location = (fcx, -0.30, fcz); cam.data.dof.use_dof = False
    # 用整机戏剧光（暖键＋软箱）烙进方向性暖鎏与拉丝各向异——平金属唯有方向光才不平；网页 #keylight 相应压低
    scene.render.film_transparent = False
    scene.render.resolution_x = RESX; scene.render.resolution_y = int(RESX * 0.375)
    scene.render.filepath = OUT
    print(f'[hero] sprite_fascia -> {OUT} ({RESX}x{int(RESX*0.375)})')
    bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_reel':
    # decree12 P0：以过闸渲染资产替 CSS 重画。正交正面·透明底·单盘 → 网页 CSS 可自由旋转的盘 sprite。
    keep = {reelL}
    for o in bpy.data.objects:
        if o.parent == reelL: keep.add(o)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in keep and not o.name.startswith('sb_'):
            o.hide_render = True
    reelL.rotation_euler[1] = 0.0
    rcx, rcz = -C['reel_cx'], C['reel_cz']
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.34
    cam.location = (rcx, 12.0, rcz); tgt.location = (rcx, 0.0, rcz); cam.data.dof.use_dof = False
    # 盘 sprite 要能自由 CSS 旋转→撤不匀软箱，换大幅正面匀光穹：金属反射均匀暖光，无"跟着转的高光"、无地平线
    for _nm in ('sb_L', 'sb_T'):
        _o = bpy.data.objects.get(_nm)
        if _o: _o.hide_render = True
    bpy.ops.mesh.primitive_plane_add(size=34, location=(rcx, 20.0, rcz), rotation=(radians(90), 0, 0))
    _dome = bpy.context.active_object; _dome.data.materials.append(emat('reel_dome', (1.0, 0.86, 0.66), 1.45))
    try: _dome.visible_camera = False
    except Exception: pass
    bpy.ops.object.light_add(type='AREA', location=(rcx - 2.4, 8.0, rcz + 2.6))   # 软方向光给倒角/轮毂立体
    _fl = bpy.context.active_object; _fl.data.energy = 560; _fl.data.size = 7.0; _fl.data.color = (1.0, 0.92, 0.80)
    key_light.data.energy *= 0.35
    scene.render.film_transparent = True; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.resolution_x = RESX; scene.render.resolution_y = RESX
    scene.render.filepath = OUT
    print(f'[hero] sprite_reel -> {OUT} ({RESX}^2, {SAMPLES} spp, transparent)')
    bpy.ops.render.render(write_still=True)
elif MODE == 'plate':
    # decree13 乙-1：整机一次布光、全画幅渲染成"场景板"——这张图就是页面。含统一灯／四角入暗／魔眼焦点。
    # 同时把每一个"会动的东西"投影到板上归一化坐标（[u,v] 左上原点 0..1），导出 JSON——
    # 真页动态层靠这份坐标精确对位，不靠肉眼（decree13 乙-2：逐层精确对位于板上坐标）。
    reelL.rotation_euler[1]=radians(14); reelR.rotation_euler[1]=radians(52)   # 基态姿态（将被带盘胶片条覆盖）
    _pp=bpy.data.objects.get('meye_pupil')
    if _pp: _pp.hide_render=True                        # decree13 乙-2：瞳=CSS 活动件·基板露磷光扇（魔眼为焦点·不被暗瞳盖黑）
    for _nm in ('vuneedle','rec_arm','rec_tip','rec_touch','pen_link','pen_shank','pen_cone','pen_collar','pen_nut',
                'pen_rail','pen_screw','pen_house','pen_mount_t','pen_mount_b'):
        _o=bpy.data.objects.get(_nm)
        if _o: _o.hide_render=True                      # 活动件与滑针机构全套不入板（动态层/静件层各渲各的；检流计座 rec_pivot 留板）
    _rp=bpy.data.objects.get('rec_paper')
    if _rp:                                             # decree13 乙-2：纸面烘入板·无墨；墨=真页 live canvas 层（免双线）
        _rp.data.materials.clear()
        _rp.data.materials.append(img_emissive('paper_plain','/Users/shadow/tape0/stage/assets/paper.png',1.0,rough=0.62))
    set_plate_camera(); assert_plate_camera('plate')   # 全机取景（同合页/loop·机位锁死＝契约）
    scene.render.resolution_x=RESX; scene.render.resolution_y=int(RESX*10/16)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); cam_e = cam.evaluated_get(dg)
    import json
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    def _P(x,y,z):
        co=_w2c(scene, cam_e, _V((x,y,z))); return [round(co.x,5), round(1.0-co.y,5)]   # 左上原点归一化
    def _bb(pts):
        ps=[_P(*p) for p in pts]; xs=[p[0] for p in ps]; ys=[p[1] for p in ps]
        return [round(min(xs),5), round(min(ys),5), round(max(xs)-min(xs),5), round(max(ys)-min(ys),5)]
    def _disc(cx,cy,cz,r):
        return _bb([(cx-r,cy,cz),(cx+r,cy,cz),(cx,cy,cz-r),(cx,cy,cz+r)])
    coords=dict(
        _camera=plate_cam_signature(),   # 相机契约存签：本册坐标由此机位所印（assert_plate_camera 对签）
        res=[scene.render.resolution_x, scene.render.resolution_y],
        reelL=_disc(-C['reel_cx'],0.12,C['reel_cz'],1.05),
        reelR=_disc( C['reel_cx'],0.12,C['reel_cz'],1.05),
        vu=_bb([(-2.4,0.035,-1.42),(-2.4,0.035,-0.82),(-3.05,0.035,-1.12),(-1.75,0.035,-1.12)]),
        vu_pivot=_P(-2.4,0.05,-1.40),
        recorder=_bb([(-1.8,0.065,-2.46),(1.8,0.065,-2.46),(-1.8,0.065,-1.74),(1.8,0.065,-1.74)]),
        eye=_disc(0.0,0.05,-1.15,0.33),
        counter=_bb([(-1.26,0.07,-1.26),(-0.74,0.07,-1.26),(-1.26,0.07,-0.98),(-0.74,0.07,-0.98)]),
        lamp_ask=_bb([(0.505,0.082,-0.9275),(0.815,0.082,-0.9275),(0.505,0.082,-0.8325),(0.815,0.082,-0.8325)]),
        lamp_done=_bb([(0.505,0.082,-1.1875),(0.815,0.082,-1.1875),(0.505,0.082,-1.0925),(0.815,0.082,-1.0925)]),
        lamp_main=_bb([(0.505,0.082,-1.4475),(0.815,0.082,-1.4475),(0.505,0.082,-1.3525),(0.815,0.082,-1.3525)]),
        rec_jewel=_P(0.0,0.11,1.92),
        nameplate=_bb([(-0.20,0.035,-2.8275),(0.85,0.035,-2.8275),(-0.20,0.035,-2.6925),(0.85,0.035,-2.6925)]),
        key_prev=_bb([(-0.45,0.10,-2.826),(-0.79,0.10,-2.826),(-0.45,0.10,-2.694),(-0.79,0.10,-2.694)]),
        key_next=_bb([(-0.91,0.10,-2.826),(-1.25,0.10,-2.826),(-0.91,0.10,-2.694),(-1.25,0.10,-2.694)]),
        dub_key=_bb([(0.93,0.075,-1.28),(1.35,0.075,-1.28),(0.93,0.075,-0.96),(1.35,0.075,-0.96)]),
        dub_tags=_bb([(1.44,0.06,-1.34),(1.56,0.06,-1.34),(1.44,0.06,-0.90),(1.56,0.06,-0.90)]),
        deck_zone=_bb([(-2.9,0.12,-0.55),(2.9,0.12,-0.55),(-2.9,0.12,1.75),(2.9,0.12,1.75)]),
        play_dome=_disc(2.72,0.10,-1.25,0.16),
        guideL=_disc(-GUIDE_X,0.205,GUIDE_Z,0.145), guideR=_disc(GUIDE_X,0.205,GUIDE_Z,0.145),   # 第三批③：辊活层
        band_run=_bb([(-GUIDE_X,0.125,GUIDE_Z+GUIDE_R-0.0275),(GUIDE_X,0.125,GUIDE_Z+GUIDE_R-0.0275),
                      (-GUIDE_X,0.125,GUIDE_Z+GUIDE_R+0.0275),(GUIDE_X,0.125,GUIDE_Z+GUIDE_R+0.0275)]),
    )
    _cj=OUT.rsplit('.',1)[0]+'.coords.json'
    with open(_cj,'w') as f: json.dump(coords, f, indent=1)
    print('[hero] plate coords ->', _cj, coords)
    scene.render.filepath=OUT
    print(f'[hero] plate -> {OUT}  ({scene.render.resolution_x}x{scene.render.resolution_y}, {SAMPLES} spp)')
    bpy.ops.render.render(write_still=True)
elif MODE in ('highplate', 'highplate_b'):
    # ── 步二终渲（构图稿过闸）：高板两段。段A=默认取景框（hero/README/OG 门面·一图三用令）；
    # 段B=带库+鞋盒。板姿态与活动件隐藏沿 plate 惯例（帧1=板姿态·动态层各渲各的）。
    reelL.rotation_euler[1]=radians(14); reelR.rotation_euler[1]=radians(52)
    _pp=bpy.data.objects.get('meye_pupil')
    if _pp: _pp.hide_render=True
    for _nm in ('vuneedle','rec_arm','rec_tip','rec_touch','pen_link','pen_shank','pen_cone','pen_collar','pen_nut',
                'pen_rail','pen_screw','pen_house','pen_mount_t','pen_mount_b'):
        _o=bpy.data.objects.get(_nm)
        if _o: _o.hide_render=True
    _rp=bpy.data.objects.get('rec_paper')
    if _rp:
        _rp.data.materials.clear()
        _rp.data.materials.append(img_emissive('paper_plain','/Users/shadow/tape0/stage/assets/paper.png',1.0,rough=0.62))
    seg = 'a' if MODE == 'highplate' else 'b'
    import json
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    def _P(x,y,z):
        dg = bpy.context.evaluated_depsgraph_get()
        co=_w2c(scene, cam.evaluated_get(dg), _V((x,y,z))); return [round(co.x,5), round(1.0-co.y,5)]
    def _bb(pts):
        ps=[_P(*p) for p in pts]; xs=[p[0] for p in ps]; ys=[p[1] for p in ps]
        return [round(min(xs),5), round(min(ys),5), round(max(xs)-min(xs),5), round(max(ys)-min(ys),5)]
    def _disc(cx,cy,cz,r):
        return _bb([(cx-r,cy,cz),(cx+r,cy,cz),(cx,cy,cz-r),(cx,cy,cz+r)])
    if seg == 'a':
        # coords v2：先以段B相机投影库区 zones，再回段A投影全器件（版本化=双段签名同册）
        set_high_camera('b')
        libz = dict(
            lib_shelf0=_bb([(-4.3,0.1,-4.65),(4.3,0.1,-4.65),(-4.3,0.1,-3.55),(4.3,0.1,-3.55)]),
            lib_shelf1=_bb([(-4.3,0.1,-6.35),(4.3,0.1,-6.35),(-4.3,0.1,-5.25),(4.3,0.1,-5.25)]),
            lib_shelf2=_bb([(-4.3,0.1,-8.05),(4.3,0.1,-8.05),(-4.3,0.1,-6.95),(4.3,0.1,-6.95)]),
            shoebox_zone=_bb([(-3.4,0.3,-10.7),(4.0,0.3,-10.7),(-3.4,0.3,-9.9),(4.0,0.3,-9.9)]),
        )
        set_high_camera('a')
        coords=dict(
            _camera_a=high_cam_signature('a'), _camera_b=high_cam_signature('b'),
            _law='步二终渲契约（构图稿过闸 2026-07-14）：blockout 相机即最终相机·不得漂移一像素',
            res=[scene.render.resolution_x, scene.render.resolution_y],
            reelL=_disc(-C['reel_cx'],0.12,C['reel_cz'],1.05),
            reelR=_disc( C['reel_cx'],0.12,C['reel_cz'],1.05),
            vu=_bb([(-1.85,0.035,-1.42),(-1.85,0.035,-0.82),(-2.5,0.035,-1.12),(-1.2,0.035,-1.12)]),
            vu_pivot=_P(-1.85,0.05,-1.40),
            recorder=_bb([(-1.8,0.065,-2.46),(1.8,0.065,-2.46),(-1.8,0.065,-1.74),(1.8,0.065,-1.74)]),
            eye=_disc(0.0,0.05,-1.15,0.33),
            counter=_bb([(-2.88,0.07,-0.51),(-2.36,0.07,-0.51),(-2.88,0.07,-0.25),(-2.36,0.07,-0.25)]),
            lamp_ask=_bb([(0.525,0.082,-0.9275),(0.835,0.082,-0.9275),(0.525,0.082,-0.8325),(0.835,0.082,-0.8325)]),
            lamp_done=_bb([(0.525,0.082,-1.1875),(0.835,0.082,-1.1875),(0.525,0.082,-1.0925),(0.835,0.082,-1.0925)]),
            lamp_main=_bb([(0.525,0.082,-1.4475),(0.835,0.082,-1.4475),(0.525,0.082,-1.3525),(0.835,0.082,-1.3525)]),
            selector=_disc(1.42,0.09,-1.14,0.40),
            selector_knob=_disc(1.42,0.09,-1.14,0.30),
            rec_jewel=_P(0.0,0.11,0.98),
            nameplate=_bb([(-0.20,0.035,-2.8275),(0.85,0.035,-2.8275),(-0.20,0.035,-2.6925),(0.85,0.035,-2.6925)]),
            key_prev=_bb([(-0.45,0.10,-2.826),(-0.79,0.10,-2.826),(-0.45,0.10,-2.694),(-0.79,0.10,-2.694)]),
            key_next=_bb([(-0.91,0.10,-2.826),(-1.25,0.10,-2.826),(-0.91,0.10,-2.694),(-1.25,0.10,-2.694)]),
            dub_key=_bb([(1.84,0.075,-2.86),(2.26,0.075,-2.86),(1.84,0.075,-2.54),(2.26,0.075,-2.54)]),
            dub_tags=_bb([(2.3675,0.06,-2.85),(2.9165,0.06,-2.85),(2.3675,0.06,-2.55),(2.9165,0.06,-2.55)]),
            deck_zone=_bb([(-2.9,0.12,-0.55),(2.9,0.12,-0.55),(-2.9,0.12,1.34),(2.9,0.12,1.34)]),
            lip=_bb([(-4.5,0.35,-3.55),(4.5,0.35,-3.55),(-4.5,0.35,-3.05),(4.5,0.35,-3.05)]),
            flap=_bb([(FLAP['cx']-FLAP['w']/2,0.12,FLAP['cz']-FLAP['h']/2),(FLAP['cx']+FLAP['w']/2,0.12,FLAP['cz']-FLAP['h']/2),
                      (FLAP['cx']-FLAP['w']/2,0.12,FLAP['cz']+FLAP['h']/2),(FLAP['cx']+FLAP['w']/2,0.12,FLAP['cz']+FLAP['h']/2)]),
            guideL=_disc(-GUIDE_X,0.205,GUIDE_Z,0.145), guideR=_disc(GUIDE_X,0.205,GUIDE_Z,0.145),
            band_run=_bb([(-GUIDE_X,0.125,GUIDE_Z+GUIDE_R-0.0275),(GUIDE_X,0.125,GUIDE_Z+GUIDE_R-0.0275),
                          (-GUIDE_X,0.125,GUIDE_Z+GUIDE_R+0.0275),(GUIDE_X,0.125,GUIDE_Z+GUIDE_R+0.0275)]),
            _lib_zones_in_b=libz,
        )
        _cj=OUT.rsplit('.',1)[0]+'.coords.json'
        with open(_cj,'w') as f: json.dump(coords, f, indent=1)
        print('[hero] highplate coords v2 ->', _cj)
    else:
        set_high_camera('b')
    scene.render.filepath=OUT
    print(f'[hero] {MODE} -> {OUT}  ({scene.render.resolution_x}x{scene.render.resolution_y}, {SAMPLES} spp)')
    bpy.ops.render.render(write_still=True)
elif MODE == 'strip_selector':
    # 选择器旋钮条（设计三§七动件新增）：OFF(+38°)→ON(−38°) 全程拧动 N 帧——同场景同灯、
    # 只旋钮族对相机可见（其余 visible_camera=False 保 GI=条上光照与板全等·strip 惯例），
    # border 裁旋钮区、与板同相机同框=页面 crop 天然对位。页面档位吸附由 js 定帧。
    _spin = {'sel_knob', 'sel_cap', 'sel_ptr'} | {f'sel_knurl{_a}' for _a in range(24)}   # 只转动件入镜
    for o in bpy.data.objects:
        if o.type in ('MESH', 'FONT') and o.name not in _spin and not o.name.startswith('sb_'):
            try: o.visible_camera = False
            except Exception: pass
    scene.render.film_transparent = True; scene.render.image_settings.color_mode = 'RGBA'   # 透明底叠板（盘条惯例）
    set_high_camera('a')
    import json as _json
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    def _uv(x,y,z):
        dg = bpy.context.evaluated_depsgraph_get()
        co=_w2c(scene, cam.evaluated_get(dg), _V((x,y,z))); return co.x, co.y
    _sx, _sz, _r = 1.42, -1.14, 0.46                    # 裁片=转动件本体（刻度蚀字归板·免重影）
    _us=[]; _vs=[]
    for _dx,_dz in ((-_r,-_r),(-_r,_r),(_r,-_r),(_r,_r)):
        _u,_v=_uv(_sx+_dx,0.2,_sz+_dz); _us.append(_u); _vs.append(_v)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=max(0,min(_us)); scene.render.border_max_x=min(1,max(_us))
    scene.render.border_min_y=max(0,min(_vs)); scene.render.border_max_y=min(1,max(_vs))
    _sp = bpy.data.objects['sel_piv']
    NF = NFOVR or 25
    _meta=dict(frames=NF, deg=dict(OFF=-38, TEST=0, ON=38),
               border=[scene.render.border_min_x, scene.render.border_min_y, scene.render.border_max_x, scene.render.border_max_y])
    with open(OUT.rstrip('/')+'_meta.json','w') as f: _json.dump(_meta,f,indent=1)
    for _f in range(NF):
        _sp.rotation_euler[1] = radians(-38 + 76 * _f / (NF - 1))
        scene.render.filepath = f'{OUT}f_{_f:02d}.png'
        bpy.ops.render.render(write_still=True)
    print(f'[hero] strip_selector {NF} 帧 -> {OUT}f_##.png（OFF +38°→ON −38°·border 已存 meta）')
elif MODE == 'strip_counter':
    # 计数轮鼓条（设计三§七动件新增）：读窗后单只数字鼓整周 N 帧（页面 ?counter=1 召回轮换帧粮·
    # 四轮各自相位）。鼓=轴沿 X 的滚筒+10 枚数字绕鼓面（同径同字律）；窗玻璃休眠即黑=条属召回态亮鼓。
    _cx, _cz = -2.62, -0.38
    _cw = bpy.data.objects.get('cnt_win')
    if _cw: _cw.hide_render = True                       # 揭窗渲鼓（页面窗框仍在板上）
    bpy.ops.object.empty_add(location=(_cx, 0.02, _cz))
    _dr = bpy.context.active_object; _dr.name='drum_piv'; _dr.rotation_mode='XYZ'
    _dc = cyl('drum_body', 0.115, 0.42, (_cx, 0.02, _cz), rot=(0, radians(90), 0), verts=64, mat=M_dark, bev=0)
    _dc.parent=_dr; _dc.matrix_parent_inverse=_dr.matrix_world.inverted()
    for _d in range(10):
        _a = radians(_d * 36)
        bpy.ops.object.empty_add(location=(_cx, 0.02, _cz))
        _de = bpy.context.active_object; _de.name=f'dig_piv{_d}'; _de.rotation_mode='XYZ'
        bpy.ops.object.text_add(location=(_cx, 0.02 + 0.118, _cz))
        _tx = bpy.context.active_object; _tx.name=f'dig{_d}'
        _tx.data.body=str(_d); _tx.data.size=0.062; _tx.data.align_x='CENTER'; _tx.data.align_y='CENTER'; _tx.data.extrude=0.001
        # 字心锚于鼓面（周长 0.72/10 字=弧位 0.072·字高 86% 入位——真机鼓字不重叠）
        _tx.rotation_euler=(radians(90), 0, 0)           # 顶 +Z 直立·背面朝相机（sel 字同款自洽组合）
        _tx.scale[0]=-1.0                                # 背面观看=镜像→scale 翻正（相机 X 镜像下正读）
        _tx.data.materials.append(M_ivory)
        _tx.parent=_de; _tx.matrix_parent_inverse=_de.matrix_world.inverted()
        _de.rotation_euler[0]=_a
        _de.parent=_dr; _de.matrix_parent_inverse=_dr.matrix_world.inverted()
    for o in bpy.data.objects:
        if o.type in ('MESH','FONT') and not (o.name.startswith('drum') or o.name.startswith('dig') or o.name.startswith('sb_')):
            try: o.visible_camera = False
            except Exception: pass
    scene.render.film_transparent = True; scene.render.image_settings.color_mode = 'RGBA'   # 透明底叠板
    set_high_camera('a')
    import json as _json
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    def _uv(x,y,z):
        dg = bpy.context.evaluated_depsgraph_get()
        co=_w2c(scene, cam.evaluated_get(dg), _V((x,y,z))); return co.x, co.y
    _us=[]; _vs=[]
    for _dx,_dz in ((-0.26,-0.14),(-0.26,0.14),(0.26,-0.14),(0.26,0.14)):
        _u,_v=_uv(_cx+_dx,0.14,_cz+_dz); _us.append(_u); _vs.append(_v)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=max(0,min(_us)); scene.render.border_max_x=min(1,max(_us))
    scene.render.border_min_y=max(0,min(_vs)); scene.render.border_max_y=min(1,max(_vs))
    NF = NFOVR or 40
    _meta=dict(frames=NF, digits=10, note='整周=10 数字·帧 f 转角=f/NF*360°·四轮各自相位',
               border=[scene.render.border_min_x, scene.render.border_min_y, scene.render.border_max_x, scene.render.border_max_y])
    with open(OUT.rstrip('/')+'_meta.json','w') as f: _json.dump(_meta,f,indent=1)
    for _f in range(NF):
        _dr.rotation_euler[0] = radians(360 * _f / NF)
        scene.render.filepath = f'{OUT}f_{_f:02d}.png'
        bpy.ops.render.render(write_still=True)
    print(f'[hero] strip_counter {NF} 帧 -> {OUT}f_##.png（整周 10 数字·border 已存 meta）')
elif MODE == 'strip':
    # decree13 乙-2/丁-②：带盘定光胶片条——同场景同灯整周自转 N 帧（badge 破对称→周期须 360° 非 120°）。
    # 只有该盘对相机可见；其余一切仍参与 GI/反射（visible_camera=False 非 hide）→ 盘上光照与场景板全等。
    # 双重影子防（十三号放行③）：面板不可见→盘影不入条；板上烘定静影＝圆盘剪影旋转不变，物理正确。
    # 脆帧无运动模糊：条要服务全速域（起转/滑停/卡拍/巡航），烘定模糊只对巡航一档为真。
    which = (argv[5] if len(argv) > 5 else 'L').upper()
    reel = reelL if which == 'L' else reelR
    base = radians(14) if which == 'L' else radians(52)          # 帧1＝板上姿态（未起转时与板零跳变）
    reelL.rotation_euler[1]=radians(14); reelR.rotation_euler[1]=radians(52)
    keep = {o for o in bpy.data.objects if o.parent == reel}
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in keep:
            try: o.visible_camera = False
            except Exception: pass
    set_plate_camera(); assert_plate_camera('strip')   # 同板相机·锁死＝契约
    scene.render.film_transparent=True; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=RESX; scene.render.resolution_y=int(RESX*10/16)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); cam_e=cam.evaluated_get(dg)
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    scx = (-C['reel_cx'] if which=='L' else C['reel_cx']); scz=C['reel_cz']; sr=1.06
    us=[]; vs=[]
    for px,pz in ((scx-sr,scz),(scx+sr,scz),(scx,scz-sr),(scx,scz+sr)):
        co=_w2c(scene, cam_e, _V((px,0.12,pz))); us.append(co.x); vs.append(co.y)
    RX,RY=scene.render.resolution_x,scene.render.resolution_y
    x0=max(0,int(min(us)*RX)-8); x1=min(RX,int(max(us)*RX)+9)          # 像素对齐+8px 裕（毂近相机的透视鼓出/AA）
    yb0=max(0,int(min(vs)*RY)-8); yb1=min(RY,int(max(vs)*RY)+9)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=x0/RX; scene.render.border_max_x=x1/RX
    scene.render.border_min_y=yb0/RY; scene.render.border_max_y=yb1/RY
    NF = NFOVR or 120
    scene.frame_start=1; scene.frame_end=NF; scene.render.fps=24
    scene.render.use_motion_blur=False
    for f in range(1, NF+1):
        reel.rotation_euler[1]=base+2*math.pi*(f-1)/NF
        reel.keyframe_insert('rotation_euler', index=1, frame=f)
    _linearize(reel)
    scene.render.image_settings.color_depth='8'
    scene.render.filepath=OUT
    print(f'[hero] strip_{which} placement: left={x0/RX*100:.4f}% top={(RY-yb1)/RY*100:.4f}% '
          f'width={(x1-x0)/RX*100:.4f}% height={(yb1-yb0)/RY*100:.4f}%  ({x1-x0}x{yb1-yb0}px · {NF} frames)')
    bpy.ops.render.render(animation=True)
elif MODE in ('strip_guide', 'strip_band'):
    # 第三批③：辊条（端面偏心孔整周 N 帧）与带面流动条（Mapping.x 推移＋微 z 颤·整数周期无缝环）。
    # 同 strip 纪律：透明底 RGBA·其余物件 visible_camera=False 保 GI·帧1＝板姿态零跳变·无运动模糊。
    which=(argv[5] if len(argv)>5 else 'L').upper()
    if MODE=='strip_guide':
        tgt_obj=bpy.data.objects['guide_l' if which=='L' else 'guide_r']
        keep={o for o in bpy.data.objects if o.parent is tgt_obj}
        bx,bz,br = (-GUIDE_X if which=='L' else GUIDE_X), GUIDE_Z, 0.15
        NF=NFOVR or 24
    else:
        tgt_obj=bpy.data.objects['tape_run']
        keep={tgt_obj}
        NF=NFOVR or 12
    for o in bpy.data.objects:
        if o.type=='MESH' and o not in keep:
            try: o.visible_camera=False
            except Exception: pass
    set_plate_camera(); assert_plate_camera('strip_guide/band')   # 同板相机·锁死＝契约
    scene.render.film_transparent=True; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=RESX; scene.render.resolution_y=int(RESX*10/16)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); cam_e=cam.evaluated_get(dg)
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    if MODE=='strip_guide':
        pts=[(bx-br,0.205,bz),(bx+br,0.205,bz),(bx,0.205,bz-br),(bx,0.205,bz+br)]
    else:
        zt=GUIDE_Z+GUIDE_R
        pts=[(-GUIDE_X-0.02,0.125,zt-0.04),(GUIDE_X+0.02,0.125,zt-0.04),(-GUIDE_X-0.02,0.125,zt+0.04),(GUIDE_X+0.02,0.125,zt+0.04)]
    us=[];vs=[]
    for p in pts:
        co=_w2c(scene,cam_e,_V(p)); us.append(co.x); vs.append(co.y)
    RX,RY=scene.render.resolution_x,scene.render.resolution_y
    x0=max(0,int(min(us)*RX)-8); x1=min(RX,int(max(us)*RX)+9)
    yb0=max(0,int(min(vs)*RY)-8); yb1=min(RY,int(max(vs)*RY)+9)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=x0/RX; scene.render.border_max_x=x1/RX
    scene.render.border_min_y=yb0/RY; scene.render.border_max_y=yb1/RY
    scene.render.use_motion_blur=False
    scene.render.image_settings.color_depth='8'
    print(f'[hero] {MODE}_{which} placement: left={x0/RX*100:.4f}% top={(RY-yb1)/RY*100:.4f}% '
          f'width={(x1-x0)/RX*100:.4f}% height={(yb1-yb0)/RY*100:.4f}%  ({x1-x0}x{yb1-yb0}px · {NF} frames)')
    z0=tgt_obj.location.z
    for f in range(NF):
        if MODE=='strip_guide':
            tgt_obj.rotation_euler[1]=2*math.pi*f/NF
        else:
            BAND_MAP.inputs['Location'].default_value[0]=(f/NF)*(1.0/BAND_TILES)   # 整环推一个纹理周期＝无缝
            tgt_obj.location.z=z0+0.0035*math.sin(2*math.pi*2*f/NF)                # 2 周/环·±1.4px 微颤
        scene.render.filepath=f'{OUT}{f+1:04d}'
        bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_penarm':
    # 第三批④ 钢笔回魂：伺服滑针总成（针+触点+入槽连杆）单帧透明 sprite——真页 translateY 滑针，
    # 墨笔硬锁像素级（臂扫弧线与直角坐标纸互斥·伺服针为带式记录仪另一正统）。纸中位姿态渲＝_yOf(0.5) 对齐。
    # 动件层：连杆/杆/锥针/滑块/螺母/接触影（旧粗笔 rec_tip 与长臂不入）；导轨系在场但对相机隐形
    # → 滑块/连杆身上烘进轨与丝杠的接缝 AO/暗部（船长复审②：消层级悬浮）。
    keep={bpy.data.objects[n] for n in ('rec_touch','pen_link','pen_shank','pen_cone','pen_collar','pen_nut')}
    pen_piv.rotation_euler[1]=pen_beta(PEN['cz'])
    for o in bpy.data.objects:
        if o.type=='MESH' and o not in keep:
            try: o.visible_camera=False
            except Exception: pass
    _glz = bpy.data.objects.get('glint')
    if _glz: _glz.hide_render = False   # 墨珠辉点灯仅本 sprite 亮（0.30m·8W·镜面律定位）
    for _nm in ('rec_tip', 'rec_arm'):   # 五勘：旧粗笔尖=隐形影子柱正罩珠顶（visible_camera=False 影子照投）——彻底出场
        _ob = bpy.data.objects.get(_nm)
        if _ob: _ob.hide_render = True
    set_plate_camera(); assert_plate_camera('sprite_penarm')   # 契约机位
    scene.render.film_transparent=True; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=RESX; scene.render.resolution_y=int(RESX*10/16)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); cam_e=cam.evaluated_get(dg)
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    pts=[(-2.02,0.10,PEN['cz']-0.16),(-1.40,0.10,PEN['cz']-0.16),(-2.02,0.10,PEN['cz']+0.16),(-1.40,0.10,PEN['cz']+0.16)]
    us=[];vs=[]
    for p in pts:
        co=_w2c(scene,cam_e,_V(p)); us.append(co.x); vs.append(co.y)
    RX,RY=scene.render.resolution_x,scene.render.resolution_y
    x0=max(0,int(min(us)*RX)-8); x1=min(RX,int(max(us)*RX)+9)
    yb0=max(0,int(min(vs)*RY)-8); yb1=min(RY,int(max(vs)*RY)+9)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=x0/RX; scene.render.border_max_x=x1/RX
    scene.render.border_min_y=yb0/RY; scene.render.border_max_y=yb1/RY
    tip_e=bpy.data.objects['pen_apex'].evaluated_get(dg)
    tw=tip_e.matrix_world.translation
    tco=_w2c(scene,cam_e,_V((tw.x,tw.y,tw.z)))
    print(f'[hero] sprite_penarm placement: left={x0/RX*100:.4f}% top={(RY-yb1)/RY*100:.4f}% '
          f'width={(x1-x0)/RX*100:.4f}% height={(yb1-yb0)/RY*100:.4f}%  ({x1-x0}x{yb1-yb0}px)')
    print(f'[hero] sprite_penarm apex_uv: [{tco.x:.5f}, {1.0-tco.y:.5f}]  （针尖物理极点·墨端由构造重合）')
    scene.render.filepath=OUT
    bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_penrail':
    # ④复审：导轨系静件层（导轨/丝杠/驱动座/上下端座——驱动座衔伺服座球=动力传导可读）。
    # 滑针动件整套 hide_render（非只隐相机）：静层不得烘死滑块的影（滑块会走）。
    keep={bpy.data.objects[n] for n in ('pen_rail','pen_screw','pen_house','pen_mount_t','pen_mount_b')}
    for n in ('rec_touch','pen_link','pen_shank','pen_cone','pen_collar','pen_nut','rec_tip','rec_arm'):
        o=bpy.data.objects.get(n)
        if o: o.hide_render=True
    for o in bpy.data.objects:
        if o.type=='MESH' and o not in keep:
            try: o.visible_camera=False
            except Exception: pass
    set_plate_camera(); assert_plate_camera('sprite_penrail')   # 契约机位
    scene.render.film_transparent=True; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=RESX; scene.render.resolution_y=int(RESX*10/16)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); cam_e=cam.evaluated_get(dg)
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    rx=PEN['tipx']-0.365
    pts=[(rx-0.115,0.10,PEN['cz']-0.48),(rx+0.045,0.10,PEN['cz']-0.48),(rx-0.115,0.10,PEN['cz']+0.48),(rx+0.045,0.10,PEN['cz']+0.48)]
    us=[];vs=[]
    for p in pts:
        co=_w2c(scene,cam_e,_V(p)); us.append(co.x); vs.append(co.y)
    RX,RY=scene.render.resolution_x,scene.render.resolution_y
    x0=max(0,int(min(us)*RX)-6); x1=min(RX,int(max(us)*RX)+7)
    yb0=max(0,int(min(vs)*RY)-6); yb1=min(RY,int(max(vs)*RY)+7)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=x0/RX; scene.render.border_max_x=x1/RX
    scene.render.border_min_y=yb0/RY; scene.render.border_max_y=yb1/RY
    print(f'[hero] sprite_penrail placement: left={x0/RX*100:.4f}% top={(RY-yb1)/RY*100:.4f}% '
          f'width={(x1-x0)/RX*100:.4f}% height={(yb1-yb0)/RY*100:.4f}%  ({x1-x0}x{yb1-yb0}px)')
    scene.render.filepath=OUT
    bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_flap':
    # BATCH3 ②：Solari 翻字牌静件层（壳+铜唇框+空白卡幅=缺席留白物理态）。同机位同灯；
    # 对相机隐形的全场保 GI/AO（走带牌 np_lamp 鎏光吃上铜唇·案上接触暗部烘进壳缘）。
    keep={o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('flap_')}
    for n in ('rec_tip','rec_arm'):
        o=bpy.data.objects.get(n)
        if o: o.hide_render=True
    for o in bpy.data.objects:
        if o.type=='MESH' and o not in keep:
            try: o.visible_camera=False
            except Exception: pass
    set_plate_camera(); assert_plate_camera('sprite_flap')   # 契约机位
    scene.render.film_transparent=True; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=RESX; scene.render.resolution_y=int(RESX*10/16)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); cam_e=cam.evaluated_get(dg)
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    fcx,fcz,fw,fh = FLAP['cx'],FLAP['cz'],FLAP['w'],FLAP['h']
    pts=[(fcx-fw*0.56,0.10,fcz-fh*0.62),(fcx+fw*0.56,0.10,fcz-fh*0.62),(fcx-fw*0.56,0.10,fcz+fh*0.62),(fcx+fw*0.56,0.10,fcz+fh*0.62)]
    us=[];vs=[]
    for p in pts:
        co=_w2c(scene,cam_e,_V(p)); us.append(co.x); vs.append(co.y)
    RX,RY=scene.render.resolution_x,scene.render.resolution_y
    x0=max(0,int(min(us)*RX)-6); x1=min(RX,int(max(us)*RX)+7)
    yb0=max(0,int(min(vs)*RY)-6); yb1=min(RY,int(max(vs)*RY)+7)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=x0/RX; scene.render.border_max_x=x1/RX
    scene.render.border_min_y=yb0/RY; scene.render.border_max_y=yb1/RY
    print(f'[hero] sprite_flap placement: left={x0/RX*100:.4f}% top={(RY-yb1)/RY*100:.4f}% '
          f'width={(x1-x0)/RX*100:.4f}% height={(yb1-yb0)/RY*100:.4f}%  ({x1-x0}x{yb1-yb0}px)')
    # 窗内芯（活字 DOM 层坐标·页百分比直出）：flap_cards 前脸四角（轻工 v2：窗芯上移 cz2）
    _cz2 = fcz + FLAP['coff']; _WW = fw*0.934; _WH = FLAP['winh']
    wpts=[(fcx-_WW/2,0.117,_cz2-_WH/2),(fcx+_WW/2,0.117,_cz2-_WH/2),(fcx-_WW/2,0.117,_cz2+_WH/2),(fcx+_WW/2,0.117,_cz2+_WH/2)]
    wus=[];wvs=[]
    for p in wpts:
        co=_w2c(scene,cam_e,_V(p)); wus.append(co.x); wvs.append(co.y)
    print(f'[hero] flap_window: left={min(wus)*100:.4f}% top={(1-max(wvs))*100:.4f}% '
          f'width={(max(wus)-min(wus))*100:.4f}% height={(max(wvs)-min(wvs))*100:.4f}%')
    # 曲单纸标签位（圈选①甲案）：壳下唇 apron 矩形
    lz0 = fcz - fh/2 + 0.016; lz1 = _cz2 - _WH/2 - 0.024
    lpts=[(fcx-_WW*0.46,0.121,lz0),(fcx+_WW*0.46,0.121,lz0),(fcx-_WW*0.46,0.121,lz1),(fcx+_WW*0.46,0.121,lz1)]
    lus=[];lvs=[]
    for p in lpts:
        co=_w2c(scene,cam_e,_V(p)); lus.append(co.x); lvs.append(co.y)
    print(f'[hero] flap_label: left={min(lus)*100:.4f}% top={(1-max(lvs))*100:.4f}% '
          f'width={(max(lus)-min(lus))*100:.4f}% height={(max(lvs)-min(lvs))*100:.4f}%')
    scene.render.filepath=OUT
    bpy.ops.render.render(write_still=True)
elif MODE == 'sprite_flapglass':
    # 轻工③：防尘玻璃罩橱窗层（反射分量专用 M_vitrine=Transparent×Glossy by Fresnel）——
    # 透明底只留镜面拉丝与菲涅尔缘，叠于 DOM 活字之上（层序=玻璃在字前，物理正确）。
    gd = bpy.data.objects.get('flap_glass'); gd.hide_render = False
    _slo = bpy.data.objects.get('flap_streak')
    if _slo: _slo.hide_render = False            # 拉丝灯仅本层亮
    keep={gd}
    for n in ('rec_tip','rec_arm'):
        o=bpy.data.objects.get(n)
        if o: o.hide_render=True
    for o in bpy.data.objects:
        if o.type=='MESH' and o not in keep:
            try: o.visible_camera=False
            except Exception: pass
    set_plate_camera(); assert_plate_camera('sprite_flapglass')   # 契约机位
    scene.render.film_transparent=True; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=RESX; scene.render.resolution_y=int(RESX*10/16)
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get(); cam_e=cam.evaluated_get(dg)
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    from mathutils import Vector as _V
    fcx,fcz,fw,fh = FLAP['cx'],FLAP['cz'],FLAP['w'],FLAP['h']
    _cz2 = fcz + FLAP['coff']; _WW = fw*0.934; _WH = FLAP['winh']
    pts=[(fcx-_WW*0.56,0.17,_cz2-_WH*0.9),(fcx+_WW*0.56,0.17,_cz2-_WH*0.9),(fcx-_WW*0.56,0.17,_cz2+_WH*0.9),(fcx+_WW*0.56,0.17,_cz2+_WH*0.9)]
    us=[];vs=[]
    for p in pts:
        co=_w2c(scene,cam_e,_V(p)); us.append(co.x); vs.append(co.y)
    RX,RY=scene.render.resolution_x,scene.render.resolution_y
    x0=max(0,int(min(us)*RX)-6); x1=min(RX,int(max(us)*RX)+7)
    yb0=max(0,int(min(vs)*RY)-6); yb1=min(RY,int(max(vs)*RY)+7)
    scene.render.use_border=True; scene.render.use_crop_to_border=True
    scene.render.border_min_x=x0/RX; scene.render.border_max_x=x1/RX
    scene.render.border_min_y=yb0/RY; scene.render.border_max_y=yb1/RY
    print(f'[hero] sprite_flapglass placement: left={x0/RX*100:.4f}% top={(RY-yb1)/RY*100:.4f}% '
          f'width={(x1-x0)/RX*100:.4f}% height={(yb1-yb0)/RY*100:.4f}%  ({x1-x0}x{yb1-yb0}px)')
    scene.render.filepath=OUT
    bpy.ops.render.render(write_still=True)
else:
    reelL.rotation_euler[1]=radians(14); reelR.rotation_euler[1]=radians(52)   # 静帧姿态·异相位
    # peek 渲染闸（复盘 R1 入码）：PEEK='x0,x1,y0,y1'（页分数·y 自顶）——改动件 bbox 局部先过目再上全板。
    # 同机同灯同 seed：border 裁片与全板逐像素同值 ⇒ 定稿裁片可直接回贴 plate（strip 先例）。
    _pk = os.environ.get('PEEK')
    if _pk:
        _a = [float(v) for v in _pk.split(',')]
        scene.render.use_border = True; scene.render.use_crop_to_border = True
        scene.render.border_min_x = _a[0]; scene.render.border_max_x = _a[1]
        scene.render.border_min_y = 1 - _a[3]; scene.render.border_max_y = 1 - _a[2]
        print(f'[hero] PEEK border x[{_a[0]},{_a[1]}] ytop[{_a[2]},{_a[3]}]')
    scene.render.filepath = OUT
    print(f'[hero] still -> {OUT}  ({RESX}x{int(RESX*10/16)}, {SAMPLES} spp)')
    bpy.ops.render.render(write_still=True)
print('[hero] done.')

# covanm driver: runs inside `blender --background --python driver.py -- cfg.json`. Only paths under ../run/covanm.
# phases: 'orig'  = import model + vanilla anm, render+pose-dump, [export control copy], [apply edit, export edited copy]
#         'reimp' = import model + given .anm, render+pose-dump, compare with the orig dumps
import bpy, addon_utils, sys, os, json, math, traceback
import numpy as np
from mathutils import Vector, Quaternion

cfg = json.load(open(sys.argv[sys.argv.index('--') + 1], encoding='utf8'))
OUT = {'phase': cfg['phase'], 'notes': [], 'errors': []}
def note(s): OUT['notes'].append(str(s)); print('COVANM', s)

def finish():
    json.dump(OUT, open(cfg['result'], 'w', encoding='utf8'), indent=1)
    print('COVANM done', cfg['result'])

try:
    addon_utils.enable('gem2_engine_tools')
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    r = bpy.ops.import_scene.gem2_resource(filepath=cfg['model'])
    note('model import %s' % (r,))
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    OUT['n_arm'] = len(arms); OUT['n_mesh'] = len(meshes)
    if not arms:
        raise RuntimeError('no armature after model import')
    # camera from rest bbox
    pts = []
    for m in meshes:
        for c in m.bound_box: pts.append(m.matrix_world @ Vector(c))
    if not pts: raise RuntimeError('no mesh geometry')
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (lo + hi) / 2; diag = max((hi - lo).length, 0.1)
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.render.resolution_x, scn.render.resolution_y = 400, 300
    scn.render.image_settings.file_format = 'PNG'
    scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'RANDOM'
    views = {'iso': Vector((1, -1, 0.8)), 'top': Vector((0.05, -0.3, 1))}
    cams = {}
    for name, d in views.items():
        cd = bpy.data.cameras.new('cam_' + name); cd.clip_end = diag * 20
        co = bpy.data.objects.new('cam_' + name, cd); scn.collection.objects.link(co)
        co.location = ctr + d.normalized() * diag * 1.7
        co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
        cams[name] = co
    arm = arms[0]
    if len(arms) > 1: note('several armatures: %s' % [a.name for a in arms])
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True); bpy.context.view_layer.objects.active = arm

    r = bpy.ops.import_scene.gem2anm(filepath=cfg['anm'])
    note('anm import %s' % (r,))
    if r != {'FINISHED'}: raise RuntimeError('anm import not finished')
    act = arm.animation_data.action
    fmax = int(act['gem2_anm_source_frame_max'])
    OUT['frame_max'] = fmax
    for k in ('gem2_anm_missing_json', 'gem2_anm_visibility_json', 'gem2_anm_has_mesh', 'gem2_anm_source_keys_complete', 'gem2_anm_portability_warning'):
        if k in act.keys(): OUT[k] = act[k] if not hasattr(act[k], 'to_dict') else str(act[k])
    bones_keyed = sorted({fc.data_path.split('"')[1] for fc in __import__('gem2_engine_tools.anm_io', fromlist=['x'])._action_all_fcurves(act) if 'pose.bones' in fc.data_path})
    OUT['bones_keyed'] = bones_keyed

    F = fmax + 1
    mid = F // 2
    edit_frames = sorted({f for f in (mid - 1, mid, mid + 1) if 0 <= f < F}) if F > 2 else ([1] if F == 2 else [0])
    if cfg['phase'] == 'orig':
        OUT['edit_frames'] = edit_frames
        fs = {0, F - 1, F // 4, (3 * F) // 4, mid - 2, mid + 2} | set(edit_frames)
        step = max(1, F // 10)
        fs |= set(range(0, F, step))
        frames = sorted(f for f in fs if 0 <= f < F)[:40]
    else:
        frames = cfg['frames']
    OUT['frames'] = frames

    def dump(tag):
        os.makedirs(cfg['shots'], exist_ok=True)
        poses = {}
        for f in range(0, F):
            scn.frame_set(f)
            poses[str(f)] = {pb.name: [round(v, 6) for row in pb.matrix_basis for v in row] for pb in arm.pose.bones}
        imgs = {}
        for f in frames:
            scn.frame_set(f)
            for vn, co in cams.items():
                scn.camera = co
                p = os.path.join(cfg['shots'], '%s_%s_f%d.png' % (tag, vn, f))
                scn.render.filepath = p
                bpy.ops.render.render(write_still=True)
                imgs['%s:%d' % (vn, f)] = p
        return poses, imgs

    if cfg['phase'] == 'orig':
        poses, imgs = dump('orig')
        json.dump({'poses': poses, 'imgs': imgs, 'frames': frames}, open(cfg['dump'], 'w'))
        # control export (no edit)
        arm.select_set(True); bpy.context.view_layer.objects.active = arm
        scn.frame_set(0)
        r = bpy.ops.export_scene.gem2anm(filepath=cfg['export_ctl'], use_action=True)
        note('export control %s' % (r,))
        if cfg.get('edit') in ('pose', 'visadd', 'vismove'):
            # first bone the vanilla file moves that also drives geometry (vertex group or bone-parented mesh), else the first mover
            movers = [b for b in cfg.get('edit_bones', []) if b.casefold() in {p.name.casefold() for p in arm.pose.bones}]
            cf = {p.name.casefold(): p.name for p in arm.pose.bones}
            def drives(n):   # vertices this bone moves: weighted verts, or all verts of a mesh parented to it
                t = 0
                for m in meshes:
                    if m.parent_type == 'BONE' and m.parent_bone == n: t += len(m.data.vertices)
                    elif n in m.vertex_groups:
                        gi = m.vertex_groups[n].index
                        t += sum(1 for v in m.data.vertices if any(g.group == gi and g.weight > 0.01 for g in v.groups))
                return t
            scored = sorted(((drives(cf[b.casefold()]), i, cf[b.casefold()]) for i, b in enumerate(movers)), key=lambda x: (-x[0], x[1]))
            OUT['edit_bone_scores'] = scored[:5]
            bone = scored[0][2] if scored and scored[0][0] > 0 else (cf[movers[0].casefold()] if movers else None)
            if bone is None: raise RuntimeError('no edit bone from %r on the armature' % cfg.get('edit_bones'))
            OUT['edit_bone'] = bone
            pb = arm.pose.bones[bone]
            delta = Quaternion((0, 1, 0), math.radians(cfg.get('deg', 25)))
            for f in edit_frames:
                scn.frame_set(f)
                pb.rotation_quaternion = pb.rotation_quaternion @ delta
                pb.keyframe_insert('rotation_quaternion', frame=f)
            scn.frame_set(0)
            note('edited bone %s on frames %s rot Y %s deg' % (bone, edit_frames, cfg.get('deg', 25)))
        if cfg.get('edit') in ('visadd', 'vismove'):
            # a curve edit above is needed too: with curves unchanged the add-on copies the source bytes verbatim and ignores this metadata
            ev = json.loads(act['gem2_anm_visibility_json'])
            OUT['vis_before'] = json.loads(json.dumps(ev))
            if ev:
                i = next((k for k, e in enumerate(ev) if 0 < e[0] < fmax), 0)
                if cfg['edit'] == 'vismove':
                    ev[i][0] = min(fmax, ev[i][0] + 1)    # move an existing show/hide event one frame later
                else:
                    taken = {(e[0], e[1]) for e in ev}
                    f = 5
                    while (f, ev[i][1]) in taken: f += 1
                    ev.append([f, ev[i][1], 16])           # new hide event where the source has none
                    i = len(ev) - 1
                act['gem2_anm_visibility_json'] = json.dumps(ev, separators=(',', ':'))
                OUT['vis_after'] = ev; OUT['vis_edit'] = ev[i]
            else:
                note('no visibility events to edit')
        arm.select_set(True); bpy.context.view_layer.objects.active = arm
        r = bpy.ops.export_scene.gem2anm(filepath=cfg['export_edit'], use_action=True)
        note('export edited %s' % (r,))
    else:
        poses, imgs = dump(cfg['tag'])
        orig = json.load(open(cfg['dump']))
        pd = []
        for f, bones in orig['poses'].items():
            for b, m in bones.items():
                m2 = poses.get(f, {}).get(b)
                if m2 is None: pd.append([int(f), b, 'missing']); continue
                d = max(abs(a - c) for a, c in zip(m, m2))
                if d > 1e-4: pd.append([int(f), b, round(d, 5)])
        OUT['pose_diff'] = pd
        idf = {}
        for key, p in imgs.items():
            a = bpy.data.images.load(orig['imgs'][key], check_existing=False); b = bpy.data.images.load(p, check_existing=False)
            xa = np.empty(len(a.pixels), dtype=np.float32); a.pixels.foreach_get(xa)
            xb = np.empty(len(b.pixels), dtype=np.float32); b.pixels.foreach_get(xb)
            n = int((np.abs(xa - xb).reshape(-1, 4).max(axis=1) > 2 / 255).sum())
            idf[key] = n
        OUT['img_diff_pixels'] = idf
except Exception:
    OUT['errors'].append(traceback.format_exc())
    traceback.print_exc()
finish()

#!/usr/bin/env python3
"""Export Texas's original attack and Sword Rain FX for the optional browser renderer.

Uses the same UnityPy / LZ4AK dependencies as extract.py. No game rules or data tables are changed.
Game art and the generated pack stay under public/assets/ (git-ignored).
"""
import argparse
import json
import math
import struct
import zlib
from pathlib import Path

import aklz4  # registers the client's LZ4AK decoder
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

PROJECT = Path(__file__).resolve().parents[2]
DEFAULT_GAME = Path('C:/Program Files/Hypergryph Launcher/games/Arknights/Arknights_Data/StreamingAssets/AB/Windows')
MODULES = ['InitialModule', 'EmissionModule', 'ShapeModule', 'VelocityModule', 'ClampVelocityModule',
           'ForceModule', 'SizeModule', 'RotationModule', 'ColorModule', 'UVModule']


def clean(value):
    if isinstance(value, float):
        return round(value, 7) if math.isfinite(value) else 0
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    return value


def animation_tracks(clip, nodes):
    """Decode the original streamed Transform curves into 60 Hz samples (cosmetic only)."""
    tree = clip.read_typetree()
    muscle = tree['m_MuscleClip']
    data = muscle['m_Clip']['data']
    stream = data['m_StreamedClip']
    raw = struct.pack('<' + 'I' * len(stream['data']), *stream['data'])
    curves = {}
    pos = 0
    while pos < len(raw):
        time, count = struct.unpack_from('<fI', raw, pos)
        pos += 8
        for _ in range(count):
            index, a, b, c, d = struct.unpack_from('<I4f', raw, pos)
            pos += 20
            if math.isfinite(time) and time >= 0:
                curves.setdefault(index, []).append((time, a, b, c, d))

    def sample(index, time):
        keys = curves.get(index, [])
        if keys:
            key = next((key for key in reversed(keys) if key[0] <= time + 1e-7), keys[0])
            dt = max(0, time - key[0])
            return ((key[1] * dt + key[2]) * dt + key[3]) * dt + key[4]
        dense = data['m_DenseClip']
        offset = index - stream['curveCount']
        if 0 <= offset < dense['m_CurveCount']:
            frame = min(dense['m_FrameCount'] - 1, max(0, int((time - dense['m_BeginTime']) * dense['m_SampleRate'])))
            return dense['m_SampleArray'][frame * dense['m_CurveCount'] + offset]
        constant = data['m_ConstantClip']['data']
        offset -= dense['m_CurveCount']
        return constant[offset] if 0 <= offset < len(constant) else 0

    tracks, offset = [], 0
    end = muscle['m_StopTime']
    for binding in tree['m_ClipBindingConstant']['genericBindings']:
        attr = binding['attribute']
        width = 4 if attr == 2 and binding['typeID'] == 4 else 3 if attr in (1, 3, 4) and binding['typeID'] == 4 else 1
        tint = binding['typeID'] == 199 and binding['customType'] == 22 and 4 <= attr >> 28 <= 7 and (attr & 0x0fffffff) == (zlib.crc32(b'_TintColor') & 0x0fffffff)
        if binding['typeID'] == 4 and attr in (1, 2, 3, 4) or tint:
            matches = [i for i, n in enumerate(nodes) if (zlib.crc32(n['path'].encode()) & 0xffffffff) == binding['path']]
            if matches:
                times = [min(end, i / 60) for i in range(math.ceil(end * 60) + 1)]
                tracks.append({'node': matches[0], 'property': 'tint' if tint else {1: 'position', 2: 'rotation', 3: 'scale', 4: 'euler'}[attr],
                               'channel': (attr >> 28) - 4 if tint else None,
                               'keys': [[t, *[sample(offset + k, t) for k in range(width)]] for t in times]})
        offset += width
    return tracks


def export(game, out):
    env = UnityPy.load(str(game / 'battle/prefabs/effects/texas.ab'))
    own = env.assets[0]
    for rel in ['refs/fx/material.ab', '[uc]shaders.ab']:
        env.load_file(str(game / rel))
    for source in sorted((game / 'refs/fx/texture').glob('*.ab')):
        env.load_file(str(source))
    out.mkdir(parents=True, exist_ok=True)
    trees = {o.path_id: o.read_typetree() for o in own.objects.values() if o.type.name in ['GameObject', 'Transform', 'ParticleSystem', 'ParticleSystemRenderer', 'MonoBehaviour']}
    transforms = {i: t for i, t in trees.items() if 'm_Father' in t}
    transform_of = {t['m_GameObject']['m_PathID']: i for i, t in transforms.items()}
    particles = {t['m_GameObject']['m_PathID']: t for i, t in trees.items() if 'InitialModule' in t}
    renderers = {o.read_typetree()['m_GameObject']['m_PathID']: o.read() for o in own.objects.values() if o.type.name == 'ParticleSystemRenderer'}
    pack = {'format': 1, 'operator': 'char_102_texas', 'source': 'local-client/battle/prefabs/effects/texas.ab',
            'textures': {}, 'meshes': {}, 'effects': {}, 'unsupported': ['TrailRenderer', 'particle sub-emitters', 'depth-buffer intersections']}

    def material(ptr):
        obj = ptr.deref()
        m = obj.read()
        props = m.m_SavedProperties
        tex = dict(props.m_TexEnvs)['_MainTex'].m_Texture.read()
        name = tex.m_Name
        if name not in pack['textures']:
            tex.image.save(out / (name + '.png'))
            pack['textures'][name] = name + '.png'
        tint = dict(props.m_Colors).get('_TintColor')
        return {'texture': name, 'shader': m.m_Shader.read().m_ParsedForm.m_Name,
                'color': {key: getattr(tint, key, 1) for key in ('r', 'g', 'b', 'a')}}

    def mesh(ptr):
        if not ptr.m_PathID:
            return None
        m = ptr.read()
        name = m.m_Name
        if name not in pack['meshes']:
            handler = MeshHandler(m)
            handler.process()
            pack['meshes'][name] = {'vertices': handler.m_Vertices, 'uvs': handler.m_UV0,
                                    'triangles': [tri for sub in handler.get_triangles() for tri in sub]}
        return name

    for container, pointer in env.container.items():
        if not container.endswith('.prefab') or 'texas_' not in container:
            continue
        go = pointer.read_typetree()
        root = transform_of[pointer.path_id if hasattr(pointer, 'path_id') else pointer.m_PathID]
        node_ids, nodes = [], []

        def visit(tid, parent, path):
            t = transforms[tid]
            name = trees[t['m_GameObject']['m_PathID']]['m_Name']
            index = len(nodes)
            node_ids.append(tid)
            nodes.append({'name': name, 'path': path, 'parent': parent, 'position': t['m_LocalPosition'],
                          'rotation': t['m_LocalRotation'], 'scale': t['m_LocalScale']})
            for child in t['m_Children']:
                child_name = trees[transforms[child['m_PathID']]['m_GameObject']['m_PathID']]['m_Name']
                visit(child['m_PathID'], index, path + '/' + child_name if path else child_name)

        visit(root, -1, '')
        emitters = []
        for index, tid in enumerate(node_ids):
            gid = transforms[tid]['m_GameObject']['m_PathID']
            p, renderer = particles.get(gid), renderers.get(gid)
            if p is None or renderer is None or not p['EmissionModule']['enabled']:
                continue
            try:
                mat = material(renderer.m_Materials[0])
                mesh_name = mesh(renderer.m_Mesh) if renderer.m_RenderMode == 4 else None
            except (FileNotFoundError, ValueError):
                continue  # non-rendering parent particle systems use Unity's default placeholder material
            emitters.append({'node': index, 'duration': p['lengthInSec'], 'delay': p['startDelay'],
                             'renderMode': renderer.m_RenderMode, 'lengthScale': renderer.m_LengthScale,
                             'velocityScale': renderer.m_VelocityScale, 'material': mat, 'mesh': mesh_name,
                             'modules': {key: p[key] for key in MODULES if p.get(key, {}).get('enabled')}})
        clips = [o for o in own.objects.values() if o.type.name == 'AnimationClip' and o.read_typetree()['m_Name'] == go['m_Name']]
        tracks = [track for clip in clips for track in animation_tracks(clip, nodes)]
        name = go['m_Name'].replace('texas_', '')
        pack['effects'][name] = {'nodes': nodes, 'emitters': emitters, 'tracks': tracks}
    text = json.dumps(clean(pack), ensure_ascii=False, separators=(',', ':'))
    (out / 'pack.json').write_text(text + '\n', encoding='utf8')
    if out.resolve() == (PROJECT / 'public/assets/local/fx/texas').resolve():
        # Keep release packaging aware of the optional art, like extract.py's other local groups.
        manifest_path = PROJECT / 'data/local-assets.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf8')) if manifest_path.exists() else {'version': 1, 'source': 'local-client', 'groups': {}}
        group = {'pack': {'path': '/assets/local/fx/texas/pack.json', 'kind': 'TextAsset'}}
        for name, file in pack['textures'].items():
            group[name] = {'path': '/assets/local/fx/texas/' + file, 'kind': 'Texture2D'}
        manifest['groups']['fx/texas'] = group
        manifest['count'] = sum(len(group) for group in manifest['groups'].values())
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'effects': {k: len(v['emitters']) for k, v in pack['effects'].items()}, 'textures': list(pack['textures']),
                      'meshes': list(pack['meshes']), 'bytes': len(text), 'output': str(out)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=DEFAULT_GAME)
    parser.add_argument('--out', type=Path, default=PROJECT / 'public/assets/local/fx/texas')
    args = parser.parse_args()
    export(args.game, args.out)

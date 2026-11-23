// render pack test (MV-R2, builder R2b): the scene pack of the fixture map, both forms (freeze render.md 3.3, 6).
// Known answers: counts, def states, the fx_wall instance matrix; the same bytes twice (README 9.2) and the pinned sha1
// of pack.bin; write / readPack round trip; TexMod variant and RENDER_TEXMOD_MISSING; the GoH lightmap slot (goh only);
// seeded defects: pack.bin one byte short and one byte changed -> RENDER_PACK_BAD (MV_FAULT, exit 2), also through
// `mapviz render l3 --in`.
// usage: node tools/mapviz/render/test/pack.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-c7a8ba0e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const OWN = !process.argv[2];
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-pack-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz render pack: ' + what); } }
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-4);

const S = require('./synthobj'), P = require('../pack');
const MVJS = path.resolve(__dirname, '../../mapviz.js');
// pack.bin sha1 of the fixture (both forms hold the same objects): README 9.2 golden
const GOLDEN = 'd35a359649cac95b752397f27e9f60c40aee8aa6';

function mApply(m, k, p) { const o = k * 12; return [0, 1, 2].map(r => m[o + r * 4] * p[0] + m[o + r * 4 + 1] * p[1] + m[o + r * 4 + 2] * p[2] + m[o + r * 4 + 3]); }

function thrown(fn) { try { fn(); return null; } catch (e) { return e; } }

for (const form of ['as2', 'goh']) {
  const f = S.fixture(path.join(W, 'fx-' + form), form);
  const r = P.pack(f.src, f.doc, { made: 't', grids: f.grids });
  const j = r.json, c = j.counts;
  ok(j.v === 1 && j.kind === 'scenepack' && j.units === 'included' && j.map === 'multi/mv_fixture' && j.mode === null, form + ': pack.json head');
  ok(c.defs === 5 && c.instances === 7 && c.failed === 0 && c.drawn === 7 && JSON.stringify(c.skipped) === '{"decal":1}', form + ': counts ' + JSON.stringify(c));
  const row = d => j.defs.find(x => x.def === d) || {};
  ok(row('fx_tree').state === 'drawn' && row('fx_tree').instances === 3 && row('fx_wall').instances === 1 && row('fx_house').instances === 1 &&
    row('fx_bush').instances === 2 && row('fx_road').state === 'decal' && row('fx_road').geoms.length === 0, form + ': def rows ' + JSON.stringify(j.defs.map(d => [d.def, d.state, d.instances])));
  ok(row('fx_tree').category === 'tree' && row('fx_bush').category === 'bush' && row('fx_house').category === 'building', form + ': categories');
  const pk = r.pack, k = [...pk.inst.uid].indexOf(0x1004);
  const o0 = k >= 0 ? mApply(pk.inst.m, k, [0, 0, 0]) : [NaN], o1 = k >= 0 ? mApply(pk.inst.m, k, [1, 0, 0]) : [NaN];
  ok(k >= 0 && near(o0[0], 100) && near(o0[1], -100) && near(o0[2], 0), form + ': fx_wall m maps the origin to (100, -100, 0): ' + o0);
  ok(k >= 0 && near(o1[0] - o0[0], 0) && near(o1[1] - o0[1], 1) && near(o1[2] - o0[2], 0), form + ': fx_wall local +x goes to world +y');
  ok([...pk.inst.uid].every((u, i, a) => i === 0 || a[i - 1] <= u), form + ': instances sorted by uid');
  const g = j.geoms.find(x => x.def === 'fx_house');
  ok(g && near(g.box[0], -80) && near(g.box[4], 60) && near(g.box[5], 120) && g.iCount === 36 && g.vCount === 24, form + ': fx_house geom box and counts');
  const m = j.materials[g.parts[0].mat], t = j.textures[m.tex];
  ok(m.blend === 'none' && m.scale === 2 && m.alpharef === 128 && JSON.stringify(m.color) === '[255,255,255,255]' && m.lm === null, form + ': fx_house material');
  ok(t && t.key === 'resource/entity/fx/fx_house.dds' && t.from === 'default' && t.variant === null && JSON.stringify(t.size) === '[8,8]', form + ': fx_house texture ' + JSON.stringify(t));
  ok(j.bin.bytes === r.bin.length && j.bin.sections.inst.count === 7 && j.bin.sections.pos.off % 8 === 0 && r.bin.toString('latin1', 0, 4) === 'MVPK', form + ': bin layout');
  ok(j.mapHashes.map && /^[0-9a-f]{40}$/.test(j.mapHashes.map), form + ': mapHashes.map');
  // same bytes twice; pinned golden
  const r2 = P.pack(f.src, f.doc, { made: 't', grids: f.grids });
  ok(Buffer.compare(r.bin, r2.bin) === 0 && JSON.stringify(r.json) === JSON.stringify(r2.json), form + ': the same bytes on a second run');
  if (GOLDEN.length === 40) ok(j.bin.sha1 === GOLDEN, form + ': pack.bin sha1 ' + j.bin.sha1 + ' = golden');
  else console.log('golden ' + form + ' ' + j.bin.sha1);
  // write, readPack
  const dir = path.join(W, 'pack-' + form);
  P.write(dir, r);
  const back = P.readPack(dir);
  ok(back.from === 'in' && back.inst.count === 7 && back.pos.length === r.pack.pos.length && back.pos.every((v, i) => v === r.pack.pos[i]) &&
    back.inst.m.every((v, i) => v === r.pack.inst.m[i]), form + ': readPack(folder) round trip');
  ok(P.readPack({ json: r.json, bin: r.bin }).from === 'given', form + ': readPack({json, bin}) from given');
  // seeded defects
  const shortBin = r.bin.subarray(0, r.bin.length - 1);
  let e = thrown(() => P.readPack({ json: r.json, bin: shortBin }));
  ok(e && e.code === 'MV_FAULT' && e.exit === 2 && e.detail && e.detail.code === 'RENDER_PACK_BAD', form + ': pack.bin one byte short -> RENDER_PACK_BAD (' + (e && e.message) + ')');
  const flip = Buffer.from(r.bin); flip[flip.length - 5] ^= 1;
  e = thrown(() => P.readPack({ json: r.json, bin: flip }));
  ok(e && e.detail && e.detail.code === 'RENDER_PACK_BAD', form + ': one byte changed -> RENDER_PACK_BAD');
  if (form === 'as2') {
    const bad = path.join(W, 'bad-in');
    fs.mkdirSync(bad, { recursive: true });
    fs.writeFileSync(path.join(bad, 'pack.json'), JSON.stringify(r.json));
    fs.writeFileSync(path.join(bad, 'pack.bin'), shortBin);
    const gf = require('../../lib/raster/gridfile'), base = S.flatBase(f.doc, 600, { height: f.grids.height });
    gf.write(path.join(bad, 'pic.l2.mvg'), base.grid); gf.write(path.join(bad, 'l2.n.mvg'), base.aux.n); gf.write(path.join(bad, 'l2.z.mvg'), base.aux.z);
    fs.writeFileSync(path.join(bad, 'pic.l2.json'), JSON.stringify(base.sidecar));
    const cr = spawnSync(process.execPath, [MVJS, 'render', 'l3', '--target', f.fxd.target, '--game', f.fxd.gameDir, '--mod-dir', f.fxd.modDirs[0], '--map', f.fxd.map,
      '--size', '600', '--in', bad, '--out', path.join(W, 'bad-out'), '--json'], { encoding: 'utf8', env: process.env, timeout: 300000 });
    ok(cr.status === 2, 'cli render l3 --in with pack.bin one byte short exits 2, got ' + cr.status + ' ' + String(cr.stderr || '').trim().slice(-200));
  }
}

// TexMod chain: fx_house {TexMod "aut"} with fx_house#aut.dds -> that texture; fx_wall {TexMod "nope"} -> default + gap
{
  const f = S.fixture(path.join(W, 'fx-texmod'), 'as2', (fxd, put) => put('resource/entity/fx/fx_house#aut.dds', S.dds32(8, 8, [200, 50, 50, 255])));
  for (const e of f.doc.entities) { if (e.uid === 0x1005) e.texmod = 'aut'; if (e.uid === 0x1004) e.texmod = 'nope'; }
  const r = P.pack(f.src, f.doc, { made: 't', grids: f.grids }), j = r.json;
  const gh = j.geoms.filter(g => g.def === 'fx_house'), gw = j.geoms.filter(g => g.def === 'fx_wall');
  const ga = gh.find(g => g.variant === 'aut'), g0 = gh.find(g => g.variant === null);
  const tv = ga ? j.textures[j.materials[ga.parts[0].mat].tex] : null;
  ok(ga && tv && tv.from === 'texmod' && tv.variant === 'aut' && tv.key === 'resource/entity/fx/fx_house#aut.dds',
    'texmod: fx_house draws its #aut texture ' + JSON.stringify(tv));
  const k = [...r.pack.inst.uid].indexOf(0x1005);
  ok(ga && g0 && ga.vOff === g0.vOff && k >= 0 && r.pack.inst.geom[k] === ga.id && j.counts.instances === 7, 'texmod: the variant geom shares the vertices; uid 0x1005 uses it');
  ok(gw.length === 1 && gw[0].variant === null && j.gaps.includes('RENDER_TEXMOD_MISSING') && j.notes.some(n => n.code === 'RENDER_TEXMOD_MISSING' && /fx_wall/.test(n.text)),
    'texmod: a missing variant falls back to the default with RENDER_TEXMOD_MISSING');
}

// GoH lightmap slot: {lightmap "fx_lm"} on fx_tree.mtl; goh reads it, the same mtl on as2 does not (no such key there)
for (const form of ['goh', 'as2']) {
  const f = S.fixture(path.join(W, 'fx-lm-' + form), form, (fxd, put) => {
    put('resource/entity/fx/fx_tree.mtl', '{material simple\r\n\t{diffuse "fx_tree"}\r\n\t{lightmap "fx_lm"}\r\n\t{blend none}\r\n}\r\n');
    put('resource/entity/fx/fx_lm.dds', S.dds32(4, 4, [64, 64, 64, 255]));
  });
  const j = P.pack(f.src, f.doc, { made: 't', grids: f.grids }).json;
  const g = j.geoms.find(x => x.def === 'fx_tree'), m = j.materials[g.parts[0].mat];
  const lt = m.lm !== null ? j.textures[m.lm] : null;
  if (form === 'goh') ok(lt && lt.key === 'resource/entity/fx/fx_lm.dds', 'goh: the lightmap slot is read ' + JSON.stringify(m));
  else ok(m.lm === null, 'as2: no lightmap slot');
}

// a lightmap that cannot be read (goh): RENDER_LIGHTMAP_MISSING
{
  const f = S.fixture(path.join(W, 'fx-lmx'), 'goh', (fxd, put) => put('resource/entity/fx/fx_tree.mtl', '{material simple\r\n\t{diffuse "fx_tree"}\r\n\t{lightmap "no_such_lm"}\r\n}\r\n'));
  const j = P.pack(f.src, f.doc, { made: 't', grids: f.grids }).json;
  ok(j.gaps.includes('RENDER_LIGHTMAP_MISSING'), 'goh: a lightmap that is not there gives RENDER_LIGHTMAP_MISSING ' + j.gaps);
}

// TexMod per-texture entry and {default}, read from the map file; the same on both forms
for (const form of ['as2', 'goh']) {
  const f = S.fixture(path.join(W, 'fx-tmx-' + form), form, (fxd, put) => {
    put('resource/entity/fx/fx_tree#aut.dds', S.dds32(8, 8, [200, 50, 50, 255]));
    put('resource/entity/fx/fx_tree#win.dds', S.dds32(8, 8, [50, 50, 200, 255]));
    const rel = 'resource/map/' + fxd.map + '/map', file = path.join(fxd.gameDir, rel);
    let t = fs.readFileSync(file, 'latin1');
    t = t.replace(/(\{Entity "fx_tree" 0x1001\r?\n)/, '$1\t\t{TexMod "aut" {"fx_tree" "win"}}\n')
      .replace(/(\{Entity "fx_tree" 0x1002\r?\n)/, '$1\t\t{TexMod {default "aut"}}\n')
      .replace(/(\{Entity "fx_tree" 0x1003\r?\n)/, '$1\t\t{TexMod "spr" {default "aut"}}\n');
    put(rel, t);
  });
  const r = P.pack(f.src, f.doc, { made: 't', grids: f.grids }), j = r.json;
  const texOfUid = u => { const k = [...r.pack.inst.uid].indexOf(u), g = k >= 0 ? j.geoms[r.pack.inst.geom[k]] : null; return g ? j.textures[j.materials[g.parts[0].mat].tex] : null; };
  const t1 = texOfUid(0x1001), t2 = texOfUid(0x1002), t3 = texOfUid(0x1003);
  ok(t1 && t1.variant === 'win' && t1.key === 'resource/entity/fx/fx_tree#win.dds', form + ': texmod per-texture entry wins over the head word ' + JSON.stringify(t1));
  ok(t2 && t2.variant === 'aut' && t2.from === 'texmod', form + ': texmod {default} alone is the variant ' + JSON.stringify(t2));
  ok(t3 && t3.variant === 'aut', form + ': texmod head word with no image falls back to {default} ' + JSON.stringify(t3));
  ok(!j.gaps.includes('RENDER_TEXMOD_MISSING') && j.geoms.some(g => g.def === 'fx_tree' && g.variant === 'aut{fx_tree=win}'), form + ': texmod keys ' + j.geoms.filter(g => g.def === 'fx_tree').map(g => g.variant));
}

// skinned meshes: a skinned tree or bush stays drawn (bind pose, no bit 1); a skinned building is 'skinned' (units only)
for (const form of ['as2', 'goh']) {
  const f = S.fixture(path.join(W, 'fx-skin-' + form), form);
  const L0 = require('../../entcat').loaderFor(f.src), L = Object.create(L0);
  L.load = k => {
    const r = L0.load(k);
    if (!r || !r.scene || !/fx_(tree|house)/.test(String(k))) return r;
    return Object.assign({}, r, { scene: Object.assign({}, r.scene, { meshes: r.scene.meshes.map(m => Object.assign({}, m, { skinned: true })) }) });
  };
  const r = P.pack(f.src, f.doc, { made: 't', grids: f.grids, loader: L }), j = r.json;
  const row = d => j.defs.find(x => x.def === d) || {};
  const flagsOf = u => r.pack.inst.flags[[...r.pack.inst.uid].indexOf(u)];
  ok(row('fx_tree').state === 'drawn' && j.geoms.find(g => g.def === 'fx_tree').skinned === true && (flagsOf(0x1001) & 2) === 0, form + ': skinned tree drawn in bind pose, no bit 1');
  ok(row('fx_house').state === 'skinned' && (flagsOf(0x1005) & 2) === 2 && j.counts.skipped.skinned === 1, form + ': skinned building is skinned (units only) ' + JSON.stringify(j.counts.skipped));
}

// a def whose missing model is a sound extension is service with no gap; another missing model stays failed with a gap
{
  const f = S.fixture(path.join(W, 'fx-snd'), 'goh');
  const ec = require('../../entcat');
  for (const [msg, want] of [['Extension "sound.mdl" names a model that is not in the game or the stack', 'service'], ['Extension "fx_gone.mdl" names a model that is not in the game or the stack', 'failed']]) {
    const cat = ec.forDoc(f.src, f.doc, {});
    const entries = Object.assign({}, cat.entries); delete entries.fx_wall;
    const j = P.pack(f.src, f.doc, { made: 't', grids: f.grids, catalog: { entries, failed: [{ def: 'fx_wall', code: 'ENTCAT_MDL_MISSING', msg }] } }).json;
    const w = j.defs.find(x => x.def === 'fx_wall');
    if (want === 'service') ok(w.state === 'service' && w.code === 'RENDER_NO_MESH' && !j.gaps.includes('RENDER_MODEL_MISSING'), 'sound extension: service, no gap ' + JSON.stringify([w, j.gaps]));
    else ok(w.state === 'failed' && w.code === 'RENDER_MODEL_MISSING' && j.gaps.includes('RENDER_MODEL_MISSING'), 'missing model: failed with gap ' + JSON.stringify([w, j.gaps]));
  }
  // entcat 2 form of the same def: category service with mdl null (entcat sfx rule) -> service, no gap, no geom
  for (const form of ['as2', 'goh']) {
    const g = S.fixture(path.join(W, 'fx-snd2-' + form), form);
    const cat = ec.forDoc(g.src, g.doc, {});
    const entries = Object.assign({}, cat.entries, { fx_wall: Object.assign({}, cat.entries.fx_wall, { category: 'service', mdl: null }) });
    const j = P.pack(g.src, g.doc, { made: 't', grids: g.grids, catalog: { entries, failed: [] } }).json;
    const w = j.defs.find(x => x.def === 'fx_wall');
    ok(w && w.state === 'service' && w.geoms.length === 0 && !j.gaps.includes('RENDER_MODEL_MISSING') && !j.gaps.includes('RENDER_MODEL_BAD'),
      form + ': entcat service def with mdl null is service, no gap ' + JSON.stringify([w, j.gaps]));
  }
}

// readPack checks the parts of every geom: a part past its geom, a partial triangle, a material not in pack.json
{
  const f = S.fixture(path.join(W, 'fx-parts'), 'as2');
  const r = P.pack(f.src, f.doc, { made: 't', grids: f.grids });
  for (const [what, edit] of [['part past its geom', p => { p.iCount += 3000; }], ['partial triangle', p => { p.iCount -= 1; }], ['material not in pack.json', p => { p.mat = 999; }]]) {
    const j = JSON.parse(JSON.stringify(r.json));
    edit(j.geoms[0].parts[0]);
    const e = thrown(() => P.readPack({ json: j, bin: r.bin }));
    ok(e && e.detail && e.detail.code === 'RENDER_PACK_BAD', 'readPack: ' + what + ' -> RENDER_PACK_BAD (' + (e && e.message) + ')');
  }
}

// texmod.js units
{
  const TM = require('../texmod');
  ok(JSON.stringify(TM.stems('$/flora/plant_ash1', 'resource/entity/x/a.mtl')) === JSON.stringify(['resource/texture/common/flora/plant_ash1', 'resource/entity/flora/plant_ash1', 'resource/texture/flora/plant_ash1']), 'texmod: $/ stems');
  ok(TM.stems('../common/t.dds', 'resource/entity/b/x/a.mtl')[0] === 'resource/entity/b/common/t', 'texmod: .. in a bare name');
  ok(JSON.stringify(TM.colorOf('0x80102030')) === '[16,32,48,128]' && JSON.stringify(TM.colorOf('"230 230 230 25"')) === '[230,230,230,255]', 'texmod: colour forms');
  const tm = TM.texModOf('Aut', 'win', [['$/flora/Bark.dds', 'spr']]);
  ok(JSON.stringify(TM.wantedOf(tm, 'resource/entity/x/bark')) === '["spr","win"]' && JSON.stringify(TM.wantedOf(tm, 'resource/entity/x/leaf')) === '["aut","win"]' &&
    TM.texModKey(tm) === 'aut{default=win;bark=spr}' && TM.texModKey(TM.texModOf('aut')) === 'aut' && TM.texModOf('', null, []) === null, 'texmod: per-texture entry, default, key');
}

if (OWN && !fail) { try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ } }
if (fail) { console.log('FAIL mapviz render pack: ' + fail + ' of ' + (pass + fail) + ' checks'); process.exit(1); }
console.log('PASS mapviz render pack (' + pass + ')');

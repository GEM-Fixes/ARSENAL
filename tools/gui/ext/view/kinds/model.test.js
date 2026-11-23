// view kind model test. Arg: scratch dir. Fixture game + mod made here. Checks: the owner route (a mesh, a volume, an animation to
// their .mdl with what to select; a .mdl itself; a .def by its Extension; a texture and a .mtl through the meshes; a shared common/
// folder used by two models beside it (several, best first); a mesh no model names (the folder's model, loose); a mesh with no model
// near (none); a mod's own mesh over a game model; a file given by path outside the game), the kind's files (exts, routes, remote,
// strings, page rules), the page table (VIEW.kindOf: a model's files to model, a map's map.ply not), go() in a fake DOM (the owner
// looked up first, then the Models page picked with sub-tab, selection and mesh; no owner: the bytes tab; explicit: says so), and
// the Editor action. Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-28b929aa)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'modelk-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };

const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const E = (...p) => path.join(game, 'resource', 'entity', ...p);
const crlf = s => s.replace(/\n/g, '\r\n');
// a tank: two meshes on bones, a polyhedron volume, two sequences (one by its name, one with a file)
wr(E('veh', 'tank', 'tank.mdl'), crlf('{Skeleton\n\t{bone "basis"\n\t\t{VolumeView "tank.ply"}\n\t\t{bone "turret"\n\t\t\t{VolumeView "turret.ply"}\n\t\t}\n\t}\n\t{animation\n\t\t{sequence "idle"}\n\t\t{sequence "fire" {file "shoot.anm"}}\n\t}\n}\n{Volume "hull"\n\t{Polyhedron "hull.vol"}\n\t{Bone "basis"}\n}\n'));
wr(E('veh', 'tank', 'tank.def'), crlf('{game_entity\n\t{Extension "tank.mdl"}\n}\n'));
wr(E('veh', 'tank', 'tank.ply'), Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(20), Buffer.from('tank.mtl')]));
wr(E('veh', 'tank', 'turret.ply'), Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(20)]));
wr(E('veh', 'tank', 'extra.ply'), Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(8)]));
wr(E('veh', 'tank', 'tank.mtl'), crlf('{material\n\t{diffuse "tankskin"}\n}\n'));
wr(E('veh', 'tank', 'tankskin.dds'), Buffer.concat([Buffer.from('DDS '), Buffer.alloc(124)]));
wr(E('veh', 'tank', 'other.dds'), Buffer.concat([Buffer.from('DDS '), Buffer.alloc(124)]));
wr(E('veh', 'tank', 'hull.vol'), Buffer.alloc(32, 1));
wr(E('veh', 'tank', 'idle.anm'), Buffer.alloc(32, 2));
wr(E('veh', 'tank', 'shoot.anm'), Buffer.alloc(32, 3));
// a house: a shared common/ mesh used by the two models beside it
wr(E('house', 'common', 'win.ply'), Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(8)]));
wr(E('house', 'a', 'a.mdl'), crlf('{Skeleton\n\t{bone "a"\n\t\t{VolumeView "a.ply"}\n\t\t{bone "win" {VolumeView "../common/win.ply"}}\n\t}\n}\n'));
wr(E('house', 'house', 'house.mdl'), crlf('{Skeleton\n\t{bone "h"\n\t\t{bone "w" {VolumeView "../common/win.ply"}}\n\t}\n}\n'));
wr(E('lonely', 'z.ply'), Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(8)]));
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
wr(path.join(mod, 'resource', 'entity', 'veh', 'tank', 'turret.ply'), Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(30)]));
const out = path.join(work, 'elsewhere', 'resource', 'entity', 'v2');
wr(path.join(out, 'v2.mdl'), crlf('{Skeleton\n\t{bone "b" {VolumeView "v2.ply"}}\n}\n'));
wr(path.join(out, 'v2.ply'), Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(8)]));

const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const MS = require('./model.server'), ML = require('./model.lang'), MC = require('./model.client');
const U = q => { const u = new URL('http://x/api/x/view/model/owner'); for (const k of Object.keys(q)) u.searchParams.set(k, q[k]); return u; };
const owner = q => MS.routes['GET /api/x/view/model/owner'](U(q), null, ctx);
const T = 'resource/entity/veh/tank/';

(async () => {
  // ---- the kind's files
  ok(MS.exts.join() === 'ply,vol,anm' && MS.remote.join() === 'GET /api/x/view/model/owner', 'server: exts ply vol anm, the owner route open to a phone');
  ok(ML.every(r => r.length === 5 && r[0].startsWith('view.model.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.model.* in en, ru, uk, zh');
  const keys = new Set(ML.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...MC.script.matchAll(/'(view\.[a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !keys.has(k));
  ok(!miss.length && !/`|\$\{|innerHTML/.test(MC.script), 'client: page-safe, every view.* key exists ' + miss.join());

  // ---- owner route
  const p = await owner({ mod, key: T + 'tank.ply' });
  const gameMdl = path.join(game, 'resource', 'entity', 'veh', 'tank', 'tank.mdl');
  ok(p.found && p.key === T + 'tank.mdl' && path.resolve(p.target) === gameMdl && p.sub === 'ply' && p.ply === T + 'tank.ply' && p.sel.bone === 'basis' && !p.loose && p.candidates.length === 1, 'ply -> its mdl, Mesh sub-tab, its bone: ' + JSON.stringify(p));
  const v = await owner({ mod, key: T + 'hull.vol' });
  ok(v.found && v.sub === 'vol' && v.sel.volume === 'basis/hull', 'vol -> Volumes, its volume id: ' + JSON.stringify(v.sel));
  const a1 = await owner({ mod, key: T + 'idle.anm' }), a2 = await owner({ mod, key: T + 'shoot.anm' });
  ok(a1.found && a1.sub === 'anim' && a1.sel.anm === T + 'idle.anm' && a2.found && a2.sel.anm === T + 'shoot.anm' && !a2.loose, 'anm (by sequence name and by file) -> Animation, selected');
  const m = await owner({ mod, key: T + 'tank.mdl' }), d = await owner({ mod, key: T + 'tank.def' });
  ok(m.found && m.sub === 'model' && m.key === T + 'tank.mdl' && d.found && d.key === T + 'tank.mdl' &&d.candidates[0].uses === 'extension', 'mdl -> itself, def -> its Extension');
  const tx1 = await owner({ mod, key: T + 'tankskin.dds' }), mt = await owner({ mod, key: T + 'tank.mtl' }), tx2 = await owner({ mod, key: T + 'other.dds' });
  ok(tx1.found && tx1.key === T + 'tank.mdl' && mt.found && !tx2.found, 'texture and .mtl -> the model whose mesh uses them; a texture no mesh uses -> none');
  const w = await owner({ mod, key: 'resource/entity/house/common/win.ply' });
  ok(w.found && w.candidates.length === 2 && w.name === 'a.mdl' && w.candidates[1].name === 'house.mdl' && w.sel.bone === 'a/win' && w.sub === 'ply', 'common/ mesh -> the two models beside it (both named like their folder: by name): ' + JSON.stringify(w.candidates));
  const lo = await owner({ mod, key: T + 'extra.ply' });
  ok(lo.found && lo.loose && lo.key === T + 'tank.mdl' &&lo.ply === T + 'extra.ply', 'a mesh no model names -> the model of its folder, loose');
  const no = await owner({ mod, key: 'resource/entity/lonely/z.ply' });
  ok(!no.found && !no.target, 'a mesh with no model near -> none (the page opens the bytes)');
  const mine = await owner({ mod, rel: 'resource/entity/veh/tank/turret.ply' });
  ok(mine.found && mine.key === T + 'tank.mdl' && path.resolve(mine.target) === gameMdl &&mine.sel.bone === 'basis/turret' && mine.where === 'mine', 'my mod\'s mesh -> the game\'s model (a key: read from the game, nothing copied)');
  const own = await owner({ mod, key: T + 'turret.ply' });
  ok(own.found && own.where === 'mine', 'the copy the game loads is the mod\'s');
  const loose = await owner({ path: path.join(out, 'v2.ply') });
  ok(loose.found && path.resolve(loose.target).toLowerCase() === path.resolve(out, 'v2.mdl').toLowerCase() && loose.ply === 'resource/entity/v2/v2.ply', 'a file outside the game view -> the .mdl next to it on disk: ' + loose.target);
  ok(!fs.existsSync(path.join(mod, 'resource', 'entity', 'veh', 'tank', 'tank.mdl')), 'nothing written into the mod');

  // ---- the page script in a fake DOM
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [], toasts = [], shown = [], picks = [];
  const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1') };
  box.window = box;
  const L = {}; for (const r of require('../lang').concat(ML)) L[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v2 = a[x]; if (v2 == null || v2 === false) continue; if (x === 'class') e.className = v2; else if (x === 'text') e.textContent = v2; else e.setAttribute(x, v2 === true ? '' : v2); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, pp) => { let s = L[k] || k; if (pp) s = s.replace(/\{(\w+)\}/g, (mm, x) => (pp[x] == null ? mm : String(pp[x]))); return s; };
  let reply = null;
  const api = u => (u.startsWith('/api/x/view/model/owner') ? (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)) : Promise.reject(new Error('unknown ' + u)));
  const S = { mod: 'C:/m', sec: { ide: {} }, screens: { models: { pick(t, o) { picks.push([t, o]); } } } };
  Object.assign(box, { h, tx, api, S, show(id) { shown.push(id); }, toast(t) { toasts.push(t); } });
  vm.createContext(box);
  const hexStub = "VIEW.reg('hex',{where:'tab',label:'view.hex.label',exts:[],open:function(){return {}}});";
  vm.runInContext(require('../client').script('') + '\n' + hexStub + '\n' + MC.script + '\n' + require('./map.client').script, box, { filename: 'model-script' });
  const V = box.VIEW, flush = async () => { for (let i = 0; i < 6; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  ok(V.kindOf('resource/entity/veh/tank/tank.ply') === 'model' && V.kindOf('a.vol') === 'model' && V.kindOf('x.anm') === 'model', 'page table: .ply .vol .anm -> model');
  ok(V.kindOf('resource/map/multi/m1/map.ply') === 'map' && V.kindOf('map.ply', 'resource/map/multi/m1/map.ply') === 'map' && V.kindOf('t.mdl') === null && V.kindOf('t.def') === null && V.kindOf('t.mtl') === null, 'page table: a map\'s map.ply -> map; .mdl .def .mtl stay text');
  // found: no page change before the answer, then Models with the sub-tab, selection and mesh
  reply = { found: true, target: T + 'tank.mdl', name: 'tank.mdl', sub: 'ply', sel: { bone: 'basis' }, ply: T + 'tank.ply', candidates: [{}, {}] };
  const r1 = V.open({ key: T + 'tank.ply' }, 'tank.ply');
  ok(r1 === true && !shown.length, 'go: true at once, the page waits for the owner');
  await flush();
  ok(shown.join() === 'models' && picks.length === 1 && picks[0][0] === T + 'tank.mdl' && picks[0][1].sub === 'ply' && picks[0][1].ply === T + 'tank.ply' && picks[0][1].sel.bone === 'basis', 'go: Models, picked with the Mesh sub-tab, the bone and the mesh');
  ok(toasts.some(t => /2 models use this file/.test(t)), 'go: several models -> says which one is shown');
  // none: the bytes tab in the Editor, the Models page not shown
  reply = { found: false }; shown.length = 0; picks.length = 0; box.IDE_PENDING = null;
  V.open({ key: 'resource/entity/lonely/z.ply' }, 'z.ply'); await flush();
  ok(!picks.length && shown.join() === 'ide' && box.IDE_PENDING && box.IDE_PENDING[0].view === 'hex', 'go: no model -> the bytes tab');
  reply = new Error('boom'); shown.length = 0; box.IDE_PENDING = null;
  V.open({ key: T + 'hull.vol' }, 'hull.vol'); await flush();
  ok(box.IDE_PENDING && box.IDE_PENDING[0].view === 'hex', 'go: a failed lookup -> the bytes tab');
  // explicit (the explorer menu, the action): says so, never opens bytes
  reply = { found: false }; toasts.length = 0; box.IDE_PENDING = null;
  V.modelGo({ key: T + 'other.dds' }, 'other.dds'); await flush();
  ok(toasts.some(t => /No model in this folder/.test(t)) && !box.IDE_PENDING, 'explicit: no model -> said, no bytes tab');
  reply = { found: true, target: T + 'tank.mdl', name: 'tank.mdl', sub: 'model', sel: {}, candidates: [{}], note: 'modpak' }; toasts.length = 0; picks.length = 0;
  V.modelGo({ key: T + 'tank.def' }, 'tank.def'); await flush();
  ok(picks.length === 1 && picks[0][1].sub === 'model' && toasts.some(t => /inside a mod's pak/.test(t)), 'explicit: a .def -> its model; a model in a mod pak says the game copy is shown');
  // the Editor action: registered once IDE is there, runs only on a .mdl or .def tab
  const acts = {}; let active = null;
  box.IDE = { actions: acts, action(id, spec) { acts[id] = spec; }, active: () => active };
  ok(V._modelAct() === true && acts.showInModels && acts.showInModels.group === 'jump' && L[acts.showInModels.label], 'action: Show in Models in the jump group');
  active = { ref: { key: T + 'tank.mdl' }, name: 'tank.mdl' }; ok(acts.showInModels.when() === true, 'action: on for a .mdl tab');
  active = { ref: { key: 'resource/set/x.set' }, name: 'x.set' }; ok(acts.showInModels.when() === false, 'action: off for other tabs');

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind model ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });

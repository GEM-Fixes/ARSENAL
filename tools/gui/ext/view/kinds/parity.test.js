// view ext game parity test (AS64, MoW:AS2, Gates of Hell). Arg: scratch dir. Made-up fixtures only: an AS2 install with as64.exe,
// mowas_2.exe and an as64/core layer, a GoH install (binaries/x64/call_to_arms.exe) with a mod in its mods folder, and a GoH user dir
// with a GoH profile in the test home (the sound profile lookup is stubbed to that home). Checks, each per game through ctx.gameId (as gui.js gives it):
//   ref/info route: a key only in as64/core is found under as64, not under mowas2; a GoH key under goh; a GoH mod is read (read mode)
//   sound: the game alone (path ref) lists as64/core files only for as64; GoH reads the GoH view, the GoH profile volumes, rules 'goh'
//     and asks the model for the GoH rules (opts.game 'goh'); as64 and mowas2 never pass a game to the model
//   picture: an ATI2 / BC5U / BC5S dds is refused ('format') under as64 and mowas2 and loads under goh with the note bc5goh
//   shader: .gso .hso .dso .cso are shader files; the route answers the game; the page words the cache line per game
//   page: VIEW.open uses the Editor only when the game shows it (INGAME.ide), else a box; a model file in a game without the Models
//     page opens as bytes (never show('models')); a map file in a game without the Maps page opens the Map Viewer on that map
// Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-9e9737f2)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'vpar-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };

// ---- fixtures
const game = path.join(work, 'game'), goh = path.join(work, 'goh'), home = path.join(work, 'home');
process.env.GOH_GAME = goh; process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = home;
const W = require('../../../../lib/wav');
const tone = (frames, v) => W.encodePcm16({ rate: 22050, channels: 1, pcm: new Int16Array(frames).fill(v) });
wr(path.join(game, 'as64.exe'), 'MZ'); wr(path.join(game, 'mowas_2.exe'), 'MZ');
wr(path.join(game, 'resource', 'sound', 'amb', 'base.wav'), tone(200, 100));
wr(path.join(game, 'as64', 'core', 'resource', 'sound', 'amb', 'core.wav'), tone(300, 200));
wr(path.join(game, 'as64', 'core', 'resource', 'set', 'only64.set'), '{x}\r\n');
wr(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
wr(path.join(goh, 'resource', 'sound', 'amb', 'goh.wav'), tone(400, 300));
wr(path.join(goh, 'resource', 'set', 'gohonly.set'), '{y}\r\n');
const gmod = path.join(goh, 'mods', 'gm');
wr(path.join(gmod, 'mod.info'), '{name "GoH mod"}\r\n');
wr(path.join(gmod, 'resource', 'set', 'm.set'), '{m}\r\n');
wr(path.join(gmod, 'resource', 'gm.pak'), require('../../../../lib/zipwrite').zip([['set/g.set', Buffer.from('{g}\r\n'), false]], { date: new Date(2020, 0, 1) }));
wr(path.join(gmod, 'resource', 'sound', 'gs', 'g1.wav'), tone(100, 50));
// GoH profile: <Documents>/My Games/Gates of Hell/profiles/<id>/options.set (userdir.gohUserDir with the test home)
wr(path.join(home, 'Documents', 'My Games', 'Gates of Hell', 'profiles', '77', 'options.set'),
  '{options\r\n\t{sound\r\n\t\t{volume\r\n\t\t\t{master 80}\r\n\t\t\t{effects 70}\r\n\t\t\t{environment 60}\r\n\t\t}\r\n\t}\r\n}\r\n');
function dds(w, h, mips, four) {
  const hd = Buffer.alloc(124);
  hd.writeUInt32LE(124, 0); hd.writeUInt32LE(0x1007, 4); hd.writeUInt32LE(h, 8); hd.writeUInt32LE(w, 12); hd.writeUInt32LE(mips, 24); hd.writeUInt32LE(32, 72);
  hd.writeUInt32LE(4, 76); hd.write(four, 80, 'latin1');
  return Buffer.concat([Buffer.from('DDS ', 'latin1'), hd, Buffer.alloc(Math.max(1, w >> 2) * Math.max(1, h >> 2) * 16)]);
}
const pic = path.join(work, 'pic');
for (const f of ['ATI2', 'BC5U', 'BC5S']) wr(path.join(pic, f + '.dds'), dds(8, 8, 1, f));
wr(path.join(pic, 'odd.dds'), dds(6, 8, 1, 'ATI2'));
wr(path.join(pic, 'atx1.dds'), dds(8, 8, 1, 'ATI1'));

// ctx as gui.js gives it: gameId, exe, kind, gohDir, curDir (the AS2 install under as64 and mowas2, the GoH install under goh)
const EXE = { as64: 'as64', mowas2: 'mowas_2', goh: 'goh' };
const ctxOf = gid => ({ tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, allowLaunch: false, game: () => game,
  gameId: () => gid, exe: () => EXE[gid], kind: () => (gid === 'goh' ? 'goh' : 'as2'), gohDir: () => goh, curDir: () => (gid === 'goh' ? goh : game) });
const U = (route, q) => { const u = new URL('http://x' + route); for (const k of Object.keys(q)) u.searchParams.set(k, q[k]); return u; };
async function err(p) { try { await p; return null; } catch (e) { return e; } }

(async () => {
  const lib = require('../../files/lib'), FS = require('../server');
  const R = FS.routes || {};
  const infoR = R['GET /api/x/view/info'];
  ok(typeof infoR === 'function', 'framework: the info route');

  // ---- ref / info route per game
  {
    const i64 = await infoR(U('/api/x/view/info', { key: 'set/only64.set' }), null, ctxOf('as64'));
    ok(i64 && i64.key === 'resource/set/only64.set' && i64.size === 5, 'info as64: a key of as64/core is in the view');
    const em = await err(infoR(U('/api/x/view/info', { key: 'set/only64.set' }), null, ctxOf('mowas2')));
    ok(em && em.status === 404, 'info mowas2: no as64/core in the MoW:AS2 view ' + (em && em.message));
    const ig = await infoR(U('/api/x/view/info', { key: 'set/gohonly.set' }), null, ctxOf('goh'));
    ok(ig && ig.key === 'resource/set/gohonly.set', 'info goh: a key of the GoH install');
    const ea = await err(infoR(U('/api/x/view/info', { key: 'set/gohonly.set' }), null, ctxOf('as64')));
    ok(ea && ea.status === 404, 'info as64: the GoH key is not in the AS2 view');
    const gm = await infoR(U('/api/x/view/info', { mod: gmod, rel: 'resource/set/m.set' }), null, ctxOf('goh'));
    ok(gm && gm.name === 'm.set' && gm.where === 'mine', 'info goh: a mod in <GoH>/mods is read (read mode)');
    const gr = await err(infoR(U('/api/x/view/info', { mod: gmod, rel: 'resource/set/m.set' }), null, ctxOf('as64')));
    ok(gr && /Gates of Hell/.test(gr.message), 'info as64: the same GoH folder is refused with a plain line ' + (gr && gr.message));
  }

  // ---- sound
  {
    const model = require('../../../../sound/model'), SS = require('./sound.server');
    const seen = []; const realPlan = model.plan, realFolder = model.folder;
    model.plan = function (o, src) { seen.push({ game: o.game }); return realPlan.apply(this, arguments); };
    model.folder = function (a, b, c, d, e) { seen.push({ folder: e && e.game }); return realFolder.apply(this, arguments); };
    try {
      SS._reset();
      // the profile lookup is stubbed to the test home (production reads userdir.profilesFor with no test env)
      const UD = require('../../../../lib/userdir'), udOpt = { home, env: { LOCALAPPDATA: path.join(home, 'AppData', 'Local') } };
      SS._setProfilesOf(gid => UD.profilesFor(gid === 'goh' ? 'goh' : null, 0, udOpt));
      const plan = (gid, file) => SS.routes['GET /api/x/view/sound/plan'](U('/api/x/view/sound/plan', { path: file }), null, ctxOf(gid));
      ok(SS._gidOf(ctxOf('mowas2')) === 'mowas2' && SS._gidOf({ game: () => game }) === 'as64' && SS._gidOf(ctxOf('nope')) === 'as64', 'sound: the game id, as64 when none');
      const base = path.join(game, 'resource', 'sound', 'amb', 'base.wav');
      seen.length = 0;
      const a = await plan('as64', base);
      ok(a.rules === 'as2' && a.game === 'as64' && a.folder.files.includes('resource/sound/amb/core.wav') && a.folder.files.includes('resource/sound/amb/base.wav'), 'sound as64: folder has the as64/core file ' + JSON.stringify(a.folder.files));
      ok(seen.length && seen.every(s => s.game === undefined), 'sound as64: no game passed to the model (opts as before)');
      const m = await plan('mowas2', base);
      ok(m.rules === 'as2' && m.game === 'mowas2' && m.folder.files.includes('resource/sound/amb/base.wav') && !m.folder.files.includes('resource/sound/amb/core.wav'), 'sound mowas2: no as64/core file in the folder ' + JSON.stringify(m.folder.files));
      seen.length = 0;
      const g = await plan('goh', path.join(goh, 'resource', 'sound', 'amb', 'goh.wav'));
      ok(g.rules === 'goh' && g.game === 'goh' && g.folder.files.includes('resource/sound/amb/goh.wav') && !g.folder.files.includes('resource/sound/amb/base.wav'), 'sound goh: the GoH view ' + JSON.stringify(g.folder.files));
      ok(g.options.source === 'profile' && /gates of hell/i.test(g.options.file || '') && g.options.values.master === 80 && g.options.values.effects === 70, 'sound goh: the GoH profile volumes ' + JSON.stringify(g.options).slice(0, 200));
      ok(a.options.file !== g.options.file, 'sound: as64 and goh do not share the options cache');
      ok(a.options.source === 'defaults' && a.options.file === null, 'sound as64: no AS2 profile in the test home -> defaults (never the machine profile) ' + JSON.stringify(a.options.file));
      ok(seen.some(s => s.game === 'goh'), 'sound goh: the model is asked for the GoH rules (opts.game)');
      seen.length = 0;
      const b = await SS.routes['GET /api/x/view/sound/burst'](U('/api/x/view/sound/burst', { path: path.join(goh, 'resource', 'sound', 'amb', 'goh.wav'), every: 100, shots: 2 }), null, ctxOf('goh'));
      ok(b.shots.length === 2 && seen.some(s => s.folder === 'goh'), 'sound goh: burst asks model.folder with {game:goh}');
      const nm = await SS.routes['GET /api/x/view/sound/name'](U('/api/x/view/sound/name', { name: 'amb' }), null, ctxOf('goh'));
      ok(nm.rules === 'goh' && nm.files.includes('resource/sound/amb/goh.wav'), 'sound goh: a sound name resolves in the GoH view ' + JSON.stringify(nm.files));
      // the vfs exe: ctx.exe() when it names the page's game, else the table (a ctx without exe)
      ok(SS._exeOf(ctxOf('mowas2'), 'mowas2') === 'mowas_2' && SS._exeOf(ctxOf('goh'), 'goh') === 'goh' && SS._exeOf({}, 'mowas2') === 'mowas_2' && SS._exeOf({ exe: () => 'mowas2' }, 'mowas2') === 'mowas_2', 'sound: the exe from ctx.exe()');
      // a GoH mod in <GoH>/mods is read in read mode (lib.checkRead) by the sound name and archive ref routes; checkMod (the write check) is not asked
      {
        const realCM = lib.checkMod; let cm = 0; lib.checkMod = function () { cm++; return realCM.apply(this, arguments); };
        try {
          const gn = await SS.routes['GET /api/x/view/sound/name'](U('/api/x/view/sound/name', { name: 'gs', mod: gmod }), null, ctxOf('goh'));
          ok(gn.rules === 'goh' && gn.files.includes('resource/sound/gs/g1.wav'), 'sound goh: a sound name of a mod in <GoH>/mods ' + JSON.stringify(gn.files));
          const MS = require('./misc.server');
          const mr = await MS.routes['GET /api/x/view/misc/ref'](U('/api/x/view/misc/ref', { mod: gmod, rel: 'resource/gm.pak', entry: 'set/g.set' }), null, ctxOf('goh'));
          ok(mr.ref && mr.ref.rel === 'resource/gm.pak:\x3aset/g.set', 'misc goh: an entry of a pak of a mod in <GoH>/mods ' + JSON.stringify(mr));
          ok(cm === 0, 'view readers: no write check (lib.checkMod) for a read, asked ' + cm + 'x');
          const ea2 = await err(SS.routes['GET /api/x/view/sound/name'](U('/api/x/view/sound/name', { name: 'gs', mod: gmod }), null, ctxOf('as64')));
          ok(ea2 && /Gates of Hell/.test(ea2.message), 'sound as64: the GoH mod folder is refused with a plain line ' + (ea2 && ea2.message));
        } finally { lib.checkMod = realCM; }
      }
      const L = require('./sound.lang'), C = require('./sound.client');
      ok(['view.sound.h.rules', 'view.sound.h.rulesGoh'].every(k => { const r = L.find(x => x[0] === k); return r && r.length === 5 && r.every(Boolean); }) && /rulesGoh/.test(C.script), 'sound page: the GoH rules row, worded in four languages');
    } finally { model.plan = realPlan; model.folder = realFolder; SS._setProfilesOf(null); }
  }

  // ---- picture
  {
    const PS = require('./picture.server');
    const info = (gid, f) => PS.routes['GET /api/x/view/picture/info'](U('/api/x/view/picture/info', { path: path.join(pic, f) }), null, ctxOf(gid));
    for (const f of ['ATI2', 'BC5U', 'BC5S']) {
      const a = await info('as64', f + '.dds'), m = await info('mowas2', f + '.dds'), g = await info('goh', f + '.dds');
      ok(!a.game.ok && a.game.why === 'format' && !m.game.ok && m.game.why === 'format', 'picture ' + f + ': as64 and mowas2 cannot load it');
      ok(g.game.ok && g.notes.some(x => x.code === 'bc5goh' && x.level === 'info') && !g.notes.some(x => x.code === 'format'), 'picture ' + f + ': goh loads it, note bc5goh ' + JSON.stringify(g.notes));
    }
    const odd = await info('goh', 'odd.dds');
    ok(!odd.game.ok && odd.game.why === 'dxt4', 'picture goh: a BC5 side not a multiple of 4 is still refused');
    const a1 = await info('goh', 'atx1.dds');
    ok(!a1.game.ok && a1.game.why === 'format', 'picture goh: ATI1 (BC4) is still refused (GHFMT-03 names BC5 only)');
    const img = await PS.routes['GET /api/x/view/picture/image'](U('/api/x/view/picture/image', { path: path.join(pic, 'ATI2.dds') }), null, ctxOf('goh'));
    ok(img.width === 8 && img.game.ok && typeof img.rgba === 'string', 'picture goh: the BC5 picture is drawn');
    const PL = require('./picture.lang'), r = PL.find(x => x[0] === 'view.picture.n.bc5goh');
    ok(r && r.length === 5 && r.every(Boolean), 'picture: bc5goh worded in four languages');
  }

  // ---- shader
  const KS = require('./shader.server'), KC = require('./shader.client'), KL = require('./shader.lang');
  const D = require('../../../../lib/dxbc');
  {
    ok(['gso', 'hso', 'dso', 'cso', 'pso', 'vso'].every(e => KS.exts.includes(e)) && /exts:\['pso','vso','gso','hso','dso','cso'\]/.test(KC.script), 'shader: the GoH cache kinds are shader files (server and page)');
    const key = 'histogram[HistogramBinsCS]', nm = D.md5Name(key)[1] + '.cso', code = Buffer.concat([Buffer.from('DXBC'), Buffer.alloc(28)]);
    code.writeUInt32LE(32, 24);
    wr(path.join(work, 'sh', nm), Buffer.concat([Buffer.from([key.length]), Buffer.from(key, 'latin1'), code]));
    for (const gid of ['as64', 'mowas2', 'goh']) {
      const o = await KS.routes['GET /api/x/view/shader/info'](U('/api/x/view/shader/info', { path: path.join(work, 'sh', nm) }), null, ctxOf(gid));
      ok(o.game === gid && o.key === key && o.md5.match, 'shader ' + gid + ': the route answers the game and reads the .cso key');
    }
    ok(['view.shader.cacheM', 'view.shader.cacheG'].every(k => { const r = KL.find(x => x[0] === k); return r && r.length === 5 && r.every(Boolean); }), 'shader: the per-game cache lines in four languages');
  }

  // ---- video play (plan only: nothing started): a GoH video is inside the page's game folder under goh, outside it under as64
  {
    const VS = require('./video.server'), av = path.join(goh, 'resource', 'video', 'intro.avi');
    wr(av, Buffer.from('RIFF\x04\x00\x00\x00AVI ', 'latin1'));
    const play = gid => VS.routes['POST /api/x/view/video/play'](U('/api/x/view/video/play', {}), { path: av, plan: true }, ctxOf(gid));
    const pg = await play('goh');
    ok(pg && pg.plan === true, 'video goh: a video of the GoH install may be played (plan) ' + JSON.stringify(pg).slice(0, 120));
    const pa = await err(play('as64'));
    ok(pa && pa.status === 403, 'video as64: the same file is outside the AS2 game folder (403)');
  }

  // ---- the page in a fake DOM: the whole ext script with stub routes
  {
    const ext = require('../index'), L = ext.lang;
    const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [], calls = [];
    const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1') };
    box.window = box;
    const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
    const tx = (k, p) => { let s = L.en[k] || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] == null ? m : String(p[x]))); return s; };
    let shGame = 'as64';
    const api = u => { calls.push(u); const p = u.split('?')[0];
      if (p === '/api/x/view/info') return Promise.resolve({ name: 'a.cso', size: 40, where: 'vanilla', type: 'data', magic: '00', key: null });
      if (p === '/api/x/view/hex') return Promise.resolve({ off: 0, len: 4, size: 4, b64: Buffer.from('ABCD').toString('base64') });
      if (p === '/api/x/view/shader/info') return Promise.resolve({ name: 'a.cso', game: shGame, size: 40, key: null, dxbc: { magic: 'DXBC', size: 32, notes: [], chunks: [] } });
      if (p === '/api/x/view/model/owner') return Promise.resolve({ found: true, target: { key: 'resource/entity/t/t.mdl' }, name: 't.mdl', sub: 'mesh' });
      if (p === '/api/x/view/map/info') return Promise.resolve({ grass: ['g1'] });
      return Promise.reject(Object.assign(new Error('no'), { status: 404 })); };
    const picks = [];
    const S = { mod: 'C:/g/mods/mine', sec: { ide: {}, mapviz: {} }, screens: { models: { pick: (t, o) => picks.push(['models', t, o]) }, maps: { pick: (k, o) => picks.push(['maps', k, o]) } } };
    const INGAME = { ide: false, models: false, maps: false, mapviz: true };
    const game = { name: 'Gates of Hell' };
    Object.assign(box, { h, tx, api, S, INGAME, curGame: () => game, show: id => calls.push('show:' + id), toast: m => calls.push('toast:' + m) });
    vm.createContext(box);
    vm.runInContext('var INGAME=window.INGAME;\n' + ext.script, box, { filename: 'view-script' });
    const V = box.VIEW, flush = async () => { for (let i = 0; i < 8; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
    const shown = id => calls.indexOf('show:' + id) >= 0, dlgs = () => doc.body.querySelectorAll ? doc.body.querySelectorAll('dialog').length : 0;

    // VIEW.open: no Editor in this game -> a box, never show('ide')
    calls.length = 0; box.IDE_PENDING = [];
    const d0 = dlgs();
    ok(V.open({ rel: 'resource/set/a.set' }) === true && !shown('ide') && !box.IDE_PENDING.length && dlgs() === d0 + 1, 'open: a game without the Editor -> a box, no game switch');
    INGAME.ide = true; calls.length = 0;
    ok(V.open({ rel: 'resource/set/a.set' }) === true && shown('ide') && box.IDE_PENDING.length === 1, 'open: a game with the Editor -> the Editor (as before)');
    INGAME.ide = false;

    // model file: no Models page in this game -> bytes, never show('models'); explicit -> a plain line
    calls.length = 0; picks.length = 0;
    V.open({ rel: 'resource/entity/t/t.ply' }); await flush();
    ok(!shown('models') && !picks.length && !calls.some(u => /model\/owner/.test(u)) && dlgs() >= 2, 'model: no Models page here -> opened as bytes ' + calls.join(' '));
    calls.length = 0;
    V.modelGo({ rel: 'resource/entity/t/t.mdl' }, 't.mdl'); await flush();
    ok(!shown('models') && calls.some(c => /^toast:The Models page is not part of Gates of Hell/.test(c)), 'model: explicit -> "not part of" line ' + calls.join(' '));
    INGAME.models = true; calls.length = 0; picks.length = 0;
    V.open({ rel: 'resource/entity/t/t.ply' }); await flush();
    ok(shown('models') && picks.length === 1 && picks[0][0] === 'models', 'model: a game with the Models page -> the page (as before)');

    // map file: no Maps page -> the Map Viewer on that map
    calls.length = 0; picks.length = 0; S.mapKey = null;
    ok(V.open({ key: 'resource/map/multi/foo/map.grs' }) === true && shown('mapviz') && !shown('maps') && S.mapKey === 'map/multi/foo' && !picks.length, 'map: no Maps page here -> the Map Viewer on map/multi/foo ' + calls.join(' '));
    ok(calls.some(c => /^toast:Opened multi\/foo in the Map Viewer/.test(c)), 'map: a toast names the map');
    calls.length = 0; S.mapKey = null;
    V.mapGo({ key: 'resource/map/single/x/y/map.net' }, 'map.net');
    ok(shown('mapviz') && S.mapKey === 'map/single/x/y', 'map: the explorer form goes to the Map Viewer too');
    INGAME.maps = true; S.sec.maps = {}; calls.length = 0; picks.length = 0;   // the Maps page is in this game: built (S.sec) and listed (INGAME)
    V.open({ key: 'resource/map/multi/foo/map.grs' }); await flush();
    ok(shown('maps') && picks.length === 1 && picks[0][1] === 'map/multi/foo' && !shown('mapviz'), 'map: a game with the Maps page -> the Maps page (as before)');

    // shader page: the cache line per game
    for (const [gid, re] of [['as64', /AS64 never reads the cache shipped/], ['mowas2', /MoW:AS2 reads the cache shipped/], ['goh', /Gates of Hell keeps its cache in your user folder/]]) {
      shGame = gid;
      const host = doc.createElement('div'); doc.body.appendChild(host);
      const hd = V.mount(host, { rel: 'resource/shader/cache/dx11.0/a.cso' }, 'a.cso', { kind: 'shader' });
      await flush();
      ok(hd.kind === 'shader' && re.test(host.textContent), 'shader page ' + gid + ': its cache line');
      hd.close();
    }
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view parity ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });

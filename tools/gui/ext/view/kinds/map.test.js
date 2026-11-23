// view kind map test. Arg: scratch dir. Fixture game + mod made here. Checks: which files a map folder claims (mapOf, match: map.grs,
// map.net, map.ply of resource/map/multi|single/..., not service/land, not text files, no '..'), the grass header (grassNames), the
// info route (a game map.grs with its names, a map.net, an entry of the mod's resource.pak, a bad header), the kind's files (exts,
// routes, remote, strings, page rules), and the page script in a fake DOM, once per game (as64, mowas2, goh): map.net and map.ply
// open the Map Viewer with the map key; map.grs the Maps page with its grass card where the game has it (AS64), else the Map Viewer;
// the shell's pick request when the screen has one; no Map Viewer -> the Maps page where it is, else said and the bytes tab; a page
// of another game is never used; mapGo and mapViewGo; files outside a map folder and '..' paths (seeded defect) not claimed; the
// Gates of Hell pak layout (resource/map/multi.pak). Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-058c459d)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'mapk-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const grs = names => { const parts = [Buffer.from('GRASPMAP', 'latin1'), Buffer.alloc(4)]; parts[1].writeInt32LE(names.length, 0); for (const s of names) parts.push(Buffer.from([s.length]), Buffer.from(s, 'latin1')); parts.push(Buffer.alloc(64, 7)); return Buffer.concat(parts); };

const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const M1 = path.join(game, 'resource', 'map', 'multi', 'm1');
wr(path.join(M1, 'map.grs'), grs(['grass_a', 'grass_b', 'reed']));
wr(path.join(M1, 'map.net'), Buffer.concat([Buffer.alloc(8), Buffer.from('EMAP'), Buffer.alloc(40)]));
wr(path.join(M1, 'bad', 'map.grs'), Buffer.from('NOTGRASS0000'));
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
wr(path.join(mod, 'resource.pak'), require('../../../../lib/zipwrite').zip([['map/multi/m2/map.grs', grs(['moss']), true]]));
// the Gates of Hell layout in a mod: resource/map/multi.pak holds multi/<folder>/... (counts from resource/map/)
wr(path.join(mod, 'resource', 'map', 'multi.pak'), require('../../../../lib/zipwrite').zip([['multi/m3/map.grs', grs(['fern']), true]]));
const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const MS = require('./map.server'), ML = require('./map.lang'), MC = require('./map.client');
const U = q => { const u = new URL('http://x/api/x/view/map/info'); for (const k of Object.keys(q)) u.searchParams.set(k, q[k]); return u; };
const info = q => MS.routes['GET /api/x/view/map/info'](U(Object.assign({ mod }, q)), null, ctx);
const { mapOf, grassNames, match } = MS._t;

(async () => {
  // ---- the kind's files
  ok(Array.isArray(MS.exts) && !MS.exts.length && typeof MS.match === 'function' && MS.remote.join() === 'GET /api/x/view/map/info', 'server: no extension of its own (match only), the info route open to a phone');
  ok(ML.every(r => r.length === 5 && r[0].startsWith('view.map.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.map.* in en, ru, uk, zh');
  const keys = new Set(ML.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...MC.script.matchAll(/'(view\.[a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !keys.has(k));
  ok(!miss.length && !/`|\$\{|innerHTML/.test(MC.script), 'client: page-safe, every view.* key exists ' + miss.join());

  // ---- the folder rule
  ok(mapOf('resource/map/multi/m1/map.grs') === 'map/multi/m1' && mapOf('map/single/c1/m3/map.ply') === 'map/single/c1/m3' && mapOf('resource.pak:\x3amap/multi/m2/map.grs') === 'map/multi/m2' && mapOf('C:\\g\\resource\\map\\multi\\x\\map.net') === 'map/multi/x', 'mapOf: a key, a single mission, a pak entry, a Windows path');
  ok(mapOf('resource/entity/service/land/map.ply') === null && mapOf('resource/map/multi/map.grs') === null && mapOf('resource/map/multi/../x/map.grs') === null && mapOf('') === null, 'mapOf: service/land, a file directly in multi/, a .. path, nothing -> null');
  ok(match('map.grs', 'resource/map/multi/m1/map.grs') && match('map.ply', 'resource/map/multi/m1/map.ply') && match('map.net', 'resource/map/multi/m1/map.net'), 'match: map.grs, map.ply, map.net of a map folder');
  ok(!match('map.ply', 'resource/entity/service/land/map.ply') && !match('m.mi', 'resource/map/multi/m1/m.mi') && !match('preview.dds', 'resource/map/multi/m1/preview.dds') && !match('tank.ply', 'resource/entity/veh/tank/tank.ply'), 'match: not service/land, not a mission, not a picture, not a model mesh');
  // the server's wide rule (2026-11-14 integration: the page claimed resource/map/1 while the server said hex): match uses any folder
  // under map/ but the bare multi and single, no '', '.' or '..' part; mapOf without wide (the info route's map field) stays multi|single
  ok(mapOf('resource/map/1/map.net', true) === 'map/1' && mapOf('resource/map/1/map.net') === null && match('map.net', 'resource/map/1/map.net') && match('map.ply', 'resource/map/1/map.ply'), 'server: resource/map/1 claimed (wide), no Maps page key [V GoH install listing]');
  ok(['resource/map/multi///map.net', 'resource/map/multi/./map.net', 'resource/map/multi/x/./map.net', 'resource/map/./x/map.net', 'resource/map//x/map.net', 'resource/map/single/map.ply', 'resource/map/map.net', 'resource/map/multi/map.net', 'resource/map/multi/../x/map.net'].every(k => !match(k.split('/').pop(), k) && mapOf(k, true) === null), 'server: empty, ., .. parts and bare multi/single not claimed');
  ok(mapOf('resource/map/multi.pak:\x3amulti/0_frontlines/1v1_mv/map.net') === 'map/multi/0_frontlines/1v1_mv' && mapOf('mods/x/resource/map/single.pak:\x3asingle/c1/m1/map.ply', true) === 'map/single/c1/m1' && match('map.net', 'resource/map/multi.pak:\x3amulti/m3/map.net') && mapOf('resource/map/multi.pak:\x3amulti/../x/map.net', true) === null && mapOf('resource/map/multi.pak:\x3amap.net', true) === null, 'server: a pak under resource/map/ counts from resource/map/ (GoH layout); .. entry and a file right under the pak folder not claimed');
  ok(JSON.stringify(grassNames(grs(['a', 'bb']))) === '["a","bb"]' && grassNames(Buffer.from('xx')) === null && grassNames(Buffer.from('NOTGRASS0000')) === null, 'grassNames: the names; short or another header -> null');

  // ---- info route
  const i1 = await info({ key: 'resource/map/multi/m1/map.grs' });
  ok(i1.map === 'map/multi/m1' && i1.file === 'grs' && JSON.stringify(i1.grass) === '["grass_a","grass_b","reed"]' && i1.size > 0, 'info: a game map.grs -> its map and grass names ' + JSON.stringify(i1));
  const i2 = await info({ key: 'resource/map/multi/m1/map.net' });
  ok(i2.map === 'map/multi/m1' && i2.file === 'net' && i2.grass === null, 'info: map.net -> its map, no grass');
  const i3 = await info({ rel: 'resource.pak:\x3amap/multi/m2/map.grs' });
  ok(i3.map === 'map/multi/m2' && JSON.stringify(i3.grass) === '["moss"]', 'info: an entry of the mod\'s resource.pak ' + JSON.stringify(i3));
  const i4 = await info({ key: 'resource/map/multi/m1/bad/map.grs' });
  ok(i4.grass === null && i4.map === 'map/multi/m1/bad', 'info: a bad grass header -> no names');
  let i5; try { i5 = await info({ rel: 'resource/map/multi.pak:\x3amulti/m3/map.grs' }); } catch (e) { i5 = { err: e.message }; }
  ok(i5.map === 'map/multi/m3' && JSON.stringify(i5.grass) === '["fern"]', 'info: an entry of the mod\'s resource/map/multi.pak (GoH layout) ' + JSON.stringify(i5));

  // ---- strings: the jump words in four languages, no TODO, no dash as a separator
  const row = k => ML.find(r => r[0] === k);
  ok(['view.map.toViewer', 'view.map.noViewer', 'view.map.none'].every(k => row(k) && row(k).slice(1).every(s => s && !/^TODO:/.test(s) && !/ - /.test(s))), 'strings: toViewer, noViewer, none in en, ru, uk, zh');
  ok(/\{key\}/.test(row('view.map.toViewer').slice(1).join('|')) && row('view.map.toViewer').slice(1).every(s => s.includes('{key}')), 'strings: toViewer names the map key in every language');
  ok(!/[A-Za-z]:[\\/]/.test(MC.script) && !/S\.gameId|'as64'|'mowas2'|'goh'/.test(MC.script), 'client: no drive path, no test of a game id (the same jump in every game)');

  // ---- the page script in a fake DOM, once per game
  // games: which pages the current game lists (page.js INGAME; groups.js: the Maps page is AS64 only, the Map Viewer is in all three)
  const fakedom = require('../../../test/fakedom');
  const L = {}; for (const r of require('../lang').concat(ML)) L[r[0]] = r[1];
  const GAMES = { as64: { maps: 1, mapviz: 1, ide: 1 }, mowas2: { mapviz: 1, ide: 1 }, goh: { mapviz: 1, ide: 1 } };
  // page(target, o): o.ingame = the INGAME table (default GAMES[target]); o.s6 = the shell screen has pick(key); o.noViewer = no mapviz page built
  const page = (target, o) => {
    o = o || {};
    const doc = fakedom.make(), timers = [], R = { toasts: [], shown: [], picks: [], vpicks: [], asked: [] };
    const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1') };
    box.window = box;
    const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
    const tx = (k, pp) => { let s = L[k] || k; if (pp) s = s.replace(/\{(\w+)\}/g, (mm, x) => (pp[x] == null ? mm : String(pp[x]))); return s; };
    const api = u => { R.asked.push(u); return u.startsWith('/api/x/view/map/info') ? Promise.resolve({ map: 'map/multi/mv_fixture', file: 'grs', grass: ['grass_a', 'reed'] }) : Promise.reject(new Error('unknown ' + u)); };
    const sec = { ide: {}, maps: {} }; if (!o.noViewer) sec.mapviz = {};
    const screens = { maps: { pick(k, e) { R.picks.push([k, e]); } } };
    if (!o.noViewer) screens.mapviz = o.s6 ? { refresh() {}, pick(k) { R.vpicks.push([k, box.S.mapKey, R.shown.length]); } } : { refresh() {} };
    // o.S: a page S of the caller's (the real shell's screen in S.screens.mapviz); show() then works as page.js: S.cur, refresh
    const S = o.S || { mod: 'mods/mine', gameId: target, sec, screens };
    if (o.S) S.screens.maps = screens.maps;
    const show = id => { R.shown.push(id); if (o.S) { S.cur = id; const sc = S.screens[id]; if (sc && sc.refresh) sc.refresh(); } };
    Object.assign(box, { h, tx, api, S, INGAME: o.ingame === undefined ? GAMES[target] : o.ingame, show, toast(t) { R.toasts.push(t); } });
    vm.createContext(box);
    const hexStub = "VIEW.reg('hex',{where:'tab',label:'view.hex.label',exts:[],open:function(){return {}}});";
    vm.runInContext(require('../client').script('') + '\n' + hexStub + '\n' + MC.script, box, { filename: 'map-script' });
    const flush = async () => { for (let i = 0; i < 6; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
    const clear = () => { for (const k of Object.keys(R)) R[k].length = 0; box.IDE_PENDING = null; delete S.mapKey; };
    return { V: box.VIEW, box, S, R, flush, clear };
  };
  const KEY = 'multi/mv_fixture', FILE = f => 'resource/map/' + KEY + '/' + f;
  const viewerTo = (P, key, m) => {
    ok(P.R.shown.join() === 'mapviz' && P.S.mapKey === 'map/' + key && !P.R.picks.length, m + ': the Map Viewer, S.mapKey map/' + key + ' (' + P.R.shown.join() + ' ' + P.S.mapKey + ')');
    ok(P.R.toasts.length === 1 && P.R.toasts[0] === L['view.map.toViewer'].replace('{key}', key), m + ': said with the map key ' + JSON.stringify(P.R.toasts));
  };

  for (const target of ['as64', 'mowas2', 'goh']) {
    const P = page(target), V = P.V;
    ok(V.kindOf('map.net', FILE('map.net')) === 'map' && V.kindOf('map.ply', FILE('map.ply')) === 'map' && V.kindOf('map.grs', FILE('map.grs')) === 'map', target + ' page table: map.net, map.ply, map.grs of a map folder -> map');
    // .net and .ply: the Map Viewer in every game
    for (const f of ['map.net', 'map.ply']) {
      P.clear(); const r = V.open({ key: FILE(f) }, f); await P.flush();
      ok(r === true && !P.R.asked.length, target + ' ' + f + ': claimed, no info call');
      viewerTo(P, KEY, target + ' ' + f);
    }
    // .grs: the Maps page with the grass card where this game has it (AS64), else the Map Viewer
    P.clear(); V.open({ key: FILE('map.grs') }, 'map.grs'); await P.flush();
    if (GAMES[target].maps) ok(P.R.shown.join() === 'maps' && P.R.picks.length === 1 && P.R.picks[0][0] === 'map/' + KEY && P.R.picks[0][1].lines.join(' ').includes('grass_a, reed'), target + ' map.grs: the Maps page, the map picked, the grass card ' + JSON.stringify(P.R.picks));
    else viewerTo(P, KEY, target + ' map.grs (no Maps page)');
    // not claimed: outside a map folder, a '..' path (seeded defect), map/ without a folder, a mission file
    // and empty or '.' folder parts (fault of the 2026-11-14 check: they gave keys 'multi//', 'multi/.', 'multi/x/.')
    for (const k of ['resource/entity/service/land/map.ply', 'resource/map/multi/../x/map.net', 'resource/map/multi/map.net', 'resource/map/map.net', 'resource/map/multi/' + 'mv_fixture/m.mi',
      'resource/map/multi///map.net', 'resource/map/multi/./map.net', 'resource/map/multi/x/./map.net', 'resource/map/./x/map.net', 'resource/map//x/map.net', 'resource/map/single/map.ply']) {
      P.clear(); V.open({ key: k }, k.split('/').pop()); await P.flush();
      ok(V.kindOf(k.split('/').pop(), k) !== 'map' && !P.R.shown.includes('mapviz') && !P.R.shown.includes('maps') && !P.S.mapKey, target + ' not claimed: ' + k);
    }
    // VIEW.mapGo (explorer "Show in Maps"): the Maps page where it is, else the Map Viewer; any file of a map folder
    P.clear(); ok(V.mapGo({ key: FILE('m.mi') }, 'm.mi') === true && !P.R.asked.length, target + ' mapGo: a mission file jumps');
    if (GAMES[target].maps) ok(P.R.shown.join() === 'maps' && P.R.picks[0][0] === 'map/' + KEY, target + ' mapGo: the Maps page');
    else viewerTo(P, KEY, target + ' mapGo');
    // VIEW.mapViewGo: always the Map Viewer
    P.clear(); ok(V.mapViewGo({ key: FILE('m.mi') }, 'm.mi') === true, target + ' mapViewGo: jumps');
    viewerTo(P, KEY, target + ' mapViewGo');
    P.clear(); ok(V.mapGo({ key: 'resource/set/x.set' }, 'x.set') === false && V.mapViewGo({ key: 'resource/set/x.set' }, 'x.set') === false && P.R.toasts.length === 2 && P.R.toasts[0] === L['view.map.none'].replace('{name}', 'x.set') && !P.R.shown.length, target + ' mapGo, mapViewGo outside a map folder: said, no jump');
    // a single mission and a deep multiplayer folder keep their whole key
    P.clear(); V.open({ key: 'resource/map/single/c1/m3/map.net' }, 'map.net'); await P.flush();
    viewerTo(P, 'single/c1/m3', target + ' single mission');
    // the shell's pick request (S6) when the screen has one: after show, with the same key S.mapKey already holds
    const P6 = page(target, { s6: true }); P6.V.open({ key: FILE('map.ply') }, 'map.ply'); await P6.flush();
    // (the pick goes before show with S.mapKey blanked, so show's refresh does not open it as no pick of the user's; this stub
    // has no V, so a second pick follows the show; S.mapKey = the map at the end). The real shell is run further down.
    ok(P6.R.vpicks.length === 2 && P6.R.vpicks.every(v => v[0] === KEY) && P6.R.vpicks[0][1] === '' && P6.R.vpicks[0][2] === 0 && P6.R.vpicks[1][2] === 1 && P6.S.mapKey === 'map/' + KEY && P6.R.shown.join() === 'mapviz', target + ' S6: pick(key) before show with S.mapKey blanked, again after show, S.mapKey set at the end ' + JSON.stringify(P6.R.vpicks));
    // a map folder outside multi/ and single/ (GoH ships resource/map/1 [V GoH install listing]): the Map Viewer lists it
    // as key '1' (mapkit source.js), so the file viewer opens it there in every game; the Maps page form (VIEW.mapOf) stays null
    P.clear(); ok(V.kindOf('map.net', 'resource/map/1/map.net') === 'map' && V.kindOf('map.ply', 'resource/map/1/map.ply') === 'map' && V.mapOf('resource/map/1/map.net') === null, target + ' resource/map/1: claimed, no Maps page key');
    V.open({ key: 'resource/map/1/map.net' }, 'map.net'); await P.flush();
    viewerTo(P, '1', target + ' resource/map/1/map.net');
    P.clear(); ok(V.mapGo({ key: 'resource/map/1/test.mi' }, 'test.mi') === true && !P.R.picks.length, target + ' mapGo resource/map/1: never the Maps page');
    viewerTo(P, '1', target + ' mapGo resource/map/1');
    // the server's match and the page's claim agree on every path (so /api/x/view/info and the page give the same kind)
    {
      const PATHS = [FILE('map.net'), FILE('map.ply'), FILE('map.grs'), FILE('m.mi'), 'resource/map/1/map.net', 'resource/map/1/map.ply', 'resource/map/single/c1/m3/map.net',
        'resource/map/multi/0_frontlines/1v1_mv/map.net', 'resource/entity/service/land/map.ply', 'resource/map/multi/map.net', 'resource/map/multi///map.net', 'resource/map/multi/./map.net',
        'resource/map/./x/map.net', 'resource/map//x/map.net', 'resource/map/multi/../x/map.net', 'resource/map/single/map.ply', 'resource.pak:\x3amap/multi/m2/map.grs',
        'resource/map/multi.pak:\x3amulti/m3/map.net', 'resource/map/multi.pak:\x3amap.net'];
      const diff = PATHS.filter(k => (V.kindOf(k.split('/').pop().split('::').pop(), k) === 'map') !== match(k.split('/').pop().split('::').pop(), k));
      ok(!diff.length, target + ' server match and page claim agree ' + diff.join());
    }
    // no Map Viewer page in this game: the Maps page where it is, else said and the bytes tab
    const PN = page(target, { noViewer: true }); PN.V.open({ key: FILE('map.net') }, 'map.net'); await PN.flush();
    if (GAMES[target].maps) ok(PN.R.shown.join() === 'maps' && PN.R.picks.length === 1, target + ' no Map Viewer: map.net goes to the Maps page');
    else ok(!PN.R.shown.includes('mapviz') && !PN.R.shown.includes('maps') && PN.box.IDE_PENDING && PN.box.IDE_PENDING[0].view === 'hex' && PN.R.toasts[0] === L['view.map.noViewer'], target + ' no Map Viewer: said, the bytes tab ' + JSON.stringify(PN.R));
    PN.clear(); ok(PN.V.mapViewGo({ key: FILE('map.net') }, 'map.net') === false && PN.R.toasts[0] === L['view.map.noViewer'] && !PN.R.shown.length, target + ' no Map Viewer: mapViewGo said, no jump');
  }

  // a page built but not in this game (INGAME without it): no jump that would switch the game
  const PX = page('mowas2', { ingame: { ide: 1 } }); PX.V.open({ key: FILE('map.net') }, 'map.net'); await PX.flush();
  ok(!PX.R.shown.includes('maps') && !PX.R.shown.includes('mapviz') && PX.R.toasts[0] === L['view.map.noViewer'], 'a page of another game is not used (no game switch)');
  // no INGAME table (an older page): S.sec alone decides
  const PO = page('as64', { ingame: null }); PO.V.open({ key: FILE('map.net') }, 'map.net'); await PO.flush();
  viewerTo(PO, KEY, 'no INGAME table');

  // Gates of Hell layout: maps sit in resource/map/multi.pak (entries multi/<folder>/map.net) and frontline maps one level deeper;
  // the vfs key is the same form, and a mod's own pak counts from the folder it sits in
  const G = page('goh'), GV = G.V;
  ok(GV.mapOf('resource/map/multi/0_frontlines/1v1_mv/map.net') === 'map/multi/0_frontlines/1v1_mv', 'goh: a frontline map key keeps its two folders');
  ok(GV.mapOf('resource/map/multi.pak:\x3amulti/0_frontlines/1v1_mv/map.net') === 'map/multi/0_frontlines/1v1_mv' && GV.mapOf('mods/x/resource/map/single.pak:\x3asingle/c1/m1/map.ply') === 'map/single/c1/m1', 'goh: a pak under resource/map/ counts from resource/map/');
  ok(GV.mapOf('resource.pak:\x3amap/multi/m2/map.grs') === 'map/multi/m2' && GV.mapOf('resource/map/multi.pak:\x3amulti/../x/map.net') === null && GV.mapOf('resource/map/multi.pak:\x3amap.net') === null, 'pak entries: resource.pak from resource/; a .. entry and a file right under the pak folder not claimed');
  G.clear(); GV.open({ rel: 'resource/map/multi.pak:\x3amulti/0_frontlines/1v1_mv/map.net' }, 'map.net', { kind: 'map' }); await G.flush();
  viewerTo(G, 'multi/0_frontlines/1v1_mv', 'goh: a map.net inside the mod\'s map pak');

  // ---- the real Map Viewer shell (mapviz/sub/shell.client.js, its own test harness): a map opened from a file is the user's
  // pick, so a map not read yet starts the read job (POST job) at once, as a pick from the Map Viewer list does. Fault of the
  // 2026-11-14 check: S.mapKey + show + pick made the shell's refresh open it as no pick (user false), the pick of the same
  // key was then not redone, and the page said 'not read yet' with a Read button. Run once per game and per page state.
  {
    const SH = require('../../mapviz/sub/shell.test.js').harness, SC = require('../../mapviz/sub/shell.client'), SL = SH.mergeLang([require('../../mapviz/sub/shell.lang.json')]);
    const PAL = require('../../../../mapviz/palette.json');
    const need = async () => { throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'doc', args: { map: KEY } } } }); };
    const shellPage = (target, calls, script) => {
      const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
        'GET /api/x/mapviz/doc': need, 'POST /api/x/mapviz/job': async () => ({ id: 'j1', shared: false, state: 'queued', queue: 0 }),
        'GET /api/x/mapviz/job': async () => ({ id: 'j1', what: 'doc', state: 'done', stage: '', done: 1, total: 1, queue: 0 }) };
      const S = { gameId: target, gameOv: '', mod: '', mapKey: '', cur: 'ide', sec: { ide: {} }, screens: {} };
      const SPg = SH.mkPage({ scripts: [script || SC], lang: SL, S, canvas: true, api: SH.routeApi(routes, calls) });
      S.sec.mapviz = SPg.root; S.screens.mapviz = SPg.screen;
      return { S, SPg };
    };
    const jobs = (calls, from) => calls.slice(from).filter(c => c.method === 'POST' && c.path === '/api/x/mapviz/job').length;
    // states: fresh (never shown); shown (shown once, then another page); mapKey (S.mapKey of the map already set, as the Maps
    // page's choose() does, then shown and hidden); unread (that map already open and not read: Read button shown); ctx (the mod
    // changed while hidden, no refresh yet)
    const prep = async (st, S, SPg) => {
      if (st === 'fresh') return;
      if (st === 'mapKey' || st === 'unread') S.mapKey = 'map/' + KEY;
      if (st !== 'mapKey') { S.cur = 'mapviz'; SPg.screen.refresh(); await SH.flush(); S.cur = 'ide'; }
      if (st === 'mapKey') { S.cur = 'mapviz'; S.mapKey = ''; SPg.screen.refresh(); await SH.flush(); S.cur = 'ide'; S.mapKey = 'map/' + KEY; }
      if (st === 'ctx') S.mod = 'mods/other';
    };
    for (const target of ['as64', 'mowas2', 'goh']) for (const st of ['fresh', 'shown', 'mapKey', 'unread', 'ctx']) for (const via of ['net', 'viewGo']) {
      const calls = [], { S, SPg } = shellPage(target, calls);
      await prep(st, S, SPg);
      if (st === 'unread') ok(SPg.V.q('map') === KEY && !SPg.V.doc && !jobs(calls, 0), target + ' ' + st + ': the map is open, not read, no job yet');
      const PR = page(target, { S }), c0 = calls.length;
      if (via === 'net') PR.V.open({ key: FILE('map.net') }, 'map.net'); else PR.V.mapViewGo({ key: FILE('m.mi') }, 'm.mi');
      await SH.flush(60);
      ok(PR.R.shown.join() === 'mapviz' && SPg.V.q('map') === KEY && S.mapKey === 'map/' + KEY && jobs(calls, c0) === 1, target + ' ' + st + ' ' + via + ': the map opened as the user\'s pick, the read job started ' + JSON.stringify([PR.R.shown, SPg.V.q('map'), S.mapKey, calls.slice(c0).map(c => c.method + ' ' + c.path)]));
    }
    // the old order (S.mapKey, show, then pick): since 157b87d13 the shell itself reads the map again as the user's pick when the
    // pick names the map a refresh is reading (setMap: user && !was), so the old order starts the job too. The harness must still
    // see the 2026-11-14 fault: it is seeded back into a copy of the shell (setMap without that re-pick term) and the old order
    // then starts no read job.
    const oldOrder = async script => {
      const calls = [], { S, SPg } = shellPage('mowas2', calls, script);
      await prep('shown', S, SPg); const c0 = calls.length;
      S.mapKey = 'map/' + KEY; S.cur = 'mapviz'; SPg.screen.refresh(); SPg.screen.pick(KEY); await SH.flush(60);
      return jobs(calls, c0);
    };
    ok(await oldOrder() === 1, 'the real shell: the old order starts the read job as well (the shell reads a re-picked map as the user\'s pick)');
    {
      const FIX = '!(same&&docBusy&&!(user&&!was))', BAD = SC.replace(FIX, '!(same&&docBusy)');
      ok(BAD !== SC, 'seed applies: shell setMap still holds the re-pick term ' + FIX);
      if (BAD !== SC) ok(await oldOrder(BAD) === 0, 'seeded defect seen: with the re-pick term taken out of the shell, the old order starts no read job');
    }
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind map ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });

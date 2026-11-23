// crash rules with no other home (T-CRASH): static reads of the mod (loose + its paks), deps and game for three known crashes.
//   crashRules(folder, game, deps, rep) adds to rep (lib/report). Codes start with CRASH_ so lib/registry severity() ranks them crash.
//   CRASH_OBSTACLE_UNKNOWN  {obstacleID "x"} in an entity file, x not a block of set/registry/obstacles.reg (the mod's, else a dep's, else the
//                           game's). FindObstacleId gives 0xff (exact case), GetObstacleDesc(0xff)
//                           reads past the table (:340), dies once a crusher
//                           meets it (STR-29) [V]
//   CRASH_TERRAIN_LAYERS map .mtl with {layer} blocks, not exactly 2: reads layers[1] unchecked
// crash at the first crater (MAP-29) [V; >2 layers: [I] only 2 read]
//   CRASH_FLAG_CLIPS        captureflag.mi in a map folder whose map {Clips} has no captureflaga or captureflagb: null clipper at start,
//                           `Clipper 'captureflaga' is not found!` (MIS-62) [V]
// not read: obstacleID set via macro or (include) outside entity/*.def|.inc|.ext; .materials (GoH) files; clip names in an (include).
// Author: Imperator_Aug (ARSENAL, ia-20a0ba51)
const fs = require('fs'), path = require('path'), pak = require('../lib/pak');

// one layer of files: loose dir + paks (later pak wins: N.pat by number above resource.pak). key = path under resource/, lowercase
function layer(root, res, paks) {
  const files = new Map();
  const walk = (d, rel) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(p, r); else if (!/\.(pak|pat)$/i.test(e.name) || rel) files.set(r.toLowerCase(), { show: p, get: () => fs.readFileSync(p) }); } };
  const rank = f => { const m = /^(\d+)\.pat$/i.exec(path.basename(f)); return m ? +m[1] : 0; };
  for (const f of paks.sort((a, b) => rank(a) - rank(b))) {
    let ents; try { ents = pak.list(f); } catch { continue; }
    for (const e of ents) if (!e.name.endsWith('/')) files.set(e.name.toLowerCase(), { show: `${path.basename(f)}:${e.name}`, get: () => pak.read(ents, e) });
  }
  // loose beats the mod's own paks [I, as check/fix treat it]
  if (fs.existsSync(res)) walk(res, '');
  return { root, files };
}
const modLayer = dir => layer(dir, path.join(dir, 'resource'), fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(pak|pat)$/i.test(f)).map(f => path.join(dir, f)) : []);
const gameLayer = g => { const r = path.join(g, 'resource'); return layer(g, r, fs.existsSync(r) ? fs.readdirSync(r).filter(f => /\.pak$/i.test(f)).map(f => path.join(r, f)) : []); };

// SDL text -> top-level-in-parent block names: [{name, depth, at}] (depth 1 = root block). strings and ; // comments skipped
function blocks(t) {
  const out = []; let d = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') { i = t.indexOf('"', i + 1); if (i < 0) break; continue; }
    if (c === ';' || (c === '/' && t[i + 1] === '/')) { const n = t.indexOf('\n', i); if (n < 0) break; i = n; continue; }
    if (c === '{') { d++; const m = /^\s*("([^"]*)"|[^\s{}"()]+)/.exec(t.slice(i + 1, i + 200)); out.push({ name: m ? (m[2] !== undefined ? m[2] : m[1]) : '', depth: d, at: i }); }
    else if (c === '}') d--;
  }
  return out;
}
const lineAt = (t, i) => t.slice(0, i).split('\n').length;
const blockText = (t, at) => { let d = 0; for (let i = at; i < t.length; i++) { if (t[i] === '"') { i = t.indexOf('"', i + 1); if (i < 0) break; continue; } if (t[i] === '{') d++; else if (t[i] === '}' && --d === 0) return t.slice(at, i + 1); } return t.slice(at); };

function crashRules(folder, game, deps, rep) {
  const own = modLayer(folder);
  const others = [...(deps || []).map(m => m === 'as64+' ? path.join(game, 'as64', 'plus') : path.join(game, 'mods', m)).filter(d => path.resolve(d).toLowerCase() !== path.resolve(folder).toLowerCase()).reverse().map(modLayer), ...(game ? [gameLayer(game)] : [])];
  const find = key => { for (const L of [own, ...others]) { const f = L.files.get(key); if (f) return f; } return null; };
  const txt = f => f.get().toString('latin1');
  const show = f => f.show.startsWith(folder) ? path.relative(folder, f.show).replace(/\\/g, '/') : f.show.replace(/\\/g, '/');

  // STR-29: obstacleID names
  const uses = [];
  for (const [k, f] of own.files) {
    if (!/^entity\/.*\.(def|inc|ext)$/.test(k)) continue;
    const t = txt(f), re = /\{\s*obstacleID\s+"?([^"\s{}]+)"?/gi; let m;
    while ((m = re.exec(t))) uses.push({ f, name: m[1], line: lineAt(t, m.index) });
  }
  if (uses.length) {
    const reg = find('set/registry/obstacles.reg');
    if (reg) {
      const t = txt(reg), bs = blocks(t), root = bs.find(b => b.depth === 1 && b.name.toLowerCase() === 'obstacles');
      const names = new Set(root ? bs.filter(b => b.depth === 2 && b.at > root.at).map(b => b.name) : []);
      for (const u of uses) if (!names.has(u.name)) rep.add(show(u.f), u.line, 'CRASH_OBSTACLE_UNKNOWN', `obstacleID "${u.name}" is not in ${show(reg)} (names are case-sensitive): id 0xff, the game crashes when a crusher (tank) meets this object (Can_Crush, STR-29). Fix: add a {${u.name} ...} block to the mod's resource/set/registry/obstacles.reg (copy the nearest vanilla row) or use a listed name`);
    } else rep.info('resource/set/registry/obstacles.reg', 0, 'CRASH_OBSTACLE_NO_TABLE', `obstacleID used ${uses.length}x but no obstacles.reg found in the mod, its deps or the game: names not checked`);
  }

  // MAP-29: terrain material layers; MIS-62: captureflag clips
  for (const [k, f] of own.files) {
    if (/^map\/.*\.mtl$/.test(k)) {
      const t = txt(f), bs = blocks(t), root = bs.find(b => b.depth === 1);
      if (!root || root.name.toLowerCase() !== 'material') continue;
      const n = bs.filter(b => b.depth === 2 && b.name.toLowerCase() === 'layer').length;
      if (n && n !== 2) rep.add(show(f), lineAt(t, root.at), 'CRASH_TERRAIN_LAYERS', `terrain material has ${n} {layer} block(s), the engine needs exactly 2: the map loads, then the game crashes at the first crater (MAP-29). Fix: add a second {layer} (a copy of the first works)`);
    }
    const cm = /^(map\/.+\/)captureflag\.mi$/.exec(k);
    if (cm) {
      const mf = find(cm[1] + 'map');
      if (!mf) continue;   // no map file anywhere: milint's MAP_ rows say so
      const t = txt(mf), clips = blocks(t).find(b => b.depth === 2 && b.name.toLowerCase() === 'clips');
      const names = new Set(clips ? blocks(blockText(t, clips.at)).filter(b => b.depth === 2).map(b => b.name) : []);
      const miss = ['captureflaga', 'captureflagb'].filter(c => !names.has(c));
      if (miss.length) rep.add(show(f), 0, 'CRASH_FLAG_CLIPS', `captureflag mode, but the map (${show(mf)}) has no ${miss.join(' / ')} in {Clips}: the game crashes at match start ("Clipper '${miss[0]}' is not found!", MIS-62). Fix: add both clips to the map's {Clips} (copy from a map that has them) or drop captureflag.mi`);
    }
  }
  layoutRules(folder, own, rep, show);
}

// MIXB (static, no game): TST-87 / TST-94 / TST-95
//   MOD_ROOT_DATA_UNMOUNTED set/ or entity/ folder directly in the mod root: only resource/ and localization/ are mounted, the files never load (TST-87) [V]
//   WARN_UNITS_SET_STOCK_INCLUDES  set/multiplayer/units/{common,gameType,gameClass}.set in the mod without (include "soldiers.set"/"squads.set"/"vehicles.set"):
//                            the engine loads only the first of these files, so it replaces the stock unit list whole (TST-94) [V, T game]
//   WARN_ARMY_RANK_LEVEL armies/<name>.set with {id 6..99} and a unit card s(<name>) with {level N>1}: rank lookup for ids over 5 unknown (TST-95) [V, T game]
const STOCK_INC = ['soldiers.set', 'squads.set', 'vehicles.set'];
const stripSdl = t => t.replace(/\r/g, '').replace(/"[^"\n]*"|;[^\n]*|\/\/[^\n]*/g, m => m[0] === '"' ? m : '');
function layoutRules(folder, own, rep, show0) {
  const fw = s => path.resolve(s).replace(/\\/g, '/'), root = fw(folder) + '/';
  const show = f => { const p = f.show.replace(/\\/g, '/'); return p.toLowerCase().startsWith(root.toLowerCase()) ? p.slice(root.length) : show0(f); };
  let top = []; try { top = fs.readdirSync(folder, { withFileTypes: true }); } catch { /* none */ }
  for (const e of top.sort((a, b) => a.name < b.name ? -1 : 1)) if (e.isDirectory() && /^(set|entity)$/i.test(e.name))
    rep.add(e.name + '/', 0, 'MOD_ROOT_DATA_UNMOUNTED', `folder "${e.name}/" sits in the mod root: the game mounts only resource/ and localization/, so its files are never loaded. Fix: move it to resource/${e.name.toLowerCase()}/ (TST-87)`);
  const U = 'set/multiplayer/units/';
  for (const [k, f] of own.files) {
    if (k.startsWith(U) && /^(common|gametype|gameclass)\.set$/.test(k.slice(U.length))) {
      const t = stripSdl(f.get().toString('latin1')), inc = new Set();
      let m; const re = /\(\s*include\s+"([^"]+)"\s*\)/gi; while ((m = re.exec(t))) inc.add(m[1].toLowerCase());
      const miss = STOCK_INC.filter(s => !inc.has(s));
      if (miss.length) rep.add(show(f), 0, 'WARN_UNITS_SET_STOCK_INCLUDES', `${path.basename(k)} replaces the stock unit list whole (the engine loads only the first of gameType/gameClass/common .set) and lacks (include "${miss.join('") / (include "')}"): stock units vanish from the buy list. Fix: re-list the three stock includes, then add your own include (TST-94)`);
    }
  }
  const ids = new Map();   // army name -> id 6..99
  for (const [k, f] of own.files) {
    const m = /^set\/multiplayer\/armies\/([^/]+)\.set$/.exec(k); if (!m) continue;
    const im = /\{\s*id\s+(\d+)\s*\}/.exec(stripSdl(f.get().toString('latin1')));
    if (im && +im[1] >= 6 && +im[1] <= 99) ids.set(m[1], { id: +im[1], f });
  }
  if (!ids.size) return;
  for (const [k, f] of own.files) {
    if (!(k.startsWith(U) && k.endsWith('.set'))) continue;
    const lines = stripSdl(f.get().toString('latin1')).split('\n'), seen = new Set();
    lines.forEach((ln, i) => {
      const a = /\bs\(\s*([^)\s]+)[^)]*\)/.exec(ln), l = /\{\s*level\s+(\d+)\s*\}/.exec(ln);
      if (!a || !l || +l[1] <= 1) return;
      const army = ids.get(a[1]); if (!army || seen.has(a[1])) return;
      seen.add(a[1]);
      rep.add(show(f), i + 1, 'WARN_ARMY_RANK_LEVEL', `unit card with level ${l[1]} for army "${a[1]}" (id ${army.id}, ${show(army.f)}): rank lookup for army ids over 5 is unknown, the card may never unlock. Fix: use {level 1} for cards of new armies (TST-95)`);
    });
  }
}
module.exports = { crashRules, blocks };

#!/usr/bin/env node
// map-clone: copy a map folder under a new name, terrain (map.net, map.ply, textures) byte-identical. rows MAP-01 MIS-24 (see REPORT.json)
//   node tools/map-clone/map-clone.js [--game G] --map map/multi/<m> --name <new> --out <mod> [--target as64|mowas2|goh | --exe as64|mowas_2|goh] [--plan]
// source = G/resource loose files + every *.pak under G/resource (AS2: map.pak, map_dlc_*.pak; GoH: any). Same game only: map.net first
//   2 bytes are cell size + version: AS2 `0a 02`, GoH `05 02` (mapnet.js). --target names the game the clone is for; a net of the other game is refused.
// Name refs: in text files (.mi .info .mtl .set .lua .txt + extensionless `map`) `map/multi/.../<old>` paths and exact `"<old>"` strings
//   become <new>; binaries are never edited, only reported when they contain the old name. Adds localization/mission/multi/<new>.lng with the
//   source's display name (AS2: localization.pak mission.lng {tags {multi {<old> {name ..}}}}). --target goh (or a GoH net with no --target):
//   localizations/default/interface/text/mission/<multi>/<new>.pot, msgctxt "mission/multi/<new>/name", msgid "[clone] <vanilla name>" read
//   from G/localizations/default.pak default/interface/text/mission.pot (GHLOC-01, GHLOC-06) [I shape, lobby display [T]].
//   GoH mod.info: Min = Max = the exe version of G (binaries/x64/call_to_arms.exe, 1.067 scale, GHNET-22, PORT-46); unreadable ->
//   WARN_MAPCLONE_GOH_VERSION and no range. GoH --out inside the GoH install: MAPCLONE_OUT_REFUSED (lib/writeguard), nothing written.
// codes: MAPCLONE_NO_MAP MAPCLONE_NO_NET MAPCLONE_GAME_MISMATCH MAPCLONE_NAME_EXISTS MAPCLONE_BAD_NAME MAPCLONE_OUT_EXISTS MAPCLONE_NET_PROBLEM
//   --mods a,b (ids under G/mods, last wins) / --mod <dir> (repeatable): source map may live in a mod
//   --no-mission: skip root *.mi files (combat.mi etc.), so edrun --map can host its own mission on the clone
//   --only-mode M (C2c): copy only mode M's root M.mi/M.info (other modes' .mi/.info skipped, MAPCLONE_MODE_SKIPPED); MAPCLONE_NO_MODE if no M.mi
//   WARN_MAPCLONE_INCLUDE_MISSING (C2c, CHAIN-T): a copied root .mi whose (include "..") resolves in none of clone, game, --mods/--mod, --out:
//   the engine stops the map load when that mode is picked (milint INCLUDE_MISSING); one warning per mode, all its missing includes
//   mod.info (Name, Desc, version range per --target) is written to --out unless --no-modinfo; --game-version min[,max] sets the range
//   for any target (GoH: the exe's own version without it). With no --target: as64 if --game holds as64.exe, else mowas2 3.262.x (T-CLONEFIX)
//   info: MAPCLONE_LOC_KEY (lobby key, proven by source) MAPCLONE_MODINFO MAPCLONE_REF_CHANGED MAPCLONE_BINARY_REF MAPCLONE_LOC_ADDED MAPCLONE_COPIED
// Author: Imperator_Aug (ARSENAL, ia-2795c646)
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset'), pak = require('../lib/pak'), mapnet = require('../lib/mapnet'), sdl = require('../lib/sdl');
const { createReport } = require('../lib/report');

const a = process.argv.slice(2);
const USAGE = 'usage: ARSENAL map-clone [--game G] --map map/multi/<m> --name <new> --out <mod> [--target|--exe as64|mowas2|goh] [--plan] [--no-modinfo] [--no-mission] [--only-mode M] [--mods a,b] [--mod dir] [--game-version min[,max]]';
if (a.includes('--help') || a.includes('-h')) { console.log(USAGE); process.exit(0); }
const opt = k => { const i = a.indexOf('--' + k); return i < 0 ? null : a[i + 1]; };
// --exe as64|mowas_2|mowas2|goh (the common game word, game parity): same as --target when no --target is given; unknown -> MAPCLONE_BAD_NAME below.
// No --game with --target/--exe: the install of that game (lib/games install: the AS2 install, or the GoH install for goh)
const games = require('../lib/games');
const target = opt('target') || (opt('exe') ? (games.idOf(opt('exe')) || opt('exe')) : null);
const game = opt('game') || (target && games.get(target) ? games.install(target).dir : null), mapArg = opt('map'), name = opt('name'), out = opt('out'), plan = a.includes('--plan'), noModinfo = a.includes('--no-modinfo'), noMission = a.includes('--no-mission'), gameVer = opt('game-version'), onlyMode = (opt('only-mode') || '').toLowerCase().replace(/\.mi$/, '');
if (!game || !mapArg || !name || !out) { console.error(USAGE); process.exit(2); }
const rep = createReport();
const fin = () => { rep.print({ showInfo: !a.includes('-q') }); process.exit(rep.count ? 1 : 0); };
const TEXT = /\.(mi|info|mtl|set|lua|txt)$/i;
// the msgid of the .pot entry whose msgctxt is key (case-blind), continuation lines joined; null when absent
function potText(t, key) {
  const un = s => s.replace(/\\(["\\nt])/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  const lines = t.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^msgctxt\s+"(.*)"\s*$/.exec(lines[i]);
    if (!m || un(m[1]).toLowerCase() !== key.toLowerCase()) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const id = /^msgid\s+"(.*)"\s*$/.exec(lines[j]);
      if (!id) continue;
      let s = un(id[1]);
      for (let k = j + 1; k < lines.length && /^"(.*)"\s*$/.test(lines[k]); k++) s += un(/^"(.*)"\s*$/.exec(lines[k])[1]);
      return s || null;
    }
  }
  return null;
}
// GoH exe version on the GoH mod.info scale: PE "1.0.6.7-..." -> 1.067 (as tools/modmove/lib/common dataVersion, PORT-46, GHNET-22)
function gohVersion(dir) {
  const exe = path.join(dir, 'binaries', 'x64', 'call_to_arms.exe');
  if (!fs.existsSync(exe)) return null;
  let pe = null; try { pe = require('../lib/gamever').peVersion(exe); } catch (e) { pe = null; }
  const m = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe);
  return m ? m[1] + '.' + m[2] + m[3] + m[4] : null;
}

const mapKey = mapArg.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
const parts = mapKey.split('/'), old = parts[parts.length - 1], parent = parts.slice(0, -1).join('/');
if (!/^[a-z0-9_]+$/i.test(name)) { rep.add(name, 0, 'MAPCLONE_BAD_NAME', 'name must be [A-Za-z0-9_]+ (it becomes a folder and a loc key)'); fin(); }
if (gameVer && !/^\d+(\.\d+)*(,\d+(\.\d+)*)?$/.test(gameVer)) { rep.add(gameVer, 0, 'MAPCLONE_BAD_NAME', '--game-version is min or min,max: digits and dots (3.301, 1.067,1.069)'); fin(); }
if (!/^map\//.test(mapKey) || parts.length < 3) { rep.add(mapArg, 0, 'MAPCLONE_NO_MAP', '--map must look like map/multi/<name>'); fin(); }
const newKey = parent + '/' + name.toLowerCase();

// ---- source files: Map rel(lower, under map dir) -> {name (orig case), read()} ----
const R = path.join(game, 'resource'), src = new Map(), taken = new Set(), pakKeys = new Set(), modDirs = [];   // pakKeys/modDirs: include check
const addLoose = (d, base) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) addLoose(p, base + e.name.toLowerCase() + '/');
    else { const k = base + e.name.toLowerCase(); if (!src.has(k)) src.set(k, { name: e.name, read: () => fs.readFileSync(p) }); }
  }
};
// a map that lives in a mod (chain-n: B9 maps in mods/b9m_t): --mod <dir> (any mod folder, repeatable, first wins) and --mods a,b
// (ids under G/mods, last listed wins like a mod stack). Read straight from each mod folder (loose, then its paks), no version/mode
// gate: lib/vfs skips as64 Enhanced mods unless as64+ is listed, which only matters for loading, not for copying files.
const addMod = d => {
  addLoose(path.join(d, 'resource', ...mapKey.split('/')), '');
  modDirs.push(d);
  const mp = pakset.open(path.join(d, 'resource'), null);
  for (const e of mp.entries) {
    pakKeys.add(e.key);
    if (e.key.startsWith(newKey + '/')) taken.add(e.key);
    if (!e.key.startsWith(mapKey + '/')) continue;
    const k = e.key.slice(mapKey.length + 1);
    if (k && !src.has(k)) src.set(k, { name: e.name.slice(e.name.lastIndexOf('/') + 1), read: () => pakset.read(e) });
  }
};
for (let i = 0; i < a.length; i++) if (a[i] === '--mod' && a[i + 1]) addMod(a[i + 1]);
const modIds = (opt('mods') || '').split(',').map(s => s.trim()).filter(Boolean);
for (const id of modIds.slice().reverse()) {
  const d = path.join(game, 'mods', id);
  if (!fs.existsSync(d)) { rep.add(id, 0, 'MAPCLONE_NO_MAP', `--mods ${id}: no folder ${d}`); continue; }
  if (fs.existsSync(path.join(d, 'resource', ...newKey.split('/')))) taken.add(newKey + '/');
  addMod(d);
}
addLoose(path.join(R, ...mapKey.split('/')), '');
const ps = pakset.open(R, null);
for (const e of ps.entries) {
  pakKeys.add(e.key);
  if (e.key.startsWith(newKey + '/')) taken.add(e.key);
  if (!e.key.startsWith(mapKey + '/')) continue;
  const k = e.key.slice(mapKey.length + 1);
  if (!k || src.has(k)) continue;
  src.set(k, { name: e.name.slice(e.name.lastIndexOf('/') + 1), read: () => pakset.read(e) });
}
// did-you-mean: map folders (holding a map.net) closest to the typed name, from pak keys + loose files
const didYouMean = () => {
  const dirs = new Set();
  for (const k of pakKeys) if (/^map\/.+\/map\.net$/.test(k)) dirs.add(k.slice(0, -8));
  const walk = (d, base) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { if (e.isDirectory()) walk(path.join(d, e.name), base + e.name.toLowerCase() + '/'); else if (e.name.toLowerCase() === 'map.net') dirs.add(base.slice(0, -1)); } };
  walk(path.join(R, 'map'), 'map/');
  const lev = (x, y) => { const d = []; for (let i = 0; i <= x.length; i++) d[i] = [i]; for (let j = 1; j <= y.length; j++) d[0][j] = j; for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); return d[x.length][y.length]; };
  const score = k => { const l = k.split('/').pop(); return (l.includes(old) || old.includes(l)) ? 0 : lev(l, old); };
  return [...dirs].filter(k => k !== mapKey).sort((x, y) => score(x) - score(y) || x.localeCompare(y)).filter(k => score(k) <= Math.max(3, Math.ceil(old.length / 2))).slice(0, 5);
};
if (!src.size) { const dym = didYouMean(); rep.add(mapArg, 0, 'MAPCLONE_NO_MAP', `no files under resource/${mapKey} (loose or packed) in ${game}` + (dym.length ? `. Did you mean: ${dym.join(', ')}?` : '')); fin(); }
if (taken.size || fs.existsSync(path.join(R, ...newKey.split('/')))) { rep.add(newKey, 0, 'MAPCLONE_NAME_EXISTS', `${newKey} already exists in the game; pick another name`); fin(); }

// ---- same-game check on map.net ----
const net = src.get('map.net');
if (!net) { rep.add(mapKey, 0, 'MAPCLONE_NO_NET', 'no map.net in the map folder'); fin(); }
const netBuf = net.read(), g = netBuf[0] === 0x0a ? 'as2' : netBuf[0] === 0x05 ? 'goh' : '?';
if (netBuf[1] !== 2 || g === '?') rep.add(mapKey + '/map.net', 0, 'MAPCLONE_GAME_MISMATCH', `map.net starts ${netBuf.subarray(0, 2).toString('hex')}; known: AS2 0a 02, GoH 05 02`);
const tg = target ? (target === 'goh' ? 'goh' : 'as2') : g;
if (target && !/^(as64|mowas2|goh)$/.test(target)) rep.add(target, 0, 'MAPCLONE_BAD_NAME', '--target is as64, mowas2 or goh');
else if (g !== '?' && tg !== g) rep.add(mapKey + '/map.net', 0, 'MAPCLONE_GAME_MISMATCH', `map.net is a ${g === 'goh' ? 'GoH' : 'AS2'} terrain, target ${target} is the other game; the heightmap cannot be converted here`);
for (const p of mapnet.parse(netBuf).problems) rep.add(mapKey + '/map.net', 0, 'MAPCLONE_NET_PROBLEM', `${p.code} ${p.msg} (source already has it; copied as is)`);
if (onlyMode && !src.has(onlyMode + '.mi')) rep.add(mapKey, 0, 'MAPCLONE_NO_MODE', `--only-mode ${onlyMode}: no ${onlyMode}.mi in the map (modes: ${[...src.keys()].filter(k => /^[^/]+\.mi$/.test(k)).map(k => k.slice(0, -3)).join(' ') || 'none'})`);
if (rep.count) fin();

// ---- text refs ----
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pathRe = new RegExp(`((?:^|[^\\w])/?${escRe(parent)}/)${escRe(old)}(?![\\w])`, 'gi'), strRe = new RegExp(`"${escRe(old)}"`, 'gi');
const files = [];
for (const [k, f] of [...src].sort()) {
  if (noMission && /^[^/]+\.mi$/.test(k)) { rep.info(`${mapKey}/${k}`, 0, 'MAPCLONE_MISSION_SKIPPED', '--no-mission: root .mi not copied, so a test tool can host its own mission on the clone'); continue; }
  if (onlyMode && /^[^/]+\.(mi|info)$/.test(k) && k !== 'map.info' && k.replace(/\.(mi|info)$/, '') !== onlyMode) { rep.info(`${mapKey}/${k}`, 0, 'MAPCLONE_MODE_SKIPPED', `--only-mode ${onlyMode}: other mode not copied`); continue; }
  let buf = f.read(), n = 0;
  if (TEXT.test(k) || !k.includes('.')) {
    let t = buf.toString('latin1');
    t = t.replace(pathRe, (m, p) => { n++; return p + name; }).replace(strRe, () => { n++; return `"${name}"`; });
    if (n) buf = Buffer.from(t, 'latin1');
    if (n) rep.info(`${mapKey}/${k}`, 0, 'MAPCLONE_REF_CHANGED', `${n} refs to ${old} -> ${name}`);
  } else if (buf.includes(old)) rep.info(`${mapKey}/${k}`, 0, 'MAPCLONE_BINARY_REF', `binary file contains "${old}"; copied unedited`);
  files.push({ k, outName: f.name, buf });
}

// ---- includes of each copied mode (root .mi): resolve like the engine, relative to the map folder ----
const roots = [R, ...modDirs.map(d => path.join(d, 'resource')), path.join(out, 'resource')];
const hasKey = k => pakKeys.has(k) || roots.some(r => fs.existsSync(path.join(r, ...k.split('/'))));
for (const f of files) {
  if (!/^[^/]+\.mi$/.test(f.k)) continue;
  const miss = [];
  for (const m of f.buf.toString('latin1').matchAll(/\(\s*include\s+"([^"]+)"/gi)) {
    const inc = m[1].replace(/\\/g, '/'), key = path.posix.normalize(inc.startsWith('/') ? inc.slice(1) : newKey + '/' + inc).toLowerCase();
    const own = key.startsWith(newKey + '/') && files.some(x => x.k === key.slice(newKey.length + 1));
    if (!own && !hasKey(key) && !miss.includes(inc)) miss.push(inc);
  }
  if (miss.length) rep.add(`${newKey}/${f.outName}`, 0, 'WARN_MAPCLONE_INCLUDE_MISSING', `mode ${f.k.slice(0, -3)}: include ${miss.map(x => '"' + x + '"').join(' ')} found in none of clone, game, --mods/--mod, --out: the engine stops the map load if this mode is picked; copy them (mission-clone --src <GoH> copies a GoH mode's includes), or --only-mode <mode> / --no-mission`);
}

// ---- display name ----
let loc = null;
if (tg === 'as2') {
  const lp = path.join(game, 'localization.pak');
  let text = null;
  if (fs.existsSync(lp)) {
    const L = pak.list(lp), e = L.find(x => x.name.toLowerCase() === 'mission.lng');
    if (e) {
      const top = sdl.parseLines(pak.read(L, e).toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/), () => {});
      const find = (n) => { if (String(n.name).toLowerCase() === old) { const nm = n.kids.find(c => String(c.name).toLowerCase() === 'name'); if (nm) return nm.vals.filter(v => v.t === 's').map(v => v.v).join(''); } for (const c of n.kids) { const r = find(c); if (r) return r; } return null; };
      for (const t of top.kids) { text = find(t); if (text) break; }
    }
  }
  const sub = parts.slice(2, -1).join('/');
  const title = (text ? '[clone] ' + text : name);
  loc = { rel: `localization/mission/${parts[1]}/${sub ? sub + '/' : ''}${name}.lng`, buf: Buffer.from(`{tags\r\n\t{"name" "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"}\r\n}\r\n`, 'utf8') };
  rep.info(loc.rel, 0, 'MAPCLONE_LOC_KEY', `lobby reads key mission/${parts[1]}/${sub ? sub + '/' : ''}${name.toLowerCase()}/name ( +  + ) [V, lobby display [T]]`);
  if (!text) rep.info(loc.rel, 0, 'MAPCLONE_LOC_ADDED', `source ${old} has no name in mission.lng; name set to ${name}`);
} else if (tg === 'goh') {
  // GoH: texts are .pot/.po under localizations/<lang>/interface/text/ (sub-folders too), key = msgctxt, lower case (GHLOC-01, GHLOC-06 [V note]).
  // vanilla lobby name: localizations/default.pak default/interface/text/mission.pot msgctxt "mission/multi/<map>/name" [V].
  // The clone gets its own file (a mod mission.pot would shadow the whole vanilla one): localizations/default/interface/text/mission/<multi>/<name>.pot
  const sub = parts.slice(2, -1).join('/'), keyOf = n => `mission/${parts[1]}/${sub ? sub + '/' : ''}${n}/name`;
  const lp = path.join(game, 'localizations', 'default.pak');
  let text = null;
  if (fs.existsSync(lp)) {
    const L = pak.list(lp), e = L.find(x => x.name.toLowerCase().replace(/\\/g, '/') === 'default/interface/text/mission.pot');
    if (e) text = potText(pak.read(L, e).toString('utf8'), keyOf(old));
  }
  const title = text ? '[clone] ' + text : name, pq = s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
  const body = ['msgid ""', 'msgstr ""', '"Content-Type: text/plain; charset=UTF-8\\n"', '"Content-Transfer-Encoding: 8bit\\n"', '',
    `msgctxt ${pq(keyOf(name.toLowerCase()))}`, `msgid ${pq(title)}`, 'msgstr ""', ''].join('\r\n');
  loc = { rel: `localizations/default/interface/text/mission/${parts[1]}/${sub ? sub + '/' : ''}${name}.pot`, buf: Buffer.from(body, 'utf8') };
  rep.info(loc.rel, 0, 'MAPCLONE_LOC_KEY', `GoH lobby key ${keyOf(name.toLowerCase())} (msgctxt, GHLOC-06; vanilla mission.pot form) [I shape from vanilla, lobby display [T]]`);
  if (!text) rep.info(loc.rel, 0, 'MAPCLONE_LOC_ADDED', `source ${old} has no name in GoH mission.pot; name set to ${name}`);
}

// ---- write ----
// GoH: ARSENAL does not write into the GoH install (lib/writeguard, settled for this batch): --out must be a mod folder outside it
if (tg === 'goh') { const why = require('../lib/writeguard').refuseWrite(out, { game, purpose: 'map-clone' }); if (why) { rep.add(out, 0, 'MAPCLONE_OUT_REFUSED', why.replace(/^refused: */, '')); fin(); } }
const dest = path.join(out, 'resource', ...newKey.split('/'));
if (!plan && fs.existsSync(dest)) { rep.add(dest, 0, 'MAPCLONE_OUT_EXISTS', 'output map folder exists; not overwritten'); fin(); }
for (const f of files) {
  if (plan) { rep.info(`${newKey}/${f.outName}`, 0, 'MAPCLONE_COPIED', `${f.buf.length} bytes (plan)`); continue; }
  const p = path.join(dest, ...f.k.split('/').slice(0, -1), f.outName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, f.buf);
}
if (loc && !plan) { const p = path.join(out, loc.rel); fs.mkdirSync(path.dirname(p), { recursive: true }); if (!fs.existsSync(p)) fs.writeFileSync(p, loc.buf); }
if (loc) rep.info(loc.rel, 0, 'MAPCLONE_LOC_ADDED', plan ? 'planned' : 'written');
if (!noModinfo) {
  const gv = gameVer ? gameVer.split(',') : null;
  // T-CLONEFIX: no --target on an as64 install (as64.exe beside resource/) = as64; --target still wins. G-MAPS: a Classic range is "not applied" in an as64+ stack
  const effTarget = target || (fs.existsSync(path.join(game, 'as64.exe')) ? 'as64' : null);
  if (!target && effTarget) rep.info('mod.info', 0, 'MAPCLONE_TARGET_DEFAULT', 'no --target: game folder holds as64.exe, mod.info is for as64 (MinGameVersion 3.301); --target mowas2 for Classic');
  // GoH: the range must hold the exe version on the 1.067 scale (GHNET-22, PORT-46 [V]): Min = Max = the --game exe's own version, as newmod --target goh
  const gohV = !gv && tg === 'goh' ? gohVersion(game) : null;
  if (!gv && tg === 'goh' && !gohV) rep.add('mod.info', 0, 'WARN_MAPCLONE_GOH_VERSION', `no readable binaries/x64/call_to_arms.exe in ${game}: mod.info has no version range, GoH refuses such a mod (PORT-46); pass --game-version 1.067`);
  const rng = gv ? [`MinGameVersion "${gv[0]}"`, ...(gv[1] ? [`MaxGameVersion "${gv[1]}"`] : [])] : tg === 'goh' ? (gohV ? [`MinGameVersion "${gohV}"`, `MaxGameVersion "${gohV}"`] : []) : effTarget === 'as64' ? ['MinGameVersion "3.301"'] : ['MinGameVersion "3.262.0"', 'MaxGameVersion "3.262.1"'];
  const q = s => '"' + s + '"';
  const info = ['{Mod', `\t{Name ${q('map ' + name)}}`, `\t{Desc ${q('clone of ' + old)}}`, ...rng.map(r => `\t{${r}}`), '}', ''].join('\r\n');
  const p = path.join(out, 'mod.info');
  if (!plan && !fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(info, 'latin1'));
  rep.info('mod.info', 0, 'MAPCLONE_MODINFO', plan ? 'planned' : fs.existsSync(p) ? 'written/kept' : 'n/a');
}
rep.info(newKey, 0, 'MAPCLONE_COPIED', `${files.length} files${plan ? ' planned' : ' written'}, map.net ${netBuf.length} bytes unedited`);
fin();

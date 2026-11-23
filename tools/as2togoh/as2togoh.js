#!/usr/bin/env node
// as2togoh: mechanical AS2 mod -> Gates of Hell asset conversion (rows PORT-37 PORT-38 PORT-39; spec.
//   node as2togoh.js <modDir> --out <dir> [--dry] [--goh <GoH root>] [--goh-version V] [--donor <vehicleName>] [-q] [--json f]
//   Copies the mod to --out (input never edited); refuses --out inside a game install or the mod itself. In-game effect of every
//   conversion is [T] (tutorial + vanilla data measured), so all codes are WARN_.
// changes (code file:line):
//   WARN_AS2TOGOH_WEAPON_INCLUDE   weapon .def stuff_small.ext -> stuff_weapon.ext                       (PORT-37)
//   WARN_AS2TOGOH_FORESIGHT        .mdl bone foresight3 -> smg 11 / mg 14 / rifle 12 (via set/stuff/<class> entity link; pistol kept)
//   WARN_AS2TOGOH_HEAD_PATTERN     set/stuff/head from "helmet pattern" -> heavy_headgear, caps -> light_headgear   (PORT-38)
//   WARN_AS2TOGOH_BODY_ROOT        body def root {actor -> {game_entity
//   WARN_AS2TOGOH_VERSION          mod.info minGameVersion and maxGameVersion -> the GoH exe's version (--goh-version V, else read from --goh or the default install; PORT-46)
//   WARN_AS2TOGOH_ROSTER_PATH      set/multiplayer/units/*.set path GoH doesn't have (vehicles_ger.set)
//   WARN_AS2TOGOH_VEHICLE_DONOR    vehicle .def replaced by GoH donor (needs --goh)                       (PORT-39)
//   info AS2TOGOH_ENC              text file re-encoded cp1251 -> UTF-8 (not counted)
// not converted (WARN_): _VEHICLE_DEF (no --goh / no donor) _FORESIGHT_UNLINKED (set entity or .mdl not found) _FORESIGHT_CONFLICT
//   _HEAD_UNKNOWN (other head pattern) _WEAPON_SET (re-check ammo/filling) _BODY_SET (replace body from a GoH example) _NO_MODINFO
// Author: Imperator_Aug (ARSENAL, ia-bf0d9946)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset'), { createReport } = require('../lib/report'), cli = require('../lib/cli');

const TEXT = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy']);
const FORESIGHT = { smg: 'foresight11', mg: 'foresight14', rifle: 'foresight12' };
const GOH_DEFAULT = require('../lib/gamedir').goh(), AS2_DEFAULT = require('../lib/gamedir').resolve().dir;
const extOf = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const insideDir = (p, dir) => { const r = path.relative(path.resolve(dir), path.resolve(p)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const inInstall = p => /steamapps[\\/]common[\\/](Call to Arms - Gates of Hell|Men of War Assault Squad 2)/i.test(path.resolve(p));
const lineAt = (t, idx) => { let n = 1; for (let i = t.indexOf('\n'); i >= 0 && i < idx; i = t.indexOf('\n', i + 1)) n++; return n; };

function decode(buf) {   // -> {text, recoded}
  let ascii = true;
  for (let i = 0; i < buf.length; i++) if (buf[i] >= 0x80) { ascii = false; break; }
  if (ascii) return { text: buf.toString('latin1'), recoded: false };
  try { return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf), recoded: false }; } catch (e) { /* not utf8 */ }
  return { text: new TextDecoder('windows-1251').decode(buf), recoded: true };
}
function replaceAll(t, re, fn, onHit) {   // regex with g flag; fn(match) -> string
  return t.replace(re, (...a) => { const m = a.slice(0, -2), off = a[a.length - 2], r = fn(m); if (r !== m[0]) onHit(lineAt(t, off), m); return r; });
}

function walk(dir, base, out) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, base, out); else if (d.isFile()) out.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

function donorIndex(gohRoot) {
  const root = fs.existsSync(path.join(gohRoot, 'resource')) ? path.join(gohRoot, 'resource') : gohRoot;
  const ps = pakset.open(root, null), list = [];
  for (const e of ps.entries) {
    const m = /^entity\/-?vehicle\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\.def$/.exec(e.key);
    if (m && m[3] === m[4]) list.push({ key: e.key, nation: m[1], cls: m[2], name: m[3], ent: e });
  }
  list.sort((a, b) => (a.key < b.key ? -1 : 1));
  return { ps, list };
}

function main() {
  const o = cli.parse(process.argv.slice(2), { flags: ['--dry'], values: ['--out', '--goh', '--goh-version', '--donor', '--json'] });
  const modDir = o.pos[0], out = o.x.out;
  if (!modDir || !out) { console.error('usage: as2togoh <modDir> --out <dir> [--dry] [--goh <GoH root>] [--goh-version V] [--donor <vehicleName>] [-q] [--json f]'); process.exit(2); }
  if (!fs.existsSync(modDir) || !fs.statSync(modDir).isDirectory()) { console.error(`error: ${modDir} is not a folder`); process.exit(2); }
  for (const g of [o.x.goh || GOH_DEFAULT, AS2_DEFAULT, modDir]) if (insideDir(out, g)) { console.error(`error: --out ${out} is inside a game install or the input mod (${g}); refusing`); process.exit(2); }
  if (inInstall(out)) { console.error(`error: --out ${out} is inside a game install; refusing`); process.exit(2); }
  const rep = createReport(), dry = !!o.x.dry;
  const files = walk(modDir, modDir, []), low = files.map(f => f.toLowerCase());
  const store = new Map();   // rel -> {buf} | {text, changed}
  for (const f of files) {
    const buf = fs.readFileSync(path.join(modDir, f)), ext = extOf(f);
    if ((TEXT.has(ext) || (ext === '' && /^(resource\/)?set\//i.test(f))) && ext !== 'lng') {
      const d = decode(buf);
      store.set(f, { text: d.text, text_: true, recoded: d.recoded, bin: d.recoded ? null : buf });
    } else store.set(f, { buf });
  }
  const resOf = l => l.replace(/^resource\//, '');
  const T = f => store.get(f);
  const edit = (f, re, fn, code, msg) => {   // regex edit on a text file; one finding per hit
    const s = T(f); if (!s || s.text === undefined) return 0;
    let n = 0;
    s.text = replaceAll(s.text, re, fn, (ln, m) => { n++; rep.add(f, ln, code, typeof msg === 'function' ? msg(m) : msg); });
    if (n) s.edited = true;
    return n;
  };

  // ---- weapons: include
  files.forEach((f, i) => {
    const res = resOf(low[i]);
    if (low[i].endsWith('.def') && /^entity\/-?inventory\/(.*\/)?-?weapon\//.test(res))
      edit(f, /(include\s+")\/properties\/stuff_small\.ext(")/gi, m => m[1] + '/properties/stuff_weapon.ext' + m[2], 'WARN_AS2TOGOH_WEAPON_INCLUDE', 'weapon .def include stuff_small.ext -> stuff_weapon.ext [T]');
  });
  // ---- weapon sets -> foresight bone in linked .mdl
  const mdlClass = new Map();
  files.forEach((f, i) => {
    const res = resOf(low[i]), c = /^set\/stuff\/(smg|mg|rifle|pistol)\//.exec(res);
    if (!c || !T(f) || T(f).text === undefined) return;
    const t = T(f).text;
    rep.add(f, 0, 'WARN_AS2TOGOH_WEAPON_SET', `${c[1]} set not converted: GoH inherits a real weapon or pattern and own ammo names; re-check from/filling [T]`);
    if (c[1] === 'pistol') return rep.info(f, 0, 'AS2TOGOH_PISTOL_KEEP', 'pistol keeps foresight3 (GoH 18/18)');
    const em = /\{\s*entity\s+"([^"]+)"/i.exec(t), ent = em && em[1];
    const j = ent ? low.findIndex(x => x.endsWith('/' + ent.toLowerCase() + '.mdl') || x === ent.toLowerCase() + '.mdl') : -1;
    if (j < 0) return rep.add(f, em ? lineAt(t, em.index) : 0, 'WARN_AS2TOGOH_FORESIGHT_UNLINKED', `${c[1]} set entity ${ent ? '"' + ent + '"' : '(none)'} has no .mdl in the mod; foresight3 bone not renamed (weapon may not fire) [T]`);
    const prev = mdlClass.get(files[j]);
    if (prev && prev !== c[1]) return rep.add(files[j], 0, 'WARN_AS2TOGOH_FORESIGHT_CONFLICT', `.mdl linked from ${prev} and ${c[1]} sets; kept ${prev}`);
    mdlClass.set(files[j], c[1]);
  });
  for (const [f, cls] of mdlClass)
    edit(f, /(\{\s*bone\s+")foresight3(")/gi, m => m[1] + FORESIGHT[cls] + m[2], 'WARN_AS2TOGOH_FORESIGHT', `bone foresight3 -> ${FORESIGHT[cls]} (${cls}) [T]`);
  // ---- head sets
  files.forEach((f, i) => {
    const res = resOf(low[i]);
    if (!/^set\/stuff\/head\//.test(res) || !T(f) || T(f).text === undefined) return;
    const stem = path.basename(low[i]).replace(/\.[^.]*$/, ''), cap = /cap/.test(stem), want = cap ? 'light_headgear' : 'heavy_headgear';
    const n = edit(f, /(\{\s*from\s+")(helmet pattern|pattern headgear|fieldcap_rus)(")/gi, m => m[1] + 'pattern ' + want + m[3], 'WARN_AS2TOGOH_HEAD_PATTERN', m => `from "${m[2]}" -> "pattern ${want}"${cap ? ' (cap by name)' : ''} [T]`);
    if (!n) {
      const fm = /\{\s*from\s+"([^"]+)"/i.exec(T(f).text);
      if (!fm || !/^pattern (heavy|light)_headgear$/i.test(fm[1])) rep.add(f, fm ? lineAt(T(f).text, fm.index) : 0, 'WARN_AS2TOGOH_HEAD_UNKNOWN', `head set base ${fm ? '"' + fm[1] + '"' : '(none)'} not a known AS2 pattern; set "pattern heavy_headgear" or "pattern light_headgear" by hand`);
    }
  });
  // ---- body
  files.forEach((f, i) => {
    const res = resOf(low[i]);
    if (/^set\/stuff\/body\//.test(res) && T(f) && T(f).text !== undefined) rep.add(f, 0, 'WARN_AS2TOGOH_BODY_SET', 'body set not converted: GoH shape is {item {tag ...} {entity ...} {inventory ...}}, replace from a GoH example [T]');
    if (low[i].endsWith('.def') && /^entity\/-?inventory\/equipment\/-?body\//.test(res))
      edit(f, /^(\s*\{)actor(\s|$)/gim, m => m[1] + 'game_entity' + m[2], 'WARN_AS2TOGOH_BODY_ROOT', 'def root {actor -> {game_entity [T]');
  });
  // ---- mod.info
  const miF = files.find((f, i) => low[i] === 'mod.info');
  // AS2 roster files GoH has no such path for: nothing on GoH includes them unless the mod does
  try {
    const keysets = require('../modmove/lib/keysets'), gohKeys = keysets.vanillaKeys('goh', o.x.goh || GOH_DEFAULT);
    if (gohKeys.size) for (const f of files) {
      const k = f.toLowerCase().replace(/^resource\//, '');
      if (/^set\/multiplayer\/units\/.+\.set$/.test(k) && !gohKeys.has(k)) rep.add(f, 0, 'WARN_AS2TOGOH_ROSTER_PATH', `GoH has no ${k}: roster not loaded unless a file of this mod includes it. change: move the units to a GoH roster file`);
    }
  } catch { /* no GoH install to compare */ }
  const gohVer = o.x['goh-version'] || (() => { try { return require('../modmove/lib/common').dataVersion('goh', path.join(o.x.goh || GOH_DEFAULT, 'binaries/x64/call_to_arms.exe')).ver; } catch { return null; } })();
  if (!gohVer) rep.add('mod.info', 0, 'WARN_AS2TOGOH_VERSION_UNKNOWN', 'GoH exe not readable: mod.info version left as is. change: pass --goh-version <exe version>, a range without it is refused (PORT-46)');
  if (!miF) rep.add('mod.info', 0, 'WARN_AS2TOGOH_NO_MODINFO', `mod has no mod.info; GoH needs one (minGameVersion "${gohVer || 'exe version'}")`);
  else if (gohVer) {
    edit(miF, /(\{\s*minGameVersion\s+")([^"]*)(")/gi, m => (m[2] === gohVer ? m[0] : m[1] + gohVer + m[3]), 'WARN_AS2TOGOH_VERSION', m => `minGameVersion "${m[2]}" -> "${gohVer}"`);
    edit(miF, /(\{\s*maxGameVersion\s+")([^"]*)(")/gi, m => (m[2] === gohVer ? m[0] : m[1] + gohVer + m[3]), 'WARN_AS2TOGOH_VERSION', m => `maxGameVersion "${m[2]}" -> "${gohVer}"`);
  }
  // ---- vehicles
  let dIdx = null, dErr = null;
  if (o.x.goh) { try { dIdx = donorIndex(o.x.goh); } catch (e) { dErr = e.message; } }
  files.forEach((f, i) => {
    const res = resOf(low[i]);
    if (!low[i].endsWith('.def') || !/^entity\/-?vehicle\//.test(res) || /\/x\//.test(res) || !T(f) || T(f).text === undefined) return;
    const t = T(f).text, em = /\{\s*extension\s+"([^"]+)"/i.exec(t);
    if (!em) return;
    const parts = res.split('/'), nation = parts[2], cls = parts[3], ln = lineAt(t, em.index);
    if (!dIdx) return rep.add(f, ln, 'WARN_AS2TOGOH_VEHICLE_DEF', `AS2 vehicle .def kept; GoH needs a donor .def of same class/calibre/weight ${dErr ? '(--goh unreadable: ' + dErr + ')' : '(give --goh [--donor name])'}, {extension} to this .mdl, donor model include deleted [T]`);
    let donor = null;
    if (o.x.donor) donor = dIdx.list.find(d => d.name === o.x.donor.toLowerCase());
    else donor = dIdx.list.find(d => d.cls === cls && d.nation === nation) || dIdx.list.find(d => d.cls === cls);
    if (!donor) return rep.add(f, ln, 'WARN_AS2TOGOH_VEHICLE_DEF', `AS2 vehicle .def kept; no GoH donor ${o.x.donor ? 'named "' + o.x.donor + '"' : 'in class folder "' + cls + '"'}; pick one with --donor [T]`);
    let dt = pakset.read(donor.ent).toString('utf8');
    const eol = dt.includes('\r\n') ? '\r\n' : '\n';
    dt = dt.replace(/(\{\s*extension\s+")[^"]*(")/i, (m0, a, b) => a + em[1] + b);
    dt = dt.split(/\r?\n/).filter(l => !/^\s*\(\s*include\s+"(?!\/)[^"]+"/i.test(l)).join(eol);
    const s = T(f); s.text = dt; s.edited = true; s.donor = true;
    rep.add(f, ln, 'WARN_AS2TOGOH_VEHICLE_DONOR', `.def replaced by GoH donor ${donor.key}; {extension "${em[1]}"}, donor model include removed. tune props/bones to the ported .mdl; test guns fire + AI engages [T]`);
  });
  // ---- write
  for (const [f, s] of store) if (s.text !== undefined && s.recoded) rep.info(f, 0, 'AS2TOGOH_ENC', 'text re-encoded cp1251 -> UTF-8');
  if (!dry) {
    for (const [f, s] of store) {
      const p = path.join(out, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (s.buf) fs.writeFileSync(p, s.buf);
      else if (s.edited || s.recoded) fs.writeFileSync(p, Buffer.from(s.text, 'utf8'));
      else fs.writeFileSync(p, s.bin);
    }
  }
  if (dIdx) dIdx.ps.close && dIdx.ps.close();
  const info = (dry ? 'dry run: nothing written' : `wrote ${store.size} files to ${out}`);
  if (!o.q) rep.info('-', 0, 'AS2TOGOH_DONE', info);
  if (o.x.json) fs.writeFileSync(o.x.json, JSON.stringify(rep.toJSON({ tool: 'as2togoh' }), null, 1));
  cli.printReport(rep, o, { tool: 'as2togoh', byCode: false });
}
if (require.main === module) cli.run(main);

#!/usr/bin/env node
// firecheck: static check, "will this built unit fire?" (no game). Trained on edrun rows.
//   node tools/firecheck/firecheck.js <def> [--game G] [--dist N] [--json]     one def (mdl read beside it; weapon files from G/resource paks)
//   node tools/firecheck/firecheck.js --census [--game G]                      foresight bone per weapon class, from vanilla
//   --exe as64|mowas_2|mowas2|goh   the game (lib/games): weapon files come through the vfs of that game (as64: base + as64/core;
//                    mowas_2: base only; goh: the GoH resource tree), no mods. With --exe and no --game the install is games.install(exe)
//                    (goh: the GoH install). No --exe: as before (G/resource paks, G = --game else the AS2 install).
//   GoH (--exe goh, or G holds binaries/x64/call_to_arms.exe): the place key {AimBone "b"} is read (GHKEY-05: second, aimer bone, the IK chain
//                    is solved to it; the shot still leaves from the foresight, GHAI-46); no foresight = no shot (GHLOG-03), so FC_AIM_BONE
//                    holds on GoH too. GoH ammo items bullet<nation>_<cal> (bulleteng_40 ap) count for FC_NO_AP.
// exit 0 = no silent flag, 1 = at least one FC_* flag (the unit likely never fires), 2 = usage/unreadable.
// Flags (a unit with any flag is called silent):
//   FC_AIM_BONE      a weapon place's aim bone (place {foresight} else the weapon's pattern default, see census) is not a bone of the mdl.
// no aim bone = aimer bone null = never fires [V, FXD-2 report]
//   FC_MG_SWAP       same, for a non-gun weapon (MG/rifle/smg: pattern chain ends at bullet.pattern = Foresight3, guns get Foresight1 from gun.pattern)
//                    placed on a gun's place: the place needs {foresight "foresight1"} (sheet Q31) [V pattern files; swap rule = user answer]
//   A flag counts only when no other place can aim: p2640 (gun place fine, MG places without bone) fired. An MG-only unit with half its places bad is silent.
// Warnings (never make a unit silent): FC_PLACE_AIM, FC_NO_AP (fg/zenite-only gun ammo: pak44 and breda fire on it, so no flag), FC_CREW_VISIBLE (staghound
//   silent, grayhound fires), FC_WHEELED_CASEMATE (sheet Q34), FC_RANGE (sheet Q33, direct {range} only), FC_ENUMERATOR, FC_TRAJECTORY_UNREAD (Q36),
//   FC_AIMBONE_MISSING (GoH: {AimBone} names no bone of the mdl; what the chain does then is not in the notes [I]),
//   FC_AIMBONE_AS2 (--exe as64|mowas_2 named: {AimBone} is a GoH key, AS2 aims with the foresight only, GHKEY-05 [I]; not given with no --exe)
// The flags are trained on AS2 units only (fire-s.md); on GoH they are the same static rules, not measured there [I].
// Measured: The flags catch 2 of 9 silent unit-builds and 0 of 34 firing ones; below the 80% bar.
// Author: Imperator_Aug (ARSENAL, ia-2f256616)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const lc = s => String(s).toLowerCase();

// ---- text helpers (cp1251 safe: read as latin1) --------------------------------------------------
function stripComments(t) {   // ';' to end of line, unless inside a string
  return String(t).split(/(\r?\n)/).map(l => {
    let inS = false;
    for (let i = 0; i < l.length; i++) { if (l[i] === '"') inS = !inS; else if (l[i] === ';' && !inS) return l.slice(0, i); }
    return l;
  }).join('');
}
// brace-balanced block starting at index i (text[i] === '{'); strings skipped
function blockAt(t, i) {
  let d = 0, inS = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (c === '"') inS = !inS;
    else if (!inS) { if (c === '{') d++; else if (c === '}') { d--; if (!d) return t.slice(i, k + 1); } }
  }
  return t.slice(i);
}
function childBlocks(blk, name) {   // direct children {name ...} of a block text
  const out = []; let d = 0, inS = false;
  for (let k = 0; k < blk.length; k++) {
    const c = blk[k];
    if (c === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (c === '{') {
      if (d === 1) { const m = new RegExp('^\\{\\s*' + name + '\\b', 'i').exec(blk.slice(k, k + 40)); if (m) out.push(blockAt(blk, k)); }
      d++;
    } else if (c === '}') d--;
  }
  return out;
}
function mdlBonesOf(buf) {
  const t = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf), s = new Set();
  for (const m of t.matchAll(/\{\s*bone\s+(?:\w+\s+)?"([^"]+)"/gi)) s.add(lc(m[1]));
  return s;
}

// ---- weapon files: census ------------------------------------------------------------------------
// weapons = Map name(lc) -> {cls, text}; patterns = Map basename(lc) -> text.   Built from vanilla paks (pakset) or injected (tests).
// one set/stuff entry into the db (key lowercase '/', read() -> Buffer)
function addStuff(db, key, read) {
  const m = /^set\/stuff\/(.+)$/.exec(key); if (!m) return;
  const rest = m[1], parts = rest.split('/'), base = parts[parts.length - 1];
  if (/\.pattern$/.test(base)) { db.patterns.set(lc(base.replace(/\.pattern$/, '')), read().toString('latin1')); return; }
  if (parts.length !== 2 || !/^(gun|mgun|rifle|smg|pistol|reactive|bazooka|flame)$/.test(parts[0])) return;
  if (/\.(ammo|weapon|presets)$/.test(base) && !/\.weapon$/.test(base)) return;
  db.weapons.set(lc(base.replace(/\.weapon$/, '')), { cls: parts[0], text: read().toString('latin1') });
}
function loadVanillaWeapons(game) {
  const ps = require('../lib/pakset.js');
  const s = ps.open(game.replace(/[\\/]+$/, '') + '/resource');
  const db = { weapons: new Map(), patterns: new Map() };
  for (const e of s.entries) addStuff(db, e.key, () => ps.read(e));
  s.close();
  return db;
}
// the named game's view (--exe): lib/vfs with that exe, no mods (as64 adds as64/core, mowas_2 does not, goh = the GoH tree)
function loadGameWeapons(game, exe) {
  const vfs = require('../lib/vfs.js');
  const v = vfs.build({ gameDir: game, exe, mods: [] });
  const db = { weapons: new Map(), patterns: new Map() };
  try { for (const [key, rec] of v.files) if (key.startsWith('resource/set/stuff/')) addStuff(db, key.slice(9), () => vfs.readRec(rec)); } finally { vfs.closeRecs(); }
  return db;
}
// effective foresight of a weapon: own {foresight}, else up the {from "pattern X"} chain
function foresightOf(w, db) {
  let text = w.text, guard = 0;
  while (text && guard++ < 8) {
    const f = /\{\s*foresight\s+"([^"]+)"/i.exec(stripComments(text)); if (f) return lc(f[1]);
    const fr = /\{\s*from\s+"([^"]+)"/i.exec(text);
    if (!fr) { text = null; break; }
    const nm = lc(fr[1].trim());
    const pm = /^pattern\s+(.+)$/.exec(nm);
    if (pm) text = db.patterns.get(pm[1].trim());
    else { const o = db.weapons.get(nm.replace(/\.weapon$/, '')); text = o ? o.text : null; }
  }
  return null;
}
function census(db) {
  const rows = {};
  for (const [n, w] of db.weapons) {
    const f = foresightOf(w, db) || '(none)';
    const r = rows[w.cls] || (rows[w.cls] = { n: 0, by: {}, ex: {} });
    r.n++; r.by[f] = (r.by[f] || 0) + 1; (r.ex[f] = r.ex[f] || []).length < 3 && r.ex[f].push(n);
  }
  return rows;
}

// ---- the check -----------------------------------------------------------------------------------
// o: {text (def), mdlBones: Set|null, db: {weapons,patterns}, dist, kind: 'as2'|'goh'|undefined (lib/games kind; undefined = AS2 rules as before, without FC_AIMBONE_AS2)}
function analyze(o) {
  const text = stripComments(o.text), flags = [], warnings = [], info = { places: [] };
  const bones = o.mdlBones || null, db = o.db, goh = o.kind === 'goh';
  const wy = /\{\s*weaponry\b/i.exec(text);
  const items = [...text.matchAll(/\{\s*item\s+"([^"]+)"/gi)].map(m => lc(m[1]).trim());
  if (!wy) { warnings.push({ code: 'FC_NO_WEAPONRY', detail: 'no {Weaponry} block in the def itself (weapons may come from an include; not read)' }); return { silent: false, flags, warnings, info }; }
  const wblk = blockAt(text, wy.index);
  for (const pb of childBlocks(wblk, 'place')) {
    const pn = (/^\{\s*place\s+"([^"]+)"/i.exec(pb) || [])[1] || '?';
    const fore = (/\{\s*foresight\s+"([^"]+)"/i.exec(pb) || [])[1];
    const aimB = (/\{\s*aimbone\s+"([^"]+)"/i.exec(pb) || [])[1];
    if (aimB) {
      if (o.kind === 'as2') warnings.push({ code: 'FC_AIMBONE_AS2', place: pn, detail: `place "${pn}": {AimBone "${aimB}"} is a GoH weapon place key; AS2 aims with the foresight bone only, the key is not read (GHKEY-05) [I]` });
      else if (bones && !bones.has(lc(aimB))) warnings.push({ code: 'FC_AIMBONE_MISSING', place: pn, detail: `place "${pn}": {AimBone "${aimB}"} is not a bone of the mdl; GoH solves the aim chain to this bone (GHKEY-05, GHAI-46), what it does without it is not in the notes [I]` });
    }
    for (const wm of pb.matchAll(/\{\s*weapon\s+"([^"]+)"(?:\s+filling\s+"([^"]+)")?/gi)) {
      const wname = lc(wm[1]), w = db && db.weapons.get(wname), filling = wm[2] ? lc(wm[2]) : null;
      const rec = { place: pn, weapon: wname, cls: w ? w.cls : null, bone: fore ? lc(fore) : null, explicit: !!fore };
      if (aimB) rec.aimBone = lc(aimB);
      if (!w) { info.places.push(rec); warnings.push({ code: 'FC_WEAPON_UNKNOWN', detail: `place "${pn}": weapon "${wname}" not in the vanilla census (kept by the mod?); not checked` }); continue; }
      const def = foresightOf(w, db); if (!rec.bone) rec.bone = def;
      info.places.push(rec);
      if (bones && rec.bone && !bones.has(rec.bone)) {
        const gunDefault = w.cls === 'gun' ? 'foresight1' : null;
        if (!rec.explicit && w.cls !== 'gun' && w.cls !== 'reactive' && bones.has('foresight1'))
          flags.push({ code: 'FC_MG_SWAP', place: pn, detail: `place "${pn}": ${w.cls} weapon "${wname}" aims at its pattern default "${rec.bone}", the mdl has "foresight1" but not "${rec.bone}": add {foresight "foresight1"} to the place` });
        else flags.push({ code: 'FC_AIM_BONE', place: pn, detail: `place "${pn}": ${w.cls} weapon "${wname}" aims at "${rec.bone}"${rec.explicit ? ' (place {foresight})' : ' (default' + (gunDefault ? ', gun.pattern' : '') + ')'}, not a bone of the mdl [bones like it: ${[...bones].filter(b => /^foresight/.test(b)).join(',') || 'none'}]` });
      }
      if (w.cls === 'gun') {
        const cal = (/^(\d+)mm/.exec(wname) || [])[1];
        const ammo = [];
        if (filling) ammo.push(filling);
        const itemRe = goh ? /(?:^|\s)bullet(?:[a-z]+_)?(\d+)\b(.*)$/ : /(?:^|\s)bullet(\d+)\b(.*)$/;   // GoH: bulleteng_40 (vanilla churchill_mk1.def)
        for (const it of items) { const m = itemRe.exec(it); if (m && (!cal || m[1] === cal)) ammo.push(it); }
        const useful = ammo.filter(a => !/\b(fg|zenite|airplane|sm)\b/.test(a));
        if (ammo.length && !useful.length)
          warnings.push({ code: 'FC_NO_AP', place: pn, detail: `place "${pn}": gun "${wname}" has only ${[...new Set(ammo)].join(' | ')}; no ap/apcr round for the AI to pick [I]` });
      }
    }
  }
  if (/crew_human_visible"?[^)]*place\(\s*gunner/i.test(text) || /crew_human_visible"?\s+place\(\s*gunner/i.test(text))
    warnings.push({ code: 'FC_CREW_VISIBLE', detail: 'gunner seat built with crew_human_visible; staghound b8r3 was silent with it, but grayhound and superhellcat fire with it: warning only [I]' });
  // (d) sheet Q34: wheeled hull, no turret bone: the gun turns only with the hull; must move to turn
  if (/\{\s*props\b[^}]*"wheeled"/i.test(text) && bones && !bones.has('turret'))
    warnings.push({ code: 'FC_WHEELED_CASEMATE', detail: 'wheeled hull with a gun and no turret bone: it traces only what the hull faces; the driver must move to turn it (sheet Q34) [T]' });
  else if (/\{\s*props\b[^}]*"wheeled"/i.test(text) && bones && bones.has('turret')) { /* turret traverses: fine */ }
  // (b) sheet Q33: in range from a hold, direct {range min max} on the place only (macros are not expanded)
  if (o.dist) for (const rm of wblk.matchAll(/\{\s*range\s+([\d.]+)\s+([\d.]+)/gi)) if (+rm[2] < o.dist)
    warnings.push({ code: 'FC_RANGE', detail: `a place {range} max ${rm[2]} < ${o.dist}: a unit on hold fires only in range (sheet Q33)` });
  if (bones && !bones.has('enumerator') && /\{\s*extender\s+"enumerator"/i.test(text))
    warnings.push({ code: 'FC_ENUMERATOR', detail: 'extender "enumerator" but no enumerator bone: log noise; fiat626_breda fires without it [V FXD-2]' });
  warnings.push({ code: 'FC_TRAJECTORY_UNREAD', detail: 'clear trajectory (sheet Q36) is a property of the map and the hull geometry; not readable from defs [I]' });
  // a unit fires if ANY weapon place can aim (p2640 b8r3: MG place without aim bone, gun place fine, fired [V rows]); silent only when every checked place fails
  const aimBad = flags.filter(f => f.code === 'FC_AIM_BONE' || f.code === 'FC_MG_SWAP');
  const checked = info.places.filter(p => p.cls).length;
  // MG-only unit (no gun/reactive place that can aim) with at least half its places lacking an aim bone: silent (carrier b8r3: 3 of 4 places) [I, one unit]
  const mainOk = info.places.some(p => p.cls && p.cls !== 'mgun' && !aimBad.some(f => f.place === p.place));
  if (aimBad.length && aimBad.length < checked && !mainOk && aimBad.length * 2 >= checked) { /* keep flags */ }
  else if (aimBad.length && aimBad.length < checked) {
    for (const f of aimBad) warnings.push({ code: 'FC_PLACE_AIM', detail: f.detail + ' [other places can aim, so the unit still fires]' });
    flags.length = 0;
  }
  return { silent: flags.length > 0, flags, warnings, info };
}

// ---- files -----------------------------------------------------------------------------------------
function analyzeFile(defPath, opt) {
  const text = fs.readFileSync(defPath).toString('latin1');
  const m = /\{\s*Extension\s+"([^"]+\.mdl)"/i.exec(text);
  let bones = null;
  if (m) { const mp = path.join(path.dirname(defPath), m[1]); try { bones = mdlBonesOf(fs.readFileSync(mp)); } catch (e) { bones = null; } }
  return analyze({ text, mdlBones: bones, db: opt.db, dist: opt.dist, kind: opt.kind });
}

function main(argv) {
  const games = require('../lib/games');
  const o = { def: null, game: null, dist: 0, json: false, census: false, exe: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--game') o.game = argv[++i]; else if (a === '--exe') o.exe = argv[++i]; else if (a === '--dist') o.dist = +argv[++i]; else if (a === '--json') o.json = true; else if (a === '--census') o.census = true; else if (!o.def) o.def = a; else { console.error('usage'); return 2; }
  }
  if (o.exe != null && !games.get(o.exe)) { console.error('unknown --exe ' + o.exe + ' (as64, mowas_2, mowas2, goh)'); return 2; }
  if (!o.game && o.exe) o.game = games.install(o.exe).dir;
  if (!o.game) { try { o.game = require('../lib/gamedir').resolve({}).dir; } catch (e) { /* none */ } }
  if (!o.game) { console.error('no --game'); return 2; }
  const kind = o.exe ? games.kindOf(o.exe) : games.detect(o.game) === 'goh' ? 'goh' : undefined; // no --exe on an AS2 folder: AS2 rules as before, no FC_AIMBONE_AS2
  const db = o.exe ? loadGameWeapons(o.game, games.exeOf(o.exe)) : loadVanillaWeapons(o.game);
  if (o.census) {
    const c = census(db);
    console.log('| class | weapons | aim bone: count (examples) |\n|---|---|---|');
    for (const k of Object.keys(c).sort()) console.log(`| ${k} | ${c[k].n} | ` + Object.entries(c[k].by).map(([b, n]) => `${b}: ${n} (${c[k].ex[b].join(', ')})`).join('; ') + ' |');
    return 0;
  }
  if (!o.def) { console.error('usage: firecheck.js <def> [--game G] [--exe as64|mowas_2|goh] [--dist N] [--json] | --census'); return 2; }
  let r; try { r = analyzeFile(o.def, { db, dist: o.dist, kind }); } catch (e) { console.error('cannot read: ' + e.message); return 2; }
  if (o.json) console.log(JSON.stringify(r, null, 1));
  else { console.log(r.silent ? 'SILENT-LIKELY ' + o.def : 'FIRES-LIKELY ' + o.def); for (const f of r.flags) console.log('  FLAG ' + f.code + ' ' + f.detail); for (const w of r.warnings) console.log('  warn ' + w.code + ' ' + w.detail); }
  return r.silent ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, analyze, analyzeFile, mdlBonesOf, loadVanillaWeapons, loadGameWeapons, addStuff, foresightOf, census, stripComments, blockAt, childBlocks };

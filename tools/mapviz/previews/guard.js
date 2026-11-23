// previews guard: may this command write map pictures into this mod folder? (previews.md 6; design 0 rules, README 9.1)
//   guard(modDir, target, o) -> null | {code, why}    o = {game} (install folder of the target; default gamedir per game)
//     checked on the path as given and on its real path (a junction must pass too). Codes in check order:
//     PRV_MOD_MISSING (not a folder), PRV_WORKSHOP ('..' or a Steam Workshop path), PRV_GOH_PATH / PRV_GOH_WORKSHOP_ID /
//     PRV_GOH_FOLDER_NAME (GoH: only <GoH>/mods/<id>, id not mod_<digits>, id passes the GoH folder name rule), PRV_AS2_PATH
//     (goh target inside a MoW:AS2 install), PRV_MOD_REFUSED (writeguard), PRV_NOT_A_MOD (no mod.info, no resource/)
//   pathOk(modDir, rel, mapKey) -> null | {code:'PRV_PATH', why}   a file a call writes: under resource/map/<map key>/ or .mapviz-backup/
//   place(modDir, target, o) -> {place:'game-mods'|'outside', gohInstall:bool}
//   modFacts(modDir, mapKey, target) -> {modInfo, modInfoFile, pak, paks, gohRootPak, gohVersionOff}
// writeguard refuses every GoH path, so the GoH mods rule is ours: <GoH>/mods/<id>, one segment [V gohweb vfs/goh-mod-scan-order-ids:
// a local folder named like a Workshop id loses to the Workshop item].
// Author: Imperator_Aug (ARSENAL, ia-e6bf0aee)
'use strict';
const fs = require('fs'), path = require('path');

const fwd = p => String(p).replace(/\\/g, '/');
const key = p => fwd(path.resolve(p)).toLowerCase().replace(/\/+$/, '');
const same = (a, b) => key(a) === key(b);
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
function real(p) { try { return fs.realpathSync.native(path.resolve(p)); } catch (e) { return path.resolve(p); } }

// gamedir lookups read the registry and Steam libraries (seconds each): asked once per process
const found = {};
function lookup(which) {
  if (which in found) return found[which];
  let d = null;
  try { const gd = require('../../lib/gamedir'); d = which === 'goh' ? gd.goh() : (gd.resolve({}) || {}).dir; } catch (e) { d = null; }
  return (found[which] = d ? path.resolve(d) : null);
}
function gameDefault(target, given) {
  if (given) return path.resolve(given);
  return lookup(target === 'goh' ? 'goh' : 'as2');
}

// the GoH install that holds p: by content (writeguard.detectInstall), else the target's folder, else gamedir.goh()
function gohOf(p, game) {
  const wg = require('../../lib/writeguard');
  const hit = wg.detectInstall(p);
  if (hit && hit.kind === 'goh') return hit.dir;
  const cands = [game, lookup('goh')];
  for (const g of cands) if (g && (key(p) === key(g) || key(p).startsWith(key(g) + '/'))) return path.resolve(g);
  return null;
}

// GoH folder name rule [V gohweb vfs/goh-modinfo-version-rule]: a mods/ subfolder whose name
// holds a byte >= 0x80, a space or one of <>+()[]{}!@#$%^&*-=;:|'" is skipped (game.log warning only). -> the bad character
// in words, or null. Not checked on as64 or mowas2 (no such check there).
function gohNameBad(name) {
  const m = /[^\x21-\x7e]|[<>+()[\]{}!@#$%^&*\-=;:|'"]/.exec(String(name));
  if (!m) return null;
  const c = m[0];
  return c === ' ' ? 'a space' : c.charCodeAt(0) > 0x7e ? 'a letter outside plain ASCII' : c.charCodeAt(0) < 0x21 ? 'a control character' : 'the character ' + c;
}

function one(p, target, game) {
  const wg = require('../../lib/writeguard');
  const lo = fwd(p).toLowerCase() + '/';
  if (/\/workshop\/content\//.test(lo)) return { code: 'PRV_WORKSHOP', why: 'the folder is inside the Steam Workshop download folder; Steam replaces those files' };
  const goh = gohOf(p, target === 'goh' ? game : null);
  if (goh) {
    if (target !== 'goh') return { code: 'PRV_GOH_PATH', why: 'the folder is inside a Gates of Hell install; pick a mod of the game you write for' };
    const rel = key(p).slice(key(goh).length).replace(/^\//, '').split('/').filter(Boolean);
    if (rel.length !== 2 || rel[0] !== 'mods') return { code: 'PRV_GOH_PATH', why: 'inside Gates of Hell only <GoH>/mods/<mod name> may be written (not the game folder, resource/, binaries/ or mods/ itself)' };
    if (/^mod_\d+$/i.test(rel[1])) return { code: 'PRV_GOH_WORKSHOP_ID', why: 'a local mod named like a Workshop id (mod_<digits>) loses to the Workshop item of that id; rename the folder' };
    const bad = gohNameBad(rel[1]);
    if (bad) return { code: 'PRV_GOH_FOLDER_NAME', why: 'Gates of Hell skips a mods folder whose name holds ' + bad + '; use letters, digits, _ and . only' };
    return null;
  }
  if (target === 'goh') {
    // a goh write into a MoW:AS2 install: say so plainly (writeguard's text would point at the AS2 mods folder)
    const hit = wg.detectInstall(p), as2 = lookup('as2');
    if ((hit && hit.kind === 'as2') || (as2 && (key(p) === key(as2) || key(p).startsWith(key(as2) + '/'))))
      return { code: 'PRV_AS2_PATH', why: 'the folder is inside a MoW:AS2 install; pick a Gates of Hell mod (<GoH>/mods/<mod name>) or a folder outside every install' };
    const why = wg.refuseWrite(p, { allowGameMods: false, purpose: 'write map previews' });
    return why ? { code: 'PRV_MOD_REFUSED', why } : null;
  }
  // as64, mowas2
  const hit = wg.detectInstall(p);
  const inst = hit && hit.kind === 'as2' ? hit.dir : (game && (key(p) === key(game) || key(p).startsWith(key(game) + '/')) ? game : null);
  if (inst) {
    const why = wg.refuseWrite(p, { game: game || undefined, allowGameMods: true, purpose: 'write map previews' });
    if (why) return { code: 'PRV_MOD_REFUSED', why };
    const rel = key(p).slice(key(inst).length).replace(/^\//, '').split('/').filter(Boolean);
    if (rel.length !== 2 || rel[0] !== 'mods') return { code: 'PRV_MOD_REFUSED', why: 'inside the game folder only <game>/mods/<mod name> may be written' };
    return null;
  }
  const why = wg.refuseWrite(p, { game: game || undefined, allowGameMods: false, purpose: 'write map previews' });
  return why ? { code: 'PRV_MOD_REFUSED', why } : null;
}

function guard(modDir, target, o) {
  o = o || {};
  if (typeof modDir !== 'string' || !modDir.trim()) return { code: 'PRV_MOD_MISSING', why: 'no mod folder was given' };
  if (String(modDir).split(/[\\/]+/).includes('..')) return { code: 'PRV_WORKSHOP', why: 'the path uses ".."; give the full folder path' };
  if (/[\\/]workshop[\\/]content([\\/]|$)/i.test(modDir)) return { code: 'PRV_WORKSHOP', why: 'the folder is inside the Steam Workshop download folder; Steam replaces those files' };
  const abs = path.resolve(modDir);
  if (!isDir(abs)) return { code: 'PRV_MOD_MISSING', why: 'the mod folder does not exist or is not a folder' };
  const game = gameDefault(target, o.game);
  // the real path first: a junction into an install is named by what it points at
  for (const p of same(real(abs), abs) ? [abs] : [real(abs), abs]) {
    const r = one(p, target, game);
    if (r) return r;
  }
  const f = modFacts(abs);
  if (!f.modInfoFile && !isDir(path.join(abs, 'resource'))) return { code: 'PRV_NOT_A_MOD', why: 'the folder holds neither mod.info nor resource/, so it is not a mod' };
  return null;
}

function pathOk(modDir, rel, mapKey) {
  const r = fwd(rel);
  if (r.split('/').includes('..') || /^\/|^[a-z]:/i.test(r)) return { code: 'PRV_PATH', why: 'a file path leaves the mod: ' + r };
  const lo = r.toLowerCase();
  if (lo.startsWith('.mapviz-backup/')) return null;
  const pre = ('resource/map/' + String(mapKey || '').toLowerCase() + '/');
  if (mapKey && lo.startsWith(pre) && lo.length > pre.length && lo.slice(pre.length).indexOf('/') < 0) return null;
  return { code: 'PRV_PATH', why: 'a file outside resource/map/<map key>/ and .mapviz-backup/: ' + r };
}

function place(modDir, target, o) {
  const abs = path.resolve(modDir), game = gameDefault(target, o && o.game);
  const wg = require('../../lib/writeguard');
  const hit = wg.detectInstall(abs);
  const inst = hit ? hit.dir : (game && key(abs).startsWith(key(game) + '/') ? game : null);
  return { place: inst ? 'game-mods' : 'outside', gohInstall: !!(hit && hit.kind === 'goh') };
}

// GoH version gate [V gohweb vfs/goh-modinfo-version-rule]: GoH 1.x must be >= MinGameVersion and <=
// MaxGameVersion when set; tag develop opens every version. The test here compares the major number only [I]: Min major >= 2
// (an AS2 mod.info says 3.x) or Max major < 1 -> the bound in words, else null.
function gohVersionOff(text) {
  const get = k => { const m = new RegExp('\\{\\s*' + k + '\\s+"([^"]*)"', 'i').exec(text); return m ? m[1].trim() : null; };
  const tags = (get('tags') || '').toLowerCase().split(/[\s,;]+/);
  if (tags.includes('develop')) return null;
  const major = v => { const m = /^(\d+)/.exec(v || ''); return m ? Number(m[1]) : null; };
  const lo = get('minGameVersion'), hi = get('maxGameVersion');
  if (lo && major(lo) != null && major(lo) >= 2) return 'MinGameVersion ' + lo;
  if (hi && major(hi) != null && major(hi) < 1) return 'MaxGameVersion ' + hi;
  return null;
}

// target goh: the root resource.pak is not mounted by GoH [V], so it is left out
// the pak test and reported as gohRootPak; mod.info is read for the version gate (gohVersionOff)
function modFacts(modDir, mapKey, target) {
  const abs = path.resolve(modDir);
  const mi = path.join(abs, 'mod.info');
  const modInfoFile = isFile(mi);
  let size = 0; try { size = modInfoFile ? fs.statSync(mi).size : 0; } catch (e) { size = 0; }
  const paks = [];
  const goh = target === 'goh';
  const rootPak = isFile(path.join(abs, 'resource.pak'));
  if (rootPak && !goh) paks.push(path.join(abs, 'resource.pak'));
  let versionOff = null;
  if (goh && modInfoFile && size > 0) { try { versionOff = gohVersionOff(fs.readFileSync(mi, 'latin1')); } catch (e) { versionOff = null; } }
  try { for (const n of fs.readdirSync(path.join(abs, 'resource'))) if (/\.pak$/i.test(n)) paks.push(path.join(abs, 'resource', n)); } catch (e) { /* none */ }
  // a pak holding the same map folder: which wins against our loose files is open [I], G9
  let pak = false;
  if (paks.length && mapKey) {
    const want = ['map/' + mapKey.toLowerCase() + '/', 'resource/map/' + mapKey.toLowerCase() + '/'];
    for (const f of paks) {
      try {
        const ents = require('../../lib/pak').list(f);
        const names = (Array.isArray(ents) ? ents : ents && ents.entries ? ents.entries : []).map(e => fwd(e.name || e.path || e).toLowerCase());
        if (names.some(n => want.some(w => n.startsWith(w)))) { pak = true; break; }
      } catch (e) { pak = true; break; }   // unreadable: say so rather than hide it
    }
  }
  return { modInfo: modInfoFile && size > 0, modInfoFile, pak, paks: paks.length, gohRootPak: goh && rootPak, gohVersionOff: versionOff };
}

module.exports = { guard, pathOk, place, modFacts, gameDefault, same, key, gohNameBad, gohVersionOff };

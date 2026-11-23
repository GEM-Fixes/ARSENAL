// fix/modinfo: the mod.info version range. missing or wrong MinGameVersion/MaxGameVersion -> a corrected copy of mod.info (out 'mod.info.fixed').
//   as64 (default): Min "3.301", no Max.   classic (mowas2): Min "3.262.0", Max "3.262.1" (same range as tools/newmod).
//   goh: the GoH exe's own version (newmod --target goh, PORT-46): a range that holds it, or the tag `develop`, is left alone; else Min = Max = that version.
//     GoH gate (GHVFS-26 [V], gohweb vfs/goh-modinfo-version-rule): each bound optional (missing = open), compared with the
//     GoH 1.x version (GHNET-22); tag `develop` in {tags "..."} = any version (GHVFS-02). Lines commented out with ';' (the GoH template has them) are not read.
// The source mod is never written and a patch mod cannot replace the source's mod.info, so the fix is a copy the user puts over the source's mod.info; the patch's own mod.info carries the corrected range.
// Classic needs BOTH Min and Max with the game version inside (vfs.js MOD_VERSION); as64 (modern) needs only Min <= the as64 version.
// Bytes are kept: the file is edited as latin1 text (1 byte = 1 char), CRLF kept, no other line touched.
// plan(dir, target, {version}?) -> { edits:[{kind:'modinfo', key, out, before, after, why:[..], targets:[], info:{min,max}}], cant:[], ok:bool, none:bool }
//   version: the GoH version (target goh only; none -> FIX_MODINFO_GOH_VERSION refusal)
// goodGoh(version, min, max, tags) -> bool;  folderOk(name) -> null | reason (GoH folder name rule, GHVFS-27)
// Author: Imperator_Aug (ARSENAL, ia-4eedbdff)
const fs = require('fs'), path = require('path');
const C = require('../../modmove/lib/common');
const RANGE = { as64: { min: '3.301', max: null }, classic: { min: '3.262.0', max: '3.262.1' } };
const GAME_CLASSIC = [3, 262, 1];

function norm(t) { t = String(t || 'as64').toLowerCase(); return t === 'goh' ? 'goh' : t === 'mowas2' || t === 'classic' ? 'classic' : 'as64'; }
function want(target, version) { const n = norm(target); return n === 'goh' ? { min: version || null, max: version || null } : RANGE[n]; }

// returns { min, max } found in the text or null per key, and whether a {Mod root block exists
function scan(text) {
  const root = /^[ \t]*\{[ \t]*Mod\b/im.test(text);
  const get = k => { const m = new RegExp('\{[ \t]*' + k + '[ \t]+"([^"]*)"[ \t]*\}', 'i').exec(text); return m ? m[1] : null; };
  return { root, min: get('MinGameVersion'), max: get('MaxGameVersion') };
}
// GoH: the same, but a key on a line after ';' (a comment) is not read; tags = the words of {tags "..."}
function liveAt(text, re) {   // first match whose line has no ';' before it -> match | null
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(text))) { const ls = text.lastIndexOf('\n', m.index - 1) + 1; if (!text.slice(ls, m.index).includes(';')) return m; }
  return null;
}
const keyRe = k => new RegExp('\\{[ \\t]*' + k + '[ \\t]+"([^"]*)"[ \\t]*\\}', 'i');
function scanGoh(text) {
  const root = !!liveAt(text, /^[ \t]*\{[ \t]*Mod\b/im);
  const get = k => { const m = liveAt(text, keyRe(k)); return m ? m[1] : null; };
  const tags = get('Tags');
  return { root, min: get('MinGameVersion'), max: get('MaxGameVersion'), tags: tags === null ? [] : tags.split(/\s+/).filter(Boolean) };
}
function goodGoh(version, min, max, tags) {
  if ((tags || []).some(t => t.toLowerCase() === 'develop')) return true;
  const g = C.verParse(version || ''), v = C.verParse(min || ''), w = C.verParse(max || '');
  if (!g.length) return false;
  return (!v.length || C.verCmp(g, v) >= 0) && (!w.length || C.verCmp(g, w) <= 0);
}
function good(target, min, max) {
  const v = C.verParse(min || ''), w = C.verParse(max || '');
  if (!v.length) return false;
  if (norm(target) === 'as64') return C.verCmp(v, C.MODERN_MIN) >= 0 && !max;
  return C.verCmp(v, C.MODERN_MIN) < 0 && C.verCmp(v, GAME_CLASSIC) <= 0 && w.length > 0 && C.verCmp(w, GAME_CLASSIC) >= 0;
}
function setKey(text, key, val, nl, live) {
  const re = new RegExp('(\{[ \t]*' + key + '[ \t]+")[^"]*("[ \t]*\})', 'i');
  if (live) { const m = liveAt(text, re); if (m) return text.slice(0, m.index) + m[1] + val + m[2] + text.slice(m.index + m[0].length); }
  else if (re.test(text)) return text.replace(re, (m, a, b) => a + val + b);
  const line = '\t{' + key + ' "' + val + '"}' + nl, i = text.lastIndexOf('}');   // before the closing brace of {Mod
  const at = text.lastIndexOf(nl, i) >= 0 && text.slice(text.lastIndexOf(nl, i) + nl.length, i).trim() === '' ? text.lastIndexOf(nl, i) + nl.length : i;
  return text.slice(0, at) + line + text.slice(at);
}
function dropKey(text, key) {
  return text.replace(new RegExp('^[ \t]*\{[ \t]*' + key + '[ \t]+"[^"]*"[ \t]*\}[ \t]*\r?\n', 'im'), '').replace(new RegExp('\{[ \t]*' + key + '[ \t]+"[^"]*"[ \t]*\}', 'i'), '');
}
// GoH folder name rule (GHVFS-27 [V]): a byte >= 0x80, a space or one of <>+[]{}!@#$%^&*-=;:|'" -> skipped
function folderOk(name) {
  const bad = [...String(name)].filter(ch => ch.charCodeAt(0) >= 0x80 || ' <>+()[]{}!@#$%^&*-=;:|\'"'.includes(ch));
  if (!bad.length) return null;
  const fix = [...String(name)].map(ch => bad.includes(ch) ? '_' : ch).join('').replace(/_+/g, '_');
  return `folder name "${name}" has ${[...new Set(bad)].map(c => c === ' ' ? 'a space' : '"' + c + '"').join(', ')}: GoH skips such a mod folder (only "invalid mod folder name" in game.log, GHVFS-27); rename it with letters, digits, _ and ., e.g. ${fix}`;
}

function planGoh(dir, before, version, res) {
  const s = scanGoh(before);
  if (!s.root) { res.ok = false; res.cant.push({ key: 'mod.info', code: 'FIX_MODINFO_UNREADABLE', msg: 'mod.info has no {Mod ...} block, so its version lines cannot be fixed here; make a fresh one with ARSENAL new --target goh and copy the Name and Desc lines' }); return res; }
  if (!C.verParse(version || '').length) { res.ok = false; res.cant.push({ key: 'mod.info', code: 'FIX_MODINFO_GOH_VERSION', msg: 'the GoH version could not be read from binaries/x64/call_to_arms.exe, so the range cannot be checked; pass --game-version (e.g. 1.067)' }); return res; }
  if (goodGoh(version, s.min, s.max, s.tags)) return res;
  const nl = /\r\n/.test(before) ? '\r\n' : '\n', why = [];
  let after = before;
  if (s.min !== version) { after = setKey(after, 'MinGameVersion', version, nl, true); why.push(s.min === null ? `MinGameVersion was missing: set to ${version}` : `MinGameVersion "${s.min}" does not fit GoH ${version}: set to ${version}`); }
  if (s.max !== version) { after = setKey(after, 'MaxGameVersion', version, nl, true); why.push(s.max === null ? `MaxGameVersion was missing: set to ${version}` : `MaxGameVersion "${s.max}" does not fit GoH ${version}: set to ${version}`); }
  if (after === before) return res;
  res.ok = false;
  res.edits.push({ kind: 'modinfo', key: 'mod.info', out: 'mod.info.fixed', before: Buffer.from(before, 'latin1'), after: Buffer.from(after, 'latin1'), why, targets: [], lines: new Set(), info: { min: version, max: version } });
  return res;
}

function plan(dir, target, opt = {}) {
  const f = path.join(dir, 'mod.info'), res = { edits: [], cant: [], ok: true, none: false };
  if (!fs.existsSync(f)) { res.none = true; return res; }
  const before = fs.readFileSync(f, 'latin1'), tn = norm(target);
  if (tn === 'goh') return planGoh(dir, before, opt.version, res);
  const s = scan(before), w = want(target);
  if (!s.root) { res.ok = false; res.cant.push({ key: 'mod.info', code: 'FIX_MODINFO_UNREADABLE', msg: 'mod.info has no {Mod ...} block, so its version lines cannot be fixed here; make a fresh one with ARSENAL new and copy the Name and Desc lines' }); return res; }
  // no --target: a range that already works in either form is left alone (a good Classic mod is not turned into an as64 one); a broken one gets the as64 form
  if (good(tn, s.min, s.max) || (!target && good('classic', s.min, s.max))) return res;
  const nl = /\r\n/.test(before) ? '\r\n' : '\n', why = [];
  let after = before;
  if (s.min !== w.min) {
    after = setKey(after, 'MinGameVersion', w.min, nl);
    why.push(s.min === null ? `MinGameVersion was missing: set to ${w.min}` : `MinGameVersion "${s.min}" does not fit the ${tn === 'as64' ? 'as64 game' : 'Classic game 3.262'}: set to ${w.min}`);
  }
  if (w.max === null && s.max !== null) { after = dropKey(after, 'MaxGameVersion'); why.push(`MaxGameVersion "${s.max}" removed (as64 mods have no Max, so a newer game still loads them)`); }
  else if (w.max !== null && s.max !== w.max) { after = setKey(after, 'MaxGameVersion', w.max, nl); why.push(s.max === null ? `MaxGameVersion was missing: set to ${w.max}` : `MaxGameVersion "${s.max}" does not fit Classic 3.262: set to ${w.max}`); }
  if (after === before) return res;
  res.ok = false;
  res.edits.push({ kind: 'modinfo', key: 'mod.info', out: 'mod.info.fixed', before: Buffer.from(before, 'latin1'), after: Buffer.from(after, 'latin1'), why, targets: [], lines: new Set(), info: { min: w.min, max: w.max } });
  return res;
}
module.exports = { plan, want, norm, scan, scanGoh, good, goodGoh, folderOk, RANGE };

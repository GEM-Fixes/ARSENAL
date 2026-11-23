// bots parts "buycheck" and "stages": the mods a mod folder is built on, so their buy cards count as real cards.
//   depsOf(ctx, mod) -> {info, list: [{id, dir, title, how: 'require'}], missing: [id]}: the mod.info Require closure, deps first (the
//     rule of lib/vfs SortByDependencies and gui/ext/task depsOf), looked up with lib/vfs discover in the game's mods folder (Workshop
//     items too; as64+ = <game>/as64/plus, AS64 only) and beside the mod when it sits in some other <root>/mods folder.
//   guess(ctx, mod, info) -> [{id, dir, title, score}]: a mod with no Require that still needs another mod (a mod "for RobZ" that never
//     says Require): the sibling mods whose folder name or title words the mod's own title, folder name and description use, best first.
//     The caller mounts the best one or two and keeps one only when it really holds the missing buy cards [I: word match, then proof].
// Author: Imperator_Aug (ARSENAL, ia-f56cc9ea)
'use strict';
const fs = require('fs'), path = require('path');
const lib = require('../../lib');
const L = path.join(__dirname, '..', '..', '..', '..', '..', 'lib');
const vfs = require(path.join(L, 'vfs')), sdl = require(path.join(L, 'sdl')), { readText } = require(path.join(L, 'enc')), names = require(path.join(L, 'names'));

function readInfo(dir) {
  const mi = ['mod.info', 'Mod.info', 'MOD.INFO'].map(f => path.join(dir, f)).find(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
  if (!mi) return null;
  try {
    const root = sdl.kids(sdl.parseLines(readText(mi, 'cp1251').lines), 'mod')[0];
    const vals = k => (root ? sdl.kids(root, k).map(b => (b.vals.length ? String(b.vals[0].v) : '')) : []);
    return { title: vals('Name').pop() || '', desc: vals('Desc').join(' '), requires: vals('Require').map(s => names.normalize(s.split(':')[0]).trim()).filter(Boolean) };
  } catch (e) { return { title: '', desc: '', requires: [] }; }
}
// every mod the game (and the mods folder the mod sits in) knows: id -> {id, dir, title, requires, builtIn}
function pool(ctx, mod) {
  const G = lib.gameOf(ctx), out = new Map(), put = (m, where) => { if (!out.has(m.id)) out.set(m.id, { id: m.id, dir: m.dir, title: m.title || m.folder || m.id, requires: m.requires || [], builtIn: !!m.builtIn, where }); };
  const roots = [];
  if (G.dir) roots.push({ dir: G.dir, o: G.kind === 'goh' ? { items: true } : { plus: (G.exe == null || G.exe === 'as64') && fs.existsSync(path.join(G.dir, 'as64.exe')) } });
  const parent = path.dirname(path.resolve(mod));
  if (path.basename(parent).toLowerCase() === 'mods') { const r = path.dirname(parent); if (!roots.some(x => path.resolve(x.dir).toLowerCase() === path.resolve(r).toLowerCase())) roots.push({ dir: r, o: { workshop: false } }); }
  for (const r of roots) { try { for (const m of vfs.discover(r.dir, [], r.o).values()) put(m, r.dir); } catch (e) { /* unreadable folder */ } }
  return out;
}
const selfId = mod => names.normalize(path.basename(path.resolve(mod)));
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function depsOf(ctx, mod) {
  const info = readInfo(mod), res = { info, list: [], missing: [] };
  if (!info || !info.requires.length) return res;
  const P = pool(ctx, mod), seen = new Set([selfId(mod)]);
  const visit = id => {
    if (seen.has(id)) return; seen.add(id);
    const m = P.get(id);
    if (!m) { res.missing.push(id); return; }
    for (const r of m.requires) visit(r);
    if (!same(m.dir, mod)) res.list.push({ id: m.id, dir: m.dir, title: m.title, how: 'require' });
  };
  info.requires.forEach(visit);
  return res;
}

const STOP = new Set(['mod', 'mods', 'the', 'and', 'for', 'with', 'from', 'this', 'that', 'now', 'also', 'plus', 'load', 'after', 'before', 'based', 'version', 'compatible', 'improved', 'better', 'new', 'fix', 'fixes', 'patch', 'core', 'backup', 'copy', 'test', 'testing', 'tools', 'template', 'men', 'war', 'assault', 'squad']);
const words = s => String(s || '').toLowerCase().split(/[^a-z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, '')).filter(Boolean);
const verOf = w => (/^\d+\.\d+/.exec(w) || [])[0] || null;
function guess(ctx, mod, info) {
  info = info || readInfo(mod) || { title: '', desc: '', requires: [] };
  const mine = words(path.basename(mod) + ' ' + info.title + ' ' + info.desc), have = new Set(mine), vers = new Set(mine.map(verOf).filter(Boolean)), me = selfId(mod);
  const out = [];
  for (const m of pool(ctx, mod).values()) {
    if (m.id === me || same(m.dir, mod) || m.builtIn || m.requires.includes(me)) continue;
    const ws = [...new Set(words(path.basename(m.dir) + ' ' + m.title))];
    let score = 0;
    for (const w of ws) { if (w.length < 3 || STOP.has(w) || /^[\d.x]+$/.test(w)) continue; if (have.has(w)) score += 2; }
    if (!score) continue;
    for (const w of ws) { const v = verOf(w); if (v && vers.has(v)) score += 1; }
    if (/backup|copy|old/i.test(path.basename(m.dir))) score -= 1;
    out.push({ id: m.id, dir: m.dir, title: m.title, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.title < b.title ? -1 : 1));
}

module.exports = { depsOf, guess, readInfo, pool };

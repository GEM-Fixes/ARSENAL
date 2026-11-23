// recipe "make or change a gun or weapon" 4.3): kind, what to copy, id and name, model, skin, ammunition, the numbers one
// by one, sounds, animations, effects, inventory, who carries it, vehicle mount. Writes through gen ops only: a new rifle, machine gun or
// launcher is `clone {stuff, tags, name, set}` (the overrides go into the new file in one step, so the dry run sees them); a new cannon is
// `gun {name, like, ..}` + `set` rows on the file it made; a change is `set` rows (op add, root path) on the thing's own file, or `macro`
// where that file sets the value through a macro call (("speed" s(..)), ("recoveryTime" r(..)), ("damage" a()..e()), ("range_x") ..).
// Carriers: `kit`; a cannon on a vehicle: `weapon`; a new fire or reload sound from the PC: copies into resource/sound/weapon/.
// The stuff reader (lib below, also used by ammo and item) reads the effective values through tools/lib sdlset (mod folder over the game,
// the stuff folder's .presets macros expanded) and follows {from "<tags>"} by file name tags.  Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-0cef45db)
'use strict';
const fs = require('fs'), path = require('path');

// ---------------------------------------------------------------------------------------------------------------------------------
// shared stuff reader (gun, ammo, item)
const lc = s => String(s == null ? '' : s).toLowerCase();
const SRC = new Map();
const GM = () => require('../../../../lib/games');
function gidOf(ctx) { let x = null; try { x = ctx && (typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId); } catch (e) { x = null; } return GM().idOf(x) || 'as64'; }
// Gates of Hell: its cannons keep their numbers in gun/.presets macro calls; gunammo.goh.js reads and writes those (values, compile,
// lookups below hand over to it on the GoH tab); naGoh stays for the other recipes that use it
const GOH = () => require('./gunammo.goh');
const naGoh = what => 'Not available in GoH: ' + what + ' (GHKEY-59, goh-data-diff.md item 4)';
// the game: ctx.gameId (the gui.js function, or the draft's word that lib/compile.js lookupCtx and the compile below put there).
// as64 or none: the source as before (vfs picks as64 first); mowas2: the mowas_2 file set (no as64/core); goh: null (AS2 forms only)
function source(ctx, mod) {
  let g = null; try { g = ctx && ctx.game && ctx.game(); } catch (e) { g = null; }
  if (!g || !fs.existsSync(g)) return null;
  const gid = gidOf(ctx);
  if (gid === 'goh') return null;
  let m = ''; try { m = mod && fs.existsSync(mod) && fs.statSync(mod).isDirectory() ? path.resolve(mod) : ''; } catch (e) { m = ''; }
  const k = path.resolve(g).toLowerCase() + '|' + m.toLowerCase() + (gid === 'as64' ? '' : '|' + gid);
  let c = SRC.get(k);
  if (!c || Date.now() - c.t > 60000) {
    const S = require('../../../../lib/sdlset');
    const so = { gameDir: g, folder: m || undefined }; if (gid !== 'as64') so.exe = GM().exeOf(gid);
    c = { t: Date.now(), s: S.createSource(so), stuff: null, mod: m, game: g, gid };
    SRC.set(k, c); if (SRC.size > 4) SRC.delete(SRC.keys().next().value);
  }
  return c;
}
function keys(c, re) {
  const out = new Set();
  if (c.s.v) for (const k of c.s.v.files.keys()) if (re.test(k)) out.add(k);
  for (const k of c.s.local.keys()) if (re.test(k)) out.add(k);
  try { for (const k of c.s.packed().keys()) if (re.test(k)) out.add(k); } catch (e) { /* no paks */ }
  return [...out].sort();
}
const STUFF = 'resource/set/stuff/';
function stuff(c) { return c.stuff || (c.stuff = keys(c, /^resource\/set\/stuff\/.+[^/]$/).filter(k => !/\/\.presets$|\.fsm$|\/_settings\/|\.(accuracy|hand)$/.test(k))); }
const tagsOf = k => k.slice(k.lastIndexOf('/') + 1).toLowerCase().split('.').filter(Boolean);
// the stuff a {from "tags"} or a query names: file name tags hold every word; an exact tag set wins, then the same folder, then the shortest
function find(c, q, near) {
  const want = lc(q).split(/\s+/).filter(Boolean);
  if (!want.length) return null;
  const hits = stuff(c).filter(k => { const t = tagsOf(k); return want.every(w => t.includes(w)); });
  if (!hits.length) return null;
  const ex = hits.filter(k => tagsOf(k).length === want.length), pool = ex.length ? ex : hits;
  if (near) { const d = near.slice(0, near.lastIndexOf('/') + 1), same = pool.filter(k => k.startsWith(d)); if (same.length) return same[0]; }
  return pool.slice().sort((a, b) => tagsOf(a).length - tagsOf(b).length)[0];
}
const nm = n => n && n.items && n.items[0] ? lc(n.items[0].text) : '';
const sval = n => !n ? undefined : n.k === 'STRING' ? (n.value !== undefined ? n.value : String(n.text).replace(/^"|"$/g, '')) : (n.k === 'INTEGER' || n.k === 'FLOAT') ? Number(n.value !== undefined ? n.value : n.text) : n.text;
function readTree(c, key) {
  const b = c.s.get(key); if (!b) return null;
  try { const r = c.s.read({ key, file: key, get: () => b }, () => {}); if (!r || !r.root) return null;
    // the folder's .presets file is read in front of the stuff file (set/stuff/gun/.presets: {curve ..}): the file's own block is the one from it
    const bs = r.root.items.filter(n => n.k === 'BLOCK'); return bs.find(n => n.file === key) || bs[0] || null; } catch (e) { return null; }
}
// key, its {from} parent, .. nearest first: [{key, b}]
function chain(c, key) {
  const out = [], seen = new Set(); let k = key;
  while (k && !seen.has(k) && out.length < 10) {
    seen.add(k);
    const b = readTree(c, k); if (!b) break;
    out.push({ key: k, b });
    if (nm(b) !== 'from') break;
    k = find(c, String(sval(b.items[1]) || ''), k);
  }
  return out;
}
const kids = (b, n) => (b.items || []).filter(x => x.k === 'BLOCK' && nm(x) === n);
function walk(b, parts) { let n = b; for (const s of parts) { const ks = kids(n, s); n = ks[ks.length - 1]; if (!n) return null; } return n; }
// nearest file that has the path; inside one file the last block of a name wins [I]
function node(ch, p) { const parts = lc(p).split('/'); for (const f of ch) { const n = walk(f.b, parts); if (n) return n; } return null; }
const vals = n => n ? n.items.slice(1).filter(x => x.k !== 'BLOCK').map(sval) : [];
const num = (ch, p, i) => { const v = vals(node(ch, p))[i || 0]; return typeof v === 'number' ? v : (v != null && v !== '' && !isNaN(+v) ? +v : undefined); };
const str = (ch, p, i) => { const v = vals(node(ch, p))[i || 0]; return v == null ? undefined : String(v); };
const r4 = v => Math.round(v * 10000) / 10000;
const fmt = v => typeof v === 'number' ? String(r4(v)) : '"' + String(v).replace(/"/g, '') + '"';
function text(n) { const p = [n.items[0].text]; for (const x of n.items.slice(1)) p.push(x.k === 'BLOCK' ? text(x) : x.k === 'IDENT' ? x.text : fmt(sval(x))); return '{' + p.join(' ') + '}'; }
// the children of a nested block over the whole chain (nearer files win per child name): Map name -> '{x ..}'
function merged(ch, p) {
  const m = new Map(), parts = lc(p).split('/');
  for (let i = ch.length - 1; i >= 0; i--) { const n = walk(ch[i].b, parts); if (!n) continue; for (const x of n.items.slice(1)) if (x.k === 'BLOCK') m.set(nm(x), text(x)); }
  return m;
}
// the body of block p (its own values, then every child), with child edits {name: 'values' | null (drop it)} put in
function body(ch, p, edits, head) {
  const m = merged(ch, p);
  for (const [k, v] of Object.entries(edits || {})) { if (v === null) m.delete(lc(k)); else m.set(lc(k), '{' + k + (v === '' ? '' : ' ' + v) + '}'); }
  const own = head !== undefined ? [head] : vals(node(ch, p)).map(fmt);
  return own.concat([...m.values()]).join(' ').trim();
}
// the raw (unexpanded) file: root block name and what a path is there (block, a macro call list, or nothing)
function raw(c, key) {
  const b = c.s.get(key); if (!b) return null;
  const W = require('../../../../lib/sdlwrite');
  let t; try { t = W.parse(b); } catch (e) { return null; }
  const r = t.root.items.find(n => n.type === 'block');
  if (!r) return null;
  const at = p => { const n = W.find(t, r.name + '/' + lc(p)); return n ? n.type : null; };
  const calls = []; (function w(n) { for (const x of n.items || []) { if (x.type === 'list' && x.items[0] && x.items[0].type === 'string') calls.push(lc(x.items[0].text.replace(/"/g, ''))); if (x.items) w(x); } })(r);
  return { root: r.name, at, calls, inMod: !!(c.mod && fs.existsSync(path.join(c.mod, key))) };
}
// change rows for one stuff file: edits [{p: 'speed' | 'burst/short', v: 'text', del?, head?}]. head: v is the block's own values (its
// children kept). A top level key the file sets by a macro call of the same name is refused here (the caller handles speed, recoveryTime
// and damage through the macro op); a nested key whose parent block the file does not have itself gets the whole parent block (every
// inherited child kept, a dropped flag left out) added at the end of the file [I: later wins]. A flag the file only inherits cannot be
// dropped where its parent is the file's own block: skipped (said in notes by the caller).
function rows(key, rw, ch, edits) {
  const out = [], skipped = [], byParent = new Map(), heads = new Map(), ent = 'file:' + key;
  const grp = p => { if (!byParent.has(p)) byParent.set(p, {}); return byParent.get(p); };
  // a quoted first value on a path the file has is addressed as name[0]: patch-entity takes a new quoted value on a bare name as a
  // new keyed sibling line ({cursor "a"} then {cursor "b"}); name[0] sets that line (several values replace its run, arity kept)
  const put = (rel, v) => {
    if (rw.at(rel) === 'block' && /^\s*"/.test(v)) out.push({ entity: ent, path: rw.root + '/' + rel + '[0]', value: v, op: 'add' });
    else out.push({ entity: ent, path: rw.root + '/' + rel, value: v, op: 'add' });
  };
  for (const e of edits) {
    const parts = e.p.split('/');
    if (e.head) { if (rw.at(e.p) === 'list') skipped.push(e.p); else { heads.set(e.p, e.v); grp(e.p); } continue; }
    if (parts.length === 1) {
      const at = rw.at(e.p);
      if (at === 'list') { skipped.push(e.p); continue; }
      if (e.del) { if (at === 'block') out.push({ entity: ent, path: rw.root + '/' + e.p, value: '', op: 'del' }); else skipped.push(e.p); continue; }
      put(e.p, e.v);
    } else {
      const par = parts.slice(0, -1).join('/'), k = parts[parts.length - 1];
      if (e.del) {
        if (rw.at(e.p) === 'block') out.push({ entity: ent, path: rw.root + '/' + e.p, value: '', op: 'del' });
        else if (rw.at(par) === 'block') skipped.push(e.p);
        else grp(par)[k] = null;
        continue;
      }
      grp(par)[k] = e.v;
    }
  }
  // a nested block the file does not have goes whole (every inherited child kept) into its parent, deepest first, so two edits
  // under one missing block make one block
  for (;;) {
    const fold = [...byParent.keys()].filter(p => p.includes('/') && !['block', 'list'].includes(rw.at(p)) && rw.at(p.slice(0, p.lastIndexOf('/'))) !== 'list')
      .sort((x, y) => y.split('/').length - x.split('/').length)[0];
    if (!fold) break;
    const up = fold.slice(0, fold.lastIndexOf('/')), v = body(ch, fold, byParent.get(fold), heads.get(fold));
    byParent.delete(fold); heads.delete(fold);
    grp(up)[fold.slice(fold.lastIndexOf('/') + 1)] = v;
  }
  for (const [par, ed] of byParent) {
    const at = rw.at(par), head = heads.get(par);
    if (at === 'list') { skipped.push(par); continue; }
    if (at === 'block') {
      if (head !== undefined) put(par, head);
      for (const [k, v] of Object.entries(ed)) if (v !== null) put(par + '/' + k, v);
      continue;
    }
    out.push({ entity: ent, path: rw.root + '/' + par, value: body(ch, par, ed, head), op: 'add' });
  }
  return { rows: out, skipped };
}
// clone set entries (make): top level {k v}; nested edits (and a head) become the whole parent block
function cloneSets(ch, edits) {
  const out = [], byParent = new Map(), heads = new Map();
  const grp = p => { if (!byParent.has(p)) byParent.set(p, {}); return byParent.get(p); };
  for (const e of edits) {
    const parts = e.p.split('/');
    if (parts.length === 1) { if (e.del) continue; if (e.head) { heads.set(e.p, e.v); grp(e.p); } else out.push(e.p + '=' + e.v); continue; }
    grp(parts.slice(0, -1).join('/'))[parts[parts.length - 1]] = e.del ? null : e.v;
  }
  for (const [par, ed] of byParent) { if (par.includes('/')) continue; out.push(par + '=' + body(ch, par, ed, heads.get(par))); }
  return out;
}
// what a model answer names as {entity}: an inventory model id, or the model task's result {folder, file, mdl}
function entityOf(x) {
  if (x && typeof x === 'object') return String(x.folder ? String(x.folder).replace(/\/+$/, '').split('/').pop() : x.file || '');
  return x == null ? '' : String(x);
}
// one advanced question table row -> an edit: {id, p, t: num | flag | word | quoted | list | pairs | text}
// num: the number; flag: yes adds {X}, no drops it; word: as typed; quoted: "x"; list: numbers on one line; pairs: list lines "a b" -> {a b} ..
function advEdit(row, value) {
  const t = row.t || 'num';
  if (t === 'flag') return value ? { p: row.p, v: '' } : { p: row.p, del: true };
  if (t === 'quoted') return { p: row.p, v: '"' + String(value).replace(/"/g, '').trim() + '"', head: row.head };
  if (t === 'list') return { p: row.p, v: String(value).trim().split(/[\s,]+/).filter(Boolean).join(' ') };
  if (t === 'pairs') return { p: row.p, v: [].concat(value || []).map(s => String(s).trim().split(/\s+/)).filter(x => x.length === 2).map(x => '{' + x.join(' ') + '}').join(' ') };
  if (t === 'word') return { p: row.p, v: String(value).trim() };
  return { p: row.p, v: String(r4(Number(value))) };
}
// the value of one advanced row from the reader chain
function advValue(ch, row) {
  const t = row.t || 'num', n = node(ch, row.p);
  if (t === 'flag') return !!n;
  if (!n) return undefined;
  if (t === 'num') return num(ch, row.p);
  if (t === 'list') return vals(n).join(' ');
  if (t === 'pairs') return (n.items || []).slice(1).filter(x => x.k === 'BLOCK').map(x => [x.items[0].text].concat(vals(x)).join(' '));
  return str(ch, row.p);
}
// a sound folder's effective settings (folder.set of it and every parent folder, nearest wins): {loudness, signal, volume}
function folderSet(c, dir) {
  const out = {}, parts = String(dir || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  for (let i = parts.length; i >= 0; i--) {
    const b = c.s.get('resource/sound/' + parts.slice(0, i).concat('folder.set').join('/'));
    if (!b) continue;
    const t = b.toString('latin1');
    const lo = /\{\s*loudness\s+"([^"]*)"/i.exec(t), si = /\{\s*signal\s+([A-Za-z_]\w*)\s+([\d.]+)/i.exec(t), vo = /\{\s*volume\s+([\d.]+)/i.exec(t);
    if (lo && out.loudness === undefined) out.loudness = lo[1];
    if (si && out.signal === undefined) out.signal = Number(si[2]);
    if (vo && out.volume === undefined) out.volume = Number(vo[1]);
  }
  return out;
}
// the names a player sees (.lng desc/{weapon|stuff|ammo|human}/..): game interface/text and mod localization files (mission texts
// left out); '#' files load first and lose to plain ones (LOC-19 [I]), the mod's after the game's. Cached with the source
function lngNames(c) {
  if (c.names) return c.names;
  const out = new Map(); c.names = out;
  let lp; try { lp = require('../../../../upgrade/lib/lngpot'); } catch (e) { return out; }
  const rel = k => k.replace(/^.*?(interface\/text|localization)\//i, '');
  const files = keys(c, /(^|\/)(interface\/text|localization)\/[^/]+\.lng$/i)
    .sort((a, b) => (rel(a).startsWith('#') ? 0 : 1) - (rel(b).startsWith('#') ? 0 : 1) || (c.s.local.has(a) ? 1 : 0) - (c.s.local.has(b) ? 1 : 0));
  for (const k of files) {
    let kv; try { const b = c.s.get(k); if (!b) continue; kv = lp.lngKeys(b, rel(k)); } catch (e) { continue; }
    for (const [key, t] of kv) if (/^desc\/(weapon|stuff|ammo|human)\//i.test(key)) out.set(lc(key), String(t).replace(/<[^>]*>/g, '').replace(/\\n/g, ' ').split('\n')[0].trim());
  }
  return out;
}
// the name key of a stuff file: desc/{ammo|weapon|stuff}/<file tags minus grenade pattern ammo weapon> (modweb localization/keys.md
// [V]); the kind follows the ammo tag, else whichever of weapon / stuff the texts have [I]
function stuffName(c, k) {
  const N = lngNames(c), t = tagsOf(k), w = t.filter(x => !['grenade', 'pattern', 'ammo', 'weapon'].includes(x)).join(' ');
  if (t.includes('ammo')) return N.get('desc/ammo/' + w) || '';
  return N.get('desc/weapon/' + w) || N.get('desc/stuff/' + w) || '';
}
// search words match the player name and the file path both; a result whose name or file is the words exactly comes first
const hit = (ws, ...hay) => { const s = hay.map(lc).join(' | '); return ws.every(w => s.includes(w)); };
function lookupStuff(ctx, words, opt, test) {
  const c = source(ctx, opt && opt.mod); if (!c) return [];
  const ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [], exact = new Set();
  for (const k of stuff(c)) {
    const rel = k.slice(STUFF.length);
    if (!test(rel, k)) continue;
    const file = k.slice(k.lastIndexOf('/') + 1), player = stuffName(c, k);
    if (ws.length && !hit(ws, rel, player)) continue;
    const r = { id: tagsOf(k).join(' '), name: player || file, where: c.s.local.has(k) ? 'mod' : 'game', ref: { key: k }, sub: rel };
    if (ws.length && (file === ws.join('.') || lc(player) === ws.join(' '))) exact.add(r);
    out.push(r);
  }
  out.sort((a, b) => (exact.has(a) ? 0 : 1) - (exact.has(b) ? 0 : 1) || a.sub.localeCompare(b.sub));
  return out;
}
function lookupKeys(ctx, words, opt, re, idOf, nameOf) {
  const c = source(ctx, opt && opt.mod); if (!c) return [];
  const ws = lc(words).split(/[\s,]+/).filter(Boolean), seen = new Set(), out = [];
  for (const k of keys(c, re)) {
    const id = idOf(k); if (!id || seen.has(id)) continue;
    const player = nameOf ? nameOf(c, id) || '' : '';
    if (ws.length && !hit(ws, k, player)) continue;
    seen.add(id); out.push({ id, name: player || id, where: c.s.local.has(k) ? 'mod' : 'game', ref: { key: k }, sub: k });
  }
  return out;
}
// the root block of a stuff file at the end of its {from} chain (weapon, item, bullet ..), cached with the source
function rootOf(c, key) {
  const m = c.roots || (c.roots = new Map());
  if (!m.has(key)) { const ch = chain(c, key); m.set(key, ch.length ? nm(ch[ch.length - 1].b) : ''); }
  return m.get(key);
}
// a new stuff id is taken when a game or mod stuff file has it as its name (file tags without .ammo, joined by dots) or, for an id
// without dots, as its first tag ({from "x"}, {filling "x"} and kit lines find a file by its tags)
function takenId(c, id) {
  const w = lc(id).trim(); if (!w) return false;
  return stuff(c).some(k => { const t = tagsOf(k); return t.filter(x => x !== 'ammo').join('.') === w || (!w.includes('.') && t[0] === w); });
}
// a free id next to the copy's: name_2, name_3 .. (a dotted id grows its last part: bullet75.fg -> bullet75.fg2)
function freeId(c, id) {
  const b = lc(id).replace(/[^a-z0-9_.]+/g, '_').replace(/^_+|_+$/g, '') || 'new';
  for (let i = 2; i < 200; i++) { const x = b.includes('.') ? b + i : b + '_' + i; if (!takenId(c, x)) return x; }
  return b + '_new';
}
// the unique lookup of a new id question: {results: [], exact: taken}
const idLookup = async (ctx, w, o) => { const c = source(ctx, o && o.mod); return { results: [], exact: !!c && takenId(c, w) }; };
// the weapon places of a vehicle def ({place "<name>" .. {weapon "<gun>"} ..} blocks): [{place, weapon, key}]
function placesOf(c, ent) {
  const id = lc(ent).trim(); if (!c || !/^[a-z0-9_()\-.]+$/.test(id)) return [];
  const ks = keys(c, new RegExp('^resource/entity/.*/' + id.replace(/[().\-]/g, '\\$&') + '\\.def$'));
  const out = [];
  for (const k of ks) {
    const t = c.s.get(k).toString('latin1');
    for (const m of t.matchAll(/\{\s*place\s+"([^"]+)"/gi)) {
      let d = 0, e = m.index; for (; e < t.length; e++) { if (t[e] === '{') d++; else if (t[e] === '}' && --d === 0) break; }
      const w = /\{\s*weapon\s+"([^"]+)"/i.exec(t.slice(m.index, e + 1));
      if (w && !out.some(x => x.place === lc(m[1]))) out.push({ place: lc(m[1]), weapon: lc(w[1]), key: k });
    }
    if (out.length) break;
  }
  return out;
}
const invModels = (ctx, w, o) => lookupKeys(ctx, w, o, /^resource\/entity\/inventory\/.+\.def$/, k => k.slice(k.lastIndexOf('/') + 1).replace(/\.def$/, ''));
const breeds = (ctx, w, o) => lookupKeys(ctx, w, o, /^resource\/set\/breed\/mp\/[a-z0-9_]+\/[a-z0-9_]+\.set$/, k => k.replace(/^resource\/set\/breed\/mp\//, '').replace(/\.set$/, ''),
  (c, id) => lngNames(c).get('desc/human/mp/' + id) || '');
// the base: a lookup result {id, ref: {key}} or a bare tag string
function baseKey(c, base) {
  if (!base) return null;
  const k = base.ref && base.ref.key ? lc(base.ref.key) : null;
  if (k && c.s.get(k)) return k;
  return find(c, String(base.id || '').replace(/\./g, ' '));
}
const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
const bad = m => Object.assign(new Error(m), { status: 400 });
// what a "who carries it" list turns into: kit ops (army/breed lines)
// a soldier that already has the item gets its count changed (gen kit add with a count sets that line in place), or is skipped for
// a weapon (no count); said in notes
function kitOps(list, item, inHands, src, notes, extra, keepCount) {
  const out = [];
  for (const b of [].concat(list || []).map(String).map(s => s.trim()).filter(Boolean)) {
    const buf = src ? src.s.get('resource/set/breed/mp/' + lc(b) + '.set') : null;
    const words = s => s.split(/\s+/).filter(Boolean).sort().join(' ');
    const names = buf ? buf.toString('latin1').toLowerCase().split(/\{\s*item\s+"/).slice(1).map(x => x.slice(0, x.indexOf('"'))) : [];
    const has = names.find(x => words(x) === words(lc(item)));
    // a soldier that has it: the count is set in place (kit add {item, count} on a held item); a weapon is left as it is
    if (has && extra && extra.count != null && !keepCount) {
      out.push({ op: 'kit', breed: b, add: [{ item: has, count: extra.count }] });
      if (notes) notes.push(b + ' already carries ' + item + ': its count becomes ' + extra.count + '.'); continue;
    }
    if (has) { if (notes) notes.push(b + ' already carries ' + item + ': left as it is.'); continue; }
    out.push({ op: 'kit', breed: b, add: [Object.assign({ item }, extra || { filled: true }, inHands === undefined ? {} : { in_hands: !!inHands })] });
  }
  return out;
}
// a file answer (staged wavs) -> copies; returns the copies and the value to write
function soundCopies(files, dir) { return [].concat(files || []).map(f => ({ staged: path.basename(f), to: dir + '/' + path.basename(f).toLowerCase().replace(/[^a-z0-9_.]/g, '_') })); }
// blast layers ({damage blastwave ..} then {damage add blastwave ..}) of the nearest file that has any: [{energy, area: [inner, outer]}]
function layers(ch) {
  for (const f of ch) {
    const ds = kids(f.b, 'damage').filter(d => d.items.some(x => x.k === 'IDENT' && lc(x.text) === 'blastwave'));
    if (!ds.length) continue;
    return ds.map(d => { const e = vals(walk(d, ['energy']))[0], a = vals(walk(d, ['area'])); return { energy: Number(e), area: [Number(a[0]), Number(a[1])] }; })
      .filter(l => isFinite(l.energy) && isFinite(l.area[0]) && isFinite(l.area[1]));
  }
  return [];
}
// new layers for the gen shell / item op: the first layer gets energy E; every area grows with the outer radius R (the last layer's outer)
function scaleLayers(ls, E, R) {
  if (!ls.length) return E != null && R != null ? [E + ' 0 ' + R] : null;
  const old = ls[ls.length - 1].area[1], k = R != null && old > 0 ? R / old : 1;
  return ls.map((l, i) => [r4(i === 0 && E != null ? E : l.energy), r4(l.area[0] * k), r4(l.area[1] * k)].join(' '));
}
// the {damage [add] <type> ..} blocks of a file's own text, in order: [{type, add, idx (0-based among the file's damage blocks, the
// set row path damage[idx]), n (1-based among blocks of that type, the gen damage_edit layer), v: {child: [values]}}]
function ownDamage(c, key) {
  const b = c && c.s.get(key); if (!b) return [];
  const W = require('../../../../lib/sdlwrite');
  let t; try { t = W.parse(b); } catch (e) { return []; }
  const r = t.root.items.find(n => n.type === 'block'); if (!r) return [];
  const per = {};
  return W.findAll(t, r.name + '/damage').map((d, idx) => {
    const ws = d.items.filter(x => x.type !== 'block').map(x => lc(x.text || x.name || '')).filter(w => w && w !== 'damage');
    const add = ws[0] === 'add', type = add ? ws[1] : ws[0], v = {};
    for (const x of d.items.filter(y => y.type === 'block')) v[lc(x.name)] = x.items.filter(y => y.type !== 'block').slice(1).map(y => y.text);
    per[type] = (per[type] || 0) + 1;
    return { type, add, idx, n: per[type], v };
  });
}
// tag words: own = the words of the file's own {tag} lines (and how many lines); all = the effective words over the chain (a "-word"
// in a nearer file drops an inherited word, as vanilla does: {tag "mrl -gun"})
function tagWords(c, key) {
  // a tag line may hold several quoted values ({tag "smallitemin1hand" "grenade" "dynamite"}, explosive/dynamite): all are words
  const lineRe = /\{\s*tag((?:\s+"[^"]*")+)/gi, qv = l => l.match(/"[^"]*"/g).map(x => x.slice(1, -1));
  const words = b => (b.toString('latin1').match(lineRe) || []).map(s => qv(s.replace(/^\{\s*tag/i, '')));
  const ch = chain(c, key), set = new Set();
  for (let i = ch.length - 1; i >= 0; i--) for (const l of words(c.s.get(ch[i].key))) for (const w of lc(l.join(' ')).split(/\s+/).filter(Boolean)) { if (w[0] === '-') set.delete(w.slice(1)); else set.add(w); }
  const ownLines = words(c.s.get(key) || Buffer.from(''));
  return { all: [...set], own: ownLines.map(l => l.join(' ')).join(' ').toLowerCase().split(/\s+/).filter(Boolean), lines: ownLines.length, vals: ownLines.length === 1 ? ownLines[0].length : 0 };
}
// what a tag answer changes: words added, words dropped from the file's own lines (gen shell / item tags "-word"), and inherited words
// a file can only cancel with a "-word" of its own [V data form, vanilla -missile / -gun; T in game]
function tagChange(tw, oldWords, newWords) {
  const o = new Set(oldWords.map(lc)), n = new Set(newWords.map(lc).filter(Boolean));
  const adds = [...n].filter(w => !o.has(w)), drops = [...o].filter(w => !n.has(w));
  return { adds, ownDrops: drops.filter(w => tw.own.includes(w)), inhDrops: drops.filter(w => !tw.own.includes(w)) };
}
// set rows for a tag change on an existing file (change) or on a new file with no tag line of its own (make by the gun op):
// one own line -> set as tag[0]; none -> a new line; several -> a new line for the added words, own drops said in notes
function tagRows(key, root, tw, tc, notes) {
  const ent = 'file:' + key, minus = tc.inhDrops.map(w => '-' + w);
  if (tw.lines === 1) {
    const words = tw.own.filter(w => !tc.ownDrops.includes(w)).concat(tc.adds, minus), value = '"' + words.join(' ') + '"';
    // several quoted values on the line ({tag "a" "b" "c"}): tag[0]#* sets the line's whole value list (patch-entity #*), one quoted
    // value per word, so one word left is one value too
    if (tw.vals > 1) return [{ entity: ent, path: root + '/tag[0]#*', value: words.map(w => '"' + w + '"').join(' '), op: 'add' }];
    return [{ entity: ent, path: root + '/tag[0]', value, op: 'add' }];
  }
  if (tw.lines > 1 && tc.ownDrops.length) notes.push('Tag words: this file has several {tag} lines; ' + tc.ownDrops.join(', ') + ' was not dropped (change it in the Editor).');
  const add = tc.adds.concat(minus);
  return add.length ? [{ entity: ent, path: root + '/tag', value: '"' + add.join(' ') + '"', op: tw.lines ? 'append' : 'add' }] : [];
}
const LIB = { gidOf, naGoh, rootOf, takenId, freeId, idLookup, placesOf, lngNames, stuffName, ownDamage, tagWords, tagChange, tagRows, entityOf, advEdit, advValue, folderSet, layers, scaleLayers, source, keys, stuff, find, chain, node, vals, num, str, text, merged, body, raw, rows, cloneSets, lookupStuff, lookupKeys, invModels, breeds, baseKey, same, bad, kitOps, soundCopies, tagsOf, fmt, r4, lc };

// ---------------------------------------------------------------------------------------------------------------------------------
// the gen gun op's classes and the stuff folders a like of that class is found in (tools/gen/lib/ops-asset.js CLASS_DIRS)
const KINDS = ['rifle', 'mg', 'smg', 'pistol', 'launcher', 'cannon', 'mounted'];
const CLASS_DIRS = { rifle: ['rifle'], mg: ['mgun'], smg: ['smg'], pistol: ['pistol'], launcher: ['bazooka', 'reactive'], cannon: ['gun'], mounted: ['gun', 'mgun', 'flame', 'reactive', 'bombing'] };
const NOT_CANNON = KINDS.filter(k => k !== 'cannon');
const BURSTY = ['rifle', 'mg', 'smg', 'mounted'];
// the range_* and accuracy_* presets of set/stuff/gun/.presets (vanilla)
const RANGE_P = ['autocannon', 'zenite', 'zenite_long', 'minimum', 'short', 'medium', 'long', 'maximum', 'light_howitzer', 'grazing_howitzer', 'medium_howitzer', 'heavy_howitzer'];
const ACC_P = ['minimum', 'low', 'medium', 'high', 'maximum', 'zenite_low', 'zenite_medium', 'zenite_high', 'lighthowitzer', 'grazinghowitzer', 'grazinghowitzer2', 'howitzer'];
const FSM = ['smg', 'pistol', 'bazooka', 'stuff', 'belt', 'hand-only'];
const ANIM = { normal: ['reload', 'unload', 'fire', 'aim', 'can-aim'], bazooka: ['reload-bazooka', 'unload-bazooka', 'fire-bazooka', 'aim-bazooka', 'can-aim-bazooka'], thrower: ['reload', 'unload', 'fire', 'aim-thrower', 'can-aim-thrower'] };
const ANIM_K = ['reload', 'unload', 'fire', 'aim', 'can_aim'];
const topDir = key => key.slice(STUFF.length).split('/')[0];
const kindOf = key => { const d = topDir(key); return d === 'gun' ? 'cannon' : d === 'mgun' ? 'mg' : d === 'smg' ? 'smg' : d === 'pistol' ? 'pistol' : ['bazooka', 'reactive'].includes(d) ? 'launcher' : ['flame', 'bombing'].includes(d) ? 'mounted' : 'rifle'; };
const q = (id, kind, covers, o) => Object.assign({ id, kind, ask: 'task.gun.q.' + id, help: 'task.gun.h.' + id, covers }, o || {});
const NC = { kindq: NOT_CANNON };
const MOUNTABLE = ['cannon', 'mounted', 'mg'];
const LOUD = ['default', 'shoot muted', 'shoot normal', 'shoot loud', 'reactive', 'artillery', 'canonade', 'reload'];
// asked only where the copy has it: values() sets f_<k> true when the copy has that value and this task can write it (when $copy)
const has = (k, o) => Object.assign({}, o || {}, { when: Object.assign({ $copy: { id: 'f_' + k, is: true } }, (o && o.when) || {}) });
const GUN_FACTS = ['range', 'rangep', 'accp', 'reload', 'between', 'speed', 'damage', 'pen', 'health', 'aimrange', 'maxrange', 'model', 'special', 'throw'];
const NUMS = '^\\s*\\d+(\\.\\d+)?(\\s+\\d+(\\.\\d+)?)*\\s*$', PAIR = '^\\s*\\d+(\\.\\d+)?\\s+\\d+(\\.\\d+)?\\s*$';
// the advanced questions: one stuff file path each (advEdit / advValue in the lib). need: written only when the copy has that block
const ADV = [
  { g: 'numbers', id: 'aimrange', kind: 'number', covers: ['gun.aimrange'], p: 'aimRange', need: 'aimrange', limits: { min: 1, max: 9999999999, unit: 'm' } },
  { g: 'numbers', id: 'maxrange', kind: 'number', covers: ['gun.maxrange'], p: 'maxRange', need: 'maxrange', limits: { min: 5, max: 5000, unit: 'm' } },
  { g: 'advfire', id: 'ammolocked', kind: 'yesno', covers: ['gun.ammolocked'], p: 'ammoLocked', t: 'flag' },
  { g: 'advfire', id: 'preloaded', kind: 'yesno', covers: ['gun.preloaded'], p: 'preloaded', t: 'flag' },
  { g: 'advfire', id: 'reloadbonus', kind: 'number', covers: ['gun.reloadanimbonus'], p: 'reloadAnimBonus', limits: { min: 0.1, max: 60, unit: 's' } },
  { g: 'advfire', id: 'gravity', kind: 'number', covers: ['gun.gravity'], p: 'gravity', limits: { min: 0, max: 100, unit: 'factor' } },
  { g: 'advfire', id: 'reactive', kind: 'yesno', covers: ['gun.reactive'], p: 'reactive', t: 'flag' },
  { g: 'advfire', id: 'curve', kind: 'choice', covers: ['gun.curve'], p: 'curve', t: 'quoted', limits: { values: ['linear', 'cumulative', 'bullet', 'gun_std', 'gun_light', 'gun_medium', 'gun_heavy'], limit: 'DMG-29' } },
  { g: 'advfire', id: 'norico', kind: 'yesno', covers: ['gun.disablericochet'], p: 'DisableRicochet', t: 'flag', limits: { limit: 'DMG-09' } },
  { g: 'advfire', id: 'bulletview', kind: 'text', covers: ['gun.bullet_view'], p: 'bullet_view', t: 'quoted', head: true, limits: { re: '^[a-z0-9_]+$' }, when: { kindq: 'cannon' } },
  { g: 'advfire', id: 'throwrange', kind: 'number', covers: ['gun.throw'], p: 'throw/range', need: 'throw', limits: { min: 1, max: 100, unit: 'm' } },
  { g: 'burst', id: 'bmin', kind: 'number', covers: ['gun.burst.min'], p: 'burst/min', limits: { min: 1, max: 50, step: 1, unit: 'rounds' }, when: { kindq: BURSTY } },
  { g: 'burst', id: 'noaim', kind: 'yesno', covers: ['gun.burst.noaiming'], p: 'burst/noaiming', t: 'flag', when: { kindq: BURSTY } },
  { g: 'advaim', id: 'spreadtol', kind: 'number', covers: ['gun.spreadtolerance'], p: 'SpreadTolerance', limits: { min: 0.05, max: 1, unit: 'factor' } },
  { g: 'advaim', id: 'zeroing', kind: 'text', covers: ['gun.zeroingaccuracy'], p: 'ZeroingAccuracy', t: 'list', limits: { re: NUMS, min: 0.1, max: 1, unit: 'factor per shot', limit: 'KEY-28' } },
  { g: 'advaim', id: 'radiustable', kind: 'list', covers: ['gun.spreading.radiustable'], p: 'spreading/RadiusTable', t: 'pairs', optional: true, limits: { re: PAIR, unit: 'm, m' }, when: NC },
  { g: 'advaim', id: 'spreadradius', kind: 'number', covers: ['gun.spreading.spreadradius'], p: 'spreading/SpreadRadius', limits: { min: 0.1, max: 60, unit: 'm' }, when: NC },
  { g: 'advaim', id: 'radiusfunc', kind: 'text', covers: ['gun.spreading.radiusfunction'], p: 'spreading/RadiusFunction', t: 'list', limits: { re: NUMS, min: 0, max: 10, unit: 'factor' }, when: NC },
  { g: 'advaim', id: 'spreadpower', kind: 'number', covers: ['gun.spreading.spreadpower'], p: 'spreading/SpreadPower', limits: { min: 0.1, max: 20, unit: 'power' }, when: NC },
  { g: 'advaim', id: 'spreadxy', kind: 'number', covers: ['gun.spreading.spreadxyratio'], p: 'spreading/SpreadXYRatio', limits: { min: 0.1, max: 10, unit: 'ratio' }, when: NC },
  { g: 'advaim', id: 'spready', kind: 'number', covers: ['gun.spreading.spreadyadjust'], p: 'spreading/SpreadYadjust', limits: { min: 0, max: 45, unit: 'deg' }, when: NC },
  { g: 'advaim', id: 'burstacc', kind: 'text', covers: ['gun.spreading.burstaccuracy'], p: 'spreading/BurstAccuracy', t: 'list', limits: { re: NUMS, min: 0, max: 100, unit: '%' }, when: NC },
  { g: 'advaim', id: 'burstrec', kind: 'number', covers: ['gun.spreading.burstrecoverytime'], p: 'spreading/BurstRecoveryTime', limits: { min: 0.05, max: 5, unit: 's' }, when: NC },
  { g: 'advdamage', id: 'dmgclip', kind: 'number', covers: ['gun.projectiledamageclip'], p: 'projectileDamageClip', limits: { min: 0, max: 100, unit: 'mm' } },
  { g: 'advdamage', id: 'dmgthr', kind: 'number', covers: ['gun.projectiledamagethreshold'], p: 'projectileDamageThreshold', limits: { min: 0.1, max: 5, unit: 'factor', limit: 'DMG-19' } },
  { g: 'advdamage', id: 'hpclip', kind: 'number', covers: ['gun.healthdamageclip'], p: 'healthDamageClip', limits: { min: 1, max: 5000, unit: 'points' } },
  { g: 'advdamage', id: 'ricodamp', kind: 'list', covers: ['gun.ricochetenergydamping'], p: 'RicochetEnergyDamping', t: 'pairs', optional: true, limits: { re: PAIR, unit: 'deg, factor', limit: 'DMG-09' } },
  { g: 'advdamage', id: 'overmatch', kind: 'list', covers: ['gun.overmatchdamping'], p: 'OvermatchDamping', t: 'pairs', optional: true, limits: { re: PAIR, unit: 'deg, factor' } },
  { g: 'special', id: 'smode', kind: 'choice', covers: ['gun.special.mode'], p: 'special/mode', t: 'word', need: 'special', limits: { values: ['aim', 'detonate'] } },
  { g: 'special', id: 'sprep', kind: 'number', covers: ['gun.special.preparetime'], p: 'special/PrepareTime', need: 'special', limits: { min: 0.1, max: 30, unit: 's' } },
  { g: 'special', id: 'sacc', kind: 'number', covers: ['gun.special.accuracy'], p: 'special/accuracy', need: 'special', limits: { min: 0.1, max: 20, unit: 'factor' } },
  { g: 'special', id: 'sdmg', kind: 'number', covers: ['gun.special.damage'], p: 'special/damage', need: 'special', limits: { min: 0.1, max: 20, unit: 'factor' } },
  { g: 'special', id: 'sthrow', kind: 'yesno', covers: ['gun.special.throw_off'], p: 'special/throw_off', t: 'flag', need: 'special' },
  { g: 'special', id: 'sthrowall', kind: 'yesno', covers: ['gun.special.throw_off_always'], p: 'special/throw_off_always', t: 'flag', need: 'special', limits: { limit: 'KEY-19' } },
  { g: 'advlook', id: 'noview', kind: 'yesno', covers: ['gun.inventory.noview'], p: 'inventory/noView', t: 'flag' },
  { g: 'advlook', id: 'cursor', kind: 'choice', covers: ['gun.cursor'], p: 'cursor', t: 'quoted', limits: { values: ['cannon_on', 'cannon_on_fg', 'zenite_on', 'carbine_on', 'smg_on'], limit: 'UI-21' } },
  { g: 'advlook', id: 'cursorrel', kind: 'choice', covers: ['gun.cursorreloading'], p: 'cursorReloading', t: 'quoted', limits: { values: ['cannon_reload_fg', 'zenite_reload', 'cannon_reload', 'carbine_reload', 'smg_reload'], limit: 'UI-21' } },
];
// a row with need is asked only when the copy has that block or value (its fact f_<need>)
const advQ = g => ADV.filter(a => a.g === g).map(a => { const o = Object.assign({}, a.limits ? { limits: a.limits } : {}, a.when ? { when: a.when } : {}, a.optional ? { optional: true } : {}); return q(a.id, a.kind, a.covers, a.need ? has(a.need, o) : o); });

const recipe = {
  id: 'gun',
  verbs: ['make', 'change'],
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 50,
  title: 'task.gun.t',
  census: 'gun',
  base: { lookup: 'weapon' },
  groups: [
    { id: 'what', title: 'task.gun.g.what', essential: true, q: [
      q('kindq', 'choice', ['gun.class', 'gun.type'], { limits: { values: KINDS }, when: { $verb: 'make' } }),
      q('id', 'id', ['gun.id'], { limits: { re: '^[a-z0-9][a-z0-9_]{1,40}$' }, when: { $verb: 'make' }, unique: { lookup: 'newweapon' } }),
      q('name', 'text', ['gun.text.name', 'gun.desc'], { limits: { limit: 'LOC-15' } }),
    ] },
    // the main numbers a first time user answers: each only where the copy has it (a cannon has a range class, not a range ..)
    { id: 'numbers', title: 'task.gun.g.numbers', essential: true, q: [
      q('range', 'number', ['gun.range'], has('range', { limits: { min: 1, max: 400, unit: 'm' } })),
      q('rangep', 'choice', ['gun.range'], has('rangep', { limits: { values: RANGE_P } })),
      q('reload', 'number', ['gun.rechargetime'], has('reload', { limits: { min: 0.01, max: 300, unit: 's', limit: 'HUM-11' } })),
      q('between', 'number', ['gun.recoverytime'], has('between', { limits: { min: 0, max: 60, unit: 's' } })),
      q('speed', 'number', ['gun.speed'], has('speed', { limits: { min: 10, max: 2000, unit: 'm/s' } })),
      q('damage', 'number', ['gun.projectiledamage'], has('damage', { limits: { min: 1, max: 20000, unit: 'mm' } })),
      q('pen', 'text', ['gun.projectiledamagetable'], has('pen', { limits: { re: '^\\s*\\d+(\\.\\d+)?(\\s+\\d+(\\.\\d+)?){4}\\s*$', unit: 'mm', limit: 'DMG-02' } })),
      q('health', 'number', ['gun.healthdamage'], has('health', { limits: { min: 1, max: 2000, unit: 'points' } })),
      // GoH only (gunammo.goh.js): the range_<n> and accuracy_<x> calls, the main shell row a..e, "armor health" damage
      q('grange', 'choice', ['gun.range'], has('grange', { limits: { values: GOH().RANGES }, when: { $game: 'goh' } })),
      q('gacc', 'choice', ['gun.accuracy_preset'], has('gacc', { limits: { values: GOH().ACCS }, when: { $game: 'goh' } })),
      q('gpen', 'text', ['gun.projectiledamagetable'], has('gpen', { limits: { re: '^\\s*\\d+(\\.\\d+)?(\\s+\\d+(\\.\\d+)?){0,4}\\s*$', unit: 'mm', limit: 'DMG-02' }, when: { $game: 'goh' } })),
      q('gdamage', 'number', ['gun.projectiledamage'], has('gdamage', { limits: { min: 1, max: 5000, unit: 'points' }, when: { $game: 'goh' } })),
      q('grpm', 'number', ['gun.recoverytime'], has('grpm', { limits: { min: 1, max: 3000, unit: 'rpm' }, when: { $game: 'goh' } })),
    ].concat(advQ('numbers')) },
    { id: 'look', title: 'task.gun.g.look', essential: false, q: [
      q('model', 'thing', ['gun.entity', 'gun.model.def', 'gun.model.item', 'gun.model.mdl'], has('model', { picker: { sources: ['keep', 'exist', 'branch', 'ext'], lookup: 'invmodel', branch: 'model', ext: ['soedit', 'blender-gem2'] } })),
      q('skin', 'thing', ['gun.skin.texture', 'gun.skin.mtl'], has('model', { picker: { sources: ['keep', 'branch', 'ext'], branch: 'skin', ext: ['dds-editor', 'soedit'] } })),
    ] },
    { id: 'ammo', title: 'task.gun.g.ammo', essential: false, q: [
      q('ammo', 'thing', ['gun.filling.tags'], { picker: { sources: ['keep', 'exist', 'branch'], lookup: 'ammo', branch: 'ammo' } }),
      q('magazine', 'number', ['gun.filling.magazine'], { limits: { min: 0, max: 1000, step: 1, unit: 'rounds' }, when: { kindq: NOT_CANNON } }),
      q('calibre', 'number', ['gun.calibre'], { limits: { min: 5, max: 150, unit: 'mm', limit: 'KEY-10' }, optional: true }),
      q('params', 'list', ['gun.parameters'], { optional: true, limits: { re: '^[a-z0-9_]+\\s+[A-Za-z_]\\w*\\s+[^{};"]+$', limit: 'KEY-09' } }),
    ] },
    { id: 'aim', title: 'task.gun.g.aim', essential: false, q: [
      q('aimtol', 'number', ['gun.aimingtolerance'], { limits: { min: 0.05, max: 90, unit: 'deg' } }),
      q('relax', 'number', ['gun.relaxationtime'], { limits: { min: 0, max: 10, unit: 's' } }),
      q('aimtype', 'choice', ['gun.aimtype'], { limits: { values: ['direct', 'curved', 'adaptive'] }, when: { kindq: ['cannon', 'launcher'] } }),
      q('spread', 'number', ['gun.spreading.radius'], { limits: { min: 0.1, max: 30, unit: 'm' }, when: NC }),
      q('accp', 'choice', ['gun.accuracy_preset'], has('accp', { limits: { values: ACC_P }, when: { kindq: 'cannon' } })),
    ] },
    { id: 'burst', title: 'task.gun.g.burst', essential: false, q: [
      q('automatic', 'yesno', ['gun.automatic']),
      q('bshort', 'number', ['gun.burst.short'], { limits: { min: 1, max: 50, step: 1, unit: 'rounds' }, when: { kindq: BURSTY } }),
      q('blong', 'number', ['gun.burst.long'], { limits: { min: 1, max: 100, step: 1, unit: 'rounds' }, when: { kindq: BURSTY } }),
    ].concat(advQ('burst')) },
    { id: 'sound', title: 'task.gun.g.sound', essential: false, q: [
      q('fire', 'thing', ['gun.firesound', 'gun.sound.files'], { picker: { sources: ['keep', 'exist', 'branch', 'file'], lookup: 'shotsound', branch: 'sound', kinds: ['sound'] }, multi: true, limits: { limit: 'GPL-15' } }),
      q('loud', 'choice', ['gun.sound.loudness'], { limits: { values: LOUD, limit: 'VIS-27' } }),
      q('signal', 'number', ['gun.sound.signal'], { limits: { min: 0, max: 1000, unit: 'm' } }),
      q('volume', 'number', ['gun.sound.volume'], { limits: { min: 0, max: 2, unit: 'factor' } }),
      q('reloadsnd', 'thing', ['gun.reloadsound'], { picker: { sources: ['keep', 'exist', 'file'], lookup: 'reloadsound', kinds: ['sound'] }, limits: { limit: 'GPL-15' } }),
    ] },
    { id: 'anim', title: 'task.gun.g.anim', essential: false, q: [
      q('hold', 'choice', ['gun.inventory.fsm'], { limits: { values: FSM, limit: 'HUM-26' } }),
      q('animset', 'choice', ['gun.states.reload', 'gun.states.unload', 'gun.states.fire', 'gun.states.aim', 'gun.states.can_aim'], { limits: { values: Object.keys(ANIM) } }),
      q('newanim', 'handoff', ['gun.anim.mode_tag'], { picker: { sources: ['keep', 'ext'], ext: ['blender-gem2'] }, limits: { limit: 'HUM-30' } }),
    ] },
    { id: 'effects', title: 'task.gun.g.effects', essential: false, q: [
      q('tracer', 'number', ['gun.tracefreq'], { limits: { min: 0, max: 1, unit: 'share of shots' } }),
    ] },
    { id: 'inventory', title: 'task.gun.g.inventory', essential: false, q: [
      q('isize', 'text', ['gun.inventory.size'], { limits: { re: '^\\s*[1-9]\\s+[1-9]\\s*$', unit: 'cells', limit: 'HUM-23' } }),
      q('weight', 'number', ['gun.inventory.weight'], { limits: { min: 1, max: 2000, unit: 'points' } }),
      q('mass', 'number', ['gun.mass'], { limits: { min: 0.05, max: 2000, unit: 'kg' } }),
    ] },
    // a vehicle and its place only after a yes; the place is picked from the places the picked vehicle has
    { id: 'mount', title: 'task.gun.g.mount', essential: false, q: [
      q('mountq', 'yesno', ['gun.mount.weapon'], { when: { kindq: MOUNTABLE } }),
      q('vehicle', 'thing', ['gun.mount.weapon'], { picker: { sources: ['exist', 'branch'], lookup: 'entity', branch: 'vehicle' }, when: { kindq: MOUNTABLE, mountq: true } }),
      q('place', 'thing', ['gun.mount.place'], { picker: { sources: ['keep', 'exist'], lookup: 'mountplace', in: 'vehicle' }, limits: { limit: 'HUM-25' }, when: { kindq: MOUNTABLE, mountq: true } }),
    ] },
    { id: 'carry', title: 'task.gun.g.carry', essential: false, q: [
      q('giveq', 'yesno', ['gun.carry.breed_item']),
      q('carriers', 'list', ['gun.carry.breed_item'], { picker: { sources: ['exist', 'branch'], lookup: 'breed', branch: 'soldier' }, limits: { re: '^[a-z0-9_]+/[a-z0-9_]+$', limit: 'HUM-21' }, when: { giveq: true } }),
      q('inhands', 'yesno', ['gun.carry.in_hands'], { when: { giveq: true } }),
      q('ammocount', 'number', ['gun.carry.ammo_item'], { limits: { min: 0, max: 1000, step: 1, unit: 'rounds', limit: 'HUM-20' }, when: { giveq: true, kindq: NOT_CANNON } }),
    ] },
    { id: 'advfire', title: 'task.gun.g.advfire', essential: false, q: advQ('advfire') },
    { id: 'advaim', title: 'task.gun.g.advaim', essential: false, q: advQ('advaim') },
    { id: 'advdamage', title: 'task.gun.g.advdamage', essential: false, q: advQ('advdamage') },
    { id: 'special', title: 'task.gun.g.special', essential: false, q: advQ('special') },
    { id: 'advlook', title: 'task.gun.g.advlook', essential: false, q: advQ('advlook') },
    { id: 'advtags', title: 'task.gun.g.advtags', essential: false, q: [
      q('tags', 'list', ['gun.tag', 'gun.fx.hand'], { limits: { re: '^-?[a-z0-9_]+$', limit: 'HUM-27' }, optional: true }),
    ] },
  ],
  kept: [
    ['gun.from', 'the What to copy step picks it: a new weapon is a {from} copy of it, a change keeps it'],
    ['gun.model.bone.foresight', 'a bone of the model: it comes with the model you pick (the Models page and SOEdit show it)'],
    ['gun.model.bone.handle', 'a bone of the model: it comes with the model you pick'],
    ['gun.model.bone.fxshell', 'a bone of the model: it comes with the model you pick'],
    ['gun.model.bone.fxshot', 'a bone of the model: it comes with the model you pick'],
    ['gun.model.volume', 'hit volumes live inside the model: they come with the model you pick'],
    ['gun.fillingvisible', 'a bone name prefix of the model: it comes with the model you pick'],
    ['gun.foresight', 'a bone name of the model: it comes with the model you pick'],
    ['gun.inventory.handle_bone', 'a bone of the model: it comes with the model you pick'],
    ['gun.inventory.link_bone', 'a bone of the soldier model every soldier shares (gun_back): comes with the soldier'],
    ['gun.icon.preview', 'set on the inventory model, not the weapon: the model task (the model question opens it) sets the picture'],
    ['gun.recoil', 'the barrel kick is an animation of the model; it comes with the model you pick'],
    ['gun.filling.max', 'kept as copied: what it changes in game is not known yet'],
    ['gun.lockfiredistancetime', 'kept as copied: what it changes in game is not known yet'],
    ['gun.automatic_ai', 'kept as copied: what it changes in game is not known yet'],
    ['gun.burst.rangekoef', 'kept as copied: what it changes in game is not known yet'],
    ['gun.ricochetdamageclip', 'kept as copied: what it changes in game is not known yet'],
    ['gun.states.prepare', 'kept as copied: what it changes in game is not known yet'],
    ['gun.states.unprepare', 'kept as copied: what it changes in game is not known yet'],
    ['gun.crosshair', 'kept as copied: what it changes in game is not known yet'],
    ['gun.spreading.burstspread_unused', 'kept as copied: the game does not use it'],
    ['gun.text.stats', 'kept as copied: what it changes in game is not known yet'],
    ['gun.text.type', 'kept as copied: what it changes in game is not known yet'],
    ['gun.special.preparecursor', 'kept as copied: only one cursor name is known to work here'],
    ['gun.sound.tail', 'kept as copied: this game has no such setting'],
    ['gun.ballistics.curve_points', 'kept as copied: a new distance curve cannot be made by a task yet; pick one the game has (advanced fire)'],
    ['gun.fx.backblast', 'kept as copied: the back blast is shared by every launcher, so a change there would change them all'],
    ['gun.fx.mount_muzzle', 'vehicle task: the muzzle flash is a {props} word of the vehicle def'],
    ['gun.mount.type', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.basic', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.gunner', 'vehicle task: a seat or animation of the vehicle model, set there'],
    ['gun.mount.charger', 'vehicle task: a seat or animation of the vehicle model, set there'],
    ['gun.mount.shooter', 'vehicle task: a seat or animation of the vehicle model, set there'],
    ['gun.mount.foresight', 'a bone of the vehicle model: the vehicle task (it comes with the model)'],
    ['gun.mount.linkbone', 'a bone of the vehicle model: the vehicle task (it comes with the model)'],
    ['gun.mount.linkanimation', 'vehicle task: a seat or animation of the vehicle model, set there'],
    ['gun.mount.rotate', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.barrels', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.stationaryfiring', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.restoreikafteraim', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.sequentialaim', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.accuracybymotion', 'vehicle task: asked there (accuracy while moving)'],
    ['gun.mount.restoreiktime', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.manualaccuracy', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.mount.current', 'vehicle task: asked there for each mount (Weapons, mounts)'],
    ['gun.carry.vehicle_box', 'kept as copied: vehicle ammunition boxes cannot be changed by a task yet; mounting a cannon swaps its shells'],
    ['gun.carry.supply', 'kept as copied: supply lists cannot be changed by a task yet'],
  ],
  test: 'task.gun.test',
  checklist: ['task.gun.c.inv', 'task.gun.c.fire', 'task.gun.c.reload', 'task.gun.c.range', 'task.gun.c.sound', 'task.gun.c.log'],
  lookups: {
    // weapons only: knives, axes, fuel tanks and other things with an item (or bullet) root are the item task's
    weapon: async (ctx, w, o) => { if (GOH().isGoh(ctx)) return GOH().weapons(ctx, w, o); const c = source(ctx, o && o.mod); return lookupStuff(ctx, w, o, (rel, k) => /^(gun|mgun|rifle|smg|pistol|bazooka|reactive|flame|special|melee)\//.test(rel) && !/\.(ammo|pattern)$/.test(rel) && (!c || /^(weapon\w*|from)$/.test(rootOf(c, k)))); },
    newweapon: async (ctx, w, o) => (GOH().isGoh(ctx) ? GOH().idLookup(ctx, w, o) : idLookup(ctx, w, o)),
    // the weapon places of the vehicle picked above: the place name, what it holds now
    mountplace: async (ctx, w, o) => {
      const c = source(ctx, o && o.mod), ws = lc(w).split(/\s+/).filter(Boolean);
      return placesOf(c, o && o.in).filter(p => ws.every(x => (p.place + ' ' + p.weapon).includes(x))).map(p => ({ id: p.place, name: p.place, where: p.weapon, ref: { key: p.key }, sub: p.weapon }));
    },
    // what a {filling "<tags>"} names: a shell family (bullet75: every shell type of it) or the tags of one ammunition file
    ammo: async (ctx, w, o) => {
      const seen = new Set();
      return lookupStuff(ctx, w, o, rel => /\.ammo$/.test(rel)).map(x => /^shell\//.test(x.sub) ? Object.assign(x, { id: x.id.split(' ')[0], name: x.id.split(' ')[0] }) : x).filter(x => !seen.has(x.id) && seen.add(x.id));
    },
    invmodel: async (ctx, w, o) => invModels(ctx, w, o),
    breed: async (ctx, w, o) => breeds(ctx, w, o),
    shotsound: async (ctx, w, o) => lookupKeys(ctx, w, o, /^resource\/sound\/weapon\/shot\/.+\.(wav|ogg)$/, k => k.replace(/^resource\/sound\/weapon\/shot\//, '').replace(/[^/]+$/, '')),
    reloadsound: async (ctx, w, o) => lookupKeys(ctx, w, o, /^resource\/sound\/weapon\/reload\/[^/]+\.(wav|ogg)$/, k => k.replace(/^resource\/sound\/weapon\/reload\//, '').replace(/\.(wav|ogg)$/, '')),
  },
  values: async (ctx, base) => {
    if (GOH().isGoh(ctx)) return GOH().gunValues(ctx, base);
    const c = source(ctx, ctx && ctx.mod), none = { inhands: true, carriers: [], place: 'gun', ammocount: 0, mountq: false, giveq: false };
    if (!c || !base) return none;
    const key = baseKey(c, base);
    if (!key) return none;
    const ch = chain(c, key), rw = raw(c, key) || { root: 'from', at: () => null, calls: [] };
    const all = ch.map(f => c.s.get(f.key).toString('latin1')).join('\n');
    const pre = re => { const m = re.exec(all); return m ? lc(m[1]) : undefined; };
    const pm = /\(\s*"(damage2?)"\s+a\(\s*([\d.]+)\s*\)\s*b\(\s*([\d.]+)\s*\)\s*c\(\s*([\d.]+)\s*\)\s*d\(\s*([\d.]+)\s*\)\s*e\(\s*([\d.]+)\s*\)/i.exec(all);
    const states = ANIM_K.map(k => str(ch, 'states/' + k) || '');
    const animset = Object.keys(ANIM).find(a => ANIM[a][3] === states[3]) || 'normal';
    const sz = vals(node(ch, 'inventory/size'));
    const name = key.slice(key.lastIndexOf('/') + 1), ext = name.includes('.') && !/\.pattern$/.test(name) ? name.slice(name.indexOf('.')) : '';
    const fire = str(ch, 'fireSound'), fs0 = fire ? folderSet(c, 'weapon/shot/' + fire) : {};
    const v = {
      kindq: kindOf(key), id: freeId(c, name.replace(ext, '')), name: stuffName(c, key) || name.replace(ext, ''),
      model: str(ch, 'entity'), ammo: str(ch, 'filling'), magazine: num(ch, 'filling', 1), calibre: num(ch, 'calibre'), params: paramsOf(ch),
      range: num(ch, 'range'), rangep: [pre(/\(\s*"range_(\w+)"/i)].find(x => RANGE_P.includes(x)), reload: num(ch, 'rechargeTime'), between: num(ch, 'recoveryTime'),
      speed: num(ch, 'speed') != null ? r4(num(ch, 'speed') * 2) : undefined, damage: num(ch, 'projectileDamage'),
      pen: pm ? pm.slice(2, 7).join(' ') : undefined, health: num(ch, 'healthDamage'),
      aimtol: num(ch, 'AimingTolerance'), relax: num(ch, 'RelaxationTime'), aimtype: str(ch, 'aimType'), spread: num(ch, 'spreading'), accp: [pre(/\(\s*"accuracy_(\w+)"/i)].find(x => ACC_P.includes(x)),
      automatic: !!node(ch, 'automatic'), bshort: num(ch, 'burst/short'), blong: num(ch, 'burst/long'),
      tracer: num(ch, 'TraceFreq'), fire, loud: fs0.loudness, signal: fs0.signal, volume: fs0.volume, reloadsnd: str(ch, 'reloadSound'),
      hold: str(ch, 'inventory/fsm'), animset, isize: sz.length >= 2 ? sz.slice(0, 2).join(' ') : undefined, weight: num(ch, 'inventory/weight'), mass: num(ch, 'mass'),
      place: kindOf(key) === 'mg' ? 'mgun' : 'gun', carriers: [], inhands: true, ammocount: 0, mountq: false, giveq: false,
    };
    const tw = tagWords(c, key); v.tags = tw.all;
    for (const a of ADV) v[a.id] = advValue(ch, a);
    // a range preset sets {range} too: the copy has a range of its own only when it calls no preset
    if (v.rangep) delete v.range;
    for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
    const hasB = { special: !!node(ch, 'special'), throw: !!node(ch, 'throw') };
    for (const k of GUN_FACTS) v['f_' + k] = hasB[k] !== undefined ? hasB[k] : v[k] != null;
    // not questions: what compile needs to write whole blocks and to pick set or macro
    v._meta = { id: name.replace(ext, ''), key, root: rw.root, calls: rw.calls, inMod: rw.inMod, kind: kindOf(key), dir: key.slice(STUFF.length, key.lastIndexOf('/')), ext,
      range2: num(ch, 'range', 1), burst2: { short: num(ch, 'burst/short', 1), long: num(ch, 'burst/long', 1) }, damageMacro: pm ? lc(pm[1]) : null, desc: str(ch, 'desc'),
      has: hasB, tw };
    return v;
  },
  compile: (draft, c) => compileGun(draft, c),
};

// {parameters "<shell type>" {key value} ..} blocks of the nearest file that has any -> list lines "type key value"
function paramsOf(ch) {
  for (const f of ch) {
    const ps = (f.b.items || []).filter(x => x.k === 'BLOCK' && lc(x.items[0] && x.items[0].text) === 'parameters');
    if (!ps.length) continue;
    const out = [];
    for (const p of ps) {
      const t = lc(vals(p)[0] || '').replace(/\s+/g, '_');
      for (const k of p.items.slice(1)) if (k.k === 'BLOCK' && !k.items.slice(1).some(x => x.k === 'BLOCK')) out.push(t + ' ' + k.items[0].text + ' ' + vals(k).join(' '));
    }
    return out;
  }
  return [];
}
// list lines "type key value" -> {type: {key: value}} for the types named in `only` (every line of such a type, so the block is whole)
function paramsMap(lines, only) {
  const m = {};
  for (const l of [].concat(lines || [])) {
    const p = String(l).trim().split(/\s+/); if (p.length < 3) continue;
    if (only && !only.has(p[0])) continue;
    (m[p[0]] = m[p[0]] || {})[p[1]] = p.slice(2).join(' ');
  }
  return m;
}

function compileGun(draft, c) {
  if (gidOf({ gameId: c.game }) === 'goh') return GOH().compileGun(draft, c);
  const v = c.values || {}, m = v._meta;
  if (!m || !m.key) throw bad('Pick the weapon to copy first (What to copy).');
  const src = c.gameDir ? source({ game: () => c.gameDir, gameId: c.game }, c.mod) : null, ch0 = src ? chain(src, m.key) : [];
  const make = c.verb !== 'change';
  const val = id => c.value(id), n = id => Number(val(id));
  const changed = id => !c.kept(id) && val(id) !== undefined && val(id) !== null && val(id) !== '' && !same(val(id), v[id]);
  const kind = String((make && val('kindq')) || m.kind), notes = [], ops = [];
  const id = String(val('id') || '').toLowerCase().trim();
  if (make) {
    if (!/^[a-z0-9][a-z0-9_]{1,40}$/.test(id)) throw bad('The new weapon needs an id: small English letters, digits and _.');
    if (id === m.id) throw bad('The id ' + id + ' is the id of the weapon you copy. Pick a new id.');
  }
  const target = make ? id : m.id;
  // a new weapon always gets a name players see (the copy's name when kept); a change writes it only when it changed
  const display = String(val('name') || '').trim(), nameChanged = !!display && (make || changed('name'));
  // F: the gen gun op's own fields (make); E: the same and the rest as paths of the stuff file (f = the gun op field that covers it)
  const F = {}, E = [];
  if (changed('ammo')) {
    const tags = String(val('ammo')).replace(/\./g, ' ').trim(), mag = changed('magazine') ? n('magazine') : v.magazine;
    E.push({ p: 'filling', v: '"' + tags + '"' + (mag != null ? ' ' + mag : '') });
  } else if (changed('magazine')) { F.magazine = n('magazine'); E.push({ p: 'filling', v: '"' + String(v.ammo || '') + '" ' + n('magazine'), f: 'magazine' }); }
  if (changed('calibre')) E.push({ p: 'calibre', v: String(n('calibre')) });
  if (changed('range')) {
    // a cannon's gun op range is a preset name: a cannon with a range of its own (mortars) gets a set row only
    const a = n('range'), r2 = m.range2 && v.range ? Math.max(a, Math.round(a * m.range2 / v.range)) : a + 5;
    if (kind !== 'cannon') F.range = a + ' ' + r2;
    E.push(kind !== 'cannon' ? { p: 'range', v: a + ' ' + r2, f: 'range' } : { p: 'range', v: a + ' ' + r2 });
  }
  if (changed('rangep') && kind === 'cannon') F.range = val('rangep');
  if (changed('reload')) { F.reload = n('reload'); E.push({ p: 'rechargeTime', v: String(n('reload')), f: 'reload' }); }
  if (changed('between') && n('between') > 0) { F.rof = r4(60 / n('between')); E.push({ p: 'recoveryTime', v: String(n('between')), f: 'rof', macro: { name: 'recoverytime', arg: 'r', value: r4(60 / n('between')) } }); }
  if (changed('speed')) { F.speed = n('speed'); E.push({ p: 'speed', v: String(r4(n('speed') / 2)), f: 'speed', macro: { name: 'speed', arg: 's', value: n('speed') } }); }
  if (changed('damage')) { F.damage = n('damage'); E.push({ p: 'projectileDamage', v: String(n('damage')), f: 'damage' }); }
  if (changed('health')) { F.health = n('health'); E.push({ p: 'healthDamage', v: String(n('health')), f: 'health' }); }
  if (changed('aimtol')) E.push({ p: 'AimingTolerance', v: String(n('aimtol')) });
  if (changed('relax')) { F.aim = n('relax'); E.push({ p: 'RelaxationTime', v: String(n('relax')), f: 'aim' }); }
  if (changed('aimtype')) E.push({ p: 'aimType', v: String(val('aimtype')) });
  if (changed('spread') && kind !== 'cannon') { F.spread = n('spread'); E.push({ p: 'spreading', v: String(n('spread')), f: 'spread', head: true }); }
  if (changed('accp') && kind === 'cannon') F.accuracy = val('accp');
  if (changed('pen') && kind === 'cannon') F.pen = String(val('pen')).trim().split(/\s+/).map(Number);
  if (changed('automatic')) E.push(val('automatic') ? { p: 'Automatic', v: '' } : { p: 'Automatic', del: true });
  if ((changed('bshort') || changed('blong')) && kind !== 'cannon') {
    const sh = changed('bshort') ? n('bshort') : v.bshort, lg = changed('blong') ? n('blong') : v.blong;
    if (sh != null && lg != null) F.burst = sh + ' ' + lg;
    if (changed('bshort')) E.push({ p: 'burst/short', v: n('bshort') + (m.burst2.short != null ? ' ' + m.burst2.short : ''), f: 'burst' });
    if (changed('blong')) E.push({ p: 'burst/long', v: n('blong') + (m.burst2.long != null ? ' ' + m.burst2.long : ''), f: 'burst' });
  }
  if (changed('tracer')) E.push({ p: 'TraceFreq', v: String(n('tracer')) });
  if (changed('hold')) E.push({ p: 'inventory/fsm', v: '"' + val('hold') + '"' });
  if (changed('isize')) E.push({ p: 'inventory/size', v: String(val('isize')).trim().split(/\s+/).join(' ') });
  if (changed('weight')) E.push({ p: 'inventory/weight', v: String(n('weight')) });
  if (changed('mass')) E.push({ p: 'mass', v: String(n('mass')) });
  if (changed('animset') && ANIM[val('animset')]) ANIM_K.forEach((k, i) => E.push({ p: 'states/' + k, v: '"' + ANIM[val('animset')][i] + '"' }));
  // the advanced questions, one path each; a block the copy does not have (special, throw) is not made up
  for (const a of ADV) {
    if (!changed(a.id)) continue;
    if (a.when && a.when.kindq && ![].concat(a.when.kindq).includes(kind)) continue;
    if (a.need && !m.has[a.need]) { notes.push(a.id + ': the weapon you copy has no {' + a.need + '} block, so this value was not written.'); continue; }
    E.push(advEdit(a, val(a.id)));
  }
  // per round values ({parameters "<type>" ..}): the types with a changed line, each written whole
  const pLines = changed('params') ? [].concat(val('params') || []) : [];
  const pTypes = new Set(pLines.filter(l => ![].concat(v.params || []).includes(l)).map(l => String(l).trim().split(/\s+/)[0]));
  const P = pTypes.size ? paramsMap(pLines, pTypes) : null;
  // model and skin: an inventory model name (exist) or what the model task made (branch: its folder); the outside programs are hand-offs
  const ma = c.answer('model'), model = entityOf(val('model'));
  if (ma && (ma.src === 'exist' || ma.src === 'branch') && model && model !== v.model) E.push({ p: 'entity', v: '"' + model + '"' });
  if (ma && ma.src === 'ext') notes.push('Model: finish it in the outside program, then pick it here (the copy keeps its model until then).');
  const sk = c.answer('skin'); if (sk && sk.src === 'ext') notes.push('Skin: finish the texture in the outside program; the skin task places it.');
  const na = c.answer('newanim'); if (na && na.src === 'ext') notes.push('New animations: made in the outside program; the weapon keeps the soldier animations of the copy until then.');
  // fire sound: PC files (staged, read by gen from this draft's staging) become a sound folder (gen sound op, the copy's folder.set
  // settings kept unless asked); loudness, signal or volume alone make a new folder from the copy's sounds; reload sound: one wav copied
  const copies = [], fa = c.answer('fire'), sub0 = (topDir(m.key) || 'rifle') + '/' + target + '_shot', like = String(v.fire || '').replace(/^\/+|\/+$/g, '');
  const sub = sub0 === like ? sub0 + '_new' : sub0; // a change keeps the gun name, so the copy's own folder is taken (gen will not mix two folders)
  const set3 = {}; if (changed('loud')) set3.loudness = String(val('loud')); if (changed('signal')) set3.signal = 'shot ' + n('signal'); if (changed('volume')) set3.volume = n('volume');
  const staged = fa && fa.src === 'file' ? [].concat(fa.staged || []) : [];
  if (staged.length || (Object.keys(set3).length && (!fa || fa.src === 'keep' || fa.src === 'exist'))) {
    const from = fa && fa.src === 'exist' && changed('fire') ? String(val('fire')).replace(/^weapon\/shot\//, '').replace(/^\/+|\/+$/g, '') : like;
    const so = Object.assign({ op: 'sound', id: 'weapon/shot/' + sub }, staged.length ? { files: staged } : {}, set3);
    if (/^[a-z0-9_]+(\/[a-z0-9_]+)*$/.test(from)) so.like = 'weapon/shot/' + from;
    if (!so.files && !so.like) notes.push('Sound settings: the weapon you copy has no fire sound folder to start from, so they were not written.');
    else { ops.push(so); F.fire_sound = sub + '/'; E.push({ p: 'fireSound', v: '"' + sub + '/"', f: 'fire_sound' }); }
  } else if (fa && (fa.src === 'exist' || fa.src === 'branch') && changed('fire')) {
    const s = String(val('fire')).replace(/^weapon\/shot\//, '');
    F.fire_sound = s; E.push({ p: 'fireSound', v: '"' + s + '"', f: 'fire_sound' });
    if (Object.keys(set3).length) notes.push('Sound settings: the sound task you opened for the fire sound sets loudness, signal and volume.');
  }
  const ra = c.answer('reloadsnd');
  if (ra && ra.src === 'file') {
    const f = [].concat(ra.staged || []).find(x => /\.wav$/i.test(x)) || [].concat(ra.staged || [])[0];
    if (f) { const nr = target + '_reload'; copies.push({ staged: f, to: 'resource/sound/weapon/reload/' + nr + '.wav' }); E.push({ p: 'reloadSound', v: '"' + nr + '"' }); }
  } else if (ra && ra.src === 'exist' && changed('reloadsnd')) E.push({ p: 'reloadSound', v: '"' + String(val('reloadsnd')) + '"' });
  // ---- write
  const dirs = CLASS_DIRS[kind] || [], top = topDir(m.key), fits = dirs.includes(top);
  if (make && !fits && kind !== m.kind) throw bad('A ' + kind + ' must be copied from a ' + kind + ' (folders ' + dirs.join(', ') + '); the weapon you copy is in ' + top + '. Pick a ' + kind + ' to copy, or set the kind back to ' + m.kind + '.');
  const tc = changed('tags') && m.tw ? tagChange(m.tw, [].concat(v.tags || []), [].concat(val('tags') || []).map(x => String(x).trim())) : null;
  if (tc && tc.inhDrops.length) notes.push('Tag words: ' + tc.inhDrops.join(', ') + ' come from a parent file; a -word of its own cancels each one (check in game).');
  const flagNote = sk2 => { if (sk2.length) notes.push('Not changed: ' + sk2.join(', ') + ' (set by a macro call this task cannot edit, or a flag the copy only inherits, which a file cannot drop).'); };
  if (make && fits) {
    // gen gun op (tools/gen/README.md, gun: a weapon of any class): {from "<like>"} plus one line per field; the rest as set rows on it.
    // A block the op writes (burst, spreading) that an advanced value also edits is written by the set rows only, whole
    const g = Object.assign({ op: 'gun', name: id, like: tagsOf(m.key).join(' '), class: kind }, F);
    if (P) g.params = P;
    if (nameChanged) g.display = display;
    const restPar = new Set(E.filter(e => (!e.f || g[e.f] === undefined) && e.p.includes('/')).map(e => e.p.split('/')[0]));
    for (const e of E) if (e.f && g[e.f] !== undefined && restPar.has(e.p.split('/')[0])) delete g[e.f];
    ops.push(g);
    const rest = E.filter(e => !e.f || g[e.f] === undefined);
    const newKey = top === 'gun' ? STUFF + 'gun/' + id : STUFF + m.dir + '/' + id + m.ext;
    const r = rows(newKey, { root: 'from', at: () => null }, ch0, rest);
    flagNote(r.skipped);
    // tag words: the new file has no tag line of its own, so every dropped word is cancelled with a -word of its own
    if (tc) { const t2 = { adds: tc.adds, ownDrops: [], inhDrops: tc.ownDrops.concat(tc.inhDrops) }; r.rows.push(...tagRows(newKey, 'from', { own: [], lines: 0 }, t2, notes)); }
    if (r.rows.length) ops.push({ op: 'set', rows: r.rows });
  } else if (make) {
    // a weapon outside the gun op's classes (melee, special ..): clone-entity with every value in the one step
    const op = { op: 'clone', stuff: tagsOf(m.key).join(' '), tags: id + m.ext };
    if (nameChanged) op.name = display;
    const sets = cloneSets(ch0, E);
    if (sets.length) op.set = sets;
    ops.push(op);
    if (tc) notes.push('Tag words: written only for a weapon the gun op makes or changes; this one keeps those of the copy.');
    if (F.accuracy || F.pen) notes.push('Accuracy and piercing presets are for cannon files (set/stuff/gun); this weapon keeps those of the copy.');
    if (P) notes.push('Per round values: written only for a weapon the gun op makes; this one keeps those of the copy.');
  } else {
    // change: the thing's own file (in the mod: edited in place; in the game or another mod: copied whole into the mod, an override)
    const rr = src ? raw(src, m.key) : null, rw = { root: m.root, at: p => rr ? rr.at(p) : null };
    const macroOps = [], E3 = [];
    for (const e of E) {
      if (e.macro && m.calls.includes(e.macro.name)) macroOps.push({ op: 'macro', entity: 'file:' + m.key, macro: e.macro.name === 'recoverytime' ? 'recoveryTime' : e.macro.name, arg: e.macro.arg, value: e.macro.value });
      else E3.push(e);
    }
    if (F.pen) {
      const p = F.pen;
      if (m.damageMacro && m.calls.includes(m.damageMacro)) ['a', 'b', 'c', 'd', 'e'].forEach((a, i) => macroOps.push({ op: 'macro', entity: 'file:' + m.key, macro: m.damageMacro, arg: a, value: p[i] }));
      else E3.push({ p: 'projectileDamageTable', v: '{10 ' + p[0] + '} {50 ' + p[1] + '} {75 ' + p[2] + '} {100 ' + p[3] + '} {125 ' + p[4] + '} {130 ' + r4(p[4] * 0.95) + '} {175 0}' });
    }
    if (F.range && kind === 'cannon') { if (v.rangep && m.calls.includes('range_' + v.rangep)) macroOps.push({ op: 'macro', entity: 'file:' + m.key, macro: 'range_' + v.rangep, rename: 'range_' + F.range }); else notes.push('Range preset: this file does not call a range preset itself, so it was not changed.'); }
    if (F.accuracy) { if (v.accp && m.calls.includes('accuracy_' + v.accp)) macroOps.push({ op: 'macro', entity: 'file:' + m.key, macro: 'accuracy_' + v.accp, rename: 'accuracy_' + F.accuracy }); else notes.push('Accuracy preset: this file does not call an accuracy preset itself, so it was not changed.'); }
    const r = rows(m.key, rw, ch0, E3);
    flagNote(r.skipped);
    if (tc) r.rows.push(...tagRows(m.key, m.root, m.tw, tc, notes));
    if (P) {
      if (rr && rr.at('parameters')) notes.push('Per round values: this file has its own {parameters} blocks; change them by hand in the Editor (several blocks share the name, a set row cannot pick one).');
      else for (const [t, kv] of Object.entries(P)) r.rows.push({ entity: 'file:' + m.key, path: m.root + '/parameters', value: '"' + t.replace(/_/g, ' ') + '" ' + Object.entries(kv).map(([k, x]) => '{' + k + ' ' + x + '}').join(' '), op: 'add' });
    }
    if (r.rows.length) ops.push({ op: 'set', rows: r.rows });
    ops.push(...macroOps);
    if (nameChanged) ops.push({ op: 'text', key: m.desc ? String(m.desc) : 'desc/weapon/' + tagsOf(m.key).filter(x => x !== 'weapon').join(' '), text: display });
    if (!m.inMod) notes.push('The weapon lives in the game or another mod: its file is copied whole into your mod and changed there (an override).');
  }
  // carriers (a line is a soldier type picked, typed, or made by the soldier task), their ammunition, mount
  const carriers = val('giveq') === true ? [].concat(val('carriers') || []).map(entityOf).filter(Boolean) : [];
  ops.push(...kitOps(carriers, target, val('inhands') !== false, src, notes));
  const ac = Math.round(Number(val('ammocount')) || 0), ammoItem = String(val('ammo') || v.ammo || '').replace(/\./g, ' ').trim();
  if (carriers.length && ac > 0) {
    if (!ammoItem || kind === 'cannon' || /^bullet\d|^shell/.test(ammoItem)) notes.push('Ammunition for the carriers: a cannon shell family is not carried by soldiers; nothing added.');
    else ops.push(...kitOps(carriers, ammoItem, undefined, src, notes, { count: ac }));
  }
  const veh = c.answer('vehicle');
  if (val('mountq') === true && veh && (veh.src === 'exist' || veh.src === 'branch') && val('vehicle') && MOUNTABLE.includes(kind)) {
    // the place: the one picked; a kept default the vehicle does not have becomes its first place that holds the same kind of weapon
    const ent = entityOf(val('vehicle')), ps = veh.src === 'exist' ? placesOf(src, ent) : [];
    let place = lc(entityOf(val('place')) || (kind === 'mg' ? 'mgun' : 'gun'));
    if (ps.length && !ps.some(p => p.place === place)) {
      const mg = kind === 'mg', alt = ps.find(p => mg === /mg|mgun/.test(p.place)) || ps[0];
      notes.push('Mounting: ' + ent + ' has no place ' + place + '; the weapon goes on ' + alt.place + ' (it holds ' + alt.weapon + ' now).');
      place = alt.place;
    }
    ops.push({ op: 'weapon', entity: ent, weapon: target, place });
    if (top !== 'gun') notes.push('Mounting: a weapon outside set/stuff/gun keeps the ammunition lines of the vehicle as they are; check its boxes in game.');
  }
  return { gen: ops.length ? { ops } : null, copies, notes, result: target };
}

// what the game's own data uses (a scan of every vanilla weapon): outside it a warning under the field (limits.usual), never a
// refusal. A hard max only where a bigger number means nothing (aimtol, spreadtol, spready, volume, aimrange); the mins keep what the game cannot take
const USUAL = {range: [3,300], reload: [0.01,180], between: [0,10], speed: [20,1400], damage: [3,10000], health: [75,500], magazine: [0,500], calibre: [7.62,120], aimtol: [0.1,40], relax: [0,2], spread: [0.5,10.5], signal: [5,110], volume: [0.9,1.2], weight: [10,1000], mass: [1,1000], bshort: [1,9], blong: [1,25], aimrange: [1,300], maxrange: [25,500], reloadbonus: [0.5,15], gravity: [0,35], throwrange: [10,20], spreadtol: [0.4,0.7], zeroing: [0.6,0.95], spreadradius: [1,18], radiusfunc: [0,5], spreadpower: [1,1], spreadxy: [0.8,1], spready: [15,15], burstacc: [50,100], burstrec: [0.5,0.5], dmgclip: [3,20], dmgthr: [1,1.5], hpclip: [500,500], sprep: [3,3.5], sacc: [2.5,2.5], sdmg: [2.5,2.5]};
const HARDMAX = ['aimtol', 'spreadtol', 'spready', 'volume', 'aimrange'];
for (const g of recipe.groups) for (const x of g.q) if (x.kind === 'number' && USUAL[x.id]) {
  x.limits = Object.assign({}, x.limits, { usual: USUAL[x.id] });
  if (!HARDMAX.includes(x.id)) delete x.limits.max;
}
// GoH asks only what gunammo.goh.js writes; every other question is for the AS2 tabs
for (const g of recipe.groups) for (const x of g.q) if (!GOH().GUN_Q.includes(x.id)) x.when = Object.assign({}, x.when, { $game: ['as64', 'mowas2'] });

module.exports = recipe;
Object.defineProperty(module.exports, 'lib', { value: LIB, enumerable: false });

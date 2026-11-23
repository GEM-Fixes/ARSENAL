#!/usr/bin/env node
// gamediff: measure data-level differences between two game dirs (AS2 vs GoH). read-only on both.
//   node gamediff.js --as2 <gameDir> --goh <gameDir> [--sample N] [--min N] [--top N] [--json out] [-q]
//   sections: layout (top folders, pak names) ext (file counts per extension) roots (def root kind + include targets)
//     keys (SDL block-key vocabulary per kind, keys on one side only; regex scan, not full parse [I]) bin (magic + u32@4 per binary ext, --sample N per ext)
//     set (set/ subdir x ext, base paths only one side) lng (encoding/format) modinfo (mods/*/mod.info keys + values); map files (.mi/.info/.materials) are kinds in keys
//   gameDir: <dir>/resource (paks via lib/pakset + loose) ; mods/ and localization*.pak / localizations/ looked up beside it.
//   --exe as64|mowas_2|mowas2: the AS2 side's game. as64 adds the as64/core/resource layer over the base (what as64.exe mounts);
//     mowas2 = the base alone. No --exe = the base alone, as before. With --exe, a missing --as2 / --goh comes from lib/games install.
// Author: Imperator_Aug (ARSENAL, ia-5d38fdbe)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset');
const games = require('../lib/games');

const TEXT = new Set(['def', 'ext', 'inc', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy', 'materials', 'def1']);
const BIN = new Set(['ply', 'anm', 'vol', 'net', 'ebm', 'dds', 'tex', 'grs', 'omask', 'wav', 'ogg', 'png', 'tga', 'bik', 'avi', 'lnk', 'psd']);
const extOf = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1); };
const inc = (o, k, d = 1) => { o[k] = (o[k] || 0) + d; };

// core = also the as64/core layer over the base (as64.exe mounts <game>/as64/core right after the game: lib/vfs 3c)
function collect(gameDir, core) {
  const root = fs.existsSync(path.join(gameDir, 'resource')) ? path.join(gameDir, 'resource') : gameDir;
  const entries = new Map(), sets = [];
  const layer = r => {
    const ps = pakset.open(r, null); sets.push(ps);
    for (const e of ps.entries) entries.set(e.key, { ...e, name: e.key, inPak: path.basename(e.pak) });
    const walk = (d, rel) => {
      for (const de of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, de.name), r2 = rel ? rel + '/' + de.name : de.name;
        if (de.isDirectory()) walk(p, r2);
        else if (!/\.pak$/i.test(de.name)) { const name = r2.toLowerCase(); entries.set(name, { name, size: fs.statSync(p).size, path: p, inPak: null }); }
      }
    };
    walk(r, '');
  };
  layer(root);
  const coreRes = core ? path.join(gameDir, 'as64', 'core', 'resource') : null;
  if (coreRes && fs.existsSync(coreRes)) layer(coreRes);
  const ps = sets.length === 1 ? sets[0] : { errors: [].concat(...sets.map(s => s.errors)), close() { for (const s of sets) s.close(); } };
  return { gameDir, root, entries, ps };
}
const readEnt = e => e.path ? fs.readFileSync(e.path) : pakset.read(e);
function readHead(e, n) {
  if (e.path) { const fd = fs.openSync(e.path, 'r'); try { const b = Buffer.alloc(n), g = fs.readSync(fd, b, 0, n, 0); return b.subarray(0, g); } finally { fs.closeSync(fd); } }
  return pakset.read(e).subarray(0, n);
}

function strip(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/"[^"\r\n]*"/g, '""').replace(/;[^\r\n]*/g, '').replace(/\{##/g, '{');
}
function kindOf(name) {
  const x = extOf(name);
  if (x === 'set') { const m = /^set\/([^/]+)\//.exec(name); return 'set/' + (m ? m[1] : '.'); }
  if (name.startsWith('map/') && (x === 'info' || x === 'mi' || x === 'materials')) return 'map.' + x;
  return x;
}

function scanText(c) {
  const keys = {}, roots = {}, incs = {};
  let fails = 0;
  for (const e of c.entries.values()) {
    const x = extOf(e.name);
    if (!TEXT.has(x) || e.name.startsWith('shader/')) continue;
    if (e.size > 3e6) continue;
    let raw; try { raw = readEnt(e).toString('latin1'); } catch (er) { fails++; continue; }
    const kind = kindOf(e.name);
    for (const m of raw.matchAll(/\(\s*include\s+"([^"]+)"/g)) inc(incs, m[1].replace(/\\/g, '/').split('/').pop().toLowerCase());
    const t = strip(raw);
    if (x === 'def' || x === 'mdl' || x === 'ext') { const m = /\{\s*([A-Za-z_]\w*)/.exec(t); if (m) inc(roots, x + ':' + m[1].toLowerCase()); }
    const ks = keys[kind] || (keys[kind] = {});
    for (const m of t.matchAll(/\{\s*([A-Za-z_]\w*)/g)) inc(ks, m[1].toLowerCase());
  }
  return { keys, roots, incs, fails };
}

function scanBin(c, n) {
  const byExt = {};
  for (const e of c.entries.values()) { const x = extOf(e.name); if (BIN.has(x) || (x === '' && /(^|\/)map$/.test(e.name))) (byExt[x] || (byExt[x] = [])).push(e); }
  const out = {};
  for (const [x, l] of Object.entries(byExt)) {
    const tally = {}, k = Math.min(n, l.length);
    for (let i = 0; i < k; i++) {
      const e = l[Math.floor(i * l.length / k)];
      let h; try { h = readHead(e, 16); } catch (er) { continue; }
      if (h.length < 4) { inc(tally, 'short'); continue; }
      const ascii = [...h.subarray(0, 4)].every(b => b >= 32 && b < 127);
      const magic = ascii ? h.toString('latin1', 0, 4) : h.subarray(0, 4).toString('hex');
      const v = h.length >= 8 ? h.readUInt32LE(4) : -1;
      inc(tally, magic + (v >= 0 && v < 1000 ? ' v' + v : ''));
    }
    out[x || '(map)'] = { total: l.length, sampled: k, tally };
  }
  return out;
}

function scanMap(c) {
  const dirs = {}, tot = {};
  for (const e of c.entries.values()) {
    if (!e.name.startsWith('map/')) continue;
    const d = e.name.slice(0, e.name.lastIndexOf('/')), x = extOf(e.name) || '(none)';
    (dirs[d] || (dirs[d] = new Set())).add(x);
  }
  const names = Object.keys(dirs).filter(d => dirs[d].has('mi') || dirs[d].has('(none)') || dirs[d].has('info'));
  for (const d of names) for (const x of dirs[d]) inc(tot, x);
  return { maps: names.length, ext: tot };
}
function scanSet(c) {
  const o = {};
  for (const e of c.entries.values()) {
    if (!e.name.startsWith('set/')) continue;
    const p = e.name.split('/'), d = p.length > 2 ? p[1] : '.';
    const s = o[d] || (o[d] = { n: 0, ext: {}, files: new Set() });
    s.n++; inc(s.ext, extOf(e.name)); s.files.add(e.name.slice(4));
  }
  return o;
}

function scanLng(c, gameDir) {
  const res = { lng: 0, pot: 0, msgctxt: 0, files: 0, bom: 0, utf8: 0, cp1251: 0, ascii: 0, ex: null, langs: {}, sample: null };
  const cands = [];
  for (const e of c.entries.values()) if (/^(lng|pot)$/.test(extOf(e.name))) cands.push(e);
  for (const d of [gameDir, path.join(gameDir, 'localizations')]) {
    let fl = []; try { fl = fs.readdirSync(d); } catch (e) { continue; }
    for (const f of fl) {
      if (!/\.pak$/i.test(f) || !/local|lang/i.test(f + path.basename(d))) continue;
      try { const L = require('../lib/pak').list(path.join(d, f)); for (const ent of L) if (/^(lng|pot)$/.test(extOf(ent.name.toLowerCase()))) cands.push({ name: ent.name.toLowerCase(), L, ent, size: ent.size, pak: path.join(d, f) }); } catch (e) {}
    }
  }
  const pk = require('../lib/pak');
  for (const e of cands) {
    res.files++; inc(res, extOf(e.name));
    let b; try { b = e.ent ? pk.read(e.L, e.ent) : readEnt(e); } catch (er) { continue; }
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) res.bom++;
    let hi = false, u8ok = true;
    for (let i = 0; i < b.length; i++) {
      if (b[i] < 0x80) continue; hi = true;
      const need = b[i] >= 0xF0 ? 3 : b[i] >= 0xE0 ? 2 : b[i] >= 0xC0 ? 1 : -1;
      if (need < 0) { u8ok = false; break; }
      for (let j = 1; j <= need; j++) if ((b[i + j] & 0xC0) !== 0x80) { u8ok = false; break; }
      if (!u8ok) break; i += need;
    }
    if (!hi) res.ascii++; else if (u8ok) res.utf8++; else res.cp1251++;
    if (!res.sample) { res.sample = b.toString('latin1', 0, 160).replace(/\r?\n/g, '\\n'); res.ex = e.name; }
    if (extOf(e.name) === 'pot') res.msgctxt += (b.toString('latin1').match(/^msgctxt /gm) || []).length;
    inc(res.langs, path.basename(e.name));
  }
  return res;
}

function modInfo(gameDir) {
  const out = { n: 0, keys: {}, mgv: {}, mxgv: {}, folders: { digits: 0, other: 0 }, sub: {}, tags: {}, requires: 0 };
  const dir = path.join(gameDir, 'mods');
  let ds = []; try { ds = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()); } catch (e) { return out; }
  for (const d of ds) {
    const f = path.join(dir, d.name, 'mod.info');
    if (!fs.existsSync(f)) continue;
    out.n++;
    if (/^\d+$/.test(d.name)) out.folders.digits++; else out.folders.other++;
    try { for (const x of fs.readdirSync(path.join(dir, d.name), { withFileTypes: true })) if (x.isDirectory()) inc(out.sub, x.name); } catch (e) {}
    const t = fs.readFileSync(f).toString('latin1').replace(/;[^\r\n]*/g, '');
    for (const m of t.matchAll(/\{\s*([A-Za-z_]\w*)[ \t]*([^{}\r\n]*)/g)) {
      const k = m[1].toLowerCase(); if (k === 'mod') continue;
      inc(out.keys, k);
      const v = m[2].trim().replace(/"/g, '');
      if (k === 'mingameversion') inc(out.mgv, v);
      else if (k === 'maxgameversion') inc(out.mxgv, v);
      else if (k === 'tags') { for (const w of v.split(/\s+/)) if (w) inc(out.tags, w); }
      else if (k === 'require') out.requires++;
    }
  }
  return out;
}

function topLayout(c) {
  const top = {}, paks = {};
  for (const e of c.entries.values()) { inc(top, e.name.split('/')[0] + (e.name.includes('/') ? '/' : '')); if (e.inPak) inc(paks, e.inPak); }
  const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }).map(x => x.name + (x.isDirectory() ? '/' : '')).sort(); } catch (e) { return []; } };
  return { top, paks, gameDirTop: ls(c.gameDir), resourceTop: ls(c.root), total: c.entries.size };
}

function analyse(dir, o, core) {
  const c = collect(dir, core);
  try {
    const ext = {};
    for (const e of c.entries.values()) inc(ext, extOf(e.name) || '(none)');
    const t = scanText(c);
    return { layout: topLayout(c), ext, ...t, bin: scanBin(c, o.sample), set: scanSet(c), map: scanMap(c), lng: scanLng(c, dir), mod: modInfo(dir), errors: c.ps.errors.length };
  } finally { c.ps.close(); }
}

function diffCounts(a, b, min) {
  const onlyA = [], onlyB = [];
  for (const [k, v] of Object.entries(a)) if (!(k in b) && v >= min) onlyA.push([k, v]);
  for (const [k, v] of Object.entries(b)) if (!(k in a) && v >= min) onlyB.push([k, v]);
  const s = (x, y) => y[1] - x[1];
  return { as2: onlyA.sort(s), goh: onlyB.sort(s) };
}

function report(A, G, o) {
  const L = [], p = s => L.push(s), N = o.top, min = o.min;
  const fmt = l => l.slice(0, N).map(([k, v]) => k + ' ' + v).join(', ');
  const sum = x => Object.values(x).reduce((a, b) => a + b, 0);
  p('## layout');
  p('files: as2 ' + A.layout.total + ' goh ' + G.layout.total);
  const tl = diffCounts(A.layout.top, G.layout.top, 1);
  p('top-folder only as2: ' + fmt(tl.as2)); p('top-folder only goh: ' + fmt(tl.goh));
  p('gamedir as2: ' + A.layout.gameDirTop.join(' ')); p('gamedir goh: ' + G.layout.gameDirTop.join(' '));
  p('resource as2: ' + A.layout.resourceTop.join(' ')); p('resource goh: ' + G.layout.resourceTop.join(' '));
  p('## ext');
  const ed = diffCounts(A.ext, G.ext, 1);
  p('ext only as2: ' + fmt(ed.as2)); p('ext only goh: ' + fmt(ed.goh));
  const both = Object.keys(A.ext).filter(k => k in G.ext).sort((a, b) => (A.ext[b] + G.ext[b]) - (A.ext[a] + G.ext[a])).slice(0, N);
  p('ext both (as2/goh): ' + both.map(k => k + ' ' + A.ext[k] + '/' + G.ext[k]).join(', '));
  p('## roots');
  const rd = diffCounts(A.roots, G.roots, 1);
  p('root only as2: ' + fmt(rd.as2)); p('root only goh: ' + fmt(rd.goh));
  const rb = Object.keys(A.roots).filter(k => k in G.roots).sort((a, b) => (A.roots[b] + G.roots[b]) - (A.roots[a] + G.roots[a])).slice(0, N);
  p('root both (as2/goh): ' + rb.map(k => k + ' ' + A.roots[k] + '/' + G.roots[k]).join(', '));
  const id = diffCounts(A.incs, G.incs, min);
  p('include target only as2: ' + fmt(id.as2)); p('include target only goh: ' + fmt(id.goh));
  p('## keys');
  const kinds = new Set([...Object.keys(A.keys), ...Object.keys(G.keys)]);
  for (const k of [...kinds].sort()) {
    const a = A.keys[k] || {}, g = G.keys[k] || {};
    const d = diffCounts(a, g, min);
    if (!d.as2.length && !d.goh.length) continue;
    p('kind ' + k + ' blocks as2 ' + sum(a) + ' goh ' + sum(g) + ' | only as2 (' + d.as2.length + '): ' + fmt(d.as2) + ' | only goh (' + d.goh.length + '): ' + fmt(d.goh));
  }
  p('## bin');
  for (const x of new Set([...Object.keys(A.bin), ...Object.keys(G.bin)])) {
    const a = A.bin[x] || { total: 0, tally: {} }, g = G.bin[x] || { total: 0, tally: {} };
    p('bin .' + x + ' as2 ' + a.total + ' [' + fmt(Object.entries(a.tally)) + '] goh ' + g.total + ' [' + fmt(Object.entries(g.tally)) + ']');
  }
  p('## set');
  for (const d of [...new Set([...Object.keys(A.set), ...Object.keys(G.set)])].sort()) {
    const a = A.set[d], g = G.set[d];
    if (!a || !g) { p('set dir ' + d + ' only ' + (a ? 'as2 ' + a.n : 'goh ' + g.n)); continue; }
    let oa = 0, og = 0; for (const f of a.files) if (!g.files.has(f)) oa++; for (const f of g.files) if (!a.files.has(f)) og++;
    p('set dir ' + d + ' as2 ' + a.n + ' goh ' + g.n + ' file only as2 ' + oa + ' only goh ' + og + ' ext as2 {' + fmt(Object.entries(a.ext)) + '} goh {' + fmt(Object.entries(g.ext)) + '}');
  }
  p('## map');
  for (const [n, x] of [['as2', A.map], ['goh', G.map]]) p('mapdirs ' + n + ' ' + x.maps + ' ext-presence {' + fmt(Object.entries(x.ext)) + '}');
  p('## lng');
  for (const [n, x] of [['as2', A.lng], ['goh', G.lng]]) p('lng ' + n + ' files ' + x.files + ' lng ' + x.lng + ' pot ' + x.pot + ' msgctxt ' + x.msgctxt + ' bom ' + x.bom + ' utf8 ' + x.utf8 + ' cp1251 ' + x.cp1251 + ' ascii ' + x.ascii + ' names ' + fmt(Object.entries(x.langs)) + ' sample ' + x.sample);
  p('## modinfo');
  for (const [n, x] of [['as2', A.mod], ['goh', G.mod]]) p('modinfo ' + n + ' mods ' + x.n + ' digitfolders ' + x.folders.digits + ' other ' + x.folders.other + ' subdirs {' + fmt(Object.entries(x.sub)) + '} keys {' + fmt(Object.entries(x.keys)) + '} minGameVersion {' + fmt(Object.entries(x.mgv)) + '} maxGameVersion {' + fmt(Object.entries(x.mxgv)) + '} tags {' + fmt(Object.entries(x.tags)) + '}');
  return L.join('\n');
}

function main(argv) {
  const o = { sample: 120, min: 3, top: 25 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--as2') o.as2 = argv[++i]; else if (a === '--goh') o.goh = argv[++i];
    else if (a === '--sample') o.sample = +argv[++i]; else if (a === '--min') o.min = +argv[++i]; else if (a === '--top') o.top = +argv[++i];
    else if (a === '--json') o.json = argv[++i]; else if (a === '-q') o.q = true;
    else if (a === '--exe') { const g = games.get(argv[++i]); if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2'); process.exit(2); } o.game = g.id; }
  }
  if (o.game === 'goh') { console.error('gamediff: --exe names the AS2 side (as64 or mowas2); the GoH side is --goh'); process.exit(2); }
  if (!o.as2 && o.game) o.as2 = games.install(o.game).dir || undefined;
  if (!o.goh && o.game) o.goh = games.install('goh').dir || undefined;
  if (!o.as2 || !o.goh) { console.error('usage: gamediff.js --as2 <dir> --goh <dir> [--exe as64|mowas_2] [--sample N] [--min N] [--top N] [--json out] [-q]'); process.exit(2); }
  const A = analyse(o.as2, o, o.game === 'as64'), G = analyse(o.goh, o);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ as2: A, goh: G }, (k, v) => v instanceof Set ? undefined : v));
  console.log(report(A, G, o));
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { analyse, report };

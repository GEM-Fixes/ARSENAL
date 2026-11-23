#!/usr/bin/env node
// unitcard: unit card pictures (buy card, unit list, squad, portrait, shop, damage scheme) in the vanilla style of each game,
// from an image or a 3D render (the render is taken in the GUI: Units page, tool "Unit card"), written into a mod folder.
// Read only on the game; writes only with --write and only inside --mod. Facts, styles and tags: README.md.
//   node tools/unitcard/unitcard.js kinds [--game as64|mowas2|goh] [--json]
//   node tools/unitcard/unitcard.js styles --game G [--dir install] [--kind card] [--group vehicle|gun|infantry|hero] [--army rus] [--out dir] [--json]
//   node tools/unitcard/unitcard.js plan --game G --mod M --unit U [--from image | --render] [unit and style options] [--json]
//   node tools/unitcard/unitcard.js make --game G --mod M --unit U --from image [--write] [--preview dir] [options] [--json]
//   node tools/unitcard/unitcard.js check --game G --mod M [--json]
//   node tools/unitcard/unitcard.js cutouts [--game G] [--kind card] [--group infantry] [--army rus] [--armies n] [--force] [--root dir] [--mod M --source mod] [--json]
//     the GIMP cutout set of every class (lib/cutouts.js) into the local cache (env ARSENAL_CUTOUTS, else %LOCALAPPDATA%\ARSENAL\cutouts)
//   node tools/unitcard/unitcard.js sheet --game G [--kind card] [--class vehicle] [--army ger] [--layout strip32|full] [--units 10] [--renders dir] [--out dir] [--json]
//     acceptance sheets: per kind + class one PNG at 3x, game card | card made from its clean cutout | difference, per frame,
//     + the card on another army's plate + the card from <unit>_<kind>.png in --renders (default out: cardlook/sheets under the scratch folder)
//   node tools/unitcard/unitcard.js fidelity [--game G] [--kind card] [--group infantry] [--army rus] [--armies 3] [--tests 4] [--cutter builtin|gimp|both] [--max-mean 6] [--json]
//     round trip: vanilla cards taken apart (layers) and built again from their own subject; mean and worst pixel error per
//     kind/class/army; exit 1 when a mean is over --max-mean (0..255, default 6); a game without an install is skipped (exit 0)
// --game: a game id (as64, mowas2, goh) or an install folder; --dir: the install folder when --game is an id (else lib/games finds it)
// unit options: --kind vehicle|squad|soldier --army A --def stem --breed mp/<army>/<name> --portrait name --hero
//   --kinds card,small,squad,portrait,shop,scheme   --new-portrait name | --keep-portrait
// image options: --fit contain|cover  --crop x,y,w,h  --scale 1.1  --dx 2 --dy -1  --anchor 0.5,0.6  --mirror
//   --key auto|none|r,g,b  --tol 36 --soft 24   style: --look auto|colour|silhouette|keep  --tone r,g,b  --no-shadow  --builtin (no GIMP cutouts)
// --plate plain|game (make, plan, sheet, styles; default plain: the plate drawn by code from the class numbers; game: cut from the game's cards)
// Exit: 0 ok, 1 findings with errors (check), 2 bad use.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-b3795b4c)
'use strict';
const fs = require('fs'), path = require('path');
const Ly = require('./lib/layers'), K = require('./lib/kinds'), U = require('./lib/unit'), S = require('./lib/styles'), M = require('./lib/make'), C = require('./lib/check'), I = require('./lib/img'), CAM = require('./lib/camera');

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2), n = argv[i + 1]; if (n == null || n.startsWith('--')) o[k] = true; else { o[k] = n; i++; } }
    else o._.push(a);
  }
  return o;
}
const die = m => { process.stderr.write('unitcard: ' + m + '\n'); process.exit(2); };
const nums = s => String(s).split(',').map(Number);
function gameOf(o) {
  const G = require('../lib/games');
  const g = o.game || 'as64';
  if (fs.existsSync(g) && fs.statSync(g).isDirectory()) return { dir: g, gid: o.gid || G.detect(g) || 'as64' };
  const gid = G.idOf(g); if (!gid) die('unknown game: ' + g + ' (as64, mowas2, goh or an install folder)');
  const dir = o.dir || (G.install(gid, {}) || {}).dir;
  if (!dir) die('no install folder found for ' + gid + ': give --dir');
  return { dir, gid };
}
function unitOf(V, o) {
  if (!o.unit) die('give --unit <card id>');
  return U.resolve(V, o.unit, { kind: o.kind, army: o.army, def: o.def, breed: o.breed, portrait: o.portrait, hero: o.hero ? true : undefined });
}
function opts(o) {
  const fit = {};
  if (o.fit) fit.mode = o.fit; if (o.crop) fit.box = nums(o.crop); if (o.scale) fit.scale = +o.scale; if (o.dx) fit.dx = +o.dx; if (o.dy) fit.dy = +o.dy;
  if (o.anchor) fit.anchor = nums(o.anchor); if (o.mirror) fit.mirror = true;
  const style = {}; if (o.look) style.look = o.look; if (o.tone) style.tone = nums(o.tone); if (o['no-shadow']) style.shadow = false; if (o['no-outline']) style.outline = false;
  return { kinds: o.kinds ? String(o.kinds).split(',') : null, newPortrait: o['new-portrait'] || null, keepPortrait: !!o['keep-portrait'],
    fits: { default: fit }, style, key: o.key === 'none' || o.key === 'auto' || !o.key ? (o.key || 'auto') : nums(o.key), tol: o.tol != null ? +o.tol : undefined, soft: o.soft != null ? +o.soft : undefined, builtIn: !!o.builtin, plate: plateArg(o) };
}
function plateArg(o) { const v = o.plate == null || o.plate === true ? 'plain' : String(o.plate); if (v !== 'plain' && v !== 'game') die('--plate plain|game (default plain)'); return v; }
function out(o, obj, text) { if (o.json) process.stdout.write(JSON.stringify(obj, null, 1) + '\n'); else process.stdout.write(text + '\n'); }

function main() {
  const o = args(process.argv.slice(2)), cmd = o._[0];
  if (!cmd || o.help) { process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 25).map(l => l.slice(3)).join('\n') + '\n'); return 0; }
  if (cmd === 'kinds') {
    const gs = o.game ? [require('../lib/games').idOf(o.game) || 'as64'] : ['as64', 'goh'];
    const rows = []; for (const g of gs) { for (const k of K.list(g)) rows.push(Object.assign({ gid: g }, k)); for (const n of K.NOT[K.family(g)]) rows.push({ gid: g, id: n.id, not: n.why }); }
    out(o, rows, rows.map(r => r.not ? r.gid + '  ' + r.id + '  not made: ' + r.not : r.gid + '  ' + r.id.padEnd(9) + (r.folder + '/').padEnd(17) + (r.w + 'x' + r.h).padEnd(8) + 'frames ' + (r.frames || '-') + '  name=' + r.name + '  [' + r.tag + ']  ' + r.use + ' | missing: ' + r.miss).join('\n'));
    return 0;
  }
  if (cmd === 'fidelity') return fidelityCmd(o);
  if (cmd === 'cutouts') return cutoutsCmd(o);
  if (cmd === 'sheet') return sheetCmd(o);
  const g = gameOf(o);
  const V = U.open({ game: g.dir, gid: g.gid, mod: o.mod && fs.existsSync(o.mod) ? o.mod : null });
  if (cmd === 'styles') {
    const ks = o.kind ? [K.get(g.gid, o.kind)].filter(Boolean) : K.list(g.gid);
    const groups = o.group ? [o.group] : ['vehicle', 'gun', 'infantry', 'hero'];
    const res = [];
    for (const k of ks) for (const gr of groups) {
      if ((k.id === 'small' || k.id === 'scheme') && (gr === 'infantry' || gr === 'hero')) continue;
      if ((k.id === 'squad' || k.id === 'portrait') && (gr === 'vehicle' || gr === 'gun')) continue;
      // the class layers read from the game's (or the mod's) own cards; a class with no cards says so (no made-up plate)
      let m; try { m = M.modelOf(V, k, gr, o.army || '', { matchMod: !!o.mod }); } catch (e) { res.push({ kind: k.id, group: gr, army: o.army || '', skip: e.message }); continue; }
      const s = Object.assign(Ly.summary(m), { plate: plateArg(o) }); res.push(s);
      if (o.out && m.fill && !m.template) { fs.mkdirSync(o.out, { recursive: true }); const W = m.w, sheet = I.blank(W * m.fill.length, m.h); m.fill.forEach((p, i) => I.over(sheet, p, i * W, 0)); fs.writeFileSync(path.join(o.out, g.gid + '_' + k.id + '_' + gr + (o.army ? '_' + o.army : '') + '.png'), I.png(sheet)); }
    }
    out(o, res, res.map(s => s.skip ? s.kind + '/' + s.group + ': ' + s.skip : s.game + ' ' + s.kind + '/' + s.group + (s.army ? '(' + s.army + ')' : '') + ': ' + s.size + ' x' + (s.frames || 1) + ', ' + s.refs + ' cards from the ' + (s.source || 'game') + (s.template ? ', too few clean cards: a card is the template' : ', clean ' + s.clean + '%') + (s.badges.length ? ', badges ' + s.badges.length : '') + (s.subject ? ', subject h ' + s.subject.height + ' w ' + s.subject.width + ' base ' + s.subject.baseline + ' cx ' + s.subject.cx : '') + ', plate ' + s.plate).join('\n'));
    V.close(); return 0;
  }
  if (cmd === 'check') {
    if (!o.mod) die('give --mod');
    const r = C.check(V, o.mod, {});
    out(o, r, r.findings.map(f => f.level.toUpperCase() + ' ' + f.code + ' ' + f.key + ': ' + f.msg).join('\n') + '\n' + JSON.stringify(r.counts));
    V.close(); return r.counts.error ? 1 : 0;
  }
  if (cmd === 'plan' || cmd === 'make') {
    if (!o.mod) die('give --mod <mod folder>');
    const u = unitOf(V, o), op = opts(o);
    const cams = {}; for (const k of K.list(g.gid)) if (k.on.includes(u.kind)) cams[k.id] = CAM.preset(g.gid, k.id, u.group);
    if (cmd === 'plan') {
      const p = M.plan(V, u, op);
      const src = o.render ? { render: true, cameras: cams, note: 'The render is taken by the GUI (Units page, tool "Unit card"): WebGL has no place in a command line. Save it as PNG and give --from.' } : o.from ? { from: o.from } : { none: true };
      out(o, Object.assign({ source: src }, p, { data: p.data.map(d => ({ key: d.key, from: d.from, line: d.line, was: d.was })) }),
        'plate ' + p.plate + (p.plate === 'plain' ? ' (drawn by code from the class numbers)' : ' (cut from the game cards)') + '\nunit ' + u.id + ' (' + u.kind + ', ' + u.group + (u.army ? ', ' + u.army : '') + (u.def ? ', def ' + u.def : '') + (u.portrait ? ', portrait ' + u.portrait : '') + ')\n' +
        p.kinds.map(k => '  ' + k.kind.padEnd(9) + k.w + 'x' + k.h + '  ' + k.files.map(f => f.key).join('  ') + (k.had.length ? '  (replaces ' + k.had.length + ' from ' + [...new Set(k.had.map(h => h.from))].join('+') + ')' : '')).join('\n') +
        (p.data.length ? '\n  data: ' + p.data.map(d => d.key + ' ' + d.line + ' (was ' + (d.was || 'none') + ', ' + d.from + ')').join('; ') : '') +
        (p.skip.length ? '\n  not made: ' + p.skip.map(s => s.kind + ' (' + s.why + ')').join('; ') : '') + (p.notes.length ? '\n  notes: ' + p.notes.join(' ') : '') +
        (o.render ? '\n  render: ' + Object.keys(cams).map(k => k + ' az ' + cams[k].az + ' el ' + cams[k].el).join(', ') + '\n  ' + src.note : ''));
      V.close(); return 0;
    }
    if (o.render) die('make --render: the 3D render is taken in the GUI (WebGL). Use the Units page tool "Unit card", or give --from <png>.');
    if (!o.from) die('give --from <image> (PNG, TGA, DDS, BMP, JPG)');
    const pic = I.decode(fs.readFileSync(o.from), o.from);
    const r = M.make(V, u, { default: pic }, op);
    if (o.preview) { fs.mkdirSync(o.preview, { recursive: true }); for (const k in r.previews) r.previews[k].forEach((d, i) => fs.writeFileSync(path.join(o.preview, k + '_0' + i + '.png'), Buffer.from(d.split(',')[1], 'base64'))); }
    let written = [];
    if (o.write) {
      const why = require('../lib/writeguard').refuseWrite ? require('../lib/writeguard').refuseWrite(o.mod, { game: g.dir }) : null;
      if (why) die(String(why));
      written = M.write(r, o.mod, { gameDir: g.dir });
    }
    out(o, { plan: Object.assign({}, r.plan, { data: r.plan.data.map(d => ({ key: d.key, line: d.line, from: d.from })) }), files: r.out.map(f => ({ key: f.key, bytes: f.buf.length, size: f.size || null })), written, styles: r.styles },
      (o.write ? 'wrote ' + written.length + ' files into ' + o.mod : 'preview (nothing written; add --write)') + '\n' + r.out.map(f => '  ' + f.key + (f.size ? '  ' + f.size : '') + '  ' + f.buf.length + ' bytes').join('\n') +
      (r.plan.notes.length ? '\nnotes: ' + r.plan.notes.join(' ') : '') + '\nwhat to check in game: ' + inGame(r.plan, g.gid));
    V.close(); return 0;
  }
  die('unknown command: ' + cmd);
}
// the classes of one or both games: [{ gid, dir, k, group, armies }]
const GROUPS = { card: ['infantry', 'vehicle', 'gun'], small: ['vehicle', 'gun'], squad: ['infantry', 'hero'], portrait: ['infantry', 'hero'], shop: ['infantry', 'vehicle'], scheme: ['vehicle'] };
function classes(V, gid, o, minRefs) {
  const out = [];
  for (const k of K.list(gid)) {
    if (o.kind && k.id !== o.kind) continue;
    for (const gr of o.group ? [o.group] : GROUPS[k.id] || []) {
      const by = new Map(); for (const r of Ly.pick(V, k, gr, { source: o.source })) by.set(r.army || '', (by.get(r.army || '') || 0) + 1);
      let ar = o.army ? (by.has(o.army) ? [o.army] : []) : [...by].filter(x => x[0] && x[1] >= minRefs).sort((p, q) => q[1] - p[1]).map(x => x[0]);
      if (o.armies) ar = ar.slice(0, +o.armies);
      // a class with no army of its own (heroes): one set over all cards
      if (!ar.length && !o.army && [...by.values()].reduce((p, v) => p + v, 0) >= 3) ar = [''];
      out.push({ k, group: gr, armies: ar });
    }
  }
  return out;
}
function installs(o) {
  const G = require('../lib/games'), gids = o.game ? [G.idOf(o.game) || o.game] : ['as64', 'goh'];
  return gids.map(gid => { const dir = o.dir || (G.install(gid, {}) || {}).dir; return { gid, dir: dir && fs.existsSync(dir) ? dir : null }; });
}
// node tools/unitcard/unitcard.js cutouts [--game G] [--kind k] [--group g] [--army a] [--armies n] [--force] [--root dir] [--mod M --source mod] [--json]
async function cutoutsCmd(o) {
  const Cu = require('./lib/cutouts'), Gp = require('../gimp/gimp'), st = Gp.status(), rows = [];
  if (!st.found) { out(o, { gimp: st, rows }, 'GIMP not found (' + (st.why || '') + '): the built-in cutter is used, nothing to build.'); return 0; }
  const t0 = Date.now();
  for (const g of installs(o)) {
    if (!g.dir) { rows.push({ gid: g.gid, skip: 'no install found' }); continue; }
    const V = U.open({ game: g.dir, gid: g.gid, mod: o.mod && fs.existsSync(o.mod) ? o.mod : null }), tg = Date.now();
    try {
      for (const c of classes(V, g.gid, o, 3)) for (const a of c.armies) {
        const t = Date.now();
        const s = await Cu.build(V, c.k, c.group, a, { root: o.root, force: !!o.force, source: o.source === 'mod' ? 'mod' : 'game', mod: o.mod });
        const row = { gid: g.gid, kind: c.k.id, group: c.group, army: a, cutter: s.cutter, dir: s.dir, reused: !!s.reused, ms: Date.now() - t, why: s.why, files: s.files ? Object.keys(s.files).length : 0, kept: s.kept || [] };
        rows.push(row); process.stderr.write((row.cutter === 'gimp' ? (row.reused ? 'kept ' : 'made ') : 'builtin ') + g.gid + ' ' + c.k.id + '/' + c.group + '(' + (a || 'all') + ') ' + row.ms + ' ms' + (row.why ? ' - ' + row.why : '') + '\n');
      }
    } finally { V.close(); }
    rows.push({ gid: g.gid, total: true, ms: Date.now() - tg });
  }
  const root = Cu.rootOf({ root: o.root });
  const size = (function du(d) { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? du(p) : fs.statSync(p).size; } } catch (e) { /* none */ } return n; })(root);
  out(o, { gimp: { version: st.version, exe: st.exe }, root, bytes: size, ms: Date.now() - t0, rows },
    rows.map(r => r.total ? r.gid + ' total ' + Math.round(r.ms / 1000) + ' s' : r.skip ? r.gid + ' skip: ' + r.skip : r.gid + ' ' + (r.kind + '/' + r.group + '(' + (r.army || 'all') + ')').padEnd(26) + ' ' + (r.cutter === 'gimp' ? (r.reused ? 'kept (cache)' : 'GIMP') : 'built-in: ' + r.why) + '  ' + r.files + ' files  ' + Math.round(r.ms / 100) / 10 + ' s' + (r.kept.length ? '  hand edits kept: ' + r.kept.join(', ') : '')).join('\n') +
    '\ncache ' + root + '  ' + (size / 1048576).toFixed(1) + ' MB, GIMP ' + st.version);
  return rows.some(r => r.cutter === 'builtin' && r.why && /GIMP failed/.test(r.why)) ? 1 : 0;
}
// acceptance sheets (lib/sheet.js): one PNG per kind + class + army
function sheetCmd(o) {
  const Sh = require('./lib/sheet'), rows = [], outDir = o.out || process.env.UNITCARD_SHEETS || require('../lib/platform').tmpDir('cardlook/sheets');
  if (o.class && !o.group) o.group = o.class;
  for (const g of installs(o)) {
    if (!g.dir) { rows.push({ gid: g.gid, skip: 'no install found' }); continue; }
    const V = U.open({ game: g.dir, gid: g.gid });
    try {
      for (const c of classes(V, g.gid, o, 3)) {
        const ar = o.army ? c.armies : c.armies.slice(0, +o.armies || 1);
        if (!ar.length) { rows.push({ gid: g.gid, kind: c.k.id, group: c.group, skip: 'no cards of this class' }); continue; }
        // one sheet per card layout of the class (AS2: strip cards and full cards; --layout picks one)
        const lays = require('./lib/look').layouts(V, c.k, c.group).filter(l => l.n >= 3 && (!o.layout || l.id === o.layout)).map(l => l.id);
        for (const a of ar) for (const ly of lays.length > 1 || o.layout ? lays : ['']) {
          const t = Date.now(), r = Sh.sheet(V, c.k, c.group, a, { out: outDir, units: +o.units || 10, layout: ly || undefined, renders: o.renders ? path.join(o.renders, g.gid) : null, plate: plateArg(o) });
          const ok = (r.rows || []).filter(x => x.err != null);
          rows.push({ gid: g.gid, kind: c.k.id, group: c.group, army: a, layout: ly, plate: plateArg(o), file: r.file, why: r.why, legend: r.legend, units: r.rows, mean: ok.length ? Math.round(ok.reduce((p, x) => p + x.err, 0) / ok.length * 10) / 10 : null, ms: Date.now() - t, summary: r.summary });
        }
      }
    } finally { V.close(); }
  }
  out(o, rows, rows.map(r => r.skip ? r.gid + ' ' + (r.kind ? r.kind + '/' + r.group + ' ' : '') + 'skip: ' + r.skip : r.why ? r.gid + ' ' + r.kind + '/' + r.group + '(' + (r.army || 'all') + ') no sheet: ' + r.why :
    (r.gid + ' ' + r.kind + '/' + r.group + '(' + (r.army || 'all') + ')' + (r.layout ? ' ' + r.layout : '')).padEnd(36) + ' mean diff ' + r.mean + '  ' + r.file + (r.units.some(u => u.why) ? '  refused: ' + r.units.filter(u => u.why).map(u => u.stem + ' (' + u.why + ')').join('; ') : '')).join('\n'));
  return 0;
}
// the round trip: vanilla cards taken apart and built again from their own subject (leave-one-out), per cutter
async function fidelityCmd(o) {
  const rows = [], max = o['max-mean'] != null ? +o['max-mean'] : 6;
  const cutters = o.cutter === 'both' ? ['builtin', 'gimp'] : [o.cutter === 'gimp' ? 'gimp' : 'builtin'];
  const Cu = cutters.includes('gimp') ? require('./lib/cutouts') : null;
  if (Cu && !require('../gimp/gimp').status().found) { rows.push({ skip: 'GIMP not found: the gimp cutter is skipped' }); cutters.splice(cutters.indexOf('gimp'), 1); }
  for (const g of installs(o)) {
    if (!g.dir) { rows.push({ gid: g.gid, skip: 'no install found' }); continue; }
    const V = U.open({ game: g.dir, gid: g.gid });
    try {
      for (const c of classes(V, g.gid, o, 4)) {
        if (!c.armies.length) { rows.push({ gid: g.gid, kind: c.k.id, group: c.group, skip: 'fewer than 4 cards of one army' }); continue; }
        for (const a of c.armies.slice(0, +o.armies || 3)) for (const cut of cutters) {
          const op = { tests: +o.tests || 4 };
          const f = cut === 'gimp' ? await Cu.fidelity(V, c.k, c.group, a, Object.assign(op, { root: o.root, force: !!o.force })) : Ly.fidelity(V, c.k, c.group, a, op);
          const okT = (f.tests || []).filter(x => x.frames);
          const per = okT.length ? okT[0].frames.map((_, i) => { const e = okT.map(x => x.frames[i]); return { mean: e.reduce((p, x) => p + x.mean, 0) / e.length, worst: Math.max(...e.map(x => x.max)), p99: Math.max(...e.map(x => x.p99)) }; }) : [];
          rows.push({ gid: g.gid, kind: c.k.id, group: c.group, army: a, cutter: f.cutter || cut, why: f.why, refs: f.refs, tested: okT.length, skipped: (f.tests || []).filter(x => x.skip).map(x => x.stem + ': ' + x.skip), agg: f.agg, frames: per, over: !!(f.agg && per.some(e => e.mean > max)) });
        }
      }
    } finally { V.close(); }
  }
  const r1 = v => (v == null ? '-' : (Math.round(v * 10) / 10).toFixed(1));
  out(o, { maxMean: max, rows }, rows.map(r => r.skip ? (r.gid ? r.gid + ' ' : '') + (r.kind ? r.kind + '/' + r.group + ' ' : '') + 'skip: ' + r.skip :
    (r.over ? 'OVER ' : '     ') + (r.gid + ' ' + r.kind + '/' + r.group + '(' + (r.army || 'all') + ')' + (r.layout ? ' ' + r.layout : '')).padEnd(36) + ' ' + String(r.cutter).padEnd(7) + ' refs ' + String(r.refs).padStart(3) + ' tested ' + r.tested +
    (r.agg ? '  mean ' + r1(r.agg.mean) + ' p99 ' + r1(r.agg.p99) + ' worst ' + r1(r.agg.max) + '  per frame ' + r.frames.map(e => r1(e.mean) + '/' + r1(e.p99)).join(' ') : '  no test (' + (r.why || r.skipped.slice(0, 1).join('; ')) + ')')).join('\n') +
    '\nthreshold: mean per frame <= ' + max + ' (0..255)');
  return rows.some(r => r.over) ? 1 : 0;
}
function inGame(p, gid) {
  const t = [];
  for (const k of p.kinds) {
    if (k.kind === 'card') t.push('buy panel: the card of ' + p.unit.id + ' (normal, hover, pressed, locked)');
    if (k.kind === 'small') t.push('a bought ' + p.unit.id + ' in the unit list, bottom left');
    if (k.kind === 'squad') t.push('a soldier in the unit list');
    if (k.kind === 'portrait') t.push('one soldier selected: the soldier panel portrait');
    if (k.kind === 'shop') t.push('Conquest shop / reinforcement portrait');
    if (k.kind === 'scheme') t.push('the vehicle panel damage scheme');
  }
  return [...new Set(t)].join('; ') + '; then read game.log for the picture names' + (gid === 'goh' ? ' (GoH: not tried in game yet)' : '');
}
if (require.main === module) { try { Promise.resolve(main()).then(c => { process.exitCode = c; }, e => { process.stderr.write('unitcard: ' + (e && e.stack || e) + '\n'); process.exitCode = 2; }); } catch (e) { process.stderr.write('unitcard: ' + (e && e.stack || e) + '\n'); process.exitCode = 2; } }
module.exports = { main, args };

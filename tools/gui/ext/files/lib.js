// files ext, server side: mod file tree + VFS winner (E-2), raw text editor with byte-exact save (E-1), restore points (E-22), search (E-3).
// Reads anywhere. Writes only inside the picked mod folder; never the game install (except <game>/mods/<mod>), vanilla, game paks, GoH or Workshop.
// Game parity: every route follows the page's game (ctx.gameId: as64 default, mowas2, goh). mowas2 = the AS2 install with vfs exe
// mowas_2 (no as64/core, no as64+), version from mowas_2.exe. goh = the GoH install (ctx.curDir), vfs exe goh, the GoH profile
// (userdir.gohUserDir) and text language; under GoH a mod in <GoH>/mods/<name> or a GoH Workshop item is READ only (tree, which,
// open, search, restore point list; why 'goh', note 'goh-ro'); save, copy in and restore there are refused (writeguard; owner's call).
// A text file inside one of the mod's own paks can be saved: the pak is written again with that one entry replaced (savePak).
// Byte-exact rule: lines the user did not touch are written back as their original bytes (CRLF/LF, BOM, cp1251 comments kept);
// on a changed line only the changed middle is new (UTF-8); the unchanged start and end of that line keep their old bytes.
// Restore points live NEXT TO the mod (<mod>.arsenal-undo/), not inside it: the engine would not mount a dot folder in the mod root
// (VFS-26), but the Workshop uploader ships the whole mod folder (VFS-32) and doctor flags stray folders (REL_STRAY_FILE).
// Author: Imperator_Aug (ARSENAL, ia-a338fe8e)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const vfsLib = require('../../../lib/vfs'), names = require('../../../lib/names'), pak = require('../../../lib/pak');
const gamedir = require('../../../lib/gamedir'), userdir = require('../../../lib/userdir'), enc = require('../../../lib/enc');
const writeguard = require('../../../lib/writeguard'), gamever = require('../../../lib/gamever'), gameview = require('../../../lib/gameview');

const MAX_EDIT = 2 * 1024 * 1024, MAX_COPY = 8 * 1024 * 1024, MAX_TREE = 8000, MAX_PAK_LIST = 50000;
// search time budget: 8 s; env ARSENAL_FILES_SEARCH_MS (1000..600000) sets another, for the tests on a loaded machine
const SEARCH_MS = (n => (n >= 1000 && n <= 600000 ? n : 8000))(Number(process.env.ARSENAL_FILES_SEARCH_MS));
const SEARCH = { hits: 500, files: 30000, ms: SEARCH_MS, size: 4 * 1024 * 1024, line: 2000 };
const UNDO_SUFFIX = '.arsenal-undo', MANIFEST = 'restore-point.json';
const SKIP_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules', '.vs', '.vscode', '.idea']);
const BIN_EXT = /\.(pak|pat|zip|7z|rar|dds|tga|png|jpg|jpeg|bmp|ogg|wav|mp3|mdl|ply|anm|exe|dll|bin|fnt|ttf|psd|mtl|msh|lnk)$/i;
const NO_EDIT_EXT = /\.(pak|pat|zip|7z|rar|exe|dll)$/i;

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s).toLowerCase();
const norm = p => lc(fwd(path.resolve(p))).replace(/\/+$/, '');
const same = (a, b) => norm(a) === norm(b);
const inside = (p, root) => { const a = norm(p), r = norm(root); return a.startsWith(r + '/'); };
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const stat = f => { try { return fs.statSync(f); } catch { return null; } };
const isDir = f => { const s = stat(f); return !!(s && s.isDirectory()); };
const homeOpt = () => (process.env.AS2_HOME ? { home: process.env.AS2_HOME } : {});
const realOf = p => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };

// game parity: the request's game (gui.js ctx.gameId: 'as64' | 'mowas2' | 'goh'; a ctx without it, or anything else = as64, so AS64
// works as before). gameOf = the folder of that game: the AS2 install (ctx.game) for as64 and mowas2, the GoH install (ctx.curDir,
// else ctx.gohDir) for goh. exeOf = the vfs exe handed to vfs.build and gamever.read.
const GID_EXE = { as64: 'as64', mowas2: 'mowas_2', goh: 'goh' };
// A ctx that names no game id but has ctx.exe() (a lib's own ctx: 'mowas_2' | 'mowas2' | 'goh' | 'as64') is taken by its exe.
const EXE_GID = { as64: 'as64', mowas_2: 'mowas2', mowas2: 'mowas2', goh: 'goh' };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function gidOf(ctx) {
  let g = null;
  try { g = ctx && typeof ctx.gameId === 'function' ? ctx.gameId() : null; } catch { g = null; }
  if (own(GID_EXE, g)) return g;
  try { const x = ctx && typeof ctx.exe === 'function' ? String(ctx.exe() || '').toLowerCase() : ''; if (own(EXE_GID, x)) return EXE_GID[x]; } catch { /* as64 */ }
  return 'as64';
}
const exeOf = ctx => GID_EXE[gidOf(ctx)];
function gameOf(ctx) {
  if (gidOf(ctx) === 'goh') {
    try { return (typeof ctx.curDir === 'function' && ctx.curDir()) || (typeof ctx.gohDir === 'function' && ctx.gohDir()) || null; } catch { return null; }
  }
  try { return (ctx && ctx.game && ctx.game()) || null; } catch { return null; }
}
let _goh;
function gohDir(ctx) {
  if (ctx && gidOf(ctx) === 'goh') { const d = gameOf(ctx); if (d) return d; }
  if (_goh !== undefined) return _goh;
  try { _goh = gamedir.goh({}) || null; } catch { _goh = null; }
  return _goh;
}
// GoH read view: a mod folder <GoH>/mods/<name> and an installed GoH Workshop item (<steamapps>/workshop/content/400750/<item>,
// GHVFS-24) are read in place; ARSENAL never writes there (writeguard; whether it may is the owner's, no decision yet).
const GOH_ITEM = /\/steamapps\/workshop\/content\/400750\/\d+(\/|$)/;
function gohLocked(ctx, p) {
  if (gidOf(ctx) !== 'goh' || !p) return false;
  const g = gohDir(ctx), f = lc(fwd(path.resolve(p))) + '/';
  if (GOH_ITEM.test(f)) return true;
  if (g && (same(p, g) || inside(p, g))) return true;
  const up = gameAbove(p);
  return !!(up && stat(path.join(up, 'binaries', 'x64', 'call_to_arms.exe')));
}

// ---------------------------------------------------------------- write guards
// A game install = a folder holding as64.exe, mowas_2.exe or binaries/x64/call_to_arms.exe. Inside one, only <game>/mods/<name> (and below) is a mod.
function gameAbove(p) {
  let d = path.resolve(p);
  for (;;) {
    if (['as64.exe', 'mowas_2.exe'].some(x => stat(path.join(d, x))) || stat(path.join(d, 'binaries', 'x64', 'call_to_arms.exe'))) return d;
    const up = path.dirname(d); if (up === d) return null; d = up;
  }
}
// read = a read route under GoH (tree, which, open, search, restore point list): <GoH>/mods/<name> and a GoH Workshop item pass.
function refuseZone(ctx, q, isRoot, read) {
  const f = lc(fwd(q)), gohRead = !!read && gidOf(ctx) === 'goh';
  if (gohRead && GOH_ITEM.test(f + '/')) {
    if (isRoot && !/\/400750\/\d+$/.test(f)) throw bad('Refused: pick the Workshop item folder itself (<steamapps>/workshop/content/400750/<item>), not a folder inside it.');
    return;
  }
  // write zones below: the shared guard decides for a Workshop item and for <GoH>/mods/<name> (owner 2026-11-15: copies ARSENAL made and new
  // folders; an existing mod or a Workshop item only with Advanced on under Tools & Settings)
  const guardNo = () => !!writeguard.refuseWrite(q, { game: gameOf(ctx) || undefined });
  if (/\/steamapps\/workshop(\/|$)/.test(f)) { if (guardNo()) throw bad('Refused: that folder is inside the Steam Workshop folder. Workshop files are replaced by Steam. Copy the mod into your own folder first, or switch on Advanced under Tools & Settings to write straight into it.'); return; }
  const goh = gohDir(ctx);
  const inGoh = (goh && (same(q, goh) || inside(q, goh))) || /call to arms - gates of hell/.test(f);
  if (inGoh && gohRead) {
    const up = gameAbove(q), root = goh && (same(q, goh) || inside(q, goh)) ? goh : (up && stat(path.join(up, 'binaries', 'x64', 'call_to_arms.exe')) ? up : null);
    const parts = root ? fwd(path.relative(root, q)).split('/').filter(Boolean) : [];
    if (root && parts.length >= 2 && lc(parts[0]) === 'mods' && (!isRoot || parts.length === 2)) return;
    throw bad('Refused: that folder is part of the Gates of Hell install (its own data). Only a mod in <Gates of Hell>/mods/<name>, a Gates of Hell Workshop item or your own mod folder can be read here.');
  }
  if (inGoh && gidOf(ctx) === 'goh') { if (guardNo()) throw bad('Refused: ARSENAL writes into the Gates of Hell mods folder only for a copy it made or a new folder; for another mod there switch on Advanced under Tools & Settings. The game files of Gates of Hell are never written.'); return; }
  if (inGoh) throw bad('Refused: that folder belongs to Gates of Hell. Pick your own mod folder.');
  for (const g of [gameOf(ctx), gameAbove(q)].filter(Boolean)) {
    if (same(q, g)) throw bad('Refused: that is the game folder itself. Files are only written into <game>/mods/<your mod>.');
    if (inside(q, g)) {
      const parts = fwd(path.relative(g, q)).split('/').filter(Boolean);
      const ok = parts.length >= 2 && lc(parts[0]) === 'mods' && (!isRoot || parts.length === 2);
      if (!ok) throw bad('Refused: that folder is part of the game install (vanilla data). Files are only written into <game>/mods/<your mod>.');
    }
  }
}
// IDE: the shared write guard (tools/lib/writeguard.js) is asked once more right before every real write (save, copy in, restore),
// so this path refuses the same places every other ARSENAL writer refuses (drive roots, the user folder, the tools folder, Steam, GoH).
function guardWrite(ctx, mod, purpose) {
  const why = writeguard.refuseWrite(mod, { game: gameOf(ctx) || undefined, purpose });
  if (why) throw bad(typeof why === 'string' ? why : 'Refused: this folder cannot be written.', 403);
}
// a phone (gui.js remote view, ctx.session.remote): every file or folder a route reads is asked of ctx.pathOk (its real path must lie
// under a folder the PC page shows). No pathOk on a phone request = refused. The PC (no remote flag) is not asked.
const isRemote = ctx => !!(ctx && ctx.session && ctx.session.remote);
function remoteRead(ctx, f) {
  if (!isRemote(ctx)) return;
  if (typeof ctx.pathOk !== 'function' || !ctx.pathOk(String(f || ''))) throw bad('View only on this device: the PC page does not show that folder.', 403);
}
// opt.read: the folder is only read (game parity: under GoH a mod inside the GoH install or a GoH Workshop item passes, see refuseZone).
// GoH mods keep their texts in localizations/ (GHLOC-01), so under GoH that folder also marks a mod.
function checkMod(ctx, mod, opt) {
  if (typeof mod !== 'string' || !mod || mod.length > 1024 || /\0/.test(mod) || !path.isAbsolute(mod)) throw bad('Pick your mod folder first (Mods page).');
  const p = path.resolve(mod), read = !!(opt && opt.read);
  const st = stat(p);
  if (!st) throw bad('That mod folder does not exist: ' + p, 404);
  if (!st.isDirectory()) throw bad('That is not a folder: ' + p);
  refuseZone(ctx, p, true, read); refuseZone(ctx, realOf(p), true, read); remoteRead(ctx, p);
  const marks = ['mod.info', 'resource', 'localization', 'resource.pak'].concat(gidOf(ctx) === 'goh' ? ['localizations'] : []);
  if (!marks.some(n => stat(path.join(p, n)))) throw bad('Refused: that folder does not look like a mod (no mod.info, resource or localization folder in it).');
  return p;
}
const checkRead = (ctx, mod) => checkMod(ctx, mod, { read: true });
// the READ paths (which, open by key, ide copies/vdir/refs, the viewers' key form) with no mod picked: null = the game as it ships
// (its paks and resource folder, no mods; chainFor keeps only files inside the game folder). Needs a game folder; a mod that is given
// gets every checkMod check (read mode). Writes (save, copy in, restore) keep checkMod, so they still refuse with no mod.
function readMod(ctx, mod) {
  if ((mod == null || mod === '') && isDir(gameOf(ctx) || '')) { remoteRead(ctx, path.resolve(gameOf(ctx))); return null; }   // a phone: the game folder must be one the PC page shows
  return checkRead(ctx, mod);
}
// a key of the layered view: 'resource/...' with no '..' or '.' part (a key never names a path outside the view)
function viewKey(k) {
  if (typeof k !== 'string' || !k || k.length > 512 || /\0/.test(k)) throw bad('key: a game file name like resource/sound/a.wav is needed');
  let n = names.normalize(k).replace(/^\.?\/+/, '');
  if (n.split('/').some(x => x === '..' || x === '.')) throw bad('key: ".." is not allowed');
  if (!n.startsWith('resource/')) n = 'resource/' + n;
  return n;
}
// rel path inside the mod -> absolute file; refuses escapes, links out, packed files. opt.read (viewers, ext/view/ref.js): a pak or
// archive is let through, since it is only read
function target(mod, rel, opt) {
  if (typeof rel !== 'string' || !rel || rel.length > 512 || /[\0:*?"<>|]/.test(rel) || /^[\\/]/.test(rel)) throw bad('file: a path inside your mod is needed');
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some(x => x === '..' || x === '.' || /[. ]$/.test(x))) throw bad('Refused: that path leaves your mod folder.');
  if (!(opt && opt.read) && NO_EDIT_EXT.test(rel)) throw bad('Refused: packed files (.pak, .pat, archives) are not text. They can be viewed, not edited here.');
  const f = path.join(mod, ...parts);
  if (!inside(f, mod)) throw bad('Refused: that path leaves your mod folder.');
  let d = f; while (!stat(d)) d = path.dirname(d);
  const rd = realOf(d), rm = realOf(mod);
  if (!(same(rd, rm) || inside(rd, rm))) throw bad('Refused: that path leads out of your mod folder (a link).');
  const st = stat(f);
  if (st && st.isDirectory()) throw bad('That is a folder, not a file.');
  return { f, rel: parts.join('/') };
}

// ---------------------------------------------------------------- byte-exact text model
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
// lines: {b: bytes without EOL, eol: '\r\n'|'\n'|'', u8: valid UTF-8, t: text (UTF-8, else cp1251 decode)}
function decodeBuf(buf) {
  const bk = enc.bomKind(buf);
  if (bk && bk !== 'utf8') throw bad('This file is ' + bk + ' (UTF-16/32). The game cannot read it; it cannot be edited here.', 415);
  const body = buf.subarray(bk ? 3 : 0), lines = [];
  let s = 0, crlf = 0, lf = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== 0x0A) continue;
    const cr = i > s && body[i - 1] === 0x0D;
    lines.push({ b: body.subarray(s, cr ? i - 1 : i), eol: cr ? '\r\n' : '\n' }); cr ? crlf++ : lf++;
    s = i + 1;
  }
  lines.push({ b: body.subarray(s), eol: '' });
  let cp = 0, loneCr = false;
  for (const l of lines) {
    l.u8 = enc.isUtf8(l.b);
    l.t = l.u8 ? l.b.toString('utf8') : enc.decodeCp1251(l.b);
    if (!l.u8) cp++;
    if (l.b.includes(0x0D)) loneCr = true;
  }
  return { bom: !!bk, lines, crlf, lf, cp, loneCr, text: lines.map(l => l.t).join('\n') };
}
const isBinary = buf => buf.subarray(0, 8192).includes(0);

// line alignment: [{t:'eq', i, j}] and [{t:'rep', i0, i1, j0, j1}]
function align(O, N) {
  const ops = [];
  let p = 0; while (p < O.length && p < N.length && O[p] === N[p]) { ops.push({ t: 'eq', i: p, j: p }); p++; }
  let s = 0; while (s < O.length - p && s < N.length - p && O[O.length - 1 - s] === N[N.length - 1 - s]) s++;
  const a = O.slice(p, O.length - s), b = N.slice(p, N.length - s);
  const mid = [];
  if (a.length && b.length && a.length * b.length <= 4e6) {
    const W = b.length + 1, L = new Uint32Array((a.length + 1) * W);
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
      L[i * W + j] = a[i] === b[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { mid.push({ t: 'eq', i, j }); i++; j++; }
      else if (j >= b.length || (i < a.length && L[(i + 1) * W + j] >= L[i * W + j + 1])) mid.push({ t: 'del', i: i++ });
      else mid.push({ t: 'ins', j: j++ });
    }
  } else { for (let i = 0; i < a.length; i++) mid.push({ t: 'del', i }); for (let j = 0; j < b.length; j++) mid.push({ t: 'ins', j }); }
  let cur = null;
  const flush = () => { if (cur) { ops.push(cur); cur = null; } };
  let ci = 0, cj = 0;
  for (const m of mid) {
    if (m.t === 'eq') { flush(); ops.push({ t: 'eq', i: p + m.i, j: p + m.j }); ci = m.i + 1; cj = m.j + 1; continue; }
    if (!cur) cur = { t: 'rep', i0: p + ci, i1: p + ci, j0: p + cj, j1: p + cj };
    if (m.t === 'del') { cur.i1++; ci = m.i + 1; } else { cur.j1++; cj = m.j + 1; }
  }
  flush();
  for (let k = 0; k < s; k++) ops.push({ t: 'eq', i: O.length - s + k, j: N.length - s + k });
  return ops;
}
// changed line: keep the old bytes of the unchanged start and end; only the middle is new (UTF-8)
function editLine(old, text) {
  const o = Array.from(old.t), n = Array.from(text);
  let p = 0; while (p < o.length && p < n.length && o[p] === n[p]) p++;
  let s = 0; while (s < o.length - p && s < n.length - p && o[o.length - 1 - s] === n[n.length - 1 - s]) s++;
  const bl = old.u8 ? o.map(c => Buffer.byteLength(c, 'utf8')) : o.map(() => 1);
  let pb = 0, sb = 0;
  for (let i = 0; i < p; i++) pb += bl[i];
  for (let i = 0; i < s; i++) sb += bl[o.length - 1 - i];
  const mid = n.slice(p, n.length - s).join('');
  return { bytes: Buffer.concat([old.b.subarray(0, pb), Buffer.from(mid, 'utf8'), old.b.subarray(old.b.length - sb)]), mid };
}
// orig bytes + edited text -> {buf, hunks, warns, changed}
function rebuild(orig, newText) {
  const d = decodeBuf(orig);
  const N = String(newText).replace(/\r\n?/g, '\n').split('\n');
  const O = d.lines.map(l => l.t), ops = align(O, N);
  const defEol = d.crlf > 0 || d.lf === 0 ? '\r\n' : '\n';
  const out = d.bom ? [BOM] : [], hunks = [], warns = [];
  const eolFor = (j, old) => (j === N.length - 1 ? '' : (old && old.eol) || defEol);
  for (const op of ops) {
    if (op.t === 'eq') { const l = d.lines[op.i]; out.push(l.b, Buffer.from(eolFor(op.j, l), 'latin1')); continue; }
    const nd = op.i1 - op.i0, ni = op.j1 - op.j0;
    for (let k = 0; k < Math.max(nd, ni); k++) {
      if (k >= ni) continue;                                   // deleted old line
      const j = op.j0 + k, old = k < nd ? d.lines[op.i0 + k] : null;
      let bytes;
      if (old) {
        const e = editLine(old, N[j]); bytes = e.bytes;
        if (!old.u8 && /[^\x00-\x7f]/.test(e.mid)) warns.push({ code: 'mixed', line: j + 1 });
      } else bytes = Buffer.from(N[j], 'utf8');
      out.push(bytes, Buffer.from(eolFor(j, old), 'latin1'));
    }
    if (hunks.length < 300) hunks.push({ oldLine: op.i0 + 1, newLine: op.j0 + 1, del: O.slice(op.i0, op.i1).map(cut), add: N.slice(op.j0, op.j1).map(cut) });
  }
  const buf = Buffer.concat(out);
  return { buf, hunks, warns, changed: !buf.equals(orig), eol: defEol === '\r\n' ? 'crlf' : 'lf' };
}
const cut = s => (s.length > 400 ? s.slice(0, 400) + '...' : s);
// text diff for previews (restore, copy over an existing file)
function textHunks(a, b) {
  const O = a.split('\n'), N = b.split('\n'), h = [];
  for (const op of align(O, N)) if (op.t === 'rep' && h.length < 300) h.push({ oldLine: op.i0 + 1, newLine: op.j0 + 1, del: O.slice(op.i0, op.i1).map(cut), add: N.slice(op.j0, op.j1).map(cut) });
  return h;
}
function describe(buf) {
  const d = decodeBuf(buf);
  return { text: d.text, eol: d.crlf && d.lf ? 'mixed' : d.crlf ? 'crlf' : d.lf ? 'lf' : 'none', bom: d.bom, cpLines: d.cp, loneCr: d.loneCr, lines: d.lines.length, size: buf.length, hash: sha1(buf) };
}

// ---------------------------------------------------------------- restore points (E-22)
const undoRoot = mod => path.join(path.dirname(mod), path.basename(mod) + UNDO_SUFFIX);
// where restore points are read from: beside the mod (this page's own points) and <mod>/.arsenal/undo (lib/modwrite keeps them there
// for a mod in a game's mods folder, so no new folder appears beside it). This page still writes its own points beside the mod.
const undoRoots = mod => [undoRoot(mod), path.join(mod, ...require('../../../lib/modwrite').IN_MOD)];
const undoDirOf = (mod, id) => { for (const r of undoRoots(mod)) if (stat(path.join(r, id, MANIFEST))) return path.join(r, id); return path.join(undoRoot(mod), id); };
function stamp() {
  const d = new Date(), z = (n, w = 2) => String(n).padStart(w, '0');
  return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '-' + z(d.getMilliseconds(), 3);
}
function snapshot(mod, t, action) {
  const root = undoRoot(mod);
  let id = stamp(), n = 1;
  while (stat(path.join(root, id))) id = stamp() + '-' + (++n);
  const dir = path.join(root, id), st = stat(t.f);
  fs.mkdirSync(dir, { recursive: true });
  const m = { id, time: new Date().toISOString(), rel: t.rel, action, existed: !!st, size: st ? st.size : 0, hash: null };
  if (st) { const b = fs.readFileSync(t.f); m.hash = sha1(b); const to = path.join(dir, 'files', ...t.rel.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, b); }
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m, null, 1));
  return m;
}
function writeAtomic(f, buf) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.arsenal-tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, f);
}
// ---------------------------------------------------------------- entries inside the mod's own paks (rel = <pak rel>::<entry>)
// Reading goes through lib/pak. Saving writes the whole pak again with the one entry replaced (every other entry is read and
// stored the way it was: stored or deflated), into a temp file next to it, then renames it over the pak. The restore point holds
// the entry's old bytes only, not the pak. Only paks inside the picked mod folder; a game pak is never written.
function pakTarget(mod, rel) {
  const s = String(rel), i = s.indexOf('::'), pr = fwd(s.slice(0, i)).replace(/^\/+/, ''), entry = s.slice(i + 2);
  const pf = path.join(mod, ...pr.split('/'));
  if (!entry || !inside(pf, mod) || !/\.(pak|pat)$/i.test(pr)) throw bad('file: not a pak in your mod');
  const st = stat(pf); if (!st || !st.isFile()) throw bad('No such pak in your mod: ' + pr, 404);
  let ents; try { ents = pak.list(pf); } catch { throw bad('That pak cannot be read: it is damaged or not a pak.', 415); }
  const ent = ents.find(e => e.name === entry);
  if (!ent || entry.endsWith('/')) throw bad('No such entry in that pak.', 404);
  return { pf, pr, entry, ent, ents, size: st.size, rel: pr + '::' + entry };
}
function pakWrite(p, buf) {
  const tmp = p.pf + '.arsenal-tmp';   // any size: the other entries are copied as the packed bytes they are (lib/pakpatch)
  try {
    require('../../../lib/pakpatch').patch(p.pf, tmp, p.ents, p.ent, buf);
    fs.renameSync(tmp, p.pf);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* no temp file left */ }
    throw e.status ? e : bad('The pak could not be written again: ' + e.message + ' Nothing was changed.', 500);
  }
}
function pakSnapshot(mod, p, old, action) {
  const root = undoRoot(mod);
  let id = stamp(), n = 1;
  while (stat(path.join(root, id))) id = stamp() + '-' + (++n);
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const m = { id, time: new Date().toISOString(), rel: p.rel, action, existed: true, size: old.length, hash: sha1(old), pakEntry: true };
  fs.writeFileSync(path.join(dir, 'files', 'entry.bin'), old);
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(m, null, 1));
  return m;
}
function savePak(ctx, body, mod) {
  const p = pakTarget(mod, body.rel);
  if (p.ent.size > MAX_EDIT) throw bad('File over 2 MB.', 413);
  const orig = pak.read({ file: p.pf }, p.ent);
  if (isBinary(orig)) throw bad('This is a binary file.', 415);
  if (body.base && body.base !== sha1(orig)) throw bad('The file changed on disk since you opened it. Open it again, then redo your change.', 409);
  if (decodeBuf(orig).loneCr) throw bad('This file has stray CR characters; the editor would change them. Edit it in a text editor.', 415);
  const r = rebuild(orig, body.text);
  const res = { mod, rel: p.rel, file: p.pf, pak: p.pr, entry: p.entry, changed: r.changed, hunks: r.hunks, warns: r.warns, eol: r.eol, oldSize: orig.length, newSize: r.buf.length, undo: undoRoot(mod) };
  if (!body.write || !r.changed) return Object.assign(res, { written: false });
  guardWrite(ctx, mod, 'save the file inside the pak');
  const snap = pakSnapshot(mod, p, orig, 'save');
  pakWrite(p, r.buf);
  return Object.assign(res, { written: true, restorePoint: snap.id, hash: sha1(r.buf) });
}
function restorePak(ctx, body, mod, m, dir) {
  const p = pakTarget(mod, m.rel), cur = pak.read({ file: p.pf }, p.ent), old = fs.readFileSync(path.join(dir, 'files', 'entry.bin'));
  const res = { mod, id: m.id, rel: p.rel, file: p.pf, existed: true, nowExists: true, removes: false,
    hunks: !isBinary(old) && !isBinary(cur) ? textHunks(describeSafe(cur), describeSafe(old)) : [], same: old.equals(cur) };
  if (!body.write) return res;
  if (res.same) return Object.assign(res, { written: false });
  guardWrite(ctx, mod, 'restore a file inside the pak');
  const snap = pakSnapshot(mod, p, cur, 'before-restore');
  pakWrite(p, old);
  return Object.assign(res, { written: true, restorePoint: snap.id });
}
function undoList(ctx, mod) {
  mod = checkRead(ctx, mod);
  const root = undoRoot(mod), out = [], at = new Map();
  for (const r of undoRoots(mod)) { let xs = []; try { xs = fs.readdirSync(r); } catch { /* none yet */ } for (const id of xs) if (!at.has(id)) at.set(id, r); }
  for (const id of [...at.keys()].sort().reverse()) {
    if (!/^[0-9-]+$/.test(id)) continue;
    let m; try { m = JSON.parse(fs.readFileSync(path.join(at.get(id), id, MANIFEST), 'utf8')); } catch { continue; }
    let cur = null;
    if (String(m.rel).includes('::')) { try { cur = pakTarget(mod, m.rel); } catch { cur = null; } }
    else cur = stat(path.join(mod, ...String(m.rel).split('/')));
    out.push({ id, time: m.time, rel: m.rel, action: m.action, existed: m.existed, size: m.size, nowExists: !!cur });
    if (out.length >= 300) break;
  }
  return { mod, root, list: out };
}
function restore(ctx, body) {
  const mod = checkMod(ctx, body.mod), id = String(body.id || '');
  if (!/^[0-9-]{8,40}$/.test(id)) throw bad('id: pick a restore point from the list');
  const dir = undoDirOf(mod, id);
  let m; try { m = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')); } catch { throw bad('That restore point is missing or damaged.', 404); }
  if (String(m.rel).includes('::')) return restorePak(ctx, body, mod, m, dir);
  const t = target(mod, m.rel), cur = stat(t.f) ? fs.readFileSync(t.f) : null;
  const old = m.existed ? fs.readFileSync(path.join(dir, 'files', ...t.rel.split('/'))) : null;
  const res = { mod, id, rel: t.rel, file: t.f, existed: m.existed, nowExists: !!cur, removes: !m.existed && !!cur,
    hunks: old && cur && !isBinary(old) && !isBinary(cur) ? textHunks(describeSafe(cur), describeSafe(old)) : [], same: !!(old && cur && old.equals(cur)) };
  if (!body.write) return res;
  if (res.same || (!old && !cur)) return Object.assign(res, { written: false });
  guardWrite(ctx, mod, 'restore a file');
  const snap = snapshot(mod, t, 'before-restore');
  if (old) writeAtomic(t.f, old); else fs.unlinkSync(t.f);
  return Object.assign(res, { written: true, restorePoint: snap.id });
}
const describeSafe = b => { try { return decodeBuf(b).text; } catch { return ''; } };

// ---------------------------------------------------------------- VFS winner (E-2)
// GT-04 (item 3): the game version the profile is compared with. readModList defaults to 3.262.1, and a profile saved by a newer
// game (settings.set lastGameVersion) was then read as if the game had emptied its mod list. The version comes from the same
// place the Share page reads it (tools/lib/gamever read: exe ProductVersion, else a version file), PE a.b.c.d written as the data
// version a.bcd the way vfs.js and modinfo.js turn the GoH exe version into 1.067. GoH: none (the profile read here is the AS2 one).
// Game parity: gid 'as64' (the default) reads as before (the first AS2 exe that answers; a GoH folder: none). 'mowas2' reads
// mowas_2.exe and 'goh' binaries/x64/call_to_arms.exe (gamever.read with the game named); GoH 1.0.6.7 -> 1.067 (PORT-46, GHNET-22).
const _gv = new Map();
const GV_FILE = { as64: null, mowas2: 'mowas_2.exe', goh: path.join('binaries', 'x64', 'call_to_arms.exe') };
function gameVersionOf(g, gid) {
  gid = GV_FILE[gid] !== undefined ? gid : 'as64';
  if (!g || (gid !== 'goh' && stat(path.join(g, 'binaries', 'x64', 'call_to_arms.exe')))) return undefined;
  const exe = gid === 'as64' ? ['as64.exe', 'mowas_2.exe'].map(e => path.join(g, e)).find(e => stat(e)) : path.join(g, GV_FILE[gid]), s = exe && stat(exe);
  const key = norm(g) + '|' + gid + '|' + (s ? s.size + '|' + s.mtimeMs : '');
  if (_gv.has(key)) return _gv.get(key);
  let v = null; try { v = gid === 'as64' ? gamever.read(g) : gamever.read(g, gid); } catch { v = null; }
  const m = v && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(v);
  if (m) { v = m[1] + '.' + m[2] + m[3] + m[4]; _gv.set(key, v); if (_gv.size > 8) _gv.delete(_gv.keys().next().value); }   // only exe answers are kept
  return /^\d+\.\d+/.test(v || '') ? v : undefined;
}
// the profile's options.set: AS2 (as64 and mowas2 share it) from userdir.profiles; GoH from <GoH user dir>/profiles/<id>/options.set
// (userdir.gohUserDir, GHVFS-13). With AS2_HOME (tests) the GoH user dir is looked for under that home too, never the real one.
function gohProfiles() {
  const h = process.env.AS2_HOME, opt = h ? { home: h, env: { LOCALAPPDATA: path.join(h, 'AppData', 'Local') } } : {};
  let d = null; try { d = userdir.gohUserDir(opt); } catch { d = null; }
  const p = d && path.join(d, 'profiles');
  let ids = []; try { ids = fs.readdirSync(p).sort(); } catch { return []; }
  return ids.map(id => path.join(p, id, 'options.set')).filter(f => stat(f) && stat(f).isFile());
}
function profileMods(g, gid) {
  try {
    const p = gid === 'goh' ? gohProfiles()[0] : userdir.profiles(0, homeOpt())[0];
    return p ? { file: p, mods: vfsLib.readModList(p, gameVersionOf(g, gid)).mods || [] } : { file: null, mods: [] };
  } catch { return { file: null, mods: [] }; }
}
// GoH text language (GHLOC-01, GHLOC-04): the profile option {game {language <code>}} when set; else only the default layer is shown
// (the Steam language and the config file, which come earlier in GHLOC-04, are not read here) [I].
function gohLang(file) {
  let t = ''; try { t = fs.readFileSync(file, 'latin1'); } catch { return null; }
  const i = t.search(/\{\s*game\b/); if (i < 0) return null;
  let d = 0, e = i; for (; e < t.length; e++) { if (t[e] === '{') d++; else if (t[e] === '}' && --d === 0) break; }   // the {game ...} block only
  const m = /\{\s*language\s+"?([A-Za-z_-]{1,20})"?\s*\}/.exec(t.slice(i, e + 1));
  return m ? m[1].toLowerCase() : null;
}
// MinGameVersion 3.301 or higher = a mod for the as64 (Enhanced) mode (vfs.js IsModern rule)
function modernMod(mod) {
  let t = ''; try { t = fs.readFileSync(path.join(mod, 'mod.info'), 'latin1'); } catch { return false; }
  const m = /\{\s*MinGameVersion\s+"?([0-9.]+)/i.exec(t);
  if (!m) return false;
  const v = m[1].split('.').filter(Boolean).map(Number);
  return (v[0] || 0) > 3 || ((v[0] || 0) === 3 && (v[1] || 0) >= 301);
}
// MoW:AS2 (mowas_2.exe, the legacy rule of vfs.js and modinfo: VFS-48, PORT-48): a mod loads only when mod.info names both
// MinGameVersion and MaxGameVersion and the game version lies between them; a missing bound = unsupported. The view is built with
// disableVersionControl (as for AS64), so the picked mod is checked here and left out with the note 'dropped-version'.
const verParse = s => String(s || '').replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
const verCmp = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
function legacyRangeBad(mod, gameVersion) {
  let t = ''; try { t = fs.readFileSync(path.join(mod, 'mod.info'), 'latin1'); } catch { return false; }   // no mod.info: vfs says why
  const last = k => { const a = [...t.matchAll(new RegExp('\\{\\s*' + k + '\\s+"?([^"}\\s]*)', 'ig'))]; return a.length ? a[a.length - 1][1] : ''; };
  const mn = verParse(last('MinGameVersion')), mx = verParse(last('MaxGameVersion')), gv = verParse(gameVersion);
  return !mn.length || !mx.length || verCmp(gv, mn) < 0 || verCmp(gv, mx) > 0;
}
// GoH: the list entries that name this Workshop item (vfs id = the normalized mod.info title, else the item number, GHVFS-24; a
// <GoH>/mods folder of that name wins over the item, vfs discover, so then the entry is that folder's and stays)
function itemIds(g, dir) {
  if (!GOH_ITEM.test(lc(fwd(path.resolve(dir))) + '/')) return [];
  let t = ''; try { t = fs.readFileSync(path.join(dir, 'mod.info'), 'latin1'); } catch { /* no title */ }
  const m = /\{\s*name\s+"([^"]*)"/i.exec(t), id = m && m[1] ? names.normalize(m[1]) : names.normalize(path.basename(dir));
  // GoH {mods} lists hold mod_<item number> (GHVFS-24 [V], vfs gives an item that id); the title forms kept as well
  return [id, names.normalize(path.basename(dir)), 'mod_' + names.normalize(path.basename(dir))].filter((x, i, a) => a.indexOf(x) === i && !stat(path.join(g, 'mods', x, 'mod.info')));
}
// why the layered view left the mod out -> note 'dropped-<reason>' (vfs.dropReason: enhanced-in-classic, classic-in-enhanced, version,
// not-installed, requires, patches), each translated with what the user can do; plain 'dropped' when no reason is known.
// The 'dropped' prefix is kept: the editor (ext/ide/ui/core.js) tests /^dropped/.
function dropNote(v, myId) {
  const r = vfsLib.dropReason(v, myId);
  return r && r.reason ? 'dropped-' + r.reason : 'dropped';
}
const OUT_LAYER = 'this mod';
// opt.fresh: build the view again even when a cached one is there (chainFor: the folder layer's files changed on disk)
// The view comes from lib/gameview (withModsSync): shared with the other pages, kept while the game stamp and every mounted mod
// folder's lib/modtree signature stand, built from the modtree listings (no walk of the mod). That needs a scan of each mod
// folder in this process: a route that can wait calls `await vfsForAsync(ctx, mod)` (the Editor tree and the Mod Files tree
// do) or `await vfsReady(ctx, mod)` first; without one the old blocking walk builds the view, kept 60 s or 20 build times, and a scan is started in the background.
// opt.plan: only the lib/gameview options of that view (no build).
function vfsFor(ctx, mod, opt) {
  const g = gameOf(ctx), gid = gidOf(ctx);
  if (!g || !isDir(g)) return { v: null, notes: ['no-game'] };
  const rel = mod && inside(mod, g) ? fwd(path.relative(g, mod)).split('/') : null;
  const inMods = !!(rel && rel.length === 2 && lc(rel[0]) === 'mods');
  const myId = inMods ? names.normalize(rel[1]) : null;
  const prof = profileMods(g, gid), notes = [];
  const lang = gid === 'goh' && prof.file ? gohLang(prof.file) : null;
  if (gid === 'goh' && mod && gohLocked(ctx, mod)) notes.push('goh-ro');
  // no mod (readMod null): the game as it ships, no mods switched on in the profile
  let list = mod ? prof.mods.slice() : [];
  if (!mod) notes.push('no-mod');
  else if (!prof.file) notes.push('no-profile');
  // GT-04: a mod that is not switched on is shown "as if switched on last". The list text is the folder name in lower case (vfs
  // MOD_UNKNOWN otherwise), and a mod made for as64 mode is shown with as64 mode on (the game turns it on with as64+ in the list):
  // without that, the what-if list itself made the game view skip the mod while the Mods page said it is in the game.
  if (myId && !list.some(s => names.normalize(String(s).split(':')[0]) === myId)) {
    list.push(myId); notes.push('not-enabled');
    // as64+ (the Enhanced mode) exists only for the as64 game; MoW:AS2 and GoH have no modes
    const as64 = gid === 'as64' && !!stat(path.join(g, 'as64.exe'));
    if (as64 && modernMod(mod) && !list.some(s => names.normalize(String(s).split(':')[0]) === 'as64+')) { list.unshift('as64+'); notes.push('as-enhanced'); }
  }
  // MoW:AS2: a mod whose mod.info range does not take this game version is left out of the view (the game skips it)
  let verDrop = false;
  if (myId && gid === 'mowas2' && legacyRangeBad(mod, gameVersionOf(g, gid) || '3.262.1')) {
    verDrop = true; list = list.filter(s => names.normalize(String(s).split(':')[0]) !== myId);
    const ne = notes.indexOf('not-enabled'); if (ne >= 0) notes.splice(ne, 1);
    notes.push('dropped-version');
  }
  if (mod && !inMods) notes.push('outside');
  // GoH: a mod outside <GoH>/mods (a Workshop item, GHVFS-24, or the user's own folder) is mounted on top as a folder layer
  // (vfs opts.modDirs), so its paks (resource.pak, resource/**.pak, localizations/<lang>.pak) are in the view too, not only
  // its loose files. as64 and mowas2: as before (loose files only, chainFor). A Workshop item switched on in the GoH profile is
  // taken out of the list first, so the folder layer always mounts on top as 'this mod' (vfs skips a folder a listed mod mounts).
  const outDir = gid === 'goh' && mod && !inMods ? mod : null;
  if (outDir) {
    const ids = itemIds(g, outDir), n0 = list.length;
    list = list.filter(s => !ids.includes(names.normalize(String(s).split(':')[0])));
    if (list.length < n0) notes.push('shown-on-top');
  }
  // the three games never share a view: the game id (and the GoH text language) is part of lib/gameview's key.
  // as64: no exe named (vfs picks as64 when as64.exe is there); mowas2 and goh name their exe (gameview does both from gid)
  const vo = { gameDir: g, gid, list, disableVersionControl: true, mods: outDir ? [{ dir: outDir, id: OUT_LAYER }] : [] };
  if (lang) vo.lang = lang;
  if (opt && opt.plan) return vo;
  const c = { v: null };
  try { c.v = gameview.withModsSync(vo, { fresh: !!(opt && opt.fresh), revalidate: !!(ctx && ctx.modtree) }); } catch (e) { return { v: null, notes: notes.concat(['vfs-failed']), error: e.message }; }
  if (myId && !verDrop && !c.v.mods.includes(myId)) notes.push(dropNote(c.v, myId));
  // the folder layer's id (none when vfs skipped the folder because the mod list already mounts it)
  const dl = outDir ? (c.v.modDirs || []).find(d => same(d.dir, outDir)) : null;
  return { v: c.v, myId, dirId: dl ? dl.id : null, inMods, notes, game: g, profile: prof.file, gid, exe: c.v.exe || exeOf(ctx), lang: lang || null };
}
// for a route that can wait: scans the mod folders of vfsFor's view (lib/modtree, shared, not blocking) and builds the view from
// the listings, so the vfsFor calls that follow find it ready. Never throws: vfsFor says what is wrong.
async function vfsReady(ctx, mod) {
  try { const vo = vfsFor(ctx, mod, { plan: true }); if (vo && vo.gameDir) await gameview.withMods(vo); } catch (e) { /* vfsFor reports it */ }
}
// SPEED: for a route of a server (ctx.modtree) that can wait and calls vfsFor (chainFor, which, modsFor, a viewer, a lookup) right
// after. mod = the folder as the request names it. Waits, without blocking, for the scan of each mod folder of vfsFor's view that has
// no scan of this process (none yet, or touched) and builds the view from the listings, so the sync call that follows finds it by
// signature: same view, no 13-16 s walk. A folder with a scan is never scanned again here (maxAgeMs Infinity). Done at most every
// WARM_MS per game + mod: in between vfsFor serves what it keeps and asks for a newer scan in the background, as before. Never
// throws (a refused mod is not scanned, a scan that fails leaves vfsFor's old way); no mod or no ctx.modtree (a tool, a test with
// no server around it): nothing.
const WARM_MS = 45000, _warm = new Map();
async function vfsWarm(ctx, mod) {
  try {
    if (!ctx || !ctx.modtree || mod == null || mod === '') return;
    const g = gameOf(ctx);
    if (!g) return;
    const k = gidOf(ctx) + '|' + norm(g) + '|' + String(mod);
    if (Date.now() - (_warm.get(k) || 0) < WARM_MS) return;
    const vo = vfsFor(ctx, readMod(ctx, mod), { plan: true });
    if (!vo || !vo.gameDir) return;
    await gameview.withMods(Object.assign({}, vo, { maxAgeMs: Infinity }));
    if (_warm.size > 32) _warm.clear();
    _warm.set(k, Date.now());
  } catch (e) { /* vfsFor reports it */ }
}
// vfsFor for a caller that can wait: the same answer, never the blocking walk (exports.vfsFor is called, so a test's stub counts)
async function vfsForAsync(ctx, mod) { await vfsReady(ctx, mod); return module.exports.vfsFor(ctx, mod); }
// mod-relative path -> virtual key (null = the engine never reads it). langs (GoH only, keyLangs): the language folders the game
// mounts, 'default' then the chosen one; localizations/<lang>/x is read as resource/x (GHLOC-01, vfs mountGohLoc). Without langs: as before.
function keyOf(rel, langs) {
  const r = names.normalize(rel);
  if (r.startsWith('resource/')) return r;
  if (r.startsWith('localization/')) return 'resource/interface/text/' + r.slice('localization/'.length);
  if (langs && r.startsWith('localizations/')) {
    const p = r.split('/');
    if (p.length >= 3 && langs.includes(p[1])) return 'resource/' + p.slice(2).join('/');
  }
  return null;
}
// GoH: the language folders of the view (null for as64 and mowas2, so keyOf works as before)
function keyLangs(ctx, cv) {
  if (gidOf(ctx) !== 'goh') return null;
  const l = cv && cv.lang;
  return ['default'].concat(l && l !== 'default' ? [l] : []);
}
// GT-03: mod.info in the mod root is read by the game (name, game versions, needed mods, Delete lines), but it is not part of the
// layered resource view, so it has no key and no "which file wins" chain
const isModInfo = rel => names.normalize(String(rel || '')).replace(/^\.?\/+/, '') === 'mod.info';
function kindOf(rec, ctxV) {
  if (rec.mine) return 'mine';
  if (rec.deleted) return 'deleted';
  const m = String(rec.layer).replace(/ patch \d+$/, '');
  if (ctxV.myId && m === ctxV.myId) return 'mine';
  if (ctxV.dirId && m === ctxV.dirId) return 'mine';
  return ctxV.v && ctxV.v.mods.includes(m) ? 'othermod' : 'vanilla';
}
// the loose files of the mod that could hold key, the strongest first (resource/ copy, localization/, GoH language folders)
function looseCands(ctx, cv, key) {
  let r = key.startsWith('resource/interface/text/') ? ['localization/' + key.slice(24), key] : [key];
  const kl = keyLangs(ctx, cv);   // GoH: the chosen language's file wins over the default one, both over a resource/ copy [I]
  if (kl) r = kl.slice().reverse().map(l => 'localizations/' + l + '/' + key.slice(9)).concat(r);
  return r;
}
function chainFor(ctx, mod, key) {
  let cv = vfsFor(ctx, mod);
  if (!cv.v) return { cv, chain: [] };
  // no mod: only layers whose file lies inside the game folder (the game as it ships)
  if (!mod) return { cv, chain: cv.v.chain(key).filter(r => r.deleted || inside(recFile(r), cv.game)) };
  if (cv.dirId) {
    // GoH folder layer: vfs mounted the folder in the engine's own order (resource/ in name order, its paks where they sort, then
    // N.pat, then localizations), so the chain is kept as built: a loose file and a pak of the same key stand where the engine has
    // them. The view is cached 60 s; when the folder's loose files for this key differ from the cached ones (a save or copy-in
    // made or removed one), the view is built again so the change shows at once.
    // (a name vfs never indexes, VFS-06, is not looked for; a key that still differs after one new build is not built again)
    const want = looseCands(ctx, cv, key).filter(x => !vfsLib.SKIP_EXT.has(names.ext(names.normalize(x)))).map(x => path.join(mod, ...x.split('/'))).filter(f => stat(f) && stat(f).isFile()).map(norm).sort().join('|');
    const have = c => c.v.chain(key).filter(r => r.layer === c.dirId && r.source === 'loose').map(r => norm(recFile(r))).sort().join('|');
    if (want !== have(cv) && !(cv.v._kept && cv.v._kept.has(key))) {
      const nv = vfsFor(ctx, mod, { fresh: true });
      if (nv.v && nv.dirId) { cv = nv; if (want !== have(cv)) (cv.v._kept || (cv.v._kept = new Set())).add(key); }
    }
    return { cv, chain: cv.v.chain(key).slice() };
  }
  const ch = cv.v.chain(key).slice();
  if (!cv.inMods) {      // mod outside the game: shown as if it were loaded last (its loose files, from disk)
    for (const x of looseCands(ctx, cv, key)) { const f = path.join(mod, ...x.split('/')); if (stat(f) && stat(f).isFile()) { ch.push({ mine: true, layer: 'this mod', source: 'loose', container: fwd(mod), entry: x }); break; } }
  }
  return { cv, chain: ch };
}
function which(ctx, q) {
  const mod = readMod(ctx, q.mod);
  let key = q.key ? viewKey(q.key) : keyOf(q.rel || '', gidOf(ctx) === 'goh' ? keyLangs(ctx, vfsFor(ctx, mod)) : null);
  if (!key) return { mod, key: null, mounted: false, chain: [], notes: [!q.key && isModInfo(q.rel) ? 'modinfo' : 'not-mounted'] };
  if (key.split('/').some(x => x === '..' || x === '.')) throw bad('key: ".." is not allowed');
  if (!key.startsWith('resource/')) key = 'resource/' + key;
  const { cv, chain } = chainFor(ctx, mod, key);
  const win = chain.length ? chain[chain.length - 1] : null;
  const rows = chain.map((r, i) => ({ idx: i, kind: kindOf(r, cv), layer: r.layer, source: r.deleted ? 'deleted' : r.source, container: r.container || '', entry: r.entry || '', how: r.how || '', winner: i === chain.length - 1 && !r.deleted, size: r.size || 0 }));
  return { mod, key, mounted: true, chain: rows.reverse(), winner: win && !win.deleted ? kindOf(win, cv) : null, notes: cv.notes, game: cv.game || null, error: cv.error };
}
// the file on disk a layer is read from: a loose file (container folder + entry), else the pak or patch itself
const recFile = rec => (rec.source === 'loose' ? path.join(String(rec.container || ''), ...String(rec.entry || '').split('/')) : String(rec.container || ''));
function readChainRec(ctx, mod, key, idx) {
  const { chain } = chainFor(ctx, mod, key);
  const rec = chain[Number(idx)];
  if (!rec || rec.deleted) throw bad('That layer has no file.', 404);
  remoteRead(ctx, recFile(rec));
  if (rec.mine && rec.source === 'loose') return fs.readFileSync(path.join(rec.container, ...rec.entry.split('/')));
  if ((rec.size || 0) > MAX_COPY) throw bad('File over 8 MB.', 413);
  return vfsLib.readRec(rec);
}

// ---------------------------------------------------------------- tree (E-2)
// CACHE (gui README, contract 1): the file list comes from the shared walk of the mod (lib/modtree) and the rows from the store
// entry the Editor's tree keeps (./modfiles 'ide.tree', stamps game + mod:all); no walk and no stat here. Async since then.
// The rows are made here (not stored) only where they differ from the Editor's: GoH language folder keys, a pak over MAX_PAK_LIST.
async function tree(ctx, q) {
  const mod = checkRead(ctx, q.mod);
  const r = await require('./modfiles').filesTree(ctx, mod, { view: () => vfsForAsync(ctx, mod), kl: cv => keyLangs(ctx, cv), maxTree: MAX_TREE, maxPak: MAX_PAK_LIST, maxAgeMs: 5000 });
  return { mod, files: r.files, truncated: r.truncated, notes: r.notes, game: r.game, undo: undoRoot(mod) };
}

// ---------------------------------------------------------------- open / save / copy (E-1)
function openFile(ctx, q) {
  if (q.key) {           // a layer of the game index, read only
    const mod = readMod(ctx, q.mod), key = viewKey(q.key);
    const buf = readChainRec(ctx, mod, key, q.idx);
    if (isBinary(buf)) throw bad('This is a binary file. Open it in its own tool.', 415);
    return Object.assign(describe(buf), { editable: false, why: 'layer', key, idx: Number(q.idx), suggestRel: key });
  }
  if (q.rel && String(q.rel).includes('::')) {   // an entry inside one of my mod's paks: saving writes the pak again (savePak)
    const mod = checkRead(ctx, q.mod), p = pakTarget(mod, q.rel);
    remoteRead(ctx, p.pf);
    if (p.ent.size > MAX_EDIT) throw bad('File over 2 MB.', 413);
    const buf = pak.read({ file: p.pf }, p.ent);
    if (isBinary(buf)) throw bad('This is a binary file. Open it in its own tool.', 415);
    const d = describe(buf);
    if (gohLocked(ctx, mod)) return Object.assign(d, { editable: false, why: 'goh', rel: q.rel, inPak: p.pr });
    return Object.assign(d, { editable: !d.loneCr, why: d.loneCr ? 'lonecr' : null, rel: q.rel, inPak: p.pr });
  }
  if (q.path && !q.rel) {  // any file (search hit outside the mod): read only, unless it is inside the mod
    const f = path.resolve(String(q.path));
    if (!path.isAbsolute(String(q.path))) throw bad('path: a full file path is needed');
    // a problem list names a packed file by the path it would have loose (mods/x/resource/set/a.set held by resource/gamelogic.pak)
    const loc = stat(f) ? null : require('../../../lib/locate').find(f);
    if (q.mod) {
      const mod = checkRead(ctx, q.mod);
      if (loc && loc.pak && inside(loc.pak, mod)) return openFile(ctx, { mod, rel: fwd(path.relative(mod, loc.pak)) + '::' + loc.entry });
      if (inside(f, mod)) return openFile(ctx, { mod, rel: fwd(path.relative(mod, f)) });
    }
    remoteRead(ctx, loc && loc.pak ? loc.pak : f);
    if (loc && loc.pak) {
      if (loc.ent.size > MAX_EDIT) throw bad('File over 2 MB.', 413);
      const pb = require('../../../lib/pak').read({ file: loc.pak }, loc.ent); if (isBinary(pb)) throw bad('This is a binary file. Open it in its own tool.', 415);
      return Object.assign(describe(pb), { editable: false, why: 'outside', path: f });
    }
    const st = stat(f); if (!st || !st.isFile()) throw bad('No such file.', 404);
    if (st.size > MAX_EDIT) throw bad('File over 2 MB.', 413);
    const buf = fs.readFileSync(f); if (isBinary(buf)) throw bad('This is a binary file. Open it in its own tool.', 415);
    return Object.assign(describe(buf), { editable: false, why: 'outside', path: f });
  }
  const mod = checkRead(ctx, q.mod), t = target(mod, q.rel), st = stat(t.f);
  if (!st) throw bad('No such file in your mod: ' + t.rel, 404);
  remoteRead(ctx, t.f);
  if (st.size > MAX_EDIT) throw bad('File over 2 MB: too big for the editor.', 413);
  const buf = fs.readFileSync(t.f);
  if (isBinary(buf)) throw bad('This is a binary file. Open it in its own tool.', 415);
  const d = describe(buf), key = keyOf(t.rel, gidOf(ctx) === 'goh' ? keyLangs(ctx, vfsFor(ctx, mod)) : null);
  if (gohLocked(ctx, mod)) return Object.assign(d, { editable: false, why: 'goh', rel: t.rel, file: t.f, key });
  return Object.assign(d, { editable: !d.loneCr, why: d.loneCr ? 'lonecr' : null, rel: t.rel, file: t.f, key });
}
function save(ctx, body) {
  body = body || {};
  if (typeof body.text !== 'string' || body.text.length > 4 * MAX_EDIT) throw bad('text: the edited text is missing or too big');
  if (String(body.rel || '').includes('::')) return savePak(ctx, body, checkMod(ctx, body.mod));
  const mod = checkMod(ctx, body.mod), t = target(mod, body.rel);
  const st = stat(t.f); if (!st) throw bad('No such file in your mod: ' + t.rel, 404);
  if (st.size > MAX_EDIT) throw bad('File over 2 MB.', 413);
  const orig = fs.readFileSync(t.f);
  if (isBinary(orig)) throw bad('This is a binary file.', 415);
  if (body.base && body.base !== sha1(orig)) throw bad('The file changed on disk since you opened it. Open it again, then redo your change.', 409);
  if (decodeBuf(orig).loneCr) throw bad('This file has stray CR characters; the editor would change them. Edit it in a text editor.', 415);
  const r = rebuild(orig, body.text);
  const res = { mod, rel: t.rel, file: t.f, changed: r.changed, hunks: r.hunks, warns: r.warns, eol: r.eol, oldSize: orig.length, newSize: r.buf.length, undo: undoRoot(mod) };
  if (!body.write || !r.changed) return Object.assign(res, { written: false });
  guardWrite(ctx, mod, 'save the file');
  const snap = snapshot(mod, t, 'save');
  writeAtomic(t.f, r.buf);
  return Object.assign(res, { written: true, restorePoint: snap.id, hash: sha1(r.buf) });
}
// copy a read-only file (a game index layer, or any file) into the mod at rel; byte-exact copy
function copyIn(ctx, body) {
  body = body || {};
  const mod = checkMod(ctx, body.mod);
  let buf, from;
  if (body.key) { const key = names.normalize(body.key); buf = readChainRec(ctx, mod, key, body.idx); from = key; }
  else if (body.path) {
    const f = path.resolve(String(body.path)); if (!path.isAbsolute(String(body.path))) throw bad('path: a full file path is needed');
    const st = stat(f); if (!st || !st.isFile()) throw bad('No such file.', 404);
    if (st.size > MAX_COPY) throw bad('File over 8 MB.', 413);
    buf = fs.readFileSync(f); from = f;
  } else throw bad('Nothing to copy: pick a file first.');
  const rel = body.rel || (body.key ? names.normalize(body.key) : '');
  const t = target(mod, rel), cur = stat(t.f) ? fs.readFileSync(t.f) : null;
  const bin = isBinary(buf);
  const res = { mod, from, rel: t.rel, file: t.f, exists: !!cur, size: buf.length, binary: bin, same: !!(cur && cur.equals(buf)),
    hunks: cur && !bin && !isBinary(cur) ? textHunks(describeSafe(cur), describeSafe(buf)) : [], key: keyOf(t.rel, gidOf(ctx) === 'goh' ? keyLangs(ctx, vfsFor(ctx, mod)) : null), undo: undoRoot(mod) };
  if (!body.write || res.same) return Object.assign(res, { written: false });
  guardWrite(ctx, mod, 'copy the file into your mod');
  const snap = snapshot(mod, t, cur ? 'copy-over' : 'copy-new');
  writeAtomic(t.f, buf);
  return Object.assign(res, { written: true, restorePoint: snap.id });
}

// ---------------------------------------------------------------- search (E-3)
// Async, in slices of about SLICE ms (setImmediate between), total budget SEARCH.ms. Roots: the mod folder (loose files), then with
// `vanilla` the WINNING copy of every text file of the game's layered view (loose folders and pak entries, keys the mod has a file
// for skipped), then the `other` folder. A newer search with the same `sid` cancels the older one ({cancelled:true}).
// Mod/other hit: {root, file, rel, line, col, text}. Game hit: {root:'vanilla', key, layer, kind, idx, pak?, line, col, text}
// (open it read-only with /open {mod, key, idx}). Pak entries are read one at a time through vfs.readRec (no cache; each <= SEARCH.size).
const SEARCH_GAME_FILES = 100000, SLICE = 30;
// text kinds the editor opens as text (ide/ui/core.js SDLX + lng/lua + ide/intel/nav.js TEXT); extensionless files under set/ and entity/
const GAME_TEXT = /\.(def|def1|ext|inc|set|mi|mtl|mdl|info|weapon|ammo|grenade|mine|pattern|presets|nav|lay|ssq|accuracy|reg|opt|hand|fsm|dl|pot|fx|font|ps|mod|ctm|etf|tpl|lng|lua|txt|xml|ini|json)$/i;
const isGameText = key => GAME_TEXT.test(key) || (/^resource\/(set|entity)\//.test(key) && !/\.[^/]*$/.test(key.slice(key.lastIndexOf('/') + 1)));
const _searches = new Map();     // sid -> live token
// SPEED: the mod's own text files come from memory (./corpus.js) when the server's shared walk is there (ctx.modtree): the disk is
// read once, a later search scans what is held. No ctx.modtree (a tool, a lib test): the walk and the reads below, as before.
const corpus = require('./corpus');
const skipDir = rel => { const p = rel.split('/'); for (let i = 0; i < p.length - 1; i++) if (SKIP_DIRS.has(lc(p[i])) || p[i].endsWith(UNDO_SUFFIX)) return true; return false; };
const CORPUS_O = { skip: rel => BIN_EXT.test(rel) || skipDir(rel), maxSize: SEARCH.size };
// the page opens its search: the walk and the reads start now, not at the first search. Never throws
async function searchWarm(ctx, body) {
  if (!ctx || !ctx.modtree) return { state: 'na' };
  let mod; try { mod = checkRead(ctx, body && body.mod); } catch (e) { return { state: 'na' }; }
  // answers at once (the page's buttons wait for an api call); `wait` (a test, a measurement) waits for the walk and says how far it is
  const p = corpus.warm(ctx.modtree, mod, CORPUS_O);
  return body && body.wait ? p : { state: 'started' };
}
const CANCEL = { cancel: true };
function slicer(tok) {
  let s = Date.now();
  return async (force) => {
    if (!force && Date.now() - s < SLICE) return;
    await new Promise(r => setImmediate(r));
    s = Date.now();
    if (tok.cancelled) throw CANCEL;
  };
}
async function walkA(dir, rel, out, cap, skipUndo, y) {
  let ns; try { ns = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  ns.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of ns) {
    if (out.length >= cap) return;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (SKIP_DIRS.has(lc(e.name)) || (skipUndo && e.name.endsWith(UNDO_SUFFIX))) continue; await walkA(path.join(dir, e.name), r, out, cap, skipUndo, y); }
    else if (e.isFile()) out.push(r);
  }
  await y();
}
// lines of buf matching re -> [{line, col, text}] (same decode as openFile: per line UTF-8, else cp1251)
function scanBuf(buf, re, pre, max) {
  if (isBinary(buf)) return null;
  if (pre && !pre.test(buf.toString('latin1'))) return [];
  let lines; try { lines = decodeBuf(buf).lines; } catch { return null; }
  const out = [];
  for (let i = 0; i < lines.length && out.length < max; i++) {
    const t = lines[i].t, m = re.exec(t.length > SEARCH.line ? t.slice(0, SEARCH.line) : t);
    if (m) out.push({ line: i + 1, col: m.index + 1, text: cut(t.trim()) });
  }
  return out;
}
async function search(ctx, body) {
  body = body || {};
  const mod = checkRead(ctx, body.mod);
  const q = String(body.q || '');
  if (!q.trim() || q.length > 200) throw bad('Type 1 to 200 characters to search for.');
  let re;
  try { re = body.regex ? new RegExp(q, body.caseSens ? '' : 'i') : new RegExp(q.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'), body.caseSens ? '' : 'i'); }
  catch (e) { throw bad('That pattern is not a valid regular expression: ' + e.message); }
  // plain printable-ASCII text: a whole-buffer latin1 test finds every file a line could match in (ASCII bytes decode the same in
  // UTF-8 and cp1251; case folding of ASCII stays ASCII), so files without it skip the per-line decode
  const pre = !body.regex && /^[\x20-\x7e]+$/.test(q) ? re : null;
  // a regular expression of printable ASCII without `$`, on a file that is all ASCII: one test of the whole text (flag m) says
  // whether any line can match (a line match is a match there too; `$` is left out because a line ends in CR LF), so the
  // per-line decode is skipped for the files without one. Only for files held in memory (the corpus knows which are all ASCII)
  let pre2 = null;
  if (body.regex && /^[ -~]+$/.test(q) && !q.includes('$')) { try { pre2 = new RegExp(q, body.caseSens ? 'm' : 'im'); } catch (e) { pre2 = null; } }
  // plain text with a letter above ASCII (Cyrillic, CJK): a file that is all ASCII cannot hold it, so it is not decoded at all.
  // Not with U+017F or U+212A in the text: without case they also match the ASCII letters s and k
  const hi = !body.regex && /[^\x00-\x7f]/.test(q) && !/[ſK]/.test(q);
  const g = gameOf(ctx), kl = gidOf(ctx) === 'goh' ? keyLangs(ctx, vfsFor(ctx, mod)) : null;
  const roots = [{ id: 'mod', dir: mod }];
  if (body.vanilla && g && isDir(g)) roots.push({ id: 'vanilla', dir: g, game: true });
  if (body.other) {
    const o = String(body.other);
    if (!path.isAbsolute(o) || !isDir(o)) throw bad('The other folder does not exist: ' + o);
    remoteRead(ctx, path.resolve(o));
    roots.push({ id: 'other', dir: path.resolve(o) });
  }
  // a phone: each file of the game's view is asked once (a pak once for all its entries); the walks below never follow links
  const okSeen = new Map(), mayRead = f => { if (!isRemote(ctx)) return true; let v = okSeen.get(f); if (v === undefined) { try { remoteRead(ctx, f); v = true; } catch { v = false; } okSeen.set(f, v); } return v; };
  const sid = body.sid == null || body.sid === '' ? null : String(body.sid).slice(0, 200);
  const tok = { cancelled: false };
  if (sid !== null) { const old = _searches.get(sid); if (old) old.cancelled = true; _searches.set(sid, tok); }
  // JOBS: the footer's Cancel stops this search at its next slice (the same token a newer search with the same sid sets)
  if (ctx && ctx.job && typeof ctx.job.onCancel === 'function') { ctx.job.onCancel(() => { tok.cancelled = true; }); ctx.job.canCancel = true; }
  const y = slicer(tok);
  const t0 = Date.now(), hits = [], notes = [], mine = new Set();
  let files = 0, searched = 0, truncated = null, asOf = 0, held = null;
  const late = () => Date.now() - t0 > SEARCH.ms;
  try {
    outer: for (const r of roots) {
      if (r.game) {
        const cv = vfsFor(ctx, mod);
        if (!cv.v) { notes.push(...cv.notes); continue; }
        await y(true);
        const keys = []; let n = 0;
        for (const [key, rec] of cv.v.files) {
          if ((++n & 4095) === 0) { await y(); if (late()) { truncated = 'time'; break outer; } }
          if (!mine.has(key) && !rec.deleted && isGameText(key) && (rec.size || 0) <= SEARCH.size) keys.push(key);
        }
        keys.sort();
        await y();
        let gf = 0;
        for (const key of keys) {
          files++;
          if (++gf > SEARCH_GAME_FILES) { truncated = 'files'; break outer; }
          if (late()) { truncated = 'time'; break outer; }
          await y();
          const rec = cv.v.files.get(key);
          if (!mayRead(recFile(rec))) continue;
          let buf; try { buf = vfsLib.readRec(rec); } catch { continue; }
          const found = scanBuf(buf, re, pre, SEARCH.hits - hits.length);
          if (!found) continue;
          searched++;
          if (!found.length) continue;
          const ch = cv.v.chain(key), base = { root: 'vanilla', key, layer: rec.layer, kind: kindOf(rec, cv), idx: Math.max(0, ch.length - 1) };
          if (rec.source === 'pak') base.pak = path.basename(rec.container);
          for (const f of found) hits.push(Object.assign({}, base, f));
          if (hits.length >= SEARCH.hits) { truncated = 'hits'; break outer; }
        }
        continue;
      }
      let rels, cp = null;
      if (r.id === 'mod' && ctx && ctx.modtree) { try { cp = await corpus.open(ctx.modtree, r.dir, CORPUS_O); } catch (e) { cp = null; } }
      if (cp) {
        rels = cp.rels; asOf = cp.asOf; held = cp;
        // the keys the mod has (the game's copy of them is skipped): from every file of the walk, kept with the corpus
        if (roots.some(x => x.game)) {
          const mk = JSON.stringify(kl || null);
          if (!cp.mine || cp.mine.k !== mk) { const set = new Set(); let n = 0; for (const rel of cp.all) { const k = keyOf(rel, kl); if (k) set.add(k); if ((++n & 8191) === 0) await y(); } cp.mine = { k: mk, set }; }
          for (const k of cp.mine.set) mine.add(k);
        }
      } else { rels = []; await walkA(r.dir, '', rels, SEARCH.files + 1, r.id === 'mod', y); }
      let lf = 0;
      for (const rel of rels) {
        files++;
        if (!cp && ++lf > SEARCH.files) { truncated = 'files'; break outer; }
        if (late()) { truncated = 'time'; break outer; }
        if (r.id === 'mod' && !cp) { const k = keyOf(rel, kl); if (k) mine.add(k); }
        await y();
        const f = path.join(r.dir, ...rel.split('/'));
        let buf;
        if (cp) { buf = cp.buf(rel); if (!buf) continue; if (cp.ascii(rel) && (hi || (pre2 && !pre2.test(buf.toString('latin1'))))) { searched++; continue; } }
        else {
          if (BIN_EXT.test(rel)) continue;
          const st = stat(f);
          if (!st || st.size > SEARCH.size) continue;
          try { buf = fs.readFileSync(f); } catch { continue; }
        }
        const found = scanBuf(buf, re, pre, SEARCH.hits - hits.length);
        if (!found) continue;
        searched++;
        for (const x of found) hits.push({ root: r.id, file: f, rel, line: x.line, col: x.col, text: x.text });
        if (hits.length >= SEARCH.hits) { truncated = 'hits'; break outer; }
      }
    }
  } catch (e) {
    if (e === CANCEL) return { mod, q, cancelled: true, hits: [], searched, ms: Date.now() - t0 };
    throw e;
  } finally { if (sid !== null && _searches.get(sid) === tok) _searches.delete(sid); if (held) held.fill(); }   // what this search did not reach is read in the background
  const res = { mod, q, roots: roots.map(r => ({ id: r.id, dir: r.dir })), hits, files, searched, truncated, ms: Date.now() - t0, caps: Object.assign({ gameFiles: SEARCH_GAME_FILES, slice: SLICE }, SEARCH) };
  if (truncated === 'time') Object.assign(res, { partial: true, why: 'time' });
  // answered from the file list of an older walk (nothing written through the GUI since); a new walk is running (PERF.md B1)
  if (asOf) res.asOf = { at: asOf, checking: true };
  if (notes.length) res.notes = notes;
  return res;
}

// ide ext (tools/ide/README.md): the mod list the game index is built from, for the editor's language service
// CACHE: what the mod list of the layered view is read from, as one short text for a store identity (parts): the profile's mod
// list with size and time of each listed mod's mod.info under <game>/mods (its needs and version range decide whether it loads) and,
// under GoH, the text language. The game and the open mod's own files are stamps (gameview, modtree), not part of this.
// Not seen here: the other files of the listed mods [I] (a changed file of another active mod shows after a mod list or game change).
function profileSig(ctx) {
  const g = gameOf(ctx), gid = gidOf(ctx);
  if (!g) return '';
  const p = profileMods(g, gid);
  const infos = p.mods.map(s => { const st = stat(path.join(g, 'mods', names.normalize(String(s).split(':')[0]), 'mod.info')); return st ? st.size + ':' + st.mtimeMs : '-'; });
  return sha1(JSON.stringify([p.file ? 1 : 0, p.mods, infos, gid === 'goh' && p.file ? gohLang(p.file) : null])).slice(0, 16);
}
function modsFor(ctx, mod) { const cv = vfsFor(ctx, checkRead(ctx, mod)); return cv.v ? cv.v.mods.slice() : []; }
module.exports = { checkMod, readMod, viewKey, remoteRead, isRemote, target, pakTarget, recFile, isBinary, decodeBuf, rebuild, align, editLine, undoRoot, undoList, restore, which, tree, openFile, save, copyIn, search, searchWarm, keyOf, isModInfo, sha1,
  gameOf, vfsFor, vfsForAsync, vfsReady, vfsWarm, chainFor, readChainRec, kindOf, modsFor, profileSig, gidOf, exeOf, gohLocked, checkRead, keyLangs, gameVersionOf, SEARCH,
  _reset: () => { corpus.drop(); gameview.drop(); _gv.clear(); _warm.clear(); _goh = undefined; } };

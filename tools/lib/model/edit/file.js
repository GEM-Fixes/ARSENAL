// model/edit/file: the Files part of the built-in model editor (contract tools/lib/model/edit/README.md; rows FILE, PREF and
// MISC of tools/soedit/parity.md). Ops change the document only (bytes in, bytes out, no disk); the page's routes in
// tools/gui/ext/models/sub/file.server.js do what needs the disk (new model on disk, save a copy, export, import source, autosave).
//
// Paths: a document rel is the path inside the mod, as the core keeps it: 'resource/entity/<folders>/<name>/<name>.mdl'
// (the vfs key form of tools/soedit/stage.js). A user may type 'entity/props/mybox', '/entity/props/mybox.mdl' or the full rel;
// normRel() turns each into that form, lower case (the game's names are case blind, SOEdit lowercases paths, FILE-11).
// A name written inside a .mdl or .def is relative to that file's folder, or '/x' = resource/x (tools/lib/names.js resolve);
// refName() writes the short relative form when the file sits in or under the model folder, else the '/entity/..' form,
// never a disk path (SOEdit falls back to an absolute disk path with a warning box).
//
// Ops (module.exports.ops, each one undo step; args as listed; Error with a plain sentence when it cannot run):
//   file.new       { path, template: 'empty'|'prop'|'vehicle', def: bool, author?, date? } the document becomes a new model:
//                  every file it had is removed (null), the new .mdl (and .def stub) added. info.mdl = the new .mdl rel.
//   file.saveAs    { name, folder? } the document's files move to the new name: files in the model folder go to the new folder
//                  (default: the model folder renamed when it carries the model name, as the game lays units out), files named
//                  after the model (<name>.mdl .def .ply .vol .anm, <name>#n.*, <name>__*.vol) are renamed, .mtl and textures keep
//                  their names (a .ply names its .mtl inside its binary). Names inside the .mdl and .def are rewritten to match.
//                  info.mdl = the new .mdl rel, info.renamed = [[old, new]].
//   file.import    { rel, data (base64) | bytes (Buffer), replace? } a .ply .vol .anm or .mtl copied into the document at rel;
//                  binary files must read with tools/lib/model/<kind>.js. info.ref = the name to write in the .mdl.
//   file.remove    { rel } removed from the document (never the .mdl). info.refs = the .mdl lines that still name it.
//   file.revert    { rel? } one file (or every changed file) back to its bytes as opened; a new file leaves the document.
//   file.stamp     { author, date? } the leading ';' comment lines of the .mdl get ';Model create/rebuild by: <author>' and
//                  ';Last build date: <date>' (replacing older lines of those two kinds only); every other comment is kept.
//   file.fullMatrices {} every bone and volume placement written as one {Matrix34} (SOEdit's "Compatibility with GEMI", FILE-09).
//   file.clipPaste { parent, text } a bone block (from file.clipCopy) added as the last child of bone `parent`; names that clash
//                  get _2, _3 ... (FindBone takes the first match, so a clash would hide a bone). info.renamed.
//   file.clipCut   { bone } the bone block removed (not the root). info.text = what file.clipCopy gives, info.orphans = volume ids.
// States (module.exports.state, JSON only):
//   file.list {}               -> { mdl, files: [{ rel, kind, from, dirty, size, named }], changed }
//   file.text { rel?, bone?, volume? } -> { rel, kind, text, line, lines, from, dirty }   (line of the bone / volume block, 1-based)
//   file.info {}               -> { fields: { createdBy, exportedBy, plyBy, volBy, date, file, rebuildBy, lastBuild }, comments }
//   file.refs {}               -> { refs: [{ text, key, line, kind, inDoc, diskPath, implicit }] }
//   file.check {}              -> { findings: [{ rel, code, msg, line }] }  codes: PATH MDL_ERROR PLY_ERROR VOL_ERROR ANM_ERROR
//                                 NO_SKELETON VOLUME_NO_BONE REF_MISSING REF_DISK_PATH + the loss codes of tools/soedit/check.js
//   file.copyPlan { name, folder? } -> { mdl, files: [{ rel, from, data }] }   the file.saveAs result without changing the document
//   file.pack { rels?, changed? } -> { mdl, files: [{ rel, kind, data }] }      current bytes, base64 (export, autosave, lint)
//   file.templates {}          -> [{ id, bones, volumes, note, source }]
//   file.clipCopy { bone }     -> { bone, text, names }
// Pure helpers (exports): normRel, relProblem, refName, resolveRef, blank, renamePlan, stampHeader, fullMatrices, kindOf,
//   TEMPLATES, decodeText.
// Template bone names: (names .def files and macros look up) and the vanilla t34m.mdl skeleton
// (basis > body > turret, wheelsl/wheelsr > wheell*/wheelr* with ID=trackleft/right). The vehicle template is a starting point:
// check it in game (speed and limits of revolute bones come from the .def,.
// Author: Imperator_Aug (ARSENAL, ia-e4f75574)
'use strict';
const posix = require('path').posix, fs = require('fs'), path = require('path');
const mdlLib = require('../mdl'), plyLib = require('../ply'), volLib = require('../vol'), anmLib = require('../anm');
const sw = require('../../sdlwrite'), names = require('../../names'), enc = require('../../enc'), wg = require('../../writeguard');

const KINDS = { '.mdl': 'mdl', '.ply': 'ply', '.vol': 'vol', '.anm': 'anm', '.mtl': 'mtl', '.def': 'def' };
const REF_EXTS = new Set(['.ply', '.vol', '.anm', '.mtl', '.mdl']);
const IMPORT_KINDS = new Set(['ply', 'vol', 'anm', 'mtl']);
const kindOf = rel => KINDS[posix.extname(String(rel)).toLowerCase()] || 'other';
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
const stemOf = k => baseOf(k).replace(/\.[^.]*$/, '');
const low = s => String(s).toLowerCase();
const fail = msg => { throw new Error(msg); };
const isBlk = n => n && (n.type === 'block' || n.type === 'list');
const kw = n => (n.items[0] && n.items[0].type === 'atom') ? n.items[0].text.toLowerCase() : '';
const eolOf = src => /\r\n/.test(src) || !/\n/.test(src) ? '\r\n' : '\n';
const unitOf = src => /\n\t/.test(src) ? '\t' : '  ';
const lineStart = (src, p) => { while (p > 0 && src[p - 1] !== '\n' && src[p - 1] !== '\r') p--; return p; };
const indentAt = (src, p) => /^[ \t]*/.exec(src.slice(lineStart(src, p)))[0];
function unquote(text) { let s = text.slice(1); if (s.endsWith('"')) s = s.slice(0, -1); return s.replace(/\\(.)/g, (m, e) => (e === 'n' ? '\n' : e === 't' ? '\t' : e)); }
function quote(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
function bufOf(a) {
  if (Buffer.isBuffer(a.bytes)) return a.bytes;
  if (a.bytes instanceof Uint8Array) return Buffer.from(a.bytes);
  if (typeof a.data === 'string') return Buffer.from(a.data, 'base64');
  return null;
}
function fileOf(doc, rel) {
  if (!rel) return null;
  const f = doc.files.get(rel); if (f) return f;
  const l = low(rel);
  for (const [k, v] of doc.files) if (low(k) === l) return v;
  return null;
}
function mdlOf(doc) {
  const f = fileOf(doc, doc.mdl);
  if (!f || !f.bytes) fail('No model is open.');
  return f;
}
// text of a file for reading: UTF-8 when it is valid UTF-8, else cp1251 (vanilla comments
function decodeText(buf) { return enc.isUtf8(buf) ? buf.toString('utf8') : enc.decodeCp1251(buf); }

// ---------- paths ----------
function normRel(p) {
  let s = String(p == null ? '' : p).trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  if (!/^resource\//i.test(s)) s = 'resource/' + s;
  return s.toLowerCase();
}
function relProblem(rel) {
  if (!rel || typeof rel !== 'string') return 'No file name was given.';
  if (/^[a-z]:/i.test(rel) || /^[\\/]/.test(rel)) return 'Give the path inside the mod (for example entity/props/mybox), not a full disk path.';
  if (rel.length > 200) return 'The path is ' + rel.length + ' characters long; keep it under 200.';
  const segs = rel.split('/');
  if (segs.some(s => s === '..' || s === '.')) return 'The path may not use "." or ".." as a folder name.';
  if (segs.some(s => !s)) return 'The path has an empty folder name.';
  if (low(segs[0]) !== 'resource') return 'Model files live under resource/ in the mod.';
  for (const s of segs) {
    if (!/^[A-Za-z0-9_\-.#]+$/.test(s)) return 'The name "' + s + '" has a character the game may not read; use latin letters, digits, "_", "-" and ".".';
    if (wg.nameProblem(s)) return 'The name "' + s + '" cannot be used: ' + wg.nameProblem(s) + '.';
  }
  return null;
}
const resolveRef = (name, dir) => posix.normalize(names.resolve(name, dir).key);
function refName(dir, key) {
  const d = low(dir), k = low(key);
  if (d && k.startsWith(d)) return k.slice(d.length);
  return k.startsWith('resource/') ? '/' + k.slice(9) : '//' + k;
}

// ---------- templates ----------
const T = '\t';
const TEMPLATES = {
  empty: {
    bones: ['basis'], volumes: [],
    note: 'A root bone "basis" and nothing else. Add bones, meshes and volumes from the other tabs.',
    source: 'modweb/formats/mdl.md:3 (root usually "basis")',
    skeleton: ['{bone "basis"', '}'], extra: [],
  },
  prop: {
    bones: ['basis'], volumes: ['body'],
    note: 'A root bone "basis" with one box volume "body", one metre on each side, standing on the ground.',
    source: 'modweb/formats/mdl.md:3, modweb/formats/vol-block.md (Volume with Box and Bone)',
    skeleton: ['{bone "basis"', '}'],
    extra: ['{Volume "body"', T + '{Box 20 20 20}', T + '{Bone "basis"}', T + '{Position 0' + T + '0' + T + '10}', '}'],
  },
  vehicle: {
    bones: ['basis', 'body', 'turret', 'gun_rot', 'gun', 'wheelsl', 'wheell1', 'wheelsr', 'wheelr1'], volumes: ['body', 'turret'],
    note: 'A starting point for a vehicle: basis, body, turret, gun_rot, gun and one wheel on each side. Check it in game: turn speeds and limits come from the .def, and the gun axis may need turning.',
    source: 'modweb/formats/mdl-seq.md:2 (bone names the .def and macros look up); vanilla t34m.mdl skeleton (basis > body > turret, wheelsl/wheelsr, ID=trackleft/trackright)',
    skeleton: [
      '{bone "basis"',
      T + '{bone "body"',
      T + T + '{Position 0' + T + '0' + T + '20}',
      T + T + '{bone revolute "turret"',
      T + T + T + '{parameters "ID=turret;"}',
      T + T + T + '{Position 0' + T + '0' + T + '20}',
      T + T + T + '{bone revolute "gun_rot"',
      T + T + T + T + '{limits -5 20}',
      T + T + T + T + '{Orientation',
      T + T + T + T + T + '1' + T + '0' + T + '0',
      T + T + T + T + T + '0' + T + '0' + T + '1',
      T + T + T + T + T + '0' + T + '-1' + T + '0',
      T + T + T + T + '}',
      T + T + T + T + '{Position 20' + T + '0' + T + '5}',
      T + T + T + T + '{bone "gun"',
      T + T + T + T + T + '{Position 40' + T + '0' + T + '0}',
      T + T + T + T + '}',
      T + T + T + '}',
      T + T + '}',
      T + '}',
      T + '{bone "wheelsl"',
      T + T + '{bone revolute "wheell1"',
      T + T + T + '{parameters "ID=trackleft;"}',
      T + T + T + '{Position 0' + T + '30' + T + '10}',
      T + T + '}',
      T + '}',
      T + '{bone "wheelsr"',
      T + T + '{bone revolute "wheelr1"',
      T + T + T + '{parameters "ID=trackright;"}',
      T + T + T + '{Position 0' + T + '-30' + T + '10}',
      T + T + '}',
      T + '}',
      '}'],
    extra: ['{Volume "body"', T + '{Box 100 60 30}', T + '{Bone "body"}', '}', '{Volume "turret"', T + '{Box 40 40 20}', T + '{Bone "turret"}', T + '{Position 0' + T + '0' + T + '10}', '}'],
  },
};
// the new model's path: 'entity/props/mybox' -> resource/entity/props/mybox/mybox.mdl; a path ending in .mdl is used as given
function newTarget(p) {
  const raw = String(p == null ? '' : p).trim().replace(/[\\/]+$/, '');
  if (!raw) fail('Type where the new model goes, for example entity/props/mybox.');
  if (/^[a-z]:/i.test(raw) || raw.startsWith('\\\\')) fail('Give the path inside the mod (for example entity/props/mybox), not a full disk path.');
  let rel = normRel(raw);
  if (!/\.mdl$/.test(rel)) rel = rel + '/' + baseOf(rel) + '.mdl';
  const why = relProblem(rel); if (why) fail(why);
  if (!rel.startsWith('resource/entity/')) fail('New models go under entity/ (for example entity/props/mybox): the game looks there for units and objects.');
  return rel;
}
function blank(a) {
  a = a || {};
  const tp = TEMPLATES[a.template || 'empty'];
  if (!tp) fail('There is no template called "' + a.template + '". Pick empty, prop or vehicle.');
  const mdl = newTarget(a.path), stem = stemOf(mdl), E = '\r\n';
  const head = [];
  if (a.author) head.push(';Model created by: ' + String(a.author).replace(/[\r\n]+/g, ' '));
  if (a.date) head.push(';Date: ' + String(a.date).replace(/[\r\n]+/g, ' '));
  const lines = head.concat(['{Skeleton'], tp.skeleton.map(l => T + l), ['}'], tp.extra, ['']);
  const files = { [mdl]: Buffer.from(lines.join(E), 'utf8') };
  let def = null;
  if (a.def) {
    def = dirOf(mdl) + stem + '.def';
    const dl = ['{game_entity', T + '{Extension ' + quote(stem + '.mdl') + '}'];
    if (a.template && a.template !== 'empty') dl.push(T + ';starting point: add the include of the properties this kind of entity needs, as the game\'s own entities do, and check it in game');
    dl.push('}', '');
    files[def] = Buffer.from(dl.join(E), 'latin1');
  }
  return { mdl, def, files, template: a.template || 'empty' };
}

// ---------- walking string tokens of an SDL text ----------
function strings(t, cb) {
  (function walk(n) { for (const x of n.items) { if (x.type === 'string') cb(x, n); else if (isBlk(x)) walk(x); } })(t.root);
}
// names inside a .mdl or .def that point at files, moved from oldDir to newDir; map: lower old key -> new key
function rewriteRefs(buf, oldDir, newDir, map) {
  let t; try { t = sw.parse(buf); } catch (e) { return { bytes: buf, changed: 0, error: e.message }; }
  let n = 0;
  strings(t, tok => {
    const v = unquote(tok.text), ext = posix.extname(low(v));
    if (!REF_EXTS.has(ext) || /^[a-z]:/i.test(v)) return;
    const oldKey = resolveRef(v, oldDir), newKey = map.get(oldKey) || oldKey;
    if (resolveRef(v, newDir) === low(newKey)) return;
    t.splices.push({ start: tok.start, end: tok.end, text: quote(refName(newDir, newKey)) }); n++;
  });
  return { bytes: n ? sw.serialize(t) : buf, changed: n };
}

// ---------- save as ----------
function renamePlan(doc, a) {
  a = a || {};
  const mf = mdlOf(doc), oldMdl = mf.rel || doc.mdl, oldDir = dirOf(oldMdl), oldStem = stemOf(oldMdl);
  const name = low(String(a.name || '').trim().replace(/\.mdl$/i, ''));
  if (!name) fail('Type the new name first.');
  if (!/^[a-z0-9_\-.#]+$/.test(name) || /^\.|\.$/.test(name)) fail('A model name has only latin letters, digits, "_", "-" and ".".');
  let newDir;
  if (a.folder != null && String(a.folder).trim()) newDir = normRel(String(a.folder).trim().replace(/[\\/]+$/, '')) + '/';
  else { const segs = oldDir.split('/').filter(Boolean); newDir = low(segs[segs.length - 1]) === low(oldStem) ? segs.slice(0, -1).concat(name).join('/') + '/' : oldDir; }
  const newMdl = low(newDir + name + '.mdl');
  const why = relProblem(newMdl); if (why) fail(why);
  if (newMdl === low(oldMdl)) fail('That is the name and folder it has now.');
  const map = new Map(), moves = [];
  for (const rel of doc.files.keys()) {
    if (!low(rel).startsWith(low(oldDir))) continue;
    let tail = rel.slice(oldDir.length);
    const k = kindOf(rel), b = baseOf(tail), rest = b.slice(oldStem.length);
    if (k !== 'mtl' && k !== 'other' && low(b).startsWith(low(oldStem)) && /^(\.|#|__)/.test(rest)) tail = dirOf(tail) + name + rest;
    const nr = low(newDir + tail);
    map.set(low(rel), nr); moves.push([rel, nr]);
  }
  const moving = new Set(moves.map(m => low(m[0])));
  for (const [, nr] of moves) {
    const hit = fileOf(doc, nr);
    if (hit && !moving.has(low(hit.rel || nr))) fail('The document already has a file ' + nr + '; pick another name.');
  }
  const files = moves.map(([old, nr]) => {
    const f = fileOf(doc, old), k = kindOf(old);
    let bytes = f.bytes;
    if (k === 'mdl' || k === 'def') bytes = rewriteRefs(bytes, dirOf(low(old)), dirOf(nr), map).bytes;
    return { old, rel: nr, bytes };
  });
  return { mdl: newMdl, oldMdl, newDir, files, map };
}

// ---------- header comment lines (FILE-06, PREF-05) ----------
function headerSpan(src) {
  let i = src.startsWith('\xEF\xBB\xBF') ? 3 : 0;
  const start = i, lines = [];
  while (i < src.length) {
    let e = src.indexOf('\n', i); e = e < 0 ? src.length : e + 1;
    const L = src.slice(i, e);
    if (!/^[ \t]*;/.test(L)) break;
    lines.push({ start: i, end: e, text: L.replace(/\r?\n$/, '') });
    i = e;
  }
  return { start, end: i, lines };
}
const HEAD_KEYS = [['createdBy', /^model (created )?by$/], ['exportedBy', /^exported by$/], ['plyBy', /^ply geometry by$/], ['volBy', /^vol geometry by$/],
  ['date', /^date$/], ['file', /^file$/], ['rebuildBy', /^model create\/rebuild by$/], ['lastBuild', /^last build date$/]];
function headerInfo(buf) {
  const src = buf.toString('latin1'), h = headerSpan(src), fields = {}, comments = [];
  for (const l of h.lines) {
    const txt = decodeText(Buffer.from(l.text, 'latin1')).replace(/^[ \t]*;/, '').trim();
    comments.push(txt);
    const m = /^([^:]+):\s*(.*)$/.exec(txt); if (!m) continue;
    const k = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [id, re] of HEAD_KEYS) if (re.test(k) && fields[id] == null) fields[id] = m[2].trim();
  }
  return { fields, comments };
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = n => String(n).padStart(2, '0');
function buildDate(d) { return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
function stampHeader(buf, a) {
  const author = String((a && a.author) || '').replace(/[\r\n]+/g, ' ').trim();
  if (!author) fail('Type your nickname in the preferences first: the header line names who rebuilt the model.');
  const src = buf.toString('latin1'), h = headerSpan(src), E = eolOf(src);
  const keep = h.lines.filter(l => !/^[ \t]*;\s*(model create\/rebuild by|last build date)\s*:/i.test(l.text)).map(l => Buffer.from(l.text + E, 'latin1'));
  const date = a.date ? String(a.date).replace(/[\r\n]+/g, ' ') : buildDate(new Date());
  keep.push(Buffer.from(';Model create/rebuild by: ' + author + E, 'utf8'), Buffer.from(';Last build date: ' + date + E, 'utf8'));
  return Buffer.concat([buf.subarray(0, h.start), ...keep, buf.subarray(h.end)]);
}

// ---------- full matrices (FILE-09) ----------
function insertBeforeCloser(t, node, lines) {
  const src = t.src, cs = node.closeStart, E = eolOf(src), ind = indentAt(src, node.start), u = unitOf(src);
  const ls = lineStart(src, cs);
  if (/^[ \t]*$/.test(src.slice(ls, cs))) t.splices.push({ start: ls, end: ls, text: lines.map(l => ind + u + l).join(E) + E });
  else t.splices.push({ start: cs, end: cs, text: E + lines.map(l => ind + u + l).join(E) + E + ind });
}
const PLACE = new Set(['position', 'orientation', 'matrix34']);
function fullMatrices(buf) {
  const m = mdlLib.parse(buf);
  if (!m.tree) fail('The model cannot be read: ' + m.error);
  const t = m.tree, src = t.src, u = unitOf(src), E = eolOf(src), f = mdlLib.fmtNum, done = [], skipped = [];
  const owners = m.bones.map(b => ({ id: b.path, node: b.node, matrix: b.matrix, form: b.form, exact: b.exact }))
    .concat(m.volumes.map(v => ({ id: v.id, node: v.node, matrix: v.matrix, form: v.form, exact: v.exact })));
  for (const o of owners) {
    const pl = o.node.items.filter(x => isBlk(x) && PLACE.has(kw(x)));
    if (pl.length === 1 && o.form.length === 1 && o.form[0] === 'Matrix34') continue;
    if (!o.exact) { skipped.push(o.id); continue; }
    const M = o.matrix, rows = [M.slice(0, 3), M.slice(3, 6), M.slice(6, 9), M.slice(9, 12)].map(r => r.map(f).join(T));
    if (pl.length) {
      const own = /^[ \t]*$/.test(src.slice(lineStart(src, pl[0].start), pl[0].start)), ind = indentAt(src, pl[0].start);
      const text = own ? '{Matrix34' + E + rows.map(r => ind + u + r).join(E) + E + ind + '}' : '{Matrix34 ' + rows.join(' ') + '}';
      t.splices.push({ start: pl[0].start, end: pl[0].end, text });
      for (const x of pl.slice(1)) sw.removeNode(x);
    } else {
      const idx = o.node.items.findIndex(isBlk);
      if (idx >= 0) sw.insertChild(o.node, idx, '{Matrix34 ' + rows.join(' ') + '}');
      else insertBeforeCloser(t, o.node, ['{Matrix34 ' + rows.join(' ') + '}']);
    }
    done.push(o.id);
  }
  return { bytes: done.length ? sw.serialize(t) : buf, done, skipped };
}

// ---------- bone clipboard (MISC-13) ----------
function boneText(src, node) {
  const ind = indentAt(src, node.start);
  return src.slice(node.start, node.end).split(/\r?\n/).map((l, i) => (i && l.startsWith(ind) ? l.slice(ind.length) : l)).join('\n');
}
function clipCopy(doc, a) {
  const mf = mdlOf(doc), m = mdlLib.parse(mf.bytes);
  if (!m.tree) fail('The model cannot be read: ' + m.error);
  const b = mdlLib.findBone(m, a && a.bone);
  if (!b) fail('Pick a bone first.');
  const sub = m.bones.filter(x => x.path === b.path || x.path.startsWith(b.path + '/'));
  return { bone: b.path, text: boneText(m.tree.src, b.node), names: sub.map(x => x.name) };
}
function clipPaste(doc, a) {
  const mf = mdlOf(doc), m = mdlLib.parse(mf.bytes);
  if (!m.tree) fail('The model cannot be read: ' + m.error);
  const p = mdlLib.findBone(m, a && a.parent);
  if (!p) fail('Pick the bone to paste under first.');
  let text = String((a && a.text) || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  const pre = '{Skeleton\n';
  const pm = mdlLib.parse(Buffer.from(pre + text + '\n}\n', 'latin1'));
  const tops = pm.root ? pm.root.items.filter(isBlk) : [];
  const sk = tops[0];
  if (pm.error || tops.length !== 1 || !sk || sk.items.filter(isBlk).length !== 1 || kw(sk.items.filter(isBlk)[0]) !== 'bone' || !pm.bones.length) fail('The clipboard does not hold one bone.');
  if (/[^\x00-\xff]/.test(text)) fail('The clipboard holds characters a model file cannot keep.');
  const used = new Set(m.bones.map(b => low(b.name))), renamed = [], edits = [];
  for (const b of pm.bones) {
    let nm = b.name;
    if (used.has(low(nm))) { let i = 2; while (used.has(low(b.name + '_' + i))) i++; nm = b.name + '_' + i; }
    used.add(low(nm));
    if (nm !== b.name) {
      if (!b.nameNode) fail('A pasted bone has no name.');
      renamed.push([b.name, nm]); edits.push([b.nameNode.start - pre.length, b.nameNode.end - pre.length, quote(nm)]);
    }
  }
  for (const [s, e, r] of edits.sort((x, y) => y[0] - x[0])) text = text.slice(0, s) + r + text.slice(e);
  const t = m.tree;
  insertBeforeCloser(t, p.node, text.split('\n'));
  return { bytes: sw.serialize(t), renamed };
}
function clipCut(doc, a) {
  const mf = mdlOf(doc), m = mdlLib.parse(mf.bytes);
  if (!m.tree) fail('The model cannot be read: ' + m.error);
  const b = mdlLib.findBone(m, a && a.bone);
  if (!b) fail('Pick a bone first.');
  if (b.parent === null) fail('The root bone cannot be cut: the model needs it.');
  const text = boneText(m.tree.src, b.node);
  const gone = m.bones.filter(x => x.path === b.path || x.path.startsWith(b.path + '/'));
  const orphans = m.volumes.filter(v => gone.some(g => g.path === v.bone)).map(v => v.id);
  sw.removeNode(b.node);
  return { bytes: sw.serialize(m.tree), text, orphans, names: gone.map(x => x.name) };
}

// ---------- references ----------
function refsOf(doc) {
  const mf = mdlOf(doc), rel = mf.rel || doc.mdl, dir = dirOf(rel), m = mdlLib.parse(mf.bytes), out = [];
  if (!m.tree) return { refs: out, error: m.error };
  const src = m.tree.src;
  strings(m.tree, (tok, parent) => {
    const v = unquote(tok.text), ext = posix.extname(low(v));
    if (!REF_EXTS.has(ext)) return;
    if (ext === '.mdl' && kw(parent) === 'bone') { /* prefab bone: a model file */ }
    const disk = /^[a-z]:|^\\\\/i.test(v), key = disk ? null : resolveRef(v, dir);
    out.push({ text: v, key, line: mdlLib.lineOf(src, tok.start), kind: kindOf(v), inDoc: !!(key && fileOf(doc, key)), diskPath: disk, implicit: false });
  });
  for (const s of m.sequences) if (s.file === null && s.name) {
    const key = resolveRef(s.name + '.anm', dir);
    out.push({ text: s.name + '.anm', key, line: mdlLib.lineOf(src, s.node.start), kind: 'anm', inDoc: !!fileOf(doc, key), diskPath: false, implicit: true });
  }
  return { refs: out };
}

// ---------- check before save ----------
let LOSS = undefined;
function lossLib() { if (LOSS === undefined) { try { LOSS = require('../../../soedit/check'); } catch (e) { LOSS = null; } } return LOSS; }
function checkDoc(doc) {
  const out = [], add = (rel, code, msg, line) => out.push({ rel, code, msg: String(msg || ''), line: line || 0 });
  const L = lossLib();
  for (const [rel, f] of doc.files) {
    if (!f.bytes) continue;
    const p = relProblem(rel); if (p) add(rel, 'PATH', p);
    const k = f.kind || kindOf(rel);
    if (k === 'mdl') {
      const m = mdlLib.parse(f.bytes);
      if (m.error) add(rel, 'MDL_ERROR', m.error);
      else if (low(rel) === low(doc.mdl)) {
        if (!m.skeleton || !m.bones.length) add(rel, 'NO_SKELETON', 'no {Skeleton} with a bone');
        for (const v of m.volumes) if (v.orphan) add(rel, 'VOLUME_NO_BONE', v.name + (v.boneName ? ' -> ' + v.boneName : ''), mdlLib.lineOf(m.tree.src, v.node.start));
      }
    } else if (k === 'ply') { const r = plyLib.parse(f.bytes); if (r.error) add(rel, 'PLY_ERROR', r.error); }
    else if (k === 'vol') { const r = volLib.parse(f.bytes); if (r.error) add(rel, 'VOL_ERROR', r.error); }
    else if (k === 'anm') { let r; try { r = anmLib.parse(f.bytes); } catch (e) { r = { error: e.message }; } if (r.error) add(rel, 'ANM_ERROR', r.error); }
    const fn = L && { mdl: L.mdlLoss, anm: L.anmLoss, ply: L.plyLoss }[k];
    if (fn && f.dirty && f.bytes0 && f.bytes0.length && !f.bytes0.equals(f.bytes)) {
      try { fn(f.bytes0, f.bytes, (line, code, msg) => add(rel, code, String(msg).replace(/\s*\[I\]$/, ''), line)); } catch (e) { /* a file the loss check cannot read is reported above */ }
    }
  }
  if (doc.mdl && fileOf(doc, doc.mdl)) {
    for (const r of refsOf(doc).refs) {
      if (r.diskPath) add(doc.mdl, 'REF_DISK_PATH', r.text, r.line);
      else if (!r.inDoc && r.kind !== 'mdl') add(doc.mdl, 'REF_MISSING', r.text, r.line);
    }
  }
  return { findings: out };
}

// ---------- ops ----------
const allNull = doc => { const o = {}; for (const rel of doc.files.keys()) o[rel] = null; return o; };
const modHas = (doc, rel) => !!(doc.mod && rel && fs.existsSync(path.join(doc.mod, ...rel.split('/'))));
const ops = {
  'file.new': {
    check(doc, a) {
      try { const b = blank(a); if (modHas(doc, b.mdl)) return 'A model with that name is already in your mod: ' + b.mdl + '. Pick another name, or open that one.'; } catch (e) { return e.message; }
      return null;
    },
    apply(doc, a) {
      const b = blank(a), files = a && a.keep ? {} : allNull(doc);
      Object.assign(files, b.files);
      return { files, info: { mdl: b.mdl, def: b.def, template: b.template } };
    },
  },
  'file.saveAs': {
    check(doc, a) {
      try { const p = renamePlan(doc, a); const hit = p.files.find(f => modHas(doc, f.rel) && low(f.rel) !== low(f.old)); if (hit) return 'Your mod already has ' + hit.rel + '. Pick another name.'; } catch (e) { return e.message; }
      return null;
    },
    apply(doc, a) {
      const p = renamePlan(doc, a), files = {};
      for (const f of p.files) if (low(f.old) !== low(f.rel)) files[f.old] = null;
      for (const f of p.files) files[f.rel] = f.bytes;
      return { files, info: { mdl: p.mdl, renamed: p.files.map(f => [f.old, f.rel]) } };
    },
  },
  'file.import': {
    check(doc, a) {
      a = a || {};
      const rel = a.rel ? normRel(a.rel) : null, why = relProblem(rel);
      if (why) return why;
      if (!IMPORT_KINDS.has(kindOf(rel))) return 'Only .ply, .vol, .anm and .mtl files can be added to a model.';
      if (!bufOf(a)) return 'There is nothing to add: the file was empty or not read.';
      if (fileOf(doc, rel) && !a.replace) return 'The model already has ' + rel + '. Tick "replace" to put the new file in its place.';
      return null;
    },
    apply(doc, a) {
      const why = ops['file.import'].check(doc, a); if (why) fail(why);
      const rel = normRel(a.rel), k = kindOf(rel), buf = bufOf(a);
      let err = null;
      if (k === 'ply') err = plyLib.parse(buf).error;
      else if (k === 'vol') err = volLib.parse(buf).error;
      else if (k === 'anm') { try { err = anmLib.parse(buf).error; } catch (e) { err = e.message; } }
      if (err) fail('That ' + k + ' file cannot be read (' + err + '); it was not added.');
      const old = fileOf(doc, rel);
      return { files: { [old ? old.rel || rel : rel]: Buffer.from(buf) }, info: { kind: k, rel, ref: doc.mdl ? refName(dirOf(low(doc.mdl)), rel) : rel, replaced: !!old } };
    },
  },
  'file.remove': {
    check(doc, a) {
      const f = fileOf(doc, a && a.rel);
      if (!f) return 'That file is not part of the model.';
      if (low(f.rel || a.rel) === low(doc.mdl)) return 'The .mdl itself cannot be removed; use "New model" to start again.';
      return null;
    },
    apply(doc, a) {
      const why = ops['file.remove'].check(doc, a); if (why) fail(why);
      const f = fileOf(doc, a.rel), rel = f.rel || a.rel;
      const refs = doc.mdl && fileOf(doc, doc.mdl) ? refsOf(doc).refs.filter(r => r.key && low(r.key) === low(rel)).map(r => r.line) : [];
      return { files: { [rel]: null }, info: { rel, refs } };
    },
  },
  'file.revert': {
    check(doc, a) {
      if (a && a.rel) { const f = fileOf(doc, a.rel); if (!f) return 'That file is not part of the model.'; if (!f.dirty) return 'That file has no unsaved changes.'; return null; }
      for (const f of doc.files.values()) if (f.dirty) return null;
      return 'Nothing has changed since the model was opened or saved.';
    },
    apply(doc, a) {
      const why = ops['file.revert'].check(doc, a); if (why) fail(why);
      const list = a && a.rel ? [fileOf(doc, a.rel)] : [...doc.files.values()].filter(f => f.dirty);
      const files = {};
      for (const f of list) files[f.rel] = f.from === 'new' || !f.bytes0 ? null : Buffer.from(f.bytes0);
      return { files, info: { reverted: list.map(f => f.rel) } };
    },
  },
  'file.stamp': {
    check(doc, a) { if (!String((a && a.author) || '').trim()) return 'Type your nickname in the preferences first: the header line names who rebuilt the model.'; return doc.mdl && fileOf(doc, doc.mdl) ? null : 'No model is open.'; },
    apply(doc, a) { const f = mdlOf(doc); return { files: { [f.rel || doc.mdl]: stampHeader(f.bytes, a || {}) } }; },
  },
  'file.fullMatrices': {
    apply(doc) {
      const f = mdlOf(doc), r = fullMatrices(f.bytes);
      return { files: r.done.length ? { [f.rel || doc.mdl]: r.bytes } : {}, info: { done: r.done, skipped: r.skipped } };
    },
  },
  'file.clipPaste': { apply(doc, a) { const f = mdlOf(doc), r = clipPaste(doc, a); return { files: { [f.rel || doc.mdl]: r.bytes }, info: { renamed: r.renamed } }; } },
  'file.clipCut': { apply(doc, a) { const f = mdlOf(doc), r = clipCut(doc, a); return { files: { [f.rel || doc.mdl]: r.bytes }, info: { text: r.text, orphans: r.orphans, names: r.names } }; } },
};

// ---------- states ----------
const b64 = b => Buffer.from(b).toString('base64');
const state = {
  'file.list': doc => {
    let named = new Set();
    try { if (doc.mdl && fileOf(doc, doc.mdl)) named = new Set(refsOf(doc).refs.filter(r => r.key).map(r => low(r.key))); } catch (e) { /* unreadable model: no marks */ }
    const files = [...doc.files.values()].filter(f => f.bytes).map(f => ({ rel: f.rel, kind: f.kind || kindOf(f.rel), from: f.from || 'new', dirty: !!f.dirty, size: f.bytes.length,
      named: low(f.rel) === low(doc.mdl) || named.has(low(f.rel)) }))
      .sort((x, y) => (x.kind === 'mdl' ? -1 : 0) - (y.kind === 'mdl' ? -1 : 0) || (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
    return { mdl: doc.mdl, files, changed: files.filter(f => f.dirty).length };
  },
  'file.text': (doc, q) => {
    q = q || {};
    const f = q.rel ? fileOf(doc, q.rel) : mdlOf(doc);
    if (!f || !f.bytes) fail('That file is not part of the model.');
    const k = f.kind || kindOf(f.rel);
    if (!['mdl', 'def', 'mtl', 'other'].includes(k) || (k === 'other' && !enc.isUtf8(f.bytes))) fail('That file is not text; it has no text view.');
    const text = decodeText(f.bytes);
    let line = 0;
    if (k === 'mdl' && (q.bone || q.volume)) {
      const m = mdlLib.parse(f.bytes);
      if (m.tree) {
        const hit = q.bone ? mdlLib.findBone(m, q.bone) : mdlLib.findVolume(m, q.volume);
        if (hit) line = mdlLib.lineOf(m.tree.src, hit.node.start);
      }
    }
    return { rel: f.rel, kind: k, text, line, lines: text.split(/\r?\n/).length, from: f.from || 'new', dirty: !!f.dirty };
  },
  'file.info': doc => headerInfo(mdlOf(doc).bytes),
  'file.refs': doc => refsOf(doc),
  'file.check': doc => checkDoc(doc),
  'file.copyPlan': (doc, q) => { const p = renamePlan(doc, q); return { mdl: p.mdl, files: p.files.map(f => ({ rel: f.rel, from: f.old, data: b64(f.bytes) })) }; },
  'file.pack': (doc, q) => {
    q = q || {};
    const want = q.rels ? new Set(q.rels.map(low)) : null;
    const files = [...doc.files.values()].filter(f => f.bytes && (!want || want.has(low(f.rel))) && (!q.changed || f.dirty))
      .map(f => ({ rel: f.rel, kind: f.kind || kindOf(f.rel), data: b64(f.bytes) }));
    return { mdl: doc.mdl, files };
  },
  'file.templates': () => Object.keys(TEMPLATES).map(id => ({ id, bones: TEMPLATES[id].bones, volumes: TEMPLATES[id].volumes, note: TEMPLATES[id].note, source: TEMPLATES[id].source })),
  'file.clipCopy': (doc, q) => clipCopy(doc, q),
};

module.exports = { ops, state, normRel, relProblem, refName, resolveRef, blank, renamePlan, stampHeader, headerInfo, fullMatrices, kindOf, TEMPLATES, decodeText, rewriteRefs, checkDoc, refsOf };

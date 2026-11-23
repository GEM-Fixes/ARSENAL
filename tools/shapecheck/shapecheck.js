#!/usr/bin/env node
// shapecheck: does a tool-written SDL file have the same shape as vanilla files of its type? (COV-SHAPE, proof shortcut 3)
//   node tools/shapecheck/shapecheck.js <file> [--type .ext] [--under key/prefix/] (--game G | --ref <dir of loose files>) [--json] [-q]
// shape = every block path (names root→leaf) with the value kinds of its non-block items.
//   name: IDENT → lowercase text; STRING → $s; number → #n; none/block first → {}. .lng names → $k (keys are free ids).
//   kinds: I int, F float, S string, W ident. MOD (mod "x" ...) contents count as the parent's. disabled {#..} skipped.
// vanilla set: every file in <G>/resource/**/*.pak whose key ends with --type (default: file's extension) and starts with --under.
// verdict per path in the file:
//   SHAPE_PATH   path in no vanilla file (error); SHAPE_PARENT same leaf seen only under other parents (error, lists 3)
//   SHAPE_KIND   kinds differ from every vanilla signature even with runs collapsed and int/float merged (error)
//   SHAPE_ARITY  same kinds, but every vanilla file has one fixed count here and this differs (warn, passes)
//   SHAPE_COUNT  same kinds, other counts or int where float (info, passes)
// exit 0 pass, 1 shape errors, 2 usage/no vanilla files. no includes followed (both sides read as written); defines in-file expand.
// Author: Imperator_Aug (ARSENAL, ia-d4dc7a46)
const fs = require('fs'), path = require('path');
const sdlx = require('../lib/sdlx'), sdl = require('../lib/sdl'), enc = require('../lib/enc'), pakset = require('../lib/pakset');

const MAXSIG = 200;
const extOf = n => { const b = n.replace(/\\/g, '/'), i = b.lastIndexOf('.'); return i > b.lastIndexOf('/') ? b.slice(i).toLowerCase() : ''; };
const NUM_I = /^[-+]?(0x[0-9a-f]+|\d+)$/i, NUM_F = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

// → [{ path, sig: [kinds], line }]
function shapeSdl(buf, file) {
  const out = [], r = sdlx.read(buf, { file, key: file, open: () => null, onError() {} });
  const kindOf = t => t.k === 'INTEGER' ? 'I' : t.k === 'FLOAT' ? 'F' : t.k === 'STRING' ? 'S' : 'W';
  const flat = items => { const o = []; for (const it of items) { if (it.k === 'MOD') o.push(...flat(it.items)); else o.push(it); } return o; };
  const walk = (b, p, top) => {
    let items = flat(b.items), name = null;
    if (!top) {
      const f = items[0];
      if (!f || f.k === 'BLOCK') name = '{}';
      else { name = f.k === 'IDENT' ? f.text.toLowerCase() : f.k === 'STRING' ? '$s' : '#n'; items = items.slice(1); }
    }
    const here = top ? '' : p + '/' + name, sig = [];
    for (const it of items) if (it.k !== 'BLOCK') sig.push(kindOf(it));
    if (!top || sig.length) out.push({ path: here || '/', sig, line: b.line || 0 });
    for (const it of items) if (it.k === 'BLOCK' && !it.disabled) walk(it, here, false);
  };
  walk(r.root, '', true);
  return out;
}

function shapeLng(buf) {
  const out = [], { lines } = enc.readText(buf, 'utf8');
  const root = sdl.parseLines(lines, () => {});
  const kind = t => t.t === 's' ? 'S' : NUM_I.test(t.v) ? 'I' : NUM_F.test(t.v) ? 'F' : 'W';
  const walk = (n, p) => {
    for (const k of n.kids) { const here = p + '/$k'; out.push({ path: here, sig: k.vals.map(kind), line: k.line }); walk(k, here); }
  };
  if (root.vals.length) out.push({ path: '/', sig: root.vals.map(kind), line: 0 });
  walk(root, '');
  return out;
}

const shapeOf = (buf, name) => extOf(name) === '.lng' ? shapeLng(buf) : shapeSdl(buf, name);
const collapse = sig => { const o = []; for (const k of sig) { const n = k === 'I' || k === 'F' ? 'N' : k; if (o[o.length - 1] !== n) o.push(n); } return o.join(''); };
const exactOk = (t, v) => t.length === v.length && t.every((k, i) => k === v[i] || (k === 'I' && v[i] === 'F'));

// vanilla db: path → { sigs: Map str→arr, col: Set, files }, leaf → Set(parent)
function addDb(db, shapes) {
  const seen = new Set();
  for (const s of shapes) {
    let e = db.paths.get(s.path);
    if (!e) { e = { sigs: new Map(), col: new Set(), lens: new Set(), files: 0 }; db.paths.set(s.path, e); const i = s.path.lastIndexOf('/'), leaf = s.path.slice(i + 1); (db.leaf.get(leaf) || db.leaf.set(leaf, new Set()).get(leaf)).add(s.path.slice(0, i) || '/'); }
    const k = s.sig.join('');
    if (e.sigs.size < MAXSIG && !e.sigs.has(k)) e.sigs.set(k, s.sig);
    e.col.add(collapse(s.sig)); e.lens.add(s.sig.length);
    if (!seen.has(s.path)) { seen.add(s.path); e.files++; }
  }
}

function vanillaDb(o, type, under) {
  const db = { paths: new Map(), leaf: new Map(), files: 0, bad: 0 };
  const match = k => k.endsWith(type) && (!under || k.startsWith(under));
  if (o.ref) {
    const walk = d => { for (const n of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const p = path.join(d, n.name); if (n.isDirectory()) walk(p);
      else { const k = path.relative(o.ref, p).replace(/\\/g, '/').toLowerCase(); if (match(k)) { try { addDb(db, shapeOf(fs.readFileSync(p), k)); db.files++; } catch (e) { db.bad++; } } } } };
    walk(o.ref);
  } else {
    const ps = pakset.open(path.join(o.game, 'resource'), null);
    try { for (const e of ps.entries) if (match(e.key)) { try { addDb(db, shapeOf(pakset.read(e), e.key)); db.files++; } catch (x) { db.bad++; } } }
    finally { ps.close(); }
  }
  return db;
}

function check(shapes, db) {
  const found = [], done = new Set();
  for (const s of shapes) {
    const key = s.path + '|' + s.sig.join('');
    if (done.has(key)) continue; done.add(key);
    const e = db.paths.get(s.path);
    if (!e) {
      const i = s.path.lastIndexOf('/'), leaf = s.path.slice(i + 1), par = db.leaf.get(leaf);
      if (par && leaf !== '$s' && leaf !== '#n' && leaf !== '{}') found.push({ code: 'SHAPE_PARENT', level: 'error', path: s.path, line: s.line, msg: `'${leaf}' occurs in vanilla only under ${[...par].sort().slice(0, 3).join(', ')}${par.size > 3 ? ` (+${par.size - 3})` : ''}` });
      else found.push({ code: 'SHAPE_PATH', level: 'error', path: s.path, line: s.line, msg: 'path in no vanilla file of this type' });
      continue;
    }
    if ([...e.sigs.values()].some(v => exactOk(s.sig, v))) continue;
    const c = collapse(s.sig);
    if (e.col.has(c) && e.lens.size === 1 && !e.lens.has(s.sig.length)) { found.push({ code: 'SHAPE_ARITY', level: 'warn', path: s.path, line: s.line, msg: `${s.sig.length} values (${s.sig.join('')}); every vanilla file has exactly ${[...e.lens][0]} here` }); continue; }
    if (e.col.has(c)) { found.push({ code: 'SHAPE_COUNT', level: 'info', path: s.path, line: s.line, msg: `values ${s.sig.join('') || '(none)'}: same kinds as vanilla, other count or int/float` }); continue; }
    found.push({ code: 'SHAPE_KIND', level: 'error', path: s.path, line: s.line, msg: `values ${s.sig.join('') || '(none)'} (${c || '-'}); vanilla has ${[...e.col].sort().slice(0, 4).map(x => x || '(none)').join(' | ')}` });
  }
  return found;
}

function main(argv) {
  const o = { file: null, type: null, under: '', game: null, ref: null, json: false, q: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') o.type = argv[++i].toLowerCase(); else if (a === '--under') o.under = argv[++i].toLowerCase().replace(/\\/g, '/');
    else if (a === '--game') o.game = argv[++i]; else if (a === '--ref') o.ref = argv[++i];
    else if (a === '--json') o.json = true; else if (a === '-q') o.q = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'latin1').split('\n').slice(1, 14).join('\n')); return 0; }
    else if (!o.file) o.file = a; else { console.error('unknown arg ' + a); return 2; }
  }
  if (!o.file || (!o.game && !o.ref)) { console.error('usage: shapecheck <file> [--type .ext] [--under prefix/] (--game G | --ref dir) [--json] [-q]'); return 2; }
  const type = o.type || extOf(o.file);
  if (!type && !o.under) { console.error('file has no extension: give --type or --under'); return 2; }
  let buf;
  try { buf = fs.readFileSync(o.file); } catch (e) {
    const f = { level: 'error', code: 'SHAPE_FILE_UNREADABLE', path: o.file, line: 0, msg: `cannot read input file (${e.code || e.message})` };
    if (o.json) console.log(JSON.stringify({ file: o.file, type, under: o.under, errors: 1, findings: [f], result: 'FAIL' }, null, 1));
    else console.log(`ERROR ${f.code} ${f.path}: ${f.msg}\nFAIL ${path.basename(o.file)}: input unreadable`);
    return 1;
  }
  const shapes = shapeOf(buf, o.file.endsWith('.lng') ? 'x.lng' : o.file);
  const db = vanillaDb(o, type, o.under);
  if (!db.files) { console.error(`no vanilla files of type '${type}'${o.under ? ` under ${o.under}` : ''}`); return 2; }
  const found = check(shapes, db), errs = found.filter(f => f.level === 'error').length;
  const res = { file: o.file, type, under: o.under, vanillaFiles: db.files, vanillaUnreadable: db.bad, vanillaPaths: db.paths.size, paths: new Set(shapes.map(s => s.path)).size, errors: errs, findings: found, result: errs ? 'FAIL' : 'PASS' };
  if (o.json) console.log(JSON.stringify(res, null, 1));
  else {
    if (!o.q) for (const f of found) console.log(`${f.level === 'error' ? 'ERROR' : f.level === 'warn' ? 'WARN ' : 'info '} ${f.code} ${f.path} (line ${f.line}): ${f.msg}`);
    console.log(`${res.result} ${path.basename(o.file)}: ${res.paths} paths, ${errs} errors, ${found.filter(f => f.level === 'warn').length} warn, ${found.filter(f => f.level === 'info').length} info; vanilla ${type || '*'}${o.under ? ' under ' + o.under : ''}: ${db.files} files${db.bad ? ` (${db.bad} unreadable)` : ''}, ${db.paths.size} paths`);
  }
  return errs ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { shapeOf, shapeSdl, shapeLng, vanillaDb, check, collapse, main };

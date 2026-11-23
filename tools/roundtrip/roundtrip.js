#!/usr/bin/env node
// roundtrip: parse -> write -> parse again -> compare, for every SDL text type the tools write. RT kind of PLAN.
//   node tools/roundtrip/roundtrip.js <file|dir> [--type .def,.set,...] [-q] [-o summary.json]
//   node tools/roundtrip/roundtrip.js --vfs --game <dir> [--exe as64|mowas_2|goh] [--mods a,b] [--type ...] [-q] [-o summary.json]     (whole vfs, read only)
//   --exe: the vfs view of that game (lib/games; mowas_2 = no as64/core; goh with no --game = the GoH install); none = as before (vfs picks)
// per file: equal | differs <kind> <first path> | fail <kind>. -q prints only the non-equal files. exit 0 = all equal, 1 = else.
// default types: .def .set .mi .mdl .ext .inc .mtl .lng .info .mod (the types clone-entity / patch-entity / goh2as2 / gen write)
// parsers: lib/sdl.js (tokens + block tree, text decoded cp1251) and lib/sdlwrite.js (byte-exact splice editor, the writer).
// checks per file (trees are compared structurally, never bytes, except check 1 and 2):
//   fail     sdl.js reports STR_NEWLINE | BRACES, or a parser throws (UTF-16/32 BOM) -> the file stops there (kind = code)
//   bytes    sdlwrite.parse + serialize with no edit must be byte-equal (CRLF, cp1251 bytes, BOM kept)         kind 'bytes'
//   ident    setValue(leaf, same text) on an even sample (<= 2000) of the atom/string/stray leaves -> serialize: bytes equal + both trees equal   kind 'ident-bytes' | 'ident-tree'
//   move     removeNode(first top-level block) + insertChild(root, 0, its text) -> reparse: both trees equal  kind 'move-tree'
// summary (JSON): { total, equal, differs, fail, types: { '.def': { files, equal, differs, fail } }, kinds: { kind: { count, sample } } }
//   no time, no machine path: same input twice = same summary. sample = first path (sorted order) of that kind.
// Author: Imperator_Aug (ARSENAL, ia-f2e942f6)
require('../lib/help')(__filename, [ // --help / -h: usage, exit 0
  'ARSENAL roundtrip: parse, write, parse again and compare SDL text files (read only).',
  'usage: ARSENAL roundtrip <file|dir> [--type .def,.set,...] [-q] [-o summary.json]',
  '       ARSENAL roundtrip --vfs --game <dir> [--exe as64|mowas_2|goh] [--mods a,b] [--type ...] [-q] [-o summary.json]',
  'example: ARSENAL roundtrip mymod/resource -q',
  'exit: 0 all equal, 1 not, 2 usage.',
].join('\n'));
const fs = require('fs'), path = require('path');
const sdl = require('../lib/sdl'), sw = require('../lib/sdlwrite'), { readText } = require('../lib/enc'), cli = require('../lib/cli');

const DEFAULT_TYPES = ['.def', '.set', '.mi', '.mdl', '.ext', '.inc', '.mtl', '.lng', '.info', '.mod'];
const MAX_LEAVES = 2000;
const FAIL_CODES = new Set(['STR_NEWLINE', 'BRACES']);

// ---- structural signatures (no positions)
function sigSdl(root) {            // sdl.js tree -> [path, text] flat list
  const out = [];
  (function walk(n, p) {
    out.push([p + '{' + (n.name ?? '') + '}', n.vals.map(v => v.t + ':' + v.v).join('\u0001')]);
    n.kids.forEach((k, i) => walk(k, p + '/' + i));
  })(root, '');
  return out;
}
function sigWrite(root) {          // sdlwrite tree -> same shape
  const out = [];
  (function walk(n, p) {
    out.push([p + '{' + n.type + ':' + (n.name || '') + '}', (n.tag || '') + '|' + n.items.filter(k => !k.items).map(k => k.type + ':' + k.text).join('\u0001')]);
    n.items.filter(k => k.items).forEach((k, i) => walk(k, p + '/' + i));
  })(root, '');
  return out;
}
function firstDiff(a, b) {         // -> path of the first differing entry | null
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (!a[i]) return b[i][0] + ' (extra)';
    if (!b[i]) return a[i][0] + ' (missing)';
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return a[i][0];
  }
  return null;
}

function parseSdl(buf) {           // -> { root } | { fail: code }
  const r = readText(buf, 'cp1251');
  if (r.fatal) return { fail: 'BOM_UTF16_32' };
  let bad = null;
  const root = sdl.parseLines(r.lines, (line, code) => { if (FAIL_CODES.has(code) && !bad) bad = code; });
  return bad ? { fail: bad } : { root };
}
const leaves = root => { const a = []; (function w(n) { for (const k of n.items) { if (k.items) w(k); else a.push(k); } })(root); return a; };

// -> { status:'equal' } | { status:'differs', kind, path } | { status:'fail', kind }
function check(buf) {
  const a = parseSdl(buf);
  if (a.fail) return { status: 'fail', kind: a.fail };
  let t;
  try { t = sw.parse(buf); } catch (e) { return { status: 'fail', kind: 'THROW ' + String(e.message).split(/[:;(]/)[0].trim() }; }
  const sigA = sigSdl(a.root), sigW = sigWrite(t.root);
  // 1 no-edit serialize
  if (!sw.serialize(t).equals(buf)) return { status: 'differs', kind: 'bytes', path: firstByte(sw.serialize(t), buf) };
  const again = (out, kind, needBytes) => {
    if (needBytes && !out.equals(buf)) return { status: 'differs', kind: kind.replace('tree', 'bytes'), path: firstByte(out, buf) };
    const b = parseSdl(out);
    if (b.fail) return { status: 'differs', kind, path: 'reparse ' + b.fail };
    let d = firstDiff(sigA, sigSdl(b.root));
    if (d) return { status: 'differs', kind, path: 'sdl ' + d };
    let t2; try { t2 = sw.parse(out); } catch (e) { return { status: 'differs', kind, path: 'sdlwrite throws' }; }
    d = firstDiff(sigW, sigWrite(t2.root));
    return d ? { status: 'differs', kind, path: 'sdlwrite ' + d } : null;
  };
  // 2 identity edit of every leaf
  // sdlwrite.put() scans all splices per edit (quadratic): a file with 50k leaves never ends. Edit an even sample of at most MAX_LEAVES.
  const lv = leaves(t.root), step = Math.max(1, Math.ceil(lv.length / MAX_LEAVES));
  for (let i = 0; i < lv.length; i += step) sw.setValue(lv[i], lv[i].text);
  let r = again(sw.serialize(t), 'ident-tree', true);
  if (r) return r;
  // 3 move the first top-level block: remove + insert at 0
  const t3 = sw.parse(buf), first = t3.root.items.find(k => k.items);
  if (first) {
    const text = t3.src.slice(first.start, first.end);
    sw.removeNode(first); sw.insertChild(t3.root, t3.root.items.indexOf(first), text);
    r = again(sw.serialize(t3), 'move-tree', false);
    if (r) return r;
  }
  return { status: 'equal' };
}
function firstByte(x, y) { const n = Math.min(x.length, y.length); let i = 0; while (i < n && x[i] === y[i]) i++; return 'byte ' + i; }

// ---- run over items [{ key, get() -> Buffer }]
function run(items, types) {
  const sum = { total: 0, equal: 0, differs: 0, fail: 0, types: {}, kinds: {} };
  const lines = [];
  items.sort((x, y) => x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
  for (const it of items) {
    const ext = path.extname(it.key).toLowerCase();
    if (!types.has(ext)) continue;
    let res;
    try { res = check(it.get()); } catch (e) { res = { status: 'fail', kind: 'CRASH ' + String(e.message).slice(0, 40) }; }
    const ty = sum.types[ext] || (sum.types[ext] = { files: 0, equal: 0, differs: 0, fail: 0 });
    sum.total++; ty.files++; sum[res.status]++; ty[res.status]++;
    if (res.status !== 'equal') {
      const k = res.status + ' ' + res.kind, e = sum.kinds[k] || (sum.kinds[k] = { count: 0, sample: it.key + (res.path ? ' @ ' + res.path : '') });
      e.count++;
    }
    lines.push({ key: it.key, res });
  }
  const sortObj = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  sum.types = sortObj(sum.types); sum.kinds = sortObj(sum.kinds);
  return { sum, lines };
}

function fileItems(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [{ key: path.basename(p), get: () => fs.readFileSync(p) }];
  const out = [];
  (function walk(d, rel) {
    for (const n of fs.readdirSync(d).sort()) {
      const f = path.join(d, n), r = rel ? rel + '/' + n : n;
      if (fs.statSync(f).isDirectory()) walk(f, r); else out.push({ key: r, get: () => fs.readFileSync(f) });
    }
  })(p, '');
  return out;
}

function main(argv) {
  const o = cli.parse(argv, { flags: ['--vfs'], values: ['--type', '--exe'] });
  const games = require('../lib/games');
  if (o.x.exe && !games.get(o.x.exe)) { console.error('roundtrip: --exe ' + o.x.exe + ': as64, mowas_2 (mowas2) or goh'); process.exit(2); }
  if (o.x.exe && o.x.vfs && !o.gameDir) o.gameDir = games.install(o.x.exe).dir || undefined;
  const types = new Set((o.x.type ? o.x.type.split(',') : DEFAULT_TYPES).map(s => s.trim().toLowerCase()).map(s => s.startsWith('.') ? s : '.' + s).filter(s => s.length > 1));
  let items, closer = () => {};
  if (o.x.vfs) {
    if (!o.gameDir) throw new Error('--vfs needs --game <dir>');
    const vfs = require('../lib/vfs'), v = vfs.build({ gameDir: o.gameDir, mods: o.mods, exe: games.exeOf(o.x.exe) || undefined });
    items = [...v.files].map(([key, rec]) => ({ key, get: () => vfs.readRec(rec) })).filter(i => types.has(path.extname(i.key).toLowerCase()) && (i.key.endsWith('.lng') || require('../lib/sdlset').isSdl(i.key)));   // isSdl: shader .inc = HLSL, skipped
    closer = vfs.closeRecs;
  } else {
    if (!o.pos.length) throw new Error('usage: roundtrip <file|dir> [--type .def,.set] [-q] [-o summary.json] | --vfs --game <dir>');
    items = fileItems(o.pos[0]);
  }
  const { sum, lines } = run(items, types);
  closer();
  if (o.output) fs.writeFileSync(o.output, JSON.stringify(sum, null, 2) + '\n');
  for (const l of lines) {
    if (l.res.status === 'equal') { if (!o.q) console.log('equal   ' + l.key); }
    else if (l.res.status === 'differs') console.log(`differs ${l.key} ${l.res.kind} @ ${l.res.path}`);
    else console.log(`fail    ${l.key} ${l.res.kind}`);
  }
  console.log(JSON.stringify(sum));
  process.exitCode = sum.differs || sum.fail ? 1 : 0;
}

if (require.main === module) cli.run(() => main(process.argv.slice(2)));
module.exports = { check, run, DEFAULT_TYPES };

#!/usr/bin/env node
// portdiff: GoH vs AS2 text-asset diff (seeds PORT rows for a GoH->AS2 converter). both game dirs read-only.
//   node portdiff.js --as2 <gameDir> --goh <gameDir> [--kinds a,b] [--sample N] [--min N] [--top N] [--json out] [--no-cache] [-q]
//   gameDir: <dir>/resource is walked (every *.pak via lib/pakset + loose files); a dir without resource/ is used as-is.
//   kind = keylint model.kindOf (def ext mdl mtl inc mi, set/<dir>.set, set/stuff.ammo ...). --kinds filters by kind, ext or substring.
//   tally = keylint learn.visit per root file (included fragments skipped), parsed with lib/sdlx (includes resolved inside that game).
//   --sample N: per extension N files spread evenly (deterministic). --min: key must occur >= N times to be listed (default 3).
//   cache: <per-user cache>/portdiff/<tag>-<hash>.json (lib/toolcache) keyed on pak sizes/mtimes + options.
// per-file checks (checks.js; GoH + AS2 files): WARN_PORT_HARDNESS_NO_ENGINE (PORT-01) WARN_PORT_ARMOR_HEALTH_CUSTOM (PORT-03) WARN_PORT_ARMOR_MACRO_OVERRIDES_THICKNESS (PORT-05)  WARN_PORT_OVERMATCH_CALIBRE (PORT-02)
//   WARN_PORT_PEN_TAG_NO_EXACT (PORT-07, GoH pen-table tag words vs AS2 set/stuff tag vocabulary) WARN_PORT_BONE_SPEED_UNITS (PORT-10); each capped by --top
// codes (all WARN_ = unverified diff hints; ext list is info-grade): PORT_KEY_GOH_ONLY PORT_KEY_AS2_ONLY PORT_SHAPE_DIFF PORT_STRUCT_DIFF
//   PORT_EXT_GOH_ONLY PORT_PARSE_FAIL
// Author: Imperator_Aug (ARSENAL, ia-81b85edc)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const pakset = require('../lib/pakset'), sdlx = require('../lib/sdlx');
const { fixHashTags } = require('../goh2as2/goh2as2');   // PORT-32 {##x -> {x, GoH files only
const CK = require('./checks');
const learn = require('../keylint/learn'), M = require('../keylint/model');

const SDL_EXT = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy']);
const IGNORE = new Set(['INCLUDE_MISSING', 'MACRO_UNDEFINED', 'UNREPLACED_PARAM', 'INCLUDE_CYCLE', 'ARITH_BAD', 'MOD_NAME', 'INT_RANGE']);   // MOD_NAME/INT_RANGE: GoH has its own mod names and >int32 literals (settings.set); not syntax
const extOf = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1); };

// -> { entries: Map name -> {name, size, path?|rec}, close() }; ext counts over everything
function collect(gameDir) {
  const root = fs.existsSync(path.join(gameDir, 'resource')) ? path.join(gameDir, 'resource') : gameDir;
  const ps = pakset.open(root, null), entries = new Map(), sig = [];
  for (const e of ps.entries) entries.set(e.key, { ...e, name: e.key });   // pak-dir rooted (PORT-34)
  for (const f of fs.readdirSync(root, { recursive: true })) {
    const p = path.join(root, f);
    let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (!st.isFile() || /\.pak$/i.test(p)) continue;
    const name = f.replace(/\\/g, '/').toLowerCase();
    entries.set(name, { name, size: st.size, path: p });
  }
  return { root, entries, ps, sig: sig.sort().join('|'), errors: ps.errors, close: () => ps.close() };
}
const readEnt = e => e.path ? fs.readFileSync(e.path) : pakset.read(e);

function tallyGame(gameDir, o, log, isGoh) {
  const fix = isGoh ? (b => b.includes("{##") ? Buffer.from(CK.stripDisabledBlocks(fixHashTags(b.toString("latin1"))), "latin1") : b) : (b => b);
  const t0 = Date.now(), c = collect(gameDir);
  const extCounts = {}, extEx = {};
  for (const e of c.entries.values()) { const x = extOf(e.name); extCounts[x] = (extCounts[x] || 0) + 1; if (!extEx[x]) extEx[x] = e.name; }
  const hash = crypto.createHash('md5').update((isGoh ? 'k6h|' : 'k4|') + c.sig + '|' + (o.sample || 0) + '|' + (o.kinds || []).join(',')).digest('hex').slice(0, 8);
  const cf = require('../lib/toolcache').file('portdiff', path.basename(path.resolve(gameDir)).replace(/\W+/g, '_').slice(0, 24) + '-' + hash + '.json', path.join(__dirname, 'cache'));   // per-user cache; an old file in tools/portdiff/cache is copied over
  if (!o.noCache && fs.existsSync(cf)) { c.close(); const j = JSON.parse(fs.readFileSync(cf, 'utf8')); j.cached = true; j.ms = Date.now() - t0; return j; }
  let list = [...c.entries.values()].filter(e => SDL_EXT.has(extOf(e.name)));
  const kindOk = k => !o.kinds || o.kinds.some(x => k === x || k.endsWith('.' + x) || k.includes(x));
  list = list.filter(e => !e.name.startsWith('shader/') && kindOk(M.kindOf('resource/' + e.name)));
  if (o.sample) list = e2(list, o.sample);
  const included = new Set(), reads = [], parseFail = [], ex = new Map(), ports = [], pcount = {}, penTags = [], vocab = new Set();
  const addPort = (file, f) => { pcount[f.code] = (pcount[f.code] || 0) + 1; if (pcount[f.code] <= 400) ports.push({ file, ln: f.ln, code: f.code, msg: f.msg }); };
  const open = (r) => {
    included.add(r.key);
    if (r.kind !== 'virtual') return null;
    const e = c.entries.get(r.key.replace(/^resource\//, ''));
    return e ? { buf: fix(readEnt(e)), file: r.key, key: r.key } : null;
  };
  let crashes = 0;
  for (const e of list) {
    const key = 'resource/' + e.name;
    try {
      const b = fix(readEnt(e));
      if (b.includes(0) && !(b[0] === 0xFF || b[0] === 0xFE)) continue;
      const bad = [];
      const pre = (key.startsWith('resource/set/stuff/') && !key.endsWith('/.presets') && extOf(key) !== 'fsm' && c.entries.has(key.slice(9, key.lastIndexOf('/') + 1) + '.presets')) ? [key.slice(0, key.lastIndexOf('/') + 1) + '.presets'] : [];
      const r = sdlx.read(b, { file: key, key, open, preInclude: pre, onError: (f, ln, code) => { if (!IGNORE.has(code) && f === key) bad.push({ ln, code }); } });
      if (bad.length) parseFail.push({ file: e.name, line: bad[0].ln, code: bad[0].code, n: bad.length });
      const stats = new Map();
      for (const f of CK.textChecks(b.toString('latin1'), isGoh)) addPort(e.name, f);
      const tc = CK.treeChecks(r.root, key);
      for (const f of tc.res) addPort(e.name, f);
      if (isGoh) for (const q of tc.pen) penTags.push({ file: e.name, ln: q.ln, tags: q.tags });
      else if (key.startsWith('resource/set/stuff/')) CK.vocabOf(key, r.root, vocab);
      learn.visit(r.root, '', M.kindOf(key), stats, true, 0);
      reads.push({ key, stats });
    } catch (err) { crashes++; parseFail.push({ file: e.name, line: 0, code: 'CRASH', n: 1 }); }
  }
  const all = new Map();
  let used = 0;
  for (const r of reads) {
    if (included.has(r.key)) continue;
    used++; learn.mergeInto(all, r.stats);
    for (const [pk, ps] of r.stats) for (const k of ps.k.keys()) { const id = pk + '/' + k; if (!ex.has(id)) ex.set(id, r.key.slice(9)); }
  }
  const kinds = {};
  for (const [pk, ps] of all) {
    const i = pk.indexOf('|'), kind = pk.slice(0, i), p = pk.slice(i + 1), ks = {};
    for (const [key, k] of ps.k) {
      const s = {}; for (const [x, n] of [...k.s].sort((a, b) => b[1] - a[1]).slice(0, 8)) s[x] = n;
      ks[key] = { n: k.n, s, kids: k.kids, e: ex.get(pk + '/' + key) };
    }
    (kinds[kind] || (kinds[kind] = {}))[p] = { n: ps.n, k: ks };
  }
  c.close();
  const out = { v: 1, kinds, extCounts, extEx, files: used, fragments: reads.length - used, sampled: list.length, parseFail, crashes, ports, pcount, penTags: penTags.slice(0, 5000), vocab: [...vocab], ms: Date.now() - t0 };
  if (!o.noCache) require('../lib/cachewrite').write(cf, JSON.stringify(out));   // read-only folder: one stderr line, run goes on
  return out;
}
const e2 = (list, n) => pakset.sample(list, n);

const flat = tl => {   // kind -> Map "path/key" -> {n, s, kids, e}
  const m = {};
  for (const [kind, ps] of Object.entries(tl.kinds)) {
    const mm = m[kind] = new Map();
    for (const [p, b] of Object.entries(ps)) for (const [k, v] of Object.entries(b.k)) mm.set(p ? p + ' > ' + k : k, v);
  }
  return m;
};
// block-ness: >50% of occurrences carry a child block
const isBlock = v => v.kids * 2 > v.n, isScalar = v => v.kids * 20 < v.n;

function diff(as2, goh, o) {
  const A = flat(as2), G = flat(goh), min = o.min, res = {};
  for (const kind of new Set([...Object.keys(A), ...Object.keys(G)])) {
    const a = A[kind] || new Map(), g = G[kind] || new Map();
    const r = res[kind] = { gohOnly: [], as2Only: [], shape: [], struct: [], gohKeys: g.size, as2Keys: a.size };
    for (const [k, v] of g) {
      const w = a.get(k);
      if (!w) { if (v.n >= min) r.gohOnly.push({ key: k, n: v.n, e: v.e }); continue; }
      if (v.n < min || w.n < min) continue;
      if ((isBlock(v) && isScalar(w)) || (isScalar(v) && isBlock(w))) { r.struct.push({ key: k, goh: isBlock(v) ? 'block' : 'scalar', as2: isBlock(w) ? 'block' : 'scalar', n: v.n, e: v.e }); continue; }
      const sa = Object.keys(w.s), top = Object.entries(v.s).sort((x, y) => y[1] - x[1])[0];
      if (top && !(top[0] in w.s) && v.s && Object.keys(v.s).length) {
        const stripN = s => s.replace(/[IFX]/g, 'N');   // I/F/X (arith expr) interchangeable in a numeric position
        if (!sa.some(x => stripN(x) === stripN(top[0]))) r.shape.push({ key: k, goh: top[0], as2: sa.slice(0, 3).join(','), n: v.n, e: v.e });
      }
    }
    for (const [k, v] of a) if (!g.has(k) && v.n >= min) r.as2Only.push({ key: k, n: v.n, e: v.e });
    for (const f of ['gohOnly', 'as2Only', 'shape', 'struct']) r[f].sort((x, y) => y.n - x.n);
  }
  return res;
}

function main() {
  const a = process.argv.slice(2), o = { min: 3, top: 25 };
  const val = i => { if (i + 1 >= a.length) { console.error(a[i] + ' needs a value'); process.exit(2); } return a[i + 1]; };
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '--as2') o.as2 = val(i++); else if (x === '--goh') o.goh = val(i++);
    else if (x === '--kinds') o.kinds = val(i++).split(',').map(s => s.trim().replace(/^\./, '')).filter(Boolean);
    else if (x === '--sample') o.sample = Math.max(1, parseInt(val(i++), 10) || 1);
    else if (x === '--min') o.min = Math.max(1, parseInt(val(i++), 10) || 1);
    else if (x === '--top') o.top = Math.max(1, parseInt(val(i++), 10) || 1);
    else if (x === '--json') o.json = val(i++); else if (x === '--no-cache') o.noCache = true; else if (x === '-q') o.q = true;
    else { console.error('unknown arg ' + x); process.exit(2); }
  }
  if (!o.as2 || !o.goh) { console.error('usage: portdiff --as2 dir --goh dir [--kinds a,b] [--sample N] [--min N] [--top N] [--json out] [--no-cache] [-q]'); process.exit(2); }
  const A = tallyGame(o.as2, o), G = tallyGame(o.goh, o, null, true);
  const d = diff(A, G, o), lines = [];
  let n = 0;
  const emit = (e, code, msg) => { n++; lines.push(`${e || '-'}: ${code} ${msg}`); };
  const extOnly = Object.keys(G.extCounts).filter(x => !(x in A.extCounts)).sort((x, y) => G.extCounts[y] - G.extCounts[x]);
  const extBoth = Object.keys(G.extCounts).filter(x => x in A.extCounts).sort((x, y) => G.extCounts[y] - G.extCounts[x]);
  if (!o.kinds) {
    lines.push('== file extensions: GoH-only');
    for (const x of extOnly) emit(G.extEx[x], 'PORT_EXT_GOH_ONLY', `.${x || '(none)'} x${G.extCounts[x]}`);
    lines.push('== file extensions: both (AS2 count / GoH count)');
    if (!o.q) for (const x of extBoth.slice(0, 15)) lines.push(`  .${x || '(none)'} ${A.extCounts[x]} / ${G.extCounts[x]}`);
  }
  for (const [kind, r] of Object.entries(d).sort()) {
    lines.push(`== kind ${kind}: keys AS2 ${r.as2Keys} GoH ${r.gohKeys}; GoH-only ${r.gohOnly.length} AS2-only ${r.as2Only.length} shape ${r.shape.length} struct ${r.struct.length}`);
    for (const x of r.gohOnly.slice(0, o.top)) emit(x.e, 'WARN_PORT_KEY_GOH_ONLY', `${kind} ${x.key} n=${x.n}`);
    for (const x of r.as2Only.slice(0, o.top)) emit(x.e, 'WARN_PORT_KEY_AS2_ONLY', `${kind} ${x.key} n=${x.n}`);
    for (const x of r.shape.slice(0, o.top)) emit(x.e, 'WARN_PORT_SHAPE_DIFF', `${kind} ${x.key} GoH ${x.goh} vs AS2 ${x.as2} n=${x.n}`);
    for (const x of r.struct.slice(0, o.top)) emit(x.e, 'WARN_PORT_STRUCT_DIFF', `${kind} ${x.key} GoH ${x.goh} vs AS2 ${x.as2} n=${x.n}`);
  }
  for (const [tag, T] of [['AS2', A], ['GoH', G]]) {
    const by = {};
    for (const f of T.ports || []) (by[f.code] || (by[f.code] = [])).push(f);
    for (const [code, fl] of Object.entries(by).sort()) {
      lines.push(`== ${tag} ${code}: ${T.pcount[code]} files/hits`);
      for (const f of fl.slice(0, o.top)) emit(f.file, code, `${tag} line ${f.ln}: ${f.msg}`);
    }
  }
  {
    const pt = CK.penTagDiff(G.penTags || [], A.vocab || []);
    lines.push(`== pen-table tags GoH-only: ${pt.length}`);
    for (const x of pt.slice(0, o.top)) emit(x.e, 'WARN_PORT_PEN_TAG_NO_EXACT', `GoH pen-table tag "${x.tag}" has no exact AS2 ammo tag${x.near ? ' (near: ' + x.near + ' - apc != apcbc)' : ''} n=${x.n} (PORT-07)`);
  }
  for (const [tag, T] of [['AS2', A], ['GoH', G]]) {
    const pf = T.parseFail;
    if (!o.q) lines.push(`== ${tag}: ${T.files} root files parsed (${T.fragments} fragments), ${pf.length} parse failures, ${T.ms} ms${T.cached ? ' (cache)' : ''}`);
    const bc = {}; for (const f of pf) bc[f.code] = (bc[f.code] || 0) + 1;
    if (!o.q) lines.push('  parse failures by code: ' + JSON.stringify(bc));
    for (const f of pf.slice(0, 10)) {
      if (f.code === 'INVALID_CHAR' && /.info$/.test(f.file)) { lines.push(`  info ${f.file}: template placeholders (<..>), malformed by design`); continue; }
      emit(f.file, 'WARN_PORT_PARSE_FAIL', `${tag} ${f.code} line ${f.line} (${f.n} errors)`);
    }
  }
  console.log(lines.join('\n'));
  console.log(n + ' findings');
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ tool: 'portdiff', ext: { goh: G.extCounts, as2: A.extCounts }, extOnlyGoh: extOnly, diff: d, parseFail: { as2: A.parseFail.length, goh: G.parseFail.length }, files: { as2: A.files, goh: G.files }, ms: { as2: A.ms, goh: G.ms } }, null, 1));
}
if (require.main === module) main();
module.exports = { tallyGame, diff, flat };

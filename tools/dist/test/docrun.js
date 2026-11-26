// T-DOCRUN: every `ARSENAL ...` command in tools/START-HERE.md and in the front-door section of guide/19-toolchain.md runs on the
// UNZIPPED release (tools/dist/zip.js -> zip -> unzip into a fresh scratch folder -> the unzipped ARSENAL.exe), against a fixture game
// folder (empty as64.exe + mods/, never the real install). The docs are read from the unzipped copies too.
// Commands that would start the game (`play` without --dry) run in their --dry form. Nothing is published or uploaded.
// GOLD: docrun.golden.txt = doc, line, command, expected exit code, first output line. A change fails until updated:
//   node tools/dist/test/docrun.js --update-gold "why"
// usage: node tools/dist/test/docrun.js [--scratch dir] [--keep] [--update-gold why] [--table]
//   --scratch: where to build/unzip/run (default: tools/dist/test/work-docrun, removed at the end unless --keep)
//   --table: print the doc | line | exit | ok table (markdown) after the run
// Author: Imperator_Aug (ARSENAL, ia-ec6c3f14)
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), { spawnSync } = require('child_process'), Wt = require('../../lib/test/wait');
const ZIP = path.join(__dirname, '..', 'zip.js'), GOLD = path.join(__dirname, 'docrun.golden.txt');
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
// default scratch is NOT the OS temp dir: that sits under the user profile, the build bakes its path into the exe, and the zip.js gate
// (rightly) refuses an exe holding C:\Users\<name>. work-docrun beside this file (like zip-test's work-zip), removed at the end.
const root = opt('--scratch') ? path.resolve(opt('--scratch')) : path.join(__dirname, 'work-docrun');
fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
const fwd = s => s.replace(/\\/g, '/');
let fails = 0;
const fail = m => { fails++; console.log('FAIL: ' + m); };

// ---- 1 build the zip locally, unzip it into a fresh folder
const outDir = path.join(root, 'zipout'), rel = path.join(root, 'release');
// sidecars (zip.js SIDECARS) come from the local build output as in a real release; gemindex only once its bundle is complete
// (a manifest file in it), so a half-written folder from a running `gemindex bundle` does not make this test flaky
const gi = path.join(__dirname, '..', 'out', 'gemindex');
const giDone = (() => { try { return fs.readdirSync(gi).some(n => /manifest/i.test(n)); } catch (e) { return false; } })();
const ww = path.join(__dirname, '..', 'out', 'ww2sources'), wwDone = fs.existsSync(path.join(ww, 'ww2sources.json'));   // the same for ww2sources (its manifest is written last)
const b = spawnSync(process.execPath, [ZIP, '--out-dir', outDir, ...(giDone ? [] : ['--no-gemindex']), ...(wwDone ? [] : ['--no-ww2sources'])], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (b.status !== 0) { console.log((b.stdout || '').split('\n').slice(-12).join('\n') + (b.stderr || '')); console.log('FAIL: zip.js rc ' + b.status); process.exit(1); }
const zipFile = path.join(outDir, 'ARSENAL-' + require('../sea.js').buildVersion() + '.zip');
function unzip(f, dest) {
  const buf = fs.readFileSync(f), e = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])), n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8'), cs = buf.readUInt32LE(p + 20);
    const lo = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = zlib.inflateRawSync(buf.slice(lo, lo + cs));
    if (zlib.crc32(data) !== buf.readUInt32LE(p + 16)) throw new Error('crc ' + name);
    const out = path.join(dest, name); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, data);
    p += 46 + nl + xl + cl;
  }
}
unzip(zipFile, rel);
const top = path.join(rel, 'ARSENAL-' + require('../sea.js').buildVersion()), exe = path.join(top, 'ARSENAL.exe');
if (!fs.existsSync(exe)) { console.log('FAIL: no ARSENAL.exe in the unzipped release'); process.exit(1); }

// ---- 2 extract the ARSENAL lines
const DOCS = [
  { name: 'START-HERE.md', file: path.join(top, 'START-HERE.md'), from: /^# /, to: null },
  { name: '19-toolchain.md', file: path.join(top, 'guide', '19-toolchain.md'), from: /^## The front-door commands/, to: /^### `ARSENAL-gui`/ },
];
const RUNNABLE_BARE = /^ARSENAL (help|advanced|--all|game)$/;
// returns { cmds: [{doc, line, text}], skipped: [{doc, line, text, why}], fences: {first line: text} }
function extract(d) {
  const lines = fs.readFileSync(d.file, 'utf8').split(/\r?\n/), cmds = [], skipped = [], fences = [];
  let on = !d.from || false, fence = null;
  lines.forEach((ln, i) => {
    if (!on && d.from.test(ln)) on = true;
    if (on && d.to && d.to.test(ln)) on = false;
    if (!on) return;
    if (/^```/.test(ln)) { if (fence) { fences.push(fence.join('\n')); fence = null; } else fence = []; return; }
    if (fence) { fence.push(ln); if (/^ARSENAL /.test(ln.trim())) cmds.push({ doc: d.name, line: i + 1, text: ln.trim() }); return; }
    for (const m of ln.matchAll(/`(ARSENAL [^`]*)`/g)) {
      const t = m[1].trim(), words = t.split(/\s+/).length;
      if (RUNNABLE_BARE.test(t) || words >= 3) {
        if (/ --out$/.test(t)) skipped.push({ doc: d.name, line: i + 1, text: t, why: 'fragment (flag without value)' });
        else cmds.push({ doc: d.name, line: i + 1, text: t });
      } else skipped.push({ doc: d.name, line: i + 1, text: t, why: 'a command name in prose, not a command line' });
    }
  });
  const seen = new Set(); // one command twice on one line (a table cell and its prose) runs once
  return { cmds: cmds.filter(c => { const k = c.line + c.text; if (seen.has(k)) return false; seen.add(k); return true; }), skipped, fences };
}

// ---- 3 fixtures: fake game folder, old mod, spec files (from the docs' own yaml blocks)
function fixture(dir, fences) {
  const w = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
  const G = path.join(dir, 'game');
  w(path.join(G, 'as64.exe'), ''); fs.mkdirSync(path.join(G, 'mods'), { recursive: true });
  w(path.join(dir, 'oldmod', 'mod.info'), '{Mod\r\n\t{Name "oldmod"}\r\n\t{MinGameVersion "3.200"}\r\n}\r\n');
  w(path.join(dir, 'oldmod', 'resource', 'readme.txt'), 'old');
  const y = n => fences.find(f => new RegExp('^name: ' + n + '\\b').test(f));
  const sample = spawnSync(exe, ['gen', '--sample'], { encoding: 'utf8', cwd: dir }).stdout || '';
  w(path.join(dir, 'spec.yaml'), sample);
  if (y('demo')) w(path.join(dir, 'demo.yaml'), y('demo') + '\n');
  if (y('newtank')) w(path.join(dir, 'newtank.yaml'), y('newtank') + '\n');
  return G;
}
// tokens: a doc command -> argv for the exe. Returns { args, redirect, note }
function prepare(text, G) {
  let t = text;
  const sub = [['<game folder>', fwd(G)], ['<new mod folder>', 'genout'], ['<patch folder>', 'patchout'], ['<mod folder>', 'mymod'], ['<command>', 'new']];
  for (const [a, b2] of sub) t = t.split(a).join(b2);
  let note = '';
  let redirect = null;
  const rd = t.match(/^(.*?)\s*>\s*(\S+)$/); if (rd) { t = rd[1]; redirect = rd[2]; }
  const tk = t.match(/"[^"]*"|\S+/g).map(s => s.replace(/^"(.*)"$/, '$1'));
  tk.shift(); // ARSENAL
  if (tk[0] === 'play' && !tk.includes('--dry')) { tk.push('--dry'); note = 'run as --dry (the real form starts the game)'; }
  if (tk[0] === 'play' && tk.includes('--dry')) note = note || 'dry form';
  if (/^\w[\w-]*$/.test(tk[0] || '') && /<[^>]+>/.test(tk.join(' '))) note += ' UNSUBSTITUTED';
  return { args: tk, redirect, note: note.trim() };
}
const norm = (s, dir) => fwd(s).split(fwd(dir)).join('<tmp>').split(fwd(root)).join('<tmp>').replace(/\r/g, '').replace(/ in \d+ ms/g, '');
const firstLine = s => (s.split('\n').find(l => l.trim()) || '(no output)').trim();

const results = [];
const skippedAll = [];
for (const d of DOCS) {
  const { cmds, skipped, fences } = extract(d);
  skippedAll.push(...skipped);
  const dir = path.join(root, 'work-' + d.name.replace(/\.md$/, '')); fs.mkdirSync(dir, { recursive: true });
  const G = fixture(dir, fences);
  const env = { ...process.env, AS2_HOME: dir, AS2_NO_STEAM: '1', AS2_GAME: G };
  for (const c of cmds) {
    const p = prepare(c.text, G);
    const r = Wt.spawnSync(exe, p.args, { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true }, 'dist docrun');
    if (p.redirect) fs.writeFileSync(path.join(dir, p.redirect), r.stdout || '');
    const out = norm((r.stdout || '') + ((r.stdout || '').trim() ? '' : (r.stderr || '')), dir);
    const all = (r.stdout || '') + (r.stderr || '');
    const CRASH = /unknown tool|TypeError|ReferenceError|at .*\.js:\d+:\d+|Cannot find module/;
    const crash = CRASH.test(all) || r.status === null;
    const why = crash ? (r.status === null ? 'no exit (killed)' : (all.split(/\r?\n/).find(l => CRASH.test(l)) || '').trim()) : '';   // the line that set the flag, shown in the FAIL
    results.push({ doc: c.doc, line: c.line, text: c.text, rc: r.status === null ? 'timeout' : r.status, first: firstLine(out), note: p.note, crash, why });
  }
}

// ---- 4 gold
const key = r => `${r.doc}:${r.line}\t${r.text}`;
const row = r => `${key(r)}\trc=${r.rc}\t${r.first}`;
const ui = argv.indexOf('--update-gold');
if (ui >= 0) {
  const why = argv[ui + 1];
  if (!why || why.startsWith('--')) { console.log('--update-gold needs a reason'); process.exit(2); }
  const old = fs.existsSync(GOLD) ? fs.readFileSync(GOLD, 'utf8').split(/\r?\n/).filter(l => l.startsWith('# ')) : [];
  fs.writeFileSync(GOLD, [...old, '# ' + new Date().toISOString().slice(0, 10) + ' ' + why, ...results.map(row)].join('\n') + '\n');
  console.log('gold updated: ' + results.length + ' lines');
} else if (!fs.existsSync(GOLD)) fail(GOLD + ' missing (run with --update-gold "reason")');
else {
  const want = new Map(fs.readFileSync(GOLD, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('# ')).map(l => [l.split('\t').slice(0, 2).join('\t'), l]));
  for (const r of results) {
    const w = want.get(key(r));
    if (!w) fail(`${r.doc}:${r.line} ${r.text}: not in the golden (new or moved doc line)`);
    else if (w !== row(r)) fail(`${r.doc}:${r.line} ${r.text}\n   want ${w.split('\t').slice(2).join(' | ')}\n   got  ${row(r).split('\t').slice(2).join(' | ')}`);
    want.delete(key(r));
  }
  for (const k of want.keys()) fail('golden line no longer in the docs: ' + k.replace('\t', ' '));
}
for (const r of results) if (r.crash) fail(`${r.doc}:${r.line} ${r.text}: crash or unknown tool (rc ${r.rc}): ${r.first}
   because: ${r.why}`);
if (argv.includes('--table')) {
  console.log('| doc | line | command | exit | note | ok |\n|---|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.doc} | ${r.line} | \`${r.text}\` | ${r.rc} | ${r.note} | ${r.crash ? 'NO' : 'yes'} |`);
  for (const s of skippedAll) console.log(`skipped ${s.doc}:${s.line} \`${s.text}\`: ${s.why}`);
}
if (!argv.includes('--keep') && !opt('--scratch')) fs.rmSync(root, { recursive: true, force: true });
console.log(fails ? `docrun: ${fails} failed` : `docrun: PASS (${results.length} doc lines on the unzipped exe)`);
process.exit(fails ? 1 : 0);

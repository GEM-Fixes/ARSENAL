// gohsample/common: shared helpers (arg parsing, install guards, GoH index, async child runner, outside-mods overlay).
// All GoH content stays under the --out dir the user names (local only, never published, never committed).
// Author: Imperator_Aug (ARSENAL, ia-5d95dc53)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const pakset = require('../lib/pakset');

const TOOLS = path.join(__dirname, '..');
const LIMITS = path.join(__dirname, '..', '..', 'limits');   // default; --limits dir or env AS64_LIMITS overrides (a release copy ships no limits/)
const NOTICE = 'LOCAL ONLY: converted GoH game data. Never publish, never commit, never copy into a repo or release.';
const DEFAULT_GOH = require('../lib/gamedir').goh();
const DEFAULT_AS2 = require('../lib/gamedir').resolve().dir;

const fwd = p => String(p).replace(/\\/g, '/');
const extOf = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const baseName = k => k.slice(k.lastIndexOf('/') + 1).replace(/\.def$/i, '');
const insideDir = (p, dir) => { if (!dir) return false; const r = path.relative(path.resolve(dir), path.resolve(p)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
// deterministic pseudo-random rank: same seed + same string = same number everywhere
const rank = (seed, s) => parseInt(crypto.createHash('md5').update(seed + '|' + s).digest('hex').slice(0, 8), 16);

class UsageError extends Error { }
const die = m => { throw new UsageError(m); };

// --key value / --flag. values: names taking an argument; flags: boolean
function parseArgs(argv, values, flags) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-q') { o.q = true; continue; }
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2);
    if (values.includes(k)) { if (i + 1 >= argv.length) die(`--${k} needs a value`); o[k] = argv[++i]; }
    else if (flags.includes(k)) o[k] = true;
    else die(`unknown option ${a}`);
  }
  return o;
}
// the output dir must not sit inside any game install (or its mods folder)
function guardOut(out, ...dirs) {
  for (const d of dirs) if (d && insideDir(out, d)) die(`--out ${out} is inside a game install (${d}); refusing (nothing written)`);
}

// text file helpers: game data CRLF, strings UTF-8 (as64 reads them as UTF-8,. name kept for callers
const enc = require('../lib/enc');
function writeCp1251(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const b = enc.encodeText(text.replace(/\r?\n/g, '\r\n'));
  fs.writeFileSync(file, b);
}
const writeJson = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 1)); };
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

// GoH (or AS2) resource index: virtual key (lowercase, no resource/ prefix) -> {key, path|ent}. paks rooted at the pak's own dir (PORT-34), loose files win
function buildIndex(gameDir) {
  const root = fs.existsSync(path.join(gameDir, 'resource')) ? path.join(gameDir, 'resource') : gameDir;
  const ps = pakset.open(root, null), map = new Map();
  for (const e of ps.entries) map.set(e.key.toLowerCase(), { key: e.key.toLowerCase(), ent: e, size: e.size });
  for (const f of fs.readdirSync(root, { recursive: true })) {
    const p = path.join(root, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || /\.pak$/i.test(p)) continue;
    const key = fwd(f).toLowerCase();
    map.set(key, { key, path: p, size: st.size });
  }
  return { root, map, ps, read: e => e.path ? fs.readFileSync(e.path) : pakset.read(e.ent), close: () => ps.close() };
}

// async child: node script args -> {code, out, err, ms, timedOut}
function runNode(script, args, opt = {}) {
  return new Promise(resolve => {
    const t0 = Date.now(), chunks = [], errs = [];
    const p = cp.spawn(process.execPath, [script, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: opt.cwd });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { require('../lib/platform').killPid(p.pid); } catch { /* gone */ } try { p.kill(); } catch { /* gone */ } }, opt.timeout || 900000);
    p.stdout.on('data', d => chunks.push(d)); p.stderr.on('data', d => errs.push(d));
    p.on('error', e => { clearTimeout(timer); resolve({ code: -1, out: '', err: e.message, ms: Date.now() - t0 }); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, out: Buffer.concat(chunks).toString('utf8'), err: Buffer.concat(errs).toString('utf8'), ms: Date.now() - t0, timedOut }); });
  });
}
async function pool(items, n, fn) {
  const res = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) { const i = next++; res[i] = await fn(items[i], i); } }));
  return res;
}

// outside-mods overlay: a temp game dir with the game's root files copied, its dirs and real mods as junctions and the mod linked at mods/<name>.
// Same recipe as tools/check/check.js overlay() (check.js is a CLI, not a module): the game and the mod are only read; the temp dir is removed after.
function makeOverlay(gameDir, modDir, name) {
  const real = path.resolve(gameDir), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gohsample-ov-')), ov = path.join(tmp, 'game');
  fs.mkdirSync(path.join(ov, 'mods'), { recursive: true });
  const links = [];
  const junction = (t, l) => { fs.symlinkSync(t, l, 'junction'); links.push(l); };
  for (const e of fs.readdirSync(real, { withFileTypes: true })) {
    if (e.name.toLowerCase() === 'mods') continue;
    const p = path.join(real, e.name);
    if (e.isDirectory()) junction(p, path.join(ov, e.name));
    else if (/\.(exe|pak|pat|info|txt)$/i.test(e.name) && !/_ed\.exe$/i.test(e.name)) fs.copyFileSync(p, path.join(ov, e.name));
  }
  const rm = path.join(real, 'mods');
  if (fs.existsSync(rm)) for (const e of fs.readdirSync(rm, { withFileTypes: true })) if (e.isDirectory() && e.name.toLowerCase() !== name.toLowerCase()) junction(path.join(rm, e.name), path.join(ov, 'mods', e.name));
  const dst = path.join(ov, 'mods', name);
  junction(path.resolve(modDir), dst);
  const cleanup = () => {
    for (const l of links) { try { fs.rmdirSync(l); } catch { /* already gone */ } }   // rmdir on a junction removes the link only
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  };
  return { ov, mod: dst, real, tmp, cleanup };
}

// limits/PORT*.md -> Map code -> [row ids]  (codes named anywhere in a PORT row). dir: --limits, else AS64_LIMITS, else repo limits/
function limitCodes(dir) {
  const LIM = dir || process.env.AS64_LIMITS || LIMITS;
  const m = new Map();
  let files = [];
  try { files = fs.readdirSync(LIM).filter(f => /^PORT.*\.md$/i.test(f)); } catch { return m; }
  for (const f of files) for (const l of fs.readFileSync(path.join(LIM, f), 'utf8').split(/\r?\n/)) {
    const id = /^(PORT-\d+) \|/.exec(l);
    if (!id) continue;
    for (const c of l.match(/\b(?:WARN_)?PORT_[A-Z0-9_]+\b/g) || []) { if (!m.has(c)) m.set(c, []); if (!m.get(c).includes(id[1])) m.get(c).push(id[1]); }
  }
  return m;
}

// game parity: the AS2 build the sample is made for. --exe as64|mowas_2|mowas2 (goh refused: GoH is the source), else the exe the plan
// recorded (sample.json meta.exe, written only when plan had --exe), else the AS2 install read as goh2as2 reads it
// (goh2as2/target targetOf: as64.exe there -> as64, as before; no as64.exe -> mowas_2, one default for the port group). -> { id, exe: vfs exe, named }
// named = an exe was given or detected as mowas_2: only then do child tools get --exe and do outputs record it (the AS64 runs stay as they were).
function target(o, plan) {
  const T = require('../goh2as2/target');
  let exe = o && o.exe ? T.exeArg('gohsample', o.exe) : (plan && plan.meta && plan.meta.exe) || null;
  if (!exe) { const dir = (o && (o.as2 || o.game)) || (plan && plan.meta && plan.meta.as2); if (dir && T.targetOf(undefined, dir) === 'mowas2') exe = 'mowas_2'; }
  const id = exe === 'mowas_2' ? 'mowas2' : 'as64';
  return { id, exe: id === 'mowas2' ? 'mowas_2' : 'as64', named: !!exe, file: id === 'mowas2' ? 'mowas_2.exe' : 'as64.exe', mods: T.stuffMods(id), modInfo: T.modInfoLines(id), flag: exe ? ['--exe', id === 'mowas2' ? 'mowas_2' : 'as64'] : [] };
}

module.exports = { target, TOOLS, NOTICE, DEFAULT_GOH, DEFAULT_AS2, fwd, extOf, baseName, insideDir, rank, UsageError, die, parseArgs, guardOut, writeCp1251, writeJson, readJson, buildIndex, runNode, pool, makeOverlay, limitCodes };

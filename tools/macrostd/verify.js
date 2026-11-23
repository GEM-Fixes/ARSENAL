// macrostd/verify: proves a mod still expands to the same data as a before-snapshot (rows SDL-01/17/50, PORT-55/61, VFS-01).
//   run({ modDir, gameDir, exe, before, allow?, json?, log?, quiet? }) -> { rc, results, counts, roots, ms }
//   roots = mod roots + vanilla roots (not overwritten, include closure reaches a mod file) of BOTH sides (model.js).
//   Each root is expanded with sdlx twice: against <before> overlaid on vanilla (keys outside the model scope that <before> lacks are
//   taken from the mod: the snapshot holds text only) and against the mod overlaid on vanilla. Compared: expand.js tokens + the
//   sorted list of sdlx error codes.  Status per root: SAME | DIFF (first differing path, both values) | ERR_CHANGED (tokens same,
//   error codes not) | NEW (root only in the mod) | GONE (file only in before). Files (not roots) only on one side: NEW_FILE (fine
//   when included) / GONE_FILE (listed). --allow f.tsv: `root<TAB>reason` lines approve a root's DIFF/ERR_CHANGED/NEW/GONE.
//   rc 1 on any unapproved DIFF, ERR_CHANGED, NEW, GONE, GONE_FILE. Progress on stderr every 500 roots.
// Author: Imperator_Aug (ARSENAL, ia-83e254da)
const fs = require('fs'), path = require('path');
const model = require('./model');
const { makeSide, expand, firstDiff, errKey } = require('./expand');

function readAllow(f) {
  const m = new Map();
  if (!f) return m;
  for (const L of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!L.trim() || L.startsWith('#')) continue;
    const [r, reason] = L.split('\t');
    if (/^root$/i.test(r)) continue;
    m.set(r.trim().replace(/\\/g, '/').toLowerCase(), reason || '');
  }
  return m;
}

function codesDiff(a, b) {
  const c = new Map();
  for (const e of a) c.set(e.code, (c.get(e.code) || 0) - 1);
  for (const e of b) c.set(e.code, (c.get(e.code) || 0) + 1);
  return [...c].filter(([, n]) => n).map(([k, n]) => (n > 0 ? '+' : '') + n + ' ' + k).join(', ');
}

function run(o) {
  const t0 = Date.now(), log = o.log || (s => console.log(s)), prog = o.progress || (s => process.stderr.write(s + '\n'));
  const van = o.vanilla || model.vanillaScan(o);
  const mB = o.model || model.build({ modDir: o.modDir, gameDir: o.gameDir, exe: o.exe, vanilla: van });
  const mA = model.build({ modDir: o.before, gameDir: o.gameDir, exe: o.exe, vanilla: van });
  const sideB = makeSide({ dir: path.resolve(o.modDir), vanilla: van, gameDir: o.gameDir });
  // the snapshot may not hold every type (text-only copies by extension): a key it lacks comes from the mod when it is outside the
  // model scope or no file of its extension is in the snapshot at all (listed once as SNAPSHOT_LACKS)
  const extOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1); };
  const beforeDir = path.resolve(o.before);
  const snapExt = new Set();
  const sideA = makeSide({ dir: beforeDir, vanilla: van, gameDir: o.gameDir, fallback: sideB, fallbackIf: k => !model.inScope(k) || !snapExt.has(extOf(k)) });
  for (const k of sideA.local.keys()) snapExt.add(extOf(k));
  const lacks = [...new Set([...sideB.local.keys()].filter(k => model.inScope(k) && !sideA.local.has(k) && !snapExt.has(extOf(k))).map(extOf))];
  const allow = readAllow(o.allow);
  const roots = [...new Set([...mA.roots.mod, ...mA.roots.vanilla, ...mB.roots.mod, ...mB.roots.vanilla])].sort();
  const relOf = k => (mB.files.get(k) || mA.files.get(k) || { rel: k }).rel;
  const results = [], counts = {}, errCodes = {};
  let bad = 0, n = 0;
  const put = r => {
    const a = allow.get(r.root) ?? allow.get(r.rel.toLowerCase());
    if (r.status !== 'SAME' && r.status !== 'NEW_FILE') { if (a !== undefined) { r.allowed = a; r.status += '_ALLOWED'; } else bad++; }
    counts[r.status] = (counts[r.status] || 0) + 1;
    results.push(r);
  };
  for (const k of roots) {
    if (++n % 500 === 0) prog(`verify: ${n}/${roots.length} roots, ${Date.now() - t0} ms`);
    const inA = sideA.has(k), inB = sideB.has(k);
    const r = { root: k, rel: relOf(k), side: mB.files.has(k) || mA.files.has(k) ? 'mod' : 'vanilla' };
    if (!inA && inB) { r.status = 'NEW'; put(r); continue; }
    if (inA && !inB) { r.status = 'GONE'; put(r); continue; }
    const A = expand(sideA, k, mA.preInclude(k)), B = expand(sideB, k, mB.preInclude(k));
    if (!A || !B) { r.status = !A ? 'NEW' : 'GONE'; put(r); continue; }
    for (const e of B.errs) errCodes[e.code] = (errCodes[e.code] || 0) + 1;
    const d = firstDiff(A.toks, B.toks);
    if (d) { r.status = 'DIFF'; r.path = d.path; r.before = d.a; r.after = d.b; r.index = d.i; }
    else if (errKey(A.errs) !== errKey(B.errs)) { r.status = 'ERR_CHANGED'; r.errors = codesDiff(A.errs, B.errs); }
    else r.status = 'SAME';
    if (B.errs.length) r.errCount = B.errs.length;
    put(r);
  }
  // files (not roots) only on one side
  const scopeKeys = m => new Set([...m.files.values()].filter(f => f.scope).map(f => f.key));
  const kA = scopeKeys(mA), kB = scopeKeys(mB), rootSet = new Set(roots);
  for (const k of kB) if (!kA.has(k) && !rootSet.has(k) && snapExt.has(extOf(k))) put({ root: k, rel: relOf(k), side: 'mod', status: 'NEW_FILE', includedBy: [...(mB.includedBy.get(k) || [])].slice(0, 3) });
  for (const k of kA) if (!kB.has(k) && !rootSet.has(k)) put({ root: k, rel: relOf(k), side: 'mod', status: 'GONE_FILE' });
  const ms = Date.now() - t0;
  if (!o.quiet) {
    for (const r of results) {
      if (r.status === 'SAME') continue;
      let x = `${r.rel}: ${r.status}`;
      if (r.path !== undefined) x += ` at ${r.path}: before ${JSON.stringify(r.before)} after ${JSON.stringify(r.after)}`;
      if (r.errors) x += ` (${r.errors})`;
      if (r.includedBy) x += ` (included by ${r.includedBy.join(', ')})`;
      if (r.allowed !== undefined) x += ` [allowed: ${r.allowed}]`;
      log(x);
    }
    if (lacks.length) log(`verify: SNAPSHOT_LACKS the before folder has no *.${lacks.join(', *.')} file: those keys are read from the mod on both sides`);
    const top = Object.entries(errCodes).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, k]) => `${c} ${k}`).join(', ');
    log(`verify: ${roots.length} roots (${mB.roots.mod.length} mod, ${mB.roots.vanilla.length} vanilla reaching mod files), ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}; ${ms} ms`);
    if (top) log(`verify: sdlx error codes on the mod side (same on both sides unless listed): ${top}`);
    log(`verify: ${bad ? 'FAIL ' + bad : 'PASS'}`);
  }
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ tool: 'macrostd', cmd: 'verify', roots: roots.length, counts, errCodes, ms, results: results.filter(r => r.status !== 'SAME') }, null, 1));
  return { rc: bad ? 1 : 0, results, counts, roots: roots.length, ms, errCodes };
}

module.exports = { run, readAllow };

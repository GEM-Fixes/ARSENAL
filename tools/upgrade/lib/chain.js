// --then-fix: upgrade output -> tools/fix apply (safe fixers, never quarantine) -> tools/check, one combined result. child processes through the tools' own CLIs
// Author: Imperator_Aug (ARSENAL, ia-8a210fcd)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const C = require('../../modmove/lib/common');
// UPGRADE_CHAIN_STUB=<dir> (tests only): run <dir>/fix.js and <dir>/check.js instead; the real pair takes minutes on a full game install
const T = n => (process.env.UPGRADE_CHAIN_STUB ? path.join(process.env.UPGRADE_CHAIN_STUB, n + '.js') : path.join(__dirname, '..', '..', n, n + '.js'));
const SAFE = 'lng,repoint,include,macro,stubmtl';   // quarantine and set (needs --set) are never passed
const run = (script, args) => { const r = cp.spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }); return { status: r.status, out: r.stdout || '', err: r.stderr || '' }; };
// a tool another builder is editing can fail on a half-saved file: one re-run before it counts. exit 2 = usage, never retried
const runRetry = (script, args) => { let r = run(script, args); if (r.status !== 0 && r.status !== 2 && r.status !== 3 && /SyntaxError|Cannot find module|ReferenceError|TypeError/.test(r.err)) r = run(script, args); return r; };
// does check.js know --fast right now? its usage line is the only source (a no-arg run prints it, exit 2)
function hasFast() { const r = run(T('check'), []); return /--fast/.test(r.err + r.out); }
function freeName(base) { let p = base, i = 2; while (fs.existsSync(p) && fs.readdirSync(p).length) p = base + '-' + i++; return p; }

function chain(out, to, o) {
  const R = { fix: null, check: null, fast: false, skipped: null };
  const inst = C.installs(o), game = to === 'goh' ? inst.goh : inst.as2;
  if (!game || !fs.existsSync(game)) { R.skipped = `no ${to === 'goh' ? 'GoH' : 'AS2'} install found: pass --${to === 'goh' ? 'goh' : 'as2'}`; return R; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upchain-'));
  try {
    const patch = freeName(path.resolve(out) + '-fixpatch'), fj = path.join(tmp, 'fix.json');
    const f = runRetry(T('fix'), [path.resolve(out), 'apply', '--out', patch, '--game', game, '--only', SAFE, '--json', fj]);
    let J = null; try { J = JSON.parse(fs.readFileSync(fj, 'utf8')); } catch { /* no json */ }
    // failed = nonzero exit OR fix's own "nothing done" verdict (refused / not mounted / base unread); an older fix exits 0 on those (REV-TOOLS 4)
    const nothing = !!(J && /^nothing done/.test(String(J.verdict || '')));
    const failed = f.status !== 0 || nothing;
    const why = (f.out.match(/^.*\bFIX_(OUT_REFUSED|NOT_MOUNTED|BASE_UNREAD)\b.*$/m) || [])[0];
    R.fix = { status: f.status, failed, patch, changed: J ? J.changed.length : null, cant: J ? J.cant.length : null, reverted: J ? J.reverted.length : null, verdict: J ? J.verdict : null,
      err: failed ? (why || (f.err || f.out).trim().split('\n').slice(-2).join(' | ')).trim() : '' };
    R.fix.hasPatch = fs.existsSync(patch) && fs.readdirSync(patch).length > 0;
    R.fast = hasFast();
    const args = [path.resolve(out), '--exe', to, '--game', inst.as2 || game, '-q'];
    if (inst.goh) args.push('--goh', inst.goh);
    if (R.fix.hasPatch && R.fix.changed) args.push('--with', patch);
    if (R.fast) args.push('--fast');
    const c = runRetry(T('check'), args);
    const verdicts = [...c.out.matchAll(/^VERDICT (\S+): (.*)$/gm)].map(m => `${m[1]}: ${m[2]}`);
    const crash = (c.out.match(/^.*\bCRASH\b.*$/gm) || []).length;
    R.check = { status: c.status, verdicts, crash, err: !verdicts.length ? (c.err || c.out).trim().split('\n').slice(-2).join(' | ') : '' };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return R;
}
function render(R, d) {
  const L = ['CHAIN   upgrade -> fix (safe fixers) -> check'];
  L.push(`  upgrade  ${d.verdict}${d.partial.length ? ' (' + d.partial.slice(0, 4).join('; ') + ')' : ''}`);
  if (R.skipped) { L.push('  fix/check not run: ' + R.skipped); return L; }
  const f = R.fix;
  if (f.failed || f.status !== 0) L.push(`  fix      FAILED exit ${f.status}${f.verdict ? ' (' + f.verdict + ')' : ''}: ${f.err}`);
  else L.push(`  fix      ${f.changed === null ? 'ran' : f.changed + ' applied'}${f.cant ? ', ' + f.cant + ' left to a person' : ''}${f.reverted ? ', ' + f.reverted + ' reverted by the gate' : ''}${f.hasPatch ? ', patch ' + f.patch : ', no patch written'}`);
  const c = R.check;
  if (!c.verdicts.length) L.push(`  check    FAILED exit ${c.status}: ${c.err}`);
  else for (const v of c.verdicts) L.push(`  check    ${v}${R.fast ? '  (--fast)' : ''}`);
  L.push('  tests owed  no game ran any of this:'); for (const t of d.test) L.push('    ' + t);
  return L;
}
module.exports = { chain, render, hasFast, SAFE };

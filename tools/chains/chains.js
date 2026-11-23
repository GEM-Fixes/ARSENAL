#!/usr/bin/env node
// chains: runs the tools/QUICKSTART.md workflows as data (chains/*.json): ordered tool steps with exit + output expectations.
// usage: node tools/chains/chains.js <name|--all> --mod <e2e_test|e2e_test2..8|path> [--target as64|mowas2|goh] [--game G] [--goh G] [--dry] [--reset] [--out report.json]
//          [--workers N (1..8, with --all)] [--log-dir d] [--skip tool,..] [--chains-dir d] [--tools-dir d] [--timeout s] [-q]
//   chain file: {name, desc, needs?:["GOH"], games?:["as64","mowas2"] (default; "goh" = a GoH-target chain), steps:[{tool, argv:[..], exit?:0|[0,1], match?:regex, reject?:regex, games?:[..], note?}]}
//   tool = tools/<tool>/<tool>.js (or step.script rel. tools/), or "@copy" (argv [src, dst], dst must be inside $MOD).
//   vars in argv: $MOD (folder) $MODNAME $GAME $GOH $SCRATCH (tmp dir outside the game) $SRC
//     $TARGET (game id as64|mowas2|goh) $EXE (vfs exe as64|mowas_2|goh) $EXEFILE (as64.exe|mowas_2.exe|binaries/x64/call_to_arms.exe)
//     $BUILTIN ("as64+," under as64 = the built-in mod, else empty: "$BUILTIN$MODNAME")
//     whole-word tokens $EXEOPT / $TARGETOPT: nothing under as64 (the AS64 argv stays as it was), else "--exe $EXE" / "--target $TARGET"
//   --target (default as64, lib/games words): the game the chain builds for. mowas2: same chains, same install, tools get --exe mowas_2;
//     goh: only chains with "goh" in games (others: one N/A line, no exit change); $GAME = $GOH = --goh, else --game, else the found GoH install;
//     --mod must be a folder path outside the GoH install (ARSENAL does not write into it, lib/writeguard), bare names and --workers > 1 refused.
//   steps that cannot run on the target print the plain line and count as n/a: testrun needs the control pipe and -instance
//     (MoW:AS2: TST-19; GoH: no control pipe,; a step with games:[..] runs only on those targets.
//   run: stops a chain at its first failing step (records step + output tail), continues with the next chain; one JSON report,
//     one summary line per chain. Under the game install only mods/e2e_test, e2e_test2..e2e_test8 (lib/testfolders.js) are accepted as --mod (else exit 2).
//     --reset empties the (allowed) mod folder first (needed for newmod, which refuses a non-empty dir).
//   --dry: prints every command, runs none; checks the tool file exists, every --flag appears in the tool source (and INDEX.md:
//     info only), runs `<tool> --help` when the source handles it, and that -o/--out style flags only write into $MOD/$SCRATCH.
//   --workers N: chains run concurrently, worker w owns mods/e2e_test|e2e_test2..8 (w=1..8, --mod ignored) and game instance w (testrun steps get
//     --inst w); chain i -> worker i%N (shown by --dry); a failing chain never stops the others; per-chain step logs in --log-dir/<chain>.log; merged --out report.
// codes: CHAIN_TOOL_MISSING CHAIN_FLAG_UNKNOWN CHAIN_UNSAFE_WRITE CHAIN_HELP_FAIL CHAIN_BAD_DEF (dry validation)
//        CHAIN_STEP_FAIL (run: exit/regex mismatch)  rows: TST-01 (scripted run instead of UI clicks)
// Author: Imperator_Aug (ARSENAL, ia-ace090b8)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync, spawn } = require('child_process');
const { createReport } = require('../lib/report');

const SRC = path.resolve(__dirname, '..', '..');
const TF = require('../lib/testfolders');
const ALLOWED = TF.FOLDERS;
const WRITE_FLAGS = new Set(['-o', '--out', '--export', '--svg', '--json', '--archive', '--logdir', '--cache']);
const DEF_GAME = require('../lib/gamedir').resolve().dir;
const DEF_GOH = require('../lib/gamedir').goh();
const games = require('../lib/games');
// steps no target but AS64 can run: [why, row] per game id (plain line through games.notFor)
const NA_TOOL = {
  testrun: {
    mowas2: ['needs the control pipe and -instance, which mowas_2.exe does not have', 'TST-19'],
    goh: ['GoH has no control pipe, nothing GoH is started', 'modweb/testing/goh-drive.md'],
  },
};
const DEF_CHAIN_GAMES = ['as64', 'mowas2'];

const inside = (p, d) => { const r = path.relative(path.resolve(d), path.resolve(p)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

function parseArgs(args) {
  const o = { names: [], timeout: 900 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i], nx = () => { if (i + 1 >= args.length) die(a + ' needs a value'); return args[++i]; };
    if (a === '--all') o.all = true; else if (a === '--mod') o.mod = nx(); else if (a === '--game') o.game = nx();
    else if (a === '--goh') o.goh = nx(); else if (a === '--target') { const t = nx(); if (!games.get(t)) die('--target must be as64|mowas2|goh'); o.target = games.idOf(t); }
    else if (a === '--dry') o.dry = true; else if (a === '--reset') o.reset = true;
    else if (a === '--out') o.out = nx(); else if (a === '--chains-dir') o.chainsDir = nx(); else if (a === '--tools-dir') o.toolsDir = nx();
    else if (a === '--skip') o.skip = nx().split(','); else if (a === '--workers') o.workers = +nx(); else if (a === '--log-dir') o.logDir = nx(); else if (a === '--timeout') o.timeout = +nx(); else if (a === '-q') o.q = true;
    else if (a.startsWith('-')) die('unknown arg ' + a); else o.names.push(a);
  }
  return o;
}
function die(m) { console.error(m); process.exit(2); }

function loadChains(dir, o) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.json$/i.test(f)).sort() : [];
  const all = [];
  for (const f of files) {
    try { const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '')); c.file = f; if (!c.name) c.name = f.replace(/\.json$/i, ''); all.push(c); }
    catch (e) { all.push({ name: f.replace(/\.json$/i, ''), file: f, badJson: e.message, steps: [] }); }
  }
  if (o.all) return all;
  return o.names.map(n => all.find(c => c.name === n) || die('no such chain: ' + n + ' (have: ' + all.map(c => c.name).join(', ') + ')'));
}

function gameVars(target) {
  const g = games.get(target || games.DEFAULT);
  return { TARGET: g.id, EXE: g.exe, EXEFILE: g.file, BUILTIN: g.id === 'as64' ? 'as64+,' : '' };
}
function makeGohVars(o) {
  const gd = o.goh || o.game || DEF_GOH;
  if (!gd) die('chains --target goh: no GoH install found (give --goh <folder>)');
  const goh = path.resolve(gd), mod = o.mod;
  if (!mod) die('--mod required (a folder outside the GoH install)');
  if (!/[\\/]/.test(mod)) die('chains --target goh: --mod must be a folder path outside the GoH install, not a name (ARSENAL does not write into the GoH install, lib/writeguard)');
  const full = path.resolve(mod);
  if (inside(full, goh)) die(games.notFor('chains', 'goh', 'refusing --mod ' + mod + ': it is inside the GoH install, which ARSENAL does not write into; name a mod folder outside it', 'lib/writeguard'));
  if (DEF_GAME && inside(full, DEF_GAME)) die('refusing --mod ' + mod + ': a GoH mod folder does not belong in the AS2 install');
  return Object.assign({ MOD: full, MODNAME: path.basename(full), GAME: goh, GOH: goh, SCRATCH: path.join(os.tmpdir(), 'chains-' + process.pid), SRC }, gameVars('goh'));
}
function makeVars(o) {
  if (games.idOf(o.target) === 'goh') return makeGohVars(o);
  const game = path.resolve(o.game || DEF_GAME || require('../lib/gamedir').require({ what: 'chains' }));
  let mod = o.mod;
  if (!mod) die('--mod required (e2e_test | e2e_test2 | folder)');
  const full = /[\\/]/.test(mod) ? path.resolve(mod) : path.join(game, 'mods', mod);
  if (inside(full, game) || inside(full, o.goh || DEF_GOH)) {
    const ok = path.dirname(full).toLowerCase() === path.join(game, 'mods').toLowerCase() && ALLOWED.includes(path.basename(full));
    if (!ok) die(`refusing --mod ${mod}: under the game install only mods/${ALLOWED.join(' | mods/')} may be written`);
  }
  return Object.assign({ MOD: full, MODNAME: path.basename(full), GAME: game, GOH: path.resolve(o.goh || DEF_GOH), SCRATCH: path.join(os.tmpdir(), 'chains-' + process.pid), SRC }, gameVars(o.target));
}
const subst = (s, v) => String(s).replace(/\$(MODNAME|MOD|GAME|GOH|SCRATCH|SRC|TARGET|EXEFILE|EXE|BUILTIN)(?![A-Za-z0-9_])/g, (_, k) => (v[k] === undefined ? gameVars()[k] : v[k]));
// $EXEOPT / $TARGETOPT (whole argv items): nothing under as64, else the option pair (raw, before subst)
const expandOpts = (argv, v) => {
  const t = (v && v.TARGET) || games.DEFAULT, out = [];
  for (const a of argv || []) {
    if (a === '$EXEOPT') { if (t !== games.DEFAULT) out.push('--exe', '$EXE'); }
    else if (a === '$TARGETOPT') { if (t !== games.DEFAULT) out.push('--target', '$TARGET'); }
    else out.push(a);
  }
  return out;
};
// why a step cannot run on the target: null, or the plain line
function stepNa(step, v) {
  const t = (v && v.TARGET) || games.DEFAULT;
  if (step.games && !step.games.includes(t)) return games.notFor(step.tool, t, 'this step of the chain is made for ' + step.games.map(x => games.get(x) ? games.get(x).name : x).join(' and '), step.row);
  const n = NA_TOOL[step.tool] && NA_TOOL[step.tool][t];
  return n ? games.notFor(step.tool, t, n[0], n[1]) : null;
}
const chainGames = c => c.games || DEF_CHAIN_GAMES;

function toolScript(step, toolsDir) {
  if (step.script) return path.join(toolsDir, step.script);
  return path.join(toolsDir, step.tool, step.tool + '.js');
}
function toolSource(step, toolsDir) {
  const dir = path.dirname(toolScript(step, toolsDir)); let txt = '';
  try { for (const f of fs.readdirSync(dir)) if (/\.js$/.test(f)) txt += fs.readFileSync(path.join(dir, f), 'utf8') + '\n'; } catch (e) { /* missing */ }
  return txt;
}
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// options lib/cli.js parse() gives every tool that uses it (the flag text is not in the tool's own source)
const CLI_COMMON = new Set(['--exe', '--game', '--mods', '--summary', '--by-code', '--format', '--rc', '--no-rc']);
const USES_CLI = /require\(\s*['"](\.\.\/)+lib\/cli(\.js)?['"]\s*\)/;

// ---- dry validation: returns [{code,msg}]
function validateStep(step, i, vars, o, indexTxt, cache) {
  const probs = [], infos = [];
  if (!step.tool || !Array.isArray(step.argv)) return { probs: [{ code: 'CHAIN_BAD_DEF', msg: `step ${i + 1}: needs tool + argv[]` }], infos };
  if (step.tool === '@copy') {
    if (step.argv.length !== 2) probs.push({ code: 'CHAIN_BAD_DEF', msg: `step ${i + 1}: @copy needs [src, dst]` });
    else if (!/^\$(MOD|SCRATCH)\b/.test(step.argv[1])) probs.push({ code: 'CHAIN_UNSAFE_WRITE', msg: `step ${i + 1}: @copy dst ${step.argv[1]} is not inside $MOD` });
    return { probs, infos };
  }
  const script = toolScript(step, o.toolsDir);
  if (!fs.existsSync(script)) return { probs: [{ code: 'CHAIN_TOOL_MISSING', msg: `step ${i + 1}: ${path.relative(SRC, script)} not found` }], infos };
  const key = script;
  if (!cache[key]) cache[key] = toolSource(step, o.toolsDir);
  const src = cache[key];
  const name = step.script ? path.basename(step.script, '.js') : step.tool;
  const idxLine = indexTxt.split('\n').filter(l => new RegExp('\\b' + escRe(name) + '\\b').test(l)).join('\n');
  step.argv.forEach((a, k) => {
    const s = String(a);
    if (/^--?[A-Za-z]/.test(s) && !/\s/.test(s)) {
      if (s.length > 2 && s.startsWith('--') && !new RegExp(escRe(s) + '(?![\\w-])').test(src) && !(CLI_COMMON.has(s) && USES_CLI.test(src))) probs.push({ code: 'CHAIN_FLAG_UNKNOWN', msg: `step ${i + 1}: ${step.tool} source has no flag ${s}` });
      else if (s.startsWith('--') && idxLine && !new RegExp(escRe(s) + '(?![\\w-])').test(idxLine)) infos.push({ code: 'CHAIN_FLAG_NOT_IN_INDEX', msg: `step ${i + 1}: ${s} not in tools/INDEX.md line for ${name}` });
      if (WRITE_FLAGS.has(s) && k + 1 < step.argv.length && !/^\$(MOD|SCRATCH)\b/.test(String(step.argv[k + 1]))) probs.push({ code: 'CHAIN_UNSAFE_WRITE', msg: `step ${i + 1}: ${s} ${step.argv[k + 1]} writes outside $MOD/$SCRATCH` });
    }
  });
  if (/['"]--help['"]/.test(src) && !cache['help:' + key]) {
    cache['help:' + key] = 1;
    const r = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', timeout: 20000, cwd: SRC, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.error || r.status === null || (r.status !== 0 && r.status !== 2 && r.status !== 1)) probs.push({ code: 'CHAIN_HELP_FAIL', msg: `step ${i + 1}: ${step.tool} --help exit ${r.status} ${r.error ? r.error.message : ''}` });
  }
  return { probs, infos };
}

const q = s => (/[\s"]/.test(s) ? '"' + s + '"' : s);
const cmdText = (step, argv) => step.tool === '@copy' ? 'copy ' + argv.map(q).join(' ') : `node ${path.relative(SRC, step.script ? path.join(SRC, 'tools', step.script) : path.join(SRC, 'tools', step.tool, step.tool + '.js')).replace(/\\/g, '/')} ${argv.map(q).join(' ')}`;

function copyTree(src, dst) {
  if (!fs.existsSync(src)) return { ok: false, msg: 'copy source missing: ' + src };
  let n = 0;
  const walk = (s, d) => {
    if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, { recursive: true }); for (const e of fs.readdirSync(s)) walk(path.join(s, e), path.join(d, e)); }
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); n++; }
  };
  walk(src, dst);
  return { ok: true, msg: `copied ${n} files` };
}

function runStep(step, argv, o, vars) {
  if (step.tool === '@copy') {
    if (!inside(argv[1], vars.MOD) && !inside(argv[1], vars.SCRATCH)) return Promise.resolve({ exit: 2, out: 'refused: @copy dst outside $MOD' });
    const r = copyTree(argv[0], argv[1]); return Promise.resolve({ exit: r.ok ? 0 : 1, out: r.msg });
  }
  const script = toolScript(step, o.toolsDir);
  return new Promise(resolve => {
    const ch = spawn(process.execPath, [script, ...argv], { cwd: SRC, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', done = false, tm = null;
    const fin = (code, extra) => { if (done) return; done = true; clearTimeout(tm); resolve({ exit: code === null ? -1 : code, out: out + (extra || '') }); };
    tm = setTimeout(() => { try { ch.kill(); } catch (e) { /* gone */ } fin(null, '\ntimeout'); }, (step.timeout || o.timeout) * 1000);
    ch.stdout.on('data', d => { out += d; }); ch.stderr.on('data', d => { out += d; });
    ch.on('error', e => fin(null, '\n' + e.message)); ch.on('close', c => fin(c));
  });
}
const tail = (s, n) => s.replace(/\r/g, '').trimEnd().split('\n').slice(-n).join('\n');

function resetMod(vars) {
  fs.mkdirSync(vars.MOD, { recursive: true });
  for (const e of fs.readdirSync(vars.MOD)) fs.rmSync(path.join(vars.MOD, e), { recursive: true, force: true });
}

// worker mods: --workers N (1..8) -> worker w owns mods/ALLOWED[w-1] and game instance w (1..9, never instance 0) (testrun steps get --inst w)
function workerVars(o, w) {
  const v = makeVars(Object.assign({}, o, { mod: o.workers > 1 ? TF.forWorker(w) : o.mod }));
  v.SCRATCH += '-w' + w; v.WORKER = w; return v;
}

async function runChain(c, vars, o, indexTxt, cache, rep, hooks, inst) {
  const lines = [], log = s => lines.push(s);
  const res = { name: c.name, desc: c.desc || '', status: 'pass', failedStep: null, steps: [], worker: vars.WORKER, mod: vars.MODNAME };
  if (inst) res.inst = vars.WORKER;
  const fin = () => { res.lines = lines; return res; };
  if (c.badJson) { res.status = 'fail'; res.reason = 'bad json: ' + c.badJson; res.summary = 'chain ' + c.name + ': FAIL 0/0 steps - ' + res.reason; rep.add('chains/' + c.file, 0, 'CHAIN_BAD_DEF', c.badJson); return fin(); }
  if (!c.badJson && !chainGames(c).includes(vars.TARGET)) {
    res.status = 'na'; res.reason = games.notFor('chains', vars.TARGET, 'chain ' + c.name + ' is made for ' + chainGames(c).map(x => games.get(x) ? games.get(x).name : x).join(' and ') + (vars.TARGET === 'goh' ? '; the GoH chain is goh-mod' : ''));
    res.summary = 'chain ' + c.name + ': N/A - ' + res.reason; log('== ' + res.summary); return fin();
  }
  log(`== chain ${c.name}${c.desc ? ' - ' + c.desc : ''}${inst ? '  [worker ' + vars.WORKER + ', ' + vars.MODNAME + ', inst ' + vars.WORKER + ']' : ''}${vars.TARGET !== games.DEFAULT ? '  [target ' + vars.TARGET + ']' : ''}`);
  if ((c.needs || []).includes('GOH') && !fs.existsSync(vars.GOH)) {
    res.status = 'fail'; res.reason = 'GoH dir missing: ' + vars.GOH; res.summary = 'chain ' + c.name + ': FAIL 0/' + c.steps.length + ' steps - ' + res.reason;
    rep.add('chains/' + c.file, 0, 'CHAIN_STEP_FAIL', res.reason); return fin();
  }
  if (!o.dry && o.reset) { resetMod(vars); log(`   reset ${vars.MOD}`); }
  for (let i = 0; i < c.steps.length; i++) {
    const step0 = c.steps[i];
    const step = Array.isArray(step0.argv) && step0.argv.some(a => a === '$EXEOPT' || a === '$TARGETOPT') ? Object.assign({}, step0, { argv: expandOpts(step0.argv, vars) }) : step0;
    const extra = step.tool === 'testrun' && !(step.argv || []).includes('--inst') ? ['--inst', inst ? String(vars.WORKER) : '1'] : [];   // never instance 0: it reads the player's own mod list, as64+ in it drops a legacy mod (ENG-26)
    const argv = (step.argv || []).concat(extra).map(a => subst(a, vars));
    const rec = { n: i + 1, tool: step.tool, cmd: cmdText(step, argv), status: 'skip' };
    res.steps.push(rec);
    const na = step.tool ? stepNa(step, vars) : null;
    if (na) { rec.status = 'na'; rec.reason = na; log(`   ${i + 1}. N/A ${na}`); continue; }
    if (o.dry) {
      const v = validateStep(extra.length ? Object.assign({}, step, { argv: step.argv.concat(extra) }) : step, i, vars, o, indexTxt, cache);
      log(`   ${i + 1}. ${rec.cmd}`);
      for (const p of v.probs) { rep.add('chains/' + c.file, i + 1, p.code, p.msg); log(`      ! ${p.code} ${p.msg}`); }
      for (const p of v.infos) rep.info('chains/' + c.file, i + 1, p.code, p.msg);
      rec.status = v.probs.length ? 'bad' : 'ok'; rec.problems = v.probs.map(p => p.code + ' ' + p.msg);
      if (v.probs.length && res.status === 'pass') { res.status = 'fail'; res.failedStep = i + 1; }
      continue;
    }
    if (res.status !== 'pass') continue;
    if ((o.skip || []).includes(step.tool)) { rec.status = 'skipped'; log('   ' + (i + 1) + '. SKIP ' + rec.cmd); continue; }
    log(`   ${i + 1}. $ ${rec.cmd}`);
    const t0 = Date.now(), r = await hooks.runStep(step, argv, o, vars);
    rec.ms = Date.now() - t0; rec.exit = r.exit; rec.tail = tail(r.out, 12);
    if (o.logDir) { try { fs.mkdirSync(o.logDir, { recursive: true }); fs.appendFileSync(path.join(o.logDir, c.name + '.log'), `### step ${i + 1} ${rec.cmd}\n${r.out}\n### exit ${r.exit}\n`); } catch (e) { /* log dir unwritable */ } }
    const okExit = [].concat(step.exit === undefined ? 0 : step.exit);
    let why = null;
    if (!okExit.includes(r.exit)) why = `exit ${r.exit}, want ${okExit.join('|')}`;
    else if (step.match && !new RegExp(step.match, 'm').test(r.out)) why = `output has no match for /${step.match}/`;
    else if (step.reject && new RegExp(step.reject, 'm').test(r.out)) why = `output matches reject /${step.reject}/`;
    rec.status = why ? 'fail' : 'pass';
    if (why) {
      res.status = 'fail'; res.failedStep = i + 1; res.reason = `step ${i + 1} (${step.tool}): ${why}`; rec.reason = why;
      rep.add('chains/' + c.file, i + 1, 'CHAIN_STEP_FAIL', `${step.tool}: ${why}`);
      log(tail(r.out, 6).replace(/^/gm, '      | '));
    }
  }
  if (o.dry) res.status = res.status === 'pass' ? 'dry-ok' : 'dry-bad';
  const ran = res.steps.filter(s => ['pass', 'ok', 'skipped', 'na'].includes(s.status)).length;
  const nNa = res.steps.filter(s => s.status === 'na').length;
  res.summary = `chain ${c.name}: ${res.status.toUpperCase()} ${ran}/${c.steps.length} steps${nNa ? ' (' + nNa + ' n/a on ' + games.get(vars.TARGET).name + ')' : ''}${res.failedStep ? ' - failed at step ' + res.failedStep + (res.reason ? ': ' + res.reason : '') : ''}`;
  return fin();
}

// hooks.runStep(step, argv, o, vars) -> Promise<{exit,out}> lets tests stub the tool runner
async function run(args, hooks) {
  hooks = Object.assign({ runStep }, hooks || {});
  const o = parseArgs(args);
  if (!o.all && !o.names.length) die('usage: ARSENAL chains <name|--all> --mod <e2e_test|e2e_test2> [--target as64|mowas2|goh] [--game G] [--goh G] [--dry] [--reset] [--workers N] [--out report.json]');
  if (o.workers !== undefined && !(o.workers >= 1 && o.workers <= ALLOWED.length && Number.isInteger(o.workers))) die('--workers must be 1..' + ALLOWED.length + ' (one approved mods/ folder + instance each)');
  if (!o.workers) o.workers = 1;
  if (o.target === 'goh' && o.workers > 1) die('chains --target goh: --workers must be 1 (the worker folders are mods/e2e_test.. of the AS2 install; a GoH chain writes only into the --mod folder you name)');
  o.chainsDir = path.resolve(o.chainsDir || path.join(__dirname, 'chains'));
  o.toolsDir = path.resolve(o.toolsDir || path.join(SRC, 'tools'));
  const chains = loadChains(o.chainsDir, o);
  if (o.workers > chains.length) o.workers = Math.max(1, chains.length);
  if (o.workers === 1 && !o.mod) die('--mod required (e2e_test | e2e_test2 | folder)');
  const par = o.workers > 1;
  const wv = []; for (let w = 1; w <= o.workers; w++) wv.push(workerVars(o, w));
  const vars = wv[0];
  let indexTxt = ''; try { indexTxt = fs.readFileSync(path.join(o.toolsDir, 'INDEX.md'), 'utf8'); } catch (e) { /* none */ }
  try { for (const f of fs.readdirSync(path.join(o.toolsDir, 'index'))) indexTxt += '\n' + fs.readFileSync(path.join(o.toolsDir, 'index', f), 'utf8'); } catch (e) { /* no groups */ }
  const rep = createReport(), cache = {};
  if (par && !o.logDir && !o.dry) o.logDir = path.join(os.tmpdir(), 'chains-logs-' + process.pid);
  if (par) {
    // static round-robin: chain i -> worker i % N, so --dry shows exactly what runs
    console.log(`workers ${o.workers}: each owns one mod folder + one game instance`);
    wv.forEach((v, k) => console.log(`  worker ${v.WORKER} -> mods/${v.MODNAME} inst ${v.WORKER}: ${chains.filter((_, i) => i % o.workers === k).map(c => c.name).join(', ') || '(none)'}`));
    if (o.logDir) console.log('  step logs: ' + o.logDir + '/<chain>.log');
  }
  const results = new Array(chains.length);
  const queues = wv.map((v, k) => chains.map((c, i) => [c, i]).filter(([, i]) => i % o.workers === k));
  await Promise.all(queues.map(async (qu, k) => {
    for (const [c, i] of qu) {
      let r;
      try { r = await runChain(c, wv[k], o, indexTxt, cache, rep, hooks, par); }
      catch (e) { r = { name: c.name, status: 'fail', steps: [], reason: 'CRASH ' + e.message, summary: 'chain ' + c.name + ': FAIL 0/' + c.steps.length + ' steps - ' + e.message, lines: [] }; rep.add('chains/' + (c.file || c.name), 0, 'CHAIN_STEP_FAIL', 'crash: ' + e.message); }
      results[i] = r;
      if (par) console.log(r.lines.map(l => '[w' + wv[k].WORKER + '] ' + l).join('\n'));
      else if (!o.q) console.log(r.lines.join('\n'));
    }
  }));
  results.forEach(r => { delete r.lines; console.log(r.summary); });
  if (o.out) fs.writeFileSync(o.out, JSON.stringify({ tool: 'chains', mod: par ? wv.map(v => v.MODNAME) : vars.MODNAME, workers: o.workers, game: vars.GAME, target: vars.TARGET, dry: !!o.dry, when: new Date().toISOString(), chains: results }, null, 1));
  if (!o.dry) for (const v of wv) if (fs.existsSync(v.SCRATCH)) fs.rmSync(v.SCRATCH, { recursive: true, force: true });
  if (o.dry) rep.print({ showInfo: !o.q, byCode: true });
  return results.some(r => r.status === 'fail' || r.status === 'dry-bad') ? 1 : 0;
}
function main(args) { return run(args).then(c => process.exit(c)); }

if (require.main === module) main(process.argv.slice(2));
module.exports = { main, run, validateStep, subst, makeVars, expandOpts, stepNa, gameVars };

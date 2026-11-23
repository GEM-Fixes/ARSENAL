// pro ext test. Arg: scratch dir. Builds its own small fixtures in the scratch dir (conflicts, verdiff) and reads the tools'
// committed fixtures (overdiff, misdiff, statsheet) without changing them. Tools run through a fake ctx.runTool = `node tools/<entry>`.
// No game, no network, nothing written outside the scratch dir.
// Author: Imperator_Aug (ARSENAL, ia-a9a15cbb)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'prox-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const TOOLS = path.resolve(__dirname, '..', '..', '..');
// overdiff / misdiff fixtures are made by their own mkfixture.js (git-ignored output): made here when a copy comes without them
for (const [d, f] of [['overdiff', 'game/mods/m/mod.info'], ['misdiff', 'a/map.info']]) if (!fs.existsSync(path.join(TOOLS, d, 'test', 'fixture', f))) cp.spawnSync(process.execPath, [path.join(TOOLS, d, 'test', 'mkfixture.js')], { stdio: 'ignore' });
const ext = require('./index'), P = require('./policy'), C = require('./catalog'), R = require('./routes');
const routes = ext.routes;
const calls = [];
function runTool(tool, entry, args, o) {
  calls.push({ tool, entry, args, cwd: o && o.cwd });
  return new Promise(res => cp.execFile(process.execPath, [path.join(TOOLS, entry)].concat(args), { cwd: (o && o.cwd) || work, timeout: (o && o.timeoutMs) || 120000, maxBuffer: 64 << 20, encoding: 'utf8' },
    (e, so, se) => res({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout: so || '', stderr: se || '', timedOut: !!(e && e.killed) })));
}
const tmpRoot = path.join(work, 'tmp');
const ctx = { gamedir: null, tools: TOOLS, tmpRoot, runTool, game: () => null, allowLaunch: false };
const post = (n, body) => routes['POST /api/x/pro/' + n](new URL('http://x/api/x/pro/' + n), body, ctx);
const st = async p => { try { await p; return 0; } catch (x) { return x.status || -1; } };
function put(root, rel, lines) { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); }

(async () => {
  // ---- shape, script rules, languages
  ok(ext.id === 'pro' && ext.nav === 'pro.nav' && ext.adv === true, 'ext shape');
  ok(!/\x60|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(ext.script), 'script rules');
  ok(/EXT_SCREENS\.pro=function\(root\)/.test(ext.script), 'script sets EXT_SCREENS.pro');
  try { new vm.Script('(function(){' + ext.script + '})'); } catch (x) { ok(false, 'script parses: ' + x.message); }
  const L = ext.lang;
  for (const k of Object.keys(L.en)) {
    ok(k.startsWith('pro.'), 'lang key prefix ' + k);
    for (const c of ['ru', 'uk', 'zh']) ok(L[c] && L[c][k] && (L[c][k] !== L.en[k] || !/\s/.test(L.en[k])), 'lang ' + c + ' ' + k);
  }
  const used = [...new Set((ext.script.match(/tx\('pro\.[\w.]+'[,)]/g) || []).map(x => x.replace(/^tx\('|'[,)]$/g, '')))];
  ok(used.length > 80 && used.every(k => L.en[k]), 'every tx key exists: ' + used.filter(k => !L.en[k]).join(','));
  for (const w of Object.values(P.BLOCK)) ok(L.en['pro.why.block.' + w], 'why label block.' + w);
  for (const w of ['unknown', 'retired', 'nonode', 'flag', 'flagfile', 'needdry']) ok(L.en['pro.why.' + w], 'why label ' + w);
  for (const k of Object.keys(routes)) ok(/^(GET|POST) \/api\/x\/[a-z0-9/_-]+$/.test(k), 'route key ' + k);

  // ---- deny-list (E-13)
  const T = n => ({ name: n, entry: n + '/' + n + '.js', retired: false });
  const J = (n, a, e) => P.judge(n, a, e === undefined ? T(n) : e);
  ok(!J('as2', ['play', 'C:/m']).ok && J('as2', ['play', 'C:/m']).why === 'needdry', 'as2 play refused without --dry');
  ok(J('as2', ['play', 'C:/m', '--dry']).ok && J('as2', ['play', '--dry']).dry, 'as2 play --dry allowed');
  ok(!J('as2', ['install']).ok && !J('as2', ['check', 'x']).ok, 'as2 install / dispatch refused');
  ok(J('as2', ['status']).ok && J('as2', []).ok, 'as2 status / bare menu ok');
  ok(!J('edrun', ['m']).ok && J('edrun', ['m', '--dry']).ok, 'edrun only --dry');
  ok(!J('edrun', ['m', '--dry', '--allow-launch']).ok, 'edrun --dry --allow-launch refused');
  ok(J('uidrive', []).why === 'block.launch' && J('gui', []).why === 'block.server', 'uidrive / gui blocked');
  ok(!J('bootloop', ['boot']).ok && J('bootloop', ['parse', 'log.txt']).ok, 'bootloop boot refused, parse ok');
  ok(J('check', ['C:/m', '--allow-launch']).flag === '--allow-launch' && J('check', ['C:/m', '--allow-launch=1']).flag === '--allow-launch', '--allow-launch refused (both forms)');
  ok(!J('lint', ['x', '-o', 'f']).ok && !J('lint', ['x', '--write']).ok && !J('lint', ['x', '--fix']).ok, '-o / --write / --fix refused');
  ok(J('lint', ['x', '--json']).ok && J('lint', ['x', '--json', 'out.json']).why === 'flagfile' && J('lint', ['x', '--json=o.json']).why === 'flagfile' && J('lint', ['x', '--json', '--strict']).ok, '--json alone ok, --json <file> refused');
  ok(!J('lint', ['x', '--out', 'd']).ok && !J('clone-entity', ['a', '--out', 'd']).ok && J('clone-entity', ['a', '--out', 'd', '--dry-run']).ok, '--out only with a dry flag on OUT_DRY_OK');
  ok(J('x', [], null).why === 'unknown' && J('x', [], { name: 'x', entry: 'x.js', retired: true }).why === 'retired' && J('y', [], { name: 'y', entry: null }).why === 'nonode', 'unknown / retired / no script');
  ok(!J('srcdrift', ['--snap']).ok && !J('modswitch', ['--set', 'a']).ok, 'per-tool flags refused');
  ok(J('drift', ['check']).ok && !J('drift', ['stamp']).ok && J('drift', ['stamp', '--dry-run']).ok, 'drift subcommands');
  ok(!J('doctrine', ['gen', '--persona', 'p', '--out', 'C:/m']).ok && J('doctrine', ['gen', '--persona', 'p', '--out', 'C:/m', '--plan']).ok && J('doctrine', ['list', 'rules']).ok, 'doctrine gen only --plan');
  ok(!J('gemindex', ['export']).ok && J('gemindex', ['search', 'x']).ok && !J('portdiff', ['--as2', 'a']).ok && !J('exediff', ['--full', 'd']).ok, 'gemindex / portdiff / exediff');
  // usage is a maintainer tool the public copy leaves out (its policy row goes with it): checked where the tool is
  if (fs.existsSync(path.join(TOOLS, 'usage', 'usage.js'))) ok(J('usage', []).why === 'block.dev', 'usage refused as a maintainer tool');
  else console.log('skip usage policy row: tools/usage is not in this copy (a maintainer tool, left out of the public copy on purpose)');
  ok(P.state('edrun', T('edrun')) === 'dry' && P.state('uidrive', T('uidrive')) === 'block' && P.state('lint', T('lint')) === 'ok', 'state()');
  // dist-zip / dist-enginezip write release zips outside the scratch folder when run bare: refused with or without arguments, as is any later dist-* row
  for (const n of ['dist-zip', 'dist-enginezip', 'dist-later', 'dist/later']) {
    const e = { name: n, entry: 'dist/x.js', retired: false };
    ok(J(n, [], e).why === 'block.write' && J(n, ['--check'], e).why === 'block.write' && P.state(n, e) === 'block', n + ' refused');
  }
  ok(P.blockOf('distill') === null && P.state('distill', T('distill')) === 'ok', 'dist family needs dist- or dist/');
  // rows that wrote outside the scratch folder while listed as "can run"
  ok(J('mapview', ['m.net', '--svg', 'C:/game/x.svg']).flag === '--svg' && J('mapview', ['m.net', '--svg=x.svg']).flag === '--svg' && J('mapview', ['m.net', '--legend']).ok, 'mapview --svg <file> refused (both forms), a plain preview runs');
  const ai = { name: 'armorsim-ingame', entry: 'armorsim/ingame/shottable.js', retired: false };
  ok(J('armorsim-ingame', ['compare', 'C:/game/mods/m', '--log', 'game.log'], ai).why === 'block.write' && J('armorsim-ingame', ['plan', 'u', '--out', 'd'], ai).why === 'block.write' && P.state('armorsim-ingame', ai) === 'block', 'armorsim-ingame (compare writes into its DIR, plan into --out) refused');
  const gd = { name: 'goh2as2 --deps scenery', entry: 'goh2as2/goh2as2.js', retired: false };
  ok(J(gd.name, ['--keys', 'k', '--deps', '--mod', 'C:/game/mods/m'], gd).why === 'needdry' && J(gd.name, ['--keys', 'k', '--deps', '--out', 'd'], gd).why === 'needdry' && J(gd.name, ['--keys', 'k', '--deps', '--out', 'd', '--dry-run'], gd).ok && P.state(gd.name, gd) === 'dry' && P.dryKey(gd.name) === 'goh2as2', 'goh2as2 --deps scenery takes the goh2as2 dry gate (--out only with --dry-run)');
  ok(J('goh2as2 --deps scenery', ['--keys', 'k', '--deps', '--out', 'd', '--dry-run', '--xlate-json', 'C:/g/x.json'], gd).flag === '--xlate-json' && J('goh2as2', ['--keys', 'k', '--out', 'd', '--dry-run', '--xlate-json=x.json'], T('goh2as2')).flag === '--xlate-json', 'goh2as2 --xlate-json <file> refused even in a dry run');
  ok(P.dryKey('goh2as2 other words') === 'goh2as2' && P.dryKey('lint x') === null && P.dryKey('goh2as2/unitname') === 'goh2as2/unitname', 'a <tool> <words> row takes the dry rule of <tool>, a <tool>/<x> row does not');
  const ws = { name: 'workshop', entry: 'workshop/workshop.js', retired: false };
  ok(J('workshop', ['install', 'C:/game'], ws).why === 'needdry' && J('workshop', ['install', 'C:/game', '--dry'], ws).why === 'needdry' && J('workshop', ['start', 'C:/game'], ws).why === 'needdry' && !J('workshop', ['--json', 'install', 'C:/game'], ws).ok && J('workshop', ['status', 'C:/game', '--json'], ws).ok, 'workshop install / start refused, status runs');
  const un = { name: 'goh2as2/unitname', entry: 'goh2as2/unitname.js', retired: false };
  ok(J(un.name, ['C:/m'], un).why === 'needdry' && J(un.name, ['C:/m', '--list'], un).why === 'needdry' && J(un.name, ['C:/m', '--dry-run', '--list'], un).ok, 'goh2as2/unitname only with --dry-run');
  ok(J('fxlint', ['C:/m', '--regen-actions']).flag === '--regen-actions' && J('fxlint', ['--regen-actions']).why === 'flag' && J('fxlint', ['C:/m', '--summary']).ok, 'fxlint --regen-actions refused');
  ok(J('doctor', ['C:/m']).ok && J('balance', ['C:/g']).ok, 'doctor and balance (outputs in the temp folder) still run');
  ok(!('dist-zip' in P.BLOCK) && !('dist-enginezip' in P.BLOCK) && P.blockOf('dist-zip') === 'write', 'dist-zip / dist-enginezip come from the dist family only');

  // ---- catalogue
  const cat = C.load(TOOLS);
  ok(cat.from === 'index' && cat.tools.length > 100, 'catalogue from index: ' + cat.tools.length);
  const bundled = require('./catalog.json').tools;
  ok(bundled.length > 100 && bundled.every(t => t.name && 'entry' in t), 'bundled catalog.json: ' + bundled.length);
  const pl = C.parseLine('foo | node tools/foo/foo.js a \\| b | 3 | does foo', 'g');
  ok(pl && pl.name === 'foo' && pl.entry === 'foo/foo.js' && pl.run.includes('a | b') && pl.what === 'does foo', 'parseLine escaped pipe');
  ok(C.parseLine('old | node tools/_retired/old.js | x', 'g').retired, 'parseLine retired');
  ok(/conflicts/i.test(C.header(TOOLS, 'conflicts/conflicts.js') || '') && C.header(TOOLS, 'nope/nope.js') === null, 'header from source');
  const list = await routes['GET /api/x/pro/tools'](new URL('http://x/api/x/pro/tools'), null, ctx);
  const byName = n => list.tools.find(t => t.name === n);
  ok(list.tools.length > 100 && byName('conflicts') && byName('conflicts').state === 'ok', 'tools route');
  ok(['dist-zip', 'dist-enginezip'].every(n => byName(n) && byName(n).state === 'block' && byName(n).why === 'block.write'), 'tools route: dist-zip / dist-enginezip present and listed as refused');
  ok(byName('mapview') && byName('mapview').state === 'ok' && byName('armorsim-ingame') && byName('armorsim-ingame').state === 'block' && byName('armorsim-ingame').why === 'block.write', 'tools route: mapview runs (no --svg), armorsim-ingame refused');
  ok(['goh2as2 --deps scenery', 'workshop', 'goh2as2/unitname'].every(n => byName(n) && byName(n).state === 'dry' && byName(n).dry), 'tools route: goh2as2 --deps scenery, workshop, goh2as2/unitname dry only, with the dry hint: ' + ['goh2as2 --deps scenery', 'workshop', 'goh2as2/unitname'].map(n => JSON.stringify(byName(n) && [byName(n).state, byName(n).dry])).join(' '));
  ok(['uidrive', 'gui'].every(n => !byName(n) || byName(n).state === 'block'), 'tools route: blocked states');
  ok(!byName('edrun') || byName('edrun').state === 'dry', 'tools route: edrun dry');
  // GT-24: maintainer tools and tools the release exe leaves out are not listed (source tree and bundled list), rows stay marked
  const DEVN = ['usage', 'wave', 'sessions', 'sessions wave', 'notes', 'brief', 'scaffold', 'docgen', 'q', 'webcheck', 'buildlog'];
  ok(DEVN.every(n => !byName(n)), 'tools route hides maintainer tools: ' + DEVN.filter(n => byName(n)).join(','));
  const left = C.releaseLeftOut(TOOLS);
  ok(left.has('sessions') && left.has('notes') && left.has('brief') && left.has('wpn'), 'release left-out list read from dist/zip.js');
  ok(!list.tools.some(t => left.has(t.name) || left.has(t.name.split(/[ /]/)[0])), 'tools route lists no tool the release leaves out: ' + list.tools.filter(t => left.has(t.name.split(/[ /]/)[0])).map(t => t.name).join(','));
  // the public copy drops the maintainer rows together with their scripts: a row must stay (marked dev) wherever its script is
  const DEVE = { usage: 'usage/usage.js', wave: '_retired/wave/wave.js', sessions: 'sessions/sessions.js', 'sessions wave': 'sessions/wave.js', notes: 'notes/notes.js', brief: 'brief/brief.js', scaffold: 'scaffold/scaffold.js', docgen: 'docgen/docgen.js', q: 'q/q.js', webcheck: 'webcheck/webcheck.js', buildlog: 'buildlog/buildlog.js' };
  const devHere = DEVN.filter(n => fs.existsSync(path.join(TOOLS, DEVE[n])));
  if (devHere.length < DEVN.length) console.log('skip catalog.json maintainer rows ' + DEVN.filter(n => !devHere.includes(n)).join(', ') + ': their scripts are not in this copy (left out of the public copy on purpose)');
  ok(devHere.every(n => bundled.some(t => t.name === n && t.dev === true)), 'catalog.json keeps the maintainer rows, marked dev: ' + devHere.filter(n => !bundled.some(t => t.name === n && t.dev === true)).join(','));
  ok(bundled.filter(t => left.has(t.name.split(/[ /]/)[0])).every(t => t.dev === true), 'catalog.json marks every left-out tool dev');
  const exeLike = path.join(work, 'exe-tools'); fs.mkdirSync(exeLike, { recursive: true });
  const ex = C.load(exeLike);
  ok(ex.from === 'bundled' && C.visible(ex.tools).length > 50 && !C.visible(ex.tools).some(t => DEVN.includes(t.name) || left.has(t.name.split(/[ /]/)[0])), 'exe (bundled) list hides them too');
  ok(await st(post('check', { tool: 'usage', args: '' })) === 400 && await st(post('help', { tool: 'sessions' })) === 400 && await st(post('run', { tool: 'notes', args: '' })) === 400, 'hidden tools refused by name');

  // ---- argv parsing
  ok(JSON.stringify(R.parseArgs('a "b c" \'d e\' f=g')) === JSON.stringify(['a', 'b c', 'd e', 'f=g']), 'parseArgs quotes');
  ok(await st(post('check', { tool: 'conflicts', args: 'a "b' })) === 400, 'parseArgs open quote 400');
  ok(R.quote('C:\\x y\\m') === '"C:\\x y\\m"' && R.quote('a/b.js') === 'a/b.js', 'quote');

  // ---- fixture: conflicts game (vanilla + ma, mb; mb has a file identical to vanilla)
  const game = path.join(work, 'game');
  for (const m of ['ma', 'mb']) put(game, 'mods/' + m + '/mod.info', ['{mod', ' {Name "' + m + '"}', '}']);
  put(game, 'resource/set/a.def', ['{e1', ' {hp 10}', ' {speed 5}', '}']);
  put(game, 'mods/ma/resource/set/a.def', ['{e1', ' {hp 20}', ' {speed 6}', '}']);
  put(game, 'mods/mb/resource/set/a.def', ['{e1', ' {hp 30}', ' {speed 6}', '}']);
  put(game, 'resource/set/c.def', ['{e3', ' {mass 7}', '}']);
  put(game, 'mods/mb/resource/set/c.def', ['{e3', ' {mass 7}', '}']);

  // ---- check / run / help
  let r = await post('check', { tool: 'conflicts', args: '--game {game} --mods ma,mb', game });
  ok(r.ok && r.argv[1] === game && /^node tools\/conflicts\/conflicts\.js --game /.test(r.line.node) && /^ARSENAL conflicts /.test(r.line.exe), 'check substitutes {game} + lines');
  ok(await st(post('check', { tool: 'conflicts', args: '--mods {mod}' })) === 400, '{mod} empty -> 400');
  ok(await st(post('check', { tool: 'no-such-tool', args: '' })) === 400, 'unknown tool 400');
  const n0 = calls.length;
  r = await post('run', { tool: 'conflicts', args: '--game {game} --mods ma,mb --allow-launch', game });
  ok(!r.ok && !r.ran && r.flag === '--allow-launch' && calls.length === n0, 'run refused, nothing spawned');
  if (byName('uidrive')) { r = await post('run', { tool: 'uidrive', args: '' }); ok(!r.ran && r.why === 'block.launch' && calls.length === n0, 'uidrive refused'); }
  r = await post('run', { tool: 'conflicts', args: '--game {game} --mods ma,mb', game, timeoutSec: 60 });
  ok(r.ran && /hp/.test(r.stdout) && calls[calls.length - 1].cwd.startsWith(path.join(tmpRoot, 'as2gui-pro')), 'run ok in scratch cwd: ' + (r.stderr || '').slice(0, 200));
  r = await post('help', { tool: 'conflicts' });
  ok(r.from === 'source' && r.text.length > 20, 'help from source');

  // ---- E-30 cmdline
  r = await post('cmdline', { cmd: 'check', input: { mod: 'C:/x y/m' } });
  ok(r.node.startsWith('node tools/check/check.js ') && r.node.includes('"') && r.exe.startsWith('ARSENAL check ') && r.launches === false, 'cmdline check: ' + r.node);
  r = await post('cmdline', { cmd: 'play', input: { mod: 'C:/m' } });
  ok(r.launches === true && r.node.startsWith('node tools/as2/as2.js play') && r.exe.startsWith('ARSENAL as2 play'), 'cmdline play launches');
  ok(await st(post('cmdline', { cmd: 'game', input: {} })) === 400 && await st(post('cmdline', { cmd: 'nope' })) === 400, 'cmdline inproc / unknown 400');

  // ---- E-15 conflicts + clean
  r = await post('conflicts', { game, mods: 'ma,mb' });
  ok(r.summary.modMod >= 1 && r.rows.some(x => x.key.includes('hp') && x.winner === 'mb' && x.kind === 'MOD_MOD'), 'conflicts: hp MOD_MOD, mb wins');
  ok(r.perMod.mb.wins >= 1 && r.perMod.ma.loses >= 1 && r.plan.some(l => /hp/.test(l) && /keeps mb/.test(l)) && r.patchTool === false, 'conflicts: per-mod + plan ' + JSON.stringify(r.perMod));
  {   // the same kind groups and codes as Share > Mods together (read-only here), with the link to that tab on the page
    const kinds = require('../share/routes').TOG_KINDS.map(k => k.kind);
    ok(Array.isArray(r.groups) && r.groups.length > 0 && r.groups.every(g => kinds.includes(g.kind) && g.count > 0 && g.codes.length && g.wins && Array.isArray(g.files)) && r.groups.some(g => g.kind === 'value' && g.codes.includes('WARN_CONFLICT_MOD_MOD')) && r.files.every(x => x.code && x.sev),
      'conflicts: kind groups as on Mods together ' + JSON.stringify(r.groups.map(g => g.kind + ':' + g.count)));
    ok(/tx\('share\.tog\.k\.'\+g\.kind\)/.test(ext.script) && /data-together/.test(ext.script) && /LS\.set\('share\.sec','tog'\)/.test(ext.script), 'page: the kinds table and the button to Share > Mods together');
  }
  ok(await st(post('conflicts', { game, mods: 'ma,zz' })) === 400, 'conflicts unknown mod 400');
  ok(await st(post('conflicts', { game, mods: '--x' })) === 400, 'conflicts bad mod name 400');
  r = await post('clean', { game, mods: 'ma,mb', mod: 'mb' });
  ok(r.dry && r.omit.some(f => /c\.def$/.test(f)), 'clean preview lists c.def: ' + JSON.stringify(r));
  ok(await st(post('clean', { game, mods: 'ma,mb', mod: 'mb', write: true, out: path.join(game, 'resource', 'x') })) === 400, 'clean out inside game refused');
  ok(await st(post('clean', { game, mods: 'ma,mb', mod: 'mb', write: true, out: path.join(game, 'mods') })) === 400, 'clean out non-empty refused');
  ok(await st(post('clean', { game, mods: 'ma,mb', mod: 'mb', write: true, out: 'rel/dir' })) === 400, 'clean relative refused');
  ok(await st(post('clean', { game, mods: 'ma,mb', mod: 'mb', write: true, out: 'C:\\SteamLibrary\\steamapps\\workshop\\content\\1' })) === 400, 'clean workshop refused');
  ok(await st(post('clean', { game, mods: 'ma,mb', mod: 'mb', write: true, out: path.join(TOOLS, 'gui', 'zz-pro-out') })) === 400 && !fs.existsSync(path.join(TOOLS, 'gui', 'zz-pro-out')), 'clean in tools refused');
  const out = path.join(work, 'clean-mb');
  r = await post('clean', { game, mods: 'ma,mb', mod: 'mb', write: true, out });
  ok(!r.dry && fs.existsSync(path.join(out, 'resource', 'set', 'a.def')) && !fs.existsSync(path.join(out, 'resource', 'set', 'c.def')) && r.omitted >= 1, 'clean writes copy without c.def: ' + JSON.stringify(r));
  ok(fs.existsSync(path.join(game, 'mods', 'mb', 'resource', 'set', 'c.def')), 'clean leaves the mod alone');
  {   // JOBS: a clean copy stopped from the footer: answers cancelled, the half copy and the folder the run made are removed
    const out2 = path.join(tmpRoot, 'clean-stopped'), job = { writes: false };
    const half = Object.assign({}, ctx, { job, runTool: async (tool, entry, args) => { const o = args[args.indexOf('--out') + 1]; fs.mkdirSync(path.join(o, 'resource'), { recursive: true }); fs.writeFileSync(path.join(o, 'resource', 'half.def'), 'x'); return { code: null, cancelled: true, stdout: '', stderr: '' }; } });
    const sr = await routes['POST /api/x/pro/clean'](new URL('http://x/api/x/pro/clean'), { game, mods: 'ma,mb', mod: 'mb', write: true, out: out2 }, half);
    ok(sr.cancelled === true && job.writes === true && !fs.existsSync(out2), 'clean stopped: cancelled, marked as a write, nothing left in the output folder ' + JSON.stringify(sr));
    ok(fs.existsSync(path.join(game, 'mods', 'mb', 'resource', 'set', 'c.def')), 'clean stopped: the mod untouched');
  }

  // ---- E-4 overdiff / misdiff / verdiff
  const od = path.join(TOOLS, 'overdiff', 'test', 'fixture', 'game', 'mods', 'm');
  r = await post('overdiff', { mod: od });
  ok(r.summary && r.summary.files >= 1 && (r.summary.changed + r.summary.added + r.summary.removed + r.summary.fullShadow) >= 1, 'overdiff summary ' + JSON.stringify(r.summary));
  ok(await st(post('overdiff', {})) === 400, 'overdiff nothing picked 400');
  // GT-36: a mod folder outside <game>/mods was diffed as "not active" and the page said "No differences"
  const g2 = path.join(work, 'game2'), outside = path.join(work, 'mymods');
  put(g2, 'resource/set/units.set', ['{"t1" {cost 350}}', '{"t2" {cost 400}}']);
  put(g2, 'mods/inst/mod.info', ['{mod', ' {Name "inst"}', '}']);
  put(g2, 'mods/inst/resource/set/units.set', ['{"t1" {cost 150}}', '{"t2" {cost 400}}']);
  put(g2, 'mods/noinfo/resource/set/units.set', ['{"t1" {cost 1}}']);
  for (const m of ['loose', 'inst', 'linked']) { put(outside, m + '/mod.info', ['{mod', ' {Name "' + m + '"}', '}']); put(outside, m + '/resource/set/units.set', ['{"t1" {cost 150}}', '{"t2" {cost 400}}']); }
  const n1 = calls.length;
  r = await post('overdiff', { mod: path.join(outside, 'loose'), game: g2 });
  ok(r.notInGame === true && r.summary.changed === 0 && calls.length === n1, 'overdiff: mod outside the game -> notInGame, nothing run ' + JSON.stringify(r.summary));
  r = await post('overdiff', { mod: path.join(outside, 'inst'), game: g2 });
  ok(!r.notInGame && r.via && r.via.how === 'copy' && r.summary.changed === 1 && r.items.some(x => /t1.*cost: 350 -> 150/.test(x.msg)), 'overdiff: outside folder compared through the installed copy ' + JSON.stringify(r.summary));
  r = await post('overdiff', { mod: path.join(g2, 'mods', 'inst'), game: g2 });
  ok(!r.via && r.summary.changed === 1 && r.summary.unreadable === 0, 'overdiff: mod in mods/ changed cost found');
  let linked = false; try { fs.symlinkSync(path.join(outside, 'linked'), path.join(g2, 'mods', 'linked'), 'junction'); linked = true; } catch (e) { console.log('skip junction check: ' + e.code); }
  if (linked) { r = await post('overdiff', { mod: path.join(outside, 'linked'), game: g2 }); ok(r.via && r.via.how === 'link' && r.summary.changed === 1, 'overdiff: junction install found ' + JSON.stringify(r.via)); }
  r = await post('overdiff', { mod: path.join(g2, 'mods', 'noinfo'), game: g2 });
  ok(r.summary.unreadable >= 1 && r.summary.files === 0, 'overdiff: unreadable mod counted, not "no differences" ' + JSON.stringify(r.summary));
  ok(/j\.notInGame/.test(ext.script) && /'pro\.od\.unread',s\.unreadable/.test(ext.script) && /pro\.od\.viaCopy/.test(ext.script), 'page shows notInGame / unreadable / via');
  const mf = path.join(TOOLS, 'misdiff', 'test', 'fixture');
  r = await post('misdiff', { a: path.join(mf, 'a'), b: path.join(mf, 'b') });
  ok(r.summary && r.items.length >= 1 && (r.summary.added + r.summary.removed + r.summary.moved + r.summary.changed + r.summary.logic) >= 1, 'misdiff summary ' + JSON.stringify(r.summary));
  ok(await st(post('misdiff', { a: 'rel', b: 'rel' })) === 400 && await st(post('misdiff', { map: '../x', mods: 'ma', game })) === 400, 'misdiff bad input 400');
  const va = path.join(work, 'va'), vb = path.join(work, 'vb');
  put(va, 'resource/set/a.def', ['{e1', ' {hp 10}', '}']); put(va, 'resource/set/gone.def', ['{g 1}']);
  put(vb, 'resource/set/a.def', ['{e1', ' {hp 11}', ' {armor 2}', '}']); put(vb, 'resource/set/new.def', ['{n 1}']);
  r = await post('verdiff', { a: path.join(va, 'resource'), b: path.join(vb, 'resource') });
  ok(r.summary.added >= 1 && r.summary.removed >= 1 && r.summary.changed >= 1, 'verdiff summary ' + JSON.stringify(r.summary));
  ok(fs.readdirSync(path.join(tmpRoot, 'as2gui-pro', 'verdiff')).length === 0, 'verdiff json cleaned from scratch');

  // ---- E-7 sheets
  r = await post('sheet', { folder: path.join(TOOLS, 'statsheet', 'test', 'fx') });
  ok(r.sheets && r.sheets.weapons && r.sheets.weapons.cols.length > 3 && r.sheets.weapons.rows.length >= 1, 'sheet weapons ' + JSON.stringify(Object.keys(r.sheets || {})));
  ok(['ammo', 'armor'].every(k => r.sheets[k] && r.sheets[k].cols.length > 2), 'sheet ammo + armor');
  ok(!r.line.includes('--cache'), 'sheet line hides the cache path');
  ok(await st(post('sheet', { folder: path.join(TOOLS, 'statsheet', 'test', 'fx'), filter: '(' })) === 400 && await st(post('sheet', { filter: 'x' })) === 400, 'sheet bad filter / no game 400');
  const sh = R.sheetsOf('# weapons\nweapon,range\n"a",10\n"b, c",2\n\n# ammo\nammo\n');
  ok(sh.weapons.rows.length === 2 && sh.weapons.rows[1][0] === 'b, c' && sh.ammo.cols[0] === 'ammo' && sh.ammo.rows.length === 0, 'sheetsOf parser');

  // ---- game parity: the page's game reaches the tools
  // AS64 (no game sent): every argument list above is as before, no --exe
  ok(calls.length > 5 && !calls.some(c => c.args.includes('--exe')), 'as64: no --exe in any run');
  // stand-in tool runner for the other games: records the argv, answers with an empty result (or a games.refuse line)
  const gcalls = []; let refuseWith = null;
  const stubRun = (tool, entry, args, o) => { gcalls.push({ tool, args, cwd: o && o.cwd });
    if (refuseWith) return Promise.resolve({ code: 2, stdout: '', stderr: refuseWith, timedOut: false });
    return Promise.resolve({ code: 0, stdout: '{"findings":[],"info":[]}\n# weapons\nweapon,range\n"a",1\n', stderr: '', timedOut: false }); };
  const gohRoot = path.join(work, 'gohgame'), gohMods = path.join(gohRoot, 'mods');
  put(gohRoot, 'mods/gm/mod.info', ['{mod', ' {name "gm"}', '}']); put(gohRoot, 'binaries/x64/call_to_arms.exe', ['x']);
  const mkCtx = (id, exe, kind, cur, gohd) => ({ gamedir: null, tools: TOOLS, tmpRoot, runTool: stubRun, game: () => game, allowLaunch: false,
    gameId: () => id, exe: () => exe, kind: () => kind, gohDir: () => gohd, curDir: () => cur });
  const cMow = mkCtx('mowas2', 'mowas_2', 'as2', game, gohRoot), cGoh = mkCtx('goh', 'goh', 'goh', gohRoot, gohRoot);
  const gpost = (c, n, body) => routes['POST /api/x/pro/' + n](new URL('http://x/api/x/pro/' + n), body, c);
  const exeAt = a => { const i = a.indexOf('--exe'); return i < 0 ? null : a[i + 1]; };
  const gameAt = a => { const i = a.indexOf('--game'); return i < 0 ? null : a[i + 1]; };
  // MoW:AS2: conflicts, clean preview, overdiff, misdiff --map, statsheet get --exe mowas_2; empty game box = the AS2 install
  for (const [c, want, dir] of [[cMow, 'mowas_2', game], [cGoh, 'goh', gohRoot]]) {
    gcalls.length = 0;
    await gpost(c, 'conflicts', { mods: 'ma,mb' });
    ok(gcalls.length === 2 && gcalls.every(x => exeAt(x.args) === want && gameAt(x.args) === dir), c.gameId() + ': conflicts --exe ' + want + ', game = the current install: ' + JSON.stringify(gcalls.map(x => x.args)));
    gcalls.length = 0; await gpost(c, 'clean', { mods: 'ma,mb', mod: 'mb' });
    ok(exeAt(gcalls[0].args) === want && gameAt(gcalls[0].args) === dir, c.gameId() + ': clean preview --exe ' + want);
    gcalls.length = 0; r = await gpost(c, 'overdiff', { mods: 'ma' });
    ok(exeAt(gcalls[0].args) === want && gameAt(gcalls[0].args) === dir && r.line.includes('--exe ' + want), c.gameId() + ': overdiff --exe ' + want + ' ' + JSON.stringify(gcalls[0].args));
    gcalls.length = 0; r = await gpost(c, 'misdiff', { map: 'single/m1', mods: 'ma' });
    ok(exeAt(gcalls[0].args) === want && gameAt(gcalls[0].args) === dir, c.gameId() + ': misdiff --map --exe ' + want + ' ' + JSON.stringify(gcalls[0].args));
    gcalls.length = 0; await gpost(c, 'misdiff', { a: path.join(mf, 'a'), b: path.join(mf, 'b') });
    ok(exeAt(gcalls[0].args) === null, c.gameId() + ': misdiff two-file form needs no game');
    gcalls.length = 0; r = await gpost(c, 'sheet', {});
    ok(exeAt(gcalls[0].args) === want && gcalls[0].args[0] === dir && r.sheets.weapons && !r.line.includes('--cache'), c.gameId() + ': sheet --exe ' + want + ' ' + JSON.stringify(gcalls[0].args));
  }
  // the sheet cache: MoW:AS2 and AS64 read the same folder, never one cache file
  const cacheOf = a => a[a.indexOf('--cache') + 1];
  gcalls.length = 0; await gpost(cMow, 'sheet', { game }); await gpost(mkCtx('as64', 'as64', 'as2', game, null), 'sheet', { game });
  ok(cacheOf(gcalls[0].args) !== cacheOf(gcalls[1].args) && exeAt(gcalls[1].args) === null, 'sheet cache key carries the game; as64 keeps no --exe');
  // a picked folder wins over the default
  gcalls.length = 0; await gpost(cGoh, 'conflicts', { mods: 'ma', game: g2 });
  ok(gameAt(gcalls[0].args) === g2, 'a picked game folder is kept');
  // (fix) GoH overdiff: a GoH mod folder outside the install is passed as given (overdiff --exe goh mounts it), not "not in game"
  const gohOut = path.join(work, 'gohmods-out', 'mymod'); put(gohOut, 'mod.info', ['{mod', ' {name "mymod"}', '}']);
  gcalls.length = 0; r = await gpost(cGoh, 'overdiff', { mod: gohOut });
  ok(!r.notInGame && gcalls.length === 1 && gcalls[0].args[0] === gohOut && exeAt(gcalls[0].args) === 'goh' && gameAt(gcalls[0].args) === gohRoot, 'goh overdiff: mod folder outside the install is diffed by path ' + JSON.stringify(gcalls[0] && gcalls[0].args));
  gcalls.length = 0; r = await gpost(cMow, 'overdiff', { mod: gohOut, game: g2 });
  ok(r.notInGame === true && gcalls.length === 0, 'mowas2 overdiff: the AS2 rule (GT-36) still applies to a folder outside mods/');
  // (fix) misdiff --map: the map name is lower-cased (vfs keys)
  gcalls.length = 0; await gpost(cGoh, 'misdiff', { map: 'multi/1v1_Hiekalla', mods: 'gm' });
  ok(gcalls[0].args[gcalls[0].args.indexOf('--map') + 1] === 'multi/1v1_hiekalla', 'misdiff --map name lower-cased');
  // (fix) sheet: GoH gets a longer limit; a stopped run promises no cache
  const tcalls = []; const slow = (tool, entry, args, o) => { tcalls.push(o.timeoutMs); return Promise.resolve({ code: 1, stdout: '', stderr: '', timedOut: true }); };
  let sm = ''; try { await routes['POST /api/x/pro/sheet'](null, {}, Object.assign({}, cGoh, { runTool: slow })); } catch (e) { sm = e.message; }
  try { await routes['POST /api/x/pro/sheet'](null, {}, Object.assign({}, cMow, { runTool: slow })); } catch (e) { /* same text */ }
  ok(tcalls[0] === 1800000 && tcalls[1] === 600000 && /30 minutes/.test(sm) && !/cache/i.test(sm), 'sheet: GoH limit 30 min, AS2 10 min, timeout text promises no cache: ' + sm);
  // (fix) launcher: a port tool's {exe} on the GoH tab is the AS2 target, never goh
  r = await gpost(cGoh, 'check', { tool: 'goh2as2', args: '--goh {goh} --exe {exe}' });
  ok(exeAt(r.argv) === 'as64' && r.argv[1] === gohRoot, 'launcher goh: port tool {exe} = as64 ' + JSON.stringify(r.argv));
  r = await gpost(cMow, 'check', { tool: 'goh2as2', args: '--goh {goh} --exe {exe}' });
  ok(exeAt(r.argv) === 'mowas_2', 'launcher mowas2: port tool {exe} = mowas_2');
  // launcher: {game} = the current install (GoH on the GoH tab), {exe} = the vfs exe, {goh} = the GoH install; MoW:AS2 hint without --exe
  r = await gpost(cGoh, 'check', { tool: 'conflicts', args: '--game {game} --mods ma --exe {exe}' });
  ok(r.ok && r.argv[1] === gohRoot && exeAt(r.argv) === 'goh' && !r.exeHint, 'launcher goh: {game} = GoH install, {exe} = goh ' + JSON.stringify(r.argv));
  r = await gpost(cMow, 'check', { tool: 'conflicts', args: '--game {game} --mods ma' });
  ok(r.ok && r.argv[1] === game && r.exeHint === true, 'launcher mowas2: {game} = the AS2 install, hint to add --exe');
  r = await gpost(cMow, 'check', { tool: 'conflicts', args: '--game {game} --mods ma --exe {exe}' });
  ok(exeAt(r.argv) === 'mowas_2' && !r.exeHint && r.line.node.includes('--exe mowas_2'), 'launcher mowas2: {exe} = mowas_2, no hint');
  r = await gpost(cMow, 'check', { tool: 'unitbox', args: '{mod} --game {game} --goh {goh}', mod: 'C:/m' });
  ok(r.argv[2] === game && r.argv[4] === gohRoot, 'launcher {goh} = the GoH install: ' + JSON.stringify(r.argv));
  ok(await st(gpost(mkCtx('mowas2', 'mowas_2', 'as2', game, null), 'check', { tool: 'unitbox', args: '--goh {goh}' })) === 400, 'launcher {goh} with no GoH install -> 400');
  r = await post('check', { tool: 'conflicts', args: '--game {game} --mods ma --exe {exe}', game });
  ok(exeAt(r.argv) === 'as64' && !r.exeHint, 'launcher as64 (no game sent): {exe} = as64');
  gcalls.length = 0; r = await gpost(cMow, 'run', { tool: 'conflicts', args: '--game {game} --mods ma --exe {exe}' });
  ok(r.ran && exeAt(gcalls[0].args) === 'mowas_2', 'launcher run carries --exe mowas_2');
  // a tool that refuses the game: the plain line comes back as {na}, not as an error
  refuseWith = 'statsheet: not available for GoH: no GoH branch (GHGPL-05)\n';
  r = await gpost(cGoh, 'sheet', {});
  ok(r.na === 'statsheet: not available for GoH: no GoH branch (GHGPL-05)' && r.line && !r.line.includes('--cache'), 'sheet refused -> na line ' + JSON.stringify(r.na));
  refuseWith = 'conflicts: not available for GoH: x (ROW-1)'; r = await gpost(cGoh, 'conflicts', { mods: 'gm' });
  ok(r.na && /not available for GoH/.test(r.na), 'conflicts refused -> na line');
  r = await gpost(cGoh, 'overdiff', { mods: 'gm' }); ok(r.na, 'overdiff refused -> na line');
  r = await gpost(cGoh, 'misdiff', { map: 'm', mods: 'gm' }); ok(r.na, 'misdiff refused -> na line');
  r = await gpost(cGoh, 'clean', { mods: 'gm', mod: 'gm' }); ok(r.na && r.dry && r.omit.length === 0, 'clean preview refused -> na line');
  refuseWith = 'usage error'; ok(await st(gpost(cGoh, 'conflicts', { mods: 'gm' })) === 400, 'exit 2 without the refuse line is still an error');
  refuseWith = null;
  // clean copy: nothing is written into the GoH install, its mods folder included
  ok(await st(gpost(cGoh, 'clean', { mods: 'gm', mod: 'gm', write: true, out: path.join(gohMods, 'newcopy') })) === 400 && !fs.existsSync(path.join(gohMods, 'newcopy')), 'clean: GoH mods/<new> refused');
  let gm = ''; try { await gpost(cGoh, 'clean', { mods: 'gm', mod: 'gm', write: true, out: path.join(gohRoot, 'x') }); } catch (e) { gm = e.message; }
  ok(/does not write into the Gates of Hell install/.test(gm), 'clean: plain GoH refusal line: ' + gm);
  gm = ''; try { await gpost(cMow, 'clean', { mods: 'ma', mod: 'ma', write: true, out: path.join(gohRoot, 'x2'), game }); } catch (e) { gm = e.message; }
  ok(/Gates of Hell install/.test(gm), 'clean: a GoH install path refused from the other tabs too');
  ok(R.outGuard(path.join(work, 'fresh-out'), game, cMow, false) === path.join(work, 'fresh-out'), 'clean: a new folder outside the games is fine');
  // page: game box = the current game's folder, plain na line, launcher {exe} button and hint
  ok(/i\.value=\(typeof curFolder==='function'\?curFolder\(\):gameDir\(\)\)/.test(ext.script) && !/i\.value=gameDir\(\);/.test(ext.script), 'page: game box defaults to curFolder()');
  ok((ext.script.match(/naLine\(\w+,j\)/g) || []).length >= 6 && /'pro\.na',\{m:j\.na\}/.test(ext.script), 'page: na line on every diff, conflicts, clean and sheet result');
  ok(/' --exe \{exe\}'/.test(ext.script) && /j\.exeHint/.test(ext.script), 'page: launcher {exe} button and MoW:AS2 hint');

  // (wave 3) verdiff: keyLevel 'files only (games differ)' gives differ (its own hint), not the snapshot hint
  const vdRun = level => (tool, entry, args) => { const jf = args[args.indexOf('--json') + 1];
    fs.writeFileSync(jf, JSON.stringify(Object.assign({ tool: 'verdiff', file: { added: 1, removed: 0, changed: 0 }, renames: [], maybes: [], keys: level === 'keys' ? { def: { files: 1, added: 1, removed: 0 } } : null }, level ? { keyLevel: level } : {})));
    return Promise.resolve({ code: 0, stdout: '', stderr: '', timedOut: false }); };
  const vd = async level => (await routes['POST /api/x/pro/verdiff'](null, { a: path.join(va, 'resource'), b: path.join(vb, 'resource') }, Object.assign({}, cGoh, { runTool: vdRun(level) }))).summary;
  let s1 = await vd('files only (games differ)'), s2 = await vd('names+crc only'), s3 = await vd('keys'), s4 = await vd(null);
  ok(s1.differ === true && s1.snap === false, 'verdiff games differ -> differ, no snap ' + JSON.stringify(s1));
  ok(s2.snap === true && s2.differ === false && s3.snap === false && s3.differ === false && s3.keyLevel === true, 'verdiff snapshots -> snap; keys -> neither ' + JSON.stringify([s2, s3]));
  ok(s4.snap === true && s4.differ === false, 'verdiff JSON with no keyLevel (older tool): snap from keys as before');
  ok(L.en['pro.vd.differ'] && /s\.differ\)o4\.appendChild\(el\('p','hint',tx\('pro\.vd\.differ'\)\)\);else if\(s\.snap\)/.test(ext.script), 'page: games-differ hint drawn in place of the snapshot hint');
  // (wave 3 fix) launcher: a port group row on the GoH tab gets {game} = the AS2 install (its --game is the AS2 view), {exe} = as64;
  // the game box sent as the GoH install (the page's default there) is taken as empty; another picked folder is kept; MoW:AS2 unchanged
  r = await gpost(cGoh, 'check', { tool: 'portlint', args: '{mod} --game {game} --exe {exe}', mod: 'C:/m' });
  ok(gameAt(r.argv) === game && exeAt(r.argv) === 'as64', 'launcher goh: port tool {game} = the AS2 install ' + JSON.stringify(r.argv));
  r = await gpost(cGoh, 'check', { tool: 'portlint', args: '{mod} --game {game} --exe {exe}', mod: 'C:/m', game: gohRoot });
  ok(gameAt(r.argv) === game, 'launcher goh: port tool, game box = GoH install -> the AS2 install ' + JSON.stringify(r.argv));
  r = await gpost(cGoh, 'check', { tool: 'portlint', args: '{mod} --game {game}', mod: 'C:/m', game: g2 });
  ok(gameAt(r.argv) === g2, 'launcher goh: port tool keeps another picked folder');
  r = await gpost(cMow, 'check', { tool: 'portlint', args: '{mod} --game {game} --exe {exe}', mod: 'C:/m' });
  ok(gameAt(r.argv) === game && exeAt(r.argv) === 'mowas_2', 'launcher mowas2: port tool {game} = the AS2 install, {exe} = mowas_2');
  r = await gpost(cGoh, 'check', { tool: 'conflicts', args: '--game {game} --mods ma' });
  ok(gameAt(r.argv) === gohRoot, 'launcher goh: a non-port tool keeps {game} = the GoH install');
  // (sweep) a GoH slot of a port tool (--goh, --a, --goh-mod, --base-a) given {game} keeps the GoH install; the AS2 slots still get the AS2 install
  ok(['goh2as2', 'portdiff', 'pairdiff'].every(n => (C.visible(C.load(TOOLS).tools).find(x => x.name === n) || {}).group === 'port'), 'goh2as2, portdiff, pairdiff are port rows');
  r = await gpost(cGoh, 'check', { tool: 'portdiff', args: '--as2 {game} --goh {game}' });
  ok(r.argv[1] === game && r.argv[3] === gohRoot, 'launcher goh: portdiff --goh {game} = the GoH install, --as2 {game} = the AS2 install ' + JSON.stringify(r.argv));
  r = await gpost(cGoh, 'check', { tool: 'pairdiff', args: '--a {game} --b {game} --goh-mod={game}' });
  ok(r.argv[1] === gohRoot && r.argv[3] === game && r.argv[4] === '--goh-mod=' + gohRoot, 'launcher goh: pairdiff --a {game} / --goh-mod={game} = the GoH install ' + JSON.stringify(r.argv));
  r = await gpost(cGoh, 'check', { tool: 'pairdiff', args: '--a {game} --b {game} --base-a {game} --base-b {game} --out x.json' });
  ok(r.argv[5] === gohRoot && r.argv[7] === game, 'launcher goh: pairdiff --base-a {game} = the GoH install, --base-b {game} = the AS2 install ' + JSON.stringify(r.argv));
  r = await gpost(cMow, 'check', { tool: 'portdiff', args: '--goh {game}' });
  ok(r.argv[1] === game, 'launcher mowas2: no GoH slot rule (the box is the AS2 install there)');
  r = await gpost(cGoh, 'check', { tool: 'conflicts', args: '--goh {game}' });
  ok(r.argv[1] === gohRoot, 'launcher goh: non-port tool unchanged');
  ok(/'pro\.ins\.goh',function\(\)\{args\.value=\(args\.value\+' \{goh\}'\)/.test(ext.script) && ['en', 'ru', 'uk', 'zh'].every(c => L[c]['pro.ins.goh'] && /\{goh\}/.test(L[c]['pro.args.hint']) && (L[c]['pro.args.hint'].match(/\{goh\}/g) || []).length >= 2), 'page: Insert {goh} button; hint says port tools on the GoH tab take {goh} (four languages)');
  // (sweep) launcher run: a tool's games.refuse line (exit 2) comes back as na (e.g. defcheck under GoH, PORT-171)
  refuseWith = 'defcheck: not available for Gates of Hell: x (PORT-171)\n';
  r = await gpost(cGoh, 'run', { tool: 'conflicts', args: '--game {game} --mods gm --exe {exe}' });
  ok(r.ran && r.na === 'defcheck: not available for Gates of Hell: x (PORT-171)', 'launcher run: refusal -> na ' + JSON.stringify(r.na));
  refuseWith = null;
  r = await gpost(cGoh, 'run', { tool: 'conflicts', args: '--game {game} --mods gm' }); ok(r.ran && r.na === null, 'launcher run: no refusal -> na null');
  ok(/if\(j\.na\)\{out\.appendChild\(el\('p','hint',tx\('pro\.na',\{m:j\.na\}\)\)\);return\}/.test(ext.script), 'page: launcher run shows the na line');
  // (sweep) research sheet (GoH only) is parsed and has a tab
  const shr = R.sheetsOf('# price\nunit\n"u",1\n# research\nentry,requires\n"t1",""\n');
  ok(shr.research && shr.research.rows.length === 1 && shr.price.rows.length === 1, 'sheetsOf: research sheet kept');
  ok(/'price','research'\]\.forEach/.test(ext.script) && ['en', 'ru', 'uk', 'zh'].every(c => L[c]['pro.sh.research']), 'page: research sheet tab');
  // (wave 3) lang: the game is written AS64 in visible text (tools/gui/test/test-lang.js rule): no bare lower-case as64
  const BARE = /(?<![\w.\/\\#+$'"`-])as64(?![\w+\/\\"`]|'(?!s\b)|\.\w)/, FLAG = /--(?:to|target|exe|from|game)[ =]as64\b/g;
  const bareKeys = []; for (const c of Object.keys(L)) for (const [k, v] of Object.entries(L[c])) if (BARE.test(String(v).replace(FLAG, ''))) bareKeys.push(c + ' ' + k);
  ok(!bareKeys.length, 'lang: no bare lower-case as64: ' + bareKeys.join(', '));

  // search boxes (searchKit, owner 2026-11-19): the names route and the page in a stand-in browser
  {
    const gd = path.join(work, 'namesgame');
    put(gd, 'resource/map/multi/zzm1/terrain.mi', ['{x}']); put(gd, 'resource/entity/vehicle/tank/zzt1.def', ['{x}']); put(gd, 'resource/set/stuff/gun/zzg1.set', ['{x}']);
    fs.writeFileSync(path.join(gd, 'as64.exe'), 'x');
    const nr = await routes['GET /api/x/pro/names'](new URL('http://x/api/x/pro/names?game=' + encodeURIComponent(gd)), null, ctx);
    ok(nr.maps.includes('multi/zzm1') && nr.names.some(x => x.n === 'zzt1' && x.k === 'unit') && nr.names.some(x => x.n === 'zzg1' && x.k === 'stuff') && nr.dirs.includes('resource/entity/**') && nr.dirs.includes('resource/map/multi/**'), 'names route: maps, unit/weapon names, resource globs ' + JSON.stringify(nr).slice(0, 300));
    // CACHE (gui README contract 1): the names are kept in the shared store under the game stamp; the view is the shared one
    {
      const RT = require('./routes'), N = RT._names, GV = require('../../../lib/gameview'), vfs = require('../../../lib/vfs'), build0 = vfs.build;
      const S = N.namesStore(ctx), st = () => S.state('pro.names', N.NAMES_VER, N.namesParts(gd, ''), { game: GV.stamp({ gameDir: gd }) });
      const ask = () => routes['GET /api/x/pro/names'](new URL('http://x/api/x/pro/names?game=' + encodeURIComponent(gd)), null, ctx);
      const restart = () => { N.NAMES.clear(); GV.drop(); };
      let builds = 0; vfs.build = o => { builds++; return build0(o); };
      try {
        ok(st().state === 'ready', 'cache: the names are in the store');
        restart(); builds = 0;
        const n2 = await ask();
        ok(builds === 0 && JSON.stringify(n2) === JSON.stringify(nr), 'cache: after a restart the kept names are served, equal, no view built');
        put(gd, 'resource/entity/vehicle/tank/deep/zzt9.def', ['{x}']); restart();   // a loose file deep in the game: not in the game stamp
        ok((await ask()).names.every(x => x.n !== 'zzt9') && builds === 0, 'cache: a file the game stamp does not cover leaves the kept names');
        require('../../../lib/zipwrite').writeZip(path.join(gd, 'resource', 'extra.pak'), [['entity/vehicle/tank/zzt7.def', Buffer.from('{x}\r\n')]]); restart();
        ok(st().state === 'stale', 'cache: a new pak makes them stale');
        const n3 = await ask();
        ok(builds === 1 && n3.names.some(x => x.n === 'zzt7') && n3.names.some(x => x.n === 'zzt9') && st().state === 'ready', 'cache: read again from one build of the shared view');
        S.clear('pro.names'); N.NAMES.clear();
        ok(JSON.stringify(await ask()) === JSON.stringify(n3) && builds === 1, 'cache: the kept answer equals a fresh one (the shared view is not built twice)');
        const P = require('./index').prep[0], q = { mod: '', game: { id: 'as64', dir: gd } }, sets = [];
        ok(P.id === 'pro.names' && P.needs.join() === 'game.view' && P.areas.length === 0 && ['en', 'ru', 'uk', 'zh'].every(g => (require('./lang')[g] || {})[P.title]), 'prep: pro.names shape, title in four languages');
        S.clear('pro.names'); N.NAMES.clear();
        ok(P.state(ctx, q).state === 'none', 'prep: none after a clear');
        const pr = await P.run(ctx, q, { cancelled: false, set: o => sets.push(o) });
        ok(pr.names === n3.names.length && sets.length === 2 && P.state(ctx, q).state === 'ready', 'prep: run fills the store');
      } finally { vfs.build = build0; }
      fs.rmSync(path.join(gd, 'resource', 'extra.pak'), { force: true }); fs.rmSync(path.join(gd, 'resource', 'entity', 'vehicle', 'tank', 'deep'), { recursive: true, force: true }); restart();
    }
    const none = await routes['GET /api/x/pro/names'](new URL('http://x/api/x/pro/names'), null, ctx);
    ok(none.maps.length === 0 && none.names.length === 0, 'names route: no game, empty lists');
    const FD = require('../units/fakedom');
    const rows = []; for (let i = 0; i < 450; i++) rows.push(['r' + i, String(i)]);
    const route = (u, b) => { const p = u.split('?')[0];
      if (p === '/api/x/pro/tools') return { dir: 'T:/tools', tools: [{ name: 'overdiff', group: 'diff', run: 'node overdiff', what: 'compare a mod', state: 'ok' }, { name: 'zzcheck', group: 'check', run: 'node zz', what: 'checks', state: 'ok', entry: 'zz/zz.js' }] };
      if (p === '/api/x/pro/help') return { text: 'help' };
      if (p === '/api/installed') return { game: 'G:/game', mods: [{ name: 'ma' }, { name: 'mb' }] };
      if (p === '/api/x/pro/names') return nr;
      if (p === '/api/x/pro/sheet') return { line: 'node x', sheets: { weapons: { cols: ['name', 'n'], rows } } };
      return {}; };
    const pg = FD.runPage('pro', ext.script, ext.lang, { route, S: { mod: 'D:/mymod', cmds: {} }, pickDir: 'D:/picked', env: { gameDir: () => 'G:/game', curFolder: () => 'G:/game', toast: () => {}, askDo: null } });
    ok(!pg.sent.some(x => String(x.url).indexOf('/api/x/pro/tools') === 0 || String(x.url).indexOf('/api/installed') === 0), 'page: nothing is asked while the page is built');
    pg.screen.refresh(); pg.screen.focus();   // the first show (show0: refresh, then focus): the tool list is asked now, once
    for (let i = 0; i < 6; i++) await FD.settle();
    const kits = () => pg.root.all(e => e.dataset && e.dataset.sk).map(e => e.dataset.sk);
    const kit = k => pg.root.all(e => e.dataset && e.dataset.sk === k)[0];
    const opts = k => kit(k).all(e => e.getAttribute && e.getAttribute('role') === 'option').map(e => e.textContent);
    ok(kits().includes('pro.tools.q'), 'page: tools search is a kit ' + kits().join());
    const q = kit('pro.tools.q').all(e => e.tagName === 'INPUT')[0];
    FD.type(pg.doc, q, 'zz'); q._sk.flush(); for (let i = 0; i < 3; i++) await FD.settle(); q._sk.flush();
    ok(opts('pro.tools.q').some(t => t.includes('zzcheck')), 'page: tools index hits zzcheck ' + opts('pro.tools.q').join('|'));
    // Sheets: game, mods, folder, filter kits; mods index after the last comma; table filter kit with a capped draw
    FD.userClick(pg.doc, pg.root.all(e => e.tagName === 'BUTTON' && e.textContent === ext.lang.en['pro.tab.sheet'])[0]);
    await FD.settle();
    ok(['pro.game', 'pro.mods', 'pro.sheet.folder', 'pro.sheet.filter'].every(k => kits().includes(k)) && !pg.root.all(e => e.tagName === 'DATALIST').length, 'page: sheet boxes are kits, no datalist ' + kits().join());
    const mi = kit('pro.mods').all(e => e.tagName === 'INPUT')[0];
    FD.type(pg.doc, mi, 'ma,m'); mi.selectionStart = 4; for (let i = 0; i < 3; i++) { mi._sk.flush(); await FD.settle(); } mi._sk.flush();
    ok(opts('pro.mods').some(t => t.includes('mb')), 'page: mods index offers installed mods for the last part ' + opts('pro.mods').join('|'));
    const fi = kit('pro.sheet.filter').all(e => e.tagName === 'INPUT')[0];
    FD.type(pg.doc, fi, 'zzt'); for (let i = 0; i < 3; i++) { fi._sk.flush(); await FD.settle(); } fi._sk.flush();
    ok(opts('pro.sheet.filter').some(t => t.includes('zzt1')), 'page: sheet filter index has unit names ' + opts('pro.sheet.filter').join('|'));
    // Browse = the file picker where the things live (seeded: the spec each Browse click sends, and what a pick puts in the box)
    const PK = []; pg.picker((spec, done) => PK.push({ spec, done }));
    const browse = k => { FD.userClick(pg.doc, kit(k).all(e => e.classList && e.classList.contains('sk-browse'))[0]); return PK.pop(); };
    const sb = browse('pro.sheet.folder');
    ok(sb && sb.spec.mode === 'dir' && sb.spec.view === 'disk' && sb.spec.start === 'D:/mymod', 'page: sheet folder Browse = the folder picker on the disk at the mod ' + JSON.stringify(sb && sb.spec));
    sb.done('D:/picked', { view: 'disk', path: 'D:/picked' });
    ok(kit('pro.sheet.folder').all(e => e.tagName === 'INPUT')[0].value === 'D:/picked', 'page: sheet folder Browse pick puts the folder in');
    const gb = browse('pro.game');
    ok(gb && gb.spec.mode === 'dir' && gb.spec.start === 'G:/game', 'page: game folder Browse at the game folder in the box ' + JSON.stringify(gb && gb.spec));
    const fb = browse('pro.sheet.filter');
    ok(fb && fb.spec.view === 'data' && fb.spec.start === 'entity' && fb.spec.exts.join() === 'def,set,ext', 'page: name filter Browse = the game data at entity/ ' + JSON.stringify(fb && fb.spec));
    fb.done('set/stuff/gun/zzg1.set', { view: 'data', path: 'set/stuff/gun/zzg1.set', name: 'zzg1.set' });
    ok(fi.value === 'zzg1', 'page: name filter Browse pick gives the name without extension ' + fi.value);
    mi.value = 'ma'; const mbB = browse('pro.mods');
    ok(mbB && mbB.spec.mode === 'dir' && mbB.spec.start === 'G:/game/mods', 'page: mods Browse = the game mods folder ' + JSON.stringify(mbB && mbB.spec));
    mbB.done('G:/game/mods/mb', { view: 'disk', path: 'G:/game/mods/mb' });
    ok(mi.value === 'ma,mb', 'page: mods Browse pick adds the folder name after a comma ' + mi.value);
    const tb = browse('pro.tools.q');
    ok(tb && tb.spec.view === 'disk' && tb.spec.start === 'T:/tools' && tb.spec.exts.join() === 'js', 'page: tools search Browse = the tools folder, .js ' + JSON.stringify(tb && tb.spec));
    tb.done('T:/tools/zz/zz.js', { view: 'disk', path: 'T:/tools/zz/zz.js' });
    ok(q.value === 'zzcheck', 'page: tools Browse pick gives the tool of that file ' + q.value);
    fi.value = ''; mi.value = '';
    fi.value = ''; FD.userClick(pg.doc, pg.root.all(e => e.tagName === 'BUTTON' && e.textContent === ext.lang.en['pro.sh.go'])[0]);
    for (let i = 0; i < 4; i++) await FD.settle();
    const trs = () => pg.root.all(e => e.tagName === 'TR').length;
    ok(kits().includes('pro.table.filter') && trs() === 201 && pg.root.all(e => e.tagName === 'BUTTON' && e.textContent === 'Show 250 more').length === 1, 'page: table draws 200 rows and Show more ' + trs());
    const tf = kit('pro.table.filter').all(e => e.tagName === 'INPUT')[0];
    FD.type(pg.doc, tf, 'r44'); for (let i = 0; i < 4; i++) await FD.settle();
    ok(trs() === 1 + rows.filter(r => r[0].includes('r44')).length, 'page: table filter on precomputed text, drawn in the next frame ' + trs());
    ok(!FD.checkBlocks(pg.root).length, 'page: blocks clean with the kits ' + FD.checkBlocks(pg.root).slice(0, 5).join(' | '));
  }

  // nothing written into the tools tree or the fixtures
  ok(!calls.some(c => !c.cwd || !c.cwd.startsWith(tmpRoot)) && !gcalls.some(c => !c.cwd || !c.cwd.startsWith(tmpRoot)), 'every run used a scratch cwd');
  console.log(bad ? bad + ' failures' : 'pro PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + (e.stack || e)); process.exit(1); });

// gui test: starts the server in process on a free port, calls every command, closes it. Never starts a game.
//   node tools/gui/test/test.js [scratchDir] [--slow]     (default: a fresh folder under the OS temp dir; --slow adds fix apply, upgrade --then-fix, full check, ~6 min)
// install/uninstall run for real, but only into a fake game dir inside the scratch folder.
// Each real run is compared with the same CLI run directly: exit code, stdout lines, stderr lines, parsed result.
// prove and edrun: only refusal, validation, argv building and edrun --dry; as2 probe/e2e/install: --dry only.
// Author: Imperator_Aug (ARSENAL, ia-fde5880c)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const gui = require('../gui'), contract = require('../contract'), gamedir = require('../../lib/gamedir');
const TOOLS = path.join(__dirname, '..', '..');
const SLOW = process.argv.includes('--slow') || process.env.AS2GUI_SLOW === '1';
const S = path.resolve(process.argv.slice(2).find(a => a !== '--slow') || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-test-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra ? '\n  ' + String(extra).slice(0, 600) : '')); } };

function req(port, method, url, body, hdr) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ host: '127.0.0.1:' + port }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, hdr) }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); resolve({ status: res.statusCode, text: t, headers: res.headers }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const J = r => JSON.parse(r.text);
const runB = (port, cmd, input) => req(port, 'POST', '/api/run?stream=0', { cmd, input }).then(r => ({ status: r.status, j: J(r) }));
function cli(script, args) {
  const r = cp.spawnSync(process.execPath, [path.join(TOOLS, script), ...args], { encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
  const sp = s => (s || '').split('\n').map(l => l.replace(/\r$/, '')).filter((l, i, a) => l !== '' || i < a.length - 1);
  return { code: r.status, out: sp(r.stdout), err: sp(r.stderr) };
}
const lines = (j, s) => j.lines.filter(l => l.s === s).map(l => l.line);
// compare a server run with the CLI run: exit code, stdout, stderr
function same(name, j, c, norm) {
  const n0 = norm || (x => x);
  // run-to-run noise that is not output of the contract: "43 s" timings, / vs \ in paths
  const n = l => n0(l).replace(/"ms": \d+/g, '"ms": <t>').replace(/\\\\/g, '/').replace(/\\/g, '/').replace(/\b\d+(\.\d+)? ?(ms|s)\b/g, '<t>');
  const np = x => !/^PROGRESS /.test(x);   // GUI-LOC: per-tool start/done lines come in pool order, checked in tools/check/test
  const diff = (a, b) => { a = a.filter(np).map(n); b = b.filter(np).map(n); if (a.length !== b.length) return `${a.length} vs ${b.length} lines`; const i = a.findIndex((x, k) => x !== b[k]); return i < 0 ? null : `line ${i}: ${a[i]} | ${b[i]}`; };
  ok(j.code === c.code, name + ': exit code ' + j.code + ' vs CLI ' + c.code, lines(j, 'err').join('\n'));
  const d1 = diff(lines(j, 'out'), c.out), d2 = diff(lines(j, 'err'), c.err);
  ok(!d1, name + ': stdout lines differ', d1); ok(!d2, name + ': stderr lines differ', d2);
}

// first difference of two parsed results, after the same noise rules as the line compare; null = equal
function jdiff(a, b, norm) {
  const fix = (k, v) => (typeof v === 'string' ? (norm ? norm(v) : v).replace(/\\\\|\\/g, '/').replace(/check-ov-[A-Za-z0-9]+/g, 'check-ov-X').replace(/\b\d+(\.\d+)? ?(ms|s)\b/g, '<t>') : (/^(ms|secs|elapsed|time|date|at)$/i.test(k) && typeof v === 'number' ? 0 : v));
  const x = JSON.stringify(a, fix), y = JSON.stringify(b, fix);
  if (x === y) return null;
  let i = 0; while (x[i] === y[i]) i++;
  return x.slice(Math.max(0, i - 60), i + 60) + ' | ' + y.slice(Math.max(0, i - 60), i + 60);
}

function inventMod(dir) {
  fs.mkdirSync(path.join(dir, 'resource', 'set'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mod.info'), '{Mod\r\n {Name "guitest"}\r\n {Description "invented mod for the gui test"}\r\n {MinGameVersion "3.261"}\r\n}\r\n');
  fs.writeFileSync(path.join(dir, 'resource', 'set', 'note.set'), '{note "x"}\r\n');
}

async function main() {
  const gd = gamedir.resolve({});
  const G = gd.dir;
  console.log('scratch ' + S + '; game ' + (G ? 'found (' + gd.source + ')' : 'NOT FOUND: game-dependent commands are skipped'));
  const srv = await gui.start({ port: 0 });
  const port = srv.port;
  try {
    // ---- binding + guards
    ok(srv.server.address().address === '127.0.0.1', 'binds 127.0.0.1 only');
    let h = J(await req(port, 'GET', '/api/health')); ok(h.ok === true && h.allowLaunch === false, 'health');
    ok(/<b class=brand>ARSENAL<\/b>/.test((await req(port, 'GET', '/')).text), 'page served');
    ok((await req(port, 'GET', '/api/health', undefined, { host: 'evil.example' })).status === 403, 'bad Host refused');
    ok((await req(port, 'GET', '/api/health', undefined, { origin: 'http://evil.example' })).status === 403, 'bad Origin refused');
    ok((await req(port, 'POST', '/api/run', 'x', { 'content-type': 'text/plain' })).status === 415, 'non-JSON POST refused');
    ok((await req(port, 'GET', '/nope')).status === 404, '404');
    const cmds = J(await req(port, 'GET', '/api/commands')).commands;
    const want = ['game', 'install', 'uninstall', 'probe', 'e2e', 'dev-loop', 'upgrade', 'check', 'fix', 'gen', 'prove', 'edrun'];
    ok(want.every(w => cmds.some(c => c.id === w)), 'contract lists all commands');
    ok(cmds.every(c => c.fields.length && c.summary), 'every command has a summary and fields');

    // ---- argv building (no process)
    const b = (c, i) => contract.buildArgv(c, i, { base: S });
    ok(b('prove', { game: S, unit: 't34_0', army: 'rus', plan: true }).launches === false, 'prove plan = no launch');
    ok(b('prove', { game: S, unit: 't34_0', army: 'rus' }).launches === true, 'prove without plan = launch');
    ok(b('edrun', { pairs: 'p.json', out: 'o' }).launches === true && b('edrun', { pairs: 'p.json', out: 'o', dry: true }).launches === false, 'edrun launch flag follows dry');
    ok(JSON.stringify(b('fix', { mod: S, mode: 'plan', out: S, game: S, only: ['lng', 'set'], set: ['a:b=c', 'd:e=f'] }).args.slice(2).filter((_, i) => i > 3)) !== '[]', 'fix argv builds lists');
    for (const [c, i, m] of [['check', {}, 'mod is required'], ['check', { mod: S, bogus: 1 }, 'unknown input'], ['check', { mod: '--x' }, 'dash value'], ['fix', { mod: S, mode: 'zap', out: S, game: S }, 'bad enum'], ['gen', {}, 'gen needs spec']]) {
      let e = null; try { b(c, i); } catch (x) { e = x; } ok(e instanceof contract.InputError, 'input refused: ' + m);
    }
    ok(b('gen', { sample: true }).args[0] === '--sample', 'gen sample needs no spec');
    ok(b('fix', { mod: S, mode: 'plan', game: S }).args.indexOf('--out') < 0, 'I-18: fix plan needs no out');
    { let e = null; try { b('fix', { mod: S, mode: 'apply', game: S }); } catch (x) { e = x; } ok(e instanceof contract.InputError && /out is required for mode apply/.test(e.message), 'I-18: fix apply without out refused', e && e.message); }
    // game parity: new --target, fix --target goh, translate --exe, game kind (checked, never on an argv)
    { const nd = path.join(S, 'np');
      ok(b('new', { dir: nd }).args.join() === ['new', nd].join() && b('new', { dir: nd, target: 'as64' }).args.join() === ['new', nd, '--target', 'as64'].join(), 'new: no target = the old argv; target as64 adds --target as64');
      ok(b('new', { dir: nd, target: 'mowas2', dryRun: true }).args.join() === ['new', nd, '--dry-run', '--target', 'mowas2'].join(), 'new: target mowas2 -> --target mowas2', b('new', { dir: nd, target: 'mowas2', dryRun: true }).args.join());
      ok(b('new', { dir: nd, target: 'goh', game: S }).args.join() === ['new', nd, '--game', S, '--target', 'goh'].join(), 'new: target goh with the GoH folder as --game');
      ok(b('fix', { mod: S, mode: 'plan', game: S, target: 'goh' }).args.slice(-2).join() === '--target,goh', 'fix: target enum takes goh');
      const tr = { goh: S, entity: 'x', out: path.join(S, 'tro') };
      ok(b('translate', Object.assign({ exe: 'mowas_2' }, tr)).args.join().includes('--exe,mowas_2') && b('translate', Object.assign({ exe: 'as64' }, tr)).args.join().includes('--exe,as64') && !b('translate', tr).args.includes('--exe'), 'translate: exe as64 or mowas_2 -> --exe, none when not given');
      ok(b('game', { kind: 'goh' }).args.length === 0 && b('game', { kind: 'as2' }).args.length === 0, 'game: kind as2 or goh is accepted and stays off the argv');
      for (const [c, i, m] of [['new', { dir: nd, target: 'classic' }, 'new target classic'], ['translate', Object.assign({ exe: 'goh' }, tr), 'translate exe goh'], ['game', { kind: 'as64' }, 'game kind as64']]) {
        let e = null; try { b(c, i); } catch (x) { e = x; } ok(e instanceof contract.InputError && /one of/.test(e.message), 'game parity enum refused: ' + m, e && e.message); } }

    // ---- launching commands are refused by default
    let r = await runB(port, 'prove', { game: S, unit: 'x', army: 'rus' }); ok(r.status === 403, 'prove refused without --allow-launch', JSON.stringify(r.j));
    r = await runB(port, 'edrun', { pairs: path.join(S, 'p.json'), out: S }); ok(r.status === 403, 'edrun without dry refused', JSON.stringify(r.j));
    r = await runB(port, 'e2e', { mod: S, map: 'm' }); ok(r.status === 403, 'e2e without dry refused');
    r = await runB(port, 'check', { mod: S, bogus: 1 }); ok(r.status === 400, 'bad input is 400');
    r = await runB(port, 'nope', {}); ok(r.status === 400, 'unknown cmd is 400');

    // ---- game
    const cg = cli('as2/as2.js', ['game']);
    r = await runB(port, 'game', {}); same('game', r.j, cg);
    ok(r.j.result && (r.j.result.dir === G || (!G && r.j.result.dir === null)), 'game result matches gamedir');
    const gj = J(await req(port, 'GET', '/api/game')); ok(gj.dir === (G || null), '/api/game');

    // ---- check, fix on an invented mod
    const mod = path.join(S, 'guitest'); inventMod(mod);
    if (G) {
      const cj = path.join(S, 'cli-check.json');
      const cc = cli('check/check.js', [mod, '--game', G, '--fast', '--json', cj]);
      r = await runB(port, 'check', { mod, game: G, fast: true });
      const ov = l => l.replace(/check-ov-[A-Za-z0-9]+/g, 'check-ov-X'); // check stages an overlay game dir with a random name
      same('check', r.j, cc, ov);
      const cres = JSON.parse(fs.readFileSync(cj, 'utf8'));
      const d = jdiff(r.j.result, cres); ok(r.j.result && !d, 'check: parsed result equals the CLI json', d);
      console.log('check exit ' + r.j.code + ', ' + r.j.lines.length + ' lines');

      const fj = path.join(S, 'cli-fix.json'), fpC = path.join(S, 'fix-cli'), fpS = path.join(S, 'fix-srv');
      const cf = cli('fix/fix.js', [mod, 'plan', '--out', fpC, '--game', G, '--json', fj]);
      r = await runB(port, 'fix', { mod, mode: 'plan', out: fpS, game: G });
      const nf = l => l.split('fix-srv').join('fix-X').split('fix-cli').join('fix-X');
      same('fix plan', r.j, cf, nf);
      const fres = JSON.parse(fs.readFileSync(fj, 'utf8'));
      const d2 = jdiff(r.j.result, fres, nf); ok(r.j.result && !d2, 'fix: parsed result equals the CLI json', d2);
      console.log('fix exit ' + r.j.code);

      // as2 flow, dry only
      const ci = cli('as2/as2.js', ['install', mod, '--game', G, '--dry']);
      r = await runB(port, 'install', { mod, game: G, dry: true }); same('install --dry', r.j, ci);
      const ce = cli('as2/as2.js', ['e2e', mod, '--map', 'm1', '--game', G, '--dry']);
      r = await runB(port, 'e2e', { mod, map: 'm1', game: G, dry: true }); same('e2e --dry', r.j, ce);
      const cp0 = cli('as2/as2.js', ['probe', '--game', G, '--dry']);
      r = await runB(port, 'probe', { game: G, dry: true }); same('probe --dry', r.j, cp0);

      // slow real runs (GUI-1/GUI-2 rows): fix apply, upgrade write --then-fix, check without --fast. About 6 min, so only with --slow or AS2GUI_SLOW=1.
      // Every write goes to the scratch folder; the game is only read.
      if (SLOW) {
        const faC = path.join(S, 'fa-cli'), faS = path.join(S, 'fa-srv'), faj = path.join(S, 'cli-fa.json');
        const nfa = l => l.split('fa-srv').join('fa-X').split('fa-cli').join('fa-X');
        const cfa = cli('fix/fix.js', [mod, 'apply', '--out', faC, '--game', G, '--json', faj]);
        r = await runB(port, 'fix', { mod, mode: 'apply', out: faS, game: G }); same('fix apply', r.j, cfa, nfa);
        const d5 = jdiff(r.j.result, JSON.parse(fs.readFileSync(faj, 'utf8')), nfa); ok(r.j.result && !d5, 'fix apply: parsed result equals the CLI json', d5);
        console.log('fix apply exit ' + r.j.code);
        const utC = path.join(S, 'ut-cli'), utS = path.join(S, 'ut-srv'), utj = path.join(S, 'cli-ut.json');
        const nut = l => l.split('ut-srv').join('ut-X').split('ut-cli').join('ut-X').replace(/check-ov-[A-Za-z0-9]+/g, 'check-ov-X').replace(/fix-ov-[A-Za-z0-9]+/g, 'fix-ov-X');
        const cut = cli('upgrade/upgrade.js', [mod, '--from', 'mowas2', '--to', 'as64', '--out', utC, '--then-fix', '--as2', G, '--json', utj]);
        r = await runB(port, 'upgrade', { mod, from: 'mowas2', to: 'as64', out: utS, thenFix: true, as2: G }); same('upgrade write --then-fix', r.j, cut, nut);
        ok(r.j.code === 0 && fs.existsSync(path.join(utS, 'mod.info')) && fs.existsSync(path.join(utS, 'UPGRADE.md')), 'upgrade write: mod.info and UPGRADE.md written to out', r.j.stderr);
        if (fs.existsSync(utj)) { const d6 = jdiff(r.j.result, JSON.parse(fs.readFileSync(utj, 'utf8')), nut); ok(!d6, 'upgrade write: parsed result equals the CLI json', d6); }
        console.log('upgrade --then-fix exit ' + r.j.code);
        const cfj = path.join(S, 'cli-checkfull.json'), ovf = l => l.replace(/check-ov-[A-Za-z0-9]+/g, 'check-ov-X');
        const ccf = cli('check/check.js', [mod, '--game', G, '--json', cfj]);
        r = await runB(port, 'check', { mod, game: G }); same('check (full, no --fast)', r.j, ccf, ovf);
        const d7 = jdiff(r.j.result, JSON.parse(fs.readFileSync(cfj, 'utf8'))); ok(r.j.result && !d7, 'check full: parsed result equals the CLI json', d7);
        console.log('check full exit ' + r.j.code + ', ' + r.j.lines.length + ' lines');
      } else console.log('slow cases (fix apply, upgrade --then-fix, check full) skipped: pass --slow or AS2GUI_SLOW=1');
    }

    // ---- install / uninstall end to end into a FAKE game dir in scratch (never the real game): CLI and server, same lines
    {
      const fg = path.join(S, 'fakegame'); fs.mkdirSync(path.join(fg, 'mods'), { recursive: true }); fs.writeFileSync(path.join(fg, 'as64.exe'), '');   // install wants an AS2 folder (I-8)
      const seq = [['install', { mod, game: fg, name: 'guitest_m' }, ['install', mod, '--name', 'guitest_m', '--game', fg]],
        ['uninstall', { name: 'guitest_m', game: fg }, ['uninstall', 'guitest_m', '--game', fg]],
        ['uninstall', { name: 'guitest_m', game: fg, yes: true }, ['uninstall', 'guitest_m', '--yes', '--game', fg]]];
      const cliRuns = seq.map(([, , a]) => cli('as2/as2.js', a));
      ok(!fs.existsSync(path.join(fg, 'mods', 'guitest_m')), 'fake game: CLI uninstall --yes removed the folder');
      for (let i = 0; i < seq.length; i++) {
        r = await runB(port, seq[i][0], seq[i][1]); same(seq[i][0] + (seq[i][1].yes ? ' --yes' : '') + ' (fake game)', r.j, cliRuns[i]);
        if (i === 0) ok(fs.existsSync(path.join(fg, 'mods', 'guitest_m', 'mod.info')) && fs.existsSync(path.join(fg, 'mods', 'guitest_m', '.as2-installed')), 'install via server: copy + marker in fake mods/');
        if (i === 1) ok(r.j.code !== 0 && fs.existsSync(path.join(fg, 'mods', 'guitest_m')), 'uninstall without yes: refused, folder kept');
      }
      ok(!fs.existsSync(path.join(fg, 'mods', 'guitest_m')), 'uninstall --yes via server: folder gone');
      fs.mkdirSync(path.join(fg, 'mods', 'plain'));
      r = await runB(port, 'uninstall', { name: 'plain', game: fg, yes: true }); ok(r.j.code === 2 && fs.existsSync(path.join(fg, 'mods', 'plain')), 'uninstall via server: a folder without the marker is left alone (exit 2)', JSON.stringify(r.j.code));
    }

    // ---- gen: sample, plan and a written copy into scratch
    const cs = cli('gen/gen.js', ['--sample']);
    r = await runB(port, 'gen', { sample: true }); same('gen --sample', r.j, cs);
    // --sample prints the spec text (DOOR-CLEAN: in the exe the file is an embedded asset); the run below uses the repo file
    const spec = path.join(TOOLS, 'gen', 'samples', 'sample.yaml');
    ok(cs.code === 0 && cs.out.length > 3, 'gen --sample prints the spec text');
    if (spec && fs.existsSync(spec)) {
      const g1 = cli('gen/gen.js', [spec, '--target', 'as64', '--plan', '--json']);
      r = await runB(port, 'gen', { spec, target: 'as64', plan: true, json: true }); same('gen --plan --json', r.j, g1);
      let want1 = null; try { want1 = JSON.parse(g1.out.join('\n')); } catch (e) { /* none */ }
      const d3 = jdiff(r.j.result, want1); ok(want1 && !d3, 'gen: parsed result equals the CLI json', d3);
      const oc = path.join(S, 'gen-cli'), os_ = path.join(S, 'gen-srv');
      const g2 = cli('gen/gen.js', [spec, '--target', 'as64', '--out', oc, ...(G ? ['--game', G] : [])]);
      r = await runB(port, 'gen', Object.assign({ spec, target: 'as64', out: os_ }, G ? { game: G } : {}));
      const fw = p => p.split(path.sep).join('/');   // gen prints absolute forward-slash paths
      const outs = [oc, os_].flatMap(p => [fw(path.resolve(p)), fw(p), path.basename(p)]);   // gen-write's place-entity line names the mod by its folder alone
      same('gen write', r.j, g2, l => outs.reduce((x, p) => x.split(p).join('<out>'), l.split(path.sep).join('/')));
      console.log('gen exit ' + r.j.code);
    } else ok(false, 'gen sample path not readable: ' + spec);

    // ---- upgrade: plan only
    const up = ['--to', 'as64', '--plan', ...(G ? ['--as2', G] : [])];
    const uj = path.join(S, 'cli-up.json');
    const cu = cli('upgrade/upgrade.js', [mod, ...up, '--json', uj]);
    r = await runB(port, 'upgrade', Object.assign({ mod, to: 'as64', plan: true }, G ? { as2: G } : {}));
    same('upgrade --plan', r.j, cu);
    ok(fs.existsSync(uj), 'upgrade: CLI wrote its json');
    if (fs.existsSync(uj)) { const d4 = jdiff(r.j.result, JSON.parse(fs.readFileSync(uj, 'utf8'))); ok(!d4, 'upgrade: parsed result equals the CLI json', d4); }
    console.log('upgrade exit ' + r.j.code);

    // ---- edrun --dry (no game, no --game: nothing outside the scratch folder is touched)
    const pairs = path.join(S, 'pairs.json');
    fs.writeFileSync(pairs, JSON.stringify([{ name: 'a_vs_b', class: 'vehicle', shooter: 't34_0', crew: ['sov_crew'], foe: 'gaz67b', foeCrew: ['sov_crew'] }]));
    const eoC = path.join(S, 'ed-cli'), eoS = path.join(S, 'ed-srv');
    const ce2 = cli('edrun/edrun.js', ['--pairs', pairs, '--out', eoC, '--dry', '--no-check', '--run-id', 'guitest']);
    r = await runB(port, 'edrun', { pairs, out: eoS, dry: true, noCheck: true, runId: 'guitest' });
    same('edrun --dry', r.j, ce2, l => l.split(eoC).join('<out>').split(eoS).join('<out>'));
    ok(r.j.result && r.j.result.files.includes('combat0.mi'), 'edrun: result lists the mission file', JSON.stringify(r.j.result));
    if (r.j.result && r.j.result.files.includes('combat0.mi')) ok(fs.readFileSync(path.join(eoS, 'combat0.mi')).equals(fs.readFileSync(path.join(eoC, 'combat0.mi'))), 'edrun: mission equals the CLI mission');

    // ---- write safety (idiot pass I-3/I-7/I-11/I-19/I-23..I-25/I-28): by content, whatever game the request names
    {
      const goh = path.join(S, 'gohx'), gB = path.join(S, 'gameB'), empty = path.join(S, 'emptyg');
      fs.mkdirSync(path.join(goh, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
      fs.mkdirSync(path.join(gB, 'resource'), { recursive: true }); fs.writeFileSync(path.join(gB, 'as64.exe'), ''); fs.mkdirSync(empty, { recursive: true });
      const sp0 = path.join(TOOLS, 'gen', 'samples', 'sample.yaml');
      for (const [cmd, input, m] of [
        ['gen', { spec: sp0, target: 'as64', out: path.join(goh, 'resource', 'x') }, 'gen out in the GoH game files, no game'],
        ['gen', { spec: sp0, target: 'as64', out: path.join(gB, 'resource', 'x'), game: empty }, 'gen out in another game resource/, game = an empty folder'],
        ['new', { dir: path.join(goh, 'newmod') }, 'new inside GoH'],
        ['fix', { mod, mode: 'apply', out: path.join(gB, 'resource', 'fx'), game: empty }, 'fix out in another game']]) {
        r = await runB(port, cmd, input); ok(r.status === 400 && /refused/.test(r.j.error || JSON.stringify(r.j)), 'write refused: ' + m, JSON.stringify(r.j));
      }
      ok(!fs.existsSync(path.join(goh, 'resource')) && !fs.existsSync(path.join(goh, 'newmod')) && fs.readdirSync(path.join(gB, 'resource')).length === 0, 'nothing written into GoH or the other game');
      fs.writeFileSync(path.join(S, 'afile.txt'), 'x');
      r = await runB(port, 'gen', { spec: sp0, target: 'as64', out: path.join(S, 'afile.txt') }); ok(r.status === 400 && /is a file, not a folder/.test(JSON.stringify(r.j)), 'gen out = a file: plain 400 (I-11)', JSON.stringify(r.j));
      // I-19: a drive root is not a mod; a big folder stops at 5000 files
      r = await req(port, 'GET', '/api/mod?dir=' + encodeURIComponent(path.parse(S).root)); ok(r.status === 400 && /whole drive/.test(r.text), '/api/mod on a drive root refused', r.text);
      const big = path.join(S, 'bigmod'); fs.mkdirSync(big, { recursive: true }); for (let i = 0; i < 5010; i++) fs.writeFileSync(path.join(big, 'f' + i), '');
      const bm = J(await req(port, 'GET', '/api/mod?dir=' + encodeURIComponent(big))); ok(bm.truncated && bm.files === 5000 && /too many files/.test(bm.note), '/api/mod stops at 5000 files with a note', JSON.stringify(bm).slice(0, 200));
      fs.rmSync(big, { recursive: true, force: true });
      // I-23: a relative game folder comes back absolute; I-24: GoH named
      const rel = path.relative(process.cwd(), path.join(S, 'fakegame'));
      if (!path.isAbsolute(rel)) { const gr = J(await req(port, 'GET', '/api/game?game=' + encodeURIComponent(rel))); ok(!gr.dir || path.isAbsolute(gr.dir), '/api/game resolves a relative folder', JSON.stringify(gr).slice(0, 300)); }
      const gg = J(await req(port, 'GET', '/api/game?game=' + encodeURIComponent(goh))); ok(!gg.dir || (gg.goh === true && gg.problems.some(p => /Gates of Hell/.test(p))), '/api/game names Gates of Hell', JSON.stringify(gg).slice(0, 300));
      // I-25: reserved names refused, a second save says replaced
      r = await req(port, 'POST', '/api/spec', { name: 'CON', text: 'x' }); ok(r.status === 400 && /Windows keeps/.test(r.text), 'spec name CON refused');
      const s1 = J(await req(port, 'POST', '/api/spec', { name: 'twice', text: 'a' })), s2 = J(await req(port, 'POST', '/api/spec', { name: 'twice', text: 'b' }));
      ok(s2.replaced === true && s1.path === s2.path, 'spec saved twice says replaced');
    }

    // ---- streaming mode: NDJSON events in order, same lines as buffered
    const sr = await req(port, 'POST', '/api/run', { cmd: 'gen', input: { sample: true } });
    const ev = sr.text.trim().split('\n').map(JSON.parse);
    ok(ev[0].t === 'start' && ev[ev.length - 1].t === 'end' && ev.some(e => e.t === 'out'), 'stream: start, out, end', sr.text);
    ok(/ndjson/.test(sr.headers['content-type']), 'stream content type');
  } finally {
    await srv.close();
  }
  console.log(`gui test: ${pass} passed, ${failN} failed`);
  process.exitCode = failN ? 1 : 0;
}
main().catch(e => { console.log('gui test crashed: ' + (e && e.stack || e)); process.exitCode = 1; });

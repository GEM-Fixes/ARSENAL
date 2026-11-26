#!/usr/bin/env node
// installer test: build.js checks (config, payload refusals, --describe), then the installer of THIS system built from a
// small made-up payload and run for real into a scratch folder: --version, --dry, install, reinstall, uninstall.
// Shortcuts and registry writes go under a scratch root (ARSENAL_SETUP_TEST_ROOT); nothing outside test/work is written.
// Needs the Go toolchain (ARSENAL_GO, or go on PATH); without one the run part is SKIPPED and said so.
// usage: node tools/installer/test/test.js
// Author: Imperator_Aug (ARSENAL, ia-8390f42d)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
const B = require('../build.js'), { zip } = require('../../lib/zipwrite.js');
const W = path.join(__dirname, 'work'), WIN = process.platform === 'win32';
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL: ' + m); } };
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });

// ---- a made-up small package: the four launchers answer `version` and `game` without Node.js
const P = 'ARSENAL-9.9.9/';
const cmd = '@echo off\r\nif "%1"=="version" echo ARSENAL 9.9.9 test\r\nexit /b 0\r\n';
const sh = '#!/bin/sh\n[ "$1" = version ] && echo "ARSENAL 9.9.9 test"\nexit 0\n';
const base = [[P + 'ARSENAL.cmd', Buffer.from(cmd)], [P + 'ARSENAL-gui.cmd', Buffer.from(cmd)], [P + 'arsenal', Buffer.from(sh)], [P + 'arsenal-gui', Buffer.from(sh)],
  [P + 'Install-ARSENAL.cmd', Buffer.from('@echo old\r\n')], [P + 'tools/a/a.js', Buffer.from('// a\n'), true], [P + 'guide/README.md', Buffer.from('# guide\n'), true]];
const mk = extra => zip(base.concat(extra || []));
const payload = path.join(W, 'ARSENAL-9.9.9-small.zip');
fs.writeFileSync(payload, mk());

// ---- 1 build.js pieces
ok(B.zipTop(mk()) === P, '1 zipTop reads the top folder');
ok(B.checkPayload(mk()) === base.length, '1 checkPayload counts the entries of a clean payload');
const cfg = B.config(P, {});
ok(cfg.version === '9.9.9' && cfg.top === P && cfg.node.minMajor >= 26 && /^https:\/\/nodejs\.org\/dist\/v/.test(cfg.node.base), '1 config: version, top, Node.js pin');
for (const k of ['windows-x64', 'windows-arm64', 'darwin', 'linux-x64', 'linux-arm64']) ok(cfg.node.files[k] && cfg.node.files[k].file.includes('v' + cfg.node.version) && /^[0-9a-f]{64}$/.test(cfg.node.files[k].sha256), '1 config: Node.js file and sha256 for ' + k);
ok(cfg.node.files['windows-x64'].file.endsWith('.msi') && cfg.node.files.darwin.file.endsWith('.pkg') && cfg.node.files['linux-x64'].file.endsWith('.tar.gz'), '1 config: msi on Windows, pkg on macOS, tar.gz on Linux');
ok(cfg.historical.url === '' || /^https:\/\//.test(cfg.historical.url), '1 config: the historical link is empty or https');
// --stock-index: shipped stock index files are checked, then added to the payload after its entries (stored, readable)
{ const zl = require('zlib'), { VERSION } = require('../../entityindex/index.js'), SD = path.join(W, 'stock'), BD = path.join(W, 'stock-bad');
  const gz = (meta, extra) => zl.gzipSync(JSON.stringify(Object.assign({ meta: Object.assign({ version: VERSION, exe: 'as64', fp: 'ab'.repeat(20), mods: [] }, meta), entities: {}, stuff: {}, models: {} }, extra || {})));
  fs.mkdirSync(SD, { recursive: true }); fs.mkdirSync(BD, { recursive: true });
  fs.writeFileSync(path.join(SD, 'vanilla.as64.' + 'ab'.repeat(6) + '.json.gz'), gz({}));
  fs.writeFileSync(path.join(SD, 'notes.txt'), 'not an index');
  const st = B.stockFiles(SD);
  ok(st.length === 1 && st[0][0] === 'vanilla.as64.abababababab.json.gz', '1 stockFiles takes the index files of the folder');
  const big = B.addFiles(mk(), st.map(([n, b]) => [P + 'tools/entityindex/shipped/' + n, b]));
  ok(B.checkPayload(big) === base.length + 1 && B.zipTop(big) === P, '1 addFiles: one more entry, the payload still passes its checks');
  const ents = require('../../lib/pak.js').list((() => { const f = path.join(W, 'big.zip'); fs.writeFileSync(f, big); return f; })());
  const e = ents.find(x => x.name === P + 'tools/entityindex/shipped/vanilla.as64.abababababab.json.gz');
  ok(e && e.size === st[0][1].length && ents.length === base.length + 1, '1 addFiles: the added entry is listed whole beside the old ones');
  const refuse2 = (nm, buf, re) => { fs.rmSync(BD, { recursive: true, force: true }); fs.mkdirSync(BD); fs.writeFileSync(path.join(BD, nm), buf);
    const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '..', 'build.js'))}).stockFiles(${JSON.stringify(BD)})`], { encoding: 'utf8' });
    ok(r.status === 2 && re.test(r.stderr), `1 stockFiles refuses ${nm}: ${r.stderr.slice(0, 160)}`); };
  refuse2('vanilla.as64.abababababab.json.gz', gz({ game: 'X:/games/as2' }), /game folder/);
  refuse2('vanilla.as64.abababababab.json.gz', gz({ exe: 'goh' }), /does not match the name/);
  refuse2('vanilla.as64.abababababab.json.gz', gz({}, { files: ['C:\\Users\\USER\\x'] }), /user folder/);
  refuse2('vanilla.as64.abababababab.json.gz', Buffer.from('plain'), /not a gzip/);
  refuse2('other.json.gz', gz({}), /not a name/);
  refuse2('readme.txt', 'x', /no vanilla/); }
const build = a => spawnSync(process.execPath, [path.join(__dirname, '..', 'build.js'), ...a], { encoding: 'utf8' });
const refuse = (name, extra, re) => {
  const f = path.join(W, name + '.zip'); fs.writeFileSync(f, Array.isArray(extra) ? mk(extra) : extra);
  const r = build(['--payload', f, '--out', path.join(W, 'refused'), '--only', 'linux-x64']);
  ok(r.status === 2 && re.test(r.stderr), `1 payload with ${name} is refused (rc ${r.status}) ${r.stderr.slice(0, 200)}`);
};
const go = process.env.ARSENAL_GO || (spawnSync('go', ['version']).status === 0 ? 'go' : '');
if (go) {
  process.env.ARSENAL_GO = go;
  refuse('node-exe', [[P + 'node/v26/node.exe', Buffer.from('x')]], /carries none/);
  refuse('node-unix', [[P + 'node/v26/bin/node', Buffer.from('x')]], /carries none/);
  refuse('single-exe', [[P + 'ARSENAL.exe', Buffer.from('x')]], /carries none/);
  refuse('database', [[P + 'ww2sources/index.sqlite', Buffer.from('x')]], /downloaded, not carried/);
  refuse('no-launchers', zip(base.slice(2)), /four launchers/);
  { const f = path.join(W, 'ARSENAL-9.9.9-small-ww2.zip'); fs.writeFileSync(f, mk());
    const r = build(['--payload', f, '--out', path.join(W, 'refused'), '--only', 'linux-x64']); ok(r.status === 2 && /historical database/.test(r.stderr), '1 a -ww2 zip is refused by name'); }
  ok(!fs.existsSync(path.join(W, 'refused')) || !fs.readdirSync(path.join(W, 'refused')).some(f => /^ARSENAL-Setup/.test(f)), '1 a refused payload writes no installer');
  { const r = build(['--payload', payload, '--historical-url', 'http://example.org/x', '--only', 'linux-x64', '--out', path.join(W, 'refused')]); ok(r.status === 2 && /https/.test(r.stderr), '1 a historical link that is not https is refused'); }
  { const r = build(['--only', 'amiga']); ok(r.status === 2 && /unknown target/.test(r.stderr), '1 unknown target'); }
}
{ const f = path.join(W, 'd.bin'); fs.writeFileSync(f, 'historical');
  const r = build(['--describe', f]); ok(r.status === 0 && r.stdout.includes(crypto.createHash('sha256').update('historical').digest('hex')) && /bytes:\s+10\b/.test(r.stdout), '1 --describe prints sha256 and bytes');
  ok(build(['--describe', path.join(W, 'none')]).status === 2, '1 --describe without the file: rc 2'); }

// ---- 2 the installer of this system, for real, into scratch
const T = { win32: 'windows', linux: 'linux', darwin: 'macos' }[process.platform] + '-' + (process.arch === 'arm64' ? 'arm64' : 'x64');
if (!go) console.log('SKIPPED: no Go toolchain (ARSENAL_GO): the installer was not built or run');
else if (!B.TARGETS[T]) console.log('SKIPPED: no installer target for ' + T);
else {
  const out = path.join(W, 'out');
  const r = build(['--payload', payload, '--out', out, '--work', path.join(W, 'bw'), '--only', T]);
  const exe = path.join(out, `ARSENAL-Setup-9.9.9-${T}${WIN ? '.exe' : ''}`);
  ok(r.status === 0 && fs.existsSync(exe), '2 build ' + T + ' rc ' + r.status + ' ' + (r.stderr || '').slice(0, 300));
  if (fs.existsSync(exe)) {
    const sum = fs.readFileSync(exe + '.sha256', 'utf8');
    ok(sum.startsWith(crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex') + '  ARSENAL-Setup-9.9.9-' + T), '2 the .sha256 file matches the installer');
    const root = path.join(W, 'root'), dir = path.join(W, 'inst', 'ARSENAL');
    const env = Object.assign({}, process.env, { ARSENAL_SETUP_TEST_ROOT: root, ARSENAL_SETUP_NO_BROWSER: '1', ARSENAL_SETUP_LANG: 'en' });
    if (!WIN) Object.assign(env, { HOME: path.join(W, 'home'), XDG_DATA_HOME: '', XDG_CONFIG_HOME: '' });
    const run = a => { const x = require('../../lib/test/wait').spawnSync(exe, a, { encoding: 'utf8', env, timeout: 300000 }, 'installer test'); return { rc: x.status, out: (x.stdout || '') + (x.stderr || '') }; };
    const tree = d => fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).map(String).map(s => s.replace(/\\/g, '/')).sort() : [];
    let x = run(['--version']); ok(x.rc === 0 && /9\.9\.9/.test(x.out), '2 --version ' + x.out.slice(0, 80));
    x = run(['--nope']); ok(x.rc === 2, '2 unknown option: rc 2, got ' + x.rc);
    x = run(['--console', '--yes', '--dry', '--dir', dir, '--no-node', '--no-start']);
    ok(x.rc === 0 && !fs.existsSync(dir) && tree(root).length === 0, '2 --dry writes nothing (rc ' + x.rc + ')');
    ok(x.out.includes('would copy the toolkit'), '2 ARSENAL_SETUP_LANG=en: English lines');
    // languages: --lang wins over the variable, the variable over the system; a language the installer lacks is refused
    for (const [l, word] of [['ru', 'набор инструментов'], ['uk', 'набір інструментів'], ['zh', '工具包']]) {
      x = run(['--console', '--yes', '--dry', '--dir', dir, '--no-node', '--no-start', '--lang', l]);
      ok(x.rc === 0 && x.out.includes(word) && !x.out.includes('would copy'), '2 --lang ' + l + ': the lines are in that language: ' + x.out.slice(0, 200));
    }
    x = run(['--dry', '--lang', 'xx']); ok(x.rc === 2, '2 --lang with an unknown language: rc 2, got ' + x.rc);
    x = run(['--console', '--yes', '--dir', path.join(W, 'steamapps', 'common', 'x'), '--no-node', '--no-start']);
    ok(x.rc !== 0 && !fs.existsSync(path.join(W, 'steamapps', 'common', 'x')), '2 a folder inside steamapps is refused');
    // a shortcut left by the older Install-ARSENAL.cmd carries the argument "gui"; the install must clear it (with an argument the launcher opens no browser)
    const lnkPs = s => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', s], { encoding: 'utf8', env: Object.assign({}, process.env, { AR_L: path.join(root, 'start', 'ARSENAL.lnk') }) }).stdout.trim();
    if (WIN) { fs.mkdirSync(path.join(root, 'start'), { recursive: true }); lnkPs("$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:AR_L); $s.TargetPath=$env:ComSpec; $s.Arguments='gui'; $s.Save()"); }
    // install: Desktop icon + sign-in start, no Node.js step, not started
    x = run(['--console', '--yes', '--dir', dir, '--no-node', '--no-start', '--autostart']);
    ok(x.rc === 0, '2 install rc ' + x.rc + '\n' + x.out.slice(-600));
    const have = tree(dir), rec = fs.existsSync(path.join(dir, 'ARSENAL-install.txt')) ? fs.readFileSync(path.join(dir, 'ARSENAL-install.txt'), 'utf8') : '';
    for (const f of ['ARSENAL.cmd', 'arsenal', 'tools/a/a.js', 'guide/README.md', 'ARSENAL-install.txt', WIN ? 'ARSENAL.ico' : 'ARSENAL.png', 'ARSENAL-Setup' + (WIN ? '.exe' : '')]) ok(have.includes(f), '2 installed: ' + f);
    ok(!have.includes('Install-ARSENAL.cmd'), '2 the old Install-ARSENAL.cmd is not installed');
    ok(!have.some(f => /(^|\/)node(\.exe)?$|index\.sqlite$/.test(f)), '2 no Node.js and no historical index in the install');
    ok(/the toolkit runs: ARSENAL 9\.9\.9 test/.test(x.out), '2 the installed launcher was run');
    ok(/^item /m.test(rec) && /^link /m.test(rec), '2 the record lists items and links');
    const links = tree(root);
    ok(links.some(f => /^desktop\/ARSENAL/i.test(f)), '2 Desktop icon made: ' + links.join(' '));
    if (WIN) ok(links.some(f => /^start\/.*ARSENAL.*\.lnk$/i.test(f)) && /Run/.test(fs.readFileSync(path.join(root, 'reg.txt'), 'utf8')), '2 Start menu entry and sign-in start (logged, not written to the registry)');
    if (WIN) { const a = lnkPs("$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:AR_L); 'args=[' + $s.Arguments + '] ' + $s.TargetPath"); ok(/^args=\[\] .*ARSENAL-gui\.cmd$/i.test(a), '2 an older shortcut with the argument "gui" is rewritten with no arguments: ' + a); }
    // reinstall without the Desktop box: files of the user stay, earlier links stay recorded
    fs.writeFileSync(path.join(dir, 'my notes.txt'), 'mine');
    x = run(['--console', '--yes', '--dir', dir, '--no-node', '--no-start', '--no-desktop']);
    const rec2 = fs.readFileSync(path.join(dir, 'ARSENAL-install.txt'), 'utf8');
    ok(x.rc === 0 && fs.existsSync(path.join(dir, 'my notes.txt')), '2 reinstall rc ' + x.rc + ', the user file stays');
    ok(rec.split(/\r?\n/).filter(l => /^(link|reg|tree) /.test(l)).every(l => rec2.includes(l)), '2 reinstall keeps the earlier link and registry lines in the record');
    // a folder with files and no record is refused
    const other = path.join(W, 'other'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'x.txt'), 'x');
    x = run(['--console', '--yes', '--dir', other, '--no-node', '--no-start']);
    ok(x.rc !== 0 && tree(other).join() === 'x.txt', '2 a non-empty folder that is not an ARSENAL install is refused');
    // uninstall: everything the installer made goes, the user file stays, shortcuts go
    x = run(['--uninstall', '--yes', '--dir', dir, '--keep-caches']);
    ok(x.rc === 0, '2 uninstall rc ' + x.rc + '\n' + x.out.slice(-400));
    ok(tree(dir).join() === 'my notes.txt', '2 uninstall leaves only the user file: ' + tree(dir).join(' '));
    ok(!tree(root).some(f => /\.(lnk|desktop)$|ARSENAL\.app/i.test(f)), '2 uninstall removes the shortcuts: ' + tree(root).join(' '));
  }
}
console.log(bad ? `installer: ${bad} of ${n} FAILED
FAIL` : `installer: ${n} checks ok
PASS`);
process.exit(bad ? 1 : 0);

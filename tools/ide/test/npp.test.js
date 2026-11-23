// npp.test: the Notepad++ pack against a fake settings folder and a fake install folder (never the real ones).
//   node tools/ide/test/npp.test.js <scratch dir>     last line PASS
// Author: Imperator_Aug (ARSENAL, ia-38d6721d)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http');
const npp = require('../npp');
const cli = require('../npp/cli');
const gen = require('../npp/gen');
const X = require('../npp/xml');
const P = require('../palette');

const W = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'npp-test-' + process.pid));
const FX = path.join(__dirname, 'fx', 'npp');
const REAL = [process.env.APPDATA && path.join(process.env.APPDATA, 'Notepad++'), ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map(p => path.join(p, 'Notepad++'))].filter(Boolean).map(p => path.resolve(p).toLowerCase());
if (REAL.some(r => W.toLowerCase().startsWith(r))) { console.log('scratch dir is inside a real Notepad++ folder'); console.log('FAIL'); process.exit(1); }

let fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log('not ok ' + msg); } }
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
function hashDir(d, skip) {
  const out = {};
  (function walk(p, r) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const rr = r ? r + '/' + e.name : e.name;
      if (!r && skip && skip.includes(e.name)) continue;
      if (e.isDirectory()) { out[rr + '/'] = 'dir'; walk(path.join(p, e.name), rr); } else out[rr] = sha1(fs.readFileSync(path.join(p, e.name)));
    }
  })(d, '');
  return JSON.stringify(out);
}
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { const s = path.join(a, e.name), t = path.join(b, e.name); if (e.isDirectory()) copyDir(s, t); else fs.copyFileSync(s, t); } }
const crlf = f => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\r?\n/g, '\r\n'));

function setup(name, opts) {
  opts = opts || {};
  const root = path.join(W, name);
  fs.rmSync(root, { recursive: true, force: true });
  const S = path.join(root, 'settings'), I = path.join(root, 'install');
  copyDir(path.join(FX, 'settings'), S); copyDir(path.join(FX, 'install'), I);
  for (const f of ['shortcuts.xml', 'langs.xml', 'stylers.xml', 'config.xml']) crlf(path.join(S, f));
  crlf(path.join(I, 'functionList', 'overrideMap.xml'));
  if (opts.shortcuts) fs.copyFileSync(opts.shortcuts, path.join(S, 'shortcuts.xml'));
  const launcher = { file: 'C:\\fake node\\node.exe', args: ['C:\\fake\\tools\\ide\\ide.js'] };
  return { S, I, o: { settingsDir: S, exe: path.join(I, 'notepad++.exe'), theme: path.join(FX, 'theme', 'GEM2.xml'), running: false, launcher } };
}
const never = S => ['langs.xml', 'stylers.xml', 'config.xml'].map(f => sha1(fs.readFileSync(path.join(S, f)))).join();
const codes = r => r.refuse.map(x => x.code);

async function main() {
  fs.mkdirSync(W, { recursive: true });

  // --- status
  {
    const { o, S } = setup('status');
    const st = npp.status(o);
    ok(st.exe && st.exe.endsWith('notepad++.exe'), 'status finds the fake exe');
    ok(st.version === '8.9.8.1', 'status reads the version from change.log: ' + st.version);
    ok(st.settingsDir === path.resolve(S) && !st.portable && !st.cloud && !st.running, 'status settings/portable/cloud/running');
    ok(st.installed.manifest === null && st.problems.length === 0, 'status: nothing installed, no problems ' + st.problems);
  }

  // --- plan is write-free; targets
  const A = setup('main');
  A.o.functionList = true;
  const before = hashDir(A.S), neverBefore = never(A.S), origShortcuts = fs.readFileSync(path.join(A.S, 'shortcuts.xml'));
  const p = npp.plan(A.o);
  ok(hashDir(A.S) === before, 'plan writes nothing');
  ok(p.ok && p.refuse.length === 0, 'plan ok: ' + JSON.stringify(p.refuse));
  const tp = f => p.targets.find(t => t.path === path.join(A.S, f));
  ok(tp('themes/GEM2.xml') && tp('themes/GEM2.xml').action === 'new', 'plan: theme new');
  ok(tp('userDefineLangs/GEM2-AS2.udl.xml').action === 'new', 'plan: udl new');
  ok(tp('functionList/ini.xml') && tp('functionList/ini.xml').action === 'new', 'plan: stock function list copied (no functionList in settings)');
  ok(tp('functionList/gem2-as2.xml').action === 'new' && tp('functionList/overrideMap.xml').action === 'new', 'plan: our parser + overrideMap');
  ok(tp('arsenal/autoCompletion/GEM2-AS2.xml').action === 'stage', 'plan: auto-completion staged');
  ok(p.elevated.length === 1 && p.elevated[0].to === path.join(A.I, 'autoCompletion', 'GEM2-AS2.xml') && /^copy \/Y "/.test(p.elevated[0].cmd), 'plan: one elevated copy into the install folder');
  const sct = tp('shortcuts.xml');
  ok(sct.action === 'merge' && /\+ \t\t<Command name="ARSENAL: check this file" Ctrl="yes" Alt="yes" Shift="yes" Key="75">/.test(sct.diff), 'plan: shortcuts merge with a diff');
  ok(!p.targets.some(t => /^(langs|stylers|config)\.xml$/i.test(path.basename(t.path))), 'plan never lists langs/stylers/config');
  ok(p.targets.every(t => path.resolve(t.path).toLowerCase().startsWith(path.resolve(A.S).toLowerCase())), 'plan targets all inside the settings folder');

  // --- generated files
  const udl = tp('userDefineLangs/GEM2-AS2.udl.xml').content.toString('utf8');
  const fl = tp('functionList/gem2-as2.xml').content.toString('utf8');
  const ac = tp('arsenal/autoCompletion/GEM2-AS2.xml').content.toString('utf8');
  ok(X.wellFormed(udl) === null, 'udl well-formed: ' + X.wellFormed(udl));
  ok(X.wellFormed(fl) === null, 'functionList well-formed: ' + X.wellFormed(fl));
  ok(X.wellFormed(ac) === null, 'autoCompletion well-formed: ' + X.wellFormed(ac));
  ok(/<Keywords name="Comments">00; 01 02\(\(EOL\)\) 03 04<\/Keywords>/.test(udl), 'udl: ; line comment');
  ok(/<Keywords name="Folders in code1, open">\{<\/Keywords>/.test(udl) && /<Keywords name="Folders in code1, close">\}<\/Keywords>/.test(udl), 'udl: {} folding');
  ok(/<Keywords name="Delimiters">00&quot; 01\\ 02&quot; 03/.test(udl), 'udl: "..." delimiter with \\ escape');
  ok(/<Keywords name="Numbers, prefix1">0x<\/Keywords>/.test(udl), 'udl: 0x numbers');
  ok(udl.includes(`name="LINE COMMENTS" fgColor="${P.comment}" bgColor="${P.commentBg}" colorStyle="3"`), 'udl: palette comment colours fg+bg');
  ok(udl.includes(`name="KEYWORDS1" fgColor="${P.key}" bgColor="${P.bg}" colorStyle="3" fontName="Consolas" fontStyle="1"`), 'udl: palette key colour, bold, Consolas');
  ok(udl.includes(`name="DEFAULT" fgColor="${P.fg}" bgColor="${P.bg}"`) && /darkModeTheme="yes"/.test(udl), 'udl: default colours + darkModeTheme');
  const ext = /ext="([^"]*)"/.exec(udl)[1].split(' ');
  ok(ext.includes('def') && ext.includes('mdl') && ext.includes('lng') && ext.includes('mi') && !ext.includes('txt') && !ext.includes('log') && !ext.includes(''), 'udl: extensions ' + ext.length);
  const kw2 = /<Keywords name="Keywords2">([^<]*)</.exec(udl)[1].split(' ');
  ok(['event', 'on', 'off', 'end', 'able', 'set', 'begin'].every(w => kw2.includes(w)), 'udl: theme words in Keywords2');
  ok(/<Keywords name="Keywords3">include define mod<\/Keywords>/.test(udl), 'udl: Keywords3');
  const kw1 = /<Keywords name="Keywords1">([^<]*)</.exec(udl)[1];
  ok(kw1.length <= gen.KW1_CHARS && kw1.split(' ').length > 100 && kw1.split(' ').includes('entity'), 'udl: Keywords1 capped (' + kw1.split(' ').length + ' words)');
  ok(/userDefinedLangName|displayName="GEM2-AS2"/.test(fl) && /define/.test(fl), 'functionList: parser for blocks and define');
  const rxSrc = /mainExpr="([^"]*)"/.exec(fl)[1].replace(/&quot;/g, '"').replace(/^\(\?m-s\)/, '').replace(/\\h/g, '[ \\t]');
  const rx = new RegExp(rxSrc, 'gm');
  const sample = '{entity "tank"\n\t{inner\n}\n(define "mac" 1)\n; {comment\n{game_entity\n';
  const hits = (sample.match(rx) || []).map(s => s.trim());
  ok(JSON.stringify(hits) === JSON.stringify(['{entity "tank"', '(define "mac"', '{game_entity']), 'functionList regex finds top-level blocks and define: ' + JSON.stringify(hits));
  ok(/<AutoComplete language="GEM2-AS2">/.test(ac) && /ignoreCase="yes"/.test(ac) && /<KeyWord name="able" func="yes">/.test(ac) && /<Param name="bool" \/>/.test(ac), 'autoCompletion: words and hints');
  const names = [...ac.matchAll(/<KeyWord name="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
  ok(names.every((w, i) => i === 0 || names[i - 1].toLowerCase() <= w.toLowerCase()), 'autoCompletion sorted (ignore case)');
  ok(JSON.stringify(gen.paramsOf('float(float float)')) === '["float","float"]' && gen.paramsOf('cls:eRGBAColor')[0] === 'eRGBAColor', 'paramsOf');

  // --- install
  const r1 = npp.install(A.o);
  ok(r1.ok && r1.manifest && fs.existsSync(r1.manifest), 'install ok with manifest');
  ok(never(A.S) === neverBefore, 'install: langs/stylers/config unchanged');
  const sc1 = fs.readFileSync(path.join(A.S, 'shortcuts.xml'));
  const sc1t = sc1.toString('latin1');
  ok((sc1t.match(/<Command name="ARSENAL:/g) || []).length === 3, 'install: three ARSENAL commands');
  ok(/name="ARSENAL: open in GUI" Ctrl="yes" Alt="yes" Shift="yes" Key="71">&quot;C:\\fake node\\node.exe&quot; C:\\fake\\tools\\ide\\ide.js send &quot;\$\(FULL_CURRENT_PATH\)&quot; \$\(CURRENT_LINE\) \$\(CURRENT_COLUMN\)<\/Command>/.test(sc1t), 'install: send command line (G key; commented G macro ignored)');
  ok(/Key="86">[^<]* vanilla &quot;\$\(FULL_CURRENT_PATH\)&quot;</.test(sc1t) && /Key="75">[^<]* check &quot;\$\(FULL_CURRENT_PATH\)&quot; --pause</.test(sc1t), 'install: check and vanilla commands');
  ok(!/[^\r]\n/.test(sc1t), 'install: shortcuts.xml keeps CRLF');
  ok(sc1t.indexOf('ARSENAL:') > sc1t.indexOf('name="Web Search"') && sc1t.indexOf('ARSENAL:') < sc1t.lastIndexOf('</UserDefinedCommands>'), 'install: commands inside the real block, not the commented one');
  ok(npp.unmergeShortcuts(sc1).equals(origShortcuts), 'install: every other byte of shortcuts.xml kept');
  ok(X.wellFormed(sc1t) === null, 'install: shortcuts.xml well-formed');
  ok(r1.backup && fs.readFileSync(path.join(r1.backup, 'shortcuts.xml')).equals(origShortcuts), 'install: backup of shortcuts.xml');
  ok(fs.readFileSync(path.join(A.S, 'themes', 'GEM2.xml')).equals(fs.readFileSync(A.o.theme)), 'install: theme byte copy');
  const om = fs.readFileSync(path.join(A.S, 'functionList', 'overrideMap.xml'), 'latin1');
  ok(/\t\t\t<association id="gem2-as2.xml" userDefinedLangName="GEM2-AS2"\/>\r\n\t\t<\/associationMap>/.test(om) && om.includes('"krl.xml"') && X.wellFormed(om) === null, 'install: overrideMap association');
  ok(!fs.existsSync(path.join(A.I, 'autoCompletion', 'GEM2-AS2.xml')), 'install: install folder untouched');
  const man = JSON.parse(fs.readFileSync(r1.manifest, 'utf8'));
  ok(man.version === 1 && man.files.length === r1.written.length && man.commands.length === 3 && man.files.every(f => /^[0-9a-f]{40}$/.test(f.sha1)), 'manifest shape');
  ok(npp.status(A.o).installed.manifest !== null, 'status sees the manifest');

  // --- install twice = idempotent
  const h1 = hashDir(A.S, ['arsenal-backup']);
  const r2 = npp.install(A.o);
  ok(r2.ok && r2.written.length === 0 && hashDir(A.S, ['arsenal-backup']) === h1 && r2.targets.every(t => t.action === 'skip'), 'install twice changes nothing');

  // --- uninstall returns the folder to byte-identical (apart from arsenal-backup)
  const u = npp.uninstall(A.o);
  ok(u.kept.length === 0 && u.removed.length > 3 && u.elevated.length === 0, 'uninstall removed ' + u.removed.length);
  ok(hashDir(A.S, ['arsenal-backup']) === before, 'uninstall: folder byte-identical to before');
  ok(fs.existsSync(path.join(A.S, 'arsenal-backup')), 'uninstall keeps backups');
  ok(never(A.S) === neverBefore, 'uninstall: langs/stylers/config unchanged');

  // --- uninstall keeps a file the user changed
  {
    const B = setup('kept');
    npp.install(B.o);
    const f = path.join(B.S, 'userDefineLangs', 'GEM2-AS2.udl.xml');
    fs.appendFileSync(f, '<!-- user edit -->\r\n');
    const uu = npp.uninstall(B.o);
    ok(uu.kept.length === 1 && uu.kept[0].path === f && fs.existsSync(f), 'uninstall keeps a changed file and says why');
  }

  // --- refusals
  {
    const R = setup('refuse'); const h = hashDir(R.S);
    ok(codes(npp.plan(Object.assign({}, R.o, { running: true }))).includes('RUNNING'), 'RUNNING refuses');
    const ri = npp.install(Object.assign({}, R.o, { running: true }));
    ok(!ri.ok && hashDir(R.S) === h, 'install while running writes nothing');
    ok(npp.uninstall(Object.assign({}, R.o, { running: true })).refuse[0].code === 'RUNNING', 'uninstall while running refuses');
    ok(codes(npp.plan(Object.assign({}, R.o, { theme: path.join(FX, 'theme', 'notatheme.xml') }))).includes('NO_THEME'), 'NO_THEME: not a theme');
    ok(codes(npp.plan(Object.assign({}, R.o, { theme: path.join(R.S, 'missing.xml') }))).includes('NO_THEME'), 'NO_THEME: missing');
    ok(codes(npp.plan(Object.assign({}, R.o, { exe: path.join(R.S, 'nope.exe') }))).includes('NO_NPP'), 'NO_NPP');
    fs.writeFileSync(path.join(R.I, 'doLocalConf.xml'), '');
    const pp = npp.plan(R.o);
    ok(codes(pp).includes('PORTABLE') && !pp.ok, 'PORTABLE refuses');
    ok(!npp.install(R.o).ok && hashDir(R.S) === h, 'portable install writes nothing');
    fs.unlinkSync(path.join(R.I, 'doLocalConf.xml'));
    fs.mkdirSync(path.join(R.S, 'cloud')); fs.writeFileSync(path.join(R.S, 'cloud', 'choice'), 'D:\\cloud');
    ok(codes(npp.plan(R.o)).includes('CLOUD'), 'CLOUD refuses');
  }

  // --- a different GEM2 theme: skipped, rest installs
  {
    const T = setup('theme');
    fs.mkdirSync(path.join(T.S, 'themes'));
    const other = fs.readFileSync(path.join(FX, 'theme', 'other.xml'));
    fs.writeFileSync(path.join(T.S, 'themes', 'GEM2.xml'), other);
    const tp2 = npp.plan(T.o);
    ok(tp2.ok && codes(tp2).includes('THEME_DIFFERENT') && tp2.targets.find(t => /GEM2\.xml$/.test(t.path) && /themes/.test(t.path)).action === 'skip', 'THEME_DIFFERENT: skip, still ok');
    const ti = npp.install(T.o);
    ok(ti.ok && fs.readFileSync(path.join(T.S, 'themes', 'GEM2.xml')).equals(other), 'THEME_DIFFERENT: their theme left alone');
  }

  // --- a taken key: installed without a key; self-closed block, LF file, back to identical on uninstall
  {
    const K = setup('taken', { shortcuts: path.join(FX, 'shortcuts-taken.xml') });
    const b0 = hashDir(K.S), orig = fs.readFileSync(path.join(K.S, 'shortcuts.xml'));
    const kp = npp.plan(K.o);
    ok(kp.notes.some(s => /check this file.*already used/.test(s)), 'taken key: plan says so');
    npp.install(K.o);
    const t = fs.readFileSync(path.join(K.S, 'shortcuts.xml'), 'latin1');
    ok(/name="ARSENAL: check this file" Ctrl="no" Alt="no" Shift="no" Key="0"/.test(t) && /name="ARSENAL: show vanilla" Ctrl="yes" Alt="yes" Shift="yes" Key="86"/.test(t), 'taken key: command without key, others keyed');
    ok(!t.includes('\r\n') && X.wellFormed(t) === null && !/<UserDefinedCommands \/>/.test(t), 'taken: LF kept, self-closed block opened, well-formed');
    npp.uninstall(K.o);
    ok(fs.readFileSync(path.join(K.S, 'shortcuts.xml')).equals(orig) && hashDir(K.S, ['arsenal-backup']) === b0, 'taken: uninstall restores the self-closed block byte-identical');
  }

  // --- functionList already in settings: merge overrideMap, no stock copy
  {
    const F = setup('flmerge');
    F.o.functionList = true;
    copyDir(path.join(F.I, 'functionList'), path.join(F.S, 'functionList'));
    const b0 = hashDir(F.S);
    const fp = npp.plan(F.o);
    ok(!fp.targets.some(t => /stock/.test(t.why)) && fp.targets.find(t => /overrideMap/.test(t.path)).action === 'merge', 'existing functionList: overrideMap merge, no copy');
    npp.install(F.o);
    ok(npp.plan(F.o).targets.every(t => t.action === 'skip'), 'existing functionList: second plan all skip');
    npp.uninstall(F.o);
    ok(hashDir(F.S, ['arsenal-backup']) === b0, 'existing functionList: uninstall byte-identical');
  }

  // --- open
  {
    const calls = []; const spawn = (exe, args, op) => { calls.push({ exe, args, op }); return { unref() {} }; };
    const f = path.join(FX, 'theme', 'GEM2.xml');
    const r = npp.open({ exe: 'C:\\npp\\notepad++.exe', file: f, line: 12, col: 5, readOnly: true, spawn });
    ok(r.ok && calls.length === 1 && JSON.stringify(calls[0].args) === JSON.stringify(['-n12', '-c5', '-ro', path.resolve(f)]), 'open argv with -ro');
    ok(calls[0].op.shell === false && calls[0].op.detached === true && calls[0].exe === 'C:\\npp\\notepad++.exe', 'open: shell false, detached');
    npp.open({ exe: 'C:\\npp\\notepad++.exe', file: f, spawn });
    ok(JSON.stringify(calls[1].args) === JSON.stringify(['-n1', '-c1', path.resolve(f)]), 'open defaults line/col 1, no -ro');
    ok(!npp.open({ exe: 'x', file: path.join(W, 'missing.def'), spawn }).ok && calls.length === 2, 'open refuses a missing file');
  }

  // --- cli send / vanilla against a stub server
  {
    const LA = path.join(W, 'localappdata'); fs.mkdirSync(path.join(LA, 'ARSENAL'), { recursive: true });
    const old = process.env.LOCALAPPDATA; process.env.LOCALAPPDATA = LA;
    const got = [];
    const srv = http.createServer((req, res) => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url === '/api/health') { health.push(req.headers.host); return res.end('{"ok":true,"version":1}'); }
      got.push({ url: req.url, method: req.method, ct: req.headers['content-type'], host: req.headers.host, body: JSON.parse(Buffer.concat(ch).toString('utf8')) }); res.end('{"ok":true}'); }); });
    const health = [];
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port, gj = path.join(LA, 'ARSENAL', 'gui.json');
    ok(cli.guiFile() === gj, 'gui.json path under LOCALAPPDATA');
    fs.writeFileSync(gj, JSON.stringify({ port, pid: process.pid, token: 'tok1' }));
    const log = console.log, err = console.error; const out = []; console.log = s => out.push(String(s)); console.error = s => out.push(String(s));
    let c1, c2, c3, c4, c5;
    try {
      c1 = await cli.run(['send', 'C:\\m\\a.def', '7', '3']);
      c2 = await cli.run(['vanilla', 'C:\\m\\a.def']);
      fs.writeFileSync(gj, JSON.stringify({ port, pid: 999999, token: 'tok1' }));
      c3 = await cli.run(['send', 'C:\\m\\a.def']);
      await new Promise(r => srv.close(r));
      fs.writeFileSync(gj, JSON.stringify({ port, pid: process.pid, token: 'tok1' }));
      c4 = await cli.run(['send', 'C:\\m\\a.def']);
      fs.unlinkSync(gj);
      c5 = await cli.run(['send', 'C:\\m\\a.def']);
    } finally { console.log = log; console.error = err; process.env.LOCALAPPDATA = old; }
    ok(c1 === 0 && got[0].url === '/api/x/ide/inbox' && got[0].method === 'POST' && got[0].ct === 'application/json' && got[0].host === '127.0.0.1:' + port, 'send: POST inbox with headers');
    ok(JSON.stringify(got[0].body) === JSON.stringify({ token: 'tok1', file: path.resolve('C:\\m\\a.def'), line: 7, col: 3 }), 'send body: ' + JSON.stringify(got[0].body));
    ok(c2 === 0 && got[1].body.vanilla === true && got[1].body.line === 1, 'vanilla: vanilla flag');
    ok(c3 === 3 && c4 === 3 && c5 === 3 && got.length === 2, 'stale pid / refused / missing gui.json -> exit 3');
    ok(out.some(s => /No ARSENAL GUI is answering/.test(s)), 'send prints how to start the GUI');
    ok(health.length === 2 && health[0] === '127.0.0.1:' + port, 'send: health checked before each token send');
  }

  // --- LOW 12: pid required; a foreign process on the port never gets the token; non-JSON reply -> exit 3
  {
    const LA = path.join(W, 'localappdata2'); fs.mkdirSync(path.join(LA, 'ARSENAL'), { recursive: true });
    const old = process.env.LOCALAPPDATA; process.env.LOCALAPPDATA = LA;
    let mode = 'foreign'; const seen = [];
    const srv = http.createServer((req, res) => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => {
      seen.push({ method: req.method, url: req.url, body: Buffer.concat(ch).toString('utf8') });
      if (mode === 'foreign') { res.setHeader('content-type', 'text/html'); return res.end('<html>someone else</html>'); }
      if (mode === 'notok') { res.setHeader('content-type', 'application/json'); return res.end('{"ok":false}'); }
      if (req.url === '/api/health') { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
      res.end('plain text, not JSON'); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port, gj = path.join(LA, 'ARSENAL', 'gui.json');
    const log = console.log, err = console.error; const out = []; console.log = s => out.push(String(s)); console.error = s => out.push(String(s));
    let c1, c2, c3, c4;
    try {
      fs.writeFileSync(gj, JSON.stringify({ port, token: 'secret' }));
      c1 = await cli.run(['send', 'C:\\m\\a.def']);
      fs.writeFileSync(gj, JSON.stringify({ port, pid: process.pid, token: 'secret' }));
      c2 = await cli.run(['send', 'C:\\m\\a.def']);
      mode = 'notok'; c3 = await cli.run(['send', 'C:\\m\\a.def']);
      mode = 'gui-odd'; c4 = await cli.run(['send', 'C:\\m\\a.def']);
    } finally { console.log = log; console.error = err; process.env.LOCALAPPDATA = old; await new Promise(r => srv.close(r)); }
    ok(c1 === 3 && out.some(s => /has no pid/.test(s)), 'send: gui.json without pid -> exit 3, nothing sent');
    ok(c2 === 3 && c3 === 3 && out.filter(s => /did not answer as expected/.test(s)).length >= 3, 'send: foreign/odd health -> exit 3 with "did not answer as expected"');
    const tokenSeen = seen.filter(s => s.body.includes('secret'));
    ok(tokenSeen.length === 1 && tokenSeen[0].url === '/api/x/ide/inbox' && seen.filter(s => s.url === '/api/x/ide/inbox').length === 1, 'send: the token went out only after a good health answer');
    ok(c4 === 3, 'send: inbox reply that is not JSON -> exit 3');
  }

  // --- cli npp status --json on the fake folders
  {
    const C = setup('cli');
    const log = console.log; const out = []; console.log = s => out.push(String(s));
    let c; try { c = await cli.run(['npp', 'status', '--settings', C.S, '--exe', C.o.exe, '--json']); } finally { console.log = log; }
    const j = JSON.parse(out.join('\n'));
    ok(c === 0 && j.settingsDir === path.resolve(C.S) && j.version === '8.9.8.1', 'cli npp status --json');
    const err = console.error, out2 = []; console.log = s => out2.push(String(s)); console.error = s => out2.push(String(s));
    try { c = await cli.run(['npp', 'bogus']); } finally { console.log = log; console.error = err; }
    ok(c === 2, 'cli usage exit 2');
  }

  await review();

  // --- well-formedness checker catches defects
  ok(X.wellFormed('<a><b></a>') && X.wellFormed('<a x=1/>') && X.wellFormed('<a>&bad;</a>') && X.wellFormed('<a/><b/>') && X.wellFormed('<a x="1" x="2"/>') && !X.wellFormed('<?xml version="1.0"?><!-- c --><a x="&amp;">t</a>'), 'wellFormed catches defects');

  console.log(n + ' checks, ' + fails + ' failed');
  console.log(fails ? 'FAIL' : 'PASS');
  process.exitCode = fails ? 1 : 0;
}
// ===== review fixes (npp-fix): one block per finding =====
const tmpLeft = d => { const o = []; (function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else if (/\.arsenal-tmp-/.test(e.name)) o.push(f); } })(d); return o; };
const writeMan = (S, m) => { fs.mkdirSync(path.join(S, 'arsenal'), { recursive: true }); fs.writeFileSync(path.join(S, 'arsenal', 'manifest.json'), typeof m === 'string' ? m : JSON.stringify(m)); };
const quiet = async f => { const log = console.log, err = console.error, out = []; console.log = s => out.push(String(s)); console.error = s => out.push(String(s)); let c; try { c = await f(); } finally { console.log = log; console.error = err; } return { c, out: out.join('\n') }; };

async function review() {
  // HIGH 1: manifest shape -> BAD_MANIFEST; each bad path refused and kept, the rest proceeds
  {
    const M = setup('badman');
    const bad = ['{not json', '[]', JSON.stringify({ files: {}, commands: [], dirs: [] }), JSON.stringify({ files: [{ path: 'a.xml', action: 'new' }], commands: [], dirs: [] }),
      JSON.stringify({ files: [{ path: 'a.xml', sha1: 'a'.repeat(40), action: 'zap' }], commands: [], dirs: [] }), JSON.stringify({ files: [], commands: [1], dirs: [] }), JSON.stringify({ files: [], commands: [] })];
    let allBad = true;
    for (const b of bad) {
      writeMan(M.S, b); const h = hashDir(M.S);
      const u = npp.uninstall(M.o);
      if (!(u.refuse.length === 1 && u.refuse[0].code === 'BAD_MANIFEST' && hashDir(M.S) === h)) { allBad = false; console.log('  shape not refused: ' + b); }
    }
    ok(allBad, 'BAD_MANIFEST: ' + bad.length + ' bad shapes refused, nothing changed');
    ok(codes(npp.plan(M.o)).includes('BAD_MANIFEST') && !npp.plan(M.o).ok && !npp.install(M.o).ok, 'BAD_MANIFEST: plan and install refuse too');

    const P2 = setup('badpaths');
    const outside = path.join(W, 'badpaths', 'outside'); fs.mkdirSync(outside, { recursive: true });
    const victim = path.join(outside, 'victim.txt'); fs.writeFileSync(victim, 'keep me');
    const vs = sha1(fs.readFileSync(victim));
    fs.symlinkSync(outside, path.join(P2.S, 'jdir'), 'junction');
    fs.mkdirSync(path.join(P2.S, 'sub')); fs.writeFileSync(path.join(P2.S, 'sub', 'Config.xml'), 'keep me');
    fs.mkdirSync(path.join(P2.S, 'mine')); fs.writeFileSync(path.join(P2.S, 'mine', 'ours.xml'), 'keep me');
    fs.mkdirSync(path.join(P2.S, 'emptyin')); fs.mkdirSync(path.join(outside, 'emptyout'));
    const langs = sha1(fs.readFileSync(path.join(P2.S, 'langs.xml')));
    writeMan(P2.S, { version: 1, files: [
      { path: '../outside/victim.txt', sha1: vs, action: 'new' },
      { path: victim, sha1: vs, action: 'new' },
      { path: 'LANGS.XML', sha1: langs, action: 'new' },
      { path: 'sub/Config.xml', sha1: vs, action: 'new' },
      { path: 'jdir/victim.txt', sha1: vs, action: 'new' },
      { path: 'mine/ours.xml', sha1: vs, action: 'merge' },
      { path: 'mine/ours.xml', sha1: vs, action: 'new' },
    ], commands: [], dirs: ['../outside/emptyout', 'emptyin', 'jdir'] });
    const u = npp.uninstall(P2.o);
    ok(fs.readFileSync(victim, 'utf8') === 'keep me' && fs.existsSync(path.join(P2.S, 'langs.xml')) && fs.existsSync(path.join(P2.S, 'sub', 'Config.xml')), 'bad paths: outside / absolute / langs.xml / config.xml (any case, any depth) / junction all left alone');
    ok(u.kept.filter(k => /^refused/.test(k.why)).length === 6, 'bad paths: six entries refused and reported: ' + u.kept.map(k => k.why).join(' | '));
    ok(!fs.existsSync(path.join(P2.S, 'mine', 'ours.xml')) && u.removed.some(r => /ours\.xml$/.test(r)), 'bad paths: the good entry still removed');
    ok(!fs.existsSync(path.join(P2.S, 'emptyin')) && fs.existsSync(path.join(outside, 'emptyout')) && fs.existsSync(path.join(P2.S, 'jdir')), 'dirs: inside empty removed, outside and junction kept');
    ok(npp.entryProblem(P2.S, 'functionList/other.xml', 'merge') && !npp.entryProblem(P2.S, 'functionList/overrideMap.xml', 'merge') && !npp.entryProblem(P2.S, 'shortcuts.xml', 'merge'), 'merge only shortcuts.xml and functionList/overrideMap.xml');
  }

  // HIGH 2: running check fails closed
  {
    const T = npp.parseTasklist;
    ok(T({ error: new Error('x') }) === 'unknown' && T({ status: 1, stdout: 'INFO: x' }) === 'unknown' && T({ status: null, signal: 'SIGTERM', stdout: '' }) === 'unknown' && T({ status: 0, stdout: '' }) === 'unknown' && T({ status: 0, stdout: 'garbage\r\n' }) === 'unknown', 'tasklist: error / exit 1 / timeout / empty / garbage -> unknown');
    ok(T({ status: 0, stdout: '"System","4","Services","0","144 K"\r\n"notepad++.exe","9","Console","1","30 K"\r\n' }) === true && T({ status: 0, stdout: '"System","4","Services","0","144 K"\r\n' }) === false && T({ status: 0, stdout: 'INFO: No tasks are running which match the specified criteria.\r\n' }) === false, 'tasklist: notepad++ row -> true, other rows or INFO -> false');
    const R = setup('rununknown'), h = hashDir(R.S), o = Object.assign({}, R.o, { running: 'unknown' });
    const pp = npp.plan(o), ii = npp.install(o), uu = npp.uninstall(o);
    ok(codes(pp).includes('RUN_UNKNOWN') && !pp.ok && !ii.ok && uu.refuse[0].code === 'RUN_UNKNOWN' && hashDir(R.S) === h, 'RUN_UNKNOWN refuses plan, install, uninstall; nothing written');
    ok(npp.status(o).problems.includes('RUN_UNKNOWN'), 'status lists RUN_UNKNOWN');
  }

  // HIGH 3: half-way install: temp+rename, partial manifest, backup + written returned, uninstall undoes it
  {
    const H = setup('partial'); const b0 = hashDir(H.S), origSc = fs.readFileSync(path.join(H.S, 'shortcuts.xml'));
    const p = npp.plan(H.o), n = p.targets.filter(t => t.action !== 'skip').length;
    const r = npp.install(Object.assign({}, H.o, { failAt: n - 1 }));
    const man = JSON.parse(fs.readFileSync(path.join(H.S, 'arsenal', 'manifest.json'), 'utf8'));
    ok(!r.ok && r.partial && /stopped before writing/.test(r.error) && r.written.length === n - 1 && r.backup && fs.existsSync(path.join(r.backup, 'shortcuts.xml')), 'partial: result has error, written list and backup');
    ok(man.partial === true && /stopped before/.test(man.error) && man.files.length === n - 1, 'partial: manifest written for what was done');
    ok(fs.readFileSync(path.join(H.S, 'shortcuts.xml')).equals(origSc) && tmpLeft(H.S).length === 0, 'partial: the file not reached is untouched, no temp files left');
    const u = npp.uninstall(H.o);
    ok(u.refuse.length === 0 && /half way/.test(u.note) && hashDir(H.S, ['arsenal-backup']) === b0, 'partial: uninstall brings the folder back byte-identical');
    // failure on the very first write still leaves a manifest and no damage
    const H2 = setup('partial0'); const c0 = hashDir(H2.S);
    const r0 = npp.install(Object.assign({}, H2.o, { failAt: 0 }));
    ok(!r0.ok && r0.partial && r0.written.length === 0 && r0.manifest && hashDir(H2.S, ['arsenal-backup', 'arsenal']) === c0, 'partial at write 0: manifest only');
    npp.uninstall(H2.o);
    ok(hashDir(H2.S, ['arsenal-backup']) === c0, 'partial at write 0: uninstall clean');
  }

  // MED 4: extension list
  {
    const E = setup('exts'); const p = npp.plan(E.o);
    const bad = ['reg', 'tex', 'ps', 'tpl', 'font', 'txt', 'log', ''];
    ok(bad.every(x => !p.exts.includes(x)), 'exts: no generic types (' + bad.join(' ') + ')');
    ok(gen.THEME_EXT.every(x => p.exts.includes(x)) && ['lng', 'def1', 'ctm', 'etf'].every(x => p.exts.includes(x)), 'exts: theme types + AS2 SDL types + lng: ' + p.exts.join(' '));
    const udlExt = /ext="([^"]*)"/.exec(p.targets.find(t => /\.udl\.xml$/.test(t.path)).content.toString('utf8'))[1];
    ok(udlExt === p.exts.join(' ') && p.notes.filter(s => s.includes(udlExt)).length === 1, 'exts: the plan prints the final list in one line');
    const p2 = npp.plan(Object.assign({}, E.o, { extSkip: 'mod, .info' }));
    ok(!p2.exts.includes('mod') && !p2.exts.includes('info') && p2.exts.includes('def'), 'extSkip leaves types out');
    const cr = await quiet(() => cli.run(['npp', 'plan', '--settings', E.S, '--exe', E.o.exe, '--theme', E.o.theme, '--ext-skip', 'mod,pot', '--json']));
    const j = JSON.parse(cr.out);
    ok(!j.exts.includes('mod') && !j.exts.includes('pot') && j.exts.includes('def'), 'cli --ext-skip');
  }

  // MED 5: function list opt-in
  {
    const F = setup('floff'); const p = npp.plan(F.o);
    ok(!p.targets.some(t => /[\\/]functionList[\\/]/.test(t.path)) && p.notes.some(s => /--function-list/.test(s) && /stock parsers/.test(s) && /until you uninstall/.test(s)), 'functionList off by default: no targets, a note says how to turn it on');
    const r = npp.install(F.o);
    ok(r.ok && !fs.existsSync(path.join(F.S, 'functionList')), 'functionList off: install makes no functionList folder');
    const F2 = setup('flon'); const r2 = npp.install(Object.assign({}, F2.o, { functionList: true }));
    const man = JSON.parse(fs.readFileSync(r2.manifest, 'utf8'));
    ok(['functionList/ini.xml', 'functionList/gem2-as2.xml', 'functionList/overrideMap.xml'].every(x => man.files.some(f => f.path === x)), 'functionList on: every copied file is in the manifest');
    const cr = await quiet(() => cli.run(['npp', 'plan', '--settings', F2.S, '--exe', F2.o.exe, '--theme', F2.o.theme, '--function-list', '--json']));
    ok(JSON.parse(cr.out).targets.some(t => /gem2-as2\.xml$/.test(t.path)), 'cli --function-list');
  }

  // MED 6: a user's GEM2-AS2.udl.xml is backed up, recorded and put back
  {
    const U = setup('udlrep'); const f = path.join(U.S, 'userDefineLangs', 'GEM2-AS2.udl.xml');
    fs.mkdirSync(path.dirname(f)); const mine = Buffer.from('<NotepadPlus><!-- my own udl \u00e9 --></NotepadPlus>\r\n', 'utf8'); fs.writeFileSync(f, mine);
    const b0 = hashDir(U.S);
    const t = npp.plan(U.o).targets.find(x => x.path === f);
    ok(t.action === 'new' && t.replace === true && /^replace \(your file is backed up/.test(t.why), 'udl replace: plan says replace (backed up)');
    const hum = await quiet(() => cli.run(['npp', 'plan', '--settings', U.S, '--exe', U.o.exe, '--theme', U.o.theme]));
    ok(/^replace +.*GEM2-AS2\.udl\.xml +replace \(your file/m.test(hum.out), 'udl replace: cli prints replace');
    const r = npp.install(U.o);
    const e = JSON.parse(fs.readFileSync(r.manifest, 'utf8')).files.find(x => x.path === 'userDefineLangs/GEM2-AS2.udl.xml');
    ok(e && /^arsenal-backup\//.test(e.replaced) && fs.readFileSync(path.join(U.S, e.replaced)).equals(mine), 'udl replace: manifest records replaced backup');
    ok(npp.install(U.o).targets.find(x => x.path === f).action === 'skip', 'udl replace: second install skips');
    npp.uninstall(U.o);
    ok(fs.readFileSync(f).equals(mine) && hashDir(U.S, ['arsenal-backup']) === b0, 'udl replace: uninstall puts the user file back byte-identical');
  }

  // MED 7: elevated copy over a different file; del only for our file
  {
    const V = setup('acdiff'); const inst = path.join(V.I, 'autoCompletion', 'GEM2-AS2.xml');
    fs.writeFileSync(inst, '<NotepadPlus>someone else</NotepadPlus>');
    const p = npp.plan(V.o);
    ok(p.elevated.length === 1 && p.elevated[0].overwrites === true && p.notes.some(s => /different .*GEM2-AS2\.xml.*replaces it/.test(s)), 'elevated: plan warns it would overwrite a different file');
    npp.install(V.o);
    const u = npp.uninstall(V.o);
    ok(u.elevated.length === 0 && u.kept.some(k => k.path === inst && /not the auto-completion file ARSENAL staged/.test(k.why)), 'elevated: no del for a file that is not ours');
    const V2 = setup('acsame'); const inst2 = path.join(V2.I, 'autoCompletion', 'GEM2-AS2.xml');
    npp.install(V2.o); fs.copyFileSync(path.join(V2.S, 'arsenal', 'autoCompletion', 'GEM2-AS2.xml'), inst2);
    ok(npp.plan(V2.o).elevated.length === 0, 'elevated: nothing to copy when the same file is there');
    const u2 = npp.uninstall(V2.o);
    ok(u2.elevated.length === 1 && u2.elevated[0].cmd === 'del "' + inst2 + '"', 'elevated: del suggested for the file we staged');
  }

  // LOW 8: exact bytes back for self-closed, one-line and multi-line blocks, BOM or not, CRLF or LF
  {
    const cmds = npp.commands({ file: 'C:\\n\\node.exe', args: ['x.js'] });
    const blocks = { self: '\t<UserDefinedCommands />', oneline: '\t<UserDefinedCommands></UserDefinedCommands>', tight: '\t<UserDefinedCommands><Command name="Mine" Ctrl="no" Alt="no" Shift="no" Key="0">x</Command></UserDefinedCommands>',
      multi: '\t<UserDefinedCommands>\n\t\t<Command name="Mine" Ctrl="no" Alt="no" Shift="no" Key="0">x</Command>\n\t</UserDefinedCommands>' };
    let all = true, cnt = 0;
    for (const [k, blk] of Object.entries(blocks)) for (const bom of [false, true]) for (const eol of ['\r\n', '\n']) {
      const txt = ('<?xml version="1.0" encoding="UTF-8" ?>\n<NotepadPlus>\n\t<Macros />\n' + blk + '\n\t<PluginCommands />\n</NotepadPlus>\n').replace(/\n/g, eol);
      const orig = Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(txt, 'latin1')]);
      const m = npp.mergeShortcuts(orig, cmds); cnt++;
      const t = m.buf.toString('latin1');
      const good = X.wellFormed(t.replace(/^\u00ef\u00bb\u00bf/, '')) === null && (t.match(/ARSENAL:/g) || []).length === 3 && npp.unmergeShortcuts(m.buf, m.wrap).equals(orig)
        && npp.mergeShortcuts(m.buf, cmds).buf.equals(m.buf) && npp.unmergeShortcuts(npp.mergeShortcuts(m.buf, cmds).buf, m.wrap).equals(orig);
      if (!good) { all = false; console.log('  round trip failed: ' + k + ' bom=' + bom + ' eol=' + JSON.stringify(eol)); }
    }
    ok(all && cnt === 16, 'shortcuts round trip byte-identical in ' + cnt + ' variants');
    const O = setup('oneline'); const sc = path.join(O.S, 'shortcuts.xml');
    const one = Buffer.from('\ufeff<?xml version="1.0" encoding="UTF-8" ?>\r\n<NotepadPlus>\r\n\t<UserDefinedCommands></UserDefinedCommands>\r\n</NotepadPlus>\r\n', 'utf8');
    fs.writeFileSync(sc, one); const b0 = hashDir(O.S);
    npp.install(O.o); npp.uninstall(O.o);
    ok(fs.readFileSync(sc).equals(one) && hashDir(O.S, ['arsenal-backup']) === b0, 'one-line block: install + uninstall byte-identical');
  }

  // LOW 9: realpath containment with a separator check; a junction inside the settings folder stops install
  {
    const J = setup('realpath'); const sib = J.S + '2'; fs.mkdirSync(sib, { recursive: true });
    ok(!npp.realInside(J.S, path.join(sib, 'x.xml')) && npp.realInside(J.S, path.join(J.S, 'a', 'b', 'x.xml')), 'realInside: sibling folder with the same prefix is outside');
    const out = path.join(W, 'realpath', 'elsewhere'); fs.mkdirSync(out);
    fs.symlinkSync(out, path.join(J.S, 'userDefineLangs'), 'junction');
    const r = npp.install(J.o);
    ok(!r.ok && /symlink or junction/.test(r.error) && fs.readdirSync(out).length === 0 && r.written.length === 0, 'junction in the settings folder: install refuses, nothing written outside');
    const JS = path.join(W, 'realpath', 'via'); fs.symlinkSync(J.S, JS, 'junction');
    fs.unlinkSync(path.join(J.S, 'userDefineLangs'));
    const npp2 = npp.uninstall(J.o); // clear the partial manifest
    const r2 = npp.install(Object.assign({}, J.o, { settingsDir: JS }));
    ok(npp2.refuse.length === 0 && r2.ok && r2.written.length > 0, 'settings folder reached through a junction still installs (realpath on both sides)');
  }

  // LOW 10: isTheme reads the whole file; over 16 MB its own message
  {
    const pad = '<!-- ' + 'x'.repeat((1 << 20) + 100) + ' -->';
    ok(npp.isTheme(Buffer.from('<?xml version="1.0"?>\n<NotepadPlus>' + pad + '<LexerStyles></LexerStyles></NotepadPlus>\n')), 'isTheme: marker after the first 1 MB found');
    const big = path.join(W, 'big-theme.xml'); fs.writeFileSync(big, Buffer.alloc(npp.THEME_CAP + 10, 0x20));
    const B = setup('bigtheme'); const p = npp.plan(Object.assign({}, B.o, { theme: big }));
    ok(p.refuse.some(r => r.code === 'NO_THEME' && /larger than 16 MB/.test(r.msg)), 'theme over 16 MB: own message');
    fs.unlinkSync(big);
  }

  // LOW 11: uninstall refuses PORTABLE / CLOUD like plan; force is no bypass
  {
    const L = setup('uninstrefuse'); npp.install(L.o); const h = hashDir(L.S);
    fs.writeFileSync(path.join(L.I, 'doLocalConf.xml'), '');
    const u1 = npp.uninstall(Object.assign({}, L.o, { force: true }));
    fs.unlinkSync(path.join(L.I, 'doLocalConf.xml'));
    fs.mkdirSync(path.join(L.S, 'cloud')); fs.writeFileSync(path.join(L.S, 'cloud', 'choice'), 'D:\\c');
    const u2 = npp.uninstall(L.o);
    fs.rmSync(path.join(L.S, 'cloud'), { recursive: true });
    const u3 = npp.uninstall(Object.assign({}, L.o, { running: true, force: true }));
    ok(u1.refuse.some(r => r.code === 'PORTABLE') && u2.refuse.some(r => r.code === 'CLOUD') && u3.refuse.some(r => r.code === 'RUNNING') && hashDir(L.S) === h && u1.removed.length + u2.removed.length + u3.removed.length === 0, 'uninstall refuses PORTABLE / CLOUD / RUNNING, force does not bypass');
    ok(!/force/.test(fs.readFileSync(path.join(__dirname, '..', 'npp', 'index.js'), 'utf8').replace(/no force\/bypass/, '')), 'index.js has no force option');
  }

  // LOW 13: CDATA kept out of tag search
  {
    const t = '<a><![CDATA[<Command name="ARSENAL: x">y</Command> <!-- ]]><b/><!-- <![CDATA[ --><c/></a>';
    ok(X.findAll(t, /<Command\b/g).length === 0 && X.findAll(t, /<b\/>/g).length === 1 && X.findAll(t, /<c\/>/g).length === 1 && X.commentRanges(t).length === 2, 'CDATA skipped; <!-- inside CDATA and <![CDATA[ inside a comment open nothing');
  }

  // cli: sentences for the new refuse codes
  {
    const C = setup('clihint'); writeMan(C.S, '{bad');
    const r = await quiet(() => cli.run(['npp', 'plan', '--settings', C.S, '--exe', C.o.exe, '--theme', C.o.theme]));
    ok(r.c === 1 && /REFUSED BAD_MANIFEST: arsenal\\manifest\.json is damaged/.test(r.out) && /will not guess/.test(r.out), 'cli: BAD_MANIFEST sentence');
    const u = await quiet(() => cli.run(['npp', 'uninstall', '--settings', C.S, '--exe', C.o.exe]));
    ok(u.c === 1 && /REFUSED (BAD_MANIFEST|RUNNING|RUN_UNKNOWN)/.test(u.out), 'cli: uninstall prints refusals, exit 1');
  }
}

main().catch(e => { console.log(e.stack); console.log('FAIL'); process.exitCode = 1; });

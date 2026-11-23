// zip.js: seeded release gate (forbidden file/content refused, no zip written) + deterministic, readable zip. Fake small exes, no sea build.
// Author: Imperator_Aug (ARSENAL, ia-220aa78b)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), { spawnSync } = require('child_process');
const ZIP = path.join(__dirname, '..', 'zip.js'), W = path.join(__dirname, 'work-zip');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } };
fs.rmSync(W, { recursive: true, force: true });
const mk = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };
function setup(name, { exeText = 'MZ fake exe', keys = { 'a/a.js': 'module.exports=1' } } = {}) {
  const d = path.join(W, name);
  mk(path.join(d, 'exes', 'ARSENAL.exe'), exeText);   // one exe (W6 U1)
  for (const [k, v] of Object.entries(keys)) mk(path.join(d, 'assets', k), (/\.js$/.test(k) ? '// Author: Imperator_Aug (as64 toolkit, ia-00000000)\n' : '') + v); // creditgate wants the stamp
  mk(path.join(d, 'exes', 'manifest.json'), JSON.stringify(Object.keys(keys).sort()));
  return d;
}
// sidecar folders (workshop_gui, gemindex, ww2sources) default to the local build output: left out here unless a test names them, so the golden is stable
function run(d, extra = [], env = {}) {
  const side = ['workshop_gui', 'gemindex', 'ww2sources', 'pdf'].flatMap(n => extra.some(x => x === '--' + n || x === '--no-' + n) ? [] : ['--no-' + n]);   // the guide PDF too: a build output, absent on a fresh checkout
  if (!extra.some(x => x === '--whole-root' || x === '--no-whole')) side.push('--no-whole');   // the whole documents too (a build output and batch work in flight): block 11 tests them on fixtures
  const r = spawnSync(process.execPath, [ZIP, '--exes', path.join(d, 'exes'), '--assets-root', path.join(d, 'assets'), '--out-dir', path.join(d, 'out'), '--ver', '9.9.9', ...side, ...extra],
    { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname', ...env } });
  return { rc: r.status, out: r.stdout + r.stderr, zip: path.join(d, 'out', 'ARSENAL-9.9.9.zip') };
}
// minimal reader: central directory -> entries, inflate + crc each
function readZip(f) {
  const b = fs.readFileSync(f), e = b.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  const n = b.readUInt16LE(e + 10); let p = b.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < n; i++) {
    const nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.slice(p + 46, p + 46 + nl).toString('utf8'), crc = b.readUInt32LE(p + 16), cs = b.readUInt32LE(p + 20);
    const lo = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), data = zlib.inflateRawSync(b.slice(lo, lo + cs));
    out.push({ name, crcOk: zlib.crc32(data) === crc, data });
    p += 46 + nl + xl + cl;
  }
  return out;
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// 1 clean: written, readable, sorted under one top folder, sha printed + sidecar, same bytes twice
let d = setup('clean', { keys: { 'a/a.js': 'x', 'goh2as2/goh2as2.js': 'converter code ok', 'k/vocab.goh.json': '{}' } });
let r = run(d);
ok(r.rc === 0, '1 clean rc ' + r.rc + '\n' + r.out);
ok(fs.existsSync(r.zip), '1 zip written');
if (fs.existsSync(r.zip)) {
  const es = readZip(r.zip), names = es.map(e => e.name);
  ok(es.every(e => e.crcOk), '1 crc');
  ok(names.every(n => n.startsWith('ARSENAL-9.9.9/')), '1 top folder');
  ok(JSON.stringify(names) === JSON.stringify([...names].sort()), '1 sorted');
  for (const n of ['ARSENAL.exe', 'ARSENAL-gui.cmd', 'Install-ARSENAL.cmd', 'START-HERE.md', 'LICENSE', 'NOTICE']) ok(names.includes('ARSENAL-9.9.9/' + n), '1 has ' + n);
  ok(es.find(e => e.name.endsWith('/ARSENAL.exe')).data.toString() === 'MZ fake exe', '1 exe bytes');
  const h = sha(r.zip);
  ok(r.out.includes('sha256 ' + h), '1 sha printed');
  ok(fs.readFileSync(r.zip + '.sha256', 'utf8').startsWith(h), '1 sidecar');
  ok(/WARN embedded k\/vocab\.goh\.json/.test(r.out) && !/goh2as2\.js/.test(r.out), '1 GoH-named data warns, converter code silent');
  const r2 = run(d); ok(r2.rc === 0 && sha(r2.zip) === h, '1 deterministic');
}
// 2 seeded forbidden zip entries: refused, no zip
const refused = (name, opt, extra, want) => {
  const d = setup(name, opt), r = run(d, extra);
  ok(r.rc === 1, `${name} rc ${r.rc} (want 1)\n${r.out}`);
  ok(!fs.existsSync(r.zip) && !fs.existsSync(r.zip + '.part'), name + ' no zip');
  ok(want.test(r.out), `${name} message\n${r.out}`);
};
refused('dds', {}, ['--add', mk(path.join(W, 'seed', 'tank.dds'), 'DDS ')], /REFUSED zip .*tank\.dds: game asset type/);
refused('email', {}, ['--add', mk(path.join(W, 'seed', 'notes.txt'), 'mail me: someone@realmail.net')], /REFUSED .*email/);
refused('userpath', {}, ['--add', mk(path.join(W, 'seed2', 'notes.txt'), 'see C:\\Users\\bob\\Desktop\\x')], /absolute user path/);
// 3 seeded forbidden embedded files (the exe's files list) and exe bytes
refused('embname', { keys: { 'a/a.js': 'x', 'port/tank_goh.ply': 'ply' } }, [], /REFUSED embedded port\/tank_goh\.ply: game asset type/);
refused('embid', { keys: { 'a/a.js': 'const ID = /zzseedname/' } }, [], /REFUSED embedded a\/a\.js: names the local\/git user/);
refused('embpath', { keys: { 'a/a.js': "const p = '/home/alice/as2'" } }, [], /REFUSED embedded a\/a\.js: absolute user path/);
refused('exebytes', { exeText: 'MZ...C:/Users/carol/dev/x...' }, [], /REFUSED zip .*ARSENAL.exe \(bytes\): absolute user path/);
// 4 placeholders are not users; --check writes nothing; bad call = 2
d = setup('placeholder'); r = run(d, ['--check', '--add', mk(path.join(W, 'seed3', 'notes.txt'), 'C:\\Users\\<you>\\x and /home/<name>/ and dev@example.com')]);
ok(r.rc === 0 && /--check: no zip written/.test(r.out) && !fs.existsSync(r.zip), '4 placeholder/--check\n' + r.out);
ok(run(setup('badver'), ['--ver', 'a b/c']).rc === 2, '4 bad --ver rc 2');
// 5 sea.js --drop is wired from zip.js (release exes leave out the maintainer-only tools)
const src = fs.readFileSync(ZIP, 'utf8'), sea = fs.readFileSync(path.join(__dirname, '..', 'sea.js'), 'utf8');
ok(/'--drop', RELEASE_DROP/.test(src) && /RELEASE_DROP = 'docgen,scrub,[^']*credit/.test(src) && /DROP\.has\(e\.name\)/.test(sea), '5 drop wiring');
// 6 GOLD: the zip entry list (names only, version normalized) equals zip-entries.gold.txt. A change fails until the golden is updated with a reason:
//   node tools/dist/test/zip-test.js --update-gold "why the list changed"   (rewrites the list, keeps earlier "# date reason" lines)
{
  const GOLD = path.join(__dirname, 'zip-entries.gold.txt'), d6 = setup('gold'), r6 = run(d6);
  ok(r6.rc === 0, '6 gold run rc ' + r6.rc + '\n' + r6.out);
  if (r6.rc === 0) {
    const names = readZip(r6.zip).map(e => e.name.replace(/^ARSENAL-9\.9\.9\//, 'ARSENAL-VER/'));
    ok(!names.some(n => /guide\/(PLAN|CHANGELOG|build-pdf|dist|i18n)/.test(n)), '6 guide holds more than the book');
    ok(names.filter(n => /^ARSENAL-VER\/guide\/\d\d-[^/]+\.md$/.test(n)).length === 22, '6 guide chapters: want 22');
    const gcount = re => names.filter(n => re.test(n)).length;   // the book's other parts: front page, Part I by process, Part III reference
    ok(gcount(/^ARSENAL-VER\/guide\/README\.md$/) === 1 && gcount(/^ARSENAL-VER\/guide\/p\d\d-[^/]+\.md$/) === 18 &&gcount(/^ARSENAL-VER\/guide\/r\d\d-[^/]+\.md$/) === 12,
      '6 guide book: want README, 18 p pages, 12 r pages');
    const ui = process.argv.indexOf('--update-gold');
    if (ui > 0) {
      const why = process.argv[ui + 1];
      if (!why || why.startsWith('--')) { console.log('--update-gold needs a reason'); process.exit(2); }
      const old = fs.existsSync(GOLD) ? fs.readFileSync(GOLD, 'utf8').split(/\r?\n/).filter(l => l.startsWith('# ')) : [];
      fs.writeFileSync(GOLD, [...old, '# ' + new Date().toISOString().slice(0, 10) + ' ' + why, ...names].join('\n') + '\n');
      console.log('gold updated: ' + names.length + ' entries');
    } else if (!fs.existsSync(GOLD)) ok(false, '6 ' + GOLD + ' missing (run with --update-gold "reason")');
    else {
      const want = fs.readFileSync(GOLD, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('# '));
      const add = names.filter(n => !want.includes(n)), gone = want.filter(n => !names.includes(n));
      ok(!add.length && !gone.length, '6 zip entry list differs from the golden. new: ' + add.join(' ') + ' | gone: ' + gone.join(' ') + '\n  update with: node tools/dist/test/zip-test.js --update-gold "reason"');
    }
  }
}
// 8 GUIDE PDF (owner's decision 2026-11-10): the newest guide PDF ships at guide/dist/, bytes scanned; a PDF anywhere else,
//   a file that is not a PDF, and a PDF whose bytes carry a user path or the user's name are refused. Fixtures only.
{
  const P = 'ARSENAL-9.9.9/', pd = path.join(W, 'fx-pdf');
  const pubHtml = ver => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="arsenal-whole" content="guide ${ver}"><meta name="arsenal-edition" content="public"><title>g</title></head><body>g</body></html>\n`;
  for (const k of ['good', 'path', 'id']) mk(path.join(pd, k, 'AS2-Modding-Guide-v9.1.html'), pubHtml('9.1'));   // a PDF is public only beside the public HTML of its version
  const good = mk(path.join(pd, 'good', 'AS2-Modding-Guide-v9.1.pdf'), '%PDF-1.4\n1 0 obj << /Title (AS2 Modding Guide) /Producer (a browser) >> endobj\n%%EOF\n');
  const d8 = setup('pdf'), r8 = run(d8, ['--pdf', good]);
  ok(r8.rc === 0 && readZip(r8.zip).some(e => e.name === P + 'guide/dist/AS2-Modding-Guide-v9.1.pdf' && e.crcOk) && /guide pdf: AS2-Modding-Guide-v9\.1\.pdf, \d+ B/.test(r8.out), '8 guide pdf shipped\n' + r8.out);
  const r8n = run(setup('pdfno'));
  ok(r8n.rc === 0 && /guide pdf: left out/.test(r8n.out) && !readZip(r8n.zip).some(e => /\.pdf$/.test(e.name)), '8 --no-pdf leaves it out');
  const path8 = mk(path.join(pd, 'path', 'AS2-Modding-Guide-v9.1.pdf'), '%PDF-1.4\n1 0 obj << /Title (C:\\Users\\bob\\guide\\book.html) >> endobj\n');
  let x = run(setup('pdfpath'), ['--pdf', path8]);
  ok(x.rc === 1 && /REFUSED zip .*guide\/dist\/AS2-Modding-Guide-v9\.1\.pdf \(bytes\): absolute user path/.test(x.out), '8 pdf with a user path refused\n' + x.out);
  const id8 = mk(path.join(pd, 'id', 'AS2-Modding-Guide-v9.1.pdf'), '%PDF-1.4\n1 0 obj << /Author (zzseedname) >> endobj\n');
  x = run(setup('pdfid'), ['--pdf', id8]);
  ok(x.rc === 1 && /REFUSED zip .*AS2-Modding-Guide-v9\.1\.pdf \(bytes\): names the local\/git user/.test(x.out), '8 pdf naming the user refused\n' + x.out);
  const fake8 = mk(path.join(pd, 'fake', 'AS2-Modding-Guide-v9.1.pdf'), 'MZ this is not a pdf');
  x = run(setup('pdffake'), ['--pdf', fake8]);
  ok(x.rc === 1 && /REFUSED zip .*AS2-Modding-Guide-v9\.1\.pdf: not a PDF file/.test(x.out), '8 a file that is not a PDF refused\n' + x.out);
  x = run(setup('pdfelse'), ['--add', mk(path.join(pd, 'else', 'notes.pdf'), '%PDF-1.4\n')]);
  ok(x.rc === 1 && /REFUSED zip .*notes\.pdf: not an exe, dll or text file/.test(x.out), '8 a PDF anywhere else refused\n' + x.out);
  ok(run(setup('pdfname'), ['--pdf', mk(path.join(pd, 'name', 'book.pdf'), '%PDF-1.4\n')]).rc === 2, '8 --pdf with another file name rc 2');
  const Zm = require(ZIP); for (const [n, s] of [['AS2-Modding-Guide-v1.2.pdf', 'a'], ['AS2-Modding-Guide-v1.12.pdf', 'b'], ['AS2-Modding-Guide-v2.0.pdf', 'c'], ['AS2-Modding-Guide-v2.0.html', 'd']]) mk(path.join(pd, 'pick', n), s);
  ok(path.basename(Zm.newestPdf(path.join(pd, 'pick'))) === 'AS2-Modding-Guide-v2.0.pdf' && Zm.newestPdf(path.join(pd, 'nope')) === null, '8 newest by version number');
  // GUIDE_EDITION: --pdf without the public HTML of its version beside it is refused; beside an internal HTML too
  const lone = mk(path.join(pd, 'lone', 'AS2-Modding-Guide-v9.1.pdf'), '%PDF-1.4\n');
  x = run(setup('pdflone'), ['--pdf', lone]);
  ok(x.rc === 1 && /REFUSED zip .*AS2-Modding-Guide-v9\.1\.pdf: GUIDE_EDITION no public HTML of the same version beside it/.test(x.out) && !fs.existsSync(x.zip), '8 --pdf with no public HTML beside refused\n' + x.out);
  const intl = mk(path.join(pd, 'intl', 'AS2-Modding-Guide-v9.1.pdf'), '%PDF-1.4\n'); mk(path.join(pd, 'intl', 'AS2-Modding-Guide-v9.1.html'), pubHtml('9.1').replace('<meta name="arsenal-edition" content="public">', ''));
  x = run(setup('pdfintl'), ['--pdf', intl]);
  ok(x.rc === 1 && /GUIDE_EDITION no public HTML/.test(x.out), '8 --pdf beside an internal HTML refused\n' + x.out);
}
// 7 SIDECARS: fixture gemindex + workshop_gui folders (small fake files, never the real binaries). No soedit folder (owner 2026-11-15,
//   "The copy should not be shipped"): --soedit / --no-soedit are bad calls and the gate refuses any <top>/soedit/ entry (NO_SOEDIT)
{
  const gi = path.join(W, 'fx-gemindex');
  for (const [k, v] of Object.entries({ 'guides.json': '{}', 'faq.json': '[]', 'pages/p1.json': '{"t":"page"}', 'manifest.json': '{"n":3}', 'README.md': 'index\n' })) mk(path.join(gi, k), v);
  const wsFiles = { 'workshop_gui.exe': 'MZ fake uploader', 'steam_api64.dll': 'MZ fake dll', 'steam_appid.txt': '244450', 'README.md': '# uploader' };
  const P = 'ARSENAL-9.9.9/';
  const sub = (zip, n) => readZip(zip).map(e => e.name).filter(x => x.startsWith(P + n + '/')).map(x => x.slice(P.length));
  const d7 = setup('side'), r7 = run(d7, ['--gemindex', gi]);
  ok(r7.rc === 0, '7 sidecars rc ' + r7.rc + '\n' + r7.out);
  if (r7.rc === 0) {
    ok(JSON.stringify(sub(r7.zip, 'gemindex')) === JSON.stringify(['gemindex/README.md', 'gemindex/faq.json', 'gemindex/guides.json', 'gemindex/manifest.json', 'gemindex/pages/p1.json']),
      '7 gemindex entries/order: ' + sub(r7.zip, 'gemindex').join(' '));
    ok(!readZip(r7.zip).some(e => /^[^/]+\/soedit(\/|$)/i.test(e.name)) && !/^soedit:/m.test(r7.out), '7 no soedit folder in the zip\n' + r7.out);
    ok(/gemindex: 5 files, \d+ B/.test(r7.out), '7 summary lines\n' + r7.out);
    const h = sha(r7.zip), r7b = run(d7, ['--gemindex', gi]);
    ok(r7b.rc === 0 && sha(r7b.zip) === h, '7 sidecars deterministic');
  }
  // soedit is no sidecar any more: --soedit dir and --no-soedit are bad calls (exit 2, usage without soedit, no zip)
  const so = path.join(W, 'fx-soedit'); mk(path.join(so, 'SOEdit.exe'), 'MZ fake soedit'); mk(path.join(so, 'FreeImage.dll'), 'MZ fake dll');
  for (const extra of [['--soedit', so], ['--no-soedit']]) {
    const x = run(setup('side-so' + extra.length), extra), use = x.out.split(/\r?\n/).find(l => l.startsWith('usage:')) || '';
    ok(x.rc === 2 && use && !/soedit/.test(use) && !fs.existsSync(x.zip), '7 ' + extra[0] + ' is a bad call\n' + x.out);
  }
  // NO_SOEDIT: the gate refuses a soedit folder at the top, whatever adds it; tools/soedit (the tool's own scripts) is not that folder
  {
    const Zm = require(ZIP), sf = mk(path.join(W, 'fx-nosoedit', 'README.md'), '# SOEdit\n');
    const g7 = Zm.gate([{ name: P + 'soedit/SOEdit.exe', file: sf }, { name: P + 'soedit/lang/ru.txt', file: sf }, { name: P + 'SOEdit/README.md', file: sf }], [], W, ['zzseedname']);
    ok(g7.refused.length === 3 && g7.refused.every(x => /NO_SOEDIT SOEdit is not shipped with ARSENAL/.test(x)), '7 gate refuses entries under soedit/: ' + g7.refused.join(' | '));
    ok(Zm.gate([{ name: P + 'tools/soedit/README.md', file: sf }, { name: P + 'samples/soedit-notes.md', file: sf }], [], W, ['zzseedname']).refused.length === 0, '7 NO_SOEDIT leaves tools/soedit and other names alone');
    ok(!Zm.SIDECARS.some(s => s.name === 'soedit') && !('SOEDIT_FILES' in Zm), '7 no soedit sidecar left in zip.js');
  }
  // gemindex is required (owner: "make sure the index goes with the distributable"): absent or empty folder = exit 2, no zip; --check the same
  const dg = setup('side-gi-absent'), rg = run(dg, ['--gemindex', path.join(W, 'nope2')]);
  ok(rg.rc === 2 && !fs.existsSync(rg.zip) && /error: gemindex: no folder at .*nope2.*gemindex\.js bundle --from .*--no-gemindex/.test(rg.out), '7 gemindex absent refuses\n' + rg.out);
  ok(run(dg, ['--gemindex', path.join(W, 'nope2'), '--check']).rc === 2, '7 gemindex absent refuses under --check');
  fs.mkdirSync(path.join(W, 'fx-gi-empty'), { recursive: true });
  ok(run(dg, ['--gemindex', path.join(W, 'fx-gi-empty')]).rc === 2, '7 gemindex empty folder refuses');
  // the same for --small (fixture tools tree with a stamp, the repo's pin); present = gemindex/guides.json in the small zip
  {
    const sa = path.join(W, 'small-assets');
    mk(path.join(sa, 'a', 'a.js'), '// Author: Imperator_Aug (as64 toolkit, ia-00000000)\nmodule.exports=1'); mk(path.join(sa, 'INDEX.md'), '# index\n');
    const sm = extra => { const out = path.join(W, 'small-out'), r = spawnSync(process.execPath, [ZIP, '--small', '--ver', '9.9.9', '--assets-root', sa, '--out-dir', out, '--no-workshop_gui', '--no-pdf', '--no-whole', ...(extra.includes('--ww2sources') ? [] : ['--no-ww2sources']), ...extra], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } }); return { rc: r.status, out: r.stdout + r.stderr, zip: path.join(out, 'ARSENAL-9.9.9-small.zip') }; };
    const s1 = sm(['--gemindex', path.join(W, 'nope2')]);
    ok(s1.rc === 2 && !fs.existsSync(s1.zip) && /error: gemindex: no folder at /.test(s1.out), '7 --small gemindex absent refuses\n' + s1.out);
    const s2 = sm(['--no-gemindex']);
    ok(s2.rc === 0 && !readZip(s2.zip).some(e => /\/gemindex\//.test(e.name)), '7 --small --no-gemindex builds\n' + s2.out);
    const s3 = sm(['--gemindex', gi]);
    ok(s3.rc === 0 && readZip(s3.zip).some(e => e.name === P + 'gemindex/guides.json'), '7 --small ships gemindex/guides.json\n' + s3.out);
  }
  // BAK: a .bak folder or *.bak file in a sidecar never ships (sea.js manifestKeys skips them in the tools files too)
  {
    const gb = path.join(W, 'fx-gemindex-bak'); mk(path.join(gb, 'guides.json'), '{}'); mk(path.join(gb, '.bak', 'old.json'), '{}'); mk(path.join(gb, 'x.json.bak'), '{}');
    const rb2 = run(setup('side-bak'), ['--gemindex', gb]);
    ok(rb2.rc === 0 && readZip(rb2.zip).some(e => e.name === P + 'gemindex/guides.json') && !readZip(rb2.zip).some(e => /\.bak(\/|$)/.test(e.name)), '7 .bak not shipped\n' + rb2.out);
    const ta = path.join(W, 'bak-tools'); mk(path.join(ta, 'rows', 'rows.js'), 'x'); mk(path.join(ta, 'rows', '.bak', 'limits__TST.md'), 'old'); mk(path.join(ta, 'a', 'b.json.bak'), '{}'); mk(path.join(ta, 'INDEX.md'), '#');
    const mkeys = require(path.join(__dirname, '..', 'sea.js')).manifestKeys(ta);
    ok(mkeys.includes('rows/rows.js') && !mkeys.some(k => /\.bak(\/|$)/.test(k)), '7 manifestKeys skips .bak: ' + mkeys.join(' '));
  }
  const rn = run(setup('side-no'), ['--no-workshop_gui', '--no-gemindex']);
  ok(rn.rc === 0 && /gemindex: left out \(--no-gemindex\)/.test(rn.out) && /workshop_gui: left out \(--no-workshop_gui\)/.test(rn.out) && !readZip(rn.zip).some(e => /\/(soedit|gemindex|workshop_gui)\//.test(e.name)), '7 --no-*\n' + rn.out);
  // workshop_gui (the Workshop uploader): its four files ship as <top>/workshop_gui/; the folder is required
  const wsg = path.join(W, 'fx-wsgui'); for (const [k, v] of Object.entries(wsFiles)) mk(path.join(wsg, k), v);
  const rw = run(setup('side-ws'), ['--workshop_gui', wsg]);
  ok(rw.rc === 0 && /workshop_gui: 4 files/.test(rw.out) && readZip(rw.zip).filter(e => e.name.includes('/workshop_gui/')).length === 4, '7 workshop_gui ships 4 files: ' + rw.out);
  ok(run(setup('side-ws-none'), ['--workshop_gui', path.join(W, 'fx-wsgui-none')]).rc === 2, '7 workshop_gui folder absent rc 2');
  fs.rmSync(path.join(wsg, 'steam_api64.dll')); ok(run(setup('side-ws-half'), ['--workshop_gui', wsg]).rc === 2, '7 workshop_gui missing file rc 2');
  // gate over sidecar texts and the dll: refused, no zip, summary names folder + file + kind count
  const bad = path.join(W, 'fx-wsgui-bad'); for (const [k, v] of Object.entries(wsFiles)) mk(path.join(bad, k), v);
  mk(path.join(bad, 'README.md'), 'built in C:\\Users\\dave\\src\\workshop_gui\n');
  const rb = run(setup('side-bad'), ['--workshop_gui', bad]);
  ok(rb.rc === 1 && !fs.existsSync(rb.zip) && /REFUSED workshop_gui\/: 1 file\(s\) hit; by kind: absolute user path 1; files: workshop_gui\/README\.md/.test(rb.out), '7 workshop_gui user path refused\n' + rb.out);
  const bd = path.join(W, 'fx-wsgui-dll'); for (const [k, v] of Object.entries(wsFiles)) mk(path.join(bd, k), v);
  mk(path.join(bd, 'steam_api64.dll'), 'MZ..zzseedname..');
  const rd = run(setup('side-dll'), ['--workshop_gui', bd]);
  ok(rd.rc === 1 && /REFUSED zip .*workshop_gui\/steam_api64\.dll \(bytes\): names the local\/git user/.test(rd.out), '7 dll bytes scanned\n' + rd.out);
  const ge = path.join(W, 'fx-gemindex-bad'); mk(path.join(ge, 'guides.json'), '{}'); mk(path.join(ge, 'pages/p2.json'), '{"t":"write to someone@realmail.net or other@realmail.net"}');
  const re = run(setup('side-email'), ['--gemindex', ge]);
  ok(re.rc === 1 && !fs.existsSync(re.zip) && /REFUSED gemindex\/: 1 file\(s\) hit; by kind: email 1; files: gemindex\/pages\/p2\.json/.test(re.out), '7 gemindex email refused\n' + re.out);
  // collected public texts (guides.json, pages/text/*.txt) ship as published: a post's path and a page's contact address pass,
  // the seeded private name does not, and the same text one folder away is still refused
  const post = 'Copy it to C:\\Users\\Vorabat\\Documents\\my games and ask someone@realmail.net\n';
  const gc = path.join(W, 'fx-gemindex-coll'); mk(path.join(gc, 'guides.json'), JSON.stringify({ t: post })); mk(path.join(gc, 'pages/text/aa11.txt'), post);
  const rc7 = run(setup('side-coll'), ['--gemindex', gc]);
  ok(rc7.rc === 0 && readZip(rc7.zip).some(e => e.name === P + 'gemindex/pages/text/aa11.txt'), '7 collected texts pass\n' + rc7.out);
  const gp = path.join(W, 'fx-gemindex-priv'); mk(path.join(gp, 'guides.json'), '{}'); mk(path.join(gp, 'pages/text/bb22.txt'), post + 'by zzseedname\n');
  const rp = run(setup('side-priv'), ['--gemindex', gp]);
  ok(rp.rc === 1 && !fs.existsSync(rp.zip) && /REFUSED zip .*gemindex\/pages\/text\/bb22\.txt: names the local\/git user/.test(rp.out) && !/absolute user path|email/.test(rp.out), '7 collected text with the private name refused\n' + rp.out);
  const go = path.join(W, 'fx-gemindex-other'); mk(path.join(go, 'guides.json'), '{}'); mk(path.join(go, 'pages/notes/cc33.txt'), post);
  const ro = run(setup('side-other'), ['--gemindex', go]);
  ok(ro.rc === 1 && /gemindex\/pages\/notes\/cc33\.txt: absolute user path/.test(ro.out), '7 same text outside the collected places refused\n' + ro.out);
}
// 9 WW2 SOURCES (owner 2026-11-10: "Ship the database", then "ship one with and one without the database actually"). Made-up folder:
//   a two-row list, one word list, a stand-in database (the SQLite header and filler bytes; the gate reads only the header and the hash)
//   and the manifest ww2bundle writes. Default build: list + word lists + manifest, no index.sqlite. --with-ww2db: the -ww2 zip with it.
{
  const P = 'ARSENAL-9.9.9/', db = Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(4096, 7)]);
  const shaB = b => crypto.createHash('sha256').update(b).digest('hex');
  const ww = (name, { csv, withDb = true, sum } = {}) => {
    const d = path.join(W, name);
    mk(path.join(d, 'ww2-source-index.csv'), csv || 'Name,URL,Nation,Access,Class,Components,LinkStatus,Note\r\nMade-up archive,https://example.org/a,Nowhere,Free,Primary,W1,ok,\r\nMade-up study,https://example.org/b,Nowhere,Free,Secondary,A1,ok,mail the editor at desk@made-up-press.net\r\n');
    mk(path.join(d, 'search-terms.json'), '{"groups":[]}');
    if (withDb) mk(path.join(d, 'index.sqlite'), db);
    mk(path.join(d, 'ww2sources.json'), JSON.stringify({ docs: 1, pages: 1, files: [], sqliteSha256: sum || shaB(db), checked: true }));
    return d;
  };
  const good = ww('fx-ww2');
  const names = z => readZip(z).map(e => e.name).filter(n => n.startsWith(P + 'ww2sources/')).map(n => n.slice(P.length));
  const r9 = run(setup('ww2-default'), ['--ww2sources', good]);
  ok(r9.rc === 0 && JSON.stringify(names(r9.zip)) === JSON.stringify(['ww2sources/search-terms.json', 'ww2sources/ww2-source-index.csv', 'ww2sources/ww2sources.json']) &&
    /ww2sources: index\.sqlite left out/.test(r9.out), '9 default build: list and word lists, no database\n' + r9.out);
  // is not public (owner 2026-11-13, "No tech doc history"): nothing under it ships, and the gate refuses an entry there
  ok(r9.rc === 0 && !readZip(r9.zip).some(e => /^[^/]+\/techdoc\/history(\/|$)/.test(e.name)), '9 no entry under techdoc/history in the zip');
  {
    const Zm = require(ZIP), hf = mk(path.join(W, 'fx-history', 'README.md'), '# Historical sources\n');
    const g9 = Zm.gate([{ name: P + 'techdoc/history/README.md', file: hf }, { name: P + 'techdoc/history/01-origins.md', file: hf }], [], W, ['zzseedname']);
    ok(g9.refused.length === 2 && g9.refused.every(x => /TECHDOC_HISTORY techdoc\/history is not public and never ships/.test(x)), '9 gate refuses entries under techdoc/history: ' + g9.refused.join(' | '));
    ok(Zm.gate([{ name: P + 'techdoc/doctrine/README.md', file: hf }], [], W, ['zzseedname']).refused.length === 0, '9 TECHDOC_HISTORY leaves other techdoc folders alone');
  }
  const d9 = setup('ww2-db'), r9b = run(d9, ['--ww2sources', good, '--with-ww2db']), z9 = path.join(d9, 'out', 'ARSENAL-9.9.9-ww2.zip');
  ok(r9b.rc === 0 && fs.existsSync(z9) && !fs.existsSync(r9b.zip), '9 --with-ww2db writes ARSENAL-<ver>-ww2.zip only\n' + r9b.out);
  if (fs.existsSync(z9)) {
    const e = readZip(z9).find(x => x.name === P + 'ww2sources/index.sqlite');
    ok(e && e.crcOk && e.data.equals(db) && names(z9).length === 4, '9 the -ww2 zip holds index.sqlite, same bytes');
  }
  // the database as pieces (gemindex ww2-split, the git layout): exactly like index.sqlite. Left out of the default build (with the local
  // .gitattributes and joined-copy stamp), shipped in the -ww2 build when there is no whole index.sqlite, never both; a piece must match parts.json
  {
    const pieceOf = d => { const gz = require('zlib').gzipSync(db), pd = path.join(d, 'index.sqlite.parts');
      mk(path.join(pd, 'index.sqlite.001.gz'), gz);
      mk(path.join(pd, 'parts.json'), JSON.stringify({ format: 1, file: 'index.sqlite', bytes: db.length, sha256: shaB(db), pieceBytes: db.length, pieces: [{ name: 'index.sqlite.001.gz', raw: db.length, stored: gz.length, sha256: shaB(gz) }] }));
      mk(path.join(d, '.gitattributes'), '*.gz -text -diff\n'); mk(path.join(d, 'index.sqlite.joined.json'), '{}'); return d; };
    const pOnly = pieceOf(ww('fx-ww2-parts', { withDb: false })), pBoth = pieceOf(ww('fx-ww2-pboth'));
    let y = run(setup('ww2-pdef'), ['--ww2sources', pBoth]);
    ok(y.rc === 0 && JSON.stringify(names(y.zip)) === JSON.stringify(['ww2sources/search-terms.json', 'ww2sources/ww2-source-index.csv', 'ww2sources/ww2sources.json']) && /index\.sqlite\.parts left out/.test(y.out), '9p default build: no pieces, no local stamp or .gitattributes\n' + y.out);
    const dp = setup('ww2-ponly'); y = run(dp, ['--ww2sources', pOnly, '--with-ww2db']);
    const zp = path.join(dp, 'out', 'ARSENAL-9.9.9-ww2.zip');
    ok(y.rc === 0 && fs.existsSync(zp) && JSON.stringify(names(zp)) === JSON.stringify(['ww2sources/index.sqlite.parts/index.sqlite.001.gz', 'ww2sources/index.sqlite.parts/parts.json', 'ww2sources/search-terms.json', 'ww2sources/ww2-source-index.csv', 'ww2sources/ww2sources.json']), '9p -ww2 build from pieces only: the pieces ship\n' + y.out);
    const db2 = setup('ww2-pboth'); y = run(db2, ['--ww2sources', pBoth, '--with-ww2db']);
    ok(y.rc === 0 && names(path.join(db2, 'out', 'ARSENAL-9.9.9-ww2.zip')).filter(n => /index\.sqlite/.test(n)).join() === 'ww2sources/index.sqlite', '9p -ww2 build with both: index.sqlite only, as before\n' + y.out);
    const bad9 = pieceOf(ww('fx-ww2-pbad', { withDb: false })); fs.appendFileSync(path.join(bad9, 'index.sqlite.parts', 'index.sqlite.001.gz'), 'x');
    y = run(setup('ww2-pbad'), ['--ww2sources', bad9, '--with-ww2db']);
    ok(y.rc === 1 && /REFUSED zip .*index\.sqlite\.parts\/index\.sqlite\.001\.gz: sha256 differs from parts\.json/.test(y.out), '9p a piece that is not the one parts.json names: refused\n' + y.out);
    const Zm = require(ZIP), pe = [{ name: P + 'ww2sources/index.sqlite.parts/index.sqlite.001.gz', file: path.join(pOnly, 'index.sqlite.parts', 'index.sqlite.001.gz') }, { name: P + 'ww2sources/index.sqlite.parts/parts.json', file: path.join(pOnly, 'index.sqlite.parts', 'parts.json') }];
    ok(Zm.gate(pe, [], W, ['zzseedname']).refused.length === 2 && Zm.gate(pe, [], W, ['zzseedname']).refused.every(r => /only in the -ww2 build/.test(r)), '9p gate: pieces refused outside the -ww2 build, whatever adds them');
  }
  let x = run(setup('ww2-nodb'),['--ww2sources', ww('fx-ww2-nodb', { withDb: false }), '--with-ww2db']);
  ok(x.rc === 2 && /error: --with-ww2db: no index\.sqlite in .*ww2bundle/.test(x.out), '9 --with-ww2db without the database: exit 2\n' + x.out);
  x = run(setup('ww2-sum'), ['--ww2sources', ww('fx-ww2-sum', { sum: 'a'.repeat(64) }), '--with-ww2db']);
  ok(x.rc === 1 && /REFUSED zip .*ww2sources\/index\.sqlite: sha256 differs/.test(x.out), '9 database not the checked copy refused\n' + x.out);
  const nm = ww('fx-ww2-magic'); fs.writeFileSync(path.join(nm, 'index.sqlite'), 'not a database'); fs.writeFileSync(path.join(nm, 'ww2sources.json'), JSON.stringify({ sqliteSha256: shaB(Buffer.from('not a database')) }));
  x = run(setup('ww2-magic'), ['--ww2sources', nm, '--with-ww2db']);
  ok(x.rc === 1 && /ww2sources\/index\.sqlite: not an SQLite database/.test(x.out), '9 not a database refused\n' + x.out);
  x = run(setup('ww2-absent'), ['--ww2sources', path.join(W, 'nope9')]);
  ok(x.rc === 2 && /error: ww2sources: no folder at .*nope9.*ww2bundle .*--no-ww2sources/.test(x.out), '9 folder absent: exit 2 naming the build and --no-ww2sources\n' + x.out);
  ok(run(setup('ww2-both'), ['--no-ww2sources', '--with-ww2db']).rc === 2, '9 --with-ww2db with --no-ww2sources: exit 2');
  x = run(setup('ww2-check'), ['--ww2sources', good, '--with-ww2db', '--check']);
  ok(x.rc === 0 && /Checked: ARSENAL-9\.9\.9-ww2\.zip, with the WW2 document database/.test(x.out), '9 --check names the -ww2 build\n' + x.out);
  x = run(setup('ww2-check2'), ['--ww2sources', good, '--check']);
  ok(x.rc === 0 && /Checked: ARSENAL-9\.9\.9\.zip, without the WW2 document database/.test(x.out), '9 --check names the default build\n' + x.out);
  // the list is published data: an address in it passes (r9 above); a user path or the user's name does not
  x = run(setup('ww2-path'), ['--ww2sources', ww('fx-ww2-path', { csv: 'Name,URL\r\nx,https://example.org/x\r\nsaved at C:\\Users\\bob\\Downloads\\x.pdf,\r\n' })]);
  ok(x.rc === 1 && /REFUSED zip .*ww2sources\/ww2-source-index\.csv: absolute user path/.test(x.out), '9 list with a user path refused\n' + x.out);
  x = run(setup('ww2-id'), ['--ww2sources', ww('fx-ww2-id', { csv: 'Name,URL\r\nby zzseedname,https://example.org/x\r\n' })]);
  ok(x.rc === 1 && /ww2sources\/ww2-source-index\.csv: names the local\/git user/.test(x.out), '9 list naming the user refused\n' + x.out);
  // a database under any other name or place is refused as before
  const od = ww('fx-ww2-other'); fs.copyFileSync(path.join(od, 'index.sqlite'), path.join(od, 'copy.sqlite'));
  x = run(setup('ww2-other'), ['--ww2sources', od, '--with-ww2db']);
  ok(x.rc === 1 && /ww2sources\/copy\.sqlite: not an exe, dll or text file/.test(x.out), '9 another sqlite refused\n' + x.out);
  // the small package, both builds
  const sa = path.join(W, 'small-assets'), so = path.join(W, 'small-out9');
  const sm = extra => { const r = spawnSync(process.execPath, [ZIP, '--small', '--ver', '9.9.9', '--assets-root', sa, '--out-dir', so, '--no-workshop_gui', '--no-pdf', '--no-whole', '--no-gemindex', '--ww2sources', good, ...extra], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } }); return { rc: r.status, out: r.stdout + r.stderr }; };
  x = sm([]);
  ok(x.rc === 0 && fs.existsSync(path.join(so, 'ARSENAL-9.9.9-small.zip')) && !names(path.join(so, 'ARSENAL-9.9.9-small.zip')).includes('ww2sources/index.sqlite'), '9 small default: no database\n' + x.out);
  x = sm(['--with-ww2db']);
  ok(x.rc === 0 && fs.existsSync(path.join(so, 'ARSENAL-9.9.9-small-ww2.zip')) && names(path.join(so, 'ARSENAL-9.9.9-small-ww2.zip')).includes('ww2sources/index.sqlite'), '9 small -ww2: the database\n' + x.out);
}
// 11 WHOLE documents (tools/docgen/whole.js): the newest guide whole HTML at guide/dist/ beside the PDF and the atlas + README at
// from --whole-root (fixtures). Gate: exact name and place, size limit, contract prefix, arsenal-whole meta, no network
//   load, full text scan; an HTML anywhere else is refused. --no-whole leaves them out, --no-pdf keeps meaning only the PDF; absent = one line.
{
  const P = 'ARSENAL-9.9.9/', fx = path.join(W, 'fx-whole');
  const html = (id, ver, body, pub = id === 'guide') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="arsenal-whole" content="${id} ${ver}">${pub ? '<meta name="arsenal-edition" content="public">' : ''}<title>${id}</title><style>p::before{content:""}</style></head><body>${body}<p><a href="https://example.org/forum">forum</a></p></body></html>\n`;
  const root = (name, files) => { const d = path.join(fx, name); for (const [k, v] of Object.entries(files)) mk(path.join(d, k), v); return d; };
  const good = { 'guide/dist/AS2-Modding-Guide-v1.2.html': html('guide', '1.2', 'old'), 'guide/dist/AS2-Modding-Guide-v1.12.html': html('guide', '1.12', 'older'), 'guide/dist/AS2-Modding-Guide-v2.0.html': html('guide', '2.0', '<h1>Guide</h1>'),
    'techdoc/doctrine/atlas.html': html('atlas', '1.0', '<svg><text>Doctrine</text></svg>'), 'techdoc/doctrine/README.md': '# Doctrine atlas\n',
    'techdoc/dist/AS64-Engine-Technical-Document-v1.0.html': html('engine', '1.0', 'engine') };
  const r1 = run(setup('whole'), ['--whole-root', root('good', good)]);
  const n1 = r1.rc === 0 ? readZip(r1.zip).map(e => e.name) : [];
  ok(r1.rc === 0 && n1.includes(P + 'guide/dist/AS2-Modding-Guide-v2.0.html') && n1.includes(P + 'techdoc/doctrine/atlas.html') && n1.includes(P + 'techdoc/doctrine/README.md'), '11 guide whole + atlas + README shipped\n' + r1.out);
  ok(!n1.some(n => /v1\.12?\.html$|AS64-Engine/.test(n)), '11 only the newest guide HTML (2.0 after 1.12 after 1.2), never the engine document: ' + n1.filter(n => /\.html$/.test(n)).join(' '));
  ok(/guide whole: AS2-Modding-Guide-v2\.0\.html, \d+ B/.test(r1.out) && /atlas: atlas\.html, \d+ B \+ README\.md/.test(r1.out), '11 summary lines\n' + r1.out);
  ok(r1.rc === 0 && readZip(r1.zip).find(e => e.name === P + 'techdoc/doctrine/atlas.html').data.equals(fs.readFileSync(path.join(fx, 'good', 'techdoc/doctrine/atlas.html'))), '11 atlas bytes unchanged');
  // --no-whole leaves both out; --no-pdf alone keeps them; --no-whole with --whole-root is a bad call
  const r2 = run(setup('whole-no'), ['--no-whole']);
  ok(r2.rc === 0 && /whole documents: left out \(--no-whole\)/.test(r2.out) && !readZip(r2.zip).some(e => /\.html$|doctrine/.test(e.name)), '11 --no-whole\n' + r2.out);
  const r3 = run(setup('whole-nopdf'), ['--no-pdf', '--whole-root', root('good', {})]);
  ok(r3.rc === 0 && readZip(r3.zip).some(e => e.name === P + 'techdoc/doctrine/atlas.html') && !readZip(r3.zip).some(e => /\.pdf$/.test(e.name)), '11 --no-pdf keeps the whole HTML\n' + r3.out);
  ok(run(setup('whole-bad'), ['--no-whole', '--whole-root', fx]).rc === 2, '11 --no-whole with --whole-root rc 2');
  // absent: built without, one line each
  const r4 = run(setup('whole-absent'), ['--whole-root', root('empty', { 'x.txt': '' })]);
  ok(r4.rc === 0 && /guide whole: none in guide\/dist: zip built without it \(build: node tools\/docgen\/docgen\.js --out <dir> --books, then --books-root <dir>\/public\)/.test(r4.out) && /atlas: no techdoc\/doctrine\/atlas\.html: zip built without it/.test(r4.out), '11 absent: one line each\n' + r4.out);
  // --check and --small take them the same way (gate only / same entries)
  const r5 = run(setup('whole-check'), ['--check', '--whole-root', root('good', {})]);
  ok(r5.rc === 0 && /gate clean/.test(r5.out) && /guide whole: AS2-Modding-Guide-v2\.0\.html/.test(r5.out), '11 --check\n' + r5.out);
  {
    const sa = path.join(W, 'small-assets'), so = path.join(W, 'small-out11');
    mk(path.join(sa, 'a', 'a.js'), '// Author: Imperator_Aug (as64 toolkit, ia-00000000)\nmodule.exports=1'); mk(path.join(sa, 'INDEX.md'), '# index\n');
    const r = spawnSync(process.execPath, [ZIP, '--small', '--ver', '9.9.9', '--assets-root', sa, '--out-dir', so, '--no-workshop_gui', '--no-pdf', '--no-gemindex', '--no-ww2sources', '--whole-root', path.join(fx, 'good')], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } });
    const z = path.join(so, 'ARSENAL-9.9.9-small.zip');
    ok(r.status === 0 && readZip(z).some(e => e.name === P + 'guide/dist/AS2-Modding-Guide-v2.0.html') && readZip(z).some(e => e.name === P + 'techdoc/doctrine/atlas.html'), '11 --small ships them too\n' + r.stdout + r.stderr);
  }
  // refused: wrong prefix, no meta, meta of another version, network load, too large, a user path or the user's name or an email inside
  const bad = (name, files, re, msg) => { const x = run(setup('whole-' + name), ['--whole-root', root(name, files)]); ok(x.rc === 1 && !fs.existsSync(x.zip) && re.test(x.out), '11 ' + msg + '\n' + x.out); };
  bad('prefix', { 'techdoc/doctrine/atlas.html': '<!DOCTYPE html>\n<html><head><meta name="arsenal-whole" content="atlas 1"></head></html>' }, /REFUSED zip .*techdoc\/doctrine\/atlas\.html: whole document does not start with <!doctype html><html lang="en">/, 'wrong prefix refused');
  bad('nometa', { 'techdoc/doctrine/atlas.html': '<!doctype html><html lang="en"><head><title>x</title></head><body>x</body></html>' }, /atlas\.html: whole document no <meta name="arsenal-whole"/, 'no meta refused');
  bad('metaver', { 'guide/dist/AS2-Modding-Guide-v2.0.html': html('guide', '1.12', 'x') }, /AS2-Modding-Guide-v2\.0\.html: whole document its arsenal-whole meta says version 1\.12, the file name 2\.0/, 'meta version refused');
  bad('net', { 'techdoc/doctrine/atlas.html': html('atlas', '1', '<img src="https://cdn.example.org/a.png">') }, /atlas\.html: whole document loads from the network: <img src="https:\/\/cdn\.example\.org/, 'network load refused');
  bad('font', { 'techdoc/doctrine/atlas.html': html('atlas', '1', '<style>@font-face{src:url(https://fonts.example.org/f.woff2)}</style>') }, /atlas\.html: whole document loads from the network: url\(https:/, 'external font refused');
  bad('path', { 'techdoc/doctrine/atlas.html': html('atlas', '1', '<!-- built in C:\\Users\\bob\\work -->') }, /REFUSED zip .*techdoc\/doctrine\/atlas\.html: absolute user path/, 'user path in a whole HTML refused');
  bad('id', { 'guide/dist/AS2-Modding-Guide-v2.0.html': html('guide', '2.0', '<p>by zzseedname</p>') }, /AS2-Modding-Guide-v2\.0\.html: names the local\/git user/, 'user name in a whole HTML refused');
  bad('mail', { 'techdoc/doctrine/atlas.html': html('atlas', '1', '<p>someone@realmail.net</p>') }, /atlas\.html: email "someone@realmail\.net"/, 'email in a whole HTML refused');
  bad('readme', { 'techdoc/doctrine/atlas.html': html('atlas', '1', 'x'), 'techdoc/doctrine/README.md': 'made in /home/alice/atlas\n' }, /techdoc\/doctrine\/README\.md: absolute user path/, 'atlas README scanned');
  const huge = Buffer.concat([Buffer.from(html('atlas', '1', '')), Buffer.alloc((32 << 20) + 1, 32)]);
  bad('huge', { 'techdoc/doctrine/atlas.html': huge }, /atlas\.html: whole document larger than the 32 MB sanity limit/, 'over the size limit refused');
  // an HTML anywhere else is refused (the old text rule let any .html through)
  let x = run(setup('whole-else'), ['--add', mk(path.join(fx, 'else', 'atlas.html'), html('atlas', '1', 'x'))]);
  ok(x.rc === 1 && /REFUSED zip ARSENAL-9\.9\.9\/atlas\.html: HTML outside the whole-document rule/.test(x.out), '11 an HTML at another place refused\n' + x.out);
  x = run(setup('whole-else2'), ['--add', mk(path.join(fx, 'else', 'notes.htm'), 'x')]);
  ok(x.rc === 1 && /notes\.htm: HTML outside the whole-document rule/.test(x.out), '11 .htm refused');
  // a guide HTML outside guide/dist (wrong place in the root) is not picked up
  const r6 = run(setup('whole-place'), ['--whole-root', root('place', { 'guide/AS2-Modding-Guide-v3.0.html': html('guide', '3.0', 'x'), 'techdoc/atlas.html': html('atlas', '1', 'x') })]);
  ok(r6.rc === 0 && !readZip(r6.zip).some(e => /\.html$/.test(e.name)) && /guide whole: none/.test(r6.out) && /atlas: no /.test(r6.out), '11 wrong place in the root not picked\n' + r6.out);
  // GUIDE_EDITION (public books): an internal guide HTML (no arsenal-edition meta) in the source tree / --whole-root is left out with its
  // PDF, one line naming the docgen --books command; from --books-root it is refused. A public one from --books-root ships with the PDF
  // beside it; a PDF with no public HTML of its version beside it is left out.
  const PDF = '%PDF-1.4\n1 0 obj << /Title (guide) >> endobj\n%%EOF\n';
  const intl = root('intl', { 'guide/dist/AS2-Modding-Guide-v3.0.html': html('guide', '3.0', '<h1>Internal</h1>', false), 'guide/dist/AS2-Modding-Guide-v3.0.pdf': PDF, 'techdoc/doctrine/atlas.html': html('atlas', '1', 'x') });
  const s1 = spawnSync(process.execPath, [ZIP, '--exes', path.join(setup('books-intl'), 'exes'), '--assets-root', path.join(W, 'books-intl', 'assets'), '--out-dir', path.join(W, 'books-intl', 'out'), '--ver', '9.9.9', '--no-workshop_gui', '--no-gemindex', '--no-ww2sources', '--whole-root', intl], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } });
  const o1 = s1.stdout + s1.stderr, z1 = path.join(W, 'books-intl', 'out', 'ARSENAL-9.9.9.zip');
  ok(s1.status === 0 && !readZip(z1).some(e => /guide\/dist\//.test(e.name)) && readZip(z1).some(e => e.name === P + '') &&
    /guide whole: AS2-Modding-Guide-v3\.0\.html is an internal build .*left out with its PDF\. Build the public books: node tools\/docgen\/docgen\.js --out <dir> --books, then --books-root <dir>\/public/.test(o1) && /guide pdf: AS2-Modding-Guide-v3\.0\.pdf left out with its internal HTML/.test(o1), '11 internal guide HTML + PDF left out without --books-root\n' + o1);
  const r7 = run(setup('books-intl2'), ['--books-root', intl, '--whole-root', intl]);
  ok(r7.rc === 1 && !fs.existsSync(r7.zip) && /REFUSED zip .*AS2-Modding-Guide-v3\.0\.html: GUIDE_EDITION no <meta name="arsenal-edition" content="public">/.test(r7.out), '11 internal guide HTML from --books-root refused\n' + r7.out);
  const pub = root('pub', { 'guide/dist/AS2-Modding-Guide-v3.0.html': html('guide', '3.0', '<h1>Public</h1>'), 'guide/dist/AS2-Modding-Guide-v3.0.pdf': PDF, 'guide/dist/AS2-Modding-Guide-v3.1.pdf': PDF });
  const s8 = spawnSync(process.execPath, [ZIP, '--exes', path.join(setup('books-pub'), 'exes'), '--assets-root', path.join(W, 'books-pub', 'assets'), '--out-dir', path.join(W, 'books-pub', 'out'), '--ver', '9.9.9', '--no-workshop_gui', '--no-gemindex', '--no-ww2sources', '--books-root', pub, '--whole-root', intl], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } });
  const o8 = s8.stdout + s8.stderr, n8 = s8.status === 0 ? readZip(path.join(W, 'books-pub', 'out', 'ARSENAL-9.9.9.zip')).map(e => e.name) : [];
  ok(s8.status === 0 && n8.includes(P + 'guide/dist/AS2-Modding-Guide-v3.0.html') && !n8.some(n => /\.pdf$/.test(n)) && n8.includes(P + 'techdoc/doctrine/atlas.html') && /guide whole: AS2-Modding-Guide-v3\.0\.html, \d+ B \(from --books-root\)/.test(o8) &&
    /guide pdf: AS2-Modding-Guide-v3\.1\.pdf left out: no public HTML of the same version beside it/.test(o8), '11 public guide HTML from --books-root, newest PDF without its HTML left out, atlas from --whole-root\n' + o8);
  fs.rmSync(path.join(pub, 'guide', 'dist', 'AS2-Modding-Guide-v3.1.pdf'));
  const r9 = run(setup('books-pub2'), ['--books-root', pub, '--pdf', path.join(pub, 'guide', 'dist', 'AS2-Modding-Guide-v3.0.pdf')]);
  const s9 = spawnSync(process.execPath, [ZIP, '--exes', path.join(setup('books-pub3'), 'exes'), '--assets-root', path.join(W, 'books-pub3', 'assets'), '--out-dir', path.join(W, 'books-pub3', 'out'), '--ver', '9.9.9', '--no-workshop_gui', '--no-gemindex', '--no-ww2sources', '--books-root', pub], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } });
  const n9 = s9.status === 0 ? readZip(path.join(W, 'books-pub3', 'out', 'ARSENAL-9.9.9.zip')).map(e => e.name) : [];
  ok(r9.rc === 0 && s9.status === 0 && n9.includes(P + 'guide/dist/AS2-Modding-Guide-v3.0.pdf') && n9.includes(P + 'guide/dist/AS2-Modding-Guide-v3.0.html'), '11 public HTML + PDF of one version from --books-root ship (and --pdf beside it)\n' + r9.out + s9.stdout + s9.stderr);
  const rn = run(setup('books-none'), ['--books-root', path.join(fx, 'empty'), '--whole-root', path.join(fx, 'empty')]);
  ok(rn.rc === 2 && /--books-root .*no guide\/dist in it/.test(rn.out), '11 --books-root without guide/dist rc 2\n' + rn.out);
}
// 13 GUIDE PAGES, public edition (--guide-dir fixture): a page ships as pub.strip(source).text (internal block and trace comment out,
//   a comment inside a code fence kept); a bad marker stops the build with file:line; a leak word is refused with file:line kind match
//   (GUIDE_STRICT); a page entry that still holds a marker or a whole-line comment is refused (GUIDE_PUBLIC, the gate on the entry itself).
{
  const P = 'ARSENAL-9.9.9/', PUB = require(path.join(__dirname, '..', '..', 'docgen', 'pub.js')), Zm = require(ZIP);
  const gdir = (name, pages) => { const d = path.join(W, 'fx-guide-' + name); for (const [k, v] of Object.entries(pages)) mk(path.join(d, k), v); return d; };
  const page = '# First mod\r\n\r\n<!-- goh: GHDMG-03 -->\r\nOpen the folder.\r\n<!-- internal -->\r\nSecret maintainer note.\r\n<!-- /internal -->\r\n```\r\n<!-- kept in a fence -->\r\n```\r\nDone.\r\n';
  const g1 = gdir('ok', { 'README.md': '# Guide\r\nAuthor: Imperator_Aug\r\n', 'p01-first-mod.md': page, 'PLAN.md': 'not shipped <!-- internal -->\n' });
  const r1 = run(setup('gpub'), ['--guide-dir', g1]);
  const e1 = r1.rc === 0 ? readZip(r1.zip) : [], p1 = e1.find(e => e.name === P + 'guide/p01-first-mod.md');
  ok(r1.rc === 0 && p1 && p1.data.toString('utf8') === PUB.strip(page).text && !/Secret|GHDMG|<!-- internal/.test(p1.data.toString()) && /<!-- kept in a fence -->/.test(p1.data.toString()) && /\r\n/.test(p1.data.toString()),
    '13 page ships stripped (CRLF kept, fenced comment kept)\n' + r1.out + (p1 ? p1.data.toString() : ''));
  ok(!e1.some(e => /PLAN\.md/.test(e.name)), '13 PLAN.md not shipped');
  const r2 = run(setup('gbad'), ['--guide-dir', gdir('bad', { 'README.md': '# Guide\nAuthor: Imperator_Aug\n', 'p02-x.md': 'a\n<!-- internal -->\nb\n' })]);
  ok(r2.rc === 1 && !fs.existsSync(r2.zip) && /guide\/p02-x\.md:2: internal block never closed/.test(r2.out), '13 bad marker stops the build with file:line\n' + r2.out);
  const r3 = run(setup('gleak'), ['--guide-dir', gdir('leak', { 'README.md': '# Guide\nAuthor: Imperator_Aug\n', 'p03-y.md': '# Y\n<!-- trace -->\n<!-- internal -->\nfine here: decompile\n<!-- /internal -->\nWe had to decompile the exe.\n' })]);
  ok(r3.rc === 1 && !fs.existsSync(r3.zip) && /REFUSED zip .*guide\/p03-y\.md: GUIDE_STRICT guide\/p03-y\.md:6 debug-tool "decompile"/.test(r3.out) && !/p03-y\.md:4 /.test(r3.out), '13 leak word refused at its source line (not inside the dropped block)\n' + r3.out);
  const raw = Zm.guidePublic(P + 'guide/p01-first-mod.md', page, null);
  ok(raw.some(x => /GUIDE_PUBLIC line 3 still holds an internal marker or a whole-line HTML comment/.test(x)) && Zm.guidePublic(P + 'guide/p01-first-mod.md', PUB.strip(page).text, null).length === 0, '13 GUIDE_PUBLIC refuses an unstripped page entry, passes the stripped one: ' + raw.join(' | '));
  const g = Zm.gate([{ name: P + 'guide/p04-z.md', file: mk(path.join(W, 'fx-guide-raw', 'p04-z.md'), '# Z\n<!-- internal -->\nx\n<!-- /internal -->\n') }], [], W, ['zzseedname']);
  ok(g.refused.some(x => /GUIDE_PUBLIC/.test(x)), '13 gate() refuses a raw page entry: ' + g.refused.join(' | '));
  ok(Zm.isPublic(Buffer.from('<head><meta name="arsenal-edition" content="public"></head>')) && !Zm.isPublic(Buffer.from('<head></head><body><meta name="arsenal-edition" content="public"></body>')), '13 isPublic reads the head only');
}
// 14 ENGINE PACKAGE --public: the public set (fixture --public-src) at<name>, its CHANGELOG, the
//   public README, CREDITS/LICENSE/NOTICE, the public whole HTML + PDF from --books-root at (none at the top level); the README
//   names the real book files and the copy step into the ARSENAL folder; no the game; strip errors, leak words, a
//   page outside the layout and an internal HTML from --books-root stop the build and nothing is written. Without --public: the internal
//   package as before (its books stay at its top level, block 12).
{
  const EZ = path.join(__dirname, '..', 'enginezip.js'), fx = path.join(W, 'fx-epub'), T = 'ARSENAL-engine-docs-public-9.9.9/', N = 'AS64-Engine-Technical-Document-v';
  const html = (ver, pub = true) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="arsenal-whole" content="engine ${ver}">${pub ? '<meta name="arsenal-edition" content="public">' : ''}</head><body>engine</body></html>\n`;
  const set = (name, files) => { const d = path.join(fx, name); for (const [k, v] of Object.entries(files)) mk(path.join(d, k), v); return d; };
  const good = { 'README.md': '# The engine\r\n\r\n<!-- trace line -->\r\nSee [01](01-a.md).\r\n', '01-a.md': '# A\r\n<!-- internal -->\r\nmaintainer note\r\n<!-- /internal -->\r\nThe loop.\r\n', 'CHANGELOG.md': '# Revision history\r\n\r\n| Version | Date | Changes |\r\n|---|---|---|\r\n| 9.9 | 2026-01-01 | x |\r\n' };
  const books = set('books', { ['techdoc/dist/' + N + '9.9.html']: html('9.9'), ['techdoc/dist/' + N + '9.9.pdf']: '%PDF-1.4\n' });
  const ez = (extra) => { const o = path.join(W, 'epub-out'); fs.rmSync(o, { recursive: true, force: true }); const x = spawnSync(process.execPath, [EZ, '--ver', '9.9.9', '--out-dir', o, ...extra], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } }); return { rc: x.status, out: x.stdout + x.stderr, zip: path.join(o, 'ARSENAL-engine-docs-public-9.9.9.zip'), dir: o }; };
  const r1 = ez(['--public', '--public-src', set('good', good), '--books-root', books]);
  const es = r1.rc === 0 ? readZip(r1.zip) : [], names = es.map(e => e.name).sort();
  // fixed layout (the Docs page reads and under its root): the books under, one copy, none at the top
  ok(r1.rc === 0 && JSON.stringify(names) === JSON.stringify([T + 'CREDITS.md', T + 'LICENSE', T + 'NOTICE', T + 'README.md', T + 'techdoc/CHANGELOG.md', T + 'techdoc/dist/' + N + '9.9.html', T + 'techdoc/dist/' + N + '9.9.pdf', T + 'techdoc/engine/01-a.md', T + 'techdoc/engine/README.md'].sort()),
    '14 public set, nothing else: ' + names.join(' ') + '\n' + r1.out);
  ok(r1.rc === 0 && !names.some(n => n.startsWith(T + N)) && names.filter(n => n.endsWith('/' + N + '9.9.html') || n.endsWith('/' + N + '9.9.pdf')).length === 2, '14 books only under techdoc/dist/, none at the top level: ' + names.join(' '));
  if (r1.rc === 0) {
    const a = es.find(e => e.name === T + 'techdoc/engine/01-a.md').data.toString(), rd = es.find(e => e.name === T + 'README.md').data.toString();
    ok(!/maintainer note|<!--/.test(a) && /The loop\./.test(a) && !/trace line/.test(es.find(e => e.name === T + 'techdoc/engine/README.md').data.toString()), '14 pages ship stripped');
    ok(rd.includes('`techdoc/dist/' + N + '9.9.html`') && rd.includes('`techdoc/dist/' + N + '9.9.pdf`') && rd.includes('`techdoc/engine/README.md`') && rd.includes('`techdoc/CHANGELOG.md`') && !/\b(source|code|line|lines|codemap|limits|modweb)\b/i.test(rd), '14 public README names the real book files at techdoc/dist, says nothing of code or lines:\n' + rd);
    ok(/Copy its `techdoc` folder into the folder where ARSENAL is/.test(rd) && /Docs page \(tab Help and docs\)/.test(rd) && /`ARSENAL-<version>\.zip`/.test(rd), '14 public README gives the copy step, the Docs page and the toolkit download:\n' + rd);
  }
  // no books: the README offers the Markdown pages only and names no book file
  let x = ez(['--public', '--public-src', set('good', good), '--whole-root', set('nobooks2', { 'x.txt': '' })]);
  { const rn = x.rc === 0 ? readZip(x.zip).find(e => e.name === T + 'README.md') : null, t = rn ? rn.data.toString() : '';
    ok(x.rc === 0 && rn && !/AS64-Engine|techdoc\/dist/.test(t) && /`techdoc\/engine\/README\.md`/.test(t) && /as chapters\./.test(t), '14 README without books names none\n' + x.out + t); }
  // PUBLIC_LAYOUT: a page whose name is outside the layout is refused, nothing written
  x = ez(['--public', '--public-src', set('odd', { ...good, 'notes.md': '# Notes\r\nx\r\n' }), '--books-root', books]);
  ok(x.rc === 1 && !fs.existsSync(x.zip) && /REFUSED zip .*techdoc\/engine\/notes\.md: PUBLIC_LAYOUT outside the fixed layout/.test(x.out), '14 a page outside the layout refused\n' + x.out);
  x = ez(['--public', '--public-src', set('leak', { ...good, '02-b.md': '# B\r\nWe read it in the decompiler.\r\n' }), '--books-root', books]);
  ok(x.rc === 1 && !fs.existsSync(x.zip) && /REFUSED HIT .*02-b\.md:2 debug-tool "decompiler"/.test(x.out), '14 leak word refused, nothing written\n' + x.out);
  x = ez(['--public', '--public-src', set('mark', { ...good, '03-c.md': '# C\r\n<!-- internal -->\r\nx\r\n' }), '--books-root', books]);
  ok(x.rc === 1 && !fs.existsSync(x.zip) && /REFUSED bad internal marker .*03-c\.md:2: internal block never closed/.test(x.out), '14 bad marker stops the build\n' + x.out);
  x = ez(['--public', '--public-src', set('good', {}), '--books-root', set('ibooks', { ['techdoc/dist/' + N + '9.9.html']: html('9.9', false), ['techdoc/dist/' + N + '9.9.pdf']: '%PDF-1.4\n' })]);
  ok(x.rc === 1 && !fs.existsSync(x.zip) && /ENGINE_EDITION no <meta name="arsenal-edition" content="public">/.test(x.out), '14 internal HTML from --books-root refused\n' + x.out);
  x = ez(['--public', '--public-src', set('good', {}), '--whole-root', set('ibooks', {}), '--check']);
  ok(x.rc === 0 && /is an internal build: left out/.test(x.out) && /engine pdf: .* left out: no public HTML/.test(x.out), '14 internal HTML/PDF from --whole-root left out with a line\n' + x.out);
  // the real public set and allow file pass (no books)
  x = ez(['--public', '--whole-root', set('nobooks', { 'x.txt': '' }), '--check']);
  ok(x.rc === 0 && /0 refused/.test(x.out), '14 real techdoc/engine-public passes the public gate\n' + x.out);
  // without --public: the internal package (the game and in it, no public name); --books-root alone is a bad call
  x = spawnSync(process.execPath, [EZ, '--ver', '9.9.9', '--out-dir', path.join(W, 'epub-int'), '--whole-root', set('nobooks', {})], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } });
  const zi = path.join(W, 'epub-int', 'ARSENAL-engine-docs-9.9.9.zip'), ni = x.status === 0 ? readZip(zi).map(e => e.name) : [];
  ok(x.status === 0 && ni.some(n => n.startsWith('ARSENAL-engine-docs-9.9.9/codemap/')) && ni.some(n => n.startsWith('ARSENAL-engine-docs-9.9.9/techdoc/engine/')) && ni.includes('ARSENAL-engine-docs-9.9.9/VERSION.txt') && !fs.existsSync(path.join(W, 'epub-int', 'ARSENAL-engine-docs-public-9.9.9.zip')), '14 without --public: the internal package\n' + x.stdout + x.stderr);
  ok(spawnSync(process.execPath, [EZ, '--books-root', books, '--check'], { encoding: 'utf8' }).status === 2, '14 --books-root without --public rc 2');
}
// 12 ENGINE PACKAGE (enginezip.js): the newest engine whole HTML and PDF (by version number, each on its own) at the package top level,
//   the HTML named in README.md and scanned as text; a broken or leaking HTML stops the build; absent = one line. Real tree, fixture
{
  const EZ = path.join(__dirname, '..', 'enginezip.js'), fx = path.join(W, 'fx-engine'), T = 'ARSENAL-engine-docs-9.9.9/';
  const html = (ver, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="arsenal-whole" content="engine ${ver}"></head><body>${body}</body></html>\n`;
  const root = (name, files) => { const d = path.join(fx, name); for (const [k, v] of Object.entries(files)) mk(path.join(d, 'techdoc', 'dist', k), v); return d; };
  const ez = (r, extra = []) => { const o = path.join(W, 'engine-out'), x = spawnSync(process.execPath, [EZ, '--ver', '9.9.9', '--out-dir', o, '--whole-root', r, ...extra], { encoding: 'utf8', env: { ...process.env, ZIP_EXTRA_ID: 'zzseedname' } }); return { rc: x.status, out: x.stdout + x.stderr, zip: path.join(o, 'ARSENAL-engine-docs-9.9.9.zip') }; };
  const N = 'AS64-Engine-Technical-Document-v';
  const r1 = ez(root('good', { [N + '1.2.html']: html('1.2', 'old'), [N + '1.12.html']: html('1.12', '<h1>Engine</h1>'), [N + '1.2.pdf']: '%PDF-1.4 a\n', [N + '1.12.pdf']: '%PDF-1.4 b\n' }));
  ok(r1.rc === 0 && new RegExp('pdf ' + N + '1\\.12\\.pdf, html ' + N + '1\\.12\\.html,').test(r1.out), '12 engine package: newest html and pdf by number\n' + r1.out);
  if (r1.rc === 0) {
    const es = readZip(r1.zip), rd = es.find(e => e.name === T + 'README.md');
    ok(es.some(e => e.name === T + N + '1.12.html') && es.some(e => e.name === T + N + '1.12.pdf') && !es.some(e => e.name.endsWith('1.2.html')), '12 html beside the pdf at the top');
    ok(rd && rd.data.toString().includes('## ' + N + '1.12.html'), '12 README names the html');
  }
  const r2 = ez(root('none', { 'x.txt': '' }), ['--check']);
  ok(r2.rc === 0 && /engine whole html: none in techdoc\/dist: package built without it \(build: node guide\/build-pdf\.js --book engine --html-only\)/.test(r2.out), '12 absent: one line\n' + r2.out);
  const r3 = ez(root('leak', { [N + '2.0.html']: html('2.0', '<!-- C:\\Users\\bob\\x -->') }), ['--check']);
  ok(r3.rc === 1 && new RegExp(N + '2\\.0\\.html: absolute user path').test(r3.out), '12 user path in the engine html refused\n' + r3.out);
  const r4 = ez(root('prefix', { [N + '2.0.html']: '<html><body>x</body></html>' }), ['--check']);
  ok(r4.rc === 1 && /whole document does not start with/.test(r4.out), '12 wrong prefix refused\n' + r4.out);
}
// 10 LARGE ENTRIES: writeZip streams an entry over the threshold (here 1 MB, chunks of 1 MB; the release uses 64 MB and 16 MB) and the
//   result inflates to the same bytes with the right crc, twice the same; a small entry's bytes are what the one-call path wrote.
{
  const Z = require(ZIP), big = path.join(W, 'big', 'big.bin'), small = mk(path.join(W, 'big', 'small.txt'), 'small entry\n'.repeat(50));
  const b = Buffer.alloc(5 * 1048576 + 12345); let v = 1;
  for (let i = 0; i < b.length; i++) { v = (v * 1103515245 + 12345) >>> 0; b[i] = i % 3 ? (v >>> 24) : 65 + (i % 26); }
  mk(big, b);
  const es = [{ name: 'T/big.bin', file: big }, { name: 'T/small.txt', file: small }];
  const z1 = path.join(W, 'big', 'a.zip'), z2 = path.join(W, 'big', 'b.zip'), z3 = path.join(W, 'big', 'c.zip');
  const w1 = Z.writeZip(z1, es, '2026-01-01', { streamOver: 1 << 20, chunk: 1 << 20 }); Z.writeZip(z2, es, '2026-01-01', { streamOver: 1 << 20, chunk: 1 << 20 });
  Z.writeZip(z3, es, '2026-01-01');
  const r1 = readZip(z1);
  ok(w1.streamed === 1 && r1.every(e => e.crcOk) && r1[0].data.equals(b) && r1[1].data.toString() === 'small entry\n'.repeat(50), '10 streamed entry reads back');
  ok(sha(z1) === sha(z2), '10 streamed zip deterministic');
  ok(Z.shaFile(z1) === sha(z1), '10 shaFile');
  const smallBytes = f => { const z = fs.readFileSync(f), i = z.indexOf(Buffer.from('T/small.txt')); return z.slice(i - 30, i + 11 + z.readUInt32LE(i - 30 + 18)).toString('hex'); };
  ok(smallBytes(z1) === smallBytes(z3), '10 a small entry is written as before');
}
fs.rmSync(W, { recursive: true, force: true });
console.log(fails ?`zip-test: ${fails} failed` : 'zip-test: PASS');
process.exit(fails ? 1 : 0);

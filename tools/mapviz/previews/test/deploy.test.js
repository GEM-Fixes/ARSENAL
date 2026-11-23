// previews deploy test (late F11): the size rules of the Map Viewer's size choice and `mapviz previews write --all` (deploy
// all) on the fixture map, in both forms and on the three targets (AS64, MoW:AS2, Gates of Hell), plus a Gates of Hell
// single player copy of the fixture for the PNG header_interface. Known answers: every file the game reads for the map is
// written once, at its own size and form (the DDS and PNG headers read back), the files a game does not read are left
// out with why, nothing lands outside resource/map/<key>/ and .mapviz-backup/ of the mod, the game folder is untouched,
// one journal entry, undo puts back the earlier bytes and removes the files that were new.
// Seeded defects: bad sizes (0, negative, text, not whole, over 8192), --all with --targets (PRV_SET), a planted path
// escape in a plan given to commit (PRV_PATH, nothing written), one file whose compose throws (reported failed, the rest
// written, exit 1).
// usage: node tools/mapviz/previews/test/deploy.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-69f38709)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-prv-deploy-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz previews deploy: ' + what); } }

const MVJS = path.resolve(__dirname, '../../mapviz.js');
const fx = require('../../test/fxmake');
const CK = require('../check');
const Z = require('../sizes');

function cli(args) {
  const r = spawnSync(process.execPath, [MVJS, 'previews'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 600000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim() };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const errCode = r => { const j = json(r.out); return j && j.error ? (j.error.detail && j.error.detail.code) || j.error.code : null; };
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
function snap(dir, keepBackup) {   // every file under dir, rel path -> sha1
  const out = {};
  (function walk(d, rel) {
    for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) {
      if (n === '.mapviz-backup' && !keepBackup) continue;
      const p = path.join(d, n), r = rel ? rel + '/' + n : n;
      if (fs.statSync(p).isDirectory()) walk(p, r); else out[r] = sha1(fs.readFileSync(p));
    }
  })(dir, '');
  return out;
}
// the file headers, read here (not through the previews code): DDS 'DDS ' height@12 width@16 mips@28 fourCC@84; PNG IHDR
function ddsHead(b) { return b.length >= 128 && b.toString('latin1', 0, 4) === 'DDS ' ? { w: b.readUInt32LE(16), h: b.readUInt32LE(12), mips: b.readUInt32LE(28), four: b.toString('latin1', 84, 88) } : null; }
function pngHead(b) { return b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('latin1', 12, 16) === 'IHDR' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; }
const throwsSize = f => { try { f(); return false; } catch (e) { return e && e.code === 'MV_USAGE' && e.detail && e.detail.code === 'PRV_SIZE' && typeof e.message === 'string' && !/undefined/.test(e.message); } };

// ------------------------------------------------------------------ 1 the size rules
{
  for (const v of [0, -3, 'abc', 12.5, '12.5', 9000, '', null, '1e3']) ok(throwsSize(() => Z.checkWH(v, 100)) && throwsSize(() => Z.checkWH(100, v)), 'size ' + JSON.stringify(v) + ' refused MV_USAGE PRV_SIZE in plain words');
  ok(JSON.stringify(Z.checkWH('64', 8192)) === '{"w":64,"h":8192}' && JSON.stringify(Z.checkWH(' 1920 ', '1080')) === '{"w":1920,"h":1080}', 'sizes 64 and 8192 and a number given as text are taken');
  ok(JSON.stringify(Z.parseOut('1920x1080')) === '{"w":1920,"h":1080}' && JSON.stringify(Z.parseOut('400 X 300')) === '{"w":400,"h":300}' && throwsSize(() => Z.parseOut('1920')) && throwsSize(() => Z.parseOut('12.5x100')), 'WxH parsed; a lone number or a part size refused');
  ok(Z.checkFit(undefined) === 'stretch' && Z.checkFit('crop') === 'crop' && throwsSize(() => Z.checkFit('zoom')), 'layout: stretch by default, the three, others refused');
  const B = [-2000, -1000, 2000, 1000];
  ok(Z.longSide(B, 1920, 1080, 'stretch') === 2160 && Z.longSide(B, 1920, 1080, 'crop') === 2160 && Z.longSide(B, 1920, 1080, 'backdrop') === 1920 && Z.longSide(B, 400, 300, 'stretch') === 600,
    'long side of the picture for 1920 x 1080 on a 2:1 map: stretch 2160, crop 2160, bars 1920; 400 x 300 stretch 600 (the height decides)');
  ok(Z.matchLong(B, [[1920, 1080], [400, 300], [960, 256], null]) === 2160 && Z.matchLong(B, []) === 2048 && Z.longSide(B, 8192, 8192, 'stretch') === 8192, 'matchLong: the largest file decides; none 2048; capped at 8192');
  ok(Z.shapeH(B, 1000) === 500 && Z.shapeW(B, 300) === 600 && Z.shapeH(B, 64) === 64, 'keep the map shape: 1000 -> 500, 300 -> 600, at least 64');
  const w = 8, h = 4, data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data.set([j * 60, i * 30, 9, 128], (j * w + i) * 4);
  for (const fit of Z.FITS) for (const [ow, oh] of [[1920, 1080], [100, 300], [64, 64]]) {
    const o = Z.fitTo({ w, h, data, box: B }, ow, oh, fit);
    let opaque = true; for (let p = 3; p < o.length; p += 4) if (o[p] !== 255) { opaque = false; break; }
    ok(o.length === ow * oh * 4 && opaque, 'fitTo ' + fit + ' ' + ow + ' x ' + oh + ': exactly that size, opaque');
  }
  // stretch keeps row order (row 0 = min world y = the first source row, value 0)
  const s = Z.fitTo({ w, h, data, box: B }, 16, 8, 'stretch');
  ok(s[0] < 20 && s[(7 * 16) * 4] > 60, 'fitTo keeps the source row order (row 0 = min world y; half alpha is put over black)', [s[0], s[(7 * 16) * 4]]);
}

// ------------------------------------------------------------------ 2 write --all on the three targets
const WANT = {
  mowas2: { write: ['preview', 'small', 'minimap', 'header'], none: ['header_interface'] },
  as64: { write: ['preview', 'small', 'minimap', 'header'], none: ['header_interface'] },
  goh: { write: ['preview', 'minimap', 'header'], none: ['small', 'header_interface'] },
  gohSP: { write: ['preview', 'minimap', 'header', 'header_interface'], none: ['small'] },
};
function deployCase(tag, target, f, key, want) {
  const mod = f.modDirs[0];
  const base = ['--target', target, '--game', f.gameDir, '--mod-dir', mod, '--map', key, '--mod', mod];
  const mapDir = path.join(mod, 'resource', 'map', ...key.split('/'));
  // an earlier mod file the deploy replaces (undo must bring these bytes back)
  fs.mkdirSync(mapDir, { recursive: true });
  const OLD = Buffer.from('an earlier preview of the owner ' + tag);
  fs.writeFileSync(path.join(mapDir, 'preview.dds'), OLD);
  const beforeMap = snap(mapDir), beforeMod = snap(mod, true), beforeGame = snap(f.gameDir);
  const pr = cli(['plan'].concat(base, ['--all', '--json']));
  const p = json(pr.out);
  ok((pr.code === 0 || pr.code === 1) && p && p.hash, tag + ' plan --all exit 0 or 1, got ' + pr.code + ' ' + pr.err.slice(-300));
  if (!p) return;
  const rows = p.targets.filter(t => t.state === 'write'), none = p.targets.filter(t => t.state === 'none');
  ok(rows.map(t => t.id).sort().join() === want.write.slice().sort().join() && none.map(t => t.id).sort().join() === want.none.slice().sort().join(),
    tag + ' the game file set: write ' + rows.map(t => t.id).join(',') + ' none ' + none.map(t => t.id).join(','));
  const bad = cli(['write'].concat(base, ['--all', '--targets', 'preview', '--yes', '--json']));
  ok(bad.code === 2 && errCode(bad) === 'PRV_SET', tag + ' seeded: --all with --targets exit 2 PRV_SET, got ' + bad.code + ' ' + errCode(bad));
  const wr = cli(['write'].concat(base, ['--all', '--yes', '--json']));
  const wb = json(wr.out);
  ok((wr.code === 0 || wr.code === 1) && wb && wb.all === true && wb.n === 1 && Array.isArray(wb.failed) && !wb.failed.length, tag + ' write --all exit 0 or 1, one journal entry, nothing failed, got ' + wr.code + ' ' + wr.err.slice(-300) + ' ' + (wb ? JSON.stringify(wb.failed) : wr.out.slice(0, 300)));
  if (!wb) return;
  ok(wb.written.slice().sort().join() === rows.map(t => t.path).sort().join(), tag + ' written = exactly the files the game reads: ' + wb.written.join(','));
  ok(wb.skipped.map(x => x.id).sort().join() === want.none.slice().sort().join() && wb.skipped.every(x => typeof x.code === 'string' && /^PRV_/.test(x.code) && typeof x.why === 'string' && x.why),
    tag + ' skipped with why: ' + JSON.stringify(wb.skipped.map(x => x.id + ':' + x.code)));
  ok(!/[a-z]:[\\/]/i.test(wr.out), tag + ' write body holds no drive path');
  for (const t of rows) {
    const file = path.join(mod, ...t.path.split('/')), buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!buf) { ok(false, tag + ' ' + t.id + ' written'); continue; }
    if (t.format === 'PNG') {
      const hd = pngHead(buf);
      ok(hd && hd.w === t.size[0] && hd.h === t.size[1], tag + ' ' + t.id + ' PNG header ' + JSON.stringify(hd) + ' = ' + t.size);
    } else {
      const hd = ddsHead(buf);
      ok(hd && hd.w === t.size[0] && hd.h === t.size[1] && hd.four === String(t.format) && hd.mips === t.mips, tag + ' ' + t.id + ' DDS header ' + JSON.stringify(hd) + ' = ' + t.size + ' ' + t.format + ' mips ' + t.mips);
    }
    const r = CK.checkOne(buf, t);
    ok(r.ok, tag + ' ' + t.id + ' check reads it back ' + (r.why || ''));
  }
  for (const t of none) ok(!fs.existsSync(path.join(mapDir, t.file)), tag + ' ' + t.id + ' (not read by this game) not written');
  // nothing outside resource/map/<key>/ and .mapviz-backup/ of the mod; the game folder untouched
  const after = snap(mod, true), pre = 'resource/map/' + key.toLowerCase() + '/';
  const stray = Object.keys(after).filter(k => after[k] !== beforeMod[k] && !k.toLowerCase().startsWith(pre) && !k.startsWith('.mapviz-backup/'));
  ok(!stray.length, tag + ' nothing written outside the map folder and the backup folder: ' + stray.join(','));
  ok(JSON.stringify(snap(f.gameDir)) === JSON.stringify(beforeGame), tag + ' the game folder is untouched');
  // undo the deploy as one step: the earlier preview bytes back, the new files gone
  const u = cli(['undo'].concat(base, ['--n', String(wb.n), '--json']));
  ok(u.code === 0, tag + ' undo --n ' + wb.n + ' exit 0, got ' + u.code + ' ' + u.err.slice(-200));
  ok(JSON.stringify(snap(mapDir)) === JSON.stringify(beforeMap) && fs.readFileSync(path.join(mapDir, 'preview.dds')).equals(OLD), tag + ' after undo: the earlier preview bytes are back and the new files are removed');
}
{
  const fa = fx.make(path.join(W, 'as2'), { form: 'as2' });
  deployCase('mowas2', 'mowas2', fa, fa.map, WANT.mowas2);
  const fb = fx.make(path.join(W, 'as64'), { form: 'as2' });
  deployCase('as64', 'as64', fb, fb.map, WANT.as64);
  const fg = fx.make(path.join(W, 'goh'), { form: 'goh' });
  deployCase('goh', 'goh', fg, fg.map, WANT.goh);
  // a single player copy of the GoH fixture: the interface header (PNG 1024 x 600) is read for SP maps only
  const fs2 = fx.make(path.join(W, 'gohsp'), { form: 'goh' });
  const from = path.join(fs2.gameDir, 'resource', 'map', ...fs2.map.split('/')), spKey = 'single/mv_fixture', to = path.join(fs2.gameDir, 'resource', 'map', ...spKey.split('/'));
  fs.cpSync(from, to, { recursive: true });
  deployCase('goh SP', 'goh', fs2, spKey, WANT.gohSP);
}

// ------------------------------------------------------------------ 3 in process: a path escape, one failing file
async function inProcess() {
  const mk = require('../../lib/mapkit'), I = require('../index'), C = require('../commit'), cliMod = require('../cli');
  const f = fx.make(path.join(W, 'ip'), { form: 'as2' });
  const mod = f.modDirs[0], key = f.map;
  // a planted path escape: commit refuses before it writes anything
  {
    const src = mk.source({ target: 'mowas2', game: f.gameDir, mods: [], modDirs: [mod] });
    const doc = mk.doc(src, key, {});
    const p = I.plan(src, doc, { mod, game: f.gameDir, all: true });
    const q = JSON.parse(JSON.stringify(p));
    const t = q.targets.find(x => x.state === 'write');
    t.path = 'resource/map/' + key + '/../../../../escape.dds';
    const before = snap(mod, true);
    let err = null;
    try { C.commit(mod, q, { [t.id]: Buffer.from('x') }); } catch (e) { err = e; }
    ok(err && err.detail && err.detail.code === 'PRV_PATH', 'seeded: a plan path that climbs out of the mod is refused PRV_PATH, got ' + (err && (err.detail && err.detail.code || err.message)));
    ok(JSON.stringify(snap(mod, true)) === JSON.stringify(before) && !fs.existsSync(path.join(mod, 'escape.dds')) && !fs.existsSync(path.resolve(mod, '..', 'escape.dds')) && !fs.existsSync(path.resolve(mod, '..', '..', 'escape.dds')),
      'seeded: nothing written anywhere by the refused commit');
    t.path = 'resource/map/other_map/preview.dds';
    err = null; try { C.commit(mod, q, { [t.id]: Buffer.from('x') }); } catch (e) { err = e; }
    ok(err && err.detail && err.detail.code === 'PRV_PATH', 'seeded: a path into another map folder is refused PRV_PATH');
  }
  // one file fails (compose throws for the header): it is reported, the rest still land, exit 1
  {
    const real = I.compose;
    I.compose = async (src, doc, row, o) => { if (row.id === 'header') throw new Error('planted compose failure at C:\\secret\\dir\\x.dds'); return real(src, doc, row, o); };
    const outs = [], wr = process.stdout.write;
    process.stdout.write = (s) => { outs.push(String(s)); return true; };
    let code = null, threw = null;
    try { code = await cliMod.run(['write', '--target', 'mowas2', '--game', f.gameDir, '--mod-dir', mod, '--map', key, '--mod', mod, '--all', '--yes', '--json']); }
    catch (e) { threw = e; } finally { process.stdout.write = wr; I.compose = real; }
    const body = json(outs.join(''));
    ok(!threw && code === 1 && body && body.all === true, 'one failing file: exit 1 with the body' + (threw ? ', threw ' + threw.message : ', got ' + code));
    if (body) {
      const fl = body.failed || [];
      ok(fl.length === 1 && fl[0].id === 'header' && fl[0].code === 'PRV_FILE_FAILED' && /planted compose failure/.test(fl[0].why) && !/secret[\\/]dir/.test(fl[0].why) && !/[A-Za-z]:[\\/]/.test(fl[0].why),
        'the failed file is reported with its code and why, no drive path: ' + JSON.stringify(fl));
      const mapDir = path.join(mod, 'resource', 'map', ...key.split('/'));
      ok(body.written.length === 3 && !body.written.some(x => /header\.dds$/.test(x)) && ['preview.dds', 'preview_small.dds', 'minimap.dds'].every(n => fs.existsSync(path.join(mapDir, n))) && !fs.existsSync(path.join(mapDir, 'header.dds')),
        'the rest still land: preview, small, minimap written, header not: ' + JSON.stringify(body.written));
      ok(body.n === 1 && C.journal(mod).writes.length === 1 && C.journal(mod).writes[0].files.length === 3, 'one journal entry with the three files');
    }
  }
}

inProcess().catch(e => ok(false, 'in process threw ' + (e && e.stack || e))).then(() => {
  if (fail) { console.log('FAIL mapviz previews deploy: ' + fail + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz previews deploy (' + pass + ')');
});

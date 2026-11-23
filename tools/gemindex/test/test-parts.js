// gemindex ww2-split / ww2-join (lib/ww2parts.js) and the loader state 'parts' (lib/ww2.js, lib/history.js) on a generated database of a
// few hundred KB, cut into small pieces (pieceBytes) so several exist. Seeded defects: a flipped byte inside a piece, a flipped byte in a
// piece's gzip header (gunzip passes, the sha256 does not), a missing piece, a wrong whole hash, a stale joined file, a short disk; each
// must give its own error and leave no index.sqlite. Arg: scratch dir. Every word in the database is generated nonsense.
// Author: Imperator_Aug (ARSENAL, ia-4187bd03)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'gemparts-')));
require('../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
process.env.ARSENAL_WW2_DIR = '';
process.env.ARSENAL_CACHE = path.join(work, 'usercache');   // the per-user copy goes here, never to the real %LOCALAPPDATA%
const P = require('../lib/ww2parts'), W = require('../lib/ww2'), H = require('../lib/history');
const CLI = path.join(__dirname, '..', 'gemindex.js');
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const run = (...a) => cp.spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', env: Object.assign({}, process.env, { ARSENAL_WW2_DIR: '' }) });
const shaOf = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const exists = f => fs.existsSync(f);
const SQL = W.sqlite();
if (!SQL) { console.log('gemindex parts: node:sqlite missing'); process.exit(1); }

// ---- a generated database: the tables the loader reads, pages of seeded nonsense words (little repetition: pieces do not shrink to nothing)
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
const word = () => { let s = ''; for (let i = 3 + rnd() % 6; i > 0; i--) s += String.fromCharCode(97 + rnd() % 26); return s; };
function mkdb(file, extra) {
  const db = new SQL.DatabaseSync(file);
  db.exec(`CREATE VIRTUAL TABLE pages USING fts5(text);
    CREATE TABLE page_meta(rowid INTEGER PRIMARY KEY, doc_id TEXT, n INTEGER, printed TEXT, deep_link TEXT);
    CREATE TABLE docs(doc_id TEXT PRIMARY KEY, title TEXT, nation TEXT, components TEXT, source_url TEXT, n_pages INTEGER);`);
  const pg = db.prepare('INSERT INTO pages(rowid, text) VALUES (?, ?)'), pm = db.prepare('INSERT INTO page_meta VALUES (?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  for (let i = 1; i <= 120; i++) {
    const w = []; for (let k = 0; k < 300; k++) w.push(word());
    if (i === 7) w.push('blorptank');
    pg.run(i, w.join(' ')); pm.run(i, 'g' + (1 + (i % 3)), i, String(i), '');
  }
  for (let d = 1; d <= 3; d++) db.prepare('INSERT INTO docs VALUES (?, ?, ?, ?, ?, ?)').run('g' + d, 'Generated document ' + d + (extra || ''), 'Nowhereland', 'W.AFV', 'https://gen.example.invalid/d' + d, 40);
  db.exec('COMMIT');
  db.close();
}
const CSV = '﻿Name,URL,Nation,Access,Class,Components,LinkStatus,Note\r\nGenerated archive,https://gen.example.invalid/d1,Nowhereland,Free,Primary,W.AFV,ok,\r\n';
function folder(name, opt) {
  opt = opt || {};
  const d = path.join(work, name); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'ww2-source-index.csv'), CSV);
  mkdb(path.join(d, 'index.sqlite'), opt.extra);
  return d;
}
const PB = 64 * 1024;
const src = folder('src');
const dbFile = path.join(src, 'index.sqlite'), dbSize = fs.statSync(dbFile).size, dbSha = shaOf(dbFile);
ok(dbSize > 200 * 1024 && dbSize < 2 * 1048576, 'fixture: a database of a few hundred KB ' + dbSize);

// ---- 1 split
const pdir = path.join(src, P.PARTS_DIR);
let dr = P.split({ dir: src, pieceBytes: PB, dry: true });
ok(!dr.wrote && !exists(pdir) && dr.pieces.length === Math.ceil(dbSize / PB) && dr.sha256 === dbSha, '1 dry run writes nothing ' + dr.pieces.length);
let s1 = P.split({ dir: src, pieceBytes: PB });
const names = () => fs.readdirSync(pdir).sort();
const pj = () => JSON.parse(fs.readFileSync(path.join(pdir, P.PARTS_JSON), 'utf8'));
ok(s1.pieces.length >= 4 && names().join() === [...s1.pieces.map(p => p.name), 'parts.json'].sort().join() && s1.pieces[0].name === 'index.sqlite.001.gz', '1 pieces NNN from 001 + parts.json ' + names().join());
const j1 = pj();
ok(j1.format === 1 && j1.bytes === dbSize && j1.sha256 === dbSha && j1.pieceBytes === PB && j1.pieces.every(p => p.sha256 === shaOf(path.join(pdir, p.name)) && p.stored === fs.statSync(path.join(pdir, p.name)).size) &&
  j1.pieces.reduce((a, p) => a + p.raw, 0) === dbSize, '1 parts.json: whole bytes and sha256, per piece raw, stored, sha256 of the stored file');
const g1 = fs.readFileSync(path.join(pdir, 'index.sqlite.001.gz'));
ok(g1[0] === 0x1f && g1[1] === 0x8b && g1.readUInt32LE(4) === 0 && g1[9] === 0xff, '1 gzip without a time stamp, OS byte 0xff');
ok(exists(path.join(src, P.STAMP)) && P.resolve(src).db === dbFile, '1 split stamps the database it cut: it matches its pieces');
const before = Object.fromEntries(names().map(x => [x, [shaOf(path.join(pdir, x)), fs.statSync(path.join(pdir, x)).mtimeMs]]));
const s2 = P.split({ dir: src, pieceBytes: PB });
ok(s2.pieces.every(p => !p.wrote) && names().every(x => before[x][0] === shaOf(path.join(pdir, x)) && before[x][1] === fs.statSync(path.join(pdir, x)).mtimeMs), '1 deterministic: the same database gives byte-identical pieces, none rewritten');
let thrown = null; try { P.split({ dir: src, pieceBytes: PB, maxStored: 1000 }); } catch (e) { thrown = e; }
ok(thrown && /over the 48 MB limit/.test(thrown.message), '1 a stored piece over the limit fails the verb');
thrown = null; try { P.split({ dir: src, pieceMb: 49 }); } catch (e) { thrown = e; }
ok(thrown && /at most 48/.test(thrown.message), '1 --piece-mb over 48 refused');
// smaller pieces, then the old size again: the extra pieces go
P.split({ dir: src, pieceBytes: PB / 2 });
const many = names().length;
const s3 = P.split({ dir: src, pieceBytes: PB });
ok(many > s3.pieces.length + 1 && s3.removed.length === many - 1 - s3.pieces.length && names().length === s3.pieces.length + 1, '1 old pieces not in the new list removed ' + s3.removed.join());
// a pieces folder ARSENAL did not write: refused, nothing removed
const alien = folder('alien'); fs.mkdirSync(path.join(alien, P.PARTS_DIR)); fs.writeFileSync(path.join(alien, P.PARTS_DIR, 'index.sqlite.009.gz'), 'not ours');
thrown = null; try { P.split({ dir: alien, pieceBytes: PB }); } catch (e) { thrown = e; }
ok(thrown && /did not write/.test(thrown.message) && fs.readdirSync(path.join(alien, P.PARTS_DIR)).join() === 'index.sqlite.009.gz', '1 a pieces folder without an ARSENAL parts.json is left alone');

// ---- 2 join
// gitstate(name): the folder as git has it: list + pieces, no index.sqlite
function gitstate(name) {
  const d = path.join(work, name); fs.mkdirSync(path.join(d, P.PARTS_DIR), { recursive: true });
  fs.copyFileSync(path.join(src, 'ww2-source-index.csv'), path.join(d, 'ww2-source-index.csv'));
  for (const x of names()) fs.copyFileSync(path.join(pdir, x), path.join(d, P.PARTS_DIR, x));
  return d;
}
const flip = (f, at) => { const b = fs.readFileSync(f); b[at] ^= 0x55; fs.writeFileSync(f, b); };
const noDb = d => !exists(path.join(d, 'index.sqlite')) && !exists(path.join(d, 'index.sqlite.part')) && !exists(path.join(d, P.STAMP));
(async () => {
  const outFile = path.join(work, 'joined', 'out.sqlite');
  const r = await P.join({ dir: gitstate('g1'), out: outFile });
  ok(shaOf(outFile) === dbSha && r.sha256 === dbSha && r.bytes === dbSize && !exists(outFile + '.part') && JSON.parse(fs.readFileSync(path.join(work, 'joined', P.STAMP), 'utf8')).sha256 === dbSha, '2 join gives identical bytes and a stamp');
  const g2 = gitstate('g2'); await P.join({ dir: g2 });
  ok(shaOf(path.join(g2, 'index.sqlite')) === dbSha && P.resolve(g2).db === path.join(g2, 'index.sqlite'), '2 default target <dir>/index.sqlite, then it matches');

  // seeded defects
  let e = null, d;
  d = gitstate('bad-flip'); flip(path.join(d, P.PARTS_DIR, 'index.sqlite.002.gz'), 3000);
  try { await P.join({ dir: d }); } catch (x) { e = x; }
  ok(e && /index\.sqlite\.002\.gz is damaged/.test(e.message) && e.piece === 'index.sqlite.002.gz' && noDb(d) && exists(path.join(d, P.PARTS_DIR, 'index.sqlite.002.gz')), '2 flipped byte inside a piece: named, no index.sqlite, pieces kept: ' + (e && e.message));
  e = null; d = gitstate('bad-head'); flip(path.join(d, P.PARTS_DIR, 'index.sqlite.003.gz'), 5);
  try { await P.join({ dir: d }); } catch (x) { e = x; }
  ok(e && /index\.sqlite\.003\.gz is damaged: its sha256 differs/.test(e.message) && noDb(d), '2 flipped byte gunzip ignores (header time): the sha256 catches it: ' + (e && e.message));
  e = null; d = gitstate('bad-missing'); fs.rmSync(path.join(d, P.PARTS_DIR, 'index.sqlite.004.gz'));
  try { await P.join({ dir: d }); } catch (x) { e = x; }
  ok(e && /index\.sqlite\.004\.gz is missing/.test(e.message) && noDb(d), '2 missing piece: named: ' + (e && e.message));
  e = null; d = gitstate('bad-whole'); { const j = pj(); j.sha256 = 'a'.repeat(64); fs.writeFileSync(path.join(d, P.PARTS_DIR, P.PARTS_JSON), JSON.stringify(j)); }
  try { await P.join({ dir: d }); } catch (x) { e = x; }
  ok(e && e.code === 'WHOLE_SHA' && /does not match parts\.json/.test(e.message) && noDb(d), '2 wrong whole hash: refused: ' + (e && e.message));
  e = null; d = gitstate('bad-disk');
  try { await P.join({ dir: d, freeSpace: () => 1000 }); } catch (x) { e = x; }
  ok(e && e.code === 'NO_SPACE' && /Not enough free disk space/.test(e.message) && noDb(d), '2 short disk: plain message before anything is written: ' + (e && e.message));
  e = null; d = gitstate('bad-json'); fs.writeFileSync(path.join(d, P.PARTS_DIR, P.PARTS_JSON), '{"format":1}');
  try { await P.join({ dir: d }); } catch (x) { e = x; }
  ok(e && /cannot be read/.test(e.message) && noDb(d), '2 a parts.json that does not add up: refused');

  // ---- 3 the loader: 'parts' -> joined -> 'full'
  const gs = gitstate('gs');
  const WO = { ww2: gs, noWw2Default: true, data: path.join(work, 'nothing') };
  let st = W.load({ ww2: gs, noDefault: true });
  ok(st.mode === 'parts' && st.loc.db === null && st.parts.count === pj().pieces.length && st.sources.length === 1, '3 git state: mode parts, the list read ' + st.mode);
  let av = H.available(WO);
  ok(av.ok && av.ww2 === 'parts' && av.rows === 1 && av.docs === 0 && av.partsMb === Math.round(dbSize / 1048576) && /stored in pieces/.test(av.ww2Note) && av.join.state === 'idle', '3 available says parts ' + JSON.stringify(av));
  ok(H.rows(WO).total === 1, '3 the source list works before the join');
  thrown = null; try { H.search(Object.assign({ q: 'blorptank' }, WO)); } catch (x) { thrown = x; }
  ok(thrown && thrown.status === 409 && /stored in pieces/.test(thrown.message), '3 the page search answers plainly while in pieces');
  const a = H.joinStart(WO), b = H.joinStart(WO);
  ok(a.state === 'running' && b.state === 'running' && a.total === dbSize && H.available(WO).join.state === 'running', '3 one job: a second caller gets the running job');
  await W.joinPromise();
  ok(H.joinStatus().state === 'done' && H.joinStatus().doneMb === Math.round(dbSize / 1048576) && H.joinStatus().done === dbSize, '3 the job ends done ' + JSON.stringify(H.joinStatus()));
  av = H.available(WO);
  ok(av.ww2 === 'full' && av.docs === 3 && H.search(Object.assign({ q: 'blorptank' }, WO)).total === 1, '3 after the join: full, search works without a restart');
  ok(H.joinStart(WO).state === 'done', '3 start again when the database is there: done at once');
  // stale joined file: the pieces change (another database), the old joined file is not used and is replaced
  const gs2 = gitstate('stale');
  await P.join({ dir: gs2 });
  const other = folder('other', { extra: ' changed' }); P.split({ dir: other, pieceBytes: PB });
  fs.rmSync(path.join(gs2, P.PARTS_DIR), { recursive: true });
  fs.mkdirSync(path.join(gs2, P.PARTS_DIR)); for (const x of fs.readdirSync(path.join(other, P.PARTS_DIR))) fs.copyFileSync(path.join(other, P.PARTS_DIR, x), path.join(gs2, P.PARTS_DIR, x));
  const old = Date.now() / 1000 - 3600; fs.utimesSync(path.join(gs2, 'index.sqlite'), old, old);
  st = W.load({ ww2: gs2, noDefault: true });
  ok(st.mode === 'parts' && P.resolve(gs2).db === null, '3 stale joined file (stamp names other pieces): not used, state parts');
  // a stale file and a damaged piece: the error, and the stale file is not used afterwards either
  const gs3 = gitstate('stale2'); await P.join({ dir: gs3 });
  fs.rmSync(path.join(gs3, P.PARTS_DIR), { recursive: true }); fs.mkdirSync(path.join(gs3, P.PARTS_DIR));
  for (const x of fs.readdirSync(path.join(other, P.PARTS_DIR))) fs.copyFileSync(path.join(other, P.PARTS_DIR, x), path.join(gs3, P.PARTS_DIR, x));
  flip(path.join(gs3, P.PARTS_DIR, 'index.sqlite.001.gz'), 2000);
  e = null; try { await P.join({ dir: gs3 }); } catch (x) { e = x; }
  ok(e && /001\.gz is damaged/.test(e.message) && noDb(gs3), '3 stale file + damaged piece: error, the stale file removed with its stamp, no index.sqlite');
  const sj = H.joinStart({ ww2: gs2, noWw2Default: true }); await W.joinPromise();
  ok(sj.state === 'running' && H.joinStatus().state === 'done' && shaOf(path.join(gs2, 'index.sqlite')) === shaOf(path.join(other, 'index.sqlite')) && W.load({ ww2: gs2, noDefault: true }).mode === 'full', '3 stale: joined again from the new pieces');
  // a failed job reports why, and a new start is allowed after it
  const gsf = gitstate('failjob'); fs.rmSync(path.join(gsf, P.PARTS_DIR, 'index.sqlite.002.gz'));
  H.joinStart({ ww2: gsf, noWw2Default: true }); await W.joinPromise();
  ok(H.joinStatus().state === 'failed' && /002\.gz is missing/.test(H.joinStatus().why) && H.available({ ww2: gsf, noWw2Default: true, data: path.join(work, 'nothing') }).ww2 === 'parts', '3 failed job: why named, state stays parts');
  fs.copyFileSync(path.join(pdir, 'index.sqlite.002.gz'), path.join(gsf, P.PARTS_DIR, 'index.sqlite.002.gz'));
  H.joinStart({ ww2: gsf, noWw2Default: true }); await W.joinPromise();
  ok(H.joinStatus().state === 'done', '3 try again after a fix: done');
  // a stopped job (W.joinStop: the GUI's Stop and the job list's Cancel): stopped at once, and stopped part way. Each time no index.sqlite, no
  // .part, no stamp, every piece still there, the folder still 'parts'; the next start does it all again and ends done
  const gst = gitstate('stopjob'), WS = { ww2: gst, noWw2Default: true, data: path.join(work, 'nothing') }, pcs = () => fs.readdirSync(path.join(gst, P.PARTS_DIR)).sort().join();
  const pcs0 = pcs();
  ok(W.joinStop().state !== 'running', '3 stop with nothing running does nothing');
  H.joinStart(WS);
  ok(W.joinStop().state === 'running', '3 stop asked: the job is still the running one until it stops');
  await W.joinPromise();
  ok(H.joinStatus().state === 'stopped' && H.joinStatus().why === '' && noDb(gst) && pcs() === pcs0 && H.available(WS).ww2 === 'parts' && H.available(WS).join.state === 'stopped', '3 stopped at once: state stopped, nothing left, still parts ' + JSON.stringify(H.joinStatus()));
  H.joinStart(WS);
  while (W.joinStatus().state === 'running' && W.joinStatus().done === 0) await new Promise(z => setImmediate(z));
  const mid = W.joinStop();
  await W.joinPromise();
  ok(mid.state === 'running' && mid.done > 0 && mid.done < dbSize && H.joinStatus().state === 'stopped' && noDb(gst) && pcs() === pcs0 && W.load({ ww2: gst, noDefault: true }).mode === 'parts', '3 stopped part way (' + mid.done + ' of ' + dbSize + ' bytes): the unfinished file is gone, no stamp, pieces kept ' + JSON.stringify(H.joinStatus()));
  ok(H.joinStart(WS).state === 'running', '3 a start after a stop runs again');
  await W.joinPromise();
  ok(H.joinStatus().state === 'done' && shaOf(path.join(gst, 'index.sqlite')) === dbSha && exists(path.join(gst, P.STAMP)) && W.load({ ww2: gst, noDefault: true }).mode === 'full', '3 after a stop the next start joins everything: identical bytes, stamp, full');
  // the per-user copy: a joined file there is found for a folder that holds only the pieces
  const ro = gitstate('readonly'), ut = P.userTarget(ro);
  ok(ut.startsWith(process.env.ARSENAL_CACHE) && path.basename(ut) === 'index.sqlite', '3 per-user target under the ARSENAL cache folder ' + ut);
  await P.join({ dir: ro, out: ut });
  ok(P.resolve(ro).db === ut && W.load({ ww2: ro, noDefault: true }).mode === 'full' && noDb(ro), '3 the per-user copy is used when the folder has none');
  // a folder with a fresh ww2bundle copy (newer than the pieces, no stamp): the copy is used
  const fresh = gitstate('fresh'); fs.copyFileSync(path.join(other, 'index.sqlite'), path.join(fresh, 'index.sqlite'));
  ok(P.resolve(fresh).db === path.join(fresh, 'index.sqlite'), '3 a database newer than the pieces, without a stamp, is used (the pieces are the stale side)');

  // ---- 4 CLI
  let c = run('ww2-split', '--dir', other, '--piece-mb', '45', '--dry-run');
  ok(c.status === 0 && /^would write 1 pieces/.test(c.stdout), '4 cli ww2-split --dry-run\n' + c.stdout + c.stderr);
  const cj = path.join(work, 'clijoin', 'x.sqlite');
  c = run('ww2-join', '--dir', gitstate('cli'), '--out', cj);
  ok(c.status === 0 && /^ {2}\d+ of \d+ MB/m.test(c.stdout) && /joined \d+ pieces into .*x\.sqlite/.test(c.stdout) && shaOf(cj) === dbSha, '4 cli ww2-join --out\n' + c.stdout + c.stderr);
  c = run('ww2-join', '--dir', path.join(work, 'nothing'));
  ok(c.status === 2 && /nothing to put together/.test(c.stderr), '4 cli ww2-join without pieces: exit 2');

  console.log(bad ? bad + ' failures of ' + n : 'gemindex parts: PASS (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e.stack || e)); process.exit(1); });

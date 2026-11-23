// lib/sdlset memo + packed walk, and pricecalc's use of the memo (scratch fixture):
//   memo: off by default (every get/open reads the disk); on: one read per key, the same bytes; off again: nothing kept, a
//     changed file is read new. open and get hand out the same layer (loose file, the folder's pak, the game).
//   packed(): the walk by folder listing (file types from readdir, a link stat'ed) gives the same entries, in the same order,
//     with the same registration numbers as the old walk that stat'ed every name (kept here as the reference).
//   pricecalc lib.open: the session is the same with the memo as without it (src.memo made a no-op), the memo is off when
//     open returns, and included files were read once.
// Author: Imperator_Aug (ARSENAL, ia-878ef9d9)
const fs = require('fs'), path = require('path'), os = require('os');
const sdlset = require('../../lib/sdlset'), pak = require('../../lib/pak'), { zip } = require('../../lib/zipwrite');
const base = process.env.PRICECALC_TMP ? process.env.PRICECALC_TMP + '-memo' : require('../../lib/platform').tmpDir('pricecalc/memo');
fs.rmSync(base, { recursive: true, force: true });
const game = path.join(base, 'game'), mod = path.join(base, 'mod');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };
const put = (root, rel, data) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const crlf = s => s.replace(/\r?\n/g, '\r\n');

// ---- fixture: a game (loose + pak), a mod folder with loose files, paks at several depths, an empty folder, a dot folder
put(game, 'mowas_2.exe', 'MZ');
put(game, 'resource/set/game_only.inc', crlf('(define "g" {gamekey 1})\n'));
put(game, 'resource/gamelogic.pak', zip([['set/in_game_pak.inc', Buffer.from('(define "gp" {x 1})\r\n'), true]]));
const INC = put(mod, 'resource/set/breed/macros.inc', crlf('(define "give" {item "%item" %count})\n'));
put(mod, 'resource/set/breed/mp/ger/a.set', crlf('(include "/set/breed/macros.inc")\n{breed {inventory ("give" item(mauzer) count(1))}}\n'));
put(mod, 'resource/set/breed/mp/ger/b.set', crlf('(include "/set/breed/macros.inc")\n(include "/set/game_only.inc")\n(include "/set/in_mod_pak.inc")\n{breed {inventory ("give" item(mp40) count(2))}}\n'));
put(mod, 'resource/set/Zeta.set', 'z'); put(mod, 'resource/set/alpha.set', 'a'); put(mod, 'resource/set/_under.set', 'u'); put(mod, 'resource/set/B.set', 'b');
put(mod, 'resource/entity/e.pak', zip([['tank/t.def', Buffer.from('{entity}'), false], ['tank/', Buffer.alloc(0), false]]));
put(mod, 'resource/entity/tank/t.def', '{loose}');
put(mod, 'resource/set/pk.pak', zip([['in_mod_pak.inc', Buffer.from('(define "mp" {y 2})\r\n'), true], ['alpha.set', Buffer.from('packed'), false]]));
put(mod, 'resource/zz/deep/more/x.set', 'x');
put(mod, 'resource/zz/deep/in.pak', zip([['linked.set', Buffer.from('l'), false]]));
put(mod, 'resource/.git/config', 'c'); put(mod, 'resource/.SVN/entries', 'c');
fs.mkdirSync(path.join(mod, 'resource', 'empty'), { recursive: true });
put(mod, 'localization/desc.lng', '{tags}'); put(mod, 'localization.pak', zip([['other.lng', Buffer.from('{t}'), false]]));
let linked = false;
try { fs.symlinkSync(path.join(mod, 'resource', 'zz'), path.join(mod, 'resource', 'link'), 'junction'); linked = true; } catch (e) { /* no links here: the plain cases still run */ }

// ---- packed(): the old walk, as it was (statSync per name), against the source's
function oldPacked(folder) {
  const out = [], seq = [], relPath = (r, f) => path.relative(r, f).split(path.sep).join('/');
  const keyOf = f => { const rel = relPath(folder, f).toLowerCase(); return rel.startsWith('resource/') ? rel : 'resource/' + rel; };
  const ntfs = a => a.sort((x, y) => { const X = x.toUpperCase(), Y = y.toUpperCase(); return X < Y ? -1 : X > Y ? 1 : 0; });
  let n = 0;
  const addPak = (f, root) => { try { for (const e of pak.list(f)) if (!e.name.endsWith('/')) out.push([root + e.name.toLowerCase().replace(/\\/g, '/'), relPath(folder, f) + '!' + e.name, ++n]); } catch (x) { /* unreadable */ } };
  const walk = (dir, root) => {
    let names = [];
    try { names = ntfs(fs.readdirSync(dir)); } catch (x) { return; }
    for (const nm of names) {
      const p = path.join(dir, nm), lnm = nm.toLowerCase();
      let st; try { st = fs.statSync(p); } catch (x) { continue; }
      if (st.isDirectory()) { if (lnm !== '.git' && lnm !== '.svn') walk(p, root + lnm + '/'); }
      else if (/\.pak$/.test(lnm)) addPak(p, root);
      else seq.push([keyOf(p), ++n]);
    }
  };
  const at = nm => { const p = path.join(folder, nm); return fs.existsSync(p) ? p : null; };
  const roots = ['resource.pak', 'resource', 'localization.pak', 'localization'].map(at);
  if (roots[0]) addPak(roots[0], 'resource/');
  if (roots[1]) walk(roots[1], 'resource/');
  if (roots[2]) addPak(roots[2], 'resource/interface/text/');
  if (roots[3]) walk(roots[3], 'resource/interface/text/');
  return { out, seq };
}
{
  const s = sdlset.createSource({ gameDir: game, folder: mod });
  const got = [...s.packed()].map(([k, r]) => [k, r.file, r.seq]);
  const want = oldPacked(mod);
  // a later pak entry of one key replaces the earlier one in the Map and keeps the first one's place: the reference does the same
  const m = new Map(); for (const r of want.out) m.set(r[0], r);
  ok(JSON.stringify(got) === JSON.stringify([...m.values()]), 'packed(): same entries, order and numbers as the stat walk\n got  ' + JSON.stringify(got) + '\n want ' + JSON.stringify([...m.values()]));
  ok(got.length >= 4 && got.some(r => r[0] === 'resource/interface/text/other.lng'), 'packed(): the fixture paks are listed: ' + got.length);
  // loose against pak of one key: the higher registration number wins, as before (winner reads the numbers of the same walk)
  for (const [k, n] of want.seq) {
    const p = m.get(k);
    if (p) ok(s.winner(k) === (n > p[2] ? 'local' : 'pak'), 'winner of ' + k + ': ' + s.winner(k) + ' (loose ' + n + ', pak ' + p[2] + ')');
  }
  ok(s.winner('resource/set/alpha.set') === 'pak' && String(s.get('resource/set/alpha.set')) === 'packed', 'set/pk.pak is registered after loose alpha.set: the pak wins');
  ok(s.winner('resource/entity/tank/t.def') === 'local', 'loose entity/tank/t.def is registered after e.pak: loose wins');
  if (linked) ok(got.some(r => r[0] === 'resource/link/deep/linked.set') && got.some(r => r[0] === 'resource/zz/deep/linked.set'), 'a linked folder is walked, as stat followed it');
  require('../../lib/vfs').closeRecs();
}

// ---- memo
{
  const reads = new Map(), rf = fs.readFileSync;
  fs.readFileSync = function (p) { if (typeof p === 'string') { const k = path.resolve(p).toLowerCase(); reads.set(k, (reads.get(k) || 0) + 1); } return rf.apply(fs, arguments); };
  const count = p => reads.get(path.resolve(p).toLowerCase()) || 0;
  try {
    const s = sdlset.createSource({ gameDir: game, folder: mod });
    const K = 'resource/set/breed/macros.inc', R = { kind: 'virtual', key: K };
    const keys = [K, 'resource/set/game_only.inc', 'resource/set/in_mod_pak.inc', 'resource/set/in_game_pak.inc', 'resource/set/alpha.set', 'resource/set/none.inc'];
    const snap = () => keys.map(k => { const g = s.get(k), o = s.open({ kind: 'virtual', key: k }); return [k, g ? g.toString('latin1') : null, o ? [o.buf.toString('latin1'), o.file, o.key] : null]; });
    const plain = JSON.stringify(snap());
    reads.clear(); s.get(K); s.get(K); s.open(R); s.open(R);
    ok(count(INC) === 4, 'memo off (default): every get/open reads the file: ' + count(INC));
    ok(s.memo(true) === false, 'memo(true) says it was off');
    reads.clear();
    const b1 = s.get(K), b2 = s.get(K), o1 = s.open(R), o2 = s.open(R);
    ok(count(INC) === 1 && b1 === b2 && o1.buf === b1 && o2.buf === b1, 'memo on: one read, the same Buffer: ' + count(INC));
    ok(o1.file === 'resource/set/breed/macros.inc' && o1.key === K, 'memo on: open names the file as before: ' + o1.file);
    ok(JSON.stringify(snap()) === plain, 'memo on: every layer gives the bytes and names it gives with the memo off');
    ok(JSON.stringify(snap()) === plain, 'memo on, second pass (all kept): the same again');
    fs.writeFileSync(INC, crlf('(define "give" {item "changed" 9})\n'));
    ok(!/changed/.test(String(s.get(K))), 'memo on: a file changed meanwhile is served as first read (the caller writes nothing in that phase)');
    ok(s.memo(false) === true, 'memo(false) says it was on');
    reads.clear();
    ok(/changed/.test(String(s.get(K))) && /changed/.test(String(s.open(R).buf)) && count(INC) === 2, 'memo off again: the disk is read, nothing kept: ' + count(INC));
    s.memo(true); s.get(K); s.memo(false); fs.writeFileSync(INC, crlf('(define "give" {item "%item" %count})\n'));
    s.memo(true);
    ok(!/changed/.test(String(s.get(K))), 'a new memo phase starts empty');
    s.memo(false);

    // ---- pricecalc: lib.open with the memo against lib.open with src.memo made a no-op (the old reads)
    put(mod, 'resource/set/multiplayer/units/soldiers.set', crlf('{"mp/ger/a" {cost 100}}\n{"mp/ger/b" {cost 120}}\n'));
    const Mm = require('../mod'), P = require('../pricecalc').lib, real = Mm.createModSource;
    const shot = s0 => JSON.stringify({ breeds: [...s0.d.breeds], items: [...s0.d.items].map(([k, v]) => [k, v.count, v.from, [...v.breeds], v.file, v.line]), cards: s0.d.cards, pr: s0.d.pr && s0.d.pr.rows, vet: s0.d.vet },
      (k, v) => v instanceof Map ? [...v] : v instanceof Set ? [...v] : v);
    let srcNew = null, calls = [];
    Mm.createModSource = o => { srcNew = real(o); const m = srcNew.memo; srcNew.memo = on => { calls.push(!!on); return m(on); }; return srcNew; };
    reads.clear();
    const sNew = P.open({ mod, game }); const nNew = count(INC);
    Mm.createModSource = o => { const x = real(o); x.memo = () => false; return x; };
    reads.clear();
    const sOld = P.open({ mod, game }); const nOld = count(INC);
    Mm.createModSource = real;
    ok(shot(sNew) === shot(sOld), 'pricecalc open: the same session with and without the memo');
    ok(sNew.d.breeds.size >= 0 && nOld >= 2 && nNew === 1, 'pricecalc open: the shared include is read once (was ' + nOld + ', now ' + nNew + ')');
    ok(calls.join() === 'true,false', 'pricecalc open: memo on, then off before it returns: ' + calls.join());
    reads.clear(); srcNew.get(K); srcNew.get(K);
    ok(count(INC) === 2, 'after open the session source reads the disk again: ' + count(INC));
    // a gather that throws switches the memo off too
    let thrown = false; calls = [];
    Mm.createModSource = o => { const x = real(o); const m = x.memo; x.memo = on => { calls.push(!!on); return m(on); }; x.local = null; return x; };
    try { P.open({ mod, game }); } catch (e) { thrown = true; }
    Mm.createModSource = real;
    ok(thrown && calls.join() === 'true,false', 'a failed open leaves the memo off: ' + thrown + ' ' + calls.join());
  } finally { fs.readFileSync = rf; require('../../lib/vfs').closeRecs(); }
}
if (linked) { try { fs.rmdirSync(path.join(mod, 'resource', 'link')); } catch (e) { /* left for rmSync */ } }
try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) { /* a pak still open: scratch stays */ }
console.log(fails ? 'memo.test FAIL ' + fails : 'memo.test ok');
process.exit(fails ? 1 : 0);

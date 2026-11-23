// memo.test: the whole-mod check's include memo (intel/fixes memoBegin / memoEnd, keylint memoHold). arg 1 = scratch dir. last line PASS.
// A made-up game and mod folder: every file of the mod includes the same two files. Checked file by file as ext/ide/routes
// modcheck does (one ictx): the findings are the same with the pair as without it; with it an included file is read once by
// the include pass and once by the key pass instead of once per file that names it; nothing is kept after memoEnd (a changed
// include is seen by the next check), while the pair is open the include is as first read (accepted), and without the pair
// every check reads the disk.
// Author: Imperator_Aug (ARSENAL, ia-6ad9688d)
const fs = require('fs'), path = require('path');
const W = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'ide-memo-test'));
require('../../lib/testscratch').guard(W);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
process.env.ARSENAL_CACHE = path.join(W, 'store'); process.env.AS2_NO_STEAM = '1';
const intel = require('../intel'), keylint = require('../../keylint/keylint');
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const GAME = path.join(W, 'game'), MOD = path.join(W, 'mod');
const put = (root, rel, text) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\r?\n/g, '\r\n')); return f; };
put(GAME, 'mowas_2.exe', 'MZ');
const GINC = put(GAME, 'resource/set/game_macros.inc', '(define "g_item" {item "%name" 1})\n');
const INC = put(MOD, 'resource/set/breed/macros.inc', '(define "give" {item "%item" %count})\n(define "rifle" {item "mauzer" filled})\n');
const N = 8, files = [];
for (let i = 0; i < N; i++) {
  const rel = `resource/set/breed/mp/ger/b${i}.set`;
  const body = '(include "/set/breed/macros.inc")\n(include "/set/game_macros.inc")\n{breed\n\t{inventory\n\t\t("give" item(mp40) count(' + (i + 1) + '))\n\t\t("rifle")\n'
    + (i % 3 === 0 ? '\t\t("no_such_macro")\n' : '') + '\t\t("g_item" name(x))\n\t}\n' + (i === 5 ? '}\n}\n' : '}\n');
  put(MOD, rel, body);
  files.push({ key: rel, text: body });
}
const reads = new Map(), rf = fs.readFileSync;
fs.readFileSync = function (p) { if (typeof p === 'string') { const k = path.resolve(p).toLowerCase(); reads.set(k, (reads.get(k) || 0) + 1); } return rf.apply(fs, arguments); };
const count = p => reads.get(path.resolve(p).toLowerCase()) || 0;
const newCtx = () => ({ gameDir: GAME, mods: [], folder: MOD });
const walk = (ictx, memo) => {
  const out = {};
  if (memo) intel.memoBegin(ictx);
  try { for (const f of files) out[f.key] = intel.check({ key: f.key, text: f.text }, ictx).map(x => [x.line, x.col, x.len, x.code, x.sev, x.msg, x.source]); }
  finally { if (memo) intel.memoEnd(ictx); }
  return JSON.stringify(out);
};
try {
  walk(newCtx(), false);   // first use builds the game view and the key check's context (their own reads)
  reads.clear();
  const plain = walk(newCtx(), false), nPlain = [count(INC), count(GINC)];
  reads.clear();
  const ic = newCtx(), kept = walk(ic, true), nKept = [count(INC), count(GINC)];
  ok(kept === plain, 'the findings are the same with and without the memo');
  ok(/MACRO_UNDEFINED|no_such_macro/.test(plain) && /BLOCK_END_STRAY/.test(plain), 'the fixture has findings (an unknown macro, a stray brace): ' + plain.slice(0, 300));
  ok(nPlain[0] >= N && nPlain[1] >= N, 'without the pair an include is read for every file that names it: ' + nPlain);
  ok(nKept[0] >= 1 && nKept[0] <= 2 && nKept[1] >= 1 && nKept[1] <= 2, 'with the pair an include is read once by each pass: ' + nKept);
  ok(Object.getOwnPropertySymbols(ic).length === 0 && Object.keys(ic).join() === 'gameDir,mods,folder', 'memoEnd leaves the context as it was');
  ok(keylint.memoHold(true) === 1 && keylint.memoHold(false) === 0, 'no holder is left open');
  // begin twice / end twice: one holder
  const i2 = newCtx();
  ok(intel.memoBegin(i2) === true && intel.memoBegin(i2) === false && intel.memoEnd(i2) === true && intel.memoEnd(i2) === false, 'begin and end count once per context');
  ok(intel.memoBegin(null) === false && intel.memoEnd(undefined) === false, 'no context: nothing to hold');
  ok(keylint.memoHold(true) === 1 && keylint.memoHold(false) === 0, 'still no holder open');

  // while the pair is open an include is as first read; after memoEnd the disk is read again
  const i3 = newCtx(), f0 = files[1];
  const one = c => JSON.stringify(intel.check({ key: f0.key, text: f0.text }, c).map(x => [x.line, x.code]));
  const before = one(i3);
  intel.memoBegin(i3);
  const inA = one(i3);
  fs.writeFileSync(INC, '(define "give" {item "%item" %count})\r\n');   // "rifle" is gone
  const inB = one(i3);
  intel.memoEnd(i3);
  const after = one(i3), fresh = one(newCtx());
  ok(inA === before && inB === before, 'pair open: the include stays as first read');
  ok(after !== before && after === fresh && /MACRO_UNDEFINED/.test(after), 'after memoEnd the changed include is read: ' + after);
  reads.clear(); one(i3); one(i3);
  ok(count(INC) >= 2, 'without the pair every check reads the include from the disk: ' + count(INC));
  ok(walk(newCtx(), true) === walk(newCtx(), false), 'after the change: the same findings with and without the memo');
} catch (e) { bad++; console.log('FAIL ' + (e && e.stack || e)); }
fs.readFileSync = rf;
try { require('../../lib/vfs').closeRecs(); fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* scratch stays */ }
console.log(bad ? `${bad} of ${n} failed` : `memo ok ${n}`);
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);

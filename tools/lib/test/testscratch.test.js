// lib/testscratch.js: the allow list. Refusals are proved only with empty throw-away folders made here (never a folder with content),
// and why() only names a reason: nothing is wiped by this test except its own scratch at the end.
// usage: node testscratch.test.js [scratch]     last line: PASS testscratch (N)
// Author: Imperator_Aug (ARSENAL, ia-31c6dfac)
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const TS = require('../testscratch');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const base = process.env.ARSENAL_TMP && path.isAbsolute(process.env.ARSENAL_TMP) ? process.env.ARSENAL_TMP : os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(base, 'testscratch-')));
fs.mkdirSync(W, { recursive: true });
const REPO = path.resolve(__dirname, '..', '..', '..');
const rm = [];
try {
  // allowed: a fresh subfolder of ARSENAL_TMP (or the OS temp), and a test work folder of the repo (it need not exist)
  const sub = path.join(W, 'sub'); fs.mkdirSync(sub);
  assert.strictEqual(TS.why(sub), '', TS.why(sub));
  assert.strictEqual(TS.allowed(path.join(REPO, 'tools', 'nosuchtool', 'test', 'work-x')), '');
  ok('allowed: a subfolder of the scratch root; a work folder below a test/ folder of the repo');
  // refused: the scratch roots themselves, a folder outside every allowed root, the repo's own code folders (not below test/)
  if (process.env.ARSENAL_TMP) assert.ok(TS.why(process.env.ARSENAL_TMP), 'the ARSENAL_TMP root itself');
  assert.ok(/not a scratch folder/.test(TS.allowed(path.join(REPO, 'tools', 'lib'))));
  assert.ok(/not a scratch folder/.test(TS.allowed(path.join(REPO, 'tools', 'lib', 'test'))), 'the test folder itself is not a work folder');
  assert.ok(/not a scratch folder/.test(TS.allowed(os.homedir())));
  // an empty throw-away folder outside the allowed roots: a sibling of the repo's tools folder is not one we may make, so use one
  // made beside the scratch root only when that parent is not itself a temp root; else a made-up path that does not exist
  const outside = path.join(path.parse(REPO).root, 'no-such-arsenal-scratch-' + process.pid);
  assert.ok(!fs.existsSync(outside) && /not a scratch folder/.test(TS.why(outside)), TS.why(outside));
  ok('refused: the scratch root itself, the repo code folders, the test folder itself, the home folder, a folder outside every root');
  // a junction inside the scratch root that leads out of it: its target is an empty throw-away folder made here outside every allowed
  // root (in the repo's tools/lib, not below a test/ folder) and removed at the end
  const away = path.join(REPO, 'tools', 'lib', '.testscratch-away-' + process.pid); fs.mkdirSync(away); rm.push(away);
  const j = path.join(W, 'jlink');
  let linked = true; try { fs.symlinkSync(away, j, 'junction'); rm.unshift(j); } catch (e) { linked = false; }
  if (linked) { assert.ok(/not a scratch folder/.test(TS.why(j)) && /not a scratch folder/.test(TS.why(path.join(j, 'x'))) && fs.readdirSync(away).length === 0, TS.why(j)); ok('refused: a junction in the scratch root that leads out of it (links followed first)'); }
  else ok('junction case skipped: no junction could be made here');
  // a junction in the scratch root that leads to another empty folder inside it: still allowed
  const t2 = path.join(W, 'empty2'); fs.mkdirSync(t2); const j2 = path.join(W, 'jin');
  let l2 = true; try { fs.symlinkSync(t2, j2, 'junction'); rm.push(j2); } catch (e) { l2 = false; }
  if (l2) { assert.strictEqual(TS.why(path.join(j2, 'deeper')), ''); ok('allowed: a link that stays inside the scratch root'); }
  // a fake game install inside the scratch root (empty but for the exe name): still refused by the old rules after the allow list
  const g = path.join(W, 'game'); fs.mkdirSync(g); fs.writeFileSync(path.join(g, 'as64.exe'), '');
  assert.ok(/game install/.test(TS.why(path.join(g, 'mods'))), TS.why(path.join(g, 'mods')));
  ok('inside the allowed root the old refusals still hold (a game install)');
} finally {
  for (const l of rm) { try { fs.lstatSync(l).isSymbolicLink() ? fs.unlinkSync(l) : fs.rmdirSync(l); } catch (e) { try { fs.rmdirSync(l); } catch (x) { /* gone */ } } }
  if (!process.argv[2]) fs.rmSync(W, { recursive: true, force: true });
}
console.log('PASS testscratch (' + n + ')');

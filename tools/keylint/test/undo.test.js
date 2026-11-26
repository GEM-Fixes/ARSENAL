// restore points + the read paths 1B, wave 2b): a copy of test/bad with a restore point
// (<mod>/.arsenal-undo/t1: one entity file, one .patch). Default: nothing under .arsenal-undo is read or reported (SDL walk,
// armor text, KEY-01 walk); restorePoints: true reports them again. check (sync, one file at a time) and checkAsync (listing +
// read-ahead) give the same report, also for small read-ahead windows. prints UNDO-OK or the failures
// Author: Imperator_Aug (ARSENAL, ia-781075a3)
const fs = require('fs'), path = require('path'), os = require('os'), keylint = require('../keylint');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'keylint-undo-'));
(async () => {
  try {
    const mod = path.join(w, 'mod');
    fs.cpSync(path.join(__dirname, 'bad'), mod, { recursive: true });
    const u = path.join(mod, '.arsenal-undo', 't1');
    fs.mkdirSync(path.join(u, 'resource', 'entity'), { recursive: true });
    fs.copyFileSync(path.join(mod, 'resource', 'entity', 'chk.def'), path.join(u, 'resource', 'entity', 'chk.def'));
    fs.writeFileSync(path.join(u, 'old.patch'), 'x\r\n');
    const js = r => JSON.stringify(r.rep.toJSON({ tool: 'keylint' })) + '|' + r.files + '|' + r.skipped;
    const inUndo = r => { const j = r.rep.toJSON({ tool: 'keylint' }); return [...j.findings, ...j.info].filter(f => String(f.file || '').replace(/\\/g, '/').includes('.arsenal-undo')); };
    const s0 = keylint.check({ folder: mod }), a0 = await keylint.checkAsync({ folder: mod }), a1 = await keylint.checkAsync({ folder: mod }, { window: 2, maxBytes: 1 });
    ok(inUndo(s0).length === 0, 'default: restore point findings: ' + JSON.stringify(inUndo(s0)));
    ok(js(s0) === js(a0), 'default: sync and async reports differ');
    ok(js(s0) === js(a1), 'default: sync and async (window 2) reports differ');
    const s1 = keylint.check({ folder: mod, restorePoints: true }), a2 = await keylint.checkAsync({ folder: mod, restorePoints: true });
    const iu = inUndo(s1).map(f => f.code);
    ok(iu.includes('LOOSE_PATCH') && iu.includes('ARMOR_MACRO_ARGS') && iu.includes('TAGS_MULTI_STRING'), 'restorePoints: restore point findings back: ' + JSON.stringify(iu));
    ok(js(s1) === js(a2), 'restorePoints: sync and async reports differ');
  } catch (e) { console.log('FAIL: ' + e.stack); bad++; }
  finally { fs.rmSync(w, { recursive: true, force: true }); }
  console.log(bad ? 'UNDO-BAD' : 'UNDO-OK');
  process.exit(0);
})();

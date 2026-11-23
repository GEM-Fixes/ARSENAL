// previews cli test (MV-PRV): `mapviz previews plan|write|check|undo` on the fixture map in both forms (previews.md 8, 14).
// Writes into the fixture's own mod folder (made under the scratch dir, outside every install). Known answers: the default
// targets per game, sizes, mips and byte lengths of what is written, check passing, undo putting every file back to the
// bytes it had. Seeded defects: a stale plan hash (PRV_PLAN_CHANGED, exit 6), no --yes (PRV_CONFIRM, 6), a bad --set
// (PRV_SET, 2), a source missing from --in (PRV_SOURCE_MISSING, 3), check with no journal (PRV_NO_JOURNAL, 3), a truncated
// DDS (check exit 1), a file changed after the write (undo keeps it, PRV_UNDO_CHANGED, exit 1).
// usage: node tools/mapviz/previews/test/previews.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-22bf7da3)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { spawnSync } = require('child_process');

const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-prv-cli-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz previews: ' + what); } }

const MVJS = path.resolve(__dirname, '../../mapviz.js');
const fx = require('../../test/fxmake');
const CK = require('../check');

function cli(args) {
  const r = spawnSync(process.execPath, [MVJS, 'previews'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 600000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim() };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const errCode = r => { const j = json(r.out); return j && j.error ? (j.error.detail && j.error.detail.code) || j.error.code : null; };
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
function snap(dir) {   // every file under dir, rel path -> sha1 (the backup folder left out)
  const out = {};
  (function walk(d, rel) {
    for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) {
      if (n === '.mapviz-backup') continue;
      const p = path.join(d, n), r = rel ? rel + '/' + n : n;
      if (fs.statSync(p).isDirectory()) walk(p, r); else out[r] = sha1(fs.readFileSync(p));
    }
  })(dir, '');
  return out;
}

const WANT = {
  mowas2: { write: ['preview', 'small', 'header', 'minimap'], none: ['header_interface'], minimap: [1024, 752] },
  as64: { write: ['preview', 'small', 'header', 'minimap'], none: ['header_interface'], minimap: [1024, 752] },
  goh: { write: ['preview', 'header', 'minimap'], none: ['small', 'header_interface'], minimap: [1500, 1100] },
};

for (const form of ['as2', 'goh']) {
  const f = fx.make(path.join(W, form), { form });
  const mod = f.modDirs[0], key = f.map;
  const targets = form === 'as2' ? ['mowas2', 'as64'] : ['goh'];
  for (const target of targets) {
    const base = ['--target', target, '--game', f.gameDir, '--mod-dir', mod, '--map', key, '--mod', mod];
    const tag = target + ' ' + key;
    // plan: default targets, sizes
    const pr = cli(['plan'].concat(base, ['--json']));
    const p = json(pr.out);
    ok((pr.code === 0 || pr.code === 1) && p && p.hash, tag + ' plan exit 0 or 1, got ' + pr.code + ' ' + pr.err.slice(-300));
    if (!p) continue;
    if (pr.code === 1) console.log('note ' + tag + ' plan exit 1 (findings): ' + p.targets.map(t => t.id + ' ' + (t.warnings || []).map(w => w.code + ' ' + w.name).join(',')).join('; '));
    const by = id => p.targets.find(t => t.id === id) || {};
    ok(WANT[target].write.every(id => by(id).state === 'write') && WANT[target].none.every(id => by(id).state === 'none'),
      tag + ' plan default targets: ' + p.targets.map(t => t.id + ':' + t.state).join(' '));
    ok(String(by('minimap').size) === String(WANT[target].minimap), tag + ' minimap size ' + by('minimap').size);
    ok(p.targets.filter(t => t.state === 'write').every(t => t.path.toLowerCase().startsWith('resource/map/' + key + '/')), tag + ' every file in the map folder');
    // late P1: source real takes the best picture in --in, l4 before l3, l2, l1 (the page hands the best cached rung)
    {
      const inHi = path.join(W, target + '-in-hi'), inLo = path.join(W, target + '-in-lo');
      for (const [d, rs] of [[inHi, ['l1', 'l2', 'l3']], [inLo, ['l1', 'l2']]]) {
        fs.mkdirSync(d, { recursive: true });
        for (const r of rs) fs.writeFileSync(path.join(d, 'pic.' + r + '.mvg'), '');
      }
      const srcOf = dir => { const j = json(cli(['plan'].concat(base, ['--in', dir, '--source', 'real', '--targets', 'preview', '--json'])).out); const t = j && j.targets.find(x => x.id === 'preview'); return t && t.source ? t.source.resolved : null; };
      const hi = srcOf(inHi), lo = srcOf(inLo);
      ok(hi === 'pic.l3' && lo === 'pic.l2', tag + ' source real picks the best rung in --in: l1..l3 -> ' + hi + ', l1..l2 -> ' + lo);
    }
    if (target === 'as64') continue;   // as64 = mowas2 targets; the write path is the same code
    const mapDir = path.join(mod, 'resource', 'map', ...key.split('/'));
    const before = snap(mapDir);

    // check before any write: no journal
    const c0 = cli(['check'].concat(base, ['--json']));
    ok(c0.code === 3 && errCode(c0) === 'PRV_NO_JOURNAL', tag + ' seeded: check with no journal exit 3 PRV_NO_JOURNAL, got ' + c0.code + ' ' + errCode(c0));
    // seeded refusals and usage errors
    const w1 = cli(['write'].concat(base, ['--plan-hash', 'deadbeef', '--json']));
    ok(w1.code === 6 && errCode(w1) === 'PRV_PLAN_CHANGED', tag + ' seeded: stale plan hash exit 6 PRV_PLAN_CHANGED, got ' + w1.code + ' ' + errCode(w1));
    const w2 = cli(['write'].concat(base, ['--json']));
    ok(w2.code === 6 && errCode(w2) === 'PRV_CONFIRM', tag + ' seeded: no --yes exit 6 PRV_CONFIRM, got ' + w2.code + ' ' + errCode(w2));
    const w3 = cli(['write'].concat(base, ['--yes', '--set', 'preview.bogus=1', '--json']));
    ok(w3.code === 2 && errCode(w3) === 'PRV_SET', tag + ' seeded: --set preview.bogus exit 2 PRV_SET, got ' + w3.code + ' ' + errCode(w3));
    const w4 = cli(['write'].concat(base, ['--yes', '--targets', 'minimap', '--set', 'minimap.compose=crop', '--json']));
    ok(w4.code === 2 && errCode(w4) === 'PRV_SET', tag + ' seeded: minimap.compose=crop (stretch only) exit 2, got ' + w4.code + ' ' + errCode(w4));
    const emptyIn = path.join(W, form + '-empty-in'); fs.mkdirSync(emptyIn, { recursive: true });
    const w5 = cli(['write'].concat(base, ['--yes', '--in', emptyIn, '--source', 'l2', '--targets', 'header', '--json']));
    ok(w5.code === 3 && errCode(w5) === 'PRV_SOURCE_MISSING', tag + ' seeded: source missing from --in exit 3 PRV_SOURCE_MISSING, got ' + w5.code + ' ' + errCode(w5));
    ok(JSON.stringify(snap(mapDir)) === JSON.stringify(before), tag + ' nothing written by the refused calls');

    // write with the plan hash
    const out = path.join(W, form + '-out');
    const wr = cli(['write'].concat(base, ['--plan-hash', p.hash, '--out', out, '--json']));
    const wb = json(wr.out);
    ok((wr.code === 0 || wr.code === 1) && wb && wb.n === 1, tag + ' write exit 0 or 1, journal entry 1, got ' + wr.code + ' ' + wr.err.slice(-300));
    if (!wb) continue;
    if (wr.code === 1) console.log('note ' + tag + ' write exit 1, notes ' + JSON.stringify(wb.notes));
    // late P3 write body
    ok(wb.target === target && wb.map === key && wb.planHash === p.hash && wb.entry && wb.entry.n === 1 && typeof wb.entry.made === 'string' &&
      Array.isArray(wb.notes) && wb.notes.every(n => n && typeof n.code === 'string' && typeof n.text === 'string') && Array.isArray(wb.written) && Array.isArray(wb.backups),
    tag + ' write body P3 shape {v, target, map, planHash, written, backups, entry:{n, made}, notes:[{code, text}]}: ' + JSON.stringify({ entry: wb.entry, notes: wb.notes }));
    ok(!/[a-z]:[\\/]/i.test(wr.out), tag + ' write body holds no drive path');
    ok(fs.existsSync(path.join(out, 'previews.write.json')) && fs.existsSync(path.join(out, 'reads.json')), tag + ' --out holds previews.write.json and reads.json');
    for (const id of WANT[target].write) {
      const t = by(id), file = path.join(mod, ...t.path.split('/'));
      const buf = fs.existsSync(file) ? fs.readFileSync(file) : null;
      ok(buf && buf.length === t.bytes, tag + ' ' + id + ' written, ' + (buf ? buf.length : 'no file') + ' B, plan ' + t.bytes);
      if (buf) {
        const r = CK.checkOne(buf, t);
        ok(r.ok && r.facts.size.join() === t.size.join() && r.facts.mips === t.mips, tag + ' ' + id + ' reads back ' + JSON.stringify(r.facts) + (r.why ? ' ' + r.why : ''));
      }
      ok(wb.files.some(x => x.path === t.path && x.sha1 === (buf ? sha1(buf) : '')), tag + ' ' + id + ' journal sha1 = file sha1');
    }
    // check: clean
    const c1 = cli(['check'].concat(base, ['--json']));
    const cb = json(c1.out);
    ok(c1.code === 0 && cb && cb.ok && cb.files.length === WANT[target].write.length, tag + ' check exit 0, ' + (cb ? cb.files.length : '?') + ' files ok; ' + c1.err.slice(-200));
    // seeded: truncate the header -> check exit 1, undo keeps it
    const hfile = path.join(mod, ...by('header').path.split('/'));
    const hbuf = fs.readFileSync(hfile);
    fs.writeFileSync(hfile, hbuf.subarray(0, hbuf.length - 1000));
    const c2 = cli(['check'].concat(base, ['--json']));
    const c2b = json(c2.out);
    ok(c2.code === 1 && c2b && c2b.files.some(x => x.path === by('header').path && !x.ok), tag + ' seeded: truncated header, check exit 1, header FAIL');
    const u1 = cli(['undo'].concat(base, ['--json']));
    const ub = json(u1.out);
    ok(u1.code === 1 && ub && ub.kept.some(x => x === by('header').path) && (ub.notes || []).some(n => n && n.code === 'PRV_UNDO_CHANGED' && typeof n.text === 'string'), tag + ' seeded: undo keeps the changed header, exit 1 PRV_UNDO_CHANGED {code, text}, got ' + u1.code + ' ' + u1.out.slice(0, 300));
    // late P3 undo body: target, map, n, restored, kept, notes; the files the write added count as restored
    ok(ub && ub.target === target && ub.map === key && ub.n === 1 && Array.isArray(ub.restored) && ub.restored.length === WANT[target].write.length - 1 && !('removed' in ub), tag + ' undo body P3 shape: ' + (ub ? JSON.stringify({ target: ub.target, map: ub.map, n: ub.n, restored: ub.restored.length }) : ''));
    // put the header back as the journal had it, then the undo is clean
    fs.writeFileSync(hfile, hbuf);
    const u2 = cli(['undo'].concat(base, ['--n', '1', '--json']));
    ok(u2.code === 0, tag + ' undo --n 1 after the header is back: exit 0, got ' + u2.code + ' ' + u2.err.slice(-200) + ' ' + u2.out.slice(0, 200));
    ok(JSON.stringify(snap(mapDir)) === JSON.stringify(before), tag + ' after undo the map folder holds the bytes it had before the write');

    // a second write (--yes), then undo: back again
    const wr2 = cli(['write'].concat(base, ['--yes', '--targets', 'header', '--json']));
    const wb2 = json(wr2.out);
    ok((wr2.code === 0 || wr2.code === 1) && wb2 && wb2.n === 2 && wb2.written.length === 1, tag + ' write --yes --targets header: entry 2, one file, got ' + wr2.code);
    const u3 = cli(['undo'].concat(base, ['--json']));
    ok(u3.code === 0 && JSON.stringify(snap(mapDir)) === JSON.stringify(before), tag + ' undo of entry 2: exit 0, map folder as before');
  }
}

// ------------------------------------------------------------------ in process: plan notes, SP crop, check sizes, cancel in commit
async function inProcess() {
  const mk = require('../../lib/mapkit'), I = require('../index'), C = require('../commit');
  const f = fx.make(path.join(W, 'ip'), { form: 'as2' });
  const mod = f.modDirs[0], key = f.map;
  {
    const src = mk.source({ target: 'mowas2', game: f.gameDir, mods: [], modDirs: [mod] });
    const doc = mk.doc(src, key, {});
    // plan notes: one per (code, text); the fixture has no map.ply, so real falls back to l0 on every target and
    // PRV_FALLBACK_SOURCE comes once per target, each naming its file
    const p = I.plan(src, doc, { mod, game: f.gameDir });
    const seen = new Set(p.notes.map(n => n.code + '|' + n.text));
    ok(seen.size === p.notes.length, 'plan notes unique by (code, text): ' + JSON.stringify(p.notes.map(n => n.code)));
    const fb = p.notes.filter(n => n.code === 'PRV_FALLBACK_SOURCE');
    ok(fb.length > 1 && fb.every(n => p.targets.some(t => t.state === 'write' && n.text.startsWith(t.file + ':'))), 'PRV_FALLBACK_SOURCE texts name their file: ' + JSON.stringify(fb.map(n => n.text.slice(0, 30))));
    // SP maps: no flags or spawns. crop takes the camera box; no box at all -> PRV_CROP_NO_ACTION, no inset; safe area info note
    const B = doc.boxes.world;
    const spDoc = (boxes) => Object.assign({}, doc, { modes: [{ id: '0', flags: [], spawns: [] }], boxes: Object.assign({}, doc.boxes, boxes) });
    const cam = [B[0] / 2, B[1] / 2, B[2] / 4, B[3] / 4];
    const p1 = I.plan(src, spDoc({ camera: cam, pather: null }), { mod, compose: 'crop', targets: ['preview'], game: f.gameDir });
    const r1 = p1.targets.find(t => t.id === 'preview');
    ok(r1.cropFrom === 'camera' && r1.inset && (r1.frame[2] - r1.frame[0]) < (B[2] - B[0]) && !r1.notes.includes('PRV_CROP_NO_ACTION'), 'SP crop on the camera box: frame smaller than the world, inset kept: ' + JSON.stringify({ from: r1.cropFrom, frame: r1.frame }));
    ok(r1.notes.includes('PRV_SAFE_NO_POINTS') && p1.notes.some(n => n.code === 'PRV_SAFE_NO_POINTS'), 'SP preview: PRV_SAFE_NO_POINTS (info)');
    const p2 = I.plan(src, spDoc({ camera: null, pather: null }), { mod, compose: 'crop', targets: ['preview'], game: f.gameDir });
    const r2 = p2.targets.find(t => t.id === 'preview');
    ok(r2.cropFrom === null && r2.inset === null && r2.notes.includes('PRV_CROP_NO_ACTION') && p2.notes.some(n => n.code === 'PRV_CROP_NO_ACTION' && n.text.startsWith(r2.file)), 'SP crop with no box: PRV_CROP_NO_ACTION, no inset');
    ok(!I.INFO.has('PRV_CROP_NO_ACTION') && I.INFO.has('PRV_SAFE_NO_POINTS') && I.findings(p2), 'PRV_CROP_NO_ACTION is a finding, PRV_SAFE_NO_POINTS is info');
  }
  // cancel flag set while commit runs: the run ends 0 or 1 with the write body (the mod changed), not exit 5
  {
    const cli = require('../cli');
    const flag = path.join(W, 'ip-cancel');
    const real = I.commit;
    I.commit = (m, p, pics, o) => { const r = real(m, p, pics, o); fs.writeFileSync(flag, 'x'); return r; };
    const outs = [], wr = process.stdout.write;
    process.stdout.write = (s) => { outs.push(String(s)); return true; };
    let code = null, threw = null;
    try { code = await cli.run(['write', '--target', 'mowas2', '--game', f.gameDir, '--mod-dir', mod, '--map', key, '--mod', mod, '--targets', 'header', '--yes', '--cancel-flag', flag, '--json']); }
    catch (e) { threw = e; } finally { process.stdout.write = wr; I.commit = real; }
    const body = json(outs.join(''));
    ok(!threw && (code === 0 || code === 1) && body && body.entry && body.written.length === 1, 'cancel during commit: exit ' + code + ', body printed' + (threw ? ', threw ' + threw.code + ' ' + threw.message : ''));
    try { fs.unlinkSync(flag); } catch (e) { /* none */ }
  }
  // check: the journal row keeps size and mips; a minimap of another size with the journal's sha1 fails check
  {
    const src = mk.source({ target: 'mowas2', game: f.gameDir, mods: [], modDirs: [mod] });
    const doc = mk.doc(src, key, {});
    const p = I.plan(src, doc, { mod, targets: ['minimap'], game: f.gameDir });
    const row = p.targets.find(t => t.id === 'minimap');
    const enc = require('../../../lib/model/ddsenc');
    const good = enc.encode(new Uint8ClampedArray(row.size[0] * row.size[1] * 4).fill(200), row.size[0], row.size[1], { mips: true });
    const r = I.commit(mod, p, { minimap: good }, {});
    const jf = r.entry.files.find(x => x.path === row.path);
    ok(jf && String(jf.size) === String(row.size) && jf.mips === row.mips, 'journal file row keeps size ' + (jf && jf.size) + ' and mips ' + (jf && jf.mips));
    const c0 = I.check(src, doc, { mod, targets: ['minimap'] });
    ok(c0.ok, 'check: the minimap as written passes');
    // seeded: a smaller valid DXT1 in its place, journal sha1 set to match -> must fail on size
    const small = enc.encode(new Uint8ClampedArray(512 * 376 * 4).fill(90), 512, 376, { mips: true });
    fs.writeFileSync(path.join(mod, ...row.path.split('/')), small);
    const j = C.journal(mod); const e = j.writes[j.writes.length - 1];
    e.files.find(x => x.path === row.path).sha1 = C.sha1(small);
    fs.writeFileSync(path.join(mod, '.mapviz-backup', 'journal.json'), JSON.stringify(j));
    const c1 = I.check(src, doc, { mod, targets: ['minimap'] });
    ok(!c1.ok && c1.files[0] && /size 512x376/.test(c1.files[0].why || ''), 'seeded: minimap of another size fails check: ' + JSON.stringify(c1.files[0] && c1.files[0].why));
    I.undo(mod, {});
  }
}

inProcess().catch(e => ok(false, 'in process threw: ' + (e && e.stack || e))).then(() => {
  if (fail) { console.log(fail + ' failed, ' + pass + ' passed; scratch ' + W); process.exit(1); }
  if (!process.argv[2]) try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ }
  console.log('PASS mapviz previews cli (' + pass + ')');
});

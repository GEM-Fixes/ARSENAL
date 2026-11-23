// --exe and the GoH branch (game parity). Made-up fixture in a temp folder, run() called directly (plan only, nothing written):
//   G = an AS2 install with as64.exe + mowas_2.exe; stuff "coreonly" and entity "coreent" exist only in as64/core (AS64 sees them, MoW:AS2 does not)
//   H = a GoH install: entity def in resource/entity, a vanilla .pot under localizations/english with msgctxt desc/entity/taken;
//       --name goes to localizations/default/interface/text/desc/clone_<mod>.pot (GHVFS-04, GHLOC-01, GHLOC-06)
// Author: Imperator_Aug (ARSENAL, ia-5c1e07d2)
const fs = require('fs'), path = require('path'), os = require('os');
const { run } = require('../clone-entity.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-exe-'));
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, 'latin1'); };
let bad = 0;
const ok = (c, m, extra) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m + (extra ? '\n' + extra : '')); } };
const codes = r => { const j = r.rep.toJSON({ tool: 'x' }); return j.findings.concat(j.info || []).map(f => f.code); };
const show = r => JSON.stringify({ codes: codes(r), plan: r.plan.map(p => p.rel) });
try {
  put('G/as64.exe', 'MZ'); put('G/mowas_2.exe', 'MZ');
  put('G/resource/set/stuff/weapon/rifle.base.set', '{rifle\r\n\t{damage 10}\r\n}\r\n');
  put('G/as64/core/resource/set/stuff/weapon/rifle.coreonly.set', '{rifle\r\n\t{damage 20}\r\n}\r\n');
  put('G/resource/entity/props/box/box.def', '{game_entity\r\n\t{Extension "box.mdl"}\r\n}\r\n');
  put('G/resource/entity/props/box/box.mdl', '{model}\r\n');
  put('G/as64/core/resource/entity/props/coreent/coreent.def', '{game_entity\r\n\t{Extension "/entity/props/box/box.mdl"}\r\n}\r\n');
  put('G/resource/set/breed/mp/rus/rifle.set', '{breed\r\n}\r\n');
  put('G/as64/core/resource/set/breed/mp/rus/coreb.set', '{breed\r\n}\r\n');
  const G = path.join(W, 'G'), M = path.join(G, 'mods', 'm');
  fs.mkdirSync(M, { recursive: true });
  let r = run({ gameDir: G, out: M, stuff: 'rifle coreonly', tags: 'rifle.x1', noCache: true, dry: true });
  ok(!r.blocked && r.plan.length >= 1, 'stuff, no --exe: as64/core base found, as before', show(r));
  r = run({ gameDir: G, out: M, stuff: 'rifle coreonly', tags: 'rifle.x1', noCache: true, dry: true, exe: 'mowas_2' });
  ok(r.blocked && codes(r).includes('CLONE_BASE_MISSING'), 'stuff, --exe mowas_2: as64/core not mounted, base missing', show(r));
  r = run({ gameDir: G, out: M, entity: 'coreent', as: 'newent', noCache: true, dry: true });
  ok(!r.blocked && r.plan.some(p => /newent\.def$/.test(p.rel)), 'entity, no --exe: as64/core def found', show(r));
  r = run({ gameDir: G, out: M, entity: 'coreent', as: 'newent', noCache: true, dry: true, exe: 'mowas2' });
  ok(r.blocked, 'entity, --exe mowas2 (GUI id): as64/core def not seen', show(r));
  r = run({ gameDir: G, out: M, breed: 'mp/rus/coreb', as: 'mp/rus/nb', exe: 'mowas_2' });
  ok(r.blocked && codes(r).includes('CLONE_BASE_MISSING'), 'breed, --exe mowas_2: as64/core breed not seen', show(r));
  r = run({ gameDir: G, out: M, breed: 'mp/rus/coreb', as: 'mp/rus/nb' });
  ok(!r.blocked && r.plan.length === 1, 'breed, no --exe: as64/core breed found', show(r));
  r = run({ gameDir: G, out: M, breed: 'mp/rus/rifle', as: 'mp/rus/nb', exe: 'zz' });
  ok(r.blocked && codes(r).includes('CLONE_BAD_ARGS'), 'bad --exe: CLONE_BAD_ARGS', show(r));

  put('H/binaries/x64/call_to_arms.exe', 'MZ');
  put('H/resource/entity/props/crate/crate.def', '{game_entity\r\n\t{Extension "crate.mdl"}\r\n}\r\n');
  put('H/resource/entity/props/crate/crate.mdl', '{model}\r\n');
  put('H/localizations/default/interface/text/desc/entity.pot', '#, fuzzy\nmsgid ""\nmsgstr ""\n\nmsgctxt "desc/entity/taken"\nmsgid "Old"\nmsgstr ""\n');
  const H = path.join(W, 'H');
  const inside = path.join(H, 'mods', 'gm'); fs.mkdirSync(inside, { recursive: true });
  r = run({ gameDir: H, out: inside, entity: 'crate', as: 'crate2', name: 'Crate Two', noCache: true, exe: 'goh' });
  ok(r.blocked && codes(r).includes('CLONE_OUT_UNSAFE') && r.refused, 'GoH, --out inside the install: writeguard refusal', show(r));
  r = run({ gameDir: H, out: inside, entity: 'crate', as: 'crate2', modelFrom: 'x', goh: H, noCache: true, dry: true, exe: 'goh' });
  ok(r.blocked && codes(r).includes('CLONE_BAD_ARGS') && /^clone-entity --model-from: not available for .*\(PORT-105\)$/.test(r.refused || ''), 'GoH, --model-from refused with the notFor line citing PORT-105', show(r) + ' ' + r.refused);
  { const cp = require('child_process'), tool = path.join(__dirname, '..', 'clone-entity.js');
    const cli = (...a) => { const e = cp.spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' }); return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; };
    let c = cli('--game', H, '--exe', 'goh', '--out', inside, '--entity', 'crate', '--as', 'crate2', '--no-cache');
    ok(c.code === 2 && c.out.trim().split('\n').length === 1 && !/findings/.test(c.out) && !fs.existsSync(path.join(inside, 'resource')), 'CLI: GoH writeguard refusal is one line, exit 2, nothing written', c.out);
    c = cli('--game', H, '--exe', 'goh', '--out', inside, '--entity', 'crate', '--as', 'crate2', '--model-from', 'x', '--goh', H, '--dry-run', '--no-cache');
    ok(c.code === 2 && /^clone-entity --model-from: not available for [^\n]*\(PORT-105\)\s*$/.test(c.out), 'CLI: --model-from on GoH is one notFor line, exit 2', c.out); }
  const out = path.join(W, 'gohmods', 'gm'); fs.mkdirSync(out, { recursive: true });
  r = run({ gameDir: H, out, entity: 'crate', as: 'crate2', name: 'Crate "Two"', noCache: true, dry: true, exe: 'goh' });
  const pot = r.plan.find(p => p.rel === 'localizations/default/interface/text/desc/clone_gm.pot');
  const t = pot ? pot.data.toString('utf8') : '';
  ok(!r.blocked && pot && /^#, fuzzy\nmsgid ""\nmsgstr ""\n/.test(t) && t.includes('\nmsgctxt "desc/entity/crate2"\nmsgid "Crate \\"Two\\""\nmsgstr ""\n') && !t.includes('\r') && codes(r).includes('CLONE_LNG_GOH')
    && !r.plan.some(p => /^localization\//.test(p.rel)), 'GoH --name: gettext entry in localizations/default .pot (LF, msgctxt key), no localization/*.lng', show(r) + '\n' + t);
  fs.mkdirSync(path.dirname(path.join(out, pot ? pot.rel : 'x')), { recursive: true }); if (pot) fs.writeFileSync(path.join(out, pot.rel), pot.data);
  r = run({ gameDir: H, out, entity: 'crate', as: 'crate2', name: 'Renamed', noCache: true, dry: true, exe: 'goh' });
  const pr = r.plan.find(p => /clone_gm\.pot$/.test(p.rel)), tr = pr ? pr.data.toString('utf8') : '';
  ok(pr && (tr.match(/desc\/entity\/crate2"/g) || []).length === 1 && tr.includes('msgctxt "desc/entity/crate2"\nmsgid "Renamed"\nmsgstr ""'), 'GoH: same key again replaces the msgid, one entry', show(r) + '\n' + tr);
  r = run({ gameDir: H, out, entity: 'crate', as: 'crate2b', name: 'X', noCache: true, dry: true });
  const pot2 = r.plan.find(p => /clone_gm\.pot$/.test(p.rel)), t2 = pot2 ? pot2.data.toString('utf8') : '';
  ok(pot2 && pot2.existing && t2.includes('desc/entity/crate2"') && t2.includes('msgctxt "desc/entity/crate2b"\nmsgid "X"'), 'GoH found from the folder (no --exe): appended to the existing .pot', show(r) + '\n' + t2);
  r = run({ gameDir: H, out, entity: 'crate', as: 'taken', name: 'New', noCache: true, dry: true, exe: 'goh' });
  ok(codes(r).includes('CLONE_LNG_KEY_EXISTS'), 'GoH: key already in the effective GoH texts (localizations/default mounted at resource/): CLONE_LNG_KEY_EXISTS', show(r));
} finally { fs.rmSync(W, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);

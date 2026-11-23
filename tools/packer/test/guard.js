// PACKGUARD seeded-defect test: GOH-ORIGIN.tsv guard in packer + release-check --publish, --allow-private, --help
// Author: Imperator_Aug (ARSENAL, ia-75a640cc)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const origin = require('../../goh2as2/origin'), { zip } = require('../../lib/zipwrite');
const PACKER = path.join(__dirname, '..', 'packer.js'), RC = path.join(__dirname, '..', '..', 'release-check', 'release-check.js');
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'packguard-'));
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const put = (d, f, s) => { const p = path.join(d, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return p; };
const run = (tool, ...a) => spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8', cwd: w });

// seeded mod: a unchanged (ORIGIN), b edited (CHANGED, not refused), gone.dds missing (GONE), c = a's bytes renamed, pak entry = a's bytes
const mod = path.join(w, 'gmod'), A = '{goh a 1}\r\n';
put(mod, 'mod.info', '{Mod\r\n\t{Name "g"}\r\n}\r\n');
put(mod, 'resource/entity/goh/a.def', A);
put(mod, 'resource/entity/goh/b.def', '{goh b 1}\r\n');
put(mod, 'resource/texture/gone.dds', 'x');
origin.record(mod, [{ file: 'resource/entity/goh/a.def', tool: 'goh2as2', src: 'entity/a' }, { file: 'resource/entity/goh/b.def', tool: 'goh2as2', src: 'entity/b' },
  { file: 'resource/texture/gone.dds', tool: 'mapport', src: 'texture/gone' }]);
put(mod, 'resource/entity/goh/b.def', '{own b 2}\r\n'); fs.rmSync(path.join(mod, 'resource/texture/gone.dds'));
put(mod, 'resource/entity/mine/c.def', A);
fs.writeFileSync(path.join(mod, 'resource', 'old.pak'), zip([['set/hid.set', Buffer.from(A)]]));
put(mod, 'resource/set/own.set', '{own 1}\r\n');
const clean = path.join(w, 'cmod'); put(clean, 'resource/set/x.set', '{x 1}\r\n');

let r = run(PACKER, mod, '-q');
ok(r.status === 1, 'dry run on GoH mod: exit 1 (' + r.status + ')');
ok(/resource\/entity\/goh\/a\.def: PACK_GOH_ORIGIN/.test(r.stdout), 'unchanged ledger file: PACK_GOH_ORIGIN');
ok(/resource\/entity\/mine\/c\.def: PACK_GOH_RENAMED/.test(r.stdout), 'same sha1 other name: PACK_GOH_RENAMED');
ok(/resource\/old\.pak:set\/hid\.set: PACK_GOH_RENAMED/.test(r.stdout), 'pak entry with ledger sha1: PACK_GOH_RENAMED');
ok(!/goh\/b\.def: PACK_GOH/.test(r.stdout), 'edited ledger file not refused');
r = run(PACKER, mod);
ok(/GOH_ORIGIN_CHANGED/.test(r.stdout) && /GOH_ORIGIN_GONE/.test(r.stdout), 'edited / gone ledger rows are info');
const out = path.join(w, 'out');
r = run(PACKER, mod, '--out', out);
ok(r.status === 1 && !fs.existsSync(out) && /PACK_REFUSED/.test(r.stdout), '--out on GoH mod: refused, nothing written');
r = run(PACKER, mod, '--out', out, '--allow-private', '-q');
const outs = fs.existsSync(out) ? fs.readdirSync(out).sort() : [];
ok(r.status === 0 && outs.length > 1 && outs.every(f => /PRIVATE/.test(f)), '--allow-private: exit 0, every file marked PRIVATE: ' + outs + ' ' + r.status);
ok(/WARN_PACK_PRIVATE/.test(r.stdout) && !/: PACK_GOH_ORIGIN/.test(r.stdout), '--allow-private: hits become WARN_PACK_PRIVATE');
r = run(PACKER, clean, '--out', path.join(w, 'cout'), '-q');
ok(r.status === 0 && fs.existsSync(path.join(w, 'cout', 'gamelogic.pak')), 'clean mod packs as before, exit 0');

// release-check --publish
r = run(RC, '--publish', mod);
ok(r.status === 1 && /PACK_GOH_ORIGIN/.test(r.stdout) && /PACK_GOH_RENAMED/.test(r.stdout) && /PUBLISH REFUSED/.test(r.stdout), 'publish gate refuses GoH mod: ' + r.status);
const pmod = path.join(w, 'pmod'); put(pmod, 'resource/set/x.set', '{x 1}\r\n');
fs.copyFileSync(path.join(out, outs.find(f => /\.pak$/.test(f))), path.join(pmod, 'resource', 'entity-PRIVATE.pak'));
r = run(RC, '--publish', pmod);
ok(r.status === 1 && /PACK_PRIVATE/.test(r.stdout), 'publish gate refuses a PRIVATE pak in the mod (no ledger needed)');
r = run(PACKER, pmod, '-q');
ok(r.status === 1 && /PACK_PRIVATE/.test(r.stdout), 'packer refuses a mod holding a PRIVATE pak');
r = run(RC, '--publish', clean);
ok(r.status === 0 && /PUBLISH OK/.test(r.stdout), 'publish gate passes a clean mod: ' + r.status + r.stdout);
ok(run(RC, '--publish').status === 2, '--publish without mods: exit 2');
ok(run(RC, '--publish', path.join(w, 'nope')).status === 2, '--publish missing mod: exit 2');

// packer --help: exit 0, usage, no side effects; bad args exit 2
const before = fs.readdirSync(w).sort().join();
r = run(PACKER, '--help', '--out', 'helpout');
ok(r.status === 0 && /usage/.test(r.stdout) && fs.readdirSync(w).sort().join() === before, '--help: usage, exit 0, nothing written');
ok(run(PACKER, '-h').status === 0, '-h: exit 0');
ok(run(PACKER, mod, '--nope').status === 2, 'unknown flag: exit 2');
ok(run(PACKER, path.join(w, 'nope')).status === 2, 'missing mod folder: exit 2 (was empty result, exit 0)');

fs.rmSync(w, { recursive: true, force: true });
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);

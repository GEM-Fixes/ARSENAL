// runs place-entity scenarios on fixture/game, asserts file contents, prints "scenario CODE" lines (diffed with truth.md by run.sh)
// Author: Imperator_Aug (ARSENAL, ia-2df70fcc)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = path.join(__dirname, 'fixture', 'game'), tool = path.join(__dirname, '..', 'place-entity.js');
let bad = 0;
const fail = m => { console.log('ASSERT FAIL: ' + m); bad++; };
const rd = f => fs.existsSync(f) ? fs.readFileSync(f).toString('latin1') : null;
function run(name, mod, args, want) {
  const r = cp.spawnSync(process.execPath, [tool, mod, '--game', fx, '--no-cache', ...args], { encoding: 'utf8' });
  for (const l of r.stdout.split('\n')) { const m = /^(?:info: )?\S+: ([A-Z][A-Z0-9_]+) /.exec(l); if (m) console.log(name + ' ' + m[1]); }
  if (r.status !== want) fail(`${name}: exit ${r.status}, want ${want}\n${r.stdout}${r.stderr}`);
  return r.stdout;
}
const mod = n => path.join(fx, 'mods', n);
const mapOf = n => rd(path.join(mod(n), 'resource/map/multi/tm/map'));
const orig = rd(path.join(fx, 'resource/map/multi/tm/map'));
// a: first placement: uid = max map uid 0x10 + 1 = 0x11 is used by the .mi -> 0x12
run('a_ok', mod('mod_a'), ['--map', 'multi/tm', '--entity', 'hut1', '--pos', '100,200', '--dir', '90'], 0);
const a = mapOf('mod_a');
if (!a || !a.includes('\t{Entity "hut1" 0x12\r\n\t\t{Position 100 200}\r\n\t\t{xform zl 90}\r\n\t}\r\n\t{Link 0x2')) fail('a content: ' + a);
if (a && a.replace(/\t\{Entity "hut1"[^]*?\r\n\t\}\r\n/, '') !== orig) fail('a: rest of the map file changed');
// b: second placement edits the mod copy: next uid 0x13, 3-D position, scale
run('b_second', mod('mod_a'), ['--map', 'map/multi/tm', '--entity', 'hut1.def', '--pos', '-5.5,7,3.25', '--scale', '1.5'], 0);
const b = mapOf('mod_a');
if (!b || !b.includes('{Entity "hut1" 0x13\r\n\t\t{Position -5.5 7 3.25}\r\n\t\t{xform scale 1.5}') || !b.includes('0x12')) fail('b content: ' + b);
// c: dry-run writes nothing
run('c_dry', mod('mod_b'), ['--map', 'multi/tm', '--entity', 'hut1', '--pos', '1,2', '--dry-run'], 0);
if (mapOf('mod_b')) fail('c: dry-run wrote');
// d: errors
run('d_unknown', mod('mod_b'), ['--map', 'multi/tm', '--entity', 'nosuch', '--pos', '1,2'], 1);
run('d_nomap', mod('mod_b'), ['--map', 'multi/none', '--entity', 'hut1', '--pos', '1,2'], 1);
run('g_modpak', mod('mod_b'), ['--mods', 'mod_p', '--map', 'multi/pk', '--entity', 'hut1', '--pos', '1,2', '--dry-run'], 0);
run('d_pos', mod('mod_b'), ['--map', 'multi/tm', '--entity', 'hut1', '--pos', '1;2'], 1);
run('d_unsafe', fx, ['--map', 'multi/tm', '--entity', 'hut1', '--pos', '1,2'], 1);
if (mapOf('mod_b') || rd(path.join(fx, 'resource/map/multi/tm/map')) !== orig) fail('d: wrote on error');
// e: outside the Clip world rect = warning, still written
run('e_outside', mod('mod_b'), ['--map', 'multi/tm', '--entity', 'tree1', '--pos', '5000,5000', '--tex', '1'], 0);
if (!(mapOf('mod_b') || '').includes('{TexMod "1"}')) fail('e: TexMod');
// f: def from a mod folder = warning [T]
const f = cp.spawnSync(process.execPath, [tool, mod('mod_c'), '--game', fx, '--no-cache', '--map', 'multi/tm', '--entity', 'moddef', '--pos', '1,1'], { encoding: 'utf8' });
for (const l of f.stdout.split('\n')) { const m = /^(?:info: )?\S+: ([A-Z][A-Z0-9_]+) /.exec(l); if (m) console.log('f_moddef ' + m[1]); }
const u = cp.spawnSync(process.execPath, [tool, 'x'], { encoding: 'utf8' });
if (u.status !== 2 || !/usage/.test(u.stderr)) fail('usage error');
process.exit(bad ? 1 : 0);

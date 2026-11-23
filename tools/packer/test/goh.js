// packer --goh / --exe goh (game parity): a made-up GoH mod packaged, then mounted through lib/vfs as a GoH mod (GHVFS-04 layout).
// Author: Imperator_Aug (ARSENAL, ia-5c2c996e)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const pak = require('../../lib/pak'), { build } = require('../../lib/vfs');
const P = path.join(__dirname, '..', 'packer.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'packgoh-'));
let bad = 0;
const fail = m => { console.log('FAIL ' + m); bad++; };
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
try {
  const mod = path.join(tmp, 'src', 'gmod');
  put(path.join(mod, 'mod.info'), '{mod\r\n\t{name "g"}\r\n\t{minGameVersion "1.050"}\r\n}\r\n');
  put(path.join(mod, 'resource', 'entity', 'tank', 't.def'), '{x 1}\r\n');
  put(path.join(mod, 'resource', 'set', 'a.set'), '{a 1}\r\n');
  put(path.join(mod, 'localizations', 'default', 'interface', 'text', 'g.pot'), 'msgctxt "g/k"\r\nmsgid "G"\r\nmsgstr ""\r\n');
  put(path.join(mod, 'localization', 'old.lng'), '{tags}\r\n');
  put(path.join(mod, 'GOH-ORIGIN.tsv'), 'resource/entity/tank/t.def\tgoh\r\n');   // a GoH mod may hold GoH bytes: guard not run
  const out = path.join(tmp, 'out');
  const r = cp.spawnSync('node', [P, mod, '--goh', '--package', '--out', out], { encoding: 'utf8' });
  if (r.status !== 0) fail('goh package exit ' + r.status + ' ' + r.stdout + r.stderr);
  if (!/localization WARN_PACK_GOH_UNREAD|localization: WARN_PACK_GOH_UNREAD/.test(r.stdout)) fail('root localization/ not flagged: ' + r.stdout);
  if (!/GOH_GUARD_NA/.test(r.stdout) || /PACK_GOH_ORIGIN/.test(r.stdout)) fail('guard ran on a GoH mod');
  const pm = path.join(out, 'gmod');
  const paks = fs.existsSync(path.join(pm, 'resource')) ? fs.readdirSync(path.join(pm, 'resource')).filter(n => /\.pak$/.test(n)).sort().join() : '';
  if (paks !== 'entity.pak,gamelogic.pak') fail('goh role paks ' + paks);
  if (!fs.existsSync(path.join(pm, 'localizations', 'default', 'interface', 'text', 'g.pot'))) fail('localizations/ not copied loose');
  if (pak.list(path.join(pm, 'resource', 'entity.pak')).map(e => e.name).join() !== 'entity/tank/t.def') fail('entity.pak entry name');
  // mount the package as a GoH mod (made-up GoH install): pak entries land at resource/, text at the cloned text dir
  const game = path.join(tmp, 'goh');
  put(path.join(game, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
  put(path.join(game, 'resource', 'set', 'base.set'), '{b}\r\n');
  fs.cpSync(pm, path.join(game, 'mods', 'gmod'), { recursive: true });
  const v = build({ gameDir: game, mods: ['gmod'], exe: 'goh', gameVersion: '1.067' });
  if (!v.mods.includes('gmod')) fail('packaged mod not mounted: ' + JSON.stringify(v.problems.slice(0, 3)));
  const w = v.files.get('resource/entity/tank/t.def');
  if (!w || w.source !== 'pak' || w.layer !== 'gmod') fail('pak entry not at resource/entity/tank/t.def: ' + JSON.stringify(w && { s: w.source, l: w.layer }));
  if (!v.files.get('resource/interface/text/g.pot')) fail('mod text not mounted from localizations/default/');
  // --exe goh = --goh; --exe mowas_2 = the AS2 form (guard runs and refuses)
  const r2 = cp.spawnSync('node', [P, mod, '--exe', 'goh', '-q'], { encoding: 'utf8' });
  if (r2.status !== 0 || !/WARN_PACK_GOH_UNREAD/.test(r2.stdout)) fail('--exe goh not the GoH branch');
  const r3 = cp.spawnSync('node', [P, mod, '--exe', 'mowas2', '-q'], { encoding: 'utf8' });
  if (/WARN_PACK_GOH_UNREAD/.test(r3.stdout)) fail('--exe mowas2 ran GoH checks');
  if (cp.spawnSync('node', [P, mod, '--exe', 'bogus'], { encoding: 'utf8' }).status !== 2) fail('bad --exe accepted');
  // folder name GoH skips (GHVFS-27)
  const dash = path.join(tmp, 'src', 'my-mod');
  put(path.join(dash, 'mod.info'), '{mod\r\n\t{name "d"}\r\n}\r\n'); put(path.join(dash, 'resource', 'set', 'a.set'), '{a 1}\r\n');
  const r4 = cp.spawnSync('node', [P, dash, '--goh', '--package', '-q'], { encoding: 'utf8' });
  if (!/WARN_PACK_GOH_NAME/.test(r4.stdout)) fail('dash name not flagged');
  const r5 = cp.spawnSync('node', [P, dash, '--package', '-q'], { encoding: 'utf8' });
  if (/WARN_PACK_GOH/.test(r5.stdout)) fail('AS2 run gave GoH warnings');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (!bad) console.log('goh ok');
process.exit(bad ? 1 : 0);

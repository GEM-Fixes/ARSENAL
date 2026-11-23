// T-PORTINC seeded test: an entity .ext includes a.inc which includes b.inc (both pulled); a shadowed props file's relative include of an as64-owned file
// is made absolute; a missing include gets a named WARN. Fake trees under ../run/incl/t. node incl.js -> exit 0 on pass.
// Author: Imperator_Aug (ARSENAL, ia-fb9f8143)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '../../../../run/incl/t');
fs.rmSync(root, { recursive: true, force: true });
const w = (rel, txt) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
const g = 'goh/resource/';
w(g + 'entity/inc/u/u.def', '{game_entity\n\t(include "u.ext")\n}\n');
w(g + 'entity/inc/u/u.ext', '{game_entity\n\t(include "/properties/a.inc")\n\t(include "/properties/gone.inc")\n}\n');
w(g + 'properties/a.inc', '{game_entity\n\t(include "b.inc")\n}\n');
w(g + 'properties/b.inc', '{game_entity\n}\n');
// shadow case: as64 also has properties/shad.ext, so GoH's goes to properties/goh/; its relative include "have.inc" is as64's
w(g + 'entity/inc/s/s.def', '{game_entity\n\t(include "/properties/shad.ext")\n}\n');
w(g + 'properties/shad.ext', '{game_entity\n\t(include "have.inc")\n\t(include "nowhere.inc")\n}\n');
w(g + 'properties/have.inc', '{game_entity\n}\n');
w('as2/resource/properties/shad.ext', '{game_entity\n}\n');
w('as2/resource/properties/have.inc', '{game_entity\n}\n');
w('as2/resource/entity/dummy/dummy.def', '{game_entity}\n');

const r = cp.spawnSync('node', [path.join(__dirname, '..', 'goh2as2.js'), '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--entity', 'u', '--entity', 's', '--out', path.join(root, 'out'), '--no-keylint', '--no-rc'], { encoding: 'utf8' });
const so = r.stdout + r.stderr, out = k => path.join(root, 'out/resource', k);
let ok = true; const fail = m => { console.log('FAIL incl: ' + m); ok = false; };
for (const k of ['properties/a.inc', 'properties/b.inc']) if (!fs.existsSync(out(k))) fail('chain not pulled: ' + k);
const sh = out('properties/goh/shad.ext');
if (!fs.existsSync(sh)) fail('shadowed file not written');
else {
  const t = fs.readFileSync(sh, 'latin1');
  if (!/"\/properties\/(goh\/)?have\.inc"/.test(t)) fail('relative include not made absolute: ' + JSON.stringify(t));
  if (!fs.existsSync(out('properties/goh/have.inc')) && !/"\/properties\/have\.inc"/.test(t)) fail('include names a file that is neither written nor as64\'s');
}
// cap: --max-files 2 must say so
const rc = cp.spawnSync('node', [path.join(__dirname, '..', 'goh2as2.js'), '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--entity', 'u', '--max-files', '2', '--out', path.join(root, 'outc'), '--no-keylint', '--no-rc'], { encoding: 'utf8' });
if (!/WARN_PORT_CLOSURE_CAP/.test(rc.stdout + rc.stderr)) fail('closure cap hit without WARN_PORT_CLOSURE_CAP');
if (!/WARN_PORT_INCLUDE_MISSING.*nowhere\.inc/.test(so)) fail('missing include (shadowed file) not warned by name');
if (!/gone\.inc/.test(so)) fail('missing include gone.inc not named in any line');
console.log(ok ? 'PASS incl' : 'FAIL incl\n' + so.slice(0, 3000));
process.exit(ok ? 0 : 1);

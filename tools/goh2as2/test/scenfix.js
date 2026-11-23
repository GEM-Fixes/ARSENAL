// SCEN-FIX seeded test: place children (child + grandchild, missing child, cycle), stamp Sprite sibling (+ gate: a unit's Sprite is not followed), GoH-form light.inc.
// Fake GoH tree, vanilla stub and output all under ../run/scenfix/t (never a game folder). node scenfix.js -> exit 0 on pass.
// Author: Imperator_Aug (ARSENAL, ia-14dfb11f)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '../../../../run/scenfix/t');
fs.rmSync(root, { recursive: true, force: true });
const w = (rel, txt) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
const g = 'goh/resource/';
w(g + 'entity/construction/b/bldg/bldg.def', '{game_entity\n\t(include "/properties/light.inc")\n\t{extender "structure"\n\t\t{place "s1" "parta"}\n\t\t{place "s2" "ghost"}\n\t}\n}\n');
w(g + 'entity/construction/b/parta/parta.def', '{game_entity\n\t{extender "structure"\n\t\t{place "s1" "partb"}\n\t}\n}\n');
w(g + 'entity/construction/b/partb/partb.def', '{game_entity\n\t{extension "partb.mdl"}\n}\n');
w(g + 'entity/construction/b/partb/partb.mdl', '{mdl\n;\t{VolumeView "gone.ply"}\n}\n');
w(g + 'entity/service/flag/flag.def', '{entity\n\t{DecalView {Sprite "flag.ebm"}}\n}\n');
w(g + 'entity/service/flag/flag.ebm', '{bitmap}\n');
w(g + 'entity/construction/c/cyc1/cyc1.def', '{game_entity\n\t{extender "structure"\n\t\t{place "s" "cyc2"}\n\t}\n}\n');
w(g + 'entity/construction/c/cyc2/cyc2.def', '{game_entity\n\t{extender "structure"\n\t\t{place "s" "cyc1"}\n\t}\n}\n');
w(g + 'entity/landscape/stamp/road/road1.def', '{entity\n\t{DecalView\n\t\t{Sprite "road1.mtl"\n\t\t\t{Scale 0.14}\n\t\t}\n\t}\n}\n');
w(g + 'entity/landscape/stamp/road/road1.mtl', '{material\n\t{diffuse "/texture/stamp/road1_d"}\n}\n');
w(g + 'texture/stamp/road1_d.dds', Buffer.alloc(128));
w(g + 'entity/flora/bush/b2/b2.def', '{game_entity\n\t{extension "b2.mdl"}\n}\n');
w(g + 'entity/flora/bush/b2/b2.mdl', '{Skeleton\n\t{bone "e"\n\t\t{LODView\n\t\t\t{SpriteView\n\t\t\t\t{Sprite "lod3.mtl" {Scale 0.3}}\n\t\t\t}\n\t\t}\n\t}\n}\n');   // MAPFILL: Sprite inside an mdl LOD
w(g + 'entity/flora/bush/b2/lod3.mtl', '{material\n\t{diffuse "lod3_d"}\n}\n');
w(g + 'entity/flora/bush/b2/lod3_d.dds', Buffer.alloc(128));
w(g + 'entity/unit/u/u.def', '{game_entity\n\t{DecalView\n\t\t{Sprite "usel.ebm"}\n\t}\n}\n');
w(g + 'entity/unit/u/usel.ebm', '{bitmap}\n');
w(g + 'properties/light.inc', '{Extender "light"\n\t{preset "default"\n\t\t{light_fx "light_post"}\n\t\t{light_bone "lamp_light_point1"}\n\t}\n}\n');
w('as2/resource/entity/dummy/dummy.def', '{game_entity}\n');
w('keys.txt', ['entity/construction/b/bldg/bldg.def', 'entity/construction/c/cyc1/cyc1.def', 'entity/landscape/stamp/road/road1.def', 'entity/unit/u/u.def', 'entity/service/flag/flag.def', 'entity/flora/bush/b2/b2.def'].join('\n') + '\n');

const r = cp.spawnSync('node', [path.join(__dirname, '..', 'goh2as2.js'), '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--keys', path.join(root, 'keys.txt'), '--deps', '--out', path.join(root, 'out'), '--no-keylint', '--no-rc'], { encoding: 'utf8' });
const so = r.stdout + r.stderr, out = k => path.join(root, 'out/resource', k);
let ok = true; const fail = m => { console.log('FAIL scenfix: ' + m); ok = false; };
for (const k of ['entity/construction/b/parta/parta.def', 'entity/construction/b/partb/partb.def', 'entity/construction/b/partb/partb.mdl']) if (!fs.existsSync(out(k))) fail('place child/grandchild not pulled: ' + k);
if (!/bldg\.def: WARN_PORT_PLACE_MISSING .*"ghost"/.test(so)) fail('missing place child "ghost" not warned');
if (/PLACE_MISSING.*"(parta|partb|cyc1|cyc2)"/.test(so)) fail('a present child was reported missing');
for (const k of ['entity/construction/c/cyc1/cyc1.def', 'entity/construction/c/cyc2/cyc2.def']) if (!fs.existsSync(out(k))) fail('cycle member missing: ' + k);
if (r.status !== 0 && r.status !== 1) fail('cycle did not terminate cleanly, status ' + r.status);
for (const k of ['entity/landscape/stamp/road/road1.mtl', 'texture/stamp/road1_d.dds']) if (!fs.existsSync(out(k))) fail('Sprite sibling closure not pulled: ' + k);
for (const k of ['entity/flora/bush/b2/lod3.mtl', 'entity/flora/bush/b2/lod3_d.dds']) if (!fs.existsSync(out(k))) fail('mdl SpriteView Sprite not pulled: ' + k);
if (!fs.existsSync(out('entity/service/flag/flag.ebm'))) fail('service decal Sprite not pulled');
if (/gone\.ply/.test(so)) fail('a name in a ; comment line was reported as a closure hole');
if (fs.existsSync(out('entity/unit/u/usel.ebm'))) fail('a unit def Sprite was followed (gate is entity/landscape and entity/flora only)');
const li = out('properties/light.inc');
if (!fs.existsSync(li)) fail('light.inc not written');
else {
  const t = fs.readFileSync(li, 'latin1');
  if (t !== '{Extender "light"\r\n}\r\n') fail('light.inc not the empty extender: ' + JSON.stringify(t));
  if (/preset|light_fx/.test(t)) fail('light.inc still GoH form');
}
if ((so.match(/WARN_PORT_LIGHT_EMPTIED/g) || []).length !== 1 || !/properties\/light\.inc: WARN_PORT_LIGHT_EMPTIED/.test(so)) fail('expected exactly one WARN_PORT_LIGHT_EMPTIED naming properties/light.inc');
for (const f of fs.readdirSync(path.join(root, 'out/resource/entity/construction/b/parta'))) { const b = fs.readFileSync(path.join(root, 'out/resource/entity/construction/b/parta', f)); if (/\r?\n/.test(b.toString('latin1')) && /[^\r]\n/.test(b.toString('latin1'))) fail('LF-only text in ' + f); }
console.log(ok ? 'PASS scenfix' : 'FAIL scenfix\n' + so.slice(0, 3000));
process.exit(ok ? 0 : 1);

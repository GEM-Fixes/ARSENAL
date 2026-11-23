// runs clone-entity scenarios on fixture/game, asserts file contents, prints "scenario CODE" lines (diffed with truth.md by run.sh)
// Author: Imperator_Aug (ARSENAL, ia-3e4dfbf2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'game'), tool = path.join(__dirname, '..', 'clone-entity.js');
let bad = 0;
const fail = m => { console.log('ASSERT FAIL: ' + m); bad++; };
const rd = f => fs.existsSync(f) ? fs.readFileSync(f).toString('latin1') : null;
function run(name, args, want) {
  const r = cp.spawnSync(process.execPath, [tool, '--game', fx, '--no-cache', ...args], { encoding: 'utf8' });
  const codes = [];
  for (const l of r.stdout.split('\n')) { const m = /^(?:info: )?\S+: ([A-Z][A-Z0-9_]+) /.exec(l); if (m) codes.push(m[1]); }
  for (const c of codes) console.log(name + ' ' + c);
  if (r.status !== want) fail(`${name}: exit ${r.status}, want ${want}\n${r.stdout}${r.stderr}`);
  return r.stdout;
}
const out = n => path.join(fx, 'mods', n);
const stuff = (n, f) => rd(path.join(out(n), 'resource/set/stuff/rifle', f));

// a: ok clone + lng into mod-local #file (vanilla desc.lng untouched, LOC-01)
run('a_ok', ['--out', out('mod_a'), '--stuff', 'k98', '--tags', 'k98.mod', '--name', 'K98 "Mod"', '--set', 'healthDamage=300', '--set', 'damage=add blastwave 5'], 0);
if (stuff('mod_a', 'k98.mod') !== '{from "k98"\r\n\t{healthDamage 300}\r\n\t{damage add blastwave 5}\r\n}\r\n') fail('a stuff content: ' + JSON.stringify(stuff('mod_a', 'k98.mod')));
const l1 = rd(path.join(out('mod_a'), 'localization/#clone_entity.lng'));
if (!l1 || !l1.includes('{"desc" {"weapon" {"k98 mod" "K98 \\"Mod\\""}}}') || !/^\{tags\r\n/.test(l1) || /[^\r]\n/.test(l1)) fail('a lng: ' + JSON.stringify(l1));
if (rd(path.join(out('mod_a'), 'localization/desc.lng'))) fail('a: wrote desc.lng without mod having one');
// a2: second clone appends to the same #file, same key replaced not duplicated
run('a2_append', ['--out', out('mod_a'), '--stuff', 'k98', '--tags', 'k98.mod2', '--name', 'Two'], 0);
run('a2_append', ['--out', out('mod_a'), '--stuff', 'k98', '--tags', 'k98.mod3', '--name', 'Three'], 0);
const l2 = rd(path.join(out('mod_a'), 'localization/#clone_entity.lng'));
if (!l2 || (l2.match(/"desc"/g) || []).length !== 3 || !l2.includes('"k98 mod2" "Two"') || !l2.includes('"k98 mod3" "Three"')) fail('a2 lng: ' + JSON.stringify(l2));
// b: exact tag set exists (vanilla k98 / earlier clone)
run('b_exists', ['--out', out('mod_b'), '--stuff', 'k98', '--tags', 'k98'], 1);
run('b_exists_mod', ['--out', out('mod_a'), '--stuff', 'k98', '--tags', 'mod.k98'], 1);   // tag order does not matter: {k98,mod} exists
// c: base missing / ambiguous
run('c_missing', ['--out', out('mod_b'), '--stuff', 'nosuch', '--tags', 'x1'], 1);
run('c_ambiguous', ['--out', out('mod_b'), '--stuff', 'rifle', '--tags', 'x2'], 1);
// c2: a clone named so its file name carries the base tag would match itself in {from} (live: silent 0xC0000005 at load)
run('c_self', ['--out', out('mod_b'), '--stuff', 'k98', '--tags', 'a0.k98'], 1);
if (stuff('mod_b', 'a0.k98')) fail('c_self: wrote the self-matching clone');
// c3: {from} names the base by its file tags only: "rifle" comes from {from "pattern rifle"} and fails the file lookup (live: pattern not found)
run('c_fromtags', ['--out', out('mod_b'), '--stuff', 'rifle k98', '--tags', 'c3_k98'], 0);
if (!/^\{from "k98"\r\n/.test(stuff('mod_b', 'c3_k98') || '')) fail('c_fromtags from line: ' + JSON.stringify(stuff('mod_b', 'c3_k98')));
// d: KEY-19 re-emit + KEY-17 note
run('d_throw', ['--out', out('mod_b'), '--stuff', 'shotgun', '--tags', 'shotgun.x', '--set', 'damage=blastwave 5'], 0);
const d = stuff('mod_b', 'shotgun.x');
if (!d || !d.includes('\t{special\r\n\t\t{throw_off_always}\r\n\t}')) fail('d content: ' + d);
run('d_ancestor', ['--out', out('mod_b'), '--stuff', 'shotgun2', '--tags', 'sg2.x'], 0);
if ((stuff('mod_b', 'sg2.x') || '').includes('throw_off')) fail('d2: ancestor throw_off copied');
// e: out-dir guard
run('e_out', ['--out', path.join(fx, 'resource', 'set'), '--stuff', 'k98', '--tags', 'bad1'], 1);
run('e_out', ['--out', fx, '--stuff', 'k98', '--tags', 'bad2'], 1);
if (fs.existsSync(path.join(fx, 'resource/set/set')) || fs.existsSync(path.join(fx, 'resource/set/stuff/rifle/bad1'))) fail('e: wrote into game dir');
// f: lng append into a mod that has its own desc.lng (existing keys kept)
run('f_desc', ['--out', out('mod_desc'), '--stuff', 'k98', '--tags', 'k98.new', '--name', 'New'], 0);
const f = rd(path.join(out('mod_desc'), 'localization/desc.lng'));
if (!f || !f.includes('"mine" "Mine"') || !f.includes('{"k98 new" "New"}') || rd(path.join(out('mod_desc'), 'localization/#clone_entity.lng'))) fail('f lng: ' + JSON.stringify(f));
// g: name key already in effective (vanilla) desc.lng
run('g_keydup', ['--out', out('mod_b'), '--stuff', 'k98', '--tags', 'k98.old', '--name', 'Dup'], 0);
// h: dry-run writes nothing; --entity not implemented
run('h_dry', ['--out', out('mod_b'), '--stuff', 'k98', '--tags', 'k98.dry', '--name', 'D', '--dry-run'], 0);
if (stuff('mod_b', 'k98.dry')) fail('h: dry-run wrote');
// i: clone of a clone whose tags are a superset of an existing stuff
run('i_shadow', ['--out', out('mod_a'), '--stuff', 'k98 mod', '--tags', 'k98.mod.x'], 0);
// entity mode
const ent = (n, f) => rd(path.join(out(n), 'resource/entity/-vehicle/tank', f));
run('j_entity', ['--out', out('mod_a'), '--entity', 'tk1', '--as', 'tk3', '--name', 'Tank 3'], 0);
const j = ent('mod_a', 'tk3/tk3.def');
const jw = ['{game_entity', '\t(include "/properties/tank.ext")', '\t(include "/entity/-vehicle/tank/tk1/tk1.inc")', '\t(include "nosuch.inc")', '\t{Extension "/entity/-vehicle/tank/tk1/tk1.mdl"}', '}', ''].join('\r\n');
if (j !== jw) fail('j def: ' + JSON.stringify(j));
if (ent('mod_a', 'tk3/tk3.mdl') !== null) fail('j: copied assets without --copy-assets');
if (!(rd(path.join(out('mod_a'), 'localization/#clone_entity.lng')) || '').includes('{"entity" {"tk3" "Tank 3"}}')) fail('j lng');
run('k_copy', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk4', '--copy-assets', '--roster'], 0);
const k = ent('mod_b', 'tk4/tk4.def');
if (!k || !k.includes('{Extension "tk4.mdl"}')) fail('k def: ' + k);
for (const f of ['tk4/tk4.mdl', 'tk4/tk4.mtl', 'tk4/tk1.ply', 'tk4/tk1.dds']) if (ent('mod_b', f) === null) fail('k missing asset ' + f);
const ro = rd(path.join(out('mod_b'), 'resource/set/multiplayer/units/vehicles.set'));
if (!ro || !ro.includes('{"tk4"  ("v" c(0) s(ger))  {cost 10}}') || !ro.includes('{"tk1"') || !ro.includes('{"other"')) fail('k roster: ' + ro);
// FMT-03: the material a mesh names inside itself comes along under that same name, with its bare-name texture
run('k_mesh_mtl', ['--out', out('mod_b'), '--entity', 'tk7', '--as', 'tk8', '--copy-assets'], 0);
for (const f of ['tk8/hull.ply', 'tk8/hull_paint.mtl', 'tk8/hull_d.dds']) if (ent('mod_b', f) === null) fail('k_mesh_mtl missing asset ' + f);
run('l_exists', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk2'], 1);
run('l_exists_clone', ['--out', out('mod_a'), '--entity', 'tk1', '--as', 'tk3'], 1);
run('m_missing', ['--out', out('mod_b'), '--entity', 'nosuch', '--as', 'x'], 1);
run('n_dangling', ['--out', out('mod_b'), '--entity', 'tk2', '--as', 'tk5', '--dry-run'], 0);
run('o_dry', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk6', '--copy-assets', '--dry-run'], 0);
if (ent('mod_b', 'tk6/tk6.def')) fail('o: dry-run wrote');
run('p_out', ['--out', fx, '--entity', 'tk1', '--as', 'tk7'], 1);
// buildings: --set thickness/armor/props, --material
const bd = (n, f) => rd(path.join(out(n), 'resource/entity/construction/eu/town', f));
run('q_bld', ['--out', out('mod_a'), '--entity', 'hse1', '--as', 'hse2', '--set', 'thickness=40', '--set', 'thickness.window01=2', '--set', 'props=+burning,-construction', '--set', 'armor=armor_heavy args 1.5'], 0);
const q = bd('mod_a', 'hse2/hse2.def');
if (!q || !q.includes('{Thickness 40}') || q.includes('{Thickness 20}') || !q.includes('{Thickness hollow 40}') || !q.includes('{Thickness 2}') || !q.includes('("armor_heavy" args 1.5)') || !q.includes('{props "concrete" "burning"}')) fail('q def: ' + q);
run('q_material', ['--out', out('mod_a'), '--entity', 'hse1', '--as', 'hse3', '--material', 'wood'], 0);
const q2 = bd('mod_a', 'hse3/hse3.def');
if (!q2 || !q2.includes('{props "wood" "construction"}') || !q2.includes('("armor_house_wood")') || !q2.includes('{Thickness 20}')) fail('q2 def: ' + q2);
run('q_material_generic', ['--out', out('mod_a'), '--entity', 'wl1', '--as', 'wl2', '--material', 'concrete', '--set', 'armor.args=1.1'], 0);
const q3 = bd('mod_a', 'wl2/wl2.def');
if (!q3 || !q3.includes('{props "concrete" "construction"}') || !q3.includes('("armor_medium" args 1.1)')) fail('q3 def: ' + q3);
run('q_bad_vol', ['--out', out('mod_b'), '--entity', 'hse1', '--as', 'hse4', '--set', 'thickness.nosuch=3'], 1);
run('q_bad_key', ['--out', out('mod_b'), '--entity', 'hse1', '--as', 'hse5', '--set', 'color=red'], 1);
run('q_bad_args', ['--out', out('mod_b'), '--entity', 'hse1', '--as', 'hse6', '--set', 'armor.args=2'], 1);
if (bd('mod_b', 'hse4/hse4.def') || bd('mod_b', 'hse5/hse5.def')) fail('q: wrote on bad set');
// donor route: --model-from keeps the donor def, places the (made-up) GoH model files under the clone
const goh = path.join(fx, '..', 'goh');
run('r_donor', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk9', '--goh', goh, '--model-from', 'gx1'], 0);
const r1 = ent('mod_b', 'tk9/tk9.def');
if (r1 !== ['{game_entity', '\t(include "/properties/tank.ext")', '\t(include "/entity/-vehicle/tank/tk1/tk1.inc")', '\t(include "nosuch.inc")', '\t{Extension "tk9.mdl"}', '}', ''].join('\r\n')) fail('r def: ' + JSON.stringify(r1));
for (const f of ['tk9/tk9.mdl', 'tk9/tk9.mtl', 'tk9/gx1_d.dds', 'tk9/gx1_hull.ply', 'tk9/gx1_paint.mtl', 'tk9/gx1_p.dds', 'tk9/gx1.vol', 'tk9/gx1_fire.anm', 'tk9/gx1_move.anm']) if (ent('mod_b', f) === null) fail('r missing asset ' + f);
if (ent('mod_b', 'tk9/tk1.ply') !== null || ent('mod_b', 'tk9/gone.anm') !== null) fail('r: donor model or absent anm placed');
const rm = ent('mod_b', 'tk9/tk9.mdl');
if (!rm || !rm.includes('{turret 1}') || rm.includes('##')) fail('r mdl {##tag not converted: ' + rm);
// PORTREV2 #15: rooted texture names checked against AS2, GoH-only one copied at its key, missing one + $/ one warned (seeded: /texture/common/gone_s)
run('r_rooted', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk15', '--goh', goh, '--model-from', 'gx3'], 0);
if (rd(path.join(out('mod_b'), 'resource/texture/goh/only_n.dds')) === null) fail('r_rooted: GoH-only rooted texture not copied');
if (rd(path.join(out('mod_b'), 'resource/entity/-vehicle/tank/tk1/tk1.dds')) !== null) fail('r_rooted: AS2-held rooted texture copied (shadows vanilla)');
// FIX-PORT (tools-mod:29): Workshop --goh: ply/vol/anm only in the base -vehicle.pak are read (base found from the workshop path), $/ texture copied
const ws = path.join(fx, '..', 'steam', 'workshop', 'content', '400750', '111'), gb = path.join(fx, '..', 'steam', 'common', 'Call to Arms - Gates of Hell');
run('r_pak', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk16', '--goh', ws, '--model-from', 'gw1'], 0);
for (const f of ['tk16/gw1_body.ply', 'tk16/gw1.vol', 'tk16/gw1_start.anm']) if (ent('mod_b', f) === null) fail('r_pak: base pak file not placed ' + f);
if (ent('mod_b', 'tk16/gw1_start.anm') !== 'ANM') fail('r_pak: anm bytes');
if (rd(path.join(out('mod_b'), 'resource/texture/common/_v/gw1_c.dds')) === null) fail('r_pak: $/ texture not copied to texture/common');
// explicit --goh-base on a copy of the item outside steam (no auto base); and without it the warn names --goh-base
const wsCopy = path.join(fx, '..', 'wscopy'); fs.cpSync(ws, wsCopy, { recursive: true });
run('r_pakbase', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk17', '--goh', wsCopy, '--goh-base', gb, '--model-from', 'gw1'], 0);
if (ent('mod_b', 'tk17/gw1_start.anm') === null) fail('r_pakbase: --goh-base not read');
const nb = run('r_nobase', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk18', '--goh', wsCopy, '--model-from', 'gw1'], 0);
if (!/pass --goh-base/.test(nb)) fail('r_nobase: missing-file warn does not name --goh-base');
// same by entity dir; dir with two mdl; unknown stem; no --goh; --out inside the GoH tree
run('r_dir', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk10', '--goh', goh, '--model-from', 'entity/-vehicle/ussr/tank/gx1', '--dry-run'], 0);
run('r_ambig', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk11', '--goh', goh, '--model-from', 'entity/-vehicle/ussr/tank/gx2'], 1);
run('r_missing', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk12', '--goh', goh, '--model-from', 'nosuch'], 1);
run('r_nogoh', ['--out', out('mod_b'), '--entity', 'tk1', '--as', 'tk13', '--model-from', 'gx1'], 1);
run('r_inside', ['--out', path.join(goh, 'mods', 'm'), '--entity', 'tk1', '--as', 'tk14', '--goh', goh, '--model-from', 'gx1'], 1);
if (ent('mod_b', 'tk11/tk11.def') || ent('mod_b', 'tk12/tk12.def') || ent('mod_b', 'tk13/tk13.def') || ent('mod_b', 'tk10/tk10.def')) fail('r: wrote on error/dry-run');
if (fs.existsSync(path.join(goh, 'mods'))) fail('r_inside wrote into the GoH tree');
// CHAIN-N4: a new mod that Requires a clone mod with #clone_entity.lng gets #clone_<mod>.lng (same name would shadow the dep's names)
fs.mkdirSync(path.join(out('mod_dep'), 'localization'), { recursive: true });
fs.writeFileSync(path.join(out('mod_dep'), 'mod.info'), '{Mod\r\n\t{Name "dep"}\r\n\t{MinGameVersion "3.262"}\r\n\t{MaxGameVersion "3.262"}\r\n}\r\n');
fs.writeFileSync(path.join(out('mod_dep'), 'localization/#clone_entity.lng'), '{tags\r\n}\r\n');
run('lr_renamed', ['--out', out('mod_lr'), '--mods', 'mod_dep', '--stuff', 'k98', '--tags', 'k98.lr', '--name', 'LR'], 0);
if (rd(path.join(out('mod_lr'), 'localization/#clone_entity.lng')) || !(rd(path.join(out('mod_lr'), 'localization/#clone_mod_lr.lng')) || '').includes('"k98 lr" "LR"')) fail('lr: names not in #clone_mod_lr.lng');
run('lr_nodep', ['--out', out('mod_lr2'), '--stuff', 'k98', '--tags', 'k98.lr2', '--name', 'LR2'], 0);
if (!rd(path.join(out('mod_lr2'), 'localization/#clone_entity.lng'))) fail('lr_nodep: no --mods dep keeps #clone_entity.lng');
const e = cp.spawnSync(process.execPath, [tool, '--entity', 'tk1'], { encoding: 'utf8' });
if (e.status !== 2 || !/usage/.test(e.stderr)) fail('--entity without --as usage error');
process.exit(bad ? 1 : 0);

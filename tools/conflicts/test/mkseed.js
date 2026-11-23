// conflicts seed: one made-up game with mods that clash in every kind the tool knows (and the kinds it must stay quiet on).
//   node mkseed.js [out dir]   default: test/seed (rebuilt each run). Game = <out>/game, mods sa sb (the pair), sd se sf sg (one defect each).
// truth: seed-truth.md (codes per file, diffed by run.sh). Text data CRLF.
// Author: Imperator_Aug (ARSENAL, ia-d42d68df)
const fs = require('fs'), path = require('path');
const { zip } = require('../../lib/zipwrite');
const dir = path.resolve(process.argv[2] || path.join(__dirname, 'seed'));
if (!/seed|arsenal-tmp/i.test(dir)) { console.error('mkseed: refuse to rebuild ' + dir + ' (name must hold "seed")'); process.exit(2); }
require('../../lib/testscratch').guard(dir);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(dir, { recursive: true, force: true });
const crlf = l => (Array.isArray(l) ? l.join('\r\n') + '\r\n' : l);
function put(rel, lines, enc) {
  const f = path.join(dir, 'game', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.isBuffer(lines) ? lines : Buffer.from(crlf(lines), enc || 'latin1'));
}
const info = (n, extra) => ['{mod', ` {Name "${n}"}`, ' {MinGameVersion "3.0"}', ' {MaxGameVersion "3.999"}'].concat(extra || [], ['}']);
put('mods/sa/mod.info', info('sa'));
put('mods/sb/mod.info', info('sb'));

// 1. same file, loose in sa, inside a pak in sb -> same clash as two loose files (WARN_CONFLICT_MOD_MOD on hp)
put('resource/set/s1.def', ['{e', ' {hp 10}', '}']);
put('mods/sa/resource/set/s1.def', ['{e', ' {hp 20}', '}']);
put('mods/sb/resource/pk.pak', zip([['set/s1.def', Buffer.from(crlf(['{e', ' {hp 30}', '}']), 'latin1')]]));

// 2. same .lng file in both mods: sa_only is lost (CONFLICT_LNG_KEY_LOST), shared differs (CONFLICT_LNG_KEY_DIFF), same stays quiet
put('resource/interface/text/desc.lng', ['{tags', ' {"van" "Vanilla text"}', '}'], 'utf8');
put('mods/sa/localization/desc.lng', ['{tags', ' {"van" "Vanilla text"}', ' {"sa_only" "Only in sa"}', ' {"shared" "Text of sa"}', ' {"same" "Same text"}', '}'], 'utf8');
put('mods/sb/localization/desc.lng', ['{tags', ' {"van" "Vanilla text"}', ' {"sb_only" "Only in sb"}', ' {"shared" "Text of sb"}', ' {"same" "Same text"}', '}'], 'utf8');
// 2b. same key in two differently named '#' files (LOC-04): later file wins -> CONFLICT_LNG_KEY_CROSS; gun_same has the same text: quiet
put('mods/sa/localization/#sa.lng', ['{tags', ' {"gun_x" "Gun of sa"}', ' {"gun_same" "One gun"}', '}'], 'utf8');
put('mods/sb/localization/#sb.lng', ['{tags', ' {"gun_x" "Gun of sb"}', ' {"gun_same" "One gun"}', '}'], 'utf8');

// 3. both mods add a card to the same .set (nested entry): sa's card is lost (CONFLICT_ENTRY_LOST)
const units = extra => ['{units', ' {side "ger"', '  {card "van_card" {cost 10}}'].concat(extra, [' }', '}']);
put('resource/set/multiplayer/units/units.set', units([]));
put('mods/sa/resource/set/multiplayer/units/units.set', units(['  {card "sa_card" {cost 111}}']));
put('mods/sb/resource/set/multiplayer/units/units.set', units(['  {card "sb_card" {cost 222}}']));

// 4. shared include: sa adds a macro, sb's copy of the file lacks it and changes another (CONFLICT_MACRO_LOST, CONFLICT_MACRO_DIFF)
put('resource/set/shared.inc', ['(define "van_m" {x 1})']);
put('mods/sa/resource/set/shared.inc', ['(define "van_m" {x 1})', '(define "armor_front" {thickness 50})', '(define "both_m" {y 1})']);
put('mods/sb/resource/set/shared.inc', ['(define "van_m" {x 1})', '(define "both_m" {y 2})']);
// 4b. same macro name in two different files: no clash by itself (a macro lives in the file chain that includes it) -> quiet
put('mods/sa/resource/set/sa_defs.inc', ['(define "tank_hp" {hp 1})']);
put('mods/sb/resource/set/sb_defs.inc', ['(define "tank_hp" {hp 2})']);

// 5. same entity name in different folders (ENG-04): mod vs mod, and mod vs vanilla -> CONFLICT_ENTITY_NAME_DUP
put('resource/entity/x/tank/tank.def', ['{entity', ' {extension "tank.mdl"}', '}']);
put('mods/sa/resource/entity/a/foo/foo.def', ['{entity', ' {extension "foo.mdl"}', '}']);
put('mods/sb/resource/entity/b/foo/foo.def', ['{entity', ' {extension "foo.mdl"}', ' {mass 9}', '}']);
put('mods/sb/resource/entity/y/tank/tank.def', ['{entity', ' {extension "tank.mdl"}', ' {mass 5}', '}']);

// 6. mod.info: sd needs a mod that is not in the list (CONFLICT_MOD_NOT_LOADED); sf deletes a file sa ships (CONFLICT_FILE_DELETED)
put('mods/sd/mod.info', info('sd', [' {Require "nosuchmod"}']));
put('mods/sd/resource/set/sd.def', ['{e {hp 1}}']);
put('mods/sa/resource/set/gone.def', ['{e {hp 1}}']);
put('mods/sf/mod.info', info('sf', [' {Delete "resource/set/gone.def"}']));

// 7. texture: sa ships t1.dds, sb ships t1.tga -> the .tga is read whatever the order (FMT-04): CONFLICT_TEX_EXT_SHADOW
put('mods/sa/resource/texture/common/t1.dds', Buffer.from('DDS sa'));
put('mods/sb/resource/texture/common/t1.tga', Buffer.from('TGA sb'));
// 7b. the other way round: the EARLIER mod's .tga beats the later mod's .dds -> warn (the later mod does not win here)
put('mods/sa/resource/texture/common/t2.tga', Buffer.from('TGA sa'));
put('mods/sb/resource/texture/common/t2.dds', Buffer.from('DDS sb'));

// 8. not a text file in both mods (WARN_CONFLICT_OPAQUE_MOD_MOD)
put('mods/sa/resource/script/x.lua', ['-- sa']);
put('mods/sb/resource/script/x.lua', ['-- sb']);

// 9. a text data type the old list did not read by key (.mdl): one key differs (WARN_CONFLICT_MOD_MOD)
put('resource/entity/x/tank/tank.mdl', ['{skeleton', ' {bone "body" {mass 1}}', '}']);
put('mods/sa/resource/entity/x/tank/tank.mdl', ['{skeleton', ' {bone "body" {mass 2}}', '}']);
put('mods/sb/resource/entity/x/tank/tank.mdl', ['{skeleton', ' {bone "body" {mass 3}}', '}']);

// 10. one mod holds a file loose and in its own nested pak (VFS-08/55): CONFLICT_PAK_LOOSE_SAME_MOD (info)
put('mods/sg/mod.info', info('sg'));
put('mods/sg/resource/set/dup.def', ['{e {hp 1}}']);
put('mods/sg/resource/zz.pak', zip([['set/dup.def', Buffer.from(crlf(['{e {hp 2}}']), 'latin1')]]));

// 11. whole-file replace drops a top-level entry (CONFLICT_FILE_SHADOW, as before)
put('resource/set/c.def', ['{e3 {k 1}}']);
put('mods/sa/resource/set/c.def', ['{e3 {k 1}}', '{e3b {z 1}}']);
put('mods/sb/resource/set/c.def', ['{e3 {k 1}}']);
// ---- joint view (--joint), mods ja jb jc: what one mod breaks for another. Not in the sa..sg list, so the lines above stand.
put('mods/ja/mod.info', info('ja'));
put('mods/jb/mod.info', info('jb', [' {Require "ja"}', ' {Delete "resource/entity/j/jcar/jcar.def"}']));
put('mods/jc/mod.info', info('jc', [' {Require "jb"}']));
// 12. a name lost from a shared file: ja adds the macro ja_armor and the entry "ja_gun" to stuff.inc, jb's copy holds neither;
//     ja's own use.def names both -> CONFLICT_JOINT_REF (macro, entry). "ja_quiet" is lost too but named nowhere: no line
put('resource/set/j/stuff.inc', ['(define "van_j" {x 1})', '{gun "van_gun" {dmg 1}}']);
put('mods/ja/resource/set/j/stuff.inc', ['(define "van_j" {x 1})', '(define "ja_armor" {thickness 50})', '(define "ja_quiet" {q 1})', '{gun "van_gun" {dmg 1}}', '{gun "ja_gun" {dmg 7}}']);
put('mods/jb/resource/set/j/stuff.inc', ['(define "van_j" {x 2})', '{gun "van_gun" {dmg 1}}']);
put('mods/ja/resource/set/j/use.def', ['{unit', ' ("ja_armor")', ' {weapon "ja_gun"}', ' {crew "jcar"}', ' ; {weapon "ja_gun"} a comment line does not count', '}']);
// 13. a file another mod removes: jb's mod.info deletes ja's entity jcar, ja's use.def names it -> CONFLICT_JOINT_REF (entity)
put('mods/ja/resource/entity/j/jcar/jcar.def', ['{entity', ' {extension "jcar.mdl"}', '}']);
// 14. a clash file that stops reading: ja and jb both hold top.def, jb's is read and includes jinc.inc for the macro jb_m; with jb
//     alone that is jb's jinc.inc, with jc loaded it is jc's, which lacks the macro -> CONFLICT_JOINT_PARSE on top.def
put('resource/set/j/top.def', ['{top {k 1}}']);
put('mods/ja/resource/set/j/top.def', ['{top {k 2}}']);
put('mods/jb/resource/set/j/top.def', ['(include "jinc.inc")', '{top {k 3}', ' ("jb_m")', '}']);
put('mods/jb/resource/set/j/jinc.inc', ['(define "jb_m" {y 1})']);
put('mods/jc/resource/set/j/jinc.inc', ['(define "jc_other" {y 2})']);
// 15. notes: jc brings a shader file and a mission with its own mod/ folder -> info CONFLICT_SHADER_SET, CONFLICT_MISSION_MOD
put('mods/jc/resource/shader/j.fx', ['// shader of jc']);
put('mods/jc/resource/map/single/jm/mod/resource/set/q.def', ['{q {k 1}}']);
console.log('seed: ' + dir);

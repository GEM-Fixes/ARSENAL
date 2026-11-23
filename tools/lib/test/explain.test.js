// explain: every code the front-door tools emit has a plain-words entry; seeded unknown code gets the honest fallback. node explain.test.js
// Author: Imperator_Aug (ARSENAL, ia-d252ca11)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const x = require('../explain');
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };

t('every emitted code has an entry', () => {
  const codes = [...x.collect()];
  assert.ok(codes.length > 300, 'scan found only ' + codes.length + ' codes');
  const miss = codes.filter(c => !x.explain(c).known);
  assert.deepEqual(miss, [], 'codes without an entry (add to S or a family in lib/explain.js): ' + miss.join(' '));
});
t('card shape', () => {
  for (const c of x.collect()) {
    const e = x.explain(c);
    assert.ok(e.what && e.why && e.impact && Array.isArray(e.fix) && e.fix.length, c + ' card incomplete');
    assert.ok(/^\[[VIT]\]$/.test(e.tag), c + ' tag ' + e.tag);
    assert.ok(!/%[ct]/.test(e.what + e.why + e.fix.join('')), c + ' unreplaced %');
  }
});
t('seeded: unknown code falls back honestly', () => {
  const e = x.explain('ZZ_SEEDED_NOT_A_CODE');
  assert.equal(e.known, false); assert.equal(e.tag, '[I]'); assert.equal(e.auto, null);
  assert.match(e.what, /no plain-words entry/); assert.match(e.fix.join(' '), /q\.js -k ZZ_SEEDED_NOT_A_CODE/);
});
t('seeded: a new code in a scanned tool source is collected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explain-'));
  fs.mkdirSync(path.join(root, 'sdllint'));
  fs.writeFileSync(path.join(root, 'sdllint', 'sdllint.js'), "rep.add(f, 1, 'ZZ_SEEDED_CODE', 'x'); const n = 'WARN_X';\r\n");
  const got = x.collect(root);
  fs.rmSync(root, { recursive: true, force: true });
  assert.ok(got.has('ZZ_SEEDED_CODE')); assert.ok(!got.has('WARN_X'), 'NOT_CODES filtered');
  assert.equal(x.explain('ZZ_SEEDED_CODE').known, false);
});
t('fixable codes map to fix --only kinds', () => {
  for (const [c, k] of Object.entries(x.AUTO)) { const e = x.explain(c); assert.equal(e.auto, k); assert.ok(x.FIXERS[k], k); assert.equal(e.safe, x.FIXERS[k].safe); }
  assert.equal(x.explain('PLY_MTL_MISSING').safe, false, 'stubmtl changes visuals: not safe');
  assert.equal(x.explain('INCLUDE_MISSING').severity, 'crash');
  assert.equal(x.explain('UNKNOWN_KEY').auto, null);
});
t('where from finding', () => {
  assert.equal(x.explain('DUP_KEY', { file: 'set/a.def', line: 12 }).where, 'set/a.def:12');
  assert.equal(x.explain('DUP_KEY', { samples: [{ file: 'b.def', line: 3 }] }).where, 'b.def:3');
  assert.equal(x.explain('DUP_KEY', { first: 'c.def:4 | dir' }).where, 'c.def:4');
  assert.equal(x.explain('DUP_KEY').where, '');
});
t('limits ids from limits/*.md chk cells', () => {
  const ids = x.limitsFor('INCLUDE_MISSING');
  if (fs.existsSync(path.join(__dirname, '..', '..', '..', 'limits'))) assert.ok(ids.includes('SDL-23'), 'SDL-23 not found: ' + ids);
});
t('GX-help: listed codes have real cards (not the family/generic text)', () => {
  const L = 'VER_MISSING VER_RANGE VER_ORDER REQ_MISSING WARN_MOD_MODERN WARN_REQ_BUILTIN DELETE_PREFIX WARN_NOT_MOD NOT_MOUNTED LOADS_STATIC FIX_REFCHECK_FAILED FIX_REPOINT_AMBIGUOUS FIX_OUT_REFUSED GEN_ROSTER_REPLACES NOT_IN_MODS GEN_ARMOR_ARG_MISSING PATCH_KEY_MISSING CLONE_BASE_MISSING MAPCLONE_NO_MAP PORT_BINARY_COPY WARN_PORT_CREW_CAPPED WARN_PORT_WEAPON_SWAPPED WARN_PORT_ARMOUR BOT_ARMY_MISMATCH'.split(' ');
  for (const c of L) { const e = x.explain(c); assert.ok(e.known, c); assert.ok(!/\(%?[A-Z_]{4,}\)\.$/.test(e.what) && !/no plain-words/.test(e.what), c + ' still generic: ' + e.what); }
  const v = x.explain('VER_MISSING');
  assert.notEqual(v.severity, 'crash'); assert.match(v.impact, /does not crash/); assert.match(v.fix.join(' '), /MinGameVersion "3\.262"/);
});
t('GEN-FIX3: new gen / bots codes have real cards', () => {
  const L = 'GEN_TEXT_VANILLA_FILE GEN_PRESET_KEY_ADDED GEN_PRESET_KEY_UNKNOWN GEN_CARD_EDIT GEN_CARD_EXPANDED GEN_CARD_TAGS_BAD GEN_CARD_FLAG_BAD GEN_CARD_NO_TAGS GEN_CARD_TAG_ABSENT WARN_GEN_CARD_FLAG_ABSENT GEN_CARD_FLAG_SET GEN_CARD_INFO_SOLDIER GEN_CARD_NOT_SDL GEN_SQUAD_CHANGE_UNKNOWN GEN_SQUAD_MEMBER_ABSENT GEN_KIT_COUNT_SAME GEN_ARMY_BOTS GEN_ARMY_BOTS_THERE WARN_GEN_ARMY_BOTS_PART BOT_EXTRA_LINE_MISSING'.split(' ');
  for (const c of L) { const e = x.explain(c); assert.ok(e.known, c); assert.ok(!/\(%?[A-Z_]{4,}\)\.$/.test(e.what) && !/no plain-words/.test(e.what), c + ' still generic: ' + e.what); }
  assert.match(x.explain('GEN_TEXT_VANILLA_FILE').what, /mod copy/);
});
t('GEN-FIX4: sound keys and patch-entity codes have real cards', () => {
  const L = 'GEN_SOUND_MONO GEN_VOICE_MONO GEN_SOUNDCLASS_PERCENT WARN_GEN_SOUNDCLASS_PERCENT_SUM GEN_VOICE_LOUDNESS GEN_VOICE_LOUDNESS_UNKNOWN PATCH_ADD_BLOCK PATCH_VALUE_FIRST_ONLY'.split(' ');
  for (const c of L) { const e = x.explain(c); assert.ok(e.known, c); assert.ok(!/\(%?[A-Z_]{4,}\)\.$/.test(e.what) && !/no plain-words/.test(e.what), c + ' still generic: ' + e.what); }
  assert.match(x.explain('PATCH_VALUE_FIRST_ONLY').fix.join(' '), /#\*/);
});
t('GX-help: family routing fixed (PORT not text, PATCH not map), GEN/XLATE have cards', () => {
  assert.match(x.explain('WARN_PORT_VISION_KEY').what, /Gates of Hell/);
  assert.doesNotMatch(x.explain('PATCH_FULL_COPY').what, /map data/);
  assert.match(x.explain('GEN_SQUAD_ARGS').what, /incomplete/);
  assert.match(x.explain('GEN_SET_ENTITY_UNKNOWN').what, /not found/);
  assert.match(x.explain('XLATE_WRITE').what, /translation/);
  assert.match(x.explain('LNG_NOT_UTF8').what, /UTF-8/);
});
t('game parity: fix codes FIX_MODINFO_DEP_BLOCKED and FIX_GOH_FOLDER_NAME have real cards', () => {
  for (const c of ['FIX_MODINFO_DEP_BLOCKED', 'FIX_GOH_FOLDER_NAME']) { const e = x.explain(c); assert.ok(e.known, c); assert.doesNotMatch(e.what, /A note from a tool/, c + ' still the family text'); }
  assert.match(x.explain('FIX_MODINFO_DEP_BLOCKED').what, /required mod does not load/);
  assert.match(x.explain('FIX_GOH_FOLDER_NAME').why, /GHVFS-27/);
});
t('GX-help: exe hint and languages', () => {
  const e = x.explain('ZZ_SEEDED_NOT_A_CODE', null, { sea: true });
  assert.doesNotMatch(e.fix.join(' '), /q\.js/); assert.match(e.fix.join(' '), /Start here/);
  const r = x.explain('VER_MISSING', null, { lang: 'ru' });
  assert.equal(r.lang, 'ru'); assert.match(r.what, /mod\.info/); assert.match(r.impact, /Вылета нет/);
  for (const c of ['ru', 'uk', 'zh']) for (const k of Object.keys(x.TR[c])) if (k !== 'impact' && k !== 'fallback') assert.ok(Array.isArray(x.TR[c][k][2]), c + ' ' + k);
  assert.equal(x.explain('DUP_KEY', null, { lang: 'zh' }).lang, 'en', 'untranslated card says en');
});
console.log(process.exitCode ? 'explain FAIL' : `explain ok ${n}`);

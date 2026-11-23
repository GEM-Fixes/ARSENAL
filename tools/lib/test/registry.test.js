// registry: every tools/<n>/<n>.js is registered or explicitly ignored; entries exist; doctor/build views consistent
// Author: Imperator_Aug (ARSENAL, ia-1296a5ef)
const fs = require('fs'), path = require('path'), reg = require('../registry');
module.exports = (t, assert) => {
  const tools = path.join(__dirname, '..', '..');
  t('registry: every tools/<n>/<n>.js linter registered or ignored', () => {
    const missing = fs.readdirSync(tools).filter(n => n !== 'lib' && fs.existsSync(path.join(tools, n, n + '.js')) && !reg.byName(n) && !reg.IGNORE.includes(n));
    assert.deepEqual(missing, [], 'add to lib/registry.js TOOLS or IGNORE: ' + missing.join(','));
  });
  t('registry: entries exist, no dup, not also ignored', () => {
    const seen = new Set();
    for (const e of reg.TOOLS) {
      assert(fs.existsSync(reg.entryPath(e.name)), 'missing entry ' + e.entry);
      assert(!seen.has(e.name) && !reg.IGNORE.includes(e.name), 'dup/ignored ' + e.name); seen.add(e.name);
    }
    const notShipped = ['credit', 'markcheck', 'relscrub', 'docgen', 'scrub']; // maintainer-only: absent from release copies
    for (const n of reg.IGNORE) if (!notShipped.includes(n) || fs.existsSync(path.join(tools, n))) assert(fs.existsSync(path.join(tools, n, n + '.js')), 'stale IGNORE ' + n);
  });
  t('registry: views', () => {
    for (const n of ['strlint', 'humlint', 'movlint', 'fxlint', 'expcheck']) assert(reg.forBuild('lint').some(e => e.name === n) && reg.forDoctor().some(e => e.name === n), n);
    assert(reg.forDoctor().some(e => e.name === 'conflicts') && reg.forDoctor().some(e => e.name === 'mpsync'));
    assert(!reg.rcTools().includes('modinfo') && reg.rcTools().includes('refcheck'));
  });
  // game parity: games (absent = all), exe flag, forDoctor(game) / forGame(game)
  t('registry: games and exe fields', () => {
    const IDS = ['as64', 'mowas2', 'goh'];
    for (const e of reg.TOOLS) {
      if (e.games !== undefined) assert(Array.isArray(e.games) && e.games.length && e.games.every(g => IDS.includes(g)), 'games of ' + e.name);
      if (e.exe !== undefined) assert.equal(e.exe, true, 'exe of ' + e.name);
      // every linter that parses through lib/cli parse gets the common --exe: it must say so
      const src = fs.readFileSync(reg.entryPath(e.name), 'utf8');
      if (/\bcli\.parse\(/.test(src)) assert.equal(e.exe, true, e.name + ' parses through lib/cli: exe: true');
    }
    assert.equal(reg.byName('sdllint').exe, true);
    assert.equal(reg.byName('uilint').games, undefined); assert.equal(reg.byName('binhdr').games, undefined);
  });
  t('registry: forDoctor(game)', () => {
    const all = reg.forDoctor().map(e => e.name);
    assert.deepEqual(all, reg.TOOLS.filter(e => e.doctor).map(e => e.name));            // no game: as before
    assert.deepEqual(reg.forDoctor(null).map(e => e.name), all);
    assert.deepEqual(reg.forDoctor('as64').map(e => e.name), all);
    assert.deepEqual(reg.forDoctor('mowas_2').map(e => e.name), reg.forDoctor('mowas2').map(e => e.name));
    const goh = reg.forDoctor('goh').map(e => e.name);
    assert(goh.includes('uilint') && goh.includes('binhdr') && goh.includes('sdllint') && goh.includes('keylint') && goh.includes('milint'));
    assert.deepEqual(goh, all.filter(n => !(reg.byName(n).games || ['goh']).every(g => g !== 'goh')));
    assert.equal(reg.forGame('goh').length, reg.TOOLS.filter(e => !e.games || e.games.includes('goh')).length);
    assert.equal(reg.forGame().length, reg.TOOLS.length);
    assert.throws(() => reg.forDoctor('gates'), /unknown game gates/);
  });
};

// severity table: where doctor shows a code first; an unknown code is review, never dropped
module.exports.severity = (t, assert) => {
  const reg = require('../registry');
  t('severity: crash, silent, cosmetic, review', () => {
    for (const c of ['MACRO_UNDEFINED', 'INCLUDE_MISSING', 'REF_WEAPON_UNKNOWN', 'PLY_TRUNCATED']) assert.equal(reg.severity(c), 'crash', c);
    for (const c of ['WARN_DEAD_KEY', 'WARN_CONFLICT_MOD_MOD', 'UNKNOWN_KEY']) assert.equal(reg.severity(c), 'silent', c);
    for (const c of ['REF_SOUND_MISSING', 'REF_TEXTURE_MISSING', 'WARN_TAG_CSLASH']) assert.equal(reg.severity(c), 'cosmetic', c);
    assert.equal(reg.severity('NO_SUCH_CODE_EVER'), 'review');
  });
  // check-false audit: warning-class codes moved off crash; MDL_ codes listed by name (no prefix match)
  t('severity: check-false moves + anchored MDL_', () => {
    for (const c of ['MOV_PIVOT_MISSING', 'INT_CALL_UNDEFINED', 'MAP_NO_MODE', 'REF_ANIM_MISSING', 'MOD_NAME', 'MDL_VOLUME_BONE', 'IDENT_SPLIT_MACRO', 'NUMBER_GLUED_MACRO', 'REF_ITEM_UNKNOWN']) assert.equal(reg.severity(c), 'silent', c);
    for (const c of ['MDL_BONE_PARAM', 'MDL_BONE_TYPE', 'MDL_ZERO_SPEED', 'IDENT_SPLIT', 'NUMBER_GLUED', 'MOD_UNCLOSED', 'REF_MODEL_MISSING']) assert.equal(reg.severity(c), 'crash', c);
    assert.equal(reg.severity('MDL_BONE_PARAM_X'), 'review');
  });
};
// standalone: node registry.test.js (test.js runs both parts too)
if (require.main === module) {
  const assert = require('assert');
  let n = 0;
  const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
  module.exports(t, assert); module.exports.severity(t, assert);
  console.log(`${n} passed`);
}

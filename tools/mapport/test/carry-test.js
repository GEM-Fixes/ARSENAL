// mapport --carry seeded test: fake ported map, fake GoH and AS2 resource roots, all loose files under ../run/mapcarry/test. No game, no real data.
// cases: one texture named, one .ebm redirect, one AS2-known key skipped, one ATI2 texture warned, one unknown preset key dropped, one AS2 preset id left alone
// Author: Imperator_Aug (ARSENAL, ia-80c71984)
const assert = require('assert'), fs = require('fs'), path = require('path'), cp = require('child_process');
const base = path.resolve(__dirname, '../../../../run/mapcarry/test');
fs.rmSync(base, { recursive: true, force: true });
const w = (rel, data) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const dds = (cc, n) => { const b = Buffer.alloc(128 + n); b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(4, 80); b.write(cc, 84, 'latin1'); return b; };
const crlf = s => s.replace(/\n/g, '\r\n');
w('root/map/multi/f/map', '{map\n}\n');
w('root/map/multi/f/.materials', crlf('{materials\n\t{"mtl0"\n\t\t{layer bump\n\t\t\t{diffuse "/texture/land/t/plain"}\n\t\t\t{bump "/texture/land/t/redir_nm"}\n\t\t\t{specular "/texture/land/t/known_sp"}\n\t\t}\n\t\t{layer bump\n\t\t\t{diffuse "/texture/land/t/two"}\n\t\t\t{height "/texture/land/t/gone"}\n\t\t\t{bump "/texture/land/t/fr_nm"}\n\t\t\t{parallax_scale 1}\n\t\t}\n\t}\n}\n'));
w('root/map/multi/f/combat.mi', crlf('{mission\n\t{Environment "goh/multi/f/var1"}\n\t{"environment"\n\t\t{name "multi/multi_07"}\n\t\t{apply}\n\t}\n}\n'));
w('goh/texture/land/t/plain.dds', dds('DXT1', 100));
w('goh/texture/land/t/redir_nm.ebm', '{texture\n\t{reference "/texture/land/t/real_nm"}\n}\n');
w('goh/texture/land/t/real_nm.dds', dds('DXT5', 200));
w('goh/texture/land/t/known_sp.dds', dds('DXT1', 50));
// {bitmap} .ebm whose frame differs from its stem; a second frame AS2 has; a nested frame .ebm; a ';' commented frame
w('goh/texture/land/t/fr_nm.ebm', '{bitmap\n    {frame "fr-colour_nm.dds"}\n    {frame "known_fr.dds"}\n    {Frame "sub/inner.ebm"}\n;   {frame "dead.dds"}\n}');
w('goh/texture/land/t/fr-colour_nm.dds', dds('DXT5', 30));
w('goh/texture/land/t/known_fr.dds', dds('DXT1', 5));
w('as2/texture/land/t/known_fr.dds', dds('DXT1', 5));
w('goh/texture/land/t/sub/inner.ebm', '{bitmap {Axis 1 1 } {Frame "deep.dds" 10 } {frame "lost.dds"} }');
w('goh/texture/land/t/sub/deep.dds', dds('DXT1', 20));
w('goh/texture/land/t/two.dds', dds('ATI2', 70));
w('as2/texture/land/t/known_sp.dds', dds('DXT1', 10));
w('as2/set/environment/multi/multi_07.set', '{environment}\n');
w('goh/set/environment/goh/multi/f/var1.set', crlf('{environment\n\t{light\n\t\t{direction 1 2 3}\n\t\t{ambient 0xff101010}\n\t\t{diffuse 0xffffffff}\n\t\t{lightsIntensity 1}\n\t\t{specularIntensity 0.5}\n\t\t{rim_light {x 1}}\n\t}\n\t{haze {enable 1}{color 0xffafcad9}{start 0}{end 5000}{altitude_strength 3}}\n}\n'));
w('goh/set/environment/multi/multi_07.set', '{environment {light {direction 9 9 9}}}\n');

const out = path.join(base, 'out');
const r = cp.spawnSync('node', [path.join(__dirname, '../mapport.js'), path.join(base, 'root'), '--out', out, '--carry', '--goh', path.join(base, 'goh'), '--as2', path.join(base, 'as2')], { encoding: 'latin1' });
assert.strictEqual(r.status, 0, r.stderr + r.stdout);
const rd = rel => fs.readFileSync(path.join(out, rel));
const has = rel => fs.existsSync(path.join(out, rel));
assert.ok(has('texture/land/t/plain.dds'), 'named texture copied');
assert.strictEqual(rd('texture/land/t/plain.dds').length, 228, 'bytes same');
{ const L = require('../../goh2as2/origin').read(out); assert.ok(L.has('texture/land/t/plain.dds') && L.get('texture/land/t/plain.dds').tool === 'mapport --carry' && !L.has('texture/land/t/known_sp.dds'), 'PORTREV: GoH-origin ledger lists carried files only'); }
assert.ok(has('texture/land/t/real_nm.dds') && !has('texture/land/t/redir_nm.dds'), '.ebm redirect lands under the reference key');
assert.ok(!has('texture/land/t/known_sp.dds'), 'AS2 key skipped');
assert.ok(has('texture/land/t/two.dds') && /WARN FORMAT_ATI2 texture\/land\/t\/two/.test(r.stdout), 'ATI2 copied and named');
assert.ok(/WARN MISSING_TEXTURE multi\/f mtl0 height \/texture\/land\/t\/gone/.test(r.stdout), 'missing named');
const mtl = rd('map/multi/f/mtl0.mtl').toString('latin1');
assert.ok(/^\{material\r\n\t\{layer bump\r\n\t\t\{diffuse "\/texture\/land\/t\/plain"\}\r\n\t\t\{bump "\/texture\/land\/t\/real_nm"\}\r\n\t\t\{specular "\/texture\/land\/t\/known_sp"\}\r\n\t\t\{color 0xffffffff\}\r\n\t\t\{parallax_scale 0\}\r\n/.test(mtl), 'mtl form: ' + JSON.stringify(mtl));
assert.ok(/\{parallax_scale 1\}/.test(mtl) && !/\r\n\r\n/.test(mtl) && !/[^\r]\n/.test(mtl), 'parallax kept, CRLF only');
const env = rd('set/environment/goh/multi/f/var1.set').toString('latin1');
assert.ok(/\{direction 1 2 3\}/.test(env) && /\{specular 0xff808080\}/.test(env) && /\{start 0\}/.test(env), 'kept keys + specular grey: ' + env);
assert.ok(!/rim_light|altitude_strength|specularIntensity/.test(env) && !/[^\r]\n/.test(env), 'unknown key dropped, CRLF');
assert.ok(/env dropped \/light\/rim_light x1/.test(r.stdout), 'drop listed');
assert.ok(!has('set/environment/multi/multi_07.set'), 'AS2 preset id left alone');
// {bitmap} .ebm: copied as is, frames copied under the .ebm dir, AS2 frame skipped, nested .ebm followed, missing frame warned, comment ignored
assert.ok(has('texture/land/t/fr_nm.ebm') && has('texture/land/t/fr-colour_nm.dds'), 'ebm + differing frame carried');
assert.ok(!has('texture/land/t/known_fr.dds'), 'AS2 frame skipped');
assert.ok(has('texture/land/t/sub/inner.ebm') && has('texture/land/t/sub/deep.dds'), 'nested ebm frame carried');
assert.ok(!has('texture/land/t/dead.dds') && /WARN MISSING_FRAME multi\/f mtl0 bump texture\/land\/t\/sub\/inner\.ebm lost\.dds/.test(r.stdout), 'missing frame named: ' + r.stdout);
assert.ok(/\{bump "\/texture\/land\/t\/fr_nm"\}/.test(mtl), 'mtl keeps the ebm key');
const ebmBytes = ['fr_nm.ebm', 'sub/inner.ebm'].reduce((a, f) => a + fs.statSync(path.join(base, 'goh/texture/land/t', f)).size, 0);
assert.ok(new RegExp('bytes copied ' + (754 + ebmBytes + 158 + 148) + ' ').test(r.stdout), 'bytes line: ' + r.stdout);
assert.ok(/textures copied 3, skipped \(AS2 has\) 2, mtl 1, env presets 1 of 2 names, ebm 2 with frames 2/.test(r.stdout), r.stdout);
// no --carry: no carry output, no texture files
const out2 = path.join(base, 'out2');
const r2 = cp.spawnSync('node', [path.join(__dirname, '../mapport.js'), path.join(base, 'root'), '--out', out2], { encoding: 'latin1' });
assert.strictEqual(r2.status, 0);
assert.ok(!/carry/.test(r2.stdout) && !fs.existsSync(path.join(out2, 'texture')) && !fs.existsSync(path.join(out2, 'set')), 'plain run unchanged');
// out inside a game root is refused
const r3 = cp.spawnSync('node', [path.join(__dirname, '../mapport.js'), path.join(base, 'root'), '--out', path.join(base, 'goh/x'), '--carry', '--goh', path.join(base, 'goh'), '--as2', path.join(base, 'as2')], { encoding: 'latin1' });
assert.notStrictEqual(r3.status, 0, 'out inside goh refused');
console.log('PASS carry');
// tone/tone_strength dropped (GoH 0.4 = as64 g_ambientLevel, white haze; map-fix3)
{ const { convertEnv } = require('../carry'); const o = convertEnv('{environment\r\n{light\r\n\t{color_correction\r\n\t\t{contrast 1}\r\n\t\t{tone 0xffffffff}\r\n\t\t{tone_strength 0.4}\r\n\t}\r\n}\r\n}\r\n', () => true, {});
  assert.ok(/contrast 1/.test(o) && !/tone/.test(o), 'tone dropped: ' + o); console.log('PASS tone'); }
// MAPLOOK: sky texture AS2 lacks is carried (callback) or falls back to an AS2 sky; GoH weather fx snow_storm -> blizzard, unknown fx dropped
{ const { convertEnv } = require('../carry'); const has2 = k => k === 'texture/common/environment/environment_day_01';
  const src = '{environment\r\n\t{sky\r\n\t\t{enable}\r\n\t\t{texture "/texture/common/environment/environment_clouds_02"}\r\n\t}\r\n\t{weather\r\n\t\t{enable}\r\n\t\t{fx "snow_storm"}\r\n\t}\r\n}\r\n';
  const d = {}, a = convertEnv(src, has2, d);
  assert.ok(/\{texture "\/texture\/common\/environment\/environment_clouds_01"\}/.test(a), 'sky clouds fallback: ' + a);
  assert.ok(/\{fx "blizzard"\}/.test(a) && !/snow_storm/.test(a), 'snow_storm -> blizzard: ' + a);
  assert.ok(Object.keys(d).some(k => /snow_storm -> blizzard/.test(k)), 'fx map counted');
  const seen = [], b = convertEnv(src, has2, {}, k => { seen.push(k); return true; });
  assert.ok(/environment_clouds_02"/.test(b) && seen[0] === 'texture/common/environment/environment_clouds_02', 'sky carried keeps the GoH name');
  const c = convertEnv(src.replace('snow_storm', 'sandstorm_x').replace('clouds_02', 'day_01'), has2, {});
  assert.ok(/environment_day_01"/.test(c) && /fx "blizzard"/.test(c), 'AS2 sky kept, storm -> blizzard');
  const n = convertEnv(src.replace('snow_storm', 'fog_x').replace('clouds_02', 'night_07'), has2, {});
  assert.ok(!/\{fx /.test(n) && /environment_night_01"/.test(n), 'unknown fx dropped, night sky fallback');
  console.log('PASS sky weather'); }
// MAPFILL: a land layer GoH holds only as .tga (dcg_f_barrikady asphalt_a1_hm, RLE type 10) is carried as .tga; an unreadable tga type is warned, not copied
{ const b2 = path.join(base, 'tga'); const w2 = (rel, data) => w('tga/' + rel, data);
  const tga = type => { const b = Buffer.alloc(18 + 12); b[2] = type; b.writeUInt16LE(2, 12); b.writeUInt16LE(2, 14); b[16] = 24; return b; };
  w2('root/map/multi/g/map', '{map\n}\n');
  w2('root/map/multi/g/.materials', crlf('{materials\n\t{"mtl1"\n\t\t{layer bump\n\t\t\t{diffuse "/texture/land/p/asph"}\n\t\t\t{height "/texture/land/p/asph_hm"}\n\t\t\t{bump "/texture/land/p/odd_hm"}\n\t\t}\n\t}\n}\n'));
  w2('goh/texture/land/p/asph.dds', dds('DXT1', 10));
  w2('goh/texture/land/p/asph_hm.tga', tga(10));
  w2('goh/texture/land/p/odd_hm.tga', tga(32 + 99));
  fs.mkdirSync(path.join(b2, 'as2'), { recursive: true });
  const r4 = cp.spawnSync('node', [path.join(__dirname, '../mapport.js'), path.join(b2, 'root'), '--out', path.join(b2, 'out'), '--carry', '--goh', path.join(b2, 'goh'), '--as2', path.join(b2, 'as2')], { encoding: 'latin1' });
  assert.strictEqual(r4.status, 0, r4.stderr + r4.stdout);
  assert.ok(fs.existsSync(path.join(b2, 'out/texture/land/p/asph_hm.tga')) && !fs.existsSync(path.join(b2, 'out/texture/land/p/asph_hm.dds')), 'tga height carried as .tga');
  assert.ok(!/MISSING_TEXTURE.*asph_hm/.test(r4.stdout), 'tga height not missing: ' + r4.stdout);
  const m4 = fs.readFileSync(path.join(b2, 'out/map/multi/g/mtl1.mtl'), 'latin1');
  assert.ok(/\{height "\/texture\/land\/p\/asph_hm"\}/.test(m4) && !/odd_hm/.test(m4), 'mtl names the tga key, drops the unreadable one: ' + m4);
  assert.ok(/FORMAT_TGA_TYPE_131 texture\/land\/p\/odd_hm\.tga/.test(r4.stdout) && !fs.existsSync(path.join(b2, 'out/texture/land/p/odd_hm.tga')), 'odd tga warned, not copied: ' + r4.stdout);
  console.log('PASS tga'); }
// trigger environments by brace parse: Environment at depth, "environment" action with name on its own line, unquoted key, commented one skipped
{ const { miEnvNames } = require('../carry.js');
  const mi = '{mission\r\n\t{Environment "a/one"}\r\n\t{triggers {t1\r\n\t\t{"Environment"\r\n\t\t\t{apply}\r\n\t\t\t{name "b/two"}\r\n\t\t}\r\n\t\t{environment {name "c;three"}}\r\n\t;\t{Environment "dead/one"}\r\n\t}}\r\n}\r\n';
  const got = miEnvNames(mi).sort().join(',');
  assert.strictEqual(got, 'a/one,b/two,c;three', 'env names: ' + got);
  console.log('PASS envnames'); }
// seeded: a quote never closed ends its token at the end of the text (it used to restart at 0 and recurse forever)
{ const { parse } = require('../carry.js');
  const n = parse('{mtl0 {layer {diffuse "/texture/land/t/open}}');
  assert.strictEqual(n.k, 'mtl0', 'root key');
  const d = n.kids[0] && n.kids[0].kids[0];
  assert.ok(d && d.k === 'diffuse' && d.v[0] === '"/texture/land/t/open}}', 'unclosed quote token runs to the end: ' + JSON.stringify(n));
  const ok2 = parse('{a "x"}'); assert.ok(ok2.k === 'a' && ok2.v[0] === '"x"', 'closed quote unchanged');
  console.log('PASS unclosed quote'); }

// seeded clash kinds (mkseed.js, one defect each) and the patch mod (patchmod.js): built in a temp folder, nothing kept.
//   1 every code of seed-truth.md is found on the seeded file, and nothing else is (the quiet twins stay quiet)
//   2 --fmt json carries the same lines with their parts
//   3 patchmod: plan writes nothing; write makes a new folder that mounts last, its files win, the merged files hold both sides;
//     the check with --mod-dir no longer warns on the patched files; a used folder and a mod's own folder are refused
// Author: Imperator_Aug (ARSENAL, ia-902b173a)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'conflicts-seed-'));
const tool = path.join(__dirname, '..', 'conflicts.js'), pm = path.join(__dirname, '..', 'patchmod.js');
let bad = 0;
const ok = (c, m, out) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m + (out ? '\n' + out : '')); } };
const run = (t, ...a) => { const r = cp.spawnSync(process.execPath, [t, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' }; };
try {
  let r = run(path.join(__dirname, 'mkseed.js'), W);
  ok(r.code === 0, 'seed built', r.out);
  const G = path.join(W, 'game'), MODS = 'sa,sb,sd,sf,sg';
  // 1
  r = run(tool, '--game', G, '--mods', MODS, '--keys');
  const got = r.out.split(/\r?\n/).filter(l => l && !/findings$|^by code|shared files$/.test(l)).map(l => {
    const info = /^info: /.test(l); l = l.replace(/^info: /, '');
    const m = /^(.*?)(?::\d+)?: ([A-Z_0-9]+) /.exec(l); if (!m) return 'UNREAD ' + l;
    return (info ? 'info: ' : '') + m[1].replace(/\\/g, '/').replace(/^.*\/game\//, '') + ' ' + m[2];
  }).sort();
  const want = fs.readFileSync(path.join(__dirname, 'seed-truth.md'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).sort();
  const miss = want.filter(x => !got.includes(x)), extra = got.filter(x => !want.includes(x));
  ok(!miss.length && !extra.length && got.length === want.length, 'seeded clashes: every kind found, nothing else (' + want.length + ' lines)', 'missed:\n' + miss.join('\n') + '\nnot seeded:\n' + extra.join('\n'));
  ok(/units\/side "ger"\/card "sa_card"/.test(r.out) && !/card\[2\]/.test(r.out), 'two cards added to one .set are two entries by name, not one entry with two values', r.out);
  ok(/sa's is used, this one of sb is ignored/.test(r.out), 'entity name twin: the earlier mod is the one kept', r.out);
  ok(/t2\.dds: CONFLICT_TEX_EXT_SHADOW sb ships this picture as \.dds and sa ships t2\.tga/.test(r.out) && /info: resource\/texture\/common\/t1\.dds/.test(r.out), 'picture extension: warn when the earlier mod wins, info when the later one does', r.out);
  // 2
  r = run(tool, '--game', G, '--mods', MODS, '--fmt', 'json');
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* below */ }
  ok(j && j.order.join() === 'sa,sb,sf,sg' && j.items.some(x => x.code === 'CONFLICT_ENTRY_LOST' && x.level === 'warn' && x.d.winner === 'sb' && x.d.losers.join() === 'sa' && /sa_card/.test(x.d.key))
    && j.items.some(x => x.code === 'CONFLICT_LNG_KEY_DIFF' && x.d.key === 'shared' && x.d.values.length === 3) && j.items.some(x => x.code === 'CONFLICT_MOD_NOT_LOADED' && x.d.mod === 'sd'), '--fmt json: order, items with their parts', r.out.slice(0, 600));
  // 3
  const P = path.join(W, 'seedpatch');
  r = run(pm, 'plan', '--game', G, '--mods', 'sa,sb', '--out', P, '--json');
  j = JSON.parse(r.stdout);
  ok(!fs.existsSync(P) && j.files.length === 6 && j.files.filter(f => !f.same).length === 4 && !j.wrote && !j.refused, 'patchmod plan: 4 files to write, 2 with only values both changed, nothing written', r.out.slice(0, 900));
  const s1 = j.files.find(f => f.key === 'resource/set/s1.def');
  ok(s1 && s1.same && s1.choices.length === 1 && s1.choices[0].path === 'e/hp' && s1.choices[0].pick === 'sb' && s1.choices[0].values.map(x => x.src + '=' + x.val).join() === 'vanilla=10,sa=20,sb=30', 'plan: a value both changed is a choice, the winner by default');
  const spec = path.join(W, 'spec.json');
  fs.writeFileSync(spec, JSON.stringify({ files: [
    { key: 'resource/set/s1.def', mode: 'merge', picks: { 'e/hp': 'sa' } },
    { key: 'resource/entity/x/tank/tank.mdl', mode: 'merge' },
    { key: 'resource/interface/text/desc.lng', mode: 'merge', picks: { 'tags/"shared"': 'sa' } },
    { key: 'resource/set/multiplayer/units/units.set', mode: 'merge' },
    { key: 'resource/set/shared.inc', mode: 'merge' },
    { key: 'resource/set/c.def', mode: 'merge' },
    { key: 'resource/script/x.lua', mode: 'take', take: 'sa' },
  ], texts: [{ key: 'gun_x', text: 'Gun of both' }] }));
  r = run(pm, 'write', '--game', G, '--mods', 'sa,sb', '--out', P, '--name', 'Seed patch', '--spec', spec, '--json');
  j = JSON.parse(r.stdout);
  const rd = f => fs.readFileSync(path.join(P, f), 'latin1');
  ok(r.code === 0 && j.wrote && j.files.every(f => f.wins === true) && j.left.length === 0, 'patchmod write: every patch file is the one read, no clash left in them', r.out.slice(0, 1500));
  ok(/\{require "sa"\}\r\n\t\{require "sb"\}/.test(rd('mod.info')) && /\{name "Seed patch"\}/.test(rd('mod.info')) && /minGameVersion "3\.0"/.test(rd('mod.info')), 'patch mod.info: name, the last mod\'s version range, Require on both mods (CRLF)');
  ok(/hp 20/.test(rd('resource/set/s1.def')) && !/hp 30/.test(rd('resource/set/s1.def')), 'picked value: sa\'s hp is in the patch file');
  ok(/mass 3/.test(rd('resource/entity/x/tank/tank.mdl')), 'no pick: the winner\'s copy goes in as the decided one');
  const u = rd('resource/set/multiplayer/units/units.set');
  ok(/sa_card/.test(u) && /sb_card/.test(u) && /van_card/.test(u) && /\r\n  \{card "sa_card" \{cost 111\}\}\r\n/.test(u), 'merged .set: both cards, the new line indented like its neighbours, CRLF', u);
  const d = rd('localization/desc.lng');
  ok(/sa_only/.test(d) && /sb_only/.test(d) && /"shared" "Text of sa"/.test(d) && !/Text of sb/.test(d), 'merged .lng: keys of both, the picked text', d);
  ok(/armor_front/.test(rd('resource/set/shared.inc')) && /e3b/.test(rd('resource/set/c.def')) && /-- sa/.test(rd('resource/script/x.lua')), 'macro put back, dropped entry put back, the picked copy of a file that is no text data');
  ok(/\{"gun_x" "Gun of both"\}/.test(fs.readFileSync(path.join(P, 'localization/#seed_patch_texts.lng'), 'utf8')), 'picked text of a key two files hold: a # file of the patch mod');
  r = run(tool, '--game', G, '--mods', 'sa,sb', '--mod-dir', P, '-q');
  ok(!/WARN_CONFLICT|CONFLICT_ENTRY_LOST|CONFLICT_LNG|CONFLICT_MACRO|CONFLICT_FILE_SHADOW|MOD_ORDER_UNDECLARED/.test(r.out) && /CONFLICT_ENTITY_NAME_DUP/.test(r.out) && /^2 findings/m.test(r.out), 'check again with the patch mod: only what a patch cannot mend is left (entity name, picture)', r.out);
  r = run(tool, '--game', G, '--mods', 'sa,sb', '--mod-dir', P);
  ok(/info: .*CONFLICT_PATCHED/.test(r.out), 'the decided values are named as info CONFLICT_PATCHED', r.out.slice(0, 800));
  r = run(pm, 'write', '--game', G, '--mods', 'sa,sb', '--out', P);
  ok(r.code === 2 && /must be new or empty/.test(r.out), 'a folder that holds files is refused', r.out);
  r = run(pm, 'write', '--game', G, '--mods', 'sa,sb', '--out', path.join(G, 'mods', 'sa', 'patch'));
  ok(r.code === 2 && /must not be one of the mods or inside one/.test(r.out) && !fs.existsSync(path.join(G, 'mods', 'sa', 'patch')), 'a folder inside one of the mods is refused', r.out);
  r = run(pm, 'write', '--game', G, '--mods', 'sa,sb', '--out', path.join(G, 'resource', 'p'));
  ok(r.code === 2 && !fs.existsSync(path.join(G, 'resource', 'p')), 'a folder inside the game data is refused', r.out);
  // 4 the joint view (--joint): mods ja jb jc of mkseed.js (cases 12-15)
  r = run(tool, '--game', G, '--mods', 'ja,jb,jc', '--joint', '--fmt', 'json');
  j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* below */ }
  const it = (code, f) => (j ? j.items : []).filter(x => x.code === code && (!f || f(x)));
  ok(j && it('CONFLICT_JOINT_REF').length === 4 && it('CONFLICT_JOINT_REF', x => x.level === 'warn').length === 4, 'joint: four references that resolve with one mod alone and not together', r.out.slice(0, 1500));
  ok(it('CONFLICT_JOINT_REF', x => /use\.def$/.test(x.file) && x.line === 2 && x.d.kind === 'macro' && x.d.key === 'ja_armor' && x.d.loser === 'ja' && x.d.winner === 'jb' && x.d.other === 'resource/set/j/stuff.inc').length === 1, 'joint: a macro the read copy of a shared file no longer holds, named by the other mod');
  ok(it('CONFLICT_JOINT_REF', x => x.d.kind === 'entry' && x.d.key === 'ja_gun' && x.line === 3 && x.d.n === 1).length === 1, 'joint: a named entry lost from a shared file; the comment line that names it is not counted');
  ok(it('CONFLICT_JOINT_REF', x => x.d.kind === 'entity' && x.d.key === 'jcar' && x.d.winner === 'jb' && /jcar\.def$/.test(x.d.other)).length === 1, 'joint: an entity another mod deletes, named by the mod that ships it');
  ok(!it('CONFLICT_JOINT_REF', x => x.d.key === 'ja_quiet').length && it('CONFLICT_MACRO_LOST', x => /ja_quiet/.test(JSON.stringify(x))).length === 1, 'joint: a lost macro nothing names is a lost macro only');
  ok(it('CONFLICT_JOINT_PARSE', x => /top\.def$/.test(x.file) && x.line === 3 && x.d.loser === 'jb' && x.d.winner === 'jc' && x.d.key === 'MACRO_UNDEFINED' && x.d.other === 'resource/set/j/jinc.inc' && x.d.otherOf === 'jb').length === 1 && it('CONFLICT_JOINT_PARSE').length === 1, 'joint: a clash file that reads clean with its mod alone and stops with the third mod loaded');
  ok(it('CONFLICT_SHADER_SET', x => x.level === 'info' && x.d.mod === 'jc' && x.d.n === 1).length === 1 && it('CONFLICT_MISSION_MOD', x => x.level === 'info' && x.d.mod === 'jc' && x.d.where === 'resource/map/single/jm/mod').length === 1, 'notes: shader files and a mission with its own mod folder, one info line per mod');
  r = run(tool, '--game', G, '--mods', 'ja,jb,jc', '--fmt', 'json');
  j = JSON.parse(r.stdout);
  ok(!j.items.some(x => /^CONFLICT_(JOINT_|SHADER_SET|MISSION_MOD)/.test(x.code)), 'no --joint: none of the joint lines or notes');
  r = run(tool, '--game', G, '--mods', 'ja,jb', '--joint', '--fmt', 'json');
  j = JSON.parse(r.stdout);
  ok(!j.items.some(x => x.code === 'CONFLICT_JOINT_PARSE') && j.items.filter(x => x.code === 'CONFLICT_JOINT_REF').length === 3, 'joint: without the third mod the file reads clean (quiet twin), the three names of ja stay');
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(bad ? bad + ' FAILED' : 'ALL OK');
process.exit(bad ? 1 : 0);

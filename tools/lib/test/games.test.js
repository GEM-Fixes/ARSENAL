// lib/games (the three games), and what carries the game: cli --exe, vfs exe 'mowas2', gamever.read(dir, exe). (t, assert) => ...
// standalone: node games.test.js (exit 1 on failure). Fake gamedir options and temp folders only: no registry, no Steam, no game install.
// Author: Imperator_Aug (ARSENAL, ia-20cb6155)
const fs = require('fs'), os = require('os'), path = require('path');
module.exports = function (t, assert) {
  const games = require('../games');
  const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'games-'));
  const rm = d => fs.rmSync(d, { recursive: true, force: true });

  t('games: table and lookups', () => {
    assert.deepEqual(games.GAMES.map(g => [g.id, g.exe, g.file, g.kind]), [
      ['as64', 'as64', 'as64.exe', 'as2'], ['mowas2', 'mowas_2', 'mowas_2.exe', 'as2'], ['goh', 'goh', 'binaries/x64/call_to_arms.exe', 'goh']]);
    assert.equal(games.DEFAULT, 'as64');
    for (const [x, id] of [['as64', 'as64'], ['mowas2', 'mowas2'], ['mowas_2', 'mowas2'], ['goh', 'goh'], ['MOWAS_2', 'mowas2'], ['mowas_2.exe', 'mowas2'], ['call_to_arms.exe', 'goh']]) {
      assert.equal(games.get(x).id, id, x); assert.equal(games.idOf(x), id, x);
    }
    assert.equal(games.get(games.GAMES[2]), games.GAMES[2]);
    assert.equal(games.exeOf('mowas2'), 'mowas_2'); assert.equal(games.exeOf('as64'), 'as64'); assert.equal(games.exeOf('goh'), 'goh');
    assert.equal(games.kindOf('mowas_2'), 'as2'); assert.equal(games.kindOf('as64'), 'as2'); assert.equal(games.kindOf('goh'), 'goh');
    for (const x of [null, undefined, '', 'as2', 'gates', {}]) { assert.equal(games.get(x), null); assert.equal(games.idOf(x), null); assert.equal(games.exeOf(x), null); assert.equal(games.kindOf(x), null); }
  });

  t('games: same facts as tools/gui/groups.js GAMES', () => {
    const G = require('../../gui/groups').GAMES;
    const key = a => a.map(g => [g.id, g.name, path.posix.basename(g.file || g.exe), g.kind, g.version].join('|')).sort();
    assert.deepEqual(key(games.GAMES), key(G));
    for (const g of G) assert.equal(games.idOf(g.target), g.id, 'groups target ' + g.target);
  });

  t('games: detect in vfs order', () => {
    const P = (...a) => path.join(...a), have = new Set();
    const exists = p => have.has(path.normalize(p));
    assert.equal(games.detect(null), null);
    assert.equal(games.detect(P('/g'), { exists }), 'mowas2');
    have.add(path.normalize(P('/g', 'binaries', 'x64', 'call_to_arms.exe')));
    assert.equal(games.detect(P('/g'), { exists }), 'goh');
    have.add(path.normalize(P('/g', 'as64.exe')));
    assert.equal(games.detect(P('/g'), { exists }), 'as64');
    const d = tmp();
    try {
      assert.equal(games.detect(d), 'mowas2');
      w(P(d, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ'); assert.equal(games.detect(d), 'goh');
      w(P(d, 'as64.exe'), 'MZ'); assert.equal(games.detect(d), 'as64');
    } finally { rm(d); }
  });

  t('games: install through gamedir (fake options)', () => {
    const P = (...a) => path.resolve(...a), dirs = new Set([P('/as2'), P('/goh')]), files = {};
    const fake = { cwd: P('/w'), env: {}, readReg: () => null, readFile: f => files[path.resolve(f)] ?? null, exists: d => dirs.has(path.resolve(d)), noSteam: true };
    assert.deepEqual(games.install('as64', { ...fake, arg: 'X' }), { dir: 'X', source: 'arg' });
    assert.deepEqual(games.install('mowas2', { ...fake, env: { AS2_GAME: P('/as2') } }), { dir: P('/as2'), source: 'env' });
    assert.deepEqual(games.install('mowas_2', fake), { dir: null, source: null });
    assert.deepEqual(games.install('goh', { ...fake, goh: 'G' }), { dir: 'G', source: 'arg' });
    assert.deepEqual(games.install('goh', { ...fake, arg: 'G2' }), { dir: 'G2', source: 'arg' });
    assert.deepEqual(games.install('goh', { ...fake, env: { GOH_GAME: P('/goh'), AS2_GAME: P('/as2') } }), { dir: P('/goh'), source: 'goh' });
    files[P('/w/as2.json')] = JSON.stringify({ game: P('/as2'), goh: P('/goh') });
    assert.deepEqual(games.install('goh', fake), { dir: P('/goh'), source: 'goh' });
    assert.deepEqual(games.install('as64', fake).dir, P('/as2'));
    delete files[P('/w/as2.json')];
    assert.deepEqual(games.install('goh', fake), { dir: null, source: null });
    assert.throws(() => games.install('nope', fake), /unknown game: nope/);
  });

  t('games: notFor and refuse', () => {
    assert.equal(games.notFor('soedit', 'goh', 'the model editor is AS2 and the 64-bit build only', 'decisions 2026-11-10'),
      'soedit: not available for GoH: the model editor is AS2 and the 64-bit build only (decisions 2026-11-10)');
    assert.equal(games.notFor('x', 'mowas_2', 'no as64/core'), 'x: not available for MoW:AS2: no as64/core');
    assert.equal(games.notFor('x', 'as64', 'why', 'R-1'), 'x: not available for AS64: why (R-1)');
    const got = [], codes = [];
    const line = games.refuse('uilint', 'goh', 'GoH tables not built', 'GHUI-75', { log: s => got.push(s), exit: c => codes.push(c) });
    assert.equal(line, 'uilint: not available for GoH: GoH tables not built (GHUI-75)');
    assert.deepEqual(got, [line]); assert.deepEqual(codes, [2]);
  });

  t('games: no IO at require time', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'games.js'), 'utf8').split(/\r?\n/).filter(l => /^const .*require\(/.test(l));
    assert.deepEqual(src, ["const path = require('path');"]);
  });

  t('cli: common --exe and the GoH default folder', () => {
    const cli = require('../cli'), d = tmp(), keep = { AS2_NO_STEAM: process.env.AS2_NO_STEAM, GOH_GAME: process.env.GOH_GAME };
    try {
      process.env.AS2_NO_STEAM = '1'; process.env.GOH_GAME = d;
      const p = (a, s) => cli.parse(a.concat('--no-rc'), s);
      assert.equal(p([]).exe, undefined);
      assert.equal(p(['--exe', 'as64']).exe, 'as64');
      assert.equal(p(['--exe', 'mowas_2']).exe, 'mowas_2');
      assert.equal(p(['--exe', 'mowas2']).exe, 'mowas_2');
      const g = p(['--exe', 'goh', 'mod']);
      assert.equal(g.exe, 'goh'); assert.equal(g.gameDir, d); assert.deepEqual(g.pos, ['mod']);
      assert.equal(p(['--exe', 'goh', '--game', 'X']).gameDir, 'X');
      delete process.env.GOH_GAME;
      assert.equal(p(['--exe', 'goh']).gameDir, null);
      assert.throws(() => p(['--exe', 'gates']), /--exe must be one of as64\|mowas_2\|mowas2\|goh/);
      assert.throws(() => p(['--exe', 'as64.exe']), /--exe must be one of/);
      assert.throws(() => cli.parse(['--no-rc', '--exe']), /--exe needs a value/);
      // a tool that declared --exe keeps o.x.exe as before (lnglint, sdllint: a game; preloadsweep: an exe path, unchecked)
      const own = { values: ['--exe'] };
      let o = p(['--exe', 'mowas_2'], own); assert.equal(o.x.exe, 'mowas_2'); assert.equal(o.exe, 'mowas_2');
      o = p(['--exe', 'goh'], own); assert.equal(o.x.exe, 'goh'); assert.equal(o.exe, 'goh');
      o = p(['--exe', 'C:/x/as64.exe'], own); assert.equal(o.x.exe, 'C:/x/as64.exe'); assert.equal(o.exe, undefined);
      o = p(['--exe', 'bogus'], own); assert.equal(o.x.exe, 'bogus'); assert.equal(o.exe, undefined);
    } finally {
      for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      rm(d);
    }
  });

  t('vfs: exe mowas2 is mowas_2', () => {
    const vfs = require('../vfs'), d = tmp();
    try {
      w(path.join(d, 'as64.exe'), 'x');
      w(path.join(d, 'resource', 'set', 'a.set'), 'base');
      w(path.join(d, 'as64', 'core', 'resource', 'shader', 's.hlsl'), 'core');
      assert.equal(vfs.build({ gameDir: d }).exe, 'as64');
      const v = vfs.build({ gameDir: d, exe: 'mowas2' });
      assert.equal(v.exe, 'mowas_2'); assert.equal(v.files.has('resource/shader/s.hlsl'), false); assert.ok(v.files.has('resource/set/a.set'));
    } finally { rm(d); }
  });

  t('gamever: read(dir, exe) reads that game\'s exe', () => {
    const gv = require('../gamever'), d = tmp(), P = (...a) => path.join(d, ...a);
    try {
      w(P('as64.exe'), pe('9.9.9')); w(P('mowas_2.exe'), pe('3.2.6.2')); w(P('binaries', 'x64', 'call_to_arms.exe'), pe('1.0.6.7-test'));
      assert.equal(gv.peVersion(P('mowas_2.exe')), '3.2.6.2');
      assert.equal(gv.read(d), '9.9.9');                       // no exe: as64.exe first, as before
      assert.equal(gv.read(d, 'as64'), '9.9.9');
      assert.equal(gv.read(d, 'mowas2'), '3.2.6.2'); assert.equal(gv.read(d, 'mowas_2'), '3.2.6.2');
      assert.equal(gv.read(d, 'goh'), '1.0.6.7-test');
      fs.rmSync(P('as64.exe'));
      assert.equal(gv.read(d), '3.2.6.2');                     // no exe: falls to mowas_2.exe, as before
      assert.equal(gv.read(d, 'as64'), null);                  // named: no other exe answers for it
      w(P('version.txt'), '3.301\r\n');
      assert.equal(gv.read(d, 'as64'), '3.301');               // then the version files, as the no-exe form
      assert.equal(gv.read(null, 'goh'), null);
      assert.throws(() => gv.read(d, 'gates'), /unknown game gates/);
    } finally { rm(d); }
  });
};

// minimal PE32 with one resource section holding RT_VERSION / 1 / 0x409 whose block carries ProductVersion = v
function pe(v) {
  const b = Buffer.alloc(0x400);
  b.write('MZ', 0, 'latin1'); b.writeUInt32LE(0x40, 0x3C);
  const P = 0x40; b.write('PE\0\0', P, 'latin1');
  b.writeUInt16LE(1, P + 6); b.writeUInt16LE(0xE0, P + 20);
  const opt = P + 24; b.writeUInt16LE(0x10B, opt); b.writeUInt32LE(0x1000, opt + 96 + 16);   // data dir 2 = resources
  const sec = opt + 0xE0; b.writeUInt32LE(0x200, sec + 8); b.writeUInt32LE(0x1000, sec + 12); b.writeUInt32LE(0x200, sec + 16); b.writeUInt32LE(0x200, sec + 20);
  const R = 0x200, dir = (off, id, target) => { b.writeUInt16LE(1, R + off + 14); b.writeUInt32LE(id, R + off + 16); b.writeUInt32LE(target, R + off + 20); };
  dir(0x00, 16, (0x80000000 | 0x18) >>> 0); dir(0x18, 1, (0x80000000 | 0x30) >>> 0); dir(0x30, 0x409, 0x48);
  const blk = Buffer.concat([Buffer.from('ProductVersion\0', 'utf16le'), Buffer.alloc(2), Buffer.from(v + '\0', 'utf16le')]);
  b.writeUInt32LE(0x1000 + 0x60, R + 0x48); b.writeUInt32LE(blk.length, R + 0x4C);
  blk.copy(b, R + 0x60);
  return b;
}

if (require.main === module) {
  const assert = require('assert');
  let n = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } }, assert);
  console.log(`${n} passed`);
}

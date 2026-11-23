// game parity: map.net forms per game on invented files (no install read). binhdr - --folder DIR [--exe ..] --ext net
//   cell 5, version 2: AS64 / MoW:AS2 NET_CELL (PORT-70); GoH no finding (GHMAP-06)
//   cell 10, version 1 (4-byte cells): AS64 / MoW:AS2 no finding; GoH NET_VERSION (version byte ignored, read as v2: GHMAP-16)
//   bad --exe: exit 2
// Author: Imperator_Aug (ARSENAL, ia-c1a2e0b7)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), cp = require('child_process');
const cli = path.join(__dirname, '..', 'binhdr.js');
const dir = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'binhdr-game-'));
const u8 = (...a) => Buffer.from(a), T = s => Buffer.from(s, 'latin1');
const hdr = (cell, ver, w, h) => Buffer.concat([u8(cell, ver, w & 255, w >> 8, h & 255, h >> 8), Buffer.alloc(8)]);
const w = (rel, buf) => { const p = path.join(dir, 'resource', rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
w('map/goh_cell5/map.net', Buffer.concat([hdr(5, 2, 3, 2), T('MAP0'), u8(0), T('MAP1'), u8(0), T('GRID'), Buffer.alloc(3 * 2 * 4)]));
w('map/as2_v1/map.net', Buffer.concat([hdr(10, 1, 3, 2), Buffer.alloc(3 * 2 * 4)]));
const run = (...a) => cp.spawnSync(process.execPath, [cli, '-', '--folder', dir, '--ext', 'net', '--no-rc', ...a], { encoding: 'utf8' });
const codes = r => r.stdout.split(/\r?\n/).filter(l => /^resource\//.test(l)).map(l => l.replace(/^(resource\/\S+?)(?::\d+)?: (\S+) .*/, '$1 $2')).sort().join(' | ');
try {
  const as64 = run(), mow = run('--exe', 'mowas_2'), mow2 = run('--exe', 'mowas2'), goh = run('--exe', 'goh');
  assert.equal(codes(as64), 'resource/map/goh_cell5/map.net NET_CELL', 'AS64: cell 5 is NET_CELL, v1 fine');
  assert.equal(as64.stdout, mow.stdout, 'MoW:AS2 = AS64');
  assert.equal(as64.stdout, mow2.stdout, 'mowas2 = mowas_2');
  assert.equal(codes(goh), 'resource/map/as2_v1/map.net NET_VERSION', 'GoH: cell 5 fine, v1 is NET_VERSION');
  assert.ok(/GHMAP-16/.test(goh.stdout), 'GoH row cited');
  const bad = run('--exe', 'nope');
  assert.equal(bad.status, 2, 'bad --exe exits 2');
  assert.ok(/--exe must be one of/.test(bad.stderr));
  // the not-a-game hint knows the GoH exe: an empty GoH-shaped folder reads 0 files but is not called "not a game dir"
  const gd = path.join(dir, 'gohgame'); fs.mkdirSync(path.join(gd, 'binaries', 'x64'), { recursive: true }); fs.mkdirSync(path.join(gd, 'resource'));
  fs.writeFileSync(path.join(gd, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
  const nd = path.join(dir, 'nogame'); fs.mkdirSync(nd);
  const h1 = cp.spawnSync(process.execPath, [cli, gd, '--exe', 'goh', '--no-rc'], { encoding: 'utf8' });
  const h2 = cp.spawnSync(process.execPath, [cli, nd, '--no-rc'], { encoding: 'utf8' });
  assert.ok(/0 files read/.test(h1.stderr) && !/does not look like a game dir/.test(h1.stderr), 'GoH folder: no not-a-game hint: ' + h1.stderr);
  assert.ok(/does not look like a game dir/.test(h2.stderr), 'plain folder: hint kept');
  // --paks with no --exe: a paks root inside a GoH install (<GoH>/resource) takes the GoH forms; a plain paks root keeps the AS2 forms
  const cell5 = Buffer.concat([hdr(5, 2, 3, 2), T('MAP0'), u8(0), T('MAP1'), u8(0), T('GRID'), Buffer.alloc(3 * 2 * 4)]);
  const pk = root => { fs.mkdirSync(root, { recursive: true }); require('../../lib/zipwrite').writeZip(path.join(root, 'maps.pak'), [['map/m1/map.net', cell5]]); return root; };
  const pg = c => cp.spawnSync(process.execPath, [cli, '--paks', c, '--ext', 'net', '--no-rc'], { encoding: 'utf8' });
  const pGoh = pg(pk(path.join(gd, 'resource'))), pAs2 = pg(pk(path.join(dir, 'plainpaks')));
  assert.ok(/(^|\n)0 findings/.test(pGoh.stdout) && !/NET_CELL/.test(pGoh.stdout), '--paks <GoH>/resource: GoH forms: ' + pGoh.stdout);
  assert.ok(/NET_CELL/.test(pAs2.stdout), '--paks plain root: AS2 forms: ' + pAs2.stdout);
  // the art check route form for MoW:AS2 / GoH: '<gameDir> --folder <mod> --format json --exe <exe>': only the folder's files, game forms of --exe
  const rj = x => { const r = cp.spawnSync(process.execPath, [cli, gd, '--folder', dir, '--format', 'json', '--no-rc', '--ext', 'net', '--exe', x], { encoding: 'utf8' }); assert.equal(r.status === 2, false, 'route form runs: ' + r.stderr); return JSON.parse(r.stdout); };
  const fc = j => (j.findings || []).map(f => f.file + ' ' + f.code).sort().join(' | ');
  assert.equal(fc(rj('goh')), 'resource/map/as2_v1/map.net NET_VERSION', 'route form --exe goh: GoH forms, folder files only');
  assert.equal(fc(rj('mowas_2')), 'resource/map/goh_cell5/map.net NET_CELL', 'route form --exe mowas_2: AS2 forms');
  // --exe goh with no gameDir and no GoH install found: one line says so, then the usage, exit 2
  const ni = cp.spawnSync(process.execPath, [cli, '--exe', 'goh', '--no-rc'], { encoding: 'utf8', env: { ...process.env, AS2_NO_STEAM: '1', GOH_GAME: '' } });
  assert.equal(ni.status, 2, 'no GoH install: exit 2');
  assert.equal(ni.stderr.split(/\r?\n/)[0], 'binhdr: no GoH install found (set GOH_GAME or give <gameDir>)', 'no GoH install line: ' + ni.stderr);
  console.log('game PASS');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

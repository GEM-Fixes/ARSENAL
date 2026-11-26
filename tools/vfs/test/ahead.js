// vfs CLI speed path: a view from lib/modtree listings (restore points left out of the scan) equals the walked one; chk refTexts
// gives the same texts as readRec (loose, stored and deflated pak entries); checksAsync = checks. run by run.sh (scratch in temp)
// Author: Imperator_Aug (ARSENAL, ia-4cf50047)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const vfs = require('../../lib/vfs'), modtree = require('../../lib/modtree'), { zip } = require('../../lib/zipwrite'), chk = require('../chk');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-ahead-')), game = path.join(root, 'game');
const put = (base, rel, data) => { const f = path.join(base, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
put(game, 'resource/set/user.set', '{use "set/gone.set"}'); put(game, 'resource/set/gone.set', 'gone');
put(game, 'resource/gamelogic.pak', zip([['set/packed.set', Buffer.from('{x "Set\\Gone"}'), false], ['entity/t.def', Buffer.from('{e "set/gone.set"}'.repeat(50)), true]]));
const m = path.join(game, 'mods', 'm');
put(m, 'mod.info', '{mod\r\n\t{name "m"}\r\n\t{minGameVersion "3.000.0"}\r\n\t{maxGameVersion "3.999.9"}\r\n\t{Delete "resource/set/gone.set"}\r\n}\r\n');
put(m, 'resource/set/own.set', '{own}'); put(m, 'resource/entity/u.def', '{use "set/gone"}');
put(m, '.arsenal-undo/t1/files/resource/set/own.set', 'restore point'); put(m, 'resource/set/.arsenal-undo/r.set', 'mounted by the walk');

let n = 0;
(async () => {
  modtree._reset({ store: null });
  const T = await modtree.scan(m);
  assert.ok(T.left.includes('.arsenal-undo') && T.left.includes('resource/set/.arsenal-undo'), 'restore points left out of the scan');
  const a = vfs.build({ gameDir: game, mods: ['m'], exe: 'mowas_2' }), b = vfs.build({ gameDir: game, mods: ['m'], exe: 'mowas_2', listings: [T] });
  const rows = v => [...v.files].map(([k, r]) => [k, r.source, r.container, r.entry, r.layer, r.size].join('|'));
  assert.deepEqual(rows(b), rows(a)); assert.ok(a.files.has('resource/set/.arsenal-undo/r.set')); n++;
  assert.deepEqual(b.problems, a.problems); assert.equal(b.shadows.length, a.shadows.length); n++;
  const pre = await chk.refTexts(a, { window: 2 });
  const kinds = new Set();
  for (const [k, r] of a.files) {
    if (!/\.(def|set|ext|inc|mi|mtl|lua|mis|scn)$/.test(k)) continue;
    assert.equal(pre.get(k), vfs.readRec(r).toString('latin1').toLowerCase().replace(/\\/g, '/'), k);
    kinds.add(r.source + (r.ent ? r.ent.method : ''));
  }
  vfs.closeRecs();
  assert.deepEqual([...kinds].sort(), ['loose', 'pak0', 'pak8']); n++;
  const want = chk.checks(a, { list: ['m'] }), got = await chk.checksAsync(a, { list: ['m'] });
  assert.deepEqual(got, want); assert.ok(want.some(p => p.code === 'MOD_DELETE_REFERENCED')); n++;
  assert.equal((await chk.refTexts(vfs.build({ gameDir: game, mods: [], exe: 'mowas_2' }))).size, 0, 'no delete: nothing read'); n++;
  fs.rmSync(root, { recursive: true, force: true });
  console.log('ahead ok ' + n);
})().catch(e => { console.log('FAIL ahead: ' + (e && e.stack || e)); process.exit(1); });

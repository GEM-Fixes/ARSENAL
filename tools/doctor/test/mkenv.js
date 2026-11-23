// fixture: mod m with map mm: mod/entity/a.def (own loose copy resource/entity/a.def), b.def (own pak copy), c.def (none); loose map + own pak map
// Author: Imperator_Aug (ARSENAL, ia-dcd15913)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const R = path.join(process.env.TEST_WORK || __dirname, 'fx', 'env', 'game'), M = path.join(R, 'mods', 'm', 'resource');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
w(path.join(R, 'mods', 'm', 'mod.info'), '{Mod\n {Name "m"}\n}\n'); fs.mkdirSync(path.join(R, 'resource'), { recursive: true });
w(path.join(M, 'entity', 'a.def'), '{x}\n');
for (const f of ['a', 'b', 'c']) w(path.join(M, 'map', 'multi', 'mm', 'mod', 'entity', f + '.def'), '{x}\n');
w(path.join(M, 'map', 'multi', 'mm', 'map'), 'm');
// minimal stored zip with entries
function zip(entries) {
  const loc = [], cen = []; let off = 0;
  for (const [n, d] of entries) {
    const nb = Buffer.from(n), db = Buffer.from(d), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(db.length, 18); h.writeUInt32LE(db.length, 22); h.writeUInt16LE(nb.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(db.length, 20); c.writeUInt32LE(db.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    loc.push(h, nb, db); cen.push(c, nb); off += 30 + nb.length + db.length;
  }
  const cb = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cb.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cb, e]);
}
fs.writeFileSync(path.join(M, 'own.pak'), zip([['entity/b.def', '{x}\n'], ['map/multi/mm/map', 'm']]));

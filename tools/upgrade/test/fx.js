// fixture: an old (mowas2 3.262 era) mod built byte-exact into a folder, so git line-end settings never change it
// loose: mod.info (3.262 range + FileId), a set file with SequentialAim (aim-sequential warn row), an lng, a stray dll (block row)
// paks: u1.pak + u2.pak need no change (hardlinked), c.pak holds a dll (rebuilt without it)
// Author: Imperator_Aug (ARSENAL, ia-8a562adf)
const fs = require('fs'), path = require('path');
function zip(files) {
  const lfs = [], cds = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name), d = Buffer.from(text);
    const lf = Buffer.alloc(30); lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt32LE(d.length, 18); lf.writeUInt32LE(d.length, 22); lf.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(d.length, 20); cd.writeUInt32LE(d.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    lfs.push(lf, n, d); cds.push(cd, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cds), e = Buffer.alloc(22), cnt = Object.keys(files).length;
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cnt, 8); e.writeUInt16LE(cnt, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...lfs, cd, e]);
}
const put = (root, rel, b) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); };
function build(root) {
  put(root, 'mod.info', '{mod\r\n {name "oldmod"}\r\n {FileId "123456"}\r\n {MinGameVersion "3.262.1"}\r\n {MaxGameVersion "3.262.1"}\r\n}\r\n');
  put(root, 'resource/set/stuff/gun.set', '{set\r\n {SequentialAim 1}\r\n {name "gun"}\r\n}\r\n');
  put(root, 'resource/text/en.lng', '{tags\r\n {oldmod_hello "Hello é"}\r\n}\r\n');
  put(root, 'resource/bin/loose.dll', 'MZ loose');
  put(root, 'resource/u1.pak', zip({ 'entity/a/a.def': '{a}\r\n', 'entity/a/b.def': '{b}\r\n' }));
  put(root, 'resource/u2.pak', zip({ 'set/s.def': '{s}\r\n' }));
  put(root, 'resource/c.pak', zip({ 'entity/c/c.def': '{c}\r\n', 'bin/hook.dll': 'MZ packed' }));
}
module.exports = { build };

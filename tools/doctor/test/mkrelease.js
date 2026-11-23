// seeded release fixture → test/rel/<mod>: one defect per line in rel-truth.md
// Author: Imperator_Aug (ARSENAL, ia-94e6d9e5)
const fs = require('fs'), path = require('path'), { writeZip } = require('../../lib/zipwrite');
const root = path.join(process.env.TEST_WORK || __dirname, 'rel', 'm');
fs.rmSync(path.join(process.env.TEST_WORK || __dirname, 'rel'), { recursive: true, force: true });
const w = (rel, d = 'x') => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d); };
w('mod.info', '{Mod\n {Name "m"}\n {MinGameVersion "3.262"}\n {MaxGameVersion "3.262"}\n}\n');
w('.git/config'); w('Thumbs.db'); w('resource/entity/a.bak'); w('resource/entity/b.orig');
w('art/hero.psd'); w('notes.txt'); w('resource/entity/ok.def'); w('resource/entity/ok.mtl', 'abc');
w('resource/entity/ok.ply', 'abcd'); w('resource/script/s.lua', 'x'); w('resource/texture/t.dds');
w('resource/entity/dup.def', 'loose'); fs.mkdirSync(path.join(root, 'resource/empty'), { recursive: true });
w('1.pat');
writeZip(path.join(root, 'resource.pak'), [['entity/dup.def', Buffer.from('pak')], ['entity/p.anm', Buffer.from('anm')], ['entity/p.vol', Buffer.from('v')]]);

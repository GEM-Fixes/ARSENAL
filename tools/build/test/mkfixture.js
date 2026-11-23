// build fixture: fixture/clean (reaches pack, dry) + fixture/bad (one seeded defect per stage) + truth.md
// truth line = "stage CODE" (diffed against build --json by run.sh)
// Author: Imperator_Aug (ARSENAL, ia-30c3569e)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const put = (mod, rel, lines) => {
  const f = path.join(dir, mod, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from((Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines), 'latin1'));
};
const info = ['{Mod', '\t{Name "fx"}', '\t{MinGameVersion "3.262"}', '\t{MaxGameVersion "3.262"}'];
function common(m) {
  put(m, 'resource/entity/ok/ok.def', ['{game_entity', '\t{Extension "ok.mdl"}', '}']);
  put(m, 'resource/entity/ok/ok.mdl', ['{Skeleton', '}']);
  put(m, 'resource/properties/ok.lng', Buffer.from('{tags\r\n\t{"entity" {"ok" "Ok"}}\r\n}\r\n', 'utf8').toString('latin1'));
}
// minimal EPLY (BNDS + MESH naming a material + VERT + INDX): enough for binhdr to walk
const cat = (...a) => Buffer.concat(a), T = x => Buffer.from(x, 'latin1'), i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; }, u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }, u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const plyFile = mtl => cat(T('EPLY'), T('BNDS'), Buffer.alloc(24), T('MESH'), u32(0x112), i32(0), i32(1), u32(0x404), Buffer.from([mtl.length]), T(mtl),
  T('VERT'), i32(3), u16(32), u16(7), Buffer.alloc(96), T('INDX'), i32(3), u16(0), u16(1), u16(2));
const meshMod = (m, n, mtl, hasMtl) => {   // def -> mdl -> ply (-> mtl)
  put(m, `resource/entity/${n}/${n}.def`, ['{game_entity', `\t{Extension "${n}.mdl"}`, '}']);
  put(m, `resource/entity/${n}/${n}.mdl`, ['{Skeleton', `\t{bone "basis" {VolumeView "${n}.ply"}}`, '}']);
  put(m, `resource/entity/${n}/${n}.ply`, plyFile(mtl).toString('latin1'));
  if (hasMtl) put(m, `resource/entity/${n}/${mtl}`, ['{material simple}']);
};
// clean
put('clean', 'mod.info', [...info, '}']);
common('clean');
meshMod('clean', 'me', 'me.mtl', true);
// bad
put('bad', 'mod.info', [...info, '\t{Desk "x"}', '}']);                       // modinfo UNKNOWN_KEY
common('bad');
meshMod('bad', 'me', 'gone.mtl', false);   // binhdr PLY_MTL_MISSING (reached by me.def)
put('bad', 'resource/set/broken.set', [';SDL', '{a', '\t{b 1}', '']);          // lint (sdllint) BLOCK_UNCLOSED
put('bad', 'resource/entity/k/k.def', ['{game_entity', '\t{masss 5}', '}']);   // keylint WARN_UNKNOWN_KEY
put('bad', 'resource/properties/dup.lng', Buffer.from('{tags\r\n\t{"entity" {"a" "A"} {"A" "B"}}\r\n}\r\n', 'utf8').toString('latin1')); // lnglint
put('bad', 'resource/entity/r/r.def', ['{game_entity', '\t{Extension "nomodel.mdl"}', '}']);   // refcheck
put('bad', 'localization/#dlg_ingame.lng', Buffer.from('{tags\r\n\t{"component" {"gun_ok" "Gun ok"}}\r\n}\r\n', 'utf8').toString('latin1'));
put('bad', 'resource/entity/test/t.def', [';SDL', '{entity', '\t{damage_report "gun" "component/gun_brokn"}', '}']);   // loccover LOC_DAMAGE_KEY
put('bad', 'resource/map/multi/m1/map.info', [';SDL', '{game', '\t{maxPlayers 3}', '}']);        // milint MAP_PLAYERS
put('bad', 'resource/set/lf.set', '{x 1}\n{y 2}\n');                                                                // pack WARN_TEXT_NOT_CRLF
// workspace: wb(as64+ builtin) <- wa; wc requires missing mod; wd <-> we cycle
const wsMod = (n, req) => { put('ws/' + n, 'mod.info', [...info, ...req.map(r => `\t{Require "${r}"}`), '}']); common('ws/' + n); };
wsMod('wa', ['wb']); wsMod('wb', ['as64+']); wsMod('wc', ['nope']); wsMod('wd', ['we']); wsMod('we', ['wd']);

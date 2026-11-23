// seeded: macro findings judged through the includer in the vfs (rows 57/163), "<mod> patch N" layers in scope (168), GoH exe in binaries/x64 (86)
// Author: Imperator_Aug (ARSENAL, ia-290c6e2e)
const fs = require('fs'), path = require('path'), os = require('os'), sdllint = require('../sdllint'), { zip } = require('../../lib/zipwrite');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'sdllint-vfs-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  const list = r => { const j = r.toJSON({ tool: 'sdllint' }); return [...j.findings, ...j.info].map(f => ({ ...f, file: (f.file || '').replace(/\\/g, '/') })); };
  const at = (l, s, code) => l.filter(f => f.file.includes(s) && f.code === code).length;

  // 57/163: base file defines "mm" and includes both fragments; the folder ships only the fragments
  put('game/resource/set/multiplayer/main.set', '(define "mm" {v 1})\r\n(include "/set/multiplayer/other/frag4.set")\r\n(include "/set/multiplayer/other/frag3.set")\r\n(include "/set/multiplayer/units/frag.set")\r\n');
  put('fold/resource/set/multiplayer/other/frag4.set', '("mm")\r\n');
  put('fold/resource/set/multiplayer/other/frag3.set', '("nope")\r\n');
  put('fold/resource/set/multiplayer/units/frag.set', '("mm")\r\n');
  put('fold/resource/set/multiplayer/units/orphan.set', '("nope")\r\n');
  let l = list(sdllint.run({ folder: path.join(w, 'fold'), gameDir: path.join(w, 'game') }));
  ok(l.filter(f => f.file.includes('frag4.set') || f.file.endsWith('units/frag.set')).length === 0, 'fragment whose define is in the includer must be quiet: ' + JSON.stringify(l));
  ok(at(l, 'frag3.set', 'MACRO_UNDEFINED') === 1, 'name missing in the includer too stays an error');
  ok(at(l, 'orphan.set', 'SDL_FRAGMENT_MACRO') === 1, 'roster nobody includes stays info');

  // 168: mod m1 has 1.pat with a bad file; scope m1 must lint it
  put('game2/resource/x.def', '{game_entity}\r\n');
  put('game2/mods/m1/mod.info', '{Mod\r\n {Name "m1"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n');
  fs.writeFileSync(path.join(w, 'game2/mods/m1/1.pat'), zip([['.patch', Buffer.from('{Patch {id 1}}\r\n')], ['entity/p.def', Buffer.from('("nope")\r\n')]]));
  l = list(sdllint.run({ folder: path.join(w, 'game2/mods/m1'), gameDir: path.join(w, 'game2'), mods: ['m1'], scope: 'm1' }));
  ok(at(l, 'entity/p.def', 'MACRO_UNDEFINED') === 1, 'm1 patch 1 layer in scope: ' + JSON.stringify(l));

  // 86: GoH exe is in binaries/x64
  put('goh/binaries/x64/call_to_arms.exe', 'not a pe');
  put('goh/resource/x.def', '{game_entity}\r\n');
  put('gfold/resource/entity/g.def', '{game_entity\r\n\t{##place "x" {a 1}}\r\n}\r\n');
  l = list(sdllint.run({ folder: path.join(w, 'gfold'), gameDir: path.join(w, 'goh') }));
  ok(at(l, 'g.def', 'SDL_GOH_DISABLED_TAG') === 1 && at(l, 'g.def', 'TAG_SWALLOWS') === 0, 'GoH dir detected from binaries/x64: ' + JSON.stringify(l));

  // GOHMOD-3 seeded GoH case: Workshop-style mod outside <game>/mods, all paks under resource/; vanilla GoH forms are info
  const gp = Buffer.from('{game_entity\r\n\t{## a /* b */}\r\n\t(mod "hardcore" {x 1})\r\n\t{dmg 40 % MP}\r\n}\r\n');
  const bad = Buffer.from('{game_entity\r\n\t{a "open\r\n}\r\n');
  fs.mkdirSync(path.join(w, 'wpak/resource'), { recursive: true });
  fs.writeFileSync(path.join(w, 'wpak/resource/a.pak'), zip([['entity/p.def', gp], ['entity/q.def', bad], ['texture/fx/license', Buffer.from('made by a.b\r\n')]]));
  fs.mkdirSync(path.join(w, 'wpak/localizations'), { recursive: true });
  fs.writeFileSync(path.join(w, 'wpak/localizations/ru.pak'), zip([['ru/x', Buffer.from('{a "b\r\n')]]));
  l = list(sdllint.run({ folder: path.join(w, 'wpak'), gameDir: path.join(w, 'goh') }));
  const errs = l.filter(f => f.severity !== 'info' && !/^(SDL_|SDLLINT_)/.test(f.code)).map(f => f.file + ':' + f.line + ':' + f.code).sort().join(' ');
  ok(errs === 'resource/a.pak!entity/q.def:1:BLOCK_UNCLOSED resource/a.pak!entity/q.def:2:STR_NEWLINE', 'GoH pak mod: only q.def errors: ' + errs);
  ok(at(l, 'p.def', 'SDL_GOH_MOD_NAME') === 1 && at(l, 'p.def', 'SDL_GOH_PERCENT') === 1 && at(l, 'p.def', 'SDL_GOH_DISABLED_TAG') >= 1, 'GoH forms are info: ' + JSON.stringify(l));
  ok(at(l, 'wpak', 'SDLLINT_PAKS_READ') === 1 && at(l, 'wpak', 'WARN_SDLLINT_PAKS_UNREAD') === 0 && at(l, 'license', 'IDENT_SPLIT') === 0, 'paks read, license skipped: ' + JSON.stringify(l));
  // same folder against an AS2 game dir: unchanged as64 behaviour, paks not read, warning stays
  l = list(sdllint.run({ folder: path.join(w, 'wpak'), gameDir: path.join(w, 'game') }));
  ok(at(l, 'wpak', 'WARN_SDLLINT_PAKS_UNREAD') === 1 && at(l, 'q.def', 'BLOCK_UNCLOSED') === 0, 'AS2 dir: paks unread as before: ' + JSON.stringify(l));
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('vfs ok');
process.exit(bad ? 1 : 0);

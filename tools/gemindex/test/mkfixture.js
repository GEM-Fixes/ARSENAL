// gemindex fixture: writes a tiny made-up index (guides.json, builtin/builtin-faq.json, builtin/builtin-pages.pack) into <dir>.
// All titles and texts are invented for tests; no real page text is ever copied into the repo. Usage: node mkfixture.js <dir> [--bad-magic]
// Author: Imperator_Aug (ARSENAL, ia-e3e587a7)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const S = id => 'https://steamcommunity.com/sharedfiles/filedetails/?id=' + id;
const R = (game, comp, sub, title, url, x) => Object.assign({ game, comp, sub, title, url, note: '', lang: 'en', source: 'index' }, x || {});
const ROWS = [
  R('as2', 'Editor', 'Editor basics and map making', 'Fixture Editor Map Guide', S('426525938')),                        // guide (also a gaps url)
  R('as2', 'Editor', 'Minimaps', 'Fixture minimap walk-through', S('9000000001')),                                        // guide
  R('gem2', 'Audio', 'Voices', 'Fixture adding a unit voice', 'https://www.moddb.com/games/men-of-war-assault-squad-2/tutorials/adding-new-unit-voice'), // guide (moddb tutorial)
  R('rts', 'Animation', 'Overview', 'Fixture animation docs', 'https://docs.bestway.com.ua/animation'),                    // guide (docs)
  R('rts', 'Foundations', 'Best Way docs', 'Fixture llms text', 'https://docs.bestway.com.ua/llms.txt'),                    // less (llms.txt)
  R('all', 'Community and hubs', 'Mod lists and collections', 'Fixture collection', S('9000000002')),                     // less (steam but hub)
  R('gem2', 'Archived forum threads', 'Old forum', 'Fixture archived thread about tanks', 'https://web.archive.org/web/2015/http://example.invalid/t/1', { source: 'wayback', less: true }),
  R('gem2', 'Archived forum threads', 'Old forum', 'Fixture %D1%82%D0%B5%D1%81%D1%82 encoded title', 'https://web.archive.org/web/2016/http://example.invalid/t/2', { source: 'wayback', less: true, lang: 'ru' }),
  R('gem2', 'Modelling', 'Models and export', 'Fixture Russian modelling page', 'https://mow-portal.example.invalid/model-1', { lang: 'ru', source: 'foreign', less: true }),
  R('as2', 'Gameplay', 'Tactics', 'Fixture tactics guide', S('9000000003'), { lang: '' }),                                // guide, blank lang
  R('as2', 'Editor', 'Editor basics and map making', 'Fixture guide only on Discord', S('9000000004'), { source: 'discord', less: true, from: 'x', fromUrl: 'x' }),
  R('gem2', 'Gameplay', 'Chat', 'Fixture discord chat link', 'https://discord.com/channels/1/2/3', { source: 'discord', less: true, from: 'x', fromUrl: 'x' }),
  R('all', 'Modding tools', 'Blender add-ons', 'Fixture GEM Blender add-on', S('3774985290'), { category: 'tools' }),
  R('all', 'Modding tools', 'Blender add-ons', 'Fixture MDL exporter', 'https://github.example.invalid/mdl-exporter', { category: 'tools' }),
  R('gem2', 'Modding tools', 'Textures and DDS', 'Fixture texture exporter', 'https://developer.nvidia.com/texture-tools-exporter', { category: 'tools', source: 'discord', less: true, from: 'x', fromUrl: 'x' }),
  R('gem2', 'Modding tools', 'Files posted on Discord', 'Fixture file on Discord', 'https://cdn.discordapp.example.invalid/f.zip', { category: 'tools', source: 'discord', less: true, from: 'x', fromUrl: 'x' }),
  R('goh', 'Modding tools', 'Mod managers', 'Fixture GoH mod manager', 'https://github.com/alexbdka/goh-mod-manager', { category: 'tools' }),
  R('all', 'Modding tools', 'SOEdit and object editors', 'Fixture SOEdit', 'https://mow-portal.com/blogs/blog_tonator/1101-soedit-version-next-v07m5.html', { category: 'tools', lang: 'ru' }),
  R('as64', 'Troubleshooting and setup', 'Crashes', 'Fixture AS64 crash note', 'https://example.invalid/as64-crash'),          // less (not a guide url)
  R('goh', 'Textures and materials', 'Skins', 'Fixture GoH skin guide', S('9000000005')),                                   // guide
];
const GAMES = { all: 'All GEM games (cross-game)', gem2: 'GEM 2: shared', as2: 'GEM 2: Men of War: Assault Squad 2 (MoWAS2)', as64: 'GEM 2: AS64', goh: 'GEM 2: Gates of Hell', rts: 'GEM RTS: Men of War II' };
const FAQ = [
  { Id: 'f00000000001', Q: 'Fixture: coloured stripes at the map edge in the editor?', A: 'Fixture answer: they are camera clips; delete the editor desktop file.', Game: 'as2', Comp: 'Editor', Lang: 'en', Kind: 'web', SourceName: 'fixture forum', SourceUrl: 'https://example.invalid/faq1', Status: 'approved', Score: 11 },
  { Id: 'f00000000002', Q: 'Фикстура: как добавить звук?', A: 'Фикстура: сохраните wav и пропишите его в sfx.', Game: 'gem2', Comp: 'Audio', Lang: 'ru', Kind: 'web', SourceName: 'fixture forum', SourceUrl: 'https://example.invalid/faq2', Status: 'new', Score: 5 },
  { Id: 'f00000000003', Q: 'Fixture discord question', A: 'Fixture discord answer', Game: 'gem2', Comp: 'Gameplay', Lang: 'en', Kind: 'discord', SourceName: 'server', SourceUrl: '', Status: 'new', Score: 3 },
];
const PAGES = [
  { id: 'aaaaaaaaaaa1', url: S('426525938'), lang: 'en', title: 'Fixture Editor Map Guide', text: 'Fixture page text. Open the editor, make a new map, paint the terrain, place a minimap. The zorkleberry word is only here.\n' + 'More lines. '.repeat(600) + 'END-OF-PAGE' },
  { id: 'aaaaaaaaaaa2', url: 'https://web.archive.org/web/2015/http://example.invalid/t/1', lang: 'en', title: 'old thread', text: 'Archived fixture thread about tank armour and the quixotic flange setting.' },
  { id: 'aaaaaaaaaaa3', url: 'https://www.moddb.com/games/men-of-war-assault-squad-2/tutorials/adding-new-unit-voice', lang: 'en', title: 'voice', text: 'Fixture voice text: save a mono wav file and name it in the sfx.' },
];

function bwString(s) { const b = Buffer.from(s, 'utf8'), len = []; let n = b.length; do { let x = n & 127; n >>>= 7; if (n) x |= 128; len.push(x); } while (n); return Buffer.concat([Buffer.from(len), b]); }
function pack(entries, badMagic) {
  const parts = [], idx = [];
  let off = 16;
  for (const [name, text] of entries) { const gz = zlib.gzipSync(Buffer.from(text, 'utf8')); parts.push(gz); idx.push([name, off, gz.length]); off += gz.length; }
  const head = Buffer.alloc(16); head.write(badMagic ? 'BADPACK1' : 'GEMPACK1', 0, 'latin1'); head.writeBigInt64LE(BigInt(off), 8);
  const ib = [Buffer.alloc(4)]; ib[0].writeInt32LE(idx.length, 0);
  for (const [name, o, l] of idx) { const t = Buffer.alloc(12); t.writeBigInt64LE(BigInt(o), 0); t.writeInt32LE(l, 8); ib.push(bwString(name), t); }
  return Buffer.concat([head, ...parts, ...ib]);
}

function make(dir, o) {
  o = o || {};
  fs.mkdirSync(path.join(dir, 'builtin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'guides.json'), JSON.stringify({ built: '2026-11-04', games: GAMES, rows: ROWS.concat(o.extraRows || []) }, null, 1));
  if (o.edits) fs.writeFileSync(path.join(dir, 'builtin', 'builtin-edits.json'), JSON.stringify(o.edits, null, 1));
  fs.writeFileSync(path.join(dir, 'builtin', 'builtin-faq.json'), JSON.stringify(FAQ, null, 1));
  const pages = PAGES.concat(o.extraPages || []);   // extraPages: [{id, url, lang, title, text, verdict?}]
  const results = pages.map(p => ({ id: p.id, url: p.url, lang: p.lang, title: p.title, status: 200, verdict: p.verdict || 'ok' }));
  fs.writeFileSync(path.join(dir, 'builtin', 'builtin-pages.pack'), pack([['results.json', JSON.stringify(results)], ['guides.snapshot.json', '{"rows":[]}'], ...pages.map(p => ['text/' + p.id + '.txt', p.text])], o.badMagic));
  return dir;
}

if (require.main === module) { const d = process.argv[2]; if (!d) { console.error('usage: mkfixture.js <dir> [--bad-magic]'); process.exit(2); } make(path.resolve(d), { badMagic: process.argv.includes('--bad-magic') }); console.log('fixture ' + d); }
module.exports = { make, ROWS, FAQ, PAGES, R, pack };

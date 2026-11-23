// mcp knowledge test: every tool of tools/mcp/tools/knowledge.js on the real repo data (webs, gameprofile, tools/index, guide), over the pipe.
// Author: Imperator_Aug (ARSENAL, ia-06b2b38b)
'use strict';
const { rpc, callMsg, flat, T, NOTES } = require('./rpc');
const t = T('knowledge');
const N = (f, msg) => t.ok(!NOTES || f(), msg);   // NOTES false: a copy without the note folders

(async () => {
  try {
    const calls = [
      ['mow_lookup', { query: 'VFS-01' }],                                  // 1 auto -> limit
      ['mow_lookup', { query: 'armor thickness', max: 5 }],                  // 2 words
      ['mow_lookup', { query: 'vfs mount', mode: 'topic' }],                 // 3 topic
      ['mow_lookup', { query: 'VFS-01', mode: 'cite' }],                     // 4 cite
      ['mow_lookup', { query: 'sound folder', game: 'goh', max: 5 }],        // 5 GoH web
      ['mow_lookup', { query: 'GHVIS-29' }],                                 // 6 GoH id from any game
      ['mow_lookup', { query: 'x', mode: 'diff', game: 'mowas2' }],          // 7 na
      ['mow_lookup', { query: 'zzqqxxnothing yyvvnothing' }],                // 8 nothing found
      ['mow_lookup', { query: 'VFS-01 bogus', mode: 'limit' }],              // 9 bad id
      ['mow_limit', { ids: ['VFS-01', 'GHVIS-29'] }],                        // 10
      ['mow_limit', { ids: 'vfs-10' }],                                      // 11 lower case, text
      ['mow_limit', { words: 'pak zip' }],                                   // 12
      ['mow_limit', {}],                                                     // 13 nothing asked
      ['mow_limit', { ids: 'ZZZ-999' }],                                     // 14 unknown row
      ['mow_game_diff', { other: 'goh', key: 'exe' }],                       // 15
      ['mow_game_diff', { game: 'mowas2', key: 'exe' }],                     // 16 facts of one game
      ['mow_game_diff', { game: 'goh', other: 'goh' }],                      // 17 same game
      ['mow_game_diff', { game: 'as64', other: 'mowas2' }],                  // 18
      ['mow_tools', {}],                                                     // 19
      ['mow_tools', { what: 'cli' }],                                        // 20
      ['mow_tools', { find: 'armor' }],                                      // 21
      ['mow_tools', { tool: 'vfs' }],                                        // 22 CLI tool in full
      ['mow_tools', { tool: 'mow_guide' }],                                  // 23 MCP tool in full
      ['mow_tools', { tool: 'nosuchtoolzz' }],                               // 24
      ['mow_guide', {}],                                                     // 25
      ['mow_guide', { chapter: '7', lines: 5 }],                             // 26
      ['mow_guide', { chapter: 'p03', from: 3, lines: 2 }],                  // 27
      ['mow_guide', { search: 'top speed' }],                                // 28
      ['mow_guide', { search: 'speed', chapter: '07', max: 3 }],             // 29
      ['mow_guide', { chapter: '99' }],                                      // 30
      ['mow_guide', { chapter: '18', lang: 'ru', lines: 3 }],                // 31 translated
      ['mow_guide', { chapter: '07', lang: 'ru', lines: 3 }],                // 32 falls back to English
      ['mow_guide', { lang: '../x' }],                                       // 33
      ['mow_guide', { game: 'goh', search: 'zzqqxxnothing' }],               // 34
    ];
    const r = await rpc(calls.map((c, i) => callMsg(i + 1, c[0], c[1])), {});
    const a = i => flat(r.get(i));
    N(() => !a(1).isError && a(1).text.startsWith('VFS-01 |') && a(1).data.mode === 'limit', 'lookup: an id is read as a limit row');
    N(() => /^[A-Z]+-\d+ \|/m.test(a(2).text) && a(2).data.mode === 'words' && a(2).data.web === 'main', 'lookup words: limits rows');
    if (NOTES) t.has(a(3).text, 'modweb/vfs/mount.md', 'lookup topic: walks to a block');
    N(() => a(4).text.includes('VFS-01') || /not part of this release/.test(a(4).text), 'lookup cite: the row plus what backs it, or a plain "not in this release"');
    N(() => /^GH[A-Z]+-\d+ \|/m.test(a(5).text) && a(5).data.web === 'goh', 'lookup for goh: the GoH web');
    if (NOTES) t.has(a(5).text, 'not tested in game', 'GoH answers carry the untested note');
    N(() => a(6).text.startsWith('GHVIS-29 |'), 'lookup: a GH id goes to the GoH web');
    t.ok(!a(7).isError && a(7).data.na, 'lookup diff for mowas2: not available, in plain words');
    N(() => !a(8).isError && a(8).text.startsWith('nothing found') && a(8).text.includes('other words') && a(8).data.found === false, 'lookup: nothing found is said');
    t.ok(a(9).isError && a(9).text.includes('not a limit id'), 'lookup limit: a wrong id is refused');
    N(() => a(10).text.includes('VFS-01 |') && a(10).text.includes('GHVIS-29 |'), 'limit: ids from both webs in one call');
    N(() => a(11).text.startsWith('VFS-10 |'), 'limit: id as text, lower case');
    N(() => a(12).data.count > 0 && a(12).text.split('\n').filter(l => l && !/^\[|^limits:/.test(l)).every(l => /^[A-Z][A-Z0-9]*-\d+ \|/.test(l)), 'limit words: only limits rows');
    t.ok(a(13).isError && a(13).text.includes('ids'), 'limit: nothing asked is refused');
    t.ok(!a(14).isError && a(14).data.found === false, 'limit: unknown row is said');
    t.ok(a(15).text.includes('call_to_arms.exe') && a(15).text.includes('as64.exe') && a(15).data.differ >= 2, 'game diff as64 against goh, key exe');
    t.ok(a(16).text.includes('exe.main = mowas_2.exe') && a(16).data.game === 'mowas2', 'game diff: facts of one game');
    t.ok(a(17).isError, 'game diff: the same game twice is refused');
    t.ok(a(18).data.differ > 0 && a(18).data.same > 0, 'game diff as64 against mowas2: some differ, some are the same');
    t.ok(a(19).text.includes('mow_lookup [read]') && a(19).text.includes('writes: off') && a(19).text.includes('launches: off') && !a(19).text.includes('NOT LOADED'), 'tools: MCP list, write and launch state, every shipped module loads: ' + JSON.stringify(a(19).data && a(19).data.errors));
    t.ok(/\n {2}vfs {2}\S/.test(a(20).text) && a(20).data.cli > 50, 'tools cli: names with a usage line');
    t.has(a(21).text, 'armorsim', 'tools find: searches the CLI tools');
    t.ok(a(22).text.includes('node tools/vfs/vfs.js [gameDir]') && a(22).text.includes('tools/index/'), 'tools: one CLI tool in full');
    t.has(a(23).text, 'arguments:', 'tools: one MCP tool in full');
    t.ok(!a(24).isError && a(24).data.found === false, 'tools: unknown name is said');
    t.ok(a(25).data.chapters.length >= 30 && a(25).text.includes('07  ') && a(25).text.includes('p01  '), 'guide: chapter list');
    t.ok(a(26).text.includes('07-units-vehicles-movement.md') && a(26).data.to === 5 && a(26).text.includes('Next part: from 6'), 'guide: read a chapter in parts');
    t.ok(a(27).data.chapter === 'p03' && a(27).data.from === 3 && a(27).data.to === 4, 'guide: from and lines');
    t.ok(a(28).data.hits > 0 && /^\w+:\d+ /m.test(a(28).text), 'guide search: chapter:line hits');
    t.ok(a(29).text.split('\n').filter(l => /^07:\d+ /.test(l)).length === 3 && !/^(?!07)\w+:\d+ /m.test(a(29).text), 'guide search inside one chapter, capped');
    t.ok(a(30).isError && a(30).text.includes('no guide chapter'), 'guide: unknown chapter is refused');
    t.ok(a(31).data.lang === 'ru', 'guide: a translated chapter');
    t.ok(a(32).data.lang === 'en', 'guide: no translation = English');
    t.ok(a(33).isError, 'guide: lang must be a language code');
    t.ok(!a(34).isError && a(34).text.includes('no guide line') && a(34).text.includes('Gates of Hell'), 'guide for goh: says what the guide covers');
    t.ok(calls.every((c, i) => a(i + 1).text.length <= 40100), 'no answer over the cut');
  } catch (e) { t.ok(false, 'test stopped: ' + (e && e.stack || e)); }
  t.done();
})();

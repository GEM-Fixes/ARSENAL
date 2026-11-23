// test of the "map" recipe: node map.test.js [scratch]. The kit checks validate, lang, census coverage + seeded defect, steps,
// compile, plan (and a real write into the scratch mod). Extra: values() read from a vanilla map, compile refusals.
// Author: Imperator_Aug (ARSENAL, ia-f3a14e7d)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const recipe = require('./map.recipe');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-map-')));
const BASE = { id: 'map/multi/1v1_argentan', name: '1v1_argentan (2)', ref: { key: 'resource/map/multi/1v1_argentan/preview.dds', mods: [], modes: ['battle_zones', 'captureflag', 'combat'] } };

let checkAfter = null;
(async () => {
  let fails = 0, passes = 0;
  const ok = (c, m, x) => { if (c) passes++; else { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
  const gameDir = kit.findGame({});
  // values(): what the vanilla map has now
  if (!gameDir) console.log('note: SKIP values(): no game folder found (set AS2_GAME)');
  else {
    const v = await recipe.values({ game: () => gameDir, mod: path.join(scratch, 'none') }, BASE, { verb: 'make' });
    const vc = await recipe.values({ game: () => gameDir, mod: path.join(scratch, 'none') }, BASE, { verb: 'change' });
    ok(vc.copy === false, 'values: change works on the map itself', vc.copy);
    ok(v.mi_mode === 'battle_zones', 'values: mode settings read', v.mi_mode);
    ok(!('ranked_min' in v) && !('ranked_max' in v), 'values: no ranked counts (the 32 bit game reads them only, MAP-11)', JSON.stringify(v));
    ok(v.spawns_later === false, 'values: "I will add start points" is no by default', v.spawns_later);
    ok(v.place_near === v.place_entity && v.place_near, 'values: objects are placed from an object on the map by default', v.place_near);
    ok(v.copy === true, 'values: a game map is copied', JSON.stringify(v));
    ok(v.maxplayers === 2, 'values: 1v1_argentan takes 2 players', v.maxplayers);
    ok(v.ranked === true, 'values: 1v1_argentan is ranked', v.ranked);
    ok(String(v.season) === '2', 'values: texMod 2 read', v.season);
    ok(v.title === '1v1_argentan (copy)', 'values: a copy is offered the lobby name plus (copy)', v.title);
    ok(vc.title === '1v1_argentan', 'values: change keeps the lobby name', vc.title);
    ok(/^[A-Za-z0-9_]{1,40}$/.test(v.name), 'values: the suggested copy name is a valid folder name', v.name);
    ok(/^[a-z0-9_]+$/i.test(v.place_entity), 'values: the commonest object on the map is preselected', v.place_entity);
    const modes = recipe._t.modesOf(gameDir, '', 'map/multi/1v1_argentan', [], BASE);
    ok(['battle_zones', 'captureflag', 'combat'].every(m => modes.includes(m)), 'modes read from the map folder', modes.join(','));
  }
  // compile refusals (seeded): a copy named like its base, captureflag on a map without its areas, odd player count
  const mk = (ans, vals) => {
    const a = {}; for (const [k, x] of Object.entries(ans)) a[k] = { src: 'value', value: x };
    return { game: 'as64', gameDir, mod: path.join(scratch, 'none'), staging: path.join(scratch, 'stage'), values: vals || { maxplayers: 2, minplayers: 1 }, verb: 'make', base: BASE,
      answer: id => a[id] || null, value: id => (a[id] ? a[id].value : (vals || {})[id]), kept: id => !a[id] };
  };
  const refuses = (ans, re, what) => { let e = null; try { recipe.compile({}, mk(ans)); } catch (x) { e = x; } ok(e && e.status === 400 && re.test(e.message), 'refused: ' + what, e ? e.message : 'no error'); };
  refuses({ copy: true, name: '1v1_argentan' }, /name of its own/, 'a copy with the name of its base');
  refuses({ copy: true, name: 'bad name!' }, /English letters/, 'a folder name with spaces');
  refuses({ copy: true, name: 'x_ok', maxplayers: 5 }, /even number/, 'an odd player count');
  refuses({ copy: true, name: 'x_ok', maxplayers: 4, minplayers: 6 }, /more than the most/, 'fewest players above most players');
  refuses({ copy: true, name: 'x_ok', place_on: true, place_entity: 'bush8', place_x: 1, place_y: 1, place_more: ['bush8 nowhere'] }, /name x y \[turn\], in map units/, 'a bad line of more objects');
  // novice hazards
  refuses({ copy: true, name: 'x_ok', title: '1v1_argentan' }, /lobby name of its own/, 'a copy with the lobby name of the map it copies');
  if (gameDir) {
    refuses({ copy: true, name: 'x_ok', maxplayers: 4 }, /cannot add start points/, 'more players than start points without "I will add start points"');
    { let e = null; try { recipe.compile({}, mk({ copy: true, name: 'x_ok', maxplayers: 4, spawns_later: true })); } catch (x) { e = x; } ok(!e, 'more players with "I will add start points" yes', e && e.message); }
    refuses({ copy: true, name: 'x_ok', mi_on: true, mi_mode: 'combat', mi_maxplayers: 6 }, /cannot add start points/, 'more players in a mode than its start points');
    refuses({ copy: true, name: 'x_ok', place_on: true, place_entity: 'bush8', place_near: 'no_such_thing', place_x: 1, place_y: 1 }, /No object called no_such_thing/, 'placing near an object that is not on the map');
    refuses({ copy: true, name: 'x_ok', place_on: true, place_entity: 'bush8', place_x: 19000, place_y: 0 }, /outside the area/, 'a place outside the map');
    { const r = recipe.compile({}, mk({ copy: true, name: 'x_ok', place_on: true, place_entity: 'bush8', place_near: 'bush8', place_x: 50, place_y: 0 })); ok((r.notes || []).concat(r.note || []).join(' ').match(/map units/) || JSON.stringify(r).includes('map units'), 'placing near an object says map units', JSON.stringify(r).slice(0, 400)); }
    // pictures: a PNG becomes a DDS of the game size; a JPG is refused; a DDS of a bad form is refused
    const A = require('../../../../artport/artport');
    const png = A.encodePng({ w: 64, h: 48, rgba: Buffer.alloc(64 * 48 * 4, 200) });
    const pdir = path.join(scratch, 'pics'); fs.mkdirSync(pdir, { recursive: true });
    const pic = (name, buf) => { const f = path.join(pdir, name); fs.writeFileSync(f, buf); return f; };
    const mkp = (q, f) => { const c = mk({ copy: true, name: 'x_ok' }); const a0 = c.answer; c.answer = id => (id === q ? { src: 'file', value: [f], staged: [path.basename(f)] } : a0(id)); const v0 = c.value; c.value = id => (id === q ? [f] : v0(id)); return c; };
    { const c = mkp('preview_small', pic('small.png', png)); const r = recipe.compile({}, c); const cp = (r.copies || []).find(x => /preview_small.dds$/.test(x.to)); const out = cp && path.join(c.staging, cp.staged); const b = out && fs.existsSync(out) ? fs.readFileSync(out) : null; const sz = recipe._t.ddsSize(b);
      ok(sz && sz[0] === 400 && sz[1] === 300, 'a PNG picture becomes a 400x300 DDS for the small picture', JSON.stringify([cp, sz]));
      ok(b && recipe._t.ddsWhy(b) === null && require('../../../../lib/model/picture').facts('dds', b).game.ok === true, 'the made DDS is a form the game loads', b && JSON.stringify(require('../../../../lib/model/picture').facts('dds', b).game)); }
    { let e = null; try { recipe.compile({}, mkp('preview', pic('shot.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0])))); } catch (x) { e = x; } ok(e && /not a DDS, PNG or TGA/.test(e.message), 'refused: a JPG picture', e && e.message); }
  }
  // the picture pickers take only what the recipe can use, and offer no card that saves another form
  for (const q of ['preview', 'preview_small', 'minimap']) { const d = recipe.groups.flatMap(g => g.q).find(x => x.id === q); ok(d && d.picker && JSON.stringify(d.picker.kinds) === JSON.stringify(['.dds', '.png', '.tga']) && !(d.picker.ext || []).includes('image-editor'), 'picture ' + q + ': upload takes DDS, PNG or TGA only, no image editor card', JSON.stringify(d && d.picker)); }
  { const all = recipe.groups.flatMap(g => g.q.map(x => x.id)); ok(!all.includes('ranked_min') && !all.includes('ranked_max'), 'no ranked count questions', all.join(',')); ok(all.includes('spawns_later') && all.includes('place_near'), 'start points and place near questions', all.join(',')); }
  { const pq = recipe.groups.flatMap(g => g.q).filter(x => /^place_[xyz]$/.test(x.id)); ok(pq.every(x => !x.unit), 'positions carry no metre unit', JSON.stringify(pq.map(x => x.unit))); }
  // title per verb, Test step words, upload check of a picture
  { const lang = require('./map.lang'), t = k => (lang.find(r => r[0] === k) || [])[1]; ok(/game map/.test(t(recipe.title.make)) && t(recipe.title.change) && t(recipe.test) && /start point/.test(t(recipe.test)), 'title per verb and Test step words', JSON.stringify([recipe.title, recipe.test])); }
  { const A = require('../../../../artport/artport'), ck = recipe._t.picCheck, png = A.encodePng({ w: 8, h: 8, rgba: Buffer.alloc(256, 99) });
    ok(ck({ bytes: png }) === null, 'upload check: a PNG is taken');
    ok(ck({ bytes: recipe._t.toDds(png, 8, 8).buf }) === null, 'upload check: a 32 bit DDS is taken');
    ok(ck({ bytes: Buffer.from('not a picture at all, just words') }) === 'task.map.e.picBad', 'upload check: bytes that are no picture are refused at upload');
    const bad = Buffer.from(recipe._t.toDds(png, 8, 8).buf); bad.write('DX10', 84, 'latin1'); bad.writeUInt32LE(0x4, 80); const r = ck({ bytes: bad });
    ok(r && r.key === 'task.map.e.picDds', 'upload check: a DDS the game cannot load is refused at upload', JSON.stringify(r)); }
  // unchanged answers give no ops
  { const r = recipe.compile({}, mk({ copy: false, maxplayers: 2 }, { maxplayers: 2, minplayers: 1 })); ok(!r.gen, 'an unchanged answer gives no op', JSON.stringify(r.gen)); }
  console.log('extra: ' + passes + ' passed, ' + fails + ' failed');

  const res = await kit.run(recipe, require('./map.lang'), {
    base: BASE,
    answers: { copy: true, name: 'tasktest_map', title: 'Task test map', maxplayers: 4, season: '1', mi_on: true, mi_mode: 'combat', mi_maxplayers: 4, mi_parameters: 'freezeTime=20', place_on: true, place_entity: 'bush8', place_near: '', place_x: 10, place_y: 10, place_dir: 45, spawns_later: true, place_more: ['hedge2a 20 20 90'] },
    planFiles: ['resource/map/multi/tasktest_map/combat.info'],
    write: true,
    after: (mod, w, ok2) => {
      const d = path.join(mod, 'resource', 'map', 'multi', 'tasktest_map');
      ok2(fs.existsSync(path.join(d, 'map')), 'the copy has its map file');
      const info = fs.existsSync(path.join(d, 'map.info')) ? fs.readFileSync(path.join(d, 'map.info'), 'latin1') : '';
      ok2(/maxPlayers\s+4/.test(info), 'map.info has maxPlayers 4', info);
      ok2(/texMod\s+1/.test(info), 'map.info has texMod 1', info);
      const map = fs.existsSync(path.join(d, 'map')) ? fs.readFileSync(path.join(d, 'map'), 'latin1') : '';
      ok2(/"hedge2a"/.test(map) && (map.match(/"bush8"/g) || []).length > 0, 'the placed objects are in the map file');
      const lng = path.join(mod, 'localization', 'mission', 'multi', 'tasktest_map.lng');
      ok2(fs.existsSync(lng) && /Task test map/.test(fs.readFileSync(lng, 'utf8')), 'the lobby name is written by gen text', lng);
      const ci = path.join(d, 'combat.info'), ct = fs.existsSync(ci) ? fs.readFileSync(ci, 'latin1') : '';
      ok2(/maxPlayers\s+4/.test(ct) && /freezeTime=20/.test(ct) && /texMod\s+1/.test(ct), 'combat.info made from map.info with the mode settings', ct);
      checkAfter = mod;
    },
  }, scratch);
  // recipe.check on the written copy: start points counted per mode
  if (checkAfter) { const cards = await recipe.check({ mod: checkAfter, base: BASE, answers: { copy: { src: 'value', value: true }, name: { src: 'value', value: 'tasktest_map' } } }, { game: () => gameDir, mod: checkAfter }); ok(cards.length && cards[0].lines.some(l => /combat: 2 start points for 4 players/.test(l)), 'check counts start points', JSON.stringify(cards)); ok(cards.some(c2 => c2.level === 'warn'), 'check warns: fewer start points than players', JSON.stringify(cards)); }
  if (fails) { process.exitCode = 1; console.log('FAIL (extra checks)'); }
  return res;
})();

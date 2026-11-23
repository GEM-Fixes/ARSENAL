// round 2 sample pieces and lang rows for the core half of kit.test.js: the generic scope tokens (top, any, in:<word>,
// in:*), a whole-file piece, a piece not for multiplayer maps, an entity piece for entity-def and props, a ground effect
// piece, and one piece whose section is not of its kind (the catalog leaves it out). They do not depend on the real groups.
'use strict';
const base = { needs: [], tag: 'V', lim: [], src: 'map/single/kit/kit.mi:1', short: false, adv: false, wrap: false, task: null, since: '2026-11', role: 'data' };
const P = o => Object.assign({}, base, o);
const pieces = [
  P({ id: 'r.mi.top', no: 9001, size: 'small', mp: 'yes', sec: 'mi.start.top-blocks', kinds: ['mi'], scope: ['top'], role: 'block', code: '{mission\n\t@^@\n}', f: {} }),
  P({ id: 'r.mi.unit', no: 9002, size: 'small', mp: 'yes', sec: 'mi.start.placement', kinds: ['mi'], scope: ['in:mission'], code: '{Human "@name@" 0xd000\n\t{Position 0 0}\n}', f: { name: { k: 'text', def: 'kit_soldier' } } }),
  P({ id: 'r.mi.any', no: 9003, size: 'line', mp: 'unknown', sec: 'mi.debug', kinds: ['mi'], scope: ['any'], code: '{kit_any 1}', f: {} }),
  P({ id: 'r.mi.named', no: 9004, size: 'line', mp: 'yes', sec: 'mi.when.trigger', kinds: ['mi'], scope: ['in:*'], code: '{kit_named @n@}', f: { n: { k: 'number', def: '2' } } }),
  P({ id: 'r.mi.whole', no: 9005, size: 'medium', mp: 'yes', whole: true, sec: 'mi.start.whole-file', kinds: ['mi'], scope: ['empty'], code: '{mission\n\t{kit_whole 1}\n}', f: {} }),
  P({ id: 'r.mi.sp', no: 9006, size: 'small', mp: 'no', sec: 'mi.sys', kinds: ['mi'], scope: ['in:mission'], code: '{kit_sp_only 1}', f: {} }),
  P({ id: 'r.mi.define', no: 9007, size: 'line', mp: 'yes', sec: 'mi.start.helpers', kinds: ['mi'], scope: ['in:define'], code: '{kit_in_define %0}', f: {} }),
  P({ id: 'r.ent.mass', no: 9008, size: 'line', sec: 'ent.any.physics', kinds: ['entity-def', 'props'], scope: ['in:game_entity'], code: '{mass @m@}', f: { m: { k: 'number', def: '1000' } } }),
  P({ id: 'r.ter.fx', no: 9009, size: 'line', sec: 'ter.hits', kinds: ['ia-terrain'], scope: ['in:on'], role: 'act', code: '{spawn "@fx@"}', f: { fx: { k: 'effect', def: 'kit_dust' } } }),
  P({ id: 'r.sdl.file', no: 9010, size: 'small', whole: true, sec: 'sdl.files', kinds: ['sdl'], scope: ['empty'], code: '{location\n\t{level @lv@}\n}', f: { lv: { k: 'text', def: 'kit_level' } } }),
  P({ id: 'r.mi.wrongsec', no: 9011, size: 'line', mp: 'yes', sec: 'ia.start', kinds: ['mi'], scope: ['any'], code: '{kit_wrong 1}', f: {} })
];
const rows = [];
for (const p of pieces) {
  rows.push(['ide.kit.p.' + p.id, 'Sample ' + p.id, 'Образец ' + p.id, 'Зразок ' + p.id, '示例 ' + p.id]);
  rows.push(['ide.kit.p.' + p.id + '.d', 'What ' + p.id + ' does.', 'Что делает ' + p.id + '.', 'Що робить ' + p.id + '.', p.id + ' 的作用。']);
}
module.exports = { pieces, rows };

// sample pieces and lang rows for the core half of kit.test.js (they do not depend on the real content groups)
'use strict';
const base = { needs: [], tag: 'V', lim: [], src: 'set/interaction_entity/airborne.inc:4', short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = o => Object.assign({}, base, o);
const H = ['handler', 'branch', 'timer', 'container'];
const pieces = [
  P({ id: 's.event.spawn', sec: 'ia.when.life', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on spawn\n\t@^@\n}', f: {}, event: 'spawn' }),
  P({ id: 's.event.named', sec: 'ia.when.own', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on "@name@"\n\t@^@\n}', f: { name: { k: 'event', def: 'my_event' } }, event: '"@name@"' }),
  P({ id: 's.event.ik', sec: 'ia.when.move', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on ik end "@bone@"\n\t@^@\n}', f: { bone: { k: 'bone', def: 'turret' } }, event: 'ik end "@bone@"' }),
  P({ id: 's.event.contact', sec: 'ia.when.hit', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on contact\n\t@^@\n}', f: {}, event: 'contact' }),
  P({ id: 's.act.sound', sec: 'ia.do.snd', kinds: ['ia-entity'], scope: H, role: 'act', code: '{play_sound "@name@" @vol@}', f: { name: { k: 'sound', def: 'fly' }, vol: { k: 'number', def: '1', min: 0, max: 10 } } }),
  P({ id: 's.cond.volume', sec: 'ia.if.hitby', kinds: ['ia-entity'], scope: H, role: 'cond', code: '{if volume "@vol@"\n\t@^@\n}', f: { vol: { k: 'tag', def: 'body' } } }),
  P({ id: 's.cond.side', sec: 'ia.if.hitby', kinds: ['ia-entity'], scope: H, role: 'cond', code: '{if hit_side @side@\n\t@^@\n}', f: { side: { k: 'choice', def: 'left', choices: ['front', 'back', 'left', 'right', 'top', 'bottom'] } } }),
  P({ id: 's.cond.stuff', sec: 'ia.if.hitby', kinds: ['ia-entity'], scope: ['handler', 'branch'], events: ['bullet_hit', 'pierce'], role: 'cond', code: '{if stuff "@tag@"\n\t@^@\n}', f: { tag: { k: 'tag', def: 'shell' } } }),
  P({ id: 's.block.unit', sec: 'ia.start', kinds: ['ia-entity'], scope: ['top'], role: 'block', code: '{"@tags@"\n\t{on spawn\n\t\t@^@\n\t}\n}', f: { tags: { k: 'tags', def: 'my_unit' } } }),
  P({ id: 's.act.call', sec: 'ia.do.wait', kinds: ['ia-entity'], scope: H, role: 'act', code: '{call "@name@"}', f: { name: { k: 'event', def: 'nobody_home' } } }),
  P({ id: 's.act.flag', sec: 'ia.do.mem', kinds: ['ia-entity'], scope: H, role: 'act', code: '{set "@flag@" 1}', f: { flag: { k: 'flag', def: 'my_new_flag' } } }),
  P({ id: 's.act.lit', sec: 'ia.do.fx', kinds: ['ia-entity'], scope: H, role: 'act', code: '{view start "@name@"}\n{view start "a@@b"}', f: { name: { k: 'view', def: 'v1' } } }),
  P({ id: 's.data.mp', sec: 'sdl.any', kinds: ['sdl'], scope: ['block', 'handler', 'branch', 'timer', 'container'], role: 'data', code: '(mod @which@\n\t@lines@\n)', f: { which: { k: 'choice', def: 'not "mp"', choices: ['"mp"', 'not "mp"', '"coop"'] }, lines: { k: 'code', def: '{texmod "2"}' } } }),
  P({ id: 's.sdl.comment', sec: 'sdl.any', kinds: ['sdl'], scope: ['top', 'block', 'handler', 'branch', 'timer', 'container'], role: 'grammar', code: '; @note@', f: { note: { k: 'comment', def: 'my note' } } }),
  P({ id: 's.list.multi', sec: 'ia.start', kinds: ['ia-entity'], scope: ['top'], role: 'block', code: '{entities\n\t@incs@\n\t(include "@file@")\n}', f: { incs: { k: 'list', def: '(include "a.inc")\n\t(include "b.inc")' }, file: { k: 'path', def: 'mymod.inc' } } })
];
// rows: en, ru, uk, zh; the ru title of s.act.sound is empty on purpose (English fallback)
const rows = [];
for (const p of pieces) {
  rows.push(['ide.kit.p.' + p.id, 'Title ' + p.id, p.id === 's.act.sound' ? '' : 'Заголовок ' + p.id, 'Назва ' + p.id, '标题 ' + p.id]);
  rows.push(['ide.kit.p.' + p.id + '.d', 'What ' + p.id + ' does.', 'Что делает ' + p.id + '.', 'Що робить ' + p.id + '.', p.id + ' 的作用。']);
}
rows.push(['ide.kit.p.s.act.sound.f.name', 'Sound to play', 'Звук', 'Звук', '声音']);
rows.push(['ide.kit.p.s.act.sound.f.name.h', 'A name from the sound folder', 'Имя из папки звуков', 'Назва з теки звуків', '声音文件夹中的名称']);
rows.push(['ide.kit.p.s.cond.side.w', 'Only left and right need a bullet.', 'Только left и right требуют пули.', 'Лише left і right потребують кулі.', '只有 left 和 right 需要子弹。']);
module.exports = { group: 'sample', pieces, rows };

// seeded faults for the content rules of kit.test.js: one defect per piece (want = the rule that must fire) and one per
// lang row. Everything else in each record is right, so a rule that fires for another reason shows up as a stray.
'use strict';
const ok = { sec: 'ia.do.fx', kinds: ['ia-entity'], scope: ['handler', 'branch', 'timer', 'container'], role: 'act', f: {}, needs: [], tag: 'V', lim: [], src: 'set/interaction_entity/airborne.inc:4', short: false, adv: false, wrap: false, task: null, since: '2026-11' };
const P = (id, want, o) => Object.assign({ id, want }, ok, o);
const pieces = [
  P('X', 'id', { code: '{view start "a"}' }),
  P('z.seed.sec', 'sec', { sec: 'ia.nowhere', code: '{view start "a"}' }),
  P('z.seed.scope', 'scope', { scope: ['everywhere'], code: '{view start "a"}' }),
  P('z.seed.caret', 'caret', { role: 'cond', code: '{if rand 0.5\n}' }),
  P('z.seed.quote', 'default', { code: '{view start "@v@"}', f: { v: { k: 'view', def: '"a"' } } }),
  P('z.seed.tags', 'tags', { scope: ['top'], role: 'block', code: '{"@t@"\n}', f: { t: { k: 'tags', def: 'tank' } } }),
  P('z.seed.semi', 'semicolon', { code: '{view start "a"} ; a note' }),
  P('z.seed.balance', 'balance', { code: '{view start "a"' }),
  P('z.seed.action', 'action', { code: '{explode_all}' }),
  P('z.seed.event', 'event', { scope: ['block'], role: 'event', event: 'hover', code: '{on hover\n\t@^@\n}' }),
  P('z.seed.elseif', 'elseif', { role: 'cond', code: '{if rand 0.5\n\t@^@\nelse if rand 0.2\n}' }),
  P('z.seed.notnot', 'notnot', { role: 'cond', code: '{if not not rand 0.5\n\t@^@\n}' }),
  P('z.seed.kill', 'kill_flags', { role: 'cond', code: '{if kill_flags front\n\t@^@\n}' }),
  P('z.seed.side', 'hit_side', { role: 'cond', code: '{if hit_side 4\n\t@^@\n}' }),
  P('z.seed.cond', 'condition', { role: 'cond', code: '{if hit_angle 30\n\t@^@\n}' }),
  P('z.seed.noop', 'noop', { code: '{log "x"}' }),
  P('z.seed.eff', 'with_effector', { code: '{with_effector\n\t{view start "a"}\n}' }),
  P('z.seed.adv', 'adv', { tag: 'T', src: '', code: '{view start "a"}' }),
  P('z.seed.src', 'src', { src: '', code: '{view start "a"}' }),
  P('z.seed.srcform', 'src', { src: 'gamelogic:set/x.inc:3', code: '{view start "a"}' }),
  P('z.seed.short', 'short', { tag: 'I', short: true, code: '{view start "a"}' }),
  P('z.seed.lim', 'lim', { lim: ['INT-999'], code: '{view start "a"}' }),
  P('z.seed.unused', 'field', { code: '{view start "a"}', f: { v: { k: 'view', def: 'a' } } }),
  P('z.seed.choice', 'choice', { code: '{view @v@ "a"}', f: { v: { k: 'choice', def: 'start' } } }),
  P('z.seed.chance', 'number', { role: 'cond', code: '{if rand @p@\n\t@^@\n}', f: { p: { k: 'chance', def: '2' } } }),
  P('z.seed.check', 'check', { code: '{view start "a" #b}' }),
  P('z.seed.twice', 'field', { code: '{view @v@ "@v@"}', f: { v: { k: 'view', def: 'a' } } }),
  P('z.seed.net', 'network', { role: 'cond', code: '{if rand 0.5\n\t@^@\n}' }),
  P('z.seed.netzh', 'network', { role: 'cond', code: '{if user_control\n\t@^@\n}' })
];
const T = id => ['ide.kit.p.' + id, 'Seed ' + id, 'Посев ' + id, 'Посів ' + id, '种子 ' + id];
const D = id => ['ide.kit.p.' + id + '.d', 'Seed row.', 'Строка посева.', 'Рядок посіву.', '种子行。'];
const rows = [];
for (const p of pieces) rows.push(T(p.id), D(p.id));
// lang faults: [row, rule]
const langFaults = [
  [['ide.kit.p.z.seed.dash.d', 'Adds a light — then stops.', 'Свет.', 'Світло.', '灯光。'], 'dash'],
  [['ide.kit.p.z.seed.sep.d', 'Adds a light - then stops.', 'Свет.', 'Світло.', '灯光。'], 'separator'],
  [['ide.kit.p.z.seed.as.d', 'Works in as64 only.', 'Свет.', 'Світло.', '灯光。'], 'as64'],
  [['ide.kit.p.z.seed.cyr.d', 'Adds a light.', 'Adds a light.', 'Світло.', '灯光。'], 'translated'],
  [['ide.kit.p.z.seed.slot.d', 'Adds {n} lights.', 'Свет.', 'Світло {n}.', '灯光 {n}。'], 'slots'],
  [['ide.kit.p.z.seed.mod.d', 'Taken from valour.', 'Из valour.', 'З valour.', '来自 valour。'], 'modname'],
  [['ide.kit.p.z.seed.stop', 'Adds a light.', 'Свет', 'Світло', '灯光'], 'title'],
  [['ide.kit.p.z.seed.empty.d', 'Adds a light.', '', 'Світло.', '灯光。'], 'empty'],
  [['ide.kit.p.z.nobody.d', 'Belongs to no piece.', 'Ничей.', 'Нічий.', '无主。'], 'unused'],
  [['ide.kit.p.z.seed.same.d', 'Runs the same way on every machine.', 'Свет.', 'Світло.', '灯光。'], 'machine'],
  [['ide.kit.p.z.seed.safe.d', 'Safe in a network game.', 'Свет.', 'Світло.', '灯光。'], 'safe'],
  [['ide.kit.p.z.seed.saferu.d', 'Adds a light.', 'Безопасно в сетевой игре.', 'Світло.', '灯光。'], 'safe'],
  [['ide.kit.p.z.seed.safeuk.d', 'Adds a light.', 'Свет.', 'Мережевій грі це безпечно.', '灯光。'], 'safe'],
  [['ide.kit.p.z.seed.safezh.d', 'Adds a light.', 'Свет.', 'Світло.', '在联网游戏中是安全的。'], 'safe']
];
// pieces the lang faults hang on (right in themselves)
const hosts = ['z.seed.dash', 'z.seed.sep', 'z.seed.as', 'z.seed.cyr', 'z.seed.slot', 'z.seed.mod', 'z.seed.stop', 'z.seed.empty',
  'z.seed.same', 'z.seed.safe', 'z.seed.saferu', 'z.seed.safeuk', 'z.seed.safezh'].map(id => P(id, null, { code: '{view start "a"}' }));
for (const h of hosts) { if (h.id !== 'z.seed.stop') rows.push(T(h.id)); if (h.id === 'z.seed.stop') rows.push(D(h.id)); }
for (const [r] of langFaults) rows.push(r);
// network rule: z.seed.netzh has a watch-out without the zh sentence; z.seed.netok has the sentence in all four (no fault)
rows.push(['ide.kit.p.z.seed.netzh.w', 'Not tried in a network game.', 'Не проверено в сетевой игре.', 'Не перевірено в мережевій грі.', '单位由玩家控制时为真。']);
const netok = P('z.seed.netok', null, { role: 'cond', code: '{if rand 0.5\n\t@^@\n}' });
rows.push(T('z.seed.netok'), D('z.seed.netok'), ['ide.kit.p.z.seed.netok.w', 'Not tried in a network game.', 'Не проверено в сетевой игре.', 'Не перевірено в мережевій грі.', '未在联网游戏中试过。']);
// title length (a warning, every language): z.seed.long has a ru title over 48 characters
const long = P('z.seed.long', null, { code: '{view start "a"}' });
rows.push(['ide.kit.p.z.seed.long', 'Seed z.seed.long', 'Очень длинное название кусочка кода для проверки длины', 'Посів z.seed.long', '种子 z.seed.long'], D('z.seed.long'));
module.exports = { pieces: pieces.concat(hosts, [netok, long]), rows, langFaults };

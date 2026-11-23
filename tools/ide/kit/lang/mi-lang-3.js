// Code Pieces, group mi-lang-3: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-lang-3.js
// (mission commands: unit orders, unit state, tags and abilities, squads).
// Author: Imperator_Aug (ARSENAL, ia-40d18735)
'use strict';

const TAG = ['Unit tag', 'Тег юнита', 'Тег юніта', '单位标签'];
const TAG_H = ['The tag of the units that get the command.', 'Тег юнитов, которые получают команду.', 'Тег юнітів, які отримують команду.', '接收此命令的单位的标签。'];
const WP = ['Waypoint name', 'Имя точки пути', 'Ім\'я точки шляху', '路径点名称'];
const WP_H = ['The name of a waypoint of this mission, in quotes as it is.', 'Имя точки пути этой миссии, в кавычках как есть.', 'Ім\'я точки шляху цієї місії, у лапках як є.', '本任务中某个路径点的名称，保留引号。'];
const SQUAD = ['Squad name', 'Имя отряда', 'Назва загону', '小队名称'];
const SQUAD_H = ['The name given with squad_create.', 'Имя, заданное в squad_create.', 'Назва, задана в squad_create.', '用 squad_create 起的名称。'];
const NT = ['Not tried in game.', 'В игре не проверено.', 'У грі не перевірено.', '未在游戏中试过。'];
const nt = r => r.map((s, i) => s + ' ' + NT[i]);

module.exports = [
  // 434 mi.c.recon
  ['ide.kit.p.mi.c.recon', 'Scout around or to a waypoint', 'Разведка вокруг или к точке пути', 'Розвідка навколо або до точки шляху', '在周围或向路径点侦察'],
  ['ide.kit.p.mi.c.recon.d', 'The tagged soldiers go to the waypoint and search the area around it within the radius. They look for enemies on their own.',
    'Солдаты с тегом идут к точке пути и обыскивают местность вокруг неё в пределах радиуса. Врагов они ищут сами.',
    'Солдати з тегом ідуть до точки шляху й обшукують місцевість навколо неї в межах радіуса. Ворогів вони шукають самі.',
    '带标签的士兵前往路径点，并在半径内搜索周围区域，自行寻找敌人。'],
  ['ide.kit.p.mi.c.recon.f.tag', ...TAG], ['ide.kit.p.mi.c.recon.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.recon.f.waypoint', ...WP], ['ide.kit.p.mi.c.recon.f.waypoint.h', ...WP_H],
  ['ide.kit.p.mi.c.recon.f.radius', 'Search radius', 'Радиус поиска', 'Радіус пошуку', '搜索半径'],

  // 435 mi.c.fire
  ['ide.kit.p.mi.c.fire', 'Fire at enemies or a point', 'Огонь по врагам или по точке', 'Вогонь по ворогах або по точці', '向敌人或某点开火'],
  ['ide.kit.p.mi.c.fire.d', 'The tagged units open fire on the units of the second tag. interval and time 0 mean fire right away with no limit.',
    'Юниты с тегом открывают огонь по юнитам второго тега. interval и time 0 значат: стрелять сразу и без ограничения.',
    'Юніти з тегом відкривають вогонь по юнітах другого тегу. interval і time 0 означають: стріляти одразу й без обмеження.',
    '带标签的单位向第二个标签的单位开火。interval 和 time 为 0 表示立即开火且不限时。'],
  ['ide.kit.p.mi.c.fire.w', 'To fire at a place instead, write {attack position} {waypoint "name"} {deviate} in place of the enemies, interval and time lines.',
    'Чтобы стрелять по месту, напишите {attack position} {waypoint "name"} {deviate} вместо строк enemies, interval и time.',
    'Щоб стріляти по місцю, напишіть {attack position} {waypoint "name"} {deviate} замість рядків enemies, interval і time.',
    '若要向某个地点开火，用 {attack position} {waypoint "name"} {deviate} 替换 enemies、interval 和 time 这几行。'],
  ['ide.kit.p.mi.c.fire.f.tag', ...TAG], ['ide.kit.p.mi.c.fire.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.fire.f.enemy_tag', 'Target tag', 'Тег целей', 'Тег цілей', '目标标签'],
  ['ide.kit.p.mi.c.fire.f.burst', 'Burst length', 'Длина очереди', 'Довжина черги', '连射长度'],
  ['ide.kit.p.mi.c.fire.f.burst.h', 'once = single shots, long = long bursts, smart = the unit picks.',
    'once = одиночные, long = длинные очереди, smart = юнит выбирает сам.',
    'once = поодинокі, long = довгі черги, smart = юніт обирає сам.',
    'once = 单发，long = 长连射，smart = 由单位自己选择。'],

  // 436 mi.c.action
  ['ide.kit.p.mi.c.action', 'Single order (move, attack, rotate, repair, pour_out, attach, detach)', 'Один приказ (move, attack, rotate, repair, pour_out, attach, detach)', 'Один наказ (move, attack, rotate, repair, pour_out, attach, detach)', '单个命令（move、attack、rotate、repair、pour_out、attach、detach）'],
  ['ide.kit.p.mi.c.action.d', 'Gives the tagged units one order aimed at one unit of the target tag: go to it, attack it, turn to it, repair it and so on.',
    'Даёт юнитам с тегом один приказ на одного юнита с тегом цели: подойти, атаковать, повернуться, починить и так далее.',
    'Дає юнітам з тегом один наказ на одного юніта з тегом цілі: підійти, атакувати, повернутися, полагодити тощо.',
    '给带标签的单位下达一个针对目标标签中某一单位的命令：前往、攻击、转向、修理等。'],
  ['ide.kit.p.mi.c.action.w', 'For move or rotate to a waypoint, write {waypoint "name"} in place of the target block.',
    'Для move или rotate к точке пути напишите {waypoint "name"} вместо блока target.',
    'Для move або rotate до точки шляху напишіть {waypoint "name"} замість блоку target.',
    '若要 move 或 rotate 到路径点，用 {waypoint "name"} 替换 target 块。'],
  ['ide.kit.p.mi.c.action.f.tag', ...TAG], ['ide.kit.p.mi.c.action.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.action.f.action', 'Order', 'Приказ', 'Наказ', '命令'],
  ['ide.kit.p.mi.c.action.f.target_tag', 'Target tag', 'Тег цели', 'Тег цілі', '目标标签'],

  // 437 mi.c.state
  ['ide.kit.p.mi.c.state', 'Set unit behaviour', 'Задать поведение юнита', 'Задати поведінку юніта', '设置单位行为'],
  ['ide.kit.p.mi.c.state.d', 'Sets who controls the units, when they fire and how far they may move. The weapon is made ready.',
    'Задаёт, кто управляет юнитами, когда они стреляют и как далеко могут отходить. Оружие приводится к бою.',
    'Задає, хто керує юнітами, коли вони стріляють і як далеко можуть відходити. Зброя готується до бою.',
    '设置由谁控制单位、何时开火以及可移动多远，并让武器进入准备状态。'],
  ['ide.kit.p.mi.c.state.w', 'Works only on soldiers ({type human}) or units with a brain; on other units it does nothing.',
    'Работает только на солдатах ({type human}) или юнитах с brain; на других ничего не делает.',
    'Працює лише на солдатах ({type human}) або юнітах з brain; на інших нічого не робить.',
    '只对士兵（{type human}）或带 brain 的单位有效，对其他单位无作用。'],
  ['ide.kit.p.mi.c.state.f.tag', ...TAG], ['ide.kit.p.mi.c.state.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.state.f.control', 'Controlled by', 'Кто управляет', 'Хто керує', '控制方'],
  ['ide.kit.p.mi.c.state.f.control.h', 'user = the player gives the orders, AI = the computer does.', 'user = приказы даёт игрок, AI = компьютер.', 'user = накази дає гравець, AI = комп\'ютер.', 'user = 由玩家下令，AI = 由电脑控制。'],
  ['ide.kit.p.mi.c.state.f.fire_mode', 'Fire mode', 'Режим огня', 'Режим вогню', '开火模式'],
  ['ide.kit.p.mi.c.state.f.fire_mode.h', 'open = fire at will, return = only fire back, hold = do not fire.', 'open = огонь по желанию, return = только ответный, hold = не стрелять.', 'open = вогонь на власний розсуд, return = лише у відповідь, hold = не стріляти.', 'open = 自由开火，return = 仅还击，hold = 不开火。'],
  ['ide.kit.p.mi.c.state.f.move_mode', 'Move mode', 'Режим движения', 'Режим руху', '移动模式'],
  ['ide.kit.p.mi.c.state.f.move_mode.h', 'hold = stay put, free = move anywhere, zone = stay within the radius.', 'hold = стоять на месте, free = ходить где угодно, zone = держаться в радиусе.', 'hold = стояти на місці, free = ходити будь-де, zone = триматися в радіусі.', 'hold = 原地不动，free = 自由移动，zone = 留在半径内。'],
  ['ide.kit.p.mi.c.state.f.move_radius', 'Move radius', 'Радиус движения', 'Радіус руху', '移动半径'],

  // 438 mi.c.state.movement
  ['ide.kit.p.mi.c.state.movement', 'Unit speed and gait', 'Скорость и походка юнита', 'Швидкість і хода юніта', '单位速度与姿态'],
  ['ide.kit.p.mi.c.state.movement.d', 'Sets how fast the units move and whether they walk or crawl.',
    'Задаёт, как быстро движутся юниты и идут они или ползут.',
    'Задає, як швидко рухаються юніти і йдуть вони чи повзуть.',
    '设置单位的移动速度，以及是步行还是匍匐。'],
  ['ide.kit.p.mi.c.state.movement.f.tag', ...TAG], ['ide.kit.p.mi.c.state.movement.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.state.movement.f.speed', 'Speed', 'Скорость', 'Швидкість', '速度'],
  ['ide.kit.p.mi.c.state.movement.f.gait', 'Gait', 'Походка', 'Хода', '姿态'],

  // 439 mi.c.state.aimove
  ['ide.kit.p.mi.c.state.aimove', 'AI may move on its own', 'ИИ может двигаться сам', 'ШІ може рухатися сам', 'AI 可自行移动'],
  ['ide.kit.p.mi.c.state.aimove.d', 'Stops or allows the units moving on their own. With enable_on injure they start moving again once one is hurt.',
    'Запрещает или разрешает юнитам двигаться самим. С enable_on injure они снова двигаются, когда кого-то ранят.',
    'Забороняє або дозволяє юнітам рухатися самим. З enable_on injure вони знову рухаються, коли когось поранено.',
    '禁止或允许单位自行移动。带 enable_on injure 时，一旦有人受伤就会重新开始移动。'],
  ['ide.kit.p.mi.c.state.aimove.f.tag', ...TAG], ['ide.kit.p.mi.c.state.aimove.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.state.aimove.f.mode', 'Own movement', 'Своё движение', 'Власний рух', '自行移动'],

  // 440 mi.c.state.ai
  ['ide.kit.p.mi.c.state.ai', 'AI courage', 'Смелость ИИ', 'Сміливість ШІ', 'AI 勇气'],
  ['ide.kit.p.mi.c.state.ai.d', 'Sets how readily the AI units push forward or fall back against the enemy.',
    'Задаёт, насколько охотно юниты ИИ идут вперёд или отходят перед врагом.',
    'Задає, наскільки охоче юніти ШІ йдуть уперед або відходять перед ворогом.',
    '设置 AI 单位面对敌人时前进或后撤的意愿。'],
  ['ide.kit.p.mi.c.state.ai.w', 'The engine also reads no_advance, no_retreat, follow_commander and make_enemies_forget here; no stock mission uses them and they are not tried.',
    'Движок здесь также читает no_advance, no_retreat, follow_commander и make_enemies_forget; ни одна миссия игры их не использует, они не проверены.',
    'Рушій тут також читає no_advance, no_retreat, follow_commander і make_enemies_forget; жодна місія гри їх не використовує, їх не перевірено.',
    '引擎在这里还读取 no_advance、no_retreat、follow_commander 和 make_enemies_forget；游戏自带任务都没用过，未经测试。'],
  ['ide.kit.p.mi.c.state.ai.f.tag', ...TAG], ['ide.kit.p.mi.c.state.ai.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.state.ai.f.advance', 'Advance ratio', 'Готовность наступать', 'Готовність наступати', '前进系数'],
  ['ide.kit.p.mi.c.state.ai.f.advance.h', 'Stock missions use 0.01 to 1; lower means more careful.', 'В миссиях игры от 0.01 до 1; меньше = осторожнее.', 'У місіях гри від 0.01 до 1; менше = обережніше.', '自带任务用 0.01 到 1；越小越谨慎。'],
  ['ide.kit.p.mi.c.state.ai.f.retreat', 'Retreat ratio', 'Готовность отступать', 'Готовність відступати', '后撤系数'],

  // 441 mi.c.state.human
  ['ide.kit.p.mi.c.state.human', 'Soldier health and stamina', 'Здоровье и выносливость солдата', 'Здоров\'я і витривалість солдата', '士兵生命值与体力'],
  ['ide.kit.p.mi.c.state.human.d', 'Sets the health of the tagged soldiers. Stock missions use it to make heroes tougher.',
    'Задаёт здоровье солдат с тегом. В миссиях игры так делают героев крепче.',
    'Задає здоров\'я солдатів з тегом. У місіях гри так роблять героїв міцнішими.',
    '设置带标签士兵的生命值。自带任务用它让英雄更耐打。'],
  ['ide.kit.p.mi.c.state.human.w', 'A {stamina 100} line also fits in the human block, but it is not tried in game.',
    'В блок human можно добавить строку {stamina 100}, но в игре она не проверена.',
    'У блок human можна додати рядок {stamina 100}, але в грі його не перевірено.',
    'human 块里也可以加 {stamina 100} 一行，但未在游戏中试过。'],
  ['ide.kit.p.mi.c.state.human.f.tag', ...TAG], ['ide.kit.p.mi.c.state.human.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.state.human.f.health', 'Health', 'Здоровье', 'Здоров\'я', '生命值'],

  // 442 mi.c.state.extra
  ['ide.kit.p.mi.c.state.extra', 'Unmask / cannon', 'Демаскировка / пушка', 'Демаскування / гармата', '暴露 / 火炮'],
  ['ide.kit.p.mi.c.state.extra.d', 'Sets how the tagged units give themselves away to the enemy, by an unmasking name from the game data.',
    'Задаёт, как юниты с тегом выдают себя врагу, по имени демаскировки из данных игры.',
    'Задає, як юніти з тегом видають себе ворогу, за назвою демаскування з даних гри.',
    '用游戏数据中的暴露名称，设置带标签单位如何被敌人发现。'],
  ['ide.kit.p.mi.c.state.extra.w', 'The engine also reads a {cannon ..} line here, but no stock mission uses it and its value form is unknown, so it is left out.',
    'Движок здесь также читает строку {cannon ..}, но ни одна миссия игры её не использует и форма значения неизвестна, поэтому её нет.',
    'Рушій тут також читає рядок {cannon ..}, але жодна місія гри його не використовує і форма значення невідома, тому його немає.',
    '引擎在这里还读取 {cannon ..} 一行，但自带任务都没用过，值的写法未知，所以没有加入。'],
  ['ide.kit.p.mi.c.state.extra.f.tag', ...TAG], ['ide.kit.p.mi.c.state.extra.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.state.extra.f.unmasking', 'Unmasking name', 'Имя демаскировки', 'Назва демаскування', '暴露名称'],

  // 443 mi.c.wait
  ['ide.kit.p.mi.c.wait', 'Unit waits (waypoint)', 'Юнит ждёт (точка пути)', 'Юніт чекає (точка шляху)', '单位等待（路径点）'],
  ['ide.kit.p.mi.c.wait.d', 'The unit that reaches this waypoint waits the given seconds before going on to the next one.',
    'Юнит, дошедший до этой точки пути, ждёт заданные секунды, потом идёт к следующей.',
    'Юніт, що дійшов до цієї точки шляху, чекає задані секунди, потім іде до наступної.',
    '到达此路径点的单位等待指定秒数后再前往下一个。'],
  ['ide.kit.p.mi.c.wait.w', 'Only for a waypoint\'s {commands} block; in {actions} use "delay".',
    'Только для блока {commands} точки пути; в {actions} используйте "delay".',
    'Лише для блоку {commands} точки шляху; у {actions} використовуйте "delay".',
    '只用于路径点的 {commands} 块；在 {actions} 中请用 "delay"。'],
  ['ide.kit.p.mi.c.wait.f.time', 'Wait time', 'Время ожидания', 'Час очікування', '等待时间'],

  // 444 mi.c.board
  ['ide.kit.p.mi.c.board', 'Crew boards a vehicle', 'Экипаж садится в технику', 'Екіпаж сідає в техніку', '乘员登上载具'],
  ['ide.kit.p.mi.c.board.d', 'One soldier of the crew tag who can man a vehicle goes to the tagged vehicle and gets in.',
    'Один солдат с тегом экипажа, способный управлять техникой, идёт к технике с тегом и садится в неё.',
    'Один солдат з тегом екіпажу, здатний керувати технікою, іде до техніки з тегом і сідає в неї.',
    '一名带乘员标签、能操作载具的士兵走到带标签的载具并上车。'],
  ['ide.kit.p.mi.c.board.w', 'Vehicles placed in the mission start empty: this is how the AI gets crews into them.',
    'Техника, поставленная в миссии, стоит без экипажа: так ИИ сажает в неё людей.',
    'Техніка, поставлена в місії, стоїть без екіпажу: так ШІ садить у неї людей.',
    '任务中放置的载具开始时没有乘员：AI 就是这样给它们配乘员的。'],
  ['ide.kit.p.mi.c.board.f.crew_tag', 'Crew tag', 'Тег экипажа', 'Тег екіпажу', '乘员标签'],
  ['ide.kit.p.mi.c.board.f.vehicle_tag', 'Vehicle tag', 'Тег техники', 'Тег техніки', '载具标签'],

  // 445 mi.c.emit
  ['ide.kit.p.mi.c.emit', 'Crew or passengers get out', 'Экипаж или пассажиры выходят', 'Екіпаж або пасажири виходять', '乘员或乘客下车'],
  ['ide.kit.p.mi.c.emit.d', 'The people in the tagged vehicles get out and go to the waypoint. The mode picks passengers, crew or all.',
    'Люди в технике с тегом выходят и идут к точке пути. Режим выбирает пассажиров, экипаж или всех.',
    'Люди в техніці з тегом виходять і йдуть до точки шляху. Режим обирає пасажирів, екіпаж або всіх.',
    '带标签载具里的人下车并前往路径点。模式决定是乘客、乘员还是全部。'],
  ['ide.kit.p.mi.c.emit.f.tag', 'Vehicle tag', 'Тег техники', 'Тег техніки', '载具标签'],
  ['ide.kit.p.mi.c.emit.f.waypoint', ...WP], ['ide.kit.p.mi.c.emit.f.waypoint.h', ...WP_H],
  ['ide.kit.p.mi.c.emit.f.mode', 'Who gets out', 'Кто выходит', 'Хто виходить', '谁下车'],

  // 446 mi.c.air_attack
  ['ide.kit.p.mi.c.air_attack', 'Call an air strike', 'Вызвать авиаудар', 'Викликати авіаудар', '呼叫空袭'],
  ['ide.kit.p.mi.c.air_attack.d', 'A copy of the tagged aircraft flies in and attacks the units of the target tag at the given height.',
    'Копия самолёта с тегом прилетает и атакует юнитов с тегом цели на заданной высоте.',
    'Копія літака з тегом прилітає й атакує юнітів з тегом цілі на заданій висоті.',
    '带标签飞机的一个副本飞来，在指定高度攻击目标标签的单位。'],
  ['ide.kit.p.mi.c.air_attack.f.tag', 'Aircraft tag', 'Тег самолёта', 'Тег літака', '飞机标签'],
  ['ide.kit.p.mi.c.air_attack.f.target_tag', 'Target tag', 'Тег цели', 'Тег цілі', '目标标签'],
  ['ide.kit.p.mi.c.air_attack.f.altitude', 'Attack height', 'Высота атаки', 'Висота атаки', '攻击高度'],

  // 447 mi.c.air_state
  ['ide.kit.p.mi.c.air_state', 'Aircraft altitude or landed', 'Высота самолёта или посадка', 'Висота літака або посадка', '飞机高度或着陆'],
  ['ide.kit.p.mi.c.air_state.d', 'The aircraft that reaches this waypoint drops its orders and flies on at the given height.',
    'Самолёт, долетевший до этой точки пути, бросает приказы и летит дальше на заданной высоте.',
    'Літак, що долетів до цієї точки шляху, кидає накази й летить далі на заданій висоті.',
    '到达此路径点的飞机放弃命令，并以指定高度继续飞行。'],
  ['ide.kit.p.mi.c.air_state.w', 'Only for a waypoint\'s {commands} block, as in the stock missions.',
    'Только для блока {commands} точки пути, как в миссиях игры.',
    'Лише для блоку {commands} точки шляху, як у місіях гри.',
    '只用于路径点的 {commands} 块，与自带任务相同。'],
  ['ide.kit.p.mi.c.air_state.f.altitude', 'Flight height', 'Высота полёта', 'Висота польоту', '飞行高度'],

  // 448 mi.c.throw_off
  ['ide.kit.p.mi.c.throw_off', 'Throw units off (blast)', 'Сбросить юнитов (взрыв)', 'Скинути юнітів (вибух)', '抛出单位（爆炸）'],
  ['ide.kit.p.mi.c.throw_off.d', 'Throws the tagged soldiers out of the vehicle they sit in, up and forward. Stock missions use it to drop paratroopers.',
    'Выбрасывает солдат с тегом из техники, в которой они сидят, вверх и вперёд. В миссиях игры так сбрасывают десант.',
    'Викидає солдатів з тегом із техніки, у якій вони сидять, угору й уперед. У місіях гри так скидають десант.',
    '把坐在载具里的带标签士兵向上向前抛出。自带任务用它投放伞兵。'],
  ['ide.kit.p.mi.c.throw_off.f.tag', ...TAG], ['ide.kit.p.mi.c.throw_off.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.throw_off.f.up', 'Throw up', 'Бросок вверх', 'Кидок угору', '向上抛出'],
  ['ide.kit.p.mi.c.throw_off.f.forward', 'Throw forward', 'Бросок вперёд', 'Кидок уперед', '向前抛出'],

  // 449 mi.c.animation
  ['ide.kit.p.mi.c.animation', 'Play a soldier animation', 'Проиграть анимацию солдата', 'Програти анімацію солдата', '播放士兵动画'],
  ['ide.kit.p.mi.c.animation.d', 'The tagged soldiers play the named animation in a loop, for example looking through binoculars.',
    'Солдаты с тегом проигрывают названную анимацию по кругу, например смотрят в бинокль.',
    'Солдати з тегом програють названу анімацію по колу, наприклад дивляться в бінокль.',
    '带标签的士兵循环播放指定动画，例如用望远镜观察。'],
  ['ide.kit.p.mi.c.animation.f.tag', ...TAG], ['ide.kit.p.mi.c.animation.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.animation.f.collage', 'Animation name', 'Имя анимации', 'Назва анімації', '动画名'],
  ['ide.kit.p.mi.c.animation.f.collage.h', 'Several names in quotes, with {flags "loop random"}, play one of them at random.',
    'Несколько имён в кавычках с {flags "loop random"} играются вперемешку.',
    'Кілька назв у лапках з {flags "loop random"} граються навмання.',
    '多个名称放在引号里并配 {flags "loop random"}，会随机播放其中一个。'],

  // 450 mi.c.animate
  ['ide.kit.p.mi.c.animate', 'Play an object animation', 'Проиграть анимацию объекта', 'Програти анімацію об\'єкта', '播放物体动画'],
  ['ide.kit.p.mi.c.animate.d', 'Plays a named animation of the tagged object, for example its wheels turning. Speed 0 stops it.',
    'Проигрывает названную анимацию объекта с тегом, например вращение колёс. Скорость 0 её останавливает.',
    'Програє названу анімацію об\'єкта з тегом, наприклад обертання коліс. Швидкість 0 її зупиняє.',
    '播放带标签物体的指定动画，例如车轮转动。速度为 0 时停止。'],
  ['ide.kit.p.mi.c.animate.f.tag', 'Object tag', 'Тег объекта', 'Тег об\'єкта', '物体标签'],
  ['ide.kit.p.mi.c.animate.f.animation', 'Animation name', 'Имя анимации', 'Назва анімації', '动画名'],
  ['ide.kit.p.mi.c.animate.f.speed', 'Play speed', 'Скорость проигрывания', 'Швидкість програвання', '播放速度'],

  // 451 mi.c.follow_anim
  ['ide.kit.p.mi.c.follow_anim', 'Follow an entity animation', 'Следовать анимации объекта', 'Слідувати анімації об\'єкта', '跟随物体动画'],
  ['ide.kit.p.mi.c.follow_anim.d', ...nt(['The tagged units follow the animation of another object on one of its bones.',
    'Юниты с тегом следуют анимации другого объекта на одной из его костей.',
    'Юніти з тегом слідують анімації іншого об\'єкта на одній з його кісток.',
    '带标签的单位跟随另一物体某根骨骼上的动画。'])],
  ['ide.kit.p.mi.c.follow_anim.w', 'No stock mission uses this command. The entity value is a number whose meaning is not yet read from the engine.',
    'Ни одна миссия игры не использует эту команду. Значение entity — число, смысл которого ещё не прочитан из движка.',
    'Жодна місія гри не використовує цю команду. Значення entity — число, зміст якого ще не прочитано з рушія.',
    '自带任务都没用过此命令。entity 的值是一个数字，其含义尚未从引擎中读出。'],
  ['ide.kit.p.mi.c.follow_anim.f.tag', ...TAG], ['ide.kit.p.mi.c.follow_anim.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.follow_anim.f.entity', 'Followed object', 'Объект для следования', 'Об\'єкт для слідування', '被跟随的物体'],
  ['ide.kit.p.mi.c.follow_anim.f.bone', 'Bone name', 'Имя кости', 'Ім\'я кістки', '骨骼名'],

  // 452 mi.c.manual_lock
  ['ide.kit.p.mi.c.manual_lock', 'Lock direct control', 'Запретить прямое управление', 'Заборонити пряме керування', '锁定直接控制'],
  ['ide.kit.p.mi.c.manual_lock.d', ...nt(['Locks or unlocks direct control of the tagged units.',
    'Запрещает или разрешает прямое управление юнитами с тегом.',
    'Забороняє або дозволяє пряме керування юнітами з тегом.',
    '锁定或解锁对带标签单位的直接控制。'])],
  ['ide.kit.p.mi.c.manual_lock.f.tag', ...TAG], ['ide.kit.p.mi.c.manual_lock.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.manual_lock.f.lock', 'Lock', 'Запрет', 'Заборона', '锁定'],

  // 453 mi.c.tpc
  ['ide.kit.p.mi.c.tpc', 'Third-person control', 'Управление от третьего лица', 'Керування від третьої особи', '第三人称控制'],
  ['ide.kit.p.mi.c.tpc.d', 'Puts the camera behind the tagged unit and gives the player direct control, with limits on look angle and zoom. {lock off} ends it.',
    'Ставит камеру за юнитом с тегом и даёт игроку прямое управление с пределами угла обзора и приближения. {lock off} это отменяет.',
    'Ставить камеру за юнітом з тегом і дає гравцеві пряме керування з межами кута огляду й наближення. {lock off} це скасовує.',
    '把镜头放到带标签单位后方并让玩家直接控制，同时限制视角和缩放。{lock off} 结束。'],
  ['ide.kit.p.mi.c.tpc.w', 'offest is spelled this way in the game; keep it.', 'offest в игре пишется именно так; оставьте.', 'offest у грі пишеться саме так; залиште.', '游戏里就写作 offest，请保持原样。'],
  ['ide.kit.p.mi.c.tpc.f.tag', ...TAG], ['ide.kit.p.mi.c.tpc.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.tpc.f.x', 'Camera back or front', 'Камера назад/вперёд', 'Камера назад/вперед', '镜头前后偏移'],
  ['ide.kit.p.mi.c.tpc.f.z', 'Camera height', 'Высота камеры', 'Висота камери', '镜头高度'],
  ['ide.kit.p.mi.c.tpc.f.zoom_max', 'Farthest zoom', 'Наибольшее отдаление', 'Найбільше віддалення', '最远缩放'],

  // 454 mi.c.mine
  ['ide.kit.p.mi.c.mine', 'Lay mines in a zone', 'Заминировать зону', 'Замінувати зону', '在区域内布雷'],
  ['ide.kit.p.mi.c.mine.d', ...nt(['The tagged soldiers lay mines in the named zone. When they are done the event is set.',
    'Солдаты с тегом ставят мины в названной зоне. Когда они закончат, ставится событие.',
    'Солдати з тегом ставлять міни в названій зоні. Коли вони закінчать, ставиться подія.',
    '带标签的士兵在指定区域布雷，完成后触发事件。'])],
  ['ide.kit.p.mi.c.mine.f.tag', ...TAG], ['ide.kit.p.mi.c.mine.f.tag.h', 'Soldiers who carry mines.', 'Солдаты, у которых есть мины.', 'Солдати, які мають міни.', '携带地雷的士兵。'],
  ['ide.kit.p.mi.c.mine.f.zone', 'Zone name', 'Имя зоны', 'Назва зони', '区域名'],
  ['ide.kit.p.mi.c.mine.f.event', 'Event when done', 'Событие по завершении', 'Подія після завершення', '完成时的事件'],

  // 455 mi.c.mine_state
  ['ide.kit.p.mi.c.mine_state', 'Arm, detect or disarm a mine', 'Взвести, обнаружить или обезвредить мину', 'Звести, виявити або знешкодити міну', '布设、发现或拆除地雷'],
  ['ide.kit.p.mi.c.mine_state.d', ...nt(['Arms the tagged mines for one side. Write {action detect} to mark them found or {action disarm} to make them safe; those two need no miner line.',
    'Взводит мины с тегом для одной стороны. {action detect} помечает их найденными, {action disarm} обезвреживает; этим двум строка miner не нужна.',
    'Зводить міни з тегом для однієї сторони. {action detect} позначає їх знайденими, {action disarm} знешкоджує; цим двом рядок miner не потрібен.',
    '为某一方布设带标签的地雷。写 {action detect} 标记为已发现，写 {action disarm} 使其安全；这两种不需要 miner 行。'])],
  ['ide.kit.p.mi.c.mine_state.f.tag', 'Mine tag', 'Тег мины', 'Тег міни', '地雷标签'],
  ['ide.kit.p.mi.c.mine_state.f.miner', 'Side of the mine', 'Сторона мины', 'Сторона міни', '地雷所属方'],
  ['ide.kit.p.mi.c.mine_state.f.miner.h', 'The player number the mine belongs to, as in {player "1"}.', 'Номер игрока, которому принадлежит мина, как в {player "1"}.', 'Номер гравця, якому належить міна, як у {player "1"}.', '地雷所属玩家的编号，写法同 {player "1"}。'],

  // 456 mi.c.entity_state
  ['ide.kit.p.mi.c.entity_state', 'Add or remove a tag, hide, make invulnerable', 'Добавить или снять тег, скрыть, сделать неуязвимым', 'Додати або зняти тег, сховати, зробити невразливим', '添加或移除标签、隐藏、设为无敌'],
  ['ide.kit.p.mi.c.entity_state.d', 'Changes the tags of the selected units, wakes them ({inactive off}), sets how much harm they take and shows them on the map. Delete the lines you do not need.',
    'Меняет теги выбранных юнитов, включает их ({inactive off}), задаёт, сколько урона они получают, и показывает их на карте. Удалите ненужные строки.',
    'Змінює теги вибраних юнітів, вмикає їх ({inactive off}), задає, скільки шкоди вони отримують, і показує їх на мапі. Видаліть непотрібні рядки.',
    '修改所选单位的标签，激活它们（{inactive off}），设置受到的伤害并在地图上显示。删掉不需要的行。'],
  ['ide.kit.p.mi.c.entity_state.f.tag', ...TAG], ['ide.kit.p.mi.c.entity_state.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.entity_state.f.tag_add', 'Tag to add', 'Добавить тег', 'Додати тег', '要添加的标签'],
  ['ide.kit.p.mi.c.entity_state.f.tag_remove', 'Tag to remove', 'Снять тег', 'Зняти тег', '要移除的标签'],
  ['ide.kit.p.mi.c.entity_state.f.impregnability', 'Damage taken', 'Получаемый урон', 'Отримувана шкода', '受到的伤害'],
  ['ide.kit.p.mi.c.entity_state.f.impregnability.h', 'disabled = normal damage, harmless and full = protected (full most).', 'disabled = обычный урон, harmless и full = защита (full сильнее).', 'disabled = звичайна шкода, harmless і full = захист (full сильніший).', 'disabled = 正常受伤，harmless 和 full = 受保护（full 最强）。'],

  // 457 mi.c.ables
  ['ide.kit.p.mi.c.ables', 'Add or remove abilities', 'Добавить или убрать способности', 'Додати або прибрати здатності', '添加或移除能力'],
  ['ide.kit.p.mi.c.ables.d', 'Gives the tagged units one ability and takes another away, for example lets passengers jump out near enemies or stops the player selecting them.',
    'Даёт юнитам с тегом одну способность и забирает другую, например пассажиры выпрыгивают у врагов или игрок не может их выбрать.',
    'Дає юнітам з тегом одну здатність і забирає іншу, наприклад пасажири вистрибують біля ворогів або гравець не може їх вибрати.',
    '给带标签的单位添加一种能力并移除另一种，例如让乘客在敌人附近下车，或让玩家无法选中它们。'],
  ['ide.kit.p.mi.c.ables.f.tag', ...TAG], ['ide.kit.p.mi.c.ables.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.ables.f.add', 'Ability to add', 'Добавить способность', 'Додати здатність', '要添加的能力'],
  ['ide.kit.p.mi.c.ables.f.remove', 'Ability to remove', 'Убрать способность', 'Прибрати здатність', '要移除的能力'],

  // 458 mi.c.player
  ['ide.kit.p.mi.c.player', 'Change a unit\'s side', 'Сменить сторону юнита', 'Змінити сторону юніта', '改变单位所属方'],
  ['ide.kit.p.mi.c.player.d', 'Moves the tagged units to another player number, for example to hand a captured tank to the player.',
    'Переводит юнитов с тегом к другому номеру игрока, например отдаёт игроку захваченный танк.',
    'Переводить юнітів з тегом до іншого номера гравця, наприклад віддає гравцеві захоплений танк.',
    '把带标签的单位转给另一个玩家编号，例如把缴获的坦克交给玩家。'],
  ['ide.kit.p.mi.c.player.f.tag', ...TAG], ['ide.kit.p.mi.c.player.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.player.f.player', 'New player number', 'Новый номер игрока', 'Новий номер гравця', '新的玩家编号'],

  // 459 mi.c.autoassign
  ['ide.kit.p.mi.c.autoassign', 'Give units to the human player\'s squads', 'Отдать юнитов в отряды игрока', 'Віддати юнітів у загони гравця', '把单位编入玩家的小队'],
  ['ide.kit.p.mi.c.autoassign.d', 'Puts the tagged units into the player\'s squads so they show in the unit bar and can be ordered.',
    'Включает юнитов с тегом в отряды игрока, чтобы они были на панели юнитов и слушались приказов.',
    'Включає юнітів з тегом у загони гравця, щоб вони були на панелі юнітів і слухалися наказів.',
    '把带标签的单位编入玩家的小队，使其出现在单位栏并可下令。'],
  ['ide.kit.p.mi.c.autoassign.w', 'In multiplayer it also raises the autoassign event.', 'В сетевой игре он также вызывает событие autoassign.', 'У мережевій грі він також викликає подію autoassign.', '在多人游戏中还会触发 autoassign 事件。'],
  ['ide.kit.p.mi.c.autoassign.f.tag', ...TAG], ['ide.kit.p.mi.c.autoassign.f.tag.h', ...TAG_H],

  // 460 mi.c.linker
  ['ide.kit.p.mi.c.linker', 'Link or unlink units to seats', 'Посадить или высадить юнитов с мест', 'Посадити або висадити юнітів з місць', '将单位链接到座位或解除'],
  ['ide.kit.p.mi.c.linker.d', 'Puts one soldier of the unit tag straight into a seat of the tagged vehicle, with no walking. unlink takes them out.',
    'Сажает одного солдата с тегом сразу на место в технике с тегом, без подхода. unlink высаживает.',
    'Садить одного солдата з тегом одразу на місце в техніці з тегом, без підходу. unlink висаджує.',
    '把一名带标签的士兵直接放进带标签载具的座位，无需走过去。unlink 则把他取出。'],
  ['ide.kit.p.mi.c.linker.f.vehicle_tag', 'Vehicle tag', 'Тег техники', 'Тег техніки', '载具标签'],
  ['ide.kit.p.mi.c.linker.f.action', 'Link or unlink', 'Посадить или высадить', 'Посадити або висадити', '链接或解除'],
  ['ide.kit.p.mi.c.linker.f.unit_tag', 'Soldier tag', 'Тег солдата', 'Тег солдата', '士兵标签'],

  // 461 mi.c.unlink
  ['ide.kit.p.mi.c.unlink', 'Take a unit out of its seat', 'Высадить юнита с места', 'Висадити юніта з місця', '把单位从座位上取出'],
  ['ide.kit.p.mi.c.unlink.d', 'Takes the tagged soldiers out of the vehicle or gun they sit in.',
    'Высаживает солдат с тегом из техники или орудия, где они сидят.',
    'Висаджує солдатів з тегом з техніки або гармати, де вони сидять.',
    '把带标签的士兵从所在的载具或火炮中取出。'],
  ['ide.kit.p.mi.c.unlink.f.tag', ...TAG], ['ide.kit.p.mi.c.unlink.f.tag.h', ...TAG_H],

  // 462 mi.c.placement
  ['ide.kit.p.mi.c.placement', 'Move an object to a waypoint', 'Перенести объект на точку пути', 'Перенести об\'єкт на точку шляху', '把物体移到路径点'],
  ['ide.kit.p.mi.c.placement.d', 'Moves the tagged objects to the waypoint at once, with no walking.',
    'Сразу переносит объекты с тегом на точку пути, без перехода.',
    'Одразу переносить об\'єкти з тегом на точку шляху, без переходу.',
    '立即把带标签的物体移到路径点，无需走过去。'],
  ['ide.kit.p.mi.c.placement.f.tag', ...TAG], ['ide.kit.p.mi.c.placement.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.placement.f.waypoint', ...WP], ['ide.kit.p.mi.c.placement.f.waypoint.h', ...WP_H],

  // 463 mi.c.rt_function
  ['ide.kit.p.mi.c.rt_function', 'Run a built-in entity function (flags up/down)', 'Вызвать встроенную функцию объекта (флаги вверх/вниз)', 'Викликати вбудовану функцію об\'єкта (прапори вгору/вниз)', '运行物体的内置函数（旗帜升/降）'],
  ['ide.kit.p.mi.c.rt_function.d', 'Calls the AniPlay function of the tagged objects: a flag goes up or down at the given speed.',
    'Вызывает функцию AniPlay у объектов с тегом: флаг поднимается или опускается с заданной скоростью.',
    'Викликає функцію AniPlay в об\'єктів з тегом: прапор піднімається або опускається із заданою швидкістю.',
    '调用带标签物体的 AniPlay 函数：旗帜以指定速度升起或降下。'],
  ['ide.kit.p.mi.c.rt_function.f.tag', 'Flag tag', 'Тег флага', 'Тег прапора', '旗帜标签'],
  ['ide.kit.p.mi.c.rt_function.f.name', 'Up or down', 'Вверх или вниз', 'Угору або вниз', '升或降'],
  ['ide.kit.p.mi.c.rt_function.f.speed', 'Speed', 'Скорость', 'Швидкість', '速度'],

  // 464 mi.c.squad_create
  ['ide.kit.p.mi.c.squad_create', 'Make a squad', 'Создать отряд', 'Створити загін', '组建小队'],
  ['ide.kit.p.mi.c.squad_create.d', 'Joins the tagged units into one AI squad with a name, so later commands can move them together.',
    'Объединяет юнитов с тегом в один отряд ИИ с именем, чтобы следующие команды двигали их вместе.',
    'Об\'єднує юнітів з тегом в один загін ШІ з назвою, щоб наступні команди рухали їх разом.',
    '把带标签的单位编成一个有名称的 AI 小队，以便之后的命令让它们一起行动。'],
  ['ide.kit.p.mi.c.squad_create.f.tag', ...TAG], ['ide.kit.p.mi.c.squad_create.f.tag.h', ...TAG_H],
  ['ide.kit.p.mi.c.squad_create.f.squad', ...SQUAD],

  // 465 mi.c.squad_to_wp
  ['ide.kit.p.mi.c.squad_to_wp', 'Send a squad to a waypoint', 'Отправить отряд к точке пути', 'Відправити загін до точки шляху', '派小队前往路径点'],
  ['ide.kit.p.mi.c.squad_to_wp.d', 'The named squad moves to the waypoint together and follows the path from there.',
    'Названный отряд вместе идёт к точке пути и дальше по маршруту.',
    'Названий загін разом іде до точки шляху й далі маршрутом.',
    '指定的小队一起前往路径点，并从那里沿路线前进。'],
  ['ide.kit.p.mi.c.squad_to_wp.f.squad', ...SQUAD], ['ide.kit.p.mi.c.squad_to_wp.f.squad.h', ...SQUAD_H],
  ['ide.kit.p.mi.c.squad_to_wp.f.waypoint', ...WP], ['ide.kit.p.mi.c.squad_to_wp.f.waypoint.h', ...WP_H],

  // 466 mi.c.squad_state
  ['ide.kit.p.mi.c.squad_state', 'Squad behaviour', 'Поведение отряда', 'Поведінка загону', '小队行为'],
  ['ide.kit.p.mi.c.squad_state.d', 'Sets the named squad to guard and to move in normal formation.',
    'Ставит названный отряд в охрану и в обычный походный порядок.',
    'Ставить названий загін в охорону й у звичайний похідний порядок.',
    '让指定的小队进入警戒并以普通队形移动。'],
  ['ide.kit.p.mi.c.squad_state.w', 'A {mode slow} line in the movement block slows the squad (stock missions write it in its own command).',
    'Строка {mode slow} в блоке movement замедляет отряд (в миссиях игры её пишут отдельной командой).',
    'Рядок {mode slow} у блоці movement сповільнює загін (у місіях гри його пишуть окремою командою).',
    'movement 块中的 {mode slow} 一行会让小队减速（自带任务把它写在单独的命令里）。'],
  ['ide.kit.p.mi.c.squad_state.f.squad', ...SQUAD], ['ide.kit.p.mi.c.squad_state.f.squad.h', ...SQUAD_H],
  ['ide.kit.p.mi.c.squad_state.f.guard', 'Guard', 'Охрана', 'Охорона', '警戒'],

  // 467 mi.c.squad
  ['ide.kit.p.mi.c.squad', 'Set a squad\'s commander', 'Назначить командира отряда', 'Призначити командира загону', '设置小队指挥官'],
  ['ide.kit.p.mi.c.squad.d', 'Makes the selected soldier the commander of the named squad; the others follow him.',
    'Делает выбранного солдата командиром названного отряда; остальные следуют за ним.',
    'Робить вибраного солдата командиром названого загону; решта йде за ним.',
    '让所选士兵成为指定小队的指挥官，其他人跟随他。'],
  ['ide.kit.p.mi.c.squad.f.squad', ...SQUAD], ['ide.kit.p.mi.c.squad.f.squad.h', ...SQUAD_H],
  ['ide.kit.p.mi.c.squad.f.tag', 'Commander tag', 'Тег командира', 'Тег командира', '指挥官标签'],

  // 468 mi.c.squad_dismiss
  ['ide.kit.p.mi.c.squad_dismiss', 'Disband a squad', 'Распустить отряд', 'Розпустити загін', '解散小队'],
  ['ide.kit.p.mi.c.squad_dismiss.d', 'Breaks up the named squad; its units act on their own again.',
    'Распускает названный отряд; его юниты снова действуют сами.',
    'Розпускає названий загін; його юніти знову діють самі.',
    '解散指定的小队，其单位重新各自行动。'],
  ['ide.kit.p.mi.c.squad_dismiss.f.squad', ...SQUAD], ['ide.kit.p.mi.c.squad_dismiss.f.squad.h', ...SQUAD_H],
];

// Code Pieces, group mi-sys-1: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-sys-1.js
// (large mission systems: objective chain, wave defence, stealth alarm, reinforcement manager).
// Author: Imperator_Aug (ARSENAL, ia-ba41acac)
'use strict';

const rows = [];
const add = (k, en, ru, uk, zh) => rows.push([k, en, ru, uk, zh]);
// a field label, an optional hint, and the labels of its copies ("Same ... again")
function field(id, name, lab, hint, copies) {
  const k = 'ide.kit.p.' + id + '.f.';
  add(k + name, lab[0], lab[1], lab[2], lab[3]);
  if (hint) add(k + name + '.h', hint[0], hint[1], hint[2], hint[3]);
  for (const c of copies || []) {
    add(k + c, 'Same ' + lab[0].toLowerCase() + ' again', lab[1] + ' (ещё раз)', lab[2] + ' (ще раз)', lab[3] + '（同上）');
    add(k + c + '.h', 'Use the same value as above.', 'То же значение, что и выше.', 'Те саме значення, що й вище.', '与上面的值相同。');
  }
}

// 636
const A = 'mi.sys.three_stage_objective_chain_take_des';
add('ide.kit.p.' + A, 'Three-stage objective chain (take, destroy, hold)',
  'Цепочка из трёх задач (занять, уничтожить, удержать)',
  'Ланцюжок із трьох завдань (зайняти, знищити, утримати)',
  '三阶段目标链（占领、摧毁、坚守）');
add('ide.kit.p.' + A + '.d',
  'Adds the triggers for three goals in a row: clear the village of enemies, destroy the gun battery, then hold out until a countdown ends to win. You lose when all your soldiers are dead. Not tried in game. Not for multiplayer maps.',
  'Добавляет триггеры для трёх задач подряд: очистить деревню от врагов, уничтожить батарею орудий, затем продержаться до конца отсчёта и победить. Поражение, когда все ваши солдаты погибли. В игре не проверено. Не для сетевых карт.',
  'Додає тригери для трьох завдань поспіль: очистити село від ворогів, знищити батарею гармат, потім протриматися до кінця відліку й перемогти. Поразка, коли всі ваші солдати загинули. У грі не перевірено. Не для мережевих карт.',
  '添加连续三个目标的触发器：清除村里的敌人，摧毁炮兵阵地，然后坚守到倒计时结束即获胜。你的士兵全部阵亡则失败。未在游戏中测试。不适用于多人地图。');
add('ide.kit.p.' + A + '.w',
  'On a loss only the first task is failed; failing a task that is still hidden may show it. The debug trigger is off: remove {disabled} to jump to stage 3 at start. A gun with crew counts as manned, so crews that leave their guns alive also end stage 2. The names are fixed: add this piece once per mission.',
  'При поражении проваливается только первая задача; проваленная скрытая задача может показаться. Отладочный триггер выключен: уберите {disabled}, чтобы сразу перейти к этапу 3. Орудие с расчётом считается занятым, поэтому расчёт, живым покинувший орудие, тоже завершает этап 2. Имена постоянные: вставляйте этот кусок один раз на миссию.',
  'При поразці провалюється лише перше завдання; провалене приховане завдання може з’явитися. Тригер налагодження вимкнено: приберіть {disabled}, щоб одразу перейти до етапу 3. Гармата з обслугою вважається зайнятою, тож обслуга, що живою покинула гармату, теж завершує етап 2. Імена сталі: вставляйте цей шматок один раз на місію.',
  '失败时只有第一个任务被判失败；失败一个仍隐藏的任务可能会让它显示出来。调试触发器默认关闭：删掉 {disabled} 可在开局直接跳到第 3 阶段。有乘员的火炮算作有人操作，所以乘员活着离开火炮也会结束第 2 阶段。名称是固定的：每个任务只插入一次。');
add('ide.kit.p.' + A + '.n',
  'Goes into {triggers} inside {Helpers}. Elsewhere in Helpers add: {event "chain_time_up"} and {event "chain_over"}; {"chain_stage"} in {vars}; a circle {zone} with the village name; in {tasks} three hidden primary tasks "chain_obj1", "chain_obj2", "chain_obj3" with {desc "$/chain_obj1"} and so on. Text rows chain_obj1, chain_obj2, chain_obj3 and chain_timer in the mission text file. Units placed with the player, enemy and battery tags.',
  'Ставится в {triggers} внутри {Helpers}. В другие места Helpers добавьте: {event "chain_time_up"} и {event "chain_over"}; {"chain_stage"} в {vars}; круглую {zone} с именем деревни; в {tasks} три скрытые главные задачи "chain_obj1", "chain_obj2", "chain_obj3" с {desc "$/chain_obj1"} и так далее. Строки текста chain_obj1, chain_obj2, chain_obj3 и chain_timer в текстовом файле миссии. Юниты, расставленные с тегами игрока, врага и батареи.',
  'Ставиться в {triggers} усередині {Helpers}. В інші місця Helpers додайте: {event "chain_time_up"} і {event "chain_over"}; {"chain_stage"} у {vars}; круглу {zone} з ім’ям села; у {tasks} три приховані головні завдання "chain_obj1", "chain_obj2", "chain_obj3" з {desc "$/chain_obj1"} і так далі. Рядки тексту chain_obj1, chain_obj2, chain_obj3 і chain_timer у текстовому файлі місії. Юніти, розставлені з тегами гравця, ворога й батареї.',
  '放在 {Helpers} 里的 {triggers} 中。在 Helpers 的其他位置添加：{event "chain_time_up"} 和 {event "chain_over"}；在 {vars} 中加 {"chain_stage"}；一个以村庄名命名的圆形 {zone}；在 {tasks} 中加三个隐藏的主要任务 "chain_obj1"、"chain_obj2"、"chain_obj3"，带 {desc "$/chain_obj1"} 等。任务文本文件中要有 chain_obj1、chain_obj2、chain_obj3 和 chain_timer 文本行。放置带有玩家、敌人和炮兵阵地标签的单位。');
field(A, 'enemy', ['Village enemy tag', 'Тег врагов в деревне', 'Тег ворогів у селі', '村内敌人标签'],
  ['Tag on the enemy soldiers that hold the village.', 'Тег на вражеских солдатах, занимающих деревню.', 'Тег на ворожих солдатах, що тримають село.', '守村敌兵身上的标签。']);
field(A, 'village', ['Village zone', 'Зона деревни', 'Зона села', '村庄区域'],
  ['Name of the circle zone around the village.', 'Имя круглой зоны вокруг деревни.', 'Ім’я круглої зони навколо села.', '村庄周围圆形区域的名称。'], ['village_2']);
field(A, 'player', ['Player units tag', 'Тег юнитов игрока', 'Тег юнітів гравця', '玩家单位标签'],
  ['Tag on all your soldiers.', 'Тег на всех ваших солдатах.', 'Тег на всіх ваших солдатах.', '你所有士兵身上的标签。'], ['player_2']);
field(A, 'battery', ['Gun battery tag', 'Тег батареи', 'Тег батареї', '炮兵阵地标签'],
  ['Tag on the guns to destroy.', 'Тег на орудиях, которые надо уничтожить.', 'Тег на гарматах, які треба знищити.', '需要摧毁的火炮身上的标签。']);
field(A, 'hold', ['Hold time', 'Время удержания', 'Час утримання', '坚守时间'],
  ['Seconds to hold out in stage 3.', 'Секунды, которые надо продержаться на этапе 3.', 'Секунди, які треба протриматися на етапі 3.', '第 3 阶段需要坚守的秒数。'], ['hold_2']);

// 637
const B = 'mi.sys.wave_defence_mission_core';
add('ide.kit.p.' + B, 'Wave-defence mission core',
  'Основа миссии с обороной от волн',
  'Основа місії з обороною від хвиль',
  '波次防守任务核心');
add('ide.kit.p.' + B + '.d',
  'Adds the triggers for a defence mission: after a warm-up, a new enemy wave comes at set times, copied from three hidden pools (infantry, machine guns, tanks), and attacks your base. You get points after each wave is beaten, lose when no soldier of yours is left in the base, and win when the last wave is dead. Not tried in game. Not for multiplayer maps.',
  'Добавляет триггеры для миссии обороны: после подготовки через заданное время приходит новая вражеская волна, скопированная из трёх скрытых запасов (пехота, пулемёты, танки), и атакует вашу базу. После каждой отбитой волны даются очки; поражение, когда на базе не осталось ваших солдат, победа, когда последняя волна уничтожена. В игре не проверено. Не для сетевых карт.',
  'Додає тригери для місії оборони: після підготовки через заданий час приходить нова ворожа хвиля, скопійована з трьох прихованих запасів (піхота, кулемети, танки), і атакує вашу базу. Після кожної відбитої хвилі даються очки; поразка, коли на базі не лишилося ваших солдатів, перемога, коли останню хвилю знищено. У грі не перевірено. Не для мережевих карт.',
  '添加防守任务的触发器：准备时间过后，每隔设定时间就有一波新的敌人，从三个隐藏的单位池（步兵、机枪、坦克）复制出来，进攻你的基地。每打退一波获得分数；基地里没有你的士兵则失败，最后一波被消灭则获胜。未在游戏中测试。不适用于多人地图。');
add('ide.kit.p.' + B + '.w',
  'Only units still inside the spawn zone 1 second after they appear join the wave; keep the pools outside that zone. The bonus is paid every 30 seconds while no wave unit is alive, from the first wave on. The wave count is compared with a var ({value "wave_max$"}), which the engine reads but no vanilla cmp_i uses: write the number there if it fails. The names are fixed: add this piece once per mission.',
  'В волну попадают только юниты, которые через 1 секунду после появления ещё в зоне появления; держите запасы вне этой зоны. Бонус платится каждые 30 секунд, пока нет живых юнитов волны, начиная с первой волны. Номер волны сравнивается с переменной ({value "wave_max$"}): движок это читает, но ни один ванильный cmp_i так не делает; если не сработает, впишите число. Имена постоянные: вставляйте этот кусок один раз на миссию.',
  'До хвилі потрапляють лише юніти, які через 1 секунду після появи ще в зоні появи; тримайте запаси поза цією зоною. Бонус платиться кожні 30 секунд, поки немає живих юнітів хвилі, починаючи з першої хвилі. Номер хвилі порівнюється зі змінною ({value "wave_max$"}): рушій це читає, але жоден ванільний cmp_i так не робить; якщо не спрацює, впишіть число. Імена сталі: вставляйте цей шматок один раз на місію.',
  '只有出现 1 秒后仍在出生区域内的单位才算入这一波；单位池要放在该区域之外。从第一波开始，只要没有活着的波次单位，每 30 秒发一次奖励。波次数与变量比较（{value "wave_max$"}）：引擎能读取，但原版没有 cmp_i 这样用；如果无效，就直接写数字。名称是固定的：每个任务只插入一次。');
add('ide.kit.p.' + B + '.n',
  'Goes into {triggers} inside {Helpers}. Elsewhere in Helpers add: {event "wave_on"}, {event "wave_go"}, {event "wave_last"}, {event "wave_over"}; {"wave_n"} and {"wave_max"} in {vars}; circle zones for the base and for the spawn place (around the spawn waypoint); a {waypoints} group with the spawn and base waypoints. Three hidden pools of enemy units with the pool tags (tank crews already inside), your soldiers with the player tag, and the text row wave_timer.',
  'Ставится в {triggers} внутри {Helpers}. В другие места Helpers добавьте: {event "wave_on"}, {event "wave_go"}, {event "wave_last"}, {event "wave_over"}; {"wave_n"} и {"wave_max"} в {vars}; круглые зоны для базы и для места появления (вокруг точки появления); группу {waypoints} с точками появления и базы. Три скрытых запаса вражеских юнитов с тегами запасов (экипажи уже в танках), ваши солдаты с тегом игрока и строка текста wave_timer.',
  'Ставиться в {triggers} усередині {Helpers}. В інші місця Helpers додайте: {event "wave_on"}, {event "wave_go"}, {event "wave_last"}, {event "wave_over"}; {"wave_n"} і {"wave_max"} у {vars}; круглі зони для бази й для місця появи (навколо точки появи); групу {waypoints} з точками появи й бази. Три приховані запаси ворожих юнітів із тегами запасів (екіпажі вже в танках), ваші солдати з тегом гравця й рядок тексту wave_timer.',
  '放在 {Helpers} 里的 {triggers} 中。在 Helpers 的其他位置添加：{event "wave_on"}、{event "wave_go"}、{event "wave_last"}、{event "wave_over"}；在 {vars} 中加 {"wave_n"} 和 {"wave_max"}；基地和出生点（出生路点周围）各一个圆形区域；一个包含出生路点和基地路点的 {waypoints} 组。三个带单位池标签的隐藏敌方单位池（坦克乘员已在车内），带玩家标签的你的士兵，以及文本行 wave_timer。');
field(B, 'waves', ['Number of waves', 'Число волн', 'Кількість хвиль', '波次数']);
field(B, 'warmup', ['Warm-up time', 'Время подготовки', 'Час підготовки', '准备时间'],
  ['Seconds before the first wave.', 'Секунды до первой волны.', 'Секунди до першої хвилі.', '第一波之前的秒数。'], ['warmup_2']);
field(B, 'gap', ['Time between waves', 'Время между волнами', 'Час між хвилями', '波次间隔'],
  ['Seconds from one wave to the next.', 'Секунды от одной волны до следующей.', 'Секунди від однієї хвилі до наступної.', '两波之间的秒数。'], ['gap_2']);
field(B, 'inf_count', ['Infantry per wave', 'Пехоты в волне', 'Піхоти у хвилі', '每波步兵数'],
  ['Copies made in waves 1 and 2.', 'Сколько копий в волнах 1 и 2.', 'Скільки копій у хвилях 1 і 2.', '第 1、2 波复制的数量。']);
field(B, 'pool_inf', ['Infantry pool tag', 'Тег запаса пехоты', 'Тег запасу піхоти', '步兵池标签']);
field(B, 'spawn_wp', ['Spawn waypoint', 'Точка появления', 'Точка появи', '出生路点'],
  ['Waypoint where the wave appears.', 'Точка пути, где появляется волна.', 'Точка шляху, де з’являється хвиля.', '波次出现的路点。'], ['spawn_wp_2', 'spawn_wp_3']);
field(B, 'mg_count', ['Machine guns per wave', 'Пулемётов в волне', 'Кулеметів у хвилі', '每波机枪数'],
  ['Copies made in waves 3 and 4.', 'Сколько копий в волнах 3 и 4.', 'Скільки копій у хвилях 3 і 4.', '第 3、4 波复制的数量。']);
field(B, 'pool_mg', ['Machine gun pool tag', 'Тег запаса пулемётов', 'Тег запасу кулеметів', '机枪池标签']);
field(B, 'tank_count', ['Tanks per wave', 'Танков в волне', 'Танків у хвилі', '每波坦克数'],
  ['Copies made from wave 5 on.', 'Сколько копий с волны 5.', 'Скільки копій з хвилі 5.', '从第 5 波起复制的数量。']);
field(B, 'pool_tank', ['Tank pool tag', 'Тег запаса танков', 'Тег запасу танків', '坦克池标签']);
field(B, 'spawn_zone', ['Spawn zone', 'Зона появления', 'Зона появи', '出生区域'],
  ['Circle zone around the spawn waypoint; units in it are tagged as the wave.', 'Круглая зона вокруг точки появления; юниты в ней получают тег волны.', 'Кругла зона навколо точки появи; юніти в ній отримують тег хвилі.', '出生路点周围的圆形区域；其中的单位被标记为本波。']);
field(B, 'enemy_player', ['Enemy player number', 'Номер игрока-врага', 'Номер гравця-ворога', '敌方玩家编号'],
  ['The {Player} number of the enemy side, as on the placed units.', 'Номер {Player} вражеской стороны, как у расставленных юнитов.', 'Номер {Player} ворожої сторони, як у розставлених юнітів.', '敌方的 {Player} 编号，与已放置单位上的一致。']);
field(B, 'base_wp', ['Base waypoint', 'Точка базы', 'Точка бази', '基地路点'],
  ['Waypoint the wave attacks.', 'Точка пути, которую атакует волна.', 'Точка шляху, яку атакує хвиля.', '波次进攻的路点。'], ['base_wp_2']);
field(B, 'bonus', ['Points per cleared wave', 'Очки за отбитую волну', 'Очки за відбиту хвилю', '每波清除奖励分']);
field(B, 'player', ['Player units tag', 'Тег юнитов игрока', 'Тег юнітів гравця', '玩家单位标签']);
field(B, 'base', ['Base zone', 'Зона базы', 'Зона бази', '基地区域'],
  ['Circle zone you must keep soldiers in.', 'Круглая зона, где должны оставаться ваши солдаты.', 'Кругла зона, де мають лишатися ваші солдати.', '必须留有你士兵的圆形区域。']);

// 638
const C = 'mi.sys.stealth_and_alarm_system';
add('ide.kit.p.' + C, 'Stealth and alarm system', 'Система скрытности и тревоги', 'Система скритності й тривоги', '潜行与警报系统');
add('ide.kit.p.' + C + '.d',
  'Adds the triggers for a sneaking mission: guards hold fire, grow suspicious and search when they see your men close, and raise the alarm on shots or when they keep seeing you. The alarm plays a siren, opens fire, wakes a hidden reserve and sends it searching; after a while with no one seen, the camp calms down. Not tried in game. Not for multiplayer maps.',
  'Добавляет триггеры для миссии со скрытностью: охрана не стреляет, настораживается и обыскивает местность, когда видит ваших бойцов вблизи, и поднимает тревогу при выстрелах или если продолжает вас видеть. Тревога включает сирену, открывает огонь, будит скрытый резерв и отправляет его на поиски; если какое-то время никого не видно, лагерь успокаивается. В игре не проверено. Не для сетевых карт.',
  'Додає тригери для місії зі скритністю: охорона не стріляє, насторожується й обшукує місцевість, коли бачить ваших бійців поруч, і здіймає тривогу при пострілах або якщо далі вас бачить. Тривога вмикає сирену, відкриває вогонь, будить прихований резерв і посилає його на пошуки; якщо якийсь час нікого не видно, табір заспокоюється. У грі не перевірено. Не для мережевих карт.',
  '添加潜行任务的触发器：守卫不开火，近距离看到你的人时会起疑并搜索，听到枪声或一直看到你时拉响警报。警报会播放警笛、开火、唤醒隐藏的预备队并派其搜索；一段时间没看到人后，营地恢复平静。未在游戏中测试。不适用于多人地图。');
add('ide.kit.p.' + C + '.w',
  'Guards killed silently raise nothing: add a dead-guard term to the shots trigger with {type 1} if you want that. A suspicion that turns into an alarm can calm down after the short time, not the alarm time. The names are fixed: add this piece once per mission.',
  'Тихо убитая охрана ничего не поднимает: если нужно, добавьте в триггер выстрелов условие на погибшую охрану с {type 1}. Подозрение, перешедшее в тревогу, может утихнуть через короткое время, а не через время тревоги. Имена постоянные: вставляйте этот кусок один раз на миссию.',
  'Тихо вбита охорона нічого не здіймає: якщо треба, додайте до тригера пострілів умову на загиблу охорону з {type 1}. Підозра, що перейшла в тривогу, може вщухнути через короткий час, а не через час тривоги. Імена сталі: вставляйте цей шматок один раз на місію.',
  '被悄悄干掉的守卫不会触发任何东西：如有需要，可在枪声触发器中加入守卫死亡条件并用 {type 1}。由怀疑转成的警报可能在较短的时间后就平息，而不是警报时间。名称是固定的：每个任务只插入一次。');
add('ide.kit.p.' + C + '.n',
  'Goes into {triggers} inside {Helpers}. Elsewhere in Helpers add: {event "alarm_raised"}, {event "alarm_calm"}, {event "alarm_lock"}; {"alarm_level"} in {vars}; two circle zones, the camp (where shots are heard) and the inner camp. Guards placed with the guards tag, a reserve with the reserve tag and the hidden tag, your soldiers with the player tag, and a siren sound name that exists in the game.',
  'Ставится в {triggers} внутри {Helpers}. В другие места Helpers добавьте: {event "alarm_raised"}, {event "alarm_calm"}, {event "alarm_lock"}; {"alarm_level"} в {vars}; две круглые зоны: лагерь (где слышны выстрелы) и центр лагеря. Охрана с тегом охраны, резерв с тегом резерва и тегом hidden, ваши солдаты с тегом игрока и имя звука сирены, которое есть в игре.',
  'Ставиться в {triggers} усередині {Helpers}. В інші місця Helpers додайте: {event "alarm_raised"}, {event "alarm_calm"}, {event "alarm_lock"}; {"alarm_level"} у {vars}; дві круглі зони: табір (де чути постріли) і центр табору. Охорона з тегом охорони, резерв із тегом резерву й тегом hidden, ваші солдати з тегом гравця та ім’я звуку сирени, що є у грі.',
  '放在 {Helpers} 里的 {triggers} 中。在 Helpers 的其他位置添加：{event "alarm_raised"}、{event "alarm_calm"}、{event "alarm_lock"}；在 {vars} 中加 {"alarm_level"}；两个圆形区域：营地（能听到枪声的范围）和营地内圈。带守卫标签的守卫、带预备队标签和 hidden 标签的预备队、带玩家标签的你的士兵，以及游戏中存在的警笛声音名。');
field(C, 'guards', ['Guards tag', 'Тег охраны', 'Тег охорони', '守卫标签'],
  ['Tag on the camp guards.', 'Тег на охране лагеря.', 'Тег на охороні табору.', '营地守卫身上的标签。'], ['guards_2', 'guards_3', 'guards_4', 'guards_5', 'guards_6', 'guards_7']);
field(C, 'player', ['Player units tag', 'Тег юнитов игрока', 'Тег юнітів гравця', '玩家单位标签'], null, ['player_2', 'player_3']);
field(C, 'sight', ['Suspicion distance', 'Дистанция подозрения', 'Відстань підозри', '起疑距离'],
  ['Metres: guards seeing you closer than this grow suspicious.', 'Метры: если охрана видит вас ближе, она настораживается.', 'Метри: якщо охорона бачить вас ближче, вона насторожується.', '米：守卫在此距离内看到你就会起疑。']);
field(C, 'camp_inner', ['Inner camp zone', 'Зона центра лагеря', 'Зона центру табору', '营地内圈区域'],
  ['Guards in this zone go searching when suspicious.', 'Охрана в этой зоне идёт на поиски при подозрении.', 'Охорона в цій зоні йде на пошуки при підозрі.', '起疑时此区域内的守卫会去搜索。']);
field(C, 'look', ['Second look after', 'Второй взгляд через', 'Другий погляд через', '再次确认时间'],
  ['Seconds until guards check again; still seeing you raises the alarm.', 'Секунды до повторной проверки; если охрана всё ещё видит вас, тревога.', 'Секунди до повторної перевірки; якщо охорона досі бачить вас, тривога.', '守卫再次确认前的秒数；仍看到你就拉响警报。']);
field(C, 'calm_short', ['Suspicion calm time', 'Время спада подозрения', 'Час спаду підозри', '怀疑平息时间'],
  ['Seconds until a suspicion without alarm calms down.', 'Секунды, через которые подозрение без тревоги утихает.', 'Секунди, через які підозра без тривоги вщухає.', '没有警报的怀疑经过多少秒平息。']);
field(C, 'camp', ['Camp zone', 'Зона лагеря', 'Зона табору', '营地区域'],
  ['Shots, hits and blasts in this zone raise the alarm.', 'Выстрелы, попадания и взрывы в этой зоне поднимают тревогу.', 'Постріли, влучання й вибухи в цій зоні здіймають тривогу.', '此区域内的枪声、命中和爆炸会拉响警报。']);
field(C, 'siren', ['Siren sound', 'Звук сирены', 'Звук сирени', '警笛声音']);
field(C, 'reserve', ['Reserve tag', 'Тег резерва', 'Тег резерву', '预备队标签'],
  ['Tag on the hidden reserve woken by the alarm.', 'Тег на скрытом резерве, который будит тревога.', 'Тег на прихованому резерві, який будить тривога.', '被警报唤醒的隐藏预备队身上的标签。'], ['reserve_2']);
field(C, 'calm', ['Alarm calm time', 'Время спада тревоги', 'Час спаду тривоги', '警报平息时间'],
  ['Seconds after the alarm until the camp tries to calm down.', 'Секунды после тревоги, через которые лагерь пытается успокоиться.', 'Секунди після тривоги, через які табір намагається заспокоїтися.', '警报后营地尝试恢复平静的秒数。']);

// 639
const D = 'mi.sys.reinforcement_manager_income_three_c';
add('ide.kit.p.' + D, 'Reinforcement manager (income, three cards, cooldown, placed bonus)',
  'Менеджер подкреплений (доход, три карточки, перезарядка, бонус с выбором места)',
  'Менеджер підкріплень (дохід, три картки, перезарядка, бонус з вибором місця)',
  '增援管理器（收入、三张卡片、冷却、指定位置奖励）');
add('ide.kit.p.' + D + '.d',
  'Adds the triggers for the reinforcement panel: start points, more points every while you hold a flag, an infantry card and a tank card that bring copies of hidden pool units, and a bonus card that spawns an object where the player places it. Not tried in game. Not for multiplayer maps.',
  'Добавляет триггеры для панели подкреплений: стартовые очки, новые очки через равные промежутки, пока вы держите флаг, карточки пехоты и танка, которые приводят копии юнитов из скрытого запаса, и бонусная карточка, создающая объект там, где игрок её поставил. В игре не проверено. Не для сетевых карт.',
  'Додає тригери для панелі підкріплень: стартові очки, нові очки через рівні проміжки, поки ви тримаєте прапор, картки піхоти й танка, що приводять копії юнітів із прихованого запасу, і бонусна картка, яка створює об’єкт там, де гравець її поставив. У грі не перевірено. Не для мережевих карт.',
  '添加增援面板的触发器：初始分数，占领旗帜期间每隔一段时间加分，步兵卡和坦克卡会带来隐藏单位池的复制单位，奖励卡会在玩家指定的位置生成一个物体。未在游戏中测试。不适用于多人地图。');
add('ide.kit.p.' + D + '.w',
  'A cloned pool unit keeps the side of the pool: place the pools on the player side. Single-player skirmish panel only. The bonus card comes back on its own after the card delay; a card with a count above 0 is used up when the count runs out. The names are fixed: add this piece once per mission.',
  'Клон юнита из запаса остаётся на стороне запаса: ставьте запасы на сторону игрока. Только панель одиночной схватки. Бонусная карточка возвращается сама после задержки карточки; карточка со счётчиком больше 0 кончается, когда счётчик дойдёт до нуля. Имена постоянные: вставляйте этот кусок один раз на миссию.',
  'Клон юніта із запасу лишається на боці запасу: ставте запаси на бік гравця. Лише панель одиночної сутички. Бонусна картка повертається сама після затримки картки; картка з лічильником понад 0 закінчується, коли лічильник дійде до нуля. Імена сталі: вставляйте цей шматок один раз на місію.',
  '从单位池复制出的单位保留单位池的阵营：要把单位池放在玩家一方。仅限单人遭遇战面板。奖励卡会在卡片延迟后自动恢复；计数大于 0 的卡片在计数用完后就不能再用。名称是固定的：每个任务只插入一次。');
add('ide.kit.p.' + D + '.n',
  'Goes into {triggers} inside {Helpers}. Elsewhere in Helpers add: {event "reinf_buy_inf"}, {event "reinf_buy_tank"}, {event "reinf_buy_bonus"}; a circle zone for the flag; a {waypoints} group with the entry and bonus waypoints; and {reinforcements {scoreTotal 2000} {scoreCurrent 0} ...} with three cards, each {state hidden}, {text "$/..."}, {hint "$/..."} and a game {image} (vanilla: usa_skirmish, usa_bonus1, usa_bonus2): "reinf_card_inf" {count -1} {score 200} {delay 0} {eventStart "reinf_buy_inf"}; "reinf_card_tank" {count 3} {score 600} {delay 0} {eventStart "reinf_buy_tank"}; "reinf_card_bonus" {count -1} {score 0} {delay 240} {eventStart "reinf_buy_bonus"} {waypoint "my_bonus_wp"} (the delay is the cooldown). Hidden pools on the player side, a flag object in the zone tagged captured while the player holds it, the bonus entity, and text rows reinf_card_inf, reinf_card_tank, reinf_card_bonus.',
  'Ставится в {triggers} внутри {Helpers}. В другие места Helpers добавьте: {event "reinf_buy_inf"}, {event "reinf_buy_tank"}, {event "reinf_buy_bonus"}; круглую зону для флага; группу {waypoints} с точками входа и бонуса; и {reinforcements {scoreTotal 2000} {scoreCurrent 0} ...} с тремя карточками, у каждой {state hidden}, {text "$/..."}, {hint "$/..."} и {image} из игры (в ванили: usa_skirmish, usa_bonus1, usa_bonus2): "reinf_card_inf" {count -1} {score 200} {delay 0} {eventStart "reinf_buy_inf"}; "reinf_card_tank" {count 3} {score 600} {delay 0} {eventStart "reinf_buy_tank"}; "reinf_card_bonus" {count -1} {score 0} {delay 240} {eventStart "reinf_buy_bonus"} {waypoint "my_bonus_wp"} (задержка = перезарядка). Скрытые запасы на стороне игрока, объект флага в зоне с тегом captured, пока флаг у игрока, бонусный объект и строки текста reinf_card_inf, reinf_card_tank, reinf_card_bonus.',
  'Ставиться в {triggers} усередині {Helpers}. В інші місця Helpers додайте: {event "reinf_buy_inf"}, {event "reinf_buy_tank"}, {event "reinf_buy_bonus"}; круглу зону для прапора; групу {waypoints} з точками входу й бонусу; і {reinforcements {scoreTotal 2000} {scoreCurrent 0} ...} з трьома картками, у кожної {state hidden}, {text "$/..."}, {hint "$/..."} і {image} з гри (у ванілі: usa_skirmish, usa_bonus1, usa_bonus2): "reinf_card_inf" {count -1} {score 200} {delay 0} {eventStart "reinf_buy_inf"}; "reinf_card_tank" {count 3} {score 600} {delay 0} {eventStart "reinf_buy_tank"}; "reinf_card_bonus" {count -1} {score 0} {delay 240} {eventStart "reinf_buy_bonus"} {waypoint "my_bonus_wp"} (затримка = перезарядка). Приховані запаси на боці гравця, об’єкт прапора в зоні з тегом captured, поки прапор у гравця, бонусний об’єкт і рядки тексту reinf_card_inf, reinf_card_tank, reinf_card_bonus.',
  '放在 {Helpers} 里的 {triggers} 中。在 Helpers 的其他位置添加：{event "reinf_buy_inf"}、{event "reinf_buy_tank"}、{event "reinf_buy_bonus"}；旗帜的圆形区域；包含入口路点和奖励路点的 {waypoints} 组；以及 {reinforcements {scoreTotal 2000} {scoreCurrent 0} ...}，内含三张卡片，每张都有 {state hidden}、{text "$/..."}、{hint "$/..."} 和游戏中的 {image}（原版：usa_skirmish、usa_bonus1、usa_bonus2）："reinf_card_inf" {count -1} {score 200} {delay 0} {eventStart "reinf_buy_inf"}；"reinf_card_tank" {count 3} {score 600} {delay 0} {eventStart "reinf_buy_tank"}；"reinf_card_bonus" {count -1} {score 0} {delay 240} {eventStart "reinf_buy_bonus"} {waypoint "my_bonus_wp"}（延迟即冷却）。玩家一方的隐藏单位池、区域内玩家占领时带 captured 标签的旗帜物体、奖励物体，以及文本行 reinf_card_inf、reinf_card_tank、reinf_card_bonus。');
field(D, 'start_score', ['Start points', 'Стартовые очки', 'Стартові очки', '初始分数']);
field(D, 'flag', ['Flag zone', 'Зона флага', 'Зона прапора', '旗帜区域'],
  ['Circle zone with the flag that pays income.', 'Круглая зона с флагом, который приносит доход.', 'Кругла зона з прапором, що дає дохід.', '带有提供收入的旗帜的圆形区域。']);
field(D, 'income', ['Income points', 'Очки дохода', 'Очки доходу', '收入分数'],
  ['Points added each time while the flag is held.', 'Очки, добавляемые каждый раз, пока флаг удерживается.', 'Очки, що додаються щоразу, поки прапор утримується.', '占领旗帜期间每次增加的分数。']);
field(D, 'every', ['Income every', 'Доход каждые', 'Дохід кожні', '收入间隔']);
field(D, 'inf_count', ['Infantry per card', 'Пехоты за карточку', 'Піхоти за картку', '每张卡步兵数']);
field(D, 'pool_inf', ['Infantry pool tag', 'Тег запаса пехоты', 'Тег запасу піхоти', '步兵池标签']);
field(D, 'entry_wp', ['Entry waypoint', 'Точка входа', 'Точка входу', '入口路点'],
  ['Waypoint where bought units appear.', 'Точка пути, где появляются купленные юниты.', 'Точка шляху, де з’являються куплені юніти.', '购买的单位出现的路点。'], ['entry_wp_2']);
field(D, 'pool_tank', ['Tank pool tag', 'Тег запаса танков', 'Тег запасу танків', '坦克池标签']);
field(D, 'bonus_entity', ['Bonus object', 'Бонусный объект', 'Бонусний об’єкт', '奖励物体'],
  ['Object spawned where the player places the bonus card.', 'Объект, создаваемый там, где игрок ставит бонусную карточку.', 'Об’єкт, що створюється там, де гравець ставить бонусну картку.', '在玩家放置奖励卡的位置生成的物体。']);
field(D, 'bonus_wp', ['Bonus waypoint', 'Точка бонуса', 'Точка бонусу', '奖励路点'],
  ['The card moves this waypoint to the placed spot; use the card\'s {waypoint} name.', 'Карточка переносит эту точку туда, где её поставили; имя как в {waypoint} карточки.', 'Картка переносить цю точку туди, де її поставили; ім’я як у {waypoint} картки.', '卡片会把此路点移到放置的位置；使用卡片 {waypoint} 中的名称。']);

module.exports = rows;

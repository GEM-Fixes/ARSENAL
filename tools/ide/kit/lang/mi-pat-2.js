// Code Pieces, group mi-pat-2: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-pat-2.js
// (common patterns for mission files: unit checks, orders, spawning, reinforcements, objectives, win and lose,
// countdown, dialogue, cutscene).
// Author: Imperator_Aug (ARSENAL, ia-70fd5f5b)
'use strict';

const rows = [];
// piece rows: k = suffix ('' title, '.d', '.w', '.n', '.f.<name>', '.f.<name>.h')
const R = (id, k, en, ru, uk, zh) => rows.push(['ide.kit.p.' + id + k, en, ru, uk, zh]);

// shared field texts
const TERMNO = ['Term number', 'Номер условия', 'Номер умови', '条件编号'];
const TERMNO_H = ['The number before the dot. Every term of one condition needs its own number.',
  'Число перед точкой. У каждого условия в одном condition свой номер.',
  'Число перед крапкою. Кожна умова в одному condition має свій номер.',
  '点号前的数字。同一个 condition 里的每个条件都要有自己的编号。'];
const TRIG = ['Trigger name', 'Имя триггера', 'Ім\'я тригера', '触发器名'];
const TRIG_H = ['Any name not used by another trigger in this file.',
  'Любое имя, которого нет у другого триггера в этом файле.',
  'Будь-яке ім\'я, якого немає в іншого тригера в цьому файлі.',
  '本文件中其他触发器没有用过的任意名字。'];
const WP = ['Waypoint name', 'Имя точки пути', 'Ім\'я точки шляху', '路点名'];
const WP_H = ['A waypoint declared in the waypoints part of this file.',
  'Точка пути, объявленная в разделе waypoints этого файла.',
  'Точка шляху, оголошена в розділі waypoints цього файлу.',
  '在本文件 waypoints 部分声明的路点。'];
const ZONE = ['Zone name', 'Имя зоны', 'Ім\'я зони', '区域名'];
const ZONE_H = ['A zone declared in the zones part of this file.',
  'Зона, объявленная в разделе zones этого файла.',
  'Зона, оголошена в розділі zones цього файлу.',
  '在本文件 zones 部分声明的区域。'];
const SAME = (what) => ['Must be the same as ' + what + '.', 'Должно совпадать с ' + what + '.', 'Має збігатися з ' + what + '.', '必须与 ' + what + ' 相同。'];
const TEXTKEY_H = ['The key of a row in the mission text file, without "$/".',
  'Ключ строки в файле текстов миссии, без "$/".',
  'Ключ рядка у файлі текстів місії, без "$/".',
  '任务文本文件中一行的键名，不带 "$/"。'];
const TASK = ['Objective name', 'Имя задачи', 'Ім\'я завдання', '目标名'];
const TASK_H = ['A task declared in the tasks part of this file.',
  'Задача, объявленная в разделе tasks этого файла.',
  'Завдання, оголошене в розділі tasks цього файлу.',
  '在本文件 tasks 部分声明的任务。'];
const NIG = ['Not tried in game.', 'В игре не проверено.', 'У грі не перевірено.', '未在游戏中试过。'];
const NMP = ['Not for multiplayer maps.', 'Не для сетевых карт.', 'Не для мережевих мап.', '不适用于多人地图。'];
const F = (id, name, t, h) => { R(id, '.f.' + name, ...t); if (h) R(id, '.f.' + name + '.h', ...h); };
const cat = (a, b) => a.map((s, i) => s + ' ' + b[i]);

// 536
let id = 'mi.pat.group_is_dead';
R(id, '', 'Group is dead', 'Группа погибла', 'Група загинула', '小组全部阵亡');
R(id, '.d', 'A condition term that is true when no living soldier with this tag is left.',
  'Условие, которое истинно, когда не осталось ни одного живого солдата с этим тегом.',
  'Умова, що істинна, коли не лишилося жодного живого солдата з цим тегом.',
  '一个条件：带这个标签的士兵一个活的都不剩时为真。');
R(id, '.w', 'It counts men only: a destroyed tank is never "dead". Knocked-out soldiers count as dead.',
  'Считаются только люди: уничтоженный танк никогда не бывает "dead". Солдаты без сознания считаются погибшими.',
  'Рахуються лише люди: знищений танк ніколи не буває "dead". Непритомні солдати вважаються загиблими.',
  '只计算人员：被摧毁的坦克永远不算 "dead"。昏倒的士兵算作阵亡。');
F(id, 'no', TERMNO, TERMNO_H);
F(id, 'group', ['Group tag', 'Тег группы', 'Тег групи', '小组标签']);

// 537
id = 'mi.pat.group_below_n_men';
R(id, '', 'Group below N men', 'В группе меньше N человек', 'У групі менше N людей', '小组少于 N 人');
R(id, '.d', 'A condition term that is true when fewer living soldiers with this tag are left than the number you give.',
  'Условие, которое истинно, когда живых солдат с этим тегом осталось меньше заданного числа.',
  'Умова, що істинна, коли живих солдатів з цим тегом лишилося менше за задане число.',
  '一个条件：带这个标签的活着的士兵少于你给的数字时为真。');
F(id, 'no', TERMNO, TERMNO_H);
F(id, 'group', ['Group tag', 'Тег группы', 'Тег групи', '小组标签']);
F(id, 'men', ['Fewer than', 'Меньше чем', 'Менше ніж', '少于'],
  ['True when the living count is below this number.', 'Истинно, когда живых меньше этого числа.', 'Істинно, коли живих менше за це число.', '活着的人数低于这个数字时为真。']);

// 538
id = 'mi.pat.vehicle_out_of_action';
R(id, '', 'Vehicle out of action', 'Техника выведена из строя', 'Техніку виведено з ладу', '载具失去行动能力');
R(id, '.d', 'A condition term that is true when the tagged vehicle can no longer move.',
  'Условие, которое истинно, когда техника с этим тегом больше не может ехать.',
  'Умова, що істинна, коли техніка з цим тегом більше не може їхати.',
  '一个条件：带这个标签的载具再也不能移动时为真。');
R(id, '.w', 'It is also true after a track hit that does not destroy the vehicle. A destroyed vehicle drops out of every selector, so the term only works while the wreck still counts.',
  'Оно истинно и после попадания в гусеницу, которое не уничтожило технику. Уничтоженная техника выпадает из всех селекторов, так что условие работает, пока машина ещё учитывается.',
  'Вона істинна й після влучання в гусеницю, яке не знищило техніку. Знищена техніка випадає з усіх селекторів, тож умова працює, доки машина ще враховується.',
  '履带被击中但载具没被摧毁时也为真。被摧毁的载具会从所有选择器中消失，所以这个条件只在载具还被计入时有效。');
F(id, 'no', TERMNO, TERMNO_H);
F(id, 'tank', ['Vehicle tag', 'Тег техники', 'Тег техніки', '载具标签']);

// 539
id = 'mi.pat.tag_a_group_then_order_it';
R(id, '', 'Tag a group, then order it', 'Пометить группу тегом и дать ей приказ', 'Позначити групу тегом і дати їй наказ', '给小组加标签，然后下令');
R(id, '.d', 'Gives the living soldiers of a pool who stand in a zone a new tag, then sends everyone with that tag to a waypoint.',
  'Даёт живым солдатам из запаса, стоящим в зоне, новый тег, затем отправляет всех с этим тегом к точке пути.',
  'Дає живим солдатам із запасу, що стоять у зоні, новий тег, потім відправляє всіх із цим тегом до точки шляху.',
  '给站在某区域内的预备队活着的士兵加一个新标签，然后让所有带这个标签的人前往一个路点。');
R(id, '.w', 'Crew sitting in a gun refuse the order.', 'Расчёт, сидящий в орудии, не выполняет приказ.', 'Обслуга, що сидить у гарматі, не виконує наказ.', '坐在火炮里的炮组不会执行这个命令。');
R(id, '.n', 'A waypoint in the waypoints part and a zone in the zones part of this file; the pool units placed with their tag.',
  'Точка пути в разделе waypoints и зона в разделе zones этого файла; юниты запаса расставлены со своим тегом.',
  'Точка шляху в розділі waypoints і зона в розділі zones цього файлу; юніти запасу розставлені зі своїм тегом.',
  '本文件 waypoints 部分里的路点和 zones 部分里的区域；预备队单位已带着各自的标签放好。');
F(id, 'pool', ['Pool tag', 'Тег запаса', 'Тег запасу', '预备队标签']);
F(id, 'zone', ZONE, ZONE_H);
F(id, 'wave', ['New tag', 'Новый тег', 'Новий тег', '新标签']);
F(id, 'wave_2', ['New tag again', 'Новый тег ещё раз', 'Новий тег ще раз', '再次填新标签'], SAME('the new tag'));
F(id, 'wp', WP, WP_H);

// 540
id = 'mi.pat.make_a_squad_and_send_it';
R(id, '', 'Make a squad and send it', 'Создать отряд и отправить его', 'Створити загін і відправити його', '组建小队并派出');
R(id, '.d', 'Joins the tagged units of one player into a named squad, then sends the squad to a waypoint. A squad moves together.',
  'Объединяет юниты одного игрока с этим тегом в именованный отряд, затем отправляет отряд к точке пути. Отряд движется вместе.',
  'Об\'єднує юніти одного гравця з цим тегом в іменований загін, потім відправляє загін до точки шляху. Загін рухається разом.',
  '把某个玩家带这个标签的单位编成一个有名字的小队，然后派小队去一个路点。小队会一起移动。');
R(id, '.n', 'A waypoint in the waypoints part of this file.', 'Точка пути в разделе waypoints этого файла.', 'Точка шляху в розділі waypoints цього файлу.', '本文件 waypoints 部分里的路点。');
F(id, 'units', ['Unit tag', 'Тег юнитов', 'Тег юнітів', '单位标签']);
F(id, 'player', ['Player number', 'Номер игрока', 'Номер гравця', '玩家编号']);
F(id, 'squad', ['Squad name', 'Имя отряда', 'Ім\'я загону', '小队名']);
F(id, 'squad_2', ['Squad name again', 'Имя отряда ещё раз', 'Ім\'я загону ще раз', '再次填小队名'], SAME('the squad name'));
F(id, 'wp', WP, WP_H);

// 541
id = 'mi.pat.reveal_a_hidden_reserve';
R(id, '', 'Reveal a hidden reserve', 'Ввести скрытый резерв', 'Ввести прихований резерв', '启用隐藏的预备队');
R(id, '.d', 'Units placed with the tag hidden sleep from the start of the mission. This wakes the tagged ones: they appear and act.',
  'Юниты с тегом hidden спят с начала миссии. Это будит юниты с заданным тегом: они появляются и действуют.',
  'Юніти з тегом hidden сплять від початку місії. Це будить юніти з заданим тегом: вони з\'являються й діють.',
  '带 hidden 标签的单位从任务开始就处于休眠。这会唤醒带指定标签的单位：它们出现并开始行动。');
R(id, '.n', 'The reserve placed on the map with two tags: hidden and your reserve tag.',
  'Резерв расставлен на карте с двумя тегами: hidden и вашим тегом резерва.',
  'Резерв розставлено на мапі з двома тегами: hidden і вашим тегом резерву.',
  '预备队在地图上放好，并带两个标签：hidden 和你的预备队标签。');
F(id, 'reserve', ['Reserve tag', 'Тег резерва', 'Тег резерву', '预备队标签']);

// 542
id = 'mi.pat.hide_units_again_park_them';
R(id, '', 'Hide units again (park them)', 'Снова спрятать юниты (убрать в запас)', 'Знову сховати юніти (прибрати в запас)', '再次隐藏单位（停放）');
R(id, '.d', 'Puts the tagged units to sleep and gives them the tag hidden, so they stop acting until you wake them again.',
  'Усыпляет юниты с этим тегом и даёт им тег hidden: они перестают действовать, пока вы их снова не разбудите.',
  'Присипляє юніти з цим тегом і дає їм тег hidden: вони перестають діяти, доки ви їх знову не розбудите.',
  '让带这个标签的单位休眠并加上 hidden 标签，在你再次唤醒前它们不会行动。');
F(id, 'group', ['Group tag', 'Тег группы', 'Тег групи', '小组标签']);

// 543
id = 'mi.pat.copy_units_from_a_pool_to_a_waypoint';
R(id, '', 'Copy units from a pool to a waypoint', 'Скопировать юниты из запаса на точку пути', 'Скопіювати юніти із запасу на точку шляху', '把预备队单位复制到路点');
R(id, '.d', 'Makes a copy of units from a tagged pool and puts the copy at a waypoint. The pool itself stays, so it can be copied again.',
  'Создаёт копию юнитов из запаса с этим тегом и ставит её на точку пути. Сам запас остаётся, его можно копировать снова.',
  'Створює копію юнітів із запасу з цим тегом і ставить її на точку шляху. Сам запас лишається, його можна копіювати знову.',
  '从带标签的预备队复制单位，并把复制品放到路点上。预备队本身保留，可以再次复制。');
R(id, '.w', 'How the copy arrives: "safe teleport & rotate", "teleport & rotate", "safe teleport", teleport or force.',
  'Как появляется копия: "safe teleport & rotate", "teleport & rotate", "safe teleport", teleport или force.',
  'Як з\'являється копія: "safe teleport & rotate", "teleport & rotate", "safe teleport", teleport або force.',
  '复制品到达的方式："safe teleport & rotate"、"teleport & rotate"、"safe teleport"、teleport 或 force。');
R(id, '.n', 'A pool of placed units with the pool tag (usually also hidden) and a waypoint in the waypoints part of this file.',
  'Запас расставленных юнитов с тегом запаса (обычно ещё и hidden) и точка пути в разделе waypoints этого файла.',
  'Запас розставлених юнітів із тегом запасу (зазвичай ще й hidden) і точка шляху в розділі waypoints цього файлу.',
  '一批放好的、带预备队标签的单位（通常也带 hidden），以及本文件 waypoints 部分里的路点。');
F(id, 'amount', ['How many', 'Сколько', 'Скільки', '数量'],
  ['How many units of the pool are copied.', 'Сколько юнитов запаса копируется.', 'Скільки юнітів запасу копіюється.', '复制预备队中的多少个单位。']);
F(id, 'pool', ['Pool tag', 'Тег запаса', 'Тег запасу', '预备队标签']);
F(id, 'wp', WP, WP_H);
F(id, 'approach', ['How it arrives', 'Как появляется', 'Як з\'являється', '到达方式'],
  ['"safe" looks for a free spot; "rotate" turns the copy the way the waypoint faces.',
    '"safe" ищет свободное место; "rotate" поворачивает копию по направлению точки.',
    '"safe" шукає вільне місце; "rotate" повертає копію за напрямком точки.',
    '"safe" 会找空位；"rotate" 让复制品朝向路点的方向。']);

// 544
id = 'mi.pat.spawn_one_entity_at_a_waypoint';
R(id, '', 'Spawn one entity at a waypoint', 'Создать один объект на точке пути', 'Створити один об\'єкт на точці шляху', '在路点生成一个物体');
R(id, '.d', 'Creates one object of the given name at a waypoint: a pointer, an effect, a crate and so on.',
  'Создаёт один объект с заданным именем на точке пути: указатель, эффект, ящик и т. п.',
  'Створює один об\'єкт із заданим ім\'ям на точці шляху: покажчик, ефект, ящик тощо.',
  '在路点生成一个指定名字的物体：指示标、特效、箱子等。');
R(id, '.w', 'There is no owner field. An empty object name may crash the game; an unknown waypoint is skipped with no message.',
  'Поля владельца нет. Пустое имя объекта может уронить игру; неизвестная точка пути пропускается без сообщения.',
  'Поля власника немає. Порожнє ім\'я об\'єкта може обвалити гру; невідома точка шляху пропускається без повідомлення.',
  '没有归属方字段。物体名为空可能导致游戏崩溃；未知的路点会被静默跳过。');
R(id, '.n', 'A waypoint in the waypoints part of this file.', 'Точка пути в разделе waypoints этого файла.', 'Точка шляху в розділі waypoints цього файлу.', '本文件 waypoints 部分里的路点。');
F(id, 'entity', ['Object name', 'Имя объекта', 'Ім\'я об\'єкта', '物体名']);
F(id, 'wp', WP, WP_H);

// 545
id = 'mi.pat.crew_an_empty_placed_vehicle';
R(id, '', 'Crew an empty placed vehicle', 'Посадить экипаж в пустую технику', 'Посадити екіпаж у порожню техніку', '让人员登上空载具');
R(id, '.d', 'Vehicles placed in a mission start empty. This sends one living soldier with the crew tag into the tagged vehicle that has no one inside.',
  'Техника, поставленная в миссии, стоит пустой. Это сажает одного живого солдата с тегом экипажа в технику с заданным тегом, в которой никого нет.',
  'Техніка, поставлена в місії, стоїть порожня. Це садить одного живого солдата з тегом екіпажу в техніку із заданим тегом, у якій нікого немає.',
  '任务里放置的载具开始时是空的。这会让一名带乘员标签的活着的士兵登上带指定标签、里面没人的载具。');
F(id, 'crew', ['Crew tag', 'Тег экипажа', 'Тег екіпажу', '乘员标签']);
F(id, 'vehicle', ['Vehicle tag', 'Тег техники', 'Тег техніки', '载具标签']);

// 546
id = 'mi.pat.hand_units_to_the_player';
R(id, '', 'Hand units to the player', 'Передать юниты игроку', 'Передати юніти гравцеві', '把单位交给玩家');
R(id, '.d', 'Gives the tagged units in a zone to the human player and lets the player control them, holding position with weapons ready.',
  'Отдаёт юниты с этим тегом в зоне игроку-человеку и даёт ему управление; они держат позицию с оружием наготове.',
  'Віддає юніти з цим тегом у зоні гравцеві-людині й дає йому керування; вони тримають позицію зі зброєю напоготові.',
  '把区域内带这个标签的单位交给真人玩家控制，它们会原地坚守、武器就绪。');
R(id, '.w', 'In a network game autoassign also raises an autoassign event. Keep {type human} in the second selector, or the command can hit objects without a brain.',
  'В сетевой игре autoassign ещё и вызывает событие autoassign. Оставьте {type human} во втором селекторе, иначе команда может попасть в объекты без мозга.',
  'У мережевій грі autoassign ще й викликає подію autoassign. Залиште {type human} у другому селекторі, інакше команда може влучити в об\'єкти без мозку.',
  '在联网游戏中 autoassign 还会触发 autoassign 事件。第二个选择器里要保留 {type human}，否则命令可能作用到没有大脑的物体上。');
R(id, '.n', 'A zone in the zones part of this file.', 'Зона в разделе zones этого файла.', 'Зона в розділі zones цього файлу.', '本文件 zones 部分里的区域。');
F(id, 'units', ['Unit tag', 'Тег юнитов', 'Тег юнітів', '单位标签']);
F(id, 'zone', ZONE, ZONE_H);
F(id, 'units_2', ['Unit tag again', 'Тег юнитов ещё раз', 'Тег юнітів ще раз', '再次填单位标签'], SAME('the unit tag'));

// 547
id = 'mi.pat.change_who_owns_units';
R(id, '', 'Change who owns units', 'Сменить владельца юнитов', 'Змінити власника юнітів', '更换单位的归属');
R(id, '.d', 'Moves the tagged soldiers to another player number, for example to make them a separate side.',
  'Переводит солдат с этим тегом к другому номеру игрока, например чтобы сделать их отдельной стороной.',
  'Переводить солдатів із цим тегом до іншого номера гравця, наприклад щоб зробити їх окремою стороною.',
  '把带这个标签的士兵转给另一个玩家编号，例如让他们成为单独的一方。');
R(id, '.w', 'In network games the player numbers of bots are not fixed.', 'В сетевых играх номера игроков у ботов не постоянны.', 'У мережевих іграх номери гравців у ботів не сталі.', '联网游戏里机器人的玩家编号不固定。');
F(id, 'group', ['Group tag', 'Тег группы', 'Тег групи', '小组标签']);
F(id, 'player', ['New player number', 'Новый номер игрока', 'Новий номер гравця', '新玩家编号']);

// 548
id = 'mi.pat.reinforcement_wave_by_timer';
R(id, '', 'Reinforcement wave by timer', 'Волна подкреплений по таймеру', 'Хвиля підкріплень за таймером', '定时增援波次');
R(id, '.d', ...cat(['A trigger that, once an event is set, waits, copies units from a pool to a waypoint, then switches itself off so it runs again: a new wave every so many seconds.',
  'Триггер, который после установки события ждёт, копирует юниты из запаса на точку пути и выключает себя, чтобы сработать снова: новая волна каждые N секунд.',
  'Тригер, який після встановлення події чекає, копіює юніти із запасу на точку шляху й вимикає себе, щоб спрацювати знову: нова хвиля кожні N секунд.',
  '一个触发器：事件被设置后，它等待，把预备队单位复制到路点，然后把自己关掉以便再次运行：每隔若干秒来一波。'], NIG));
R(id, '.w', 'Waves keep coming while the event stays set. Reset the event to stop them.',
  'Волны идут, пока событие установлено. Сбросьте событие, чтобы их остановить.',
  'Хвилі йдуть, доки подію встановлено. Скиньте подію, щоб їх зупинити.',
  '只要事件保持设置，波次就会一直来。重置该事件即可停止。');
R(id, '.n', 'The event and the waypoint declared in this file; a pool of placed units with the pool tag (usually also hidden).',
  'Событие и точка пути объявлены в этом файле; запас расставленных юнитов с тегом запаса (обычно ещё и hidden).',
  'Подію й точку шляху оголошено в цьому файлі; запас розставлених юнітів із тегом запасу (зазвичай ще й hidden).',
  '事件和路点已在本文件中声明；一批放好的、带预备队标签的单位（通常也带 hidden）。');
F(id, 'trigger', TRIG, TRIG_H);
F(id, 'event', ['Start event', 'Событие запуска', 'Подія запуску', '启动事件'],
  ['Waves start once this event is set.', 'Волны начинаются, когда это событие установлено.', 'Хвилі починаються, коли цю подію встановлено.', '这个事件被设置后波次开始。']);
F(id, 'every', ['Seconds between waves', 'Секунд между волнами', 'Секунд між хвилями', '波次间隔秒数']);
F(id, 'count', ['Units per wave', 'Юнитов в волне', 'Юнітів у хвилі', '每波单位数']);
F(id, 'pool', ['Pool tag', 'Тег запаса', 'Тег запасу', '预备队标签']);
F(id, 'wp', WP, WP_H);
F(id, 'trigger_2', ['Trigger name again', 'Имя триггера ещё раз', 'Ім\'я тригера ще раз', '再次填触发器名'], SAME('the trigger name'));

// 549
id = 'mi.pat.reinforcement_wave_when_the_player_e';
R(id, '', 'Reinforcement wave when the player enters a zone', 'Волна подкреплений, когда игрок входит в зону', 'Хвиля підкріплень, коли гравець заходить у зону', '玩家进入区域时的增援波次');
R(id, '.d', ...cat(['A trigger that fires once when a living player soldier enters a zone: it wakes a hidden reserve and sends it to a waypoint.',
  'Триггер срабатывает один раз, когда живой солдат игрока входит в зону: он будит скрытый резерв и отправляет его к точке пути.',
  'Тригер спрацьовує один раз, коли живий солдат гравця заходить у зону: він будить прихований резерв і відправляє його до точки шляху.',
  '一个触发器：玩家的活着的士兵进入区域时触发一次，唤醒隐藏的预备队并派它前往一个路点。'], NIG));
R(id, '.n', 'The zone and the waypoint declared in this file; player units carry the player tag; the reserve placed with the tags hidden and the reserve tag.',
  'Зона и точка пути объявлены в этом файле; юниты игрока несут тег игрока; резерв расставлен с тегами hidden и тегом резерва.',
  'Зону й точку шляху оголошено в цьому файлі; юніти гравця мають тег гравця; резерв розставлено з тегами hidden і тегом резерву.',
  '区域和路点已在本文件中声明；玩家单位带玩家标签；预备队带 hidden 和预备队标签放好。');
F(id, 'trigger', TRIG, TRIG_H);
F(id, 'zone', ZONE, ZONE_H);
F(id, 'player_units', ['Player unit tag', 'Тег юнитов игрока', 'Тег юнітів гравця', '玩家单位标签'],
  ['A tag every player unit carries (vanilla uses player).', 'Тег, который есть у каждого юнита игрока (в игре это player).', 'Тег, який має кожен юніт гравця (у грі це player).', '每个玩家单位都带的标签（原版用 player）。']);
F(id, 'reserve', ['Reserve tag', 'Тег резерва', 'Тег резерву', '预备队标签']);
F(id, 'reserve_2', ['Reserve tag again', 'Тег резерва ещё раз', 'Тег резерву ще раз', '再次填预备队标签'], SAME('the reserve tag'));
F(id, 'wp', WP, WP_H);

// 550
id = 'mi.pat.reinforcement_wave_on_losses';
R(id, '', 'Reinforcement wave on losses', 'Волна подкреплений при потерях', 'Хвиля підкріплень при втратах', '损失过大时的增援波次');
R(id, '.d', ...cat(['A trigger that fires once when fewer defenders are alive than the number you give, and wakes a hidden reserve.',
  'Триггер срабатывает один раз, когда живых защитников меньше заданного числа, и будит скрытый резерв.',
  'Тригер спрацьовує один раз, коли живих захисників менше за задане число, і будить прихований резерв.',
  '一个触发器：活着的守军少于你给的数字时触发一次，并唤醒隐藏的预备队。'], NIG));
R(id, '.n', 'Defenders placed with their tag; the reserve placed with the tags hidden and the reserve tag.',
  'Защитники расставлены со своим тегом; резерв расставлен с тегами hidden и тегом резерва.',
  'Захисників розставлено з їхнім тегом; резерв розставлено з тегами hidden і тегом резерву.',
  '守军带各自的标签放好；预备队带 hidden 和预备队标签放好。');
F(id, 'trigger', TRIG, TRIG_H);
F(id, 'defenders', ['Defender tag', 'Тег защитников', 'Тег захисників', '守军标签']);
F(id, 'men', ['Fewer than', 'Меньше чем', 'Менше ніж', '少于'],
  ['The wave comes when the living defenders drop below this number.', 'Волна приходит, когда живых защитников становится меньше этого числа.', 'Хвиля приходить, коли живих захисників стає менше за це число.', '活着的守军低于这个数字时增援到来。']);
F(id, 'reserve', ['Reserve tag', 'Тег резерва', 'Тег резерву', '预备队标签']);

// 551
id = 'mi.pat.show_a_reinforcement_card_add_points';
R(id, '', 'Show a reinforcement card, add points', 'Показать карточку подкреплений, добавить очки', 'Показати картку підкріплень, додати очки', '显示增援卡片并加分');
R(id, '.d', ...cat(['Shows one card of the reinforcement panel and gives the player more points to buy reinforcements with.',
  'Показывает одну карточку панели подкреплений и даёт игроку очки на покупку подкреплений.',
  'Показує одну картку панелі підкріплень і дає гравцеві очки на купівлю підкріплень.',
  '显示增援面板中的一张卡片，并给玩家更多用于购买增援的点数。'], NMP));
R(id, '.w', 'The reinforcement panel is single-player skirmish screen; no network mission uses it.',
  'Панель подкреплений — экран одиночной схватки; ни одна сетевая миссия её не использует.',
  'Панель підкріплень — екран одиночної сутички; жодна мережева місія її не використовує.',
  '增援面板是单人遭遇战的界面，没有任何联网任务使用它。');
R(id, '.n', 'An entry with this card name in the reinforcements part of this file.',
  'Запись с таким именем карточки в разделе reinforcements этого файла.',
  'Запис із таким ім\'ям картки в розділі reinforcements цього файлу.',
  '本文件 reinforcements 部分里有这个卡片名的条目。');
F(id, 'card', ['Card name', 'Имя карточки', 'Ім\'я картки', '卡片名'],
  ['The name of an entry in the reinforcements part, like "menu:1_0".', 'Имя записи в разделе reinforcements, например "menu:1_0".', 'Ім\'я запису в розділі reinforcements, наприклад "menu:1_0".', 'reinforcements 部分中条目的名字，例如 "menu:1_0"。']);
F(id, 'score', ['Points to add', 'Сколько очков добавить', 'Скільки очок додати', '增加的点数']);

// 552
id = 'mi.pat.show_an_objective';
R(id, '', 'Show an objective', 'Показать задачу', 'Показати завдання', '显示目标');
R(id, '.d', 'Shows a new objective to the player with the new-task sound.',
  'Показывает игроку новую задачу со звуком новой задачи.',
  'Показує гравцеві нове завдання зі звуком нового завдання.',
  '向玩家显示一个新目标，并播放新任务的声音。');
R(id, '.n', 'In the tasks part of this file: {"my_task" {desc "$/my_task_text"} {state hidden}}, and the row my_task_text in the mission text file.',
  'В разделе tasks этого файла: {"my_task" {desc "$/my_task_text"} {state hidden}}, и строка my_task_text в файле текстов миссии.',
  'У розділі tasks цього файлу: {"my_task" {desc "$/my_task_text"} {state hidden}}, і рядок my_task_text у файлі текстів місії.',
  '本文件 tasks 部分里：{"my_task" {desc "$/my_task_text"} {state hidden}}，以及任务文本文件里的 my_task_text 行。');
F(id, 'task', TASK, TASK_H);
F(id, 'sound', ['Sound', 'Звук', 'Звук', '声音']);

// 553
id = 'mi.pat.complete_an_objective';
R(id, '', 'Complete an objective', 'Выполнить задачу', 'Виконати завдання', '完成目标');
R(id, '.d', 'Marks an objective as done and plays the task-done sound.',
  'Отмечает задачу как выполненную и проигрывает звук выполнения.',
  'Позначає завдання як виконане й програє звук виконання.',
  '把一个目标标为已完成，并播放完成的声音。');
R(id, '.n', 'The task declared in the tasks part of this file.', 'Задача объявлена в разделе tasks этого файла.', 'Завдання оголошено в розділі tasks цього файлу.', '该任务已在本文件 tasks 部分声明。');
F(id, 'task', TASK, TASK_H);
F(id, 'sound', ['Sound', 'Звук', 'Звук', '声音']);

// 554
id = 'mi.pat.fail_an_objective';
R(id, '', 'Fail an objective', 'Провалить задачу', 'Провалити завдання', '目标失败');
R(id, '.d', 'Marks an objective as failed and plays the task-failed sound.',
  'Отмечает задачу как проваленную и проигрывает звук провала.',
  'Позначає завдання як провалене й програє звук провалу.',
  '把一个目标标为失败，并播放失败的声音。');
R(id, '.n', 'The task declared in the tasks part of this file.', 'Задача объявлена в разделе tasks этого файла.', 'Завдання оголошено в розділі tasks цього файлу.', '该任务已在本文件 tasks 部分声明。');
F(id, 'task', TASK, TASK_H);
F(id, 'sound', ['Sound', 'Звук', 'Звук', '声音']);

// 555
id = 'mi.pat.next_objective_after_one_is_done';
R(id, '', 'Next objective after one is done', 'Следующая задача после выполненной', 'Наступне завдання після виконаного', '完成一个目标后给出下一个');
R(id, '.d', 'A trigger that waits until one objective is completed, then shows the next one with the new-task sound.',
  'Триггер ждёт, пока одна задача не будет выполнена, затем показывает следующую со звуком новой задачи.',
  'Тригер чекає, доки одне завдання не буде виконано, потім показує наступне зі звуком нового завдання.',
  '一个触发器：等一个目标完成后，显示下一个目标并播放新任务的声音。');
R(id, '.n', 'Both tasks declared in the tasks part of this file, the second with {state hidden}.',
  'Обе задачи объявлены в разделе tasks этого файла, вторая с {state hidden}.',
  'Обидва завдання оголошено в розділі tasks цього файлу, друге з {state hidden}.',
  '两个任务都在本文件 tasks 部分声明，第二个带 {state hidden}。');
F(id, 'trigger', TRIG, TRIG_H);
F(id, 'task', ['Done objective', 'Выполненная задача', 'Виконане завдання', '已完成的目标'], TASK_H);
F(id, 'wait', ['Wait seconds', 'Ждать секунд', 'Чекати секунд', '等待秒数']);
F(id, 'next', ['Next objective', 'Следующая задача', 'Наступне завдання', '下一个目标'], TASK_H);

// 556
id = 'mi.pat.objective_progress_readout';
R(id, '', 'Objective progress readout', 'Счётчик хода задачи', 'Лічильник ходу завдання', '目标进度显示');
R(id, '.d', 'Shows a progress number on screen with a title. Set gives the number, add raises it.',
  'Показывает на экране число прогресса с заголовком. set задаёт число, add прибавляет к нему.',
  'Показує на екрані число прогресу із заголовком. set задає число, add додає до нього.',
  '在屏幕上显示带标题的进度数字。set 设定数值，add 在其上增加。');
R(id, '.n', 'The title row in the mission text file.', 'Строка заголовка в файле текстов миссии.', 'Рядок заголовка у файлі текстів місії.', '任务文本文件里的标题行。');
F(id, 'set', ['Set to', 'Установить', 'Встановити', '设为']);
F(id, 'add', ['Add', 'Прибавить', 'Додати', '增加']);
F(id, 'text', ['Title text key', 'Ключ текста заголовка', 'Ключ тексту заголовка', '标题文本键'], TEXTKEY_H);

// 557
id = 'mi.pat.win';
R(id, '', 'Win', 'Победа', 'Перемога', '胜利');
R(id, '.d', 'Ends the mission with a win for the player.', 'Завершает миссию победой игрока.', 'Завершує місію перемогою гравця.', '以玩家胜利结束任务。');
R(id, '.w', 'After it no trigger fires.', 'После этого ни один триггер не срабатывает.', 'Після цього жоден тригер не спрацьовує.', '此后任何触发器都不会再触发。');

// 558
id = 'mi.pat.lose_when_the_player_has_no_men_left';
R(id, '', 'Lose when the player has no men left', 'Поражение, когда у игрока не осталось людей', 'Поразка, коли в гравця не лишилося людей', '玩家无人存活时失败');
R(id, '.d', 'A trigger that fires when no living player soldier is left: it plays the lost music, waits, then ends the mission as lost.',
  'Триггер срабатывает, когда не осталось ни одного живого солдата игрока: играет музыка поражения, пауза, затем миссия заканчивается поражением.',
  'Тригер спрацьовує, коли не лишилося жодного живого солдата гравця: грає музика поразки, пауза, потім місія закінчується поразкою.',
  '一个触发器：玩家一个活着的士兵都不剩时触发，播放失败音乐，等待，然后以失败结束任务。');
R(id, '.w', 'The player tag stands for a tag every player unit carries (vanilla tags them player). A {player "n"} selector also works, but check which side number your units have; bots have no fixed number. The word loose is the game\'s own spelling.',
  'Тег игрока — это тег, который есть у каждого юнита игрока (в игре это player). Селектор {player "n"} тоже работает, но проверьте номер стороны ваших юнитов; у ботов номер не постоянный. Слово loose — так пишет сама игра.',
  'Тег гравця — це тег, який має кожен юніт гравця (у грі це player). Селектор {player "n"} теж працює, але перевірте номер сторони ваших юнітів; у ботів номер не сталий. Слово loose — так пише сама гра.',
  '玩家标签指每个玩家单位都带的标签（原版用 player）。{player "n"} 选择器也可以用，但要确认你单位的阵营编号；机器人的编号不固定。loose 这个拼写是游戏自己的。');
F(id, 'trigger', TRIG, TRIG_H);
F(id, 'player_units', ['Player unit tag', 'Тег юнитов игрока', 'Тег юнітів гравця', '玩家单位标签'],
  ['A tag every player unit carries (vanilla uses player).', 'Тег, который есть у каждого юнита игрока (в игре это player).', 'Тег, який має кожен юніт гравця (у грі це player).', '每个玩家单位都带的标签（原版用 player）。']);
F(id, 'wait', ['Wait seconds', 'Ждать секунд', 'Чекати секунд', '等待秒数']);

// 559
id = 'mi.pat.countdown_shown_to_the_player';
R(id, '', 'Countdown shown to the player', 'Обратный отсчёт для игрока', 'Зворотний відлік для гравця', '向玩家显示倒计时');
R(id, '.d', 'Shows a countdown on screen and sets an event when the same time runs out. The countdown alone does nothing at the end, so the event is what other triggers wait for.',
  'Показывает на экране обратный отсчёт и устанавливает событие, когда то же время истечёт. Сам отсчёт в конце ничего не делает, поэтому другие триггеры ждут именно событие.',
  'Показує на екрані зворотний відлік і встановлює подію, коли той самий час мине. Сам відлік наприкінці нічого не робить, тому інші тригери чекають саме на подію.',
  '在屏幕上显示倒计时，并在同样的时间结束时设置一个事件。倒计时本身结束时什么都不做，所以其他触发器等的是这个事件。');
R(id, '.n', 'The event declared in the events part of this file; the title row in the mission text file.',
  'Событие объявлено в разделе events этого файла; строка заголовка в файле текстов миссии.',
  'Подію оголошено в розділі events цього файлу; рядок заголовка у файлі текстів місії.',
  '事件已在本文件 events 部分声明；任务文本文件里的标题行。');
F(id, 'time', ['Countdown seconds', 'Секунд отсчёта', 'Секунд відліку', '倒计时秒数']);
F(id, 'text', ['Title text key', 'Ключ текста заголовка', 'Ключ тексту заголовка', '标题文本键'], TEXTKEY_H);
F(id, 'event', ['Time-up event', 'Событие конца времени', 'Подія кінця часу', '时间到事件']);
F(id, 'time_2', ['Seconds again', 'Секунды ещё раз', 'Секунди ще раз', '再次填秒数'], SAME('the countdown seconds'));

// 560
id = 'mi.pat.hide_the_countdown';
R(id, '', 'Hide the countdown', 'Скрыть обратный отсчёт', 'Сховати зворотний відлік', '隐藏倒计时');
R(id, '.d', 'Removes the countdown with this title from the screen.', 'Убирает с экрана обратный отсчёт с этим заголовком.', 'Прибирає з екрана зворотний відлік із цим заголовком.', '从屏幕上移除带这个标题的倒计时。');
F(id, 'text', ['Title text key', 'Ключ текста заголовка', 'Ключ тексту заголовка', '标题文本键'],
  ['The same key the countdown was shown with, without "$/".', 'Тот же ключ, с которым показан отсчёт, без "$/".', 'Той самий ключ, з яким показано відлік, без "$/".', '与显示倒计时时相同的键名，不带 "$/"。']);

// 561
id = 'mi.pat.dialogue_line_by_a_unit';
R(id, '', 'Dialogue line by a unit', 'Реплика юнита', 'Репліка юніта', '单位说台词');
R(id, '.d', 'One unit says a line, a pause, then a second unit answers. The lines show over the speakers.',
  'Один юнит говорит реплику, пауза, затем второй юнит отвечает. Реплики видны над говорящими.',
  'Один юніт каже репліку, пауза, потім другий юніт відповідає. Репліки видно над тими, хто говорить.',
  '一个单位说一句台词，停顿，然后另一个单位回答。台词显示在说话者上方。');
R(id, '.n', 'Units placed with the two speaker tags; both line rows in the mission text file.',
  'Юниты расставлены с двумя тегами говорящих; обе строки реплик в файле текстов миссии.',
  'Юніти розставлено з двома тегами мовців; обидва рядки реплік у файлі текстів місії.',
  '带两个说话者标签的单位已放好；两行台词都在任务文本文件里。');
F(id, 'speaker_a', ['First speaker tag', 'Тег первого говорящего', 'Тег першого мовця', '第一位说话者标签']);
F(id, 'line_1', ['First line key', 'Ключ первой реплики', 'Ключ першої репліки', '第一句台词键'], TEXTKEY_H);
F(id, 'wait', ['Pause seconds', 'Пауза, секунд', 'Пауза, секунд', '停顿秒数']);
F(id, 'speaker_b', ['Second speaker tag', 'Тег второго говорящего', 'Тег другого мовця', '第二位说话者标签']);
F(id, 'line_2', ['Second line key', 'Ключ второй реплики', 'Ключ другої репліки', '第二句台词键'], TEXTKEY_H);

// 562
id = 'mi.pat.short_cutscene_camera_path_no_cancel';
R(id, '', 'Short cutscene (camera path, no cancel, back to play)', 'Короткая заставка (путь камеры, без пропуска, назад к игре)', 'Коротка заставка (шлях камери, без пропуску, назад до гри)', '短过场（镜头路径，不可跳过，结束后回到游戏）');
R(id, '.d', ...cat(['Fades the screen, flies a mission camera along its path with no way to skip, then returns to play and sets an event.',
  'Затемняет экран, проводит камеру миссии по её пути без возможности пропуска, затем возвращает к игре и устанавливает событие.',
  'Затемнює екран, проводить камеру місії її шляхом без можливості пропуску, потім повертає до гри й встановлює подію.',
  '屏幕淡出，任务镜头沿路径飞行且不能跳过，然后回到游戏并设置一个事件。'], NMP));
R(id, '.w', 'A mission camera crashes network games.', 'Камера миссии роняет сетевые игры.', 'Камера місії обвалює мережеві ігри.', '任务镜头会让联网游戏崩溃。');
R(id, '.n', 'A camera with this name in the cameras part of this file, and the event declared in the events part.',
  'Камера с этим именем в разделе cameras этого файла и событие, объявленное в разделе events.',
  'Камера з цим ім\'ям у розділі cameras цього файлу й подія, оголошена в розділі events.',
  '本文件 cameras 部分里有这个名字的镜头，events 部分里声明了该事件。');
F(id, 'fade', ['Fade seconds', 'Затемнение, секунд', 'Затемнення, секунд', '淡出秒数']);
F(id, 'camera', ['Camera name', 'Имя камеры', 'Ім\'я камери', '镜头名'],
  ['A camera declared in the cameras part of this file.', 'Камера, объявленная в разделе cameras этого файла.', 'Камера, оголошена в розділі cameras цього файлу.', '在本文件 cameras 部分声明的镜头。']);
F(id, 'event', ['Event when done', 'Событие по окончании', 'Подія після завершення', '结束时的事件'],
  ['Set when the camera path ends; start the next part of the mission on it.', 'Устанавливается, когда путь камеры закончился; запускайте по нему следующую часть миссии.', 'Встановлюється, коли шлях камери закінчився; запускайте за нею наступну частину місії.', '镜头路径结束时设置；用它启动任务的下一部分。']);

module.exports = rows;

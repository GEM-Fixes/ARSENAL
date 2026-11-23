// Code Pieces, group mi-idea-1: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-idea-1.js
// (ideas to try in mission files, numbers 590 to 612). Field labels shared by many pieces come from the table L.
// Author: Imperator_Aug (ARSENAL, ia-fda0e42e)
'use strict';

const NT = ['Not tried in game.', 'В игре не проверено.', 'У грі не перевірено.', '未在游戏中试过。'];
const NMP = ['Not for multiplayer maps.', 'Не для сетевых карт.', 'Не для мережевих мап.', '不适用于多人地图。'];

// shared field labels: [en, ru, uk, zh] label, then optional hint [en, ru, uk, zh]
const L = {
  trig: [['Trigger name', 'Имя триггера', "Ім'я тригера", '触发器名称']],
  trig2: [['Trigger name again', 'Имя триггера ещё раз', "Ім'я тригера ще раз", '再次填写触发器名称'],
    ['The same name as the trigger: it switches itself off, so it can fire again.',
      'То же имя, что у триггера: он выключает сам себя и может сработать снова.',
      "Те саме ім'я, що в тригера: він вимикає сам себе й може спрацювати знову.",
      '与触发器相同的名称：它会关闭自己，以便再次触发。']],
  ptag: [['Your units tag', 'Тег ваших юнитов', 'Тег ваших юнітів', '你的单位标签']],
  etag: [['Enemy units tag', 'Тег вражеских юнитов', 'Тег ворожих юнітів', '敌方单位标签']],
  zone: [['Zone name', 'Имя зоны', "Ім'я зони", '区域名称'],
    ['A zone declared in Helpers.', 'Зона, объявленная в Helpers.', 'Зона, оголошена в Helpers.', '在 Helpers 中声明的区域。']],
  zone2: [['Same zone again', 'Та же зона ещё раз', 'Та сама зона ще раз', '再次填写同一区域']],
  wp: [['Waypoint name', 'Имя точки пути', "Ім'я точки шляху", '路径点名称'],
    ['A waypoint declared in Helpers.', 'Точка пути, объявленная в Helpers.', 'Точка шляху, оголошена в Helpers.', '在 Helpers 中声明的路径点。']],
  var: [['Variable name', 'Имя переменной', "Ім'я змінної", '变量名称'],
    ['Declared in Helpers vars; written here without the $.', 'Объявлена в vars раздела Helpers; здесь пишется без $.',
      'Оголошена у vars розділу Helpers; тут пишеться без $.', '在 Helpers 的 vars 中声明；这里不写 $。']],
  var2: [['Same variable again', 'Та же переменная ещё раз', 'Та сама змінна ще раз', '再次填写同一变量']],
  task: [['Task name', 'Имя задачи', "Ім'я завдання", '任务名称'],
    ['A task declared in Helpers tasks.', 'Задача, объявленная в tasks раздела Helpers.', 'Завдання, оголошене в tasks розділу Helpers.', '在 Helpers 的 tasks 中声明的任务。']],
  task2: [['Same task again', 'Та же задача ещё раз', 'Те саме завдання ще раз', '再次填写同一任务']],
  event: [['Event name', 'Имя события', "Ім'я події", '事件名称'],
    ['An event declared in Helpers.', 'Событие, объявленное в Helpers.', 'Подія, оголошена в Helpers.', '在 Helpers 中声明的事件。']],
  event2: [['Same event again', 'То же событие ещё раз', 'Та сама подія ще раз', '再次填写同一事件']],
  same: [['Same tag again', 'Тот же тег ещё раз', 'Той самий тег ще раз', '再次填写同一标签']],
  chance: [['Chance (0 to 1)', 'Шанс (от 0 до 1)', 'Шанс (від 0 до 1)', '概率（0 到 1）']],
};

const rows = [];
const add = (key, v) => rows.push([key].concat(v));
// one piece: id, title, what it does, opts { w, n, nt (not tried), nmp (not for MP) }, fields { name: L-entry or [label, hint?] }
function piece(id, title, d, o, f) {
  const k = 'ide.kit.p.' + id;
  add(k, title);
  const dd = d.slice();
  if (o.nt) for (let i = 0; i < 4; i++) dd[i] += ' ' + NT[i];
  if (o.nmp) for (let i = 0; i < 4; i++) dd[i] += ' ' + NMP[i];
  add(k + '.d', dd);
  if (o.w) add(k + '.w', o.w);
  if (o.n) add(k + '.n', o.n);
  for (const name of Object.keys(f)) {
    const e = typeof f[name] === 'string' ? L[f[name]] : f[name];
    add(k + '.f.' + name, e[0]);
    if (e[1]) add(k + '.f.' + name + '.h', e[1]);
  }
}

// 590
piece('mi.idea.dynamic_difficulty_from_the_player_s',
  ["Dynamic difficulty from the player's losses", 'Сложность по потерям игрока', 'Складність за втратами гравця', '根据玩家损失调整难度'],
  ['When more of your men are dead than the number you set, the trigger removes some enemy reserve units and writes a line to the console.',
    'Когда погибших ваших бойцов больше заданного числа, триггер убирает часть вражеского резерва и пишет строку в консоль.',
    'Коли загиблих ваших бійців більше за задане число, тригер прибирає частину ворожого резерву й пише рядок у консоль.',
    '当你阵亡的士兵超过设定数量时，触发器会移除一部分敌方预备单位，并在控制台写一行文字。'],
  { nt: true,
    w: ['Dead men count only while their bodies are on the map. Knocked-out men count as dead too.',
      'Погибшие считаются, только пока их тела на карте. Оглушённые тоже считаются погибшими.',
      'Загиблі рахуються, лише поки їхні тіла на мапі. Оглушені теж рахуються загиблими.',
      '阵亡士兵只有在尸体还在地图上时才会被计数。被击倒的士兵也算作阵亡。'],
    n: ['Your units carry the tag you name; the enemy reserve units carry their own tag.',
      'Ваши юниты носят указанный тег; вражеский резерв — свой тег.',
      'Ваші юніти мають вказаний тег; ворожий резерв — свій тег.',
      '你的单位带有你填写的标签；敌方预备单位带有它们自己的标签。'] },
  { name: 'trig', player_tag: 'ptag',
    losses: [['Losses before it eases', 'Потери до облегчения', 'Втрати до полегшення', '降低难度前的损失数']],
    amount: [['Enemy units removed', 'Сколько врагов убрать', 'Скільки ворогів прибрати', '移除的敌方单位数']],
    reserve_tag: [['Enemy reserve tag', 'Тег вражеского резерва', 'Тег ворожого резерву', '敌方预备队标签']],
    message: [['Console line', 'Строка в консоль', 'Рядок у консоль', '控制台文字'],
      ['Shown only in the game console, handy while testing.', 'Видна только в консоли игры, удобно при проверке.',
        'Видно лише в консолі гри, зручно під час перевірки.', '只在游戏控制台显示，测试时有用。']] });

// 591
piece('mi.idea.front_line_that_moves_with_captured',
  ['Front line that moves with captured zones', 'Линия фронта, которая движется за взятыми зонами', 'Лінія фронту, що рухається за захопленими зонами', '随占领区域移动的前线'],
  ['When a flag object tagged captured stands in the zone, the next line of objects appears and the old line is hidden. Stock missions show defences this way after a flag is taken.',
    'Когда в зоне стоит объект флага с тегом captured, появляется следующая линия объектов, а старая прячется. Так игра показывает оборону после взятия флага.',
    'Коли в зоні стоїть обʼєкт прапора з тегом captured, зʼявляється наступна лінія обʼєктів, а стара ховається. Так гра показує оборону після захоплення прапора.',
    '当区域内有带 captured 标签的旗帜物体时，下一条物体线会出现，旧的线会隐藏。游戏自带任务在占领旗帜后就是这样显示防御工事的。'],
  { w: ['The captured tag must be put on the flag object by your own capture trigger (see Capture a flag).',
    'Тег captured должен ставить на объект флага ваш собственный триггер захвата (см. «Захват флага»).',
    'Тег captured має ставити на обʼєкт прапора ваш власний тригер захоплення (див. «Захоплення прапора»).',
    'captured 标签必须由你自己的占领触发器加到旗帜物体上（见“夺旗”）。'] },
  { name: 'trig', flag_zone: [['Flag zone', 'Зона флага', 'Зона прапора', '旗帜区域'], L.zone[1]],
    new_line: [['Tag of the new line', 'Тег новой линии', 'Тег нової лінії', '新防线标签']],
    old_line: [['Tag of the old line', 'Тег старой линии', 'Тег старої лінії', '旧防线标签']] });

// 592
piece('mi.idea.random_patrol_route_each_start',
  ['Random patrol route each start', 'Случайный маршрут патруля при каждом старте', 'Випадковий маршрут патруля на кожному старті', '每次开始随机选择巡逻路线'],
  ['When the mission starts, a dice roll sends the patrol to route A or to route B, so it walks a different way from game to game.',
    'При старте миссии бросок кубика отправляет патруль по маршруту A или B, и от игры к игре он ходит по-разному.',
    'На старті місії кидок кубика відправляє патруль маршрутом A або B, і від гри до гри він ходить по-різному.',
    '任务开始时随机决定巡逻队走路线 A 还是路线 B，因此每局走法不同。'],
  { nt: true,
    w: ['Old as64 builds ran every case whose roll was true, not only the first.',
      'Старые сборки as64 выполняли все case с удачным броском, а не только первый.',
      'Старі збірки as64 виконували всі case з вдалим кидком, а не лише перший.',
      '旧版 as64 会执行所有掷中的 case，而不只是第一个。'] },
  { name: 'trig', chance: [['Chance of route A', 'Шанс маршрута A', 'Шанс маршруту A', '选路线 A 的概率']],
    patrol: [['Patrol tag', 'Тег патруля', 'Тег патруля', '巡逻队标签']], patrol_2: 'same',
    route_a: [['First waypoint of route A', 'Первая точка маршрута A', 'Перша точка маршруту A', '路线 A 的第一个路径点'], L.wp[1]],
    route_b: [['First waypoint of route B', 'Первая точка маршрута B', 'Перша точка маршруту B', '路线 B 的第一个路径点'], L.wp[1]] });

// 593
piece('mi.idea.supply_convoy_that_must_arrive',
  ['Supply convoy that must arrive', 'Колонна снабжения, которая должна дойти', 'Колона постачання, що має дійти', '必须抵达的补给车队'],
  ['The task is done when enough convoy vehicles stand in the depot zone. If fewer vehicles are left than needed before that, the task fails and the mission is lost.',
    'Задача выполнена, когда в зоне склада стоит достаточно машин колонны. Если раньше машин осталось меньше нужного, задача провалена и миссия проиграна.',
    'Завдання виконано, коли в зоні складу стоїть досить машин колони. Якщо раніше машин лишилося менше, ніж треба, завдання провалено й місію програно.',
    '当足够多的车队车辆停在仓库区域时任务完成。如果在此之前剩下的车辆少于所需数量，任务失败，任务关卡失败。'],
  { nt: true,
    w: ['Destroyed vehicles drop out of the count, so the fail check counts the vehicles still alive.',
      'Уничтоженные машины выпадают из счёта, поэтому проверка провала считает ещё живые машины.',
      'Знищені машини випадають із підрахунку, тому перевірка провалу рахує ще живі машини.',
      '被摧毁的车辆不再被计数，所以失败检查统计的是仍然存活的车辆。'],
    n: ['The convoy vehicles carry a tag and drive their own waypoint route to the depot; the task and the depot zone are declared in Helpers.',
      'Машины колонны носят тег и едут по своему маршруту точек к складу; задача и зона склада объявлены в Helpers.',
      'Машини колони мають тег і їдуть своїм маршрутом точок до складу; завдання й зону складу оголошено в Helpers.',
      '车队车辆带有标签，并沿自己的路径点路线开往仓库；任务和仓库区域在 Helpers 中声明。'] },
  { name: 'trig', convoy: [['Convoy tag', 'Тег колонны', 'Тег колони', '车队标签']], depot: [['Depot zone', 'Зона склада', 'Зона складу', '仓库区域'], L.zone[1]],
    arrive: [['Vehicles that must arrive', 'Сколько машин должно дойти', 'Скільки машин має дійти', '必须抵达的车辆数']],
    task: 'task', fail_name: [['Fail trigger name', 'Имя триггера провала', "Ім'я тригера провалу", '失败触发器名称']],
    convoy_2: 'same', arrive_2: [['Same number again', 'То же число ещё раз', 'Те саме число ще раз', '再次填写同一数量']],
    task_2: 'task2', task_3: 'task2' });

// 594
piece('mi.idea.timed_evacuation_who_is_in_the_zone',
  ['Timed evacuation: who is in the zone when time runs out is saved', 'Эвакуация на время: спасены те, кто в зоне, когда время вышло', 'Евакуація на час: врятовані ті, хто в зоні, коли час сплив', '限时撤离：时间到时在区域内的人获救'],
  ['When the time-up event comes, the mission is won if enough living civilians stand in the evacuation zone, and lost if not.',
    'Когда приходит событие конца времени, миссия выиграна, если в зоне эвакуации достаточно живых мирных, иначе проиграна.',
    'Коли надходить подія кінця часу, місію виграно, якщо в зоні евакуації досить живих цивільних, інакше програно.',
    '当时间到事件发生时，如果撤离区域内有足够多存活的平民，任务胜利，否则失败。'],
  { nt: true,
    n: ['A timer of your own sets the time-up event (for example a trigger with a delay); the event and the zone are declared in Helpers.',
      'Событие конца времени ставит ваш собственный таймер (например, триггер с delay); событие и зона объявлены в Helpers.',
      'Подію кінця часу ставить ваш власний таймер (наприклад, тригер із delay); подію й зону оголошено в Helpers.',
      '时间到事件由你自己的计时器设置（例如带 delay 的触发器）；事件和区域在 Helpers 中声明。'] },
  { name: 'trig', time_up: [['Time-up event', 'Событие конца времени', 'Подія кінця часу', '时间到事件'], L.event[1]],
    civilians: [['Civilians tag', 'Тег мирных жителей', 'Тег цивільних', '平民标签']],
    evac_zone: [['Evacuation zone', 'Зона эвакуации', 'Зона евакуації', '撤离区域'], L.zone[1]],
    saved: [['People needed to win', 'Сколько нужно для победы', 'Скільки треба для перемоги', '胜利所需人数']] });

// 595
piece('mi.idea.stealth_with_alarm_states',
  ['Stealth with alarm states', 'Скрытность с уровнями тревоги', 'Скритність із рівнями тривоги', '带警报等级的潜行'],
  ['Two triggers keep an alarm level in a variable: 1 when a guard sees your men, 2 when shots hit in the camp. At level 2 the guards open fire.',
    'Два триггера держат уровень тревоги в переменной: 1, когда охрана видит ваших бойцов, 2, когда в лагере попадают выстрелы. На уровне 2 охрана открывает огонь.',
    'Два тригери тримають рівень тривоги в змінній: 1, коли охорона бачить ваших бійців, 2, коли в таборі влучають постріли. На рівні 2 охорона відкриває вогонь.',
    '两个触发器用一个变量保存警报等级：守卫看到你的人时为 1，营地中有子弹命中时为 2。等级 2 时守卫开火。'],
  { nt: true,
    w: ['Whether a signal stays set after it is read is not known yet.', 'Остаётся ли сигнал после чтения, пока неизвестно.',
      'Чи лишається сигнал після читання, поки невідомо.', '信号被读取后是否仍保持，目前尚不清楚。'],
    n: ['Declare the alarm variable in Helpers vars and the camp zone in Helpers. Other triggers can read the level with cmp_i.',
      'Объявите переменную тревоги в vars и зону лагеря в Helpers. Другие триггеры читают уровень через cmp_i.',
      'Оголосіть змінну тривоги у vars і зону табору в Helpers. Інші тригери читають рівень через cmp_i.',
      '在 Helpers 的 vars 中声明警报变量，并在 Helpers 中声明营地区域。其他触发器可用 cmp_i 读取等级。'] },
  { name: [['Sight trigger name', 'Имя триггера обнаружения', "Ім'я тригера виявлення", '发现触发器名称']], guards: [['Guards tag', 'Тег охраны', 'Тег охорони', '守卫标签']],
    player_tag: 'ptag', alarm: 'var', alarm_2: 'var2',
    shots_name: [['Shots trigger name', 'Имя триггера выстрелов', "Ім'я тригера пострілів", '枪声触发器名称']],
    camp: [['Camp zone', 'Зона лагеря', 'Зона табору', '营地区域'], L.zone[1]], alarm_3: 'var2', guards_2: 'same' });

// 596
piece('mi.idea.guards_search_around_the_alarm',
  ['Guards search around the alarm', 'Охрана обыскивает округу по тревоге', 'Охорона обшукує околиці за тривогою', '警报后守卫搜索周围'],
  ['The guards drop their orders and search the ground around them within the radius. Put it in the actions of your alarm trigger.',
    'Охрана бросает приказы и обыскивает местность вокруг себя в пределах радиуса. Вставьте в actions триггера тревоги.',
    'Охорона кидає накази й обшукує місцевість навколо себе в межах радіуса. Вставте в actions тригера тривоги.',
    '守卫放弃当前命令，在半径范围内搜索周围。把它放进警报触发器的 actions 里。'],
  { nt: true },
  { guards: [['Guards tag', 'Тег охраны', 'Тег охорони', '守卫标签']],
    radius: [['Search radius', 'Радиус поиска', 'Радіус пошуку', '搜索半径'],
      ['Stock missions use 30 to 250.', 'В миссиях игры от 30 до 250.', 'У місіях гри від 30 до 250.', '游戏自带任务使用 30 到 250。']] });

// 597
piece('mi.idea.prisoners_to_free',
  ['Prisoners to free', 'Пленные, которых надо освободить', 'Полонені, яких треба звільнити', '需要解救的俘虏'],
  ['When one of your men comes close to the prisoners, they move to your side and you can give them orders.',
    'Когда ваш боец подходит к пленным, они переходят на вашу сторону и слушаются ваших приказов.',
    'Коли ваш боєць підходить до полонених, вони переходять на ваш бік і слухаються ваших наказів.',
    '当你的士兵靠近俘虏时，他们转到你这一方，你可以指挥他们。'],
  { nt: true,
    w: ['Side numbers of players differ in multiplayer.', 'В сетевой игре номера сторон игроков разные.',
      'У мережевій грі номери сторін гравців різні.', '多人游戏中各玩家的阵营编号不同。'],
    n: ['Place the prisoners on a side that does not fight, with a tag; take their weapons away first if you want (inventory action drop).',
      'Поставьте пленных с тегом на сторону, которая не воюет; при желании сначала отберите оружие (inventory action drop).',
      'Поставте полонених із тегом на бік, що не воює; за бажання спершу заберіть зброю (inventory action drop).',
      '把带标签的俘虏放在不参战的一方；需要的话先收走他们的武器（inventory action drop）。'] },
  { name: 'trig', player_tag: 'ptag', prisoners: [['Prisoners tag', 'Тег пленных', 'Тег полонених', '俘虏标签']],
    distance: [['How close to come', 'Насколько подойти', 'Наскільки підійти', '需要靠近的距离']],
    prisoners_2: 'same', side: [['Your side number', 'Номер вашей стороны', 'Номер вашого боку', '你的阵营编号'],
      ['The player number of your side in this mission.', 'Номер игрока вашей стороны в этой миссии.', 'Номер гравця вашого боку в цій місії.', '本任务中你这一方的玩家编号。']],
    prisoners_3: 'same' });

// 598
piece('mi.idea.civilians_that_flee_from_explosions',
  ['Civilians that flee from explosions', 'Мирные, которые бегут от взрывов', 'Цивільні, що тікають від вибухів', '因爆炸而逃跑的平民'],
  ['When an explosion happens in the village zone, the civilians drop what they do and run fast to the exit waypoint.',
    'Когда в зоне деревни что-то взрывается, мирные бросают дела и быстро бегут к точке выхода.',
    'Коли в зоні села щось вибухає, цивільні кидають справи й швидко біжать до точки виходу.',
    '当村庄区域发生爆炸时，平民放下手头的事，快速跑向出口路径点。'],
  { nt: true,
    n: ['Declare the village zone and the exit waypoint in Helpers. At the exit, a delete command can take them off the map.',
      'Объявите зону деревни и точку выхода в Helpers. У выхода команда delete может убрать их с карты.',
      'Оголосіть зону села й точку виходу в Helpers. Біля виходу команда delete може прибрати їх із мапи.',
      '在 Helpers 中声明村庄区域和出口路径点。到达出口后，可用 delete 命令把他们从地图上移除。'] },
  { name: 'trig', village: [['Village zone', 'Зона деревни', 'Зона села', '村庄区域'], L.zone[1]],
    civilians: [['Civilians tag', 'Тег мирных жителей', 'Тег цивільних', '平民标签']], civilians_2: 'same',
    exit: [['Exit waypoint', 'Точка выхода', 'Точка виходу', '出口路径点'], L.wp[1]] });

// 599
piece('mi.idea.random_event_deck_every_few_minutes',
  ['Random event deck every few minutes', 'Колода случайных событий каждые несколько минут', 'Колода випадкових подій кожні кілька хвилин', '每隔几分钟抽一张随机事件'],
  ['Every few minutes a dice roll sets one of three events: an air raid, an enemy wave or a quiet spell. Your own triggers wait for these events and do the rest.',
    'Каждые несколько минут бросок кубика ставит одно из трёх событий: налёт, вражескую волну или затишье. Ваши триггеры ждут эти события и делают остальное.',
    'Кожні кілька хвилин кидок кубика ставить одну з трьох подій: наліт, ворожу хвилю або затишшя. Ваші тригери чекають ці події й роблять решту.',
    '每隔几分钟随机设置三个事件之一：空袭、敌军波次或平静期。你自己的触发器等待这些事件并完成其余部分。'],
  { nt: true,
    w: ['An event stays set: the trigger that waits for it should reset it, or the next draw of the same card does nothing new.',
      'Событие остаётся установленным: ждущий его триггер должен его сбросить, иначе повторная карта ничего не даст.',
      'Подія лишається встановленою: тригер, що її чекає, має її скинути, інакше повторна карта нічого не дасть.',
      '事件设置后会保持：等待它的触发器应将其重置，否则再次抽到同一张牌不会有新效果。'],
    n: ['Declare the three events in Helpers and write one trigger for each that waits for it.',
      'Объявите три события в Helpers и напишите для каждого триггер, который его ждёт.',
      'Оголосіть три події в Helpers і напишіть для кожної тригер, що її чекає.',
      '在 Helpers 中声明这三个事件，并为每个事件写一个等待它的触发器。'] },
  { name: 'trig', every: [['Average wait', 'Средняя пауза', 'Середня пауза', '平均等待时间']],
    spread: [['Random spread', 'Случайный разброс', 'Випадковий розкид', '随机浮动'],
      ['The wait goes this many seconds up or down at random.', 'Пауза случайно больше или меньше на столько секунд.',
        'Пауза випадково більша чи менша на стільки секунд.', '等待时间随机增减这么多秒。']],
    chance_a: [['Chance of card 1', 'Шанс карты 1', 'Шанс карти 1', '第 1 张牌的概率']], event_a: [['Card 1 event', 'Событие карты 1', 'Подія карти 1', '第 1 张牌的事件'], L.event[1]],
    chance_b: [['Chance of card 2', 'Шанс карты 2', 'Шанс карти 2', '第 2 张牌的概率'],
      ['Rolled only when card 1 was not drawn.', 'Бросается, только если карта 1 не выпала.', 'Кидається, лише якщо карта 1 не випала.', '只有没抽到第 1 张牌时才掷。']],
    event_b: [['Card 2 event', 'Событие карты 2', 'Подія карти 2', '第 2 张牌的事件'], L.event[1]],
    event_c: [['Event when nothing else', 'Событие, если ничего иного', 'Подія, якщо нічого іншого', '都没抽到时的事件'], L.event[1]],
    name_2: 'trig2' });

// 600
piece('mi.idea.side_objective_unlocks_reinforcement',
  ['Side objective unlocks reinforcements', 'Побочная задача открывает подкрепление', 'Побічне завдання відкриває підкріплення', '支线目标解锁增援'],
  ['When the side task is completed, a hidden card of the reinforcement panel is shown, so the player can call it in.',
    'Когда побочная задача выполнена, скрытая карточка панели подкреплений показывается, и игрок может её вызвать.',
    'Коли побічне завдання виконано, прихована картка панелі підкріплень показується, і гравець може її викликати.',
    '支线任务完成后，增援面板中隐藏的卡片会显示出来，玩家就可以呼叫它。'],
  { nt: true, nmp: true,
    n: ['The side task is declared in Helpers tasks; the card is an entry of {reinforcements} with {state hidden}.',
      'Побочная задача объявлена в tasks раздела Helpers; карточка — запись в {reinforcements} с {state hidden}.',
      'Побічне завдання оголошено в tasks розділу Helpers; картка — запис у {reinforcements} із {state hidden}.',
      '支线任务在 Helpers 的 tasks 中声明；卡片是 {reinforcements} 中带 {state hidden} 的一项。'] },
  { name: 'trig', task: [['Side task name', 'Имя побочной задачи', "Ім'я побічного завдання", '支线任务名称'], L.task[1]],
    card: [['Reinforcement card name', 'Имя карточки подкрепления', "Ім'я картки підкріплення", '增援卡片名称']] });

// 601
piece('mi.idea.defend_then_counterattack',
  ['Defend, then counterattack', 'Оборона, затем контратака', 'Оборона, потім контратака', '先防守，后反攻'],
  ['When the hold time is up and fewer than a few attackers are left, the defend task is done, the attack task is shown and a counterattack event is set.',
    'Когда время обороны вышло и атакующих осталось меньше нескольких, задача обороны выполнена, показана задача атаки и поставлено событие контратаки.',
    'Коли час оборони сплив і нападників лишилося менше кількох, завдання оборони виконано, показано завдання атаки й поставлено подію контратаки.',
    '当坚守时间结束且剩下的进攻者少于设定数量时，防守任务完成，显示进攻任务，并设置反攻事件。'],
  { nt: true,
    n: ['A timer of your own sets the hold-time event. Both tasks and both events are declared in Helpers.',
      'Событие конца обороны ставит ваш таймер. Обе задачи и оба события объявлены в Helpers.',
      'Подію кінця оборони ставить ваш таймер. Обидва завдання й обидві події оголошено в Helpers.',
      '坚守时间事件由你自己的计时器设置。两个任务和两个事件都在 Helpers 中声明。'] },
  { name: 'trig', hold_up: [['Hold time up event', 'Событие конца обороны', 'Подія кінця оборони', '坚守结束事件'], L.event[1]],
    wave: [['Attacking wave tag', 'Тег атакующей волны', 'Тег атакувальної хвилі', '进攻波次标签']],
    left: [['Fewer attackers than', 'Атакующих меньше чем', 'Нападників менше ніж', '进攻者少于']],
    defend_task: [['Defend task', 'Задача обороны', 'Завдання оборони', '防守任务'], L.task[1]],
    attack_task: [['Attack task', 'Задача атаки', 'Завдання атаки', '进攻任务'], L.task[1]],
    attack_on: [['Counterattack event', 'Событие контратаки', 'Подія контратаки', '反攻事件'], L.event[1]] });

// 602
piece('mi.idea.survivors_carry_over_to_the_next_pha',
  ['Survivors carry over to the next phase', 'Выжившие переходят в следующую фазу', 'Ті, хто вижив, переходять у наступну фазу', '幸存者带入下一阶段'],
  ['A loop that clones one hidden man from the pool at the waypoint, again and again, until as many men are in the play zone as the variable says. A stock mission refills a tank crew this way.',
    'Цикл, который клонирует по одному скрытому бойцу из запаса на точке пути, пока в игровой зоне не станет столько бойцов, сколько в переменной. Так миссия игры пополняет экипаж танка.',
    'Цикл, що клонує по одному прихованому бійцю із запасу на точці шляху, доки в ігровій зоні не стане стільки бійців, скільки в змінній. Так місія гри поповнює екіпаж танка.',
    '一个循环：在路径点处从预备池中一次克隆一个隐藏的士兵，直到游戏区域内的士兵数量达到变量中的数字。游戏自带任务就是这样补充坦克乘员的。'],
  { w: ['Keep the pool men outside the play zone, or they count as already there.',
    'Держите бойцов запаса вне игровой зоны, иначе они считаются уже прибывшими.',
    'Тримайте бійців запасу поза ігровою зоною, інакше вони вважаються вже присутніми.',
    '让预备池的士兵留在游戏区域外，否则他们会被算作已经在场。'],
    n: ['Pool men placed outside the play zone with the squad tag and the hidden tag; the variable declared in Helpers vars and set to the survivor count before this runs; the play zone and the waypoint declared in Helpers.',
      'Бойцы запаса стоят вне игровой зоны с тегом отряда и тегом hidden; переменная объявлена в vars и до запуска равна числу выживших; игровая зона и точка пути объявлены в Helpers.',
      'Бійці запасу стоять поза ігровою зоною з тегом загону й тегом hidden; змінну оголошено у vars і до запуску вона дорівнює числу тих, хто вижив; ігрову зону й точку шляху оголошено в Helpers.',
      '预备士兵放在游戏区域外，带小队标签和 hidden 标签；变量在 Helpers 的 vars 中声明，并在运行前设为幸存者人数；游戏区域和路径点在 Helpers 中声明。'] },
  { squad: [['Squad tag', 'Тег отряда', 'Тег загону', '小队标签']], play_zone: [['Play zone', 'Игровая зона', 'Ігрова зона', '游戏区域'], L.zone[1]],
    survivors: [['Survivors variable', 'Переменная выживших', 'Змінна тих, хто вижив', '幸存者变量'], L.var[1]],
    squad_2: 'same', waypoint: [['Arrival waypoint', 'Точка появления', 'Точка появи', '到达路径点'], L.wp[1]] });

// 603
piece('mi.idea.enemy_calls_artillery_on_the_last_se',
  ['Enemy calls artillery on the last seen target', 'Враг вызывает артиллерию по последней замеченной цели', 'Ворог викликає артилерію по останній поміченій цілі', '敌人对最后看到的目标呼叫炮击'],
  ['When the spotter sees one of your units, that unit gets a tag; after a short wait the enemy battery fires at units with that tag.',
    'Когда наблюдатель видит ваш юнит, тот получает тег; после короткой паузы вражеская батарея стреляет по юнитам с этим тегом.',
    'Коли спостерігач бачить ваш юніт, той отримує тег; після короткої паузи ворожа батарея стріляє по юнітах із цим тегом.',
    '当观察员看到你的某个单位时，该单位会被加上标签；短暂等待后，敌方炮兵向带该标签的单位开火。'],
  { nt: true,
    w: ['Whether the tag is taken away when sight is lost is not known. An empty vehicle is not shot at.',
      'Снимается ли тег, когда цель пропала из вида, неизвестно. По пустой технике не стреляют.',
      'Чи знімається тег, коли ціль зникла з поля зору, невідомо. По порожній техніці не стріляють.',
      '目标离开视线后标签是否会被移除尚不清楚。空载具不会被射击。'] },
  { name: 'trig', spotter: [['Spotter tag', 'Тег наблюдателя', 'Тег спостерігача', '观察员标签']], player_tag: 'ptag',
    spotter_pair: [['Tag for the spotter', 'Тег для наблюдателя', 'Тег для спостерігача', '给观察员的标签']],
    spotted: [['Tag for the target', 'Тег для цели', 'Тег для цілі', '给目标的标签']], wait: [['Wait before fire', 'Пауза перед огнём', 'Пауза перед вогнем', '开火前等待']],
    battery: [['Battery tag', 'Тег батареи', 'Тег батареї', '炮兵标签']], spotted_2: 'same',
    burst: [['Burst length', 'Длина очереди', 'Довжина черги', '连射长度']] });

// 604
piece('mi.idea.commander_whose_death_changes_the_sq',
  ['Commander whose death changes the squad', 'Командир, чья гибель меняет отряд', 'Командир, чия загибель змінює загін', '指挥官阵亡会改变小队'],
  ['When the officer is dead, his squad gets new AI ratios: it pushes forward less and pulls back sooner.',
    'Когда офицер погиб, его отряд получает новые настройки ИИ: меньше наступает и раньше отходит.',
    'Коли офіцер загинув, його загін отримує нові налаштування ШІ: менше наступає й раніше відходить.',
    '军官阵亡后，他的小队获得新的 AI 比例：更少推进，更早撤退。'],
  { nt: true,
    w: ['In tests the effect of these ratios was weak.', 'В проверках эффект этих настроек был слабым.',
      'У перевірках ефект цих налаштувань був слабким.', '测试中这些比例的效果很弱。'] },
  { name: 'trig', officer: [['Officer tag', 'Тег офицера', 'Тег офіцера', '军官标签']], squad: [['Squad tag', 'Тег отряда', 'Тег загону', '小队标签']],
    advance: [['Advance ratio', 'Доля наступления', 'Частка наступу', '推进比例'],
      ['Stock missions use 0.1 to 2; lower means less pushing forward.', 'В миссиях игры от 0.1 до 2; меньше — реже наступает.',
        'У місіях гри від 0.1 до 2; менше — рідше наступає.', '游戏自带任务使用 0.1 到 2；越小越少推进。']],
    retreat: [['Retreat ratio', 'Доля отступления', 'Частка відступу', '撤退比例'],
      ['Stock missions use 1 or 2.', 'В миссиях игры 1 или 2.', 'У місіях гри 1 або 2.', '游戏自带任务使用 1 或 2。']] });

// 605
piece('mi.idea.night_falls_during_the_mission',
  ['Night falls during the mission', 'Ночь наступает во время миссии', 'Ніч настає під час місії', '任务中入夜'],
  ['Switches the map to another environment preset, such as a night one. Put it in the actions of a trigger that waits for a delayed event.',
    'Переключает карту на другую настройку окружения, например ночную. Вставьте в actions триггера, который ждёт отложенное событие.',
    'Перемикає мапу на інше налаштування оточення, наприклад нічне. Вставте в actions тригера, що чекає відкладену подію.',
    '把地图切换到另一个环境预设，例如夜晚。放进等待延时事件的触发器的 actions 里。'],
  { nt: true,
    w: ['Whether the change is instant or blends over time is not known.', 'Мгновенная ли смена или плавная, неизвестно.',
      'Чи зміна миттєва, чи плавна, невідомо.', '切换是瞬间完成还是逐渐过渡尚不清楚。'] },
  { preset: [['Environment preset', 'Настройка окружения', 'Налаштування оточення', '环境预设'],
    ['A preset name, as in {Environment "..."} at the top of a mission, for example multi/multi_10.',
      'Имя настройки, как в {Environment "..."} в начале миссии, например multi/multi_10.',
      "Ім'я налаштування, як у {Environment \"...\"} на початку місії, наприклад multi/multi_10.",
      '预设名称，与任务开头 {Environment "..."} 中的一样，例如 multi/multi_10。']] });

// 606
piece('mi.idea.fog_that_changes_sight_in_parts_of_t',
  ['Fog that changes sight in parts of the map', 'Туман, меняющий видимость в части карты', 'Туман, що змінює видимість у частині мапи', '改变地图局部视野的迷雾'],
  ['Turns the fog of war on or off in the sectors of one zone. No stock mission uses this command.',
    'Включает или выключает туман войны в секторах одной зоны. Ни одна миссия игры эту команду не использует.',
    'Вмикає чи вимикає туман війни в секторах однієї зони. Жодна місія гри цю команду не використовує.',
    '在一个区域的扇区内打开或关闭战争迷雾。游戏自带任务都没有使用这个命令。'],
  { nt: true,
    w: ['The engine clears the sectors when enable is not on, so which value hides and which shows must be tested.',
      'Движок очищает секторы, когда enable не on, поэтому какое значение прячет, а какое открывает, надо проверить.',
      'Рушій очищає сектори, коли enable не on, тож яке значення ховає, а яке відкриває, треба перевірити.',
      '当 enable 不是 on 时引擎会清除这些扇区，所以哪个值隐藏、哪个值显示需要测试。'] },
  { zone: 'zone', enable: [['Enable', 'Включить', 'Увімкнути', '启用'],
    ['on or off; see the watch-out note.', 'on или off; см. предупреждение.', 'on або off; див. застереження.', 'on 或 off；见注意事项。']] });

// 607
piece('mi.idea.surrender_when_a_group_is_broken',
  ['Surrender when a group is broken', 'Сдача, когда группа разбита', 'Здача, коли групу розбито', '小组溃散时投降'],
  ['When only a few men of the garrison are left alive, they drop their weapons and stop firing and moving.',
    'Когда в гарнизоне осталось в живых лишь несколько бойцов, они бросают оружие и перестают стрелять и двигаться.',
    'Коли в гарнізоні лишилося живими лише кілька бійців, вони кидають зброю й перестають стріляти та рухатися.',
    '当守军只剩下少数存活者时，他们丢下武器，停止射击和移动。'],
  { nt: true,
    w: ['An AI man with no weapon may still run or pick one up.', 'Боец ИИ без оружия может всё же убежать или подобрать оружие.',
      'Боєць ШІ без зброї може все ж утекти або підібрати зброю.', '没有武器的 AI 士兵仍可能逃跑或捡起武器。'] },
  { name: 'trig', garrison: [['Garrison tag', 'Тег гарнизона', 'Тег гарнізону', '守军标签']],
    left: [['Fewer men than', 'Бойцов меньше чем', 'Бійців менше ніж', '人数少于']], garrison_2: 'same', garrison_3: 'same' });

// 608
piece('mi.idea.king_of_the_hill_in_a_single_player',
  ['King of the hill in a single-player mission', 'Царь горы в одиночной миссии', 'Цар гори в одиночній місії', '单人任务中的山丘之王'],
  ['While your men hold the hill zone alone, a variable grows by 1 each second. When it reaches the time you set, the mission is won.',
    'Пока ваши бойцы одни держат зону холма, переменная растёт на 1 каждую секунду. Когда она дойдёт до заданного времени, миссия выиграна.',
    'Поки ваші бійці самі тримають зону пагорба, змінна росте на 1 щосекунди. Коли вона дійде до заданого часу, місію виграно.',
    '当只有你的士兵占据山丘区域时，变量每秒加 1。达到设定的时间后任务胜利。'],
  { nt: true,
    n: ['Declare the hill zone in Helpers and the time variable in Helpers vars.',
      'Объявите зону холма в Helpers и переменную времени в vars.',
      'Оголосіть зону пагорба в Helpers і змінну часу у vars.',
      '在 Helpers 中声明山丘区域，在 vars 中声明时间变量。'] },
  { name: 'trig', player_tag: 'ptag', hill: [['Hill zone', 'Зона холма', 'Зона пагорба', '山丘区域'], L.zone[1]], enemy: 'etag', hill_2: 'zone2',
    hill_time: [['Time variable', 'Переменная времени', 'Змінна часу', '时间变量'], L.var[1]], name_2: 'trig2',
    win_name: [['Win trigger name', 'Имя триггера победы', "Ім'я тригера перемоги", '胜利触发器名称']], hill_time_2: 'var2',
    hold: [['Seconds to hold', 'Сколько секунд держать', 'Скільки секунд тримати', '需要坚守的秒数']] });

// 609
piece('mi.idea.capture_a_flag_single_player',
  ['Capture a flag (single player)', 'Захват флага (одиночная игра)', 'Захоплення прапора (одиночна гра)', '夺旗（单人）'],
  ['When no enemy and some of your men are in the flag zone, the enemy flag goes down, your flag comes up and gets the captured tag. This is how stock missions take a flag.',
    'Когда в зоне флага нет врагов, но есть ваши бойцы, вражеский флаг опускается, ваш поднимается и получает тег captured. Так миссии игры берут флаг.',
    'Коли в зоні прапора немає ворогів, але є ваші бійці, ворожий прапор опускається, ваш піднімається й отримує тег captured. Так місії гри беруть прапор.',
    '当旗帜区域内没有敌人且有你的士兵时，敌方旗帜降下，你的旗帜升起并获得 captured 标签。游戏自带任务就是这样夺旗的。'],
  { n: ['Two flag objects in the zone with their own tags; the player one also tagged hidden. The flag zone is declared in Helpers.',
    'Два объекта флага в зоне со своими тегами; флаг игрока ещё с тегом hidden. Зона флага объявлена в Helpers.',
    'Два обʼєкти прапора в зоні зі своїми тегами; прапор гравця ще з тегом hidden. Зону прапора оголошено в Helpers.',
    '区域内有两个带各自标签的旗帜物体；玩家旗帜还带有 hidden 标签。旗帜区域在 Helpers 中声明。'] },
  { name: 'trig', enemy: 'etag', flag_zone: [['Flag zone', 'Зона флага', 'Зона прапора', '旗帜区域'], L.zone[1]], player_tag: 'ptag', flag_zone_2: 'zone2',
    flag_ai: [['Enemy flag tag', 'Тег вражеского флага', 'Тег ворожого прапора', '敌方旗帜标签']], flag_ai_2: 'same',
    flag_player: [['Your flag tag', 'Тег вашего флага', 'Тег вашого прапора', '你的旗帜标签']], flag_player_2: 'same', flag_player_3: 'same' });

// 610
piece('mi.idea.wave_survival_with_a_shop',
  ['Wave survival with a shop', 'Выживание против волн с магазином', 'Виживання проти хвиль із крамницею', '带商店的波次生存'],
  ['Each time a wave is cleared, the player gets points to spend in the reinforcement panel, which works as the shop. The trigger re-arms itself for the next wave.',
    'Каждый раз, когда волна отбита, игрок получает очки для панели подкреплений, которая служит магазином. Триггер снова взводит себя для следующей волны.',
    'Щоразу, коли хвилю відбито, гравець отримує очки для панелі підкріплень, що слугує крамницею. Тригер знову зводить себе для наступної хвилі.',
    '每当清除一波敌人，玩家获得可在增援面板中使用的分数，增援面板就是商店。触发器会为下一波重新启用自己。'],
  { nt: true, nmp: true,
    w: ['The panel is the single-player skirmish screen; how a bought card arrives is your own trigger on its eventStart.',
      'Панель — это экран одиночной схватки; как прибывает купленная карточка, решает ваш триггер на её eventStart.',
      'Панель — це екран одиночної сутички; як прибуває куплена картка, вирішує ваш тригер на її eventStart.',
      '该面板是单人遭遇战界面；购买的卡片如何到达由你自己针对其 eventStart 的触发器决定。'],
    n: ['A {reinforcements} block with the cards, a wave trigger of your own that sets the wave-cleared event, and the event declared in Helpers.',
      'Блок {reinforcements} с карточками, ваш триггер волны, который ставит событие «волна отбита», и это событие в Helpers.',
      'Блок {reinforcements} із картками, ваш тригер хвилі, що ставить подію «хвилю відбито», і ця подія в Helpers.',
      '一个带卡片的 {reinforcements} 块、你自己设置“波次已清除”事件的波次触发器，以及在 Helpers 中声明的该事件。'] },
  { name: 'trig', cleared: [['Wave cleared event', 'Событие «волна отбита»', 'Подія «хвилю відбито»', '波次清除事件'], L.event[1]], cleared_2: 'event2',
    score: [['Points per wave', 'Очки за волну', 'Очки за хвилю', '每波分数']], name_2: 'trig2' });

// 611
piece('mi.idea.bounty_for_each_enemy_killed',
  ['Bounty for each enemy killed', 'Награда за каждого убитого врага', 'Нагорода за кожного вбитого ворога', '每击杀一名敌人获得奖励'],
  ['Each time the count of dead enemies goes above the number already paid, the player gets points for the reinforcement panel and the paid count goes up by one.',
    'Каждый раз, когда число убитых врагов больше уже оплаченного, игрок получает очки для панели подкреплений, а счётчик оплаченных растёт на один.',
    'Щоразу, коли число вбитих ворогів більше за вже оплачене, гравець отримує очки для панелі підкріплень, а лічильник оплачених зростає на один.',
    '每当阵亡敌人数超过已支付的数量时，玩家获得增援面板分数，已支付计数加一。'],
  { nt: true, nmp: true,
    w: ['If dead bodies leave the count, it falls and kills stop paying until it rises again.',
      'Если тела убитых выпадают из счёта, он падает, и награды не идут, пока он снова не вырастет.',
      'Якщо тіла вбитих випадають із підрахунку, він падає, і нагороди не йдуть, доки він знову не зросте.',
      '如果尸体不再被计数，数量会下降，在再次上升前击杀不会获得奖励。'],
    n: ['Declare the paid-count variable in Helpers vars; the reinforcement panel must be in the mission.',
      'Объявите переменную оплаченных в vars; в миссии должна быть панель подкреплений.',
      'Оголосіть змінну оплачених у vars; у місії має бути панель підкріплень.',
      '在 vars 中声明已支付计数变量；任务中必须有增援面板。'] },
  { name: 'trig', enemy: 'etag', paid: [['Paid kills variable', 'Переменная оплаченных', 'Змінна оплачених', '已支付击杀变量'], L.var[1]], paid_2: 'var2',
    score: [['Points per kill', 'Очки за убийство', 'Очки за вбивство', '每次击杀分数']], name_2: 'trig2' });

// 612
piece('mi.idea.supply_drop_where_the_player_points',
  ['Supply drop where the player points', 'Сброс припасов туда, куда укажет игрок', 'Скидання припасів туди, куди вкаже гравець', '在玩家指定处空投补给'],
  ['The player places a card of the reinforcement panel on the map; its event comes, and after a short wait the object appears at the spot. Stock missions use this for bonus cards.',
    'Игрок ставит карточку панели подкреплений на карту; приходит её событие, и после короткой паузы объект появляется в этом месте. Так миссии игры делают бонусные карточки.',
    'Гравець ставить картку панелі підкріплень на мапу; надходить її подія, і після короткої паузи обʼєкт зʼявляється в цьому місці. Так місії гри роблять бонусні картки.',
    '玩家把增援面板中的一张卡片放到地图上；其事件发生后，短暂等待，物体出现在该位置。游戏自带任务的奖励卡就是这样做的。'],
  { nmp: true,
    n: ['A {reinforcements} card with {eventStart} set to this event and {waypoint} set to this waypoint (the game moves the waypoint to where the card is placed); the event and the waypoint declared in Helpers.',
      'Карточка в {reinforcements} с {eventStart} на это событие и {waypoint} на эту точку (игра переносит точку туда, где поставлена карточка); событие и точка объявлены в Helpers.',
      'Картка в {reinforcements} з {eventStart} на цю подію і {waypoint} на цю точку (гра переносить точку туди, де поставлено картку); подію й точку оголошено в Helpers.',
      '{reinforcements} 中的一张卡片，其 {eventStart} 设为此事件，{waypoint} 设为此路径点（游戏会把路径点移到卡片放置处）；事件和路径点在 Helpers 中声明。'] },
  { name: 'trig', called: [['Card event', 'Событие карточки', 'Подія картки', '卡片事件'], L.event[1]], wait: [['Wait before drop', 'Пауза перед сбросом', 'Пауза перед скиданням', '空投前等待']],
    entity: [['Object to drop', 'Сбрасываемый объект', "Об'єкт для скидання", '空投物体'],
      ['An object name from set/, for example a supply box.', 'Имя объекта из set/, например ящик снабжения.', "Ім'я об'єкта з set/, наприклад ящик постачання.", 'set/ 中的物体名称，例如补给箱。']],
    waypoint: [['Card waypoint', 'Точка карточки', 'Точка картки', '卡片路径点'], L.wp[1]] });

module.exports = rows;

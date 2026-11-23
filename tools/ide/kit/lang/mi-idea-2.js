// Code Pieces, group mi-idea-2: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-idea-2.js
// (ideas to try in mission files, numbers 613 to 635).
// Author: Imperator_Aug (ARSENAL, ia-a57dd9ed)
'use strict';

const K = 'ide.kit.p.mi.idea.';
const R = (id, suf, en, ru, uk, zh) => [K + id + suf, en, ru, uk, zh];
// shared field labels
const TRIG = id => R(id, '.f.trigger', 'Trigger name', 'Имя триггера', 'Назва тригера', '触发器名');
const ZONE = (id, n = 'zone') => R(id, '.f.' + n, 'Zone name', 'Имя зоны', 'Назва зони', '区域名');
const WP = (id, n = 'waypoint') => R(id, '.f.' + n, 'Waypoint name', 'Имя точки пути', 'Назва точки шляху', '路点名');

module.exports = [
  // 613
  R('player_called_air_strike', '', 'Player-called air strike', 'Авиаудар по вызову игрока', 'Авіаудар на виклик гравця', '玩家呼叫的空袭'),
  R('player_called_air_strike', '.d', 'A trigger that waits for an event and then sends a hidden plane to a waypoint, as the stock Bastogne mission does for its bonus strike. The plane flies on along the waypoint chain and attacks there. Not for multiplayer maps.',
    'Триггер ждёт событие и отправляет скрытый самолёт к точке пути, как в миссии Бастонь для бонусного удара. Дальше самолёт летит по цепочке точек и атакует. Не для сетевых карт.',
    'Тригер чекає на подію й відправляє прихований літак до точки шляху, як у місії Бастонь для бонусного удару. Далі літак летить ланцюжком точок і атакує. Не для мережевих мап.',
    '触发器等待一个事件，然后把一架隐藏的飞机送到路点，就像原版巴斯托涅任务的奖励空袭那样。飞机沿路点链继续飞行并在那里攻击。不适用于多人地图。'),
  R('player_called_air_strike', '.n', 'A hidden plane with the tag. In Helpers: the event, and the waypoint with a transition chain whose commands hold the air_attack (see bastogne waypoint "248"). Something must raise the event, for example a menu button.',
    'Скрытый самолёт с этим тегом. В Helpers: событие и точка пути с цепочкой transition, в командах которой есть air_attack (см. точку "248" в bastogne). Событие должно что-то вызвать, например кнопка меню.',
    'Прихований літак із цим тегом. У Helpers: подія й точка шляху з ланцюжком transition, у командах якого є air_attack (див. точку "248" у bastogne). Подію має щось викликати, наприклад кнопка меню.',
    '一架带此标签的隐藏飞机。Helpers 中需要：该事件，以及一个带 transition 链的路点，其 commands 中含 air_attack（见 bastogne 的路点 "248"）。必须有东西触发该事件，例如菜单按钮。'),
  TRIG('player_called_air_strike'),
  R('player_called_air_strike', '.f.event', 'Call event', 'Событие вызова', 'Подія виклику', '呼叫事件'),
  R('player_called_air_strike', '.f.plane', 'Plane tag', 'Тег самолёта', 'Тег літака', '飞机标签'),
  WP('player_called_air_strike'),
  R('player_called_air_strike', '.f.waypoint.h', 'Where the plane appears; the flight path starts here.', 'Где появляется самолёт; отсюда начинается маршрут.', 'Де з\'являється літак; звідси починається маршрут.', '飞机出现的位置；航线从这里开始。'),

  // 614
  R('hold_the_line_for_n_minutes', '', 'Hold the line for N minutes', 'Удержать рубеж N минут', 'Утримати рубіж N хвилин', '坚守防线 N 分钟'),
  R('hold_the_line_for_n_minutes', '.d', 'The lose half of a timed defence: if no living soldier of yours is left in the zone before the time-up event comes, the mission is lost. Not tried in game.',
    'Проигрышная половина обороны на время: если до события «время вышло» в зоне не осталось ни одного вашего живого солдата, миссия проиграна. Не проверено в игре.',
    'Програшна половина оборони на час: якщо до події «час вийшов» у зоні не лишилося жодного вашого живого солдата, місію програно. Не перевірено в грі.',
    '限时防守的失败部分：如果在“时间到”事件之前区域内已没有你的活着的士兵，任务失败。未在游戏中测试。'),
  R('hold_the_line_for_n_minutes', '.n', 'In Helpers: the zone and the event. At the start raise the event with a delay (an event command with delay), and add a second trigger that wins on it.',
    'В Helpers: зона и событие. В начале вызовите событие с задержкой (команда event с delay) и добавьте второй триггер, который даёт победу по нему.',
    'У Helpers: зона й подія. На початку викличте подію із затримкою (команда event з delay) і додайте другий тригер, що дає перемогу за нею.',
    'Helpers 中需要：该区域和该事件。开局时用带 delay 的 event 命令延时触发该事件，并再加一个在该事件上判定胜利的触发器。'),
  TRIG('hold_the_line_for_n_minutes'),
  R('hold_the_line_for_n_minutes', '.f.units', 'Your units tag', 'Тег ваших юнитов', 'Тег ваших юнітів', '己方单位标签'),
  ZONE('hold_the_line_for_n_minutes'),
  R('hold_the_line_for_n_minutes', '.f.event', 'Time-up event', 'Событие «время вышло»', 'Подія «час вийшов»', '“时间到”事件'),

  // 615
  R('escort_a_vip', '', 'Escort a VIP', 'Сопроводить важную персону', 'Супровід важливої особи', '护送要员'),
  R('escort_a_vip', '.d', 'The fail half of an escort: when the VIP is dead, the task fails and the mission is lost a few seconds later. Not tried in game.',
    'Проигрышная половина сопровождения: когда важная персона погибает, задача проваливается, и через несколько секунд миссия проиграна. Не проверено в игре.',
    'Програшна половина супроводу: коли важлива особа гине, завдання провалено, і за кілька секунд місію програно. Не перевірено в грі.',
    '护送的失败部分：要员死亡时任务失败，几秒后整个任务失败。未在游戏中测试。'),
  R('escort_a_vip', '.n', 'In Helpers: the task. A second trigger for the arrival (the VIP in a zone) wins; impregnability can keep him alive while a script moves him.',
    'В Helpers: задача. Второй триггер на прибытие (персона в зоне) даёт победу; impregnability может сберечь его, пока его ведёт скрипт.',
    'У Helpers: завдання. Другий тригер на прибуття (особа в зоні) дає перемогу; impregnability може вберегти його, поки його веде скрипт.',
    'Helpers 中需要：该任务。另一个判定到达（要员进入区域）的触发器给出胜利；脚本移动他时可用 impregnability 保护他。'),
  TRIG('escort_a_vip'),
  R('escort_a_vip', '.f.vip', 'VIP tag', 'Тег персоны', 'Тег особи', '要员标签'),
  R('escort_a_vip', '.f.task', 'Task name', 'Имя задачи', 'Назва завдання', '任务名'),
  R('escort_a_vip', '.f.wait', 'Seconds before the end', 'Секунд до конца', 'Секунд до кінця', '结束前的秒数'),

  // 616
  R('sniper_gives_himself_away_when_he_fi', '', 'Sniper gives himself away when he fires', 'Снайпер выдаёт себя выстрелом', 'Снайпер видає себе пострілом', '狙击手开枪暴露自己'),
  R('sniper_gives_himself_away_when_he_fi', '.d', 'Each time a shot is fired in the sniper\'s zone, the sniper is shown to the other side (discovered). The trigger resets itself, so it works again. Not tried in game.',
    'Каждый раз, когда в зоне снайпера звучит выстрел, снайпер становится виден другой стороне (discovered). Триггер сбрасывается сам и срабатывает снова. Не проверено в игре.',
    'Щоразу, коли в зоні снайпера лунає постріл, снайпер стає видимим іншій стороні (discovered). Тригер скидається сам і спрацьовує знову. Не перевірено в грі.',
    '每当狙击手所在区域内有枪声，狙击手就会暴露给另一方（discovered）。触发器会自动重置，可反复生效。未在游戏中测试。'),
  R('sniper_gives_himself_away_when_he_fi', '.n', 'In Helpers: a small zone around the sniper\'s nest.', 'В Helpers: небольшая зона вокруг позиции снайпера.', 'У Helpers: невелика зона навколо позиції снайпера.', 'Helpers 中需要：狙击点周围的一个小区域。'),
  R('sniper_gives_himself_away_when_he_fi', '.w', 'Any shot in the zone counts, also shots of other units there.', 'Считается любой выстрел в зоне, в том числе других юнитов.', 'Рахується будь-який постріл у зоні, зокрема інших юнітів.', '区域内的任何枪声都算，包括其他单位开的枪。'),
  TRIG('sniper_gives_himself_away_when_he_fi'),
  ZONE('sniper_gives_himself_away_when_he_fi'),
  R('sniper_gives_himself_away_when_he_fi', '.f.sniper', 'Sniper tag', 'Тег снайпера', 'Тег снайпера', '狙击手标签'),

  // 617
  R('warning_when_the_player_walks_into_a', '', 'Warning when the player walks into a minefield', 'Предупреждение о минном поле', 'Попередження про мінне поле', '玩家走进雷区时的警告'),
  R('warning_when_the_player_walks_into_a', '.d', 'A condition that is true when more than the given percent of the zone is covered with mines of this type. Put it in a trigger with a second condition for your units in the zone, and a talk command as the warning. Not tried in game.',
    'Условие истинно, когда зона заминирована минами этого типа больше, чем на заданный процент. Поставьте его в триггер вместе со вторым условием «ваши юниты в зоне» и командой talk как предупреждением. Не проверено в игре.',
    'Умова істинна, коли зону заміновано мінами цього типу більш ніж на заданий відсоток. Поставте її в тригер разом із другою умовою «ваші юніти в зоні» й командою talk як попередженням. Не перевірено в грі.',
    '当区域内此类地雷的覆盖超过给定百分比时，此条件为真。把它放进触发器，再加上“己方单位在区域内”的第二个条件，并用 talk 命令发出警告。未在游戏中测试。'),
  R('warning_when_the_player_walks_into_a', '.n', 'In Helpers: the zone over the minefield.', 'В Helpers: зона над минным полем.', 'У Helpers: зона над мінним полем.', 'Helpers 中需要：覆盖雷区的区域。'),
  R('warning_when_the_player_walks_into_a', '.w', 'It counts only mines of one owner: without a player line, mines with no owner (placed on the map). Add {player "1"} for mines laid by player 1.',
    'Считаются мины только одного владельца: без строки player — мины без владельца (поставленные на карте). Добавьте {player "1"} для мин игрока 1.',
    'Рахуються міни лише одного власника: без рядка player — міни без власника (поставлені на мапі). Додайте {player "1"} для мін гравця 1.',
    '只统计同一所有者的地雷：没有 player 行时统计无主地雷（地图上放置的）。要统计玩家 1 布的雷，请加上 {player "1"}。'),
  ZONE('warning_when_the_player_walks_into_a'),
  R('warning_when_the_player_walks_into_a', '.f.type', 'Mine type', 'Тип мин', 'Тип мін', '地雷类型'),
  R('warning_when_the_player_walks_into_a', '.f.infill', 'Mined percent', 'Процент минирования', 'Відсоток мінування', '布雷百分比'),
  R('warning_when_the_player_walks_into_a', '.f.infill.h', 'True when more of the zone than this is mined. Without this line the zone must be full.', 'Истинно, когда заминировано больше этой доли зоны. Без этой строки зона должна быть заполнена целиком.', 'Істинно, коли заміновано більше цієї частки зони. Без цього рядка зона має бути заповнена повністю.', '布雷比例超过此值时为真。没有这一行时区域必须完全布满。'),

  // 618
  R('engineers_lay_mines_then_the_plan_go', '', 'Engineers lay mines, then the plan goes on', 'Сапёры ставят мины, потом план идёт дальше', 'Сапери ставлять міни, потім план іде далі', '工兵布雷，然后计划继续'),
  R('engineers_lay_mines_then_the_plan_go', '.d', 'Orders the tagged engineers to mine a zone. When the order ends the event is raised, so a trigger on that event can start the next step. Not tried in game.',
    'Приказывает сапёрам с тегом заминировать зону. Когда приказ завершён, вызывается событие, и триггер по нему может начать следующий шаг. Не проверено в игре.',
    'Наказує саперам із тегом замінувати зону. Коли наказ виконано, викликається подія, і тригер за нею може почати наступний крок. Не перевірено в грі.',
    '命令带标签的工兵在区域内布雷。命令结束时触发事件，以该事件为条件的触发器即可开始下一步。未在游戏中测试。'),
  R('engineers_lay_mines_then_the_plan_go', '.n', 'In Helpers: the zone and the event. The engineers need mines in their inventory.', 'В Helpers: зона и событие. У сапёров в инвентаре должны быть мины.', 'У Helpers: зона й подія. У саперів в інвентарі мають бути міни.', 'Helpers 中需要：该区域和该事件。工兵的物品栏里要有地雷。'),
  R('engineers_lay_mines_then_the_plan_go', '.f.engineers', 'Engineers tag', 'Тег сапёров', 'Тег саперів', '工兵标签'),
  ZONE('engineers_lay_mines_then_the_plan_go'),
  R('engineers_lay_mines_then_the_plan_go', '.f.event', 'Done event', 'Событие «готово»', 'Подія «готово»', '完成事件'),

  // 619
  R('tank_engine_fails_at_a_random_moment', '', 'Tank engine fails at a random moment', 'Поломка танка в случайный момент', 'Поломка танка у випадковий момент', '坦克在随机时刻故障'),
  R('tank_engine_fails_at_a_random_moment', '.d', 'Waits a random time (centre and spread in seconds), then breaks one part of the tagged tank. Stock missions break the gun this way. Not tried in game.',
    'Ждёт случайное время (середина и разброс в секундах), потом ломает одну часть танка с тегом. В миссиях игры так ломают пушку. Не проверено в игре.',
    'Чекає випадковий час (середина й розкид у секундах), потім ламає одну частину танка з тегом. У місіях гри так ламають гармату. Не перевірено в грі.',
    '等待一段随机时间（中心值和浮动范围，单位秒），然后损坏带标签坦克的一个部件。原版任务用这种方式损坏火炮。未在游戏中测试。'),
  R('tank_engine_fails_at_a_random_moment', '.w', 'Part names depend on the vehicle: gun is used in stock missions, engine is not checked.', 'Имена частей зависят от техники: gun есть в миссиях игры, engine не проверен.', 'Назви частин залежать від техніки: gun є в місіях гри, engine не перевірено.', '部件名称取决于载具：gun 在原版任务中使用过，engine 未经验证。'),
  R('tank_engine_fails_at_a_random_moment', '.f.time', 'Average wait', 'Среднее ожидание', 'Середнє очікування', '平均等待'),
  R('tank_engine_fails_at_a_random_moment', '.f.spread', 'Random spread', 'Случайный разброс', 'Випадковий розкид', '随机浮动'),
  R('tank_engine_fails_at_a_random_moment', '.f.spread.h', 'How far the wait may move from the average, in seconds.', 'Насколько ожидание может отличаться от среднего, в секундах.', 'Наскільки очікування може відрізнятися від середнього, у секундах.', '等待时间可偏离平均值多少秒。'),
  R('tank_engine_fails_at_a_random_moment', '.f.tank', 'Tank tag', 'Тег танка', 'Тег танка', '坦克标签'),
  R('tank_engine_fails_at_a_random_moment', '.f.component', 'Part to break', 'Ломаемая часть', 'Частина, що ламається', '损坏的部件'),

  // 620
  R('burning_town_random_houses_catch_fir', '', 'Burning town: random houses catch fire', 'Горящий город: случайные дома загораются', 'Палаюче місто: випадкові будинки займаються', '燃烧的城镇：随机房屋起火'),
  R('burning_town_random_houses_catch_fir', '.d', 'Sets fire to a random house (or several) from the tagged ones. Repeat it with delays and the town burns house by house.',
    'Поджигает случайный дом (или несколько) из помеченных тегом. Повторяйте с задержками, и город загорается дом за домом.',
    'Підпалює випадковий будинок (або кілька) з позначених тегом. Повторюйте із затримками, і місто займається будинок за будинком.',
    '从带标签的房屋中随机点燃一座（或几座）。配合延时重复使用，城镇就会一座接一座地燃烧。'),
  R('burning_town_random_houses_catch_fir', '.f.amount', 'How many houses', 'Сколько домов', 'Скільки будинків', '房屋数量'),
  R('burning_town_random_houses_catch_fir', '.f.houses', 'Houses tag', 'Тег домов', 'Тег будинків', '房屋标签'),
  R('burning_town_random_houses_catch_fir', '.f.effect', 'Fire effect', 'Эффект огня', 'Ефект вогню', '火焰特效'),

  // 621
  R('radio_chatter_when_the_player_looks', '', 'Radio chatter when the player looks at a place', 'Радиопереговоры, когда игрок смотрит на место', 'Радіоперемовини, коли гравець дивиться на місце', '玩家看向某处时的无线电通话'),
  R('radio_chatter_when_the_player_looks', '.d', 'A condition that is true when the zone has been in the camera view for the given seconds. Put it in a trigger with a talk command. Not tried in game. Not for multiplayer maps.',
    'Условие истинно, когда зона заданное число секунд в поле зрения камеры. Поставьте его в триггер с командой talk. Не проверено в игре. Не для сетевых карт.',
    'Умова істинна, коли зона задану кількість секунд у полі зору камери. Поставте її в тригер із командою talk. Не перевірено в грі. Не для мережевих мап.',
    '当区域在镜头视野中停留指定秒数时，此条件为真。把它和 talk 命令一起放进触发器。未在游戏中测试。不适用于多人地图。'),
  R('radio_chatter_when_the_player_looks', '.n', 'In Helpers: the zone.', 'В Helpers: зона.', 'У Helpers: зона.', 'Helpers 中需要：该区域。'),
  R('radio_chatter_when_the_player_looks', '.w', 'It reads the local camera, so in a network game each player gets a different answer and the game goes out of step.', 'Оно читает локальную камеру, поэтому в сетевой игре у каждого игрока свой ответ, и игра рассинхронизируется.', 'Вона читає локальну камеру, тому в мережевій грі в кожного гравця своя відповідь, і гра розсинхронізується.', '它读取本地镜头，因此在联网游戏中每个玩家得到的结果不同，游戏会失去同步。'),
  ZONE('radio_chatter_when_the_player_looks'),
  R('radio_chatter_when_the_player_looks', '.f.appearance', 'How much is seen', 'Насколько видно', 'Наскільки видно', '可见程度'),
  R('radio_chatter_when_the_player_looks', '.f.time', 'Seconds in view', 'Секунд в поле зрения', 'Секунд у полі зору', '在视野中的秒数'),

  // 622
  R('truck_brings_reinforcements_and_unlo', '', 'Truck brings reinforcements and unloads', 'Грузовик привозит подкрепление и высаживает его', 'Вантажівка привозить підкріплення й висаджує його', '卡车运来援军并卸下'),
  R('truck_brings_reinforcements_and_unlo', '.d', 'Sends the tagged truck to a waypoint, dropping its old orders. An emit command in that waypoint\'s commands unloads the men, as in the stock tutorial.',
    'Отправляет грузовик с тегом к точке пути, отменяя прежние приказы. Команда emit в командах этой точки высаживает людей, как в обучении игры.',
    'Відправляє вантажівку з тегом до точки шляху, скасовуючи попередні накази. Команда emit у командах цієї точки висаджує людей, як у навчанні гри.',
    '把带标签的卡车派往一个路点，并取消它原来的命令。该路点 commands 中的 emit 命令会让士兵下车，与原版教程相同。'),
  R('truck_brings_reinforcements_and_unlo', '.n', 'In Helpers: the waypoint, with {commands {"emit" {waypoint "..."}}} where the men should get out.', 'В Helpers: точка пути с {commands {"emit" {waypoint "..."}}} там, где люди должны выйти.', 'У Helpers: точка шляху з {commands {"emit" {waypoint "..."}}} там, де люди мають вийти.', 'Helpers 中需要：该路点，并在士兵下车处写 {commands {"emit" {waypoint "..."}}}。'),
  R('truck_brings_reinforcements_and_unlo', '.f.truck', 'Truck tag', 'Тег грузовика', 'Тег вантажівки', '卡车标签'),
  WP('truck_brings_reinforcements_and_unlo'),

  // 623
  R('ammo_running_low_call', '', 'Ammo running low call', 'Сигнал «кончаются патроны»', 'Сигнал «закінчуються набої»', '弹药不足呼叫'),
  R('ammo_running_low_call', '.d', 'A condition on the inventory of the tagged team: true when they hold this many items with the tag or fewer. Use it to call for supply. Not tried in game.',
    'Условие по инвентарю команды с тегом: истинно, когда у них столько предметов с этим тегом или меньше. Используйте для вызова снабжения. Не проверено в игре.',
    'Умова за інвентарем команди з тегом: істинна, коли в них стільки предметів із цим тегом або менше. Використовуйте для виклику постачання. Не перевірено в грі.',
    '针对带标签小队物品栏的条件：当他们持有的带此标签物品不多于此数量时为真。可用来呼叫补给。未在游戏中测试。'),
  R('ammo_running_low_call', '.w', 'Item names are item tags of the game (stock missions use "bullet90" "ap" "ammo"). less means this amount or fewer.', 'Имена предметов — это теги предметов игры (в миссиях игры "bullet90" "ap" "ammo"). less значит это количество или меньше.', 'Назви предметів — це теги предметів гри (у місіях гри "bullet90" "ap" "ammo"). less означає цю кількість або менше.', '物品名是游戏中的物品标签（原版任务用 "bullet90" "ap" "ammo"）。less 表示不多于此数量。'),
  R('ammo_running_low_call', '.f.team', 'Team tag', 'Тег команды', 'Тег команди', '小队标签'),
  R('ammo_running_low_call', '.f.item', 'Item tags', 'Теги предмета', 'Теги предмета', '物品标签'),
  R('ammo_running_low_call', '.f.compare', 'Compare', 'Сравнение', 'Порівняння', '比较方式'),
  R('ammo_running_low_call', '.f.amount', 'Amount', 'Количество', 'Кількість', '数量'),

  // 624
  R('sound_the_alarm_siren_and_music', '', 'Sound the alarm (siren and music)', 'Тревога (сирена и музыка)', 'Тривога (сирена й музика)', '拉响警报（警笛和音乐）'),
  R('sound_the_alarm_siren_and_music', '.d', 'Plays a sound at a waypoint, so it is heard from that place. The default is the game\'s loud siren. Add a music command after it for alarm music. Not tried in game.',
    'Проигрывает звук в точке пути, и он слышен оттуда. По умолчанию — громкая сирена игры. Для тревожной музыки добавьте после него команду music. Не проверено в игре.',
    'Відтворює звук у точці шляху, і його чути звідти. Типово — гучна сирена гри. Для тривожної музики додайте після нього команду music. Не перевірено в грі.',
    '在路点处播放声音，声音从那里传出。默认是游戏的响亮警笛。如需警报音乐，可在其后加一条 music 命令。未在游戏中测试。'),
  R('sound_the_alarm_siren_and_music', '.n', 'In Helpers: the waypoint at the siren.', 'В Helpers: точка пути у сирены.', 'У Helpers: точка шляху біля сирени.', 'Helpers 中需要：警笛处的路点。'),
  R('sound_the_alarm_siren_and_music', '.f.sound', 'Siren sound', 'Звук сирены', 'Звук сирени', '警笛声音'),
  WP('sound_the_alarm_siren_and_music'),

  // 625
  R('player_choices_from_mission_options', '', 'Player choices from mission options', 'Выбор игрока через опции миссии', 'Вибір гравця через опції місії', '通过任务选项让玩家选择'),
  R('player_choices_from_mission_options', '.d', 'If the named mission option is on, the tagged units are deleted, for example the enemy tanks. Stock missions read options in trigger conditions; inside if it is not seen. Not tried in game.',
    'Если опция миссии с этим именем включена, юниты с тегом удаляются, например вражеские танки. Миссии игры читают опции в условиях триггеров; внутри if так не встречалось. Не проверено в игре.',
    'Якщо опцію місії з цією назвою ввімкнено, юніти з тегом видаляються, наприклад ворожі танки. Місії гри читають опції в умовах тригерів; усередині if так не траплялося. Не перевірено в грі.',
    '如果该名称的任务选项已开启，就删除带标签的单位，例如敌方坦克。原版任务在触发器条件中读取选项；在 if 中尚未见过。未在游戏中测试。'),
  R('player_choices_from_mission_options', '.n', 'The option must exist in the mission options the game is started with (mission_options).', 'Опция должна быть среди опций миссии, с которыми запущена игра (mission_options).', 'Опція має бути серед опцій місії, з якими запущено гру (mission_options).', '该选项必须存在于启动游戏时的任务选项（mission_options）中。'),
  R('player_choices_from_mission_options', '.f.option', 'Option name', 'Имя опции', 'Назва опції', '选项名'),
  R('player_choices_from_mission_options', '.f.units', 'Units tag', 'Тег юнитов', 'Тег юнітів', '单位标签'),

  // 626
  R('one_mission_different_armies', '', 'One mission, different armies', 'Одна миссия, разные армии', 'Одна місія, різні армії', '同一任务，不同军队'),
  R('one_mission_different_armies', '.d', 'If the player plays this army, the tagged extra units wake up (they start hidden). Use one block per army. Not tried in game.',
    'Если игрок играет за эту армию, помеченные дополнительные юниты оживают (в начале они скрыты). По одному блоку на армию. Не проверено в игре.',
    'Якщо гравець грає за цю армію, позначені додаткові юніти оживають (на початку вони приховані). По одному блоку на армію. Не перевірено в грі.',
    '如果玩家使用这支军队，带标签的额外单位就会激活（开局时它们是隐藏的）。每支军队一个块。未在游戏中测试。'),
  R('one_mission_different_armies', '.n', 'The extra units carry the tag hidden as well as their own tag.', 'У дополнительных юнитов есть тег hidden и свой тег.', 'Додаткові юніти мають тег hidden і свій тег.', '额外单位除了自己的标签外，还带有 hidden 标签。'),
  R('one_mission_different_armies', '.w', 'The army names (ger, usa and so on) are not checked against the game.', 'Имена армий (ger, usa и т. д.) не сверены с игрой.', 'Назви армій (ger, usa тощо) не звірено з грою.', '军队名称（ger、usa 等）未与游戏核对。'),
  R('one_mission_different_armies', '.f.army', 'Player army', 'Армия игрока', 'Армія гравця', '玩家军队'),
  R('one_mission_different_armies', '.f.units', 'Extra units tag', 'Тег доп. юнитов', 'Тег дод. юнітів', '额外单位标签'),

  // 627
  R('ally_turns_traitor_mid_mission', '', 'Ally turns traitor mid-mission', 'Союзник предаёт посреди миссии', 'Союзник зраджує посеред місії', '盟友在任务中途倒戈'),
  R('ally_turns_traitor_mid_mission', '.d', 'Moves the tagged soldiers to another player, for example the enemy (player 1 in single player). A stock mission moves units this way. Not tried in game.',
    'Передаёт солдат с тегом другому игроку, например врагу (игрок 1 в одиночной игре). Миссия игры так передаёт юнитов. Не проверено в игре.',
    'Передає солдатів із тегом іншому гравцеві, наприклад ворогові (гравець 1 в одиночній грі). Місія гри так передає юнітів. Не перевірено в грі.',
    '把带标签的士兵转给另一个玩家，例如敌方（单人游戏中的玩家 1）。原版任务就是这样转移单位的。未在游戏中测试。'),
  R('ally_turns_traitor_mid_mission', '.f.units', 'Traitors tag', 'Тег предателей', 'Тег зрадників', '叛徒标签'),
  R('ally_turns_traitor_mid_mission', '.f.player', 'New player number', 'Номер нового игрока', 'Номер нового гравця', '新玩家编号'),

  // 628
  R('hostages_safe_until_freed', '', 'Hostages safe until freed', 'Заложники неуязвимы до освобождения', 'Заручники невразливі до звільнення', '人质在获救前安全'),
  R('hostages_safe_until_freed', '.d', 'Sets how much harm the tagged hostages can take. Use full at the start so they cannot die, and disabled when they are freed so they are normal again.',
    'Задаёт, насколько уязвимы заложники с тегом. В начале поставьте full, чтобы они не погибли, а при освобождении disabled, чтобы они снова стали обычными.',
    'Задає, наскільки вразливі заручники з тегом. На початку поставте full, щоб вони не загинули, а при звільненні disabled, щоб вони знову стали звичайними.',
    '设置带标签人质可受的伤害。开局用 full 使他们不会死亡，获救时用 disabled 让他们恢复正常。'),
  R('hostages_safe_until_freed', '.f.hostages', 'Hostages tag', 'Тег заложников', 'Тег заручників', '人质标签'),
  R('hostages_safe_until_freed', '.f.mode', 'Protection', 'Защита', 'Захист', '保护方式'),
  R('hostages_safe_until_freed', '.f.mode.h', 'full: cannot be hurt; harmless: stock value, not checked; disabled: normal again.', 'full: неуязвим; harmless: значение игры, не проверено; disabled: снова обычный.', 'full: невразливий; harmless: значення гри, не перевірено; disabled: знову звичайний.', 'full：不会受伤；harmless：原版取值，未验证；disabled：恢复正常。'),

  // 629
  R('scout_on_the_hill_reveals_the_valley', '', 'Scout on the hill reveals the valley', 'Разведчик на холме открывает долину', 'Розвідник на пагорбі відкриває долину', '山上的侦察兵揭示山谷'),
  R('scout_on_the_hill_reveals_the_valley', '.d', 'Shows the tagged enemies inside the valley zone (discovered). Run it from a trigger that waits for your scout in the hill zone. Not tried in game.',
    'Показывает врагов с тегом в зоне долины (discovered). Запускайте из триггера, который ждёт вашего разведчика в зоне холма. Не проверено в игре.',
    'Показує ворогів із тегом у зоні долини (discovered). Запускайте з тригера, що чекає вашого розвідника в зоні пагорба. Не перевірено в грі.',
    '显示山谷区域内带标签的敌人（discovered）。从一个等待侦察兵进入山丘区域的触发器中运行它。未在游戏中测试。'),
  R('scout_on_the_hill_reveals_the_valley', '.n', 'In Helpers: the valley zone (and a hill zone for the trigger).', 'В Helpers: зона долины (и зона холма для триггера).', 'У Helpers: зона долини (і зона пагорба для тригера).', 'Helpers 中需要：山谷区域（以及触发器用的山丘区域）。'),
  ZONE('scout_on_the_hill_reveals_the_valley'),
  R('scout_on_the_hill_reveals_the_valley', '.f.enemy', 'Enemy tag', 'Тег врагов', 'Тег ворогів', '敌人标签'),

  // 630
  R('respawn_a_squad_at_the_last_held_fla', '', 'Respawn a squad at the last held flag', 'Возрождение отряда у последнего флага', 'Відродження загону біля останнього прапора', '在最后占领的旗点重生小队'),
  R('respawn_a_squad_at_the_last_held_fla', '.d', 'Reads a number variable that says which flag you hold last. For that flag a copy of one unit from the pool appears at its waypoint; else at the base. Add one case per flag. Not tried in game.',
    'Читает числовую переменную — какой флаг удержан последним. У этого флага появляется копия одного юнита из запаса; иначе — на базе. Добавьте по case на каждый флаг. Не проверено в игре.',
    'Читає числову змінну — який прапор утримано останнім. Біля цього прапора з\'являється копія одного юніта із запасу; інакше — на базі. Додайте по case на кожен прапор. Не перевірено в грі.',
    '读取一个数字变量，表示你最后占领的是哪面旗。对应旗点的路点处会出现备用池中一个单位的复制品；否则出现在基地。每面旗加一个 case。未在游戏中测试。'),
  R('respawn_a_squad_at_the_last_held_fla', '.n', 'In Helpers: the var (declared without $) and both waypoints. Flag triggers set the var when a flag is taken. Pool units are placed hidden on the map.',
    'В Helpers: переменная (объявлена без $) и обе точки пути. Триггеры флагов задают переменную при захвате. Юниты запаса стоят на карте скрытыми.',
    'У Helpers: змінна (оголошена без $) і обидві точки шляху. Тригери прапорів задають змінну при захопленні. Юніти запасу стоять на мапі прихованими.',
    'Helpers 中需要：该变量（声明时不带 $）和两个路点。旗点触发器在占领时设置该变量。备用单位隐藏放在地图上。'),
  R('respawn_a_squad_at_the_last_held_fla', '.f.var', 'Last flag variable', 'Переменная флага', 'Змінна прапора', '最后旗点变量'),
  R('respawn_a_squad_at_the_last_held_fla', '.f.value', 'Flag number', 'Номер флага', 'Номер прапора', '旗点编号'),
  R('respawn_a_squad_at_the_last_held_fla', '.f.pool', 'Pool tag', 'Тег запаса', 'Тег запасу', '备用池标签'),
  R('respawn_a_squad_at_the_last_held_fla', '.f.flag_wp', 'Flag waypoint', 'Точка у флага', 'Точка біля прапора', '旗点路点'),
  R('respawn_a_squad_at_the_last_held_fla', '.f.pool_2', 'Pool tag (base)', 'Тег запаса (база)', 'Тег запасу (база)', '备用池标签（基地）'),
  R('respawn_a_squad_at_the_last_held_fla', '.f.base_wp', 'Base waypoint', 'Точка базы', 'Точка бази', '基地路点'),

  // 631
  R('enemy_pressure_follows_the_player', '', 'Enemy pressure follows the player', 'Давление врага следует за игроком', 'Тиск ворога йде за гравцем', '敌军压力跟随玩家'),
  R('enemy_pressure_follows_the_player', '.d', 'When many of your soldiers stand in a zone, the enemy reserve is sent to that place. Make one trigger per zone. Not tried in game.',
    'Когда в зоне много ваших солдат, вражеский резерв посылается туда. Сделайте по триггеру на каждую зону. Не проверено в игре.',
    'Коли в зоні багато ваших солдатів, ворожий резерв посилається туди. Зробіть по тригеру на кожну зону. Не перевірено в грі.',
    '当某区域内有很多你的士兵时，敌方预备队会被派往那里。每个区域做一个触发器。未在游戏中测试。'),
  R('enemy_pressure_follows_the_player', '.n', 'In Helpers: the zone and the waypoint.', 'В Helpers: зона и точка пути.', 'У Helpers: зона й точка шляху.', 'Helpers 中需要：该区域和该路点。'),
  TRIG('enemy_pressure_follows_the_player'),
  R('enemy_pressure_follows_the_player', '.f.units', 'Your units tag', 'Тег ваших юнитов', 'Тег ваших юнітів', '己方单位标签'),
  ZONE('enemy_pressure_follows_the_player'),
  R('enemy_pressure_follows_the_player', '.f.count', 'Soldiers needed', 'Нужно солдат', 'Потрібно солдатів', '所需士兵数'),
  R('enemy_pressure_follows_the_player', '.f.reserve', 'Enemy reserve tag', 'Тег резерва врага', 'Тег резерву ворога', '敌方预备队标签'),
  WP('enemy_pressure_follows_the_player'),

  // 632
  R('hunt_the_tank_ace_objective_appears', '', 'Hunt the tank ace: objective appears when he is seen', 'Охота на танкового аса: цель появляется, когда его видят', 'Полювання на танкового аса: мета з\'являється, коли його бачать', '猎杀坦克王牌：发现他时出现目标'),
  R('hunt_the_tank_ace_objective_appears', '.d', 'A condition that is true when your tagged units can see the ace. Put it in a trigger whose task command shows the new objective. Not tried in game.',
    'Условие истинно, когда ваши юниты с тегом видят аса. Поставьте его в триггер, где команда task показывает новую цель. Не проверено в игре.',
    'Умова істинна, коли ваші юніти з тегом бачать аса. Поставте її в тригер, де команда task показує нову мету. Не перевірено в грі.',
    '当你带标签的单位能看到王牌时，此条件为真。把它放进一个用 task 命令显示新目标的触发器。未在游戏中测试。'),
  R('hunt_the_tank_ace_objective_appears', '.n', 'In Helpers: the task the trigger shows.', 'В Helpers: задача, которую показывает триггер.', 'У Helpers: завдання, яке показує тригер.', 'Helpers 中需要：触发器要显示的任务。'),
  R('hunt_the_tank_ace_objective_appears', '.f.units', 'Your units tag', 'Тег ваших юнитов', 'Тег ваших юнітів', '己方单位标签'),
  R('hunt_the_tank_ace_objective_appears', '.f.ace', 'Ace tag', 'Тег аса', 'Тег аса', '王牌标签'),

  // 633
  R('keep_units_between_missions', '', 'Keep units between missions', 'Сохранить юнитов между миссиями', 'Зберегти юнітів між місіями', '在任务之间保留单位'),
  R('keep_units_between_missions', '.d', 'Stores the tagged units in a named slot at the end of a mission; a load_units command with the same slot name in the next mission brings them back. Not tried in game. Not for multiplayer maps.',
    'Сохраняет юнитов с тегом в именованный слот в конце миссии; команда load_units с тем же именем слота в следующей миссии возвращает их. Не проверено в игре. Не для сетевых карт.',
    'Зберігає юнітів із тегом в іменований слот наприкінці місії; команда load_units з тією самою назвою слота в наступній місії повертає їх. Не перевірено в грі. Не для мережевих мап.',
    '在任务结束时把带标签的单位存入一个命名槽位；下一个任务中用同名槽位的 load_units 命令把他们带回。未在游戏中测试。不适用于多人地图。'),
  R('keep_units_between_missions', '.w', 'What is stored and where it comes back was not read in the engine.', 'Что именно сохраняется и где оно появится, в движке не прочитано.', 'Що саме зберігається і де воно з\'явиться, у рушії не прочитано.', '引擎中具体保存什么、在何处恢复尚未查明。'),
  R('keep_units_between_missions', '.f.units', 'Units tag', 'Тег юнитов', 'Тег юнітів', '单位标签'),
  R('keep_units_between_missions', '.f.slot', 'Slot name', 'Имя слота', 'Назва слота', '槽位名'),

  // 634
  R('ghost_town_that_springs_to_life', '', 'Ghost town that springs to life', 'Город-призрак оживает', 'Місто-привид оживає', '鬼城突然复苏'),
  R('ghost_town_that_springs_to_life', '.d', 'Wakes the first group of hidden units, waits, then wakes the second group, so the empty town fills step by step. Not tried in game.',
    'Оживляет первую группу скрытых юнитов, ждёт, потом оживляет вторую, и пустой город наполняется шаг за шагом. Не проверено в игре.',
    'Оживляє першу групу прихованих юнітів, чекає, потім оживляє другу, і порожнє місто наповнюється крок за кроком. Не перевірено в грі.',
    '激活第一组隐藏单位，等待，再激活第二组，空城就一步步热闹起来。未在游戏中测试。'),
  R('ghost_town_that_springs_to_life', '.n', 'The town units carry the tag hidden as well as their wave tag.', 'У юнитов города есть тег hidden и тег своей волны.', 'Юніти міста мають тег hidden і тег своєї хвилі.', '城镇单位除了波次标签外，还带有 hidden 标签。'),
  R('ghost_town_that_springs_to_life', '.f.wave1', 'First group tag', 'Тег первой группы', 'Тег першої групи', '第一组标签'),
  R('ghost_town_that_springs_to_life', '.f.wait', 'Seconds between', 'Секунд между', 'Секунд між', '间隔秒数'),
  R('ghost_town_that_springs_to_life', '.f.wave2', 'Second group tag', 'Тег второй группы', 'Тег другої групи', '第二组标签'),

  // 635
  R('player_takes_direct_control_of_one_t', '', 'Player takes direct control of one tank', 'Игрок берёт прямое управление танком', 'Гравець бере пряме керування танком', '玩家直接操控一辆坦克'),
  R('player_takes_direct_control_of_one_t', '.d', 'Switches to a third-person camera behind the tagged tank, locked to it, with the view limits of the stock Dison mission. Not for multiplayer maps.',
    'Включает камеру от третьего лица за танком с тегом, привязанную к нему, с пределами обзора как в миссии Дисон. Не для сетевых карт.',
    'Вмикає камеру від третьої особи за танком із тегом, прив\'язану до нього, з межами огляду як у місії Дісон. Не для мережевих мап.',
    '切换到带标签坦克后方的第三人称镜头并锁定在它身上，视角限制与原版 Dison 任务相同。不适用于多人地图。'),
  R('player_takes_direct_control_of_one_t', '.w', 'offest is the game\'s own spelling: keep it. Camera commands can crash network games.', 'offest — так пишет сама игра: не исправляйте. Команды камеры могут ронять сетевую игру.', 'offest — так пише сама гра: не виправляйте. Команди камери можуть валити мережеву гру.', 'offest 是游戏自身的拼写，请保留。镜头命令可能导致联网游戏崩溃。'),
  R('player_takes_direct_control_of_one_t', '.f.tank', 'Tank tag', 'Тег танка', 'Тег танка', '坦克标签'),
  R('player_takes_direct_control_of_one_t', '.f.bone', 'Camera bone', 'Кость камеры', 'Кістка камери', '镜头骨骼'),
  R('player_takes_direct_control_of_one_t', '.f.zoom', 'Max zoom out', 'Макс. отдаление', 'Макс. віддалення', '最大拉远'),
];

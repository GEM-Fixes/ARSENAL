// Code Pieces, group mi-lang-2: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-lang-2.js
// (mission language part 2: engine-only terms, unit selectors, filter terms, drop, first orders).
// Author: Imperator_Aug (ARSENAL, ia-513f2328)
'use strict';

const rows = [];
// one piece: id, title, does, watch (or null), fields { name: [en, ru, uk, zh] or [[label...], [hint...]] }
function piece(id, title, does, watch, fields) {
  const k = 'ide.kit.p.' + id;
  rows.push([k].concat(title), [k + '.d'].concat(does));
  if (watch) rows.push([k + '.w'].concat(watch));
  for (const [n, v] of Object.entries(fields || {})) {
    if (Array.isArray(v[0])) { rows.push([k + '.f.' + n].concat(v[0]), [k + '.f.' + n + '.h'].concat(v[1])); }
    else rows.push([k + '.f.' + n].concat(v));
  }
}

// shared field labels and hints
const NUM = [['Term number', 'Номер условия', 'Номер умови', '条件编号'],
  ['The number the trigger expression uses, as in "1 & 2".', 'Номер, который использует выражение триггера, например "1 & 2".',
    'Номер, який використовує вираз тригера, наприклад "1 & 2".', '触发器表达式使用的编号，例如 "1 & 2"。']];
const TAG = ['Unit tag', 'Тег юнита', 'Тег юніта', '单位标签'];
const ZONE = [['Zone name', 'Имя зоны', 'Назва зони', '区域名'],
  ['A zone of the map (Helpers).', 'Зона карты (Helpers).', 'Зона мапи (Helpers).', '地图中的区域（Helpers）。']];
const PLAYER = [['Side number', 'Номер стороны', 'Номер сторони', '阵营编号'],
  ['The player number of the side, as in {player "1"}.', 'Номер игрока стороны, как в {player "1"}.',
    'Номер гравця сторони, як у {player "1"}.', '该阵营的玩家编号，如 {player "1"}。']];
const RELATION = [['Relation', 'Отношение', 'Відношення', '关系'],
  ['Stock missions use only ally.', 'В миссиях игры встречается только ally.', 'У місіях гри трапляється лише ally.',
    '游戏自带任务只用 ally。']];
const WAYPOINT = [['Waypoint number', 'Номер точки пути', 'Номер точки шляху', '路径点编号'],
  ['A waypoint of the map (Helpers).', 'Точка пути карты (Helpers).', 'Точка шляху мапи (Helpers).', '地图中的路径点（Helpers）。']];
const PART = [['Part name', 'Имя части', 'Назва частини', '部件名'],
  ['A part of the vehicle, as its model names it. A * matches any ending.', 'Часть техники, как её называет модель. * подходит под любое окончание.',
    'Частина техніки, як її називає модель. * підходить під будь-яке закінчення.', '模型中的载具部件名。* 匹配任意结尾。']];
const MIDS = [['MID numbers', 'Номера MID', 'Номери MID', 'MID 编号'],
  ['The {MID N} numbers of units, split by spaces.', 'Номера {MID N} юнитов через пробел.', 'Номери {MID N} юнітів через пробіл.',
    '单位的 {MID N} 编号，用空格分隔。']];
const NT = ['Not tried in game.', 'В игре не проверено.', 'У грі не перевірено.', '未在游戏中测试。'];
const add = (a, b) => a.map((s, i) => s + ' ' + b[i]);

// ---- terms
piece('mi.t.linked', ['A unit is boarded on another', 'Юнит сидит в другом', 'Юніт сидить в іншому', '单位登上了另一单位'],
  add(['A condition term: true while a unit of the first tag is aboard a unit of the second tag (crew in a vehicle, men in a truck).',
    'Условие: истинно, пока юнит с первым тегом сидит в юните со вторым тегом (экипаж в технике, солдаты в грузовике).',
    'Умова: істинна, поки юніт з першим тегом сидить у юніті з другим тегом (екіпаж у техніці, солдати у вантажівці).',
    '条件项：当第一个标签的单位登上第二个标签的单位时为真（乘员在载具内，士兵在卡车上）。'], NT), null,
  { n: NUM, unit: ['Rider tag', 'Тег пассажира', 'Тег пасажира', '乘坐者标签'], host: ['Vehicle tag', 'Тег техники', 'Тег техніки', '载具标签'] });

piece('mi.t.mined', ['A zone is mined', 'Зона заминирована', 'Зону заміновано', '区域已布雷'],
  add(['A condition term: true when one side has laid mines over a zone. With infill, true once more than that percent of the zone is covered.',
    'Условие: истинно, когда сторона заминировала зону. С infill — когда покрыто больше этого процента зоны.',
    'Умова: істинна, коли сторона замінувала зону. З infill — коли вкрито більше цього відсотка зони.',
    '条件项：某一阵营在区域内布雷时为真。设置 infill 时，覆盖超过该百分比即为真。'], NT),
  ['Remove the infill line to ask for a fully mined zone.', 'Уберите строку infill, чтобы требовать полностью заминированную зону.',
    'Приберіть рядок infill, щоб вимагати повністю заміновану зону.', '删除 infill 行即要求整个区域布满地雷。'],
  { n: NUM, player: PLAYER, type: ['Mine type', 'Тип мин', 'Тип мін', '地雷类型'], zone: ZONE,
    infill: [['Percent covered', 'Процент покрытия', 'Відсоток покриття', '覆盖百分比'],
      ['0 to 100.', 'От 0 до 100.', 'Від 0 до 100.', '0 到 100。']] });

piece('mi.t.camera', ['Camera looks at a zone', 'Камера смотрит на зону', 'Камера дивиться на зону', '镜头对准区域'],
  add(['A condition term: true when the player\'s camera shows the zone (fully, partly or not at all) for the given seconds.',
    'Условие: истинно, когда камера игрока показывает зону (полностью, частично или совсем нет) заданное число секунд.',
    'Умова: істинна, коли камера гравця показує зону (повністю, частково або зовсім ні) задану кількість секунд.',
    '条件项：玩家镜头在给定秒数内显示该区域（完全、部分或完全不显示）时为真。'], NT),
  ['Always true in multiplayer and in replays.', 'В мультиплеере и в повторах всегда истинно.', 'У мультиплеєрі та в повторах завжди істинна.',
    '在多人游戏和回放中始终为真。'],
  { n: NUM, zone: ZONE, appearance: ['How much is seen', 'Насколько видно', 'Наскільки видно', '可见程度'],
    time: ['Seconds to hold', 'Секунд удерживать', 'Секунд утримувати', '保持秒数'],
    precision: [['Check speed', 'Скорость проверки', 'Швидкість перевірки', '检测速度'],
      ['low checks fastest, high slowest.', 'low проверяет быстрее всего, high медленнее всего.', 'low перевіряє найшвидше, high найповільніше.',
        'low 检测最快，high 最慢。']] });

piece('mi.t.arrival', ['Context unit passes a filter', 'Юнит контекста проходит фильтр', 'Юніт контексту проходить фільтр', '上下文单位通过筛选'],
  add(['A condition term: true when the unit the command runs for (a unit on a waypoint, for example) passes the include and exclude filters.',
    'Условие: истинно, когда юнит, для которого выполняется команда (например, юнит на точке пути), проходит фильтры include и exclude.',
    'Умова: істинна, коли юніт, для якого виконується команда (наприклад, юніт на точці шляху), проходить фільтри include і exclude.',
    '条件项：当命令所针对的单位（例如路径点上的单位）通过 include 和 exclude 筛选时为真。'], NT),
  ['In a plain trigger there is no such unit, so it stays false.', 'В обычном триггере такого юнита нет, и условие остаётся ложным.',
    'У звичайному тригері такого юніта немає, і умова лишається хибною.', '普通触发器中没有这样的单位，因此始终为假。'],
  { n: NUM, tag: TAG });

piece('mi.t.wp_canmove', ['Units are on a waypoint walk', 'Юниты идут по точкам пути', 'Юніти йдуть точками шляху', '单位正在沿路径点行进'],
  add(['A condition term: true while any unit of the tag is still walking a waypoint route.',
    'Условие: истинно, пока хоть один юнит с тегом ещё идёт по маршруту точек пути.',
    'Умова: істинна, поки хоч один юніт з тегом ще йде маршрутом точок шляху.',
    '条件项：只要该标签的任一单位仍在沿路径点路线行进即为真。'], NT), null,
  { n: NUM, tag: TAG });

piece('mi.t.obsolete', ['Old term form', 'Старая форма условия', 'Стара форма умови', '旧条件写法'],
  add(['The old way to write a term, straight in {condition}. The game still reads it but logs "Obsolete term format".',
    'Старый способ записи условия прямо в {condition}. Игра его ещё читает, но пишет в лог "Obsolete term format".',
    'Старий спосіб запису умови прямо в {condition}. Гра її ще читає, але пише в лог "Obsolete term format".',
    '旧的条件项写法，直接写在 {condition} 中。游戏仍能读取，但会在日志中写 "Obsolete term format"。'], NT),
  ['Use the {terms {"1.event" ...}} form in new missions.', 'В новых миссиях пишите в форме {terms {"1.event" ...}}.',
    'У нових місіях пишіть у формі {terms {"1.event" ...}}.', '新任务请使用 {terms {"1.event" ...}} 写法。'],
  { n: NUM, event: ['Event name', 'Имя события', 'Назва події', '事件名'] });

// ---- standard selector
const SELD = ['Goes in a unit selector ({selector}, {units}, {actors}).', 'Ставится в выбор юнитов ({selector}, {units}, {actors}).',
  'Ставиться у вибір юнітів ({selector}, {units}, {actors}).', '放在单位选择块中（{selector}、{units}、{actors}）。'];
piece('mi.s.tag', ['Pick units by tag', 'Выбрать юнитов по тегу', 'Вибрати юнітів за тегом', '按标签选择单位'],
  add(['Picks the units that carry this tag.', 'Выбирает юнитов с этим тегом.', 'Вибирає юнітів з цим тегом.', '选择带有该标签的单位。'], SELD), null,
  { tag: TAG });
piece('mi.s.zone', ['Pick units in a zone', 'Выбрать юнитов в зоне', 'Вибрати юнітів у зоні', '选择区域内的单位'],
  add(['Picks the units standing in the zone.', 'Выбирает юнитов, стоящих в зоне.', 'Вибирає юнітів, що стоять у зоні.', '选择站在该区域内的单位。'], SELD), null,
  { zone: ZONE });
piece('mi.s.type', ['Pick units by kind', 'Выбрать юнитов по виду', 'Вибрати юнітів за видом', '按类型选择单位'],
  add(['Keeps only men, cars, tanks or any vehicles.', 'Оставляет только людей, машины, танки или любую технику.',
    'Залишає лише людей, машини, танки або будь-яку техніку.', '只保留人员、汽车、坦克或任意载具。'], SELD), null,
  { type: ['Unit kind', 'Вид юнита', 'Вид юніта', '单位类型'] });
piece('mi.s.state', ['Pick units by state', 'Выбрать юнитов по состоянию', 'Вибрати юнітів за станом', '按状态选择单位'],
  add(['Keeps only units in this state, for example alive.', 'Оставляет только юнитов в этом состоянии, например живых.',
    'Залишає лише юнітів у цьому стані, наприклад живих.', '只保留处于该状态的单位，例如存活的。'], SELD),
  ['A killed vehicle never reads dead: test it with not moveable or not operatable.',
    'Уничтоженная техника никогда не считается dead: проверяйте её через not moveable или not operatable.',
    'Знищена техніка ніколи не вважається dead: перевіряйте її через not moveable або not operatable.',
    '被摧毁的载具永远不会读作 dead：请用 not moveable 或 not operatable 检测。'],
  { state: ['Unit state', 'Состояние юнита', 'Стан юніта', '单位状态'] });
piece('mi.s.player', ['Pick units by side', 'Выбрать юнитов по стороне', 'Вибрати юнітів за стороною', '按阵营选择单位'],
  add(['Keeps only units of this side.', 'Оставляет только юнитов этой стороны.', 'Залишає лише юнітів цієї сторони.', '只保留该阵营的单位。'], SELD),
  ['In multiplayer the side numbers of bots can change from game to game.', 'В мультиплеере номера сторон ботов могут меняться от игры к игре.',
    'У мультиплеєрі номери сторін ботів можуть змінюватися від гри до гри.', '多人游戏中机器人的阵营编号每局可能不同。'],
  { player: PLAYER });
piece('mi.s.relation', ['Pick units by relation', 'Выбрать юнитов по отношению', 'Вибрати юнітів за відношенням', '按关系选择单位'],
  add(['Keeps units that stand in this relation to the side named by {player}.', 'Оставляет юнитов, состоящих в этом отношении к стороне из {player}.',
    'Залишає юнітів, що перебувають у цьому відношенні до сторони з {player}.', '保留与 {player} 所指阵营具有该关系的单位。'], SELD),
  ['Read only when the selector also has a {player} line.', 'Читается, только если в выборе есть строка {player}.',
    'Читається, лише якщо у виборі є рядок {player}.', '只有选择块中同时有 {player} 行时才会读取。'],
  { relation: RELATION });
piece('mi.s.amount', ['How many units to pick', 'Сколько юнитов выбрать', 'Скільки юнітів вибрати', '选择多少单位'],
  add(['Picks only this many of the found units, at random.', 'Берёт из найденных юнитов только столько, случайно.',
    'Бере з знайдених юнітів лише стільки, випадково.', '从找到的单位中随机只取这么多个。'], SELD), null,
  { amount: ['Number of units', 'Число юнитов', 'Кількість юнітів', '单位数量'] });
piece('mi.s.mids', ['Pick units by MID', 'Выбрать юнитов по MID', 'Вибрати юнітів за MID', '按 MID 选择单位'],
  add(['Picks the units with these {MID N} numbers.', 'Выбирает юнитов с этими номерами {MID N}.', 'Вибирає юнітів з цими номерами {MID N}.',
    '选择带有这些 {MID N} 编号的单位。'], SELD),
  ['A number no unit holds picks nothing, with no log line.', 'Номер, которого нет ни у одного юнита, ничего не выбирает, без записи в лог.',
    'Номер, якого немає в жодного юніта, нічого не вибирає, без запису в лог.', '没有任何单位持有的编号什么也选不到，且不写日志。'],
  { mids: MIDS });
piece('mi.s.icbu', ['Include captured units', 'Включить захваченных юнитов', 'Включити захоплених юнітів', '包含被缴获的单位'],
  add(['Lets the selector also pick units the player has captured; by default they are left out.',
    'Позволяет выбору брать и юнитов, захваченных игроком; по умолчанию они пропускаются.',
    'Дозволяє вибору брати й юнітів, захоплених гравцем; за замовчуванням вони пропускаються.',
    '让选择块也能选中玩家缴获的单位；默认会排除它们。'], SELD), null, {});
piece('mi.s.source', ['Selector kind', 'Вид выбора', 'Вид вибору', '选择方式'],
  add(['Sets how the selector finds units: standart (plain fields) or advanced (groups with filters); waypoint and current take the unit the command runs for.',
    'Задаёт, как выбор ищет юнитов: standart (простые поля) или advanced (группы с фильтрами); waypoint и current берут юнита, для которого идёт команда.',
    'Задає, як вибір шукає юнітів: standart (прості поля) або advanced (групи з фільтрами); waypoint і current беруть юніта, для якого йде команда.',
    '设置选择块如何查找单位：standart（普通字段）或 advanced（带筛选的分组）；waypoint 和 current 取命令所针对的单位。'], SELD), null,
  { source: ['Selector kind', 'Вид выбора', 'Вид вибору', '选择方式'] });

// ---- advanced selector
piece('mi.s.group', ['Advanced unit group', 'Расширенная группа юнитов', 'Розширена група юнітів', '高级单位分组'],
  ['An advanced selector: gathers the units of a tag, keeps those in the zone and drops the dead. Add more filter lines to include or exclude.',
    'Расширенный выбор: собирает юнитов с тегом, оставляет тех, кто в зоне, и убирает мёртвых. Добавляйте строки фильтров в include или exclude.',
    'Розширений вибір: збирає юнітів з тегом, залишає тих, хто в зоні, і прибирає мертвих. Додавайте рядки фільтрів у include або exclude.',
    '高级选择：收集带标签的单位，保留区域内的，去掉阵亡的。可在 include 或 exclude 中添加更多筛选行。'],
  ['Part filters (broken_components, destroyed_components) work only here, not in a plain selector.',
    'Фильтры частей (broken_components, destroyed_components) работают только здесь, не в простом выборе.',
    'Фільтри частин (broken_components, destroyed_components) працюють лише тут, не в простому виборі.',
    '部件筛选（broken_components、destroyed_components）只在这里有效，普通选择中无效。'],
  { tag: TAG, zone: ZONE });
piece('mi.s.sort', ['Sort the picked units', 'Упорядочить выбранных юнитов', 'Упорядкувати вибраних юнітів', '对选中的单位排序'],
  ['Orders the found units by distance to a waypoint, so {amount} takes the nearest or farthest ones. Goes in an advanced selector.',
    'Упорядочивает найденных юнитов по расстоянию до точки пути, и {amount} берёт ближайших или дальних. Ставится в расширенный выбор.',
    'Упорядковує знайдених юнітів за відстанню до точки шляху, і {amount} бере найближчих або найдальших. Ставиться в розширений вибір.',
    '按到路径点的距离给找到的单位排序，让 {amount} 取最近或最远的。放在高级选择中。'],
  ['One {sort} per selector. Other forms: {type entity} {entity {tag t}} sorts by distance to a unit, {type shuffle} mixes them.',
    'Один {sort} на выбор. Другие формы: {type entity} {entity {tag t}} — по расстоянию до юнита, {type shuffle} — перемешать.',
    'Один {sort} на вибір. Інші форми: {type entity} {entity {tag t}} — за відстанню до юніта, {type shuffle} — перемішати.',
    '每个选择块只能有一个 {sort}。其他写法：{type entity} {entity {tag t}} 按到某单位的距离排序，{type shuffle} 打乱顺序。'],
  { waypoint: WAYPOINT, mode: ['Nearest or farthest', 'Ближние или дальние', 'Найближчі або найдальші', '最近或最远'] });
piece('mi.s.ex.zone_ex', ['More ways to gather units', 'Другие способы собрать юнитов', 'Інші способи зібрати юнітів', '更多收集单位的方式'],
  add(['Four gather lines for {select} of an advanced group: every object in a zone (not only units), the men of a squad, one object by id, the items units carry. Keep the line you need and delete the rest.',
    'Четыре строки сбора для {select} расширенной группы: все объекты в зоне (не только юниты), бойцы отряда, один объект по id, предметы у юнитов. Оставьте нужную строку, остальные удалите.',
    'Чотири рядки збору для {select} розширеної групи: усі об\'єкти в зоні (не лише юніти), бійці загону, один об\'єкт за id, предмети в юнітів. Залиште потрібний рядок, решту видаліть.',
    '用于高级分组 {select} 的四种收集行：区域内所有物体（不只是单位）、小队成员、按 id 取一个物体、单位携带的物品。保留需要的一行，删除其他行。'], NT), null,
  { zone: ZONE, squad: ['Squad name', 'Имя отряда', 'Назва загону', '小队名'],
    id: [['Object id', 'Id объекта', 'Id об\'єкта', '物体 id'],
      ['The hex id of the object in the map file, like 0xd000.', 'Шестнадцатеричный id объекта в файле карты, например 0xd000.',
        'Шістнадцятковий id об\'єкта у файлі мапи, наприклад 0xd000.', '地图文件中物体的十六进制 id，如 0xd000。']],
    tag: ['Carrier tag', 'Тег носителя', 'Тег носія', '携带者标签'] });

// ---- filter terms
const FD = ['Goes in {include} or {exclude} of an advanced group.', 'Ставится в {include} или {exclude} расширенной группы.',
  'Ставиться в {include} або {exclude} розширеної групи.', '放在高级分组的 {include} 或 {exclude} 中。'];
piece('mi.f.state', ['Filter by state', 'Фильтр по состоянию', 'Фільтр за станом', '按状态筛选'],
  add(['Matches units in this state. Put "not " before a state to turn it round.', 'Подходит юнитам в этом состоянии. "not " перед состоянием переворачивает его.',
    'Підходить юнітам у цьому стані. "not " перед станом перевертає його.', '匹配处于该状态的单位。在状态前加 "not " 表示相反。'], FD),
  ['not inactive does not drop an inactive unit; not chassis_work is true from the start; dead also matches a knocked-out man.',
    'not inactive не убирает неактивного юнита; not chassis_work истинно с самого начала; dead подходит и оглушённому бойцу.',
    'not inactive не прибирає неактивного юніта; not chassis_work істинне від самого початку; dead підходить і оглушеному бійцю.',
    'not inactive 不会排除未激活的单位；not chassis_work 从开局就为真；dead 也会匹配被击昏的士兵。'],
  { state: ['Unit state', 'Состояние юнита', 'Стан юніта', '单位状态'] });
piece('mi.f.tag', ['Filter by tag', 'Фильтр по тегу', 'Фільтр за тегом', '按标签筛选'],
  add(['Matches units that carry this tag.', 'Подходит юнитам с этим тегом.', 'Підходить юнітам з цим тегом.', '匹配带有该标签的单位。'], FD), null,
  { tag: TAG });
piece('mi.f.prop', ['Filter by kind', 'Фильтр по виду', 'Фільтр за видом', '按类型筛选'],
  add(['Matches men, creatures, cars, tanks or any vehicles.', 'Подходит людям, животным, машинам, танкам или любой технике.',
    'Підходить людям, тваринам, машинам, танкам або будь-якій техніці.', '匹配人员、生物、汽车、坦克或任意载具。'], FD), null,
  { prop: ['Unit kind', 'Вид юнита', 'Вид юніта', '单位类型'] });
piece('mi.f.player', ['Filter by side', 'Фильтр по стороне', 'Фільтр за стороною', '按阵营筛选'],
  add(['Matches units of this side.', 'Подходит юнитам этой стороны.', 'Підходить юнітам цієї сторони.', '匹配该阵营的单位。'], FD), null,
  { player: PLAYER });
piece('mi.f.zone', ['Filter by zone', 'Фильтр по зоне', 'Фільтр за зоною', '按区域筛选'],
  add(['Matches units standing in the zone.', 'Подходит юнитам, стоящим в зоне.', 'Підходить юнітам, що стоять у зоні.', '匹配站在该区域内的单位。'], FD), null,
  { zone: ZONE });
piece('mi.f.cover', ['Filter by cover', 'Фильтр по укрытию', 'Фільтр за укриттям', '按掩体筛选'],
  add(['Matches units sitting in this cover.', 'Подходит юнитам, сидящим в этом укрытии.', 'Підходить юнітам, що сидять у цьому укритті.',
    '匹配位于该掩体中的单位。'], FD), null,
  { cover: [['Cover name', 'Имя укрытия', 'Назва укриття', '掩体名'],
    ['A cover of the map (Helpers).', 'Укрытие карты (Helpers).', 'Укриття мапи (Helpers).', '地图中的掩体（Helpers）。']] });
piece('mi.f.relation', ['Filter by relation', 'Фильтр по отношению', 'Фільтр за відношенням', '按关系筛选'],
  add(['Matches units that stand in this relation to the given side.', 'Подходит юнитам, состоящим в этом отношении к заданной стороне.',
    'Підходить юнітам, що перебувають у цьому відношенні до заданої сторони.', '匹配与给定阵营具有该关系的单位。'], FD), null,
  { relation: RELATION, player: PLAYER });
piece('mi.f.broken', ['Filter by broken part', 'Фильтр по сломанной части', 'Фільтр за зламаною частиною', '按损坏部件筛选'],
  add(['Matches vehicles with this part damaged.', 'Подходит технике с повреждённой частью.', 'Підходить техніці з пошкодженою частиною.',
    '匹配该部件受损的载具。'], FD),
  ['A destroyed part also counts as broken.', 'Уничтоженная часть тоже считается сломанной.', 'Знищена частина теж вважається зламаною.',
    '被摧毁的部件也算作损坏。'],
  { part: PART });
piece('mi.f.destroyed', ['Filter by destroyed part', 'Фильтр по уничтоженной части', 'Фільтр за знищеною частиною', '按被摧毁部件筛选'],
  add(['Matches vehicles with this part destroyed.', 'Подходит технике с уничтоженной частью.', 'Підходить техніці зі знищеною частиною.',
    '匹配该部件被摧毁的载具。'], add(FD, NT)),
  ['As a kill test on guns and soft trucks it stayed silent in tests; use not inhabited or not operatable there.',
    'Как проверка уничтожения пушек и грузовиков в тестах не срабатывала; там используйте not inhabited или not operatable.',
    'Як перевірка знищення гармат і вантажівок у тестах не спрацьовувала; там використовуйте not inhabited або not operatable.',
    '作为火炮和软皮卡车的击毁检测，在测试中从未触发；这种情况请用 not inhabited 或 not operatable。'],
  { part: PART });
piece('mi.f.with_item', ['Filter by carried item', 'Фильтр по предмету', 'Фільтр за предметом', '按携带物品筛选'],
  add(['Matches units that carry at least this many of an item.', 'Подходит юнитам, у которых есть хотя бы столько этого предмета.',
    'Підходить юнітам, які мають щонайменше стільки цього предмета.', '匹配携带该物品不少于此数量的单位。'], FD),
  ['Other types: {type using} (holds it in hand) and {type existance} (has it at all).', 'Другие типы: {type using} (держит в руках) и {type existance} (есть вообще).',
    'Інші типи: {type using} (тримає в руках) і {type existance} (є взагалі).', '其他类型：{type using}（手持）和 {type existance}（拥有即可）。'],
  { item: [['Item tags', 'Теги предмета', 'Теги предмета', '物品标签'],
    ['The item\'s tags, each in quotes, like "bullet88" "ap" "ammo".', 'Теги предмета, каждый в кавычках, например "bullet88" "ap" "ammo".',
      'Теги предмета, кожен у лапках, наприклад "bullet88" "ap" "ammo".', '物品的标签，每个都加引号，如 "bullet88" "ap" "ammo"。']],
    min: ['Least amount', 'Наименьшее число', 'Найменша кількість', '最少数量'] });
piece('mi.f.mids', ['Filter by MID', 'Фильтр по MID', 'Фільтр за MID', '按 MID 筛选'],
  add(['Matches the units with these {MID N} numbers.', 'Подходит юнитам с этими номерами {MID N}.', 'Підходить юнітам з цими номерами {MID N}.',
    '匹配带有这些 {MID N} 编号的单位。'], FD), null,
  { mids: MIDS });
piece('mi.f.engine', ['More filters', 'Другие фильтры', 'Інші фільтри', '更多筛选'],
  add(['Four filters no stock mission uses: discovered by the enemy, an item lying on the ground, the unit\'s pose, the multiplayer team. Keep the line you need and delete the rest.',
    'Четыре фильтра, которых нет в миссиях игры: обнаружен врагом, предмет на земле, поза юнита, команда в мультиплеере. Оставьте нужную строку, остальные удалите.',
    'Чотири фільтри, яких немає в місіях гри: виявлений ворогом, предмет на землі, поза юніта, команда в мультиплеєрі. Залиште потрібний рядок, решту видаліть.',
    '四种游戏自带任务未用过的筛选：被敌人发现、地上的物品、单位姿势、多人游戏队伍。保留需要的一行，删除其他行。'], NT),
  ['team never matches in the map editor.', 'team никогда не срабатывает в редакторе карт.', 'team ніколи не спрацьовує в редакторі мап.',
    'team 在地图编辑器中从不匹配。'],
  { stuff: ['Item tag', 'Тег предмета', 'Тег предмета', '物品标签'], move: ['Unit pose', 'Поза юнита', 'Поза юніта', '单位姿势'],
    team: ['Team name', 'Имя команды', 'Назва команди', '队伍名'] });
piece('mi.s.drop', ['Drop current orders', 'Сбросить текущие приказы', 'Скинути поточні накази', '放弃当前命令'],
  ['Goes in a unit order: the units first drop what they were doing (orders), what they sensed (sensor) or both.',
    'Ставится в приказ юнитам: юниты сначала бросают то, что делали (orders), что заметили (sensor), или и то и другое.',
    'Ставиться в наказ юнітам: юніти спершу кидають те, що робили (orders), що помітили (sensor), або і те й інше.',
    '放在单位命令中：单位先放弃正在做的事（orders）、察觉到的情况（sensor）或两者。'], null,
  { drop: [['What to drop', 'Что сбросить', 'Що скинути', '放弃什么'],
    ['Several words go in quotes, like "orders sensor".', 'Несколько слов пишутся в кавычках, например "orders sensor".',
      'Кілька слів пишуться в лапках, наприклад "orders sensor".', '多个词需加引号，如 "orders sensor"。']] });

// ---- orders
piece('mi.c.waypoint', ['Move units along waypoints', 'Повести юнитов по точкам пути', 'Повести юнітів точками шляху', '让单位沿路径点移动'],
  ['Starts the tagged units on a waypoint route as one squad; they walk from point to point and run the points\' commands.',
    'Запускает юнитов с тегом по маршруту точек пути одним отрядом; они идут от точки к точке и выполняют команды точек.',
    'Запускає юнітів з тегом маршрутом точок шляху одним загоном; вони йдуть від точки до точки й виконують команди точок.',
    '让带标签的单位作为一个小队沿路径点路线出发；它们逐点行进并执行各点的命令。'],
  ['Stock missions often add {clone} and {approach "safe teleport & rotate"}: that sends a copy of inactive units instead, as reinforcements.',
    'В миссиях игры часто добавляют {clone} и {approach "safe teleport & rotate"}: тогда идёт копия неактивных юнитов, как подкрепление.',
    'У місіях гри часто додають {clone} і {approach "safe teleport & rotate"}: тоді йде копія неактивних юнітів, як підкріплення.',
    '游戏自带任务常加 {clone} 和 {approach "safe teleport & rotate"}：这样出发的是未激活单位的副本，用作增援。'],
  { tag: TAG, waypoint: WAYPOINT });
piece('mi.c.to_waypoint', ['Send units to a waypoint', 'Отправить юнитов к точке пути', 'Відправити юнітів до точки пути', '派单位前往路径点'],
  ['The living units of the tag drop their orders and go to the waypoint.', 'Живые юниты с тегом бросают приказы и идут к точке пути.',
    'Живі юніти з тегом кидають накази й ідуть до точки шляху.', '带该标签的存活单位放弃当前命令，前往路径点。'],
  ['A unit manning a gun or riding a vehicle refuses it. A waypoint missing from Helpers stops the order with a warning.',
    'Юнит за пушкой или в технике отказывается. Если точки пути нет в Helpers, приказ отменяется с предупреждением.',
    'Юніт біля гармати або в техніці відмовляється. Якщо точки шляху немає в Helpers, наказ скасовується з попередженням.',
    '操纵火炮或乘坐载具的单位会拒绝执行。路径点不在 Helpers 中时，命令会带警告取消。'],
  { tag: TAG, waypoint: WAYPOINT });
piece('mi.c.to_cover', ['Send units into cover', 'Отправить юнитов в укрытие', 'Відправити юнітів в укриття', '派单位进入掩体'],
  ['The living men of the tag drop their orders and take the named covers, picked at random or the best one.',
    'Живые бойцы с тегом бросают приказы и занимают названные укрытия, случайно или лучшее.',
    'Живі бійці з тегом кидають накази й займають названі укриття, випадково або найкраще.',
    '带该标签的存活士兵放弃当前命令，进入指定掩体，随机或选最佳。'], null,
  { tag: TAG, mode: ['How to pick', 'Как выбирать', 'Як вибирати', '选择方式'],
    covers: [['Cover names', 'Имена укрытий', 'Назви укриттів', '掩体名'],
      ['Covers of the map (Helpers), split by spaces.', 'Укрытия карты (Helpers) через пробел.', 'Укриття мапи (Helpers) через пробіл.',
        '地图中的掩体（Helpers），用空格分隔。']] });

module.exports = rows;

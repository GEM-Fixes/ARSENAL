// Code Pieces, group mi-start-2: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-start-2.js
// (top blocks and placement keys of mission files). Field labels shared by many pieces come from the table L below.
// Author: Imperator_Aug (ARSENAL, ia-08dd9088)
'use strict';

// shared field labels [en, ru, uk, zh] and hints
const L = {
  id: ['Object id', 'Id объекта', 'Id обʼєкта', '对象 id'],
  idH: ['A hex number like 0x80d6, unused anywhere else in this file.', 'Шестнадцатеричное число вроде 0x80d6, не занятое больше нигде в этом файле.', 'Шістнадцяткове число на кшталт 0x80d6, не зайняте більше ніде в цьому файлі.', '形如 0x80d6 的十六进制数，在本文件其他地方未被使用。'],
  unitId: ['Unit id', 'Id юнита', 'Id юніта', '单位 id'],
  unitIdH: ['The id written after the name of the placed unit (0x...).', 'Id, записанный после имени поставленного юнита (0x...).', 'Id, записаний після імені поставленого юніта (0x...).', '已放置单位名称后写的 id（0x...）。'],
  x: ['X position', 'Координата X', 'Координата X', 'X 坐标'],
  y: ['Y position', 'Координата Y', 'Координата Y', 'Y 坐标'],
  xyH: ['Map units, 20 per metre. Copy it from the map editor.', 'Единицы карты, 20 на метр. Скопируйте из редактора карт.', 'Одиниці мапи, 20 на метр. Скопіюйте з редактора мап.', '地图单位，每米 20。可从地图编辑器复制。'],
  angle: ['Turn angle', 'Угол поворота', 'Кут повороту', '朝向角度'],
  angleH: ['Degrees, where the object faces.', 'Градусы: куда смотрит объект.', 'Градуси: куди дивиться обʼєкт.', '角度，对象朝向的方向。'],
  player: ['Side number', 'Номер стороны', 'Номер сторони', '阵营编号'],
  playerH: ['The side that owns it, as numbered in the Players block. 0 = neutral.', 'Сторона-владелец, по номерам блока Players. 0 = нейтральная.', 'Сторона-власник, за номерами блоку Players. 0 = нейтральна.', '拥有它的阵营，编号与 Players 块一致。0 = 中立。'],
  mid: ['Mission number (MID)', 'Номер в миссии (MID)', 'Номер у місії (MID)', '任务编号（MID）'],
  midH: ['A number unique in this file; scripts can pick the object by it.', 'Число, уникальное в этом файле; скрипты могут выбрать объект по нему.', 'Число, унікальне в цьому файлі; скрипти можуть вибрати обʼєкт за ним.', '在本文件中唯一的数字；脚本可以凭它选中对象。'],
  name: ['Name', 'Имя', 'Імʼя', '名称'],
  phase: ['Phase', 'Фаза', 'Фаза', '阶段'],
  phaseH: ['Stock maps use 0.', 'На картах игры стоит 0.', 'На мапах гри стоїть 0.', '游戏自带地图使用 0。'],
  order: ['Order', 'Порядок', 'Порядок', '顺序'],
  orderH: ['1, 2, 3 ... one number per point of the same team.', '1, 2, 3 ... свой номер у каждой точки одной команды.', '1, 2, 3 ... свій номер у кожної точки однієї команди.', '1、2、3……同一队伍的每个点各用一个编号。'],
};
const F = (id, f, key, hint) => {
  const r = [['ide.kit.p.' + id + '.f.' + f].concat(L[key])];
  if (hint) r.push(['ide.kit.p.' + id + '.f.' + f + '.h'].concat(L[hint]));
  return r;
};
const POS = id => [].concat(F(id, 'x', 'x', 'xyH'), F(id, 'y', 'y', 'xyH'));
const rows = [];
const add = (...r) => { for (const x of r) { if (Array.isArray(x[0])) rows.push(...x); else rows.push(x); } };

// 307
add(['ide.kit.p.mi.top.mission', 'Mission root block', 'Корневой блок миссии', 'Кореневий блок місії', '任务根块'],
  ['ide.kit.p.mi.top.mission.d', 'The one block that holds a whole .mi file. Everything else in the file goes inside it.',
    'Единственный блок, в котором лежит весь файл .mi. Всё остальное в файле пишется внутри него.',
    'Єдиний блок, у якому лежить увесь файл .mi. Усе інше у файлі пишеться всередині нього.',
    '容纳整个 .mi 文件的唯一一个块。文件中的其他内容都写在它里面。'],
  ['ide.kit.p.mi.top.mission.w', 'Write it once per file. A second {mission} block in the same file is not read as you expect.',
    'Пишите его один раз на файл. Второй блок {mission} в том же файле читается не так, как ждёшь.',
    'Пишіть його один раз на файл. Другий блок {mission} у тому ж файлі читається не так, як очікуєш.',
    '每个文件只写一次。同一文件中的第二个 {mission} 块不会按你预期的方式读取。']);

// 308
add(['ide.kit.p.mi.entity', 'Place a unit or object', 'Поставить юнит или объект', 'Поставити юніт або обʼєкт', '放置单位或物体'],
  ['ide.kit.p.mi.entity.d', 'Puts one vehicle, gun or object on the map at the start of the mission, with its side and mission number.',
    'Ставит на карту одну машину, орудие или объект в начале миссии, со стороной и номером в миссии.',
    'Ставить на мапу одну машину, гармату або обʼєкт на початку місії, зі стороною та номером у місії.',
    '在任务开始时把一辆载具、一门炮或一个物体放到地图上，并给出阵营和任务编号。'],
  ['ide.kit.p.mi.entity.w', 'Leave the Player line off buildings, trees and props: it crashes the load. A vehicle placed this way starts with no crew (seat men with Link). Without a third Position number the object snaps to the ground.',
    'Не пишите строку Player у зданий, деревьев и декора: загрузка падает. Машина, поставленная так, стоит без экипажа (сажайте людей через Link). Без третьего числа в Position объект встаёт на землю.',
    'Не пишіть рядок Player у будівель, дерев і декору: завантаження падає. Машина, поставлена так, стоїть без екіпажу (саджайте людей через Link). Без третього числа в Position обʼєкт стає на землю.',
    '不要给建筑、树木和装饰物写 Player 行：会导致加载崩溃。这样放置的载具没有乘员（用 Link 安排人员）。Position 没有第三个数字时，物体贴在地面上。'],
  ['ide.kit.p.mi.entity.f.def', 'Object name', 'Имя объекта', 'Імʼя обʼєкта', '对象名称'],
  ['ide.kit.p.mi.entity.f.def.h', 'The entity name from the game files, like sdkfz251_1 or pak36.', 'Имя сущности из файлов игры, например sdkfz251_1 или pak36.', 'Імʼя сутності з файлів гри, наприклад sdkfz251_1 або pak36.', '游戏文件中的实体名称，例如 sdkfz251_1 或 pak36。'],
  F('mi.entity', 'id', 'id', 'idH'), POS('mi.entity'), F('mi.entity', 'angle', 'angle', 'angleH'),
  F('mi.entity', 'player', 'player', 'playerH'), F('mi.entity', 'mid', 'mid', 'midH'));

// 309
add(['ide.kit.p.mi.human', 'Place a soldier', 'Поставить солдата', 'Поставити солдата', '放置士兵'],
  ['ide.kit.p.mi.human.d', 'Puts one soldier on the map at the start of a single-player mission, with his side and mission number.',
    'Ставит на карту одного солдата в начале одиночной миссии, со стороной и номером в миссии.',
    'Ставить на мапу одного солдата на початку одиночної місії, зі стороною та номером у місії.',
    '在单人任务开始时把一名士兵放到地图上，并给出阵营和任务编号。'],
  ['ide.kit.p.mi.human.w', 'Stock files use Human placements only in single-player missions.',
    'В файлах игры Human ставится только в одиночных миссиях.',
    'У файлах гри Human ставиться лише в одиночних місіях.',
    '游戏自带文件只在单人任务中使用 Human 放置。'],
  ['ide.kit.p.mi.human.f.breed', 'Soldier type', 'Тип солдата', 'Тип солдата', '士兵类型'],
  ['ide.kit.p.mi.human.f.breed.h', 'A breed path like mp/usa/rifle or mp/ger/smg.', 'Путь породы, например mp/usa/rifle или mp/ger/smg.', 'Шлях породи, наприклад mp/usa/rifle або mp/ger/smg.', '兵种路径，例如 mp/usa/rifle 或 mp/ger/smg。'],
  F('mi.human', 'id', 'id', 'idH'), POS('mi.human'), F('mi.human', 'angle', 'angle', 'angleH'),
  F('mi.human', 'player', 'player', 'playerH'), F('mi.human', 'mid', 'mid', 'midH'));

// 310
add(['ide.kit.p.mi.spawnpoint', 'Team spawn point', 'Точка появления команды', 'Точка появи команди', '队伍出生点'],
  ['ide.kit.p.mi.spawnpoint.d', 'A spawn point for team a or b in a multiplayer mode file. Players of that team enter the battle here.',
    'Точка появления команды a или b в файле режима сетевой игры. Игроки этой команды входят в бой здесь.',
    'Точка появи команди a або b у файлі режиму мережевої гри. Гравці цієї команди входять у бій тут.',
    '多人模式文件中 a 队或 b 队的出生点。该队玩家从这里进入战斗。'],
  ['ide.kit.p.mi.spawnpoint.w', 'Each mode file (combat.mi, battle_zones.mi ...) has its own spawn points: add them to every mode the map offers.',
    'У каждого файла режима (combat.mi, battle_zones.mi ...) свои точки появления: добавьте их в каждый режим карты.',
    'Кожен файл режиму (combat.mi, battle_zones.mi ...) має свої точки появи: додайте їх у кожен режим мапи.',
    '每个模式文件（combat.mi、battle_zones.mi……）都有自己的出生点：请在地图提供的每个模式中都添加。'],
  F('mi.spawnpoint', 'id', 'id', 'idH'), POS('mi.spawnpoint'), F('mi.spawnpoint', 'angle', 'angle', 'angleH'),
  ['ide.kit.p.mi.spawnpoint.f.name', 'Point name', 'Имя точки', 'Імʼя точки', '点名称'],
  ['ide.kit.p.mi.spawnpoint.f.name.h', 'Stock maps use the team letter and the order: a1, a2, b1 ...', 'На картах игры это буква команды и порядок: a1, a2, b1 ...', 'На мапах гри це літера команди й порядок: a1, a2, b1 ...', '游戏自带地图使用队伍字母加顺序：a1、a2、b1……'],
  ['ide.kit.p.mi.spawnpoint.f.team', 'Team', 'Команда', 'Команда', '队伍'],
  F('mi.spawnpoint', 'phase', 'phase', 'phaseH'), F('mi.spawnpoint', 'order', 'order', 'orderH'),
  F('mi.spawnpoint', 'mid', 'mid', 'midH'));

// 311
add(['ide.kit.p.mi.flagpoint', 'Flag point (battle_zones)', 'Точка флага (battle_zones)', 'Точка прапора (battle_zones)', '旗帜点（battle_zones）'],
  ['ide.kit.p.mi.flagpoint.d', 'A flag that teams capture in the battle_zones mode, with its capture radius for each team.',
    'Флаг, который команды захватывают в режиме battle_zones, с радиусом захвата для каждой команды.',
    'Прапор, який команди захоплюють у режимі battle_zones, з радіусом захоплення для кожної команди.',
    'battle_zones 模式中各队争夺的旗帜，并为每个队伍设定占领半径。'],
  ['ide.kit.p.mi.flagpoint.w', 'Most stock maps have one flag more than the player count. Give every flag its own name (f1, f2 ...).',
    'На большинстве карт игры флагов на один больше, чем игроков. Дайте каждому флагу своё имя (f1, f2 ...).',
    'На більшості мап гри прапорів на один більше, ніж гравців. Дайте кожному прапору своє імʼя (f1, f2 ...).',
    '大多数游戏自带地图的旗帜数比玩家数多一个。给每面旗帜起不同的名字（f1、f2……）。'],
  ['ide.kit.p.mi.flagpoint.f.def', 'Flag object', 'Объект флага', 'Обʼєкт прапора', '旗帜对象'],
  F('mi.flagpoint', 'id', 'id', 'idH'), POS('mi.flagpoint'),
  ['ide.kit.p.mi.flagpoint.f.name', 'Flag name', 'Имя флага', 'Імʼя прапора', '旗帜名称'],
  ['ide.kit.p.mi.flagpoint.f.zone_a', 'Capture radius A', 'Радиус захвата A', 'Радіус захоплення A', 'A 队占领半径'],
  ['ide.kit.p.mi.flagpoint.f.zone_a.h', 'In metres, for team a. Stock flags use 12.', 'В метрах, для команды a. У флагов игры 12.', 'У метрах, для команди a. У прапорів гри 12.', '单位为米，用于 a 队。游戏自带旗帜用 12。'],
  ['ide.kit.p.mi.flagpoint.f.zone_b', 'Capture radius B', 'Радиус захвата B', 'Радіус захоплення B', 'B 队占领半径'],
  ['ide.kit.p.mi.flagpoint.f.zone_b.h', 'In metres, for team b. Stock flags use 12.', 'В метрах, для команды b. У флагов игры 12.', 'У метрах, для команди b. У прапорів гри 12.', '单位为米，用于 b 队。游戏自带旗帜用 12。'],
  F('mi.flagpoint', 'phase', 'phase', 'phaseH'), F('mi.flagpoint', 'order', 'order', 'orderH'),
  F('mi.flagpoint', 'mid', 'mid', 'midH'));

// 312
add(['ide.kit.p.mi.tag', 'Name a placed object for scripts', 'Дать объекту имя для скриптов', 'Дати обʼєкту імʼя для скриптів', '为放置的对象起脚本用的名字'],
  ['ide.kit.p.mi.tag.d', 'Gives one placed object one or more tags. Triggers then find it with {tag name} in a selector.',
    'Даёт поставленному объекту один или несколько тегов. Потом триггеры находят его через {tag имя} в селекторе.',
    'Дає поставленому обʼєкту один або кілька тегів. Потім тригери знаходять його через {tag імʼя} у селекторі.',
    '给一个已放置的对象加上一个或多个标签。之后触发器可在选择器中用 {tag 名称} 找到它。'],
  ['ide.kit.p.mi.tag.w', 'Write it after the placements, at the mission level. Remove the second tag if you need only one.',
    'Пишите после размещений, на уровне миссии. Уберите второй тег, если нужен один.',
    'Пишіть після розміщень, на рівні місії. Приберіть другий тег, якщо потрібен один.',
    '写在放置内容之后、任务层级中。只需要一个标签时删掉第二个。'],
  ['ide.kit.p.mi.tag.f.tag', 'Tag', 'Тег', 'Тег', '标签'],
  ['ide.kit.p.mi.tag.f.tag2', 'Second tag', 'Второй тег', 'Другий тег', '第二个标签'],
  F('mi.tag', 'id', 'unitId', 'unitIdH'));

// 313
add(['ide.kit.p.mi.brain', 'Starting AI state of a unit', 'Начальное состояние ИИ юнита', 'Початковий стан ШІ юніта', '单位的初始 AI 状态'],
  ['ide.kit.p.mi.brain.d', 'Sets who controls a placed unit at start and how it moves: hold its place, move freely or keep to a zone.',
    'Задаёт, кто управляет поставленным юнитом в начале и как он движется: стоит на месте, ходит свободно или держится зоны.',
    'Задає, хто керує поставленим юнітом на початку і як він рухається: стоїть на місці, ходить вільно або тримається зони.',
    '设定开局时由谁控制已放置的单位以及它如何移动：原地不动、自由移动或留在区域内。'],
  F('mi.brain', 'id', 'unitId', 'unitIdH'),
  ['ide.kit.p.mi.brain.f.control', 'Controlled by', 'Кто управляет', 'Хто керує', '控制者'],
  ['ide.kit.p.mi.brain.f.control.h', 'user = the player, AI = the computer.', 'user = игрок, AI = компьютер.', 'user = гравець, AI = компʼютер.', 'user = 玩家，AI = 电脑。'],
  ['ide.kit.p.mi.brain.f.move', 'Move mode', 'Режим движения', 'Режим руху', '移动方式']);

// 314
add(['ide.kit.p.mi.inventory', 'Starting kit of a placed unit', 'Начальное снаряжение юнита', 'Початкове спорядження юніта', '已放置单位的初始装备'],
  ['ide.kit.p.mi.inventory.d', 'Empties the bag of a placed unit and fills it with the items you name: one in a bag cell, a hat on the head.',
    'Опустошает сумку поставленного юнита и кладёт в неё названные предметы: один в ячейку сумки, шапку на голову.',
    'Спорожнює сумку поставленого юніта й кладе в неї названі предмети: один у клітинку сумки, шапку на голову.',
    '清空已放置单位的背包并放入你指定的物品：一件放进背包格子，一顶帽子戴在头上。'],
  ['ide.kit.p.mi.inventory.w', '{clear} removes the whole default kit, weapons too. Leave it out to add to the default kit instead.',
    '{clear} убирает всё снаряжение по умолчанию, оружие тоже. Уберите его, чтобы добавить к снаряжению по умолчанию.',
    '{clear} прибирає все спорядження за замовчуванням, зброю теж. Приберіть його, щоб додати до спорядження за замовчуванням.',
    '{clear} 会移除全部默认装备，包括武器。去掉它即可在默认装备上追加。'],
  F('mi.inventory', 'id', 'unitId', 'unitIdH'),
  ['ide.kit.p.mi.inventory.f.item', 'Item', 'Предмет', 'Предмет', '物品'],
  ['ide.kit.p.mi.inventory.f.col', 'Cell column', 'Столбец ячейки', 'Стовпець клітинки', '格子列'],
  ['ide.kit.p.mi.inventory.f.row', 'Cell row', 'Строка ячейки', 'Рядок клітинки', '格子行'],
  ['ide.kit.p.mi.inventory.f.hat', 'Head item', 'Предмет на голову', 'Предмет на голову', '头部物品']);

// 315
add(['ide.kit.p.mi.link', 'Seat a placed unit in a vehicle or gun', 'Посадить юнита в машину или орудие', 'Посадити юніта в машину або гармату', '让已放置的单位进入载具或火炮'],
  ['ide.kit.p.mi.link.d', 'Puts a placed soldier into a seat of a placed vehicle or gun when the mission starts. This is how a vehicle starts with a crew.',
    'Сажает поставленного солдата на место в поставленной машине или орудии в начале миссии. Так машина начинает с экипажем.',
    'Саджає поставленого солдата на місце в поставленій машині або гарматі на початку місії. Так машина починає з екіпажем.',
    '任务开始时让已放置的士兵坐进已放置载具或火炮的某个座位。这样载具开局就有乘员。'],
  ['ide.kit.p.mi.link.w', 'The soldier id comes first, then the vehicle id and the seat. The seat must exist on that vehicle.',
    'Сначала id солдата, затем id машины и место. Такое место должно быть у этой машины.',
    'Спочатку id солдата, потім id машини й місце. Таке місце має бути в цієї машини.',
    '先写士兵 id，再写载具 id 和座位。该载具必须有这个座位。'],
  ['ide.kit.p.mi.link.f.man', 'Soldier id', 'Id солдата', 'Id солдата', '士兵 id'],
  ['ide.kit.p.mi.link.f.vehicle', 'Vehicle id', 'Id машины', 'Id машини', '载具 id'],
  ['ide.kit.p.mi.link.f.seat', 'Seat', 'Место', 'Місце', '座位']);

// 316
add(['ide.kit.p.mi.env', 'Weather and light preset', 'Погода и освещение', 'Погода й освітлення', '天气与光照预设'],
  ['ide.kit.p.mi.env.d', 'Picks the weather and light preset the mission starts with.',
    'Выбирает погоду и освещение, с которыми начинается миссия.',
    'Вибирає погоду й освітлення, з якими починається місія.',
    '选择任务开始时使用的天气与光照预设。'],
  ['ide.kit.p.mi.env.f.env', 'Preset name', 'Имя набора', 'Імʼя набору', '预设名称'],
  ['ide.kit.p.mi.env.f.env.h', 'Like multi/multi_01 or skirmish/usa-hurtgen.', 'Например multi/multi_01 или skirmish/usa-hurtgen.', 'Наприклад multi/multi_01 або skirmish/usa-hurtgen.', '例如 multi/multi_01 或 skirmish/usa-hurtgen。']);

// 317
add(['ide.kit.p.mi.helpers', 'Script area', 'Область скриптов', 'Область скриптів', '脚本区'],
  ['ide.kit.p.mi.helpers.d', 'The block that holds the mission scripts: events, zones, variables and triggers (also waypoints, tasks, reinforcements and cameras). This start has one of each first kind. Not tried in game.',
    'Блок со скриптами миссии: события, зоны, переменные и триггеры (а также точки пути, задачи, подкрепления и камеры). Здесь по одному из первых видов. В игре не проверено.',
    'Блок зі скриптами місії: події, зони, змінні й тригери (а також точки шляху, завдання, підкріплення й камери). Тут по одному з перших видів. У грі не перевірено.',
    '存放任务脚本的块：事件、区域、变量和触发器（还有路径点、任务、增援和镜头）。这里每种前述内容各给一个。未在游戏中试过。'],
  ['ide.kit.p.mi.helpers.w', 'Only the known block names may stand inside: any other name stops the mission from loading.',
    'Внутри можно писать только известные имена блоков: любое другое имя не даёт миссии загрузиться.',
    'Усередині можна писати лише відомі імена блоків: будь-яке інше імʼя не дає місії завантажитися.',
    '里面只能写已知的块名：任何其他名称都会让任务无法加载。'],
  ['ide.kit.p.mi.helpers.f.event', 'Event name', 'Имя события', 'Імʼя події', '事件名称'],
  POS('mi.helpers'),
  ['ide.kit.p.mi.helpers.f.zone', 'Zone name', 'Имя зоны', 'Імʼя зони', '区域名称'],
  ['ide.kit.p.mi.helpers.f.radius', 'Zone radius', 'Радиус зоны', 'Радіус зони', '区域半径'],
  ['ide.kit.p.mi.helpers.f.var', 'Variable name', 'Имя переменной', 'Імʼя змінної', '变量名称']);

// 318
add(['ide.kit.p.mi.players.sp', 'Sides and diplomacy (single player)', 'Стороны и дипломатия (одиночная игра)', 'Сторони й дипломатія (одиночна гра)', '阵营与外交（单人）'],
  ['ide.kit.p.mi.players.sp.d', 'Names the four sides of a single-player mission (player, enemy, allied, neutral), sets which one you play and who fights whom.',
    'Называет четыре стороны одиночной миссии (игрок, враг, союзник, нейтрал), задаёт, за кого вы играете и кто с кем воюет.',
    'Називає чотири сторони одиночної місії (гравець, ворог, союзник, нейтрал), задає, за кого ви граєте і хто з ким воює.',
    '为单人任务的四个阵营（玩家、敌人、盟友、中立）命名，设定你扮演哪一方以及谁和谁交战。'],
  ['ide.kit.p.mi.players.sp.w', 'In the table, row and column are the sides: 0 = neutral, 1 = enemy, 2 = ally. Keep it square, 8 by 8.',
    'В таблице строка и столбец — это стороны: 0 = нейтрал, 1 = враг, 2 = союзник. Держите её квадратной, 8 на 8.',
    'У таблиці рядок і стовпець — це сторони: 0 = нейтрал, 1 = ворог, 2 = союзник. Тримайте її квадратною, 8 на 8.',
    '表中的行和列都是阵营：0 = 中立，1 = 敌对，2 = 同盟。保持为 8×8 的方阵。'],
  ['ide.kit.p.mi.players.sp.f.user', 'Your side', 'Ваша сторона', 'Ваша сторона', '你的阵营'],
  ['ide.kit.p.mi.players.sp.f.user.h', 'The alias number you play: 0 = player.', 'Номер alias, за который вы играете: 0 = player.', 'Номер alias, за який ви граєте: 0 = player.', '你扮演的 alias 编号：0 = player。']);

// 319
add(['ide.kit.p.mi.players.mp', 'Sides and diplomacy (multiplayer)', 'Стороны и дипломатия (сетевая игра)', 'Сторони й дипломатія (мережева гра)', '阵营与外交（多人）'],
  ['ide.kit.p.mi.players.mp.d', 'The stock side table of multiplayer mode files: 17 sides, side 0 neutral, all others enemies of each other.',
    'Стандартная таблица сторон файлов сетевых режимов: 17 сторон, сторона 0 нейтральна, все остальные враги друг другу.',
    'Стандартна таблиця сторін файлів мережевих режимів: 17 сторін, сторона 0 нейтральна, усі інші вороги одна одній.',
    '多人模式文件的标准阵营表：17 个阵营，0 号中立，其余彼此为敌。'],
  ['ide.kit.p.mi.players.mp.w', 'Values: 0 = neutral, 1 = enemy, 2 = ally. Keep the table square: as many rows and columns as count.',
    'Значения: 0 = нейтрал, 1 = враг, 2 = союзник. Держите таблицу квадратной: строк и столбцов столько, сколько count.',
    'Значення: 0 = нейтрал, 1 = ворог, 2 = союзник. Тримайте таблицю квадратною: рядків і стовпців стільки, скільки count.',
    '取值：0 = 中立，1 = 敌对，2 = 同盟。表格保持方阵：行数和列数都等于 count。']);

// 320
add(['ide.kit.p.mi.fog', 'Fog of war on/off', 'Туман войны вкл/выкл', 'Туман війни увімк/вимк', '战争迷雾开/关'],
  ['ide.kit.p.mi.fog.d', 'Turns the fog of war on (1) or off (0) for the mission.',
    'Включает (1) или выключает (0) туман войны в миссии.',
    'Вмикає (1) або вимикає (0) туман війни в місії.',
    '为任务开启（1）或关闭（0）战争迷雾。'],
  ['ide.kit.p.mi.fog.f.fog', 'Fog of war', 'Туман войны', 'Туман війни', '战争迷雾']);

// 321
add(['ide.kit.p.mi.entman', 'Entity manager', 'Менеджер объектов', 'Менеджер обʼєктів', '实体管理器'],
  ['ide.kit.p.mi.entman.d', 'Turns on the engine budget for short-lived objects (shells, wrecks, debris) and scales how many it keeps.',
    'Включает лимит движка для недолговечных объектов (гильзы, обломки, мусор) и меняет, сколько их держится.',
    'Вмикає ліміт рушія для недовговічних обʼєктів (гільзи, уламки, сміття) і змінює, скільки їх тримається.',
    '开启引擎对短暂物体（弹壳、残骸、碎片）的数量上限，并调整保留数量。'],
  ['ide.kit.p.mi.entman.f.scale', 'Count scale', 'Множитель количества', 'Множник кількості', '数量倍率'],
  ['ide.kit.p.mi.entman.f.scale.h', 'Like x0.5 (half). Multiplayer stock maps use x0.5.', 'Например x0.5 (половина). Сетевые карты игры используют x0.5.', 'Наприклад x0.5 (половина). Мережеві мапи гри використовують x0.5.', '例如 x0.5（一半）。游戏自带多人地图使用 x0.5。']);

// 322
add(['ide.kit.p.mi.covers', 'Named cover sectors', 'Именованные сектора укрытий', 'Іменовані сектори укриттів', '命名的掩体区段'],
  ['ide.kit.p.mi.covers.d', 'Names a cover sector on the map so scripts can send units into that cover by name.',
    'Даёт имя сектору укрытия на карте, чтобы скрипты могли отправлять юнитов в это укрытие по имени.',
    'Дає імʼя сектору укриття на мапі, щоб скрипти могли відправляти юнітів у це укриття за імʼям.',
    '为地图上的掩体区段命名，脚本即可按名称把单位派往该掩体。'],
  ['ide.kit.p.mi.covers.w', 'The Automatic numbers come from the map editor; copy them, do not type them by hand. Several sectors may share one name.',
    'Числа Automatic берутся из редактора карт; копируйте их, не вводите вручную. Несколько секторов могут носить одно имя.',
    'Числа Automatic беруться з редактора мап; копіюйте їх, не вводьте вручну. Кілька секторів можуть мати одне імʼя.',
    'Automatic 的数字来自地图编辑器；请复制，不要手动输入。多个区段可以共用一个名称。'],
  ['ide.kit.p.mi.covers.f.cover', 'Cover id', 'Id укрытия', 'Id укриття', '掩体 id'],
  ['ide.kit.p.mi.covers.f.cx', 'Sector X', 'Сектор X', 'Сектор X', '区段 X'],
  ['ide.kit.p.mi.covers.f.cy', 'Sector Y', 'Сектор Y', 'Сектор Y', '区段 Y'],
  ['ide.kit.p.mi.covers.f.name', 'Sector name', 'Имя сектора', 'Імʼя сектора', '区段名称']);

// 323 to 335: keys inside a placement
add(['ide.kit.p.mi.k.position', 'Position', 'Позиция', 'Позиція', '位置'],
  ['ide.kit.p.mi.k.position.d', 'Where the placed object stands on the map. Add a third number to keep that height instead of snapping to the ground.',
    'Где стоит объект на карте. Третье число сохраняет эту высоту вместо прилипания к земле.',
    'Де стоїть обʼєкт на мапі. Третє число зберігає цю висоту замість прилипання до землі.',
    '已放置对象在地图上的位置。加第三个数字可保持该高度，而不是贴在地面上。'],
  POS('mi.k.position'));
add(['ide.kit.p.mi.k.xform', 'xform', 'xform', 'xform', 'xform'],
  ['ide.kit.p.mi.k.xform.d', 'Turns the placed object. Stock files also use {xform scale 0.75} to size it, and zl, y, zw together to tilt it.',
    'Поворачивает объект. В файлах игры также есть {xform scale 0.75} для размера и zl, y, zw вместе для наклона.',
    'Повертає обʼєкт. У файлах гри також є {xform scale 0.75} для розміру та zl, y, zw разом для нахилу.',
    '旋转已放置的对象。游戏自带文件还用 {xform scale 0.75} 调整大小，用 zl、y、zw 组合使其倾斜。'],
  F('mi.k.xform', 'angle', 'angle', 'angleH'));
add(['ide.kit.p.mi.k.player', 'Player', 'Player', 'Player', 'Player'],
  ['ide.kit.p.mi.k.player.d', 'The side that owns the placed unit.', 'Сторона, которой принадлежит юнит.', 'Сторона, якій належить юніт.', '拥有该单位的阵营。'],
  ['ide.kit.p.mi.k.player.w', 'Never on a building, tree or prop: the load crashes.', 'Никогда у здания, дерева или декора: загрузка падает.', 'Ніколи в будівлі, дерева чи декору: завантаження падає.', '不要用在建筑、树木或装饰物上：会导致加载崩溃。'],
  F('mi.k.player', 'player', 'player', 'playerH'));
add(['ide.kit.p.mi.k.mid', 'MID', 'MID', 'MID', 'MID'],
  ['ide.kit.p.mi.k.mid.d', 'The mission number of the placed object. Selectors pick it with {mids N}.', 'Номер объекта в миссии. Селекторы выбирают его через {mids N}.', 'Номер обʼєкта в місії. Селектори вибирають його через {mids N}.', '已放置对象的任务编号。选择器用 {mids N} 选中它。'],
  F('mi.k.mid', 'mid', 'mid', 'midH'));
add(['ide.kit.p.mi.k.extender', 'Extender', 'Extender', 'Extender', 'Extender'],
  ['ide.kit.p.mi.k.extender.d', 'Extra settings of a placed object. This one makes a "battle" sound object play a looping world sound.',
    'Дополнительные настройки объекта. Этот пример заставляет звуковой объект "battle" играть зацикленный звук мира.',
    'Додаткові налаштування обʼєкта. Цей приклад змушує звуковий обʼєкт "battle" грати зациклений звук світу.',
    '已放置对象的附加设置。此例让 "battle" 声音对象循环播放环境音。'],
  ['ide.kit.p.mi.k.extender.w', 'Each extender name has its own keys (map_point has name, team, visor ...; enumerator has number). Use the one the object has.',
    'У каждого имени extender свои ключи (у map_point name, team, visor ...; у enumerator number). Берите тот, что есть у объекта.',
    'Кожне імʼя extender має свої ключі (у map_point name, team, visor ...; у enumerator number). Беріть той, що є в обʼєкта.',
    '每种 extender 名称有自己的键（map_point 有 name、team、visor……；enumerator 有 number）。使用对象具有的那种。'],
  ['ide.kit.p.mi.k.extender.f.sound', 'World sound', 'Звук мира', 'Звук світу', '环境音']);
add(['ide.kit.p.mi.k.texmod', 'TexMod', 'TexMod', 'TexMod', 'TexMod'],
  ['ide.kit.p.mi.k.texmod.d', 'Picks a paint or texture variant of the placed object, like winter (win) or a nation (ger, usa).',
    'Выбирает вариант окраски или текстуры объекта, например зимний (win) или нации (ger, usa).',
    'Вибирає варіант фарбування чи текстури обʼєкта, наприклад зимовий (win) або нації (ger, usa).',
    '为已放置对象选择涂装或贴图变体，例如冬季（win）或国家（ger、usa）。'],
  ['ide.kit.p.mi.k.texmod.w', 'The variant must exist for that object, or the default texture shows.', 'Вариант должен быть у этого объекта, иначе видна обычная текстура.', 'Варіант має бути в цього обʼєкта, інакше видно звичайну текстуру.', '该对象必须有这个变体，否则显示默认贴图。'],
  ['ide.kit.p.mi.k.texmod.f.tex', 'Variant', 'Вариант', 'Варіант', '变体']);
add(['ide.kit.p.mi.k.impreg', 'Impregnability', 'Impregnability', 'Impregnability', 'Impregnability'],
  ['ide.kit.p.mi.k.impreg.d', 'Makes the placed object take no damage (full), or also do no harm (harmless).',
    'Делает объект неуязвимым (full) или ещё и безвредным (harmless).',
    'Робить обʼєкт невразливим (full) або ще й нешкідливим (harmless).',
    '使已放置对象不受伤害（full），或同时也不造成伤害（harmless）。'],
  ['ide.kit.p.mi.k.impreg.f.mode', 'Mode', 'Режим', 'Режим', '模式']);
add(['ide.kit.p.mi.k.fog', 'SpawnedInFog', 'SpawnedInFog', 'SpawnedInFog', 'SpawnedInFog'],
  ['ide.kit.p.mi.k.fog.d', 'Marks the placed object as spawned in the fog of war: the other side does not see it until it is in sight.',
    'Отмечает объект как появившийся в тумане войны: другая сторона не видит его, пока он не в поле зрения.',
    'Позначає обʼєкт як такий, що зʼявився в тумані війни: інша сторона не бачить його, доки він не в полі зору.',
    '把已放置对象标为在战争迷雾中生成：另一方在看到它之前无法发现它。']);
add(['ide.kit.p.mi.k.placer', 'Placer', 'Placer', 'Placer', 'Placer'],
  ['ide.kit.p.mi.k.placer.d', 'Sets the start state of one seat or part of a placed vehicle or gun: closed (Disable) or broken (Broken).',
    'Задаёт начальное состояние места или части машины или орудия: закрыто (Disable) или сломано (Broken).',
    'Задає початковий стан місця або частини машини чи гармати: закрито (Disable) або зламано (Broken).',
    '设定已放置载具或火炮的某个座位或部件的初始状态：关闭（Disable）或损坏（Broken）。'],
  ['ide.kit.p.mi.k.placer.w', 'Add one State line per seat. The seat name must exist on that vehicle.', 'Одна строка State на каждое место. Такое место должно быть у машины.', 'Один рядок State на кожне місце. Таке місце має бути в машини.', '每个座位写一行 State。该载具必须有这个座位。'],
  ['ide.kit.p.mi.k.placer.f.seat', 'Seat or part', 'Место или часть', 'Місце або частина', '座位或部件'],
  ['ide.kit.p.mi.k.placer.f.state', 'State', 'Состояние', 'Стан', '状态']);
add(['ide.kit.p.mi.k.area', 'AreaDisable', 'AreaDisable', 'AreaDisable', 'AreaDisable'],
  ['ide.kit.p.mi.k.area.d', 'Picks which area set of the placed object is switched off, like a gun shield closed or a door side open.',
    'Выбирает, какой набор областей объекта отключён, например закрытый щит орудия или открытая сторона двери.',
    'Вибирає, який набір областей обʼєкта вимкнено, наприклад закритий щит гармати чи відкритий бік дверей.',
    '选择关闭已放置对象的哪组区域，例如火炮护盾关闭或门的一侧打开。'],
  ['ide.kit.p.mi.k.area.w', 'The name must be an area set of that object (close, openl, openr are the common ones).', 'Имя должно быть набором областей этого объекта (обычно close, openl, openr).', 'Імʼя має бути набором областей цього обʼєкта (зазвичай close, openl, openr).', '名称必须是该对象拥有的区域组（常见为 close、openl、openr）。'],
  ['ide.kit.p.mi.k.area.f.area', 'Area set', 'Набор областей', 'Набір областей', '区域组']);
add(['ide.kit.p.mi.k.volume', 'Volume', 'Volume', 'Volume', 'Volume'],
  ['ide.kit.p.mi.k.volume.d', 'Switches off one named volume of the placed object: it is no longer seen, hit, touched or bumped into. Stock maps do this to the ram volume of vehicles.',
    'Отключает один именованный объём объекта: его больше не видно, в него не попадают, его не касаются и в него не врезаются. На картах игры так делают с объёмом ram у машин.',
    'Вимикає один іменований обʼєм обʼєкта: його більше не видно, у нього не влучають, його не торкаються й у нього не врізаються. На мапах гри так роблять з обʼємом ram у машин.',
    '关闭已放置对象的一个命名体积：它不再可见、不会被击中、触碰或撞上。游戏自带地图对载具的 ram 体积这样做。'],
  ['ide.kit.p.mi.k.volume.f.volume', 'Volume name', 'Имя объёма', 'Імʼя обʼєму', '体积名称'],
  ['ide.kit.p.mi.k.volume.f.volume.h', 'A volume of the object model, like ram or body.', 'Объём модели объекта, например ram или body.', 'Обʼєм моделі обʼєкта, наприклад ram або body.', '对象模型中的体积，例如 ram 或 body。']);
add(['ide.kit.p.mi.k.able', 'Able', 'Able', 'Able', 'Able'],
  ['ide.kit.p.mi.k.able.d', 'Turns an ability of the placed unit on, or off with a leading minus. Example: the crew does not jump out when enemies come near.',
    'Включает способность юнита или выключает её минусом впереди. Пример: экипаж не выпрыгивает, когда рядом враги.',
    'Вмикає здатність юніта або вимикає її мінусом попереду. Приклад: екіпаж не вистрибує, коли поруч вороги.',
    '开启已放置单位的某项能力，前面加减号则关闭。例如：敌人靠近时乘员不下车。'],
  ['ide.kit.p.mi.k.able.w', 'Several abilities can stand in one line, each in its own quotes.', 'В одной строке может быть несколько способностей, каждая в своих кавычках.', 'В одному рядку може бути кілька здатностей, кожна у своїх лапках.', '一行可写多项能力，每项各用一对引号。'],
  ['ide.kit.p.mi.k.able.f.able', 'Ability', 'Способность', 'Здатність', '能力'],
  ['ide.kit.p.mi.k.able.f.able.h', 'A minus in front turns it off, like -emit_passangers_on_enemy. "personage" marks a hero.', 'Минус впереди выключает, например -emit_passangers_on_enemy. "personage" отмечает героя.', 'Мінус попереду вимикає, наприклад -emit_passangers_on_enemy. "personage" позначає героя.', '前面加减号表示关闭，例如 -emit_passangers_on_enemy。"personage" 表示英雄。']);
add(['ide.kit.p.mi.k.constrain', 'Constrain', 'Constrain', 'Constrain', 'Constrain'],
  ['ide.kit.p.mi.k.constrain.d', 'How the placed object sits: on the ground surface, on water, at the height given (zero) or free (none). Not tried in game.',
    'Как стоит объект: на поверхности земли, на воде, на заданной высоте (zero) или свободно (none). В игре не проверено.',
    'Як стоїть обʼєкт: на поверхні землі, на воді, на заданій висоті (zero) або вільно (none). У грі не перевірено.',
    '已放置对象的放置方式：贴地面、在水上、按给定高度（zero）或不受约束（none）。未在游戏中试过。'],
  ['ide.kit.p.mi.k.constrain.w', 'The meaning of each word is read from stock use, not tried in game.', 'Смысл каждого слова взят из файлов игры, в игре не проверен.', 'Зміст кожного слова взято з файлів гри, у грі не перевірено.', '各词的含义来自游戏自带文件的用法，未在游戏中验证。'],
  ['ide.kit.p.mi.k.constrain.f.mode', 'Mode', 'Режим', 'Режим', '模式']);

module.exports = rows;

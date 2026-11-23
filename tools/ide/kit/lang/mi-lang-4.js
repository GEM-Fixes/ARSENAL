// Code Pieces, group mi-lang-4: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-lang-4.js
// (the last mission commands and the Advanced rows, numbers 469 to 507).
// Author: Imperator_Aug (ARSENAL, ia-3830ff7a)
'use strict';

const K = 'ide.kit.p.';
const rows = [];
// r(id, suffix, en, ru, uk, zh)
const r = (id, suf, en, ru, uk, zh) => rows.push([K + id + suf, en, ru, uk, zh]);

// field labels that repeat
const TAG = ['Unit tag', 'Тег юнитов', 'Тег юнітів', '单位标签'];
const TAG_H = ['The tag the units have in the mission file', 'Тег, который есть у юнитов в файле миссии', 'Тег, який мають юніти у файлі місії', '单位在任务文件中带有的标签'];
const SLOT = ['Slot name', 'Имя слота', 'Ім\'я слоту', '存储槽名'];
const SLOT_H = ['The same name in both missions', 'Одно и то же имя в обеих миссиях', 'Те саме ім\'я в обох місіях', '两个任务中使用相同的名称'];
const NT = ['Not tried in game.', 'Не проверено в игре.', 'Не перевірено в грі.', '未在游戏中试过。'];
const NMP = ['Not for multiplayer maps.', 'Не для мультиплеерных карт.', 'Не для мультиплеєрних мап.', '不适用于多人地图。'];
const tagF = id => { r(id, '.f.tag', ...TAG); r(id, '.f.tag.h', ...TAG_H); };
const nt = (a) => a.map((s, i) => s + ' ' + NT[i]);

// 469
r('mi.c.spawn', '', 'Spawn an object at a waypoint', 'Создать объект в путевой точке', 'Створити об\'єкт у шляховій точці', '在路径点生成物体');
r('mi.c.spawn', '.d', 'Creates one object (a crate, a smoke marker, a vehicle) at a waypoint when this runs.',
  'Когда команда выполняется, в путевой точке появляется объект (ящик, дымовой маркер, техника).',
  'Коли команда виконується, у шляховій точці з\'являється об\'єкт (ящик, димовий маркер, техніка).',
  '执行时在路径点生成一个物体（补给箱、烟雾标记、载具）。');
r('mi.c.spawn', '.w', 'The object belongs to no player. Give it a side and tags with later commands if you need them.',
  'Объект не принадлежит ни одному игроку. Если нужно, задайте сторону и теги следующими командами.',
  'Об\'єкт не належить жодному гравцю. Якщо треба, задайте сторону й теги наступними командами.',
  '该物体不属于任何玩家。如有需要，请用后续命令设置阵营和标签。');
r('mi.c.spawn', '.f.entity', 'Object to spawn', 'Какой объект', 'Який об\'єкт', '要生成的物体');
r('mi.c.spawn', '.f.entity.h', 'An entity name from the game set, like paradrop_ammo', 'Имя объекта из набора игры, например paradrop_ammo', 'Ім\'я об\'єкта з набору гри, наприклад paradrop_ammo', '游戏中的物体名，例如 paradrop_ammo');
r('mi.c.spawn', '.f.waypoint', 'Waypoint', 'Путевая точка', 'Шляхова точка', '路径点');
r('mi.c.spawn', '.f.waypoint.h', 'The waypoint number in {Helpers}', 'Номер путевой точки в {Helpers}', 'Номер шляхової точки в {Helpers}', '{Helpers} 中的路径点编号');

// 470
r('mi.c.delete', '', 'Remove units', 'Удалить юниты', 'Видалити юніти', '移除单位');
r('mi.c.delete', '.d', 'Removes every object the selector picks from the map at once, without a death.',
  'Сразу убирает с карты все объекты, которые выбрал селектор, без гибели.',
  'Одразу прибирає з мапи всі об\'єкти, які вибрав селектор, без загибелі.',
  '立即从地图上移除选择器选中的所有物体，不算阵亡。');
tagF('mi.c.delete');

// 471
r('mi.c.store_units', '', 'Keep units for the next mission', 'Сохранить юниты для следующей миссии', 'Зберегти юніти для наступної місії', '为下一个任务保留单位');
r('mi.c.store_units', '.d', ...nt(['Stores the units the selector picks under a slot name, so a later mission can bring them back.',
  'Сохраняет выбранные селектором юниты под именем слота, чтобы следующая миссия могла их вернуть.',
  'Зберігає вибрані селектором юніти під ім\'ям слоту, щоб наступна місія могла їх повернути.',
  '把选择器选中的单位存入一个存储槽，之后的任务可以把它们带回来。']));
r('mi.c.store_units', '.w', 'Engine only: no stock mission uses it. The slot is read back by load_units.',
  'Есть только в движке: ни одна миссия игры его не использует. Слот читает load_units.',
  'Є лише в рушії: жодна місія гри його не використовує. Слот читає load_units.',
  '仅存在于引擎中：游戏自带任务都没有用到。存储槽由 load_units 读回。');
tagF('mi.c.store_units');
r('mi.c.store_units', '.f.slot', ...SLOT); r('mi.c.store_units', '.f.slot.h', ...SLOT_H);

// 472
r('mi.c.load_units', '', 'Bring in units from an earlier mission', 'Вернуть юниты из прошлой миссии', 'Повернути юніти з минулої місії', '带入之前任务的单位');
r('mi.c.load_units', '.d', ...nt(['Places the units an earlier mission kept under this slot name.',
  'Ставит на карту юниты, которые прошлая миссия сохранила под этим именем слота.',
  'Ставить на мапу юніти, які минула місія зберегла під цим ім\'ям слоту.',
  '放置之前任务以此存储槽名保留的单位。']));
r('mi.c.load_units', '.n', 'An earlier mission that ran store_units with the same slot name.',
  'Прошлая миссия, которая выполнила store_units с тем же именем слота.',
  'Минула місія, яка виконала store_units з тим самим ім\'ям слоту.',
  '之前有一个任务用相同的存储槽名执行过 store_units。');
r('mi.c.load_units', '.f.slot', ...SLOT); r('mi.c.load_units', '.f.slot.h', ...SLOT_H);

// 473
r('mi.c.entity_manager', '', 'Switch the entity manager, scale its limits', 'Включить менеджер объектов и его лимиты', 'Увімкнути менеджер об\'єктів і його ліміти', '开关物体管理器并缩放其上限');
r('mi.c.entity_manager', '.d', ...nt(['Turns on the manager that clears old wrecks and bodies, and multiplies how many it keeps. Write {enabled 0} to turn it off.',
  'Включает менеджер, который убирает старые обломки и тела, и умножает, сколько их остаётся. {enabled 0} выключает его.',
  'Вмикає менеджер, що прибирає старі уламки й тіла, і множить, скільки їх лишається. {enabled 0} вимикає його.',
  '开启清理旧残骸和尸体的管理器，并调整保留数量的倍数。写 {enabled 0} 可关闭。']));
r('mi.c.entity_manager', '.f.count', 'Limit scale', 'Множитель лимита', 'Множник ліміту', '上限倍数');
r('mi.c.entity_manager', '.f.count.h', 'x2 keeps twice as many objects before they are cleared', 'x2 оставляет вдвое больше объектов до уборки', 'x2 лишає вдвічі більше об\'єктів до прибирання', 'x2 表示清理前保留两倍数量的物体');

// 474
r('mi.c.inventory', '', 'Add, remove, drop items or fuel', 'Добавить, убрать, выбросить предметы или топливо', 'Додати, прибрати, викинути предмети чи пальне', '添加、移除、丢弃物品或燃料');
r('mi.c.inventory', '.d', 'Puts items into the inventory of the picked units, or takes them out.',
  'Кладёт предметы в инвентарь выбранных юнитов или забирает их.',
  'Кладе предмети в інвентар вибраних юнітів або забирає їх.',
  '向选中单位的物品栏放入或取出物品。');
r('mi.c.inventory', '.w', 'For {action drop} leave out item and amount: the units drop what they carry. {action fuel} takes only {amount}.',
  'Для {action drop} уберите item и amount: юниты бросают то, что несут. {action fuel} берёт только {amount}.',
  'Для {action drop} приберіть item і amount: юніти кидають те, що несуть. {action fuel} бере лише {amount}.',
  '使用 {action drop} 时去掉 item 和 amount：单位会丢下携带的东西。{action fuel} 只需要 {amount}。');
tagF('mi.c.inventory');
r('mi.c.inventory', '.f.action', 'Add or remove', 'Добавить или убрать', 'Додати чи прибрати', '添加或移除');
r('mi.c.inventory', '.f.item', 'Item', 'Предмет', 'Предмет', '物品');
r('mi.c.inventory', '.f.item.h', 'An item name, like repair_kit. Ammo is written "bullet37" "ap" "ammo"', 'Имя предмета, например repair_kit. Патроны пишутся "bullet37" "ap" "ammo"', 'Ім\'я предмета, наприклад repair_kit. Набої пишуться "bullet37" "ap" "ammo"', '物品名，例如 repair_kit。弹药写作 "bullet37" "ap" "ammo"');
r('mi.c.inventory', '.f.amount', 'How many', 'Сколько', 'Скільки', '数量');

// 475
r('mi.c.component', '', 'Break or repair a vehicle part', 'Сломать или починить часть техники', 'Зламати чи полагодити частину техніки', '损坏或修复载具部件');
r('mi.c.component', '.d', 'Breaks one part of the picked vehicles (a track, the gun, the engine) or makes it work again.',
  'Ломает одну часть выбранной техники (гусеницу, орудие, двигатель) или снова делает её рабочей.',
  'Ламає одну частину вибраної техніки (гусеницю, гармату, двигун) або знову робить її робочою.',
  '损坏选中载具的一个部件（履带、火炮、发动机），或让它恢复工作。');
tagF('mi.c.component');
r('mi.c.component', '.f.component', 'Part', 'Часть', 'Частина', '部件');
r('mi.c.component', '.f.state', 'Broken or working', 'Сломана или работает', 'Зламана чи працює', '损坏或正常');

// 476
r('mi.c.effect', '', 'Run an entity effect (burn, explode)', 'Запустить эффект объекта (горение, взрыв)', 'Запустити ефект об\'єкта (горіння, вибух)', '执行物体效果（燃烧、爆炸）');
r('mi.c.effect', '.d', 'Runs an effect the object defines on the picked objects, for example sets a vehicle on fire.',
  'Запускает на выбранных объектах эффект, заданный в объекте, например поджигает технику.',
  'Запускає на вибраних об\'єктах ефект, заданий в об\'єкті, наприклад підпалює техніку.',
  '对选中物体执行其自身定义的效果，例如让载具起火。');
tagF('mi.c.effect');
r('mi.c.effect', '.f.effect', 'Effect', 'Эффект', 'Ефект', '效果');
r('mi.c.effect', '.f.effect.h', 'Stock missions use _burn, explosion and die', 'Миссии игры используют _burn, explosion и die', 'Місії гри використовують _burn, explosion і die', '游戏自带任务使用 _burn、explosion 和 die');

// 477
r('mi.c.task', '', 'Show, complete, fail, hide an objective', 'Показать, выполнить, провалить, скрыть задачу', 'Показати, виконати, провалити, сховати завдання', '显示、完成、失败、隐藏目标');
r('mi.c.task', '.d', 'Changes the state of an objective from the {tasks} list in {Helpers}.',
  'Меняет состояние задачи из списка {tasks} в {Helpers}.',
  'Змінює стан завдання зі списку {tasks} у {Helpers}.',
  '改变 {Helpers} 中 {tasks} 列表里某个目标的状态。');
r('mi.c.task', '.w', 'Leave out the state line to show a hidden objective.',
  'Чтобы показать скрытую задачу, уберите строку state.',
  'Щоб показати приховане завдання, приберіть рядок state.',
  '要显示隐藏的目标，去掉 state 这一行。');
r('mi.c.task', '.f.name', 'Objective name', 'Имя задачи', 'Ім\'я завдання', '目标名');
r('mi.c.task', '.f.state', 'New state', 'Новое состояние', 'Новий стан', '新状态');

// 478
r('mi.c.objprog', '', 'Objective counter text', 'Текст счётчика задачи', 'Текст лічильника завдання', '目标计数文字');
r('mi.c.objprog', '.d', 'Shows a counter line on screen with a text and a number: set gives the number, add changes it.',
  'Показывает на экране строку счётчика с текстом и числом: set задаёт число, add изменяет его.',
  'Показує на екрані рядок лічильника з текстом і числом: set задає число, add змінює його.',
  '在屏幕上显示一行带文字和数字的计数：set 设定数字，add 增减数字。');
r('mi.c.objprog', '.w', 'Add {hide} as the first line to take the counter off the screen.',
  'Добавьте {hide} первой строкой, чтобы убрать счётчик с экрана.',
  'Додайте {hide} першим рядком, щоб прибрати лічильник з екрана.',
  '把 {hide} 加为第一行即可从屏幕上移除计数。');
r('mi.c.objprog', '.f.set', 'Set to', 'Задать значение', 'Задати значення', '设为');
r('mi.c.objprog', '.f.add', 'Add', 'Прибавить', 'Додати', '增加');
r('mi.c.objprog', '.f.title', 'Text key', 'Ключ текста', 'Ключ тексту', '文本键');
r('mi.c.objprog', '.f.title.h', '$/ and a key of the mission text file', '$/ и ключ из файла текстов миссии', '$/ і ключ із файлу текстів місії', '$/ 加上任务文本文件中的键');

// 479
r('mi.c.timer', '', 'On-screen countdown', 'Таймер на экране', 'Таймер на екрані', '屏幕倒计时');
r('mi.c.timer', '.d', 'Starts a countdown on screen with a title.',
  'Запускает на экране обратный отсчёт с заголовком.',
  'Запускає на екрані зворотний відлік із заголовком.',
  '在屏幕上开始一个带标题的倒计时。');
r('mi.c.timer', '.w', 'The timer only shows time: use a delay or a time condition to act when it runs out. To hide it write {hide} in place of {time}.',
  'Таймер только показывает время: чтобы что-то сделать по его окончании, используйте delay или условие по времени. Чтобы скрыть его, напишите {hide} вместо {time}.',
  'Таймер лише показує час: щоб щось зробити по його закінченні, використайте delay або умову за часом. Щоб сховати його, напишіть {hide} замість {time}.',
  '计时器只显示时间：要在结束时做事，请用 delay 或时间条件。要隐藏它，用 {hide} 代替 {time}。');
r('mi.c.timer', '.f.time', 'Countdown length', 'Длительность отсчёта', 'Тривалість відліку', '倒计时长度');
r('mi.c.timer', '.f.title', 'Text key', 'Ключ текста', 'Ключ тексту', '文本键');
r('mi.c.timer', '.f.title.h', '$/ and a key of the mission text file', '$/ и ключ из файла текстов миссии', '$/ і ключ із файлу текстів місії', '$/ 加上任务文本文件中的键');

// 480
r('mi.c.reinforcement', '', 'Show, hide or pay a reinforcement', 'Показать, скрыть или оплатить подкрепление', 'Показати, сховати чи оплатити підкріплення', '显示、隐藏或支付增援');
r('mi.c.reinforcement', '.d', 'Shows or hides one reinforcement button of the {reinforcements} list.',
  'Показывает или скрывает одну кнопку подкрепления из списка {reinforcements}.',
  'Показує або ховає одну кнопку підкріплення зі списку {reinforcements}.',
  '显示或隐藏 {reinforcements} 列表中的一个增援按钮。');
r('mi.c.reinforcement', '.w', 'Points use another form: {operation score_add} {score 5}, or {operation score_total} {score 0}.',
  'Для очков другая форма: {operation score_add} {score 5} или {operation score_total} {score 0}.',
  'Для очок інша форма: {operation score_add} {score 5} або {operation score_total} {score 0}.',
  '点数使用另一种写法：{operation score_add} {score 5}，或 {operation score_total} {score 0}。');
r('mi.c.reinforcement', '.f.operation', 'Show or hide', 'Показать или скрыть', 'Показати чи сховати', '显示或隐藏');
r('mi.c.reinforcement', '.f.name', 'Reinforcement name', 'Имя подкрепления', 'Ім\'я підкріплення', '增援名');

// 481
r('mi.c.talk', '', 'Unit says a line', 'Юнит говорит реплику', 'Юніт каже репліку', '单位说一句话');
r('mi.c.talk', '.d', 'The picked unit says a text line from the mission text file, shown with its portrait.',
  'Выбранный юнит произносит строку из файла текстов миссии, она показывается с его портретом.',
  'Вибраний юніт каже рядок із файлу текстів місії, він показується з його портретом.',
  '选中的单位说出任务文本文件中的一句话，并显示其头像。');
tagF('mi.c.talk');
r('mi.c.talk', '.f.text', 'Text key', 'Ключ текста', 'Ключ тексту', '文本键');
r('mi.c.talk', '.f.text.h', '$/ and a key of the mission text file', '$/ и ключ из файла текстов миссии', '$/ і ключ із файлу текстів місії', '$/ 加上任务文本文件中的键');

// 482
r('mi.c.achievement', '', 'Unlock a Steam achievement', 'Открыть достижение Steam', 'Відкрити досягнення Steam', '解锁 Steam 成就');
r('mi.c.achievement', '.d', 'Gives the player a Steam achievement of the game.',
  'Даёт игроку достижение Steam этой игры.',
  'Дає гравцеві досягнення Steam цієї гри.',
  '给予玩家本游戏的一个 Steam 成就。');
r('mi.c.achievement', '.w', 'Only the achievement names the game already has work; a mod cannot add new ones.',
  'Работают только имена достижений, которые уже есть в игре; мод не может добавить новые.',
  'Працюють лише імена досягнень, які вже є в грі; мод не може додати нові.',
  '只有游戏中已有的成就名有效；模组无法添加新成就。');
r('mi.c.achievement', '.f.name', 'Achievement name', 'Имя достижения', 'Ім\'я досягнення', '成就名');
r('mi.c.achievement', '.f.nation', 'Nation', 'Нация', 'Нація', '国家');

// 483
r('mi.c.gamestatus', '', 'Set the game status number', 'Задать номер статуса игры', 'Задати номер статусу гри', '设置游戏状态编号');
r('mi.c.gamestatus', '.d', ...nt(['Sets the game progress status to a number from 1 to 5.',
  'Ставит статус прогресса игры в число от 1 до 5.',
  'Ставить статус прогресу гри в число від 1 до 5.',
  '把游戏进度状态设为 1 到 5 之间的数字。']));
r('mi.c.gamestatus', '.w', 'Engine only: no stock mission uses it, and what reads the number is not known.',
  'Есть только в движке: ни одна миссия игры его не использует, и что читает это число, неизвестно.',
  'Є лише в рушії: жодна місія гри його не використовує, і що читає це число, невідомо.',
  '仅存在于引擎中：游戏自带任务都没有用到，也不清楚什么会读取这个数字。');
r('mi.c.gamestatus', '.f.status', 'Status', 'Статус', 'Статус', '状态');

// 484
r('mi.c.mp_event', '', 'Send a multiplayer game event', 'Отправить событие мультиплеерной игры', 'Надіслати подію мультиплеєрної гри', '发送多人游戏事件');
r('mi.c.mp_event', '.d', ...nt(['In a multiplayer game, sends a game event for a team to the game mode rules, which may count it toward a win.',
  'В мультиплеере отправляет событие игры за команду в правила режима, которые могут засчитать его в победу.',
  'У мультиплеєрі надсилає подію гри за команду в правила режиму, які можуть зарахувати її до перемоги.',
  '在多人游戏中，为某一队向游戏模式规则发送一个事件，规则可能将其计入胜利条件。']));
r('mi.c.mp_event', '.w', 'Does nothing outside multiplayer, or when event or team is empty.',
  'Ничего не делает вне мультиплеера или если event или team пусты.',
  'Нічого не робить поза мультиплеєром або якщо event чи team порожні.',
  '在多人游戏以外，或 event、team 为空时不起作用。');
r('mi.c.mp_event', '.f.event', 'Game event', 'Событие игры', 'Подія гри', '游戏事件');
r('mi.c.mp_event', '.f.event.h', 'An event word the game mode rules react to, like onpoint', 'Слово события, на которое реагируют правила режима, например onpoint', 'Слово події, на яке реагують правила режиму, наприклад onpoint', '游戏模式规则会响应的事件词，例如 onpoint');
r('mi.c.mp_event', '.f.team', 'Team', 'Команда', 'Команда', '队伍');

// 485
r('mi.c.event', '', 'Raise or clear an event', 'Поднять или сбросить событие', 'Підняти чи скинути подію', '触发或清除事件');
r('mi.c.event', '.d', 'Sets a mission event (other triggers wait for it) or clears it again, after an optional delay.',
  'Ставит событие миссии (его ждут другие триггеры) или снова сбрасывает его, можно с задержкой.',
  'Ставить подію місії (на неї чекають інші тригери) або знову скидає її, можна із затримкою.',
  '设置一个任务事件（其他触发器会等待它）或再次清除它，可带延迟。');
r('mi.c.event', '.f.event', 'Event name', 'Имя события', 'Ім\'я події', '事件名');
r('mi.c.event', '.f.mode', 'Set or clear', 'Поставить или сбросить', 'Поставити чи скинути', '设置或清除');
r('mi.c.event', '.f.delay', 'Delay', 'Задержка', 'Затримка', '延迟');

// 486
r('mi.c.trigger', '', 'Switch a trigger on (run again)', 'Включить триггер (запустить снова)', 'Увімкнути тригер (запустити знову)', '开启触发器（再次运行）');
r('mi.c.trigger', '.d', 'Switches a named trigger on again, so it checks its condition and runs once more. A trigger that names itself loops.',
  'Снова включает триггер по имени: он проверит условие и сработает ещё раз. Триггер, который называет сам себя, работает по кругу.',
  'Знову вмикає тригер за ім\'ям: він перевірить умову і спрацює ще раз. Тригер, що називає сам себе, працює по колу.',
  '再次开启指定名称的触发器，让它重新检查条件并再运行一次。触发器指向自身即可循环。');
r('mi.c.trigger', '.f.name', 'Trigger name', 'Имя триггера', 'Ім\'я тригера', '触发器名');

// 487
r('mi.c.set_i', '', 'Set or change a variable', 'Задать или изменить переменную', 'Задати чи змінити змінну', '设置或修改变量');
r('mi.c.set_i', '.d', 'Sets a whole-number mission variable, or adds to it or takes from it.',
  'Задаёт целую переменную миссии или прибавляет к ней, или отнимает.',
  'Задає цілу змінну місії або додає до неї, або віднімає.',
  '设置一个整数任务变量，或对它加减。');
r('mi.c.set_i', '.f.var', 'Variable name', 'Имя переменной', 'Ім\'я змінної', '变量名');
r('mi.c.set_i', '.f.var.h', 'Stock names end in $, like player_score$', 'Имена в игре кончаются на $, например player_score$', 'Імена в грі закінчуються на $, наприклад player_score$', '游戏中的变量名以 $ 结尾，例如 player_score$');
r('mi.c.set_i', '.f.op', 'Operation', 'Действие', 'Дія', '运算');
r('mi.c.set_i', '.f.op.h', '= sets, + adds, - takes away', '= задаёт, + прибавляет, - отнимает', '= задає, + додає, - віднімає', '= 设为，+ 加，- 减');
r('mi.c.set_i', '.f.value', 'Value', 'Значение', 'Значення', '数值');

// 488
r('mi.c.con', '', 'Write a line to the game log', 'Записать строку в лог игры', 'Записати рядок у лог гри', '向游戏日志写一行');
r('mi.c.con', '.d', 'Writes a text line to game.log when this runs. Good for checking that a trigger fired.',
  'Пишет строку текста в game.log, когда команда выполняется. Удобно проверять, что триггер сработал.',
  'Пише рядок тексту в game.log, коли команда виконується. Зручно перевіряти, що тригер спрацював.',
  '执行时向 game.log 写一行文字，便于确认触发器是否运行。');
r('mi.c.con', '.f.text', 'Log text', 'Текст для лога', 'Текст для логу', '日志文字');

// 489
r('mi.c.call', '', 'Call a named function', 'Вызвать функцию по имени', 'Викликати функцію за ім\'ям', '调用命名函数');
r('mi.c.call', '.d', ...nt(['Runs the commands of a function from {functions} in {Helpers}, on the units the selector picks.',
  'Выполняет команды функции из {functions} в {Helpers} для юнитов, которых выбрал селектор.',
  'Виконує команди функції з {functions} у {Helpers} для юнітів, яких вибрав селектор.',
  '对选择器选中的单位执行 {Helpers} 的 {functions} 中某个函数的命令。']));
r('mi.c.call', '.w', 'Without the context block the function runs on the units of the calling trigger. An unknown name only warns in the log.',
  'Без блока context функция работает с юнитами вызвавшего триггера. Неизвестное имя даёт только предупреждение в логе.',
  'Без блоку context функція працює з юнітами тригера, що її викликав. Невідоме ім\'я дає лише попередження в лозі.',
  '没有 context 块时，函数作用于调用它的触发器的单位。未知名称只会在日志中警告。');
r('mi.c.call', '.n', 'A function of that name in {functions} of {Helpers}.',
  'Функция с этим именем в {functions} блока {Helpers}.',
  'Функція з цим ім\'ям у {functions} блоку {Helpers}.',
  '{Helpers} 的 {functions} 中有该名称的函数。');
r('mi.c.call', '.f.function', 'Function name', 'Имя функции', 'Ім\'я функції', '函数名');
tagF('mi.c.call');

// 490
r('mi.c.thread', '', 'Run statements as their own thread', 'Запустить команды отдельным потоком', 'Запустити команди окремим потоком', '把语句作为独立线程运行');
r('mi.c.thread', '.d', ...nt(['Runs the commands inside on their own, so a delay inside does not hold up the commands after this block.',
  'Выполняет команды внутри отдельно, так что задержка внутри не держит команды после этого блока.',
  'Виконує команди всередині окремо, тож затримка всередині не тримає команди після цього блоку.',
  '单独运行其中的命令，内部的延迟不会拖住此块之后的命令。']));
r('mi.c.thread', '.f.time', 'Wait first', 'Сначала подождать', 'Спершу зачекати', '先等待');
r('mi.c.thread', '.f.text', 'Log text', 'Текст для лога', 'Текст для логу', '日志文字');

// 491
r('mi.c.scenario', '', 'Cutscene: camera path + message', 'Сценка: путь камеры и сообщение', 'Сценка: шлях камери й повідомлення', '过场：镜头路径加消息');
r('mi.c.scenario', '.d', 'Flies the camera along a camera path from {Helpers} and shows a message; when the player goes on, the event is set.',
  'Ведёт камеру по пути камеры из {Helpers} и показывает сообщение; когда игрок продолжает, ставится событие.',
  'Веде камеру шляхом камери з {Helpers} і показує повідомлення; коли гравець продовжує, ставиться подія.',
  '让镜头沿 {Helpers} 中的镜头路径移动并显示消息；玩家继续后会设置该事件。');
r('mi.c.scenario', '.w', 'Stock missions also add {disable_cancel} in camera, and {do_not_store_camera} {do_not_restore_camera} to leave the camera where the path ends.',
  'Миссии игры также добавляют {disable_cancel} в camera и {do_not_store_camera} {do_not_restore_camera}, чтобы оставить камеру в конце пути.',
  'Місії гри також додають {disable_cancel} у camera і {do_not_store_camera} {do_not_restore_camera}, щоб лишити камеру в кінці шляху.',
  '游戏自带任务还会在 camera 中加 {disable_cancel}，并加 {do_not_store_camera} {do_not_restore_camera} 让镜头停在路径终点。');
r('mi.c.scenario', '.n', 'A camera path of that name in {Helpers}.',
  'Путь камеры с этим именем в {Helpers}.',
  'Шлях камери з цим ім\'ям у {Helpers}.',
  '{Helpers} 中有该名称的镜头路径。');
r('mi.c.scenario', '.f.text', 'Message key', 'Ключ сообщения', 'Ключ повідомлення', '消息键');
r('mi.c.scenario', '.f.text.h', '$/ and a key of the mission text file, or empty', '$/ и ключ из файла текстов миссии, или пусто', '$/ і ключ із файлу текстів місії, або порожньо', '$/ 加上任务文本文件中的键，或留空');
r('mi.c.scenario', '.f.camera', 'Camera path', 'Путь камеры', 'Шлях камери', '镜头路径');
r('mi.c.scenario', '.f.event', 'Event when done', 'Событие по окончании', 'Подія після завершення', '完成时的事件');

// 492
r('mi.c.fade', '', 'Fade the screen', 'Затемнить экран', 'Затемнити екран', '屏幕淡入淡出');
r('mi.c.fade', '.d', 'As written, the screen comes back from the colour over the time (fade in).',
  'В таком виде экран за это время проявляется из цвета (появление).',
  'У такому вигляді екран за цей час проявляється з кольору (поява).',
  '按此写法，屏幕在该时间内从该颜色中恢复（淡入）。');
r('mi.c.fade', '.w', 'Add {on} as the first line to fade the screen out to the colour.',
  'Добавьте {on} первой строкой, чтобы экран ушёл в этот цвет.',
  'Додайте {on} першим рядком, щоб екран пішов у цей колір.',
  '把 {on} 加为第一行，屏幕就会淡出到该颜色。');
r('mi.c.fade', '.f.time', 'Fade time', 'Время перехода', 'Час переходу', '渐变时间');
r('mi.c.fade', '.f.color', 'Colour', 'Цвет', 'Колір', '颜色');
r('mi.c.fade', '.f.color.h', '0xAARRGGBB, 0xff000000 is black', '0xAARRGGBB, 0xff000000 — чёрный', '0xAARRGGBB, 0xff000000 — чорний', '0xAARRGGBB，0xff000000 为黑色');

// 493
r('mi.c.set_clip', '', 'Set the map bounds (clipper)', 'Задать границы карты (clipper)', 'Задати межі мапи (clipper)', '设置地图边界（clipper）');
r('mi.c.set_clip', '.d', 'Switches the playable area to the clipper of that name, so the camera and units stay inside it.',
  'Переключает игровую область на clipper с этим именем: камера и юниты остаются внутри.',
  'Перемикає ігрову область на clipper з цим ім\'ям: камера й юніти лишаються всередині.',
  '把可玩区域切换为该名称的 clipper，镜头和单位都留在其中。');
r('mi.c.set_clip', '.n', 'A clipper of that name in {Helpers}.',
  'Clipper с этим именем в {Helpers}.',
  'Clipper з цим ім\'ям у {Helpers}.',
  '{Helpers} 中有该名称的 clipper。');
r('mi.c.set_clip', '.f.name', 'Clipper name', 'Имя clipper', 'Ім\'я clipper', 'clipper 名');

// 494
r('mi.c.cam_bone', '', 'Camera follows a bone', 'Камера следует за костью', 'Камера стежить за кісткою', '镜头跟随骨骼');
r('mi.c.cam_bone', '.d', 'Ties the camera to a bone of an object (a tank turret, a visor) with an offset and angles. ' + NMP[0],
  'Привязывает камеру к кости объекта (башня танка, смотровая щель) со смещением и углами. ' + NMP[1],
  'Прив\'язує камеру до кістки об\'єкта (башта танка, оглядова щілина) зі зміщенням і кутами. ' + NMP[2],
  '把镜头绑定到物体的骨骼（坦克炮塔、观察窗），带偏移和角度。' + NMP[3]);
r('mi.c.cam_bone', '.w', 'Crashes the game in multiplayer. To let the camera go, run it again with entity 0 and no bone or apply.',
  'В мультиплеере игра падает. Чтобы отпустить камеру, выполните команду снова с entity 0, без bone и apply.',
  'У мультиплеєрі гра падає. Щоб відпустити камеру, виконайте команду знову з entity 0, без bone і apply.',
  '多人游戏中会导致崩溃。要释放镜头，再次执行该命令，entity 设为 0，不写 bone 和 apply。');
r('mi.c.cam_bone', '.f.entity', 'Object id', 'Id объекта', 'Id об\'єкта', '物体 id');
r('mi.c.cam_bone', '.f.entity.h', 'The number of the object in the mission file', 'Номер объекта в файле миссии', 'Номер об\'єкта у файлі місії', '物体在任务文件中的编号');
r('mi.c.cam_bone', '.f.bone', 'Bone', 'Кость', 'Кістка', '骨骼');
r('mi.c.cam_bone', '.f.fov', 'Field of view', 'Угол обзора', 'Кут огляду', '视野');
r('mi.c.cam_bone', '.f.fov.h', '0 keeps the current one', '0 оставляет текущий', '0 лишає поточний', '0 表示保持当前值');
r('mi.c.cam_bone', '.f.x', 'Offset back/forward', 'Смещение назад/вперёд', 'Зміщення назад/вперед', '前后偏移');
r('mi.c.cam_bone', '.f.y', 'Offset sideways', 'Смещение вбок', 'Зміщення вбік', '左右偏移');
r('mi.c.cam_bone', '.f.z', 'Offset up', 'Смещение вверх', 'Зміщення вгору', '向上偏移');
r('mi.c.cam_bone', '.f.yangle', 'Turn angle', 'Угол поворота', 'Кут повороту', '水平角');
r('mi.c.cam_bone', '.f.zangle', 'Tilt angle', 'Угол наклона', 'Кут нахилу', '俯仰角');

// 495
r('mi.c.autosave', '', 'Save the game', 'Сохранить игру', 'Зберегти гру', '保存游戏');
r('mi.c.autosave', '.d', 'Makes an autosave of the mission at this point.',
  'Делает автосохранение миссии в этот момент.',
  'Робить автозбереження місії в цей момент.',
  '在此时自动保存任务。');

// 496
r('mi.c.game_speed', '', 'Ask for a game speed', 'Запросить скорость игры', 'Запросити швидкість гри', '请求游戏速度');
r('mi.c.game_speed', '.d', ...nt(['Changes the game speed smoothly to the named level. Leave out the mode line to go back to normal speed. ' + NMP[0],
  'Плавно меняет скорость игры на названный уровень. Без строки mode скорость возвращается к обычной. ' + NMP[1],
  'Плавно змінює швидкість гри на названий рівень. Без рядка mode швидкість повертається до звичайної. ' + NMP[2],
  '把游戏速度平滑地调到指定级别。去掉 mode 一行则恢复正常速度。' + NMP[3]]));
r('mi.c.game_speed', '.w', 'Has no effect in multiplayer.',
  'В мультиплеере не действует.',
  'У мультиплеєрі не діє.',
  '在多人游戏中无效。');
r('mi.c.game_speed', '.f.mode', 'Speed', 'Скорость', 'Швидкість', '速度');

// 497
r('mi.c.fog_mode', '', 'Fog of war on or off', 'Туман войны вкл. или выкл.', 'Туман війни увімк. чи вимк.', '开关战争迷雾');
r('mi.c.fog_mode', '.d', 'Turns the fog of war over the whole map on or off.',
  'Включает или выключает туман войны на всей карте.',
  'Вмикає або вимикає туман війни на всій мапі.',
  '开启或关闭整张地图的战争迷雾。');
r('mi.c.fog_mode', '.f.enable', 'Fog', 'Туман', 'Туман', '迷雾');

// 498
r('mi.c.fog_in_zone', '', 'Clear or add fog in a zone', 'Убрать или добавить туман в зоне', 'Прибрати чи додати туман у зоні', '在区域内清除或添加迷雾');
r('mi.c.fog_in_zone', '.d', ...nt(['enable on clears the fog of war over a zone; off puts it back.',
  'enable on убирает туман войны над зоной; off возвращает его.',
  'enable on прибирає туман війни над зоною; off повертає його.',
  'enable on 清除某区域的战争迷雾；off 则恢复。']));
r('mi.c.fog_in_zone', '.n', 'A zone of that name in {Helpers}.',
  'Зона с этим именем в {Helpers}.',
  'Зона з цим ім\'ям у {Helpers}.',
  '{Helpers} 中有该名称的区域。');
r('mi.c.fog_in_zone', '.f.zone', 'Zone name', 'Имя зоны', 'Ім\'я зони', '区域名');
r('mi.c.fog_in_zone', '.f.enable', 'Clear the fog', 'Убрать туман', 'Прибрати туман', '清除迷雾');

// 499
r('mi.c.sound', '', 'Play a sound', 'Проиграть звук', 'Програти звук', '播放声音');
r('mi.c.sound', '.d', 'Plays a sound for the player.',
  'Проигрывает звук для игрока.',
  'Програє звук для гравця.',
  '为玩家播放一个声音。');
r('mi.c.sound', '.w', 'Add {waypoint "13"} to play it at a place on the map.',
  'Добавьте {waypoint "13"}, чтобы звук звучал в точке на карте.',
  'Додайте {waypoint "13"}, щоб звук лунав у точці на мапі.',
  '加上 {waypoint "13"} 可在地图上的某处播放。');
r('mi.c.sound', '.f.name', 'Sound', 'Звук', 'Звук', '声音');
r('mi.c.sound', '.f.name.h', 'A sound path under sound/, without the extension', 'Путь к звуку в sound/, без расширения', 'Шлях до звуку в sound/, без розширення', 'sound/ 下的声音路径，不带扩展名');

// 500
r('mi.c.music', '', 'Play or stop music', 'Включить или остановить музыку', 'Увімкнути чи зупинити музику', '播放或停止音乐');
r('mi.c.music', '.d', 'Stops the music that plays and starts a music file, fading in and looping.',
  'Останавливает текущую музыку и запускает музыкальный файл с плавным входом и повтором.',
  'Зупиняє поточну музику й запускає музичний файл із плавним входом і повтором.',
  '停止正在播放的音乐，并淡入、循环播放一个音乐文件。');
r('mi.c.music', '.w', 'To stop one file write {stop "/music/..."} in place of the start line.',
  'Чтобы остановить один файл, напишите {stop "/music/..."} вместо строки start.',
  'Щоб зупинити один файл, напишіть {stop "/music/..."} замість рядка start.',
  '要停止某个文件，用 {stop "/music/..."} 代替 start 这一行。');
r('mi.c.music', '.f.file', 'Music file', 'Музыкальный файл', 'Музичний файл', '音乐文件');
r('mi.c.music', '.f.fade', 'Fade-in time', 'Время нарастания', 'Час наростання', '淡入时间');

// 501
r('mi.c.environment', '', 'Change weather and light', 'Сменить погоду и свет', 'Змінити погоду й світло', '改变天气与光照');
r('mi.c.environment', '.d', 'Switches the map to another weather and light setting.',
  'Переключает карту на другую погоду и освещение.',
  'Перемикає мапу на іншу погоду й освітлення.',
  '把地图切换为另一种天气与光照设置。');
r('mi.c.environment', '.w', 'Some stock maps add {time -1} {apply} after the name.',
  'Некоторые карты игры добавляют {time -1} {apply} после имени.',
  'Деякі мапи гри додають {time -1} {apply} після імені.',
  '有些游戏自带地图会在名称后加 {time -1} {apply}。');
r('mi.c.environment', '.f.name', 'Environment', 'Окружение', 'Оточення', '环境');
r('mi.c.environment', '.f.name.h', 'A file name under set/environment, without the extension', 'Имя файла в set/environment, без расширения', 'Ім\'я файлу в set/environment, без розширення', 'set/environment 下的文件名，不带扩展名');

// 502
r('mi.c.gameover', '', 'Win or lose', 'Победа или поражение', 'Перемога чи поразка', '胜利或失败');
r('mi.c.gameover', '.d', 'Ends the mission with a win or a loss.',
  'Завершает миссию победой или поражением.',
  'Завершує місію перемогою або поразкою.',
  '以胜利或失败结束任务。');
r('mi.c.gameover', '.w', 'The loss word is loose, as the game spells it; lose does not work.',
  'Поражение пишется loose, как в игре; lose не работает.',
  'Поразка пишеться loose, як у грі; lose не працює.',
  '失败要写成 loose（游戏的拼写），写 lose 无效。');
r('mi.c.gameover', '.f.result', 'Result', 'Итог', 'Підсумок', '结果');

// 503
r('mi.a.frontline', '', 'Phased frontline mission (frontline.mi)', 'Миссия фронта по фазам (frontline.mi)', 'Місія фронту за фазами (frontline.mi)', '分阶段前线任务（frontline.mi）');
r('mi.a.frontline', '.d', 'A whole frontline.mi: spawn points and flags for phase 1 and phase 2. When the attackers (team a) take the phase 1 flag, the front moves to phase 2.',
  'Целый frontline.mi: точки появления и флаги для фазы 1 и фазы 2. Когда атакующие (команда a) берут флаг фазы 1, фронт переходит к фазе 2.',
  'Цілий frontline.mi: точки появи й прапори для фази 1 і фази 2. Коли атакувальники (команда a) беруть прапор фази 1, фронт переходить до фази 2.',
  '完整的 frontline.mi：第 1 阶段和第 2 阶段的出生点与旗帜。进攻方（a 队）夺下第 1 阶段旗帜后，前线推进到第 2 阶段。');
r('mi.a.frontline', '.w', 'The positions come from the stock map 1v1_icy_village: move them onto your map. Every id (0x8011 and so on) must be unused in the map file.',
  'Координаты взяты с карты игры 1v1_icy_village: перенесите их на свою карту. Каждый id (0x8011 и т. д.) не должен быть занят в файле карты.',
  'Координати взято з мапи гри 1v1_icy_village: перенесіть їх на свою мапу. Кожен id (0x8011 тощо) не має бути зайнятий у файлі мапи.',
  '这些坐标来自游戏地图 1v1_icy_village：请移到你的地图上。每个 id（0x8011 等）在地图文件中都不能已被占用。');
r('mi.a.frontline', '.n', 'A map folder under map/multi/a_frontlines/; the frontline mode has no other mode file.',
  'Папка карты в map/multi/a_frontlines/; у режима фронта нет другого файла режима.',
  'Тека мапи в map/multi/a_frontlines/; режим фронту не має іншого файлу режиму.',
  'map/multi/a_frontlines/ 下的地图文件夹；前线模式没有其他模式文件。');
r('mi.a.frontline', '.f.environment', 'Weather and light', 'Погода и освещение', 'Погода й освітлення', '天气与光照');
r('mi.a.frontline', '.f.environment.h', 'A file name under set/environment, without the extension', 'Имя файла в set/environment, без расширения', 'Ім\'я файлу в set/environment, без розширення', 'set/environment 下的文件名，不带扩展名');
r('mi.a.frontline', '.f.music', 'Background music', 'Фоновая музыка', 'Фонова музика', '背景音乐');

// 504
r('mi.a.extraspawn', '', 'Hand a unit to the co-op extra spawn list', 'Передать юнит в список доп. появления кооператива', 'Передати юніт у список дод. появи кооперативу', '把单位交给合作模式的额外出生列表');
r('mi.a.extraspawn', '.d', ...nt(['Sends each picked unit to the engine as an extra spawn event (for co-op games).',
  'Отправляет каждый выбранный юнит в движок как событие дополнительного появления (для кооператива).',
  'Надсилає кожен вибраний юніт у рушій як подію додаткової появи (для кооперативу).',
  '把每个选中的单位作为额外出生事件发给引擎（用于合作模式）。']));
r('mi.a.extraspawn', '.w', 'Engine only: no stock mission uses it, and what the game does with the event is not known.',
  'Есть только в движке: ни одна миссия игры его не использует, и что игра делает с событием, неизвестно.',
  'Є лише в рушії: жодна місія гри його не використовує, і що гра робить із подією, невідомо.',
  '仅存在于引擎中：游戏自带任务都没有用到，也不清楚游戏如何处理该事件。');
tagF('mi.a.extraspawn');

// 505
r('mi.a.stmt_mode', '', 'Event term in a statement with mode', 'Условие по событию в операторе, с mode', 'Умова за подією в операторі, з mode', '语句中带 mode 的事件条件');
r('mi.a.stmt_mode', '.d', 'A condition for if, while or case that is true while the event is NOT set.',
  'Условие для if, while или case, которое истинно, пока событие НЕ поставлено.',
  'Умова для if, while або case, яка істинна, поки подію НЕ поставлено.',
  '用于 if、while 或 case 的条件，在事件未被设置时为真。');
r('mi.a.stmt_mode', '.w', 'Leave out the mode line for the usual check (true once the event is set).',
  'Уберите строку mode для обычной проверки (истинно, когда событие поставлено).',
  'Приберіть рядок mode для звичайної перевірки (істинно, коли подію поставлено).',
  '去掉 mode 一行即为普通检查（事件被设置后为真）。');
r('mi.a.stmt_mode', '.f.id', 'Event name', 'Имя события', 'Ім\'я події', '事件名');

// 506
r('mi.a.zonepos', '', 'Brain zone centre', 'Центр зоны в Brain', 'Центр зони в Brain', 'Brain 区域中心');
r('mi.a.zonepos', '.d', 'The centre point a unit with move_mode zone keeps to.',
  'Центральная точка, которой держится юнит с move_mode zone.',
  'Центральна точка, якої тримається юніт із move_mode zone.',
  '使用 move_mode zone 的单位所守的中心点。');
r('mi.a.zonepos', '.n', '{move_mode zone} in the {Properties} of the same {Brain}.',
  '{move_mode zone} в {Properties} того же {Brain}.',
  '{move_mode zone} у {Properties} того самого {Brain}.',
  '同一个 {Brain} 的 {Properties} 中有 {move_mode zone}。');
r('mi.a.zonepos', '.f.x', 'X on the map', 'X на карте', 'X на мапі', '地图 X');
r('mi.a.zonepos', '.f.y', 'Y on the map', 'Y на карте', 'Y на мапі', '地图 Y');

// 507
r('mi.a.lookat', '', 'Brain look-at point', 'Точка взгляда в Brain', 'Точка погляду в Brain', 'Brain 注视点');
r('mi.a.lookat', '.d', 'The point on the map a unit looks at when the mission starts.',
  'Точка на карте, куда юнит смотрит в начале миссии.',
  'Точка на мапі, куди юніт дивиться на початку місії.',
  '任务开始时单位朝向的地图点。');
r('mi.a.lookat', '.f.x', 'X on the map', 'X на карте', 'X на мапі', '地图 X');
r('mi.a.lookat', '.f.y', 'Y on the map', 'Y на карте', 'Y на мапі', '地图 Y');
r('mi.a.lookat', '.f.z', 'Height', 'Высота', 'Висота', '高度');

module.exports = rows;

// Code Pieces texts, group mi-sys-2 (large mission systems, numbers 640 to 643). Rows [key, en, ru, uk, zh].
// Field labels of copies (name_2, name_3, ...) are made from the label of the first copy ("Same ... again").
// Author: Imperator_Aug (ARSENAL, ia-d36e299f)
'use strict';

const pieces = require('../pieces/mi-sys-2.js').pieces;
const rows = [];
const K = 'ide.kit.p.';
function R(key, en, ru, uk, zh) { rows.push([key, en, ru, uk, zh]); }

// field labels: base labels; every copy name_N of the piece gets "Same <label> again"
function F(id, labels) {
  const p = pieces.find(x => x.id === id);
  for (const name of Object.keys(p.f)) {
    let baseName = name, copy = false;
    if (!labels[name]) { const m = /^(.+)_(\d+)$/.exec(name); if (m && labels[m[1]]) { baseName = m[1]; copy = true; } }
    const l = labels[baseName];
    if (!l) throw new Error('mi-sys-2 lang: no label for ' + id + ' field ' + name);
    const lab = l.slice(0, 4), hint = l[4];
    if (!copy) R(K + id + '.f.' + name, lab[0], lab[1], lab[2], lab[3]);
    else R(K + id + '.f.' + name, 'Same ' + lab[0].charAt(0).toLowerCase() + lab[0].slice(1) + ' again',
      lab[1] + ' (ещё раз)', lab[2] + ' (ще раз)', lab[3] + '（同上）');
    if (hint && !copy) R(K + id + '.f.' + name + '.h', hint[0], hint[1], hint[2], hint[3]);
  }
}

const POS = ['x y z, three numbers', 'x y z, три числа', 'x y z, три числа', 'x y z，三个数'];
const TEXTKEY = ['Key of a row in the mission text file, without $/', 'Ключ строки в текстовом файле миссии, без $/',
  'Ключ рядка в текстовому файлі місії, без $/', '任务文本文件中某行的键名，不带 $/'];

// 640
let id = 'mi.sys.intro_cutscene_with_dialogue_then_ha';
R(K + id, 'Intro cutscene with dialogue, then hand over', 'Вступительная сцена с диалогом, затем передача управления',
  'Вступна сцена з діалогом, потім передача керування', '带对话的开场过场，然后交还控制');
R(K + id + '.d',
  'Adds a camera path and two triggers to Helpers. At start the screen fades in, the camera flies a path that cannot be skipped while two speakers say three lines; when the path ends the player gets the start units, the event start is raised, background music loops and the game saves. Not tried in game. Not for multiplayer maps.',
  'Добавляет в Helpers путь камеры и два триггера. В начале экран проявляется, камера летит по пути, который нельзя пропустить, а два персонажа говорят три реплики; когда путь кончается, игрок получает стартовые юниты, поднимается событие start, играет фоновая музыка и игра сохраняется. В игре не проверено. Не для сетевых карт.',
  'Додає в Helpers шлях камери і два тригери. На початку екран проявляється, камера летить шляхом, який не можна пропустити, а два персонажі кажуть три репліки; коли шлях закінчується, гравець отримує стартові юніти, піднімається подія start, грає фонова музика і гра зберігається. У грі не перевірено. Не для мережевих карт.',
  '在 Helpers 中加入一条镜头路径和两个触发器。开始时画面淡入，镜头沿不可跳过的路径飞行，两名角色说三句台词；路径结束后玩家获得初始单位，触发 start 事件，循环播放背景音乐并自动存档。未在游戏中测试。不适用于多人地图。');
R(K + id + '.w',
  'The hand-over waits for the end of the camera path: with disable_cancel the engine counts the scene as done when the path ends (read, not tried). If the file already declares the event start, delete the second one. Keep the lines shorter than the path (1 + 4 + 4 s here, path 12 s).',
  'Передача ждёт конца пути камеры: с disable_cancel движок считает сцену законченной, когда путь кончился (прочитано, не проверено). Если в файле уже есть событие start, удалите второе объявление. Реплики должны быть короче пути (здесь 1 + 4 + 4 с, путь 12 с).',
  'Передача чекає кінця шляху камери: з disable_cancel рушій вважає сцену завершеною, коли шлях скінчився (прочитано, не перевірено). Якщо у файлі вже є подія start, видаліть друге оголошення. Репліки мають бути коротші за шлях (тут 1 + 4 + 4 с, шлях 12 с).',
  '交还控制要等镜头路径结束：带 disable_cancel 时，引擎在路径结束时视场景为完成（，已读代码，未测试）。如果文件里已声明 start 事件，请删除第二个。台词总长要短于路径（这里 1 + 4 + 4 秒，路径 12 秒）。');
R(K + id + '.n',
  'Player start units tagged player_start, the two speaker units with the tags of the fields, text rows for the three lines in the mission text file, and a zone with the name of the game zone field. Move the camera keys onto your map.',
  'Стартовые юниты игрока с тегом player_start, два говорящих юнита с тегами из полей, строки трёх реплик в текстовом файле миссии и зона с именем из поля игровой зоны. Перенесите ключи камеры на свою карту.',
  'Стартові юніти гравця з тегом player_start, два юніти, що говорять, з тегами з полів, рядки трьох реплік у текстовому файлі місії та зона з ім\'ям з поля ігрової зони. Перенесіть ключі камери на свою карту.',
  '带 player_start 标签的玩家初始单位，两个说话单位（标签见字段），任务文本文件中三句台词的行，以及名称与“游戏区域”字段相同的区域。把镜头关键点移到你的地图上。');
F(id, {
  cam1_pos: ['Camera start point', 'Начальная точка камеры', 'Початкова точка камери', '镜头起点', POS],
  cam1_look: ['Camera start looks at', 'Куда смотрит камера в начале', 'Куди дивиться камера на початку', '镜头起点朝向', POS],
  cam2_time: ['Seconds to key 2', 'Секунд до ключа 2', 'Секунд до ключа 2', '到关键点 2 的秒数'],
  cam2_pos: ['Camera key 2 point', 'Точка ключа 2', 'Точка ключа 2', '关键点 2 位置', POS],
  cam2_look: ['Key 2 looks at', 'Куда смотрит ключ 2', 'Куди дивиться ключ 2', '关键点 2 朝向', POS],
  cam3_time: ['Seconds to key 3', 'Секунд до ключа 3', 'Секунд до ключа 3', '到关键点 3 的秒数'],
  cam3_pos: ['Camera key 3 point', 'Точка ключа 3', 'Точка ключа 3', '关键点 3 位置', POS],
  cam3_look: ['Key 3 looks at', 'Куда смотрит ключ 3', 'Куди дивиться ключ 3', '关键点 3 朝向', POS],
  intro_music: ['Intro music file', 'Музыка вступления', 'Музика вступу', '开场音乐文件'],
  speaker1: ['First speaker tag', 'Тег первого говорящего', 'Тег першого мовця', '第一说话者标签'],
  line1: ['First line text key', 'Ключ первой реплики', 'Ключ першої репліки', '第一句台词键名', TEXTKEY],
  gap: ['Pause between lines', 'Пауза между репликами', 'Пауза між репліками', '台词间隔'],
  speaker2: ['Second speaker tag', 'Тег второго говорящего', 'Тег другого мовця', '第二说话者标签'],
  line2: ['Second line text key', 'Ключ второй реплики', 'Ключ другої репліки', '第二句台词键名', TEXTKEY],
  line3: ['Third line text key', 'Ключ третьей реплики', 'Ключ третьої репліки', '第三句台词键名', TEXTKEY],
  gamezone: ['Game zone name', 'Имя игровой зоны', "Ім'я ігрової зони", '游戏区域名',
    ['The zone the start units are handed over in', 'Зона, в которой передаются стартовые юниты', 'Зона, у якій передаються стартові юніти', '交给玩家的初始单位所在区域']],
  game_music: ['Background music file', 'Фоновая музыка', 'Фонова музика', '背景音乐文件']
});

// 641
id = 'mi.sys.convoy_escort';
R(K + id, 'Convoy escort', 'Сопровождение колонны', 'Супровід колони', '护送车队');
R(K + id + '.d',
  'Adds a 4-point route, a depot zone, a task and 7 triggers. When convoy_go is raised the trucks drive the route slowly; at the third point a hidden ambush wakes up; enough crewed trucks in the depot completes the task, too few left fails it. With no escort near, the trucks stop and go on when the escort is back. Not tried in game. Not for multiplayer maps.',
  'Добавляет маршрут из 4 точек, зону склада, задачу и 7 триггеров. Когда поднято convoy_go, грузовики медленно едут по маршруту; у третьей точки просыпается скрытая засада; достаточно грузовиков с экипажем на складе выполняет задачу, слишком мало оставшихся проваливает её. Без сопровождения рядом грузовики стоят и едут дальше, когда оно вернулось. В игре не проверено. Не для сетевых карт.',
  'Додає маршрут із 4 точок, зону складу, завдання і 7 тригерів. Коли піднято convoy_go, вантажівки повільно їдуть маршрутом; біля третьої точки прокидається прихована засідка; досить вантажівок з екіпажем на складі виконує завдання, замало тих, що лишилися, провалює його. Без супроводу поруч вантажівки стоять і їдуть далі, коли він повернувся. У грі не перевірено. Не для мережевих карт.',
  '加入一条 4 点路线、一个仓库区域、一个任务和 7 个触发器。触发 convoy_go 后卡车慢速沿路线行驶；到第三个点时隐藏的伏兵苏醒；足够多有乘员的卡车到达仓库即完成任务，剩下的太少则任务失败。附近没有护卫时卡车停下，护卫回来后继续前进。未在游戏中测试。不适用于多人地图。');
R(K + id + '.w',
  'Raise the event convoy_go from your own start trigger: nothing else starts the convoy. state inhabited drops when a crew bails out, so an intact empty truck counts as lost. The stop uses drop orders; going on sends the trucks to the next point by the last leg event (read, not tried). Men inside vehicles count for the escort test.',
  'Поднимите событие convoy_go своим стартовым триггером: больше ничто колонну не запускает. state inhabited пропадает, когда экипаж покидает машину, поэтому целый пустой грузовик считается потерянным. Остановка делается через drop orders; продолжение посылает грузовики к следующей точке по последнему событию участка (прочитано, не проверено). Бойцы в машинах тоже считаются сопровождением.',
  'Підніміть подію convoy_go своїм стартовим тригером: більше ніщо колону не запускає. state inhabited зникає, коли екіпаж покидає машину, тому ціла порожня вантажівка вважається втраченою. Зупинка робиться через drop orders; продовження посилає вантажівки до наступної точки за останньою подією ділянки (прочитано, не перевірено). Бійці в машинах теж рахуються супроводом.',
  '用你自己的开始触发器触发 convoy_go 事件：没有别的东西会让车队出发。乘员弃车后 state inhabited 不再成立，所以完好但无人的卡车算作损失。停车用 drop orders（）；继续前进时按最后一个路段事件把卡车派往下一个点（已读代码，未测试）。车内的士兵也算护卫。');
R(K + id + '.n',
  'Crewed trucks tagged convoy_truck (board the crews by a trigger: placed vehicles start empty), escort units with the escort tag, ambush units with the ambush tag and also tagged hidden, a text row for the task. Move the route points and the depot onto your map; the last point lies in the depot.',
  'Грузовики с экипажем и тегом convoy_truck (посадите экипажи триггером: поставленные машины пустые), юниты сопровождения с тегом из поля, юниты засады с тегом засады и тегом hidden, строка текста задачи. Перенесите точки маршрута и склад на свою карту; последняя точка лежит на складе.',
  'Вантажівки з екіпажем і тегом convoy_truck (посадіть екіпажі тригером: поставлені машини порожні), юніти супроводу з тегом з поля, юніти засідки з тегом засідки і тегом hidden, рядок тексту завдання. Перенесіть точки маршруту і склад на свою карту; остання точка лежить на складі.',
  '带 convoy_truck 标签、有乘员的卡车（用触发器让乘员上车：放置的车辆开始时是空的），带护卫标签的护卫单位，带伏兵标签并同时带 hidden 标签的伏兵单位，任务文本的一行。把路线点和仓库移到你的地图上；最后一个点在仓库内。');
F(id, {
  depot_pos: ['Depot centre', 'Центр склада', 'Центр складу', '仓库中心', POS],
  depot_radius: ['Depot radius', 'Радиус склада', 'Радіус складу', '仓库半径'],
  task_text: ['Task text key', 'Ключ текста задачи', 'Ключ тексту завдання', '任务文本键名', TEXTKEY],
  r1_pos: ['Route point 1', 'Точка маршрута 1', 'Точка маршруту 1', '路线点 1', POS],
  r2_pos: ['Route point 2', 'Точка маршрута 2', 'Точка маршруту 2', '路线点 2', POS],
  r3_pos: ['Route point 3 (ambush)', 'Точка 3 (засада)', 'Точка 3 (засідка)', '路线点 3（伏击）', POS],
  ambush: ['Ambush units tag', 'Тег засады', 'Тег засідки', '伏兵标签'],
  need: ['Trucks that must arrive', 'Сколько грузовиков должно дойти', 'Скільки вантажівок має дійти', '必须到达的卡车数'],
  escort: ['Escort units tag', 'Тег сопровождения', 'Тег супроводу', '护卫标签'],
  distance: ['Escort distance', 'Дистанция сопровождения', 'Дистанція супроводу', '护卫距离',
    ['Trucks stop when no escort is this close', 'Грузовики стоят, если сопровождение дальше', 'Вантажівки стоять, якщо супровід далі', '护卫离得比这远时卡车停下']]
});

// 642
id = 'mi.sys.king_of_the_hill_single_player';
R(K + id, 'King of the hill (single player)', 'Царь горы (одиночная игра)', 'Цар гори (одиночна гра)', '山丘之王（单人）');
R(K + id + '.d',
  'Adds a hill zone, a task, a score var, a progress line and 5 triggers. Every second the player alone holds the hill adds a point; every 90 s a hidden reserve wakes up and attacks the hill; at 120 points the player wins, with no men left the player loses. Not tried in game. Not for multiplayer maps.',
  'Добавляет зону холма, задачу, переменную счёта, строку прогресса и 5 триггеров. Каждая секунда, пока на холме только игрок, даёт очко; каждые 90 с просыпается скрытый резерв и атакует холм; при 120 очках игрок побеждает, без бойцов проигрывает. В игре не проверено. Не для сетевых карт.',
  'Додає зону пагорба, завдання, змінну рахунку, рядок прогресу і 5 тригерів. Кожна секунда, поки на пагорбі лише гравець, дає очко; кожні 90 с прокидається прихований резерв і атакує пагорб; при 120 очках гравець перемагає, без бійців програє. У грі не перевірено. Не для мережевих карт.',
  '加入山丘区域、任务、计分变量、进度行和 5 个触发器。玩家独占山丘的每一秒得 1 分；每 90 秒一支隐藏的预备队苏醒并进攻山丘；达到 120 分玩家获胜，没有士兵则失败。未在游戏中测试。不适用于多人地图。');
R(K + id + '.w',
  'A point takes about 1.25 s: the trigger checks 4 times a second and waits 1 s after each point. Each counter-attack reveals the same reserve; after the first one it only re-orders the survivors. How objective_progress shows the count is not seen [T]. The show trigger runs at mission start; to wait for an intro, give it a term on the start event.',
  'Очко занимает около 1,25 с: триггер проверяется 4 раза в секунду и ждёт 1 с после каждого очка. Каждая контратака открывает тот же резерв; после первой она только заново отдаёт приказ выжившим. Как objective_progress показывает счёт, не видели [T]. Триггер показа срабатывает в начале миссии; чтобы дождаться вступления, добавьте ему условие на событие start.',
  'Очко займає близько 1,25 с: тригер перевіряється 4 рази на секунду і чекає 1 с після кожного очка. Кожна контратака відкриває той самий резерв; після першої вона лише знову віддає наказ тим, хто вижив. Як objective_progress показує рахунок, не бачили [T]. Тригер показу спрацьовує на початку місії; щоб дочекатися вступу, додайте йому умову на подію start.',
  '每得 1 分约需 1.25 秒：触发器每秒检查 4 次，每次得分后等 1 秒。每次反攻显露的是同一支预备队；第一次之后只会给幸存者重新下令。objective_progress 如何显示分数未见过 [T]。显示触发器在任务开始时运行；要等开场结束，给它加一个 start 事件条件。');
R(K + id + '.n',
  'Player units with the player tag, enemy units on the hill tagged hill_enemy, a hidden counter-attack group tagged hill_reserve and hidden, text rows for the task and the progress line. Move the hill zone and its waypoint onto your map.',
  'Юниты игрока с тегом игрока, враги на холме с тегом hill_enemy, скрытая группа контратаки с тегами hill_reserve и hidden, строки текста задачи и прогресса. Перенесите зону холма и её точку на свою карту.',
  'Юніти гравця з тегом гравця, вороги на пагорбі з тегом hill_enemy, прихована група контратаки з тегами hill_reserve і hidden, рядки тексту завдання і прогресу. Перенесіть зону пагорба і її точку на свою карту.',
  '带玩家标签的玩家单位，山丘上带 hill_enemy 标签的敌人，带 hill_reserve 和 hidden 标签的隐藏反攻部队，任务和进度行的文本行。把山丘区域及其路点移到你的地图上。');
F(id, {
  hill_pos: ['Hill centre', 'Центр холма', 'Центр пагорба', '山丘中心', POS],
  hill_radius: ['Hill radius', 'Радиус холма', 'Радіус пагорба', '山丘半径'],
  task_text: ['Task text key', 'Ключ текста задачи', 'Ключ тексту завдання', '任务文本键名', TEXTKEY],
  hill_pos_2: ['Counter-attack goes to', 'Куда идёт контратака', 'Куди йде контратака', '反攻目标点', POS],
  progress_text: ['Progress text key', 'Ключ текста прогресса', 'Ключ тексту прогресу', '进度文本键名', TEXTKEY],
  player: ['Player units tag', 'Тег юнитов игрока', 'Тег юнітів гравця', '玩家单位标签'],
  spacing: ['Seconds between attacks', 'Секунд между атаками', 'Секунд між атаками', '每次进攻间隔秒数'],
  points: ['Points to win', 'Очков для победы', 'Очок для перемоги', '获胜所需分数']
});

// 643
id = 'mi.sys.whole_small_mission_core_outline';
R(K + id, 'Whole small mission core', 'Ядро небольшой миссии целиком', 'Ядро невеликої місії цілком', '完整的小型任务核心');
R(K + id + '.d',
  'A whole mission file for an empty .mi: an intro cutscene with three lines, then take the village, then hold it against 5 waves cloned from hidden pools. Win when the last wave is dead; lose when all your men die or none are left in the base during the waves. With difficulty branches, music, autosaves and MARK lines in game.log. Not tried in game. Not for multiplayer maps.',
  'Целый файл миссии для пустого .mi: вступительная сцена с тремя репликами, затем захват деревни, затем её оборона от 5 волн, клонированных из скрытых запасов. Победа, когда последняя волна уничтожена; поражение, когда все бойцы погибли или во время волн на базе никого нет. С ветками по сложности, музыкой, автосохранениями и строками MARK в game.log. В игре не проверено. Не для сетевых карт.',
  'Цілий файл місії для порожнього .mi: вступна сцена з трьома репліками, потім захоплення села, потім його оборона від 5 хвиль, клонованих зі схованих запасів. Перемога, коли остання хвиля знищена; поразка, коли всі бійці загинули або під час хвиль на базі нікого немає. З гілками за складністю, музикою, автозбереженнями і рядками MARK у game.log. У грі не перевірено. Не для мережевих карт.',
  '用于空 .mi 的完整任务文件：带三句台词的开场过场，然后占领村庄，再抵御从隐藏单位池克隆出的 5 波敌人。最后一波被消灭即获胜；全部士兵阵亡或在波次期间基地内无人则失败。包含难度分支、音乐、自动存档，以及写入 game.log 的 MARK 行。未在游戏中测试。不适用于多人地图。');
R(K + id + '.w',
  'Test in this order: the intro alone, then stage 1, then the waves (delete the {disabled} line of debug/jump_to_stage2 to jump there). Read game.log for the MARK lines and for Unknown thread statement or Unknown condition term. Wave units are tagged by the spawn zone 1 s after the clone: keep the pools outside that zone. The waves use if, not switch (older builds ran every true case, MIS-34).',
  'Проверяйте по порядку: сначала одно вступление, затем этап 1, затем волны (удалите строку {disabled} у debug/jump_to_stage2, чтобы перейти к ним). Ищите в game.log строки MARK и Unknown thread statement или Unknown condition term. Юниты волны получают тег по зоне появления через 1 с после клонирования: держите запасы вне этой зоны. Волны сделаны через if, а не switch (старые сборки выполняли все истинные case, MIS-34).',
  'Перевіряйте по черзі: спершу лише вступ, потім етап 1, потім хвилі (видаліть рядок {disabled} у debug/jump_to_stage2, щоб перейти до них). Шукайте в game.log рядки MARK і Unknown thread statement або Unknown condition term. Юніти хвилі отримують тег за зоною появи через 1 с після клонування: тримайте запаси поза цією зоною. Хвилі зроблено через if, а не switch (старі збірки виконували всі істинні case, MIS-34).',
  '按顺序测试：先只测开场，再测第 1 阶段，再测敌人波次（删掉 debug/jump_to_stage2 的 {disabled} 行即可直接跳过去）。在 game.log 中查找 MARK 行以及 Unknown thread statement 或 Unknown condition term。波次单位在克隆 1 秒后按出生区域打标签：单位池要放在该区域之外。波次用 if 而不是 switch（旧版本会执行所有为真的 case，MIS-34）。');
R(K + id + '.n',
  'Open the file in the mission editor and place the units: player units tagged player_start, village defenders tagged village_enemy, wave pools tagged pool_inf, pool_mg, pool_tank and hidden, speakers tagged officer_talk and radio_talk, optional hard_only and heroic_extra (hidden). Text rows for 2 tasks, 3 intro lines and the timer. Move every zone, camera key and waypoint onto your map.',
  'Откройте файл в редакторе миссий и расставьте юниты: юниты игрока с тегом player_start, защитники деревни с тегом village_enemy, запасы волн с тегами pool_inf, pool_mg, pool_tank и hidden, говорящие с тегами officer_talk и radio_talk, по желанию hard_only и heroic_extra (hidden). Строки текста для 2 задач, 3 реплик вступления и таймера. Перенесите все зоны, ключи камеры и точки на свою карту.',
  'Відкрийте файл у редакторі місій і розставте юніти: юніти гравця з тегом player_start, захисники села з тегом village_enemy, запаси хвиль з тегами pool_inf, pool_mg, pool_tank і hidden, мовці з тегами officer_talk і radio_talk, за бажанням hard_only і heroic_extra (hidden). Рядки тексту для 2 завдань, 3 реплік вступу і таймера. Перенесіть усі зони, ключі камери і точки на свою карту.',
  '在任务编辑器中打开此文件并放置单位：带 player_start 标签的玩家单位，带 village_enemy 标签的村庄守军，带 pool_inf、pool_mg、pool_tank 和 hidden 标签的波次单位池，带 officer_talk 和 radio_talk 标签的说话者，可选的 hard_only 和 heroic_extra（hidden）。为 2 个任务、3 句开场台词和计时器准备文本行。把所有区域、镜头关键点和路点移到你的地图上。');
const CORNER = ['x y, two numbers', 'x y, два числа', 'x y, два числа', 'x y，两个数'];
F(id, {
  environment: ['Environment name', 'Имя окружения', "Ім'я оточення", '环境名',
    ['A name under set/environment, as skirmish/usa-omaha', 'Имя из set/environment, например skirmish/usa-omaha', "Ім'я з set/environment, наприклад skirmish/usa-omaha", 'set/environment 下的名称，如 skirmish/usa-omaha']],
  corner1: ['Game zone corner 1', 'Угол игровой зоны 1', 'Кут ігрової зони 1', '游戏区域角 1', CORNER],
  corner2: ['Game zone corner 2', 'Угол игровой зоны 2', 'Кут ігрової зони 2', '游戏区域角 2', CORNER],
  corner3: ['Game zone corner 3', 'Угол игровой зоны 3', 'Кут ігрової зони 3', '游戏区域角 3', CORNER],
  corner4: ['Game zone corner 4', 'Угол игровой зоны 4', 'Кут ігрової зони 4', '游戏区域角 4', CORNER],
  village_pos: ['Village centre', 'Центр деревни', 'Центр села', '村庄中心', POS],
  village_radius: ['Village radius', 'Радиус деревни', 'Радіус села', '村庄半径'],
  base_radius: ['Base radius', 'Радиус базы', 'Радіус бази', '基地半径',
    ['The base is held during the waves; it sits on the village', 'Базу держат во время волн; она стоит на деревне', 'Базу тримають під час хвиль; вона стоїть на селі', '波次期间要守住基地；它位于村庄处']],
  spawn_pos: ['Wave spawn point', 'Точка появления волн', 'Точка появи хвиль', '波次出生点', POS],
  obj1_text: ['Task 1 text key', 'Ключ текста задачи 1', 'Ключ тексту завдання 1', '任务 1 文本键名', TEXTKEY],
  obj2_text: ['Task 2 text key', 'Ключ текста задачи 2', 'Ключ тексту завдання 2', '任务 2 文本键名', TEXTKEY],
  cam1_pos: ['Camera start point', 'Начальная точка камеры', 'Початкова точка камери', '镜头起点', POS],
  cam1_look: ['Camera start looks at', 'Куда смотрит камера в начале', 'Куди дивиться камера на початку', '镜头起点朝向', POS],
  cam2_pos: ['Camera key 2 point', 'Точка ключа 2', 'Точка ключа 2', '关键点 2 位置', POS],
  cam2_look: ['Key 2 looks at', 'Куда смотрит ключ 2', 'Куди дивиться ключ 2', '关键点 2 朝向', POS],
  cam3_pos: ['Camera key 3 point', 'Точка ключа 3', 'Точка ключа 3', '关键点 3 位置', POS],
  cam3_look: ['Key 3 looks at', 'Куда смотрит ключ 3', 'Куди дивиться ключ 3', '关键点 3 朝向', POS],
  line1: ['First line text key', 'Ключ первой реплики', 'Ключ першої репліки', '第一句台词键名', TEXTKEY],
  line2: ['Second line text key', 'Ключ второй реплики', 'Ключ другої репліки', '第二句台词键名', TEXTKEY],
  line3: ['Third line text key', 'Ключ третьей реплики', 'Ключ третьої репліки', '第三句台词键名', TEXTKEY],
  first_wait: ['Seconds to the first wave', 'Секунд до первой волны', 'Секунд до першої хвилі', '距第一波秒数'],
  timer_text: ['Timer text key', 'Ключ текста таймера', 'Ключ тексту таймера', '计时器文本键名', TEXTKEY],
  waves: ['Number of waves', 'Число волн', 'Кількість хвиль', '波次数'],
  spacing: ['Seconds between waves', 'Секунд между волнами', 'Секунд між хвилями', '波次间隔秒数'],
  exit_pos: ['Exit point (removes who arrives)', 'Точка выхода (убирает пришедших)', 'Точка виходу (прибирає тих, хто прийшов)', '出口点（到达者被移除）', POS]
});

module.exports = rows;

// Lang rows of the Code Pieces group ia2-ideas-1 (vehicle and soldier ideas, round 2): [key, en, ru, uk, zh].
// Author: Imperator_Aug (ARSENAL, ia-84b40aa3)
'use strict';
const TV = ['Unit tags', 'Теги юнита', 'Теги юніта', '单位标签'];
const TVH = ['Put your own vehicle\'s tags in place of my_unit.', 'Замените my_unit тегами своей машины.',
  'Замініть my_unit тегами своєї машини.', '把 my_unit 换成你自己载具的标签。'];
const TH = ['In vanilla all soldiers have the tag human.', 'В оригинальной игре у всех солдат есть тег human.',
  'У грі всі солдати мають тег human.', '原版游戏中所有士兵都带有 human 标签。'];
const NOT = ['Not tried in game.', 'В игре не проверено.', 'У грі не перевірено.', '未在游戏中测试。'];
const rows = [];
const add = (key, en, ru, uk, zh) => rows.push([key, en, ru, uk, zh]);
// d rows get the "not tried" sentence added (every piece here is I or T)
const d = (id, en, ru, uk, zh) => add('ide.kit.p.' + id + '.d', en + ' ' + NOT[0], ru + ' ' + NOT[1], uk + ' ' + NOT[2], zh + NOT[3]);
const tagsV = id => { add('ide.kit.p.' + id + '.f.tags', ...TV); add('ide.kit.p.' + id + '.f.tags.h', ...TVH); };
const tagsH = id => { add('ide.kit.p.' + id + '.f.tags', ...TV); add('ide.kit.p.' + id + '.f.tags.h', ...TH); };
const f = (id, name, en, ru, uk, zh) => add('ide.kit.p.' + id + '.f.' + name, en, ru, uk, zh);
const h = (id, name, en, ru, uk, zh) => add('ide.kit.p.' + id + '.f.' + name + '.h', en, ru, uk, zh);

// 75 c.veh.flood
add('ide.kit.p.c.veh.flood', 'Wading too deep floods the engine', 'Слишком глубокий брод заливает двигатель',
  'Занадто глибокий брід заливає двигун', '涉水过深淹没发动机');
d('c.veh.flood', 'When the vehicle drives into water and is still deep in it after a few seconds, its engine breaks and the player sees an engine damage message. Vehicles with the amphibious tag are left alone.',
  'Когда машина въезжает в воду и через несколько секунд всё ещё глубоко в ней, двигатель ломается, а игрок видит сообщение о поломке двигателя. Машины с тегом амфибии не затрагиваются.',
  'Коли машина в\'їжджає у воду і за кілька секунд досі глибоко в ній, двигун ламається, а гравець бачить повідомлення про поломку двигуна. Машини з тегом амфібії не зачіпаються.',
  '载具驶入水中，几秒后仍处在深水里时，发动机损坏，玩家会看到发动机损坏提示。带有两栖标签的载具不受影响。');
add('ide.kit.p.c.veh.flood.w', 'What water_level measures (depth over the body?) is not known yet, so try the depth value in game. The water event fires only when the ground type changes.',
  'Что именно меряет water_level (глубину над корпусом?), пока неизвестно, поэтому подберите глубину в игре. Событие воды срабатывает только при смене типа земли.',
  'Що саме вимірює water_level (глибину над корпусом?), поки невідомо, тож підберіть глибину в грі. Подія води спрацьовує лише при зміні типу землі.',
  'water_level 测量的到底是什么（车身以上的深度？）尚不清楚，请在游戏中试出深度值。水的事件只在地面类型改变时触发。');
add('ide.kit.p.c.veh.flood.n', 'The vehicle needs a part named engine.', 'У машины должна быть деталь engine.',
  'Машина повинна мати деталь engine.', '载具需要有名为 engine 的部件。');
tagsV('c.veh.flood');
f('c.veh.flood', 'amphibious', 'Safe vehicle tag', 'Тег защищённой машины', 'Тег захищеної машини', '不受影响的标签');
h('c.veh.flood', 'amphibious', 'Vehicles with this tag never flood.', 'Машины с этим тегом не заливает.',
  'Машини з цим тегом не заливає.', '带此标签的载具不会被淹。');
f('c.veh.flood', 'wait', 'Seconds before the check', 'Секунд до проверки', 'Секунд до перевірки', '检查前的秒数');
f('c.veh.flood', 'depth', 'Water depth', 'Глубина воды', 'Глибина води', '水深');
h('c.veh.flood', 'depth', 'In metres; the engine floods when the water is deeper than this.',
  'В метрах; двигатель заливает, если вода глубже этого.', 'У метрах; двигун заливає, якщо вода глибша за це.',
  '单位为米；水深超过此值时发动机被淹。');
f('c.veh.flood', 'text', 'Damage message', 'Сообщение о повреждении', 'Повідомлення про пошкодження', '损坏提示');
h('c.veh.flood', 'text', 'A text key from damage_report.set or plain text.', 'Ключ текста из damage_report.set или обычный текст.',
  'Ключ тексту з damage_report.set або звичайний текст.', 'damage_report.set 中的文本键，或直接写文字。');

// 76 c.veh.rock_track
add('ide.kit.p.c.veh.rock_track', 'Track thrown on rocky ground at speed', 'Сброс гусеницы на камнях на скорости',
  'Скинута гусениця на камінні на швидкості', '高速驶上岩石地面时履带脱落');
d('c.veh.rock_track', 'When a tracked vehicle drives onto rock faster than the set speed, it may break its left or right track. The player sees a track damage message.',
  'Когда гусеничная машина въезжает на камень быстрее заданной скорости, у неё может слететь левая или правая гусеница. Игрок видит сообщение о поломке гусеницы.',
  'Коли гусенична машина в\'їжджає на каміння швидше за задану швидкість, у неї може злетіти ліва або права гусениця. Гравець бачить повідомлення про поломку гусениці.',
  '履带车辆以超过设定速度驶上岩石时，可能断掉左侧或右侧履带。玩家会看到履带损坏提示。');
add('ide.kit.p.c.veh.rock_track.w', 'It fires only when the ground changes to rock, not all the time while driving on it, and only where the map paints rock.',
  'Срабатывает только при въезде на камень, а не всё время езды по нему, и только там, где карта покрашена камнем.',
  'Спрацьовує лише при заїзді на каміння, а не весь час їзди ним, і лише там, де мапа пофарбована камінням.',
  '只在地面变成岩石的那一刻触发，不会在岩石上行驶时持续触发，且只在地图涂了岩石的地方有效。');
add('ide.kit.p.c.veh.rock_track.n', 'The vehicle needs parts named trackleft and trackright.',
  'У машины должны быть детали trackleft и trackright.', 'Машина повинна мати деталі trackleft і trackright.',
  '载具需要有 trackleft 和 trackright 部件。');
tagsV('c.veh.rock_track');
f('c.veh.rock_track', 'speed', 'Lowest speed', 'Наименьшая скорость', 'Найменша швидкість', '最低速度');
h('c.veh.rock_track', 'speed', 'In km/h.', 'В км/ч.', 'У км/год.', '单位为千米/小时。');
f('c.veh.rock_track', 'chance', 'Chance to break', 'Шанс поломки', 'Шанс поломки', '损坏几率');

// 77 c.veh.bog
add('ide.kit.p.c.veh.bog', 'Heavy vehicle bogs down in mud', 'Тяжёлая машина вязнет в грязи', 'Важка машина грузне в багнюці',
  '重型载具陷入泥地');
d('c.veh.bog', 'When a heavy vehicle drives into mud, it may get stuck and cannot move for a while. Then it can drive again, unless its engine or tracks broke meanwhile.',
  'Когда тяжёлая машина въезжает в грязь, она может застрять и некоторое время не двигаться. Потом она снова может ехать, если двигатель или ходовая за это время не сломались.',
  'Коли важка машина в\'їжджає в багнюку, вона може застрягнути й деякий час не рухатися. Потім вона знову може їхати, якщо двигун або ходова за цей час не зламалися.',
  '重型载具驶入泥地时可能陷住，一段时间内无法移动。之后可以再次行驶，除非这期间发动机或行走部件损坏。');
add('ide.kit.p.c.veh.bog.w', 'The AI may give up its move order. The weight is in kg and counts the load too.',
  'ИИ может отказаться от приказа на движение. Вес в кг и включает груз.',
  'ШІ може відмовитися від наказу на рух. Вага в кг і враховує вантаж.',
  'AI 可能会放弃移动命令。重量单位为千克，包含载重。');
tagsV('c.veh.bog');
f('c.veh.bog', 'kg', 'Lowest weight', 'Наименьший вес', 'Найменша вага', '最低重量');
h('c.veh.bog', 'kg', 'In kg, load included.', 'В кг, вместе с грузом.', 'У кг, разом із вантажем.', '单位为千克，含载重。');
f('c.veh.bog', 'chance', 'Chance to get stuck', 'Шанс застрять', 'Шанс застрягнути', '陷住几率');
f('c.veh.bog', 'time', 'Stuck time', 'Время в грязи', 'Час у багнюці', '陷住时间');
f('c.veh.bog', 'spread', 'Random extra time', 'Случайная добавка', 'Випадкова добавка', '随机附加时间');

// 78 c.veh.douse
add('ide.kit.p.c.veh.douse', 'Driving into water puts out a fire', 'Въезд в воду тушит пожар', 'В\'їзд у воду гасить пожежу',
  '驶入水中扑灭火焰');
d('c.veh.douse', 'When a burning vehicle drives into water, the fire, its flames and its sound stop.',
  'Когда горящая машина въезжает в воду, пожар, пламя и звук огня прекращаются.',
  'Коли палаюча машина в\'їжджає у воду, пожежа, полум\'я і звук вогню припиняються.',
  '燃烧的载具驶入水中时，火焰、火光和燃烧声都会停止。');
add('ide.kit.p.c.veh.douse.w', 'burn stop may only stop the effect, not the burning state. The game\'s own engine fire still rolls its 50 percent explosion 12 seconds after it started.',
  'burn stop, возможно, гасит только эффект, а не само горение. Собственный пожар двигателя в игре всё равно через 12 секунд после начала даёт взрыв с шансом 50 процентов.',
  'burn stop, можливо, гасить лише ефект, а не саме горіння. Власна пожежа двигуна в грі все одно через 12 секунд після початку дає вибух із шансом 50 відсотків.',
  'burn stop 可能只停止特效，而非燃烧状态。游戏自带的发动机起火在开始 12 秒后仍会以 50% 几率爆炸。');
tagsV('c.veh.douse');

// 79 c.veh.reverse
add('ide.kit.p.c.veh.reverse', 'Reverse gear whine', 'Вой задней передачи', 'Виття задньої передачі', '倒挡啸叫声');
d('c.veh.reverse', 'Plays a looping whine while the vehicle drives backwards and stops it when it drives forward or stops.',
  'Играет зацикленный вой, пока машина едет задом, и выключает его, когда она едет вперёд или останавливается.',
  'Грає зациклене виття, поки машина їде заднім ходом, і вимикає його, коли вона їде вперед або зупиняється.',
  '载具倒车时循环播放啸叫声，前进或停下时停止。');
add('ide.kit.p.c.veh.reverse.w', 'move_backward is never used in the game\'s own files. Switching straight from forward to reverse without stopping may not start the sound.',
  'move_backward нигде не используется в файлах самой игры. Переключение сразу с хода вперёд на задний без остановки может не включить звук.',
  'move_backward ніде не використовується у файлах самої гри. Перемикання одразу з ходу вперед на задній без зупинки може не ввімкнути звук.',
  '游戏自带文件中从未使用 move_backward。不停车直接从前进换到倒车可能不会播放声音。');
tagsV('c.veh.reverse');
f('c.veh.reverse', 'sound', 'Sound name', 'Имя звука', 'Назва звуку', '声音名称');
h('c.veh.reverse', 'sound', 'Your own short name for the sound; use the same one in every copy.',
  'Своё короткое имя звука; одно и то же во всех местах.', 'Власна коротка назва звуку; та сама в усіх місцях.',
  '给声音起的简短名称；每处都用同一个。');
f('c.veh.reverse', 'file', 'Sound file', 'Файл звука', 'Файл звуку', '声音文件');
f('c.veh.reverse', 'sound_2', 'Sound name', 'Имя звука', 'Назва звуку', '声音名称');
f('c.veh.reverse', 'sound_3', 'Sound name', 'Имя звука', 'Назва звуку', '声音名称');
f('c.veh.reverse', 'sound_4', 'Sound name', 'Имя звука', 'Назва звуку', '声音名称');

// 80 c.veh.brake_squeal
add('ide.kit.p.c.veh.brake_squeal', 'Brakes squeal when stopping hard', 'Скрип тормозов при резкой остановке',
  'Скрип гальм при різкій зупинці', '急刹时刹车尖叫');
d('c.veh.brake_squeal', 'When the vehicle brakes while faster than the set speed, a squeal sound plays.',
  'Когда машина тормозит на скорости выше заданной, звучит скрип.', 'Коли машина гальмує на швидкості, вищій за задану, лунає скрип.',
  '载具在高于设定速度时刹车，会播放刹车尖叫声。');
add('ide.kit.p.c.veh.brake_squeal.w', 'The speed read at the moment of braking may already be low.',
  'Скорость в момент торможения может быть уже низкой.', 'Швидкість у мить гальмування може бути вже низькою.',
  '刹车那一刻读到的速度可能已经偏低。');
tagsV('c.veh.brake_squeal');
f('c.veh.brake_squeal', 'speed', 'Lowest speed', 'Наименьшая скорость', 'Найменша швидкість', '最低速度');
h('c.veh.brake_squeal', 'speed', 'In km/h.', 'В км/ч.', 'У км/год.', '单位为千米/小时。');
f('c.veh.brake_squeal', 'sound', 'Squeal sound', 'Звук скрипа', 'Звук скрипу', '尖叫声音');

// 81 c.veh.skirts
add('ide.kit.p.c.veh.skirts', 'Side skirts shot away', 'Сбитые бортовые экраны', 'Збиті бортові екрани', '侧裙板被击落');
d('c.veh.skirts', 'When a shell hits the side skirt, the skirt stops taking hits and its model part falls off.',
  'Когда снаряд попадает в бортовой экран, экран больше не принимает попаданий, а его часть модели отваливается.',
  'Коли снаряд влучає в бортовий екран, екран більше не приймає влучань, а його частина моделі відпадає.',
  '炮弹击中侧裙板时，侧裙板不再承受命中，其模型部件脱落。');
add('ide.kit.p.c.veh.skirts.w', 'The model needs a volume and a bone with these names.',
  'В модели должны быть объём и кость с этими именами.', 'Модель повинна мати об\'єм і кістку з цими назвами.',
  '模型中需要有同名的碰撞体和骨骼。');
add('ide.kit.p.c.veh.skirts.n', 'A volume and a bone for the skirt in the model.', 'Объём и кость экрана в модели.',
  'Об\'єм і кістка екрана в моделі.', '模型中侧裙板的碰撞体和骨骼。');
tagsV('c.veh.skirts');
f('c.veh.skirts', 'skirt', 'Skirt volume', 'Объём экрана', 'Об\'єм екрана', '侧裙板碰撞体');
f('c.veh.skirts', 'skirt_2', 'Skirt volume', 'Объём экрана', 'Об\'єм екрана', '侧裙板碰撞体');
f('c.veh.skirts', 'bone', 'Skirt bone', 'Кость экрана', 'Кістка екрана', '侧裙板骨骼');

// 82 c.veh.deck_drums
add('ide.kit.p.c.veh.deck_drums', 'Fuel drums on the deck explode', 'Бочки с топливом на корпусе взрываются',
  'Бочки з пальним на корпусі вибухають', '车体上的油桶爆炸');
d('c.veh.deck_drums', 'When a bullet hits the fuel drum, it may blow up once: the drum disappears, an explosion effect plays and a small blast wave goes out from it.',
  'Когда пуля попадает в бочку, она может один раз взорваться: бочка исчезает, играет эффект взрыва и от неё расходится небольшая взрывная волна.',
  'Коли куля влучає в бочку, вона може один раз вибухнути: бочка зникає, грає ефект вибуху і від неї розходиться невелика вибухова хвиля.',
  '子弹击中油桶时，它可能爆炸一次：油桶消失，播放爆炸特效，并向外发出一道小冲击波。');
add('ide.kit.p.c.veh.deck_drums.w', 'The blast wave also hurts the vehicle itself.', 'Взрывная волна бьёт и по самой машине.',
  'Вибухова хвиля б\'є і по самій машині.', '冲击波也会伤到载具本身。');
add('ide.kit.p.c.veh.deck_drums.n', 'A volume and a bone for the drum in the model.', 'Объём и кость бочки в модели.',
  'Об\'єм і кістка бочки в моделі.', '模型中油桶的碰撞体和骨骼。');
tagsV('c.veh.deck_drums');
f('c.veh.deck_drums', 'drum', 'Drum volume', 'Объём бочки', 'Об\'єм бочки', '油桶碰撞体');
f('c.veh.deck_drums', 'chance', 'Chance per hit', 'Шанс за попадание', 'Шанс за влучання', '每次命中几率');
f('c.veh.deck_drums', 'bone', 'Drum bone', 'Кость бочки', 'Кістка бочки', '油桶骨骼');
f('c.veh.deck_drums', 'effect', 'Explosion effect', 'Эффект взрыва', 'Ефект вибуху', '爆炸特效');
f('c.veh.deck_drums', 'bone_2', 'Drum bone', 'Кость бочки', 'Кістка бочки', '油桶骨骼');
f('c.veh.deck_drums', 'power', 'Blast power', 'Сила взрыва', 'Сила вибуху', '冲击波强度');
f('c.veh.deck_drums', 'bone_3', 'Drum bone', 'Кость бочки', 'Кістка бочки', '油桶骨骼');

// 83 c.veh.flip_bail
add('ide.kit.p.c.veh.flip_bail', 'Crew bails out when the vehicle flips', 'Экипаж выпрыгивает при опрокидывании',
  'Екіпаж вистрибує при перекиданні', '载具翻覆时乘员跳车');
d('c.veh.flip_bail', 'When the vehicle turns upside down, the crew is thrown out of it alive.',
  'Когда машина переворачивается, экипаж выбрасывает из неё живым.', 'Коли машина перевертається, екіпаж викидає з неї живим.',
  '载具翻覆时，乘员被活着甩出车外。');
add('ide.kit.p.c.veh.flip_bail.w', 'When exactly the game sends upside_down is not tested.',
  'Когда именно игра посылает upside_down, не проверено.', 'Коли саме гра надсилає upside_down, не перевірено.',
  '游戏究竟何时发送 upside_down 尚未测试。');
tagsV('c.veh.flip_bail');

// 84 c.veh.dark_under_fire
add('ide.kit.p.c.veh.dark_under_fire', 'Lights go out while under fire', 'Фары гаснут под обстрелом',
  'Фари гаснуть під обстрілом', '遭到射击时熄灭车灯');
d('c.veh.dark_under_fire', 'Every hit turns the vehicle\'s lights off. When no hit came for the set time, the lights go back to normal.',
  'Каждое попадание выключает фары машины. Если за заданное время попаданий не было, фары возвращаются в обычный режим.',
  'Кожне влучання вимикає фари машини. Якщо за заданий час влучань не було, фари повертаються у звичайний режим.',
  '每次被命中都会关闭车灯。在设定时间内没有再被命中，车灯恢复正常。');
add('ide.kit.p.c.veh.dark_under_fire.w', 'It uses the game\'s own light handlers of the vehicle block.',
  'Использует обработчики фар из блока vehicle самой игры.', 'Використовує обробники фар із блоку vehicle самої гри.',
  '依赖游戏自带 vehicle 块中的车灯处理程序。');
add('ide.kit.p.c.veh.dark_under_fire.n', 'The handlers lights_off and update_lights (vanilla vehicle block).',
  'Обработчики lights_off и update_lights (блок vehicle игры).', 'Обробники lights_off і update_lights (блок vehicle гри).',
  '处理程序 lights_off 和 update_lights（原版 vehicle 块）。');
tagsV('c.veh.dark_under_fire');
f('c.veh.dark_under_fire', 'time', 'Dark time', 'Время без света', 'Час без світла', '熄灯时间');

// 85 c.veh.cold_start
add('ide.kit.p.c.veh.cold_start', 'Steam from the exhaust on a cold start in snow', 'Пар из выхлопа при холодном пуске на снегу',
  'Пара з вихлопу при холодному пуску на снігу', '雪地冷启动时排气冒白汽');
d('c.veh.cold_start', 'When the engine starts while the vehicle stands on snow, a steam effect plays for a few seconds. The effect is added when the vehicle appears.',
  'Когда двигатель заводится, а машина стоит на снегу, несколько секунд идёт пар. Эффект добавляется при появлении машины.',
  'Коли двигун заводиться, а машина стоїть на снігу, кілька секунд іде пара. Ефект додається під час появи машини.',
  '车辆停在雪地上启动发动机时，会冒几秒白汽。特效在载具出现时添加。');
add('ide.kit.p.c.veh.cold_start.w', 'Pick a bone at the exhaust; the game already plays its own engine_steam on every start.',
  'Выберите кость у выхлопа; игра и так включает свой engine_steam при каждом пуске.',
  'Оберіть кістку біля вихлопу; гра й так вмикає свій engine_steam під час кожного пуску.',
  '请选排气口处的骨骼；游戏每次启动本来就会播放自己的 engine_steam。');
tagsV('c.veh.cold_start');
f('c.veh.cold_start', 'effect', 'Steam effect', 'Эффект пара', 'Ефект пари', '白汽特效');
f('c.veh.cold_start', 'bone', 'Exhaust bone', 'Кость выхлопа', 'Кістка вихлопу', '排气口骨骼');
f('c.veh.cold_start', 'time', 'Steam time', 'Время пара', 'Час пари', '白汽时长');

// 86 c.veh.blast_stall
add('ide.kit.p.c.veh.blast_stall', 'Close blast stalls the engine for a while', 'Близкий взрыв глушит двигатель на время',
  'Близький вибух глушить двигун на час', '近距离爆炸使发动机暂时熄火');
d('c.veh.blast_stall', 'A strong blast at the engine stops the vehicle for a few seconds. Then the game checks the engine and tracks again, so a broken engine stays broken.',
  'Сильный взрыв у двигателя останавливает машину на несколько секунд. Затем игра снова проверяет двигатель и ходовую, так что сломанный двигатель остаётся сломанным.',
  'Сильний вибух біля двигуна зупиняє машину на кілька секунд. Потім гра знову перевіряє двигун і ходову, тож зламаний двигун лишається зламаним.',
  '发动机处的强烈爆炸会让载具停下几秒。之后游戏重新检查发动机和行走部件，所以已损坏的发动机仍然是坏的。');
add('ide.kit.p.c.veh.blast_stall.w', 'Any break or repair during the stall makes the game check movement again and may let it drive early.',
  'Любая поломка или ремонт во время простоя заставляет игру заново проверить движение и может дать ехать раньше.',
  'Будь-яка поломка чи ремонт під час простою змушує гру знову перевірити рух і може дати їхати раніше.',
  '熄火期间的任何损坏或维修都会让游戏重新检查移动，可能提前恢复行驶。');
tagsV('c.veh.blast_stall');
f('c.veh.blast_stall', 'energy', 'Lowest blast energy', 'Наименьшая сила взрыва', 'Найменша сила вибуху', '最低爆炸能量');
f('c.veh.blast_stall', 'time', 'Stall time', 'Время простоя', 'Час простою', '熄火时间');
f('c.veh.blast_stall', 'spread', 'Random extra time', 'Случайная добавка', 'Випадкова добавка', '随机附加时间');

// 87 c.inf.ice_slip
add('ide.kit.p.c.inf.ice_slip', 'Running men slip on ice', 'Бегущие солдаты поскальзываются на льду',
  'Солдати, що біжать, ковзаються на кризі', '奔跑的士兵在冰上滑倒');
d('c.inf.ice_slip', 'When a soldier starts running on ice, he may slip and fall for a moment.',
  'Когда солдат начинает бежать по льду, он может поскользнуться и ненадолго упасть.',
  'Коли солдат починає бігти по кризі, він може посковзнутися й ненадовго впасти.',
  '士兵在冰上开始奔跑时，可能滑倒片刻。');
add('ide.kit.p.c.inf.ice_slip.w', 'It fires only when he changes his way of moving, not all the time while running.',
  'Срабатывает только при смене способа движения, а не всё время бега.', 'Спрацьовує лише при зміні способу руху, а не весь час бігу.',
  '只在他改变移动方式时触发，不会在奔跑中持续触发。');
tagsH('c.inf.ice_slip');
f('c.inf.ice_slip', 'chance', 'Chance to slip', 'Шанс поскользнуться', 'Шанс посковзнутися', '滑倒几率');
f('c.inf.ice_slip', 'time', 'Time on the ground', 'Время на земле', 'Час на землі', '倒地时间');
f('c.inf.ice_slip', 'spread', 'Random extra time', 'Случайная добавка', 'Випадкова добавка', '随机附加时间');

// 88 c.inf.douse
add('ide.kit.p.c.inf.douse', 'Jumping into water puts out a burning man', 'Прыжок в воду тушит горящего солдата',
  'Стрибок у воду гасить палаючого солдата', '跳入水中扑灭身上的火');
d('c.inf.douse', 'When a burning soldier steps into water, his fire goes out, like the game already does in puddles.',
  'Когда горящий солдат входит в воду, огонь гаснет, как игра уже делает в лужах.',
  'Коли палаючий солдат заходить у воду, вогонь гасне, як гра вже робить у калюжах.',
  '燃烧的士兵走进水里时，火会熄灭，就像游戏在水坑里已经做的那样。');
add('ide.kit.p.c.inf.douse.w', 'A burning man may die before he reaches the water.', 'Горящий солдат может умереть, не добежав до воды.',
  'Палаючий солдат може загинути, не добігши до води.', '着火的士兵可能在到达水边前就已死亡。');
add('ide.kit.p.c.inf.douse.n', 'The handler stop_burn (vanilla human block).', 'Обработчик stop_burn (блок human игры).',
  'Обробник stop_burn (блок human гри).', '处理程序 stop_burn（原版 human 块）。');
tagsH('c.inf.douse');

// 89 c.inf.cry_out
add('ide.kit.p.c.inf.cry_out', 'Wounded man cries out', 'Раненый вскрикивает', 'Поранений скрикує', '伤员喊叫');
d('c.inf.cry_out', 'When a living soldier is hit, he may shout a voice line. He waits a while before he can shout again.',
  'Когда в живого солдата попадают, он может выкрикнуть реплику. Затем он какое-то время молчит.',
  'Коли в живого солдата влучають, він може вигукнути репліку. Потім він якийсь час мовчить.',
  '活着的士兵被击中时，可能喊出一句语音。之后要等一会儿才能再次喊叫。');
add('ide.kit.p.c.inf.cry_out.w', 'The voice line must exist for his voice set.', 'Реплика должна быть в его наборе голосов.',
  'Репліка має бути в його наборі голосів.', '该语音必须存在于他的语音组中。');
add('ide.kit.p.c.inf.cry_out.n', 'A voice line name.', 'Имя голосовой реплики.', 'Назва голосової репліки.', '一个语音名称。');
tagsH('c.inf.cry_out');
f('c.inf.cry_out', 'chance', 'Chance per hit', 'Шанс за попадание', 'Шанс за влучання', '每次命中几率');
f('c.inf.cry_out', 'line', 'Voice line', 'Голосовая реплика', 'Голосова репліка', '语音');
h('c.inf.cry_out', 'line', 'The game uses injuring and death_cry.', 'В игре есть injuring и death_cry.',
  'У грі є injuring і death_cry.', '游戏中有 injuring 和 death_cry。');
f('c.inf.cry_out', 'wait', 'Quiet time', 'Время тишины', 'Час тиші', '静默时间');

// 90 c.inf.snow_puff
add('ide.kit.p.c.inf.snow_puff', 'Snow puffs from running feet', 'Снег из-под ног бегущего', 'Сніг з-під ніг того, хто біжить',
  '奔跑的脚下扬起雪雾');
d('c.inf.snow_puff', 'A snow puff effect plays at the feet while a soldier runs on snow. The effect is added to both feet when he appears.',
  'Пока солдат бежит по снегу, у его ног поднимается снег. Эффект добавляется на обе ноги при появлении солдата.',
  'Поки солдат біжить по снігу, біля його ніг здіймається сніг. Ефект додається на обидві ноги під час появи солдата.',
  '士兵在雪地上奔跑时，脚下扬起雪雾。特效在士兵出现时加到双脚上。');
add('ide.kit.p.c.inf.snow_puff.w', 'It checks only when he changes his way of moving, so running from grass onto snow does not start it.',
  'Проверка идёт только при смене способа движения, поэтому забег с травы на снег эффект не включит.',
  'Перевірка йде лише при зміні способу руху, тож забіг із трави на сніг ефект не ввімкне.',
  '只在他改变移动方式时检查，所以从草地跑上雪地不会开启特效。');
tagsH('c.inf.snow_puff');
f('c.inf.snow_puff', 'effect', 'Right foot effect', 'Эффект правой ноги', 'Ефект правої ноги', '右脚特效');
f('c.inf.snow_puff', 'effect_2', 'Left foot effect', 'Эффект левой ноги', 'Ефект лівої ноги', '左脚特效');

// 91 c.inf.drown
add('ide.kit.p.c.inf.drown', 'Exhausted swimmer goes under', 'Уставший пловец тонет', 'Втомлений плавець тоне', '力竭的泳者沉没');
d('c.inf.drown', 'A soldier who swims in deep water for about a minute may drown. Leaving the deep water stops the timer.',
  'Солдат, который плывёт по глубокой воде около минуты, может утонуть. Выход из глубокой воды останавливает таймер.',
  'Солдат, який пливе глибокою водою близько хвилини, може втопитися. Вихід із глибокої води зупиняє таймер.',
  '在深水中游了约一分钟的士兵可能溺亡。离开深水会停止计时。');
add('ide.kit.p.c.inf.drown.w', 'Harsh in play. The death of a swimmer may not animate.', 'Жёстко для игры. Смерть пловца может пройти без анимации.',
  'Жорстко для гри. Смерть плавця може пройти без анімації.', '对玩法很严苛。泳者的死亡可能没有动画。');
tagsH('c.inf.drown');
f('c.inf.drown', 'time', 'Swim time', 'Время в воде', 'Час у воді', '游泳时间');
f('c.inf.drown', 'spread', 'Random extra time', 'Случайная добавка', 'Випадкова добавка', '随机附加时间');
f('c.inf.drown', 'chance', 'Chance to drown', 'Шанс утонуть', 'Шанс втопитися', '溺亡几率');

// 92 c.inf.burn_run
add('ide.kit.p.c.inf.burn_run', 'Burning man runs', 'Горящий солдат бежит', 'Палаючий солдат біжить', '着火的人奔跑');
d('c.inf.burn_run', 'When a soldier catches fire, his top speed limit is set to the chosen mode. It does not order him to run.',
  'Когда солдат загорается, его предел скорости ставится на выбранный режим. Приказа бежать это не даёт.',
  'Коли солдат загоряється, його межа швидкості ставиться на обраний режим. Наказу бігти це не дає.',
  '士兵着火时，他的最高速度上限设为所选模式。这不会命令他奔跑。');
add('ide.kit.p.c.inf.burn_run.w', 'With no limit set a soldier can already run, so fast changes little; his stamina limit may still hold him back.',
  'Без предела солдат и так может бежать, поэтому fast мало что меняет; предел выносливости всё равно может его сдерживать.',
  'Без межі солдат і так може бігти, тож fast мало що змінює; межа витривалості все одно може його стримувати.',
  '没有上限时士兵本来就能跑，所以 fast 变化不大；耐力上限仍可能限制他。');
tagsH('c.inf.burn_run');
f('c.inf.burn_run', 'mode', 'Speed limit', 'Предел скорости', 'Межа швидкості', '速度上限');

module.exports = rows;

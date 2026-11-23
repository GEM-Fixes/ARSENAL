// Lang rows of the Code Pieces group ia2-forms-1 (Units: aircraft, boats, vehicles, soldiers, objects): [key, en, ru, uk, zh].
// Author: Imperator_Aug (ARSENAL, ia-1d974396)
'use strict';

const P = 'ide.kit.p.';

module.exports = [
  // 21 b.van.plane_fall
  [P + 'b.van.plane_fall', 'Hit plane goes down trailing smoke', 'Подбитый самолёт падает с дымом', 'Підбитий літак падає з димом', '被击中的飞机拖着烟坠落'],
  [P + 'b.van.plane_fall.d', 'When the body or engine of a plane breaks, the plane starts to fall once, plays its fall sound and after 2 seconds burns with fire and smoke.', 'Когда ломается корпус или двигатель самолёта, он один раз начинает падать, играет звук падения и через 2 секунды горит с огнём и дымом.', 'Коли ламається корпус або двигун літака, він один раз починає падати, грає звук падіння і через 2 секунди горить з вогнем і димом.', '飞机机身或发动机损坏时，飞机开始坠落（只触发一次），播放坠落声音，2 秒后起火冒烟。'],
  [P + 'b.van.plane_fall.n', 'The sound "fall" linked on spawn (vanilla: {link_sound "fall" "vehicle/airborne/fw_deep"}); volumes "body" and "engine".', 'Звук "fall", привязанный при появлении (в игре: {link_sound "fall" "vehicle/airborne/fw_deep"}); volumes "body" и "engine".', 'Звук "fall", прив\'язаний при появі (у грі: {link_sound "fall" "vehicle/airborne/fw_deep"}); volumes "body" і "engine".', '出生时绑定的声音 "fall"（原版：{link_sound "fall" "vehicle/airborne/fw_deep"}）；volume "body" 和 "engine"。'],
  [P + 'b.van.plane_fall.f.fire', 'Fire effect', 'Эффект огня', 'Ефект вогню', '火焰特效'],
  [P + 'b.van.plane_fall.f.smoke', 'Body smoke effect', 'Дым корпуса', 'Дим корпусу', '机身烟雾特效'],
  [P + 'b.van.plane_fall.f.smoke_2', 'Engine smoke effect', 'Дым двигателя', 'Дим двигуна', '发动机烟雾特效'],
  [P + 'b.van.plane_fall.f.black', 'Late black smoke', 'Поздний чёрный дым', 'Пізній чорний дим', '后续黑烟特效'],
  [P + 'b.van.plane_fall.f.black.h', 'Starts 10 seconds after the first smoke and lasts about 40 seconds.', 'Начинается через 10 секунд после первого дыма и идёт около 40 секунд.', 'Починається через 10 секунд після першого диму і триває близько 40 секунд.', '在第一股烟后 10 秒开始，持续约 40 秒。'],

  // 22 b.van.dive_siren
  [P + 'b.van.dive_siren', 'Siren when the plane dives to attack', 'Сирена, когда самолёт пикирует в атаку', 'Сирена, коли літак пікірує в атаку', '飞机俯冲攻击时的警报声'],
  [P + 'b.van.dive_siren.d', 'The game sends "air_attack" when a plane starts its attack dive. This plays a sound at that moment.', 'Игра посылает "air_attack", когда самолёт начинает пикировать в атаку. Здесь в этот момент играет звук.', 'Гра надсилає "air_attack", коли літак починає пікірувати в атаку. Тут у цю мить грає звук.', '飞机开始俯冲攻击时，游戏会发送 "air_attack"。这里在那一刻播放一个声音。'],
  [P + 'b.van.dive_siren.f.path', 'Siren sound file', 'Файл звука сирены', 'Файл звуку сирени', '警报声音文件'],

  // 23 b.van.landing_dust
  [P + 'b.van.landing_dust', 'Dust from the wheels on landing', 'Пыль из-под колёс при посадке', 'Пил з-під коліс під час посадки', '着陆时机轮扬起尘土'],
  [P + 'b.van.landing_dust.d', 'Adds a dust effect at two wheel bones, starts it and stops it after a few seconds.', 'Добавляет эффект пыли на две кости колёс, запускает его и через несколько секунд останавливает.', 'Додає ефект пилу на дві кістки коліс, запускає його і через кілька секунд зупиняє.', '在两个机轮骨骼上添加尘土特效，启动它并在几秒后停止。'],
  [P + 'b.van.landing_dust.n', 'Something must call "wheels_fx", for example {on "landing" {call "wheels_fx"}}.', 'Что-то должно вызвать "wheels_fx", например {on "landing" {call "wheels_fx"}}.', 'Щось має викликати "wheels_fx", наприклад {on "landing" {call "wheels_fx"}}.', '需要有地方调用 "wheels_fx"，例如 {on "landing" {call "wheels_fx"}}。'],
  [P + 'b.van.landing_dust.f.effect', 'Left dust effect', 'Эффект пыли слева', 'Ефект пилу зліва', '左侧尘土特效'],
  [P + 'b.van.landing_dust.f.bone1', 'First wheel bone', 'Кость первого колеса', 'Кістка першого колеса', '第一个机轮骨骼'],
  [P + 'b.van.landing_dust.f.effect_2', 'Right dust effect', 'Эффект пыли справа', 'Ефект пилу справа', '右侧尘土特效'],
  [P + 'b.van.landing_dust.f.bone2', 'Second wheel bone', 'Кость второго колеса', 'Кістка другого колеса', '第二个机轮骨骼'],
  [P + 'b.van.landing_dust.f.time', 'Dust lasts (seconds)', 'Пыль длится (секунд)', 'Пил триває (секунд)', '尘土持续（秒）'],

  // 24 b.van.hull_count
  [P + 'b.van.hull_count', 'Ship blows up when 3 hull parts are broken', 'Корабль взрывается, когда сломаны 3 части корпуса', 'Корабель вибухає, коли зламано 3 частини корпусу', '三个船体部件损坏时船只爆炸'],
  [P + 'b.van.hull_count.d', 'Each time a part breaks, counts the broken hull parts. When three of them are broken, the ship calls "explosion".', 'Каждый раз, когда ломается часть, считает сломанные части корпуса. Когда сломаны три, корабль вызывает "explosion".', 'Щоразу, коли ламається частина, рахує зламані частини корпусу. Коли зламано три, корабель викликає "explosion".', '每当有部件损坏时，统计已损坏的船体部件。损坏达到三个时，船只调用 "explosion"。'],
  [P + 'b.van.hull_count.n', 'A handler "explosion"; the hull parts (body_1 and on) in the model .def.', 'Обработчик "explosion"; части корпуса (body_1 и далее) в .def модели.', 'Обробник "explosion"; частини корпусу (body_1 і далі) у .def моделі.', '需要处理器 "explosion"；模型 .def 中的船体部件（body_1 等）。'],
  [P + 'b.van.hull_count.f.part1', 'Hull part 1', 'Часть корпуса 1', 'Частина корпусу 1', '船体部件 1'],
  [P + 'b.van.hull_count.f.part1.h', 'A component name from the model .def. Add more {if broken ...} lines for more parts.', 'Имя компонента из .def модели. Для других частей добавьте строки {if broken ...}.', 'Ім\'я компонента з .def моделі. Для інших частин додайте рядки {if broken ...}.', '模型 .def 中的部件名。更多部件请再加 {if broken ...} 行。'],
  [P + 'b.van.hull_count.f.part2', 'Hull part 2', 'Часть корпуса 2', 'Частина корпусу 2', '船体部件 2'],
  [P + 'b.van.hull_count.f.part3', 'Hull part 3', 'Часть корпуса 3', 'Частина корпусу 3', '船体部件 3'],
  [P + 'b.van.hull_count.f.part4', 'Hull part 4', 'Часть корпуса 4', 'Частина корпусу 4', '船体部件 4'],

  // 25 b.van.sink_order
  [P + 'b.van.sink_order', 'Ballast tanks flood one after another', 'Балластные цистерны заполняются по очереди', 'Баластні цистерни заповнюються по черзі', '压载舱依次进水'],
  [P + 'b.van.sink_order.d', 'Two helpers sink a ship in steps: each tank volume stops floating at its own time, and the lights flicker and go out. The handler you name starts it.', 'Два помощника топят корабль по шагам: каждая цистерна перестаёт держать на плаву в своё время, свет мигает и гаснет. Запускает это названный вами обработчик.', 'Два помічники топлять корабель по кроках: кожна цистерна перестає тримати на плаву у свій час, світло блимає і гасне. Запускає це названий вами обробник.', '两个辅助宏分步让船下沉：每个压载舱 volume 在各自的时间停止浮力，灯光闪烁后熄灭。由你命名的处理器启动。'],
  [P + 'b.van.sink_order.n', 'Float volumes for the tanks (vanilla ballast1 to ballast4); handlers "sinking", "light_flash" and "light_off".', 'Плавучие volumes цистерн (в игре ballast1 - ballast4); обработчики "sinking", "light_flash" и "light_off".', 'Плавучі volumes цистерн (у грі ballast1 - ballast4); обробники "sinking", "light_flash" і "light_off".', '压载舱的浮力 volume（原版 ballast1 到 ballast4）；处理器 "sinking"、"light_flash" 和 "light_off"。'],
  [P + 'b.van.sink_order.f.event', 'Start handler name', 'Имя запускающего обработчика', 'Ім\'я обробника запуску', '启动处理器名'],
  [P + 'b.van.sink_order.f.event.h', 'Call it with {call "..."} when the ship should sink. Vanilla runs it from "break_body".', 'Вызовите его через {call "..."}, когда корабль должен тонуть. В игре это делает "break_body".', 'Викличте його через {call "..."}, коли корабель має тонути. У грі це робить "break_body".', '需要船下沉时用 {call "..."} 调用它。原版从 "break_body" 调用。'],
  [P + 'b.van.sink_order.f.tank1', 'First tank volume', 'Первая цистерна', 'Перша цистерна', '第一个压载舱'],
  [P + 'b.van.sink_order.f.time1', 'First tank floods at', 'Первая заполняется через', 'Перша заповнюється через', '第一个进水时间'],
  [P + 'b.van.sink_order.f.tank2', 'Second tank volume', 'Вторая цистерна', 'Друга цистерна', '第二个压载舱'],
  [P + 'b.van.sink_order.f.time2', 'Second tank floods at', 'Вторая заполняется через', 'Друга заповнюється через', '第二个进水时间'],
  [P + 'b.van.sink_order.f.tank3', 'Third tank volume', 'Третья цистерна', 'Третя цистерна', '第三个压载舱'],
  [P + 'b.van.sink_order.f.time3', 'Third tank floods at', 'Третья заполняется через', 'Третя заповнюється через', '第三个进水时间'],
  [P + 'b.van.sink_order.f.tank4', 'Fourth tank volume', 'Четвёртая цистерна', 'Четверта цистерна', '第四个压载舱'],
  [P + 'b.van.sink_order.f.time4', 'Fourth tank floods at', 'Четвёртая заполняется через', 'Четверта заповнюється через', '第四个进水时间'],

  // 26 b.van.torpedo_pair
  [P + 'b.van.torpedo_pair', 'Two torpedo tubes fired in turn', 'Два торпедных аппарата стреляют по очереди', 'Два торпедні апарати стріляють по черзі', '两具鱼雷管轮流发射'],
  [P + 'b.van.torpedo_pair.d', 'Each shot plays the launch animation of the next loaded torpedo; when it ends the torpedo model is hidden. Fired torpedoes stay gone after a saved game loads.', 'Каждый выстрел играет анимацию пуска следующей заряженной торпеды; в конце модель торпеды прячется. Выпущенные торпеды не возвращаются после загрузки сохранения.', 'Кожен постріл грає анімацію пуску наступної зарядженої торпеди; наприкінці модель торпеди ховається. Випущені торпеди не повертаються після завантаження збереження.', '每次开火播放下一枚已装填鱼雷的发射动画，结束后隐藏鱼雷模型。读取存档后，已发射的鱼雷不会再出现。'],
  [P + 'b.van.torpedo_pair.n', 'Animations and bones "torpedo1" and "torpedo2"; a weapon place for the torpedoes.', 'Анимации и кости "torpedo1" и "torpedo2"; место оружия для торпед.', 'Анімації та кістки "torpedo1" і "torpedo2"; місце зброї для торпед.', '动画和骨骼 "torpedo1" 与 "torpedo2"；鱼雷的武器位置。'],
  [P + 'b.van.torpedo_pair.f.place', 'Torpedo weapon place', 'Место торпедного оружия', 'Місце торпедної зброї', '鱼雷武器位置'],

  // 27 b.van.ripple_blast
  [P + 'b.van.ripple_blast', 'Ship blows up in a ripple of blasts', 'Корабль взрывается серией взрывов', 'Корабель вибухає серією вибухів', '船只连环爆炸'],
  [P + 'b.van.ripple_blast.d', 'Four blasts run from stern to bow with short random gaps; hull parts are destroyed in turn and every unit inside gets "explosion" too.', 'Четыре взрыва идут от кормы к носу с короткими случайными паузами; части корпуса разрушаются по очереди, и всё, что внутри, тоже получает "explosion".', 'Чотири вибухи йдуть від корми до носа з короткими випадковими паузами; частини корпусу руйнуються по черзі, і все, що всередині, теж отримує "explosion".', '四次爆炸从船尾到船头依次发生，间隔短且随机；船体部件依次被摧毁，船内所有单位也收到 "explosion"。'],
  [P + 'b.van.ripple_blast.n', 'Bones fx_exp1 to fx_exp4; parts body_front, body and body_rear; volume "float"; handlers "cut_parts" and "explosion"; a caller of "explosion_sequence".', 'Кости fx_exp1 - fx_exp4; части body_front, body и body_rear; volume "float"; обработчики "cut_parts" и "explosion"; вызов "explosion_sequence".', 'Кістки fx_exp1 - fx_exp4; частини body_front, body і body_rear; volume "float"; обробники "cut_parts" і "explosion"; виклик "explosion_sequence".', '骨骼 fx_exp1 到 fx_exp4；部件 body_front、body 和 body_rear；volume "float"；处理器 "cut_parts" 和 "explosion"；调用 "explosion_sequence" 的地方。'],
  [P + 'b.van.ripple_blast.f.effect', 'First blast effect', 'Эффект первого взрыва', 'Ефект першого вибуху', '第一次爆炸特效'],
  [P + 'b.van.ripple_blast.f.effect_2', 'Second blast effect', 'Эффект второго взрыва', 'Ефект другого вибуху', '第二次爆炸特效'],
  [P + 'b.van.ripple_blast.f.effect_3', 'Third blast effect', 'Эффект третьего взрыва', 'Ефект третього вибуху', '第三次爆炸特效'],
  [P + 'b.van.ripple_blast.f.effect_4', 'Fourth blast effect', 'Эффект четвёртого взрыва', 'Ефект четвертого вибуху', '第四次爆炸特效'],

  // 28 b.van.swamp_sink
  [P + 'b.van.swamp_sink', 'Vehicles slowly sink in swamp', 'Техника медленно тонет в болоте', 'Техніка повільно тоне в болоті', '载具在沼泽中慢慢下沉'],
  [P + 'b.van.swamp_sink.d', 'While the vehicle works it checks every half second whether it sinks. Driving onto the ground type, or into water deeper than the depth, turns on sinking.', 'Пока машина работает, она каждые полсекунды проверяет, тонет ли. Заезд на этот тип земли или в воду глубже заданной включает погружение.', 'Поки машина працює, вона кожні півсекунди перевіряє, чи тоне. Заїзд на цей тип землі або у воду, глибшу за задану, вмикає занурення.', '载具可用时每半秒检查一次是否下沉。开上该地面类型，或进入比设定更深的水，就会开始下沉。'],
  [P + 'b.van.swamp_sink.f.terrain', 'Ground that sinks it', 'Земля, где тонет', 'Земля, де тоне', '导致下沉的地面'],
  [P + 'b.van.swamp_sink.f.depth', 'Water depth (m)', 'Глубина воды (м)', 'Глибина води (м)', '水深（米）'],
  [P + 'b.van.swamp_sink.f.depth.h', 'Heavier vehicles override "check_water_level" with their own depth (see the piece "Sinks when the water is deeper than N m").', 'Тяжёлая техника переопределяет "check_water_level" своей глубиной (см. кусок "Тонет, когда вода глубже N м").', 'Важка техніка перевизначає "check_water_level" своєю глибиною (див. шматок "Тоне, коли вода глибша за N м").', '较重的载具会用自己的深度覆盖 "check_water_level"（见代码片段"水深超过 N 米时下沉"）。'],

  // 29 b.van.depth_sink
  [P + 'b.van.depth_sink', 'Sinks when the water is deeper than N m', 'Тонет, когда вода глубже N м', 'Тоне, коли вода глибша за N м', '水深超过 N 米时下沉'],
  [P + 'b.van.depth_sink.d', 'Replaces the shared water check with a depth of your own. A unit that is linked (towed or carried) does not sink.', 'Заменяет общую проверку воды своей глубиной. Прицепленный (буксируемый или перевозимый) юнит не тонет.', 'Замінює спільну перевірку води власною глибиною. Причеплений (буксируваний або перевезений) юніт не тоне.', '用你自己的深度替换通用的水深检查。被连接（被拖或被运载）的单位不会下沉。'],
  [P + 'b.van.depth_sink.n', 'A caller of "check_water_level" (vehicle.inc runs it from "check_sinking").', 'Вызов "check_water_level" (vehicle.inc делает его из "check_sinking").', 'Виклик "check_water_level" (vehicle.inc робить його з "check_sinking").', '需要调用 "check_water_level" 的地方（vehicle.inc 在 "check_sinking" 中调用）。'],
  [P + 'b.van.depth_sink.f.depth', 'Water depth (m)', 'Глубина воды (м)', 'Глибина води (м)', '水深（米）'],
  [P + 'b.van.depth_sink.f.depth.h', 'Vanilla: 1.2 for guns, 1.6 for medium tanks, 1.8 for heavy tanks.', 'В игре: 1.2 для орудий, 1.6 для средних танков, 1.8 для тяжёлых.', 'У грі: 1.2 для гармат, 1.6 для середніх танків, 1.8 для важких.', '原版：火炮 1.2，中型坦克 1.6，重型坦克 1.8。'],

  // 30 b.van.fuel_tank
  [P + 'b.van.fuel_tank', 'Fuel tank hit: one in two catches fire', 'Попадание в бензобак: каждый второй загорается', 'Влучання в бензобак: кожен другий спалахує', '油箱被击中：一半概率起火'],
  [P + 'b.van.fuel_tank.d', 'With the chance you set, the fuel tank volume stops taking hits, a burst of fire shows and the vehicle calls "burn".', 'С заданным шансом volume бензобака перестаёт принимать попадания, появляется вспышка огня и машина вызывает "burn".', 'Із заданим шансом volume бензобака перестає приймати влучання, з\'являється спалах вогню і машина викликає "burn".', '按你设定的概率，油箱 volume 不再受击，出现火焰爆发，载具调用 "burn"。'],
  [P + 'b.van.fuel_tank.n', 'A volume "fuel"; a handler "burn"; a caller of "pierce_fuel" (car.inc: {on break_armor} with {if volume "fuel"}).', 'Volume "fuel"; обработчик "burn"; вызов "pierce_fuel" (car.inc: {on break_armor} с {if volume "fuel"}).', 'Volume "fuel"; обробник "burn"; виклик "pierce_fuel" (car.inc: {on break_armor} з {if volume "fuel"}).', 'volume "fuel"；处理器 "burn"；调用 "pierce_fuel" 的地方（car.inc：{on break_armor} 中的 {if volume "fuel"}）。'],
  [P + 'b.van.fuel_tank.f.chance', 'Fire chance', 'Шанс пожара', 'Шанс пожежі', '起火概率'],
  [P + 'b.van.fuel_tank.f.effect', 'Burst effect', 'Эффект вспышки', 'Ефект спалаху', '爆发特效'],

  // 31 b.van.windscreen
  [P + 'b.van.windscreen', 'Windscreen shatters', 'Лобовое стекло разбивается', 'Лобове скло розбивається', '挡风玻璃破碎'],
  [P + 'b.van.windscreen.d', 'The glass volume stops taking hits, glass splinters fly and a moment later the glass part of the model is cut away.', 'Volume стекла перестаёт принимать попадания, летят осколки, и через миг стеклянная часть модели отрезается.', 'Volume скла перестає приймати влучання, летять уламки, і за мить скляна частина моделі відрізається.', '玻璃 volume 不再受击，碎片飞出，片刻后模型的玻璃部分被切掉。'],
  [P + 'b.van.windscreen.n', 'A volume and a bone "glass"; a caller of "break_glass".', 'Volume и кость "glass"; вызов "break_glass".', 'Volume і кістка "glass"; виклик "break_glass".', 'volume 和骨骼 "glass"；调用 "break_glass" 的地方。'],
  [P + 'b.van.windscreen.f.effect', 'Splinter effect', 'Эффект осколков', 'Ефект уламків', '碎片特效'],

  // 32 b.van.track_side
  [P + 'b.van.track_side', 'Track breaks only on front or rear hits', 'Гусеница рвётся только от попаданий спереди или сзади', 'Гусениця рветься лише від влучань спереду або ззаду', '只有正面或尾部命中才会打断履带'],
  [P + 'b.van.track_side.d', 'A helper "track_hit": on a front or rear hit, with the chance max_rand, it breaks the hit track if it still works and shows a damage note.', 'Помощник "track_hit": при попадании спереди или сзади с шансом max_rand ломает задетую гусеницу, если она цела, и показывает сообщение о повреждении.', 'Помічник "track_hit": при влучанні спереду або ззаду з шансом max_rand ламає зачеплену гусеницю, якщо вона ціла, і показує повідомлення про пошкодження.', '辅助宏 "track_hit"：正面或尾部命中时，以 max_rand 概率打断被击中且仍完好的履带，并显示损伤提示。'],
  [P + 'b.van.track_side.n', 'Parts and volumes "trackleft" and "trackright". Call it inside a hit handler: ("track_hit" max_rand(0.3)).', 'Части и volumes "trackleft" и "trackright". Вызывайте внутри обработчика попадания: ("track_hit" max_rand(0.3)).', 'Частини і volumes "trackleft" і "trackright". Викликайте всередині обробника влучання: ("track_hit" max_rand(0.3)).', '部件和 volume "trackleft" 与 "trackright"。在命中处理器中调用：("track_hit" max_rand(0.3))。'],
  [P + 'b.van.track_side.w', 'Vanilla also has a side-hit branch with a second chance min_rand; this piece leaves it out.', 'В игре есть ещё ветка для попаданий сбоку со вторым шансом min_rand; здесь её нет.', 'У грі є ще гілка для влучань збоку з другим шансом min_rand; тут її немає.', '原版还有一个侧面命中分支，使用第二个概率 min_rand；本片段没有包含它。'],

  // 33 b.van.leave_button
  [P + 'b.van.leave_button', '"Leave vehicle" button: crew out, then wreck', 'Кнопка "Покинуть технику": экипаж выходит, потом обломки', 'Кнопка "Покинути техніку": екіпаж виходить, потім уламки', '"弃车"按钮：乘员下车，然后报废'],
  [P + 'b.van.leave_button.d', 'The game sends "leave_unit" for the leave button. The crew climbs out over 3 seconds; if nobody is back in after 15 seconds the vehicle becomes neutral, cannot be repaired and blows up.', 'Игра посылает "leave_unit" по кнопке выхода. Экипаж вылезает за 3 секунды; если через 15 секунд никто не вернулся, машина становится ничьей, её нельзя починить, и она взрывается.', 'Гра надсилає "leave_unit" за кнопкою виходу. Екіпаж вилазить за 3 секунди; якщо через 15 секунд ніхто не повернувся, машина стає нічиєю, її не можна полагодити, і вона вибухає.', '按下弃车按钮时游戏发送 "leave_unit"。乘员在 3 秒内下车；15 秒后若无人回到车上，载具变为中立、无法修理并爆炸。'],
  [P + 'b.van.leave_button.n', 'A handler "explosion"; a component "body".', 'Обработчик "explosion"; компонент "body".', 'Обробник "explosion"; компонент "body".', '处理器 "explosion"；部件 "body"。'],

  // 34 b.van.die_where
  [P + 'b.van.die_where', 'Death fall chosen by where he is', 'Падение при смерти зависит от того, где он', 'Падіння при смерті залежить від того, де він', '根据所在位置选择死亡倒下方式'],
  [P + 'b.van.die_where.d', 'Goes inside {on "die"}. A soldier on a ship gun, car seat, ladder, tower or vehicle is thrown off in a fitting way; on foot or at a gun he just dies with blood.', 'Ставится внутрь {on "die"}. Солдат на корабельном орудии, сиденье машины, лестнице, вышке или технике сбрасывается подходящим способом; пешком или у орудия он просто умирает с кровью.', 'Ставиться всередину {on "die"}. Солдат на корабельній гарматі, сидінні машини, драбині, вежі чи техніці скидається відповідним способом; пішки або біля гармати він просто помирає з кров\'ю.', '放在 {on "die"} 里面。士兵在舰炮、车座、梯子、塔楼或载具上时，会以合适的方式被甩下；步行或在火炮旁时直接带血死亡。'],
  [P + 'b.van.die_where.n', 'Handlers throw_off_from_ship, throw_off_from_ladder, throw_off_from_tower, throw_off_from_vehicle and die_with_blood (human.inc has them).', 'Обработчики throw_off_from_ship, throw_off_from_ladder, throw_off_from_tower, throw_off_from_vehicle и die_with_blood (есть в human.inc).', 'Обробники throw_off_from_ship, throw_off_from_ladder, throw_off_from_tower, throw_off_from_vehicle і die_with_blood (є в human.inc).', '处理器 throw_off_from_ship、throw_off_from_ladder、throw_off_from_tower、throw_off_from_vehicle 和 die_with_blood（human.inc 中都有）。'],

  // 35 b.van.fall_height
  [P + 'b.van.fall_height', 'Falls from height: die, stumble or drop', 'Падение с высоты: смерть, спотыкание или падение', 'Падіння з висоти: смерть, спотикання чи падіння', '从高处坠落：死亡、踉跄或倒地'],
  [P + 'b.van.fall_height.d', 'Above the high mark the soldier is thrown off and dies; above the low mark he is thrown off and lives; lower than that he just falls to the ground.', 'Выше верхней отметки солдата сбрасывает, и он погибает; выше нижней - сбрасывает, и он живёт; ниже он просто падает на землю.', 'Вище верхньої позначки солдата скидає, і він гине; вище нижньої - скидає, і він живе; нижче він просто падає на землю.', '高于高位时士兵被甩下并死亡；高于低位时被甩下但存活；更低时只是倒在地上。'],
  [P + 'b.van.fall_height.n', 'A caller of "falldown".', 'Вызов "falldown".', 'Виклик "falldown".', '需要调用 "falldown" 的地方。'],
  [P + 'b.van.fall_height.f.high', 'Deadly height (m)', 'Смертельная высота (м)', 'Смертельна висота (м)', '致命高度（米）'],
  [P + 'b.van.fall_height.f.low', 'Stumble height (m)', 'Высота спотыкания (м)', 'Висота спотикання (м)', '踉跄高度（米）'],

  // 36 b.van.knock_down
  [P + 'b.van.knock_down', 'Knocked flat unless in water', 'Сбит с ног, если не в воде', 'Збитий з ніг, якщо не у воді', '不在水中时被击倒'],
  [P + 'b.van.knock_down.d', 'On "knock_down" the soldier is knocked flat for a while, but not when he stands in water.', 'По "knock_down" солдата на время сбивает с ног, но не когда он стоит в воде.', 'За "knock_down" солдата на час збиває з ніг, але не коли він стоїть у воді.', '收到 "knock_down" 时士兵会被击倒一段时间，但站在水中时不会。'],
  [P + 'b.van.knock_down.n', 'A caller of "knock_down" (human.inc calls it from "throw_off_end").', 'Вызов "knock_down" (human.inc делает его из "throw_off_end").', 'Виклик "knock_down" (human.inc робить його з "throw_off_end").', '需要调用 "knock_down" 的地方（human.inc 在 "throw_off_end" 中调用）。'],

  // 37 b.van.capturer
  [P + 'b.van.capturer', 'Mark the soldier who takes a flag', 'Пометить солдата, который берёт флаг', 'Позначити солдата, який бере прапор', '标记夺取旗帜的士兵'],
  [P + 'b.van.capturer.d', 'When the soldier gets "capture", he gets a tag, so other scripts can find who took the flag.', 'Когда солдат получает "capture", ему добавляется тег, и другие скрипты могут найти, кто взял флаг.', 'Коли солдат отримує "capture", йому додається тег, і інші скрипти можуть знайти, хто взяв прапор.', '士兵收到 "capture" 时会获得一个标签，其他脚本可借此找到夺旗者。'],
  [P + 'b.van.capturer.f.tag', 'Tag to add', 'Добавляемый тег', 'Тег, що додається', '要添加的标签'],

  // 38 b.van.flag_pole
  [P + 'b.van.flag_pole', 'Flag that lowers and rises when captured', 'Флаг, который опускается и поднимается при захвате', 'Прапор, що опускається і піднімається під час захоплення', '被占领时降下再升起的旗帜'],
  [P + 'b.van.flag_pole.d', 'A whole object block: on capture the old flag goes down, its texture changes, then the new flag goes up and the object is tagged "captured". "cancel" stops it, "enable" and "disable" switch the touch volume.', 'Целый блок объекта: при захвате старый флаг опускается, текстура меняется, затем новый флаг поднимается и объект получает тег "captured". "cancel" останавливает, "enable" и "disable" переключают volume касания.', 'Цілий блок об\'єкта: під час захоплення старий прапор опускається, текстура змінюється, потім новий прапор піднімається і об\'єкт отримує тег "captured". "cancel" зупиняє, "enable" і "disable" перемикають volume дотику.', '完整的物体块：被占领时旧旗降下、贴图切换，然后新旗升起，物体获得标签 "captured"。"cancel" 停止过程，"enable" 和 "disable" 切换接触 volume。'],
  [P + 'b.van.flag_pole.n', 'Animations "up" and "down"; a texture variant "1"; a volume "activate".', 'Анимации "up" и "down"; вариант текстуры "1"; volume "activate".', 'Анімації "up" і "down"; варіант текстури "1"; volume "activate".', '动画 "up" 和 "down"；贴图变体 "1"；volume "activate"。'],
  [P + 'b.van.flag_pole.f.tags', 'Flag object tags', 'Теги объекта флага', 'Теги об\'єкта прапора', '旗帜物体标签'],
  [P + 'b.van.flag_pole.f.tags.h', 'The tag the flag object carries in its .def; vanilla uses "flag captureable".', 'Тег, который объект флага несёт в своём .def; в игре "flag captureable".', 'Тег, який об\'єкт прапора має у своєму .def; у грі "flag captureable".', '旗帜物体在 .def 中带的标签；原版为 "flag captureable"。']
];

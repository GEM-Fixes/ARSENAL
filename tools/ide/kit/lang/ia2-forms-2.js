// Lang rows of the Code Pieces group ia2-forms-2 (unit and object forms from the game's own files): [key, en, ru, uk, zh].
// Author: Imperator_Aug (ARSENAL, ia-27fed0f5)
'use strict';

const K = 'ide.kit.p.';

module.exports = [
  // 39 b.van.drop_item
  [K + 'b.van.drop_item', 'Dropped item is tossed aside', 'Брошенный предмет отлетает в сторону', 'Кинутий предмет відлітає вбік', '丢下的物品被抛到一旁'],
  [K + 'b.van.drop_item.d', 'When a soldier drops this item, it gets a small push in the drop direction with a little random sideways spin, so it does not land in one spot.',
    'Когда солдат бросает этот предмет, он получает лёгкий толчок в сторону броска с небольшим случайным разбросом, чтобы не падать в одну точку.',
    'Коли солдат кидає цей предмет, він отримує легкий поштовх у бік кидка з невеликим випадковим розкидом, щоб не падати в одну точку.',
    '士兵丢下这个物品时，它会沿丢弃方向被轻推一下，并带一点随机侧向偏移，不会总落在同一点。'],

  // 40 b.van.range_target
  [K + 'b.van.range_target', 'Range target that only falls to its weapon', 'Мишень, которую валит только своё оружие', 'Мішень, яку валить лише своя зброя', '只被对应武器击倒的靶子'],
  [K + 'b.van.range_target.d', 'A shooting range target breaks only when hit by the ammo type that matches its tag: smg targets by pistol ammo, rifle by rifle, mgun by mgun, zenite by zenite. Other hits do nothing.',
    'Мишень на стрельбище ломается только от попадания боеприпаса, подходящего к её тегу: smg от pistol, rifle от rifle, mgun от mgun, zenite от zenite. Прочие попадания ничего не делают.',
    'Мішень на стрільбищі ламається лише від влучання набою, що відповідає її тегу: smg від pistol, rifle від rifle, mgun від mgun, zenite від zenite. Інші влучання нічого не роблять.',
    '靶场靶子只有被与其标签匹配的弹药击中才会倒下：smg 对 pistol，rifle 对 rifle，mgun 对 mgun，zenite 对 zenite。其他命中无效。'],
  [K + 'b.van.range_target.n', 'The target unit tagged smg, rifle, mgun or zenite, and a "break" reaction in the same block.',
    'Юнит мишени с тегом smg, rifle, mgun или zenite и реакция "break" в том же блоке.',
    'Юніт мішені з тегом smg, rifle, mgun або zenite і реакція "break" у тому самому блоці.',
    '靶子单位带有 smg、rifle、mgun 或 zenite 标签，并且同一块中有 "break" 反应。'],

  // 41 b.van.chimney
  [K + 'b.van.chimney', 'Chimney smoke that comes and goes', 'Дым из трубы, который то идёт, то нет', 'Дим із труби, що то йде, то ні', '时有时无的烟囱烟雾'],
  [K + 'b.van.chimney.d', 'Every so often the chimney view is started or paused by chance, so a house smokes some of the time. The reaction calls itself again after the wait.',
    'Время от времени view трубы случайно запускается или ставится на паузу, так что дом дымит лишь часть времени. Реакция снова вызывает себя после паузы.',
    'Час від часу view труби випадково запускається або ставиться на паузу, тож будинок димить лише частину часу. Реакція знову викликає себе після паузи.',
    '烟囱的 view 每隔一段时间随机开启或暂停，所以房子只是有时冒烟。等待结束后反应会再次调用自己。'],
  [K + 'b.van.chimney.n', 'A view named flue added on spawn, and a spawn reaction that calls "flue_process" once.',
    'View с именем flue, добавленный в spawn, и реакция spawn, которая один раз вызывает "flue_process".',
    'View з іменем flue, доданий у spawn, і реакція spawn, яка один раз викликає "flue_process".',
    '在 spawn 时添加名为 flue 的 view，并由 spawn 反应调用一次 "flue_process"。'],
  [K + 'b.van.chimney.f.chance', 'Chance of smoke', 'Шанс дыма', 'Шанс диму', '冒烟概率'],
  [K + 'b.van.chimney.f.chance.h', 'From 0 to 1; 0.5 means half the time.', 'От 0 до 1; 0.5 значит половину времени.', 'Від 0 до 1; 0.5 означає половину часу.', '0 到 1；0.5 表示一半时间。'],
  [K + 'b.van.chimney.f.view', 'Smoke view', 'View дыма', 'View диму', '烟雾 view'],
  [K + 'b.van.chimney.f.view_2', 'Same view again', 'Тот же view ещё раз', 'Той самий view ще раз', '再填同一个 view'],
  [K + 'b.van.chimney.f.seconds', 'Seconds between checks', 'Секунд между проверками', 'Секунд між перевірками', '两次检查间隔秒数'],

  // 42 b.van.scorch
  [K + 'b.van.scorch', 'Scorch mark under a wreck', 'Подпалина под обломками', 'Пропалина під уламками', '残骸下的焦痕'],
  [K + 'b.van.scorch.d', 'When the destroyed stamp is called, a burnt ground mark is placed under the object. no_position puts it at the object itself, not at a hit point.',
    'Когда вызывается destroyed_stamp, под объектом появляется выжженное пятно. no_position ставит его на сам объект, а не в точку попадания.',
    'Коли викликається destroyed_stamp, під об\'єктом з\'являється випалена пляма. no_position ставить її на сам об\'єкт, а не в точку влучання.',
    '调用 destroyed_stamp 时，在物体下方放置一块烧焦的地面痕迹。no_position 让它放在物体本身位置，而不是命中点。'],
  [K + 'b.van.scorch.f.entity', 'Mark to place', 'Ставимая отметина', 'Відмітина, що ставиться', '要放置的痕迹'],

  // 43 b.van.crush_fx_kinds
  [K + 'b.van.crush_fx_kinds', 'Crush effect per material (wood, concrete, steel)', 'Эффект разрушения по материалу (дерево, бетон, сталь)', 'Ефект руйнування за матеріалом (дерево, бетон, сталь)', '按材质的倒塌特效（木、混凝土、钢）'],
  [K + 'b.van.crush_fx_kinds.d', 'Three blocks pick the crush effect by material tag: wood throws splinters, concrete stone dust, steel a dust cloud. Concrete and steel also get a very long burn time, so they do not burn away.',
    'Три блока выбирают эффект разрушения по тегу материала: дерево даёт щепки, бетон каменную пыль, сталь облако пыли. Бетону и стали также дано очень долгое время горения, чтобы они не сгорали.',
    'Три блоки обирають ефект руйнування за тегом матеріалу: дерево дає тріски, бетон кам\'яний пил, сталь хмару пилу. Бетону й сталі також дано дуже довгий час горіння, щоб вони не згоряли.',
    '三个块按材质标签选择倒塌特效：木头飞出木屑，混凝土扬起石尘，钢扬起尘云。混凝土和钢还设置了很长的燃烧时间，因此不会被烧掉。'],
  [K + 'b.van.crush_fx_kinds.n', 'A base block for the same units that calls "crush_fx" when they collapse.',
    'Базовый блок для тех же юнитов, который вызывает "crush_fx" при обрушении.',
    'Базовий блок для тих самих юнітів, який викликає "crush_fx" під час обвалу.',
    '同一批单位的基础块，在倒塌时调用 "crush_fx"。'],
  [K + 'b.van.crush_fx_kinds.f.tags', 'Wood unit tags', 'Теги деревянного юнита', 'Теги дерев\'яного юніта', '木质单位标签'],
  [K + 'b.van.crush_fx_kinds.f.tags.h', 'Added after the word wood; the block works on units that have both tags.', 'Ставится после слова wood; блок действует на юниты с обоими тегами.', 'Ставиться після слова wood; блок діє на юніти з обома тегами.', '写在 wood 之后；该块作用于同时带有两个标签的单位。'],
  [K + 'b.van.crush_fx_kinds.f.wood_fx', 'Wood crush effect', 'Эффект для дерева', 'Ефект для дерева', '木头倒塌特效'],
  [K + 'b.van.crush_fx_kinds.f.tags_2', 'Concrete unit tags', 'Теги бетонного юнита', 'Теги бетонного юніта', '混凝土单位标签'],
  [K + 'b.van.crush_fx_kinds.f.stone_fx', 'Concrete crush effect', 'Эффект для бетона', 'Ефект для бетону', '混凝土倒塌特效'],
  [K + 'b.van.crush_fx_kinds.f.tags_3', 'Steel unit tags', 'Теги стального юнита', 'Теги сталевого юніта', '钢质单位标签'],
  [K + 'b.van.crush_fx_kinds.f.steel_fx', 'Steel crush effect', 'Эффект для стали', 'Ефект для сталі', '钢倒塌特效'],

  // 44 b.van.throw_human
  [K + 'b.van.throw_human', 'Collapsing tower throws its men off', 'Рушащаяся вышка сбрасывает людей', 'Вежа, що падає, скидає людей', '倒塌的塔把人甩下去'],
  [K + 'b.van.throw_human.d', 'When "throw_human" is called, every soldier on the object is thrown up and away, turned at random, and dies.',
    'Когда вызывается "throw_human", каждый солдат на объекте подбрасывается вверх и в сторону, случайно разворачивается и погибает.',
    'Коли викликається "throw_human", кожен солдат на об\'єкті підкидається вгору й убік, випадково розвертається і гине.',
    '调用 "throw_human" 时，物体上的每个士兵都会被向上并向外抛出，随机转向，并死亡。'],
  [K + 'b.van.throw_human.n', 'Something that calls "throw_human", such as the next_stage or last_stage reaction of a staged building.',
    'Что-то, что вызывает "throw_human", например реакция next_stage или last_stage поэтапной постройки.',
    'Щось, що викликає "throw_human", наприклад реакція next_stage або last_stage поетапної споруди.',
    '需要有东西调用 "throw_human"，例如分阶段建筑的 next_stage 或 last_stage 反应。'],

  // 45 b.van.tree_snow
  [K + 'b.van.tree_snow', 'Tree drops its snow once', 'Дерево один раз сбрасывает снег', 'Дерево один раз скидає сніг', '树只抖落一次积雪'],
  [K + 'b.van.tree_snow.d', 'A winter tree that is shaken plays a snow fall effect on its crown. A flag makes sure it happens only once.',
    'Зимнее дерево при сотрясении показывает эффект падающего снега на кроне. Флаг следит, чтобы это было только один раз.',
    'Зимове дерево під час струсу показує ефект падіння снігу на кроні. Прапорець стежить, щоб це було лише раз.',
    '被摇动的冬季树会在树冠上播放落雪特效。一个标志保证只发生一次。'],
  [K + 'b.van.tree_snow.n', 'The flag snow set to 1 for winter trees, and something that calls "snow_fall".',
    'Флаг snow, равный 1 у зимних деревьев, и что-то, что вызывает "snow_fall".',
    'Прапорець snow, рівний 1 у зимових дерев, і щось, що викликає "snow_fall".',
    '冬季树的 snow 标志设为 1，并有东西调用 "snow_fall"。'],
  [K + 'b.van.tree_snow.f.effect', 'Snow fall effect', 'Эффект падения снега', 'Ефект падіння снігу', '落雪特效'],

  // 46 b.van.tree_wind
  [K + 'b.van.tree_wind', 'Trees stop swaying when bare or fallen', 'Деревья не качаются, если голые или упали', 'Дерева не гойдаються, якщо голі або впали', '光秃或倒下的树停止摇摆'],
  [K + 'b.van.tree_wind.d', 'A tree sways in the wind only while it has leaves and stands. A bare or fallen tree stops moving with the wind.',
    'Дерево качается на ветру, только пока у него есть листва и оно стоит. Голое или упавшее дерево перестаёт двигаться от ветра.',
    'Дерево гойдається на вітрі, лише поки має листя і стоїть. Голе або повалене дерево перестає рухатися від вітру.',
    '树只有在有叶子并且立着时才会随风摇摆。光秃或倒下的树不再随风动。'],

  // 47 b.van.animal_avoid
  [K + 'b.van.animal_avoid', 'Animal clucks when it runs from danger', 'Животное кудахчет, убегая от опасности', 'Тварина кудкудакає, тікаючи від небезпеки', '动物逃离危险时咯咯叫'],
  [K + 'b.van.animal_avoid.d', 'When the game makes an animal run away from something, it sometimes plays a sound, by default a chicken cluck.',
    'Когда игра заставляет животное убегать от чего-то, оно иногда издаёт звук, по умолчанию куриное кудахтанье.',
    'Коли гра змушує тварину тікати від чогось, вона іноді видає звук, за замовчуванням курячий кудкудак.',
    '当游戏让动物逃离某物时，它有时会发出声音，默认是鸡的咯咯声。'],
  [K + 'b.van.animal_avoid.f.chance', 'Chance of sound', 'Шанс звука', 'Шанс звуку', '发声概率'],
  [K + 'b.van.animal_avoid.f.chance.h', 'From 0 to 1; 0.3 means about one time in three.', 'От 0 до 1; 0.3 значит примерно один раз из трёх.', 'Від 0 до 1; 0.3 означає приблизно раз із трьох.', '0 到 1；0.3 表示大约三次一次。'],
  [K + 'b.van.animal_avoid.f.sound', 'Sound file', 'Файл звука', 'Файл звуку', '声音文件'],

  // 48 b.van.loco_warm
  [K + 'b.van.loco_warm', 'Steam locomotive warming up', 'Паровоз прогревается', 'Паротяг прогрівається', '蒸汽机车预热'],
  [K + 'b.van.loco_warm.d', 'When the engine sends warm on, the chimney starts to smoke and, while the train stands still, the four steam valves puff at random moments every few seconds. Warm off stops the puffs and the smoke.',
    'Когда движок шлёт warm on, труба начинает дымить, а пока поезд стоит, четыре паровых клапана выпускают пар в случайные моменты каждые несколько секунд. Warm off останавливает пар и дым.',
    'Коли рушій надсилає warm on, труба починає димити, а поки потяг стоїть, чотири парові клапани випускають пару у випадкові моменти кожні кілька секунд. Warm off зупиняє пару й дим.',
    '引擎发送 warm on 时，烟囱开始冒烟；列车静止时，四个蒸汽阀每隔几秒在随机时刻喷汽。warm off 会停止喷汽和冒烟。'],
  [K + 'b.van.loco_warm.n', 'Views warm_smoke and warm_steam1 to warm_steam4 added to the locomotive (as in the game\'s railway update_fx reaction).',
    'View warm_smoke и warm_steam1 - warm_steam4, добавленные паровозу (как в игровой реакции update_fx в railway).',
    'View warm_smoke і warm_steam1 - warm_steam4, додані паротягу (як в ігровій реакції update_fx у railway).',
    '给机车添加的 view：warm_smoke 和 warm_steam1 到 warm_steam4（同游戏 railway 中的 update_fx 反应）。'],

  // 49 b.van.loco_pace
  [K + 'b.van.loco_pace', 'Steam puffs paced by speed', 'Клубы пара в такт скорости', 'Клуби пари в такт швидкості', '随速度变化的蒸汽喷吐'],
  [K + 'b.van.loco_pace.d', 'While the train moves, it puffs steam over and over: a long fast puff when above the speed you set, a short slow puff below it.',
    'Пока поезд едет, он снова и снова выпускает пар: длинный быстрый клуб выше заданной скорости и короткий медленный ниже неё.',
    'Поки потяг їде, він знову й знову випускає пару: довгий швидкий клуб вище заданої швидкості й короткий повільний нижче неї.',
    '列车行驶时会反复喷汽：高于设定速度时是长而快的喷吐，低于时是短而慢的喷吐。'],
  [K + 'b.van.loco_pace.n', 'Views move_steam_fast and move_steam_slow, the sound moving, and a reaction that calls "moving" when the train starts.',
    'View move_steam_fast и move_steam_slow, звук moving и реакция, вызывающая "moving" при старте поезда.',
    'View move_steam_fast і move_steam_slow, звук moving і реакція, що викликає "moving" на старті потяга.',
    'view move_steam_fast 和 move_steam_slow、声音 moving，以及在列车起步时调用 "moving" 的反应。'],
  [K + 'b.van.loco_pace.f.speed', 'Fast speed limit', 'Порог быстрой скорости', 'Поріг швидкої швидкості', '快速阈值'],
  [K + 'b.van.loco_pace.f.speed.h', 'Speed in km/h above which the fast puff is used.', 'Скорость в км/ч, выше которой идёт быстрый клуб.', 'Швидкість у км/год, вище якої йде швидкий клуб.', '高于此速度（公里/小时）时使用快速喷吐。'],

  // 50 b.van.rail_points
  [K + 'b.van.rail_points', 'Railway points that switch sides', 'Стрелка, переключающая пути', 'Стрілка, що перемикає колії', '可切换方向的铁路道岔'],
  [K + 'b.van.rail_points.d', 'A block for a railway switch. Switch toggles it, switchl and switchr set a side. When the game reports the new side, the matching body part is made walkable and a tag tells which side is set.',
    'Блок для железнодорожной стрелки. switch переключает её, switchl и switchr ставят сторону. Когда игра сообщает новую сторону, нужная часть корпуса становится проходимой, а тег показывает выбранную сторону.',
    'Блок для залізничної стрілки. switch перемикає її, switchl і switchr ставлять бік. Коли гра повідомляє новий бік, потрібна частина корпусу стає прохідною, а тег показує обраний бік.',
    '铁路道岔用的块。switch 切换方向，switchl 和 switchr 指定一侧。游戏报告新方向时，对应的车体部分变为可通行，并用标签标明当前一侧。'],
  [K + 'b.van.rail_points.n', 'A switch model with the volumes body and body1.',
    'Модель стрелки с volume body и body1.',
    'Модель стрілки з volume body і body1.',
    '带有 volume body 和 body1 的道岔模型。'],
  [K + 'b.van.rail_points.f.tags', 'Switch block tags', 'Теги блока стрелки', 'Теги блоку стрілки', '道岔块标签'],

  // 51 b.van.tank_car
  [K + 'b.van.tank_car', 'Tank wagon explodes when hit or rammed', 'Цистерна взрывается от пробития или тарана', 'Цистерна вибухає від пробиття або тарану', '油罐车被击穿或撞击时爆炸'],
  [K + 'b.van.tank_car.d', 'If a shot breaks through the fuel tank part, or a vehicle runs into it, the wagon calls its explosion reaction.',
    'Если выстрел пробивает часть с топливом или в неё врезается машина, вагон вызывает свою реакцию взрыва.',
    'Якщо постріл пробиває частину з паливом або в неї врізається машина, вагон викликає свою реакцію вибуху.',
    '若射击击穿燃料罐部分，或有车辆撞上它，车厢会调用自己的爆炸反应。'],
  [K + 'b.van.tank_car.n', 'A volume named fuel in the model, and an "explosion" reaction in the same block.',
    'Volume с именем fuel в модели и реакция "explosion" в том же блоке.',
    'Volume з іменем fuel у моделі і реакція "explosion" у тому самому блоці.',
    '模型中名为 fuel 的 volume，以及同一块中的 "explosion" 反应。'],
  [K + 'b.van.tank_car.f.volume', 'Fuel tank volume', 'Volume бака', 'Volume бака', '燃料罐 volume'],
  [K + 'b.van.tank_car.f.volume_2', 'Same volume again', 'Тот же volume ещё раз', 'Той самий volume ще раз', '再填同一个 volume'],

  // 52 b.van.muzzle_blast
  [K + 'b.van.muzzle_blast', 'Muzzle blast that shakes the ground', 'Дульный выхлоп, сотрясающий землю', 'Дульний вихлоп, що струшує землю', '震动地面的炮口冲击'],
  [K + 'b.van.muzzle_blast.d', 'Each shot of the gun raises dust under the barrel, shows a fire flash at the muzzle and sends a small blast wave that pushes light things nearby.',
    'Каждый выстрел орудия поднимает пыль под стволом, даёт вспышку у дула и посылает слабую взрывную волну, толкающую лёгкие предметы рядом.',
    'Кожен постріл гармати здіймає пил під стволом, дає спалах біля дула й посилає слабку вибухову хвилю, що штовхає легкі предмети поруч.',
    '火炮每次射击都会在炮管下扬起尘土，在炮口显示火光，并发出一道小冲击波推动附近的轻物体。'],
  [K + 'b.van.muzzle_blast.n', 'Bones basis and Foresight1 in the gun model.', 'Кости basis и Foresight1 в модели орудия.', 'Кістки basis і Foresight1 у моделі гармати.', '炮模型中的骨骼 basis 和 Foresight1。'],
  [K + 'b.van.muzzle_blast.f.place', 'Weapon place', 'Место оружия', 'Місце зброї', '武器位置'],
  [K + 'b.van.muzzle_blast.f.dust', 'Dust effect', 'Эффект пыли', 'Ефект пилу', '尘土特效'],
  [K + 'b.van.muzzle_blast.f.bone', 'Dust bone', 'Кость пыли', 'Кістка пилу', '尘土骨骼'],
  [K + 'b.van.muzzle_blast.f.fire', 'Muzzle fire effect', 'Эффект огня у дула', 'Ефект вогню біля дула', '炮口火焰特效'],
  [K + 'b.van.muzzle_blast.f.muzzle', 'Muzzle bone', 'Кость дула', 'Кістка дула', '炮口骨骼'],
  [K + 'b.van.muzzle_blast.f.muzzle_2', 'Same bone again', 'Та же кость ещё раз', 'Та сама кістка ще раз', '再填同一个骨骼'],

  // 53 b.van.casing
  [K + 'b.van.casing', 'Ejected shell case that flies and fades', 'Гильза, которая вылетает и исчезает', 'Гільза, що вилітає і зникає', '飞出并消失的弹壳'],
  [K + 'b.van.casing.d', 'After a shot the gun breech smokes briefly and a real shell case object is thrown out backwards. The case trails smoke, stops smoking after a few seconds and then fades away.',
    'После выстрела казённик ненадолго дымит, а назад выбрасывается настоящая гильза-объект. Гильза тянет дым, через несколько секунд перестаёт дымить и затем исчезает.',
    'Після пострілу казенник ненадовго димить, а назад викидається справжня гільза-об\'єкт. Гільза тягне дим, за кілька секунд перестає димити й потім зникає.',
    '射击后炮尾短暂冒烟，并向后抛出一个真实的弹壳物体。弹壳拖着烟，几秒后停止冒烟，然后渐渐消失。'],
  [K + 'b.van.casing.n', 'Bones fx_invers and fx_shellsmoke, the entity shell_cannon, and a fire reaction that calls "spawn_shell".',
    'Кости fx_invers и fx_shellsmoke, сущность shell_cannon и реакция выстрела, вызывающая "spawn_shell".',
    'Кістки fx_invers і fx_shellsmoke, сутність shell_cannon і реакція пострілу, що викликає "spawn_shell".',
    '骨骼 fx_invers 和 fx_shellsmoke、实体 shell_cannon，以及调用 "spawn_shell" 的射击反应。'],
  [K + 'b.van.casing.f.bone', 'Breech bone', 'Кость казённика', 'Кістка казенника', '炮尾骨骼'],
  [K + 'b.van.casing.f.entity', 'Shell case object', 'Объект гильзы', 'Об\'єкт гільзи', '弹壳物体'],
  [K + 'b.van.casing.f.bone_2', 'Same bone again', 'Та же кость ещё раз', 'Та сама кістка ще раз', '再填同一个骨骼'],
  [K + 'b.van.casing.f.scale', 'Case size', 'Размер гильзы', 'Розмір гільзи', '弹壳大小'],
  [K + 'b.van.casing.f.scale.h', 'Scale of the case model; the game uses 0.014.', 'Масштаб модели гильзы; в игре 0.014.', 'Масштаб моделі гільзи; у грі 0.014.', '弹壳模型缩放；游戏中为 0.014。'],

  // 54 b.van.impact_fuse
  [K + 'b.van.impact_fuse', 'Impact fuse that ignores water', 'Ударный взрыватель, не срабатывающий в воде', 'Ударний підривник, що не спрацьовує у воді', '不受水触发的着发引信'],
  [K + 'b.van.impact_fuse.d', 'An armed grenade explodes as soon as it hits the ground or anything else, but not when it lands in water. It also skips the base grenade reaction for falling into a hole.',
    'Взведённая граната взрывается, как только ударится о землю или что-то ещё, но не при падении в воду. Также отключается базовая реакция гранаты на попадание в яму.',
    'Зведена граната вибухає, щойно вдариться об землю чи щось інше, але не при падінні у воду. Також вимикається базова реакція гранати на потрапляння в яму.',
    '已激活的手榴弹一碰到地面或其他物体就爆炸，但落入水中时不会。它还屏蔽了基础手榴弹掉进坑里的反应。'],

  // 55 b.van.throw_volumes
  [K + 'b.van.throw_volumes', 'No collisions while in the air, back on after', 'Без столкновений в полёте, затем снова', 'Без зіткнень у польоті, потім знову', '飞行中无碰撞，之后恢复'],
  [K + 'b.van.throw_volumes.d', 'When a thrown item leaves the hand its body stops colliding, so it does not hit the thrower. Once the game arms it, collisions are back on.',
    'Когда брошенный предмет покидает руку, его корпус перестаёт сталкиваться, чтобы не задеть бросающего. Когда игра его взводит, столкновения снова включаются.',
    'Коли кинутий предмет залишає руку, його корпус перестає стикатися, щоб не зачепити того, хто кидає. Коли гра його зводить, зіткнення знову вмикаються.',
    '投掷物离手时其碰撞体停止碰撞，不会撞到投掷者。游戏将其激活后，碰撞恢复。'],
  [K + 'b.van.throw_volumes.n', 'A volume named body in the thrown item model.', 'Volume с именем body в модели брошенного предмета.', 'Volume з іменем body у моделі кинутого предмета.', '投掷物模型中名为 body 的 volume。'],
  [K + 'b.van.throw_volumes.f.volume', 'Body volume', 'Volume корпуса', 'Volume корпусу', '碰撞体 volume'],
  [K + 'b.van.throw_volumes.f.volume_2', 'Same volume again', 'Тот же volume ещё раз', 'Той самий volume ще раз', '再填同一个 volume'],

  // 56 b.van.map_number
  [K + 'b.van.map_number', 'Map marker with a number', 'Маркер на карте с номером', 'Маркер на мапі з номером', '带编号的地图标记'],
  [K + 'b.van.map_number.d', 'A marker block that adds a number sign and a border ring at its number bone on spawn and shows them a second later.',
    'Блок маркера, который в spawn добавляет знак номера и рамку на кость номера и показывает их через секунду.',
    'Блок маркера, який у spawn додає знак номера й рамку на кістку номера і показує їх за секунду.',
    '一个标记块，在 spawn 时把编号标志和边框加到编号骨骼上，一秒后显示出来。'],
  [K + 'b.van.map_number.n', 'A bone fx_number in the marker model, and the view entities flag_N and skirmish_flag_border.',
    'Кость fx_number в модели маркера и view-сущности flag_N и skirmish_flag_border.',
    'Кістка fx_number у моделі маркера і view-сутності flag_N та skirmish_flag_border.',
    '标记模型中的骨骼 fx_number，以及 view 实体 flag_N 和 skirmish_flag_border。'],
  [K + 'b.van.map_number.f.tags', 'Marker block tags', 'Теги блока маркера', 'Теги блоку маркера', '标记块标签'],
  [K + 'b.van.map_number.f.marker', 'Number sign', 'Знак номера', 'Знак номера', '编号标志'],
  [K + 'b.van.map_number.f.marker.h', 'One of the game\'s flag_1 to flag_N view entities.', 'Одна из игровых view-сущностей flag_1 - flag_N.', 'Одна з ігрових view-сутностей flag_1 - flag_N.', '游戏中 flag_1 到 flag_N 的 view 实体之一。'],
];

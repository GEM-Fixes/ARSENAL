// ide kit lang rows, group ent-e-2: titles, what it does, watch out, needs and field texts of the whole entity files
// and the soldier-type and weapon-file lines (approve.md 286 to 297). Rows are [key, en, ru, uk, zh]
// (contract: tools/ide/README.md "tools/ide/kit").
// Author: Imperator_Aug (ARSENAL, ia-2dad029a)
'use strict';
const R = [];
const add = (k, en, ru, uk, zh) => R.push([k, en, ru, uk, zh]);
const P = 'ide.kit.p.';

// 0286 landing boat
add(P + 'ent.e.landingcraft', 'Complete landing boat (.def)', 'Готовый десантный катер (.def)', 'Готовий десантний катер (.def)', '完整的登陆艇（.def）');
add(P + 'ent.e.landingcraft.d',
  'A whole landing boat file, a copy of the vanilla LCVP: it floats, carries crew and passengers, has two machine guns and opens its ramp on land.',
  'Целый файл десантного катера, копия ванильного LCVP: он держится на воде, везёт экипаж и пассажиров, имеет два пулемёта и открывает аппарель у берега.',
  'Цілий файл десантного катера, копія ванільного LCVP: він тримається на воді, везе екіпаж і пасажирів, має два кулемети й відкриває рампу біля берега.',
  '一个完整的登陆艇文件，复制自原版 LCVP：能浮在水上，搭载乘员和乘客，有两挺机枪，靠岸时放下跳板。');
add(P + 'ent.e.landingcraft.n',
  'A crew.ext file in the same folder (copy the one of the vanilla lcvp folder) and a model with the bones ballast1 to ballast4, body_*, door, mgun1, mgun2, foresight4 and foresight5. See MOV-30.',
  'Файл crew.ext в той же папке (скопируйте его из ванильной папки lcvp) и модель с костями ballast1 - ballast4, body_*, door, mgun1, mgun2, foresight4 и foresight5. См. MOV-30.',
  'Файл crew.ext у тій самій теці (скопіюйте його з ванільної теки lcvp) і модель з кістками ballast1 - ballast4, body_*, door, mgun1, mgun2, foresight4 і foresight5. Див. MOV-30.',
  '同一文件夹中需要 crew.ext（从原版 lcvp 文件夹复制），以及带有 ballast1 到 ballast4、body_*、door、mgun1、mgun2、foresight4 和 foresight5 骨骼的模型。见 MOV-30。');
add(P + 'ent.e.landingcraft.w',
  'Every volume name must be a part of your model. A missing ballast volume makes the boat sink.',
  'Каждое имя объёма должно быть частью вашей модели. Без объёма ballast катер тонет.',
  'Кожне ім\'я об\'єму має бути частиною вашої моделі. Без об\'єму ballast катер тоне.',
  '每个体积名都必须是你模型中的部件。缺少 ballast 体积会让船沉没。');
add(P + 'ent.e.landingcraft.f.scale', 'Selection size', 'Размер выделения', 'Розмір виділення', '选择框大小');
add(P + 'ent.e.landingcraft.f.scale.h', 'Size of the selection mark around the boat', 'Размер метки выделения вокруг катера', 'Розмір мітки виділення навколо катера', '船周围选择标记的大小');
add(P + 'ent.e.landingcraft.f.mass', 'Mass in kg', 'Масса в кг', 'Маса в кг', '质量（千克）');
add(P + 'ent.e.landingcraft.f.model', 'Model file name', 'Имя файла модели', 'Ім\'я файлу моделі', '模型文件名');
add(P + 'ent.e.landingcraft.f.model.h', 'Without .mdl, the file in this folder', 'Без .mdl, файл в этой папке', 'Без .mdl, файл у цій теці', '不带 .mdl，即此文件夹中的文件');
add(P + 'ent.e.landingcraft.f.rounds', 'Machine gun rounds', 'Патроны пулемётов', 'Набої кулеметів', '机枪弹药数');
add(P + 'ent.e.landingcraft.f.mg', 'First machine gun', 'Первый пулемёт', 'Перший кулемет', '第一挺机枪');
add(P + 'ent.e.landingcraft.f.mg.h', 'A weapon name from set/stuff', 'Имя оружия из set/stuff', 'Ім\'я зброї з set/stuff', 'set/stuff 中的武器名');
add(P + 'ent.e.landingcraft.f.mg_2', 'Second machine gun', 'Второй пулемёт', 'Другий кулемет', '第二挺机枪');
add(P + 'ent.e.landingcraft.f.max_speed', 'Top speed (km/h)', 'Макс. скорость (км/ч)', 'Макс. швидкість (км/год)', '最高速度（公里/小时）');

// 0287 amphibious tank
add(P + 'ent.e.amphibtank', 'Complete amphibious tracked carrier (.def)', 'Готовый плавающий гусеничный транспортёр (.def)', 'Готовий плавучий гусеничний транспортер (.def)', '完整的两栖履带运输车（.def）');
add(P + 'ent.e.amphibtank.d',
  'A whole amphibious tank file, a copy of the vanilla LVT-4: it drives on land and swims in water with a second water chassis, and carries eight passengers.',
  'Целый файл плавающего танка, копия ванильного LVT-4: он едет по суше и плывёт по воде на втором, водном шасси, и везёт восемь пассажиров.',
  'Цілий файл плавучого танка, копія ванільного LVT-4: він їде суходолом і пливе водою на другому, водному шасі, і везе вісім пасажирів.',
  '一个完整的两栖坦克文件，复制自原版 LVT-4：在陆地上行驶，靠第二个水上底盘在水中航行，可载八名乘客。');
add(P + 'ent.e.amphibtank.n',
  'A model with the pivot bones of the vanilla LVT-4 (turret, wheels_l, wheels_r, seat01 to seat08, emit1 to emit10, mgun_rot). See MOV-34, MOV-30, MOV-04.',
  'Модель с опорными костями ванильного LVT-4 (turret, wheels_l, wheels_r, seat01 - seat08, emit1 - emit10, mgun_rot). См. MOV-34, MOV-30, MOV-04.',
  'Модель з опорними кістками ванільного LVT-4 (turret, wheels_l, wheels_r, seat01 - seat08, emit1 - emit10, mgun_rot). Див. MOV-34, MOV-30, MOV-04.',
  '需要带有原版 LVT-4 枢轴骨骼的模型（turret、wheels_l、wheels_r、seat01 到 seat08、emit1 到 emit10、mgun_rot）。见 MOV-34、MOV-30、MOV-04。');
add(P + 'ent.e.amphibtank.w',
  'It swims only because of PatherID "amphibia", the switch blocks of both chassis and the water chassis. Keep them together.',
  'Он плавает только благодаря PatherID "amphibia", блокам switch обоих шасси и водному шасси. Не разделяйте их.',
  'Він плаває лише завдяки PatherID "amphibia", блокам switch обох шасі та водному шасі. Не розділяйте їх.',
  '它能游泳只靠 PatherID "amphibia"、两个底盘中的 switch 块以及水上底盘。请把它们一起保留。');
add(P + 'ent.e.amphibtank.f.scale', 'Selection size', 'Размер выделения', 'Розмір виділення', '选择框大小');
add(P + 'ent.e.amphibtank.f.turret', 'Turret armour (mm)', 'Броня башни (мм)', 'Броня башти (мм)', '炮塔装甲（毫米）');
add(P + 'ent.e.amphibtank.f.turret.h', 'Four numbers: front, sides, back, top', 'Четыре числа: лоб, борта, корма, крыша', 'Чотири числа: лоб, борти, корма, дах', '四个数字：正面、侧面、后面、顶部');
add(P + 'ent.e.amphibtank.f.body', 'Hull armour (mm)', 'Броня корпуса (мм)', 'Броня корпусу (мм)', '车体装甲（毫米）');
add(P + 'ent.e.amphibtank.f.body.h', 'Four numbers: front, sides, back, top', 'Четыре числа: лоб, борта, корма, крыша', 'Чотири числа: лоб, борти, корма, дах', '四个数字：正面、侧面、后面、顶部');
add(P + 'ent.e.amphibtank.f.ammo', 'Main gun shells', 'Снаряды пушки', 'Снаряди гармати', '主炮炮弹');
add(P + 'ent.e.amphibtank.f.ammo.h', 'The ammo name in the inventory', 'Имя боеприпаса в инвентаре', 'Ім\'я боєприпасу в інвентарі', '物品栏中的弹药名');
add(P + 'ent.e.amphibtank.f.gun', 'Main gun', 'Основная пушка', 'Основна гармата', '主炮');
add(P + 'ent.e.amphibtank.f.gun.h', 'A weapon name from set/stuff', 'Имя оружия из set/stuff', 'Ім\'я зброї з set/stuff', 'set/stuff 中的武器名');
add(P + 'ent.e.amphibtank.f.ammo_2', 'Shell loaded at start', 'Снаряд в стволе', 'Снаряд у стволі', '开始时装填的炮弹');
add(P + 'ent.e.amphibtank.f.ammo_2.h', 'Use the same ammo name as above', 'Укажите то же имя боеприпаса, что выше', 'Вкажіть те саме ім\'я боєприпасу, що вище', '使用与上面相同的弹药名');
add(P + 'ent.e.amphibtank.f.mass', 'Mass in kg', 'Масса в кг', 'Маса в кг', '质量（千克）');
add(P + 'ent.e.amphibtank.f.max_speed', 'Land top speed (km/h)', 'Макс. скорость на суше (км/ч)', 'Макс. швидкість суходолом (км/год)', '陆地最高速度（公里/小时）');
add(P + 'ent.e.amphibtank.f.model', 'Model file name', 'Имя файла модели', 'Ім\'я файлу моделі', '模型文件名');
add(P + 'ent.e.amphibtank.f.model.h', 'Without .mdl, the file in this folder', 'Без .mdl, файл в этой папке', 'Без .mdl, файл у цій теці', '不带 .mdl，即此文件夹中的文件');
add(P + 'ent.e.amphibtank.f.waterline', 'Waterline height (m)', 'Высота ватерлинии (м)', 'Висота ватерлінії (м)', '吃水线高度（米）');
add(P + 'ent.e.amphibtank.f.waterline.h', 'How deep the hull sits in water', 'Насколько глубоко корпус сидит в воде', 'Наскільки глибоко корпус сидить у воді', '车体在水中下沉的深度');

// 0288 armour class file
add(P + 'ent.e.armorlayout', 'Full armour and part layout for your own tank class (.ext)', 'Полная схема брони и частей для своего класса танков (.ext)', 'Повна схема броні та частин для власного класу танків (.ext)', '为你自己的坦克类别编写完整装甲与部件布局（.ext）');
add(P + 'ent.e.armorlayout.d',
  'A new properties file with your own copy of the tank armour areas, repair times and sights, in light, medium and heavy tiers. Your tanks can then use your values without changing vanilla tanks. Not tried in game.',
  'Новый файл properties со своей копией зон брони танка, времени ремонта и прицелов, в лёгком, среднем и тяжёлом вариантах. Ваши танки смогут брать ваши значения, не меняя ванильные танки. Не проверено в игре.',
  'Новий файл properties із власною копією зон броні танка, часу ремонту та прицілів, у легкому, середньому й важкому варіантах. Ваші танки зможуть брати ваші значення, не змінюючи ванільні танки. Не перевірено в грі.',
  '一个新的 properties 文件，含你自己的坦克装甲区域、维修时间和瞄准镜副本，分轻、中、重三档。你的坦克可以使用这些数值，而不改变原版坦克。未在游戏中测试。');
add(P + 'ent.e.armorlayout.n',
  'Each tank def includes this file after /properties/tank.ext and calls one tier, for example ("armor_myclass_medium" turret(38 32 25 6) body(38 25 25 6)). See DMG-07, DMG-23, DMG-24, SDL-17.',
  'Каждый def танка подключает этот файл после /properties/tank.ext и вызывает один вариант, например ("armor_myclass_medium" turret(38 32 25 6) body(38 25 25 6)). См. DMG-07, DMG-23, DMG-24, SDL-17.',
  'Кожен def танка підключає цей файл після /properties/tank.ext і викликає один варіант, наприклад ("armor_myclass_medium" turret(38 32 25 6) body(38 25 25 6)). Див. DMG-07, DMG-23, DMG-24, SDL-17.',
  '每个坦克 def 在 /properties/tank.ext 之后引入此文件，并调用一个档位，例如 ("armor_myclass_medium" turret(38 32 25 6) body(38 25 25 6))。见 DMG-07、DMG-23、DMG-24、SDL-17。');
add(P + 'ent.e.armorlayout.w',
  'Use the same class name in every field, and one that no vanilla file uses: names are case-sensitive and a clash replaces the other helper (SDL-18). pierce_dur 999 means shots never wear the armour down (DMG-07).',
  'Укажите одно и то же имя класса во всех полях, и такое, которого нет в ванильных файлах: имена чувствительны к регистру, а совпадение заменяет другого помощника (SDL-18). pierce_dur 999 значит, что попадания никогда не изнашивают броню (DMG-07).',
  'Вкажіть те саме ім\'я класу в усіх полях, і таке, якого немає у ванільних файлах: імена чутливі до регістру, а збіг замінює іншого помічника (SDL-18). pierce_dur 999 означає, що влучання ніколи не зношують броню (DMG-07).',
  '在所有字段中使用同一个类别名，并且不要与任何原版文件重名：名称区分大小写，重名会替换另一个辅助宏（SDL-18）。pierce_dur 999 表示命中永远不会磨损装甲（DMG-07）。');
const CLS_L = ['Class name', 'Имя класса', 'Ім\'я класу', '类别名'];
const CLS_H = ['The same name in every class field', 'Одно и то же имя во всех полях класса', 'Те саме ім\'я в усіх полях класу', '所有类别字段填同一个名字'];
for (let i = 1; i <= 14; i++) {
  const n = i === 1 ? 'cls' : 'cls_' + i;
  add(P + 'ent.e.armorlayout.f.' + n, CLS_L[0] + ' (' + i + ')', CLS_L[1] + ' (' + i + ')', CLS_L[2] + ' (' + i + ')', CLS_L[3] + '（' + i + '）');
  add(P + 'ent.e.armorlayout.f.' + n + '.h', CLS_H[0], CLS_H[1], CLS_H[2], CLS_H[3]);
}
const TIER = { light: ['light', 'лёгкий', 'легкий', '轻型'], medium: ['medium', 'средний', 'середній', '中型'], heavy: ['heavy', 'тяжёлый', 'важкий', '重型'] };
for (const w of Object.keys(TIER)) {
  const t = TIER[w];
  add(P + 'ent.e.armorlayout.f.dur_' + w, 'Durability, ' + t[0], 'Прочность, ' + t[1], 'Міцність, ' + t[2], '耐久系数，' + t[3]);
  add(P + 'ent.e.armorlayout.f.dur_' + w + '.h', 'Higher = hull and engine take more blasts', 'Больше = корпус и мотор выдерживают больше взрывов', 'Більше = корпус і мотор витримують більше вибухів', '越大 = 车体和发动机能承受更多爆炸');
  add(P + 'ent.e.armorlayout.f.thr_' + w, 'Threshold, ' + t[0], 'Порог, ' + t[1], 'Поріг, ' + t[2], '阈值系数，' + t[3]);
  add(P + 'ent.e.armorlayout.f.thr_' + w + '.h', 'Higher = small blasts do no harm', 'Больше = слабые взрывы не вредят', 'Більше = слабкі вибухи не шкодять', '越大 = 小爆炸无伤害');
  add(P + 'ent.e.armorlayout.f.repair_' + w, 'Repair time factor, ' + t[0], 'Множитель ремонта, ' + t[1], 'Множник ремонту, ' + t[2], '维修时间倍数，' + t[3]);
  add(P + 'ent.e.armorlayout.f.vision_' + w, 'Main sight, ' + t[0], 'Основной прицел, ' + t[1], 'Основний приціл, ' + t[2], '主瞄准镜，' + t[3]);
  add(P + 'ent.e.armorlayout.f.vision_' + w + '.h', 'A vision name, like tank_main-m', 'Имя обзора, например tank_main-m', 'Ім\'я огляду, наприклад tank_main-m', '视野名，例如 tank_main-m');
}

// 0289 house
add(P + 'ent.e.house', 'Complete enterable house root (.def)', 'Готовый корневой файл дома с входом (.def)', 'Готовий кореневий файл будинку з входом (.def)', '完整的可进入房屋根文件（.def）');
add(P + 'ent.e.house.d',
  'The root file of a house that soldiers can enter, a copy of vanilla house_euro_101n: it lists every wall, window, floor, stair and roof part of the house. The parts themselves are their own defs.',
  'Корневой файл дома, в который могут входить солдаты, копия ванильного house_euro_101n: он перечисляет все стены, окна, полы, лестницы и части крыши дома. Сами части - отдельные def.',
  'Кореневий файл будинку, до якого можуть заходити солдати, копія ванільного house_euro_101n: він перелічує всі стіни, вікна, підлоги, сходи й частини даху будинку. Самі частини - окремі def.',
  '士兵可以进入的房屋根文件，复制自原版 house_euro_101n：列出房屋的每面墙、窗户、楼板、楼梯和屋顶部件。各部件本身是独立的 def。');
add(P + 'ent.e.house.n',
  'One part def per place, each in its own folder (window, floor, hold parts), and a house model whose bones are named like the parts. See STR-05, STR-30.',
  'Один def части на каждое место, каждый в своей папке (окно, пол, укрытие), и модель дома, кости которой названы как части. См. STR-05, STR-30.',
  'Один def частини на кожне місце, кожен у своїй теці (вікно, підлога, укриття), і модель будинку, кістки якої названі як частини. Див. STR-05, STR-30.',
  '每个位置一个部件 def，各放在自己的文件夹中（窗户、楼板、掩体部件），以及骨骼按部件命名的房屋模型。见 STR-05、STR-30。');
add(P + 'ent.e.house.w',
  'The list is the vanilla 101 house. For your own house, replace each line with your part names: the first name is the model bone, the second the part def.',
  'Список - это ванильный дом 101. Для своего дома замените каждую строку своими именами частей: первое имя - кость модели, второе - def части.',
  'Список - це ванільний будинок 101. Для власного будинку замініть кожен рядок своїми іменами частин: перше ім\'я - кістка моделі, друге - def частини.',
  '此列表是原版 101 号房屋。制作自己的房屋时，把每一行换成你的部件名：第一个名字是模型骨骼，第二个是部件 def。');
add(P + 'ent.e.house.f.model', 'Model file name', 'Имя файла модели', 'Ім\'я файлу моделі', '模型文件名');
add(P + 'ent.e.house.f.model.h', 'Without .mdl, the file in this folder', 'Без .mdl, файл в этой папке', 'Без .mdl, файл у цій теці', '不带 .mdl，即此文件夹中的文件');

// 0290 supply crate
add(P + 'ent.e.supplycrate', 'Complete air-dropped supply crate (.def)', 'Готовый сбрасываемый ящик снабжения (.def)', 'Готовий скидний ящик постачання (.def)', '完整的空投补给箱（.def）');
add(P + 'ent.e.supplycrate.d',
  'A whole supply crate file, a copy of vanilla para_ammo: a wooden box with starting items that resupplies soldiers near it and can burn.',
  'Целый файл ящика снабжения, копия ванильного para_ammo: деревянный ящик со стартовыми предметами, который пополняет припасы солдат рядом и может гореть.',
  'Цілий файл ящика постачання, копія ванільного para_ammo: дерев\'яний ящик зі стартовими предметами, який поповнює припаси солдатів поруч і може горіти.',
  '一个完整的补给箱文件，复制自原版 para_ammo：一个装有初始物品的木箱，为附近士兵补给，并且会燃烧。');
add(P + 'ent.e.supplycrate.n', 'The crate model (.mdl) in the same folder.', 'Модель ящика (.mdl) в той же папке.', 'Модель ящика (.mdl) у тій самій теці.', '同一文件夹中的箱子模型（.mdl）。');
add(P + 'ent.e.supplycrate.f.model', 'Model file name', 'Имя файла модели', 'Ім\'я файлу моделі', '模型文件名');
add(P + 'ent.e.supplycrate.f.model.h', 'Without .mdl, the file in this folder', 'Без .mdl, файл в этой папке', 'Без .mdl, файл у цій теці', '不带 .mdl，即此文件夹中的文件');
add(P + 'ent.e.supplycrate.f.preset', 'Resupply kind', 'Вид пополнения', 'Вид поповнення', '补给类型');
add(P + 'ent.e.supplycrate.f.preset.h', 'A preset of properties/resupply_generic.inc', 'Готовый набор из properties/resupply_generic.inc', 'Готовий набір з properties/resupply_generic.inc', 'properties/resupply_generic.inc 中的预设');
add(P + 'ent.e.supplycrate.f.variant', 'Texture variant', 'Вариант текстуры', 'Варіант текстури', '贴图变体');

// 0291 breed
add(P + 'ent.e.breed', 'Complete soldier type (breed .set)', 'Готовый тип солдата (breed .set)', 'Готовий тип солдата (breed .set)', '完整的士兵类型（breed .set）');
add(P + 'ent.e.breed.d',
  'A whole soldier type file, a copy of the vanilla Soviet flamethrower: look, portrait, army, icon, helmet, skills, veterancy and starting weapon.',
  'Целый файл типа солдата, копия ванильного советского огнемётчика: внешний вид, портрет, армия, значок, каска, навыки, ветеранство и стартовое оружие.',
  'Цілий файл типу солдата, копія ванільного радянського вогнеметника: зовнішній вигляд, портрет, армія, значок, каска, навички, ветеранство й стартова зброя.',
  '一个完整的士兵类型文件，复制自原版苏军喷火兵：外观、头像、阵营、图标、头盔、技能、老兵等级和初始武器。');
add(P + 'ent.e.breed.n',
  'veterancy_generic.inc in the same folder (vanilla army folders have one) and the soldier skin def. See HUM-13, HUM-21, HUM-22, KEY-21.',
  'veterancy_generic.inc в той же папке (в ванильных папках армий он есть) и def облика солдата. См. HUM-13, HUM-21, HUM-22, KEY-21.',
  'veterancy_generic.inc у тій самій теці (у ванільних теках армій він є) і def вигляду солдата. Див. HUM-13, HUM-21, HUM-22, KEY-21.',
  '同一文件夹中需要 veterancy_generic.inc（原版各阵营文件夹都有），以及士兵外观 def。见 HUM-13、HUM-21、HUM-22、KEY-21。');
add(P + 'ent.e.breed.f.skin', 'Skin name', 'Имя облика', 'Ім\'я вигляду', '外观名');
add(P + 'ent.e.breed.f.skin.h', 'A humanskin def name', 'Имя def из humanskin', 'Ім\'я def з humanskin', 'humanskin 中的 def 名');
add(P + 'ent.e.breed.f.portrait', 'Portrait name', 'Имя портрета', 'Ім\'я портрета', '头像名');
add(P + 'ent.e.breed.f.army', 'Army', 'Армия', 'Армія', '阵营');
add(P + 'ent.e.breed.f.army.h', 'For example rus, ger, usa, eng, jap', 'Например rus, ger, usa, eng, jap', 'Наприклад rus, ger, usa, eng, jap', '例如 rus、ger、usa、eng、jap');
add(P + 'ent.e.breed.f.icon', 'Icon name', 'Имя значка', 'Ім\'я значка', '图标名');
add(P + 'ent.e.breed.f.priority', 'Icon order', 'Порядок значка', 'Порядок значка', '图标顺序');
add(P + 'ent.e.breed.f.priority.h', 'Which icon shows first in a squad', 'Какой значок показывается первым в отряде', 'Який значок показується першим у загоні', '小队中哪个图标优先显示');
add(P + 'ent.e.breed.f.helmet', 'Head armour item', 'Предмет для головы', 'Предмет для голови', '头部护具');
add(P + 'ent.e.breed.f.health', 'Health', 'Здоровье', 'Здоров\'я', '生命值');
add(P + 'ent.e.breed.f.health.h', 'A percent, like 250%', 'Процент, например 250%', 'Відсоток, наприклад 250%', '百分比，例如 250%');
add(P + 'ent.e.breed.f.speed', 'Speed factor', 'Множитель скорости', 'Множник швидкості', '速度倍数');
add(P + 'ent.e.breed.f.weapon', 'Starting weapon', 'Стартовое оружие', 'Стартова зброя', '初始武器');
add(P + 'ent.e.breed.f.ammo', 'Its ammo', 'Его боеприпас', 'Його боєприпас', '其弹药');

// 0292 to 0297 lines and the mine file
add(P + 'ent.f.breed.body', 'Body armour item on a soldier', 'Бронежилет на солдате', 'Бронежилет на солдаті', '士兵身上的防弹衣');
add(P + 'ent.f.breed.body.d',
  'Gives the soldier an item on the body, like a body armour vest. Goes inside the armors block.',
  'Даёт солдату предмет на тело, например бронежилет. Ставится внутрь блока armors.',
  'Дає солдатові предмет на тіло, наприклад бронежилет. Ставиться всередину блоку armors.',
  '给士兵身上加一件物品，例如防弹背心。放在 armors 块内。');
add(P + 'ent.f.breed.body.n', 'See HUM-22, HUM-24.', 'См. HUM-22, HUM-24.', 'Див. HUM-22, HUM-24.', '见 HUM-22、HUM-24。');
add(P + 'ent.f.breed.body.f.item', 'Body item name', 'Имя предмета', 'Ім\'я предмета', '身体物品名');

add(P + 'ent.f.breed.hero', 'Hero soldier', 'Солдат-герой', 'Солдат-герой', '英雄士兵');
add(P + 'ent.f.breed.hero.d',
  'Marks this soldier type as a hero, like the vanilla consul.',
  'Делает этот тип солдата героем, как ванильный consul.',
  'Робить цей тип солдата героєм, як ванільний consul.',
  '把此士兵类型标记为英雄，如原版 consul。');

add(P + 'ent.f.breed.tags', 'Soldier tags (officer, stealth)', 'Теги солдата (офицер, скрытность)', 'Теги солдата (офіцер, скритність)', '士兵标签（军官、隐蔽）');
add(P + 'ent.f.breed.tags.d',
  'Gives the soldier type a tag that scripts and game rules can look for.',
  'Даёт типу солдата тег, который могут искать скрипты и правила игры.',
  'Дає типу солдата тег, який можуть шукати скрипти й правила гри.',
  '给士兵类型加一个标签，供脚本和游戏规则查找。');
add(P + 'ent.f.breed.tags.n',
  'See HUM-19: the engine itself reads only the kamikaze tag; the others work only through scripts that ask for them.',
  'См. HUM-19: сам движок читает только тег kamikaze; остальные работают только через скрипты, которые их проверяют.',
  'Див. HUM-19: сам рушій читає лише тег kamikaze; інші працюють лише через скрипти, які їх перевіряють.',
  '见 HUM-19：引擎本身只读取 kamikaze 标签；其他标签只有在脚本查找时才起作用。');
add(P + 'ent.f.breed.tags.f.tag', 'Tag', 'Тег', 'Тег', '标签');

add(P + 'ent.f.breed.civil', 'Civilian behaviour', 'Поведение мирного жителя', 'Поведінка мирного жителя', '平民行为');
add(P + 'ent.f.breed.civil.d',
  'Makes soldiers of this type behave as civilians, like the vanilla civilian types.',
  'Солдаты этого типа ведут себя как мирные жители, как ванильные типы civilian.',
  'Солдати цього типу поводяться як мирні жителі, як ванільні типи civilian.',
  '让此类型的士兵像平民一样行动，如原版 civilian 类型。');

add(P + 'ent.f.stuff.entity', 'Weapon or item model link', 'Связь оружия или предмета с моделью', 'Зв\'язок зброї чи предмета з моделлю', '武器或物品的模型链接');
add(P + 'ent.f.stuff.entity.d',
  'Names the entity (the def with the model) that shows this weapon or item in the world, for example when it is dropped or laid.',
  'Указывает объект (def с моделью), которым это оружие или предмет показывается в мире, например когда его бросили или установили.',
  'Вказує об\'єкт (def із моделлю), яким ця зброя чи предмет показується у світі, наприклад коли її кинули або встановили.',
  '指定在世界中显示此武器或物品的实体（带模型的 def），例如被丢下或布设时。');
add(P + 'ent.f.stuff.entity.n', 'The entity def of the item or mine.', 'Def объекта предмета или мины.', 'Def об\'єкта предмета або міни.', '物品或地雷的实体 def。');
add(P + 'ent.f.stuff.entity.f.entity', 'Entity name', 'Имя объекта', 'Ім\'я об\'єкта', '实体名');

add(P + 'ent.f.stuff.mine', 'Anti-tank mine item', 'Предмет противотанковой мины', 'Предмет протитанкової міни', '反坦克地雷物品');
add(P + 'ent.f.stuff.mine.d',
  'A whole anti-tank mine item file, a copy of the vanilla one: a heavy close blast for the vehicle on top and a weak wider blast around it.',
  'Целый файл предмета противотанковой мины, копия ванильного: сильный близкий взрыв для машины сверху и слабый широкий взрыв вокруг.',
  'Цілий файл предмета протитанкової міни, копія ванільного: сильний близький вибух для машини згори і слабкий широкий вибух навколо.',
  '一个完整的反坦克地雷物品文件，复制自原版：对压在上面的车辆造成近距离强爆炸，并在周围造成较弱的大范围爆炸。');
add(P + 'ent.f.stuff.mine.n',
  'The mine entity def. See KEY-17, DMG-13: the second blast needs the word add.',
  'Def объекта мины. См. KEY-17, DMG-13: второму взрыву нужно слово add.',
  'Def об\'єкта міни. Див. KEY-17, DMG-13: другому вибуху потрібне слово add.',
  '需要地雷实体 def。见 KEY-17、DMG-13：第二次爆炸需要 add 一词。');
add(P + 'ent.f.stuff.mine.f.entity', 'Mine entity', 'Объект мины', 'Об\'єкт міни', '地雷实体');
add(P + 'ent.f.stuff.mine.f.weight', 'Inventory weight', 'Вес в инвентаре', 'Вага в інвентарі', '物品栏重量');
add(P + 'ent.f.stuff.mine.f.mass', 'Mass in kg', 'Масса в кг', 'Маса в кг', '质量（千克）');
add(P + 'ent.f.stuff.mine.f.energy', 'Main blast power', 'Сила основного взрыва', 'Сила основного вибуху', '主爆炸威力');
add(P + 'ent.f.stuff.mine.f.inner', 'Main blast full radius', 'Радиус полной силы', 'Радіус повної сили', '主爆炸全威力半径');
add(P + 'ent.f.stuff.mine.f.inner.h', 'Full power inside this distance', 'Внутри этого расстояния полная сила', 'Всередині цієї відстані повна сила', '此距离内为全威力');
add(P + 'ent.f.stuff.mine.f.outer', 'Main blast outer radius', 'Внешний радиус взрыва', 'Зовнішній радіус вибуху', '主爆炸外半径');
add(P + 'ent.f.stuff.mine.f.outer.h', 'No effect past this distance', 'Дальше этого расстояния действия нет', 'Далі цієї відстані дії немає', '超过此距离无效果');
add(P + 'ent.f.stuff.mine.f.wide_energy', 'Wide blast power', 'Сила широкого взрыва', 'Сила широкого вибуху', '大范围爆炸威力');
add(P + 'ent.f.stuff.mine.f.wide_inner', 'Wide blast full radius', 'Полный радиус широкого', 'Повний радіус широкого', '大范围爆炸全威力半径');
add(P + 'ent.f.stuff.mine.f.wide_outer', 'Wide blast outer radius', 'Внешний радиус широкого', 'Зовнішній радіус широкого', '大范围爆炸外半径');

module.exports = R;

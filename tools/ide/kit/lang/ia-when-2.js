// Code Pieces, group ia-when-2: lang rows [key, en, ru, uk, zh] for the sections "It moves" and "Weapons and crew".
// Author: Imperator_Aug (ARSENAL, ia-4c7de030)
var ONCE = [
  'This event may stand only once in a block. A second handler for it in the same block is a fatal error: event already defined.',
  'В одном блоке это событие может быть только один раз. Второй обработчик в том же блоке даёт фатальную ошибку event already defined.',
  'В одному блоці ця подія може бути лише один раз. Другий обробник у тому самому блоці дає фатальну помилку event already defined.',
  '同一个块中此事件只能出现一次。同一块中的第二个处理器是致命错误：event already defined。'
];
var ONCE_GROUND = [
  'This event may stand only once per ground name in a block. A second handler for the same name is a fatal error: event already defined. An unknown name logs unknown terrain_fx type and ties the handler to undefined ground.',
  'В одном блоке это событие может быть только один раз для каждого имени грунта. Второй обработчик для того же имени даёт фатальную ошибку event already defined. Неизвестное имя пишет в лог unknown terrain_fx type и привязывает обработчик к неопределённому грунту.',
  'В одному блоці ця подія може бути лише один раз для кожної назви ґрунту. Другий обробник для тієї самої назви дає фатальну помилку event already defined. Невідома назва пише в лог unknown terrain_fx type і прив\'язує обробник до невизначеного ґрунту.',
  '同一个块中，每个地面名称只能有一次此事件。同一名称的第二个处理器是致命错误：event already defined。未知名称会在日志中写入 unknown terrain_fx type，并把处理器绑定到未定义的地面。'
];
var ONCE_TYPE = [
  'This event may stand only once per ground type in a block. A second handler for the same type is a fatal error: event already defined. An unknown word logs unknown terrain_pp type and ties the handler to undefined ground.',
  'В одном блоке это событие может быть только один раз для каждого типа грунта. Второй обработчик для того же типа даёт фатальную ошибку event already defined. Неизвестное слово пишет в лог unknown terrain_pp type и привязывает обработчик к неопределённому грунту.',
  'В одному блоці ця подія може бути лише один раз для кожного типу ґрунту. Другий обробник для того самого типу дає фатальну помилку event already defined. Невідоме слово пише в лог unknown terrain_pp type і прив\'язує обробник до невизначеного ґрунту.',
  '同一个块中，每种地面类型只能有一次此事件。同一类型的第二个处理器是致命错误：event already defined。未知词会在日志中写入 unknown terrain_pp type，并把处理器绑定到未定义的地面。'
];
function w(id, more) {
  var m = more || ['', '', '', ''];
  return ['ide.kit.p.' + id + '.w', ONCE[0] + m[0], ONCE[1] + m[1], ONCE[2] + m[2], ONCE[3] + m[3]];
}
module.exports = [
  ['ide.kit.p.b.event.move_on', 'When it starts moving', 'Когда начинает движение', 'Коли починає рух', '开始移动时'],
  ['ide.kit.p.b.event.move_on.d', 'Runs when the unit starts to move.', 'Срабатывает, когда юнит начинает движение.', 'Спрацьовує, коли юніт починає рух.', '单位开始移动时运行。'],
  w('b.event.move_on', [' Its value only tells the direction by its sign: forward or backward.', ' Его value показывает только направление своим знаком: вперёд или назад.', ' Її value показує лише напрямок своїм знаком: вперед або назад.', '它的 value 只用正负号表示方向：前进或后退。']),

  ['ide.kit.p.b.event.move_off', 'When it stops moving', 'Когда останавливается', 'Коли зупиняється', '停止移动时'],
  ['ide.kit.p.b.event.move_off.d', 'Runs when the unit stops.', 'Срабатывает, когда юнит останавливается.', 'Спрацьовує, коли юніт зупиняється.', '单位停下时运行。'],
  w('b.event.move_off'),

  ['ide.kit.p.b.event.turn_on', 'When it starts turning', 'Когда начинает поворот', 'Коли починає поворот', '开始转向时'],
  ['ide.kit.p.b.event.turn_on.d', 'Runs when the unit starts turning, on the spot or while driving.', 'Срабатывает, когда юнит начинает поворачивать, на месте или на ходу.', 'Спрацьовує, коли юніт починає повертати, на місці або на ходу.', '单位开始转向时运行，原地转向或行进中转向都算。'],
  w('b.event.turn_on', [' Its value only tells the direction by its sign: left or right.', ' Его value показывает только направление своим знаком: влево или вправо.', ' Її value показує лише напрямок своїм знаком: ліворуч або праворуч.', '它的 value 只用正负号表示方向：向左或向右。']),

  ['ide.kit.p.b.event.turn_off', 'When it stops turning', 'Когда заканчивает поворот', 'Коли закінчує поворот', '停止转向时'],
  ['ide.kit.p.b.event.turn_off.d', 'Runs when the turning stops.', 'Срабатывает, когда поворот заканчивается.', 'Спрацьовує, коли поворот закінчується.', '转向停止时运行。'],
  w('b.event.turn_off'),

  ['ide.kit.p.b.event.accelerate_on', 'When it speeds up', 'Когда разгоняется', 'Коли розганяється', '加速时'],
  ['ide.kit.p.b.event.accelerate_on.d', 'Runs when the vehicle starts to accelerate.', 'Срабатывает, когда техника начинает разгоняться.', 'Спрацьовує, коли техніка починає розганятися.', '载具开始加速时运行。'],
  w('b.event.accelerate_on'),

  ['ide.kit.p.b.event.accelerate_off', 'When it stops speeding up', 'Когда перестаёт разгоняться', 'Коли перестає розганятися', '停止加速时'],
  ['ide.kit.p.b.event.accelerate_off.d', 'Runs when the vehicle stops accelerating.', 'Срабатывает, когда техника перестаёт разгоняться.', 'Спрацьовує, коли техніка перестає розганятися.', '载具停止加速时运行。'],
  w('b.event.accelerate_off'),

  ['ide.kit.p.b.event.brake_on', 'When it brakes', 'Когда тормозит', 'Коли гальмує', '刹车时'],
  ['ide.kit.p.b.event.brake_on.d', 'Runs when the vehicle starts braking.', 'Срабатывает, когда техника начинает тормозить.', 'Спрацьовує, коли техніка починає гальмувати.', '载具开始刹车时运行。'],
  w('b.event.brake_on'),

  ['ide.kit.p.b.event.brake_off', 'When it stops braking', 'Когда перестаёт тормозить', 'Коли перестає гальмувати', '停止刹车时'],
  ['ide.kit.p.b.event.brake_off.d', 'Runs when the braking ends.', 'Срабатывает, когда торможение заканчивается.', 'Спрацьовує, коли гальмування закінчується.', '刹车结束时运行。'],
  w('b.event.brake_off'),

  ['ide.kit.p.b.event.engine_on', 'When the engine starts', 'Когда запускается двигатель', 'Коли запускається двигун', '发动机启动时'],
  ['ide.kit.p.b.event.engine_on.d', 'Runs when the engine is started.', 'Срабатывает, когда двигатель запускают.', 'Спрацьовує, коли двигун запускають.', '发动机被启动时运行。'],
  w('b.event.engine_on', [
    ' Planes take this event over with overload in their own block (airborne.inc:36). For a plane, your handler runs only when your block comes later than theirs.',
    ' Самолёты перехватывают это событие через overload в своём блоке (airborne.inc:36). У самолёта ваш обработчик сработает, только если ваш блок идёт позже их блока.',
    ' Літаки перехоплюють цю подію через overload у своєму блоці (airborne.inc:36). У літака ваш обробник спрацює, лише якщо ваш блок іде пізніше за їхній.',
    '飞机在自己的块中用 overload 接管了此事件（airborne.inc:36）。对飞机来说，只有当你的块排在它们的块之后，你的处理器才会运行。'
  ]),

  ['ide.kit.p.b.event.engine_off', 'When the engine stops', 'Когда двигатель выключается', 'Коли двигун вимикається', '发动机关闭时'],
  ['ide.kit.p.b.event.engine_off.d', 'Runs when the engine is switched off.', 'Срабатывает, когда двигатель выключают.', 'Спрацьовує, коли двигун вимикають.', '发动机被关闭时运行。'],
  w('b.event.engine_off'),

  ['ide.kit.p.b.event.swim_on', 'When it starts swimming', 'Когда начинает плыть', 'Коли починає плисти', '开始游泳时'],
  ['ide.kit.p.b.event.swim_on.d', 'Runs when the soldier starts swimming.', 'Срабатывает, когда солдат начинает плыть.', 'Спрацьовує, коли солдат починає плисти.', '士兵开始游泳时运行。'],
  w('b.event.swim_on'),

  ['ide.kit.p.b.event.swim_off', 'When it stops swimming', 'Когда перестаёт плыть', 'Коли перестає плисти', '停止游泳时'],
  ['ide.kit.p.b.event.swim_off.d', 'Runs each time the soldier takes any pose other than swimming: stand, crouch or lie. So it also runs when a dry soldier lies down or stands up.', 'Срабатывает каждый раз, когда солдат принимает любую позу, кроме плавания: стоя, присев или лёжа. Поэтому оно срабатывает и тогда, когда сухой солдат ложится или встаёт.', 'Спрацьовує щоразу, коли солдат набуває будь-якої пози, крім плавання: стоячи, присівши або лежачи. Тому вона спрацьовує і тоді, коли сухий солдат лягає або встає.', '士兵每次换成游泳以外的任何姿势（站、蹲、卧）时都会运行。所以不在水中的士兵卧倒或站起时也会运行。'],
  w('b.event.swim_off', [' Guard it with a flag that swim on sets.', ' Защитите его флагом, который ставит swim on.', ' Захистіть її прапорцем, який ставить swim on.', '请用一个在 swim on 中设置的标志来保护它。']),

  ['ide.kit.p.b.event.movement_mode_changed', 'When the walking mode changes', 'Когда меняется режим ходьбы', 'Коли змінюється режим ходьби', '行走模式改变时'],
  ['ide.kit.p.b.event.movement_mode_changed.d', 'Runs when the soldier\'s movement mode changes. name holds the new mode: slow, normal, fast, walk, bow, assault, spot, sneak or none. Vanilla tests name fast.', 'Срабатывает, когда меняется режим движения солдата. name содержит новый режим: slow, normal, fast, walk, bow, assault, spot, sneak или none. Оригинальная игра проверяет name fast.', 'Спрацьовує, коли змінюється режим руху солдата. name містить новий режим: slow, normal, fast, walk, bow, assault, spot, sneak або none. Оригінальна гра перевіряє name fast.', '士兵的移动模式改变时运行。name 是新模式：slow、normal、fast、walk、bow、assault、spot、sneak 或 none。原版游戏检查的是 name fast。'],
  w('b.event.movement_mode_changed', [
    ' Vanilla uses only fast. The other mode names are not tried yet. name is none while the soldier is not moving. It also runs when his pose changes, so the mode may be the same as before.',
    ' Оригинальная игра использует только fast. Остальные имена режимов ещё не проверены. Пока солдат не движется, name равно none. Событие срабатывает и при смене позы, поэтому режим может остаться прежним.',
    ' Оригінальна гра використовує лише fast. Інші назви режимів ще не перевірені. Поки солдат не рухається, name дорівнює none. Подія спрацьовує і при зміні пози, тому режим може лишитися тим самим.',
    '原版游戏只用到 fast。其他模式名称尚未试过。士兵没有移动时，name 为 none。姿势改变时也会运行，所以模式可能和之前一样。'
  ]),

  ['ide.kit.p.b.event.grounded_on', 'When a boat runs aground', 'Когда лодка садится на мель', 'Коли човен сідає на мілину', '船只搁浅时'],
  ['ide.kit.p.b.event.grounded_on.d', 'Runs when a boat touches the bottom.', 'Срабатывает, когда лодка касается дна.', 'Спрацьовує, коли човен торкається дна.', '船只触底时运行。'],
  w('b.event.grounded_on'),

  ['ide.kit.p.b.event.grounded_off', 'When a boat floats free', 'Когда лодка сходит с мели', 'Коли човен сходить з мілини', '船只脱浅时'],
  ['ide.kit.p.b.event.grounded_off.d', 'Runs when a boat leaves the bottom again.', 'Срабатывает, когда лодка снова отходит от дна.', 'Спрацьовує, коли човен знову відходить від дна.', '船只重新离开水底时运行。'],
  w('b.event.grounded_off'),

  ['ide.kit.p.b.event.terrain_fx_enter', 'When it steps onto a ground type', 'Когда заходит на тип грунта', 'Коли заходить на тип ґрунту', '踏上某种地面时'],
  ['ide.kit.p.b.event.terrain_fx_enter.d', 'Runs when a unit moves onto ground of this material, like puddle or mud. It also runs when the unit starts moving, or turns while moving, on that material. Units only, not plain objects.', 'Срабатывает, когда юнит заходит на грунт из этого материала, например puddle или mud. Срабатывает и тогда, когда юнит на этом материале начинает движение или поворачивает на ходу. Только для юнитов, не для простых объектов.', 'Спрацьовує, коли юніт заходить на ґрунт із цього матеріалу, наприклад puddle або mud. Спрацьовує і тоді, коли юніт на цьому матеріалі починає рух або повертає на ходу. Лише для юнітів, не для простих об\'єктів.', '单位走上这种材质的地面时运行，例如 puddle 或 mud。单位在这种材质上开始移动、或在行进中转向时也会运行。只对单位有效，普通物体不行。'],
  ['ide.kit.p.b.event.terrain_fx_enter.w'].concat(ONCE_GROUND),
  ['ide.kit.p.b.event.terrain_fx_enter.f.ground', 'Ground material', 'Материал грунта', 'Матеріал ґрунту', '地面材质'],
  ['ide.kit.p.b.event.terrain_fx_enter.f.ground.h', 'An entry name of terrains.set, like puddle, mud or grass, not its effect name.', 'Имя записи из terrains.set, например puddle, mud или grass, а не имя её эффекта.', 'Назва запису з terrains.set, наприклад puddle, mud або grass, а не назва його ефекту.', 'terrains.set 中条目的名称，例如 puddle、mud 或 grass，不是它的效果名。'],

  ['ide.kit.p.b.event.terrain_fx_leave', 'When it steps off a ground type', 'Когда сходит с типа грунта', 'Коли сходить з типу ґрунту', '离开某种地面时'],
  ['ide.kit.p.b.event.terrain_fx_leave.d', 'Runs when a unit moves off ground of this material. It also runs when the unit stops moving, or turns while standing, on that material. Units only.', 'Срабатывает, когда юнит сходит с грунта из этого материала. Срабатывает и тогда, когда юнит на этом материале останавливается или поворачивает стоя. Только для юнитов.', 'Спрацьовує, коли юніт сходить з ґрунту з цього матеріалу. Спрацьовує і тоді, коли юніт на цьому матеріалі зупиняється або повертає стоячи. Лише для юнітів.', '单位离开这种材质的地面时运行。单位在这种材质上停下、或原地转向时也会运行。只对单位有效。'],
  ['ide.kit.p.b.event.terrain_fx_leave.w'].concat(ONCE_GROUND),
  ['ide.kit.p.b.event.terrain_fx_leave.f.ground', 'Ground material', 'Материал грунта', 'Матеріал ґрунту', '地面材质'],
  ['ide.kit.p.b.event.terrain_fx_leave.f.ground.h', 'An entry name of terrains.set, like puddle, mud or grass, not its effect name.', 'Имя записи из terrains.set, например puddle, mud или grass, а не имя её эффекта.', 'Назва запису з terrains.set, наприклад puddle, mud або grass, а не назва його ефекту.', 'terrains.set 中条目的名称，例如 puddle、mud 或 grass，不是它的效果名。'],

  ['ide.kit.p.b.event.terrain_pp_enter', 'When it enters ground with a property', 'Когда заходит на грунт со свойством', 'Коли заходить на ґрунт із властивістю', '进入具有某属性的地面时'],
  ['ide.kit.p.b.event.terrain_pp_enter.d', 'Runs when a unit moves onto ground of this type, like swamp or deep_water. It also runs when the unit starts moving, or turns while moving, on it. Units only.', 'Срабатывает, когда юнит заходит на грунт этого типа, например swamp или deep_water. Срабатывает и тогда, когда юнит на нём начинает движение или поворачивает на ходу. Только для юнитов.', 'Спрацьовує, коли юніт заходить на ґрунт цього типу, наприклад swamp або deep_water. Спрацьовує і тоді, коли юніт на ньому починає рух або повертає на ходу. Лише для юнітів.', '单位走上这种类型的地面时运行，例如 swamp 或 deep_water。单位在其上开始移动、或在行进中转向时也会运行。只对单位有效。'],
  ['ide.kit.p.b.event.terrain_pp_enter.w',
    ONCE_TYPE[0] + ' Vanilla wraps the work here in delay 0, because its comment says a death without it crashes (human.inc:639).',
    ONCE_TYPE[1] + ' Оригинальная игра оборачивает работу здесь в delay 0, потому что, по её комментарию, смерть без него приводит к вылету (human.inc:639).',
    ONCE_TYPE[2] + ' Оригінальна гра обгортає роботу тут у delay 0, бо, за її коментарем, смерть без нього призводить до вильоту (human.inc:639).',
    ONCE_TYPE[3] + '原版游戏在这里把操作包在 delay 0 中，因为它的注释说没有它时死亡会导致崩溃（human.inc:639）。'],
  ['ide.kit.p.b.event.terrain_pp_enter.f.prop', 'Ground type', 'Тип грунта', 'Тип ґрунту', '地面类型'],
  ['ide.kit.p.b.event.terrain_pp_enter.f.prop.h', 'One of the game\'s ground types, like swamp, road or deep_water.', 'Один из типов грунта игры, например swamp, road или deep_water.', 'Один із типів ґрунту гри, наприклад swamp, road або deep_water.', '游戏的地面类型之一，例如 swamp、road 或 deep_water。'],

  ['ide.kit.p.b.event.terrain_pp_leave', 'When it leaves ground with a property', 'Когда сходит с грунта со свойством', 'Коли сходить з ґрунту з властивістю', '离开具有某属性的地面时'],
  ['ide.kit.p.b.event.terrain_pp_leave.d', 'Runs when a unit moves off ground of this type. It also runs when the unit stops moving, or turns while standing, on it. Units only.', 'Срабатывает, когда юнит сходит с грунта этого типа. Срабатывает и тогда, когда юнит на нём останавливается или поворачивает стоя. Только для юнитов.', 'Спрацьовує, коли юніт сходить з ґрунту цього типу. Спрацьовує і тоді, коли юніт на ньому зупиняється або повертає стоячи. Лише для юнітів.', '单位离开这种类型的地面时运行。单位在其上停下、或原地转向时也会运行。只对单位有效。'],
  ['ide.kit.p.b.event.terrain_pp_leave.w'].concat(ONCE_TYPE),
  ['ide.kit.p.b.event.terrain_pp_leave.f.prop', 'Ground type', 'Тип грунта', 'Тип ґрунту', '地面类型'],
  ['ide.kit.p.b.event.terrain_pp_leave.f.prop.h', 'One of the game\'s ground types, like swamp, road or deep_water.', 'Один из типов грунта игры, например swamp, road или deep_water.', 'Один із типів ґрунту гри, наприклад swamp, road або deep_water.', '游戏的地面类型之一，例如 swamp、road 或 deep_water。'],

  ['ide.kit.p.b.event.landing', 'When a plane lands', 'Когда самолёт садится', 'Коли літак сідає', '飞机降落时'],
  ['ide.kit.p.b.event.landing.d', 'Runs when a flying aircraft starts coming down to land, not when its wheels touch. Vanilla lowers the wheels here (airborne.inc:32-35).', 'Срабатывает, когда летящий самолёт начинает снижаться для посадки, а не когда касается колёсами земли. Оригинальная игра выпускает здесь шасси (airborne.inc:32-35).', 'Спрацьовує, коли літак у польоті починає знижуватися для посадки, а не коли торкається колесами землі. Оригінальна гра випускає тут шасі (airborne.inc:32-35).', '飞行中的飞机开始下降准备着陆时运行，而不是机轮触地时。原版游戏在这里放下起落架（airborne.inc:32-35）。'],
  w('b.event.landing'),

  ['ide.kit.p.b.event.takeoff', 'When a plane takes off', 'Когда самолёт взлетает', 'Коли літак злітає', '飞机起飞时'],
  ['ide.kit.p.b.event.takeoff.d', 'Runs one second after an aircraft is sent up into flight, also when a landing plane climbs again. It is not tied to the wheels leaving the ground. Vanilla raises the wheels here (airborne.inc:23-28).', 'Срабатывает через одну секунду после того, как самолёт отправлен в полёт, и также когда садящийся самолёт снова набирает высоту. Оно не связано с отрывом колёс от земли. Оригинальная игра убирает здесь шасси (airborne.inc:23-28).', 'Спрацьовує через одну секунду після того, як літак відправлено в політ, а також коли літак, що сідає, знову набирає висоту. Вона не пов\'язана з відривом коліс від землі. Оригінальна гра прибирає тут шасі (airborne.inc:23-28).', '飞机被派去升空一秒后运行，正在降落的飞机重新爬升时也会运行。它与机轮离地无关。原版游戏在这里收起起落架（airborne.inc:23-28）。'],
  w('b.event.takeoff', [' A plane loaded in the air gets takeoff_load instead (airborne.inc:29).', ' Самолёт, загруженный уже в воздухе, получает вместо него takeoff_load (airborne.inc:29).', ' Літак, завантажений уже в повітрі, отримує замість неї takeoff_load (airborne.inc:29).', '在空中载入的飞机收到的是 takeoff_load（airborne.inc:29）。']),

  ['ide.kit.p.b.event.fire', 'When a weapon fires', 'Когда оружие стреляет', 'Коли зброя стріляє', '武器开火时'],
  ['ide.kit.p.b.event.fire.d', 'Runs each time the weapon at this place fires. The usual place for muzzle flash, recoil and shell eject.', 'Срабатывает при каждом выстреле оружия на этом месте. Обычное место для дульной вспышки, отдачи и выброса гильзы.', 'Спрацьовує при кожному пострілі зброї на цьому місці. Звичайне місце для дульного спалаху, віддачі та викиду гільзи.', '此位置的武器每次开火时运行。通常在这里做枪口焰、后坐和抛壳。'],
  ['ide.kit.p.b.event.fire.w',
    'This event may stand only once per place name in a block. A second handler for the same place is a fatal error: event already defined. A wrong place name never fires and gives no error.',
    'В одном блоке это событие может быть только один раз для каждого имени места. Второй обработчик для того же места даёт фатальную ошибку event already defined. Неверное имя места никогда не срабатывает и не даёт ошибки.',
    'В одному блоці ця подія може бути лише один раз для кожної назви місця. Другий обробник для того самого місця дає фатальну помилку event already defined. Хибна назва місця ніколи не спрацьовує і не дає помилки.',
    '同一个块中，每个位置名称只能有一次此事件。同一位置的第二个处理器是致命错误：event already defined。错误的位置名称永远不会触发，也不报错。'],
  ['ide.kit.p.b.event.fire.f.place.h', 'A weapon place of this unit, like gun.', 'Место оружия этого юнита, например gun.', 'Місце зброї цього юніта, наприклад gun.', '此单位的武器位置，例如 gun。'],

  ['ide.kit.p.b.event.operatable_on', 'When it gets a working crew', 'Когда получает рабочий расчёт', 'Коли отримує робочий розрахунок', '获得可用乘员时'],
  ['ide.kit.p.b.event.operatable_on.d', 'Runs when the unit becomes able to act, for example when a gun or vehicle gets crew in its places.', 'Срабатывает, когда юнит становится способен действовать, например когда у орудия или техники появляется экипаж на местах.', 'Спрацьовує, коли юніт стає здатним діяти, наприклад коли в гармати чи техніки з\'являється екіпаж на місцях.', '单位变得能够行动时运行，例如火炮或载具的位置上有了乘员。'],
  w('b.event.operatable_on', [' Vanilla leaves this handler empty with the note handled in extender (cannon.inc:528).', ' Оригинальная игра оставляет этот обработчик пустым с пометкой handled in extender (cannon.inc:528).', ' Оригінальна гра залишає цей обробник порожнім з поміткою handled in extender (cannon.inc:528).', '原版游戏让这个处理器保持为空，并注明 handled in extender（cannon.inc:528）。']),

  ['ide.kit.p.b.event.operatable_off', 'When it loses its crew', 'Когда теряет расчёт', 'Коли втрачає розрахунок', '失去乘员时'],
  ['ide.kit.p.b.event.operatable_off.d', 'Runs when the unit can no longer act, for example when it loses its crew, dies or is knocked out.', 'Срабатывает, когда юнит больше не может действовать, например когда он теряет экипаж, гибнет или теряет сознание.', 'Спрацьовує, коли юніт більше не може діяти, наприклад коли він втрачає екіпаж, гине або втрачає свідомість.', '单位无法再行动时运行，例如失去乘员、死亡或昏迷时。'],
  w('b.event.operatable_off'),

  ['ide.kit.p.b.event.crew_in', 'When crew gets in', 'Когда садится экипаж', 'Коли сідає екіпаж', '乘员进入时'],
  ['ide.kit.p.b.event.crew_in.d', 'Runs on the vehicle, gun or other host each time a soldier takes one of its places, also when he only swaps seats. The soldier is not passed, so effector tests are false here. Places marked attach in the unit\'s data do not send it.', 'Срабатывает на технике, орудии или другом носителе каждый раз, когда солдат занимает одно из его мест, даже если он только пересаживается. Солдат не передаётся, поэтому проверки effector здесь ложны. Места с пометкой attach в данных юнита его не посылают.', 'Спрацьовує на техніці, гарматі чи іншому носії щоразу, коли солдат займає одне з його місць, навіть якщо він лише пересідає. Солдат не передається, тому перевірки effector тут хибні. Місця з позначкою attach у даних юніта її не надсилають.', '每当有士兵占据载具、火炮或其他载体的一个位置时，在载体上运行，只换座位也算。士兵不会被传入，所以这里的 effector 检查都为假。单位数据中标记为 attach 的位置不会发送它。'],
  w('b.event.crew_in'),

  ['ide.kit.p.b.event.crew_out', 'When crew gets out', 'Когда экипаж выходит', 'Коли екіпаж виходить', '乘员离开时'],
  ['ide.kit.p.b.event.crew_out.d', 'Runs on the vehicle, gun or other host each time a soldier leaves one of its places, also when he only swaps seats. The soldier is not passed, so effector tests are false here. Places marked attach in the unit\'s data do not send it.', 'Срабатывает на технике, орудии или другом носителе каждый раз, когда солдат покидает одно из его мест, даже если он только пересаживается. Солдат не передаётся, поэтому проверки effector здесь ложны. Места с пометкой attach в данных юнита его не посылают.', 'Спрацьовує на техніці, гарматі чи іншому носії щоразу, коли солдат залишає одне з його місць, навіть якщо він лише пересідає. Солдат не передається, тому перевірки effector тут хибні. Місця з позначкою attach у даних юніта її не надсилають.', '每当有士兵离开载具、火炮或其他载体的一个位置时，在载体上运行，只换座位也算。士兵不会被传入，所以这里的 effector 检查都为假。单位数据中标记为 attach 的位置不会发送它。'],
  w('b.event.crew_out'),

  ['ide.kit.p.b.event.board_in', 'When it boards a vehicle', 'Когда садится в технику', 'Коли сідає в техніку', '登上载具时'],
  ['ide.kit.p.b.event.board_in.d', 'Runs when the soldier gets into a vehicle or boat.', 'Срабатывает, когда солдат садится в технику или лодку.', 'Спрацьовує, коли солдат сідає в техніку або човен.', '士兵进入载具或船只时运行。'],
  w('b.event.board_in'),

  ['ide.kit.p.b.event.board_out', 'When it leaves a vehicle', 'Когда выходит из техники', 'Коли виходить з техніки', '离开载具时'],
  ['ide.kit.p.b.event.board_out.d', 'Runs when the soldier walks out through a door. effector is the vehicle he leaves and name is the exit bone, like emit1 (human.inc:725-726 tests both).', 'Срабатывает, когда солдат выходит через дверь. effector это техника, которую он покидает, а name это кость выхода, например emit1 (human.inc:725-726 проверяет оба).', 'Спрацьовує, коли солдат виходить через двері. effector це техніка, яку він залишає, а name це кістка виходу, наприклад emit1 (human.inc:725-726 перевіряє обидва).', '士兵从门走出时运行。effector 是他离开的载具，name 是出口骨骼，例如 emit1（human.inc:725-726 两者都检查）。'],
  w('b.event.board_out'),

  ['ide.kit.p.b.event.blow', 'When a melee strike lands', 'Когда удар в ближнем бою попадает', 'Коли удар у ближньому бою влучає', '近战命中时'],
  ['ide.kit.p.b.event.blow.d', 'Runs on the striker when his melee strike lands. effector is the one he hit, and name is knife when he holds a knife or head for a head blow. Vanilla plays a punch sound here unless it is a knife.', 'Срабатывает на атакующем, когда его удар в ближнем бою попадает. effector это тот, кого он ударил, а name равно knife, если у него нож, или head при ударе головой. Оригинальная игра играет здесь звук удара, если это не нож.', 'Спрацьовує на тому, хто б\'є, коли його удар у ближньому бою влучає. effector це той, кого він ударив, а name дорівнює knife, якщо в нього ніж, або head при ударі головою. Оригінальна гра грає тут звук удару, якщо це не ніж.', '近战攻击命中时在攻击者身上运行。effector 是被他击中的人；拿着刀时 name 为 knife，头部攻击时为 head。原版游戏在这里播放击打声，刀除外。'],
  w('b.event.blow', [' The one who is hit gets blow opponent.', ' Тот, кого ударили, получает blow opponent.', ' Той, кого вдарили, отримує blow opponent.', '被击中的一方收到的是 blow opponent。']),

  ['ide.kit.p.b.event.blow_opponent', 'When struck by an enemy in melee', 'Когда враг бьёт в ближнем бою', 'Коли ворог б\'є в ближньому бою', '被敌人近战击中时'],
  ['ide.kit.p.b.event.blow_opponent.d', 'Runs on the one hit by a melee strike, after the striker\'s blow. effector is the striker, value is the damage, and name is knife or head as in blow. Vanilla applies health_damage_blow here.', 'Срабатывает на том, по кому попал удар в ближнем бою, после blow атакующего. effector это атакующий, value это урон, а name равно knife или head, как в blow. Оригинальная игра применяет здесь health_damage_blow.', 'Спрацьовує на тому, в кого влучив удар у ближньому бою, після blow нападника. effector це нападник, value це шкода, а name дорівнює knife або head, як у blow. Оригінальна гра застосовує тут health_damage_blow.', '在被近战击中的一方身上运行，在攻击者的 blow 之后。effector 是攻击者，value 是伤害，name 和 blow 中一样为 knife 或 head。原版游戏在这里使用 health_damage_blow。'],
  w('b.event.blow_opponent'),

  ['ide.kit.p.b.event.link_weapon', 'When a weapon is linked', 'Когда подключается оружие', 'Коли під\'єднується зброя', '武器挂接时'],
  ['ide.kit.p.b.event.link_weapon.d', 'Runs each time a weapon\'s model is put in place on the unit: a soldier taking a weapon into his hands, or a vehicle or gun getting its weapon. stuff is the weapon (vanilla tests stuff pistol) and name is the weapon place. Not sent when the place has no link bone.', 'Срабатывает каждый раз, когда модель оружия ставится на место на юните: солдат берёт оружие в руки, или техника или орудие получает своё оружие. stuff это оружие (оригинальная игра проверяет stuff pistol), а name это место оружия. Не приходит, если у места нет кости привязки.', 'Спрацьовує щоразу, коли модель зброї ставиться на місце на юніті: солдат бере зброю в руки, або техніка чи гармата отримує свою зброю. stuff це зброя (оригінальна гра перевіряє stuff pistol), а name це місце зброї. Не надходить, якщо місце не має кістки прив\'язки.', '每次武器模型被放到单位上时运行：士兵把武器拿到手中，或载具、火炮装上它的武器。stuff 是武器（原版游戏检查 stuff pistol），name 是武器位置。位置没有挂接骨骼时不会发送。'],
  w('b.event.link_weapon'),

  ['ide.kit.p.b.event.repair_work', 'When repair work starts or stops', 'Когда ремонт начинается или кончается', 'Коли ремонт починається або закінчується', '维修开始或停止时'],
  ['ide.kit.p.b.event.repair_work.d', 'Runs on a soldier of the player\'s side when he starts repairing or building a fortification (start_repair), and when that work stops (stop_repair). AI units never get it. Vanilla shows and hides a marker.', 'Срабатывает на солдате стороны игрока, когда он начинает ремонт или строительство укрепления (start_repair), и когда эта работа прекращается (stop_repair). Юниты ИИ его никогда не получают. Оригинальная игра показывает и прячет значок.', 'Спрацьовує на солдаті сторони гравця, коли він починає ремонт або будівництво укріплення (start_repair), і коли ця робота припиняється (stop_repair). Юніти ШІ її ніколи не отримують. Оригінальна гра показує і ховає значок.', '玩家一方的士兵开始维修或修建工事时（start_repair），以及这项工作停止时（stop_repair），在他身上运行。AI 单位永远收不到。原版游戏会显示和隐藏一个标记。'],
  ['ide.kit.p.b.event.repair_work.w',
    'Each of the two names may stand only once in a block. A second handler for the same name is a fatal error: event already defined.',
    'Каждое из двух имён может быть в блоке только один раз. Второй обработчик для того же имени даёт фатальную ошибку event already defined.',
    'Кожна з двох назв може бути в блоці лише один раз. Другий обробник для тієї самої назви дає фатальну помилку event already defined.',
    '两个名称在同一个块中各只能出现一次。同一名称的第二个处理器是致命错误：event already defined。'],
  ['ide.kit.p.b.event.repair_work.f.which', 'Start or stop', 'Начало или конец', 'Початок чи кінець', '开始或停止'],
  ['ide.kit.p.b.event.repair_work.f.which.h', 'start_repair when the work starts, stop_repair when it stops.', 'start_repair, когда работа начинается, stop_repair, когда она прекращается.', 'start_repair, коли робота починається, stop_repair, коли вона припиняється.', '工作开始时用 start_repair，停止时用 stop_repair。'],

  ['ide.kit.p.b.event.start_healing', 'When healing starts', 'Когда начинается лечение', 'Коли починається лікування', '开始治疗时'],
  ['ide.kit.p.b.event.start_healing.d', 'Runs on a soldier of the player\'s side who bandages himself, once his health starts to go up. A medic healing someone else does not send it. AI units never get it.', 'Срабатывает на солдате стороны игрока, который перевязывает себя, когда его здоровье начинает расти. Медик, лечащий другого, его не посылает. Юниты ИИ его никогда не получают.', 'Спрацьовує на солдаті сторони гравця, який перев\'язує себе, коли його здоров\'я починає зростати. Медик, що лікує іншого, її не надсилає. Юніти ШІ її ніколи не отримують.', '玩家一方的士兵给自己包扎、生命值开始上升时，在他身上运行。医护兵治疗别人时不会发送。AI 单位永远收不到。'],
  w('b.event.start_healing'),

  ['ide.kit.p.b.event.stop_healing', 'When healing stops', 'Когда лечение заканчивается', 'Коли лікування закінчується', '停止治疗时'],
  ['ide.kit.p.b.event.stop_healing.d', 'Runs when a soldier\'s bandage order stops, finished or broken off.', 'Срабатывает, когда приказ солдата на перевязку прекращается, выполнен он или прерван.', 'Спрацьовує, коли наказ солдата на перев\'язку припиняється, виконаний він чи перерваний.', '士兵的包扎命令停止时运行，无论是完成还是被中断。'],
  w('b.event.stop_healing', [' It also comes when start_healing never did: for AI units, or when no bandage was found.', ' Оно приходит и тогда, когда start_healing не было: у юнитов ИИ или если бинт не нашёлся.', ' Вона надходить і тоді, коли start_healing не було: у юнітів ШІ або якщо бинт не знайшовся.', '即使从未收到 start_healing 也会收到它：AI 单位，或者没有找到绷带时。']),

  ['ide.kit.p.b.event.smoking', 'When a soldier smokes', 'Когда солдат курит', 'Коли солдат курить', '士兵抽烟时'],
  ['ide.kit.p.b.event.smoking.d', 'Runs on each puff while an idle standing soldier smokes, several times per smoke break. Vanilla shows a short smoke puff each time (human.inc:566-573).', 'Срабатывает на каждую затяжку, пока стоящий без дела солдат курит, несколько раз за перекур. Оригинальная игра каждый раз показывает короткий клуб дыма (human.inc:566-573).', 'Спрацьовує на кожну затяжку, поки солдат, що стоїть без діла, курить, кілька разів за перекур. Оригінальна гра щоразу показує короткий клуб диму (human.inc:566-573).', '空闲站立的士兵抽烟时，每吸一口运行一次，每次抽烟休息会运行多次。原版游戏每次显示一小股烟（human.inc:566-573）。'],
  w('b.event.smoking'),

  ['ide.kit.p.b.event.in_hole', 'When a grenade goes into a window', 'Когда граната влетает в окно', 'Коли граната влітає у вікно', '手雷进入窗户时'],
  ['ide.kit.p.b.event.in_hole.d', 'Runs on a thrown grenade, or any other object, when it enters a hole or window of another object. effector is the object with the hole.', 'Срабатывает на брошенной гранате или любом другом предмете, когда он попадает в проём или окно другого объекта. effector это объект с проёмом.', 'Спрацьовує на кинутій гранаті чи будь-якому іншому предметі, коли він потрапляє в отвір або вікно іншого об\'єкта. effector це об\'єкт з отвором.', '投出的手雷或其他任何物体进入另一物体的洞口或窗户时，在它身上运行。effector 是有洞口的那个物体。'],
  w('b.event.in_hole')
];

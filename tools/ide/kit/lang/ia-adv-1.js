// Code Pieces, group ia-adv-1: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/ia-adv-1.js.
// Author: Imperator_Aug (ARSENAL, ia-d9ad8580)
'use strict';

var ONCE = [
  "This event may stand only once in a block. A second handler for it in the same block is a fatal error: event already defined.",
  "В одном блоке это событие может быть только один раз. Второй обработчик в том же блоке даёт фатальную ошибку event already defined.",
  "В одному блоці ця подія може бути лише один раз. Другий обробник у тому самому блоці дає фатальну помилку event already defined.",
  "同一个块中此事件只能出现一次。同一块中的第二个处理器是致命错误：event already defined。"
];
function once(id) {
  return ['ide.kit.p.' + id + '.w', ONCE[0], ONCE[1], ONCE[2], ONCE[3]];
}
var UNUSED = [
  "Never used in the game's own files.",
  "Ни разу не используется в файлах самой игры.",
  "Жодного разу не використовується у файлах самої гри.",
  "游戏自带文件中从未使用过。"
];

module.exports = [
  // b.event.engine_named
  ["ide.kit.p.b.event.engine_named", "More events the game sends",
    "Другие события, которые шлёт игра",
    "Інші події, які надсилає гра",
    "游戏发出的更多事件"],
  ["ide.kit.p.b.event.engine_named.d", "Catches one of the other names the game fires by itself, such as start_ammo_out when a player's unit runs out of ammo. The game's own human.inc answers many of them.",
    "Ловит одно из других имён, которые игра вызывает сама, например start_ammo_out, когда у юнита игрока кончаются патроны. Файл самой игры human.inc отвечает на многие из них.",
    "Ловить одну з інших назв, які гра викликає сама, наприклад start_ammo_out, коли в юніта гравця закінчуються набої. Файл самої гри human.inc відповідає на багато з них.",
    "捕获游戏自己触发的其他名称之一，例如玩家单位弹药耗尽时的 start_ammo_out。游戏自带的 human.inc 响应了其中许多名称。"],
  ["ide.kit.p.b.event.engine_named.w", "When each name fires has not been tried in game, and the list may not be complete. Each name may stand only once in a block. A second handler for the same name is a fatal error: event already defined.",
    "Когда срабатывает каждое имя, в игре не проверялось, и список может быть неполным. Каждое имя может быть в блоке только один раз. Второй обработчик для того же имени даёт фатальную ошибку event already defined.",
    "Коли спрацьовує кожна назва, у грі не перевірялося, і список може бути неповним. Кожна назва може бути в блоці лише один раз. Другий обробник для тієї самої назви дає фатальну помилку event already defined.",
    "每个名称何时触发尚未在游戏中试过，列表也可能不完整。每个名称在同一个块中只能出现一次。同一名称的第二个处理器是致命错误：event already defined。"],
  ["ide.kit.p.b.event.engine_named.f.name", "Event name", "Имя события", "Ім'я події", "事件名称"],

  // b.event.slice_load
  ["ide.kit.p.b.event.slice_load", "When a torn-off piece loads",
    "Когда загружается оторванная часть",
    "Коли завантажується відірвана частина",
    "被撕下的碎块载入时"],
  ["ide.kit.p.b.event.slice_load.d", "Runs after a saved game loads, once for each piece torn off with an id. A name check tests that id, and with_effector reaches the piece. Vanilla tests the name car_part (car.inc:220).",
    "Срабатывает после загрузки сохранения, по разу на каждую часть, оторванную с id. Проверка name сверяет этот id, а with_effector обращается к самой части. Оригинальная игра проверяет имя car_part (car.inc:220).",
    "Спрацьовує після завантаження збереження, по разу на кожну частину, відірвану з id. Перевірка name звіряє цей id, а with_effector звертається до самої частини. Оригінальна гра перевіряє назву car_part (car.inc:220).",
    "读取存档后运行，每个带 id 撕下的碎块各运行一次。name 检查比对该 id，with_effector 指向该碎块。原版游戏检查名称 car_part（car.inc:220）。"],
  once('b.event.slice_load'),

  // b.event.takeoff_load
  ["ide.kit.p.b.event.takeoff_load", "When a plane starts the map already flying",
    "Когда самолёт начинает карту уже в воздухе",
    "Коли літак починає мапу вже в повітрі",
    "飞机载入时已在飞行"],
  ["ide.kit.p.b.event.takeoff_load.d", "Runs when a plane is loaded from a save or a map that stored it not parked: flying, rolling for takeoff, or landing. Vanilla puts the wheels up at once (airborne.inc:29-31).",
    "Срабатывает, когда самолёт загружается из сохранения или карты, где он записан не на стоянке: в полёте, на разбеге или при посадке. Оригинальная игра сразу убирает шасси (airborne.inc:29-31).",
    "Спрацьовує, коли літак завантажується зі збереження або мапи, де його записано не на стоянці: у польоті, на розбігу або під час посадки. Оригінальна гра одразу прибирає шасі (airborne.inc:29-31).",
    "当飞机从存档或地图载入、且记录的状态不是停放时运行：飞行中、起飞滑跑中或降落中。原版游戏会立刻收起起落架（airborne.inc:29-31）。"],
  once('b.event.takeoff_load'),

  // b.event.pour_over
  ["ide.kit.p.b.event.pour_over", "When something is poured on it",
    "Когда на него что-то выливают",
    "Коли на нього щось виливають",
    "有东西倒在它上面时"],
  ["ide.kit.p.b.event.pour_over.d", "Runs when a liquid is poured on the object. A name check tests which liquid; vanilla tests fuel (dummy.inc:454).",
    "Срабатывает, когда на объект выливают жидкость. Проверка name сверяет, какую именно; оригинальная игра проверяет fuel (dummy.inc:454).",
    "Спрацьовує, коли на об'єкт виливають рідину. Перевірка name звіряє, яку саме; оригінальна гра перевіряє fuel (dummy.inc:454).",
    "当液体倒在该物体上时运行。用 name 检查是哪种液体；原版游戏检查 fuel（dummy.inc:454）。"],
  once('b.event.pour_over'),

  // b.event.plant
  ["ide.kit.p.b.event.plant", "When it is planted",
    "Когда его сажают",
    "Коли його садять",
    "被种下时"],
  ["ide.kit.p.b.event.plant.d", "Runs when a plant is placed. Vanilla grows it in with scale (flora.inc:160).",
    "Срабатывает, когда растение размещают. Оригинальная игра выращивает его через scale (flora.inc:160).",
    "Спрацьовує, коли рослину розміщують. Оригінальна гра вирощує її через scale (flora.inc:160).",
    "放置植物时运行。原版游戏用 scale 让它逐渐长大（flora.inc:160）。"],
  once('b.event.plant'),

  // b.event.diving
  ["ide.kit.p.b.event.diving", "When a soldier dives in",
    "Когда боец прыгает в воду",
    "Коли боєць стрибає у воду",
    "士兵跳入水中时"],
  ["ide.kit.p.b.event.diving.d", "Runs when a soldier jumps into water. Vanilla adds a splash after a short delay (human.inc:649-652).",
    "Срабатывает, когда боец прыгает в воду. Оригинальная игра после короткой задержки добавляет всплеск (human.inc:649-652).",
    "Спрацьовує, коли боєць стрибає у воду. Оригінальна гра після короткої затримки додає сплеск (human.inc:649-652).",
    "士兵跳入水中时运行。原版游戏在短暂延迟后添加水花（human.inc:649-652）。"],
  once('b.event.diving'),

  // b.if.simulating
  ["ide.kit.p.b.if.simulating", "If it is moving under physics",
    "Если его движет физика",
    "Якщо його рухає фізика",
    "如果它正受物理模拟移动"],
  ["ide.kit.p.b.if.simulating.d", "True while this object is being simulated by physics. Vanilla uses it after a blast pushes a gun (cannon.inc:116). The exact meaning is not confirmed.",
    "Истинно, пока этот объект просчитывается физикой. Оригинальная игра использует проверку после того, как взрыв толкнул орудие (cannon.inc:116). Точный смысл не подтверждён.",
    "Істинно, поки цей об'єкт прораховується фізикою. Оригінальна гра використовує перевірку після того, як вибух штовхнув гармату (cannon.inc:116). Точний зміст не підтверджено.",
    "当该物体正在进行物理模拟时为真。原版游戏在爆炸推动火炮后使用它（cannon.inc:116）。确切含义尚未确认。"],

  // b.if.terrain_pp
  ["ide.kit.p.b.if.terrain_pp", "If the ground under it is this type",
    "Если грунт под ним этого типа",
    "Якщо ґрунт під ним цього типу",
    "如果脚下地面是这种类型"],
  ["ide.kit.p.b.if.terrain_pp.d", "True when the ground type at the unit's position has this name. The names are the pathfinding ground types, and a map cannot add more.",
    "Истинно, когда тип грунта в точке юнита носит это имя. Имена берутся из типов грунта для поиска пути, и карта не может добавить новые.",
    "Істинно, коли тип ґрунту в точці юніта має цю назву. Назви беруться з типів ґрунту для пошуку шляху, і мапа не може додати нові.",
    "当单位所在位置的地面类型为此名称时为真。这些名称是寻路用的地面类型，地图不能新增。"],
  ["ide.kit.p.b.if.terrain_pp.w", UNUSED[0] + " The same names work in the event form terrain_pp enter (human.inc:638).",
    UNUSED[1] + " Те же имена работают в форме события terrain_pp enter (human.inc:638).",
    UNUSED[2] + " Ті самі назви працюють у формі події terrain_pp enter (human.inc:638).",
    UNUSED[3] + "同样的名称可用于事件形式 terrain_pp enter（human.inc:638）。"],
  ["ide.kit.p.b.if.terrain_pp.f.prop", "Ground type", "Тип грунта", "Тип ґрунту", "地面类型"],

  // b.if.direction
  ["ide.kit.p.b.if.direction", "If moving or turning this way",
    "Если едет или поворачивает в эту сторону",
    "Якщо їде або повертає в цей бік",
    "如果朝这个方向移动或转向"],
  ["ide.kit.p.b.if.direction.d", "True when the value of the move or turn event has this sign: forward or backward for move, left or right for turn.",
    "Истинно, когда значение события move или turn имеет этот знак: вперёд или назад для move, влево или вправо для turn.",
    "Істинно, коли значення події move або turn має цей знак: уперед чи назад для move, ліворуч чи праворуч для turn.",
    "当 move 或 turn 事件的值为此符号时为真：move 为前进或后退，turn 为左转或右转。"],
  ["ide.kit.p.b.if.direction.w", "The event value is only a sign, plus or minus one. " + UNUSED[0],
    "Значение события это только знак, плюс или минус единица. " + UNUSED[1],
    "Значення події це лише знак, плюс чи мінус одиниця. " + UNUSED[2],
    "事件的值只是一个符号，正一或负一。" + UNUSED[3]],
  ["ide.kit.p.b.if.direction.n", "A move or turn event around it.",
    "Событие move или turn вокруг проверки.",
    "Подія move або turn навколо перевірки.",
    "外层需要 move 或 turn 事件。"],
  ["ide.kit.p.b.if.direction.f.way", "Direction", "Направление", "Напрямок", "方向"],

  // b.if.always
  ["ide.kit.p.b.if.always", "Always or never",
    "Всегда или никогда",
    "Завжди або ніколи",
    "总是或从不"],
  ["ide.kit.p.b.if.always.d", "A fixed check: true always passes, false never does. Handy to switch a branch off while testing.",
    "Постоянная проверка: true проходит всегда, false никогда. Удобно, чтобы выключить ветку на время проверки.",
    "Постійна перевірка: true проходить завжди, false ніколи. Зручно, щоб вимкнути гілку на час перевірки.",
    "固定的检查：true 总是通过，false 从不通过。测试时可用来关闭某个分支。"],
  ["ide.kit.p.b.if.always.w", UNUSED[0], UNUSED[1], UNUSED[2], UNUSED[3]],
  ["ide.kit.p.b.if.always.f.value", "Result", "Результат", "Результат", "结果"],

  // b.if.actor_state
  ["ide.kit.p.b.if.actor_state", "If it is in the player's squad",
    "Если он в отряде игрока",
    "Якщо він у загоні гравця",
    "如果它在玩家的小队中"],
  ["ide.kit.p.b.if.actor_state.d", "True when the unit is under player control and belongs to a squad.",
    "Истинно, когда юнит под управлением игрока и входит в отряд.",
    "Істинно, коли юніт під керуванням гравця і входить до загону.",
    "当单位由玩家控制且属于某个小队时为真。"],
  ["ide.kit.p.b.if.actor_state.w", UNUSED[0] + " The units of every human player likely count, not only yours. Not tried in a network game.",
    UNUSED[1] + " Вероятно, считаются юниты каждого игрока-человека, а не только ваши. Не проверено в сетевой игре.",
    UNUSED[2] + " Імовірно, рахуються юніти кожного гравця-людини, а не лише ваші. Не перевірено в мережевій грі.",
    UNUSED[3] + "很可能每个真人玩家的单位都算，不只是你的。未在联网游戏中试过。"],

  // n.if.inactive
  ["ide.kit.p.n.if.inactive", "If it is paused (inactive)",
    "Если он приостановлен (inactive)",
    "Якщо його призупинено (inactive)",
    "如果它处于暂停（inactive）"],
  ["ide.kit.p.n.if.inactive.d", "True when the unit's inactive switch is on. The inactive action with 1 sets it. The game also sets it for a soldier riding hidden inside a vehicle and for units on an inactive host. For objects that are not units it is always false.",
    "Истинно, когда у юнита включён переключатель inactive. Его ставит действие inactive со значением 1. Игра также ставит его бойцу, который едет скрытым внутри машины, и юнитам на неактивном носителе. Для объектов, которые не юниты, всегда ложно.",
    "Істинно, коли в юніта ввімкнено перемикач inactive. Його ставить дія inactive зі значенням 1. Гра також ставить його бійцеві, що їде прихованим усередині машини, і юнітам на неактивному носії. Для об'єктів, які не є юнітами, завжди хибно.",
    "当单位的 inactive 开关打开时为真。值为 1 的 inactive 动作会打开它。游戏也会为隐藏乘坐在载具内的士兵以及位于非活动宿主上的单位打开它。对不是单位的物体始终为假。"],
  ["ide.kit.p.n.if.inactive.w", UNUSED[0], UNUSED[1], UNUSED[2], UNUSED[3]],

  // b.if.has_place
  ["ide.kit.p.b.if.has_place", "If it has this seat",
    "Если у него есть это место",
    "Якщо в нього є це місце",
    "如果它有这个座位"],
  ["ide.kit.p.b.if.has_place.d", "True when the vehicle has a seat with this role at all.",
    "Истинно, когда у машины вообще есть место с этой ролью.",
    "Істинно, коли в машини взагалі є місце з цією роллю.",
    "当载具本身有这种角色的座位时为真。"],
  ["ide.kit.p.b.if.has_place.w", UNUSED[0], UNUSED[1], UNUSED[2], UNUSED[3]],
  ["ide.kit.p.b.if.has_place.f.role", "Seat role", "Роль места", "Роль місця", "座位角色"],

  // b.if.volume_bone_level
  ["ide.kit.p.b.if.volume_bone_level", "If the hit part is deep in the model",
    "Если поражённая часть глубоко в модели",
    "Якщо уражена частина глибоко в моделі",
    "如果被击中的部位在模型深处"],
  ["ide.kit.p.b.if.volume_bone_level.d", "True when the bone of the hit volume is at least this many levels down the model tree. Vanilla uses it in ground_hit to tear off deep parts of a plane (airborne.inc:323).",
    "Истинно, когда кость поражённого volume находится не меньше чем на столько уровней вниз по дереву модели. Оригинальная игра использует проверку в ground_hit, чтобы отрывать глубокие части самолёта (airborne.inc:323).",
    "Істинно, коли кістка ураженого volume розташована щонайменше на стільки рівнів униз деревом моделі. Оригінальна гра використовує перевірку в ground_hit, щоб відривати глибокі частини літака (airborne.inc:323).",
    "当被击中 volume 的骨骼在模型树中至少位于这么多层之下时为真。原版游戏在 ground_hit 中用它撕下飞机的深层部件（airborne.inc:323）。"],
  ["ide.kit.p.b.if.volume_bone_level.w", "This is an at least test: a bone exactly at this level counts too. Most other number checks need a value above the number.",
    "Это проверка «не меньше»: кость ровно на этом уровне тоже подходит. Большинство других числовых проверок требуют значения больше заданного.",
    "Це перевірка «щонайменше»: кістка рівно на цьому рівні теж підходить. Більшість інших числових перевірок вимагають значення, більшого за задане.",
    "这是“至少”检查：正好在此层的骨骼也算。大多数其他数字检查要求值大于该数。"],
  ["ide.kit.p.b.if.volume_bone_level.f.level", "Levels below the root", "Уровней ниже корня", "Рівнів нижче кореня", "根以下层数"],

  // n.start.prop_register
  ["ide.kit.p.n.start.prop_register", "Register a prop name",
    "Зарегистрировать имя свойства",
    "Зареєструвати назву властивості",
    "登记一个属性名"],
  ["ide.kit.p.n.start.prop_register.d", "Adds an empty block for a tag that no other block names, so the log stops warning Unknown props for units that carry it. It adds no reactions and changes nothing else.",
    "Добавляет пустой блок для тега, который не называет ни один другой блок, чтобы лог перестал предупреждать Unknown props для юнитов с этим тегом. Он не добавляет реакций и больше ничего не меняет.",
    "Додає порожній блок для тегу, який не називає жоден інший блок, щоб лог перестав попереджати Unknown props для юнітів із цим тегом. Він не додає реакцій і більше нічого не змінює.",
    "为一个没有任何其他块使用的标签添加空块，这样日志不再对带有该标签的单位警告 Unknown props。它不添加任何反应，也不改变其他内容。"],
  ["ide.kit.p.n.start.prop_register.w", "Any tag works, not only names the game uses: each tag of a unit that no block names is listed in an Unknown props warning when the unit is made. Vanilla already registers steel, wood, flesh, concrete, sand and ice (dummy.inc:736-741).",
    "Подходит любой тег, а не только имена, которые использует игра: каждый тег юнита, который не называет ни один блок, попадает в предупреждение Unknown props при создании юнита. Оригинальная игра уже регистрирует steel, wood, flesh, concrete, sand и ice (dummy.inc:736-741).",
    "Підходить будь-який тег, а не лише назви, які використовує гра: кожен тег юніта, який не називає жоден блок, потрапляє в попередження Unknown props під час створення юніта. Оригінальна гра вже реєструє steel, wood, flesh, concrete, sand та ice (dummy.inc:736-741).",
    "任何标签都可以，不只是游戏使用的名称：单位创建时，没有块使用的每个标签都会列在 Unknown props 警告中。原版游戏已经登记了 steel、wood、flesh、concrete、sand 和 ice（dummy.inc:736-741）。"],

  // n.combo.engine_handlers
  ["ide.kit.p.n.combo.engine_handlers", "Empty crew ready handlers",
    "Пустые обработчики готовности экипажа",
    "Порожні обробники готовності екіпажу",
    "空的乘员就绪处理器"],
  ["ide.kit.p.n.combo.engine_handlers.d", "Gives the block empty handlers for operatable on and off, the moments the unit becomes able or unable to act. Vanilla writes them empty with the note handled in extender (cannon.inc:528-529); why they are needed is not confirmed.",
    "Даёт блоку пустые обработчики operatable on и off, моментов, когда юнит становится способен или не способен действовать. Оригинальная игра пишет их пустыми с пометкой handled in extender (cannon.inc:528-529); зачем они нужны, не подтверждено.",
    "Дає блоку порожні обробники operatable on і off, моментів, коли юніт стає здатним або нездатним діяти. Оригінальна гра пише їх порожніми з позначкою handled in extender (cannon.inc:528-529); навіщо вони потрібні, не підтверджено.",
    "为块添加 operatable on 和 off 的空处理器，即单位变得能行动或不能行动的时刻。原版游戏把它们写成空的，并注明 handled in extender（cannon.inc:528-529）；为何需要它们尚未确认。"],
  ["ide.kit.p.n.combo.engine_handlers.w", "Each event may stand only once in a block: do not add these where the block already has operatable on or off. A second handler is a fatal error: event already defined.",
    "Каждое событие может быть в блоке только один раз: не добавляйте их туда, где в блоке уже есть operatable on или off. Второй обработчик даёт фатальную ошибку event already defined.",
    "Кожна подія може бути в блоці лише один раз: не додавайте їх туди, де в блоці вже є operatable on або off. Другий обробник дає фатальну помилку event already defined.",
    "每个事件在同一个块中只能出现一次：块里已有 operatable on 或 off 时不要再加。第二个处理器是致命错误：event already defined。"],

  // n.idea.survivor
  ["ide.kit.p.n.idea.survivor", "A crewman crawls out of the wreck",
    "Член экипажа выбирается из обломков",
    "Член екіпажу вибирається з уламків",
    "一名乘员从残骸中爬出"],
  ["ide.kit.p.n.idea.survivor.d", "When a unit with these tags blows up, now and then one soldier appears at the wreck two seconds later.",
    "Когда юнит с этими тегами взрывается, иногда через две секунды у обломков появляется один боец.",
    "Коли юніт із цими тегами вибухає, іноді через дві секунди біля уламків з'являється один боєць.",
    "带有这些标签的单位爆炸时，有时会在两秒后于残骸处出现一名士兵。"],
  ["ide.kit.p.n.idea.survivor.w", "spawn_human is never used in the game's own files. The new soldier stands at the wreck's origin, and who owns him is unknown. Whether the breed is named with the mp/ path is not confirmed. Not tried in a network game. Put your own unit's tags in place of my_unit.",
    "spawn_human ни разу не используется в файлах самой игры. Новый боец стоит в опорной точке обломков, и кому он принадлежит, неизвестно. Нужно ли указывать breed с путём mp/, не подтверждено. Не проверено в сетевой игре. Замените my_unit тегами своего юнита.",
    "spawn_human жодного разу не використовується у файлах самої гри. Новий боєць стоїть в опорній точці уламків, і кому він належить, невідомо. Чи треба вказувати breed зі шляхом mp/, не підтверджено. Не перевірено в мережевій грі. Замініть my_unit тегами свого юніта.",
    "游戏自带文件中从未使用过 spawn_human。新士兵站在残骸的原点，归属哪一方未知。兵种是否要带 mp/ 路径尚未确认。未在联网游戏中试过。把 my_unit 换成你自己单位的标签。"],
  ["ide.kit.p.n.idea.survivor.f.breed", "Soldier breed", "Breed бойца", "Breed бійця", "士兵兵种"],
  ["ide.kit.p.n.idea.survivor.f.breed.h", "Path under set/breed, without .set",
    "Путь внутри set/breed, без .set",
    "Шлях усередині set/breed, без .set",
    "set/breed 下的路径，不带 .set"]
];

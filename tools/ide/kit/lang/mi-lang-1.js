// Code Pieces, group mi-lang-1: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-lang-1.js
// (trigger block, statement flow and condition terms of the mission language, .mi files).
// Author: Imperator_Aug (ARSENAL, ia-78e7546b)
'use strict';

const rows = [];
const add = (key, en, ru, uk, zh) => rows.push([key, en, ru, uk, zh]);
const p = (id, suf, t) => add('ide.kit.p.' + id + suf, t[0], t[1], t[2], t[3]);
const fl = (id, name, t, h) => { p(id, '.f.' + name, t); if (h) p(id, '.f.' + name + '.h', h); };

// labels used by many pieces
const L = {
  n: ['Term number', 'Номер условия', 'Номер умови', '条件编号'],
  nH: ['The number before the dot; the expression of the trigger uses it. Give each term its own number.',
    'Число перед точкой; на него ссылается выражение триггера. У каждого условия свой номер.',
    'Число перед крапкою; на нього посилається вираз тригера. У кожної умови свій номер.',
    '点前面的数字，触发器的表达式用它来指代。每个条件用不同的编号。'],
  event: ['Event name', 'Имя события', "Ім'я події", '事件名'],
  eventH: ['A mission event; it must be listed in the events of the mission.',
    'Событие миссии; оно должно быть в списке событий миссии.',
    'Подія місії; вона має бути в списку подій місії.',
    '任务事件；必须在任务的事件列表中。'],
  tag: ['Unit tag', 'Тег юнитов', 'Тег юнітів', '单位标签'],
  op: ['Compare with', 'Сравнение', 'Порівняння', '比较方式'],
  opH: ['== equal, != not equal, << less, <<= less or equal, > more, >= more or equal.',
    '== равно, != не равно, << меньше, <<= меньше или равно, > больше, >= больше или равно.',
    '== дорівнює, != не дорівнює, << менше, <<= менше або дорівнює, > більше, >= більше або дорівнює.',
    '== 等于，!= 不等于，<< 小于，<<= 小于等于，> 大于，>= 大于等于。'],
  wait: ['Wait (seconds)', 'Ждать (секунды)', 'Чекати (секунди)', '等待（秒）'],
  chance: ['Chance (0 to 1)', 'Шанс (от 0 до 1)', 'Шанс (від 0 до 1)', '概率（0 到 1）'],
  level: ['Difficulty', 'Сложность', 'Складність', '难度'],
};
const NT = ['Not tried in game.', 'В игре не проверено.', 'У грі не перевірено.', '未在游戏中试过。'];
const withNT = t => t.map((s, i) => s + ' ' + NT[i]);

// 364 mi.trigger
p('mi.trigger', '', ['New trigger', 'Новый триггер', 'Новий тригер', '新触发器']);
p('mi.trigger', '.d', ['Adds a trigger: when its condition holds, the mission runs its actions once. This one waits for one event.',
  'Добавляет триггер: когда условие выполнено, миссия один раз выполняет его действия. Этот ждёт одно событие.',
  'Додає тригер: коли умова виконана, місія один раз виконує його дії. Цей чекає одну подію.',
  '添加一个触发器：条件成立时，任务执行一次它的动作。这个触发器等待一个事件。']);
p('mi.trigger', '.w', ['A trigger with an empty actions block stops the map from loading. Keep at least one line in actions.',
  'Триггер с пустым блоком actions не даёт карте загрузиться. Оставьте в actions хотя бы одну строку.',
  'Тригер із порожнім блоком actions не дає мапі завантажитися. Залиште в actions хоча б один рядок.',
  'actions 块为空的触发器会让地图无法加载。actions 里至少留一行。']);
fl('mi.trigger', 'name', ['Trigger name', 'Имя триггера', "Ім'я тригера", '触发器名'],
  ['Unique in the mission; a slash groups triggers in the editor, like "mission:helper/x".',
    'Уникальное в миссии; косая черта группирует триггеры в редакторе, например "mission:helper/x".',
    'Унікальне в місії; скісна риска групує тригери в редакторі, наприклад "mission:helper/x".',
    '在任务中唯一；斜杠在编辑器中给触发器分组，例如 "mission:helper/x"。']);
fl('mi.trigger', 'event', L.event, L.eventH);

// 365 mi.trg.start
p('mi.trg.start', '', ['Run at mission start', 'Запуск в начале миссии', 'Запуск на початку місії', '任务开始时运行']);
p('mi.trg.start', '.d', ['A trigger with an empty condition: an empty condition is always true, so its actions run as soon as the mission starts.',
  'Триггер с пустым условием: пустое условие всегда истинно, поэтому действия выполняются сразу при старте миссии.',
  'Тригер із порожньою умовою: порожня умова завжди істинна, тому дії виконуються одразу на старті місії.',
  '条件为空的触发器：空条件总是成立，所以任务一开始就执行它的动作。']);
fl('mi.trg.start', 'name', ['Trigger name', 'Имя триггера', "Ім'я тригера", '触发器名']);

// 366 mi.trg.disabled
p('mi.trg.disabled', '', ['Trigger starts switched off', 'Триггер выключен', 'Тригер вимкнений', '触发器关闭']);
p('mi.trg.disabled', '.d', ['Put inside a trigger: the trigger is switched off. It never checks its condition and never runs. The mission editor writes it together with ## before the name.',
  'Ставится внутрь триггера: триггер выключен. Он не проверяет условие и не запускается. Редактор миссий пишет это вместе с ## перед именем.',
  'Ставиться всередину тригера: тригер вимкнений. Він не перевіряє умову і не запускається. Редактор місій пише це разом із ## перед іменем.',
  '放在触发器里：触发器被关闭，永不检查条件，也不运行。任务编辑器会同时在名字前写 ##。']);
p('mi.trg.disabled', '.w', ['The trigger command cannot switch it back on (the game skips a switched-off trigger). Remove the line to use it again.',
  'Команда trigger не включит его обратно (игра пропускает выключенный триггер). Чтобы снова использовать, удалите строку.',
  'Команда trigger не ввімкне його назад (гра пропускає вимкнений тригер). Щоб знову використати, видаліть рядок.',
  'trigger 命令无法重新打开它（游戏会跳过关闭的触发器）。要再用它，删掉这一行。']);

// 367 mi.trg.autoreset
p('mi.trg.autoreset', '', ['Trigger fires again each time', 'Триггер срабатывает каждый раз', 'Тригер спрацьовує щоразу', '触发器每次都触发']);
p('mi.trg.autoreset', '.d', withNT(['Put inside a trigger: when the condition stops holding, the trigger resets itself, and it runs its actions again the next time the condition holds.',
  'Ставится внутрь триггера: когда условие перестаёт выполняться, триггер сбрасывается и снова выполняет действия, когда условие опять выполнится.',
  'Ставиться всередину тригера: коли умова перестає виконуватися, тригер скидається і знову виконує дії, коли умова знову виконається.',
  '放在触发器里：条件不再成立时触发器自动复位，下次条件成立时再次执行动作。']));

// 368 mi.trg.on
p('mi.trg.on', '', ['Trigger on flag', 'Флаг «триггер включён»', 'Прапорець «тригер увімкнений»', '触发器“已开启”标记']);
p('mi.trg.on', '.d', withNT(['Put inside a trigger: the trigger loads as already on (fired). Its actions do not run at load, it does not fire by itself, and a trigger term reads it as on. Saved games use it.',
  'Ставится внутрь триггера: триггер загружается уже включённым (сработавшим). Действия при загрузке не выполняются, сам он не сработает, а условие trigger видит его включённым. Так пишут сохранения.',
  'Ставиться всередину тригера: тригер завантажується вже увімкненим (спрацьованим). Дії при завантаженні не виконуються, сам він не спрацює, а умова trigger бачить його увімкненим. Так пишуть збереження.',
  '放在触发器里：触发器加载时已是开启（已触发）状态。加载时不执行动作，不会自己触发，trigger 条件把它视为开启。存档就是这样写的。']));

// 369 mi.trg.offmark
p('mi.trg.offmark', '', ['Switch an item off without deleting it', 'Выключить элемент, не удаляя', 'Вимкнути елемент, не видаляючи', '关闭一项但不删除']);
p('mi.trg.offmark', '.d', ['## before the name of a trigger, command or term switches that item off: the game reads it but skips it. The example is a switched-off event command.',
  '## перед именем триггера, команды или условия выключает этот элемент: игра читает его, но пропускает. В примере выключенная команда event.',
  '## перед іменем тригера, команди або умови вимикає цей елемент: гра читає його, але пропускає. У прикладі вимкнена команда event.',
  '在触发器、命令或条件的名字前加 ## 会关闭这一项：游戏读取但跳过它。示例是一条被关闭的 event 命令。']);
p('mi.trg.offmark', '.w', ['## is not a comment: the text inside must still be correct, or the map fails to load. To comment out, start the lines with ;.',
  '## — не комментарий: текст внутри должен быть правильным, иначе карта не загрузится. Чтобы закомментировать, начните строки с ;.',
  '## — не коментар: текст усередині має бути правильним, інакше мапа не завантажиться. Щоб закоментувати, почніть рядки з ;.',
  '## 不是注释：里面的文字仍须正确，否则地图无法加载。要注释掉，请在行首加 ;。']);
fl('mi.trg.offmark', 'event', L.event);

// 370 mi.cond.all
p('mi.cond.all', '', ['All terms must hold', 'Все условия должны выполняться', 'Усі умови мають виконуватися', '所有条件都须成立']);
p('mi.cond.all', '.d', ['The condition of a trigger with a list of terms. With no type and no expression, the trigger fires only when every term holds.',
  'Условие триггера со списком условий. Без type и expression триггер срабатывает, только когда выполнены все условия.',
  'Умова тригера зі списком умов. Без type і expression тригер спрацьовує, лише коли виконані всі умови.',
  '带条件列表的触发器条件。没有 type 和 expression 时，只有所有条件都成立触发器才触发。']);
fl('mi.cond.all', 'event', ['First event', 'Первое событие', 'Перша подія', '第一个事件'], L.eventH);
fl('mi.cond.all', 'event_2', ['Second event', 'Второе событие', 'Друга подія', '第二个事件'], L.eventH);

// 371 mi.cond.any
p('mi.cond.any', '', ['Any term may hold', 'Достаточно одного условия', 'Достатньо однієї умови', '任一条件成立即可']);
p('mi.cond.any', '.d', ['{type 1} in the condition: the trigger fires when any one of its terms holds.',
  '{type 1} в условии: триггер срабатывает, когда выполнено любое одно условие.',
  '{type 1} в умові: тригер спрацьовує, коли виконана будь-яка одна умова.',
  '条件中的 {type 1}：任一条件成立时触发器就触发。']);
fl('mi.cond.any', 'event', ['First event', 'Первое событие', 'Перша подія', '第一个事件'], L.eventH);
fl('mi.cond.any', 'event_2', ['Second event', 'Второе событие', 'Друга подія', '第二个事件'], L.eventH);

// 372 mi.cond.expr
p('mi.cond.expr', '', ['Custom logic (and, or, not)', 'Своя логика (и, или, не)', 'Своя логіка (і, або, не)', '自定义逻辑（与、或、非）']);
p('mi.cond.expr', '.d', ['An expression over the term numbers: & is and, | is or, ! is not. "1 & !2" fires when term 1 holds and term 2 does not.',
  'Выражение по номерам условий: & — и, | — или, ! — не. "1 & !2" срабатывает, когда условие 1 выполнено, а 2 нет.',
  'Вираз за номерами умов: & — і, | — або, ! — не. "1 & !2" спрацьовує, коли умова 1 виконана, а 2 ні.',
  '用条件编号写的表达式：& 表示与，| 表示或，! 表示非。"1 & !2" 在条件 1 成立且条件 2 不成立时触发。']);
p('mi.cond.expr', '.w', ['Only digits, ( ) ! & | and spaces; a word or a tab breaks it and the trigger never fires. All operators have one priority and are read right to left: use parentheses.',
  'Только цифры, ( ) ! & | и пробелы; слово или табуляция ломают выражение, и триггер не сработает. У всех операторов один приоритет, читаются справа налево: ставьте скобки.',
  'Лише цифри, ( ) ! & | і пробіли; слово або табуляція ламають вираз, і тригер не спрацює. Усі оператори мають один пріоритет і читаються справа наліво: ставте дужки.',
  '只能用数字、( ) ! & | 和空格；出现单词或制表符会出错，触发器永不触发。所有运算符优先级相同，从右向左计算：请加括号。']);
fl('mi.cond.expr', 'expr', ['Expression', 'Выражение', 'Вираз', '表达式'],
  ['Term numbers joined with & | ! and parentheses, for example (1 | 2) & !3.',
    'Номера условий, связанные & | ! и скобками, например (1 | 2) & !3.',
    'Номери умов, поєднані & | ! і дужками, наприклад (1 | 2) & !3.',
    '用 & | ! 和括号连接的条件编号，例如 (1 | 2) & !3。']);
fl('mi.cond.expr', 'event', ['Event of term 1', 'Событие условия 1', 'Подія умови 1', '条件 1 的事件'], L.eventH);
fl('mi.cond.expr', 'event_2', ['Event of term 2', 'Событие условия 2', 'Подія умови 2', '条件 2 的事件'], L.eventH);

// 373 mi.cond.term
p('mi.cond.term', '', ['One term in a terms list', 'Одно условие в списке terms', 'Одна умова в списку terms', 'terms 列表中的一个条件']);
p('mi.cond.term', '.d', ['An empty term block: its number, a dot and its kind, in quotes. Fill in the keys of that kind.',
  'Пустой блок условия: номер, точка и вид условия в кавычках. Допишите ключи этого вида.',
  'Порожній блок умови: номер, крапка і вид умови в лапках. Допишіть ключі цього виду.',
  '一个空的条件块：编号、点和条件种类，写在引号里。再填上该种类的键。']);
p('mi.cond.term', '.w', ['Each term must be its own {"n.kind" ...} block, and the kind must be a real one: a wrong kind stops the map from loading.',
  'Каждое условие — отдельный блок {"n.kind" ...}, и вид должен существовать: неверный вид не даёт карте загрузиться.',
  'Кожна умова — окремий блок {"n.kind" ...}, і вид має існувати: неправильний вид не дає мапі завантажитися.',
  '每个条件都须是独立的 {"n.kind" ...} 块，且种类必须存在：错误的种类会让地图无法加载。']);
fl('mi.cond.term', 'n', L.n, L.nH);
fl('mi.cond.term', 'kind', ['Term kind', 'Вид условия', 'Вид умови', '条件种类']);

// 374 mi.st.delay
p('mi.st.delay', '', ['Wait (seconds)', 'Ждать (секунды)', 'Чекати (секунди)', '等待（秒）']);
p('mi.st.delay', '.d', ['Pauses the actions for some seconds, then the next line runs.',
  'Останавливает действия на несколько секунд, потом выполняется следующая строка.',
  'Зупиняє дії на кілька секунд, потім виконується наступний рядок.',
  '让动作暂停几秒，然后执行下一行。']);
fl('mi.st.delay', 'time', L.wait);

// 375 mi.st.if
p('mi.st.if', '', ['If ... then', 'Если ... то', 'Якщо ... то', '如果……就']);
p('mi.st.if', '.d', ['Runs the lines inside only when its one condition holds. Here: only on the chosen difficulty. There is no else; use a switch for that.',
  'Выполняет строки внутри, только когда его условие выполнено. Здесь: только на выбранной сложности. Иначе (else) нет; для этого есть switch.',
  'Виконує рядки всередині, лише коли його умова виконана. Тут: лише на вибраній складності. Інакше (else) немає; для цього є switch.',
  '只有当它的条件成立时才执行里面的行。这里：只在所选难度下。没有 else，需要时请用 switch。']);
fl('mi.st.if', 'level', L.level);

// 376 mi.st.switch
p('mi.st.switch', '', ['Pick one of several', 'Выбрать один из вариантов', 'Вибрати один із варіантів', '从几个中选一个']);
p('mi.st.switch', '.d', ['Checks the cases from the top; the first case whose condition holds runs. If none holds, the default runs. Here each case is a random chance.',
  'Проверяет варианты сверху вниз; выполняется первый, чьё условие выполнено. Если ни один не подошёл, выполняется default. Здесь каждый вариант — случайный шанс.',
  'Перевіряє варіанти згори вниз; виконується перший, чия умова виконана. Якщо жоден не підійшов, виконується default. Тут кожен варіант — випадковий шанс.',
  '从上到下检查各个 case；第一个条件成立的 case 被执行。都不成立时执行 default。这里每个 case 是一个随机概率。']);
p('mi.st.switch', '.w', ['Old AS64 builds ran every true case and the default. Test on your build that only one runs.',
  'Старые сборки AS64 выполняли все истинные варианты и default. Проверьте на своей сборке, что выполняется только один.',
  'Старі збірки AS64 виконували всі істинні варіанти й default. Перевірте на своїй збірці, що виконується лише один.',
  '旧版 AS64 会执行所有成立的 case 和 default。请在你的版本上测试只执行了一个。']);
fl('mi.st.switch', 'chance', ['Chance of case 1', 'Шанс варианта 1', 'Шанс варіанта 1', 'case 1 的概率']);
fl('mi.st.switch', 'chance_2', ['Chance of case 2', 'Шанс варианта 2', 'Шанс варіанта 2', 'case 2 的概率']);

// 377 mi.st.case
p('mi.st.case', '', ['One choice of a switch', 'Один вариант switch', 'Один варіант switch', 'switch 的一个分支']);
p('mi.st.case', '.d', ['One case inside a switch: its lines run when its condition holds and no case above it did. Here it compares a mission variable.',
  'Один вариант внутри switch: его строки выполняются, когда его условие выполнено и ни один вариант выше не сработал. Здесь сравнивается переменная миссии.',
  'Один варіант усередині switch: його рядки виконуються, коли його умова виконана і жоден варіант вище не спрацював. Тут порівнюється змінна місії.',
  'switch 里的一个 case：条件成立且上面没有 case 被执行时，运行它的行。这里比较一个任务变量。']);
fl('mi.st.case', 'var', ['Variable', 'Переменная', 'Змінна', '变量'],
  ['A mission variable; vanilla names end in $.', 'Переменная миссии; в игре имена кончаются на $.',
    'Змінна місії; у грі імена закінчуються на $.', '任务变量；原版名字以 $ 结尾。']);
fl('mi.st.case', 'op', L.op, L.opH);
fl('mi.st.case', 'value', ['Value', 'Значение', 'Значення', '值']);

// 378 mi.st.default
p('mi.st.default', '', ['Fallback choice', 'Вариант по умолчанию', 'Варіант за замовчуванням', '默认分支']);
p('mi.st.default', '.d', ['The default inside a switch: its lines run when no case holds. A switch has at most one.',
  'default внутри switch: его строки выполняются, когда ни один вариант не подошёл. В switch он может быть только один.',
  'default усередині switch: його рядки виконуються, коли жоден варіант не підійшов. У switch він може бути лише один.',
  'switch 里的 default：没有 case 成立时运行它的行。一个 switch 最多一个。']);

// 379 mi.st.loop
p('mi.st.loop', '', ['Repeat N times', 'Повторить N раз', 'Повторити N разів', '重复 N 次']);
p('mi.st.loop', '.d', ['Runs the lines inside the given number of times, one round after another.',
  'Выполняет строки внутри заданное число раз, круг за кругом.',
  'Виконує рядки всередині задану кількість разів, коло за колом.',
  '把里面的行按给定次数一轮一轮地执行。']);
fl('mi.st.loop', 'count', ['Times', 'Сколько раз', 'Скільки разів', '次数']);
fl('mi.st.loop', 'time', L.wait);

// 380 mi.st.while
p('mi.st.while', '', ['Repeat while a term holds', 'Повторять, пока условие верно', 'Повторювати, поки умова істинна', '条件成立时重复']);
p('mi.st.while', '.d', ['Runs the lines inside again and again while the condition holds. Here: while any living soldier with the tag is left.',
  'Снова и снова выполняет строки внутри, пока условие выполнено. Здесь: пока жив хоть один солдат с тегом.',
  'Знову і знову виконує рядки всередині, поки умова виконана. Тут: поки живий хоч один солдат із тегом.',
  '条件成立时反复执行里面的行。这里：只要还有带该标签的活着的士兵。']);
p('mi.st.while', '.w', ['Keep a wait inside, or the loop runs without a pause.',
  'Оставьте внутри ожидание, иначе цикл крутится без паузы.',
  'Залиште всередині очікування, інакше цикл крутиться без паузи.',
  '里面要留一个等待，否则循环会不停地运行。']);
fl('mi.st.while', 'tag', L.tag);
fl('mi.st.while', 'time', L.wait);

// 381 mi.st.select
p('mi.st.select', '', ['Run for picked units', 'Выполнить для выбранных юнитов', 'Виконати для вибраних юнітів', '对选定单位执行']);
p('mi.st.select', '.d', withNT(['A select line picks units; the commands after it that use {source current} act on those units. Here they are told to hold their place.',
  'Строка select выбирает юнитов; следующие команды с {source current} действуют на них. Здесь им велено держать позицию.',
  'Рядок select вибирає юнітів; наступні команди з {source current} діють на них. Тут їм наказано тримати позицію.',
  'select 行选出单位；后面使用 {source current} 的命令作用于这些单位。这里命令它们原地坚守。']));
p('mi.st.select', '.w', ['No game mission uses select; the way its picks are written is read from the game only.',
  'Ни одна миссия игры не использует select; запись выбора взята только из кода движка.',
  'Жодна місія гри не використовує select; запис вибору взято лише з коду рушія.',
  '没有原版任务使用 select；选择的写法只来自引擎代码。']);
fl('mi.st.select', 'tag', L.tag);

// 382 mi.st.cond
p('mi.st.cond', '', ['Single-term condition of a statement', 'Условие из одного терма', 'Умова з одного терма', '语句的单条件']);
p('mi.st.cond', '.d', ['The condition of an if, while or case: one term, its kind in type and its keys beside it. Fill in the keys of that kind.',
  'Условие для if, while или case: одно условие, его вид в type, а ключи рядом. Допишите ключи этого вида.',
  'Умова для if, while або case: одна умова, її вид у type, а ключі поруч. Допишіть ключі цього виду.',
  'if、while 或 case 的条件：一个条件，种类写在 type 里，键写在旁边。再填上该种类的键。']);
fl('mi.st.cond', 'kind', ['Term kind', 'Вид условия', 'Вид умови', '条件种类']);

// 383 mi.t.event
p('mi.t.event', '', ['An event has happened', 'Событие произошло', 'Подія сталася', '事件已发生']);
p('mi.t.event', '.d', ['Holds once the mission event has been set by an event command.',
  'Выполняется, когда событие миссии установлено командой event.',
  'Виконується, коли подію місії встановлено командою event.',
  '任务事件被 event 命令设置后成立。']);
p('mi.t.event', '.w', ['An event name the mission does not list makes the term false, with no line in the log.',
  'Имя события, которого нет в списке миссии, делает условие ложным, без строки в журнале.',
  "Ім'я події, якої немає у списку місії, робить умову хибною, без рядка в журналі.",
  '任务未列出的事件名会让条件为假，日志里没有提示。']);
fl('mi.t.event', 'n', L.n, L.nH);
fl('mi.t.event', 'event', L.event, L.eventH);

// 384 mi.t.entities
p('mi.t.entities', '', ['Count units (in a zone)', 'Сосчитать юнитов (в зоне)', 'Порахувати юнітів (у зоні)', '统计单位（在区域内）']);
p('mi.t.entities', '.d', ['Counts the units that match the selector (tag, zone, kind, state) and compares the count with a number.',
  'Считает юнитов, подходящих под выбор (тег, зона, вид, состояние), и сравнивает число.',
  'Рахує юнітів, що підходять під вибір (тег, зона, вид, стан), і порівнює кількість.',
  '统计符合选择条件（标签、区域、种类、状态）的单位数，并与一个数比较。']);
p('mi.t.entities', '.w', ['A killed tank never reads dead: use not moveable. A destroyed unit drops out of every count.',
  'Подбитый танк никогда не считается dead: используйте not moveable. Уничтоженный юнит выпадает из любого подсчёта.',
  'Підбитий танк ніколи не вважається dead: використовуйте not moveable. Знищений юніт випадає з будь-якого підрахунку.',
  '被击毁的坦克永远不会是 dead：请用 not moveable。被摧毁的单位会从所有计数中消失。']);
fl('mi.t.entities', 'n', L.n, L.nH);
fl('mi.t.entities', 'tag', L.tag);
fl('mi.t.entities', 'zone', ['Zone name', 'Имя зоны', "Ім'я зони", '区域名']);
fl('mi.t.entities', 'type', ['Unit kind', 'Вид юнита', 'Вид юніта', '单位种类']);
fl('mi.t.entities', 'state', ['Unit state', 'Состояние юнита', 'Стан юніта', '单位状态']);
fl('mi.t.entities', 'op', L.op, L.opH);
fl('mi.t.entities', 'value', ['Count', 'Количество', 'Кількість', '数量']);

// 385 mi.t.cmp_i
p('mi.t.cmp_i', '', ['Compare a variable', 'Сравнить переменную', 'Порівняти змінну', '比较变量']);
p('mi.t.cmp_i', '.d', ['Holds when the mission variable compares true with the value.',
  'Выполняется, когда переменная миссии верно сравнивается со значением.',
  'Виконується, коли змінна місії правильно порівнюється зі значенням.',
  '任务变量与该值的比较成立时成立。']);
p('mi.t.cmp_i', '.w', ['A variable the mission does not list makes the term false, with no line in the log.',
  'Переменная, которой нет в миссии, делает условие ложным, без строки в журнале.',
  'Змінна, якої немає в місії, робить умову хибною, без рядка в журналі.',
  '任务未列出的变量会让条件为假，日志里没有提示。']);
fl('mi.t.cmp_i', 'n', L.n, L.nH);
fl('mi.t.cmp_i', 'var', ['Variable', 'Переменная', 'Змінна', '变量'],
  ['A mission variable; vanilla names end in $.', 'Переменная миссии; в игре имена кончаются на $.',
    'Змінна місії; у грі імена закінчуються на $.', '任务变量；原版名字以 $ 结尾。']);
fl('mi.t.cmp_i', 'op', L.op, L.opH);
fl('mi.t.cmp_i', 'value', ['Value', 'Значение', 'Значення', '值']);

// 386 mi.t.task
p('mi.t.task', '', ['Objective state', 'Состояние задачи', 'Стан завдання', '目标状态']);
p('mi.t.task', '.d', ['Holds when the objective is in the chosen state: shown, completed or failed. Without a state line it means completed.',
  'Выполняется, когда задача в выбранном состоянии: shown, completed или failed. Без строки state означает completed.',
  'Виконується, коли завдання у вибраному стані: shown, completed або failed. Без рядка state означає completed.',
  '目标处于所选状态时成立：shown、completed 或 failed。没有 state 行时表示 completed。']);
fl('mi.t.task', 'n', L.n, L.nH);
fl('mi.t.task', 'task', ['Objective name', 'Имя задачи', "Ім'я завдання", '目标名']);
fl('mi.t.task', 'state', ['Objective state', 'Состояние задачи', 'Стан завдання', '目标状态']);

// 387 mi.t.see_actors
p('mi.t.see_actors', '', ['Units see other units', 'Юниты видят других юнитов', 'Юніти бачать інших юнітів', '单位看到其他单位']);
p('mi.t.see_actors', '.d', ['Holds when units of the first selector see units of the enemy selector within the distance. With the tag pair, the seen and the seeing units get the two tags.',
  'Выполняется, когда юниты первого выбора видят юнитов из выбора enemy в пределах расстояния. С tag pair видящие и увиденные получают два тега.',
  'Виконується, коли юніти першого вибору бачать юнітів із вибору enemy у межах відстані. З tag pair ті, хто бачить, і ті, кого бачать, отримують два теги.',
  '第一组单位在距离内看到 enemy 组单位时成立。用 tag pair 时，看到的和被看到的单位分别得到两个标签。']);
fl('mi.t.see_actors', 'n', L.n, L.nH);
fl('mi.t.see_actors', 'tag', ['Who looks (tag)', 'Кто смотрит (тег)', 'Хто дивиться (тег)', '观察者（标签）']);
fl('mi.t.see_actors', 'enemy', ['Who is seen (tag)', 'Кого видят (тег)', 'Кого бачать (тег)', '被看到者（标签）']);
fl('mi.t.see_actors', 'mode', ['Distance rule', 'Правило расстояния', 'Правило відстані', '距离规则'],
  ['near_than = closer than the metres, far_than = farther.', 'near_than = ближе заданных метров, far_than = дальше.',
    'near_than = ближче заданих метрів, far_than = далі.', 'near_than = 比这个米数近，far_than = 更远。']);
fl('mi.t.see_actors', 'meters', ['Metres', 'Метры', 'Метри', '米']);
fl('mi.t.see_actors', 'detection', ['How well seen', 'Насколько видно', 'Наскільки видно', '看清程度']);
fl('mi.t.see_actors', 'tag_a', ['Tag for the lookers', 'Тег смотрящим', 'Тег тим, хто дивиться', '给观察者的标签']);
fl('mi.t.see_actors', 'tag_b', ['Tag for the seen', 'Тег увиденным', 'Тег побаченим', '给被看到者的标签']);

// 388 mi.t.difficulty
p('mi.t.difficulty', '', ['Difficulty is', 'Сложность равна', 'Складність дорівнює', '难度为']);
p('mi.t.difficulty', '.d', ['Holds when the player plays on the chosen difficulty.',
  'Выполняется, когда игрок играет на выбранной сложности.',
  'Виконується, коли гравець грає на вибраній складності.',
  '玩家在所选难度下游戏时成立。']);
fl('mi.t.difficulty', 'n', L.n, L.nH);
fl('mi.t.difficulty', 'level', L.level);

// 389 mi.t.trigger
p('mi.t.trigger', '', ['A trigger is on', 'Триггер включён', 'Тригер увімкнений', '触发器已开启']);
p('mi.t.trigger', '.d', ['Holds while the named trigger is on, that is after it has fired and before it is reset.',
  'Выполняется, пока названный триггер включён: после срабатывания и до сброса.',
  'Виконується, поки названий тригер увімкнений: після спрацювання і до скидання.',
  '指定的触发器处于开启状态时成立，即触发之后、复位之前。']);
fl('mi.t.trigger', 'n', L.n, L.nH);
fl('mi.t.trigger', 'trigger', ['Trigger name', 'Имя триггера', "Ім'я тригера", '触发器名']);

// 390 mi.t.near
p('mi.t.near', '', ['Units near something (metres)', 'Юниты рядом с чем-то (метры)', 'Юніти поруч із чимось (метри)', '单位靠近某物（米）']);
p('mi.t.near', '.d', ['Holds when a unit of the first selector is within the distance of a unit or object of the near_to selector.',
  'Выполняется, когда юнит первого выбора находится в пределах расстояния от юнита или объекта выбора near_to.',
  "Виконується, коли юніт першого вибору перебуває в межах відстані від юніта або об'єкта вибору near_to.",
  '第一组中的某个单位在 near_to 组的单位或物体的距离内时成立。']);
p('mi.t.near', '.w', ['The distance is in metres (the game multiplies by 20) and the size of both objects is taken off the gap, so it fires a bit early.',
  'Расстояние в метрах (игра умножает на 20), а размер обоих объектов вычитается, поэтому срабатывает чуть раньше.',
  "Відстань у метрах (гра множить на 20), а розмір обох об'єктів віднімається, тому спрацьовує трохи раніше.",
  '距离以米为单位（游戏乘以 20），并会减去两个物体的大小，所以会稍早触发。']);
fl('mi.t.near', 'n', L.n, L.nH);
fl('mi.t.near', 'tag', L.tag);
fl('mi.t.near', 'near_to', ['Near what (tag)', 'Рядом с чем (тег)', 'Поруч із чим (тег)', '靠近什么（标签）']);
fl('mi.t.near', 'distance', ['Distance (metres)', 'Расстояние (метры)', 'Відстань (метри)', '距离（米）']);

// 391 mi.t.see_enemy
p('mi.t.see_enemy', '', ['Units see an enemy', 'Юниты видят врага', 'Юніти бачать ворога', '单位看到敌人']);
p('mi.t.see_enemy', '.d', ['Holds when a living soldier with the tag sees any enemy.',
  'Выполняется, когда живой солдат с тегом видит любого врага.',
  'Виконується, коли живий солдат із тегом бачить будь-якого ворога.',
  '带该标签的活着的士兵看到任何敌人时成立。']);
fl('mi.t.see_enemy', 'n', L.n, L.nH);
fl('mi.t.see_enemy', 'tag', L.tag);

// 392 mi.t.inventory
p('mi.t.inventory', '', ['Ammo or fuel below an amount', 'Патронов или топлива меньше', 'Набоїв або пального менше', '弹药或燃料低于数量']);
p('mi.t.inventory', '.d', ['Compares how much of an item the picked units carry with an amount. For fuel write {where fuel} in place of the item line.',
  'Сравнивает, сколько предмета несут выбранные юниты, с количеством. Для топлива пишите {where fuel} вместо строки item.',
  'Порівнює, скільки предмета несуть вибрані юніти, з кількістю. Для пального пишіть {where fuel} замість рядка item.',
  '把选定单位携带的某物品数量与一个数比较。燃料请用 {where fuel} 代替 item 行。']);
fl('mi.t.inventory', 'n', L.n, L.nH);
fl('mi.t.inventory', 'tag', L.tag);
fl('mi.t.inventory', 'item', ['Ammo kind', 'Вид патронов', 'Вид набоїв', '弹药种类'],
  ['The first item tag, for example mgun, hmgun or bullet88 then "ap" before "ammo". Each tag is its own quoted word.',
    'Первый тег предмета, например mgun, hmgun или bullet88 и "ap" перед "ammo". Каждый тег — отдельное слово в кавычках.',
    'Перший тег предмета, наприклад mgun, hmgun або bullet88 і "ap" перед "ammo". Кожен тег — окреме слово в лапках.',
    '第一个物品标签，例如 mgun、hmgun，或 bullet88 并在 "ammo" 前加 "ap"。每个标签都是单独加引号的词。']);
fl('mi.t.inventory', 'compare', ['Compare', 'Сравнение', 'Порівняння', '比较']);
fl('mi.t.inventory', 'amount', ['Amount', 'Количество', 'Кількість', '数量']);

// 393 mi.t.mission_option
p('mi.t.mission_option', '', ['Mission option chosen', 'Выбрана опция миссии', 'Вибрано опцію місії', '已选任务选项']);
p('mi.t.mission_option', '.d', ['Holds when the player chose this option of the mission before it started.',
  'Выполняется, когда игрок выбрал эту опцию миссии перед стартом.',
  'Виконується, коли гравець вибрав цю опцію місії перед стартом.',
  '玩家在任务开始前选了这个任务选项时成立。']);
fl('mi.t.mission_option', 'n', L.n, L.nH);
fl('mi.t.mission_option', 'option', ['Option name', 'Имя опции', "Ім'я опції", '选项名']);

// 394 mi.t.signal
p('mi.t.signal', '', ['Shot, hit or explosion in a zone', 'Выстрел, попадание или взрыв в зоне', 'Постріл, влучання або вибух у зоні', '区域内有射击、命中或爆炸']);
p('mi.t.signal', '.d', ['Holds when one of the listed signals happens in the zone, such as a shot or an explosion.',
  'Выполняется, когда в зоне происходит один из перечисленных сигналов, например выстрел или взрыв.',
  'Виконується, коли в зоні стається один із перелічених сигналів, наприклад постріл або вибух.',
  '区域内发生所列信号之一（如射击或爆炸）时成立。']);
fl('mi.t.signal', 'n', L.n, L.nH);
fl('mi.t.signal', 'zone', ['Zone name', 'Имя зоны', "Ім'я зони", '区域名']);
fl('mi.t.signal', 'signals', ['Signals', 'Сигналы', 'Сигнали', '信号'],
  ['Words with spaces between: movement shot hit injure explosion mandie.',
    'Слова через пробел: movement shot hit injure explosion mandie.',
    'Слова через пробіл: movement shot hit injure explosion mandie.',
    '用空格分隔的词：movement shot hit injure explosion mandie。']);

// 395 mi.t.rand
p('mi.t.rand', '', ['Random chance', 'Случайный шанс', 'Випадковий шанс', '随机概率']);
p('mi.t.rand', '.d', ['The condition of an if, while or case that holds by chance: 0.35 holds about one time in three.',
  'Условие для if, while или case, которое выполняется случайно: 0.35 — примерно раз из трёх.',
  'Умова для if, while або case, що виконується випадково: 0.35 — приблизно раз із трьох.',
  'if、while 或 case 的随机条件：0.35 大约三次成立一次。']);
fl('mi.t.rand', 'chance', L.chance);

// 396 mi.t.mod
p('mi.t.mod', '', ['A workshop mod is active', 'Включён мод из мастерской', 'Увімкнений мод із майстерні', '创意工坊模组已启用']);
p('mi.t.mod', '.d', withNT(['Holds when an active mod has this name (case does not matter).',
  'Выполняется, когда включён мод с этим именем (регистр не важен).',
  "Виконується, коли увімкнений мод із цим ім'ям (регістр не важливий).",
  '有一个已启用的模组叫这个名字时成立（不分大小写）。']));
p('mi.t.mod', '.w', ['This checks the mods turned on in the game, not the (mod ...) switch of data files.',
  'Это проверка включённых в игре модов, а не переключатель (mod ...) в файлах данных.',
  'Це перевірка увімкнених у грі модів, а не перемикач (mod ...) у файлах даних.',
  '这里检查游戏中启用的模组，不是数据文件里的 (mod ...) 开关。']);
fl('mi.t.mod', 'n', L.n, L.nH);
fl('mi.t.mod', 'mod', ['Mod name', 'Имя мода', "Ім'я мода", '模组名']);

// 397 mi.t.side
p('mi.t.side', '', ["Player's army is", 'Армия игрока', 'Армія гравця', '玩家的军队是']);
p('mi.t.side', '.d', withNT(["Holds when the player's army has this name, for example usa or ger.",
  'Выполняется, когда армия игрока называется так, например usa или ger.',
  'Виконується, коли армія гравця так називається, наприклад usa або ger.',
  '玩家的军队名为此值时成立，例如 usa 或 ger。']));
fl('mi.t.side', 'n', L.n, L.nH);
fl('mi.t.side', 'side', ['Army', 'Армия', 'Армія', '军队']);

// 398 mi.t.crew
p('mi.t.crew', '', ["Units are a vehicle's crew", 'Юниты — экипаж машины', 'Юніти — екіпаж машини', '单位是载具的乘员']);
p('mi.t.crew', '.d', withNT(['Holds when the picked units sit in the vehicle. With at_least_one, one of them is enough; without it, all must be in.',
  'Выполняется, когда выбранные юниты сидят в машине. С at_least_one хватает одного, без него — все должны быть внутри.',
  'Виконується, коли вибрані юніти сидять у машині. З at_least_one досить одного, без нього — усі мають бути всередині.',
  '选定单位坐在载具里时成立。有 at_least_one 时一个就够；没有时必须全部在内。']));
fl('mi.t.crew', 'n', L.n, L.nH);
fl('mi.t.crew', 'vehicle', ['Vehicle tag', 'Тег машины', 'Тег машини', '载具标签']);
fl('mi.t.crew', 'crew', ['Crew tag', 'Тег экипажа', 'Тег екіпажу', '乘员标签']);

module.exports = rows;

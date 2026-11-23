// Code Pieces, group mi-pat-1: lang rows [key, en, ru, uk, zh] for the pieces of tools/ide/kit/pieces/mi-pat-1.js
// (common patterns for mission files: start, timing, repeat, guards, counters, stages, logic, chains, helpers, zones).
// Field labels shared by many pieces are written once in L and expanded into rows by F.
// Author: Imperator_Aug (ARSENAL, ia-477a28d8)
'use strict';

const NT = ['Not tried in game.', 'В игре не проверено.', 'У грі не перевірено.', '未在游戏中测试。'];
const L = {
  trig:   ['Trigger name', 'Имя триггера', "Ім'я тригера", '触发器名'],
  trig2:  ['Same trigger name', 'То же имя триггера', "Те саме ім'я тригера", '同一触发器名'],
  text:   ['Console text', 'Текст в консоль', 'Текст у консоль', '控制台文本'],
  wait:   ['Wait (seconds)', 'Ожидание (секунды)', 'Очікування (секунди)', '等待（秒）'],
  event:  ['Event name', 'Имя события', "Ім'я події", '事件名'],
  event2: ['Same event name', 'То же имя события', "Те саме ім'я події", '同一事件名'],
  tag:    ['Unit tag', 'Тег юнитов', 'Тег юнітів', '单位标签'],
  zone:   ['Zone name', 'Имя зоны', "Ім'я зони", '区域名'],
  n:      ['Term number', 'Номер условия', 'Номер умови', '条件编号'],
  op:     ['Compare', 'Сравнение', 'Порівняння', '比较方式'],
  var:    ['Variable name', 'Имя переменной', "Ім'я змінної", '变量名'],
  var2:   ['Same variable name', 'То же имя переменной', "Те саме ім'я змінної", '同一变量名'],
  period: ['Period (seconds)', 'Период (секунды)', 'Період (секунди)', '间隔（秒）'],
  sound:  ['Sound name', 'Имя звука', "Ім'я звуку", '声音名'],
  evA:    ['First event', 'Первое событие', 'Перша подія', '第一个事件'],
  evB:    ['Second event', 'Второе событие', 'Друга подія', '第二个事件'],
};
const H = {
  n: ['The number before the dot; each term in one condition needs its own number.',
    'Число перед точкой; у каждого условия в одном condition свой номер.',
    'Число перед крапкою; кожна умова в одному condition має свій номер.',
    '点号前的数字；同一 condition 中每个条件需要不同编号。'],
  trig2: ['Must be the name of this same trigger, so it re-arms itself.',
    'Должно совпадать с именем этого же триггера, чтобы он перезапускал сам себя.',
    'Має збігатися з іменем цього ж тригера, щоб він перезапускав сам себе.',
    '必须是本触发器自己的名字，这样它才能重新启用自己。'],
  var: ['Written here without the trailing $; the piece adds it.',
    'Пишется без $ в конце; кусок сам добавит его.',
    'Пишеться без $ у кінці; шматок сам додасть його.',
    '这里不写末尾的 $，代码块会自动加上。'],
  op: ['<< means less than, <<= less or equal.', '<< значит «меньше», <<= «меньше или равно».',
    '<< означає «менше», <<= «менше або дорівнює».', '<< 表示小于，<<= 表示小于等于。'],
};
const rows = [];
const R = (key, en, ru, uk, zh) => rows.push([key, en, ru, uk, zh]);
const F = (id, name, lab, hint) => {
  R('ide.kit.p.' + id + '.f.' + name, ...(Array.isArray(lab) ? lab : L[lab]));
  const h = hint === undefined ? H[lab] : hint;
  if (h) R('ide.kit.p.' + id + '.f.' + name + '.h', ...h);
};
const nt = (en, ru, uk, zh) => [en + ' ' + NT[0], ru + ' ' + NT[1], uk + ' ' + NT[2], zh + NT[3]];

// 508
let id = 'mi.pat.run_once_at_mission_start';
R('ide.kit.p.' + id, 'Run once at mission start', 'Один раз при старте миссии', 'Один раз на старті місії', '任务开始时运行一次');
R('ide.kit.p.' + id + '.d', 'A trigger with an empty condition: it fires once, right after the mission begins, and runs its actions.',
  'Триггер с пустым условием: срабатывает один раз сразу после начала миссии и выполняет свои действия.',
  'Тригер із порожньою умовою: спрацьовує один раз одразу після початку місії й виконує свої дії.',
  '条件为空的触发器：任务开始后立即触发一次并执行其动作。');
R('ide.kit.p.' + id + '.w', 'It fires at the first check, 0.25 s or less after the start. Keep the short delay first if units must settle, as the game missions do.',
  'Срабатывает при первой проверке, не позже 0,25 с после старта. Оставьте короткую задержку первой, если юниты должны успеть встать, как в миссиях игры.',
  'Спрацьовує під час першої перевірки, не пізніше 0,25 с після старту. Залиште коротку затримку першою, якщо юніти мають устигнути стати, як у місіях гри.',
  '它在第一次检查时触发，开始后不超过 0.25 秒。如果单位需要先就位，像游戏自带任务那样把短暂延迟放在最前。');
F(id, 'name', 'trig'); F(id, 'wait', 'wait'); F(id, 'text', 'text');

// 509
id = 'mi.pat.run_once_on_the_start_event';
R('ide.kit.p.' + id, 'Run once on the "start" event', 'Один раз по событию "start"', 'Один раз за подією "start"', '在 "start" 事件时运行一次');
R('ide.kit.p.' + id + '.d', 'A trigger that fires once when the event start is set, then waits and runs its actions.',
  'Триггер, который срабатывает один раз, когда установлено событие start, затем ждёт и выполняет действия.',
  'Тригер, що спрацьовує один раз, коли встановлено подію start, потім чекає й виконує дії.',
  '当 start 事件被设置时触发一次，等待后执行其动作。');
R('ide.kit.p.' + id + '.n', 'Something must raise the event: in game missions a scenario with {event_on_next "start"} or an event command. The engine never raises start by itself. Declare {event "start"} in Helpers.',
  'Событие кто-то должен поднять: в миссиях игры это scenario с {event_on_next "start"} или команда event. Движок сам start не поднимает. Объявите {event "start"} в Helpers.',
  'Подію хтось має підняти: у місіях гри це scenario з {event_on_next "start"} або команда event. Рушій сам start не піднімає. Оголосіть {event "start"} у Helpers.',
  '必须有东西触发该事件：游戏任务中用带 {event_on_next "start"} 的 scenario 或 event 命令。引擎自己从不触发 start。在 Helpers 中声明 {event "start"}。');
F(id, 'name', 'trig'); F(id, 'event', 'event'); F(id, 'wait', 'wait'); F(id, 'text', 'text');

// 510
id = 'mi.pat.raise_my_own_event';
R('ide.kit.p.' + id, 'Raise my own event', 'Поднять своё событие', 'Підняти свою подію', '触发自定义事件');
R('ide.kit.p.' + id + '.d', 'A command that sets, clears or toggles an event. Triggers that wait for this event then fire.',
  'Команда, которая ставит, снимает или переключает событие. Триггеры, ждущие это событие, срабатывают.',
  'Команда, що ставить, знімає або перемикає подію. Тригери, які чекають на цю подію, спрацьовують.',
  '设置、清除或切换一个事件的命令。等待该事件的触发器随后触发。');
R('ide.kit.p.' + id + '.w', 'Modes: set, reset (clear), toggle (clears, then sets, so an event term sees it again).',
  'Режимы: set, reset (снять), toggle (снимает и снова ставит, чтобы условие event увидело его ещё раз).',
  'Режими: set, reset (зняти), toggle (знімає й знову ставить, щоб умова event побачила її ще раз).',
  '模式：set、reset（清除）、toggle（先清除再设置，使 event 条件再次看到它）。');
R('ide.kit.p.' + id + '.n', 'Declare {event "my_event"} in Helpers of the same file.',
  'Объявите {event "my_event"} в Helpers того же файла.', 'Оголосіть {event "my_event"} у Helpers того ж файлу.',
  '在同一文件的 Helpers 中声明 {event "my_event"}。');
F(id, 'event', 'event');
F(id, 'mode', ['Mode', 'Режим', 'Режим', '模式']);
F(id, 'wait', ['Delay (seconds)', 'Задержка (секунды)', 'Затримка (секунди)', '延迟（秒）'],
  ['The event turns on after this many seconds; 0 = at once.', 'Событие включится через столько секунд; 0 = сразу.',
    'Подія ввімкнеться через стільки секунд; 0 = одразу.', '事件在这么多秒后生效；0 表示立即。']);

// 511
id = 'mi.pat.wait_then_act';
R('ide.kit.p.' + id, 'Wait then act', 'Подождать и действовать', 'Зачекати й діяти', '等待后执行');
R('ide.kit.p.' + id + '.d', 'Inside actions: wait some seconds, then run the next command.',
  'Внутри actions: подождать несколько секунд, затем выполнить следующую команду.',
  'Усередині actions: зачекати кілька секунд, потім виконати наступну команду.',
  '在 actions 内：等待若干秒，然后执行下一条命令。');
F(id, 'wait', 'wait'); F(id, 'text', 'text');

// 512
id = 'mi.pat.wait_without_holding_the_trigger_del';
R('ide.kit.p.' + id, 'Wait without holding the trigger (delayed event)', 'Ждать, не занимая триггер (отложенное событие)', 'Чекати, не тримаючи тригер (відкладена подія)', '不占用触发器的等待（延迟事件）');
R('ide.kit.p.' + id + '.d', ...nt('Two triggers: the first sets an event with a delay and ends at once; the second fires when the event turns on.',
  'Два триггера: первый ставит событие с задержкой и сразу заканчивается; второй срабатывает, когда событие включится.',
  'Два тригери: перший ставить подію із затримкою й одразу закінчується; другий спрацьовує, коли подія ввімкнеться.',
  '两个触发器：第一个以延迟设置事件并立即结束；事件生效时第二个触发。'));
R('ide.kit.p.' + id + '.w', 'The event turns on after the delay even if the first trigger is re-armed meanwhile.',
  'Событие включится после задержки, даже если первый триггер за это время перезапущен.',
  'Подія ввімкнеться після затримки, навіть якщо перший тригер за цей час перезапущено.',
  '即使第一个触发器在此期间被重新启用，事件仍会在延迟后生效。');
R('ide.kit.p.' + id + '.n', 'Declare the event ({event "my_later"}) in Helpers of the same file.',
  'Объявите событие ({event "my_later"}) в Helpers того же файла.', 'Оголосіть подію ({event "my_later"}) у Helpers того ж файлу.',
  '在同一文件的 Helpers 中声明该事件（{event "my_later"}）。');
F(id, 'arm', ['First trigger name', 'Имя первого триггера', "Ім'я першого тригера", '第一个触发器名']);
F(id, 'event', 'event');
F(id, 'wait', ['Delay (seconds)', 'Задержка (секунды)', 'Затримка (секунди)', '延迟（秒）']);
F(id, 'act', ['Second trigger name', 'Имя второго триггера', "Ім'я другого тригера", '第二个触发器名']);
F(id, 'event_2', 'event2'); F(id, 'text', 'text');

// 513
id = 'mi.pat.random_wait';
R('ide.kit.p.' + id, 'Random wait', 'Случайное ожидание', 'Випадкове очікування', '随机等待');
R('ide.kit.p.' + id + '.d', ...nt('A delay with two numbers: the middle time and the spread. 60 and 20 wait 40 to 80 seconds.',
  'Задержка с двумя числами: среднее время и разброс. 60 и 20 ждут от 40 до 80 секунд.',
  'Затримка з двома числами: середній час і розкид. 60 і 20 чекають від 40 до 80 секунд.',
  '带两个数字的延迟：中间时间和浮动范围。60 和 20 表示等待 40 到 80 秒。'));
R('ide.kit.p.' + id + '.w', 'It draws from the shared random numbers: safe in multiplayer only when every machine runs it.',
  'Берёт общее случайное число: в сетевой игре безопасно, только если это выполняют все машины.',
  'Бере спільне випадкове число: у мережевій грі безпечно, лише якщо це виконують усі машини.',
  '它使用共享随机数：只有在每台机器都执行时，多人游戏中才安全。');
F(id, 'centre', ['Middle time (seconds)', 'Среднее время (секунды)', 'Середній час (секунди)', '中间时间（秒）']);
F(id, 'spread', ['Spread (seconds)', 'Разброс (секунды)', 'Розкид (секунди)', '浮动范围（秒）'],
  ['The wait is the middle time plus or minus up to this.', 'Ожидание = среднее время плюс-минус до этого значения.',
    'Очікування = середній час плюс-мінус до цього значення.', '等待时间为中间时间加减不超过此值。']);

// 514
id = 'mi.pat.repeat_every_n_seconds_while_a_condi';
R('ide.kit.p.' + id, 'Repeat every N seconds while a condition holds', 'Повторять каждые N секунд, пока условие верно', 'Повторювати кожні N секунд, поки умова виконується', '条件成立时每 N 秒重复');
R('ide.kit.p.' + id + '.d', 'A trigger that acts, waits, then switches itself off so it can fire again. As long as the condition holds (here: a flag zone is held) it runs again every period. The game missions give points for a held flag this way.',
  'Триггер действует, ждёт и выключает сам себя, чтобы сработать снова. Пока условие верно (здесь: флажная зона удержана), он повторяется каждый период. Так миссии игры дают очки за удержанный флаг.',
  'Тригер діє, чекає й вимикає сам себе, щоб спрацювати знову. Поки умова виконується (тут: зону прапора утримано), він повторюється кожен період. Так місії гри дають очки за утримуваний прапор.',
  '触发器执行动作、等待，然后关闭自己以便再次触发。只要条件成立（此处：占领旗帜区域），它就每个周期重复一次。游戏自带任务就是这样为占领的旗帜加分的。');
R('ide.kit.p.' + id + '.w', 'The re-arm must be the last command. The next run starts 0 to 0.25 s later, so the real period is N plus up to 0.25 s.',
  'Перезапуск должен быть последней командой. Следующий запуск начнётся через 0–0,25 с, так что реальный период — N плюс до 0,25 с.',
  'Перезапуск має бути останньою командою. Наступний запуск почнеться через 0–0,25 с, тож реальний період — N плюс до 0,25 с.',
  '重新启用必须是最后一条命令。下一次运行在 0 到 0.25 秒后开始，所以实际周期是 N 加最多 0.25 秒。');
R('ide.kit.p.' + id + '.n', 'The zone must be declared in Helpers of the same file.',
  'Зона должна быть объявлена в Helpers того же файла.', 'Зону має бути оголошено в Helpers того ж файлу.',
  '该区域必须在同一文件的 Helpers 中声明。');
F(id, 'name', 'trig'); F(id, 'tag', 'tag'); F(id, 'zone', 'zone');
F(id, 'score', ['Points to add', 'Сколько очков добавить', 'Скільки очок додати', '增加的分数']);
F(id, 'period', 'period'); F(id, 'name_2', 'trig2');

// 515
id = 'mi.pat.repeat_forever';
R('ide.kit.p.' + id, 'Repeat forever', 'Повторять всегда', 'Повторювати завжди', '无限重复');
R('ide.kit.p.' + id + '.d', ...nt('A trigger with an empty condition that acts, waits and switches itself off, so it runs again every period until the mission ends.',
  'Триггер с пустым условием действует, ждёт и выключает себя, поэтому повторяется каждый период до конца миссии.',
  'Тригер із порожньою умовою діє, чекає й вимикає себе, тому повторюється кожен період до кінця місії.',
  '条件为空的触发器执行动作、等待并关闭自己，因此每个周期重复一次，直到任务结束。'));
F(id, 'name', 'trig'); F(id, 'text', 'text'); F(id, 'period', 'period'); F(id, 'name_2', 'trig2');

// 516
id = 'mi.pat.repeat_n_times';
R('ide.kit.p.' + id, 'Repeat N times', 'Повторить N раз', 'Повторити N разів', '重复 N 次');
R('ide.kit.p.' + id + '.d', 'Inside actions: a loop that runs its commands a fixed number of times.',
  'Внутри actions: цикл, который выполняет свои команды заданное число раз.',
  'Усередині actions: цикл, що виконує свої команди задану кількість разів.',
  '在 actions 内：把其中的命令执行固定次数的循环。');
R('ide.kit.p.' + id + '.w', 'The count is a fixed number; there is no endless loop, and 0 runs nothing.',
  'Число повторов фиксированное; бесконечного цикла нет, а 0 не выполняет ничего.',
  'Кількість повторів фіксована; нескінченного циклу немає, а 0 не виконує нічого.',
  '次数是固定数字；没有无限循环，0 表示什么都不执行。');
F(id, 'count', ['Times', 'Сколько раз', 'Скільки разів', '次数']); F(id, 'wait', 'wait'); F(id, 'text', 'text');

// 517
id = 'mi.pat.repeat_until_a_condition_is_false';
R('ide.kit.p.' + id, 'Repeat until a condition is false', 'Повторять, пока условие верно', 'Повторювати, поки умова виконується', '重复直到条件不成立');
R('ide.kit.p.' + id + '.d', 'Inside actions: a while loop that runs its commands again and again while its one condition is true (here: fewer than 6 living men with the tag).',
  'Внутри actions: цикл while повторяет команды, пока его единственное условие верно (здесь: живых бойцов с тегом меньше 6).',
  'Усередині actions: цикл while повторює команди, поки його єдина умова виконується (тут: живих бійців із тегом менше 6).',
  '在 actions 内：while 循环在其唯一条件成立时反复执行命令（此处：带该标签的存活士兵少于 6 人）。');
R('ide.kit.p.' + id + '.w', 'Keep a delay inside, or the loop may spin in one game step. while takes one condition only; there is no else.',
  'Держите внутри задержку, иначе цикл может крутиться в одном игровом шаге. while берёт только одно условие; else нет.',
  'Тримайте всередині затримку, інакше цикл може крутитися в одному ігровому кроці. while бере лише одну умову; else немає.',
  '循环内要保留延迟，否则可能在一个游戏步内空转。while 只接受一个条件；没有 else。');
F(id, 'tag', 'tag'); F(id, 'op', 'op');
F(id, 'value', ['Number of men', 'Число бойцов', 'Кількість бійців', '人数']); F(id, 'wait', 'wait'); F(id, 'text', 'text');

// 518
id = 'mi.pat.one_time_guard_with_a_done_event';
R('ide.kit.p.' + id, 'One-time guard with a done event', 'Защита от повтора через событие done', 'Захист від повтору через подію done', '用完成事件防止重复');
R('ide.kit.p.' + id + '.d', 'A trigger that fires when its go event is on and its done event is not, then sets done. So its actions run only once, even if it is re-armed.',
  'Триггер срабатывает, когда событие go включено, а done нет, и затем ставит done. Поэтому действия выполняются один раз, даже если триггер перезапустить.',
  'Тригер спрацьовує, коли подію go ввімкнено, а done ні, і потім ставить done. Тому дії виконуються один раз, навіть якщо тригер перезапустити.',
  '当 go 事件已设置而 done 事件未设置时触发，然后设置 done。因此即使被重新启用，其动作也只运行一次。');
R('ide.kit.p.' + id + '.w', 'A plain trigger already fires once; the guard matters when other triggers re-arm it or share the action.',
  'Обычный триггер и так срабатывает один раз; защита нужна, когда другие триггеры его перезапускают или делят действие.',
  'Звичайний тригер і так спрацьовує один раз; захист потрібен, коли інші тригери його перезапускають або ділять дію.',
  '普通触发器本来就只触发一次；当其他触发器会重新启用它或共用该动作时，这个保护才有用。');
R('ide.kit.p.' + id + '.n', 'Declare both events in Helpers of the same file.',
  'Объявите оба события в Helpers того же файла.', 'Оголосіть обидві події в Helpers того ж файлу.',
  '在同一文件的 Helpers 中声明这两个事件。');
F(id, 'name', 'trig'); F(id, 'go', ['Go event', 'Событие запуска', 'Подія запуску', '启动事件']);
F(id, 'done', ['Done event', 'Событие done', 'Подія done', '完成事件']);
F(id, 'done_2', ['Same done event', 'То же событие done', 'Та сама подія done', '同一完成事件']); F(id, 'text', 'text');

// 519
id = 'mi.pat.fire_every_time_a_condition_turns_tr';
R('ide.kit.p.' + id, 'Fire every time a condition turns true', 'Срабатывать каждый раз, когда условие становится верным', 'Спрацьовувати щоразу, коли умова стає істинною', '条件每次变为成立时触发');
R('ide.kit.p.' + id + '.d', ...nt('A trigger with autoreset: it fires each time its condition changes from false to true (here: units with the tag enter the zone).',
  'Триггер с autoreset срабатывает каждый раз, когда условие меняется с ложного на верное (здесь: юниты с тегом входят в зону).',
  'Тригер з autoreset спрацьовує щоразу, коли умова змінюється з хибної на істинну (тут: юніти з тегом входять у зону).',
  '带 autoreset 的触发器：条件每次由不成立变为成立时触发（此处：带标签的单位进入区域）。'));
R('ide.kit.p.' + id + '.w', 'Checked every 0.25 s. A long delay in its actions can overlap the next run. No game mission uses autoreset.',
  'Проверяется каждые 0,25 с. Долгая задержка в действиях может наложиться на следующий запуск. Ни одна миссия игры не использует autoreset.',
  'Перевіряється кожні 0,25 с. Довга затримка в діях може накластися на наступний запуск. Жодна місія гри не використовує autoreset.',
  '每 0.25 秒检查一次。动作中的长延迟可能与下一次运行重叠。游戏自带任务都没有使用 autoreset。');
R('ide.kit.p.' + id + '.n', 'The zone must be declared in Helpers of the same file.',
  'Зона должна быть объявлена в Helpers того же файла.', 'Зону має бути оголошено в Helpers того ж файлу.',
  '该区域必须在同一文件的 Helpers 中声明。');
F(id, 'name', 'trig'); F(id, 'zone', 'zone'); F(id, 'tag', 'tag'); F(id, 'sound', 'sound');

// 520
id = 'mi.pat.counter_that_fires_at_n';
R('ide.kit.p.' + id, 'Counter that fires at N', 'Счётчик, срабатывающий на N', 'Лічильник, що спрацьовує на N', '计数到 N 时触发');
R('ide.kit.p.' + id + '.d', 'Two triggers: each time the hit event is set, the first adds 1 to a variable, clears the event and re-arms itself. The second fires when the variable reaches the target.',
  'Два триггера: каждый раз, когда ставится событие hit, первый добавляет 1 к переменной, снимает событие и перезапускает себя. Второй срабатывает, когда переменная дойдёт до цели.',
  'Два тригери: щоразу, коли ставиться подія hit, перший додає 1 до змінної, знімає подію й перезапускає себе. Другий спрацьовує, коли змінна досягне мети.',
  '两个触发器：每次设置 hit 事件时，第一个给变量加 1、清除事件并重新启用自己。变量达到目标值时第二个触发。');
R('ide.kit.p.' + id + '.w', 'set_i ops are = + - * /. Compare ops are == != << <<= > >=; note << for less.',
  'Операции set_i: = + - * /. Сравнения: == != << <<= > >=; «меньше» пишется <<.',
  'Операції set_i: = + - * /. Порівняння: == != << <<= > >=; «менше» пишеться <<.',
  'set_i 的运算为 = + - * /。比较为 == != << <<= > >=；注意“小于”写作 <<。');
R('ide.kit.p.' + id + '.n', 'Declare {vars {"my_count"}} and {event "my_hit"} in Helpers of the same file. Raise my_hit (event command) wherever one should count.',
  'Объявите {vars {"my_count"}} и {event "my_hit"} в Helpers того же файла. Поднимайте my_hit (команда event) там, где нужно считать.',
  'Оголосіть {vars {"my_count"}} і {event "my_hit"} у Helpers того ж файлу. Піднімайте my_hit (команда event) там, де треба рахувати.',
  '在同一文件的 Helpers 中声明 {vars {"my_count"}} 和 {event "my_hit"}。在需要计数的地方用 event 命令触发 my_hit。');
F(id, 'add', ['Adding trigger name', 'Имя триггера-счётчика', "Ім'я тригера-лічильника", '计数触发器名']);
F(id, 'hit', ['Count event', 'Событие для счёта', 'Подія для рахунку', '计数事件']);
F(id, 'hit_2', 'event2'); F(id, 'var', 'var');
F(id, 'add_2', ['Same adding trigger', 'Тот же триггер-счётчик', 'Той самий тригер-лічильник', '同一计数触发器'], H.trig2);
F(id, 'reached', ['Goal trigger name', 'Имя триггера цели', "Ім'я тригера мети", '目标触发器名']);
F(id, 'var_2', 'var2', H.var); F(id, 'op', 'op');
F(id, 'target', ['Target number', 'Целевое число', 'Цільове число', '目标数值']); F(id, 'text', 'text');

// 521
id = 'mi.pat.compare_a_count_with_a_variable';
R('ide.kit.p.' + id, 'Compare a count with a variable', 'Сравнить число юнитов с переменной', 'Порівняти кількість юнітів зі змінною', '把单位数量与变量比较');
R('ide.kit.p.' + id + '.d', 'A condition term: true when the number of living men with the tag compares right with the value of a variable.',
  'Условие: верно, когда число живых бойцов с тегом верно сравнивается со значением переменной.',
  'Умова: істинна, коли кількість живих бійців із тегом правильно порівнюється зі значенням змінної.',
  '条件项：当带该标签的存活士兵数量与变量值的比较成立时为真。');
R('ide.kit.p.' + id + '.n', 'Declare the variable in {vars} in Helpers of the same file.',
  'Объявите переменную в {vars} в Helpers того же файла.', 'Оголосіть змінну в {vars} у Helpers того ж файлу.',
  '在同一文件 Helpers 的 {vars} 中声明该变量。');
F(id, 'n', 'n'); F(id, 'tag', 'tag'); F(id, 'op', 'op'); F(id, 'var', 'var');

// 522
id = 'mi.pat.stage_variable_drives_the_stages';
R('ide.kit.p.' + id, 'Stage variable drives the stages', 'Переменная этапа управляет этапами', 'Змінна етапу керує етапами', '用阶段变量驱动各阶段');
R('ide.kit.p.' + id + '.d', ...nt('One trigger per stage: it fires when the stage variable has its number, acts, then sets the variable to the next stage. Copy it for each stage.',
  'Один триггер на этап: срабатывает, когда переменная этапа равна его номеру, действует и ставит переменной следующий этап. Копируйте для каждого этапа.',
  'Один тригер на етап: спрацьовує, коли змінна етапу дорівнює його номеру, діє й ставить змінній наступний етап. Копіюйте для кожного етапу.',
  '每个阶段一个触发器：阶段变量等于其编号时触发，执行动作后把变量设为下一阶段。为每个阶段复制一份。'));
R('ide.kit.p.' + id + '.n', 'Declare {vars {"my_stage"}} in Helpers of the same file, and set it to 1 where the first stage should begin.',
  'Объявите {vars {"my_stage"}} в Helpers того же файла и поставьте 1 там, где должен начаться первый этап.',
  'Оголосіть {vars {"my_stage"}} у Helpers того ж файлу й поставте 1 там, де має початися перший етап.',
  '在同一文件的 Helpers 中声明 {vars {"my_stage"}}，并在第一阶段开始处把它设为 1。');
F(id, 'name', 'trig'); F(id, 'var', 'var');
F(id, 'stage', ['This stage', 'Этот этап', 'Цей етап', '本阶段']); F(id, 'text', 'text'); F(id, 'var_2', 'var2', H.var);
F(id, 'next', ['Next stage', 'Следующий этап', 'Наступний етап', '下一阶段']);

// 523
id = 'mi.pat.stages_chained_by_events';
R('ide.kit.p.' + id, 'Stages chained by events', 'Этапы, связанные событиями', "Етапи, пов'язані подіями", '用事件串联各阶段');
R('ide.kit.p.' + id + '.d', 'One trigger per stage: it fires when the event of the stage before is on, acts, then sets its own done event (here after 120 s) for the next stage.',
  'Один триггер на этап: срабатывает, когда включено событие прошлого этапа, действует и ставит своё событие done (здесь через 120 с) для следующего этапа.',
  'Один тригер на етап: спрацьовує, коли ввімкнено подію попереднього етапу, діє й ставить свою подію done (тут через 120 с) для наступного етапу.',
  '每个阶段一个触发器：上一阶段的事件生效时触发，执行动作后为下一阶段设置自己的完成事件（此处 120 秒后）。');
R('ide.kit.p.' + id + '.n', 'Declare both events in Helpers of the same file.',
  'Объявите оба события в Helpers того же файла.', 'Оголосіть обидві події в Helpers того ж файлу.',
  '在同一文件的 Helpers 中声明这两个事件。');
F(id, 'name', 'trig');
F(id, 'prev', ['Previous stage event', 'Событие прошлого этапа', 'Подія попереднього етапу', '上一阶段事件']); F(id, 'text', 'text');
F(id, 'done', ['This stage done event', 'Событие конца этапа', 'Подія кінця етапу', '本阶段完成事件']);
F(id, 'wait', ['Delay (seconds)', 'Задержка (секунды)', 'Затримка (секунди)', '延迟（秒）']);

// 524
id = 'mi.pat.all_of_several_conditions';
R('ide.kit.p.' + id, 'All of several conditions', 'Все из нескольких условий', 'Усі з кількох умов', '多个条件全部成立');
R('ide.kit.p.' + id + '.d', 'A condition block whose terms must all be true. Put it in a trigger in place of its condition.',
  'Блок condition, все условия которого должны быть верны. Вставьте в триггер вместо его condition.',
  'Блок condition, усі умови якого мають бути істинні. Вставте в тригер замість його condition.',
  '所有条件项都必须成立的 condition 块。放进触发器替换其 condition。');
R('ide.kit.p.' + id + '.n', 'Declare the events in Helpers of the same file.',
  'Объявите события в Helpers того же файла.', 'Оголосіть події в Helpers того ж файлу.', '在同一文件的 Helpers 中声明这些事件。');
F(id, 'a', 'evA'); F(id, 'b', 'evB');

// 525
id = 'mi.pat.any_of_several_conditions';
R('ide.kit.p.' + id, 'Any of several conditions', 'Любое из нескольких условий', 'Будь-яка з кількох умов', '多个条件任一成立');
R('ide.kit.p.' + id + '.d', 'A condition block with {type 1}: true when any one of its terms is true. Put it in a trigger in place of its condition.',
  'Блок condition с {type 1}: верен, когда верно любое из условий. Вставьте в триггер вместо его condition.',
  'Блок condition з {type 1}: істинний, коли істинна будь-яка з умов. Вставте в тригер замість його condition.',
  '带 {type 1} 的 condition 块：任一条件项成立即为真。放进触发器替换其 condition。');
R('ide.kit.p.' + id + '.n', 'Declare the events in Helpers of the same file.',
  'Объявите события в Helpers того же файла.', 'Оголосіть події в Helpers того ж файлу.', '在同一文件的 Helpers 中声明这些事件。');
F(id, 'a', 'evA'); F(id, 'b', 'evB');

// 526
id = 'mi.pat.custom_logic_with_not_and_brackets';
R('ide.kit.p.' + id, 'Custom logic with not and brackets', 'Своя логика с «не» и скобками', 'Своя логіка з «не» та дужками', '用“非”和括号自定义逻辑');
R('ide.kit.p.' + id + '.d', 'A condition block with an expression: the numbers are the terms, & is and, | is or, ! is not. Here: (a and b) or override.',
  'Блок condition с expression: числа — это условия, & — «и», | — «или», ! — «не». Здесь: (a и b) или override.',
  'Блок condition з expression: числа — це умови, & — «і», | — «або», ! — «не». Тут: (a і b) або override.',
  '带 expression 的 condition 块：数字代表条件项，& 为与，| 为或，! 为非。此处：(a 与 b) 或 override。');
R('ide.kit.p.' + id + '.w', 'Use only digits, spaces and ( ) ! & |: a tab or a word makes it never true. All operators have one rank and are read right to left, so use brackets. Every term is checked; there is no short cut.',
  'Только цифры, пробелы и ( ) ! & |: табуляция или слово делают его всегда ложным. У всех операций один приоритет, читаются справа налево, ставьте скобки. Проверяются все условия, сокращения нет.',
  'Лише цифри, пробіли та ( ) ! & |: табуляція або слово роблять його завжди хибним. Усі операції мають один пріоритет і читаються справа наліво, ставте дужки. Перевіряються всі умови, скорочення немає.',
  '只能用数字、空格和 ( ) ! & |：出现制表符或单词就永远不成立。所有运算符优先级相同，从右往左读，所以要加括号。每个条件项都会被检查，没有短路。');
R('ide.kit.p.' + id + '.n', 'Declare the events in Helpers of the same file.',
  'Объявите события в Helpers того же файла.', 'Оголосіть події в Helpers того ж файлу.', '在同一文件的 Helpers 中声明这些事件。');
F(id, 'expr', ['Logic expression', 'Логическое выражение', 'Логічний вираз', '逻辑表达式'],
  ['Term numbers joined by & (and), | (or), ! (not) and brackets.', 'Номера условий через & («и»), | («или»), ! («не») и скобки.',
    'Номери умов через & («і»), | («або»), ! («не») і дужки.', '用 &（与）、|（或）、!（非）和括号连接条件编号。']);
F(id, 'a', ['Event of term 1', 'Событие условия 1', 'Подія умови 1', '条件 1 的事件']);
F(id, 'b', ['Event of term 2', 'Событие условия 2', 'Подія умови 2', '条件 2 的事件']);
F(id, 'c', ['Event of term 3', 'Событие условия 3', 'Подія умови 3', '条件 3 的事件']);

// 527
id = 'mi.pat.switch_another_trigger_off_re_arm_it';
R('ide.kit.p.' + id, 'Switch another trigger off (re-arm it)', 'Выключить другой триггер (перезапустить)', 'Вимкнути інший тригер (перезапустити)', '关闭另一个触发器（重新启用）');
R('ide.kit.p.' + id + '.d', 'A command that switches a trigger off and resets its condition, so it can fire again the next time its condition is true.',
  'Команда выключает триггер и сбрасывает его условие, чтобы он мог сработать снова, когда условие станет верным.',
  'Команда вимикає тригер і скидає його умову, щоб він міг спрацювати знову, коли умова стане істинною.',
  '该命令关闭一个触发器并重置其条件，使它在条件再次成立时能再次触发。');
R('ide.kit.p.' + id + '.n', 'The trigger must exist in the same file.', 'Триггер должен быть в том же файле.', 'Тригер має бути в тому ж файлі.', '该触发器必须在同一文件中。');
F(id, 'trigger', 'trig');

// 528
id = 'mi.pat.only_while_another_trigger_is_on';
R('ide.kit.p.' + id, 'Only while another trigger is on', 'Только пока другой триггер включён', 'Лише поки інший тригер увімкнено', '仅当另一个触发器开启时');
R('ide.kit.p.' + id + '.d', 'A condition term: true while the named trigger is on (it has fired and was not switched off).',
  'Условие: верно, пока названный триггер включён (он сработал и не был выключен).',
  'Умова: істинна, поки названий тригер увімкнено (він спрацював і не був вимкнений).',
  '条件项：指定触发器处于开启状态时为真（它已触发且未被关闭）。');
R('ide.kit.p.' + id + '.n', 'The trigger must exist in the same file.', 'Триггер должен быть в том же файле.', 'Тригер має бути в тому ж файлі.', '该触发器必须在同一文件中。');
F(id, 'n', 'n'); F(id, 'trigger', 'trig');

// 529
id = 'mi.pat.helper_called_from_several_triggers';
R('ide.kit.p.' + id, 'Helper called from several triggers', 'Помощник, вызываемый из нескольких триггеров', 'Помічник, що викликається з кількох тригерів', '可被多个触发器调用的辅助触发器');
R('ide.kit.p.' + id + '.d', ...nt('A helper trigger whose condition is never true, so it runs only when called. The caller switches it off, then on, which runs its actions now. Copy the two trigger commands into any trigger that should call it.',
  'Триггер-помощник с никогда не верным условием, поэтому он работает только по вызову. Вызывающий выключает его, затем включает, и его действия выполняются сразу. Копируйте две команды trigger в любой триггер, который должен его вызвать.',
  'Тригер-помічник з ніколи не істинною умовою, тому він працює лише за викликом. Той, хто викликає, вимикає його, потім вмикає, і його дії виконуються одразу. Копіюйте дві команди trigger у будь-який тригер, що має його викликати.',
  '辅助触发器的条件永不成立，因此只在被调用时运行。调用者先关闭它再开启它，其动作立即执行。把这两条 trigger 命令复制到任何需要调用它的触发器中。'));
R('ide.kit.p.' + id + '.w', 'A helper that is already on does nothing when called, so keep the off line first. A {disabled} helper never runs.',
  'Уже включённый помощник при вызове ничего не делает, поэтому строка выключения идёт первой. Помощник с {disabled} не работает никогда.',
  'Уже ввімкнений помічник під час виклику нічого не робить, тому рядок вимкнення йде першим. Помічник із {disabled} не працює ніколи.',
  '已开启的辅助触发器被调用时不做任何事，所以要先放关闭那一行。带 {disabled} 的辅助触发器永远不会运行。');
R('ide.kit.p.' + id + '.n', 'Declare the call event ({event "my_call"}) in Helpers of the same file.',
  'Объявите событие вызова ({event "my_call"}) в Helpers того же файла.', 'Оголосіть подію виклику ({event "my_call"}) у Helpers того ж файлу.',
  '在同一文件的 Helpers 中声明调用事件（{event "my_call"}）。');
F(id, 'helper', ['Helper trigger name', 'Имя триггера-помощника', "Ім'я тригера-помічника", '辅助触发器名']); F(id, 'text', 'text');
F(id, 'caller', ['Calling trigger name', 'Имя вызывающего триггера', "Ім'я тригера, що викликає", '调用触发器名']);
F(id, 'event', ['Call event', 'Событие вызова', 'Подія виклику', '调用事件']);
F(id, 'helper_2', ['Same helper name', 'То же имя помощника', "Те саме ім'я помічника", '同一辅助触发器名']);
F(id, 'helper_3', ['Same helper name', 'То же имя помощника', "Те саме ім'я помічника", '同一辅助触发器名']);

// 530
id = 'mi.pat.helper_on_a_request_event';
R('ide.kit.p.' + id, 'Helper on a request event', 'Помощник по событию-запросу', 'Помічник за подією-запитом', '响应请求事件的辅助触发器');
R('ide.kit.p.' + id + '.d', 'A trigger that fires each time the request event is set: it clears the event, acts, then re-arms itself for the next request. The game missions call reinforcements this way.',
  'Триггер срабатывает каждый раз, когда ставится событие-запрос: снимает событие, действует и перезапускает себя для следующего запроса. Так миссии игры вызывают подкрепления.',
  'Тригер спрацьовує щоразу, коли ставиться подія-запит: знімає подію, діє й перезапускає себе для наступного запиту. Так місії гри викликають підкріплення.',
  '每次设置请求事件时触发：清除事件、执行动作，再重新启用自己以等待下一次请求。游戏自带任务就是这样呼叫增援的。');
R('ide.kit.p.' + id + '.n', 'Declare the event in Helpers of the same file, and raise it (event command) wherever the request is made.',
  'Объявите событие в Helpers того же файла и поднимайте его (команда event) там, где делается запрос.',
  'Оголосіть подію в Helpers того ж файлу й піднімайте її (команда event) там, де робиться запит.',
  '在同一文件的 Helpers 中声明该事件，并在发出请求的地方用 event 命令触发它。');
F(id, 'name', 'trig'); F(id, 'event', ['Request event', 'Событие-запрос', 'Подія-запит', '请求事件']);
F(id, 'event_2', 'event2'); F(id, 'text', 'text'); F(id, 'name_2', 'trig2');

// 531
id = 'mi.pat.timed_sequence';
R('ide.kit.p.' + id, 'Timed sequence', 'Последовательность по времени', 'Послідовність за часом', '定时序列');
R('ide.kit.p.' + id + '.d', 'Inside actions: a sound, then steps set one after another with waits between them. Other triggers can wait for each step event.',
  'Внутри actions: звук, затем шаги один за другим с паузами между ними. Другие триггеры могут ждать событие каждого шага.',
  'Усередині actions: звук, потім кроки один за одним із паузами між ними. Інші тригери можуть чекати подію кожного кроку.',
  '在 actions 内：先播放声音，然后依次设置各步骤，中间有等待。其他触发器可以等待每个步骤事件。');
R('ide.kit.p.' + id + '.n', 'Declare the step events in Helpers of the same file.',
  'Объявите события шагов в Helpers того же файла.', 'Оголосіть події кроків у Helpers того ж файлу.', '在同一文件的 Helpers 中声明各步骤事件。');
F(id, 'sound', 'sound'); F(id, 'wait', ['First wait (seconds)', 'Первая пауза (секунды)', 'Перша пауза (секунди)', '第一次等待（秒）']);
F(id, 'step2', ['Step 2 event', 'Событие шага 2', 'Подія кроку 2', '第 2 步事件']);
F(id, 'wait_2', ['Second wait (seconds)', 'Вторая пауза (секунды)', 'Друга пауза (секунди)', '第二次等待（秒）']);
F(id, 'step3', ['Step 3 event', 'Событие шага 3', 'Подія кроку 3', '第 3 步事件']);

// 532
id = 'mi.pat.run_a_branch_in_parallel';
R('ide.kit.p.' + id, 'Run a branch in parallel', 'Запустить ветку параллельно', 'Запустити гілку паралельно', '并行运行一个分支');
R('ide.kit.p.' + id + '.d', ...nt('Inside actions: a thread block meant to run its commands on the side while the actions go on.',
  'Внутри actions: блок thread, который должен выполнять свои команды сбоку, пока действия идут дальше.',
  'Усередині actions: блок thread, який має виконувати свої команди збоку, поки дії йдуть далі.',
  '在 actions 内：thread 块，用于在动作继续进行的同时另行执行其中的命令。'));
R('ide.kit.p.' + id + '.w', 'Assumed only: it is not known whether a delay inside holds up the rest. No game mission uses thread. Test it first.',
  'Это только предположение: неизвестно, задерживает ли пауза внутри остальное. Ни одна миссия игры не использует thread. Сначала проверьте.',
  'Це лише припущення: невідомо, чи затримує пауза всередині решту. Жодна місія гри не використовує thread. Спершу перевірте.',
  '这只是推测：尚不清楚其中的延迟是否会阻塞其余部分。游戏自带任务都没有用 thread。请先测试。');
F(id, 'wait', 'wait'); F(id, 'text', 'text');

// 533
id = 'mi.pat.units_enter_a_zone';
R('ide.kit.p.' + id, 'Units enter a zone', 'Юниты входят в зону', 'Юніти входять у зону', '单位进入区域');
R('ide.kit.p.' + id + '.d', 'A condition term: true when at least one living man with the tag is in the zone.',
  'Условие: верно, когда в зоне есть хотя бы один живой боец с тегом.',
  'Умова: істинна, коли в зоні є хоча б один живий боєць із тегом.',
  '条件项：区域内至少有一名带该标签的存活士兵时为真。');
R('ide.kit.p.' + id + '.n', 'The zone must be declared in Helpers of the same file, and units must carry the tag.',
  'Зона должна быть объявлена в Helpers того же файла, а юниты должны иметь тег.',
  'Зону має бути оголошено в Helpers того ж файлу, а юніти повинні мати тег.',
  '该区域必须在同一文件的 Helpers 中声明，单位必须带有该标签。');
F(id, 'n', 'n'); F(id, 'tag', 'tag'); F(id, 'zone', 'zone');

// 534
id = 'mi.pat.zone_is_empty_left_or_cleared';
R('ide.kit.p.' + id, 'Zone is empty (left or cleared)', 'Зона пуста (покинута или зачищена)', 'Зона порожня (покинута або зачищена)', '区域为空（已离开或已清除）');
R('ide.kit.p.' + id + '.d', 'A condition term: true when no living man of the player is in the zone.',
  'Условие: верно, когда в зоне нет ни одного живого бойца этого игрока.',
  'Умова: істинна, коли в зоні немає жодного живого бійця цього гравця.',
  '条件项：区域内没有该玩家的存活士兵时为真。');
R('ide.kit.p.' + id + '.n', 'The zone must be declared in Helpers of the same file.',
  'Зона должна быть объявлена в Helpers того же файла.', 'Зону має бути оголошено в Helpers того ж файлу.',
  '该区域必须在同一文件的 Helpers 中声明。');
F(id, 'n', 'n'); F(id, 'zone', 'zone');
F(id, 'player', ['Player number', 'Номер игрока', 'Номер гравця', '玩家编号'],
  ['The side whose men are counted; game missions use 1 for the enemy.', 'Сторона, чьи бойцы считаются; в миссиях игры 1 — враг.',
    'Сторона, чиї бійці рахуються; у місіях гри 1 — ворог.', '统计哪一方的士兵；游戏自带任务中 1 为敌方。']);

// 535
id = 'mi.pat.unit_near_another_unit_metres';
R('ide.kit.p.' + id, 'Unit near another unit (metres)', 'Юнит рядом с другим юнитом (метры)', 'Юніт поруч з іншим юнітом (метри)', '单位靠近另一单位（米）');
R('ide.kit.p.' + id + '.d', 'A condition term: true when a living man with the tag is within the distance of a unit with the target tag.',
  'Условие: верно, когда живой боец с тегом находится в пределах расстояния от юнита с целевым тегом.',
  'Умова: істинна, коли живий боєць із тегом перебуває в межах відстані від юніта з цільовим тегом.',
  '条件项：带该标签的存活士兵与带目标标签的单位距离在范围内时为真。');
R('ide.kit.p.' + id + '.w', 'The distance is in metres (20 game units each) and is measured between the edges of both units, not their centres.',
  'Расстояние в метрах (по 20 игровых единиц) и меряется между краями обоих юнитов, а не центрами.',
  'Відстань у метрах (по 20 ігрових одиниць) і міряється між краями обох юнітів, а не центрами.',
  '距离以米为单位（每米 20 个游戏单位），按两个单位的边缘而非中心计算。');
R('ide.kit.p.' + id + '.n', 'Units must carry both tags.', 'Юниты должны иметь оба тега.', 'Юніти повинні мати обидва теги.', '单位必须带有这两个标签。');
F(id, 'n', 'n'); F(id, 'tag', 'tag');
F(id, 'target', ['Target tag', 'Целевой тег', 'Цільовий тег', '目标标签']);
F(id, 'metres', ['Distance (metres)', 'Расстояние (метры)', 'Відстань (метри)', '距离（米）']);

module.exports = rows;

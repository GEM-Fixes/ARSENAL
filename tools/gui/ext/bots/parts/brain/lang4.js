// Bots part brain: round 4 texts, merged over lang.js, lang2.js and lang3.js by key.
// No-mod and no-game lines, tooltips that say why a button is greyed, the Guns texts in plain words (what happens in a match first, the
// engine's words in Details: g.<id>.det), per-game wording ({game} = the frame's one name for the game, kit.game), "Not yet tried in
// <game>" where a thing can work there (S15), the Details text that used to be English in the catalog, one word per thing in zh.
// Author: Imperator_Aug (ARSENAL, ia-00c45502)
'use strict';
const P = 'bots.brain.';
module.exports = [
  // no mod picked / no game folder (fallbacks of kit.needMod and kit.needGame, and the tooltip of the greyed buttons)
  [P + 'needMod', 'Pick a mod on the Mods page.', 'Выберите мод на странице «Моды».', 'Оберіть мод на сторінці «Моди».', '请在“模组”页面选择一个模组。'],
  [P + 'needGame', 'Set the game folder in Settings: the game\'s own values are read from it.', 'Укажите папку игры в Настройках: из неё читаются собственные значения игры.', 'Вкажіть теку гри в Налаштуваннях: із неї читаються власні значення гри.', '请在“设置”中填写游戏文件夹：游戏自带的数值从那里读取。'],
  [P + 'needGame.tip', 'Set the game folder in Settings first: without it the game\'s own values cannot be read.', 'Сначала укажите папку игры в Настройках: без неё собственные значения игры не прочитать.', 'Спершу вкажіть теку гри в Налаштуваннях: без неї власні значення гри не прочитати.', '请先在“设置”中填写游戏文件夹：否则无法读取游戏自带的数值。'],
  // the buttons: what each does, or why it is greyed
  [P + 'prev.tip', 'Shows what your changes do in a fight. Nothing is written.', 'Показывает, что ваши изменения меняют в бою. Ничего не записывается.', 'Показує, що ваші зміни змінюють у бою. Нічого не записується.', '显示你的更改在战斗中的效果。不会写入任何内容。'],
  [P + 'write.tip', 'Writes the previewed changes into your mod. "Undo" puts the files back.', 'Записывает показанные изменения в ваш мод. «Отменить» вернёт файлы.', 'Записує показані зміни у ваш мод. «Скасувати» поверне файли.', '把预览过的更改写入你的模组。“撤销”可恢复文件。'],
  [P + 'write.no', 'Greyed until you press "Preview": first see what will change.', 'Недоступно, пока вы не нажмёте «Предпросмотр»: сначала посмотрите, что изменится.', 'Недоступно, доки ви не натиснете «Попередній перегляд»: спершу подивіться, що зміниться.', '点击“预览”之前不可用：请先查看会有什么变化。'],
  [P + 'undo.no', 'Nothing to undo yet: Undo puts the files back after you write or reset something on this card.', 'Пока нечего отменять: «Отменить» возвращает файлы после записи или сброса на этой карточке.', 'Поки нічого скасовувати: «Скасувати» повертає файли після запису або скидання на цій картці.', '暂无可撤销的内容：在此卡片上写入或重置后，“撤销”可把文件恢复原样。'],
  [P + 'undone.w', 'your last write on this card', 'ваша последняя запись на этой карточке', 'ваш останній запис на цій картці', '你在此卡片上的上一次写入'],
  [P + 'undone', 'Undone: your last write on this card.', 'Отменено: ваша последняя запись на этой карточке.', 'Скасовано: ваш останній запис на цій картці.', '已撤销：你在此卡片上的上一次写入。'],
  // per-game wording: {game} = the frame's one name for the game
  [P + 'gohNote', '{game}: the same settings file. Only the settings checked against its engine are shown; the others are left out until they are checked.',
    '{game}: тот же файл настроек. Показаны только настройки, сверенные с её движком; остальные убраны, пока их не проверят.',
    '{game}: той самий файл налаштувань. Показано лише налаштування, звірені з її рушієм; інші прибрано, доки їх не перевірять.',
    '{game}：同一个设置文件。只显示已对照其引擎核实的设置；其他的在核实前不显示。'],
  [P + 'guns.goh', 'Not yet tried in {game}: the rows below find these values in its weapon files, but whether its engine uses them the same way was not checked.',
    'В {game} ещё не проверено: строки ниже находят эти значения в её файлах оружия, но использует ли её движок их так же, не проверялось.',
    'У {game} ще не перевірено: рядки нижче знаходять ці значення в її файлах зброї, але чи використовує її рушій їх так само, не перевірялося.',
    '尚未在 {game} 中试过：下面各行会在它的武器文件中找到这些数值，但它的引擎是否以同样方式使用它们还没有核实。'],
  [P + 'sight.goh', 'Not available in {game} on this card: its sight range is written in another form than in Assault Squad 2, so there is no number box here. You can change the one number in the file itself.',
    'Недоступно в {game} на этой карточке: дальность зрения там записана в другой форме, чем в Assault Squad 2, поэтому поля здесь нет. Это одно число можно изменить в самом файле.',
    'Недоступно в {game} на цій картці: дальність зору там записана в іншій формі, ніж в Assault Squad 2, тому поля тут немає. Це одне число можна змінити в самому файлі.',
    '在 {game} 中此卡片不可用：其视距的写法与 Assault Squad 2 不同，所以这里没有数字框。可以直接在文件中修改那个数字。'],
  [P + 'e.sight.goh', 'Not available in {game} on this card: its sight range is written in another form. Use "Open the file in the Editor".',
    'Недоступно в {game} на этой карточке: дальность зрения записана в другой форме. Нажмите «Открыть файл в Редакторе».',
    'Недоступно в {game} на цій картці: дальність зору записана в іншій формі. Натисніть «Відкрити файл у Редакторі».',
    '在 {game} 中此卡片不可用：其视距的写法不同。请点击“在编辑器中打开该文件”。'],
  // Guns: what happens in a match first; the engine's words in Details (g.<id>.det)
  [P + 'guns.lead', 'How exactly and how fast guns aim before they fire. These values sit in each weapon\'s own file, so there is no single number box: each row says in how many files the value is set, and Details lists them with a link that opens each one in the Editor.',
    'Насколько точно и быстро орудия целятся перед выстрелом. Эти значения лежат в файле каждого оружия, поэтому одного поля с числом нет: каждая строка говорит, в скольких файлах значение задано, а в «Подробности» они перечислены со ссылкой, которая открывает каждый в Редакторе.',
    'Наскільки точно і швидко гармати ціляться перед пострілом. Ці значення лежать у файлі кожної зброї, тому одного поля з числом немає: кожен рядок каже, у скількох файлах значення задано, а в «Подробиці» їх перелічено з посиланням, яке відкриває кожен у Редакторі.',
    '火炮开火前瞄准得多准、多快。这些数值写在每个武器自己的文件里，所以没有单独的数字框：每行显示有多少个文件设置了该数值，“详细信息”中列出它们，并附有在编辑器中逐个打开的链接。'],
  [P + 'g.aiming-tolerance.e', 'How far off target the gun may still point when it fires. A smaller number makes it wait for a better aim, so it shoots later but more exactly. When a weapon does not set it, the game uses 10 degrees.',
    'Насколько орудие может быть отклонено от цели в момент выстрела. Чем меньше число, тем дольше оно ждёт лучшего прицела: стреляет позже, но точнее. Если оружие его не задаёт, игра берёт 10 градусов.',
    'Наскільки гармата може бути відхилена від цілі в момент пострілу. Що менше число, то довше вона чекає кращого прицілу: стріляє пізніше, але точніше. Якщо зброя його не задає, гра бере 10 градусів.',
    '开火时炮口最多可以偏离目标多少。数字越小，越会等到瞄得更准：开火更晚，但更准。武器没有设置时，游戏使用 10 度。'],
  [P + 'g.aiming-tolerance.det', 'In degrees. The engine\'s own default is 10.', 'В градусах. Собственное значение движка по умолчанию - 10.', 'У градусах. Власне типове значення рушія - 10.', '单位为度。引擎自身的默认值是 10。'],
  [P + 'g.relaxation-time.e', 'How long the gun waits after it has aimed before it fires. A larger number means slower shots. When a weapon does not set it, the gun fires at once (0 seconds).',
    'Сколько оружие ждёт после прицеливания до выстрела. Чем больше число, тем медленнее выстрелы. Если оружие его не задаёт, оно стреляет сразу (0 секунд).',
    'Скільки зброя чекає після прицілювання до пострілу. Що більше число, то повільніші постріли. Якщо зброя його не задає, вона стріляє одразу (0 секунд).',
    '瞄准后等多久才开火。数字越大，射击越慢。武器没有设置时，瞄准后立即开火（0 秒）。'],
  [P + 'g.relaxation-time.det', 'In seconds: one number, or two numbers for a range the game picks from.', 'В секундах: одно число или два числа - диапазон, из которого выбирает игра.', 'У секундах: одне число або два числа - діапазон, з якого вибирає гра.', '单位为秒：一个数，或两个数表示一个由游戏从中选取的范围。'],
  [P + 'g.spread-tolerance.e', 'A vehicle on the move holds its fire until its gun is steady enough. A larger number makes it wait for a steadier gun, so it shoots less while driving. When a weapon does not set it (0), a moving vehicle fires without waiting.',
    'Техника в движении не стреляет, пока её орудие не станет достаточно устойчивым. Чем больше число, тем дольше она ждёт устойчивости и тем меньше стреляет на ходу. Если оружие его не задаёт (0), техника на ходу стреляет не дожидаясь.',
    'Техніка в русі не стріляє, доки її гармата не стане достатньо стійкою. Що більше число, то довше вона чекає стійкості й то менше стріляє на ходу. Якщо зброя його не задає (0), техніка на ходу стріляє не чекаючи.',
    '行进中的车辆要等炮足够稳定才开火。数字越大，越要等炮更稳，行进间开火就越少。武器没有设置时（0），行进中的车辆不等待直接开火。'],
  [P + 'g.spread-tolerance.det', 'The engine compares this number with the gun\'s accuracy-by-motion value and holds fire while that value is lower.', 'Движок сравнивает это число со значением точности орудия в движении и не стреляет, пока оно ниже.', 'Рушій порівнює це число зі значенням точності гармати в русі й не стріляє, доки воно нижче.', '引擎把这个数与火炮的运动精度值比较，该值较低时不开火。'],
  [P + 'g.prepare-time.e', 'How long a sniper rifle or a flare gun needs before it fires. Artillery guns never use it. When a weapon does not set it, there is no wait (0 seconds).',
    'Сколько снайперской винтовке или ракетнице нужно до выстрела. Артиллерийские орудия его не используют. Если оружие его не задаёт, ожидания нет (0 секунд).',
    'Скільки снайперській гвинтівці чи ракетниці потрібно до пострілу. Артилерійські гармати його не використовують. Якщо зброя його не задає, очікування немає (0 секунд).',
    '狙击步枪或信号枪开火前需要多久。火炮从不使用它。武器没有设置时无需等待（0 秒）。'],
  [P + 'g.prepare-time.det', 'In seconds. The engine reads it in the weapon\'s special block.', 'В секундах. Движок читает его в блоке special оружия.', 'У секундах. Рушій читає його в блоці special зброї.', '单位为秒。引擎在武器的 special 块中读取它。'],
  [P + 'g.burst.det', 'Two numbers in the weapon file: the short burst, then the long one.', 'Два числа в файле оружия: короткая очередь, затем длинная.', 'Два числа у файлі зброї: коротка черга, потім довга.', '武器文件中的两个数：先是短连射，然后是长连射。'],
  // the Details text of a sight setting (it used to be English inside the catalog)
  [P + 'sight.keyX', 'times the radius multiplier', 'умножить на множитель радиуса', 'помножити на множник радіуса', '乘以半径倍数'],
  // one word per thing: the frame's words for a bot match
  [P + 'next.match', 'Try a bot match', 'Пробный матч с ботами', 'Пробний матч із ботами', '试玩人机对战'],
];

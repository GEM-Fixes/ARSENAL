// Bots part targets: round 4 texts, merged over lang.js, lang2.js and lang3.js by key.
// No-mod and no-game lines, tooltips that say why a button is greyed, the leads in plain words (what happens in a match first), the
// game's value beside each range box, the empty-search line, per-game wording ({game} = the frame's one name for the game, kit.game),
// the Gates of Hell line of the attack-waves symptom, and one word per thing in ru/uk/zh.
// Author: Imperator_Aug (ARSENAL, ia-c2e8d330)
'use strict';
const P = 'bots.targets.';
module.exports = [
  // no mod picked / no game folder (fallbacks of kit.needMod and kit.needGame, and the tooltips of the greyed buttons)
  [P + 'needMod', 'Pick a mod on the Mods page.', 'Выберите мод на странице «Моды».', 'Оберіть мод на сторінці «Моди».', '请在“模组”页面选择一个模组。'],
  [P + 'needMod.tip', 'Pick a mod on the Mods page first: the settings are read from your mod and written only into it.', 'Сначала выберите мод на странице «Моды»: настройки читаются из вашего мода и записываются только в него.', 'Спершу оберіть мод на сторінці «Моди»: налаштування читаються з вашого мода й записуються лише в нього.', '请先在“模组”页面选择一个模组：设置从你的模组读取，也只写入你的模组。'],
  [P + 'needGame', 'Set the game folder in Settings: the game\'s own target rules are read from it.', 'Укажите папку игры в Настройках: из неё читаются собственные правила целей игры.', 'Вкажіть теку гри в Налаштуваннях: із неї читаються власні правила цілей гри.', '请在“设置”中填写游戏文件夹：游戏自带的目标规则从那里读取。'],
  [P + 'needGame.tip', 'Set the game folder in Settings first: without it the game\'s own rules cannot be read.', 'Сначала укажите папку игры в Настройках: без неё собственные правила игры не прочитать.', 'Спершу вкажіть теку гри в Налаштуваннях: без неї власні правила гри не прочитати.', '请先在“设置”中填写游戏文件夹：否则无法读取游戏自带的规则。'],
  // an empty search
  [P + 'none', 'Nothing found. Try {hint}.', 'Ничего не найдено. Попробуйте {hint}.', 'Нічого не знайдено. Спробуйте {hint}.', '没有找到。请试试{hint}。'],
  [P + 'sym.noneHint', 'another word, for example tank, retreat or artillery', 'другое слово, например танк, отступление или артиллерия', 'інше слово, наприклад танк, відступ або артилерія', '其他词，例如坦克、撤退或火炮'],
  // the buttons: what each does, or why it is greyed
  [P + 'prev.tip', 'Shows what your changes do in a fight. Nothing is written.', 'Показывает, что ваши изменения меняют в бою. Ничего не записывается.', 'Показує, що ваші зміни змінюють у бою. Нічого не записується.', '显示你的更改在战斗中的效果。不会写入任何内容。'],
  [P + 'prev.no', 'Nothing to preview yet: press a fix or change a rule first.', 'Пока нечего показывать: сначала нажмите исправление или измените правило.', 'Поки нічого показувати: спершу натисніть виправлення або змініть правило.', '暂无可预览的内容：请先点击一个修复或修改一条规则。'],
  [P + 'write.tip', 'Writes the previewed changes into your mod. "Undo" puts the file back.', 'Записывает показанные изменения в ваш мод. «Отменить» вернёт файл.', 'Записує показані зміни у ваш мод. «Скасувати» поверне файл.', '把预览过的更改写入你的模组。“撤销”可恢复文件。'],
  [P + 'write.no', 'Greyed until you press "Preview": first see what will change.', 'Недоступно, пока вы не нажмёте «Предпросмотр»: сначала посмотрите, что изменится.', 'Недоступно, доки ви не натиснете «Попередній перегляд»: спершу подивіться, що зміниться.', '点击“预览”之前不可用：请先查看会有什么变化。'],
  [P + 'pend.drop', 'Drop these changes', 'Убрать эти изменения', 'Прибрати ці зміни', '放弃这些更改'],
  [P + 'pend.drop.tip', 'Takes back the changes that are not written yet. Your mod stays as it is.', 'Убирает изменения, которые ещё не записаны. Ваш мод остаётся как есть.', 'Прибирає зміни, які ще не записано. Ваш мод лишається як є.', '放弃尚未写入的更改。你的模组保持不变。'],
  [P + 'pend.none', 'No changes yet. Press a fix or change a rule: "Preview" shows it here first, and nothing is written until you press "Write into my mod".', 'Изменений пока нет. Нажмите исправление или измените правило: «Предпросмотр» сначала покажет его здесь, и ничего не записывается, пока вы не нажмёте «Записать в мой мод».', 'Змін поки немає. Натисніть виправлення або змініть правило: «Попередній перегляд» спершу покаже його тут, і нічого не записується, доки ви не натиснете «Записати в мій мод».', '还没有更改。点击一个修复或修改一条规则：“预览”会先把它显示在这里，在你点击“写入我的模组”之前不会写入任何内容。'],
  // Undo: one meaning
  [P + 'undo.no', 'Nothing to undo yet: Undo puts this file back after you write or reset it.', 'Пока нечего отменять: «Отменить» возвращает этот файл после записи или сброса.', 'Поки нічого скасовувати: «Скасувати» повертає цей файл після запису або скидання.', '暂无可撤销的内容：写入或重置此文件后，“撤销”可把它恢复原样。'],
  [P + 'undone.w', 'your last write to this file', 'ваша последняя запись в этот файл', 'ваш останній запис у цей файл', '你对此文件的上一次写入'],
  [P + 'undone', 'Undone: your last write to this file.', 'Отменено: ваша последняя запись в этот файл.', 'Скасовано: ваш останній запис у цей файл.', '已撤销：你对此文件的上一次写入。'],
  // the leads: what happens in a match, in plain words
  [P + 'sel.lead', 'Which enemy a unit shoots at first. Each kind of shooter has a list of target groups: the top group is its first choice, the next one comes when no such target is around. An enemy that is in no group is never attacked.',
    'В какого врага юнит стреляет первым. У каждого вида стрелков свой список групп целей: верхняя группа - первый выбор, следующая идёт в ход, когда таких целей рядом нет. Врага, которого нет ни в одной группе, не атакуют никогда.',
    'У якого ворога юніт стріляє першим. Кожен вид стрільців має свій список груп цілей: верхня група - перший вибір, наступна йде в хід, коли таких цілей поруч немає. Ворога, якого немає в жодній групі, не атакують ніколи.',
    '单位先打哪个敌人。每种射手都有一份目标组列表：最上面的组是首选，附近没有这类目标时才轮到下一组。不在任何组里的敌人永远不会被攻击。'],
  [P + 'ammo.lead', 'Which shell or bullet a unit fires at each kind of target. It goes down this list and fires the first ammo it carries, so rules higher up are preferred. Ammo that is not in the list is never fired at that target.',
    'Каким снарядом или пулей юнит стреляет по каждому виду цели. Он идёт по списку сверху вниз и стреляет первым боеприпасом, который у него есть, поэтому верхние правила предпочтительнее. Боеприпасом, которого нет в списке, по этой цели не стреляют никогда.',
    'Яким снарядом чи кулею юніт стріляє по кожному виду цілі. Він іде списком згори донизу й стріляє першим боєприпасом, який має, тому верхні правила бажаніші. Боєприпасом, якого немає у списку, по цій цілі не стріляють ніколи.',
    '单位对每种目标发射哪种炮弹或子弹。它从上到下查看此列表，发射第一种自己携带的弹药，所以越靠上的规则越优先。列表中没有的弹药永远不会用于该目标。'],
  // a range box: the game's value and the allowed range
  [P + 'range.game', 'In the game: {v} m.', 'В игре: {v} м.', 'У грі: {v} м.', '游戏原值：{v} 米。'],
  [P + 'range.hint', 'Allowed: above 0, up to 10000 m.', 'Допустимо: больше 0, до 10000 м.', 'Дозволено: більше 0, до 10000 м.', '允许范围：大于 0，最多 10000 米。'],
  [P + 'add.rangeHint', '(empty = any distance; else above 0, up to 10000 m)', '(пусто = любое расстояние; иначе больше 0, до 10000 м)', '(порожньо = будь-яка відстань; інакше більше 0, до 10000 м)', '（留空 = 任意距离；否则大于 0，最多 10000 米）'],
  // per-game wording: {game} = the frame's one name for the game
  [P + 'goh', '{game}: the same rules, read from its own files with its own target kinds (light, medium and heavy tanks). Not yet tried in {game}.',
    '{game}: те же правила, читаются из её файлов с её видами целей (лёгкие, средние и тяжёлые танки). В {game} ещё не проверено.',
    '{game}: ті самі правила, читаються з її файлів з її видами цілей (легкі, середні й важкі танки). У {game} ще не перевірено.',
    '{game}：相同的规则，从它自己的文件读取，目标种类也是它自己的（轻型、中型和重型坦克）。尚未在 {game} 中试过。'],
  [P + 'goh.mg', '{game}: soldiers weigh only rocket launchers against vehicles, so a bullet rule against tanks may only make vehicle machine guns fire.',
    '{game}: пехота против техники учитывает только гранатомёты, поэтому правило пуль против танков может заставить стрелять только пулемёты техники.',
    '{game}: піхота проти техніки враховує лише гранатомети, тому правило куль проти танків може змусити стріляти лише кулемети техніки.',
    '{game}：士兵对付车辆只考虑火箭筒，所以针对坦克的子弹规则可能只会让车载机枪开火。'],
  [P + 'sym.noGoh.w', 'its sight range is written in another form, so this page has no number box for it', 'дальность зрения там записана в другой форме, поэтому на этой странице для неё нет поля с числом', 'дальність зору там записано в іншій формі, тому на цій сторінці для неї немає поля з числом', '它的视距以另一种形式写成，所以此页面没有对应的数字框'],
  [P + 'sym.noGoh', 'Not available in {game}: its sight range is written in another form, so this page has no number box for it.', 'Недоступно в {game}: дальность зрения там записана в другой форме, поэтому на этой странице для неё нет поля с числом.', 'Недоступно в {game}: дальність зору там записано в іншій формі, тому на цій сторінці для неї немає поля з числом.', '在 {game} 中不可用：它的视距以另一种形式写成，所以此页面没有对应的数字框。'],
  [P + 'sym.offName', '{s} (not available in {game})', '{s} (недоступно в {game})', '{s} (недоступно в {game})', '{s}（在 {game} 中不可用）'],
  // attack waves on Gates of Hell: the habits card is not available there, the difficulty card is
  [P + 'sym.waves.gohLink', 'Bot attack waves are weak? In {game} how much a bot can buy is set on the Bots page, card "Bot difficulty".', 'Атаки ботов слабые? В {game} то, сколько бот может купить, задаётся на странице «Боты», карточка «Сложность ботов».', 'Атаки ботів слабкі? У {game} те, скільки бот може купити, задається на сторінці «Боти», картка «Складність ботів».', '机器人的进攻波次太弱？在 {game} 中，机器人能买多少在“机器人”页面的“机器人难度”卡片中设置。'],
  [P + 'sym.link.goGoh', 'Open Bot difficulty', 'Открыть «Сложность ботов»', 'Відкрити «Складність ботів»', '打开“机器人难度”'],
  // a file that cannot be read: named as the page names it (the file name sits in Details)
  [P + 'e.fileP', '{what} could not be read. Open the file in the Editor to look at it, or press "Reset to the game\'s values" to use the game\'s file again.', '{what} не удалось прочитать. Откройте файл в Редакторе, чтобы посмотреть его, или нажмите «Вернуть значения игры», чтобы снова использовать файл игры.', '{what} не вдалося прочитати. Відкрийте файл у Редакторі, щоб переглянути його, або натисніть «Повернути значення гри», щоб знову використовувати файл гри.', '{what}无法读取。请在编辑器中打开该文件查看，或点击“恢复游戏原值”重新使用游戏的文件。'],
  [P + 'f.ammo', 'The ammo rules', 'Правила боеприпасов', 'Правила боєприпасів', '弹药规则'],
  [P + 'f.sel', 'One of the shooter lists', 'Один из списков стрелков', 'Один зі списків стрільців', '其中一份射手列表'],
  // one word per thing: the frame's words for Details and for a bot match
  [P + 'details', 'Details', 'Подробности', 'Подробиці', '详细信息'],
  [P + 'next.match', 'Try a bot match', 'Пробный матч с ботами', 'Пробний матч із ботами', '试玩人机对战'],
];

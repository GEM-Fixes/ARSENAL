// ide fixes strings: [key, en, ru, uk, zh]. Labels of tools/ide/intel/fixes.js fixes ({slots} filled from label.p) + the fix menu words.
// Author: Imperator_Aug (ARSENAL, ia-0e62d388)
module.exports = [
  ['ide.f.change', 'Change "{from}" to "{to}"', 'Заменить "{from}" на "{to}"', 'Замінити "{from}" на "{to}"', '将 "{from}" 改为 "{to}"'],
  ['ide.f.quote', 'Put {v} in quotes', 'Взять {v} в кавычки', 'Взяти {v} у лапки', '给 {v} 加上引号'],
  ['ide.f.join', 'Join the tags into one string: "{to}"', 'Собрать теги в одну строку: "{to}"', 'Зібрати теги в один рядок: "{to}"', '把标签合并成一个字符串："{to}"'],
  ['ide.f.closeQuote', 'Add the missing quote', 'Добавить недостающую кавычку', 'Додати пропущену лапку', '补上缺少的引号'],
  ['ide.f.dropBrace', 'Delete this stray brace', 'Удалить лишнюю скобку', 'Видалити зайву дужку', '删除这个多余的括号'],
  ['ide.f.point', 'Point to {to}', 'Указать на {to}', 'Вказати на {to}', '改为指向 {to}'],
  ['ide.f.include', 'Add (include "{to}") at the top for {name}', 'Добавить (include "{to}") в начало файла для {name}', 'Додати (include "{to}") на початок файлу для {name}', '在文件开头加上 (include "{to}")，用于 {name}'],
  ['ide.f.asread', 'Write {to} instead of {from} (the game already uses {to})', 'Написать {to} вместо {from} (игра и так берёт {to})', 'Написати {to} замість {from} (гра й так бере {to})', '把 {from} 改为 {to}（游戏本来就按 {to} 读取）'],
  ['ide.f.multi', 'Fix in a patch mod', 'Исправить в патч-моде', 'Виправити в патч-моді', '在补丁模组中修复'],
  ['ide.f.multiTip', 'This fix changes more than one line or file. The Fix tool makes it in a separate patch mod.', 'Это исправление меняет больше одной строки или файла. Инструмент Fix делает его в отдельном патч-моде.', 'Це виправлення змінює більше одного рядка або файлу. Інструмент Fix робить його в окремому патч-моді.', '这个修复会改动不止一行或一个文件。修复工具会在单独的补丁模组中完成它。'],
  ['ide.f.safe', 'Safe: the game reads it the same way', 'Безопасно: игра прочитает это так же', 'Безпечно: гра прочитає це так само', '安全：游戏读取的结果不变'],
  ['ide.f.review', 'Check after: the game will now read this line', 'Проверьте после: теперь игра будет читать эту строку', 'Перевірте після: тепер гра читатиме цей рядок', '修复后请检查：游戏现在会读取这一行'],
  ['ide.f.none', 'No quick fix for this line', 'Для этой строки нет быстрого исправления', 'Для цього рядка немає швидкого виправлення', '这一行没有快速修复'],
  ['ide.f.undo', 'Ctrl+Z undoes the fix', 'Ctrl+Z отменяет исправление', 'Ctrl+Z скасовує виправлення', '按 Ctrl+Z 可撤销修复'],
];

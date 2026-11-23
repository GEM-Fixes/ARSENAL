// view kind hex, strings: rows [key, en, ru, uk, zh], every key starts with view.hex.
// Author: Imperator_Aug (ARSENAL, ia-d5adf2fa)
'use strict';
module.exports = [
  // JOBS: the name of this viewer's requests in the footer job list
  ['view.hex.job.read', 'Viewer: reading the bytes of the file', 'Просмотр: читаются байты файла', 'Перегляд: читаються байти файлу', '查看器：正在读取文件字节'],
  ['view.hex.label', 'Bytes', 'Байты', 'Байти', '字节'],
  ['view.hex.dump', 'Bytes of the file: arrows move, Page Up/Down jump a screen, Ctrl+Home/End go to the start or the end', 'Байты файла: стрелки двигают, Page Up/Down — на экран, Ctrl+Home/End — в начало или конец', 'Байти файлу: стрілки рухають, Page Up/Down — на екран, Ctrl+Home/End — на початок або в кінець', '文件字节：方向键移动，Page Up/Down 翻一屏，Ctrl+Home/End 到开头或结尾'],
  ['view.hex.goto', 'Go to byte', 'Перейти к байту', 'Перейти до байта', '跳到字节'],
  ['view.hex.gotoPh', '0x1F00 or 7936', '0x1F00 или 7936', '0x1F00 або 7936', '0x1F00 或 7936'],
  ['view.hex.go', 'Go', 'Перейти', 'Перейти', '跳转'],
  ['view.hex.find', 'Find', 'Найти', 'Знайти', '查找'],
  ['view.hex.fText', 'text', 'текст', 'текст', '文本'],
  ['view.hex.fHex', 'bytes', 'байты', 'байти', '字节'],
  ['view.hex.findPh', 'EPLY or 45 50 4C 59', 'EPLY или 45 50 4C 59', 'EPLY або 45 50 4C 59', 'EPLY 或 45 50 4C 59'],
  ['view.hex.next', 'Find next', 'Найти далее', 'Знайти далі', '查找下一个'],
  ['view.hex.badOff', 'Type a byte number: 0x1F00 (hex) or 7936.', 'Введите номер байта: 0x1F00 (hex) или 7936.', 'Введіть номер байта: 0x1F00 (hex) або 7936.', '请输入字节位置：0x1F00（十六进制）或 7936。'],
  ['view.hex.pastEnd', 'The file has only {n} bytes.', 'В файле всего {n} байт.', 'У файлі лише {n} байтів.', '文件只有 {n} 字节。'],
  ['view.hex.badHex', 'Bytes are typed as pairs: 45 50 4C 59.', 'Байты вводятся парами: 45 50 4C 59.', 'Байти вводяться парами: 45 50 4C 59.', '字节按两位一组输入：45 50 4C 59。'],
  ['view.hex.searching', 'Looking... {p}% of the file', 'Ищу... {p}% файла', 'Шукаю... {p}% файлу', '正在查找……已查 {p}%'],
  ['view.hex.found', 'Found at byte {o}.', 'Найдено в байте {o}.', 'Знайдено в байті {o}.', '在字节 {o} 处找到。'],
  ['view.hex.notFound', 'Not found after this point.', 'Дальше не найдено.', 'Далі не знайдено.', '此位置之后未找到。'],
  ['view.hex.empty', 'The file is empty.', 'Файл пуст.', 'Файл порожній.', '文件为空。'],
  ['view.hex.read', 'Byte {o} ({d})   8-bit {u8} ({i8})   16-bit {u16} ({i16})   32-bit {u32} ({i32})   float {f32}', 'Байт {o} ({d})   8 бит {u8} ({i8})   16 бит {u16} ({i16})   32 бит {u32} ({i32})   float {f32}', 'Байт {o} ({d})   8 біт {u8} ({i8})   16 біт {u16} ({i16})   32 біт {u32} ({i32})   float {f32}', '字节 {o}（{d}）   8 位 {u8}（{i8}）   16 位 {u16}（{i16}）   32 位 {u32}（{i32}）   浮点 {f32}'],
  ['view.hex.readTip', 'Numbers read from the cursor, low byte first (as the game stores them); signed values in brackets.', 'Числа от курсора, младший байт первым (как хранит игра); со знаком — в скобках.', 'Числа від курсора, молодший байт першим (як зберігає гра); зі знаком — у дужках.', '从光标处读取的数值，低字节在前（游戏的存储方式）；括号内为有符号值。'],
  ['view.hex.readOnly', 'Read only: bytes are shown, never changed.', 'Только чтение: байты показываются, но не меняются.', 'Лише читання: байти показуються, але не змінюються.', '只读：只显示字节，不会修改。'],
  ['view.hex.pageFail', 'Bytes at {o} could not be read: {m}', 'Не удалось прочитать байты с {o}: {m}', 'Не вдалося прочитати байти з {o}: {m}', '无法读取 {o} 处的字节：{m}'],
];

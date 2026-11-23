// view kind map, strings: rows [key, en, ru, uk, zh], every key starts with view.map. (UTF-8 text, as the other lang files)
// Author: Imperator_Aug (ARSENAL, ia-6b22d4d5)
'use strict';
module.exports = [
  ['view.map.label', 'Map', 'Карта', 'Мапа', '地图'],
  ['view.map.grsT', 'Grass of this map ({name})', 'Трава этой карты ({name})', 'Трава цієї мапи ({name})', '这张地图的草（{name}）'],
  ['view.map.grass', '{n} grass patterns, in the order the file numbers them:', 'Узоров травы: {n}, в том порядке, в каком их нумерует файл:', 'Візерунків трави: {n}, у тому порядку, в якому їх нумерує файл:', '{n} 种草的样式，按文件里的编号顺序：'],
  ['view.map.grsBad', 'The start of this file is not the usual grass header (GRAS PMAP).', 'Начало файла не похоже на обычный заголовок травы (GRAS PMAP).', 'Початок файлу не схожий на звичайний заголовок трави (GRAS PMAP).', '这个文件的开头不是常见的草文件头（GRAS PMAP）。'],
  ['view.map.plyT', 'Ground mesh of this map ({name})', 'Сетка земли этой карты ({name})', 'Сітка землі цієї мапи ({name})', '这张地图的地面网格（{name}）'],
  ['view.map.plyL', 'The shape of the ground. The picture above is drawn from the map\'s files.', 'Форма земли. Картинка выше нарисована по файлам карты.', 'Форма землі. Малюнок вище намальовано за файлами мапи.', '地面的形状。上面的图是根据地图文件画的。'],
  ['view.map.netT', 'Land grid of this map ({name})', 'Сетка местности этой карты ({name})', 'Сітка місцевості цієї мапи ({name})', '这张地图的地形网格（{name}）'],
  ['view.map.netL', 'The land cells of the map, read by the game together with the ground mesh. The picture above is drawn from the map\'s files.', 'Клетки местности карты: игра читает их вместе с сеткой земли. Картинка выше нарисована по файлам карты.', 'Клітинки місцевості мапи: гра читає їх разом із сіткою землі. Малюнок вище намальовано за файлами мапи.', '地图的地形格子，游戏和地面网格一起读取。上面的图是根据地图文件画的。'],
  ['view.map.fileT', 'Opened from the file {name}', 'Открыто из файла {name}', 'Відкрито з файлу {name}', '从文件 {name} 打开'],
  ['view.map.viewer', 'Opened the map {map} in the Map Viewer ({name}).', 'Карта {map} открыта в «Просмотре карт» ({name}).', 'Мапу {map} відкрито в «Перегляді мап» ({name}).', '已在地图查看器中打开地图 {map}（{name}）。'],
  ['view.map.none', '{name} is not inside a map folder.', '{name} лежит не в папке карты.', '{name} лежить не в теці мапи.', '{name} 不在地图文件夹里。'],
  ['view.map.toViewer', 'Opened {key} in the Map Viewer.', 'Карта {key} открыта в просмотре карт.', 'Мапу {key} відкрито в перегляді мап.', '已在地图查看器中打开 {key}。'],
  ['view.map.noViewer', 'The Map Viewer is not available here, so this map cannot be shown.', 'Просмотр карт здесь недоступен, поэтому эту карту показать нельзя.', 'Перегляд мап тут недоступний, тому цю мапу показати не можна.', '这里无法使用地图查看器，所以无法显示这张地图。'],
];

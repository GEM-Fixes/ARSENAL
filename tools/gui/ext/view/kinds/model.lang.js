// view kind model, strings: rows [key, en, ru, uk, zh], every key starts with view.model.
// Author: Imperator_Aug (ARSENAL, ia-b8faf7ea)
'use strict';
module.exports = [
  // JOBS: the name of this viewer's requests in the footer job list
  ['view.model.job.read', 'Viewer: looking for the model of the file', 'Просмотр: ищется модель, к которой относится файл', 'Перегляд: шукається модель, до якої належить файл', '查看器：正在查找该文件所属的模型'],
  ['view.model.label', 'Model', 'Модель', 'Модель', '模型'],
  ['view.model.none', 'No model in this folder or the folders above uses {name}.', 'Ни одна модель в этой папке и в папках выше не использует {name}.', 'Жодна модель у цій теці й у теках вище не використовує {name}.', '这个文件夹和上级文件夹里没有模型使用 {name}。'],
  ['view.model.noPage', 'The Models page is not open here. It is under Models & Sim > Models when the game is AS64.', 'Страницы «Модели» здесь нет. Она есть в Модели и симуляция > Модели, когда выбрана игра AS64.', 'Сторінки «Моделі» тут немає. Вона є в Моделі та симуляція > Моделі, коли вибрано гру AS64.', '这里没有“模型”页面。在 AS64 游戏下，它位于“模型与模拟 > 模型”。'],
  ['view.model.notHere', 'The Models page is not part of {g}, so this file is not shown on a model here.', 'Страницы «Модели» нет в {g}, поэтому этот файл здесь не показывается на модели.', 'Сторінки «Моделі» немає в {g}, тому цей файл тут не показується на моделі.', '{g} 中没有“模型”页面，所以这里不能在模型上显示这个文件。'],
  ['view.model.loose', 'No model names {name}. Showing {mdl}, the model of its folder.', 'Ни одна модель не называет {name}. Показана {mdl}, модель его папки.', 'Жодна модель не називає {name}. Показано {mdl}, модель його теки.', '没有模型引用 {name}。现在显示 {mdl}，它所在文件夹的模型。'],
  ['view.model.many', '{n} models use this file. Showing {mdl}.', 'Этот файл используют моделей: {n}. Показана {mdl}.', 'Цей файл використовують моделей: {n}. Показано {mdl}.', '有 {n} 个模型使用这个文件。现在显示 {mdl}。'],
  ['view.model.modpak', 'That model is inside a mod\'s pak. The Models page shows the game\'s copy, if there is one.', 'Эта модель лежит внутри pak мода. Страница «Модели» показывает копию из игры, если она есть.', 'Ця модель лежить усередині pak моду. Сторінка «Моделі» показує копію з гри, якщо вона є.', '这个模型在某个模组的 pak 里。“模型”页面显示游戏里的那一份（如果有）。'],
  ['view.model.fail', 'Could not find the model: {m}', 'Не удалось найти модель: {m}', 'Не вдалося знайти модель: {m}', '找不到模型：{m}'],
  ['view.model.act', 'Show in Models', 'Показать в «Моделях»', 'Показати в «Моделях»', '在“模型”中显示'],
  ['view.model.actTip', 'Open this model on the Models page: 3D view, meshes, volumes, animations. Nothing is copied into your mod.', 'Открыть эту модель на странице «Модели»: 3D-вид, сетки, объёмы, анимации. В мод ничего не копируется.', 'Відкрити цю модель на сторінці «Моделі»: 3D-вигляд, сітки, об\'єми, анімації. У мод нічого не копіюється.', '在“模型”页面打开这个模型：3D 视图、网格、碰撞体、动画。不会复制任何东西到你的模组。'],
];

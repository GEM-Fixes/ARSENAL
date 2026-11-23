// GUI ext mapai: strings as rows [key, en, ru, uk, zh] (the Map scripts for AI page). The group titles and leads (bots.g.*) are in ext/bots/lang.js.
// Author: Imperator_Aug (ARSENAL, ia-df857078)
const ROWS = [
['mapai.nav', 'Map scripts for AI', 'Скрипты карт для ИИ', 'Скрипти карт для ШІ', 'AI地图脚本'],
['mapai.h1', 'Map scripts for AI', 'Скрипты карт для ИИ', 'Скрипти карт для ШІ', 'AI地图脚本'],
['mapai.lead', 'Orders the bot cannot give itself (extra units, attack, hold), written into one map. Changes go into your mod only.', 'Приказы, которые бот сам отдать не может (подкрепления, атака, удержание), записанные в одну карту. Изменения пишутся только в ваш мод.', 'Накази, які бот сам віддати не може (підкріплення, атака, утримання), записані в одну карту. Зміни пишуться лише у ваш мод.', '机器人自己无法下达的命令（增援、进攻、坚守），写入某一张地图。更改只写入你的模组。'],
['mapai.nobots', 'This page is drawn by the Bots page code, which did not load. Restart ARSENAL; if this stays, report it.', 'Эту страницу рисует код страницы Боты, который не загрузился. Перезапустите ARSENAL; если не поможет, сообщите об этом.', 'Цю сторінку малює код сторінки Боти, який не завантажився. Перезапустіть ARSENAL; якщо не допоможе, повідомте про це.', '此页面由“机器人”页面的代码绘制，但该代码未能加载。请重启 ARSENAL；如果仍然如此，请报告此问题。'],
['mapai.task.extra', 'Give the bot extra units at a set minute on one map', 'Дать боту подкрепления в нужную минуту на одной карте', 'Дати боту підкріплення в потрібну хвилину на одній карті', '在某张地图的指定分钟给机器人增援'],
['mapai.task.send', 'Send the bot\'s units to attack or hold a place', 'Отправить юнитов бота в атаку или на удержание места', 'Надіслати юнітів бота в атаку або на утримання місця', '派机器人的单位进攻或坚守某处'],
['mapai.task.teams', 'See which side each bot plays on a map', 'Посмотреть, за какую сторону играет каждый бот на карте', 'Подивитися, за яку сторону грає кожен бот на карті', '查看某张地图上每个机器人属于哪一方'],
];
const lang = { en: {}, ru: {}, uk: {}, zh: {} };
for (const r of ROWS) { lang.en[r[0]] = r[1]; lang.ru[r[0]] = r[2]; lang.uk[r[0]] = r[3]; lang.zh[r[0]] = r[4]; }
module.exports = lang;

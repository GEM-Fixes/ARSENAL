// GUI ext unitai: strings as rows [key, en, ru, uk, zh] (the Unit AI page). The group titles and leads (bots.g.*) are in ext/bots/lang.js.
// Author: Imperator_Aug (ARSENAL, ia-67637c90)
const ROWS = [
['unitai.nav', 'Unit AI', 'ИИ юнитов', 'ШІ юнітів', '单位AI'],
['unitai.h1', 'Unit AI', 'ИИ юнитов', 'ШІ юнітів', '单位AI'],
['unitai.lead', 'How soldiers, crews and guns spot, aim and pick targets once they are on the map, for every AI unit, single-player enemies too. Changes go into your mod only.', 'Как солдаты, экипажи и орудия на карте замечают врага, целятся и выбирают цели - у всех юнитов под управлением ИИ, и у врагов в одиночной игре. Изменения пишутся только в ваш мод.', 'Як солдати, екіпажі та гармати на карті помічають ворога, цілять і обирають цілі - у всіх юнітів під керуванням ШІ, і у ворогів в одиночній грі. Зміни пишуться лише у ваш мод.', '士兵、乘员和火炮上场后如何发现敌人、瞄准和选择目标，适用于所有 AI 单位，包括单人游戏的敌人。更改只写入你的模组。'],
['unitai.nobots', 'This page is drawn by the Bots page code, which did not load. Restart ARSENAL; if this stays, report it.', 'Эту страницу рисует код страницы Боты, который не загрузился. Перезапустите ARSENAL; если не поможет, сообщите об этом.', 'Цю сторінку малює код сторінки Боти, який не завантажився. Перезапустіть ARSENAL; якщо не допоможе, повідомте про це.', '此页面由“机器人”页面的代码绘制，但该代码未能加载。请重启 ARSENAL；如果仍然如此，请报告此问题。'],
['unitai.task.h', 'Something looks wrong?', 'Что-то выглядит не так?', 'Щось виглядає не так?', '哪里看起来不对？'],
['unitai.task.spot', 'Soldiers spot enemies from too far away (or too close)', 'Солдаты замечают врага слишком издалека (или слишком поздно)', 'Солдати помічають ворога надто здалека (або надто пізно)', '士兵发现敌人的距离太远（或太近）'],
['unitai.task.flee', 'Soldiers run away too soon, or never', 'Солдаты слишком рано отступают или не отступают никогда', 'Солдати надто рано відступають або не відступають ніколи', '士兵撤退太早，或从不撤退'],
['unitai.task.rocket', 'Rocket launcher men ignore infantry', 'Гранатомётчики не стреляют по пехоте', 'Гранатометники не стріляють по піхоті', '火箭筒兵不打步兵'],
['unitai.task.targets', 'Another unit ignores a target or shoots the wrong one', 'Другой юнит не стреляет по цели или стреляет не по той', 'Інший юніт не стріляє по цілі або стріляє не по тій', '其他单位无视目标或打错目标'],
['unitai.task.shell', 'Guns fire the wrong kind of shell', 'Орудия стреляют не тем снарядом', 'Гармати стріляють не тим снарядом', '火炮使用了错误的弹种'],
['unitai.task.aim', 'Units aim too well or too badly', 'Юниты целятся слишком метко или слишком плохо', 'Юніти цілять надто влучно або надто погано', '单位瞄准太准或太差'],
];
const lang = { en: {}, ru: {}, uk: {}, zh: {} };
for (const r of ROWS) { lang.en[r[0]] = r[1]; lang.ru[r[0]] = r[2]; lang.uk[r[0]] = r[3]; lang.zh[r[0]] = r[4]; }
module.exports = lang;

// Bots part brain (group D, How units fight): "How soldiers and crews behave" - the AI settings of properties/human.ext the engine reads
// (catalog.json), for every computer-controlled soldier: courage and movement (brain Properties and consts), seeing and remembering
// (Sensor), and where the gun aiming keys sit (read only). Server work in brainfile.js; texts in lang.js; browser card in client.js.
// Routes (the frame adds mod and game): GET brain/values, POST brain/edit {changes:{id:value}, write}, POST brain/reset {ids?, write},
// GET brain/guns. A write or reset replies undo: [{rel, id}] for the frame's one Undo (POST /api/x/bots/undo, lib.undo).
// Sight range (sight.js): set/vision/vision.set + vision_generic.inc, AS2 forms; the values reply carries it as sight.
// Author: Imperator_Aug (ARSENAL, ia-ca3ae0b6)
'use strict';
const lib = require('../../lib');
const B = require('./brainfile');

const q = (url, k) => (url && url.searchParams && url.searchParams.get(k)) || '';
const modOf = (ctx, url, body) => lib.checkMod(ctx, (body && body.mod) || q(url, 'mod'));

module.exports = {
  id: 'brain',
  group: 'D',
  order: 10,
  routes: {
    'GET /api/x/bots/brain/values': async (url, body, ctx) => B.values(ctx, modOf(ctx, url, body)),
    'POST /api/x/bots/brain/edit': async (url, body, ctx) => { body = body || {}; const mod = modOf(ctx, url, body); if (body.write) lib.checkWrite(ctx, mod); return B.edit(ctx, mod, body.changes || {}, !!body.write); },
    'POST /api/x/bots/brain/reset': async (url, body, ctx) => { body = body || {}; const mod = modOf(ctx, url, body); if (body.write) lib.checkWrite(ctx, mod); return B.reset(ctx, mod, Array.isArray(body.ids) ? body.ids : null, !!body.write); },
    'GET /api/x/bots/brain/guns': async (url, body, ctx) => B.guns(ctx, modOf(ctx, url, body)),
  },
  lang: require('./lang'),
  script: require('./client'),
};

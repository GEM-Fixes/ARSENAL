// milint game branch test: one made-up mod folder, linted as GoH (--exe goh), as AS64 and as MoW:AS2 (exe mowas_2).
// GoH rows: GHMIS-54 bot commands, GHMIS-51 bot events, GHMAP-16 map.net v2 only, GHMAP-03 zoneId, GHMIS-29/30/32/33 vocabulary,
// modweb mission/goh-script-command-fields (gone fields), goh-condition-terms-vars (and/or words, @ vars). Exits 1 on a difference.
// Author: Imperator_Aug (ARSENAL, ia-6b08e4c7)
const fs = require('fs'), path = require('path');
const { check } = require('../milint');
const W = process.env.TEST_WORK || fs.mkdtempSync(path.join(require('os').tmpdir(), 'milint-goh-'));
const root = path.join(W, 'gohfix', 'mod'), R = 'resource/';
fs.rmSync(path.join(W, 'gohfix'), { recursive: true, force: true });
const put = (rel, data) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Array.isArray(data) ? data.join('\r\n') + '\r\n' : data); };
const cstr = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s, 'latin1')]);
const table = (tag, list) => Buffer.concat([Buffer.from(tag), Buffer.from([list.length]), ...list.flatMap(([i, n]) => [Buffer.from([i]), cstr(n)])]);
function net(o) {
  const head = Buffer.alloc(14); head[0] = 10; head[1] = o.ver; head.writeInt16LE(o.w, 2); head.writeInt16LE(o.h, 4);
  const parts = [head];
  if (o.ver >= 2) parts.push(table('MAP0', o.types), table('MAP1', o.mats), Buffer.from('GRID'));
  for (const [h, t, m] of o.cells || []) { const c = Buffer.alloc(4); c.writeInt16LE(h, 0); c[2] = t; c[3] = m; parts.push(c); }
  return Buffer.concat(parts);
}

put(R + 'set/multiplayer/games/battle_zones.set', [';SDL', '{game', '\t{class battle_zones}', '}']);
put(R + 'script/multiplayer/modes/mymode.lua', [
  'local n = BotApi.Commands:Income(1)',                    // 1 known everywhere
  'BotApi.Commands:SeekAndDestroy(squad)',                   // 2 GoH command; as64: WARN_MIS_BOT_ORDER
  'if BotApi.Commands:EnemyHasTanks() then end',             // 3 gone in GoH: WARN_MIS_BOT_ORDER (GHMIS-54)
  'BotApi.Events:Subscribe(4, OnQuant)',                     // 4 GoH: WARN_MIS_BOT_EVENT_NUMBER
  'BotApi.Events:Subscribe(BotApi.Events.Waypoint, OnWp)',   // 5 GoH event
  'BotApi.Events:Subscribe(BotApi.Events.Bogus, OnX)',       // 6 GoH: WARN_MIS_BOT_EVENT_UNKNOWN
]);
const M = R + 'map/multi/gm1/';
put(M + 'map', [';SDL', '{map', '\t{Entity "bush" 0x77', '\t\t{Position 1 2}', '\t}', '}']);
put(M + 'map.net', net({ ver: 1, w: 1, h: 1, cells: [[5, 1, 1]] }));     // GoH: MAP_NET_FORMAT (GHMAP-16); AS2 reads v1
put(M + 'battle_zones.info', [';SDL', '{game', '\t{maxPlayers 2}', '}']);
put(M + 'zz.info', [';SDL', '{game', '\t{maxPlayers 3}', '}']);   // line 3: GoH MAP_PLAYERS (odd, rounded up to 4); AS2 reads map.info only
put(M + 'battle_zones.mi', [
  ';SDL',
  '{mission',
  '\t{Entity "flag_point_1" 0x10',
  '\t\t{Position 0 0}',
  '\t\t{Extender "map_point" {name c1} {zone {radius 0} {zoneId "f1"}} {team a} {order 1}}',
  '\t}',
  '\t{Entity "flag_point_2" 0x11',
  '\t\t{Position 5 5}',
  '\t\t{Extender "map_point" {name c2} {zone {radius 0} {zoneId "f9"}} {team b} {order 1}}',   // line 9: GoH WARN_MI_ZONEID_REF
  '\t}',
  '\t{Helpers',
  '\t\t{zone "poly" {Name "f1"} {Point 0 0} {Point 10 0} {Point 0 10}}',
  '\t\t{triggers',
  '\t\t\t{"t1"',
  '\t\t\t\t{condition {terms {"1.altitude" {altitude {op greater} {value 5}}} {"2.rand" {}}} {expression "1 and 2"}}',   // 15: GoH term + and-word; as64 MI_TERM_UNKNOWN + MI_COND_EXPR
  '\t\t\t\t{actions',
  '\t\t\t\t\t{benchmark {profile 0}}',                       // 17: GoH command; as64 MI_CMD_UNKNOWN
  '\t\t\t\t\t{autoassign {nearest}}',                        // 18: GoH WARN_MI_KEY_GONE
  '\t\t\t\t\t{"trigger" {name "t_nowhere"}}',                // 19: the mission's own undefined name: WARN_MI_TRIGGER_REF on every game
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t}',
  '\t\t(include "../shared.inc")',                           // 23: names only some maps define: GoH skips names inside a shared include
  '\t}',
  '}',
]);
put(R + 'map/multi/shared.inc', ['{triggers', '\t{"t2"', '\t\t{actions', '\t\t\t{"trigger" {name "lane_c"}}', '\t\t}', '\t}', '}']);   // AS2: line 4 WARN_MI_TRIGGER_REF
// a known vanilla GoH site (known-vanilla-goh.txt: this file, WARN_MI_TASK_REF, "undefined") is info under GoH; another undefined name in it is reported
const S = R + 'map/single/04-usa/1944_12_hotton/';
put(S + '0.mi', [
  ';SDL',
  '{mission',
  '\t{Helpers',
  '\t\t{tasks {"t_ok"}}',
  '\t\t{triggers',
  '\t\t\t{"s1"',
  '\t\t\t\t{actions',
  '\t\t\t\t\t{"task" {name "undefined"} {state done}}',    // 8: known vanilla GoH site: info under GoH
  '\t\t\t\t\t{"task" {name "my_missing"} {state done}}',   // 9: WARN_MI_TASK_REF
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t}',
  '\t}',
  '}',
]);

const run = exe => {
  const rep = check({ folder: root, exe });
  return rep.toJSON().findings.map(x => `${x.file.replace(/\\/g, '/')}:${x.line} ${x.code}`).sort();
};
const want = {
  goh: [
    'resource/map/multi/gm1/zz.info:3 MAP_PLAYERS',
    'resource/map/multi/gm1/battle_zones.mi:19 WARN_MI_TRIGGER_REF',
    'resource/map/single/04-usa/1944_12_hotton/0.mi:9 WARN_MI_TASK_REF',
    'resource/map/multi/gm1/battle_zones.mi:18 WARN_MI_KEY_GONE',
    'resource/map/multi/gm1/battle_zones.mi:9 WARN_MI_ZONEID_REF',
    'resource/map/multi/gm1/map.net:0 MAP_NET_FORMAT',
    'resource/script/multiplayer/modes/mymode.lua:3 WARN_MIS_BOT_ORDER',
    'resource/script/multiplayer/modes/mymode.lua:4 WARN_MIS_BOT_EVENT_NUMBER',
    'resource/script/multiplayer/modes/mymode.lua:6 WARN_MIS_BOT_EVENT_UNKNOWN',
  ],
  as2: [
    'resource/map/multi/gm1/battle_zones.mi:15 MI_COND_EXPR',
    'resource/map/multi/gm1/battle_zones.mi:15 MI_TERM_UNKNOWN',
    'resource/map/multi/gm1/battle_zones.mi:17 MI_CMD_UNKNOWN',
    'resource/map/multi/gm1/battle_zones.mi:19 WARN_MI_TRIGGER_REF',
    'resource/map/multi/gm1/battle_zones.mi:4 WARN_MI_TRIGGER_REF',   // AS2: the include's line, cited against the mission (as before)
    'resource/map/single/04-usa/1944_12_hotton/0.mi:8 WARN_MI_TASK_REF',
    'resource/map/single/04-usa/1944_12_hotton/0.mi:9 WARN_MI_TASK_REF',
    'resource/script/multiplayer/modes/mymode.lua:2 WARN_MIS_BOT_ORDER',
  ],
};
let bad = 0;
for (const [exe, w] of [['goh', want.goh], ['as64', want.as2], ['mowas_2', want.as2], [undefined, want.as2]]) {
  const got = run(exe), ws = [...w].sort();
  const miss = ws.filter(x => !got.includes(x)), extra = got.filter(x => !ws.includes(x));
  if (miss.length || extra.length) { bad++; console.log(`FAIL exe ${exe}: missing ${JSON.stringify(miss)} extra ${JSON.stringify(extra)}`); }
  else console.log(`ok exe ${exe}: ${got.length} findings`);
}
// GoH: the known vanilla site is an info line, not dropped
{
  const inf = check({ folder: root, exe: 'goh' }).toJSON().info.map(x => `${x.file.replace(/\\/g, '/')}:${x.line} ${x.code} ${x.msg}`);
  if (!inf.some(l => /hotton\/0\.mi:8 WARN_MI_TASK_REF .*known vanilla defect/.test(l))) { bad++; console.log('FAIL known vanilla GoH site must be info: ' + inf.join(' | ')); }
  else console.log('ok known vanilla GoH site is info');
}
// CLI: a bad --exe is refused with exit 2
const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'milint.js'), root, '--exe', 'bogus'], { encoding: 'utf8' });
if (r.status !== 2) { bad++; console.log('FAIL --exe bogus exit ' + r.status); } else console.log('ok --exe bogus refused');
process.exit(bad ? 1 : 0);

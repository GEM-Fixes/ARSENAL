// armorsim/ingame test: shottable plan -> fake game.log -> compare on a synthetic unit tree (temp dir; no game data).
//   node test.js [scratchDir]      last line PASS on success
// Author: Imperator_Aug (ARSENAL, ia-0520822f)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const st = require('../shottable');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }

const base = process.argv[2] || process.env.ARMORSIM_SCRATCH || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, 'armorsim-ingame-'));
const game = path.join(dir, 'game'), out = path.join(dir, 'table');
const W = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
W(game, 'mowas_2.exe', 'MZ');
W(game, 'resource/entity/vehicle/tk/tk.def', `{game_entity
	{props "steel tank"}
	{component "body"}
	{component "turret"}
	{volume "body" {thickness 30}}
	{volume "turret" {thickness 40}}
	{Extension "tk.mdl"}
}
`);
W(game, 'resource/entity/vehicle/tk/tk.mdl', `{Skeleton
	{bone "basis"
		{bone "body"
			{bone "turret"
				{Position 0 0 40}
			}
		}
	}
}
{Volume "body"
	{Box 100 60 40}
	{Bone "body"}
	{Position 0 0 20}
}
{Volume "turret"
	{Box 40 40 20}
	{Bone "turret"}
	{Position 0 0 10}
}
`);
W(game, 'resource/set/material.set', `{materials
	{"steel"
		{ricochet {chance {0 0}}}
		{steelEquivalent 1}
		{durability {pierce 1} {blast 1}}
		{damage {radius 0.5}}
		{wound {calibre 20}}
	}
}
`);
W(game, 'resource/set/interaction_entity/entity.set', `{entities
	{"tank"
		{on pierce
			{if volume "body"
				{components "body" destroy}
				{if rand 0.5 {components "turret" break}}
			}
		}
		{on bullet_hit
			{tags add "marked"}
		}
	}
}
`);
const shells = path.join(dir, 'shells.json');
fs.writeFileSync(shells, JSON.stringify([
  { weapon: 'gunA', ammo: 'strong', calibre: 75, table: [[0, 100], [5000, 100]], tags: ['shell_medium', 'ap'] },
  { weapon: 'gunB', ammo: 'weak', calibre: 20, table: [[0, 5], [5000, 5]], tags: ['ap'] }]));

// ---------- plan (CLI) ----------
const cli = path.join(__dirname, '..', 'shottable.js');
const run = args => cp.spawnSync(process.execPath, [cli].concat(args), { encoding: 'utf8' });
let r = run(['plan', 'tk', '--game', game, '--shells', shells, '--range', '100', '--faces', 'front,rear', '--aim', 'body,nosuch', '--samples', '50', '--out', out]);
ok('plan exit 0', r.status === 0, r.stderr);
const T = JSON.parse(fs.readFileSync(path.join(out, 'table.json'), 'utf8'));
const md = fs.readFileSync(path.join(out, 'table.md'), 'utf8');
ok('4 rows (2 shells x 2 faces x 1 aim)', T.rows.length === 4, T.rows.length);
ok('missing aim volume named', T.missingAims.join() === 'nosuch', T.missingAims);
ok('rows carry markers and first volume', T.rows.every((x, i) => x.marker === 'shot_' + (i + 1) && x.firstVolume === 'body'), T.rows.map(x => x.firstVolume));
const strong = T.rows[0].predicted, weak = T.rows[2].predicted;
ok('strong shell: bullet_hit then pierce on body', strong.required.slice(0, 2).map(e => e.event + ':' + e.volume).join() === 'bullet_hit:body,pierce:body', strong.required);
ok('strong shell: body destroyed certain, turret broken by chance', strong.parts.some(p => p.part === 'body' && p.states.destroyed === 1) && strong.parts.some(p => p.part === 'turret' && p.chance > 0.2 && p.chance < 0.8), strong.parts);
ok('weak shell: only bullet_hit', weak.required.map(e => e.event).join() === 'bullet_hit' && weak.parts.length === 0, weak.required);
ok('tag predicted', strong.tags.some(t => t.tag === 'marked' && t.op === 'add' && t.chance === 1), strong.tags);
ok('steps in the md: console lines, marker, compare command', /dbg_interactionEvent 1/.test(md) && /dbg_interactionEventInfo 1/.test(md) && /shot_1/.test(md) && /shottable\.js compare/.test(md));
ok('plan usage error without --range', run(['plan', 'tk', '--game', game, '--shells', shells, '--out', out]).status === 2);

// ---------- hand-written log: the formats of README.md ----------
const hand = [
  'Phase Loading', '> dbg_interactionEvent 1', '> shot_1', "atom not found : 'shot_1'",
  'EVENT: bullet_hit', 'Info entity: "tk"', '  Position: 1 2 3', '  Bullet: bullet75 ap', '  Effector: "pz"', '  Volume: body', '  Data: 0 (0)',
  'EVENT: pierce', 'Info entity: "tk" [frozen]', '  Volume: body', '  Name: pierce',
  'EVENT: on_break_custom', 'some junk line', 'EVENT: break', 'Info entity: "tk"', '  Component: body', '  Data: 2.5 (1075838976)', '  Bogus: x'];
const P = st.parseLog(hand.join('\r\n') + '\r\n');
const e0 = P.shots[0].events;
ok('markers found, one shot id 1', P.markers && P.shots.length === 1 && P.shots[0].id === 1, P.shots.map(s => s.id));
ok('event fields read', e0[0].entity === 'tk' && e0[0].volume === 'body' && e0[0].effector === 'pz' && e0[0].bullet === 'bullet75 ap' && e0[0].value === 0, e0[0]);
ok('frozen and sender', e0[1].frozen === true && e0[1].sender === 'pierce', e0[1]);
ok('break part and value', e0[3].event === 'break' && e0[3].part === 'body' && e0[3].value === 2.5, e0[3]);
ok('unknown lines counted (Phase, junk, Bogus field)', P.counts.unknown === 3 && P.counts.unknownInShots === 2 && P.counts.console === 2 && P.counts.markers === 1, P.counts);

// ---------- round trip: a log made from the table, with one planted difference and junk ----------
const evLines = e => ['EVENT: ' + e.event, 'Info entity: "tk"'].concat(e.volume ? ['  Volume: ' + e.volume] : [], e.part ? ['  Component: ' + e.part] : [], e.sender ? ['  Name: ' + e.sender] : [], ['  Data: 1 (1065353216)']);
function shotLines(row, plant) {
  const P2 = row.predicted, ev = P2.required.map(e => Object.assign({}, e));
  const broke = {};
  for (const e of ev) if (e.event === 'break') broke[e.part] = (broke[e.part] || 0) + 1;
  for (const p of P2.parts) if (p.chance >= 0.99) { const want = p.states.destroyed >= 0.99 ? 2 : 1; for (let i = broke[p.part] || 0; i < want; i++) ev.push({ event: 'break', part: p.part }); }
  if (plant) plant(ev);
  return ['> shot_' + row.id, "atom not found : 'shot_" + row.id + "'"].concat(...ev.map(evLines));
}
const junk = ['[00:00:01] Phase Mounting', 'ERROR_MSG something else', '', 'Mods loaded:'];
const plantRow = 3;   // the weak shell from the rear: the game also says pierce + body broken
const log1 = junk.concat(
  ...T.rows.map(row => shotLines(row, row.id === plantRow ? ev => ev.push({ event: 'pierce', volume: 'body' }) : null)),
  ['GUI: junk after'], shotLines(T.rows[0]).slice(0, 0)).join('\r\n');
fs.writeFileSync(path.join(dir, 'game.log'), log1);
r = run(['compare', out, '--log', path.join(dir, 'game.log')]);
ok('compare exit 0', r.status === 0, r.stderr);
const C = JSON.parse(fs.readFileSync(path.join(out, 'compare.json'), 'utf8'));
const cmd = fs.readFileSync(path.join(out, 'compare.md'), 'utf8');
ok('split by markers', C.split === 'markers', C.split);
ok('honest rows same', C.rows.filter(x => x.row !== plantRow).every(x => x.verdict === 'same'), C.rows.map(x => [x.row, x.verdict, x.diffs]));
const pr = C.rows.find(x => x.row === plantRow);
ok('planted row differs: pierce seen, not predicted', pr.verdict === 'differs' && pr.diffs.some(d => /pierce\[body\] seen, not predicted/.test(d.what)), pr.diffs);
ok('planted row points at pen test and rules 27, 28', pr.rules.includes(27) && pr.rules.includes(28) && C.rules['27'].join() === String(plantRow), [pr.rules, C.rules]);
ok('junk lines counted, not read', C.counts.unknown === 5 && C.counts.unknownInShots === 1, C.counts);
ok('compare md names the difference and the rules', /differs/.test(cmd) && /rule 28: rows 3/.test(cmd));

// a dropped certain event, a wrong volume, order mode (no markers), a row not fired
const rowA = T.rows[0];
const noMarks = shotLines(rowA, ev => { ev[0].volume = 'turret'; ev.splice(ev.findIndex(e => e.event === 'break'), 2); }).slice(2);
const C2 = st.compare(T, st.parseLog(['junk'].concat(noMarks).join('\n')));
const a1 = C2.rows[0];
ok('order mode', C2.split.startsWith('order') && C2.rows.filter(x => x.verdict === 'not fired').length === 3, C2.rows.map(x => x.verdict));
ok('wrong volume reported (rules 24, 26, 30)', a1.diffs.some(d => /bullet_hit: volume turret seen, body predicted/.test(d.what)) && a1.rules.includes(24), a1.diffs);
ok('certain part with no break reported (rule 31)', a1.diffs.some(d => /body/.test(d.what) && /not seen|no break seen/.test(d.what)) && a1.rules.includes(31), a1.diffs);
// no Info lines: parts not checked, noted
const bare = st.compare(T, st.parseLog(['> shot_2'].concat(T.rows[1].predicted.required.map(e => 'EVENT: ' + e.event), ['EVENT: break', 'EVENT: break']).join('\n')));
ok('without Info lines the row is noted, not judged on parts', bare.rows[1].verdict === 'same' && bare.rows[1].notes.some(x => /no Info lines/.test(x)), bare.rows[1]);

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* keep */ }
console.log(`${n - fails}/${n} checks`);
console.log(fails ? 'FAIL' : 'PASS');
process.exit(fails ? 1 : 0);

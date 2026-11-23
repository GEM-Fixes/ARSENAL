// BUILD-GATE job 5: GAME_RUNNING right after edrun's own game closed -> up to 4 waits and retries. Seeded with a fake spawner; no game.
// Author: Imperator_Aug (ARSENAL, ia-83c9ef48)
const e = require('../edrun.js');
process.env.EDRUN_RETRY_MS = '10';
let fails = 0; const chk = (n, c) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (!c) fails++; };
const mk = seq => { const calls = []; const f = () => { calls.push(1); return seq[Math.min(calls.length - 1, seq.length - 1)]; }; f.calls = calls; return f; };
const bad = { status: 1, stdout: '', stderr: 'ERROR GAME_RUNNING x: game rewrites options.set; close it first' };
const good = { status: 0, stdout: 'ok', stderr: '' };
const other = { status: 1, stdout: '', stderr: 'ERROR NO_PROFILE' };
let s;
e.markGameEnd(Date.now()); s = mk([bad, good]); chk('own game just closed: retried, ok', e.runSwitch('G', [], s).status === 0 && s.calls.length === 2);
e.markGameEnd(Date.now()); s = mk([bad, bad]); chk('still running: 4 retries then give up', e.runSwitch('G', [], s).status === 1 && s.calls.length === 5);
e.markGameEnd(Date.now()); s = mk([bad, bad, bad, good]); chk('exits on 3rd retry: ok', e.runSwitch('G', [], s).status === 0 && s.calls.length === 4);
e.markGameEnd(Date.now()); s = mk([other]); chk('other error: no retry', e.runSwitch('G', [], s).status === 1 && s.calls.length === 1);
e.markGameEnd(0); s = mk([bad, good]); chk('no game of ours: no retry', e.runSwitch('G', [], s).status === 1 && s.calls.length === 1);
e.markGameEnd(Date.now() - 600000); s = mk([bad, good]); chk('game closed long ago: no retry', s && e.runSwitch('G', [], s).status === 1 && s.calls.length === 1);
process.exit(fails ? 1 : 0);

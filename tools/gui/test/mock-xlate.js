// Mock of the goh2as2 --ask-json question flow (XLATE-2), for the GUI demo (--demo-xlate) and its test. Not a translator: it writes no files.
//   stdout: one JSON object per line, exactly the real shape:
//     {"xlate":"question","v":1,"id":"<unit>:<key>","unit","class","stage":"engine"|"scale","key","goh","translated","range":{"p5","p95"},"scaled","donor","default":"scale","choices":["scale","translated","donor"],"rest_of_class":true}
//   stdin:  one JSON object per line {"id","choice","rest"}   (no "xlate" field)
// With --no-ask it asks nothing and uses each default. rest:true applies that choice to the later questions of the same class AND stage (as the tool does).
// Author: Imperator_Aug (ARSENAL, ia-56124d81)
const readline = require('readline');
const noAsk = process.argv.includes('--no-ask');
const Q = [
  { unit: 'gaz67b', class: 'car', stage: 'scale', key: 'speed', goh: 42, translated: 42, range: { p5: 6, p95: 22 }, scaled: 20, donor: 14 },
  { unit: 'sdkfz251', class: 'car', stage: 'scale', key: 'speed', goh: 38, translated: 38, range: { p5: 6, p95: 22 }, scaled: 19, donor: 15 },
  { unit: 'pz4h', class: 'tank_medium', stage: 'engine', key: 'turn_time', goh: 0, translated: 0, range: { p5: 3, p95: 12 }, scaled: 3, donor: 6 },
];
const say = o => process.stdout.write(JSON.stringify(o) + '\n');
console.log('mock-xlate: ' + Q.length + ' cases' + (noAsk ? ', asking off' : ''));
const remembered = {};
const rl = readline.createInterface({ input: process.stdin });
const waiting = {};
const early = {};   // an answer that arrives before its question is asked (piped input) waits here, like the tool's stdin buffer
rl.on('line', l => { let a; try { a = JSON.parse(l); } catch (e) { console.error('bad answer line: ' + l); return; } if (a && waiting[a.id]) waiting[a.id](a); else if (a && a.id) early[a.id] = a; });
rl.on('close', () => { for (const k of Object.keys(waiting)) waiting[k]({ choice: 'cancelled' }); });
(async () => {
  const done = [];
  for (const q of Q) {
    const id = q.unit + ':' + q.key, rk = q.class + '|' + q.stage;
    if (noAsk) { done.push([id, 'scale (default, asking off)']); continue; }
    if (remembered[rk]) { done.push([id, remembered[rk] + ' (rest of class)']); console.log(id + ': ' + remembered[rk] + ' by the class answer'); continue; }
    say(Object.assign({ xlate: 'question', v: 1, id }, q, { default: 'scale', choices: ['scale', 'translated', 'donor'], rest_of_class: true }));
    const a = early[id] || await new Promise(r => { waiting[id] = r; });
    if (a.choice === 'cancelled') { console.error('input closed while a question was open'); process.exit(3); }
    if (a.rest) remembered[rk] = a.choice;
    done.push([id, a.choice]);
    console.log(id + ': ' + a.choice + (a.rest ? ' (and the rest of ' + rk + ')' : ''));
  }
  say({ xlate: 'summary', cases: Q.length, answers: done });
  console.log('mock-xlate: done, nothing written');
  process.exit(0);
})();

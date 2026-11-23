// fixture: a fixed instant printed in local time (must fail, cause tz); --utc: the clean twin
// Author: Imperator_Aug (ARSENAL, ia-5ae110e4)
const d = new Date(Date.UTC(2020, 0, 1, 12, 0, 0));
console.log(process.argv[2] === '--utc' ? d.toISOString() : String(d.getHours()) + ':' + String(d.getMinutes()));

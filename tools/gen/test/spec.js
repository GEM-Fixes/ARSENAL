// spec: the spec contract. (1) drift: every field gen.js / ops.js reads is in the schema (and the reverse), every op has a schema row, no stale x-limits
// shape. (2) --schema output. (3) every sample spec and every spec file in tools/gen passes --check-spec. (4) five seeded bad specs give exactly their finding.
// Needs no game. node spec.js <work dir>   prints "OK name" / "FAIL name: why", exit 1 on a FAIL.
// Author: Imperator_Aug (ARSENAL, ia-6a8efdde)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work')); fs.mkdirSync(W, { recursive: true });
const GEN = path.join(__dirname, '..', 'gen.js'), LIB = path.join(__dirname, '..', 'lib');
const gen = require(GEN), SS = require('../lib/specschema'), schema = gen.schema();
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };
const uniq = a => [...new Set(a)].sort();
const reads = (text, re) => uniq([...text.matchAll(re)].map(m => m[1]));
const src = ['ops.js', 'ops-unit.js', 'ops-asset.js'].filter(f => fs.existsSync(path.join(LIB, f))).map(f => fs.readFileSync(path.join(LIB, f), 'utf8')).join('\n').replace(/\r\n/g, '\n'), gsrc = fs.readFileSync(GEN, 'utf8').replace(/\r\n/g, '\n');   // a CRLF checkout (autocrlf) reads the same as LF
// the text of a top-level function (up to its closing brace in column 0) or const line
const body = (text, name) => {
  const i = text.search(new RegExp('^(async )?function ' + name + '\\(', 'm'));
  if (i >= 0) { const e = text.indexOf('\n}\n', i); return text.slice(i, e < 0 ? text.length : e + 3); }
  const m = new RegExp('^const ' + name + '[^\\n]*', 'm').exec(text);
  return m ? m[0] : '';
};
const EXTRA = { roster: ['botsAdvice'], squad: ['botsAdvice', 'opSquadX'], card: ['opCardList', 'cardEdits'], gun: ['opGun'],'map-clone': ['srcMods'], 'mission-clone': ['srcMods'] };
const SPEC = /\bspec\.([A-Za-z_]\w*)/g, IT = /\bit\.([A-Za-z_]\w*)/g;

// 1. drift, op by op
for (const [op, fn] of Object.entries(gen.OPS)) {
  const F = SS.FIELDS[op];
  ok('row for op ' + op, !!F && !!schema.$defs[op + '-op']);
  if (!F) continue;
  let text = [fn, ...(EXTRA[op] || [])].map(n => body(src, n)).join('\n');
  ok(op + ': code found', text.length > 40, fn);
  const sp = reads(text, SPEC), it = reads(text, IT);
  // the clone op's wreck handling lives in gen.js main: s.<field>
  const mainS = op === 'clone' ? reads(body(gsrc, 'main'), /\bs\.([A-Za-z_]\w*)/g).filter(x => x !== 'op') : [];
  const used = uniq([...sp, ...it, ...mainS].filter(x => x !== 'op'));
  const have = Object.keys(F.props);
  const missing = used.filter(x => !have.includes(x)), stale = have.filter(x => !used.includes(x));
  ok(op + ': every field the code reads is in the schema', !missing.length, 'read but not in the schema: ' + missing.join(' '));
  ok(op + ': every schema field is read by the code', !stale.length, 'in the schema, never read: ' + stale.join(' '));
  if (F.items) { const ip = F.items.props, im = it.filter(x => !ip.includes(x)), is = ip.filter(x => !it.includes(x)); ok(op + ': item fields match the code', !im.length && !is.length, 'unlisted ' + im.join(' ') + ' | unread ' + is.join(' ')); }
  // fields that name a limit: ids look like limits rows
  for (const [f, s] of Object.entries(F.props)) if (s['x-limits']) ok(op + '.' + f + ' x-limits ids', s['x-limits'].every(x => /^[A-Z]+-\d+$/.test(x)), JSON.stringify(s['x-limits']));
}
{
  const top = reads(body(gsrc, 'main'), /\bspec\.([A-Za-z_]\w*)/g), want = Object.keys(schema.properties);
  ok('top level: every spec field gen.js main reads is in the schema', top.every(x => want.includes(x)), 'read ' + top.join(' ') + ' schema ' + want.join(' '));
  ok('top level: every schema field is read', want.every(x => top.includes(x)), 'schema ' + want.join(' ') + ' read ' + top.join(' '));
  const rows = reads(body(src, 'opSet').split('\n').filter(l => /rows\.push\(\{ line: i \+ 1/.test(l)).join('\n'), /\br\.([A-Za-z_]\w*)/g), mem = reads(body(src, 'opSquad').split('\n').filter(l => /spec\.members/.test(l)).join('\n'), /\bm\.(?!split\b)([A-Za-z_]\w*)/g);
  ok('set row fields match the code', JSON.stringify(rows) === JSON.stringify(uniq(SS.NESTED.setRow)) && JSON.stringify(uniq(Object.keys(schema.$defs.setRow.properties))) === JSON.stringify(rows), rows.join(' '));
  ok('squad member fields match the code', JSON.stringify(mem) === JSON.stringify(uniq(SS.NESTED.member)) && JSON.stringify(uniq(Object.keys(schema.$defs.member.properties))) === JSON.stringify(mem), mem.join(' '));
  // tables the schema is built from
  ok('target enum = gen TARGETS', JSON.stringify(schema.properties.target.enum) === JSON.stringify(gen.TARGETS));
  ok('op list = gen OPS', JSON.stringify(schema.properties.ops.items.oneOf.map(x => x.$ref)) === JSON.stringify(Object.keys(gen.OPS).map(k => '#/$defs/' + k + '-op')));
  ok('set row op pattern accepts every SET_OPS', require('../lib/ops').SET_OPS.every(o => new RegExp(schema.$defs.setRow.properties.op.pattern).test(o) && new RegExp(schema.$defs.setRow.properties.op.pattern).test(o.toUpperCase())));
  ok('GoH field names in the schema = ops GOH_FIELDS', JSON.stringify(schema['x-goh-fields']) === JSON.stringify(require('../lib/ops').GOH_FIELDS));
  // a made-up op in OPS without a schema row must stop the build (the drift gate)
  let thrown = null; try { require('../lib/specschema').build({ OPS: Object.assign({ zzz: 'opZzz' }, gen.OPS), TARGETS: gen.TARGETS }); } catch (e) { thrown = e.message; }
  ok('an op without a schema row stops --schema', thrown && /zzz/.test(thrown), thrown);
}

// 2. --schema
{
  const r = cp.spawnSync(process.execPath, [GEN, '--schema'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* below */ }
  ok('--schema prints JSON, exit 0', r.status === 0 && j, (r.stdout + r.stderr).slice(0, 200));
  ok('--schema is draft 2020-12 and equals the in-process schema', j && j.$schema === 'https://json-schema.org/draft/2020-12/schema' && JSON.stringify(j) === JSON.stringify(schema));
  const lim = [], nolim = [];
  for (const [op, F] of Object.entries(SS.FIELDS)) for (const [f, s] of Object.entries(F.props)) (s['x-limits'] ? lim : nolim).push(op + '.' + f);
  ok('--schema has x-limits fields', lim.length > 10, lim.length + ' with, ' + nolim.length + ' without');
  ok('every field has a description', Object.values(SS.FIELDS).every(F => Object.values(F.props).every(s => s.description)));
}

// 3. every sample / spec file in tools/gen passes --check-spec
const chk = (f, more) => { const r = cp.spawnSync(process.execPath, [GEN, '--check-spec', f, ...(more || [])], { encoding: 'utf8' }); return { status: r.status, text: (r.stdout || '') + (r.stderr || ''), lines: ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter(l => /: (WARN_)?GEN_SPEC_[A-Z_]+ /.test(l)) }; };
{
  const files = [];
  for (const d of ['samples', 'specs']) { const p = path.join(__dirname, '..', d); if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) if (/\.(ya?ml|json)$/.test(f)) files.push(path.join(p, f)); }
  ok('sample/spec files found', files.length >= 7, files.length + ' files');
  for (const f of files) { const r = chk(f, ['--target', 'as64']); ok('check-spec clean: ' + path.basename(f), r.status === 0 && !r.lines.length, r.text.slice(0, 400)); }
  const sa = cp.spawnSync(process.execPath, [GEN, '--sample', 'all'], { encoding: 'utf8' }), p = path.join(W, 'sample_all.yaml'); fs.writeFileSync(p, sa.stdout);
  ok('check-spec clean: --sample all text', chk(p, ['--target', 'goh']).lines.length === 1 && /GEN_SPEC_TARGET_OP/.test(chk(p, ['--target', 'goh']).text), 'mission-clone is AS2 only, so goh gives exactly that one finding');
}

// 4. five seeded bad specs: exactly their finding, exit 1, nothing written
{
  const seeds = [
    ['unknown field', 'FIELD_UNKNOWN', { name: 's1', ops: [{ op: 'roster', unit: 'a', like: 'b', army: 'rus', bot: true }] }],
    ['missing required', 'FIELD_MISSING', { name: 's2', ops: [{ op: 'squad', name: 'x_sq', army: 'rus', like: 'riflemans' }] }],
    ['bad value', 'VALUE', { name: 's3', ops: [{ op: 'set', rows: [{ entity: 'rifle_a', path: 'actor/k1', value: '1', op: 'frob' }] }] }],
    ['unknown op', 'OP_UNKNOWN', { name: 's4', ops: [{ op: 'frobnicate' }] }],
    ['op not on target', 'TARGET_OP', { name: 's5', target: 'goh', ops: [{ op: 'mission-clone', map: 'map/multi/m2', from: 'battle_zones', to: 'combat' }] }],
  ];
  for (const [what, code, spec] of seeds) {
    const f = path.join(W, 'seed_' + spec.name + '.json'); fs.writeFileSync(f, JSON.stringify(spec));
    const r = chk(f, spec.target ? [] : ['--target', 'as64']);
    ok('seeded ' + what + ' -> exactly GEN_SPEC_' + code, r.status === 1 && r.lines.length === 1 && r.lines[0].includes('GEN_SPEC_' + code + ' ') && /^1 findings$/m.test(r.text), r.text.slice(0, 400));
  }
  // the rest of the codes
  const one = (name, spec, code, more) => { const f = path.join(W, 'x_' + name + '.json'); fs.writeFileSync(f, JSON.stringify(spec)); const r = chk(f, more || ['--target', 'as64']); ok('code ' + code + ' (' + name + ')', r.status === 1 && r.lines.length === 1 && r.lines[0].includes('GEN_SPEC_' + code + ' '), r.text.slice(0, 300)); };
  one('type', { name: 't', ops: [{ op: 'roster', unit: 'a', like: 'b', army: ['rus'] }] }, 'TYPE');
  one('target', { name: 't', ops: [] }, 'TARGET', []);
  one('csv', { name: 't', ops: [{ op: 'set', csv: 'no_such.csv' }] }, 'CSV_MISSING');
  one('rowstr', { name: 't', ops: [{ op: 'set', rows: ['rifle_a,actor/k1,1,frob'] }] }, 'VALUE');
  one('member', { name: 't', ops: [{ op: 'squad', name: 'q', army: 'rus', like: 'r', members: ['rifle:0'] }] }, 'VALUE');
  const r = chk(path.join(W, 'does_not_exist.yaml'), ['--target', 'as64']); ok('code PARSE (unreadable spec)', r.status === 1 && r.lines.length === 1 && /GEN_SPEC_PARSE /.test(r.lines[0]), r.text.slice(0, 300));
  const before = fs.readdirSync(W).length; chk(path.join(W, 'seed_s1.json'), ['--target', 'as64']); ok('check-spec writes nothing', fs.readdirSync(W).length === before && !fs.existsSync(path.join(process.cwd(), 'gen-out')));
  const js = cp.spawnSync(process.execPath, [GEN, '--check-spec', path.join(W, 'seed_s4.json'), '--target', 'as64', '--json'], { encoding: 'utf8' });
  let jj = null; try { jj = JSON.parse(js.stdout); } catch (e) { /* below */ }
  ok('check-spec --json', jj && js.status === 1 && jj.findings.length === 1 && jj.findings[0].code === 'GEN_SPEC_OP_UNKNOWN', js.stdout.slice(0, 300));
}
console.log(bad ? bad + ' FAILED' : 'all ok');
process.exit(bad ? 1 : 0);

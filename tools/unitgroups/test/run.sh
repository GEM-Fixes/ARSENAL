#!/bin/sh
# unitgroups: signature and rep choice on synthetic cards, seeded so a wrong grouping fails
# Author: Imperator_Aug (ARSENAL, ia-37b1c760)
cd "$(dirname "$0")/../../.." || exit 1
node -e "
const u=require('./tools/unitgroups/unitgroups.js'),A=require('assert');
const veh=(key,ext,w)=>({key,inherits:['properties/tank.ext'],extenders:ext,refs:w.map(x=>['weapon',x]).concat([['item','ammo b ap']]),ev:[['loco','f',1,{type:'track'}]]});
const ents={t34:veh('resource/entity/-vehicle/tank_medium/t34/t34.def',['inventory'],['g','m']),
 sherman:veh('resource/entity/-vehicle/tank_medium/sherman/sherman.def',['inventory'],['h','k']),
 is2:veh('resource/entity/-vehicle/tank_heavy/is2/is2.def',['inventory'],['g','m']),
 shield:veh('resource/entity/-vehicle/tank_medium/x/x.def',['inventory','shield'],['g','m'])};
const c=(card,tags,content='',breed=false)=>({card,tags,content,breed});
const r=u.group([c('t34',['all','rus']),c('sherman',['all','usa']),c('is2',['all','rus']),c('shield',['all','ger']),
 c('rifles(rus)',['infantry','rus','inf_only'],'mp/rus/rifle:1 mp/rus/rifle2:2'),c('rifles(usa)',['infantry','usa','inf_only'],'mp/usa/rifle:3'),
 c('flamers(usa)',['infantry','usa','inf_only'],'mp/usa/flamer:1'),c('mp/rus/rifle',['rus'],'',true),c('fixed',['all'])],n=>ents[n]);
const by=n=>r.groups.find(g=>g.members.some(m=>m.card===n));
A.strictEqual(r.cards,8,'soldier card stays out');
A.strictEqual(by('t34'),by('sherman'),'same class, other model and army: one group');
A.notStrictEqual(by('t34'),by('is2'),'class folder splits');
A.notStrictEqual(by('t34'),by('shield'),'extender splits');
A.strictEqual(by('rifles(rus)'),by('rifles(usa)'),'rank digit and army ignored');
A.notStrictEqual(by('rifles(rus)'),by('flamers(usa)'),'soldier class splits');
A.deepStrictEqual(u.soldierClasses('mp/ger2/sturmovik6b:2 mp/ger2/flamer:1'),['flamer','sturmovik']);
const a=u.byArmy(r);
A.ok(a.rus.includes('t34')||a.usa.includes('sherman'));
A.ok(Object.values(a).flat().filter(x=>/^(t34|sherman)/.test(x)).length===1,'one rep per group');
A.ok(a['?'].includes('fixed:human'),'no army goes to ?');
const ent=(key,layer,type='actor',e=['inventory'])=>({key,name:key.split('/').pop().replace('.def',''),layer,etype:[type],inherits:[],extenders:e,refs:[],ev:[]});
const er=u.groupEntities([ent('resource/entity/-vehicle/germany/tank_medium/a/a.def','gohfull'),ent('resource/entity/-vehicle/usa/tank_medium/b/b.def','gohfull'),ent('resource/entity/-vehicle/usa/tank_medium/c/c.def','gohfull',undefined,['shield']),ent('resource/entity/-vehicle/usa/tank_medium/x/w/w.def','gohfull'),ent('resource/entity/-vehicle/usa/tank_medium/d/d.def','gohfull','game_entity'),ent('resource/entity/-vehicle/tank_medium/e/e.def','base')],'gohfull');
A.strictEqual(er.cards,3,'wreck, prop and other layer stay out');
A.strictEqual(er.groups.length,2,'faction ignored, extender splits');
const gun=(n,crew,ammo,w,fac='usa')=>({key:'resource/entity/-vehicle/'+fac+'/cannon/'+n+'/'+n+'.def',name:n,layer:'gohfull',etype:['actor'],inherits:['properties/cannon.ext'],extenders:['inventory'],crew,refs:[['item',ammo],['weapon',w]],ev:[]});
const gr=u.groupEntities([gun('a',2,'bullet57 ap','57mm_a'),gun('b',2,'bullet76 ap','76mm_b','ger'),gun('c',4,'bullet57 ap','57mm_c'),gun('d',2,'bullet120 fg','120mm_d'),gun('e',2,'bullet37 ap','37mm_e')],'gohfull');
const gb=n=>gr.groups.find(g=>g.members.some(m=>m.card===n));
A.strictEqual(gb('a'),gb('b'),'same crew, same calibre band, faction ignored');
A.notStrictEqual(gb('a'),gb('c'),'crew count splits');
A.notStrictEqual(gb('a'),gb('d'),'calibre band splits');
A.notStrictEqual(gb('a'),gb('e'),'small calibre band splits');
A.ok(gr.groups.every(g=>g.kind==='gun'),'cannon class is kind gun');
A.strictEqual(u.calibreBand({refs:[['weapon','mg34']]}),'x','no digits, no band');
const br=(name,prim,carry,o={})=>({name,prim,carry,...o});
const hr=u.groupHumans([br('mp/rus/rifle','rifle',['rifle']),br('mp/ger/rifle','rifle',['rifle']),br('mp/rus/smg','smg',['smg','rifle']),br('mp/rus/mg','mgun',['mgun','pistol']),br('civ1','-',[],{behaviour:'civilian'}),br('civ2','-',[],{behaviour:'civilian'}),br('hero1','rifle',['rifle'],{hero:true}),br('oddskin','rifle',['rifle'],{skinOk:false})]);
const hb=n=>hr.groups.find(g=>g.members.some(m=>m.card===n));
A.strictEqual(hb('mp/rus/rifle'),hb('mp/ger/rifle'),'army ignored');
A.notStrictEqual(hb('mp/rus/rifle'),hb('mp/rus/smg'),'primary class splits');
A.notStrictEqual(hb('mp/rus/smg'),hb('mp/rus/mg'));
A.strictEqual(hb('civ1'),hb('civ2'));
A.notStrictEqual(hb('civ1'),hb('mp/rus/rifle'),'behaviour splits');
A.notStrictEqual(hb('hero1'),hb('mp/rus/rifle'),'hero splits');
A.notStrictEqual(hb('oddskin'),hb('mp/rus/rifle'),'unresolved skin splits');
A.strictEqual(hb('mp/rus/rifle').rep,'mp/ger/rifle','rep: mp first, then name');
A.strictEqual(hr.groups.length,6);
const bu=(n,root)=>({key:'resource/entity/'+n+'/'+n+'.def',name:n,layer:'voln_t',etype:['actor'],inherits:['resource/properties/'+root,'resource/properties/selection/x.inc'],extenders:['inventory'],refs:[],ev:[]});
const bg=u.groupEntities([bu('ta','tank.ext'),bu('tb','tank.ext'),bu('ga','cannon.ext'),bu('ca','car.ext'),{...bu('tu','tank.ext'),key:'resource/entity/tu/tu.unfit.def'},{...bu('wr','tank.ext'),key:'resource/entity/wr/other.def'}],'voln_t');
A.strictEqual(bg.cards,4,'built units at entity/<rep>/<rep>.def count; .unfit.def and a stray def do not');
A.ok(bg.groups.some(g=>g.kind==='gun'&&g.rep==='ga'),'built cannon is a gun');
A.strictEqual(bg.groups.find(g=>g.members.some(m=>m.card==='ta')).members.length,2,'built tanks group');
A.ok(u.isBuilt('resource/entity/ta/ta.def')&&!u.isBuilt('resource/entity/-vehicle/tank_medium/t/t.def'));
" || { echo FAIL; exit 1; }
# --exe: as64 / mowas_2 views of a made-up install, goh refused (per-run temp dir)
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT
node tools/unitgroups/test/exe.js "$W" || { echo FAIL; exit 1; }
echo PASS

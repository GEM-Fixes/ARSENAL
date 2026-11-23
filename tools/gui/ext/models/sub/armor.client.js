// Models page, Armor part section 6): one sub-tab "Armor", top to bottom: who shoots (gun search, shell, range
// what it goes through), the thickness table (click a number to change it in the mod), the map from one side (canvas, colour by
// what happens or by thickness, hover names the plate, click shoots through that cell), the 3D view when sub/viewer.client.js is
// there (volumes coloured by thickness, click a face to shoot there), and the shot result (plates in order + one sentence).
// The 3D view's "Shoot from" (LS models.armor.from3d): the camera (first, the default) or the side chosen for the map. With the
// camera a click shoots along the click ray (hit.dir as armorsim azimuth and elevation in the root bone's frame, through the Shot
// part's helpers EXT_SCREENS.models.subs.model._shot aeFromDir / frameOf / aeWords, the frame from the view's sceneInfo()) at the
// clicked point, and the Shot button from the active pane's camera() towards the part clicked last, else the middle of the unit.
// Without those helpers or a camera it falls back to the side. A click on the ground beside the model (hit.ground, nothing shells
// hit nearer) shoots at that ground point; from the side only when the side's elevation is above 0 (else said, no shot). Every
// request (3D click, Shot button, map click, effects) sends ground: 0: a shell that misses or passes through ends on the ground
// (result 'ground', code G, a stop-type end); the line ends at the ground point and a small cross marks it.
// Server: armor.server.js. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new
// global names. Requests started before the sub-tab was left (or redrawn) are ignored on return; no timers.
// Test seam: EXT_SCREENS.models.subs.armor._t (pure helpers).
// Author: Imperator_Aug (ARSENAL, ia-4749cc0f)
module.exports = String.raw`
(function(){
 var SIDES=['front','top','left','right','rear','bottom'],VIEWS=['front','rear','left','right','top'];
 var VIEW_AE={front:[0,0],rear:[180,0],left:[90,0],right:[-90,0],top:[0,90]};
 var CODES={penetrate:'P',ricochet:'R',no_penetration:'N',detonate:'D',missed:'M',beyond_jet:'J',no_armor:'O',no_hit:'X',ground:'G'};
 var CAT={P:'through',R:'bounce',N:'stop',D:'stop',M:'stop',J:'stop',O:'none',X:'none',G:'stop'};
 var FROM3=['camera','side'];
 // W6: colours are page tokens (page.js :root), read at draw time so the canvas and the 3D view follow the light / dark theme
 var CAT_TOK={through:'--cthru',bounce:'--cbounce',stop:'--cstop',none:'--cnone'};
 var CAT_COL={through:'var(--cthru)',bounce:'var(--cbounce)',stop:'var(--cstop)',none:'var(--cnone)'};
 function tok(n){return typeof cssv==='function'?cssv(n,''):''}
 function catPaint(k){return tok(CAT_TOK[k]||CAT_TOK.none)}
 function rgbOf(s){var m=/^#?([0-9a-f]{6})$/i.exec(String(s||'').trim());if(!m)return null;var n=parseInt(m[1],16);return [n>>16&255,n>>8&255,n&255]}
 function mmScale(){var a=rgbOf(tok('--mmlo')),b=rgbOf(tok('--mmhi'));return a&&b?[a,b]:null}
 var FLAGK={'area override':'area','not in the model':'notInModel','no armour value':'noArmor','model only':'modelOnly'};
 var PARTS=[[/^(body|hull)/,'hull'],[/^turret/,'turret'],[/^mantle/,'mantlet'],[/^gun/,'gun'],[/^track/,'track'],[/^wheel/,'wheel'],[/^engine/,'engine'],[/^shield/,'shield'],[/^ram$/,'ram']];
 var GRID='80x60',BACK=2000;
 var ST={gen:0,key:null,gun:LS.get('models.armor.gun',''),ammo:LS.get('models.armor.ammo',''),range:LS.get('models.armor.range',100),
  view:LS.get('models.armor.view','front'),mode:LS.get('models.armor.mode','result'),shells:null,table:null,map:null,shot:null,edit:null,cell:null,fx:null,fxPrev:null,fxBody:null,carry:false,vanilla:false,fxAll:false,fxPaint:false,until:LS.get('models.armor.until','')};

 // ---------- pure helpers (test seam) ----------
 function codeOf(x){x=String(x==null?'':x);if(x.length===1)return x.toUpperCase();return CODES[x.toLowerCase().replace(/ /g,'_')]||'?'}
 function resKey(x){var c=codeOf(x);return 'models.armor.res.'+(CAT[c]?c:'unknown')}
 function catOf(x){return CAT[codeOf(x)]||'none'}
 function hex2(n){n=Math.max(0,Math.min(255,Math.round(n)));return (n<16?'0':'')+n.toString(16)}
 function mmColor(mm,max,sc){var t=max>0?Math.max(0,Math.min(1,(Number(mm)||0)/max)):0,a=sc?sc[0]:[232,238,245],b=sc?sc[1]:[22,46,84];
  return '#'+hex2(a[0]+(b[0]-a[0])*t)+hex2(a[1]+(b[1]-a[1])*t)+hex2(a[2]+(b[2]-a[2])*t)}
 function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
 // the volumes shells never hit (left out of the trace: ram volumes, bullet ability off), from the thickness table's join.notHit and
 // the rows flagged so: a map of 'i:' + lower-case id and 'n:' + lower-case name
 function lk(x){return String(x==null?'':x).toLowerCase()}
 function noShell(t){var m={};if(!t)return m;
  ((t.join&&t.join.notHit)||[]).forEach(function(x){if(!x)return;if(x.id)m['i:'+lk(x.id)]=1;if(x.name)m['n:'+lk(x.name)]=1});
  (t.rows||[]).forEach(function(r){if(r&&(r.flags||[]).some(function(f){return /^not hit by shells/.test(String(f))})){if(r.id)m['i:'+lk(r.id)]=1;if(r.name)m['n:'+lk(r.name)]=1}});return m}
 // where a click meant as a shot goes: the first volume under the click (hit.hits of sub/viewer.client.js, nearest first) that shells
 // hit, at its aim point (just inside its surface) -> {volume, side, point} | null (nothing shells hit there). A hit without the list
 // (an older view): its own volume and point.
 function shellHit(hit,m){if(!hit)return null;m=m||{};
  if(!Array.isArray(hit.hits))return hit.point&&hit.point.length===3?{volume:hit.volume||null,side:hit.side,point:hit.point.slice()}:null;
  for(var i=0;i<hit.hits.length;i++){var h=hit.hits[i];if(!h||m['i:'+lk(h.volume)]||h.name&&m['n:'+lk(h.name)])continue;
   var p=h.aim&&h.aim.length===3?h.aim:h.point;if(p&&p.length===3)return {volume:h.volume||null,side:h.side,point:p.slice()}}
  return null}
 // how far along the click ray (hit.origin, hit.dir) a point lies; null without the ray
 function along(hit,p){var o=hit&&hit.origin,d=hit&&hit.dir;if(!o||!d||o.length!==3||d.length!==3||!p||p.length!==3)return null;
  return (p[0]-o[0])*d[0]+(p[1]-o[1])*d[1]+(p[2]-o[2])*d[2]}
 // where a click goes, the ground included: shellHit, or {ground: [x, y, z]} when the click has hit.ground (sub/viewer.client.js) and
 // no volume shells hit is under it, or that volume is farther along the ray than the ground point
 function aimAt(hit,m){if(!hit)return null;var s=shellHit(hit,m),g=Array.isArray(hit.ground)&&hit.ground.length===3?hit.ground.slice():null;
  if(!g)return s;if(!s)return {ground:g};var a=along(hit,s.point),b=along(hit,g);return a!=null&&b!=null&&b<a?{ground:g}:s}
 // the ground point of a result: engine.end.point of an effects result that ended on the ground; groundPoint of /shot, set only when
 // the shell ended on the ground (outcome 'ground'; verdict is 'ground' only when it met nothing before, else the first plate's result)
 function groundOf(j){var e=j&&j.engine&&j.engine.end;if(e&&e.result==='ground'&&Array.isArray(e.point)&&e.point.length>=3)return e.point.slice(0,3);
  if(j&&Array.isArray(j.groundPoint)&&j.groundPoint.length>=3)return j.groundPoint.slice(0,3);return null}
 // a small cross on the ground plane at p: [[a, b], [c, d]]
 function crossAt(p,s){if(!p||p.length<3)return [];s=s||8;return [[[p[0]-s,p[1],p[2]],[p[0]+s,p[1],p[2]]],[[p[0],p[1]-s,p[2]],[p[0],p[1]+s,p[2]]]]}
 function rnd3(p){return (p||[]).slice(0,3).map(function(x){return Math.round(Number(x)||0)}).join(', ')}
 function nrm(v){var l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return l>0?[v[0]/l,v[1]/l,v[2]/l]:null}
 // the Shot part's pure helpers (sub/shot.client.js): aeFromDir, frameOf, aeWords; null when that part is not on the page
 function shotT(){var m=EXT_SCREENS.models.subs&&EXT_SCREENS.models.subs.model,t=m&&m._shot;return t&&typeof t.aeFromDir==='function'&&typeof t.frameOf==='function'?t:null}
 // the way a 3D shot comes: {cam: true, ae} along dir (or the camera's way) in the root frame w (12 numbers), else the side's {cam: false, ae}
 function wayOf(from,dir,camDir,w,sideAe){var T=from==='camera'?shotT():null,d=dir&&dir.length===3?dir:camDir;
  if(T&&d){var ae=T.aeFromDir(d,T.frameOf(w||null));if(ae)return {cam:true,ae:ae}}return {cam:false,ae:sideAe.slice()}}
 // the camera's way to a point: from the eye to it in perspective, the view direction in a flat view; null without a camera
 function camWayTo(c,m){if(!c||!c.dir)return null;return !c.ortho&&m&&c.eye?nrm([m[0]-c.eye[0],m[1]-c.eye[1],m[2]-c.eye[2]])||c.dir:c.dir}
 function cellRay(g,col,row,back){var c=g.cell,o=g.origin,r=g.right,u=g.up,k=[0,1,2];
  var centre=k.map(function(i){return o[i]+r[i]*(col+0.5)*c-u[i]*(row+0.5)*c});
  var x=cross(r,u),dir=k.map(function(i){return -x[i]});
  var b=back==null?BACK:back;return {centre:centre,dir:dir,origin:k.map(function(i){return centre[i]-dir[i]*b})}}
 function penAt(tab,m){if(!tab||!tab.length)return null;if(m<=tab[0][0])return tab[0][1];
  for(var i=1;i<tab.length;i++){var a=tab[i-1],b=tab[i];if(m<=b[0])return b[0]===a[0]?b[1]:a[1]+(b[1]-a[1])*(m-a[0])/(b[0]-a[0])}
  return tab[tab.length-1][1]}
 function tk(a,b){return tx([a,b].join('.'))}
 // a shell's kind in plain words (the shells route: ap, apcr, he, heat, smoke, other); heat also when the word says cumulative or
 // shaped, or the shell carries a shaped charge (cum > 0, then added to its own kind); an unknown kind shows its own word, never blank
 var KINDS=['ap','apcr','he','heat','smoke','other'];
 function kindWord(k,cum){var w=String(k==null?'':k).trim(),l=w.toLowerCase();if(/^(heat|cumulative|shaped)/.test(l))l='heat';
  var t=KINDS.indexOf(l)>=0?tk('models.armor.kind',l):w||tk('models.armor.kind','other');
  if(Number(cum)>0&&l!=='heat')t+=', '+tk('models.armor.kind','heat');return t}
 // one fact of armorsim effects (tools/iasim facts()) -> {k: text key under models.armor.fxf, x: the name in it}
 var FX_PLAIN={'crew:all dead':'crewAllDead','crew leaves':'crewLeaves','cannot move':'cannotMove','crew stunned':'crewStunned','burns':'burns','fire area':'fireArea','explodes':'explodes','removed from the map':'removed','cannot be selected':'noSelect'};
 var FX_WHOLE={'cannot move':'cannotMove','cannot shoot':'cannotShoot','crew leaves':'crewLeaves','crew dead':'crewDead','burns':'burns','explodes':'explodes','out of action':'outOfAction'};
 var FX_FROM={'unsaved':'unsaved','mod':'mod','other mod':'otherMod','vanilla':'vanilla'};
 var FX_END={passed:'passed',spent:'spent',detonate:'detonate',no_penetration:'stopped',ricochet:'ricochet',beyond_jet:'beyondJet',no_hit:'noHit',missed:'spent',no_armor:'passed',ground:'ground'};
 function factKey(s){s=String(s==null?'':s);if(FX_PLAIN[s])return {k:FX_PLAIN[s],x:''};var m;
  if((m=/^part:(.*) destroyed$/.exec(s)))return {k:'partDestroyed',x:m[1]};if((m=/^part:(.*) broken$/.exec(s)))return {k:'partBroken',x:m[1]};
  if((m=/^crew:(.*) dead$/.exec(s)))return {k:'crewDead',x:m[1]};if((m=/^weapon:(.*) off$/.exec(s)))return {k:'weaponOff',x:m[1]};
  if((m=/^aim:(.*) frozen$/.exec(s)))return {k:'aimFrozen',x:m[1]};if((m=/^torn off: (.*)$/.exec(s)))return {k:'tornOff',x:m[1]};
  if((m=/^tag:(.*)$/.exec(s)))return {k:'tag',x:m[1]};return {k:'other',x:s}}
 function pct(x){x=Number(x)||0;var p=Math.round(x*100);if(p===0&&x>0)return '<1%';if(p===100&&x<1)return '>99%';return p+'%'}
 function wholeClass(x){x=Number(x)||0;return x>=0.5?'badge badx':x>0?'badge review':'badge'}
 function fromKey(s){return FX_FROM[s]||'unknown'}
 function endKey(s){return FX_END[s]||'other'}
 function fxBody(b,doc,o){var r={},k;for(k in b)r[k]=b[k];o=o||{};r.samples=400;if(o.until!=null&&o.until!==''&&untilOk(o.until))r.until=Number(o.until);if(o.vanilla){r.vanilla=true;return r}if(doc){r.doc=doc;if(o.carry)r.carry=true;if(o.reset)r.reset=true}return r}
 function r1(x){return Math.round((Number(x)||0)*10)/10}
 // GT-25: flags, notes and part names in plain words; source-file cites never reach the page
 function flagKey(f){f=String(f==null?'':f);if(FLAGK[f])return FLAGK[f];if(/^not hit by shells/.test(f))return /\(ram\b/.test(f)?'notHitRam':'notHit';
  if(/^no shape/.test(f))return 'noShape';if(f==='ray_cast_thickness')return 'rayCast';return null}
 function plain(x){return String(x==null?'':x).replace(/\s*\([^()]*\.(?:cpp|hpp|h):[\d,-]+[^()]*\)/g,'').replace(/\s*\b\w+\.(?:cpp|hpp|h):[\d,-]+/g,'')}
 function flagText(f,a){var k=flagKey(f);return k?tx(['models.armor.flag',k].join('.'),{a:a||''}):plain(f)}
 function partKey(name){var n=String(name==null?'':name).toLowerCase();for(var i=0;i<PARTS.length;i++)if(PARTS[i][0].test(n))return PARTS[i][1];return null}
 function partWords(name){var k=partKey(name);return k?tx(['models.armor.part',k].join('.')):''}
 function short(id){id=String(id||'');var i=id.lastIndexOf('/');return i<0?id:id.slice(i+1)}

 // ---------- behind the armour by cause: groups, tags, blasts of armorsim effects contract) ----------
 // a group = all one trigger set off (a pierce, a part change, a blast, a script); child groups (parent = id) are drawn under it
 var FOLD_MIN=3,FOLDK={partDestroyed:1,partBroken:1,crewDead:1,weaponOff:1,aimFrozen:1,tornOff:1,tag:1},HIT={pierced:'pierced',damaged:'damaged',held:'held'},HIT_ORDER=['pierced','damaged','held','unknown'];
 // well known script handler names (vanilla; crew_bail from mods) -> plain words under models.armor.fxc
 var SCRIPT_WORDS={explosion:'scriptExplodes',_explosion:'scriptExplodes',explosion_blastwave:'scriptExplodes',fire_start:'scriptFire',burn:'scriptFire',crew_emit:'scriptBail',emit_crew:'scriptBail',crew_bail:'scriptBail',crew_leave:'scriptBail'};
 function num(x,d){if(x==null||x==='')return d;x=Number(x);return isFinite(x)?x:d}
 function gAt(g){var a=g&&g.at;if(a==null)return Infinity;if(typeof a!=='object')return num(a,Infinity);return num(a.first,num(a.median,Infinity))}
 // time first, then the more likely, then id (stable)
 function byTime(a,b){var ta=gAt(a),tb=gAt(b);if(ta!==tb)return ta<tb?-1:1;var c=num(b.chance,0)-num(a.chance,0);if(c)return c<0?-1:1;var x=String(a.id),y=String(b.id);return x<y?-1:x>y?1:0}
 // groups -> [{g, kids:[...]}]; a parent id not in the list (or the group itself) makes a root; a loop of parents is cut at its earliest group
 function groupTree(gs){gs=(gs||[]).filter(function(g){return g&&g.id!=null});var by={},kids={},roots=[],seen={},out=[];
  gs.forEach(function(g){by[String(g.id)]=g});
  gs.forEach(function(g){var p=g.parent==null?null:String(g.parent);if(p!==null&&p!==String(g.id)&&by[p])(kids[p]=kids[p]||[]).push(g);else roots.push(g)});
  function node(g){seen[String(g.id)]=1;var r=[];(kids[String(g.id)]||[]).slice().sort(byTime).forEach(function(c){if(!seen[String(c.id)])r.push(node(c))});return {g:g,kids:r}}
  roots.sort(byTime).forEach(function(g){if(!seen[String(g.id)])out.push(node(g))});
  gs.slice().sort(byTime).forEach(function(g){if(!seen[String(g.id)])out.push(node(g))});
  return out}
 function flatGroups(gs){var out=[];function walk(n,d){out.push({g:n.g,depth:d});n.kids.forEach(function(k){walk(k,d+1)})}groupTree(gs).forEach(function(n){walk(n,0)});return out}
 // the same cause in two results (before / after an edit): kind + event + part / volume + file:line
 function causeSig(c){c=c||{};return [c.kind,c.event,c.part,c.volume,c.file,c.line].map(function(x){return x==null?'':String(x)}).join('|')}
 // cause -> {k: text key under models.armor.fxc, s: slots {x, e}, code: a script handler name shown as code after the words, or ''}
 function causeKey(c){c=c||{};var e=String(c.event||''),x=short(c.volume||c.part||''),k,code='';
  if(c.kind==='shell')k=!x?'shell':e==='pierce'?'shellPierce':e==='bullet_hit'||e==='bullet'?'shellHit':/^break_armor/.test(e)?'shellBreak':'shellOther';
  else if(c.kind==='blast')k=c.file?'blastScript':'blastShell';
  else if(c.kind==='part'){var pf=/^part:(.*) (broken|destroyed|repaired)$/.exec(String(c.fact||''));x=c.part||(pf&&pf[1])||short(c.volume||'');
   k=e==='repair'||(pf&&pf[2]==='repaired')?'partRepaired':e==='destroy'||(pf&&pf[2]==='destroyed')?'partDestroyed':'partBroken'}
  else if(c.kind==='script'){code=e;k=e?SCRIPT_WORDS[e.toLowerCase()]||'script':'scriptAny'}
  else if(c.kind==='before')k='before';
  else if(c.kind==='jet')k='jet';
  else if(c.kind==='fire')k='fire';
  else{k='other';x=[c.kind,e,x].filter(Boolean).join(' ')}
  return {k:k,s:{x:x||'?',e:e},code:code}}
 function causeText(c){var r=causeKey(c);return tx(['models.armor.fxc',r.k].join('.'),r.s)+(r.code?' '+r.code:'')}
 function chanceMap(facts){var m={};(facts||[]).forEach(function(f){if(f&&f.fact!=null)m[f.fact]=num(f.chance,0)});return m}
 // a fact of a group: { fact, chance, at } (chance under this cause) or a bare string (old form: chance from the result's facts)
 function factOf(f){return f!=null&&typeof f==='object'?String(f.fact==null?'':f.fact):String(f==null?'':f)}
 // facts -> lines {k, x, fold, names, facts, chances, lo, hi, at}; FOLD_MIN or more of one kind (parts destroyed, ...) make one line
 function foldFacts(list,ch,skip){ch=ch||{};skip=skip||{};var at={},runs=[],out=[];
  (list||[]).forEach(function(f){var s=factOf(f),o=f!=null&&typeof f==='object',fk=factKey(s);if(fk.k==='tag'&&skip[fk.x])return;var r=FOLDK[fk.k]?at[fk.k]:null;
   if(!r){r={k:fk.k,items:[]};runs.push(r);if(FOLDK[fk.k])at[fk.k]=r}
   r.items.push({f:s,x:fk.x,c:o&&f.chance!=null?num(f.chance,null):num(ch[s],null),t:o&&f.at?num(f.at.median,num(f.at.first,null)):null})});
  function line(k,its,fold){var cs=its.map(function(i){return i.c}),kn=cs.filter(function(c){return c!=null}),ts=its.map(function(i){return i.t}).filter(function(t){return t!=null});
   return {k:k,x:its.length===1?its[0].x:'',fold:fold,names:its.map(function(i){return i.x}),facts:its.map(function(i){return i.f}),chances:cs,lo:kn.length?Math.min.apply(null,kn):null,hi:kn.length?Math.max.apply(null,kn):null,at:ts.length?Math.min.apply(null,ts):null}}
  runs.forEach(function(r){if(r.items.length>=FOLD_MIN)out.push(line(r.k,r.items,true));else r.items.forEach(function(i){out.push(line(r.k,[i],false))})});
  return out}
 // a group's facts; a tag shown as a badge of the group is not listed again
 function groupLines(g,ch){var skip={};(g&&g.tags||[]).forEach(function(t){skip[t]=1});return foldFacts(g&&g.facts,ch,skip)}
 // fact -> chance under each cause of a result: {causeSig: {fact: chance}} (bare string facts take the result's chance)
 function groupFactChances(j){var ch=chanceMap(j&&j.facts),m={};(j&&j.groups||[]).forEach(function(g){var s=causeSig(g.cause),r=m[s]=m[s]||{};
  (g.facts||[]).forEach(function(f){var k=factOf(f),c=f!=null&&typeof f==='object'&&f.chance!=null?num(f.chance,0):num(ch[k],0);r[k]=(r[k]||0)+c})});return m}
 // facts of the result that no group lists
 function looseFacts(j){var inG={};(j&&j.groups||[]).forEach(function(g){(g.facts||[]).forEach(function(f){inG[factOf(f)]=1})});return (j&&j.facts||[]).map(function(f){return f.fact}).filter(function(f){return !inG[f]})}
 function tagRows(tags){var add=[],rem=[];(tags||[]).forEach(function(t){if(t&&t.tag!=null)(t.op==='remove'?rem:add).push(t)});return {add:add.sort(byTime),remove:rem.sort(byTime)}}
 function hitKey(r){return HIT[r]||'unknown'}
 function blastWho(b){b=b||{};return {k:b.source==='shell'?'shell':b.source==='script'?'script':'other',s:{e:b.by&&b.by.event||'?'}}}
 // blast hits -> [{k: pierced|damaged|held|unknown, items: [{name, chance}]}] in that order; chanceIfBlast (given a blast) before chance
 function hitGroups(hits){var by={};(hits||[]).forEach(function(h){if(!h)return;var k=hitKey(h.result);(by[k]=by[k]||[]).push({name:short(h.volume||h.part||'?'),chance:num(h.chanceIfBlast,num(h.chance,null))})});
  return HIT_ORDER.filter(function(k){return by[k]}).map(function(k){return {k:k,items:by[k]}})}
 // blast size in metres when given as {inner, outer}; null otherwise (a bare number is game units: not shown)
 function blastM(b){var m=b&&b.radiusM;if(!m||typeof m!=='object')return null;var i=num(m.inner,null),o=num(m.outer,null);return o==null&&i==null?null:{i:i==null?0:i,o:o==null?i:o}}
 // what the previous result had that this one lacks: groups by cause (when it had groups), else facts
 function gone(j,prev){var r={groups:[],facts:[]};if(!prev)return r;
  if(Array.isArray(prev.groups)&&Array.isArray(j.groups)){var now={};j.groups.forEach(function(g){now[causeSig(g.cause)]=1});r.groups=prev.groups.filter(function(g){return !now[causeSig(g.cause)]})}
  else{var f={};(j.facts||[]).forEach(function(x){f[x.fact]=1});r.facts=(prev.facts||[]).filter(function(x){return !f[x.fact]})}
  return r}
 function sigChances(gs){var m={};(gs||[]).forEach(function(g){var s=causeSig(g.cause);m[s]=(m[s]||0)+num(g.chance,0)});return m}
 function limitsKey(j){return j&&Array.isArray(j.blasts)?'models.armor.fx.limitsBlast':'models.armor.fx.limits'}
 // which list leads the panel: the tidy tree (causes), the full tree of every script step (groups, when asked or when there are no
 // causes), else the flat table (results from before groups existed)
 function mainKind(j,all){j=j||{};var c=Array.isArray(j.causes),g=Array.isArray(j.groups);if(c&&!(all&&g))return 'causes';return g?'groups':c?'causes':'flat'}
 // the other ways a cause was reached than the parent it is drawn under: [{parent, chance, cause}] (parent null = the hit itself;
 // cause null when that parent is not in the list); nothing when there are fewer than two ways
 function alsoVia(c,byId){var v=c&&Array.isArray(c.via)?c.via.filter(Boolean):[];if(v.length<2)return [];var own=c.parent==null?null:String(c.parent),skip=false,out=[];byId=byId||{};
  v.forEach(function(x){var p=x.parent==null?null:String(x.parent);if(!skip&&p===own){skip=true;return}out.push({parent:p,chance:num(x.chance,null),cause:p!=null&&byId[p]?byId[p].cause||{}:null})});return out}
 // the results per part of the vehicle: facts -> rows {id, k (models.armor.sub.k), x (name slot), state (models.armor.subst), chance, at, facts}
 // state = the worst one with any chance, chance and time of that state; rows in a fixed order, then crew places, then other names
 var SUB_ORDER=['hull','turret','gun','engine','trackLeft','trackRight','tracks','wheels','fuel','ammo','move','crewAll'],SUB_RANK={works:0,damaged:1,off:2,broken:3,destroyed:4,dead:5};
 function subOfPart(name){var n=String(name==null?'':name).toLowerCase();if(/fuel/.test(n))return 'fuel';if(/ammo|munition/.test(n))return 'ammo';var k=partKey(n);
  if(k==='track'){var r=n.replace(/^tracks?_?/,'');return /left/.test(n)||/^l/.test(r)?'trackLeft':/right/.test(n)||/^r/.test(r)?'trackRight':'tracks'}
  if(k==='wheel')return 'wheels';return k==='hull'||k==='turret'||k==='gun'||k==='engine'?k:null}
 function subFact(s){s=String(s==null?'':s);var m,k;
  if((m=/^part:(.*) (broken|destroyed|damaged|repaired)$/.exec(s))){k=subOfPart(m[1]);return {id:k||'part:'+m[1],k:k||'part',x:m[1],state:m[2]==='repaired'?'works':m[2]}}
  if(s==='crew:all dead')return {id:'crewAll',k:'crewAll',x:'',state:'dead'};
  if((m=/^crew:(.*) dead$/.exec(s)))return {id:'crew:'+m[1],k:'crew',x:m[1],state:'dead'};
  if((m=/^weapon:(.*) off$/.exec(s))){k=subOfPart(m[1]);return k?{id:k,k:k,x:m[1],state:'off'}:{id:'weapon:'+m[1],k:'weapon',x:m[1],state:'off'}}
  if((m=/^aim:(.*) frozen$/.exec(s))){k=subOfPart(m[1]);return k?{id:k,k:k,x:m[1],state:'off'}:{id:'aim:'+m[1],k:'aim',x:m[1],state:'off'}}
  if(s==='cannot move')return {id:'move',k:'move',x:'',state:'off'};return null}
 function subsystems(facts){var by={},seen=[];(facts||[]).forEach(function(f){if(!f)return;var s=subFact(f.fact),c=num(f.chance,0);if(!s||!(c>0))return;
   var r=by[s.id];if(!r){r=by[s.id]={id:s.id,k:s.k,x:s.x,state:null,chance:0,at:null,facts:[]};seen.push(r)}r.facts.push({fact:String(f.fact),chance:c});
   if(r.state==null||SUB_RANK[s.state]>SUB_RANK[r.state]||(s.state===r.state&&c>r.chance)){r.state=s.state;r.chance=c;r.at=f.at||null}});
  function rank(r){var i=SUB_ORDER.indexOf(r.k);return i>=0?i:r.k==='crew'?SUB_ORDER.length:SUB_ORDER.length+1}
  return seen.map(function(r,i){return {r:r,i:i}}).sort(function(a,b){return rank(a.r)-rank(b.r)||a.i-b.i}).map(function(x){return x.r})}
 // a script file in the Editor page: the link page.js as2Link understands (key: opens the file that wins in the mod's load order;
 // a game file opens in a read only tab)
 function fileLink(file,line){if(!file)return null;var n=num(line,0);return 'key:'+String(file)+(n>0?':'+Math.floor(n):'')}
 // origin badge: words, class and tooltip; the mod's name in the words for another mod, in the tooltip for the picked mod
 function badgeInfo(s,title,mod){var t=s==='other mod'&&mod?tx('models.armor.fxfrom.otherModNamed',{m:mod}):tk('models.armor.fxfrom',fromKey(s));
  var ti=s==='mod'&&mod?[tx('models.armor.fx.inMod',{m:mod}),title].filter(Boolean).join('; '):title||'';
  return {cls:s==='unsaved'?'badge review':s==='mod'||s==='other mod'?'badge info':'badge',text:t,title:ti}}
 // the 3D view after a shot: {volume id: through|bounce|stop|blast}: plates by their result, volumes a blast reached (chance above 0);
 // a plate's result wins over the blast. Short volume names (as armorsim gives them) become the view's ids through the table rows.
 function fxVolCats(j,shot,rows){var m={},pl=(j&&j.engine&&Array.isArray(j.engine.plates)?j.engine.plates:null)||(shot&&shot.plates)||[];
  (j&&j.blasts||[]).forEach(function(b){(b&&b.hits||[]).forEach(function(h){if(h&&h.volume&&num(h.chanceIfBlast,num(h.chance,1))>0)m[h.volume]='blast'})});
  pl.forEach(function(p){if(p&&p.volume){var c=catOf(p.result);if(c!=='none')m[p.volume]=c}});
  var out={};Object.keys(m).forEach(function(v){var ids=v.indexOf('/')>=0?[v]:(rows||[]).filter(function(r){return r&&r.id&&(r.name===v||short(r.id)===v)}).map(function(r){return r.id});
   if(!ids.length)ids=[v];ids.forEach(function(id){out[id]=m[v]})});return out}
 // the shot line up to where the shell stopped: {from, to} in the units of ray.origin, or null when the result has no end point
 function fxLine(j,shot){var r=(j&&j.ray)||(shot&&shot.ray),e=groundOf(j)||j&&j.engine&&j.engine.end&&j.engine.end.point;
  if(!r||!Array.isArray(r.origin)||!Array.isArray(e)||e.length<3)return null;return {from:r.origin.slice(0,3),to:e.slice(0,3)}}
 // jet hits -> [{name, chance (given the jet first), events}]
 function jetHits(hits){return (hits||[]).filter(Boolean).map(function(h){return {name:short(h.volume||h.part||'?'),chance:num(h.chanceIfJet,num(h.chance,null)),events:(Array.isArray(h.events)?h.events:[]).join(', ')}})}
 // a fire of the shell's filling in words: {k under models.armor.fxfire, s:{p, t}}; reaches / ignites = share of all runs, t = median
 // time it catches (else the unit's inflammation time)
 function fireSay(f){f=f||{};var ig=num(f.ignites,0),a=f.igniteAt,t=a&&typeof a==='object'?num(a.median,num(a.first,null)):null;if(t==null)t=num(f.inflammation,null);
  if(!(ig>0))return num(f.reaches,0)>0?{k:'reachesNoCatch',s:{p:pct(f.reaches),t:''}}:{k:'never',s:{p:'',t:''}};
  return t==null?{k:'catches',s:{p:pct(ig),t:''}}:{k:'catchesAfter',s:{p:pct(ig),t:r1(t)}}}
 function untilOk(v){if(v==null||v==='')return true;var n=Number(v);return isFinite(n)&&n>=1&&n<=600}
 // drawing (el = the page's element maker; tx global); exported for the test with a stub el
 function factText(s){var k=factKey(s);return tx(['models.armor.fxf',k.k].join('.'),{x:k.x})}
 // the exact copy a value was read from: loc.layer (mod folder, game folder or pak, absolute) + loc.rel (path inside it); also on an
 // object from. -> {path} (a file on disk), {pak, rel} (inside a pak: the Editor opens the copy the game loads), or null (old result)
 function exactOf(loc){var o=loc&&loc.from&&typeof loc.from==='object'?loc.from:loc;if(!o||!o.layer||!o.rel)return null;
  var ly=String(o.layer).replace(/[\\/]+$/,''),rel=String(o.rel).replace(/^[\\/]+/,'');if(!ly||!rel)return null;
  if(/\.pak$/i.test(ly))return {pak:ly,rel:rel};var bs=ly.indexOf('\\')>=0;return {path:ly+(bs?'\\':'/')+(bs?rel.replace(/\//g,'\\'):rel)}}
 function baseName(p){p=String(p||'');var i=Math.max(p.lastIndexOf('/'),p.lastIndexOf('\\'));return i<0?p:p.slice(i+1)}
 // loc = the record the badge is for ({ file, line, mod, layer, rel }): the mod's name, and an Open button when it names a file
 function badgeFrom(el,s,title,loc){var b=badgeInfo(s,title,loc&&loc.mod),a={class:b.cls,text:b.text};if(b.title)a.title=b.title;var sp=el('span',a),lk=loc?fileLink(loc.file,loc.line):null,ex=loc?exactOf(loc):null;
  if(!lk&&!(ex&&ex.path))return sp;var ln=num(loc.line,0)>0?':'+loc.line:'',where=String(loc.file||(ex&&ex.rel)||'')+ln;
  var tip=ex&&ex.path?tx('models.armor.fx.openFileTip',{f:ex.path+ln}):ex&&ex.pak?tx('models.armor.fx.openPakTip',{f:where,p:baseName(ex.pak)}):tx('models.armor.fx.openTip',{f:where});
  return el('span',{},[sp,el('span',{text:' '}),el('button',{type:'button',class:'link',text:tx('models.armor.fx.open'),title:tip,onclick:function(){openLoc(loc,lk)}})])}
 // the exact file through the Editor's own reference for a file by its full path (read only, tools/ide/README.md {mod, path});
 // a pak copy, an old result or no Editor script: the link (the copy that wins in the load order)
 function openPath(p,line){try{var W=typeof window!=='undefined'?window:null,I=W&&W.IDE;if(!I||typeof I.open!=='function')return false;
   if(typeof S!=='undefined'&&S&&S.sec&&!S.sec.ide)return false;if(typeof show==='function'&&!(typeof S!=='undefined'&&S&&S.cur==='ide'))show('ide');
   var r=I.open({mod:typeof S!=='undefined'&&S?S.mod||null:null,path:p},Math.max(0,Math.floor(num(line,0))),0);if(r&&typeof r.catch==='function')r.catch(function(){});return true}catch(e){return false}}
 function openLoc(loc,lk){var ex=exactOf(loc);if(ex&&ex.path&&openPath(ex.path,loc.line))return;if(lk)openLink(lk);else if(typeof toast==='function')toast(tx('models.armor.fx.noEditor'))}
 function openLink(lk){var ok=false;try{ok=typeof as2Link==='function'&&as2Link(lk)}catch(e){ok=false}if(!ok&&typeof toast==='function')toast(tx('models.armor.fx.noEditor'))}
 // a shell the chosen gun does not load (effects ammoNotLoaded: { asked, weapon, loads }) -> one warning sentence, or '' when none
 function notLoadedText(a,keys){if(!a||typeof a!=='object')return '';keys=keys||['models.armor.fx.notLoaded','models.armor.fx.notLoadedNone'];
  var l=(Array.isArray(a.loads)?a.loads:[]).filter(function(x){return x!=null&&x!==''}).map(String);
  return tx(l.length?keys[0]:keys[1],{w:String(a.weapon||'?'),a:String(a.asked||'?'),l:l.join(', ')})}
 // the engine's crew notes (engine.crewNotes [{key}]) in the page's words; the English engine.crewNote when the list is absent or
 // names a key the page does not know
 var CREWK={shot:'models.armor.crew.shot',blast:'models.armor.crew.blast'};
 function crewLines(j){var e=j&&j.engine;if(!e)return [];var ns=Array.isArray(e.crewNotes)?e.crewNotes:null,out=[],bad=!ns;
  (ns||[]).forEach(function(n){var k=n&&CREWK[n.key];if(!k){bad=true;return}var t=tx(k);if(out.indexOf(t)<0)out.push(t)});
  if(bad&&e.crewNote)out.push(String(e.crewNote));return out}
 function byTitle(b){if(!b)return '';return [b.event,b.file?b.file+(b.line!=null?':'+b.line:''):''].filter(Boolean).join(' ')}
 function whenText(at){var s=num(at!=null&&typeof at==='object'?at.median:at,null);if(s==null)return '';return s<=0?tx('models.armor.fx.atOnce'):tx('models.armor.fx.after',{s:r1(s)})}
 function chanceText(lo,hi){if(lo==null)return '';return hi==null||pct(lo)===pct(hi)?pct(lo):tx('models.armor.fx.range',{a:pct(lo),b:pct(hi)})}
 function lineText(l){return l.fold?tx(['models.armor.fxfold',l.k].join('.'),{x:l.names.join(', ')}):tx(['models.armor.fxf',l.k].join('.'),{x:l.x})}
 function fxFlat(el,j,prev){var pm={};if(prev)(prev.facts||[]).forEach(function(x){pm[x.fact]=x.chance});
  if(!(j.facts||[]).length)return el('div',{class:'hint',text:tx('models.armor.fx.nothing')});
  var tb=el('table',{class:'tbl'}),hd=[tx('models.armor.fx.colWhat'),tx('models.armor.fx.colChance')];if(prev)hd.push(tx('models.armor.fx.colBefore'));hd.push(tx('models.armor.fx.colWhen'));
  tb.appendChild(el('tr',{},hd.map(function(x){return el('th',{text:x})})));
  j.facts.forEach(function(x){var c=[el('td',{text:factText(x.fact)}),el('td',{text:pct(x.chance)})];if(prev)c.push(el('td',{text:pm[x.fact]==null?pct(0):pct(pm[x.fact])}));
   c.push(el('td',{text:x.at?tx('models.armor.fx.after',{s:r1(x.at.median)}):''}));tb.appendChild(el('tr',{},c))});
  if(prev)(prev.facts||[]).forEach(function(x){if(!j.facts.some(function(y){return y.fact===x.fact}))tb.appendChild(el('tr',{},[el('td',{text:factText(x.fact)}),el('td',{text:pct(0)}),el('td',{text:pct(x.chance)}),el('td',{text:''})]))});
  return el('div',{style:'overflow-x:auto'},[tb])}
 function fxLines(el,lines,pc,gt){var ul=el('ul',{style:'margin:2px 0 6px 0;padding-left:20px'});
  lines.forEach(function(l){var t=[chanceText(l.lo,l.hi)];if(l.at!=null&&l.at!==gt)t.push(whenText(l.at));
   if(pc){var b=l.facts.map(function(f){return num(pc[f],0)});t.push(tx('models.armor.fx.before',{p:chanceText(Math.min.apply(null,b),Math.max.apply(null,b))}))}
   var title=l.fold?l.names.map(function(n,i){return n+(l.chances[i]==null?'':' '+pct(l.chances[i]))}).join(', '):null;
   ul.appendChild(el('li',{title:title},[el('span',{text:lineText(l)}),el('span',{class:'hint',text:' '+t.filter(Boolean).join(', ')})]))});
  return ul}
 // the tidy tree: causes drawn as groups are, with the other ways a cause was reached and its script steps (closed)
 function fxCauses(el,j,prev){var P=prev?{facts:prev.facts,groups:Array.isArray(prev.causes)?prev.causes:prev.groups}:null;return fxGroups(el,{facts:j.facts,groups:j.causes},P,true)}
 function fxSteps(el,c){var st=(c&&Array.isArray(c.steps)?c.steps:[]).filter(Boolean);if(!st.length)return null;var ul=el('ul',{style:'margin:2px 0;padding-left:20px'});
  st.forEach(function(s){var li=el('li',{},[el('code',{text:String(s.event||'?')})]);if(s.file){li.appendChild(el('span',{text:' '}));li.appendChild(el('code',{text:s.file+(s.line!=null?':'+s.line:'')}))}
   if(s.from||s.file){li.appendChild(el('span',{text:' '}));li.appendChild(badgeFrom(el,s.from,byTitle(s),s))}ul.appendChild(li)});
  return el('details',{},[el('summary',{class:'hint',text:tx('models.armor.fx.steps',{n:st.length})}),ul])}
 function fxGroups(el,j,prev,tidy){var box=el('div'),ch=chanceMap(j.facts),pc=prev?chanceMap(prev.facts):null,pg=prev&&Array.isArray(prev.groups)?sigChances(prev.groups):null,pgf=pg?groupFactChances(prev):null;
  box.appendChild(el('div',{style:'font-weight:bold;margin-top:6px',text:tx('models.armor.fx.byCause')}));
  var fl=flatGroups(j.groups),lf=looseFacts(j),byId={};(j.groups||[]).forEach(function(g){if(g&&g.id!=null)byId[String(g.id)]=g});
  if(!fl.length&&!lf.length)box.appendChild(el('div',{class:'hint',text:tx('models.armor.fx.nothing')}));
  fl.forEach(function(n){var g=n.g,cs=g.cause||{},c=causeKey(cs),head=el('div',{});
   if(n.depth)head.appendChild(el('span',{class:'hint',text:tx('models.armor.fx.leadsTo')+' '}));
   head.appendChild(el('span',{style:'font-weight:bold',text:tx(['models.armor.fxc',c.k].join('.'),c.s)}));
   if(c.code){head.appendChild(el('span',{text:' '}));head.appendChild(el('code',{text:c.code}))}
   if(cs.file||cs.from){var ti=byTitle(cs);if(cs.by)ti=[ti,tx('models.armor.fx.setOffBy',{x:byTitle(cs.by)})].filter(Boolean).join('; ');head.appendChild(el('span',{text:' '}));head.appendChild(badgeFrom(el,cs.from,ti,cs))}
   var sig=causeSig(cs),gt=g.at&&typeof g.at==='object'?num(g.at.median,num(g.at.first,null)):null,meta=[pct(g.chance),whenText(g.at)];if(pg)meta.push(tx('models.armor.fx.before',{p:pct(pg[sig]||0)}));
   head.appendChild(el('span',{class:'hint',text:' '+meta.filter(Boolean).join(', ')}));
   (g.tags||[]).forEach(function(t){head.appendChild(el('span',{text:' '}));head.appendChild(el('span',{class:'badge info',text:'+ '+t,title:tx('models.armor.fx.tagHere')}))});
   var kids=[head];
   if(tidy){var av=alsoVia(g,byId);if(av.length)kids.push(el('div',{class:'hint',text:tx('models.armor.fx.also',{x:av.map(function(v){return (v.cause?causeText(v.cause):v.parent==null?tx('models.armor.fx.viaShot'):v.parent)+(v.chance==null?'':' '+pct(v.chance))}).join(', ')})}))}
   kids.push(fxLines(el,groupLines(g,ch),pgf?pgf[sig]||{}:pc,gt));
   if(tidy){var sd=fxSteps(el,g);if(sd)kids.push(sd)}
   box.appendChild(el('div',{style:n.depth?'margin-left:'+(n.depth*18)+'px;border-left:2px solid var(--line);padding-left:6px':'margin-top:4px'},kids))});
  if(lf.length){box.appendChild(el('div',{style:'font-weight:bold;margin-top:4px',text:tx('models.armor.fx.ungrouped')}));box.appendChild(fxLines(el,foldFacts(lf,ch),pc,null))}
  var gn=gone(j,prev),gt=gn.groups.map(function(g){return causeText(g.cause)+' ('+tx('models.armor.fx.before',{p:pct(g.chance)})+')'}).concat(gn.facts.map(function(x){return factText(x.fact)+' ('+tx('models.armor.fx.before',{p:pct(x.chance)})+')'}));
  if(gt.length)box.appendChild(el('div',{class:'hint',text:tx('models.armor.fx.gone')+' '+gt.join(', ')}));
  return box}
 function fxTags(el,j){if(!Array.isArray(j.tags)||!j.tags.length)return null;var r=tagRows(j.tags),box=el('div',{style:'margin-top:6px'});
  box.appendChild(el('div',{style:'font-weight:bold',text:tx('models.armor.fx.tags')}));
  if(r.add.length){var tb=el('table',{class:'tbl'});
   r.add.forEach(function(t){tb.appendChild(el('tr',{title:byTitle(t.by)||null},[el('td',{},[el('code',{text:t.tag})]),el('td',{text:pct(t.chance)}),el('td',{text:whenText(t.at)}),
    el('td',{},[t.by?badgeFrom(el,t.by.from,byTitle(t.by),t.by):el('span',{class:'badge',text:tx('models.armor.fx.byGame')})])]))});
   box.appendChild(el('div',{style:'overflow-x:auto'},[tb]))}
  else box.appendChild(el('div',{class:'hint',text:tx('models.armor.fx.noTags')}));
  if(r.remove.length)box.appendChild(el('div',{class:'hint',text:tx('models.armor.fx.tagsRemoved')+' '+r.remove.map(function(t){return t.tag+' '+pct(t.chance)}).join(', ')}));
  return box}
 function fxBlasts(el,j){if(!Array.isArray(j.blasts)||!j.blasts.length)return null;var box=el('div',{style:'margin-top:6px'});
  box.appendChild(el('div',{style:'font-weight:bold',text:tx('models.armor.fx.blasts')}));
  j.blasts.filter(Boolean).sort(byTime).forEach(function(b){var w=blastWho(b),hg=hitGroups(b.hits),m=blastM(b),row=el('div',{style:'margin:2px 0'}),size=[];
   row.appendChild(el('span',{text:tx(['models.armor.fxblast',w.k].join('.'),w.s)}));
   if(b.by){row.appendChild(el('span',{text:' '}));row.appendChild(badgeFrom(el,b.by.from,byTitle(b.by),b.by))}
   if(num(b.energy,null)!=null)size.push(tx('models.armor.fx.blastCharge',{e:r1(b.energy)}));
   if(m)size.push(tx('models.armor.fx.blastRadius',{i:r1(m.i),o:r1(m.o)}));
   row.appendChild(el('span',{class:'hint',text:' '+[pct(b.chance),whenText(b.at)].concat(size).filter(Boolean).join(', ')}));
   row.appendChild(el('div',{style:'margin-left:18px',text:hg.length?hg.map(function(x){return tx(['models.armor.fxhitby',x.k].join('.'),{x:x.items.map(function(i){return i.name+(i.chance==null?'':' '+pct(i.chance))}).join(', ')})}).join('. '):tx('models.armor.fx.blastNothing')}));
   box.appendChild(row)});
  return box}
 // one row per part of the vehicle with any result: the worst state, its chance and time
 function fxSubs(el,j){var rows=subsystems(j&&j.facts);if(!rows.length)return null;var box=el('div',{style:'margin-top:6px'}),tb=el('table',{class:'tbl'});
  box.appendChild(el('div',{style:'font-weight:bold',text:tx('models.armor.fx.subs')}));
  tb.appendChild(el('tr',{},[tx('models.armor.fx.colPart'),tx('models.armor.fx.colWhat'),tx('models.armor.fx.colChance'),tx('models.armor.fx.colWhen')].map(function(x){return el('th',{text:x})})));
  rows.forEach(function(r){var pw=r.k==='part'?partWords(r.x):'',name=[el('span',{text:tx(['models.armor.sub',r.k].join('.'),{x:r.x})})];if(pw)name.push(el('span',{class:'hint',text:' '+pw}));
   tb.appendChild(el('tr',{title:r.facts.map(function(f){return factText(f.fact)+' '+pct(f.chance)}).join(', ')},[el('td',{},name),
    el('td',{},[el('span',{class:r.state==='works'?'badge':SUB_RANK[r.state]>=3?'badge badx':'badge review',text:tk('models.armor.subst',r.state)})]),el('td',{text:pct(r.chance)}),el('td',{text:whenText(r.at)})]))});
  box.appendChild(el('div',{style:'overflow-x:auto'},[tb]));return box}
 // the main list of the panel: the per part summary, then the tidy tree (causes), the full tree (groups, also when "Show every script
 // step" is on), or the flat table (results before groups existed); then tags and blasts. The switch redraws its own box in place.
 function fxMain(el,j,prev){var tree=el('div');
  function fill(){tree.textContent='';var k=mainKind(j,ST.fxAll);
   if(Array.isArray(j.causes)&&Array.isArray(j.groups)){var cb=el('input',{type:'checkbox',onchange:function(){ST.fxAll=!!cb.checked;fill()}});cb.checked=!!ST.fxAll;
    tree.appendChild(el('label',{style:'display:block;margin-top:6px'},[cb,el('span',{text:' '+tx('models.armor.fx.allSteps')})]))}
   tree.appendChild(k==='causes'?fxCauses(el,j,prev):k==='groups'?fxGroups(el,j,prev):fxFlat(el,j,prev))}
  fill();return [fxSubs(el,j),tree,fxTags(el,j),fxBlasts(el,j),fxJets(el,j),fxFires(el,j)].filter(Boolean)}
 function reachedText(items){return tx('models.armor.fx.reached',{x:items.map(function(i){return i.name+(i.chance==null?'':' '+pct(i.chance))}).join(', ')})}
 function fxJets(el,j){var js=(j&&Array.isArray(j.jets)?j.jets:[]).filter(Boolean);if(!js.length)return null;var box=el('div',{style:'margin-top:6px'});
  box.appendChild(el('div',{style:'font-weight:bold',text:tx('models.armor.fx.jets')}));
  js.sort(byTime).forEach(function(x){var row=el('div',{style:'margin:2px 0'}),hs=jetHits(x.hits);
   row.appendChild(el('span',{text:tx('models.armor.fx.jetLine',{d:r1(x.damage),m:r1(x.distance)})}));
   row.appendChild(el('span',{class:'hint',text:' '+[pct(x.chance),whenText(x.at)].filter(Boolean).join(', ')}));
   var en=(x.ends||[]).filter(Boolean);if(en.length)row.appendChild(el('div',{style:'margin-left:18px',text:tx('models.armor.fx.ends')+' '+en.map(function(e){return tk('models.armor.fxend',endKey(e.result))+(e.volume?' ('+short(e.volume)+')':'')+' '+pct(e.chance)}).join(', ')}));
   row.appendChild(el('div',{style:'margin-left:18px',title:hs.filter(function(h){return h.events}).map(function(h){return h.name+': '+h.events}).join('; ')||null,text:hs.length?reachedText(hs):tx('models.armor.fx.blastNothing')}));
   box.appendChild(row)});return box}
 function fxFires(el,j){var fs=(j&&Array.isArray(j.fires)?j.fires:[]).filter(Boolean);if(!fs.length)return null;var box=el('div',{style:'margin-top:6px'});
  box.appendChild(el('div',{style:'font-weight:bold',text:tx('models.armor.fx.fires')}));
  fs.forEach(function(f){var row=el('div',{style:'margin:2px 0'}),w=fireSay(f),vs=(f.volumes||[]).filter(Boolean).map(function(v){return {name:short(v.volume||'?'),chance:num(v.chance,null)}});
   row.appendChild(el('span',{text:tx(['models.armor.fxfire',w.k].join('.'),w.s)}));
   row.appendChild(el('span',{class:'hint',text:' '+[tx('models.armor.fx.fireBurst',{p:pct(f.chance)}),tx('models.armor.fx.fireSize',{r:r1(f.radius),h:r1(f.heating),t:r1(f.time)})].join(', ')}));
   if(num(f.inflammation,null)!=null){var il=el('div',{style:'margin-left:18px'},[el('span',{text:tx('models.armor.fx.fireInfl',{s:r1(f.inflammation)})})]);
    if(f.inflammationAt){il.appendChild(el('span',{text:' '}));il.appendChild(badgeFrom(el,f.inflammationAt.from,byTitle(f.inflammationAt),f.inflammationAt))}row.appendChild(il)}
   if(vs.length)row.appendChild(el('div',{style:'margin-left:18px',text:reachedText(vs)}));
   if((f.notes||[]).length)row.appendChild(el('div',{class:'hint',style:'margin-left:18px',text:f.notes.map(plain).join(' ')}));
   box.appendChild(row)});return box}

 EXT_SCREENS.models.subs.armor=function(ctx){
  var g=++ST.gen,el=ctx.el,clear=ctx.clear,say=ctx.say,k2=ctx.k2,set=ctx.set||{},mod=ctx.mod,target=set.target||'';
  // blocks (sub/README.md "Blocks"): the card 'armor' holds one container per section (who, thick, map, shot, fx); each message line
  // that say() re-classes is wrapped in a leaf; tables, the map canvas and the result areas are one leaf each
  function L(id,kids,a){a=a||{};a.blk='armor.'+id;return el('div',a,kids)}
  function C(id,kids,box,name,a){a=a||{};a.blk='armor.'+id;a.box=box||'col';if(name)a['data-blkname']=name;return el('div',a,kids)}
  var card=el('div',{class:'card',style:'margin-top:10px',blk:'armor',box:'col','data-blkname':tx('models.armor.title')});ctx.body.appendChild(card);
  card.appendChild(L('title',[el('h3',{text:tx('models.armor.title')})]));
  if(!mod){card.appendChild(L('need',[],{class:'hint',text:tx('models.armor.needMod')}));return}
  if(!target){card.appendChild(L('need',[],{class:'hint',text:tx('models.armor.needUnit')}));return}
  var GOH=typeof S!=='undefined'&&!!S&&S.gameId==='goh',gohMap=null;
  var key=mod+'|'+target;if(ST.key!==key){ST.key=key;ST.table=null;ST.map=null;ST.shot=null;ST.shotAt=null;ST.edit=null;ST.cell=null;ST.fx=null;ST.fxPrev=null;ST.fxBody=null}
  ST.from3d=FROM3.indexOf(LS.get('models.armor.from3d','camera'))>=0?LS.get('models.armor.from3d','camera'):'camera';
  // gun, shell and range are shared with the Shot tool: read them again each time the part is drawn
  var lg=LS.get('models.armor.gun','')||'',la=LS.get('models.armor.ammo','')||'',lr=Number(LS.get('models.armor.range',ST.range));
  if(lg!==ST.gun){ST.gun=lg;ST.shells=null;ST.map=null}if(la!==ST.ammo){ST.ammo=la;ST.map=null}if(isFinite(lr)&&lr>=0&&lr<=5000&&lr!==ST.range){ST.range=lr;ST.map=null}
  function live(){return g===ST.gen&&card.isConnected!==false}
  function call(url,body,ok,fail){api(url,body,{what:tx('models.armor.job.armor')}).then(function(j){if(live())ok(j)}).catch(function(e){if(live()&&fail)fail(e)})}
  function sideWord(s){return tk('models.armor.side',(typeof s==='number'?SIDES[s]:s))}
  function where(vol,side){return short(vol)+' ('+sideWord(side)+')'}
  function nameCell(name,title){var pw=partWords(name),kids=[el('code',{text:name,title:title})];if(pw)kids.push(el('span',{class:'hint',text:' '+pw}));return el('td',{},kids)}

  // ---------- 1. who shoots ----------
  var who=C('who',[],'col',tx('models.armor.who'),{style:'margin-bottom:10px'}),qIn=el('input',{type:'search',autocomplete:'off','aria-label':tx('models.armor.gunSearch'),placeholder:tx('models.armor.gunPh'),style:'min-width:16em'});
  var hits=L('who.hits',[],{class:'row',style:'flex-wrap:wrap;gap:4px','data-blkname':tx('models.armor.blk.hits')}),gunSay=el('span',{class:'hint'}),shellSel=el('select',{'aria-label':tx('models.armor.shell')});
  var rangeIn=el('input',{type:'number',min:'0',max:'5000',step:'10','aria-label':tx('models.armor.range'),style:'width:6em'});rangeIn.value=String(ST.range);
  var penSay=el('div'),whoMsg=el('div',{class:'hint'});
  who.appendChild(L('who.title',[el('h4',{text:tx('models.armor.who')})]));
  who.appendChild(L('who.gun',[el('span',{text:tx('models.armor.gun')}),qIn,gunSay],{class:'row'}));who.appendChild(hits);
  who.appendChild(C('who.shell',[L('who.f.shell',[el('span',{text:tx('models.armor.shell')}),shellSel],{class:'row'}),L('who.f.range',[el('span',{text:tx('models.armor.range')}),rangeIn,el('span',{text:tx('models.armor.m')})],{class:'row'})],'row',tx('models.armor.blk.shell'),{class:'row'}));
  who.appendChild(L('who.pen',[penSay],{'data-blkname':tx('models.armor.blk.pen')}));who.appendChild(L('who.msg',[whoMsg],{'data-blkname':tx('models.armor.blk.msg')}));card.appendChild(who);
  function drawGun(){gunSay.textContent=ST.gun?tx('models.armor.gunIs',{g:ST.gun}):tx('models.armor.noGun')}
  // the gun box (searchKit, tools/gui/README.md): the whole gun list of the game + mod is asked for once per mod and kept (ST.gunIx,
  // names in lower case), every keystroke filters it here; history key models.armor.gun, Browse = the file picker on the game data at set/stuff (the gun files; the file name is the gun)
  function gunsLoad(cb){var G=ST.gunIx;if(G&&G.mod===mod&&G.list){cb(G);return}
   if(!G||G.mod!==mod)G=ST.gunIx={mod:mod,list:null,lo:null,cbs:[]};G.cbs.push(cb);if(G.cbs.length>1)return;
   api('/api/x/models/armor/guns',{mod:mod,q:'',limit:5000},{what:tx('models.armor.job.guns')}).then(function(j){var a=j.guns||[];G.list=a;G.lo=a.map(function(x){return String(x.name).toLowerCase()});var c=G.cbs;G.cbs=[];c.forEach(function(f){f(G)})},
    function(e){G.cbs=[];if(ST.gunIx===G)ST.gunIx=null;if(live())say(whoMsg,e.cancelled?'hint':'err',e.message)})}
  function gunHits(G,q){var w=String(q).toLowerCase().split(/\s+/).filter(Boolean),a=[],b=[];
   G.list.forEach(function(x,i){var l=G.lo[i];if(w.every(function(t){return l.indexOf(t)>=0}))(w.length&&l.indexOf(w[0])===0?a:b).push(x)});return a.concat(b)}
  function gunItem(x){return {label:x.name,value:x.name,group:k2('models.armor.grp',String(x.group).replace('/','_'))}}
  var gunKit=typeof searchKit==='function'?searchKit(qIn,{key:'models.armor.gun',
   index:function(q,done){gunsLoad(function(G){var r=gunHits(G,q);done(r.slice(0,30).map(gunItem),Math.max(0,r.length-30))})},
   browse:{mode:'file',view:'data',start:'set/stuff',toValue:function(p,e){return EXT_SCREENS.models.pickAt.name((e&&e.name)||p)}},
   onPick:function(v){pickGun(v)}}):null;
  function search(){var q=qIn.value.trim();
   gunsLoad(function(G){if(!live()||qIn.value.trim()!==q)return;clear(hits);var r=gunHits(G,q);
    r.slice(0,24).forEach(function(x){hits.appendChild(el('button',{type:'button',text:x.name,title:k2('models.armor.grp',x.group.replace('/','_')),onclick:function(){pickGun(x.name)}}))});
    if(!r.length)hits.appendChild(el('span',{class:'hint',text:tx('models.armor.noGuns')}));
    else if(r.length>24)hits.appendChild(el('span',{class:'hint',text:tx('models.armor.moreGuns',{n:r.length-24})}))})}
  qIn.addEventListener('input',search);
  function pickGun(name){ST.gun=name;LS.set('models.armor.gun',name);clear(hits);qIn.value='';drawGun();ST.shells=null;ST.ammo='';loadShells()}
  function loadShells(){clear(shellSel);if(!ST.gun){drawPen();return}say(whoMsg,'hint',tx('models.armor.readingShells'));
   call('/api/x/models/armor/shells',{mod:mod,weapon:ST.gun},function(j){ST.shells=j.shells||[];say(whoMsg,'hint','');drawShells();
    if(!ST.shells.length)say(whoMsg,'err',tx('models.armor.noShells'));loadMap()},function(e){ST.shells=[];say(whoMsg,e.cancelled?'hint':'err',e.message);drawShells()})}
  function drawShells(){clear(shellSel);var list=ST.shells||[];
   if(list.length&&!list.some(function(s){return s.ammo===ST.ammo})){ST.ammo=list[0].ammo;LS.set('models.armor.ammo',ST.ammo)}
   list.forEach(function(s){var o=el('option',{value:s.ammo,text:s.ammo+' · '+kindWord(s.kind,s.cumulative)+(s.calibre?' · '+s.calibre+' '+tx('models.armor.mm'):'')});if(s.ammo===ST.ammo)o.selected=true;shellSel.appendChild(o)});
   drawPen()}
  shellSel.addEventListener('change',function(){ST.ammo=shellSel.value;LS.set('models.armor.ammo',ST.ammo);drawPen();ST.map=null;loadMap()});
  rangeIn.addEventListener('change',function(){var v=Number(rangeIn.value);if(!isFinite(v)||v<0||v>5000){say(whoMsg,'err',tx('models.armor.badRange'));return}
   say(whoMsg,'hint','');ST.range=v;LS.set('models.armor.range',v);drawPen();ST.map=null;loadMap()});
  function curShell(){var l=ST.shells||[];for(var i=0;i<l.length;i++)if(l[i].ammo===ST.ammo)return l[i];return null}
  function drawPen(){var s=curShell();if(!s){penSay.textContent=ST.gun?'':tx('models.armor.pickGun');return}
   var p=penAt(s.penetration,ST.range);
   penSay.textContent=p==null?tx('models.armor.penUnknown'):p<=0?tx('models.armor.penNone',{m:ST.range}):tx('models.armor.pen',{mm:Math.round(p),m:ST.range})}
  function shooter(){var b={mod:mod,target:target,weapon:ST.gun,ammo:ST.ammo,range:ST.range},k;if(GOH&&ST.gohRules)for(k in ST.gohRules)if(ST.gohRules[k]!=null&&ST.gohRules[k]!=='')b[k]=ST.gohRules[k];return b}
  function ready(){return !!(ST.gun&&ST.ammo)}

  // ---------- 2. thickness table + 4. edit in place ----------
  var tWrap=C('thick',[],'col',tx('models.armor.thick'),{style:'margin-bottom:10px'}),tMsg=el('div',{class:'hint'}),tBox=L('thick.table',[],{'data-blkname':tx('models.armor.blk.table')}),editBox=L('thick.edit',[],{'data-blkname':tx('models.armor.blk.edit')});
  tWrap.appendChild(L('thick.title',[el('h4',{text:tx('models.armor.thick')})]));tWrap.appendChild(L('thick.msg',[tMsg],{'data-blkname':tx('models.armor.blk.msg')}));tWrap.appendChild(tBox);tWrap.appendChild(editBox);card.appendChild(tWrap);
  function loadTable(){say(tMsg,'hint',tx('models.armor.reading'));
   call('/api/x/models/armor/table',{mod:mod,target:target},function(j){ST.table=j;
    if(!(j.rows||[]).length){say(tMsg,'err',tx('models.armor.noTable'));return}say(tMsg,'hint','');drawTable();paintView()},
    function(e){ST.table=null;if(e.cancelled){say(tMsg,'hint',e.message);clear(tBox);return}say(tMsg,'err',tx('models.armor.noModel'));clear(tBox);tBox.appendChild(el('details',{},[el('summary',{text:tx('models.armor.details')}),el('pre',{style:'white-space:pre-wrap',text:e.message})]))})}
  function ruleWords(s){var r=String(s.rule||'none');if(r==='own')return tx('models.armor.rule.own');if(r.indexOf('area')===0)return tx('models.armor.rule.area',{a:r.slice(5)});return tx('models.armor.rule.none')}
  function srcWords(s){return ruleWords(s)+(s.at?' · '+s.at:'')+(s.macro&&s.macro!==s.at?' · '+tx('models.armor.via',{m:s.macro}):'')}
  function drawTable(){clear(tBox);var t=ST.table;if(!t)return;
   var sm=t.summary||{},hu=sm.hull,tu=sm.turret;
   if(hu)tBox.appendChild(el('div',{text:tx('models.armor.hull',{v:short(hu.volume),f:hu.front,s:hu.side,r:hu.rear,t:hu.top})}));
   if(tu)tBox.appendChild(el('div',{text:tx('models.armor.turret',{v:short(tu.volume),f:tu.front,s:tu.side,r:tu.rear,t:tu.top})}));
   var tb=el('table',{class:'tbl'}),hr=el('tr',{},[el('th',{text:tx('models.armor.volume')})]);
   SIDES.forEach(function(s){hr.appendChild(el('th',{text:sideWord(s)}))});hr.appendChild(el('th',{text:tx('models.armor.note')}));tb.appendChild(hr);
   (t.rows||[]).forEach(function(row){var tr=el('tr'),vid=row.id||row.name;
    tr.appendChild(nameCell(row.name,row.id||tx('models.armor.flag.notInModel')));
    SIDES.forEach(function(sd,i){var s=(row.sides||[])[i]||{side:sd,mm:0,rule:'none'};
     var cur=ST.edit&&ST.edit.vol===vid&&ST.edit.side===sd;
     tr.appendChild(el('td',{},[el('button',{type:'button',class:cur?'primary':'',title:srcWords(s)+' · '+tx('models.armor.clickEdit'),text:String(r1(s.mm)),
      onclick:function(){ST.edit={vol:vid,name:row.name,side:sd,mm:r1(s.mm),all:false,tried:null,res:null};drawTable();drawEdit()}})]))});
    var fl=(row.flags||[]).map(function(f){return flagText(f,row.area)});
    tr.appendChild(el('td',{class:'hint',text:fl.join('; ')}));tb.appendChild(tr)});
   tBox.appendChild(el('div',{style:'overflow-x:auto'},[tb]));
   var ul=el('ul');(t.rows||[]).forEach(function(row){var seen={};(row.sides||[]).forEach(function(s){var w=srcWords(s);if(seen[w])seen[w].push(sideWord(s.side));else seen[w]=[sideWord(s.side)]});
    Object.keys(seen).forEach(function(w){ul.appendChild(el('li',{},[el('code',{text:row.name}),' '+seen[w].join(', ')+': '+w]))})});
   tBox.appendChild(el('details',{},[el('summary',{text:tx('models.armor.where')}),ul]));
   if((t.problems||[]).length)tBox.appendChild(el('div',{class:'err',text:tx('models.armor.problems',{n:t.problems.length})}));
   if(GOH)gohBox(t)}
  // Gates of Hell: every part by a percent, or the top speed, through the same edit route (preview first, then write into the mod)
  function gohBox(t){if(t.speed)tBox.insertBefore(el('div',{text:tx('models.armor.goh.speed',{v:t.speed.kmh,at:t.speed.at})}),tBox.firstChild);
   var pIn=el('input',{type:'number',min:'5',max:'1000',step:'1','aria-label':tx('models.armor.goh.scale'),style:'width:6em'}),vIn=el('input',{type:'number',min:'1',max:'1000',step:'1','aria-label':tx('models.armor.goh.newSpeed'),style:'width:6em'});
   pIn.value='100';if(t.speed)vIn.value=String(t.speed.kmh);else vIn.disabled=true;
   var gMsg=el('div',{class:'hint'}),gOut=el('div'),tried=null;
   function body(dry,shared){var b={mod:mod,target:target,dry:!!dry,shared:!!shared},p=Number(pIn.value),v=Number(vIn.value);
    if(pIn.value!==''&&p!==100){if(!isFinite(p)||p<5||p>1000)return null;b.scale=p/100}
    if(t.speed&&vIn.value!==''&&v!==t.speed.kmh){if(!isFinite(v)||v<1||v>1000)return null;b.speed=v}
    return b.scale!=null||b.speed!=null?b:null}
   function sig(){return pIn.value+'|'+vIn.value}
   var tryBtn=el('button',{type:'button',text:tx('models.armor.edit.try'),onclick:function(){go(true,false)}}),doBtn=el('button',{type:'button',class:'primary',text:tx('models.armor.edit.do'),onclick:function(){go(false,false)}});
   doBtn.disabled=true;function changed(){tried=null;doBtn.disabled=true}pIn.addEventListener('input',changed);vIn.addEventListener('input',changed);
   function go(dry,shared){var b=body(dry,shared);if(!b){say(gMsg,'err',tx('models.armor.goh.bad'));return}var s=sig();
    say(gMsg,'hint',tx(dry?'models.armor.edit.trying':'models.armor.edit.doing'));clear(gOut);
    call('/api/x/models/armor/edit',b,function(j){
     if(!dry&&j.ok){ST.table=null;ST.edit=null;clear(editBox);say(tMsg,'hint',tx('models.armor.edit.done',{n:(j.changes||[]).length}));editBox.appendChild(el('div',{class:'hint',text:tx('models.armor.edit.note',{m:mod})}));showChanges(editBox,j);loadTable();loadMap();return}
     if(j.ok){tried=s;doBtn.disabled=false;say(gMsg,'hint',tx('models.armor.edit.tried'));showChanges(gOut,j);return}
     say(gMsg,'err',j.reason||tx('models.armor.edit.refused'));
     if(j.shared&&(j.shared.volumes||[]).length){gOut.appendChild(el('div',{text:tx('models.armor.edit.others',{l:j.shared.volumes.join(', ')})}));
      gOut.appendChild(el('div',{class:'row'},[el('button',{type:'button',class:'primary',text:tx('models.armor.edit.doAll'),onclick:function(){go(false,true)}})]))}},
     function(e){say(gMsg,e.cancelled?'hint':'err',e.message)})}
   tBox.appendChild(el('div',{class:'card',style:'margin-top:6px'},[el('h4',{text:tx('models.armor.goh.tools')}),
    el('div',{class:'row'},[el('span',{text:tx('models.armor.goh.scale')}),pIn,el('span',{text:tx('models.armor.goh.newSpeed')}),vIn,tryBtn,doBtn]),gMsg,gOut]))}
  function drawEdit(){clear(editBox);var E=ST.edit;if(!E)return;
   var box=el('div',{class:'card',style:'margin-top:6px'});editBox.appendChild(box);
   box.appendChild(el('div',{text:tx('models.armor.edit.what',{v:E.name,s:sideWord(E.side),mm:E.mm})}));
   var mmIn=el('input',{type:'number',min:'0',max:'1000',step:'1','aria-label':tx('models.armor.edit.new'),style:'width:6em'});mmIn.value=String(E.newMm==null?E.mm:E.newMm);
   var allSel=el('select',{'aria-label':tx('models.armor.edit.which')});
   [['one',tx('models.armor.edit.one',{s:sideWord(E.side)})],['all',tx('models.armor.edit.all')]].forEach(function(p){var o=el('option',{value:p[0],text:p[1]});if((E.all?'all':'one')===p[0])o.selected=true;allSel.appendChild(o)});
   function changed(){E.newMm=mmIn.value;E.all=allSel.value==='all';E.tried=null;E.res=null;doBtn.disabled=true}
   mmIn.addEventListener('input',changed);allSel.addEventListener('change',changed);
   var tryBtn=el('button',{type:'button',text:tx('models.armor.edit.try'),onclick:function(){go(true,false)}});
   var doBtn=el('button',{type:'button',class:'primary',text:tx('models.armor.edit.do'),onclick:function(){go(false,false)}});
   var noBtn=el('button',{type:'button',text:tx('models.armor.edit.close'),onclick:function(){ST.edit=null;clear(editBox);drawTable()}});
   doBtn.disabled=!(E.tried&&E.tried===sig());
   box.appendChild(el('div',{class:'row'},[el('span',{text:tx('models.armor.edit.new')}),mmIn,el('span',{text:tx('models.armor.mm')}),allSel,tryBtn,doBtn,noBtn]));
   box.appendChild(el('div',{class:'hint',text:tx('models.armor.edit.note',{m:mod})}));
   var eMsg=el('div',{class:'hint'}),eOut=el('div');box.appendChild(eMsg);box.appendChild(eOut);
   function sig(){return JSON.stringify([E.vol,E.all?'all':E.side,String(E.newMm==null?E.mm:E.newMm)])}
   function go(dry,shared){var v=Number(mmIn.value);if(mmIn.value===''||!isFinite(v)||v<0||v>1000){say(eMsg,'err',tx('models.armor.edit.badMm'));return}
    E.newMm=mmIn.value;var s=sig();say(eMsg,'hint',tx(dry?'models.armor.edit.trying':'models.armor.edit.doing'));clear(eOut);
    call('/api/x/models/armor/edit',{mod:mod,target:target,volume:E.vol,side:E.all?'all':E.side,mm:v,shared:!!shared,dry:!!dry},function(j){E.res=j;
     if(dry&&j.ok)E.tried=s;
     if(!dry&&j.ok){ST.table=null;ST.map=null;ST.edit=null;clear(editBox);say(tMsg,'hint',tx('models.armor.edit.done',{n:(j.changes||[]).length}));
      editBox.appendChild(el('div',{class:'hint',text:tx('models.armor.edit.note',{m:mod})}));showChanges(editBox,j);loadTable();loadMap();return}
     drawEditResult(j,dry)},function(e){say(eMsg,e.cancelled?'hint':'err',e.message)})}
   function drawEditResult(j,dry){doBtn.disabled=!(E.tried&&E.tried===sig());
    if(j.ok){say(eMsg,'hint',tx('models.armor.edit.tried'));showChanges(eOut,j)}
    else if(j.shared&&(j.shared.volumes||[]).length){say(eMsg,'err',j.reason||tx('models.armor.edit.shared'));
     eOut.appendChild(el('div',{text:tx('models.armor.edit.others',{l:j.shared.volumes.join(', ')})}));showChanges(eOut,j);
     eOut.appendChild(el('div',{class:'row'},[el('button',{type:'button',class:'primary',text:tx('models.armor.edit.doAll'),onclick:function(){go(false,true)}})]))}
    else{say(eMsg,'err',j.reason||j.error||tx('models.armor.edit.refused'))}
    if(j.raw)eOut.appendChild(el('details',{},[el('summary',{text:tx('models.armor.details')}),el('pre',{style:'white-space:pre-wrap',text:j.raw})]))}
   if(E.res)drawEditResult(E.res,true)}
  function showChanges(box,j){(j.changes||[]).forEach(function(c){box.appendChild(el('div',{},[el('code',{text:(c.key||c.file||'')+':'+c.line}),' '+tx('models.armor.edit.from',{a:c.before,b:c.after})+(c.created?' '+tx('models.armor.edit.copied'):'')]))})}

  // ---------- 3. the map (+ the 3D view) ----------
  var mWrap=C('map',[],'col',tx('models.armor.map'),{style:'margin-bottom:10px'}),vBtns=el('div',{class:'row',role:'group'}),mMsg=el('div',{class:'hint'});
  var modeSel=el('select',{'aria-label':tx('models.armor.colourBy')});
  [['result',tx('models.armor.byResult')],['mm',tx('models.armor.byMm')]].forEach(function(p){var o=el('option',{value:p[0],text:p[1]});if(ST.mode===p[0])o.selected=true;modeSel.appendChild(o)});
  modeSel.addEventListener('change',function(){ST.mode=modeSel.value;LS.set('models.armor.mode',ST.mode);drawMap();if(ST.mode==='mm'){backToThickness();clearShot3()}else paintFx()});
  var viewBox=C('map.v3',[],'col',tx('models.armor.blk.v3')),canvas=el('canvas',{width:'640',height:'480',style:'max-width:100%;cursor:crosshair;border:1px solid var(--line);image-rendering:pixelated',
   'aria-label':tx('models.armor.mapLabel')}),hover=el('div',{class:'hint',text:tx('models.armor.hoverHint')}),legend=L('map.legend',[],{class:'row',style:'flex-wrap:wrap;gap:10px','data-blkname':tx('models.armor.blk.legend')}),share=L('map.share',[],{'data-blkname':tx('models.armor.blk.share')});
  mWrap.appendChild(L('map.title',[el('h4',{text:tx('models.armor.map')})]));
  mWrap.appendChild(C('map.bar',[L('map.from',[el('span',{text:tx('models.armor.from')}),vBtns],{class:'row'}),L('map.f.mode',[el('span',{text:tx('models.armor.colourBy')}),modeSel],{class:'row'})],'row',tx('models.armor.blk.mapBar'),{class:'row'}));
  mWrap.appendChild(viewBox);mWrap.appendChild(L('map.msg',[mMsg],{'data-blkname':tx('models.armor.blk.msg')}));mWrap.appendChild(L('map.canvas',[canvas]));mWrap.appendChild(L('map.hover',[hover]));mWrap.appendChild(legend);mWrap.appendChild(share);card.appendChild(mWrap);
  function drawViews(){clear(vBtns);VIEWS.forEach(function(v){vBtns.appendChild(el('button',{type:'button',class:v===ST.view?'primary':'','aria-pressed':v===ST.view?'true':'false',text:tk('models.armor.view',v),
   onclick:function(){if(ST.view===v)return;ST.view=v;LS.set('models.armor.view',v);ST.map=null;ST.cell=null;drawViews();loadMap()}}))})}
  function loadMap(){if(GOH&&gohMap)gohMap();if(!ready()){say(mMsg,'hint',tx('models.armor.pickGun'));return}
   if(ST.map&&ST.map.view===ST.view&&ST.map.rangeM===ST.range&&ST.map.ammo===ST.ammo&&ST.map.gun===ST.gun){drawMap();return}
   say(mMsg,'hint',tx('models.armor.mapping'));var b=shooter();b.view=ST.view;b.grid=GRID;var want=JSON.stringify(b);
   call('/api/x/models/armor/map',b,function(j){var b2=shooter();b2.view=ST.view;b2.grid=GRID;if(JSON.stringify(b2)!==want)return;
    ST.map=j;j.gun=ST.gun;j.ammo=ST.ammo;j.rangeM=ST.range;say(mMsg,'hint',j.ms!=null?tx('models.armor.mapTime',{ms:j.ms}):'');drawMap()},
    function(e){ST.map=null;say(mMsg,e.cancelled?'hint':'err',e.message);drawMap()})}
  var PX=8;
  function cellCol(c,maxE,sc){if(!c)return null;if(ST.mode==='mm')return c.e>0?mmColor(c.e,maxE,sc):catPaint('none');return catPaint(catOf(c.o||c.r))}
  function maxEff(m){var x=0;(m.cells||[]).forEach(function(c){if(c&&c.e>x)x=c.e});return Math.max(50,Math.min(400,x))}
  function drawMap(){var m=ST.map,cx=canvas.getContext&&canvas.getContext('2d');clear(legend);share.textContent='';
   if(!m||!m.grid||!cx){if(cx)cx.clearRect(0,0,canvas.width,canvas.height);return}
   var w=m.grid.w,h=m.grid.h;PX=Math.max(3,Math.floor(720/w));canvas.width=w*PX;canvas.height=h*PX;cx.clearRect(0,0,canvas.width,canvas.height);
   var maxE=maxEff(m),sc=mmScale();
   for(var i=0;i<w*h;i++){var c=m.cells[i],col=cellCol(c,maxE,sc);if(!col)continue;cx.fillStyle=col;cx.fillRect((i%w)*PX,Math.floor(i/w)*PX,PX,PX)}
   if(ST.cell){cx.strokeStyle=tok('--fg')||cx.strokeStyle;cx.lineWidth=2;cx.strokeRect(ST.cell[0]*PX+1,ST.cell[1]*PX+1,PX-2,PX-2)}
   if(ST.mode==='mm'){var bar=el('canvas',{width:'160',height:'12',style:'border:1px solid var(--line)'}),bx=bar.getContext&&bar.getContext('2d');
    if(bx)for(var k=0;k<160;k++){bx.fillStyle=mmColor(k/159*maxE,maxE,sc);bx.fillRect(k,0,1,12)}
    legend.appendChild(el('span',{text:tx('models.armor.scale',{a:0,b:Math.round(maxE)})}));legend.appendChild(bar);
    legend.appendChild(el('span',{class:'hint',text:tx('models.armor.scaleNote')}))}
   else ['through','bounce','stop','none'].forEach(function(k){legend.appendChild(el('span',{},[el('span',{style:'display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:middle;background:'+CAT_COL[k]}),tk('models.armor.cat',k)]))});
   if(m.share!=null&&m.hitCells)share.textContent=tx('models.armor.share',{p:Math.round(m.share*100),n:m.hitCells});
   else if(m.grid)share.textContent=tx('models.armor.noHits')}
  function cellAt(ev){var m=ST.map;if(!m||!m.grid)return null;var r=canvas.getBoundingClientRect(),sx=canvas.width/(r.width||canvas.width),sy=canvas.height/(r.height||canvas.height);
   var col=Math.floor((ev.clientX-r.left)*sx/PX),row=Math.floor((ev.clientY-r.top)*sy/PX);
   if(col<0||row<0||col>=m.grid.w||row>=m.grid.h)return null;return [col,row,m.cells[row*m.grid.w+col]]}
  function cellWords(c){var m=ST.map,vol=(m.volumes||[])[c.v],o=c.o||c.r;
   var s=tx('models.armor.cellInfo',{v:short(vol),s:sideWord(c.s),n:r1(c.n),e:r1(c.e),r:tx(resKey(c.r))});
   if(c.o&&c.o!==c.r)s+=' '+tx('models.armor.allWay',{o:tx(resKey(o))});return s}
  canvas.addEventListener('mousemove',function(ev){var x=cellAt(ev);hover.textContent=x&&x[2]?cellWords(x[2]):x?tx('models.armor.empty'):tx('models.armor.hoverHint')});
  canvas.addEventListener('mouseleave',function(){hover.textContent=tx('models.armor.hoverHint')});
  canvas.addEventListener('click',function(ev){var x=cellAt(ev);if(!x)return;ST.cell=[x[0],x[1]];drawMap();
   var ray=cellRay(ST.map.grid,x[0],x[1]);var b=shooter();b.origin=ray.origin;b.dir=ray.dir;b.ground=0;runShot(b,null)});

  // the 3D view part (sub/viewer.client.js), when there
  var VP=EXT_SCREENS.models.parts&&EXT_SCREENS.models.parts.viewer,v3=null;
  function colours(){var t=ST.table,c={},f={},mx=20,sc=mmScale();if(!t)return {c:c,f:f};
   (t.rows||[]).forEach(function(r){(r.sides||[]).forEach(function(s){if(s.mm>mx)mx=s.mm})});mx=Math.min(mx,300);
   (t.rows||[]).forEach(function(r){if(!r.id)return;var sd=(r.sides||[]).map(function(s){return mmColor(s.mm,mx,sc)}),top=0;
    (r.sides||[]).forEach(function(s){if(s.mm>top)top=s.mm});
    // GoH rows are named by part: sceneIds (armorgoh.js table) are the 3D view's volume ids of that name
    (Array.isArray(r.sceneIds)&&r.sceneIds.length?r.sceneIds:[r.id]).forEach(function(id){c[id]=mmColor(top,mx,sc);if(sd.length===6)f[id]=sd})});return {c:c,f:f}}
  function paintView(){if(v3&&v3.setColors){var k=colours();v3.setColors(k.c,k.f)}}
  var lastVol=null;   // the part clicked last in the 3D view: the Shot button aims at it
  // the side chosen for the map as azimuth and elevation (the map's own pair once drawn)
  function sideAe(){return ST.map&&ST.map.view===ST.view&&ST.map.az!=null?[ST.map.az,ST.map.el]:(VIEW_AE[ST.view]||[0,0]).slice()}
  // the scene the view shows (root bone frame, middle of the unit, middle of each volume), or nothing yet
  function scene3(){var s=v3&&typeof v3.sceneInfo==='function'?v3.sceneInfo():null;return s||{world:null,middle:null,ctr:{}}}
  function cam3(){return v3&&typeof v3.camera==='function'?v3.camera():null}
  // where a 3D shot comes from: along the click ray (dir) or the camera's way to vol (else the unit's middle) with the camera chosen
  function way3(dir,vol){var sc=scene3(),m=vol&&sc.ctr&&sc.ctr[vol]||sc.middle,cd=dir?null:camWayTo(cam3(),m);return wayOf(ST.from3d,dir,cd,sc.world,sideAe())}
  if(VP){var k0=colours();
   v3=VP(ctx,{height:380,blk:'armor.map.v3.view',show:{meshes:false,volumes:true,bones:false},colors:k0.c,faceColors:k0.f,onPick:function(hit){if(!live()||!hit)return;
    // a click is a shot: past the volumes shells never hit, at the first one they do (that one is highlighted and selected), or at the
    // ground beside the model when nothing shells hit is nearer under the click
    var a=aimAt(hit,noShell(ST.table)),sh=a&&!a.ground?a:null;if(v3.highlight)v3.highlight(sh?sh.volume:null);lastVol=sh?sh.volume:null;
    if(!a){if(hit.point||(hit.hits||[]).length)say(sMsg,'err',tx('models.armor.noShellHit'));return {volume:null}}
    if(!ready()){say(mMsg,'hint',tx('models.armor.pickGun'));return {volume:sh?sh.volume:null}}
    var w=way3(hit.dir&&hit.dir.length===3?hit.dir:null,sh&&sh.volume);
    if(a.ground&&!w.cam&&!(w.ae[1]>0)){say(sMsg,'err',tx('models.armor.groundLevel'));return {volume:null}}   // a level shot never reaches the ground
    var b=shooter();b.az=w.ae[0];b.el=w.ae[1];b.aim=a.ground||a.point;b.ground=0;
    runShot(b,{cam:w.cam,az:w.ae[0],el:w.ae[1],side:ST.view,ground:a.ground||null,v:a.ground?tx('models.armor.ground',{p:rnd3(a.ground)}):short(sh.volume||'?')});return {volume:sh?sh.volume:null}}});
   if(v3){viewBox.appendChild(L('map.v3.hint',[],{class:'hint',text:tx('models.armor.viewHint')}));viewBox.appendChild(v3);
    // the Shot button and Shoot from in the row above the canvas (the same place as in the Model sub-tab): from the camera towards the
    // part clicked last (else the middle of the unit), or from the side chosen below at that part (else the middle)
    if(typeof v3.addTool==='function'){
     var fromSel=el('select',{'aria-label':tx('models.armor.from3d')});
     FROM3.forEach(function(f){var o=el('option',{value:f,text:tk('models.armor.from3d',f)});if(f===ST.from3d)o.selected=true;fromSel.appendChild(o)});fromSel.value=ST.from3d;
     fromSel.addEventListener('change',function(){ST.from3d=FROM3.indexOf(fromSel.value)>=0?fromSel.value:'camera';LS.set('models.armor.from3d',ST.from3d)});
     v3.addTool(L('map.v3.shot',[el('button',{type:'button',text:tx('models.armor.shotBtn'),title:tx('models.armor.shotBtnTip'),onclick:function(){
      if(!live())return;if(!ready()){say(sMsg,'hint',tx('models.armor.pickGun'));say(mMsg,'hint',tx('models.armor.pickGun'));return}
      var w=way3(null,lastVol),b=shooter();b.az=w.ae[0];b.el=w.ae[1];if(lastVol)b.aimVolume=lastVol;b.ground=0;
      runShot(b,{cam:w.cam,az:w.ae[0],el:w.ae[1],side:ST.view,ground:null,v:lastVol?short(lastVol):tx('models.armor.unitMiddle')})}})],{class:'row','data-blkname':tx('models.armor.shotBtn')}));
     v3.addTool(L('map.v3.from',[el('span',{text:tx('models.armor.from3d')}),fromSel],{class:'row','data-blkname':tx('models.armor.from3d')}))}}}

  // ---------- 5. shot result ----------
  var sWrap=C('shot',[],'col',tx('models.armor.shot')),sMsg=el('div',{class:'hint'}),sBox=L('shot.res',[],{'data-blkname':tx('models.armor.blk.res')});
  sWrap.appendChild(L('shot.title',[el('h4',{text:tx('models.armor.shot')})]));sWrap.appendChild(L('shot.msg',[sMsg],{'data-blkname':tx('models.armor.blk.msg')}));sWrap.appendChild(sBox);card.appendChild(sWrap);
  // at: where a 3D shot was aimed and where it came from, for the result's title ({cam, az, el, side, ground, v}); null for a map click
  function runShot(b,at){if(!ready()){say(sMsg,'hint',tx('models.armor.pickGun'));return}say(sMsg,'hint',tx('models.armor.shooting'));clear(sBox);clearShot3();ST.shotAt=at||null;
   call('/api/x/models/armor/shot',b,function(j){ST.shot=j;say(sMsg,'hint','');drawShot();if(ST.fxPaint){ST.fxPaint=false;paintView();drawPaintNote()}lineIn3d(j);ST.fxPrev=null;if(GOH){if(gohMap&&gohMap.shot3)gohMap.shot3(j)}else runFx(b,false)},function(e){ST.shot=null;say(sMsg,e.cancelled?'hint':'err',e.message)})}
  // the result's title: "Shot at <part or the ground at x, y, z> from the camera, 35 degrees right of the front, 20 degrees up"
  function shotTitle(a){if(!a)return '';var T=shotT();
   return a.cam&&T&&typeof T.aeWords==='function'?tx('models.armor.shotAtCam',{v:a.v,d:T.aeWords(a.az,a.el)}):tx('models.armor.shotAt',{v:a.v,s:sideWord(a.side)})}
  // the shell's line in the view (to the ground point when it met the ground) and a cross where it met the ground (or was aimed there)
  function groundMark(j){var g=groundOf(j)||(ST.shotAt&&ST.shotAt.ground);if(!g||!v3||!v3.addLine)return;var c=lineCol('stop');crossAt(g,8).forEach(function(s){v3.addLine(s[0],s[1],c)})}
  function lineIn3d(j){if(!v3||!v3.addLine||!j||!j.ray)return;var o=j.ray.origin,d=j.ray.dir,far=0,g=groundOf(j);
   (j.plates||[]).forEach(function(p){if(p.distanceM>far)far=p.distanceM});var L=far*20+40;
   if(v3.clearLines)v3.clearLines();v3.addLine(o,g||[o[0]+d[0]*L,o[1]+d[1]*L,o[2]+d[2]*L],lineCol(catOf(j.outcome||j.verdict)));groundMark(j)}
  function lineCol(k){var v=k==='none'?tok('--cline'):catPaint(k);return rgbOf(v)?'#'+rgbOf(v).map(hex2).join(''):(v||undefined)}
  // after the shot behind the armour, colour by what happens: the plates the shell met by result, the volumes a blast reached, and the
  // line up to where the shell stopped. "Colours back to thickness" (or Colour by thickness) restores the thickness colours.
  function hexTok(n){var v=tok(n);return rgbOf(v)?'#'+rgbOf(v).map(hex2).join(''):null}
  // a view with showShot (sub/viewer.client.js) draws the result itself over the thickness colours: volumes pierced, damaged, held,
  // jets, fires, blasts, with its own colour key and switch; the colours below are for a view without it
  function paintFx(){ST.fxPaint=false;
   if(v3&&typeof v3.showShot==='function'){if(ST.mode!=='result'||!ST.fx){v3.clearShot();drawPaintNote();return false}ST.fxDrawn=v3.showShot(ST.fx);
    var l2=fxLine(ST.fx,ST.shot);if(l2&&v3.addLine){if(v3.clearLines)v3.clearLines();v3.addLine(l2.from,l2.to,lineCol(catOf((ST.shot&&(ST.shot.outcome||ST.shot.verdict))||(ST.fx.engine&&ST.fx.engine.end&&ST.fx.engine.end.result))));groundMark(ST.fx)}
    drawPaintNote();return true}
   if(!v3||!v3.setColors||ST.mode!=='result'||!ST.fx){drawPaintNote();return false}var m=fxVolCats(ST.fx,ST.shot,ST.table&&ST.table.rows),c={};
   Object.keys(m).forEach(function(id){var h=m[id]==='blast'?hexTok('--s5'):hexTok(CAT_TOK[m[id]]);if(h)c[id]=h});
   if(!Object.keys(c).length){drawPaintNote();return false}v3.setColors(c,{});
   var ln=fxLine(ST.fx,ST.shot);if(ln&&v3.addLine){if(v3.clearLines)v3.clearLines();v3.addLine(ln.from,ln.to,lineCol(catOf((ST.shot&&(ST.shot.outcome||ST.shot.verdict))||(ST.fx.engine&&ST.fx.engine.end&&ST.fx.engine.end.result))));groundMark(ST.fx)}
   ST.fxPaint=true;drawPaintNote();return true}
  function clearShot3(){if(v3&&typeof v3.clearShot==='function')v3.clearShot()}
  function backToThickness(){if(!ST.fxPaint)return;ST.fxPaint=false;paintView();if(ST.shot)lineIn3d(ST.shot);drawPaintNote()}
  var paintNote=L('map.v3.paint',[],{class:'row',style:'flex-wrap:wrap;gap:10px;align-items:center','data-blkname':tx('models.armor.blk.paint')});viewBox.appendChild(paintNote);
  function drawPaintNote(){clear(paintNote);if(!ST.fxPaint||!v3)return;
   ['through','bounce','stop'].forEach(function(k){paintNote.appendChild(el('span',{},[el('span',{style:'display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:middle;background:'+CAT_COL[k]}),tk('models.armor.cat',k)]))});
   paintNote.appendChild(el('span',{},[el('span',{style:'display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:middle;background:var(--s5)'}),tx('models.armor.cat.blast')]));
   paintNote.appendChild(el('button',{type:'button',text:tx('models.armor.fx.paintBack'),onclick:backToThickness}))}
  function verdict(j){var c=codeOf(j.verdict),p=(j.plates||[])[j.decisive],pen=j.shell&&j.shell.penetration,out=[];
   var w=p?where(p.volume,p.side):'';
   if(c==='X')out.push(tx('models.armor.v.X'));
   else if(c==='G')out.push(tx('models.armor.v.G',{p:rnd3(groundOf(j)||j.groundPoint||[])}));
   else if(c==='R'&&j.chance!=null)out.push(tx('models.armor.v.Rn',{w:w,n:Math.round(j.chance*100)}));
   else if(CAT[c])out.push(tx(['models.armor.v',c].join('.'),{w:w,e:p?r1(p.effective):'?',pen:pen==null?'?':r1(pen)}));
   var o=codeOf(j.outcome);if(j.outcome&&o!==c&&CAT[o]&&o!=='X')out.push(tx('models.armor.v.else',{o:tx(resKey(o))}));
   return out.join(' ')}
  // why mm on the slope can be below plain geometry: the server's slope { geo, share, how } per plate (armor.server.js slopeInfo)
  function slopeText(p,j){var sl=p&&p.slope;if(!sl)return '';var c=j&&j.shell&&j.shell.calibre,o={n:r1(p.nominal),g:r1(sl.geo),p:Math.round(sl.share*100),c:c?r1(c):''};
   if(sl.how==='part')return tx(c?'models.armor.slope.part':'models.armor.slope.partNoCal',o);return tx(['models.armor.slope',sl.how].join('.'),o)}
  function drawShot(){clear(sBox);var j=ST.shot;if(!j)return;
   if(ST.shotAt)sBox.appendChild(el('h4',{text:shotTitle(ST.shotAt)}));
   if(j.shell)sBox.appendChild(el('div',{class:'hint',text:tx('models.armor.shotBy',{w:j.shell.weapon||'?',a:j.shell.ammo||'?',m:j.rangeM,p:r1(j.shell.penetration)})}));
   if((j.plates||[]).length){var tb=el('table',{class:'tbl'});
    tb.appendChild(el('tr',{},['#','volume','side','nominal','angle','effective','left','what'].map(function(k){return el('th',{text:k==='#'?'#':tk('models.armor.col',k)})})));
    tb.appendChild(el('tr',{},[el('td',{colspan:'8',class:'hint',text:tx('models.armor.slope.rule')})]));
    j.plates.forEach(function(p,i){tb.appendChild(el('tr',{style:i===j.decisive?'font-weight:bold':null},[el('td',{text:String(i+1)}),nameCell(short(p.volume),p.volume),
     el('td',{text:sideWord(p.side)+(p.enter===false?' '+tx('models.armor.exit'):'')}),el('td',{text:String(r1(p.nominal))}),el('td',{text:String(r1(p.angle))+'°'}),
     el('td',{text:String(r1(p.effective)),title:slopeText(p,j)||null}),el('td',{text:p.penLeft==null?'':String(r1(p.penLeft))}),
     el('td',{text:tx(resKey(p.result))+(p.chance!=null?' ('+Math.round(p.chance*100)+'%)':'')+(p.flag?' · '+flagText(p.flag,''):'')})]))});
    sBox.appendChild(el('div',{style:'overflow-x:auto'},[tb]))}
   sBox.appendChild(el('div',{style:'font-weight:bold;margin-top:4px',text:verdict(j)}));
   var dsl=slopeText((j.plates||[])[j.decisive],j);
   if((j.notes||[]).length||j.raw||dsl)sBox.appendChild(el('details',{},[el('summary',{text:tx('models.armor.details')}),el('pre',{style:'white-space:pre-wrap',text:(dsl?dsl+'\n':'')+(j.notes||[]).map(plain).join('\n')+(j.raw?'\n\n'+j.raw:'')})]))}

  // ---------- 6. behind the armour: engine events and the unit's scripts (armorsim effects) ----------
  var DOC=ctx.doc||null,fWrap=C('fx',[],'col',tx('models.armor.fx.title'),{style:'margin-top:10px'}),fMsg=el('div',{class:'hint'}),fBox=L('fx.res',[],{'data-blkname':tx('models.armor.blk.fx')}),fOpt=C('fx.opts',[],'row',tx('models.armor.blk.fxOpts'),{class:'row',style:'flex-wrap:wrap;gap:10px;align-items:center'});
  function docId(){return DOC&&DOC.id&&(!DOC.target||DOC.target===target)?DOC.id:null}
  var carryIn=el('input',{type:'checkbox',onchange:function(){ST.carry=!!carryIn.checked}}),vanIn=el('input',{type:'checkbox',onchange:function(){ST.vanilla=!!vanIn.checked;if(ST.fxBody){ST.fxPrev=null;runFx(ST.fxBody,false)}}});
  carryIn.checked=!!ST.carry;vanIn.checked=!!ST.vanilla;
  fOpt.appendChild(L('fx.carry',[el('label',{},[carryIn,el('span',{text:' '+tx('models.armor.fx.carry')})])]));
  fOpt.appendChild(L('fx.fresh',[el('button',{type:'button',text:tx('models.armor.fx.fresh'),onclick:function(){if(ST.fxBody){ST.fxPrev=null;runFx(ST.fxBody,true)}}})]));
  fOpt.appendChild(L('fx.vanilla',[el('label',{},[vanIn,el('span',{text:' '+tx('models.armor.fx.vanilla')})])]));
  var untilIn=el('input',{type:'number',min:'1',max:'600',step:'1',placeholder:'120',title:tx('models.armor.fx.untilTip'),'aria-label':tx('models.armor.fx.until'),style:'width:5em'});untilIn.value=String(ST.until==null?'':ST.until);
  untilIn.addEventListener('change',function(){var v=untilIn.value.trim();if(!untilOk(v)){say(fMsg,'err',tx('models.armor.fx.badUntil'));return}
   ST.until=v;LS.set('models.armor.until',v);say(fMsg,'hint','');if(ST.fxBody){ST.fxPrev=null;runFx(ST.fxBody,false)}});
  fOpt.appendChild(L('fx.until',[el('label',{},[el('span',{text:tx('models.armor.fx.until')+' '}),untilIn])]));
  fWrap.appendChild(L('fx.title',[el('h4',{text:tx('models.armor.fx.title')})]));fWrap.appendChild(L('fx.intro',[],{class:'hint',text:tx('models.armor.fx.intro')}));fWrap.appendChild(fOpt);
  fWrap.appendChild(L('fx.msg',[fMsg],{'data-blkname':tx('models.armor.blk.msg')}));fWrap.appendChild(fBox);card.appendChild(fWrap);if(EXT_SCREENS.models.blockify)EXT_SCREENS.models.blockify(card);
  function runFx(b,reset){ST.fxBody=b;var id=docId();carryIn.disabled=!id||ST.vanilla;say(fMsg,'hint',tx('models.armor.fx.running'));clearShot3();
   call('/api/x/models/armor/effects',fxBody(b,id,{carry:ST.carry,reset:reset,vanilla:ST.vanilla,until:ST.until}),function(j){ST.fx=j;say(fMsg,'hint','');drawFx()},function(e){ST.fx=null;clear(fBox);say(fMsg,e.cancelled?'hint':'err',e.message)})}
  function fromBadge(s,loc){return badgeFrom(el,s,'',loc)}
  function drawFx(){clear(fBox);var j=ST.fx;if(!j)return;var prev=ST.fxPrev;
   if(j.ammoNotLoaded)fBox.appendChild(el('div',{class:'err',role:'alert',text:notLoadedText(j.ammoNotLoaded)}));
   fBox.appendChild(el('div',{class:'hint',text:j.vanilla?tx('models.armor.fx.usesVanilla'):j.rev!=null?tx('models.armor.fx.usesDoc'):tx('models.armor.fx.usesDisk')}));
   if((j.ends||[]).length)fBox.appendChild(el('div',{text:tx('models.armor.fx.ends')+' '+j.ends.map(function(e){return tk('models.armor.fxend',endKey(e.result))+(e.volume?' ('+short(e.volume)+')':'')+' '+pct(e.chance)}).join(', ')}));
   crewLines(j).forEach(function(t){fBox.appendChild(el('div',{class:'hint',text:t}))});
   var wr=el('div',{class:'row',style:'flex-wrap:wrap;gap:4px;margin:6px 0'});
   (j.whole||[]).forEach(function(w){if(FX_WHOLE[w.key])wr.appendChild(el('span',{class:wholeClass(w.chance),text:tk('models.armor.fxw',FX_WHOLE[w.key])+' '+pct(w.chance)}))});
   fBox.appendChild(el('div',{style:'font-weight:bold',text:tx('models.armor.fx.whole')}));fBox.appendChild(wr);
   fxMain(el,j,prev).forEach(function(x){fBox.appendChild(x)});
   var why=el('details',{},[el('summary',{text:tx('models.armor.fx.why')})]),ev=(j.engine&&j.engine.events)||[],hs=(j.scripts&&j.scripts.handlers)||[];
   why.appendChild(el('div',{text:tx('models.armor.fx.engine')+' '+(ev.length?ev.map(function(e){return e.event+' '+short(e.volume)+(e.part?' ['+e.part+']':'')}).join(' > '):tx('models.armor.fx.noEvent'))}));
   if(j.scripts&&(j.scripts.blocks||[]).length)why.appendChild(el('div',{class:'hint',text:tx('models.armor.fx.blocks')+' '+j.scripts.blocks.join(' | ')}));
   if(hs.length){var ht=el('table',{class:'tbl'});ht.appendChild(el('tr',{},[el('th',{text:tx('models.armor.fx.colEvent')}),el('th',{text:tx('models.armor.fx.colFile')}),el('th',{text:tx('models.armor.fx.colFrom')})]));
    hs.forEach(function(x){ht.appendChild(el('tr',{},[el('td',{},[el('code',{text:x.event})]),el('td',{},[el('code',{text:x.file+':'+x.line})]),el('td',{},[fromBadge(x.from,x)])]))});why.appendChild(el('div',{style:'overflow-x:auto'},[ht]))}
   else why.appendChild(el('div',{class:'hint',text:tx('models.armor.fx.noScript')}));
   if(j.sources&&j.sources.def&&j.sources.def.file)why.appendChild(el('div',{},[el('span',{class:'hint',text:tx('models.armor.fx.def')+' '}),el('code',{text:j.sources.def.file}),el('span',{text:' '}),fromBadge(j.sources.def.from,j.sources.def)]));
   if(j.engine&&(j.engine.notes||[]).length)why.appendChild(el('pre',{style:'white-space:pre-wrap',text:j.engine.notes.map(plain).join('\n')}));
   fBox.appendChild(why);
   if((j.notFollowed||[]).length)fBox.appendChild(el('div',{class:'err',text:tx('models.armor.fx.notFollowed')+' '+j.notFollowed.map(function(u){return u.name+' ('+u.file+':'+u.line+')'}).join(', ')}));
   if((j.inputs||[]).length)fBox.appendChild(el('div',{class:'hint',text:tx('models.armor.fx.inputs')+' '+j.inputs.join(', ')}));
   fBox.appendChild(el('div',{class:'hint',text:tx(limitsKey(j),{n:j.samples})+(j.until!=null?' '+tx('models.armor.fx.followed',{s:j.until}):'')}));
   paintFx()}
  // an edit of the open model runs the last shot again; the result before the edit stays beside the new one
  if(DOC&&DOC.on)DOC.on(function(e){if(!live()||!e||e.type!=='change'||!ST.fxBody||!docId()||ST.vanilla)return;if(ST.carry){say(fMsg,'hint',tx('models.armor.fx.changed'));return}ST.fxPrev=ST.fx;runFx(ST.fxBody,false)});

  // ---------- start ----------
  if(typeof onTheme==='function')onTheme(function(){if(!live())return;drawMap();paintView();if(ST.shot)lineIn3d(ST.shot);if(ST.fxPaint)paintFx()},'models.armor');
  // Gates of Hell: the thickness table and its edits, who shoots, and the GoH shot test by part (armorgoh.client.js, GoH's own rules,
  // not tested in game); the map, the 3D view and the shot result answer by GoH's rules too (goh.js shot3 / map3, first armoured plate
  // judged); the effects section stays hidden (GoH's part damage is shown in the GoH box)
  if(GOH){fWrap.hidden=true;tWrap.insertBefore(L('thick.goh',[],{class:'hint',text:tx('models.armor.goh.na')}),tWrap.firstChild.nextSibling);
   mWrap.insertBefore(L('map.goh',[],{class:'hint',text:tx('models.armor.goh.map3')}),mWrap.firstChild.nextSibling);
   if(EXT_SCREENS.models.armorGoh)gohMap=EXT_SCREENS.models.armorGoh(ctx,{card:card,L:L,C:C,call:call,say:say,ST:ST,shooter:shooter,ready:ready,sideWord:sideWord,partWords:partWords})}
  drawGun();drawViews();
  if(ST.table){say(tMsg,'hint','');drawTable();drawEdit();paintView()}else loadTable();
  if(ST.gun&&!ST.shells)loadShells();else{drawShells();loadMap()}
  if(ST.shot)drawShot();
  carryIn.disabled=!docId()||ST.vanilla;if(ST.fx)drawFx();
 };
 EXT_SCREENS.models.subs.armor._t={kindWord:kindWord,flagKey:flagKey,flagText:flagText,plain:plain,partKey:partKey,partWords:partWords,codeOf:codeOf,resKey:resKey,catOf:catOf,mmColor:mmColor,cellRay:cellRay,noShell:noShell,shellHit:shellHit,along:along,aimAt:aimAt,groundOf:groundOf,crossAt:crossAt,rnd3:rnd3,wayOf:wayOf,camWayTo:camWayTo,shotT:shotT,FROM3:FROM3,CODES:CODES,CAT:CAT,penAt:penAt,cross:cross,factKey:factKey,pct:pct,wholeClass:wholeClass,fromKey:fromKey,endKey:endKey,fxBody:fxBody,FX_WHOLE:FX_WHOLE,
  byTime:byTime,groupTree:groupTree,flatGroups:flatGroups,causeSig:causeSig,causeKey:causeKey,chanceMap:chanceMap,foldFacts:foldFacts,groupLines:groupLines,looseFacts:looseFacts,
  tagRows:tagRows,hitKey:hitKey,blastWho:blastWho,gone:gone,limitsKey:limitsKey,fxMain:fxMain,FOLD_MIN:FOLD_MIN,
  factOf:factOf,groupFactChances:groupFactChances,hitGroups:hitGroups,blastM:blastM,SCRIPT_WORDS:SCRIPT_WORDS,
  mainKind:mainKind,alsoVia:alsoVia,subOfPart:subOfPart,subFact:subFact,subsystems:subsystems,SUB_ORDER:SUB_ORDER,fileLink:fileLink,badgeInfo:badgeInfo,badgeFrom:badgeFrom,
  exactOf:exactOf,openLoc:openLoc,notLoadedText:notLoadedText,crewLines:crewLines,CREWK:CREWK,
  fxVolCats:fxVolCats,fxLine:fxLine,untilOk:untilOk,fxSubs:fxSubs,fxCauses:fxCauses,fxSteps:fxSteps,jetHits:jetHits,fireSay:fireSay,fxJets:fxJets,fxFires:fxFires};
})();
` + require('./armorgoh.client');

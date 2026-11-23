// Models page, Shot part Part A): a "Shot" tool in the Model sub-tab, so a shot at the model being edited needs
// no trip to the Armor sub-tab. Turned on, it shows who shoots (gun search, shell, range; kept in the Armor sub-tab's own keys
// models.armor.gun, .ammo, .range), where from (front, rear, left, right, top, or azimuth and elevation typed), what to aim at, a
// hint, and the result of armorsim effects on the open document under the bar (the Armor part's "Behind the armour" renderer
// _t.fxMain when that part is there, else a short text). The ray is drawn in the 3D view (addLine / clearLines). The toggle sits in
// the view's tool row above the canvas (v.addTool), the bar and result right under the canvas (v.addUnder), see "blocks" below.
// Shoot from "the camera" (first, the default): a click shoots along the click's ray (hit.dir, the view direction at that pixel in
// the pane clicked), turned into the azimuth and elevation of armorsim (aeFromDir, sim.js toShooter); the Shoot button uses the
// active pane's camera (viewer camera()) towards the chosen volume's middle and is off without it. A side or typed pair: as named.
// Picks: ctx.onPick (../client.js, clicks in the Model sub-tab's 3D view): the shot goes to the first volume under the click that
// shells hit (hit.hits; the ones they never hit, route /api/x/models/armor/nothit, are passed through), at the clicked point on it
// (aim); nothing shells hit under the click: a message, no shot. A view without hit.hits: the clicked point (aim). A hit without a
// point, a view that does not pass its clicks on, or Aim at + Shoot: the shot goes to the middle of the volume (aimVolume, the
// server finds the point); a click then reaches this part as the document's select event. A pick is never shot twice.
// The ground: a click with hit.ground (sub/viewer.client.js: where the click ray meets the plane z = 0 near the model) shoots at
// that point when no volume shells hit is under the click, or when that volume is farther along the ray (aimAt). From the camera
// along the click ray; from a side or a typed pair only with an elevation above 0 (a level shot cannot reach the ground: said, no
// shot). Every request sends ground: 0, so a shell that misses or passes through ends on the ground (end result 'ground', a blast only for a filled shell; the
// point in engine.end.point); the ray is drawn to that point and a small cross marks it.
// An edit of the open document (D.on change) runs the last shot again and passes the result before the edit as prev.
// Page rules as in README.md: no backtick, no dollar-brace, no innerHTML; DOM through ctx.el; text through tx(); no new global
// names; answers that come back after the tool was closed, a newer shot was started or the sub-tab was left are ignored; no timers.
// Test seam: EXT_SCREENS.models.subs.model._shot (pure helpers).
// Author: Imperator_Aug (ARSENAL, ia-a8ce5aec)
module.exports = String.raw`
(function(){
 var FROM=['camera','front','rear','left','right','top','typed'],AE={front:[0,0],rear:[180,0],left:[90,0],right:[-90,0],top:[0,90]},DEG=Math.PI/180;
 var FROMK={camera:'models.shot.from.camera',front:'models.shot.from.front',rear:'models.shot.from.rear',left:'models.shot.from.left',right:'models.shot.from.right',top:'models.shot.from.top',typed:'models.shot.from.typed'};
 var ENDK={passed:'models.shot.end.passed',spent:'models.shot.end.spent',detonate:'models.shot.end.detonate',no_penetration:'models.shot.end.stopped',
  ricochet:'models.shot.end.ricochet',beyond_jet:'models.shot.end.beyondJet',no_hit:'models.shot.end.noHit',missed:'models.shot.end.spent',no_armor:'models.shot.end.passed',ground:'models.shot.end.ground'};
 var WHOLEK={'cannot move':'models.shot.w.cannotMove','cannot shoot':'models.shot.w.cannotShoot','crew leaves':'models.shot.w.crewLeaves','crew dead':'models.shot.w.crewDead',
  'burns':'models.shot.w.burns','explodes':'models.shot.w.explodes','out of action':'models.shot.w.outOfAction'};
 var ST={gen:0,req:0,on:false,key:null,gun:'',ammo:'',range:100,shells:null,shellsOf:null,from:'camera',az:'0',el:'0',aim:'',vols:null,frame:null,ctr:{},
  carry:false,resetNext:false,shot:null,fx:null,prev:null,lastSel:null,skip:null};

 // ---------- pure helpers (test seam) ----------
 function short(id){id=String(id||'');var i=id.lastIndexOf('/');return i<0?id:id.slice(i+1)}
 function pct(x){x=Number(x)||0;var p=Math.round(x*100);if(p===0&&x>0)return '<1%';if(p===100&&x<1)return '>99%';return p+'%'}
 // a shell's kind in plain words, as the Armor part says it (armor.client kindWord): heat also for a cumulative or shaped word or a
 // shell with a shaped charge (cum > 0, added to its own kind); an unknown kind shows its own word; every shell the route sends is listed
 var KINDK={ap:'models.shot.kind.ap',apcr:'models.shot.kind.apcr',he:'models.shot.kind.he',heat:'models.shot.kind.heat',smoke:'models.shot.kind.smoke',other:'models.shot.kind.other'};
 function kindWord(k,cum){var w=String(k==null?'':k).trim(),l=w.toLowerCase();if(/^(heat|cumulative|shaped)/.test(l))l='heat';
  var t=KINDK.hasOwnProperty(l)?tx(KINDK[l]):w||tx(KINDK.other);
  if(Number(cum)>0&&l!=='heat')t+=', '+tx(KINDK.heat);return t}
 function numOf(s){s=String(s==null?'':s).trim().replace(',','.');if(!/^[-+]?([0-9]+[.]?[0-9]*|[.][0-9]+)$/.test(s))return null;return parseFloat(s)}
 // azimuth and elevation of a side, or the typed pair checked against the server's limits; null when the typed pair is wrong
 function aeOf(from,az,el){if(AE[from])return AE[from].slice();var a=numOf(az),e=numOf(el);
  if(a==null||e==null||a<-360||a>360||e<-90||e>90)return null;return [a,e]}
 // the request body of one shot: who (gun, shell, range), where from (az, el), at what (a point or a volume), the open document
 function bodyOf(who,shot,doc,o){o=o||{};var b={mod:who.mod,target:who.target,weapon:who.gun,ammo:who.ammo,range:who.range,az:shot.az,el:shot.el};
  if(shot.aim)b.aim=shot.aim.slice();else if(shot.volume)b.aimVolume=shot.volume;
  if(doc)b.doc=doc;b.samples=400;if(doc&&o.carry)b.carry=true;if(doc&&o.reset)b.reset=true;b.ground=0;return b}
 // the camera's way: a view direction (world, into the scene) as the azimuth and elevation of armorsim (sim.js toShooter): the
 // shooter sits at t = -dir, t = cos(el)cos(az) X + cos(el)sin(az) Y + sin(el) Z in the frame of the root bone's world axes
 // (rows of bones[0].world; vanilla mirrors Y). Azimuth 0 front, 90 left, -90 right, 180 rear; elevation 90 above.
 function nrm(v){var l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return l>0?[v[0]/l,v[1]/l,v[2]/l]:null}
 function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
 function frameOf(w){var F=w&&w.length>=9?{X:nrm(w.slice(0,3)),Y:nrm(w.slice(3,6)),Z:nrm(w.slice(6,9))}:null;
  return F&&F.X&&F.Y&&F.Z?F:{X:[1,0,0],Y:[0,1,0],Z:[0,0,1]}}
 function r6(x){var r=Math.round(x*1e6)/1e6;return r===0?0:r}
 function aeFromDir(d,F){var t=d&&d.length===3?nrm([-d[0],-d[1],-d[2]]):null;if(!t)return null;F=F||frameOf(null);
  var a=dot(t,F.X),b=dot(t,F.Y),c=Math.max(-1,Math.min(1,dot(t,F.Z)));
  return [Math.abs(a)<1e-9&&Math.abs(b)<1e-9?0:r6(Math.atan2(b,a)/DEG),r6(Math.asin(c)/DEG)]}
 // where a shot came from, in words: "35 degrees right of the front, 20 degrees up"
 function aeWords(az,el){var a=Math.round(((Number(az)||0)%360+540)%360-180),e=Math.round(Number(el)||0),h,v;
  if(a===0)h=tx('models.shot.dir.front');else if(a===180||a===-180)h=tx('models.shot.dir.rear');
  else if(Math.abs(a)<=90)h=tx(a>0?'models.shot.dir.frontLeft':'models.shot.dir.frontRight',{n:Math.abs(a)});
  else h=tx(a>0?'models.shot.dir.rearLeft':'models.shot.dir.rearRight',{n:180-Math.abs(a)});
  v=e===0?tx('models.shot.dir.level'):tx(e>0?'models.shot.dir.up':'models.shot.dir.down',{n:Math.abs(e)});
  return Math.abs(e)===90?tx(e>0?'models.shot.dir.above':'models.shot.dir.below'):h+', '+v}
 // the far end of the drawn ray: the aimed point, or across the model when the server picked the point
 function rayEnd(ray,aim){if(!ray||!ray.origin||!ray.dir)return null;var o=ray.origin,d=ray.dir;if(aim)return aim.slice();
  var L=Math.sqrt(o[0]*o[0]+o[1]*o[1]+o[2]*o[2])*2+40;
  return [o[0]+d[0]*L,o[1]+d[1]*L,o[2]+d[2]*L]}
 function endKey(r){return ENDK[r]||'models.shot.end.other'}
 function wholeClass(x){x=Number(x)||0;return x>=0.5?'badge badx':x>0?'badge review':'badge'}
 // the short text result: where the shell ends, and what happens to the whole tank, each with its chance
 // a shell the chosen gun does not load (effects ammoNotLoaded: { asked, weapon, loads }) -> one warning sentence, or ''
 function notLoaded(a){if(!a||typeof a!=='object')return '';var l=(Array.isArray(a.loads)?a.loads:[]).filter(function(x){return x!=null&&x!==''}).map(String);
  return l.length?tx('models.shot.notLoaded',{w:String(a.weapon||'?'),a:String(a.asked||'?'),l:l.join(', ')}):tx('models.shot.notLoadedNone',{w:String(a.weapon||'?'),a:String(a.asked||'?')})}
 function summary(el,j){var out=[],nl=notLoaded(j.ammoNotLoaded);if(nl)out.push(el('div',{class:'err',role:'alert',text:nl}));var ends=(j.ends||[]).map(function(e){return tx(endKey(e.result))+(e.volume?' ('+short(e.volume)+')':'')+' '+pct(e.chance)});
  if(ends.length)out.push(el('div',{text:tx('models.shot.ends')+' '+ends.join(', ')}));
  var w=(j.whole||[]).filter(function(x){return x&&WHOLEK[x.key]&&Number(x.chance)>0});
  out.push(el('div',{class:'row',style:'flex-wrap:wrap;gap:4px;margin:4px 0'},[el('b',{text:tx('models.shot.whole')})].concat(w.length?
   w.map(function(x){return el('span',{class:wholeClass(x.chance),text:tx(WHOLEK[x.key])+' '+pct(x.chance)})}):[el('span',{class:'hint',text:tx('models.shot.nothing')})])));
  if(j.carried)out.push(el('div',{class:'hint',text:tx('models.shot.carried')}));
  return out}
 // the volumes shells never hit (route /api/x/models/armor/nothit: armorsim join.notHit, ram volumes and bullet ability off):
 // a map of 'i:' + lower-case id and 'n:' + lower-case name
 function lk(x){return String(x==null?'':x).toLowerCase()}
 function noShell(list){var m={};(Array.isArray(list)?list:[]).forEach(function(x){if(!x)return;if(x.id)m['i:'+lk(x.id)]=1;if(x.name)m['n:'+lk(x.name)]=1});return m}
 // where a click meant as a shot goes: the first volume under the click (hit.hits of sub/viewer.client.js, nearest first) that shells
 // hit, at its aim point (just inside its surface) -> {volume, side, point} | null. A hit without the list: its own volume and point.
 function shellHit(hit,m){if(!hit)return null;m=m||{};
  if(!Array.isArray(hit.hits))return hit.point&&hit.point.length===3?{volume:hit.volume||null,side:hit.side,point:hit.point.slice()}:null;
  for(var i=0;i<hit.hits.length;i++){var h=hit.hits[i];if(!h||m['i:'+lk(h.volume)]||h.name&&m['n:'+lk(h.name)])continue;
   var p=h.aim&&h.aim.length===3?h.aim:h.point;if(p&&p.length===3)return {volume:h.volume||null,side:h.side,point:p.slice()}}
  return null}
 // how far along the click ray (hit.origin, hit.dir) a point lies; null without the ray
 function along(hit,p){var o=hit&&hit.origin,d=hit&&hit.dir;if(!o||!d||o.length!==3||d.length!==3||!p||p.length!==3)return null;
  return (p[0]-o[0])*d[0]+(p[1]-o[1])*d[1]+(p[2]-o[2])*d[2]}
 // where a click goes, the ground included: the volume shellHit gives, or {ground: [x, y, z]} when the click has hit.ground and no
 // volume shells hit is under it, or that volume is farther along the ray than the ground point -> {volume, side, point} | {ground} | null
 function aimAt(hit,m){if(!hit)return null;var s=shellHit(hit,m),g=Array.isArray(hit.ground)&&hit.ground.length===3?hit.ground.slice():null;
  if(!g)return s;if(!s)return {ground:g};var a=along(hit,s.point),b=along(hit,g);return a!=null&&b!=null&&b<a?{ground:g}:s}
 // the ground point of a result: engine.end.point when the shell ended on the ground (effects); groundPoint of /shot, set only when the
 // shell ended on the ground (outcome 'ground'; verdict is 'ground' only when it met nothing before, else the first plate's result)
 function groundOf(j){var e=j&&j.engine&&j.engine.end;if(e&&e.result==='ground'&&Array.isArray(e.point)&&e.point.length>=3)return e.point.slice(0,3);
  if(j&&Array.isArray(j.groundPoint)&&j.groundPoint.length>=3)return j.groundPoint.slice(0,3);return null}
 // a small cross on the ground plane at p (two lines, s units each way)
 function crossAt(p,s){if(!p||p.length<3)return [];s=s||8;return [[[p[0]-s,p[1],p[2]],[p[0]+s,p[1],p[2]]],[[p[0],p[1]-s,p[2]],[p[0],p[1]+s,p[2]]]]}
 function rnd3(p){return (p||[]).slice(0,3).map(function(x){return Math.round(Number(x)||0)}).join(', ')}
 function lineCol(){var c=typeof cssv==='function'?String(cssv('--cline','')||'').trim():'';return /^#[0-9a-f]{6}$/i.test(c)?c:undefined}

 // ---------- the part: drawn below the Model sub-tab's own view ----------
 function part(ctx){
  var el=ctx.el,clear=ctx.clear,say=ctx.say,set=ctx.set||{},mod=ctx.mod,target=set.target||'',D=ctx.doc||EXT_SCREENS.models.doc||null;
  var key=mod+'|'+target;if(ST.key!==key){ST.key=key;ST.shot=null;ST.fx=null;ST.prev=null;ST.vols=null;ST.aim='';ST.lastSel=null;ST.nh=null;ST.nhOf=null}
  function view(){var b=(ctx.body&&ctx.body.childNodes)||[];for(var i=0;i<b.length;i++)if(b[i]&&typeof b[i].addLine==='function')return b[i];return null}
  // blocks (sub/README.md "Blocks"): the toggle is the leaf 'shot.tool', the bar the container 'shot.bar' (drawn again from blocks on each
  // paint, hidden while off). A view with slots (addTool, addUnder): the toggle sits beside the handles' mode buttons above the canvas
  // and the bar (a card) right under the canvas. No 'shot' container then, so a saved profile that lists 'shot' (the old place) is
  // ignored. A view without slots: the card 'shot' (toggle and bar) right after the view, as before.
  var V=view(),slot=!!(V&&typeof V.addTool==='function'&&typeof V.addUnder==='function');
  var bar=el('div',{class:slot?'card':null,style:slot?'margin:4px 0':null,blk:'shot.bar',box:'col','data-blkname':tx('models.shot.blk.bar')});
  var btn=el('button',{type:'button',text:tx('models.shot.tool'),title:tx('models.shot.toolTip'),onclick:function(){ST.on=!ST.on;paint()}});
  var tool=el('div',{class:'row',blk:'shot.tool','data-blkname':tx('models.shot.tool')},[btn]),card=tool;   // card: on the page while the part is
  if(slot){V.addTool(tool);V.addUnder(bar)}
  else{card=el('div',{class:'card',style:'margin-top:8px',blk:'shot',box:'col','data-blkname':tx('models.shot.tool')},[tool,bar]);
   var nx=V&&V.nextSibling;if(nx&&nx.parentNode===ctx.body&&typeof ctx.body.insertBefore==='function')ctx.body.insertBefore(card,nx);else ctx.body.appendChild(card)}
  var on=null;   // the handlers of the bar drawn now (select, change), null while the tool is off
  function live(n){return n===ST.gen&&ST.on&&card.isConnected!==false}
  function call(url,body,ok,fail){var n=ST.gen;api(url,body,{what:tx('models.shot.job.armor')}).then(function(j){if(live(n))ok(j)}).catch(function(e){if(live(n)&&fail)fail(e)})}
  function docId(){return D&&D.id&&(!D.target||D.target===target)?D.id:null}
  function clearShot3(){var v=view();if(v&&typeof v.clearShot==='function')v.clearShot()}
  function paint(){++ST.gen;on=null;clear(bar);bar.hidden=!ST.on;btn.className=ST.on?'primary':'';btn.setAttribute('aria-pressed',ST.on?'true':'false');
   if(!ST.on){if(V&&V.clearLines)V.clearLines();clearShot3();return}
   if(!mod){bar.appendChild(el('div',{class:'hint',blk:'shot.need',text:tx('models.shot.needMod')}));return}
   if(!target){bar.appendChild(el('div',{class:'hint',blk:'shot.need',text:tx('models.shot.needUnit')}));return}
   build()}

  function build(){
   ST.gun=LS.get('models.armor.gun','')||'';ST.ammo=LS.get('models.armor.ammo','')||'';ST.range=LS.get('models.armor.range',100);
   // a leaf (id) or, with box, a wrapping row of leaves
   var row=function(id,kids,box,name){return el('div',{class:'row',style:'flex-wrap:wrap;gap:6px;align-items:center;margin:3px 0',blk:'shot.'+id,box:box?'row':null,'data-blkname':name||null},kids)};
   var leaf=function(id,kids){return el('div',{class:'row',style:'gap:6px;align-items:center',blk:'shot.'+id},kids)};
   var qIn=el('input',{type:'search',autocomplete:'off','aria-label':tx('models.shot.gunSearch'),placeholder:tx('models.shot.gunPh'),style:'min-width:14em'});
   var gunSay=el('span',{class:'hint'}),hits=el('div',{class:'row',style:'flex-wrap:wrap;gap:4px',blk:'shot.hits','data-blkname':tx('models.shot.blk.hits')});
   var shellSel=el('select',{'aria-label':tx('models.shot.shell')});
   var rangeIn=el('input',{type:'number',min:'0',max:'5000',step:'10','aria-label':tx('models.shot.range'),style:'width:6em'});rangeIn.value=String(ST.range);
   var fromSel=el('select',{'aria-label':tx('models.shot.from')});
   FROM.forEach(function(f){var o=el('option',{value:f,text:tx(FROMK[f])});if(f===ST.from)o.selected=true;fromSel.appendChild(o)});fromSel.value=ST.from;
   var azIn=el('input',{type:'text',inputmode:'decimal','aria-label':tx('models.shot.az'),style:'width:5em'}),elIn=el('input',{type:'text',inputmode:'decimal','aria-label':tx('models.shot.el'),style:'width:5em'});
   azIn.value=ST.az;elIn.value=ST.el;
   var aeBox=leaf('ae',[el('span',{text:tx('models.shot.az')}),azIn,el('span',{text:tx('models.shot.el')}),elIn,el('span',{class:'hint',text:tx('models.shot.deg')})]);
   var aimSel=el('select',{'aria-label':tx('models.shot.aim')}),fireBtn=el('button',{type:'button',class:'primary',text:tx('models.shot.fire')});
   var carryIn=el('input',{type:'checkbox'}),freshBtn=el('button',{type:'button',text:tx('models.shot.fresh')});carryIn.checked=!!ST.carry;
   var msg=el('div',{class:'hint','aria-live':'polite'}),res=el('div',{blk:'shot.res','data-blkname':tx('models.shot.blk.res')});
   bar.appendChild(row('gun',[el('span',{text:tx('models.shot.gun')}),qIn,gunSay]));bar.appendChild(hits);
   bar.appendChild(row('shell',[leaf('f.shell',[el('span',{text:tx('models.shot.shell')}),shellSel]),leaf('f.range',[el('span',{text:tx('models.shot.range')}),rangeIn,el('span',{text:tx('models.shot.m')})])],true,tx('models.shot.blk.shell')));
   bar.appendChild(row('from',[leaf('f.from',[el('span',{text:tx('models.shot.from')}),fromSel]),aeBox],true,tx('models.shot.blk.from')));
   var camNote=el('span',{class:'hint'});
   bar.appendChild(row('aim',[leaf('f.aim',[el('span',{text:tx('models.shot.aim')}),aimSel]),leaf('fire',[fireBtn,camNote])],true,tx('models.shot.blk.aim')));
   bar.appendChild(row('carry',[el('label',{},[carryIn,el('span',{text:' '+tx('models.shot.carry')})]),freshBtn]));
   bar.appendChild(el('div',{class:'hint',blk:'shot.hint',text:tx('models.shot.hint')}));bar.appendChild(el('div',{blk:'shot.msg','data-blkname':tx('models.shot.blk.msg')},[msg]));bar.appendChild(res);

   // who shoots: the same routes and keys as the Armor sub-tab
   function drawGun(){gunSay.textContent=ST.gun?tx('models.shot.gunIs',{g:ST.gun}):tx('models.shot.noGun')}
   // the gun box (searchKit, tools/gui/README.md): the whole gun list (the Armor route) asked for once per mod and kept (ST.gunIx, names in
   // lower case), every keystroke filters it here; history key models.shot.gun, Browse = the file picker on the game data at set/stuff (the gun files; the file name is the gun)
   function gunsLoad(cb){var G=ST.gunIx;if(G&&G.mod===mod&&G.list){cb(G);return}
    if(!G||G.mod!==mod)G=ST.gunIx={mod:mod,list:null,lo:null,cbs:[]};G.cbs.push(cb);if(G.cbs.length>1)return;
    api('/api/x/models/armor/guns',{mod:mod,q:'',limit:5000},{what:tx('models.shot.job.guns')}).then(function(j){var a=j.guns||[];G.list=a;G.lo=a.map(function(x){return String(x.name).toLowerCase()});var c=G.cbs;G.cbs=[];c.forEach(function(f){f(G)})},
     function(e){G.cbs=[];if(ST.gunIx===G)ST.gunIx=null;say(msg,e.cancelled?'hint':'err',e.message)})}
   function gunHits(G,q){var w=String(q).toLowerCase().split(/\s+/).filter(Boolean),a=[],b=[];
    G.list.forEach(function(x,i){var l=G.lo[i];if(w.every(function(t){return l.indexOf(t)>=0}))(w.length&&l.indexOf(w[0])===0?a:b).push(x)});return a.concat(b)}
   function gunItem(x){return {label:x.name,value:x.name,group:String(x.group||'')}}
   if(typeof searchKit==='function')searchKit(qIn,{key:'models.shot.gun',
    index:function(q,done){gunsLoad(function(G){var r=gunHits(G,q);done(r.slice(0,30).map(gunItem),Math.max(0,r.length-30))})},
    browse:{mode:'file',view:'data',start:'set/stuff',toValue:function(p,e){return EXT_SCREENS.models.pickAt.name((e&&e.name)||p)}},
    onPick:function(v){pickGun(v)}});
   qIn.addEventListener('input',function(){var q=qIn.value.trim();clear(hits);if(q.length<2)return;
    gunsLoad(function(G){if(qIn.value.trim()!==q)return;clear(hits);var r=gunHits(G,q);
     r.slice(0,24).forEach(function(x){hits.appendChild(el('button',{type:'button',text:x.name,onclick:function(){pickGun(x.name)}}))});
     if(!r.length)hits.appendChild(el('span',{class:'hint',text:tx('models.shot.noGuns')}))})});
   function pickGun(name){ST.gun=name;LS.set('models.armor.gun',name);clear(hits);qIn.value='';drawGun();ST.shells=null;ST.shellsOf=null;ST.ammo='';loadShells()}
   function loadShells(){if(!ST.gun)return;var gun=ST.gun;
    call('/api/x/models/armor/shells',{mod:mod,weapon:gun},function(j){if(ST.gun!==gun)return;ST.shells=j.shells||[];ST.shellsOf=gun;drawShells();
     if(!ST.shells.length)say(msg,'err',tx('models.shot.noShells'))},function(e){say(msg,e.cancelled?'hint':'err',e.message)})}
   function drawShells(){clear(shellSel);var list=ST.shells||[];
    if(list.length&&!list.some(function(s){return s.ammo===ST.ammo})){ST.ammo=list[0].ammo;LS.set('models.armor.ammo',ST.ammo)}
    list.forEach(function(s){var o=el('option',{value:s.ammo,text:s.ammo+' \u00b7 '+kindWord(s.kind,s.cumulative)+(s.calibre?' ('+s.calibre+' '+tx('models.shot.mm')+')':'')});if(s.ammo===ST.ammo)o.selected=true;shellSel.appendChild(o)});
    shellSel.value=ST.ammo}
   shellSel.addEventListener('change',function(){ST.ammo=shellSel.value;LS.set('models.armor.ammo',ST.ammo)});
   rangeIn.addEventListener('change',function(){var v=numOf(rangeIn.value);if(v==null||v<0||v>5000){say(msg,'err',tx('models.shot.badRange'));return}
    say(msg,'hint','');ST.range=v;LS.set('models.armor.range',v)});
   // where from and at what
   // the camera's way to a volume for the Shoot button: from the eye to its middle in perspective, the view direction in a flat view
   function cam(){var v=view();return v&&typeof v.camera==='function'?v:null}
   function camWay(vol){var v=cam();if(!v)return null;var c=v.camera();if(!c||!c.dir)return null;var m=vol&&ST.ctr[vol];
    return !c.ortho&&m&&c.eye?nrm([m[0]-c.eye[0],m[1]-c.eye[1],m[2]-c.eye[2]])||c.dir:c.dir}
   function drawFrom(){aeBox.style.display=ST.from==='typed'?'':'none';var no=ST.from==='camera'&&!cam();
    fireBtn.disabled=no;camNote.textContent=no?tx('models.shot.noCam'):''}
   fromSel.addEventListener('change',function(){ST.from=fromSel.value;drawFrom()});
   azIn.addEventListener('change',function(){ST.az=azIn.value});elIn.addEventListener('change',function(){ST.el=elIn.value});
   function drawVols(){clear(aimSel);aimSel.appendChild(el('option',{value:'',text:tx('models.shot.aimNone')}));var l=(ST.vols||[]).slice();
    if(ST.aim&&l.indexOf(ST.aim)<0)l.push(ST.aim);
    l.forEach(function(id){var o=el('option',{value:id,text:id});if(id===ST.aim)o.selected=true;aimSel.appendChild(o)});aimSel.value=ST.aim}
   function loadVols(){if(!docId()||typeof D.scene!=='function')return;var n=ST.gen;
    D.scene({meshes:false}).then(function(j){if(!live(n))return;var vs=((j&&j.volumes)||[]).filter(function(v){return v&&v.id});
     ST.vols=vs.map(function(v){return v.id});ST.ctr={};vs.forEach(function(v){if(v.world&&v.world.length>=12)ST.ctr[v.id]=v.world.slice(9,12)});
     var b0=j&&j.bones&&j.bones[0];ST.frame=frameOf(b0&&b0.world);drawVols()}).catch(function(){})}
   aimSel.addEventListener('change',function(){ST.aim=aimSel.value});
   fireBtn.addEventListener('click',function(){shoot(ST.aim?{volume:ST.aim}:null)});
   carryIn.addEventListener('change',function(){ST.carry=!!carryIn.checked});
   freshBtn.addEventListener('click',function(){if(ST.shot){ST.prev=null;run(true)}else{ST.resetNext=true;say(msg,'hint',tx('models.shot.freshNext'))}});

   // the shot
   function ready(){return !!(ST.gun&&ST.ammo)}
   function shoot(t){if(!ready()){say(msg,'err',tx('models.shot.pickGun'));return}
    if(!t||(!t.aim&&!t.volume&&!t.ground)){say(msg,'err',tx('models.shot.pickVol'));return}
    var ae;if(ST.from==='camera'){ae=aeFromDir(t.dir||camWay(t.volume),ST.frame);if(!ae){say(msg,'err',tx('models.shot.noCam'));return}}
    else{ae=aeOf(ST.from,ST.az,ST.el);if(!ae){say(msg,'err',tx('models.shot.badAe'));return}
     if(t.ground&&!(ae[1]>0)){say(msg,'err',tx('models.shot.groundLevel'));return}}   // a level shot (or one from below) never reaches the ground
    if(!docId()){say(msg,'err',tx('models.shot.needDoc'));return}
    ST.shot={az:ae[0],el:ae[1],from:ST.from,aim:t.ground?t.ground.slice():t.aim||null,volume:t.ground?null:t.volume||null,ground:!!t.ground};ST.prev=null;var r=ST.resetNext;ST.resetNext=false;run(r)}
   function run(reset){var s=ST.shot,id=docId();if(!s||!id)return;
    var b=bodyOf({mod:mod,target:target,gun:ST.gun,ammo:ST.ammo,range:ST.range},s,id,{carry:ST.carry,reset:reset}),r=++ST.req;
    say(msg,'hint',tx('models.shot.running',{n:b.samples}));clearShot3();
    call('/api/x/models/armor/effects',b,function(j){if(r!==ST.req)return;ST.fx=j;say(msg,'hint',ST.prev?tx('models.shot.rerun'):'');drawRes();drawRay()},
     function(e){if(r!==ST.req)return;ST.fx=null;clear(res);say(msg,e.cancelled?'hint':'err',e.message)})}
   function drawRes(){clear(res);var j=ST.fx,s=ST.shot;if(!j||!s)return;
    var what=s.ground?tx('models.shot.ground',{p:rnd3(s.aim)}):s.volume?short(s.volume):s.aim?s.aim.map(function(x){return Math.round(x)}).join(', '):'';
    res.appendChild(el('h4',{text:s.from==='camera'?tx('models.shot.atCam',{v:what,d:aeWords(s.az,s.el)}):s.from==='typed'?tx('models.shot.atAe',{v:what,s:tx('models.shot.fromAe',{a:s.az,e:s.el})}):tx('models.shot.at',{v:what,s:tx(FROMK[s.from])})}));
    summary(el,j).forEach(function(x){res.appendChild(x)});
    var A=EXT_SCREENS.models.subs&&EXT_SCREENS.models.subs.armor,F=A&&A._t&&A._t.fxMain,CL=A&&A._t&&A._t.crewLines;
    if(typeof CL==='function'){var cl=[];try{cl=CL(j)||[]}catch(x){cl=[]}cl.forEach(function(t){res.appendChild(el('div',{class:'hint',text:String(t)}))})}
    if(typeof F==='function'){var parts=[];try{parts=F(el,j,ST.prev)||[]}catch(x){parts=[]}parts.forEach(function(x){if(x)res.appendChild(x)})}}
   // the ray, and the result over the model when the view draws it (showShot: volumes by result, jets, fires, blasts)
   function drawRay(){var v=view(),j=ST.fx;if(!v||!j)return;if(typeof v.showShot==='function')ST.drawn=v.showShot(j);
    if(!v.addLine||!j.ray)return;var gp=groundOf(j),end=gp||rayEnd(j.ray,ST.shot&&ST.shot.aim);if(!end)return;
    if(v.clearLines)v.clearLines();v.addLine(j.ray.origin,end,lineCol());
    // a cross where the shell met the ground (or at the ground point aimed at)
    if(!gp&&ST.shot&&ST.shot.ground)gp=ST.shot.aim;crossAt(gp,8).forEach(function(s){v.addLine(s[0],s[1],lineCol())})}

   // a click on a volume in the view arrives as the document's select event; a new animation pose with the same volume is not a click
   function select(s){var p=ST.lastSel,cur={volume:s.volume||null,anm:s.anm||null,frame:Number(s.frame)||0},k=ST.skip;ST.lastSel=cur;ST.skip=null;
    if(k&&k.volume===cur.volume)return;   // the selection that follows a click already shot through hit()
    if(!cur.volume)return;if(p&&(p.anm!==cur.anm||p.frame!==cur.frame))return;
    ST.aim=cur.volume;drawVols();shoot({volume:cur.volume})}
   // the volumes shells never hit, for the open document (asked once per document and edit; a failed answer filters nothing)
   function loadNh(then){var id=docId();if(!id||ST.nhOf===id&&ST.nh){if(then)then();return}var n=ST.gen;
    api('/api/x/models/armor/nothit',{mod:mod,target:target,doc:id},{what:tx('models.shot.job.armor')}).then(function(j){if(!live(n))return;ST.nh=noShell(j&&j.notHit);ST.nhOf=id;if(then)then()})
     .catch(function(){if(live(n)&&then)then()})}
   // a click in the 3D view (ctx.onPick): a shot past the volumes shells never hit (a ram box), at the first one they do, through
   // the clicked point on it; nothing shells hit under the click: said, no shot. The view's own select event comes right after and is skipped
   // A click on the ground beside the model (hit.ground, nothing shells hit nearer under the click): a shot at that ground point.
   function hit(x){if(!x||(!x.point&&!x.volume&&!(x.hits||[]).length&&!x.ground))return;ST.skip={volume:x.volume||null};
    var d=x.dir&&x.dir.length===3?x.dir.slice():null;   // the view direction at the clicked pixel, in the pane clicked
    if(!Array.isArray(x.hits)){var a=aimAt(x,null);if(a&&a.ground&&!(x.volume&&!x.point)){shoot({ground:a.ground,dir:d});return}
     if(x.volume){ST.aim=x.volume;drawVols()}
     shoot(x.point&&x.point.length===3?{aim:x.point.slice(),volume:x.volume||null,dir:d}:{volume:x.volume,dir:d});return}
    var n=ST.gen;loadNh(function(){if(!live(n))return;var s=aimAt(x,ST.nh);if(!s){say(msg,'err',tx('models.shot.noShellHit'));return}
     if(s.ground){shoot({ground:s.ground,dir:d});return}
     if(s.volume){ST.aim=s.volume;drawVols()}shoot({aim:s.point,volume:s.volume,dir:d})})}
   function change(){loadVols();ST.nh=null;ST.nhOf=null;if(!ST.shot||!docId())return;
    if(ST.carry){say(msg,'hint',tx('models.shot.changed'));return}
    ST.prev=ST.fx;run(false)}
   on={select:select,change:change,hit:hit};
   var s0=(D&&D.sel)||{};ST.lastSel={volume:s0.volume||null,anm:s0.anm||null,frame:Number(s0.frame)||0};
   drawGun();drawFrom();drawVols();loadVols();loadNh();
   if(ST.gun&&(!ST.shells||ST.shellsOf!==ST.gun))loadShells();else drawShells();
   if(ST.fx){drawRes();drawRay()}
   if(EXT_SCREENS.models.blockify)EXT_SCREENS.models.blockify(bar)}   // one leaf per field (../client.js)

  if(D&&typeof D.on==='function')D.on(function(e){if(!e||!on||!ST.on||card.isConnected===false)return;
   if(e.type==='select')on.select(e.sel||{});else if(e.type==='change')on.change()});
  if(typeof ctx.onPick==='function')ctx.onPick(function(x){if(!on||!ST.on||card.isConnected===false)return;on.hit(x)});
  paint()}

 // the Model sub-tab may already have a part (set before this script): keep it and draw after it
 var before=EXT_SCREENS.models.subs.model;
 var model=function(ctx){if(typeof before==='function')before(ctx);part(ctx)};
 model._shot={kindWord:kindWord,aeFromDir:aeFromDir,frameOf:frameOf,aeWords:aeWords,aeOf:aeOf,bodyOf:bodyOf,noShell:noShell,shellHit:shellHit,along:along,aimAt:aimAt,groundOf:groundOf,crossAt:crossAt,rnd3:rnd3,rayEnd:rayEnd,endKey:endKey,summary:summary,notLoaded:notLoaded,numOf:numOf,pct:pct,short:short,AE:AE,FROM:FROM,ST:ST};
 EXT_SCREENS.models.subs.model=model;
})();
`;

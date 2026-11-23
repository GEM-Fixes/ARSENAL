// Models page part `look` (sub/README.md): the texture variants of the open model and the list of soldier skins.
//   EXT_SCREENS.models.parts.look(ctx, o) -> element | null: the control above the 3D view of the Model sub-tab. It asks
//     POST /api/x/models/look for the open model (ctx.set.target) and lists the texture variants its files have, "None (the plain
//     textures)" first, the one the def names marked "set in the file". A pick redraws the model (o.viewer.setVariant) and writes
//     nothing. A variant that also has mesh files (Gates of Hell "<mesh>#<variant>.ply") gets a small picture below with those
//     meshes (the Units line-up of the one model, POST /api/x/models/look/pose): the editable view keeps the meshes of the document.
//     o = { viewer, want (a variant to start with: another page's link), pose(skin, variant) (show a skin standing) }
//   EXT_SCREENS.models.parts.skins(o) -> { el, pose(skin, variant), stale() }: the card "Soldier skins": every skin of
//     entity/humanskin under army headings (Gates of Hell: army / uniform folder), searchable (searchKit: history key models.skins,
//     index = name, army, folder and the soldiers that wear it, Browse = the skin files of the game data), a picture per row, and one
//     skin standing at rest on the shared human skeleton with its variants to pick (the same route). o = { pick(name, variant) }
//   Both link to the Units page (S.screens.units.pick(id)) where a unit wears the model.
// The list is asked when it is opened or a word is typed, once per game, mod and write count. Reads only.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Test seam: EXT_SCREENS.models.parts.look._t (pure helpers).
// Author: Imperator_Aug (ARSENAL, ia-723aef57)
module.exports = String.raw`
(function(){
 var M=EXT_SCREENS.models,el=h,PAGE=40,FIND=12;
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function mod(){return (typeof S!=='undefined'&&S.mod)||null}
 function sig(){return typeof S==='undefined'?'':[S.gameId||'',S.mod||'',S.modWrites||0].join('|')}
 function soon(f){if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)}
 // ---------- pure helpers (test seam) ----------
 function has(j,v){return !!v&&((j.variants||[]).some(function(x){return x.name===v})||j.current===v)}
 function meshesOf(j,v){var n=0;(j.variants||[]).forEach(function(x){if(x.name===v)n=x.meshes||0});return n}
 // the variant a model starts with: the one asked for when its files have it, else the one its def names
 function startOf(j,want){if(want===''||want===false)return '';return has(j,want)?String(want):has(j,j.current)?j.current:''}
 // the soldiers that wear a skin, in the game's words where it has a name
 function wearers(by){return (by||[]).map(function(b){return b.name?b.name+' ('+b.id+')':b.id}).join(', ')}
 // rows of the skin list that hold every word, by heading (Gates of Hell: the folder, else the army), in list order
 function groupRows(a,words,g){var by={},order=[],n=0;
  for(var i=0;i<a.length;i++){var x=a[i],ok=!g||x.group===g;for(var k=0;ok&&k<words.length;k++)if(x.lo.indexOf(words[k])<0)ok=false;if(!ok)continue;
   var hk=x.sub.indexOf('/')>=0?x.sub:x.group;if(!by[hk]){by[hk]=[];order.push(hk)}by[hk].push(x);n++}
  return {by:by,order:order,n:n}}
 function headOf(hk){var p=String(hk).split('/');return p.length>1?p[0].replace(/[\[\]]/g,'')+' / '+p.slice(1).join(' / '):hk}
 function rowOf(x){var r={label:x.skin,value:x.skin,group:x.group,sub:x.sub,file:x.file,texmod:x.texmod||'',worn:x.worn||0,by:x.by||[]};
  r.hint=r.sub+(r.texmod?'  '+tx('models.skins.rowTex',{v:r.texmod}):'');
  r.lo=(r.value+' '+r.group+' '+r.sub+' '+r.texmod+' '+r.by.map(function(b){return b.id+' '+(b.name||'')}).join(' ')).toLowerCase();return r}

 // ---------- shared by the two parts ----------
 // one answer per model, game, mod and write count (the page draws the Model sub-tab again on many events)
 var CA={},CAN=0;
 function ask(target){var k=sig()+'|'+String(target).toLowerCase();if(CA[k])return CA[k];if(CAN++>40){CA={};CAN=0}
  var p=Promise.resolve(api('/api/x/models/look',{target:target,mod:mod()},{what:tx('models.look.job')}));CA[k]=p;p.then(function(j){if(!j||!j.ok)delete CA[k]},function(){delete CA[k]});return p}
 function fillSel(sel,j,pick){clear(sel);sel.appendChild(el('option',{value:'',text:tx('models.look.none')}));
  (j.variants||[]).forEach(function(v){var t=v.name+'  ('+tx('models.look.texN',{n:v.textures,t:j.textures||0})+(v.meshes?', '+tx('models.look.meshN',{n:v.meshes}):'')+')';
   sel.appendChild(el('option',{value:v.name,text:j.current===v.name?t+'  '+tx('models.look.inFile'):t}))});
  if(j.current&&!has({variants:j.variants},j.current))sel.appendChild(el('option',{value:j.current,text:j.current+'  '+tx('models.look.inFile')}));
  sel.value=pick||'';sel.disabled=false}
 function canUnits(){return typeof show==='function'&&typeof S!=='undefined'&&S.screens&&S.screens.units&&typeof S.screens.units.pick==='function'}
 function unitBtn(id,name){return el('button',{type:'button',text:tx('models.look.inUnits',{u:name||id}),title:id,onclick:function(){show('units');S.screens.units.pick(id)}})}
 function unitBtns(j,max){var a=[];if(!canUnits())return a;if(j.unit)a.push(unitBtn(j.unit.id,j.unit.name));
  (j.by||[]).slice(0,max||3).forEach(function(b){a.push(unitBtn(b.id,b.name))});return a}
 function notesOf(box,j,v){clear(box);function note(k,o,cls){box.appendChild(el('div',{class:cls||'hint',text:tx(k,o)}))}
  if(!mod())note('models.look.needMod',null,'wzstat');
  if(!(j.variants||[]).length)note('models.look.noFiles');
  if(j.current&&j.known===false)note('models.look.lost',{v:j.current},'wzstat');
  if((j.aliases||[]).length)note('models.look.aliases',{a:j.aliases.map(function(p){return p[0]+' = '+p[1]}).join(', ')});
  if(j.goh&&j.human)note('models.look.gohSeason');
  if(j.worn>(j.by||[]).length)note('models.look.wornMore',{n:j.worn})}
 var SHOW={volumes:false,grid:false,bones:false,axes:false};
 // a picture made to show a variant starts with its textures on (they need a mod folder: the texture route)
 function textured(w){if(mod()&&w&&typeof w.setMode==='function'){try{w.setMode('textured')}catch(e){}}}
 function sceneOf(target,v){return {url:'/api/x/models/look/pose',body:{target:target,variant:v?v:false}}}

 // ---------- the variant control of the open model ----------
 var KEEP={};   // the variant picked for a model, kept while the page draws the sub-tab again
 M.parts.look=function(ctx,o){o=o||{};var t=ctx&&ctx.set&&ctx.set.target,vw=o.viewer||null;if(!t)return null;
  var kk=sig()+'|'+String(t).toLowerCase(),J=null,mv=null;
  var sel=el('select',{'aria-label':tx('models.look.tex')},[el('option',{value:'',text:tx('models.look.none')})]),say=el('span',{class:'hint',role:'status',text:tx('models.look.reading')});
  var notes=el('div'),meshBox=el('div'),links=el('div',{class:'row',style:'flex-wrap:wrap;gap:6px'});sel.disabled=true;
  var box=el('div',{blk:'model.look',box:'col','data-blkname':tx('models.look.tex')},[
   el('div',{class:'row',blk:'model.look.pick',style:'flex-wrap:wrap;gap:8px','data-blkname':tx('models.look.tex')},[el('span',{class:'n',text:tx('models.look.tex')}),sel,say]),
   el('div',{blk:'model.look.notes','data-blkname':tx('models.look.blk.notes')},[notes]),
   el('div',{blk:'model.look.mesh','data-blkname':tx('models.look.blk.mesh')},[meshBox]),
   el('div',{blk:'model.look.links','data-blkname':tx('models.look.blk.links')},[links])]);
  // the picture with the meshes of the variant (Gates of Hell): made when a variant with mesh files is picked, dropped otherwise
  function meshView(v){var n=J?meshesOf(J,v):0;if(!n){clear(meshBox);mv=null;return}
   if(mv&&typeof mv.setScene==='function'){mv._note.textContent=tx('models.look.meshNote',{n:n});mv.setScene(sceneOf(t,v));return}
   clear(meshBox);var note=el('div',{class:'hint',text:tx('models.look.meshNote',{n:n})}),P=M.parts.viewer,w=null;meshBox.appendChild(note);
   try{if(P)w=P({set:{},mod:mod()},{doc:false,compact:true,height:300,blk:'model.look.meshview',show:SHOW,scene:sceneOf(t,v)})}catch(e){w=null}
   if(w){w._note=note;mv=w;meshBox.appendChild(w);textured(w)}}
  function apply(v,user){if(user)KEEP[kk]=v;if(vw&&typeof vw.setVariant==='function'){try{vw.setVariant(v,false,!user)}catch(e){}}meshView(v)}
  sel.addEventListener('change',function(){if(J)apply(sel.value||'',true)});
  ask(t).then(function(j){
   if(!j||!j.ok){sel.disabled=true;say.className='wzstat';say.textContent=tx('models.look.failed',{e:(j&&j.error)||'?'});return}
   J=j;var v=KEEP[kk]!=null?KEEP[kk]:startOf(j,o.want);if(v&&!has(j,v))v='';fillSel(sel,j,v);
   say.className='hint';say.textContent=!j.def?tx('models.look.noDef'):j.current?tx('models.look.setInFile',{v:j.current}):tx('models.look.notInFile');
   notesOf(notes,j,v);clear(links);
   if(j.skin&&typeof o.pose==='function')links.appendChild(el('button',{type:'button',text:tx('models.look.stand'),onclick:function(){o.pose(j.skin,sel.value||'')}}));
   unitBtns(j,3).forEach(function(b){links.appendChild(b)});
   if(v)apply(v,false)
  }).catch(function(e){say.className=e&&e.cancelled?'hint':'err';say.textContent=tx('models.look.failed',{e:(e&&e.message)||'?'})});
  return box};
 M.parts.look._t={has:has,meshesOf:meshesOf,startOf:startOf,wearers:wearers,groupRows:groupRows,headOf:headOf,rowOf:rowOf};
 M.parts.look.drop=function(){CA={};CAN=0};

 // ---------- the list of soldier skins and one skin standing ----------
 M.parts.skins=function(o){o=o||{};
  var A=null,aSig=null,want=null,on=false,words=[],q='',G='',OPEN={},pend=false,run=0,jobs=[],busy=0,IO,ioSeen=false,noIO=0,pics=null,PV=null,PS=null,pSeq=0;
  var qIn=el('input',{type:'text',autocomplete:'off',placeholder:tx('models.skins.find.ph'),'aria-label':tx('models.skins.find'),style:'flex:1;min-width:14em'});
  var gSel=el('select',{'aria-label':tx('models.skins.group')},[el('option',{value:'',text:tx('models.skins.all')})]);
  var tog=el('button',{type:'button','aria-expanded':'false',text:tx('models.skins.open'),onclick:function(){showList(!on)}});
  var stat=el('div',{class:'hint',role:'status'}),list=el('div'),body=el('div',{blk:'skins.list','data-blkname':tx('models.skins.list')},[stat,list]);body.hidden=true;
  var pTitle=el('h4',{style:'margin:8px 0 2px'}),pSel=el('select',{'aria-label':tx('models.look.tex')},[el('option',{value:'',text:tx('models.look.none')})]),pSay=el('span',{class:'hint',role:'status'});
  var pView=el('div'),pNotes=el('div'),pLinks=el('div',{class:'row',style:'flex-wrap:wrap;gap:6px'});
  var pose=el('div',{blk:'skins.pose',box:'col','data-blkname':tx('models.skins.pose.blk')},[el('div',{blk:'skins.pose.title','data-blkname':tx('models.skins.pose.blk')},[pTitle]),
   el('div',{class:'row',blk:'skins.pose.pick',style:'flex-wrap:wrap;gap:8px','data-blkname':tx('models.look.tex')},[el('span',{class:'n',text:tx('models.look.tex')}),pSel,pSay]),
   el('div',{blk:'skins.pose.pic','data-blkname':tx('models.skins.pose.blk')},[pView]),el('div',{blk:'skins.pose.notes','data-blkname':tx('models.look.blk.notes')},[pNotes]),
   el('div',{blk:'skins.pose.links','data-blkname':tx('models.look.blk.links')},[pLinks])]);pose.hidden=true;
  function load(cb){var s=sig();if(A&&aSig===s){cb(A);return}if(want&&want.s===s){want.cbs.push(cb);return}var w=want={s:s,cbs:[cb]};
   if(!A){stat.className='hint';stat.textContent=tx('models.skins.loading')}
   Promise.resolve(api('/api/x/models/look/skins',{mod:mod(),lang:typeof LANG==='undefined'?'en':LANG},{what:tx('models.skins.job')})).then(function(j){if(want!==w)return;want=null;
    A=(j.skins||[]).map(rowOf);A.groups=j.groups||[];aSig=s;groups();w.cbs.forEach(function(f){f(A)})
   }).catch(function(e){if(want!==w)return;want=null;stat.className=e&&e.cancelled?'hint':'err';stat.textContent=tx('models.skins.failed',{e:(e&&e.message)||'?'})})}
  function groups(){var keep=false;clear(gSel);gSel.appendChild(el('option',{value:'',text:tx('models.skins.allN',{n:(A||[]).length})}));
   ((A&&A.groups)||[]).forEach(function(g){if(g.group===G)keep=true;gSel.appendChild(el('option',{value:g.group,text:g.group+' ('+g.n+')'}))});if(!keep)G='';gSel.value=G}
  function showList(v){on=!!v;body.hidden=!on;tog.setAttribute('aria-expanded',on?'true':'false');tog.textContent=tx(on?'models.skins.close':'models.skins.open');if(on)load(draw)}
  function setQ(t){var s=String(t||'').trim().toLowerCase();if(s===q)return;q=s;words=s?s.split(/\s+/):[];OPEN={};if(!on){if(s)showList(true);return}drawSoon()}
  function drawSoon(){if(pend)return;pend=true;soon(function(){pend=false;draw()})}
  function draw(){run++;jobs=[];noIO=0;clear(list);if(IO){try{IO.disconnect()}catch(e){}}
   if(!A){stat.textContent='';return}var R=groupRows(A,words,G),qq=words.length>0;
   R.order.forEach(function(hk){list.appendChild(groupEl(hk,R.by[hk],qq,R.order.length===1))});
   stat.className=R.n?'hint':'wzstat';
   stat.textContent=!A.length?tx('models.skins.empty'):!R.n?tx('models.skins.noneFound'):(qq||G)?tx('models.skins.found',{n:R.n,t:A.length}):tx('models.skins.count',{n:A.length,g:R.order.length});
   ioCheck()}
  function groupEl(hk,rows,qq,only){var open=OPEN[hk]!=null?OPEN[hk]:(qq||only),lab=headOf(hk);
   var hb=el('button',{type:'button','data-skg':hk,'aria-expanded':open?'true':'false','aria-label':tx('models.skins.groupAria',{g:lab,n:rows.length}),
    style:'display:block;width:100%;text-align:left;font-weight:bold;margin:4px 0 2px',text:(open?'- ':'+ ')+lab+' ('+rows.length+')',onclick:function(){OPEN[hk]=!open;draw()}});
   var sec=el('div',{role:'group','aria-label':lab},[hb]);if(!open)return sec;
   var at=0,ul=el('ul',{style:'list-style:none;margin:0 0 6px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:6px'}),more=el('button',{type:'button','data-skmore':hk});
   var fill=function(to){for(;at<to&&at<rows.length;at++)ul.appendChild(rowEl(rows[at]));var left=rows.length-at;more.hidden=!left;more.textContent=left?tx('models.skins.more',{n:Math.min(left,PAGE),left:left}):''};
   more.addEventListener('click',function(){fill(at+PAGE);ioCheck()});
   fill(qq?FIND:PAGE);sec.appendChild(ul);sec.appendChild(more);return sec}
  // one skin: its picture (drawn with the variant its file names; needs a mod folder for the texture route), name, folder, who wears it
  function rowEl(x){var S11='font-size:11px;overflow-wrap:anywhere',kids=[],now=!!(PS&&PS.skin===x.value);
   if(mod()){var pic=el('div',{'aria-hidden':'true',style:'flex:0 0 56px;width:56px;height:84px;position:relative;border:1px solid var(--line);border-radius:3px;background:var(--bg)'});kids.push(pic);picOf(pic,x)}
   var txt=[el('b',{style:'display:block;overflow-wrap:anywhere',text:x.value}),el('div',{class:'hint',style:S11,text:x.hint}),
    el('div',{class:'hint',style:S11,text:x.worn?tx('models.skins.worn',{n:x.worn,by:wearers(x.by)+(x.worn>x.by.length?' ...':'')}):tx('models.skins.wornNone')})];
   var btns=[el('button',{type:'button','data-sks':x.value,class:now?'primary':null,'aria-pressed':now?'true':'false',text:tx('models.look.stand'),'aria-label':tx('models.look.stand')+': '+x.value,onclick:function(){poseOf(x.value,null)}}),
    el('button',{type:'button','data-sko':x.value,text:tx('models.skins.openModel'),'aria-label':tx('models.skins.openModel')+': '+x.value,onclick:function(){if(typeof o.pick==='function')o.pick(x.value,x.texmod||'')}})];
   if(x.by.length&&canUnits())btns.push(unitBtn('mp/'+x.by[0].id,x.by[0].name));
   txt.push(el('div',{class:'row',style:'flex-wrap:wrap;gap:4px;margin-top:4px'},btns));
   kids.push(el('div',{style:'flex:1 1 auto;min-width:0'},txt));
   return el('li',{'data-ski':x.value,style:'display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:4px;padding:6px;min-width:0'},kids)}
  // pictures, lazily: a row that comes on screen puts a job in the line, two are asked at a time, a job whose row is gone is dropped.
  // A browser that does not report rows coming on screen (no IntersectionObserver, or none of its calls arrive: a page that is not
  // painted) gets the first FIND rows of the list drawn anyway
  function obs(){if(IO!==undefined)return IO;IO=null;
   try{if(typeof IntersectionObserver==='function')IO=new IntersectionObserver(function(es){ioSeen=true;es.forEach(function(e){var j=e.target._sk;if(!e.isIntersecting||!j)return;e.target._sk=null;IO.unobserve(e.target);jobs.push(j)});pump()},{rootMargin:'150px'})}catch(e){IO=null}
   return IO}
  function picOf(box,x){var j={box:box,x:x,run:run},io=obs();if(io){box._sk=j;io.observe(box)}else if(noIO++<FIND){jobs.push(j);pump()}}
  function ioCheck(){if(!IO||ioSeen)return;var my=run;setTimeout(function(){if(ioSeen||my!==run)return;var b=list.querySelectorAll?list.querySelectorAll('li > div[aria-hidden]'):[];
   for(var i=0;i<b.length&&i<FIND;i++){var j=b[i]._sk;if(j){b[i]._sk=null;jobs.push(j)}}pump()},1500)}
  function pump(){while(busy<2&&jobs.length){var j=jobs.shift();if(j.run!==run||j.box.isConnected===false)continue;busy++;picAsk(j)}}
  function picAsk(j){var done=false,t=null,fin=function(url){if(done)return;done=true;if(t)clearTimeout(t);busy--;
    if(url&&j.box.isConnected!==false)j.box.appendChild(el('img',{src:url,alt:'',draggable:'false',style:'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain'}));pump()};
   try{if(!pics){var V=M.parts.viewer;pics=V&&typeof V.pictures==='function'?V.pictures({sig:sig,mod:mod}):null}}catch(e){pics=null}
   if(!pics){fin(null);return}t=setTimeout(function(){fin(null)},30000);
   try{pics.get(j.x.value,112,168,fin,undefined,j.x.texmod||'')}catch(e){fin(null)}}
  // one skin standing at rest with its equipment-free body, the variant of its file first; the select redraws it
  function poseDraw(v){var sc=sceneOf(PS.skin,v),P=M.parts.viewer;PS.v=v;
   if(PV&&typeof PV.setScene==='function'){try{PV.setScene(sc);return}catch(e){PV=null}}
   clear(pView);var w=null;try{if(P)w=P({set:{},mod:mod()},{doc:false,compact:true,height:420,blk:'skins.pose.view',show:SHOW,scene:sc})}catch(e){w=null}
   if(w&&typeof w.setScene==='function'){PV=w;pView.appendChild(w);textured(w)}else pView.appendChild(el('div',{class:'hint',text:tx('models.skins.pose.no3d')}))}
  function poseOf(name,variant){name=String(name||'').toLowerCase();if(!name)return;var my=++pSeq;PS={skin:name,v:null};pose.hidden=false;
   pTitle.textContent=tx('models.skins.pose.h',{s:name});pSel.disabled=true;pSay.className='hint';pSay.textContent=tx('models.look.reading');clear(pNotes);clear(pLinks);
   if(on)drawSoon();if(pose.scrollIntoView)try{pose.scrollIntoView({block:'nearest'})}catch(e){}
   ask(name).then(function(j){if(my!==pSeq)return;
    if(!j||!j.ok){pSay.className='wzstat';pSay.textContent=tx('models.look.failed',{e:(j&&j.error)||'?'});return}
    var v=startOf(j,variant==null?undefined:variant);fillSel(pSel,j,v);PS.j=j;
    pSay.className='hint';pSay.textContent=j.current?tx('models.look.setInFile',{v:j.current}):tx('models.look.notInFile');notesOf(pNotes,j,v);
    pLinks.appendChild(el('button',{type:'button',text:tx('models.skins.openModel'),onclick:function(){if(typeof o.pick==='function')o.pick(name,pSel.value||'')}}));
    unitBtns(j,3).forEach(function(b){pLinks.appendChild(b)});poseDraw(v)
   }).catch(function(e){if(my!==pSeq)return;pSay.className=e&&e.cancelled?'hint':'err';pSay.textContent=tx('models.look.failed',{e:(e&&e.message)||'?'})})}
  pSel.addEventListener('change',function(){if(PS&&PS.j)poseDraw(pSel.value||'')});
  gSel.addEventListener('change',function(){G=gSel.value||'';OPEN={};if(!on)showList(true);else drawSoon()});
  // searchKit (owner: every search box has a manual browse, an indexed search and a history list): history models.skins; index =
  // every skin by name, army, folder and wearer; Browse = the skin files of the game data, the picked file is shown standing
  var kit=typeof searchKit==='function'?searchKit(qIn,{key:'models.skins',beside:true,
   index:function(s,done){load(function(a){s=String(s||'').trim().toLowerCase();var w=s?s.split(/\s+/):[],f=[];
    for(var i=0;i<a.length;i++){var ok=true;for(var k=0;ok&&k<w.length;k++)if(a[i].lo.indexOf(w[k])<0)ok=false;if(ok)f.push(a[i])}done(f.slice(0,40),Math.max(0,f.length-40))})},
   browse:{mode:'file',view:'data',start:'entity/humanskin',exts:['def','mdl'],toValue:function(p){return String(p||'').replace(/\\/g,'/').split('/').pop().replace(/\.[a-z0-9]+$/i,'')}},
   onPick:function(v,it,from){var t=String((from!=='browse'&&it&&it.value)||v||'').trim().toLowerCase();if(!t)return;qIn.value=t;setQ(t);if(!on)showList(true);
    if(from==='browse'||(it&&it.value))load(function(a){if(a.some(function(x){return x.value===t}))poseOf(t,null)})}}):null;
  qIn.addEventListener('input',function(){setQ(qIn.value)});
  qIn.addEventListener('change',function(){setQ(qIn.value)});
  var card=el('div',{class:'card',blk:'skins',box:'col','data-blkname':tx('models.skins.h')},[el('div',{blk:'skins.title'},[el('h3',{text:tx('models.skins.h')})]),
   el('div',{class:'hint',blk:'skins.intro','data-blkname':tx('models.skins.h'),text:tx('models.skins.intro')}),
   el('div',{class:'row',blk:'skins.find',style:'flex-wrap:wrap','data-blkname':tx('models.skins.find')},[kit?kit.el:qIn,gSel,tog]),body,pose]);
  return {el:card,pose:function(n,v){poseOf(n,v);if(card.scrollIntoView)try{card.scrollIntoView({block:'start'})}catch(e){}},
   // the game or the mod changed: the open list is read again, the standing skin goes
   stale:function(){if(aSig!==null&&aSig!==sig()){A=null;aSig=null;pose.hidden=true;PS=null;pSeq++;if(on)load(draw);else{clear(list);stat.textContent=''}}},
   _st:function(){return {A:A,on:on,PS:PS,PV:PV,jobs:jobs.length,busy:busy}}}};
})();
`;

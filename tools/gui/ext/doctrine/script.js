// browser side of the "Bot doctrine" page. Page rules: no backtick, no dollar-brace, DOM only through h() and textContent.
// Author: Imperator_Aug (ARSENAL, ia-feda463f)
module.exports = String.raw`
EXT_SCREENS.doctrine=function(root){
 var BASE='/api/x/doctrine/';
 var TABS=['rules','personas','missions','profile','gen','check'];
 var DATA=null,cur=LS.get('doctrine.tab','rules'),seed=0;
 if(TABS.indexOf(cur)<0)cur='rules';
 function qs(o){var s=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')s.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return s.join('&')}
 // GT-34: server errors arrive as CODE, tab, value, tab, English; show the translated text (English only when no key exists)
 function errT(m){var p=String(m==null?'':m).split('\t');if(p.length>=3&&/^DOC_/.test(p[0])){var k='doctrine.err.'+p[0],t=tx(k,{x:p[1]});return t!==k?t:p.slice(2).join(' ')}return String(m)}
 function errBox(m){return h('div',{class:'err',text:errT(m)})}
 // JOBS: a request stopped from the footer (e.cancelled) shows the plain line Stopped, not a red error
 function errOf(e){return e&&e.cancelled?h('div',{class:'hint',text:e.message}):errBox(e.message)}
 function tOr(k,a,fb){var t=tx(k,a||{});return t!==k?t:fb}
 function kindT(k){return tOr('doctrine.kind.'+k,null,k||'?')}
 function whyT(key,fb){return tOr('doctrine.why.'+key,null,fb)}
 function modLine(){return hint(tx('doctrine.gen.mod',{m:S.mod}))}
 function profVal(v){return v==='robz'?'botconfig':v}
 // GoH (curGame kind goh): no bot.data.lua; its one bot settings file is the Conquest one (profile conquest)
 function isGoh(){return typeof curGame==='function'&&!!curGame()&&curGame().kind==='goh'}
 function profOpts(auto){var o=isGoh()?[['conquest',tx('doctrine.prof.conquest')]]:[['vanilla',tx('doctrine.prof.vanilla')],['botconfig',tx('doctrine.prof.big')]];return auto?[['auto',tx('doctrine.prof.auto')]].concat(o):o}
 function hint(t){return h('div',{class:'hint',text:t})}
 function para(t){return h('p',{text:t})}
 function card(title,kids){return h('div',{class:'card'},[h('h3',{text:title})].concat(kids))}
 function li(arr){return h('ul',{},arr.map(function(t){return h('li',{text:t})}))}
 function wrapText(t){return h('div',{style:'white-space:pre-wrap;max-height:32em;overflow:auto'},[document.createTextNode(t)])}
 function sel(label,opts,val){var s=h('select',{'aria-label':label},opts.map(function(o){return h('option',{value:o[0],text:o[1]})}));if(val!=null)s.value=val;return s}
 // searchKit index hits: items carry lo (lower case made once); word starts first, 30 shown, the rest counted
 function hitsOf(items,s,done){s=String(s||'').trim().toLowerCase();if(!s){done([]);return}var a=[],b=[];
  for(var i=0;i<items.length;i++){var it=items[i],k=it.lo.indexOf(s);if(k<0)continue;(k===0||it.lo.charAt(k-1)===' '||it.lo.charAt(k-1)==='\\'||it.lo.charAt(k-1)==='/'?a:b).push(it)}
  var all=a.concat(b);done(all.slice(0,30),Math.max(0,all.length-30))}
 // the mods in the game's mod folders (S.roots, per game tab), asked once per set of folders
 var MODS={key:null,items:null,wait:[]};
 function modItems(cb){var roots=S.roots||[],key=roots.join('|');
  if(MODS.key===key&&MODS.items){cb(MODS.items);return}
  if(MODS.key===key){MODS.wait.push(cb);return}
  MODS={key:key,items:null,wait:[cb]};var all=[],pend=roots.length;
  function fin(){if(MODS.key!==key)return;MODS.items=all;var w=MODS.wait;MODS.wait=[];w.forEach(function(f){f(all)})}
  if(!pend){fin();return}
  roots.forEach(function(r){api('/api/mods?dir='+encodeURIComponent(r),undefined,{what:tx('doctrine.job.mods')}).then(function(j){(j.mods||[]).forEach(function(m){if(!m||!m.path||all.some(function(x){return x.value===m.path}))return;
    var nm=m.name||m.path.split(/[\\/]/).pop();all.push({label:nm,value:m.path,hint:m.path,group:r,lo:(nm+' '+m.path).toLowerCase()})})}).catch(function(){}).then(function(){if(--pend===0)fin()})})}
 function bar(v){var n=Math.round((Number(v)||0)*10),s='';for(var i=0;i<10;i++)s+=(i<n?'#':'.');return s+' '+v}

 root.appendChild(blk('title',[h('h2',{text:tx('doctrine.h1')})]));
 // ---- intro
 root.appendChild(h('div',{class:'card',blk:'intro',box:'col'},[blk('intro.title',[h('h3',{text:tx('doctrine.intro.h')})]),
  blk('intro.text',[para(tx('doctrine.intro.what')),para(tx('doctrine.intro.game')),
  h('div',{class:'err',text:tx('doctrine.intro.guess')}),para(tx('doctrine.intro.vanilla')),hint(tx('doctrine.intro.english'))]),
  h('div',{class:'row',blk:'intro.btns'},[h('button',{type:'button',text:tx('doctrine.toBots'),onclick:function(){show('bots')}})])]));
 // ---- how to use the generator
 var steps=[];for(var i=1;i<=6;i++)steps.push(tx('doctrine.how.'+'s'+i));
 root.appendChild(h('div',{class:'card',blk:'how',box:'col'},[blk('how.title',[h('h3',{text:tx('doctrine.how.h')})]),blk('how.steps',[h('ol',{},steps.map(function(t){return h('li',{text:t})}))]),
  blk('how.get',[h('b',{text:tx('doctrine.how.get.h')}),li([tx('doctrine.how.get1'),tx('doctrine.how.get2'),tx('doctrine.how.get3')])]),
  blk('how.not',[h('b',{text:tx('doctrine.how.not.h')}),li([tx('doctrine.how.not1'),tx('doctrine.how.not2'),tx('doctrine.how.not3'),tx('doctrine.how.not4')])])]));
 // ---- tabs: the tab buttons are one block; the open tab is a container block (id = tab id) in the pane, built again on each switch
 var tabBar=h('div',{class:'row',role:'tablist'}),pane=blk('pane',[],{box:'col',name:tx('doctrine.blk.pane')}),panel=null,tabs={};
 TABS.forEach(function(id){var b=h('button',{type:'button',role:'tab',text:tx('doctrine.tab.'+id),onclick:function(){go(id)}});tabs[id]=b;tabBar.appendChild(b)});
 root.appendChild(blk('tabs',[tabBar],{name:tx('doctrine.blk.tabs')}));root.appendChild(pane);
 function go(id){cur=id;LS.set('doctrine.tab',id);
  TABS.forEach(function(t){tabs[t].setAttribute('aria-selected',t===id?'true':'false');tabs[t].className=t===id?'primary':''});
  pane.textContent='';
  if(!DATA){pane.appendChild(blk('wait',[hint(tx('doctrine.loading'))]));blkApply(root);return}
  panel=blk(id,[],{box:'col',name:tx('doctrine.tab.'+id)});pane.appendChild(panel);
  ({rules:rulesTab,personas:personasTab,missions:missionsTab,profile:profileTab,gen:genTab,check:checkTab})[id]();blkApply(root)}
 function load(){DATA=null;go(cur);
  api(BASE+'data',undefined,{what:tx('doctrine.job.data')}).then(function(d){DATA=d;go(cur)}).catch(function(e){pane.textContent='';pane.appendChild(blk('wait',[errBox(tx('doctrine.error',{m:errT(e.message)}))]));blkApply(root)})}
 function personaOpts(){return DATA.personas.map(function(p){return [p.id,p.title+' ('+p.id+')']})}

 // ---- Rules
 function rulesTab(){
  var fams=[['',tx('doctrine.rules.all')]];var seen={};DATA.rules.forEach(function(r){if(!seen[r.family]){seen[r.family]=1;fams.push([r.family,r.family])}});
  var fs=sel(tx('doctrine.rules.family'),fams,''),q=h('input',{type:'search','aria-label':tx('doctrine.rules.find'),placeholder:tx('doctrine.rules.find')}),out=h('div');
  panel.appendChild(h('div',{class:'row',blk:'rules.filter',box:'row','data-blkname':tx('doctrine.blk.filter')},[fld('rules.filter.family',tx('doctrine.rules.family'),fs),blk('rules.filter.find',[q])]));
  panel.appendChild(blk('rules.lead',[hint(tx('doctrine.rules.lead'))]));panel.appendChild(blk('rules.list',[out],{name:tx('doctrine.blk.list')}));
  // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box): index = rule IDs, tasks and keywords;
  // Browse = the folder picker on the pack's documents (data/md): a picked mission file (missions/river.md) narrows the list to the
  // rules that mission teaches, another file to the rules that name it; a rule shows that rule. Typing draws in the next frame over lower
  // case text made once per rule
  var RIX=DATA.rules.map(function(r){return {label:r.id,value:r.id,hint:r.task||'',lo:(r.id+' '+(r.task||'')+' '+[].concat(r.keywords||[]).join(' ')).toLowerCase()}});
  searchKit(q,{key:'doctrine.rules.q',index:function(s,done){hitsOf(RIX,s,done)},
   browse:{mode:'file',exts:['md'],start:function(){return DATA.dir||''},toValue:function(p){var b=String(p||'').replace(/[\\\/]+$/,'').split(/[\\\/]/).pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}},
   onPick:function(v){q.value=v;draw()}});
  // the rules a mission teaches, by the mission id (= its file name)
  function misRules(w){var m=DATA.missions.filter(function(x){return String(x.id).toLowerCase()===w})[0];return m?m.rules||[]:null}
  var pend=false;function soon(){if(typeof requestAnimationFrame!=='function'){draw();return}if(pend)return;pend=true;requestAnimationFrame(function(){pend=false;draw()})}
  function draw(){out.textContent='';var w=q.value.trim().toLowerCase(),n=0,mr=w?misRules(w):null;
   DATA.rules.forEach(function(r){if(fs.value&&r.family!==fs.value)return;
    if(w&&(r._lo||(r._lo=JSON.stringify([r.id,r.task,r.keywords,r.when,r.do]).toLowerCase())).indexOf(w)<0&&!(mr&&mr.indexOf(r.id)>=0))return;n++;
    var kids=[h('div',{text:tx('doctrine.rules.when')+' '+r.when}),li(r.do||[])];
    kids.push(h('div',{class:'hint',text:tx('doctrine.rules.roles')+' '+Object.keys(r.roles||{}).map(function(k){return k+': '+r.roles[k].join('/')}).join('; ')}));
    kids.push(h('div',{class:'hint',text:tx('doctrine.rules.fit')+' '+Object.keys(r.fit||{}).map(function(k){return k+': '+tOr('doctrine.fit.'+r.fit[k],null,r.fit[k])}).join(', ')}));
    var ps=r.param_source||{},guess=Object.keys(ps).filter(function(k){return ps[k]==='design'});
    if(guess.length)kids.push(h('div',{class:'changed',text:tx('doctrine.rules.design',{k:guess.join(', ')})}));
    (r.pitfalls||[]).forEach(function(p){kids.push(h('div',{class:'hint',text:tx('doctrine.rules.pitfall')+' '+p}))});
    out.appendChild(card(r.id+' - '+r.task,kids))});
   if(!n)out.appendChild(hint(tx('doctrine.rules.none')))}
  fs.addEventListener('change',draw);q.addEventListener('input',soon);draw()}

 // ---- Personas
 function personasTab(){
  var ps=sel(tx('doctrine.persona'),personaOpts(),LS.get('doctrine.persona','universal')),out=h('div');
  panel.appendChild(fld('personas.pick',tx('doctrine.persona'),ps));panel.appendChild(blk('personas.card',[out],{name:tx('doctrine.blk.card')}));
  function draw(){out.textContent='';LS.set('doctrine.persona',ps.value);
   var p=DATA.personas.filter(function(x){return x.id===ps.value})[0];if(!p)return;
   var t=p.temperament||{};
   var kids=[para(p.lobby_note||''),h('div',{class:'hint',text:tx('doctrine.p.meta',{a:(p.armies||[]).join(' '),f:p.fidelity})}),
    h('b',{text:tx('doctrine.p.temp')}),
    h('pre',{class:'log'},[document.createTextNode(['aggression','reserve_share','initiative','caution'].map(function(k){return (tx('doctrine.t.'+k)+'               ').slice(0,16)+bar(t[k])}).join('\n'))]),
    hint(tx('doctrine.p.tempHint')),h('b',{text:tx('doctrine.p.traits')})];
   kids.push(h('ul',{},(p.traits||[]).map(function(r){return h('li',{text:r.rule+': '+r['do']+' ['+(r.basis==='design'?tx('doctrine.p.design'):tx('doctrine.p.claim'))+(r.departs?', '+tx('doctrine.p.departs'):'')+']'})})));
   var v=DATA.voices.filter(function(x){return x.id===p.voice})[0],ev=sel(tx('doctrine.p.event'),(v?v.events:['contact']).map(function(e){return [e,e]})),line=h('div',{class:'ok'});
   kids.push(h('b',{text:tx('doctrine.p.voice')}));
   kids.push(h('div',{class:'row'},[ev,h('button',{type:'button',text:tx('doctrine.p.sample'),onclick:function(){
    api(BASE+'voice?'+qs({persona:p.id,event:ev.value,seed:seed++})).then(function(r){line.textContent=r.line}).catch(function(e){line.textContent='';line.appendChild(errBox(e.message))})}})]));
   kids.push(line);kids.push(hint(tx('doctrine.p.voiceHint')));
   out.appendChild(card(p.title,kids))}
  ps.addEventListener('change',draw);draw()}

 // ---- Missions
 function missionsTab(){
  var ms=sel(tx('doctrine.m.pick'),DATA.missions.map(function(m){return [m.id,m.title]})),out=h('div');
  panel.appendChild(fld('missions.pick',tx('doctrine.m.pick'),ms));panel.appendChild(blk('missions.lead',[hint(tx('doctrine.m.lead'))]));panel.appendChild(blk('missions.card',[out],{name:tx('doctrine.blk.card')}));
  function draw(){out.textContent='';var m=DATA.missions.filter(function(x){return x.id===ms.value})[0];if(!m)return;
   out.appendChild(card(m.title,[h('div',{text:tx('doctrine.m.teaches')+' '+m.teaches}),h('div',{text:tx('doctrine.m.win')+' '+m.win}),
    h('div',{class:'hint',text:tx('doctrine.m.sides',{a:m.attacker.persona+' ('+m.attacker.shape+')',d:m.defender.persona+' ('+m.defender.shape+')'})}),
    h('div',{class:'hint',text:tx('doctrine.m.rules')+' '+(m.rules||[]).join(', ')}),wrapText(m.briefing||'')]))}
  ms.addEventListener('change',draw);draw()}

 // ---- Profile
 function profileTab(){
  var pr=sel(tx('doctrine.prof.pick'),profOpts(false),isGoh()?'conquest':profVal(LS.get('doctrine.prof','vanilla'))),out=h('div'),det=h('div');
  if(S.mod)panel.appendChild(blk('profile.mod',[modLine()]));
  panel.appendChild(fld('profile.pick',tx('doctrine.prof.pick'),pr,{after:h('button',{type:'button',text:tx('doctrine.prof.detect'),onclick:detect})}));
  panel.appendChild(blk('profile.detect',[det],{name:tx('doctrine.blk.detect')}));panel.appendChild(blk('profile.res',[out],{name:tx('doctrine.blk.res')}));
  function detect(){det.textContent='';if(!S.mod){det.appendChild(errBox(tx('doctrine.needmod')));return}
   api(BASE+'detect?'+qs({mod:S.mod}),undefined,{what:tx('doctrine.job.detect')}).then(function(r){
    if(!r.found){det.appendChild(errBox(tx(isGoh()?'doctrine.prof.notFoundGoh':'doctrine.prof.notFound')));return}
    det.appendChild(h('div',{class:'ok',text:tx('doctrine.prof.found',{k:kindT(r.kind),f:r.file})}));
    if(r.stamp)det.appendChild(hint(tx('doctrine.stamp',{p:r.stamp.persona,s:r.stamp.scale})));
    pr.value=profVal(r.kind);draw()}).catch(function(e){det.appendChild(errBox(e.message))})}
  function draw(){out.textContent='';if(!isGoh())LS.set('doctrine.prof',pr.value);out.appendChild(hint(tx('doctrine.loading')));
   api(BASE+'profile?'+qs({id:pr.value}),undefined,{what:tx('doctrine.job.profile')}).then(function(r){out.textContent='';
    out.appendChild(h('div',{class:pr.value==='vanilla'?'err':'hint',text:tx(pr.value==='botconfig'?'doctrine.prof.bigSays':pr.value==='conquest'?'doctrine.prof.conquestSays':'doctrine.prof.vanillaSays',{n:r.reference.count})}));
    out.appendChild(card(tx('doctrine.prof.takes'),[h('table',{},[h('tr',{},[h('th',{text:tx('doctrine.col.key')}),h('th',{text:tx('doctrine.col.driver')}),h('th',{text:tx('doctrine.col.why')})])].concat(
     r.takes.map(function(k){return h('tr',{},[h('td',{text:k.key}),h('td',{text:tx('doctrine.t.'+k.driver)}),h('td',{text:whyT(k.key,k.why)})])})))]));
    out.appendChild(card(tx('doctrine.prof.text'),[wrapText(r.md||'')]))}).catch(function(e){out.textContent='';out.appendChild(errBox(e.message))})}
  pr.addEventListener('change',draw);draw()}

 // ---- Generate: preview, then write
 function genTab(){
  if(!S.mod){panel.appendChild(blk('gen.need',[errBox(tx('doctrine.needmod'))]));return}
  panel.appendChild(blk('gen.mod',[modLine()]));
  var ps=sel(tx('doctrine.persona'),personaOpts(),LS.get('doctrine.persona','universal'));
  var pr=sel(tx('doctrine.prof.pick'),profOpts(true),'auto');
  var sc=h('input',{type:'number',min:'0',max:'2',step:'0.25',value:'1','aria-label':tx('doctrine.gen.scale')});
  var bs=h('input',{type:'text','aria-label':tx('doctrine.gen.base'),placeholder:tx('doctrine.gen.basePh')});
  var res=h('div'),last=null;
  var bPrev=h('button',{type:'button',class:'primary',text:tx('doctrine.gen.preview'),onclick:function(){run(false)}});
  var bWrite=h('button',{type:'button',class:'danger',text:tx('doctrine.gen.write'),disabled:true,onclick:function(){run(true)}});
  function params(){return {mod:S.mod,persona:ps.value,profile:pr.value,scale:sc.value,base:bs.value.trim()}}
  function stale(){last=null;bWrite.disabled=true}
  [ps,pr,sc,bs].forEach(function(e){e.addEventListener('change',stale);e.addEventListener('input',stale)});
  panel.appendChild(h('div',{class:'row',blk:'gen.opts',box:'row','data-blkname':tx('doctrine.blk.opts')},[fld('gen.opts.persona',tx('doctrine.persona'),ps),fld('gen.opts.profile',tx('doctrine.prof.pick'),pr),fld('gen.opts.scale',tx('doctrine.gen.scale'),sc)]));
  panel.appendChild(blk('gen.scalehint',[hint(tx('doctrine.gen.scaleHint'))]));
  panel.appendChild(fld('gen.base',tx('doctrine.gen.base'),bs));
  // searchKit on the base file box (owner 2026-11-19): index = the mods in this game's mod folders; Browse = the folder picker (a mod
  // folder: "Use this folder") at the box's folder, else the game's mods folder; the folder's path goes in; a pick marks the preview stale
  searchKit(bs,{key:'doctrine.gen.base',index:function(s,done){modItems(function(a){hitsOf(a,s,done)})},
   browse:{mode:'dir',start:function(){return bs.value.trim()||(S.roots||[])[0]||''}},onPick:function(v){bs.value=v;stale()}});
  panel.appendChild(blk('gen.basehint',[hint(tx('doctrine.gen.baseHint'))]));
  panel.appendChild(h('div',{class:'row',blk:'gen.btns'},[bPrev,bWrite]));panel.appendChild(blk('gen.res',[res],{name:tx('doctrine.blk.res')}));
  function run(write){var p=params();if(write&&JSON.stringify(p)!==last)return;p.write=write;LS.set('doctrine.persona',ps.value);
   res.textContent='';res.appendChild(hint(tx('doctrine.loading')));
   api(BASE+'gen',p,{what:tx(write?'doctrine.job.write':'doctrine.job.gen')}).then(function(r){res.textContent='';
    res.appendChild(hint(tx('doctrine.gen.from',{f:r.base.file,k:kindT(r.profile)})));
    if(!r.changes.length)res.appendChild(h('div',{class:'ok',text:tx('doctrine.gen.none')}));
    else res.appendChild(h('table',{},[h('tr',{},[h('th',{text:tx('doctrine.col.key')}),h('th',{text:tx('doctrine.col.was')}),h('th',{text:tx('doctrine.col.now')}),h('th',{text:tx('doctrine.col.driver')}),h('th',{text:tx('doctrine.col.why')})])].concat(
     r.changes.map(function(c){return h('tr',{class:'changed'},[h('td',{text:c.key}),h('td',{text:String(c.was)}),h('td',{text:String(c.now)+' [T]'}),h('td',{text:tx('doctrine.t.'+c.driver)+' '+c.value}),h('td',{text:whyT(c.key,c.why)})])}))));
    r.skipped.forEach(function(s){res.appendChild(hint(tx('doctrine.gen.skipped',{k:s.key,w:tOr('doctrine.skip.'+s.w,null,s.why)})))});
    if(r.profile==='vanilla')res.appendChild(h('div',{class:'err',text:tx('doctrine.gen.vanilla')}));
    if(r.traits.length){res.appendChild(h('b',{text:tx('doctrine.gen.traits')}));res.appendChild(li(r.traits.map(function(t){return t['do']+(t.departs?' ('+tx('doctrine.p.departs')+')':'')})))}
    res.appendChild(h('div',{class:'err',text:tx('doctrine.intro.guess')}));
    if(write){last=null;bWrite.disabled=true;
     if(r.wrote){res.appendChild(h('div',{class:'ok',text:tx('doctrine.gen.wrote',{f:r.wrote})}));res.appendChild(hint(tx('doctrine.gen.next')));
      res.appendChild(h('div',{class:'row'},[h('button',{type:'button',class:'primary',text:tx('doctrine.gen.toCheck'),onclick:function(){go('check')}})]));toast(tx('doctrine.gen.saved'))}
     else res.appendChild(hint(tx('doctrine.gen.nothing')))}
    else{res.appendChild(hint(tx('doctrine.gen.previewOnly')));if(r.changes.length){last=JSON.stringify(params());bWrite.disabled=false}}
   }).catch(function(e){res.textContent='';res.appendChild(errOf(e));stale()})}}

 // ---- Check
 function checkTab(){
  if(!S.mod){panel.appendChild(blk('check.need',[errBox(tx('doctrine.needmod'))]));return}
  var pr=sel(tx('doctrine.prof.pick'),profOpts(true),'auto'),res=h('div');
  panel.appendChild(blk('check.mod',[modLine()]));
  panel.appendChild(blk('check.lead',[hint(tx('doctrine.check.lead'))]));
  panel.appendChild(fld('check.pick',tx('doctrine.prof.pick'),pr,{after:h('button',{type:'button',class:'primary',text:tx('doctrine.check.run'),onclick:run})}));
  panel.appendChild(blk('check.res',[res],{name:tx('doctrine.blk.res')}));
  function run(){res.textContent='';res.appendChild(hint(tx('doctrine.loading')));
   api(BASE+'check',{mod:S.mod,profile:pr.value},{what:tx('doctrine.job.check')}).then(function(r){res.textContent='';
    res.appendChild(hint(tx('doctrine.check.file',{f:r.file,k:kindT(r.profile)})));
    if(r.stamp)res.appendChild(hint(tx('doctrine.stamp',{p:r.stamp.persona,s:r.stamp.scale})));
    res.appendChild(h('div',{class:r.errors?'err':'ok',text:r.errors?tx('doctrine.check.errors',{n:r.errors}):tx('doctrine.check.clean')}));
    if(r.problems.length)res.appendChild(h('ul',{},r.problems.map(function(p){return h('li',{class:p.level==='error'?'err':(p.level==='warn'?'changed':'hint'),text:tx('doctrine.lvl.'+p.level)+' '+tOr('doctrine.pr.'+p.t,p.a,p.msg)})})))
   }).catch(function(e){res.textContent='';res.appendChild(errOf(e))})}
  run()}

 // lazy: the data is asked for at the first show (show0 calls refresh), not with the page
 var asked=false;
 return {refresh:function(){if(!asked){asked=true;load()}else go(cur)},focus:function(){}};
};
`;

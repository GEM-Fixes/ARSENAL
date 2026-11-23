// Browser side of the Maps page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent.
// Game parity: api() sends the page's game; the page reads curGame() for the mode lists (AS2 or GoH), the editor steps (GoH: launcher
// page, GHED-10) and the test hint (no Play page under GoH), and drops its list when the game changes (focus or refresh).
// JOBS (gui README): the list scan is the server's background job (the footer lists and stops it); the re-asks of the list are polls
// ({job:false}); a list that was stopped shows a plain line and Reload, not an error. Copy, place and check name their request (what)
// and show a stopped request (e.cancelled) as a plain stopped state: for a copy the page asks clone/status what was left in the mod.
// Author: Imperator_Aug (ARSENAL, ia-66fbf006)
module.exports = String.raw`
EXT_SCREENS.maps=function(root){
 var AS2MODES=['keep','combat','battle_zones','captureflag'],GOHMODES=['keep','frontlines','battle_zones','campaign_capture_the_flag','ammunition','evacuation','cooperative'];
 function game(){var g=typeof curGame==='function'?curGame():null;return g&&g.id?g:{id:'as64',kind:'as2',target:'as64'}}
 function goh(){return game().kind==='goh'}
 var MODES=goh()?GOHMODES:AS2MODES;
 var maps=[],sel=null,pollT=null;
 // the re-ask of the list while the scan runs waits while this page or the window is hidden (pollLater, page.js): one re-ask when it is seen again
 function pollIn(f,ms){return typeof pollLater==='function'?pollLater('maps',f,ms):setTimeout(f,ms)}
 function pollOff(t){if(typeof pollStop==='function')pollStop(t);else clearTimeout(t)}
 function el(t,a,k){return h(t,a,k)}
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function sentence(it){return tx(it.k,it.p||{})}
 function known(k){return tx(k)!==k}
 function codeText(f){var k='maps.c.'+f.code;return known(k)?tx(k):tx('maps.c.other')}
 function rawFold(f){return known('maps.c.'+f.code)||!f.msg?null:el('details',{},[el('summary',{text:tx('maps.details')}),el('pre',{style:'white-space:pre-wrap',text:f.code+': '+f.msg})])}
 // server refusals come as a key (maps.e.*) so they are shown in the page language (GT-34)
 function errText(e){var m=String(e&&e.message||e);return /^maps\.e\.[a-z]+$/.test(m)&&known(m)?tx(m):m}
 function loc(){return tx('maps.locale')}
 // the job list's name of a request of this page: "<page>: <button>", as the shell names a clicked button
 function jobWhat(k){return tx('job.name',{p:tx('maps.nav'),b:tx(k)})}
 function stoppedEl(text){return el('div',{class:'hint',role:'status','data-stopped':'1',text:text})}
 // players: plural form of the page language (uk 2 гравці, 5 гравців: GT-34)
 function players(n){var c='other';try{c=new Intl.PluralRules(loc()).select(n)}catch(e){}var k='maps.playersN.'+c;return known(k)?tx(k,{n:n}):tx('maps.playersN.other',{n:n})}

 // ---------- searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list) ----------
 // hits: the items whose precomputed lower-case text (lo) holds q, the ones that start with it first, at most 40 (the rest counted)
 function hits(a,q,done){q=String(q||'').trim().toLowerCase();var f=[],l=[],n=0;
  for(var i=0;i<a.length;i++){var p=a[i].lo.indexOf(q);if(p<0)continue;n++;if(p===0){if(f.length<40)f.push(a[i])}else if(l.length<40)l.push(a[i])}
  var o=f.concat(l).slice(0,40);done(o,n-o.length)}
 // once(load): one list per signature, asked once and kept; callers that come while it loads wait for it
 function once(load){var c={sig:null,a:null,w:[]};return function(sig,cb){if(c.sig===sig&&c.a){cb(c.a);return}c.w.push(cb);if(c.sig===sig)return;c.sig=sig;c.a=null;
  load(function(a){if(c.sig!==sig)return;c.a=a||[];var w=c.w;c.w=[];w.forEach(function(f){f(c.a)})},function(){if(c.sig!==sig)return;c.sig=null;var w=c.w;c.w=[];w.forEach(function(f){f([])})})}}
 // the maps of the list (made once per list load): in-game name, folder and key; Browse groups them by where they come from
 var MI=null;function mapItems(){if(MI&&MI.m===maps)return MI.a;var a=maps.map(function(m){var src=m.mod||tx('maps.vanilla');
   return {group:src,label:m.name,value:m.key,hint:m.folder+(m.players?'  '+players(m.players):''),map:m,lo:m._lo||(m.name+' '+m.key).toLowerCase()}});
  a.sort(function(x,y){return x.group<y.group?-1:x.group>y.group?1:x.label<y.label?-1:x.label>y.label?1:0});MI={m:maps,a:a};return a}
 // Browse of the map boxes (filter, place map): the picker in the game's data at map/ (folders); a picked folder gives the key of the
 // listed map it is in (or under), else its own path from map/ on (a map not listed yet)
 function mapByKey(k){k=String(k||'').toLowerCase();var m=null;maps.forEach(function(x){if(!m&&String(x.key).toLowerCase()===k)m=x});return m}
 function mapKeyOf(p){p=String(p||'').split(String.fromCharCode(92)).join('/').replace(/^resource\//i,'').replace(/\/+$/,'');var lo=p.toLowerCase(),best='';
  maps.forEach(function(x){var k=String(x.key).toLowerCase();if((lo===k||lo.indexOf(k+'/')===0)&&k.length>best.length)best=x.key});
  return best||(/^map\/[^\/]/i.test(p)?p:'')}
 var MAPBROWSE={mode:'dir',view:'data',start:'map',toValue:function(p){return mapKeyOf(p)}};
 // the header's mod (S.mod): the page has no mod box of its own (owner 2026-11-19); a mod changed in the header needs a new preview
 function curMod(){return String(S.mod||'').trim()}
 // the entity names the place card takes (GET /api/x/maps/entities: .def names of game + mod), by their folder under resource/entity
 var ENTIX=once(function(ok,no){api('/api/x/maps/entities?mod='+encodeURIComponent(S.mod||'')).then(function(j){ok((j.entities||[]).map(function(e){return {group:e.group||'-',label:e.name,value:e.name,hint:e.group,lo:String(e.name).toLowerCase()}}))}).catch(no)});

 // ---------- map list ----------
 var listState=el('div',{class:'hint'}),filt=el('input',{type:'text',placeholder:tx('maps.filter'),'aria-label':tx('maps.filter'),autocomplete:'off'});
 var minPl=el('select',{'aria-label':tx('maps.players')},[el('option',{value:'0',text:tx('maps.anyPlayers')})].concat([2,4,6,8,10].map(function(n){return el('option',{value:String(n),text:players(n)})})));
 var modeF=el('select',{'aria-label':tx('maps.modeFilter')},[el('option',{value:'',text:tx('maps.anyMode')})].concat(MODES.slice(1).map(function(m){return el('option',{value:m,text:m})})));
 function modeTip(m){var k=['maps','mode',m].join('.');return known(k)?tx(k):tx('maps.mode.goh',{mode:m})}
 var tb=el('tbody'),refreshBtn=el('button',{type:'button',text:tx('maps.reload'),onclick:function(){loadList(true)}});
 var tbl=el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx('maps.col.name')}),el('th',{class:'nw',text:tx('maps.col.players')}),el('th',{text:tx('maps.col.modes')}),el('th',{text:tx('maps.col.from')})])]),tb]);
 var box=el('div',{class:'scroll'},[tbl]);
 function modeBadges(ms){var s=el('span');ms.forEach(function(m,i){if(i)s.appendChild(document.createTextNode(' '));s.appendChild(el('span',{class:'badge',text:m,title:modeTip(m)}))});return s}
 // GT-32: redraw only when the filter really changed. The text box listens to input only: its change event fires on blur, that is on
 // the mousedown of the row the user clicks, and the redraw removed that row before the click landed.
 var drawn=null,rows=[];
 function filterSig(){return [filt.value.trim().toLowerCase(),minPl.value,modeF.value,maps.length].join('|')}
 // fast typing: the table is drawn in the next frame (one draw for many keys), at most LIM rows (Show more adds 200), every map's
 // lower-case text made once per list load (m._lo)
 var LIM0=100,lim=LIM0,dwant=false,moreBtn=el('button',{type:'button',hidden:true,onclick:function(){lim+=200;drawList(true)}});
 function frame(f){if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)}
 function drawIfChanged(){if(filterSig()===drawn||dwant)return;dwant=true;frame(function(){dwant=false;if(filterSig()!==drawn)drawList()})}
 function markSel(){rows.forEach(function(r){r.tr.setAttribute('aria-selected',sel&&sel.key===r.m.key?'true':'false')})}
 function drawList(keep){
  if(keep!==true&&filterSig()!==drawn)lim=LIM0;drawn=filterSig();rows=[];clear(tb);var q=filt.value.trim().toLowerCase(),mp=+minPl.value,mf=modeF.value,n=0;
  maps.forEach(function(m){
   if(m._lo==null)m._lo=(m.name+' '+m.key).toLowerCase();
   if(q&&m._lo.indexOf(q)<0)return;
   if(mp&&m.players!==mp)return;
   if(mf&&m.modes.indexOf(mf)<0)return;
   if(n++>=lim)return;
   var tr=el('tr',{tabindex:'0','aria-selected':sel&&sel.key===m.key?'true':'false',onclick:function(){choose(m)},onkeydown:function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(m)}}},[
    el('td',{},[el('b',{text:m.name}),el('div',{class:'hint',text:m.folder})]),el('td',{class:'nw',text:m.players?String(m.players):'?'}),el('td',{},[modeBadges(m.modes)]),el('td',{class:'hint'},[document.createTextNode(m.mod||tx('maps.vanilla'))].concat(m.copy===false?[document.createTextNode(' '),el('span',{class:'badge badx',text:tx('maps.nocopyBadge'),title:tx('maps.s.nocopy')})]:[]))]);
   rows.push({tr:tr,m:m});tb.appendChild(tr)});
  listState.textContent=tx('maps.shown',{n:Math.min(n,lim),total:maps.length})+(n>lim?' '+tx('maps.more'):'');
  moreBtn.hidden=!(n>lim);moreBtn.textContent=tx('maps.showMore',{n:Math.min(200,n-lim),left:n-lim})}
 filt.addEventListener('input',drawIfChanged);
 // searchKit: history 'maps.filter', index = the maps of the list by name, folder and key, Browse = the map folders in the game's data;
 // a pick filters to that map and opens it
 var filtKit=searchKit(filt,{key:'maps.filter',index:function(q,done){hits(mapItems(),q,done)},browse:MAPBROWSE,
  onPick:function(v,it){filt.value=v;drawIfChanged();var m=it&&it.map||mapByKey(v);if(m)choose(m)}});[minPl,modeF].forEach(function(i){i.addEventListener('change',drawIfChanged)});
 function loadList(refresh,again){
  pollOff(pollT);listState.className='hint';if(!again)listState.textContent=tx('maps.loading');
  var asked=shownGame;
  // again = a re-ask while the scan runs: a poll, never a job of its own (the scan is the server's background job in the footer)
  api('/api/x/maps/list'+(refresh?'?refresh=1':''),undefined,again?{job:false}:{what:tx('job.w.mapslist')}).then(function(j){
   if(asked!==shownGame)return;
   if(j.state==='running'){listState.textContent=tx('maps.progress',{s:j.elapsed});pollT=pollIn(function(){loadList(false,true)},1500);return}
   if(j.stopped){wantNow();listState.textContent='';listState.appendChild(stoppedEl(tx('maps.list.stopped',{b:tx('maps.reload')})));return}
   if(j.state==='error'){wantNow();listState.className='err';listState.textContent=tx('maps.listfail',{m:errText({message:j.error})});if(j.detail)listState.appendChild(el('details',{},[el('summary',{text:tx('maps.details')}),el('pre',{text:j.detail})]));return}
   maps=j.maps||[];drawList();if(j.cached&&j.at)listState.textContent+=' '+tx('maps.cached',{t:new Date(j.at).toLocaleString(loc())});wantNow()
  }).catch(function(e){if(e&&e.cancelled){listState.textContent='';listState.appendChild(stoppedEl(tx('maps.list.stopped',{b:tx('maps.reload')})));wantNow();return}listState.className='err';listState.textContent=errText(e);wantNow()})}

 // ---------- chosen map: picture ----------
 // the leaf block 'pic' keeps its bar; choose() refills the plain div inside it
 var picBox=el('div',{},[el('div',{class:'hint',text:tx('maps.pickone')})]);
 function choose(m){
  sel=m;S.mapKey=m.key;markSel();clear(picBox);writeBtn.disabled=true;out.textContent='';
  var img=el('div',{class:'hint',text:tx('maps.picLoading')});
  picBox.appendChild(el('h3',{text:m.name}));
  picBox.appendChild(el('div',{class:'hint',text:tx('maps.detail',{players:m.players||'?',modes:m.modes.join(', '),key:m.key})}));
  if(m.mod)picBox.appendChild(el('div',{class:'hint',text:tx('maps.fromMod',{mod:m.mod})}));
  picBox.appendChild(img);
  if(S.sec&&S.sec.mapviz){var vm=viewerMod(m);picBox.appendChild(el('div',{class:'row'},[el('button',{type:'button',text:tx('maps.toViewer'),title:vm?tx('maps.toViewerMod',{mod:vm}):tx('maps.toViewerT'),disabled:!!vm,onclick:function(){toViewer(m)}})]))}
  nameIn.value=nameIn.dataset.manual==='1'?nameIn.value:suggestName(m);
  titleIn.value=titleIn.dataset.manual==='1'?titleIn.value:m.name+' (copy)';
  srcOut.className=m.copy===false?'err':'hint';srcOut.textContent=m.copy===false?tx('maps.s.nocopy'):tx('maps.copyOf',{name:m.name});prevBtn.disabled=m.copy===false;
  api('/api/x/maps/picture?map='+encodeURIComponent(m.key)+(m.mods&&m.mods.length?'&from='+encodeURIComponent(m.mods.join(',')):'')).then(function(j){
   if(sel!==m)return;clear(img);
   if(!j.svg){img.textContent=tx('maps.noPic');return}
   var im=el('img',{alt:tx('maps.picAlt',{name:m.name}),style:'max-width:100%;height:auto;border:1px solid var(--line);background:var(--card)'});
   im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(j.svg);
   img.appendChild(im);img.appendChild(el('div',{class:'hint',text:tx('maps.picHint')}))
  }).catch(function(){if(sel===m)img.textContent=tx('maps.noPic')})}
 // Open in Map Viewer: the same map on the Map Viewer page as the user's pick (the read job starts for a map not read yet).
 // The shell opens S.mapKey (choose() set it) on its refresh as no pick, and does not redo a read it already asks for: so
 // with the screen's pick(key), S.mapKey is blanked, the pick goes while the Map Viewer is hidden, show() refreshes it,
 // a second pick catches a refresh that closed the map, then S.mapKey = the map again. A key without map/ is refused.
 // The Map Viewer reads the game and the current mod only: a map that lives only in another mod (m.mod) is not there,
 // so the button is off for it and its title says which mod to open first (viewerMod)
 function modName(s){return String(s||'').replace(/[\\\/]+$/,'').split(/[\\\/]/).pop().toLowerCase()}
 function viewerMod(m){var ms=(m.mods&&m.mods.length?m.mods:(m.mod?[m.mod]:[])).map(function(x){return String(x)});if(!ms.length)return '';
  var cur=modName(S.mod);return ms.some(function(x){return modName(x)===cur&&!!cur})?'':ms.join(', ')}
 function toViewer(m){var k=String(m&&m.key||'');if(!/^map\/[^\/]/.test(k)){toast(tx('maps.toViewerBad',{key:k}));return}
  var vm=viewerMod(m);if(vm){toast(tx('maps.toViewerMod',{mod:vm}));return}
  var sc=S.screens&&S.screens.mapviz;
  if(sc&&typeof sc.pick==='function'){S.mapKey='';try{sc.pick(k.slice(4))}catch(e){}show('mapviz');
   try{if(!sc.V||typeof sc.V.q!=='function'||sc.V.q('map')!==k.slice(4))sc.pick(k.slice(4))}catch(e){}S.mapKey=k}
  else{S.mapKey=k;show('mapviz')}}
 function suggestName(m){return ('my_'+m.folder.replace(/^\d+v\d+_/,'')).toLowerCase().replace(/[^a-z0-9_]/g,'_')}

 // ---------- clone card ----------
 var nameIn=el('input',{type:'text',autocomplete:'off','aria-label':tx('maps.newName'),maxlength:'40'}),titleIn=el('input',{type:'text',autocomplete:'off','aria-label':tx('maps.lobbyTitle')});
 nameIn.addEventListener('input',function(){nameIn.dataset.manual='1'});titleIn.addEventListener('input',function(){titleIn.dataset.manual='1'});
 var srcOut=el('div',{class:'hint',text:tx('maps.noSource')});
 var modeSel=el('select',{'aria-label':tx('maps.modeLabel')},MODES.map(function(m){return el('option',{value:m,text:m==='keep'?tx('maps.mode.keepName'):m})}));
 var modeHelp=el('div',{class:'hint'});
 function drawModeHelp(){modeHelp.textContent=modeTip(modeSel.value)}
 modeSel.addEventListener('change',drawModeHelp);drawModeHelp();
 var botsCb=el('input',{type:'checkbox',id:'maps_bots'});
 var out=el('div'),prevBtn=el('button',{type:'button',class:'primary',text:tx('maps.preview'),onclick:function(){runClone(false)}}),writeBtn=el('button',{type:'button',text:tx('maps.write'),disabled:true,onclick:function(){runClone(true)}});
 var shownMod=curMod();function syncMod(){if(curMod()===shownMod)return;shownMod=curMod();writeBtn.disabled=true;pWrite.disabled=true}
 [nameIn,titleIn].forEach(function(i){i.addEventListener('input',function(){writeBtn.disabled=true})});[modeSel,botsCb].forEach(function(i){i.addEventListener('change',function(){writeBtn.disabled=true})});
 function sayList(items){var ul=el('ul',{style:'margin:4px 0 4px 18px;padding:0'});items.forEach(function(it){ul.appendChild(el('li',{text:sentence(it)}))});return ul}
 function findingList(fs){
  var ul=el('ul',{style:'margin:4px 0 4px 18px;padding:0'});
  (fs||[]).forEach(function(f){if(f.sev==='info'&&f.code!=='MAPCLONE_LOC_KEY')return;
   var li=el('li',{class:f.sev==='error'?'err':''});li.appendChild(document.createTextNode(codeText(f)));var rf=rawFold(f);if(rf)li.appendChild(rf);
   ul.appendChild(li)});
  return ul.firstChild?ul:null}
 function suggestBox(list,target){
  var d=el('div',{class:'row'},[el('span',{text:tx('maps.didyou')})]);
  list.forEach(function(k){var m=null;maps.forEach(function(x){if(x.key===k)m=x});
   d.appendChild(el('button',{type:'button',text:m?m.name+' ('+k.split('/').pop()+')':k,onclick:function(){if(m)choose(m);else toast(k)}}))});
  target.appendChild(d)}
 function checkView(c,target){
  var h3=el('h3',{text:tx('maps.check.h')});target.appendChild(h3);
  if(c&&c.na){target.appendChild(el('div',{class:'hint',text:tx('maps.s.na',{why:c.na})}));return}
  if(!c||!c.ran){target.appendChild(el('div',{class:'err',text:tx('maps.check.noRun')}));return}
  if(!c.count){target.appendChild(el('div',{class:'ok',text:tx('maps.check.clean')}));return}
  target.appendChild(el('div',{text:tx('maps.check.some',{n:c.count})}));
  var ul=el('ul',{style:'margin:4px 0 4px 18px;padding:0'});
  c.findings.forEach(function(f){if(f.sev==='info')return;ul.appendChild(el('li',{},[el('span',{class:'badge '+(f.sev==='error'?'badx':'info'),text:f.sev==='error'?tx('maps.check.err'):tx('maps.check.warn')}),document.createTextNode(codeText(f)+(f.where?' ('+f.where+')':'')),rawFold(f)]))});
  target.appendChild(ul)}
 function needsTest(target){
  if(goh()){target.appendChild(el('div',{class:'wzstat'},[el('b',{text:tx('maps.test.h')+' '}),document.createTextNode(tx('maps.test.goh'))]));return}
  target.appendChild(el('div',{class:'wzstat'},[el('b',{text:tx('maps.test.h')+' '}),document.createTextNode(tx('maps.test.body')+' '),el('button',{type:'button',text:tx('maps.test.go'),onclick:function(){show('play')}})]))}
 function ask(o){if(typeof askDo==='function')return askDo(o);var y=true;try{if(typeof window!=='undefined'&&window.confirm)y=!!window.confirm([o.title].concat(o.lines||[]).filter(Boolean).join(' '))}catch(e){}return {then:function(cb){cb(y)}}}
 function runClone(write,asked){
  syncMod();var body={mod:curMod(),map:sel&&sel.key,from:sel&&sel.mods||[],name:nameIn.value.trim(),title:titleIn.value.trim(),mode:modeSel.value,bots:botsCb.checked,write:write,target:game().target||'as64'};
  if(!sel){out.textContent='';out.appendChild(el('div',{class:'err',text:tx('maps.needMap')}));return}
  if(write&&!asked){ask({title:tx('maps.write'),lines:[tx('maps.confirm',{name:body.name,mod:body.mod})],where:body.mod}).then(function(yes){if(yes)runClone(write,true)});return}
  out.textContent='';out.appendChild(el('div',{class:'hint',text:tx(write?'maps.writing':'maps.planning')}));prevBtn.disabled=writeBtn.disabled=true;
  api('/api/x/maps/clone',body,{what:jobWhat(write?'maps.write':'maps.preview')}).then(function(j){
   out.textContent='';
   out.appendChild(el('div',{class:j.ok?'ok':'err',text:tx(j.ok?(write?'maps.done':'maps.planOk'):'maps.failed')}));
   if(j.say&&j.say.length)out.appendChild(sayList(j.say));
   var fl=findingList(j.findings);if(fl)out.appendChild(fl);
   if(j.suggest)suggestBox(j.suggest,out);
   if(j.bots){j.bots.forEach(function(b){out.appendChild(el('div',{class:'hint',text:tx(['maps','bots',b.state].join('.'),{mode:b.mode})}))});out.appendChild(el('div',{class:'hint',text:tx('maps.bots.warn')}))}
   if(j.ok&&!write){writeBtn.disabled=false;out.appendChild(el('div',{class:'hint',text:tx('maps.planNote',{mod:body.mod})}))}
   if(j.ok&&write){placeMap.value=j.newKey;out.appendChild(el('div',{class:'hint',text:tx('maps.next',{key:j.newKey})}));if(j.check)checkView(j.check,out);if(j.needsTest)needsTest(out)}
  }).catch(function(e){out.textContent='';if(e&&e.cancelled)return cloneStopped(body,write);out.appendChild(el('div',{class:'err',text:errText(e)}))}).then(function(){prevBtn.disabled=!!(sel&&sel.copy===false);if(write||!out.querySelector('.ok'))writeBtn.disabled=true})}
 // a copy stopped from the job list: plain, never red. A preview wrote nothing; for a write the server says what the stop left
 // (clone/status: nothing, removed, left + the paths, complete)
 function cloneStopped(body,write){
  if(!write){out.appendChild(stoppedEl(tx('maps.stop.preview')));return}
  var line=stoppedEl(tx('maps.stop.asking'));out.appendChild(line);
  return api('/api/x/maps/clone/status?mod='+encodeURIComponent(body.mod)).then(function(s){
   var st=s&&s.state,k=st==='removed'?'maps.stop.removed':st==='complete'?'maps.stop.complete':st==='left'?'maps.stop.left':st==='nothing'?'maps.stop.nothing':'maps.stop.unknown';
   line.textContent=tx(k,{key:(s&&s.newKey)||body.name,list:((s&&s.left)||[]).join(', '),mod:body.mod,b:tx('maps.check.run')});
   if(st==='complete'){placeMap.value=s.newKey}
  }).catch(function(){line.textContent=tx('maps.stop.unknown',{key:body.name,mod:body.mod})})}
 // blocks: cards are containers, every part a leaf; result areas are refilled inside their leaf
 var cloneCard=card('clone',[blk('clone.title',[el('h3',{text:tx('maps.clone.h')})]),blk('clone.intro',[el('div',{class:'hint',text:tx('maps.clone.intro')})]),blk('clone.src',[srcOut],{name:tx('maps.b.src')}),
  fld('clone.name',tx('maps.newName'),nameIn),blk('clone.namehint',[el('div',{class:'hint',text:tx('maps.nameHint')})]),
  fld('clone.lobby',tx('maps.lobbyTitle'),titleIn),blk('clone.lobbyhint',[el('div',{class:'hint',text:tx('maps.titleHint')})]),
  fld('clone.mode',tx('maps.modeLabel'),modeSel),blk('clone.modehelp',[modeHelp],{name:tx('maps.b.modehelp')}),
  blk('clone.bots',[el('label',{class:'row'},[botsCb,el('span',{text:tx('maps.bots.label')})]),el('div',{class:'hint',text:tx('maps.bots.help')})],{name:tx('maps.b.bots')}),
  h('div',{class:'row',blk:'clone.btns','data-blkname':tx('maps.b.btns')},[prevBtn,writeBtn]),blk('clone.out',[out],{name:tx('maps.b.out')})],{name:tx('maps.clone.h')});

 // ---------- place card ----------
 var placeMap=el('input',{type:'text',autocomplete:'off','aria-label':tx('maps.place.map')}),entIn=el('input',{type:'text',autocomplete:'off','aria-label':tx('maps.place.entity')});
 var xIn=el('input',{type:'text',autocomplete:'off',value:'0','aria-label':'x'}),yIn=el('input',{type:'text',autocomplete:'off',value:'0','aria-label':'y'}),zIn=el('input',{type:'text',autocomplete:'off','aria-label':'z',placeholder:tx('maps.place.auto')}),dirIn=el('input',{type:'text',autocomplete:'off','aria-label':tx('maps.place.dir'),placeholder:'0'});
 // searchKit: history 'maps.place.map' (index = the maps of the list, Browse = the map folders in the game's data, a pick gives the map
 // key) and 'maps.place.entity' (index = the entity names of game + mod, asked once per game + mod; Browse = the .def files under
 // entity/ in the game's data, a pick gives the name without .def)
 var placeKit=searchKit(placeMap,{key:'maps.place.map',index:function(q,done){hits(mapItems(),q,done)},browse:MAPBROWSE});
 function entSig(){return game().id+'|'+(S.mod||'')}
 var entKit=searchKit(entIn,{key:'maps.place.entity',index:function(q,done){ENTIX(entSig(),function(a){hits(a,q,done)})},
  browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p,e){return String(e&&e.name||p).split('/').pop().replace(/\.def$/i,'')}}});
 [placeMap,entIn].forEach(function(i){i.addEventListener('input',function(){pWrite.disabled=true})});
 var pout=el('div'),pPrev=el('button',{type:'button',class:'primary',text:tx('maps.preview'),onclick:function(){runPlace(false)}}),pWrite=el('button',{type:'button',text:tx('maps.place.write'),disabled:true,onclick:function(){runPlace(true)}});
 var conv=el('div',{class:'hint'});
 function drawConv(){var x=parseFloat(String(xIn.value).replace(',','.')),y=parseFloat(String(yIn.value).replace(',','.'));conv.textContent=isFinite(x)&&isFinite(y)?tx('maps.place.conv',{x:x,y:y,ux:Math.round(x*20),uy:Math.round(y*20)}):''}
 [xIn,yIn].forEach(function(i){i.addEventListener('input',function(){drawConv();pWrite.disabled=true})});drawConv();
 function runPlace(write,asked){
  syncMod();var body={mod:curMod(),map:placeMap.value.trim(),entity:entIn.value.trim(),x:xIn.value,y:yIn.value,z:zIn.value.trim(),dir:dirIn.value.trim(),write:write};
  if(write&&!asked){ask({title:tx('maps.place.write'),lines:[tx('maps.place.confirm',{entity:body.entity,map:body.map})],where:body.mod}).then(function(yes){if(yes)runPlace(write,true)});return}
  pout.textContent='';pPrev.disabled=pWrite.disabled=true;pout.appendChild(el('div',{class:'hint',text:tx('maps.planning')}));
  api('/api/x/maps/place',body,{what:jobWhat(write?'maps.place.write':'maps.preview')}).then(function(j){
   pout.textContent='';pout.appendChild(el('div',{class:j.ok?'ok':'err',text:tx(j.ok?(write?'maps.place.done':'maps.planOk'):'maps.failed')}));
   if(j.say&&j.say.length)pout.appendChild(sayList(j.say));var fl=findingList(j.findings);if(fl)pout.appendChild(fl);
   if(j.ok&&!write)pWrite.disabled=false;
   if(j.ok&&write){if(j.check)checkView(j.check,pout);if(j.needsTest)needsTest(pout)}
  }).catch(function(e){pout.textContent='';pout.appendChild(e&&e.cancelled?stoppedEl(tx(write?'maps.stop.place':'maps.stop.preview')):el('div',{class:'err',text:errText(e)}))}).then(function(){pPrev.disabled=false})}
 var placeCard=card('place',[blk('place.title',[el('h3',{text:tx('maps.place.h')})]),blk('place.intro',[el('div',{class:'hint',text:tx('maps.place.intro')})]),
  fld('place.map',tx('maps.place.map'),placeKit.el),fld('place.entity',tx('maps.place.entity'),entKit.el),blk('place.entityhint',[el('div',{class:'hint',text:tx('maps.place.entityHint')})]),
  h('div',{class:'row',blk:'place.pos',box:'row','data-blkname':tx('maps.b.pos')},[fld('place.pos.x',tx('maps.place.x'),xIn),fld('place.pos.y',tx('maps.place.y'),yIn),fld('place.pos.z',tx('maps.place.z'),zIn),fld('place.pos.dir',tx('maps.place.dir'),dirIn)]),
  blk('place.conv',[conv],{name:tx('maps.b.conv')}),
  blk('place.units',[el('div',{class:'hint',text:tx('maps.place.units')})]),h('div',{class:'row',blk:'place.btns','data-blkname':tx('maps.b.btns')},[pPrev,pWrite]),blk('place.out',[pout],{name:tx('maps.b.out')})],{name:tx('maps.place.h')});

 // ---------- own editor card ----------
 // GoH: the editor starts from the launcher's editor page (GHED-10), the mod is put in place by hand (ARSENAL does not write into the GoH
 // folder) and there is no test run from here: steps 1, 2 and the note have a GoH text
 var stepsOl=el('ol',{style:'margin:4px 0 4px 20px;padding:0'}),edNote=el('div',{class:'hint'});
 function drawSteps(){var g=goh();clear(stepsOl);['s1','s2','s3','s4','s5'].forEach(function(s){stepsOl.appendChild(el('li',{text:tx(g&&known('maps.ed.goh.'+s)?'maps.ed.goh.'+s:'maps.ed.'+s)}))});edNote.textContent=tx(g?'maps.ed.goh.note':'maps.ed.note')}
 drawSteps();
 var edCard=card('editor',[blk('editor.title',[el('h3',{text:tx('maps.ed.h')})]),blk('editor.intro',[el('div',{class:'hint',text:tx('maps.ed.intro')})]),blk('editor.steps',[stepsOl]),blk('editor.note',[edNote]),
  blk('editor.missions',[el('div',{class:'hint',text:tx('maps.ed.missions')+' '}),el('button',{type:'button',text:tx('maps.toMissions'),onclick:function(){show('missions')}})],{name:tx('maps.b.missions')})],{name:tx('maps.ed.h')});

 // ---------- check-only card ----------
 var cOut=el('div'),cBtn=el('button',{type:'button',text:tx('maps.check.run'),onclick:function(){
  syncMod();cOut.textContent='';cOut.appendChild(el('div',{class:'hint',text:tx('maps.check.running')}));cBtn.disabled=true;
  api('/api/x/maps/check',{mod:curMod()},{what:jobWhat('maps.check.run')}).then(function(j){cOut.textContent='';checkView(j.check,cOut)}).catch(function(e){cOut.textContent='';cOut.appendChild(e&&e.cancelled?stoppedEl(tx('maps.stop.check')):el('div',{class:'err',text:errText(e)}))}).then(function(){cBtn.disabled=false})}});
 var checkCard=card('check',[blk('check.title',[el('h3',{text:tx('maps.check.h2')})]),blk('check.intro',[el('div',{class:'hint',text:tx('maps.check.intro')})]),h('div',{class:'row',blk:'check.btns'},[cBtn]),blk('check.out',[cOut],{name:tx('maps.b.out')})],{name:tx('maps.check.h2')});

 root.appendChild(blk('title',[el('h2',{text:tx('maps.title')})]));
 root.appendChild(blk('about',[el('div',{text:tx('maps.intro')}),el('div',{class:'hint',text:tx('maps.safe')})],{'class':'card'}));
 var listCard=card('list',[blk('list.title',[el('h3',{text:tx('maps.list.h')})]),h('div',{class:'row',blk:'list.filter','data-blkname':tx('maps.b.filter')},[filtKit.el,minPl,modeF,refreshBtn]),
  blk('list.state',[listState],{name:tx('maps.b.state')}),blk('list.table',[box],{name:tx('maps.b.table')}),blk('list.more',[moreBtn],{name:tx('maps.showMoreB')})],{name:tx('maps.list.h')});
 root.appendChild(h('div',{blk:'main',box:'cols','data-blkname':tx('maps.b.main')},[h('div',{blk:'left',box:'col','data-blkname':tx('maps.b.left')},[listCard,placeCard,checkCard]),
  h('div',{blk:'right',box:'col','data-blkname':tx('maps.b.right')},[blk('pic',[picBox],{'class':'card',name:tx('maps.b.pic')}),cloneCard,edCard])]));
 var loaded=false;
 // pick(key, extra) from the Editor's file viewers (ext view, kind map): select the map with that key (map/multi/<folder>) once the
 // list is here (a map not in the list, a single player one, is shown from its key alone) and add extra = {title, lines} (already in
 // the page language) under its picture: what the opened file holds
 var WANT=null;
 function wantNow(){if(!WANT)return;var w=WANT,m=null;WANT=null;maps.forEach(function(x){if(!m&&String(x.key).toLowerCase()===w.key)m=x});
  if(!m){var fo=w.key.split('/').pop();m={key:w.key,name:fo,folder:fo,modes:[],players:0,mod:'',mods:[],copy:true}}
  choose(m);rows.forEach(function(r){if(r.m===m&&r.tr.scrollIntoView)r.tr.scrollIntoView({block:'nearest'})});
  var x=w.extra;if(x&&(x.title||(x.lines||[]).length)){var bx=el('div',{class:'card',style:'margin-top:6px'});if(x.title)bx.appendChild(el('b',{text:x.title}));
   (x.lines||[]).forEach(function(t){bx.appendChild(el('div',{class:'hint',text:String(t)}))});picBox.appendChild(bx)}}
 // the map picked on the Missions page (S.mapKey, shared): selected here too when the page opens
 function syncMap(){var k=S.mapKey;if(!k||(sel&&sel.key===k))return;if(maps.length){var m=null;maps.forEach(function(x){if(!m&&x.key===k)m=x});if(m){choose(m);rows.forEach(function(r){if(r.m===m&&r.tr.scrollIntoView)r.tr.scrollIntoView({block:'nearest'})})}}else if(!WANT)WANT={key:k,extra:null}}
 // another game picked in the header: the mode lists, editor steps and the map list belong to that game (the server answers per game)
 var shownGame=game().id;
 function fillSel(s,first,list){clear(s);first.forEach(function(o){s.appendChild(o)});list.forEach(function(m){s.appendChild(el('option',{value:m,text:m==='keep'?tx('maps.mode.keepName'):m}))})}
 function syncGame(){var g=game();if(g.id===shownGame)return;shownGame=g.id;MODES=g.kind==='goh'?GOHMODES:AS2MODES;
  fillSel(modeSel,[],MODES);fillSel(modeF,[el('option',{value:'',text:tx('maps.anyMode')})],MODES.slice(1));drawModeHelp();drawSteps();
  pollOff(pollT);maps=[];sel=null;drawn=null;rows=[];clear(tb);clear(picBox);picBox.appendChild(el('div',{class:'hint',text:tx('maps.pickone')}));
  srcOut.className='hint';srcOut.textContent=tx('maps.noSource');out.textContent='';pout.textContent='';cOut.textContent='';writeBtn.disabled=true;pWrite.disabled=true;listState.textContent='';loaded=false}
 return {refresh:function(){syncGame();syncMod()},focus:function(){syncGame();syncMod();syncMap();if(!loaded){loaded=true;loadList(false)}filt.focus()},
  pick:function(key,extra){WANT={key:String(key||'').split(String.fromCharCode(92)).join('/').split('/').filter(Boolean).join('/').toLowerCase(),extra:extra||null};
   if(!loaded){loaded=true;loadList(false)}else if(maps.length)wantNow()}}
};
`;

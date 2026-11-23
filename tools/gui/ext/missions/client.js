// Browser side of the Missions page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent.
// The map list is the Maps page's (GET /api/x/maps/list, same job and cache) plus the loose maps of my mod; the picked map is shared
// with Maps through S.mapKey. Mode texts (maps.mode.*), tool codes (maps.c.*) and tool sentences (maps.s.*) come from the Maps strings.
// Games: api() sends the page's game; texts that differ per game are <key>.<game id> when the lang has one (gk): the editor steps
// (mowas_2_ed.exe; GoH call_to_arms_ed.exe and its launcher page, GHED-10), the test run note (TST-19; GoH no pipe), the GoH facts
// (players per mode, map points), the GoH diff folder. Under GoH the add card lists the GoH mode names (GADD), asks new zone outlines
// instead of a flag count, and one plain line (na.line) says what stays refused (frontlines, campaign and cooperative: gohmode.js).
// The screen is built once: on focus after a game switch the list, the pick and the game's texts are drawn again (gameSync).
// The first card, "Make a single-player mission", is spcard.js (MISSIONS_SP, put in front of this script); it gets the helpers below.
// Author: Imperator_Aug (ARSENAL, ia-c4c3a98e)
module.exports = require('./spcard') + String.raw`
EXT_SCREENS.missions=function(root){
 var ADD=['combat','battle_zones','captureflag'];
 // GoH: the mode names the GoH engine registers (gohmode.js NAMES); the server copies one of the same kind or says what is missing
 var GADD=['battle_zones','armored_warfare','battle_zones_8x8','combined_arms','heroes','ammunition','evacuation','frontlines','campaign_capture_the_flag','koth','guerrilla','captureflag','cooperative'];
 function addList(){return isGoh()?GADD:ADD}
 // GoH: a battle zones form mode the map has may get new flags with their zones in place (gohmode.js plan edit)
 var GEDIT=['battle_zones','armored_warfare','battle_zones_8x8','combined_arms','heroes','koth','captureflag'],edits=[];
 var maps=[],mine=[],mineMod=null,sel=null,pollT=null,facts=null,loaded=false,listDone=false;
 // the re-ask of the map list while the scan runs waits while this page or the window is hidden (pollLater, page.js): one re-ask when it is seen again
 function pollIn(f,ms){return typeof pollLater==='function'?pollLater('missions',f,ms):setTimeout(f,ms)}
 function pollOff(t){if(typeof pollStop==='function')pollStop(t);else clearTimeout(t)}
 // fSeq: the newest facts request, aSeq: the newest Preview; a late reply for an older one (another mod or map) is dropped
 var fSeq=0,aSeq=0;
 function el(t,a,k){return h(t,a,k)}
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function enc(s){return encodeURIComponent(s)}
 function known(k){return tx(k)!==k}
 function sentence(it){return tx(it.k,it.p||{})}
 // server refusals come as a key (maps.e.*, missions.e.*) so they are shown in the page language
 function errText(e){var m=String(e&&e.message||e);return /^(maps|missions)\.e\.[a-z]+$/.test(m)&&known(m)?tx(m):m}
 function codeText(c){var k=['missions','c',c].join('.');if(known(k))return tx(k);k=['maps','c',c].join('.');return known(k)?tx(k):tx('missions.c.other')}
 function rawFold(f){return f.msg?el('details',{},[el('summary',{text:tx('missions.details')}),el('pre',{style:'white-space:pre-wrap',text:f.code+': '+f.msg})]):null}
 function list(){return el('ul',{style:'margin:4px 0 4px 18px;padding:0'})}
 // the page's game (curGame of page.js; a page without it is AS64)
 function game(){try{var g=typeof curGame==='function'?curGame():null;return g&&g.id?g:{id:'as64',kind:'as2',name:'AS64'}}catch(e){return {id:'as64',kind:'as2',name:'AS64'}}}
 function isGoh(){return game().kind==='goh'}
 function gk(k){var v=k+'.'+game().id;return game().id!=='as64'&&known(v)?v:k}
 function modeText(m){var g=['missions','gmode',m].join('.');if(isGoh()&&known(g))return tx(g);var k=['maps','mode',m].join('.');return known(k)?tx(k):m}
 function naLine(key){return known('na.line')?tx('na.line',{g:game().name,why:tx(key)}):tx(key)}
 function ask(o){if(typeof askDo==='function')return askDo(o);var y=true;try{if(typeof window!=='undefined'&&window.confirm)y=!!window.confirm([o.title].concat(o.lines||[]).filter(Boolean).join(' '))}catch(e){}return {then:function(cb){cb(y)}}}
 function go(id){if(typeof show==='function')show(id)}

 // ---------- about ----------
 var modeList=list();ADD.forEach(function(m){modeList.appendChild(el('li',{text:modeText(m)}))});
 var modesHead=el('div',{class:'hint',text:tx('missions.modes')}),modesNa=el('div',{class:'hint',hidden:true}),safeTx=el('div',{class:'hint',text:tx('missions.safe')});
 var aboutCard=card('about',[blk('about.what',[el('div',{text:tx('missions.intro')})]),blk('about.modes',[modesHead,modeList,modesNa],{name:tx('missions.b.modes')}),
  blk('about.safe',[safeTx])],{name:tx('missions.about.h')});

 // ---------- searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list) ----------
 // hits: the items whose precomputed lower-case text (lo) holds q, the ones that start with it first, at most 40 (the rest counted)
 function hits(a,q,done){q=String(q||'').trim().toLowerCase();var f=[],l=[],n=0;
  for(var i=0;i<a.length;i++){var p=a[i].lo.indexOf(q);if(p<0)continue;n++;if(p===0){if(f.length<40)f.push(a[i])}else if(l.length<40)l.push(a[i])}
  var o=f.concat(l).slice(0,40);done(o,n-o.length)}
 // the maps of the list and of my mod (made again only when either list changes): name, folder, key; Browse groups mine / mod / game
 var MI=null;function mapItems(){if(MI&&MI.m===maps&&MI.n===mine)return MI.a;var a=all().map(function(m){var g=m.mine?tx('missions.mine'):m.mod||tx('missions.ix.game');
   return {group:g,label:m.name,value:m.key,hint:m.folder+(m.players?'  '+tx('missions.playersN',{n:m.players}):''),map:m,lo:lo(m)}});
  a.sort(function(x,y){return x.group<y.group?-1:x.group>y.group?1:x.label<y.label?-1:x.label>y.label?1:0});MI={m:maps,n:mine,a:a};return a}
 function lo(m){if(m._lo==null)m._lo=(m.name+' '+m.key).toLowerCase();return m._lo}
 // Browse of the map filter: the picker in the game's data at map/ (folders); a picked folder gives the key of the listed map it is in
 // (or under), else its own path from map/ on
 function mapKeyOf(p){p=String(p||'').split(String.fromCharCode(92)).join('/').replace(/^resource\//i,'').replace(/\/+$/,'');var lp=p.toLowerCase(),best='';
  all().forEach(function(x){var k=String(x.key).toLowerCase();if((lp===k||lp.indexOf(k+'/')===0)&&k.length>best.length)best=x.key});
  return best||(/^map\/[^\/]/i.test(p)?p:'')}
 // the header's mod (S.mod): the page has no mod box of its own (owner 2026-11-19)
 function curMod(){return String(S.mod||'').trim()}

 // ---------- 1. pick a map ----------
 var filt=el('input',{type:'text',placeholder:tx('missions.filter'),'aria-label':tx('missions.filter'),autocomplete:'off'});
 var mapSel=el('select',{'aria-label':tx('missions.map')}),listState=el('div',{class:'hint'});
 var reloadBtn=el('button',{type:'button',text:tx('missions.reload'),onclick:function(){loadList(true);loadMine(true)}});
 function all(){var seen={},o=[];maps.concat(mine).forEach(function(m){if(seen[m.key])return;seen[m.key]=1;o.push(m)});return o}
 function byKey(k){var m=null;k=String(k||'').toLowerCase();all().forEach(function(x){if(!m&&String(x.key).toLowerCase()===k)m=x});return m}
 // fast typing: the filter redraws the map list in the next frame (one draw for many keys), with each map's lower-case text made once
 var dwant=false;
 function frame(f){if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)}
 function drawSoon(){if(dwant)return;dwant=true;frame(function(){dwant=false;drawSel()})}
 function drawSel(){
  var q=filt.value.trim().toLowerCase(),n=0,a=all();clear(mapSel);mapSel.appendChild(el('option',{value:'',text:tx('missions.pickone')}));
  a.forEach(function(m){if(q&&lo(m).indexOf(q)<0&&!(sel&&sel.key===m.key))return;if(n++>=300)return;
   mapSel.appendChild(el('option',{value:m.key,text:m.name+' ('+m.folder+')'+(m.players?', '+tx('missions.playersN',{n:m.players}):'')+(m.mine?', '+tx('missions.mine'):m.mod?', '+m.mod:'')}))});
  mapSel.value=sel?sel.key:'';
  if(listDone)listState.textContent=tx('missions.shown',{n:Math.min(n,300),total:a.length})}
 filt.addEventListener('input',drawSoon);
 // searchKit: history 'missions.filter', index = the maps of the list and of my mod by name, folder and key, Browse = the map folders in
 // the game's data (my mod on top); a pick filters to that map and picks it
 var filtKit=searchKit(filt,{key:'missions.filter',index:function(q,done){hits(mapItems(),q,done)},
  browse:{mode:'dir',view:'data',start:'map',toValue:function(p){return mapKeyOf(p)}},
  onPick:function(v,it){filt.value=v;var m=it&&it.map||byKey(v);if(m)choose(m);else drawSoon()}});
 mapSel.addEventListener('change',function(){var m=byKey(mapSel.value);if(m)choose(m)});
 function loadList(refresh,again){
  pollOff(pollT);listState.className='hint';if(!again)listState.textContent=tx('missions.loading');var gid=game().id;
  api('/api/x/maps/list'+(refresh?'?refresh=1':''),undefined,again?{job:false}:{what:tx('missions.job.list')}).then(function(j){if(gid!==game().id||gid!==lastGame)return;
   if(j.state==='running'){listState.textContent=tx('missions.progress',{s:j.elapsed});pollT=pollIn(function(){loadList(false,true)},1500);return}
   if(j.stopped){listState.textContent=tx('missions.list.stopped',{b:tx('missions.reload')});return}
   if(j.state==='error'){listState.className='err';listState.textContent=tx('missions.listfail',{m:errText({message:j.error})});return}
   maps=j.maps||[];listDone=true;drawSel();syncMap()
  }).catch(function(e){if(e&&e.cancelled){listState.textContent=tx('missions.list.stopped',{b:tx('missions.reload')});return}listState.className='err';listState.textContent=errText(e)})}
 function loadMine(force){var md=S.mod||'';if(!force&&md===mineMod)return;mineMod=md;if(!md){mine=[];drawSel();return}
  var gid=game().id;api('/api/x/missions/mine?mod='+enc(md),undefined,{what:tx('missions.job.mine')}).then(function(j){if(mineMod!==md||gid!==lastGame)return;mine=j.maps||[];drawSel();syncMap()}).catch(function(){mine=[]})}
 var pickCard=card('pick',[blk('pick.title',[el('h3',{text:tx('missions.pick.h')})]),h('div',{class:'row',blk:'pick.filter','data-blkname':tx('missions.b.filter')},[filtKit.el,reloadBtn]),
  fld('pick.map',tx('missions.map'),mapSel),blk('pick.state',[listState],{name:tx('missions.b.state')}),
  // the limits of the list: mine (index.js mineRoute: two folders deep, at most 200) and drawSel (at most 300 rows)
  blk('pick.limits',[el('div',{class:'hint',text:tx('missions.pick.limits')})],{name:tx('missions.b.limits')}),
  blk('pick.maps',[el('div',{class:'hint',text:tx('missions.pick.maps')+' '}),el('button',{type:'button',text:tx('missions.toMaps'),onclick:function(){go('maps')}})],{name:tx('missions.b.tomaps')})],{name:tx('missions.pick.h')});

 // ---------- 2. missions on this map ----------
 var fState=el('div',{class:'hint',text:tx('missions.pickfirst')}),fTb=el('tbody'),fWarn=el('div');
 // GoH: a Players column (players per mode: <mode>.info) and Map points for Flags
 var thFlags=el('th',{class:'nw',text:tx('missions.col.flags')}),thPlayers=el('th',{class:'nw',hidden:true,text:tx('missions.col.players')});
 var fTbl=el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx('missions.col.mode')}),thPlayers,thFlags,el('th',{class:'nw',text:tx('missions.col.spawns')}),el('th',{text:tx('missions.col.bots')}),el('th',{text:tx('missions.col.own')})])]),fTb]);
 function botsText(b){return b===true?tx('missions.bots.on'):b===false?tx('missions.bots.off'):tx('missions.bots.none')}
 function loadFacts(){
  var m=sel;if(!m)return;var my=++fSeq,md=S.mod||'';clear(fTb);clear(fWarn);fState.className='hint';fState.textContent=tx('missions.facts.loading');
  api('/api/x/missions/facts?map='+enc(m.key)+'&mod='+enc(S.mod||'')+(m.mods&&m.mods.length?'&from='+enc(m.mods.join(',')):''),undefined,{what:tx('missions.job.facts',{map:m.name||m.key})}).then(function(j){
   if(sel!==m||my!==fSeq||(S.mod||'')!==md||(j.game&&j.game!==game().id))return;facts=j;clear(fTb);clear(fWarn);
   fState.textContent=tx('missions.facts.state',{name:m.name,players:j.players||'?',n:j.modes.length})+(j.modWhy?' '+tx('missions.facts.nomod',{why:errText({message:j.modWhy})}):'');
   if(!j.modes.length)fState.textContent+=' '+tx('missions.facts.none');
   j.modes.forEach(function(x){fTb.appendChild(el('tr',{},[el('td',{},[el('span',{class:'badge',text:x.mode,title:modeText(x.mode)})]),isGoh()?el('td',{class:'nw',text:x.players?String(x.players):'?'}):null,el('td',{class:'nw',text:String(x.flags)}),el('td',{class:'nw',text:String(x.spawns)}),el('td',{text:botsText(x.bots)}),el('td',{text:x.own?tx('missions.own.yes'):''})]))});
   if(j.warn&&j.warn.length){var u=list();j.warn.forEach(function(w){u.appendChild(el('li',{},[el('span',{class:'badge info',text:tx('missions.warn')}),document.createTextNode(sentence(w))]))});fWarn.appendChild(u)}
   fillAdd(j)
  }).catch(function(e){if(sel!==m||my!==fSeq||(S.mod||'')!==md)return;fState.className='err';fState.textContent=errText(e)})}
 var factsIntro=el('div',{class:'hint',text:tx('missions.facts.intro')});
 var factsCard=card('facts',[blk('facts.title',[el('h3',{text:tx('missions.facts.h')})]),blk('facts.intro',[factsIntro]),
  blk('facts.state',[fState],{name:tx('missions.b.state')}),blk('facts.table',[el('div',{class:'scroll'},[fTbl])],{name:tx('missions.b.table')}),blk('facts.warn',[fWarn],{name:tx('missions.b.warn')})],{name:tx('missions.facts.h')});

 // ---------- 3. add a mode to this map in my mod ----------
 // the header's mod changed (Mods, the header): a preview made for the old mod is stale (Write off until a new Preview); the facts card
 // is asked again for the new mod (its own column and the from and to lists)
 var shownMod=curMod();
 function syncMod(){var m=curMod();if(m===shownMod)return false;shownMod=m;
  if(!aWrite.disabled){aout.textContent='';aout.appendChild(el('div',{class:'hint',text:tx('missions.restale',{mod:m})}))}stale();if(sel)loadFacts();return true}
 var fromSel=el('select',{'aria-label':tx('missions.from')}),toSel=el('select',{'aria-label':tx('missions.to')},ADD.map(function(m){return el('option',{value:m,text:m})}));
 var flagsIn=el('input',{type:'text',autocomplete:'off',inputmode:'numeric',maxlength:'2',placeholder:tx('missions.flags.auto'),'aria-label':tx('missions.flags')});
 // GoH: new outlines for zones the mode already has, as map coordinates (gohmode.js parseZones)
 var zonesIn=el('textarea',{rows:'3',maxlength:'8000',spellcheck:'false',placeholder:'f1: 0 0, 200 0, 200 200, 0 200 | f5 @ 100 100: 0 0, 200 0, 200 200, 0 200','aria-label':tx('missions.zones')});
 zonesIn.addEventListener('input',function(){stale()});
 var toHelp=el('div',{class:'hint'}),clipNote=el('div',{class:'hint'}),allNote=el('div',{class:'hint'});
 var aout=el('div'),aPrev=el('button',{type:'button',class:'primary',text:tx('missions.preview'),onclick:function(){runAdd(false)}}),aWrite=el('button',{type:'button',text:tx('missions.write'),disabled:true,onclick:function(){runAdd(true)}});
 // planned: the request the last good Preview was made for (mod, map, from, to, flags); Write sends only that request
 var planned=null;
 function sig(b){return JSON.stringify([b.mod,b.map,b.from,b.to,b.flags,b.zones||'',!!b.edit])}
 function stale(){aWrite.disabled=true;if(planned)planned.s=null}
 // why a preview no longer fits the form: another mod, or other choices (map, from, to, flags)
 function staleNote(mod){aout.appendChild(el('div',{class:'hint',text:mod!==curMod()?tx('missions.restale',{mod:curMod()}):tx('missions.reform')}))}
 var flagsFld=fld('add.flags',tx('missions.flags'),flagsIn);
 var zonesFld=fld('add.zones',tx('missions.zones'),zonesIn),zonesHint=blk('add.zoneshint',[el('div',{class:'hint',text:tx('missions.zones.hint')})],{name:tx('missions.b.zones')});
 function drawTo(){var t=toSel.value,goh=isGoh();toHelp.textContent=t?modeText(t):'';flagsFld.hidden=goh||t!=='battle_zones';zonesFld.hidden=!goh;zonesHint.hidden=!goh;
  clipNote.className=t==='captureflag'&&facts&&facts.clips===false?'err':'hint';clipNote.textContent=t==='captureflag'&&!goh?tx(facts&&facts.clips===false?'missions.clips.no':facts&&facts.clips?'missions.clips.yes':'missions.clips.unknown'):''}
 toSel.addEventListener('change',function(){stale();drawTo()});[fromSel].forEach(function(s){s.addEventListener('change',stale)});flagsIn.addEventListener('input',stale);
 function fillAdd(j){
  var have=j.modes.filter(function(x){return x.mi}).map(function(x){return x.mode}),keep=fromSel.value;clear(fromSel);
  have.forEach(function(m){fromSel.appendChild(el('option',{value:m,text:m}))});if(have.indexOf(keep)>=0)fromSel.value=keep;else if(have.length)fromSel.value=have[0];
  var free=addList().filter(function(m){return j.modes.every(function(x){return x.mode!==m})}),tk=toSel.value;clear(toSel);
  edits=isGoh()?have.filter(function(m){return GEDIT.indexOf(m)>=0}):[];
  free.forEach(function(m){toSel.appendChild(el('option',{value:m,text:m}))});edits.forEach(function(m){toSel.appendChild(el('option',{value:m,text:m+' ('+tx('missions.edit.opt')+')'}))});if(free.indexOf(tk)>=0||edits.indexOf(tk)>=0)toSel.value=tk;else if(free.length)toSel.value=free[0];
  aPrev.disabled=!(free.length||edits.length)||!have.length;allNote.textContent=free.length?'':tx('missions.add.all');stale();drawTo()}
 function sayList(items){var u=list();items.forEach(function(it){u.appendChild(el('li',{text:sentence(it)}))});return u}
 function findingList(fs){var u=list();(fs||[]).forEach(function(f){if(f.sev==='info'&&!/^MC_NEEDS_MANUAL/.test(f.code))return;var li=el('li',{class:f.sev==='error'?'err':''});li.appendChild(document.createTextNode(codeText(f.code)));var rf=known(['maps','c',f.code].join('.'))||known(['missions','c',f.code].join('.'))?null:rawFold(f);if(rf)li.appendChild(rf);u.appendChild(li)});return u.firstChild?u:null}
 function checkView(c,target){
  target.appendChild(el('h3',{text:tx('missions.check.h')}));
  // milint refuses this game (maps lintMod: its one plain line, games.refuse): say that line, not 'could not run'
  if(c&&c.na){target.appendChild(el('div',{class:'hint',text:tx('missions.check.na',{why:c.na})}));return}
  if(!c||!c.ran){target.appendChild(el('div',{class:'err',text:tx('missions.check.noRun')}));return}
  if(!c.count){target.appendChild(el('div',{class:'ok',text:tx('missions.check.clean')}));return}
  target.appendChild(el('div',{text:tx('missions.check.some',{n:c.count})}));
  var u=list();(c.findings||[]).forEach(function(f){if(f.sev==='info')return;u.appendChild(el('li',{},[el('span',{class:'badge '+(f.sev==='error'?'badx':'info'),text:f.sev==='error'?tx('missions.check.err'):tx('missions.check.warn')}),document.createTextNode(codeText(f.code)+(f.where?' ('+f.where+')':'')),known(['maps','c',f.code].join('.'))||known(['missions','c',f.code].join('.'))?null:rawFold(f)]))});
  target.appendChild(u)}
 function needsTest(target){target.appendChild(el('div',{class:'wzstat'},[el('b',{text:tx('missions.test.h')+' '}),document.createTextNode(tx('missions.test.body')+' '),el('button',{type:'button',text:tx('missions.test.go'),onclick:function(){go('play')}})]))}
 function form(){var goh=isGoh();return {mod:curMod(),map:sel&&sel.key,from:fromSel.value,to:toSel.value,flags:!goh&&toSel.value==='battle_zones'?flagsIn.value.trim():'',zones:goh?zonesIn.value.trim():'',edit:goh&&edits.indexOf(toSel.value)>=0}}
 function runAdd(write,asked){
  var moved=syncMod(),f=form(),body={mod:f.mod,map:f.map,mods:sel&&sel.mods||[],from:f.from,to:f.to,flags:f.flags,write:write},want=sig(f),my=write?0:++aSeq;
  if(f.zones)body.zones=f.zones;if(f.edit)body.edit=true;
  if(!sel){aout.textContent='';aout.appendChild(el('div',{class:'err',text:tx('missions.needMap')}));return}
  if(write&&moved)return;
  // Write sends only what the last Preview showed: the mod or a choice changed since (or a late reply came for an old form) = nothing sent
  if(write&&(!planned||planned.s!==want)){stale();aout.textContent='';staleNote(planned?planned.mod:'');return}
  if(write&&!asked){ask({title:tx('missions.write'),lines:[tx('missions.confirm',{mode:body.to,map:sel.name,mod:body.mod})],where:body.mod}).then(function(yes){if(yes)runAdd(write,true)});return}
  aout.textContent='';aout.appendChild(el('div',{class:'hint',text:tx(write?'missions.writing':'missions.planning')}));aPrev.disabled=true;stale();
  // a Preview reply is dropped when a newer Preview was sent since (a mod or map change let Preview run again)
  function old(){return !write&&my!==aSeq}
  api('/api/x/missions/add',body,{what:tx(write?'missions.job.addw':'missions.job.add',{mode:body.to,map:sel.name||sel.key})}).then(function(j){
   if(old())return;aout.textContent='';aout.appendChild(el('div',{class:j.ok?'ok':'err',text:tx(j.ok?(write?'missions.done':'missions.planOk'):'missions.failed')}));
   if(j.say&&j.say.length)aout.appendChild(sayList(j.say));var fl=findingList(j.findings);if(fl)aout.appendChild(fl);
   // a Preview reply turns Write on only if the form still asks what was previewed (the mod or the map may have changed meanwhile)
   if(j.ok&&!write){syncMod();if(sel&&sig(form())===want){aWrite.disabled=false;planned={s:want,mod:body.mod};aout.appendChild(el('div',{class:'hint',text:tx('missions.planNote',{mod:body.mod})}))}else{stale();aout.textContent='';staleNote(body.mod)}}
   if(j.ok&&write){if(j.check)checkView(j.check,aout);if(j.needsTest)needsTest(aout);loadFacts()}
  }).catch(function(e){if(old())return;aout.textContent='';aout.appendChild(e&&e.cancelled?el('div',{class:'hint','data-stopped':write?'write':'preview',text:tx(write?'missions.add.stoppedw':'missions.add.stopped')}):el('div',{class:'err',text:errText(e)}))}).then(function(){if(old())return;aPrev.disabled=!sel||!toSel.value||!fromSel.value;if(write||!aout.querySelector('.ok'))stale()})}
 // GoH: the form parts that make a mode are hidden and one plain line says why (facts, diff and check read the header's mod)
 var addNa=el('div',{class:'wzstat'});addNa.hidden=true;
 var addIntro=el('div',{class:'hint',text:tx('missions.add.intro')});
 var addForm=[fld('add.from',tx('missions.from'),fromSel),fld('add.to',tx('missions.to'),toSel),blk('add.tohelp',[allNote,toHelp,clipNote],{name:tx('missions.b.tohelp')}),
  blk('add.flagshint',[el('div',{class:'hint',text:tx('missions.flags.hint')})]),h('div',{class:'row',blk:'add.btns','data-blkname':tx('missions.b.btns')},[aPrev,aWrite]),blk('add.out',[aout],{name:tx('missions.b.out')})];
 var addCard=card('add',[blk('add.title',[el('h3',{text:tx('missions.add.h')})]),blk('add.intro',[addIntro,addNa]),
  addForm[0],addForm[1],addForm[2],
  flagsFld,addForm[3],zonesFld,zonesHint,addForm[4],addForm[5]],{name:tx('missions.add.h')});

 // ---------- 4. what my mod changed in this map's missions (misdiff, read only) ----------
 var dout=el('div'),dBtn=el('button',{type:'button',text:tx('missions.diff.run'),onclick:function(){runDiff()}});
 function thingText(r){var k=['missions','thing',r.thing].join('.');return r.thing&&known(k)?tx(k):r.code}
 function actText(r){var k=['missions','act',r.act].join('.');return r.act&&known(k)?tx(k):''}
 function runDiff(){
  syncMod();if(!sel){dout.textContent='';dout.appendChild(el('div',{class:'err',text:tx('missions.needMap')}));return}
  dout.textContent='';dout.appendChild(el('div',{class:'hint',text:tx('missions.diff.running')}));dBtn.disabled=true;
  api('/api/x/missions/diff',{mod:curMod(),map:sel.key,mods:sel.mods||[]},{what:tx('missions.job.diff',{map:sel.name||sel.key})}).then(function(j){
   dout.textContent='';
   if(!j.ok){if(j.say)j.say.forEach(function(s){dout.appendChild(el('div',{class:'err',text:sentence(s)}))});
    if(j.installed===false)dout.appendChild(el('div',{class:'row'},[el('button',{type:'button',text:tx('missions.diff.toPlay'),onclick:function(){go('play')}})]));
    if(j.detail)dout.appendChild(el('details',{},[el('summary',{text:tx('missions.details')}),el('pre',{style:'white-space:pre-wrap',text:j.detail})]));return}
   (j.dropped||[]).forEach(function(w){dout.appendChild(el('div',{class:'hint',text:tx('missions.diff.dropped',{why:w})}))});
   if(!j.rows.length&&!j.findings.length){dout.appendChild(el('div',{class:'ok',text:tx('missions.diff.same',{mod:j.name})}));return}
   dout.appendChild(el('div',{text:tx('missions.diff.some',{n:j.total,mod:j.name})}));
   if(j.rows.length){var tb=el('tbody');j.rows.forEach(function(r){tb.appendChild(el('tr',{},[el('td',{text:r.file}),el('td',{text:thingText(r)}),el('td',{text:actText(r)}),el('td',{class:'nw',text:String(r.n)})]))});
    dout.appendChild(el('div',{class:'scroll'},[el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:tx('missions.dcol.file')}),el('th',{text:tx('missions.dcol.what')}),el('th',{text:tx('missions.dcol.change')}),el('th',{class:'nw',text:tx('missions.dcol.n')})])]),tb])]))}
   if(j.findings.length){var u=list();j.findings.forEach(function(f){u.appendChild(el('li',{},[el('span',{class:'badge info',text:tx('missions.warn')}),document.createTextNode(codeText(f.code)+(f.file?' ('+f.file+')':'')),rawFold(f)]))});dout.appendChild(u)}
   if(j.details&&j.details.length)dout.appendChild(el('details',{},[el('summary',{text:tx('missions.diff.lines')}),el('pre',{style:'white-space:pre-wrap',text:j.details.map(function(d){return d.file+': '+d.code+' '+d.msg}).join(String.fromCharCode(10))})]))
  }).catch(function(e){dout.textContent='';dout.appendChild(e&&e.cancelled?el('div',{class:'hint','data-stopped':'diff',text:tx('missions.stopped')}):el('div',{class:'err',text:errText(e)}))}).then(function(){dBtn.disabled=false})}
 var diffLimit=el('div',{class:'wzstat',text:tx('missions.diff.limit')});
 var diffCard=card('diff',[blk('diff.title',[el('h3',{text:tx('missions.diff.h')})]),blk('diff.intro',[el('div',{class:'hint',text:tx('missions.diff.intro')})]),
  blk('diff.limit',[diffLimit],{name:tx('missions.b.limit')}),h('div',{class:'row',blk:'diff.btns','data-blkname':tx('missions.b.btns')},[dBtn]),blk('diff.out',[dout],{name:tx('missions.b.out')})],{name:tx('missions.diff.h')});

 // ---------- 5. flags, start points and triggers in the game editor ----------
 var STEPS=['missions.ed.s1','missions.ed.s2','missions.ed.s3','missions.ed.s4'],steps=STEPS.map(function(k){return el('li',{text:tx(gk(k))})});
 var edNote=el('div',{class:'hint',text:tx(gk('missions.ed.note'))});
 var edState=el('div',{class:'err'});
 var countBtn=el('button',{type:'button',text:tx('missions.ed.count'),onclick:function(){edState.textContent=sel?'':tx('missions.needMap');if(sel)loadFacts()}});
 var edCard=card('editor',[blk('editor.title',[el('h3',{text:tx('missions.ed.h')})]),blk('editor.intro',[el('div',{class:'hint',text:tx('missions.ed.intro')})]),
  blk('editor.steps',[el('ol',{style:'margin:4px 0 4px 20px;padding:0'},steps)]),h('div',{class:'row',blk:'editor.btns','data-blkname':tx('missions.b.btns')},[countBtn]),
  blk('editor.state',[edState],{name:tx('missions.b.state')}),
  blk('editor.note',[edNote])],{name:tx('missions.ed.h')});

 // ---------- 6. check my missions (milint, mission codes only) ----------
 var cOut=el('div'),cBtn=el('button',{type:'button',text:tx('missions.check.run'),onclick:function(){
  syncMod();cOut.textContent='';cOut.appendChild(el('div',{class:'hint',text:tx('missions.check.running')}));cBtn.disabled=true;
  api('/api/x/maps/check',{mod:curMod(),only:'missions'},{what:tx('missions.job.check')}).then(function(j){cOut.textContent='';checkView(j.check,cOut)}).catch(function(e){cOut.textContent='';cOut.appendChild(e&&e.cancelled?el('div',{class:'hint','data-stopped':'check',text:tx('missions.stopped')}):el('div',{class:'err',text:errText(e)}))}).then(function(){cBtn.disabled=false})}});
 // a phone (LAN Remote) is refused maps/check (remote.js: milint reads a .lintrc above the roots, a run takes up to 300 s): the button is off there
 if(typeof RMT!=='undefined'&&RMT){cBtn.disabled=true;cOut.appendChild(el('div',{class:'hint',text:tx('missions.check.phone')}))}
 var checkCard=card('check',[blk('check.title',[el('h3',{text:tx('missions.check.h2')})]),blk('check.intro',[el('div',{class:'hint',text:tx('missions.check.intro')})]),
  h('div',{class:'row',blk:'check.btns','data-blkname':tx('missions.b.btns')},[cBtn]),blk('check.out',[cOut],{name:tx('missions.b.out')})],{name:tx('missions.check.h2')});

 // ---------- 7. guided tasks ----------
 function base(){return sel?{id:sel.key,name:sel.name,where:sel.mods&&sel.mods.length?sel.mods.join(', '):'game',ref:{key:'resource/'+sel.key+'/preview.dds',mods:sel.mods||[],modes:sel.modes||[]}}:null}
 function task(rid){if(typeof TASK==='undefined'||!TASK.open){toast(tx('missions.task.none'));return}var b=base();TASK.open(rid,'change',b?{base:b}:{})}
 var taskCard=card('task',[blk('task.title',[el('h3',{text:tx('missions.task.h')})]),blk('task.intro',[el('div',{class:'hint',text:tx('missions.task.intro')})]),
  h('div',{class:'row',blk:'task.btns','data-blkname':tx('missions.b.btns')},[el('button',{type:'button',text:tx('missions.task.mission'),onclick:function(){task('mission')}}),el('button',{type:'button',text:tx('missions.task.map'),onclick:function(){task('map')}})])],{name:tx('missions.task.h')});

 // ---------- 0. make a single-player mission (spcard.js), the first card ----------
 var SP=MISSIONS_SP({el:el,clear:clear,known:known,game:game,isGoh:isGoh,ask:ask,go:go,errText:errText,codeText:codeText,curMod:curMod,list:list,hits:hits});
 root.appendChild(blk('title',[el('h2',{text:tx('missions.title')})]));
 root.appendChild(SP.el);
 // the other cards (multiplayer maps and modes) under it, in their number order (1 to 6, then the game editor), folded; the fold
 // remembers being open, and a map picked on the Maps page opens it
 var moreOpen=false;try{moreOpen=typeof LS!=='undefined'&&LS.get('missionsMore',false)===true}catch(e){moreOpen=false}
 var moreF=h('details',{blk:'more',box:'col','data-blkname':tx('missions.more.h'),open:moreOpen?true:null,ontoggle:function(){try{if(typeof LS!=='undefined')LS.set('missionsMore',!!moreF.open)}catch(e){}}},
  [el('summary',{text:tx('missions.more.h')}),aboutCard,h('div',{blk:'main',box:'col','data-blkname':tx('missions.b.main')},[pickCard,factsCard,addCard,diffCard,checkCard,taskCard,edCard])]);
 root.appendChild(moreF);
 // the texts and parts that differ per game
 function drawGame(){var goh=isGoh();
  steps.forEach(function(li,i){li.textContent=tx(gk(STEPS[i]))});edNote.textContent=tx(gk('missions.ed.note'));
  diffLimit.textContent=tx(gk('missions.diff.limit'));safeTx.textContent=tx(gk('missions.safe'));factsIntro.textContent=tx(gk('missions.facts.intro'));
  thFlags.textContent=tx(gk('missions.col.flags'));thPlayers.hidden=!goh;
  modeList.hidden=goh;modesHead.hidden=goh;modesNa.hidden=!goh;modesNa.textContent=goh?tx('missions.add.goh'):'';
  // GoH: the form makes a mode of the same kind (gohmode.js); one plain line says what stays refused; the flags hint is AS2 only
  addIntro.textContent=tx(goh?'missions.add.goh':'missions.add.intro');addNa.hidden=!goh;addNa.textContent=goh?naLine('missions.na.add.goh'):'';addForm[3].hidden=goh;
  var tk=toSel.value;clear(toSel);addList().forEach(function(m){toSel.appendChild(el('option',{value:m,text:m}))});if(addList().indexOf(tk)>=0)toSel.value=tk;drawTo()}
 // a game switch since the last focus: the list, the pick and the counts belong to the other game
 var lastGame=game().id;
 function gameSync(){var id=game().id;if(id===lastGame)return;lastGame=id;pollOff(pollT);
  maps=[];mine=[];mineMod=null;sel=null;facts=null;loaded=false;listDone=false;fSeq++;aSeq++;planned=null;
  clear(fTb);clear(fWarn);fState.className='hint';fState.textContent=tx('missions.pickfirst');aout.textContent='';dout.textContent='';edState.textContent='';cOut.textContent='';
  clear(fromSel);stale();drawSel();listState.textContent='';drawGame()}
 drawGame();

 function choose(m){sel=m;S.mapKey=m.key;facts=null;drawSel();aout.textContent='';dout.textContent='';edState.textContent='';stale();
  clear(fromSel);(m.modes||[]).forEach(function(x){fromSel.appendChild(el('option',{value:x,text:x}))});loadFacts()}
 // the map picked on the Maps page (S.mapKey, shared) is picked here too
 function syncMap(){var k=S.mapKey;if(!k||(sel&&sel.key===k))return;var m=byKey(k);if(m){choose(m);moreF.open=true}}
 return {refresh:function(){gameSync();syncMod();loadMine(false);SP.refresh()},sp:SP,
  // S.missionsSp (set by the Task recipe "Make a mission": a single-player mission): the card is brought into view, not the map filter
  focus:function(){gameSync();syncMod();SP.focus();if(!loaded){loaded=true;loadList(false)}loadMine(false);syncMap();
   if(S.missionsSp){S.missionsSp=0;if(SP.el&&SP.el.scrollIntoView)try{SP.el.scrollIntoView({block:'start'})}catch(e){}return}if(moreF.open)filt.focus()}}
};
`;

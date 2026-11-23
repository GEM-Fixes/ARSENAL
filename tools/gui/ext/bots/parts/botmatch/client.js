// browser side of the botmatch part: "Try a bot match". Up front (page standard S7): Gates of Hell and MoW:AS2 grey the card with one
// plain line (MoW:AS2 also the other way to see a bot play: the Match log habit, a match by hand, the bot log); with launching off the
// form is greyed with one line naming the switch ("Let ARSENAL start the game" on the Play page) and Check again. The map box is a
// searchKit over maps whose modes allow bots, attached after the box is in its row (S1): the game's map names, typed names accepted, the
// name in the main text, the folder only under Details. Preview (testrun --dry, nothing starts) and Start (asks first, polls every 3 s). The report leads with plain
// sentences ("The German bot (team B) bought 14 units: ..."), with in-game unit names; the ordered list, the raw log lines, codes and
// IDs sit in Details folds (S2, S3). Refusals are codes worded here (S6). Page rules (bots/script.js): no backtick, no dollar-brace, DOM
// only through h() and textContent. Shared frame helpers (kit.details, kit.na, kit.pick) are used when present.
// JOBS (gui README): the match is the server's background job; the Stop button on the card and the job list's Cancel end in the same
// server stop (POST botmatch/stop = the registry's cancel). After a stop the card shows the plain state "stopped": the game was closed,
// nothing was reported (never red; a line more when a game is still seen running). A request stopped from the job list (Preview) is a
// plain line too. The re-asks of the map list are polls ({job:false}).
// Author: Imperator_Aug (ARSENAL, ia-527cecf7)
module.exports = String.raw`
BOTS_PARTS.push({id:'botmatch',group:'F',order:10,title:function(){return tx('bots.botmatch.title')},
 draw:function(env){var k=env.kit,P='bots.botmatch.',ID='bots.botmatch';
  function t(x,p){return tx(P+x,p)}
  function known(key){return tx(key)!==key}
  function sh(key,own,p){return known(key)?tx(key,p):t(own,p)}
  function say(it){return tx(it.k,it.p||{})}
  function go(id){try{if(env.go)env.go(id)}catch(e){}}
  function fold(label,kids){return h('details',{},[h('summary',{text:label})].concat(kids))}
  function det(kids){return fold(sh('bots.details','details'),kids)}
  function details(id,kids){if(k.details)return k.details(id,kids);var l=sh('bots.details','details');return h('details',{blk:id,box:'col','data-blkname':l},[h('summary',{text:l})].concat(kids))}
  // S15: the frame's one pattern (why + what to use instead) when it words it (kit.naText), else the whole sentence
  function na(id,text,o){if(k.na)return k.na(id,o&&typeof k.naText==='function'?o:text);return k.leaf(id,[h('div',{class:'hint','data-na':'1',style:'opacity:.8',text:text})])}
  function pick(inp,o){if(k.pick)return k.pick(inp,o);if(typeof searchKit==='function')return searchKit(inp,o)}
  function page(id){try{if(typeof show==='function')show(id)}catch(e){}}
  // one name per game (kit.game), else the same names here
  function gameN(g){return typeof k.game==='function'?k.game(g):g==='goh'?'Gates of Hell':g==='mowas2'?'MoW:AS2':'AS64'}
  // the next step of each refusal, as a button (S12): [label key, what it does]; codes not listed say their next step in the sentence
  var NEXT={'e.notInGame':['go.install',function(){page('play')}],'e.needmod':['go.mods',function(){page('mods')}],'e.nomod':['go.mods',function(){page('mods')}],
   'e.inGame':['go.mods',function(){page('mods')}],'e.guard':['go.mods',function(){page('mods')}],'e.nogame':['go.settings',function(){page('settings')}],
   'e.noexe':['go.settings',function(){page('settings')}],'e.launchOff':['launchOff.go',function(){playPage()}],'e.busy':['launchOff.again',function(){load()}],
   'e.gameUp':['launchOff.again',function(){load()}],'e.mode':['go.modes',function(){go('bots.modeready')}],'mapNoBots':['go.modes',function(){go('bots.modeready')}],'e.noBots':['go.modes',function(){go('bots.modeready')}]};
  // a refusal: the code (the frame's third callback value, or the message itself) in the page language with its next step; words the
  // frame already said as they are; anything else one sentence of what to do, with the raw text folded
  function stopEl(text){if(typeof k.stopBox==='function')return k.stopBox(text);return h('div',{class:'hint',role:'status','data-stopped':'1',text:text})}
  function errEl(m,x){if(x&&x.cancelled)return stopEl(t('reqStopped'));var key=x&&x.key?String(x.key):'',p=x&&x.params||{},c=/^((?:bots|maps|modes)\.[A-Za-z0-9_.]+)(?: (\{.*\}))?$/.exec(String(m||''));
   if(!key&&c){key=c[1];try{p=c[2]?JSON.parse(c[2]):{}}catch(e){p={}}}
   if(key&&known(key)){var nx=NEXT[key.replace(P,'')],kids=[h('div',{text:tx(key,p)})];
    if(nx)kids.push(h('div',{class:'row'},[h('button',{type:'button',class:'primary','data-next':key.replace(P,''),text:t(nx[0]),onclick:nx[1]})]));
    if(p.m)kids.push(det([h('pre',{text:String(p.m)})]));return h('div',{class:'err'},kids)}
   if(!x&&m&&!c&&!/^(Error|[A-Z]{3,}\b|HTTP )/.test(String(m)))return h('div',{class:'err',text:String(m)});
   return h('div',{class:'err'},[h('div',{text:t('e.other')}),h('div',{class:'row'},[h('button',{type:'button','data-next':'other',text:t('launchOff.again'),onclick:function(){load()}})]),det([h('pre',{text:String((x&&x.message)||m||'')})])])}
  // plural forms: key (many), key.1 (one), key.2 (few, ru/uk 2-4); the page language from LANG
  function plf(n){var L=typeof LANG!=='undefined'?String(LANG):'en';n=Math.abs(+n||0);if(L==='zh')return '';if(L==='ru'||L==='uk'){if(n%1)return '';var a=n%10,b=n%100;if(a===1&&b!==11)return '.one';if(a>=2&&a<=4&&(b<12||b>14))return '.few';return '.many'}return n===1?'.one':''}
  // the frame's kit.n when it has one (the same forms), else here; a missing form falls back to the key
  function pl(x,n,p){p=p||{};if(env.kit&&typeof env.kit.n==='function')return env.kit.n(n,P+x,p);var q={},k;for(k in p)q[k]=p[k];if(q.n==null)q.n=n;var f=plf(n);return f&&known(P+x+f)?t(x+f,q):t(x,q)}
  function mmss(s){s=Math.max(0,Math.round(+s||0));var m=Math.floor(s/60),r=s%60;return m+':'+(r<10?'0':'')+r}
  function ask(o){if(typeof askDo==='function')return askDo(o);var y=true;try{if(typeof window!=='undefined'&&window.confirm)y=!!window.confirm([o.title].concat(o.lines||[]).join(' '))}catch(e){}return {then:function(cb){cb(y)}}}
  function opt(v,l,sel){var o=h('option',{value:v,text:l});if(sel)o.selected=true;return o}
  // the in-game name of a mode (the game's own words, read by the server), else its id
  function modeRow(m){var a=(F&&F.modes)||[];for(var i=0;i<a.length;i++)if(a[i].mode===m)return a[i];return null}
  function modeName(m){var r=modeRow(m);return (r&&r.name)||m||''}
  // the other way to see what a bot does, where a match cannot be started from here
  function otherWay(id){return k.leaf(id,[h('div',{class:'hint',text:t('other')}),h('div',{class:'row'},[h('button',{type:'button',text:t('other.go'),onclick:function(){go('bots.recipes')}})])],t('other.h'))}
  var lead=k.hint(ID+'.lead',t('lead'));
  // ---- greyed up front: Gates of Hell, MoW:AS2, no mod
  if(env.gid==='goh')return [k.section(ID,t('title'),[lead,na(ID+'.na',t('na.goh'),{why:t('na.goh.w'),use:t('na.goh.u'),game:gameN('goh')}),details(ID+'.details',[k.hint(ID+'.details.why',t('na.gohWhy'))])])];
  if(env.gid==='mowas2')return [k.section(ID,t('title'),[lead,na(ID+'.na',t('na.mowas2'),{why:t('na.mowas2.w'),use:t('na.mowas2.u'),game:gameN('mowas2')}),otherWay(ID+'.other'),details(ID+'.details',[k.hint(ID+'.details.why',t('na.mowas2Why'))])])];
  if(!env.mod)return [k.section(ID,t('title'),[lead,typeof k.needMod==='function'?k.needMod(ID+'.na'):na(ID+'.na',t('e.needmod'))])];

  var F=null,MAPS=[],MAPX=null,cur=null,polling=false;
  var state=h('div',{class:'hint',text:t('loading')}),mapState=h('div',{class:'hint'}),mapFolder=h('div',{class:'hint','data-mappick':'1'}),mapTech=h('div',{class:'hint','data-mappath':'1'}),out=h('div'),rep=h('div'),run=h('div',{class:'hint'});
  var mapIn=h('input',{type:'text',size:34,autocomplete:'off',placeholder:t('mapPh'),'aria-label':t('map')});
  var modeSel=h('select',{'aria-label':t('mode')}),aSel=h('select',{'aria-label':t('armyA')}),bSel=h('select',{'aria-label':t('armyB')});
  var dSel=h('select',{'aria-label':t('diff')}),nSel=h('select',{'aria-label':t('bots')}),minIn=h('input',{type:'number',min:1,max:60,value:'10',style:'width:5em','aria-label':t('minutes')});
  ['easy','normal','hard','heroic'].forEach(function(d){dSel.appendChild(opt(d,t('d.'+d),d==='normal'))});
  [1,2,3].forEach(function(n){nSel.appendChild(opt(String(n),String(n),n===2))});dSel.value='normal';nSel.value='2';
  var botsNote=h('div',{class:'hint'}),seatNote=h('div'),mapNote=h('div'),modeNote=h('div',{class:'hint'}),modeTech=h('div',{class:'hint'});
  var planBtn=h('button',{type:'button','data-preview':'1',text:sh('bots.btn.preview','plan'),title:t('planT'),onclick:function(){run1(false)}});
  var startBtn=h('button',{type:'button',class:'primary',text:t('start'),title:t('startT'),'data-launch':'1',onclick:function(){run1(true)}});
  var againBtn=h('button',{type:'button',text:t('mapsAgain'),onclick:function(){maps(true)}});
  // Stop: shown while a match runs; the same stop as Cancel in the job list
  var stopBtn=h('button',{type:'button','data-stop':'1',hidden:true,text:sh('bots.btn.stop','stop'),title:t('stopT'),onclick:function(){stopNow()}});
  function stopNow(){stopBtn.disabled=true;run.textContent=t('stopping');
   env.api('POST','botmatch/stop',{},function(e,j,x){if(e){stopBtn.disabled=false;run.textContent='';run.appendChild(errEl(e,x));return}if(j&&j.job)showJob(j.job);poll()},{what:t('stop')})}
  function lab(text,el){return h('label',{style:'display:inline-flex;gap:6px;align-items:center;margin-right:12px'},[h('span',{text:text}),el])}
  var mapRow=h('div',{class:'row'},[lab(t('map'),mapIn),againBtn]);
  // the map box: the game's map names (typed names accepted), history, Browse = the data folder at map/multi
  function folderOf(m){return String(m.key||'').split('/').pop()}
  // the map as people know it: the game's name, else the folder made readable (2v2_crossroads = 2v2 Crossroads); never the path
  function nice(f){return String(f||'').split('/').pop().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().split(' ').map(function(w){return /^\d/.test(w)?w:w.charAt(0).toUpperCase()+w.slice(1)}).join(' ')}
  function mapName(m){return m?(m.name||nice(folderOf(m))):''}
  function items(){return MAPS.map(function(m){var f=folderOf(m);return {label:mapName(m),value:m.key,hint:f+(m.players?'  '+t('players',{n:m.players}):''),group:m.mod||t('vanilla'),lo:((m.name||'')+' '+m.key).toLowerCase(),map:m}})}
  function keyOf(p){p=String(p||'').replace(/\\/g,'/');var i=p.toLowerCase().lastIndexOf('map/multi/');return i<0?p:p.slice(i).split('/').slice(0,3).join('/')}
  pick(mapIn,{key:'bots.botmatch.map',index:function(q,done){k.hitsOf(items(),q,function(r,n){noHits(q,r);done(r,n)})},browse:{mode:'dir',view:'data',start:'map/multi',toValue:keyOf},
   onPick:function(v){var m=mapOf(v);mapIn.value=m?mapName(m):v;choose(m,v)}});
  mapIn.addEventListener('change',function(){choose(mapOf(mapIn.value),mapIn.value)});
  // nothing found for what was typed: one plain line, what to try, and why a map may be missing (S19)
  function noHits(q,r){mapNote.textContent='';q=String(q||'').trim();if(!q||!MAPS.length||(r&&r.length))return;mapNote.appendChild(unknown(q))}
  function offOf(v){v=String(v||'').trim().toLowerCase();var key=keyOf(v).toLowerCase(),a=(MAPX&&MAPX.off)||[];if(!v)return null;
   for(var i=0;i<a.length;i++){var m=a[i];if(m.key.toLowerCase()===key||folderOf(m).toLowerCase()===v||String(m.name||'').toLowerCase()===v)return m}return null}
  function unknown(q){var off=offOf(q),other=(MAPX&&MAPX.other)||0;
   if(off)return errEl(P+'mapNoBots',{key:P+'mapNoBots',params:{map:off.name||folderOf(off)}});
   var nn=typeof k.none==='function'?k.none(t('mapTry')):null,kids=[nn&&typeof nn==='object'?nn:h('div',{text:nn||t('mapUnknown',{q:q})})];if(other)kids.push(h('div',{class:'hint',text:pl('mapOther',other,{n:other})}));
   return h('div',{class:'err','data-nomap':'1'},kids)}
  function mapOf(v){v=String(v||'').trim();if(!v)return null;var key=keyOf(v).toLowerCase(),lo=v.toLowerCase();
   for(var i=0;i<MAPS.length;i++){var m=MAPS[i];if(m.key.toLowerCase()===key||folderOf(m).toLowerCase()===lo||String(m.name||'').toLowerCase()===lo||mapName(m).toLowerCase()===lo)return m}return null}
  function fillModes(list){var was=modeSel.value;modeSel.textContent='';var best=null,pref=(F&&F.best)||'';
   list.forEach(function(m){if(!best&&m===pref)best=m;modeSel.appendChild(opt(m,modeName(m)))});
   if(list.indexOf(was)>=0)best=was;if(!best)list.forEach(function(m){var r=modeRow(m);if(!best&&(!r||r.orders!==false))best=m});if(best)modeSel.value=best}
  function allModes(){return ((F&&F.modes)||[]).filter(function(r){return r.bots}).map(function(r){return r.mode})}
  function choose(m,typed){cur=m;modeNote.textContent='';modeTech.textContent='';mapFolder.textContent='';mapTech.textContent='';mapNote.textContent='';
   if(!cur){fillModes(allModes());if(String(typed||'').trim())mapNote.appendChild(unknown(String(typed).trim()));modeNotes();seats();return}
   mapFolder.textContent=t('mapPicked',{name:mapName(cur)})+(cur.players?'  '+t('players',{n:cur.players}):'');mapTech.textContent=t('mapPath',{path:cur.key});
   fillModes(cur.modes);modeNotes();seats()}
  function modeNotes(){modeNote.textContent='';modeTech.textContent='';if(!modeSel.value)return;var am=cur&&cur.armyMode?cur.armyMode[modeSel.value]:(modeRow(modeSel.value)||{}).armyMode;
   modeNote.textContent=am==='team'?t('pinTeam'):t('pinNone');modeTech.textContent=modeSel.value+': '+(am==='team'?t('pinTeamWhy'):t('pinNoneWhy'));
   var mr=modeRow(modeSel.value);if(modeSel.value==='combat'||(mr&&mr.orders===false)){modeNote.textContent+=' '+t('combat',{mode:modeName(modeSel.value)});modeTech.textContent+=' '+t('combatWhy')}}
  modeSel.addEventListener('change',modeNotes);
  function botsNotes(){botsNote.textContent=nSel.value==='1'?t('oneBot'):pl('slots',+nSel.value);seats()}
  function need(){return +nSel.value>=2?4:2}
  function tooSmall(){if(!cur||!cur.players||cur.players>=need())return null;return {seats:cur.players,need:need()}}
  function seats(){seatNote.textContent='';if(!cur)return;var p=tooSmall();
   if(p){seatNote.appendChild(errEl(P+'e.small',{key:P+'e.small',params:p}));return}
   if(!cur.players)seatNote.appendChild(h('div',{class:'hint',text:t('seatsUnknown',{need:need()})}))}
  nSel.addEventListener('change',function(){out.textContent='';botsNotes()});botsNotes();
  function body(){return {name:cur?(cur.name||''):'',map:cur?cur.key:keyOf(mapIn.value),mode:modeSel.value,armyA:aSel.value,armyB:bSel.value,difficulty:dSel.value,bots:+nSel.value,minutes:+minIn.value,players:cur?cur.players:0}}
  function armyName(a){return (F&&F.labels&&F.labels[a])||(a&&typeof k.army==='function'?k.army(a):a)||'?'}
  function shortL(x,max){x=String(x||'').trim();max=max||28;if(x.length<=max)return x;var f=x.split(/\s+--?\s*|[.;:!?](?:\s|$)|\s\(/)[0].trim();if(f&&f.length<=max)return f;
   var c=x.slice(0,max+1),i=c.lastIndexOf(' ');return (i>8?c.slice(0,i):x.slice(0,max)).replace(/[\s,;:(\-]+$/,'')+'\u2026'}
  function armyOpt(a,sel){var l=armyName(a),o=opt(a,shortL(l),sel);if(shortL(l)!==l)o.setAttribute('title',l);return o}
  // ---- the greyed form when starting the game from here is switched off
  var form=null,offBox=h('div');
  // on: the form works at all; launch: Start too (with launching off the form stays usable for Show plan, Start is greyed)
  function inGame(){return !F||F.inGame!==false}
  function setForm(on,launch){if(!inGame())launch=false;[mapIn,modeSel,aSel,bSel,dSel,nSel,minIn,planBtn,againBtn].forEach(function(e){e.disabled=!on});if(!inGame())planBtn.disabled=true;startBtn.disabled=!(on&&launch);
   startBtn.style.opacity=on&&launch?'':'.5';if(form)form.style.opacity=on?'':'.55'}
  function playPage(){try{if(typeof show==='function')show('play')}catch(e){}
   var n=0;(function look(){var el=typeof document!=='undefined'&&document.querySelector?document.querySelector('[data-launchsw]'):null;
    if(el){try{el.scrollIntoView({block:'center'})}catch(e){}try{el.focus()}catch(e){}return}if(++n<20)setTimeout(look,150)})()}
  function drawOff(){offBox.textContent='';if(!F||F.launch)return;
   offBox.appendChild(h('div',{class:'err','data-launchoff':'1',text:t('launchOff')}));
   offBox.appendChild(h('div',{class:'row'},[h('button',{type:'button',class:'primary',text:t('launchOff.go'),onclick:playPage}),h('button',{type:'button',text:t('launchOff.again'),onclick:function(){load()}})]));
   offBox.appendChild(h('div',{class:'hint',text:t('other')}));
   offBox.appendChild(h('div',{class:'row'},[h('button',{type:'button',text:t('other.go'),onclick:function(){go('bots.recipes')}})]))}
  // ---- Show plan / Start
  function run1(launch,asked){out.textContent='';
   if(!cur&&!String(mapIn.value||'').trim()){out.appendChild(h('div',{class:'err',text:t('e.map')}));return}
   var small=tooSmall();if(small){out.appendChild(errEl(P+'e.small',{key:P+'e.small',params:small}));return}
   if(launch&&!asked){var b=body();ask({title:t('start'),lines:[pl('confirm',b.bots,{map:cur?mapName(cur):nice(b.map),mode:modeName(b.mode),m:b.minutes}),t('confirm2')],ok:t('start')}).then(function(y){if(y)run1(true,true)});return}
   out.appendChild(h('div',{class:'hint',text:t(launch?'starting':'planning')}));
   env.api('POST',launch?'botmatch/start':'botmatch/plan',body(),function(e,j,x){out.textContent='';
    if(e){out.appendChild(errEl(e,x));return}
    if(!launch){out.appendChild(h('div',{class:j.ok?'ok':'err',text:t(j.ok?'planOk':'planBad')}));
     if(j.pinned)out.appendChild(h('div',{class:'hint',text:t('pinned.'+j.pinned)}));
     var tech=[h('div',{text:t('steps')}),h('pre',{text:(j.scenario&&j.scenario.steps||[]).map(function(s){return s.cmd||(s.wait_stage?'wait_stage':s.wait?'wait '+s.wait+(s.timeout?' '+s.timeout+'s':''):JSON.stringify(s))}).join('\n')})];
     if(j.dry)tech.push(h('div',{text:t('dry')}),h('pre',{text:j.dry+(j.err?'\n'+j.err:'')}));
     out.appendChild(det(tech));return}
    out.appendChild(h('div',{class:'ok',text:t('started')}));poll()},{what:t('title')+': '+(launch?t('start'):sh('bots.btn.preview','plan'))})}
  function poll(){if(polling)return;polling=true;
   (function once(){env.api('GET','botmatch/status',{},function(e,j,x){
    if(e){polling=false;run.textContent='';run.appendChild(errEl(e,x));return}
    showJob(j);if(j.state==='running')later(once,3000);else polling=false})})()}
  // a repeated read waits while this page or the window is hidden (pollLater, page.js): one read when it is seen again
  function later(f,ms){return typeof pollLater==='function'?pollLater(env.page,f,ms):setTimeout(f,ms)}
  function showJob(j){run.textContent='';rep.textContent='';stopBtn.hidden=!(j&&j.state==='running');if(!j||j.state==='none')return;
   if(j.state==='running'){run.textContent=j.stopping?t('stopping'):t('running',{s:mmss(j.elapsed),m:j.minutes,map:j.name||nice(j.map),mode:modeName(j.mode)});startBtn.disabled=true;stopBtn.disabled=!!j.stopping;return}
   startBtn.disabled=!(F&&F.launch&&inGame());stopBtn.disabled=false;
   // stopped (the card's Stop or the job list's Cancel): a plain state, no report and no error
   if(j.state==='stopped'){out.textContent='';run.appendChild(stopEl(t('stopped',{map:j.name||nice(j.map),mode:modeName(j.mode)})));if(j.gameUp)run.appendChild(h('div',{class:'hint','data-gameup':'1',text:t('stoppedUp')}));return}
   if(j.state==='error'){run.appendChild(h('div',{class:'err',text:t('failed')}));run.appendChild(det([h('pre',{text:j.error||''})]));return}
   run.textContent=t('finished',{map:j.name||nice(j.map),mode:modeName(j.mode)});if(j.report)report(j.report)}
  function li(text,cls){return h('li',{class:cls||'',text:text})}
  // a long list: 8 rows, then Show all N (S10)
  function long(items){var ol=h('ol',{},items.slice(0,8));if(items.length<=8)return ol;
   var b=h('button',{type:'button','data-all':'1',text:t('showAll',{n:items.length}),onclick:function(){items.slice(8).forEach(function(x){ol.appendChild(x)});if(b.parentNode)b.parentNode.removeChild(b)}});
   return h('div',{},[ol,b])}
  // ---- the report: plain sentences first, the ordered lists, raw lines and IDs in Details
  function report(r){var kids=[],tech=[],names=r.names||{},labels=r.labels||(F&&F.labels)||{};
   function nm(c){return names[c]||names[String(c).toLowerCase()]||c}
   function an(a){return labels[a]||(a&&typeof k.army==='function'?k.army(a):a)||t('rep.armyUnknown')}
   if(!r.pipe)kids.push(h('div',{class:'err',text:t('rep.nopipe')}));
   (r.bots||[]).forEach(function(b){var all=b.bought||[],got=all.filter(function(x){return x.at!=null||x.na}).map(function(x){return nm(x.card)}),asked=all.filter(function(x){return x.at==null&&!x.na}).map(function(x){return nm(x.card)}),unk=all.filter(function(x){return x.na}).map(function(x){return nm(x.card)}),tm=(b.team||'?').toUpperCase(),p={army:an(b.army),team:tm,side:t(tm==='A'?'rep.side.you':tm==='B'?'rep.side.foe':'rep.side.other',{team:tm}),n:got.length,list:got.join(', ')};
    var ks=[h('div',{text:got.length?pl('rep.botBought',got.length,p):t('rep.botNothing',p)})];
    if(!got.length)ks.push(h('div',{class:'hint',text:t('rep.boughtNone')}));
    if(asked.length)ks.push(h('div',{class:'hint',text:t('rep.botAsked',{list:asked.join(', ')})}));
    if(unk.length)ks.push(h('div',{class:'hint',text:t('rep.botNa',{list:unk.join(', ')})}));
    if(b.never&&b.never.length)ks.push(h('div',{class:'hint',text:t('rep.botNever',{list:b.never.map(nm).join(', ')})}));
    else if(b.never)ks.push(h('div',{class:'hint',text:t('rep.neverNone')}));
    var bl=(b.bought||[]).map(function(x){var s=nm(x.card)+(nm(x.card)!==x.card?' ('+x.card+')':'')+'  '+(x.at!=null?t('rep.at',{t:mmss(x.at)}):x.na?t('rep.na'):x.asked?t('rep.notSeen'):'');if(x.asked>1)s+='  '+pl('rep.times',x.asked);if(x.seen>1)s+='  '+t('rep.most',{n:x.seen});return li(s)});
    ks.push(det([h('div',{text:t('rep.bought')+'  '+t('rep.army.'+(b.armyHow||'unknown'))}),bl.length?long(bl):h('div',{class:'hint',text:'-'}),b.never==null?h('div',{class:'hint',text:t('rep.noList')}):null]));
    kids.push(h('div',{class:'card','data-side':String(b.side)},ks))});
   if(!(r.bots||[]).length)kids.push(h('div',{class:'err',text:t('rep.noBots')}));
   var e=r.end;
   if(e){var win=e.winner?t('rep.won',{win:String(e.winner).toUpperCase()}):'';
    kids.push(h('div',{class:e.early?'err':'ok',text:t('rep.end',{t:mmss(e.at)})+(win?' '+win:'')}));
    if(e.early)kids.push(h('div',{class:'err',text:e.empty&&e.empty.length?t('rep.empty',{teams:e.empty.join(', ').toUpperCase()}):t('rep.early')}));
    tech.push(h('div',{class:'hint',text:t('rep.endHow',{how:e.how||'-'})+(e.early&&e.empty&&e.empty.length?' '+t('rep.emptyWhy'):'')}))}
   else kids.push(h('div',{class:'hint',text:r.pipe?t('rep.noEnd'):t('rep.unknownEnd')}));
   // issues: the plural form by n, a unit by its in-game name
   var iss=(r.issues||[]).map(function(x){var p={};Object.keys(x.p||{}).forEach(function(q){p[q]=x.p[q]});if(p.unit)p.unit=nm(p.unit);
    var k2=x.k;if(p.n!=null){var f=plf(p.n);if(known(x.k+f))k2=x.k+f}return li(tx(k2,p),'err')});
   (r.issues||[]).forEach(function(x){if(known(x.k+'.raw'))tech.push(h('div',{class:'hint',text:tx(x.k+'.raw',x.p||{})}))});
   (r.run||[]).forEach(function(x){iss.push(li(x.k&&known(x.k)?tx(x.k):t('rep.runOther'),'err'));tech.push(h('div',{class:'hint',text:x.code+': '+x.msg}))});
   if(iss.length)kids.push(h('div',{},[h('b',{text:t('rep.issues')}),h('ul',{},iss)]));
   var tr=(r.traps||[]).map(function(x){return li(tx(x),'hint')});
   if(tr.length)kids.push(h('div',{},[h('b',{text:t('rep.traps')}),h('ul',{},tr)]));
   tech.push(h('div',{class:'hint',text:pl('rep.samples',r.samples||0)}));
   if(r.archive)tech.push(h('div',{class:'hint',text:t('rep.archive',{dir:r.archive})}));
   kids.push(det(tech));
   kids.forEach(function(x){rep.appendChild(x)})}
  function load(){state.className='hint';state.textContent=t('loading');
   env.api('GET','botmatch/form',{},function(e,j,x){state.textContent='';
    if(e){state.className='';state.appendChild(errEl(e,x));setForm(false);return}
    F=j;
    if(j.na){state.className='';state.appendChild(h('div',{class:'err',text:t(j.kind==='goh'?'na.goh':'na.mowas2')}));setForm(false);return}
    setForm(true,!!j.launch);drawOff();
    if(j.inGame===false){state.className='';state.appendChild(errEl(P+'e.notInGame',{key:P+'e.notInGame'}))}
    aSel.textContent='';bSel.textContent='';(j.armies||[]).forEach(function(a,i){aSel.appendChild(armyOpt(a,i===0));bSel.appendChild(armyOpt(a,i===1||j.armies.length===1))});fillModes(allModes());modeNotes();if((j.armies||[]).length){aSel.value=j.armies[0];bSel.value=j.armies[1]||j.armies[0]}
    if(!(j.armies||[]).length)state.textContent=t('noArmies');
    if(j.job&&j.job.state!=='none'){showJob(j.job);if(j.job.state==='running')poll()}
    maps(false)})}
  function maps(again,poll2){if(!poll2)mapState.textContent=t('mapsLoading');   // poll2 = a re-ask while the list is read: a poll, not a job
   env.api('GET','botmatch/maps',again?{refresh:'1'}:{},function(e,j,x){
    if(e){mapState.textContent='';mapState.appendChild(errEl(e,x));return}
    if(j.state==='running'){mapState.textContent=t('mapsLoading')+' '+mmss(j.elapsed||0);later(function(){maps(false,true)},3000);return}
    if(j.stopped){mapState.textContent='';mapState.appendChild(stopEl(t('mapsStopped',{b:t('mapsAgain')})));return}
    if(j.state==='error'){mapState.textContent='';mapState.appendChild(errEl(j.error));return}
    MAPS=j.maps||[];MAPX=j;mapState.textContent=MAPS.length?pl('mapsN',MAPS.length,{n:MAPS.length,all:j.all||0}):t('mapsNone');if(mapIn.value)choose(mapOf(mapIn.value),mapIn.value)},poll2?{job:false}:undefined)}
  form=h('div',{blk:ID+'.form',box:'col','data-blkname':t('form.h')},[
   k.leaf(ID+'.map',[mapRow,mapNote,mapFolder,mapState,h('div',{class:'row'},[lab(t('mode'),modeSel)]),modeNote],t('map')),
   k.leaf(ID+'.armies',[h('div',{class:'row'},[lab(t('armyA'),aSel),lab(t('armyB'),bSel)]),h('div',{class:'hint','data-sides':'1',text:t('armyHint')})],t('armies')),
   k.leaf(ID+'.setup',[h('div',{class:'row'},[lab(t('diff'),dSel),lab(t('bots'),nSel),lab(t('minutes'),minIn)]),botsNote,seatNote,h('div',{class:'hint','data-proven':'1',text:t('proven')})],t('bots')),
   h('div',{class:'row',blk:ID+'.btns','data-blkname':t('start')},[planBtn,startBtn,stopBtn])]);
  setForm(false);
  load();
  return [k.section(ID,t('title'),[lead,
   k.leaf(ID+'.state',[state,offBox],t('state.h')),
   form,
   k.leaf(ID+'.out',[out,run,rep],t('rep.title')),
   details(ID+'.details',[k.hint(ID+'.details.how',t('how')),k.leaf(ID+'.details.map',[mapTech],t('map')),k.leaf(ID+'.details.mode',[modeTech],t('mode'))])])]}});
`;

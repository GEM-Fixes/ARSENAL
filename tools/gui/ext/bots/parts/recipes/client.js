// bots part "recipes", browser side: the card "Teach the bot new habits". Page rules (bots/script.js): no backtick, no dollar-brace,
// DOM only through h and textContent. Page standards S1-S9):
//   the nine habits are short tick rows (name + one line); a habit's numbers, notes and unit boxes show only while it is ticked, with
//   working defaults and the suggested value and range beside each box (S8, S3). Unit boxes and the rule's map box are searchKit boxes
//   with in-game names, attached after the box is in its row (S1). Preview = plain sentences of what the bot will do in a match, the
//   exact file change folded (S3); Write asks with the same sentences, then one green box: what changed, how to see it in the game, the
//   next step and Undo (exact bytes back, refused plainly when a file was changed since) (S4). Technical words, the MoW:AS2 match-end
//   note and file names sit in the Details fold (S2). Server refusals come as codes and are worded here (S6, S9). "No mod" greys the card
//   out up front (S7). GoH: the same card with its own habits program (server side); one lead line on where the habits work there, a
//   note under each ticked habit (goh.n.*), the rule map box reads mission/maps (no bot match there), GoH words for safety, files, next step. Shared frame helpers (kit.details, kit.more, kit.done, kit.na, kit.pick, bots.btn.*) are used when the
//   frame has them; the local fallbacks below use the same words.
// Author: Imperator_Aug (ARSENAL, ia-d92bdbb6)
module.exports = String.raw`
BOTS_PARTS.push({id:'recipes',group:'B',order:10,title:function(){return tx('bots.recipes.title')},draw:function(env){
 var K=env.kit,P='bots.recipes.',ID='bots.recipes';
 function t(k,p){return tx(P+k,p)}
 function known(k){return tx(k)!==k}
 function sh(k,own,p){return known(k)?tx(k,p):t(own,p)}
 function call(m,p,d,cb){try{env.api(m,p,d,cb)}catch(e){cb(String((e&&e.message)||e),null)}}
 function changed(){try{if(typeof BOTS_UI!=='undefined'&&BOTS_UI&&typeof BOTS_UI.changed==='function')BOTS_UI.changed('recipes')}catch(e){}}
 function go(id){try{if(env.go)env.go(id);else if(typeof BOTS_UI!=='undefined'&&BOTS_UI.go)BOTS_UI.go(id)}catch(e){}}
 // ---- shared helpers of the frame, else the same thing here
 function fold(label,kids,open){var d=h('details',{},[h('summary',{text:label})].concat(kids));if(open)d.open=true;return d}
 function details(id,kids){if(K.details)return K.details(id,kids);var l=sh('bots.details','details');return h('details',{blk:id,box:'col','data-blkname':l},[h('summary',{text:l})].concat(kids))}
 function more(id,kids){if(K.more)return K.more(id,kids);var l=sh('bots.more','more');return h('details',{blk:id,box:'col','data-blkname':l},[h('summary',{text:l})].concat(kids))}
 function na(id,text){if(K.na)return K.na(id,text);return K.leaf(id,[h('div',{class:'hint','data-na':'1',style:'opacity:.8',text:text})])}
 function plain(n){return n&&!(n.getAttribute&&n.getAttribute('data-blk'))}
 function pick(inp,o){if(K.pick)return K.pick(inp,o);if(typeof searchKit==='function')return searchKit(inp,o)}
 function page(id){try{if(typeof show==='function')show(id)}catch(e){}}
 // one name per game, army and unit kind: the frame's when it has them (kit.game / kit.army / kit.kind), else the same words here
 var GN={as64:'AS64',mowas2:'MoW:AS2',goh:'Gates of Hell'};
 function gameName(g){var s=typeof K.game==='function'?K.game(g):'';return s&&s!==g?String(s):(GN[g]||String(g||''))}
 function kindName(k){var s=typeof K.kind==='function'?K.kind(k):'';if(s&&s!==k)return String(s);return known('bots.kind.'+k)?tx('bots.kind.'+k):''}
 // the one "Undone: <what>." line of the page (kit.undone), drawn where the done box is
 function undoneEl(){var el=typeof K.undone==='function'?K.undone(t('undo.what')):null;if(typeof el==='string')el=h('div',{class:'ok',role:'status','data-undone':'1',text:el});
  return el||h('div',{class:'ok',role:'status','data-undone':'1',text:t('undo.done')})}
 var OTHER=env.gid==='mowas2',GOH=env.gid==='goh';
 // GoH: where each habit works there (the server's meta.goh says the same)
 var GNOTE={attack:'bz',fallback:'bz',front:'bz',replace:'all',tanks:'tanks',save:'all',phases:'all',cap:'all',log:'log'};
 // the button names as the page shows them, for sentences that name them (S14)
 var BW={preview:sh('bots.btn.preview','b.preview'),write:sh('bots.btn.write','b.write')};
 // plural forms (S14): the frame's kit.n, else the same forms here: key.one / key.few / key.many / key.other, then key
 function pl(k,n,p){if(typeof K.n==='function')return K.n(n,P+k,p);var q={},x;for(x in (p||{}))q[x]=p[x];q.n=n;
  var L=typeof LANG!=='undefined'?String(LANG):'en',a=Math.abs(+n||0),f,d=a%10,e=a%100;
  if(L==='zh')f='other';else if(L==='ru'||L==='uk')f=a%1?'other':d===1&&e!==11?'one':d>=2&&d<=4&&(e<12||e>14)?'few':'many';else f=a===1?'one':'other';
  return known(P+k+'.'+f)?t(k+'.'+f,q):t(k,q)}
 // the mod by its folder name in sentences (S11); the full path stays in the frame's Details
 function folder(p){var a=String(p||'').replace(/[\\/]+$/,'').split(/[\\/]/);return a[a.length-1]||String(p||'')}
 // the next step of each refusal, as a button (S12)
 var NEXT={'e.needmod':['go.mods','mods'],'e.nomod':['go.mods','mods'],'e.inGame':['go.mods','mods'],'e.guard':['go.mods','mods'],'e.nogame':['go.settings','settings']};
 // a server refusal: the code (the frame's third callback value, or the message) worded here with its next step; a file name and the
 // raw words in Details; words the frame already said as they are; anything else one sentence of what to do, raw text folded
 function errBox(m,x){var s=String(m||''),key=x&&x.key?String(x.key):'',p=(x&&x.params)||{},c=/^((?:bots|maps|modes)\.[A-Za-z0-9_.]+)(?: (\{.*\}))?$/.exec(s);
  if(!key&&c){key=c[1];try{p=c[2]?JSON.parse(c[2]):{}}catch(e){p={}}}
  if(key&&known(key)){var kids=[h('div',{text:tx(key,p)})],nx=NEXT[key.replace(P,'')],raw=[];
   if(nx)kids.push(h('div',{class:'row'},[h('button',{type:'button',class:'primary','data-next':nx[1],text:t(nx[0]),onclick:function(){page(nx[1])}})]));
   if(p.rel)raw.push(h('div',{class:'hint',text:String(p.rel)}));if(p.m)raw.push(h('pre',{text:String(p.m)}));
   if(raw.length)kids.push(fold(sh('bots.details','details'),raw));return h('div',{class:'err'},kids)}
  if(!x&&s&&!c&&!/^(Error|[A-Z]{3,}\b|HTTP )/.test(s))return h('div',{class:'err',text:s});
  return h('div',{class:'err'},[h('div',{text:t('e.other')}),h('div',{class:'row'},[h('button',{type:'button','data-next':'again',text:t('b.again'),onclick:function(){res.textContent='';loadState(false)}})]),
   fold(sh('bots.details','details'),[h('pre',{text:String((x&&x.message)||s)})])])}
 if(!env.mod&&typeof K.needMod==='function')return [K.section(ID,t('title'),[K.needMod(ID+'.na')])];
 if(!env.mod)return [K.section(ID,t('title'),[na(ID+'.na',t('needmod')),K.leaf(ID+'.go',[h('div',{class:'row'},[h('button',{type:'button',class:'primary','data-next':'mods',text:t('go.mods'),onclick:function(){page('mods')}})])],t('go.mods'))])];
 // the habits in page order: numbers [key, default, min, max] (the server checks and clamps them again)
 var HABITS=[
  {id:'attack',nums:[['size',4,1,30],['wait',5,1,30]]},
  {id:'fallback',nums:[['every',4,1,60],['hold',60,10,600]],note:true},
  {id:'front',nums:[['any',20,0,100]],note:true},
  {id:'replace',nums:[['confirm',20,2,300],['max',10,0,200]],note:true},
  {id:'tanks',nums:[['every',2,1,20]],units:true},
  {id:'save',nums:[['income',3,0,100],['every',5,1,60],['wait',120,10,900]],units:true,note:true},
  {id:'phases',nums:[['share',100,0,100]],rules:true},
  {id:'cap',nums:[['max',12,1,200]],note:true},
  {id:'log',nums:[]}];
 var DIFFS=['','easy','normal','hard','heroic'];
 var st=null,last=null,state=null,R={};
 function copy(o){return JSON.parse(JSON.stringify(o))}
 function key(){return JSON.stringify(st)}

 // ---- unit names for the searchKit index (in-game name, card name, army): asked once per draw
 var UIX=null,UW=[],AL={};
 function unitItems(cb){if(UIX){cb(UIX);return}UW.push(cb);if(UW.length>1)return;
  call('GET','recipes/units',null,function(err,r,ex){var seen={},out=[];AL=(!err&&r&&r.armies)||{};((!err&&r&&r.units)||[]).forEach(function(u){var k=u.army+'|'+u.unit;if(!u.unit||seen[k])return;seen[k]=1;
   var an=armyName(u.army||''),kn=u.kind&&kindName(u.kind)?kindName(u.kind)+'  ':'';out.push({label:u.name||u.unit,value:u.unit,hint:kn+(u.name?u.unit+'  ':'')+an,army:u.army,name:u.name||'',lo:((u.name||'')+' '+u.unit+' '+u.army+' '+an).toLowerCase()})});
   UIX=out;var w=UW;UW=[];w.forEach(function(f){f(out)})})}
 function uname(u){if(UIX)for(var i=0;i<UIX.length;i++)if(UIX[i].value===u.unit&&(!u.army||UIX[i].army===u.army)&&UIX[i].name)return UIX[i].name;return u.unit}
 function armyName(a){if(AL[a])return AL[a];var s=a&&typeof K.army==='function'?K.army(a):'';return s&&s!==a?String(s):a}
 function unitsText(list){var seen={},out=[];(list||[]).forEach(function(u){var n=uname(u);if(!seen[n]){seen[n]=1;out.push(n)}});return out.join(', ')||t('u.noneShort')}
 var UBR={mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}};

 // a unit list editor: a searchKit box (in-game names), Add, the picked units as chips with a remove button each
 function unitBox(label,hkey,get){
  var inp=h('input',{type:'text',autocomplete:'off','aria-label':label,placeholder:t('u.ph'),size:'26'});
  var list=h('div',{class:'row'});
  function put(v,army){v=String(v||'').trim();if(!v)return;var a=get();
   if(a.some(function(x){return x.unit===v&&(x.army||'')===(army||'')}))return;a.push({unit:v,army:army||''});inp.value='';draw();dirty()}
  // typed text: a card name, or an in-game name of the index
  function typed(){var v=inp.value.trim(),lo=v.toLowerCase(),hit=null;if(!v)return;
   (UIX||[]).forEach(function(it){if(!hit&&(it.value===v||(it.name&&it.name.toLowerCase()===lo)))hit=it});put(hit?hit.value:v,hit?hit.army:null)}
  var add=h('button',{type:'button',text:t('u.add'),onclick:typed});
  function draw(){list.textContent='';var a=get();
   if(!a.length){list.appendChild(h('span',{class:'hint',text:t('u.none')}));return}
   a.forEach(function(u,i){var n=uname(u);list.appendChild(h('span',{class:'chip',title:u.unit},[n+(u.army?' ('+armyName(u.army)+')':'')+' ',
    h('button',{type:'button',class:'sk-x','aria-label':t('u.rm',{unit:n}),title:t('u.rm',{unit:n}),text:String.fromCharCode(215),onclick:function(){get().splice(i,1);draw();dirty()}})]))})}
  var box=h('div',{},[h('div',{class:'row'},[h('span',{text:label}),inp,add]),list]);
  // the box is in its row now: the kit's Browse, History and list sit beside it
  pick(inp,{key:'bots.recipes.'+hkey,index:function(s,done){unitItems(function(a){K.hitsOf(a,s,done)})},browse:UBR,
   onPick:function(v,it,from){put(v,from==='browse'?'':(it&&it.army))}});
  draw();
  return {el:box,draw:draw}}

 // the unit after each number box: minutes, seconds, squads, times, buys, points a second, per cent
 var UNIT={'attack.size':'sq','attack.wait':'min','fallback.every':'min','fallback.hold':'s','front.any':'pct','replace.confirm':'s','replace.max':'times',
  'tanks.every':'buys','save.income':'pps','save.every':'min','save.wait':'s','phases.share':'pct','cap.max':'sq'};
 function unitWord(u,v){var x=parseFloat(String(v==null?'':v).replace(',','.'));if(isNaN(x))x=0;return pl('unit.'+u,x,{})}
 function numBox(id,hid,n){var inp=h('input',{type:'text',size:'5',inputmode:'decimal',autocomplete:'off',title:t('range',{d:n[1],a:n[2],b:n[3]})});
  var u=UNIT[hid+'.'+n[0]]||'',uw=h('span',{'data-unit':u,text:''});
  function sync(){uw.textContent=u?' '+unitWord(u,inp.value===''?n[1]:inp.value):''}
  inp.addEventListener('input',function(){sync();if(st){st[hid][n[0]]=inp.value.trim();dirty()}});sync();
  return {el:fld(id,t('n.'+hid+'.'+n[0]),inp,{after:h('span',{},[uw,h('span',{class:'hint',text:'  '+t('range',{d:n[1],a:n[2],b:n[3]})})])}),inp:inp,sync:sync}}

 // ---- maps for the rule's map box: the maps with a bots mode (Try a bot match reads them; the first read can take a while)
 var MIX=null,MW=[];
 function mapItems(cb){if(MIX){cb(MIX);return}MW.push(cb);if(MW.length>1)return;var tries=0;
  (function ask(){call('GET',GOH?'mission/maps':'botmatch/maps',null,function(err,r,ex){
   if(!err&&r&&r.state==='running'&&++tries<40){if(typeof pollLater==='function')pollLater(env.page,ask,3000);else setTimeout(ask,3000);return}   // waits while this page or the window is hidden
   var out=[];((!err&&r&&r.maps)||[]).forEach(function(m){var f=String(m.key||'').split('/').pop();if(!f)return;out.push({label:m.name||f,value:f,hint:m.key,lo:((m.name||'')+' '+m.key).toLowerCase()})});
   MIX=out;var w=MW;MW=[];w.forEach(function(f){f(out)})})})()}
 // ---- rules of the "units per map, difficulty or time" habit
 var rulesBox=h('div');
 function drawRules(){rulesBox.textContent='';if(!st)return;var rules=st.phases.rules;
  if(!rules.length)rulesBox.appendChild(h('div',{class:'hint',text:t('r.none')}));
  rules.forEach(function(r,i){
   function txt(k,lab,sz,num){var e=h('input',{type:'text',size:sz,autocomplete:'off','aria-label':lab,inputmode:num?'numeric':null,value:r[k]==null?'':String(r[k])});e.addEventListener('input',function(){r[k]=e.value;dirty()});return {el:h('label',{class:'f'},[h('span',{class:'n',text:lab}),e]),inp:e}}
   var ds=h('select',{'aria-label':t('r.diff')},DIFFS.map(function(d){return h('option',{value:d,text:d?t('d.'+d):t('d.any')})}));ds.value=r.difficulty||'';
   ds.addEventListener('change',function(){r.difficulty=ds.value;dirty()});
   var ub=unitBox(t('r.units'),'rule',function(){return r.units});
   var mp=txt('map',t('r.map'),'22');mp.inp.setAttribute('placeholder',t('r.mapPh'));
   rulesBox.appendChild(h('div',{class:'card'},[h('b',{text:t('r.n',{n:i+1})}),
    h('div',{class:'row'},[mp.el,h('label',{class:'f'},[h('span',{class:'n',text:t('r.diff')}),ds]),txt('from',t('r.from'),'4',1).el,txt('to',t('r.to'),'4',1).el,txt('name',t('r.name'),'14').el]),
    ub.el,h('div',{class:'row'},[h('button',{type:'button',text:t('r.del'),onclick:function(){rules.splice(i,1);drawRules();dirty()}})])]));
   pick(mp.inp,{key:'bots.recipes.rulemap',index:function(s,done){mapItems(function(a){K.hitsOf(a,s,done)})},browse:{mode:'dir',view:'data',start:'map/multi',toValue:function(p){return String(p||'').replace(/\\/g,'/').replace(/\/+$/,'').split('/').pop()}},
    onPick:function(v){mp.inp.value=v;r.map=v;dirty()}})});
  rulesBox.appendChild(h('div',{class:'row'},[h('button',{type:'button',text:t('r.add'),onclick:function(){rules.push({name:'',map:'',difficulty:'',from:0,to:0,units:[]});drawRules();dirty()}})]))}

 // ---- one habit: a tick row (name + one line); its numbers, note and units only while it is ticked
 function habit(H){var bid=ID+'.h.'+H.id,name=t('h.'+H.id+'.t'),r={nums:{}};
  var cb=h('input',{type:'checkbox',id:'bots-recipes-'+H.id});
  var kids=[];
  if(GOH)kids.push(K.hint(bid+'.goh',t('goh.n.'+GNOTE[H.id])));
  if(H.note)kids.push(K.hint(bid+'.note',t('h.'+H.id+'.note')));
  if(H.id==='replace')kids.push(K.leaf(bid+'.payback',[h('div',{class:'hint','data-payback':'1'},[h('span',{class:'bots-term','data-term':'payback',title:t('payback'),tabindex:'0',style:'text-decoration:underline dotted;cursor:help',text:t('paybackWord')}),': '+t('paybackSee')])],t('paybackWord')));
  r.sync=[];H.nums.forEach(function(n){var b=numBox(bid+'.n.'+n[0],H.id,n);r.nums[n[0]]=b.inp;r.sync.push(b.sync);kids.push(b.el)});
  if(H.units){var ub=unitBox(t('u.'+H.id),H.id,function(){return st?st[H.id].units:[]});r.units=ub;kids.push(K.leaf(bid+'.units',[ub.el],t('u.'+H.id)))}
  if(H.rules)kids.push(K.leaf(bid+'.rules',[rulesBox],t('r.h')));
  var opts=kids.length?h('div',{blk:bid+'.opts',box:'col','data-blkname':t('opts',{name:name}),style:'margin-left:22px'},kids):null;
  function show(){if(opts)opts.hidden=!cb.checked}
  cb.addEventListener('change',function(){if(st){st[H.id].on=!!cb.checked;show();dirty()}});r.cb=cb;r.show=show;r.tried=h('span',{class:'hint','data-untried':H.id});
  R[H.id]=r;
  return h('div',{blk:bid,box:'col','data-blkname':name},[K.leaf(bid+'.on',[h('div',{class:'row'},[cb,h('label',{for:'bots-recipes-'+H.id},[h('b',{text:name}),h('span',{class:'hint',text:'  '+t('h.'+H.id+'.d')}),r.tried])])],name),opts])}
 function setAll(){HABITS.forEach(function(H){var r=R[H.id],s=st[H.id];r.cb.checked=!!s.on;r.show();
  H.nums.forEach(function(n){r.nums[n[0]].value=String(s[n[0]]==null?n[1]:s[n[0]])});r.sync.forEach(function(f){f()});if(r.units)r.units.draw()});drawRules()}

 // ---- what the bot will do: one plain sentence per ticked habit, from the settings the server checked
 function sentences(s){var out=[];
  HABITS.forEach(function(H){var x=s[H.id];if(!x||!x.on)return;var p={};H.nums.forEach(function(n){p[n[0]]=x[n[0]]});
   if(H.units)p.units=unitsText(x.units);
   if(H.rules){p.n=x.rules.length;var rs=x.rules.map(function(r,i){return t('say.rule',{n:i+1,map:r.map||t('r.anyMap'),diff:r.difficulty?t('d.'+r.difficulty):t('d.any'),from:r.from,to:r.to?r.to:t('r.end'),units:unitsText(r.units)})});
    out.push(pl('say.phases',x.rules.length,p)+(rs.length?' '+rs.join(' '):''));return}
   var cnt=H.id==='replace'||H.id==='cap'?x.max:H.id==='attack'?x.size:null;
   out.push(cnt!=null?pl('say.'+H.id,+cnt,p):t('say.'+H.id,p))});
  return out}
 function ticked(s){return HABITS.filter(function(H){return s[H.id]&&s[H.id].on}).length}

 // ---- status, buttons, results
 var stat=h('div',{},[h('div',{class:'hint',text:t('loading')})]),proofEl=h('div',{class:'hint'}),res=h('div'),logBox=h('div'),proofNote=h('div',{class:'hint'}),proofHowEl=h('div',{class:'hint',text:t('proofHow')});
 var bPrev=h('button',{type:'button',class:'primary',text:sh('bots.btn.preview','b.preview'),disabled:true,onclick:function(){preview()}});
 var bWrite=h('button',{type:'button',class:'danger',text:sh('bots.btn.write','b.write'),disabled:true,onclick:function(){writeAsk()}});
 var bUndo=h('button',{type:'button','data-undo':'1',text:sh('bots.btn.undo','b.undo'),title:t('b.undoNone'),disabled:true,onclick:function(){undoLast()}});
 function canUndo(v){bUndo.disabled=!v;bUndo.setAttribute('title',v?t('b.undoT'):t('b.undoNone'))}
 var bRm=h('button',{type:'button',text:sh('bots.btn.reset','b.remove'),title:t('b.removeT'),disabled:true,onclick:function(){removeAsk()}});
 var bLog=h('button',{type:'button',text:t('b.log'),onclick:function(){showLog()}});
 bPrev.disabled=true;bWrite.disabled=true;bRm.disabled=true;
 function dirty(){if(last&&last!==key()){bWrite.disabled=true;res.textContent='';res.appendChild(h('div',{class:'hint',text:t('changed',BW)}))}}
 function ask(title,lines,ok,cb){(typeof askDo==='function'?askDo({title:title,lines:lines,where:folder(env.mod),ok:ok,danger:true}):{then:function(f){f(confirm(lines.join(' ')))}}).then(function(yes){if(yes)cb()},function(){})}
 function where(w){var m=/^phases:(\d+)$/.exec(w||'');if(m)return t('h.phases.t')+', '+t('r.n',{n:m[1]});return w?t('h.'+w+'.t'):''}
 function warnLine(w){return t('w.'+w.code,{unit:uname({unit:w.unit||'',army:w.army}),army:armyName(w.army||''),armies:String(w.armies||'').split(' ').map(armyName).join(', '),where:where(w.where)})}
 // warnings a beginner acts on stay in sight; the ones about files go into the exact file change
 var TECH={mainCopy:1,mainStock:1,noIndex:1,noDocs:1,gohNoDocs:1};
 function fileLine(f){return f.rel+': '+t('act.'+f.action)}
 function diffBox(f){if(!f.diff||!f.diff.length)return null;
  return fold(t('diff.show',{rel:f.rel}),[h('pre',{text:f.diff.map(function(d){return (d.t==='~'?'  ... ':d.t+' ')+d.s}).join('\n')})])}
 function exact(r){var kids=[h('ul',{},r.files.map(function(f){return h('li',{text:fileLine(f)})}))];
  r.files.forEach(function(f){var d=diffBox(f);if(d)kids.push(d)});
  (r.warn||[]).forEach(function(w){if(TECH[w.code])kids.push(h('div',{class:'hint',text:warnLine(w)}))});
  return fold(sh('bots.showChange','exact'),kids)}
 function warns(r,el){(r.warn||[]).forEach(function(w){if(!TECH[w.code])el.appendChild(h('div',{class:'err',text:warnLine(w)}))})}
 function sayList(s){var a=sentences(s);return a.length?h('ul',{},a.map(function(x){return h('li',{text:x})})):h('div',{text:t('say.none')})}
 function preview(){if(!st)return;var k=key();res.textContent='';res.appendChild(h('div',{class:'hint',text:t('previewing')}));
  call('POST','recipes/preview',{settings:st},function(err,r,ex){if(err){res.textContent='';res.appendChild(errBox(err,ex));bWrite.disabled=true;return}
   unitItems(function(){res.textContent='';
    if(k!==key()){res.appendChild(h('div',{class:'hint',text:t('changed',BW)}));return}
    var ch=r.files.filter(function(f){return f.action!=='same'});
    if(!ch.length){res.appendChild(h('div',{class:'ok',text:t('res.none')}));warns(r,res);last=null;bWrite.disabled=true;return}
    res.appendChild(h('b',{text:t('will')}));res.appendChild(sayList(r.settings));warns(r,res);
    // something to look at after the match: the log habit, suggested once when habits are ticked without it
    if(ticked(r.settings)&&!(r.settings.log&&r.settings.log.on))res.appendChild(h('div',{class:'hint','data-tiplog':'1'},[t('tipLog')+' ',h('button',{type:'button',text:t('tipLog.do'),onclick:function(){if(!st)return;st.log.on=true;setAll();dirty();preview()}})]));
    res.appendChild(h('div',{class:'hint',text:t('onlyMod')}));res.appendChild(exact(r));
    last=k;bWrite.disabled=false})})}
 // the green box after a write, a reset or an undo: what changed, how to see it, the next step, Undo (kit.done when the frame has it)
 function doneBox(o){var n=K.done?K.done(ID+'.done',o):null;if(plain(n))return n;
  var row=h('div',{class:'row'},(o.next||[]).map(function(x){return h('button',{type:'button',class:'primary',text:x.text,onclick:function(){go(x.go)}})}));
  var kids=[h('b',{text:o.title||''})];if((o.lines||[]).length)kids.push(h('ul',{},o.lines.map(function(l){return h('li',{text:String(l)})})));
  if(o.see)kids.push(h('div',{class:'hint',text:sh('bots.done.see','seeH')+' '+String(o.see)}));
  return h('div',{class:'ok','data-done':'1'},kids.concat([row]))}
 // a button into the done box's button row (the frame's box or the local one)
 function addTo(box,b){var rows=(box.querySelectorAll?Array.prototype.slice.call(box.querySelectorAll('div.row')):[]).filter(function(x){return x.className==='row'});
  if(!rows.length&&box.all)rows=box.all().filter(function(x){return x.tagName==='DIV'&&x.className==='row'});
  (rows.length?rows[rows.length-1]:box).appendChild(b)}
 // the log: open More options and read the newest bot log
 function openLog(){var d=moreEl;if(d&&d.tagName!=='DETAILS'&&d.querySelector)d=d.querySelector('details')||d;if(d&&d.tagName==='DETAILS')d.open=true;showLog();try{logBox.scrollIntoView({block:'nearest'})}catch(e){}}
 function writeAsk(){if(!st||last!==key())return;var s=st,n=ticked(s);
  var lines=n?[pl('ask.write',n,{p:folder(env.mod)})].concat(sentences(s)):[t('ask.writeNone',{p:folder(env.mod)})];
  ask(sh('bots.btn.write','b.write'),lines,sh('bots.btn.write','b.write'),function(){var k=key();
   call('POST','recipes/write',{settings:st},function(err,r,ex){res.textContent='';if(err){res.appendChild(errBox(err,ex));return}
    if(k===key()){st=copy(r.settings);setAll()}last=null;bWrite.disabled=true;
    var on=r.settings.log&&r.settings.log.on,a=sentences(r.settings);
    var see=t(GOH?'goh.see':'done.see')+(on?' '+t('done.log'):'');
    var db=doneBox({title:a.length?pl('done.head',a.length,{}):t('done.headNone'),lines:a,see:see,next:GOH?[]:[{text:t('done.next'),go:'bots.botmatch'}],rels:relsOf(r)});
    if(on)addTo(db,h('button',{type:'button','data-log':'1',text:t('b.log'),onclick:function(){openLog()}}));
    res.appendChild(db);
    warns(r,res);res.appendChild(exact(r));canUndo(!!r.undo);changed();loadState(true)})})}
 function removeAsk(){res.textContent='';
  call('POST','recipes/remove',{write:false},function(err,r,ex){if(err){res.appendChild(errBox(err,ex));return}
   if(!r.files.length){res.appendChild(h('div',{class:'hint',text:t('rm.none')}));var kp=r.keep||[];
    if(kp.length){res.appendChild(h('div',{class:'hint',text:t('rm.keepSome')}));res.appendChild(fold(sh('bots.details','details'),kp.map(function(k){return h('div',{class:'hint',text:t('rm.keep',{rel:k})})})))}return}
   ask(sh('bots.btn.reset','b.remove'),[t('ask.remove')],sh('bots.btn.reset','b.remove'),function(){
    call('POST','recipes/remove',{write:true},function(err2,r2,ex2){res.textContent='';if(err2){res.appendChild(errBox(err2,ex2));return}
     res.appendChild(doneBox({title:t('rm.done'),lines:[],see:t('rm.see'),next:[],rels:relsOf(r2)}));
     res.appendChild(fold(sh('bots.showChange','exact'),[h('ul',{},r2.files.map(function(f){return h('li',{text:fileLine(f)})}))].concat((r2.keep||[]).map(function(k){return h('div',{class:'hint',text:t('rm.keep',{rel:k})})}))));
     last=null;bWrite.disabled=true;canUndo(!!r2.undo);changed();loadState(false)})})})}
 // S18: one Undo state per file: the green box names its files (it goes when one of them is undone anywhere), an undo here tells the frame
 function relsOf(r){return ((r&&r.files)||[]).map(function(f){return f.rel}).filter(Boolean)}
 function syncUndo(r){var rs=relsOf(r);if(rs.length&&typeof K.undoSync==='function')try{K.undoSync(rs)}catch(e){}}
 function undoLast(){res.textContent='';res.appendChild(h('div',{class:'hint',text:t('undoing')}));
  call('POST','recipes/undo',{},function(err,r,ex){res.textContent='';if(err){res.appendChild(errBox(err,ex));return}
   canUndo(false);last=null;bWrite.disabled=true;syncUndo(r);
   res.appendChild(undoneEl());
   res.appendChild(fold(sh('bots.showChange','exact'),[h('ul',{},(r.files||[]).map(function(f){return h('li',{text:f.rel+': '+t('act.'+f.action)})}))]));
   changed();loadState(false)})}
 function showLog(){logBox.textContent='';logBox.appendChild(h('div',{class:'hint',text:t('logReading')}));
  call('GET','recipes/log',null,function(err,r,ex){logBox.textContent='';if(err){logBox.appendChild(errBox(err,ex));return}
   if(!r.files||!r.files.length){logBox.appendChild(h('div',{class:'hint',text:t('log.none')}));if(r.dir)logBox.appendChild(fold(sh('bots.details','details'),[h('div',{class:'hint',text:t('log.dir',{p:r.dir})})]));return}
   var pre=h('pre'),row=h('div',{class:'row'});
   function pick1(f){pre.textContent=f.lines.join('\n');head.textContent=t('log.file',{name:f.name,when:new Date(f.mtime).toLocaleString()})+(f.more?' '+pl('log.more',f.more):'')}
   var head=h('b');
   if(r.files.length>1)r.files.forEach(function(f){row.appendChild(h('button',{type:'button',text:f.name,onclick:function(){pick1(f)}}))});
   logBox.appendChild(row);logBox.appendChild(head);logBox.appendChild(pre);if(r.dir)logBox.appendChild(fold(sh('bots.details','details'),[h('div',{class:'hint',text:t('log.dir',{p:r.dir})})]));pick1(r.files[0])})}
 // the status line; the MoW:AS2 match-end note lives in Details, said once
 var SHOWN={ownBot:1,mainNoBot:1,readErr:1,runOlder:1,runForeign:1,gohNoMain:1};
 function drawStatus(){stat.textContent='';var s=state,f=s.files;
  var any=f.data.has||f.run.has||f.main.hooked;
  stat.appendChild(h('div',{class:s.installed?'ok':'hint',text:t(s.installed?'status.on':any?'status.partial':'status.off')}));
  (s.warn||[]).forEach(function(w){if(SHOWN[w])stat.appendChild(h('div',{class:'err',text:t('w.'+w,{m:s.readErr||''})}))});
  var pr=s.proof||{},un=pr.untried||[];var gm={game:gameName(env.gid),tried:gameName('as64')};proofEl.textContent=pr.proven?t(OTHER?'proven.other':'proven',gm):t('untested');proofHowEl.textContent=t(pr.proven?'proven.how':'proofHow',{r:pr.report||''});
  var tried=HABITS.filter(function(H){return un.indexOf(H.id)<0}).map(function(H){return t('h.'+H.id+'.t')}),untried=un.map(function(id){return t('h.'+id+'.t')});
  proofNote.textContent=pr.proven?t('proofTried',{list:tried.join(', ')})+(untried.length?' '+t('proofUntried',{list:untried.join(', ')}):'')+(OTHER?' '+t('proofOther',gm):''):'';
  HABITS.forEach(function(H){var r=R[H.id];if(r&&r.tried)r.tried.textContent=pr.proven&&un.indexOf(H.id)>=0?'  '+t(OTHER?'untried.other':'untried'):''});
  bRm.disabled=!any}
 function loadState(keepSettings){
  call('GET','recipes/state',null,function(err,r,ex){if(err){stat.textContent='';stat.appendChild(errBox(err,ex));return}
   if(!r.settings){stat.textContent='';stat.appendChild(h('div',{class:'hint',text:t('e.other')}));return}
   state=r;if(!keepSettings||!st){st=copy(r.settings);setAll()}drawStatus();bPrev.disabled=false;if(r.canUndo!=null)canUndo(!!r.canUndo)})}

 var habitBlocks=HABITS.map(habit);
 var moreEl=more(ID+'.more',[K.leaf(ID+'.log',[h('div',{class:'row'},[bLog]),logBox],t('log.h'))]);
 var card=K.section(ID,t('title'),[K.hint(ID+'.lead',t('lead',BW)),GOH?K.hint(ID+'.goh',t('goh')):null,
  K.leaf(ID+'.where',[h('div',{class:'row'},[h('span',{class:'hint',text:t('where')}),h('button',{type:'button',text:t('where.go'),onclick:function(){go('group.E')}})])],t('where.h')),
  K.leaf(ID+'.status',[stat,proofEl],t('status.h')),
  h('div',{blk:ID+'.habits',box:'col','data-blkname':t('habits.h')},habitBlocks),
  h('div',{class:'row',blk:ID+'.btns','data-blkname':t('btns.h')},[bPrev,bWrite,bUndo,bRm]),
  K.leaf(ID+'.res',[res],t('res.h')),
  moreEl,
  details(ID+'.details',[K.hint(ID+'.details.safe',t(GOH?'goh.safe':'safe')),K.hint(ID+'.details.files',t(GOH?'goh.files':'files')),GOH?K.hint(ID+'.details.goh',t('gohWhy')):null,K.leaf(ID+'.details.proof',[proofHowEl,proofNote],t('proofH'))])]);
 loadState(false);
 return [card]}});
`;

// Bots page part "stages", browser side. Page rules (bots/script.js): no backtick, no dollar-brace, DOM only through h() and textContent.
// Two cards: "Edit what bots buy, stage by stage" and "Where bots go". Every edit is an op kept in KEEP (per mod, so a page redraw keeps the
// pending edits); after each op the server runs them all on the bot list (stages/preview) and the card draws the result, the change list
// and the line diff (folded; removed lines before added ones). Write asks with the same count, writes, shows a green box (what bots now do,
// how to see it, next links, Undo of the exact bytes), reads the list again and tells the frame (BOTS_UI.changed, else a page reload).
// Layout (S8): one army and one stage at a time (army list + a stage strip), the table with unit / kind / priority; stage settings, income
// and team limits, extra add fields and the list copy under "More options"; file keys only under "Details". Unit box: a searchKit attached
// once the box is in its row, in-game name first and the id small, a typed in-game name accepted. Kind names: the frame's bots.kind.* when
// it has them. Refusals come as {ok:false, code, args}: worded here (err.*), else by the frame's bots.e.*. GoH: greyed up front, no call.
// Author: Imperator_Aug (ARSENAL, ia-887a79aa)
module.exports = String.raw`
(function(){
 var P='bots.stages.';
 function t(k,o){return tx(P+k,o)}
 function has(k){return tx(P+k)!==P+k}
 function sh(k,own,o){var s=tx(k,o);return s===k?t(own,o):s}
 function plural(n){var x=Math.abs(Number(n)),lang=typeof LANG!=='undefined'?LANG:'en';try{if(typeof Intl!=='undefined'&&Intl.PluralRules)return new Intl.PluralRules(lang).select(x)}catch(e){}
  if(lang==='zh')return 'other';if(lang==='ru'||lang==='uk'){if(x%1)return 'other';var a=x%10,b=x%100;return a===1&&b!==11?'one':a>=2&&a<=4&&(b<12||b>14)?'few':'many'}return x===1?'one':'other'}
 function tn(k,n,o){var q={};Object.keys(o||{}).forEach(function(x){q[x]=o[x]});q.n=n;if(Number(n)===1&&has(k+'.1'))return t(k+'.1',q);var f=plural(n);if(f==='other'||(f==='one'&&Number(n)===1))return t(k,q);return has(k+'.'+f)?t(k+'.'+f,q):t(k,q)}
 var GROUP=8;
 var KEEP={mod:null,buy:[],move:[],army:null,stage:1,done:null,undo:false,undone:null,all:false,lim:false};
 var CARDS={mod:null,list:null,names:{},wait:[],info:null};
 var FLAGS=['Captured','Enemy','Neutral'];
 var FKEY={priority:'prio',cls:'cls',min_income:'inc',min_team:'team'};
 function txt(v){return v==null?'':String(v)}
 function inp(v,label,size){return h('input',{type:'text',value:txt(v),size:size||'6',autocomplete:'off',inputmode:'decimal','aria-label':label})}
 // army names as the lobby shows them (the read sends the mod's own; the stock six worded here when there are none); codes only in Details
 var ARM={},KIT=null;
 function armyName(a){a=String(a==null?'':a);if(!a)return a;var lo=a.toLowerCase();
  if(KIT&&typeof KIT.army==='function'){var ka=KIT.army(lo,ARM[lo]||'');if(ka&&ka!==lo)return ka}
  if(ARM[lo])return ARM[lo];if(has('army.'+lo))return t('army.'+lo);
  var i=lo.indexOf('_');if(i>0){var b=armyName(lo.slice(0,i));if(b!==lo.slice(0,i))return b+' '+lo.slice(i+1).split('_').map(function(w){return w.length<3?w.toUpperCase():w.charAt(0).toUpperCase()+w.slice(1)}).join(' ')}return a}
 function addArmies(o){if(o)Object.keys(o).forEach(function(k){ARM[k.toLowerCase()]=o[k]})}
 var SETK={'FlagPriority.Captured':'flag.Captured','FlagPriority.Enemy':'flag.Enemy','FlagPriority.Neutral':'flag.Neutral',OrderRotationPeriod:'rot',MaxSquadSize:'squad'};
 var UNAME=null;
 function wordArgs(a){var o={};Object.keys(a||{}).forEach(function(k){o[k]=a[k]});['army','from','to'].forEach(function(k){if(o[k]!=null&&o[k]!=='')o[k]=armyName(o[k])});
  if(o.unit&&UNAME)o.unit=UNAME(o.unit);if(o.key!=null)o.what=SETK[o.key]?t(SETK[o.key]):String(o.key);return o}
 function errText(r,op){if(typeof r==='string')return r;r=r||{};var a=wordArgs(r.args||{}),k='err.'+r.code;
  if(r.code==='badFlag')a.what=op&&op.which&&has('flag.'+op.which)?t('flag.'+op.which):t('flag.any');
  if(has(k))return t(k,a);
  var k2='bots.e.'+r.code,s2=tx(k2,a);if(s2!==k2)return s2;return t('err.other',{m:a.m||r.msg||r.code||'?'})}
 function clsName(c){if(KIT&&typeof KIT.kind==='function'){var kk=KIT.kind(c);if(kk)return kk}var k='bots.kind.'+c,s=tx(k);if(s!==k)return s;return has('c.'+c)?t('c.'+c):c}
 // loose search (S17): spaces, dots and case do not count ("Panzer IV Ausf. H" finds "PzKpfw IV Ausf.H"); a few common names stand for
 // each other (Panzer = PzKpfw = Pz, 4 = IV). Every word of the typed text must be in the name or the id, in the typed order
 var NOTW=/[^a-z0-9\u0400-\u04ff\u4e00-\u9fff]+/;
 function norm(x){return String(x==null?'':x).toLowerCase().split(NOTW).join('')}
 var ALIAS=[['panzer','pzkpfw','panzerkampfwagen','pz'],['1','i'],['2','ii'],['3','iii'],['4','iv'],['5','v'],['6','vi'],['7','vii'],['8','viii'],['stug','sturmgeschutz']];
 function words(x){var out=[];String(x==null?'':x).toLowerCase().split(NOTW).forEach(function(w){if(!w)return;(w.match(/[0-9]+|[^0-9]+/g)||[]).forEach(function(p){out.push(p)})});return out}
 function alts(w){for(var i=0;i<ALIAS.length;i++)if(ALIAS[i].indexOf(w)>=0)return ALIAS[i];return [w]}
 function inOrder(ws,hay){var pos=0;for(var i=0;i<ws.length;i++){var a=alts(ws[i]),best=-1,len=0;for(var j=0;j<a.length;j++){var k=hay.indexOf(a[j],pos);if(k>=0&&(best<0||k<best||(k===best&&a[j].length>len))){best=k;len=a[j].length}}if(best<0)return false;pos=best+len}return true}
 function loose(items,s){var ws=words(s);if(!ws.length)return [];return items.filter(function(c){return (c.nk&&inOrder(ws,c.nk))||inOrder(ws,c.ik)})}
 // removed lines before added ones inside each run of changed lines
 function ordered(diff){var out=[],run=[];function flush(){run.filter(function(d){return d.t==='-'}).concat(run.filter(function(d){return d.t==='+'})).forEach(function(d){out.push(d)});run=[]}
  diff.forEach(function(d){if(d.t==='-'||d.t==='+')run.push(d);else{flush();out.push(d)}});flush();return out}
 BOTS_PARTS.push({id:'stages',group:'A',order:20,title:function(){return t('title')},draw:draw});

 function draw(env){
  var K=env.kit;KIT=K;
  function hint(x){return h('div',{class:'hint',text:x})}
  function fold(label,kids){return h('details',{},[h('summary',{text:label})].concat(kids))}
  // the frame's shared folds when it has them (same words: bots.details, bots.more), else local ones
  function det(id,kids){return K.details?K.details(id,kids):fold(sh('bots.details','details'),kids)}
  function more(id,kids){return K.more?K.more(id,kids):fold(sh('bots.more','more'),kids)}
  function na(id,text){return K.na?K.na(id,text):K.leaf(id,[h('div',{class:'hint','data-na':'1','aria-disabled':'true',style:'opacity:.75',text:text})])}
  function goTo(id){if(typeof id==='function'){id();return}if(/^[a-z]+:/.test(id)&&typeof as2Link==='function'){as2Link(id);return}if(env.go)env.go(id);else if(K.go)K.go(id)}
  // GoH: greyed up front, no call to the server; the why under Details
  if(env.gid==='goh')return ['buy','move'].map(function(c){var g=c==='buy'?'':'move.';return K.section(P+c,t(c+'.h'),[na(P+c+'.goh',K.na&&K.naText&&has(g+'goh.why')?{why:t(g+'goh.why'),use:t(g+'goh.use'),game:typeof K.game==='function'?K.game('goh'):null}:t(g+'goh')),det(P+c+'.gohDet',[hint(t(g+'gohMore'))])])});
  if(KEEP.mod!==env.mod){KEEP={mod:env.mod,buy:[],move:[],army:null,stage:1,done:null,undo:false,undone:null,all:false,lim:false};CARDS={mod:null,list:null,names:{},wait:[],info:null}}
  var data=null,NAMES={},st={buy:{pv:null,wait:false,err:null,note:null,seq:0,shown:false},move:{pv:null,wait:false,err:null,note:null,seq:0,shown:false}};
  if(env.onChanged)env.onChanged(function(){KEEP.done=null;KEEP.undo=false;KEEP.undone=null});
  // the card Undo: the frame's (one state per file, read from the server) when it has one, else ours; both cards write the same file
  var FU={};function undoEl(card){if(!K.undoBtn)return null;if(!FU[card])FU[card]=K.undoBtn(['script/multiplayer/bot.data.lua'],{out:function(){return h('div')},onDone:function(){KEEP.done=null;KEEP.undo=false;KEEP.undone=card}});return FU[card]}
  var bSrc=h('div'),bArmy=h('div',{class:'row'}),bTl=h('div',{class:'row',role:'group','aria-label':t('blk.timeline')}),bStage=h('div'),bTbl=h('div'),bAdd=h('div'),bSet=h('div'),bAddMore=h('div'),bCopy=h('div'),bRes=h('div',{'aria-live':'polite'});
  var mFlags=h('div'),mRot=h('div'),mSquad=h('div'),mRes=h('div',{'aria-live':'polite'});
  // the two game words of this card, explained once on hover (and on focus, for the keyboard)
  function term(w,tip){return h('span',{tabindex:'0',title:tip,'aria-label':w+': '+tip,style:'cursor:help;text-decoration:underline dotted',text:w})}
  var terms=h('div',{class:'hint'},[h('span',{text:t('terms')+' '}),term(t('term.stage'),t('term.stageTip')),h('span',{text:', '}),term(t('term.card'),t('term.cardTip'))]);
  var buy=K.section(P+'buy',t('buy.h'),[K.hint(P+'buy.lead',t('buy.lead')),K.leaf(P+'buy.terms',[terms],t('terms')),K.leaf(P+'buy.src',[bSrc],t('blk.src')),K.leaf(P+'buy.army',[bArmy],t('blk.army')),
   K.leaf(P+'buy.timeline',[bTl],t('blk.timeline')),K.leaf(P+'buy.stage',[bStage],t('blk.stage')),K.leaf(P+'buy.table',[bTbl],t('blk.table')),
   K.leaf(P+'buy.add',[bAdd],t('blk.add')),
   more(P+'buy.more',[K.leaf(P+'buy.more.stage',[h('b',{text:t('blk.stage')}),bSet],t('blk.stage')),K.leaf(P+'buy.more.add',[h('b',{text:t('add.more')}),bAddMore],t('add.more')),K.leaf(P+'buy.more.copy',[h('b',{text:t('blk.copy')}),bCopy],t('blk.copy')),det(P+'buy.keys',[hint(t('buy.keys'))])]),
   K.leaf(P+'buy.res',[bRes],t('blk.res'))]);
  var move=K.section(P+'move',t('move.h'),[K.hint(P+'move.lead',t('move.lead')),K.leaf(P+'move.flags',[mFlags],t('blk.flags')),
   more(P+'move.more',[K.leaf(P+'move.rotation',[mRot],t('blk.rotation')),K.leaf(P+'move.squad',[mSquad],t('blk.squad')),det(P+'move.keys',[hint(t('move.keys'))])]),
   K.leaf(P+'move.res',[mRes],t('blk.res'))]);
  if(!env.mod){[bSrc,mFlags].forEach(function(b){b.appendChild(typeof K.needMod==='function'?K.needMod(null):K.errBox(t('needMod')))});return [buy,move]}

  function nameOf(u){return NAMES[u]||CARDS.names[u]||''}
  function unitTxt(u){return nameOf(u)||u}
  UNAME=unitTxt;
  function addNames(o){if(o)Object.keys(o).forEach(function(k){NAMES[k]=o[k]})}
  function modelOf(card){var p=st[card].pv;return p&&p.model?p.model:data.model}
  function repTxt(r){return r===0?t('forever'):tn('times',r,{r:r})}
  // after a write or an undo: the other cards of the page drawn again (the frame), this card reads the list again itself
  function changed(){var told=false;try{if(env.changed){env.changed('buys','stages');told=true}else if(typeof BOTS_UI!=='undefined'&&BOTS_UI.changed){BOTS_UI.changed('buys','stages');told=true}}catch(x){}if(told)load();else env.reload()}

  // ---- the buy cards of an army (the unit box's list), asked once per mod
  function cardsFor(army,cb){
   if(CARDS.mod===env.mod&&CARDS.list){cb(itemsOf(army));return}
   CARDS.wait.push(function(){cb(itemsOf(army))});if(CARDS.mod===env.mod)return;CARDS.mod=env.mod;
   env.api('GET','stages/cards',null,function(e,r){var good=r&&r.ok!==false;CARDS.list=(good&&r.cards)||{};CARDS.names=(good&&r.names)||{};if(good)addArmies(r.armies);CARDS.info=good?{missing:r.missing||[],base:r.base||null,known:r.known}:null;
    drawCardInfo();var w=CARDS.wait;CARDS.wait=[];w.forEach(function(f){f()})})}
  function itemsOf(army){var l=(CARDS.list[army]||[]).concat(CARDS.list['*']||[]);
   return l.map(function(c){var n=CARDS.names[c.unit]||'';return {label:n||c.unit,value:c.unit,name:n,hint:(n?c.unit:'')+(c.src==='mod'?(n?', ':'')+t('fromMod'):''),lo:(n+' '+c.unit).toLowerCase(),nk:norm(n),ik:norm(c.unit)}})}
  function hits(items,s,done){K.hitsOf(items,s,function(a,more){if(a.length||!String(s||'').trim()){done(a,more);return}var l=loose(items,s);done(l.slice(0,30),Math.max(0,l.length-30))})}
  // the card of another army typed as its id goes to the server as typed: its refusal names the army that cannot buy it
  function elsewhere(lo){return Object.keys(CARDS.list||{}).some(function(a){return (CARDS.list[a]||[]).some(function(c){return String(c.unit).toLowerCase()===lo})})}
  // what the unit box holds -> a card id: the picked one, an id, an in-game name typed in full (spaces, dots and case do not count), or
  // the one card the typed text finds. Several or none: cb(null) = "pick one from the list" (the text as typed when no list was read)
  function resolve(v,cb){v=String(v||'').trim();if(!v){cb('');return}cardsFor(KEEP.army,function(l){var lo=v.toLowerCase(),hit='';
   l.some(function(c){if(c.value.toLowerCase()===lo){hit=c.value;return true}return false});
   if(!hit)l.some(function(c){if(c.name&&c.name.toLowerCase()===lo){hit=c.value;return true}return false});
   var one=function(ls){var seen={};ls.forEach(function(c){seen[c.value]=1});var ks=Object.keys(seen);return ks.length===1?ks[0]:''},nv=norm(v);
   if(!hit&&nv)hit=one(l.filter(function(c){return c.nk===nv||c.ik===nv}));
   if(!hit)hit=one(l.filter(function(c){return c.lo.indexOf(lo)>=0}))||one(loose(l,v));
   if(hit||!l.length||elsewhere(lo))cb(hit||v);else cb(null)})}
  function itemOf(id){var l=itemsOf(KEEP.army);for(var i=0;i<l.length;i++)if(l[i].value===id)return l[i];return null}
  var cardInfo=h('div');
  function drawCardInfo(){cardInfo.textContent='';var I=CARDS.info;if(!I)return;
   if(I.missing&&I.missing.length)cardInfo.appendChild(h('div',{class:'err',text:t('depMissing',{names:I.missing.join(', ')})}));
   else if(I.base&&I.base.how==='guess')cardInfo.appendChild(hint(t('baseGuess',{title:I.base.title})));}

  // ---- load, preview, write, undo
  function load(){bSrc.textContent='';bSrc.appendChild(K.wait?K.wait(null,t('loading')):hint(t('loading')));
   env.api('GET','stages/read',null,function(e,r){bSrc.textContent='';
    if(e||!r||r.ok===false){bSrc.appendChild(K.errBox(errText(e||r)));return}
    if(r.goh){bSrc.appendChild(hint(t('goh')));return}
    data=r;addNames(r.names);addArmies(r.armies);
    bSrc.appendChild(hint(t(r.from==='mod'?'srcMod':'srcGame')));
    if(r.ownBot)bSrc.appendChild(h('div',{class:'err',text:t('ownBot')}));
    if(r.odd){bSrc.appendChild(h('div',{class:'err',text:t('odd',{why:r.odd})}));return}
    ['buy','move'].forEach(function(c){if(KEEP[c].length)preview(c);else redraw(c)})})}
  function redraw(card){if(!data)return;if(card==='buy')drawBuy(modelOf('buy'));else drawMove(modelOf('move'));drawRes(card)}
  // the Write gate (kit.gate, S5): Write runs only for a Preview that is on screen (S.shown) and was made for the edits as they are
  // now (S.seen = the key of the edits the shown preview answers). Any edit clears it; the click handler asks canWrite too, so a click
  // that reaches a greyed button writes nothing
  function keyOf(card){return JSON.stringify(KEEP[card])}
  function canWrite(card){var S=st[card];return !!(KEEP[card].length&&S.shown&&!S.wait&&S.pv&&S.pv.changes.length&&S.seen!=null&&S.seen===keyOf(card))}
  function addOp(card,op){KEEP.done=null;KEEP.undone=null;st[card].note=null;st[card].ok=null;st[card].was=st[card].shown;st[card].shown=false;st[card].seen=null;KEEP[card].push(op);preview(card)}
  function preview(card){var S=st[card],ops=KEEP[card],my=++S.seq,k=keyOf(card);
   if(!ops.length){S.pv=null;S.pvKey=null;S.seen=null;S.err=null;S.wait=false;redraw(card);return}
   S.wait=true;drawRes(card);
   env.api('POST','stages/preview',{base:data.base,ops:ops},function(e,r){if(my!==S.seq)return;S.wait=false;
    if(e||!r){S.err=errText(e||'?');S.pv=null;redraw(card);return}
    if(!r.ok){
     if(r.code==='changed'){S.note=errText(r);load();return}
     S.note=errText(r,ops[r.at]);
     if(r.at>=0&&r.at<ops.length){ops.splice(r.at,1);if(r.at===ops.length&&S.was)S.shown=true;preview(card);return}
     S.pv=null;S.pvKey=null;redraw(card);return}
    S.err=null;S.pv=r;S.pvKey=k;addNames(r.names);redraw(card)})}
  function write(card){var S=st[card];if(!canWrite(card))return;
   var wk=keyOf(card);
   var n=S.pv.changes.length,lines=[t('ask',{n:n}),t(S.pv.copiesWholeFile?'ask.copy':'ask.replace')];
   (typeof askDo==='function'?askDo({title:sh('bots.btn.write','write'),lines:lines,where:env.mod,ok:sh('bots.btn.write','write'),danger:true}):{then:function(cb){cb(confirm(lines.join(' ')))}}).then(function(yes){if(!yes||!canWrite(card)||keyOf(card)!==wk)return;
    env.api('POST','stages/write',{base:data.base,ops:KEEP[card]},function(e,r){
     if(e||!r){S.err=errText(e||'?');drawRes(card);return}
     if(!r.ok){S.note=errText(r);if(r.code==='changed')load();else drawRes(card);return}
     KEEP.done={card:card,lines:r.changes.map(chText)};KEEP.undo=!!r.undo;KEEP.undone=null;KEEP[card]=[];S.pv=null;S.pvKey=null;S.seen=null;S.note=null;S.ok=null;S.shown=false;
     ['buy','move'].forEach(function(c){if(FU[c]&&FU[c].refresh)FU[c].refresh()});changed()})})}
  // -> a Promise (the frame's Undo button waits on it and then says "Undone"); the local box says it here
  function undoWrite(card){return new Promise(function(ok,no){env.api('POST','stages/undo',{},function(e,r){
   if(e||!r||r.ok===false){no(errText(e||r));return}
   KEEP.done=null;KEEP.undo=Number(r.left)>0;KEEP.undone=card;changed();ok(r)})})}

  // ---- the change sentences (plain: in-game names, kinds, "until the end")
  function chText(c){var a={stage:c.stage,army:armyName(c.army),unit:c.unit?unitTxt(c.unit):'',was:txt(c.was),now:txt(c.now)};
   if(c.k==='repeat'){a.was=repTxt(c.was);a.now=repTxt(c.now)}
   if(c.k==='rowSet'){a.field=t('col.'+FKEY[c.field]);if(c.field==='cls'){a.was=clsName(c.was);a.now=clsName(c.now)}if(c.was==null)a.was=t('any');if(c.now==null)a.now=t('any')}
   if(c.k==='rowMove'){a.from=c.from;a.to=c.to}
   if(c.k==='stageAdd')a.from=c.from;
   if(c.k==='armyCopy'){a.from=armyName(c.from);a.to=armyName(c.to);a.toStage=c.toStage;a.n=c.n}
   if(c.k==='flag')a.which=t('flag.'+c.which);
   var s=t('ch.'+c.k,a);
   if(c.k==='armyCopy'){if(c.renamed&&c.renamed.length)s+=' '+t('ch.renamed',{list:c.renamed.join(', ')});if(c.skipped&&c.skipped.length)s+=' '+t('ch.skipped',{list:c.skipped.map(unitTxt).join(', ')})}
   return s}
  // the green box after a write: what the bot now does, how to see it, next buttons, Undo. Kept until the next edit
  var DONE=null;
  function doneBox(card){var D=KEEP.done;
   if(DONE&&DONE.d===D)return DONE.el;
   var one=D.lines.length===1,o={title:one?t('done.one',{what:String(D.lines[0]).replace(/[.\s]+$/,'')}):tn('done.many',D.lines.length),lines:one?[]:D.lines,see:t('done.see'),next:[{text:t('next.match'),go:function(){goTo('bots.botmatch')}},{text:t('next.log'),go:function(){goTo('log:')}}],rels:['script/multiplayer/bot.data.lua']};
   var el;
   if(K.done)el=K.done(null,o);
   else{var kids=[h('b',{text:o.title}),h('ul',{},o.lines.map(function(l){return h('li',{text:l})})),h('div',{class:'hint',text:t('done.seeH')+' '+o.see})];
    var row=h('div',{class:'row'},o.next.map(function(n){return h('button',{type:'button',text:n.text,onclick:function(){goTo(n.go)}})}));
    kids.push(row);el=h('div',{class:'ok',role:'status','data-done':'1'},kids)}
   DONE={d:D,el:el};return el}
  // S13/S18: the same buttons in the same order on both cards: Preview, Write into my mod (on after Preview), Undo (one state for the file), then the edit list ones
  function btnRow(card){var S=st[card],pv=S.pv,ops=KEEP[card];
   var bP=h('button',{type:'button',class:'primary','data-preview':'1',text:sh('bots.btn.preview','preview'),disabled:!ops.length||S.shown,onclick:function(){S.shown=true;drawRes(card)}});
   S.seen=S.shown&&pv&&!S.wait?S.pvKey:null;   // the preview on screen, and the edits it was made for
   var wOn=canWrite(card);
   var bW=h('button',{type:'button',class:'danger','data-write':'1',text:sh('bots.btn.write','write'),disabled:!wOn,title:wOn?null:sh('bots.gate.tip','gate'),onclick:function(){if(!canWrite(card))return;write(card)}});
   if(K.gate){var G=K.gate(null,bW,function(){return keyOf(card)});if(wOn)G.shown(S.seen);else G.clear()}
   var bUn=undoEl(card)||h('button',{type:'button','data-undo':'1',title:t('undo.hint'),text:sh('bots.btn.undo','undoWrite'),disabled:!KEEP.undo,onclick:function(){bUn.disabled=true;
    undoWrite(card).then(null,function(m){bUn.disabled=false;S.note=m;drawRes(card)})}});
   var bD=h('button',{type:'button',text:t('discard'),disabled:!ops.length,onclick:function(){KEEP[card]=[];S.note=null;S.shown=false;S.seen=null;preview(card)}});
   return h('div',{class:'row'},[bP,bW,bUn,bD])}
  function drawRes(card){var box=card==='buy'?bRes:mRes,S=st[card],ops=KEEP[card];box.textContent='';
   if(KEEP.done&&KEEP.done.card===card)box.appendChild(doneBox(card));
   if(KEEP.undone===card)box.appendChild(h('div',{class:'ok',role:'status','data-undone':'1',text:typeof K.undone==='function'?String(K.undone(t('undone.what'))):t('undone')}));
   if(S.note)box.appendChild(h('div',{class:'err',text:S.note}));
   if(!ops.length){if(!(KEEP.done&&KEEP.done.card===card)&&KEEP.undone!==card)box.appendChild(hint(t('none')));box.appendChild(btnRow(card));return}
   if(!S.shown){box.appendChild(hint(tn('pending',ops.length)));box.appendChild(btnRow(card));return}
   if(S.wait)box.appendChild(hint(t('working')));
   if(S.err)box.appendChild(K.errBox(S.err));
   var pv=S.pv;
   if(pv){
    box.appendChild(h('b',{text:pv.changes.length?tn('will',pv.changes.length):t('noChange')}));
    box.appendChild(h('ul',{},pv.changes.map(function(c){return h('li',{text:chText(c)})})));
    (pv.warnings||[]).forEach(function(w){box.appendChild(h('div',{class:'err',text:t('warn.'+w.code,w)}))});
    if(pv.copiesWholeFile&&pv.changes.length)box.appendChild(hint(t('copyWhole')));
    if(pv.changes.length)box.appendChild(hint(t('only')));
    if(pv.diff&&pv.diff.length){var rows=pv.diff.map(function(d){var m=/(\d+)/.exec(d.s||'');return d.t==='@'?{t:'@',s:d.n===0&&m?t('moreLines',{n:m[1]}):t('line',{n:d.n})}:{t:d.t,s:d.s}});
     var pre=K.diff?K.diff(null,rows):h('pre',{style:'overflow-x:auto;max-height:24em',text:ordered(rows).map(function(d){return (d.t==='@'||d.t===' '?'  ':d.t+' ')+d.s}).join('\n')});
     box.appendChild(fold(sh('bots.showChange','diff'),[pre]))}}
   box.appendChild(btnRow(card))}

  // ---- card 1: what bots buy. The add row: unit (searchKit, attached once in its row), kind, Add; priority and limits under More options
  var uin=h('input',{type:'text',autocomplete:'off',placeholder:t('add.unitHint0'),'aria-label':t('add.unit')}),picked=null;
  var acls=h('select',{'aria-label':t('col.cls')}),apri=inp('1.0',t('col.prio')),ainc=inp('',t('col.inc')),atm=inp('',t('col.team'));
  ainc.setAttribute('placeholder',t('any'));atm.setAttribute('placeholder',t('any'));
  var pickSay=h('div',{'aria-live':'polite'});
  function sayPick(node){pickSay.textContent='';if(node)pickSay.appendChild(node)}
  function pickOne(){return h('div',{class:'err','data-pickone':'1',text:t('add.pickOne')})}
  function addGo(){var v=uin.value.trim();if(!v){st.buy.note=t('add.need');drawRes('buy');return}
   var go=function(u){if(u==null){sayPick(pickOne());return}sayPick(null);addOp('buy',{op:'rowAdd',stage:KEEP.stage,army:KEEP.army,unit:u,cls:acls.value,priority:apri.value,min_income:ainc.value,min_team:atm.value});uin.value='';picked=null};
   if(picked&&v===picked.label)go(picked.value);else resolve(v,go)}
  var aBtn=h('button',{type:'button',class:'primary',text:t('add.go'),onclick:addGo});
  // Enter adds; leaving the box with a text that fits one card puts that card's name in it, else says to pick one
  uin.addEventListener('keydown',function(e){if(e&&e.key==='Enter'){if(e.preventDefault)e.preventDefault();addGo()}});
  uin.addEventListener('blur',function(){var v=uin.value.trim();if(!v||(picked&&v===picked.label)){sayPick(null);return}
   resolve(v,function(u){if(uin.value.trim()!==v)return;if(u==null){sayPick(pickOne());return}sayPick(null);var it=itemOf(u);if(it){picked={label:it.label,value:it.value};uin.value=it.label}})});
  uin.addEventListener('input',function(){sayPick(null)});
  // the box's example is a name the box accepts (S17): the first buy card of the picked army with an in-game name
  function example(){cardsFor(KEEP.army,function(l){var e='';for(var i=0;i<l.length&&!e;i++)if(l[i].name)e=l[i].name;if(!e&&l.length)e=l[0].value;uin.setAttribute('placeholder',e?t('add.unitHint',{name:e}):t('add.unitHint0'))})}
  bAdd.appendChild(h('b',{text:t('add.h')}));
  var addRow=h('div',{class:'row'},[h('label',{text:t('add.unit')})]);bAdd.appendChild(addRow);
  addRow.appendChild(uin);
  [h('label',{text:t('col.cls')}),acls,aBtn].forEach(function(x){addRow.appendChild(x)});
  bAdd.appendChild(pickSay);bAdd.appendChild(hint(t('add.hint')));bAdd.appendChild(cardInfo);
  bAddMore.appendChild(h('div',{class:'row'},[h('label',{text:t('col.prio')}),apri,h('label',{text:t('col.inc')}),ainc,h('label',{text:t('col.team')}),atm]));
  bAddMore.appendChild(hint(t('cols.hint')));
  // searchKit (browse, index and history on every box): index = the buy cards of the picked army (game, the mods it needs, the mod)
  // the frame's pick() waits until the box is in the page; the local path: the box is already in its row here
  // Browse = the entity folder of the game data: a picked .def file gives its unit name
  var so={key:'bots.stages.unit',index:function(s,done){cardsFor(KEEP.army,function(a){hits(a,s,function(l,more){
    if(!l.length&&String(s||'').trim())sayPick(typeof K.none==='function'?K.none(t('add.noneTry')):h('div',{class:'hint','data-none':'1',text:t('add.none')}));else if(pickSay.children&&pickSay.children[0]&&pickSay.children[0].getAttribute('data-none'))sayPick(null);done(l,more)})})},
   browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}},
   onPick:function(v,item){sayPick(null);picked=item?{label:item.label,value:item.value}:null;uin.value=item?item.label:v;if(/\)$/.test(item?item.value:v))acls.value='Infantry'}};
  if(K.pick)K.pick(uin,so);else if(typeof searchKit==='function')searchKit(uin,so);

  function drawBuy(m){
   [bArmy,bTl,bStage,bTbl,bSet,bCopy].forEach(function(b){b.textContent=''});
   if(!m.armies.length){bTbl.appendChild(h('div',{class:'err',text:t('noArmies')}));return}
   if(!KEEP.army||!m.armies.some(function(a){return a.id===KEEP.army}))KEEP.army=m.armies[0].id;
   if(KEEP.stage>m.stages.length)KEEP.stage=m.stages.length;if(KEEP.stage<1)KEEP.stage=1;
   // army names as the game shows them; the code only in the hover text
   var aName=function(a){var nm=armyName(a.id);if(nm===a.id&&a.label)nm=a.label;return nm};
   var aopt=function(){return m.armies.map(function(a){return h('option',{value:a.id,title:a.id,text:aName(a)})})};
   var sel=h('select',{'aria-label':t('army'),title:KEEP.army},aopt());sel.value=KEEP.army;example();
   sel.addEventListener('change',function(){KEEP.army=sel.value;KEEP.all=false;drawBuy(modelOf('buy'))});
   bArmy.appendChild(h('label',{text:t('army')}));bArmy.appendChild(sel);
   var AN=armyName(KEEP.army);
   // the stage strip: one small button per stage, the picked one pressed
   bTl.appendChild(h('span',{text:t('stages')}));
   m.stages.forEach(function(s){var lab=t('tl',{n:s.n,rep:s.repeat==null?'?':repTxt(s.repeat)});
    bTl.appendChild(h('button',{type:'button',class:s.n===KEEP.stage?'primary':null,'aria-pressed':s.n===KEEP.stage?'true':'false',title:lab,'aria-label':lab,'data-stage':String(s.n),
    text:String(s.n)+(s.repeat===0?' ∞':''),onclick:function(){KEEP.stage=s.n;KEEP.all=false;drawBuy(modelOf('buy'))}}))});
   var S=m.stages[KEEP.stage-1],n=KEEP.stage;
   bStage.appendChild(h('b',{text:S.repeat===0?t('stage.forever',{n:n,all:m.stages.length}):S.repeat==null?t('stage.odd',{n:n,all:m.stages.length}):tn('stage.times',S.repeat,{st:n,all:m.stages.length,next:n<m.stages.length?n+1:n})}));
   // More options: buys in this stage, add a copy, remove
   var rep=h('input',{type:'text',value:txt(S.repeat),size:'4',inputmode:'numeric','aria-label':t('repeat')});
   rep.addEventListener('change',function(){addOp('buy',{op:'repeat',stage:n,value:rep.value.trim()})});
   bSet.appendChild(h('div',{class:'row'},[h('label',{text:t('repeat')}),rep,
    h('button',{type:'button',text:t('stage.add'),onclick:function(){KEEP.stage=n+1;addOp('buy',{op:'stageAdd',after:n})}}),
    h('button',{type:'button',text:t('stage.del'),disabled:m.stages.length<2,onclick:function(){KEEP.stage=Math.max(1,n-1);addOp('buy',{op:'stageDel',stage:n})}})]));
   bSet.appendChild(hint(t('repeat.hint')));
   if(S.odd){bTbl.appendChild(h('div',{class:'err',text:t('oddStage',{why:S.odd})}));return}
   var rows=S.armies[KEEP.army];
   if(!rows)bTbl.appendChild(h('div',{class:'err',text:t('noList',{army:AN,stage:n})}));
   else if(!rows.length)bTbl.appendChild(h('div',{class:'err',text:t('emptyList',{army:AN,stage:n})}));
   else{
    // one table: the income and team limits are two more columns behind a tick box
    var lim=!!KEEP.lim,lb=h('input',{type:'checkbox','data-lim':'1'});lb.checked=lim;
    lb.addEventListener('change',function(){KEEP.lim=lb.checked;drawBuy(modelOf('buy'))});
    bTbl.appendChild(h('label',{class:'row'},[lb,h('span',{text:t('lim.show')})]));
    var cols=[t('col.unit'),t('col.cls'),t('col.prio')].concat(lim?[t('col.inc'),t('col.team')]:[]).concat(['']);
    var head=h('tr',{},cols.map(function(x){return h('th',{text:x})}));
    var trs=rows.map(function(r,i){
     var nm=nameOf(r.unit),cell=function(){return h('td',{},nm?[h('b',{text:nm}),h('div',{class:'hint',style:'font-size:11px',text:r.unit})]:[h('b',{text:r.unit})])};
     if(r.odd)return h('tr',{},[cell(),h('td',{text:clsName(r.cls)}),h('td',{text:txt(r.priority)})].concat(lim?[h('td',{text:txt(r.min_income)}),h('td',{text:txt(r.min_team)})]:[]).concat([h('td',{class:'hint',text:t('oddRow')})]));
     var who=nm||r.unit;
     var cs=h('select',{'aria-label':t('col.cls')+' '+who},m.unitClass.map(function(c){return h('option',{value:c,text:clsName(c)})}));cs.value=r.cls;
     cs.addEventListener('change',function(){addOp('buy',{op:'rowSet',stage:n,army:KEEP.army,row:i,field:'cls',value:cs.value})});
     var set=function(field,box){box.addEventListener('change',function(){addOp('buy',{op:'rowSet',stage:n,army:KEEP.army,row:i,field:field,value:box.value.trim()})});return h('td',{},[box])};
     var tds=[cell(),h('td',{},[cs]),set('priority',inp(r.priority,t('col.prio')+' '+who))];
     if(lim){var ii=inp(r.min_income,t('col.inc')+' '+who),ti=inp(r.min_team,t('col.team')+' '+who,'4');
      ii.setAttribute('placeholder',t('any'));ti.setAttribute('placeholder',t('any'));tds.push(set('min_income',ii),set('min_team',ti))}
     var mv=function(d,sym,lab,off){return h('button',{type:'button',text:sym,title:lab,'aria-label':lab+' '+who,disabled:off,onclick:function(){addOp('buy',{op:'rowMove',stage:n,army:KEEP.army,row:i,dir:d})}})};
     tds.push(h('td',{},[mv(-1,'↑',t('up'),i===0),mv(1,'↓',t('down'),i===rows.length-1),
      h('button',{type:'button',text:'✕',title:t('del'),'aria-label':t('del')+' '+who,onclick:function(){addOp('buy',{op:'rowDel',stage:n,army:KEEP.army,row:i})}})]));
     return h('tr',{},tds)});
    var shown=KEEP.all?trs:trs.slice(0,GROUP);
    bTbl.appendChild(h('div',{style:'overflow-x:auto'},[h('table',{},[h('thead',{},[head]),h('tbody',{},shown)])]));
    if(shown.length<trs.length)bTbl.appendChild(h('button',{type:'button','data-showall':'1',text:sh('bots.showAll','showAll',{n:trs.length}),onclick:function(){KEEP.all=true;drawBuy(modelOf('buy'))}}));
    bTbl.appendChild(hint(t('prio.hint')));
    if(lim)bTbl.appendChild(hint(t('lim.hint')))}
   // the add form follows the picked army: its kinds
   var cv=acls.value;acls.textContent='';m.unitClass.forEach(function(c){acls.appendChild(h('option',{value:c,text:clsName(c)}))});acls.value=cv&&m.unitClass.indexOf(cv)>=0?cv:(m.unitClass.indexOf('Tank')>=0?'Tank':m.unitClass[0]);
   // copy this army's list to another army (and stage)
   var toA=h('select',{'aria-label':t('copy.to')},aopt()),toS=h('select',{'aria-label':t('copy.toStage')},m.stages.map(function(s){return h('option',{value:String(s.n),text:String(s.n)})}));
   var other=m.armies.filter(function(a){return a.id!==KEEP.army})[0];toA.value=other?other.id:KEEP.army;toS.value=String(n);
   bCopy.appendChild(h('div',{class:'row'},[h('label',{text:t('copy.a',{army:AN,stage:n})}),toA,h('label',{text:t('copy.toStage')}),toS,
    h('button',{type:'button',text:t('copy.go'),disabled:!rows||!rows.length,onclick:function(){addOp('buy',{op:'armyCopy',stage:n,from:KEEP.army,to:toA.value,toStage:Number(toS.value)})}})]));
   bCopy.appendChild(hint(t('copy.hint')))}

  // ---- card 2: where bots go. Flags first; re-think time and squad split under More options; file keys under Details
  function field(label,box,stock,after){return h('div',{class:'row'},[h('label',{text:label}),box,after?h('span',{text:after}):null,h('span',{class:'hint',text:t('stock',{v:stock==null?'?':String(stock)})})])}
  function setMove(op){KEEP.move=KEEP.move.filter(function(x){return !(x.op===op.op&&x.which===op.which)});addOp('move',op)}
  function drawMove(m){[mFlags,mRot,mSquad].forEach(function(b){b.textContent=''});
   var mv=m.move,sk=data.stock&&data.stock.move,boxes={};
   FLAGS.forEach(function(k){var b=inp(mv.flag[k],t('flag.'+k));boxes[k]=b;b.disabled=mv.flag[k]==null;
    b.addEventListener('input',chance);b.addEventListener('change',function(){setMove({op:'flag',which:k,value:b.value.trim()})});
    mFlags.appendChild(field(t('flag.'+k),b,sk&&sk.flag[k]))});
   var ch=h('div',{class:'hint'});
   function chance(){var v={},sum=0;FLAGS.forEach(function(k){var x=Number(boxes[k].value);v[k]=isFinite(x)&&x>0?x:0;sum+=v[k]});
    ch.textContent=sum>0?t('flag.chance',{a:Math.round(100*v.Captured/sum),b:Math.round(100*v.Enemy/sum),c:Math.round(100*v.Neutral/sum)}):t('flag.never')}
   chance();mFlags.appendChild(hint(t('flag.hint')));mFlags.appendChild(ch);
   var rm=mv.rotationMs==null?null:mv.rotationMs/60000,rb=inp(rm,t('rot'),'5');rb.disabled=rm==null;
   rb.addEventListener('change',function(){setMove({op:'rotation',minutes:rb.value.trim()})});
   mRot.appendChild(field(t('rot'),rb,sk&&sk.rotationMs!=null?sk.rotationMs/60000:null,t('minutes')));
   mRot.appendChild(hint(rm==null?t('noSetting',{what:t('rot')}):t('rot.hint')));
   var sb=inp(mv.squad,t('squad'),'4');sb.disabled=mv.squad==null;
   sb.addEventListener('change',function(){setMove({op:'squad',value:sb.value.trim()})});
   mSquad.appendChild(field(t('squad'),sb,sk&&sk.squad,t('squad.after')));
   mSquad.appendChild(hint(mv.squad==null?t('noSetting',{what:t('squad')}):t('squad.hint')))}

  load();
  return [buy,move]}
})();
`;

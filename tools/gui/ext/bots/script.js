// browser side of the "Bots and battles" page. Page rules: no backtick, no dollar-brace, DOM only through h() and textContent.
// Layout = blocks: every part sits in a leaf block; load removes the blocks of the last draw from wherever the
// profile put them, draws the cards again with the same ids and calls blkApply (a server reply that adds blocks does too).
// BOTS_UI (top level, before the screen): the number editor and its helpers, and the multiplayer start settings card, shared with the
// Game Modes page (ext/modes), which shows that card now. The /api/x/bots/* routes stay here; the block ids are the same on both pages.
// Parts (parts/index.js): ext/bots/index.js builds the script as head (BOTS_PARTS=[], BOTS_UI with its kit) + each part's client script
// (each in its own function, so one part's names never reach another) + screen (EXT_SCREENS.bots). BOTS_UI.drawGroups draws the groups
// of a page: Bots = A B C F, Unit AI (ext/unitai) = D, Map scripts for AI (ext/mapai) = E; BOTS_UI.go(blockId) opens the page that owns
// that block and scrolls to it.
// The kit (env.kit = BOTS_UI.kit), page standards S1-S9 of An id ('' or null = a plain element to put inside
// a leaf of your own; a block id = a block to put straight into a card):
//   details(id, kids, label?)  folded block "Details" (bots.details): file names, keys, IDs, [V]/[T] in words. A container when id is given
//                              (plain kids get a leaf each), else a plain details element
//   more(id, kids)             the same, labelled "More options" (bots.more): the fields most people do not need (S8)
//   done(id, {lines, see, next:[{text, go}], undo, title})   the green after-write box (S4): plain lines, how to see it in the game, next
//                              buttons (go = a block id for BOTS_UI.go, 'page:<id>', 'log', or a function), Undo (undo() -> Promise)
//   na(id, text)               the greyed body of a card that cannot work in this game or setting (S7)
//   wait(id, text)             a wait line with a spinner (S6): say what is read and roughly how long
//   pick(input, opts)          searchKit on input once it is in the page (now if it has a parent, else when the frame inserts the part's
//                              nodes, else on the next ticks); opts = searchKit's (key, index|list, browse, onPick) or items: [..] |
//                              function(cb) instead of index; items {label (in-game name), value, hint}. Returns {input, sk, attached}
//   undoBy(list)               the undo function for done(): list = a write reply's undo [{rel, id}] (lib.undo on the server)
//   diff(id, rows), diffOrder(rows)   a line diff with the removed lines of each change before the added ones
//   shared words: bots.btn.preview / write / undo / reset, bots.details, bots.more, bots.done.*, bots.wait, bots.showChange (the one fold
//                              label of an exact file change)
//   round 5 (one wording everywhere):
//   army(code, fallback?)      the army's name in the window language (bots.army.<code>; a mod's own army = fallback, else the code)
//   kind(code)                 a unit kind in the window language (bots.kind.<Class>, any letter case; unknown = its words)
//   game(gid?)                 the one display name of a game: AS64, MoW:AS2, Gates of Hell (no gid = the current game)
//   undone(what?)              the sentence "Undone: <what>." (string); done's Undo and undoBtn draw it where the done box goes
//   none(hint?)                the row "Nothing found. Try <hint>." for an empty search result or list (element)
//   needMod(id), needGame(id)  the one no-mod / no-game-folder line, each with its button (element; a leaf when id is given)
//   gate(previewBtn, writeBtn, fields) -> {key, shown(key?), clear, touch, ok}: Write greyed until a Preview of the current values
//                              was shown; fields = inputs and selects, or a function -> a string of the values (then call touch())
//   diff(id, rows, {open}?)    now a fold labelled bots.showChange around the lines; undoBtn(rels, {out, onDone, undone})
//   diffName(id), hasGame()    a difficulty by its name; true when the current game's folder is set
//   emsg(e)                    an error as the page words it: e.text (bots.e.* key, field and difficulty names worded) or e.message
//   errBox, section, leaf, hint, qs, hitsOf, editor, go as before
//   stopBox(text?)             the plain line of a request stopped from the job list (never red); errBox(e) gives it for e.cancelled
// JOBS (gui README): env.api(method, path, data, cb, opt): opt.what names the request in the job list (default: the part's title and
// the clicked button), opt.job === false keeps a poll out of it. A stopped request calls cb(text, undefined, e) with e.cancelled true
// and text = "Stopped..." in the page language: a part shows it as a plain line (kit.stopBox), not as an error.
// BOTS_UI.changed(what, from): a part calls it after a write or an undo (from = its part id, a block id or an element inside it; else the
// part last clicked). Every other drawn part of that page is drawn again in place, so lists that show mod state reload; a part with
// watch:false is left alone, watch:[whats] only for those. env.onChanged(fn) = fn(what, partId) as well.
// Author: Imperator_Aug (ARSENAL, ia-c71576f3)
const head = String.raw`
var BOTS_PARTS=[];
var BOTS_UI=(function(){
 var BASE='/api/x/bots/';
 var tp=function(p,k){return tx(p+k)};
 var nm=function(k){return tx('bots.blk.'+k)};
 function qs(o){var s=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')s.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return s.join('&')}
 function has(k){try{return (typeof LANGS!=='undefined'&&((LANGS[LANG]&&LANGS[LANG][k]!=null)||(LANGS.en&&LANGS.en[k]!=null)))||tx(k)!==k}catch(e){return false}}
 // a server error in words: a bots.e.* key with its slots, a field id (f) and a difficulty or group (g) shown by their names
 // S12: never a bare "it failed": a known key as its sentence; else the server's own plain sentence (reply.plain, the message) with the
 // next step after it (bots.e.next) unless it names one already; "HTTP 500" and stack lines are left out
 function emsg(e){if(e==null)return '';if(typeof e!=='object')return withNext(String(e));
  if(e.cancelled)return tx('bots.stopped');   // stopped from the job list: one plain sentence, no "try again" tail
  if(e.key&&has(e.key)){var p={},q=e.params||{};Object.keys(q).forEach(function(k){p[k]=q[k]});
   if(p.f!=null){var f=tx('bots.f.'+p.f);if(f!=='bots.f.'+p.f)p.f=f}if(p.g!=null)p.g=diffName(p.g);
   if(p.armyCode!=null)p.army=army(p.armyCode,p.army);if(Array.isArray(p.homeCodes))p.home=p.homeCodes.map(function(c){return army(c)}).join(', ');return tx(e.key,p)}
  var r=e.reply||{},m=r.plain||e.plain||e.text||e.message||r.error||'';m=String(m).split(/\r?\n/)[0].replace(/^(Error: )?HTTP \d+\s*/,'').trim();
  return withNext(m)}
 function withNext(m){m=String(m||'').trim();var nx=tx('bots.e.next');if(!m)return tx('bots.e.unknown')+' '+nx;
  if(/(try again|pick|press|open|set |check|use |выберите|нажмите|откройте|проверьте|укажите|повторите|оберіть|натисніть|відкрийте|перевірте|вкажіть|повторіть|请|选择)/i.test(m))return m;
  return m.replace(/[.\s]*$/,'.')+' '+nx}
 function stopBox(t){return h('div',{class:'hint',role:'status','data-stopped':'1',text:t||tx('bots.stopped')})}
 function errBox(m){if(m&&typeof m==='object'){if(m.cancelled)return stopBox();m=emsg(m)}return h('div',{class:'err',role:'alert',text:m})}
 // the job list's name of a request: "<card>: <button>" in the shell's own form (job.name), the card alone when no button was clicked
 function jobWhat(card,btn){card=String(card||'');btn=String(btn||'');if(!btn)return card;return has('job.name')?tx('job.name',{p:card,b:btn}):card+': '+btn}
 function clickedText(){try{return typeof CLICKED!=='undefined'&&CLICKED&&typeof jobBtnText==='function'?jobBtnText(CLICKED):''}catch(e){return ''}}
 // searchKit index hits: items carry lo (lower case made once); word starts first, 30 shown, the rest counted; '' = the first 30
 function hitsOf(items,s,done){s=String(s||'').trim().toLowerCase();if(!s){done(items.slice(0,30),Math.max(0,items.length-30));return}var a=[],b=[];
  for(var i=0;i<items.length;i++){var it=items[i],k=it.lo.indexOf(s);if(k<0)continue;(k===0||/[\s_-]/.test(it.lo.charAt(k-1))?a:b).push(it)}
  var all=a.concat(b);done(all.slice(0,30),Math.max(0,all.length-30))}
 function leaf(id,kids,name){return h('div',name?{blk:id,'data-blkname':name}:{blk:id},kids)}
 function hint(id,t){return leaf(id,[h('div',{class:'hint',text:t})])}
 // a card: container block id, its heading as the leaf id.title
 function section(id,title,kids){return h('div',{class:'card',blk:id,box:'col','data-blkname':title},[leaf(id+'.title',[h('h3',{text:title})])].concat(kids))}
 function isB(n){return !!n&&typeof n==='object'&&(typeof isBlk==='function'?isBlk(n):!!(n.dataset&&n.dataset.blk!=null))}
 function kidsOf(k){return (Array.isArray(k)?k:[k]).filter(function(x){return x!=null&&x!==false&&x!==''})}
 function asNode(k){return typeof k==='string'||typeof k==='number'?h('div',{class:'hint',text:String(k)}):k}

 // ---- the shared kit (see the file head)
 function fold(id,kids,label,cls){kids=kidsOf(kids);var sum=h('summary',{class:'hint',style:'cursor:pointer;margin:4px 0',text:label});
  if(!id)return h('details',{class:cls},[sum].concat(kids.map(asNode)));
  return h('details',{blk:id,box:'col','data-blkname':label,class:cls},[sum].concat(kids.map(function(k,i){return isB(k)?k:leaf(id+'.'+i,[asNode(k)])})))}
 function details(id,kids,label){return fold(id,kids,label||tx('bots.details'),'bots-det')}
 function more(id,kids,label){return fold(id,kids,label||tx('bots.more'),'bots-more')}
 // na(id, text): two arguments always (round 2: a part called na(text) and drew empty cards). text = a sentence, or {why, use, game} for
 // the one S15 pattern "Not available in <game>: why. Use instead: use" (game = the current game's name when left out)
 // game(gid): the ONE display name of a game on these pages (bots.gname.<gid>: AS64, MoW:AS2, Gates of Hell); no gid = the current game
 function game(gid){var id=String(gid==null||gid===''?gidNow():gid).toLowerCase(),k='bots.gname.'+id;if(has(k))return tx(k);
  try{var g=typeof gOf==='function'&&gOf(id);if(g&&g.name)return String(g.name)}catch(e){}return id}
 function gameName(){return game()}
 function gameFull(){return game()}
 // army(code, fallback): the army's name in the window language (bots.army.<code>, every code of lib ARMY_NAMES); an army only a mod
 // knows = the name the server sent (fallback), else the code
 function army(code,fb){code=String(code==null?'':code);if(!code)return '';var k='bots.army.'+code.toLowerCase();return has(k)?tx(k):(fb?String(fb):code)}
 // kind(code): a unit kind (the UnitClass names of a bot list: Tank, Sniper, MG ...) in the window language, any letter case; a kind
 // only a mod knows = its name split into words (SuperHeavyTank -> Super heavy tank)
 var KIX=null;
 function kind(code){code=String(code==null?'':code);if(!code)return '';if(has('bots.kind.'+code))return tx('bots.kind.'+code);
  if(!KIX){KIX={};try{Object.keys(LANGS.en).forEach(function(k){if(k.indexOf('bots.kind.')===0)KIX[k.slice(10).toLowerCase()]=k})}catch(e){}}
  var k=KIX[code.toLowerCase().replace(/[\s_-]+/g,'')];if(k)return tx(k);
  var w=code.replace(/[_-]+/g,' ').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').trim();
  return w.split(/\s+/).map(function(x,i){return /^[A-Z0-9]+$/.test(x)&&x.length<4?x:(i?x.toLowerCase():x.charAt(0).toUpperCase()+x.slice(1).toLowerCase())}).join(' ')}
 // a difficulty (or another group) by its name: bots.d.<id>, else the id as words with a capital (very_hard -> Very hard)
 function diffName(g){g=String(g==null?'':g);var k='bots.d.'+g;if(has(k))return tx(k);if(has(k.toLowerCase()))return tx(k.toLowerCase());
  if(!/^[a-z][a-z0-9_]*$/.test(g))return g;var w=g.replace(/_+/g,' ');return w.charAt(0).toUpperCase()+w.slice(1)}
 // undone(what): the one sentence after an Undo, "Undone: <what>." (no what = the file is back as it was)
 function undone(what){what=String(what==null?'':what).replace(/[.\s。]+$/,'');return tx('bots.undone',{what:what||tx('bots.undone.file')})}
 // none(hint): the row for an empty search result or an empty list: "Nothing found. Try <hint>."
 function none(hint){hint=String(hint==null?'':hint).replace(/[.\s。]+$/,'');return h('div',{class:'hint','data-none':'1',role:'status',text:tx('bots.none')+(hint?' '+tx('bots.none.try',{hint:hint}):'')})}
 // gate(previewBtn, writeBtn, fields): Write stays greyed until a Preview of the values now in the fields was shown; any change greys it
 // again. fields = the inputs and selects, or a function -> a string of the current values (then call touch() on every change).
 // The card calls shown(key?) when its preview is on screen (key = gate.key() taken when the request was sent, so a late reply never
 // opens Write for values edited since) and clear() after a write. -> {key, shown, clear, touch, ok}
 function gate(pb,wb,fields){var last=null,fn=typeof fields==='function'?fields:null,els=fn?[]:kidsOf(fields);
  function val(e){var ty=(e.getAttribute&&e.getAttribute('type'))||e.type;return ty==='checkbox'||ty==='radio'?(e.checked?'1':'0'):String(e.value==null?'':e.value).trim()}
  function key(){return fn?String(fn()):els.map(val).join('|')}
  function sync(){var on=last!=null&&last===key();if(wb){wb.disabled=!on;wb.title=on?'':tx('bots.gate.tip')}return on}
  els.forEach(function(e){if(!e||!e.addEventListener)return;e.addEventListener('input',sync);e.addEventListener('change',sync)});sync();
  return {key:key,shown:function(k){last=k!=null?String(k):key();return sync()},clear:function(){last=null;sync()},touch:sync,ok:function(){return last!=null&&last===key()}}}
 function naText(o){if(o==null)return '';if(typeof o!=='object')return String(o);var s=tx('bots.na.pat',{game:o.game||gameName(),why:String(o.why||'').replace(/[.\s]*$/,'')});
  if(o.use)s+=' '+tx('bots.na.use',{use:String(o.use).replace(/[.\s]*$/,'')});return s}
 function na(id,t){if(arguments.length<2){var m='kit.na(id, text) needs the block id and the text (id null = a plain element)';try{console.error(m)}catch(x){}throw new Error(m)}
  var el=h('div',{class:'hint bots-na','data-na':'1','aria-disabled':'true',style:'opacity:.85;border:1px dashed var(--hint);border-radius:4px;padding:8px 10px;margin:4px 0'},[h('span',{text:naText(t)})]);return id?leaf(id,[el]):el}
 // rows(list, {show: 8, tag: 'ul'|'div'}): a long list shows its first rows, then "Show all N" / "Show fewer" (S10). list = nodes or
 // strings (strings become li / div). Returns a plain element to put inside a leaf
 function rows(list,o){o=o||{};var show=Number(o.show)>0?Number(o.show):8,tag=o.tag==='div'?'div':'ul',kt=tag==='ul'?'li':'div';
  var items=kidsOf(list).map(function(x){return isNode(x)&&(x.tagName===kt.toUpperCase()||tag==='div')?x:h(kt,{},[typeof x==='string'||typeof x==='number'?h('span',{text:String(x)}):x])});
  var box=h(tag,{class:'bots-rows','data-rows':String(items.length),style:tag==='ul'?'margin:4px 0 4px 18px;padding:0':''},items);
  var wrap=h('div',{},[box]);if(items.length<=show)return wrap;
  var open=false,b=h('button',{type:'button',class:'linkish','data-showall':'1'});
  function set(){items.forEach(function(it,i){it.hidden=!open&&i>=show});b.textContent=open?tx('bots.rows.fewer'):tx('bots.rows.all',{n:items.length});b.setAttribute('aria-expanded',open?'true':'false')}
  b.addEventListener('click',function(){open=!open;set()});set();wrap.appendChild(b);return wrap}
 // n(num, key, params): the plural form of key for num in the page language: key.one / key.few / key.many / key.other (ru/uk use all
 // four, en one + other, zh other), {n} filled; a missing form falls back to key.other, then key
 function plural(num){var x=Math.abs(Number(num)),lang=typeof LANG!=='undefined'?LANG:'en';
  try{if(typeof Intl!=='undefined'&&Intl.PluralRules)return new Intl.PluralRules(lang).select(x)}catch(e){}
  if(lang==='zh')return 'other';if(lang==='ru'||lang==='uk'){if(x%1)return 'other';var a=x%10,b=x%100;return a===1&&b!==11?'one':a>=2&&a<=4&&(b<12||b>14)?'few':'many'}return x===1?'one':'other'}
 function n(num,key,p){var q={};Object.keys(p||{}).forEach(function(k){q[k]=p[k]});q.n=num;var c=plural(num);
  var k=has(key+'.'+c)?key+'.'+c:has(key+'.other')?key+'.other':key;return tx(k,q)}
 // term(text, key): a word a beginner may not know (S11): dotted underline, the hover text bots.tip.<key>, a click opens it in the Help glossary
 function term(text,key){var tip=tx('bots.tip.'+key),g=tx('bots.tip.'+key+'.g');
  return h('span',{class:'bots-term','data-term':key,title:tip==='bots.tip.'+key?'':tip,tabindex:'0',style:'text-decoration:underline dotted;cursor:help',text:String(text),
   onclick:function(){if(window.as2Help&&window.as2Help.glossary)window.as2Help.glossary(g==='bots.tip.'+key+'.g'?String(text):g);else if(typeof show==='function')show('help')}})}
 function wait(id,t){var sp=h('span',{'aria-hidden':'true',style:'display:inline-block;width:1.3em',text:'◐'});
  var el=h('div',{class:'hint','data-wait':'1',role:'status'},[sp,h('span',{text:String(t||tx('bots.wait'))})]);
  if(typeof setInterval==='function'){var F=['◐','◓','◑','◒'],i=0,seen=false,iv=setInterval(function(){
   // the window is hidden (another browser tab): nothing is read or drawn, only the count goes on; the next tick after it is seen draws
   var hid=false;try{hid=!!document.hidden}catch(e){}if(hid){if(++i>600&&typeof clearInterval==='function')clearInterval(iv);return}
   var on=el.isConnected!=null?el.isConnected:!!el.parentNode;if(on)seen=true;
   if((seen&&!on)||++i>600){if(typeof clearInterval==='function')clearInterval(iv);return}sp.textContent=F[i%4]},200)}
  return id?leaf(id,[el]):el}
 function goTo(g){if(typeof g==='function'){g();return}g=String(g||'');if(!g)return;
  if(g==='log'){if(typeof S!=='undefined'&&S.sec&&S.sec.logs)show('logs');else show('play');return}
  if(g.indexOf('page:')===0){show(g.slice(5));return}go(g)}
 // done: o.undo = a function (-> Promise) or a write reply's undo list [{rel, id}] (then kit.undoBy is used and the button is greyed until
 // the server says each file can still be undone, S13). After Undo the box goes away, a short line says so, and BOTS_UI.changed('undo')
 // reads every list of the page again
 // S18: the box always reads "Done: <what changed>." (o.what, else the one line when there is one, else "written into your mod") and one
 // "To see it: ..." (a see text that starts with its own "To see it ..." lead is cut, so it is never said twice). o.rels = the files when
 // o.undo is a function (an undo list names them itself): the box joins the Undo registry of those files
 function seeText(k){return tx(k==='own'?'bots.see.own':'bots.see.bots')}
 function seeClean(s){s=String(s==null?'':s).trim();var ps=[tx('bots.done.see').replace(/[:：\s]+$/,''),'How to see it in the game','How to see it','To see it in the game','To see it'];
  for(var i=0;i<ps.length;i++){var p=ps[i];if(!p||s.toLowerCase().indexOf(p.toLowerCase())!==0)continue;var rest=s.slice(p.length),m=/^[^:：.]{0,24}[:：]\s*/.exec(rest);
   if(m){s=rest.slice(m[0].length).trim();break}if(/^[,\s]/.test(rest)||!rest){s=rest.replace(/^[,\s]+/,'').trim();break}}
  return s?s.charAt(0).toUpperCase()+s.slice(1):s}
 function done(id,o){o=o||{};var box=h('div',{class:'bots-done',role:'status','data-done':'1',style:'border:1px solid var(--okl,var(--ok));border-left:4px solid var(--ok);background:var(--ban);padding:8px 10px;margin:6px 0;border-radius:4px'});
  var ls=kidsOf(o.lines).map(String),what=o.what!=null&&o.what!==''?String(o.what):null;if(what==null&&!o.title&&ls.length===1){what=ls[0];ls=[]}
  box.appendChild(h('b',{class:'ok',text:o.title||(what?tx('bots.done.what',{what:what.replace(/[.\s]+$/,'')}):tx('bots.done.title'))}));
  if(ls.length)box.appendChild(h('ul',{style:'margin:4px 0 4px 18px;padding:0'},ls.map(function(l){return h('li',{text:l})})));
  var see=seeClean(o.see);if(see)box.appendChild(h('div',{style:'margin:4px 0'},[h('b',{text:tx('bots.done.see')+' '}),h('span',{text:see})]));
  var row=h('div',{class:'row'}),cnt=0,list=Array.isArray(o.undo)?o.undo.filter(function(x){return x&&x.rel}):null,un=list?(list.length?undoBy(list):null):o.undo;
  var rels=list?list.map(function(x){return x.rel}):kidsOf(o.rels);
  if(rels.length){UREG.push({kind:'done',el:box,rels:function(){return rels}});undoSync(rels,box,{quiet:true})}
  kidsOf(o.next).forEach(function(x){if(!x||!x.text)return;cnt++;row.appendChild(h('button',{type:'button',text:x.text,onclick:function(){goTo(x.go)}}))});
  if(typeof un==='function'){cnt++;var ub=h('button',{type:'button','data-undo':'1',text:tx('bots.btn.undo'),onclick:function(){ub.disabled=true;var st=h('div',{class:'hint',text:tx('bots.undo.wait')});box.appendChild(st);
    var r;try{r=un()}catch(e){r=Promise.reject(e)}
    Promise.resolve(r).then(function(){var src=srcOf(box),par=box.parentNode,note=h('div',{class:'hint','data-undone':'1',role:'status',text:undone(o.undone)});
      if(par){par.insertBefore(note,box);par.removeChild(box)}
      if(rels.length){UREG=UREG.filter(function(x){return x.el!==box});UREG.push({kind:'note',el:note,rels:function(){return rels}});undoSync(rels,note)}
      if(typeof o.onUndo==='function')try{o.onUndo()}catch(e){}changed('undo',src||par)},
     function(e){if(st.parentNode)st.parentNode.removeChild(st);if(box._uerr&&box._uerr.parentNode)box._uerr.parentNode.removeChild(box._uerr);box._uerr=undoErr(e,rels);box.appendChild(box._uerr);if(list)undoCheck(list,ub);else ub.disabled=false})}});row.appendChild(ub);
   if(list)undoCheck(list,ub)}
  if(cnt)box.appendChild(row);
  return id?leaf(id,[box]):box}
 // S18: one Undo state per file. Card Undos (undoBtn), green boxes (done) and "Undone" notes register the files they are about;
 // undoSync(rels, from) after an undo: the card Undos of those files ask again and lose their old line, stale green boxes and old notes
 // go. {quiet} (a new write): old lines and boxes go, the buttons are not asked again (the card that wrote asks itself)
 var UREG=[];
 function relKey(x){x=x&&typeof x==='object'&&x.rel!=null?x.rel:x;return String(x==null?'':x).replace(/\\/g,'/').replace(/^\/+/,'').replace(/^resource\//i,'').toLowerCase()}
 function undoSync(rels,from,o){o=o||{};var want=kidsOf(rels).map(relKey);
  UREG=UREG.filter(function(e){if(e.el&&e.el.isConnected===true)e.seen=true;return !(e.seen&&e.el.isConnected===false)});
  UREG.slice().forEach(function(e){if(e.el===from)return;var rs=[];try{rs=kidsOf(e.rels()).map(relKey)}catch(x){}
   if(want.length&&!rs.some(function(x){return want.indexOf(x)>=0}))return;
   if(e.kind==='btn'){e.clear();if(!o.quiet)e.refresh();return}
   if(e.el.parentNode)e.el.parentNode.removeChild(e.el);UREG=UREG.filter(function(x){return x!==e})})}
 // grey btn until GET undo says every file of list can be undone now ({rel, id}: that write must still be the newest)
 function undoCheck(list,btn){btn.disabled=true;btn.title=tx('bots.undo.checking');if(typeof S==='undefined'||!S.mod)return;
  api(BASE+'undo?'+qs({mod:S.mod})+list.map(function(x){return '&rel='+encodeURIComponent(x.rel)}).join('')).then(function(r){var fs=(r&&r.files)||[];
   var ok=list.every(function(x){var f=fs.filter(function(y){return y.rel===String(x.rel).replace(/\\/g,'/').replace(/^\/+/,'')})[0];return f&&f.ok&&(!x.id||f.id===x.id)});
   var ch=fs.some(function(y){return !y.ok&&y.key==='bots.e.undoChanged'});btn.disabled=!ok;btn.title=ok?'':tx(ch?'bots.undo.changedTip':'bots.undo.nothing')},function(){btn.disabled=true;btn.title=tx('bots.undo.nothing')})}
 // a refused Undo: the plain sentence with its next step; the file under Details (S2)
 function undoErr(e,rels){var f=(e&&e.params&&e.params.file)||kidsOf(rels).join(', ');
  return h('div',{'data-undoerr':'1'},[errBox(emsg(e)),f?details(null,[tx('bots.undo.file',{file:f})]):null].filter(Boolean))}
 // undoBtn(rels, {onDone}): the card's own Undo (S13: Preview, Write into my mod, Undo): the newest write of those files, one step back on
 // each press (the server keeps up to 20 per file). Greyed while there is nothing to undo; refresh() asks again (after a write)
 // o.out: the element (or a function -> it) where the card shows its results; the "Undone" line and a refusal are drawn there, in the
 // place of the done box; without it: in the card's result leaf (<card>.res) when there is one, else on a line of its own under the buttons
 function offScr(el){var pg=null;Object.keys(SCREENS).forEach(function(k){if(!pg&&within(SCREENS[k].root,el))pg=k});return !!pg&&!!SCREENS[pg].onScr&&!SCREENS[pg].onScr()}
 function undoBtn(rels,o){o=o||{};var b=h('button',{type:'button','data-cardundo':'1',text:tx('bots.btn.undo'),disabled:true,title:tx('bots.undo.nothing')}),note=null,el=null;
  function clear(){if(note&&note.parentNode)note.parentNode.removeChild(note);note=null}
  function say(node){clear();note=node;var out=typeof o.out==='function'?o.out():o.out;
   if(out){out.textContent='';out.appendChild(note);return}
   var row=el;for(var x=el.parentNode;x;x=x.parentNode){if((x.dataset&&x.dataset.blk!=null)||/\brow\b/.test(String(x.className||''))){row=x;break}}
   var par=row.parentNode;if(!par){el.appendChild(note);return}
   var kids=[].slice.call(par.children||[]),rl=kids.filter(function(k){return k.dataset&&k.dataset.blk&&/\.res$/.test(k.dataset.blk)})[0];
   if(rl){var t=rl.children[0]||rl;t.textContent='';t.appendChild(note);return}
   if(row.dataset&&row.dataset.blk!=null)note=leaf(row.dataset.blk+'.undone',[note]);
   var nx=kids[kids.indexOf(row)+1];if(nx)par.insertBefore(note,nx);else par.appendChild(note)}
  function relsNow(){return kidsOf(typeof rels==='function'?rels():rels)}
  // a button of a page that is not on screen does not ask (an Undo on another page that shares its file): that page is drawn again, and
  // asks, when it is next shown
  function refresh(){var rs=relsNow();b.disabled=true;if(!rs.length||typeof S==='undefined'||!S.mod||offScr(b))return;
   api(BASE+'undo?'+qs({mod:S.mod})+rs.map(function(x){return '&rel='+encodeURIComponent(x)}).join('')).then(function(r){var f=((r&&r.files)||[]).filter(function(x){return x.ok});
    var ch=((r&&r.files)||[]).some(function(x){return !x.ok&&x.key==='bots.e.undoChanged'});
    b.disabled=!f.length;b.title=f.length?tx('bots.undo.steps',{n:f.reduce(function(a,x){return Math.max(a,x.n)},0)}):tx(ch?'bots.undo.changedTip':'bots.undo.nothing');b._ok=f.map(function(x){return x.rel})},function(){b.disabled=true;b.title=tx('bots.undo.nothing')})}
  b.addEventListener('click',function(){var rs=b._ok||[];if(!rs.length)return;b.disabled=true;say(h('div',{class:'hint',role:'status',text:tx('bots.undo.wait')}));
   api(BASE+'undo',{mod:S.mod,undo:rs.map(function(x){return {rel:x}})}).then(function(){undoSync(rs,b);if(typeof o.onDone==='function')try{o.onDone()}catch(e){}
     say(h('div',{class:'hint','data-undone':'1',role:'status',text:undone(o.undone)}));changed('undo',b);refresh()},
    function(e){say(undoErr(e,rs));refresh()})});
  el=h('span',{},[b]);el.refresh=function(){clear();refresh()};el.button=b;
  UREG.push({kind:'btn',el:b,rels:relsNow,refresh:refresh,clear:clear});refresh();return el}
 // a line diff in the order people read it: in every run of changed lines the removed ones ('-') first, then the added ('+').
 // rows: {t|op, s|text} or [t, s] or [t, n, s]; t ' ' = context, '@' = a place line. diff(id, rows) = a pre (a leaf when id is given)
 function diffOrder(rows){var out=[],run=null;function norm(r){if(Array.isArray(r))return {t:String(r[0]),s:String(r.length>2?r[2]:r[1])};return {t:String(r.t!=null?r.t:r.op),s:String(r.s!=null?r.s:(r.text!=null?r.text:''))}}
  function flush(){if(!run)return;run.sort(function(a,b){return (a.t==='+')-(b.t==='+')||a.i-b.i});run.forEach(function(x){out.push({t:x.t,s:x.s})});run=null}
  (rows||[]).forEach(function(r,i){var x=norm(r);if(x.t==='-'||x.t==='+'){(run=run||[]).push({t:x.t,s:x.s,i:i})}else{flush();out.push(x)}});flush();return out}
 // diff(id, rows, {open}): the exact change, folded under the one label "Show the exact file change" (bots.showChange)
 function diff(id,rows,o){var pre=h('pre',{class:'bots-diff',style:'white-space:pre-wrap;margin:4px 0'},diffOrder(rows).map(function(x){return h('div',{class:x.t==='+'?'ok':x.t==='-'?'err':'hint',text:(x.t==='@'||x.t===' '?'  ':x.t+' ')+x.s})}));
  var d=fold(id,[pre],tx('bots.showChange'),'bots-det bots-change');if(o&&o.open)d.open=true;return d}
 function undoBy(list){list=(list||[]).filter(function(x){return x&&x.rel});if(!list.length)return null;return function(){return api(BASE+'undo',{mod:S.mod,undo:list})}}
 // searchKit once the box is in the page (round 1: searchKit before insertion had no parent, so no list ever showed)
 var PEND=[];
 function lows(a){return (a||[]).map(function(it){if(it&&it.lo==null)it.lo=[it.label,it.value,it.hint].filter(function(x){return x!=null&&x!==''}).join(' ').toLowerCase();return it})}
 function pick(input,o){o=o||{};var hd={input:input,sk:null,attached:false};if(!input||typeof searchKit!=='function')return hd;
  var so={};Object.keys(o).forEach(function(k){if(k!=='items'&&k!=='onReady')so[k]=o[k]});
  if(typeof so.index!=='function'&&typeof so.list!=='function'&&o.items){var src=o.items;so.index=function(s,dn){var g=function(a){hitsOf(lows(a),s,dn)};if(typeof src==='function')src(g);else g(src)}}
  function att(){if(hd.attached)return true;if(!input.parentNode)return false;hd.attached=true;
   try{hd.sk=searchKit(input,so)}catch(e){try{console.warn('bots kit.pick',e)}catch(x){}}
   if(typeof o.onReady==='function')try{o.onReady(hd.sk)}catch(e){}return true}
  if(!att()){PEND.push(att);var n=0;(function later(){if(hd.attached)return;if(att()){PEND=PEND.filter(function(f){return f!==att});return}
   n++;if(n<4)Promise.resolve().then(later);else if(n<80&&typeof setTimeout==='function')setTimeout(later,100)})()}
  return hd}
 function flushPicks(){PEND=PEND.filter(function(f){return !f()})}

 // ---- number editor (difficulty and start presets): rows from a file, number boxes, preview, write, undo, reset
 // opt: {id (block id of the card), file, title, lead, pick: function(row)->bool, filter: bool, see (how to see it in the game), next}
 function editor(opt){
  var file=opt.file,edits={},rows=[],id=opt.id,moreOpen=false,G=null;
  var tbl=h('div'),res=h('div'),flt=h('input',{type:'text',autocomplete:'off','aria-label':tx('bots.mp.filter')}),det=h('div');
  var bPrev=h('button',{type:'button',class:'primary',text:tx('bots.btn.preview'),onclick:function(){go2(false)}});
  var pv=null,bGo=h('button',{type:'button',class:'danger',text:tx('bots.btn.write'),disabled:true,onclick:function(){if(!G||!G.ok()||!pv)return;var cnt=pv&&pv.changes?pv.changes.length:0,lines=[n(cnt,'bots.save.askN')];if(pv&&pv.copiesWholeFile)lines.push(tx('bots.save.copy',{file:file}));else if(pv&&pv.copiesWholeFile===false)lines.push(tx('bots.save.replace',{file:file}));   // a write asks first, as Reset does
   (typeof askDo==='function'?askDo({title:tx('bots.btn.write'),lines:lines,where:pv&&pv.target||S.mod,ok:tx('bots.btn.write'),danger:true}):{then:function(cb){cb(confirm(lines.join(' ')))}}).then(function(yes){if(yes)go2(true)})}});
  var bRes=h('button',{type:'button',text:tx('bots.btn.reset'),disabled:true,title:tx('bots.reset.noCopy'),onclick:function(){(typeof askDo==='function'?askDo({title:tx('bots.btn.reset'),lines:[tx('bots.save.confirm')],where:S.mod,danger:true}):{then:function(cb){cb(confirm(tx('bots.save.confirm')))}}).then(function(yes){if(!yes)return;
   api(BASE+'reset',{mod:S.mod,file:file,write:true}).then(function(r){res.textContent='';edits={};pv=null;G.clear();setOwn(false);
    if(r.removed)res.appendChild(done(null,{lines:[tx('bots.save.resetDone')],see:opt.see||tx('bots.save.see'),undo:r.undo||[],onUndo:load}));else res.appendChild(h('div',{class:'hint',text:tx('bots.save.resetNone')}));
    load();cu.refresh();if(r.removed)changed('numbers',el)}).catch(function(e){res.textContent='';res.appendChild(errBox(e))})})}});
  // the card's own Undo (S13): the newest write of this file, one step back per press
  var cu=undoBtn(function(){return ['set/multiplayer/games/'+file]},{out:function(){return res},onDone:function(){load()}});
  function changes(){var c={};Object.keys(edits).forEach(function(k){c[k]=edits[k]});return c}
  function gname(g){return diffName(g)}
  // Reset follows the state: greyed with the reason while the mod has no copy of the file, else what a press does
  function setOwn(own){bRes.disabled=!own;bRes.title=tx(own?'bots.reset.tip':'bots.reset.noCopy')}
  // Write is greyed until a Preview of the numbers now in the boxes was shown (kit.gate)
  G=gate(bPrev,bGo,function(){return JSON.stringify(changes())});
  // a multiplier in match terms (round 3: "Easy - Army size x: 0.75 to 0.9" said nothing): what the bot gets against normal (1.00), and before
  var EFF={botCp:'units',bonusCp:'units',botMp:'money',bonusMp:'money',mpStart:'money',mpFinish:'money',botPayback:'payback',chargeDelay:'other',charge:'other',unitScore:'other'};
  function pct(v){return Math.round(Math.abs(Number(v)-1)*100)}
  function dir(v){return pct(v)===0?'same':Number(v)>1?'up':'down'}
  function plain(x){var a=String(x.was).trim(),b=String(x.now).trim(),k=EFF[x.field],isN=function(v){return /^\d+(\.\d+)?$/.test(v)};
   if(k&&isN(a)&&isN(b))return tx('bots.eff.'+k+'.'+dir(b),{g:gname(x.group),p:pct(b),f:tp('bots.f.',x.field).replace(/\s+x$/,''),was:tx('bots.eff.was.'+dir(a),{p:pct(a)})});
   return tx('bots.save.line',{g:gname(x.group),f:tp('bots.f.',x.field),a:a,b:b})}
  function go2(write){var c=changes();if(!Object.keys(c).length){res.textContent='';res.appendChild(h('div',{class:'hint',text:tx('bots.save.none')}));return}
   res.textContent='';res.appendChild(wait(null,tx(write?'bots.wait.write':'bots.wait.table')));
   api(BASE+'edit',{mod:S.mod,file:file,changes:c,write:write}).then(function(r){res.textContent='';
    if(!r.changes.length){res.appendChild(h('div',{class:'hint',text:tx('bots.save.none')}));G.clear();return}
    var lines=r.changes.map(plain);
    if(write){res.appendChild(done(null,{lines:lines,see:opt.see||tx('bots.save.see'),next:opt.next,undo:r.undo||[],onUndo:load}));edits={};pv=null;G.clear();setOwn(true);load();cu.refresh();changed('numbers',el);return}
    // S3: what is different in a match first; the file and its exact change folded
    res.appendChild(h('b',{text:n(r.changes.length,'bots.save.willN')}));
    res.appendChild(h('ul',{},lines.map(function(l){return h('li',{text:l})})));
    var ex=[tx('bots.save.exactFile',{p:r.target||file})].concat(r.changes.map(function(x){return x.id+': '+String(x.was).trim()+' -> '+x.now}));
    if(r.copiesWholeFile)ex.push(tx('bots.save.copy',{file:file}));
    res.appendChild(details(null,ex,tx('bots.showChange')));
    res.appendChild(h('div',{class:'hint',text:tx('bots.add.previewed')}));
    pv=r;G.shown(JSON.stringify(c));
   }).catch(function(e){res.textContent='';res.appendChild(errBox(e));G.clear()})}
  function cell(r){var inp=h('input',{type:'text',value:r.current,size:r.kind==='row'?'30':'9',autocomplete:'off',inputmode:r.kind==='row'?'text':'decimal','aria-label':gname(r.group)+', '+tp('bots.f.',r.field)});
   inp.addEventListener('input',function(){var v=inp.value.trim();if(v===r.current.trim())delete edits[r.id];else edits[r.id]=v;pv=null;G.touch();inp.className=(v!==r.vanilla.trim())?'changed':''});
   if(r.current.trim()!==r.vanilla.trim())inp.className='changed';
   // the stock value and a sensible range (round 3: "0 to 100" for a multiplier told nothing; the server still takes lib.js checkValue's
   // wider one): a multiplier 0.25 to 4 (a quarter to four times normal), a whole number 0 to four times its stock value
   var sv=Number(r.vanilla),hi=r.kind==='int'&&sv>0?String(Math.max(10,Math.round(sv*4))):'';
   // a multiplier's range is said once under the table (numRange: the same words as the error); a whole number shows its usual range here
   var rg=r.kind==='num'?'':hi?tx('bots.tbl.usual',{lo:'0',hi:hi}):'';
   if(r.kind==='num')inp.title=numRange();
   return h('td',{},[inp,h('div',{class:'hint',text:tx('bots.tbl.stock',{v:r.vanilla.trim()})+(rg?' · '+rg:'')})])}
  function numRange(){return tx('bots.tbl.numRange',{usual:tx('bots.tbl.usual',{lo:'0.25',hi:'4'})})}
  // the filter matches a group name, or the file the rows come from (what a Browse pick puts in): that file = all its rows
  function isFile(f){var l=String(file).toLowerCase();return f===l||f===l.split('/').pop()}
  function draw(){tbl.textContent='';var f=(flt.value||'').trim().toLowerCase(),all=!f||isFile(f);
   var sel=rows.filter(function(r){return opt.pick(r)&&(all||r.group.toLowerCase().indexOf(f)>=0||gname(r.group).toLowerCase().indexOf(f)>=0)});
   var fields=[],groups=[],by={};
   sel.forEach(function(r){if(fields.indexOf(r.field)<0)fields.push(r.field);if(groups.indexOf(r.group)<0)groups.push(r.group);by[r.group+'|'+r.field]=r});
   // nothing matches the filter: the one empty-result line
   if(!groups.length){tbl.appendChild(f&&rows.length?none(tx('bots.none.filter')):none());return}
   // a column head: the field's plain name, its hover text (bots.ft.<field>) says what the number does
   function th(x){var tip=has('bots.ft.'+x)?tx('bots.ft.'+x):'';return h('th',tip?{title:tip}:{},[/payback/i.test(x)?term(tp('bots.f.',x),'payback'):h('span',tip?{style:'text-decoration:underline dotted;cursor:help',text:tp('bots.f.',x)}:{text:tp('bots.f.',x)})])}
   function tableOf(fs){var head=h('tr',{},[h('th',{text:tx('bots.tbl.name')})].concat(fs.map(th)));
    var trs=groups.map(function(g){return h('tr',{},[h('th',{text:gname(g)})].concat(fs.map(function(x){var r=by[g+'|'+x];return r?cell(r):h('td')})))});
    return h('div',{style:'overflow-x:auto'},[h('table',{},[h('thead',{},[head]),h('tbody',{},trs)])])}
   // S8: with many columns (opt.main names the ones most people change) the rest sit under "More options"; the fold keeps its state
   var mainF=fields,restF=[];
   if(opt.main&&fields.length>opt.main.length){mainF=fields.filter(function(x){return opt.main.indexOf(x)>=0});restF=fields.filter(function(x){return opt.main.indexOf(x)<0});if(!mainF.length){mainF=fields;restF=[]}}
   tbl.appendChild(tableOf(mainF));
   if(restF.length){var m=more(null,[tableOf(restF)]);m.open=moreOpen||restF.some(function(x){return groups.some(function(g){var r=by[g+'|'+x];return r&&edits[r.id]!=null})});
    m.addEventListener('toggle',function(){moreOpen=!!m.open});tbl.appendChild(m)}
   if(sel.some(function(r){return r.kind==='num'}))tbl.appendChild(h('div',{class:'hint','data-range':'1',text:numRange()}))}
  function load(){tbl.textContent='';tbl.appendChild(wait(null,tx('bots.wait.table')));
   det.textContent='';det.appendChild(details(null,[tx('bots.save.fileIs',{file:'set/multiplayer/games/'+file})]));
   api(BASE+'table?'+qs({mod:S.mod,file:file})).then(function(r){rows=r.rows;setOwn(r.from==='mod');draw()}).catch(function(e){tbl.textContent='';tbl.appendChild(errBox(tx('bots.error',{m:emsg(e)})))})}
  // typing redraws the table once in the next frame, however fast the keys come
  var pend=false;function soon(){if(typeof requestAnimationFrame!=='function'){draw();return}if(pend)return;pend=true;requestAnimationFrame(function(){pend=false;draw()})}
  flt.addEventListener('input',soon);
  var el=section(id,opt.title,[opt.lead?hint(id+'.lead',opt.lead):null,opt.filter?fld(id+'.filter',tx('bots.mp.filter'),flt):null,leaf(id+'.table',[tbl],nm('table')),
   h('div',{class:'row',blk:id+'.btns','data-blkname':nm('edBtns')},[bPrev,bGo,cu,bRes]),leaf(id+'.res',[res],nm('res')),leaf(id+'.det',[det])]);
  // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box): index = the group names of this file
  // (with their shown names); a pick filters the table to that group. Built again when the rows change. Browse = the file picker on the
  // game data at the folder of this file (set/multiplayer/games/..): a pick gives the file's path there; another file the page knows is
  // opened (opt.onFile), and the table shows that file's rows
  var GIX=null;function gix(){if(GIX&&GIX.rows===rows)return GIX.items;var it=[],sn={};
   rows.forEach(function(r){if(!opt.pick(r)||sn[r.group])return;sn[r.group]=1;var dn=tp('bots.d.',r.group);if(dn==='bots.d.'+r.group)dn='';
    var shown=gname(r.group);it.push({label:shown,value:shown,hint:'',lo:(shown+' '+r.group+' '+dn).toLowerCase()})});GIX={rows:rows,items:it};return it}
  var GAMES='set/multiplayer/games/';
  function fdir(){var p=GAMES+file;return p.slice(0,p.lastIndexOf('/'))}
  if(opt.filter)searchKit(flt,{key:'bots.'+id+'.filter',index:function(s,dn){hitsOf(gix(),s,dn)},
   browse:{mode:'file',view:'data',start:fdir,exts:['inc'],toValue:function(p){var g=String(p||'').replace(/\\/g,'/').replace(/^resource\//i,'');return g.toLowerCase().indexOf(GAMES)===0?g.slice(GAMES.length):g.split('/').pop()}},
   onPick:function(v,it,from){flt.value=v;if(from==='browse'&&opt.onFile&&String(v).toLowerCase()!==String(file).toLowerCase()&&opt.onFile(v))return;draw()}});
  return {el:el,load:load,setFile:function(f){file=f;edits={};pv=null;G.clear();res.textContent='';load();cu.refresh()}}}

 // ---- multiplayer start settings (lobby presets): the preset file, its presets and the settings of a whole mode. Shown on Game Modes
 // GoH (kind goh): the preset files sit at presets/*.inc and the bot difficulty at presets/global_parameters/bots_generic.inc, which every
 // GoH preset takes in its bots block; that file is the second editor here (the Bots page is not available in GoH, GHMIS-66)
 function mpCard(){
  var goh=isGoh();
  var FILES=goh?['presets/preset_early.inc','presets/preset_mid.inc','presets/preset_late.inc','presets/frontlines_early.inc','presets/frontlines_mid.inc','presets/frontlines_late.inc','presets/laststand_early.inc','presets/laststand_mid.inc','presets/laststand_late.inc','presets/preset_test_early.inc','presets/preset_test_mid.inc','presets/preset_test_late.inc']:['presets_competitive.inc','presets_all.inc','presets_user.inc','presets_test.inc'];
  var isPreset=function(r){return r.part?r.part==='preset':(r.field==='start'||r.field==='finish'||r.field==='cp')};
  var fsel=h('select',{'aria-label':tx('bots.mp.file')},FILES.map(function(f){return h('option',{value:f,text:goh?f.replace('presets/',''):tp('bots.file.',f.replace('.inc',''))+' ('+f+')'})}));
  // a preset file picked in the filter's Browse opens here as if chosen in the file list (true = it is one of the list)
  var presets=editor({id:'mp.presets',file:FILES[0],title:tx('bots.mp.presets'),lead:'',filter:true,see:seeText('own'),pick:isPreset,onFile:function(f){var k=FILES.map(function(x){return x.toLowerCase()}).indexOf(String(f).toLowerCase());if(k<0)return false;fsel.value=FILES[k];presets.setFile(FILES[k]);if(!goh)modes.setFile(FILES[k]);return true}});
  var modes=goh?editor({id:'mp.modes',file:'presets/global_parameters/bots_generic.inc',title:tx('bots.diff.h'),lead:tx('bots.mp.gohBots'),see:tx('bots.diff.see'),main:DIFF_MAIN,pick:function(){return true}})
   :editor({id:'mp.modes',file:FILES[0],title:tx('bots.mp.modes'),lead:'',see:seeText('own'),pick:function(r){return !isPreset(r)}});
  fsel.addEventListener('change',function(){presets.setFile(fsel.value);if(!goh)modes.setFile(fsel.value)});
  presets.load();modes.load();
  return h('div',{blk:'mp',box:'col','data-blkname':nm('mp')},[section('mp.file',tx('bots.mp.h'),[hint('mp.file.lead',tx(goh?'bots.mp.gohLead':'bots.mp.lead')),fld('mp.file.pick',tx('bots.mp.file'),fsel),hint('mp.file.guide',tx('bots.mp.guide'))]),presets.el,modes.el])}
 function isGoh(){return typeof curGame==='function'&&!!curGame()&&curGame().kind==='goh'}
 // the difficulty numbers most people change (army size and income); the others fold under "More options" when there are more
 var DIFF_MAIN=['botCp','botMp','mpStart','mpFinish'];

 // ---- the groups of the three pages. A part (BOTS_PARTS, pushed by parts/<id>/client.js) and a page's own cards (opt.cards, same shape)
 // are drawn by group, then by order; a part that throws, or returns nothing, never breaks the page: a plain error box stands in its place
 var GROUPS=['A','B','C','D','E','F'],PAGE_OF={A:'bots',B:'bots',C:'bots',D:'unitai',E:'mapai',F:'bots'},CARD_PAGE={},SCREENS={};
 var PAGES=[['bots','bots.nav','bots.about.bots'],['unitai','unitai.nav','bots.about.unitai'],['mapai','mapai.nav','bots.about.mapai']];
 function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
 function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
 function gidNow(){return (typeof GID!=='undefined'&&GID)||'as64'}
 function ptitle(p){try{return String(p.title?p.title():p.id)}catch(e){return String(p.id)}}
 function sorted(list,g){return list.map(function(p,i){return {p:p,i:i}}).filter(function(x){return x.p&&x.p.group===g&&typeof x.p.draw==='function'})
  .sort(function(a,b){return ((Number(a.p.order)||0)-(Number(b.p.order)||0))||(a.i-b.i)}).map(function(x){return x.p})}
 function pid(p){return 'part.'+String(p.id).toLowerCase().replace(/[^a-z0-9.-]/g,'-')}
 // a part that could not be drawn: what it means in plain words, the error itself under Details
 function errLeaf(p,e){var m=(e&&e.message)||String(e);return leaf(pid(p)+'.err',[errBox(tx('bots.part.err',{name:ptitle(p),m:m})),details(null,[m])])}
 function isNode(n){return !!n&&typeof n==='object'&&(n.nodeType!=null||typeof n.tagName==='string')}
 // a part's nodes: blocks as they are, anything else in a leaf of its own (a container holds blocks only)
 function partNodes(p,env){var out;
  try{out=p.draw(env);if(out==null)out=[];if(!Array.isArray(out))out=[out];
   out=out.filter(function(n){return n!=null&&n!==false&&n!==''});
   if(out.some(function(n){return !isNode(n)&&typeof n!=='string'&&typeof n!=='number'}))throw new Error('draw gave something that is not a page element')}
  catch(e){try{console.warn('bots part '+p.id,e)}catch(x){}return [errLeaf(p,e)]}
  return out.map(function(n,i){return isB(n)?n:leaf(pid(p)+'.'+i,[typeof n==='number'?String(n):n])})}
 // env.api(method, path under /api/x/bots/, data, cb(errText, json, err)): the picked mod goes in like the page's own calls (query or
 // body); the game rides in the headers api() adds (x-arsenal-game, x-arsenal-goh). errText = the error as the page words it (emsg).
 // with no mod picked a call is not sent (the bots routes refuse it with 400): cb gets the pick-a-mod line, unless the data names
 // mod itself (mod:'' = a call that needs no mod)
 // opt (JOBS): {what} = the request's name in the job list, else the title of the part the path belongs to (+ the clicked button for a
 // POST); {job:false} = a poll, kept out of the list. A stopped request: cb(the stopped line, undefined, e) with e.cancelled
 function partOfPath(path){var id=String(path).split('/')[0],p=null;BOTS_PARTS.forEach(function(x){if(!p&&x&&String(x.id)===id)p=x});return p}
 function partApi(method,path,data,cb,opt){path=String(path||'').replace(/^\/+/,'');var d={};Object.keys(data||{}).forEach(function(k){d[k]=data[k]});
  var post=String(method||'GET').toUpperCase()==='POST',o={};if(opt&&opt.job===false)o.job=false;
  else{var pt=partOfPath(path);o.what=(opt&&opt.what)||(pt?jobWhat(ptitle(pt),post?clickedText():''):'');if(!o.what)o=undefined}
  var dn=function(e,r,x){try{if(cb)cb(e,r,x)}catch(y){try{console.warn('bots part callback',y)}catch(z){}}};
  if(!S.mod&&!('mod' in d)){var m=tx('bots.needmod');return Promise.resolve(null).then(function(){dn(m);return null})}
  if(d.mod==null)d.mod=S.mod||'';
  var p=post?api(BASE+path,d,o):api(BASE+path+(path.indexOf('?')<0?'?':'&')+qs(d),undefined,o);
  p.then(function(r){dn(null,r)},function(e){dn(emsg(e)||String(e),undefined,e)});return p}
 // BOTS_UI.go(blockId): 'group.X', a part block 'bots.<part>...' or a page card ('buys', 'diff'...): switch to the page that owns it,
 // open the folds around it and scroll there (a part that draws late is looked for again for 3 s)
 // the part whose id is the longest start of the block id ('bots.targets.symptom.x' -> part 'targets.symptom' before 'targets')
 function pageOf(id){id=String(id||'');var m=/^group\.([a-f])(\.|$)/i.exec(id);if(m)return PAGE_OF[m[1].toUpperCase()];
  var best=null,n=-1;BOTS_PARTS.forEach(function(p){if(!p||p.id==null)return;var a='bots.'+p.id,b=pid(p);
   [a,b].forEach(function(s){if((id===s||id.indexOf(s+'.')===0)&&s.length>n){n=s.length;best=p}})});
  if(best)return PAGE_OF[best.group]||'bots';
  return CARD_PAGE[id.split('.')[0]]||'bots'}
 function findBlk(r,id){var exact=null,pre=null;(function walk(n){if(exact||!n||!n.children)return;for(var i=0;i<n.children.length&&!exact;i++){var k=n.children[i],b=k&&k.dataset?k.dataset.blk:null;
   if(b===id){exact=k;return}if(!pre&&b&&b.indexOf(id+'.')===0)pre=k;walk(k)}})(r);return exact||pre}
 // the first reads of the parts in a folded group, held by drawGroups until the group is unfolded
 function runHeld(d){var a=d&&d._held;if(!a)return;d._held=null;a.forEach(function(f){f()})}
 function reveal(el){for(var n=el;n;n=n.parentNode){if(n.tagName==='DETAILS'&&!n.open)n.open=true;if(n.tagName==='DETAILS'&&n.open)runHeld(n);if(n._fold&&n.dataset&&n.dataset.folded==='1')n._fold.set(true)}  try{if(el.scrollIntoView)el.scrollIntoView({block:'start',behavior:'smooth'})}catch(e){}
  try{el.style.outline='2px solid var(--pri)';setTimeout(function(){el.style.outline=''},1600)}catch(e){}}
 // only = true (a task button): every other card of the page folds, so the target is the one open card
 function within(a,b){for(var n=b;n;n=n.parentNode)if(n===a)return true;return false}
 function foldOthers(sc,el){cardsIn(sc.root,[]).forEach(function(c){if(c._fold&&!within(c,el)&&!within(el,c))c._fold.set(false)})}
 function go(id,only){id=String(id||'').replace(/^group\.([A-F])/,function(a,g){return 'group.'+g.toLowerCase()});var page=pageOf(id),tries=0;
  if(typeof S!=='undefined'&&S.cur!==page&&typeof show==='function')show(page);
  (function look(){var sc=SCREENS[page],el=sc&&findBlk(sc.root,id);if(el){if(only)foldOthers(sc,el);reveal(el);return}if(++tries<20)setTimeout(look,150)})();
  return page}
 // ---- after a write: the other parts of that page drawn again in place (see the file head)
 var LIS=[],LASTP=null;
 function itemsAll(){var a=[];Object.keys(SCREENS).forEach(function(pg){(SCREENS[pg].items||[]).forEach(function(it){a.push({pg:pg,it:it})})});return a}
 function srcOf(from){if(!from)return LASTP;if(typeof from==='object'&&typeof from.draw==='function')return from;
  if(typeof from==='string'){var f=null,n=-1;itemsAll().forEach(function(x){var p=x.it.p;[String(p.id),'bots.'+p.id,pid(p)].forEach(function(s){if((from===s||from.indexOf(s+'.')===0)&&s.length>n){n=s.length;f=p}})});return f||LASTP}
  for(var e=from;e;e=e.parentNode)if(e._botsPart)return e._botsPart;return LASTP}
 function redraw(sc,it){var old=it.nodes,first=null;for(var i=0;i<old.length;i++)if(old[i].parentNode){first=old[i];break}
  if(!first)return false;
  LIS=LIS.filter(function(x){return x.p!==it.p});
  var ns=partNodes(it.p,sc.envFor(it.p)),par=first.parentNode;ns.forEach(function(n){n._botsPart=it.p;par.insertBefore(n,first)});
  old.forEach(function(n){if(n.parentNode)n.parentNode.removeChild(n)});it.nodes=ns;return true}
 function changed(what,from){var src=srcOf(from),page=null;
  itemsAll().forEach(function(x){if(x.it.p===src)page=x.pg});
  if(!page)page=(typeof S!=='undefined'&&S.cur&&SCREENS[S.cur])?S.cur:'bots';
  LIS.slice().forEach(function(x){if(x.p!==src)try{x.fn(what,src&&src.id)}catch(e){try{console.warn('bots onChanged',e)}catch(y){}}});
  var sc=SCREENS[page];if(!sc||!sc.items)return 0;var n=0,lost=false;
  // after an Undo the part it came from is read again too (its done box is gone, its lists are stale); after a write it keeps its result
  sc.items.slice().forEach(function(it){var p=it.p;if((p===src&&what!=='undo')||p.watch===false)return;if(Array.isArray(p.watch)&&p.watch.indexOf(what)<0)return;if(redraw(sc,it))n++;else lost=true});
  // a card the profile moved into another redrawn card went out with it: then the whole page is drawn again
  function inRoot(e){for(var x=e;x;x=x.parentNode)if(x===sc.root)return true;return false}
  if(!lost)lost=sc.items.some(function(it){return it.nodes.length&&!it.nodes.some(inRoot)});
  if(lost){sc.load();return n}
  if(n){if(typeof blkApply==='function')blkApply(sc.root);flushPicks();foldCards(sc);taskState(sc)}
  return n}
 function onChanged(fn){if(typeof fn==='function')LIS.push({fn:fn,p:null})}
 var kit={section:section,leaf:leaf,hint:hint,errBox:errBox,qs:qs,hitsOf:hitsOf,editor:editor,go:go,
  details:details,more:more,done:done,na:na,wait:wait,pick:pick,undoBy:undoBy,emsg:emsg,stopBox:stopBox,jobWhat:jobWhat,diff:diff,diffOrder:diffOrder,changed:function(w,f){return changed(w,f)},
  rows:rows,n:n,term:term,undoBtn:undoBtn,naText:naText,fold:function(card,o){return foldCard(card,o)},
  seeText:seeText,undoSync:function(rels){undoSync(rels,null)},needMod:needMod,needGame:needGame,modName:modName,
  army:army,kind:kind,game:game,undone:undone,none:none,gate:gate,diffName:diffName,hasGame:hasGame};
 // the mod as people know it: its folder name (S10: never the full path in the main text; the path rides in the hover text)
 function modName(p){p=String(p==null?(typeof S!=='undefined'&&S.mod)||'':p).replace(/[\\\/]+$/,'');var i=Math.max(p.lastIndexOf('/'),p.lastIndexOf('\\'));return i>=0?p.slice(i+1):p}
 // the one no-mod line of the three pages (S18): a part with nothing to show before a mod is picked puts this in its card
 function needMod(id){var el=h('div',{class:'err','data-needmod':'1'},[h('span',{text:tx('bots.needmod')+' '}),h('button',{type:'button',text:tx('bots.needmod.btn'),onclick:function(){if(typeof show==='function')show('mods')}})]);return id?leaf(id,[el]):el}
 // the one no-game-folder line (the same words on the three pages): what is missing, and the button to where it is set
 function needGame(id){var el=h('div',{class:'err','data-nogame':'1'},[h('span',{text:tx('bots.needGame')+' '}),h('button',{type:'button',text:tx('bots.needGame.btn'),onclick:function(){if(typeof gameOpen==='function')gameOpen();else if(typeof show==='function')show('settings')}})]);return id?leaf(id,[el]):el}
 // the folder of the current game is set (Gates of Hell has its own)
 function hasGame(){try{if(typeof curFolder==='function')return !!curFolder();return !!gameDir()}catch(e){return false}}
 // the short task list at the top of a page: [{k: lang key, go: block id, mod: true = needs a picked mod}]; a task whose card is not on
 // the page (a part that did not load) is left out
 function taskBox(page,o){var list=(o.tasks||[]).filter(function(t){var g=String(t.go||'');if(!g)return false;if(CARD_KNOWN[page]&&CARD_KNOWN[page][g.split('.')[0]])return true;
   return BOTS_PARTS.some(function(p){if(!p||p.id==null)return false;var a='bots.'+p.id;return g===a||g.indexOf(a+'.')===0})});
  // t.games: the game ids it works in (else every game); a line for another game is not listed (S15)
  list=list.filter(function(t){return !t.games||t.games.indexOf(gidNow())>=0});
  if(!list.length)return null;
  var lis=[],ul=h('ul',{style:'margin:2px 0 2px 18px;padding:0'},list.map(function(t){var li=h('li',{style:'margin:3px 0'},[h('button',{type:'button',class:'linkish','data-task':t.go,text:tx(t.k),
   onclick:function(){if(t.mod&&!S.mod){go('needmod');return}go(t.go,true)}})]);if(!(t.mod&&!S.mod))lis.push({t:t,li:li});return li}));
  var el=h('div',{blk:'tasks',box:'col','data-blkname':tx(o.taskH||'bots.task.h')},[leaf('tasks.h',[h('h3',{text:tx(o.taskH||'bots.task.h')})]),leaf('tasks.list',[ul])]);
  return {el:el,lis:lis}}
 // one line: what the other two pages are for, each with a button there
 function pagesLine(page){var kids=[h('span',{class:'hint',text:tx('bots.about.h')+' '})];
  PAGES.forEach(function(x){if(x[0]===page)return;kids.push(h('button',{type:'button','data-page':x[0],text:tx(x[1]),onclick:function(){if(typeof show==='function')show(x[0])}}));kids.push(h('span',{class:'hint',text:' '+tx(x[2])+'  '}))});
  return leaf('pages',[h('div',{class:'row',style:'flex-wrap:wrap;align-items:center;gap:4px'},kids)])}
 // the game, said once (S7): GoH says what does not work on the Bots page and what does; MoW:AS2 that its own values are shown
 function gameLine(page){if(isGoh())return page==='bots'?leaf('game',[na(null,tx('bots.game.goh'))]):null;
  if(gidNow()==='mowas2')return hint('game',tx('bots.game.mowas2'));return null}
 var CARD_KNOWN={};
 // ---- S10: cards fold to their title and one line. On a page only the first card of the open group starts open; a card keeps the state
 // the user gave it while the page is open (a redraw after a write keeps it). go() opens the folds around its target
 var FOLD={};
 function cssOnce(){try{if(document.getElementById('bots-css'))return;var st=document.createElement('style');st.id='bots-css';
  st.textContent='.bots-folded>:not(.bots-foldhead){display:none!important}.bots-foldhead h3{cursor:pointer;margin-bottom:2px}.bots-foldline{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  (document.head||document.body).appendChild(st)}catch(e){}}
 function headOf(card){for(var i=0;i<card.children.length;i++){var k=card.children[i];if(k.dataset&&k.dataset.blk&&/(^|\.)title$/.test(k.dataset.blk))return k}return null}
 // the one line: the card's lead (a leaf whose id ends in .lead), else its first hint that is not a wait line
 function lineOf(card,head){var lead='',first='';(function walk(n){if(lead||!n||!n.children)return;for(var i=0;i<n.children.length&&!lead;i++){var k=n.children[i];if(k===head||(k.dataset&&k.dataset.wait))continue;
    var b=k.dataset&&k.dataset.blk,tt=String(k.textContent||'').trim();if(b&&/\.lead$/.test(b)&&tt){lead=tt;return}
    if(!first&&/\bhint\b/.test(String(k.className||''))&&tt&&!/\bbots-foldline\b/.test(String(k.className||'')))first=tt;walk(k)}})(card);
  var t=lead||first;return t.length>160?t.slice(0,157)+'...':t}
 function foldCard(card,o){o=o||{};if(!card||card._fold||!card.dataset)return card;var head=headOf(card),h3=null;if(!head)return card;
  for(var i=0;i<head.children.length;i++)if(head.children[i].tagName==='H3'){h3=head.children[i];break}if(!h3)return card;
  cssOnce();var key=(o.page||'')+'|'+card.dataset.blk;
  var line=h('span',{class:'hint bots-foldline','data-foldline':'1'}),mk=h('span',{'aria-hidden':'true',style:'display:inline-block;width:1.1em'});
  h3.insertBefore(mk,h3.firstChild);head.appendChild(line);head.classList.add('bots-foldhead');
  h3.setAttribute('role','button');h3.setAttribute('tabindex','0');
  var off=hasNa(card);if(off){h3.style.opacity='.6';line.style.opacity='.75';line.style.fontStyle='italic'}
  function set(open){FOLD[key]=!!open;card.dataset.folded=open?'0':'1';if(open)card.classList.remove('bots-folded');else card.classList.add('bots-folded');
   mk.textContent=open?'▾ ':'▸ ';line.textContent=open?'':off?tx('bots.na.short',{game:gameFull()}):lineOf(card,head);line.hidden=!!open;h3.setAttribute('aria-expanded',open?'true':'false')}
  card._fold={set:set,key:key};
  h3.addEventListener('click',function(){set(card.dataset.folded==='1')});
  h3.addEventListener('keydown',function(e){if(e&&(e.key==='Enter'||e.key===' ')){if(e.preventDefault)e.preventDefault();set(card.dataset.folded==='1')}});
  set(FOLD[key]!=null?FOLD[key]:!!o.open);return card}
 // a card whose body is the greyed na() line (it cannot work in this game)
 function hasNa(n){if(!n||!n.children)return false;for(var i=0;i<n.children.length;i++){var k=n.children[i];if(k.dataset&&k.dataset.na)return true;if(hasNa(k))return true}return false}
 function cardsIn(n,out){if(!n||!n.children)return out;for(var i=0;i<n.children.length;i++){var k=n.children[i];if(/\bcard\b/.test(String(k.className||''))&&k.dataset&&k.dataset.blk)out.push(k);else cardsIn(k,out)}return out}
 function foldCards(sc){var all=cardsIn(sc.root,[]),grp=null;
  for(var i=0;i<sc.root.children.length&&!grp;i++){var g=sc.root.children[i];if(/\bbots-grp\b/.test(String(g.className||''))&&g.open)grp=g}
  var fc=typeof sc.firstCard==='function'?sc.firstCard():sc.firstCard,inG=grp?cardsIn(grp,[]):all,first=(fc&&inG.filter(function(c){return c.dataset.blk===fc})[0])||inG[0];
  all.forEach(function(c){foldCard(c,{page:sc.page,open:c===first})})}
 // the task lines of a page: hidden when the card is not there, or is greyed (cannot work in this game, S15) or says pick a mod first
 function taskState(sc){var box=sc.tasks;if(!box)return;var lis=box.lis||[],shown=0;
  lis.forEach(function(x){var el=findBlk(sc.root,x.t.go),bad=!el||!!(el.querySelector&&el.querySelector('[data-na]'));
   if(!el)try{console.error('bots task "'+x.t.k+'" points at '+x.t.go+', which is not on the page')}catch(e){}
   x.li.hidden=bad;if(!bad)shown++});
  box.el.hidden=!shown}
 // drawGroups(root, ['A','B'...], opt): the whole screen of a page. opt = {page: 'bots'|'unitai'|'mapai', h1, lead (lang keys),
 // cards: function(env) -> the page's own cards as parts, before: function() run before each draw, tasks, taskH (see taskBox),
 // known: the ids of the page's own cards (for the tasks)}. Returns {refresh, focus}.
 // Title and lead once; each draw (refresh, a mod change) removes the blocks of the last draw from wherever the profile put them and
 // draws them again with the same ids: the task list, the other pages, the game line, the mod line (or the pick-a-mod line), the game
 // folder line, then one fold per group (the first open, the others folded unless opened before; a folded one shows its lead)
 function drawGroups(root,groups,opt){opt=opt||{};var page=opt.page||'bots',drawn=[],sc={root:root,items:[]};
  CARD_KNOWN[page]={};(opt.known||[]).forEach(function(k){CARD_KNOWN[page][k]=1});
  root.appendChild(h('div',{blk:'title'},[h('h2',{text:tx(opt.h1||'bots.h1')})]));
  root.appendChild(h('div',{blk:'lead'},[h('div',{class:'hint',text:tx(opt.lead||'bots.lead')})]));
  // the part last clicked: the one a changed() with no 'from' came from
  try{root.addEventListener('click',function(e){for(var n=e&&e.target;n&&n!==root;n=n.parentNode)if(n._botsPart){LASTP=n._botsPart;return}},true)}catch(e){}
  function add(el){if(!el)return;root.appendChild(el);drawn.push(el)}
  function group(g,kids,first){var t=tx('bots.g.'+g),key='bots.fold.'+page+'.'+g,b='group.'+g.toLowerCase(),was=lsGet(key),open=was==null?first:was!=='0';
   var lead=h('span',{class:'hint','data-grplead':'1',style:'font-weight:normal;font-size:12px;margin-left:10px',text:tx('bots.g.'+g+'.lead')});
   var d=h('details',{blk:b,box:'col','data-blkname':t,class:'bots-grp',open:open,style:'margin:14px 0 4px'},
    [h('summary',{style:'font-weight:bold;font-size:1.15em;margin:4px 0;cursor:pointer'},[h('span',{text:t}),lead]),hint(b+'.lead',tx('bots.g.'+g+'.lead'))].concat(kids));
   lead.hidden=!!open;
   d.addEventListener('toggle',function(){lsSet(key,d.open?'1':'0');lead.hidden=!!d.open;if(d.open)runHeld(d)});return d}
  function envFor(p){var e={};Object.keys(sc.env).forEach(function(k){e[k]=sc.env[k]});
   e.onChanged=function(fn){if(typeof fn==='function')LIS.push({fn:fn,p:p})};e.changed=function(w){return changed(w,p.id)};
   // lazy folds: what a part reads (GET) while it is drawn waits until load() knows whether the part sits in a folded group (held below)
   e.api=function(method,path,data,cb,opt){if(!sc.drawing||String(method||'GET').toUpperCase()==='POST')return partApi(method,path,data,cb,opt);
    var w=new Promise(function(res){HELD.push({p:p,run:function(){res(partApi(method,path,data,cb,opt))}})});w.catch(function(){});return w};return e}   // as partApi's own promise: a failed read goes to cb, a caller that ignores the promise raises nothing
  // a part inside a folded group (the details of group(), wherever the layout profile put the part) is not on the screen: its first reads are
  // sent when the group is unfolded (toggle, or reveal() of go()). A part in an open group, or moved out of its group, reads at once as before
  var HELD=[];
  function foldOf(p){var it=sc.items.filter(function(x){return x.p===p})[0],n=it&&it.nodes&&it.nodes[0];if(!n)return null;
   for(n=n.parentNode;n&&n!==root;n=n.parentNode)if(n.tagName==='DETAILS'&&/\bbots-grp\b/.test(String(n.className||''))&&!n.open)return n;return null}
  function sendHeld(){var q=HELD;HELD=[];q.forEach(function(x){var d=foldOf(x.p);if(d)(d._held=d._held||[]).push(x.run);else x.run()})}
  sc.envFor=envFor;
  function load(){
   drawn.forEach(function(e){if(e.parentNode)e.parentNode.removeChild(e)});drawn=[];
   var mine=sc.items.map(function(it){return it.p});LIS=LIS.filter(function(x){return mine.indexOf(x.p)<0});sc.items=[];
   if(opt.before){try{opt.before()}catch(e){}}
   var env={mod:S.mod||'',gid:gidNow(),page:page,api:partApi,reload:function(){sc.load()},kit:kit,go:go,changed:changed,onChanged:onChanged};sc.env=env;var cards=[];
   if(opt.cards){try{cards=opt.cards(env)||[]}catch(e){cards=[]}}
   cards.forEach(function(c){if(c&&c.id){CARD_PAGE[c.id]=page;CARD_KNOWN[page][c.id]=1}});
   var tb=taskBox(page,opt);sc.tasks=tb;add(tb&&tb.el);add(pagesLine(page));add(gameLine(page));
   // no mod: the same line and button on all three pages
   if(!S.mod)add(needMod('needmod'));
   else{add(leaf('mod',[h('div',{class:'hint',title:S.mod,text:tx('bots.mod',{p:modName(S.mod)})})]));
    if(!hasGame())add(needGame('nogame'))}   // saving reads the stock files from the game folder: say so before the first try
   var all=cards.concat(BOTS_PARTS);HELD=[];sc.drawing=true;
   try{groups.forEach(function(g,gi){var kids=[];sorted(all,g).forEach(function(p){var ns=partNodes(p,envFor(p));ns.forEach(function(n){n._botsPart=p});sc.items.push({p:p,nodes:ns});kids=kids.concat(ns)});
    if(!kids.length)kids.push(hint('group.'+g.toLowerCase()+'.none',tx('bots.g.none')));var fg=typeof opt.firstGroup==='function'?opt.firstGroup():opt.firstGroup;add(group(g,kids,fg?g===fg:gi===0))})}finally{sc.drawing=false}
   blkApply(root);flushPicks();lastOnes();foldCards(sc);taskState(sc);sendHeld()}
  // opt.last: block ids put at the end of their group (the internals after the recipes), before the folds are set
  function lastOnes(){(opt.last||[]).forEach(function(id){var el=findBlk(root,id);if(!el||!el.parentNode)return;var p=el.parentNode;p.removeChild(el);p.appendChild(el)})}
  // lazy: nothing is drawn, and no part asks the server, before the page is first shown (show0 calls refresh then). A redraw asked for
  // while another page is on screen (a part's late reply, a card lost by a write) is dropped: the next show draws the whole page again
  function onScr(){try{return typeof S==='undefined'||!S.cur||!S.screens||!S.screens[page]||S.cur===page}catch(e){return true}}
  sc.load=function(){if(onScr())load()};sc.onScr=onScr;sc.page=page;sc.firstCard=opt.firstCard;SCREENS[page]=sc;
  return {refresh:load,focus:function(){}}}

 return {BASE:BASE,tp:tp,nm:nm,qs:qs,errBox:errBox,hitsOf:hitsOf,leaf:leaf,hint:hint,section:section,editor:editor,mpCard:mpCard,
  kit:kit,drawGroups:drawGroups,go:go,pageOf:pageOf,changed:changed,onChanged:onChanged,emsg:emsg,isGoh:isGoh,GROUPS:GROUPS,PAGE_OF:PAGE_OF,DIFF_MAIN:DIFF_MAIN};
})();
if(typeof window!=='undefined'){window.BOTS_UI=BOTS_UI;window.BOTS_PARTS=BOTS_PARTS}   // for tests and the browser console
`;

const screen = String.raw`
EXT_SCREENS.bots=function(root){
 var U=BOTS_UI,K=U.kit,BASE=U.BASE,tp=U.tp,nm=U.nm,qs=U.qs,errBox=U.errBox,leaf=U.leaf,hint=U.hint,section=U.section,editor=U.editor;
 var CLS=['Infantry','ATInfantry','Vehicle','Tank','AATank','ATTank','HeavyTank','ArtilleryTank'];
 var ADV=[['statsheet','statsheet'],['conflicts','conflicts'],['overdiff','overdiff'],['patch-entity','patchentity'],['botrecipe','botrecipe'],['gen','gen']];
 var addFill=null;
 var listFrom=null;   // where the bot shopping list was read from by the last buys reply: 'mod' (the mod has its own copy), else the game; null = not known
 var LABELS={},NAMES={};   // army id -> its label in the bot list; unit -> in-game name (the buys and units replies)
 var BOTREL='script/multiplayer/bot.data.lua',BOTDATA='resource/script/multiplayer/bot.data.lua',GOH_BOTS='presets/global_parameters/bots_generic.inc';
 // an army by its name in the window language (kit.army); an army only the mod knows = the name the server read for it
 // GoH: the lobby name the server read from the game's .pot texts wins over the AS2 word for the code (its eng is not the AS2 eng)
 function armyName(a){if(!a)return '';var own=LABELS[a]||ANAMES[a];return U.isGoh()&&own?String(own):K.army(a,own)}
 var ANAMES={};   // army code -> in-game name from the units reply (the server's stock names when a list has no comments)
 function unitName(u){return NAMES[u]||u}
 // ---- how bots choose: two lines, the rest folded
 // GoH: its own two lines (its bots read a list per army and period, not bot.data.lua), the files under Details
 function how(){var li=function(i){return h('li',{text:tp('bots.how',i)})};
  if(U.isGoh())return section('how',tx('bots.how.h'),[hint('how.lead',tx('bots.how.goh.1')),hint('how.goh',tx('bots.how.goh.2')),K.details('how.det',[tx('bots.how.goh.files')])]);
  return section('how',tx('bots.how.h'),[hint('how.lead',tp('bots.how',1)),leaf('how.list',[h('ul',{},[li(4)])]),
   leaf('how.words',[h('div',{class:'hint'},[h('span',{text:tx('bots.buys.terms')+' '}),K.term(tx('bots.term.stage'),'stage'),h('span',{text:', '}),K.term(tx('bots.term.priority'),'priority'),h('span',{text:', '}),K.term(tx('bots.term.buycard'),'buycard')])]),
   K.more('how.more',[h('ul',{},[li(2),li(3),li(5),li(6)])],tx('bots.how.more'))])}

 // ---- what bots buy. GoH: the purchase list of each army (units/<army>/<list>.<army>.lua), one list at a time (gohList), read only
 var gohList='';
 function buysCard(){
  var goh=U.isGoh(),stat=h('div',{},[K.wait(null,tx('bots.wait.buys'))]);
  var box=section('buys',tx('bots.buys.h'),[hint('buys.lead',tx(goh?'bots.buys.gohLead':'bots.buys.lead')),leaf('buys.stat',[stat],nm('stat'))]);
  api(BASE+'buys?'+qs(goh?{mod:S.mod,list:gohList}:{mod:S.mod})).then(function(r){
   if(goh){gohList=r.list;
    var lsel=h('select',{'aria-label':tx('bots.buys.list')},(r.lists||[]).map(function(l){return h('option',{value:l,text:l})}));lsel.value=r.list;
    lsel.addEventListener('change',function(){gohList=lsel.value;var nb=buysCard();if(box.parentNode)box.parentNode.replaceChild(nb,box);blkApply(root)});
    box.appendChild(fld('buys.gohlist',tx('bots.buys.list'),lsel));if(addFill&&addFill.lists)addFill.lists(r.lists||[],r.list)}
   stat.textContent='';listFrom=r.from==='mod'?'mod':'game';
   LABELS=r.labels||{};Object.keys(r.names||{}).forEach(function(u){NAMES[u]=r.names[u]});
   stat.appendChild(h('div',{class:'hint',text:tx(r.from==='mod'?'bots.buys.srcMod':'bots.buys.srcGame')}));
   if(r.ownBot)stat.appendChild(h('div',{class:'err',text:tx('bots.buys.own')}));
   var seen={};r.stages.forEach(function(s){Object.keys(s.armies).forEach(function(a){seen[a]=1})});
   var armies=Object.keys(seen);
   buyUnits=[];r.stages.forEach(function(s){Object.keys(s.armies).forEach(function(a){s.armies[a].forEach(function(u){buyUnits.push({unit:u.unit,army:a,src:'list',name:NAMES[u.unit]})})})});if(UIX.items)UIX={mod:null,items:null,wait:[]};
   if(addFill&&addFill.armies)addFill.armies(armies);
   if(addFill&&addFill.stages)addFill.stages(r.stages.length);
   if(addFill&&addFill.classes)addFill.classes(r.classes);
   // armies by their in-game names (S11): the code small beside the box
   // S20: the army by its in-game name only (the code rides in the option's hover text)
   var sel=h('select',{'aria-label':tx('bots.buys.army')},armies.map(function(a){return h('option',{value:a,title:a,text:armyName(a)})}));
   var out=h('div');
   // the first stage open (5 rows, then "Show all"), the later stages under one fold: the first screen stays short (round 3: 66 lines)
   function draw(){out.textContent='';var a=sel.value,later=[];
    r.stages.forEach(function(s,i){var list=s.armies[a]||[],kids=[];
     var rv=s.repeats&&a in s.repeats?s.repeats[a]:s.repeat;
     var rep=rv===0||rv==null?tx('bots.rep.inf'):K.n(rv,'bots.rep.k');
     kids.push(h('b',{},[K.term(tx('bots.buys.stage',{n:s.n,rep:rep}),'stage')]));
     if(!list.length)kids.push(h('div',{class:'hint',text:tx('bots.buys.none')}));
     else kids.push(K.rows(list.map(function(u){var c=kindName(u.cls);
      // a GoH conquest row has no priority: its availability is the weight its bot scores
      var w=u.priority==null&&u.availability!=null?h('span',{text:tx('bots.buys.availP',{a:u.availability})}):K.term(tx('bots.buys.prioP',{p:u.priority}),'priority');
      return h('li',{},[h('span',{text:unitName(u.unit)+' ('+c+', '}),w,h('span',{text:')'}),NAMES[u.unit]?h('small',{class:'hint',text:'  '+u.unit}):null])}),{show:5}));
     if(i===0)kids.forEach(function(k){out.appendChild(k)});else later=later.concat(kids)});
    if(later.length)out.appendChild(K.more(null,later,K.n(r.stages.length-1,'bots.buys.later')))}
   sel.addEventListener('change',draw);
   box.appendChild(fld('buys.army',tx('bots.buys.army'),sel));
   box.appendChild(leaf('buys.list',[out],nm('list')));draw();
   if(addFill&&addFill.missing)addFill.missing(r.cards.filter(function(c){return !c.listed}));
   if(!r.compared)box.appendChild(hint('buys.nocompare',tx('bots.buys.nocompare')));
   if(goh){var fl=h('div',{class:'hint'});
    var fileLine=function(){var f=r.files&&r.files[sel.value];fl.textContent=f?tx('bots.buys.file',{f:f.rel})+' ('+tx(f.from==='mod'?'bots.buys.srcMod':'bots.buys.srcGame')+')':''};
    sel.addEventListener('change',fileLine);fileLine();box.appendChild(leaf('buys.file',[fl],nm('file')));
    if(r.modes&&r.modes.length)box.appendChild(K.details('buys.modes',[h('ul',{},r.modes.map(function(m){return h('li',{text:tx('bots.buys.modeRow',{m:m.mode,l:m.list==='period'?tx('bots.buys.period'):(m.list||tx('bots.buys.unknownList'))})})}))],tx('bots.buys.modes')));
    if(r.notRead&&r.notRead.length)box.appendChild(K.details('buys.notread',[K.rows(r.notRead.map(function(x){return h('li',{class:'err',text:tx('bots.buys.notReadRow',{f:x.file,l:x.line,w:x.what})})}),{show:10})],tx('bots.buys.notRead',{n:r.notRead.length})))}
   blkApply(root);
  }).catch(function(e){stat.textContent='';stat.appendChild(errBox(tx('bots.error',{m:U.emsg(e)})));if(addFill&&addFill.missing)addFill.missing(null)});
  return box}

 // ---- GoH: add a unit to one purchase list of one army (botrecipe --exe goh --buy-first U --army A --stage <list>): a copy of a row of the
 // asked kind (or of the "after" unit's row) with the unit in it, into the mod's copy of script/multiplayer/units/<army>/<list>.<army>.lua
 function gohAddCard(){
  var uin=h('input',{type:'text',autocomplete:'off',placeholder:tx('bots.add.unitHint'),'aria-label':tx('bots.add.unit')});
  var uname=h('div',{class:'hint','data-uname':'1'});
  var asel=h('select',{'aria-label':tx('bots.add.army')}),lsel=h('select',{'aria-label':tx('bots.add.list')});
  var csel=h('select',{'aria-label':tx('bots.add.gohCls')},[h('option',{value:'',text:tx('bots.add.auto')})]);
  var prio=h('input',{type:'text',value:'',size:'6',inputmode:'decimal','aria-label':tx('bots.add.gohPrio')});
  var after=h('input',{type:'text',autocomplete:'off','aria-label':tx('bots.add.after'),placeholder:tx('bots.add.unitHint')});
  function relOf(){return asel.value&&lsel.value?'script/multiplayer/units/'+asel.value+'/'+lsel.value+'.'+asel.value+'.lua':''}
  var lastFrom=null,lastRels=null,cu=K.undoBtn(function(){return lastRels&&lastRels.length?lastRels:(relOf()?[relOf()]:[])},{out:function(){return res}});
  var res=h('div'),G=null,fileHint=h('div',{class:'hint'});
  function showFile(){var r=relOf();fileHint.textContent=r?tx('bots.save.fileIs',{file:'resource/'+r}):''}
  function opt(sel,v,t){if(![].some.call(sel.options||sel.children||[],function(o){return o.value===v}))sel.appendChild(h('option',{value:v,title:v,text:t}))}
  var bPrev=h('button',{type:'button',class:'primary',text:tx('bots.btn.preview'),onclick:function(){run(false)}});
  var bGo=h('button',{type:'button',class:'danger',text:tx('bots.btn.write'),disabled:true,onclick:function(){if(!G||!G.ok())return;var lines=askLines();
   (typeof askDo==='function'?askDo({title:tx('bots.btn.write'),lines:lines,where:S.mod,ok:tx('bots.btn.write'),danger:true}):{then:function(cb){cb(confirm(lines.join(' ')))}}).then(function(yes){if(yes)run(true)},function(e){toast(String((e&&(e.text||e.message))||e))})}});
  function askLines(){var l=[tx('bots.add.gohAsk',{unit:unitName(uin.value.trim()),army:armyName(asel.value),list:lsel.value,file:'resource/'+relOf()})];
   if(lastFrom==='game')l.push(tx('bots.add.gohCopy'));return l}
  function plainLines(r){var l=[tx('bots.add.gohPv',{army:armyName(asel.value),name:unitName(uin.value.trim()),list:lsel.value,after:r.placed&&r.placed.after?unitName(r.placed.after):'-'})];
   if(r.pri)l.push(tx('bots.add.gohPvP',{p:r.pri}));return l}
  G=K.gate(bPrev,bGo,[uin,asel,lsel,csel,prio,after]);
  [asel,lsel].forEach(function(s){s.addEventListener('change',function(){showFile();lastFrom=null})});
  uin.addEventListener('input',showName);
  function showName(){var u=uin.value.trim();uname.textContent=u&&NAMES[u]?tx('bots.add.isName',{name:NAMES[u]}):''}
  function run(write){var u=uin.value.trim(),k=G.key();
   if(!u){res.textContent='';res.appendChild(errBox(tx('bots.add.needUnit')));try{uin.focus()}catch(e){}return}
   if(!asel.value||!lsel.value){res.textContent='';res.appendChild(errBox(tx('bots.add.gohNoArmy')));return}
   res.textContent='';res.appendChild(K.wait(null,tx(write?'bots.wait.write':'bots.wait.preview')));
   api(BASE+'buyfirst',{mod:S.mod,unit:u,army:asel.value,list:lsel.value,cls:csel.value,priority:prio.value.trim(),after:after.value.trim(),write:write},{what:K.jobWhat(tx('bots.add.h'),tx(write?'bots.btn.write':'bots.btn.preview'))}).then(function(r){
    res.textContent='';lastFrom=r.from||lastFrom;
    var exact=K.details(null,[tx('bots.save.fileIs',{file:'resource/'+(r.rel||relOf())})].concat(r.say&&r.say.length?[tx('bots.add.toolSays')]:[]).concat(r.say||[]),tx('bots.showChange'));
    if(r.ok&&r.noChange){G.clear();res.appendChild(h('div',{class:'hint',role:'status','data-nochange':'1',text:tx('bots.add.already',{name:unitName(u)})}));res.appendChild(exact);return}
    if(r.ok&&write){G.clear();lastFrom='mod';
     res.appendChild(K.done(null,{lines:plainLines(r),see:tx('bots.add.see',{name:unitName(u)}),next:[{text:tx('bots.next.match'),go:'bots.botmatch'}],undo:r.undo||[]}));
     res.appendChild(exact);lastRels=(r.undo||[]).map(function(x){return x.rel});cu.refresh();U.changed('bot list','add');return}
    if(r.ok){G.shown(k);res.appendChild(h('b',{text:tx('bots.add.pv.h')}));
     var pl=plainLines(r);if(r.from==='game')pl.push(tx('bots.add.gohCopy'));
     res.appendChild(h('ul',{},pl.map(function(l){return h('li',{text:l})})));res.appendChild(exact);res.appendChild(h('div',{class:'hint',text:tx('bots.add.previewed')}));return}
    G.clear();var m=r.code?tp('bots.err.',r.code):'';if(!m||m==='bots.err.'+r.code)m=r.plain?K.emsg(r.plain):tx('bots.err.other');
    res.appendChild(h('div',{class:'err',text:tx('bots.add.failed')}));res.appendChild(h('div',{class:'err',text:m}));res.appendChild(exact);
   }).catch(function(e){res.textContent='';if(e&&e.cancelled){G.clear();res.appendChild(K.stopBox(tx(write?'bots.add.stopped':'bots.stopped')));if(write){cu.refresh();U.changed('bot list','add')}return}res.appendChild(errBox(e))})}
  addFill={pick:function(u,a,c){uin.value=u;if(a){opt(asel,a,armyName(a));asel.value=a}if(c){opt(csel,c,kindName(c));csel.value=c}G.clear();showName();showFile();res.textContent='';try{uin.focus()}catch(e){}},
   armies:function(list){var v=asel.value;list.forEach(function(a){opt(asel,a,armyName(a))});if(v)asel.value=v;showFile()},
   lists:function(list,cur){var v=lsel.value;list.forEach(function(l){opt(lsel,l,l)});lsel.value=v||cur||list[0]||'';showFile()},
   kinds:function(list){(list||[]).forEach(function(c){opt(csel,c,kindName(c))})}};
  var card=section('add',tx('bots.add.h'),[hint('add.lead',tx('bots.add.gohLead')),
   fld('add.f.army',tx('bots.add.army'),asel),fld('add.f.list',tx('bots.add.list'),lsel),
   fld('add.f.unit',tx('bots.add.unit'),uin,{after:uname}),
   K.more('add.more',[fld('add.f.cls',tx('bots.add.gohCls'),csel),fld('add.f.after',tx('bots.add.after'),after),fld('add.f.prio',tx('bots.add.gohPrio'),prio)]),
   h('div',{class:'row',blk:'add.btns','data-blkname':nm('addBtns')},[bPrev,bGo,cu]),leaf('add.res',[res],nm('res')),
   leaf('add.file',[fileHint],nm('file'))]);
  // pickers (S1: browse, index and history): index = every unit the GoH purchase lists of the game and the mod name (/units), by army;
  // Browse = the file picker on the game data at entity/ (.def): the unit's name (its file's base name)
  var UBR={mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}};
  K.pick(uin,{key:'bots.add.unit',items:unitItems,browse:UBR,onPick:function(v,it,from){if(addFill)addFill.pick(v,from==='browse'?null:it&&it.army,from==='browse'?null:it&&it.cls)}});
  K.pick(after,{key:'bots.add.after',items:unitItems,browse:UBR,onPick:function(v){after.value=v;G.clear()}});
  unitItems(function(){if(UIX.armies)addFill.armies(UIX.armies);if(UIX.lists)addFill.lists(UIX.lists,'');if(UIX.kinds)addFill.kinds(UIX.kinds)});
  return card}
 // ---- make bots buy a unit (botrecipe --buy-first). GoH: its own card (gohAddCard)
 function addCard(){
  if(U.isGoh())return gohAddCard();
  var uin=h('input',{type:'text',autocomplete:'off',placeholder:tx('bots.add.unitHint'),'aria-label':tx('bots.add.unit')});
  // S17: units bots cannot buy (no buy card, or a card of no real army) are left out of the picker unless this is ticked; they carry the reason
  var showNo=h('input',{type:'checkbox',id:'bots-cannot'});
  var uname=h('div',{class:'hint','data-uname':'1'});
  var asel=h('select',{'aria-label':tx('bots.add.army')},[h('option',{value:'',text:tx('bots.add.auto')})]);
  var ssel=h('select',{'aria-label':tx('bots.add.stage')},[h('option',{value:'',text:tx('bots.add.auto')})]);
  function stageOpts(n){var v=ssel.value;while(ssel.children.length>1)ssel.removeChild(ssel.children[ssel.children.length-1]);
   for(var i=1;i<=n;i++)ssel.appendChild(h('option',{value:String(i),text:String(i)}));ssel.value=Number(v)<=n?v:''}
  stageOpts(8);   // the stock count until the buys reply says how many stages this list has
  function showCode(){}   // S20: no army code beside the box (round 3); the option's hover text has it
  var csel=h('select',{'aria-label':tx('bots.add.cls')},CLS.map(function(c){return h('option',{value:c,text:kindName(c)})}));
  csel.value='Tank';
  // "Kind of unit" follows the picked unit (its class in the list or its card), an unknown class gets its own option
  function setCls(c){if(!c)return;if(![].some.call(csel.options||csel.children||[],function(o){return o.value===c}))csel.appendChild(h('option',{value:c,text:kindName(c)}));csel.value=c}
  var first=h('input',{type:'checkbox',checked:true,id:'bots-first'}),prio=h('input',{type:'text',value:'1.0',size:'6',inputmode:'decimal','aria-label':tx('bots.add.prio')});
  var cheap=h('input',{type:'checkbox',id:'bots-cheap'}),like=h('input',{type:'text',autocomplete:'off','aria-label':tx('bots.add.like'),placeholder:tx('bots.add.unitHint')});
  var lastRels=null,cu=K.undoBtn(function(){return lastRels&&lastRels.length?lastRels:[BOTREL]},{out:function(){return res}});
  var res=h('div'),G=null,miss=h('div',{},[K.wait(null,tx('bots.wait.miss'))]);
  var bPrev=h('button',{type:'button',class:'primary',text:tx('bots.btn.preview'),onclick:function(){run(false)}});
  // a write asks first (what goes in, into which mod), as the number editor and Reset do
  var bGo=h('button',{type:'button',class:'danger',text:tx('bots.btn.write'),disabled:true,onclick:function(){if(!G||!G.ok())return;var lines=askLines();
   (typeof askDo==='function'?askDo({title:tx('bots.btn.write'),lines:lines,where:S.mod,ok:tx('bots.btn.write'),danger:true}):{then:function(cb){cb(confirm(lines.join(' ')))}}).then(function(yes){if(yes)run(true)},function(e){toast(String((e&&(e.text||e.message))||e))})}});
  function pr(){return first.checked?'1000':(Number(prio.value)>0?String(Number(prio.value)):'1.0')}
  function askLines(){var u=uin.value.trim(),auto=tx('bots.add.auto');
   var l=[tx('bots.add.ask',{unit:unitName(u),file:BOTDATA,army:armyName(asel.value)||auto,stage:ssel.value||auto,p:pr()})];
   if(listFrom==='mod')l.push(tx('bots.add.replace',{file:BOTDATA}));else if(listFrom==='game')l.push(tx('bots.add.copy',{file:BOTDATA}));
   if(cheap.checked)l.push(tx('bots.add.askCheap',{unit:unitName(u)}));
   if(like.value.trim())l.push(tx('bots.add.askCard',{unit:unitName(u),like:unitName(like.value.trim())}));
   return l}
  // S3: what will be different in a match, in plain words (r = the server's reply: placed {army, after}, name)
  function plainLines(r,write){var u=uin.value.trim(),a=asel.value||(r.placed&&r.placed.army)||'',st=ssel.value,nmU=r.name||unitName(u);
   var who=a?tx('bots.add.pv.army',{a:armyName(a)}):tx('bots.add.pv.anyArmy');
   var when=st?(st==='1'?tx('bots.add.pv.start'):tx('bots.add.pv.stage',{n:st})):(r.placed&&r.placed.after?tx('bots.add.pv.after',{after:unitName(r.placed.after)}):tx('bots.add.pv.auto'));
   var l=[tx('bots.add.pv.buy',{who:who,name:nmU,when:when}),first.checked?tx('bots.add.pv.first'):tx('bots.add.pv.prio',{p:pr()})];
   if(cheap.checked)l.push(tx('bots.add.pv.cheap'));
   if(like.value.trim())l.push(tx('bots.add.pv.like',{like:r.likeName||unitName(like.value.trim())}));
   if(!write&&listFrom)l.push(tx(listFrom==='mod'?'bots.add.pv.replace':'bots.add.pv.copy'));
   return l}
  // Write is greyed until a Preview of the values now in the fields was shown; any field change greys it again (kit.gate)
  G=K.gate(bPrev,bGo,[uin,asel,ssel,csel,first,prio,cheap,like]);
  function key(){return G.key()}
  uin.addEventListener('input',showName);
  function showName(){var u=uin.value.trim();uname.textContent=u&&NAMES[u]?tx('bots.add.isName',{name:NAMES[u]}):''}
  function run(write){var t=uin.value.trim();if(!t){go3(write);return}unitItems(function(items){var lo=t.toLowerCase(),id=null,nmd=null;
   items.forEach(function(it){if(!id&&it.value===t)id=t});if(!id)items.forEach(function(it){if(!id&&String(it.label).toLowerCase()===lo&&it.value!==it.label){id=it.value;nmd=it.label}});
   var hit=items.filter(function(it){return it.value===(id||t)})[0];if(hit&&hit.cls&&!write)setCls(hit.cls);
   if(id&&id!==t){uin.value=id;showName()}go3(write,nmd?tx('bots.add.typedName',{name:nmd,unit:id}):'')})}
  // the unit box takes a unit id or its in-game name (S1): run() turns a typed name into the id first
  function go3(write,note){var u=uin.value.trim(),k=key();if(!u){res.textContent='';res.appendChild(errBox(tx('bots.add.needUnit')));try{uin.focus()}catch(e){}return}   // k: the fields this request sends, so a late reply never turns write on for fields edited since
   res.textContent='';res.appendChild(K.wait(null,tx(write?'bots.wait.write':'bots.wait.preview')));
   api(BASE+'buyfirst',{mod:S.mod,unit:u,army:asel.value,stage:ssel.value,cls:csel.value,first:first.checked,priority:prio.value,cheap:cheap.checked,cardLike:like.value.trim(),write:write},{what:K.jobWhat(tx('bots.add.h'),tx(write?'bots.btn.write':'bots.btn.preview'))}).then(function(r){
    res.textContent='';if(r.name)NAMES[u]=r.name;if(note)res.appendChild(h('div',{class:'hint',text:note}));
    var exact=K.details(null,[tx('bots.save.fileIs',{file:BOTDATA})].concat(r.say&&r.say.length?[tx('bots.add.toolSays')]:[]).concat(r.say||[]),tx('bots.showChange'));
    // the bots buy this unit already and nothing else was asked: one plain line, Write stays greyed, nothing was written
    if(r.ok&&r.noChange){G.clear();res.appendChild(h('div',{class:'hint',role:'status','data-nochange':'1',text:tx('bots.add.already',{name:r.name||unitName(u)})}));res.appendChild(exact);return}
    if(r.ok&&write){G.clear();listFrom='mod';   // the mod now has its own copy of the list
     res.appendChild(K.done(null,{lines:plainLines(r,true),see:tx('bots.add.see',{name:r.name||unitName(u)}),
      next:[{text:tx('bots.next.match'),go:'bots.botmatch'},{text:tx('bots.next.check'),go:'bots.buycheck'},{text:tx('bots.ns'),go:function(){if(window.as2Help)window.as2Help.notShowing();else show('help')}}],
      undo:r.undo||[]}));res.appendChild(exact);lastRels=(r.undo||[]).map(function(x){return x.rel});cu.refresh();U.changed('bot list','add');return}
    if(r.ok){G.shown(k);
     res.appendChild(h('b',{text:tx('bots.add.pv.h')}));res.appendChild(h('ul',{},plainLines(r,false).map(function(l){return h('li',{text:l})})));
     res.appendChild(exact);res.appendChild(h('div',{class:'hint',text:tx('bots.add.previewed')}));return}
    G.clear();
    var m=r.code==='BOT_NO_STAGE'&&r.stages!=null?tx('bots.e.stage',{n:r.stages}):r.code?tp('bots.err.',r.code):'';if(!m||m==='bots.err.'+r.code)m=r.plain?K.emsg(r.plain):tx('bots.err.other');
    res.appendChild(h('div',{class:'err',text:tx('bots.add.failed')}));res.appendChild(h('div',{class:'err',text:m}));res.appendChild(exact);
   }).catch(function(e){res.textContent='';if(e&&e.cancelled){G.clear();res.appendChild(K.stopBox(tx(write?'bots.add.stopped':'bots.stopped')));if(write){cu.refresh();U.changed('bot list','add')}return}res.appendChild(errBox(e))})}
  addFill={pick:function(u,a,c){uin.value=u;if(a&&[].some.call(asel.options||asel.children||[],function(o){return o.value===a}))asel.value=a;setCls(c);G.clear();showName();res.textContent='';try{uin.focus()}catch(e){}},
   armies:function(list){var v=asel.value;asel.textContent='';asel.appendChild(h('option',{value:'',text:tx('bots.add.auto')}));
    list.forEach(function(a){asel.appendChild(h('option',{value:a,title:a,text:armyName(a)}))});asel.value=v;showCode()},
   stages:function(n){if(n>0)stageOpts(n)},
   // the unit kinds this list knows (its UnitClass: a mod may add Sniper, Officer, MG, Airborne)
   classes:function(list){if(!list||!list.length)return;var v=csel.value;csel.textContent='';list.forEach(function(c){csel.appendChild(h('option',{value:c,text:kindName(c)}))});
    csel.value=list.indexOf(v)>=0?v:(list.indexOf('Tank')>=0?'Tank':list[0])},
   // the units of the mod that no bot buys yet, at the top: a click fills the form (null = the list could not be read)
   missing:function(list){miss.textContent='';if(!list)return;
    if(!list.length){miss.appendChild(h('div',{class:'hint',text:tx('bots.buys.nocards')}));return}
    miss.appendChild(h('div',{class:'hint',text:tx('bots.add.missH')}));
    var btns=[];
    list.forEach(function(c){var w=c.how==='changed'?' '+tx('bots.buys.changed'):(c.how==='new'?' '+tx('bots.buys.new'):'');
     btns.push(h('button',{type:'button','data-unit':c.unit,title:c.unit,text:unitName(c.unit)+' - '+armyName(c.army)+w,onclick:function(){if(addFill)addFill.pick(c.unit,c.army,c.cls)}}))});
    miss.appendChild(K.rows(btns,{show:8,tag:'div'}))}};
  var card=section('add',tx('bots.add.h'),[hint('add.lead',tx('bots.add.lead')),leaf('add.miss',[miss],nm('cards')),
   fld('add.f.unit',tx('bots.add.unit'),uin,{after:uname}),h('div',{class:'row',blk:'add.cannot'},[showNo,h('label',{for:'bots-cannot',text:tx('bots.add.cannot')})]),
   fld('add.f.army',tx('bots.add.army'),asel),fld('add.f.cls',tx('bots.add.cls'),csel),
   h('div',{class:'row',blk:'add.first'},[first,h('label',{for:'bots-first',text:tx('bots.add.first')})]),
   K.more('add.more',[fld('add.f.stage',tx('bots.add.stage'),ssel,{title:tx('bots.tip.stage')}),hint('add.stagenote',tx('bots.add.stageNote')),fld('add.f.prio',tx('bots.add.prio'),prio,{title:tx('bots.tip.priority'),after:h('small',{class:'hint',style:'margin-left:6px',text:tx('bots.add.prioRange')})}),
    h('div',{class:'row',blk:'add.cheap'},[cheap,h('label',{for:'bots-cheap',text:tx('bots.add.cheap')})]),fld('add.f.like',tx('bots.add.like'),like),
    h('div',{class:'row',blk:'add.doc'},[h('button',{type:'button',text:tx('bots.doc'),title:tx('bots.docT'),onclick:function(){show('doctrine')}})])]),
   h('div',{class:'row',blk:'add.btns','data-blkname':nm('addBtns')},[bPrev,bGo,cu]),leaf('add.res',[res],nm('res')),
   K.details('add.det',[tx('bots.save.fileIs',{file:BOTDATA}),h('div',{class:'hint'},[K.term(tx('bots.term.buycard'),'buycard'),h('span',{text:' · '}),K.term(tx('bots.term.stage'),'stage'),h('span',{text:' · '}),K.term(tx('bots.term.priority'),'priority')])])]);
  // pickers (S1, owner 2026-11-19: browse, index and history): index = every buy card unit of the game and the mod (/units) and the units
  // the bot list names, by army, shown by in-game name. A pick in "unit" sets the army too, as the buttons above do. Browse = the file
  // picker on the game data at entity/ (.def): the unit's name (its file's base name; the army stays as chosen)
  var UBR={mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}};
  K.pick(uin,{key:'bots.add.unit',items:function(cb){unitItems(function(list){cb(showNo.checked?list.concat(UIX.cannot||[]):list)})},browse:UBR,onPick:function(v,it,from){if(addFill)addFill.pick(v,from==='browse'?null:it&&it.army,from==='browse'?null:it&&it.cls)}});
  K.pick(like,{key:'bots.add.like',items:unitItems,browse:UBR,onPick:function(v){like.value=v;G.clear()}});
  // S17: the example in the boxes is a unit of this game and mod (the first with an in-game name), so it is a value the card takes
  unitItems(function(){if(UIX.example){var ph=tx('bots.add.unitHintN',{name:UIX.example});uin.setAttribute('placeholder',ph);like.setAttribute('placeholder',ph)}});
  return card}
 function kindName(c){return K.kind(c)}
 // the unit index of the add card: asked once per mod (game cards come cached from the server), plus the units the last buys reply named
 var UIX={mod:null,items:null,wait:[]},buyUnits=[];
 function unitItems(cb){var m=S.mod||'';
  if(UIX.mod===m&&UIX.items){cb(UIX.items);return}
  if(UIX.mod===m){UIX.wait.push(cb);return}
  UIX={mod:m,items:null,wait:[cb],cannot:[],example:''};
  function fin(list,rep){if(UIX.mod!==m)return;var seen={},out=[];rep=rep||{};
   Object.keys(rep.armies||{}).forEach(function(a){if(rep.armies[a])ANAMES[a]=rep.armies[a]});
   list.concat(buyUnits).forEach(function(u){var k=u.army+'|'+u.unit;if(!u.unit||seen[k])return;seen[k]=1;if(u.name)NAMES[u.unit]=u.name;if(u.armyName&&!ANAMES[u.army])ANAMES[u.army]=u.armyName;var nmU=u.name||NAMES[u.unit]||'';
    out.push({label:nmU||u.unit,value:u.unit,hint:(nmU?u.unit+' · ':'')+armyName(u.army)+(u.src==='mod'?' · '+tx('bots.add.fromMod'):''),army:u.army,cls:u.cls,lo:(u.unit+' '+nmU+' '+u.army+' '+armyName(u.army)).toLowerCase()})});
   // units bots cannot buy: shown only with "Show units that bots cannot buy", with the reason
   UIX.cannot=(rep.cannot||[]).map(function(u){var nmU=u.name||'';return {label:nmU||u.unit,value:u.unit,hint:(nmU?u.unit+' · ':'')+tx('bots.add.why.'+(u.why||'noArmy')),army:'',cls:u.cls,cannot:true,lo:(u.unit+' '+nmU).toLowerCase()}});
   UIX.example=(out.filter(function(it){return it.label!==it.value})[0]||{}).label||'';
   if(rep.goh){UIX.armies=Object.keys(rep.armies||{});UIX.lists=rep.lists||[];UIX.kinds=rep.kinds||[]}
   UIX.items=out;var w=UIX.wait;UIX.wait=[];w.forEach(function(f){f(out)})}
  api(BASE+'units?'+qs({mod:m})).then(function(r){fin(r.units||[],r)}).catch(function(){fin([])})}

 // ---- bot difficulty: AS2 bots_generic.inc; GoH its presets/global_parameters/bots_generic.inc (every GoH preset takes it)
 function diffCard(){var goh=U.isGoh();var e=editor({id:'diff',file:goh?GOH_BOTS:'bots_generic.inc',title:tx('bots.diff.h'),lead:tx(goh?'bots.diff.gohLead':'bots.diff.lead'),main:U.DIFF_MAIN,pick:function(){return true},
  see:tx('bots.diff.see'),next:[{text:tx('bots.next.match'),go:'bots.botmatch'}]});e.load();return e.el}

 // ---- advanced tools + link to the maps page: the tool names under Details
 function advCard(){
  var items=ADV.map(function(a){return h('li',{},[h('b',{text:a[0]}),' - '+tp('bots.adv.',a[1])])});
  return section('adv',tx('bots.adv.h'),[hint('adv.maps',tx('bots.adv.maps')),hint('adv.modes',tx('bots.adv.modes')),
   h('div',{class:'row',blk:'adv.open'},[h('button',{type:'button',text:tx('bots.adv.openMaps'),onclick:function(){show('maps')}}),h('button',{type:'button',text:tx('bots.adv.openModes'),onclick:function(){show('modes')}})]),
   K.details('adv.det',[tx('bots.adv.lead'),h('ul',{},items)])])}

 // this page's own cards, placed in the groups like parts: A = what bots buy and the add-unit card first, B = how bots choose before
 // the recipes, C = the difficulty numbers after the mode check, F = the more-tools card last. The mod cards need a mod
 function cards(env){var t=function(k){return function(){return tx(k)}};
  var c=[{id:'how',group:'B',order:-1000,watch:false,title:t('bots.how.h'),draw:function(){return [how()]}},
   {id:'adv',group:'F',order:1e9,watch:false,title:t('bots.adv.h'),draw:function(){return [advCard()]}}];
  if(env.mod)c.push({id:'buys',group:'A',order:-1000,title:t('bots.buys.h'),draw:function(){return [buysCard()]}},
   {id:'add',group:'A',order:-999,watch:false,title:t('bots.add.h'),draw:function(){return [addCard()]}},
   {id:'diff',group:'C',order:1e9,watch:['numbers','undo'],title:t('bots.diff.h'),draw:function(){return [diffCard()]}});
  return c}
 var TASKS=[{k:'bots.task.unit',go:'add',mod:true},{k:'bots.task.check',go:'bots.buycheck'},{k:'bots.task.smart',go:'bots.recipes'},
  {k:'bots.task.money',go:'diff',mod:true},{k:'bots.task.mode',go:'bots.modeready'},{k:'bots.task.match',go:'bots.botmatch'}];
 return U.drawGroups(root,['A','B','C','F'],{page:'bots',h1:'bots.h1',lead:'bots.lead',cards:cards,tasks:TASKS,known:['add','diff','buys','how','adv'],firstGroup:function(){return U.isGoh()?'C':null},firstCard:function(){return U.isGoh()?'diff':null},before:function(){addFill=null;listFrom=null}});
};
`;

module.exports = { head, screen };

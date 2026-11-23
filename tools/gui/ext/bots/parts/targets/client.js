// Bots part "targets", browser side. Page rules (bots/script.js): no backtick, no dollar-brace, DOM only through h() and textContent.
// Two entries: 'targets.symptom' (group D, order 5: the symptom picker) and 'targets' (group D, order 20: who shoots at what, which ammo
// for which target). Every change is one action sent to targets/change as a dry run with the actions before it: the reply carries the
// plain list, the line diff and the new model the card shows. Buttons (S13): Preview (shows the plain list, the exact file change folded),
// Write into my mod, Undo (greyed until there is something to undo: the last change not yet written, else the last write = the frame's
// one Undo, lib.undo), Reset to the game's values (removes the mod's copy of that one file; undoable the same way). After a write, a
// reset or an undo every list of the page is read again (the presets "Fixes" included).
// The symptom picker: TSYM (prepended below, from catalog.json symptoms) names for each symptom the exact block that holds its setting
// (blk; gohBlk on Gates of Hell): a card here, a setting row of the brain part (bots.brain.<card>.k.<id>, bots.brain.guns.g.<id>) or the
// buy list ('buys', Bots page). Each symptom is its own folded block bots.targets.sym.<id> (a DETAILS: BOTS_UI.go opens it), so a page
// task can point at one symptom. The six most common (top) show first, the rest under "Show all 14" (S10).
// "Show the setting" = env.go (the frame: switches page, opens the folds, scrolls), then this part opens the folds around it and marks
// it for 4 s. test.js checks every jump lands on a block that exists.
// Page standards S1-S16): in-game names in the main text; file names, raw code and engine refs in Details;
// each ammo rule and each target group folds to one plain line; 8 rows, then "Show all N"; adding rules and groups under More options.
// Author: Imperator_Aug (ARSENAL, ia-61971a53)
const CAT = require('./catalog.json');
// the most common symptoms, shown first (the rest under "Show all")
const TOP = ['rocketinf', 'spotfar', 'mgtank', 'waves', 'noretreat', 'tankmg'];
// S15: a symptom whose setting cannot be changed on Gates of Hell (its block is a brain row that has no Gates of Hell reader, or the
// greyed sight line) is marked noGoh: greyed there with one plain line, no buttons. link = a habit of another page (attack waves: Bots page)
const BRAIN = require('../brain/catalog.json'), BRAIN_GOH = {};
BRAIN.items.concat(BRAIN.sight).forEach(it => { BRAIN_GOH[it.id] = !!it.goh; });
const noGoh = s => { if (s.gohBlk === 'bots.brain.seeing.sight') return true; const m = /^bots\.brain\.[a-z]+\.k\.([a-z-]+)$/.exec(s.gohBlk || s.blk); return !!(m && BRAIN_GOH[m[1]] === false); };
const TSYM = Object.keys(CAT.symptoms).map(id => { const s = CAT.symptoms[id], o = { id, lever: s.lever, blk: s.blk };
  ['card', 'pick', 'rule', 'opt', 'preset', 'gohBlk', 'grp', 'link'].forEach(k => { if (s[k] != null) o[k] = s[k]; });
  if (noGoh(s)) o.noGoh = true;
  const ti = TOP.indexOf(id); if (ti >= 0) o.top = ti + 1; return o; });
module.exports = 'var TSYM=' + JSON.stringify(TSYM) + ';\n' + String.raw`
(function(){
 var P='bots.targets.',ROWS=8;
 var TG={env:null,st:null,cards:{},seq:0};
 function t(k,p){return tx(P+k,p)}
 function opt(k,p){var s=tx(P+k,p);return s===P+k?null:s}
 function has(key){var s=tx(key);return s!=null&&s!==key}
 function L(shared,mine){return has(shared)?tx(shared):t(mine)}
 function K(){return (TG.env&&TG.env.kit)||{}}
 // the game by its one name (kit.game), so every sentence names the game the same way
 function gameName(){var k=K(),g=TG.env&&TG.env.gid;if(typeof k.game==='function'){try{var s=k.game(g);if(s)return String(s)}catch(e){}}
  return g==='goh'?'Gates of Hell':g==='mowas2'?'Men of War: Assault Squad 2':'AS64'}
 // no mod picked / no game folder: the frame's one line (kit.needMod, kit.needGame) as a plain element, else this part's words
 function needModEl(){var k=K();if(typeof k.needMod==='function'){try{var n=k.needMod(null);if(n)return n}catch(e){}}
  return h('div',{class:'err','data-needmod':'1',text:L('bots.needmod','needMod')})}
 function needGameEl(){var k=K();if(typeof k.needGame==='function'){try{var n=k.needGame(null);if(n)return n}catch(e){}}
  return h('div',{class:'err','data-needgame':'1',text:t('needGame')})}
 // an empty search: "Nothing found. Try <hint>." (kit.none)
 function noneEl(hint){var k=K(),n=null;if(typeof k.none==='function'){try{n=k.none(hint)}catch(e){n=null}}
  if(!n)n=h('div',{class:'hint',role:'status',text:t('none',{hint:hint})});if(n.setAttribute)n.setAttribute('data-none','1');return n}
 // the one "Undone: <what>." sentence (kit.undone)
 function undoneText(){var k=K();if(typeof k.undone==='function'){try{var s=k.undone(t('undone.w'));if(s)return typeof s==='string'?s:String(s.textContent||'')}catch(e){}}return t('undone')}
 // a refusal names things as the page does (S12): a target kind and an ammo by their in-game names, never the code
 function errOf(x){if(!x||typeof x!=='object'||!x.key||!x.params)return x;var p={},q=x.params,i;for(i in q)p[i]=q[i];
  if(p.c!=null)p.c=clsName(p.c);if(p.t!=null)p.t=tagsName(p.t);return {key:x.key,params:p,message:x.message,reply:x.reply,status:x.status}}
 // plurals (S14): the window language from bots.targets.lc; en one/other, ru and uk one/few/many, zh other
 function pf(n){var l=t('lc'),a=Math.abs(Number(n))||0,m10=a%10,m100=a%100;
  if(l==='ru'||l==='uk')return m10===1&&m100!==11?'one':(m10>=2&&m10<=4&&(m100<12||m100>14)?'few':'many');
  if(l==='zh')return 'other';return a===1?'one':'other'}
 function pl(k,n,p){var q={n:n};if(p)for(var x in p)q[x]=p[x];return t(k+'.'+pf(n),q)}
 function low(v){return String(v==null?'':v).toLowerCase().replace(/[^a-z0-9_]/g,'_')}
 function clsName(c){return opt('cls.'+low(c))||String(c)}
 function wName(w){return opt('wtag.'+low(w))||String(w)}
 function ammoName(g){return opt('atag.'+low(g))||String(g)}
 // ammo tags of a rule ("shell_ap" or several words): the name of the whole string, else each word named
 function tagsName(g){g=String(g==null?'':g).trim();return opt('atag.'+low(g))||g.split(/\s+/).map(ammoName).join(' + ')}
 function condName(c){return opt('cond.'+low(c))||String(c)}
 // a target as the rules name it ("human in_cover") in plain words ("soldiers in cover")
 function tgtName(c){c=String(c||'').trim();var i=c.indexOf(' ');if(i<0)return clsName(c);return t('tgt',{c:clsName(c.slice(0,i)),w:condName(c.slice(i+1))})}
 function whoName(s){if(s.type)return opt('who.t.'+low(s.type))||t('who.type',{t:s.type});
  if(s.unit==='human')return opt('who.u.'+low(s.weapon||'none'))||t('who.unit',{u:s.unit,w:s.weapon||''});
  return t('who.unit',{u:s.unit||'',w:s.weapon||''})}
 // a shooter as a change names it (the list's type, else "unit weapon")
 function whoText(w){w=String(w||'').trim();var o=opt('who.t.'+low(w));if(o)return o;var p=w.split(' ');
  if(p.length>1||p[0]==='human')return whoName({unit:p[0],weapon:p.slice(1).join(' ')});return whoName({type:w})}
 function blockName(b){return clsName(b.cls)+(b.cond?' - '+condName(b.cond):'')}
 function termText(x){var k=String(x.k||'').toLowerCase(),s;
  if(k==='class')s=clsName(x.v);else if(k==='weapon')s=x.v?t('term.weaponTag',{w:x.v.split(' ').map(wName).join(' + ')}):t('term.weapon');
  else if(k==='in_range')s=t('term.in_range',{m:x.v});else if(k==='entity')s=t('term.entity',{v:x.v});
  else s=opt('term.'+low(k))||(k+(x.v!=null?' '+x.v:''));
  return x.not?t('term.not',{w:s}):s}
 function setText(set){return set.map(termText).join(t('and'))}
 function code(s){return h('code',{text:s})}
 function btn(label,fn,o){var a={type:'button',text:label,onclick:fn};if(o)for(var k in o)a[k]=o[k];return h('button',a)}
 // Details (S2): the frame's kit.details as a plain element when present, else a native fold with the same words
 function inDet(kids){var k=K();if(typeof k.details==='function'){try{var n=k.details(null,kids);if(n)return n}catch(e){}}
  return h('details',{},[h('summary',{class:'hint',text:L('bots.details','details')})].concat(kids))}
 // More options (S8): the frame's kit.more as a block, else a folded block with the same words
 function moreF(id,kids){var k=K();if(typeof k.more==='function'){try{var n=k.more(id,kids);if(n)return n}catch(e){}}
  var lb=L('bots.more','more');return h('details',{blk:id,box:'col','data-blkname':lb,class:'bots-more'},[h('summary',{class:'hint',text:lb})].concat(kids))}
 // a list of rows (S10): the first 8, then "Show all N" with the rest (numbering goes on)
 function capList(items,mk){var out=[h('ol',{},items.slice(0,ROWS).map(function(x,i){return mk(x,i)}))];
  if(items.length>ROWS){var rest=items.slice(ROWS).map(function(x,i){return mk(x,i+ROWS)});
   out.push(h('details',{'data-all':'1'},[h('summary',{class:'hint',text:t('all',{n:items.length})}),h('ol',{start:String(ROWS+1)},rest)]))}
  return out}
 // one row folded to its plain line, the controls inside
 // (the controls are made when the row is first opened, so a folded list is only its lines)
 function row1(line,mk,open){var made=false,d=h('details',{},[h('summary',{text:line})]);
  function fillK(){if(made)return;made=true;mk().forEach(function(k){if(k)d.appendChild(k)})}
  if(open){d.open=true;fillK()}else d.addEventListener('toggle',function(){if(d.open)fillK()});return d}
 function wait(text){var k=K();if(typeof k.wait==='function'){try{var n=k.wait(null,text);if(n)return n}catch(e){}}return h('div',{class:'hint',role:'status',text:text})}
 function flash(e){if(!e)return;for(var n=e;n;n=n.parentNode)if(n.tagName==='DETAILS'&&!n.open)n.open=true;try{e.scrollIntoView({block:'center'})}catch(x){}
  e.classList.add('arrflash');if(typeof setTimeout==='function')setTimeout(function(){e.classList.remove('arrflash')},4000)}
 function byTg(root,v){var all=root.querySelectorAll('[data-tg]');for(var i=0;i<all.length;i++)if(all[i].getAttribute('data-tg')===v)return all[i];return null}
 // the block with exactly this id anywhere in the page
 function blkEl(id){if(typeof document==='undefined'||!document)return null;var r=document.body||document.documentElement,hit=null;
  (function walk(n){if(hit||!n||!n.children)return;for(var i=0;i<n.children.length&&!hit;i++){var c=n.children[i];if(c&&c.getAttribute&&c.getAttribute('data-blk')===id){hit=c;return}walk(c)}})(r);return hit}
 function ask(title,lines,cb){if(typeof askDo==='function'){askDo({title:title,lines:lines,where:TG.env&&TG.env.mod,ok:title,danger:true}).then(function(y){if(y)cb()},function(){});return}
  if(typeof confirm!=='function'||confirm(lines.join(' ')))cb()}
 function goTo(g){if(typeof g==='function'){g();return}if(g==='log'){if(typeof window!=='undefined'&&window.as2Link)window.as2Link('page:logs');return}
  var env=TG.env,f=env&&(env.go||(env.kit&&env.kit.go));if(typeof f==='function')f(g)}
 function changed(w){var env=TG.env;try{if(env&&typeof env.changed==='function')env.changed(w||'targets');else if(typeof BOTS_UI!=='undefined'&&BOTS_UI.changed)BOTS_UI.changed(w||'targets','targets')}catch(e){}}
 // the frame's one Undo: POST undo {undo:[{rel,id}]} (lib.undo) puts the file back, refused when it changed since
 function undoP(list){var k=K();if(typeof k.undoBy==='function'){var f=k.undoBy(list);if(f)return f()}
  return new Promise(function(ok,no){TG.env.api('POST','undo',{undo:list},function(e,r,x){if(e)no(x||new Error(String(e)));else ok(r)})})}
 // the green box after a write (S4): what changes, how to see it in the game, next steps, Undo
 function doneEl(o){var k=K();if(typeof k.done==='function'){try{var n=k.done(null,o);if(n)return n}catch(e){}}
  var nx=(o.next||[]).map(function(x){return btn(x.text,function(){goTo(x.go)})}),box,ub;
  if(o.undo){ub=btn(L('bots.btn.undo','undo'),function(){ub.disabled=true;
   Promise.resolve(o.undo()).then(function(){box.textContent='';box.appendChild(h('div',{class:'ok',role:'status',text:undoneText()}));changed('undo')},
    function(e){ub.disabled=false;var k=K();box.appendChild(typeof k.errBox==='function'?k.errBox(e):h('div',{class:'err',role:'alert',text:String(e)}))})});nx.push(ub)}
  box=h('div',{class:'ok',role:'status','data-done':'1',style:'border-left:4px solid var(--okl);background:var(--ban);padding:6px 10px;margin:6px 0'},
   [h('b',{text:t('doneH')}),h('ul',{},(o.lines||[]).map(function(s){return h('li',{text:s})})),o.see?h('div',{},[h('b',{text:L('bots.done.see','seeH')+' '}),h('span',{text:o.see})]):null,h('div',{class:'row'},nx)]);
  return box}
 // S19: the frame's one sentence says who is affected (bots only, or every player), then what to watch; a change that reaches only the
 // player's own units keeps this part's own sentence (the frame has none for it)
 function seeBy(kind,w){var k=K();if(w!=='own'&&typeof k.seeText==='function')return k.seeText(w==='ai'?'bots':'own')+' '+t('watch.'+kind);return t('see.'+kind+'.'+w)}
 function relsOf(list){return (list||[]).map(function(x){return x.rel})}
 // S19: the next-step buttons match the text: a change that reaches only the player's own units is not seen in a bot match (there the
 // player only watches), so that button is left out
 function next(w){var a=[];if(w!=='own')a.push({text:L('bots.next.match','next.match'),go:'bots.botmatch'});a.push({text:t('next.log'),go:'log'});return a}
 // a change in plain words (S11): in-game names for the ammo, the target and the shooter; never a tag or a file
 function didText(d){var p={},q=d.p||{},k=String(d.k||'').replace(/^bots\.targets\.do\./,'');for(var x in q)p[x]=q[x];
  if(p.t!=null)p.t=tagsName(p.t);if(p.c!=null)p.c=String(p.c).split(', ').map(tgtName).join(t('and'));if(p.who!=null)p.who=whoText(p.who);
  if((k==='on'||k==='off')&&p.s){var sk='say.'+k+'.'+p.s;delete p.s;if(opt(sk))return t(sk,p)}
  return opt('say.'+k)?t('say.'+k,p):tx(d.k,p)}

 // ---- state, shared by both entries
 function loadState(cb){var env=TG.env,my=++TG.seq;
  env.api('GET','targets/state',null,function(err,j,x){if(my!==TG.seq)return;if(!err)TG.st=j;cb(err,j,x)})}
 // every list of the page read again (after a write, a reset or an undo)
 function refreshAll(cb){loadState(function(err){var C=TG.cards;if(!err){if(C.sel)C.sel.reread();if(C.ammo)C.ammo.reread()}
  (TG.savers||[]).forEach(function(s){s.sync()});if(cb)cb(err)})}

 // ---- the change list of one card: Preview, Write into my mod, Undo, Reset to the game's values
 // S19: who a change reaches. Only enable_for_ai switches = the computer's units (a bot match shows it); a switch for the player's units
 // (enable_for_user / enable_for_human_user, the rocket launcher fix T5) = play a match yourself with these units; anything else (a rule
 // or a target group added, moved, removed, a range) reaches every unit of that kind, yours and the bots'
 function whoOf(did){var sw=(did||[]).filter(function(d){return /\.do\.(on|off)$/.test(String(d.k||''))}),all=did&&did.length&&sw.length===did.length;
  if(all&&sw.every(function(d){return d.p&&d.p.s==='enable_for_ai'}))return 'ai';
  if(sw.some(function(d){return d.p&&/^enable_for_(human_)?user$/.test(d.p.s)})&&all)return 'own';
  return 'both'}
 // every saver of the page (both cards), so an Undo of one file greys every Undo for that file and clears the old texts (S18)
 TG.savers=[];
 function saver(env,id,kind,onModel){
  var by={},prev={},pkey={},shown={},file=null,seq=0,out=h('div'),msg=h('div'),lastU={},own={},me={};
  // Preview is never greyed: with nothing changed yet it says so (the line above the buttons)
  var bP=btn(L('bots.btn.preview','preview'),function(){if((by[file]||[]).length)shown[file]=true;else say(['hint',t('prev.no')]);draw()},{class:'primary',title:t('prev.tip')});
  var bW=btn(L('bots.btn.write','write'),function(){var r=prev[file],n=r?r.did.length:0;if(!canWrite()||!n)return;
    var lines=[pl('write.ask',n)].concat(r.did.map(didText));if(r.copiesWholeFile)lines.push(t('write.copy'));
    ask(L('bots.btn.write','write'),lines,function(){send()})},{class:'danger',disabled:true,title:t('write.no')});
  // Undo has one meaning: the last write or reset of this file is put back (changes not written yet are dropped with "Drop these changes")
  var bU=btn(L('bots.btn.undo','undo'),function(){var lu=lastU[file];if(!lu)return;bU.disabled=true;var rs=relsOf(lu.list);
    undoFn(file,lu)().then(function(){msg.textContent='';say(['ok',undoneText()]);var k=K();if(typeof k.undoSync==='function')k.undoSync(rs);changed('undo')},function(e){sayErr(e);sync()})},{disabled:true,title:t('undo.no')});
  var bR=btn(L('bots.btn.reset','reset'),function(){if(!modHas(file)){say(['hint',t('reset.nothing')]);sync();return}ask(L('bots.btn.reset','reset'),[t('reset.ask')],function(){var f=file;
    env.api('POST','targets/reset',{file:f,write:true},function(err,r,x){if(err){sayErr(x&&x.key?x:err);return}
     by[f]=[];prev[f]=null;shown[f]=false;own[f]=false;
     if(!r.removed){say(['hint',t('reset.nothing')]);sync();refreshAll();return}
     lastU[f]=r.undo&&r.undo.length?{list:r.undo,has:true}:null;
     msg.textContent='';msg.appendChild(doneEl({lines:[t('reset.done')],see:seeBy(kind,'both'),next:next('both'),undo:lastU[f]?undoFn(f,lastU[f]):null,rels:relsOf(lastU[f]&&lastU[f].list)}));
     changed();refreshAll()})})},{disabled:true,title:t('reset.no')});
  // one undo for the green box and the Undo button: after it every saver forgets that file's pending changes, its last write and its old
  // texts, and knows whether the mod has its own copy again (lu.has), so Reset follows at once
  function undoFn(f,lu){return function(){return undoP(lu.list).then(function(r){TG.savers.forEach(function(s){s.undone(f,lu.has)});refreshAll();return r})}}
  me.undone=function(f,has){lastU[f]=null;by[f]=[];prev[f]=null;shown[f]=false;if(has!=null)own[f]=!!has;if(f===file){msg.textContent='';draw()}};
  // the mod has its own copy of this file: only then Reset has something to put back. What this card just did (a write, a reset, an undo)
  // counts first, then the files as last read (st.files from 'mod')
  function modHas(f){if(own[f]!=null)return own[f];var st=TG.st;if(!st||!st.files)return false;return (st.files||[]).some(function(x){return x.file===f&&x.from==='mod'})}
  function say(m){if(!m){var o=msg.querySelector('[data-say]');if(o&&o.parentNode)o.parentNode.removeChild(o);return}
   msg.textContent='';msg.appendChild(h('div',{'data-say':'1',class:m[0]==='err'?'err':m[0]==='ok'?'ok':'hint',role:m[0]==='err'?'alert':'status',text:m[1]}))}
  function sayErr(e){var k=K();e=errOf(e);msg.textContent='';msg.appendChild(typeof k.errBox==='function'?k.errBox(e):h('div',{class:'err',role:'alert',text:String(e)}))}
  // every button says in its tooltip why it is greyed or what it does (Reset and Undo follow the file's state after each write and undo)
  // Write only for a Preview that is on screen (shown) and was made for the changes as they are now (pkey); the handler asks this too
  function canWrite(){var a=by[file]||[],r=prev[file];return !!(shown[file]&&r&&a.length&&!r.same&&pkey[file]===JSON.stringify(a))}
  function sync(){var a=by[file]||[],r=prev[file],lu=lastU[file],mh=modHas(file),w=canWrite();
   bP.title=a.length?t('prev.tip'):t('prev.no');
   bW.disabled=!w;bW.title=w?t('write.tip'):a.length&&shown[file]&&r&&r.same?t('same'):t('write.no');
   bU.disabled=!lu;bU.title=lu?t('undo.tip'):t('undo.no');
   bR.disabled=!mh;bR.title=mh?t('reset.tip'):t('reset.no')}
  me.sync=sync;
  function drop(){by[file]=[];prev[file]=null;pkey[file]=null;shown[file]=false;say(null);run()}
  function draw(){var a=by[file]||[],r=prev[file];out.textContent='';sync();
   if(!a.length){out.appendChild(h('div',{class:'hint',text:t('pend.none')}));return}
   if(!r)return;
   var dr=btn(t('pend.drop'),drop,{'data-drop':'1',title:t('pend.drop.tip')});
   if(!shown[file]){out.appendChild(h('div',{class:'hint',text:pl('pend.wait',a.length)}));out.appendChild(h('div',{},[dr]));return}
   out.appendChild(h('b',{text:pl('pend.h',r.did.length)}));
   out.appendChild(h('ul',{},r.did.map(function(d){return h('li',{text:didText(d)})})));
   if(r.same){out.appendChild(h('div',{class:'hint',text:t('same')}));out.appendChild(h('div',{},[dr]));return}
   var ex=[h('div',{class:'hint',text:t('diff',{f:file})}),h('pre',{},r.diff.map(function(x){return h('div',{class:x.t==='+'?'ok':x.t==='-'?'err':'hint',text:(x.t==='@'?'':x.t+' ')+x.s})}))];
   if(r.copiesWholeFile)ex.push(h('div',{class:'hint',text:t('write.copy')}));
   out.appendChild(h('details',{},[h('summary',{class:'hint',text:L('bots.showChange','exact')})].concat(ex)));
   out.appendChild(h('div',{},[dr]))}
  function run(){var a=by[file]||[],my=++seq,f=file;
   if(!a.length){prev[f]=null;draw();onModel(null);return}
   env.api('POST','targets/change',{file:f,actions:a,write:false},function(err,r,x){if(my!==seq||f!==file)return;
    if(err){a.pop();if(!a.length)shown[f]=false;if(x&&x.key==='bots.targets.e.presetNone')say(['hint',t('preset.none')]);else sayErr(x&&x.key?x:err);draw();onModel(prev[f]?prev[f].model:null);return}
    prev[f]=r;pkey[f]=JSON.stringify(a);draw();onModel(r.model)})}
  function send(){var a=by[file]||[],f=file;
   env.api('POST','targets/change',{file:f,actions:a,write:true},function(err,r,x){if(err){sayErr(x&&x.key?x:err);return}
    var did=r.did||[],w=whoOf(did);by[f]=[];prev[f]=null;shown[f]=false;own[f]=true;
    // undoing a first write removes the copy it made (the mod has none again); else the mod's older copy comes back
    lastU[f]=r.undo&&r.undo.length?{list:r.undo,has:!r.copiesWholeFile}:null;
    msg.textContent='';msg.appendChild(doneEl({lines:did.map(didText),see:seeBy(kind,w),next:next(w),undo:lastU[f]?undoFn(f,lastU[f]):null,rels:relsOf(lastU[f]&&lastU[f].list)}));
    changed();refreshAll()})}
  var el=env.kit.leaf(id,[out,h('div',{class:'row'},[bP,bW,bU,bR]),msg],t('pend.name'));
  draw();
  me.el=el;
  // show = a preset or a symptom fix: the plain list shows at once (it is the preview the user asked for); a new change clears old texts
  me.add=function(a,show){(by[file]=by[file]||[]).push(a);shown[file]=!!show;pkey[file]=null;msg.textContent='';sync();run()};
  TG.savers.push(me);
  return {el:el,add:me.add,
   setFile:function(f){if(f!==file)say(null);file=f;draw();onModel(prev[f]?prev[f].model:null)},
   model:function(){return prev[file]?prev[file].model:null},say:say,draw:draw,sync:sync,
   // after a page re-read: what the cards show comes from the files again
   reread:function(){onModel(prev[file]?prev[file].model:null);draw()}}}

 // ---- card 2: who shoots at what
 function rangeOk(v){return /^\d+(\.\d+)?$/.test(v)&&Number(v)>0&&Number(v)<=10000}
 function selCard(env){var K2=env.kit,cur={file:null,idx:0},model=null;
  var pick=h('select',{'aria-label':t('sel.who')}),rank=h('div',{class:'hint'}),from=h('div',{class:'hint'}),list=h('div');
  var acls=h('select',{'aria-label':t('add.cls')}),arng=h('input',{type:'text',size:'6',inputmode:'decimal',autocomplete:'off',placeholder:t('add.any'),'aria-label':t('add.range')});
  var aat=h('select',{'aria-label':t('add.at')},[h('option',{value:'',text:t('add.end')}),h('option',{value:'0',text:t('add.top')})]);
  var sv=saver(env,'bots.targets.sel.save','sel',function(m){model=m;draw()});
  function sels(){var S=model?model:(TG.st?TG.st.selectors.filter(function(s){return s.file===cur.file}):[]);return S}
  function fill(){pick.textContent='';var st=TG.st;if(!st)return;
   st.selectors.forEach(function(s,i){pick.appendChild(h('option',{value:s.file+'#'+s.idx,text:(i+1)+'. '+whoName(s)}))});
   if(!cur.file&&st.selectors.length){cur.file=st.selectors[0].file;cur.idx=0}
   pick.value=cur.file+'#'+cur.idx;
   acls.textContent='';(st.classes||[]).forEach(function(c){acls.appendChild(h('option',{value:c,text:clsName(c)}))});
   sv.setFile(cur.file)}
  function choose(file,idx){if(file!==cur.file){cur.file=file;sv.setFile(file)}cur.idx=idx||0;pick.value=cur.file+'#'+cur.idx;draw()}
  pick.addEventListener('change',function(){var v=String(pick.value),i=v.lastIndexOf('#');choose(v.slice(0,i),Number(v.slice(i+1)))});
  function act(a,show){a.sel=cur.idx;sv.add(a,show)}
  function groupEl(g,i,G){
   var line=g.select.length?t('g.takes',{w:g.select.map(setText).join(t('or'))}):t('g.rest');
   function mk(){var kids=[];
   if(g.ignore.length)kids.push(h('div',{class:'hint',text:t('g.ignores',{w:g.ignore.map(setText).join(t('or'))})}));
   var ord=g.sort.map(setText);if(g.key)ord.push(opt('key.'+low(g.key))||g.key);
   kids.push(h('div',{class:'hint',text:ord.length?t('g.order',{w:ord.join(t('then'))}):t('g.noOrder')}));
   g.ranges.forEach(function(r,k){var lb=t('range.label',{n:i+1,where:t('where.'+r.where)});
    var inp=h('input',{type:'text',size:'6',value:r.v,inputmode:'decimal',autocomplete:'off','aria-label':lb});
    inp.addEventListener('change',function(){var v=String(inp.value).trim();if(!v||v===r.v)return;
     if(!rangeOk(v)){sv.say(['err',t('e.rangeOf',{name:lb,v:v})]);inp.value=r.v;return}
     act({op:'setRange',group:i,term:k,value:v})});
    // S3: the label, the box, the game's own value, the allowed range
    kids.push(h('div',{class:'row'},[h('span',{text:lb}),inp,h('span',{class:'hint','data-stock':r.stock==null?'':String(r.stock),text:(r.stock!=null?t('range.game',{v:r.stock})+' ':'')+t('range.hint')})]))});
   kids.push(h('div',{class:'row'},[btn(t('up'),function(){act({op:'moveGroup',group:i,dir:-1})},{disabled:i===0}),btn(t('down'),function(){act({op:'moveGroup',group:i,dir:1})},{disabled:i===G.length-1}),
    btn(t('remove'),function(){act({op:'removeGroup',group:i})},{disabled:G.length<2})]));
   kids.push(inDet([code(g.raw)]));return kids}
   return h('li',{'data-tg':'g'+i},[row1(line,mk,false)])}
  function draw(){list.textContent='';rank.textContent='';from.textContent='';var st=TG.st;if(!st)return;
   presets();
   var s=sels()[cur.idx];if(!s){list.appendChild(h('div',{class:'hint',text:t('sel.none')}));return}
   var all=st.selectors,n=0;all.forEach(function(x,i){if(x.file===cur.file&&x.idx===cur.idx)n=i+1});
   rank.textContent=t('sel.rank',{n:n,all:all.length});
   var fi=(st.files||[]).filter(function(f){return f.file===cur.file})[0];from.textContent=fi&&fi.from==='mod'?t('from.mod',{f:cur.file}):t('from.game',{f:cur.file});
   var G=s.groups;capList(G,function(g,i){return groupEl(g,i,G)}).forEach(function(e){list.appendChild(e)})}
  var pbox=h('div');
  function presets(){pbox.textContent='';var st=TG.st;if(!st)return;
   presetRows(pbox,(st.presets||[]).filter(function(p){return p.file===cur.file&&T_KIND[p.id]==='sel'}),act)}
  // the card: its lead, then the change list (so a fix shows its preview at the top), then the picker, the fixes and the folded lists.
  // block(node): no mod, no game folder or a failed read = that one line under the lead, the rest of the card hidden
  var lead=K2.hint('bots.targets.sel.lead',t('sel.lead')),gate=h('div');lead.appendChild(gate);
  var body=[sv.el,
   K2.leaf('bots.targets.sel.pick',[h('label',{text:t('sel.who')}),pick,rank,inDet([from])],t('sel.who')),
   K2.leaf('bots.targets.sel.presets',[h('b',{text:t('presets.h')}),pbox],t('presets.h')),
   K2.leaf('bots.targets.sel.groups',[list],t('sel.groups')),
   moreF('bots.targets.sel.more',[K2.leaf('bots.targets.sel.add',[h('b',{text:t('add.h')}),h('div',{class:'row'},[h('label',{text:t('add.cls')}),acls,h('label',{text:t('add.range')}),arng,h('span',{class:'hint',text:t('add.rangeHint')}),h('label',{text:t('add.at')}),aat,
    btn(t('add.go'),function(){var v=String(arng.value).trim();if(v&&!rangeOk(v)){sv.say(['err',t('e.rangeOf',{name:t('add.range'),v:v})]);return}
     act({op:'addGroup',cls:acls.value,range:v,at:aat.value})})])],t('add.h'))])];
  var el=K2.section('bots.targets.sel',t('title'),[lead].concat(body));
  function block(n){gate.textContent='';if(n)gate.appendChild(n);body.forEach(function(b){b.hidden=!!n})}
  return {el:el,block:block,redraw:function(){fill();draw()},reread:function(){fill();sv.reread()},
   // a symptom: the list it is about picked; apply = its fix added to the change list and previewed (nothing is written)
   focus:function(o){var st=TG.st;if(!st)return null;var s=null;
    if(o.file)s=st.selectors.filter(function(x){return x.file===o.file})[0];
    if(o.preset){var pr=(st.presets||[]).filter(function(p){return p.id===o.preset});var pn=pr.filter(function(p){return p.needed})[0]||pr[0];
     if(pn)s=st.selectors.filter(function(x){return x.file===pn.file&&(o.pick==='launcher'?x.launcher:o.pick==='tank'?x.tankList:true)})[0]||st.selectors.filter(function(x){return x.file===pn.file})[0]}
    if(!s&&o.pick)s=st.selectors.filter(function(x){return o.pick==='launcher'?x.launcher:x.tankList})[0];
    if(s)choose(s.file,s.idx);
    if(o.apply&&o.preset)act({op:'preset',id:o.preset},true);
    return o.preset?byTg(pbox,'p.'+o.preset):null}}}

 // ---- card 3: which shell or bullet for which target
 // a rule in one plain line: who uses that ammo against this target
 function ruleLine(r){var n=tagsName(r.tags);
  if(r.disable)return t('rl.off',{t:n});
  if(r.ai&&r.user&&r.human)return t('rl.all',{t:n});if(r.ai&&r.user)return t('rl.aiVeh',{t:n});if(r.ai)return t('rl.ai',{t:n});
  if(r.user&&r.human)return t('rl.user',{t:n});if(r.user)return t('rl.userVeh',{t:n});return t('rl.none',{t:n})}
 function ammoCard(env){var K2=env.kit,cur=0,model=null,hl=null;
  var pick=h('select',{'aria-label':t('ammo.who')}),from=h('div',{class:'hint'}),list=h('div');
  var atag=h('select',{'aria-label':t('addr.tags')}),aat=h('select',{'aria-label':t('add.at')},[h('option',{value:'',text:t('addr.end')}),h('option',{value:'0',text:t('addr.top')})]);
  var sv=saver(env,'bots.targets.ammo.save','ammo',function(m){model=m;draw()});
  function blocks(){return model||(TG.st&&TG.st.ammo)||[]}
  function fill(){pick.textContent='';var st=TG.st;if(!st||!st.ammo)return;
   st.ammo.forEach(function(b){pick.appendChild(h('option',{value:String(b.i),text:blockName(b)}))});pick.value=String(cur);
   atag.textContent='';(st.tags||[]).forEach(function(g){atag.appendChild(h('option',{value:g,text:tagsName(g)}))});
   sv.setFile('ammo.set')}
  pick.addEventListener('change',function(){cur=Number(pick.value)||0;hl=null;draw()});
  function act(a,show){if(a.op!=='preset')a.block=cur;sv.add(a,show)}
  function optText(o){var k=String(o.k||'').toLowerCase();if(k.indexOf('enable_for_')===0)return null;
   if(k==='volume')return t('opt.volume',{v:(o.v||[]).map(function(v){return opt('vol.'+low(v))||String(v)}).join(' + ')});return opt('opt.'+low(k))||null}
  // a rule's one line names its options too, so the same ammo twice in one block (a "ready" rule and a plain one) reads as two rules;
  // a rule that reads exactly like an earlier one says which
  function ruleSum(r){var os=r.opts.map(optText).filter(Boolean);return ruleLine(r)+(os.length?' ('+os.join('; ')+')':'')}
  function ruleEl(r,j,R,sum){
   function mk(){var kids=[];
   if(r.disable)kids.push(h('div',{class:'err',text:t('opt.disable')}));
   else kids.push(h('div',{class:'row'},['enable_for_ai','enable_for_user','enable_for_human_user'].map(function(key){
    var on=key==='enable_for_ai'?r.ai:key==='enable_for_user'?r.user:r.human,id='tg-'+key+'-'+cur+'-'+j;
    var c=h('input',{type:'checkbox',id:id,checked:on?true:null});c.checked=!!on;
    c.addEventListener('change',function(){act({op:'switch',rule:j,key:key,on:!!c.checked})});
    return h('span',{},[c,h('label',{for:id,text:t('sw.'+key)})])})));
   kids.push(h('div',{class:'row'},[btn(t('up'),function(){act({op:'moveRule',rule:j,dir:-1})},{disabled:j===0}),btn(t('down'),function(){act({op:'moveRule',rule:j,dir:1})},{disabled:j===R.length-1}),
    btn(t('remove'),function(){act({op:'removeRule',rule:j})})]));
   kids.push(inDet([code(r.raw)]));return kids}
   var mark=hl&&((hl.rule&&r.tags.split(' ').indexOf(hl.rule)>=0)||(hl.opt&&r.opts.some(function(o){return o.k===hl.opt})));
   return h('li',{'data-tg':'r'+j,class:mark?'arrflash':null},[row1(sum,mk,!!mark)])}
  function draw(){list.textContent='';var st=TG.st;if(!st)return;
   presets();
   if(!st.ammo){list.appendChild(h('div',{class:'err',text:t('ammo.none')}));return}
   var fi=(st.files||[]).filter(function(f){return f.file==='ammo.set'})[0];from.textContent=fi&&fi.from==='mod'?t('from.mod',{f:'ammo.set'}):t('from.game',{f:'ammo.set'});
   var b=blocks()[cur];if(!b)return;var R=b.rules;
   if(!R.length){list.appendChild(h('div',{class:'hint',text:t('ammo.empty')}));return}
   var first={},sums=R.map(function(r,j){var s=ruleSum(r);if(first[s]==null){first[s]=j;return s}return s+' '+t('rl.again',{n:first[s]+1})});
   capList(R,function(r,j){return ruleEl(r,j,R,sums[j])}).forEach(function(e){list.appendChild(e)});
   var m=list.querySelector('li.arrflash');if(m)for(var n=m;n&&n!==list;n=n.parentNode)if(n.tagName==='DETAILS')n.open=true}
  var pbox=h('div');
  function presets(){pbox.textContent='';var st=TG.st;if(!st)return;
   presetRows(pbox,(st.presets||[]).filter(function(p){return p.file==='ammo.set'}),act);
   if(st.kind==='goh')pbox.appendChild(h('div',{class:'hint',text:t('goh.mg',{game:gameName()})}))}
  var lead=K2.hint('bots.targets.ammo.lead',t('ammo.lead')),gate=h('div');lead.appendChild(gate);
  var body=[sv.el,
   K2.leaf('bots.targets.ammo.pick',[h('label',{text:t('ammo.who')}),pick,inDet([from])],t('ammo.who')),
   K2.leaf('bots.targets.ammo.presets',[h('b',{text:t('presets.h')}),pbox],t('presets.h')),
   K2.leaf('bots.targets.ammo.rules',[list],t('ammo.rules')),
   moreF('bots.targets.ammo.more',[K2.leaf('bots.targets.ammo.add',[h('b',{text:t('addr.h')}),h('div',{class:'row'},[h('label',{text:t('addr.tags')}),atag,h('label',{text:t('add.at')}),aat,
    btn(t('add.go'),function(){act({op:'addRule',tags:atag.value,at:aat.value})})])],t('addr.h'))])];
  var el=K2.section('bots.targets.ammo',t('ammo.title'),[lead].concat(body));
  function block(n){gate.textContent='';if(n)gate.appendChild(n);body.forEach(function(b){b.hidden=!!n})}
  return {el:el,block:block,redraw:function(){fill();draw()},reread:function(){fill();sv.reread()},
   focus:function(o){var st=TG.st;if(!st||!st.ammo)return null;var B=st.ammo,want=null;
    if(o.pick==='tank'){var tc=st.tankClasses||[];want=B.filter(function(b){return !b.cond&&b.cls==='tank'})[0]||B.filter(function(b){return !b.cond&&tc.indexOf(b.cls)>=0})[0]}
    else if(o.pick)want=B.filter(function(b){return !b.cond&&b.cls===o.pick})[0];
    if(want){cur=want.i;pick.value=String(cur)}hl={rule:o.rule==='@bullet'?st.bulletTag:o.rule,opt:o.opt};draw();
    if(o.apply&&o.preset)act({op:'preset',id:o.preset},true);
    return o.preset?byTg(pbox,'p.'+o.preset):list.querySelector('li.arrflash')}}}
 var T_KIND={mgTank:'ammo',mgTankOff:'ammo',rocketInf:'ammo',farTanks:'sel',closeInf:'sel'};
 // fixes that undo each other: shown together as one either/or box, each with when to choose it
 var T_PAIRS=[['mgTank','mgTankOff']];
 // the Fixes list: each fix = its button, what it does, when to choose it ("Choose this if ..."), whether this file needs it
 function presetEl(p,act){var k=low(p.id);
  return h('div',{'data-tg':'p.'+p.id},[btn(t('preset.'+k),function(){act({op:'preset',id:p.id},true)}),h('div',{class:'hint',text:t('preset.'+k+'.d')}),
   h('div',{'data-when':'1',text:t('preset.'+k+'.when')}),
   h('div',{class:'hint','data-need':p.needed?'1':'0',text:p.needed?t('preset.needed'):t('preset.notNeeded')})])}
 function presetRows(box,ps,act){var done={};
  T_PAIRS.forEach(function(pr){var a=ps.filter(function(p){return p.id===pr[0]})[0],b=ps.filter(function(p){return p.id===pr[1]})[0];if(!a||!b)return;done[a.id]=done[b.id]=1;
   box.appendChild(h('div',{'data-pair':pr.join('|'),style:'border-left:3px solid var(--line);padding-left:8px;margin:4px 0'},
    [h('b',{text:t('pair.h')}),presetEl(a,act),h('div',{class:'hint','data-or':'1',text:t('pair.or')}),presetEl(b,act)]))});
  ps.forEach(function(p){if(!done[p.id])box.appendChild(presetEl(p,act))})}

 // ---- card 1: the symptom picker
 function hasPart(id){return typeof BOTS_PARTS!=='undefined'&&BOTS_PARTS.some(function(p){return p&&p.id===id})}
 function partOf(blk){var m=/^bots\.([a-z]+)\./.exec(blk);return m?m[1]:null}
 // the block a symptom jumps to in this game; a part that is not loaded = its group
 function target(s){var env=TG.env,goh=env&&env.gid==='goh',b=goh&&s.gohBlk?s.gohBlk:s.blk,p=partOf(b);
  if(p&&p!=='targets'&&!hasPart(p))return 'group.'+(s.grp||'d');return b}
 // "Show the setting": the card picks what the symptom is about (and adds the fix to the change list when apply), the frame switches page,
 // opens the folds and scrolls; then the block itself is opened and marked for 4 s (looked for again while a page draws)
 function jump(s,apply){var c=s.card?TG.cards[s.card]:null;
  if(c&&!TG.st){TG.later=function(){jump(s,apply)};return true}
  var inner=c?c.focus({pick:s.pick,rule:s.rule,opt:s.opt,preset:s.preset,apply:apply}):null;
  var id=target(s);goTo(id);
  var tries=0;(function look(){var e=blkEl(id);if(e){flash(e);if(inner&&inner!==e)flash(inner);return}
   if(++tries<20&&typeof setTimeout==='function')setTimeout(look,150)})();
  return !!(TG.env&&(TG.env.go||(TG.env.kit&&TG.env.kit.go)))||!!blkEl(id)}
 function symCard(env){var K2=env.kit,inp=h('input',{type:'text',autocomplete:'off','aria-label':t('sym.find'),placeholder:t('sym.findHint')});
  var goh=env.gid==='goh',off=function(s){return goh&&s.noGoh},G=gameName();
  // no mod picked / no game folder: the one line under the lead, every symptom button greyed with the reason in its tooltip
  var gateBox=h('div'),sbtns=[];
  function gateSym(why){gateBox.textContent='';var tip='';
   if(why==='mod'){gateBox.appendChild(needModEl());tip=t('needMod.tip')}else if(why==='game'){gateBox.appendChild(needGameEl());tip=t('needGame.tip')}else if(why)tip=t('e.read');
   sbtns.forEach(function(b){b.disabled=!!why;b.title=tip})}
  function sbtn(b){sbtns.push(b);return b}
  var items=TSYM.map(function(s){var l=t('sym.'+s.id);return {label:l,value:s.id,hint:t('sym.'+s.id+'.why'),lo:(l+' '+t('sym.'+s.id+'.lever')+' '+s.lever).toLowerCase()}});
  var els={};
  // two symptoms that are opposites (their fixes undo each other): each names the other, so the right one is picked
  var OPP={mgtank:'mgwaste',mgwaste:'mgtank'};
  // one symptom = one folded block bots.targets.sym.<id> (a DETAILS, so BOTS_UI.go opens it): its cause, the buttons, the setting in Details.
  // On Gates of Hell a symptom whose setting cannot be changed there is greyed with one plain line and no buttons (S15). A symptom that
  // belongs to another page (attack waves: the Bots page habits) is one link line to that card
  function symEl(s){var id='bots.targets.sym.'+s.id,lb=t('sym.'+s.id),note=h('div');
   // (S15: where that card is not available, Gates of Hell, the line names the card that does work there: gohBlk)
   if(s.link){var gl=goh&&s.gohBlk?s.gohBlk:null;
    var e0=K2.leaf(id,[h('div',{class:'row'},[h('span',{text:t('sym.'+s.id+(gl?'.gohLink':'.link'),{game:G})}),' ',btn(t(gl?'sym.link.goGoh':'sym.link.go'),function(){goTo(gl||s.blk)},{'data-sym':s.id})])],lb);
    els[s.id]=e0;return e0}
   var det=inDet([h('div',{class:'hint',text:t('sym.where')}),code(t('sym.'+s.id+'.lever'))]),kids;
   if(off(s)){var nn=null;
    // S15: the frame's greyed line (kit.na with why and game) when it words the pattern, else this part's own sentence
    if(typeof K2.na==='function'&&typeof K2.naText==='function'){try{nn=K2.na(null,{why:t('sym.noGoh.w'),game:G});if(nn&&nn.setAttribute)nn.setAttribute('data-nogoh','1')}catch(e){nn=null}}
    if(!nn)nn=h('div',{class:'hint','aria-disabled':'true','data-nogoh':'1',style:'opacity:.65;font-style:italic',text:t('sym.noGoh',{game:G})});
    kids=[h('div',{text:t('sym.'+s.id+'.why')}),nn,det]}
   else{var row=[sbtn(btn(t('sym.go'),function(){note.textContent='';if(!jump(s,false))note.appendChild(h('div',{class:'hint',text:t('sym.notHere',{g:String(s.grp||'D').toUpperCase()})}))},{class:'primary','data-sym':s.id}))];
    if(s.preset)row.push(sbtn(btn(t('sym.fix'),function(){jump(s,true)},{'data-symfix':s.id})));
    kids=[h('div',{text:t('sym.'+s.id+'.why')})];if(OPP[s.id])kids.push(h('div',{class:'hint','data-opp':OPP[s.id],text:t('sym.opp',{o:t('sym.'+OPP[s.id])})}));
    kids.push(h('div',{class:'row'},row),note,det)}
   var e=h('details',{blk:id,box:'col','data-blkname':lb,'data-symid':s.id},[h('summary',{style:'cursor:pointer;margin:4px 0'+(off(s)?';opacity:.65':''),text:off(s)?t('sym.offName',{s:lb,game:G}):lb})].concat(kids.map(function(k,i){return K2.leaf(id+'.'+i,[k])})));
   els[s.id]=e;return e}
  // on Gates of Hell the greyed symptoms go to the end of "Show all"
  var top=TSYM.filter(function(s){return s.top&&!off(s)}).sort(function(a,b){return a.top-b.top}),rest=TSYM.filter(function(s){return !s.top&&!off(s)}).concat(TSYM.filter(off));
  var allF=h('details',{blk:'bots.targets.sym.all',box:'col','data-blkname':t('all',{n:TSYM.length})},[h('summary',{class:'hint',text:t('all',{n:TSYM.length})})].concat(rest.map(symEl)));
  // nothing matches what was typed: one line with a hint, never an empty list
  var noneL=K2.leaf('bots.targets.sym.none',[noneEl(t('sym.noneHint'))]);noneL.hidden=true;
  var listEl=h('div',{blk:'bots.targets.sym.list',box:'col','data-blkname':t('sym.pick')},top.map(symEl).concat(rest.length?[allF]:[],[noneL]));
  // the text box also narrows the list as you type (the searchKit list shows the same matches)
  function filter(){var f=String(inp.value||'').trim().toLowerCase(),inRest=0,hits=0;
   items.forEach(function(it){var e=els[it.value];if(!e)return;var hit=!f||it.lo.indexOf(f)>=0||it.hint.toLowerCase().indexOf(f)>=0;e.hidden=!hit;if(hit)hits++;
    if(hit&&rest.some(function(s){return s.id===it.value}))inRest++});
   allF.hidden=!!f&&!inRest;if(f&&inRest)allF.open=true;noneL.hidden=!f||hits>0}
  inp.addEventListener('input',filter);
  function open(id){var e=els[id];if(!e)return;inp.value='';filter();e.open=true;flash(e)}
  // searchKit (owner 2026-11-19): index = the symptoms; Browse = the game data at set/target: a pick opens that file's card. Attached only
  // once the box is in the page (kit.pick; round 1 attached it before, with no parent, so no list ever showed)
  var so={key:'bots.targets.sym',index:function(s,done){env.kit.hitsOf(items,s,done)},
   browse:{mode:'file',view:'data',start:'set/target',exts:['inc','set'],toValue:function(p){return String(p||'').replace(/\\/g,'/').split('/').pop()}},
   onPick:function(v,it,from){if(from==='browse'){var f=String(v);if(/ammo\.set$/i.test(f))jump({card:'ammo',blk:'bots.targets.ammo'},false);else if(/\.inc$/i.test(f)){var c=TG.cards.sel;if(c&&TG.st){var s=TG.st.selectors.filter(function(x){return x.file===f})[0];if(s)c.focus({file:f})}goTo('bots.targets.sel')}return}
    open(v)}};
  if(typeof K2.pick==='function')K2.pick(inp,so);
  else if(typeof searchKit==='function'){var n=0;(function att(){if(inp.parentNode){searchKit(inp,so);return}if(++n<40&&typeof setTimeout==='function')setTimeout(att,n<4?0:100)})()}
  var lead=K2.hint('bots.targets.sym.lead',t('sym.lead'));lead.appendChild(gateBox);
  TG.symGate=gateSym;gateSym(!env.mod?'mod':TG.gate||null);
  return K2.section('bots.targets.sym',t('sym.title'),[lead,
   K2.leaf('bots.targets.sym.find',[h('label',{text:t('sym.find')}),inp],t('sym.find')),listEl])}

 BOTS_PARTS.push({id:'targets.symptom',group:'D',order:5,title:function(){return tx('bots.targets.sym.title')},draw:function(env){TG.env=env;return [symCard(env)]}});
 BOTS_PARTS.push({id:'targets',group:'D',order:20,title:function(){return tx('bots.targets.title')},draw:function(env){TG.env=env;TG.st=null;TG.savers=[];TG.later=null;
  var stat=h('div',{},[wait(t('loading'))]);
  var S=selCard(env),A=ammoCard(env);TG.cards={sel:S,ammo:A};
  // why nothing can be shown ('mod' = no mod picked, 'game' = no game folder, 'read' = the files could not be read): each card says it in
  // one line with the next step instead of drawing empty lists, and the symptom buttons grey with that reason
  function gateAll(why){TG.gate=why||null;
   [S,A].forEach(function(c){c.block(!why?null:why==='mod'?needModEl():why==='game'?needGameEl():env.kit.errBox(t('e.read')))});
   if(typeof TG.symGate==='function')TG.symGate(why||null)}
  if(!env.mod){gateAll('mod');return [S.el,A.el]}
  gateAll(null);
  loadState(function(err,j,x){stat.textContent='';
   // no game folder (the server says so: params.noGame), so the game's own target rules cannot be read: the frame's one line on each card
   if(err&&x&&x.params&&x.params.noGame===true&&/^bots\.targets\.e\.(noSelect|noFile)$/.test(String(x.key||''))){gateAll('game');return}
   // any other read failure: one plain sentence with the next step; the raw reason folded in Details
   if(err){gateAll('read');stat.appendChild(env.kit.errBox(t('e.read')));stat.appendChild(inDet([h('div',{class:'hint',text:t('e.why',{m:String(err&&err.message||err)})})]));return}
   if(j.kind==='goh')stat.appendChild(h('div',{class:'hint',text:t('goh',{game:gameName()})}));
   (j.errors||[]).forEach(function(e){stat.appendChild(h('div',{class:'err',text:t('e.fileP',{what:t(e.file==='ammo.set'?'f.ammo':'f.sel')})}));stat.appendChild(inDet([h('div',{class:'hint',text:t('e.why',{m:e.file+': '+e.msg})})]))});
   S.redraw();A.redraw();var L2=TG.later;TG.later=null;if(L2)L2()});
  return [env.kit.leaf('bots.targets.stat',[stat],t('stat')),S.el,A.el]}});
})();
`;

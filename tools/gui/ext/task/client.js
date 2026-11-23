// ext task, browser side: the "Quick Guided Task" row (#taskrow, above the tabs) and the task window (contract: ./README.md "Client").
// Runs on every page inside the page IIFE (h, tx, api, S, GID, show, toast, askDo, streamRun, viewCheck, chkIn, setMod, blk, LS come
// from tools/gui/page.js). Page rules: ES5, no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent; every string
// through tx(); colours only through theme tokens. The step order is lib/recipe.js steps(), shipped here as text, so the window and
// the server agree. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-b099ab98)
'use strict';
const RS = require('./lib/recipe');

const css = [
  '#taskrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex-basis:100%;padding:2px 0;font-size:13px}',
  '#taskrow:empty{display:none}',
  '#taskrow .tk-lbl{color:var(--hdfg);font-weight:600}',
  '#taskrow select,#taskrow input{max-width:16em}',
  '#taskrow .tk-why{color:var(--hdhint);font-size:12px}',
  '#taskrow .tk-sep{display:inline-block;width:10px}',
  '#taskrow .tk-dash{color:var(--hdfg)}',
  // Hide / Quick Guided Task (the owner, 2026-11-19): the row folds to one button on a thin line; a saved task still shows with a dot and Continue
  '#taskrow .tk-tog{margin-left:auto;background:var(--tab);color:var(--tabfg);border:1px solid var(--hdl);padding:0 8px;font-size:12px}',
  '#taskrow .tk-tog::after{content:" \\25B4"}',
  '#taskrow.tk-min{padding-top:2px;padding-bottom:2px}',
  '#taskrow .tk-show{background:transparent;color:var(--hdfg);border:1px solid var(--hdl);font-weight:600;padding:0 8px;font-size:12px}',
  '#taskrow .tk-show::after{content:" \\25BE";font-weight:400}',
  '#taskrow .tk-wait::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--warnl);margin-right:5px;vertical-align:middle}',
  'body.task-open #nav,body.task-open #subnav,body.task-open #pagenav,body.task-open #main>section{display:none!important}',
  '.tk-win{padding:8px 10px}',
  '.tk-win[hidden]{display:none}',
  '.tk-head{align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:8px}',
  '.tk-title{font-weight:600}',
  '.tk-count{color:var(--hint);margin-left:10px;font-weight:400}',
  '.tk-steps{display:flex;flex-direction:column;gap:2px;max-height:72vh;overflow:auto}',
  '.tk-step{text-align:left;display:flex;gap:6px;background:transparent;border:1px solid transparent;color:var(--fg);padding:2px 6px}',
  '.tk-step.tk-sub{padding-left:20px}',
  '.tk-step.tk-cur{border-color:var(--acc);background:var(--sel)}',
  '.tk-m-done .tk-mk{color:var(--ok)}',
  '.tk-m-kept .tk-mk{color:var(--hint)}',
  '.tk-m-look .tk-mk{color:var(--warnfg)}',
  '.tk-grp{color:var(--hint);font-size:12px;margin-top:6px}',
  '.tk-fold{display:flex;align-items:center;gap:4px;flex-wrap:wrap}',
  '.tk-fold .tk-step{flex:1 1 auto;color:var(--hint)}',
  '.tk-modesw{margin-left:10px}',
  '.tk-res .tk-rid{display:block;font-size:12px}',
  '.tk-gt{color:var(--hint);font-size:12px}',
  '.tk-ask{font-size:16px;font-weight:600;margin:4px 0 8px}',
  '.tk-help{background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:6px 8px;margin:8px 0}',
  '.tk-nav{margin-top:12px;gap:6px;flex-wrap:wrap}',
  '.tk-refuse{color:var(--err)}',
  '.tk-res{display:flex;flex-direction:column;gap:2px;max-height:40vh;overflow:auto;margin-top:4px}',
  '.tk-res button{text-align:left}',
  '.tk-res button.tk-on{border-color:var(--acc);background:var(--sel)}',
  '.tk-src{display:flex;flex-direction:column;gap:4px;margin:4px 0}',
  '.tk-card{border:1px solid var(--line);border-radius:4px;padding:6px 8px;background:var(--card);margin:6px 0}',
  '.tk-sofar table,.tk-look table{width:100%;border-collapse:collapse}',
  '.tk-sofar td,.tk-look td{border-bottom:1px solid var(--line);padding:1px 4px;vertical-align:top}',
  '.tk-look{min-height:120px;max-height:60vh;overflow:auto;overscroll-behavior:contain}',
  // three columns (steps, question, look) hold their place down to 820 px wide; below that they stack: question, look, steps
  '.tk-win [data-blk="task.body"]{display:grid;grid-template-columns:minmax(9em,13em) minmax(0,1fr) minmax(14em,24em);align-items:start;gap:10px}',
  '.tk-win [data-blk="task.body"]>.blk{min-width:0}',
  '@media (max-width:819px){.tk-win [data-blk="task.body"]{grid-template-columns:minmax(0,1fr)}.tk-win [data-blk="task.main"]{order:1}.tk-win [data-blk="task.side"]{order:2}.tk-win [data-blk="task.steps"]{order:3}}',
  '.tk-look pre.tk-lktext{white-space:pre-wrap;word-break:break-word;margin:4px 0;font-size:12px;background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:4px 6px}',
  '.tk-look img,.tk-look canvas,.tk-look video,.tk-look audio{max-width:100%}',
  '.tk-lkname{font-weight:600;margin-bottom:4px;word-break:break-all}',
  '.tk-lkpath{word-break:break-all}',
  '.tk-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border-bottom:1px solid var(--line);padding:4px 0}',
  '.tk-line .tk-lpane{flex-basis:100%}',
  '.tk-card.tk-bad{border-color:var(--err)}',
  '.tk-card.tk-warn{border-color:var(--warnfg)}',
  '.hint.tk-warn{color:var(--warnfg)}',
  '@media (max-width:700px){#taskrow select,#taskrow input{max-width:100%}}',
].join('\n');

const BODY = String.raw`
var TK={cat:null,loading:false,drafts:[],verb:'make',filter:'',sel:'',win:null,d:null,rec:null,recs:{},vals:{},st:[],at:0,stack:[],look:null,kinds:{},cssDone:false,cur:null,plan:null};
try{TK.verb=LS.get('task.verb','make')||'make'}catch(e){}
function tkCss(){if(TK.cssDone||typeof document==='undefined')return;TK.cssDone=true;try{var st=document.createElement('style');st.setAttribute('data-task','1');st.textContent=TKCSS;(document.head||document.body).appendChild(st)}catch(e){}}
function tkCls(e,c,on){if(!e)return;if(e.classList&&e.classList.add){if(on)e.classList.add(c);else e.classList.remove(c);return}var a=String(e.className||'').split(/\s+/).filter(function(x){return x&&x!==c});if(on)a.push(c);e.className=a.join(' ')}
function tkErr(e){toast((e&&(e.text||e.message))||String(e))}
// JOBS (the footer job list): tkJob() names this task's request there ("Guided task: <name>"); a request stopped by the footer's
// Cancel (e.cancelled) is a plain line, never a red error. tkStopCard: what a stopped write did, from draft.stopped (server.js)
function tkWhat(){var n='';try{n=TK.d?tkName(TK.rec||tkCat(TK.d.recipe)||{},TK.d):''}catch(e){n=''}return tx('job.w.task',{name:n})}
function tkJob(){return {what:tkWhat()}}
function tkStopLine(el,k){el.textContent='';el.appendChild(h('div',{class:'hint','data-task-stopped':'1',text:tx(k||'task.stop.plain')}))}
function tkStopName(s){return s.kind==='copies'?tx('task.stop.k.copies'):s.kind==='gen'?tx('task.stop.k.gen'):String(s.name||'')}
function tkStopCard(s){var ss=(s&&s.steps)||[],by=function(st){return ss.filter(function(x){return x.state===st}).map(tkStopName)},dn=by('done'),mid=by('stopped'),left=by('left');
 var c=h('div',{class:'tk-card tk-warn','data-task-stopcard':'1'},[h('b',{text:tx('task.stop.t')})]),ln=function(a,k,p,cls){c.appendChild(h('div',{class:cls||null,'data-task-stop':a,text:tx(k,p)}))};
 if(dn.length)ln('done','task.stop.done',{l:dn.join(', ')});
 if(mid.length)ln('mid','task.stop.mid',{l:mid.join(', ')});
 if(left.length)ln('left','task.stop.left',{l:left.join(', ')});
 if(!s||!s.changed)ln('none','task.stop.none');
 else{ln('points','task.stop.points',{n:s.points||0},'hint');c.appendChild(tkUndoB())}
 if(s&&s.unguarded&&s.unguarded.length)ln('unguarded','task.wr.unguarded',{f:s.unguarded.join(', ')},'tk-refuse');
 ln('again','task.stop.again',null,'hint');return c}
// after a stopped write: the draft says what was done (a stop that came when the last step was done left a whole write)
function tkStopShow(out,b){return api('/api/x/task/draft?'+tkQs({id:TK.d.id})).then(function(r){TK.d=r.draft;out.textContent='';
  if(tkWritten()){out.appendChild(h('div',{class:'tk-card','data-task-stopwhole':'1'},[h('b',{text:tx('task.stop.whole')}),h('div',{class:'hint','data-task-points':'1',text:tx('task.wr.points',{n:(TK.d.restore||[]).length})}),tkUndoB()]));
   if(TK.d.mod&&TK.d.mod!==S.mod)setMod(TK.d.mod);tkDrafts();tkDrawSteps();var nx=b.querySelector('button[data-task-next]'),lt=b.querySelector('button[data-task-nowrite]'),gl=b.querySelector('div[data-task-gate]');if(nx){nx.disabled=false;nx.title=''}if(lt)lt.remove();if(gl)gl.remove();return}
  if(TK.d.stopped)out.appendChild(tkStopCard(TK.d.stopped));else tkStopLine(out,'task.stop.plan')}).catch(function(){tkStopLine(out,'task.stop.unknown')})}
function tkQs(o){var a=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')a.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return a.join('&')}
function tkBase(p){return String(p||'').split(/[\\\/]/).pop()}
function tkGname(){var g=curGame();return g?g.name:''}
function tkCat(id){var a=(TK.cat&&TK.cat.recipes)||[];for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null}
// a recipe's title for a verb: titles {make, change, explore} when the recipe gives one per verb, else title
function tkTk(r,verb){if(!r)return '';var t=r.titles;return (t&&verb&&t[verb])||(t&&t.make)||r.title||''}
// sessionStorage: the open task (draft, step, the parents above it) so a page reload (the --dev live reload) opens it again
function tkSS(v){try{var s=window.sessionStorage;if(!s)return null;if(v===undefined)return s.getItem('task.open');if(v===null)s.removeItem('task.open');else s.setItem('task.open',v)}catch(e){}return null}
function tkRemember(){if(!TK.d)return;var s=TK.st[TK.at];tkSS(JSON.stringify({id:TK.d.id,step:s?s.id:(TK.d.step||''),stack:TK.stack.map(function(x){return {id:x.d.id,q:x.q,line:x.line}})}))}
function tkReopen(){if(TK.reopened||RMT)return;TK.reopened=true;var raw=tkSS(),o=null;if(!raw)return;try{o=JSON.parse(raw)}catch(e){o=null}
 if(!o||!o.id||TK.d){if(!o)tkSS(null);return}var stack=[],ps=o.stack||[];
 function parent(i){if(i>=ps.length)return Promise.resolve();var p=ps[i];
  return api('/api/x/task/draft?'+tkQs({id:p.id})).then(function(r){var d=r.draft;return tkRecipe(d.recipe).then(function(rec){
   var v=rec.values?api('/api/x/task/values?'+tkQs({draft:d.id})).then(function(x){return (x&&x.values)||{}}).catch(function(){return {}}):Promise.resolve({});
   return v.then(function(vals){stack.push({d:d,rec:rec,vals:vals,q:p.q,line:typeof p.line==='number'?p.line:null});return parent(i+1)})})})}
 return parent(0).then(function(){return api('/api/x/task/draft?'+tkQs({id:o.id}))}).then(function(r){TK.stack=stack;return tkEnter(r.draft,o.step)}).catch(function(){tkSS(null);TK.stack=[]})}
function tkWhy(r){if(!r)return 'task.why.none';if(!r.built)return r.fault?'task.why.fault':'task.why.notBuilt';if((r.games||[]).indexOf(GID)<0)return 'task.why.notGame';
 var n=r.needs||[];if(n.indexOf('picked')>=0&&!S.mod)return 'task.why.needMod';if(n.indexOf('game')>=0&&!curFolder())return 'task.why.needGame';if(RMT)return 'task.why.remote';return ''}
// a task left out of this game with a reason of its own (recipe na, game parity) says that plain line instead of "not for <game>"
function tkWhyT(r,w){if(w==='task.why.notGame'&&r&&r.na&&r.na[GID])return tkWords(r.na[GID],{g:tkGname()});return tx(w,{g:tkGname(),m:(r&&r.fault)||''})}
function tkLoad(){if(TK.loading)return;TK.loading=true;
 Promise.all([api('/api/x/task/catalogue'),api('/api/x/task/drafts')]).then(function(r){TK.cat=r[0]||{};TK.catAt=new Date().getTime();TK.drafts=(r[1]&&r[1].drafts)||[];TK.loading=false;tkRow();tkReopen()},
  function(e){TK.loading=false;TK.cat={recipes:[],verbs:['make','change','explore'],err:(e&&(e.text||e.message))||''};tkRow()})}
// the drop-down asks the server again (at most every 5 s) so a recipe shows as soon as it is loaded, never "not built yet" from an old list
function tkCatFresh(cb){var now=new Date().getTime();if(!TK.cat||(TK.catAt&&now-TK.catAt<5000))return;TK.catAt=now;
 api('/api/x/task/catalogue').then(function(c){if(!c||!c.recipes)return;var sig=function(a){return (a||[]).map(function(r){return r.id+':'+(r.built?1:0)+':'+(r.fault?1:0)+':'+(r.verbs||[]).join('+')}).join(',')};
  var old=sig(TK.cat.recipes);TK.cat=c;if(sig(c.recipes)!==old&&cb)cb()}).catch(function(){})}
function tkDrafts(){return api('/api/x/task/drafts').then(function(r){TK.drafts=r.drafts||[];tkRow()}).catch(function(){})}
// the new thing's own name once it has one (its name, title, id or folder answer; the saved title in the drafts list)
function tkNewName(d,not){var a=(d&&d.answers)||{},ks=['name','title','newid','id','folder'];
 for(var i=0;i<ks.length;i++){var x=a[ks[i]];if(x&&(x.src==='value'||x.src==='exist')&&x.value!=null&&String(x.value)!==''&&String(x.value)!==not)return String(x.value)}return ''}
// a draft's name: the new thing's, the copied one only as "from ..." (a change or explore task names the thing itself)
function tkDName(d){if(!d)return '';var b=d.base&&(d.base.name||d.base.id);b=b==null?'':String(b);
 // a name kept the same as the copied thing's does not name the new thing: the next answer (its id) does
 var n=tkNewName(d,(d.verb||'make')==='make'&&b?b:undefined)||(d.answers?'':String(d.title||''));
 if((d.verb||'make')!=='make')return n||b||String(d.title||'');
 if(b)return (n&&n!==b?n+'  ':'')+tx('task.w.from',{x:b});return n}
function tkDraftLabel(d){var r=tkCat(d.recipe),n=tkDName(d);return tkCap(tx('task.row.draft',{verb:tx('task.verb.'+(d.verb||'make')),what:r?tx(tkTk(r,d.verb||'make')):d.recipe}))+(n?': '+n:'')+(d.at?'  ('+tkLocal(d.at)+')':'')}
// d.at is UTC (toISOString): the row shows the PC's own clock
function tkLocal(at){var t=new Date(String(at));if(isNaN(t.getTime()))return String(at).slice(0,16).replace('T',' ');var z=function(n){return (n<10?'0':'')+n};return t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate())+' '+z(t.getHours())+':'+z(t.getMinutes())}
// a row per verb and base: a change task says change words (key.c), a task that copies nothing says suggestion words (key.nb)
function tkVk(k,p){var v=TK.d&&TK.d.verb==='change'?k+'.c':(TK.rec&&!TK.rec.base?k+'.nb':'');if(v&&tx(v)!==v)return tx(v,p);return tx(k,p)}
// sug: the value is a suggestion (suggestion words), else as tkVk
function tkVs(k,p,sug){if(sug){var n=k+'.nb';if(tx(n)!==n)return tx(n,p)}return tkVk(k,p)}
// a value the recipe suggests, not the copy's own: every value of a task that copies nothing, and in a make task that copies, the new
// id an id question gets (the copy keeps its own id, so a value that is not the copy's id is a free one found for the new thing)
function tkSugg(q){var v=q&&TK.vals?TK.vals[q.id]:null;if(!q||v==null||v==='')return false;if(!TK.rec||!TK.rec.base)return true;
 return (TK.d.verb||'make')==='make'&&q.kind==='id'&&!(TK.d.base&&String(v)===String(TK.d.base.id))}
// the write gate: a task with a Write step is written once Write ran (state written, checked or done)
function tkWritten(){return /^(written|checked|done)$/.test(String((TK.d&&TK.d.state)||''))}
function tkUnwritten(){return tkIdx('write')>=0&&!tkWritten()}
// every close but Done says where the task waits: the row's Continue list
function tkSavedToast(d){if(d&&d.state!=='done')toast(tx('task.w.saved',{t:tkName(TK.rec||tkCat(d.recipe)||{},d)}))}
function tkLater(){TASK.close()}
// the undo place: the Editor's Restore points panel; else Mod files, tab Undo (Advanced); else a toast that names both
function tkUndo(){TASK.close().then(function(){var w=window;
 if(typeof as2Link==='function'&&as2Link('page:ide')){setTimeout(function(){if(w.IDE&&w.IDE.panel){try{w.IDE.panel('restore')}catch(e){}}},0);return}
 try{LS.set('files.tab','undo')}catch(e){}if(typeof as2Link==='function'&&as2Link('page:files'))return;toast(tx('task.wr.undoWhere'))})}
// ---------- the row
// folded (task.min in the window settings): one Quick Guided Task button (aria-expanded false) and, when a task is saved, how many wait and Continue
function tkMin(){try{return !!LS.get('task.min',false)}catch(e){return false}}
function tkToggle(min){try{LS.set('task.min',!!min)}catch(e){}tkRow();var el=$('taskrow'),b=el&&el.querySelector(min?'button[data-task-show]':'button[data-task-min]');if(b&&b.focus)b.focus()}
function tkMinRow(el){el.setAttribute('role','group');el.setAttribute('aria-label',tx('task.row.label'));
 el.appendChild(h('button',{type:'button','class':'tk-show','data-task-show':'1','aria-expanded':'false','aria-controls':'taskrow',title:tx('task.row.showT'),text:tx('task.row.label'),onclick:function(){tkToggle(false)}}));
 var ds=TK.drafts||[];if(!ds.length)return;
 el.appendChild(h('span',{'class':'tk-why tk-wait','data-task-wait':'1',text:tx('task.row.waiting',{n:ds.length})}));
 el.appendChild(h('button',{type:'button','data-task-continue':'1',text:tx('task.row.continue'),onclick:function(){TASK.resume(ds[0].id)}}))}
// ---------- search boxes (owner 2026-11-19): every box that looks something up has an indexed search, a manual Browse and a history
// list (searchKit in page.js, tools/gui/README.md); a stand-in page with no kit keeps the bare box (kit null)
function tkKit(inp,o){return typeof searchKit==='function'?searchKit(inp,o):null}
// a lookup box's Browse (owner 2026-11-19: "browse should always be a file directory browse"): the file picker over the game data (the
// mod on top) at the folder where that kind's files live [I: folder per kind from the vanilla layout, not checked for every recipe kind];
// the pick gives the word the lookup is asked with (a file's base name, a map's path, a file's game path) and the lookup's result for that
// file is chosen when it comes. modfolder / oldmod: the folder picker on disk at the mods folder, the folder name
var TKB_DATA=[['entity vehicle gun as2unit botunit mountplace variant object gohunit uniticon veterancy','entity',['def','set','ext']],
 ['breed breedname humanskin squad squadname card','set/breed',null],
 ['weapon newweapon ammo round newround thing item newitem kititem headgear','set/stuff',null],
 ['roundmodel itemmodel invmodel model mdl modelname','entity',['mdl','ply','def']],
 ['army own group tab preset','set/multiplayer',null],
 ['soundname shotsound reloadsound loudness voice voiceset voiceline sound','sound',['wav','ogg']],
 ['flag icon iconname portrait pics','interface',['dds','tga','png']],['texture','texture',['dds','tga','png']],['text','interface/text',null]];
function tkStem(p,e){var s=String((e&&e.name)||p||'').replace(/[\\\/]+$/,'');s=s.slice(Math.max(s.lastIndexOf('/'),s.lastIndexOf('\\'))+1);var i=s.lastIndexOf('.');return i>0?s.slice(0,i):s}
function tkBrowse(kind,o){var dir=kind==='modfolder'||kind==='oldmod';
 if(dir)return {mode:'dir',view:'disk',start:function(){if(o['in'])return o['in'];var g=curFolder();if(g)return join(g,'mods');var m=String(S.mod||'').replace(/[\\\/]+$/,'');return m.replace(/[\\\/][^\\\/]*$/,'')},
  toValue:function(p){var s=String(p||'').replace(/[\\\/]+$/,'');return s.slice(Math.max(s.lastIndexOf('/'),s.lastIndexOf('\\'))+1)}};
 if(kind==='map')return {mode:'dir',view:'data',start:'map',toValue:function(p,e){return String((e&&e.path)||p||'').replace(/[\\\/]+$/,'').replace(/\\/g,'/').replace(/^resource\//i,'')}};
 if(kind==='file'){var ex=String(o.ext||'').split(',').map(function(s){return s.trim().replace(/^\./,'')}).filter(Boolean);
  return {mode:'file',view:'data',start:'',exts:ex.length?ex:null,toValue:function(p,e){return (e&&e.path)||tkStem(p,e)}}}
 var row=null;TKB_DATA.forEach(function(r){if(!row&&(' '+r[0]+' ').indexOf(' '+kind+' ')>=0)row=r});
 var fileKey=kind==='sound'||kind==='texture'||kind==='icon'||kind==='text'||kind==='model';
 return {mode:'file',view:'data',start:row?row[1]:'',exts:row?row[2]:null,toValue:function(p,e){return fileKey&&e&&e.path?e.path:tkStem(p,e)}}}
// the row's tasks of one verb as index rows (title, id; the reason when it cannot start here), group = the verb
function tkRowItems(verb){return ((TK.cat&&TK.cat.recipes)||[]).filter(function(r){return (r.verbs||[]).indexOf(verb)>=0}).map(function(r){var t=tx(tkTk(r,verb)),w=tkWhy(r);
 return {label:t,value:r.id,hint:w?tkWhyT(r,w):'',verb:verb,lo:(t+' '+r.id).toLowerCase()}})}
function tkRow(){var el=$('taskrow');if(!el)return;tkCss();el.textContent='';
 var min=tkMin();tkCls(el,'tk-min',min);
 if(min){tkMinRow(el);if(!TK.cat)tkLoad();return}
 if(!TK.cat){el.appendChild(h('span',{class:'tk-lbl',text:tx('task.row.label')}));tkLoad();return}
 el.setAttribute('role','group');el.setAttribute('aria-label',tx('task.row.label'));
 var verbs=TK.cat.verbs||['make','change','explore'];if(verbs.indexOf(TK.verb)<0)TK.verb=verbs[0];
 var vs=h('select',{'aria-label':tx('task.row.verbAria'),'data-task-verb':'1',onchange:function(){TK.verb=vs.value;try{LS.set('task.verb',TK.verb)}catch(e){}TK.sel='';fill()}},verbs.map(function(v){return h('option',{value:v,text:tx('task.verb.'+v)})}));vs.value=TK.verb;
 var fi=h('input',{type:'search',placeholder:tx('task.row.filter'),'aria-label':tx('task.row.filter'),autocomplete:'off',class:'tk-filter','data-task-filter':'1',oninput:function(){TK.filter=fi.value;fill()}});fi.value=TK.filter;
 // the filter is a search box (owner 2026-11-19): the tasks of this verb as its index (a pick selects that task), history, and Browse =
 // the file picker (a task is no file: the default picker at the mod, disk; a phone: the game data), the base name of the pick as the
 // filter text. The catalogue is loaded once; nothing goes to the server while typing
 var fk=tkKit(fi,{key:'task.row.filter',
  index:function(s,done){var lo=s.toLowerCase(),a=tkRowItems(TK.verb).filter(function(x){return x.lo.indexOf(lo)>=0});done(a.slice(0,30),Math.max(0,a.length-30))},
  browse:{mode:'file',view:RMT?'data':'disk',start:function(){return RMT?'':(S.mod||'')},toValue:tkStem},
  onPick:function(v,it){if(it&&it.verb){if(it.verb!==TK.verb){TK.verb=it.verb;vs.value=it.verb;try{LS.set('task.verb',TK.verb)}catch(e){}}fi.value='';TK.filter='';TK.sel=it.value;fill();rs.value=it.value;sync();return}fi.value=v;TK.filter=v;fill()}});
 var rs=h('select',{'aria-label':tx('task.row.taskAria'),'data-task-recipe':'1',onchange:function(){TK.sel=rs.value;sync()},onfocus:function(){fill();tkCatFresh(fill)}});
 var why=h('span',{class:'tk-why','data-task-why':'1'});
 var start=h('button',{type:'button',class:'primary','data-task-start':'1',text:tx('task.row.start'),onclick:function(){var r=tkCat(rs.value),w=tkWhy(r);if(w){toast(tkWhyT(r,w));return}if(r.page){S[r.page.flag]=1;show(r.page.tab);return}TASK.open(r.id,TK.verb)}});
 function sync(){var r=tkCat(rs.value),w=tkWhy(r);start.disabled=!!w;why.textContent=w&&r?tkWhyT(r,w):''}
 function fill(){var keep=rs.value||TK.sel;rs.textContent='';var f=String(TK.filter||'').toLowerCase(),first='',firstAny='',has=false;
  (TK.cat.recipes||[]).forEach(function(r){if((r.verbs||[]).indexOf(TK.verb)<0)return;var t=tx(tkTk(r,TK.verb));if(f&&t.toLowerCase().indexOf(f)<0&&r.id.indexOf(f)<0)return;var w=tkWhy(r);
   var o=h('option',{value:r.id,text:w?t+'  ('+tkWhyT(r,w)+')':t,'data-why':w||null,title:r.fault?tkWhyT(r,w):null});if(w){o.disabled=true;o.setAttribute('disabled','')}rs.appendChild(o);
   if(!w&&!first)first=r.id;if(!firstAny)firstAny=r.id;if(r.id===keep&&!w)has=true});
  if(!firstAny)rs.appendChild(h('option',{value:'',text:tx('task.row.none')}));
  rs.value=has?keep:(first||firstAny||'');sync()}
 // the dash after the label is a mark, not text: never in the lang string (task dash rule), not read aloud
 var parts=[h('span',{class:'tk-lbl',text:tx('task.row.label')}),h('span',{class:'tk-dash','aria-hidden':'true',text:'-'}),h('span',{text:tx('task.row.want')}),vs,rs,start,fk?fk.el:fi,why];
 var ds=TK.drafts||[];
 if(ds.length){var dsel=h('select',{'aria-label':tx('task.row.contAria'),'data-task-drafts':'1'},ds.map(function(d){return h('option',{value:d.id,text:tkDraftLabel(d)})}));
  parts.push(h('span',{class:'tk-sep'}),dsel,h('button',{type:'button','data-task-continue':'1',text:tx('task.row.continue'),onclick:function(){TASK.resume(dsel.value)}}),
   h('button',{type:'button',class:'danger','data-task-del':'1',text:tx('task.row.delete'),onclick:function(){tkDelete(dsel.value)}}))}
 if(TK.cat.err)parts.push(h('span',{class:'tk-why',text:tx('task.row.loadErr',{m:TK.cat.err})}));
 parts.push(h('button',{type:'button','class':'tk-tog','data-task-min':'1','aria-expanded':'true','aria-controls':'taskrow',title:tx('task.row.hideT'),text:tx('task.row.hide'),onclick:function(){tkToggle(true)}}));
 parts.forEach(function(p){el.appendChild(p)});fill()}
function tkDelete(id){var d=null;(TK.drafts||[]).forEach(function(x){if(x.id===id)d=x});if(!d)return;
 askDo({title:tx('task.del.title'),lines:[tkDraftLabel(d),d.children?tx('task.del.kids',{n:d.children}):'',tx('task.del.line')],ok:tx('task.del.ok'),danger:true}).then(function(y){if(!y)return;
  api('/api/x/task/draft/delete',{id:id}).then(function(r){toast(tx('task.del.done')+(r&&r.restore&&r.restore.length?'  '+tx('task.ho.guarded',{n:r.restore.length}):''));tkDrafts()}).catch(tkErr)})}
// ---------- the window
function tkWin(){if(TK.win)return TK.win;tkCss();
 var title=h('span',{class:'tk-title','data-task-title':'1'}),count=h('span',{class:'tk-count','data-task-count':'1'});
 // Quick or Everything, any time: the same choice as the mode step (shown only when the task has that step)
 var modesw=h('select',{class:'tk-modesw','aria-label':tx('task.mode.sw'),'data-task-modesw':'1',onchange:function(){tkSetMode(modesw.value)}},[h('option',{value:'quick',text:tx('task.mode.swQuick')}),h('option',{value:'all',text:tx('task.mode.swAll')})]);modesw.hidden=true;
 var closeB=h('button',{type:'button','data-task-close':'1',text:tx('task.w.close'),onclick:function(){TASK.close()}});
 var steps=h('div',{class:'tk-steps',role:'list','aria-label':tx('task.w.steps')}),qb=h('div',{class:'tk-qb','data-task-q':'1'});
 var look=h('div',{class:'tk-look','data-task-look':'1'}),sofar=h('div',{class:'tk-sofar','data-task-sofar':'1'});
 // the look pane: the thing (kept while it stays the same) and the copy's numbers under it
 var lookThing=h('div',{'data-task-lookthing':'1'}),lookNums=h('div',{'data-task-looknums':'1'});look.appendChild(lookThing);look.appendChild(lookNums);
 var root=h('div',{id:'taskwin',class:'tk-win','data-blkroot':'task',role:'region','aria-label':tx('task.row.label')},[
  blk('task.head',[blk('task.title',[title,count,modesw]),blk('task.close',[closeB])],{box:'row','class':'tk-head'}),
  blk('task.body',[blk('task.steps',[steps]),blk('task.main',[blk('task.q',[qb])],{box:'col'}),blk('task.side',[blk('task.look',[h('b',{text:tx('task.w.look')}),look]),blk('task.sofar',[h('b',{text:tx('task.w.sofar')}),sofar])],{box:'col'})],{box:'ncols'})]);
 root.addEventListener('keydown',tkKey);
 // a refusal goes as soon as the user types or picks again
 qb.addEventListener('input',tkUnrefuse);qb.addEventListener('change',tkUnrefuse);
 var host=$('main')||document.body;host.appendChild(root);
 TK.win={root:root,title:title,count:count,modesw:modesw,steps:steps,q:qb,look:look,lookThing:lookThing,lookNums:lookNums,sofar:sofar};
 if(typeof blkInitRoot==='function'){try{blkInitRoot(root)}catch(e){}}
 return TK.win}
function tkKey(e){var t=e.target||{},tag=String(t.tagName||'');
 if(e.key==='Escape'){e.preventDefault();TASK.close();return}
 if(e.altKey&&(e.key==='ArrowLeft'||e.key==='Left')){e.preventDefault();tkBack();return}
 // Enter is Next, never on Write (Write has its own button and its confirm box)
 if(e.key==='Enter'&&!e.shiftKey&&!e.altKey&&tag!=='TEXTAREA'&&tag!=='BUTTON'&&tag!=='SELECT'){e.preventDefault();var s=TK.st[TK.at];if(s&&s.kind==='write')return;tkNext()}}
function tkUnrefuse(){var b=TK.win&&TK.win.q,old=b&&b.querySelector('div[data-task-refuse]');if(old)old.remove()}
function tkRecipe(id){if(TK.recs[id])return Promise.resolve(TK.recs[id]);return api('/api/x/task/recipe?'+tkQs({id:id})).then(function(r){TK.recs[id]=r;return r})}
function tkValues(){TK.vals={};if(!TK.rec.values)return Promise.resolve();
 return api('/api/x/task/values?'+tkQs({draft:TK.d.id})).then(function(r){TK.vals=(r&&r.values)||{}}).catch(function(){TK.vals={}})}
function tkSteps(){TK.st=tkStepsOf(TK.rec,TK.d,TK.vals)}
function tkIdx(id){for(var i=0;i<TK.st.length;i++)if(TK.st[i].id===id)return i;return -1}
function tkEnter(d,stepId){return tkRecipe(d.recipe).then(function(rec){TK.d=d;TK.rec=rec;TK.plan=null;return tkValues()}).then(function(){var w=tkWin();
 tkCls(document.body,'task-open',true);w.root.hidden=false;tkSteps();var i=tkIdx(stepId||TK.d.step);TK.at=i<0?0:i;tkDraw();tkRemember();return TK.d})}
function tkSave(){if(RMT||!TK.d)return Promise.resolve(TK.d);var s=TK.st[TK.at];TK.d.step=s?s.id:'';TK.d.title=tkNewName(TK.d)||'';tkRemember();
 return api('/api/x/task/draft/save',{draft:TK.d}).then(function(r){if(r&&r.draft&&TK.d&&r.draft.id===TK.d.id)TK.d=r.draft;return TK.d}).catch(function(e){tkErr(e);return TK.d})}
function tkLookClose(){if(TK.look&&TK.look.close){try{TK.look.close()}catch(e){}}TK.look=null}
// a custom kind's leave(q, state, host): called when its question is left (another step drawn) or the window closes
function tkLeave(){var f=TK.leave;TK.leave=null;if(f){try{f()}catch(e){}}}
function tkQ(id){var g=TK.rec.groups||[];for(var i=0;i<g.length;i++)for(var j=0;j<(g[i].q||[]).length;j++)if(g[i].q[j].id===id)return g[i].q[j];return null}
function tkG(id){var g=TK.rec.groups||[];for(var i=0;i<g.length;i++)if(g[i].id===id)return g[i];return null}
function tkName(rec,d){var n=tkDName(d);return tkCap(tx('task.verb.'+(d.verb||'make'))+' '+tx(tkTk(rec,d.verb||'make')))+(n?': '+n:'')}
// a title starts with a capital letter (a language with no capitals stays as it is)
function tkCap(s){s=String(s==null?'':s);return s.charAt(0).toUpperCase()+s.slice(1)}
function tkGT(id){var g=tkG(id);return g?tx(g.title):String(id||'')}
function tkStepLabel(s){if(s.kind==='q'){var q=tkQ(s.q);return q?tx(q.ask):s.q}if(s.kind==='group')return tkVk('task.g.folded',{g:tkGT(s.group),n:s.count});return tkVk('task.s.'+s.kind)}
function tkMark(s){var d=TK.d,a=(d.answers||{})[s.q];
 if(s.kind==='group')return 'kept';
 if(s.kind==='mod')return d.mod?'done':'todo';
 if(s.kind==='base')return d.base&&d.base.id?'done':'todo';
 if(s.kind==='q'&&a&&a.src==='list'&&a.items){for(var li=0;li<a.items.length;li++){var it=a.items[li];if(!it||(it.src==='branch'&&!it.child)||(it.src==='file'&&it.bad))return 'look'}return 'done'}
 if(s.kind==='q'){if(a&&a.src==='file'&&a.bad)return 'look';if(a&&a.src==='branch'&&!a.child)return 'look';if(a&&a.src!=='keep')return 'done';if(a||s.kept)return 'kept';return 'todo'}
 if(s.kind==='write')return /^(written|checked|done)$/.test(d.state)?'done':'todo';
 if(s.kind==='check')return /^(checked|done)$/.test(d.state)?'done':'todo';
 if(s.kind==='checklist')return (TK.rec.checklist||[]).length&&(d.ticks||[]).length>=(TK.rec.checklist||[]).length?'done':'todo';
 if(s.kind==='done')return d.state==='done'?'done':'todo';
 return tkIdx(d.step)>tkIdx(s.id)?'done':'todo'}
function tkDraw(){var w=TK.win,s=TK.st[TK.at];if(!w||!s)return;
 var trail=TK.stack.map(function(x){return tkName(x.rec,x.d)}).concat([tkName(TK.rec,TK.d)]).join(' > ');
 w.title.textContent=trail+(TK.d.mod?'  '+tx('task.w.mod',{m:tkBase(TK.d.mod)}):'');var more=tkMore();w.count.textContent=tx('task.w.stepOf',{n:TK.at+1,m:TK.st.length})+(more?' '+tkVk('task.w.keptMore',{n:more}):'');
 var hasM=tkIdx('mode')>=0;w.modesw.hidden=!hasM;if(hasM)w.modesw.value=TK.d.mode==='quick'?'quick':'all';
 tkDrawSteps();tkLeave();tkLookStep(s);tkDrawQ(s);tkSofar()}
function tkDrawSteps(){var l=TK.win.steps,lastG='';l.textContent='';
 TK.st.forEach(function(s,i){var m=tkMark(s);
  // a group Quick keeps as copied: one line, its count, and Ask these (opens just that group)
  if(s.kind==='group'){lastG=s.group;l.appendChild(h('div',{class:'tk-fold',role:'listitem','data-task-fold':s.group},[
   h('button',{type:'button',class:'tk-step tk-m-kept'+(i===TK.at?' tk-cur':''),'data-step':s.id,'aria-current':i===TK.at?'step':null,title:tkVk('task.m.kept'),onclick:function(){tkGo(i)}},[h('span',{class:'tk-mk',text:tkVk('task.mk.kept')}),h('span',{text:(i+1)+'  '+tkStepLabel(s)})]),
   h('button',{type:'button','data-task-askgroup':s.group,text:tx('task.g.askThese'),onclick:function(){tkAskGroup(s.group)}})]));return}
  if(s.kind==='q'&&s.group!==lastG){lastG=s.group;var g=tkG(s.group);l.appendChild(h('div',{class:'tk-grp',text:(g?tx(g.title):s.group)+(s.kept?'  '+tkVk('task.g.keptMark'):'')}))}
  if(s.kind!=='q')lastG='';
  l.appendChild(h('button',{type:'button',role:'listitem',class:'tk-step tk-m-'+m+(i===TK.at?' tk-cur':'')+(s.depth?' tk-sub':''),'data-step':s.id,'aria-current':i===TK.at?'step':null,title:tx('task.m.'+m),onclick:function(){tkGo(i)}},
   [h('span',{class:'tk-mk',text:tx('task.mk.'+m)}),h('span',{text:(i+1)+'  '+tkStepLabel(s)})]))})}
function tkGo(i){if(i<0||i>=TK.st.length)return;TK.at=i;tkDraw();tkSave()}
function tkSkip(i,dir){while(i>=0&&i<TK.st.length&&(TK.st[i].kind==='q'||TK.st[i].kind==='group')&&TK.st[i].kept)i+=dir;return i}
// the values Quick keeps as copied (the folded groups' counts), for the head
function tkMore(){var n=0;TK.st.forEach(function(s){if(s.kind==='group')n+=s.count||0});return n}
function tkBack(){var i=tkSkip(TK.at-1,-1);if(i<0)i=0;tkGo(i)}
// Next: take the answer of the current step (a promise of {ok, answer|why}), save, recompute the steps (when), go on
function tkNext(){var s=TK.st[TK.at];if(!s)return;
 // Next and Enter never leave Write before the write happened (or the user picks Do not write now: save and close)
 if(s.kind==='write'&&!tkWritten()){tkRefuse(tx('task.wr.first'));return}
 if(tkGated(s))return;var p=TK.cur&&TK.cur.value?TK.cur.value():Promise.resolve({ok:true});
 // a refusal belongs to its question: an answer that comes back after the window moved on says nothing
 Promise.resolve(p).then(function(r){if(r&&r.stopped){var osr=TK.win&&TK.win.q&&TK.win.q.querySelector('div[data-task-refuse]');if(osr)osr.remove();return}   // JOBS: the answer's own request was stopped from the job list: the kind's box says so, no refusal
  if(!r||r.ok===false){if(TK.d&&TK.st[TK.at]&&TK.st[TK.at].id===s.id)tkRefuse((r&&r.why)||tx('task.err.answer'),r&&r.limit);return}
  if(s.kind==='q'&&r.answer)TK.d.answers[s.q]=r.answer;
  var cur=s.id;tkSteps();var i=tkIdx(cur);var n=tkSkip((i<0?TK.at:i)+1,1);if(n>=TK.st.length)n=TK.st.length-1;TK.at=n;tkDraw();tkSave()}).catch(tkErr)}
function tkKeep(){var s=TK.st[TK.at];if(!s||s.kind!=='q')return;var q=tkQ(s.q);
 // a suggested value of a task that copies (the free id the recipe found) is not the copy's: Use the suggestion keeps it as typed
 TK.d.answers[s.q]=TK.rec.base&&q&&tkSugg(q)?{src:'value',value:TK.vals[q.id]}:{src:'keep'};var cur=s.id;tkSteps();var i=tkIdx(cur);TK.at=Math.min(TK.st.length-1,tkSkip((i<0?TK.at:i)+1,1));tkDraw();tkSave()}
function tkKeepGroup(g,on){var k=TK.d.kept||(TK.d.kept=[]),i=k.indexOf(g);if(on&&i<0)k.push(g);if(!on&&i>=0)k.splice(i,1);
 var a=TK.d.asked||(TK.d.asked=[]),j=a.indexOf(g);if(on&&j>=0)a.splice(j,1);if(!on&&j<0)a.push(g);
 var cur=TK.st[TK.at].id;tkSteps();var at=tkIdx(cur);if(at<0)at=tkIdx('g:'+g);
 if(on){at=tkSkip(at<0?TK.at:at,1);if(at>=TK.st.length)at=TK.st.length-1}TK.at=at<0?0:at;tkDraw();tkSave()}
// Ask these: the folded group opens (draft.asked), the window goes to its first question
function tkAskGroup(g){var a=TK.d.asked||(TK.d.asked=[]),k=TK.d.kept||(TK.d.kept=[]);if(a.indexOf(g)<0)a.push(g);var i=k.indexOf(g);if(i>=0)k.splice(i,1);
 var cur=TK.st[TK.at]?TK.st[TK.at].id:'';tkSteps();var at=tkFirstOf(g);
 if(at<0)at=tkIdx(cur);TK.at=at<0?0:at;tkDraw();tkSave()}
// the head switch and the mode step: Quick folds the groups that are not essential, Everything asks each value; the window stays on
// the step it was on (a question Quick folds away: its group's line)
function tkSetMode(m){if(!TK.d)return;var s=TK.st[TK.at],cur=s?s.id:'',g=s&&s.group;TK.d.mode=m==='all'?'all':'quick';tkSteps();
 var at=tkIdx(cur);if(at<0&&g)at=tkIdx('g:'+g);if(at<0&&g)at=tkFirstOf(g);TK.at=at<0?0:at;tkDraw();tkSave()}
function tkFirstOf(g){for(var n=0;n<TK.st.length;n++)if(TK.st[n].kind==='q'&&TK.st[n].group===g)return n;return -1}
function tkRefuse(m,lim){var b=TK.win.q,old=b.querySelector('div[data-task-refuse]');if(old)old.remove();
 var e=h('div',{class:'tk-refuse',role:'alert','data-task-refuse':'1'},[h('span',{text:m})]);
 if(lim)e.appendChild(h('button',{type:'button',class:'linkb','data-lim':lim,text:tx('task.q.limit',{id:lim}),onclick:function(){TASK.close().then(function(){if(typeof as2Link!=='function'||!as2Link('lim:'+lim))toast(tx('task.q.noLimit',{id:lim}))})}}));
 b.appendChild(e)}
function tkNav(b,o){o=o||{};var s=TK.st[TK.at];
 var back=h('button',{type:'button','data-task-back':'1',text:tx('task.w.back'),onclick:tkBack});back.disabled=TK.at===0;
 var row=h('div',{class:'row tk-nav'},[back]);
 var sg=s.kind==='q'&&tkSugg(tkQ(s.q));
 if(s.kind==='q'&&!o.noKeep)row.appendChild(h('button',{type:'button','data-task-keep':'1',text:tkVs('task.w.keep',null,sg),title:tkVs('task.w.keepT',null,sg),onclick:tkKeep}));
 if(!o.noNext){var nx=h('button',{type:'button',class:'primary','data-task-next':'1',text:tx(TK.at>=TK.st.length-1?'task.w.finish':'task.w.next'),onclick:o.next||tkNext});if(o.gate){nx.disabled=true;nx.title=tx('task.wr.first')}row.appendChild(nx)}
 if(o.gate||o.later)row.appendChild(h('button',{type:'button','data-task-nowrite':'1',text:tx('task.wr.later'),onclick:tkLater}));
 b.appendChild(row)}
// Check, Test, the checklist and Done of a task not written yet: a card that says so, Go to Write, or save and close
function tkGated(s){return !!s&&/^(check|test|checklist|done)$/.test(s.kind)&&tkUnwritten()}
function tkStepUnwritten(b){tkHead(b,tx('task.wr.notYet'),tx('task.wr.notYetH'));
 b.appendChild(h('div',{class:'row','data-task-unwritten':'1'},[h('button',{type:'button',class:'primary','data-task-gowrite':'1',text:tx('task.wr.goWrite'),onclick:function(){tkGo(tkIdx('write'))}})]));
 tkNav(b,{noNext:true,later:true})}
function tkDrawQ(s){var b=TK.win.q;b.textContent='';TK.cur=null;
 if(tkGated(s)){tkStepUnwritten(b);return}
 var F={mod:tkStepMod,base:tkStepBase,mode:tkStepMode,group:tkStepGroup,q:tkStepQ,review:tkStepReview,write:tkStepWrite,check:tkStepCheck,test:tkStepTest,checklist:tkStepChecklist,done:tkStepDone,back:tkStepBack}[s.kind];
 if(F)F(b,s);else b.appendChild(h('div',{text:s.kind}))}
function tkHead(b,ask,help){b.appendChild(h('div',{class:'tk-ask',text:ask}));if(help)b.appendChild(h('div',{class:'tk-help'},[h('b',{text:tx('task.w.means')+' '}),h('span',{text:help})]))}
// ---------- built-in steps
function tkStepMod(b){tkHead(b,tx('task.mstep.ask'),tx('task.mstep.help'));var box=h('div',{class:'tk-src','data-task-mods':'1'}),pick=TK.d.mod||S.mod||'';
 function radio(p,label){var r=h('input',{type:'radio',name:'tkmod',value:p});r.checked=p===pick;r.addEventListener('change',function(){pick=p});return h('label',{},[r,h('span',{text:' '+label})])}
 if(S.mod)box.appendChild(radio(S.mod,tx('task.mstep.picked',{m:tkBase(S.mod)})));
 // the mods folder of the draft's game, not the open tab's: a GoH draft opened on an AS2 tab lists and makes GoH mods, and back
 // (a recipe may write for another game than its own, recipe writes: gohunit on the GoH tab makes an AS2 mod, lib/recipe.js writesOf)
 var tg=TK.d.game||GID;if(TK.rec&&TK.rec.writes&&TK.rec.writes[tg])tg=TK.rec.writes[tg];var goh=tg==='goh',gd=goh?(typeof gohDir==='function'?gohDir():''):gameDir();
 b.appendChild(box);var dir=gd?join(gd,'mods'):'';
 if(dir)api('/api/mods?'+tkQs({dir:dir})).then(function(r){(r.mods||[]).forEach(function(m){if(m.path!==S.mod)box.appendChild(radio(m.path,(m.name||m.folder)+'  ('+m.folder+')'))})}).catch(function(){});
 var nm=h('input',{type:'text',autocomplete:'off','aria-label':tx('task.mstep.newName'),placeholder:tx('task.mstep.newName'),'data-task-newmod':'1'});
 // game parity: the new mod is for the task's game (newmod --target as64|mowas2|goh; under goh --game is the GoH install). On the GoH
 // tab a full folder path outside the GoH install is taken as typed: ARSENAL never writes into the GoH install, and a folder inside it
 // gets the write guard's plain refusal from the command (shown as the fail line)
 var mk=h('button',{type:'button','data-task-makemod':'1',text:tx('task.mstep.make'),onclick:function(){var raw=String(nm.value||'').trim(),full=goh&&isAbs(raw),n=full?raw.split(/[\\\/]+/).filter(Boolean).pop().toLowerCase():raw.toLowerCase().replace(/\s+/g,'_');
  if(!/^[a-z][a-z0-9_]{0,60}$/.test(n||'')){tkRefuse(tx('task.mstep.badName'));return}if(!dir&&!full){tkRefuse(tx('task.mstep.needGame'));return}var to=full?raw:join(dir,n),where=full?raw.replace(/[\\\/]+[^\\\/]+[\\\/]*$/,''):dir;
  var inp={dir:to,name:n};if(tg==='mowas2'||goh)inp.target=tg;if(goh&&typeof gohDir==='function'&&gohDir())inp.game=gohDir();
  askDo({title:tx('task.mstep.makeAsk'),lines:[to],where:where,ok:tx('task.mstep.make')}).then(function(y){if(!y)return;
   var tail=[];streamRun('new',inp,{line:function(k,t){var x=String(t==null?'':t).trim();if(x)tail.push(x);if(tail.length>6)tail.shift()}}).then(function(end){if(!end||end.code!==0){tkRefuse(tx('task.mstep.makeFail')+(tail.length?' '+tail.join(' '):''));return}pick=to;setMod(to);TK.d.mod=to;tkSave().then(tkValues).then(function(){tkSteps();tkDraw()})})})}});
 b.appendChild(h('div',{class:'tk-card'},[h('div',{text:tx(goh?'task.mstep.newHintGoh':'task.mstep.newHint')}),h('div',{class:'row'},[nm,mk])]));
 // the values read the mod too (its own files over the game's): a new mod is saved first, then the values are asked again
 TK.cur={value:function(){if(!pick)return Promise.resolve({ok:false,why:tx('task.mstep.none')});var ch=TK.d.mod!==pick;TK.d.mod=pick;if(pick!==S.mod)setMod(pick);
  return ch&&TK.rec.values?tkSave().then(tkValues).then(function(){return {ok:true}}):Promise.resolve({ok:true})}};
 tkNav(b)}
// a lookup box (base, a picker's Pick one that exists, a list line): the results under the box, asked again a short pause after each key.
// Its search kit (history key task.lookup.<kind>) takes its index rows from those same answers (no second call per key; an answer for
// older words is dropped; ArrowDown on an empty box gets the last answer or one lookup of the usual 50), and its Browse is the file picker
// at the kind's folder (tkBrowse): the pick is looked up and its result chosen when the answer has it (same file, else the same id or name)
function tkSearch(host,kind,o,onPick){o=o||{};var inp=h('input',{type:'search',autocomplete:'off','aria-label':tx('task.pk.words'),placeholder:tx('task.pk.words'),'data-task-search':kind});
 var go=h('button',{type:'button','data-task-find':'1',text:tx('task.pk.find')}),res=h('div',{class:'tk-res',role:'listbox','aria-label':tx('task.pk.results')}),st=h('div',{class:'hint'}),seq=0,btns={},last=null,pend=null,flying=null,pb=null;
 function qs(w,lim){return '/api/x/task/lookup?'+tkQs({kind:kind,q:w,mod:TK.d.mod||S.mod,game:TK.d.game||GID,recipe:TK.rec.id,ext:o.ext||'','in':o['in']||'',filter:o.filter?JSON.stringify(o.filter):'',draft:TK.d.id,limit:lim||''})}
 function mark(bt){var all=res.querySelectorAll('button');for(var i=0;i<all.length;i++)tkCls(all[i],'tk-on',false);if(bt)tkCls(bt,'tk-on',true)}
 function add(x){var bt=h('button',{type:'button',role:'option','data-id':x.id,onclick:function(){mark(bt);tkUnrefuse();onPick(x)}},tkResParts(x));btns[String(x.id)]=bt;res.appendChild(bt);return bt}
 function choose(x){var bt=btns[String(x.id)]||add(x);mark(bt);tkUnrefuse();onPick(x)}
 function item(x){var id=String(x.id==null?'':x.id),nm=x.name!=null&&String(x.name)!==''?String(x.name):id;
  return {label:nm,value:id,hint:[nm!==id?id:'',x.where||'',x.sub&&x.sub!==id?String(x.sub):''].filter(Boolean).join('  '),x:x}}
 function run(){due=false;var my=++seq,w=String(inp.value||'');flying=w.trim();st.textContent=tx('task.pk.looking');
  api(qs(w)).then(function(r){if(my!==seq)return;res.textContent='';btns={};
   if(r.state==='running'){st.textContent=tx('task.pk.wait');if(typeof pollLater==='function')pollLater('',run,1500);else setTimeout(run,1500);return}flying=null;
   // a row with the id ? is a message, not a pick; a lookup with nothing to pick and a why says why (a lang key or words) and what to do
   var real=(r.results||[]).filter(function(x){return x&&x.id!=='?'}),msgs=(r.results||[]).filter(function(x){return x&&x.id==='?'});
   st.textContent=real.length?tx('task.pk.found',{n:r.total||real.length})+(r.more?' '+tx('task.pk.more'):''):(r.why||msgs.length?'':tx('task.pk.nothing'));
   if(!real.length&&r.why){var wt=tkWords(r.why,r.params);if(!msgs.some(function(m){return m.name===r.why}))res.appendChild(h('div',{class:'tk-refuse','data-task-lookwhy':'1',text:wt}));if(r['do'])res.appendChild(h('div',{class:'hint','data-task-lookdo':'1',text:tkWords(r['do'],r.params)}))}
   msgs.forEach(function(m){res.appendChild(h('div',{class:'hint','data-task-lookmsg':'1',text:tkWords(String(m.name||''))}))});
   real.forEach(add);
   last={q:w.trim(),items:real.map(item),more:r.more?Math.max(0,(r.total||0)-real.length):0};if(pend&&pend.q===last.q){var p=pend;pend=null;p.done(last.items,last.more)}
   if(pb&&pb.w===last.q){var b=pb,lo=function(v){return String(v==null?'':v).toLowerCase()};pb=null;
    var hit=b.key?real.filter(function(x){return x.ref&&x.ref.key&&lo(x.ref.key)===lo(b.key)})[0]:null;
    if(!hit)hit=real.filter(function(x){return lo(x.id)===lo(b.w)||lo(x.name)===lo(b.w)})[0];if(hit)choose(hit)}}).catch(function(e){if(my===seq){flying=null;st.textContent=(e.text||e.message)}})}
 // Find, Enter, or a short pause in typing (each new key starts the pause again)
 var tm=null,due=false;function soon(){if(tm)clearTimeout(tm);due=true;tm=setTimeout(function(){tm=null;if(due){due=false;run()}},350)}
 go.addEventListener('click',function(){if(tm){clearTimeout(tm);tm=null}run()});inp.addEventListener('input',soon);
 var kit=tkKit(inp,{key:'task.lookup.'+kind,
  index:function(s,done){if(last&&last.q===s){done(last.items,last.more);return}pend={q:s,done:done};if(!due&&flying!==s)soon()},
  browse:tkBrowse(kind,o),
  onPick:function(v,it,from){if(it&&it.x){choose(it.x);return}inp.value=v;pb=from==='browse'?{w:String(v).trim(),key:it&&it.view==='data'&&it.key?it.key:''}:null;if(tm){clearTimeout(tm);tm=null}run()}});
 // Enter here is Find, not the window's Next (an Enter the kit used for a row of its list is stopped by the kit)
 inp.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter'){e.preventDefault();if(e.stopPropagation)e.stopPropagation();if(tm){clearTimeout(tm);tm=null}run()}});
 host.appendChild(h('div',{class:'row'},[kit?kit.el:inp,go]));host.appendChild(st);host.appendChild(res);if(o.auto!==false)run();return {run:run,input:inp,kit:kit}}
// a lookup result: the name a player sees first (the server names an id-only result from the game texts), then the id and the place
// as smaller text; a result with no name shows its id alone
// a recipe's reason: its lang key when that has a row, else its words as given
function tkWords(w,p){var x=String(w==null?'':w),t=/^[a-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/.test(x)?tx(x,p||{}):x;return t}
function tkResParts(x){var id=String(x.id==null?'':x.id),nm=x.name!=null&&String(x.name)!==''&&String(x.name)!==id?String(x.name):'';
 var sec=[nm?id:'',x.where||'',x.sub&&x.sub!==id?String(x.sub):''].filter(Boolean).join('  ');
 return [h('b',{'data-task-rname':'1',text:nm||id}),sec?h('span',{class:'hint tk-rid','data-task-rid':'1',text:sec}):null]}
// picker.in / base.in: the answer of the question it names (else the word itself) goes to the lookup as in
function tkInOf(P){var k=P&&P['in'];if(!k)return '';var q=tkQ(k);if(!q)return String(k);var v=tkCurVal(q);return v==null?'':(typeof v==='object'?(v.id||''):String(v))}
function tkStepBase(b){var L=(TK.rec.base&&TK.rec.base.lookup)||'entity';tkHead(b,tkVk('task.base.ask'),tkVk('task.base.help'));var chosen=TK.d.base&&TK.d.base.id?TK.d.base:null;
 var now=h('div',{class:'tk-card','data-task-basenow':'1',text:chosen?tkVk('task.base.now',{x:chosen.name||chosen.id}):tkVk('task.base.none')});b.appendChild(now);
 tkSearch(b,L,{'in':tkInOf(TK.rec.base),filter:TK.rec.base&&TK.rec.base.filter},function(x){chosen={id:x.id,name:x.name||x.id,ref:x.ref||null};now.textContent=tkVk('task.base.now',{x:chosen.name});tkLookRef(x.ref,x.name)});
 TK.cur={value:function(){if(!chosen)return Promise.resolve({ok:false,why:tkVk('task.base.none')});var ch=!TK.d.base||TK.d.base.id!==chosen.id;TK.d.base=chosen;
  // the values route reads the saved draft: save the new base first, or it answers for the draft with no base (every field comes up empty)
  return ch?tkSave().then(tkValues).then(function(){return {ok:true}}):Promise.resolve({ok:true})}};
 tkNav(b)}
// Quick or Everything, right after What to copy (the head switch changes it too)
function tkStepMode(b){tkHead(b,tx('task.mode.ask'),tx('task.mode.help'));var pick=TK.d.mode==='all'?'all':'quick',box=h('div',{class:'tk-src',role:'radiogroup','aria-label':tx('task.mode.sw'),'data-task-modes':'1'});
 ['quick','all'].forEach(function(m){var r=h('input',{type:'radio',name:'tkmode',value:m,'data-task-mode':m});r.checked=m===pick;r.addEventListener('change',function(){pick=m});box.appendChild(h('label',{},[r,h('span',{text:' '+tkVk('task.mode.'+m)})]))});
 b.appendChild(box);
 TK.cur={value:function(){TK.d.mode=pick;return Promise.resolve({ok:true})}};
 tkNav(b)}
// a group Quick keeps as copied: what stays (each value as the copy has it) and Ask these
function tkStepGroup(b,s){tkHead(b,tkVk('task.g.folded',{g:tkGT(s.group),n:s.count}),tkVk('task.g.foldedHelp'));var rows=[];
 (s.qs||[]).forEach(function(id){var q=tkQ(id);if(!q)return;var v=TK.vals[q.id];rows.push([tx(q.ask),v==null||v===''?tkVk('task.a.asCopied'):tkShow(v)+(q.limits&&q.limits.unit?' '+tkUnit(q.limits.unit):'')])});
 b.appendChild(h('div',{'data-task-foldlist':s.group},[tkTable(rows)]));
 b.appendChild(h('div',{class:'row'},[h('button',{type:'button',class:'primary','data-task-askgroup':s.group,text:tx('task.g.askThese'),onclick:function(){tkAskGroup(s.group)}})]));
 tkNav(b)}
function tkCurVal(q){var a=TK.d.answers[q.id];if(a&&(a.src==='value'||a.src==='exist'))return a.value;return TK.vals[q.id]}
function tkStepQ(b,s){var q=tkQ(s.q),g=tkG(s.group);if(!q){tkNav(b);return}
 if(g)b.appendChild(h('div',{class:'tk-gt',text:tx(g.title)}));tkHead(b,tx(q.ask),q.help?tx(q.help):'');
 var base=TK.vals[q.id];if(base!=null&&base!=='')b.appendChild(h('div',{class:'hint','data-task-basev':'1',text:tkVs('task.q.base',{v:tkShow(base)+(q.limits&&q.limits.unit?' '+tkUnit(q.limits.unit):'')},tkSugg(q))}));
 var host=h('div',{class:'tk-ctl'});b.appendChild(host);var own=TK.kinds[q.kind];
 if(own){var stt={answer:TK.d.answers[q.id]||null,value:tkCurVal(q),base:base,draft:TK.d,recipe:TK.rec};own.draw(q,stt,host);TK.cur={value:function(){return Promise.resolve(own.value(q,stt))}};
  if(typeof own.leave==='function')TK.leave=function(){own.leave(q,stt,host)}}
 else if(q.kind==='list'&&q.picker)tkListPicker(host,q);
 else if(q.picker&&(q.kind==='thing'||q.kind==='file'||q.kind==='handoff'||q.picker.sources))tkPicker(host,q);
 else if(q.kind==='handoff')tkPicker(host,{id:q.id,kind:q.kind,ask:q.ask,picker:{sources:['ext']}});
 else tkKind(host,q);
 if(g&&!g.essential)b.appendChild(h('div',{class:'row'},[h('button',{type:'button','data-task-keepgroup':g.id,text:tkVk(s.kept?'task.g.ask':'task.g.keepAll'),onclick:function(){tkKeepGroup(g.id,!s.kept)}})]));
 tkNav(b,{noKeep:base==null&&!TK.d.base})}
// a refused form: what was typed, then the recipe's example of the form (limits.reHint) when it gives one
// a recipe's unit word in the page's language (task.u.<unit>, signs as _); a unit with no row shows as written
function tkUnit(u){if(!u)return '';var k='task.u.'+String(u).replace(/[^A-Za-z0-9]+/g,'_');var t=tx(k);return t===k?String(u):t}
// the allowed range with no placeholder: both ends, else up to the max (key.max), else from the min (key.min)
function tkRange(k,L){var p={min:L.min,max:L.max,unit:tkUnit(L.unit)};return tx(L.min!=null&&L.max!=null?k:L.max!=null?k+'.max':k+'.min',p)}
function tkReErr(L,v){return tx('task.err.re',{v:v})+(L&&L.reHint?' '+tx(L.reHint):'')}
// a suggested id from words: lowercase, every run of other signs one _, no _ at the ends, starts with a letter; '' when no Latin letter
function tkSlug(x){return String(x).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^[^a-z]+|_+$/g,'').slice(0,60)}
function tkShow(v){if(v===true)return tx('task.yes');if(v===false)return tx('task.no');if(Object.prototype.toString.call(v)==='[object Array]')return v.join(', ');if(v&&typeof v==='object')return v.name||v.id||JSON.stringify(v);return String(v)}
function tkKind(host,q){var L=q.limits||{},v=tkCurVal(q),k=q.kind,inp;
 if((v==null||v==='')&&q.suggest&&q.suggest.from&&(k==='text'||k==='id')){var sv=tkCurVal({id:q.suggest.from});if(sv!=null&&sv!=='')v=q.suggest.slug?tkSlug(sv):String(sv)}
 function ok(val){return Promise.resolve({ok:true,answer:{src:'value',value:val}})}
 function no(m,lim){return Promise.resolve({ok:false,why:m,limit:lim})}
 if(k==='choice'||k==='yesno'){var vals=k==='yesno'?[true,false]:(L.values||[]),pick=(v==null||v==='')&&k==='choice'&&L.values&&L.values.length?L.values[0]:v,box=h('div',{class:'tk-src',role:'radiogroup'});
  vals.forEach(function(x){var r=h('input',{type:'radio',name:'tkq',value:String(x)});r.checked=x===pick;r.addEventListener('change',function(){pick=x;tkUnrefuse()});
   box.appendChild(h('label',{},[r,h('span',{text:' '+(k==='yesno'?tx(x?'task.yes':'task.no'):tx('task.'+TK.rec.id+'.v.'+q.id+'.'+x))})]))});host.appendChild(box);
  TK.cur={value:function(){if(pick===undefined||pick===null||pick==='')return no(tx('task.err.pick'));return ok(pick)}};return}
 if(k==='list'){inp=h('textarea',{rows:6,'aria-label':tx(q.ask),'data-task-input':'1'});inp.value=Object.prototype.toString.call(v)==='[object Array]'?v.join('\n'):(v==null?'':String(v));host.appendChild(h('div',{class:'hint',text:tx('task.q.listHint')}));host.appendChild(inp);
  TK.cur={value:function(){var a=String(inp.value||'').split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean);if(L.re){var re=new RegExp(L.re);for(var i=0;i<a.length;i++)if(!re.test(a[i]))return no(tkReErr(L,a[i]),L.limit)}return ok(a)}};return}
 inp=h('input',{type:k==='number'?'number':'text',autocomplete:'off','aria-label':tx(q.ask),'data-task-input':'1'});if(v!=null)inp.value=String(v);
 if(k==='number'){if(L.min!=null)inp.setAttribute('min',String(L.min));if(L.max!=null)inp.setAttribute('max',String(L.max));if(L.step!=null)inp.setAttribute('step',String(L.step))}
 host.appendChild(h('div',{class:'row'},[inp,L.unit?h('span',{text:tkUnit(L.unit)}):null]));
 if(k==='number'&&(L.min!=null||L.max!=null))host.appendChild(h('div',{class:'hint',text:tkRange('task.q.range',L)}));
 // limits.usual [lo, hi]: what the game's own data uses; outside it a plain warning under the field, never a refusal
 if(k==='number'&&L.usual&&L.usual.length===2){var uw=h('div',{class:'hint tk-warn','data-task-usual':'1'});host.appendChild(uw);
  var us=function(){var n=Number(String(inp.value).trim().replace(',','.'));var out=String(inp.value).trim()!==''&&isFinite(n)&&(n<L.usual[0]||n>L.usual[1]);uw.textContent=out?tx('task.q.usual',{lo:L.usual[0],hi:L.usual[1],unit:tkUnit(L.unit)}):'';uw.hidden=!out};
  inp.addEventListener('input',us);us()}
 setTimeout(function(){try{inp.focus()}catch(e){}},0);
 // Enter in the box is Next (the window's own key handler is not asked again); typing clears a refusal
 inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.altKey){e.preventDefault();e.stopPropagation&&e.stopPropagation();tkNext()}});
 inp.addEventListener('input',tkUnrefuse);
 TK.cur={value:function(){var s=String(inp.value==null?'':inp.value).trim();
  if(k==='number'){if(s===''||isNaN(Number(s)))return no(tx('task.err.num'),L.limit);var n=Number(s);
   if((L.min!=null&&n<L.min)||(L.max!=null&&n>L.max))return no(tkRange('task.err.range',L),L.limit);
   if(L.step&&Math.abs(n/L.step-Math.round(n/L.step))>1e-9)return no(tx('task.err.step',{s:L.step}),L.limit);return ok(n)}
  if(!s){if(q.optional)return ok('');return no(tx('task.err.empty'))}
  if(k==='id'){if(!/^[\x21-\x7e]+$/.test(s))return no(tx('task.err.ascii')+(L.reHint?' '+tx(L.reHint):''),L.limit);var re=new RegExp(L.re||'^[a-z][a-z0-9_]*$');if(!re.test(s))return no(tx('task.err.idForm')+(L.reHint?' '+tx(L.reHint):''),L.limit);
   if(q.unique&&q.unique.lookup){var inv=q.unique['in']?tkCurVal({id:q.unique['in']}):'';
    return api('/api/x/task/lookup?'+tkQs({kind:q.unique.lookup,q:s,'in':inv||'',mod:TK.d.mod||S.mod,recipe:TK.rec.id,limit:1})).then(function(r){var mine=TK.d.verb==='change'&&((TK.vals[q.id]!=null&&s===String(TK.vals[q.id]))||(TK.d.base&&s===String(TK.d.base.id)));return r.exact&&!mine?{ok:false,why:tx('task.err.taken',{v:s})}:{ok:true,answer:{src:'value',value:s}}})}
   return ok(s)}
  if(L.values&&L.values.indexOf(s)<0)return no(tx('task.err.values',{v:L.values.join(', ')}),L.limit);
  if(L.re&&!new RegExp(L.re).test(s))return no(tkReErr(L,s),L.limit);return ok(s)}}}
// ---------- the picker: keep | exist | branch | file | ext
function tkPicker(host,q){var P=q.picker||{},src=P.sources||['keep'],a=TK.d.answers[q.id]||null,mode=a&&src.indexOf(a.src)>=0?a.src:(src.indexOf('keep')>=0?'keep':src[0]),hold={exist:a&&a.src==='exist'?{id:a.value,name:a.name,ref:a.ref}:null,file:a&&a.src==='file'?a:null,ext:a&&a.src==='ext'&&a.value?String(a.value):''};
 var pane=h('div',{class:'tk-card','data-task-pane':'1'}),box=h('div',{class:'tk-src',role:'radiogroup','aria-label':tx('task.pk.how')});
 if(q.kind==='handoff'&&mode==='keep'&&src.indexOf('ext')>=0)mode='ext';
 src.forEach(function(x){if(x==='file'&&RMT)return;var r=h('input',{type:'radio',name:'tksrc',value:x,'data-task-src':x});r.checked=x===mode;r.addEventListener('change',function(){mode=x;tkUnrefuse();draw()});
  box.appendChild(h('label',{},[r,h('span',{text:' '+tkVk('task.pk.'+x,{v:TK.vals[q.id]==null?tx('task.pk.unset'):tkShow(TK.vals[q.id])})})]))});
 host.appendChild(box);host.appendChild(pane);
 function draw(){pane.textContent='';
  if(mode==='keep')pane.appendChild(h('div',{text:tkVk('task.pk.keepNow',{v:tkShow(TK.vals[q.id]==null?tkVk('task.a.asCopied'):TK.vals[q.id])})}));
  else if(mode==='exist'){if(hold.exist)pane.appendChild(h('div',{'data-task-picked':'1',text:tx('task.pk.picked',{x:hold.exist.name||hold.exist.id})}));
   tkSearch(pane,P.lookup||'file',{ext:(P.ext||[]).join(','),'in':tkInOf(P),filter:P.filter},function(x){hold.exist=x;tkLookRef(x.ref,x.name)})}
  else if(mode==='branch'){var ids=tkBids(P),ch=a&&a.src==='branch'&&a.child?a.child:'',chr=a&&a.src==='branch'?(a.recipe||(ids.length===1?ids[0]:'')):'';
   if(hold.kind==null)hold.kind=chr||(ids.length===1?ids[0]:'');
   // picker.branch names several recipes: "what kind" first (the recipe titles), then Start
   if(ids.length>1){var kb=h('div',{class:'tk-src',role:'radiogroup','aria-label':tx('task.pk.kind'),'data-task-kinds':'1'});
    ids.forEach(function(id){var r=h('input',{type:'radio',name:'tkkind',value:id,'data-task-kind':id});r.checked=id===hold.kind;r.addEventListener('change',function(){hold.kind=id;draw()});kb.appendChild(h('label',{},[r,h('span',{text:' '+tkRecT(id)})]))});
    pane.appendChild(h('div',{class:'hint',text:tx('task.pk.kind')}));pane.appendChild(kb)}
   var same=!!(ch&&hold.kind&&hold.kind===chr);
   pane.appendChild(h('div',{text:tx(same?'task.pk.branchHas':'task.pk.branchHint',{r:hold.kind?tkRecT(hold.kind):tx('task.pk.kindNone')})}));
   pane.appendChild(h('button',{type:'button','data-task-branch':'1',text:tx(same?'task.pk.branchOpen':'task.pk.branchGo'),onclick:function(){if(!hold.kind){tkRefuse(tx('task.pk.kindFirst'));return}tkBranch(q,same?ch:'',null,null,hold.kind)}}))}
  else if(mode==='file')tkFilePane(pane,q,hold);
  else if(mode==='ext')tkHandoff(pane,q,function(){mode='file';var rs=box.querySelectorAll('input');for(var i=0;i<rs.length;i++)rs[i].checked=rs[i].value==='file';draw()},hold)}
 draw();
 TK.cur={value:function(){
  if(mode==='keep')return Promise.resolve({ok:true,answer:{src:'keep'}});
  if(mode==='exist'){if(!hold.exist)return Promise.resolve({ok:false,why:tx('task.err.pick')});return Promise.resolve({ok:true,answer:{src:'exist',value:hold.exist.id,name:hold.exist.name||'',ref:hold.exist.ref||null}})}
  if(mode==='file'){if(!hold.file||!hold.file.staged||!hold.file.staged.length)return Promise.resolve({ok:false,why:tx('task.up.none')});return Promise.resolve({ok:true,answer:hold.file})}
  if(mode==='branch'){var c=TK.d.answers[q.id];if(!c||c.src!=='branch'||!c.child)return Promise.resolve({ok:false,why:tx('task.pk.branchFirst')});return Promise.resolve({ok:true,answer:c})}
  if(mode==='ext'&&hold.ext)return Promise.resolve({ok:true,answer:{src:'ext',value:hold.ext}});
  return Promise.resolve({ok:false,why:tx('task.ho.notYet')})}}}
// a list question with a picker: one answer per line, each line with its own source (keep, value, exist, branch, file); add and
// remove lines. A branch line opens a child task that knows its line (draft parent.line). Saved as {src: 'list', items: [...]}
function tkListPicker(host,q){var P=q.picker||{},src=(P.sources||['value']).filter(function(x){return x!=='ext'&&!(x==='file'&&RMT)}),a=TK.d.answers[q.id];
 // a line offers only the sources the recipe names (no typed line unless picker.sources says 'value')
 if(!src.length)src=['keep'];
 var items=a&&a.src==='list'&&a.items?a.items.slice():[],box=h('div',{'data-task-lines':'1'});
 if(!items.length){var bv=TK.vals[q.id];if(src.indexOf('keep')>=0&&Object.prototype.toString.call(bv)==='[object Array]')bv.forEach(function(x){items.push({src:'keep'})})}
 host.appendChild(h('div',{class:'hint',text:tx('task.q.lines')}));host.appendChild(box);
 var add=h('button',{type:'button','data-task-addline':'1',text:tx('task.q.addLine'),onclick:function(){items.push({src:src[0]==='keep'&&src.length>1?src[1]:src[0]});keep();draw()}});
 host.appendChild(h('div',{class:'row'},[add]));
 function keep(){TK.d.answers[q.id]={src:'list',items:items.slice()}}
 function draw(){box.textContent='';items.forEach(function(it,i){box.appendChild(line(it,i))})}
 function line(it,i){var row=h('div',{class:'tk-line','data-task-line':String(i)}),lp=h('div',{class:'tk-lpane'});
  var sel=h('select',{'aria-label':tx('task.q.lineHow',{n:i+1}),'data-task-linesrc':String(i)},src.map(function(x){return h('option',{value:x,text:tkVk('task.pk.'+x,{v:tkLineBase(i)==null?tx('task.pk.unset'):tkShow(tkLineBase(i))})})}));sel.value=it.src;
  sel.addEventListener('change',function(){items[i]={src:sel.value};keep();tkUnrefuse();draw()});
  row.appendChild(h('span',{text:tx('task.q.line',{n:i+1})}));row.appendChild(sel);
  row.appendChild(h('button',{type:'button','data-task-rmline':String(i),text:tx('task.q.removeLine'),onclick:function(){items.splice(i,1);keep();draw()}}));
  row.appendChild(lp);
  if(it.src==='keep')lp.appendChild(h('span',{class:'hint',text:tkVk('task.pk.keepNow',{v:tkShow(tkLineBase(i)==null?tkVk('task.a.asCopied'):tkLineBase(i))})}));
  else if(it.src==='value'){var vi=h('input',{type:'text',autocomplete:'off','aria-label':tx('task.q.line',{n:i+1}),'data-task-lineval':String(i)});if(it.value!=null)vi.value=String(it.value);
   vi.addEventListener('input',function(){items[i]={src:'value',value:vi.value};keep()});lp.appendChild(vi)}
  else if(it.src==='exist'){if(it.value)lp.appendChild(h('div',{text:tx('task.pk.picked',{x:it.name||it.value})}));
   tkSearch(lp,P.lookup||'file',{ext:(P.ext||[]).join(','),'in':tkInOf(P),filter:P.filter,auto:false},function(x){items[i]={src:'exist',value:x.id,name:x.name||'',ref:x.ref||null};keep();tkLookRef(x.ref,x.name)})}
  else if(it.src==='branch'){var ids=tkBids(P),ch=it.child||'';
   // several recipes: the line keeps its kind ({src: 'branch', recipe}) until its task is opened; a new kind drops the old child
   if(ids.length>1){var ks=h('select',{'aria-label':tx('task.pk.kind'),'data-task-linekind':String(i)},[h('option',{value:'',text:tx('task.pk.kindNone')})].concat(ids.map(function(id){return h('option',{value:id,text:tkRecT(id)})})));ks.value=it.recipe||'';
    ks.addEventListener('change',function(){items[i]=ks.value?{src:'branch',recipe:ks.value}:{src:'branch'};keep();draw()});lp.appendChild(ks)}
   lp.appendChild(h('button',{type:'button','data-task-linebranch':String(i),text:tx(ch?'task.pk.branchOpen':'task.pk.branchGo'),onclick:function(){var k=(items[i]&&items[i].recipe)||(ids.length===1?ids[0]:'');if(!k){tkRefuse(tx('task.pk.kindFirst'));return}keep();tkBranch(q,ch,i,null,k)}}))}
  else if(it.src==='file'){var hd={file:it.staged?it:null};tkFilePane(lp,q,hd,'line'+(i+1)+'/',function(fl){items[i]=fl||{src:'file',staged:[]};keep()})}
  return row}
 draw();
 TK.cur={value:function(){var L=q.limits||{};
  for(var i=0;i<items.length;i++){var it=items[i];
   if(!it)return Promise.resolve({ok:false,why:tx('task.q.lineEmpty',{n:i+1})});
   if(src.indexOf(it.src)<0)return Promise.resolve({ok:false,why:tx('task.q.lineHowBad',{n:i+1})});
   if(it.src==='value'){var v=String(it.value==null?'':it.value).trim();if(!v)return Promise.resolve({ok:false,why:tx('task.q.lineEmpty',{n:i+1})});if(L.re&&!new RegExp(L.re).test(v))return Promise.resolve({ok:false,why:tkReErr(L,v),limit:L.limit});items[i]={src:'value',value:v}}
   if(it.src==='exist'&&!it.value)return Promise.resolve({ok:false,why:tx('task.q.lineEmpty',{n:i+1})});
   if(it.src==='branch'&&!it.child)return Promise.resolve({ok:false,why:tx('task.pk.branchFirst')});
   if(it.src==='file'&&(!it.staged||!it.staged.length))return Promise.resolve({ok:false,why:tx('task.up.none')})}
  if(!items.length&&!q.optional)return Promise.resolve({ok:false,why:tx('task.err.empty')});
  return Promise.resolve({ok:true,answer:{src:'list',items:items.slice()}})}}}
function tkLineBase(i){var s=TK.st[TK.at],v=s?TK.vals[s.q]:null;return Object.prototype.toString.call(v)==='[object Array]'?v[i]:null}
// one file, or (the question says multi) several files or a whole folder; a kind '.vol' takes that extension by name.
// prefix: a folder inside staging for this answer (a list line puts its file under line<n>/)
function tkAccept(kinds){var acc={sound:'.wav,.ogg',texture:'.dds,.tga,.png,.jpg,.bmp',picture:'.dds,.tga,.png,.jpg,.bmp,.psd,.gif',model:'.ply,.anm,.vol,.mdl',text:'.txt,.lng,.xml,.set,.def',video:'.avi',font:'.fnt'};
 return kinds.map(function(k){return k.charAt(0)==='.'?k:(acc[k]||'')}).filter(Boolean).join(',')||null}
function tkKindName(k){return k.charAt(0)==='.'?k:tx('task.fk.'+k)}
function tkFilePane(pane,q,hold,prefix,onDone){var P=q.picker||{},kinds=P.kinds||['any'],multi=!!q.multi&&!prefix;
 if(RMT){pane.appendChild(h('div',{class:'hint',text:tx('task.up.remote')}));return}
 var inp=h('input',{type:'file','aria-label':tx(multi?'task.up.multi':'task.up.pick'),accept:tkAccept(kinds),'data-task-file':'1'});if(multi)inp.multiple=true;
 var dir=null;if(multi){dir=h('input',{type:'file','aria-label':tx('task.up.folder'),'data-task-folder':'1'});dir.setAttribute('webkitdirectory','');dir.setAttribute('directory','');dir.multiple=true}
 var out=h('div',{'data-task-upres':'1'});
 function send(list){var fs=[],i;for(i=0;i<list.length;i++)fs.push(list[i]);if(!fs.length)return;out.textContent='';var got=[],bad=0,k=0;
  var st=h('div',{class:'hint'});out.appendChild(st);
  function one(){if(k>=fs.length){st.textContent=tx('task.up.sent',{n:got.length,m:bad});hold.file=got.length?{src:'file',staged:got,type:fs.length===1?lastType:'many'}:null;if(bad&&hold.file)hold.file.bad=true;if(onDone)onDone(hold.file);return}
   var f=fs[k++],nm=(prefix||'')+((multi&&f.webkitRelativePath)||f.name);st.textContent=tx('task.up.sending',{n:nm});
   tkUpload(f,q,function(r){if(fs.length===1||!r.ok||k<=20)tkUpCard(out,r);if(r.ok){got.push(r.name);lastType=r.type}else bad++;one()},nm)}
  var lastType='';one()}
 inp.addEventListener('change',function(){send(inp.files||[])});if(dir)dir.addEventListener('change',function(){send(dir.files||[])});
 pane.appendChild(h('div',{class:'hint',text:tx('task.up.kinds',{k:kinds.map(tkKindName).join(', ')})}));
 if(multi){pane.appendChild(h('div',{class:'row'},[h('span',{text:tx('task.up.multi')}),inp]));pane.appendChild(h('div',{class:'row'},[h('span',{text:tx('task.up.folder')}),dir]))}else pane.appendChild(inp);
 pane.appendChild(out);
 if(hold.file&&hold.file.staged)out.appendChild(h('div',{text:tx('task.up.have',{n:hold.file.staged.slice(0,20).join(', ')+(hold.file.staged.length>20?' ...':'')})}))}
function tkUpCard(out,r){var rows=[[tx('task.up.name'),r.name],[tx('task.up.type'),r.type],[tx('task.up.size'),String(r.size)]];var f=r.facts||{};
 // each fact the reader gives, named in the page's language (task.up.f.<key>); a fact with no row is left out
 Object.keys(f).forEach(function(k){var v=f[k],lk='task.up.f.'+k,t=tx(lk);if(v==null||typeof v==='object'||t===lk)return;var vk='task.up.v.'+String(v).replace(/[^A-Za-z0-9]+/g,'_'),vt=tx(vk);rows.push([t,v===true?tx('task.yes'):v===false?tx('task.no'):vt!==vk?vt:String(v)])});
 out.appendChild(h('div',{class:'tk-card'},[h('b',{text:r.ok?tx('task.up.ok'):tx('task.up.bad')}),r.why?h('div',{class:'tk-refuse','data-task-upwhy':'1',text:tkUpWhy(r)}):null,tkTable(rows)]))}
// a refusal in the page's language: whyKey with params; d is a key (what to do), t a type name (task.up.t.<type>, else the type in capitals)
function tkUpWhy(r){if(!r.whyKey)return r.why;var p={},w=r.whyParams||{};for(var k in w)p[k]=w[k];if(p.d)p.d=tx(String(p.d));
 if(p.t){var tk='task.up.t.'+p.t,tt=tx(tk);p.t=tt===tk?String(p.t).toUpperCase():tt}var o=tx(r.whyKey,p);return o===r.whyKey&&r.why?r.why:o}
function tkUpload(file,q,done,name){if(RMT){toast(tx('task.up.remote'));return}if(file.size>64*1048576){tkRefuse(tx('task.up.big'));return}
 var rd=new FileReader();rd.onload=function(){var u8=new Uint8Array(rd.result),C=3145728,off=0;
  function b64(a){var s='',n=8192;for(var i=0;i<a.length;i+=n)s+=String.fromCharCode.apply(null,a.subarray(i,i+n));return btoa(s)}
  function step(){var part=u8.subarray(off,Math.min(u8.length,off+C)),last=off+part.length>=u8.length;
   api('/api/x/task/upload',{draft:TK.d.id,q:q.id,name:name||file.name,off:off,b64:b64(part),last:last}).then(function(r){off+=part.length;if(!last)return step();done(r)}).catch(tkErr)}
  step()};rd.onerror=function(){tkRefuse(tx('task.up.read'))};rd.readAsArrayBuffer(file)}
// the hand-off card: the programs of external.js for this question (picker.ext ids, else the programs for picker.kinds), found or not
// on this PC, the numbered steps, Open it (plan, the confirm box, then open with the plan's token), the folder with my files, and
// "I am done" (the upload source checks the file; a program that saves into the mod answers ext). hold: the picker's held answers.
function tkHandoff(pane,q,toFile,hold){var P=q.picker||{},ids=P.ext||[],kinds=P.kinds||[],hasFile=(P.sources||[]).indexOf('file')>=0&&!RMT;
 pane.appendChild(h('b',{text:tx('task.ho.title')}));var box=h('div',{'data-task-ho':'1'});pane.appendChild(box);
 box.appendChild(h('div',{class:'hint',text:tx('task.ho.loading')}));
 function doneB(){return hasFile?h('button',{type:'button','data-task-hodone':'1',text:tx('task.ho.done'),onclick:toFile}):null}
 function generic(msg){box.textContent='';box.appendChild(h('div',{class:'hint',text:msg}));['task.ho.s1','task.ho.s2','task.ho.s3'].forEach(function(k,i){box.appendChild(h('div',{text:(i+1)+'. '+tx(k)}))});var b=doneB();if(b)box.appendChild(h('div',{class:'row'},[b]))}
 api('/api/x/task/external?'+tkQs({ids:ids.join(','),'for':ids.length?'':kinds.join(','),game:GID})).then(function(r){var ps=(r&&r.programs)||[];if(!ps.length){generic(tx('task.ho.noneFor'));return}
  box.textContent='';var cur=ps[0];ps.forEach(function(p){if(hold.ext&&p.id===hold.ext)cur=p});var card=h('div',{'data-task-hocard':'1'});
  if(ps.length>1){var pick=h('div',{class:'tk-src',role:'radiogroup','aria-label':tx('task.ho.pick')});
   ps.forEach(function(p){var rb=h('input',{type:'radio',name:'tkho',value:p.id,'data-task-prog':p.id});rb.checked=p===cur;rb.addEventListener('change',function(){cur=p;draw()});
    pick.appendChild(h('label',{},[rb,h('span',{text:' '+p.name+'  ('+tx(p.found?'task.ho.foundShort':'task.ho.missing')+')'})]))});
   box.appendChild(h('div',{class:'hint',text:tx('task.ho.pick')}));box.appendChild(pick)}
  box.appendChild(card);
  function draw(){var p=cur;card.textContent='';
   card.appendChild(h('div',{},[h('b',{'data-task-progname':'1',text:p.name}),h('span',{class:'hint',text:'  '+tx(p.what)})]));
   if(p.found)card.appendChild(h('div',{'data-task-found':'1',text:p.path?tx('task.ho.found',{p:p.path}):tx('task.ho.foundDefault')}));
   // a program ARSENAL never looks for (open none): no red "not on this PC", one plain line and the Guides and tools link
   else if(p.open==='none')card.appendChild(h('div',{class:'row'},[h('span',{class:'hint','data-task-found':'none',text:tx('task.ho.none')}),h('button',{type:'button',class:'linkb','data-task-guides':'1',text:tx('task.ho.guides'),onclick:tkGuides})]));
   else{card.appendChild(h('div',{class:'tk-refuse','data-task-found':'0',text:tx('task.ho.missing')}));
    card.appendChild(h('div',{class:'row'},[h('span',{class:'hint',text:tx('task.ho.where',{w:p.guide||p.name})}),h('button',{type:'button',class:'linkb','data-task-guides':'1',text:tx('task.ho.guides'),onclick:tkGuides})]))}
   if(p.open==='game')card.appendChild(h('div',{class:'hint',text:tx('task.ho.game')}));else if(p.open==='cli')card.appendChild(h('div',{class:'hint',text:tx('task.ho.cli')}));
   card.appendChild(h('div',{class:'tk-gt',text:tx('task.ho.steps')}));
   (p.steps||[]).forEach(function(k,i){card.appendChild(h('div',{'data-task-hostep':String(i+1),text:(i+1)+'. '+tx(k,{exe:p.exe||p.name})}))});
   // the file: where to save it (picker.target, in the picked mod) and what to bring back (the picker's kinds)
   var tgt=P.target&&TK.d.mod?TK.d.mod+'\\'+String(P.target).replace(/\//g,'\\'):'';if(tgt)card.appendChild(h('div',{'data-task-hosave':'1',text:tx('task.ho.saveAs',{f:tgt})}));
   var acc=tkAccept(kinds.length?kinds:p.back.kinds||[]);if(acc&&!p.back.inMod&&(p.back.kinds||[]).length)card.appendChild(h('div',{'data-task-hobring':'1',text:tx('task.ho.bring',{e:acc.split(',').join(' ')})}));
   card.appendChild(h('div',{class:'hint',text:tx('task.ho.back',{k:String(tx(p.back.say)).replace(/[.。]\s*$/,'')})}));
   // a program that saves straight into the mod says so plainly: ARSENAL keeps a copy before it opens, I am done makes the restore points
   if(p.back.inMod)card.appendChild(h('div',{class:'tk-card tk-warn','data-task-inmod':'1',text:tx('task.ho.inMod',{n:p.name})}));
   if(RMT){card.appendChild(h('div',{class:'hint',text:tx('task.ho.remote')}));return}
   var staged=hold.file&&hold.file.staged&&hold.file.staged[0],row=h('div',{class:'row tk-nav'});
   if(p.can.file&&staged)row.appendChild(h('button',{type:'button','data-task-hoopen':'file',text:tx('task.ho.openFile'),onclick:function(){tkHoOpen(p,'file',{staged:staged})}}));
   if(p.can.start)row.appendChild(h('button',{type:'button',class:'primary','data-task-hoopen':'start',text:tx('task.ho.open'),onclick:function(){tkHoOpen(p,'start',{})}}));
   if(p.open==='game'&&p.can.reveal)row.appendChild(h('button',{type:'button','data-task-horeveal':'1',text:tx('task.ho.reveal'),onclick:function(){tkHoOpen(p,'reveal',{})}}));
   row.appendChild(h('button',{type:'button','data-task-hofolder':'1',text:tx('task.ho.folder'),onclick:function(){tkHoOpen(p,'folder',{})}}));
   var b=doneB();if(b)row.appendChild(b);
   // I am done (a program with nothing to bring: I have looked): the copy kept before it opened gives each changed file a restore point
   if(p.back.inMod)row.appendChild(h('button',{type:'button','data-task-hosaved':'1',text:tx((p.back.kinds||[]).length?'task.ho.doneMod':'task.ho.looked'),onclick:function(){hold.ext=p.id;tkHoBack().then(function(){tkNext()})}}));
   card.appendChild(row)}
  draw()}).catch(function(e){generic(tx('task.ho.loadErr',{m:(e&&(e.text||e.message))||''}))})}
// open: start and file ask first (the plan gives a one time token the real call needs); folder and reveal only show a folder
function tkHoOpen(p,action,extra){if(RMT){toast(tx('task.ho.remote'));return}var body={draft:TK.d.id,id:p.id,action:action};Object.keys(extra||{}).forEach(function(k){body[k]=extra[k]});
 if(action==='folder'||action==='reveal'){tkSave().then(function(){return api('/api/x/task/external/open',body)}).then(function(r){toast(tx('task.ho.folderOpened',{p:r.target||''})+(r.guard?'  '+tx('task.ho.guardOn'):''))}).catch(tkErr);return}
 body.plan=true;tkSave().then(function(){return api('/api/x/task/external/open',body)}).then(function(pl){
  return askDo({title:tx('task.ho.ask',{n:p.name}),lines:[tx('task.ho.askProg',{p:pl.program||p.name}),pl.target?tx('task.ho.askFile',{f:pl.target}):'',pl.inMod?tx('task.ho.askInMod',{n:p.name}):tx('task.ho.askLine')],ok:tx('task.ho.open')}).then(function(y){if(!y)return;
   var real={};Object.keys(body).forEach(function(k){real[k]=body[k]});real.plan=false;real.token=pl.token;
   return api('/api/x/task/external/open',real).then(function(r){toast(tx('task.ho.opened',{n:p.name})+(r&&r.guard?'  '+tx('task.ho.guardOn'):''))})})}).catch(tkErr)}
// close the copy an in-mod program's open kept: a restore point per file it changed (a toast says how many); never blocks Next
function tkHoBack(){if(RMT||!TK.d)return Promise.resolve(null);return api('/api/x/task/external/back',{draft:TK.d.id}).then(function(r){if(r&&r.closed)toast(tx('task.ho.guarded',{n:(r.restore||[]).length}));return r}).catch(function(e){tkErr(e);return null})}
// the Guides & External Tools page lists where each program comes from (no download by the GUI); the task is saved and closed first
function tkGuides(){TASK.close().then(function(){if(typeof as2Link!=='function'||!as2Link('page:guides/tools'))toast(tx('task.ho.noGuides'))})}
// a branch: a child draft of another recipe; the window keeps a stack and comes back to the parent question
// line: the list line this branch answers (the list answer is kept in the draft first); pass: what the page passes to the child;
// recipe: the kind picked when picker.branch names several (else its one id). The answer keeps it: {src: 'branch', child, recipe}
function tkBids(P){var b=P&&P.branch;if(Object.prototype.toString.call(b)==='[object Array]')return b.filter(function(x){return typeof x==='string'&&x});return typeof b==='string'&&b?[b]:[]}
function tkRecT(id){var r=tkCat(id);return r?tx(tkTk(r,'make')):String(id||'')}
function tkBranch(q,childId,line,pass,recipe){var P=q.picker||{},isLine=typeof line==='number';if(RMT){toast(tx('task.why.remote'));return}
 var body={parent:TK.d.id,q:q.id,recipe:recipe||tkBids(P)[0]};if(isLine)body.line=line;if(pass)body.pass=pass;
 tkSave().then(function(){return childId?api('/api/x/task/draft?'+tkQs({id:childId})).then(function(r){return r.draft}):api('/api/x/task/draft/child',body).then(function(r){return r.draft})})
  .then(function(c){var ans={src:'branch',child:c.id,recipe:c.recipe};if(isLine){var a=TK.d.answers[q.id];if(!a||a.src!=='list')a=TK.d.answers[q.id]={src:'list',items:[]};a.items[line]=ans}else TK.d.answers[q.id]=ans;
   return tkSave().then(function(){TK.stack.push({d:TK.d,rec:TK.rec,vals:TK.vals,q:q.id,line:isLine?line:null});return tkEnter(c)})}).catch(tkErr)}
function tkStepBack(b){var top=TK.stack[TK.stack.length-1];tkHead(b,tx('task.back.ask'),tx('task.back.help'));
 var go=function(){TK.d.state='done';tkSave().then(function(){var p=TK.stack.pop();if(!p){TASK.close();return}
  var ba={src:'branch',child:TK.d.id,recipe:TK.d.recipe};if(typeof p.line==='number'){var la=p.d.answers[p.q];if(!la||la.src!=='list')la=p.d.answers[p.q]={src:'list',items:[]};la.items[p.line]=ba}else p.d.answers[p.q]=ba;TK.d=p.d;TK.rec=p.rec;TK.vals=p.vals;tkSteps();TK.at=Math.max(0,tkIdx('q:'+p.q));tkDraw();tkSave()})};
 b.appendChild(h('div',{class:'row'},[h('button',{type:'button',class:'primary','data-task-return':'1',text:tx('task.back.go',{x:top?tkName(top.rec,top.d):''}),onclick:go})]));
 tkNav(b,{noNext:true})}
function tkStepReview(b){tkHead(b,tx('task.rev.ask'),tx(TK.d.parent?'task.rev.helpBranch':'task.rev.help'));var rows=[];
 if(TK.d.mod)rows.push([tx('task.s.mod'),TK.d.mod]);if(TK.d.base&&TK.d.base.id)rows.push([tkVk('task.s.base'),TK.d.base.name||TK.d.base.id]);
 TK.st.forEach(function(s){if(s.kind!=='q')return;var q=tkQ(s.q);rows.push([q?tx(q.ask):s.q,tkAns(q,TK.d.answers[s.q])])});
 b.appendChild(tkTable(rows));
 // per kept group, how many values stay as copied: the groups Quick folds, and groups kept whole in Everything
 var kg=[],kn={};TK.st.forEach(function(s){var n=s.kind==='group'?(s.count||0):(s.kind==='q'&&s.kept?1:0);if(!n)return;if(kn[s.group]==null){kn[s.group]=0;kg.push(s.group)}kn[s.group]+=n});
 if(kg.length){var kb=h('div',{class:'tk-card','data-task-keptsum':'1'},[h('b',{text:tkVk('task.rev.keptT')})]);
  kg.forEach(function(g){kb.appendChild(h('div',{'data-task-keptg':g,text:tkVk('task.rev.kept',{g:tkGT(g),n:kn[g]})}))});b.appendChild(kb)}var files=h('div',{'data-task-plan':'1'});b.appendChild(files);
 if(!TK.d.parent&&!RMT){files.textContent=tx('task.rev.planning');api('/api/x/task/plan',{draft:TK.d.id},tkJob()).then(function(p){TK.plan=p;files.textContent='';tkPlanBox(files,p);if(TK.win)tkSofar()}).catch(function(e){if(e&&e.cancelled){tkStopLine(files,'task.stop.plan');return}files.textContent='';files.appendChild(h('div',{class:'tk-refuse',text:e.text||e.message}))})}
 tkNav(b)}
// the kind of a branch answer, named when the question's picker.branch has several recipes
function tkKindOf(q,a){return q&&tkBids(q.picker).length>1&&a&&a.recipe?tkRecT(a.recipe):''}
function tkAns(q,a){if(a&&a.src==='list'&&a.items){var ks=[];a.items.forEach(function(it){var k=it&&it.src==='branch'?tkKindOf(q,it):'';if(k)ks.push(k)});return tx('task.a.list',{n:a.items.length})+(ks.length?' ('+ks.join(', ')+')':'')}
 if(!a||a.src==='keep')return tkVk('task.a.asCopied')+(q&&TK.vals[q.id]!=null?' ('+tkShow(TK.vals[q.id])+')':'');
 if(a.src==='value')return tkShow(a.value);if(a.src==='exist')return (a.name||a.value)+(a.name&&a.name!==a.value?' ('+a.value+')':'');
 if(a.src==='branch'){var bk=tkKindOf(q,a);return bk?tx('task.a.branchKind',{r:bk}):tx('task.a.branch')}if(a.src==='file')return tx('task.a.file',{n:(a.staged||[]).join(', ')});return tx('task.a.ext')}
function tkPlanBox(el,p){el.appendChild(h('b',{text:tx('task.rev.files',{n:(p.files||[]).length,m:p.mod||''})}));
 // new: nowhere yet; copy: the mod gets its own changed copy of a game file; change: a file the mod has already
 el.appendChild(tkTable((p.files||[]).slice(0,200).map(function(f){return [tx(f.action==='new'?'task.rev.new':f.action==='copy'?'task.rev.copy':'task.rev.change'),f.rel]})));
 // the tools' own words stay as they are (codes go in the tooltip); the notes are summed up in one plain line, the details behind a button
 (p.errors||[]).forEach(function(e){el.appendChild(h('div',{class:'tk-refuse','data-task-err':e.code||'1',title:e.code||null,text:String(e.msg||e)}))});
 (p.warnings||[]).slice(0,20).forEach(function(e){el.appendChild(h('div',{class:'hint',title:e.code||null,text:String(e.msg||e)}))});
 var ns=p.notes||[];if(ns.length){var det=h('div',{class:'tk-card','data-task-notes':'1'});det.hidden=true;ns.forEach(function(n){det.appendChild(h('div',{class:'hint',text:String(n)}))});
  el.appendChild(h('div',{class:'row','data-task-notesum':'1'},[h('span',{class:'hint',text:tx('task.rev.notesPlain')}),h('button',{type:'button',class:'linkb','data-task-details':'1',text:tx('task.rev.details'),onclick:function(){det.hidden=!det.hidden}})]));el.appendChild(det)}}
function tkTable(rows){var t=h('table',{},[]),tb=h('tbody');rows.forEach(function(r){tb.appendChild(h('tr',{},[h('td',{text:String(r[0])}),h('td',{text:String(r[1]==null?'':r[1])})]))});t.appendChild(tb);return t}
function tkStepWrite(b){tkHead(b,tx('task.wr.ask'),tx('task.wr.help'));var out=h('div',{'data-task-wrote':'1'});
 if(/^(written|checked|done)$/.test(TK.d.state))out.appendChild(h('div',{class:'tk-card',text:tx('task.wr.already',{n:(TK.d.restore||[]).length})}));
 else if(TK.d.stopped)out.appendChild(tkStopCard(TK.d.stopped));   // a write stopped earlier (also after Continue): what it did
 var wb=h('button',{type:'button',class:'primary','data-task-write':'1',text:tx('task.wr.go'),onclick:function(){if(RMT){toast(tx('task.why.remote'));return}
  api('/api/x/task/plan',{draft:TK.d.id},tkJob()).catch(function(e){if(e&&e.cancelled){tkStopLine(out,'task.stop.plan');return null}throw e}).then(function(p){if(!p)return;if(p.errors&&p.errors.length){out.textContent='';tkPlanBox(out,p);return}
   var fl=(p.files||[]).map(function(f){return f.rel}),more=fl.length>30?[tx('task.wr.more',{n:fl.length-30})]:[];
   return askDo({title:tx('task.wr.confirm'),lines:fl.slice(0,30).concat(more,[tx('task.wr.restore')]),where:p.mod,ok:tx('task.wr.go')}).then(function(y){if(!y)return;
    return api('/api/x/task/write',{draft:TK.d.id},tkJob()).catch(function(e){if(e&&e.cancelled)return tkStopShow(out,b).then(function(){return null});throw e}).then(function(w){if(!w)return;out.textContent='';tkCallCards(out,w);if(!w.written){if(w.partial)out.appendChild(h('div',{class:'tk-card tk-bad','data-task-partial':'1'},[h('div',{text:tx('task.wr.partial',{n:(w.restore||[]).length})}),tkUndoB()]));tkPlanBox(out,w);return}
     out.appendChild(h('div',{class:'tk-card'},[h('b',{text:tx('task.wr.done',{n:(w.files||[]).length})}),h('div',{class:'hint','data-task-points':'1',text:tx('task.wr.points',{n:(w.restore||[]).length})}),tkUndoB(),(w.unguarded&&w.unguarded.length)?h('div',{class:'tk-refuse','data-task-unguarded':'1',text:tx('task.wr.unguarded',{f:w.unguarded.slice(0,30).join(', ')+(w.unguarded.length>30?' ...':'')})}):null]));
     return api('/api/x/task/draft?'+tkQs({id:TK.d.id})).then(function(r){TK.d=r.draft;if(TK.d.mod&&TK.d.mod!==S.mod)setMod(TK.d.mod);tkDrafts();tkDrawSteps();
      // written: Next goes on, the gate line and Do not write now go away
      var nx=b.querySelector('button[data-task-next]'),lt=b.querySelector('button[data-task-nowrite]'),gl=b.querySelector('div[data-task-gate]');if(nx){nx.disabled=false;nx.title=''}if(lt)lt.remove();if(gl)gl.remove()})})})}).catch(tkErr)}});
 b.appendChild(h('div',{class:'row'},[wb]));b.appendChild(h('div',{class:'hint','data-task-undowhere':'1',text:tx('task.wr.undoWhere')}));
 var gate=!tkWritten();if(gate)b.appendChild(h('div',{class:'hint','data-task-gate':'1',text:tx('task.wr.first')}));
 b.appendChild(out);tkNav(b,{gate:gate})}
function tkUndoB(){return h('button',{type:'button',class:'linkb','data-task-undo':'1',text:tx('task.wr.undoGo'),onclick:tkUndo})}
// a card per call that failed (never silent) and per command done with notes
function tkCallCards(out,w){(w.calls||[]).forEach(function(c){var name=c.cmd||c.tool||String(c.route||'').replace(/^POST \/api\/x\//,'');
  if(c.ok===false){var card=h('div',{class:'tk-card tk-bad','data-task-callfail':name},[h('b',{text:tx('task.wr.callFail',{c:name})})]);(c.errors||[]).slice(0,10).forEach(function(e){card.appendChild(h('div',{class:'tk-refuse',text:String(e)}))});out.appendChild(card)}
  else if(c.partial){var nc=h('div',{class:'tk-card tk-warn','data-task-callnotes':name},[h('b',{text:tx('task.wr.withNotes',{c:name})})]);(c.notes||[]).slice(0,12).forEach(function(e){nc.appendChild(h('div',{class:'hint',text:String(e)}))});out.appendChild(nc)}})}
// the recipe's own check (recipe.check), after the built-in one: its cards
function tkOwnCheck(out){if(!TK.rec.check||RMT)return Promise.resolve();var box=h('div',{'data-task-owncheck':'1'},[h('b',{text:tx('task.ck.own')})]);out.appendChild(box);
 return api('/api/x/task/check',{draft:TK.d.id},tkJob()).then(function(r){var cs=(r&&r.cards)||[];if(!cs.length){box.appendChild(h('div',{class:'hint',text:tx('task.ck.ownNone')}));return}
  cs.forEach(function(c){var card=h('div',{class:'tk-card'+(c.level==='error'?' tk-bad':c.level==='warn'?' tk-warn':''),'data-level':c.level},[h('b',{text:c.title})]);(c.lines||[]).forEach(function(l){card.appendChild(h('div',{class:c.level==='error'?'tk-refuse':'',text:l}))});box.appendChild(card)})})
  .catch(function(e){if(e&&e.cancelled){box.appendChild(h('div',{class:'hint','data-task-stopped':'1',text:tx('task.stop.plain')}));return}box.appendChild(h('div',{class:'tk-refuse',text:(e&&(e.text||e.message))||''}))})}
function tkStepCheck(b){tkHead(b,tx('task.ck.ask'),tx('task.ck.help'));var out=h('div',{'data-task-checked':'1'});
 var cb=h('button',{type:'button',class:'primary','data-task-check':'1',text:tx('task.ck.go'),onclick:function(){if(!TK.d.mod){tkRefuse(tx('task.mstep.none'));return}out.textContent=tx('task.ck.running');
  streamRun('check',chkIn({mod:TK.d.mod}),{line:function(){}}).then(function(end){out.textContent='';if(!end||end.result==null){out.appendChild(h('div',{class:'tk-refuse',text:tx('task.ck.fail')}));return tkOwnCheck(out)}
   viewCheck(end.result,out);return tkOwnCheck(out).then(function(){if(TK.d.state==='written')TK.d.state='checked';return tkSave().then(function(){tkDrawSteps()})})})}});
 b.appendChild(h('div',{class:'row'},[cb]));b.appendChild(out);tkNav(b)}
// what to press on the Play page, where the new thing is in the match (recipe.test, else the general line), how to come back
function tkStepTest(b){var play=!!(S.sec&&S.sec.play);tkHead(b,tx('task.ts.ask'),tx(play?'task.ts.help':'task.ts.noPlay'));
 var ls=play?['task.ts.s1','task.ts.s2']:['task.ts.self'];ls=ls.map(function(k){return tx(k)}).concat([TK.rec.test?tx(TK.rec.test):tx('task.ts.where'),tx('task.ts.back',{s:tkStepLabel(TK.st[Math.min(TK.st.length-1,TK.at+1)]||{kind:'done'})})]);
 var ol=h('div',{class:'tk-card','data-task-testhow':'1'});ls.forEach(function(t,i){ol.appendChild(h('div',{'data-task-tstep':String(i+1),text:(i+1)+'. '+t}))});b.appendChild(ol);
 if(play)b.appendChild(h('div',{class:'row'},[h('button',{type:'button',class:'primary','data-task-play':'1',text:tx('task.ts.go'),onclick:function(){var m=TK.d.mod;TK.at=Math.min(TK.st.length-1,TK.at+1);TASK.close().then(function(){if(m&&m!==S.mod)setMod(m);show('play')})}})]));
 tkNav(b)}
function tkStepChecklist(b){tkHead(b,tx('task.cl.ask'),tx('task.cl.help'));var t=TK.d.ticks||(TK.d.ticks=[]);
 (TK.rec.checklist||[]).forEach(function(k){var c=h('input',{type:'checkbox','data-tick':k});c.checked=t.indexOf(k)>=0;c.addEventListener('change',function(){var i=t.indexOf(k);if(c.checked&&i<0)t.push(k);if(!c.checked&&i>=0)t.splice(i,1);tkSave();tkDrawSteps()});
  b.appendChild(h('label',{class:'chk'},[c,h('span',{text:' '+tx(k)})]))});tkNav(b)}
// an explore task offers what its recipe names (next: [{recipe, verb, label}], the base it looked at goes along); with no next it
// offers none of its own (its last screen has the buttons); other tasks offer "make another"
function tkStepDone(b){var ex=TK.d.verb==='explore';tkHead(b,tx(ex?'task.dn.askEx':'task.dn.ask'),tx(ex?'task.dn.helpEx':'task.dn.help'));var rec=TK.rec,d=TK.d,row=h('div',{class:'row'});
 function go(id,verb,opt){d.state='done';tkSave().then(function(){return TASK.close()}).then(function(){TASK.open(id,verb,opt)})}
 if(!ex)row.appendChild(h('button',{type:'button',class:'primary','data-task-again':'1',text:tx('task.dn.again'),onclick:function(){go(rec.id,d.verb,null)}}));
 else (rec.next||[]).forEach(function(n,i){var r=tkCat(n.recipe),w=tkWhy(r),verb=n.verb||(r&&r.verbs&&r.verbs[0])||'make';
  var bt=h('button',{type:'button',class:i===0?'primary':null,'data-task-nextrecipe':n.recipe,text:n.label?tx(n.label):tx('task.dn.next',{verb:tx('task.verb.'+verb),what:r?tx(tkTk(r,verb)):n.recipe}),title:w?tkWhyT(r,w):null,onclick:function(){go(n.recipe,verb,{base:d.base})}});
  if(w)bt.disabled=true;row.appendChild(bt)});
 row.appendChild(h('button',{type:'button','data-task-finish':'1',text:tx('task.dn.tabs'),onclick:function(){d.state='done';tkSave().then(function(){TASK.close()})}}));
 if(S.sec&&S.sec.share&&!ex)row.appendChild(h('button',{type:'button','data-task-share':'1',text:tx('task.dn.share'),onclick:function(){d.state='done';tkSave().then(function(){TASK.close();show('share')})}}));
 b.appendChild(row);tkNav(b,{noNext:true})}
// ---------- the look pane and "So far"
// the look pane, per step: the question's own thing (an answer that names a file), else the thing being copied, then the copy's
// numbers. The same thing stays as it is from step to step (a 3D view keeps its camera, a sound keeps playing). Never a hex dump:
// a model is a small 3D view (the Models 3D view, read only), a picture a picture, a sound a player, text its first lines, anything
// else "No preview for this file" with its size and path
function tkLookNumbers(){var w=TK.win,v=TK.vals||{},k=Object.keys(v);w.lookNums.textContent='';
 if(!k.length){if(!w.lookThing.firstChild)w.lookNums.appendChild(h('div',{class:'hint','data-task-looknone':'1',text:tx('task.lk.none')}));return}
 w.lookNums.appendChild(tkTable(k.slice(0,60).map(function(x){var q=tkQ(x);return [q?tx(q.ask):x,tkShow(v[x])]})))}
function tkLookStep(s){tkLookShow(tkLookWant(s));tkLookNumbers()}
function tkLookWant(s){var d=TK.d||{},isQ=s&&s.kind==='q',a=isQ?(d.answers||{})[s.q]:null,q=isQ?tkQ(s.q):null,br=d.base&&d.base.ref;
 if(a&&a.src==='exist'&&a.ref)return {ref:a.ref,name:a.name||a.value};
 if(a&&a.src==='list'&&a.items)for(var i=a.items.length-1;i>=0;i--){var it=a.items[i];if(it&&it.src==='exist'&&it.ref)return {ref:it.ref,name:it.name||it.value}}
 // a value that names a file (the model, the texture, the sound of the copy): beside the copied thing's own file
 var v=q?tkCurVal(q):null;if(typeof v==='string'&&br&&br.key&&/\.(mdl|ply|dds|tga|png|jpg|wav|ogg|mp3)$/i.test(v)){var k=tkRelKey(br.key,v);if(k)return {ref:{key:k},name:tkBase(v)}}
 if(br)return {ref:br,name:d.base.name||d.base.id};
 return null}
// a file name as a game file names another: resource/... as it is, /x from the resource root, else beside the file at key
function tkRelKey(key,v){var s=String(v).replace(/\\/g,'/').toLowerCase(),out=[];if(/^resource\//.test(s))return s;
 var p=/^\//.test(s)?['resource'].concat(s.slice(1).split('/')):String(key).toLowerCase().split('/').slice(0,-1).concat(s.split('/'));
 for(var i=0;i<p.length;i++){if(p[i]===''||p[i]==='.')continue;if(p[i]==='..'){if(!out.length)return '';out.pop();continue}out.push(p[i])}return out.join('/')}
function tkLookSig(r){return r?[r.key||'',r.rel||'',r.path||'',r.entity||''].join('|'):''}
function tkLookShow(want){var w=TK.win;if(!w)return;var sig=want&&want.ref?tkLookSig(want.ref):'';
 if(sig&&sig===TK.lookSig&&w.lookThing.firstChild)return;
 tkLookClose();w.lookThing.textContent='';TK.lookSig=sig;if(want&&want.ref)tkLookThing(w.lookThing,want.ref,want.name)}
// a pick in a lookup shows what was picked
function tkLookRef(ref,name){if(!TK.win||!ref)return;tkLookShow({ref:ref,name:name});tkLookNumbers()}
function tkLookThing(host,ref,name){var V=typeof window!=='undefined'?window.VIEW:null,p=String(ref.key||ref.rel||ref.path||''),nm=name||tkBase(p);
 host.appendChild(h('div',{class:'tk-lkname','data-task-lkname':'1',text:nm}));
 // a unit by its name (the entity lookup): its model in the 3D view, else its name
 if(!p&&ref.entity){if(!tkLook3d(host,{mod:TK.d.mod||S.mod||''},'def',String(ref.entity)+'.def'))host.appendChild(h('div',{class:'hint tk-lkpath',text:String(ref.entity)}));return}
 var r=V&&V.norm?V.norm({mod:ref.mod||TK.d.mod||S.mod||'',key:ref.key,rel:ref.rel,path:ref.path,idx:ref.idx}):null;
 if(!r){host.appendChild(h('div',{class:'hint tk-lkpath',text:p}));return}
 var e=V.extOf(p||nm);
 if((e==='mdl'||e==='def')&&tkLook3d(host,r,e,p))return;
 var k=V.kindOf(p,r.key);
 if(k==='picture'||k==='sound'){try{TK.look=V.mount(host,r,tkBase(p),{kind:k});return}catch(x){}}
 if(V.textual(p)){tkLookText(host,r,p);return}
 tkLookInfo(host,r,p)}
// the Models 3D view, small and read only: one pane, orbit and zoom, textured, the page's colours; its bars stay hidden. It reads
// POST /api/x/models/viewer/scene and texture (nothing is copied into the mod); doc false: never the model open on the Models page.
// TASK.look3d, when a page sets it, is used instead (same call: (ctx, opts) -> element). A view that cannot be made: text or facts
function tkLook3d(host,r,e,p){var E=typeof EXT_SCREENS!=='undefined'?EXT_SCREENS:null,VP=typeof TASK.look3d==='function'?TASK.look3d:E&&E.models&&E.models.parts&&E.models.parts.viewer;if(typeof VP!=='function')return false;
 var tg=e==='mdl'?(r.key||r.rel||r.path||''):tkBase(p).replace(/\.def$/i,'');if(!tg)return false;
 var v=null;try{v=VP({set:{target:tg},mod:r.mod||''},{height:240,blk:'task.look.v3',doc:false,show:{volumes:false,bones:false,obstacles:false,areas:false}})}catch(x){v=null}
 if(!v)return false;
 var kids=v.children||v.childNodes||[];for(var i=0;i<kids.length;i++){var c=kids[i],b=(c.getAttribute&&c.getAttribute('data-blk'))||'';if(!/\.(canvas|note)$/.test(b)&&c.style)c.style.display='none'}
 // a preview inside the look pane, not blocks of the task window: its block marks go (nothing to arrange there)
 (function unblk(n){if(!n||!n.getAttribute)return;if(n.getAttribute('data-blk')!=null){n.removeAttribute('data-blk');n.removeAttribute('data-blkname');
   n.className=String(n.className||'').split(/\s+/).filter(function(x){return x&&x!=='blk'&&x!=='blc'&&!/^box-/.test(x)}).join(' ')}
  var ks=n.children||[];for(var j=0;j<ks.length;j++)unblk(ks[j])})(v);
 var box=h('div',{class:'tk-look3d','data-task-look3d':tg},[v]);host.appendChild(box);
 if(/[\\\/]/.test(p))host.appendChild(h('div',{class:'hint tk-lkpath',text:tx('task.lk.path',{p:p})}));
 TK.look={close:function(){if(box.parentNode)box.parentNode.removeChild(box)}};return true}
// text: its first 40 lines (the first 8 KB), read only
function tkLookText(host,r,p){var V=window.VIEW,it=V.item(r,tkBase(p)),pre=h('pre',{class:'tk-lktext','data-task-lktext':'1',text:tx('task.lk.reading')});host.appendChild(pre);
 api('/api/x/view/hex?'+it.q+'&off=0&len=8192').then(function(j){var u=V.b64(j.b64),t;
  try{t=new TextDecoder('utf-8').decode(u)}catch(x){t='';for(var i=0;i<u.length;i++)t+=String.fromCharCode(u[i])}
  var ls=t.split(/\r?\n/),cut=ls.length>40||(j.size||0)>(j.len||0);pre.textContent=ls.slice(0,40).join('\n');
  if(cut)host.appendChild(h('div',{class:'hint','data-task-lkmore':'1',text:tx('task.lk.more',{s:V.size(j.size)})}))})
  .catch(function(){if(pre.parentNode)pre.parentNode.removeChild(pre);tkLookInfo(host,r,p)})}
function tkLookInfo(host,r,p){var V=window.VIEW,sz=h('div',{class:'hint','data-task-lksize':'1'});
 host.appendChild(h('div',{class:'tk-card','data-task-lknone':'1'},[h('b',{text:tx('task.lk.noPreview')}),h('div',{class:'hint tk-lkpath',text:tx('task.lk.path',{p:p})}),sz]));
 try{V.info(V.item(r,tkBase(p))).then(function(o){sz.textContent=tx('task.lk.size',{s:V.size(o.size)})}).catch(function(){})}catch(x){}}
function tkSofar(){var el=TK.win.sofar,rows=[];el.textContent='';
 if(TK.d.mod)rows.push([tx('task.s.mod'),tkBase(TK.d.mod)]);if(TK.d.base&&TK.d.base.id)rows.push([tkVk('task.s.base'),TK.d.base.name||TK.d.base.id]);
 Object.keys(TK.d.answers||{}).forEach(function(k){var a=TK.d.answers[k];if(!a||a.src==='keep')return;var q=tkQ(k);rows.push([q?tx(q.ask):k,tkAns(q,a)])});
 // once Review planned: how many files the task will write
 if(TK.plan&&TK.plan.files&&!(TK.plan.errors||[]).length)rows.push([tx('task.sf.files'),String(TK.plan.files.length)]);
 if(!rows.length){el.appendChild(h('div',{class:'hint',text:tx('task.sf.none')}));return}el.appendChild(tkTable(rows))}
// ---------- window.TASK
var TASK=window.TASK=window.TASK||{};
TASK.steps=tkStepsOf;
// for a recipe's own page code (recipes/*.client.js): api(url,body,TASK.job()) names the request in the footer job list;
// TASK.stopped(box,e) -> true when e is a request stopped there (the box then says so in plain words, no red error)
TASK.job=tkJob;TASK.stopped=function(box,e){if(!e||!e.cancelled)return false;if(box)tkStopLine(box);return true};
TASK.row=tkRow;
TASK.kind=function(name,spec){if(!/^[a-z][a-z0-9-]*$/.test(String(name||''))||!spec||typeof spec.draw!=='function'||typeof spec.value!=='function')throw new Error('TASK.kind: name and {draw, value} are needed (leave is optional)');if(spec.leave!=null&&typeof spec.leave!=='function')throw new Error('TASK.kind: leave must be a function');TK.kinds[name]=spec;return spec};
TASK.open=function(rid,verb,opt){opt=opt||{};if(RMT){toast(tx('task.why.remote'));return Promise.resolve(null)}
 var p=opt.parent&&opt.parent.draft?api('/api/x/task/draft/child',{parent:opt.parent.draft,q:opt.parent.q,recipe:rid}):api('/api/x/task/draft/new',{recipe:rid,verb:verb||'make',game:GID,mod:S.mod||'',base:opt.base||null});
 return p.then(function(r){TK.stack=[];TK.fresh=opt.parent?null:{id:r.draft.id,base:(r.draft.base&&r.draft.base.id)||'',mod:r.draft.mod||''};tkDrafts();return tkEnter(r.draft)}).catch(function(e){tkErr(e);return null})};
TASK.resume=function(id){return api('/api/x/task/draft?'+tkQs({id:id})).then(function(r){TK.stack=[];TK.fresh=null;return tkEnter(r.draft)}).catch(function(e){tkErr(e);return null})};
// a task opened here and closed with nothing given (no answer, no base or mod of its own, no tick, nothing written, no branch open):
// no draft stays and no Saved toast (an explore task looked at and closed leaves nothing behind)
function tkEmpty(d){var f=TK.fresh;if(!d||!f||f.id!==d.id||TK.stack.length)return false;
 return !Object.keys(d.answers||{}).length&&!(d.ticks||[]).length&&!/^(written|checked|done)$/.test(String(d.state||''))&&((d.base&&d.base.id)||'')===f.base&&(d.mod||'')===f.mod}
TASK.close=function(){var d=TK.d,empty=tkEmpty(d);
 var p=empty?api('/api/x/task/draft/delete',{id:d.id}).catch(function(){return null}):tkSave().then(function(){if(d){try{tkSavedToast(d)}catch(e){}}});
 return p.then(function(){tkSS(null);tkLeave();tkLookClose();TK.lookSig='';TK.fresh=null;if(TK.win){TK.win.root.hidden=true;TK.win.lookThing.textContent=''}tkCls(document.body,'task-open',false);TK.d=null;TK.stack=[];TK.cur=null;tkDrafts();return d})};
TASK.state=function(){return {draft:TK.d,at:TK.at,steps:TK.st,stack:TK.stack.length}};
TASK.next=function(){tkNext()};TASK.back=function(){tkBack()};
`;

module.exports = {
  css,
  // allCss: this file's css plus each recipe's .client.js css
  script: allCss => '(function(){\nvar TKCSS=' + JSON.stringify(String(allCss || '')) + ';\nvar tkStepsOf=' + RS.steps.toString() + ';\n' + BODY + '\n})();',
};

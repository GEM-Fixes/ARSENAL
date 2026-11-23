// view kind sound, page side: a player that plays a .wav the way the game does (WebAudio). The maths is tools/sound/play.src.js
// (window.SNDMATH), pasted in front of this script, so the page and the core share one source. The server decodes every wav exactly
// as the core does (IMA ADPCM cannot play in a browser) and sends plain PCM16; an mp3 is decoded by the browser.
// "As in the game" (the default): gain = group volume x folder Volume x distance gain (3D, positioned sounds), the engine's pan from
// the bearing, the distance low pass (muffling), the reload stretch (SetRate), loop (PLAY_LOOP), ambient (no folder Volume), output
// at the game's sample rate option. "Raw file" plays the decoded file untouched. Folder: "Next as the game picks" walks the shuffle bag
// the server computed with model.bag. Burst: the server runs the engine's voice limits; the page plays what survives.
// Compact variant: VIEW.soundMini(host, ref, name) (or a VIEW.mount host with a data-compact attribute): one row, Play + Next + Open.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, DOM through h() and textContent, strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-5f998f45)
'use strict';
const fs = require('fs'), path = require('path');
// SNDMATH: the text of tools/sound/play.src.js (a literal require keeps the module in the single exe; the text is read when it is
// there (its comments dropped: the page checks look for words like innerHTML), else the same functions are written out from the
// module, so the page always runs the core's own maths)
const M = require('../../../../sound/play.src');
function sndmath() {
  try { const t = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'sound', 'play.src.js'), 'utf8'); if (/SNDMATH/.test(t)) return t.split(/\r?\n/).map(l => l.replace(/^\s*\/\/.*$/, '').replace(/\s+\/\/ .*$/, '')).filter(l => l.trim()).join('\n'); } catch (e) { /* bundled */ }
  const parts = ['(function(){var M={};'];
  for (const k of Object.keys(M)) parts.push('M.' + k + '=' + (typeof M[k] === 'function' ? M[k].toString() : JSON.stringify(M[k])) + ';');
  parts.push('var clamp=M.clamp;window.SNDMATH=M;})();');
  return parts.join('\n');
}
const BODY = String.raw`
(function(){
var SM=window.SNDMATH,BAR=1000,COLS=600,WHY='view.sound.why.',RES='view.sound.res.';
function AC(){return window.AudioContext||window.webkitAudioContext||null}
function r2(v,n){var p=Math.pow(10,n==null?2:n);return Math.round(v*p)/p}
function tm(s){s=Math.max(0,+s||0);var m=Math.floor(s/60),x=s-m*60;return m+':'+(x<10?'0':'')+x.toFixed(1)}
function pct(v){return Math.round(v*100)+'%'}
function low(s){return String(s==null?'':s).replace(/\\/g,'/').toLowerCase()}
function baseOf(k){k=String(k||'');return k.slice(k.lastIndexOf('/')+1)}
function relOf(k){return String(k||'').replace(/^resource\/sound\//,'')}
// a plain PCM16 wav (the server's) -> {rate, channels, frames, data:Int16 view}
function pcmWav(u){var dv=new DataView(u.buffer,u.byteOffset,u.byteLength),p=12,rate=44100,ch=1;
 while(p+8<=u.length){var id=String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]),n=dv.getUint32(p+4,true);
  if(id==='fmt '){ch=dv.getUint16(p+10,true);rate=dv.getUint32(p+12,true)}
  else if(id==='data'){var len=Math.min(n,u.length-p-8),fr=Math.floor(len/(2*ch));return {rate:rate,channels:ch,frames:fr,dv:dv,off:p+8}}
  p+=8+n+(n&1)}
 throw new Error('no data')}
// the decoded sound as an AudioBuffer-like {sampleRate, numberOfChannels, length, duration, ch:[Float32Array]} + the real buffer
function toBuffer(ac,w){var b=ac.createBuffer(w.channels,Math.max(1,w.frames),w.rate),i,c;
 for(c=0;c<w.channels;c++){var d=b.getChannelData(c);for(i=0;i<w.frames;i++)d[i]=w.dv.getInt16(w.off+(i*w.channels+c)*2,true)/32768}return b}
// the waveform: min/max per column over all channels
function peaksOf(b){var n=b.length,cols=Math.min(COLS,Math.max(1,n)),mn=new Float32Array(cols),mx=new Float32Array(cols),c,i,k;
 for(c=0;c<b.numberOfChannels;c++){var d=b.getChannelData(c);for(k=0;k<cols;k++){var s=Math.floor(k*n/cols),e=Math.max(s+1,Math.floor((k+1)*n/cols)),a=mn[k],z=mx[k];
  for(i=s;i<e&&i<n;i++){var v=d[i];if(v<a)a=v;if(v>z)z=v}mn[k]=a;mx[k]=z}}return {mn:mn,mx:mx,cols:cols}}
// a positioned stereo file: the game hands Miles a stereo sample for a 3D voice [T]; the core renders it as a mono mix (model.render)
function monoOf(ac,b){if(b.numberOfChannels<2)return b;var m=ac.createBuffer(1,b.length,b.sampleRate),o=m.getChannelData(0),n=b.numberOfChannels,c,i;
 for(c=0;c<n;c++){var d=b.getChannelData(c);for(i=0;i<b.length;i++)o[i]+=d[i]/n}return m}
function cssVar(el,name,dflt){try{var v=window.getComputedStyle(el).getPropertyValue(name);v=String(v||'').trim();return v||dflt}catch(e){return dflt}}
function note(code,msg){var k='view.sound.n.'+code,v=tx(k);return v===k?(msg||code):v}
// opt.play: start playing once the plan is in (the page's own button asked for it: a user click, not show())
VIEW.soundMini=function(host,ref,name,opt){var w=h('div',{class:'vw-snd-minihost','data-compact':'1','data-play':opt&&opt.play?'1':null});host.appendChild(w);return VIEW.mount(w,ref,name,{kind:'sound'})};
VIEW.reg('sound',{where:'tab',label:'view.sound.label',exts:['wav','mp3','ogg','flac'],open:function(host,item){
 var mini=!!(host.parentNode&&host.parentNode.getAttribute&&host.parentNode.getAttribute('data-compact')!=null);
 var auto=mini&&host.parentNode.getAttribute('data-play')!=null;
 var st={gone:false,hid:false,J:null,key:item.key||null,playing:false,t0:0,off:0,rate:1,dur:0,ac:null,acRate:0,voices:[],timer:null,bufs:{},order:[],cur:null,bagI:0,burstEnd:0,gen:0,vol:'profile',err:null};
 var mod=item.ref&&item.ref.mod||'';
 host.setAttribute('tabindex','-1');
 // ---- the pieces
 var top=h('div',{class:'vw-snd-top'},[h('div',{class:'hint',text:tx('view.loading')})]);
 var playB=h('button',{type:'button',class:'primary vw-snd-play',text:tx('view.sound.play'),onclick:function(){toggle()}});
 var timeL=h('span',{class:'vw-snd-time vw-mono',text:'0:00.0 / 0:00.0'});
 var modeS=h('select',{class:'vw-snd-mode','aria-label':tx('view.sound.mode')},[h('option',{value:'game',text:tx('view.sound.modeGame')}),h('option',{value:'raw',text:tx('view.sound.modeRaw')})]);
 var loopC=h('input',{type:'checkbox',class:'vw-snd-loop'}),ambC=h('input',{type:'checkbox',class:'vw-snd-amb'});
 var volS=h('select',{class:'vw-snd-vol','aria-label':tx('view.sound.vol')},[h('option',{value:'profile',text:tx('view.sound.volProfile')}),h('option',{value:'defaults',text:tx('view.sound.volDefaults')}),h('option',{value:'full',text:tx('view.sound.volFull')})]);
 var cv=h('canvas',{class:'vw-snd-wave',width:String(COLS),height:mini?'28':'72','aria-hidden':'true'});
 var pos=h('input',{type:'range',class:'vw-snd-pos',min:'0',max:String(BAR),value:'0',step:'1','aria-label':tx('view.sound.pos')});
 var distI=h('input',{type:'range',class:'vw-snd-dist',min:'0',max:'100',value:'0',step:'0.5','aria-label':tx('view.sound.dist')});
 var distN=h('span',{class:'vw-snd-dn vw-mono'}),marks=h('div',{class:'vw-snd-marks'});
 var bearI=h('input',{type:'range',class:'vw-snd-bear',min:'-180',max:'180',value:'0',step:'5','aria-label':tx('view.sound.bear')}),bearN=h('span',{class:'vw-snd-dn vw-mono'});
 var durI=h('input',{type:'text',class:'vw-snd-dur',placeholder:'0','aria-label':tx('view.sound.dur'),style:'width:5em'});
 var rd=h('div',{class:'vw-snd-rd vw-mono',role:'status','aria-live':'polite'}),msg=h('div',{class:'vw-snd-msg'});
 var folderBox=h('div',{class:'vw-snd-folder'}),nextB=h('button',{type:'button',text:tx('view.sound.next'),onclick:function(){nextPick()}}),pickL=h('span',{class:'hint vw-snd-pick'});
 var everyI=h('input',{type:'text',class:'vw-snd-every',value:'67',style:'width:5em','aria-label':tx('view.sound.every')}),shotsI=h('input',{type:'text',class:'vw-snd-shots',value:'20',style:'width:4em','aria-label':tx('view.sound.shots')});
 var bagC=h('input',{type:'checkbox',class:'vw-snd-bagc'}),burstB=h('button',{type:'button',text:tx('view.sound.burstRun'),onclick:function(){runBurst()}}),burstOut=h('div',{class:'vw-snd-burst'});
 var notesBox=h('div',{class:'vw-snd-notes'}),namesBox=h('div',{class:'vw-snd-names'});
 function lab(t,kid){return h('label',{class:'vw-snd-l'},[h('span',{text:t}),kid])}
 function say(s,cls){msg.textContent='';if(s)msg.appendChild(h('div',{class:cls||'hint',text:s}))}
 if(mini){var openB=h('button',{type:'button',text:tx('view.sound.openFull'),onclick:function(){stop();VIEW.open(item.ref,item.name,{kind:'sound'})}});
  host.appendChild(h('div',{class:'vw-snd-mini'},[playB,nextB,h('div',{class:'vw-snd-mwave'},[cv]),timeL,openB]));host.appendChild(msg);nextB.hidden=true}
 else{
  host.appendChild(top);
  host.appendChild(h('div',{class:'vw-snd-bar'},[playB,timeL,lab(tx('view.sound.mode'),modeS),h('label',{class:'vw-snd-l'},[loopC,h('span',{text:tx('view.sound.loop')})]),h('label',{class:'vw-snd-l'},[ambC,h('span',{text:tx('view.sound.amb')})]),lab(tx('view.sound.vol'),volS)]));
  host.appendChild(h('div',{class:'vw-snd-wbox'},[cv,pos]));
  var sp=h('div',{class:'vw-snd-3d'},[h('div',{class:'vw-snd-row'},[lab(tx('view.sound.dist'),h('span',{class:'vw-snd-track'},[distI,marks])),distN]),
   h('div',{class:'vw-snd-row'},[lab(tx('view.sound.bear'),bearI),bearN]),
   h('details',{class:'vw-snd-adv'},[h('summary',{text:tx('view.sound.adv')}),h('div',{class:'vw-snd-row'},[lab(tx('view.sound.dur'),durI),h('span',{class:'hint',text:tx('view.sound.durHint')})])])]);
  host.appendChild(sp);host.appendChild(rd);host.appendChild(msg);
  host.appendChild(h('div',{class:'vw-snd-sec'},[h('b',{text:tx('view.sound.folderH')}),h('div',{class:'vw-snd-row'},[nextB,pickL]),folderBox]));
  host.appendChild(h('div',{class:'vw-snd-sec'},[h('b',{text:tx('view.sound.burstH')}),h('div',{class:'hint',text:tx('view.sound.burstIntro')}),
   h('div',{class:'vw-snd-row'},[lab(tx('view.sound.every'),everyI),lab(tx('view.sound.shots'),shotsI),h('label',{class:'vw-snd-l'},[bagC,h('span',{text:tx('view.sound.burstBag')})]),burstB]),burstOut]));
  host.appendChild(h('div',{class:'vw-snd-sec'},[h('b',{text:tx('view.sound.namesH')}),namesBox]));
  host.appendChild(h('div',{class:'vw-snd-sec'},[h('b',{text:tx('view.sound.notesH')}),notesBox,h('div',{class:'hint vw-snd-miles',text:tx('view.sound.miles')})]))}
 // ---- the facts
 function J(){return st.J||{}}
 function P(){return J().plan||null}
 function S0(){var p=P();return p&&p.settings||{}}
 function refOf(key){if(!key||key===item.key||key===J().soundKey&&!J().inSound)return item.ref;return mod?{mod:mod,key:key}:null}
 function qOf(key){var r=refOf(key);if(!r)return null;var o={};['mod','rel','key','idx','path'].forEach(function(k){if(r[k]!=null)o[k]=r[k]});return VIEW.qs(o)}
 function groupVol(){var p=P();if(st.vol==='full')return 1;if(st.vol==='defaults')return SM.groupVolume(100,50);return p?p.gain.group:SM.DEFAULT_GROUP_VOLUME}
 function outRate(){var p=P();return p&&p.rate&&p.rate.out||SM.DEFAULT_SAMPLE_RATE}
 function dist(){return Math.max(0,+distI.value||0)}
 function bearing(){return +bearI.value||0}
 function ambient(){return !!ambC.checked}
 function game(){return modeS.value!=='raw'}
 function durSec(){var v=parseFloat(String(durI.value||'').replace(',','.'));return isFinite(v)&&v>0?v:0}
 // the per-play numbers, all through SNDMATH (the core's maths)
 function calc(b){var s=S0(),p=P(),d=dist(),g=groupVol(),o={positional:!ambient(),group:g};
  if(!p||J().media){o.positional=false;o.channel=J().media&&J().music&&st.vol==='profile'?J().music.gain:(st.vol==='full'?1:g);o.d3=1;o.cutoff=1;o.hz=null;o.pan=0;o.L=o.R=1;o.rate=1;return o}
  var dd=p.distances||{};
  if(o.positional){o.channel=SM.channelVolume(s.volume==null?1:s.volume,g,1,1);o.d3=SM.gainAt(d,dd.milesMin,dd.milesMax==null?0:dd.milesMax,dd.rolloff==null?SM.ROLLOFF:dd.rolloff);
   o.cutoff=SM.lowPassCutoff(s.minDistance,d);var lp=SM.lowPassCoefs(o.cutoff,b?b.sampleRate:(p.wav&&p.wav.rate||44100));o.hz=lp?lp.hz:null;o.pan=SM.pan(bearing());var pg=SM.panGains(o.pan);o.L=pg.left;o.R=pg.right}
  else{o.channel=SM.ambientVolume(g,1);o.d3=1;o.cutoff=1;o.hz=null;o.pan=0;o.L=o.R=1}
  o.rate=b?SM.rateFactor(b.duration*1000,durSec()):1;return o}
 function readout(){if(mini)return;var b=st.cur&&st.cur.buf,o=calc(b);rd.textContent='';
  if(!game()){rd.textContent=tx('view.sound.rdRaw');return}
  var t=tx('view.sound.rdGain',{g:r2(o.channel*o.d3,3),grp:r2(o.group,3),fv:o.positional?r2(S0().volume==null?1:S0().volume,2):tx('view.sound.notUsed'),d:r2(o.d3,3)});
  if(o.positional)t+='   '+tx('view.sound.rdPan',{l:r2(o.L,2),r:r2(o.R,2)})+'   '+(o.hz?tx('view.sound.rdLp',{hz:Math.round(o.hz)}):tx('view.sound.rdNoLp'));
  if(o.rate!==1)t+='   '+tx('view.sound.rdRate',{f:r2(o.rate,3)});
  t+='   '+tx('view.sound.rdOut',{hz:outRate()});
  if(o.positional&&o.d3===0)t+='   '+tx('view.sound.rdSilent');
  rd.textContent=t}
 function setDistLabels(){distN.textContent=tx('view.sound.m',{n:r2(dist(),1)});bearN.textContent=tx('view.sound.deg',{n:bearing()})}
 function drawMarks(){marks.textContent='';var s=S0(),mx=+distI.max||100;
  function mk(v,t){if(!(v>0)||v>mx)return;var e=h('span',{class:'vw-snd-mk',text:t,title:t});e.style.left=(v/mx*100)+'%';marks.appendChild(e)}
  mk(s.minDistance,tx('view.sound.mkMin',{n:r2(s.minDistance,1)}));mk(s.maxDistance,tx('view.sound.mkMax',{n:r2(s.maxDistance,1)}))}
 function headRows(){var j=J(),hd=j.header||{},p=P(),s=S0(),f=j.from||{},rows=[],o=j.options||{};
  function src(k){return f[k]?tx('view.sound.from',{f:relOf(f[k])}):tx('view.sound.fromDefault')}
  if(hd.ok)rows.push([tx('view.sound.h.sound'),tx('view.sound.h.soundV',{c:hd.codec,ch:hd.channels===1?tx('view.sound.mono'):hd.channels===2?tx('view.sound.stereo'):hd.channels+' ch',r:hd.rate,b:hd.bits,s:r2(hd.seconds,3)})]);
  else if(!j.media)rows.push([tx('view.sound.h.sound'),tx('view.sound.h.notWav',{k:j.kind||'?'})]);
  if(j.media){rows.push([tx('view.sound.h.plays'),tx('view.sound.h.music')]);if(j.music)rows.push([tx('view.sound.h.group'),tx('view.sound.h.musicVol',{v:pct(j.music.gain)})])}
  if(p){rows.push([tx('view.sound.h.loud'),(j.loudness?tx('view.sound.h.loudV',{n:j.loudness.name}):tx('view.sound.h.ownDist'))+'  ('+src('distance')+')']);
   rows.push([tx('view.sound.h.dist'),tx('view.sound.h.distV',{a:r2(s.minDistance,2),b:s.maxDistance>0?tx('view.sound.m',{n:r2(s.maxDistance,2)}):tx('view.sound.noMax')})]);
   rows.push([tx('view.sound.h.group'),s.group+(s.groupKnown?'':' '+tx('view.sound.h.groupOther'))+'  ('+src('group')+')']);
   rows.push([tx('view.sound.h.fvol'),String(s.volume)+'  ('+src('volume')+')']);
   rows.push([tx('view.sound.h.prio'),String(s.priority)+'  ('+src('priority')+')']);
   if(s.signal)rows.push([tx('view.sound.h.signal'),(s.signal.name||'')+' '+(s.signal.radius==null?'':s.signal.radius)+'  ('+src('signal')+')']);
   rows.push([tx('view.sound.h.folder'),relOf(p.folderKey)+'  '+tx('view.sound.h.files',{n:(j.folder&&j.folder.files||[]).length})])}
  if(j.rules==='goh')rows.push([tx('view.sound.h.rules'),tx('view.sound.h.rulesGoh')]);
  rows.push([tx('view.sound.h.vols'),o.source==='profile'?tx('view.sound.h.volsProfile',{f:o.file||''}):tx('view.sound.h.volsDefault')]);
  return rows}
 function drawNotes(){if(mini)return;notesBox.textContent='';var j=J(),p=P(),ns=(p?p.notes:j.notes)||[],seen={};
  if(j.media)ns=[{code:'MUSIC',level:'info',msg:''}].concat(ns);
  if(!ns.length){notesBox.appendChild(h('div',{class:'ok',text:tx('view.sound.noNotes')}));return}
  ns.forEach(function(n){var k=n.code+'|'+(n.key||'')+'|'+(n.line||'');if(seen[k])return;seen[k]=1;
   notesBox.appendChild(h('div',{class:'vw-snd-n vw-snd-'+(n.level||'info')},[h('b',{text:n.code+' '}),h('span',{text:note(n.code,n.msg)+(n.key?'  ('+relOf(n.key)+(n.line?':'+n.line:'')+')':'')})]))})}
 function drawNames(){if(mini)return;namesBox.textContent='';var ns=J().names||[];
  if(!ns.length){namesBox.appendChild(h('div',{class:'hint',text:J().inSound===false?tx('view.sound.noNamesOut'):tx('view.sound.noNames')}));return}
  ns.forEach(function(n){var what=n.use==='folder'?tx('view.sound.useFolder',{n:n.files}):n.use==='file'?tx('view.sound.useFile'):tx('view.sound.useWeapon',{k:n.use});
   namesBox.appendChild(h('div',{class:'vw-snd-name'},[h('code',{class:'vw-mono',text:n.name}),h('span',{class:n.ok?'hint':'err',text:'  '+what+(n.ok?'':'  '+tx('view.sound.nameBad'))})]))})}
 function drawFolder(){var j=J(),fs=j.folder&&j.folder.files||[];nextB.hidden=fs.length<2||!mod;
  if(mini)return;folderBox.textContent='';
  if(!fs.length){folderBox.appendChild(h('div',{class:'hint',text:tx('view.sound.noFolder')}));return}
  if(fs.length>1)folderBox.appendChild(h('div',{class:'hint',text:tx('view.sound.folderIntro',{n:fs.length})}));
  if(!mod&&fs.length>1)folderBox.appendChild(h('div',{class:'hint',text:tx('view.sound.needMod')}));
  var list=h('div',{class:'vw-snd-files'});
  fs.slice(0,300).forEach(function(k){var me=st.cur&&st.cur.key===k||(!st.cur&&k===(item.key||j.soundKey));
   list.appendChild(h('button',{type:'button',class:'vw-snd-f'+(me?' vw-snd-on':''),'data-key':k,text:baseOf(k),title:relOf(k),disabled:!refOf(k),onclick:function(){playKey(k)}}))});
  folderBox.appendChild(list)}
 function paintHead(info){if(mini){return}top.textContent='';top.appendChild(VIEW.head(item,info||{name:item.name,size:J().size||0,where:J().where},headRows()))}
 function bounds(){var s=S0(),mx=s.maxDistance>0?s.maxDistance*1.25:Math.max(10,(s.minDistance||5)*8);mx=Math.max(10,Math.ceil(mx));distI.setAttribute('max',String(mx));distI.max=String(mx);drawMarks()}
 // ---- audio
 function ctxFor(rate){var A=AC();if(!A)throw new Error(tx('view.sound.noAudio'));
  if(st.ac&&st.acRate===rate)return st.ac;if(st.ac){try{st.ac.close()}catch(e){}st.ac=null}
  try{st.ac=rate?new A({sampleRate:rate}):new A()}catch(e){st.ac=new A()}st.acRate=rate;return st.ac}
 function ac(){return ctxFor(game()?outRate():0)}
 function load(key){if(st.bufs[key])return st.bufs[key];var q=qOf(key);if(!q)return Promise.reject(new Error(tx('view.sound.needMod')));
  var pr=api('/api/x/view/sound/pcm?'+q,undefined,{what:tx('view.sound.job.read')}).then(function(j){var a=ac(),u=VIEW.b64(j.b64);
   if(j.type==='mp3'){var ab=u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength);
    return new Promise(function(res,rej){var r=a.decodeAudioData(ab,function(b){res(b)},function(){rej(new Error(tx('view.sound.mp3Bad')))});if(r&&r.then)r.then(res,function(){rej(new Error(tx('view.sound.mp3Bad')))})})
     .then(function(b){return {key:key,buf:b,peaks:peaksOf(b),j:j}})}
   var b=toBuffer(a,pcmWav(u));return {key:key,buf:b,peaks:peaksOf(b),j:j}});
  st.bufs[key]=pr;st.order.push(key);while(st.order.length>8){var o=st.order.shift();if(o!==key)delete st.bufs[o]}
  pr.then(null,function(){delete st.bufs[key]});return pr}
 // one voice: the game's chain (mono mix for a positioned stereo file, low pass, gain, pan) or the raw file
 function voice(it,when,from,stopAt){var a=ac(),b=it.buf,g=game(),o=calc(b),src=a.createBufferSource(),nodes=[src],out;
  src.buffer=g&&o.positional?monoOf(a,b):b;if(g&&o.rate!==1&&src.playbackRate)src.playbackRate.value=o.rate;src.loop=!!loopC.checked;
  if(!g){src.connect(a.destination);out={src:src,nodes:nodes}}
  else{var last=src,flt=null;
   // the distance low pass (always in the chain of a positioned voice; at the Nyquist frequency it passes all): SNDMATH's cut-off frequency, a 2nd-order Butterworth like lowPassCoefs (WebAudio Q is in dB for a lowpass: -3.0103 dB = 1/sqrt 2)
   if(o.positional){flt=a.createBiquadFilter();flt.type='lowpass';flt.frequency.value=o.hz||a.sampleRate/2;flt.Q.value=-3.0103;last.connect(flt);last=flt;nodes.push(flt)}
   if(o.positional){var gl=a.createGain(),gr=a.createGain(),mg=a.createChannelMerger(2);gl.gain.value=o.channel*o.d3*o.L;gr.gain.value=o.channel*o.d3*o.R;
    last.connect(gl);last.connect(gr);gl.connect(mg,0,0);gr.connect(mg,0,1);mg.connect(a.destination);nodes.push(gl,gr,mg);out={src:src,nodes:nodes,gl:gl,gr:gr,f:flt}}
   else{var gg=a.createGain();gg.gain.value=o.channel;last.connect(gg);gg.connect(a.destination);nodes.push(gg);out={src:src,nodes:nodes,gg:gg}}}
  src.start(when||0,Math.max(0,from||0));if(stopAt)try{src.stop(stopAt)}catch(e){}
  st.voices.push(out);return out}
 function kill(){st.voices.forEach(function(v){try{v.src.onended=null;v.src.stop()}catch(e){}v.nodes.forEach(function(n){try{n.disconnect()}catch(e){}})});st.voices=[]}
 function live(){if(!st.playing||!game())return;var b=st.cur&&st.cur.buf,o=calc(b);
  st.voices.forEach(function(v){if(v.gl){v.gl.gain.value=o.channel*o.d3*o.L;v.gr.gain.value=o.channel*o.d3*o.R}if(v.gg)v.gg.gain.value=o.channel;if(v.f)v.f.frequency.value=o.hz||st.ac.sampleRate/2})}
 function now(){return st.ac?st.ac.currentTime:0}
 function played(){if(!st.playing)return st.off;var t=st.off+(now()-st.t0)*st.rate;if(st.dur>0&&loopC.checked)t=t%st.dur;return Math.min(t,st.dur||t)}
 function tick(){st.timer=null;if(st.gone||st.hid)return;draw();if(st.playing)st.timer=setTimeout(tick,50)}
 function startTimer(){if(!st.timer&&!st.hid)st.timer=setTimeout(tick,50)}
 function stopTimer(){if(st.timer){clearTimeout(st.timer);st.timer=null}}
 function draw(){var t=played();timeL.textContent=tm(t)+' / '+tm(st.dur);if(st.dur>0&&!st.dragging)pos.value=String(Math.round(Math.min(1,t/st.dur)*BAR));paintWave(st.dur>0?t/st.dur:0)}
 function paintWave(at){var c=null;try{c=cv.getContext&&cv.getContext('2d')}catch(e){c=null}if(!c)return;
  var W=+cv.width||COLS,H=+cv.height||72,pk=st.cur&&st.cur.peaks,fg=cssVar(host,'--hint','currentColor'),pr=cssVar(host,'--pri','currentColor'),ln=cssVar(host,'--line','currentColor');
  c.clearRect(0,0,W,H);c.fillStyle=ln;c.fillRect(0,Math.floor(H/2),W,1);if(!pk)return;
  var x0=Math.round(at*W);for(var k=0;k<pk.cols;k++){var x=Math.floor(k*W/pk.cols),w=Math.max(1,Math.floor((k+1)*W/pk.cols)-x),y1=Math.round((1-pk.mx[k])*H/2),y2=Math.round((1-pk.mn[k])*H/2);
   c.fillStyle=x<x0?pr:fg;c.fillRect(x,y1,w,Math.max(1,y2-y1))}
  c.fillStyle=pr;c.fillRect(Math.min(W-1,x0),0,1,H)}
 function setState(p){st.playing=p;playB.textContent=tx(p?'view.sound.stop':'view.sound.play');if(host.classList){if(p)host.classList.add('vw-snd-playing');else host.classList.remove('vw-snd-playing')}}
 function stop(){st.gen++;var was=st.playing;if(was)st.off=played();kill();st.burstEnd=0;setState(false);stopTimer();if(was&&st.dur&&st.off>=st.dur-0.01)st.off=0;draw()}
 function playIt(it,from){kill();stopTimer();var a=ac();try{if(a.resume)a.resume()}catch(e){}
  st.cur=it;st.dur=it.buf.duration;st.off=Math.max(0,Math.min(from||0,st.dur));var o=calc(it.buf);st.rate=game()?o.rate:1;
  var v=voice(it,0,st.off),g=st.gen;st.t0=now();setState(true);
  v.src.onended=function(){if(g!==st.gen||st.gone)return;st.off=0;kill();setState(false);stopTimer();draw()};
  readout();startTimer();draw()}
 function playKey(key,from){var g=++st.gen;say('');return load(key).then(function(it){if(g!==st.gen||st.gone)return;playIt(it,from);if(!mini)drawFolder();pickL.textContent=key!==(item.key||J().soundKey)?tx('view.sound.picked',{f:baseOf(key)}):''},
  function(e){if(g===st.gen&&!st.gone){setState(false);say(e.text||e.message,'err')}})}
 function mainKey(){return item.key||J().soundKey||null}
 function toggle(){if(st.playing){stop();return}if(st.err){say(st.err,'err');return}var k=st.cur?st.cur.key:mainKey();playKey(k,st.cur&&st.cur.key===k?st.off:0)}
 function nextPick(){var bag=J().folder&&J().folder.bag||[];if(!bag.length)return;var k=bag[st.bagI%bag.length],n=st.bagI%bag.length+1;st.bagI++;stop();
  playKey(k,0).then(function(){pickL.textContent=tx('view.sound.bagPick',{f:baseOf(k),n:n,t:bag.length})})}
 // ---- burst: the server runs the voice limits (model limits().simulate); the page plays the shots that survive, cut where cut
 function runBurst(){var ev=Math.max(1,parseInt(everyI.value,10)||67),n=Math.max(1,Math.min(200,parseInt(shotsI.value,10)||20)),q=qOf(mainKey());if(!q)return;
  stop();burstOut.textContent='';burstOut.appendChild(h('div',{class:'hint',text:tx('view.loading')}));var g=st.gen;
  api('/api/x/view/sound/burst?'+q+'&'+VIEW.qs({every:ev,shots:n,folder:bagC.checked?'1':''}),undefined,{what:tx('view.sound.job.read')}).then(function(r){if(g!==st.gen||st.gone)return;
   var keys=[];r.shots.forEach(function(s){if(keys.indexOf(s.key)<0)keys.push(s.key)});
   return Promise.all(keys.slice(0,8).map(load)).then(function(its){if(g!==st.gen||st.gone)return;var by={};its.forEach(function(x){by[x.key]=x});
    drawBurst(r);var a=ac();try{if(a.resume)a.resume()}catch(e){}var base=a.currentTime+0.08,end=0;kill();
    r.shots.forEach(function(s){var it=by[s.key];if(!it||s.result==='rejected'||s.startedAt==null)return;var at=base+s.startedAt/1000,stopAt=s.result==='cut'&&s.endedAt!=null?base+s.endedAt/1000:0;
     voice(it,at,0,stopAt);end=Math.max(end,stopAt||at+it.buf.duration)});
    st.cur=by[keys[0]]||st.cur;st.dur=st.cur?st.cur.buf.duration:0;st.off=0;st.t0=base;st.rate=1;st.burstEnd=end;setState(true);startTimer();
    var gg=st.gen,left=Math.max(0,(end-a.currentTime)*1000)+60;setTimeout(function(){if(gg===st.gen&&!st.gone){kill();setState(false);st.burstEnd=0;st.off=0;draw()}},left)})}).catch(function(e){if(!st.gone){burstOut.textContent='';burstOut.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.text||e.message}))}})}
 function drawBurst(r){burstOut.textContent='';var c={played:0,playing:0,cut:0,rejected:0,pending:0},row=h('div',{class:'vw-snd-shots'});
  r.shots.forEach(function(s){c[s.result]=(c[s.result]||0)+1;var why=s.reason?tx(WHY+s.reason):'';
   row.appendChild(h('span',{class:'vw-snd-shot vw-snd-r-'+s.result,'data-res':s.result,title:tx('view.sound.shotT',{i:s.i+1,t:s.t,f:baseOf(s.key),r:tx(RES+s.result)})+(why?' - '+why:''),text:String(s.i+1)}))});
  burstOut.appendChild(row);
  burstOut.appendChild(h('div',{class:'vw-snd-bsum',text:tx('view.sound.burstSum',{n:r.shots.length,p:(c.played||0)+(c.playing||0),c:c.cut||0,d:(c.rejected||0)+(c.pending||0),m:r.maxCopies,a:r.antiReverbMs})}));
  burstOut.appendChild(h('div',{class:'hint',text:tx('view.sound.burstNote')}))}
 // ---- events
 modeS.addEventListener('change',function(){var was=st.playing,at=played();stop();readout();if(was)playKey(st.cur?st.cur.key:mainKey(),at)});
 [distI,bearI].forEach(function(e){e.addEventListener('input',function(){setDistLabels();readout();live()})});
 ambC.addEventListener('change',function(){var was=st.playing,at=played();if(was){stop();playKey(st.cur?st.cur.key:mainKey(),at)}readout()});
 volS.addEventListener('change',function(){st.vol=volS.value;readout();live()});
 loopC.addEventListener('change',function(){st.voices.forEach(function(v){v.src.loop=!!loopC.checked})});
 durI.addEventListener('change',function(){readout();if(st.playing){var at=played();stop();playKey(st.cur.key,at)}});
 pos.addEventListener('input',function(){st.dragging=true;var t=(+pos.value||0)/BAR*st.dur;timeL.textContent=tm(t)+' / '+tm(st.dur)});
 pos.addEventListener('change',function(){st.dragging=false;var t=(+pos.value||0)/BAR*st.dur;if(st.playing&&st.cur){playIt(st.cur,t)}else{st.off=t;draw()}});
 cv.addEventListener('mousedown',function(e){if(!st.dur||!cv.getBoundingClientRect)return;var r=cv.getBoundingClientRect(),t=Math.max(0,Math.min(1,(e.clientX-r.left)/(r.width||1)))*st.dur;
  if(st.playing&&st.cur)playIt(st.cur,t);else{st.off=t;draw()}});
 host.addEventListener('keydown',function(e){var t=e.target,tag=t&&t.tagName||'';if((e.key===' '||e.key==='Spacebar')&&!/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag)){e.preventDefault();toggle()}});
 // ---- load the plan (the server reads the folder chain and the profile volumes)
 function loadPlan(){var g=st.gen;
  return api('/api/x/view/sound/plan?'+item.q,undefined,{what:tx('view.sound.job.read')}).then(function(j){if(st.gone)return;st.J=j;
   if(!j.header||!j.header.ok){if(!j.media)st.err=tx('view.sound.cannot',{k:j.kind||'?'})}
   if(j.kind==='ogg'||j.kind==='flac')st.err=tx(j.kind==='ogg'?'view.sound.n.OGG_RENAMED':'view.sound.n.FLAC_RENAMED');
   if(j.media){ambC.checked=true;ambC.disabled=true;distI.disabled=true;bearI.disabled=true}
   if(P()&&P().ambient)ambC.checked=true;
   bounds();setDistLabels();readout();drawNotes();drawNames();drawFolder();
   if(st.err)say(st.err,'err');else if(mini&&P())say(tx('view.sound.miniVol',{v:pct(calc(null).channel)}),'hint');
   if(auto&&!st.err&&!st.hid&&!st.playing){auto=false;toggle()}
   if(!mini)VIEW.info(item).then(function(o){if(!st.gone)paintHead(o)},function(){if(!st.gone)paintHead(null)})},
  function(e){if(st.gone)return;st.err=e.text||e.message;top.textContent='';top.appendChild(h('div',{class:'err',text:st.err}));say(st.err,'err')})}
 draw();loadPlan();
 return {close:function(){st.gone=true;stop();stopTimer();if(st.ac){try{st.ac.close()}catch(e){}st.ac=null}st.bufs={};st.order=[]},
  hide:function(){st.hid=true;stop()},
  show:function(){st.hid=false;draw()},
  focus:function(){if(host.focus)host.focus()},
  refresh:function(){stop();st.bufs={};st.order=[];st.cur=null;st.err=null;item._info=null;loadPlan()}}}});
})();
`;
const css = [
  '.vw-snd-top{flex:0 0 auto}',
  '.vw-host[data-kind=sound]{overflow:auto;outline:none}',
  '.vw-snd-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:6px 10px;border-bottom:1px solid var(--line)}',
  '.vw-snd-l{display:inline-flex;align-items:center;gap:4px}',
  '.vw-snd-time{min-width:9em;color:var(--fg)}',
  '.vw-snd-wbox{padding:6px 10px;display:flex;flex-direction:column;gap:2px}',
  '.vw-snd-wave{width:100%;height:72px;display:block;background:var(--card);border:1px solid var(--line);cursor:pointer}',
  '.vw-snd-pos{width:100%}',
  '.vw-snd-3d{padding:4px 10px;display:flex;flex-direction:column;gap:4px}',
  '.vw-snd-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}',
  '.vw-snd-track{position:relative;display:inline-block;width:min(420px,60vw);padding-bottom:14px}.vw-snd-track input{width:100%}',
  '.vw-snd-marks{position:absolute;left:0;right:0;bottom:0;height:14px;font-size:11px;color:var(--hint)}',
  '.vw-snd-mk{position:absolute;transform:translateX(-1px);border-left:1px solid var(--hint);padding-left:3px;white-space:nowrap;line-height:14px}',
  '.vw-snd-dn{min-width:5em;color:var(--hint)}',
  '.vw-snd-rd{padding:4px 10px;font-size:12px;white-space:pre-wrap;color:var(--fg);border-top:1px solid var(--line)}',
  '.vw-snd-msg{padding:0 10px}',
  '.vw-snd-sec{padding:6px 10px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:4px}',
  '.vw-snd-files{display:flex;flex-wrap:wrap;gap:4px;max-height:12em;overflow:auto}',
  '.vw-snd-f{font-size:12px;padding:1px 6px}.vw-snd-on{background:var(--pri);color:var(--prifg)}',
  '.vw-snd-shots{display:flex;flex-wrap:wrap;gap:3px}',
  '.vw-snd-shot{min-width:1.8em;text-align:center;font-size:11px;border:1px solid var(--line);border-radius:3px;padding:0 2px}',
  '.vw-snd-r-played,.vw-snd-r-playing{background:var(--pri);color:var(--prifg)}',
  '.vw-snd-r-cut{background:var(--hit);color:var(--fg)}',
  '.vw-snd-r-rejected,.vw-snd-r-pending{color:var(--hint);text-decoration:line-through}',
  '.vw-snd-n{font-size:12px}.vw-snd-warn b,.vw-snd-error b{color:var(--err)}.vw-snd-info b{color:var(--hint)}',
  '.vw-snd-name{font-size:12px}',
  '.vw-snd-miles{font-size:11px}',
  '.vw-snd-mini{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 0}',
  '.vw-snd-mwave{flex:1 1 160px;min-width:120px}.vw-snd-mini .vw-snd-wave{height:28px}',
  '.vw-snd-minihost{margin:2px 0 4px}.vw-snd-minihost .vw-host{height:auto}',
].join('\n');
module.exports = { script: sndmath() + '\n' + BODY, css, _body: BODY };

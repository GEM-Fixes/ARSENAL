// view kind video, page side (.avi): the facts the game reads (avih size, fps, streams, codec, chunks), the game's verdict in plain
// words with each reason, the sound track played in the page (the joined '01wb' MP3 payload through
// decodeAudioData: play/stop and a time bar; hide() and close() stop it), and the picture: browsers cannot decode MPEG-4 ASP (XVID,
// DIVX), so the page says so and points at "Play in my video player": that button asks first (askDo: the file, its size, the PC's own
// player outside ARSENAL, the temp copy when the file is inside a pak, nothing in the game or mod changed), then POSTs
// /api/x/view/video/play. Not on a phone (RMT / IDE.remote): the button is not drawn there. Frames a browser can draw (MJPG: each frame
// is a JPEG) are shown with a frame slider.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, DOM through h() and textContent, strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-9afcea39)
'use strict';
const script = String.raw`
(function(){
var NS='view.video.';
function tm(s){s=Math.max(0,+s||0);var m=Math.floor(s/60),x=Math.floor(s%60);return m+':'+(x<10?'0':'')+x}
function n1(v){return v==null||!isFinite(v)?'-':(Math.round(v*100)/100).toString()}
VIEW.reg('video',{where:'tab',label:'view.video.label',exts:['avi'],open:function(host,item){
 var st={gone:false,hid:false,ctx:null,buf:null,src:null,t0:0,off:0,playing:false,tmr:null,loading:false,o:null,fgen:0};
 var top=h('div',{class:'vw-vd-top'},[h('div',{class:'hint',text:tx('view.loading')})]);
 var body=h('div',{class:'vw-vd-body'});
 host.appendChild(top);host.appendChild(body);
 var playB=null,bar=null,tl=null,amsg=null,xmsg=null;
 var RM=(typeof RMT!=='undefined'&&!!RMT)||(typeof IDE!=='undefined'&&!!IDE&&!!IDE.remote);
 function row(k,v){return [tx(k),v]}
 function draw(info,o){st.o=o;top.textContent='';var rows=[];
  if(o.avih){rows.push(row('view.video.h.size',o.avih.width+' x '+o.avih.height));rows.push(row('view.video.h.fps',n1(o.fps)));
   rows.push(row('view.video.h.frames',tx('view.video.frames',{a:o.avih.totalFrames,n:o.video?o.video.count:0})));
   rows.push(row('view.video.h.streams',String(o.avih.streams)))}
  if(o.fourcc)rows.push(row('view.video.h.vcodec',o.fourcc));
  var s1=o.streams&&o.streams[1];
  if(s1&&s1.fmt)rows.push(row('view.video.h.acodec',tx('view.video.afmt',{f:s1.fmt.name||('0x'+s1.fmt.tag.toString(16)),c:s1.fmt.channels,r:s1.fmt.rate,k:Math.round(s1.fmt.avgBytes*8/1000)})));
  if(o.dur)rows.push(row('view.video.h.dur',(o.dur.video!=null?tx('view.video.durV',{s:n1(o.dur.video)}):'')+(o.dur.audio!=null?'   '+tx('view.video.durA',{s:n1(o.dur.audio)}):'')+(o.dur.agree===true?'   '+tx('view.video.agree'):o.dur.agree===false?'   '+tx('view.video.differ'):'')));
  if(o.video)rows.push(row('view.video.h.chunks',tx('view.video.chunks',{v:o.video.count,vb:VIEW.size(o.video.bytes),a:o.audio.count,ab:VIEW.size(o.audio.bytes)})+(o.idx1?'   '+tx('view.video.idx1'):'')));
  top.appendChild(VIEW.head(item,info,rows));
  body.textContent='';
  // the verdict: picture and sound, each reason with its engine line
  var vd=o.verdict||{why:[]},card=h('div',{class:'vw-vd-card'});
  function state(k,v){var cls=v==='plays'?'vw-vd-ok':v==='unknown'?'vw-vd-un':'vw-vd-bad';
   card.appendChild(h('div',{class:'vw-vd-st'},[h('span',{class:'vw-vd-k',text:tx(k)}),h('b',{class:cls,text:tx(NS+'s.'+v)})]))}
  state('view.video.v.picture',vd.picture);state('view.video.v.sound',vd.sound);
  var ul=h('ul',{class:'vw-vd-why'});
  (vd.why||[]).concat(o.notes||[]).forEach(function(w){var p=w.p||{},t=tx(NS+'r.'+w.code,p);ul.appendChild(h('li',null,[h('span',{text:t})]))});
  if(ul.children.length)card.appendChild(ul);
  if(vd.picture!=='plays'||vd.sound!=='plays')card.appendChild(h('div',{class:'vw-vd-fix'},[h('span',{class:'hint',text:tx('view.video.fix')}),h('code',{class:'vw-mono',text:'ffmpeg -i in.mp4 -c:v mpeg4 -vtag xvid -pix_fmt yuv420p -c:a libmp3lame -ar 44100 out.avi'})]));
  body.appendChild(card);
  // the sound
  var ab=h('div',{class:'vw-vd-au'});body.appendChild(ab);
  if(o.audio&&o.audio.count){playB=h('button',{type:'button',text:tx('view.video.play'),onclick:toggle});
   bar=h('input',{type:'range',min:'0',max:'1000',value:'0',class:'vw-vd-bar','aria-label':tx('view.video.bar')});
   tl=h('span',{class:'vw-vd-tl vw-mono',text:'0:00'});amsg=h('span',{class:'vw-vd-msg',role:'status'});
   bar.addEventListener('input',seek);bar.addEventListener('change',seek);
   ab.appendChild(h('b',{text:tx('view.video.sound')}));ab.appendChild(playB);ab.appendChild(bar);ab.appendChild(tl);ab.appendChild(amsg)}
  else ab.appendChild(h('span',{class:'hint',text:tx('view.video.noSound')}));
  if(!RM){xmsg=h('span',{class:'vw-vd-msg vw-vd-xmsg',role:'status'});
   ab.appendChild(h('button',{type:'button',class:'primary vw-vd-ext',text:tx('view.video.ext'),title:tx('view.video.extT'),onclick:extPlay}));ab.appendChild(xmsg)}
  // the picture
  var pb=h('div',{class:'vw-vd-pic'});body.appendChild(pb);
  if(!o.video||!o.video.count){pb.appendChild(h('span',{class:'hint',text:tx('view.video.noPic')}));return}
  if(o.browser==='mjpg')frames(pb,o);
  else pb.appendChild(h('span',{class:'hint',text:tx(RM?'view.video.aspPhone':'view.video.asp',{f:o.fourcc||'?',n:o.video.count,w:o.avih.width,h:o.avih.height,fps:n1(o.fps)})}))}
 // play in the PC's own video player: ask first (what, where, that nothing changes), then the server opens it (never on a phone)
 function xsay(s){if(xmsg)xmsg.textContent=s||''}
 function refBody(extra){var b={},r=item.ref||{};['mod','rel','key','idx','path'].forEach(function(k){if(r[k]!=null&&r[k]!=='')b[k]=r[k]});for(var k in extra)b[k]=extra[k];return b}
 function ask(o){if(typeof askDo==='function')return askDo(o);
  var t=[o.title].concat(o.lines);if(o.where)t.push(tx('view.video.ext.where',{p:o.where}));var yes=false;
  try{yes=!!(window.confirm&&window.confirm(t.join(String.fromCharCode(10))))}catch(e){yes=false}return Promise.resolve(yes)}
 function extPlay(){if(st.asking||st.gone)return;st.asking=true;xsay(tx('view.video.ext.checking'));
  api('/api/x/view/video/play',refBody({plan:true})).then(function(p){if(st.gone)return null;xsay('');
   var lines=[tx('view.video.ext.l.file',{n:p.name||item.name,s:VIEW.size(p.size)}),tx('view.video.ext.l.player',{e:VIEW.extOf(p.name||item.name)})];
   if(p.extracted)lines.push(tx(p.inPak?'view.video.ext.l.copy':'view.video.ext.l.copyName',{p:p.inPak||''}));
   lines.push(tx('view.video.ext.l.safe'));
   return ask({title:tx('view.video.ext.title'),lines:lines,where:p.extracted?p.file:'',ok:tx('view.video.ext.ok')})}).then(function(yes){
   if(!yes||st.gone){st.asking=false;return}
   xsay(tx('view.video.ext.opening'));
   return api('/api/x/view/video/play',refBody({}),{what:tx('view.video.job.read')}).then(function(j){st.asking=false;if(st.gone)return;
    xsay(tx(j.extracted?(j.reused?'view.video.ext.openedAgain':'view.video.ext.openedCopy'):'view.video.ext.opened',{n:j.name||item.name}))})}).then(null,function(e){st.asking=false;if(st.gone)return;
   xsay(tx('view.video.ext.fail',{m:e&&(e.text||e.message)||String(e)}))})}
 function frames(pb,o){var img=h('img',{class:'vw-vd-img',alt:''}),lab=h('span',{class:'vw-vd-tl vw-mono'}),msg=h('span',{class:'vw-vd-msg'});
  var sl=h('input',{type:'range',min:'0',max:String(Math.max(0,o.video.count-1)),value:'0',class:'vw-vd-bar','aria-label':tx('view.video.frameBar')});
  function go(){var n=+sl.value||0,g=++st.fgen;lab.textContent=tx('view.video.frame',{n:n+1,c:o.video.count});
   api('/api/x/view/video/frame?'+item.q+'&n='+n,undefined,{job:false}).then(function(j){if(st.gone||g!==st.fgen)return;msg.textContent='';img.setAttribute('src','data:'+j.mime+';base64,'+j.b64)},
    function(e){if(st.gone||g!==st.fgen)return;msg.textContent=tx('view.video.frameFail',{m:e.text||e.message})})}
  sl.addEventListener('change',go);sl.addEventListener('input',go);
  pb.appendChild(h('div',{class:'vw-vd-au'},[sl,lab,msg]));pb.appendChild(img);go()}
 // sound: loaded on the first play, decoded once
 function actx(){var C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!st.ctx){try{st.ctx=new C()}catch(e){return null}}return st.ctx}
 function say(s){if(amsg)amsg.textContent=s||''}
 function dur(){return st.buf?st.buf.duration:0}
 function pos(){return st.playing&&st.ctx?Math.min(dur(),st.ctx.currentTime-st.t0):st.off}
 function ui(){if(!playB)return;playB.textContent=tx(st.playing?'view.video.stop':'view.video.play');var d=dur(),p=pos();
  if(!(st.dragging))bar.value=String(d?Math.round(p/d*1000):0);tl.textContent=tm(p)+' / '+tm(d)}
 function tick(){clearTimeout(st.tmr);if(!st.playing||st.gone)return;ui();st.tmr=setTimeout(tick,250)}
 function load(){if(st.buf)return Promise.resolve(st.buf);var c=actx();if(!c)return Promise.reject(new Error(tx('view.video.noApi')));
  st.loading=true;say(tx('view.video.loadingSound'));
  return api('/api/x/view/video/audio?'+item.q,undefined,{what:tx('view.video.job.read')}).then(function(j){var u=VIEW.b64(j.b64);
   return new Promise(function(res,rej){try{var r=c.decodeAudioData(u.buffer,res,function(e){rej(e||new Error('decode'))});if(r&&r.then)r.then(res,function(e){rej(e||new Error('decode'))})}catch(e){rej(e)}}).then(function(b){st.loading=false;st.buf=b;
    say(j.cut?tx('view.video.cut',{m:VIEW.size(j.bytes),t:VIEW.size(j.total)}):'');return b})},function(e){st.loading=false;throw e})}
 function stopSrc(){if(st.src){var s=st.src;st.src=null;s.onended=null;try{s.stop()}catch(e){}}}
 function play(){if(st.loading)return;load().then(function(b){if(st.gone||st.hid)return;var c=st.ctx;stopSrc();if(st.off>=b.duration)st.off=0;
   var s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.onended=function(){if(st.src!==s)return;st.src=null;st.playing=false;st.off=0;ui()};
   if(c.resume)try{c.resume()}catch(e){}s.start(0,st.off);st.src=s;st.t0=c.currentTime-st.off;st.playing=true;tick();ui()},
  function(e){say(tx('view.video.auFail',{m:e&&(e.text||e.message)||String(e)}))})}
 function stop(){if(st.playing)st.off=pos();stopSrc();st.playing=false;clearTimeout(st.tmr);ui()}
 function toggle(){if(st.playing)stop();else play()}
 function seek(){var d=dur();if(!d){return}st.off=(+bar.value||0)/1000*d;if(st.playing){stopSrc();st.playing=false;play()}else ui()}
 Promise.all([VIEW.info(item),api('/api/x/view/video/info?'+item.q,undefined,{what:tx('view.video.job.read')})]).then(function(a){if(!st.gone)draw(a[0],a[1])},
  function(e){if(st.gone)return;top.textContent='';top.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.text||e.message}))});
 return {close:function(){stop();st.gone=true;if(st.ctx&&st.ctx.close)try{st.ctx.close()}catch(e){}st.ctx=null;st.buf=null},
  hide:function(){st.hid=true;stop()},show:function(){st.hid=false},focus:function(){if(playB&&playB.focus)playB.focus()},
  refresh:function(){stop();st.buf=null;item._info=null;Promise.all([VIEW.info(item),api('/api/x/view/video/info?'+item.q,undefined,{what:tx('view.video.job.read')})]).then(function(a){if(!st.gone)draw(a[0],a[1])},function(e){say(e.text||e.message)})}}}});
})();
`;
const css = [
  '.vw-vd-top{flex:0 0 auto}',
  '.vw-vd-body{flex:1 1 auto;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:10px;min-height:0}',
  '.vw-vd-card{border:1px solid var(--line);background:var(--card);padding:8px 10px;display:flex;flex-direction:column;gap:4px}',
  '.vw-vd-st{display:flex;gap:10px;align-items:baseline}.vw-vd-k{color:var(--hint);min-width:12em}',
  '.vw-vd-ok{color:var(--ok)}.vw-vd-bad{color:var(--err)}.vw-vd-un{color:var(--hint)}',
  '.vw-vd-why{margin:4px 0 0;padding-left:18px;font-size:12px}.vw-vd-why li{margin:2px 0}',
  '.vw-vd-src{color:var(--hint);margin-left:8px;font-size:11px}',
  '.vw-vd-fix{display:flex;flex-direction:column;gap:2px;font-size:12px}.vw-vd-fix code{word-break:break-all}',
  '.vw-vd-au{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
  '.vw-vd-bar{flex:1 1 200px;min-width:120px}',
  '.vw-vd-tl{font-size:12px}.vw-vd-msg{color:var(--hint);font-size:12px}',
  '.vw-vd-xmsg:empty{display:none}',
  '.vw-vd-img{max-width:100%;height:auto;align-self:flex-start;border:1px solid var(--line)}',
].join('\n');
module.exports = { script, css };

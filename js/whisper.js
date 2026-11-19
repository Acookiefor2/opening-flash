/* ---------- Whisper: speech recognition on your own laptop ---------- */
const TJS_URL="https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js";
const WHISPER_MODEL="Xenova/whisper-tiny.en";
const W={
  on:false, ready:false, loading:null, worker:null, mainAsr:null, jobs:new Map(), nextId:1, progress:{},
  sid:0,            // session number: bumped on every start/stop, so a slow startup from an old session can't take over
  prime:null,       // mic + audio grabbed during the Start click, waiting to be adopted by the session (or released)
  stream:null, ctx:null, src:null, proc:null, speaking:false, utt:null, pending:new Map(),
  pendingFor(q){ return (this.pending.get(q)||0)>0; },
};
// inline copy of js/whisper-worker.js, used when the page is opened as a local file
const WORKER_SRC=`
let asr=null;
self.onmessage=async e=>{
  const m=e.data;
  try{
    if(m.type==="load"){
      const T=await import(m.url);
      T.env.allowLocalModels=false;
      asr=await T.pipeline("automatic-speech-recognition", m.model,
        {dtype:"q8", device:"wasm", progress_callback:p=>self.postMessage({type:"progress",p})});
      self.postMessage({type:"ready"});
    } else if(m.type==="run"){
      const out=await asr(m.audio);
      self.postMessage({type:"text", id:m.id, text:(out&&out.text)||""});
    }
  }catch(err){ self.postMessage({type:"error", id:m.id, msg:String((err&&err.message)||err)}); }
};`;
function whisperMsg(t){
  if($("voiceNote") && S.voice==="whisper") $("voiceNote").textContent=t;
  if(W.on) micStatus(t);
}
function onLoadProgress(p){
  if(!p || p.status!=="progress" || !p.file) return;
  W.progress[p.file]=[p.loaded||0, p.total||0];
  let l=0,t=0; for(const [a,b] of Object.values(W.progress)){ l+=a; t+=b; }
  if(t) whisperMsg(`Downloading Whisper model… ${Math.round(l/t*100)}% of ${(t/1e6).toFixed(0)} MB (first time only)`);
}
// the worker died after it was working: fail its jobs and forget it, so the next answer reloads Whisper
function dropWorker(w,why){
  if(W.worker!==w) return;
  vlog("whisper worker crashed: "+why);
  try{ w.terminate(); }catch(_){}
  W.worker=null; W.ready=false; W.loading=null;
  for(const j of W.jobs.values()) j.rej(new Error("Whisper stopped working, reloading it"));
  W.jobs.clear();
}
function whisperLoad(){
  if(W.loading) return W.loading;
  W.loading=new Promise((resolve,reject)=>{
    whisperMsg("Loading Whisper…");
    const done=()=>{ W.ready=true; whisperMsg(W.on?"":"Whisper is ready."); if(W.on) micStatus(`<span class="dot"></span>listening (Whisper)…`); resolve(); };
    async function mainThread(){
      vlog("whisper: main thread");
      try{
        const T=await import(TJS_URL); T.env.allowLocalModels=false;
        W.mainAsr=await T.pipeline("automatic-speech-recognition", WHISPER_MODEL, {dtype:"q8", device:"wasm", progress_callback:onLoadProgress});
        done();
      }catch(err){ reject(err); }
    }
    let w=null;
    // on the website: the real worker file. Opened as a local file: an inline copy (browsers may block that, then main thread)
    try{
      w = location.protocol.startsWith("http")
        ? new Worker("js/whisper-worker.js",{type:"module"})
        : new Worker(URL.createObjectURL(new Blob([WORKER_SRC],{type:"text/javascript"})),{type:"module"});
    }catch(e){ w=null; }
    if(!w) return mainThread();
    let settled=false;
    const fallback=why=>{ if(settled) return; settled=true; vlog("whisper worker failed: "+why); try{w.terminate();}catch(_){} mainThread(); };
    w.onerror=e=>{ e.preventDefault&&e.preventDefault(); if(!settled) fallback(e.message||"error"); else dropWorker(w,e.message||"error"); };
    w.onmessage=e=>{
      const m=e.data;
      if(m.type==="progress") onLoadProgress(m.p);
      else if(m.type==="ready"){ settled=true; W.worker=w; vlog("whisper: worker ready"); done(); }
      else if(m.type==="text"||m.type==="error"){
        const j=W.jobs.get(m.id);
        if(j){ W.jobs.delete(m.id); m.type==="text" ? j.res(m.text) : j.rej(new Error(m.msg)); }
        else if(m.type==="error"){ if(!settled) fallback(m.msg); else dropWorker(w,m.msg); }
      }
    };
    w.postMessage({type:"load", url:TJS_URL, model:WHISPER_MODEL});
  });
  W.loading.catch(err=>{ W.loading=null; whisperMsg(`⚠ Couldn't load Whisper (${err.message}). It needs internet the first time.`); });
  return W.loading;
}
async function whisperTranscribe(audio){
  if(!W.worker && !W.mainAsr) await whisperLoad();   // e.g. after the worker crashed
  if(W.worker){
    const w=W.worker;
    return new Promise((res,rej)=>{
      const id=W.nextId++; W.jobs.set(id,{res,rej});
      try{ w.postMessage({type:"run",id,audio},[audio.buffer]); }
      catch(err){ W.jobs.delete(id); dropWorker(w,err.message); rej(err); }
    });
  }
  const o=await W.mainAsr(audio); return (o&&o.text)||"";
}
// Whisper wants 16 kHz audio; mics usually give 44.1 or 48 kHz
function resampleTo16k(x,sr){
  if(sr===16000) return x;
  const r=sr/16000, n=Math.floor(x.length/r), out=new Float32Array(n);
  for(let i=0;i<n;i++){ const a=Math.floor(i*r), b=Math.min(x.length,Math.floor((i+1)*r)); let s=0; for(let j=a;j<b;j++) s+=x[j]; out[i]=s/Math.max(1,b-a); }
  return out;
}
// Whisper sometimes "hears" stock phrases in silence or noise
function cleanWhisper(t){
  t=(t||"").replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g," ").replace(/\s+/g," ").trim();
  if(/^(thank you|thanks for watching|thank you for watching|you|bye|okay)[.!?]*$/i.test(t)) return "";
  return t;
}
const stopTracks=s=>{ if(s) s.getTracks().forEach(t=>t.stop()); };
const closeCtx=c=>{ if(c && c.state!=="closed") try{ c.close(); }catch(_){} };
async function whisperStart(){
  const sid=++W.sid;               // this startup; if anything stops or restarts Whisper meanwhile, sid goes stale
  W.on=true;
  const prime=W.prime; W.prime=null;                  // this session now owns the primed mic + audio
  const giveUp=(stream,ctx)=>{ stopTracks(stream); closeCtx(ctx); if(prime){ prime.streamP&&prime.streamP.then(stopTracks,()=>{}); closeCtx(prime.ctx); } };
  try{ await whisperLoad(); }
  catch(err){ giveUp(); if(sid===W.sid){ W.on=false; micStatus(`⚠ Couldn't load Whisper (${err.message}). It needs internet the first time.`); } return; }
  if(sid!==W.sid) return giveUp();
  let stream;
  try{ stream=await ((prime&&prime.streamP)||getMic()); }
  catch(err){ giveUp(); if(sid===W.sid){ W.on=false; micStatus(`⚠ Mic blocked or not found (${err.name}). Allow microphone access, then press Start again.`); } return; }
  if(sid!==W.sid) return giveUp(stream);
  let ctx=prime&&prime.ctx;
  if(!ctx || ctx.state==="closed") ctx=new (window.AudioContext||window.webkitAudioContext)();
  try{ await ctx.resume(); }catch(_){}
  if(sid!==W.sid) return giveUp(stream,ctx);
  // still the current session: publish it
  W.stream=stream; W.ctx=ctx;
  W.src=ctx.createMediaStreamSource(stream);
  W.proc=ctx.createScriptProcessor(2048,1,1);
  W.src.connect(W.proc); W.proc.connect(ctx.destination);   // output stays silent; needed so the processor runs
  const sr=ctx.sampleRate, frameMs=2048/sr*1000, preFrames=Math.ceil(300/frameMs);
  let noise=0.004, buf=[], pre=[], silentMs=0, speechMs=0;
  W.frames=0; W.level=0; W.thr=0.006;
  clearInterval(W.meter); W.meter=setInterval(showMeter,200);
  W.proc.onaudioprocess=e=>{
    if(!W.on || sid!==W.sid) return;
    const x=e.inputBuffer.getChannelData(0);
    let sum=0; for(let i=0;i<x.length;i++) sum+=x[i]*x[i];
    const rms=Math.sqrt(sum/x.length), chunk=new Float32Array(x);
    const thr=Math.max(0.006, noise*2.5);                  // "loud enough to be speech", adapts to room noise
    W.frames++; W.level=Math.max(rms, W.level*0.85); W.thr=thr;
    if(!W.speaking){
      pre.push(chunk); if(pre.length>preFrames) pre.shift();  // keep a bit from just before you started
      if(rms>thr){
        W.speaking=true; buf=pre.slice(); pre=[]; silentMs=0; speechMs=frameMs;
        // remember what you were doing when you STARTED talking: answering this question before the
        // deadline, or saying "next" after it was marked. Late results are judged by this, not by what's on screen now.
        W.utt={q:qSeq, kind: answering() ? "answer" : state==="done" ? "command" : "none"};
        micStatus(`<span class="dot"></span>hearing you…`);
      } else noise=noise*0.95+rms*0.05;
    } else {
      buf.push(chunk);
      if(rms>thr){ silentMs=0; speechMs+=frameMs; } else silentMs+=frameMs;
      if(silentMs>=400 || buf.length*frameMs>6000){         // you stopped talking (or 6 s max)
        W.speaking=false;
        const end=performance.now()-silentMs;
        if(speechMs>=120 && W.utt.kind!=="none") whisperRun(buf, sr, W.utt, end);
        else micStatus(`<span class="dot"></span>listening (Whisper)…`);
        buf=[];
      }
    }
  };
  micStatus(`<span class="dot"></span>listening (Whisper)…`);
}
// is Whisper still working on an answer you started before time ran out?
function whisperPending(){ return W.on && ((W.speaking && W.utt && W.utt.kind==="answer" && W.utt.q===qSeq) || W.pendingFor(qSeq)); }
function whisperRun(chunks, sr, utt, endTime){
  const n=chunks.reduce((a,c)=>a+c.length,0), all=new Float32Array(n); let o=0;
  for(const c of chunks){ all.set(c,o); o+=c.length; }
  const audio=resampleTo16k(all,sr), sid=W.sid;
  if(utt.kind==="answer") W.pending.set(utt.q,(W.pending.get(utt.q)||0)+1);
  micStatus(`<span class="dot"></span>understanding…`);
  const t0w=performance.now();
  whisperTranscribe(audio).then(raw=>{
    const text=cleanWhisper(raw);
    vlog(`whisper ${Math.round(performance.now()-t0w)}ms "${(raw||"").trim().slice(0,30)}"`);
    if(!W.on || sid!==W.sid) return;
    micStatus(text?`<span class="dot"></span>heard: <span class="heard">${text.replace(/</g,"&lt;")}</span>`:`<span class="dot"></span>listening (Whisper)…`);
    if(!text || utt.q!==qSeq) return;                                  // belongs to a question that's gone
    if(utt.kind==="answer" && (state==="play"||state==="grace")){
      $("ans").value=text; answerAt=endTime; voiceAnswer(text); answerAt=0;
    } else if(utt.kind==="command" && state==="done" && /\b(next|go|skip)\b/i.test(text)) nextQ();
  }).catch(err=>{ vlog("whisper error: "+err.message); }).finally(()=>{
    if(utt.kind!=="answer") return;
    W.pending.set(utt.q,(W.pending.get(utt.q)||1)-1);
    if(state==="grace" && utt.q===qSeq && !whisperPending()) finish(gotHalf?"half":"bad");
  });
}
let micId=(()=>{ try{ return localStorage.getItem("micId")||""; }catch(_){ return ""; } })();
function getMic(){
  const a={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
  if(micId) a.deviceId={exact:micId};
  return navigator.mediaDevices.getUserMedia({audio:a}).catch(err=>{
    if(micId && (err.name==="OverconstrainedError"||err.name==="NotFoundError")){ micId=""; return getMic(); }   // saved mic is gone, use default
    throw err;
  });
}
// the mic list + live test on the start screen. Each request gets a number; if you switch away
// (or ask again) before it finishes, the old request releases whatever it opened instead of starting a test.
let fillGen=0, testGen=0, mt=null;
const micUIWanted=()=> S.voice==="whisper" && S.mode==="name" && currentPage==="flash" && $("start").classList.contains("on");
// list the microphones (names only show up after you've allowed mic access once)
async function fillMics(){
  const g=++fillGen, sel=$("micSel");
  try{
    let devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput");
    if(devs.length && !devs[0].label){ const st=await getMic(); stopTracks(st); devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"); }
    if(g!==fillGen || !micUIWanted()) return;
    sel.innerHTML=devs.map(d=>`<option value="${d.deviceId}">${(d.label||"Microphone").replace(/</g,"&lt;")}${d.deviceId==="default"?" (Windows default)":""}</option>`).join("");
    if(micId && devs.some(d=>d.deviceId===micId)) sel.value=micId; else micId=sel.value||"";
    sel.onchange=()=>{ micId=sel.value; try{ localStorage.setItem("micId",micId); }catch(_){} startMicTest(); };
    startMicTest();
  }catch(err){ if(g===fillGen) $("micTest").textContent=`⚠ Couldn't open the mic (${err.name}). Allow microphone access for this page.`; }
}
// live test on the start screen: talk and watch the bar
async function startMicTest(){
  stopMicTest();
  const g=++testGen, el=$("micTest");
  let stream=null, ctx=null;
  try{
    stream=await getMic();
    if(g!==testGen || !micUIWanted()){ stopTracks(stream); return; }
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    const an=ctx.createAnalyser(); an.fftSize=2048; ctx.createMediaStreamSource(stream).connect(an);
    const data=new Float32Array(an.fftSize), tr=stream.getAudioTracks()[0];
    let peak=0;
    mt={stream,ctx,timer:setInterval(()=>{
      if(ctx.state!=="running"){ el.textContent="⚠ audio is switched off: click anywhere on the page"; ctx.resume().catch(()=>{}); return; }
      an.getFloatTimeDomainData(data); let s=0; for(const v of data) s+=v*v; const rms=Math.sqrt(s/data.length);
      peak=Math.max(rms,peak*0.85);
      const n=Math.min(20,Math.round(peak/0.006*10));
      el.textContent=`mic test: [${"█".repeat(n)}${"·".repeat(20-n)}] ${peak.toFixed(3)}  ${tr.muted?"⚠ this mic is MUTED":""}${peak===0?"  ⚠ pure silence: try another mic in the list":"  talk: the bar should jump past the middle"}`;
    },150)};
  }catch(err){ stopTracks(stream); closeCtx(ctx); if(g===testGen) el.textContent=`⚠ Couldn't open this mic (${err.name}).`; }
}
function stopMicTest(){
  fillGen++; testGen++;              // cancel any list/test request still waiting on the browser
  if(mt){ clearInterval(mt.timer); stopTracks(mt.stream); closeCtx(mt.ctx); mt=null; }
}
// called synchronously inside the Start click: browsers only switch audio on in response to a click
function whisperPrime(){
  releasePrime();
  const p={ctx:null, streamP:null};
  try{ p.ctx=new (window.AudioContext||window.webkitAudioContext)(); p.ctx.resume().catch(()=>{}); }catch(_){}
  try{ p.streamP=getMic(); p.streamP.catch(()=>{}); }catch(_){}
  W.prime=p;
}
// a primed mic that no session took (load failed, you left, you changed your mind): switch it off
function releasePrime(){
  const p=W.prime; W.prime=null; if(!p) return;
  if(p.streamP) p.streamP.then(stopTracks,()=>{});
  closeCtx(p.ctx);
}
// backup: if the browser still has audio switched off, any click or key switches it on
["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev,()=>{ if(W.ctx && W.ctx.state==="suspended") W.ctx.resume().catch(()=>{}); },true));
// live audio meter, so you can see whether sound is reaching Whisper
function showMeter(){
  const el=$("alvl"); if(!el) return;
  if(!W.on || !W.ctx){ el.textContent=""; return; }
  const st=W.ctx.state;
  if(st!=="running"){ el.textContent=`⚠ audio is ${st}: click anywhere on the page to switch it on`; voiceTrouble(true); return; }
  if(!W.frames){ el.textContent="⚠ no sound arriving from the mic yet"; return; }
  const tr=W.stream&&W.stream.getAudioTracks()[0], name=tr?tr.label:"?";
  if(W.level===0 && W.frames>20){ el.textContent=`⚠ pure silence from "${name}"${tr&&tr.muted?" (MUTED)":""}. Pick another mic on the start screen.`; voiceTrouble(true); return; }
  if(W.level>0) voiceTrouble(false);
  const n=Math.min(20,Math.round(W.level/Math.max(W.thr,1e-6)*10));
  el.textContent=`mic level [${"█".repeat(n)}${"·".repeat(20-n)}] ${W.level.toFixed(3)} (speech counts above ${W.thr.toFixed(3)}, the middle of the bar)`;
}
function whisperStop(){
  W.sid++;                           // any startup still waiting is now stale and will clean up after itself
  releasePrime();
  clearInterval(W.meter); if($("alvl")) $("alvl").textContent="";
  W.on=false; W.speaking=false; W.utt=null; W.pending.clear();
  try{ W.proc&&W.proc.disconnect(); W.src&&W.src.disconnect(); }catch(_){}
  stopTracks(W.stream); closeCtx(W.ctx);
  W.stream=W.ctx=W.src=W.proc=null;
}

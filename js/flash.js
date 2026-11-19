/* ---------- Flash: the main game. Two challenges: "Name it" and "Rebuild it" ---------- */
const $=id=>document.getElementById(id);
function moveText(m){ return moveListHTML(m); }

/* ---------- settings ---------- */
const S={mode:"name",set:"popular",time:10,pool:"all",len:25,voice:"off"};
function seg(id,key){
  const btns=[...$(id).querySelectorAll("button")];
  btns.forEach(b=>b.setAttribute("aria-pressed", b.classList.contains("sel")?"true":"false"));   // screen readers: which one is on
  btns.forEach(b=>b.onclick=()=>{
    btns.forEach(x=>{ x.classList.toggle("sel",x===b); x.setAttribute("aria-pressed",x===b?"true":"false"); }); S[key]= ["pool","voice","mode","set"].includes(key) ? b.dataset.v : +b.dataset.v;
    if(key==="voice") voiceChosen();
    if(key==="set") setChosen();
    if(key==="mode") modeChosen();
  });
}
seg("segMode","mode"); seg("segSet","set"); seg("segTime","time"); seg("segPool","pool"); seg("segLen","len"); seg("segVoice","voice");
function showCounts(set){
  $("cMain").textContent=set.list.filter(o=>o.name===o.family).length.toLocaleString();
  $("cAll").textContent=set.list.length.toLocaleString();
}
showCounts(getSet("popular"));
let setGen=0;
function setChosen(){
  const g=++setGen, want=S.set;
  $("setNote").textContent = want==="lichess" ? "Loading the Lichess openings…" : "";
  ensureSet(want).then(set=>{ if(g!==setGen) return; showCounts(set);
    $("setNote").textContent = S.set==="lichess" ? "Full names from the Lichess database. Naming a shorter part of the name (like \"Najdorf\" for \"Najdorf Variation, English Attack\") gets half a point." : "";
  }).catch(err=>{ if(g===setGen) $("setNote").textContent="⚠ "+err.message+". Check your internet connection."; });
}
const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
if(!SR){ $("vBrowser").disabled=true; $("vBrowser").title="Not supported in this browser"; $("vBrowser").style.opacity=.4; }
const VOICE_NOTES={
  off:"Type your answers.",
  browser:"Uses your browser's speech service (Chrome/Edge). Instant, but needs internet and some browsers send back nothing.",
  whisper:"Runs a speech model on your own laptop. ~40 MB download the first time, then cached. Takes about 1–2 s to understand you; if you START speaking before the timer ends, it waits for Whisper.",
};
function voiceChosen(){
  $("voiceNote").textContent=VOICE_NOTES[S.voice];
  $("micRow").style.display = S.voice==="whisper" ? "block" : "none";
  if(S.voice==="whisper") fillMics(); else stopMicTest();
  if(S.voice==="whisper") whisperLoad().catch(()=>{});   // start downloading the model right away
}
const MODE_TEXT={
  name:["Name that opening",`A position flashes up. Type or say the opening's name before the timer runs out.
    No opening comes up twice in a run. Naming only the family ("Sicilian" when it's the Najdorf) gets half a point.`,"Time limit"],
  rebuild:["Rebuild that opening",`You see an opening's name, position and moves for the time you pick. Then the board resets and you
    play the whole line from memory, both White and Black, in the exact order. Each move you get right first try (no mistake, hint or
    "show move") scores a share of the point.`,"Time to memorize"],
};
function modeChosen(){
  const [h,p,t]=MODE_TEXT[S.mode];
  $("startTitle").textContent=h; $("startText").textContent=p; $("timeLabel").textContent=t;
  $("voiceRow").style.display = S.mode==="name" ? "" : "none";
  $("flashOpt").style.display = S.mode==="name" ? "" : "none";
  if(S.mode!=="name") stopMicTest(); else if(S.voice==="whisper") startMicTest();
}

/* ---------- game state ---------- */
let deck=[], idx=0, cur=null, state="idle", t0=0, raf=0, deadline=0;
let score=0, streak=0, bestStreak=0, nGood=0, nHalf=0, times=[], review=[], bestTry="", gotHalf=false;
let rec=null, speaking=false, graceTimer=0;
let qSeq=0, answerAt=0;   // qSeq: which question is on screen; answerAt: when a voice answer was actually spoken
let runMode="name", rbs=null, rbStats={};   // rbs: the current rebuild session in "Rebuild it"
// R: the settings of the run being played (a snapshot, or a daily / challenge preset). marks: one result per opening, for sharing
let R={kind:"free", mode:"name", set:"popular", pool:"all", time:10, len:25, flash:false, moves:true, seed:""}, marks=[];
let pendingChallenge=null;     // a challenge link that was opened, waiting for you to press Play

const flashBoard=new ChessBoard($("board"));
const rBoard=new ChessBoard($("rboard"));
function drawBoard(fen,last){ flashBoard.set(fen,{last}); }

function show(id){ document.querySelectorAll("#page-flash .screen").forEach(s=>s.classList.toggle("on",s.id===id)); }
function updStats(){ $("sScore").textContent=score%1?score.toFixed(1).replace(/\.0$/,""):score; $("sStreak").textContent=streak; $("sLeft").textContent=deck.length-idx; }
const fmtScore=x=>(Math.round(x*10)/10).toString();

$("btnStart").onclick=()=>startRun();
$("btnAgain").onclick=()=>{ show("start"); $("stats").style.display="none"; if(S.mode==="name" && S.voice==="whisper") startMicTest(); };
let startGen=0;
function startRun(preset){
  const g=++startGen;
  // the settings as they were when you clicked (or the daily / challenge preset). Voice is always yours.
  const opts = preset ? {...preset, voice:S.voice}
    : {kind:"free", mode:S.mode, voice:S.voice, set:S.set, pool:S.pool, len:S.len, time:S.time,
       flash:$("optFlash").checked, moves:$("optMoves").checked, seed:newSeed()};
  if(opts.kind==="daily"){ if(dailyResult(opts.day)) return showDaily(); store.set("daily:"+opts.day,{started:true}); }   // one try a day
  stopVoice(); whisperStop(); stopMicTest();
  if(opts.mode==="name" && opts.voice==="whisper") whisperPrime();   // must happen inside this click, or the browser keeps audio switched off
  const btn=$("btnStart"); btn.disabled=true;
  ensureSet(opts.set).then(set=>{
    btn.disabled=false;
    if(g!==startGen || currentPage!=="flash"){ whisperStop(); return; }   // you left or started again: release the mic
    beginRun(set,opts);
  }).catch(err=>{ btn.disabled=false; whisperStop(); if(g===startGen) $("setNote").textContent="⚠ "+err.message+". Check your internet connection."; });
}
function beginRun(set,opts){
  let pool = opts.pool==="main" ? set.list.filter(o=>o.name===o.family) : set.list.slice();
  // Name it: Lichess uses some names for several lines; ask each name only once
  if(opts.mode==="name"){ const seenN=new Set(); pool=pool.filter(o=>!seenN.has(o.nkey) && seenN.add(o.nkey)); }
  deck = shuffleWith(pool, seededRandom(opts.seed)); if(opts.len && opts.len<deck.length) deck=deck.slice(0,opts.len);   // same seed, same openings
  R={...opts}; delete R.voice; marks=[];
  idx=0; score=0; streak=0; bestStreak=0; nGood=0; nHalf=0; times=[]; review=[];
  SFX.start(); countRun(); voiceTrouble(false);
  rbStats={perfect:0, firstTry:0, total:0, hints:0, mistakes:0};
  runMode=opts.mode;
  $("stats").style.display="flex";
  if(runMode==="rebuild"){ show("rgame"); return nextR(); }
  show("game");
  if(opts.voice==="browser") startVoice(); else if(opts.voice==="whisper") whisperStart();
  nextQ();
}
// leave a run cleanly (used when you switch to Study/Rebuild in the top bar)
function abortRun(){
  startGen++;                          // cancels a run that's still loading
  if(state==="idle"){ whisperStop(); return; }
  state="idle"; cancelAnimationFrame(raf); clearTimeout(graceTimer);
  stopVoice(); whisperStop(); rbs=null; rBoard.setInteractive(false);
  show("start"); $("stats").style.display="none";
}

/* ---------- "Name it" ---------- */
function nextQ(){
  clearTimeout(graceTimer);
  if(idx>=deck.length) return endRun();
  cur=deck[idx]; bestTry=""; gotHalf=false; qSeq++; resetHeard();
  drawBoard(cur.fen, cur.last);
  $("board").classList.remove("hidden");
  const mv=$("moves"); mv.innerHTML=moveText(cur.moves); mv.classList.toggle("hide",!R.moves);
  $("verdict").className="verdict"; $("verdict").innerHTML=""; clearBigVerdict($("board")); lastTick=99;
  const a=$("ans"); a.value=""; a.disabled=false; a.focus();
  $("qNum").textContent=`${idx+1} / ${deck.length}`;
  updStats();
  state="play"; t0=performance.now(); deadline=t0+R.time*1000;
  cancelAnimationFrame(raf); tick();
}
function setBar(barId,labelId,left){
  const frac=left/(R.time*1000), bar=$(barId);
  bar.style.transform=`scaleX(${frac})`;
  bar.style.background= frac>.5?"var(--good)":frac>.2?"var(--warn)":"var(--bad)";
  $(labelId).textContent=(left/1000).toFixed(1)+"s";
  return frac;
}
let lastTick=99;
function tick(){
  const left=Math.max(0,deadline-performance.now());
  const frac=setBar("bar","tLeft",left);
  if(R.flash && frac<.5) $("board").classList.add("hidden");
  // last 3 seconds tick (only if the timer is long enough for that to mean something)
  const secs=Math.ceil(left/1000); if(state==="play" && R.time>=5 && secs<=3 && secs>0 && secs<lastTick){ lastTick=secs; SFX.tick(); }
  if(state!=="play") return;
  if(left<=0){
    // browser voice: you started talking in time and it hasn't sent the final words yet
    if(browserVoicePending()){ state="grace"; graceTimer=setTimeout(()=>{ if(state==="grace") finish(gotHalf?"half":"bad"); },1500); return; }
    // Whisper: you started talking in time, so wait for it to finish understanding you
    if(whisperPending()){ state="grace"; micStatus(`<span class="dot"></span>time's up, finishing what you said…`);
      graceTimer=setTimeout(()=>{ if(state==="grace") finish(gotHalf?"half":"bad"); },8000); return; }
    return finish(gotHalf?"half":"bad");
  }
  raf=requestAnimationFrame(tick);
}
function tryAnswer(text, fromVoice){
  if(state!=="play" && state!=="grace") return false;
  const v=judge(text,cur);
  if(v==="good"){ finish("good"); return true; }
  if(v==="half" && !gotHalf){ gotHalf=true; bestTry=text;
    $("verdict").className="verdict on half"; $("verdict").innerHTML=`Right family, which variation?`; }
  else if(!fromVoice && v!=="half"){ bestTry=bestTry||text; }
  if(!fromVoice){ const a=$("ans"); a.classList.remove("shake"); void a.offsetWidth; a.classList.add("shake"); a.select(); }
  return false;
}
// spoken answers (browser voice and Whisper): "not Caro-Kann" must never count as Caro-Kann,
// so remove negated parts before trying the last few words on their own
function voiceAnswer(text){
  const w=stripNegation(text).trim().split(/\s+/).filter(Boolean);
  for(let k=Math.min(w.length,6);k>=1;k--){ if(tryAnswer(w.slice(-k).join(" "),true)) return true; }
  return false;
}
$("ans").addEventListener("keydown",e=>{
  if(e.key==="Enter"){ e.preventDefault();
    // typed answers must be in before the timer runs out (the grace period is only for voice)
    if(state==="play" && performance.now()<deadline){ if(e.target.value.trim()) tryAnswer(e.target.value,false); }
    else if(state==="done") nextQ();
  }
});
$("btnSkip").onclick=()=>{ if(state==="play"||state==="grace") finish(gotHalf?"half":"bad",true); else if(state==="done") nextQ(); };
$("btnQuit").onclick=()=>{ state="idle"; cancelAnimationFrame(raf); endRun(); };

function finish(res, gaveUp){
  if(state==="done") return;
  state="done"; cancelAnimationFrame(raf); clearTimeout(graceTimer);
  const took=((answerAt||performance.now())-t0)/1000;
  $("board").classList.remove("hidden");
  $("moves").classList.remove("hide");
  const typed=$("ans").value.trim();
  $("ans").disabled=true;
  const v=$("verdict");
  const mv=`<div class="mv">${cur.moves.join(" ")}</div>`;
  if(res==="good"){
    score+=1; nGood++; streak++; bestStreak=Math.max(bestStreak,streak); times.push(took); marks.push("good");
    v.className="verdict on good"; v.innerHTML=`Correct in ${took.toFixed(2)}s<b>${cur.name}</b>${mv}`;
    SFX.good(); bigVerdict($("board"),"good",cur.name,`${took.toFixed(2)}s`);
  }else if(res==="half"){
    score+=.5; nHalf++; streak=0; marks.push("half");
    v.className="verdict on half"; v.innerHTML=`Half point. On the right track, but it was<b>${cur.name}</b>${mv}`;
    SFX.half(); bigVerdict($("board"),"half",cur.name,"half point");
    review.push({o:cur,you:bestTry});
  }else{
    streak=0; marks.push("bad");
    v.className="verdict on bad"; v.innerHTML=`${gaveUp?"Skipped":"Time's up"}. It was<b>${cur.name}</b>${mv}`;
    SFX.bad(); bigVerdict($("board"),"bad",cur.name,gaveUp?"skipped":"time's up");
    review.push({o:cur,you:bestTry||typed});
  }
  idx++; updStats();
  setTimeout(()=>{ $("ans").blur(); },0);
}

/* ---------- "Rebuild it" ---------- */
// phase 1: memorize (name + position + moves, timer). phase 2: rebuild from the starting position.
function nextR(){
  if(idx>=deck.length) return endRun();
  cur=deck[idx]; rbs=null;
  $("rName").textContent=cur.name;
  $("rPhase").textContent="Memorize this line";
  $("rqNum").textContent=`${idx+1} / ${deck.length}`;
  rBoard.setInteractive(false);
  rBoard.set(cur.fen,{last:cur.last});
  const mv=$("rMoves"); mv.innerHTML=moveText(cur.moves); mv.classList.toggle("hide",!R.moves);
  clearBigVerdict($("rboard"));
  $("rMem").style.display=""; $("rPlay").style.display="none"; $("rNext").style.display="none";
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();   // a hidden button mustn't keep the keyboard
  $("rTimer").style.visibility="visible";
  updStats();
  state="memorize"; t0=performance.now(); deadline=t0+R.time*1000;
  cancelAnimationFrame(raf); tickR();
}
function tickR(){
  if(state!=="memorize") return;
  const left=Math.max(0,deadline-performance.now());
  setBar("rbar","rtLeft",left);
  if(left<=0) return startRebuildPhase();
  raf=requestAnimationFrame(tickR);
}
function startRebuildPhase(){
  if(state!=="memorize") return;
  cancelAnimationFrame(raf);
  state="rebuild";
  $("rPhase").textContent="Now play it from the start";
  $("rMem").style.display="none"; $("rPlay").style.display="";
  $("rTimer").style.visibility="hidden";
  rbs=new RebuildSession(rBoard,cur,{
    onUpdate:(s,why)=>updateRebuildPanel("fr",s,why),
    onDone:s=>finishR(s),
  });
  rbs.start();
}
function finishR(s){
  state="done";
  const pts=s.firstTry/s.n;
  marks.push(pts);
  if(s.perfect){ SFX.perfect(); bigVerdict($("rboard"),"perfect","Perfect!",`all ${s.n} moves`); }
  else { (pts>=.5?SFX.half:SFX.bad)(); bigVerdict($("rboard"),pts>=.5?"half":"bad",`${s.firstTry}/${s.n} moves`,s.gaveUp?"gave up":"first try"); }
  score+=pts; rbStats.firstTry+=s.firstTry; rbStats.total+=s.n; rbStats.hints+=s.hints; rbStats.mistakes+=s.mistakes;
  if(s.perfect){ rbStats.perfect++; streak++; bestStreak=Math.max(bestStreak,streak); }
  else { streak=0; review.push({o:cur, rb:`${s.firstTry}/${s.n} moves first try${s.gaveUp?" (gave up)":""}`}); }
  $("rNext").style.display="";
  idx++; updStats();
  $("rNextBtn").focus();              // Space / Enter now press "Next"
}
$("rReady").onclick=()=>startRebuildPhase();
$("rNextBtn").onclick=()=>nextR();
$("rQuit").onclick=()=>{ state="idle"; cancelAnimationFrame(raf); rbs=null; rBoard.setInteractive(false); endRun(); };
bindRebuildPanel("fr",()=>rbs);

/* ---------- keyboard for both challenges ---------- */
// is the key going to a button, link, list or menu that should handle it itself?
function ownsKey(e){ return (e.key==="Enter"||e.key===" ") && e.target.closest && e.target.closest("button:not(:disabled),a,select,textarea,[role=button],input:not(#ans)"); }
document.addEventListener("keydown",e=>{
  if(currentPage!=="flash" || e.target.tagName==="INPUT" && e.target!==$("ans")) return;
  if(ownsKey(e)) return;
  if($("game").classList.contains("on")){
    if(e.key==="Escape" && (state==="play"||state==="grace")) finish(gotHalf?"half":"bad", true);
    else if(state==="done" && (e.key===" "||e.key==="Enter") && document.activeElement!==$("ans")){ e.preventDefault(); nextQ(); }
  } else if($("rgame").classList.contains("on")){
    if(state==="memorize" && (e.key===" "||e.key==="Enter")){ e.preventDefault(); startRebuildPhase(); }
    else if(state==="rebuild" && rbs){ if(e.key==="h"||e.key==="H") rbs.hint(); else if(e.key==="s"||e.key==="S") rbs.show(); }
    else if(state==="done" && (e.key===" "||e.key==="Enter")){ e.preventDefault(); nextR(); }
  }
});

/* ---------- results ---------- */
function endRun(){
  stopVoice(); whisperStop(); state="idle";
  show("results");
  const played=Math.min(idx,deck.length);
  // openings you never got to count as misses in the share grid
  while(marks.length<deck.length) marks.push(R.mode==="rebuild"?0:"bad");
  const result={score, marks:marks.slice(), avg: times.length? times.reduce((a,b)=>a+b,0)/times.length : 0};
  if(R.kind==="daily") store.set("daily:"+R.day, result);
  showShare(R, result);
  renderDailyCard();
  const big=$("rBig"), m=$("missed");
  if(runMode==="rebuild"){
    const pct=rbStats.total?Math.round(rbStats.firstTry/rbStats.total*100):0;
    big.innerHTML=`<div>Score<b>${fmtScore(score)} / ${played}</b></div><div>Perfect lines<b>${rbStats.perfect}</b></div>
      <div>Moves first try<b>${pct}%</b></div><div>Hints<b>${rbStats.hints}</b></div><div>Best streak<b>${bestStreak}</b></div>`;
    m.innerHTML = review.length ? review.map(r=>`<div><b>${r.o.name}</b><div class="mv">${r.o.moves.join(" ")}</div><div class="you">${r.rb}</div></div>`).join("")
      : `<div style="color:var(--good)">Every line perfect. Try a shorter memorize time.</div>`;
    return;
  }
  big.innerHTML=`<div>Score<b>${fmtScore(score)} / ${played}</b></div><div>Correct<b>${nGood}</b></div><div>Half<b>${nHalf}</b></div>
    <div>Best streak<b>${bestStreak}</b></div><div>Avg answer time<b>${times.length?(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2)+"s":"–"}</b></div>`;
  m.innerHTML = review.length ? review.map(r=>`<div><b>${r.o.name}</b><div class="mv">${r.o.moves.join(" ")}</div>${r.you?`<div class="you">you said: ${r.you.replace(/</g,"&lt;")}</div>`:""}</div>`).join("")
    : `<div style="color:var(--good)">Nothing missed. Try a shorter timer.</div>`;
}

/* ---------- sharing a finished run ---------- */
const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function copyText(text){
  if(navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); }finally{ ta.remove(); } return Promise.resolve();
}
function showShare(cfg, r){
  const box=$("shareBox"), text=shareText(cfg,r), msg=t=>{ $("shMsg").textContent=t; };
  let beat="";
  if(cfg.kind==="challenge" && cfg.target!=null){
    const t=fmtScore(cfg.target);
    beat = r.score>cfg.target ? `🎉 You beat their ${t}/${cfg.len}!` : r.score===cfg.target ? `🤝 Tied with their ${t}/${cfg.len}.` : `😬 They got ${t}/${cfg.len}. So close.`;
  }
  box.innerHTML=`${beat?`<div class="beat">${beat}</div>`:""}
    <pre class="sharetext">${esc(text)}</pre>
    <div class="btns">
      <button class="btn primary" id="shCopy">📋 Copy result</button>
      ${navigator.share?'<button class="btn" id="shShare">📤 Share</button>':""}
      <button class="btn" id="shImg">🖼️ Save image</button>
      <button class="btn" id="shChal">🎯 Challenge a friend</button>
    </div><div class="dim small" id="shMsg"></div>`;
  $("shCopy").onclick=()=>copyText(text).then(()=>msg("Copied! Paste it anywhere."),()=>msg("Couldn't copy. Select the text above instead."));
  $("shChal").onclick=()=>copyText(challengeLink(cfg,r.score)).then(()=>msg("Challenge link copied. Send it to a friend: they get the exact same openings."));
  $("shImg").onclick=async()=>{
    const blob=await canvasBlob(shareImage(cfg,r)), a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=`opening-flash-${cfg.kind==="daily"?"daily-"+cfg.number:fmtScore(r.score)}.png`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    msg("Image saved.");
  };
  if($("shShare")) $("shShare").onclick=async()=>{
    try{
      const file=new File([await canvasBlob(shareImage(cfg,r))],"opening-flash.png",{type:"image/png"});
      if(navigator.canShare && navigator.canShare({files:[file]})) await navigator.share({files:[file], text});
      else await navigator.share({text});
    }catch(e){ if(e && e.name!=="AbortError") msg("Couldn't open sharing. Use Copy instead."); }
  };
}

/* ---------- the daily challenge card (top of the start screen) ---------- */
let dailyTimer=0;
function renderDailyCard(){
  const cfg=dailyConfig(), res=dailyResult(cfg.day), el=$("dailyCard");
  clearInterval(dailyTimer);
  if(res){
    const played = res.marks ? `${res.marks.map(markEmoji).join("")} <b>${fmtScore(res.score)}/${res.marks.length}</b>` : `started but not finished (one try a day)`;
    el.innerHTML=`<div class="dtitle">📅 Daily #${cfg.number} <span class="dim">· done</span></div>
      <div class="dline">${played}</div>
      <div class="dim small">Next daily in <span id="dCount">${hms(msToMidnight())}</span></div>
      ${res.marks?'<div class="btns"><button class="btn" id="dShare">Share my result</button></div>':""}`;
    if(res.marks) $("dShare").onclick=()=>{ show("results"); showShare(cfg,res); $("rBig").innerHTML=`<div>Daily #${cfg.number}<b>${fmtScore(res.score)} / ${res.marks.length}</b></div>`; $("missed").innerHTML=""; };
    dailyTimer=setInterval(()=>{ const ms=msToMidnight(); if($("dCount")) $("dCount").textContent=hms(ms); if(ms<1000) setTimeout(renderDailyCard,1500); },1000);
  } else {
    el.innerHTML=`<div class="dtitle">📅 Daily #${cfg.number}</div>
      <div class="dline">The same 10 openings for everyone today. Name it · 10 s · Popular · one try.</div>
      <div class="btns"><button class="btn primary" id="dPlay">Play today's daily ▶</button></div>`;
    $("dPlay").onclick=()=>startRun(dailyConfig());
  }
}
function showDaily(){ show("start"); $("stats").style.display="none"; renderDailyCard(); $("dailyCard").scrollIntoView({block:"nearest"}); }
renderDailyCard();

/* ---------- opening a challenge link ---------- */
function showChallenge(cfg){
  pendingChallenge=cfg;
  const b=$("chBanner");
  const desc=`${cfg.mode==="rebuild"?"Rebuild it":"Name it"} · ${cfg.time} s${cfg.flash?" · flash":""} · ${cfg.set==="lichess"?"Lichess":"Popular"}${cfg.pool==="main"?" (main openings)":""} · ${cfg.len} openings`;
  b.innerHTML=`<div class="dtitle">🎯 You've been challenged</div>
    <div class="dline">${esc(desc)}${cfg.target!=null?` · score to beat: <b>${fmtScore(cfg.target)}/${cfg.len}</b>`:""}</div>
    <div class="dim small">Same openings, same order as whoever sent it. Your own settings below don't apply.</div>
    <div class="btns"><button class="btn primary" id="chPlay">Play the challenge ▶</button><button class="btn" id="chNo">No thanks</button></div>`;
  b.style.display="";
  $("chPlay").onclick=()=>{ b.style.display="none"; startRun(cfg); };
  $("chNo").onclick=()=>{ b.style.display="none"; pendingChallenge=null; };
  show("start"); $("stats").style.display="none";
}

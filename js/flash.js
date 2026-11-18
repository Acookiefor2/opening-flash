/* ---------- Flash: the main game. Two challenges: "Name it" and "Rebuild it" ---------- */
const $=id=>document.getElementById(id);
function moveText(m){ return moveListHTML(m); }

/* ---------- settings ---------- */
const S={mode:"name",time:10,pool:"all",len:25,voice:"off"};
function seg(id,key){
  $(id).querySelectorAll("button").forEach(b=>b.onclick=()=>{
    $(id).querySelectorAll("button").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel"); S[key]= ["pool","voice","mode"].includes(key) ? b.dataset.v : +b.dataset.v;
    if(key==="voice") voiceChosen();
    if(key==="mode") modeChosen();
  });
}
seg("segMode","mode"); seg("segTime","time"); seg("segPool","pool"); seg("segLen","len"); seg("segVoice","voice");
$("cMain").textContent=OPENINGS.filter(o=>o.name===o.family).length;
$("cAll").textContent=OPENINGS.length;
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

const flashBoard=new ChessBoard($("board"));
const rBoard=new ChessBoard($("rboard"));
function drawBoard(fen,last){ flashBoard.set(fen,{last}); }

function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function show(id){ document.querySelectorAll("#page-flash .screen").forEach(s=>s.classList.toggle("on",s.id===id)); }
function updStats(){ $("sScore").textContent=score%1?score.toFixed(1).replace(/\.0$/,""):score; $("sStreak").textContent=streak; $("sLeft").textContent=deck.length-idx; }
const fmtScore=x=>(Math.round(x*10)/10).toString();

$("btnStart").onclick=startRun;
$("btnAgain").onclick=()=>{ show("start"); $("stats").style.display="none"; if(S.mode==="name" && S.voice==="whisper") startMicTest(); };
function startRun(){
  let pool = S.pool==="main" ? OPENINGS.filter(o=>o.name===o.family) : OPENINGS.slice();
  deck = shuffle(pool); if(S.len && S.len<deck.length) deck=deck.slice(0,S.len);
  idx=0; score=0; streak=0; bestStreak=0; nGood=0; nHalf=0; times=[]; review=[];
  rbStats={perfect:0, firstTry:0, total:0, hints:0, mistakes:0};
  runMode=S.mode;
  $("stats").style.display="flex";
  stopVoice(); whisperStop(); stopMicTest();
  if(runMode==="rebuild"){ show("rgame"); return nextR(); }
  show("game");
  if(S.voice==="whisper") whisperPrime();   // must happen inside this click, or the browser keeps audio switched off
  if(S.voice==="browser") startVoice(); else if(S.voice==="whisper") whisperStart();
  nextQ();
}
// leave a run cleanly (used when you switch to Study/Rebuild in the top bar)
function abortRun(){
  if(state==="idle") return;
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
  const mv=$("moves"); mv.innerHTML=moveText(cur.moves); mv.classList.toggle("hide",!$("optMoves").checked);
  $("verdict").className="verdict"; $("verdict").innerHTML="";
  const a=$("ans"); a.value=""; a.disabled=false; a.focus();
  $("qNum").textContent=`${idx+1} / ${deck.length}`;
  updStats();
  state="play"; t0=performance.now(); deadline=t0+S.time*1000;
  cancelAnimationFrame(raf); tick();
}
function setBar(barId,labelId,left){
  const frac=left/(S.time*1000), bar=$(barId);
  bar.style.transform=`scaleX(${frac})`;
  bar.style.background= frac>.5?"var(--good)":frac>.2?"var(--warn)":"var(--bad)";
  $(labelId).textContent=(left/1000).toFixed(1)+"s";
  return frac;
}
function tick(){
  const left=Math.max(0,deadline-performance.now());
  const frac=setBar("bar","tLeft",left);
  if($("optFlash").checked && frac<.5) $("board").classList.add("hidden");
  if(state!=="play") return;
  if(left<=0){
    // voice: if you were mid-word when time ran out, give the recogniser a moment to finish
    if(rec && speaking){ state="grace"; graceTimer=setTimeout(()=>{ if(state==="grace") finish(gotHalf?"half":"bad"); },1200); return; }
    // Whisper: you started talking in time, so wait for it to finish understanding you
    if(W.on && ((W.speaking && W.uttQ===qSeq) || W.pendingFor(qSeq))){ state="grace"; micStatus(`<span class="dot"></span>time's up, finishing what you said…`);
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
$("ans").addEventListener("keydown",e=>{
  if(e.key==="Enter"){ e.preventDefault();
    if(state==="play"||state==="grace"){ if(e.target.value.trim()) tryAnswer(e.target.value,false); }
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
    score+=1; nGood++; streak++; bestStreak=Math.max(bestStreak,streak); times.push(took);
    v.className="verdict on good"; v.innerHTML=`Correct in ${took.toFixed(2)}s<b>${cur.name}</b>${mv}`;
  }else if(res==="half"){
    score+=.5; nHalf++; streak=0;
    v.className="verdict on half"; v.innerHTML=`Half point. Family right, it was<b>${cur.name}</b>${mv}`;
    review.push({o:cur,you:bestTry});
  }else{
    streak=0;
    v.className="verdict on bad"; v.innerHTML=`${gaveUp?"Skipped":"Time's up"}. It was<b>${cur.name}</b>${mv}`;
    review.push({o:cur,you:bestTry||typed});
  }
  updStats(); idx++;
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
  const mv=$("rMoves"); mv.innerHTML=moveText(cur.moves); mv.classList.toggle("hide",!$("optMoves").checked);
  $("rMem").style.display=""; $("rPlay").style.display="none"; $("rNext").style.display="none";
  $("rTimer").style.visibility="visible";
  updStats();
  state="memorize"; t0=performance.now(); deadline=t0+S.time*1000;
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
  score+=pts; rbStats.firstTry+=s.firstTry; rbStats.total+=s.n; rbStats.hints+=s.hints; rbStats.mistakes+=s.mistakes;
  if(s.perfect){ rbStats.perfect++; streak++; bestStreak=Math.max(bestStreak,streak); }
  else { streak=0; review.push({o:cur, rb:`${s.firstTry}/${s.n} moves first try${s.gaveUp?" (gave up)":""}`}); }
  $("rNext").style.display="";
  idx++; updStats();
}
$("rReady").onclick=()=>startRebuildPhase();
$("rNextBtn").onclick=()=>nextR();
$("rQuit").onclick=()=>{ state="idle"; cancelAnimationFrame(raf); rbs=null; rBoard.setInteractive(false); endRun(); };
bindRebuildPanel("fr",()=>rbs);

/* ---------- keyboard for both challenges ---------- */
document.addEventListener("keydown",e=>{
  if(currentPage!=="flash" || e.target.tagName==="INPUT" && e.target!==$("ans")) return;
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

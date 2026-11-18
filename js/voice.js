/* ---------- browser voice (Web Speech API) ---------- */
// seen[i] = latest words for result slot i in this listening session (+ whether that phrase had finished)
// base[i] = a phrase that was STILL BEING SPOKEN when the current question appeared; that part is ignored.
// Finished phrases are never stripped, so saying "najdorf" again always counts as new.
let seen=[], seenFinal=[], base=[], restartTimer=0, voiceWanted=false;
// speechQ: the question you were answering when you started talking (only if you started before the deadline).
// Kept until that speech's final result arrives, so a just-in-time answer isn't marked wrong while the browser is still typing it.
let speechQ=-1;
// staleSlot: if you were mid-sentence when the question changed and no words had arrived yet,
// the next result slot belongs to the OLD question; ignore it until it finishes.
let staleSlot=-1;
function micStatus(html){ $("mic").innerHTML=html; }
// debug trail of what the browser's speech engine is doing (shown in small text under the mic line)
const vtrail=[];
function vlog(x){ vtrail.push(x); if(vtrail.length>10) vtrail.shift(); const el=$("vlog"); if(el) el.textContent="mic log: "+vtrail.join(" › "); }
const answering=()=> (state==="play" && performance.now()<deadline);
function startVoice(){
  if(!SR) return;
  stopVoice(); voiceWanted=true;
  rec=new SR(); rec.lang="en-US"; rec.continuous=true; rec.interimResults=true; rec.maxAlternatives=1;
  rec.onstart=()=>{ vlog("start"); seen=[]; seenFinal=[]; base=[]; staleSlot=-1; micStatus(`<span class="dot"></span>listening…`); };
  rec.onspeechstart=()=>{ speaking=true; speechQ = answering() ? qSeq : -1; };
  rec.onspeechend=()=>{ speaking=false; };   // speechQ stays until the final result arrives
  rec.onresult=e=>{
    const n=e.results.length;
    // the browser can withdraw a result, leaving a shorter (even empty) list
    seen.length=Math.min(seen.length,n); seenFinal.length=Math.min(seenFinal.length,n); base.length=Math.min(base.length,n);
    if(!n) return;
    const lr=e.results[n-1];
    vlog(`result[${e.resultIndex}/${n}${lr.isFinal?" final":""} alts=${lr.length}] `+[...lr].map(x=>`"${(x.transcript||"").slice(-25)}"`).join("|"));
    for(let i=e.resultIndex;i<n;i++){
      const r=e.results[i];
      // strip what this slot had already said before the question appeared.
      // if the slot now says something else entirely, it's new speech: keep all of it
      const fresh=t=>{ const b=base[i]; return (b && t.startsWith(b) ? t.slice(b.length) : t).trim(); };
      // use the first guess that actually has words in it (Edge can leave the first one empty)
      const firstText=([...r].find(x=>x.transcript&&x.transcript.trim())||r[0]||{transcript:""}).transcript||"";
      seen[i]=firstText; seenFinal[i]=r.isFinal;
      if(i===staleSlot){ if(r.isFinal) staleSlot=-1; continue; }      // words from the previous question
      const alts=[...r].map(x=>fresh(x.transcript||"")).filter(Boolean);
      if(!alts.length) continue;
      micStatus(`<span class="dot"></span>heard: <span class="heard">${alts[0].replace(/</g,"&lt;")}</span>`);
      if((state==="play"||state==="grace") && (speechQ===qSeq || answering())){
        $("ans").value=alts[0];
        // scoring on in-progress words is on purpose: it's what makes browser voice feel instant
        for(const t of alts){ if(voiceAnswer(t)){ speechQ=-1; return; } }
        if(r.isFinal){ speechQ=-1; if(state==="grace") finish(gotHalf?"half":"bad"); }
      } else if(state==="done" && r.isFinal && /\b(next|go|skip)\b/i.test(alts[0])) nextQ();   // commands: finished words only
    }
  };
  rec.onerror=e=>{
    vlog("error:"+e.error);
    const msg={
      "not-allowed":"Mic blocked. Click the mic icon in the address bar and allow it, then press Start again.",
      "service-not-allowed":"This browser won't allow speech recognition here. Try Chrome or Edge.",
      "audio-capture":"No microphone found. Check it's plugged in and not used by another app.",
      "network":"Speech service unreachable. Voice needs an internet connection (Chrome/Edge send audio to Google/Microsoft).",
      "language-not-supported":"English speech recognition isn't available in this browser.",
    }[e.error];
    if(msg){ micStatus(`⚠ ${msg}`); if(e.error!=="network"){ voiceWanted=false; } }
    // "no-speech" and "aborted" are normal: it just restarts
  };
  rec.onend=()=>{
    vlog("end");
    speaking=false; seen=[]; seenFinal=[]; base=[]; staleSlot=-1;
    const wasWaiting=speechQ===qSeq; speechQ=-1;
    if(wasWaiting && state==="grace") finish(gotHalf?"half":"bad");   // the words we were waiting for never came
    if(voiceWanted && rec){ clearTimeout(restartTimer); restartTimer=setTimeout(restartVoice,250); }
  };
  restartVoice();
}
function restartVoice(){
  if(!voiceWanted || !rec) return;
  try{ rec.start(); }
  catch(err){ vlog("start failed: "+(err&&err.name)); micStatus(`<span class="dot"></span>reconnecting mic…`); clearTimeout(restartTimer); restartTimer=setTimeout(restartVoice,1000); }
}
// is the browser still working on words you started saying before time ran out?
function browserVoicePending(){ return !!rec && speechQ===qSeq; }
// called when a new question appears: everything said so far is old
function resetHeard(){
  if(rec) vlog("new question");
  base=seen.map((t,i)=>seenFinal[i]?undefined:t);
  // mid-sentence with no words yet: the next slot that shows up is still the old sentence
  staleSlot = (rec && speaking && !seen.some((t,i)=>!seenFinal[i])) ? seen.length : -1;
  speechQ=-1;
  if(rec && voiceWanted) micStatus(`<span class="dot"></span>listening…`);
}
function stopVoice(){
  voiceWanted=false; clearTimeout(restartTimer);
  if(rec){ const r=rec; rec=null; r.onend=null; try{r.abort();}catch(_){} }
  $("mic").textContent=""; speaking=false; seen=[]; seenFinal=[]; base=[]; speechQ=-1; staleSlot=-1;
}

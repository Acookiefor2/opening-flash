/* ---------- voice ---------- */
// seen[i] = latest words for result slot i in this listening session (+ whether that phrase had finished)
// base[i] = a phrase that was STILL BEING SPOKEN when the current question appeared; that part is ignored.
// Finished phrases are never stripped, so saying "najdorf" again always counts as new.
let seen=[], seenFinal=[], base=[], restartTimer=0, voiceWanted=false;
function micStatus(html){ $("mic").innerHTML=html; }
// debug trail of what the browser's speech engine is doing (shown in small text under the mic line)
const vtrail=[];
function vlog(x){ vtrail.push(x); if(vtrail.length>10) vtrail.shift(); const el=$("vlog"); if(el) el.textContent="mic log: "+vtrail.join(" › "); }
function startVoice(){
  if(!SR) return;
  stopVoice(); voiceWanted=true;
  rec=new SR(); rec.lang="en-US"; rec.continuous=true; rec.interimResults=true; rec.maxAlternatives=1;
  rec.onstart=()=>{ vlog("start"); seen=[]; seenFinal=[]; base=[]; micStatus(`<span class="dot"></span>listening…`); };
  rec.onspeechstart=()=>{speaking=true;};
  rec.onspeechend=()=>{speaking=false;};
  rec.onresult=e=>{
    const lr=e.results[e.results.length-1];
    vlog(`result[${e.resultIndex}/${e.results.length}${lr.isFinal?" final":""} alts=${lr.length}] `+[...lr].map(x=>`"${(x.transcript||"").slice(-25)}"`).join("|"));
    for(let i=e.resultIndex;i<e.results.length;i++){
      const r=e.results[i];
      // strip what this slot had already said before the question appeared.
      // if the slot now says something else entirely, it's new speech: keep all of it
      const fresh=t=>{ const b=base[i]; return (b && t.startsWith(b) ? t.slice(b.length) : t).trim(); };
      // use the first guess that actually has words in it (Edge can leave the first one empty)
      const firstText=([...r].find(x=>x.transcript&&x.transcript.trim())||r[0]||{transcript:""}).transcript||"";
      seen[i]=firstText; seenFinal[i]=r.isFinal;
      const alts=[...r].map(x=>fresh(x.transcript||"")).filter(Boolean);
      if(!alts.length) continue;
      micStatus(`<span class="dot"></span>heard: <span class="heard">${alts[0].replace(/</g,"&lt;")}</span>`);
      if(state==="play"||state==="grace"){
        $("ans").value=alts[0];
        for(const t of alts){
          // check the last few words on their own too, so stray words before the name don't matter
          const w=t.split(/\s+/);
          for(let k=Math.min(w.length,6);k>=1;k--){ if(tryAnswer(w.slice(-k).join(" "),true)) return; }
        }
        if(r.isFinal){ speaking=false; if(state==="grace") finish(gotHalf?"half":"bad"); }
      } else if(state==="done" && /\b(next|go|skip)\b/i.test(alts[0])) nextQ();
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
    speaking=false; seen=[]; seenFinal=[]; base=[];
    if(voiceWanted && rec){ clearTimeout(restartTimer); restartTimer=setTimeout(restartVoice,250); }
  };
  restartVoice();
}
function restartVoice(){
  if(!voiceWanted || !rec) return;
  try{ rec.start(); }
  catch(err){ vlog("start failed: "+(err&&err.name)); micStatus(`<span class="dot"></span>reconnecting mic…`); clearTimeout(restartTimer); restartTimer=setTimeout(restartVoice,1000); }
}
// called when a new question appears: everything said so far is old
function resetHeard(){
  if(rec) vlog("new question");
  base=seen.map((t,i)=>seenFinal[i]?undefined:t); speaking=false;
  if(rec && voiceWanted) micStatus(`<span class="dot"></span>listening…`);
}
function stopVoice(){
  voiceWanted=false; clearTimeout(restartTimer);
  if(rec){ const r=rec; rec=null; r.onend=null; try{r.abort();}catch(_){} }
  $("mic").textContent=""; speaking=false; seen=[]; seenFinal=[]; base=[];
}

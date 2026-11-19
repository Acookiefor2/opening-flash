/* ---------- big verdicts, sound effects, streamer (clean) mode ----------
   Everyone gets the big ✅ / ½ / ❌ on the board and sound (mute in the header).
   Streamer mode is the clean version for recording: no hints, no mic details, no footer, bigger text.
   Sounds are made in the browser, so there are no audio files. */

const prefs={ streamer: !!store.get("streamer"), sound: store.get("sound")!==false };   // sound is on unless you muted it

let actx=null;
function tone(freq, start, dur, {type="sine", vol=.18, slide=0}={}){
  if(!prefs.sound) return;
  try{
    actx ||= new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==="suspended") actx.resume();
    const t=actx.currentTime+start, o=actx.createOscillator(), g=actx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t); if(slide) o.frequency.linearRampToValueAtTime(freq+slide,t+dur);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.01); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t+dur+.02);
  }catch(_){}
}
const SFX={
  good(){ tone(660,0,.12,{type:"triangle"}); tone(990,.09,.22,{type:"triangle"}); },
  half(){ tone(520,0,.18,{type:"triangle"}); tone(520,.16,.18,{type:"triangle",vol:.12}); },
  bad(){  tone(180,0,.32,{type:"sawtooth",vol:.10,slide:-60}); },
  tick(){ tone(1200,0,.04,{type:"square",vol:.05}); },
  start(){ tone(392,0,.08,{type:"triangle",vol:.12}); tone(587,.07,.12,{type:"triangle",vol:.12}); },
  perfect(){ [523,659,784,1047].forEach((f,i)=>tone(f,i*.08,.18,{type:"triangle",vol:.14})); },
};

// the big verdict on the board
function bigVerdict(boardEl, kind, title, sub=""){
  const wrap=boardEl.parentElement; let el=wrap.querySelector(".bigv");
  if(!el){ el=document.createElement("div"); el.className="bigv"; wrap.appendChild(el); }
  const icon={good:"✅",half:"½",bad:"❌",perfect:"🏆"}[kind]||"";
  el.className="bigv "+kind; void el.offsetWidth; el.classList.add("pop");
  el.innerHTML=`<div class="i">${icon}</div><div class="t">${title}</div>${sub?`<div class="s">${sub}</div>`:""}`;
}
function clearBigVerdict(boardEl){ const el=boardEl.parentElement.querySelector(".bigv"); if(el) el.className="bigv"; }

function applyPrefs(){
  document.body.classList.toggle("streamer",prefs.streamer);
  const sb=$("btnStreamer"), so=$("btnSound");
  sb.setAttribute("aria-pressed",prefs.streamer); sb.classList.toggle("on",prefs.streamer);
  so.setAttribute("aria-pressed",prefs.sound); so.textContent=prefs.sound?"🔊":"🔇"; so.title=prefs.sound?"Sound effects on":"Sound effects off";
}
$("btnStreamer").onclick=()=>{ prefs.streamer=!prefs.streamer; store.set("streamer",prefs.streamer); applyPrefs(); };
$("btnSound").onclick=()=>{ prefs.sound=!prefs.sound; store.set("sound",prefs.sound); applyPrefs(); if(prefs.sound) SFX.good(); };
// the "how to play" hints: shown for your first couple of runs, then they get out of the way
const runsPlayed=()=>+(store.get("runs")||0);
function countRun(){ store.set("runs",runsPlayed()+1); document.body.classList.toggle("seasoned",runsPlayed()>=2); }
document.body.classList.toggle("seasoned",runsPlayed()>=2);
// mic details: hidden unless voice has a problem (a ⚠ message) or you ask for them
function voiceTrouble(on){ document.body.classList.toggle("voicetrouble",!!on); }
$("micDetails").onclick=()=>{ const on=!document.body.classList.contains("showdebug"); document.body.classList.toggle("showdebug",on); $("micDetails").textContent=on?"hide mic details":"mic details"; };
applyPrefs();

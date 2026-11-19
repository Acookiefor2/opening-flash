/* ---------- shared runs: the daily challenge, challenge links, and sharing your result ----------
   A run is described by its settings + a "seed". The same seed always shuffles the openings the same way,
   so everyone who opens the same link (or plays the same day's daily) gets the exact same openings in the same order. */

const SITE_URL = "https://acookiefor2.github.io/opening-flash/";

// --- seeded shuffle (same seed -> same order, on every device) ---
function seedNumber(str){                       // turn any text into a 32-bit number
  let h=1779033703^str.length;
  for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; }
  h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909);
  return (h^h>>>16)>>>0;
}
function seededRandom(seed){                    // mulberry32: small, fast, good enough for shuffling
  let a=seedNumber(String(seed));
  return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
}
function shuffleWith(a,rand){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const newSeed=()=>Math.random().toString(36).slice(2,8);

// --- the settings of a run, as a link ---
// #play?m=name&s=popular&p=all&t=10&n=10&f=0&mv=1&seed=k3x9q2&sc=7.5
function challengeLink(cfg, score){
  const q=new URLSearchParams({m:cfg.mode, s:cfg.set, p:cfg.pool, t:cfg.time, n:cfg.len, f:cfg.flash?1:0, mv:cfg.moves?1:0, seed:cfg.seed});
  if(score!=null) q.set("sc", fmtScore(score));
  return SITE_URL+"#play?"+q.toString();
}
function parseChallenge(query){
  const q=new URLSearchParams(query), num=(k,lo,hi,d)=>{ const v=+q.get(k); return Number.isFinite(v)&&v>=lo&&v<=hi?v:d; };
  const seed=(q.get("seed")||"").replace(/[^a-z0-9-]/gi,"").slice(0,24);
  if(!seed) return null;
  return {
    kind:"challenge", seed,
    mode: q.get("m")==="rebuild"?"rebuild":"name",
    set:  q.get("s")==="lichess"?"lichess":"popular",
    pool: q.get("p")==="main"?"main":"all",
    time: num("t",1,30,10), len: num("n",1,50,10),
    flash: q.get("f")==="1", moves: q.get("mv")!=="0",
    target: q.has("sc") ? num("sc",0,50,null) : null,
  };
}

// --- the daily challenge: same 10 openings for everyone, new set every day (your local midnight) ---
const DAILY_START = [2026,10,19];                 // 19 Nov 2026 = Daily #1 (months count from 0)
function localDay(d=new Date()){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function dayKey(d=new Date()){ const x=localDay(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; }
function dailyNumber(d=new Date()){ return Math.round((localDay(d)-new Date(...DAILY_START))/864e5)+1; }
function dailyConfig(d=new Date()){
  return {kind:"daily", number:dailyNumber(d), day:dayKey(d), seed:"daily-"+dayKey(d),
    mode:"name", set:"popular", pool:"all", time:10, len:10, flash:false, moves:true};
}
// one attempt per day, remembered in this browser
const store={
  get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(_){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(_){} },
};
const dailyResult=(day=dayKey())=>store.get("daily:"+day);
function msToMidnight(){ const n=new Date(), m=new Date(n.getFullYear(),n.getMonth(),n.getDate()+1); return m-n; }
const hms=ms=>{ const s=Math.max(0,Math.floor(ms/1000)); return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,"0")).join(":"); };

// --- describing a finished run ---
// marks: one per opening. Name it: "good" | "half" | "bad". Rebuild it: share of moves right first try (0..1)
const markEmoji=m=> typeof m==="number" ? (m>=1?"🟩":m>=.5?"🟨":"⬛") : ({good:"🟩",half:"🟨",bad:"⬛"}[m]||"⬛");
function runTitle(cfg){
  if(cfg.kind==="daily") return `Opening Flash Daily #${cfg.number}`;
  return `Opening Flash · ${cfg.mode==="rebuild"?"Rebuild it":"Name it"} · ${cfg.time}s${cfg.flash?" ⚡flash":""} · ${cfg.set==="lichess"?"Lichess":"Popular"}`;
}
function shareText(cfg, r){
  const grid=r.marks.map(markEmoji).join("");
  const lines=[runTitle(cfg), `${grid} ${fmtScore(r.score)}/${r.marks.length}`];
  if(r.avg) lines.push(`⏱️ ${r.avg.toFixed(1)}s average`);
  lines.push(cfg.kind==="daily" ? SITE_URL : `Beat me: ${challengeLink(cfg,r.score)}`);
  return lines.join("\n");
}

// --- the share image (1080×1080, good for Instagram, Discord, WhatsApp) ---
function shareImage(cfg, r){
  const c=document.createElement("canvas"); c.width=c.height=1080;
  const g=c.getContext("2d"), font=(w,s)=>`${w} ${s}px "Segoe UI",system-ui,-apple-system,Roboto,sans-serif`;
  g.fillStyle="#16151a"; g.fillRect(0,0,1080,1080);
  // a chessboard corner that fades out toward the middle
  for(let i=0;i<9;i++) for(let j=0;j<9;j++){
    const fade=Math.max(0, 1 - Math.hypot(8-i, j)/8.5); if(!fade || (i+j)%2) continue;
    g.fillStyle=`rgba(115,149,82,${(.32*fade).toFixed(3)})`; g.fillRect(1080-(9-i)*56, j*56, 56, 56);
  }
  g.textAlign="left"; g.fillStyle="#ecebf0"; g.font=font(800,92); g.fillText("Opening",80,170);
  g.fillStyle="#f0c35a"; g.fillText("Flash",80+g.measureText("Opening ").width,170);
  g.fillStyle="#9a97a6"; g.font=font(600,40);
  g.fillText(cfg.kind==="daily" ? `Daily #${cfg.number}` : `${cfg.mode==="rebuild"?"Rebuild it":"Name it"} · ${cfg.time}s${cfg.flash?" · flash":""} · ${cfg.set==="lichess"?"Lichess":"Popular"}`,80,240);
  // big score
  g.fillStyle="#ecebf0"; g.font=font(800,230); g.fillText(fmtScore(r.score),80,500);
  const sw=g.measureText(fmtScore(r.score)).width;
  g.fillStyle="#9a97a6"; g.font=font(700,90); g.fillText(`/ ${r.marks.length}`,80+sw+24,500);
  // the grid of squares
  const n=r.marks.length, per=Math.min(10,n), size=Math.min(84,Math.floor(920/per)-12), gap=12;
  r.marks.forEach((m,i)=>{
    const x=80+(i%per)*(size+gap), y=570+Math.floor(i/per)*(size+gap);
    g.fillStyle = (typeof m==="number" ? (m>=1?"#5cc46b":m>=.5?"#e8b339":"#3a3746") : ({good:"#5cc46b",half:"#e8b339"}[m]||"#3a3746"));
    g.beginPath(); g.roundRect ? g.roundRect(x,y,size,size,14) : g.rect(x,y,size,size); g.fill();
  });
  const rows=Math.ceil(n/per), yAfter=570+rows*(size+gap)+40;
  if(r.avg){ g.fillStyle="#ecebf0"; g.font=font(600,44); g.fillText(`⏱ ${r.avg.toFixed(1)}s average answer`,80,yAfter+30); }
  g.fillStyle="#9a97a6"; g.font=font(500,34); g.fillText("Name the chess opening before the board disappears.",80,980);
  g.fillStyle="#f0c35a"; g.font=font(700,36); g.fillText(SITE_URL.replace(/^https:\/\//,"").replace(/\/$/,""),80,1030);
  return c;
}
const canvasBlob=c=>new Promise(res=>c.toBlob(res,"image/png"));

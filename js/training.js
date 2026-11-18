/* ---------- Training: Study and Rebuild ---------- */

// searchable list of openings, grouped by family. onPick(opening) when you click one
function OpeningPicker(el, onPick){
  el.innerHTML=`
    <input class="search" placeholder="Search openings…" spellcheck="false">
    <div class="seg small"><button data-v="all" class="sel">All</button><button data-v="main">Main only</button><button data-v="random">🎲 Random</button></div>
    <div class="olist"></div>`;
  const search=el.querySelector(".search"), list=el.querySelector(".olist");
  let filter="all", selected=null;
  const fams=[]; const byFam={};
  OPENINGS.forEach(o=>{ if(!byFam[o.family]){ byFam[o.family]=[]; fams.push(o.family); } byFam[o.family].push(o); });
  function draw(){
    const q=norm(search.value);
    let html="";
    for(const f of fams){
      let items=byFam[f].filter(o=>filter!=="main"||o.name===o.family);
      if(q) items=items.filter(o=>norm(o.name+" "+o.aliases.join(" ")+" "+o.family).includes(q));
      if(!items.length) continue;
      html+=`<div class="fam">${f}</div>`+items.map(o=>`<div class="item${o===selected?" on":""}" data-n="${OPENINGS.indexOf(o)}">
        ${o.name===o.family?"<i>main line</i>":o.name.replace(/^[^:]*:\s*/,"")}<span>${o.plies.length} moves</span></div>`).join("");
    }
    list.innerHTML=html||`<div class="fam">Nothing matches.</div>`;
  }
  list.onclick=e=>{ const it=e.target.closest(".item"); if(it) pick(OPENINGS[+it.dataset.n]); };
  search.oninput=draw;
  el.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{
    if(b.dataset.v==="random"){ const pool=filter==="main"?OPENINGS.filter(o=>o.name===o.family):OPENINGS; pick(pool[Math.floor(Math.random()*pool.length)]); return; }
    el.querySelectorAll(".seg button").forEach(x=>x.classList.toggle("sel",x===b));
    filter=b.dataset.v; draw();
  });
  function pick(o){
    selected=o; draw(); onPick(o);
    const it=list.querySelector(".item.on"); if(it) it.scrollIntoView({block:"nearest"});
  }
  draw();
  return {pick, next(){ // the next opening in the list after the selected one
    const vis=[...list.querySelectorAll(".item")].map(i=>OPENINGS[+i.dataset.n]);
    const i=vis.indexOf(selected); return vis[(i+1)%vis.length]||vis[0];
  }};
}

// step through an opening's moves on a board: ⏮ ◀ ▶ ⏭, arrow keys, or click a move
function Stepper(board, movesEl, btnsEl){
  let o=null, k=0;
  btnsEl.innerHTML=`<button class="btn" data-a="first" title="Start (Home)">⏮</button><button class="btn" data-a="prev" title="Back (←)">◀</button>
    <button class="btn" data-a="next" title="Forward (→)">▶</button><button class="btn" data-a="last" title="End (End)">⏭</button>`;
  function draw(){
    if(!o) return;
    const p=k>0?o.plies[k-1]:null;
    board.set(p?p[2]:START_FEN,{last:p?[p[0],p[1]]:null});
    movesEl.innerHTML=moveListHTML(o.moves,{cur:k-1,clickable:true});
  }
  const go=a=>{ if(!o) return; const n=o.plies.length;
    k = a==="first"?0 : a==="last"?n : a==="prev"?Math.max(0,k-1) : a==="next"?Math.min(n,k+1) : Math.max(0,Math.min(n,a)); draw(); };
  btnsEl.onclick=e=>{ const b=e.target.closest("button"); if(b) go(b.dataset.a); };
  movesEl.onclick=e=>{ const m=e.target.closest(".mv.click"); if(m) go(+m.dataset.i+1); };
  return { load(op,atEnd=true){ o=op; k=atEnd?op.plies.length:0; draw(); }, go, get k(){return k;} };
}
function keySteps(stepper,e){
  const map={ArrowLeft:"prev",ArrowRight:"next",Home:"first",End:"last"};
  if(map[e.key]){ e.preventDefault(); stepper.go(map[e.key]); return true; }
  return false;
}
function openingTitle(o){
  const [fam,sub]=o.name.includes(":")?o.name.split(/:\s*/):[o.name,""];
  return `<div class="ofam">${fam}</div><div class="osub">${sub||"Main line"}</div>`;
}

/* ---------- Study ---------- */
const studyBoard=new ChessBoard($("sboard"));
const studyStep=Stepper(studyBoard,$("sMoves"),$("sSteps"));
let studyCur=null;
const studyPicker=OpeningPicker($("sPicker"),o=>{
  studyCur=o;
  $("sTitle").innerHTML=openingTitle(o);
  $("sAka").textContent=o.aliases.length?"Also called: "+o.aliases.slice(0,4).map(a=>a.replace(/\b\w/g,c=>c.toUpperCase())).join(", "):"";
  studyStep.load(o,true);
  $("sInfo").style.display=""; $("sEmpty").style.display="none";
});
$("sToRebuild").onclick=()=>{ if(studyCur){ location.hash="#rebuild"; trainPicker.pick(studyCur); } };
$("sNext").onclick=()=>studyPicker.pick(studyPicker.next());

/* ---------- Training → Rebuild ---------- */
// pick → look at it as long as you like (step through the moves) → Ready → rebuild it → done
const tBoard=new ChessBoard($("tboard"));
const tStep=Stepper(tBoard,$("tMoves"),$("tSteps"));
let tCur=null, tSess=null, tPhase="pick";
const trainPicker=OpeningPicker($("tPicker"),o=>{ tCur=o; tLook(); });
function tLook(){
  tPhase="look"; tSess=null; tBoard.setInteractive(false);
  $("tTitle").innerHTML=openingTitle(tCur);
  $("tEmpty").style.display="none"; $("tInfo").style.display="";
  $("tLookBox").style.display=""; $("tPlayBox").style.display="none"; $("tDoneBtns").style.display="none";
  $("tSteps").style.visibility="visible";
  tStep.load(tCur,true);
}
function tStart(){
  if(!tCur) return;
  tPhase="play"; $("tSteps").style.visibility="hidden";   // no peeking at the moves while you rebuild
  $("tLookBox").style.display="none"; $("tPlayBox").style.display=""; $("tDoneBtns").style.display="none";
  tSess=new RebuildSession(tBoard,tCur,{
    onUpdate:(s,why)=>updateRebuildPanel("tr",s,why),
    onDone:()=>{ tPhase="done"; $("tDoneBtns").style.display=""; },
  });
  tSess.start();
}
$("tReady").onclick=tStart;
$("tAgain").onclick=tStart;
$("tLookAgain").onclick=tLook;
$("tNextOne").onclick=()=>trainPicker.pick(trainPicker.next());
bindRebuildPanel("tr",()=>tSess);

document.addEventListener("keydown",e=>{
  if(e.target.tagName==="INPUT") return;
  if(currentPage==="study" && studyCur) keySteps(studyStep,e);
  if(currentPage==="rebuild"){
    if(tPhase==="look"){ if(!keySteps(tStep,e) && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); tStart(); } }
    else if(tPhase==="play" && tSess){ if(e.key==="h"||e.key==="H") tSess.hint(); else if(e.key==="s"||e.key==="S") tSess.show(); }
    else if(tPhase==="done" && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); trainPicker.pick(trainPicker.next()); }
  }
});

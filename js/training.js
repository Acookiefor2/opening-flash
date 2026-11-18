/* ---------- Training: Study and Rebuild ---------- */

// searchable list of openings, grouped by family, for either set. onPick(opening) when you click one
function OpeningPicker(el, onPick){
  el.innerHTML=`
    <div class="seg small setsw"><button data-set="popular" class="sel">Popular</button><button data-set="lichess">Lichess (3,865)</button></div>
    <input class="search" placeholder="Search openings…" spellcheck="false">
    <div class="seg small filt"><button data-v="all" class="sel">All</button><button data-v="main">Main only</button><button data-v="random">🎲 Random</button></div>
    <div class="olist"></div>`;
  const search=el.querySelector(".search"), list=el.querySelector(".olist");
  let set=getSet("popular"), filter="all", selected=null, open=new Set(), shown=[];
  let fams=[], byFam={};
  function index(){
    fams=[]; byFam={};
    set.list.forEach(o=>{ if(!byFam[o.family]){ byFam[o.family]=[]; fams.push(o.family); } byFam[o.family].push(o); });
  }
  const big=()=>set.list.length>400;   // big list: families start folded up
  const label=o=>o.name===o.family?"<i>main line</i>":o.name.slice(o.name.indexOf(":")>=0?o.name.indexOf(":")+1:o.family.length).replace(/^[\s,]+/,"");
  function draw(){
    const q=norm(search.value), MAX=300;
    let html="", count=0; shown=[];
    for(const f of fams){
      let items=byFam[f].filter(o=>filter!=="main"||o.name===o.family);
      if(q) items=items.filter(o=>norm(o.name+" "+o.aliases.join(" ")+" "+(o.eco||"")).includes(q));
      if(!items.length) continue;
      shown.push(...items);
      const folded = big() && !q && !open.has(f) && !(selected && selected.family===f);
      html+=`<div class="fam${big()?" fold":""}" data-f="${f.replace(/"/g,"&quot;")}"${big()?` role="button" tabindex="0" aria-expanded="${!folded}"`:""}>${big()?(folded?"▸ ":"▾ "):""}${f}${big()?` <span>${items.length}</span>`:""}</div>`;
      if(folded) continue;
      for(const o of items){
        if(count++>=MAX) break;
        // same name used for several lines: show how each one ends so you can tell them apart
        const dup=set.byName[o.name].length>1, k=o.moves.length;
        const tail=dup?` · ${Math.ceil(k/2)}.${k%2?"":"…"}${o.moves[k-1]}`:"";
        html+=`<div class="item${o===selected?" on":""}" data-n="${set.list.indexOf(o)}" role="button" tabindex="0"${o===selected?' aria-current="true"':""}>${label(o)}<span>${o.plies.length} moves${tail}</span></div>`;
      }
      if(count>=MAX){ html+=`<div class="fam">…more matches, keep typing to narrow it down</div>`; break; }
    }
    list.innerHTML=html||`<div class="fam">Nothing matches.</div>`;
  }
  list.onclick=e=>{
    const it=e.target.closest(".item"); if(it) return pick(set.list[+it.dataset.n]);
    const fh=e.target.closest(".fam.fold"); if(fh){ const f=fh.dataset.f; open.has(f)?open.delete(f):open.add(f); draw(); }
  };
  // Enter or Space on a focused entry/family does the same as clicking it
  list.onkeydown=e=>{ if((e.key==="Enter"||e.key===" ") && e.target.closest(".item,.fam.fold")){ e.preventDefault(); e.stopPropagation(); e.target.click(); } };
  search.oninput=draw;
  el.querySelectorAll(".filt button").forEach(b=>b.onclick=()=>{
    if(b.dataset.v==="random"){ const pool=filter==="main"?set.list.filter(o=>o.name===o.family):set.list; pick(pool[Math.floor(Math.random()*pool.length)]); return; }
    el.querySelectorAll(".filt button").forEach(x=>{ x.classList.toggle("sel",x===b); x.setAttribute("aria-pressed",x===b?"true":"false"); });
    filter=b.dataset.v; draw();
  });
  let loadGen=0;
  const markSet=id=>el.querySelectorAll(".setsw button").forEach(x=>{ x.classList.toggle("sel",x.dataset.set===id); x.setAttribute("aria-pressed",x.dataset.set===id?"true":"false"); });
  el.querySelectorAll(".setsw button").forEach(b=>b.onclick=()=>{
    const g=++loadGen; markSet(b.dataset.set);
    list.innerHTML=`<div class="fam">Loading…</div>`;
    ensureSet(b.dataset.set).then(s2=>{ if(g!==loadGen) return; set=s2; open.clear(); index(); draw(); })
      .catch(err=>{ if(g===loadGen) list.innerHTML=`<div class="fam">⚠ ${err.message}. Check your internet connection.</div>`; });
  });
  markSet("popular");
  el.querySelectorAll(".filt button").forEach(b=>b.setAttribute("aria-pressed",b.classList.contains("sel")?"true":"false"));
  function pick(o){
    selected=o; draw(); onPick(o);
    const it=list.querySelector(".item.on"); if(it) it.scrollIntoView({block:"nearest"});
  }
  index(); draw();
  return {pick(o){ if(!o) return; if(o.set!==set){ loadGen++; set=o.set; index(); markSet(set.id); } pick(o); },
    next(){ // the next opening (in the list as filtered) after the selected one; nothing if the list is empty
      if(!shown.length) return null;
      const i=shown.indexOf(selected); return shown[(i+1)%shown.length];
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
  $("sAka").textContent=(o.eco?"ECO "+o.eco+(o.aliases.length?" · ":""):"")+(o.aliases.length?"Also called: "+o.aliases.slice(0,4).map(a=>a.replace(/\b\w/g,c=>c.toUpperCase())).join(", "):"");
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
  if(document.activeElement && document.activeElement.closest && document.activeElement.closest("#tDoneBtns")) document.activeElement.blur();
  $("tSteps").style.visibility="visible";
  tStep.load(tCur,true);
}
function tStart(){
  if(!tCur) return;
  tPhase="play"; $("tSteps").style.visibility="hidden";   // no peeking at the moves while you rebuild
  if(document.activeElement && document.activeElement.closest && document.activeElement.closest("#tDoneBtns,#tLookBox")) document.activeElement.blur();
  $("tLookBox").style.display="none"; $("tPlayBox").style.display=""; $("tDoneBtns").style.display="none";
  tSess=new RebuildSession(tBoard,tCur,{
    onUpdate:(s,why)=>updateRebuildPanel("tr",s,why),
    onDone:()=>{ tPhase="done"; $("tDoneBtns").style.display=""; $("tNextOne").focus(); },   // Enter = next opening
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
  if(ownsKey(e)) return;               // a focused button/list entry handles its own Enter/Space
  if(currentPage==="study" && studyCur) keySteps(studyStep,e);
  if(currentPage==="rebuild"){
    if(tPhase==="look"){ if(!keySteps(tStep,e) && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); tStart(); } }
    else if(tPhase==="play" && tSess){ if(e.key==="h"||e.key==="H") tSess.hint(); else if(e.key==="s"||e.key==="S") tSess.show(); }
    else if(tPhase==="done" && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); trainPicker.pick(trainPicker.next()); }
  }
});

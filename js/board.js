/* ---------- chess board (shared by Flash, Study and Rebuild) ---------- */
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const FILES = "abcdefgh";
const GLYPH = {k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};

function parseFen(fen){
  const pos={};
  fen.split("/").forEach((row,r)=>{
    let c=0;
    for(const ch of row){
      if(/\d/.test(ch)) c+=+ch;
      else { pos[FILES[c]+(8-r)]=ch; c++; }
    }
  });
  return pos;
}
const isWhite = p => p===p.toUpperCase();

class ChessBoard{
  constructor(el){
    this.el=el; el.classList.add("board"); el.innerHTML="";
    this.cells={}; this.pos={}; this.last=null; this.sel=null; this.hintSq=null; this.wrongSq=null;
    this.interactive=false; this.turn=null; this.onMove=null; this.drag=null;
    this.legalFor=null;   // optional: square -> [{to, capture}] so a selected piece shows where it can go
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const name=FILES[c]+(8-r), sq=document.createElement("div");
      sq.className="sq "+((r+c)%2===0?"l":"d"); sq.dataset.sq=name;
      if(r===7){ const s=document.createElement("span"); s.className="co f"; s.textContent=FILES[c]; sq.appendChild(s); }
      if(c===0){ const s=document.createElement("span"); s.className="co r"; s.textContent=8-r; sq.appendChild(s); }
      el.appendChild(sq); this.cells[name]=sq;
    }
    el.addEventListener("pointerdown",e=>this._down(e));
    el.addEventListener("pointermove",e=>this._move(e));
    el.addEventListener("pointerup",e=>this._up(e));
    el.addEventListener("pointercancel",()=>this._cancelDrag());
    el.addEventListener("contextmenu",e=>{ if(this.interactive) e.preventDefault(); });
  }
  // show a position. last = [from,to] to highlight, turn = "w"/"b" for whose pieces can be moved
  set(fen,{last=null,turn=null}={}){
    this._cancelDrag();               // a drag from the old position must not carry over (e.g. pressing S mid-drag)
    this.pos=parseFen(fen); this.last=last; this.turn=turn; this.sel=null; this.hintSq=null; this.render();
  }
  setInteractive(on){ this.interactive=on; this.el.classList.toggle("live",on); if(!on){ this.sel=null; this._cancelDrag(); } this.render(); }
  hint(sq){ this.hintSq=sq; this.render(); }
  wrong(sq){
    this.wrongSq=sq; this.render();
    clearTimeout(this._wt); this._wt=setTimeout(()=>{ this.wrongSq=null; this.render(); },450);
  }
  render(){
    // dots on the squares the selected piece can legally move to (rings on captures), like chess.com
    const targets=new Map();
    if(this.interactive && this.sel && this.legalFor) for(const m of this.legalFor(this.sel)) targets.set(m.to, m.capture);
    for(const [name,sq] of Object.entries(this.cells)){
      sq.classList.toggle("dot", targets.has(name) && !targets.get(name));
      sq.classList.toggle("ring", targets.has(name) && !!targets.get(name));
      sq.classList.toggle("hl", !!(this.last && this.last.includes(name)));
      sq.classList.toggle("sel", this.sel===name);
      sq.classList.toggle("hintsq", this.hintSq===name);
      sq.classList.toggle("wrongsq", this.wrongSq===name);
      let pc=sq.querySelector(".pc");
      const p=this.pos[name];
      if(!p){ if(pc) pc.remove(); continue; }
      if(!pc){ pc=document.createElement("span"); sq.appendChild(pc); }
      pc.className="pc "+(isWhite(p)?"w":"b")+(this.drag&&this.drag.from===name&&this.drag.moved?" lifted":"");
      pc.textContent=GLYPH[p.toLowerCase()]+"︎";
    }
  }
  _sqAt(x,y){   // which square is under the pointer (asks the squares themselves, so it can't drift)
    for(const [name,sq] of Object.entries(this.cells)){
      const r=sq.getBoundingClientRect();
      if(x>=r.left && x<r.right && y>=r.top && y<r.bottom) return name;
    }
    return null;
  }
  _mine(sq){ const p=this.pos[sq]; return p && (!this.turn || (this.turn==="w")===isWhite(p)); }
  _down(e){
    if(!this.interactive || e.button>0) return;
    const sq=this._sqAt(e.clientX,e.clientY); if(!sq) return;
    e.preventDefault();
    // click-to-move: a piece is already selected and you clicked somewhere else
    if(this.sel && sq!==this.sel && !this._mine(sq)){ const f=this.sel; this.sel=null; this._try(f,sq); return; }
    if(!this._mine(sq)){ this.sel=null; this.render(); return; }
    this.drag={from:sq, x:e.clientX, y:e.clientY, moved:false, wasSel:this.sel===sq};
    this.sel=sq;
    try{ this.el.setPointerCapture(e.pointerId); }catch(_){}
    this.render();
  }
  _move(e){
    const d=this.drag; if(!d) return;
    if(!d.moved && Math.hypot(e.clientX-d.x,e.clientY-d.y)>4){
      d.moved=true;
      const g=document.createElement("span"), p=this.pos[d.from];
      g.className="pc ghost "+(isWhite(p)?"w":"b"); g.textContent=GLYPH[p.toLowerCase()]+"︎";
      g.style.fontSize=getComputedStyle(this.cells[d.from].querySelector(".pc")).fontSize;
      document.body.appendChild(g); d.ghost=g; this.render();
    }
    if(d.ghost){ d.ghost.style.left=e.clientX+"px"; d.ghost.style.top=e.clientY+"px"; }
  }
  _up(e){
    const d=this.drag; if(!d) return;
    this._cancelDrag();
    const to=this._sqAt(e.clientX,e.clientY);
    if(d.moved){
      this.sel=null;
      if(to && to!==d.from) this._try(d.from,to); else this.render();
    } else if(d.wasSel){ this.sel=null; this.render(); }   // clicked the selected piece again: deselect
  }
  _cancelDrag(){ if(this.drag&&this.drag.ghost) this.drag.ghost.remove(); this.drag=null; }
  _try(from,to){
    const ok=this.onMove ? this.onMove(from,to) : false;
    if(!ok){ this.wrong(to); }   // wrong move: piece snaps back (we never changed the position)
    else this.render();
  }
}

// move list as HTML: "1.e4 e5 2.Nf3 ..."; upto = how many moves to show; cur = which one to mark
function moveListHTML(moves,{upto=moves.length, cur=-1, clickable=false, hideRest=false}={}){
  let out="";
  moves.forEach((m,i)=>{
    if(i%2===0) out+=`<span class="n">${i/2+1}.</span>`;
    if(i<upto) out+=`<span class="mv${i===cur?" cur":""}${clickable?" click":""}" data-i="${i}">${m}</span> `;
    else if(!hideRest) out+=`<span class="mv todo">…</span> `;
  });
  return out.trim();
}

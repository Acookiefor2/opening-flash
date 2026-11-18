/* ---------- rebuild: play an opening's moves from memory, both sides, exact order ---------- */
// Used by Training → Rebuild and by Flash's "Rebuild it" challenge.
class RebuildSession{
  constructor(board, opening, {onUpdate=()=>{}, onDone=()=>{}}={}){
    this.b=board; this.o=opening; this.onUpdate=onUpdate; this.onDone=onDone;
  }
  get n(){ return this.o.plies.length; }
  get turn(){ return this.ply%2===0 ? "w" : "b"; }
  get expected(){ return this.o.plies[this.ply]; }
  start(){
    this.ply=0; this.mistakes=0; this.hints=0; this.shown=0; this.done=false; this.gaveUp=false;
    this.dirty=new Array(this.n).fill(false);      // a move is "first try" only if no mistake, hint or show on it
    this.t0=performance.now();
    this.b.onMove=(f,t)=>this.move(f,t);
    this.b.set(START_FEN,{turn:"w"});
    this.b.setInteractive(true);
    this.onUpdate(this,"start");
  }
  move(from,to){
    if(this.done) return false;
    const e=this.expected;
    const ok = from===e[0] && (to===e[1] || (e[3] && to===e[3]));   // e[3]: castling by dropping the king on its rook
    if(ok){ this._advance(); return true; }
    this.mistakes++; this.dirty[this.ply]=true;
    this.onUpdate(this,"wrong");
    return false;
  }
  hint(){
    if(this.done) return;
    if(this.b.hintSq!==this.expected[0]) this.hints++;   // pressing Hint again on the same move doesn't count twice
    this.dirty[this.ply]=true;
    this.b.hint(this.expected[0]);                  // grey out the piece to move, not where it goes
    this.onUpdate(this,"hint");
  }
  show(){
    if(this.done) return;
    this.shown++; this.dirty[this.ply]=true;
    this._advance("shown");
  }
  giveUp(){
    if(this.done) return;
    for(let i=this.ply;i<this.n;i++) this.dirty[i]=true;
    this.gaveUp=true; this._finish();
  }
  get firstTry(){ return this.dirty.filter(d=>!d).length; }
  get perfect(){ return !this.gaveUp && this.firstTry===this.n; }
  get secs(){ return ((this.doneAt||performance.now())-this.t0)/1000; }
  _advance(why){
    const e=this.expected; this.ply++;
    this.b.set(e[2],{last:[e[0],e[1]], turn:this.turn});
    if(this.ply>=this.n) return this._finish();
    this.onUpdate(this, why||"ok");
  }
  _finish(){
    this.done=true; this.doneAt=performance.now();
    this.b.setInteractive(false);
    if(this.gaveUp){ const last=this.o.plies[this.n-1]; this.b.set(last[2],{last:[last[0],last[1]]}); }
    this.onUpdate(this,"done"); this.onDone(this);
  }
}

// the side panel that goes with a rebuild: status, moves so far, Hint / Show move / Give up
function rebuildPanelHTML(id){
  return `
    <div class="rb-status" id="${id}-status"></div>
    <div class="moves" id="${id}-moves"></div>
    <div class="btns">
      <button class="btn" id="${id}-hint">Hint <kbd>H</kbd></button>
      <button class="btn" id="${id}-show">Show move <kbd>S</kbd></button>
      <button class="btn" id="${id}-giveup">Give up</button>
    </div>
    <div class="rb-msg" id="${id}-msg"></div>`;
}
function bindRebuildPanel(id, getSession){
  $(id+"-hint").onclick=()=>{ const s=getSession(); s&&s.hint(); };
  $(id+"-show").onclick=()=>{ const s=getSession(); s&&s.show(); };
  $(id+"-giveup").onclick=()=>{ const s=getSession(); s&&s.giveUp(); };
}
function updateRebuildPanel(id, s, why){
  const st=$(id+"-status"), mv=$(id+"-moves"), msg=$(id+"-msg");
  mv.innerHTML=moveListHTML(s.o.moves,{upto:s.ply, cur:s.ply-1});
  if(s.done){
    st.innerHTML=s.gaveUp ? `Gave up after ${s.ply} of ${s.n} moves`
      : `Done in ${s.secs.toFixed(1)}s`;
    msg.className="rb-msg "+(s.perfect?"good":s.gaveUp?"bad":"half");
    msg.innerHTML = s.perfect ? `Perfect! All ${s.n} moves first try.`
      : `${s.firstTry} of ${s.n} moves first try · ${s.mistakes} wrong · ${s.hints} hint${s.hints===1?"":"s"} · ${s.shown} shown`;
    ["hint","show","giveup"].forEach(k=>$(id+"-"+k).disabled=true);
    mv.innerHTML=moveListHTML(s.o.moves);
    return;
  }
  ["hint","show","giveup"].forEach(k=>$(id+"-"+k).disabled=false);
  st.innerHTML=`Move ${Math.floor(s.ply/2)+1} · <b>${s.turn==="w"?"White":"Black"}</b> to play <span class="dim">(${s.ply} of ${s.n} done)</span>`;
  msg.className="rb-msg";
  msg.innerHTML = why==="wrong" ? `<span style="color:var(--bad)">Not that one. Try again.</span>`
    : why==="hint" ? `The grey piece moves next.`
    : why==="shown" ? `That was ${s.o.moves[s.ply-1]}.` : "";
}

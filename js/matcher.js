/* ---------- opening sets + name matching ----------
   Two sets: "popular" (our 153, with nicknames) and "lichess" (3,865 lines from the Lichess database).
   Every opening knows its set; judge(answer, opening) checks an answer against that opening's set. */

// words that carry no meaning in an answer
const FILLER = new Set(["the","of","a","an","and","variation","variations","var","it","its","is","i","think","thats","that",
  "this","im","um","uh","er","hmm","maybe","probably","guess","like","so","ok","okay","yeah","well","wait","with"]);
// words naming the KIND of opening. You can leave them out, but they still count when you say them
const TYPE = new Set(["attack","defense","game","opening","system"]);
// saying one of these when the opening doesn't have it means you named a different opening
// (King's Indian Attack vs King's Indian Defense)
const CONFLICT = new Set(["attack","defense"]);

function norm(s){
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
    .replace(/['’`]/g,"").replace(/[^a-z0-9]+/g," ")
    .replace(/\bdefence\b/g,"defense").replace(/\bcounter gambit\b/g,"countergambit").trim();
}
function stem(t){ return (t.length>3 && t.endsWith("s") && !t.endsWith("ss")) ? t.slice(0,-1) : t; }
function toks(s){ return norm(s).split(" ").filter(Boolean).map(stem).filter(t=>!FILLER.has(t)); }
// drop anything you negated: "King's Indian Attack, not Defense" -> "King's Indian Attack"
function stripNegation(s){
  s=s.toLowerCase().replace(/’/g,"'");
  s=s.split(/[,.;!?]|\bbut\b/).filter(cl=>!/^\s*(not|isn'?t|no)\b/.test(cl)).join(" ");
  return s.replace(/\b(not|isn'?t)\b.*$/,"");
}
function lev(a,b){
  const m=a.length,n=b.length; if(Math.abs(m-n)>2) return 9;
  let p=[...Array(n+1).keys()];
  for(let i=1;i<=m;i++){ const c=[i]; for(let j=1;j<=n;j++) c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1)); p=c; }
  return p[n];
}
function tokFuzzy(want, have){
  const tol = want.length>=8 ? 2 : want.length>=4 ? 1 : 0;
  return tol>0 && lev(want,have)<=tol;
}
// Match one candidate name against the answer. Each answer word can be used ONCE,
// so "Two Knights" can't satisfy "Two Knights: Knight Attack" (needs knight twice).
// Returns null, or {used:Set of answer word positions, missing: type words of the name you left out}
function matchCand(a, cand){
  const used=new Set(); let missing=0, fuzzy=0;
  const core=cand.filter(w=>!TYPE.has(w)), types=cand.filter(w=>TYPE.has(w));
  if(!core.length) return null;
  const pending=[];
  for(const w of core){ const i=a.findIndex((h,k)=>!used.has(k)&&h===w); if(i<0) pending.push(w); else used.add(i); }
  for(const w of pending){ const i=a.findIndex((h,k)=>!used.has(k)&&tokFuzzy(w,h)); if(i<0) return null; used.add(i); fuzzy++; }
  for(const w of types){ const i=a.findIndex((h,k)=>!used.has(k)&&h===w); if(i<0) missing++; else used.add(i); }
  return {used, missing, fuzzy};
}
// extra sound-alike spellings, mostly for voice (by family name, so they work in both sets)
const EXTRA = {
  "Caro-Kann Defense":["caro khan","carrot can","caro can","karo kann","carokann"],
  "Grünfeld Defense":["green field","greenfield"],
  "Ruy Lopez":["roy lopez","rui lopez","ruy lopes"],
  "Slav Defense":["slough","slough defense","slave defense"],
  "Wayward Queen Attack":["scholars mate","scholar mate"],
};

// "Sicilian Defense: Najdorf Variation, English Attack" -> family "Sicilian Defense",
// parts ["Najdorf Variation","English Attack"], parents ["Sicilian Defense","Sicilian Defense: Najdorf Variation"]
function splitName(name){
  const i=name.indexOf(":");
  if(i<0){ const [fam,...rest]=name.split(/,\s*/); return {family:fam, parts:rest}; }
  return {family:name.slice(0,i), parts:name.slice(i+1).split(/,\s*/).map(s=>s.trim()).filter(Boolean)};
}
// names with the same words count as the same name ("Keene Defense" / "Keene's Defense")
function nameKey(n){ return toks(n).sort().join(" "); }
function parentNames(name){
  const {family,parts}=splitName(name), out=[family];
  for(let k=1;k<parts.length;k++) out.push(family+": "+parts.slice(0,k).join(", "));
  return out.filter(n=>n!==name);
}

// Prepare a set for matching: candidate names per opening, a word index so voice stays fast, sound keys.
function prepareSet(id, list){
  const set={id, list, byName:{}};
  list.forEach(o=>{ o.set=set; (set.byName[o.name] ||= []).push(o); });
  // a variation name you can say WITHOUT the family, but only if it belongs to one family
  // ("Najdorf" yes; "Exchange Variation" exists in loads of openings, so no)
  const varFams={};
  list.forEach(o=>{ const {family,parts}=splitName(o.name); if(parts[0]){ const k=toks(parts[0]).join(" "); (varFams[k] ||= new Set()).add(family); } });
  // ...and not if those words are already the name of another opening ("Four Knights", "Modern", "Stonewall")
  const ownNames=new Map();   // words -> families that use them as a name or nickname
  list.forEach(o=>{ const fam=splitName(o.name).family;
    [o.name.includes(":")?fam:o.name, ...o.aliases, fam].forEach(n=>{ const k=toks(n).filter(w=>!TYPE.has(w)).join(" ");
      if(!ownNames.has(k)) ownNames.set(k,new Set()); ownNames.get(k).add(fam); }); });
  list.forEach(o=>{
    const {family,parts}=splitName(o.name);
    o.family = o.family || family;
    const root=(set.byName[o.family]||[])[0];
    const famNames=[o.family, ...(root?root.aliases:[]), ...(EXTRA[o.family]||[])];
    const cands=[o.name, ...o.aliases, ...[o.name,...o.aliases].flatMap(n=>EXTRA[n]||[])];
    if(parts.length){
      const sub=parts.join(" ");
      famNames.forEach(f=>cands.push(f+" "+sub));
      const k=toks(parts[0]).join(" ");
      const core=toks(parts[0]).filter(w=>!TYPE.has(w)).join(" ");
      const users=ownNames.get(core);
      if(varFams[k] && varFams[k].size===1 && core && !(users && [...users].some(f=>f!==family))) cands.push(sub);
    }
    o.cands = cands.map(toks).filter(t=>t.some(w=>!TYPE.has(w)));
    o.cores = o.cands.map(t=>t.filter(w=>!TYPE.has(w)));
    o.types = new Set(o.cands.flat().filter(w=>CONFLICT.has(w)));
    o.keys = o.cands.map(t=>soundKey(t.filter(w=>!TYPE.has(w)).join("")));
    // naming one of these gets half a point: its family, and (Lichess) the shorter names it extends
    o.parents = [...new Set([...parentNames(o.name), o.family])].filter(n=>n!==o.name).map(nameKey);
    o.nkey = nameKey(o.name);
    o.root = root && root!==o ? root : o;
  });
  // word index: word -> openings whose names contain it (only real name words; "defense" alone can't name anything)
  set.index=new Map();
  list.forEach(o=>new Set(o.cands.flat().filter(w=>!TYPE.has(w))).forEach(w=>{ if(!set.index.has(w)) set.index.set(w,new Set()); set.index.get(w).add(o); }));
  set.vocab=[...set.index.keys()];
  set.near=new Map();   // cache: answer word -> name words within a typo or two of it
  return set;
}
function nearWords(set, h){
  if(set.near.has(h)) return set.near.get(h);
  const out=[];
  if(h.length>=3) for(const w of set.vocab) if(w!==h && Math.abs(w.length-h.length)<=2 && tokFuzzy(w,h)) out.push(w);
  if(set.near.size>5000) set.near.clear();
  set.near.set(h,out); return out;
}
// only look at openings that share at least one word (exactly or nearly) with the answer
function candidatesFor(set, a){
  const out=new Set();
  for(const h of a){
    if(TYPE.has(h)) continue;
    const s=set.index.get(h); if(s) s.forEach(o=>out.add(o));
    for(const w of nearWords(set,h)) set.index.get(w).forEach(o=>out.add(o));
  }
  return out;
}

// Work out which opening the answer names.
// Returns {kind:"none"|"nomatch"|"hedge"|"ok", winners:[openings]}
function identify(answer, set){
  const a = toks(stripNegation(answer));
  if(!a.some(w=>!TYPE.has(w))) return {kind:"none"};
  const said = a.filter(w=>CONFLICT.has(w));
  let found=[];
  // every name word that's in the answer, or one typo away from a word in it
  const reach=new Set(a); a.forEach(h=>{ if(!TYPE.has(h)) nearWords(set,h).forEach(w=>reach.add(w)); });
  for(const o of candidatesFor(set,a)){
    if(said.some(w=>!o.types.has(w))) continue;          // you said "attack", this one is a "defense"
    let best=null;
    for(let ci=0;ci<o.cands.length;ci++){
      if(!o.cores[ci].every(w=>reach.has(w))) continue;    // quick skip: needs a word you didn't say
      const m=matchCand(a,o.cands[ci]); if(!m) continue;
      if(!best || m.used.size>best.used.size || (m.used.size===best.used.size &&
         (m.missing<best.missing || (m.missing===best.missing && m.fuzzy<best.fuzzy)))) best=m;
    }
    if(best) found.push({o, used:best.used, missing:best.missing, fuzzy:best.fuzzy, key:[...best.used].sort((x,y)=>x-y).join(",")});
  }
  if(!found.length) return {kind:"nomatch"};
  // keep only matches not contained in a bigger match ("Scotch" is inside "Four Knights Scotch")
  const sub=(x,y)=>x.used.size<y.used.size && [...x.used].every(i=>y.used.has(i));
  found=found.filter(f=>!found.some(g=>sub(f,g)));
  // two different names in one answer ("French Sicilian") = hedging, no credit
  if(new Set(found.map(f=>f.key)).size>1) return {kind:"hedge"};
  // ties: prefer names you said in full, then names spelled exactly ("kings" is one letter off "wing")
  const minMiss=Math.min(...found.map(f=>f.missing));
  found=found.filter(f=>f.missing===minMiss);
  const minFz=Math.min(...found.map(f=>f.fuzzy));
  return {kind:"ok", winners:found.filter(f=>f.fuzzy===minFz).map(f=>f.o)};
}

// rough "sounds like" key: garrogan -> karakan, caro kann -> karakan
function soundKey(s){
  s=s.toLowerCase().replace(/[^a-z]/g,"")
    .replace(/ph/g,"f").replace(/sch/g,"sk").replace(/tch/g,"c").replace(/ch/g,"k");
  let out="";
  for(const ch of s){
    let c=ch;
    if("aeiouy".includes(c)) c="a";
    else if("ckqgx".includes(c)) c="k";
    else if("sz".includes(c)) c="s";
    else if("dt".includes(c)) c="t";
    else if("bp".includes(c)) c="p";
    else if("fvw".includes(c)) c="f";
    else if("mn".includes(c)) c="n";
    else if(c==="h") continue;
    if(out[out.length-1]!==c) out+=c;
  }
  return out;
}
// edit distance, giving up as soon as it's more than max (returns max+1)
function levFull(a,b,max=99){
  if(Math.abs(a.length-b.length)>max) return max+1;
  let p=new Array(b.length+1); for(let j=0;j<=b.length;j++) p[j]=j;
  for(let i=1;i<=a.length;i++){
    const c=new Array(b.length+1); c[0]=i; let rowMin=i;
    for(let j=1;j<=b.length;j++){ c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1)); if(c[j]<rowMin) rowMin=c[j]; }
    if(rowMin>max) return max+1;
    p=c;
  }
  return p[b.length];
}
const tolFor=k=>k.length<6?0:Math.floor(k.length/4);   // short names must sound exactly right
// only used when the words matched nothing at all (speech-to-text mangled the name)
function identifyBySound(answer, set){
  const a=soundKey(toks(stripNegation(answer)).filter(w=>!TYPE.has(w)).join(""));
  if(a.length<4) return [];
  let best=99, out=[];
  for(const o of set.list){
    let d=99;
    for(const k of o.keys){ const tol=Math.min(tolFor(k), best<99?best:99); if(Math.abs(k.length-a.length)>tol) continue; const dd=levFull(a,k,tol); if(dd<=tol) d=Math.min(d,dd); }
    if(d<best){best=d;out=[o];} else if(d===best && d<99) out.push(o);
  }
  return out;
}
// "good" = right opening, "half" = you named something it's part of (its family or a parent variation),
// "bad" = wrong, "none" = nothing said
function judge(answer, target){
  const set=target.set;
  const r=identify(answer,set);
  if(r.kind==="none") return "none";
  if(r.kind==="hedge") return "bad";
  const winners = r.kind==="ok" ? r.winners : identifyBySound(answer,set);
  if(winners.some(w=>w.nkey===target.nkey)) return "good";     // same name (Lichess lists some names at several depths)
  if(winners.some(w=>target.parents.includes(w.nkey))) return "half";
  return "bad";
}

/* ---------- the two sets ---------- */
// Lichess lines come as moves only; work out each position here (saves ~2 MB of download)
function applyUci(pos, uci){
  const f=uci.slice(0,2), t=uci.slice(2,4), promo=uci[4], p=pos[f], np={...pos};
  delete np[f];
  let alt=null;
  if((p==="P"||p==="p") && f[0]!==t[0] && !pos[t]) delete np[t[0]+f[1]];                       // en passant
  if((p==="K"||p==="k") && Math.abs(FILES.indexOf(f[0])-FILES.indexOf(t[0]))===2){              // castling: move the rook too
    const r=f[1], ks=t[0]==="g", rf=(ks?"h":"a")+r, rt=(ks?"f":"d")+r; np[rt]=np[rf]; delete np[rf]; alt=rf;
  }
  np[t] = promo ? (p===p.toUpperCase()?promo.toUpperCase():promo) : p;
  return [np,alt];
}
function posToFen(pos){
  const rows=[];
  for(let r=8;r>=1;r--){ let row="",e=0;
    for(const c of FILES){ const p=pos[c+r]; if(p){ if(e){row+=e;e=0;} row+=p; } else e++; }
    if(e) row+=e; rows.push(row); }
  return rows.join("/");
}
function buildLichess(){
  return LICHESS_RAW.map(([name,eco,san,uci,al])=>{
    let pos=parseFen(START_FEN); const plies=[];
    for(const u of uci.split(" ")){
      const [np,alt]=applyUci(pos,u); pos=np;
      const ply=[u.slice(0,2),u.slice(2,4),posToFen(pos)]; if(alt) ply.push(alt); plies.push(ply);
    }
    const last=plies[plies.length-1];
    return {name, eco, family:splitName(name).family, moves:san.split(" "), plies, fen:last[2], last:[last[0],last[1]], aliases:al||[]};
  });
}
const SETS={};
function getSet(id){
  if(!SETS[id]) SETS[id]=prepareSet(id, id==="lichess" ? buildLichess() : OPENINGS);
  return SETS[id];
}
// old names still used by the tests
const BYNAME={}; getSet("popular").list.forEach(o=>BYNAME[o.name]=o);

// the Lichess file is big (≈550 KB), so it's only downloaded the first time you pick that set
let lichessLoading=null;
function ensureSet(id){
  if(id!=="lichess") return Promise.resolve(getSet("popular"));
  if(typeof LICHESS_RAW!=="undefined") return Promise.resolve(getSet("lichess"));
  lichessLoading ||= new Promise((res,rej)=>{
    const s=document.createElement("script"); s.src="js/lichess.js";
    s.onload=()=>res(); s.onerror=()=>{ lichessLoading=null; rej(new Error("couldn't load the Lichess openings")); };
    document.head.appendChild(s);
  });
  return lichessLoading.then(()=>getSet("lichess"));
}

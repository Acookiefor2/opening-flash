/* ---------- name matching ---------- */
// words that carry no meaning in an answer
const FILLER = new Set(["the","of","a","an","and","variation","variations","var","it","its","is","i","think","thats","that",
  "this","im","um","uh","er","hmm","maybe","probably","guess","like","so","ok","okay","yeah","well","wait"]);
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
// extra sound-alike spellings, mostly for voice
const EXTRA = {
  "Caro-Kann Defense":["caro khan","carrot can","caro can","karo kann","carokann"],
  "Grünfeld Defense":["green field","greenfield"],
  "Ruy Lopez":["roy lopez","rui lopez","ruy lopes"],
};
const BYNAME = {};
OPENINGS.forEach(o=>BYNAME[o.name]=o);
OPENINGS.forEach(o=>{
  const fam = BYNAME[o.family];
  const sub = o.name.includes(":") ? o.name.split(":")[1] : "";
  const cands = [o.name, ...o.aliases, ...(EXTRA[o.name]||[])];
  if(sub) [o.family, ...(fam?fam.aliases:[]), ...(EXTRA[o.family]||[])].forEach(f=>cands.push(f+" "+sub));
  o.cands = cands.map(toks).filter(t=>t.some(w=>!TYPE.has(w)));
  o.types = new Set(o.cands.flat().filter(w=>CONFLICT.has(w)));
  o.keys = o.cands.map(t=>soundKey(t.filter(w=>!TYPE.has(w)).join("")));
  o.root = fam || o;   // the plain family entry, e.g. "Sicilian Defense" for the Najdorf
});

// Work out which opening the answer names.
// Returns {kind:"none"|"nomatch"|"hedge"|"ok", winners:[openings]}
function identify(answer){
  const a = toks(stripNegation(answer));
  if(!a.some(w=>!TYPE.has(w))) return {kind:"none"};
  const said = a.filter(w=>CONFLICT.has(w));
  let found=[];
  for(const o of OPENINGS){
    if(said.some(w=>!o.types.has(w))) continue;          // you said "attack", this one is a "defense"
    let best=null;
    for(const c of o.cands){
      const m=matchCand(a,c); if(!m) continue;
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
function levFull(a,b){
  let p=[...Array(b.length+1).keys()];
  for(let i=1;i<=a.length;i++){ const c=[i]; for(let j=1;j<=b.length;j++) c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1)); p=c; }
  return p[b.length];
}
const tolFor=k=>k.length<6?0:Math.floor(k.length/4);   // short names must sound exactly right
// only used when the words matched nothing at all (speech-to-text mangled the name)
function identifyBySound(answer){
  const a=soundKey(toks(stripNegation(answer)).filter(w=>!TYPE.has(w)).join(""));
  if(a.length<4) return [];
  let best=99, set=[];
  for(const o of OPENINGS){
    let d=99;
    for(const k of o.keys){ const dd=levFull(a,k); if(dd<=tolFor(k)) d=Math.min(d,dd); }
    if(d<best){best=d;set=[o];} else if(d===best && d<99) set.push(o);
  }
  return set;
}
// "good" = right opening, "half" = you named only its family, "bad" = wrong, "none" = nothing said
function judge(answer, target){
  const r=identify(answer);
  if(r.kind==="none") return "none";
  if(r.kind==="hedge") return "bad";
  const winners = r.kind==="ok" ? r.winners : identifyBySound(answer);
  if(winners.includes(target)) return "good";
  if(target.root!==target && winners.includes(target.root)) return "half";
  return "bad";
}


/* ---------- top bar: Flash | Study | Rebuild (pages live in the URL hash, so links and Back work) ---------- */
let currentPage="flash";
function route(){
  const page=(location.hash.replace("#","")||"flash");
  const valid=["flash","study","rebuild"].includes(page)?page:"flash";
  if(valid!=="flash" && currentPage==="flash") abortRun();   // leaving Flash mid-run ends the run
  if(valid!=="flash") stopMicTest();
  currentPage=valid;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("on",p.id==="page-"+valid));
  document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("on",a.getAttribute("href")==="#"+valid));
  $("stats").style.visibility = valid==="flash" ? "visible" : "hidden";
  if(valid==="study" && !studyCur) studyPicker.pick(OPENINGS[0]);
}
window.addEventListener("hashchange",route);
route();

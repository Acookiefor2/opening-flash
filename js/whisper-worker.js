// Whisper runs here, in the background, so the page doesn't freeze while it listens.
let asr=null;
self.onmessage=async e=>{
  const m=e.data;
  try{
    if(m.type==="load"){
      const T=await import(m.url);
      T.env.allowLocalModels=false;
      asr=await T.pipeline("automatic-speech-recognition", m.model,
        {dtype:"q8", device:"wasm", progress_callback:p=>self.postMessage({type:"progress",p})});
      self.postMessage({type:"ready"});
    } else if(m.type==="run"){
      const out=await asr(m.audio);
      self.postMessage({type:"text", id:m.id, text:(out&&out.text)||""});
    }
  }catch(err){ self.postMessage({type:"error", id:m.id, msg:String((err&&err.message)||err)}); }
};

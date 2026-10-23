/* Whetstone 1.1.0 — independent local inference / filtering pipeline. */
'use strict';
importScripts('smooth.js');
let session=null,sessionKind=null,engine='';
let aiCache=null,aiCacheKey=null,aiCacheEngine='';
const MODEL='models/scunet_color_real_psnr.onnx';
function report(text,pct){self.postMessage({type:'progress',text,pct});}
async function loadSession(backend){
 const target=backend==='cpu'?'cpu':'auto';
 if(session&&sessionKind===target)return;
 if(!self.ort)importScripts('vendor/ort.all.min.js');
 ort.env.wasm.wasmPaths=new URL('vendor/',self.location.href).href;
 ort.env.wasm.numThreads=self.crossOriginIsolated?Math.max(1,Math.min(4,(navigator.hardwareConcurrency||2)-1)):1;
 ort.env.logLevel='error';
 if(session){await session.release();session=null;}
 const options={externalData:[{path:'scunet_color_real_psnr.onnx.data',data:new URL(MODEL+'.data',self.location.href).href}],graphOptimizationLevel:'all'};
 if(target==='auto'&&navigator.gpu){
  try{
   report('正在準備 AI 模型與顯示卡…',1);
   session=await ort.InferenceSession.create(new URL(MODEL,self.location.href).href,{...options,executionProviders:['webgpu','wasm']});
   engine='SCUNet · WebGPU（部分算子可能使用 CPU）';
  }catch(err){console.warn('WebGPU initialization failed; using CPU.',String(err));}
 }
 if(!session){
  report('正在準備 AI 模型 · CPU 相容模式…',1);
  session=await ort.InferenceSession.create(new URL(MODEL,self.location.href).href,{...options,executionProviders:['wasm']});
  engine='SCUNet · CPU / WASM';
 }
 sessionKind=target;
 self.postMessage({type:'engine',engine});
}
function reflect(i,n){if(n<2)return 0;const period=2*n-2;i=((i%period)+period)%period;return i<n?i:period-i;}
function starts(length,core,step){const v=[0];while(v[v.length-1]+core<length)v.push(v[v.length-1]+step);return v;}
async function runAI(src,w,h,backend){
 await loadSession(backend);
 // 256px model tile, 32px reflected halo, 32px output overlap.
 // Every output pixel is accumulated with a feathered weight; no image resize.
 const tile=256,halo=32,core=192,overlap=32,step=core-overlap,N=tile*tile;
 const xs=starts(w,core,step),ys=starts(h,core,step),total=xs.length*ys.length;
 const sum=new Float32Array(w*h*3),weights=new Float32Array(w*h);
 let done=0;
 for(const y0 of ys)for(const x0 of xs){
  const input=new Float32Array(3*N);
  for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
   const sy=reflect(y0+y-halo,h),sx=reflect(x0+x-halo,w),p=(sy*w+sx)*4,k=y*tile+x;
   const a=src[p+3]/255;
   for(let c=0;c<3;c++)input[c*N+k]=(src[p+c]*a+127.5*(1-a))/255;
  }
  const tensor=new ort.Tensor('float32',input,[1,3,tile,tile]);
  let out;
  try{out=await session.run({[session.inputNames[0]]:tensor});}finally{tensor.dispose();}
  try{
   const t=out[session.outputNames[0]],v=await t.getData();
   if(t.dims[2]!==tile||t.dims[3]!==tile||v.length!==3*N)throw new Error('模型輸出尺寸不符。');
   const oh=Math.min(core,h-y0),ow=Math.min(core,w-x0);
   for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
    const wx=Math.min(1,(x+1)/(overlap+1),(core-x)/(overlap+1));
    const wy=Math.min(1,(y+1)/(overlap+1),(core-y)/(overlap+1));
    const weight=wx*wy,p=(y0+y)*w+x0+x,k=(y+halo)*tile+x+halo;
    weights[p]+=weight;
    const a=src[p*4+3]/255;
    for(let c=0;c<3;c++){
     const val=Math.max(0,Math.min(255,v[c*N+k]*255));
     // Undo neutral matte for partially transparent pixels. Alpha itself stays exact.
     const straight=a>.02?(val-127.5*(1-a))/a:src[p*4+c];
     sum[p*3+c]+=Math.max(0,Math.min(255,straight))*weight;
    }
   }
  }finally{for(const v of Object.values(out))v.dispose();}
  done++;report(`AI 清理中 · ${done} / ${total} 區塊`,Math.round(done/total*100));
 }
 const result=new Uint8ClampedArray(src.length);
 for(let p=0;p<w*h;p++){
  if(!weights[p])throw new Error('分塊覆蓋不完整。');
  for(let c=0;c<3;c++)result[p*4+c]=sum[p*3+c]/weights[p];
  result[p*4+3]=src[p*4+3];
 }
 return result;
}
function fastDenoise(src,w,h,noise){
 // Joint RGB bilateral filter: spatial and color weights, with alpha-aware neighbours.
 let current=new Float32Array(src),next=new Float32Array(src.length);
 const sigma=noise*1.8,inv=1/(2*sigma*sigma),radius=2;
 const spatial=[];
 for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)spatial.push([dx,dy,Math.exp(-(dx*dx+dy*dy)/4)]);
 for(let pass=0;pass<2;pass++){
  for(let y=0;y<h;y++){
   for(let x=0;x<w;x++){
    const p=(y*w+x)*4;
    if(src[p+3]===0){for(let c=0;c<4;c++)next[p+c]=src[p+c];continue;}
    let sw=0,r=0,g=0,b=0;
    for(const [dx,dy,ws] of spatial){
     const q=(reflect(y+dy,h)*w+reflect(x+dx,w))*4;
     const dr=current[q]-current[p],dg=current[q+1]-current[p+1],db=current[q+2]-current[p+2];
     const weight=ws*Math.exp(-(dr*dr+dg*dg+db*db)*inv/3)*(src[q+3]/255);
     sw+=weight;r+=current[q]*weight;g+=current[q+1]*weight;b+=current[q+2]*weight;
    }
    next[p]=r/sw;next[p+1]=g/sw;next[p+2]=b/sw;next[p+3]=src[p+3];
   }
   if(y%32===0)report(`快速柔化中 · ${pass+1} / 2`,Math.round((pass+y/h)/2*100));
  }
  [current,next]=[next,current];
 }
 return new Uint8ClampedArray(current);
}
self.onmessage=async e=>{
 const job=e.data,start=performance.now();
 try{
  const src=new Uint8ClampedArray(job.buffer),w=job.width,h=job.height;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>16000000||src.length!==w*h*4)throw new Error('圖片尺寸或資料不正確。');
  let result;
  if(job.mode==='smooth'){engine='強力去紋理 · 保邊平滑';self.postMessage({type:'engine',engine});result=textureSmooth(src,w,h,job.textureStrength,job.textureRadius);}
  else if(job.mode==='ai'){
   if(job.cacheKey&&aiCacheKey===job.cacheKey&&aiCache){result=new Uint8ClampedArray(aiCache);engine=aiCacheEngine;self.postMessage({type:'engine',engine});report('重用已完成的 AI 降噪，調整去紋理效果…',0);}
   else {try{result=await runAI(src,w,h,job.backend);}catch(err){
    if(job.backend!=='cpu'&&engine.includes('WebGPU')){
     report('顯示卡未能完成，改用 CPU 重新處理…',0);
     result=await runAI(src,w,h,'cpu');
    }else throw err;
   }
   if(job.cacheKey){aiCache=new Uint8ClampedArray(result);aiCacheKey=job.cacheKey;aiCacheEngine=engine;}
   }
  }else{engine='快速柔化 · 保邊濾波（非 AI）';self.postMessage({type:'engine',engine});result=fastDenoise(src,w,h,job.noise||18);}
  if(job.mode==='ai'&&job.textureStrength>0){report('AI 降噪完成，正在清理殘留紋理…',0);result=textureSmooth(result,w,h,job.textureStrength,job.textureRadius);engine+=' + 保邊去紋理';}
  self.postMessage({type:'done',buffer:result.buffer,width:w,height:h,engine,ms:performance.now()-start},[result.buffer]);
 }catch(err){console.error(err);self.postMessage({type:'error',message:String(err?.message||err)});}
};

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={console,Float32Array,Uint8ClampedArray,Math,Number,Array,performance,URL,self:{postMessage(){}}};
vm.createContext(context);context.importScripts=name=>vm.runInContext(fs.readFileSync(__dirname+'/../dist/'+name,'utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/worker.js','utf8'),context);
vm.runInContext(`
ort={Tensor:class{constructor(type,data,dims){this.data=data;this.dims=dims}dispose(){}}};
sessionKind='cpu';session={inputNames:['image'],outputNames:['out'],run:async feeds=>({out:{dims:feeds.image.dims,getData:async()=>feeds.image.data,dispose(){}}})};
`,context);
(async()=>{
 for(const [w,h] of [[1,1],[1,257],[191,127],[193,195],[513,257]]){
  const src=new Uint8ClampedArray(w*h*4);for(let p=0;p<w*h;p++){src[p*4]=(p*17)%256;src[p*4+1]=(p*31)%256;src[p*4+2]=(p*43)%256;src[p*4+3]=[0,128,255][p%3];}
  context.src=src;context.w=w;context.h=h;
  const out=await vm.runInContext('runAI(src,w,h,"cpu")',context);
  assert.equal(out.length,src.length);
  for(let i=0;i<src.length;i++){if(i%4===3)assert.equal(out[i],src[i],'alpha changed');else assert.ok(Math.abs(out[i]-src[i])<=1,`tile stitching changed pixel ${i}`);}
  console.log(`PASS identity model: ${w}x${h}; full coverage, no seams, original alpha`);
 }
 const w=100,h=100,src=new Uint8ClampedArray(w*h*4);let seed=19,before=0;
 function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return(seed+.5)/4294967296;}
 for(let p=0;p<w*h;p++){for(let c=0;c<3;c++){src[p*4+c]=128+Math.sqrt(-2*Math.log(rand()))*Math.cos(2*Math.PI*rand())*16;before+=(src[p*4+c]-128)**2;}src[p*4+3]=p%5===0?128:255;}
 context.src=src;const out=vm.runInContext('fastDenoise(src,100,100,18)',context);let after=0;for(let i=0;i<out.length;i++){if(i%4===3)assert.equal(out[i],src[i]);else after+=(out[i]-128)**2;}
 assert.ok(after<before*.25,'fast filter should substantially reduce flat-area noise');
 console.log(`PASS bilateral noise RMSE: ${Math.sqrt(before/30000).toFixed(2)} -> ${Math.sqrt(after/30000).toFixed(2)}; alpha unchanged`);
})().catch(e=>{console.error(e);process.exitCode=1});

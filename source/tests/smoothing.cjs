const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={console,Float32Array,Uint8ClampedArray,Math,Number,Array,performance,URL,self:{postMessage(){}}};
vm.createContext(ctx);ctx.importScripts=name=>vm.runInContext(fs.readFileSync(__dirname+'/../dist/'+name,'utf8'),ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../dist/worker.js','utf8'),ctx);
for(const [w,h,r] of [[1,1,24],[2,3,1],[7,5,3],[4,3,24]]){
 ctx.w=w;ctx.h=h;ctx.r=r;ctx.values=Float32Array.from({length:w*h},(_,i)=>(i*53)%123);
 const out=vm.runInContext('boxMean(values,w,h,r)',ctx);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let sum=0,n=0;for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx++){sum+=ctx.values[yy*w+xx];n++;}
  assert.ok(Math.abs(out[y*w+x]-sum/n)<1e-4);
 }
}
console.log('PASS box filter matches direct 2D reference on tiny, odd, and oversized-window cases');
const w=192,h=128,src=new Uint8ClampedArray(w*h*4);let seed=41;
function rand(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return(seed+.5)/4294967296;}
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const p=(y*w+x)*4,base=x>=90&&x<98?35:155;
 const pattern=14*Math.sin(x*2*Math.PI/16)+8*Math.cos(y*2*Math.PI/12);
 for(let c=0;c<3;c++)src[p+c]=base+pattern+(rand()-.5)*12;
 src[p+3]=255;
}
ctx.src=src;ctx.w=w;ctx.h=h;
const old=vm.runInContext('fastDenoise(src,w,h,18)',ctx);
const fresh=vm.runInContext('textureSmooth(src,w,h,60,8)',ctx);
function rmse(a){let sum=0,n=0;for(let y=15;y<112;y++)for(let x=15;x<70;x++)for(let c=0;c<3;c++){sum+=(a[(y*w+x)*4+c]-155)**2;n++;}return Math.sqrt(sum/n);}
function regionMean(a,left,right){let s=0,n=0;for(let y=15;y<112;y++)for(let x=left;x<right;x++){s+=a[(y*w+x)*4];n++;}return s/n;}
const noiseOld=rmse(old),noiseNew=rmse(fresh),contrast=regionMean(fresh,45,70)-regionMean(fresh,91,97);
assert.ok(noiseNew<noiseOld*.65,'new smoothing must reduce structured texture more than old filtering');assert.ok(contrast>90,'high-contrast line must stay visible');
console.log(`PASS synthetic texture RMSE: old=${noiseOld.toFixed(2)}, new=${noiseNew.toFixed(2)}; line contrast=${contrast.toFixed(2)}/120`);
for(const [w,h] of [[1,1],[1,257],[193,195]]){
 const rgba=new Uint8ClampedArray(w*h*4);for(let p=0;p<w*h;p++){rgba[p*4]=70;rgba[p*4+1]=120;rgba[p*4+2]=180;rgba[p*4+3]=[0,128,255][p%3];}
 ctx.src=rgba;ctx.w=w;ctx.h=h;const result=vm.runInContext('textureSmooth(src,w,h,75,12)',ctx);
 assert.equal(result.length,rgba.length);for(let p=0;p<w*h;p++)assert.equal(result[p*4+3],rgba[p*4+3]);
 const zero=vm.runInContext('textureSmooth(src,w,h,0,12)',ctx);assert.deepEqual([...zero],[...rgba]);
}
console.log('PASS alpha preservation, zero-strength identity, odd dimensions and one-pixel edges');

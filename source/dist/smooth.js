/* Whetstone 1.1.0 — edge-preserving spatial texture smoothing. MIT. */
'use strict';
function boxMean(input,w,h,r){
 const tmp=new Float32Array(w*h),out=new Float32Array(w*h);
 // Truncated windows use their actual sample counts, preserving constants at edges.
 for(let y=0;y<h;y++){
  const row=y*w;let sum=0;
  for(let x=0;x<=Math.min(r,w-1);x++)sum+=input[row+x];
  for(let x=0;x<w;x++){
   tmp[row+x]=sum/(Math.min(w-1,x+r)-Math.max(0,x-r)+1);
   if(x-r>=0)sum-=input[row+x-r];
   if(x+r+1<w)sum+=input[row+x+r+1];
  }
 }
 for(let x=0;x<w;x++){
  let sum=0;for(let y=0;y<=Math.min(r,h-1);y++)sum+=tmp[y*w+x];
  for(let y=0;y<h;y++){
   out[y*w+x]=sum/(Math.min(h-1,y+r)-Math.max(0,y-r)+1);
   if(y-r>=0)sum-=tmp[(y-r)*w+x];
   if(y+r+1<h)sum+=tmp[(y+r+1)*w+x];
  }
 }
 return out;
}
function textureSmooth(src,w,h,strength=60,radius=8){
 const n=w*h,s=Math.max(0,Math.min(100,Number(strength)))/100;
 if(!s)return new Uint8ClampedArray(src);
 const r=Math.max(1,Math.min(24,Math.round(radius))),eps=(6+44*s)**2;
 const result=new Uint8ClampedArray(src);
 // Self-guided filtering: local variance retains strong contours while low-contrast
 // grain and repeating texture are suppressed over the user-selected spatial range.
 for(let c=0;c<3;c++){
  const channel=new Float32Array(n),squared=new Float32Array(n);
  for(let p=0;p<n;p++){const alpha=src[p*4+3]/255;const v=src[p*4+c]*alpha+127.5*(1-alpha);channel[p]=v;squared[p]=v*v;}
  const mean=boxMean(channel,w,h,r),corr=boxMean(squared,w,h,r);
  const a=new Float32Array(n),b=new Float32Array(n);
  for(let p=0;p<n;p++){const variance=Math.max(0,corr[p]-mean[p]*mean[p]);a[p]=variance/(variance+eps);b[p]=(1-a[p])*mean[p];}
  const ma=boxMean(a,w,h,r),mb=boxMean(b,w,h,r);
  for(let p=0;p<n;p++){
   const alpha=src[p*4+3]/255;
   if(alpha<.02)continue;
   const filtered=ma[p]*channel[p]+mb[p];
   result[p*4+c]=(filtered-127.5*(1-alpha))/alpha;
  }
  if(typeof report==='function')report(`保邊去紋理中 · ${c+1} / 3 色彩通道`,Math.round((c+1)/3*100));
 }
 return result;
}

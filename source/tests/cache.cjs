const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const messages=[];const ctx={console,Float32Array,Uint8ClampedArray,Math,Number,Array,performance,URL,self:{postMessage:m=>messages.push(m)}};
vm.createContext(ctx);ctx.importScripts=name=>vm.runInContext(fs.readFileSync(__dirname+'/../dist/'+name,'utf8'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/../dist/worker.js','utf8'),ctx);
vm.runInContext(`let modelRuns=0;runAI=async src=>{modelRuns++;engine='test-AI';return new Uint8ClampedArray(src);};`,ctx);
async function run(key){const a=new Uint8ClampedArray(16*16*4).fill(140);for(let p=0;p<256;p++)a[p*4+3]=255;await ctx.self.onmessage({data:{cacheKey:key,mode:'ai',backend:'cpu',width:16,height:16,buffer:a.buffer,textureStrength:60,textureRadius:8}});assert.equal(messages.at(-1).type,'done');}
(async()=>{await run('image1:full');await run('image1:full');assert.equal(vm.runInContext('modelRuns',ctx),1);await run('image2:full');assert.equal(vm.runInContext('modelRuns',ctx),2);console.log('PASS changed smoothing reuses AI inference; loading a different image invalidates cache');})().catch(e=>{console.error(e);process.exitCode=1});

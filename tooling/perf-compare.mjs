import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { addRoot } from '../src/hub/registry.mjs';

async function launch(args, logFile, perfFile, runtime) {
  const started=Date.now(), child=spawn(process.execPath,[path.join(runtime,'src/cli.mjs'),...args],{
    env:{...process.env,ADG_PERF_LOG:perfFile},stdio:['ignore','pipe','pipe'],
  });
  let log='';const append=b=>{log+=b;};child.stdout.on('data',append);child.stderr.on('data',append);
  const exited=new Promise(resolve=>child.once('exit',resolve));
  try {
    const url=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error(`Server readiness timeout: ${log}`)),60000);
      const inspect=()=>{const match=log.match(/ADG: (http:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}};
      child.stdout.on('data',inspect);
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('exit',code=>{clearTimeout(timer);reject(Error(`Server exited ${code}: ${log}`));});
    });
    return {url,started,startupMs:Date.now()-started,async close(){
      child.kill('SIGTERM');await exited;await writeFile(logFile,log);
    }};
  } catch(error) {child.kill('SIGTERM');await exited;await writeFile(logFile,log);throw error;}
}
async function benchmark(url,file,flags) {
  const log=[];
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['tooling/benchmark.mjs',url,file,'--phases',...flags],{stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',b=>log.push(b));child.stderr.on('data',b=>log.push(b));
    child.once('error',reject);child.once('exit',code=>code?reject(Error(`Benchmark exited ${code}: ${Buffer.concat(log)}`)):resolve());
  }).finally(()=>writeFile(file.replace(/\.json$/,'.log'),Buffer.concat(log)));
}
export async function phaseComparison(args) {
  const [input,destination,count='5']=args,project=path.resolve(input),out=path.resolve(destination);
  if(!input||!destination)throw Error('Usage: node tooling/compare.mjs <frozen-project> <output> [runs] --phases [--cold-only] [--scope=all] [--route=direct|hub] [--adg-baseline=<runtime>]');
  const option=name=>args.find(a=>a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const routes=option('route')?[option('route')]:['direct','hub'];
  const scope=option('scope')??'all',records=[];
  const baseline=option('adg-baseline');
  const implementations=baseline?['baseline','current']:['current'];
  await mkdir(out,{recursive:true});
  for(let run=1;run<=Number(count);run++)for(const route of routes)for(const implementation of implementations) {
    const runtime=path.resolve(implementation==='baseline'?baseline:'.');
    const prefix=`${baseline?implementation+'-':''}${route}-${run}`,state=path.join(out,`${prefix}-state`);
    // Refuse accidental cache reuse; warm states belong to this sample only.
    try {await access(state);throw Error(`State already exists: ${state}; choose a fresh output directory`);}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(route==='hub')await addRoot(project,0,state);
    const launchArgs=route==='hub'?['serve','--port=0',`--state-dir=${state}`]:['open',project,'--no-open','--port=0',`--state-dir=${state}`];
    const perfFile=path.join(out,`${prefix}-server.jsonl`);
    let server=await launch(launchArgs,path.join(out,`${prefix}-server.log`),perfFile,runtime);
    const viewerURL=server=>new URL(`${route==='hub'?`p/${path.basename(project).toLowerCase().replace(/[^a-z0-9]+/g,'-')}/`:''}?scope=${encodeURIComponent(scope)}`,server.url).href;
    const record={implementation,runtime,route,run,project,scope,launch:launchArgs,started:server.started,startupMs:server.startupMs};
    try {
      const file=path.join(out,`${prefix}.json`);
      await benchmark(viewerURL(server),file,[...(args.includes('--cold-only')?[]:['--reload']),...(run===1&&args.includes('--trace')?['--trace']:[])]);
      record.result=path.basename(file);
    } finally {await server.close();}
    if(!args.includes('--cold-only')) {
      server=await launch(launchArgs,path.join(out,`${prefix}-restart-server.log`),perfFile,runtime);
      record.restartStarted=server.started;record.restartStartupMs=server.startupMs;
      try {
        const file=path.join(out,`${prefix}-restart.json`);
        await benchmark(viewerURL(server),file,[]);record.restartResult=path.basename(file);
      } finally {await server.close();}
    }
    records.push(record);
    await writeFile(path.join(out,'comparison.json'),JSON.stringify({records},null,2));
    console.log(`${prefix} complete (${record.startupMs} ms startup)`);
  }
}

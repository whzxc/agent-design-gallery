import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runForeground } from '../src/lifecycle.mjs';
import { createOutput, CliError } from '../src/cli-output.mjs';
import { startServer } from '../src/server.mjs';
import { startHub } from '../src/hub.mjs';
import { addRoot } from '../src/hub/registry.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { main } from '../src/cli.mjs';

const key=`adg_${'b'.repeat(64)}`;
const location={source:'design/components/example.tsx',frame:null,theme:null,line:3,column:1};
function controller(command,{closeFailure=false,startupFailure=false}={}) {
  const signals=new EventEmitter(),stdoutEvents=new EventEmitter(),events=[];
  let callbacks,closed=0,resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  const output=createOutput({json:true,command,stdout:line=>{const event=JSON.parse(line);events.push(event);if(event.data?.event==='ready')resolveReady(event);},stderr:()=>{}});
  const pending=runForeground(command,async hooks=>{
    callbacks=hooks;
    if(startupFailure)throw Object.assign(Error('Port busy'),{code:'EADDRINUSE'});
    return {id:'test-instance',url:'http://127.0.0.1:4311/',port:4311,directory:'/project/design',stateDirectory:'/isolated/state',close:async()=>{closed++;if(closeFailure)throw Error('Close failed');}};
  },{output,json:true,signals,stdoutEvents});
  return {signals,stdoutEvents,events,pending,ready,hooks:()=>callbacks,closed:()=>closed};
}

test('foreground open/serve emit one ready, recoverable diagnostics and one stopped event',async()=>{
  for(const command of ['open','serve']) {
    const c=controller(command),ready=await c.ready;
    assert.equal(ready.ok,true);assert.equal(ready.data.pid,process.pid);assert.equal(ready.data.port,4311);
    assert.equal(ready.data.directory,command==='open'?'/project/design':null);
    c.hooks().onDiagnostic(new CliError('SOURCE_BUILD_FAILED',`hook failed ${key}`),location);
    assert.equal(c.events[1].ok,true);assert.equal(c.events[1].warnings[0].code,'SOURCE_BUILD_FAILED');assert.deepEqual(c.events[1].data.location,location);
    assert.ok(!JSON.stringify(c.events).includes(key));
    c.hooks().onDiagnostic(Object.assign(Error('Superseded'),{name:'AbortError'}));
    c.hooks().onFatal(Object.assign(Error('Superseded'),{name:'AbortError'}));
    assert.equal(c.events.length,2);
    c.hooks().onDiagnostic({code:'BROWSER_OPEN_FAILED',message:'Open the viewer in your browser.',next:[]});
    assert.equal(c.events[2].warnings[0].code,'BROWSER_OPEN_FAILED');
    c.signals.emit('SIGINT');c.signals.emit('SIGTERM');
    assert.equal(await c.pending,0);assert.equal(c.closed(),1);
    assert.equal(c.events.filter(event=>event.data?.event==='ready').length,1);
    assert.equal(c.events.filter(event=>event.data?.event==='stopped').length,1);
    assert.equal(c.events.at(-1).data.signal,'SIGINT');
    assert.equal(c.signals.listenerCount('SIGINT'),0);assert.equal(c.signals.listenerCount('SIGTERM'),0);assert.equal(c.stdoutEvents.listenerCount('error'),0);
  }
});

test('fatal events retain the primary cause and close once even when signals and cleanup also fail',async()=>{
  for(const closeFailure of [false,true]) {
    const c=controller('open',{closeFailure});await c.ready;
    c.hooks().onFatal(new CliError('WATCH_FAILED','Watch lost'),location);
    c.hooks().onFatal(Error('Later failure'));c.signals.emit('SIGTERM');
    assert.equal(await c.pending,2);assert.equal(c.closed(),1);
    assert.equal(c.events.length,2);const terminal=c.events[1];
    assert.equal(terminal.ok,false);assert.equal(terminal.error.code,'WATCH_FAILED');assert.deepEqual(terminal.data,{event:'diagnostic',location});
    assert.equal(terminal.warnings.some(warning=>warning.code==='SHUTDOWN_FAILED'),closeFailure);
  }
  const c=controller('serve',{closeFailure:true});await c.ready;c.signals.emit('SIGTERM');
  assert.equal(await c.pending,2);assert.equal(c.events.at(-1).error.code,'SHUTDOWN_FAILED');
  assert.equal(c.events.some(event=>event.data?.event==='stopped'),false);
});

test('startup failure has no ready event; EPIPE closes resources without further stdout',async()=>{
  const startup=controller('serve',{startupFailure:true});
  assert.equal(await startup.pending,2);assert.equal(startup.events.length,1);assert.equal(startup.events[0].data,null);assert.equal(startup.events[0].error.code,'PORT_IN_USE');
  const c=controller('open');await c.ready;
  c.stdoutEvents.emit('error',Object.assign(Error('Pipe closed'),{code:'EPIPE'}));
  assert.equal(await c.pending,2);assert.equal(c.closed(),1);assert.equal(c.events.length,1);
});

test('fatal errors and signals during startup close the eventual handle without advertising readiness',async()=>{
  for(const fatal of [false,true]) {
    const signals=new EventEmitter(),stdoutEvents=new EventEmitter(),events=[];let closed=0;
    const output=createOutput({json:true,command:'serve',stdout:line=>events.push(JSON.parse(line))});
    const code=await runForeground('serve',async callbacks=>{
      if(fatal)callbacks.onFatal(new CliError('STATE_INVALID','Startup state failed'));
      else signals.emit('SIGTERM');
      return {id:'startup',url:'http://127.0.0.1:4311/',port:4311,stateDirectory:'/isolated/state',close:async()=>{closed++;}};
    },{output,json:true,signals,stdoutEvents});
    assert.equal(closed,1);assert.equal(code,fatal?2:0);assert.equal(events.length,1);
    if(fatal){assert.equal(events[0].data,null);assert.equal(events[0].error.code,'STATE_INVALID');}
    else assert.deepEqual(events[0].data,{event:'stopped',signal:'SIGTERM'});
    assert.equal(signals.listenerCount('SIGTERM'),0);
  }
});

test('human readiness remains the benchmark-compatible ADG URL line',async()=>{
  const signals=new EventEmitter(),stdoutEvents=new EventEmitter();let stdout='',stderr='',resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  const output=createOutput({json:false,command:'serve',stdout:text=>{stdout+=text;resolveReady();},stderr:text=>{stderr+=text;}});
  const pending=runForeground('serve',async()=>({id:'human',url:'http://127.0.0.1:4312/',port:4312,stateDirectory:'/isolated/state',close:async()=>{}}),{output,json:false,signals,stdoutEvents});
  await ready;signals.emit('SIGTERM');assert.equal(await pending,0);
  assert.equal(stdout,'ADG: http://127.0.0.1:4312/\n');assert.equal(stderr,'');
});

async function project(t) {
  const root=await realpath(await mkdtemp(path.join(tmpdir(),'adg-lifecycle-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const directory=path.join(root,'project'),stateDirectory=path.join(root,'state');
  await mkdir(path.join(directory,'design/components'),{recursive:true});
  await writeFile(path.join(directory,'adg.config.mjs'),'export default {};');
  await writeFile(path.join(directory,'design/tokens.css'),starterTokens);
  return {root,directory,stateDirectory};
}

test('CLI startup registration failure closes the viewer and keeps hook logs off stdout',async t=>{
  const f=await project(t);let closed=0,stdout='',stderr='',exit;
  await main(['open',f.directory,'--json','--no-open','--state-dir',f.stateDirectory],f.root,{
    stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;},exit:code=>{exit=code;},signals:new EventEmitter(),stdoutEvents:new EventEmitter(),
    openOptions:{
      startViewer:async()=>{console.log(`startup hook ${key}`);return {id:'failed',port:4311,url:'http://127.0.0.1:4311/',directory:f.directory,close:async()=>{closed++;}};},
      register:async()=>{throw Object.assign(Error(`Registration failed ${key}`),{code:'EACCES'});},
    },
  });
  assert.equal(exit,2);assert.equal(closed,1);
  assert.equal(stdout.trimEnd().split('\n').length,1);assert.equal(JSON.parse(stdout).error.code,'IO_FAILED');assert.equal(JSON.parse(stdout).data,null);
  assert.match(stderr,/startup hook \[REDACTED\]/);assert.ok(!`${stdout}${stderr}`.includes(key));
});

test('viewer error wiring reports recoverable source builds and fatal lost watchers in-process',async t=>{
  const f=await project(t),diagnostics=[],fatals=[],watcher=new EventEmitter();let watchClosed=false;
  watcher.close=()=>{watchClosed=true;};
  await writeFile(path.join(f.directory,'design/components/bad.tsx'),'export default()=> <');
  const viewer=await startServer({directory:path.join(f.directory,'design'),stateDirectory:f.stateDirectory,watchDirectory:()=>watcher,onDiagnostic:(error,where)=>diagnostics.push({error,where}),onFatal:error=>fatals.push(error)});
  t.after(()=>viewer.close());
  assert.equal((await fetch(new URL('asset/components%2Fbad.tsx',viewer.url))).status,400);
  assert.equal(diagnostics[0].error.code,'SOURCE_BUILD_FAILED');assert.equal(diagnostics[0].where.source,'design/components/bad.tsx');assert.equal(diagnostics[0].where.line,1);
  assert.ok(diagnostics[0].where.column>=1);assert.deepEqual(fatals,[]);
  assert.equal((await fetch(new URL('api/health',viewer.url))).status,200);
  watcher.emit('error',Error('Watcher stopped'));assert.equal(fatals[0].code,'WATCH_FAILED');
  await viewer.close();assert.equal(watchClosed,true);
});

test('hub project errors are recoverable, ordinary misses stay quiet and corrupt state is fatal',async t=>{
  const f=await project(t),diagnostics=[],fatals=[];
  await addRoot(f.directory,0,f.stateDirectory);
  await writeFile(path.join(f.directory,'adg.config.mjs'),'export default {name:42};');
  const hub=await startHub({port:0,stateDirectory:f.stateDirectory,onDiagnostic:error=>diagnostics.push(error),onFatal:error=>fatals.push(error)});
  t.after(()=>hub.close());
  assert.equal((await fetch(new URL('p/project/manifest',hub.url))).status,400);
  assert.equal(diagnostics[0].code,'CONFIG_INVALID');assert.deepEqual(fatals,[]);
  assert.equal((await fetch(new URL('api/health',hub.url))).status,200);
  await fetch(new URL('p/missing/manifest',hub.url));
  assert.equal((await fetch(new URL('api/projects',hub.url),{headers:{'x-forwarded-proto':'https'}})).status,401);
  assert.equal(diagnostics.length,1);
  await writeFile(path.join(f.stateDirectory,'registry.json'),'{broken');
  assert.equal((await fetch(new URL('api/projects',hub.url))).status,400);assert.equal(fatals[0].code,'STATE_INVALID');
});

test('one isolated subprocess streams readiness before exit, verifies health and cleans SIGTERM state',async t=>{
  const f=await project(t),lines=[];let stderr='',resolveReady,rejectReady;
  await writeFile(path.join(f.directory,'adg.config.mjs'),`console.log('config hook ${key}');export default {};`);
  await writeFile(path.join(f.directory,'design/components/log.tsx'),`import {Frame} from 'adg';console.log('build worker ${key}');export default()=> <Frame name="sample" width={120} height={40}><div>Sample</div></Frame>;`);
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const child=spawn(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,'open',f.directory,'--port=0','--no-open','--state-dir',f.stateDirectory,'--json'],{stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');
  void exited.then(([code])=>rejectReady(Error(`Exited before readiness (${code}): ${stderr}`)));
  const reader=createInterface({input:child.stdout});
  const readerClosed=once(reader,'close');
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  const timer=setTimeout(()=>rejectReady(Error(`Readiness timeout: ${stderr}`)),5000);
  reader.on('line',line=>{try {const envelope=JSON.parse(line);lines.push(envelope);if(envelope.data?.event==='ready'){clearTimeout(timer);resolveReady(envelope.data);}}catch(error){rejectReady(error);}});
  t.after(async()=>{
    clearTimeout(timer);
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    const kill=setTimeout(()=>child.kill('SIGKILL'),5000);
    try {await exited;}finally{clearTimeout(kill);reader.close();}
  });
  const data=await ready;
  assert.equal(child.exitCode,null);assert.equal(data.pid,child.pid);assert.ok(data.port>0);assert.equal(data.stateDirectory,f.stateDirectory);
  const record=path.join(f.stateDirectory,'instances',`${data.instanceId}.json`);
  assert.equal(JSON.parse(await readFile(record,'utf8')).pid,child.pid);
  assert.equal((await(await fetch(new URL('api/health',data.url))).json()).id,data.instanceId);
  assert.equal((await fetch(new URL('asset/components%2Flog.tsx',data.url))).status,200);
  child.kill('SIGTERM');const [code,signal]=await exited;assert.equal(code,0);assert.equal(signal,null);
  // The stdout stream closes after its buffered terminal line is delivered.
  await readerClosed;
  assert.equal(lines.length,2);assert.equal(lines[0].data.event,'ready');assert.deepEqual(lines[1].data,{event:'stopped',signal:'SIGTERM'});assert.equal(lines[1].ok,true);
  assert.deepEqual(await readdir(path.join(f.stateDirectory,'instances')),[]);
  await assert.rejects(fetch(new URL('api/health',data.url)));
  assert.match(stderr,/config hook \[REDACTED\]/);assert.match(stderr,/build worker \[REDACTED\]/);assert.ok(!stderr.includes(key));
});

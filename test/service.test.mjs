import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { main, parseCli } from '../src/cli.mjs';
import { service, renderLaunchAgent, SERVICE_LABEL } from '../src/service.mjs';
import { createOutput, CliError } from '../src/cli-output.mjs';

const key=`adg_${'a'.repeat(64)}`;
const cli=new URL('../src/cli.mjs',import.meta.url).pathname;
async function fixture(t) {
  const home=await mkdtemp(path.join(tmpdir(),'adg-service-')),state=path.join(home,'state'),calls=[];
  t.after(()=>rm(home,{recursive:true,force:true}));
  let loaded=false;
  const options={home,platform:'darwin',uid:99999,nodePath:process.execPath,cliPath:cli,
    run:async(command,args)=>{
      assert.equal(command,'/bin/launchctl');calls.push(args);
      if(args[0]==='print') {
        if(!loaded)throw Object.assign(Error('Not loaded'),{code:3});
        return {stdout:'state = running\n pid = 4567\n'};
      }
      if(args[0]==='bootstrap')loaded=true;
      if(args[0]==='bootout')loaded=false;
      return {stdout:''};
    }};
  const run=async(action,extra=[],overrides={})=>{
    let stdout='',stderr='',exit;
    await main(['service',action,'--state-dir',state,'--json',...extra],home,{serviceOptions:{...options,...overrides},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;},exit:code=>{exit=code;}});
    assert.equal(stdout.trimEnd().split('\n').length,1);
    const envelope=JSON.parse(stdout);
    assert.equal(envelope.command,`service ${action}`);
    return {envelope,stdout,stderr,exit};
  };
  return {home,state,calls,options,run};
}

test('service install/status/uninstall observe job state through injected launchctl only',async t=>{
  const f=await fixture(t);
  const absent=await f.run('status');
  assert.equal(absent.exit,0);assert.equal(absent.envelope.data.installed,false);assert.equal(absent.envelope.data.loaded,false);
  const installed=await f.run('install',['--port=4321']);
  assert.equal(installed.exit,0);assert.equal(installed.envelope.data.port,4321);
  assert.equal(installed.envelope.data.service.installed,true);assert.equal(installed.envelope.data.service.loaded,true);assert.equal(installed.envelope.data.service.pid,4567);
  assert.equal(installed.envelope.data.service.stateDirectory,f.state);
  const plist=path.join(f.home,'Library/LaunchAgents',`${SERVICE_LABEL}.plist`);
  assert.match(await readFile(plist,'utf8'),/<string>4321<\/string>/);
  const duplicate=await f.run('install');assert.equal(duplicate.exit,2);assert.equal(duplicate.envelope.error.code,'SERVICE_ALREADY_INSTALLED');
  const status=await f.run('status');assert.equal(status.envelope.data.loaded,true);
  const removed=await f.run('uninstall');assert.equal(removed.exit,0);assert.equal(removed.envelope.data.retained,true);
  await assert.rejects(stat(plist),{code:'ENOENT'});assert.ok((await stat(f.state)).isDirectory());
  assert.equal((await f.run('status')).envelope.data.loaded,false);
  assert.ok(f.calls.every(args=>!args.includes('gui/501')));
});

test('service logs contain two bounded rows, missing-file state and redacted keys',async t=>{
  const f=await fixture(t);
  await mkdir(f.state);
  await writeFile(path.join(f.state,'service.stdout.log'),[...Array.from({length:240},(_,i)=>`line ${i}`),`url=https://host.invalid/?key=${key} Authorization: Bearer ${key}`].join('\n'));
  const result=await f.run('logs');
  assert.equal(result.exit,0);assert.equal(result.envelope.data.logs.length,2);
  const [out,err]=result.envelope.data.logs;
  assert.equal(out.stream,'stdout');assert.equal(out.exists,true);assert.equal(out.lines.length,200);
  assert.equal(err.stream,'stderr');assert.equal(err.exists,false);assert.deepEqual(err.lines,[]);
  assert.ok(path.isAbsolute(out.path));assert.ok(!result.stdout.includes(key));assert.match(out.lines.at(-1),/REDACTED/);
  assert.equal(result.stderr,'');assert.deepEqual(f.calls,[]);
  const lines=[];
  await service('status',{'state-dir':f.state},{...f.options,output:line=>lines.push(line)});
  assert.equal(JSON.parse(lines[0]).installed,false);
});

test('service failures remain typed and failed installation removes the new plist',async t=>{
  const f=await fixture(t);
  const failed=await f.run('install',[],{run:async()=>{throw Object.assign(Error(`hook https://host.invalid/?token=${key}`),{stderr:`Bearer ${key}`});}});
  assert.equal(failed.exit,2);assert.equal(failed.envelope.error.code,'SERVICE_FAILED');assert.ok(!failed.stdout.includes(key));
  await assert.rejects(stat(path.join(f.home,'Library/LaunchAgents',`${SERVICE_LABEL}.plist`)),{code:'ENOENT'});
  const unsupported=await f.run('status',[],{platform:'linux',run:()=>assert.fail('unsupported platform invoked launchctl')});
  assert.equal(unsupported.envelope.error.code,'SERVICE_UNSUPPORTED');assert.equal(unsupported.exit,2);
});

test('service migration retains completed moves and key-prefix changes after bootstrap failure',async t=>{
  const f=await fixture(t),old=path.join(f.home,'old-state'),agents=path.join(f.home,'Library/LaunchAgents');
  await mkdir(old);await mkdir(agents,{recursive:true});
  await writeFile(path.join(old,'hub.key'),key.replace('adg_','sdg_')+'\n');
  await writeFile(path.join(old,'registry.json'),'{"roots":[]}');
  await writeFile(path.join(agents,'org.svg-design-gallery.hub.plist'),renderLaunchAgent({nodePath:'/old/node',cliPath:'/old/cli',stateDirectory:old,port:4444}).replace(SERVICE_LABEL,'org.svg-design-gallery.hub'));
  const failed=await f.run('migrate',[],{run:async(command,args)=>{
    if(args[0]==='bootstrap')throw Error(`Bootstrap failed ${key}`);
    return {stdout:''};
  }});
  assert.equal(failed.exit,2);assert.equal(failed.envelope.error.code,'SERVICE_FAILED');
  const data=failed.envelope.data;
  assert.equal(data.complete,false);assert.equal(data.keyPrefixUpdated,true);assert.equal(data.service,null);
  assert.deepEqual(data.changes[0],{action:'renamed',path:f.state,from:old});
  assert.ok(data.changes.some(change=>change.action==='created'&&change.path.endsWith(`${SERVICE_LABEL}.plist`)));
  assert.equal(await readFile(path.join(f.state,'registry.json'),'utf8'),'{"roots":[]}');
  await assert.rejects(stat(old),{code:'ENOENT'});assert.ok(!failed.stdout.includes(key));
});

test('only explicit print-key data.key bypasses redaction and key flag conflicts cannot mutate state',async t=>{
  const f=await fixture(t);await mkdir(f.state);await writeFile(path.join(f.state,'hub.key'),key+'\n');
  const run=async args=>{
    let stdout='',stderr='',exit;
    await main(['serve',...args,'--state-dir',f.state],f.home,{stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;},exit:code=>{exit=code;}});
    return {stdout,stderr,exit};
  };
  const printed=await run(['--print-key','--json']);
  assert.equal(printed.exit,0);assert.equal(JSON.parse(printed.stdout).data.key,key);assert.equal(printed.stderr,'');
  assert.equal((await run(['--print-key'])).stdout,key+'\n');
  for(const flags of [['--print-key','--rotate-key'],['--print-key','--port=0'],['--rotate-key','--port=0']])for(const json of [false,true]) {
    assert.throws(()=>parseCli(['serve',...flags,...(json?['--json']:[])]),{code:'USAGE_INVALID'});
    const failure=await run([...flags,...(json?['--json']:[])]);
    assert.equal(failure.exit,2);
    if(json)assert.equal(JSON.parse(failure.stdout).error.code,'USAGE_INVALID');else assert.equal(failure.stdout,'');
    assert.equal(await readFile(path.join(f.state,'hub.key'),'utf8'),key+'\n');
  }
  const rotated=await run(['--rotate-key','--json']);
  assert.deepEqual(JSON.parse(rotated.stdout).data,{action:'rotate-key',stateDirectory:f.state,rotated:true});assert.ok(!rotated.stdout.includes(key));
  let stdout='';
  const output=createOutput({json:true,command:'serve',revealKey:true,stdout:text=>{stdout+=text;}});
  output.success({action:'print-key',key,url:`https://host.invalid/?key=${key}`,nested:{key}},[{code:'WARNING',message:key,next:[{argv:['adg',key],reason:key}]}]);
  const envelope=JSON.parse(stdout);
  assert.equal(envelope.data.key,key);assert.ok(!JSON.stringify({...envelope,data:{...envelope.data,key:null}}).includes(key));
  stdout='';output.failure(new CliError('INTERNAL_ERROR',`hook ${key}`,{data:{action:'print-key',key}}));assert.ok(!stdout.includes(key));
  stdout='';createOutput({json:true,command:'version',revealKey:true,stdout:text=>{stdout+=text;}}).success({action:'print-key',key});assert.ok(!stdout.includes(key));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {withImpacted} from '../src/toolkit/impact-selection.mjs';
import {check} from '../src/toolkit/commands.mjs';
import {loadConfig} from '../src/toolkit/config.mjs';
import {starterTokens} from '../src/toolkit/project.mjs';
import {nextActions} from '../src/cli-output.mjs';
import {parseCli} from '../src/cli.mjs';

test('selective check retains static architecture, mapping and import validation with no browser jobs', async t => {
  const root=await mkdtemp(path.join(tmpdir(),'adg-impact-static-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async (name,text)=>{const file=path.join(root,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);};
  await put('adg.config.mjs','export default {};');await put('design/tokens.css',starterTokens);
  await put('design/surfaces/upper.tsx',`import {Frame} from 'adg';export function Upper(){return <div/>;}export default()=> <Frame name="upper"><div/></Frame>;`);
  await put('design/components/lower.tsx',`import {Frame} from 'adg';import {Upper} from '../surfaces/upper';export function Lower(){return <Upper/>;}export default()=> <Frame name="lower"><div/></Frame>;`);
  await put('arch/bad.mmd','not a supported architecture source');
  await put('design/implementation.json',JSON.stringify({version:1,mappings:[{implementation:{file:'ui/missing.ts'},design:[{source:'design/components/lower.tsx'}]}]}));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture preexisting violations');
  const config=await loadConfig(root),silent=()=>{};
  await assert.rejects(check(config,[],{impacted:true,base:'HEAD',json:true,'read-only':true},silent,silent,{launchBrowser:()=>{throw Error('Static-only check must not launch a browser');}}),error=>{
    assert.equal(error.code,'CHECK_FAILED');assert.equal(error.data.summary.evaluations,0);
    assert.ok(error.data.findings.some(f=>f.code==='IMPORT_DIRECTION'));
    assert.ok(error.data.findings.some(f=>f.code==='OWNER_IMPLEMENTATION_MISSING'));
    assert.ok(error.data.findings.some(f=>f.source==='arch/bad.mmd'));
    assert.equal(error.data.impact.coverage.exclusions.not_checked,6);return true;
  });
  await put('not-directory', 'a file');
  await assert.rejects(withImpacted(config,[],{base:'HEAD'},'diff',async()=>({data:{complete:true,verdict:'identical',reportPath:path.join(root,'not-directory','report.json'),summary:{comparisons:0,supportComparisons:0}},warnings:[]})), error=>{
    assert.equal(error.data.complete,false);assert.equal(error.data.reportPath,null);assert.equal(error.data.verdict,null);
    assert.equal(error.data.impact.coverage.proofComplete,false);assert.equal(error.data.impact.coverage.provenRows,0);return true;
  });
  await put('design/components/lower.tsx','invalid TSX <');
  await assert.rejects(check(config,[],{impacted:true,base:'HEAD',json:true,'read-only':true},silent,silent), error=>error.code==='SOURCE_BUILD_FAILED' && error.data===null);
});

test('impact input-change recovery preserves executable consumer selection argv',()=>{
  for(const command of ['render','check','diff']){
    const context={command,values:{impacted:true,base:'HEAD',frame:'demo',theme:'light',...(command==='check'?{'read-only':true}:{scale:'2'})},positionals:['components/demo']};
    const [next]=nextActions('IMPACT_INPUT_CHANGED',context);
    const parsed=parseCli(next.argv.slice(1));assert.equal(parsed.command,command);assert.equal(parsed.values.impacted,true);assert.deepEqual(parsed.positionals,context.positionals);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyError } from '../src/cli-output.mjs';
import { elementIdentities } from '../src/toolkit/frame-identity.mjs';
import { jsx,jsxDEV,Fragment,registerComponent,artwork,Icon } from '../src/toolkit/runtime.mjs';
import { expandStyle,compactStyle,styleDefaults,inspectVersion } from '../src/toolkit/inspect-styles.mjs';
import { installFramePrimitives } from '../src/toolkit/frame-primitives.mjs';

const ref={source:'design/surfaces/demo.tsx',frame:'ready'};
const node=(path,parentPath,tag='div',extra={})=>({path,parentPath,tag,namespace:'html',attributes:{},owners:[],directText:'',...extra});
const root=node('0',null,'main');
const ids=(nodes,r=ref)=>elementIdentities(nodes,r);
const keyed=(path,key,parentPath='0')=>node(path,parentPath,'section',{keys:[{key}],owners:[{source:'components/card.tsx',export:'Card'}]});

test('identity is deterministic across paths, rendering state, wrapper insertion and unrelated edits',()=>{
  const a=node('1','0','button',{directText:'Save'}), before=ids([root,a]);
  const after=ids([root,node('x','0','aside',{directText:'Unrelated'}),node('wrap','0'),{...a,path:'new',parentPath:'wrap',box:{x:50},theme:'dark',class:'changed',disabled:true}]);
  assert.equal(before[1].id,after[3].id);assert.match(before[1].id,/^e1_[a-f0-9]{24}$/);
  assert.deepEqual(before,ids([root,a]));
  assert.notEqual(before[1].id,ids([root,{...a,directText:'Changed'}])[1].id);
  assert.notEqual(before[1].id,ids([root,a],{...ref,frame:'other'})[1].id);
  assert.notEqual(before[1].id,ids([root,a],{...ref,source:'design/surfaces/moved.tsx'})[1].id);
});

test('anchors survive text/tag/reparent edits within a scope, and guards expose semantic changes',()=>{
  const a=node('a','0','button',{attributes:{'data-adg-id':'save'},directText:'Save'});
  const before=ids([root,a])[1], after=ids([root,node('w','0'),{...a,parentPath:'w',tag:'a',directText:'Store'}])[2];
  assert.equal(before.id,after.id);assert.notEqual(before.identity.guard,after.identity.guard);assert.equal(before.identity.stability,'authored');
  assert.throws(()=>ids([root,a,{...a,path:'b'}]),{code:'INSPECT_IDENTITY_CONFLICT'});
  assert.throws(()=>elementIdentities([root,a],ref,{hash:()=> 'forced'}),{code:'INSPECT_IDENTITY_CONFLICT'});
});

test('keyed instances and children survive reordering; numbers and strings differ',()=>{
  const a=keyed('a',0),b=keyed('b','0'),child=node('c','a','button',{directText:'Save'});
  const before=ids([root,a,child,b]), after=ids([root,b,a,child]);
  assert.equal(before[1].id,after[2].id);assert.equal(before[2].id,after[3].id);assert.notEqual(before[1].id,before[3].id);
  assert.throws(()=>ids([root,a,{...a,path:'b'}]),{code:'INSPECT_IDENTITY_CONFLICT'});
  const moved=ids([root,a,b,{...child,parentPath:'b'}]);assert.notEqual(before[2].id,moved[3].id);
});

test('unkeyed duplicates and their anchored descendants explicitly inherit positional stability',()=>{
  const a=keyed('a',undefined);a.keys=[];const b={...a,path:'b'};
  const child=node('c','a','button',{attributes:{'data-adg-id':'save'}});
  const result=ids([root,a,child,b]);
  assert.equal(result[1].identity.stability,'positional');assert.equal(result[2].identity.stability,'positional');
  assert.equal(result[1].identity.duplicate.count,2);assert.notEqual(result[1].id,result[3].id);
  assert.equal(ids([root,a])[1].identity.stability,'semantic');
});

test('hidden/theme-only nodes retain identity and password content never enters seeds',()=>{
  const a=node('a','0','input',{password:true,directText:'secret'}), before=ids([root,a])[1];
  assert.equal(before.id,ids([root,{...a,directText:'different',hidden:true},node('dark','0','aside')])[1].id);
  assert.notEqual(ids([root,node('a','0','button',{owners:[{source:'a.tsx',export:'A'}]})])[1].id,
    ids([root,node('a','0','button',{owners:[{source:'a.tsx',export:'B'}]})])[1].id);
});

test('runtime retains zero/string keys through component, nested ownership, fragments and artwork',()=>{
  function Button(){return jsx('button',{'data-adg-id':'save',children:'Save'});}
  registerComponent(Button,'components/button.tsx','Button');
  const value=jsxDEV(Button,{},0,false,{fileName:'demo.tsx',lineNumber:1,columnNumber:1});
  assert.match(value.html,/data-adg-keys/);assert.match(value.html,/&quot;key&quot;:0/);assert.match(value.html,/data-adg-owners/);
  assert.equal((value.html.match(/&quot;key&quot;/g)??[]).length,1);
  const fragment=jsx(Fragment,{children:[jsx('span',{children:'A'}),jsx('span',{children:'B'})]},'row');
  assert.match(fragment.html,/&quot;root&quot;:0/);assert.match(fragment.html,/&quot;root&quot;:1/);
  const nested=jsx(()=>value,{},'outer');assert.equal((nested.html.match(/&quot;key&quot;/g)??[]).length,2);
  assert.match(Icon({name:'check'}).html,/data-adg-icon="check"/);
  assert.match(artwork('<svg viewBox="0 0 4 4"><path d="M0 0"/></svg>',{},'art/mark.svg').withIdentity({key:'art'}).html,/data-adg-art="art\/mark.svg"/);
  assert.throws(()=>jsx('div',{},NaN),/JSX key/);
});

test('inspectVersion 1 defaults are frozen and expand exact style differences without host values',()=>{
  assert.equal(inspectVersion,1);assert.ok(Object.isFrozen(styleDefaults));assert.equal(Object.keys(styleDefaults).length,118);
  assert.deepEqual(compactStyle({display:'inline','font-family':'system-ui','padding-left':'12px'}),{'font-family':'system-ui','padding-left':'12px'});
  const expanded=expandStyle({'font-family':'system-ui','padding-left':'12px'});
  assert.equal(expanded.display,'inline');assert.equal(expanded['font-family'],'system-ui');assert.equal(expanded['padding-left'],'12px');
  assert.equal(styleDefaults['font-family'],'serif');assert.equal(styleDefaults.color,'rgb(0, 0, 0)');
});

test('shared reference primitives retain alias/fallback and nested selector grammar',()=>{
  installFramePrimitives();const p=globalThis.__adgFramePrimitives;
  assert.deepEqual(p.variables('calc(var(--a) + var(--b, var(--c)))'),[{name:'--a',fallback:false},{name:'--b',fallback:false},{name:'--c',fallback:true}]);
  assert.deepEqual(p.selectors(':is(a,b), [title="a,b"], & > button'),[':is(a,b)','[title="a,b"]','& > button']);
  assert.deepEqual(p.relativeBox({left:3,top:4,right:5,bottom:8,width:2,height:4},{left:3,top:2}),{x:0,y:2,width:2,height:4});
});

test('keys are scoped to sibling lists and neutral wrappers preserve keyed addresses',()=>{
  const a=node('a','0','section',{directText:'List A'}), b=node('b','0','section',{directText:'List B'});
  const one=keyed('one','row','a'),two=keyed('two','row','b');
  const before=ids([root,a,one,b,two]);assert.notEqual(before[2].id,before[4].id);
  const after=ids([root,a,node('w','a','div',{neutral:true}),{...one,parentPath:'w'},b,two]);
  assert.equal(before[2].id,after[3].id);
});

test('same local root anchor in distinct keyed component instances remains distinct',()=>{
  const a={...keyed('a','first'),attributes:{'data-adg-id':'save'}};
  const b={...keyed('b','second'),attributes:{'data-adg-id':'save'}};
  const before=ids([root,a,b]),after=ids([root,b,a]);
  assert.notEqual(before[1].id,before[2].id);assert.equal(before[1].id,after[2].id);
});

test('a part-local root anchor in repeated unkeyed parts inherits positional identity',()=>{
  const a={...keyed('a',undefined),keys:[],attributes:{'data-adg-id':'save'}};
  const b={...a,path:'b'};const result=ids([root,a,b]);
  assert.notEqual(result[1].id,result[2].id);assert.equal(result[1].identity.stability,'positional');
});

test('an anchored part changes namespace when its defining export moves',()=>{
  const a={...keyed('a',undefined),keys:[],attributes:{'data-adg-id':'save'}};
  assert.notEqual(ids([root,a])[1].id,ids([root,{...a,owners:[{source:'components/moved.tsx',export:'Card'}]}])[1].id);
});

test('identity conflicts retain a typed actionable diagnostic before inspect is introduced',()=>{
  const a=node('a','0','button',{attributes:{'data-adg-id':'save'}});
  let error;try{ids([root,a,{...a,path:'b'}]);}catch(cause){error=cause;}
  const result=classifyError(error,{command:'owner',values:{text:'Save'}});
  assert.equal(result.exitCode,2);assert.equal(result.error.code,'INSPECT_IDENTITY_CONFLICT');
  assert.deepEqual(result.error.next[0].argv,['adg','owner','--text=Save','--json']);
});

test('unique semantic scopes isolate duplicate ranks and signature edits re-identify descendants',()=>{
  const a=node('a','0','section',{attributes:{'data-part':'a'}}),b=node('b','0','section',{semantic:{role:'region',name:'B'}});
  const one=node('one','a'),two=node('two','b'),before=ids([root,a,one,b,two]);
  const inserted=node('new','a');const after=ids([root,a,inserted,one,b,two]);
  assert.equal(before[4].id,after[5].id);assert.equal(before[4].identity.stability,'semantic');
  assert.notEqual(before[2].id,after[3].id);assert.equal(after[3].identity.duplicate.count,2);
  const renamed=ids([root,a,one,{...b,semantic:{role:'region',name:'Changed'}},two]);
  assert.notEqual(before[3].id,renamed[3].id);assert.notEqual(before[4].id,renamed[4].id);
  const wrapped=ids([root,a,one,node('w','0','div',{neutral:true}),{...b,parentPath:'w'},two]);
  assert.equal(before[4].id,wrapped[5].id);
});

test('resource-local slots do not perturb frame-level duplicate rankings',()=>{
  const art=node('art','0','svg',{resource:true}),p=node('p','art','path'),other=node('other','0','path');
  const before=ids([root,art,p,other]);
  const after=ids([root,art,node('new','art','path'),p,other]);
  assert.equal(before[3].id,after[4].id);assert.equal(before[3].identity.stability,'semantic');
  assert.equal(before[2].identity.stability,'resource');assert.equal(before[2].identity.slot,0);
  assert.notEqual(before[2].id,after[3].id);
});

test('automatic descendants retain defining-part namespaces without inheriting unkeyed instance ordinals',()=>{
  const owner={source:'row.tsx',export:'Row'},a=node('a','0','section',{owners:[owner]}),b={...a,path:'b'};
  const inner=node('inner','a'),other=node('other','b');
  const before=ids([root,a,inner,b,other]),after=ids([root,node('new','0'),a,inner,b,other]);
  assert.equal(before[2].id,after[3].id);assert.equal(before[4].id,after[5].id);
});

test('keys inherit ambiguity when their sibling-list parent is positional',()=>{
  const a=node('a','0'),b=node('b','0'),child=node('child','a','button',{keys:[{key:'save'}]});
  const rows=ids([root,a,child,b]);assert.equal(rows[2].identity.stability,'positional');
});

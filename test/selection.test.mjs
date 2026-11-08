import test from 'node:test';
import assert from 'node:assert/strict';
import { frameBox, hitSelection, exportFrames } from '../public/selection.js';

const owner={source:'modules/composer.tsx',export:'Composer'};
const part={id:'1',name:'second',x:200,y:40,width:100,height:80,elements:[{x:8,y:10,width:50,height:30,owners:[owner]}]};
test('frame hits use the actual variant and element hits retain export ownership',()=>{
  const a={id:'set',component:true,x:100,y:100,width:500,height:200,shown:[{x:-24,y:-36}],parts:[{id:'0',x:0,y:0,width:50,height:50},part]};
  assert.deepEqual(frameBox(a,part),{x:324,y:176,width:100,height:80});
  assert.equal(hitSelection([a],330,180).part.id,'1');
  assert.equal(hitSelection([a],340,190).element.owners[0].export,'Composer');
  assert.equal(hitSelection([a],110,110).part,null);
  assert.equal(hitSelection([a],700,700),null);
  assert.deepEqual(exportFrames(a,owner),[part]);
  assert.deepEqual(exportFrames(a,{...owner,export:'Other'}),[]);
});
test('flow hits map cropped frame coordinates and ignore sibling variants',()=>{
  const a={id:'flow#1',component:false,x:100,y:100,width:132,height:112,shown:[{id:'1',x:184,y:24}],parts:[{id:'0',x:0,y:0,width:50,height:50},part]};
  assert.deepEqual(frameBox(a,part),{x:116,y:116,width:100,height:80});
  const hit=hitSelection([a],130,130);
  assert.equal(hit.part.id,'1');assert.equal(hit.element.owners[0].source,owner.source);
  assert.equal(hitSelection([a],130,130,false).element,null);
});

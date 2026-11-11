import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalMetrics, traceSummary } from '../tooling/perf-metrics.mjs';

test('phase intervals clip the critical prefix and keep concurrent work separate',()=>{
  const result=intervalMetrics([
    {start:0,end:10,source:'a'}, {start:5,end:15,source:'b'}, {start:12,end:20,source:'a'},
  ],14,2);
  assert.equal(result.wallMs,12);
  assert.equal(result.workMs,19);
  assert.equal(result.peakConcurrency,2);
  assert.deepEqual(result.perSourceMax,{source:'a',ms:10});
  assert.equal(intervalMetrics([]).wallMs,0);
});

test('trace categories exclude nested work and retain worker decode separately',()=>{
  const summary=traceSummary({traceEvents:[
    {ph:'M',name:'thread_name',pid:1,tid:1,args:{name:'CrRendererMain'}},
    {ph:'X',name:'FunctionCall',pid:1,tid:1,ts:0,dur:10000},
    {ph:'X',name:'Layout',pid:1,tid:1,ts:2000,dur:3000},
    {ph:'X',name:'MinorGC',pid:1,tid:1,ts:6000,dur:1000},
    {ph:'X',name:'Decode Image',pid:1,tid:2,ts:1000,dur:4000},
  ]},0,8000);
  assert.deepEqual(summary.rendererMainMs,{scripting:4,styleLayout:3,paint:0,imageDecode:0,gc:1});
  assert.equal(summary.threads[1].ms.imageDecode,4);
});

test('trace scripting includes async V8 execution with nested callback slices counted once',()=>{
  const summary=traceSummary({traceEvents:[
    {ph:'M',name:'thread_name',pid:1,tid:1,args:{name:'CrRendererMain'}},
    {ph:'X',name:'V8.RunMicrotasks',pid:1,tid:1,ts:0,dur:10000},
    {ph:'X',name:'v8.callFunction',pid:1,tid:1,ts:1000,dur:5000},
    {ph:'X',name:'FunctionCall',pid:1,tid:1,ts:1000,dur:5000},
    {ph:'X',name:'Layout',pid:1,tid:1,ts:2000,dur:1000},
  ]});
  assert.equal(summary.rendererMainMs.scripting,9);
  assert.equal(summary.rendererMainMs.styleLayout,1);
});

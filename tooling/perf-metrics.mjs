// Interval metrics retain overlap instead of adding concurrent wall time.
export function intervalMetrics(spans, cutoff = Infinity, origin = 0) {
  const ranges = spans.map(s => ({...s, a:Math.max(origin,s.start), b:Math.min(cutoff,s.end)})).filter(s => s.b > s.a);
  const edges = ranges.flatMap(s => [[s.a,1],[s.b,-1]]).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  let active=0, peak=0, wall=0, last=0;
  for (const [at,delta] of edges) { if(active)wall+=at-last; active+=delta;peak=Math.max(peak,active);last=at; }
  const sums = new Map();
  for (const s of ranges) if(s.source) sums.set(s.source,(sums.get(s.source)??0)+s.b-s.a);
  const maximum=[...sums].sort((a,b)=>b[1]-a[1])[0];
  return {wallMs:wall,workMs:ranges.reduce((n,s)=>n+s.b-s.a,0),peakConcurrency:peak,
    count:ranges.length, perSourceMax:maximum?{source:maximum[0],ms:maximum[1]}:null};
}

const category = name => /(?:GC|Scavenge|MarkCompact)/i.test(name)?'gc'
  : /(?:Decode Image|ImageDecodeTask|ImageDecoder::Decode)/.test(name)?'imageDecode'
  : /^(?:Paint|PrePaint|RasterTask|CompositeLayers|Layerize)$/.test(name)?'paint'
  : /^(?:UpdateLayoutTree|Layout|RecalculateStyles)$/.test(name)?'styleLayout'
  : /^(?:FunctionCall|EvaluateScript|RunMicrotasks|EventDispatch|TimerFire|FireAnimationFrame|v8\.execute)$/.test(name)?'scripting':null;
export function traceSummary(trace, startUs=-Infinity, endUs=Infinity) {
  const names = new Map(trace.traceEvents.filter(e=>e.ph==='M'&&e.name==='thread_name').map(e=>[`${e.pid}:${e.tid}`,e.args.name]));
  const threads=new Map();
  for(const e of trace.traceEvents) {
    const kind=category(e.name),key=`${e.pid}:${e.tid}`;
    if(e.ph!=='X'||!kind||!e.dur||e.ts>=endUs||e.ts+e.dur<=startUs)continue;
    if(!threads.has(key))threads.set(key,[]);
    threads.get(key).push({kind,start:Math.max(startUs,e.ts),end:Math.min(endUs,e.ts+e.dur)});
  }
  const rows=[];
  for(const [key,spans] of threads) {
    const edges=spans.flatMap((s,i)=>[{at:s.start,i,add:true},{at:s.end,i,add:false}]).sort((a,b)=>a.at-b.at||Number(a.add)-Number(b.add));
    const active=new Set(),totals={scripting:0,styleLayout:0,paint:0,imageDecode:0,gc:0};let last=edges[0]?.at;
    for(const e of edges) {
      // Attribute nested slices once, to the innermost recognized category.
      const current=[...active].sort((a,b)=>spans[b].start-spans[a].start||spans[a].end-spans[b].end)[0];
      if(current!==undefined)totals[spans[current].kind]+=(e.at-last)/1000;
      if(e.add)active.add(e.i);else active.delete(e.i);last=e.at;
    }
    rows.push({thread:key,name:names.get(key),ms:totals});
  }
  return {threads:rows,rendererMainMs:rows.filter(r=>r.name==='CrRendererMain').reduce((a,r)=>{
    for(const [k,v] of Object.entries(r.ms))a[k]=(a[k]??0)+v;return a;
  },{})};
}

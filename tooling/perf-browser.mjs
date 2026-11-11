import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { traceSummary } from './perf-metrics.mjs';

// Installed by the benchmark only; normal viewers never create this sink.
export function installTiming() {
  if (window.top !== window) return;
  performance.setResourceTimingBufferSize(50000);
  const spans=[], marks={}, pending=new Set();
  window.__adgTiming = {
    spans, marks,
    span(phase,source,detail={}) {
      const start=performance.now();
      return (extra={})=>spans.push({phase,source,start,end:performance.now(),...detail,...extra});
    },
    mark(name,detail={}) {marks[name]??={at:performance.now(),...detail};},
    paint(name,detail={}) {
      if(marks[name]||pending.has(name))return;
      pending.add(name);
      const submitted=performance.now();
      requestAnimationFrame(()=>{this.mark(name,{submitted,...detail});pending.delete(name);});
    },
  };
}

export async function measureNavigation(page, {url, reload=false, traceFile, screenshotFile}={}) {
  const cdp=await page.context().newCDPSession(page), errors=[], failed=[], requests=[];
  const network=new Map();
  cdp.on('Network.requestWillBeSent', e=>network.set(e.requestId,{
    url:e.request.url,method:e.request.method,start:e.timestamp,wallTime:e.wallTime,
  }));
  cdp.on('Network.responseReceived',e=>{
    const record=network.get(e.requestId);
    if(record)Object.assign(record,{response:e.timestamp,timing:e.response.timing,status:e.response.status,
      fromDiskCache:e.response.fromDiskCache,fromServiceWorker:e.response.fromServiceWorker});
  });
  cdp.on('Network.dataReceived',e=>{
    const record=network.get(e.requestId);
    if(record){record.bodyBytes=(record.bodyBytes??0)+e.dataLength;record.lastData=e.timestamp;}
  });
  cdp.on('Network.loadingFinished',e=>{
    const record=network.get(e.requestId);
    if(record)Object.assign(record,{end:e.timestamp,encodedBytes:e.encodedDataLength});
  });
  await cdp.send('Network.enable');
  const onError=e=>errors.push(e.message), onRequest=r=>requests.push(r), onFailed=r=>failed.push({url:r.url(),error:r.failure()});
  page.on('pageerror',onError);page.on('request',onRequest);page.on('requestfailed',onFailed);
  let traceEvents=[];
  if(traceFile) {
    cdp.on('Tracing.dataCollected',e=>traceEvents.push(...e.value));
    await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReportEvents'});
  }
  await cdp.send('Performance.enable');
  const beforeLoad=os.loadavg(),started=Date.now();
  try {
    if(reload)await page.reload({waitUntil:'domcontentloaded'});
    else await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__adgTiming?.marks['visible-ready'] && window.__adg?.ready &&
      window.__adg.metadataComplete && !window.__adg.cachePending,undefined,{timeout:180000,polling:50});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await page.evaluate(()=>{
      const timing=window.__adgTiming;
      timing.mark('complete');
      const navigation=performance.getEntriesByType('navigation')[0];
      return {timeOrigin:performance.timeOrigin,marks:timing.marks,spans:timing.spans,
        resources:[navigation,...performance.getEntriesByType('resource')].map(e=>({url:e.name,start:e.startTime,end:e.responseEnd,duration:e.duration,
          requestStart:e.requestStart,responseStart:e.responseStart,responseEnd:e.responseEnd,transferBytes:e.transferSize,bodyBytes:e.decodedBodySize,initiatorType:e.initiatorType})),
        scope:window.__adg.scope,items:window.__adg.items.length,geometry:window.__adg.items,cacheFailures:window.__adg.cacheFailures,
        visible:{ready:window.__adg.visibleReady,count:window.__adg.visibleCount},
        view:window.__adg.view};
    });
    for(const resource of result.resources) {
      const matches=requests.filter(r=>r.url()===resource.url).sort((a,b)=>Math.abs(a.timing().startTime-(result.timeOrigin+resource.start))-Math.abs(b.timing().startTime-(result.timeOrigin+resource.start)));
      resource.method=matches[0]?.method()??'GET';
      resource.uploadBytes=matches[0]?.postDataBuffer()?.length??0;
    }
    result.requests=requests.map(r=>({url:r.url(),method:r.method(),uploadBytes:r.postDataBuffer()?.length??0,timing:r.timing()}));
    result.network=[...network.values()].map(r=>{
      const epochMs=r.wallTime*1000,relative=epochMs-result.timeOrigin;
      return {...r,start:relative,response:r.response===undefined?undefined:relative+(r.response-r.start)*1000,
        end:r.end===undefined?undefined:relative+(r.end-r.start)*1000,
        lastData:r.lastData===undefined?undefined:relative+(r.lastData-r.start)*1000,
        sendStart:r.timing?.sendStart>=0?relative+(r.timing.requestTime-r.start)*1000+r.timing.sendStart:undefined,
        sendEnd:r.timing?.sendEnd>=0?relative+(r.timing.requestTime-r.start)*1000+r.timing.sendEnd:undefined};
    });
    if(traceFile) {
      const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
      await cdp.send('Tracing.end');await done;
      const trace={traceEvents};await writeFile(traceFile,JSON.stringify(trace));
      // NavigationStart is in the same monotonic clock as trace events.
      const nav=traceEvents.find(e=>e.name==='navigationStart'&&e.args?.data?.documentLoaderURL===url)??traceEvents.find(e=>e.name==='navigationStart');
      result.trace={file:path.basename(traceFile),navigationStartUs:nav?.ts,complete:traceSummary(trace),
        firstContent:nav?traceSummary(trace,nav.ts,nav.ts+result.marks['first-content'].at*1000):null};
    }
    if(screenshotFile)await page.screenshot({path:screenshotFile});
    result.cdpMetrics=(await cdp.send('Performance.getMetrics')).metrics;
    return {...result,started,loadAverage:{before:beforeLoad,after:os.loadavg()},errors,failed};
  } finally {
    page.off('pageerror',onError);page.off('request',onRequest);page.off('requestfailed',onFailed);
    await cdp.detach();
  }
}
export async function phaseBenchmark(url,destination,{reload=false,trace=false,screenshots=true}={}) {
  await mkdir(path.dirname(destination),{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--enable-precise-memory-info']});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,colorScheme:'dark'});
    await context.addInitScript(installTiming);
    const page=await context.newPage();
    const environment={platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,cores:os.cpus().length,
      memoryBytes:os.totalmem(),node:process.version,chromium:browser.version(),viewport:{width:1440,height:900,dpr:2},headless:true};
    const cold=await measureNavigation(page,{url,traceFile:trace?destination.replace(/\.json$/,'.trace.json'):undefined,screenshotFile:screenshots?destination.replace(/\.json$/,'.png'):undefined});
    const warm=reload?await measureNavigation(page,{reload:true}):undefined;
    const result={environment,cold,warm};await writeFile(destination,JSON.stringify(result,null,2));return result;
  } finally {await browser.close();}
}

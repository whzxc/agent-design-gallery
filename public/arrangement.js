import { arrangementInput } from './assets.js';
import { packingSnapshot, restorePacking, layoutWorld } from './layout.js';

const aborted = () => new DOMException('Arrangement superseded', 'AbortError');

export function createArranger() {
  let worker, nextId=0;
  const pending=new Map();
  function close(failure=aborted()) {
    worker?.terminate();worker=undefined;
    for(const task of pending.values())task.finish(failure);
    pending.clear();
  }
  function start() {
    if(worker)return;
    worker=new Worker(new URL('./arrangement-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const task=pending.get(data.id);
      if(!task)return;
      if(data.error)task.finish(Error(`Cannot arrange designs: ${data.error}`));
      else {restorePacking(data.packing);task.finish(null,data);}
    };
    worker.onerror=event=>close(Error(`Cannot start arrangement worker: ${event.message}`));
  }
  return {
    close,
    get pending() {return pending.size;},
    arrange(data,{signal,onPending}={}) {
      signal?.throwIfAborted();
      const endProbe=globalThis.__adgTiming?.span('arrangement-cache-probe');
      const input=arrangementInput(data),cached=layoutWorld(input,{cachedOnly:true});
      endProbe?.({hit:!!cached});
      if(cached)return Promise.resolve(cached);
      onPending?.();
      start();
      const id=++nextId,end=globalThis.__adgTiming?.span('arrangement-wait');
      return new Promise((resolve,reject)=>{
        const abort=()=>close();
        pending.set(id,{finish(failure,result){
          pending.delete(id);signal?.removeEventListener('abort',abort);
          end?.({workerMs:result?.durationMs});
          failure?reject(failure):resolve(result.placed);
        }});
        signal?.addEventListener('abort',abort,{once:true});
        worker.postMessage({id,input,packing:packingSnapshot()});
      });
    },
  };
}

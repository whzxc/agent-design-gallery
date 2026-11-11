import { layoutWorld, packingSnapshot, restorePacking } from './layout.js';

self.onmessage = ({data:{id,input,packing}}) => {
  try {
    restorePacking(packing);
    const start=performance.now(),placed=layoutWorld(input);
    self.postMessage({id,placed,packing:packingSnapshot(),durationMs:performance.now()-start});
  } catch(error) {
    self.postMessage({id,error:error.message});
  }
};

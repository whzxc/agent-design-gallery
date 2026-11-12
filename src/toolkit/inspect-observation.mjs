import { frameDocument } from './frame-document.mjs';
import { loadFrame, readyResources, browserTask } from './browser.mjs';
import { installFramePrimitives, collectOwnerObservation } from './frame-observation.mjs';
import { installInspectFacets } from './frame-facets.mjs';
import { installColorResolver } from './owner-colors.mjs';
import { settleOwnerObservation } from './owner-observation.mjs';
import { styleDefaults } from './inspect-styles.mjs';
import { CliError } from '../cli-output.mjs';

export const inspectFacets = ['a11y','color','identity','layout','owner','structure','text','typography'];

/** One DOM protocol read + one AX protocol read, matched by backend node id. */
export async function observeAccessibility(page) {
  const session=await page.context().newCDPSession(page);
  try {
    const [{root},{nodes}]=await Promise.all([session.send('DOM.getDocument',{depth:-1,pierce:true}),session.send('Accessibility.getFullAXTree')]);
    let frame;
    function find(node){const a=node.attributes??[];if(a.some((v,i)=>i%2===0&&v==='data-adg-frame'))frame=node;for(const child of node.children??[])find(child);}
    find(root);
    if(!frame)throw Error('Frame DOM node unavailable for accessibility.');
    const ax=new Map(nodes.filter(n=>n.backendDOMNodeId).map(n=>[n.backendDOMNodeId,n])), result=[];
    function visit(node){if(node.nodeType!==1)return;const value=ax.get(node.backendNodeId);
      result.push({role:value&&!value.ignored?value.role?.value??null:null,name:value&&!value.ignored?value.name?.value??null:null,a11y:value?.ignored||!value?'ignored':'exposed'});
      for(const child of node.children??[])visit(child);
    }
    visit(frame.children.find(n=>n.nodeType===1));return result;
  } finally {await session.detach();}
}

export async function observeInspectFrame(index, source, built, frame, theme, environment, getPage, tokens, policy, { bypass=false, onLoad=()=>{} }={}) {
  let loaded=false;
  const collect=async()=>{
    loaded=true;onLoad();const page=await getPage();
    await loadFrame(page,{...frame,document:theme=>frameDocument(frame,theme,built.css)},theme);
    return browserTask(page.context().browser(),async()=>{
      await page.evaluate(readyResources);await page.evaluate(installColorResolver);await page.evaluate(installFramePrimitives);await page.evaluate(installInspectFacets);
      let observed;
      try {observed=await settleOwnerObservation(async()=>JSON.parse(await page.evaluate(collectOwnerObservation,{tokens,theme,rich:true,serialized:true,properties:Object.keys(styleDefaults)})),()=>page.evaluate(()=>new Promise(requestAnimationFrame)));}
      catch(error){if(error.code==='OWNER_UNSETTLED')throw new CliError('INSPECT_UNSETTLED',error.message,{cause:error});throw error;}
      try {
        const a11y=await observeAccessibility(page);
        if(a11y.length!==observed.rich.nodes.length)throw Error('AX/DOM node association changed.');
        observed.rich.nodes.forEach((node,i)=>Object.assign(node,a11y[i]));
      } catch(error) {
        if(!page.context().browser().isConnected())throw error;
        observed.rich.nodes.forEach(node=>Object.assign(node,{role:null,name:null,a11y:'unavailable'}));
        observed.rich.limitations.push({code:'A11Y_UNAVAILABLE',path:'0',accuracy:'unavailable'});
      }
      const urls=[...new Set(observed.rich.nodes.flatMap(n=>n.backgrounds??[]))];
      if(urls.length)observed.rich.backgroundDimensions=await page.evaluate(async urls=>Object.fromEntries(await Promise.all(urls.map(async url=>{const image=new Image();image.src=url;await image.decode();return [url,{width:image.naturalWidth,height:image.naturalHeight}];}))),urls);
      return observed;
    });
  };
  const value=bypass?await collect():await index.observation(source,built,frame,theme,environment,collect,{facets:inspectFacets,policy});
  return {value,hit:!loaded};
}

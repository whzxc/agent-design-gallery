import {dataFetch} from './auth.js';
export function createAnnotations(viewport, target, fail) {
  let rows=[], enabled=false, moving=null, signature='';
  const toggle=document.querySelector('#annotate');
  const layer=document.createElement('div');layer.className='annotation-layer';viewport.append(layer);
  const dialog=document.createElement('dialog');dialog.className='annotation-editor';
  dialog.innerHTML='<form method="dialog"><textarea aria-label="Annotation note" required maxlength="10000" rows="5"></textarea><div><button value="cancel" formnovalidate>Cancel</button><button value="save">Save</button></div></form>';
  document.body.append(dialog);
  const edit=async(note='')=>{dialog.querySelector('textarea').value=note;dialog.showModal();dialog.querySelector('textarea').focus();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='save'?dialog.querySelector('textarea').value:null),{once:true}));};
  async function refresh(){const response=await dataFetch('api/annotations');if(!response.ok)throw Error('Cannot load annotations.');rows=await response.json();signature='';render();}
  async function mutate(action,payload){const response=await dataFetch('api/annotations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,action})});if(!response.ok)throw Error((await response.json()).error??'Cannot save annotation.');await refresh();}
  toggle.onclick=()=>{enabled=!enabled;moving=null;toggle.setAttribute('aria-pressed',String(enabled));viewport.classList.toggle('annotating',enabled);render();};
  function render(){
    const t=target();toggle.disabled=!t;
    const list=t?rows.filter(r=>r.source===t.source&&r.frame===t.frame&&r.status==='open').sort((a,b)=>a.y-b.y||a.x-b.x):[];
    const key=JSON.stringify([t?.box,list,enabled,moving]);if(key===signature)return;signature=key;layer.replaceChildren();if(!t)return;
    const b=t.box;let bottom=b.y;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.append(svg);
    for(const r of list){
      const x=b.x+r.x*b.width,y=b.y+r.y*b.height,cy=Math.max(y,bottom);bottom=cy+112;
      const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',`${x},${y} ${b.x+b.width+12},${y} ${b.x+b.width+28},${cy+16}`);svg.append(line);
      const point=document.createElement('button');point.className='annotation-point';point.textContent=r.number;point.setAttribute('aria-label',`Edit annotation ${r.number}`);Object.assign(point.style,{left:`${x}px`,top:`${y}px`});point.onclick=()=>edit(r.note).then(note=>note&&mutate('update',{...r,note})).catch(fail);layer.append(point);
      const card=document.createElement('article');card.className='annotation-card';Object.assign(card.style,{left:`${b.x+b.width+28}px`,top:`${cy}px`});
      const text=document.createElement('button');text.className='annotation-note';text.textContent=`${r.number}. ${r.note}`;text.onclick=point.onclick;card.append(text);
      for(const [label,action] of [['Move',()=>{moving=r.id;enabled=true;toggle.setAttribute('aria-pressed','true');viewport.classList.add('annotating');}],['Resolve',()=>mutate('resolve',{id:r.id})],['Delete',()=>mutate('delete',{id:r.id})]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>Promise.resolve(action()).catch(fail);card.append(button);}layer.append(card);
    }
  }
  refresh().catch(fail);
  return {render,async click(x,y){
    const t=target();if(!enabled||!t)return false;
    const b=t.world;if(x<b.x||x>b.x+b.width||y<b.y||y>b.y+b.height)return false;
    const coordinates={x:(x-b.x)/b.width,y:(y-b.y)/b.height};
    try{if(moving){await mutate('update',{id:moving,...coordinates});moving=null;}else{const note=await edit();if(note?.trim())await mutate('create',{source:t.source,frame:t.frame,...coordinates,note});}}catch(e){fail(e);}return true;
  },active:()=>enabled};
}

/** Rich facets attach to the existing frame walk; they never discover or walk a second DOM tree. */
export function installInspectFacets() {
  if (globalThis.__adgInspectFacets) return;
  globalThis.__adgInspectFacets = {
    create({ elements, paths, style, rect, origin, declarationsFor, tokens, theme, properties }) {
      const p = globalThis.__adgFramePrimitives, facts = [], runs = [], limitations = [], orderKeys=new Map();
      const customCache = new Map(), variableDeclarations = new Map(),referenceCache=new Map(),customKeys=new Map();
      const projectDeclarations=new Map(tokens.map(t=>[t.name,new Set(t.values.map(v=>v.declaration))]));
      const definitions = new Map(tokens.map(t => [t.name, t.values.find(v => v.theme === theme)?.declaration]));
      const round = n => Math.round(n * 100) / 100 || 0;
      const box = r => Object.fromEntries(Object.entries(p.relativeBox(r, origin)).map(([k,v]) => [k,round(v)]));
      const limit = (code, path, accuracy='unavailable', property) => limitations.push({code,path,accuracy,...(property?{property}:{})});
      const inherited = /^(?:color|font(?:-.+)?|line-height|letter-spacing|word-spacing|text-align|text-indent|text-transform|visibility|direction|writing-mode|white-space|word-break|overflow-wrap|fill|stroke(?:-.+)?)$/;
      const relevant = (decl, prop) => decl === prop || ['font','background','border','margin','padding','gap','grid-row','grid-column','outline','text-decoration'].some(short => decl === short && (prop.startsWith(short+'-') || short === 'font' && prop === 'line-height' || short === 'gap' && /^(row|column)-gap$/.test(prop)));
      function variableDeclarationsFor(node,pseudo=''){
        let byPseudo=variableDeclarations.get(node);if(!byPseudo){byPseudo=new Map();variableDeclarations.set(node,byPseudo);}
        if(!byPseudo.has(pseudo))byPseudo.set(pseudo,declarationsFor(node,pseudo).filter(d=>!d.property.startsWith('--')&&d.declaration.includes('var(')));
        return byPseudo.get(pseudo);
      }
      function references(node, property, pseudo='') {
        const candidates = [];
        for (let parent=node; parent; parent=parent.parentElement) {
          if (parent!==node && !inherited.test(property)) break;
          for (const d of [...variableDeclarationsFor(parent, parent===node ? pseudo : ''), ...(pseudo&&parent===node&&inherited.test(property)?variableDeclarationsFor(parent):[])]) if (relevant(d.property,property)) {
            candidates.push({...d,inherited:parent!==node});
          }
        }
        if(!candidates.length)return {refs:[],unresolved:[]};
        if(!customCache.has(node)){
          const custom=new Map();
          for(let parent=node;parent;parent=parent.parentElement)for(const d of declarationsFor(parent)){
            if(parent===document.documentElement&&projectDeclarations.get(d.property)?.has(d.declaration))continue;
            if(d.property.startsWith('--')&&!custom.has(d.property))custom.set(d.property,d.declaration);
          }
          customCache.set(node,custom);customKeys.set(node,JSON.stringify([...custom].sort(([a],[b])=>a.localeCompare(b))));
        }
        const custom=customCache.get(node),cacheKey=JSON.stringify([candidates,customKeys.get(node)]);
        if(referenceCache.has(cacheKey))return referenceCache.get(cacheKey);
        const refs=[], unresolved=[];
        for (const d of candidates) {
          function expand(name, via=[], fallback=false) {
            if (via.includes(name)) { unresolved.push('token_cycle:'+name);return; }
            const project=definitions.has(name), local=custom.has(name)&&custom.get(name)!==definitions.get(name);
            if (project) refs.push({token:name,kind:fallback?'fallback':via.length?'alias':'direct',expression:d.declaration,via,inherited:d.inherited,basis:'authored_reference',
              ...(d.property!==property?{shorthand:d.property}:{}),
              ...(via.some(n=>custom.has(n)&&custom.get(n)!==definitions.get(n)) || local ? {localOverrides:[...new Set([...via,name])].filter(n=>custom.has(n)&&custom.get(n)!==definitions.get(n)).map(name=>({name,declaration:custom.get(name)}))}: {})});
            const expression = local ? custom.get(name) : definitions.get(name);
            if (expression===undefined) { unresolved.push('missing_variable:'+name);return; }
            for (const v of p.variables(expression)) expand(v.name,[...via,name],fallback||v.fallback);
          }
          for (const v of p.variables(d.declaration)) expand(v.name,[],v.fallback);
        }
        const result={refs:[...new Map(refs.map(r=>[JSON.stringify(r),r])).values()],unresolved:[...new Set(unresolved)]};referenceCache.set(cacheKey,result);return result;
      }
      function styles(node, pseudo='') {
        const s=pseudo?getComputedStyle(node,pseudo):style(node), values={};
        for (const property of properties) {
          const css=s.getPropertyValue(property), evidence=references(node,property,pseudo);
          values[property]={css,...evidence};
        }
        return values;
      }
      function geometry(node) {
        const s=style(node), r=rect(node);
        const laidOut=s.display!=='none' && s.display!=='contents' && node.getClientRects().length>0;
        const g={box:laidOut?box(r):null,visibility:laidOut?'visible':'not_laid_out'};
        if (!laidOut) return g;
        const rects=[...node.getClientRects()].map(box);
        if(rects.length>1)g.clientRects=rects;
        if(node instanceof HTMLElement)g.layoutSize={width:node.offsetWidth,height:node.offsetHeight};
        let clip={left:origin.left,top:origin.top,right:origin.right,bottom:origin.bottom}, hidden=s.visibility!=='visible';
        for(let ancestor=node;ancestor;ancestor=ancestor.parentElement){
          const a=style(ancestor), ar=rect(ancestor);hidden ||= a.display==='none'||Number(a.opacity)===0;
          if(ancestor!==node && a.display!=='inline'){
            const sx=ar.width/(ancestor.offsetWidth||ar.width||1),sy=ar.height/(ancestor.offsetHeight||ar.height||1);
            if(/hidden|clip|scroll|auto/.test(a.overflowX)){clip.left=Math.max(clip.left,ar.left+(ancestor.clientLeft||0)*sx);clip.right=Math.min(clip.right,ar.left+((ancestor.clientLeft||0)+ancestor.clientWidth)*sx);}
            if(/hidden|clip|scroll|auto/.test(a.overflowY)){clip.top=Math.max(clip.top,ar.top+(ancestor.clientTop||0)*sy);clip.bottom=Math.min(clip.bottom,ar.top+((ancestor.clientTop||0)+ancestor.clientHeight)*sy);}
            if(/hidden|clip|scroll|auto/.test(a.overflowX+a.overflowY)&&parseFloat(a.borderRadius))limit('CLIP_SHAPE_APPROXIMATE',paths.get(node),'bounds','border-radius');
          }
          if(a.clipPath!=='none'||a.maskImage!=='none'){g.clipAccuracy='bounds';limit('CLIP_SHAPE_APPROXIMATE',paths.get(node),'bounds','clip-path');}
          if(ancestor===document.querySelector('[data-adg-frame]'))break;
        }
        g.clip={x:round(clip.left-origin.left),y:round(clip.top-origin.top),width:round(Math.max(0,clip.right-clip.left)),height:round(Math.max(0,clip.bottom-clip.top))};
        const visible={left:Math.max(r.left,clip.left),top:Math.max(r.top,clip.top),right:Math.min(r.right,clip.right),bottom:Math.min(r.bottom,clip.bottom)};
        g.visibleBox=visible.right>visible.left&&visible.bottom>visible.top?box({...visible,width:visible.right-visible.left,height:visible.bottom-visible.top}):null;
        g.visibility=hidden?'hidden':!g.visibleBox?'clipped':visible.left>r.left||visible.top>r.top||visible.right<r.right||visible.bottom<r.bottom?'partial':'visible';
        g.clipAccuracy??='rect';
        if(node.scrollWidth>node.clientWidth||node.scrollHeight>node.clientHeight||node.scrollTop||node.scrollLeft)g.scroll={x:node.scrollLeft||0,y:node.scrollTop||0,width:node.scrollWidth||0,height:node.scrollHeight||0,clientWidth:node.clientWidth||0,clientHeight:node.clientHeight||0};
        if(s.transform!=='none'||s.rotate!=='none'||s.scale!=='none'||s.translate!=='none')limit('TRANSFORM_QUAD_UNAVAILABLE',paths.get(node),'bounds','transform');
        return g;
      }
      function attributes(node) {
        const attrs={};
        for(const a of node.attributes) if (/^(?:id|data-part|data-adg-id|role|aria-.+|title|lang|dir|alt|for|type|placeholder|disabled|readonly|checked|selected|required|multiple|tabindex|href|target|rel)$/.test(a.name) && !/^data:/.test(a.value))attrs[a.name]=a.value;
        if(node.matches('input,textarea,select')){
          if(node.type==='password')attrs.valueRedacted=true;
          else {attrs.value=node.value; if('checked'in node)attrs.checked=node.checked;}
        }
        return attrs;
      }
      function addRun(node, raw, kind, slot, boxes, accuracy='range', pseudo) {
        const path=paths.get(node);
        const run={path,slot,kind,raw,normalized:p.normalizeText(raw),boxes,accuracy,...(pseudo?{pseudo}:{})};
        let group=node;for(;group&&group.parentElement;group=group.parentElement)if(group.matches('button,a,label,input,textarea,select,text')||!['inline','contents'].includes(style(group).display))break;
        run.group=paths.get(group)??path;
        const indices=[];let anchor=kind==='dom'?node.childNodes[slot]:node;
        for(let current=anchor;current&&current!==document.querySelector('[data-adg-frame]');current=current.parentNode)indices.unshift([...current.parentNode.childNodes].indexOf(current));
        if(kind!=='dom')indices.push(pseudo==='after'?Number.MAX_SAFE_INTEGER:-2);
        orderKeys.set(run,indices);runs.push(run);
      }
      return {
        node(node) {
          const path=paths.get(node),s=style(node),g=geometry(node),attrs=attributes(node);
          const fact={path,tag:node.localName,namespace:node.namespaceURI,attributes:attrs,geometry:g,values:styles(node),effects:{},pseudo:[]};
          for(const property of ['filter','backdrop-filter','mix-blend-mode','isolation','contain','clip-path','mask-image','perspective']){
            const value=s.getPropertyValue(property);
            if(value && !['none','normal','auto'].includes(value)){fact.effects[property]=value;limit(property.includes('clip')||property.includes('mask')?'CLIP_SHAPE_APPROXIMATE':'INK_BOUNDS_UNAVAILABLE',path,'bounds',property);}
          }
          if(s.boxShadow!=='none'||s.textShadow!=='none')limit('INK_BOUNDS_UNAVAILABLE',path,'unavailable','shadow');
          if(node.matches('canvas,video,object,embed,foreignObject')){limit('OPAQUE_RESOURCE',path);limit('DYNAMIC_PAINT',path);}
          if(node.matches('animate,animateTransform,set'))limit('DYNAMIC_PAINT',path);
          for(const kind of ['before','after','marker','placeholder']){
            if(kind==='placeholder' && (!node.matches('input,textarea')||node.value||!node.placeholder))continue;
            if(kind==='marker' && s.display!=='list-item')continue;
            const ps=getComputedStyle(node,'::'+kind);
            const content=kind==='placeholder'?node.placeholder:ps.content;
            if(!['placeholder','marker'].includes(kind)&&['none','normal',''].includes(content))continue;
            if(ps.display==='none')continue;
            const pseudo={kind,content,values:styles(node,'::'+kind),geometry:{box:null,visibility:g.visibility}};
            fact.pseudo.push(pseudo);limit('PSEUDO_BOX_UNAVAILABLE',path,'unavailable',kind);
            let raw=kind==='placeholder'?content:[...content.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g)].map(m=>(m[1]??m[2]).replace(/\\([\da-f]{1,6})\s?|\\(.)/gi,(_,hex,char)=>hex?String.fromCodePoint(parseInt(hex,16)||0xfffd):char)).join('');
            if(kind==='marker'&&content==='normal'||/\b(?:attr|counter|counters|url)\(/.test(content)){raw=content;limit('GENERATED_TEXT_UNRESOLVED',path,'unavailable',kind);}
            if(raw)addRun(node,raw,'pseudo',kind,[],'owner_box',kind);
          }
          if(!node.matches('script,style,defs,title,metadata') && !node.closest('defs')){
            for(const [slot,child]of [...node.childNodes].entries())if(child.nodeType===3 && child.data.length){
              const {rects}=p.textRects(child);addRun(node,child.data,'dom',slot,rects.map(box));
            }
            if(node.matches('input,textarea,select')&&node.type!=='password'){
              const value=node.matches('select')?[...node.selectedOptions].map(o=>o.text).join(' '):node.value;
              if(value)addRun(node,value,'control','value',g.box?[g.box]:[],'control_box');
            }
          }
          const svg=node instanceof SVGElement;
          if(svg){fact.svgAttributes={};for(const a of node.attributes)if(/^(?:d|points|x|y|width|height|cx|cy|r|rx|ry|viewBox|transform|href|xlink:href|gradientUnits|gradientTransform|offset|clipPathUnits|maskUnits|maskContentUnits|preserveAspectRatio|id)$/.test(a.name))fact.svgAttributes[a.name]=a.value;}
          if(node.matches('svg,img,image,canvas,video')){
            const url=node.currentSrc||node.getAttribute('src')||node.getAttribute('href')||node.getAttribute('xlink:href');
            fact.resource={kind:node.matches('svg')?(node.hasAttribute('data-adg-icon')?'icon':'svg'):node.matches('img,image')?'raster':'opaque',source:node.getAttribute('data-adg-art'),url,
              intrinsic:node instanceof HTMLImageElement?{width:node.naturalWidth,height:node.naturalHeight}:svg?{width:node.width?.baseVal?.value||g.box?.width||0,height:node.height?.baseVal?.value||g.box?.height||0}:null,
              viewBox:node.getAttribute('viewBox'),icon:node.getAttribute('data-adg-icon')};
          }
          const urls=[...s.backgroundImage.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map(m=>m[1]);
          if(urls.length)fact.backgrounds=urls;
          facts.push(fact);
        },
        finish(){runs.sort((a,b)=>{const x=orderKeys.get(a),y=orderKeys.get(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;});return {nodes:facts,runs,limitations,size:{width:round(origin.width),height:round(origin.height)},palette:Object.fromEntries(tokens.map(t=>[t.name,getComputedStyle(document.documentElement).getPropertyValue(t.name).trim()||null]))};},
      };
    },
  };
}

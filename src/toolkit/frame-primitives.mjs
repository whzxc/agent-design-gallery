/** Installed once per page; browser collectors share these exact, synchronous primitives. */
export function installFramePrimitives() {
  if (globalThis.__adgFramePrimitives) return;
  const normalizeText = text => text.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
  function inventory(root) {
    const elements=[root,...root.querySelectorAll('*')];
    const neutralCandidates=new Set(elements);
    for(const keyed of root.querySelectorAll('[data-adg-keys]'))for(let parent=keyed.parentElement;parent&&parent!==root;parent=parent.parentElement)neutralCandidates.add(parent);
    return {elements, paths:new Map(elements.map((node,i)=>[node,String(i)])),neutralCandidates};
  }
  function relativeBox(rect, origin, clamp=false) {
    const clean=n=>n===0?0:n;
    return {x:clean(rect.left-origin.left),y:clean(rect.top-origin.top),width:clamp?Math.max(0,rect.right-rect.left):rect.width,height:clamp?Math.max(0,rect.bottom-rect.top):rect.height};
  }
  function variables(expression, fallback=false) {
    const result=[]; const regex=/var\(\s*(--[\w-]+)/g;let match;
    while((match=regex.exec(expression))){
      let depth=1,comma=-1,end=regex.lastIndex;
      for(;end<expression.length&&depth;end++){
        if(expression[end]==='(')depth++;else if(expression[end]===')')depth--;
        else if(expression[end]===','&&depth===1&&comma<0)comma=end;
      }
      result.push({name:match[1],fallback});
      if(comma>=0)result.push(...variables(expression.slice(comma+1,end-1),true));
      regex.lastIndex=end;
    }return result;
  }
  function selectors(text) {
    const out=[];let start=0,depth=0,quote='';
    for(let i=0;i<text.length;i++){
      const char=text[i];
      if(quote){if(char==='\\')i++;else if(char===quote)quote='';}
      else if(char==='"'||char==="'")quote=char;
      else if(char==='('||char==='[')depth++;
      else if(char===')'||char===']')depth--;
      else if(char===','&&!depth){out.push(text.slice(start,i));start=i+1;}
    }return [...out,text.slice(start)].map(v=>v.trim());
  }
  function reads(){
    const styles=new Map(),rects=new Map();
    return {style:node=>{if(!styles.has(node))styles.set(node,getComputedStyle(node));return styles.get(node);},
      rect:node=>{if(!rects.has(node))rects.set(node,node.getBoundingClientRect());return rects.get(node);}};
  }
  function styleRules({referencesOnly=false,includeCustom=false,resolveNesting=false}={}) {
    const rules=[];
  function visitRules(list, containers = [], parents = []) {
    for (const rule of list) {
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches || rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
      const nested = typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule ? [...containers, rule.cssText.slice(0, rule.cssText.indexOf('{'))] : containers;
      let resolved = parents;
      if (rule.selectorText && rule.style) {
        const own = selectors(rule.selectorText);
        resolved = resolveNesting && parents.length ? parents.flatMap(parent => own.map(selector => selector.includes('&') ? selector.replaceAll('&', `:is(${parent})`) : `${parent} ${selector}`)) : own;
        if (!referencesOnly || [...rule.style].some(property => rule.style.getPropertyValue(property).includes('var(')||includeCustom&&property.startsWith('--'))) rules.push({ rule, selectors: resolved, style: rule.style, containers });
      }
      if (rule.cssRules) visitRules(rule.cssRules, nested, resolved);
    }
  }
    for(const sheet of document.styleSheets)visitRules(sheet.cssRules);return rules;
  }
  function textRects(node) {const range=document.createRange();range.selectNodeContents(node);return {range,rects:[...range.getClientRects()]};}
  function identityNode(node,path,parentPath,owners,style,checkNeutral=true){
    const attributes={};
    for(const name of ['id','data-part','data-adg-id','role','aria-label','aria-labelledby','aria-describedby'])if(node.hasAttribute(name))attributes[name]=node.getAttribute(name);
    const password=node.matches('input[type=password]');
    const neutral = checkNeutral && !owners.length && !node.hasAttribute('data-adg-id') && !node.hasAttribute('data-adg-keys') &&
      !Object.keys(attributes).length && /^(div|span)$/.test(node.localName) && (node.children.length===1 || style?.display==='contents') &&
      ![...node.childNodes].some(n=>n.nodeType===3 && n.data.trim()) && style &&
      ['block','inline','contents'].includes(style.display) && style.position==='static' &&
      style.transform==='none' && style.overflowX==='visible' && style.overflowY==='visible' &&
      style.opacity==='1' && style.backgroundColor==='rgba(0, 0, 0, 0)' && style.boxShadow==='none' &&
      ['Top','Right','Bottom','Left'].every(side=>parseFloat(style[`margin${side}`])===0 && parseFloat(style[`padding${side}`])===0 && parseFloat(style[`border${side}Width`])===0);
    const native={button:'button',a:node.hasAttribute('href')?'link':null,input:node.type==='checkbox'?'checkbox':node.type==='radio'?'radio':node.type==='button'||node.type==='submit'?'button':'textbox',select:'combobox',textarea:'textbox',h1:'heading',h2:'heading',h3:'heading',h4:'heading',h5:'heading',h6:'heading',img:'img'};
    const role=node.getAttribute('role')??native[node.localName];
    const labelled=node.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>node.ownerDocument.getElementById(id)?.textContent??'').join(' ');
    // Theme-independent naming evidence; AX exposure/hidden state never changes an address.
    const name=normalizeText(labelled||node.getAttribute('aria-label')||node.getAttribute('alt')||(role==='textbox'||role==='combobox'?Array.from(node.labels??[]).map(l=>l.textContent).join(' '):role?node.textContent:'')||'');
    const resource=node.localName==='svg'&&(node.hasAttribute('data-adg-icon')||node.getAttribute('aria-hidden')==='true'||!node.querySelector('text,foreignObject')&&!node.hasAttribute('role'));
    return {path,parentPath,tag:node.localName,namespace:node.namespaceURI,attributes,owners,neutral,resource,
      ...(role&&name?{semantic:{role,name}}:{}),
      keys:JSON.parse(node.getAttribute('data-adg-keys')??'[]'),password,
      directText:password?'':[...node.childNodes].filter(n=>n.nodeType===3).map(n=>n.data).join('')};
  }
  globalThis.__adgFramePrimitives={inventory,relativeBox,variables,selectors,reads,normalizeText,identityNode,styleRules,textRects};
}

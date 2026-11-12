/** inspectVersion 1: concrete CSS defaults, independent of the host font palette. */
export const inspectVersion = 1;
const sides = ['top','right','bottom','left'];
const corners = ['top-left','top-right','bottom-right','bottom-left'];
const entries = (names,value) => Object.fromEntries(names.map(name=>[name,value]));
export const styleDefaults = Object.freeze({
  display:'inline', position:'static', ...entries(sides,'auto'), 'box-sizing':'content-box',
  width:'auto',height:'auto','min-width':'auto','min-height':'auto','max-width':'none','max-height':'none',
  'flex-direction':'row','flex-wrap':'nowrap','flex-grow':'0','flex-shrink':'1','flex-basis':'auto',
  'justify-content':'normal','align-items':'normal','align-self':'auto','align-content':'normal',order:'0',
  'row-gap':'normal','column-gap':'normal','grid-template-columns':'none','grid-template-rows':'none',
  'grid-auto-flow':'row','grid-auto-columns':'auto','grid-auto-rows':'auto',
  ...entries(['grid-row-start','grid-row-end','grid-column-start','grid-column-end'],'auto'),
  ...entries(sides.flatMap(side=>[`margin-${side}`,`padding-${side}`]),'0px'),
  'overflow-x':'visible','overflow-y':'visible',visibility:'visible','z-index':'auto',
  transform:'none','transform-origin':'50% 50%',translate:'none',rotate:'none',scale:'none',direction:'ltr','writing-mode':'horizontal-tb',
  'font-family':'serif','font-size':'16px','font-weight':'400','font-style':'normal','font-stretch':'100%',
  'line-height':'normal','letter-spacing':'normal','word-spacing':'0px','font-feature-settings':'normal',
  'font-variation-settings':'normal','font-kerning':'auto','text-align':'start','text-indent':'0px',
  'text-transform':'none','text-decoration-line':'none','text-decoration-style':'solid',
  'text-decoration-thickness':'auto','text-underline-offset':'auto','white-space':'normal','word-break':'normal',
  'overflow-wrap':'normal','text-overflow':'clip','vertical-align':'baseline',
  color:'rgb(0, 0, 0)','background-color':'rgba(0, 0, 0, 0)','background-image':'none',
  'background-size':'auto','background-position':'0% 0%','background-repeat':'repeat','background-clip':'border-box',opacity:'1',
  ...entries(sides.map(side=>`border-${side}-color`),'rgb(0, 0, 0)'),
  ...entries(sides.map(side=>`border-${side}-style`),'none'), ...entries(sides.map(side=>`border-${side}-width`),'0px'),
  ...entries(corners.map(corner=>`border-${corner}-radius`),'0px'),
  'outline-color':'rgb(0, 0, 0)','outline-style':'none','outline-width':'0px','outline-offset':'0px',
  'box-shadow':'none','text-shadow':'none',fill:'rgb(0, 0, 0)','fill-opacity':'1',stroke:'none','stroke-width':'1px',
  'stroke-opacity':'1','stroke-dasharray':'none','stroke-dashoffset':'0px','stroke-linecap':'butt','stroke-linejoin':'miter',
  'fill-rule':'nonzero','stop-color':'rgb(0, 0, 0)','stop-opacity':'1',
});
export function expandStyle(style={}) { return {...styleDefaults,...style}; }
export function compactStyle(style) {return Object.fromEntries(Object.entries(style).filter(([name,value])=>styleDefaults[name]!==value));}

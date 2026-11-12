export type Theme = 'light' | 'dark';
export type FieldGroup = 'structure' | 'layout' | 'typography' | 'color' | 'text';
export interface Box { x:number; y:number; width:number; height:number }
export interface Geometry {
  box:Box|null; visibility:'visible'|'partial'|'clipped'|'hidden'|'not_laid_out';
  clientRects?:Box[]; layoutSize?:{width:number;height:number}; visibleBox?:Box|null;
  clip?:Box; clipAccuracy?:'rect'|'bounds';
  scroll?:{x:number;y:number;width:number;height:number;clientWidth:number;clientHeight:number};
}
export interface Identity {
  stability:'authored'|'semantic'|'positional'; guard:string; anchor?:string; key?:string|number;
  duplicate?:{group:string;ordinal:number;count:number};
}
export interface Element {
  id:string; identity:Identity; tag:string; namespace:string; parent:string|null; children:string[];
  role?:string|null; name?:string|null; a11y?:'exposed'|'ignored'|'unavailable';
  attributes?:Record<string,string|boolean|number|string[]>; owner?:string; markers?:string[];
  style?:string; geometry?:Geometry; text?:string[]; resource?:string; backgrounds?:string[];
  effects?:Record<string,string>; cutoff?:{descendants:number};
  pseudo?:{id:string;kind:'before'|'after'|'marker'|'placeholder';content:string;style?:string;geometry?:Geometry;text?:string[]}[];
}
export interface TextRun {
  id:string;kind:'dom'|'control'|'pseudo';element:string;raw:string;normalized:string;style?:string;
  fragments:{element:string;start:number;end:number;boxes:Box[];accuracy:'range'|'control_box'|'owner_box'}[];
}
export interface Scene { roots:string[];context:Element[];elements:Element[];instances:never[];runs:TextRun[];size:{width:number;height:number} }
export interface Reference {
  element:string;theme:Theme;property:string;token:string;kind:'direct'|'alias'|'fallback';
  expression:string;via:string[];inherited:boolean;basis:'authored_reference'|'inline';shorthand?:string;
  localOverrides?:{name:string;declaration:string}[];
}
export interface Value { css:string;attribution:'raw'|'references'|'unresolved';refs?:string[];reason?:string }
export interface Token {
  source:string;line:number;declaration:string;resolved:string|null;
  dark?:{line?:number;declaration?:string;resolved?:string|null};
}
export interface Resource {
  kind:'icon'|'svg'|'raster'|'opaque';source:string|null;mime:string|null;
  intrinsic:{width:number;height:number}|null;contentIdentity?:string;url?:string;
  icon?:{library:'lucide';name:string;viewBox:string};
  svg?:{viewBox:string|null;geometry:SVGNode[];definitions:SVGNode[]};
}
export interface SVGNode {id:string;tag:string;attributes:Record<string,string>;children:string[]}
export interface InspectData {
  inspectVersion:1;identityVersion:1;project:string;complete:boolean;mode:'catalog'|'frame';encoding:'expanded';
  selection:{source:string|null;frame:string|null;themes:Theme[];subtree:null|{kind:'part'|'element'|'text';input:string;contains:boolean};depth:number|null;fields:FieldGroup[];wrappers:'semantic'|'all';expand:true};
  catalog:{source:string;frames:{name:string;locale:string|null;width:number|null;height:number|null}[]}[];
  frame:{source:string;name:string;locale:string|null;authored:{width:number|null;height:number|null};parent:{source:string;frame:string;selector:string}|null}|null;
  baselineTheme:Theme|null;baseline:Scene|null;delta:null;additionalThemes:Partial<Record<Theme,Scene>>;
  tables:{values:Record<string,Value>;styles:Record<string,Record<string,string>>;tokens:Record<string,Token>;references:Record<string,Reference>;parts:Record<string,{source:string;export:string}>;templates:Record<string,never>;resources:Record<string,Resource>};
  partInstances:{id:string;part:string;root:string;parent:string|null}[];
  matches:{element:string;themes:Theme[];runs?:string[]}[];
  limitations:{code:string;count:number;elements:string[];properties:string[];themes:Theme[];accuracy:'exact'|'bounds'|'unavailable'}[];
  coverage:{domain:'tsx';discoveredSources:number;listedFrames:number;requestedObservations:number;completedObservations:number;rawElements:number;retainedElements:number;collapsedElements:number;cutOffElements:number;logicalElements:number;runs:number;cacheHits:number;frameLoads:number;materializedSources:number};
  timings:{prepareMs:number;materializeMs:number;observeMs:number;projectMs:number;totalMs:number};
}
export function inspect(config:object,args?:string[],values?:Record<string,string|boolean>,options?:object):Promise<{data:InspectData;warnings:{code:string;message:string;next:{argv:string[];reason:string}[]}[]}>;
export function inspectText(data:InspectData):string;

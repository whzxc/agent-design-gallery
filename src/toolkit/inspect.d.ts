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
  stability:'authored'|'semantic'|'positional'|'resource'; guard:string; anchor?:string; key?:string|number;
  duplicate?:{group:string;ordinal:number;count:number}; slot?:number;
}
export interface Element {
  id:string; identity:Identity; tag:string; namespace:string; parent:string|null; children:string[];
  role?:string|null; name?:string|null; a11y?:'exposed'|'ignored'|'unavailable';
  attributes?:Record<string,string|boolean|number|string[]>; owner?:string; markers?:string[];
  style?:string[]; geometry?:Geometry; text?:string[]; resource?:string; backgrounds?:string[];
  effects?:Record<string,string>; cutoff?:{descendants:number};
  pseudo?:{id:string;kind:'before'|'after'|'marker'|'placeholder';content:string;style?:string[];geometry?:Geometry;text?:string[]}[];
}
export interface TextRun {
  id:string;kind:'dom'|'control'|'pseudo';element:string;raw:string;normalized:string;style?:string[];
  fragments:{element:string;start:number;end:number;boxes:Box[];accuracy:'range'|'control_box'|'owner_box'}[];
}
export interface Scene { roots:string[];context:Element[];elements:Element[];instances:never[];runs:TextRun[];size:{width:number;height:number} }
export interface Reference {
  property:string;token:string;kind:'direct'|'alias'|'fallback';
  expression:string;via?:string[];inherited?:true;basis:'authored_reference'|'inline';
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
export interface InspectCommon {
  inspectVersion:1;identityVersion:1;project:string;complete:boolean;mode:'catalog'|'frame';
  selection:{source:string|null;frame:string|null;themes:Theme[];subtree:null|{kind:'part'|'element'|'text';input:string;contains:boolean};depth:number|null;fields:FieldGroup[];wrappers:'semantic'|'all';expand:boolean};
  catalog:{source:string;frames:{name:string;locale:string|null;width:number|null;height:number|null}[]}[];
  frame:{source:string;name:string;locale:string|null;authored:{width:number|null;height:number|null};parent:{source:string;frame:string;selector:string}|null}|null;
  baselineTheme:Theme|null;
  matches:{element:string;themes:Theme[];runs?:string[]}[];
  limitations:{code:string;count:number;elements:string[];properties:string[];themes:Theme[];accuracy:'exact'|'bounds'|'unavailable'}[];
  coverage:{domain:'tsx';discoveredSources:number;listedFrames:number;requestedObservations:number;completedObservations:number;rawElements:number;retainedElements:number;collapsedElements:number;cutOffElements:number;logicalElements:number;runs:number;cacheHits:number;frameLoads:number;materializedSources:number};
  timings:{prepareMs:number;materializeMs:number;observeMs:number;projectMs:number;totalMs:number};
}
export interface ExpandedInspectData extends InspectCommon {
  encoding:'expanded';baseline:Scene|null;delta:null;additionalThemes:Partial<Record<Theme,Scene>>;
  tables:{values:Record<string,Value>;styles:Record<string,Record<string,string>>;tokens:Record<string,Token>;references:Record<string,Reference>;parts:Record<string,{source:string;export:string}>;templates:Record<string,never>;resources:Record<string,Resource>};
  partInstances:{id:string;part:string;root:string;parent:string|null}[];
}
export type BoxTuple=[x:number,y:number,width:number,height:number];
export type LocalAddress=number|string;
export interface CompactGeometry {
  box:BoxTuple|null;visibility?:Geometry['visibility'];clientRects?:BoxTuple[];
  visibleBox?:BoxTuple|null;clip?:BoxTuple;clipAccuracy?:'rect'|'bounds';
  layoutSize?:[width:number,height:number];scroll?:Geometry['scroll'];
}
export interface CompactExtra {
  owner?:number|null;markers?:number[];attributes?:Record<string,unknown>;
  resource?:number;backgrounds?:number[];effects?:Record<string,string>;cutoff?:{descendants:number};
  identity?:Identity;text?:string[];
  pseudo?:{id:string;kind:'before'|'after'|'marker'|'placeholder';content:string;style?:number[];geometry?:Geometry;text?:string[]}[];
}
// type indexes tables.elementTypes; styles indexes per-group records, not one monolithic style.
export type CompactElement=[id:number,type:number,children:number[],styles:number[]|null,geometry:BoxTuple|CompactGeometry|null,extra?:CompactExtra];
export interface CompactRun {
  element:LocalAddress;slot:string;raw:string;normalized?:string;kind?:TextRun['kind'];style?:number[];
  boxes?:Box[];accuracy?:'control_box'|'owner_box';fragments?:TextRun['fragments'];
}
export interface CompactInstance {at:number;template:string;ids:number[];origin:[number,number];parent:number|null;owner?:number}
export interface CompactScene {
  roots:number[];context:CompactElement[];elements:CompactElement[];runs:CompactRun[];
  instances:CompactInstance[];size:{width:number;height:number};runOrder?:string[];
}
export type StylePairs=(number|'$width'|'$height')[];
export interface NodeDelta {
  added?:CompactElement[];removed?:number[];
  changed?:({id:number;unset?:string[]}&Partial<Record<'1'|'2'|'3'|'4'|'5',unknown>>)[];
  styles?:number[][]; // [element, group position, new style, ...]
  order?:number[];
}
export interface CompactDelta {
  theme:Theme;elements?:NodeDelta;context?:NodeDelta;
  runs?:{added?:CompactRun[];removed?:string[];changed?:({id:string;unset?:string[]}&Partial<CompactRun>)[];order?:string[]};
  roots?:number[];size?:{width:number;height:number};instances?:CompactInstance[];
}
export type CompactIdentity=[elementId:string,guard:string|null,stability:0|1|2|3,extra?:[group:number,ordinal:number]|{anchor?:string;key?:string|number;duplicate?:[number,number]}]|[resourceRoot:number,slot:number];
export interface CompactTables {
  properties:string[];
  values:(string|[css:string,refs:number[],reason?:string])[];
  styles:(StylePairs|[base:[number],set:StylePairs,unset?:number[]])[];
  references:[token:string,property:number,flags:number,extra?:{expression?:string;via?:string[];localOverrides?:[string,string][];basis?:string}][];
  tokens:Record<string,[line:number,declaration:string,extra?:{source?:string;resolved?:string|null;dark?:Token['dark']}]>;tokenSource?:string;
  parts:{source:string;export:string}[];
  resources:(Omit<Resource,'mime'|'svg'>&{mime?:string|null;svg?:{viewBox:string|null;geometry:[tag:string,attributes:Record<string,string>,children:string[]][]}})[];
  identities:CompactIdentity[];duplicates?:[digest:string,count:number,guard?:string][];
  a11y:[role:string|null,name:string|null,status:'exposed'|'ignored'|'unavailable'][];
  elementTypes:[tag:string,a11y:number|null,namespace?:string][];
  templates:Record<string,Omit<CompactScene,'roots'|'size'>>;
}
export interface CompactInspectData extends Omit<InspectCommon,'matches'|'limitations'> {
  mode:'frame';encoding:'compact';baseline:CompactScene;delta:CompactDelta|null;tables:CompactTables;
  partInstances:[part:number,root:number,parent:number|null][];
  matches:{element:number;themes:Theme[];runs?:string[]}[];
  limitations:(Omit<InspectCommon['limitations'][number],'elements'>&{elements:number[]})[];
}
export type InspectData=ExpandedInspectData|CompactInspectData;
export function inspect(config:object,args?:string[],values?:Record<string,string|boolean>,options?:object):Promise<{data:InspectData;warnings:{code:string;message:string;next:{argv:string[];reason:string}[]}[]}>;
export function inspectText(data:InspectData):string;

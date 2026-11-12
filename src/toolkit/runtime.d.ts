export type Content = unknown;
export type Capture = ({ region: string; selector?: never; page?: never } | { selector: string; region?: never; page?: never } | { page: true; region?: never; selector?: never }) & { viewport?: string; origin?: string; clicks?: string[] };
export interface FrameParent { source: string; frame: string; selector: string }
export interface FrameProps { name: string; width?: number; height?: number; fixture?: string; capture?: Capture; parent?: FrameParent; note?: string; locale?: string; children?: Content }
export interface IconProps { "data-adg-id"?: string; name: string; size?: number; class?: string }
export function Frame(props: FrameProps): JSX.Element;
export function Icon(props: IconProps): JSX.Element;
export function jsx(type: unknown, props: unknown, key?: string | number): JSX.Element;
export { jsx as jsxs };
export function jsxDEV(type: unknown, props: unknown, key?: string | number, isStatic?: boolean, source?: { fileName: string; lineNumber: number; columnNumber: number }): JSX.Element;
export function Fragment(props: { children?: Content }): JSX.Element;
export namespace JSX {
  type Element = any;
  interface IntrinsicAttributes { key?: string | number }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicElements { [name: string]: { class?: string; "data-adg-id"?: string; children?: Content; [attribute: string]: unknown } }
}

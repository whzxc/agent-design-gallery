export type Content = unknown;
export type Capture = ({ region: string; selector?: never; page?: never } | { selector: string; region?: never; page?: never } | { page: true; region?: never; selector?: never }) & { viewport?: string; origin?: string; clicks?: string[] };
export interface FrameParent { source: string; frame: string; selector: string }
export interface FrameProps { name: string; width?: number; height?: number; fixture?: string; capture?: Capture; parent?: FrameParent; note?: string; locale?: string; children?: Content }
export interface IconProps { name: string; size?: number; class?: string }
export function Frame(props: FrameProps): JSX.Element;
export function Icon(props: IconProps): JSX.Element;
export function jsx(type: unknown, props: unknown): JSX.Element;
export { jsx as jsxs, jsx as jsxDEV };
export function Fragment(props: { children?: Content }): JSX.Element;
export namespace JSX {
  type Element = any;
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicElements { [name: string]: { class?: string; children?: Content; [attribute: string]: unknown } }
}

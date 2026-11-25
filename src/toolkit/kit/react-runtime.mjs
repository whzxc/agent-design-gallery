import { icons } from 'lucide';
import {
  artworkSource,
  componentOwner,
  recordFrameOrigin,
  registerArtwork,
  registerComponent,
  transferFrameOrigin,
} from '../runtime.mjs';
import { unwrapAdgMarkers } from './html-markers.mjs';

export { componentOwner, registerArtwork, registerComponent };

export function Frame(props) {
  return props;
}

const SVG_ATTR_MAP = {
  class: 'className',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'fill-rule': 'fillRule',
  'fill-opacity': 'fillOpacity',
  'clip-rule': 'clipRule',
  'clip-path': 'clipPath',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  'xlink:href': 'xlinkHref',
};

function mapSvgAttrName(name) {
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  if (Object.hasOwn(SVG_ATTR_MAP, name)) return SVG_ATTR_MAP[name];
  const lower = name.toLowerCase();
  if (Object.hasOwn(SVG_ATTR_MAP, lower)) return SVG_ATTR_MAP[lower];
  return name.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function camelCaseSvgAttrs(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs ?? {})) {
    out[mapSvgAttrName(k)] = v;
  }
  return out;
}

function parseRootSvgAttrs(raw) {
  const attrs = {};
  for (const match of raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
    const [, name, dq, sq] = match;
    if (!name || name === 'xmlns:xlink') continue;
    const value = dq !== undefined ? dq : sq !== undefined ? sq : '';
    attrs[mapSvgAttrName(name)] = value;
  }
  return attrs;
}

export function createReactAdgModule(React) {
  function Icon({ name, size = 16, class: cls, className, ...props }) {
    const key = name.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
    const geometry = icons[key];
    if (!geometry) throw Error(`Unknown Lucide icon ${name}`);
    return React.createElement(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75 * 24 / size,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        className: className ?? cls,
        ...props,
        'data-adg-icon': name,
      },
      geometry.map(([tag, attrs], index) =>
        React.createElement(tag, { key: index, ...camelCaseSvgAttrs(attrs) })
      )
    );
  }

  function artwork(source, props = {}, provenance) {
    const match = source.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
    if (!match) throw Error('Invalid SVG artwork');
    const rootAttrs = parseRootSvgAttrs(match[1]);
    const normalizedProps = {};
    for (const [k, v] of Object.entries(props ?? {})) {
      if (k === 'class') normalizedProps.className = v;
      else normalizedProps[k] = v;
    }
    const merged = {
      ...rootAttrs,
      ...normalizedProps,
      ...(provenance ? { 'data-adg-art': provenance } : {}),
      dangerouslySetInnerHTML: { __html: match[2] },
    };
    return React.createElement('svg', merged);
  }

  return { Frame, Icon, registerComponent, registerArtwork, artwork };
}

function validateKey(key) {
  if (
    key !== undefined &&
    key !== null &&
    !((typeof key === 'string' && key.length > 0) || (typeof key === 'number' && Number.isFinite(key)))
  ) {
    throw Error('JSX key must be a nonempty string or finite number');
  }
}

export function createDesignJsxRuntime(React, realJsxRuntime, realJsxDevRuntime) {
  const ownedWrappers = new WeakMap();
  const realJsx = realJsxRuntime.jsx ?? realJsxRuntime.default?.jsx;
  const realJsxs = realJsxRuntime.jsxs ?? realJsxRuntime.default?.jsxs ?? realJsx;
  const realJsxDev = realJsxDevRuntime?.jsxDEV ?? realJsxDevRuntime?.default?.jsxDEV ?? realJsx;
  const Fragment = React.Fragment ?? realJsxRuntime.Fragment;

  function getOwnedWrapper(type, owner) {
    let wrapper = ownedWrappers.get(type);
    if (!wrapper) {
      const encodedOwner = JSON.stringify(owner);
      wrapper = function AdgOwnedComponent(props) {
        return React.createElement('adg-owner', { 'data-o': encodedOwner }, React.createElement(type, props));
      };
      ownedWrappers.set(type, wrapper);
    }
    return wrapper;
  }

  function wrapElement(create, type, props, key, ...rest) {
    const source = rest.length >= 2 ? rest[1] : undefined;
    try {
      validateKey(key);
      if (typeof type === 'string') {
        if (['script', 'style'].includes(type.toLowerCase())) {
          throw Error(`Forbidden <${type}>; use tokens and utility classes`);
        }
        let nextProps = props;
        if (props && typeof props === 'object') {
          let copied = null;
          const ensureCopy = () => (copied ??= { ...props });
          if ('class' in props && !('className' in props)) {
            ensureCopy().className = props.class;
            delete copied.class;
          }
          const art = artworkSource(props.src ?? props.href ?? props['xlink:href']);
          if (art && !('data-adg-art' in props)) {
            ensureCopy()['data-adg-art'] = art;
          }
          if (copied) nextProps = copied;
        }
        const el = create(type, nextProps, undefined, ...rest);
        if (key != null) {
          return React.createElement('adg-key', { key, 'data-k': JSON.stringify({ key }) }, el);
        }
        return el;
      }

      if (type === Frame) {
        const el = create(type, props, key, ...rest);
        if (source) recordFrameOrigin(el, source);
        return el;
      }

      if (type === Fragment) {
        const el = create(type, props, undefined, ...rest);
        if (key != null) {
          return React.createElement('adg-key', { key, 'data-k': JSON.stringify({ key }) }, el);
        }
        return el;
      }

      if (typeof type === 'function') {
        const owner = componentOwner(type);
        const renderType = owner ? getOwnedWrapper(type, owner) : type;
        const el = create(renderType, props, key != null ? undefined : key, ...rest);
        if (key != null) {
          return React.createElement(
            'adg-key',
            { key, 'data-k': JSON.stringify({ key, ...(owner ? { owner } : {}) }) },
            el
          );
        }
        return el;
      }

      return create(type, props, key, ...rest);
    } catch (error) {
      if (!error.located && source) {
        error.message = `${source.fileName}:${source.lineNumber}:${source.columnNumber}: ${error.message}`;
        error.located = true;
      }
      throw error;
    }
  }

  return {
    Fragment,
    jsx: (type, props, key) => wrapElement(realJsx, type, props, key),
    jsxs: (type, props, key) => wrapElement(realJsxs, type, props, key),
    jsxDEV: (type, props, key, isStatic, source, self) =>
      wrapElement(realJsxDev, type, props, key, isStatic, source, self),
  };
}

function injectKitMarker(props) {
  if (!props || typeof props !== 'object') return { 'data-adg-kit': '' };
  if ('data-adg-kit' in props) return props;
  return { ...props, 'data-adg-kit': '' };
}

export function createKitJsxRuntime(realJsxRuntime, realJsxDevRuntime) {
  const realJsx = realJsxRuntime.jsx ?? realJsxRuntime.default?.jsx;
  const realJsxs = realJsxRuntime.jsxs ?? realJsxRuntime.default?.jsxs ?? realJsx;
  const realJsxDev = realJsxDevRuntime?.jsxDEV ?? realJsxDevRuntime?.default?.jsxDEV ?? realJsx;
  const Fragment = realJsxRuntime.Fragment ?? realJsxDevRuntime?.Fragment;

  return {
    Fragment,
    jsx: (type, props, key) =>
      realJsx(type, typeof type === 'string' ? injectKitMarker(props) : props, key),
    jsxs: (type, props, key) =>
      realJsxs(type, typeof type === 'string' ? injectKitMarker(props) : props, key),
    jsxDEV: (type, props, key, isStatic, source, self) =>
      realJsxDev(type, typeof type === 'string' ? injectKitMarker(props) : props, key, isStatic, source, self),
  };
}

export function wrapKitCreateElement(realCreateElement) {
  return function adgKitCreateElement(type, props, ...children) {
    return realCreateElement(type, typeof type === 'string' ? injectKitMarker(props) : props, ...children);
  };
}

function flattenFrameResults(value, Fragment, out = []) {
  if (value == null || typeof value === 'boolean') return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenFrameResults(item, Fragment, out);
    return out;
  }
  if (typeof value === 'object' && value.type === Fragment) {
    flattenFrameResults(value.props?.children, Fragment, out);
    return out;
  }
  out.push(value);
  return out;
}

export function renderReactFrames(mod, { React, ReactDOMServer, relativeFile }) {
  const renderToStaticMarkup =
    ReactDOMServer.renderToStaticMarkup ?? ReactDOMServer.default?.renderToStaticMarkup;
  if (typeof renderToStaticMarkup !== 'function') {
    throw Error('Kit engine "react" requires react-dom/server renderToStaticMarkup');
  }

  const rawValue = mod.default();
  const items = flattenFrameResults(rawValue, React.Fragment);
  if (!items.length) {
    throw Error(`${relativeFile}: default export must return at least one Frame`);
  }

  const prevError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) {
      return;
    }
    return prevError.apply(console, args);
  };

  try {
    return items.map(item => {
      if (!item || typeof item !== 'object' || item.type !== Frame) {
        throw Error('Default export must return named Frames');
      }
      const { children, ...frameProps } = item.props ?? {};
      const rawHtml = renderToStaticMarkup(children ?? null);
      const html = unwrapAdgMarkers(rawHtml);
      const frame = { frame: true, ...frameProps, html };
      transferFrameOrigin(item, frame);
      return frame;
    });
  } finally {
    console.error = prevError;
  }
}

import { blockForAsset, layoutWorld } from "./layout.js";
// Measure declared SVG content in an isolated, script-disabled document.
export async function prepare(asset, theme) {
  const response = await fetch(
    `/asset/${encodeURIComponent(asset.path)}?theme=${theme}&v=${encodeURIComponent(asset.version)}`,
  );
  if (!response.ok) throw new Error(`Cannot load ${asset.path}`);
  const source = await response.text();

  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText =
    "position:fixed;left:-100000px;top:0;width:2000px;height:2000px;visibility:hidden";
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`SVG measurement timed out: ${asset.path}`)),
        10000,
      );
      frame.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      frame.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Cannot measure ${asset.path}`));
      };
      frame.srcdoc = `<!doctype html><html data-theme="${theme}"><body style="margin:0">${source}</body></html>`;
      document.body.append(frame);
    });
    const root = frame.contentDocument.querySelector("svg");
    if (!root) throw new Error(`Invalid SVG: ${asset.path}`);
    const vb = root.viewBox.baseVal;
    const full = {
      x: vb.x,
      y: vb.y,
      width: vb.width || root.width.baseVal.value || 300,
      height: vb.height || root.height.baseVal.value || 150,
    };
    const component = root.dataset.design === "component";
    const selector = component
      ? "g[data-component][data-form]"
      : 'g[data-part^="frame-"]';
    const nodes = [...root.querySelectorAll(selector)].filter(
      (e) => !e.parentElement.closest(selector),
    );
    const parts = nodes
      .map((e, index) => {
        const b = e.getBBox(),
          m = root.getScreenCTM().inverse().multiply(e.getScreenCTM());
        const points = [
          [b.x, b.y],
          [b.x + b.width, b.y],
          [b.x, b.y + b.height],
          [b.x + b.width, b.y + b.height],
        ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
        const x = Math.min(...points.map((p) => p.x)),
          y = Math.min(...points.map((p) => p.y));
        return {
          id: String(index),
          name: e.dataset.form || e.dataset.part.replace(/^frame-/, ""),
          x,
          y,
          width: Math.max(...points.map((p) => p.x)) - x,
          height: Math.max(...points.map((p) => p.y)) - y,
        };
      })
      .filter((p) => p.width > 0 && p.height > 0);
    return {
      ...asset,
      source,
      full,
      component,
      parts,
      background: frame.contentWindow
        .getComputedStyle(root)
        .getPropertyValue("--canvas")
        .trim(),
    };
  } finally {
    frame.remove();
  }
}
export function imageURL(asset, crop) {
  if (!crop)
    return URL.createObjectURL(
      new Blob([asset.source], { type: "image/svg+xml" }),
    );
  const doc = new DOMParser().parseFromString(asset.source, "image/svg+xml"),
    root = doc.documentElement;
  if (crop.id !== "full")
    for (const note of root.querySelectorAll(":scope > text.note"))
      note.remove();
  if (/^\d+$/.test(crop.id)) {
    const selector = asset.component
      ? "g[data-component][data-form]"
      : 'g[data-part^="frame-"]';
    const nodes = [...root.querySelectorAll(selector)].filter(
      (e) => !e.parentElement.closest(selector),
    );
    nodes.forEach((node, index) => {
      if (String(index) !== crop.id) node.remove();
    });
  }
  root.setAttribute(
    "viewBox",
    `${crop.x} ${crop.y} ${crop.width} ${crop.height}`,
  );
  root.setAttribute("width", crop.width);
  root.setAttribute("height", crop.height);
  return URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(doc)], {
      type: "image/svg+xml",
    }),
  );
}

export function arrange(data) {
  const used = new Set(),
    grouped = [];
  for (const g of data.groups) {
    const list = g.assets.flatMap((p) => {
      const a = data.assets.find((a) => a.path === p);
      if (!a || used.has(p)) return [];
      used.add(p);
      return [a];
    });
    if (list.length) grouped.push({ ...g, assets: list });
  }
  const rest = new Map();
  for (const a of data.assets) {
    if (used.has(a.path)) continue;
    const parent = a.path.split("/").slice(0, -1).join("/") || "Design";
    if (!rest.has(parent)) rest.set(parent, []);
    rest.get(parent).push(a);
  }
  for (const [title, assets] of rest) grouped.push({ title, assets });
  const sections = layoutWorld(grouped.map(g => ({ ...g, blocks: g.assets.map(blockForAsset) })));
  const groups = sections.map(s => ({ ...s, width: s.w, height: s.h }));
  const items = [];
  for (const [group, section] of groups.entries()) {
    for (const block of section.blocks) {
      const asset = section.assets.find(a => a.path === block.asset);
      const frames = block.kind === 'set' ? [{ id: 'overview', name: 'All forms', x: block.x, y: block.y, crop: block.crop }] : block.frames;
      for (const frame of frames) {
        const crop = { ...frame.crop, width: frame.crop.w, height: frame.crop.h, id: frame.id, name: frame.name };
        items.push({ ...asset, id: block.kind === 'set' ? asset.path : `${asset.path}#${frame.id}`, kind: block.kind,
          group, x: frame.x, y: frame.y, width: crop.width, height: crop.height, shown: [crop] });
      }
    }
  }
  return { groups, items, world: { x: 0, y: 0, width: Math.max(1, ...groups.map(g => g.x + g.width)), height: Math.max(1, ...groups.map(g => g.y + g.height)) } };
}

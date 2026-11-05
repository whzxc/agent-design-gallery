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
        let padding = 12;
        for (const element of [
          e,
          ...e.querySelectorAll('[filter], [style*="filter"]'),
        ]) {
          const match = frame.contentWindow
            .getComputedStyle(element)
            .filter.match(/#([^"')]+)/);
          const filter =
            match && frame.contentDocument.getElementById(match[1]);
          if (!filter) continue;
          let blur = 0,
            offset = 0;
          for (const node of filter.querySelectorAll("feGaussianBlur"))
            blur = Math.max(
              blur,
              ...node.getAttribute("stdDeviation").split(/\s+/).map(Number),
            );
          for (const node of filter.querySelectorAll("feOffset"))
            offset = Math.max(
              offset,
              Math.abs(Number(node.getAttribute("dx"))),
              Math.abs(Number(node.getAttribute("dy"))),
            );
          padding = Math.max(padding, blur * 3 + offset);
        }
        return {
          id: String(index),
          name: e.dataset.form || e.dataset.part.replace(/^frame-/, ""),
          x: x - padding,
          y: y - padding,
          width: Math.max(...points.map((p) => p.x)) - x + padding * 2,
          height: Math.max(...points.map((p) => p.y)) - y + padding * 2,
        };
      })
      .filter((p) => p.width > 24 && p.height > 24);
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
  const groups = [],
    items = [];
  let groupY = 0,
    bandHeight = 0;
  grouped.forEach((g, gi) => {
    if (gi && gi % 3 === 0) {
      groupY += bandHeight + 160;
      bandHeight = 0;
    }
    const capacity = g.assets.some((a) => !a.component) ? 2800 : 1400;
    const group = {
      ...g,
      x: (gi % 3) * 1600,
      y: groupY,
      width: capacity + 40,
      height: 0,
    };
    let row = [],
      rowWidth = 0,
      y = 88;
    function flush() {
      if (!row.length) return;
      const h = Math.max(...row.map((a) => a.height)),
        extra = (capacity - rowWidth) / row.length;
      let x = 20;
      for (const a of row) {
        a.x = group.x + x;
        a.y = group.y + y;
        a.width += a.chrome && capacity === 1400 ? extra : 0;
        a.height = h;
        items.push(a);
        x += a.width + 20;
      }
      y += h + 20;
      row = [];
      rowWidth = 0;
    }
    for (const asset of g.assets) {
      const parts = asset.parts.length
        ? asset.parts
        : [{ ...asset.full, id: "full", name: "Full sheet" }];
      if (asset.component) {
        const compact =
          parts.length > 1 &&
          Math.max(...parts.map((p) => p.height)) >
            Math.max(240, Math.min(...parts.map((p) => p.height)) * 3);
        const bounds = {
          x: Math.min(...parts.map((p) => p.x)),
          y: Math.min(...parts.map((p) => p.y)),
        };
        bounds.width = Math.max(...parts.map((p) => p.x + p.width)) - bounds.x;
        bounds.height =
          Math.max(...parts.map((p) => p.y + p.height)) - bounds.y;
        const keepSheet = !compact && parts.length > 1 && bounds.height < 240;
        const shown = compact
          ? [parts.reduce((a, b) => (a.height <= b.height ? a : b))]
          : keepSheet
            ? [{ ...bounds, id: "overview", name: "All forms" }]
            : parts;
        const total =
          shown.reduce((n, p) => n + p.width, 0) +
          Math.max(0, shown.length - 1) * 20;
        // Compact forms share a baseline. Large families wrap within one source region.
        const rows = [];
        let r = [],
          rw = 0;
        for (const p of shown) {
          if (r.length && rw + p.width > 1300) {
            rows.push(r);
            r = [];
            rw = 0;
          }
          r.push(p);
          rw += p.width + 20;
        }
        if (r.length) rows.push(r);
        const a = {
          ...asset,
          id: asset.path,
          group: gi,
          compact,
          shown,
          rows,
          chrome: true,
          width: Math.min(1400, Math.max(compact ? 680 : 300, total + 56)),
          height: Math.max(
            160,
            rows.reduce(
              (n, r) => n + Math.max(...r.map((p) => p.height)) + 28,
              0,
            ) + 72,
          ),
        };
        if (row.length && rowWidth + a.width + 20 > capacity) flush();
        row.push(a);
        rowWidth += a.width + (row.length > 1 ? 20 : 0);
      } else
        for (const p of parts) {
          const a = {
            ...asset,
            id: asset.path + "#" + p.id,
            group: gi,
            shown: [p],
            rows: [[p]],
            chrome: false,
            width: p.width + 40,
            height: p.height + 52,
          };
          if (row.length && rowWidth + a.width + 20 > capacity) flush();
          row.push(a);
          rowWidth += a.width + (row.length > 1 ? 20 : 0);
          if (a.width > capacity) flush();
        }
    }
    flush();
    group.height = y + 20;
    group.width = Math.max(
      capacity + 40,
      ...items
        .filter((a) => a.group === gi)
        .map((a) => a.x - group.x + a.width + 20),
    );
    groups.push(group);
    bandHeight = Math.max(bandHeight, group.height);
  });
  // Wide generic sheets get their own horizontal room without overlapping adjacent groups.
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i],
      offset = i % 3 ? groups[i - 1].x + groups[i - 1].width + 160 - g.x : 0;
    g.x += offset;
    for (const a of items.filter((a) => a.group === i)) a.x += offset;
  }
  return {
    groups,
    items,
    world: {
      x: 0,
      y: 0,
      width: Math.max(1, ...groups.map((g) => g.x + g.width)),
      height: Math.max(1, ...groups.map((g) => g.y + g.height)),
    },
  };
}

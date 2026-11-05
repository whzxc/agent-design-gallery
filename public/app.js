// ARC's gallery layout and camera model, decoupled from its React runtime.
const $ = (selector) => document.querySelector(selector);
const viewport = $(".gallery-viewport"),
  canvas = $("canvas"),
  ctx = canvas.getContext("2d", { alpha: false });
let manifest,
  groups = [],
  assets = [],
  world = { x: 0, y: 0, width: 1, height: 1 },
  view = { x: 0, y: 0, scale: 1 };
let width = viewport.clientWidth,
  height = viewport.clientHeight,
  dpr = devicePixelRatio,
  theme = "system",
  effectiveTheme = "dark",
  selected = null,
  active = null;
let raf = 0,
  idleTimer,
  saveTimer,
  moving = false,
  loading = 0,
  queued = [],
  palette = {};
const cache = new Map(),
  pointers = new Map();
let gesture = {};
const media = matchMedia("(prefers-color-scheme: dark)");
window.__sdg = {
  ready: false,
  get view() {
    return { ...view };
  },
  get assets() {
    return assets.length;
  },
};
const clamp = (s) => Math.max(0.025, Math.min(32, s));
function error(message) {
  $("#error").textContent = message;
  $("#error").hidden = !message;
}
async function api(url, data) {
  const response = await fetch(
    url,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {},
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () =>
      api("/preferences", {
        directory: manifest?.directory,
        view,
        theme,
      }).catch((e) => error(e.message)),
    220,
  );
}
function layout(data) {
  const used = new Set(),
    arranged = [];
  for (const group of data.groups) {
    const list = group.assets.flatMap((p) => {
      const asset = data.assets.find((a) => a.path === p);
      if (!asset || used.has(p)) return [];
      used.add(p);
      return [asset];
    });
    if (list.length) arranged.push({ title: group.title, assets: list });
  }
  const rest = new Map();
  for (const asset of data.assets) {
    if (used.has(asset.path)) continue;
    const parent = asset.path.includes("/")
      ? asset.path.split("/").slice(0, -1).join("/")
      : "Design";
    if (!rest.has(parent)) rest.set(parent, []);
    rest.get(parent).push(asset);
  }
  for (const [title, list] of rest) arranged.push({ title, assets: list });
  groups = [];
  assets = [];
  let rowY = 0,
    rowHeight = 0;
  for (const [i, group] of arranged.entries()) {
    if (i % 3 === 0 && i) {
      rowY += rowHeight + 104;
      rowHeight = 0;
    }
    const row = group.assets.length > 9 ? 248 : 416;
    const item = {
      ...group,
      x: (i % 3) * 1592,
      y: rowY,
      width: 1496,
      height: Math.max(
        1592,
        200 + Math.ceil(group.assets.length / 3) * row + 40,
      ),
    };
    rowHeight = Math.max(rowHeight, item.height);
    groups.push(item);
    group.assets.forEach((asset, index) =>
      assets.push({
        ...asset,
        group: i,
        x: item.x + 56 + (index % 3) * 464,
        y: item.y + 200 + Math.floor(index / 3) * row,
        width: 432,
        height: row - 16,
      }),
    );
  }
  world = {
    x: 0,
    y: 0,
    width: Math.min(3, groups.length) * 1592 - 96 || 1,
    height: rowY + rowHeight || 1,
  };
  $("#modules").replaceChildren(
    ...groups.map((g, i) => {
      const b = document.createElement("button"),
        s = document.createElement("span"),
        count = document.createElement("small");
      s.textContent = g.title;
      count.textContent = g.assets.length;
      b.append(s, count);
      b.onclick = () => {
        active = i;
        selected = null;
        frame(g);
        selection();
      };
      return b;
    }),
  );
  $("#asset-access").replaceChildren(
    ...assets.map((a) => {
      const b = document.createElement("button");
      b.textContent = `View ${a.name}`;
      b.onclick = () => focusAsset(a);
      b.onfocus = () => focusAsset(a);
      return b;
    }),
  );
  $("#empty").hidden = !!assets.length;
}
function selection() {
  [...$("#modules").children].forEach((b, i) =>
    active === i
      ? b.setAttribute("aria-current", "location")
      : b.removeAttribute("aria-current"),
  );
  $("#source").hidden = !selected;
  if (selected) {
    $("#reveal").textContent = selected;
    $("#reveal").title = `Reveal ${selected}`;
  }
}
function frame(box) {
  const scale = clamp(
    Math.min((width - 48) / box.width, (height - 48) / box.height),
  );
  commit({
    scale,
    x: (width - box.width * scale) / 2 - box.x * scale,
    y: (height - box.height * scale) / 2 - box.y * scale,
  });
}
function fit() {
  selected = null;
  active = null;
  selection();
  frame(world);
}
function focusAsset(a) {
  selected = a.path;
  active = a.group;
  selection();
  frame(a);
}
function zoom(scale, x = width / 2, y = height / 2) {
  const next = clamp(scale);
  commit({
    scale: next,
    x: x - ((x - view.x) * next) / view.scale,
    y: y - ((y - view.y) * next) / view.scale,
  });
}
function commit(next) {
  view = next;
  moving = true;
  requestDraw();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    moving = false;
    requestDraw();
    save();
  }, 100);
}
function requestDraw() {
  if (!raf) raf = requestAnimationFrame(draw);
}
function visible(a) {
  return (
    view.x + (a.x + a.width) * view.scale > 0 &&
    view.x + a.x * view.scale < width &&
    view.y + (a.y + a.height) * view.scale > 0 &&
    view.y + a.y * view.scale < height
  );
}
function rounded(x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function assetURL(a) {
  return `/asset/${encodeURIComponent(a.path)}?theme=${effectiveTheme}&v=${encodeURIComponent(a.version)}`;
}
function ensureImage(a) {
  const key = assetURL(a);
  let entry = cache.get(key);
  if (entry) {
    entry.used = performance.now();
    return entry;
  }
  entry = { key, asset: a, used: performance.now(), state: "queued" };
  cache.set(key, entry);
  queued.push(entry);
  pump();
  return entry;
}
function pump() {
  while (loading < 3 && queued.length) {
    const e = queued.shift();
    if (!cache.has(e.key)) continue;
    loading++;
    e.state = "loading";
    const image = new Image();
    image.decoding = "async";
    e.image = image;
    image.onload = () => {
      e.state = "ready";
      loading--;
      requestDraw();
      pump();
    };
    image.onerror = () => {
      e.state = "error";
      loading--;
      error(
        `Cannot load ${e.asset.path}. Check the SVG and its local references.`,
      );
      requestDraw();
      pump();
    };
    image.src = e.key;
  }
}
function thumbnail(e, a, upgrade = false) {
  const scale = Math.min(2, Math.max(0.25, view.scale)) * dpr;
  if (e.bitmap && (!upgrade || e.bitmapScale >= scale)) return e.bitmap;
  const image = e.image,
    ratio = Math.min(
      (a.width - 24) / image.naturalWidth,
      (a.height - 100) / image.naturalHeight,
    );
  const raster = document.createElement("canvas");
  raster.width = Math.max(1, Math.ceil(image.naturalWidth * ratio * scale));
  raster.height = Math.max(1, Math.ceil(image.naturalHeight * ratio * scale));
  raster.getContext("2d").drawImage(image, 0, 0, raster.width, raster.height);
  e.bitmap = raster;
  e.bitmapScale = scale;
  return raster;
}
function draw() {
  raf = 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  for (const group of groups) {
    if (!visible(group)) continue;
    rounded(group.x, group.y, group.width, group.height, 72, palette.surface);
    ctx.fillStyle = palette.text;
    ctx.font = "600 56px system-ui";
    ctx.fillText(group.title, group.x + 56, group.y + 112);
    ctx.fillStyle = palette.muted;
    ctx.font = "48px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(
      group.assets.length,
      group.x + group.width - 56,
      group.y + 112,
    );
    ctx.textAlign = "left";
  }
  let ready = 0,
    visibleCount = 0;
  for (const a of assets) {
    if (!visible(a)) continue;
    visibleCount++;
    const e = ensureImage(a),
      image = e.image;
    rounded(a.x, a.y, a.width, a.height - 76, 20, palette.raised);
    if (e.state === "ready") {
      ready++;
      const source = moving
        ? thumbnail(e, a)
        : view.scale < 0.8
          ? thumbnail(e, a, true)
          : image;
      const ratio = Math.min(
          (a.width - 24) / image.naturalWidth,
          (a.height - 100) / image.naturalHeight,
        ),
        w = image.naturalWidth * ratio,
        h = image.naturalHeight * ratio;
      ctx.drawImage(
        source,
        a.x + (a.width - w) / 2,
        a.y + (a.height - 76 - h) / 2,
        w,
        h,
      );
    }
    ctx.fillStyle = palette.muted;
    ctx.font = "44px system-ui";
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y + a.height - 72, a.width, 72);
    ctx.clip();
    ctx.fillText(a.name, a.x, a.y + a.height - 16);
    ctx.restore();
    if (selected === a.path) {
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2 / view.scale;
      ctx.strokeRect(a.x, a.y, a.width, a.height - 76);
    }
  }
  ctx.restore();
  $("output").value = `${Math.round(view.scale * 100)}%`;
  window.__sdg.ready = !!manifest && ready === visibleCount;
  window.__sdg.revision = manifest?.revision;
  window.__sdg.visibleReady = ready;
  window.__sdg.visibleCount = visibleCount;
  // Keep a small working set of decoded SVGs and preview rasters across pan gestures.
  if (cache.size > 80) {
    for (const e of [...cache.values()].sort((a, b) => a.used - b.used)) {
      if (cache.size <= 64) break;
      if (!assets.some((a) => assetURL(a) === e.key && visible(a)))
        cache.delete(e.key);
    }
  }
}
function applyTheme() {
  effectiveTheme =
    theme === "system" ? (media.matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = effectiveTheme;
  const css = getComputedStyle(document.documentElement);
  palette = Object.fromEntries(
    ["canvas", "surface", "raised", "text", "muted", "accent"].map((k) => [
      k,
      css.getPropertyValue("--" + k).trim(),
    ]),
  );
  for (const b of $("#themes").children)
    b.setAttribute("aria-pressed", String(b.dataset.theme === theme));
  requestDraw();
}
for (const b of $("#themes").children)
  b.onclick = () => {
    theme = b.dataset.theme;
    applyTheme();
    save();
  };
media.addEventListener("change", applyTheme);
viewport.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect(),
      unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
    if (e.ctrlKey || e.metaKey)
      zoom(
        view.scale *
          Math.exp(-Math.max(-300, Math.min(300, e.deltaY * unit)) * 0.008),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    else
      commit({
        ...view,
        x: view.x - e.deltaX * unit,
        y: view.y - e.deltaY * unit,
      });
  },
  { passive: false },
);
viewport.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  viewport.focus({ preventScroll: true });
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1)
    gesture = { x: e.clientX, y: e.clientY, moved: false };
  else gesture.moved = true;
  viewport.setPointerCapture(e.pointerId);
});
viewport.addEventListener("pointermove", (e) => {
  const old = pointers.get(e.pointerId);
  if (!old) return;
  const before = [...pointers.values()];
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4)
    gesture.moved = true;
  if (pointers.size === 1)
    commit({
      ...view,
      x: view.x + e.clientX - old.x,
      y: view.y + e.clientY - old.y,
    });
  else if (pointers.size === 2) {
    const after = [...pointers.values()],
      distance = (p) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y),
      d = distance(before);
    if (d < 1) return;
    const rect = viewport.getBoundingClientRect(),
      s = clamp((view.scale * distance(after)) / d),
      ox = (before[0].x + before[1].x) / 2 - rect.left,
      oy = (before[0].y + before[1].y) / 2 - rect.top,
      nx = (after[0].x + after[1].x) / 2 - rect.left,
      ny = (after[0].y + after[1].y) / 2 - rect.top;
    commit({
      scale: s,
      x: nx - ((ox - view.x) * s) / view.scale,
      y: ny - ((oy - view.y) * s) / view.scale,
    });
  }
});
function up(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (e.type === "pointerup" && !gesture.moved) {
    const rect = viewport.getBoundingClientRect(),
      x = (e.clientX - rect.left - view.x) / view.scale,
      y = (e.clientY - rect.top - view.y) / view.scale;
    const a = assets.find(
      (a) => x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height,
    );
    if (a) focusAsset(a);
  }
  if (viewport.hasPointerCapture(e.pointerId))
    viewport.releasePointerCapture(e.pointerId);
}
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  viewport.addEventListener(event, up);
viewport.addEventListener("keydown", (e) => {
  if (e.target !== viewport) return;
  const v = view;
  if (e.key === "+" || e.key === "=") zoom(v.scale * 1.25);
  else if (e.key === "-") zoom(v.scale / 1.25);
  else if (e.key === "0" || e.key === "Escape") fit();
  else if (e.key === "1") zoom(1);
  else if (e.key.startsWith("Arrow"))
    commit({
      ...v,
      x: v.x + (e.key === "ArrowLeft" ? 80 : e.key === "ArrowRight" ? -80 : 0),
      y: v.y + (e.key === "ArrowUp" ? 80 : e.key === "ArrowDown" ? -80 : 0),
    });
  else return;
  e.preventDefault();
});
$("#fit").onclick = fit;
$("#minus").onclick = () => zoom(view.scale / 1.25);
$("#plus").onclick = () => zoom(view.scale * 1.25);
$("#actual").onclick = () => zoom(1);
$("#reveal").onclick = () =>
  api("/reveal", { path: selected }).catch((e) => error(e.message));
new ResizeObserver(() => {
  const oldW = width,
    oldH = height;
  width = viewport.clientWidth;
  height = viewport.clientHeight;
  dpr = devicePixelRatio;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  if (oldW)
    view = {
      ...view,
      x: view.x + (width - oldW) / 2,
      y: view.y + (height - oldH) / 2,
    };
  requestDraw();
}).observe(viewport);
function recent() {
  $("#recent").replaceChildren(
    ...manifest.recent.map((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p;
      b.title = p;
      b.onclick = () => open(p);
      return b;
    }),
  );
}
function showOpen() {
  recent();
  $("#path").value = manifest?.directory ?? "";
  $("#open-error").hidden = true;
  $("#directories").showModal();
  $("#path").focus();
}
$("#open").onclick = showOpen;
$("#close").onclick = () => $("#directories").close();
$("#directory-form").onsubmit = (e) => {
  e.preventDefault();
  void open($("#path").value);
};
async function open(directory) {
  const button = $("#directory-form button[type=submit]");
  button.disabled = true;
  try {
    await api("/preferences", { directory: manifest.directory, view, theme });
    const data = await api("/open", { directory });
    applyManifest(data);
    $("#directories").close();
    viewport.focus();
  } catch (e) {
    $("#open-error").textContent = e.message;
    $("#open-error").hidden = false;
  } finally {
    button.disabled = false;
  }
}
function applyManifest(data) {
  const changedRoot = manifest?.directory !== data.directory,
    first = !manifest;
  if (!changedRoot && !first && manifest.revision === data.revision) return;
  const oldAssets = manifest?.assets ?? [];
  manifest = data;
  for (const a of oldAssets) {
    if (
      !data.assets.some((b) => a.path === b.path && a.version === b.version)
    ) {
      for (const [key, e] of cache)
        if (e.asset.path === a.path) cache.delete(key);
    }
  }
  if (changedRoot) {
    cache.clear();
    queued = [];
    selected = null;
    active = null;
  }
  layout(data);
  $("#directory").textContent = data.label;
  $("#directory").title = data.directory ?? "";
  document.title = `${data.label} — SVG Design Gallery`;
  if (first) {
    theme = data.theme;
    applyTheme();
  }
  if (changedRoot || first) {
    if (data.view) view = data.view;
    else frame(world);
  }
  if (selected && !assets.some((a) => a.path === selected)) selected = null;
  selection();
  requestDraw();
}
let fetching = false,
  pending = false;
async function refresh() {
  if (fetching) {
    pending = true;
    return;
  }
  fetching = true;
  try {
    applyManifest(await api("/manifest"));
    error("");
  } catch (e) {
    error(e.message);
  } finally {
    fetching = false;
    if (pending) {
      pending = false;
      void refresh();
    }
  }
}
await refresh();
if (!manifest?.directory) showOpen();
const events = new EventSource("/events");
events.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.error) error(data.error);
  else void refresh();
};
events.onerror = () => error("Local server disconnected. Reconnecting…");

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !$("#directories").open &&
    !event.defaultPrevented
  ) {
    fit();
    viewport.focus({ preventScroll: true });
  }
});

import { icon, hydrateIcons } from "./icons.js";
hydrateIcons();
import { prepare, imageURL, arrange } from "./assets.js";
// ARC's gallery layout and camera model, decoupled from its React runtime.
const $ = (selector) => document.querySelector(selector);
const viewport = $(".gallery-viewport"),
  canvas = $(".gallery-viewport canvas"),
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
let sidebar = true,
  inspector = false,
  selectedId = null,
  inspection = null;
let history = [],
  searchReturn = null;
const expanded = new Set(),
  prepared = new Map();
const currentItem = () => inspection || assets.find((a) => a.id === selectedId);
function remember() {
  history.push({
    view: { ...view },
    active,
    selected,
    selectedId,
    inspection,
    inspector,
  });
  if (history.length > 40) history.shift();
}
function back() {
  const old = history.pop();
  if (old) {
    ({ active, selected, selectedId, inspection, inspector } = old);
    selection();
    commit(old.view);
  }
}
function toggleSidebar(value = !sidebar) {
  sidebar = value;
  $(".gallery").classList.toggle("sidebar-hidden", !sidebar);
  $("#sidebar-toggle").setAttribute("aria-expanded", String(sidebar));
  resizeViewport();
  save();
}

const media = matchMedia("(prefers-color-scheme: dark)");
window.__sdg = {
  ready: false,
  get view() {
    return { ...view };
  },
  get assets() {
    return assets.length;
  },
  get items() {
    return assets.map(({ id, path, x, y, width, height, group }) => ({
      id,
      path,
      x,
      y,
      width,
      height,
      group,
    }));
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
        view: inspection
          ? (history.findLast((h) => !h.inspection)?.view ?? view)
          : view,
        theme,
        sidebar,
        inspector,
      }).catch((e) => error(e.message)),
    220,
  );
}
function layout(data, preserve = false) {
  const previous = assets,
    previousGroups = groups,
    result = arrange(data);
  groups = result.groups;
  assets = result.items;
  world = result.world;
  if (preserve) {
    for (const group of groups) {
      const old = previousGroups.find((g) => g.title === group.title);
      if (old) {
        group.x = old.x;
        group.y = old.y;
      }
    }
    const occupied = previous.filter((p) => assets.some((a) => a.id === p.id));
    const shape = (a) =>
      JSON.stringify(a.rows.map((row) => row.map((p) => [p.width, p.height])));
    for (const a of assets) {
      const old = previous.find((p) => p.id === a.id);
      if (old) {
        a.x = old.x;
        a.y = old.y;
      }
      if (
        old &&
        (shape(old) === shape(a) ||
          (a.width <= old.width && a.height <= old.height))
      ) {
        a.width = old.width;
        a.height = old.height;
        continue;
      }
      const group = groups[a.group];
      a.x = old?.x ?? group.x + 20;
      a.y =
        Math.max(
          group.y + 88,
          ...occupied
            .filter((p) => previousGroups[p.group]?.title === group.title)
            .map((p) => p.y + p.height),
        ) + 20;
      let collision;
      while (
        (collision = occupied.find(
          (p) =>
            p.id !== a.id &&
            a.x < p.x + p.width + 20 &&
            a.x + a.width + 20 > p.x &&
            a.y < p.y + p.height + 20 &&
            a.y + a.height + 20 > p.y,
        ))
      )
        a.y = collision.y + collision.height + 20;
      const index = occupied.findIndex((p) => p.id === a.id);
      if (index >= 0) occupied[index] = a;
      else occupied.push(a);
    }
    for (const g of groups) {
      const list = assets.filter((a) => groups[a.group] === g);
      g.width = Math.max(g.width, ...list.map((a) => a.x + a.width - g.x + 20));
      g.height = Math.max(
        g.height,
        ...list.map((a) => a.y + a.height - g.y + 20),
      );
    }
    world.width = Math.max(1, ...groups.map((g) => g.x + g.width));
    world.height = Math.max(1, ...groups.map((g) => g.y + g.height));
  }
  renderNav();
  $("#asset-access").replaceChildren(
    ...assets.map((a) => {
      const b = document.createElement("button");
      b.textContent = `View ${a.name}${!a.chrome ? " / " + a.shown[0].name : ""}`;
      b.onclick = () => focusAsset(a);
      return b;
    }),
  );
  $("#empty").hidden = !!assets.length;
}
function renderNav() {
  const focusKey = document.activeElement?.dataset.navkey;
  const query = $("#search").value.trim().toLowerCase();
  $("#modules").replaceChildren(
    ...groups.flatMap((g, i) => {
      const list = g.assets.filter(
        (a) =>
          !query ||
          [a.name, ...a.parts.map((p) => p.name)].some((n) =>
            n.toLowerCase().includes(query),
          ),
      );
      if (!list.length) return [];
      const section = document.createElement("section"),
        row = document.createElement("div"),
        chevron = document.createElement("button"),
        b = document.createElement("button");
      row.className = "group-row";
      chevron.innerHTML = icon(expanded.has(i) || query ? "chevron-down" : "chevron-right", 12);
      chevron.dataset.navkey = `toggle:${g.title}`;
      chevron.setAttribute("aria-label", `Toggle ${g.title}`);
      chevron.setAttribute("aria-expanded", String(expanded.has(i) || !!query));
      chevron.onclick = () => {
        expanded.has(i) ? expanded.delete(i) : expanded.add(i);
        renderNav();
      };
      b.textContent = g.title;
      b.dataset.navkey = `group:${g.title}`;
      b.className = "group-name";
      b.dataset.group = i;
      if (active === i) b.setAttribute("aria-current", "location");
      b.onclick = () => {
        remember();
        inspection = null;
        active = i;
        selected = null;
        selectedId = null;
        expanded.add(i);
        selection();
        frame(g);
      };
      row.append(chevron, b);
      section.append(row);
      if (expanded.has(i) || query)
        for (const a of list) {
          const file = document.createElement("button");
          file.className = "file";
          file.dataset.navkey = `file:${a.path}`;
          file.textContent = a.name;
          file.title = a.path;
          file.setAttribute("aria-current", String(selected === a.path));
          file.onclick = () => {
            const item = assets.find((x) => x.path === a.path);
            focusAsset(item);
          };
          section.append(file);
          if (query)
            for (const p of a.parts.filter((p) =>
              p.name.toLowerCase().includes(query),
            )) {
              const f = document.createElement("button");
              f.className = "file form-result";
              f.dataset.navkey = `form:${a.path}:${p.id}`;
              f.textContent = p.name;
              f.onclick = () =>
                inspectForm(
                  assets.find((x) => x.path === a.path),
                  p,
                );
              section.append(f);
            }
        }
      return [section];
    }),
  );
  if (focusKey)
    $("#modules")
      .querySelector(`[data-navkey="${CSS.escape(focusKey)}"]`)
      ?.focus({ preventScroll: true });
}
function selection() {
  renderNav();
  $("#back").disabled = !history.length;
  $("#breadcrumb").textContent = [
    "All designs",
    active !== null ? groups[active]?.title : null,
    inspection ? inspection.name + " / " + inspection.shown[0].name : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const wasHidden = $("#source").hidden;
  $("#source").hidden = !inspector || !selected;
  if (wasHidden !== $("#source").hidden)
    view = { ...view, x: view.x + ($("#source").hidden ? 152 : -152) };
  $("#inspect").setAttribute("aria-pressed", String(inspector));
  const a = currentItem();
  if (a) {
    $("#source-name").textContent = a.name;
    $("#source-path").textContent = a.path;
    const p = inspection?.shown[0] || a.full;
    $("#dimensions").textContent =
      `${Math.round(p.width)} × ${Math.round(p.height)}`;
    $("#forms").replaceChildren(
      ...[{ id: "full", name: "Full sheet" }, ...a.parts].map((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.name;
        return o;
      }),
    );
    $("#forms").value =
      inspection?.shown[0].id || (a.compact ? a.shown[0].id : "full");
  }
  requestDraw();
}
function frame(box) {
  const available = inspector && selected ? Math.max(240, width - 304) : width;
  const scale = clamp(
    Math.min((available - 64) / box.width, (height - 88) / box.height),
  );
  commit({
    scale,
    x: (available - box.width * scale) / 2 - box.x * scale,
    y: (height - 48 - box.height * scale) / 2 - box.y * scale,
  });
}
function fit() {
  remember();
  inspection = null;
  selected = null;
  selectedId = null;
  active = null;
  selection();
  frame(world);
}
function focusAsset(a) {
  if (!a) return;
  if (a === inspection) {
    frame(a);
    return;
  }
  remember();
  inspection = null;
  selected = a.path;
  selectedId = a.id;
  active = a.group;
  expanded.add(active);
  selection();
  frame(a);
}
function inspectForm(a, p) {
  if (!a || !p) return;
  a = assets.find((item) => item.path === a.path) || a;
  remember();
  inspection = {
    ...a,
    id: a.id + "@" + p.id,
    x: 0,
    y: 0,
    width: p.width + 40,
    height: p.height + 52,
    chrome: false,
    compact: false,
    shown: [p],
    rows: [[p]],
  };
  selected = a.path;
  selectedId = a.id;
  active = a.group;
  inspector = true;
  selection();
  frame(inspection);
  save();
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
  window.__sdg.ready = false;
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
function assetURL(a, p) {
  return `${a.path}|${effectiveTheme}|${a.version}|${p.id}`;
}
function ensureImage(a, p) {
  const key = assetURL(a, p);
  let e = cache.get(key);
  if (e) {
    e.used = performance.now();
    return e;
  }
  e = { key, asset: a, part: p, used: performance.now(), state: "queued" };
  cache.set(key, e);
  queued.push(e);
  pump();
  return e;
}
function pump() {
  while (loading < 3 && queued.length) {
    const e = queued.shift();
    if (!cache.has(e.key)) continue;
    loading++;
    e.state = "loading";
    const img = new Image();
    e.image = img;
    img.decoding = "async";
    const url = imageURL(e.asset, e.part);
    img.onload = () => {
      URL.revokeObjectURL(url);
      e.state = "ready";
      loading--;
      requestDraw();
      pump();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      e.state = "error";
      loading--;
      error(`Cannot render ${e.asset.path}`);
      requestDraw();
      pump();
    };
    img.src = url;
  }
}
function thumbnail(e, upgrade = false) {
  const scale = Math.min(2, Math.max(0.15, view.scale)) * dpr;
  if (e.bitmap && (!upgrade || e.bitmapScale >= scale)) return e.bitmap;
  const c = document.createElement("canvas");
  const limit = Math.min(scale, 4096 / Math.max(e.part.width, e.part.height));
  c.width = Math.max(1, Math.ceil(e.part.width * limit));
  c.height = Math.max(1, Math.ceil(e.part.height * limit));
  c.getContext("2d").drawImage(e.image, 0, 0, c.width, c.height);
  e.bitmap = c;
  e.bitmapScale = limit;
  return c;
}
function placements(a) {
  const rows = a.rows;
  let y =
    a.y +
    44 +
    (a.height -
      44 -
      rows.reduce((n, r) => n + Math.max(...r.map((p) => p.height)) + 28, 0)) /
      2;
  return rows.flatMap((row) => {
    const h = Math.max(...row.map((p) => p.height));
    let x =
      a.x +
      (a.width - row.reduce((n, p) => n + p.width, 0) - (row.length - 1) * 20) /
        2;
    const out = row.map((p) => {
      const pos = { part: p, x, y: y + (h - p.height) / 2 };
      x += p.width + 20;
      return pos;
    });
    y += h + 28;
    return out;
  });
}
function draw() {
  raf = 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle =
    $("#background").value === "theme"
      ? palette.canvas
      : $("#background").value;
  ctx.fillRect(0, 0, width, height);
  const displayed =
    manifest?.renderTheme === effectiveTheme
      ? inspection
        ? [inspection]
        : assets
      : [];
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  if (!inspection)
    for (const g of groups) {
      if (!visible(g)) continue;
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1 / view.scale;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y + 58);
      ctx.lineTo(g.x + g.width, g.y + 58);
      ctx.stroke();
    }
  let ready = 0,
    count = 0;
  for (const a of displayed) {
    if (!visible(a)) continue;
    if (a.chrome) {
      rounded(a.x, a.y, a.width, a.height, 10, palette.surface);
      rounded(
        a.x + 1,
        a.y + 40,
        a.width - 2,
        a.height - 41,
        8,
        a.background || palette.canvas,
      );
      ctx.strokeStyle = selectedId === a.id ? palette.accent : palette.border;
      ctx.lineWidth = 1 / view.scale;
      ctx.beginPath();
      ctx.roundRect(a.x, a.y, a.width, a.height, 10);
      ctx.stroke();
    }
    for (const pos of placements(a)) {
      count++;
      const e = ensureImage(a, pos.part);
      if (e.state !== "ready") continue;
      ready++;
      const source = moving
        ? thumbnail(e)
        : view.scale < 0.8
          ? thumbnail(e, true)
          : e.image;
      ctx.drawImage(source, pos.x, pos.y, pos.part.width, pos.part.height);
      if (
        a.chrome &&
        a.shown.length > 1 &&
        pos.part.height >= 140 &&
        view.scale >= 0.6
      ) {
        ctx.save();
        ctx.font = `${11 / view.scale}px system-ui`;
        ctx.fillStyle = palette.muted;
        ctx.fillText(
          pos.part.name,
          pos.x + 12,
          pos.y + pos.part.height + 12 / view.scale,
        );
        ctx.restore();
      }
    }
    if (!a.chrome && selectedId === a.id) {
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1 / view.scale;
      ctx.strokeRect(a.x, a.y, a.width, a.height);
    }
  }
  ctx.restore();
  // Labels stay in CSS pixels and disappear when their regions cannot accommodate them.
  if (!inspection)
    for (const g of groups) {
      if (!visible(g)) continue;
      const x = view.x + g.x * view.scale,
        y = view.y + g.y * view.scale;
      ctx.fillStyle = palette.text;
      ctx.font = "600 18px system-ui";
      ctx.fillText(
        g.title,
        x + 8,
        y + 16,
        Math.max(1, g.width * view.scale - (view.scale < 0.3 ? 16 : 80)),
      );
      if (view.scale < 0.3) continue;
      ctx.fillStyle = palette.muted;
      ctx.font = "12px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(
        `${g.assets.length} assets`,
        x + g.width * view.scale - 8,
        y + 16,
      );
      ctx.textAlign = "left";
    }
  for (const a of displayed) {
    if (!visible(a) || a.width * view.scale < 150 || view.scale < 0.45)
      continue;
    const x = view.x + a.x * view.scale,
      y = view.y + a.y * view.scale,
      w = a.width * view.scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 8, y, w - 16, 40 * view.scale);
    ctx.clip();
    ctx.fillStyle = palette.text;
    ctx.font = "500 12px system-ui";
    ctx.fillText(
      a.name + (!a.chrome ? " / " + a.shown[0].name : ""),
      x + 14,
      y + Math.max(14, 25 * view.scale),
      w - (a.compact ? 160 : 46),
    );
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "right";
    ctx.fillText(
      a.compact
        ? `${a.shown[0].name} · ${a.parts.indexOf(a.shown[0]) + 1} / ${a.parts.length}`
        : "",
      x + w - 14,
      y + Math.max(14, 25 * view.scale),
    );
    ctx.restore();
  }
  $("#zoom-value").value =
    document.activeElement === $("#zoom-value")
      ? $("#zoom-value").value
      : `${Math.round(view.scale * 100)}%`;
  $("output").value = `${Math.round(view.scale * 100)}%`;
  window.__sdg.ready =
    !!manifest && manifest.renderTheme === effectiveTheme && ready === count;
  window.__sdg.revision = manifest?.revision;
  window.__sdg.visibleReady = ready;
  window.__sdg.visibleCount = count;
  drawMap();
  if (cache.size > 100)
    for (const e of [...cache.values()].sort((a, b) => a.used - b.used)) {
      if (cache.size <= 80) break;
      if (!displayed.some((a) => a.path === e.asset.path && visible(a)))
        cache.delete(e.key);
    }
}
function drawMap() {
  const map = $("#minimap");
  if (map.hidden) return;
  map.width = 220 * dpr;
  map.height = 140 * dpr;
  const c = map.getContext("2d"),
    s = Math.min(200 / world.width, 120 / world.height);
  c.scale(dpr, dpr);
  c.fillStyle = palette.surface;
  c.fillRect(0, 0, 220, 140);
  c.fillStyle = palette.raised;
  for (const g of groups)
    c.fillRect(10 + g.x * s, 10 + g.y * s, g.width * s, g.height * s);
  c.strokeStyle = palette.accent;
  c.strokeRect(
    10 - (view.x / view.scale) * s,
    10 - (view.y / view.scale) * s,
    (width / view.scale) * s,
    (height / view.scale) * s,
  );
}
function applyTheme() {
  window.__sdg.ready = false;
  effectiveTheme =
    theme === "system" ? (media.matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = effectiveTheme;
  const css = getComputedStyle(document.documentElement);
  palette = Object.fromEntries(
    ["canvas", "surface", "raised", "text", "muted", "accent", "border"].map(
      (k) => [k, css.getPropertyValue("--" + k).trim()],
    ),
  );
  palette.raised = css.getPropertyValue("--surface-sunken").trim();
  palette.muted = css.getPropertyValue("--text-secondary").trim();
  for (const b of $("#themes").children)
    b.setAttribute("aria-pressed", String(b.dataset.theme === theme));
  requestDraw();
}
for (const b of $("#themes").children)
  b.onclick = () => {
    theme = b.dataset.theme;
    applyTheme();
    void refresh(true);
    save();
  };
media.addEventListener("change", () => {
  applyTheme();
  void refresh(true);
});
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
    const a = (inspection ? [inspection] : assets).find(
      (a) => x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height,
    );
    if (a) {
      selected = a.path;
      selectedId = a.id;
      active = a.group;
      selection();
      if (y < a.y + 40 && x > a.x + a.width - 180 && a.compact) {
        inspector = true;
        selection();
        $("#forms").focus();
      } else if (y < a.y + 40 && x > a.x + a.width - 44) focusAsset(a);
    }
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
  else if (e.key === "0") fit();
  else if (e.key === "Escape") return;
  else if (e.key === "Enter") focusAsset(currentItem());
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
viewport.addEventListener("dblclick", () => {
  const a = currentItem();
  if (a) focusAsset(a);
});
$("#fit").onclick = fit;
for (const [id, action] of Object.entries({
  "zoom-fit-all": fit,
  "zoom-fit-group": () => frame(active === null ? world : groups[active]),
  "zoom-fit-selection": () =>
    frame(currentItem() || (active === null ? world : groups[active])),
  "zoom-actual": () => zoom(1),
}))
  $("#" + id).onclick = () => {
    $("#zoom-menu").hidePopover();
    action();
  };
$("#all").onclick = fit;
$("#back").onclick = back;
$("#sidebar-toggle").onclick = () => toggleSidebar();
$("#directory").onclick = () => showOpen();
$("#inspect").onclick = () => {
  inspector = !inspector;
  selection();
  save();
};
$("#close-inspector").onclick = () => {
  inspector = false;
  selection();
  save();
};
$("#forms").onchange = () => {
  const a = currentItem(),
    id = $("#forms").value;
  inspectForm(
    a,
    id === "full"
      ? { ...a.full, id: "full", name: "Full sheet" }
      : a.parts.find((p) => p.id === id),
  );
};
$("#full-sheet").onclick = () => {
  const a = currentItem();
  inspectForm(a, { ...a.full, id: "full", name: "Full sheet" });
};
$("#copy-path").onclick = () =>
  navigator.clipboard
    .writeText(manifest.directory + "/" + selected)
    .catch((e) => error(e.message));
$("#fullscreen").onclick = () => {
  const p = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  p.catch((e) => error(e.message));
};
$("#fit-current").onclick = () =>
  frame(currentItem() || (active !== null ? groups[active] : world));
$("#zoom-value").onchange = () => {
  const n = parseFloat($("#zoom-value").value);
  if (Number.isFinite(n) && n > 0) zoom(n / 100);
  else $("#zoom-value").value = `${Math.round(view.scale * 100)}%`;
};
$("#zoom-value").onkeydown = (e) => {
  if (e.key === "Enter") {
    e.target.blur();
    viewport.focus();
  }
};
$("#background").onchange = requestDraw;
$("#map-toggle").onclick = () => {
  $("#minimap").hidden = !$("#minimap").hidden;
  requestDraw();
};
$("#minimap").onclick = (e) => {
  const s = Math.min(200 / world.width, 120 / world.height),
    r = e.target.getBoundingClientRect();
  remember();
  inspection = null;
  selected = null;
  selectedId = null;
  active = null;
  selection();
  commit({
    ...view,
    x: width / 2 - ((e.clientX - r.left - 10) / s) * view.scale,
    y: height / 2 - ((e.clientY - r.top - 10) / s) * view.scale,
  });
};
$("#shortcuts").onclick = () => {
  $("#more-menu").hidePopover();
  $("#keys").showModal();
};
$("#arrange").onclick = () => {
  const old = assets,
    oldGroups = groups;
  layout(manifest);
  if (active !== null) {
    const g = groups[active],
      prev = oldGroups[active],
      dx = prev.x - g.x,
      dy = prev.y - g.y;
    for (const a of assets) {
      if (a.group === active) {
        a.x += dx;
        a.y += dy;
      } else {
        const before = old.find((b) => b.id === a.id);
        if (before)
          Object.assign(a, {
            x: before.x,
            y: before.y,
            width: before.width,
            height: before.height,
          });
      }
    }
    groups = groups.map((g, i) =>
      i === active ? { ...g, x: prev.x, y: prev.y } : oldGroups[i],
    );
  }
  world.width = Math.max(1, ...groups.map((g) => g.x + g.width));
  world.height = Math.max(1, ...groups.map((g) => g.y + g.height));
  $("#more-menu").hidePopover();
  selection();
};
$("#search").onfocus = () => {
  if (!searchReturn)
    searchReturn = {
      view: { ...view },
      sidebar,
      active,
      selected,
      selectedId,
      inspection,
      inspector,
    };
};
$("#search").oninput = renderNav;
$("#search").onkeydown = (e) => {
  if (e.key === "Enter")
    ($("#modules .form-result") || $("#modules .file"))?.click();
};
$("#minus").onclick = () => zoom(view.scale / 1.25);
$("#plus").onclick = () => zoom(view.scale * 1.25);
$("#actual").onclick = () => zoom(1);
$("#reveal").onclick = () =>
  api("/reveal", { path: selected }).catch((e) => error(e.message));
function resizeViewport() {
  window.__sdg.ready = false;
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
}
new ResizeObserver(resizeViewport).observe(viewport);
function recent() {
  $("#recent").replaceChildren(
    ...(manifest?.recent ?? []).map((p) => {
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
    await api("/preferences", { directory: manifest?.directory, view, theme });
    const data = await api("/open", { directory });
    await applyManifest(data);
    $("#directories").close();
    viewport.focus();
  } catch (e) {
    $("#open-error").textContent = e.message;
    $("#open-error").hidden = false;
  } finally {
    button.disabled = false;
  }
}
async function applyManifest(data, force = false) {
  const changedRoot = manifest?.directory !== data.directory,
    first = !manifest;
  if (!force && !changedRoot && !first && manifest.revision === data.revision)
    return;
  if (first) {
    theme = data.theme;
    applyTheme();
    toggleSidebar(data.sidebar);
    inspector = data.inspector;
  }
  window.__sdg.ready = false;
  const versionTheme = effectiveTheme;
  let next = 0;
  const results = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < data.assets.length) {
        const i = next++,
          a = data.assets[i],
          key = `${data.directory}|${a.path}|${a.version}|${versionTheme}`;
        let entry = prepared.get(key);
        if (!entry) {
          entry = await prepare(a, versionTheme);
          prepared.set(key, entry);
        }
        results[i] = entry;
      }
    }),
  );
  if (versionTheme !== effectiveTheme) {
    pending = true;
    return;
  }
  for (const key of prepared.keys())
    if (
      !data.assets.some((a) =>
        key.startsWith(`${data.directory}|${a.path}|${a.version}|`),
      )
    )
      prepared.delete(key);
  const previous = manifest;
  manifest = { ...data, assets: results, renderTheme: versionTheme };
  if (changedRoot) {
    cache.clear();
    queued = [];
    selected = null;
    selectedId = null;
    inspection = null;
    active = null;
    history = [];
    expanded.clear();
  }
  layout(
    manifest,
    !!previous &&
      !changedRoot &&
      JSON.stringify(previous.groups) === JSON.stringify(data.groups),
  );
  $("#directory").textContent = data.label;
  $("#directory").title = data.directory || "";
  document.title = `${data.label} — SVG Design Gallery`;
  if (changedRoot || first) {
    if (data.view) view = data.view;
    else frame(world);
  }
  if (selected && !assets.some((a) => a.path === selected)) {
    selected = null;
    selectedId = null;
    inspection = null;
  } else if (inspection) {
    const a = assets.find((a) => a.path === selected),
      p =
        inspection.shown[0].id === "full"
          ? { ...a.full, id: "full", name: "Full sheet" }
          : a.parts.find((p) => p.id === inspection.shown[0].id);
    if (p)
      inspection = {
        ...inspection,
        ...a,
        x: 0,
        y: 0,
        width: p.width + 40,
        height: p.height + 52,
        chrome: false,
        compact: false,
        shown: [p],
        rows: [[p]],
      };
    else inspection = null;
  }
  selection();
  requestDraw();
}
let fetching = false,
  pending = false;
async function refresh(force = false) {
  if (fetching) {
    pending = true;
    return;
  }
  fetching = true;
  try {
    await applyManifest(await api("/manifest"), force);
    error("");
  } catch (e) {
    error(e.message);
  } finally {
    fetching = false;
    if (pending) {
      pending = false;
      void refresh(true);
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

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    if (!searchReturn)
      searchReturn = {
        view: { ...view },
        sidebar,
        active,
        selected,
        selectedId,
        inspection,
        inspector,
      };
    toggleSidebar(true);
    $("#search").focus();
    return;
  }
  if (e.key !== "Escape" || $("#directories").open || $("#keys").open) return;
  if (document.querySelector(":popover-open")) return;
  if (searchReturn) {
    const old = searchReturn;
    searchReturn = null;
    $("#search").value = "";
    toggleSidebar(old.sidebar);
    ({ active, selected, selectedId, inspection, inspector } = old);
    selection();
    commit(old.view);
  } else if (inspector && selected) {
    inspector = false;
    selection();
    save();
  } else back();
  viewport.focus({ preventScroll: true });
});

import { Labels } from "./labels.js";
import { fitArea, fitView } from "./layout.js";
import { icon, hydrateIcons } from "./icons.js";
hydrateIcons();
import { prepare, imageURL, arrange, groupAssets } from "./assets.js";
// ARC's gallery layout and camera model, decoupled from its React runtime.
const $ = (selector) => document.querySelector(selector);
const viewport = $(".gallery-viewport"),
  canvas = $("#drawings"),
  ctx = canvas.getContext("2d"),
  background = $("#canvas-background"),
  backgroundContext = background.getContext("2d", { alpha: false });
let manifest,
  catalog = null,
  pendingNavigation = null,
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
const labelLayer = new Labels($("#labels"), copyError => {
  if (copyError) error(`Cannot copy name: ${copyError.message}`);
  else if ($('#error').textContent.startsWith('Cannot copy name:')) error('');
});
document.fonts.ready.then(() => {labelLayer.metrics.clear();requestDraw()});
let labelsDirty = true, labelObstacles = null;
let drawingDirty = true, drawingView = null, drawingMargin = 0, drawingReady = 0, drawingCount = 0;
const zoomValue = $("#zoom-value"), zoomOutput = $("output");
const cache = new Map(),
  pointers = new Map();
let gesture = {};
let sidebar = true,
  inspector = false,
  selectedId = null,
  selectedForm = null,
  inspection = null;
let backgroundChoice = "theme", backgroundColors = {};
let history = [],
  searchReturn = null;
const expanded = new Set(),
  prepared = new Map();
const fixtureName = new URL(location.href).searchParams.get("fixture");
let fixtureState = null, fixtureApplied = false;
const currentItem = () => inspection || assets.find((a) => a.id === selectedId);
function remember() {
  history.push({
    view: { ...view },
    active,
    selected,
    selectedId,
    selectedForm,
    inspection,
    inspector,
  });
  if (history.length > 40) history.shift();
}
function back() {
  const old = history.pop();
  if (old) {
    ({ active, selected, selectedId, selectedForm, inspection, inspector } = old);
    selection();
    commit(old.view);
  }
}
function toggleSidebar(value = !sidebar) {
  sidebar = value;
  updateChrome();
  requestDraw();
  save();
}
function updateChrome() {
  const opened = !!(catalog ?? manifest)?.directory;
  $("#sidebar").hidden = !opened || !sidebar;
  $("#app-bar").hidden = opened && sidebar;
  $("#app-directory").hidden = !opened;
  $("#app-bar .separator").hidden = !opened;
  $("#tools").hidden = !opened;
  $(".zoom").hidden = !opened;
  $("#source").hidden = !opened || !inspector || !selected;
  if (!opened) $("#minimap").hidden = true;
  $("#sidebar-toggle").setAttribute('aria-expanded', String(sidebar));
  $("#expand-sidebar").setAttribute('aria-expanded', String(sidebar));
  $("#close").hidden = !opened;
  const right = width - (inspector && selected ? 312 : 0);
  $(".zoom").style.left = `${((sidebar && opened ? 272 : 0) + right) / 2}px`;
  positionZoomMenu();
}
function positionZoomMenu() {
  const r = $("#zoom-options").getBoundingClientRect();
  $("#zoom-menu").style.left = `${r.x + r.width / 2}px`;
  $("#zoom-menu").style.bottom = `${height - $(".zoom").getBoundingClientRect().top + 8}px`;
}

const media = matchMedia("(prefers-color-scheme: dark)");
const modifiedDate = new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
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
  if(fixtureState && message) document.documentElement.dataset.fixtureError=message;
  $("#error").textContent = message;
  $("#error").hidden = !message;
}
async function api(url, data, keepalive = false) {
  if(fixtureName && ["/manifest","/open"].includes(url)) url += `?fixture=${encodeURIComponent(fixtureName)}`;
  const response = await fetch(
    url,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          keepalive,
        }
      : {},
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
function preferences() {
  return {
    directory: manifest?.directory,
    view,
    selection: {
      path: selected,
      form: currentItem()?.parts.find(p => p.id === selectedForm)?.name ?? null,
      group: groups[active]?.title ?? null,
    },
    theme, sidebar, inspector,
  };
}
function persistPreferences(keepalive = false) {
  clearTimeout(saveTimer);
  if (fixtureState || catalog || !manifest?.directory) return;
  return api('/preferences', preferences(), keepalive).catch(e => error(e.message));
}
function save() {
  if(fixtureState || catalog || !manifest?.directory) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistPreferences, 220);
}
window.addEventListener('pagehide', () => void persistPreferences(true));
document.addEventListener('visibilitychange', () => {if (document.hidden) void persistPreferences(true)});
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
      JSON.stringify(a.shown.map(p => [p.width, p.height]));
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
      a.x = old?.x ?? group.x + 64;
      a.y =
        Math.max(
          group.y + 104,
          ...occupied
            .filter((p) => previousGroups[p.group]?.title === group.title)
            .map((p) => p.y + p.height),
        ) + 112;
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
        a.y = collision.y + collision.height + 112;
      const index = occupied.findIndex((p) => p.id === a.id);
      if (index >= 0) occupied[index] = a;
      else occupied.push(a);
    }
    for (const g of groups) {
      const list = assets.filter((a) => groups[a.group] === g);
      g.width = Math.max(g.width, ...list.map((a) => a.x + a.width - g.x + 64));
      g.height = Math.max(
        g.height,
        ...list.map((a) => a.y + a.height - g.y + 64),
      );
    }
    world.width = Math.max(1, ...groups.map((g) => g.x + g.width));
    world.height = Math.max(1, ...groups.map((g) => g.y + g.height));
  }
  renderNav();
  $("#asset-access").replaceChildren(
    ...assets.map((a) => {
      const b = document.createElement("button");
      b.textContent = `View ${a.name}${a.kind === "flow" ? " / " + a.shown[0].name : ""}`;
      b.onclick = () => focusAsset(a);
      return b;
    }),
  );
  $("#empty").hidden = !!assets.length || !data.directory;
}
function makeRow(name, label, count, className = 'tree-row') {
  const button = document.createElement('button'); button.className = className;
  button.innerHTML = icon(name, 14);
  const text = document.createElement('span'); text.textContent = label; button.append(text);
  if (count !== undefined) { const detail = document.createElement('span'); detail.className='count'; detail.textContent=count; button.append(detail); }
  return button;
}
function searchResults(query) {
  const entries = (catalog ?? manifest).assets;
  const files = entries.filter(a => a.name.toLowerCase().includes(query)).map(a => ({ a }));
  const forms = entries.flatMap(a => a.name.toLowerCase().includes(query) ? [] : (a.parts ?? []).filter(p => p.name.toLowerCase().includes(query)).map(p => ({ a, p })));
  return [...files, ...forms];
}
function navigate(action) {
  if (catalog) pendingNavigation = action;
  else action();
}
function renderNav() {
  const data = catalog ?? manifest;
  if (!data) return;
  const focusKey = document.activeElement?.dataset.navkey;
  const query = $("#search").value.trim().toLowerCase(), nodes = [];
  $(".gallery").classList.toggle('searching', !!query);
  $("#search-clear").hidden = !query; $("#search-key").hidden = !!query;
  if (query) {
    const results = searchResults(query), heading = document.createElement('h3');
    heading.className='search-count'; heading.textContent=`${results.length} ${results.length === 1 ? 'result' : 'results'}`; nodes.push(heading);
    for (const { a, p } of results) {
      const component = a.component ?? a.path.startsWith('components/');
      const button=makeRow(component?'component':'app-window',p ? `${a.name} · ${p.name}` : a.name,p ? 'form' : a.parts ? `${a.parts.length} ${component?'forms':'frames'}` : undefined,'tree-row search-result');
      button.dataset.navkey=`search:${a.path}:${p?.id ?? ''}`;
      button.setAttribute('aria-current',String(selected===a.path && (!p || selectedForm===p.id)));
      button.onclick=()=>navigate(()=>p ? inspectForm(a,p) : focusAsset(assets.find(item=>item.path===a.path))); nodes.push(button);
    }
  } else {
    const all=makeRow('layout-grid','All designs',data.assets.length); all.id='all'; all.onclick=()=>navigate(fit); nodes.push(all);
    const rule=document.createElement('div');rule.className='rule';nodes.push(rule);
    (catalog ? groupAssets(catalog) : groups).forEach((g,i)=>{
      const section=document.createElement('section'), row=document.createElement('div'), toggle=document.createElement('button'), button=document.createElement('button');
      row.className='group-row'; toggle.innerHTML=icon(expanded.has(i)?'chevron-down':'chevron-right',12);
      toggle.setAttribute('aria-label',`Toggle ${g.title}`);toggle.setAttribute('aria-expanded',String(expanded.has(i)));toggle.dataset.navkey=`toggle:${g.title}`;
      toggle.onclick=()=>{expanded.has(i)?expanded.delete(i):expanded.add(i);renderNav()};
      button.className='group-name';button.dataset.navkey=`group:${g.title}`;
      const title=document.createElement('span'), count=document.createElement('span'); title.textContent=g.title;count.textContent=g.assets.length;count.className='count';button.append(title,count);
      button.onclick=()=>navigate(()=>{remember();inspection=null;active=i;selected=null;selectedId=null;selectedForm=null;expanded.add(i);selection();frame(groups[i])});
      row.append(toggle,button);section.append(row);
      if(expanded.has(i)) { const files=document.createElement('div');files.className='group-files';
        for(const a of g.assets) {const item=makeRow((a.component ?? a.path.startsWith('components/'))?'component':'app-window',a.name,undefined,'tree-row file');item.dataset.navkey=`file:${a.path}`;item.setAttribute('aria-current',String(selected===a.path));item.onclick=()=>navigate(()=>focusAsset(assets.find(x=>x.path===a.path)));files.append(item)}
        section.append(files);
      }
      nodes.push(section);
    });
  }
  $("#modules").replaceChildren(...nodes);
  if(focusKey) $("#modules").querySelector(`[data-navkey="${CSS.escape(focusKey)}"]`)?.focus({preventScroll:true});
  requestDraw();
}
function selection() {
  renderNav(); updateChrome();
  $("#back").disabled=!history.length;
  $("#inspect").setAttribute('aria-pressed',String(inspector));
  const a=currentItem();
  if(a) {
    $("#source-name").textContent=a.name;$("#source-path").textContent=a.path;
    $("#forms-heading").textContent=a.component?'Forms':'Frames';
    $("#forms").replaceChildren(...a.parts.map(p=>{
      const button=makeRow(a.component?'component':'app-window',p.name,`${Math.round(p.width)} × ${Math.round(p.height)}`);
      button.setAttribute('aria-current',String(!inspection && (a.component ? (selectedForm??a.parts[0]?.id)===p.id : a.shown[0].id===p.id)));
      button.onclick=()=>inspectForm(a,p);
      if (p.note) { const row=document.createElement('div');row.append(button);const note=document.createElement('p');note.textContent=p.note;note.style.cssText='margin:4px 8px 8px;color:var(--text-secondary)';row.append(note);return row; }
      return button;
    }));
  }
  requestDraw();
  save();
}

function cameraArea() { return fitArea(width, height, sidebar, inspector && !!selected); }
function frame(box, padding = 0) {
  const target=box===world?'all':groups.includes(box)?'group':'selection';
  for(const name of ['all','group','selection']) $("#zoom-fit-"+name).setAttribute('aria-current',String(name===target));
  commit(fitView(box, cameraArea(), padding));
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
  selectedForm = a.parts[0]?.id ?? null;
  expanded.add(active);
  selection();
  frame(a, 24);
}
function inspectForm(a, p) {
  if (!a || !p) return;
  remember();
  const item=assets.find(item=>item.path===a.path && (a.component || item.shown[0].id===p.id)) ?? assets.find(item=>item.path===a.path);
  selected=a.path;selectedId=item.id;selectedForm=p.id;active=item.group;expanded.add(active);inspector=true;
  if(p.id==='full') {
    inspection={...item,id:item.id+'@full',x:0,y:0,width:p.width,height:p.height,shown:[p],kind:'sheet'};
    selection();frame(inspection,24);
  } else {
    inspection=null;selection();
    if(a.component) {const crop=item.shown[0];frame({x:item.x+p.x-crop.x,y:item.y+p.y-crop.y,width:p.width,height:p.height},24)}
    else frame(item,24);
  }
  save();
}

function zoom(scale, x = cameraArea().x + cameraArea().width / 2, y = cameraArea().y + cameraArea().height / 2) {
  const next = clamp(scale);
  commit({
    scale: next,
    x: x - ((x - view.x) * next) / view.scale,
    y: y - ((y - view.y) * next) / view.scale,
  });
}
function commit(next) {
  window.__sdg.ready = false;
  labelsDirty ||= view.scale !== next.scale;
  view = next;
  moving = true;
  requestDraw(false, false);
  save();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    moving = false;
    requestDraw();
  }, 150);
}
function requestDraw(labelsChanged = true, drawingChanged = true) {
  drawingDirty ||= drawingChanged;
  if (labelsChanged) { labelsDirty = true; labelObstacles = null; }
  if (!raf) raf = requestAnimationFrame(draw);
}
function visible(a, margin = 0) {
  return (
    view.x + (a.x + a.width) * view.scale > -margin &&
    view.x + a.x * view.scale < width + margin &&
    view.y + (a.y + a.height) * view.scale > -margin &&
    view.y + a.y * view.scale < height + margin
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
      requestDraw(false);
      pump();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      e.state = "error";
      loading--;
      error(`Cannot render ${e.asset.path}`);
      requestDraw(false);
      pump();
    };
    img.src = url;
  }
}
function thumbnail(e, upgrade = false) {
  const scale = Math.min(2, view.scale) * dpr;
  if (e.bitmap && (!upgrade || e.bitmapScale >= scale)) return e.bitmap;
  const limit = Math.min(scale, 4096 / Math.max(e.part.width, e.part.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(e.part.width * limit));
  c.height = Math.max(1, Math.ceil(e.part.height * limit));
  const preview = c.getContext('2d', { alpha: false });
  preview.fillStyle = e.asset.background || palette.canvas;
  preview.fillRect(0, 0, c.width, c.height);
  preview.drawImage(e.image, 0, 0, c.width, c.height);
  e.bitmap = c;
  e.bitmapScale = limit;
  return c;
}
function placements(a) { return a.shown.map(part => ({ part, x: a.x, y: a.y })); }
// Rasterize the screen-space dots once instead of submitting thousands of arcs per frame.
let backgroundKey;
function drawBackground() {
  const color = backgroundColor(), key = `${width}|${height}|${dpr}|${color}|${palette.dot}`;
  if (key !== backgroundKey) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = Math.round(20 * dpr);
    const c = tile.getContext('2d');
    c.scale(dpr, dpr);
    c.fillStyle = color; c.fillRect(0, 0, 20, 20);
    c.fillStyle = palette.dot; c.beginPath(); c.arc(1, 1, 1, 0, Math.PI * 2); c.fill();
    const pattern = backgroundContext.createPattern(tile, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(1 / dpr));
    background.width = Math.round(width * dpr); background.height = Math.round(height * dpr);
    backgroundContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    backgroundContext.fillStyle = pattern;
    backgroundContext.fillRect(0, 0, width, height);
    backgroundKey = key;
  }
}
function draw() {
  raf = 0;
  drawBackground();
  if (!labelObstacles) readChromeBounds();
  const displayed = manifest?.renderTheme === effectiveTheme ? inspection ? [inspection] : assets : [];
  // Keep a margin around a settled drawing. Pans can move that
  // retained Canvas layer without replaying or resampling the entire scene.
  const dx = view.x - (drawingView?.x ?? 0), dy = view.y - (drawingView?.y ?? 0);
  const reuse = !drawingDirty && drawingView?.scale === view.scale &&
    Math.abs(dx) <= drawingMargin && Math.abs(dy) <= drawingMargin;
  if (!reuse) {
    const zooming = moving && drawingView?.scale !== view.scale;
    drawingMargin = zooming ? 0 : Math.ceil(Math.min(width, height) / 4);
    const bufferWidth = Math.round((width + drawingMargin * 2) * dpr), bufferHeight = Math.round((height + drawingMargin * 2) * dpr);
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth; canvas.height = bufferHeight;
      canvas.style.width = `${width + drawingMargin * 2}px`; canvas.style.height = `${height + drawingMargin * 2}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width + drawingMargin * 2, height + drawingMargin * 2);
    ctx.save(); ctx.translate(view.x + drawingMargin, view.y + drawingMargin); ctx.scale(view.scale, view.scale);
    if (!inspection) for (const g of groups) {
      if (!visible(g, drawingMargin)) continue;
      rounded(g.x, g.y, g.width, g.height, 16 / view.scale, palette['surface-section']);
      ctx.strokeStyle = palette.border; ctx.lineWidth = 1 / view.scale; ctx.stroke();
    }
    let ready = 0, count = 0;
    for (const a of displayed) {
      if (!visible(a, drawingMargin)) continue;
      const parts = placements(a).map(pos => ({ ...pos, image: ensureImage(a, pos.part) }));
      const raster = moving || view.scale < .8;
      ctx.beginPath(); ctx.roundRect(a.x, a.y, a.width, a.height, Math.min(6 / view.scale, a.width / 2, a.height / 2));
      // Cached previews already contain the asset background; avoid painting it twice.
      if (!raster || parts.some(pos => pos.image.state !== 'ready')) {
        ctx.fillStyle = a.background || palette.canvas; ctx.fill();
      }
      ctx.save(); ctx.clip();
      const inViewport = visible(a);
      for (const pos of parts) {
        if (inViewport) count++;
        const e = pos.image;
        if (e.state !== 'ready') continue;
        if (inViewport) ready++;
        const source = moving ? thumbnail(e) : view.scale < .8 ? thumbnail(e, true) : e.image;
        if (moving) {
          const left = Math.max(pos.x, (-view.x - drawingMargin) / view.scale);
          const top = Math.max(pos.y, (-view.y - drawingMargin) / view.scale);
          const right = Math.min(pos.x + pos.part.width, (width + drawingMargin - view.x) / view.scale);
          const bottom = Math.min(pos.y + pos.part.height, (height + drawingMargin - view.y) / view.scale);
          const sx = source.width / pos.part.width, sy = source.height / pos.part.height;
          ctx.drawImage(source, (left-pos.x)*sx, (top-pos.y)*sy, (right-left)*sx, (bottom-top)*sy, left, top, right-left, bottom-top);
        } else ctx.drawImage(source, pos.x, pos.y, pos.part.width, pos.part.height);
      }
      ctx.restore();
      const chosen = inspection ? true : selectedId === a.id;
      ctx.strokeStyle = chosen ? palette.accent : palette.border;
      ctx.lineWidth = (chosen ? 2 : 1) / view.scale; ctx.stroke();
    }
    ctx.restore();
    drawingReady = ready; drawingCount = count;
    drawingView = { ...view }; drawingDirty = false;
  }
  canvas.style.transform = `translate(${view.x - drawingView.x - drawingMargin}px,${view.y - drawingView.y - drawingMargin}px)`;
  drawLabels(displayed);
  const percentage = `${Math.round(view.scale * 100)}%`;
  if (zoomValue.textContent !== percentage) zoomValue.textContent = percentage;
  if (zoomOutput.value !== percentage) zoomOutput.value = percentage;
  window.__sdg.ready = !!manifest && manifest.renderTheme === effectiveTheme && drawingReady === drawingCount && !moving;
  if(fixtureState && fixtureApplied && window.__sdg.ready) document.documentElement.dataset.fixtureReady=fixtureState.name;
  window.__sdg.revision = manifest?.revision;
  window.__sdg.visibleReady = drawingReady; window.__sdg.visibleCount = drawingCount;
  drawMap();
  if (cache.size > 100) for (const e of [...cache.values()].sort((a,b) => a.used - b.used)) {
    if (cache.size <= 80) break;
    if (!displayed.some(a => a.path === e.asset.path && visible(a, drawingMargin))) cache.delete(e.key);
  }
}
function backgroundColor() { return backgroundChoice === 'theme' ? palette.canvas : backgroundColors[backgroundChoice]; }

function readChromeBounds() {
  const vr = viewport.getBoundingClientRect();
  labelObstacles = [];
  for (const el of document.querySelectorAll('.floating, :popover-open, dialog[open], #tooltip:not([hidden])')) {
    if (el.hidden) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const r = el.getBoundingClientRect(), box = { x:r.x-vr.x, y:r.y-vr.y, width:r.width, height:r.height };
    labelObstacles.push(box);
  }
}
function drawLabels(displayed) {
  if (!labelsDirty && labelLayer.pan(view)) return;
  const candidates = [], screen = box => ({ x: view.x + box.x * view.scale, y: view.y + box.y * view.scale });
  const caption = Number.parseFloat(palette['text-caption']), meta = Number.parseFloat(palette['text-meta']), section = Number.parseFloat(palette['text-section']);
  const part = (text, size, weight, color, gap = 0) => ({ text, size, weight, color, gap });
  const title = (...args) => ({...part(...args),copyText:args[0]});
  const modified = a => a.modified ? [{...part(a.modified.text,meta,400,palette['text-tertiary'],10),...a.modified,optional:true}] : [];
  const heading = (x, y, right) => {
    const half = meta * .6;
    let left = Math.max(8, x), edge = Math.min(width - 8, right);
    const center = Math.max(8 + half, y);
    for (const obstacle of labelObstacles) {
      if (center + half <= obstacle.y || center - half >= obstacle.y + obstacle.height) continue;
      if (obstacle.x + obstacle.width <= left || obstacle.x >= edge) continue;
      if (obstacle.x - 12 - left >= edge - obstacle.x - obstacle.width - 12) edge = obstacle.x - 12;
      else left = obstacle.x + obstacle.width + 12;
    }
    return {x:left,y:center,slot:Math.max(0,edge-left),pinned:left !== x || center !== y};
  };
  if (!inspection) for (const g of groups) {
    if (!visible(g)) continue;
    const p = screen(g);
    candidates.push({ id: `section:${g.title}`, x: p.x, y: p.y - 16, slot: g.width * view.scale, parts: [title(g.title, section, 650, palette.text), {...part(`${g.assets.length} assets`, meta, 400, palette['text-tertiary'], 8),optional:true}] });
  }
  if (view.scale >= .2) {
    const flows = new Set();
    const labeled = selectedId ? [...displayed].sort((a,b) => Number(b.id === selectedId) - Number(a.id === selectedId)) : displayed;
    for (const a of labeled) {
      if (!visible(a)) continue;
      const p = screen(a), chosen = selectedId === a.id;
      if (a.kind === 'set' || inspection) {
        candidates.push({ id: `set:${a.id}`, ...heading(p.x,p.y-12,p.x+(a.width+64)*view.scale-10),
          parts:[title(inspection ? a.shown[0].name : a.name,meta,550,chosen ? palette.text : palette['text-secondary']), ...(!inspection ? [{ ...part(`${a.parts.length} ${a.parts.length === 1 ? 'form' : 'forms'}`,meta,400,palette['text-tertiary'],6), optional: true },...modified(a)] : [])] });
        if (!inspection && view.scale >= .75 && a.parts.length > 1) {
          const crop = a.shown[0];
          candidates.push(...a.parts.map(form => ({ id:`form:${a.id}:${form.id}`,x:p.x+(form.x-crop.x)*view.scale,y:p.y+(form.y-crop.y)*view.scale-9.5,slot:Infinity,height:13,paddingRight:6,within:{x:p.x,y:p.y,width:a.width*view.scale,height:a.height*view.scale},
            parts:[title(form.name,caption,400,palette['text-tertiary'])] })));
        }
      } else {
        if (!flows.has(a.path)) {
          flows.add(a.path);
          const family = displayed.filter(item => item.path === a.path), first = family[0];
          const origin = screen(first), right = Math.max(...family.map(item => item.x+item.width));
          candidates.push({ id:`flow:${a.path}`,...heading(origin.x,origin.y-34,origin.x+(right-first.x)*view.scale),parts:[title(a.name,meta,600,palette['text-secondary']),{...part(`${a.parts.length} ${a.parts.length === 1 ? 'frame' : 'frames'}`,meta,400,palette['text-tertiary'],6),optional:true},...modified(a)] });
        }
        candidates.push({ id:`frame:${a.id}`,x:p.x,y:p.y-12,slot:(a.width+64)*view.scale,parts:[title(a.shown[0].name,caption,chosen?550:400,chosen?palette.text:palette['text-tertiary'])] });
      }
    }
  }
  labelLayer.update(candidates,labelObstacles,width,height,palette['font-ui'],view);
  labelsDirty = false;
}
function mapGeometry() {
  const scale=Math.min(168/world.width,100/world.height);
  return {scale,x:(200-world.width*scale)/2,y:(132-world.height*scale)/2};
}
function drawMap() {
  const map=$("#minimap");if(map.hidden)return;
  if(map.width!==200*dpr||map.height!==132*dpr){map.width=200*dpr;map.height=132*dpr}
  const c=map.getContext('2d'),{scale:s,x,y}=mapGeometry();c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,200,132);
  for(const g of groups){c.fillStyle=palette['surface-section'];c.strokeStyle=palette.border;c.beginPath();c.roundRect(x+g.x*s,y+g.y*s,g.width*s,g.height*s,4);c.fill();c.stroke()}
  c.strokeStyle=palette.accent;c.lineWidth=1;
  const area=cameraArea();
  c.strokeRect(x+(area.x-view.x)/view.scale*s,y+(area.y-view.y)/view.scale*s,area.width/view.scale*s,area.height/view.scale*s);
}

function applyTheme() {
  window.__sdg.ready = false;
  effectiveTheme =
    theme === "system" ? (media.matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = effectiveTheme;
  const css = getComputedStyle(document.documentElement);
  palette = Object.fromEntries(
    ["canvas", "surface", "surface-section", "surface-sunken", "text", "text-secondary", "text-tertiary", "accent", "border", "dot", "font-ui", "text-caption", "text-meta", "text-section"].map(
      (k) => [k, css.getPropertyValue("--" + k).trim()],
    ),
  );
  palette.raised = css.getPropertyValue("--surface-sunken").trim();
  palette.muted = css.getPropertyValue("--text-secondary").trim();
  for (const sheet of document.styleSheets) for(const rule of sheet.cssRules ?? []) {
    if(rule.selectorText === ':root' && rule.style.getPropertyValue('--canvas')) backgroundColors.light=rule.style.getPropertyValue('--canvas').trim();
    if(rule.selectorText === ':root[data-theme="dark"]' && rule.style.getPropertyValue('--canvas')) backgroundColors.dark=rule.style.getPropertyValue('--canvas').trim();
  }
  backgroundColors.neutral=`color-mix(in srgb, ${backgroundColors.light} 50%, ${backgroundColors.dark})`;
  updateChoices();
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
      selectedForm = a.component ? a.parts[0]?.id ?? null : a.shown[0].id;
      selection();

    }
  }
  if (viewport.hasPointerCapture(e.pointerId))
    viewport.releasePointerCapture(e.pointerId);
  if (!pointers.size && gesture.moved) requestDraw();
}
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  viewport.addEventListener(event, up);
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.matches("input,textarea,[contenteditable]") || document.querySelector("dialog[open], :popover-open")) return;
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
for (const [id, action] of Object.entries({
  "zoom-fit-all": fit,
  "zoom-fit-group": () => frame(active === null ? world : groups[active]),
  "zoom-fit-selection": () =>
    frame(currentItem() || (active === null ? world : groups[active]), currentItem() ? 24 : 0),
  "zoom-actual": () => zoom(1),
}))
  $("#" + id).onclick = () => {
    $("#zoom-menu").hidePopover();
    action();
  };
$("#back").onclick = back;
$("#sidebar-toggle").onclick = () => toggleSidebar(false);
$("#expand-sidebar").onclick = () => toggleSidebar(true);
$("#app-directory").onclick = () => showOpen();
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
  frame(currentItem() || (active !== null ? groups[active] : world), currentItem() ? 24 : 0);
$("#map-toggle").onclick = () => {
  $("#minimap").hidden = !$("#minimap").hidden;
  $("#map-toggle").setAttribute("aria-pressed", String(!$("#minimap").hidden));
  requestDraw();
};
$("#minimap").onclick = e => {
  const {scale:s,x,y}=mapGeometry(),r=e.target.getBoundingClientRect(),area=cameraArea();
  remember();inspection=null;selection();
  commit({...view,x:area.x+area.width/2-(e.clientX-r.left-x)/s*view.scale,y:area.y+area.height/2-(e.clientY-r.top-y)/s*view.scale});
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
$("#search").oninput = () => { if(!$("#search").value) searchReturn=null; renderNav(); };
$("#search-clear").onclick=()=>{$("#search").value="";searchReturn=null;renderNav();$("#search").focus()};
$("#search").onkeydown = (e) => {
  if (e.key === "Enter")
    $("#modules .search-result")?.click();
};
$("#minus").onclick = () => zoom(view.scale / 1.25);
$("#plus").onclick = () => zoom(view.scale * 1.25);
$("#reveal").onclick = () =>
  api("/reveal", { path: selected }).catch((e) => error(e.message));
function resizeViewport() {
  window.__sdg.ready = false;
  const oldW = width,
    oldH = height;
  width = viewport.clientWidth;
  height = viewport.clientHeight;
  dpr = devicePixelRatio;

  if (oldW)
    view = {
      ...view,
      x: view.x + (width - oldW) / 2,
      y: view.y + (height - oldH) / 2,
    };
  updateChrome();
  requestDraw();
}
new ResizeObserver(resizeViewport).observe(viewport);
function recent() {
  const paths=(catalog ?? manifest)?.recent??[];
  $("#recent-heading").hidden=!paths.length;
  $("#recent").replaceChildren(...paths.map((path,index)=>{
    const button=document.createElement('button');button.type='button';button.innerHTML=icon('folder',16);
    const text=document.createElement('span');text.className='recent-text';
    const name=document.createElement('strong'),detail=document.createElement('small');
    const pieces=path.split('/').filter(Boolean);name.textContent=pieces.at(-1)==='design'?pieces.at(-2):pieces.at(-1);
    detail.textContent=path.replace(/^\/Users\/[^/]+/,'~').replace(/^\/home\/[^/]+/,'~');text.append(name,detail);button.append(text);
    button.setAttribute('aria-current',String(index===0&&!$("#path").value));
    button.onclick=()=>{$("#path").value=path;for(const row of $("#recent").children)row.setAttribute('aria-current',String(row===button));$("#path").focus()};
    button.ondblclick=()=>open(path);return button;
  }));
}
function showOpen() {
  $("#path").value='';$("#path").removeAttribute('aria-invalid');$("#open-error").hidden=true;
  recent();updateChrome();hideTooltip();$("#directories").showModal();$("#path").blur();requestDraw();
}

$("#close").onclick = () => $("#directories").close();
$("#path").oninput=()=>{$("#path").removeAttribute("aria-invalid");$("#open-error").hidden=true};
$("#directory-form").onsubmit = (e) => {
  e.preventDefault();
  void open($("#path").value);
};
async function open(directory) {
  if (catalog) {
    pendingNavigation = () => void open(directory);
    return;
  }
  const button = $("#directory-form button[type=submit]");
  button.disabled = true;
  try {
    await persistPreferences();
    const data = await api("/open", { directory });
    await applyManifest(data);
    $("#directories").close();
    viewport.focus();
  } catch (e) {
    $("#open-error span:last-child").textContent = e.message;
    $("#path").setAttribute("aria-invalid","true");
    $("#open-error").hidden = false;
  } finally {
    button.disabled = false;
  }
}
async function applyManifest(data, force = false) {
  const changedRoot = manifest?.directory !== data.directory,
    first = !manifest && !catalog;
  if (!force && !changedRoot && !first && manifest.revision === data.revision)
    return;
  if (changedRoot && catalog?.directory !== data.directory) expanded.clear();
  if (first || changedRoot) catalog = data;
  if (first) {
    fixtureState=data.fixture ?? null;
    theme = data.theme;
    applyTheme();
    toggleSidebar(data.sidebar);
    inspector = data.inspector;
  }
  if (first || changedRoot) {
    for(const element of document.querySelectorAll('.directory-name')) element.textContent=data.label;
    $("#directory").title=data.directory||'';$("#app-directory").title=data.directory||'';
    document.title = `${data.label} — SVG Design Gallery`;
    updateChrome();
    renderNav();
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
          if (Number.isFinite(a.modifiedAt)) {
            const date = new Date(a.modifiedAt);
            entry.modified = {text:modifiedDate.format(date),timestamp:date.toISOString(),title:date.toLocaleString(undefined,{dateStyle:'full',timeStyle:'long'})};
          }
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
  catalog = null;
  if (changedRoot) {
    cache.clear();
    labelLayer.clear();
    queued = [];
    selected = null;
    selectedId = null;
    inspection = null;
    active = null;
    history = [];
  }
  layout(
    manifest,
    !!previous &&
      !changedRoot &&
      JSON.stringify(previous.groups) === JSON.stringify(data.groups),
  );
  for(const element of document.querySelectorAll('.directory-name')) element.textContent=data.label;
  $("#directory").title=data.directory||'';$("#app-directory").title=data.directory||'';
  document.title = `${data.label} — SVG Design Gallery`;
  if (changedRoot || first) {
    if (data.view) view = data.view;
    else frame(world);
    const restored = data.selection;
    if (!fixtureState && restored) {
      const source = manifest.assets.find(a => a.path === restored.path);
      const form = source?.parts.find(p => p.name === restored.form);
      const item = assets.find(a => a.path === restored.path && (a.component || !form || a.shown[0].id === form.id));
      if (item) {
        selected = item.path;
        selectedId = item.id;
        selectedForm = form?.id ?? item.parts[0]?.id ?? null;
        active = item.group;
        expanded.add(active);
      } else {
        active = groups.findIndex(g => g.title === restored.group);
        if (active < 0) active = null;
        else expanded.add(active);
      }
    }
  }
  if (selected && !assets.some((a) => a.path === selected)) {
    selected = null;
    selectedId = null;
    inspection = null;
  } else if (inspection) {
    const a=assets.find(a=>a.path===selected),p={...a.full,id:'full',name:'Full sheet'};
    inspection={...a,id:a.id+'@full',x:0,y:0,width:p.width,height:p.height,shown:[p],kind:'sheet'};
  }
  selection();
  if (pendingNavigation) {
    const action = pendingNavigation;
    pendingNavigation = null;
    action();
  }
  requestDraw();
}
function updateChoices() {
  for(const button of document.querySelectorAll('#themes button, #backgrounds button')) {
    const selected=button.dataset.theme ? button.dataset.theme===theme : button.dataset.background===backgroundChoice;
    button.setAttribute('aria-pressed',String(selected));button.querySelector('svg')?.remove();
    if(selected) button.insertAdjacentHTML('afterbegin',icon('check',14));
  }
}
for(const button of $("#backgrounds").children) button.onclick=()=>{backgroundChoice=button.dataset.background;updateChoices();requestDraw()};
for(const [id,trigger] of [['display-menu','display'],['zoom-menu','zoom-options'],['more-menu','more']]) {
  $("#"+id).addEventListener('toggle',event=>{
    $("#"+trigger).setAttribute('aria-pressed',String(event.newState==='open'));
    if(event.newState==='open') {
      for(const other of document.querySelectorAll(':popover-open')) if(other.id!==id) other.hidePopover();
      hideTooltip();positionZoomMenu();
    }
    requestDraw();
  });
}
let tooltipTimer;
function hideTooltip() { clearTimeout(tooltipTimer);if (!$("#tooltip").hidden) { $("#tooltip").hidden=true;requestDraw(); } }
for(const button of document.querySelectorAll('[data-tooltip]')) {
  const show=()=>{clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>{
    if(document.querySelector(':popover-open, dialog[open]'))return;
    const tip=$("#tooltip"),r=button.getBoundingClientRect();tip.textContent=button.dataset.tooltip;tip.hidden=false;
    tip.style.left=`${Math.max(4,Math.min(width-tip.offsetWidth-4,r.x+r.width/2-tip.offsetWidth/2))}px`;
    tip.style.top=`${r.y>height/2?r.top-tip.offsetHeight-12:r.bottom+12}px`;requestDraw();
  },400)};
  button.addEventListener('pointerenter',show);button.addEventListener('focus',show);
  button.addEventListener('pointerleave',()=>{hideTooltip();requestDraw()});button.addEventListener('blur',hideTooltip);button.addEventListener('click',hideTooltip);
}
$("#keys-close").onclick=()=>$("#keys").close();
$("#directories").addEventListener('cancel',event=>{if(!(catalog ?? manifest)?.directory)event.preventDefault()});
for(const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('toggle', () => requestDraw());
  dialog.addEventListener('close',()=>{viewport.focus({preventScroll:true});requestDraw()});
}
document.addEventListener('keydown',event=>{
  if(event.key==='?'&&!event.target.matches('input,textarea')&&!document.querySelector('dialog[open]')) {event.preventDefault();hideTooltip();$("#keys").showModal()}
});
async function applyFixture() {
  const state=fixtureState;if(!state)return;
  fixtureApplied=false;delete document.documentElement.dataset.fixtureReady;
  sidebar=state.sidebar;inspector=!!state.inspector;history=[];inspection=null;selected=null;selectedId=null;selectedForm=null;expanded.clear();
  active=state.group ? groups.findIndex(g=>g.title===state.group) : null;
  if(active===-1) throw new Error(`Fixture group not found: ${state.group}`);
  if(active!==null) expanded.add(active);
  if(state.asset) {
    const source=manifest.assets.find(a=>a.path===state.asset),form=state.form?source?.parts.find(p=>p.name===state.form):null;
    const item=assets.find(a=>a.path===state.asset && (!form || a.component || a.shown[0].id===form.id));
    if(!item)throw new Error(`Fixture asset/form not found: ${state.asset} ${state.form??''}`);
    selected=item.path;selectedId=item.id;selectedForm=form?.id??item.parts[0]?.id;
  }
  $("#search").value=state.query??'';$("#minimap").hidden=!state.minimap;$("#map-toggle").setAttribute('aria-pressed',String(!!state.minimap));
  selection();
  if(state.camera==='origin') commit({scale:state.scale,x:state.origin[0]-groups[active].x*state.scale,y:state.origin[1]-groups[active].y*state.scale});
  else if(state.camera==='group') frame(groups[active]);
  else if(state.camera==='selection') frame(currentItem(),24);
  else frame(world);
  if(state.scale && state.camera!=='origin') zoom(state.scale);
  // Fixtures retain a useful Back button just as a user navigating from the overview would.
  if(state.asset){history=[{view:fitView(world,fitArea(width,height,state.sidebar,false)),active:null,selected:null,selectedId:null,selectedForm:null,inspection:null,inspector:false}];$("#back").disabled=false}
  if(state.menu){positionZoomMenu();$("#"+state.menu).showPopover()}
  if(state.dialog==='directories') showOpen();
  else if(state.dialog) $("#"+state.dialog).showModal();
  if(state.submit){$("#path").value=state.submit;await open(state.submit)}
  fixtureApplied=true;requestDraw();
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
if(fixtureState) { try { await applyFixture(); } catch(e) { error(e.message); } }
else if (!manifest?.directory) showOpen();
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
    ({ active, selected, selectedId, selectedForm, inspection, inspector } = old);
    selection();
    commit(old.view);
  } else if (inspector && selected) {
    inspector = false;
    selection();
    save();
  } else back();
  viewport.focus({ preventScroll: true });
});

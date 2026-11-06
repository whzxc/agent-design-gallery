import { Labels } from "./labels.js";
import { fitArea, fitView } from "./layout.js";
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
const labelLayer = new Labels($("#labels"));
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
  const opened = !!manifest?.directory;
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
  $("#empty").hidden = !!assets.length;
}
function makeRow(name, label, count, className = 'tree-row') {
  const button = document.createElement('button'); button.className = className;
  button.innerHTML = icon(name, 14);
  const text = document.createElement('span'); text.textContent = label; button.append(text);
  if (count !== undefined) { const detail = document.createElement('span'); detail.className='count'; detail.textContent=count; button.append(detail); }
  return button;
}
function searchResults(query) {
  const files = manifest.assets.filter(a => a.name.toLowerCase().includes(query)).map(a => ({ a }));
  const forms = manifest.assets.flatMap(a => a.name.toLowerCase().includes(query) ? [] : a.parts.filter(p => p.name.toLowerCase().includes(query)).map(p => ({ a, p })));
  return [...files, ...forms];
}
function renderNav() {
  if (!manifest) return;
  const focusKey = document.activeElement?.dataset.navkey;
  const query = $("#search").value.trim().toLowerCase(), nodes = [];
  $(".gallery").classList.toggle('searching', !!query);
  $("#search-clear").hidden = !query; $("#search-key").hidden = !!query;
  if (query) {
    const results = searchResults(query), heading = document.createElement('h3');
    heading.className='search-count'; heading.textContent=`${results.length} ${results.length === 1 ? 'result' : 'results'}`; nodes.push(heading);
    for (const { a, p } of results) {
      const button=makeRow(a.component?'component':'app-window',p ? `${a.name} · ${p.name}` : a.name,p ? 'form' : `${a.parts.length} ${a.component?'forms':'frames'}`,'tree-row search-result');
      button.dataset.navkey=`search:${a.path}:${p?.id ?? ''}`;
      button.setAttribute('aria-current',String(selected===a.path && (!p || selectedForm===p.id)));
      button.onclick=()=>p ? inspectForm(a,p) : focusAsset(assets.find(item=>item.path===a.path)); nodes.push(button);
    }
  } else {
    const all=makeRow('layout-grid','All designs',manifest.assets.length); all.id='all'; all.onclick=fit; nodes.push(all);
    const rule=document.createElement('div');rule.className='rule';nodes.push(rule);
    groups.forEach((g,i)=>{
      const section=document.createElement('section'), row=document.createElement('div'), toggle=document.createElement('button'), button=document.createElement('button');
      row.className='group-row'; toggle.innerHTML=icon(expanded.has(i)?'chevron-down':'chevron-right',12);
      toggle.setAttribute('aria-label',`Toggle ${g.title}`);toggle.setAttribute('aria-expanded',String(expanded.has(i)));toggle.dataset.navkey=`toggle:${g.title}`;
      toggle.onclick=()=>{expanded.has(i)?expanded.delete(i):expanded.add(i);renderNav()};
      button.className='group-name';button.dataset.navkey=`group:${g.title}`;
      const title=document.createElement('span'), count=document.createElement('span'); title.textContent=g.title;count.textContent=g.assets.length;count.className='count';button.append(title,count);
      button.onclick=()=>{remember();inspection=null;active=i;selected=null;selectedId=null;selectedForm=null;expanded.add(i);selection();frame(g)};
      row.append(toggle,button);section.append(row);
      if(expanded.has(i)) { const files=document.createElement('div');files.className='group-files';
        for(const a of g.assets) {const item=makeRow(a.component?'component':'app-window',a.name,undefined,'tree-row file');item.dataset.navkey=`file:${a.path}`;item.setAttribute('aria-current',String(selected===a.path));item.onclick=()=>focusAsset(assets.find(x=>x.path===a.path));files.append(item)}
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
    $("#dimensions").textContent=`${Math.round(a.full.width)} × ${Math.round(a.full.height)}`;
    $("#forms-heading").textContent=a.component?'Forms':'Frames';
    $("#forms").replaceChildren(...a.parts.map(p=>{
      const button=makeRow(a.component?'component':'app-window',p.name,`${Math.round(p.width)} × ${Math.round(p.height)}`);
      button.setAttribute('aria-current',String(!inspection && (a.component ? (selectedForm??a.parts[0]?.id)===p.id : a.shown[0].id===p.id)));
      button.onclick=()=>inspectForm(a,p);return button;
    }));
    $("#full-sheet").setAttribute('aria-current',String(!!inspection));
  }
  requestDraw();
}

function cameraArea() { return fitArea(width, height, sidebar, inspector && !!selected); }
function frame(box, padding = 0) { commit(fitView(box, cameraArea(), padding)); }
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
function placements(a) { return a.shown.map(part => ({ part, x: a.x, y: a.y })); }
function draw() {
  raf = 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = backgroundColor();
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.dot;
  ctx.beginPath();
  for (let x = 1; x < width; x += 20) for (let y = 1; y < height; y += 20) { ctx.moveTo(x + 1, y); ctx.arc(x, y, 1, 0, Math.PI * 2); }
  ctx.fill();
  const displayed = manifest?.renderTheme === effectiveTheme ? inspection ? [inspection] : assets : [];
  ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);
  if (!inspection) for (const g of groups) {
    if (!visible(g)) continue;
    rounded(g.x, g.y, g.width, g.height, 16 / view.scale, palette['surface-section']);
    ctx.strokeStyle = palette.border; ctx.lineWidth = 1 / view.scale; ctx.stroke();
  }
  let ready = 0, count = 0;
  for (const a of displayed) {
    if (!visible(a)) continue;
    rounded(a.x, a.y, a.width, a.height, Math.min(6 / view.scale, a.width / 2, a.height / 2), a.background || palette.canvas);
    ctx.save(); ctx.clip();
    for (const pos of placements(a)) {
      count++;
      const e = ensureImage(a, pos.part);
      if (e.state !== 'ready') continue;
      ready++;
      const source = moving ? thumbnail(e) : view.scale < .8 ? thumbnail(e, true) : e.image;
      ctx.drawImage(source, pos.x, pos.y, pos.part.width, pos.part.height);
    }
    ctx.restore();
    ctx.beginPath(); ctx.roundRect(a.x, a.y, a.width, a.height, Math.min(6 / view.scale, a.width / 2, a.height / 2));
    const chosen = inspection ? true : selectedId === a.id;
    ctx.strokeStyle = chosen ? palette.accent : palette.border;
    ctx.lineWidth = (chosen ? 2 : 1) / view.scale; ctx.stroke();
  }
  ctx.restore();
  drawLabels(displayed);
  if (document.activeElement !== $("#zoom-value")) $("#zoom-value").textContent = `${Math.round(view.scale * 100)}%`;
  $("output").value = `${Math.round(view.scale * 100)}%`;
  window.__sdg.ready = !!manifest && manifest.renderTheme === effectiveTheme && ready === count && !moving;
  window.__sdg.revision = manifest?.revision;
  window.__sdg.visibleReady = ready; window.__sdg.visibleCount = count;
  drawMap();
  if (cache.size > 100) for (const e of [...cache.values()].sort((a,b) => a.used - b.used)) {
    if (cache.size <= 80) break;
    if (!displayed.some(a => a.path === e.asset.path && visible(a))) cache.delete(e.key);
  }
}
function backgroundColor() { return backgroundChoice === 'theme' ? palette.canvas : backgroundColors[backgroundChoice]; }

function drawLabels(displayed) {
  const candidates = [], screen = box => ({ x: view.x + box.x * view.scale, y: view.y + box.y * view.scale });
  const caption = Number.parseFloat(palette['text-caption']), meta = Number.parseFloat(palette['text-meta']), section = Number.parseFloat(palette['text-section']);
  const part = (text, size, weight, color, gap = 0) => ({ text, size, weight, color, gap });
  if (!inspection) for (const g of groups) {
    if (!visible(g)) continue;
    const p = screen(g);
    candidates.push({ id: `section:${g.title}`, x: p.x, y: p.y - 16, slot: g.width * view.scale, parts: [part(g.title, section, 650, palette.text), part(`${g.assets.length} assets`, meta, 400, palette['text-tertiary'], 8)] });
  }
  if (view.scale >= .2) {
    const flows = new Set();
    for (const a of displayed) {
      if (!visible(a)) continue;
      const p = screen(a), chosen = selectedId === a.id;
      if (a.kind === 'set' || inspection) {
        candidates.push({ id: `set:${a.id}`, x:p.x,y:p.y-12,slot:(a.width+64)*view.scale,
          parts:[part(inspection ? a.shown[0].name : a.name,meta,550,chosen ? palette.text : palette['text-secondary']), ...(!inspection ? [part(`${a.parts.length} ${a.parts.length === 1 ? 'form' : 'forms'}`,meta,400,palette['text-tertiary'],6)] : [])] });
        if (!inspection && view.scale >= .75 && a.parts.length > 1) {
          const crop = a.shown[0];
          candidates.push(a.parts.map(form => ({ id:`form:${a.id}:${form.id}`,x:p.x+(form.x-crop.x)*view.scale,y:p.y+(form.y-crop.y)*view.scale-16,slot:form.width*view.scale,
            parts:[part(form.name,caption,400,palette['text-tertiary'])] })));
        }
      } else {
        if (!flows.has(a.path)) {
          flows.add(a.path);
          const family = displayed.filter(item => item.path === a.path), first = family[0];
          const origin = screen(first), right = Math.max(...family.map(item => item.x+item.width));
          candidates.push({ id:`flow:${a.path}`,x:origin.x,y:origin.y-34,slot:(right-first.x)*view.scale,parts:[part(a.name,meta,600,palette['text-secondary']),part(`${a.parts.length} ${a.parts.length === 1 ? 'frame' : 'frames'}`,meta,400,palette['text-tertiary'],6)] });
        }
        candidates.push({ id:`frame:${a.id}`,x:p.x,y:p.y-12,slot:(a.width+64)*view.scale,parts:[part(a.shown[0].name,caption,chosen?550:400,chosen?palette.text:palette['text-tertiary'])] });
      }
    }
  }
  const vr = viewport.getBoundingClientRect();
  const obstacles = [...document.querySelectorAll('.floating, :popover-open, dialog[open], #tooltip:not([hidden])')].filter(el => !el.hidden && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none').map(el => { const r=el.getBoundingClientRect();return {x:r.x-vr.x,y:r.y-vr.y,width:r.width,height:r.height}; });
  labelLayer.update(candidates,obstacles,width,height,palette['font-ui']);
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
      selection();

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
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
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
  const paths=manifest?.recent??[];
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
  const button = $("#directory-form button[type=submit]");
  button.disabled = true;
  try {
    await api("/preferences", { directory: manifest?.directory, view, theme });
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
    labelLayer.clear();
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
  for(const element of document.querySelectorAll('.directory-name')) element.textContent=data.label;
  $("#directory").title=data.directory||'';$("#app-directory").title=data.directory||'';
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
    const a=assets.find(a=>a.path===selected),p={...a.full,id:'full',name:'Full sheet'};
    inspection={...a,id:a.id+'@full',x:0,y:0,width:p.width,height:p.height,shown:[p],kind:'sheet'};
  }
  selection();
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
function hideTooltip() { clearTimeout(tooltipTimer);$("#tooltip").hidden=true; }
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
$("#directories").addEventListener('cancel',event=>{if(!manifest?.directory)event.preventDefault()});
for(const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close',()=>{viewport.focus({preventScroll:true});requestDraw()});
document.addEventListener('keydown',event=>{
  if(event.key==='?'&&!event.target.matches('input,textarea')&&!document.querySelector('dialog[open]')) {event.preventDefault();hideTooltip();$("#keys").showModal()}
});
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

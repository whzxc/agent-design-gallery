import { initSwitcher, updateSwitcherLabels } from './switcher.js';
import { dataFetch, keyURL, isUnauthorized } from './auth.js';
import { Labels } from "./labels.js";
import { fitArea, fitView, packingSnapshot, restorePacking } from "./layout.js";
import { icon, hydrateIcons } from "./icons.js";
hydrateIcons();
import { prepare, imageURL, arrange, groupAssets, evictPreviews, metadataContext, measuredMetadata, previewAddress, compactPreparedSource, scopeKind, scopeTarget } from "./assets.js";
import { sourceRelationships, relatedSources } from './relationships.js';
import { hitSelection, frameBox, exportFrames } from './selection.js';
import { groupTokens, renderTokenTable } from './token-catalog.js';
import { readViewRoute, viewURL } from './view-route.js';
// ARC's gallery layout and camera model, decoupled from its React runtime.
const $ = (selector) => document.querySelector(selector);
const viewport = $(".gallery-viewport"),
  canvas = $("#drawings"),
  ctx = canvas.getContext("2d"),
  background = $("#canvas-background"),
  backgroundContext = background.getContext("2d", { alpha: false });
let manifest,
  catalog = null,
  tokenManifest = null,
  tokenCategory = null,
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
}, target => {
  const a=assets.find(a=>a.path===target.path && (target.form===undefined || a.component || a.shown[0].id===target.form));
  if (target.form !== undefined) selectFrame(a,a?.parts.find(p=>p.id===target.form));
  else selectSource(a);
});
document.fonts.ready.then(() => {labelLayer.metrics.clear();requestDraw()});
let labelsDirty = true, labelObstacles = null;
let drawingDirty = true, drawingView = null, drawingMargin = 0, drawingReady = 0, drawingCount = 0;
const zoomValue = $("#zoom-value"), zoomOutput = $("output");
const cache = new Map(),
  pointers = new Map();
let gesture = {};
let sidebar = false,
  inspector = false,
  selectedId = null,
  selectedForm = null,
  selectedElement = null,
  hoveredElement = null,
  inspection = null;
let backgroundChoice = "theme", backgroundColors = {};
let history = [],
  searchReturn = null;
const expanded = new Set(),
  prepared = new Map(), metadataCache = new Map(), preparingSources = new Map();
let initializedDirectory, uploadActive = 0, cacheWrites = 0, cacheFailures = 0;
const uploadQueue=[], uploadPromises=new Set();
function cacheWrite(url,data,raw=false) {
  cacheWrites++;
  const promise=new Promise(resolve=>uploadQueue.push({url,data,raw,resolve}));
  uploadPromises.add(promise);promise.finally(()=>uploadPromises.delete(promise));
  pumpUploads();return promise;
}
function pumpUploads() {
  while(uploadActive<3&&uploadQueue.length) {
    const task=uploadQueue.shift();uploadActive++;
    dataFetch(task.url,{method:'POST',headers:{'Content-Type':task.raw?'image/svg+xml':'application/json'},body:task.raw?task.data:JSON.stringify(task.data)})
      .then(response=>{if(response.status===409)return false;if(!response.ok)throw Error(`Derived cache HTTP ${response.status}`);return true})
      .catch(()=>{cacheFailures++;return false})
      .then(result=>{uploadActive--;cacheWrites--;task.resolve(result);pumpUploads()});
  }
}
async function flushCache() {
  while(cacheWrites||loading||queued.length) {
    await Promise.all([...uploadPromises]);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
const sourceKey=(asset,theme,directory=manifest?.directory??catalog?.directory)=>`${directory}|${asset.path}|${asset.hash??asset.version}|${theme}${asset.onlyFrame ? `|frame:${asset.onlyFrame}` : ''}`;
function keepSource(key,entry) {
  entry=compactPreparedSource(entry);
  prepared.delete(key);prepared.set(key,entry);
  let bytes=[...prepared.values()].reduce((n,a)=>n+(a.source?.length??0)*2,0);
  for(const [old,value] of prepared) {
    if(bytes<=64*1024*1024)break;
    bytes-=(value.source?.length??0)*2;prepared.delete(old);
  }
}
function decorateMetadata(asset,metadata) {
  const entry={...asset,...metadata};
  if(Number.isFinite(asset.modifiedAt)) {
    const date=new Date(asset.modifiedAt);
    entry.modified={text:modifiedDate.format(date),timestamp:date.toISOString(),title:date.toLocaleString(undefined,{dateStyle:'full',timeStyle:'long'})};
  }
  return entry;
}
function persistSource(entry,theme) {
  if(!entry.hash || entry.onlyFrame)return Promise.resolve(false);
  const query=new URLSearchParams({theme,context:metadataContext()});
  const promise=cacheWrite(`metadata/${entry.hash}?${query}`,{metadata:measuredMetadata(entry)});
  entry.cacheWrite=promise;
  return promise;
}
async function sourceFor(asset,theme) {
  const key=sourceKey(asset,theme),cached=prepared.get(key);
  if(cached?.source)return cached;
  if(preparingSources.has(key))return preparingSources.get(key);
  const pending=(async()=>{
    const entry=await prepare(asset,theme);
    persistSource(entry,theme);
    keepSource(sourceKey(entry,theme),entry);return entry;
  })();
  preparingSources.set(key,pending);
  try{return await pending}finally{preparingSources.delete(key)}
}

const fixtureName = new URL(location.href).searchParams.get("fixture");
let fixtureState = null, fixtureApplied = false;
let route = {}, routeError;
try { route = readViewRoute(new URL(location.href)); }
catch (error) { routeError = error; }
let initialLink = route.target, strictRoute = route.strict, queryView = !!route.isolated;
let scopeRequest = fixtureName ? 'all' : route.scope ?? 'default', onlyFrame = route.onlyFrame ?? null;
let initializedScope, initializedFrame, scopeEntry;
const currentItem = () => inspection || assets.find((a) => a.id === selectedId);
function remember() {
  history.push({
    view: { ...view },
    scope: initializedScope,
    onlyFrame,
    queryView,
    target: selectionTarget(),
    active,
    selected,
    selectedId,
    selectedForm,
    selectedElement,
    inspection,
    inspector,
  });
  if (history.length > 40) history.shift();
}
function back() {
  if (catalog) return;
  const old = history.pop();
  if (!old && onlyFrame) {
    changeScope(initializedScope, null, false);
    return;
  }
  if (old) {
    if (old.scope && (old.scope !== initializedScope || (old.onlyFrame ?? null) !== onlyFrame)) {
      changeScope(old.scope, old, false);
      return;
    }
    ({ active, selected, selectedId, selectedForm, selectedElement = null, inspection } = old);
    selection();
    commit(old.view);
  }
}
function changeScope(next, entry = null, record = true) {
  const nextFrame = entry?.onlyFrame ?? null;
  if (next === scopeRequest && nextFrame === onlyFrame) return;
  if ((initializedScope || tokenManifest) && !catalog) {
    if (record && !tokenManifest && next !== 'tokens') remember();
    void persistPreferences();
  }
  scopeRequest = next;
  onlyFrame = nextFrame;
  queryView = entry?.queryView ?? !['all', 'layer'].includes(scopeKind(next));
  strictRoute = false;
  scopeEntry = entry;
  initialLink = null;
  pendingNavigation = null;
  if (searchReturn) sidebar = searchReturn.sidebar;
  searchReturn = null;
  $("#search").value = '';
  void refresh(true);
}
function toggleSidebar(value = !sidebar) {
  sidebar = value;
  updateChrome();
  requestDraw(true, false);
}
function updateChrome() {
  updateSwitcherLabels();
  const opened = !!(tokenManifest ?? catalog ?? manifest)?.directory;
  const showTokens = !!tokenManifest;
  const canInspect = opened && !showTokens && !!selected;
  $('.gallery').classList.toggle('tokens-mode', showTokens);
  $('#token-catalog').hidden = !showTokens;
  viewport.inert = showTokens;
  $('#sidebar').hidden = !opened || !sidebar;
  $('#app-bar').hidden = !opened;
  if (fixtureState) $('#app-directory .switcher-chevron').hidden = false;
  $('#tools').hidden = !opened;
  $('.zoom').hidden = !opened || showTokens;
  $('#source').hidden = !canInspect || !inspector;
  $('#inspect').disabled = !canInspect;
  $('#inspect').setAttribute('aria-expanded', String(canInspect && inspector));
  $('#arrange').hidden = showTokens;
  if (!opened) $('#minimap').hidden = true;
  $('#sidebar-toggle').setAttribute('aria-expanded', String(opened && sidebar));
  positionZoomMenu();
}
function positionZoomMenu() {
  const r = $("#zoom-options").getBoundingClientRect();
  $("#zoom-menu").style.left = `${r.x + r.width / 2}px`;
  $("#zoom-menu").style.bottom = `${height - $(".zoom").getBoundingClientRect().top + 8}px`;
}

const media = matchMedia("(prefers-color-scheme: dark)");
const modifiedDate = new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
window.__adg = {
  ready: false,
  get metadataComplete() {return !!tokenManifest || (!!manifest && !manifest.loading);},
  get scope() {return tokenManifest?.scope ?? initializedScope;},
  get cachePending() {return cacheWrites+loading+queued.length;},
  get cacheFlush() {return flushCache();},
  get cacheFailures() {return cacheFailures;},
  get view() {
    return { ...view };
  },
  get assets() {
    return tokenManifest ? 0 : assets.length;
  },
  get previews() {
    return {entries: cache.size, decoded: [...cache.values()].filter(e => e.image).length,
      rasterBytes: [...cache.values()].reduce((n, e) => n + (e.bitmap ? e.bitmap.width * e.bitmap.height * 4 : 0), 0)};
  },
  get selection() {return {path:selected, frame:currentItem()?.parts.find(p=>p.id===selectedForm)?.name ?? null, element:selectedElement?.owner ?? null}},
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
  if (isUnauthorized()) return;
  if(fixtureState && message) document.documentElement.dataset.fixtureError=message;
  $("#error").textContent = message;
  $("#error").hidden = !message;
}
async function api(url, data, keepalive = false, signal) {
  if(fixtureName && url.startsWith("manifest")) url += `${url.includes("?")?"&":"?"}fixture=${encodeURIComponent(fixtureName)}`;
  const response = await dataFetch(
    url,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          keepalive,
        }
      : { signal },
  );
  const result = await response.json();
  if (signal && response.status === 409) throw new DOMException(result.error,'AbortError');
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
function preferences() {
  if (tokenManifest || onlyFrame) return { theme };
  return {
    view,
    scope: initializedScope,
    selection: selectionTarget(),
    theme,
  };
}
function selectionTarget() {
  return {
    path: selected,
    form: currentItem()?.parts.find(p => p.id === selectedForm)?.name ?? null,
    element: selectedElement ? {id:selectedElement.id, owner:selectedElement.owner} : null,
    group: groups[active]?.title ?? null,
  };
}
function syncSelectionURL() {
  if (fixtureState || catalog || !manifest?.directory) return;
  const target = selectionTarget();
  if (!['layer', 'all'].includes(scopeKind(initializedScope))) target.group = null;
  if (onlyFrame) target.path = scopeTarget(initializedScope);
  const url = viewURL(location.href, initializedScope, target, { isolated: queryView, onlyFrame });
  if (url.href !== location.href) window.history.replaceState(window.history.state, '', url);
}
function restoreSelection(target) {
  if (!target) return;
  const source = manifest.assets.find(a => a.path === target.path);
  const form = source?.parts.find(p => p.name === target.form);
  const item = assets.find(a => a.path === target.path && (a.component || !form || a.shown[0].id === form.id));
  if (item) {
    selected = item.path;
    selectedId = item.id;
    selectedForm = form?.id ?? null;
    const element = target.element && form?.elements?.find(e => e.id === target.element.id);
    const owner = target.element?.owner;
    if (element && (!owner || element.owners.some(o => o.source === owner.source && o.export === owner.export)))
      selectedElement = {...element, owner:owner ?? element.owners.at(-1)};
    active = item.group;
  } else {
    const group = groups.findIndex(g => g.title === target.group);
    active = group >= 0 ? group : null;
  }
  if (active !== null) expanded.add(active);
}
function persistPreferences(keepalive = false) {
  clearTimeout(saveTimer);
  if (fixtureState || catalog || !(tokenManifest ?? manifest)?.directory) return;
  return api('preferences', preferences(), keepalive).catch(e => error(e.message));
}
function save() {
  if(fixtureState || catalog || !(tokenManifest ?? manifest)?.directory) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistPreferences, 220);
}
window.addEventListener('pagehide', () => void persistPreferences(true));
document.addEventListener('visibilitychange', () => {if (document.hidden) void persistPreferences(true)});
function layout(data, preserve = false) {
  const previous = assets,
    previousGroups = groups,
    result = arrange(onlyFrame ? { ...data, assets: data.assets.map(asset => ({ ...asset, component: false, parts: asset.parts.filter(part => part.name === onlyFrame) })) } : data);
  groups = result.groups;
  assets = result.items;
  world = result.world;
  if (preserve) {
    const previousById = new Map(previous.map(item => [item.id, item]));
    const currentIds = new Set(assets.map(item => item.id));
    const previousByTitle = new Map();
    for (const group of previousGroups) if (!previousByTitle.has(group.title)) previousByTitle.set(group.title, group);
    for (const group of groups) {
      const old = previousByTitle.get(group.title);
      if (old) {
        group.x = old.x;
        group.y = old.y;
      }
    }
    const occupied = previous.filter((p) => currentIds.has(p.id));
    const shape = (a) =>
      JSON.stringify(a.shown.map(p => [p.width, p.height]));
    for (const a of assets) {
      const old = previousById.get(a.id);
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
  if (!assets.length) $("#empty").textContent = scopedUI(data) ? 'No assets in this scope.' : 'No SVG files in this directory.';
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
function scopedUI(data) { return !!data.layers && (!data.fixture || !!data.fixture.scope); }
function scopeLabel(scope) {
  const target = scopeTarget(scope);
  if (scope === 'all') return 'All designs';
  if (scope === 'tokens') return 'Tokens';
  if (scopeKind(scope) === 'layer') return target[0].toUpperCase() + target.slice(1);
  if (scopeKind(scope) === 'asset') return target.split('/').at(-1).replace(/\.(tsx|svg)$/i,'');
  return target;
}
function renderScopeTabs(data) {
  const tabs = $('#scope-tabs');
  const choices = [...(data.tokenSource ? ['tokens'] : []), ...(data.layers ?? []).map(layer => 'layer:' + layer), 'all'];
  const signature = JSON.stringify([data.scope, choices]);
  $('#sidebar').classList.toggle('scoped', scopedUI(data));
  if (tabs.dataset.signature === signature) return;
  tabs.dataset.signature = signature;
  const focused = tabs.contains(document.activeElement) ? document.activeElement.dataset.scope : null;
  const selected = choices.includes(data.scope) ? data.scope : null;
  tabs.replaceChildren(...choices.map((choice, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(choice === selected));
    tab.tabIndex = (selected ? choice === selected : index === 0) ? 0 : -1;
    tab.dataset.scope = choice;
    tab.textContent = scopeLabel(choice);
    tab.onclick = () => changeScope(choice);
    return tab;
  }));
  if (focused) [...tabs.children].find(tab => tab.dataset.scope === focused)?.focus({ preventScroll: true });
  const active = tabs.querySelector('[aria-selected="true"]');
  active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
$('#scope-tabs').addEventListener('keydown', event => {
  const tabs = [...event.currentTarget.children], index = tabs.indexOf(event.target);
  if (index < 0) return;
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
    : step ? tabs[(index + step + tabs.length) % tabs.length] : null;
  if (!target) return;
  event.preventDefault();
  target.focus();
  target.click();
});
function scopeAction(kind, key, label) {
  const action = document.createElement('button');
  action.type = 'button';action.className='icon-button scope-only';action.innerHTML=icon('square-dashed');
  action.dataset.navkey=`only:${kind}:${key}`;
  const text = `Render only this ${kind}`;
  action.setAttribute('aria-label',`${text}: ${label}`);
  action.dataset.tooltip = text;
  bindTooltip(action,true);
  action.onclick = () => changeScope(`${kind}:${key}`);
  return action;
}
function navFile(a, options = {}) {
  const { indent=false, isolate=false } = options;
  const item=makeRow((a.component ?? a.path.startsWith('components/'))?'component':'app-window',a.name,undefined,'tree-row file');
  item.dataset.navkey=`file:${a.path}`;
  item.setAttribute('aria-current',String(selected===a.path));
  item.onclick=()=>navigate(()=>focusAsset(assets.find(x=>x.path===a.path)));
  if (!isolate) return item;
  const row=document.createElement('div');row.className='scope-row';
  if (indent) row.classList.add('scope-row-indent');
  row.append(item,scopeAction('asset',a.path,a.name));
  return row;
}
function renderNav() {
  const data = tokenManifest ?? catalog ?? manifest;
  if (!data) return;
  renderScopeTabs(data);
  const scoped = scopedUI(data), kind = scoped ? scopeKind(data.scope) : null;
  const focusKey = document.activeElement?.dataset.navkey;
  const query = $("#search").value.trim().toLowerCase(), nodes = [];
  const searchLabel = tokenManifest ? 'Find tokens' : 'Find assets';
  $('#search').placeholder = `${searchLabel}…`;
  $('#search').setAttribute('aria-label', searchLabel);
  $('#modules').setAttribute('aria-label', tokenManifest ? 'Token categories' : 'Design modules');
  $(".gallery").classList.toggle('searching', !tokenManifest && !!query);
  $("#search-clear").hidden = !query; $("#search-key").hidden = !!query;
  if (tokenManifest) {
    const addCategory = (label, glyph, count, category) => {
      const button = makeRow(glyph, label, count, `tree-row ${category ? 'token-category' : 'token-all'}`);
      button.dataset.navkey = `token:${label}`;
      button.setAttribute('aria-current', String(tokenCategory === category));
      button.onclick = () => {
        tokenCategory = category;
        $('.token-scroll').scrollTop = 0;
        renderNav();
      };
      nodes.push(button);
    };
    addCategory('All tokens', 'layout-grid', data.tokenGroups.reduce((total, group) => total + group.rows.length, 0), null);
    const rule = document.createElement('div'); rule.className = 'rule'; nodes.push(rule);
    for (const {label, glyph, rows} of data.tokenGroups) addCategory(label, glyph, rows.length, label);
    renderTokenTable($('#token-catalog'), data, tokenCategory, query, copyError => {
      if (copyError) error(`Cannot copy token name: ${copyError.message}`);
      else if ($('#error').textContent.startsWith('Cannot copy token name:')) error('');
    });
  } else if (query) {
    const results = searchResults(query), heading = document.createElement('h3');
    heading.className='search-count'; heading.textContent=`${results.length} ${results.length === 1 ? 'result' : 'results'}`; nodes.push(heading);
    for (const { a, p } of results) {
      const component = a.component ?? a.path.startsWith('components/');
      const button=makeRow(component?'component':'app-window',p ? `${a.name} · ${p.name}` : a.name,p ? 'form' : a.parts ? `${a.parts.length} ${component?'forms':'frames'}` : undefined,'tree-row search-result');
      button.dataset.navkey=`search:${a.path}:${p?.id ?? ''}`;
      button.setAttribute('aria-current',String(selected===a.path && (!p || selectedForm===p.id)));
      button.onclick=()=>navigate(()=>p ? inspectForm(a,p) : focusAsset(assets.find(item=>item.path===a.path)));
      if (scoped && kind!=='asset' && !p) {
        const row=document.createElement('div');row.className='scope-row';
        row.append(button,scopeAction('asset',a.path,a.name));nodes.push(row);
      } else nodes.push(button);
    }
  } else if (kind === 'asset') {
    const a=manifest?.scope===data.scope ? manifest.assets[0] : null;
    for (const p of a?.parts ?? []) {
      const button=makeRow('app-window',p.name);
      button.dataset.navkey=`form:${p.name}`;
      button.setAttribute('aria-current',String(selectedForm===p.id));
      button.onclick=()=>navigate(()=>inspectForm(a,p));
      nodes.push(button);
    }
  } else if (kind === 'group') {
    for (const a of data.assets) nodes.push(navFile(a,{isolate:true}));
  } else {
    if (!scoped) {
      const all=makeRow('layout-grid','All designs',data.assets.length); all.id='all'; all.onclick=()=>navigate(fit); nodes.push(all);
      const rule=document.createElement('div');rule.className='rule';nodes.push(rule);
    }
    (catalog ? groupAssets(catalog) : groups).forEach((g,i)=>{
      const section=document.createElement('section'), row=document.createElement('div'), toggle=document.createElement('button'), button=document.createElement('button');
      row.className=scoped?'group-row scope-row':'group-row'; toggle.innerHTML=icon(expanded.has(i)?'chevron-down':'chevron-right',12);
      toggle.setAttribute('aria-label',`Toggle ${g.title}`);toggle.setAttribute('aria-expanded',String(expanded.has(i)));toggle.dataset.navkey=`toggle:${g.title}`;
      toggle.onclick=()=>{expanded.has(i)?expanded.delete(i):expanded.add(i);renderNav()};
      button.className='group-name';button.dataset.navkey=`group:${g.title}`;
      const title=document.createElement('span'), count=document.createElement('span'); title.textContent=g.title;count.textContent=g.assets.length;count.className='count';button.append(title,count);
      button.onclick=()=>navigate(()=>{remember();inspection=null;active=i;selected=null;selectedId=null;selectedForm=null;selectedElement=null;expanded.add(i);selection();frame(groups[i])});
      row.append(toggle,button);section.append(row);
      if (scoped) row.append(scopeAction('group',g.title,g.title));
      if(expanded.has(i)) { const files=document.createElement('div');files.className='group-files';
        for(const a of g.assets) files.append(navFile(a,{indent:true,isolate:scoped}));
        section.append(files);
      }
      nodes.push(section);
    });
  }
  $("#modules").replaceChildren(...nodes);
  if(focusKey) $("#modules").querySelector(`[data-navkey="${CSS.escape(focusKey)}"]`)?.focus({preventScroll:true});
  requestDraw();
}
function renderRelationships(source) {
  const basename = path => path.split('/').at(-1).replace(/\.tsx$/, '');
  for (const [id,direction] of [['uses','uses'],['used-by','usedBy']]) {
    const entries=relatedSources(manifest?.relationships ?? {},source,direction), directories=new Map();
    for (const entry of entries) {
      const directory=entry.path.split('/')[0];
      if (!directories.has(directory)) directories.set(directory,[]);
      directories.get(directory).push(entry);
    }
    const nodes=[];
    for (const directory of [...directories.keys()].sort().reverse()) {
      const group=document.createElement('section'),heading=document.createElement('h5');
      heading.className='relationship-directory';heading.textContent=directory;group.append(heading);
      for (const entry of directories.get(directory)) {
        const via=entry.via.map(path=>basename(path)===basename(entry.path)?path.replace(/\.tsx$/,''):basename(path)).join(' → ');
        const button=makeRow(directory==='surfaces'?'app-window':'component',basename(entry.path)+(via?` · via ${via}`:''),undefined,'tree-row relationship-row'+(entry.direct?'':' indirect'));
        button.dataset.relatedPath=entry.path;button.dataset.direct=String(entry.direct);
        button.title=entry.path+(entry.via.length?` via ${entry.via.join(' → ')}`:'');
        button.setAttribute('aria-label',`Open ${entry.path}`+(via?` via ${via}`:''));
        button.onclick=()=>navigate(()=>{
          const item=assets.find(a=>a.path===entry.path);
          if (item) focusAsset(item);
          else changeScope(`asset:${entry.path}`,{target:{path:entry.path}});
        });
        group.append(button);
      }
      nodes.push(group);
    }
    if (!nodes.length) {const empty=document.createElement('p');empty.className='relationship-empty';empty.textContent='None';nodes.push(empty)}
    $('#'+id).replaceChildren(...nodes);
  }
}
function selection() {
  hoveredElement=null;
  if (!selected) inspector = false;
  syncSelectionURL();
  renderNav(); updateChrome();
  $('#back').disabled = !history.length && !onlyFrame;
  const host=currentItem(), part=host?.parts.find(p=>p.id===selectedForm);
  const owner=selectedElement?.owner;
  const a=owner ? manifest?.assets.find(a=>a.path===owner.source) ?? {path:owner.source,parts:[]} : host;
  if(a) {
    $('#source-name').textContent=owner?.export ?? a.name;$('#source-path').textContent=a.path;
    $('#source-path').title=a.path;
    $('#frame-detail').hidden=!part;
    $('#frame-name').textContent=part?.name ?? '';
    const size=selectedElement ?? part;
    $('#frame-size').textContent=size?`${Math.round(size.width)} × ${Math.round(size.height)}`:'';
    $('#forms-heading').textContent=owner?'Frames using this export':a.component?'Forms':'Frames';
    const forms=owner?exportFrames(a,owner):a.parts;
    $('#forms').replaceChildren(...forms.map(p=>{
      const button=makeRow(a.component?'component':'app-window',p.name,`${Math.round(p.width)} × ${Math.round(p.height)}`);
      button.classList.add('frame-row');button.title=p.name;
      button.dataset.frame=p.name;
      button.setAttribute('aria-current',String(!owner && selectedForm===p.id));
      button.onclick=()=>inspectForm(a,p);
      if (p.note) { const row=document.createElement('div');row.append(button);const note=document.createElement('p');note.textContent=p.note;note.className='frame-note';row.append(note);return row; }
      return button;
    }));
    if (!forms.length) {const empty=document.createElement('p');empty.className='relationship-empty';empty.textContent='No matching frames';$('#forms').append(empty)}
    renderRelationships(a.path);
  }
  updateOutlines();requestDraw();save();
}
function selectSource(a) {
  if (!a) return;
  remember();inspection=null;selected=a.path;selectedId=a.id;selectedForm=null;selectedElement=null;active=a.group;expanded.add(active);selection();
}
function selectFrame(a,p,element=null) {
  if (!a || !p) return;
  remember();selected=a.path;selectedId=a.id;selectedForm=p.id;active=a.group;selectedElement=element?{...element,owner:element.owners.at(-1)}:null;
  expanded.add(active);selection();
}
function clearSelection() { selected=null;selectedId=null;selectedForm=null;selectedElement=null;inspection=null;selection(); }
function selectedBox() {
  const a=currentItem(),p=a?.parts.find(p=>p.id===selectedForm);
  if (!p) return null;
  const box=frameBox(a,p);
  return selectedElement?{...selectedElement,x:box.x+selectedElement.x,y:box.y+selectedElement.y}:box;
}
function updateOutlines() {
  const hover=hoveredElement,origin=hover?.part?frameBox(hover.asset,hover.part):null;
  const hoverBox=hover?.element?{...hover.element,x:origin.x+hover.element.x,y:origin.y+hover.element.y}:null;
  for (const [id,box] of [['selection-outline',selectedBox()],['hover-outline',hoverBox]]) {
    const el=$('#'+id);el.hidden=!box || moving;
    if (box) Object.assign(el.style,{left:`${view.x+box.x*view.scale}px`,top:`${view.y+box.y*view.scale}px`,width:`${box.width*view.scale}px`,height:`${box.height*view.scale}px`});
  }
}

function cameraArea() { return fitArea(width, height, false, false); }
function fitWorld(area, data) {
  if (scopeKind(data?.scope) !== 'asset' || !assets.length) return fitView(world,area);
  const x=Math.min(...assets.map(a=>a.x)), y=Math.min(...assets.map(a=>a.y));
  const box={x,y,width:Math.max(...assets.map(a=>a.x+a.width))-x,height:Math.max(...assets.map(a=>a.y+a.height))-y};
  const fit=fitView(box,area,24);
  return fit.scale <= 1 ? fit : {scale:1,x:area.x+(area.width-box.width)/2-x,y:area.y+(area.height-box.height)/2-y};
}
function frame(box, padding = 0) {
  const target=box===world?'all':groups.includes(box)?'group':'selection';
  for(const name of ['all','group','selection']) $("#zoom-fit-"+name).setAttribute('aria-current',String(name===target));
  commit(box===world ? fitWorld(cameraArea(),manifest) : fitView(box, cameraArea(), padding));
}
function fit() {
  remember();
  inspection = null;
  selected = null;
  selectedId = null;selectedForm=null;selectedElement=null;
  active = null;
  selection();
  frame(world);
}
function focusAsset(a) {
  if (!a) return;
  selectSource(a);
  frame(a,24);
}
function inspectForm(a,p) {
  if (!a || !p) return;
  const item=assets.find(item=>item.path===a.path && (a.component || item.shown[0].id===p.id));
  if (!item) return;
  inspection=null;selectFrame(item,p);frame(frameBox(item,p),24);
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
  window.__adg.ready = false;
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
  return `${a.path}|${effectiveTheme}|${a.version}|${p.id}${a.onlyFrame ? `|frame:${a.onlyFrame}` : ''}`;
}
function ensureImage(a, p) {
  const key = assetURL(a, p);
  let e = cache.get(key);
  if (e) {
    e.used = performance.now();e.asset=a;e.part=p;
    return e;
  }
  e = { key, asset: a, part: p, theme:effectiveTheme, used: performance.now(), state: "queued" };
  cache.set(key, e);
  queued.push(e);
  queueMicrotask(pump);
  return e;
}
function pump() {
  // New vector parsing/decoding waits until the gesture settles. Existing exact
  // raster previews continue to move with the camera during interaction.
  if(moving)return;
  queued.sort((a,b)=>Number(visible(b.asset))-Number(visible(a.asset))||
    Math.hypot(view.x+(a.asset.x+a.asset.width/2)*view.scale-width/2,view.y+(a.asset.y+a.asset.height/2)*view.scale-height/2)-
    Math.hypot(view.x+(b.asset.x+b.asset.width/2)*view.scale-width/2,view.y+(b.asset.y+b.asset.height/2)*view.scale-height/2));
  while (loading < 3 && queued.length) {
    const e = queued.shift();
    if (!cache.has(e.key)) continue;
    loading++;e.state='loading';
    void loadPreview(e);
  }
}
async function loadPreview(e) {
  let url,local=false;
  const theme=e.theme??effectiveTheme;
  const generated=async restore=>{
    if(cache.get(e.key)!==e)throw new DOMException('Preview superseded','AbortError');
    const asset=await sourceFor(e.asset,theme);
    if(e.asset.hash&&asset.hash!==e.asset.hash)throw Object.assign(Error('Preview superseded'),{name:'AbortError',waitForRevision:true});
    if(restore)persistSource(asset,theme);
    while(moving)await new Promise(resolve=>setTimeout(resolve,16));
    // Yield the parse/serialization task to pending input before starting it.
    await (globalThis.scheduler?.yield?.()??new Promise(resolve=>setTimeout(resolve,0)));
    local=true;
    return imageURL(asset,e.part,source=>{
      if(!asset.hash || asset.onlyFrame)return;
      const saved=asset.cacheWrite??Promise.resolve(true);
      void saved.then(ok=>{
        if(!ok)return;
        const query=new URLSearchParams({theme,context:metadataContext(),crop:e.part.id});
        return cacheWrite(`preview/${asset.hash}?${query}`,source,true);
      });
    });
  };
  const decode=async source=>{
    if(cache.get(e.key)!==e)return;
    while(moving)await new Promise(resolve=>setTimeout(resolve,16));
    const img=new Image();e.image=img;img.decoding='async';img.src=source;
    await img.decode();e.state='ready';
  };
  try {
    const cached=e.asset.hash&&e.asset.previewIds?.[theme]?.includes(e.part.id);
    if(cached) {
      const address=previewAddress(e.asset,theme,e.part.id);
      url=keyURL(address);
      try {await decode(url)}
      catch(failure) {
        // A disk LRU eviction after the manifest is a cache miss. dataFetch also
        // preserves the normal unauthorized flow if an access key was rotated.
        const response=await dataFetch(address);
        if(response.ok){local=true;url=URL.createObjectURL(await response.blob());await decode(url);}
        else if(response.status===404){url=await generated(true);await decode(url);}
        else throw failure;
      }
    } else {url=await generated(false);await decode(url);}
  } catch(failure) {
    e.state='error';
    if(failure.name==='AbortError'&&!failure.waitForRevision&&cache.get(e.key)===e)cache.delete(e.key);
    if(failure.name!=='AbortError'&&cache.get(e.key)===e&&theme===effectiveTheme&&manifest?.assets.some(a=>a.path===e.asset.path&&a.version===e.asset.version))
      error(`Cannot render ${e.asset.path}: ${failure.message}`);
  } finally {
    if(local&&url)URL.revokeObjectURL(url);
    loading--;requestDraw(false);pump();
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
  if (tokenManifest) {
    window.__adg.ready = true;
    if (fixtureState) document.documentElement.dataset.fixtureReady = fixtureState.name;
    return;
  }
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
    if (!inspection && scopeKind(manifest?.scope)!=='asset') for (const g of groups) {
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
      const chosen = selected === a.path && selectedForm === null;
      ctx.strokeStyle = chosen ? palette.accent : palette.border;
      ctx.lineWidth = (chosen ? 2 : 1) / view.scale; ctx.stroke();
    }
    ctx.restore();
    drawingReady = ready; drawingCount = count;
    drawingView = { ...view }; drawingDirty = false;
  }
  canvas.style.transform = `translate(${view.x - drawingView.x - drawingMargin}px,${view.y - drawingView.y - drawingMargin}px)`;
  updateOutlines();
  drawLabels(displayed);
  const percentage = `${Math.round(view.scale * 100)}%`;
  if (zoomValue.textContent !== percentage) zoomValue.textContent = percentage;
  if (zoomOutput.value !== percentage) zoomOutput.value = percentage;
  window.__adg.ready = !!manifest && !manifest.loading && manifest.renderTheme === effectiveTheme && drawingReady === drawingCount && !moving;
  if(fixtureState && fixtureApplied && window.__adg.ready) document.documentElement.dataset.fixtureReady=fixtureState.name;
  window.__adg.revision = manifest?.revision;
  window.__adg.visibleReady = drawingReady; window.__adg.visibleCount = drawingCount;
  drawMap();
  if(!moving&&queued.length)pump();
  if (cache.size > 100) {
    const activeKeys = new Set(displayed.filter(a => visible(a, drawingMargin))
      .flatMap(a => placements(a).map(({part}) => assetURL(a, part))));
    evictPreviews(cache, activeKeys);
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
  const sourceTitle = (a,...args) => ({...title(...args),selection:{path:a.path}});
  const frameTitle = (a,p,...args) => ({...title(...args),selection:{path:a.path,form:p.id}});
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
  if (!inspection && scopeKind(manifest?.scope)!=='asset') for (const g of groups) {
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
          parts:[sourceTitle(a,inspection ? a.shown[0].name : a.name,meta,550,chosen ? palette.text : palette['text-secondary']), ...(!inspection ? [{ ...part(`${a.parts.length} ${a.parts.length === 1 ? 'form' : 'forms'}`,meta,400,palette['text-tertiary'],6), optional: true },...modified(a)] : [])] });
        if (!inspection && view.scale >= .75 && a.parts.length > 1) {
          const crop = a.shown[0];
          candidates.push(...a.parts.map(form => ({ id:`form:${a.id}:${form.id}`,x:p.x+(form.x-crop.x)*view.scale,y:p.y+(form.y-crop.y)*view.scale-9.5,slot:Infinity,height:13,paddingRight:6,within:{x:p.x,y:p.y,width:a.width*view.scale,height:a.height*view.scale},
            parts:[frameTitle(a,form,form.name,caption,400,palette['text-tertiary'])] })));
        }
      } else {
        if (!flows.has(a.path)) {
          flows.add(a.path);
          const family = displayed.filter(item => item.path === a.path), first = family[0];
          const origin = screen(first), right = Math.max(...family.map(item => item.x+item.width));
          candidates.push({ id:`flow:${a.path}`,...heading(origin.x,origin.y-34,origin.x+(right-first.x)*view.scale),parts:[sourceTitle(a,a.name,meta,600,palette['text-secondary']),{...part(`${a.parts.length} ${a.parts.length === 1 ? 'frame' : 'frames'}`,meta,400,palette['text-tertiary'],6),optional:true},...modified(a)] });
        }
        candidates.push({ id:`frame:${a.id}`,x:p.x,y:p.y-12,slot:(a.width+64)*view.scale,parts:[frameTitle(a,a.shown[0],a.shown[0].name,caption,chosen?550:400,chosen?palette.text:palette['text-tertiary'])] });
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
  window.__adg.ready = false;
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
  if (!old) {
    const rect=viewport.getBoundingClientRect();
    hoveredElement=hitSelection(inspection?[inspection]:assets,(e.clientX-rect.left-view.x)/view.scale,(e.clientY-rect.top-view.y)/view.scale);
    updateOutlines();return;
  }
  hoveredElement=null;updateOutlines();
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
viewport.addEventListener('pointerleave',()=>{hoveredElement=null;updateOutlines()});
function up(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (e.type === "pointerup" && !gesture.moved) {
    const rect = viewport.getBoundingClientRect(),
      x = (e.clientX - rect.left - view.x) / view.scale,
      y = (e.clientY - rect.top - view.y) / view.scale;
    const hit=hitSelection(inspection?[inspection]:assets,x,y);
    if(hit?.part) selectFrame(hit.asset,hit.part,hit.element);
    else if(hit) selectSource(hit.asset);
    else clearSelection();
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
  else if (e.key === "Enter") {
    if (e.target.closest('button,a,[role="button"]')) return;
    const a=currentItem(),p=a?.parts.find(p=>p.id===selectedForm);if(p) inspectForm(a,p);else focusAsset(a);
  }
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
  const p=a?.parts.find(p=>p.id===selectedForm);
  if (p) inspectForm(a,p); else if(a) focusAsset(a);
});
for (const [id, action] of Object.entries({
  "zoom-fit-all": fit,
  "zoom-fit-group": () => frame(active === null ? world : groups[active]),
  "zoom-fit-selection": () =>
    frame(selectedBox() || currentItem() || (active === null ? world : groups[active]), currentItem() ? 24 : 0),
  "zoom-actual": () => zoom(1),
}))
  $("#" + id).onclick = () => {
    $("#zoom-menu").hidePopover();
    action();
  };
$("#back").onclick = back;
$('#sidebar-toggle').onclick = () => toggleSidebar();
$('#inspect').onclick = () => {
  inspector = !inspector;
  updateChrome();
  requestDraw(true, false);
};
$('#copy-path').onclick=()=>navigator.clipboard.writeText($('#source-path').textContent).catch(e=>error(e.message));
$('#copy-frame').onclick=()=>navigator.clipboard.writeText($('#frame-name').textContent).catch(e=>error(e.message));
$("#fullscreen").onclick = () => {
  $("#more-menu").hidePopover();
  const p = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  p.catch((e) => error(e.message));
};
document.addEventListener("fullscreenchange", () => {
  $("#fullscreen").textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
});
$("#fit-current").onclick = () =>
  frame(selectedBox() || currentItem() || (active !== null ? groups[active] : world), currentItem() ? 24 : 0);
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
$("#search").oninput = () => {
  if (tokenManifest) {
    $('.token-scroll').scrollTop = 0;
  } else if ($("#search").value.trim()) {
    searchReturn ??= { view: { ...view }, sidebar, active, selected, selectedId, selectedForm, selectedElement, inspection };
    toggleSidebar(true);
  } else if (searchReturn) {
    toggleSidebar(searchReturn.sidebar);
    searchReturn = null;
  }
  renderNav();
};
$("#search-clear").onclick=()=>{$("#search").value="";$("#search").oninput();$("#search").focus()};
$("#search").onkeydown = (e) => {
  if (e.key === "Enter")
    $("#modules .search-result")?.click();
};
$("#minus").onclick = () => zoom(view.scale / 1.25);
$("#plus").onclick = () => zoom(view.scale * 1.25);
function resizeViewport() {
  window.__adg.ready = false;
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
function relationshipGraph(data, measured) {
  const entries=new Map(Object.entries(data.sourceImports ?? {}));
  for (const asset of measured) entries.set(asset.path,asset.imports ?? []);
  for (const imports of entries.values()) for (const path of imports) if (!entries.has(path)) entries.set(path,[]);
  return sourceRelationships([...entries].map(([path,imports])=>({path,imports})));
}
function applyTokenManifest(data) {
  const previous = tokenManifest ?? catalog ?? manifest;
  const entering = !tokenManifest || tokenManifest.directory !== data.directory;
  tokenManifest = { ...data, tokenGroups: groupTokens(data.tokens ?? []) };
  scopeRequest = data.scope;
  catalog = null;
  if (entering) {
    tokenCategory = null;
    $('.token-scroll').scrollTop = 0;
  }
  if (!tokenManifest.tokenGroups.some(group => group.label === tokenCategory)) tokenCategory = null;
  fixtureState = data.fixture ?? null;
  if (previous?.directory !== data.directory) {
    theme = data.theme;
    sidebar = !!fixtureState?.sidebar;
    applyTheme();
  }
  for (const element of document.querySelectorAll('.directory-name')) element.textContent = data.label;
  $('#app-directory').title = data.directory;
  document.title = `${data.label} — Agent Design Gallery`;
  if (!fixtureState) {
    const url = viewURL(location.href, 'tokens');
    if (url.href !== location.href) window.history.replaceState(window.history.state, '', url);
  }
  updateChrome();
  renderNav();
}
async function applyManifest(data, force = false) {
  if (data.scope === 'tokens') {
    if (force || tokenManifest?.directory !== data.directory || tokenManifest?.revision !== data.revision) applyTokenManifest(data);
    return;
  }
  const leavingTokens = !!tokenManifest;
  const changedRoot = initializedDirectory !== data.directory, changedScope = initializedScope !== data.scope || initializedFrame !== onlyFrame;
  const first = changedRoot || changedScope;
  if (!force && !first && !leavingTokens && manifest.revision === data.revision)
    return;
  if (leavingTokens) {
    initialLink = null;
    $('#search').value = '';
  }
  if (changedRoot) {
    fixtureState=data.fixture ?? null;
    theme = data.theme;
    applyTheme();
    if (!leavingTokens) sidebar = !!fixtureState?.sidebar;
    inspector = !!fixtureState && data.inspector;
    history = [];
  }
  if (first) {
    if (catalog?.directory !== data.directory || catalog?.scope !== data.scope) {
      expanded.clear();
      if (scopedUI(data) && scopeKind(data.scope)==='layer') expanded.add(0);
    }
    catalog = data;
    for(const element of document.querySelectorAll('.directory-name')) element.textContent=data.label;
    $("#app-directory").title=data.directory||'';
    document.title = `${data.label} — Agent Design Gallery`;
    updateChrome();
    renderNav();
  }
  window.__adg.ready = false;
  if (first) {
    cache.clear();
    labelLayer.clear();
    queued = [];
    selected = null;
    selectedId = null;
    selectedForm = null;selectedElement=null;
    inspection = null;
    active = null;
    assets = [];
    groups = [];
  }
  const versionTheme = effectiveTheme;
  const link = initializedDirectory === undefined && !fixtureState ? initialLink : null;
  const entry = !changedRoot && scopeRequest===data.scope ? scopeEntry : null;
  const groupTitle = groups[active]?.title;
  restorePacking(data.packing);
  const previous=manifest, results=new Array(data.assets.length), signal=refreshController?.signal;
  let next=0,publishFrame=0,streamView=null,streamMoved=false,publishedCount=0,nextPublish=1;
  const streaming=first && !leavingTokens;
  const publish=()=>{
    publishFrame=0;
    if(signal?.aborted||versionTheme!==effectiveTheme)return;
    const available=results.filter(Boolean);
    if(!available.length)return;
    publishedCount=available.length;nextPublish=Math.max(publishedCount+1,publishedCount*2);
    if(streamView&&view!==streamView)streamMoved=true;
    manifest={...data,assets:available,renderTheme:versionTheme,loading:true};
    layout(manifest,false);
    if(streaming&&!streamMoved){view=entry?.view??data.view??fitWorld(cameraArea(),data);streamView=view;}
    requestDraw();
  };
  for(let i=0;i<data.assets.length;i++) {
    const a=data.assets[i],key=sourceKey(a,versionTheme,data.directory);
    const metadata=a.metadata?.[versionTheme]??metadataCache.get(key);
    if(metadata){results[i]=decorateMetadata(a,metadata);metadataCache.set(key,metadata);}
  }
  let completed=results.filter(Boolean).length;
  if(streaming&&completed)publish();
  await Promise.all(Array.from({length:4},async()=>{
    while(next<data.assets.length) {
      signal?.throwIfAborted();
      const i=next++,a=data.assets[i];
      if(results[i])continue;
      let entry;
      if(a.hash&&a.metadataRefs?.[versionTheme]) {
        const query=new URLSearchParams({theme:versionTheme,context:metadataContext()});
        const response=await dataFetch(`metadata/${a.hash}?${query}`,{signal});
        if(response.ok){const saved=await response.json();entry=decorateMetadata({...a,previewIds:{...a.previewIds,[versionTheme]:saved.previewIds}},saved.metadata);}
      }
      if(!entry) {
        entry=await prepare(a,versionTheme,{signal});
        if (a.onlyFrame && !entry.parts.some(part => part.name === a.onlyFrame)) throw Error(`Frame ${a.onlyFrame} does not exist in ${a.path}.`);
        Object.assign(a,{hash:entry.hash,version:entry.version});
        persistSource(entry,versionTheme);
        keepSource(sourceKey(entry,versionTheme,data.directory),entry);
      }
      const metadata=measuredMetadata(entry);
      metadataCache.set(sourceKey(entry,versionTheme,data.directory),metadata);
      results[i]=decorateMetadata(a,metadata);completed++;
      if(streaming&&completed>=nextPublish&&!publishFrame)publishFrame=requestAnimationFrame(publish);
    }
  }));
  if(publishFrame)cancelAnimationFrame(publishFrame);
  if(versionTheme!==effectiveTheme){pending=true;return;}
  signal?.throwIfAborted();
  for(const [key,entry] of prepared)if(!data.assets.some(a=>key===sourceKey(a,versionTheme,data.directory)||key===sourceKey(a,versionTheme==='dark'?'light':'dark',data.directory)))prepared.delete(key);
  const live=new Set(data.assets.flatMap(a=>['light','dark'].map(t=>sourceKey(a,t,data.directory))));
  for(const key of metadataCache.keys())if(!live.has(key))metadataCache.delete(key);
  manifest = { ...data, assets: results, relationships:relationshipGraph(data,results), renderTheme: versionTheme };
  tokenManifest = null;
  // Early streamed worlds can use a much larger camera scale. Discard those
  // raster intermediates so the completed world starts at its exact final scale.
  if(streaming&&publishedCount<data.assets.length)for(const entry of cache.values()){delete entry.bitmap;delete entry.bitmapScale;}
  catalog = null;
  layout(
    manifest,
    !first && !!previous &&
      JSON.stringify(previous.groups) === JSON.stringify(data.groups),
  );
  for(const element of document.querySelectorAll('.directory-name')) element.textContent=data.label;
  $("#app-directory").title=data.directory||'';
  document.title = `${data.label} — Agent Design Gallery`;
  if (first) {
    const target = entry ? entry.target : link ?? data.selection;
    if (!fixtureState) restoreSelection(target);
    const saved = data.selection;
    const sameSelection = link && saved && (link.path
      ? link.path === saved.path && link.form === saved.form && link.element?.id === saved.element?.id
      : !saved.path && link.group === saved.group);
    const reload = performance.getEntriesByType('navigation')[0]?.type === 'reload';
    if (entry?.view) view=entry.view;
    else if (entry?.target || (link && (onlyFrame || !(reload && sameSelection && data.view)))) {
      const target = selectedBox() || currentItem() || groups[active] || world;
      frame(target, selected ? 24 : 0);
    } else if (data.view) view = data.view;
    else if (!streamMoved) frame(world);
  } else if (groupTitle) {
    const index = groups.findIndex(group=>group.title===groupTitle);
    active = index < 0 ? null : index;
  }
  if (selected && !assets.some((a) => a.path === selected)) {
    selected = null;
    selectedId = null;
    selectedForm = null;selectedElement=null;
    inspection = null;
  } else if (selected) {
    const a=currentItem(),p=a?.parts.find(p=>p.id===selectedForm);
    if (!a) {selectedId=assets.find(a=>a.path===selected)?.id;selectedForm=null;selectedElement=null}
    else if (selectedForm!==null && !p) {selectedForm=null;selectedElement=null}
    else if (selectedElement) {
      const next=p?.elements?.find(e=>e.id===selectedElement.id);
      selectedElement=next?.owners.some(o=>o.source===selectedElement.owner.source && o.export===selectedElement.owner.export)?{...next,owner:selectedElement.owner}:null;
    }
  }
  if (inspection) {
    const a=assets.find(a=>a.path===selected),p={...a.full,id:'full',name:'Full sheet'};
    inspection={...a,id:a.id+'@full',x:0,y:0,width:p.width,height:p.height,shown:[p],kind:'sheet'};
  }
  initializedDirectory=data.directory;
  initializedScope=scopeRequest=data.scope;
  initializedFrame=onlyFrame;
  initialLink=null;
  scopeEntry=null;
  if(data.features?.persistedMetadata && !onlyFrame)cacheWrite(`catalog?context=${encodeURIComponent(metadataContext())}`,{packing:packingSnapshot()});
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
for(const [id,trigger] of [['zoom-menu','zoom-options'],['more-menu','more']]) {
  $("#"+id).addEventListener('toggle',event=>{
    $("#"+trigger).setAttribute(id === "more-menu" ? "aria-expanded" : "aria-pressed", String(event.newState === "open"));
    if(event.newState==='open') {
      for(const other of document.querySelectorAll(':popover-open')) if(other.id!==id) other.hidePopover();
      hideTooltip();positionZoomMenu();
    }
    requestDraw();
  });
}
let tooltipTimer;
function hideTooltip() { clearTimeout(tooltipTimer);if (!$("#tooltip").hidden) { $("#tooltip").hidden=true;requestDraw(); } }
function bindTooltip(button, trailing = false) {
  const show=()=>{clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>{
    if(!button.isConnected||document.querySelector(':popover-open, dialog[open]'))return;
    const tip=$("#tooltip"),r=button.getBoundingClientRect();tip.textContent=button.dataset.tooltip;tip.hidden=false;
    const beside=trailing && r.right+16+tip.offsetWidth<=width-4;
    const x=beside?r.right+16:r.x+r.width/2-tip.offsetWidth/2;
    const y=beside?r.y+(r.height-tip.offsetHeight)/2:r.y>height/2?r.top-tip.offsetHeight-12:r.bottom+12;
    tip.style.left=`${Math.max(4,Math.min(width-tip.offsetWidth-4,x))}px`;
    tip.style.top=`${y}px`;requestDraw();
  },400)};
  button.addEventListener('pointerenter',show);button.addEventListener('focus',show);
  button.addEventListener('pointerleave',()=>{hideTooltip();requestDraw()});button.addEventListener('blur',hideTooltip);button.addEventListener('click',hideTooltip);
}
for(const button of document.querySelectorAll('[data-tooltip]')) bindTooltip(button);
$("#keys-close").onclick=()=>$("#keys").close();
for(const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('toggle', () => requestDraw());
  dialog.addEventListener('close',()=>{viewport.focus({preventScroll:true});requestDraw()});
}
document.addEventListener('keydown',event=>{
  if(event.key==='?'&&!event.target.matches('input,textarea')&&!document.querySelector('dialog[open]')) {event.preventDefault();hideTooltip();$("#keys").showModal()}
});
async function applyFixture() {
  const state=fixtureState;if(!state)return;
  if (tokenManifest) return;
  fixtureApplied=false;delete document.documentElement.dataset.fixtureReady;
  sidebar=state.sidebar;inspector=!!state.inspector;history=[];inspection=null;selected=null;selectedId=null;selectedForm=null;selectedElement=null;expanded.clear();
  active=state.group ? groups.findIndex(g=>g.title===state.group) : null;
  if(active===-1) throw new Error(`Fixture group not found: ${state.group}`);
  if(active!==null) expanded.add(active);
  if(state.asset) {
    const source=manifest.assets.find(a=>a.path===state.asset),form=state.form?source?.parts.find(p=>p.name===state.form):null;
    const item=assets.find(a=>a.path===state.asset && (!form || a.component || a.shown[0].id===form.id));
    if(!item)throw new Error(`Fixture asset/form not found: ${state.asset} ${state.form??''}`);
    selected=item.path;selectedId=item.id;selectedForm=form?.id ?? (state.sourceOnly ? null : item.parts[0]?.id);
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
  if(state.dialog) $("#"+state.dialog).showModal();
  fixtureApplied=true;requestDraw();
}
let fetching = false,
  pending = false, refreshController=null;
async function refresh(force = false) {
  if (fetching) {
    pending = true;refreshController?.abort();
    return;
  }
  fetching = true;refreshController=new AbortController();
  try {
    if (routeError) throw routeError;
    const query=new URLSearchParams({context:metadataContext(),theme:effectiveTheme,scope:scopeRequest});
    if (strictRoute) query.set('strict', '1');
    if (onlyFrame) query.set('frame', onlyFrame);
    if(!manifest){query.set('initial','1');query.set('metadata','1');}
    else if(manifest.renderTheme!==effectiveTheme || scopeRequest!==initializedScope)query.set('metadata','1');
    const signal=refreshController.signal, data=await api(`manifest?${query}`,null,false,signal);
    signal.throwIfAborted();
    data.scope ??= 'all';
    if (strictRoute && initialLink?.path && !data.assets.some(asset => asset.path === initialLink.path))
      throw Error(`Design link target ${initialLink.path} is outside this scope.`);
    if (onlyFrame) data.assets = data.assets.map(asset => ({ ...asset, onlyFrame, metadata: null, metadataRefs: null, previewIds: null }));
    await applyManifest(data, force);
    error("");
  } catch (e) {
    if(e.name!=='AbortError')error(e.message);
    else if(!refreshController.signal.aborted)pending=true;
  } finally {
    fetching = false;
    if (pending) {
      pending = false;
      await refresh(true);
    }
  }
}
await refresh();
if(fixtureState) { try { await applyFixture(); } catch(e) { error(e.message); } }
if ((tokenManifest || manifest) && !isUnauthorized()) {
  const events = new EventSource(keyURL('events'));
  window.addEventListener('adg-unauthorized', () => events.close(), { once: true });
  events.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.error) error(data.error);
    else void refresh();
  };
  events.onerror = async () => {
    try {
      const response = await dataFetch('manifest');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      error('Local server disconnected. Reconnecting…');
    } catch (e) { error(e.message); }
  };
}

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    $("#search").focus();
    return;
  }
  if (e.key !== "Escape" || $("#keys").open) return;
  if (document.querySelector(":popover-open")) return;
  if (tokenManifest) {
    if ($('#search').value) $('#search-clear').click();
    return;
  }
  if (searchReturn) {
    const old = searchReturn;
    searchReturn = null;
    $("#search").value = "";
    toggleSidebar(old.sidebar);
    ({ active, selected, selectedId, selectedForm, selectedElement = null, inspection } = old);
    selection();
    commit(old.view);
  } else clearSelection();
  viewport.focus({ preventScroll: true });
});

initSwitcher();

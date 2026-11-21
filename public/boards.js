import { icon } from './icons.js';

// Vector-sharp board typography shares the camera transform with preview pixels.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13l-2 2 2 2m6-4 2 2-2 2"/></svg>';
const copyTimers = new WeakMap();

function markCopied(node, duration = 1200) {
  node.dataset.copied = 'true';
  clearTimeout(copyTimers.get(node));
  copyTimers.set(node, setTimeout(() => { delete node.dataset.copied; }, duration));
}

export function createBoardLayer(viewport, onSource, { onSelectFrame, onFocusFrame, onCopyError, onPlay } = {}) {
  const root = document.createElement('div');
  root.id = 'board-chrome';
  viewport.append(root);
  root.addEventListener('pointerdown', event => {
    if (event.target.closest('button, [data-frame-name], [data-adg-token] code')) event.stopPropagation();
  });
  root.addEventListener('dblclick', event => {
    if (event.target.closest('[data-adg-token] code')) {
      event.stopPropagation();
      return;
    }
    const caption = event.target.closest('[data-frame-name]');
    if (caption) {
      event.stopPropagation();
      onFocusFrame?.(caption.dataset.frameSource, caption.dataset.frameName);
    }
  });
  root.addEventListener('click', event => {
    const play = event.target.closest('.caption-play');
    if(play) {
      event.stopPropagation();
      const {frameName,frameSource} = play.parentNode.dataset;
      onPlay(frameSource,frameName,play);
      return;
    }
    const button = event.target.closest('[data-source]');
    if (button) {
      event.stopPropagation();
      onSource(button.dataset.source, button.dataset.title ?? button.textContent, button);
      return;
    }
    const caption = event.target.closest('[data-frame-name]');
    if (caption) {
      event.stopPropagation();
      onSelectFrame?.(caption.dataset.frameSource, caption.dataset.frameName);
      return;
    }
    const tokenCode = event.target.closest('[data-adg-token] code');
    if (tokenCode) {
      event.stopPropagation();
      const text = tokenCode.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        markCopied(tokenCode);
        onCopyError?.(null);
      }, failure => onCopyError?.(failure));
    }
  });
  let tokenNode;
  let measurement;
  const themeStyle = document.createElement('style');
  root.before(themeStyle);
  return {
    update(groups, items, data) {
      cancelAnimationFrame(measurement);
      themeStyle.textContent = data.boardCss ?? "";
      root.replaceChildren(...groups.map((group, index) => {
        const node = document.createElement('article');
        node.className = 'chapter-board';
        node.style.cssText = `left:${group.x}px;top:${group.y}px;width:${group.width}px;height:${group.height}px`;
        const sources = group.assets ?? [];
        node.innerHTML = `<header><div><p class="board-eyebrow"><b>${String(group.chapter ?? index + 1).padStart(2,'0')}</b>${escape(data.label)} · ${escape(group.layer)}</p><h1>${escape(group.title)}</h1></div><p>${sources.length} sources · ${sources.reduce((n,a)=>n+a.parts.length,0)} frames</p></header>`;
        for (const block of group.blocks ?? []) {
          const asset = sources.find(a => a.path === block.asset);
          if (!asset) continue;
          const row = document.createElement('section');
          row.className = 'board-source';
          row.style.cssText = `left:80px;top:${block.y}px;width:${group.width-160}px`;
          const title = asset.path.endsWith('/index.tsx') ? asset.path.split('/').at(-2) : block.title;
          row.innerHTML = `<button type="button" data-source="${escape(asset.path)}" data-title="${escape(title)}">${escape(title)}<span class="board-copy-icon" data-icon="copy" data-size="14">${icon('copy', 14)}</span></button><p class="board-path">${sourceIcon}<span>${escape(asset.projectSource ?? asset.path)}</span></p><p class="board-modified">${escape(asset.modified?.text)}</p>`;
          node.append(row);
        }
        for (const section of group.blocks ?? []) for (const specimen of section.frames) {
          const caption = document.createElement('div');
          caption.className = 'board-caption';
          caption.dataset.frameName = specimen.name;
          caption.dataset.frameSource = section.asset;
          caption.style.cssText = `left:${section.x+specimen.caption.x}px;top:${section.y+specimen.caption.y}px;width:${specimen.caption.w}px`;
          caption.innerHTML = `<span>${escape(specimen.name)}</span><small>${escape(specimen.note)}${specimen.proposal ? ` · Proposed: ${escape(specimen.proposal)}` : ''}</small>`;
          node.append(caption);
        }
        return node;
      }));
    },
    emphasize(playableFrames, matches) {
      for (const caption of root.querySelectorAll('.board-caption')) {
        const {frameSource,frameName} = caption.dataset;
        const playable = playableFrames.get(frameSource)?.has(frameName);
        caption.classList.toggle('dimmed', !!matches && !matches.get(frameSource)?.has(frameName));
        let button = caption.querySelector('.caption-play');
        if (!playable) {button?.remove(); continue;}
        if (button) continue;
        button = document.createElement('button');
        button.className = 'caption-play';
        button.setAttribute('aria-label','Play from '+frameName);
        button.innerHTML = icon('play',14)+' Play';
        caption.append(button);
      }
    },
    tokens(board, onMeasure) {
      cancelAnimationFrame(measurement);
      tokenNode?.remove();
      tokenNode = null;
      if (!board) return;
      tokenNode = document.createElement('div');
      tokenNode.className = 'token-board-drawing';
      tokenNode.innerHTML = `<style>${board.css}</style>${board.body}`;
      root.prepend(tokenNode);
      const node = tokenNode;
      measurement = requestAnimationFrame(() => {
        if (node.isConnected) onMeasure(node.offsetHeight);
      });
    },
    tokenSection(slug) {
      if (!tokenNode?.isConnected) return null;
      const section = tokenNode.querySelector(`[data-adg-section$="#${CSS.escape(slug)}"]`);
      if (!section) return null;
      const base = tokenNode.getBoundingClientRect(), box = section.getBoundingClientRect();
      const scale = Number(root.dataset.scale) || 1;
      return {
        x: 0,
        y: (box.top - base.top) / scale,
        width: base.width / scale || tokenNode.offsetWidth,
        height: box.height / scale || section.offsetHeight,
      };
    },
    palette() {
      const css = getComputedStyle(root);
      return Object.fromEntries(['surface','canvas','border','radius-card'].map(name => [name,css.getPropertyValue('--'+name).trim()]));
    },
    camera(view, hidden) {root.hidden = hidden;
      if(root.dataset.scale!==String(view.scale)){
        root.dataset.scale=view.scale;
        root.style.setProperty('--caption-scale',String(1/view.scale));
      }root.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;},
  };
}

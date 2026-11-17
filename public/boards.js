// Vector-sharp board typography shares the camera transform with preview pixels.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createBoardLayer(viewport, onSource) {
  const root = document.createElement('div');
  root.id = 'board-chrome';
  viewport.append(root);
  root.addEventListener('pointerdown', event => {if(event.target.closest('button')) event.stopPropagation();});
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-source]');
    if (button) { event.stopPropagation(); onSource(button.dataset.source, button.textContent); }
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
          row.innerHTML = `<button data-source="${escape(asset.path)}">${escape(title)}</button><p class="board-path">▧ ${escape(asset.projectSource ?? asset.path)}</p><p class="board-modified">${escape(asset.modified?.text)}</p>`;
          node.append(row);
        }
        for (const section of group.blocks ?? []) for (const specimen of section.frames) {
          const caption = document.createElement('div');
          caption.className = 'board-caption';
          caption.style.cssText = `left:${section.x+specimen.caption.x}px;top:${section.y+specimen.caption.y}px;width:${specimen.caption.w}px`;
          caption.innerHTML = `<span>${escape(specimen.name)}</span><small>${escape(specimen.note)}${specimen.proposal ? ` · Proposed: ${escape(specimen.proposal)}` : ''}</small>`;
          node.append(caption);
        }
        return node;
      }));
    },
    tokens(board, onMeasure) {
      cancelAnimationFrame(measurement);
      tokenNode?.remove();
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
    palette() {
      const css = getComputedStyle(root);
      return Object.fromEntries(['surface','canvas','border','radius-card'].map(name => [name,css.getPropertyValue('--'+name).trim()]));
    },
    camera(view, hidden) {root.hidden = hidden;root.dataset.scale=view.scale;root.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;},
  };
}

export function createContextMenu(menu, { viewport, onOverlayChange }) {
  let restoreTarget = null;
  let suppressAutoRestore = false;

  const enabledItems = () => [...menu.querySelectorAll('button[role="menuitem"]:not(:disabled)')];

  menu.addEventListener('toggle', event => {
    if (event.newState === 'open') {
      for (const other of document.querySelectorAll(':popover-open')) {
        if (other !== menu) other.hidePopover();
      }
    } else if (!suppressAutoRestore && restoreTarget?.isConnected) {
      if (!document.activeElement || document.activeElement === document.body || menu.contains(document.activeElement)) {
        restoreTarget.focus({ preventScroll: true });
      }
      restoreTarget = null;
    }
    onOverlayChange?.();
  });

  menu.addEventListener('keydown', event => {
    const items = enabledItems();
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[(index + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items[0].focus();
    } else if (event.key === 'End' && items.length) {
      event.preventDefault();
      event.stopPropagation();
      items.at(-1).focus();
    } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
      event.preventDefault();
      event.stopPropagation();
      items[index].click();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });

  function close(restore = true) {
    const target = restoreTarget;
    suppressAutoRestore = true;
    if (menu.matches(':popover-open')) menu.hidePopover();
    suppressAutoRestore = false;
    restoreTarget = null;
    if (restore && target?.isConnected) target.focus({ preventScroll: true });
    onOverlayChange?.();
  }

  function open(items, { x, y, returnFocus } = {}) {
    restoreTarget = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : viewport);
    const nodes = items.map(entry => {
      if (entry.separator) {
        const rule = document.createElement('div');
        rule.className = 'rule';
        rule.setAttribute('role', 'separator');
        return rule;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = entry.label;
      button.disabled = !!entry.disabled;
      button.onclick = () => {
        const target = restoreTarget;
        close(false);
        if (target?.isConnected) target.focus({ preventScroll: true });
        entry.action?.();
      };
      return button;
    });
    menu.replaceChildren(...nodes);
    menu.style.left = '0px';
    menu.style.top = '0px';
    if (!menu.matches(':popover-open')) menu.showPopover();
    const mw = menu.offsetWidth || 220, mh = menu.offsetHeight || 160;
    const left = Math.max(8, Math.min(window.innerWidth - mw - 8, Math.round(x)));
    const top = Math.max(8, Math.min(window.innerHeight - mh - 8, Math.round(y)));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    enabledItems()[0]?.focus({ preventScroll: true });
    onOverlayChange?.();
  }

  return { open, close, isOpen: () => menu.matches(':popover-open') };
}

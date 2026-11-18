import { dataFetch, isUnauthorized } from './auth.js';
import { icon } from './icons.js';

export function instanceCloseButton(instance, className, closed, report) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = `Close instance: ${instance.name ?? instance.id} (:${instance.port})`;
  button.setAttribute('aria-label', button.title);
  button.innerHTML = icon('x');
  button.onclick = async event => {
    event.stopPropagation();
    button.disabled = true;
    button.dataset.loading = 'true';
    button.innerHTML = icon('loader-circle');
    try {
      const response = await dataFetch(`/api/instances/${encodeURIComponent(instance.id)}/stop`, { method: 'POST' });
      if (!response.ok && response.status !== 404) {
        const data = await response.json();
        throw new Error(data.error || `Cannot close instance: HTTP ${response.status}`);
      }
      closed();
    } catch (error) {
      if (!isUnauthorized()) report(error);
    } finally {
      delete button.dataset.loading;
      if (button.isConnected) {
        button.innerHTML = icon('x');
        button.disabled = false;
      }
    }
  };
  return button;
}

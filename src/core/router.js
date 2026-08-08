export function currentRoute() {
  return location.hash.replace(/^#\/?/, '').split('?')[0] || 'overview';
}

export function navigate(route) {
  const next = `#/${route}`;
  if (location.hash === next) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = next;
}

export function onRouteChange(listener) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

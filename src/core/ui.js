import { escapeHtml, number } from './format.js';

const paths = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  performance: '<path d="M4 19V9m6 10V5m6 14v-7m5 7H2"/>',
  planning: '<path d="M5 3v4M19 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>',
  capital: '<path d="M3 10 12 4l9 6-9 6-9-6Z"/><path d="m3 14 9 6 9-6"/>',
  income: '<path d="M4 18V6m0 12h16M7 14l4-4 3 2 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 15.2A8 8 0 0 1 8.8 3.5 9 9 0 1 0 20.5 15.2Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  refresh: '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18 9a7 7 0 0 0-12-2M6 15a7 7 0 0 0 12 2"/>',
  bulb: '<path d="M9 18h6m-5 3h4M8.2 14.5A7 7 0 1 1 15.8 14.5c-.8.7-.8 1.5-.8 2.5H9c0-1 0-1.8-.8-2.5Z"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M15 11h5v4h-5a2 2 0 1 1 0-4Z"/>',
  trend: '<path d="m4 16 5-5 4 3 7-8"/><path d="M15 6h5v5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.overview}</svg>`;
}

export function pageHeader(eyebrow, title, subtitle, action = '') {
  return `<header class="page-head"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${action}</header>`;
}

export function kpi(label, value, meta = '', trend = []) {
  return `<article class="kpi"><div class="kpi-copy"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></div>${trend.length ? sparkline(trend) : ''}</article>`;
}

export function sparkline(values) {
  const data = values.map(number).filter(Number.isFinite);
  if (data.length < 2) return '';
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const points = data.map((value, index) => `${(index / (data.length - 1)) * 120},${38 - ((value - min) / range) * 30}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 120 44" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"/></svg>`;
}

export function progress(value, label = '') {
  const safe = Math.max(0, Math.min(100, number(value)));
  return `<div class="progress-wrap">${label ? `<div class="progress-label"><span>${escapeHtml(label)}</span><b>${Math.round(safe)}%</b></div>` : ''}<div class="progress"><i style="width:${safe}%"></i></div></div>`;
}

export function emptyState(title, text, action = '') {
  return `<div class="empty"><span class="empty-mark">—</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>${action}</div>`;
}

import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { icon } from './core/ui.js';
import { keys } from './core/storage.js';
import { renderOverview, mountOverview } from './pages/overview.js';
import { renderPerformance, mountPerformance } from './pages/performance.js';
import { renderPlanning, mountPlanning } from './pages/planning.js';
import { renderCapital, mountCapital } from './pages/capital.js';
import { renderIncome, mountIncome } from './pages/income.js';
import { renderSettings, mountSettings } from './pages/settings.js';

const root = document.querySelector('#app');
const routes = {
  overview: { label: 'Главная', icon: 'overview', render: renderOverview, mount: mountOverview },
  performance: { label: 'Эффективность', icon: 'performance', render: renderPerformance, mount: mountPerformance },
  planning: { label: 'Планирование', icon: 'planning', render: renderPlanning, mount: mountPlanning },
  capital: { label: 'Фонды', icon: 'capital', render: renderCapital, mount: mountCapital },
  income: { label: 'Доходы', icon: 'income', render: renderIncome, mount: mountIncome },
  settings: { label: 'Настройки', icon: 'settings', render: renderSettings, mount: mountSettings }
};

function applyAppearance() {
  const theme = localStorage.getItem(keys.theme) || 'dark';
  const density = localStorage.getItem(keys.density) || 'comfortable';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.density = density;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0e' : '#f7f7f7');
}

function navigation(active) {
  return Object.entries(routes).map(([key, route]) => `
    <button class="nav-item ${active === key ? 'active' : ''}" data-route="${key}" aria-current="${active === key ? 'page' : 'false'}">
      ${icon(route.icon)}<span>${route.label}</span>
    </button>`).join('');
}

function shell(routeKey, content) {
  const current = routes[routeKey] || routes.overview;
  return `<div class="app-shell">
    <aside class="sidebar">
      <button class="brand" data-route="overview" aria-label="PIURA ERP"><span class="brand-mark">P</span><span><b>PIURA</b><small>ERP</small></span></button>
      <nav class="main-nav">${navigation(routeKey)}</nav>
      <div class="sidebar-foot"><div class="profile"><span>NP</span><div><b>Николай</b><small>Владелец</small></div></div></div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <button class="mobile-brand" data-route="overview"><span class="brand-mark">P</span><b>PIURA ERP</b></button>
        <div class="breadcrumbs"><span>PIURA ERP</span><i>/</i><b>${current.label}</b></div>
        <div class="top-actions"><button class="icon-button" id="themeToggle" aria-label="Переключить тему">${icon((localStorage.getItem(keys.theme) || 'dark') === 'dark' ? 'sun' : 'moon')}</button></div>
      </header>
      <main class="content" id="pageContent">${content}</main>
      <nav class="mobile-nav">${navigation(routeKey)}</nav>
    </section>
  </div>`;
}

function renderApp() {
  const routeKey = routes[currentRoute()] ? currentRoute() : 'overview';
  const route = routes[routeKey];
  root.innerHTML = shell(routeKey, route.render());
  root.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.route)));
  root.querySelector('#themeToggle')?.addEventListener('click', () => {
    const next = (localStorage.getItem(keys.theme) || 'dark') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(keys.theme, next);
    applyAppearance();
    renderApp();
  });
  route.mount?.(root.querySelector('#pageContent'), renderApp, navigate, applyAppearance);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

applyAppearance();
onRouteChange(renderApp);
renderApp();

window.PIURA = Object.freeze({ navigate, refresh: renderApp, version: '2.0.0' });

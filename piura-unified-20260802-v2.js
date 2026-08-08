(function () {
  'use strict';

  const CSS_FILE = 'piura-unified-20260802-v2.css?v=20260802b';
  const HIDE_TEXT = [
    'Показывается окно до 12 четвергов',
    'Нажмите точку, чтобы открыть неделю',
    'Динамика по четвергам',
    'Живой инвестиционный капитал тематических фондов',
    'Пожертвования людей · подписки и донаты из живой таблицы',
    'Пожертвования людей, подписки и донаты',
    'Статистика по дорожной карте за текущий год',
    '0 → 10, без оценки',
    '0 → 10, без оценки.'
  ];
  const HIDE_CONTAINS = [
    'показывается окно до',
    'нажмите точку, чтобы открыть неделю',
    'динамика по четвергам',
    'активных задач',
    'скрытых',
    'максимум 4635',
    'google sheets',
    'сохранено:',
    'обновлено:',
    'auto-sync',
    'investment dashboard',
    'живой инвестиционный капитал',
    'статистика по дорожной карте',
    '0 → 10, без оценки'
  ];

  function ownText(el) {
    return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.nodeValue || '').join(' ').trim();
  }
  function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function themeFromRoot() {
    const root = document.documentElement;
    const body = document.body;
    const explicit = root.dataset.theme || body.dataset.theme || root.getAttribute('data-color-mode') || body.getAttribute('data-color-mode') || '';
    if (/light|свет/i.test(explicit)) return 'piura-light';
    if (/dark|тем/i.test(explicit)) return 'piura-dark';
    const stored = Object.keys(localStorage).map(k => `${k}:${localStorage.getItem(k)}`).join('|');
    if (/light|свет/i.test(stored) && !/dark[^|]*true/i.test(stored)) return 'piura-light';
    return matchMedia('(prefers-color-scheme: light)').matches ? 'piura-light' : 'piura-dark';
  }
  function baseUrl() {
    try { return new URL('.', window.top.location.href).href; } catch (_) { return new URL('.', location.href).href; }
  }
  function ensureCss(doc) {
    if (!doc || !doc.head || doc.getElementById('piura-unified-css-v2')) return;
    const link = doc.createElement('link');
    link.id = 'piura-unified-css-v2';
    link.rel = 'stylesheet';
    link.href = new URL(CSS_FILE, baseUrl()).href;
    doc.head.appendChild(link);
  }
  function detectModule(doc) {
    const path = norm(doc.location && doc.location.pathname);
    const title = norm(doc.title);
    const sample = norm((doc.body && doc.body.innerText || '').slice(0, 1200));
    if (/dynamics-2|ps.?№?1|пс.?№?1/.test(path + title + sample)) return 'ps';
    if (/morning|утро/.test(path + title)) return 'morning';
    if (/time-tracker|уч[её]т времени/.test(path + title)) return 'time';
    if (/my-dynamics|мои динамики/.test(path + title)) return 'dynamics';
    if (/adminscale|админ/.test(path + title)) return 'admin';
    if (/fonds|foundation|структура фонд/.test(path + title)) return 'foundation';
    if (/pff|msk|safe/.test(path)) return 'portfolio';
    if (/finance|доход/.test(path + title)) return 'income';
    if (/effectiv/.test(path + title)) return 'effectiveness';
    return 'generic';
  }
  function classifyByText(doc, needle, className, selector = 'body *') {
    const target = norm(needle);
    doc.querySelectorAll(selector).forEach(el => {
      const text = norm(ownText(el) || el.textContent);
      if (text === target) el.classList.add(className);
    });
  }
  function markDarkIslands(doc) {
    doc.querySelectorAll('.piura-legacy-dark').forEach(el => el.classList.remove('piura-legacy-dark'));
    if (!doc.body.classList.contains('piura-light')) return;
    if (doc.body.classList.contains('erp-embedded') || doc.body.classList.contains('piura-root')) return;
    doc.querySelectorAll('div,section,article,header,footer,button').forEach(el => {
      const style = getComputedStyle(el);
      const rgb = (style.backgroundColor.match(/\d+/g) || []).slice(0,3).map(Number);
      if (rgb.length === 3 && rgb.every(v => v < 32) && el.getBoundingClientRect().width > 80 && el.getBoundingClientRect().height > 28) {
        el.classList.add('piura-legacy-dark');
      }
    });
  }
  function compactSync(doc) {
    doc.querySelectorAll('body *').forEach(el => {
      if (el.children.length > 3) return;
      const t = norm(el.textContent);
      if ((t.includes('google sheets') || t.includes('синхронизац')) && t.length < 120) {
        el.title = el.textContent.trim();
        el.setAttribute('aria-label', 'Синхронизация данных активна');
        el.classList.add('piura-sync-dot');
      }
    });
  }
  function hideNoise(doc) {
    doc.querySelectorAll('body *').forEach(el => {
      if (el.children.length > 2) return;
      const text = norm(el.textContent);
      if (!text) return;
      if (HIDE_TEXT.some(x => text === norm(x)) || HIDE_CONTAINS.some(x => text.includes(x))) {
        if (text.includes('google sheets') || text.includes('синхронизац')) return;
        el.classList.add('piura-redundant');
      }
      if (text === 'за все недели') el.classList.add('piura-redundant');
      if (/^\d{1,2}\.\d{2}\.\d{4}$/.test(text) && doc.body.classList.contains('piura-module-ps')) {
        const card = el.closest('.card,.metric-card,.stat-card,[class*="metric"],[class*="stat"]');
        if (card) el.classList.add('piura-redundant');
      }
    });
  }
  function semanticClasses(doc, module) {
    const q = (sel) => Array.from(doc.querySelectorAll(sel));
    if (module === 'ps') {
      q('[class*="metric"],[class*="stat"]').forEach(x => x.classList.add('piura-metric-card'));
      q('[class*="value"]').forEach(x => x.classList.add('piura-metric-value'));
      q('[class*="delta"],[class*="change"]').forEach(x => x.classList.add('piura-delta'));
      q('[class*="calendar"],[class*="datepicker"]').forEach(x => x.classList.add('piura-calendar'));
      q('[class*="rebalance"]').forEach(x => x.classList.add('piura-rebalance-modal'));
      classifyByText(doc, 'Закрыть', 'piura-rebalance-close-text');
    }
    if (module === 'time' || module === 'income') q('line,.grid-line,[class*="grid-line"]').forEach(x => x.classList.add('piura-chart-grid'));
    if (module === 'admin') {
      q('[class*="toolbar"]').forEach(x => x.classList.add('piura-edit-toolbar'));
      q('[class*="color"],.color-picker,.highlight-colors').forEach(x => x.classList.add('piura-edit-colors'));
    }
    if (module === 'foundation') {
      q('[class*="kpi"],[class*="metrics"]').forEach(x => { if (x.children.length === 4) x.classList.add('piura-four-kpis'); });
      q('[class*="fund-grid"],[class*="structure-grid"]').forEach(x => x.classList.add('piura-foundation-grid'));
    }
    if (module === 'portfolio') {
      q('[class*="asset-row"],[class*="accordion"]').forEach(x => x.classList.add('piura-asset-row'));
    }
  }
  function prepareSettings(doc) {
    doc.querySelectorAll('[role="dialog"],dialog,[class*="settings-modal"],[class*="control-center"]').forEach(el => {
      const t = norm(el.textContent);
      if (t.includes('настрой') && (t.includes('тем') || t.includes('размер') || t.includes('копи'))) {
        el.classList.add('piura-settings-modal');
        el.dataset.piuraSettingsModal = 'true';
      }
    });
    doc.querySelectorAll('button,a,[role="tab"],[role="button"]').forEach(el => {
      const t = norm(el.textContent);
      if (['все настройки','единая система','дизайн','сервисы'].includes(t) || t.includes('вернуть стандартный дизайн')) {
        el.classList.add('piura-obsolete-setting');
      }
      if (t.includes('общие настройки')) el.dataset.piuraCommonSettings = 'true';
    });
    doc.querySelectorAll('[data-piura-common-settings="true"]').forEach(el => {
      const panel = el.closest('[role="dialog"],dialog,[class*="settings"]');
      if (panel && !panel.dataset.piuraOpenedCommon) {
        panel.dataset.piuraOpenedCommon = 'true';
        try { el.click(); } catch (_) {}
      }
    });
    doc.querySelectorAll('input[type="text"]').forEach(el => {
      if (el.closest('[role="dialog"],dialog,[class*="settings"]')) el.closest('div')?.classList.add('piura-service-visibility');
    });
  }
  function applyDoc(doc, isRoot) {
    if (!doc || !doc.body) return;
    ensureCss(doc);
    const theme = themeFromRoot();
    doc.body.classList.add('piura-unified', theme);
    doc.body.classList.remove(theme === 'piura-light' ? 'piura-dark' : 'piura-light');
    if (isRoot) doc.body.classList.add('piura-root');
    const module = isRoot ? 'root' : detectModule(doc);
    Array.from(doc.body.classList).filter(name => name.startsWith('piura-module-')).forEach(name => doc.body.classList.remove(name));
    doc.body.classList.add(`piura-module-${module}`);
    compactSync(doc);
    hideNoise(doc);
    semanticClasses(doc, module);
    if (isRoot) prepareSettings(doc);
    markDarkIslands(doc);
  }
  function scanFrames() {
    applyDoc(document, true);
    document.querySelectorAll('iframe').forEach(frame => {
      try {
        if (frame.contentDocument && frame.contentDocument.body) applyDoc(frame.contentDocument, false);
        if (!frame.dataset.piuraListener) {
          frame.dataset.piuraListener = 'true';
          frame.addEventListener('load', () => { try { applyDoc(frame.contentDocument, false); } catch (_) {} });
        }
      } catch (_) {}
    });
  }
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scanFrames(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanFrames, { once: true });
  else scanFrames();
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','data-theme','data-color-mode'] });
  setInterval(scanFrames, 2500);
})();
